import { frameworkAttentionNextSafeActions } from './framework-readiness-attention-actions.ts';
import {
  splitOperatorAttentionCountsWithSafeActionPayload,
} from './framework-readiness-attention-counts.ts';
import { frameworkReadinessBlockers } from './framework-readiness-blockers.ts';
import { FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS } from './framework-readiness-source-commands.ts';
import {
  frameworkDiagnosticDrilldowns,
} from './framework-readiness-static-surfaces.ts';

type JsonRecord = Record<string, unknown>;

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function frameworkAttentionFirstPayload(input: {
  status: string;
  semanticHygieneContractFloor: JsonRecord;
  hardBlockerCount: number;
  agentHardBlockerCount: number;
  stageHardBlockerCount: number;
  packCompilerBlockerCount: number;
  diagnosticFailureCount: number;
  semanticAttentionGateCount: number;
  stageWarningCount: number;
  agentStructuralEvidenceTailCount: number;
  appLiveEvidenceTailCount: number;
  stageReceiptFreshnessTailCount: number;
  stageSourceScopeMissingWorkorderCount: number;
  stageRuntimeEventMissingWorkorderCount: number;
  stageSourceScopeMissingRefCount: number;
  stageRuntimeEventMissingRefCount: number;
  stageEvidenceWorkorderAttentionItems: JsonRecord[];
  ownerPayloadGroupAttentionCount: number;
  ownerPayloadGroupAttentionOmittedCount: number;
  ownerPayloadGroups: JsonRecord[];
  ownerHandoffPacket: JsonRecord;
  memoryArtifactLifecycleEvidence: JsonRecord;
  appReleaseUserPathEvidence: JsonRecord;
  omaProductionConsumptionFollowthrough: JsonRecord;
  domainDispatchEvidenceWorkorderGroupAttentionItems: JsonRecord[];
  domainDispatchEvidenceWorkorderAttentionItems: JsonRecord[];
  domainDispatchEvidenceWorkorderSummary: JsonRecord;
  evidenceEnvelopeOpenCount: number;
  evidenceEnvelopeBlockedCount: number;
  domainDispatchAttentionCount: number;
  openSafeActionPayloadRequiredCount?: number;
  openSafeActionPayloadFreeCount?: number;
  domainBlockedTypedBlockerRefCount: number;
  domainBlockedUniqueTypedBlockerRefCount: number;
  domainBlockedTypedBlockerGroupCount: number;
  domainBlockedAttentionGroupingSemantics: unknown;
  providerSloCadenceWindowStatus: unknown;
  providerSloCapabilityStatus: unknown;
}) {
  const openTailCount = input.agentStructuralEvidenceTailCount
    + input.appLiveEvidenceTailCount
    + input.stageReceiptFreshnessTailCount;
  const evidenceEnvelopeAttentionCount = input.evidenceEnvelopeOpenCount + input.evidenceEnvelopeBlockedCount;
  const attentionCounts = splitOperatorAttentionCountsWithSafeActionPayload({
    openTailCount,
    evidenceEnvelopeOpenCount: input.evidenceEnvelopeOpenCount,
    evidenceEnvelopeBlockedCount: input.evidenceEnvelopeBlockedCount,
    domainDispatchAttentionCount: input.domainDispatchAttentionCount,
    stageSourceScopeMissingWorkorderCount: input.stageSourceScopeMissingWorkorderCount,
    stageRuntimeEventMissingWorkorderCount: input.stageRuntimeEventMissingWorkorderCount,
    openSafeActionPayloadRequiredCount: input.openSafeActionPayloadRequiredCount,
    openSafeActionPayloadFreeCount: input.openSafeActionPayloadFreeCount,
  });
  const omaOpenGateCount = numberValue(input.omaProductionConsumptionFollowthrough.open_gate_count);
  const omaPendingVerifyLongSoakCount =
    numberValue(input.omaProductionConsumptionFollowthrough.pending_verify_long_soak_receipt_ref_count);
  const blockers = frameworkReadinessBlockers(input);
  const warnings = [
    ...(input.semanticAttentionGateCount > 0
      ? [{
          warning_id: 'semantic_hygiene_attention_required',
          count: input.semanticAttentionGateCount,
          drilldown_ref: '/framework_readiness/semantic_hygiene',
        }]
      : []),
    ...(input.stageWarningCount > 0
      ? [{
          warning_id: 'stage_readiness_advisory_warnings',
          count: input.stageWarningCount,
          drilldown_ref: '/framework_readiness/stages',
        }]
      : []),
    ...(openTailCount > 0
      ? [{
          warning_id: 'framework_evidence_tail_attention',
          count: openTailCount,
          drilldown_ref: '/framework_readiness/evidence_tails',
        }]
      : []),
    ...(evidenceEnvelopeAttentionCount > 0
      ? [{
          warning_id: 'evidence_envelope_attention',
          count: evidenceEnvelopeAttentionCount,
          open_count: input.evidenceEnvelopeOpenCount,
          blocked_count: input.evidenceEnvelopeBlockedCount,
          drilldown_ref: '/framework_readiness/evidence_envelope',
        }]
      : []),
    ...(input.domainDispatchAttentionCount > 0
      ? [{
          warning_id: 'domain_dispatch_attention',
          count: input.domainDispatchAttentionCount,
          drilldown_ref: '/framework_readiness/domain_dispatch_attention',
        }]
      : []),
    ...(
      numberValue(input.appReleaseUserPathEvidence.open_gate_count) > 0
        || numberValue(input.appReleaseUserPathEvidence.pending_verify_receipt_ref_count) > 0
      ? [{
          warning_id: 'app_release_user_path_evidence',
          count: numberValue(input.appReleaseUserPathEvidence.open_gate_count)
            + numberValue(input.appReleaseUserPathEvidence.pending_verify_receipt_ref_count),
          open_gate_count: numberValue(input.appReleaseUserPathEvidence.open_gate_count),
          pending_verify_receipt_ref_count:
            numberValue(input.appReleaseUserPathEvidence.pending_verify_receipt_ref_count),
          drilldown_ref: '/framework_readiness/app_release_user_path_evidence',
        }]
      : []),
    ...(omaOpenGateCount + omaPendingVerifyLongSoakCount > 0
      ? [{
          warning_id: 'oma_production_consumption_followthrough',
          count: omaOpenGateCount + omaPendingVerifyLongSoakCount,
          open_gate_count: omaOpenGateCount,
          pending_verify_long_soak_receipt_ref_count: omaPendingVerifyLongSoakCount,
          drilldown_ref: '/framework_readiness/oma_production_consumption_followthrough',
        }]
      : []),
  ];
  const nextSafeActions = frameworkAttentionNextSafeActions({
    blockers,
    warnings,
    operatorActionableAttentionCount: attentionCounts.operatorActionableAttentionCount,
    domainBlockedAttentionCount: attentionCounts.domainBlockedAttentionCount,
    ownerPayloadGroups: input.ownerPayloadGroups,
    ownerHandoffPacket: input.ownerHandoffPacket,
    appReleaseUserPathEvidence: input.appReleaseUserPathEvidence,
    omaProductionConsumptionFollowthrough: input.omaProductionConsumptionFollowthrough,
    domainDispatchEvidenceWorkorderGroupAttentionItems:
      input.domainDispatchEvidenceWorkorderGroupAttentionItems,
    itemLimit: 5,
  });

  return {
    surface_kind: 'opl_framework_readiness_attention_first_payload',
    status: input.status,
    summary: {
      hard_blocker_count: input.hardBlockerCount,
      agent_conformance_hard_blocker_count: input.agentHardBlockerCount,
      stage_readiness_hard_blocker_count: input.stageHardBlockerCount,
      pack_compiler_hard_blocker_count: input.packCompilerBlockerCount,
      diagnostic_hard_blocker_count: input.diagnosticFailureCount,
      warning_count: warnings.length,
      recommendation_count: warnings.length,
      open_tail_count: openTailCount,
      agent_structural_evidence_tail_open_count: input.agentStructuralEvidenceTailCount,
      app_live_evidence_tail_open_count: input.appLiveEvidenceTailCount,
      stage_receipt_freshness_tail_open_count: input.stageReceiptFreshnessTailCount,
      stage_source_scope_missing_workorder_count: input.stageSourceScopeMissingWorkorderCount,
      stage_runtime_event_missing_workorder_count: input.stageRuntimeEventMissingWorkorderCount,
      stage_source_scope_missing_ref_count: input.stageSourceScopeMissingRefCount,
      stage_runtime_event_missing_ref_count: input.stageRuntimeEventMissingRefCount,
      evidence_envelope_open_count: input.evidenceEnvelopeOpenCount,
      evidence_envelope_blocked_count: input.evidenceEnvelopeBlockedCount,
      evidence_envelope_attention_count: evidenceEnvelopeAttentionCount,
      domain_dispatch_attention_count: input.domainDispatchAttentionCount,
      operator_actionable_attention_tail_count: attentionCounts.operatorActionableAttentionCount,
      operator_payload_required_attention_tail_count: attentionCounts.operatorPayloadRequiredAttentionCount,
      operator_payload_free_attention_tail_count: attentionCounts.operatorPayloadFreeAttentionCount,
      domain_blocked_attention_tail_count: attentionCounts.domainBlockedAttentionCount,
      domain_blocked_typed_blocker_ref_count: input.domainBlockedTypedBlockerRefCount,
      domain_blocked_unique_typed_blocker_ref_count: input.domainBlockedUniqueTypedBlockerRefCount,
      domain_blocked_typed_blocker_group_count: input.domainBlockedTypedBlockerGroupCount,
      domain_blocked_attention_grouping_semantics:
        input.domainBlockedAttentionGroupingSemantics ?? null,
      total_operator_attention_tail_count: attentionCounts.totalAttentionCount,
      attention_tail_semantics: attentionCounts.semantics,
      attention_payload_requirement_semantics: attentionCounts.payloadRequirementSemantics,
      provider_slo_cadence_window_status: input.providerSloCadenceWindowStatus ?? null,
      provider_slo_capability_status: input.providerSloCapabilityStatus ?? null,
    },
    semantic_hygiene_contract_floor: input.semanticHygieneContractFloor,
    stage_evidence_workorder_attention_items: input.stageEvidenceWorkorderAttentionItems,
    owner_payload_group_attention_policy:
      'top_owner_payload_groups_by_open_then_blocked_counts_refs_only',
    owner_payload_group_attention_count: input.ownerPayloadGroupAttentionCount,
    owner_payload_group_attention_omitted_count: input.ownerPayloadGroupAttentionOmittedCount,
    owner_payload_groups: input.ownerPayloadGroups,
    owner_handoff_packet: input.ownerHandoffPacket,
    memory_artifact_lifecycle_evidence: input.memoryArtifactLifecycleEvidence,
    app_release_user_path_evidence:
      input.appReleaseUserPathEvidence,
    oma_production_consumption_followthrough:
      input.omaProductionConsumptionFollowthrough,
    domain_dispatch_evidence_workorder_packet_summary:
      input.domainDispatchEvidenceWorkorderSummary,
    domain_dispatch_evidence_workorder_group_attention_policy:
      'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
    domain_dispatch_evidence_workorder_group_attention_items:
      input.domainDispatchEvidenceWorkorderGroupAttentionItems,
    domain_dispatch_evidence_workorder_route_attention_fallback_policy:
      input.domainDispatchEvidenceWorkorderGroupAttentionItems.length > 0
        ? 'route_workorders_available_in_evidence_worklist_and_full_drilldown_group_guidance_is_default'
        : 'route_workorders_used_only_when_owner_stage_group_guidance_is_unavailable',
    domain_dispatch_evidence_workorder_attention_items:
      input.domainDispatchEvidenceWorkorderGroupAttentionItems.length > 0
        ? []
        : input.domainDispatchEvidenceWorkorderAttentionItems,
    blockers,
    warnings,
    recommendations: warnings,
    next_safe_actions: nextSafeActions,
    kernel_floor_ref: '/framework_readiness/kernel_floor',
    diagnostic_drilldown_refs: frameworkDiagnosticDrilldowns(SOURCE_COMMANDS)
      .map((lens) => lens.embedded_payload_ref),
    claim_policy:
      'attention_payload_reports_operator_work_only_and_emits_no_domain_quality_artifact_or_production_ready_verdict',
  };
}
