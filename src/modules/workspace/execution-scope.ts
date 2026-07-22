import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { normalizeStandardDomainAgentId } from '../../kernel/standard-agent-registry.ts';
import {
  captureWorkItemRootIdentity,
  requireWorkItemRootIdentity,
  type WorkItemRootIdentity,
} from './work-item-file-boundary.ts';

export const LEGACY_EXECUTION_SCOPE_SNAPSHOT_VERSION = 'opl-execution-scope-snapshot.v1' as const;
export const EXECUTION_SCOPE_SNAPSHOT_VERSION = 'opl-execution-scope-snapshot.v2' as const;

export const WORK_ITEM_IDENTITY_ALIAS_FIELDS = [
  'work_item_id',
  'study_id',
  'quest_id',
  'work_unit_id',
] as const;

export type ExecutionScopeKind = 'work_item' | 'domain' | 'system' | 'identity_unresolved';

export type WorkItemExecutionScopeRequirement = {
  kind: 'work_item';
  alias_fields: readonly string[];
};

export type NonWorkItemExecutionScopeRequirement = {
  kind: 'none';
};

export type ExecutionScopeRequirement =
  | WorkItemExecutionScopeRequirement
  | NonWorkItemExecutionScopeRequirement;

export type ResolvedWorkItemIdentity = {
  domain_work_item_id: string;
  source_alias_fields: string[];
  alias_values: Record<string, string>;
};

export type WorkItemExecutionScopeSnapshot = {
  surface_kind: 'opl_execution_scope_snapshot';
  version: typeof EXECUTION_SCOPE_SNAPSHOT_VERSION;
  scope_kind: 'work_item';
  project_scope_id: string;
  work_item_scope_id: string;
  domain_id: string;
  domain_work_item_id: string;
  workspace_binding_id: string;
  binding_version_id: string;
  workspace_root: string;
  canonical_work_item_root: string | null;
  canonical_work_item_root_identity: WorkItemRootIdentity | null;
  inventory_digest: string | null;
  source_alias_fields: string[];
  scope_digest: string;
};

export type LegacyWorkItemExecutionScopeSnapshot = Omit<
  WorkItemExecutionScopeSnapshot,
  'version' | 'canonical_work_item_root_identity'
> & {
  version: typeof LEGACY_EXECUTION_SCOPE_SNAPSHOT_VERSION;
};

type WorkItemExecutionScopeInput = {
  projectScopeId: string;
  workspaceBindingId: string;
  bindingVersionId?: string;
  domainId: string;
  workspaceRoot: string;
  payload: Record<string, unknown>;
  requirement: WorkItemExecutionScopeRequirement;
  canonicalWorkItemRoot?: string | null;
  inventoryDigest?: string | null;
  expectedDomainWorkItemId?: string | null;
};

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function canonicalRequiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`Execution scope field ${field} must be a non-empty string.`, { field, value });
  }
  const normalized = value.trim();
  if (normalized.length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    fail(`Execution scope field ${field} contains an invalid identifier.`, { field, value });
  }
  return normalized;
}

function canonicalOptionalString(value: string | null | undefined, field: string) {
  return value === null || value === undefined ? null : canonicalRequiredString(value, field);
}

function canonicalDomainId(value: unknown) {
  return normalizeStandardDomainAgentId(canonicalRequiredString(value, 'domain_id'));
}

