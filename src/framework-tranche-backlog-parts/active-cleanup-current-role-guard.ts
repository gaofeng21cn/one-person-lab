import {
  DEFERRED_LIVE_EVIDENCE,
  NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
} from './shared.ts';

const STRUCTURAL_GUARD_REFS = [
  'contracts/opl-framework/domain-pack-compiler-contract.json#generated_default_entry_no_resurrection_gate',
  'contracts/opl-framework/wrapper-retirement-gate-policy.json',
  'contracts/opl-framework/private-platform-residue-owner-decisions.json',
  'contracts/opl-framework/standard-agent-landing-acceptance-contract.json#private_platform_residue_owner_decision',
  'contracts/opl-framework/brand-module-l5-operating-evidence.json#requirements[].no_resurrection_guard_ref',
  'src/framework-tranche-backlog-parts/generated-hosted-boundary-guard.ts',
  'src/framework-tranche-backlog-parts/standard-agent-landing-guard.ts',
  'src/framework-tranche-backlog-parts/domain-source-ref-integrity-guard.ts',
  'src/framework-tranche-backlog-parts/tranche-data.ts#APP_SHELL_CONVERGENCE_STRUCTURE_READBACK',
  'src/framework-tranche-backlog-parts/tranche-data.ts#CROSS_REPO_REF_INTEGRITY_GUARD',
] as const;

const REGRESSION_GUARD_REFS = [
  'tests/src/active-path-residue-scan.test.ts',
  'tests/src/stale-compat-retirement-guard.test.ts',
  'tests/src/cli/cases/framework-readiness-cli-surface.test.ts',
] as const;

