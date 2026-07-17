import { unique } from '../pack/index.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_REGISTRY_REF,
  resolveStandardAgent,
} from '../atlas/index.ts';
import type {
  FrameworkCapabilityPackageConformanceReport,
  RepoConformanceReport,
} from './standard-domain-agent-conformance.ts';
import type { FrameworkContracts } from '../../kernel/types.ts';

type DefaultOwnerRoutePolicy = {
  surface_kind: string;
  applies_to_agent_ids: string[];
  default_route_root: string;
  default_execution_resource: string;
  generated_surface_entrypoints: string[];
  owner_boundary: string;
  private_wrapper_disposition: string;
  false_authority_boundary: Record<string, false>;
};

function statusFromBlockers(blockers: string[]) {
  return blockers.length === 0 ? 'passed' : 'blocked';
}

function canonicalFoundryAgentId(report: RepoConformanceReport) {
  const rawId = report.requested_agent_id ?? report.domain_id;
  return resolveStandardAgent(rawId)?.agent_id ?? rawId;
}

function buildFoundryAgentOsDomainConformance(
  report: RepoConformanceReport,
  expectedAgents: string[],
  defaultOwnerRoutePolicy: DefaultOwnerRoutePolicy | null,
) {
  const canonicalAgentId = canonicalFoundryAgentId(report);
  const standardMembership = expectedAgents.includes(canonicalAgentId)
    ? 'standard_domain_agent'
    : 'unknown_non_standard_agent';
  const defaultOwnerRouteApplies = defaultOwnerRoutePolicy?.applies_to_agent_ids.includes(canonicalAgentId) ?? false;
  const defaultEntrySourceOfWorkGate = report.generated_interface_checks.default_entry_source_of_work_gate;
  const stageDefaultReadSurface = report.stage_operating_principle_checks.default_read_surface;
  const capabilityRegistryBlockers = [
    report.stage_operating_principle_checks.speed_policy.strategy_refs_block_launch_by_default === false
      ? null
      : 'capability_registry_strategy_refs_must_fail_open_by_default',
    report.stage_operating_principle_checks.speed_policy.tool_catalog_can_prescribe_workflow_sequence === false
      ? null
      : 'capability_registry_tool_catalog_must_not_prescribe_workflow_sequence',
    report.stage_operating_principle_checks.authority_boundary.opl_can_create_typed_blocker === false
      ? null
      : 'capability_registry_can_create_typed_blocker_must_be_false',
    report.stage_operating_principle_checks.authority_boundary.opl_can_sign_domain_owner_receipt === false
      ? null
      : 'capability_registry_can_sign_owner_receipt_must_be_false',
    report.stage_operating_principle_checks.authority_boundary.opl_can_authorize_quality_or_export === false
      ? null
      : 'capability_registry_can_authorize_quality_or_export_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  const defaultReadRootBlockers = [
    stageDefaultReadSurface.root === 'current_owner_delta'
      ? null
      : 'default_read_root_must_be_current_owner_delta',
    stageDefaultReadSurface.raw_worklist_default === false
      ? null
      : 'raw_worklist_must_not_generate_default_next_action',
    stageDefaultReadSurface.replay_packet_default === false
      ? null
      : 'stage_replay_packet_must_not_generate_default_next_action',
    stageDefaultReadSurface.evidence_accounting_default === false
      ? null
      : 'evidence_accounting_must_not_generate_default_next_action',
    stageDefaultReadSurface.cleanup_delete_gate_default === false
      ? null
      : 'cleanup_delete_gate_must_not_generate_default_next_action',
  ].filter((entry): entry is string => Boolean(entry));
  const generatedSurfaceBlockers = [
    report.pack_compiler_checks.status === 'passed'
      ? null
      : 'pack_compiler_checks_blocked',
    report.generated_surface_handoff_checks.status === 'passed'
      ? null
      : 'generated_surface_handoff_checks_blocked',
    report.generated_interface_checks.status === 'passed'
      ? null
      : 'generated_interface_checks_blocked',
    defaultEntrySourceOfWorkGate.status === 'passed'
      ? null
      : 'generated_default_entry_source_of_work_gate_blocked',
    report.pack_compiler_checks.generated_surface_owner === 'one-person-lab'
      ? null
      : 'pack_compiler_generated_surface_owner_must_be_opl',
    report.generated_surface_handoff_checks.generated_surface_owner === 'one-person-lab'
      ? null
      : 'generated_surface_handoff_owner_must_be_opl',
    report.pack_compiler_checks.domain_repo_can_own_generated_surface === false
      ? null
      : 'pack_compiler_domain_repo_can_own_generated_surface_must_be_false',
    report.generated_surface_handoff_checks.domain_repo_can_own_generated_surface === false
      ? null
      : 'generated_surface_handoff_domain_repo_can_own_generated_surface_must_be_false',
    defaultEntrySourceOfWorkGate.authority_boundary.can_write_domain_truth === false
      ? null
      : 'generated_surface_can_write_domain_truth_must_be_false',
    defaultEntrySourceOfWorkGate.authority_boundary.can_claim_domain_ready === false
      ? null
      : 'generated_surface_can_claim_domain_ready_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  const domainAuthorityBlockers = [
    report.legacy_runtime_residue_guard.authority_boundary.guard_can_write_domain_truth === false
      ? null
      : 'legacy_runtime_guard_can_write_domain_truth_must_be_false',
    report.legacy_runtime_residue_guard.authority_boundary.guard_can_authorize_quality_or_export === false
      ? null
      : 'legacy_runtime_guard_can_authorize_quality_or_export_must_be_false',
    report.stage_run_kernel_profile_checks.authority_boundary.opl_can_sign_domain_owner_receipt === false
      ? null
      : 'stage_run_kernel_can_sign_owner_receipt_must_be_false',
    report.stage_run_kernel_profile_checks.stage_run_state_machine.provider_completion_counts_as_domain_accepted === false
      ? null
      : 'provider_completion_must_not_count_as_domain_accepted',
    report.golden_path_default_surface_budget_checks.authority_boundary.guard_can_write_domain_truth === false
      ? null
      : 'golden_path_guard_can_write_domain_truth_must_be_false',
  ].filter((entry): entry is string => Boolean(entry));
  const blockers = unique([
    standardMembership !== 'unknown_non_standard_agent'
      ? null
      : `domain_not_in_foundry_agent_os_standard:${report.requested_agent_id ?? report.domain_id}`,
    ...defaultReadRootBlockers,
    ...generatedSurfaceBlockers,
    ...capabilityRegistryBlockers,
    ...domainAuthorityBlockers,
  ].filter((entry): entry is string => Boolean(entry)));

  return {
    domain_id: report.domain_id,
    requested_agent_id: report.requested_agent_id,
    canonical_agent_id: canonicalAgentId,
    standard_membership: standardMembership,
    foundry_agent_os_standard_member: standardMembership === 'standard_domain_agent',
    status: statusFromBlockers(blockers),
    default_read_root: stageDefaultReadSurface.root,
    raw_worklist_generates_default_next_action: stageDefaultReadSurface.raw_worklist_default !== false,
    provider_completion_counts_as_domain_completion:
      report.stage_run_kernel_profile_checks.stage_run_state_machine.provider_completion_counts_as_domain_accepted,
    generated_surface_status: statusFromBlockers(generatedSurfaceBlockers),
    generated_surface_owner: report.generated_surface_handoff_checks.generated_surface_owner,
    direct_hosted_accepted_answer_shape_policy:
      report.generated_interface_checks.active_caller_cutover_proof_status,
    source_of_work_status: defaultEntrySourceOfWorkGate.status,
    capability_registry_policy_status: statusFromBlockers(capabilityRegistryBlockers),
    optional_ref_policy: 'fail_open_unless_current_owner_delta_requires_route_ref',
    default_owner_route: defaultOwnerRouteApplies
      ? {
          status: 'default_stage_run_owner_route',
          route_root: defaultOwnerRoutePolicy?.default_route_root,
          execution_resource: defaultOwnerRoutePolicy?.default_execution_resource,
          generated_surface_entrypoints: defaultOwnerRoutePolicy?.generated_surface_entrypoints,
          owner_boundary: defaultOwnerRoutePolicy?.owner_boundary,
          private_wrapper_disposition: defaultOwnerRoutePolicy?.private_wrapper_disposition,
          false_authority_boundary: defaultOwnerRoutePolicy?.false_authority_boundary,
        }
      : null,
    domain_authority_kernel_status: statusFromBlockers(domainAuthorityBlockers),
    false_authority_flags: {
      conformance_pass_can_claim_domain_ready: false,
      conformance_pass_can_claim_production_ready: false,
      generated_surface_can_write_domain_truth: false,
      capability_registry_can_create_typed_blocker: false,
      capability_registry_can_sign_owner_receipt: false,
      provider_completion_can_claim_domain_completion: false,
    },
    blockers,
  };
}

