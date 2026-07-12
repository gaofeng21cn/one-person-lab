import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary as refsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import {
  record,
  stringValue,
  uniqueRefs,
  uniqueStrings,
} from './value-utils.ts';

const RUNNING_PROVIDER_ATTEMPT_SUMMARY_SAMPLE_LIMIT = 5;

type DrilldownActionRef = JsonRecord & {
  ref: string;
  role?: string | null;
};

function currentControlStates(input: {
  attempts: JsonRecord[];
  currentControlReadbacks?: JsonRecord[];
}) {
  return input.attempts
    .map((attempt) => record(attempt.current_control_state))
    .filter((state) => Object.keys(state).length > 0);
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
      non_advancing_apply_consumable_count: 0,
      non_advancing_apply_provider_admission_allowed_count:
        nonAdvancingApplyStates.filter((state) => state.provider_admission_allowed === true).length,
      non_advancing_apply_current_executable_owner_action_allowed_count:
        nonAdvancingApplyStates.filter((state) =>
          state.current_executable_owner_action_allowed === true
        ).length,
      non_advancing_apply_paper_progress_delta_count:
        nonAdvancingApplyStates.filter((state) => state.paper_progress_delta === true).length,
      non_advancing_apply_projection_policy: 'retired_no_programmatic_transition_readback',
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
