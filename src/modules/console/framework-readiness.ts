import type { FrameworkContracts } from '../../kernel/types.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  buildDomainManifestCatalog,
  buildStandardAgentDomainManifestCatalog,
  defaultStandardDomainAgentRepoInputs,
  DEFAULT_STANDARD_DOMAIN_AGENT_REPOS,
  type DomainManifestCatalog,
} from '../atlas/index.ts';
import { listStandardDomainAgentIds } from '../../kernel/standard-agent-registry.ts';
import { buildDomainPackCompilerList } from '../pack/index.ts';
import {
  buildDomainRouteSupportProjection,
  requireRuntimeTraySnapshotProvider,
  runFamilyRuntimeEvidenceWorklist,
  type RuntimeTraySnapshotProvider,
} from '../runway/index.ts';
import {
  buildFamilyStageReadinessInspect,
  buildFamilyStagesList,
} from '../stagecraft/index.ts';
import { buildOplFrameworkSemanticHygieneAudit } from './framework-semantic-hygiene.ts';
import {
  evidenceEnvelopeOpenCount,
  evidenceEnvelopeSummary,
} from '../ledger/index.ts';
import { frameworkAttentionFirstPayload } from './framework-readiness-attention-first-payload.ts';
import { frameworkDiagnosticDrilldowns, frameworkKernelFloor } from './framework-readiness-static-surfaces.ts';
import {
  frameworkStatusFromAttentionCounts,
  openSafeActionPayloadCounts,
  splitOperatorAttentionCountsWithSafeActionPayload,
} from './framework-readiness-attention-counts.ts';
import {
  semanticHygieneContractFloor,
} from './framework-readiness-semantic-hygiene.ts';
import {
  FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS,
  frameworkReadinessStageSourceCommand,
} from './framework-readiness-source-commands.ts';
import { domainBlockedTypedBlockerAttention } from './framework-readiness-typed-blocker-attention.ts';
import { buildOwnerDeltaHandoffSummaryFromFrameworkReadiness, OWNER_DELTA_HANDOFF_TAXONOMY, ownerDeltaHandoffFrameworkReadinessSection } from './framework-readiness-owner-delta-handoff-summary.ts';
import { buildCurrentOwnerDeltaTopline } from '../ledger/index.ts';
import {
  booleanValue,
  countValue,
  type JsonRecord,
  numberValue,
  record,
  recordList,
  stringValue,
} from './framework-readiness-values.ts';
import {
  frameworkReadinessAuthorityBoundary,
  frameworkReadinessDiagnosticFailure,
} from './framework-readiness-diagnostics.ts';
import { guardedProviderSloOpenTailCount } from './framework-readiness-provider-slo.ts';
import { buildAgentReadinessDiagnostic } from './framework-readiness-agent-diagnostic.ts';

type FrameworkReadinessInput = {
  familyDefaults: boolean;
};

type FrameworkReadinessOptions = {
  runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
};

const FRAMEWORK_READINESS_MANIFEST_COMMAND_TIMEOUT_MS = 5_000;

function stageReadinessSummary(readiness: JsonRecord) {
  return record(readiness.summary);
}

function isDomainManifestConfigAttentionStageDiagnostic(error: unknown) {
  if (!(error instanceof FrameworkContractError)) {
    return false;
  }
  if (error.code !== 'missing_family_stage_control_plane') {
    return false;
  }
  const manifestStatus = record(error.details).manifest_status;
  return manifestStatus === 'workspace_missing'
    || manifestStatus === 'manifest_not_configured';
}

function buildStageReadinessDiagnostic(
  contracts: FrameworkContracts,
  domain: string,
  domainManifests: DomainManifestCatalog,
) {
  const sourceCommand = frameworkReadinessStageSourceCommand(domain);
  try {
    return {
      readiness: record(buildFamilyStageReadinessInspect(
        contracts,
        ['--domain', domain],
        { domainManifests },
      ).family_stage_readiness),
      failure: null,
    };
  } catch (error) {
    if (isDomainManifestConfigAttentionStageDiagnostic(error)) {
      const diagnostic = frameworkReadinessDiagnosticFailure(`stages_readiness_${domain}`, sourceCommand, error);
      const manifestStatus = record(diagnostic.details).manifest_status;
      return {
        readiness: {
          surface_kind: 'opl_family_stage_readiness_diagnostic_unavailable',
          detail_level: 'summary',
          status: manifestStatus === 'workspace_missing'
            ? 'stale_workspace_binding_attention'
            : 'domain_manifest_config_attention',
          summary: {
            stage_count: 0,
            admitted_stage_count: 0,
            needs_contracts_stage_count: 0,
            blocked_stage_count: 0,
            hard_blocker_count: 0,
            warning_count: 1,
            diagnostic_failure_count: 0,
          },
          domain_manifest_config_attention: diagnostic,
          authority_boundary: {
            can_execute_stage: false,
            can_write_domain_truth: false,
            can_authorize_domain_ready: false,
            can_authorize_quality_verdict: false,
            can_mutate_artifact_body: false,
            can_claim_domain_ready: false,
            can_claim_artifact_authority: false,
            can_claim_production_ready: false,
          },
        },
        failure: null,
      };
    }
    const failure = frameworkReadinessDiagnosticFailure(`stages_readiness_${domain}`, sourceCommand, error);
    return {
      readiness: {
        surface_kind: 'opl_family_stage_readiness_diagnostic_unavailable',
        detail_level: 'summary',
        status: 'diagnostic_unavailable',
        summary: {
          stage_count: 0,
          admitted_stage_count: 0,
          needs_contracts_stage_count: 0,
          blocked_stage_count: 0,
          hard_blocker_count: 0,
          warning_count: 0,
          diagnostic_failure_count: 1,
        },
        diagnostic_failure: failure,
        authority_boundary: {
          can_execute_stage: false,
          can_write_domain_truth: false,
          can_authorize_domain_ready: false,
          can_authorize_quality_verdict: false,
          can_mutate_artifact_body: false,
          can_claim_domain_ready: false,
          can_claim_artifact_authority: false,
          can_claim_production_ready: false,
        },
      },
      failure,
    };
  }
}

