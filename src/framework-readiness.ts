import type { FrameworkContracts } from './types.ts';
import { buildAgentReadinessSummary } from './agent-readiness.ts';
import { FrameworkContractError } from './contracts.ts';
import { buildDomainManifestCatalog } from './domain-manifest/catalog-builder.ts';
import { buildDomainPackCompilerList } from './domain-pack-compiler.ts';
import {
  buildFamilyStageReadinessInspect,
  buildFamilyStagesList,
} from './family-stage-control-plane.ts';
import { runFamilyRuntimeEvidenceWorklist } from './family-runtime-evidence-worklist.ts';
import { buildOplFrameworkSemanticHygieneAudit } from './framework-semantic-hygiene.ts';
import { buildRuntimeTraySnapshot } from './runtime-tray-snapshot.ts';
import {
  evidenceEnvelopeOpenCount,
  evidenceEnvelopeSummary,
} from './evidence-envelope.ts';
import {
  buildMasDomainRouteSupportProjection,
} from './family-runtime-mas-domain-route.ts';

type JsonRecord = Record<string, unknown>;

type FrameworkReadinessInput = {
  familyDefaults: boolean;
};

const SOURCE_COMMANDS = {
  semantic_hygiene: 'opl system semantic-hygiene --json',
  agents_readiness: 'opl agents readiness --family-defaults --json',
  pack_compiler: 'opl agents pack-compiler --json',
  stages_list: 'opl stages list --json',
  stages_readiness_mas: 'opl stages readiness --domain mas --json',
  stages_readiness_mag: 'opl stages readiness --domain mag --json',
  stages_readiness_rca: 'opl stages readiness --domain rca --json',
  app_operator_drilldown: 'opl runtime app-operator-drilldown --json',
  family_runtime_evidence_worklist:
    'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function countValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (isRecord(value)) {
    return numberValue(value.value);
  }
  return 0;
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function diagnosticFailure(sourceId: string, sourceCommand: string, error: unknown) {
  if (error instanceof FrameworkContractError) {
    return {
      source_id: sourceId,
      source_command: sourceCommand,
      status: 'diagnostic_unavailable',
      error_code: error.code,
      message: error.message,
      exit_code: error.exitCode,
      details: error.details ?? {},
      blocking_policy: 'diagnostic_unavailable_blocks_framework_kernel_summary_but_does_not_claim_domain_ready',
    };
  }
  return {
    source_id: sourceId,
    source_command: sourceCommand,
    status: 'diagnostic_unavailable',
    error_code: 'unexpected_framework_readiness_diagnostic_error',
    message: error instanceof Error ? error.message : String(error),
    exit_code: 1,
    details: {},
    blocking_policy: 'diagnostic_unavailable_blocks_framework_kernel_summary_but_does_not_claim_domain_ready',
  };
}

function stageReadinessSummary(readiness: JsonRecord) {
  return record(readiness.summary);
}

function buildStageReadinessDiagnostic(
  contracts: FrameworkContracts,
  domain: 'mas' | 'mag' | 'rca',
  domainManifests: ReturnType<typeof buildDomainManifestCatalog>['domain_manifests'],
) {
  const sourceCommand = SOURCE_COMMANDS[`stages_readiness_${domain}`];
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
    const failure = diagnosticFailure(`stages_readiness_${domain}`, sourceCommand, error);
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
          hard_blocker_count: 1,
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

function buildAgentReadinessDiagnostic() {
  try {
    return {
      readiness: record(buildAgentReadinessSummary(['--family-defaults']).agent_readiness),
      failure: null,
    };
  } catch (error) {
    const failure = diagnosticFailure('agents_readiness', SOURCE_COMMANDS.agents_readiness, error);
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
        attention_first_payload: {
          surface_kind: 'opl_agent_readiness_attention_first_payload',
          status: 'diagnostic_unavailable',
          summary: {
            structural_conformance_status: 'diagnostic_unavailable',
            blocker_count: 1,
            warning_count: 0,
            recommendation_count: 0,
            production_evidence_tail_count: 0,
          },
          blockers: [{
            blocker_id: 'agent_readiness_diagnostic_unavailable',
            count: 1,
            route_ref: 'opl agents readiness --family-defaults --json',
          }],
          warnings: [],
          recommendations: [],
          next_safe_actions: [{
            action_id: 'inspect_agent_readiness_diagnostic',
            command: 'opl agents readiness --family-defaults --json',
            authority: 'diagnostic_only',
          }],
          kernel_floor_ref: '/agent_readiness/kernel_floor',
          diagnostic_drilldown_refs: ['/agent_readiness/conformance_report'],
          claim_policy:
            'attention_payload_reports_operator_work_only_and_emits_no_domain_quality_artifact_or_production_ready_verdict',
        },
        diagnostic_failure: failure,
        authority_boundary: authorityBoundary(),
      },
      failure,
    };
  }
}

