import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';

export type HostedReadbackAuthorityScope = 'domain_owner' | 'derived_non_authority';

export type HostedReadbackSourceDeclaration = {
  source_id: string;
  role: string;
  claim_scope: string;
  authority_scope: HostedReadbackAuthorityScope;
  relative_path: string;
  required: boolean;
  summary_fields: Record<string, string | string[]>;
  currentness_anchor_relative_path: string | null;
};

export type HostedReadbackConsistencyCheck = {
  check_id: string;
  left: { source_id: string; field: string };
  right: { source_id: string; field: string };
};

export type HostedReadbackSourceManifest = {
  surface_kind: 'opl_hosted_work_item_readback_sources';
  schema_version: 1;
  domain_id: string;
  declaration_owner: string;
  sources: HostedReadbackSourceDeclaration[];
  consistency_checks: HostedReadbackConsistencyCheck[];
  authority_boundary: {
    opl_consumption: 'read_only_exact_value_projection';
    app_state_is_domain_quality_authority: false;
    filesystem_mtime_is_semantic_currentness: false;
  };
};

export type HostedReadbackObservedSource = {
  source_id: string;
  role: string;
  claim_scope: string;
  authority_scope: HostedReadbackAuthorityScope;
  ref: string;
  status: 'observed' | 'missing' | 'invalid';
  required: boolean;
  sha256: string | null;
  modified_at: string | null;
  summary: Record<string, unknown>;
  currentness: {
    state: 'not_evaluated' | 'not_older_than_anchor' | 'older_than_anchor' | 'anchor_missing';
    anchor_ref: string | null;
    anchor_modified_at: string | null;
    semantic_currentness_proven: false;
  };
  error: string | null;
};

function invalid(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, {
    ...details,
    failure_code: 'hosted_work_item_readback_source_contract_invalid',
  });
}

function exactKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length > 0) invalid(`${label} contains unsupported fields.`, { unsupported_fields: extras });
}