function sha256(value: string) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function readAliasPath(payload: Record<string, unknown>, aliasField: string) {
  const segments = aliasField.split('.');
  if (
    segments.length === 0
    || segments.some((segment) => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(segment))
  ) {
    fail('Execution scope alias fields must be dot-separated JSON object keys.', {
      alias_field: aliasField,
    });
  }
  let current: unknown = payload;
  for (const segment of segments) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function canonicalAliasFields(aliasFields: readonly string[]) {
  const normalized = aliasFields.map((field, index) =>
    canonicalRequiredString(field, `alias_fields[${index}]`)
  );
  if (normalized.length === 0) {
    fail('Work-item execution scope requires at least one domain alias field.');
  }
  if (new Set(normalized).size !== normalized.length) {
    fail('Work-item execution scope alias fields must not contain duplicates.', {
      alias_fields: normalized,
    });
  }
  return normalized;
}

export function resolveWorkItemIdentity(input: {
  payload: Record<string, unknown>;
  aliasFields: readonly string[];
  expectedDomainWorkItemId?: string | null;
}): ResolvedWorkItemIdentity {
  const aliasFields = canonicalAliasFields(input.aliasFields);
  const aliasValues: Record<string, string> = {};
  for (const aliasField of aliasFields) {
    const raw = readAliasPath(input.payload, aliasField);
    if (raw === undefined || raw === null) continue;
    aliasValues[aliasField] = canonicalRequiredString(raw, aliasField);
  }
  const distinctValues = [...new Set(Object.values(aliasValues))];
  if (distinctValues.length === 0) {
    fail('Work-item execution scope could not resolve a domain work-item identity.', {
      failure_code: 'work_item_identity_missing',
      alias_fields: aliasFields,
    });
  }
  if (distinctValues.length > 1) {
    fail('Work-item execution scope aliases resolve to conflicting identities.', {
      failure_code: 'work_item_identity_conflict',
      alias_values: aliasValues,
    });
  }
  const domainWorkItemId = distinctValues[0]!;
  const expectedDomainWorkItemId = canonicalOptionalString(
    input.expectedDomainWorkItemId,
    'expected_domain_work_item_id',
  );
  if (expectedDomainWorkItemId && expectedDomainWorkItemId !== domainWorkItemId) {
    fail('Work-item execution scope conflicts with the host-resolved work item.', {
      failure_code: 'work_item_host_binding_conflict',
      expected_domain_work_item_id: expectedDomainWorkItemId,
      resolved_domain_work_item_id: domainWorkItemId,
      alias_values: aliasValues,
    });
  }
  return {
    domain_work_item_id: domainWorkItemId,
    source_alias_fields: Object.keys(aliasValues).sort(),
    alias_values: Object.fromEntries(Object.entries(aliasValues).sort(([left], [right]) =>
      left.localeCompare(right)
    )),
  };
}

export function createProjectScopeId() {
  return `project:${randomUUID()}`;
}

export function deriveLegacyProjectScopeId(input: {
  bindingId: string;
  projectId: string;
}) {
  const bindingId = canonicalRequiredString(input.bindingId, 'binding_id');
  const projectId = canonicalRequiredString(input.projectId, 'project_id');
  return `project:${sha256(canonicalJsonText({
    namespace: 'opl_legacy_workspace_binding_project_scope',
    binding_id: bindingId,
    project_id: projectId,
  })).slice('sha256:'.length)}`;
}

export function deriveWorkItemScopeId(input: {
  projectScopeId: string;
  domainId: string;
  domainWorkItemId: string;
}) {
  const projectScopeId = canonicalRequiredString(input.projectScopeId, 'project_scope_id');
  const domainId = canonicalDomainId(input.domainId);
  const domainWorkItemId = canonicalRequiredString(input.domainWorkItemId, 'domain_work_item_id');
  return `work-item:${sha256(canonicalJsonText({
    namespace: 'opl_work_item_scope',
    project_scope_id: projectScopeId,
    domain_id: domainId,
    domain_work_item_id: domainWorkItemId,
  })).slice('sha256:'.length)}`;
}

function canonicalDescendant(
  workspaceRoot: string,
  workItemRoot: string | null | undefined,
  domainWorkItemId: string,
) {
  if (!workItemRoot?.trim()) return null;
  const absoluteWorkspaceRoot = path.resolve(workspaceRoot);
  const absoluteWorkItemRoot = path.isAbsolute(workItemRoot)
    ? path.resolve(workItemRoot)
    : path.resolve(absoluteWorkspaceRoot, workItemRoot);
  const relative = path.relative(absoluteWorkspaceRoot, absoluteWorkItemRoot);
  if (
    relative === ''
    || relative === '..'
    || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)
  ) {
    fail('Canonical work-item root must be a strict descendant of the bound workspace.', {
      failure_code: 'work_item_root_escape',
      workspace_root: absoluteWorkspaceRoot,
      canonical_work_item_root: absoluteWorkItemRoot,
    });
  }
  const identitySegments = relative.split(path.sep).filter((segment) => segment === domainWorkItemId);
  if (identitySegments.length !== 1) {
    fail('Canonical work-item root must contain its exact domain work-item identity as one path segment.', {
      failure_code: 'work_item_root_identity_segment_mismatch',
      workspace_root: absoluteWorkspaceRoot,
      canonical_work_item_root: absoluteWorkItemRoot,
      domain_work_item_id: domainWorkItemId,
      identity_segment_count: identitySegments.length,
    });
  }
  return absoluteWorkItemRoot;
}

