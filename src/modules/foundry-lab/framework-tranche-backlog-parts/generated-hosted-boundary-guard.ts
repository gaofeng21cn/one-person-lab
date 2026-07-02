import type { FrameworkContracts } from '../../../kernel/types.ts';
import {
  readDomainPackCompilerContract,
  readDomainPackCompilerFamilyReadback,
  readGeneratedInterfacesFamilyReadback,
} from './contract-readers.ts';
import type { GeneratedHostedBoundarySurface } from './shared.ts';
import { GENERATED_HOSTED_BOUNDARY_AUTHORITY } from './shared.ts';

export function buildGeneratedHostedBoundaryReadback(contracts: FrameworkContracts) {
  const generated = readDomainPackCompilerContract(contracts.contractsDir).generated_interface_bundle;
  const packCompilerFamilyReadback = readDomainPackCompilerFamilyReadback(contracts);
  const generatedInterfacesFamilyReadback = readGeneratedInterfacesFamilyReadback(contracts);
  const surfaces = generated.supported_derived_surfaces.map((surface) => ({
    surface_id: surface.surface_id,
    owner: surface.owner,
    default_entry: surface.default_entry,
    source_catalogs: [...surface.source_catalogs],
    domain_repo_role: surface.domain_repo_role,
    domain_repo_can_own_generated_surface: surface.domain_repo_can_own_generated_surface,
  })) satisfies GeneratedHostedBoundarySurface[];

  return {
    surface_kind: 'opl_generated_hosted_surface_authority_boundary_readback',
    readback_role:
      'generated_hosted_surface_owner_policy_not_domain_ready_not_live_evidence_not_default_caller_cutover',
    owner: 'one-person-lab',
    source_contract_ref: 'contracts/opl-framework/domain-pack-compiler-contract.json#generated_interface_bundle',
    source_api_readback_refs: [
      'buildDomainPackCompilerList({ familyDefaults: true })',
      "buildGeneratedAgentInterfaces(['--family-defaults'])",
      'buildGeneratedSurfaceConsumptionBundle',
      'buildActiveCallerTargetProof',
    ],
    source_cli_readback_refs: [
      'opl agents pack-compiler --family-defaults --json',
      'opl agents interfaces --family-defaults --json',
      'opl agents interfaces --family-defaults --format product-entry --json',
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.generated_hosted_surface_boundary',
    ],
    generated_surface_owner: generated.generated_surface_owner,
    domain_repo_can_own_generated_surface: generated.domain_repo_can_own_generated_surface,
    default_entry_policy: {
      surface_kind: generated.default_entry_policy.surface_kind,
      status: generated.default_entry_policy.status,
      owner: generated.default_entry_policy.owner,
      domain_repo_wrapper_policy: generated.default_entry_policy.domain_repo_wrapper_policy,
      domain_repo_can_own_default_entry: generated.default_entry_policy.domain_repo_can_own_default_entry,
      default_entry_surface_ids: [...generated.default_entry_policy.default_entry_surface_ids],
    },
    source_of_work_lineage: {
      surface_kind: generated.source_of_work_lineage.surface_kind,
      owner: generated.source_of_work_lineage.owner,
      source_catalogs: [...generated.source_of_work_lineage.source_catalogs],
      derived_surface_policy: generated.source_of_work_lineage.derived_surface_policy,
      domain_repo_wrapper_policy: generated.source_of_work_lineage.domain_repo_wrapper_policy,
      authority_boundary: { ...generated.source_of_work_lineage.authority_boundary },
    },
    no_resurrection_gate: {
      surface_kind: generated.generated_default_entry_no_resurrection_gate.surface_kind,
      owner: generated.generated_default_entry_no_resurrection_gate.owner,
      release_gate: generated.generated_default_entry_no_resurrection_gate.release_gate,
      required_default_entry_surface_ids: [
        ...generated.generated_default_entry_no_resurrection_gate.required_default_entry_surface_ids,
      ],
      blocked_resurrection_surface_classes: [
        ...generated.generated_default_entry_no_resurrection_gate.blocked_resurrection_surface_classes,
      ],
      authority_boundary: {
        ...generated.generated_default_entry_no_resurrection_gate.authority_boundary,
      },
    },
    supported_derived_surfaces: surfaces,
    generated_surface_consumption_guard: {
      surface_kind: 'opl_generated_surface_consumption_guard_readback',
      readback_role:
        'family_default_generated_surface_consumption_counts_not_domain_ready_not_live_app_rendering',
      owner: 'one-person-lab',
      domain_pack_compiler_family_readback: packCompilerFamilyReadback,
      generated_interfaces_family_readback: generatedInterfacesFamilyReadback,
      selected_consumer_surface_ids:
        generatedInterfacesFamilyReadback.status === 'available'
          ? [...generatedInterfacesFamilyReadback.consumer_surface_ids]
          : [],
      selected_format_consumption_status:
        generatedInterfacesFamilyReadback.status === 'available'
          ? 'family_default_all_formats_consumption_readback_available'
          : 'blocked_family_default_interfaces_unavailable',
      active_caller_cutover_statuses:
        generatedInterfacesFamilyReadback.status === 'available'
          ? [...generatedInterfacesFamilyReadback.active_caller_cutover_statuses]
          : [],
      generated_wrapper_bundle_statuses:
        generatedInterfacesFamilyReadback.status === 'available'
          ? [...generatedInterfacesFamilyReadback.generated_wrapper_bundle_statuses]
          : [],
      domain_generated_surface_owner_claim_count:
        generatedInterfacesFamilyReadback.status === 'available'
          ? generatedInterfacesFamilyReadback.domain_generated_surface_owner_claim_count
          : null,
      family_default_pack_compiler_status:
        packCompilerFamilyReadback.status === 'available'
          ? 'family_default_pack_compiler_readback_available'
          : 'blocked_family_default_pack_compiler_unavailable',
      family_default_interfaces_status:
        generatedInterfacesFamilyReadback.status === 'available'
          ? 'family_default_generated_interfaces_readback_available'
          : 'blocked_family_default_generated_interfaces_unavailable',
      authority_boundary: {
        consumption_guard_can_write_domain_truth: false,
        consumption_guard_can_sign_owner_receipt: false,
        consumption_guard_can_create_typed_blocker: false,
        consumption_guard_can_authorize_physical_delete: false,
        consumption_guard_can_claim_default_caller_cutover: false,
        consumption_guard_can_claim_app_live_rendering_complete: false,
        consumption_guard_can_claim_domain_ready: false,
        consumption_guard_can_claim_production_ready: false,
      },
    },
    structural_closeout_guard: {
      milestone_id: 'domain_pack_generated_hosted_surfaces',
      status: 'closed_structure_gate_not_live_evidence',
      required_current_truth_surfaces: [
        'domain-pack-compiler-contract.generated_interface_bundle',
        'opl agents pack-compiler --family-defaults --json',
        'opl agents interfaces --family-defaults --json',
        'generated_surface_consumption_bundle',
        'active_caller_cutover_proof',
      ],
      can_close_non_live_structure_gate:
        packCompilerFamilyReadback.status === 'available'
        && generatedInterfacesFamilyReadback.status === 'available',
      cannot_claim: [
        'domain_ready',
        'production_ready',
        'App_live_rendering_complete',
        'default_caller_live_scaleout',
        'physical_delete_authorized',
        'owner_receipt_signed',
        'typed_blocker_created',
        'full_goal_complete',
      ],
    },
    domain_repo_required_role:
      'declarative_domain_pack_plus_domain_handler_targets_refs_only_adapters_or_tombstone_candidates',
    support_repo_boundary: {
      support_repos_are_explicit_extensions_only: true,
      support_repos_can_join_default_foundry_agent_truth_set: false,
      support_repos_can_claim_generated_surface_owner: false,
      support_repos_can_claim_app_shell_owner: false,
      support_repos_can_claim_production_readiness: false,
    },
    authority_boundary: { ...GENERATED_HOSTED_BOUNDARY_AUTHORITY },
    false_ready_guard: {
      descriptor_ready_can_claim_domain_ready: false,
      generated_bundle_ready_can_claim_production_ready: false,
      refs_only_consumption_can_claim_live_evidence_complete: false,
      generated_consumption_bundle_ready_can_claim_domain_ready: false,
      generated_consumption_bundle_ready_can_claim_default_caller_cutover: false,
      generated_consumption_bundle_ready_can_claim_App_GUI_complete: false,
      family_default_pack_compiler_ready_can_claim_domain_ready: false,
      app_projection_can_claim_live_rendering_complete: false,
      support_profile_clean_can_claim_foundry_agent_truth: false,
      default_caller_evidence_worklist_can_authorize_physical_delete: false,
    },
  };
}
