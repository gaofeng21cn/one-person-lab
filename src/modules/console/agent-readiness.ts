import { buildConformanceProductionEvidenceTailLedger } from '../ledger/index.ts';
import { buildStandardDomainAgentConformanceReport } from '../workspace/index.ts';
import {
  countValue as numberValue,
  type JsonRecord,
  record,
  recordList,
  stringValue,
} from '../../kernel/json-record.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';

function gate(
  gateId: string,
  sourceCommand: string,
  passCount: number,
  blockedCount: number,
  policy: string,
) {
  return {
    gate_id: gateId,
    source_command: sourceCommand,
    status: blockedCount === 0 ? 'passed' : 'blocked',
    pass_count: passCount,
    blocked_count: blockedCount,
    policy,
  };
}

function buildKernelFloor() {
  return {
    surface_kind: 'opl_agent_readiness_kernel_floor',
    policy: 'minimum_structural_boundary_and_evidence_floor_only',
    hard_blocker_sources: [
      'standard_agent_scaffold',
      'pack_compiler_binding',
      'generated_interface_binding',
      'semantic_hygiene',
    ],
    ai_executor_strategy_contract: false,
    prompt_skill_knowledge_strategy_contract: false,
    production_evidence_tail_can_block_structural_conformance: false,
    contract_floor_can_claim_domain_or_quality_ready: false,
  };
}

function buildDiagnosticDrilldowns() {
  return [
    {
      lens_id: 'agent_conformance',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: 'opl agents conformance --family-defaults --json',
      embedded_payload_ref: '/agent_readiness/conformance_report',
    },
    {
      lens_id: 'production_evidence_tail_ledger',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: 'opl agents readiness --family-defaults --json',
      embedded_payload_ref: '/agent_readiness/production_evidence_tail_ledger',
    },
    {
      lens_id: 'pack_compiler',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: 'opl agents pack-compiler --json',
      embedded_payload_ref: '/agent_readiness/gates/pack_compiler',
    },
  ];
}

function buildAttentionFirstPayload(
  readinessStatus: string,
  structuralConformanceStatus: string,
  blockedCount: number,
  tailCount: number,
) {
  const blockers = blockedCount > 0
    ? [{
        blocker_id: 'agent_structural_conformance_blocked',
        count: blockedCount,
        route_ref: 'opl agents conformance --family-defaults --json',
      }]
    : [];
  const warnings = tailCount > 0
    ? [{
        warning_id: 'agent_production_evidence_tail_present',
        count: tailCount,
        policy: 'operator_attention_only_not_structural_or_domain_ready',
        drilldown_ref: '/agent_readiness/production_evidence_tail_ledger',
      }]
    : [];
  const nextSafeActions = blockers.length > 0
    ? [{
        action_id: 'inspect_agent_conformance_blockers',
        command: 'opl agents conformance --family-defaults --json',
        authority: 'diagnostic_only',
      }]
    : warnings.length > 0
      ? [{
          action_id: 'review_agent_production_evidence_tail',
          command: 'opl agents readiness --family-defaults --json',
          detail_ref: '/agent_readiness/production_evidence_tail_ledger',
          authority: 'operator_attention_only',
        }]
      : [{
          action_id: 'no_agent_readiness_action_required',
          authority: 'no_op',
        }];

  return {
    surface_kind: 'opl_agent_readiness_attention_first_payload',
    status: readinessStatus,
    summary: {
      structural_conformance_status: structuralConformanceStatus,
      blocker_count: blockedCount,
      warning_count: warnings.length,
      recommendation_count: warnings.length,
      production_evidence_tail_count: tailCount,
    },
    blockers,
    warnings,
    recommendations: warnings,
    next_safe_actions: nextSafeActions,
    kernel_floor_ref: '/agent_readiness/kernel_floor',
    diagnostic_drilldown_refs: buildDiagnosticDrilldowns().map((lens) => lens.embedded_payload_ref),
    claim_policy:
      'attention_payload_reports_operator_work_only_and_emits_no_domain_quality_artifact_or_production_ready_verdict',
  };
}

