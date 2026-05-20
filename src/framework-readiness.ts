import type { FrameworkContracts } from './types.ts';
import { buildAgentReadinessSummary } from './agent-readiness.ts';
import { buildDomainPackCompilerList } from './domain-pack-compiler.ts';
import {
  buildFamilyStageReadinessInspect,
  buildFamilyStagesList,
} from './family-stage-control-plane.ts';
import { runFamilyRuntimeProductionCloseout } from './family-runtime-production-closeout.ts';
import { buildOplFrameworkSemanticHygieneAudit } from './framework-semantic-hygiene.ts';
import { buildRuntimeTraySnapshot } from './runtime-tray-snapshot.ts';

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
  family_runtime_production_closeout:
    'opl family-runtime production-closeout --family-defaults --provider temporal --executor-kind codex_cli --json',
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

function booleanValue(value: unknown) {
  return typeof value === 'boolean' ? value : false;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stageReadinessSummary(readiness: JsonRecord) {
  return record(readiness.summary);
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

function statusFrom(openTailCount: number, attentionGateCount: number, hardBlockerCount: number) {
  if (hardBlockerCount > 0) {
    return 'framework_control_plane_available_with_hard_blockers';
  }
  if (openTailCount > 0 || attentionGateCount > 0) {
    return 'framework_control_plane_available_with_open_production_tail';
  }
  return 'framework_control_plane_available';
}

export async function buildFrameworkReadinessSummary(
  contracts: FrameworkContracts,
  input: FrameworkReadinessInput,
) {
  const semanticHygiene = buildOplFrameworkSemanticHygieneAudit(contracts);
  const agentReadiness = record(buildAgentReadinessSummary(['--family-defaults']).agent_readiness);
  const packCompiler = record(buildDomainPackCompilerList(contracts).domain_pack_compiler);
  const familyStages = record(buildFamilyStagesList(contracts).family_stages);
  const stageReadiness = {
    mas: record(buildFamilyStageReadinessInspect(contracts, ['--domain', 'mas']).family_stage_readiness),
    mag: record(buildFamilyStageReadinessInspect(contracts, ['--domain', 'mag']).family_stage_readiness),
    rca: record(buildFamilyStageReadinessInspect(contracts, ['--domain', 'rca']).family_stage_readiness),
  };
  const runtimeSnapshot = await buildRuntimeTraySnapshot(contracts, {
    appOperatorDrilldownDetailLevel: 'summary',
    providerKind: 'temporal',
  });
  const appOperatorDrilldown = record(runtimeSnapshot.runtime_tray_snapshot.app_operator_drilldown);
  const familyRuntimeCloseout = record(
    (await runFamilyRuntimeProductionCloseout(contracts, {
      familyDefaults: true,
      providerKind: 'temporal',
      executorKind: 'codex_cli',
    })).family_runtime_production_closeout,
  );

  const semanticSummary = record(semanticHygiene.summary);
  const agentSummary = record(agentReadiness.summary);
  const packSummary = record(packCompiler.summary);
  const stagesSummary = record(familyStages.summary);
  const appSummary = record(appOperatorDrilldown.summary);
  const closeoutSummary = record(familyRuntimeCloseout.summary);
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
  const appOpenTailCount = numberValue(appSummary.app_operator_production_evidence_tail_open_item_count);
  const stageProductionCallerTailCount = numberValue(appSummary.stage_production_evidence_missing_caller_stage_count);
  const productionCloseoutOpenSafeActionCount =
    numberValue(closeoutSummary.production_closeout_open_safe_action_item_count);
  const semanticAttentionGateCount = numberValue(semanticSummary.attention_required_gate_count);
  const openTailCount = appOpenTailCount + stageProductionCallerTailCount + productionCloseoutOpenSafeActionCount;

  return {
    version: 'g1',
    framework_readiness: {
      surface_kind: 'opl_framework_readiness_summary',
      owner: 'one-person-lab',
      family_defaults: input.familyDefaults === true,
      status: statusFrom(openTailCount, semanticAttentionGateCount, stageHardBlockerCount),
      summary: {
        control_plane_available: true,
        semantic_hygiene_gate_count: numberValue(semanticSummary.gate_count),
        semantic_hygiene_attention_required_gate_count: semanticAttentionGateCount,
        agent_structural_conformance_status: stringValue(agentSummary.structural_conformance_status),
        agent_readiness_production_evidence_tail_count:
          numberValue(agentSummary.agent_readiness_production_evidence_tail_count),
        pack_compiler_ready_domain_count: numberValue(packSummary.ready_domain_count),
        pack_compiler_generated_surface_ready_count: numberValue(packSummary.generated_surface_ready_count),
        pack_compiler_domain_generated_surface_owner_claim_count:
          numberValue(packSummary.domain_generated_surface_owner_claim_count),
        stage_count: numberValue(stagesSummary.stages_count),
        admitted_stage_count: numberValue(stagesSummary.admitted_stages_count),
        blocked_stage_count: numberValue(stagesSummary.blocked_stages_count),
        stage_readiness_hard_blocker_count: stageHardBlockerCount,
        stage_readiness_warning_count: stageWarningCount,
        app_operator_production_evidence_tail_open_item_count: appOpenTailCount,
        stage_production_caller_tail_open_item_count: stageProductionCallerTailCount,
        production_closeout_open_safe_action_item_count: productionCloseoutOpenSafeActionCount,
        provider_slo_cadence_window_status: appSummary.provider_slo_cadence_window_status ?? null,
        provider_slo_capability_status: appSummary.provider_slo_capability_status ?? null,
        production_or_domain_ready: false,
      },
      source_commands: Object.values(SOURCE_COMMANDS),
      evidence_counter_taxonomy: {
        agent_readiness_production_evidence_tail_count:
          'agents readiness structural-conformance tail only',
        app_operator_production_evidence_tail_open_item_count:
          'App/operator production-evidence tail ledger open items',
        stage_production_caller_tail_open_item_count:
          'stage production caller scaleout gap from App/operator stage production evidence',
        production_closeout_open_safe_action_item_count:
          'family-runtime production-closeout open safe-action request/apply/verify routes',
        provider_slo_fields:
          'provider_slo_* fields describe Temporal provider cadence/capability SLO only',
        deprecated_alias_policy:
          'legacy production_evidence_tail_* aliases stay inside source drilldowns and are not emitted as framework readiness defaults',
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
          numberValue(agentSummary.agent_readiness_production_evidence_tail_count),
        agent_readiness_production_evidence_tail_policy:
          agentSummary.agent_readiness_production_evidence_tail_policy ?? null,
        production_or_domain_ready: false,
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
      production_closeout_safe_action_tail: {
        source_command: SOURCE_COMMANDS.family_runtime_production_closeout,
        surface_role: familyRuntimeCloseout.surface_role ?? null,
        lens_policy: familyRuntimeCloseout.lens_policy ?? null,
        closeout_item_count: numberValue(closeoutSummary.closeout_item_count),
        closed_item_count: numberValue(closeoutSummary.closed_item_count),
        open_safe_action_item_count: productionCloseoutOpenSafeActionCount,
        production_closeout_open_safe_action_item_count: productionCloseoutOpenSafeActionCount,
        next_action_item_count: numberValue(closeoutSummary.next_action_item_count),
        provider_scheduler_item_count: numberValue(closeoutSummary.provider_scheduler_item_count),
        stage_production_caller_item_count: numberValue(closeoutSummary.stage_production_caller_item_count),
        external_evidence_item_count: numberValue(closeoutSummary.external_evidence_item_count),
        evidence_gate_item_count: numberValue(closeoutSummary.evidence_gate_item_count),
        legacy_cleanup_item_count: numberValue(closeoutSummary.legacy_cleanup_item_count),
        closeout_item_is_completion_claim: false,
        authority_boundary: familyRuntimeCloseout.authority_boundary ?? authorityBoundary(),
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
