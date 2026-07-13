import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stableId } from '../../kernel/stable-id.ts';
import {
  initialStageQualityCycleState,
  normalizeStageQualityCyclePolicy,
  reduceStageQualityCycleState,
  type StageQualityAttemptRole,
  type StageQualityCyclePolicy,
  type StageQualityCycleState,
  type StageQualityReviewVerdict,
} from '../stagecraft/stage-quality-cycle.ts';
import { createStageAttempt, type StageAttemptCreateInput } from './family-runtime-stage-attempts-parts/create.ts';
import type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import type { TemporalStageRunWorkflowState } from './family-runtime-temporal.ts';

type StageQualityCycleRow = {
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

function parsePolicy(row: StageQualityCycleRow) {
  return normalizeStageQualityCyclePolicy(parseJsonText(row.policy_json));
}

function parseState(row: StageQualityCycleRow) {
  return parseJsonText(row.state_json) as StageQualityCycleState;
}

function getRow(db: DatabaseSync, qualityCycleId: string) {
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

export function createStageQualityCycle(db: DatabaseSync, input: {
  qualityCycleId?: string;
  stageRunId: string;
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  policy: StageQualityCyclePolicy | Record<string, unknown>;
}) {
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
  const row = getRow(db, input.qualityCycleId);
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Stage quality cycle not found.', {
      quality_cycle_id: input.qualityCycleId,
    });
  }
  db.prepare(`
    UPDATE stage_quality_cycles SET current_attempt_ref = ?, updated_at = ? WHERE quality_cycle_id = ?
  `).run(input.attemptRef, new Date().toISOString(), input.qualityCycleId);
}

function projectedCycleStatus(state: TemporalStageRunWorkflowState): StageQualityCycleState['status'] {
  if (state.status === 'completed') return 'passed';
  if (state.status === 'completed_with_quality_debt') return 'quality_debt';
  if (state.status === 'blocked' || state.status === 'human_gate' || state.status === 'failed') {
    return 'hard_stopped';
  }
  if (state.current_role === 'reviewer' || state.current_role === 're_reviewer') return 'awaiting_review';
  if (state.current_role === 'repairer') return 'awaiting_repair';
  return 'awaiting_producer';
}