function buildFoundryAgentOsFrameworkCapabilityConformance(
  report: FrameworkCapabilityPackageConformanceReport,
) {
  const blockers: string[] = unique(
    report.blockers.filter((entry): entry is string => typeof entry === 'string'),
  );
  return {
    domain_id: report.domain_id,
    requested_agent_id: report.requested_agent_id,
    canonical_agent_id: report.canonical_agent_id,
    standard_membership: 'framework_capability_package',
    foundry_agent_os_standard_member: false,
    foundry_agent_os_public_projection_member: true,
    status: statusFromBlockers(blockers),
    default_read_root: 'current_owner_delta',
    raw_worklist_generates_default_next_action: false,
    provider_completion_counts_as_domain_completion: false,
    generated_surface_status: statusFromBlockers(blockers),
    generated_surface_owner: 'one-person-lab',
    direct_hosted_accepted_answer_shape_policy: 'framework_capability_package_refs_only',
    source_of_work_status: statusFromBlockers(blockers),
    capability_registry_policy_status: statusFromBlockers(blockers),
    optional_ref_policy: 'fail_open_unless_current_owner_delta_requires_route_ref',
    domain_authority_kernel_status: statusFromBlockers(blockers),
    package_scope: report.package_scope,
    capability_contract_ref: report.capability_contract_ref,
    false_authority_flags: {
      conformance_pass_can_claim_domain_ready: false,
      conformance_pass_can_claim_production_ready: false,
      generated_surface_can_write_domain_truth: false,
      capability_registry_can_create_typed_blocker: false,
      capability_registry_can_sign_owner_receipt: false,
      provider_completion_can_claim_domain_completion: false,
    },
    authority_boundary: {
      capability_package_can_claim_domain_ready: report.authority_boundary.can_claim_domain_ready,
      capability_package_can_claim_runtime_ready: report.authority_boundary.can_claim_runtime_ready,
      capability_package_can_write_domain_truth: report.authority_boundary.can_write_domain_truth,
      capability_package_can_sign_owner_receipt: report.authority_boundary.can_sign_owner_receipt,
      capability_package_can_create_typed_blocker: report.authority_boundary.can_create_typed_blocker,
      capability_package_can_schedule_runtime: report.authority_boundary.can_schedule_runtime,
    },
    blockers,
  };
}

