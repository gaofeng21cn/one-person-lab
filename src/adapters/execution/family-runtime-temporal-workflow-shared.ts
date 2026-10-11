import { asRecord, asRecordList, asStringList } from './family-runtime-temporal-workflow-values.ts';
export {
  asStringList, asRecordList, requiredRecordList, asRecord, stageRunQualityCycleId,
} from './family-runtime-temporal-workflow-values.ts';
export {
  workflowScopeKind, assertWorkflowExecutionScopeIdentity, assertWorkflowAttemptIdentity,
  closeoutRefsFrom, closeoutPacketFromCodexResult, validateCloseoutPacketForWorkflow,
  validateOperatorActionPayload, validateWorkflowStageRunInput,
} from './family-runtime-temporal-workflow-ingress.ts';
export {
  qualityEnvelopeFromAttempt, executionSessionRefFromAttemptState, qualityArtifactIdentity,
  findingList, repairMapList, findingClosureList,
} from './family-runtime-temporal-workflow-artifacts.ts';
import { patched, upsertSearchAttributes } from '@temporalio/workflow';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type {
  StageAttemptExecutionContentBinding,
  TemporalStageAttemptWorkflowInput,
  TemporalStageAttemptWorkflowState,
  TemporalStageRunWorkflowInput,
  TemporalStageRunWorkflowState,
} from './family-runtime-temporal.ts';
import {
  STAGE_QUALITY_HARD_STOP_CLASSES,
  type StageQualityFinding,
  type StageQualityHardStopClass,
} from '../../authority/stages/public/stage-quality-cycle.ts';
import { aggregateStageQualityScopeTokenUsage } from '../../authority/stages/public/review-evidence-currentness.ts';

export function nowIso() {
  return new Date(Date.now()).toISOString();
}

export function finiteNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export function observedAttemptTotalTokens(state: TemporalStageAttemptWorkflowState) {
  const observations = state.activity_events.flatMap((event) => {
    const direct = finiteNonNegativeInteger(asRecord(event.token_usage).total_tokens);
    const costSummary = asRecord(event.cost_summary);
    const nested = finiteNonNegativeInteger(asRecord(costSummary.token_usage).total_tokens);
    return [direct, nested].filter((value): value is number => value !== null);
  });
  return observations.length > 0 ? Math.max(...observations) : null;
}

export function findingPriorities(findings: StageQualityFinding[]) {
  return findings
    .filter((finding) => finding.required)
    .map((finding) => finding.severity === 'critical' ? 'p0' as const
      : finding.severity === 'major' ? 'p1' as const
        : 'p2' as const);
}

export function qualityScopeBudgetUsage(
  state: TemporalStageRunWorkflowState,
  includeManagedAttemptsUsed: boolean,
) {
  const tokenObservations = state.attempts.map((attempt) => attempt.total_tokens_observed);
  const tokenUsage = aggregateStageQualityScopeTokenUsage(tokenObservations);
  const elapsedMs = Math.max(0, Date.parse(state.updated_at) - Date.parse(state.started_at));
  return {
    attempts_used: state.repair_rounds_used,
    ...(includeManagedAttemptsUsed ? { managed_attempts_used: state.attempts.length } : {}),
    elapsed_ms: Number.isFinite(elapsedMs) ? elapsedMs : 0,
    ...tokenUsage,
  };
}

export function executionPolicyForAttempt(input: TemporalStageAttemptWorkflowInput) {
  const binding = input.execution_content_binding;
  if (!binding) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality controller requires the materialized Attempt execution content binding.',
      {
        failure_code: 'stage_attempt_execution_content_binding_missing',
        stage_attempt_id: input.stage_attempt_id,
      },
    );
  }
  const policy = asRecord(binding.spec.quality_policy.body);
  const formalReview = asRecord(policy.formal_review);
  const required = formalReview.required;
  const maxRepairRounds = formalReview.max_repair_rounds;
  if (
    typeof required !== 'boolean'
    || !Number.isInteger(maxRepairRounds)
    || (maxRepairRounds as number) < 0
    || (maxRepairRounds as number) > 3
    || !Array.isArray(binding.spec.quality_rubric_refs)
    || binding.spec.quality_rubric_refs.length === 0
    || !Array.isArray(binding.declared_stage_ids)
    || !binding.declared_stage_ids.includes(input.stage_id)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality controller received an invalid Attempt execution policy binding.',
      {
        failure_code: 'stage_attempt_execution_policy_invalid',
        stage_attempt_id: input.stage_attempt_id,
      },
    );
  }
  return {
    binding: binding as StageAttemptExecutionContentBinding,
    formalReviewRequired: required,
    maxRepairRounds: maxRepairRounds as number,
    rubricRefs: binding.spec.quality_rubric_refs,
    declaredStageIds: binding.declared_stage_ids,
  };
}