export function projectTemporalStageRunQualityCycle(
  db: DatabaseSync,
  state: TemporalStageRunWorkflowState,
) {
  const row = getRow(db, state.quality_cycle_id);
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Stage quality cycle not found.', {
      quality_cycle_id: state.quality_cycle_id,
    });
  }
  if (row.stage_run_id !== state.stage_run_id || row.domain_id !== state.domain_id || row.stage_id !== state.stage_id) {
    throw new FrameworkContractError('contract_shape_invalid', 'Temporal StageRun quality projection identity mismatch.', {
      expected: {
        stage_run_id: row.stage_run_id,
        domain_id: row.domain_id,
        stage_id: row.stage_id,
      },
      received: {
        stage_run_id: state.stage_run_id,
        domain_id: state.domain_id,
        stage_id: state.stage_id,
      },
    });
  }
  const projected: StageQualityCycleState & { controller_readback: Record<string, unknown> } = {
    ...parseState(row),
    repair_rounds_used: state.repair_rounds_used,
    current_role: state.current_role,
    status: projectedCycleStatus(state),
    selected_artifact_refs: [...state.artifact_refs],
    quality_debt_refs: [...state.quality_debt_refs],
    controller_readback: {
      surface_kind: state.surface_kind,
      workflow_id: state.workflow_id,
      controller_status: state.status,
      artifact_hashes: [...state.artifact_hashes],
      attempts: state.attempts.map((attempt) => ({
        attempt_role: attempt.attempt_role,
        quality_round_index: attempt.quality_round_index,
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        execution_session_ref: attempt.execution_session_ref,
        status: attempt.status,
      })),
      findings: state.findings,
      repair_map: state.repair_map,
      finding_closures: state.finding_closures,
      blocked_reason: state.blocked_reason,
    },
  };
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE stage_quality_cycles
    SET state_json = ?, current_attempt_ref = NULL, updated_at = ?
    WHERE quality_cycle_id = ?
  `).run(JSON.stringify(projected), now, state.quality_cycle_id);
  return inspectStageQualityCycle(db, state.quality_cycle_id);
}

export function createStageQualityCycleAttempt(db: DatabaseSync, input: {
  qualityCycleId: string;
  role: StageQualityAttemptRole;
  providerKind?: FamilyRuntimeProviderKind;
  workspaceLocator: Record<string, unknown>;
  sourceFingerprint?: string;
  parentAttemptRef?: string;
  inputArtifactRefs?: string[];
  reviewedArtifactHashes?: string[];
  qualitySourceRefs?: string[];
  qualityRubricRefs?: string[];
  priorFindingRefs?: string[];
  repairMapRefs?: string[];
  qualityRolePromptRef?: string;
  contextManifestRef?: string;
  noContextInheritance?: boolean;
  stageAttemptExecutorPolicy?: Record<string, unknown>;
  checkpointRefs?: string[];
  taskId?: string;
}) {
  const cycle = inspectStageQualityCycle(db, input.qualityCycleId);
  const state = cycle.state;
  if (state.current_role !== input.role) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage quality attempt role does not match cycle state.', {
      expected_role: state.current_role,
      received_role: input.role,
      quality_cycle_id: input.qualityCycleId,
    });
  }
  const attemptInput: StageAttemptCreateInput = {
    domainId: cycle.domain_id,
    stageId: cycle.stage_id,
    providerKind: input.providerKind,
    workspaceLocator: input.workspaceLocator,
    sourceFingerprint: input.sourceFingerprint,
    stageAttemptExecutorPolicy: input.stageAttemptExecutorPolicy,
    taskId: input.taskId,
    checkpointRefs: input.checkpointRefs,
    stageRunId: cycle.stage_run_id,
    qualityCycleId: cycle.quality_cycle_id,
    attemptRole: input.role,
    qualityRoundIndex: state.repair_rounds_used,
    parentAttemptRef: input.parentAttemptRef,
    inputArtifactRefs: input.inputArtifactRefs,
    reviewedArtifactHashes: input.reviewedArtifactHashes,
    qualitySourceRefs: input.qualitySourceRefs,
    qualityRubricRefs: input.qualityRubricRefs,
    priorFindingRefs: input.priorFindingRefs,
    repairMapRefs: input.repairMapRefs,
    qualityRolePromptRef: input.qualityRolePromptRef,
    contextManifestRef: input.contextManifestRef,
    noContextInheritance: input.noContextInheritance,
    newAttempt: true,
  };
  const attempt = createStageAttempt(db, attemptInput).attempt;
  const attemptRef = `opl://stage_attempts/${attempt.stage_attempt_id}`;
  db.prepare(`
    UPDATE stage_quality_cycles SET current_attempt_ref = ?, updated_at = ? WHERE quality_cycle_id = ?
  `).run(attemptRef, new Date().toISOString(), cycle.quality_cycle_id);
  return {
    surface_kind: 'opl_stage_quality_cycle_attempt_launch',
    quality_cycle_id: cycle.quality_cycle_id,
    stage_run_id: cycle.stage_run_id,
    attempt_role: input.role,
    quality_round_index: state.repair_rounds_used,
    attempt_ref: attemptRef,
    attempt,
  };
}

export function advanceStageQualityCycle(db: DatabaseSync, input: {
  qualityCycleId: string;
  event:
    | { kind: 'producer_completed'; artifact_refs: string[] }
    | { kind: 'review_completed'; verdict: StageQualityReviewVerdict; quality_debt_refs?: string[] }
    | { kind: 'repair_completed'; artifact_refs: string[] }
    | { kind: 'hard_stop' };
}) {
  const row = getRow(db, input.qualityCycleId);
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Stage quality cycle not found.', {
      quality_cycle_id: input.qualityCycleId,
    });
  }
  const state = reduceStageQualityCycleState(parseState(row), input.event);
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE stage_quality_cycles SET state_json = ?, current_attempt_ref = NULL, updated_at = ?
    WHERE quality_cycle_id = ?
  `).run(JSON.stringify(state), now, input.qualityCycleId);
  return inspectStageQualityCycle(db, input.qualityCycleId);
}
