import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundaryCore,
} from './authority-boundary.ts';
import {
  buildOperatorActionRoute,
  record,
  recordList,
  stringList,
  stringValue,
  uniqueRefs,
} from './value-utils.ts';

const ACTIVE_ATTEMPT_STATUSES = new Set([
  'queued',
  'running',
  'checkpointed',
  'active',
  'in_progress',
]);

function refsOnlyAuthorityBoundary() {
  return {
    ...buildAppDrilldownRefsOnlyAuthorityBoundaryCore(),
    opl: 'progress_first_attempt_supervision_read_model',
    provider: 'stage_attempt_liveness_and_progress_projection_owner',
    domain: 'truth_quality_artifact_gate_owner',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_typed_blocker: false,
    can_create_owner_receipt: false,
    can_authorize_quality_verdict: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    provider_completion_is_domain_ready: false,
  };
}

function attemptStatus(attempt: JsonRecord) {
  return stringValue(attempt.local_status)
    ?? stringValue(attempt.status)
    ?? stringValue(attempt.workflow_status);
}

function isActiveAttempt(attempt: JsonRecord) {
  const status = attemptStatus(attempt);
  return Boolean(status && ACTIVE_ATTEMPT_STATUSES.has(status));
}

function stageProgressLog(attempt: JsonRecord) {
  return record(attempt.stage_progress_log);
}

function userStageLog(attempt: JsonRecord) {
  return record(stageProgressLog(attempt).user_stage_log);
}

function timeline(attempt: JsonRecord) {
  return record(stageProgressLog(attempt).timeline);
}

function providerRun(attempt: JsonRecord) {
  return record(attempt.provider_run);
}

function currentProviderReadiness(attempt: JsonRecord) {
  return record(attempt.current_provider_readiness);
}

