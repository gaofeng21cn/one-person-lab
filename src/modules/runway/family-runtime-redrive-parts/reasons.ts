import { throwProviderOnlyRedriveBlocked } from './protocol.ts';

export const PROVIDER_TRANSPORT_REDRIVE_REASONS = [
  'temporal_stage_attempt_start_failed',
  'temporal_stage_attempt_not_completed',
  'temporal_stage_attempt_failed',
] as const;
export const PROVIDER_TRANSPORT_OPERATOR_REDRIVE_REASONS = [
  ...PROVIDER_TRANSPORT_REDRIVE_REASONS,
  'temporal_stage_attempt_canceled',
] as const;
export const PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS = [
  ...PROVIDER_TRANSPORT_OPERATOR_REDRIVE_REASONS,
  'temporal_workflow_not_started_or_not_found',
] as const;
export const PAPER_MISSION_STAGE_ROUTE_PROVIDER_RUNTIME_REDRIVE_REASONS = [
  'typed_closeout_packet_required',
  'codex_cli_typed_closeout_not_materialized',
  'codex_cli_provider_unavailable',
] as const;
export const PROVIDER_RUNTIME_BLOCKER_REF_PATTERN = /^opl:\/\/stage-attempts\/[^/]+\/runtime-blockers\/[^/]+$/;

export type ProviderTransportRedriveReason = typeof PROVIDER_TRANSPORT_REDRIVE_REASONS[number];
export type ProviderTransportOperatorRedriveReason = typeof PROVIDER_TRANSPORT_OPERATOR_REDRIVE_REASONS[number];
export type ProviderStageAttemptRedriveReason = typeof PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS[number];
export type PaperMissionStageRouteCloseoutPacketRedriveReason =
  typeof PAPER_MISSION_STAGE_ROUTE_PROVIDER_RUNTIME_REDRIVE_REASONS[number];
export type ProviderTransportRedriveTrigger = 'operator' | 'auto';

export const STOP_LOSS_DOMAIN_BLOCKER_REASONS = new Set([
  'anti_loop_budget_exhausted',
  'progress_first_owner_delta_required',
]);

function providerTransportRedriveReasonsForTrigger(trigger: ProviderTransportRedriveTrigger) {
  return trigger === 'auto'
    ? PROVIDER_TRANSPORT_REDRIVE_REASONS
    : PROVIDER_TRANSPORT_OPERATOR_REDRIVE_REASONS;
}

export function assertProviderTransportRedriveReason(
  value: string | null,
  trigger: ProviderTransportRedriveTrigger,
): asserts value is ProviderTransportRedriveReason | ProviderTransportOperatorRedriveReason {
  const allowedReasons: readonly string[] = providerTransportRedriveReasonsForTrigger(trigger);
  if (!allowedReasons.includes(value ?? '')) {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive only supports blocked provider-transport default executor tasks.',
      STOP_LOSS_DOMAIN_BLOCKER_REASONS.has(value ?? '')
        ? 'same_lineage_stop_loss_domain_blocker'
        : 'non_provider_transport_blocker',
      {
        dead_letter_reason: value,
        allowed_dead_letter_reasons: allowedReasons,
      },
    );
  }
}

export function isProviderStageAttemptRedriveReason(value: string | null): value is ProviderStageAttemptRedriveReason {
  return PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS.includes(value as ProviderStageAttemptRedriveReason);
}
