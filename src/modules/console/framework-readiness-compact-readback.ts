import { buildAgentReadinessSummary } from './agent-readiness.ts';
import { buildCurrentOwnerDeltaTopline } from '../ledger/index.ts';
import {
  buildDomainManifestCatalog,
  buildStandardAgentDomainManifestCatalog,
} from '../atlas/index.ts';
import { buildDomainPackCompilerList } from '../pack/index.ts';
import {
  buildFamilyStageReadinessInspect,
  buildFamilyStagesList,
} from '../stagecraft/index.ts';
import { buildStageReplayMissingReceiptWorkorderPacket } from '../stagecraft/index.ts';
import {
  frameworkStatusFromAttentionCounts,
  openSafeActionPayloadCounts,
  splitOperatorAttentionCountsWithSafeActionPayload,
} from './framework-readiness-attention-counts.ts';
import {
  frameworkReadinessAuthorityBoundary,
  frameworkReadinessDiagnosticFailure,
} from './framework-readiness-diagnostics.ts';
import { buildOwnerDeltaHandoffSummaryFromFrameworkReadiness } from './framework-readiness-owner-delta-handoff-summary.ts';
import { guardedProviderSloOpenTailCount } from './framework-readiness-provider-slo.ts';
import { FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS } from './framework-readiness-source-commands.ts';
import {
  type JsonRecord,
  numberValue,
  record,
  stringValue,
} from './framework-readiness-values.ts';
import { buildOplFrameworkSemanticHygieneAudit } from './framework-semantic-hygiene.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';
import {
  requireRuntimeTraySnapshotProvider,
  type RuntimeTraySnapshotProvider,
} from '../runway/index.ts';

type FrameworkReadinessCompactInput = {
  familyDefaults: boolean;
};

type FrameworkReadinessCoreModel = {
  familyDefaults: boolean;
  frameworkStatus: string;
  summary: JsonRecord;
  ownerDeltaTopline: JsonRecord;
};

type FrameworkReadinessCompactOptions = {
  runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
};

const FRAMEWORK_READINESS_MANIFEST_COMMAND_TIMEOUT_MS = 5_000;

const COMPACT_READBACK_AUTHORITY_BOUNDARY = {
  refs_only: true,
  derived_from_full_readback: true,
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_quality_or_export: false,
  can_claim_domain_ready: false,
  can_claim_app_release_ready: false,
  can_claim_l5: false,
  can_claim_production_ready: false,
};

function buildAgentReadinessDiagnostic() {
  try {
    return {
      readiness: record(buildAgentReadinessSummary(['--family-defaults']).agent_readiness),
      failure: null,
    };
  } catch (error) {
    const failure = frameworkReadinessDiagnosticFailure(
      'agents_readiness',
      SOURCE_COMMANDS.agents_readiness,
      error,
    );
    return {
      readiness: {
        surface_kind: 'opl_agent_readiness_summary',
        owner: 'one-person-lab',
        detail_level: 'summary',
        status: 'diagnostic_unavailable',
        summary: {
          structural_conformance_status: 'diagnostic_unavailable',
          conformance_passed_count: 0,
          conformance_blocked_count: 0,
          agent_readiness_production_evidence_tail_count: 0,
          agent_readiness_production_evidence_tail_policy:
            'diagnostic_unavailable_not_a_structural_or_domain_ready_claim',
          diagnostic_failure_count: 1,
        },
        diagnostic_failure: failure,
        authority_boundary: frameworkReadinessAuthorityBoundary(),
      },
      failure,
    };
  }
}