function authorityBoundary() {
  return {
    opl_role: 'framework_readiness_summary_and_refs_only_operator_read_model',
    domain_truth_owner: 'MAS/MAG/RCA domain repositories',
    provider_slo_owner: 'Temporal provider readiness/proof surfaces',
    app_operator_safe_action_policy: 'safe_action_routes_request_or_verify_refs_only_without_domain_action_execution',
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_claim_artifact_authority: false,
    can_authorize_quality_or_export: false,
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_domain_artifact: false,
    provider_completion_is_domain_ready: false,
    stage_launch_or_attempt_request_is_domain_ready: false,
    safe_action_route_is_receipt_closure: false,
  };
}

function statusFrom(
  openTailCount: number,
  operatorAttentionCount: number,
  semanticAttentionGateCount: number,
  hardBlockerCount: number,
) {
  if (hardBlockerCount > 0) {
    return 'framework_control_plane_available_with_hard_blockers';
  }
  if (openTailCount > 0) {
    return 'framework_control_plane_available_with_open_production_tail';
  }
  if (operatorAttentionCount > 0 || semanticAttentionGateCount > 0) {
    return 'framework_control_plane_available_with_operator_attention';
  }
  return 'framework_control_plane_available';
}

function frameworkKernelFloor() {
  return {
    surface_kind: 'opl_framework_readiness_kernel_floor',
    policy: 'minimum_control_plane_boundary_and_recoverability_floor_only',
    hard_blocker_sources: [
      'agent_structural_conformance',
      'stage_launch_kernel_hard_blockers',
      'forbidden_authority_boundary',
      'provider_substrate_unavailable',
      'receipt_replay_audit_baseline_missing',
    ],
    advisory_sources: [
      'semantic_hygiene_attention',
      'agent_structural_evidence_tail',
      'app_live_evidence_tail',
      'stage_receipt_freshness_tail',
      'evidence_envelope_attention',
      'domain_dispatch_attention',
      'runtime_manager_route_support',
      'provider_slo_status',
    ],
    ai_executor_internal_strategy_is_contract: false,
    domain_quality_strategy_contract: false,
    diagnostic_lenses_can_claim_ready_verdicts: false,
  };
}