export function buildActiveCleanupCurrentRoleGuardReadback() {
  return {
    surface_kind: 'opl_active_cleanup_current_role_guard_readback',
    readback_role:
      'active_cleanup_current_role_policy_aggregate_not_completion_audit_not_delete_authority',
    owner: 'one-person-lab',
    status: 'closed_structure_gate_not_live_evidence',
    milestone_ids: [
      'strict_source_purity_private_wrapper_retirement',
      'domain_pack_generated_hosted_surfaces',
      'standard_agent_landing_acceptance_guard',
      'app_active_shell_hermes_convergence',
      'support_repo_profile_no_resurrection',
    ],
    source_contract_refs: [
      'contracts/opl-framework/domain-pack-compiler-contract.json#generated_interface_bundle.generated_default_entry_no_resurrection_gate',
      'contracts/opl-framework/wrapper-retirement-gate-policy.json',
      'contracts/opl-framework/private-platform-residue-owner-decisions.json',
      'contracts/opl-framework/standard-agent-landing-acceptance-contract.json',
      'contracts/opl-framework/target-operating-architecture-contract.json#private_platform_residue_default_disposition',
    ],
    source_refs: [...STRUCTURAL_GUARD_REFS],
    regression_guard_refs: [...REGRESSION_GUARD_REFS],
    source_api_readback_refs: [
      'buildFrameworkTrancheBacklogReadback',
      'buildActiveCleanupCurrentRoleGuardReadback',
      'buildGeneratedHostedBoundaryReadback',
      'buildStandardAgentLandingAcceptanceGuardReadback',
      'buildDomainSourceRefIntegrityGuard',
    ],
    source_cli_readback_refs: [
      'opl framework tranche-backlog --family-defaults --json .framework_tranche_backlog.active_cleanup_current_role_guard',
      'opl agents conformance --family-defaults --json',
      'opl agents residue-decisions --family-defaults --json .private_platform_residue_owner_decisions',
      'opl agents default-callers --family-defaults --json',
    ],
    forbidden_surface_roles: [
      'legacy_operator_default_path',
      'compatibility_alias_default_path',
      'gateway_frontdoor_federation_active_route',
      'AGUI_foreground_or_default_GUI_route',
      'Hermes_provider_or_runtime_surface',
      'domain_local_generated_surface_owner',
      'domain_local_default_entry_wrapper',
      'repo_local_workbench_or_status_shell_as_default_surface',
      'support_repo_default_foundry_agent_truth_membership',
      'stale_cross_repo_contract_alias',
      'private_residue_inventory_as_ordinary_owner_delta',
      'docs_readmodel_refs_only_ready_claim',
    ],
    allowed_current_surface_roles: [
      'opl_generated_hosted_surface',
      'domain_handler_target',
      'refs_only_adapter',
      'minimal_authority_function',
      'repo_native_verification_wrapper',
      'history_or_tombstone_reference',
    ],
    active_guard_coverage: {
      docs_and_help_default_path_guard:
        'tests/src/active-path-residue-scan.test.ts#active docs and root help do not advertise legacy operator paths as defaults',
      source_alias_resurrection_guard:
        'tests/src/stale-compat-retirement-guard.test.ts#active OPL machine surfaces do not declare compatibility aliases as live',
      generated_default_entry_no_resurrection_gate:
        'domain-pack-compiler-contract.generated_interface_bundle.generated_default_entry_no_resurrection_gate',
      private_residue_owner_decision_guard:
        'private-platform-residue-owner-decisions.owner_decision_ref_policy',
      support_repo_no_resurrection_guard:
        'framework_tranche_backlog.cross_repo_ref_integrity_guard',
      app_shell_no_resurrection_guard:
        'framework_tranche_backlog.app_shell_policy.convergence_readback',
      domain_source_ref_no_second_truth_guard:
        'framework_tranche_backlog.domain_source_ref_integrity_guard',
    },
    structural_closeout_guard: {
      can_close_non_live_structure_gate: true,
      required_current_truth_surfaces: [
        'generated_default_entry_current_role_guard',
        'active_path_residue_scan',
        'stale_compat_retirement_guard',
        'private_platform_residue_owner_decisions_contract',
        'cross_repo_ref_integrity_guard',
        'app_shell_convergence_archived_AGUI_guard',
        'domain_source_ref_integrity_guard',
      ],
      required_verification_commands: [
        'node --experimental-strip-types --test tests/src/active-path-residue-scan.test.ts',
        'node --experimental-strip-types --test tests/src/stale-compat-retirement-guard.test.ts',
        'node --experimental-strip-types --test tests/src/cli/cases/framework-readiness-cli-surface.test.ts',
        './bin/opl framework tranche-backlog --family-defaults --json',
      ],
      cannot_claim: [
        'physical_delete_authorized',
        'default_caller_cutover',
        'active_shell_adopted',
        'AGUI_foreground_route',
        'Hermes_provider_or_runtime_ready',
        'support_repo_foundry_truth_membership',
        'domain_ready',
        'App_release_ready',
        'production_ready',
        'owner_receipt_signed',
        'typed_blocker_created',
        'human_decision_made',
        'live_evidence_complete',
        'full_goal_complete',
      ],
    },
    deferred_evidence: [
      'physical_delete_owner_receipt',
      'default_caller_live_scaleout',
      'App_operator_sustained_consumption',
      'support_repo_owner_acceptance',
      ...DEFERRED_LIVE_EVIDENCE,
    ],
    no_second_truth_guard: {
      cleanup_guard_can_create_second_active_backlog: false,
      cleanup_guard_can_replace_active_gap_owner: false,
      cleanup_guard_can_create_missing_contract_alias: false,
      cleanup_guard_can_create_compatibility_wrapper: false,
      cleanup_guard_can_replace_domain_truth: false,
      cleanup_guard_can_write_owner_receipt: false,
      cleanup_guard_can_create_typed_blocker: false,
      cleanup_guard_can_authorize_physical_delete: false,
    },
    authority_boundary: {
      ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
      can_create_compatibility_alias: false,
      can_create_legacy_wrapper: false,
      can_restore_AGUI_foreground_route: false,
      can_promote_Hermes_to_provider_runtime: false,
      can_create_support_repo_policy_alias: false,
      can_authorize_default_caller_cutover: false,
    },
    false_ready_guard: {
      guard_pass_can_claim_domain_ready: false,
      guard_pass_can_claim_App_release_ready: false,
      guard_pass_can_claim_production_ready: false,
      guard_pass_can_claim_live_evidence_complete: false,
      guard_pass_can_claim_full_goal_complete: false,
      no_violation_scan_can_authorize_physical_delete: false,
      no_violation_scan_can_claim_default_caller_cutover: false,
      generated_no_resurrection_gate_can_claim_App_GUI_complete: false,
      support_profile_clean_can_claim_foundry_agent_truth_membership: false,
    },
  };
}
