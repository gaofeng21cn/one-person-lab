import type { DomainManifestCatalogEntry } from '../atlas/index.ts';
import {
  buildDomainEvidenceRequestRefs,
} from './runtime-tray-domain-evidence-requests.ts';
import type { JsonRecord, RuntimeTraySourceRef } from './runtime-tray-snapshot-types.ts';
import { buildAppDrilldownProductionEvidenceTailLedger } from '../ledger/index.ts';
import { sourceRef, uniqueByRef } from './runtime-tray-snapshot-utils.ts';
import {
  applyAppOperatorDrilldownDetail,
  type AppOperatorDrilldownDetailLevel,
  appReleaseUserPathEvidenceSourceRef,
  artifactGalleryRefs,
  attemptTruePathProofs,
  buildAppDrilldownRefsOnlyAuthorityBoundary as refsOnlyAuthorityBoundary,
  buildAppExecutionBridge,
  buildAppOperatorDrilldownSummary,
  buildAppReleaseUserPathEvidenceActionRoutes,
  buildAppReleaseUserPathEvidenceFromRuntime,
  buildCleanupRetirementProjection,
  buildCodexAppRuntimeEvidenceActionRoutes,
  buildCodexAppRuntimeRole,
  buildDefaultCallerDeletionEvidenceRefs,
  buildDomainDispatchEvidence,
  buildDomainDispatchEvidenceReceiptRoutes,
  buildDomainOwnerPayloadSummaryActionRoutes,
  buildDomainOwnerPayloadSummaryRefs,
  buildExternalEvidenceActionRoutes,
  buildFunctionalPrivatizationSemanticEquivalenceActionRoutes,
  buildLegacyCleanupActionRoutes,
  buildLifecycleLedgerRefs,
  buildOwnerEvidenceSustainedConsumptionFollowthroughActionRoutes,
  buildOwnerEvidenceSustainedConsumptionFollowthroughRefs,
  buildMemoryArtifactLifecycleEvidence,
  buildMemoryTraceProjection,
  buildProviderActionRoutes,
  buildRuntimeVisualizationProjection,
  buildStageProductionAttemptRoutes,
  buildStageProductionAttemptStartRoutes,
  buildStageProductionEvidence,
  buildStageProductionEvidenceReceiptRoutes,
  buildStandardAgentTemplateConsumptionProjection,
  buildWorkstreamOperatingLoop,
  currentControlStateProjection,
  decisionMapRefs,
  domainProjectionRefs,
  effectiveCurrentContextPacket,
  familyStallLineagePacket,
  freshnessRefs,
  functionalPrivatizationAuditRefs,
  functionalPrivatizationSummary,
  legacyCleanupPlanRefs,
  memoryWritebackRefs,
  numberValue,
  operatorActionRoutingRefs,
  ownerReceiptRefs,
  packageExportLifecycle,
  periodicExecutionRefs,
  providerCadenceWindowSummary,
  providerCapabilitySloSummary,
  providerSloRefs,
  qualityReadinessRefs,
  record,
  recordList,
  refFamilyRefs,
  replacementCoverage,
  reviewRepairItems,
  routeGraphRefs,
  routeTransitionDrilldown,
  runtimeManagerRouteSupportRefs,
  safeActionRefs,
  stringValue,
  typedBlockerRefs,
  uniqueRefs,
  uniqueStrings,
} from './runtime-tray-app-operator-drilldown-parts/index.ts'; // reuse-first: allow stable legacy file path
import {
  buildEvidenceEnvelopeProjection,
} from '../ledger/index.ts';
import {
  buildMemoryArtifactLifecycleEvidenceProjection,
} from '../ledger/index.ts';
import {
  buildDeveloperModeAgentLabRepairRouteReadModel,
} from '../foundry-lab/index.ts';

const APP_OPERATOR_EVIDENCE_ATTEMPT_LIMIT = 25;
const APP_OPERATOR_EVIDENCE_ATTEMPT_DISTINCT_KEY_LIMIT = 50;

function operatorEvidenceAttemptKey(attempt: JsonRecord) {
  const workspaceLocator = record(attempt.workspace_locator);
  return [
    stringValue(attempt.domain_id),
    stringValue(attempt.stage_id),
    stringValue(workspaceLocator.study_id),
    stringValue(workspaceLocator.quest_id),
  ].filter(Boolean).join(':') || stringValue(attempt.stage_attempt_id) || 'unknown-attempt';
}

