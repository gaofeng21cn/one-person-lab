import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { canonicalJsonText } from '../../src/kernel/canonical-json.ts';
import {
  deriveWorkItemScopeId,
  requireLegacyWorkItemExecutionScopeSnapshot,
  type LegacyWorkItemExecutionScopeSnapshot,
} from '../../src/modules/workspace/execution-scope.ts';
import { createStageAttemptTable } from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import { createStageRunLaunchTable } from '../../src/modules/runway/family-runtime-stage-run-launch-registry.ts';
import { createFamilyRuntimeQueueTables } from '../../src/modules/runway/family-runtime-store.ts';

type LegacyScopeOverrides = Partial<Omit<LegacyWorkItemExecutionScopeSnapshot, 'surface_kind' | 'version' | 'scope_kind' | 'scope_digest'>>;

export function validLegacyV1Scope(
  overrides: LegacyScopeOverrides = {},
): LegacyWorkItemExecutionScopeSnapshot {
  const projectScopeId = overrides.project_scope_id ?? 'project:legacy-v1-audit';
  const domainId = overrides.domain_id ?? 'medautoscience';
  const domainWorkItemId = overrides.domain_work_item_id ?? 'study-legacy-v1-audit';
  const workspaceRoot = overrides.workspace_root ?? '/tmp/opl-legacy-v1-audit';
  const digestInput = {
    version: 'opl-execution-scope-snapshot.v1' as const,
    scope_kind: 'work_item' as const,
    project_scope_id: projectScopeId,
    work_item_scope_id: overrides.work_item_scope_id ?? deriveWorkItemScopeId({
      projectScopeId,
      domainId,
      domainWorkItemId,
    }),
    domain_id: domainId,
    domain_work_item_id: domainWorkItemId,
    workspace_binding_id: overrides.workspace_binding_id ?? 'binding:legacy-v1-audit',
    binding_version_id: overrides.binding_version_id ?? 'binding:legacy-v1-audit',
    workspace_root: workspaceRoot,
    canonical_work_item_root: overrides.canonical_work_item_root
      ?? `${workspaceRoot}/studies/${domainWorkItemId}`,
    inventory_digest: overrides.inventory_digest ?? null,
    source_alias_fields: overrides.source_alias_fields ?? ['study_id'],
  };
  const scope = {
    surface_kind: 'opl_execution_scope_snapshot' as const,
    ...digestInput,
    scope_digest: `sha256:${crypto.createHash('sha256')
      .update(canonicalJsonText(digestInput), 'utf8')
      .digest('hex')}`,
  };
  return requireLegacyWorkItemExecutionScopeSnapshot(scope);
}

export function installLegacyV1RuntimeFixture(db: DatabaseSync, input: {
  scope?: LegacyWorkItemExecutionScopeSnapshot;
  stageRunId?: string;
  stageAttemptId?: string;
  stageId?: string;
  taskId?: string | null;
  status?: 'queued' | 'running' | 'checkpointed' | 'human_gate';
} = {}) {
  createStageAttemptTable(db);
  createStageRunLaunchTable(db);
  createFamilyRuntimeQueueTables(db);
  const scope = input.scope ?? validLegacyV1Scope();
  const stageRunId = input.stageRunId ?? 'sr-legacy-v1-audit';
  const stageAttemptId = input.stageAttemptId ?? 'sat-legacy-v1-audit';
  const stageId = input.stageId ?? 'baseline';
  const now = '2026-07-21T00:00:00.000Z';
  const scopeJson = canonicalJsonText(scope);
  const workspaceLocator = {
    workspace_root: scope.workspace_root,
    study_id: scope.domain_work_item_id,
    execution_scope: scope,
  };
  const stageRunInput = {
    scope_kind: 'work_item',
    execution_scope: scope,
    workspace_locator: workspaceLocator,
  };
  db.prepare(`
    INSERT INTO execution_scopes(
      scope_digest, scope_kind, project_scope_id, work_item_scope_id, domain_id,
      workspace_binding_id, binding_version_id, execution_scope_json, identity_state, created_at
    ) VALUES (?, 'work_item', ?, ?, ?, ?, ?, ?, 'resolved', ?)
  `).run(
    scope.scope_digest,
    scope.project_scope_id,
    scope.work_item_scope_id,
    scope.domain_id,
    scope.workspace_binding_id,
    scope.binding_version_id,
    scopeJson,
    now,
  );
  db.prepare(`
    INSERT INTO stage_run_launches(
      stage_run_id, stage_run_invocation_id, stage_run_spec_sha256, domain_id, stage_id,
      workflow_id, scope_kind, project_scope_id, work_item_scope_id, workspace_binding_id,
      binding_version_id, scope_digest, execution_scope_json, identity_state,
      stage_run_input_json, launch_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'work_item', ?, ?, ?, ?, ?, ?, 'resolved', ?, 'registered', ?, ?)
  `).run(
    stageRunId,
    `invocation:${stageRunId}`,
    `sha256:${'1'.repeat(64)}`,
    scope.domain_id,
    stageId,
    `workflow:${stageRunId}`,
    scope.project_scope_id,
    scope.work_item_scope_id,
    scope.workspace_binding_id,
    scope.binding_version_id,
    scope.scope_digest,
    scopeJson,
    JSON.stringify(stageRunInput),
    now,
    now,
  );
  db.prepare(`
    INSERT INTO stage_attempts(
      stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id,
      workspace_locator_json, source_fingerprint, executor_kind, stage_run_id,
      scope_kind, project_scope_id, work_item_scope_id, workspace_binding_id,
      binding_version_id, scope_digest, execution_scope_json, identity_state,
      status, checkpoint_refs_json, closeout_refs_json, human_gate_refs_json,
      retry_budget_json, attempt_count, task_id, provider_receipt_json,
      provider_run_json, activity_events_json, route_impact_json, created_at, updated_at
    ) VALUES (
      ?, ?, 'temporal', ?, ?, ?, ?, ?, 'codex_cli', ?,
      'work_item', ?, ?, ?, ?, ?, ?, 'resolved',
      ?, '[]', '[]', '[]', '{}', 0, ?, '{}', ?, '[]', '{}', ?, ?
    )
  `).run(
    stageAttemptId,
    `idem:${stageAttemptId}`,
    `workflow:${stageAttemptId}`,
    scope.domain_id,
    stageId,
    JSON.stringify(workspaceLocator),
    `sha256:${'2'.repeat(64)}`,
    stageRunId,
    scope.project_scope_id,
    scope.work_item_scope_id,
    scope.workspace_binding_id,
    scope.binding_version_id,
    scope.scope_digest,
    scopeJson,
    input.status ?? 'queued',
    input.taskId ?? null,
    JSON.stringify({
      provider_kind: 'temporal',
      workflow_id: `workflow:${stageAttemptId}`,
      provider_status: 'registered',
    }),
    now,
    now,
  );
  return { scope, stageRunId, stageAttemptId, stageId };
}

const RAW_TABLES = new Set([
  'execution_scopes',
  'stage_run_launches',
  'stage_attempts',
  'stage_attempt_signals',
  'stage_attempt_closeouts',
  'stage_quality_cycles',
  'tasks',
  'events',
  'notifications',
]);

export function rawTableRows(db: DatabaseSync, tables: string[]) {
  return Object.fromEntries(tables.map((table) => {
    if (!RAW_TABLES.has(table)) throw new Error(`Unsupported raw fixture table: ${table}`);
    return [table, db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()];
  }));
}