export function createWorkItemExecutionScopeSnapshot(
  input: WorkItemExecutionScopeInput,
): WorkItemExecutionScopeSnapshot {
  const projectScopeId = canonicalRequiredString(input.projectScopeId, 'project_scope_id');
  const workspaceBindingId = canonicalRequiredString(input.workspaceBindingId, 'workspace_binding_id');
  const bindingVersionId = canonicalRequiredString(
    input.bindingVersionId ?? workspaceBindingId,
    'binding_version_id',
  );
  const domainId = canonicalDomainId(input.domainId);
  const workspaceRoot = path.resolve(canonicalRequiredString(input.workspaceRoot, 'workspace_root'));
  const resolved = resolveWorkItemIdentity({
    payload: input.payload,
    aliasFields: input.requirement.alias_fields,
    expectedDomainWorkItemId: input.expectedDomainWorkItemId,
  });
  const canonicalWorkItemRoot = canonicalDescendant(
    workspaceRoot,
    input.canonicalWorkItemRoot,
    resolved.domain_work_item_id,
  );
  const canonicalWorkItemRootIdentity = canonicalWorkItemRoot === null
    ? null
    : captureWorkItemRootIdentity({
        workspaceRoot,
        canonicalWorkItemRoot,
        ref: `execution-scope:${resolved.domain_work_item_id}`,
      });
  const inventoryDigest = canonicalOptionalString(input.inventoryDigest, 'inventory_digest');
  const workItemScopeId = deriveWorkItemScopeId({
    projectScopeId,
    domainId,
    domainWorkItemId: resolved.domain_work_item_id,
  });
  const digestInput = {
    version: EXECUTION_SCOPE_SNAPSHOT_VERSION,
    scope_kind: 'work_item',
    project_scope_id: projectScopeId,
    work_item_scope_id: workItemScopeId,
    domain_id: domainId,
    domain_work_item_id: resolved.domain_work_item_id,
    workspace_binding_id: workspaceBindingId,
    binding_version_id: bindingVersionId,
    workspace_root: workspaceRoot,
    canonical_work_item_root: canonicalWorkItemRoot,
    canonical_work_item_root_identity: canonicalWorkItemRootIdentity,
    inventory_digest: inventoryDigest,
    source_alias_fields: resolved.source_alias_fields,
  } as const;
  return {
    surface_kind: 'opl_execution_scope_snapshot',
    ...digestInput,
    scope_digest: sha256(canonicalJsonText(digestInput)),
  };
}