function selectOperatorEvidenceAttempts(rawAttempts: JsonRecord[]) {
  if (rawAttempts.length <= APP_OPERATOR_EVIDENCE_ATTEMPT_LIMIT) {
    return rawAttempts;
  }
  const selected: JsonRecord[] = [];
  const selectedKeys = new Set<string>();
  for (const attempt of rawAttempts) {
    const key = operatorEvidenceAttemptKey(attempt);
    if (selectedKeys.has(key)) {
      continue;
    }
    selected.push(attempt);
    selectedKeys.add(key);
    if (selected.length >= APP_OPERATOR_EVIDENCE_ATTEMPT_DISTINCT_KEY_LIMIT) {
      break;
    }
  }
  return selected;
}

export function buildAppOperatorDrilldown(input: {
  stageAttemptWorkbench: JsonRecord;
  providerInspection?: JsonRecord;
  providerContinuousProof: JsonRecord;
  domainProjectionIngestion: JsonRecord;
  domainManifestProjects: DomainManifestCatalogEntry[]; functionalPrivatizationProjects?: DomainManifestCatalogEntry[];
  currentWorkUnitProjections?: JsonRecord[];
  currentControlReadbacks?: JsonRecord[];
  detailLevel?: AppOperatorDrilldownDetailLevel;
}) {
  const attempts = recordList(input.stageAttemptWorkbench.attempts);
  const evidenceAttempts = recordList(input.stageAttemptWorkbench.evidence_attempts);
  const rawOperatorEvidenceAttempts = evidenceAttempts.length > 0 ? evidenceAttempts : attempts;
  const operatorEvidenceAttempts = selectOperatorEvidenceAttempts(rawOperatorEvidenceAttempts);
  const truePathProofs = attemptTruePathProofs(operatorEvidenceAttempts);
  const routeRefs = routeGraphRefs(attempts);
  const decisionRefs = decisionMapRefs(attempts);
  const reviewItems = reviewRepairItems(input.stageAttemptWorkbench);
  const artifactRefs = artifactGalleryRefs(input.stageAttemptWorkbench);
  const packageLifecycle = packageExportLifecycle(input.stageAttemptWorkbench);
  const evidenceRequests = buildDomainEvidenceRequestRefs(
    input.domainManifestProjects,
    replacementCoverage,
  );
  const memoryRefs = memoryWritebackRefs(input.stageAttemptWorkbench, record(evidenceRequests));
  const memoryTrace = buildMemoryTraceProjection(input.stageAttemptWorkbench);
  const effectiveCurrentContext = effectiveCurrentContextPacket(input.stageAttemptWorkbench);
  const familyStallLineage = familyStallLineagePacket(input.stageAttemptWorkbench);
  const qualityRefs = qualityReadinessRefs(input.stageAttemptWorkbench);
  const providerActionRefs = providerSloRefs(input.providerContinuousProof);
  const providerCadenceWindow = providerCadenceWindowSummary(input.providerContinuousProof);
  const providerCapabilitySlo = providerCapabilitySloSummary(input.providerContinuousProof);
  const providerLongSoakEvidence = record(input.providerContinuousProof.provider_long_soak_evidence);
  const appRuntimeRole = buildCodexAppRuntimeRole();
  const developerModeRepairRoutes = buildDeveloperModeAgentLabRepairRouteReadModel();
  const developerModeLiveCloseoutEvidence =
    record(developerModeRepairRoutes.live_closeout_evidence);
  const runtimeManagerRouteSupport = runtimeManagerRouteSupportRefs();
  const routeTransitionDrilldownRefs = routeTransitionDrilldown({
    attempts,
    domainProjectionIngestion: input.domainProjectionIngestion,
    runtimeManagerRouteSupport,
  });
  const periodicRefs = periodicExecutionRefs(providerActionRefs);
  const domainRefs = domainProjectionRefs(input.domainProjectionIngestion);
  const ownerReceipts = ownerReceiptRefs(attempts, input.domainProjectionIngestion);
  const typedBlockers = typedBlockerRefs(attempts, input.domainProjectionIngestion);
  const domainDispatchEvidence = buildDomainDispatchEvidence(operatorEvidenceAttempts);
  const stageProductionEvidence = buildStageProductionEvidence({
    domainManifestProjects: input.domainManifestProjects,
    attempts: operatorEvidenceAttempts,
  });
  const freshness = freshnessRefs(attempts, input.domainProjectionIngestion);
  const refFamilies = refFamilyRefs(input.stageAttemptWorkbench, record(memoryRefs));
  const currentControlState = currentControlStateProjection({
    attempts: operatorEvidenceAttempts,
    currentControlReadbacks: input.currentControlReadbacks,
  });
  const functionalSummary = functionalPrivatizationSummary(input.functionalPrivatizationProjects ?? input.domainManifestProjects);
  const functionalAuditRefs = functionalPrivatizationAuditRefs(input.functionalPrivatizationProjects ?? input.domainManifestProjects);
  const defaultCallerDeletionEvidenceRefs =
    buildDefaultCallerDeletionEvidenceRefs(input.domainManifestProjects);
  const domainOwnerPayloadSummaryRefs = buildDomainOwnerPayloadSummaryRefs({
    domainManifestProjects: input.domainManifestProjects,
  });
  const ownerEvidenceSustainedConsumptionFollowthroughRefs =
    buildOwnerEvidenceSustainedConsumptionFollowthroughRefs({
      domainManifestProjects: input.domainManifestProjects,
    });
  const legacyCleanupPlans = legacyCleanupPlanRefs(
    input.domainManifestProjects,
    input.providerContinuousProof,
  );
  const standardAgentTemplateConsumption =
    buildStandardAgentTemplateConsumptionProjection();
  const productionEvidenceTailLedger = buildAppDrilldownProductionEvidenceTailLedger({
    providerContinuousProof: input.providerContinuousProof,
    stageAttempts: attempts,
    appOperatorDrilldown: {
      stage_production_evidence: stageProductionEvidence,
      domain_dispatch_evidence: domainDispatchEvidence,
      domain_evidence_request_refs: evidenceRequests,
      domain_legacy_cleanup_plan_refs: legacyCleanupPlans,
    },
  });
  const appReleaseUserPathEvidence = buildAppReleaseUserPathEvidenceFromRuntime({
    authorityBoundary: refsOnlyAuthorityBoundary(), appRuntimeRole, packageLifecycle,
    productionEvidenceTailLedger, providerActionRefs, periodicRefs,
  });
  const actionRefs = uniqueRefs([
    ...operatorActionRoutingRefs(input.stageAttemptWorkbench),
    ...buildStageProductionAttemptRoutes(record(stageProductionEvidence)),
    ...buildStageProductionAttemptStartRoutes(record(stageProductionEvidence)),
    ...buildStageProductionEvidenceReceiptRoutes({
      stageProductionEvidence: record(stageProductionEvidence),
      domainOwnerPayloadSummaryRefs: record(domainOwnerPayloadSummaryRefs),
    }),
    ...buildDomainDispatchEvidenceReceiptRoutes(record(domainDispatchEvidence)),
    ...buildExternalEvidenceActionRoutes(record(evidenceRequests)),
    ...buildFunctionalPrivatizationSemanticEquivalenceActionRoutes(record(functionalAuditRefs)),
    ...buildDomainOwnerPayloadSummaryActionRoutes(record(domainOwnerPayloadSummaryRefs)),
    ...buildOwnerEvidenceSustainedConsumptionFollowthroughActionRoutes(
      record(ownerEvidenceSustainedConsumptionFollowthroughRefs),
    ),
    ...buildCodexAppRuntimeEvidenceActionRoutes(record(appRuntimeRole)),
    ...buildAppReleaseUserPathEvidenceActionRoutes(record(appReleaseUserPathEvidence)),
    ...buildProviderActionRoutes({
      periodicRefs: record(periodicRefs),
      stageAttemptWorkbench: input.stageAttemptWorkbench,
      providerInspection: input.providerInspection,
    }),
    ...buildLegacyCleanupActionRoutes(record(legacyCleanupPlans)),
  ]);
  const evidenceEnvelope = buildEvidenceEnvelopeProjection({
    appOperatorDrilldown: {
      stage_production_evidence: stageProductionEvidence,
      domain_dispatch_evidence: domainDispatchEvidence,
      domain_evidence_request_refs: evidenceRequests,
      domain_legacy_cleanup_plan_refs: legacyCleanupPlans,
    },
    operatorRoutes: actionRefs,
  });
  const lifecycleRefs = buildLifecycleLedgerRefs();
  const safeActions = safeActionRefs(actionRefs, lifecycleRefs);
  const executionBridge = buildAppExecutionBridge(actionRefs, periodicRefs, lifecycleRefs);
  const runtimeVisualizationProjection = buildRuntimeVisualizationProjection({
    attempts,
    routeRefs,
    decisionRefs,
    artifactRefs,
    packageLifecycle,
    memoryRefs,
    qualityRefs,
    actionRefs,
    ownerReceipts,
    typedBlockers,
    domainProjectionIngestion: input.domainProjectionIngestion,
    routeTransitionDrilldown: routeTransitionDrilldownRefs,
    stageProductionEvidence,
    domainDispatchEvidence,
    safeActions,
  });
  const workstreamOperatingLoop = buildWorkstreamOperatingLoop({
    attempts,
    domainDispatchEvidence,
    artifactRefs,
    packageLifecycle,
    memoryRefs,
  });
  const memoryArtifactLifecycleEvidenceProjection =
    buildMemoryArtifactLifecycleEvidenceProjection();
  const currentWorkUnitItems = (input.currentWorkUnitProjections ?? [])
    .map(record)
    .filter((item) => Object.keys(item).length > 0);
  const domainCurrentWorkUnitProjection = {
    surface_kind: 'opl_domain_current_work_unit_projection',
    projection_policy:
      'runtime_tray_domain_current_work_unit_refs_only_no_domain_truth_reduction',
    summary: {
      current_work_unit_count: currentWorkUnitItems.length,
      domain_ids: uniqueStrings(currentWorkUnitItems
        .map((item) => stringValue(item.domain_id))
        .filter((entry): entry is string => Boolean(entry))),
      study_ids: uniqueStrings(currentWorkUnitItems
        .map((item) => stringValue(item.study_id))
        .filter((entry): entry is string => Boolean(entry))),
    },
    items: currentWorkUnitItems,
    authority_boundary: {
      opl_role: 'projection_consumer_only',
      domain_truth_owner: 'domain repositories',
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      provider_completion_is_domain_ready: false,
    },
  };
  const currentWorkUnitFirstDefaultPrimarySource = currentWorkUnitItems.length > 0
    ? 'domain_current_work_unit_projection'
    : 'owner_delta_first_projection';
  const currentWorkUnitFirstDefaultPayloadCategory = currentWorkUnitItems.length > 0
    ? 'current_work_unit_owner_delta'
    : 'owner_delta_first_attention_payload';
  const currentWorkUnitFirstDiagnosticBacklogSeparation = {
    historical_attempt_backlog_is_default_next_step: false,
    historical_attempt_backlog_payload_category: 'diagnostic_full_drilldown',
    full_detail_args: ['--detail', 'full'],
  };
  const currentWorkUnitFirstReadModel = {
    surface_kind: 'opl_app_current_work_unit_first_read_model',
    projection_policy:
      'ordinary_surface_defaults_to_current_work_unit_or_owner_delta_attempt_backlog_is_diagnostic',
    default_primary_source: currentWorkUnitFirstDefaultPrimarySource,
    current_work_unit_count: currentWorkUnitItems.length,
    default_payload_category: currentWorkUnitFirstDefaultPayloadCategory,
    diagnostic_backlog_separation: currentWorkUnitFirstDiagnosticBacklogSeparation,
    diagnostic_attempt_backlog_count: attempts.length,
    domain_current_work_unit_summary: record(domainCurrentWorkUnitProjection.summary),
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      current_work_unit_first_is_projection_only: true,
      can_write_domain_truth: false,
      can_execute_domain_action: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
  const summary = {
    ...buildAppOperatorDrilldownSummary({
      attempts,
      domainRefs,
      routeRefs,
      decisionRefs,
      reviewItems,
      artifactRefs,
      packageLifecycle,
      memoryRefs,
      qualityRefs,
      providerActionRefs,
      providerCadenceWindow,
      providerCapabilitySlo,
      providerLongSoakEvidence,
      runtimeManagerRouteSupport,
      periodicRefs,
      actionRefs,
      ownerReceipts,
      typedBlockers,
      domainDispatchEvidence,
      stageProductionEvidence,
      freshness,
      refFamilies,
      safeActions,
      executionBridge,
      lifecycleRefs,
      functionalSummary,
      evidenceRequests,
      domainOwnerPayloadSummaryRefs,
      ownerEvidenceSustainedConsumptionFollowthroughRefs,
      productionEvidenceTailLedger,
      legacyCleanupPlans,
      standardAgentTemplateConsumption,
      evidenceEnvelope,
      codexAppRuntimeRole: appRuntimeRole,
      appReleaseUserPathEvidence,
      developerModeLiveCloseoutEvidence,
      memoryArtifactLifecycleEvidenceProjection,
    }),
    codex_app_runtime_role_status: appRuntimeRole.runtime_policy,
    codex_app_runtime_role_count: Array.isArray(appRuntimeRole.codex_app_roles)
      ? appRuntimeRole.codex_app_roles.length
      : 0,
    codex_app_drives_long_running_tasks: appRuntimeRole.codex_app_drives_long_running_tasks,
    codex_app_long_running_task_driver_owner: appRuntimeRole.long_running_task_driver_owner,
    codex_app_long_running_task_driver_substrate:
      appRuntimeRole.long_running_task_driver_substrate,
    codex_app_production_long_soak_claimed: appRuntimeRole.production_long_soak_claimed,
    codex_app_production_evidence_gate_remains_open:
      appRuntimeRole.production_evidence_gate_remains_open,
    route_transition_drilldown_stage_attempt_count:
      record(routeTransitionDrilldownRefs.summary).stage_attempt_count,
    route_transition_drilldown_owner_route_ref_count:
      record(routeTransitionDrilldownRefs.summary).owner_route_ref_count,
    route_transition_drilldown_human_gate_ref_count:
      record(routeTransitionDrilldownRefs.summary).human_gate_ref_count,
    route_transition_drilldown_dead_letter_ref_count:
      record(routeTransitionDrilldownRefs.summary).dead_letter_ref_count,
    default_caller_deletion_evidence_open_requirement_count:
      record(defaultCallerDeletionEvidenceRefs.summary).open_deletion_evidence_requirement_count,
    default_caller_deletion_missing_domain_owner_receipt_or_typed_blocker_count:
      record(defaultCallerDeletionEvidenceRefs.summary)
        .missing_domain_owner_receipt_or_typed_blocker_count,
    default_caller_deletion_missing_no_forbidden_write_proof_count:
      record(defaultCallerDeletionEvidenceRefs.summary).missing_no_forbidden_write_proof_count,
    default_caller_deletion_missing_tombstone_or_provenance_ref_count:
      record(defaultCallerDeletionEvidenceRefs.summary).missing_tombstone_or_provenance_ref_count,
    domain_legacy_cleanup_opl_cleanup_ledger_ready_count:
      record(legacyCleanupPlans.summary).legacy_cleanup_opl_cleanup_ledger_ready_count,
    domain_legacy_cleanup_domain_physical_delete_requires_owner_receipt_count:
      record(legacyCleanupPlans.summary)
        .legacy_cleanup_domain_physical_delete_requires_owner_receipt_count,
    domain_legacy_cleanup_delete_ready_count: undefined,
    current_control_state_count: record(currentControlState.summary).current_control_state_count,
    current_control_state_blocked_count: record(currentControlState.summary).blocked_control_state_count,
    current_control_state_accepted_typed_closeout_count:
      record(currentControlState.summary).accepted_typed_closeout_count,
    current_control_state_running_count:
      record(currentControlState.summary).running_control_state_count,
    current_control_state_running_provider_attempt_count:
      record(currentControlState.summary).running_provider_attempt_count,
    current_control_state_running_provider_attempt_domain_ids:
      record(currentControlState.summary).running_provider_attempt_domain_ids,
    current_control_state_running_provider_attempt_domain_id_omitted_count:
      record(currentControlState.summary).running_provider_attempt_domain_id_omitted_count,
    current_control_state_running_provider_attempt_task_kinds:
      record(currentControlState.summary).running_provider_attempt_task_kinds,
    current_control_state_running_provider_attempt_task_kind_omitted_count:
      record(currentControlState.summary).running_provider_attempt_task_kind_omitted_count,
    current_control_state_running_provider_attempt_stage_attempt_ids:
      record(currentControlState.summary).running_provider_attempt_stage_attempt_ids,
    current_control_state_running_provider_attempt_stage_attempt_id_omitted_count:
      record(currentControlState.summary).running_provider_attempt_stage_attempt_id_omitted_count,
    current_control_state_latest_running_provider_heartbeat_at:
      record(currentControlState.summary).latest_running_provider_heartbeat_at,
    current_control_state_running_provider_attempt_summary_policy:
      record(currentControlState.summary).running_provider_attempt_summary_policy,
    effective_current_context_count:
      numberValue(record(effectiveCurrentContext.summary).context_count),
    effective_current_context_running_attempt_count:
      numberValue(record(effectiveCurrentContext.summary).running_attempt_count),
    effective_current_context_latest_closeout_count:
      numberValue(record(effectiveCurrentContext.summary).latest_closeout_count),
    family_stall_lineage_count:
      numberValue(record(familyStallLineage.summary).lineage_count),
    family_stall_lineage_repeated_count:
      numberValue(record(familyStallLineage.summary).repeated_lineage_count),
    family_stall_lineage_terminal_count:
      numberValue(record(familyStallLineage.summary).terminal_lineage_count),
    runtime_visualization_node_count:
      record(runtimeVisualizationProjection.summary).node_count,
    runtime_visualization_edge_count:
      record(runtimeVisualizationProjection.summary).edge_count,
    runtime_visualization_timeline_event_count:
      record(runtimeVisualizationProjection.summary).timeline_event_count,
    runtime_visualization_operator_route_lens_ref_count:
      record(runtimeVisualizationProjection.summary).operator_route_lens_ref_count,
    runtime_visualization_stage_progress_event_count:
      record(runtimeVisualizationProjection.summary).stage_progress_event_count,
    runtime_visualization_temporal_stage_progress_ref_count:
      record(runtimeVisualizationProjection.summary).temporal_stage_progress_ref_count,
    attempt_true_path_proof_count: truePathProofs.length,
    attempt_true_path_observed_count: truePathProofs.filter((proof) =>
      stringValue(proof.proof_status) === 'observed'
    ).length,
    workstream_operating_loop_workstream_count:
      record(workstreamOperatingLoop.summary).workstream_count,
    workstream_operating_loop_artifact_first_review_available_count:
      record(workstreamOperatingLoop.summary).artifact_first_review_available_count,
    workstream_operating_loop_deliverable_progress_workstream_count:
      record(workstreamOperatingLoop.summary).deliverable_progress_workstream_count,
    workstream_operating_loop_platform_repair_only_workstream_count:
      record(workstreamOperatingLoop.summary).platform_repair_only_workstream_count,
    workstream_operating_loop_goal_oracle_missing_count:
      record(workstreamOperatingLoop.summary).goal_oracle_missing_count,
    workstream_operating_loop_goal_oracle_target_anchor_observed_count:
      record(workstreamOperatingLoop.summary).goal_oracle_target_anchor_observed_count,
    workstream_operating_loop_deliverable_target_ref_observed_count:
      record(workstreamOperatingLoop.summary).deliverable_target_ref_observed_count,
    workstream_operating_loop_goal_oracle_advisory_count:
      record(workstreamOperatingLoop.summary).goal_oracle_advisory_count,
    domain_current_work_unit_projection_count:
      record(domainCurrentWorkUnitProjection.summary).current_work_unit_count,
    current_work_unit_first_default_primary_source:
      currentWorkUnitFirstDefaultPrimarySource,
    current_work_unit_first_current_work_unit_count: currentWorkUnitItems.length,
    current_work_unit_first_default_payload_category:
      currentWorkUnitFirstDefaultPayloadCategory,
    current_work_unit_first_historical_attempt_backlog_is_default_next_step: false,
    current_work_unit_first_diagnostic_backlog_payload_category:
      currentWorkUnitFirstDiagnosticBacklogSeparation.historical_attempt_backlog_payload_category,
  };
  const memoryArtifactLifecycle = buildMemoryArtifactLifecycleEvidence({
    summary,
    lifecycle_ledger_refs: lifecycleRefs,
    memory_artifact_lifecycle_evidence_projection:
      memoryArtifactLifecycleEvidenceProjection,
  });
  const cleanupRetirement = buildCleanupRetirementProjection({
    defaultCallerDeletionEvidenceRefs,
    legacyCleanupPlans,
  });
  const sourceRefs: RuntimeTraySourceRef[] = uniqueByRef([
    sourceRef('/runtime_tray_snapshot/stage_attempt_workbench', 'stage_attempt_workbench'),
    sourceRef('/runtime_tray_snapshot/domain_projection_ingestion', 'domain_projection_ingestion'),
    sourceRef('/runtime_tray_snapshot/provider_continuous_proof', 'provider_continuous_proof'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown', 'app_operator_drilldown'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/codex_app_runtime_role', 'codex_app_runtime_role'),
    appReleaseUserPathEvidenceSourceRef(),
    sourceRef(
      '/runtime_tray_snapshot/app_operator_drilldown/developer_mode_live_closeout_evidence',
      'developer_mode_live_closeout_evidence',
    ),
    sourceRef('/app-release-user-path-evidence-ledger', 'app_release_user_path_evidence_ledger'),
    sourceRef(
      '/memory-artifact-lifecycle-evidence-ledger',
      'memory_artifact_lifecycle_evidence_ledger',
    ),
    sourceRef('/runtime_manager/family_runtime_stage_attempt_index/domain_route_projection', 'runtime_manager_domain_route_support'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/route_transition_drilldown', 'route_transition_drilldown'),
    sourceRef('/family-runtime/lifecycle-index', 'family_runtime_lifecycle_index'),
    sourceRef('/external-evidence-ledger', 'external_evidence_ledger'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/production_evidence_tail_ledger', 'production_evidence_tail_ledger'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs', 'domain_evidence_request_refs'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/domain_owner_payload_summary_refs', 'domain_owner_payload_summary_refs'),
    sourceRef(
      '/runtime_tray_snapshot/app_operator_drilldown/'
      + 'owner_evidence_sustained_consumption_refs',
      'owner_evidence_sustained_consumption_refs',
    ),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/domain_legacy_cleanup_plan_refs', 'domain_legacy_cleanup_plan_refs'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/default_caller_deletion_evidence_refs', 'default_caller_deletion_evidence_refs'),
    sourceRef('/runtime_tray_snapshot/app_operator_drilldown/evidence_envelope', 'evidence_envelope'),
    sourceRef(
      '/runtime_tray_snapshot/app_operator_drilldown/semantic_conventions',
      'semantic_conventions',
    ),
    sourceRef(
      '/runtime_tray_snapshot/app_operator_drilldown/runtime_visualization_projection',
      'runtime_visualization_projection',
    ),
    sourceRef(
      '/runtime_tray_snapshot/app_operator_drilldown/standard_agent_template_consumption_refs',
      'standard_agent_template_consumption_refs',
    ),
    sourceRef(
      '/runtime_tray_snapshot/app_operator_drilldown/workstream_operating_loop',
      'workstream_operating_loop_projection',
    ),
    sourceRef(
      '/runtime_tray_snapshot/app_operator_drilldown/current_work_unit_first_read_model',
      'current_work_unit_first_read_model',
    ),
    sourceRef(
      '/standard-agent-template-consumption-ledger',
      'standard_agent_template_consumption_ledger',
    ),
  ]);

  return applyAppOperatorDrilldownDetail({
    surface_kind: 'opl_app_operator_drilldown_read_model',
    projection_scope: 'runtime_snapshot',
    consumer: 'one_person_lab_app_operator_workbench',
    availability:
      attempts.length > 0 || domainRefs.length > 0 || providerActionRefs.length > 0
        ? 'available'
        : 'empty',
    projection_policy: 'refs_only_no_domain_truth_memory_body_artifact_body_or_verdict',
    summary,
    stage_progress_log: record(input.stageAttemptWorkbench.stage_progress_log),
    attempt_true_path_proofs: truePathProofs,
    codex_app_runtime_role: appRuntimeRole,
    route_graph_refs: {
      surface_kind: 'opl_app_drilldown_route_graph_refs',
      refs: routeRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    decision_map_refs: {
      surface_kind: 'opl_app_drilldown_decision_map_refs',
      refs: decisionRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    review_repair_queue_refs: {
      surface_kind: 'opl_app_drilldown_review_repair_queue_refs',
      items: reviewItems,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    artifact_gallery_refs: {
      surface_kind: 'opl_app_drilldown_artifact_gallery_refs',
      content_policy: 'locator_only_no_artifact_content',
      refs: artifactRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    package_export_lifecycle_refs: packageLifecycle,
    memory_writeback_refs: memoryRefs,
    memory_trace_projection: memoryTrace,
    effective_current_context: effectiveCurrentContext,
    family_stall_lineage: familyStallLineage,
    quality_readiness_refs: qualityRefs,
    provider_slo_operator_action_refs: {
      surface_kind: 'opl_app_drilldown_provider_slo_operator_action_refs',
      refs: providerActionRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    provider_long_soak_evidence: providerLongSoakEvidence,
    app_release_user_path_evidence: appReleaseUserPathEvidence,
    memory_artifact_lifecycle: memoryArtifactLifecycle,
    memory_artifact_lifecycle_evidence_projection:
      memoryArtifactLifecycleEvidenceProjection,
    developer_mode_live_closeout_evidence: developerModeLiveCloseoutEvidence,
    runtime_manager_route_support: runtimeManagerRouteSupport,
    route_transition_drilldown: routeTransitionDrilldownRefs,
    periodic_execution_refs: periodicRefs,
    operator_action_routing_refs: {
      surface_kind: 'opl_app_drilldown_operator_action_routing_refs',
      refs: actionRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    owner_receipt_refs: {
      surface_kind: 'opl_app_drilldown_owner_receipt_refs',
      refs: ownerReceipts,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    typed_blocker_refs: {
      surface_kind: 'opl_app_drilldown_typed_blocker_refs',
      refs: typedBlockers.refs,
      blockers: typedBlockers.blockers,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    domain_dispatch_evidence: domainDispatchEvidence,
    stage_production_evidence: stageProductionEvidence,
    freshness_refs: {
      surface_kind: 'opl_app_drilldown_freshness_refs',
      refs: freshness,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    ref_family_refs: refFamilies,
    current_control_state: currentControlState,
    safe_action_refs: {
      surface_kind: 'opl_app_drilldown_safe_action_refs',
      refs: safeActions,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    app_execution_bridge: executionBridge,
    lifecycle_ledger_refs: lifecycleRefs,
    domain_projection_refs: {
      surface_kind: 'opl_app_drilldown_domain_projection_refs',
      refs: domainRefs,
      authority_boundary: refsOnlyAuthorityBoundary(),
    },
    domain_owner_payload_summary_refs: domainOwnerPayloadSummaryRefs,
    owner_evidence_sustained_consumption_refs:
      ownerEvidenceSustainedConsumptionFollowthroughRefs,
    domain_evidence_request_refs: evidenceRequests,
    production_evidence_tail_ledger: productionEvidenceTailLedger,
    evidence_envelope: evidenceEnvelope,
    semantic_conventions: record(record(evidenceEnvelope).semantic_conventions),
    runtime_visualization_projection: runtimeVisualizationProjection,
    workstream_operating_loop: workstreamOperatingLoop,
    current_work_unit_first_read_model: currentWorkUnitFirstReadModel,
    domain_current_work_unit_projection: domainCurrentWorkUnitProjection,
    runtime_workbench: {
      ...record(runtimeVisualizationProjection.runtime_workbench),
      memory_trace_projection: memoryTrace,
      workstream_operating_loop: workstreamOperatingLoop,
      current_work_unit_first_read_model: currentWorkUnitFirstReadModel,
      domain_current_work_unit_projection: domainCurrentWorkUnitProjection,
    },
    visual_ref_groups: record(runtimeVisualizationProjection.visual_ref_groups),
    domain_legacy_cleanup_plan_refs: legacyCleanupPlans,
    cleanup_retirement: cleanupRetirement,
    standard_agent_template_consumption_refs: standardAgentTemplateConsumption,
    functional_privatization_audit_summary: functionalSummary,
    functional_privatization_audit_refs: functionalAuditRefs,
    default_caller_deletion_evidence_refs: defaultCallerDeletionEvidenceRefs,
    authority_boundary: refsOnlyAuthorityBoundary(),
    source_refs: sourceRefs,
    non_goals: [
      'does_not_write_domain_truth',
      'does_not_read_or_store_memory_body',
      'does_not_read_or_mutate_artifact_body',
      'does_not_authorize_quality_readiness_or_export_verdict',
      'does_not_directly_execute_domain_actions',
    ],
  }, input.detailLevel ?? 'summary');
}

export type { AppOperatorDrilldownDetailLevel };
