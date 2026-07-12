import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary as refsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import {
  record,
  recordList,
  stringValue,
  uniqueRefs,
  uniqueStrings,
} from './value-utils.ts';

const RUNNING_PROVIDER_ATTEMPT_SUMMARY_SAMPLE_LIMIT = 5;

type DrilldownActionRef = JsonRecord & {
  ref: string;
  role?: string | null;
};

function nonAdvancingApplyStateFromReadback(readback: JsonRecord) {
  const metadata = record(readback.domain_progress_transition_projection_metadata);
  const nonAdvancingReadback =
    record(readback.domain_progress_transition_non_advancing_apply_readback);
  const currentAction = record(recordList(readback.studies)[0]?.current_control_action);
  const status = stringValue(currentAction.status)
    ?? stringValue(nonAdvancingReadback.status)
    ?? 'transition_non_advancing_apply_recorded';
  return {
    surface_kind: 'opl_app_drilldown_current_control_state',
    projection_source: 'opl_current_control_state_latest_readback',
    source_ref: stringValue(readback.source_ref),
    domain_id: stringValue(readback.domain_id) ?? 'unknown',
    study_id:
      stringValue(readback.study_id)
      ?? stringValue(recordList(readback.studies)[0]?.study_id)
      ?? stringValue(nonAdvancingReadback.study_id),
    reconciliation_status: status,
    current_attempt_state: 'blocked',
    current_control_refresh_source:
      stringValue(readback.current_control_refresh_source),
    provider_admission_pending_count: readback.provider_admission_pending_count,
    transition_request_pending_count: readback.transition_request_pending_count,
    current_executable_owner_action: null,
    non_advancing_apply: metadata.non_advancing_apply === true
      || currentAction.non_advancing_apply === true,
    provider_admission_allowed: metadata.provider_admission_allowed === true,
    current_executable_owner_action_allowed:
      metadata.current_executable_owner_action_allowed === true,
    deliverable_progress_delta: metadata.deliverable_progress_delta === true,
    runtime_readback_status:
      stringValue(metadata.runtime_readback_status)
      ?? stringValue(record(nonAdvancingReadback.runtime_live_readback).runtime_readback_status),
    transaction_complete: metadata.transaction_complete === true
      || record(nonAdvancingReadback.runtime_live_readback).transaction_complete === true,
    domain_progress_transition_projection_metadata: metadata,
    domain_progress_transition_non_advancing_apply_readback: nonAdvancingReadback,
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      reads_domain_latest_or_dispatch_latest: false,
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_domain_ready: false,
      can_claim_publication_ready: false,
      can_claim_artifact_ready: false,
      provider_completion_is_domain_ready: false,
      deliverable_progress_delta: false,
    },
  } as JsonRecord;
}

function currentControlStates(input: {
  attempts: JsonRecord[];
  currentControlReadbacks?: JsonRecord[];
}) {
  const attemptStates = input.attempts
    .map((attempt) => record(attempt.current_control_state))
    .filter((state) => Object.keys(state).length > 0);
  const readbackStates = (input.currentControlReadbacks ?? [])
    .map(record)
    .filter((state) => Object.keys(record(state.domain_progress_transition_projection_metadata)).length > 0)
    .map(nonAdvancingApplyStateFromReadback);
  return [...attemptStates, ...readbackStates];
}

