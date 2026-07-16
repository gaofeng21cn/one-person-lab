import {
  countValue as numberValue,
  record,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  appReleaseUserPathEvidenceSummary,
} from './app-release-user-path.ts';
import {
  codexAppRuntimeEvidenceSummary,
} from './codex-app-runtime-role.ts';
import {
  developerModeLiveCloseoutEvidenceSummary,
} from './developer-mode-live-closeout.ts';
import {
  listDomainOwnerPayloadSummaryReceipts,
} from '../../ledger/index.ts';

type AppOperatorDrilldownSummaryInput = {
  attempts: unknown[];
  domainRefs: unknown[];
  routeRefs: unknown[];
  decisionRefs: unknown[];
  reviewItems: unknown[];
  artifactRefs: unknown[];
  packageLifecycle: JsonRecord;
  memoryRefs: JsonRecord;
  qualityRefs: JsonRecord;
  providerActionRefs: unknown[];
  providerCadenceWindow: JsonRecord;
  providerCapabilitySlo: JsonRecord;
  providerLongSoakEvidence: JsonRecord;
  periodicRefs: JsonRecord;
  actionRefs: JsonRecord[];
  ownerReceipts: unknown[];
  typedBlockers: JsonRecord;
  domainDispatchEvidence: JsonRecord;
  stageProductionEvidence: JsonRecord;
  freshness: unknown[];
  refFamilies: JsonRecord;
  safeActions: unknown[];
  executionBridge: JsonRecord;
  lifecycleRefs: JsonRecord;
  functionalSummary: JsonRecord;
  evidenceRequests: JsonRecord;
  domainOwnerPayloadSummaryRefs: JsonRecord;
  ownerEvidenceSustainedConsumptionFollowthroughRefs: JsonRecord;
  productionEvidenceTailLedger: JsonRecord;
  legacyCleanupPlans: JsonRecord;
  standardAgentTemplateConsumption: JsonRecord;
  evidenceEnvelope: JsonRecord;
  runtimeManagerRouteSupport: JsonRecord;
  codexAppRuntimeRole: JsonRecord;
  appReleaseUserPathEvidence: JsonRecord;
  developerModeLiveCloseoutEvidence: JsonRecord;
  memoryArtifactLifecycleEvidenceProjection: JsonRecord;
};

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function countBy(values: JsonRecord[], predicate: (value: JsonRecord) => boolean) {
  return values.filter(predicate).length;
}

function stageProductionRecordRouteHasOpenObligation(ref: JsonRecord) {
  const summary = record(ref.evidence_obligation_summary);
  return numberValue(summary.open_count) > 0;
}

