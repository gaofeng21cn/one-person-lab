export type JsonRecord = Record<string, unknown>;

export type MilestonePriority = 'P0' | 'P1' | 'P2';
export type MilestoneState = 'open' | 'partial' | 'closed_structure_gate' | 'deferred_live_evidence';

export type FrameworkTrancheMilestone = {
  milestone_id: string;
  priority: MilestonePriority;
  state: MilestoneState;
  owner_repos: string[];
  lane_role: string;
  current_truth_refs: string[];
  non_live_evidence_acceptance: string[];
  deferred_evidence: string[];
  authority_boundary: Record<string, boolean>;
};

export type TrancheExecutionLane = {
  lane_id: string;
  repo: string;
  priority: MilestonePriority;
  milestone_ids: string[];
  lane_status: string;
  write_set_class: string;
  required_surfaces: string[];
  non_live_completion_evidence_required: string[];
  deferred_evidence: string[];
  forbidden_scope: string[];
};

export type OperatorCompactReadbackSurface = {
  surface_id: string;
  surface_kind: string;
  compact_command: string;
  full_detail_command: string;
  source_surface_ref: string;
  derived_from_full_readback: boolean;
  default_full_readback_unchanged: boolean;
  retained_sections: string[];
  omitted_sections: string[];
  authority_boundary: JsonRecord;
};

export type OperatorCompactReadbackContractSubset = {
  surface_kind: string;
  version: string;
  owner: string;
  state: string;
  default_full_readback_unchanged: boolean;
  compact_surfaces: OperatorCompactReadbackSurface[];
  operator_use: JsonRecord;
  no_second_truth_guard: JsonRecord;
  false_ready_guard: JsonRecord;
  not_authorized_claims: string[];
};

export type GeneratedHostedBoundarySurface = {
  surface_id: string;
  owner: string;
  default_entry: boolean;
  source_catalogs: string[];
  domain_repo_role: string;
  domain_repo_can_own_generated_surface: boolean;
};

export type DomainPackCompilerGeneratedSurface = {
  surface_id: string;
  owner: string;
  default_entry: boolean;
  source_catalogs: string[];
  domain_repo_role: string;
  domain_repo_can_own_generated_surface: boolean;
};

export type DomainPackCompilerContractSubset = {
  generated_interface_bundle: {
    generated_surface_owner: string;
    domain_repo_can_own_generated_surface: boolean;
    default_entry_policy: {
      surface_kind: string;
      status: string;
      owner: string;
      domain_repo_wrapper_policy: string;
      domain_repo_can_own_default_entry: boolean;
      default_entry_surface_ids: string[];
    };
    source_of_work_lineage: {
      surface_kind: string;
      owner: string;
      source_catalogs: string[];
      derived_surface_policy: string;
      domain_repo_wrapper_policy: string;
      authority_boundary: JsonRecord;
    };
    generated_default_entry_no_resurrection_gate: {
      surface_kind: string;
      owner: string;
      release_gate: boolean;
      required_default_entry_surface_ids: string[];
      blocked_resurrection_surface_classes: string[];
      authority_boundary: JsonRecord;
    };
    supported_derived_surfaces: DomainPackCompilerGeneratedSurface[];
  };
};

export type FamilyReadbackUnavailable = {
  status: 'blocked_unavailable';
  error_code: string;
  error_message: string;
  source_command: string;
};

export type DomainPackCompilerFamilyReadback =
  | {
    status: 'available';
    source_command: string;
    source_kind: string;
    summary: JsonRecord;
    authority_boundary: JsonRecord;
  }
  | FamilyReadbackUnavailable;

export type GeneratedInterfacesFamilyReadback =
  | {
    status: 'available';
    source_command: string;
    selected_format: string;
    summary: JsonRecord;
    consumption_status_counts: {
      selected: number;
      ready: number;
      blocked: number;
    };
    consumer_surface_ids: string[];
    active_caller_cutover_statuses: string[];
    generated_wrapper_bundle_statuses: string[];
    domain_generated_surface_owner_claim_count: number;
    authority_boundary: JsonRecord;
  }
  | FamilyReadbackUnavailable;