function frameworkDiagnosticDrilldowns() {
  return [
    {
      lens_id: 'semantic_hygiene',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: SOURCE_COMMANDS.semantic_hygiene,
      embedded_payload_ref: '/framework_readiness/semantic_hygiene',
    },
    {
      lens_id: 'agent_conformance_tail',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: SOURCE_COMMANDS.agents_readiness,
      embedded_payload_ref: '/framework_readiness/agent_conformance_tail',
    },
    {
      lens_id: 'stage_readiness',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: SOURCE_COMMANDS.stages_readiness_mas,
      embedded_payload_ref: '/framework_readiness/stages',
    },
    {
      lens_id: 'app_operator_production_tail',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
      embedded_payload_ref: '/framework_readiness/app_operator_production_tail',
    },
    {
      lens_id: 'evidence_worklist',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: SOURCE_COMMANDS.family_runtime_evidence_worklist,
      embedded_payload_ref: '/framework_readiness/evidence_worklist',
    },
    {
      lens_id: 'evidence_envelope',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: SOURCE_COMMANDS.family_runtime_evidence_worklist,
      embedded_payload_ref: '/framework_readiness/evidence_envelope',
    },
    {
      lens_id: 'domain_dispatch_attention',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
      embedded_payload_ref: '/framework_readiness/domain_dispatch_attention',
    },
    {
      lens_id: 'runtime_manager_route_support',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
      embedded_payload_ref: '/framework_readiness/runtime_manager_route_support',
    },
    {
      lens_id: 'provider_slo_status',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
      embedded_payload_ref: '/framework_readiness/provider_slo_status',
    },
  ];
}

function frameworkAttentionFirstPayload(input: {
  status: string;
  hardBlockerCount: number;
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
  domainDispatchEvidenceWorkorderGroupAttentionItems: JsonRecord[];
  domainDispatchEvidenceWorkorderAttentionItems: JsonRecord[];
  domainDispatchEvidenceWorkorderSummary: JsonRecord;
  evidenceEnvelopeOpenCount: number;
  evidenceEnvelopeBlockedCount: number;
  domainDispatchAttentionCount: number;
  providerSloCadenceWindowStatus: unknown;
  providerSloCapabilityStatus: unknown;
}) {
  const openTailCount = input.agentStructuralEvidenceTailCount
    + input.appLiveEvidenceTailCount
    + input.stageReceiptFreshnessTailCount;
  const evidenceEnvelopeAttentionCount = input.evidenceEnvelopeOpenCount + input.evidenceEnvelopeBlockedCount;
  const totalOperatorAttentionTailCount =
    openTailCount + evidenceEnvelopeAttentionCount + input.domainDispatchAttentionCount;
  const blockers = [
    ...(input.packCompilerBlockerCount > 0
      ? [{
          blocker_id: 'pack_compiler_framework_kernel_blocker_present',
          count: input.packCompilerBlockerCount,
          route_ref: '/framework_readiness/pack_compiler',
        }]
      : []),
    ...(input.diagnosticFailureCount > 0
      ? [{
          blocker_id: 'framework_diagnostic_unavailable',
          count: input.diagnosticFailureCount,
          route_ref: '/framework_readiness/diagnostic_failures',
        }]
      : []),
    ...(input.hardBlockerCount > input.packCompilerBlockerCount + input.diagnosticFailureCount
      ? [{
          blocker_id: 'framework_kernel_hard_blocker_present',
          count: input.hardBlockerCount - input.packCompilerBlockerCount - input.diagnosticFailureCount,
          route_ref: '/framework_readiness/stages',
        }]
      : []),
  ];
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
  ];
  const nextSafeActions = blockers.length > 0
    ? [{
        action_id: 'inspect_framework_kernel_blockers',
        command: 'opl framework readiness --family-defaults --json',
        authority: 'diagnostic_only',
      }]
    : warnings.length > 0
      ? [{
          action_id: 'review_framework_attention_items',
          command: 'opl framework readiness --family-defaults --json',
          authority: 'operator_attention_only',
        }]
      : [{
          action_id: 'no_framework_readiness_action_required',
          authority: 'no_op',
        }];

  return {
    surface_kind: 'opl_framework_readiness_attention_first_payload',
    status: input.status,
    summary: {
      hard_blocker_count: input.hardBlockerCount,
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
      total_operator_attention_tail_count: totalOperatorAttentionTailCount,
      provider_slo_cadence_window_status: input.providerSloCadenceWindowStatus ?? null,
      provider_slo_capability_status: input.providerSloCapabilityStatus ?? null,
    },
    stage_evidence_workorder_attention_items: input.stageEvidenceWorkorderAttentionItems,
    owner_payload_group_attention_policy:
      'top_owner_payload_groups_by_open_then_blocked_counts_refs_only',
    owner_payload_group_attention_count: input.ownerPayloadGroupAttentionCount,
    owner_payload_group_attention_omitted_count: input.ownerPayloadGroupAttentionOmittedCount,
    owner_payload_groups: input.ownerPayloadGroups,
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
    diagnostic_drilldown_refs: frameworkDiagnosticDrilldowns().map((lens) => lens.embedded_payload_ref),
    claim_policy:
      'attention_payload_reports_operator_work_only_and_emits_no_domain_quality_artifact_or_production_ready_verdict',
  };
}