export function requireWorkItemExecutionScopeSnapshot(
  value: unknown,
): WorkItemExecutionScopeSnapshot {
  if (!isRecord(value)) {
    fail('Execution scope snapshot must be an object.');
  }
  const expectedKeys = [
    'surface_kind',
    'version',
    'scope_kind',
    'project_scope_id',
    'work_item_scope_id',
    'domain_id',
    'domain_work_item_id',
    'workspace_binding_id',
    'binding_version_id',
    'workspace_root',
    'canonical_work_item_root',
    'canonical_work_item_root_identity',
    'inventory_digest',
    'source_alias_fields',
    'scope_digest',
  ] as const;
  const unexpectedKeys = Object.keys(value).filter((key) => !expectedKeys.includes(
    key as typeof expectedKeys[number],
  ));
  const missingKeys = expectedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unexpectedKeys.length > 0 || missingKeys.length > 0) {
    fail('Execution scope snapshot must use the canonical exact shape.', {
      unexpected_fields: unexpectedKeys,
      missing_fields: missingKeys,
    });
  }
  if (
    value.surface_kind !== 'opl_execution_scope_snapshot'
    || value.version !== EXECUTION_SCOPE_SNAPSHOT_VERSION
    || value.scope_kind !== 'work_item'
  ) {
    fail('Execution scope snapshot has an unsupported identity envelope.', {
      surface_kind: value.surface_kind,
      version: value.version,
      scope_kind: value.scope_kind,
    });
  }
  if (!Array.isArray(value.source_alias_fields)) {
    fail('Execution scope source_alias_fields must be an array.');
  }
  const sourceAliasFields = canonicalAliasFields(value.source_alias_fields as string[]);
  const canonicalSourceAliasFields = [...sourceAliasFields].sort();
  if (canonicalJsonText(sourceAliasFields) !== canonicalJsonText(canonicalSourceAliasFields)) {
    fail('Execution scope source_alias_fields must be a sorted set.', {
      source_alias_fields: sourceAliasFields,
    });
  }
  const projectScopeId = canonicalRequiredString(value.project_scope_id, 'project_scope_id');
  const declaredDomainId = canonicalRequiredString(value.domain_id, 'domain_id');
  const domainId = canonicalDomainId(declaredDomainId);
  if (declaredDomainId !== domainId) {
    fail('Execution scope domain_id must use the canonical runtime domain identity.', {
      failure_code: 'execution_scope_domain_not_canonical',
      domain_id: declaredDomainId,
      canonical_domain_id: domainId,
    });
  }
  const domainWorkItemId = canonicalRequiredString(value.domain_work_item_id, 'domain_work_item_id');
  const workspaceBindingId = canonicalRequiredString(value.workspace_binding_id, 'workspace_binding_id');
  const bindingVersionId = canonicalRequiredString(value.binding_version_id, 'binding_version_id');
  const workspaceRoot = canonicalRequiredString(value.workspace_root, 'workspace_root');
  if (!path.isAbsolute(workspaceRoot) || path.resolve(workspaceRoot) !== workspaceRoot) {
    fail('Execution scope workspace_root must be a normalized absolute path.', {
      workspace_root: workspaceRoot,
    });
  }
  const canonicalWorkItemRoot = value.canonical_work_item_root === null
    ? null
    : canonicalRequiredString(value.canonical_work_item_root, 'canonical_work_item_root');
  if (
    canonicalWorkItemRoot !== null
    && (
      !path.isAbsolute(canonicalWorkItemRoot)
      || canonicalDescendant(workspaceRoot, canonicalWorkItemRoot, domainWorkItemId)
        !== canonicalWorkItemRoot
    )
  ) {
    fail('Execution scope canonical_work_item_root must be a normalized absolute descendant.', {
      workspace_root: workspaceRoot,
      canonical_work_item_root: canonicalWorkItemRoot,
    });
  }
  const canonicalWorkItemRootIdentity = canonicalWorkItemRoot === null
    ? value.canonical_work_item_root_identity === null
      ? null
      : fail('Execution scope without a canonical work-item root cannot declare a root identity.', {
          failure_code: 'execution_scope_root_identity_without_root',
        })
    : value.canonical_work_item_root_identity === null
      ? fail('Execution scope canonical work-item root requires a frozen physical identity.', {
          failure_code: 'execution_scope_root_identity_missing',
          canonical_work_item_root: canonicalWorkItemRoot,
        })
      : requireWorkItemRootIdentity(value.canonical_work_item_root_identity);
  const inventoryDigest = value.inventory_digest === null
    ? null
    : canonicalRequiredString(value.inventory_digest, 'inventory_digest');
  const expectedWorkItemScopeId = deriveWorkItemScopeId({
    projectScopeId,
    domainId,
    domainWorkItemId,
  });
  const workItemScopeId = canonicalRequiredString(value.work_item_scope_id, 'work_item_scope_id');
  if (workItemScopeId !== expectedWorkItemScopeId) {
    fail('Execution scope work_item_scope_id does not match its immutable identity.', {
      failure_code: 'work_item_scope_id_mismatch',
      work_item_scope_id: workItemScopeId,
      expected_work_item_scope_id: expectedWorkItemScopeId,
    });
  }
  const digestInput = {
    version: EXECUTION_SCOPE_SNAPSHOT_VERSION,
    scope_kind: 'work_item',
    project_scope_id: projectScopeId,
    work_item_scope_id: workItemScopeId,
    domain_id: domainId,
    domain_work_item_id: domainWorkItemId,
    workspace_binding_id: workspaceBindingId,
    binding_version_id: bindingVersionId,
    workspace_root: workspaceRoot,
    canonical_work_item_root: canonicalWorkItemRoot,
    canonical_work_item_root_identity: canonicalWorkItemRootIdentity,
    inventory_digest: inventoryDigest,
    source_alias_fields: canonicalSourceAliasFields,
  } as const;
  const expectedScopeDigest = sha256(canonicalJsonText(digestInput));
  const scopeDigest = canonicalRequiredString(value.scope_digest, 'scope_digest');
  if (scopeDigest !== expectedScopeDigest) {
    fail('Execution scope digest does not match its immutable snapshot.', {
      failure_code: 'execution_scope_digest_mismatch',
      scope_digest: scopeDigest,
      expected_scope_digest: expectedScopeDigest,
    });
  }
  return {
    surface_kind: 'opl_execution_scope_snapshot',
    ...digestInput,
    scope_digest: scopeDigest,
  };
}