function text(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} must be a non-empty string.`);
  return value.trim();
}

function relativePath(value: unknown, label: string) {
  const normalized = text(value, label);
  if (path.isAbsolute(normalized) || normalized.split(/[\\/]+/u).includes('..')) {
    invalid(`${label} must stay relative to the work-item root.`, { value: normalized });
  }
  return normalized;
}

function summaryFieldPointer(value: unknown, label: string): string | string[] {
  const pointers = Array.isArray(value) ? value : [value];
  if (pointers.length === 0) invalid(`${label} must declare at least one JSON Pointer.`);
  const normalized = pointers.map((pointer, index) => {
    const pointerLabel = Array.isArray(value) ? `${label}[${index}]` : label;
    const result = text(pointer, pointerLabel);
    if (!result.startsWith('/')) {
      invalid('Summary field JSON Pointers must start with /.', { field: label, pointer });
    }
    return result;
  });
  if (new Set(normalized).size !== normalized.length) {
    invalid(`${label} JSON Pointer fallbacks must be unique.`);
  }
  return Array.isArray(value) ? normalized : normalized[0]!;
}

function sourceDeclaration(value: unknown, index: number): HostedReadbackSourceDeclaration {
  if (!isRecord(value)) invalid('Hosted readback source declarations must be objects.', { index });
  exactKeys(value, [
    'source_id',
    'role',
    'claim_scope',
    'authority_scope',
    'relative_path',
    'required',
    'summary_fields',
    'currentness_anchor_relative_path',
  ], `sources[${index}]`);
  const authorityScope = text(value.authority_scope, `sources[${index}].authority_scope`);
  if (authorityScope !== 'domain_owner' && authorityScope !== 'derived_non_authority') {
    invalid(`sources[${index}].authority_scope is unsupported.`, { authority_scope: authorityScope });
  }
  if (typeof value.required !== 'boolean') invalid(`sources[${index}].required must be boolean.`);
  if (!isRecord(value.summary_fields)) invalid(`sources[${index}].summary_fields must be an object.`);
  const summaryFields = Object.fromEntries(Object.entries(value.summary_fields).map(([field, pointer]) => [
    field,
    summaryFieldPointer(pointer, `sources[${index}].summary_fields.${field}`),
  ]));
  const anchor = value.currentness_anchor_relative_path === null
    ? null
    : relativePath(value.currentness_anchor_relative_path, `sources[${index}].currentness_anchor_relative_path`);
  return {
    source_id: text(value.source_id, `sources[${index}].source_id`),
    role: text(value.role, `sources[${index}].role`),
    claim_scope: text(value.claim_scope, `sources[${index}].claim_scope`),
    authority_scope: authorityScope,
    relative_path: relativePath(value.relative_path, `sources[${index}].relative_path`),
    required: value.required,
    summary_fields: summaryFields,
    currentness_anchor_relative_path: anchor,
  };
}

function checkEndpoint(value: unknown, label: string) {
  if (!isRecord(value)) invalid(`${label} must be an object.`);
  exactKeys(value, ['source_id', 'field'], label);
  return { source_id: text(value.source_id, `${label}.source_id`), field: text(value.field, `${label}.field`) };
}

function consistencyCheck(value: unknown, index: number): HostedReadbackConsistencyCheck {
  if (!isRecord(value)) invalid('Hosted readback consistency checks must be objects.', { index });
  exactKeys(value, ['check_id', 'left', 'right'], `consistency_checks[${index}]`);
  return {
    check_id: text(value.check_id, `consistency_checks[${index}].check_id`),
    left: checkEndpoint(value.left, `consistency_checks[${index}].left`),
    right: checkEndpoint(value.right, `consistency_checks[${index}].right`),
  };
}

function containedFile(root: string, relative: string, label: string) {
  const resolvedRoot = fs.realpathSync.native(root);
  const lexicalCandidate = path.resolve(resolvedRoot, relative);
  if (lexicalCandidate !== resolvedRoot && !lexicalCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    invalid(`${label} escapes the work-item root.`, { root: resolvedRoot, relative_path: relative });
  }

  let existingAncestor = lexicalCandidate;
  while (!fs.existsSync(existingAncestor) && existingAncestor !== resolvedRoot) {
    existingAncestor = path.dirname(existingAncestor);
  }
  const resolvedAncestor = fs.realpathSync.native(existingAncestor);
  const candidate = path.resolve(
    resolvedAncestor,
    path.relative(existingAncestor, lexicalCandidate),
  );
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    invalid(`${label} resolves outside the work-item root.`, { root: resolvedRoot, relative_path: relative });
  }
  return fs.existsSync(candidate) ? fs.realpathSync.native(candidate) : candidate;
}

function jsonPointer(value: unknown, pointer: string) {
  let current = value;
  for (const rawSegment of pointer.replace(/^\//u, '').split('/').filter(Boolean)) {
    const segment = rawSegment.replace(/~1/gu, '/').replace(/~0/gu, '~');
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) return undefined;
      current = current[index];
    } else if (isRecord(current) && segment in current) {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function firstPresentJsonPointer(value: unknown, pointers: string | string[]) {
  for (const pointer of Array.isArray(pointers) ? pointers : [pointers]) {
    const resolved = jsonPointer(value, pointer);
    if (resolved !== undefined) return resolved;
  }
  return null;
}

export function readHostedReadbackSourceManifest(input: {
  workspaceRoot: string;
  manifestPath: string;
}): { manifest: HostedReadbackSourceManifest; manifest_ref: string } {
  const workspaceRoot = fs.realpathSync.native(input.workspaceRoot);
  if (!path.isAbsolute(input.manifestPath)) {
    invalid('Hosted readback source manifest path must be absolute.', {
      manifest_path: input.manifestPath,
    });
  }
  let manifestPath: string;
  try {
    manifestPath = fs.realpathSync.native(input.manifestPath);
  } catch (error) {
    invalid('Hosted readback source manifest cannot be resolved.', {
      manifest_path: input.manifestPath,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (manifestPath !== workspaceRoot && !manifestPath.startsWith(`${workspaceRoot}${path.sep}`)) {
    invalid('Hosted readback source manifest must stay inside the selected workspace.', {
      workspace_root: workspaceRoot,
      manifest_path: manifestPath,
    });
  }
  const parsed = parseJsonText(fs.readFileSync(manifestPath, 'utf8'));
  if (!isRecord(parsed)) invalid('Hosted readback source manifest must contain an object.');
  exactKeys(parsed, [
    'surface_kind',
    'schema_version',
    'domain_id',
    'declaration_owner',
    'sources',
    'consistency_checks',
    'authority_boundary',
  ], 'hosted readback source manifest');
  if (parsed.surface_kind !== 'opl_hosted_work_item_readback_sources' || parsed.schema_version !== 1) {
    invalid('Hosted readback source manifest identity is unsupported.');
  }
  if (!Array.isArray(parsed.sources) || !Array.isArray(parsed.consistency_checks)) {
    invalid('Hosted readback source manifest requires sources and consistency_checks arrays.');
  }
  if (!isRecord(parsed.authority_boundary)) {
    invalid('Hosted readback source manifest requires authority_boundary.');
  }
  exactKeys(parsed.authority_boundary, [
    'opl_consumption',
    'app_state_is_domain_quality_authority',
    'filesystem_mtime_is_semantic_currentness',
  ], 'authority_boundary');
  if (
    parsed.authority_boundary.opl_consumption !== 'read_only_exact_value_projection'
    || parsed.authority_boundary.app_state_is_domain_quality_authority !== false
    || parsed.authority_boundary.filesystem_mtime_is_semantic_currentness !== false
  ) {
    invalid('Hosted readback source manifest authority boundary is unsupported.');
  }
  const sources = parsed.sources.map(sourceDeclaration);
  const sourceIds = new Set(sources.map((source) => source.source_id));
  if (sourceIds.size !== sources.length) invalid('Hosted readback source ids must be unique.');
  const checks = parsed.consistency_checks.map(consistencyCheck);
  for (const check of checks) {
    if (!sourceIds.has(check.left.source_id) || !sourceIds.has(check.right.source_id)) {
      invalid('Hosted readback consistency checks must reference declared sources.', { check_id: check.check_id });
    }
  }
  return {
    manifest: {
      surface_kind: 'opl_hosted_work_item_readback_sources',
      schema_version: 1,
      domain_id: text(parsed.domain_id, 'domain_id'),
      declaration_owner: text(parsed.declaration_owner, 'declaration_owner'),
      sources,
      consistency_checks: checks,
      authority_boundary: {
        opl_consumption: 'read_only_exact_value_projection',
        app_state_is_domain_quality_authority: false,
        filesystem_mtime_is_semantic_currentness: false,
      },
    },
    manifest_ref: manifestPath,
  };
}

export function observeHostedReadbackSource(input: {
  workItemRoot: string;
  declaration: HostedReadbackSourceDeclaration;
}): HostedReadbackObservedSource {
  const sourcePath = containedFile(input.workItemRoot, input.declaration.relative_path, 'Hosted readback source');
  const anchorPath = input.declaration.currentness_anchor_relative_path
    ? containedFile(input.workItemRoot, input.declaration.currentness_anchor_relative_path, 'Hosted readback currentness anchor')
    : null;
  const base = {
    source_id: input.declaration.source_id,
    role: input.declaration.role,
    claim_scope: input.declaration.claim_scope,
    authority_scope: input.declaration.authority_scope,
    ref: sourcePath,
    required: input.declaration.required,
  };
  if (!fs.existsSync(sourcePath)) {
    return {
      ...base,
      status: 'missing',
      sha256: null,
      modified_at: null,
      summary: {},
      currentness: {
        state: anchorPath && !fs.existsSync(anchorPath) ? 'anchor_missing' : 'not_evaluated',
        anchor_ref: anchorPath,
        anchor_modified_at: null,
        semantic_currentness_proven: false,
      },
      error: 'source_file_missing',
    };
  }
  try {
    const bytes = fs.readFileSync(sourcePath);
    const parsed = parseJsonText(bytes.toString('utf8'));
    const sourceStat = fs.statSync(sourcePath);
    const anchorStat = anchorPath && fs.existsSync(anchorPath) ? fs.statSync(anchorPath) : null;
    const currentnessState = !anchorPath
      ? 'not_evaluated'
      : !anchorStat
        ? 'anchor_missing'
        : sourceStat.mtimeMs < anchorStat.mtimeMs
          ? 'older_than_anchor'
          : 'not_older_than_anchor';
    return {
      ...base,
      status: 'observed',
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      modified_at: sourceStat.mtime.toISOString(),
      summary: Object.fromEntries(Object.entries(input.declaration.summary_fields).map(([field, pointer]) => [
        field,
        firstPresentJsonPointer(parsed, pointer),
      ])),
      currentness: {
        state: currentnessState,
        anchor_ref: anchorPath,
        anchor_modified_at: anchorStat?.mtime.toISOString() ?? null,
        semantic_currentness_proven: false,
      },
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      status: 'invalid',
      sha256: null,
      modified_at: fs.statSync(sourcePath).mtime.toISOString(),
      summary: {},
      currentness: {
        state: 'not_evaluated',
        anchor_ref: anchorPath,
        anchor_modified_at: anchorPath && fs.existsSync(anchorPath)
          ? fs.statSync(anchorPath).mtime.toISOString()
          : null,
        semantic_currentness_proven: false,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
