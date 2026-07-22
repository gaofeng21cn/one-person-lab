import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import type { WorkItemExecutionScopeSnapshot } from '../workspace/index.ts';

type LegacyRuntimeConflict = {
  runtime_kind: 'stage_attempt' | 'stage_run';
  runtime_ref: string;
  stage_attempt_id: string | null;
  stage_run_id: string | null;
  runtime_status: string;
  identity_state: string;
  scope_kind: string;
  legacy_workspace_root: string | null;
  workspace_match: 'same_workspace' | 'workspace_unresolved';
};

function tableColumns(db: DatabaseSync, table: 'stage_attempts' | 'stage_run_launches') {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .map((column) => column.name));
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parsedRecord(value: string): Record<string, unknown> | null {
  try {
    return record(parseJsonText(value));
  } catch {
    return null;
  }
}

function canonicalWorkspaceRoot(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const resolved = path.resolve(value.trim());
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function workspaceRootFromLocator(locator: Record<string, unknown> | null) {
  return canonicalWorkspaceRoot(locator?.workspace_root ?? locator?.repo_root);
}

function sameOrUnresolvedWorkspace(
  legacyWorkspaceRoot: string | null,
  candidateWorkspaceRoot: string,
) {
  if (!legacyWorkspaceRoot) return 'workspace_unresolved' as const;
  return legacyWorkspaceRoot === candidateWorkspaceRoot ? 'same_workspace' as const : null;
}

function activeUnresolvedAttemptConflicts(input: {
  db: DatabaseSync;
  domainId: string;
  stageId: string;
  candidateWorkspaceRoot: string;
  candidateStageAttemptId?: string | null;
}) {
  const columns = tableColumns(input.db, 'stage_attempts');
  if (columns.size === 0) return [];
  const hasPersistedIdentity = columns.has('identity_state') && columns.has('scope_kind');
  const archivedPredicate = columns.has('archived_at') ? 'AND archived_at IS NULL' : '';
  const identityPredicate = hasPersistedIdentity
    ? "AND (identity_state IN ('identity_unresolved', 'quarantined') OR scope_kind = 'identity_unresolved')"
    : '';
  const rows = input.db.prepare(`
    SELECT stage_attempt_id,
      ${columns.has('stage_run_id') ? 'stage_run_id' : 'NULL AS stage_run_id'},
      status, workspace_locator_json,
      ${columns.has('identity_state') ? 'identity_state' : "'identity_unresolved' AS identity_state"},
      ${columns.has('scope_kind') ? 'scope_kind' : "'identity_unresolved' AS scope_kind"}
    FROM stage_attempts
    WHERE domain_id = ? AND stage_id = ?
      AND status NOT IN ('completed', 'failed', 'dead_lettered')
      ${archivedPredicate}
      ${identityPredicate}
    ORDER BY created_at ASC, stage_attempt_id ASC
  `).all(input.domainId, input.stageId) as Array<{
    stage_attempt_id: string;
    stage_run_id: string | null;
    status: string;
    workspace_locator_json: string;
    identity_state: string;
    scope_kind: string;
  }>;
  return rows.flatMap((row): LegacyRuntimeConflict[] => {
    if (row.stage_attempt_id === input.candidateStageAttemptId) return [];
    const legacyWorkspaceRoot = workspaceRootFromLocator(parsedRecord(row.workspace_locator_json));
    const workspaceMatch = sameOrUnresolvedWorkspace(
      legacyWorkspaceRoot,
      input.candidateWorkspaceRoot,
    );
    if (!workspaceMatch) return [];
    return [{
      runtime_kind: 'stage_attempt',
      runtime_ref: `opl://stage_attempts/${row.stage_attempt_id}`,
      stage_attempt_id: row.stage_attempt_id,
      stage_run_id: row.stage_run_id,
      runtime_status: row.status,
      identity_state: row.identity_state,
      scope_kind: row.scope_kind,
      legacy_workspace_root: legacyWorkspaceRoot,
      workspace_match: workspaceMatch,
    }];
  });
}

function activeUnresolvedStageRunConflicts(input: {
  db: DatabaseSync;
  domainId: string;
  stageId: string;
  candidateWorkspaceRoot: string;
  candidateStageRunId?: string | null;
}) {
  const columns = tableColumns(input.db, 'stage_run_launches');
  if (columns.size === 0) return [];
  const hasPersistedIdentity = columns.has('identity_state') && columns.has('scope_kind');
  const identityPredicate = hasPersistedIdentity
    ? "AND (identity_state IN ('identity_unresolved', 'quarantined') OR scope_kind = 'identity_unresolved')"
    : '';
  const rows = input.db.prepare(`
    SELECT stage_run_id, launch_status, stage_run_input_json,
      ${columns.has('identity_state') ? 'identity_state' : "'identity_unresolved' AS identity_state"},
      ${columns.has('scope_kind') ? 'scope_kind' : "'identity_unresolved' AS scope_kind"}
    FROM stage_run_launches
    WHERE domain_id = ? AND stage_id = ? AND launch_status <> 'closed'
      ${identityPredicate}
    ORDER BY created_at ASC, stage_run_id ASC
  `).all(input.domainId, input.stageId) as Array<{
    stage_run_id: string;
    launch_status: string;
    stage_run_input_json: string;
    identity_state: string;
    scope_kind: string;
  }>;
  return rows.flatMap((row): LegacyRuntimeConflict[] => {
    if (row.stage_run_id === input.candidateStageRunId) return [];
    const stageRunInput = parsedRecord(row.stage_run_input_json);
    const legacyWorkspaceRoot = workspaceRootFromLocator(record(stageRunInput?.workspace_locator));
    const workspaceMatch = sameOrUnresolvedWorkspace(
      legacyWorkspaceRoot,
      input.candidateWorkspaceRoot,
    );
    if (!workspaceMatch) return [];
    return [{
      runtime_kind: 'stage_run',
      runtime_ref: `opl://stage-runs/${row.stage_run_id}`,
      stage_attempt_id: null,
      stage_run_id: row.stage_run_id,
      runtime_status: row.launch_status,
      identity_state: row.identity_state,
      scope_kind: row.scope_kind,
      legacy_workspace_root: legacyWorkspaceRoot,
      workspace_match: workspaceMatch,
    }];
  });
}

export function requireNoActiveUnresolvedRuntimeIdentityConflict(input: {
  db: DatabaseSync;
  domainId: string;
  stageId: string;
  executionScope: WorkItemExecutionScopeSnapshot | null;
  operation: string;
  candidateStageRunId?: string | null;
  candidateStageAttemptId?: string | null;
}) {
  if (!input.executionScope) return;
  const candidateWorkspaceRoot = canonicalWorkspaceRoot(input.executionScope.workspace_root)!;
  const conflicts = [
    ...activeUnresolvedAttemptConflicts({
      ...input,
      candidateWorkspaceRoot,
    }),
    ...activeUnresolvedStageRunConflicts({
      ...input,
      candidateWorkspaceRoot,
    }),
  ];
  if (conflicts.length === 0) return;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Scoped runtime launch conflicts with active legacy runtime identity that cannot be resolved safely.',
    {
      failure_code: 'active_unresolved_runtime_identity_conflict',
      blocked_reason: 'scoped_launch_conflicts_with_active_unresolved_identity',
      operation: input.operation,
      domain_id: input.domainId,
      stage_id: input.stageId,
      candidate_stage_run_id: input.candidateStageRunId ?? null,
      candidate_stage_attempt_id: input.candidateStageAttemptId ?? null,
      candidate_work_item_scope_id: input.executionScope.work_item_scope_id,
      candidate_scope_digest: input.executionScope.scope_digest,
      candidate_workspace_root: candidateWorkspaceRoot,
      legacy_conflicts: conflicts,
      legacy_alias_policy: 'negative_admission_only',
      positive_binding_allowed: false,
      repair_action: 'resolve_or_terminalize_legacy_runtime_identity_before_scoped_launch',
    },
  );
}