export async function buildFrameworkReadinessSummary(
  contracts: FrameworkContracts,
  input: FrameworkReadinessInput,
) {
  const semanticHygiene = buildOplFrameworkSemanticHygieneAudit(contracts);
  const agentReadinessDiagnostic = buildAgentReadinessDiagnostic();
  const agentReadiness = agentReadinessDiagnostic.readiness;
  const packCompiler = record(buildDomainPackCompilerList(contracts).domain_pack_compiler);
  const domainManifests = buildDomainManifestCatalog(contracts, {
    manifestCommandTimeoutMs: 120_000,
    manifestCommandTimeoutPolicy: 'fixed',
    materializeFamilyTransitions: false,
    useProjectionCacheOnFailure: true,
  }).domain_manifests;
  const familyStages = record(buildFamilyStagesList(contracts, { domainManifests }).family_stages);
  const stageReadinessDiagnostics = {
    mas: buildStageReadinessDiagnostic(contracts, 'mas', domainManifests),
    mag: buildStageReadinessDiagnostic(contracts, 'mag', domainManifests),
    rca: buildStageReadinessDiagnostic(contracts, 'rca', domainManifests),
  };
  const stageReadiness = {
    mas: stageReadinessDiagnostics.mas.readiness,
    mag: stageReadinessDiagnostics.mag.readiness,
    rca: stageReadinessDiagnostics.rca.readiness,
  };
  const runtimeSnapshot = await buildRuntimeTraySnapshot(contracts, {
    appOperatorDrilldownDetailLevel: 'full',
    providerKind: 'temporal',
  });
  const appOperatorDrilldown = record(runtimeSnapshot.runtime_tray_snapshot.app_operator_drilldown);
  const familyRuntimeEvidenceWorklist = record(
    (await runFamilyRuntimeEvidenceWorklist(contracts, {
      familyDefaults: true,
      providerKind: 'temporal',
      executorKind: 'codex_cli',
      runtimeSnapshot,
    })).family_runtime_evidence_worklist,
  );

  const semanticSummary = record(semanticHygiene.summary);
  const agentSummary = record(agentReadiness.summary);
  const packSummary = record(packCompiler.summary);
  const stagesSummary = record(familyStages.summary);
  const appSummary = record(appOperatorDrilldown.summary);
  const worklistSummary = record(familyRuntimeEvidenceWorklist.summary);
  const readinessEvidenceEnvelope = record(familyRuntimeEvidenceWorklist.evidence_envelope);
  const readinessEvidenceEnvelopeSummary = evidenceEnvelopeSummary(readinessEvidenceEnvelope);
  const readinessEvidenceEnvelopeOpenCount = evidenceEnvelopeOpenCount(readinessEvidenceEnvelope);
  const readinessEvidenceEnvelopeBlockedCount = numberValue(readinessEvidenceEnvelopeSummary.blocked_envelope_count);
  const appEvidenceAfterContract = record(record(appOperatorDrilldown.attention_first_payload).evidence_after_contract);
  const ownerPayloadGroups = recordList(appEvidenceAfterContract.owner_payload_groups);
  const ownerPayloadGroupAttentionCount =
    numberValue(appEvidenceAfterContract.owner_payload_group_attention_count);
  const ownerPayloadGroupAttentionOmittedCount =
    numberValue(appEvidenceAfterContract.owner_payload_group_attention_omitted_count);
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
    .filter((entry): entry is ReturnType<typeof diagnosticFailure> => entry !== null);
  const stageReadinessDiagnosticFailures = Object.values(stageReadinessDiagnostics)
    .map((entry) => entry.failure)
    .filter((entry): entry is ReturnType<typeof diagnosticFailure> => entry !== null);
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
  const appOpenTailCount = numberValue(appSummary.app_operator_production_evidence_tail_open_item_count);
  const stageProductionCallerTailCount = numberValue(appSummary.stage_production_evidence_missing_caller_stage_count);
  const evidenceWorklistOpenCount = countValue(worklistSummary.open_worklist_item_count);
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
  const runtimeManagerMasRouteSupport = Object.keys(record(runtimeManagerRouteSupport.mas_domain_route_projection)).length > 0
    ? record(runtimeManagerRouteSupport.mas_domain_route_projection)
    : buildMasDomainRouteSupportProjection();
  const runtimeManagerRouteSupportTaskKinds = Array.isArray(runtimeManagerMasRouteSupport.supported_task_kinds)
    ? runtimeManagerMasRouteSupport.supported_task_kinds
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const runtimeManagerRouteSupportActionRefs = Array.isArray(runtimeManagerMasRouteSupport.action_refs)
    ? runtimeManagerMasRouteSupport.action_refs
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
  const runtimeManagerRouteSupportAuthorityBoundary = {
    can_write_domain_truth: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_close_owner_chain: false,
    can_record_owner_receipt: false,
    can_authorize_publication_aftercare: false,
    ...record(runtimeManagerRouteSupport.authority_boundary),
  };
  const runtimeManagerAftercareRouteSupportCount =
    runtimeManagerRouteSupportTaskKinds.filter((taskKind) => taskKind.startsWith('publication_aftercare/')).length;
  const openTailCount =
    agentStructuralEvidenceTailCount + appLiveEvidenceTailCount + stageReceiptFreshnessTailCount;
  const evidenceEnvelopeAttentionCount = readinessEvidenceEnvelopeOpenCount + readinessEvidenceEnvelopeBlockedCount;
  const totalOperatorAttentionTailCount =
    openTailCount + evidenceEnvelopeAttentionCount + domainDispatchAttentionCount;
  const operatorAttentionCount = evidenceEnvelopeAttentionCount + domainDispatchAttentionCount;
  const agentHardBlockerCount = numberValue(agentSummary.conformance_blocked_count);
  const hardBlockerCount =
    agentHardBlockerCount + stageHardBlockerCount + packCompilerBlockerCount + diagnosticFailureCount;
  const frameworkStatus = statusFrom(
    openTailCount,
    operatorAttentionCount,
    semanticAttentionGateCount,
    hardBlockerCount,
  );

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
      attention_first_payload: frameworkAttentionFirstPayload({
        status: frameworkStatus,
        hardBlockerCount,
        packCompilerBlockerCount,
        diagnosticFailureCount,
        semanticAttentionGateCount,
        stageWarningCount,
        agentStructuralEvidenceTailCount,
        appLiveEvidenceTailCount,
        stageReceiptFreshnessTailCount,
        stageSourceScopeMissingWorkorderCount,
        stageRuntimeEventMissingWorkorderCount,
        stageSourceScopeMissingRefCount,
        stageRuntimeEventMissingRefCount,
        stageEvidenceWorkorderAttentionItems,
        ownerPayloadGroupAttentionCount,
        ownerPayloadGroupAttentionOmittedCount,
        ownerPayloadGroups,
        domainDispatchEvidenceWorkorderGroupAttentionItems,
        domainDispatchEvidenceWorkorderAttentionItems,
        domainDispatchEvidenceWorkorderSummary,
        evidenceEnvelopeOpenCount: readinessEvidenceEnvelopeOpenCount,
        evidenceEnvelopeBlockedCount: readinessEvidenceEnvelopeBlockedCount,
        domainDispatchAttentionCount,
        providerSloCadenceWindowStatus: appSummary.provider_slo_cadence_window_status,
        providerSloCapabilityStatus: appSummary.provider_slo_capability_status,
      }),
      kernel_floor: frameworkKernelFloor(),
      diagnostic_drilldowns: frameworkDiagnosticDrilldowns(),
      excluded_ready_verdicts: [
        'domain_ready_verdict',
        'quality_verdict',
        'artifact_authority_verdict',
        'production_ready_verdict',
      ],
      summary: {
        control_plane_available: true,
        framework_kernel_hard_blocker_count: hardBlockerCount,
        framework_diagnostic_failure_count: diagnosticFailureCount,
        semantic_hygiene_attention_required_gate_count: semanticAttentionGateCount,
        agent_structural_evidence_tail_open_count: agentStructuralEvidenceTailCount,
        app_live_evidence_tail_open_count: appLiveEvidenceTailCount,
        stage_receipt_freshness_tail_open_count: stageReceiptFreshnessTailCount,
        stage_source_scope_missing_workorder_count: stageSourceScopeMissingWorkorderCount,
        stage_runtime_event_missing_workorder_count: stageRuntimeEventMissingWorkorderCount,
        stage_source_scope_missing_ref_count: stageSourceScopeMissingRefCount,
        stage_runtime_event_missing_ref_count: stageRuntimeEventMissingRefCount,
        evidence_envelope_open_count: readinessEvidenceEnvelopeOpenCount,
        evidence_envelope_blocked_count: readinessEvidenceEnvelopeBlockedCount,
        evidence_envelope_attention_count: evidenceEnvelopeAttentionCount,
        domain_dispatch_attention_count: domainDispatchAttentionCount,
        runtime_manager_mas_route_support_task_kind_count: runtimeManagerRouteSupportTaskKinds.length,
        runtime_manager_mas_aftercare_route_support_count: runtimeManagerAftercareRouteSupportCount,
        runtime_manager_mas_route_support_action_ref_count: runtimeManagerRouteSupportActionRefs.length,
        total_operator_attention_tail_count: totalOperatorAttentionTailCount,
        open_tail_count: openTailCount,
        provider_slo_cadence_window_status: appSummary.provider_slo_cadence_window_status ?? null,
        provider_slo_capability_status: appSummary.provider_slo_capability_status ?? null,
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
          'Runtime Manager supported MAS route catalog projection only; support does not close owner-chain receipts or authorize domain ready',
        provider_slo_fields:
          'provider_slo_* fields describe Temporal provider cadence/capability SLO only',
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
          blocking_policy: 'operator_attention_only_for_app_live_and_domain_owner_evidence',
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
      semantic_hygiene: {
        source_command: SOURCE_COMMANDS.semantic_hygiene,
        summary: semanticSummary,
        authority_boundary: semanticHygiene.authority_boundary,
      },
      agent_conformance_tail: {
        source_command: SOURCE_COMMANDS.agents_readiness,
        status: agentReadiness.status,
        structural_conformance_status: agentSummary.structural_conformance_status ?? null,
        agent_readiness_production_evidence_tail_count:
          agentProductionEvidenceTailTotalCount,
        agent_readiness_production_evidence_tail_open_count:
          agentStructuralEvidenceTailCount,
        agent_readiness_production_evidence_tail_closed_count:
          agentProductionEvidenceTailClosedCount,
        agent_readiness_production_evidence_tail_policy:
          agentSummary.agent_readiness_production_evidence_tail_policy ?? null,
        diagnostic_failure: agentReadinessDiagnostic.failure,
        authority_boundary: agentReadiness.authority_boundary ?? authorityBoundary(),
      },
      pack_compiler: {
        source_command: SOURCE_COMMANDS.pack_compiler,
        summary: packSummary,
        authority_boundary: packCompiler.authority_boundary ?? authorityBoundary(),
      },
      stages: {
        source_commands: [
          SOURCE_COMMANDS.stages_list,
          SOURCE_COMMANDS.stages_readiness_mas,
          SOURCE_COMMANDS.stages_readiness_mag,
          SOURCE_COMMANDS.stages_readiness_rca,
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
        app_operator_production_evidence_tail_owner_group_count:
          numberValue(appSummary.app_operator_production_evidence_tail_owner_group_count),
        app_operator_production_evidence_tail_blocking_item_count:
          numberValue(appSummary.app_operator_production_evidence_tail_blocking_item_count),
        blocking_policy: 'reported_for_operator_attention_without_authorizing_domain_or_production_ready',
        authority_boundary: appOperatorDrilldown.authority_boundary ?? authorityBoundary(),
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
        authority_boundary: authorityBoundary(),
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
        stage_receipt_freshness_open_workorder_count: stageReceiptFreshnessOpenWorkorderCount,
        stage_source_scope_missing_workorder_count: stageSourceScopeMissingWorkorderCount,
        stage_runtime_event_missing_workorder_count: stageRuntimeEventMissingWorkorderCount,
        stage_source_scope_missing_ref_count: stageSourceScopeMissingRefCount,
        stage_runtime_event_missing_ref_count: stageRuntimeEventMissingRefCount,
        stage_evidence_workorder_attention_items: stageEvidenceWorkorderAttentionItems,
        domain_dispatch_evidence_workorder_packet_summary:
          domainDispatchEvidenceWorkorderSummary,
        domain_dispatch_evidence_workorder_group_attention_policy:
          'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
        domain_dispatch_evidence_workorder_group_attention_items:
          domainDispatchEvidenceWorkorderGroupAttentionItems,
        domain_dispatch_evidence_workorder_attention_items:
          domainDispatchEvidenceWorkorderAttentionItems,
        next_action_item_count: numberValue(worklistSummary.next_action_item_count),
        provider_scheduler_item_count: numberValue(worklistSummary.provider_scheduler_item_count),
        stage_production_caller_item_count: numberValue(worklistSummary.stage_production_caller_item_count),
        external_evidence_item_count: numberValue(worklistSummary.external_evidence_item_count),
        evidence_gate_item_count: numberValue(worklistSummary.evidence_gate_item_count),
        legacy_cleanup_item_count: numberValue(worklistSummary.legacy_cleanup_item_count),
        worklist_item_is_completion_claim: false,
        authority_boundary: familyRuntimeEvidenceWorklist.authority_boundary ?? authorityBoundary(),
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
        authority_boundary: authorityBoundary(),
      },
      runtime_manager_route_support: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        surface_kind: stringValue(runtimeManagerRouteSupport.surface_kind)
          ?? 'opl_app_drilldown_runtime_manager_route_support',
        source_surface: stringValue(runtimeManagerRouteSupport.source_surface)
          ?? 'opl_runtime_manager.family_runtime_queue.mas_domain_route_projection',
        projection_policy: stringValue(runtimeManagerRouteSupport.projection_policy)
          ?? 'refs_only_supported_route_catalog_no_owner_chain_closure_or_domain_ready_claim',
        owner_route_handoff_ref: stringValue(runtimeManagerMasRouteSupport.owner_route_handoff_ref),
        accepted_runtime_owner_route_ref:
          stringValue(runtimeManagerMasRouteSupport.accepted_runtime_owner_route_ref),
        supported_task_kinds: runtimeManagerRouteSupportTaskKinds,
        action_refs: runtimeManagerRouteSupportActionRefs,
        task_kind_count: runtimeManagerRouteSupportTaskKinds.length,
        aftercare_route_support_count: runtimeManagerAftercareRouteSupportCount,
        action_ref_count: runtimeManagerRouteSupportActionRefs.length,
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
      authority_boundary: authorityBoundary(),
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
