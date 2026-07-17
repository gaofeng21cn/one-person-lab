import { frameworkAttentionNextSafeActions } from './framework-readiness-attention-actions.ts';
import {
  splitOperatorAttentionCountsWithSafeActionPayload,
} from './framework-readiness-attention-counts.ts';
import { frameworkReadinessBlockers } from './framework-readiness-blockers.ts';
import { FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS } from './framework-readiness-source-commands.ts';
import {
  frameworkDiagnosticDrilldowns,
} from './framework-readiness-static-surfaces.ts';
import { buildCurrentOwnerDeltaReadModel } from '../ledger/index.ts';
import { writeCurrentOwnerDeltaReadModelProjectionCache } from '../ledger/index.ts';
import {
  countValue as numberValue,
  type JsonRecord,
  record,
} from '../../kernel/json-record.ts';

export function frameworkAttentionFirstPayload(input: {
  status: string;
  semanticHygieneContractFloor: JsonRecord;
  hardBlockerCount: number;
  agentHardBlockerCount: number;
  generatedDefaultEntrySourceOfWorkBlockedCount: number;
  stageHardBlockerCount: number;
  packCompilerBlockerCount: number;
  diagnosticFailureCount: number;
  semanticAttentionGateCount: number;
  stageWarningCount: number;
  agentStructuralEvidenceTailCount: number;
  appLiveEvidenceTailCount: number;
  appLiveEvidenceTailRawCount?: number;
  appLiveEvidenceTailGuardedByProviderWorkerMutationCount?: number;
  stageReceiptFreshnessTailCount: number;
  stageSourceScopeMissingWorkorderCount: number;
  stageRuntimeEventMissingWorkorderCount: number;
  stageSourceScopeMissingRefCount: number;
  stageRuntimeEventMissingRefCount: number;
  stageEvidenceWorkorderAttentionItems: JsonRecord[];
  stageReplayMissingReceiptWorkorderCount: number;
  stageReplayMissingReceiptRefCount: number;
  stageReplayMissingHumanGateRefCount: number;
  stageReplayMissingReceiptWorkorderAttentionSummary: JsonRecord;
  stageReplayMissingReceiptWorkorderAttentionItems: JsonRecord[];
  ownerPayloadGroupAttentionCount: number;
  ownerPayloadGroupAttentionOmittedCount: number;
  ownerPayloadGroups: JsonRecord[];
  ownerDeltaFirst: JsonRecord;
  ownerDeltaHandoffSummary: JsonRecord;
  domainOwnerPayloadSummaryAttention: JsonRecord;
  ownerHandoffPacket: JsonRecord;
  memoryArtifactLifecycleEvidence: JsonRecord;
  appReleaseUserPathEvidence: JsonRecord;
  developerModeLiveCloseoutEvidence: JsonRecord;
  workstreamOperatingLoop: JsonRecord;
  familyStallLineage: JsonRecord;
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
  const developerModeLiveCloseoutAttentionCount =
    numberValue(input.developerModeLiveCloseoutEvidence.attention_count);
  const attentionCounts = splitOperatorAttentionCountsWithSafeActionPayload({
    openTailCount,
    evidenceEnvelopeOpenCount: input.evidenceEnvelopeOpenCount,
    evidenceEnvelopeBlockedCount: input.evidenceEnvelopeBlockedCount,
    domainDispatchAttentionCount: input.domainDispatchAttentionCount,
    stageSourceScopeMissingWorkorderCount: input.stageSourceScopeMissingWorkorderCount,
    stageRuntimeEventMissingWorkorderCount: input.stageRuntimeEventMissingWorkorderCount,
    developerModeLiveCloseoutAttentionCount,
    openSafeActionPayloadRequiredCount: input.openSafeActionPayloadRequiredCount,
    openSafeActionPayloadFreeCount: input.openSafeActionPayloadFreeCount,
  });
  const domainOwnerPayloadSummaryNamingHygieneBlockerCount =
    numberValue(input.domainOwnerPayloadSummaryAttention.naming_hygiene_blocker_count);
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
    ...(input.diagnosticFailureCount > 0
      ? [{
          warning_id: 'framework_diagnostic_unavailable',
          count: input.diagnosticFailureCount,
          drilldown_ref: '/framework_readiness/diagnostic_failures',
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
      developerModeLiveCloseoutAttentionCount > 0
      ? [{
          warning_id: 'developer_mode_live_closeout_evidence',
          count: developerModeLiveCloseoutAttentionCount,
          missing_live_ledger_route_count:
            numberValue(input.developerModeLiveCloseoutEvidence.missing_live_ledger_route_count),
          pending_verify_receipt_ref_count:
            numberValue(input.developerModeLiveCloseoutEvidence.pending_verify_receipt_ref_count),
          drilldown_ref: '/framework_readiness/developer_mode_live_closeout_evidence',
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
  ];
  const nextSafeActions = frameworkAttentionNextSafeActions({
    blockers,
    warnings,
    operatorActionableAttentionCount: attentionCounts.operatorActionableAttentionCount,
    domainBlockedAttentionCount: attentionCounts.domainBlockedAttentionCount,
    ownerPayloadGroups: input.ownerPayloadGroups,
    ownerHandoffPacket: input.ownerHandoffPacket,
    appReleaseUserPathEvidence: input.appReleaseUserPathEvidence,
    developerModeLiveCloseoutEvidence: input.developerModeLiveCloseoutEvidence,
    familyStallLineage: input.familyStallLineage,
    domainDispatchEvidenceWorkorderGroupAttentionItems:
      input.domainDispatchEvidenceWorkorderGroupAttentionItems,
    stageReplayMissingReceiptWorkorderAttentionItems:
      input.stageReplayMissingReceiptWorkorderAttentionItems,
    itemLimit: 5,
  });
  const currentOwnerDeltaReadModel = buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: input.ownerDeltaFirst,
    nextSafeAction: nextSafeActions[0],
    countSummary: {
      openSafeActionCount: numberValue(record(input.ownerDeltaHandoffSummary.summary).open_safe_action_item_count),
      payloadRequiredCount: numberValue(record(input.ownerDeltaHandoffSummary.summary).open_safe_action_payload_required_item_count),
      payloadFreeCount: numberValue(record(input.ownerDeltaHandoffSummary.summary).open_safe_action_payload_free_item_count),
      blockedRefsOnlyCount: attentionCounts.domainBlockedAttentionCount,
      evidenceEnvelopeOpenCount: input.evidenceEnvelopeOpenCount,
      evidenceEnvelopeBlockedCount: input.evidenceEnvelopeBlockedCount,
      domainDispatchWorkorderCount:
        numberValue(input.domainDispatchEvidenceWorkorderSummary.workorder_count),
      stageReplayMissingReceiptWorkorderCount:
        input.stageReplayMissingReceiptWorkorderCount,
    },
    fullDetailRefs: {
      owner_delta_first_ref: '/framework_readiness/owner_delta_first',
      owner_handoff_packet_ref: '/framework_readiness/owner_handoff_packet',
      evidence_worklist_ref: '/framework_readiness/evidence_worklist',
      app_operator_drilldown_ref:
        'opl runtime app-operator-drilldown --detail full --json',
    },
  });
  writeCurrentOwnerDeltaReadModelProjectionCache({
    readModel: currentOwnerDeltaReadModel,
    sourceSurface: 'framework_readiness',
    sourceCommand: 'opl framework readiness --family-defaults --json',
  });

  return {
    surface_kind: 'opl_framework_readiness_attention_first_payload',
    status: input.status,
    summary: {
      hard_blocker_count: input.hardBlockerCount,
      agent_conformance_hard_blocker_count: input.agentHardBlockerCount,
      generated_default_entry_source_of_work_blocked_count:
        input.generatedDefaultEntrySourceOfWorkBlockedCount,
      stage_readiness_hard_blocker_count: input.stageHardBlockerCount,
      pack_compiler_hard_blocker_count: input.packCompilerBlockerCount,
      diagnostic_failure_count: input.diagnosticFailureCount,
      warning_count: warnings.length,
      recommendation_count: warnings.length,
      open_tail_count: openTailCount,
      agent_structural_evidence_tail_open_count: input.agentStructuralEvidenceTailCount,
      app_live_evidence_tail_raw_open_count:
        numberValue(input.appLiveEvidenceTailRawCount ?? input.appLiveEvidenceTailCount),
      app_live_evidence_tail_open_count: input.appLiveEvidenceTailCount,
      app_live_evidence_tail_guarded_by_provider_worker_mutation_count:
        numberValue(input.appLiveEvidenceTailGuardedByProviderWorkerMutationCount),
      stage_receipt_freshness_tail_open_count: input.stageReceiptFreshnessTailCount,
      stage_source_scope_missing_workorder_count: input.stageSourceScopeMissingWorkorderCount,
      stage_runtime_event_missing_workorder_count: input.stageRuntimeEventMissingWorkorderCount,
      stage_source_scope_missing_ref_count: input.stageSourceScopeMissingRefCount,
      stage_runtime_event_missing_ref_count: input.stageRuntimeEventMissingRefCount,
      stage_replay_missing_receipt_workorder_count:
        input.stageReplayMissingReceiptWorkorderCount,
      stage_replay_missing_receipt_ref_count:
        input.stageReplayMissingReceiptRefCount,
      stage_replay_missing_human_gate_ref_count:
        input.stageReplayMissingHumanGateRefCount,
      evidence_envelope_open_count: input.evidenceEnvelopeOpenCount,
      evidence_envelope_blocked_count: input.evidenceEnvelopeBlockedCount,
      evidence_envelope_attention_count: evidenceEnvelopeAttentionCount,
      domain_dispatch_attention_count: input.domainDispatchAttentionCount,
      domain_owner_payload_summary_naming_hygiene_blocker_count:
        domainOwnerPayloadSummaryNamingHygieneBlockerCount,
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
      workstream_operating_loop_workstream_count:
        numberValue(record(input.workstreamOperatingLoop.summary).workstream_count),
      workstream_operating_loop_artifact_first_review_available_count:
        numberValue(record(input.workstreamOperatingLoop.summary).artifact_first_review_available_count),
      workstream_operating_loop_goal_oracle_missing_count:
        numberValue(record(input.workstreamOperatingLoop.summary).goal_oracle_missing_count),
      workstream_operating_loop_goal_oracle_target_anchor_observed_count:
        numberValue(record(input.workstreamOperatingLoop.summary).goal_oracle_target_anchor_observed_count),
      workstream_operating_loop_deliverable_target_ref_observed_count:
        numberValue(record(input.workstreamOperatingLoop.summary).deliverable_target_ref_observed_count),
      workstream_operating_loop_goal_oracle_advisory_count:
        numberValue(record(input.workstreamOperatingLoop.summary).goal_oracle_advisory_count),
      owner_delta_handoff_status:
        input.ownerDeltaHandoffSummary.status ?? null,
      owner_delta_handoff_current_operator_action_state:
        input.ownerDeltaHandoffSummary.current_operator_action_state ?? null,
      owner_delta_handoff_next_owner:
        input.ownerDeltaHandoffSummary.next_owner ?? null,
    },
    semantic_hygiene_contract_floor: input.semanticHygieneContractFloor,
    stage_evidence_workorder_attention_items: input.stageEvidenceWorkorderAttentionItems,
    stage_replay_missing_receipt_workorder_attention_summary:
      input.stageReplayMissingReceiptWorkorderAttentionSummary,
    stage_replay_missing_receipt_workorder_attention_items:
      input.stageReplayMissingReceiptWorkorderAttentionItems,
    current_owner_delta: currentOwnerDeltaReadModel.current_owner_delta,
    current_owner_delta_read_model: currentOwnerDeltaReadModel,
    owner_delta_first: input.ownerDeltaFirst,
    owner_delta_handoff_summary: input.ownerDeltaHandoffSummary,
    owner_payload_group_attention_policy:
      'top_owner_payload_groups_by_open_then_blocked_counts_refs_only',
    owner_payload_group_attention_count: input.ownerPayloadGroupAttentionCount,
    owner_payload_group_attention_omitted_count: input.ownerPayloadGroupAttentionOmittedCount,
    owner_payload_groups: input.ownerPayloadGroups,
    domain_owner_payload_summary_attention: {
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
      ...input.domainOwnerPayloadSummaryAttention,
    },
    owner_handoff_packet: input.ownerHandoffPacket,
    memory_artifact_lifecycle_evidence: input.memoryArtifactLifecycleEvidence,
    app_release_user_path_evidence:
      input.appReleaseUserPathEvidence,
    developer_mode_live_closeout_evidence:
      input.developerModeLiveCloseoutEvidence,
    workstream_operating_loop:
      input.workstreamOperatingLoop,
    family_stall_lineage: input.familyStallLineage,
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