function workerReadiness(attempt: JsonRecord) {
  return record(record(currentProviderReadiness(attempt).details).worker_readiness);
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function staleStatus(value: unknown) {
  const status = stringValue(value);
  return status === 'stale'
    || status === 'expired'
    || status === 'progress_stale'
    || status === 'stale_progress'
    || status === 'freshness_stale';
}

function progressIsStale(attempt: JsonRecord) {
  const log = stageProgressLog(attempt);
  const userLog = userStageLog(attempt);
  const attemptTimeline = timeline(attempt);
  const run = providerRun(attempt);
  const currentControlState = record(attempt.current_control_state);
  return [
    attempt.progress_freshness_status,
    attempt.stage_progress_freshness_status,
    currentControlState.progress_freshness_status,
    run.progress_freshness_status,
    run.stage_progress_freshness_status,
    log.freshness_status,
    log.progress_freshness_status,
    log.stage_progress_freshness_status,
    userLog.freshness_status,
    userLog.progress_freshness_status,
    attemptTimeline.freshness_status,
    attemptTimeline.progress_freshness_status,
  ].some(staleStatus);
}

function declaredNextAction(attempt: JsonRecord) {
  const log = stageProgressLog(attempt);
  const userLog = userStageLog(attempt);
  const actualWork = record(log.actual_work);
  const currentControlState = record(attempt.current_control_state);
  const routeImpact = record(actualWork.route_impact);
  return firstString(
    attempt.next_action,
    attempt.next_safe_action,
    attempt.operator_next_action,
    attempt.required_next_action,
    currentControlState.next_action,
    currentControlState.next_safe_action,
    currentControlState.operator_next_action,
    routeImpact.next_action,
    routeImpact.next_safe_action,
    routeImpact.required_next_action,
    userLog.next_forced_delta,
  );
}

function missingProgressSignals(attempt: JsonRecord) {
  const log = stageProgressLog(attempt);
  const userLog = userStageLog(attempt);
  const attemptTimeline = timeline(attempt);
  const run = providerRun(attempt);
  const readiness = workerReadiness(attempt);
  const missing = [
    Object.keys(readiness).length === 0
      || stringValue(readiness.readiness_status) !== 'ready'
      ? 'worker_liveness' : null,
    !stringValue(run.last_heartbeat_at) && !stringValue(attemptTimeline.last_heartbeat_at)
      ? 'latest_progress_delta' : null,
    Object.keys(log).length === 0
      || Object.keys(userLog).length === 0
      || stringValue(userLog.semantic_status) === 'missing_domain_semantic_summary'
      ? 'stage_log' : null,
    stringList(attempt.closeout_refs).length === 0
      && !stringValue(attempt.closeout_receipt_status)
      ? 'owner_closeout' : null,
    !declaredNextAction(attempt) ? 'next_action' : null,
    progressIsStale(attempt) ? 'stale_progress' : null,
  ].filter((entry): entry is string => Boolean(entry));
  return [...new Set(missing)];
}

function supervisorSafeActionKind(missingSignals: string[]) {
  if (missingSignals.includes('worker_liveness')) {
    return 'repair_worker_liveness_before_attempt_continuity_judgment';
  }
  if (missingSignals.includes('owner_closeout')) {
    return 'require_owner_closeout_or_domain_typed_blocker';
  }
  return 'require_domain_typed_blocker_or_fresh_progress_delta';
}

function typedBlockerRequirement(missingSignals: string[]) {
  const status = missingSignals.includes('worker_liveness')
    ? 'deferred_until_worker_liveness_ready'
    : missingSignals.includes('owner_closeout')
      ? 'required_when_owner_closeout_missing'
      : 'required_when_no_fresh_progress_delta';
  return {
    surface_kind: 'opl_progress_first_attempt_continuity_typed_blocker_requirement',
    status,
    owner: 'domain_owner',
    required_when_any_signal_missing: missingSignals,
    accepted_refs: ['typed_blocker_refs', 'owner_closeout_refs', 'fresh_progress_delta_refs'],
    opl_can_create_typed_blocker: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
  };
}

function progressFirstRouteRef(stageAttemptId: string) {
  return `/stage_attempt_workbench/attempts/${stageAttemptId}/progress_first_supervision`;
}

export function buildProgressFirstSupervisionActionRoutes(input: {
  stageAttemptWorkbench: JsonRecord;
}) {
  // Keep default operator actions bounded to the current workbench window;
  // evidence_attempts is the full audit/history surface.
  const attempts = recordList(input.stageAttemptWorkbench.attempts);
  return uniqueRefs(attempts
    .filter(isActiveAttempt)
    .flatMap((attempt) => {
      const stageAttemptId = stringValue(attempt.stage_attempt_id);
      if (!stageAttemptId) {
        return [];
      }
      const missingSignals = missingProgressSignals(attempt);
      if (missingSignals.length === 0) {
        return [];
      }
      const args = ['attempt', 'query', stageAttemptId];
      return [buildOperatorActionRoute(args, {
        action_id: `progress-first-supervision:${stageAttemptId}`,
        action_kind: 'progress_first_attempt_supervision',
        execution_policy: 'diagnostic_query_only',
        submit_via: 'opl runtime action execute',
        can_submit_to_safe_action_shell: false,
        default_actionable: false,
        default_actionability_status: 'diagnostic_only_not_operator_actionable',
        route_status: 'diagnostic_only',
        route_status_detail_semantics:
          'read_only_operator_diagnostic_not_safe_action_or_closeable_workorder',
        route_status_detail:
          'Active provider attempt is missing worker liveness, progress delta, stage log, owner closeout, next action, or fresh progress signals; inspect the attempt before treating the lane as no-action.',
        stage_attempt_id: stageAttemptId,
        domain_id: stringValue(attempt.domain_id),
        stage_id: stringValue(attempt.stage_id),
        provider_kind: stringValue(attempt.provider_kind),
        task_id: stringValue(attempt.task_id),
        task_kind: stringValue(record(attempt.current_control_state).task_kind),
        attempt_status: attemptStatus(attempt),
        missing_progress_signals: missingSignals,
        supervisor_safe_action_kind: supervisorSafeActionKind(missingSignals),
        typed_blocker_requirement: typedBlockerRequirement(missingSignals),
        progress_first_required_next_action:
          'Inspect the active attempt, worker readiness, stage_progress_log, and closeout refs; start or repair the worker first when liveness is missing, otherwise supervise progress or require domain typed closeout.',
        expected_refs: [
          `/stage_attempt_workbench/attempts/${stageAttemptId}/current_provider_readiness`,
          `/stage_attempt_workbench/attempts/${stageAttemptId}/stage_progress_log`,
          `/stage_attempt_workbench/attempts/${stageAttemptId}/current_control_state`,
        ],
        dry_run_supported: true,
        authority_boundary: refsOnlyAuthorityBoundary(),
      }, progressFirstRouteRef(stageAttemptId))];
    }));
}
