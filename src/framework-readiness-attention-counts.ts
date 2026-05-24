export const ATTENTION_COUNT_SEMANTICS =
  'operator_actionable_plus_domain_blocked_refs_only_no_ready_claim';

function numberValue(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function splitOperatorAttentionCounts(input: {
  openTailCount?: number;
  evidenceEnvelopeOpenCount?: number;
  evidenceEnvelopeBlockedCount?: number;
  domainDispatchAttentionCount?: number;
  stageSourceScopeMissingWorkorderCount?: number;
  stageRuntimeEventMissingWorkorderCount?: number;
  appReleaseUserPathAttentionCount?: number;
  omaProductionConsumptionAttentionCount?: number;
  operatorPayloadRequiredAttentionCount?: number;
}) {
  const defaultPayloadRequiredAttentionCount =
    numberValue(input.evidenceEnvelopeOpenCount)
    + numberValue(input.stageSourceScopeMissingWorkorderCount)
    + numberValue(input.stageRuntimeEventMissingWorkorderCount)
    + numberValue(input.appReleaseUserPathAttentionCount)
    + numberValue(input.omaProductionConsumptionAttentionCount);
  const operatorActionableAttentionCount =
    numberValue(input.openTailCount)
    + numberValue(input.evidenceEnvelopeOpenCount)
    + numberValue(input.stageSourceScopeMissingWorkorderCount)
    + numberValue(input.stageRuntimeEventMissingWorkorderCount)
    + numberValue(input.appReleaseUserPathAttentionCount)
    + numberValue(input.omaProductionConsumptionAttentionCount);
  const domainBlockedAttentionCount =
    numberValue(input.evidenceEnvelopeBlockedCount)
    + numberValue(input.domainDispatchAttentionCount);
  const operatorPayloadRequiredAttentionCount = Math.min(
    operatorActionableAttentionCount,
    numberValue(input.operatorPayloadRequiredAttentionCount ?? defaultPayloadRequiredAttentionCount),
  );
  const operatorPayloadFreeAttentionCount = Math.max(
    operatorActionableAttentionCount - operatorPayloadRequiredAttentionCount,
    0,
  );
  return {
    operatorActionableAttentionCount,
    operatorPayloadRequiredAttentionCount,
    operatorPayloadFreeAttentionCount,
    domainBlockedAttentionCount,
    totalAttentionCount: operatorActionableAttentionCount + domainBlockedAttentionCount,
    semantics: ATTENTION_COUNT_SEMANTICS,
    payloadRequirementSemantics:
      'operator_actionable_payload_required_is_domain_or_app_live_refs_payload_subset_not_opl_self_closure',
  };
}

export function frameworkStatusFromAttentionCounts(input: {
  openTailCount?: number;
  operatorActionableAttentionCount?: number;
  domainBlockedAttentionCount?: number;
  semanticAttentionGateCount?: number;
  hardBlockerCount?: number;
}) {
  if (numberValue(input.hardBlockerCount) > 0) {
    return 'framework_control_plane_available_with_hard_blockers';
  }
  if (numberValue(input.openTailCount) > 0) {
    return 'framework_control_plane_available_with_open_production_tail';
  }
  if (
    numberValue(input.operatorActionableAttentionCount) > 0
    || numberValue(input.semanticAttentionGateCount) > 0
  ) {
    return 'framework_control_plane_available_with_operator_attention';
  }
  if (numberValue(input.domainBlockedAttentionCount) > 0) {
    return 'framework_control_plane_available_with_blocked_refs_only_attention';
  }
  return 'framework_control_plane_available';
}