export function buildAgentReadinessSummary(args: string[], contracts?: FrameworkContracts) {
  const conformanceReport = buildStandardDomainAgentConformanceReport(args, contracts);
  const conformance = record(conformanceReport.standard_domain_agent_conformance);
  const reports = recordList(conformance.reports);
  const summary = record(conformance.summary);
  const stageRunDomainAdoptionReadModel = record(conformance.stage_run_domain_adoption_read_model);
  const passedCount = typeof summary.passed_count === 'number' ? summary.passed_count : 0;
  const blockedCount = typeof summary.blocked_count === 'number' ? summary.blocked_count : 0;
  const packCompilerBlockedCount = reports.filter((report) =>
    stringValue(record(report.pack_compiler_checks).status) === 'blocked'
  ).length;
  const generatedInterfaceBlockedCount = reports.filter((report) =>
    stringValue(record(report.generated_interface_checks).status) === 'blocked'
  ).length;
  const generatedDefaultEntrySourceOfWorkBlockedCount = reports.filter((report) =>
    stringValue(record(record(report.generated_interface_checks).default_entry_source_of_work_gate).status) === 'blocked'
  ).length;
  const generatedDefaultEntrySourceOfWorkPassedCount = reports.filter((report) =>
    stringValue(record(record(report.generated_interface_checks).default_entry_source_of_work_gate).status) === 'passed'
  ).length;
  const platformSurfaceBlockedCount = reports.filter((report) =>
    stringValue(record(report.platform_surface_ownership_checks).status) === 'blocked'
  ).length;
  const explicitForbiddenOwnerClaimCount = reports.reduce((total, report) => {
    const checks = record(report.platform_surface_ownership_checks);
    return total + recordList(checks.explicit_forbidden_owner_claims).length;
  }, 0);
  const domainGeneratedSurfaceOwnerClaimCount = reports.filter((report) => (
    record(report.generated_interface_checks).domain_repo_can_own_generated_surface === true
    || record(report.pack_compiler_checks).domain_repo_can_own_generated_surface === true
    || record(report.generated_surface_handoff_checks).domain_repo_can_own_generated_surface === true
  )).length;
  const productionEvidenceTailLedger = buildConformanceProductionEvidenceTailLedger(conformanceReport);
  const tailSummary = record(productionEvidenceTailLedger.summary);
  const tailCount = typeof tailSummary.tail_item_count === 'number' ? tailSummary.tail_item_count : 0;
  const readinessStatus = blockedCount > 0
    ? 'blocked'
    : tailCount > 0
      ? 'passed_with_production_evidence_tail'
      : 'passed';
  const structuralConformanceStatus = stringValue(summary.structural_conformance_status)
    ?? (blockedCount === 0 ? 'passed' : 'blocked');

  return {
    version: 'g1',
    agent_readiness: {
      surface_kind: 'opl_agent_readiness_summary',
      owner: 'one-person-lab',
      detail_level: 'summary',
      projection_detail_policy:
        'attention_first_kernel_floor_default_with_embedded_compatibility_drilldowns',
      readiness_model: {
        mode: 'ai_first_contract_light',
        default_payload: 'operator_attention_summary',
        kernel_floor: 'minimum_structural_boundary_and_evidence_floor_only',
        diagnostic_drilldowns_are_authoring_or_audit_aids: true,
        ai_executor_internal_strategy_is_contract: false,
      },
      status: readinessStatus,
      attention_first_payload: buildAttentionFirstPayload(
        readinessStatus,
        structuralConformanceStatus,
        blockedCount,
        tailCount,
      ),
      kernel_floor: buildKernelFloor(),
      diagnostic_drilldowns: buildDiagnosticDrilldowns(),
      excluded_ready_verdicts: [
        'domain_ready_verdict',
        'quality_verdict',
        'artifact_authority_verdict',
        'production_ready_verdict',
      ],
      summary: {
        structural_conformance_status: structuralConformanceStatus,
        conformance_passed_count: passedCount,
        conformance_blocked_count: blockedCount,
        pack_compiler_blocked_domain_count: packCompilerBlockedCount,
        generated_artifact_drift_detected_count: 0,
        domain_generated_surface_owner_claim_count: domainGeneratedSurfaceOwnerClaimCount,
        platform_surface_ownership_blocked_count: platformSurfaceBlockedCount,
        explicit_forbidden_platform_owner_claim_count: explicitForbiddenOwnerClaimCount,
        generated_interface_blocked_count: generatedInterfaceBlockedCount,
        generated_default_entry_source_of_work_blocked_count: generatedDefaultEntrySourceOfWorkBlockedCount,
        agent_readiness_production_evidence_tail_count: tailCount,
        agent_readiness_production_evidence_tail_policy:
          'reported_separately_not_a_structural_pass_condition',
        stage_run_domain_adoption_status:
          stringValue(stageRunDomainAdoptionReadModel.status),
        stage_run_domain_adoption_domain_count:
          typeof stageRunDomainAdoptionReadModel.domain_count === 'number'
            ? stageRunDomainAdoptionReadModel.domain_count
            : 0,
        stage_run_controlled_canary_evidence_scope:
          stringValue(stageRunDomainAdoptionReadModel.controlled_canary_evidence_scope),
      },
      gates: {
        scaffold_and_conformance: gate(
          'scaffold_and_conformance',
          'opl agents conformance --family-defaults --json',
          passedCount,
          blockedCount,
          'structural_conformance_only_no_domain_or_production_ready',
        ),
        pack_compiler: gate(
          'pack_compiler',
          'opl agents pack-compiler --json',
          reports.length - packCompilerBlockedCount,
          packCompilerBlockedCount,
          'canonical_domain_pack_metadata_source_for_generated_surfaces',
        ),
        generated_interfaces: gate(
          'generated_interfaces',
          'opl agents interfaces --family-defaults --json',
          reports.length - generatedInterfaceBlockedCount,
          generatedInterfaceBlockedCount,
          'generated_descriptors_route_to_domain_handler_targets_without_claiming_domain_truth',
        ),
        generated_default_entry_source_of_work: gate(
          'generated_default_entry_source_of_work',
          'opl agents interfaces --family-defaults --json',
          generatedDefaultEntrySourceOfWorkPassedCount,
          generatedDefaultEntrySourceOfWorkBlockedCount,
          'cli_mcp_openai_ai_sdk_skill_app_status_workbench_are_generated_from_one_action_stage_lineage',
        ),
        platform_surface_ownership: gate(
          'platform_surface_ownership',
          'opl agents platform-surfaces --family-defaults --json',
          reports.length - platformSurfaceBlockedCount,
          platformSurfaceBlockedCount,
          'opl_owns_generic_platform_surfaces_domain_repos_keep_authority_refs_only',
        ),
        semantic_hygiene: gate(
          'semantic_hygiene',
          'opl system semantic-hygiene --json',
          1,
          0,
          'framework_hygiene_guard_only_no_domain_authority',
        ),
      },
      stage_run_domain_adoption_read_model: stageRunDomainAdoptionReadModel,
      generated_default_entry_source_of_work: {
        surface_kind: 'opl_generated_default_entry_source_of_work_readiness',
        owner: 'one-person-lab',
        status: generatedDefaultEntrySourceOfWorkBlockedCount === 0 ? 'passed' : 'blocked',
        source_command: 'opl agents interfaces --family-defaults --json',
        passed_domain_count: generatedDefaultEntrySourceOfWorkPassedCount,
        blocked_domain_count: generatedDefaultEntrySourceOfWorkBlockedCount,
        required_default_entry_surface_ids: [
          'cli',
          'mcp',
          'openai_tool',
          'ai_sdk',
          'skill_plugin',
          'app_action',
          'status_read_model',
          'workbench',
        ],
        derived_surface_policy:
          'derive_cli_mcp_openai_ai_sdk_skill_app_status_workbench_from_single_catalog',
        domain_repo_wrapper_policy: 'handler_target_refs_only_adapter_or_tombstone_candidate',
        domain_repo_can_own_default_entry: false,
        descriptor_pass_can_claim_domain_ready: false,
        authority_boundary: {
          can_write_domain_truth: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
          generated_default_entry_is_domain_authority: false,
        },
      },
      production_evidence_tail_ledger: productionEvidenceTailLedger,
      conformance_report: conformance,
      authority_boundary: {
        expert_judgment_priority: 'ai_native_expert_judgment_first',
        contract_floor_policy: 'contracts_preserve_minimum_safety_audit_recovery_floor_only',
        structural_gates_are_contract_floor_only: true,
        readiness_can_claim_domain_ready: false,
        readiness_can_claim_artifact_authority: false,
        readiness_can_claim_production_ready: false,
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        mechanical_signals_can_claim_quality_verdict: false,
        contract_completeness_is_quality_verdict: false,
      },
    },
  };
}
