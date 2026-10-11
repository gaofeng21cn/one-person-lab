import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  initialStageQualityCycleState,
  normalizeStageQualityCyclePolicy,
  type StageQualityCyclePolicy,
  type StageQualityCycleState,
} from '../../authority/stages/index.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from './family-runtime-execution-scope-persistence.ts';

export type StageQualityCycleRow = {
  quality_cycle_id: string;
  stage_run_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  policy_json: string;
  state_json: string;
  current_attempt_ref: string | null;
  created_at: string;
  updated_at: string;
};

export function parsePolicy(row: StageQualityCycleRow) {
  return normalizeStageQualityCyclePolicy(parseJsonText(row.policy_json));
}

export function parseState(row: StageQualityCycleRow) {
  return parseJsonText(row.state_json) as StageQualityCycleState;
}

export function getRow(db: DatabaseSync, qualityCycleId: string) {
  return db.prepare('SELECT * FROM stage_quality_cycles WHERE quality_cycle_id = ?').get(
    qualityCycleId,
  ) as StageQualityCycleRow | undefined;
}

function payload(row: StageQualityCycleRow) {
  return {
    quality_cycle_id: row.quality_cycle_id,
    stage_run_id: row.stage_run_id,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    policy: parsePolicy(row),
    state: parseState(row),
    current_attempt_ref: row.current_attempt_ref,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function withQualityCycleMutation<T>(db: DatabaseSync, mutation: () => T) {
  const ownsTransaction = !db.isTransaction;
  try {
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    const result = mutation();
    if (ownsTransaction) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

export function stageRunMutationAuthority(
  db: DatabaseSync,
  stageRunId: string,
  operation: string,
) {
  const table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stage_run_launches'",
  ).get();
  const row = table
    ? db.prepare('SELECT * FROM stage_run_launches WHERE stage_run_id = ?').get(
        stageRunId,
      ) as Record<string, unknown> | undefined
    : undefined;
  if (!row) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality cycle requires a registered StageRun authority.',
      {
        failure_code: 'stage_quality_cycle_stage_run_unregistered',
        stage_run_id: stageRunId,
        operation,
      },
    );
  }
  return {
    row,
    admission: requireRuntimeExecutionScopeMutationAllowed(db, row, operation),
  };
}

export function stageAttemptIdFromRef(attemptRef: string) {
  const prefix = 'opl://stage_attempts/';
  const stageAttemptId = attemptRef.startsWith(prefix)
    ? attemptRef.slice(prefix.length).trim()
    : '';
  if (!stageAttemptId || attemptRef !== `${prefix}${stageAttemptId}`) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage quality cycle Attempt ref is invalid.', {
      failure_code: 'stage_quality_cycle_attempt_ref_invalid',
      attempt_ref: attemptRef,
    });
  }
  return stageAttemptId;
}

export function executionIdentityLineage(admission: ReturnType<typeof requireRuntimeExecutionScopeMutationAllowed>) {
  return {
    columns: {
      scope_kind: admission.columns.scope_kind,
      project_scope_id: admission.columns.project_scope_id,
      work_item_scope_id: admission.columns.work_item_scope_id,
      workspace_binding_id: admission.columns.workspace_binding_id,
      binding_version_id: admission.columns.binding_version_id,
      scope_digest: admission.columns.scope_digest,
      identity_state: admission.columns.identity_state,
    },
    execution_scope: admission.executionScope,
  };
}

export function requireCycleAttemptMutationAuthority(input: {
  db: DatabaseSync;
  cycle: StageQualityCycleRow;
  stageRunAdmission: ReturnType<typeof requireRuntimeExecutionScopeMutationAllowed>;
  stageAttemptId: string;
  operation: string;
}) {
  const attempt = input.db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as Record<string, unknown> | undefined;
  if (!attempt) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage quality cycle Attempt is not persisted.', {
      failure_code: 'stage_quality_cycle_attempt_not_found',
      stage_attempt_id: input.stageAttemptId,
    });
  }
  const attemptAdmission = requireRuntimeExecutionScopeMutationAllowed(
    input.db,
    attempt,
    input.operation,
  );
  if (
    attempt.stage_run_id !== input.cycle.stage_run_id
    || attempt.quality_cycle_id !== input.cycle.quality_cycle_id
    || attempt.domain_id !== input.cycle.domain_id
    || attempt.stage_id !== input.cycle.stage_id
    || canonicalJsonText(executionIdentityLineage(input.stageRunAdmission))
      !== canonicalJsonText(executionIdentityLineage(attemptAdmission))
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality cycle Attempt lineage does not match its cycle and StageRun.',
      {
        failure_code: 'stage_quality_cycle_attempt_lineage_mismatch',
        quality_cycle_id: input.cycle.quality_cycle_id,
        stage_run_id: input.cycle.stage_run_id,
        stage_attempt_id: input.stageAttemptId,
      },
    );
  }
  return { attempt, admission: attemptAdmission };
}