export function requireLegacyWorkItemExecutionScopeSnapshot(
  value: unknown,
): LegacyWorkItemExecutionScopeSnapshot {
  if (!isRecord(value)) {
    fail('Legacy execution scope snapshot must be an object.', {
      failure_code: 'legacy_execution_scope_invalid',
    });
  }
  const expectedKeys = [
    'surface_kind',
    'version',
    'scope_kind',
    'project_scope_id',
    'work_item_scope_id',
    'domain_id',
    'domain_work_item_id',
    'workspace_binding_id',
    'binding_version_id',
    'workspace_root',
    'canonical_work_item_root',
    'inventory_digest',
    'source_alias_fields',
    'scope_digest',
  ] as const;
  const unexpectedKeys = Object.keys(value).filter((key) => !expectedKeys.includes(
    key as typeof expectedKeys[number],
  ));
  const missingKeys = expectedKeys.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (unexpectedKeys.length > 0 || missingKeys.length > 0) {
    fail('Legacy execution scope snapshot must use its exact historical shape.', {
      failure_code: 'legacy_execution_scope_invalid',
      unexpected_fields: unexpectedKeys,
      missing_fields: missingKeys,
    });
  }
  if (
    value.surface_kind !== 'opl_execution_scope_snapshot'
    || value.version !== LEGACY_EXECUTION_SCOPE_SNAPSHOT_VERSION
    || value.scope_kind !== 'work_item'
  ) {
    fail('Legacy execution scope snapshot has an unsupported identity envelope.', {
      failure_code: 'legacy_execution_scope_invalid',
      surface_kind: value.surface_kind,
      version: value.version,
      scope_kind: value.scope_kind,
    });
  }
  if (!Array.isArray(value.source_alias_fields)) {
    fail('Legacy execution scope source_alias_fields must be an array.', {
      failure_code: 'legacy_execution_scope_invalid',
    });
  }
  const sourceAliasFields = canonicalAliasFields(value.source_alias_fields as string[]);
  const canonicalSourceAliasFields = [...sourceAliasFields].sort();
  if (canonicalJsonText(sourceAliasFields) !== canonicalJsonText(canonicalSourceAliasFields)) {
    fail('Legacy execution scope source_alias_fields must be a sorted set.', {
      failure_code: 'legacy_execution_scope_invalid',
      source_alias_fields: sourceAliasFields,
    });
  }
  const projectScopeId = canonicalRequiredString(value.project_scope_id, 'project_scope_id');
  const declaredDomainId = canonicalRequiredString(value.domain_id, 'domain_id');
  const domainId = canonicalDomainId(declaredDomainId);
  if (declaredDomainId !== domainId) {
    fail('Legacy execution scope domain_id must be canonical.', {
      failure_code: 'legacy_execution_scope_invalid',
      domain_id: declaredDomainId,
      canonical_domain_id: domainId,
    });
  }
  const domainWorkItemId = canonicalRequiredString(value.domain_work_item_id, 'domain_work_item_id');
  const workspaceBindingId = canonicalRequiredString(value.workspace_binding_id, 'workspace_binding_id');
  const bindingVersionId = canonicalRequiredString(value.binding_version_id, 'binding_version_id');
  const workspaceRoot = canonicalRequiredString(value.workspace_root, 'workspace_root');
  if (!path.isAbsolute(workspaceRoot) || path.resolve(workspaceRoot) !== workspaceRoot) {
    fail('Legacy execution scope workspace_root must be a normalized absolute path.', {
      failure_code: 'legacy_execution_scope_invalid',
      workspace_root: workspaceRoot,
    });
  }
  const canonicalWorkItemRoot = value.canonical_work_item_root === null
    ? null
    : canonicalRequiredString(value.canonical_work_item_root, 'canonical_work_item_root');
  if (canonicalWorkItemRoot !== null) {
    const relative = path.relative(workspaceRoot, canonicalWorkItemRoot);
    if (
      !path.isAbsolute(canonicalWorkItemRoot)
      || path.resolve(canonicalWorkItemRoot) !== canonicalWorkItemRoot
      || relative === '..'
      || relative.startsWith(`..${path.sep}`)
      || path.isAbsolute(relative)
    ) {
      fail('Legacy execution scope canonical root is outside its historical workspace.', {
        failure_code: 'legacy_execution_scope_invalid',
        workspace_root: workspaceRoot,
        canonical_work_item_root: canonicalWorkItemRoot,
      });
    }
  }
  const inventoryDigest = value.inventory_digest === null
    ? null
    : canonicalRequiredString(value.inventory_digest, 'inventory_digest');
  const workItemScopeId = canonicalRequiredString(value.work_item_scope_id, 'work_item_scope_id');
  const expectedWorkItemScopeId = deriveWorkItemScopeId({
    projectScopeId,
    domainId,
    domainWorkItemId,
  });
  if (workItemScopeId !== expectedWorkItemScopeId) {
    fail('Legacy execution scope work-item identity is invalid.', {
      failure_code: 'legacy_execution_scope_invalid',
      work_item_scope_id: workItemScopeId,
      expected_work_item_scope_id: expectedWorkItemScopeId,
    });
  }
  const digestInput = {
    version: LEGACY_EXECUTION_SCOPE_SNAPSHOT_VERSION,
    scope_kind: 'work_item',
    project_scope_id: projectScopeId,
    work_item_scope_id: workItemScopeId,
    domain_id: domainId,
    domain_work_item_id: domainWorkItemId,
    workspace_binding_id: workspaceBindingId,
    binding_version_id: bindingVersionId,
    workspace_root: workspaceRoot,
    canonical_work_item_root: canonicalWorkItemRoot,
    inventory_digest: inventoryDigest,
    source_alias_fields: canonicalSourceAliasFields,
  } as const;
  const scopeDigest = canonicalRequiredString(value.scope_digest, 'scope_digest');
  const expectedScopeDigest = sha256(canonicalJsonText(digestInput));
  if (scopeDigest !== expectedScopeDigest) {
    fail('Legacy execution scope digest is invalid.', {
      failure_code: 'legacy_execution_scope_invalid',
      scope_digest: scopeDigest,
      expected_scope_digest: expectedScopeDigest,
    });
  }
  return {
    surface_kind: 'opl_execution_scope_snapshot',
    ...digestInput,
    scope_digest: scopeDigest,
  };
}