export function upsertStageAttemptVisibility(input: {
  enabled?: boolean;
  status: TemporalStageAttemptWorkflowState['status'];
  phase: string;
  blockedReason?: string | null;
}) {
  if (!input.enabled || !patched('opl-stage-attempt-visibility-status-v1')) {
    return;
  }
  if (patched('opl-stage-attempt-minimal-visibility-index-v1')) {
    return;
  }
  upsertSearchAttributes({
    OplAttemptStatus: [input.status],
    OplStagePhase: [input.phase],
    OplBlockedReason: input.blockedReason ? [input.blockedReason] : [],
  });
}

export function stageRunStopped(state: TemporalStageRunWorkflowState) {
  return ['completed_with_quality_debt', 'blocked', 'human_gate', 'failed'].includes(state.status);
}

export function hasConsumableArtifact(state: TemporalStageRunWorkflowState) {
  return state.artifact_refs.length > 0
    && state.artifact_refs.length === state.artifact_hashes.length;
}

export function hasProducedConsumableArtifact(state: TemporalStageRunWorkflowState) {
  return state.attempts.some((attempt) => (
    (attempt.attempt_role === 'producer' || attempt.attempt_role === 'repairer')
    && attempt.artifact_refs.length > 0
    && attempt.artifact_refs.length === attempt.artifact_hashes.length
    && attempt.artifact_refs.length === attempt.artifact_identity_receipt_refs.length
  ));
}

export function qualityFailureRef(input: TemporalStageRunWorkflowInput, reason: string) {
  return `opl://stage-runs/${encodeURIComponent(input.stage_run_id)}/quality-debt/${encodeURIComponent(reason)}`;
}

export function activityFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? activityFailureReason(error.cause) : error.message;
}

export function providerRuntimeHardStop(state: TemporalStageAttemptWorkflowState): {
  hard_stop_class: StageQualityHardStopClass;
  blocked_reason: string;
  typed_blocker_refs: string[];
  human_gate_refs: string[];
} | null {
  const closeout = asRecord(state.closeout_packet);
  const authorityBoundary = asRecord(closeout.authority_boundary);
  const isRuntimeBlocker = closeout.activity_status === 'blocked'
    && authorityBoundary.provider_runtime_blocker_ref_only === true
    && asRecordList(closeout.rejected_writes).some(
      (entry) => entry.surface_kind === 'opl_provider_runtime_typed_blocker_ref',
  );
  if (!isRuntimeBlocker) return null;
  const blockedReason = typeof closeout.blocked_reason === 'string' ? closeout.blocked_reason : '';
  const routeImpact = asRecord(closeout.route_impact);
  const declaredHardStopClass = routeImpact.hard_stop_class;
  const hardStopClass = typeof declaredHardStopClass === 'string'
    && STAGE_QUALITY_HARD_STOP_CLASSES.includes(declaredHardStopClass as StageQualityHardStopClass)
    ? declaredHardStopClass as StageQualityHardStopClass
    : null;
  const typedBlockerRefs = asRecordList(closeout.rejected_writes)
    .map((entry) => entry.blocker_ref)
    .filter((entry): entry is string => typeof entry === 'string' && Boolean(entry));
  return hardStopClass
    ? {
        hard_stop_class: hardStopClass,
        blocked_reason: blockedReason || 'stage_quality_provider_runtime_hard_stop',
        typed_blocker_refs: typedBlockerRefs,
        human_gate_refs: asStringList(state.human_gate_refs),
      }
    : null;
}

export function controllerHardStopFromError(error: unknown): {
  hardStopClass: StageQualityHardStopClass;
  blockedReason: string;
  typedBlockerRefs: string[];
  humanGateRefs: string[];
  sourceAttemptRef: string | null;
} | null {
  if (!(error instanceof FrameworkContractError)) return null;
  const hardStopClass = error.details?.hard_stop_class;
  const blockedReason = error.details?.blocked_reason;
  return typeof hardStopClass === 'string'
    && STAGE_QUALITY_HARD_STOP_CLASSES.includes(hardStopClass as StageQualityHardStopClass)
    && typeof blockedReason === 'string'
    ? {
        hardStopClass: hardStopClass as StageQualityHardStopClass,
        blockedReason,
        typedBlockerRefs: asStringList(error.details?.typed_blocker_refs),
        humanGateRefs: asStringList(error.details?.human_gate_refs),
        sourceAttemptRef: typeof error.details?.source_attempt_ref === 'string'
          ? error.details.source_attempt_ref
          : null,
      }
    : null;
}