function buildFoundryAgentOsFrameworkCapabilityConformanceFromRepoReport(
  report: RepoConformanceReport,
) {
  const canonicalAgentId = canonicalFoundryAgentId(report);
  const blockers: string[] = unique(
    report.blockers.filter((entry): entry is string => typeof entry === 'string'),
  );
  return buildFoundryAgentOsFrameworkCapabilityConformance({
    repo_dir: report.repo_dir,
    requested_agent_id: report.requested_agent_id,
    domain_id: report.domain_id,
    canonical_agent_id: canonicalAgentId ?? report.domain_id,
    package_scope: 'framework_capability_package',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    contract_status: 'resolved',
    capability_contract_ref: `package:${canonicalAgentId}#/capability_provider`,
    plugin_manifest_path: '',
    skill_entry_path: '',
    authority_boundary: {
      can_claim_domain_ready: false,
      can_claim_runtime_ready: false,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_schedule_runtime: false,
    },
    blockers,
  });
}

export function buildFoundryAgentOsConformance(
  reports: RepoConformanceReport[],
  contracts: FrameworkContracts,
  frameworkCapabilityPackages: FrameworkCapabilityPackageConformanceReport[] = [],
) {
  const standard = contracts.targetOperatingArchitecture.foundry_agent_os_standard;
  const standardWithDefaultOwnerRoutePolicy = standard as typeof standard & {
    default_owner_route_policy?: DefaultOwnerRoutePolicy;
  };
  const defaultOwnerRoutePolicy = standardWithDefaultOwnerRoutePolicy.default_owner_route_policy ?? null;
  const expectedAgents = STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === 'standard_domain_agent')
    .map((entry) => entry.agent_id);
  const expectedFrameworkCapabilityPackages: string[] = STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === 'framework_capability_package')
    .map((entry) => entry.agent_id);
  const standardDomainReports = reports.filter((report) =>
    !expectedFrameworkCapabilityPackages.includes(canonicalFoundryAgentId(report))
  );
  const frameworkCapabilityRepoReports = reports.filter((report) =>
    expectedFrameworkCapabilityPackages.includes(canonicalFoundryAgentId(report))
  );
  const domainReports = standardDomainReports.map((report) =>
    buildFoundryAgentOsDomainConformance(report, expectedAgents, defaultOwnerRoutePolicy)
  );
  const frameworkCapabilityDomainReports = frameworkCapabilityPackages.map((report) =>
    buildFoundryAgentOsFrameworkCapabilityConformance(report)
  );
  const frameworkCapabilityDomainReportsFromRepoReports = frameworkCapabilityRepoReports.map((report) =>
    buildFoundryAgentOsFrameworkCapabilityConformanceFromRepoReport(report)
  );
  const allDomainReports = [
    ...domainReports,
    ...frameworkCapabilityDomainReports,
    ...frameworkCapabilityDomainReportsFromRepoReports,
  ];
  const reportedAgentIds = allDomainReports
    .filter((report) => report.standard_membership === 'standard_domain_agent')
    .map((report) => report.canonical_agent_id)
    .filter((agentId): agentId is string => typeof agentId === 'string');
  const unknownNonStandardAgentIds = allDomainReports
    .filter((report) => report.standard_membership === 'unknown_non_standard_agent')
    .map((report) => report.canonical_agent_id)
    .filter((agentId): agentId is string => typeof agentId === 'string');
  const frameworkCapabilityPackageIds = allDomainReports
    .filter((report) => report.standard_membership === 'framework_capability_package')
    .map((report) => report.canonical_agent_id)
    .filter((agentId): agentId is string => typeof agentId === 'string');
  const missingAgents = expectedAgents.filter((agentId) => !reportedAgentIds.includes(agentId));
  const missingFrameworkCapabilityPackages = expectedFrameworkCapabilityPackages
    .filter((agentId) => !frameworkCapabilityPackageIds.includes(agentId));
  const missingClaimBlockers = [
    'default_read_root_is_current_owner_delta',
    'domain_authority_false_flags_on_opl_modules',
    'generated_surfaces_do_not_write_domain_truth',
    'conformance_pass_does_not_claim_domain_ready',
    'ledger_console_runway_do_not_sign_owner_answer',
    'capability_registry_fails_open_unless_current_delta_requires_ref',
    'default_cli_skill_app_product_entry_route_through_stage_run_owner_delta',
  ].filter((claim) => !standard.cross_agent_conformance_required_claims.includes(claim))
    .map((claim) => `foundry_agent_os_standard_claim_missing:${claim}`);
  const blockers = unique([
    ...missingAgents.map((agentId) => `foundry_agent_os_standard_agent_missing:${agentId}`),
    ...missingFrameworkCapabilityPackages.map((agentId) => `foundry_agent_os_framework_capability_package_missing:${agentId}`),
    ...missingClaimBlockers,
    ...allDomainReports.flatMap((report) => report.blockers),
  ]);

  return {
    surface_kind: 'opl_foundry_agent_os_conformance',
    owner: 'one-person-lab',
    status: statusFromBlockers(blockers),
    pattern_id: standard.pattern_id,
    standard_agent_registry_ref: STANDARD_AGENT_REGISTRY_REF,
    target_shape: standard.target_shape,
    source_pattern_ref: standard.source_pattern_ref,
    applies_to_domain_agents: expectedAgents,
    framework_capability_package_ids: expectedFrameworkCapabilityPackages,
    observed_domain_agent_ids: reportedAgentIds,
    observed_framework_capability_package_ids: frameworkCapabilityPackageIds,
    unknown_non_standard_agent_ids: unknownNonStandardAgentIds,
    missing_domain_agent_ids: missingAgents,
    missing_framework_capability_package_ids: missingFrameworkCapabilityPackages,
    conformance_required_claims: standard.cross_agent_conformance_required_claims,
    forbidden_claims: standard.forbidden_claims,
    module_mapping: standard.opl_module_mapping,
    capability_registry_boundary: {
      owner_modules: standard.capability_registry_boundary.owner_modules,
      default_behavior: standard.capability_registry_boundary.default_behavior,
      resolver_abi_ref: standard.capability_registry_boundary.resolver_abi_ref,
      selector_helper_ref: standard.capability_registry_boundary.selector_helper_ref,
      fail_open_policy: standard.capability_registry_boundary.fail_open_policy,
      must_not_create: standard.capability_registry_boundary.must_not_create,
      optional_ref_missing_default: standard.capability_registry_boundary.optional_ref_missing_default,
      route_required_ref_missing: standard.capability_registry_boundary.route_required_ref_missing,
    },
    default_owner_route_policy: defaultOwnerRoutePolicy,
    standard_membership_policy: {
      policy_id: 'foundry_agent_standard_membership_is_not_surface_origin.v1',
      source_ref: STANDARD_AGENT_REGISTRY_REF,
      standard_member_agent_ids: expectedAgents,
      generated_surface_is_membership_axis: false,
      generated_surface_is_status_axis: false,
      all_foundry_agents_share_standard_membership: true,
      false_ready_boundary: {
        standard_membership_can_claim_domain_ready: false,
        standard_membership_can_claim_production_ready: false,
        generated_surface_can_claim_domain_ready: false,
        generated_surface_can_claim_foundry_agent_os_complete: false,
      },
    },
    new_agent_baseline_handoff_policy: standard.new_agent_baseline_handoff_policy,
    domains: allDomainReports,
    authority_boundary: {
      conformance_pass_can_claim_domain_ready: false,
      conformance_pass_can_claim_production_ready: false,
      generated_surface_can_write_domain_truth: false,
      generated_surface_can_claim_quality_or_export_verdict: false,
      capability_registry_can_create_typed_blocker: false,
      capability_registry_can_sign_owner_receipt: false,
      capability_registry_can_claim_domain_authority: false,
      ledger_console_runway_can_sign_owner_answer: false,
      provider_completion_can_claim_domain_completion: false,
    },
    blockers,
  };
}