export function createStageQualityCycle(db: DatabaseSync, input: {
  qualityCycleId?: string;
  stageRunId: string;
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  policy: StageQualityCyclePolicy | Record<string, unknown>;
}) {
  return withQualityCycleMutation(db, () => {
    const stageRun = stageRunMutationAuthority(db, input.stageRunId, 'create_stage_quality_cycle');
    if (
      stageRun.row.domain_id !== input.domainId || stageRun.row.stage_id !== input.stageId
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage quality cycle identity does not match its persisted StageRun.',
        { failure_code: 'stage_quality_cycle_stage_run_identity_mismatch' },
      );
    }
    const policy = normalizeStageQualityCyclePolicy(input.policy);
    if (input.qualityCycleId !== undefined && !input.qualityCycleId.trim()) {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage quality cycle id must be non-empty.');
    }
    const qualityCycleId = input.qualityCycleId?.trim()
      ?? stableId('sqc', [input.stageRunId, input.domainId, input.stageId, policy]);
    const existing = getRow(db, qualityCycleId);
    if (existing) {
      const identityMatches = existing.stage_run_id === input.stageRunId
        && existing.domain_id === input.domainId
        && existing.stage_id === input.stageId;
      const policyMatches = JSON.stringify(parsePolicy(existing)) === JSON.stringify(policy);
      if (!identityMatches || !policyMatches) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Stage quality cycle id is already bound to a different StageRun identity or policy.',
          {
            quality_cycle_id: qualityCycleId,
            existing_stage_run_id: existing.stage_run_id,
            received_stage_run_id: input.stageRunId,
          },
        );
      }
      return { created: false, cycle: payload(existing) };
    }
    const now = new Date().toISOString();
    const state = initialStageQualityCycleState({
      stageRunId: input.stageRunId,
      qualityCycleId,
      maxRepairRounds: policy.formal_review.max_repair_rounds,
      scopeBudget: policy.formal_review.scope_budget,
    });
    db.prepare(`
      INSERT INTO stage_quality_cycles(
        quality_cycle_id, stage_run_id, domain_id, stage_id, policy_json, state_json,
        current_attempt_ref, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(
      qualityCycleId,
      input.stageRunId,
      input.domainId,
      input.stageId,
      JSON.stringify(policy),
      JSON.stringify(state),
      now,
      now,
    );
    return { created: true, cycle: payload(getRow(db, qualityCycleId) as StageQualityCycleRow) };
  });
}

export function inspectStageQualityCycle(db: DatabaseSync, qualityCycleId: string) {
  const row = getRow(db, qualityCycleId);
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Stage quality cycle not found.', {
      quality_cycle_id: qualityCycleId,
    });
  }
  return payload(row);
}

export function markStageQualityCycleCurrentAttempt(db: DatabaseSync, input: {
  qualityCycleId: string;
  attemptRef: string;
}) {
  return withQualityCycleMutation(db, () => {
    const row = getRow(db, input.qualityCycleId);
    if (!row) {
      throw new FrameworkContractError('cli_usage_error', 'Stage quality cycle not found.', {
        quality_cycle_id: input.qualityCycleId,
      });
    }
    const stageRun = stageRunMutationAuthority(
      db,
      row.stage_run_id,
      'mark_stage_quality_cycle_current_attempt:stage_run',
    );
    const stageAttemptId = stageAttemptIdFromRef(input.attemptRef);
    requireCycleAttemptMutationAuthority({
      db,
      cycle: row,
      stageRunAdmission: stageRun.admission,
      stageAttemptId,
      operation: 'mark_stage_quality_cycle_current_attempt:attempt',
    });
    db.prepare(`
      UPDATE stage_quality_cycles SET current_attempt_ref = ?, updated_at = ? WHERE quality_cycle_id = ?
    `).run(input.attemptRef, new Date().toISOString(), input.qualityCycleId);
  });
}
