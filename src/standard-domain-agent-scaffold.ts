const REQUIRED_REPO_SOURCE_DIRS = ['agent', 'contracts', 'runtime', 'docs'] as const;
const DOCS_TAXONOMY = [
  'active',
  'public',
  'product',
  'runtime',
  'delivery',
  'source',
  'policies',
  'specs',
  'references',
  'history',
] as const;

const OPL_OWNED_GENERIC_PRIMITIVES = [
  {
    primitive_id: 'scheduler_supervision_cadence',
    owner: 'one-person-lab',
    replacement_surface: 'family_scheduler_replacement',
    domain_policy: 'consume_or_project_refs_only',
  },
  {
    primitive_id: 'provider_slo_and_wakeup_transport',
    owner: 'one-person-lab',
    replacement_surface: 'provider_backed_family_runtime',
    domain_policy: 'return_owner_receipt_or_typed_blocker',
  },
  {
    primitive_id: 'queue_attempt_ledger',
    owner: 'one-person-lab',
    replacement_surface: 'family_runtime_queue',
    domain_policy: 'do_not_own_generic_attempt_ledger',
  },
  {
    primitive_id: 'generic_transition_runner',
    owner: 'one-person-lab',
    replacement_surface: 'family_transition_runner',
    domain_policy: 'own_domain_transition_spec_only',
  },
  {
    primitive_id: 'workspace_source_intake_shell',
    owner: 'one-person-lab',
    replacement_surface: 'workspace_source_intake_projection',
    domain_policy: 'own_source_truth_and_readiness_refs',
  },
  {
    primitive_id: 'memory_locator_writeback_transport',
    owner: 'one-person-lab',
    replacement_surface: 'memory_locator_index_projection',
    domain_policy: 'own_memory_body_accept_reject_and_receipts',
  },
  {
    primitive_id: 'artifact_package_lifecycle_shell',
    owner: 'one-person-lab',
    replacement_surface: 'package_export_lifecycle_projection',
    domain_policy: 'own_artifact_body_package_ready_and_export_verdict',
  },
  {
    primitive_id: 'operator_workbench_drilldown_shell',
    owner: 'one-person-lab',
    replacement_surface: 'stage_attempt_workbench',
    domain_policy: 'project_domain_refs_without_rebuilding_workbench',
  },
  {
    primitive_id: 'observability_repair_projection',
    owner: 'one-person-lab',
    replacement_surface: 'observability_slo_projection',
    domain_policy: 'own_domain_blocker_and_safe_repair_hints',
  },
] as const;

const DOMAIN_RETAINED_THIN_SURFACES = [
  'domain_truth',
  'domain_transition_spec',
  'domain_stage_descriptors',
  'domain_action_metadata',
  'quality_or_export_verdict',
  'artifact_authority',
  'memory_body',
  'owner_receipt',
  'typed_blocker',
  'sidecar_or_projection_adapter',
  'domain_entry_and_tests',
] as const;

const FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES = [
  'generic_scheduler_owner',
  'generic_daemon_owner',
  'generic_lifecycle_owner',
  'generic_queue_owner',
  'generic_attempt_ledger_owner',
  'generic_state_machine_runner_owner',
  'generic_workspace_source_intake_owner',
  'generic_memory_transport_owner',
  'generic_artifact_gallery_owner',
  'generic_operator_workbench_owner',
  'generic_observability_slo_owner',
] as const;

const REQUIRED_CONTRACT_SURFACES = [
  'domain_agent_descriptor',
  'product_entry_manifest',
  'stage_control_plane',
  'family_action_catalog',
  'domain_memory_descriptor_locator',
  'artifact_locator_contract',
  'owner_receipt_contract',
  'quality_or_export_gate_refs',
  'physical_skeleton_follow_through',
  'legacy_retirement_tombstone_proof',
] as const;

const REQUIRED_VERIFICATION = [
  'direct_skill_path_parity',
  'opl_hosted_path_parity',
  'no_forbidden_write',
  'no_active_generic_owner_caller',
  'replacement_or_no_regression_evidence',
  'receipt_ref_reconciliation',
  'git_diff_check',
] as const;

export function buildStandardDomainAgentScaffold() {
  return {
    version: 'g2',
    standard_domain_agent_scaffold: {
      surface_kind: 'opl_standard_domain_agent_scaffold',
      version: 'standard-domain-agent-scaffold.v1',
      scaffold_id: 'opl.standard_domain_agent.scaffold.v1',
      owner: 'one-person-lab',
      state: 'template_contract_available',
      contract_ref: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
      generation_policy: {
        scaffold_command_is_read_only: true,
        creates_files: false,
        template_source_of_truth: 'contracts/opl-framework/standard-domain-agent-skeleton-contract.json',
        copy_existing_domain_repo_as_template: false,
      },
      repo_source_boundary: {
        required_dirs: REQUIRED_REPO_SOURCE_DIRS,
        forbidden_dirs: ['artifacts'],
        runtime_artifacts_live_in_source_repo: false,
        real_artifact_roots_are_locators: true,
      },
      docs_taxonomy: DOCS_TAXONOMY,
      required_contract_surfaces: REQUIRED_CONTRACT_SURFACES,
      opl_owned_generic_primitives: OPL_OWNED_GENERIC_PRIMITIVES,
      domain_retained_thin_surfaces: DOMAIN_RETAINED_THIN_SURFACES,
      forbidden_domain_generic_owner_roles: FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES,
      retirement_gate: {
        surface_kind: 'opl_legacy_retirement_gate_checklist',
        required_evidence: [
          'replacement_contract_available',
          'active_callers_migrated',
          'no_active_default_caller',
          'direct_and_opl_hosted_parity',
          'provenance_or_history_tombstone',
          'no_retained_legacy_compatibility_entry',
        ],
        delete_policy: 'delete_or_history_tombstone_only',
        opl_can_execute_domain_repo_delete: false,
      },
      required_verification: REQUIRED_VERIFICATION,
      authority_boundary: {
        opl: 'framework_runtime_development_primitives_contracts_read_models_projection_and_checklist_owner',
        domain_agent: 'domain_truth_quality_export_artifact_memory_body_and_owner_receipt_authority',
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_domain_quality_or_export: false,
        domain_can_own_generic_scheduler_or_queue: false,
      },
    },
  };
}
