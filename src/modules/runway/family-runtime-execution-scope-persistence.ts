import type { DatabaseSync } from 'node:sqlite';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  executionScopeSnapshotVersion,
  requireLegacyWorkItemExecutionScopeSnapshot,
  requireWorkItemExecutionScopeSnapshot,
  type LegacyWorkItemExecutionScopeSnapshot,
  type WorkItemExecutionScopeSnapshot,
} from '../workspace/public/standard-agent-action-runtime.ts';
import { withImmediateSchemaMigration } from './family-runtime-schema-migrations.ts';

export const RUNTIME_EXECUTION_SCOPE_KINDS = [
  'work_item',
  'domain',
  'system',
  'identity_unresolved',
] as const;

export const RUNTIME_EXECUTION_IDENTITY_STATES = [
  'resolved',
  'identity_unresolved',
  'quarantined',
] as const;

export type RuntimeExecutionScopeKind = typeof RUNTIME_EXECUTION_SCOPE_KINDS[number];
export type RuntimeExecutionIdentityState = typeof RUNTIME_EXECUTION_IDENTITY_STATES[number];
export type RuntimeExecutionScopeWriteKind = Exclude<RuntimeExecutionScopeKind, 'identity_unresolved'>;

export type RuntimeExecutionScopeWriteInput = {
  scopeKind?: RuntimeExecutionScopeWriteKind;
  executionScope?: WorkItemExecutionScopeSnapshot | null;
};

export type RuntimeExecutionScopeColumns = {
  scope_kind: RuntimeExecutionScopeKind;
  project_scope_id: string | null;
  work_item_scope_id: string | null;
  workspace_binding_id: string | null;
  binding_version_id: string | null;
  scope_digest: string | null;
  execution_scope_json: string | null;
  identity_state: RuntimeExecutionIdentityState;
};

type PersistedExecutionScopeRow = RuntimeExecutionScopeColumns & {
  domain_id: string;
  created_at: string;
};

function fail(message: string, details: Record<string, unknown>): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    fail(`Persisted execution scope requires ${field}.`, {
      failure_code: 'execution_scope_persistence_invalid',
      field,
    });
  }
  return value.trim();
}

function normalizedWorkItemScope(
  value: unknown,
  expectedDomainId: string,
) {
  const scope = requireWorkItemExecutionScopeSnapshot(value);
  if (scope.domain_id !== expectedDomainId) {
    fail('Execution scope domain does not match the runtime row domain.', {
      failure_code: 'execution_scope_domain_mismatch',
      expected_domain_id: expectedDomainId,
      actual_domain_id: scope.domain_id,
    });
  }
  return scope;
}

