import {
  DECLARATIVE_DOMAIN_PACK,
  DOMAIN_RETAINED_THIN_SURFACES_DEPRECATED,
  MINIMAL_AUTHORITY_FUNCTIONS,
  PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
  WORKSPACE_FILE_LIFECYCLE_POLICY,
} from './standard-domain-agent-scaffold-policy.ts';

export {
  DECLARATIVE_DOMAIN_PACK,
  DOMAIN_RETAINED_THIN_SURFACES_DEPRECATED,
  MINIMAL_AUTHORITY_FUNCTIONS,
  PRIVATE_FUNCTIONAL_SURFACE_ADMISSION_POLICY,
  WORKSPACE_FILE_LIFECYCLE_POLICY,
};

export const REQUIRED_REPO_SOURCE_DIRS = ['agent', 'contracts', 'runtime', 'docs'] as const;
export const DOCS_TAXONOMY = [
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

export const OPL_OWNED_GENERIC_PRIMITIVES = [
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
  {
    primitive_id: 'generic_persistence_store',
    owner: 'one-person-lab',
    replacement_surface: 'family_persistence_policy_and_runtime_store',
    domain_policy: 'own_file_authority_or_refs_only_sidecar_index',
  },
  {
    primitive_id: 'runtime_lifecycle_sqlite_index_contract',
    owner: 'one-person-lab',
    replacement_surface: 'family_runtime_lifecycle_index_contract',
    domain_policy: 'do_not_claim_generic_sqlite_persistence_engine',
  },
  {
    primitive_id: 'native_helper_generic_envelope',
    owner: 'one-person-lab',
    replacement_surface: 'native_helper_contract_and_execution_envelope',
    domain_policy: 'own_helper_implementation_only',
  },
  {
    primitive_id: 'review_repair_transport',
    owner: 'one-person-lab',
    replacement_surface: 'family_conflict_blocker_and_repair_projection',
    domain_policy: 'own_domain_review_export_or_quality_decision',
  },
  {
    primitive_id: 'pack_compiler_generated_surface',
    owner: 'one-person-lab',
    replacement_surface: 'opl_domain_pack_compiler_and_generated_surface_handoff',
    domain_policy: 'declare_pack_inputs_and_authority_functions_only',
  },
  {
    primitive_id: 'functional_privatization_audit_read_model',
    owner: 'one-person-lab',
    replacement_surface: 'opl_functional_privatization_audit',
    domain_policy: 'declare_module_boundary_without_owning_generic_runtime',
  },
] as const;

export const STANDARD_AGENT_DEFAULT_RUNTIME_POLICY = {
  surface_kind: 'opl_standard_agent_default_runtime_policy',
  owner: 'one-person-lab',
  default_runtime_path: 'opl_temporal_hosted_autonomous',
  temporal_hosted_autonomy_default_enabled: true,
  runtime_owner: 'one-person-lab',
  provider_owner: 'one-person-lab',
  provider_kind_required_for_production: 'temporal',
  default_executor_kind: 'codex_cli',
  codex_app_drives_long_running_tasks: false,
  codex_app_role: 'start_observe_intervene_project_only',
  provider_managed_surfaces: [
    'stage_attempt_runtime',
    'typed_queue',
    'wakeup',
    'resume_requery',
    'retry_dead_letter',
    'attempt_ledger',
    'operator_projection',
  ],
  domain_agent_internal_daemon_allowed: false,
  domain_agent_internal_scheduler_allowed: false,
  domain_agent_internal_attempt_loop_allowed: false,
  domain_agent_retained_authority: [
    'domain_truth',
    'quality_or_export_verdict',
    'artifact_authority',
    'memory_body_accept_reject',
    'owner_receipt',
    'typed_blocker',
  ],
  authority_boundary: {
    provider_completion_can_claim_domain_ready: false,
    provider_completion_can_claim_quality_or_export_verdict: false,
    provider_completion_can_write_domain_truth: false,
    provider_completion_can_issue_owner_receipt: false,
    domain_agent_can_install_generic_daemon: false,
  },
} as const;

export const FORBIDDEN_DOMAIN_GENERIC_OWNER_ROLES = [
  'generic_scheduler_owner',
  'generic_daemon_owner',
  'generic_lifecycle_owner',
  'generic_queue_owner',
  'generic_attempt_ledger_owner',
  'generic_state_machine_runner_owner',
  'generic_cli_mcp_product_wrapper_owner',
  'generic_sidecar_owner',
  'generic_session_store_owner',
  'generic_status_workbench_owner',
  'generic_workspace_source_intake_owner',
  'generic_memory_transport_owner',
  'generic_artifact_gallery_owner',
  'generic_operator_workbench_owner',
  'generic_observability_slo_owner',
  'generic_persistence_engine_owner',
  'generic_sqlite_lifecycle_owner',
  'generic_native_helper_envelope_owner',
  'generic_review_repair_transport_owner',
  'generated_surface_owner_in_domain_repo',
] as const;

export const REQUIRED_CONTRACT_SURFACES = [
  'domain_agent_descriptor',
  'pack_compiler_input',
  'generated_surface_handoff',
  'product_entry_manifest',
  'stage_control_plane',
  'family_action_catalog',
  'domain_memory_descriptor_locator',
  'artifact_locator_contract',
  'owner_receipt_contract',
  'quality_or_export_gate_refs',
  'physical_skeleton_follow_through',
  'legacy_retirement_tombstone_proof',
  'private_functional_surface_policy',
  'functional_privatization_audit',
  'workspace_lifecycle_policy',
] as const;

export const REQUIRED_VERIFICATION = [
  'direct_skill_path_parity',
  'opl_hosted_path_parity',
  'no_forbidden_write',
  'no_active_generic_owner_caller',
  'replacement_or_no_regression_evidence',
  'receipt_ref_reconciliation',
  'git_diff_check',
  'agent_pack_required_paths_resolve',
  'stage_prompt_skill_knowledge_quality_gate_refs_resolve',
  'pack_compiler_input_schema_check',
  'generated_surface_handoff_parity',
  'generated_surface_no_domain_owner',
  'functional_privatization_audit_no_generic_owner',
  'workspace_file_lifecycle_policy_declared',
] as const;

export const SCAFFOLD_MARKER = 'generated_by_opl_standard_domain_agent_scaffold_v1';
export const STARTER_STAGE_ID = 'domain_intake';
export const STANDARD_STAGE_PACK_CONFORMANCE_VERSION = 'standard-stage-pack.v2';
export const DEFAULT_STAGE_EXECUTOR_BINDING_REF = 'default_codex_cli';
export const REQUIRED_AGENT_PACK_SECTIONS = [
  { section: 'prompts', prefix: 'agent/prompts/' },
  { section: 'stages', prefix: 'agent/stages/' },
  { section: 'skills', prefix: 'agent/skills/' },
  { section: 'quality_gates', prefix: 'agent/quality_gates/' },
  { section: 'knowledge', prefix: 'agent/knowledge/' },
] as const;
export const FORBIDDEN_AGENT_PACK_TEXT = /\b(TODO|TBD)\b/i;

export const OPL_GENERATED_SURFACES = [
  {
    surface_id: 'cli',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_declares_actions_stages_and_authority_receipts_only',
  },
  {
    surface_id: 'mcp',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_does_not_handwrite_generic_tool_shell',
  },
  {
    surface_id: 'skill',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_declares_skill_policy_refs_and_direct_path_parity',
  },
  {
    surface_id: 'product_entry_manifest',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_declares_product_entry_refs_and_domain_authority_refs',
  },
  {
    surface_id: 'sidecar_export_dispatch',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_implements_only_domain_authority_function_targets',
  },
  {
    surface_id: 'status_read_model',
    owner: 'one-person-lab',
    source_contract: 'contracts/generated_surface_handoff.json',
    domain_policy: 'domain_repo_returns_receipts_refs_and_typed_blockers',
  },
  {
    surface_id: 'workbench_drilldown',
    owner: 'one-person-lab',
    source_contract: 'contracts/generated_surface_handoff.json',
    domain_policy: 'domain_repo_does_not_own_generic_operator_workbench',
  },
  {
    surface_id: 'functional_harness_cases',
    owner: 'one-person-lab',
    source_contract: 'contracts/pack_compiler_input.json',
    domain_policy: 'domain_repo_supplies_fixtures_expected_receipts_and_forbidden_write_assertions',
  },
] as const;

export const PACK_COMPILER_CONTRACT = {
  surface_kind: 'opl_domain_pack_compiler_contract',
  version: 'opl-domain-pack-compiler.v1',
  owner: 'one-person-lab',
  generated_surface_owner: 'one-person-lab',
  input_contract: 'contracts/pack_compiler_input.json',
  handoff_contract: 'contracts/generated_surface_handoff.json',
  domain_pack_owner_field: 'domain_pack_owner',
  domain_repo_can_own_generated_surface: false,
  allowed_domain_inputs: [
    'declarative_domain_pack',
    'minimal_authority_functions',
    'domain_fixtures',
    'owner_receipt_schema',
    'no_forbidden_write_assertions',
    'standard_stage_pack_v2_cross_refs',
  ],
  required_source_refs: [
    'stage_graph_source_ref',
    'quality_gate_source_ref',
    'executor_policy_source_ref',
    'functional_privatization_audit_source_ref',
    'generated_surface_handoff_source_ref',
  ],
  generated_surfaces: OPL_GENERATED_SURFACES.map((surface) => surface.surface_id),
} as const;

export const GENERATED_SURFACE_CONTRACT = {
  surface_kind: 'opl_generated_surface_contract',
  version: 'opl-generated-surface.v1',
  owner: 'one-person-lab',
  generated_surface_owner: 'one-person-lab',
  domain_repo_can_own_generated_surface: false,
  surfaces: OPL_GENERATED_SURFACES.map((surface) => surface.surface_id),
  authority_boundary: {
    generated_surface_can_write_domain_truth: false,
    generated_surface_can_write_memory_body: false,
    generated_surface_can_authorize_quality_or_export: false,
    generated_surface_can_call_minimal_authority_function_with_receipt_contract: true,
  },
} as const;

export const AGENT_PACK_CONTRACT = {
  canonical_semantic_pack_root: 'agent/',
  required_sections: [
    'agent/prompts',
    'agent/stages',
    'agent/skills',
    'agent/knowledge',
    'agent/quality_gates',
  ],
  required_domain_pack_paths_field: 'contracts/pack_compiler_input.json#/required_domain_pack_paths',
  stage_ref_requirements: [
    'prompt_refs:agent/prompts/*',
    'skills:agent/skills/* or skill_id',
    'knowledge_refs:agent/knowledge/*',
    'evaluation:agent/quality_gates/*',
    'selected_executor:codex_cli default binding or explicit non-default executor binding',
    'stage_contract.requires and stage_contract.ensures',
    'stage_contract.expected_receipt_refs',
    'independent_gate_policy:execution_review_separation',
  ],
  conformance_version: STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
  validator: 'opl agents scaffold --validate <repo-dir>',
  empty_agent_directory_policy: 'blocked',
} as const;
