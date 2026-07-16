export const REQUIRED_REPO_SOURCE_DIRS = ['agent', 'contracts', 'runtime', 'docs'] as const;
export const SCAFFOLD_MARKER = 'generated_by_opl_standard_domain_agent_scaffold_v1';
export const STARTER_STAGE_ID = 'domain_intake';
export {
  DEFAULT_STAGE_EXECUTOR_BINDING_REF,
  STANDARD_STAGE_PACK_CONFORMANCE_VERSION,
} from '../../stagecraft/index.ts';

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
    domain_policy: 'return_progress_receipt_or_owner_answer_or_hard_stop',
  },
  {
    primitive_id: 'stage_attempt_projection_ledger',
    owner: 'one-person-lab',
    replacement_surface: 'family_runtime_stage_attempt_index',
    domain_policy: 'do_not_own_generic_attempt_ledger',
  },
  {
    primitive_id: 'ai_selected_stage_route_transport',
    owner: 'one-person-lab',
    replacement_surface: 'stage_run_ai_route_context_transport',
    domain_policy: 'codex_cli_selects_any_declared_stage_and_domain_artifacts_are_context_only',
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