export function currentControlStateProjection(input: {
  attempts: JsonRecord[];
  currentControlReadbacks?: JsonRecord[];
}) {
  const states = currentControlStates(input);
  const blockedStates = states.filter((state) => {
    const status = stringValue(state.reconciliation_status);
    return status?.startsWith('blocked_') || stringValue(state.current_attempt_state) === 'blocked';
  });
  const runningStates = states.filter((state) => state.running_provider_attempt === true);
  const nonAdvancingApplyStates = states.filter((state) => state.non_advancing_apply === true);
  const allRunningDomainIds = uniqueStrings(runningStates
    .map((state) => stringValue(state.domain_id))
    .filter((domainId): domainId is string => Boolean(domainId)));
  const allRunningTaskKinds = uniqueStrings(runningStates
    .map((state) => stringValue(state.task_kind))
    .filter((taskKind): taskKind is string => Boolean(taskKind)));
  const allRunningStageAttemptIds = uniqueStrings(runningStates
    .map((state) => stringValue(state.active_stage_attempt_id))
    .filter((stageAttemptId): stageAttemptId is string => Boolean(stageAttemptId)));
  const runningHeartbeatTimes = uniqueStrings(runningStates
    .map((state) => stringValue(record(state.provider_run).last_heartbeat_at))
    .filter((heartbeat): heartbeat is string => Boolean(heartbeat)));
  const latestRunningHeartbeatAt = runningHeartbeatTimes.sort().at(-1) ?? null;
  const runningDomainIds = allRunningDomainIds.slice(0, RUNNING_PROVIDER_ATTEMPT_SUMMARY_SAMPLE_LIMIT);
  const runningTaskKinds = allRunningTaskKinds.slice(0, RUNNING_PROVIDER_ATTEMPT_SUMMARY_SAMPLE_LIMIT);
  const runningStageAttemptIds = allRunningStageAttemptIds.slice(
    0,
    RUNNING_PROVIDER_ATTEMPT_SUMMARY_SAMPLE_LIMIT,
  );
  return {
    surface_kind: 'opl_app_drilldown_current_control_state_projection',
    projection_policy: 'opl_reconciled_projection_only_no_domain_ready_publication_ready_or_artifact_ready',
    states,
    summary: {
      current_control_state_count: states.length,
      blocked_control_state_count: blockedStates.length,
      accepted_typed_closeout_count: states.filter((state) =>
        stringValue(state.reconciliation_status) === 'accepted_typed_closeout'
      ).length,
      running_control_state_count: runningStates.length,
      running_provider_attempt_count: runningStates.length,
      running_provider_attempt_domain_ids: runningDomainIds,
      running_provider_attempt_domain_id_omitted_count:
        Math.max(0, allRunningDomainIds.length - runningDomainIds.length),
      running_provider_attempt_task_kinds: runningTaskKinds,
      running_provider_attempt_task_kind_omitted_count:
        Math.max(0, allRunningTaskKinds.length - runningTaskKinds.length),
      running_provider_attempt_stage_attempt_ids: runningStageAttemptIds,
      running_provider_attempt_stage_attempt_id_omitted_count:
        Math.max(0, allRunningStageAttemptIds.length - runningStageAttemptIds.length),
      latest_running_provider_heartbeat_at: latestRunningHeartbeatAt,
      running_provider_attempt_summary_policy:
        'refs_only_liveness_projection_no_domain_ready_publication_ready_or_artifact_ready',
      non_advancing_apply_readback_count: nonAdvancingApplyStates.length,
      non_advancing_apply_consumable_count: nonAdvancingApplyStates.filter((state) =>
        record(state.domain_progress_transition_projection_metadata).replay_audit_consumable === true
      ).length,
      non_advancing_apply_provider_admission_allowed_count:
        nonAdvancingApplyStates.filter((state) => state.provider_admission_allowed === true).length,
      non_advancing_apply_current_executable_owner_action_allowed_count:
        nonAdvancingApplyStates.filter((state) =>
          state.current_executable_owner_action_allowed === true
        ).length,
      non_advancing_apply_deliverable_progress_delta_count:
        nonAdvancingApplyStates.filter((state) => state.deliverable_progress_delta === true).length,
      non_advancing_apply_projection_policy:
        'diagnostic_readback_only_no_provider_admission_owner_action_or_deliverable_progress_delta',
    },
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      reads_domain_latest_or_dispatch_latest: false,
      can_execute_domain_action: false,
      provider_completion_is_domain_ready: false,
      can_claim_domain_ready: false,
      can_claim_publication_ready: false,
      can_claim_artifact_ready: false,
    },
  };
}

export function safeActionRefs(
  actionRefs: DrilldownActionRef[],
  lifecycleRefs: { refs: JsonRecord[] },
) {
  return uniqueRefs([
    ...actionRefs.map((ref) => ({
      ...ref,
      role: `route:${ref.role}`,
      can_execute: false,
    })),
    ...lifecycleRefs.refs
      .filter((ref) => ref.receipt_ref)
      .map((ref) => ({
        ref: ref.receipt_ref as string,
        role: 'lifecycle_cleanup_receipt_ref',
        domain_id: ref.domain_id,
        source_ref: ref.source_ref,
        can_execute: false,
    })),
  ]);
}