export function createRuntimeExecutionScopeTable(db: DatabaseSync) {
  return withImmediateSchemaMigration(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS execution_scopes (
        scope_digest TEXT PRIMARY KEY,
        scope_kind TEXT NOT NULL CHECK(scope_kind IN ('work_item', 'domain', 'system', 'identity_unresolved')),
        project_scope_id TEXT,
        work_item_scope_id TEXT,
        domain_id TEXT NOT NULL,
        workspace_binding_id TEXT,
        binding_version_id TEXT,
        execution_scope_json TEXT,
        identity_state TEXT NOT NULL CHECK(identity_state IN ('resolved', 'identity_unresolved', 'quarantined')),
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_execution_scopes_work_item
        ON execution_scopes(work_item_scope_id, binding_version_id);
      CREATE INDEX IF NOT EXISTS idx_execution_scopes_project
        ON execution_scopes(project_scope_id, workspace_binding_id);
    `);
  });
}

export function normalizeRuntimeExecutionScopeWrite(input: {
  domainId: string;
  scopeKind?: RuntimeExecutionScopeWriteKind;
  executionScope?: WorkItemExecutionScopeSnapshot | null;
}) {
  const declared = input.scopeKind !== undefined || input.executionScope !== undefined;
  if (input.executionScope) {
    if (input.scopeKind && input.scopeKind !== 'work_item') {
      fail('A work-item execution scope cannot be persisted under a non-work-item scope kind.', {
        failure_code: 'execution_scope_kind_mismatch',
        scope_kind: input.scopeKind,
      });
    }
    const scope = normalizedWorkItemScope(input.executionScope, input.domainId);
    return {
      declared,
      executionScope: scope,
      columns: {
        scope_kind: 'work_item',
        project_scope_id: scope.project_scope_id,
        work_item_scope_id: scope.work_item_scope_id,
        workspace_binding_id: scope.workspace_binding_id,
        binding_version_id: scope.binding_version_id,
        scope_digest: scope.scope_digest,
        execution_scope_json: canonicalJsonText(scope),
        identity_state: 'resolved',
      } satisfies RuntimeExecutionScopeColumns,
    } as const;
  }
  if (input.scopeKind === 'work_item') {
    fail('New work-item scoped runtime rows require a canonical execution scope snapshot.', {
      failure_code: 'work_item_execution_scope_missing',
      domain_id: input.domainId,
    });
  }
  return {
    declared,
    executionScope: null,
    columns: {
      scope_kind: input.scopeKind ?? 'domain',
      project_scope_id: null,
      work_item_scope_id: null,
      workspace_binding_id: null,
      binding_version_id: null,
      scope_digest: null,
      execution_scope_json: null,
      identity_state: 'resolved',
    } satisfies RuntimeExecutionScopeColumns,
  } as const;
}

export function persistRuntimeExecutionScope(
  db: DatabaseSync,
  input: ReturnType<typeof normalizeRuntimeExecutionScopeWrite>,
  domainId: string,
) {
  if (!input.executionScope) return;
  createRuntimeExecutionScopeTable(db);
  const row: PersistedExecutionScopeRow = {
    ...input.columns,
    domain_id: domainId,
    created_at: new Date().toISOString(),
  };
  db.prepare(`
    INSERT OR IGNORE INTO execution_scopes(
      scope_digest, scope_kind, project_scope_id, work_item_scope_id, domain_id,
      workspace_binding_id, binding_version_id, execution_scope_json, identity_state, created_at
    ) VALUES (
      @scope_digest, @scope_kind, @project_scope_id, @work_item_scope_id, @domain_id,
      @workspace_binding_id, @binding_version_id, @execution_scope_json, @identity_state, @created_at
    )
  `).run(row);
  const existing = db.prepare('SELECT * FROM execution_scopes WHERE scope_digest = ?')
    .get(input.columns.scope_digest) as PersistedExecutionScopeRow | undefined;
  if (!existing || canonicalJsonText(existing) !== canonicalJsonText({
    ...row,
    created_at: existing.created_at,
  })) {
    fail('Execution scope digest is already bound to different persisted scope metadata.', {
      failure_code: 'execution_scope_digest_conflict',
      scope_digest: input.columns.scope_digest,
    });
  }
}

function rowString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

type PersistedExecutionScopeCarrier = {
  source: string;
  version: 'current' | 'legacy_identity_unresolved';
  scope: WorkItemExecutionScopeSnapshot | LegacyWorkItemExecutionScopeSnapshot;
  canonical: string;
};

function parsedCarrierRecord(value: unknown, source: string) {
  if (value === undefined || value === null) return null;
  let parsed: unknown = value;
  if (typeof value === 'string') {
    if (!value.trim()) {
      fail('Persisted execution identity carrier must not be empty.', {
        failure_code: 'runtime_execution_scope_carrier_invalid',
        carrier: source,
      });
    }
    try {
      parsed = parseJsonText(value);
    } catch (error) {
      fail('Persisted execution identity carrier is not valid JSON.', {
        failure_code: 'runtime_execution_scope_carrier_invalid',
        carrier: source,
        cause: error instanceof Error ? error.message : String(error),
      });
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('Persisted execution identity carrier must contain a JSON object.', {
      failure_code: 'runtime_execution_scope_carrier_invalid',
      carrier: source,
    });
  }
  return parsed as Record<string, unknown>;
}

function classifiedExecutionScopeCarrier(
  value: unknown,
  source: string,
): PersistedExecutionScopeCarrier | null {
  if (value === undefined || value === null) return null;
  const parsed = parsedCarrierRecord(value, source)!;
  let version: ReturnType<typeof executionScopeSnapshotVersion>;
  try {
    version = executionScopeSnapshotVersion(parsed);
  } catch (error) {
    fail('Persisted execution scope carrier is invalid.', {
      failure_code: 'runtime_execution_scope_carrier_invalid',
      carrier: source,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (version === 'unsupported') {
    fail('Persisted execution scope carrier uses an unsupported identity envelope.', {
      failure_code: 'runtime_execution_scope_carrier_unsupported',
      carrier: source,
    });
  }
  const scope = version === 'current'
    ? requireWorkItemExecutionScopeSnapshot(parsed)
    : requireLegacyWorkItemExecutionScopeSnapshot(parsed);
  return {
    source,
    version,
    scope,
    canonical: canonicalJsonText(scope),
  };
}

function persistedExecutionScopeCarriers(db: DatabaseSync, row: Record<string, unknown>) {
  const directScope = classifiedExecutionScopeCarrier(
    row.execution_scope_json ?? row.execution_scope,
    'execution_scope_json',
  );
  const workspaceLocator = parsedCarrierRecord(
    row.workspace_locator_json ?? row.workspace_locator,
    'workspace_locator_json',
  );
  const workspaceScope = classifiedExecutionScopeCarrier(
    workspaceLocator?.execution_scope,
    'workspace_locator_json.execution_scope',
  );
  const stageRunInput = parsedCarrierRecord(
    row.stage_run_input_json ?? row.stage_run_input,
    'stage_run_input_json',
  );
  const stageRunScope = classifiedExecutionScopeCarrier(
    stageRunInput?.execution_scope,
    'stage_run_input_json.execution_scope',
  );
  const stageRunWorkspaceLocator = parsedCarrierRecord(
    stageRunInput?.workspace_locator,
    'stage_run_input_json.workspace_locator',
  );
  const stageRunWorkspaceScope = classifiedExecutionScopeCarrier(
    stageRunWorkspaceLocator?.execution_scope,
    'stage_run_input_json.workspace_locator.execution_scope',
  );
  const scopeDigest = rowString(row.scope_digest);
  let registryScope: PersistedExecutionScopeCarrier | null = null;
  if (scopeDigest) {
    const table = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'execution_scopes'",
    ).get();
    const registryRow = table
      ? db.prepare('SELECT * FROM execution_scopes WHERE scope_digest = ?').get(
          scopeDigest,
        ) as Record<string, unknown> | undefined
      : undefined;
    if (!registryRow) {
      fail('Persisted execution scope registry authority is missing.', {
        failure_code: 'runtime_execution_scope_registry_missing',
        scope_digest: scopeDigest,
      });
    }
    registryScope = classifiedExecutionScopeCarrier(
      registryRow.execution_scope_json,
      'execution_scopes.execution_scope_json',
    );
    if (registryScope?.version === 'current') {
      executionScopeFromRow(registryRow);
    }
  }
  const carriers = [
    directScope,
    workspaceScope,
    stageRunScope,
    stageRunWorkspaceScope,
    registryScope,
  ].filter(
    (carrier): carrier is PersistedExecutionScopeCarrier => carrier !== null,
  );
  const scope = carriers[0]?.scope ?? null;
  if (scope) {
    for (const [source, locator] of [
      ['workspace_locator_json', workspaceLocator],
      ['stage_run_input_json.workspace_locator', stageRunWorkspaceLocator],
    ] as const) {
      if (!locator) continue;
      const declaredRoots = [locator.workspace_root, locator.repo_root]
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        .map((value) => value.trim());
      if (declaredRoots.some((root) => root !== scope.workspace_root)) {
        fail('Persisted workspace locator root conflicts with its execution scope authority.', {
          failure_code: 'runtime_execution_scope_carrier_conflict',
          carrier: source,
          scope_workspace_root: scope.workspace_root,
          locator_roots: declaredRoots,
        });
      }
    }
  }
  return carriers;
}

function requireConsistentExecutionScopeCarriers(
  db: DatabaseSync,
  row: Record<string, unknown>,
  operation: string,
) {
  const carriers = persistedExecutionScopeCarriers(db, row);
  if (carriers.length === 0) return { state: 'absent' as const, carriers };
  const versions = new Set(carriers.map((carrier) => carrier.version));
  const canonicalScopes = new Set(carriers.map((carrier) => carrier.canonical));
  if (versions.size !== 1 || canonicalScopes.size !== 1) {
    fail('Persisted execution scope carriers conflict.', {
      failure_code: 'runtime_execution_scope_carrier_conflict',
      operation,
      carriers: carriers.map((carrier) => ({
        source: carrier.source,
        version: carrier.version,
        scope_digest: carrier.scope.scope_digest,
      })),
    });
  }
  const carrierSources = new Set(carriers.map((carrier) => carrier.source));
  if (carriers[0]!.version === 'current') {
    const requiredSources = Object.hasOwn(row, 'stage_attempt_id')
      ? [
          'execution_scope_json',
          'workspace_locator_json.execution_scope',
          'execution_scopes.execution_scope_json',
        ]
      : Object.hasOwn(row, 'stage_run_input_json')
        ? [
            'execution_scope_json',
            'stage_run_input_json.execution_scope',
            'stage_run_input_json.workspace_locator.execution_scope',
            'execution_scopes.execution_scope_json',
          ]
        : ['execution_scope_json', 'execution_scopes.execution_scope_json'];
    const missingCarriers = requiredSources.filter((source) => !carrierSources.has(source));
    if (missingCarriers.length > 0) {
      fail('Persisted current execution identity is missing required carrier copies.', {
        failure_code: 'runtime_execution_scope_carrier_missing',
        operation,
        missing_carriers: missingCarriers,
      });
    }
  }
  return carriers[0]!.version === 'current'
    ? { state: 'current' as const, carriers }
    : { state: 'legacy_identity_unresolved' as const, carriers };
}

export function executionScopeColumnsFromRow(row: Record<string, unknown>): RuntimeExecutionScopeColumns {
  const identityState = rowString(row.identity_state) as RuntimeExecutionIdentityState | null;
  const scopeKind = rowString(row.scope_kind) as RuntimeExecutionScopeKind | null;
  const columns = {
    scope_kind: scopeKind ?? 'identity_unresolved',
    project_scope_id: rowString(row.project_scope_id),
    work_item_scope_id: rowString(row.work_item_scope_id),
    workspace_binding_id: rowString(row.workspace_binding_id),
    binding_version_id: rowString(row.binding_version_id),
    scope_digest: rowString(row.scope_digest),
    execution_scope_json: rowString(row.execution_scope_json),
    identity_state: identityState ?? 'identity_unresolved',
  };
  if (
    columns.scope_kind === 'work_item'
    && columns.identity_state === 'resolved'
    && columns.execution_scope_json
  ) {
    const parsed = parseJsonText(columns.execution_scope_json);
    if (executionScopeSnapshotVersion(parsed) === 'legacy_identity_unresolved') {
      return {
        scope_kind: 'identity_unresolved',
        project_scope_id: null,
        work_item_scope_id: null,
        workspace_binding_id: null,
        binding_version_id: null,
        scope_digest: null,
        execution_scope_json: columns.execution_scope_json,
        identity_state: 'identity_unresolved',
      };
    }
  }
  return columns;
}

export function executionScopeFromRow(row: Record<string, unknown>) {
  const columns = executionScopeColumnsFromRow(row);
  if (columns.scope_kind !== 'work_item' || columns.identity_state !== 'resolved') return null;
  if (!columns.execution_scope_json) {
    fail('Resolved work-item runtime row is missing its execution scope snapshot.', {
      failure_code: 'persisted_execution_scope_missing',
      scope_digest: columns.scope_digest,
    });
  }
  const parsed = parseJsonText(columns.execution_scope_json);
  const domainId = requiredString(row.domain_id, 'runtime_row.domain_id');
  const scope = normalizedWorkItemScope(parsed, domainId);
  const expected = normalizeRuntimeExecutionScopeWrite({
    domainId,
    scopeKind: 'work_item',
    executionScope: scope,
  }).columns;
  for (const field of [
    'scope_kind',
    'project_scope_id',
    'work_item_scope_id',
    'workspace_binding_id',
    'binding_version_id',
    'scope_digest',
    'identity_state',
  ] as const) {
    if (columns[field] !== expected[field]) {
      fail('Persisted execution scope columns do not match the canonical snapshot.', {
        failure_code: 'persisted_execution_scope_column_mismatch',
        field,
        expected: expected[field],
        actual: columns[field],
      });
    }
  }
  return scope;
}

export function requireRuntimeExecutionScopeMutationAllowed(
  db: DatabaseSync,
  row: Record<string, unknown>,
  operation: string,
) {
  const carrierState = requireConsistentExecutionScopeCarriers(db, row, operation);
  const columns = executionScopeColumnsFromRow(row);
  if (carrierState.state === 'legacy_identity_unresolved') {
    fail('Legacy execution scope snapshots are diagnostic-only and cannot be mutated.', {
      failure_code: 'runtime_execution_identity_unresolved',
      operation,
      stage_run_id: rowString(row.stage_run_id),
      stage_attempt_id: rowString(row.stage_attempt_id),
      identity_state: 'identity_unresolved',
      scope_kind: 'identity_unresolved',
      workspace_root: carrierState.carriers[0]?.scope.workspace_root ?? null,
      legacy_carriers: carrierState.carriers.map((carrier) => carrier.source),
    });
  }
  if (
    columns.identity_state !== 'resolved'
    || columns.scope_kind === 'identity_unresolved'
  ) {
    fail('Identity-unresolved runtime rows cannot be mutated.', {
      failure_code: 'runtime_execution_identity_unresolved',
      operation,
      stage_run_id: rowString(row.stage_run_id),
      stage_attempt_id: rowString(row.stage_attempt_id),
      identity_state: columns.identity_state,
      scope_kind: columns.scope_kind,
    });
  }
  if (columns.scope_kind === 'work_item' && carrierState.state !== 'current') {
    fail('Resolved work-item runtime rows require a current execution scope authority.', {
      failure_code: 'persisted_execution_scope_missing',
      operation,
      stage_run_id: rowString(row.stage_run_id),
      stage_attempt_id: rowString(row.stage_attempt_id),
    });
  }
  if (columns.scope_kind !== 'work_item' && carrierState.state !== 'absent') {
    fail('Non-work-item runtime rows cannot carry a work-item execution scope.', {
      failure_code: 'runtime_execution_scope_carrier_conflict',
      operation,
      scope_kind: columns.scope_kind,
      carriers: carrierState.carriers.map((carrier) => carrier.source),
    });
  }
  if (columns.scope_kind !== 'work_item') {
    const residualFields = [
      'project_scope_id',
      'work_item_scope_id',
      'workspace_binding_id',
      'binding_version_id',
      'scope_digest',
      'execution_scope_json',
    ].filter((field) => rowString(row[field]) !== null);
    if (residualFields.length > 0) {
      fail('Non-work-item runtime rows cannot retain work-item identity columns.', {
        failure_code: 'runtime_execution_scope_carrier_conflict',
        operation,
        scope_kind: columns.scope_kind,
        residual_fields: residualFields,
      });
    }
  }
  return {
    columns,
    executionScope: executionScopeFromRow(row),
  } as const;
}

export function assertRuntimeRowScopeMatchesWrite(
  row: Record<string, unknown>,
  input: ReturnType<typeof normalizeRuntimeExecutionScopeWrite>,
  context: Record<string, unknown>,
) {
  if (!input.declared) return;
  const actual = executionScopeColumnsFromRow(row);
  const mismatches = (Object.keys(input.columns) as Array<keyof RuntimeExecutionScopeColumns>)
    .flatMap((field) => actual[field] === input.columns[field]
      ? []
      : [{ field, expected: input.columns[field], actual: actual[field] }]);
  if (mismatches.length > 0) {
    fail('Runtime identity is already bound to a different execution scope.', {
      failure_code: 'runtime_execution_scope_conflict',
      mismatches,
      ...context,
    });
  }
}
