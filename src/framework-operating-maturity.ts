import { buildAgentDefaultCallerReadinessReport } from './agent-platform-surface-ownership.ts';
import { buildBrandModuleL5Status } from './brand-module-l5-evidence.ts';
import { FrameworkContractError } from './contracts.ts';
import { FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS } from './framework-readiness-source-commands.ts';
import {
  booleanValue,
  numberValue,
  record,
  recordList,
  stringValue,
} from './framework-readiness-values.ts';
import { buildStandardDomainAgentConformanceReport } from './standard-domain-agent-conformance.ts';
import type { FrameworkContracts } from './types.ts';

type OperatingMaturityArgs = {
  familyDefaults: boolean;
};

const AUTHORITY_BOUNDARY = {
  can_claim_domain_ready: false,
  can_claim_app_release_ready: false,
  can_claim_l5: false,
  can_claim_production_ready: false,
  can_claim_quality_or_export_ready: false,
  can_claim_artifact_ready: false,
  can_write_domain_truth: false,
  can_write_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_physical_delete: false,
};

function evidenceRequiredStatus(openCounts: number[]) {
  return openCounts.some((count) => count > 0) ? 'evidence_required' : 'evidence_recorded_not_ready_claim';
}

function stringListValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function nextOwnerActions() {
  return [
    {
      lane: 'domain_owner_chain_scaleout',
      owner: 'MAS/MAG/RCA/OMA domain owners',
      required_delta: 'domain_owned_owner_receipt_typed_blocker_human_gate_quality_export_no_regression_or_long_soak_ref',
      source_command: 'opl agents conformance --family-defaults --json',
    },
    {
      lane: 'brand_module_l5_operating_maturity',
      owner: 'brand module owners',
      required_delta: 'live_user_path_cross_agent_scaleout_long_soak_release_install_operator_repair_owner_acceptance_no_second_truth_refs',
      source_command: 'opl brand-modules l5-status --json',
    },
    {
      lane: 'app_release_user_path',
      owner: 'one-person-lab-app release owner',
      required_delta: 'same_cohort_release_user_path_receipt_or_release_owner_typed_blocker',
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
    {
      lane: 'provider_long_soak',
      owner: 'one-person-lab runtime owner',
      required_delta: 'long_soak_recovery_dead_letter_or_provider_blocker_refs',
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
    {
      lane: 'private_platform_retirement',
      owner: 'domain owners',
      required_delta: 'physical_delete_authorization_keep_as_authority_adapter_or_typed_blocker_ref',
      source_command: 'opl agents default-callers --family-defaults --json',
    },
    {
      lane: 'memory_artifact_lifecycle_apply',
      owner: 'domain owners',
      required_delta: 'memory_artifact_lifecycle_receipt_or_typed_blocker_ref',
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
  ];
}

export function buildFrameworkOperatingMaturityReadout(
  contracts: FrameworkContracts,
  args: OperatingMaturityArgs,
) {
  if (!args.familyDefaults) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'framework operating-maturity requires --family-defaults.',
      {
        required: ['--family-defaults'],
      },
    );
  }

  const conformance = record(
    buildStandardDomainAgentConformanceReport(['--family-defaults'], contracts)
      .standard_domain_agent_conformance,
  );
  const domainOwnerChain = record(
    record(conformance.stage_run_domain_adoption_read_model)
      .live_stage_run_progress_evidence_worklist,
  );
  const brandModuleL5 = record(
    buildBrandModuleL5Status(contracts).brand_module_l5_status,
  );
  const defaultCallers = buildAgentDefaultCallerReadinessReport(['--family-defaults']);
  const providerOpenCount = 0;
  const lifecycleOpenCount = 0;
  const cleanupOpenCount = numberValue(defaultCallers.deletion_evidence_worklist_count);
  const l5RequiredModuleCount = numberValue(brandModuleL5.evidence_required_module_count);
  const domainOpenCount = numberValue(domainOwnerChain.open_domain_count);
  const appReleaseOpenCount = 1;
  const openCounts = [
    domainOpenCount,
    l5RequiredModuleCount,
    appReleaseOpenCount,
    providerOpenCount,
    cleanupOpenCount,
    lifecycleOpenCount,
  ];

  return {
    version: 'g2',
    framework_operating_maturity: {
      surface_kind: 'opl_family_operating_maturity_readout',
      owner: 'one-person-lab',
      status: evidenceRequiredStatus(openCounts),
      baseline_level: 'L4_executable_baseline',
      target_level: 'L5_production_operating_maturity',
      source_commands: {
        framework_readiness: 'opl framework readiness --family-defaults --json',
        agents_conformance: 'opl agents conformance --family-defaults --json',
        brand_module_l5_status: 'opl brand-modules l5-status --json',
        agents_default_callers: 'opl agents default-callers --family-defaults --json',
        app_operator_drilldown: SOURCE_COMMANDS.app_operator_drilldown,
      },
      summary: {
        domain_owner_chain_open_domain_count: domainOpenCount,
        brand_module_l5_evidence_required_module_count: l5RequiredModuleCount,
        brand_module_l5_verified_receipt_count:
          numberValue(record(brandModuleL5.evidence_ledger).verified_receipt_count),
        app_release_user_path_open_count: appReleaseOpenCount,
        provider_long_soak_open_count: null,
        cleanup_retirement_open_decision_count: cleanupOpenCount,
        memory_artifact_lifecycle_open_count: null,
        ready_claim_authorized: false,
      },
      domain_owner_chain_scaleout: {
        source_command: 'opl agents conformance --family-defaults --json',
        status: stringValue(domainOwnerChain.status) ?? 'required_from_domain_owner',
        open_domain_count: domainOpenCount,
        required_from: stringValue(domainOwnerChain.required_from) ?? 'domain_owner',
        accepted_refs_only_result_shapes:
          stringListValue(domainOwnerChain.accepted_refs_only_result_shapes),
        domains: recordList(domainOwnerChain.domains),
        authority_boundary: record(domainOwnerChain.authority_boundary),
      },
      brand_module_l5: {
        source_command: 'opl brand-modules l5-status --json',
        status: stringValue(brandModuleL5.status) ?? 'evidence_required',
        baseline_level: brandModuleL5.baseline_level,
        target_level: brandModuleL5.target_level,
        evidence_required_module_count: l5RequiredModuleCount,
        evidence_required_module_ids: stringListValue(brandModuleL5.evidence_required_module_ids),
        l5_complete_module_count: numberValue(brandModuleL5.l5_complete_module_count),
        l5_complete_module_ids: stringListValue(brandModuleL5.l5_complete_module_ids),
        evidence_ledger: record(brandModuleL5.evidence_ledger),
        l5_claim_policy: record(brandModuleL5.l5_claim_policy),
        authority_boundary: record(brandModuleL5.authority_boundary),
      },
      app_release_user_path: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        status: 'evidence_required',
        latest_release_tag: null,
        next_required_delta:
          'same_cohort_app_release_user_path_evidence_or_release_owner_typed_blocker',
        accepted_refs_only_result_shapes: [
          'release_evidence_ref',
          'install_evidence_ref',
          'operator_evidence_ref',
          'release_owner_receipt_ref',
          'typed_blocker_ref',
        ],
        details_stay_out_of_ordinary_cockpit: true,
        release_ready_authorized: false,
      },
      provider_long_soak: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        status: providerOpenCount > 0 ? 'evidence_required' : 'evidence_required',
        open_evidence_count: null,
        accepted_refs_only_result_shapes: [
          'long_soak_ref',
          'recovery_ref',
          'dead_letter_ref',
          'provider_blocker_ref',
          'typed_blocker_ref',
        ],
        provider_completion_counts_as_production_ready: false,
      },
      cleanup_retirement: {
        source_command: 'opl agents default-callers --family-defaults --json',
        status: cleanupOpenCount > 0 ? 'owner_decision_required' : 'owner_decision_required',
        deletion_evidence_worklist_count: cleanupOpenCount,
        default_caller_delete_ready: booleanValue(defaultCallers.default_caller_delete_ready),
        physical_delete_authorized: booleanValue(defaultCallers.physical_delete_authorized),
        physical_delete_authorization_status:
          stringValue(defaultCallers.physical_delete_authorization_status),
        next_required_owner_action: 'domain_owner_choose_delete_authorize_keep_or_typed_blocker',
        accepted_refs_only_result_shapes: [
          'physical_delete_authorization_ref',
          'keep_as_authority_adapter_ref',
          'typed_blocker_ref',
        ],
      },
      memory_artifact_lifecycle: {
        source_command: SOURCE_COMMANDS.app_operator_drilldown,
        status: 'evidence_required',
        open_evidence_count: null,
        accepted_refs_only_result_shapes: [
          'memory_receipt_ref',
          'artifact_mutation_receipt_ref',
          'package_export_lifecycle_receipt_ref',
          'cleanup_restore_retention_receipt_ref',
          'typed_blocker_ref',
        ],
        opl_stores_body_or_verdict: false,
      },
      next_owner_actions: nextOwnerActions(),
      not_claims: [
        'domain_ready',
        'app_release_ready',
        'brand_module_l5_complete',
        'production_ready',
        'physical_delete_authorized',
      ],
      authority_boundary: AUTHORITY_BOUNDARY,
      machine_boundary:
        'Read-only operating maturity aggregation; it consumes existing read models and refs-only ledgers, but does not write domain truth, App release truth, owner receipts, typed blockers, artifact bodies, memory bodies, physical delete authorization, L5 completion, or production readiness.',
    },
  };
}
