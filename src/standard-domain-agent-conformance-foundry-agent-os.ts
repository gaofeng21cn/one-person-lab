import { unique } from './standard-domain-agent-conformance-utils.ts';
import type { RepoConformanceReport } from './standard-domain-agent-conformance.ts';
import type { FrameworkContracts } from './types.ts';

function statusFromBlockers(blockers: string[]) {
  return blockers.length === 0 ? 'passed' : 'blocked';
}

function canonicalFoundryAgentId(report: RepoConformanceReport) {
  const rawId = report.requested_agent_id ?? report.domain_id;
  const normalized = rawId.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases: Record<string, string> = {
    mas: 'mas',
    medautoscience: 'mas',
    mag: 'mag',
    medautogrant: 'mag',
    rca: 'rca',
    redcube: 'rca',
    redcubeai: 'rca',
    oma: 'oma',
    oplmetaagent: 'oma',
    bookforge: 'opl-bookforge',
    oplbookforge: 'opl-bookforge',
  };
  return aliases[normalized] ?? rawId;
}

const FOUNDRY_AGENT_OS_SUPPORT_EXTENSIONS = [
  {
    canonical_agent_id: 'opl-bookforge',
    normalized_ids: ['oplbookforge', 'bookforge'],
    support_extension_role:
      'generated_surface_only_projection_not_foundry_agent_os_standard_member',
    policy_refs: [
      'contracts/opl-framework/target-operating-architecture-contract.json#foundry_agent_os_standard',
      'src/foundry-agent-cli-spine.ts#FOUNDRY_AGENT_PEERS.generated_surface_only',
      'src/standard-domain-agent-family-repos.ts#DEFAULT_FAMILY_REPOS',
    ],
  },
] as const;

function normalizedAgentId(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
}

function supportExtensionFor(report: RepoConformanceReport, canonicalAgentId: string) {
  const ids = [
    normalizedAgentId(canonicalAgentId),
    normalizedAgentId(report.requested_agent_id),
    normalizedAgentId(report.domain_id),
  ];
  return FOUNDRY_AGENT_OS_SUPPORT_EXTENSIONS.find((extension) =>
    extension.normalized_ids.some((id) => ids.includes(id))
  ) ?? null;
}

