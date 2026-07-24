import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import type {
  StandardAgentDescriptorInterface,
  StandardAgentDomainDetailViewDeclaration,
} from '../../kernel/standard-agent-interface.ts';
import { readStandardAgentDescriptorForDomain } from '../connect/public/standard-agent-interface.ts';
import { buildWorkItemProjectionV2 } from './work-item-projection/projection.ts';
import type { WorkItemProjectionV2 } from './work-item-projection/types.ts';

const MAX_DETAIL_VIEW_BYTES = 8_388_608;
type DescriptorResolver = (agentId: string) => StandardAgentDescriptorInterface | null;
type DomainDetailViewDependencies = {
  projection?: WorkItemProjectionV2;
  resolveDescriptor?: DescriptorResolver;
};

type SnapshotMetadata = {
  revision: number;
};

type ReadAvailability = 'available' | 'missing' | 'stale' | 'invalid' | 'read_error';
type AvailableReadResult = {
  availability: 'available';
  reason: string;
  payload: Record<string, unknown>;
  metadata: SnapshotMetadata;
  digest: string;
};
type UnavailableReadResult = {
  availability: Exclude<ReadAvailability, 'available'>;
  reason: string;
  payload: null;
  metadata: SnapshotMetadata | null;
  digest: string | null;
};
type ReadResult = AvailableReadResult | UnavailableReadResult;

function fail(code: 'cli_usage_error' | 'contract_shape_invalid', message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError(code, message, details);
}

function optionValues(args: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      fail('cli_usage_error', 'App detail view read received an invalid or incomplete option.', { flag: flag ?? null });
    }
    const key = flag.slice(2);
    if (values.has(key)) fail('cli_usage_error', 'App detail view read received a duplicate option.', { flag });
    values.set(key, value);
  }
  return values;
}

export function parseAppViewReadArgs(args: string[]) {
  const allowed = new Set(['item-id', 'view-id', 'if-revision', 'if-generation']);
  const values = optionValues(args);
  const unsupported = [...values.keys()].filter((key) => !allowed.has(key));
  const missing = ['item-id', 'view-id'].filter((key) => !values.get(key)?.trim());
  if (unsupported.length > 0 || missing.length > 0) {
    fail('cli_usage_error', 'App detail view read options are invalid.', {
      allowed: [...allowed],
      unsupported,
      missing,
    });
  }
  if (values.has('if-revision') && values.has('if-generation')) {
    fail('cli_usage_error', '--if-revision and --if-generation cannot be used together.', {
      options: ['if-revision', 'if-generation'],
    });
  }
  const rawRevision = values.get('if-revision') ?? values.get('if-generation');
  const ifRevision = rawRevision === undefined ? null : Number(rawRevision);
  if (rawRevision !== undefined && (!Number.isSafeInteger(ifRevision) || Number(ifRevision) < 0)) {
    fail('cli_usage_error', 'The conditional revision must be a non-negative safe integer.', { value: rawRevision });
  }
  return {
    itemId: values.get('item-id')!,
    viewId: values.get('view-id')!,
    ifRevision,
  };
}

function contained(root: string, candidate: string) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function fileErrorAvailability(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' as const : 'read_error' as const;
}

function unavailable(
  availability: Exclude<ReadAvailability, 'available'>,
  reason: string,
): UnavailableReadResult {
  return { availability, reason, payload: null, metadata: null, digest: null };
}

function staleResult(result: AvailableReadResult, reason: string): UnavailableReadResult {
  return {
    availability: 'stale',
    reason,
    payload: null,
    metadata: result.metadata,
    digest: result.digest,
  };
}

function resolveWorkItemRoot(workspacePath: string, workItemRoot: string) {
  const lexicalWorkspace = path.resolve(workspacePath);
  const lexicalRoot = path.resolve(workItemRoot);
  if (!contained(lexicalWorkspace, lexicalRoot)) {
    return { status: 'invalid' as const, reason: 'domain_detail_work_item_root_escape', root: null };
  }
  let workspace: string;
  try {
    workspace = fs.realpathSync.native(lexicalWorkspace);
    if (!fs.statSync(workspace).isDirectory()) {
      return { status: 'invalid' as const, reason: 'domain_detail_workspace_root_invalid', root: null };
    }
  } catch (error) {
    const status = fileErrorAvailability(error);
    return {
      status,
      reason: status === 'missing'
        ? 'domain_detail_workspace_root_missing'
        : 'domain_detail_workspace_root_read_failed',
      root: null,
    };
  }
  let cursor = lexicalWorkspace;
  for (const segment of path.relative(lexicalWorkspace, lexicalRoot).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    try {
      if (fs.lstatSync(cursor).isSymbolicLink()) {
        return { status: 'invalid' as const, reason: 'domain_detail_work_item_symlink_forbidden', root: null };
      }
    } catch (error) {
      const status = fileErrorAvailability(error);
      return {
        status,
        reason: status === 'missing'
          ? 'domain_detail_work_item_root_missing'
          : 'domain_detail_work_item_root_read_failed',
        root: null,
      };
    }
  }
  try {
    const root = fs.realpathSync.native(lexicalRoot);
    if (!contained(workspace, root) || !fs.statSync(root).isDirectory()) {
      return { status: 'invalid' as const, reason: 'domain_detail_work_item_root_invalid', root: null };
    }
    return { status: 'available' as const, reason: 'domain_detail_work_item_root_resolved', root };
  } catch (error) {
    const status = fileErrorAvailability(error);
    return {
      status,
      reason: status === 'missing'
        ? 'domain_detail_work_item_root_missing'
        : 'domain_detail_work_item_root_read_failed',
      root: null,
    };
  }
}

