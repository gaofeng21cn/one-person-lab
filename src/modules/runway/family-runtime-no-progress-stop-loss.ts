import {
  record,
  stringList,
  stringValue,
} from '../../kernel/json-record.ts';
import {
  sameStageRunRouteCurrentnessIdentity,
  type StageRunCurrentnessIdentity,
} from './family-runtime-stage-run-currentness-identity.ts';

const MAX_SAME_ROUTE_NO_PROGRESS_ATTEMPTS = 2;
const TERMINAL_ATTEMPT_STATUSES = new Set(['completed', 'blocked', 'failed', 'dead_lettered']);
const STOP_LOSS_RELEASE_CONDITIONS = [
  'fresh_current_owner_delta',
  'accepted_domain_owner_answer',
  'stable_domain_typed_blocker',
  'human_decision',
  'provider_hard_gate_clearance',
];
const READ_MODEL_NO_PROGRESS_CLASSIFICATIONS = new Set([
  'read_model_reconcile_only',
  'read_model_reconcile',
  'read_model_refresh',
  'projection_reconcile',
]);
const STALE_ROUTE_NO_PROGRESS_CLASSIFICATIONS = new Set([
  'stale_route_redrive_only',
  'stale_route_redrive',
  'superseded_route_redrive',
]);

function deltaObserved(value: unknown) {
  const delta = record(value);
  return (typeof delta.delta_count === 'number' && delta.delta_count > 0)
    || stringList(delta.delta_refs).length > 0;
}

function refObserved(source: Record<string, unknown>, field: string) {
  return Boolean(stringValue(source[field])) || stringList(source[field]).length > 0;
}

function terminalDomainSignalObserved(stageProgressLog: Record<string, unknown>) {
  const evidenceRefs = record(stageProgressLog.evidence_refs);
  return [
    'owner_receipt_refs',
    'typed_blocker_refs',
    'human_gate_refs',
  ].some((field) => refObserved(evidenceRefs, field));
}

function noProgressClassification(stageProgressLog: Record<string, unknown>) {
  const actualWork = record(stageProgressLog.actual_work);
  const userStageLog = record(stageProgressLog.user_stage_log);
  const classification = stringValue(userStageLog.raw_progress_delta_classification)
    ?? stringValue(userStageLog.progress_delta_classification);
  if (classification && READ_MODEL_NO_PROGRESS_CLASSIFICATIONS.has(classification)) {
    return 'read_model_reconcile_only';
  }
  if (classification && STALE_ROUTE_NO_PROGRESS_CLASSIFICATIONS.has(classification)) {
    return 'stale_route_redrive_only';
  }
  if (classification === 'owner_output_already_current') {
    return 'owner_output_already_current';
  }
  if (classification === 'platform_repair'
    || deltaObserved(userStageLog.platform_repair_delta)) {
    return 'platform_repair_only';
  }
  if (stringList(actualWork.closeout_refs).length > 0) {
    return 'receipt_only';
  }
  return 'no_deliverable_delta';
}

function stopLossAuthorityBoundary() {
  return {
    can_freeze_default_redrive: true,
    can_select_domain_successor: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_write_domain_truth: false,
    can_claim_domain_ready: false,
    budget_exhaustion_is_domain_typed_blocker: false,
    temporal_retry_policy_replaced: false,
  };
}

export function buildSameRouteNoProgressStopLossState(input: {
  currentIdentity: StageRunCurrentnessIdentity;
  observations: Array<{
    identity: StageRunCurrentnessIdentity;
    stageProgressLog: Record<string, unknown>;
  }>;
}) {
  const attemptClassifications: string[] = [];
  for (const observation of input.observations) {
    if (!sameStageRunRouteCurrentnessIdentity(input.currentIdentity, observation.identity)) {
      break;
    }
    if (terminalDomainSignalObserved(observation.stageProgressLog)) {
      break;
    }
    const actualWork = record(observation.stageProgressLog.actual_work);
    if (!TERMINAL_ATTEMPT_STATUSES.has(stringValue(actualWork.status) ?? '')) {
      continue;
    }
    const userStageLog = record(observation.stageProgressLog.user_stage_log);
    if (deltaObserved(userStageLog.deliverable_progress_delta)) {
      break;
    }
    attemptClassifications.push(noProgressClassification(observation.stageProgressLog));
  }
  const noProgressCount = attemptClassifications.length;
  const frozen = noProgressCount >= MAX_SAME_ROUTE_NO_PROGRESS_ATTEMPTS;
  return {
    surface_kind: 'opl_current_owner_delta_stop_loss_state',
    status: frozen ? 'frozen' : noProgressCount > 0 ? 'watch' : 'not_triggered',
    default_redrive_allowed: !frozen,
    fresh_owner_delta_required_to_resume: frozen,
    freeze_reason: frozen ? 'same_stage_run_route_no_progress_budget_exhausted' : null,
    release_conditions: frozen ? STOP_LOSS_RELEASE_CONDITIONS : [],
    no_progress_budget: {
      same_stage_run_route_no_progress_count: noProgressCount,
      max_same_stage_run_route_no_progress_attempts: MAX_SAME_ROUTE_NO_PROGRESS_ATTEMPTS,
      exhausted: frozen,
      attempt_classifications: attemptClassifications,
    },
    successor_admission: null,
    policy_ref: 'contracts/opl-framework/current-owner-delta.schema.json#/properties/stop_loss_state',
    authority_boundary: stopLossAuthorityBoundary(),
  };
}