export function buildAppOperatorDrilldownSummary(input: AppOperatorDrilldownSummaryInput) {
  const packageRefs = list(input.packageLifecycle.package_refs);
  const exportRefs = list(input.packageLifecycle.export_refs);
  const memoryConsumedRefs = list(input.memoryRefs.consumed_memory_refs);
  const memoryWritebackRefs = list(input.memoryRefs.writeback_receipt_refs);
  const qualityRefs = list(input.qualityRefs.quality_refs);
  const readinessRefs = list(input.qualityRefs.readiness_refs);
  const typedBlockerRefs = list(input.typedBlockers.refs);
  const typedBlockers = list(input.typedBlockers.blockers);
  const domainDispatchSummary = record(input.domainDispatchEvidence.summary);
  const stageProductionSummary = record(input.stageProductionEvidence.summary);
  const refFamilySummary = record(input.refFamilies.summary);
  const executionBridgeSummary = record(input.executionBridge.summary);
  const lifecycleSummary = record(input.lifecycleRefs.summary);
  const evidenceRequestSummary = record(input.evidenceRequests.summary);
  const domainOwnerPayloadSummary = record(input.domainOwnerPayloadSummaryRefs.summary);
  const ownerEvidenceSustainedConsumptionSummary = record(
    input.ownerEvidenceSustainedConsumptionFollowthroughRefs.summary,
  );
  const productionTailSummary = record(input.productionEvidenceTailLedger.summary);
  const legacyCleanupSummary = record(input.legacyCleanupPlans.summary);
  const standardAgentTemplateSummary = record(input.standardAgentTemplateConsumption.summary);
  const standardAgentTemplateLedger = record(
    input.standardAgentTemplateConsumption.ledger_projection,
  );
  const evidenceEnvelopeSummary = record(input.evidenceEnvelope.summary);
  const appReleaseUserPathSummary =
    appReleaseUserPathEvidenceSummary(input.appReleaseUserPathEvidence);
  const developerModeLiveCloseoutSummary =
    developerModeLiveCloseoutEvidenceSummary(input.developerModeLiveCloseoutEvidence);
  const codexAppRuntimeEvidence =
    codexAppRuntimeEvidenceSummary(input.codexAppRuntimeRole);
  const memoryArtifactLifecycleProjection =
    record(input.memoryArtifactLifecycleEvidenceProjection);
  const memoryArtifactLifecycleProjectionObservedCounts =
    record(memoryArtifactLifecycleProjection.observed_ref_counts);
  const domainOwnerPayloadSummaryReceipts = listDomainOwnerPayloadSummaryReceipts();
  const domainOwnerPayloadSummaryRecordedReceiptCount =
    domainOwnerPayloadSummaryReceipts.filter((receipt) => receipt.receipt_status === 'recorded').length;
  const domainOwnerPayloadSummaryVerifiedReceiptCount =
    domainOwnerPayloadSummaryReceipts.filter((receipt) => receipt.receipt_status === 'verified').length;
  const routeSupport = record(input.runtimeManagerRouteSupport.domain_route_projection);
  const supportedTaskKinds = stringList(routeSupport.canonical_task_kinds);
  const productionEvidenceTailItemCount = numberValue(productionTailSummary.tail_item_count);
  const productionEvidenceTailOpenItemCount = numberValue(productionTailSummary.open_tail_item_count);
  const productionEvidenceTailOwnerGroupCount = numberValue(productionTailSummary.owner_group_count);
  const productionEvidenceTailBlockingItemCount = numberValue(productionTailSummary.blocking_tail_item_count);
  const domainDispatchOwnerReceiptRefCount = numberValue(domainDispatchSummary.owner_receipt_ref_count);
  const domainDispatchTypedBlockerRefCount = numberValue(domainDispatchSummary.typed_blocker_ref_count);
  const domainDispatchTypedBlockerCount = numberValue(domainDispatchSummary.typed_blocker_count);
  const stageTypedBlockerStageCount = numberValue(stageProductionSummary.stages_with_domain_typed_blocker_count);
  const stageBlockedObligationCount =
    numberValue(stageProductionSummary.evidence_obligation_blocked_by_domain_typed_blocker_count);
  const stageExpectedReceiptUnobservedCount =
    numberValue(stageProductionSummary.expected_receipt_unobserved_stage_count);
  const stageMonitorFreshnessUnobservedCount =
    numberValue(stageProductionSummary.monitor_freshness_unobserved_stage_count);
  const domainDispatchAttentionDomainCount = numberValue(stageProductionSummary.domain_count);
  const uncoveredExpectedReceiptStageCount = Math.max(
    0,
    stageExpectedReceiptUnobservedCount - stageTypedBlockerStageCount,
  );
  const uncoveredMonitorFreshnessStageCount = Math.max(
    0,
    stageMonitorFreshnessUnobservedCount - stageTypedBlockerStageCount,
  );
  const domainDispatchAttentionMissingOwnerChainCount = domainDispatchOwnerReceiptRefCount === 0
    ? Math.max(uncoveredExpectedReceiptStageCount, uncoveredMonitorFreshnessStageCount)
    : 0;
  const domainDispatchAttentionCount = (
    stageTypedBlockerStageCount + domainDispatchAttentionMissingOwnerChainCount
  );

  return {
    stage_attempt_count: input.attempts.length,
    domain_projection_ref_count: input.domainRefs.length,
    route_graph_ref_count: input.routeRefs.length,
    decision_map_ref_count: input.decisionRefs.length,
    review_repair_queue_item_count: input.reviewItems.length,
    artifact_gallery_item_count: input.artifactRefs.length,
    package_ref_count: packageRefs.length,
    export_ref_count: exportRefs.length,
    memory_ref_count: memoryConsumedRefs.length,
    memory_writeback_ref_count: memoryWritebackRefs.length,
    quality_ref_count: qualityRefs.length,
    readiness_ref_count: readinessRefs.length,
    provider_slo_action_count: input.providerActionRefs.length,
    runtime_manager_domain_route_support_task_kind_count: supportedTaskKinds.length,
    runtime_manager_domain_route_task_kind_prefix:
      stringValue(routeSupport.supported_task_kind_prefix),
    runtime_manager_domain_route_action_ref_source:
      stringValue(routeSupport.action_ref_source),
    provider_slo_cadence_window_status: input.providerCadenceWindow.window_status,
    provider_slo_cadence_window_long_evidence_ready: input.providerCadenceWindow.long_window_evidence_ready,
    provider_slo_cadence_window_expected_receipt_count: input.providerCadenceWindow.expected_slo_execution_receipt_count,
    provider_slo_cadence_window_observed_receipt_count: input.providerCadenceWindow.observed_slo_execution_receipt_count,
    provider_slo_cadence_window_missing_receipt_count: input.providerCadenceWindow.missing_slo_execution_receipt_count,
    provider_slo_cadence_window_blocked_repair_receipt_count: input.providerCadenceWindow.blocked_repair_receipt_count,
    provider_slo_capability_status: input.providerCapabilitySlo.status,
    provider_slo_capability_restart_requery_ready: input.providerCapabilitySlo.restart_requery_ready,
    provider_slo_capability_signal_history_ready: input.providerCapabilitySlo.signal_history_ready,
    provider_slo_capability_typed_closeout_claim_evidence_ready:
      input.providerCapabilitySlo.typed_closeout_claim_evidence_ready,
    provider_slo_capability_missing_closeout_diagnostic_ready: input.providerCapabilitySlo.missing_closeout_diagnostic_ready,
    provider_slo_capability_no_output_diagnostic_ready: input.providerCapabilitySlo.no_output_diagnostic_boundary_ready,
    provider_slo_capability_domain_truth_boundary_preserved: input.providerCapabilitySlo.domain_truth_boundary_preserved,
    provider_long_soak_evidence_status: input.providerLongSoakEvidence.status,
    provider_long_soak_evidence_ready_claim_authorized:
      input.providerLongSoakEvidence.ready_claim_authorized === true,
    provider_long_soak_evidence_production_ready_claim_status:
      input.providerLongSoakEvidence.production_ready_claim_status,
    provider_long_soak_evidence_verified_refs_only_ledger_counts_as_production_ready:
      input.providerLongSoakEvidence.verified_refs_only_ledger_counts_as_production_ready === true,
    provider_long_soak_evidence_long_evidence_ready_counts_as_production_ready:
      input.providerLongSoakEvidence.long_evidence_ready_counts_as_production_ready === true,
    provider_long_soak_evidence_capability_slo_satisfied_counts_as_production_ready:
      input.providerLongSoakEvidence.capability_slo_satisfied_counts_as_production_ready === true,
    provider_long_soak_evidence_receipt_ref_count:
      numberValue(input.providerLongSoakEvidence.receipt_count),
    provider_long_soak_evidence_recorded_receipt_ref_count:
      numberValue(input.providerLongSoakEvidence.recorded_receipt_ref_count),
    provider_long_soak_evidence_verified_receipt_ref_count:
      numberValue(input.providerLongSoakEvidence.verified_receipt_ref_count),
    provider_long_soak_evidence_pending_verify_receipt_ref_count:
      numberValue(input.providerLongSoakEvidence.pending_verify_receipt_ref_count),
    provider_long_soak_evidence_long_soak_ref_count:
      list(input.providerLongSoakEvidence.long_soak_refs).length,
    provider_long_soak_evidence_recovery_ref_count:
      list(input.providerLongSoakEvidence.recovery_refs).length,
    provider_long_soak_evidence_dead_letter_ref_count:
      list(input.providerLongSoakEvidence.dead_letter_refs).length,
    provider_long_soak_evidence_provider_blocker_ref_count:
      list(input.providerLongSoakEvidence.provider_blocker_refs).length,
    provider_long_soak_evidence_typed_blocker_ref_count:
      list(input.providerLongSoakEvidence.typed_blocker_refs).length,
    provider_long_soak_evidence_owner_acceptance_ref_count:
      list(input.providerLongSoakEvidence.owner_acceptance_refs).length,
    provider_cadence_window_status: input.providerCadenceWindow.window_status,
    provider_cadence_window_long_evidence_ready: input.providerCadenceWindow.long_window_evidence_ready,
    provider_cadence_window_expected_receipt_count: input.providerCadenceWindow.expected_slo_execution_receipt_count,
    provider_cadence_window_observed_receipt_count: input.providerCadenceWindow.observed_slo_execution_receipt_count,
    provider_cadence_window_missing_receipt_count: input.providerCadenceWindow.missing_slo_execution_receipt_count,
    provider_cadence_window_blocked_repair_receipt_count: input.providerCadenceWindow.blocked_repair_receipt_count,
    provider_capability_slo_status: input.providerCapabilitySlo.status,
    provider_capability_restart_requery_ready: input.providerCapabilitySlo.restart_requery_ready,
    provider_capability_signal_history_ready: input.providerCapabilitySlo.signal_history_ready,
    provider_capability_typed_closeout_claim_evidence_ready:
      input.providerCapabilitySlo.typed_closeout_claim_evidence_ready,
    provider_capability_missing_closeout_diagnostic_ready: input.providerCapabilitySlo.missing_closeout_diagnostic_ready,
    provider_capability_no_output_diagnostic_ready: input.providerCapabilitySlo.no_output_diagnostic_boundary_ready,
    provider_capability_domain_truth_boundary_preserved: input.providerCapabilitySlo.domain_truth_boundary_preserved,
    periodic_execution_ref_count: list(input.periodicRefs.refs).length,
    operator_action_route_count: input.actionRefs.length,
    operator_executable_route_count: countBy(input.actionRefs, (ref) => ref.execution_policy === 'opl_safe_action_shell'),
    opl_owned_action_route_count: countBy(input.actionRefs, (ref) => ref.owner === 'opl'),
    provider_owned_action_route_count: countBy(input.actionRefs, (ref) => ref.owner === 'provider'),
    domain_owned_action_route_count: countBy(input.actionRefs, (ref) => ref.owner === 'domain'),
    user_owned_action_route_count: countBy(input.actionRefs, (ref) => ref.owner === 'user'),
    owner_receipt_ref_count: input.ownerReceipts.length,
    typed_blocker_ref_count: typedBlockerRefs.length,
    typed_blocker_count: typedBlockers.length,
    domain_dispatch_evidence_domain_count: numberValue(domainDispatchSummary.domain_count),
    domain_dispatch_evidence_attempt_count: numberValue(domainDispatchSummary.attempt_count),
    domain_dispatch_evidence_dispatch_identity_group_count:
      numberValue(domainDispatchSummary.dispatch_identity_group_count),
    domain_dispatch_evidence_dispatch_supersession_identity_group_count:
      numberValue(domainDispatchSummary.dispatch_supersession_identity_group_count),
    domain_dispatch_evidence_current_default_actionable_attempt_count:
      numberValue(domainDispatchSummary.current_default_actionable_attempt_count),
    domain_dispatch_evidence_superseded_attempt_count:
      numberValue(domainDispatchSummary.superseded_attempt_count),
    domain_dispatch_evidence_owner_receipt_ref_count: domainDispatchOwnerReceiptRefCount,
    domain_dispatch_evidence_typed_blocker_ref_count: domainDispatchTypedBlockerRefCount,
    domain_dispatch_evidence_typed_blocker_count: domainDispatchTypedBlockerCount,
    domain_dispatch_evidence_no_regression_ref_count: numberValue(domainDispatchSummary.no_regression_evidence_ref_count),
    domain_dispatch_evidence_memory_writeback_ref_count: numberValue(domainDispatchSummary.memory_writeback_ref_count),
    domain_dispatch_evidence_domain_ready_claim_count: numberValue(domainDispatchSummary.domain_ready_claim_count),
    domain_dispatch_attention_domain_count: domainDispatchAttentionDomainCount,
    domain_dispatch_attention_owner_receipt_ref_count: domainDispatchOwnerReceiptRefCount,
    domain_dispatch_attention_direct_typed_blocker_ref_count: domainDispatchTypedBlockerRefCount,
    domain_dispatch_attention_direct_typed_blocker_count: domainDispatchTypedBlockerCount,
    domain_dispatch_attention_count: domainDispatchAttentionCount,
    domain_dispatch_attention_typed_blocker_stage_count: stageTypedBlockerStageCount,
    domain_dispatch_attention_blocked_obligation_count: stageBlockedObligationCount,
    domain_dispatch_attention_missing_owner_chain_count: domainDispatchAttentionMissingOwnerChainCount,
    domain_dispatch_attention_policy:
      'typed_blocker_stage_or_uncovered_missing_owner_chain_attention_only_no_domain_ready_claim',
    stage_production_evidence_domain_count: numberValue(stageProductionSummary.domain_count),
    stage_production_evidence_stage_count: numberValue(stageProductionSummary.stage_count),
    stage_production_evidence_observed_stage_count: numberValue(stageProductionSummary.observed_stage_count),
    stage_production_evidence_missing_caller_stage_count: numberValue(stageProductionSummary.missing_production_caller_stage_count),
    stage_production_evidence_missing_expected_receipt_stage_count: numberValue(stageProductionSummary.missing_expected_receipt_stage_count),
    stage_production_evidence_expected_receipt_declared_stage_count: numberValue(stageProductionSummary.expected_receipt_declared_stage_count),
    stage_production_evidence_expected_receipt_observed_stage_count: numberValue(stageProductionSummary.expected_receipt_observed_stage_count),
    stage_production_evidence_expected_receipt_unobserved_stage_count: numberValue(stageProductionSummary.expected_receipt_unobserved_stage_count),
    stage_production_evidence_missing_executor_binding_stage_count: numberValue(stageProductionSummary.missing_executor_binding_stage_count),
    stage_production_evidence_executor_binding_observed_stage_count: numberValue(stageProductionSummary.executor_binding_observed_stage_count),
    stage_production_evidence_missing_monitor_freshness_stage_count: numberValue(stageProductionSummary.missing_monitor_freshness_stage_count),
    stage_production_evidence_monitor_declared_stage_count: numberValue(stageProductionSummary.monitor_declared_stage_count),
    stage_production_evidence_monitor_freshness_observed_stage_count: numberValue(stageProductionSummary.monitor_freshness_observed_stage_count),
    stage_production_evidence_monitor_freshness_unobserved_stage_count: numberValue(stageProductionSummary.monitor_freshness_unobserved_stage_count),
    stage_production_evidence_stages_with_domain_typed_blocker_count: numberValue(stageProductionSummary.stages_with_domain_typed_blocker_count),
    stage_production_evidence_obligation_count: numberValue(stageProductionSummary.evidence_obligation_count),
    stage_production_evidence_obligation_closed_count: numberValue(stageProductionSummary.evidence_obligation_closed_count),
    stage_production_evidence_obligation_open_count: numberValue(stageProductionSummary.evidence_obligation_open_count),
    stage_production_evidence_obligation_blocked_by_domain_typed_blocker_count: numberValue(stageProductionSummary.evidence_obligation_blocked_by_domain_typed_blocker_count),
    stage_production_attempt_request_route_count: countBy(input.actionRefs, (ref) => ref.action_kind === 'stage_production_attempt_request'),
    stage_production_evidence_receipt_action_route_count: countBy(input.actionRefs, (ref) => (
      ref.action_kind === 'stage_production_evidence_receipt_record'
      || ref.action_kind === 'stage_production_evidence_receipt_verify'
    )),
    stage_production_evidence_receipt_record_requires_domain_or_app_payload_count:
      countBy(input.actionRefs, (ref) => (
        ref.action_kind === 'stage_production_evidence_receipt_record'
        && ref.route_requires_domain_or_app_payload === true
        && stageProductionRecordRouteHasOpenObligation(ref)
      )),
    stage_production_evidence_receipt_record_payload_template_count:
      countBy(input.actionRefs, (ref) => (
        ref.action_kind === 'stage_production_evidence_receipt_record'
        && Object.keys(record(ref.payload_template)).length > 0
        && stageProductionRecordRouteHasOpenObligation(ref)
      )),
    stage_production_evidence_payload_workorder_count:
      countBy(input.actionRefs, (ref) => (
        ref.action_kind === 'stage_production_evidence_receipt_record'
        && stageProductionRecordRouteHasOpenObligation(ref)
        && record(ref.payload_workorder).surface_kind === 'opl_stage_production_evidence_payload_workorder'
      )),
    domain_dispatch_evidence_receipt_action_route_count: countBy(input.actionRefs, (ref) => (
      ref.action_kind === 'domain_dispatch_evidence_receipt_record'
      || ref.action_kind === 'domain_dispatch_evidence_receipt_verify'
    )),
    domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count:
      countBy(input.actionRefs, (ref) => (
        ref.action_kind === 'domain_dispatch_evidence_receipt_record'
        && ref.route_requires_domain_or_app_payload === true
      )),
    domain_dispatch_evidence_receipt_record_payload_template_count:
      countBy(input.actionRefs, (ref) => (
        ref.action_kind === 'domain_dispatch_evidence_receipt_record'
        && Object.keys(record(ref.payload_template)).length > 0
      )),
    external_evidence_action_route_count: countBy(input.actionRefs, (ref) => (
      ref.action_kind === 'external_evidence_receipt_record'
      || ref.action_kind === 'external_evidence_receipt_verify'
    )),
    evidence_gate_action_route_count: countBy(input.actionRefs, (ref) => (
      ref.action_kind === 'evidence_gate_receipt_record'
      || ref.action_kind === 'evidence_gate_receipt_verify'
    )),
    app_release_user_path_evidence_action_route_count: countBy(input.actionRefs, (ref) => (
      ref.action_kind === 'app_release_user_path_evidence_receipt_record'
      || ref.action_kind === 'app_release_user_path_evidence_receipt_verify'
    )),
    app_release_user_path_evidence_record_action_route_count:
      countBy(input.actionRefs, (ref) =>
        ref.action_kind === 'app_release_user_path_evidence_receipt_record'
      ),
    app_release_user_path_evidence_verify_action_route_count:
      countBy(input.actionRefs, (ref) =>
        ref.action_kind === 'app_release_user_path_evidence_receipt_verify'
      ),
    codex_app_runtime_evidence_action_route_count: countBy(input.actionRefs, (ref) => (
      ref.action_kind === 'codex_app_runtime_evidence_receipt_record'
      || ref.action_kind === 'codex_app_runtime_evidence_receipt_verify'
    )),
    codex_app_runtime_evidence_record_action_route_count:
      countBy(input.actionRefs, (ref) =>
        ref.action_kind === 'codex_app_runtime_evidence_receipt_record'
      ),
    codex_app_runtime_evidence_verify_action_route_count:
      countBy(input.actionRefs, (ref) =>
        ref.action_kind === 'codex_app_runtime_evidence_receipt_verify'
      ),
    freshness_signal_count: input.freshness.length,
    source_ref_count: refFamilySummary.source_ref_count,
    artifact_ref_count: refFamilySummary.artifact_ref_count,
    ref_family_memory_ref_count: refFamilySummary.memory_ref_count,
    safe_action_ref_count: input.safeActions.length,
    app_execution_bridge_safe_action_route_count: executionBridgeSummary.safe_action_route_count,
    app_execution_bridge_supervised_periodic_command_count: executionBridgeSummary.supervised_periodic_command_count,
    lifecycle_index_ref_count: lifecycleSummary.lifecycle_index_ref_count,
    lifecycle_restore_proof_ref_count: lifecycleSummary.restore_proof_ref_count,
    lifecycle_domain_artifact_mutation_receipt_ref_count: lifecycleSummary.domain_artifact_mutation_receipt_ref_count,
    lifecycle_apply_receipt_count: lifecycleSummary.lifecycle_apply_receipt_count,
    lifecycle_apply_blocked_receipt_count: lifecycleSummary.lifecycle_apply_blocked_receipt_count,
    lifecycle_apply_handoff_attempt_count: lifecycleSummary.lifecycle_apply_handoff_attempt_count,
    lifecycle_apply_handoff_blocked_decision_count:
      lifecycleSummary.lifecycle_apply_handoff_blocked_decision_count,
    lifecycle_apply_handoff_safe_decision_count:
      lifecycleSummary.lifecycle_apply_handoff_safe_decision_count,
    lifecycle_reconcile_missing_ref_count: lifecycleSummary.lifecycle_reconcile_missing_ref_count,
    lifecycle_reconcile_extra_ref_count: lifecycleSummary.lifecycle_reconcile_extra_ref_count,
    lifecycle_reconcile_stale_ref_count: lifecycleSummary.lifecycle_reconcile_stale_ref_count,
    lifecycle_domain_physical_delete_requires_owner_receipt:
      lifecycleSummary.lifecycle_domain_physical_delete_requires_owner_receipt,
    lifecycle_domain_physical_delete_can_execute:
      lifecycleSummary.lifecycle_domain_physical_delete_can_execute,
    lifecycle_opl_cleanup_apply_can_execute: lifecycleSummary.lifecycle_opl_cleanup_apply_can_execute,
    memory_artifact_lifecycle_evidence_status:
      memoryArtifactLifecycleProjection.status,
    memory_artifact_lifecycle_evidence_ledger_status:
      memoryArtifactLifecycleProjection.evidence_ledger_status,
    memory_artifact_lifecycle_evidence_ledger_receipt_ref_count:
      numberValue(memoryArtifactLifecycleProjection.receipt_count),
    memory_artifact_lifecycle_evidence_recorded_ledger_receipt_ref_count:
      numberValue(memoryArtifactLifecycleProjection.recorded_receipt_ref_count),
    memory_artifact_lifecycle_evidence_verified_ledger_receipt_ref_count:
      numberValue(memoryArtifactLifecycleProjection.verified_receipt_ref_count),
    memory_artifact_lifecycle_evidence_pending_verify_receipt_ref_count:
      numberValue(memoryArtifactLifecycleProjection.pending_verify_receipt_ref_count),
    memory_artifact_lifecycle_evidence_memory_receipt_ref_count:
      numberValue(memoryArtifactLifecycleProjectionObservedCounts.memory_receipt_ref_count),
    memory_artifact_lifecycle_evidence_memory_writeback_receipt_ref_count:
      numberValue(
        memoryArtifactLifecycleProjectionObservedCounts.memory_writeback_receipt_ref_count,
      ),
    memory_artifact_lifecycle_evidence_artifact_mutation_receipt_ref_count:
      numberValue(
        memoryArtifactLifecycleProjectionObservedCounts.artifact_mutation_receipt_ref_count,
      ),
    memory_artifact_lifecycle_evidence_package_lifecycle_receipt_ref_count:
      numberValue(
        memoryArtifactLifecycleProjectionObservedCounts.package_lifecycle_receipt_ref_count,
      ),
    memory_artifact_lifecycle_evidence_export_lifecycle_receipt_ref_count:
      numberValue(
        memoryArtifactLifecycleProjectionObservedCounts.export_lifecycle_receipt_ref_count,
      ),
    memory_artifact_lifecycle_evidence_cleanup_restore_retention_receipt_ref_count:
      numberValue(
        memoryArtifactLifecycleProjectionObservedCounts
          .cleanup_restore_retention_receipt_ref_count,
      ),
    memory_artifact_lifecycle_evidence_typed_blocker_ref_count:
      numberValue(memoryArtifactLifecycleProjectionObservedCounts.typed_blocker_ref_count),
    memory_artifact_lifecycle_evidence_owner_acceptance_ref_count:
      numberValue(memoryArtifactLifecycleProjectionObservedCounts.owner_acceptance_ref_count),
    memory_artifact_lifecycle_evidence_ready_claim_authorized:
      memoryArtifactLifecycleProjection.ready_claim_authorized === true,
    memory_artifact_lifecycle_evidence_verified_refs_only_ledger_counts_as_memory_ready:
      memoryArtifactLifecycleProjection
        .verified_refs_only_ledger_counts_as_memory_ready === true,
    memory_artifact_lifecycle_evidence_verified_refs_only_ledger_counts_as_artifact_ready:
      memoryArtifactLifecycleProjection
        .verified_refs_only_ledger_counts_as_artifact_ready === true,
    memory_artifact_lifecycle_evidence_verified_refs_only_ledger_counts_as_package_ready:
      memoryArtifactLifecycleProjection
        .verified_refs_only_ledger_counts_as_package_ready === true,
    memory_artifact_lifecycle_evidence_verified_refs_only_ledger_counts_as_export_ready:
      memoryArtifactLifecycleProjection
        .verified_refs_only_ledger_counts_as_export_ready === true,
    functional_privatization_default_watchlist_count: input.functionalSummary.default_watchlist_count,
    functional_privatization_action_required_count: Math.max(
      numberValue(input.functionalSummary.default_watchlist_count),
      numberValue(input.functionalSummary.active_private_generic_residue_count),
      numberValue(input.functionalSummary.semantic_equivalence_review_count),
      numberValue(input.functionalSummary.blocker_count),
    ),
    functional_privatization_hidden_cleared_count: input.functionalSummary.default_hidden_cleared_count,
    functional_privatization_source_purity_tail_read_model:
      input.functionalSummary.source_purity_tail_read_model ?? null,
    functional_privatization_audit_default_policy:
      'audit_action_required_first_full_inventory_via_explicit_drilldown',
    functional_privatization_private_platform_residue_inventory_detail_policy:
      'full_detail_inventory_not_default_action_required_count',
    functional_privatization_semantic_equivalence_review_count: input.functionalSummary.semantic_equivalence_review_count,
    functional_privatization_active_private_generic_residue_count: input.functionalSummary.active_private_generic_residue_count,
    functional_privatization_standard_domain_pack_inventory_count:
      input.functionalSummary.standard_domain_pack_inventory_count,
    functional_privatization_authority_function_inventory_count:
      input.functionalSummary.authority_function_inventory_count,
    functional_privatization_private_platform_residue_inventory_count:
      input.functionalSummary.private_platform_residue_inventory_count,
    functional_privatization_blocker_count: input.functionalSummary.blocker_count,
    domain_external_evidence_request_count: evidenceRequestSummary.external_evidence_request_count,
    domain_open_evidence_request_count: evidenceRequestSummary.open_request_count,
    domain_recorded_evidence_receipt_request_count: evidenceRequestSummary.recorded_receipt_request_count,
    domain_verified_evidence_receipt_request_count: evidenceRequestSummary.verified_receipt_request_count,
    domain_external_evidence_receipt_count: evidenceRequestSummary.external_evidence_receipt_count,
    domain_external_verified_evidence_receipt_count: evidenceRequestSummary.external_verified_receipt_count,
    domain_external_verified_memory_writeback_receipt_ref_count:
      evidenceRequestSummary.external_verified_memory_writeback_receipt_ref_count,
    domain_external_verified_artifact_mutation_receipt_ref_count:
      evidenceRequestSummary.external_verified_artifact_mutation_receipt_ref_count,
    domain_external_verified_package_lifecycle_receipt_ref_count:
      evidenceRequestSummary.external_verified_package_lifecycle_receipt_ref_count,
    domain_external_verified_lifecycle_receipt_ref_count:
      evidenceRequestSummary.external_verified_lifecycle_receipt_ref_count,
    domain_external_verified_restore_proof_ref_count:
      evidenceRequestSummary.external_verified_restore_proof_ref_count,
    domain_external_verified_no_regression_ref_count:
      evidenceRequestSummary.external_verified_no_regression_ref_count,
    domain_evidence_gate_count: evidenceRequestSummary.evidence_gate_count,
    domain_remaining_evidence_gate_count: evidenceRequestSummary.remaining_evidence_gate_count,
    domain_open_evidence_gate_request_count: evidenceRequestSummary.open_evidence_gate_request_count,
    domain_recorded_evidence_gate_request_count: evidenceRequestSummary.recorded_evidence_gate_request_count,
    domain_verified_evidence_gate_request_count: evidenceRequestSummary.verified_evidence_gate_request_count,
    domain_evidence_gate_receipt_count: evidenceRequestSummary.evidence_gate_receipt_count,
    domain_evidence_gate_verified_receipt_count: evidenceRequestSummary.evidence_gate_verified_receipt_count,
    domain_opl_replacement_expectation_count: evidenceRequestSummary.opl_replacement_expectation_count,
    domain_replacement_surface_available_count: evidenceRequestSummary.replacement_surface_available_count,
    domain_remaining_bridge_module_count: evidenceRequestSummary.remaining_bridge_module_count,
    domain_owner_payload_summary_domain_count: domainOwnerPayloadSummary.domain_count,
    domain_owner_payload_summary_owner_payload_item_summary_count:
      domainOwnerPayloadSummary.owner_payload_item_summary_count,
    domain_owner_payload_summary_work_item_count:
      domainOwnerPayloadSummary.owner_payload_work_item_count,
    domain_owner_payload_summary_stage_expected_receipt_summary_count:
      domainOwnerPayloadSummary.stage_expected_receipt_payload_summary_count,
    domain_owner_payload_summary_stage_count:
      domainOwnerPayloadSummary.stage_expected_receipt_payload_stage_count,
    domain_owner_payload_summary_payload_body_allowed_count:
      domainOwnerPayloadSummary.payload_body_allowed_count,
    domain_owner_payload_summary_domain_ready_claim_count:
      domainOwnerPayloadSummary.domain_ready_claim_count,
    domain_owner_payload_summary_production_ready_claim_count:
      domainOwnerPayloadSummary.production_ready_claim_count,
    domain_owner_payload_summary_naming_hygiene_blocker_count:
      domainOwnerPayloadSummary.naming_hygiene_blocker_count,
    domain_owner_payload_summary_ledger_receipt_ref_count:
      domainOwnerPayloadSummaryReceipts.length,
    domain_owner_payload_summary_recorded_ledger_receipt_ref_count:
      domainOwnerPayloadSummaryRecordedReceiptCount,
    domain_owner_payload_summary_verified_ledger_receipt_ref_count:
      domainOwnerPayloadSummaryVerifiedReceiptCount,
    domain_owner_payload_summary_pending_verify_receipt_ref_count:
      domainOwnerPayloadSummaryRecordedReceiptCount,
    domain_owner_payload_summary_action_route_count: countBy(input.actionRefs, (ref) => (
      ref.action_kind === 'domain_owner_payload_summary_receipt_record'
      || ref.action_kind === 'domain_owner_payload_summary_receipt_verify'
    )),
    domain_owner_payload_summary_record_action_route_count:
      countBy(input.actionRefs, (ref) =>
        ref.action_kind === 'domain_owner_payload_summary_receipt_record'
      ),
    domain_owner_payload_summary_verify_action_route_count:
      countBy(input.actionRefs, (ref) =>
        ref.action_kind === 'domain_owner_payload_summary_receipt_verify'
      ),
    owner_evidence_sustained_consumption_domain_count:
      ownerEvidenceSustainedConsumptionSummary.followthrough_domain_count,
    owner_evidence_sustained_consumption_workorder_count:
      ownerEvidenceSustainedConsumptionSummary.workorder_count,
    owner_evidence_sustained_consumption_ledger_receipt_ref_count:
      ownerEvidenceSustainedConsumptionSummary.ledger_receipt_ref_count,
    owner_evidence_sustained_consumption_recorded_ledger_receipt_ref_count:
      ownerEvidenceSustainedConsumptionSummary.recorded_ledger_receipt_ref_count,
    owner_evidence_sustained_consumption_verified_ledger_receipt_ref_count:
      ownerEvidenceSustainedConsumptionSummary.verified_ledger_receipt_ref_count,
    owner_evidence_sustained_consumption_pending_verify_receipt_ref_count:
      ownerEvidenceSustainedConsumptionSummary.pending_verify_receipt_ref_count,
    owner_evidence_sustained_consumption_action_route_count:
      countBy(input.actionRefs, (ref) => (
        ref.action_kind === 'owner_evidence_sustained_consumption_receipt_record'
        || ref.action_kind === 'owner_evidence_sustained_consumption_receipt_verify'
      )),
    owner_evidence_sustained_consumption_record_action_route_count:
      countBy(input.actionRefs, (ref) =>
        ref.action_kind === 'owner_evidence_sustained_consumption_receipt_record'
      ),
    owner_evidence_sustained_consumption_verify_action_route_count:
      countBy(input.actionRefs, (ref) =>
        ref.action_kind === 'owner_evidence_sustained_consumption_receipt_verify'
      ),
    app_operator_production_evidence_tail_item_count: productionEvidenceTailItemCount,
    app_operator_production_evidence_tail_open_item_count: productionEvidenceTailOpenItemCount,
    app_operator_production_evidence_tail_owner_group_count: productionEvidenceTailOwnerGroupCount,
    app_operator_production_evidence_tail_blocking_item_count: productionEvidenceTailBlockingItemCount,
    evidence_envelope_count: numberValue(evidenceEnvelopeSummary.envelope_count),
    evidence_envelope_open_count: numberValue(evidenceEnvelopeSummary.open_envelope_count),
    evidence_envelope_closed_count: numberValue(evidenceEnvelopeSummary.closed_envelope_count),
    evidence_envelope_blocked_count: numberValue(evidenceEnvelopeSummary.blocked_envelope_count),
    evidence_envelope_superseded_count:
      numberValue(evidenceEnvelopeSummary.superseded_envelope_count),
    evidence_envelope_receipt_ref_count: numberValue(evidenceEnvelopeSummary.receipt_ref_count),
    evidence_envelope_typed_blocker_ref_count: numberValue(evidenceEnvelopeSummary.typed_blocker_ref_count),
    evidence_envelope_domain_ready_claim_count: numberValue(evidenceEnvelopeSummary.domain_ready_claim_count),
    evidence_envelope_production_ready_claim_count:
      numberValue(evidenceEnvelopeSummary.production_ready_claim_count),
    evidence_envelope_artifact_authority_claim_count:
      numberValue(evidenceEnvelopeSummary.artifact_authority_claim_count),
    domain_legacy_cleanup_plan_count: legacyCleanupSummary.legacy_cleanup_plan_count,
    domain_legacy_cleanup_ready_plan_count: legacyCleanupSummary.legacy_cleanup_ready_plan_count,
    domain_legacy_cleanup_blocked_plan_count: legacyCleanupSummary.legacy_cleanup_blocked_plan_count,
    domain_legacy_cleanup_action_count: legacyCleanupSummary.legacy_cleanup_action_count,
    domain_legacy_cleanup_opl_apply_ready_count: legacyCleanupSummary.legacy_cleanup_opl_apply_ready_count,
    domain_legacy_cleanup_opl_cleanup_ledger_ready_count:
      legacyCleanupSummary.legacy_cleanup_opl_cleanup_ledger_ready_count,
    domain_legacy_cleanup_domain_physical_delete_requires_owner_receipt_count:
      legacyCleanupSummary.legacy_cleanup_domain_physical_delete_requires_owner_receipt_count,
    domain_legacy_cleanup_domain_physical_delete_can_execute_count:
      legacyCleanupSummary.legacy_cleanup_domain_physical_delete_can_execute_count,
    standard_agent_template_consumption_status: input.standardAgentTemplateConsumption.status ?? null,
    standard_agent_template_consumption_proof_api_ref_count:
      numberValue(standardAgentTemplateSummary.proof_api_ref_count),
    standard_agent_template_consumption_app_operator_ref_count:
      numberValue(standardAgentTemplateSummary.app_operator_consumable_ref_count),
    standard_agent_template_consumption_default_sample_count:
      numberValue(standardAgentTemplateSummary.default_consumption_sample_count),
    standard_agent_template_consumption_repeat_supported:
      standardAgentTemplateSummary.repeat_consumption_supported === true,
    standard_agent_template_consumption_consumed_surface_count_per_sample:
      numberValue(standardAgentTemplateSummary.consumed_surface_count_per_sample),
    standard_agent_template_consumption_readiness_surface_consumed:
      standardAgentTemplateSummary.readiness_surface_consumed === true,
    standard_agent_template_consumption_app_operator_surface_consumed:
      standardAgentTemplateSummary.app_operator_surface_consumed === true,
    standard_agent_template_consumption_domain_ready_claim_count:
      numberValue(standardAgentTemplateSummary.domain_ready_claim_count),
    standard_agent_template_consumption_production_ready_claim_count:
      numberValue(standardAgentTemplateSummary.production_ready_claim_count),
    standard_agent_template_consumption_artifact_authority_claim_count:
      numberValue(standardAgentTemplateSummary.artifact_authority_claim_count),
    standard_agent_template_consumption_ledger_receipt_ref_count:
      numberValue(standardAgentTemplateLedger.receipt_count),
    standard_agent_template_consumption_verified_ledger_receipt_ref_count:
      numberValue(standardAgentTemplateLedger.verified_receipt_ref_count),
    standard_agent_template_consumption_pending_verify_receipt_ref_count:
      numberValue(standardAgentTemplateLedger.pending_verify_receipt_ref_count),
    app_release_user_path_evidence_gate_count: appReleaseUserPathSummary.gate_count,
    app_release_user_path_evidence_open_gate_count:
      appReleaseUserPathSummary.open_gate_count,
    app_release_user_path_evidence_ledger_receipt_ref_count:
      appReleaseUserPathSummary.ledger_receipt_ref_count,
    app_release_user_path_evidence_typed_blocker_ref_count:
      appReleaseUserPathSummary.typed_blocker_ref_count,
    app_release_user_path_evidence_owner_acceptance_ref_count:
      appReleaseUserPathSummary.owner_acceptance_ref_count,
    app_release_user_path_evidence_recorded_ledger_receipt_ref_count:
      appReleaseUserPathSummary.recorded_ledger_receipt_ref_count,
    app_release_user_path_evidence_verified_ledger_receipt_ref_count:
      appReleaseUserPathSummary.verified_ledger_receipt_ref_count,
    app_release_user_path_evidence_pending_verify_receipt_ref_count:
      appReleaseUserPathSummary.pending_verify_receipt_ref_count,
    app_release_user_path_production_user_path_ready:
      appReleaseUserPathSummary.production_user_path_ready,
    app_release_user_path_release_ready_claimed:
      appReleaseUserPathSummary.release_ready_claimed,
    app_release_user_path_production_ready_claimed:
      appReleaseUserPathSummary.production_ready_claimed,
    developer_mode_live_closeout_status:
      developerModeLiveCloseoutSummary.status,
    developer_mode_live_closeout_ledger_evidence_status:
      developerModeLiveCloseoutSummary.ledger_evidence_status,
    developer_mode_live_closeout_drill_count:
      developerModeLiveCloseoutSummary.drill_count,
    developer_mode_live_closeout_direct_fix_drill_count:
      developerModeLiveCloseoutSummary.direct_fix_drill_count,
    developer_mode_live_closeout_fork_pr_drill_count:
      developerModeLiveCloseoutSummary.fork_pr_drill_count,
    developer_mode_live_closeout_ready_count:
      developerModeLiveCloseoutSummary.closeout_ready_count,
    developer_mode_live_closeout_live_external_owner_acceptance_count:
      developerModeLiveCloseoutSummary.live_external_owner_acceptance_count,
    developer_mode_live_closeout_live_ledger_ready_count:
      developerModeLiveCloseoutSummary.live_ledger_closeout_ready_count,
    developer_mode_live_closeout_ledger_receipt_ref_count:
      developerModeLiveCloseoutSummary.ledger_receipt_ref_count,
    developer_mode_live_closeout_recorded_ledger_receipt_ref_count:
      developerModeLiveCloseoutSummary.ledger_recorded_receipt_ref_count,
    developer_mode_live_closeout_verified_ledger_receipt_ref_count:
      developerModeLiveCloseoutSummary.ledger_verified_receipt_ref_count,
    developer_mode_live_closeout_pending_verify_receipt_ref_count:
      developerModeLiveCloseoutSummary.pending_verify_receipt_ref_count,
    developer_mode_live_closeout_verified_direct_fix_ledger_receipt_ref_count:
      developerModeLiveCloseoutSummary.verified_direct_fix_ledger_receipt_ref_count,
    developer_mode_live_closeout_verified_fork_pr_ledger_receipt_ref_count:
      developerModeLiveCloseoutSummary.verified_fork_pr_ledger_receipt_ref_count,
    developer_mode_live_closeout_route_repetition_ref_count:
      developerModeLiveCloseoutSummary.route_repetition_ref_count,
    developer_mode_live_closeout_foundry_activation_transaction_ref_count:
      developerModeLiveCloseoutSummary.foundry_activation_transaction_ref_count,
    developer_mode_live_closeout_app_patrol_mount_ref_count:
      developerModeLiveCloseoutSummary.app_patrol_mount_ref_count,
    developer_mode_live_closeout_scaleout_followthrough_open_gate_count:
      developerModeLiveCloseoutSummary.scaleout_followthrough_open_gate_count,
    developer_mode_live_closeout_missing_live_ledger_route_count:
      developerModeLiveCloseoutSummary.missing_live_ledger_route_count,
    developer_mode_live_closeout_attention_count:
      developerModeLiveCloseoutSummary.attention_count,
    developer_mode_live_closeout_fixture_drill_owner_acceptance_open_count:
      developerModeLiveCloseoutSummary.fixture_drill_owner_acceptance_open_count,
    developer_mode_live_closeout_repo_contract_fixture_not_live_repo_count:
      developerModeLiveCloseoutSummary.repo_contract_fixture_not_live_repo_count,
    developer_mode_live_closeout_external_owner_acceptance_missing_count:
      developerModeLiveCloseoutSummary.external_owner_acceptance_missing_count,
    developer_mode_live_closeout_fixture_drill_external_owner_acceptance_missing_count:
      developerModeLiveCloseoutSummary.fixture_drill_external_owner_acceptance_missing_count,
    developer_mode_live_closeout_forbidden_owner_receipt_write_count:
      developerModeLiveCloseoutSummary.forbidden_owner_receipt_write_count,
    developer_mode_live_route_closeout_refs_ready:
      developerModeLiveCloseoutSummary.live_route_closeout_refs_ready,
    codex_app_runtime_evidence_gate_count: codexAppRuntimeEvidence.gate_count,
    codex_app_runtime_evidence_open_gate_count:
      codexAppRuntimeEvidence.open_gate_count,
    codex_app_runtime_evidence_ledger_receipt_ref_count:
      codexAppRuntimeEvidence.ledger_receipt_ref_count,
    codex_app_runtime_evidence_typed_blocker_ref_count:
      codexAppRuntimeEvidence.typed_blocker_ref_count,
    codex_app_runtime_evidence_recorded_ledger_receipt_ref_count:
      codexAppRuntimeEvidence.recorded_ledger_receipt_ref_count,
    codex_app_runtime_evidence_verified_ledger_receipt_ref_count:
      codexAppRuntimeEvidence.verified_ledger_receipt_ref_count,
    codex_app_runtime_evidence_pending_verify_receipt_ref_count:
      codexAppRuntimeEvidence.pending_verify_receipt_ref_count,
  };
}