export function executionScopeSnapshotVersion(value: unknown) {
  if (!isRecord(value) || value.surface_kind !== 'opl_execution_scope_snapshot') {
    return 'unsupported' as const;
  }
  if (value.version === EXECUTION_SCOPE_SNAPSHOT_VERSION) return 'current' as const;
  if (value.version === LEGACY_EXECUTION_SCOPE_SNAPSHOT_VERSION) {
    requireLegacyWorkItemExecutionScopeSnapshot(value);
    return 'legacy_identity_unresolved' as const;
  }
  return 'unsupported' as const;
}

export function assertSameExecutionScope(
  expected: WorkItemExecutionScopeSnapshot,
  actual: WorkItemExecutionScopeSnapshot,
  context: Record<string, unknown> = {},
) {
  const fields = [
    'scope_kind',
    'project_scope_id',
    'work_item_scope_id',
    'domain_id',
    'domain_work_item_id',
    'workspace_binding_id',
    'binding_version_id',
    'scope_digest',
  ] as const;
  const mismatches = fields.flatMap((field) =>
    expected[field] === actual[field]
      ? []
      : [{ field, expected: expected[field], actual: actual[field] }]
  );
  if (mismatches.length > 0) {
    fail('Execution scope binding mismatch.', {
      failure_code: 'execution_scope_mismatch',
      mismatches,
      ...context,
    });
  }
}

export function executionScopeEnvironment(scope: WorkItemExecutionScopeSnapshot) {
  return {
    OPL_DOMAIN_ID: scope.domain_id,
    OPL_PROJECT_SCOPE_ID: scope.project_scope_id,
    OPL_WORK_ITEM_SCOPE_ID: scope.work_item_scope_id,
    OPL_WORK_ITEM_ID: scope.domain_work_item_id,
    OPL_WORKSPACE_BINDING_ID: scope.workspace_binding_id,
    OPL_BINDING_VERSION_ID: scope.binding_version_id,
    OPL_SCOPE_DIGEST: scope.scope_digest,
    OPL_DOMAIN_WORK_ITEM_ID: scope.domain_work_item_id,
  } as const;
}
