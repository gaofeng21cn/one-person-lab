import { FrameworkContractError } from '../contracts.ts';

export type ProviderOnlyRedriveKind =
  | 'provider_transport_blocked'
  | 'provider_transport_terminal'
  | 'refs_only_checkpoint_missing_launch_authorization'
  | 'retry_budget_provider_transport'
  | 'blocked_semantic_noop';

export function providerOnlyRedriveProtocol(redriveKind: ProviderOnlyRedriveKind) {
  return {
    surface_kind: 'opl_provider_only_redrive_protocol',
    protocol: 'provider_transport_only',
    redrive_kind: redriveKind,
    allowed_failure_classes: [
      'temporal_network_provider_transport_failure',
      'refs_only_checkpoint_missing_launch_authorization',
      'retry_budget_provider_transport_failure',
    ],
    provider_transport_only: true,
    domain_truth_mutation: false,
    owner_receipt_created: false,
    typed_blocker_created: false,
    domain_progress_claim: false,
  };
}

export function providerOnlyRedriveAuthorityBoundary(
  opl: string,
  extra: Record<string, unknown> = {},
) {
  return {
    opl,
    domain: 'truth_quality_artifact_gate_owner',
    provider_transport_only: true,
    domain_truth_mutation: false,
    owner_receipt_created: false,
    typed_blocker_created: false,
    domain_progress_claim: false,
    publication_quality_mutation: false,
    artifact_gate_mutation: false,
    current_package_mutation: false,
    ...extra,
  };
}

function redriveBlockedDetails(
  reason: string,
  details: Record<string, unknown> = {},
) {
  return {
    blocker_id: 'family_runtime_redrive_blocked',
    action: 'blocked_semantic_noop',
    reason,
    redrive_protocol: providerOnlyRedriveProtocol('blocked_semantic_noop'),
    authority_boundary: providerOnlyRedriveAuthorityBoundary(
      'provider_transport_redrive_blocked_semantic_noop',
      { provider_redrive_started: false },
    ),
    ...details,
  };
}

export function throwProviderOnlyRedriveBlocked(
  message: string,
  reason: string,
  details: Record<string, unknown> = {},
): never {
  throw new FrameworkContractError(
    'cli_usage_error',
    message,
    redriveBlockedDetails(reason, details),
  );
}

export function redriveResultBoundary(
  redriveKind: ProviderOnlyRedriveKind,
  opl: string,
  extra: Record<string, unknown> = {},
) {
  return {
    redrive_protocol: providerOnlyRedriveProtocol(redriveKind),
    authority_boundary: providerOnlyRedriveAuthorityBoundary(opl, extra),
  };
}
