import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundaryCore,
} from './authority-boundary.ts';
import { record, recordList, stringList, stringValue, uniqueRefs } from './value-utils.ts';

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
  ].filter((entry): entry is string => Boolean(entry));
  return [...new Set(missing)];
}

function attemptCommand(stageAttemptId: string) {
  return `opl family-runtime attempt query ${stageAttemptId}`;
}

function progressFirstRouteRef(stageAttemptId: string) {
  return `/stage_attempt_workbench/attempts/${stageAttemptId}/progress_first_supervision`;
}

export function buildProgressFirstSupervisionActionRoutes(input: {
  stageAttemptWorkbench: JsonRecord;
}) {
  const attempts = [
    ...recordList(input.stageAttemptWorkbench.evidence_attempts),
    ...recordList(input.stageAttemptWorkbench.attempts),
  ];
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
      const command = attemptCommand(stageAttemptId);
      return [{
        ref: progressFirstRouteRef(stageAttemptId),
        role: 'operator_action_route',
        action_id: `progress-first-supervision:${stageAttemptId}`,
        action_kind: 'progress_first_attempt_supervision',
        owner: 'opl',
        route_target_kind: 'opl_cli',
        execution_policy: 'opl_safe_action_shell',
        execution_surface: 'opl runtime action execute',
        can_execute: false as const,
        submit_via: 'opl runtime action execute',
        can_submit_to_safe_action_shell: true,
        default_actionable: true,
        route_status: 'progress_first_supervision_required',
        route_status_detail:
          'Active provider attempt is missing worker liveness, progress delta, stage log, or owner closeout signals; inspect the attempt before treating the lane as no-action.',
        stage_attempt_id: stageAttemptId,
        domain_id: stringValue(attempt.domain_id),
        stage_id: stringValue(attempt.stage_id),
        provider_kind: stringValue(attempt.provider_kind),
        task_id: stringValue(attempt.task_id),
        task_kind: stringValue(record(attempt.current_control_state).task_kind),
        attempt_status: attemptStatus(attempt),
        missing_progress_signals: missingSignals,
        progress_first_required_next_action:
          'Inspect the active attempt, worker readiness, stage_progress_log, and closeout refs; start or repair the worker first when liveness is missing, otherwise supervise progress or require domain typed closeout.',
        expected_refs: [
          `/stage_attempt_workbench/attempts/${stageAttemptId}/current_provider_readiness`,
          `/stage_attempt_workbench/attempts/${stageAttemptId}/stage_progress_log`,
          `/stage_attempt_workbench/attempts/${stageAttemptId}/current_control_state`,
        ],
        opl_cli_args: ['attempt', 'query', stageAttemptId],
        dry_run_supported: true,
        authority_boundary: refsOnlyAuthorityBoundary(),
      }];
    }));
}