function buildFoundryAgentOsDomainConformance(
  report: RepoConformanceReport,
  expectedAgents: string[],
  flagshipMapping: FrameworkContracts['targetOperatingArchitecture']['flagship_experience_mapping'],
) {
  const canonicalAgentId = canonicalFoundryAgentId(report);
  const supportExtension = supportExtensionFor(report, canonicalAgentId);
  const standardMembership = expectedAgents.includes(canonicalAgentId)
    ? 'standard_domain_agent'
    : supportExtension
      ? 'support_extension'
      : 'unknown_non_standard_agent';
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
    support_extension_role: supportExtension?.support_extension_role ?? null,
    support_extension_policy_refs: supportExtension?.policy_refs ?? [],
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
    domain_authority_kernel_status: statusFromBlockers(domainAuthorityBlockers),
    flagship_experience_mapping: canonicalAgentId === flagshipMapping.flagship_agent_id
      ? {
          mapping_id: flagshipMapping.mapping_id,
          standard_agent_shape: flagshipMapping.standard_agent_shape,
          journey_artifacts: flagshipMapping.journey_artifacts,
          private_platform_residue_inputs: flagshipMapping.private_platform_residue_inputs,
          opl_contract_surfaces: flagshipMapping.opl_contract_surfaces,
          false_ready_claims: flagshipMapping.false_ready_claims,
          authority_boundary: flagshipMapping.authority_boundary,
        }
      : null,
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

export function buildFoundryAgentOsConformance(
  reports: RepoConformanceReport[],
  contracts: FrameworkContracts,
) {
  const standard = contracts.targetOperatingArchitecture.foundry_agent_os_standard;
  const flagshipMapping = contracts.targetOperatingArchitecture.flagship_experience_mapping;
  const expectedAgents = standard.applies_to_domain_agents;
  const domainReports = reports.map((report) =>
    buildFoundryAgentOsDomainConformance(report, expectedAgents, flagshipMapping)
  );
  const reportedAgentIds = domainReports
    .filter((report) => report.standard_membership === 'standard_domain_agent')
    .map((report) => report.canonical_agent_id)
    .filter((agentId): agentId is string => typeof agentId === 'string');
  const supportExtensionReports = domainReports
    .filter((report) => report.standard_membership === 'support_extension');
  const supportExtensionAgentIds = supportExtensionReports
    .map((report) => report.canonical_agent_id)
    .filter((agentId): agentId is string => typeof agentId === 'string');
  const unknownNonStandardAgentIds = domainReports
    .filter((report) => report.standard_membership === 'unknown_non_standard_agent')
    .map((report) => report.canonical_agent_id)
    .filter((agentId): agentId is string => typeof agentId === 'string');
  const missingAgents = expectedAgents.filter((agentId) => !reportedAgentIds.includes(agentId));
  const missingClaimBlockers = [
    'default_read_root_is_current_owner_delta',
    'domain_authority_false_flags_on_opl_modules',
    'generated_surfaces_do_not_write_domain_truth',
    'conformance_pass_does_not_claim_domain_ready',
    'vault_console_runway_do_not_sign_owner_answer',
    'capability_registry_fails_open_unless_current_delta_requires_ref',
  ].filter((claim) => !standard.cross_agent_conformance_required_claims.includes(claim))
    .map((claim) => `foundry_agent_os_standard_claim_missing:${claim}`);
  const blockers = unique([
    ...missingAgents.map((agentId) => `foundry_agent_os_standard_agent_missing:${agentId}`),
    ...missingClaimBlockers,
    ...domainReports.flatMap((report) => report.blockers),
  ]);

  return {
    surface_kind: 'opl_foundry_agent_os_conformance',
    owner: 'one-person-lab',
    status: statusFromBlockers(blockers),
    pattern_id: standard.pattern_id,
    target_shape: standard.target_shape,
    source_pattern_ref: standard.source_pattern_ref,
    applies_to_domain_agents: expectedAgents,
    observed_domain_agent_ids: reportedAgentIds,
    observed_support_extension_agent_ids: supportExtensionAgentIds,
    observed_support_extension_domain_ids: supportExtensionReports.map((report) => report.domain_id),
    unknown_non_standard_agent_ids: unknownNonStandardAgentIds,
    missing_domain_agent_ids: missingAgents,
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
    flagship_experience_mapping: flagshipMapping,
    support_extension_policy: {
      support_extensions_are_not_foundry_agent_os_standard_members: true,
      support_extension_agent_ids: FOUNDRY_AGENT_OS_SUPPORT_EXTENSIONS.map((extension) =>
        extension.canonical_agent_id
      ),
      support_extension_roles: FOUNDRY_AGENT_OS_SUPPORT_EXTENSIONS.map((extension) => ({
        agent_id: extension.canonical_agent_id,
        support_extension_role: extension.support_extension_role,
        policy_refs: extension.policy_refs,
      })),
      false_ready_boundary: {
        support_extension_pass_can_claim_standard_agent_membership: false,
        support_extension_pass_can_claim_domain_ready: false,
        support_extension_pass_can_claim_production_ready: false,
        support_extension_pass_can_claim_foundry_agent_os_complete: false,
      },
    },
    domains: domainReports,
    authority_boundary: {
      conformance_pass_can_claim_domain_ready: false,
      conformance_pass_can_claim_production_ready: false,
      generated_surface_can_write_domain_truth: false,
      generated_surface_can_claim_quality_or_export_verdict: false,
      capability_registry_can_create_typed_blocker: false,
      capability_registry_can_sign_owner_receipt: false,
      capability_registry_can_claim_domain_authority: false,
      vault_console_runway_can_sign_owner_answer: false,
      provider_completion_can_claim_domain_completion: false,
    },
    blockers,
  };
}