function declaredFile(workspacePath: string, workItemRoot: string, relativePath: string) {
  if (path.isAbsolute(relativePath)
    || relativePath.includes('\0')
    || relativePath.split(/[\\/]+/).includes('..')) {
    return { status: 'invalid' as const, reason: 'domain_detail_declared_path_invalid', file: null, root: null };
  }
  const resolvedRoot = resolveWorkItemRoot(workspacePath, workItemRoot);
  if (resolvedRoot.status !== 'available' || !resolvedRoot.root) {
    return { ...resolvedRoot, file: null };
  }
  const root = resolvedRoot.root;
  const file = path.resolve(root, relativePath);
  if (!contained(root, file)) {
    return { status: 'invalid' as const, reason: 'domain_detail_declared_path_escape', file: null, root };
  }
  let cursor = root;
  for (const segment of path.relative(root, file).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(cursor);
    } catch (error) {
      const status = fileErrorAvailability(error);
      if (status === 'missing') {
        return { status: 'missing' as const, reason: 'domain_detail_source_missing', file, root };
      }
      return { status, reason: 'domain_detail_source_read_failed', file, root };
    }
    if (stat.isSymbolicLink()) {
      return { status: 'invalid' as const, reason: 'domain_detail_symlink_forbidden', file, root };
    }
  }
  return { status: 'available' as const, reason: 'domain_detail_source_resolved', file, root };
}

function sameFile(left: fs.BigIntStats, right: fs.BigIntStats) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readExactBytes(handle: number, size: number) {
  const bytes = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const read = fs.readSync(handle, bytes, offset, size - offset, offset);
    if (read === 0) break;
    offset += read;
  }
  return offset === size ? bytes : bytes.subarray(0, offset);
}