async function buildFrameworkReadinessCompactCoreModel(
  contracts: FrameworkContracts,
  input: FrameworkReadinessCompactInput,
  options: FrameworkReadinessCompactOptions = {},
): Promise<FrameworkReadinessCoreModel> {
  const runtimeSnapshotProvider = requireRuntimeTraySnapshotProvider(
    options.runtimeSnapshotProvider,
    'framework readiness compact',
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
  const packCompiler = record(
    buildDomainPackCompilerList(contracts, { familyDefaults: true }).domain_pack_compiler,
  );
  const familyStages = record(buildFamilyStagesList(
    contracts,
    { domainManifests: standardAgentDomainManifests },
  ).family_stages);
  const familyStageReadiness = record(buildFamilyStageReadinessInspect(
    contracts,
    ['--family-defaults', '--detail', 'full'],
    { domainManifests: standardAgentDomainManifests },
  ).family_stage_readiness);
  const runtimeSnapshot = await runtimeSnapshotProvider(contracts, {
    appOperatorDrilldownDetailLevel: 'summary',
    domainManifests,
    providerKind: 'temporal',
  });
  const appOperatorDrilldown = record(runtimeSnapshot.runtime_tray_snapshot.app_operator_drilldown);
  const semanticSummary = record(semanticHygiene.summary);
  const agentSummary = record(agentReadiness.summary);
  const packSummary = record(packCompiler.summary);
  const stagesSummary = record(familyStages.summary);
  const appSummary = record(appOperatorDrilldown.summary);
  const stageReplayMissingReceiptPacket =
    buildStageReplayMissingReceiptWorkorderPacket(familyStageReadiness, {
    });
  const stageReplayMissingReceiptSummary =
    record(stageReplayMissingReceiptPacket.summary);
  const readinessEvidenceEnvelopeOpenCount =
    numberValue(appSummary.evidence_envelope_open_count);
  const readinessEvidenceEnvelopeBlockedCount =
    numberValue(appSummary.evidence_envelope_blocked_count);
  const typedBlockerRefCount =
    numberValue(appSummary.evidence_envelope_typed_blocker_ref_count);
  const appEvidenceAfterContract = record(
    record(appOperatorDrilldown.attention_first_payload).evidence_after_contract,
  );
  const ownerDeltaFirst = record(
    record(appOperatorDrilldown.attention_first_payload).owner_delta_first,
  );
  const ownerHandoffPacket = record(appEvidenceAfterContract.owner_handoff_packet);
  const workstreamOperatingLoop = record(
    record(appOperatorDrilldown.attention_first_payload).workstream_operating_loop,
  );
  const stageSourceScopeMissingWorkorderCount =
    numberValue(appSummary.stage_production_evidence_missing_expected_receipt_stage_count);
  const stageRuntimeEventMissingWorkorderCount =
    numberValue(appSummary.stage_production_evidence_missing_monitor_freshness_stage_count);
  const ownerDeltaHandoffSummary = buildOwnerDeltaHandoffSummaryFromFrameworkReadiness({
    ownerDeltaFirst,
    ownerHandoffPacket,
    domainDispatchEvidenceWorkorderSummary: {
      workorder_count:
        numberValue(appSummary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count),
      domain_count: numberValue(appSummary.domain_dispatch_attention_domain_count),
      stage_attempt_count: numberValue(appSummary.domain_dispatch_evidence_attempt_count),
      required_operator_payload_ref_count:
        numberValue(appSummary.domain_dispatch_evidence_receipt_record_payload_template_count),
      required_evidence_ref_count:
        numberValue(appSummary.domain_dispatch_attention_count),
    },
    openSafeActionPayload: openSafeActionPayloadCounts({
      openSafeActionItemCount: numberValue(appSummary.app_execution_bridge_safe_action_route_count),
      openSafeActionPayloadRequiredCount:
        stageSourceScopeMissingWorkorderCount + stageRuntimeEventMissingWorkorderCount,
      openSafeActionPayloadFreeCount: 0,
    }),
    attentionCounts: splitOperatorAttentionCountsWithSafeActionPayload({
      openTailCount: 0,
      evidenceEnvelopeOpenCount: readinessEvidenceEnvelopeOpenCount,
      evidenceEnvelopeBlockedCount: readinessEvidenceEnvelopeBlockedCount,
      domainDispatchAttentionCount: numberValue(appSummary.domain_dispatch_attention_count),
      stageSourceScopeMissingWorkorderCount,
      stageRuntimeEventMissingWorkorderCount,
      developerModeLiveCloseoutAttentionCount:
        numberValue(record(appEvidenceAfterContract.developer_mode_live_closeout_evidence).attention_count),
      openSafeActionPayloadRequiredCount:
        stageSourceScopeMissingWorkorderCount + stageRuntimeEventMissingWorkorderCount,
      openSafeActionPayloadFreeCount: 0,
    }),
    readinessEvidenceEnvelopeOpenCount,
    readinessEvidenceEnvelopeBlockedCount,
    stageReplayMissingReceiptWorkorderCount:
      numberValue(stageReplayMissingReceiptSummary.workorder_count),
  });
  const agentStructuralEvidenceTailCount = numberValue(
    record(record(record(agentReadiness).production_evidence_tail_ledger).summary)
      .open_tail_item_count,
  );
  const appRawOpenTailCount =
    numberValue(appSummary.app_operator_production_evidence_tail_open_item_count);
  const providerSloGuardedOpenTailCount = guardedProviderSloOpenTailCount(appOperatorDrilldown);
  const appLiveEvidenceTailCount = Math.max(appRawOpenTailCount - providerSloGuardedOpenTailCount, 0);
  const stageReceiptFreshnessTailCount =
    numberValue(appSummary.stage_production_evidence_missing_caller_stage_count)
    + stageSourceScopeMissingWorkorderCount
    + stageRuntimeEventMissingWorkorderCount;
  const openTailCount =
    agentStructuralEvidenceTailCount + appLiveEvidenceTailCount + stageReceiptFreshnessTailCount;
  const domainDispatchAttentionCount =
    numberValue(appSummary.domain_dispatch_attention_count)
    || (
      numberValue(appSummary.domain_dispatch_attention_typed_blocker_stage_count)
      + numberValue(appSummary.domain_dispatch_attention_missing_owner_chain_count)
    );
  const attentionCounts = splitOperatorAttentionCountsWithSafeActionPayload({
    openTailCount,
    evidenceEnvelopeOpenCount: readinessEvidenceEnvelopeOpenCount,
    evidenceEnvelopeBlockedCount: readinessEvidenceEnvelopeBlockedCount,
    domainDispatchAttentionCount,
    stageSourceScopeMissingWorkorderCount,
    stageRuntimeEventMissingWorkorderCount,
    developerModeLiveCloseoutAttentionCount:
      numberValue(record(appEvidenceAfterContract.developer_mode_live_closeout_evidence).attention_count),
    openSafeActionPayloadRequiredCount:
      readinessEvidenceEnvelopeOpenCount
      + stageSourceScopeMissingWorkorderCount
      + stageRuntimeEventMissingWorkorderCount,
    openSafeActionPayloadFreeCount: openTailCount,
  });
  const packCompilerBlockerCount = Math.max(
    numberValue(packSummary.blocked_domain_count),
    numberValue(packSummary.domain_generated_surface_owner_claim_count),
    numberValue(packSummary.generated_artifact_drift_detected_count),
  );
  const hardBlockerCount =
    numberValue(agentSummary.conformance_blocked_count)
    + numberValue(record(familyStageReadiness.summary).hard_blocker_count)
    + packCompilerBlockerCount;
  const frameworkStatus = frameworkStatusFromAttentionCounts({
    openTailCount,
    operatorActionableAttentionCount: attentionCounts.operatorActionableAttentionCount,
    domainBlockedAttentionCount: attentionCounts.domainBlockedAttentionCount,
    semanticAttentionGateCount: numberValue(semanticSummary.attention_required_gate_count),
    hardBlockerCount,
  });
  const ownerDeltaTopline = buildCurrentOwnerDeltaTopline({
    currentOwnerDeltaReadModel:
      record(appOperatorDrilldown.attention_first_payload).current_owner_delta_read_model,
  });
  const summary = {
    control_plane_available: true,
    framework_kernel_hard_blocker_count: hardBlockerCount,
    agent_conformance_hard_blocker_count:
      numberValue(agentSummary.conformance_blocked_count),
    generated_default_entry_source_of_work_blocked_count:
      numberValue(generatedDefaultEntrySourceOfWork.blocked_domain_count),
    stage_readiness_hard_blocker_count:
      numberValue(record(familyStageReadiness.summary).hard_blocker_count),
    pack_compiler_hard_blocker_count: packCompilerBlockerCount,
    framework_diagnostic_failure_count:
      agentReadinessDiagnostic.failure === null ? 0 : 1,
    semantic_hygiene_attention_required_gate_count:
      numberValue(semanticSummary.attention_required_gate_count),
    agent_structural_evidence_tail_open_count: agentStructuralEvidenceTailCount,
    provider_slo_guarded_open_tail_count: providerSloGuardedOpenTailCount,
    app_live_evidence_tail_raw_open_count: appRawOpenTailCount,
    app_live_evidence_tail_open_count: appLiveEvidenceTailCount,
    stage_receipt_freshness_tail_open_count: stageReceiptFreshnessTailCount,
    stage_source_scope_missing_workorder_count: stageSourceScopeMissingWorkorderCount,
    stage_runtime_event_missing_workorder_count: stageRuntimeEventMissingWorkorderCount,
    stage_source_scope_missing_ref_count: stageSourceScopeMissingWorkorderCount,
    stage_runtime_event_missing_ref_count: stageRuntimeEventMissingWorkorderCount,
    stage_replay_missing_receipt_workorder_count:
      numberValue(stageReplayMissingReceiptSummary.workorder_count),
    stage_replay_missing_receipt_ref_count:
      numberValue(stageReplayMissingReceiptSummary.missing_ref_count),
    stage_replay_missing_human_gate_ref_count:
      numberValue(stageReplayMissingReceiptSummary.human_gate_missing_ref_count),
    evidence_envelope_open_count: readinessEvidenceEnvelopeOpenCount,
    evidence_envelope_blocked_count: readinessEvidenceEnvelopeBlockedCount,
    evidence_envelope_attention_count:
      readinessEvidenceEnvelopeOpenCount + readinessEvidenceEnvelopeBlockedCount,
    domain_dispatch_attention_count: domainDispatchAttentionCount,
    operator_actionable_attention_tail_count:
      attentionCounts.operatorActionableAttentionCount,
    operator_payload_required_attention_tail_count:
      attentionCounts.operatorPayloadRequiredAttentionCount,
    operator_payload_free_attention_tail_count:
      attentionCounts.operatorPayloadFreeAttentionCount,
    domain_blocked_attention_tail_count:
      attentionCounts.domainBlockedAttentionCount,
    domain_blocked_typed_blocker_ref_count:
      typedBlockerRefCount,
    domain_blocked_unique_typed_blocker_ref_count:
      typedBlockerRefCount,
    domain_blocked_typed_blocker_group_count:
      typedBlockerRefCount,
    total_operator_attention_tail_count: attentionCounts.totalAttentionCount,
    attention_tail_semantics: attentionCounts.semantics,
    attention_payload_requirement_semantics:
      attentionCounts.payloadRequirementSemantics,
    open_tail_count: openTailCount,
    provider_slo_cadence_window_status:
      appSummary.provider_slo_cadence_window_status ?? null,
    provider_slo_capability_status:
      appSummary.provider_slo_capability_status ?? null,
    family_stage_count: numberValue(record(familyStageReadiness.summary).stage_count),
    admitted_family_stage_count:
      numberValue(record(familyStageReadiness.summary).admitted_stage_count),
    family_stage_blocked_count:
      numberValue(record(familyStageReadiness.summary).blocked_stage_count),
    family_stages_total_count: numberValue(stagesSummary.stage_count),
    workstream_operating_loop_workstream_count:
      numberValue(record(workstreamOperatingLoop.summary).workstream_count),
    workstream_operating_loop_artifact_first_review_available_count:
      numberValue(record(workstreamOperatingLoop.summary).artifact_first_review_available_count),
    owner_delta_handoff_status:
      ownerDeltaHandoffSummary.status ?? null,
  };
  return {
    familyDefaults: input.familyDefaults === true,
    frameworkStatus,
    summary,
    ownerDeltaTopline,
  };
}

function buildFrameworkReadinessCompactReadbackFromCore(
  core: FrameworkReadinessCoreModel,
) {
  const summary = record(core.summary);
  const currentOwnerDelta = record(core.ownerDeltaTopline.current_owner_delta);
  const operatorNextAction = record(core.ownerDeltaTopline.operator_next_action);
  const stageRunCockpitSummary = record(core.ownerDeltaTopline.stage_run_cockpit_summary);
  return {
    version: 'g1',
    framework_readiness_compact: {
      surface_kind: 'opl_framework_readiness_compact_readback',
      owner: 'one-person-lab',
      source_command: 'opl framework readiness --family-defaults --json',
      full_detail_command: 'opl framework readiness --family-defaults --json',
      source_surface_ref: '/framework_readiness',
      compact_readback_role:
        'operator_summary_projection_from_framework_readiness_source_model_not_second_truth',
      family_defaults: core.familyDefaults,
      status: core.frameworkStatus,
      detail_level: 'compact',
      summary: {
        framework_kernel_hard_blocker_count:
          numberValue(summary.framework_kernel_hard_blocker_count),
        operator_actionable_attention_tail_count:
          numberValue(summary.operator_actionable_attention_tail_count),
        operator_payload_required_attention_tail_count:
          numberValue(summary.operator_payload_required_attention_tail_count),
        domain_blocked_attention_tail_count:
          numberValue(summary.domain_blocked_attention_tail_count),
        domain_blocked_unique_typed_blocker_ref_count:
          numberValue(summary.domain_blocked_unique_typed_blocker_ref_count),
        open_tail_count: numberValue(summary.open_tail_count),
        total_operator_attention_tail_count:
          numberValue(summary.total_operator_attention_tail_count),
        stage_replay_missing_receipt_workorder_count:
          numberValue(summary.stage_replay_missing_receipt_workorder_count),
        evidence_envelope_attention_count:
          numberValue(summary.evidence_envelope_attention_count),
        domain_dispatch_attention_count:
          numberValue(summary.domain_dispatch_attention_count),
        provider_slo_cadence_window_status:
          stringValue(summary.provider_slo_cadence_window_status),
        provider_slo_capability_status:
          stringValue(summary.provider_slo_capability_status),
        ready_claim_authorized: false,
      },
      current_owner_delta_topline: {
        current_owner_delta_id: stringValue(currentOwnerDelta.delta_id),
        current_owner: stringValue(currentOwnerDelta.current_owner),
        domain_id: stringValue(currentOwnerDelta.domain_id),
        stage_id: stringValue(currentOwnerDelta.stage_id),
        desired_delta_kind: stringValue(currentOwnerDelta.desired_delta_kind),
        desired_delta_description:
          stringValue(currentOwnerDelta.desired_delta_description),
        latest_owner_answer_ref:
          stringValue(currentOwnerDelta.latest_owner_answer_ref),
        latest_owner_answer_kind:
          stringValue(currentOwnerDelta.latest_owner_answer_kind),
        domain_ready_authorized:
          record(currentOwnerDelta.hard_gate).domain_ready_authorized === true,
        operator_next_owner: stringValue(core.ownerDeltaTopline.operator_next_owner),
        operator_next_action_kind:
          stringValue(core.ownerDeltaTopline.operator_next_action_kind),
        operator_payload_requirement:
          stringValue(core.ownerDeltaTopline.operator_payload_requirement),
        operator_accepted_answer_shape:
          Array.isArray(core.ownerDeltaTopline.operator_accepted_answer_shape)
            ? core.ownerDeltaTopline.operator_accepted_answer_shape
              .filter((entry): entry is string => typeof entry === 'string')
            : [],
        operator_next_missing_input_refs:
          Array.isArray(core.ownerDeltaTopline.operator_next_missing_input_refs)
            ? core.ownerDeltaTopline.operator_next_missing_input_refs
              .filter((entry): entry is string => typeof entry === 'string')
            : [],
      },
      operator_next_action: {
        action_kind: stringValue(operatorNextAction.action_kind),
        step_kind: stringValue(operatorNextAction.step_kind),
        status: stringValue(operatorNextAction.status),
        next_required_owner: stringValue(operatorNextAction.next_required_owner),
        route_requires_domain_or_app_payload:
          operatorNextAction.route_requires_domain_or_app_payload === true,
        can_execute_domain_action:
          operatorNextAction.can_execute_domain_action === true,
        can_create_owner_receipt:
          operatorNextAction.can_create_owner_receipt === true,
        can_create_typed_blocker:
          operatorNextAction.can_create_typed_blocker === true,
        worklist_item_is_completion_claim:
          operatorNextAction.worklist_item_is_completion_claim === true,
      },
      stage_run_cockpit_summary: {
        current_stage: stringValue(stageRunCockpitSummary.current_stage),
        artifact_or_blocker_refs:
          Array.isArray(stageRunCockpitSummary.artifact_or_blocker_refs)
            ? stageRunCockpitSummary.artifact_or_blocker_refs
            : [],
        semantic_route_owner: 'decisive_codex_attempt',
        missing_format_or_receipt_blocks_next_stage: false,
        refs_only: stageRunCockpitSummary.refs_only === true,
      },
      omitted_sections: [
        'attention_first_payload',
        'kernel_floor',
        'diagnostic_drilldowns',
        'agent_conformance_tail',
        'pack_compiler',
        'stages',
        'evidence_tails',
        'evidence_worklist',
        'evidence_envelope',
        'runtime_tray_snapshot',
      ],
      false_ready_guard: {
        compact_readback_can_claim_domain_ready: false,
        compact_readback_can_claim_app_release_ready: false,
        compact_readback_can_claim_l5: false,
        compact_readback_can_claim_production_ready: false,
        compact_readback_can_sign_owner_receipt: false,
        compact_readback_can_create_typed_blocker: false,
        default_full_readback_unchanged: true,
      },
      authority_boundary: {
        ...COMPACT_READBACK_AUTHORITY_BOUNDARY,
        source_authority_boundary: frameworkReadinessAuthorityBoundary(),
      },
    },
  };
}

export async function buildFrameworkReadinessCompactReadback(
  contracts: FrameworkContracts,
  input: FrameworkReadinessCompactInput,
  options: FrameworkReadinessCompactOptions = {},
) {
  return buildFrameworkReadinessCompactReadbackFromCore(
    await buildFrameworkReadinessCompactCoreModel(contracts, input, options),
  );
}
