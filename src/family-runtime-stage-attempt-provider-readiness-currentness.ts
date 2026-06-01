import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import type { inspectFamilyRuntimeProviderWithLifecycle } from './family-runtime-providers.ts';
import type { stageAttemptToPayload } from './family-runtime-stage-attempt-ledger.ts';

export function buildStageAttemptCurrentProviderReadinessPayload(
  provider: Awaited<ReturnType<typeof inspectFamilyRuntimeProviderWithLifecycle>>,
  providerKind: FamilyRuntimeProviderKind,
) {
  return {
    surface_kind: 'stage_attempt_current_provider_readiness',
    provider_kind: providerKind,
    provider_ready: provider.ready,
    status: provider.status,
    degraded_reason: provider.degraded_reason,
    capabilities: provider.capabilities,
    details: provider.details,
    provider_receipt_is_creation_time_snapshot: true,
    authority_boundary: {
      opl: 'current_provider_lifecycle_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export function providerReadinessCurrentness(
  currentProviderReadiness:
    | ReturnType<typeof buildStageAttemptCurrentProviderReadinessPayload>
    | Record<string, unknown>
    | null,
  refs: {
    currentProviderReadinessRef: string;
    creationReceiptRef: string;
  },
) {
  return {
    surface_kind: 'stage_attempt_provider_readiness_currentness',
    effective_provider_readiness_source: 'current_provider_readiness',
    creation_receipt_currentness: 'creation_time_snapshot',
    provider_receipt_is_current_readiness: false,
    current_provider_readiness_ref: currentProviderReadiness
      ? refs.currentProviderReadinessRef
      : null,
    creation_receipt_ref: refs.creationReceiptRef,
    progress_first_effect:
      'operator_status_must_use_current_provider_readiness_for_live_provider_liveness',
    authority_boundary: {
      opl: 'provider_readiness_currentness_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

export function attachProviderCurrentness(
  attempt: ReturnType<typeof stageAttemptToPayload>,
  currentProviderReadiness:
    | ReturnType<typeof buildStageAttemptCurrentProviderReadinessPayload>
    | null,
) {
  return {
    ...attempt,
    current_provider_readiness: currentProviderReadiness,
    provider_readiness_currentness: providerReadinessCurrentness(currentProviderReadiness, {
      currentProviderReadinessRef: 'attempt.current_provider_readiness',
      creationReceiptRef: 'attempt.provider_receipt',
    }),
  };
}