export async function buildFrameworkReadinessSummary(
  contracts: FrameworkContracts,
  input: FrameworkReadinessInput,
  options: FrameworkReadinessOptions = {},
) {
  const runtimeSnapshotProvider = requireRuntimeTraySnapshotProvider(
    options.runtimeSnapshotProvider,
    'framework readiness',
  );
  const semanticHygiene = buildOplFrameworkSemanticHygieneAudit(contracts);
  const agentReadinessDiagnostic = buildAgentReadinessDiagnostic();
  const agentReadiness = agentReadinessDiagnostic.readiness;
  const generatedDefaultEntrySourceOfWork =
    record(record(agentReadiness).generated_default_entry_source_of_work);
  const domainManifests = buildDomainManifestCatalog(contracts, {
        manifestCommandTimeoutMs: FRAMEWORK_READINESS_MANIFEST_COMMAND_TIMEOUT_MS,
        manifestCommandTimeoutPolicy: 'fixed',
        materializeFamilyTransitions: false,
        useProjectionCacheOnFailure: true,
      }).domain_manifests;
  const standardAgentDomainManifests = buildStandardAgentDomainManifestCatalog(contracts, {
    legacyDomainManifests: domainManifests,
  }).domain_manifests;
  const packCompiler = record(buildDomainPackCompilerList(contracts, {
    familyDefaults: true,
    familyRepoInputs: defaultStandardDomainAgentRepoInputs(),
    defaultRepoDirectories: DEFAULT_STANDARD_DOMAIN_AGENT_REPOS.map((repo) => repo.directory),
  }).domain_pack_compiler);
  const familyStages = record(buildFamilyStagesList(
    contracts,
    { domainManifests: standardAgentDomainManifests },
  ).family_stages);
  const familyStageReadiness = record(buildFamilyStageReadinessInspect(
    contracts,
    ['--family-defaults', '--detail', 'full'],
    { domainManifests: standardAgentDomainManifests },
  ).family_stage_readiness);
  const standardAgentIds = listStandardDomainAgentIds();
  const stageReadinessDiagnostics = Object.fromEntries(standardAgentIds.map((agentId) => [
    agentId,
    buildStageReadinessDiagnostic(contracts, agentId, standardAgentDomainManifests),
  ]));
  const stageReadiness = Object.fromEntries(Object.entries(stageReadinessDiagnostics).map(
    ([agentId, diagnostic]) => [agentId, diagnostic.readiness],
  ));
  const runtimeSnapshot = await runtimeSnapshotProvider(contracts, {
    appOperatorDrilldownDetailLevel: 'full',
    domainManifests,
    providerKind: 'temporal',
  });
  const appOperatorDrilldown = record(runtimeSnapshot.runtime_tray_snapshot.app_operator_drilldown);
  const familyRuntimeEvidenceWorklist = record(
    (await runFamilyRuntimeEvidenceWorklist(contracts, {
      familyDefaults: true,
      providerKind: 'temporal',
      executorKind: 'codex_cli',
      runtimeSnapshot,
      stageReadiness: familyStageReadiness,
    })).family_runtime_evidence_worklist,
  );

  const semanticSummary = record(semanticHygiene.summary);
  const agentSummary = record(agentReadiness.summary);
  const stageRunDomainAdoptionReadModel = record(record(agentReadiness).stage_run_domain_adoption_read_model);
  const packSummary = record(packCompiler.summary);
  const stagesSummary = record(familyStages.summary);
  const appSummary = record(appOperatorDrilldown.summary);
  const worklistSummary = record(familyRuntimeEvidenceWorklist.summary);
  const readinessEvidenceEnvelope = record(familyRuntimeEvidenceWorklist.evidence_envelope);
  const readinessEvidenceEnvelopeSummary = evidenceEnvelopeSummary(readinessEvidenceEnvelope);
  const readinessEvidenceEnvelopeOpenCount = evidenceEnvelopeOpenCount(readinessEvidenceEnvelope);
  const readinessEvidenceEnvelopeBlockedCount = numberValue(readinessEvidenceEnvelopeSummary.blocked_envelope_count);
  const typedBlockerAttention = domainBlockedTypedBlockerAttention({
    worklistSummary,
    nextActionLedger: familyRuntimeEvidenceWorklist.next_action_ledger,
    evidenceEnvelopeSummary: readinessEvidenceEnvelopeSummary,
    evidenceEnvelopeProjection: appOperatorDrilldown.evidence_envelope,
  });
  const appEvidenceAfterContract = record(record(appOperatorDrilldown.attention_first_payload).evidence_after_contract);
  const ownerDeltaFirst = record(record(appOperatorDrilldown.attention_first_payload).owner_delta_first);
  const ownerPayloadGroups = recordList(appEvidenceAfterContract.owner_payload_groups);
  const domainOwnerPayloadSummaryAttention =
    record(appEvidenceAfterContract.domain_owner_payload_summary_attention);
  const ownerHandoffPacket = record(appEvidenceAfterContract.owner_handoff_packet);
  const memoryArtifactLifecycleEvidence = record(
    appEvidenceAfterContract.memory_artifact_lifecycle_evidence,
  );
  const appReleaseUserPathEvidence = record(
    appEvidenceAfterContract.app_release_user_path_evidence,
  );
  const developerModeLiveCloseoutEvidence = record(
    appEvidenceAfterContract.developer_mode_live_closeout_evidence,
  );
  const workstreamOperatingLoop = record(
    record(appOperatorDrilldown.attention_first_payload).workstream_operating_loop,
  );
  const ownerPayloadGroupAttentionCount =
    numberValue(appEvidenceAfterContract.owner_payload_group_attention_count);
  const ownerPayloadGroupAttentionOmittedCount =
    numberValue(appEvidenceAfterContract.owner_payload_group_attention_omitted_count);
  const domainOwnerPayloadSummaryNamingHygieneBlockerCount =
    numberValue(domainOwnerPayloadSummaryAttention.naming_hygiene_blocker_count);
  const familyStallLineage = record(appOperatorDrilldown.family_stall_lineage);
  const stageSummaries = Object.fromEntries(
    Object.entries(stageReadiness).map(([domain, readiness]) => [domain, stageReadinessSummary(readiness)]),
  );
  const stageHardBlockerCount = Object.values(stageSummaries).reduce(
    (total, summary) => total + numberValue(record(summary).hard_blocker_count),
    0,
  );
  const stageWarningCount = Object.values(stageSummaries).reduce(
    (total, summary) => total + numberValue(record(summary).warning_count),
    0,
  );
  const diagnosticFailures = [
    agentReadinessDiagnostic.failure,
    ...Object.values(stageReadinessDiagnostics).map((entry) => entry.failure),
  ]
    .filter((entry): entry is ReturnType<typeof frameworkReadinessDiagnosticFailure> => entry !== null);
  const stageReadinessDiagnosticFailures = Object.values(stageReadinessDiagnostics)
    .map((entry) => entry.failure)
    .filter((entry): entry is ReturnType<typeof frameworkReadinessDiagnosticFailure> => entry !== null);
  const agentReadinessDiagnosticFailureCount = agentReadinessDiagnostic.failure === null ? 0 : 1;
  const stageReadinessDiagnosticFailureCount = stageReadinessDiagnosticFailures.length;
  const diagnosticFailureCount = diagnosticFailures.length;
  const packCompilerBlockedDomainCount = numberValue(packSummary.blocked_domain_count);
  const packCompilerOwnerClaimCount = numberValue(packSummary.domain_generated_surface_owner_claim_count);
  const packCompilerDriftDetectedCount = numberValue(packSummary.generated_artifact_drift_detected_count);
  const packCompilerBlockerCount = Math.max(
    packCompilerBlockedDomainCount,
    packCompilerOwnerClaimCount,
    packCompilerDriftDetectedCount,
  );
  const appRawOpenTailCount = numberValue(appSummary.app_operator_production_evidence_tail_open_item_count);
  const providerSloGuardedOpenTailCount = guardedProviderSloOpenTailCount(appOperatorDrilldown);
  const appOpenTailCount = Math.max(appRawOpenTailCount - providerSloGuardedOpenTailCount, 0);
  const stageProductionCallerTailCount = numberValue(appSummary.stage_production_evidence_missing_caller_stage_count);
  const evidenceWorklistOpenCount = countValue(worklistSummary.open_worklist_item_count);
  const openSafeActionPayload = openSafeActionPayloadCounts({
    openSafeActionItemCount: countValue(worklistSummary.open_safe_action_item_count),
    openSafeActionPayloadRequiredCount:
      countValue(worklistSummary.open_safe_action_payload_required_item_count),
    openSafeActionPayloadFreeCount:
      countValue(worklistSummary.open_safe_action_payload_free_item_count),
    openSafeActionPayloadRequirementSemantics:
      stringValue(worklistSummary.open_safe_action_payload_requirement_semantics),
  });
  const stageReceiptFreshnessOpenWorkorderCount =
    countValue(worklistSummary.stage_receipt_freshness_open_workorder_count);
  const stageSourceScopeMissingWorkorderCount =
    countValue(worklistSummary.stage_source_scope_missing_workorder_count);
  const stageRuntimeEventMissingWorkorderCount =
    countValue(worklistSummary.stage_runtime_event_missing_workorder_count);
  const stageSourceScopeMissingRefCount =
    countValue(worklistSummary.stage_source_scope_missing_ref_count);
  const stageRuntimeEventMissingRefCount =
    countValue(worklistSummary.stage_runtime_event_missing_ref_count);
  const stageEvidenceWorkorderAttentionItems =
    recordList(familyRuntimeEvidenceWorklist.stage_evidence_workorder_attention_items);
  const stageReplayMissingReceiptWorkorderCount =
    countValue(worklistSummary.stage_replay_missing_receipt_workorder_count);
  const stageReplayMissingReceiptRefCount =
    countValue(worklistSummary.stage_replay_missing_receipt_ref_count);
  const stageReplayMissingHumanGateRefCount =
    countValue(worklistSummary.stage_replay_missing_human_gate_ref_count);
  const stageReplayMissingReceiptWorkorderAttentionItems =
    recordList(familyRuntimeEvidenceWorklist.stage_replay_missing_receipt_workorder_attention_items);
  const stageReplayMissingReceiptWorkorderAttentionSummary =
    record(familyRuntimeEvidenceWorklist.stage_replay_missing_receipt_workorder_attention_summary);
  const domainDispatchEvidenceWorkorderAttentionItems =
    recordList(familyRuntimeEvidenceWorklist.domain_dispatch_evidence_workorder_attention_items);
  const domainDispatchEvidenceWorkorderGroupAttentionItems =
    recordList(familyRuntimeEvidenceWorklist.domain_dispatch_evidence_workorder_group_attention_items);
  const domainDispatchEvidenceWorkorderSummary =
    record(familyRuntimeEvidenceWorklist.domain_dispatch_evidence_workorder_packet_summary);
  const agentProductionEvidenceTailTotalCount =
    numberValue(agentSummary.agent_readiness_production_evidence_tail_count);
  const agentProductionEvidenceTailLedgerSummary = record(
    record(record(agentReadiness).production_evidence_tail_ledger).summary,
  );
  const agentStructuralEvidenceTailCount =
    numberValue(agentProductionEvidenceTailLedgerSummary.open_tail_item_count);
  const agentProductionEvidenceTailClosedCount =
    numberValue(agentProductionEvidenceTailLedgerSummary.closed_tail_item_count);
  const appLiveEvidenceTailCount = appOpenTailCount;
  const stageReceiptFreshnessTailCount =
    stageProductionCallerTailCount + stageReceiptFreshnessOpenWorkorderCount;
  const semanticAttentionGateCount = numberValue(semanticSummary.attention_required_gate_count);
  const domainDispatchAttentionCount =
    numberValue(appSummary.domain_dispatch_attention_count)
    || (
      numberValue(appSummary.domain_dispatch_attention_typed_blocker_stage_count)
      + numberValue(appSummary.domain_dispatch_attention_missing_owner_chain_count)
    );
  const runtimeManagerRouteSupport = record(appOperatorDrilldown.runtime_manager_route_support);
  const runtimeManagerDomainRouteSupport = Object.keys(record(runtimeManagerRouteSupport.domain_route_projection)).length > 0
    ? record(runtimeManagerRouteSupport.domain_route_projection)
    : buildDomainRouteSupportProjection();
  const runtimeManagerRouteSupportTaskKinds = Array.isArray(runtimeManagerDomainRouteSupport.canonical_task_kinds)
    ? runtimeManagerDomainRouteSupport.canonical_task_kinds
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const runtimeManagerRouteSupportAuthorityBoundary = {
    can_write_domain_truth: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_close_owner_chain: false,
    can_record_owner_receipt: false,
    can_authorize_domain_route: false,
    ...record(runtimeManagerRouteSupport.authority_boundary),
  };
  const developerModeLiveCloseoutAttentionCount =
    numberValue(developerModeLiveCloseoutEvidence.attention_count);
  const openTailCount =
    agentStructuralEvidenceTailCount + appLiveEvidenceTailCount + stageReceiptFreshnessTailCount;
  const evidenceEnvelopeAttentionCount = readinessEvidenceEnvelopeOpenCount + readinessEvidenceEnvelopeBlockedCount;
  const attentionCounts = splitOperatorAttentionCountsWithSafeActionPayload({
    openTailCount,
    evidenceEnvelopeOpenCount: readinessEvidenceEnvelopeOpenCount,
    evidenceEnvelopeBlockedCount: readinessEvidenceEnvelopeBlockedCount,
    domainDispatchAttentionCount,
    stageSourceScopeMissingWorkorderCount,
    stageRuntimeEventMissingWorkorderCount,
    developerModeLiveCloseoutAttentionCount,
    openSafeActionPayloadRequiredCount: openSafeActionPayload.openSafeActionPayloadRequiredCount,
    openSafeActionPayloadFreeCount: openSafeActionPayload.openSafeActionPayloadFreeCount,
  });
  const agentHardBlockerCount = numberValue(agentSummary.conformance_blocked_count);
  const generatedDefaultEntrySourceOfWorkBlockedCount =
    numberValue(generatedDefaultEntrySourceOfWork.blocked_domain_count);
  const hardBlockerCount =
    agentHardBlockerCount + stageHardBlockerCount + packCompilerBlockerCount;
  const frameworkStatus = frameworkStatusFromAttentionCounts({
    openTailCount,
    operatorActionableAttentionCount: attentionCounts.operatorActionableAttentionCount,
    domainBlockedAttentionCount: attentionCounts.domainBlockedAttentionCount,
    semanticAttentionGateCount,
    hardBlockerCount,
  });
  const ownerDeltaHandoffSummary = buildOwnerDeltaHandoffSummaryFromFrameworkReadiness({
    ownerDeltaFirst,
    ownerHandoffPacket,
    domainDispatchEvidenceWorkorderSummary,
    openSafeActionPayload,
    attentionCounts,
    readinessEvidenceEnvelopeOpenCount,
    readinessEvidenceEnvelopeBlockedCount,
    stageReplayMissingReceiptWorkorderCount,
  });
  const attentionFirstPayload = frameworkAttentionFirstPayload({
    status: frameworkStatus,
    semanticHygieneContractFloor: semanticHygieneContractFloor(
      semanticHygiene,
      SOURCE_COMMANDS.semantic_hygiene,
    ),
    hardBlockerCount,
    agentHardBlockerCount,
    generatedDefaultEntrySourceOfWorkBlockedCount,
    stageHardBlockerCount,
    packCompilerBlockerCount,
    diagnosticFailureCount,
    semanticAttentionGateCount,
    stageWarningCount,
    agentStructuralEvidenceTailCount,
    appLiveEvidenceTailCount,
    appLiveEvidenceTailRawCount: appRawOpenTailCount,
    appLiveEvidenceTailGuardedByProviderWorkerMutationCount: providerSloGuardedOpenTailCount,
    stageReceiptFreshnessTailCount,
    stageSourceScopeMissingWorkorderCount,
    stageRuntimeEventMissingWorkorderCount,
    stageSourceScopeMissingRefCount,
    stageRuntimeEventMissingRefCount,
    stageEvidenceWorkorderAttentionItems,
    stageReplayMissingReceiptWorkorderCount,
    stageReplayMissingReceiptRefCount,
    stageReplayMissingHumanGateRefCount,
    stageReplayMissingReceiptWorkorderAttentionSummary,
    stageReplayMissingReceiptWorkorderAttentionItems,
    ownerPayloadGroupAttentionCount,
    ownerPayloadGroupAttentionOmittedCount,
    ownerPayloadGroups,
    ownerDeltaFirst,
    ownerDeltaHandoffSummary,
    domainOwnerPayloadSummaryAttention,
    ownerHandoffPacket,
    memoryArtifactLifecycleEvidence,
    appReleaseUserPathEvidence,
    developerModeLiveCloseoutEvidence,
    workstreamOperatingLoop,
    familyStallLineage,
    domainDispatchEvidenceWorkorderGroupAttentionItems,
    domainDispatchEvidenceWorkorderAttentionItems,
    domainDispatchEvidenceWorkorderSummary,
    evidenceEnvelopeOpenCount: readinessEvidenceEnvelopeOpenCount,
    evidenceEnvelopeBlockedCount: readinessEvidenceEnvelopeBlockedCount,
    domainDispatchAttentionCount,
    openSafeActionPayloadRequiredCount:
      openSafeActionPayload.openSafeActionPayloadRequiredCount,
    openSafeActionPayloadFreeCount:
      openSafeActionPayload.openSafeActionPayloadFreeCount,
    domainBlockedTypedBlockerRefCount: typedBlockerAttention.typedBlockerRefCount,
    domainBlockedUniqueTypedBlockerRefCount: typedBlockerAttention.uniqueTypedBlockerRefCount,
    domainBlockedTypedBlockerGroupCount: typedBlockerAttention.typedBlockerGroupCount,
    domainBlockedAttentionGroupingSemantics: typedBlockerAttention.groupingSemantics,
    providerSloCadenceWindowStatus: appSummary.provider_slo_cadence_window_status,
    providerSloCapabilityStatus: appSummary.provider_slo_capability_status,
  });
  const ownerDeltaTopline = buildCurrentOwnerDeltaTopline({
    currentOwnerDeltaReadModel: attentionFirstPayload.current_owner_delta_read_model,
  });
  const summary = {
    control_plane_available: true,
    framework_kernel_hard_blocker_count: hardBlockerCount,
    agent_conformance_hard_blocker_count: agentHardBlockerCount,
    generated_default_entry_source_of_work_blocked_count:
      generatedDefaultEntrySourceOfWorkBlockedCount,
    stage_readiness_hard_blocker_count: stageHardBlockerCount,
    pack_compiler_hard_blocker_count: packCompilerBlockerCount,
    framework_diagnostic_failure_count: diagnosticFailureCount,
    semantic_hygiene_attention_required_gate_count: semanticAttentionGateCount,
    agent_structural_evidence_tail_open_count: agentStructuralEvidenceTailCount,
    provider_slo_guarded_open_tail_count: providerSloGuardedOpenTailCount,
    app_live_evidence_tail_raw_open_count: appRawOpenTailCount,
    app_live_evidence_tail_open_count: appLiveEvidenceTailCount,
    app_live_evidence_tail_guarded_by_provider_worker_mutation_count:
      providerSloGuardedOpenTailCount,
    stage_receipt_freshness_tail_open_count: stageReceiptFreshnessTailCount,
    stage_source_scope_missing_workorder_count: stageSourceScopeMissingWorkorderCount,
    stage_runtime_event_missing_workorder_count: stageRuntimeEventMissingWorkorderCount,
    stage_source_scope_missing_ref_count: stageSourceScopeMissingRefCount,
    stage_runtime_event_missing_ref_count: stageRuntimeEventMissingRefCount,
    stage_replay_missing_receipt_workorder_count:
      stageReplayMissingReceiptWorkorderCount,
    stage_replay_missing_receipt_ref_count:
      stageReplayMissingReceiptRefCount,
    stage_replay_missing_human_gate_ref_count:
      stageReplayMissingHumanGateRefCount,
    evidence_envelope_open_count: readinessEvidenceEnvelopeOpenCount,
    evidence_envelope_blocked_count: readinessEvidenceEnvelopeBlockedCount,
    evidence_envelope_attention_count: evidenceEnvelopeAttentionCount,
    domain_dispatch_attention_count: domainDispatchAttentionCount,
    domain_owner_payload_summary_naming_hygiene_blocker_count:
      domainOwnerPayloadSummaryNamingHygieneBlockerCount,
    operator_actionable_attention_tail_count: attentionCounts.operatorActionableAttentionCount,
    operator_payload_required_attention_tail_count: attentionCounts.operatorPayloadRequiredAttentionCount,
    operator_payload_free_attention_tail_count: attentionCounts.operatorPayloadFreeAttentionCount,
    domain_blocked_attention_tail_count: attentionCounts.domainBlockedAttentionCount,
    domain_blocked_typed_blocker_ref_count: typedBlockerAttention.typedBlockerRefCount,
    domain_blocked_unique_typed_blocker_ref_count: typedBlockerAttention.uniqueTypedBlockerRefCount,
    domain_blocked_typed_blocker_group_count: typedBlockerAttention.typedBlockerGroupCount,
    domain_blocked_attention_grouping_semantics: typedBlockerAttention.groupingSemantics,
    runtime_manager_domain_route_support_task_kind_count: runtimeManagerRouteSupportTaskKinds.length,
    runtime_manager_domain_route_task_kind_prefix:
      stringValue(runtimeManagerDomainRouteSupport.supported_task_kind_prefix),
    runtime_manager_domain_route_action_ref_source:
      stringValue(runtimeManagerDomainRouteSupport.action_ref_source),
    domain_manifest_projection_cache_used_count:
      numberValue(domainManifests.summary.projection_cache_used_count),
    domain_manifest_stale_binding_count:
      numberValue(domainManifests.summary.stale_binding_count),
    domain_manifest_stale_binding_project_ids:
      Array.isArray(domainManifests.summary.stale_binding_project_ids)
        ? domainManifests.summary.stale_binding_project_ids
        : [],
    domain_manifest_not_configured_count:
      numberValue(domainManifests.summary.manifest_not_configured_count),
    domain_manifest_not_configured_project_ids:
      Array.isArray(domainManifests.summary.manifest_not_configured_project_ids)
        ? domainManifests.summary.manifest_not_configured_project_ids
        : [],
    domain_manifest_currentness_owner_action_packet_count:
      numberValue(domainManifests.summary.currentness_owner_action_packet_count),
    domain_manifest_currentness_owner_action_project_ids:
      Array.isArray(domainManifests.summary.currentness_owner_action_project_ids)
        ? domainManifests.summary.currentness_owner_action_project_ids
        : [],
    domain_manifest_live_failed_project_ids:
      Array.isArray(domainManifests.summary.live_failed_project_ids)
        ? domainManifests.summary.live_failed_project_ids
        : [],
    domain_manifest_live_failure_timeout_ms_values:
      domainManifests.projects
        .map((entry) => record(record(entry.manifest_cache).source_error).timeout_ms)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
    total_operator_attention_tail_count: attentionCounts.totalAttentionCount,
    attention_tail_semantics: attentionCounts.semantics,
    attention_payload_requirement_semantics: attentionCounts.payloadRequirementSemantics,
    open_tail_count: openTailCount,
    provider_slo_cadence_window_status: appSummary.provider_slo_cadence_window_status ?? null,
    provider_slo_capability_status: appSummary.provider_slo_capability_status ?? null,
    workstream_operating_loop_workstream_count:
      numberValue(record(workstreamOperatingLoop.summary).workstream_count),
    workstream_operating_loop_artifact_first_review_available_count:
      numberValue(record(workstreamOperatingLoop.summary).artifact_first_review_available_count),
    workstream_operating_loop_goal_oracle_missing_count:
      numberValue(record(workstreamOperatingLoop.summary).goal_oracle_missing_count),
    workstream_operating_loop_goal_oracle_target_anchor_observed_count:
      numberValue(record(workstreamOperatingLoop.summary).goal_oracle_target_anchor_observed_count),
    workstream_operating_loop_deliverable_target_ref_observed_count:
      numberValue(record(workstreamOperatingLoop.summary).deliverable_target_ref_observed_count),
    workstream_operating_loop_goal_oracle_advisory_count:
      numberValue(record(workstreamOperatingLoop.summary).goal_oracle_advisory_count),
    owner_delta_handoff_status:
      ownerDeltaHandoffSummary.status ?? null,
    owner_delta_handoff_current_operator_action_state:
      ownerDeltaHandoffSummary.current_operator_action_state ?? null,
    owner_delta_handoff_next_owner:
      ownerDeltaHandoffSummary.next_owner ?? null,
  };
  return {
    version: 'g1',
    framework_readiness: {
      surface_kind: 'opl_framework_readiness_summary',
      owner: 'one-person-lab',
      family_defaults: input.familyDefaults === true,
      detail_level: 'summary',
      projection_detail_policy:
        'attention_first_kernel_floor_default_with_drilldown_refs',
      readiness_model: {
        mode: 'ai_first_contract_light',
        default_payload: 'operator_attention_summary',
        kernel_floor: 'minimum_control_plane_boundary_and_recoverability_floor_only',
        diagnostic_drilldowns_are_operator_or_audit_aids: true,
        ai_executor_internal_strategy_is_contract: false,
      },
      status: frameworkStatus,
      attention_first_payload: attentionFirstPayload,
      ...ownerDeltaTopline,
      kernel_floor: frameworkKernelFloor(),
      diagnostic_drilldowns: frameworkDiagnosticDrilldowns(SOURCE_COMMANDS),
      excluded_ready_verdicts: [
        'domain_ready_verdict',
        'quality_verdict',
        'artifact_authority_verdict',
        'production_ready_verdict',
      ],
      summary,
      domain_manifest_currentness_owner_action_packet:
        domainManifests.currentness_owner_action_packet ?? {
          surface_kind: 'opl_domain_manifest_currentness_owner_action_packet',
          status: 'clear',
          item_count: 0,
          project_ids: [],
          items: [],
          authority_boundary: frameworkReadinessAuthorityBoundary(),
        },
      source_commands: Object.values(SOURCE_COMMANDS),
      evidence_counter_taxonomy: {
        agent_structural_evidence_tail:
          'agents readiness structural-conformance evidence tail only',
        app_live_evidence_tail:
          'App/operator live production evidence tail ledger open items',
        stage_receipt_freshness_tail:
          'stage production caller, expected receipt, and monitor freshness workorders',
        evidence_envelope:
          'single refs-only owner/scope/payload-kind claim reading across stage, external evidence, domain dispatch, and cleanup receipts',
        domain_dispatch_attention:
          'App/operator owner-chain dispatch attention derived from stage evidence typed blockers and missing owner-chain refs without authorizing domain ready',
        runtime_manager_route_support:
          'Runtime Manager exposes a generic domain-route catalog projection only; support does not close owner-chain receipts or authorize domain ready',
        provider_slo_fields:
          'provider_slo_* fields describe Temporal provider cadence/capability SLO only',
        owner_delta_handoff: OWNER_DELTA_HANDOFF_TAXONOMY,
        retired_alias_policy:
          'family-runtime evidence-worklist is the only active worklist command; legacy production_closeout aliases are removed from active machine outputs',
      },
      evidence_tails: {
        agent_structural_evidence_tail: {
          source_command: SOURCE_COMMANDS.agents_readiness,
          open_item_count: agentStructuralEvidenceTailCount,
          total_item_count: agentProductionEvidenceTailTotalCount,
          closed_item_count: agentProductionEvidenceTailClosedCount,
          structural_conformance_status: agentSummary.structural_conformance_status ?? null,
          blocking_policy: 'operator_attention_only_not_domain_or_production_ready',
        },
        app_live_evidence_tail: {
          source_command: SOURCE_COMMANDS.app_operator_drilldown,
          open_item_count: appLiveEvidenceTailCount,
          raw_open_item_count: appRawOpenTailCount,
          guarded_by_provider_worker_mutation_count: providerSloGuardedOpenTailCount,
          blocking_policy:
            'operator_actionable_tail_excludes_provider_slo_routes_blocked_by_worker_mutation_guard',
        },
        stage_receipt_freshness_tail: {
          source_command: SOURCE_COMMANDS.family_runtime_evidence_worklist,
          open_item_count: stageReceiptFreshnessTailCount,
          production_caller_request_open_item_count: stageProductionCallerTailCount,
          receipt_freshness_open_workorder_count: stageReceiptFreshnessOpenWorkorderCount,
          source_scope_missing_workorder_count: stageSourceScopeMissingWorkorderCount,
          runtime_event_missing_workorder_count: stageRuntimeEventMissingWorkorderCount,
          source_scope_missing_ref_count: stageSourceScopeMissingRefCount,
          runtime_event_missing_ref_count: stageRuntimeEventMissingRefCount,
          stage_evidence_workorder_attention_items: stageEvidenceWorkorderAttentionItems,
          stage_replay_missing_receipt_workorder_count:
            stageReplayMissingReceiptWorkorderCount,
          stage_replay_missing_receipt_ref_count:
            stageReplayMissingReceiptRefCount,
          stage_replay_missing_human_gate_ref_count:
            stageReplayMissingHumanGateRefCount,
          stage_replay_missing_receipt_workorder_attention_summary:
            stageReplayMissingReceiptWorkorderAttentionSummary,
          stage_replay_missing_receipt_workorder_attention_items:
            stageReplayMissingReceiptWorkorderAttentionItems,
          domain_dispatch_evidence_workorder_packet_summary:
            domainDispatchEvidenceWorkorderSummary,
          domain_dispatch_evidence_workorder_group_attention_policy:
            'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
          domain_dispatch_evidence_workorder_group_attention_items:
            domainDispatchEvidenceWorkorderGroupAttentionItems,
          domain_dispatch_evidence_workorder_attention_items:
            domainDispatchEvidenceWorkorderAttentionItems,
          blocking_policy: 'operator_worklist_only_without_owner_receipt_or_monitor_freshness_authority',
        },
      },
      owner_delta_first: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        ...ownerDeltaFirst,
      },
      owner_delta_handoff_summary: ownerDeltaHandoffFrameworkReadinessSection({
        ownerDeltaHandoffSummary,
        sourceCommands: [
          SOURCE_COMMANDS.app_operator_drilldown,
          SOURCE_COMMANDS.family_runtime_evidence_worklist,
        ],
      }),
      semantic_hygiene: {
        source_command: SOURCE_COMMANDS.semantic_hygiene,
        summary: semanticSummary,
        authority_boundary: semanticHygiene.authority_boundary,
      },
      agent_conformance_tail: {
        source_command: SOURCE_COMMANDS.agents_readiness,
        status: agentReadiness.status,
        structural_conformance_status: agentSummary.structural_conformance_status ?? null,
        conformance_blocked_count: agentHardBlockerCount,
        agent_readiness_production_evidence_tail_count: agentProductionEvidenceTailTotalCount,
        agent_readiness_production_evidence_tail_open_count: agentStructuralEvidenceTailCount,
        agent_readiness_production_evidence_tail_closed_count: agentProductionEvidenceTailClosedCount,
        agent_readiness_production_evidence_tail_policy: agentSummary.agent_readiness_production_evidence_tail_policy ?? null,
        generated_default_entry_source_of_work_status:
          generatedDefaultEntrySourceOfWork.status ?? null,
        generated_default_entry_source_of_work_blocked_count:
          generatedDefaultEntrySourceOfWorkBlockedCount,
        generated_default_entry_source_of_work: generatedDefaultEntrySourceOfWork,
        stage_run_domain_adoption_status: agentSummary.stage_run_domain_adoption_status ?? null,
        stage_run_domain_adoption_domain_count: agentSummary.stage_run_domain_adoption_domain_count ?? null,
        stage_run_controlled_canary_evidence_scope: agentSummary.stage_run_controlled_canary_evidence_scope ?? null,
        stage_run_domain_adoption_read_model: stageRunDomainAdoptionReadModel,
        diagnostic_failure: agentReadinessDiagnostic.failure,
        authority_boundary: {
          ...(agentReadiness.authority_boundary ?? frameworkReadinessAuthorityBoundary()),
          stage_run_domain_adoption_authority_boundary: stageRunDomainAdoptionReadModel.authority_boundary ?? null,
        },
      },
      pack_compiler: {
        source_command: SOURCE_COMMANDS.pack_compiler,
        source_kind: packCompiler.source_kind,
        summary: packSummary,
        authority_boundary: packCompiler.authority_boundary ?? frameworkReadinessAuthorityBoundary(),
      },
      stages: {
        source_commands: [
          SOURCE_COMMANDS.stages_list,
          SOURCE_COMMANDS.stages_readiness_family,
          ...standardAgentIds.map(frameworkReadinessStageSourceCommand),
        ],
        summary: stagesSummary,
        readiness_by_domain: stageSummaries,
        diagnostic_failures: stageReadinessDiagnosticFailures,
        authority_boundary: {
          can_execute_stage: false,
          can_claim_stage_completion: false,
          can_claim_domain_ready: false,
          can_authorize_quality_verdict: false,
        },
      },
      app_operator_production_tail: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        app_operator_production_evidence_tail_item_count:
          numberValue(appSummary.app_operator_production_evidence_tail_item_count),
        app_operator_production_evidence_tail_open_item_count: appOpenTailCount,
        app_operator_production_evidence_tail_raw_open_item_count: appRawOpenTailCount,
        app_operator_production_evidence_tail_guarded_by_provider_worker_mutation_count:
          providerSloGuardedOpenTailCount,
        app_operator_production_evidence_tail_operator_actionable_open_item_count:
          appOpenTailCount,
        app_operator_production_evidence_tail_owner_group_count:
          numberValue(appSummary.app_operator_production_evidence_tail_owner_group_count),
        app_operator_production_evidence_tail_blocking_item_count:
          numberValue(appSummary.app_operator_production_evidence_tail_blocking_item_count),
        blocking_policy: 'reported_for_operator_attention_without_authorizing_domain_or_production_ready',
        authority_boundary: appOperatorDrilldown.authority_boundary ?? frameworkReadinessAuthorityBoundary(),
      },
      stage_production_caller_tail: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        stage_production_evidence_domain_count: numberValue(appSummary.stage_production_evidence_domain_count),
        stage_production_evidence_stage_count: numberValue(appSummary.stage_production_evidence_stage_count),
        stage_production_evidence_observed_stage_count:
          numberValue(appSummary.stage_production_evidence_observed_stage_count),
        stage_production_evidence_missing_caller_stage_count: stageProductionCallerTailCount,
        stage_production_evidence_missing_expected_receipt_stage_count:
          numberValue(appSummary.stage_production_evidence_missing_expected_receipt_stage_count),
        stage_production_evidence_missing_monitor_freshness_stage_count:
          numberValue(appSummary.stage_production_evidence_missing_monitor_freshness_stage_count),
        stage_production_attempt_request_route_count:
          numberValue(appSummary.stage_production_attempt_request_route_count),
        route_policy:
          'request_route_available_creates_opl_stage_attempt_request_only_without_domain_action_or_owner_receipt_closure',
        authority_boundary: frameworkReadinessAuthorityBoundary(),
      },
      evidence_worklist: {
        source_command: SOURCE_COMMANDS.family_runtime_evidence_worklist,
        surface_role: familyRuntimeEvidenceWorklist.surface_role ?? null,
        worklist_role: familyRuntimeEvidenceWorklist.worklist_role ?? null,
        lens_policy: familyRuntimeEvidenceWorklist.lens_policy ?? null,
        worklist_item_count: numberValue(worklistSummary.worklist_item_count),
        closed_worklist_item_count: numberValue(worklistSummary.closed_worklist_item_count),
        open_worklist_item_count: evidenceWorklistOpenCount,
        closed_refs_only_item_count: countValue(worklistSummary.closed_refs_only_item_count),
        open_safe_action_item_count: openSafeActionPayload.openSafeActionItemCount,
        open_safe_action_payload_required_item_count:
          openSafeActionPayload.openSafeActionPayloadRequiredCount,
        open_safe_action_payload_free_item_count:
          openSafeActionPayload.openSafeActionPayloadFreeCount,
        open_safe_action_payload_requirement_semantics:
          openSafeActionPayload.openSafeActionPayloadRequirementSemantics,
        stage_receipt_freshness_open_workorder_count: stageReceiptFreshnessOpenWorkorderCount,
        stage_source_scope_missing_workorder_count: stageSourceScopeMissingWorkorderCount,
        stage_runtime_event_missing_workorder_count: stageRuntimeEventMissingWorkorderCount,
        stage_source_scope_missing_ref_count: stageSourceScopeMissingRefCount,
        stage_runtime_event_missing_ref_count: stageRuntimeEventMissingRefCount,
        stage_evidence_workorder_attention_items: stageEvidenceWorkorderAttentionItems,
        stage_replay_missing_receipt_workorder_count:
          stageReplayMissingReceiptWorkorderCount,
        stage_replay_missing_receipt_ref_count:
          stageReplayMissingReceiptRefCount,
        stage_replay_missing_human_gate_ref_count:
          stageReplayMissingHumanGateRefCount,
        stage_replay_missing_receipt_workorder_attention_summary:
          stageReplayMissingReceiptWorkorderAttentionSummary,
        stage_replay_missing_receipt_workorder_attention_items:
          stageReplayMissingReceiptWorkorderAttentionItems,
        domain_dispatch_evidence_workorder_packet_summary:
          domainDispatchEvidenceWorkorderSummary,
        domain_dispatch_evidence_workorder_group_attention_policy:
          'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
        domain_dispatch_evidence_workorder_group_attention_items:
          domainDispatchEvidenceWorkorderGroupAttentionItems,
        domain_dispatch_evidence_workorder_attention_items:
          domainDispatchEvidenceWorkorderAttentionItems,
        effective_current_context: familyRuntimeEvidenceWorklist.effective_current_context ?? null,
        family_stall_lineage: familyRuntimeEvidenceWorklist.family_stall_lineage ?? null,
        next_action_item_count: numberValue(worklistSummary.next_action_item_count),
        next_action_typed_blocker_ref_count: typedBlockerAttention.nextActionTypedBlockerRefCount,
        next_action_unique_typed_blocker_ref_count:
          typedBlockerAttention.nextActionUniqueTypedBlockerRefCount,
        next_action_typed_blocker_group_count: typedBlockerAttention.nextActionTypedBlockerGroupCount,
        next_action_typed_blocker_attention_semantics:
          typedBlockerAttention.nextActionGroupingSemantics,
        provider_scheduler_item_count: numberValue(worklistSummary.provider_scheduler_item_count),
        stage_production_caller_item_count: numberValue(worklistSummary.stage_production_caller_item_count),
        external_evidence_item_count: numberValue(worklistSummary.external_evidence_item_count),
        evidence_gate_item_count: numberValue(worklistSummary.evidence_gate_item_count),
        legacy_cleanup_item_count: numberValue(worklistSummary.legacy_cleanup_item_count),
        worklist_item_is_completion_claim: false,
        authority_boundary: familyRuntimeEvidenceWorklist.authority_boundary ?? frameworkReadinessAuthorityBoundary(),
      },
      evidence_envelope: {
        source_command: SOURCE_COMMANDS.family_runtime_evidence_worklist,
        summary: readinessEvidenceEnvelopeSummary,
        open_envelope_count: readinessEvidenceEnvelopeOpenCount,
        blocked_envelope_count: readinessEvidenceEnvelopeBlockedCount,
        attention_envelope_count: evidenceEnvelopeAttentionCount,
        claim_policy:
          'owner_receipt_and_typed_blocker_refs_only_no_domain_or_production_ready_verdict',
        authority_boundary:
          record(readinessEvidenceEnvelope.authority_boundary),
      },
      domain_dispatch_attention: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        attention_count: domainDispatchAttentionCount,
        domain_count: numberValue(appSummary.domain_dispatch_attention_domain_count),
        domain_dispatch_evidence_receipt_action_route_count:
          numberValue(appSummary.domain_dispatch_evidence_receipt_action_route_count),
        domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count:
          numberValue(appSummary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count),
        domain_dispatch_evidence_receipt_record_payload_template_count:
          numberValue(appSummary.domain_dispatch_evidence_receipt_record_payload_template_count),
        owner_receipt_ref_count:
          numberValue(appSummary.domain_dispatch_attention_owner_receipt_ref_count),
        direct_typed_blocker_ref_count:
          numberValue(appSummary.domain_dispatch_attention_direct_typed_blocker_ref_count),
        direct_typed_blocker_count:
          numberValue(appSummary.domain_dispatch_attention_direct_typed_blocker_count),
        typed_blocker_stage_count:
          numberValue(appSummary.domain_dispatch_attention_typed_blocker_stage_count),
        blocked_obligation_count:
          numberValue(appSummary.domain_dispatch_attention_blocked_obligation_count),
        missing_owner_chain_count:
          numberValue(appSummary.domain_dispatch_attention_missing_owner_chain_count),
        attention_policy:
          appSummary.domain_dispatch_attention_policy
            ?? 'typed_blocker_stage_or_uncovered_missing_owner_chain_attention_only_no_domain_ready_claim',
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
        can_authorize_quality_or_export: false,
        authority_boundary: frameworkReadinessAuthorityBoundary(),
      },
      owner_handoff_packet: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        ...ownerHandoffPacket,
      },
      domain_owner_payload_summary_attention: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        ...domainOwnerPayloadSummaryAttention,
      },
      app_release_user_path_evidence: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        ...appReleaseUserPathEvidence,
      },
      developer_mode_live_closeout_evidence: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        ...developerModeLiveCloseoutEvidence,
      },
      workstream_operating_loop: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        ...workstreamOperatingLoop,
      },
      runtime_manager_route_support: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        surface_kind: stringValue(runtimeManagerRouteSupport.surface_kind)
          ?? 'opl_app_drilldown_runtime_manager_route_support',
        source_surface: stringValue(runtimeManagerRouteSupport.source_surface)
          ?? 'opl_runtime_manager.family_runtime_stage_attempt_index.domain_route_projection',
        projection_policy: stringValue(runtimeManagerRouteSupport.projection_policy)
          ?? 'refs_only_supported_route_catalog_no_owner_chain_closure_or_domain_ready_claim',
        owner_route_handoff_ref: stringValue(runtimeManagerDomainRouteSupport.owner_route_handoff_ref),
        accepted_runtime_owner_route_ref:
          stringValue(runtimeManagerDomainRouteSupport.accepted_runtime_owner_route_ref),
        supported_task_kinds: runtimeManagerRouteSupportTaskKinds,
        supported_task_kind_prefix:
          stringValue(runtimeManagerDomainRouteSupport.supported_task_kind_prefix),
        action_ref_source: stringValue(runtimeManagerDomainRouteSupport.action_ref_source),
        task_kind_count: runtimeManagerRouteSupportTaskKinds.length,
        support_catalog_is_owner_chain_closure: false,
        can_claim_domain_ready: false,
        can_claim_production_ready: false,
        can_close_owner_chain: false,
        can_authorize_quality_or_export: false,
        authority_boundary: runtimeManagerRouteSupportAuthorityBoundary,
      },
      provider_slo_status: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        provider_slo_cadence_window_status: appSummary.provider_slo_cadence_window_status ?? null,
        provider_slo_cadence_window_long_evidence_ready:
          booleanValue(appSummary.provider_slo_cadence_window_long_evidence_ready),
        provider_slo_cadence_window_expected_receipt_count:
          numberValue(appSummary.provider_slo_cadence_window_expected_receipt_count),
        provider_slo_cadence_window_observed_receipt_count:
          numberValue(appSummary.provider_slo_cadence_window_observed_receipt_count),
        provider_slo_cadence_window_missing_receipt_count:
          numberValue(appSummary.provider_slo_cadence_window_missing_receipt_count),
        provider_slo_cadence_window_blocked_repair_receipt_count:
          numberValue(appSummary.provider_slo_cadence_window_blocked_repair_receipt_count),
        provider_slo_capability_status: appSummary.provider_slo_capability_status ?? null,
        provider_slo_capability_domain_truth_boundary_preserved:
          booleanValue(appSummary.provider_slo_capability_domain_truth_boundary_preserved),
        provider_slo_can_claim_domain_ready: false,
        provider_slo_can_claim_production_ready: false,
      },
      authority_boundary: frameworkReadinessAuthorityBoundary(),
      non_goals: [
        'does_not_claim_opl_production_ready',
        'does_not_claim_domain_ready',
        'does_not_claim_artifact_authority',
        'does_not_authorize_quality_or_export_verdict',
        'does_not_execute_domain_actions',
        'does_not_close_owner_receipts_or_monitor_freshness',
      ],
    },
  };
}