function readBoundedJson(
  workspacePath: string,
  workItemRoot: string,
  declaration: StandardAgentDomainDetailViewDeclaration,
): ReadResult {
  const resolved = declaredFile(workspacePath, workItemRoot, declaration.relative_path);
  if (resolved.status !== 'available') return unavailable(resolved.status, resolved.reason);
  if (!resolved.file) return unavailable('invalid', 'domain_detail_source_path_invalid');
  let handle: number | null = null;
  try {
    handle = fs.openSync(resolved.file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const before = fs.fstatSync(handle, { bigint: true });
    if (!before.isFile()) return unavailable('invalid', 'domain_detail_source_not_regular_file');
    if (before.size > BigInt(MAX_DETAIL_VIEW_BYTES)) return unavailable('invalid', 'domain_detail_source_oversize');
    const bytes = readExactBytes(handle, Number(before.size));
    const after = fs.fstatSync(handle, { bigint: true });
    if (bytes.length !== Number(before.size) || !sameFile(before, after)) {
      return unavailable('stale', 'domain_detail_source_changed_during_read');
    }
    let payload: unknown;
    try {
      payload = parseJsonText(bytes.toString('utf8'));
    } catch {
      return unavailable('invalid', 'domain_detail_source_json_invalid');
    }
    return validateSnapshot(payload, declaration, `sha256:${createHash('sha256').update(bytes).digest('hex')}`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return unavailable(code === 'ENOENT' ? 'missing' : code === 'ELOOP' ? 'invalid' : 'read_error', code === 'ELOOP'
      ? 'domain_detail_symlink_forbidden'
      : 'domain_detail_source_read_failed');
  } finally {
    if (handle !== null) fs.closeSync(handle);
  }
}

function nonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function pointerValue(value: unknown, pointer: string) {
  let current = value;
  for (const segment of pointer.replace(/^\//, '').split('/').filter(Boolean)) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    if (!(key in current)) return undefined;
    current = current[key as keyof typeof current];
  }
  return current;
}

function taskRefFromTemplate(template: string, taskId: string) {
  return template.replaceAll('{task_id}', taskId);
}

function validateSnapshot(
  value: unknown,
  declaration: StandardAgentDomainDetailViewDeclaration,
  digest: string,
): ReadResult {
  if (!isRecord(value)) return unavailable('invalid', 'domain_detail_source_root_invalid');
  const revision = nonNegativeInteger(pointerValue(value, declaration.revision_pointer));
  if (revision === null) {
    return unavailable('invalid', 'domain_detail_source_revision_invalid');
  }
  return {
    availability: 'available',
    reason: 'domain_detail_source_available',
    payload: value,
    metadata: { revision },
    digest,
  };
}

export function resolveCanonicalDomainDetailViewTarget(
  input: { itemId: string; viewId: string },
  dependencies: DomainDetailViewDependencies = {},
) {
  const projection = dependencies.projection ?? buildWorkItemProjectionV2({ profile: 'full' });
  const matches = projection.items.filter((item) => item.item_id === input.itemId);
  if (matches.length !== 1) {
    fail('contract_shape_invalid', 'App detail view requires one canonical work item.', {
      failure_code: matches.length === 0 ? 'domain_detail_item_not_found' : 'domain_detail_item_ambiguous',
      item_id: input.itemId,
      match_count: matches.length,
    });
  }
  const item = matches[0]!;
  const descriptor = (dependencies.resolveDescriptor ?? readStandardAgentDescriptorForDomain)(item.identity.agent_id);
  const declaration = descriptor?.interface.domain_detail_views.find((entry) => entry.view_id === input.viewId);
  if (!declaration) {
    fail('contract_shape_invalid', 'Requested App detail view is not declared by the selected Agent.', {
      failure_code: 'domain_detail_view_not_declared',
      item_id: input.itemId,
      view_id: input.viewId,
    });
  }
  return { item, declaration };
}

function condition(availability: ReadAvailability, reason: string) {
  return {
    type: 'DomainDetailViewAvailable',
    status: availability === 'available' ? 'True' : availability === 'missing' ? 'Unknown' : 'False',
    reason,
    message: reason,
  };
}

export function buildDomainDetailViewReadback(
  input: {
    itemId: string;
    viewId: string;
    ifRevision?: number | null;
    ifGeneration?: number | null;
  },
  dependencies: DomainDetailViewDependencies = {},
) {
  const { item, declaration } = resolveCanonicalDomainDetailViewTarget(input, dependencies);
  const result = item.identity.work_item_root
    ? readBoundedJson(item.identity.workspace_path, item.identity.work_item_root, declaration)
    : unavailable('missing', 'domain_detail_work_item_root_missing');
  const ownerBinding = declaration.owner_task_binding;
  if (result.availability === 'available' && ownerBinding) {
    const taskId = pointerValue(result.payload, ownerBinding.task_id_pointer);
    const taskRef = pointerValue(result.payload, ownerBinding.task_ref_pointer);
    if (taskId !== item.identity.work_item_id
      || taskRef !== taskRefFromTemplate(ownerBinding.task_ref_template, item.identity.work_item_id)) {
      return envelope(input, declaration, staleResult(result, 'domain_detail_item_identity_mismatch'));
    }
  }
  const conditionalRevision = input.ifRevision ?? input.ifGeneration ?? null;
  if (result.availability === 'available'
    && conditionalRevision !== null
    && conditionalRevision > result.metadata.revision) {
    return envelope(input, declaration, staleResult(result, 'domain_detail_revision_regressed'));
  }
  return envelope(input, declaration, result);
}

function envelope(
  input: { itemId: string; ifRevision?: number | null; ifGeneration?: number | null },
  declaration: StandardAgentDomainDetailViewDeclaration,
  result: ReadResult,
) {
  const revision = result.metadata?.revision ?? 0;
  const conditionalRevision = input.ifRevision ?? input.ifGeneration ?? null;
  const notModified = result.availability === 'available'
    && conditionalRevision !== null
    && conditionalRevision === revision;
  return {
    schema_version: 'opl_domain_detail_view.v1',
    surface_kind: 'opl_domain_detail_view',
    item_id: input.itemId,
    view_id: declaration.view_id,
    view_kind: declaration.view_kind,
    availability: result.availability,
    revision,
    generation: revision,
    ...(result.digest ? { digest: result.digest } : {}),
    not_modified: notModified,
    ...(declaration.schema_ref ? { payload_schema_ref: declaration.schema_ref } : {}),
    ...(declaration.schema_version ? { payload_schema: declaration.schema_version } : {}),
    payload: notModified ? null : result.payload,
    conditions: [condition(result.availability, result.reason)],
  };
}
