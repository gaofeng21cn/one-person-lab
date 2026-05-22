import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  appReleaseUserPathEvidenceSummary,
} from './app-release-user-path.ts';

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
  productionEvidenceTailLedger: JsonRecord;
  legacyCleanupPlans: JsonRecord;
  oplMetaAgentRegistry: JsonRecord;
  standardAgentTemplateConsumption: JsonRecord;
  evidenceEnvelope: JsonRecord;
  runtimeManagerRouteSupport: JsonRecord;
  appReleaseUserPathEvidence: JsonRecord;
};

function record(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function list(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function countBy(values: JsonRecord[], predicate: (value: JsonRecord) => boolean) {
  return values.filter(predicate).length;
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
  const productionTailSummary = record(input.productionEvidenceTailLedger.summary);
  const legacyCleanupSummary = record(input.legacyCleanupPlans.summary);
  const oplMetaAgentSummary = record(input.oplMetaAgentRegistry.summary);
  const oplMetaAgentProductionConsumptionSummary = record(
    record(input.oplMetaAgentRegistry.production_consumption_followthrough).summary,
  );
  const standardAgentTemplateSummary = record(input.standardAgentTemplateConsumption.summary);
  const evidenceEnvelopeSummary = record(input.evidenceEnvelope.summary);
  const appReleaseUserPathSummary =
    appReleaseUserPathEvidenceSummary(input.appReleaseUserPathEvidence);
  const routeSupport = record(input.runtimeManagerRouteSupport.mas_domain_route_projection);
  const supportedTaskKinds = stringList(routeSupport.supported_task_kinds);
  const routeSupportActionRefs = stringList(routeSupport.action_refs);
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
    runtime_manager_mas_route_support_task_kind_count: supportedTaskKinds.length,
    runtime_manager_mas_aftercare_route_support_count:
      supportedTaskKinds.filter((taskKind) => taskKind.startsWith('publication_aftercare/')).length,
    runtime_manager_mas_route_support_action_ref_count: routeSupportActionRefs.length,
    provider_slo_cadence_window_status: input.providerCadenceWindow.window_status,
    provider_slo_cadence_window_long_evidence_ready: input.providerCadenceWindow.long_window_evidence_ready,
    provider_slo_cadence_window_expected_receipt_count: input.providerCadenceWindow.expected_slo_execution_receipt_count,
    provider_slo_cadence_window_observed_receipt_count: input.providerCadenceWindow.observed_slo_execution_receipt_count,
    provider_slo_cadence_window_missing_receipt_count: input.providerCadenceWindow.missing_slo_execution_receipt_count,
    provider_slo_cadence_window_blocked_repair_receipt_count: input.providerCadenceWindow.blocked_repair_receipt_count,
    provider_slo_capability_status: input.providerCapabilitySlo.status,
    provider_slo_capability_restart_requery_ready: input.providerCapabilitySlo.restart_requery_ready,
    provider_slo_capability_signal_history_ready: input.providerCapabilitySlo.signal_history_ready,
    provider_slo_capability_typed_closeout_ready: input.providerCapabilitySlo.typed_closeout_required_ready,
    provider_slo_capability_missing_closeout_block_ready: input.providerCapabilitySlo.missing_closeout_block_ready,
    provider_slo_capability_retry_dead_letter_ready: input.providerCapabilitySlo.retry_dead_letter_boundary_ready,
    provider_slo_capability_domain_truth_boundary_preserved: input.providerCapabilitySlo.domain_truth_boundary_preserved,
    provider_cadence_window_status: input.providerCadenceWindow.window_status,
    provider_cadence_window_long_evidence_ready: input.providerCadenceWindow.long_window_evidence_ready,
    provider_cadence_window_expected_receipt_count: input.providerCadenceWindow.expected_slo_execution_receipt_count,
    provider_cadence_window_observed_receipt_count: input.providerCadenceWindow.observed_slo_execution_receipt_count,
    provider_cadence_window_missing_receipt_count: input.providerCadenceWindow.missing_slo_execution_receipt_count,
    provider_cadence_window_blocked_repair_receipt_count: input.providerCadenceWindow.blocked_repair_receipt_count,
    provider_capability_slo_status: input.providerCapabilitySlo.status,
    provider_capability_restart_requery_ready: input.providerCapabilitySlo.restart_requery_ready,
    provider_capability_signal_history_ready: input.providerCapabilitySlo.signal_history_ready,
    provider_capability_typed_closeout_ready: input.providerCapabilitySlo.typed_closeout_required_ready,
    provider_capability_missing_closeout_block_ready: input.providerCapabilitySlo.missing_closeout_block_ready,
    provider_capability_retry_dead_letter_ready: input.providerCapabilitySlo.retry_dead_letter_boundary_ready,
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
      )),
    stage_production_evidence_receipt_record_payload_template_count:
      countBy(input.actionRefs, (ref) => (
        ref.action_kind === 'stage_production_evidence_receipt_record'
        && Object.keys(record(ref.payload_template)).length > 0
      )),
    stage_production_evidence_payload_workorder_count:
      countBy(input.actionRefs, (ref) => (
        ref.action_kind === 'stage_production_evidence_receipt_record'
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
    lifecycle_reconcile_missing_ref_count: lifecycleSummary.lifecycle_reconcile_missing_ref_count,
    lifecycle_reconcile_extra_ref_count: lifecycleSummary.lifecycle_reconcile_extra_ref_count,
    lifecycle_reconcile_stale_ref_count: lifecycleSummary.lifecycle_reconcile_stale_ref_count,
    lifecycle_domain_physical_delete_requires_owner_receipt:
      lifecycleSummary.lifecycle_domain_physical_delete_requires_owner_receipt,
    lifecycle_domain_physical_delete_can_execute:
      lifecycleSummary.lifecycle_domain_physical_delete_can_execute,
    lifecycle_opl_cleanup_apply_can_execute: lifecycleSummary.lifecycle_opl_cleanup_apply_can_execute,
    functional_privatization_default_watchlist_count: input.functionalSummary.default_watchlist_count,
    functional_privatization_action_required_count: Math.max(
      numberValue(input.functionalSummary.default_watchlist_count),
      numberValue(input.functionalSummary.active_private_generic_residue_count),
      numberValue(input.functionalSummary.semantic_equivalence_review_count),
      numberValue(input.functionalSummary.blocker_count),
    ),
    functional_privatization_hidden_cleared_count: input.functionalSummary.default_hidden_cleared_count,
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
    app_operator_production_evidence_tail_item_count: productionEvidenceTailItemCount,
    app_operator_production_evidence_tail_open_item_count: productionEvidenceTailOpenItemCount,
    app_operator_production_evidence_tail_owner_group_count: productionEvidenceTailOwnerGroupCount,
    app_operator_production_evidence_tail_blocking_item_count: productionEvidenceTailBlockingItemCount,
    evidence_envelope_count: numberValue(evidenceEnvelopeSummary.envelope_count),
    evidence_envelope_open_count: numberValue(evidenceEnvelopeSummary.open_envelope_count),
    evidence_envelope_closed_count: numberValue(evidenceEnvelopeSummary.closed_envelope_count),
    evidence_envelope_blocked_count: numberValue(evidenceEnvelopeSummary.blocked_envelope_count),
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
    standard_agent_template_consumption_proof_command_count:
      numberValue(standardAgentTemplateSummary.proof_command_count),
    standard_agent_template_consumption_app_operator_ref_count:
      numberValue(standardAgentTemplateSummary.app_operator_consumable_ref_count),
    standard_agent_template_consumption_default_sample_count:
      numberValue(standardAgentTemplateSummary.default_consumption_sample_count),
    standard_agent_template_consumption_repeat_supported:
      standardAgentTemplateSummary.repeat_consumption_supported === true,
    standard_agent_template_consumption_domain_ready_claim_count:
      numberValue(standardAgentTemplateSummary.domain_ready_claim_count),
    standard_agent_template_consumption_production_ready_claim_count:
      numberValue(standardAgentTemplateSummary.production_ready_claim_count),
    standard_agent_template_consumption_artifact_authority_claim_count:
      numberValue(standardAgentTemplateSummary.artifact_authority_claim_count),
    opl_meta_agent_registry_status: input.oplMetaAgentRegistry.status ?? null,
    opl_meta_agent_consumed_contract_count: numberValue(oplMetaAgentSummary.consumed_contract_count),
    opl_meta_agent_resolved_contract_count: numberValue(oplMetaAgentSummary.resolved_contract_count),
    opl_meta_agent_app_workbench_section_count: numberValue(oplMetaAgentSummary.app_workbench_section_count),
    opl_meta_agent_scaleout_target_count: numberValue(oplMetaAgentSummary.scaleout_target_count),
    opl_meta_agent_patch_loop_ref_count: numberValue(oplMetaAgentSummary.patch_loop_ref_count),
    opl_meta_agent_patch_loop_target_count: numberValue(oplMetaAgentSummary.patch_loop_target_count),
    opl_meta_agent_patch_loop_closed_count: numberValue(oplMetaAgentSummary.patch_loop_closed_count),
    opl_meta_agent_self_evolution_cockpit_target_count:
      numberValue(oplMetaAgentSummary.self_evolution_cockpit_target_count),
    opl_meta_agent_self_evolution_cockpit_six_question_ready_count:
      numberValue(oplMetaAgentSummary.self_evolution_cockpit_six_question_ready_count),
    opl_meta_agent_production_consumption_followthrough_open_gate_count:
      numberValue(oplMetaAgentSummary.production_consumption_followthrough_open_gate_count),
    opl_meta_agent_production_consumption_gate_count:
      numberValue(oplMetaAgentProductionConsumptionSummary.gate_count),
    opl_meta_agent_production_consumption_ready:
      oplMetaAgentSummary.production_consumption_ready === true,
    opl_meta_agent_claims_domain_ready: oplMetaAgentSummary.claims_domain_ready === true,
    opl_meta_agent_claims_quality_verdict: oplMetaAgentSummary.claims_quality_verdict === true,
    opl_meta_agent_claims_default_promotion: oplMetaAgentSummary.claims_default_promotion === true,
    app_release_user_path_evidence_gate_count: appReleaseUserPathSummary.gate_count,
    app_release_user_path_evidence_open_gate_count:
      appReleaseUserPathSummary.open_gate_count,
    app_release_user_path_evidence_ledger_receipt_ref_count:
      appReleaseUserPathSummary.ledger_receipt_ref_count,
    app_release_user_path_evidence_typed_blocker_ref_count:
      appReleaseUserPathSummary.typed_blocker_ref_count,
    app_release_user_path_production_user_path_ready:
      appReleaseUserPathSummary.production_user_path_ready,
    app_release_user_path_release_ready_claimed:
      appReleaseUserPathSummary.release_ready_claimed,
    app_release_user_path_production_ready_claimed:
      appReleaseUserPathSummary.production_ready_claimed,
  };
}