export type RuntimeEnvironmentSubstrateContractSubset = {
  contract_id: string;
  schema_version: string;
  owner: string;
  state: string;
  implementation_status: string;
  target_planned: boolean;
  ordinary_path: {
    input: string;
    steps: string[];
    default_mode: string;
    domain_agents_declare_dependency_intent_only: boolean;
  };
  materialization_policy: JsonRecord;
  cache_policy: JsonRecord;
  cache_inventory_policy: JsonRecord;
  dependency_prepare_policy: JsonRecord;
  run_context_consumer_policy: JsonRecord;
  authority_boundary: JsonRecord;
  required_readback_claim_fields: string[];
  readback_commands: string[];
  forbidden_claims: string[];
  live_evidence_deferred: string[];
};

export type DomainProgressRuntimeFirstSliceContractSubset = {
  contract_kind: string;
  owner: string;
  surface_kind: string;
  schema_version: string | number;
  status: string;
  purpose: string;
  implementation_refs: JsonRecord;
  physical_persistence_refs: JsonRecord;
  runtime_live_readback_contract: JsonRecord;
  brand_module_partition: JsonRecord;
  allowed_transition_decisions: string[];
  decision_surface_policy: JsonRecord;
  not_complete_claims: string[];
  policy_adapter_contract: {
    surface_kind: string;
    runtime_id: string;
    runtime_owner: string;
    adapter_role: string;
    first_consumer: string;
    accepted_request_surfaces: string[];
    normalized_request_surface: string;
    required_fields: string[];
    fail_closed_reasons: string[];
    forbidden_domain_adapter_outputs: string[];
    authority_boundary: JsonRecord;
  };
  stage_route_false_authority_flags: JsonRecord;
};

export type SchemaContractIdentity = {
  required: string[];
  consts: Record<string, string>;
};

export const NO_SECOND_TRUTH_AUTHORITY_BOUNDARY = {
  can_replace_active_gap_owner: false,
  can_create_second_active_backlog: false,
  can_claim_plan_completion: false,
  can_claim_runtime_ready: false,
  can_claim_domain_ready: false,
  can_claim_app_release_ready: false,
  can_claim_production_ready: false,
  can_write_domain_truth: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_physical_delete: false,
};

export const GENERATED_HOSTED_BOUNDARY_AUTHORITY = {
  ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
  domain_repo_can_own_generated_surface: false,
  domain_repo_can_own_default_entry: false,
  domain_repo_can_own_registry: false,
  domain_repo_can_own_app_workbench: false,
  descriptor_pass_can_claim_domain_ready: false,
  descriptor_pass_can_claim_production_ready: false,
  generated_surface_readback_can_claim_live_app_rendering: false,
  generated_surface_readback_can_claim_default_caller_cutover: false,
};

export const STANDARD_AGENT_LANDING_AUTHORITY = {
  ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
  standard_agent_guard_can_claim_standard_agent_complete: false,
  acceptance_definition_can_claim_domain_ready: false,
  evidence_status_can_claim_target_agent_ready: false,
  private_residue_decision_ledger_can_authorize_physical_delete: false,
  negative_conformance_samples_can_claim_production_ready: false,
};

export const ORDINARY_PROGRESS_GUARD_AUTHORITY = {
  ...NO_SECOND_TRUTH_AUTHORITY_BOUNDARY,
  current_owner_delta_can_claim_domain_ready: false,
  owner_route_projection_can_execute_domain_action: false,
  typed_blocker_readback_can_create_typed_blocker: false,
  human_gate_projection_can_make_human_decision: false,
  evidence_worklist_can_override_current_owner_delta: false,
  raw_worklist_can_be_default_planning_root: false,
  provider_trace_can_be_default_planning_root: false,
};

export const MEMORY_ARTIFACT_LIFECYCLE_REF_SHAPES = [
  'memory_receipt_ref',
  'memory_writeback_receipt_ref',
  'artifact_mutation_receipt_ref',
  'package_lifecycle_receipt_ref',
  'export_lifecycle_receipt_ref',
  'cleanup_restore_retention_receipt_ref',
  'typed_blocker_ref',
  'owner_acceptance_ref',
];

export const NON_LIVE_ACCEPTANCE = [
  'source_or_contract_delta_landed',
  'CLI_or_API_readback_available_when_surface_exists',
  'repo_native_tests_or_focused_contract_guard_passed',
  'docs_folded_back_to_owner_surface',
  'false_ready_and_no_second_truth_flags_explicit',
];

export const DEFERRED_LIVE_EVIDENCE = [
  'owner_chain_live_evidence',
  'provider_long_soak',
  'brand_l5_operating_evidence',
  'app_release_cohort',
  'real_user_path',
  'cross_agent_scaleout',
  'large_live_ledger_refresh',
  'real_paper_project_run_evidence',
];
