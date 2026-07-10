export type JsonRecord = Record<string, unknown>;

export interface WorkstreamContract {
  workstream_id: string;
  label: string;
  status: string;
  description: string;
  domain_id: string;
  entry_mode: string;
  primary_families: string[];
  top_level_intents: string[];
  notes: string;
}

export interface DomainContract {
  domain_id: string;
  label: string;
  project: string;
  product_layer: string;
  foundry_agent_package: {
    package_kind: string;
    built_on: string;
    app_surface: string;
    direct_skill_entry: boolean;
    embeds_opl_runtime: boolean;
  };
  independent_domain_agent: {
    agent_id: string;
    status: string;
    authority_scope: string;
    opl_top_level_domain_agent: boolean;
  };
  single_app_skill: {
    skill_id: string;
    plugin_name: string;
    activation_kind: string;
    entry_command: string;
    manifest_command: string;
  };
  domain_truth_owner: string[];
  opl_projection_role: string[];
  runtime_dependency_boundary: {
    domain_runtime_owner: string;
    opl_dependency: string;
    opl_truth_write_policy: string;
    backend_companions: Array<{
      project: string;
      role: string;
      controlled_by: string;
      opl_top_level_domain_agent: boolean;
    }>;
  };
  standalone_allowed: boolean;
  owned_workstreams: string[];
  non_opl_families: string[];
}

export interface StageSelectionSpecialCase {
  family: string;
  direct_workstream?: string;
  domain_id: string;
  auto_workstream?: string | null;
  notes: string;
}

export interface StageSelectionVocabularyContract {
  version: string;
  intent_id: string[];
  workstream_id: string[];
  domain_id: string[];
  request_kind: string[];
  target_kind: string[];
  delivery_kind: string[];
  review_kind: string[];
  entry_mode: string[];
  selection_rules: string[];
  special_cases: StageSelectionSpecialCase[];
}

export interface TaskTopologyWorkstream {
  workstream_id: string;
  label: string;
  boundary_state: string;
  registry_state: string;
  selection_state: string;
  current_domain_id: string | null;
  entry_surface: string | null;
  formal_domain_required: boolean;
  delivery_objects: string[];
  typical_tasks: string[];
  reuse_dependencies: string[];
  family_boundary_notes: Array<{
    family_id: string;
    relation: string;
  }>;
  notes: string;
}

export interface TaskTopologyContract {
  version: string;
  scope: string;
  description: string;
  non_goals: string[];
  topology_rules: string[];
  shared_foundation_reuse: string[];
  workstreams: TaskTopologyWorkstream[];
}

export interface PublicSurfaceCategory {
  category_id: string;
  owner_scope: string;
  description: string;
}

export interface PublicSurfaceRef {
  ref_kind: string;
  ref: string;
  language?: string;
}

export interface PublicSurfaceBudget {
  default_surface: boolean;
  default_surface_allowed_reasons: string[];
  promotion_evidence_refs: {
    replaced_or_folded_surface_ref?: string;
    retired_surface_ref?: string;
    folded_into_attention_entry_ref?: string;
  };
  consumer_refs: string[];
  authority_boundary: {
    can_claim_domain_ready: false;
    can_claim_quality_verdict: false;
    can_claim_artifact_authority: false;
    can_claim_production_ready: false;
    can_replace_ai_executor_planning: false;
    can_replace_domain_owner: false;
  };
}

export interface PublicSurfaceContractEntry {
  surface_id: string;
  category_id: string;
  surface_kind: string;
  boundary_role: string;
  owner_scope: string;
  truth_mode: string;
  workstream_ids: string[];
  domain_ids: string[];
  refs: PublicSurfaceRef[];
  routes_to: string[];
  notes: string[];
  surface_budget: PublicSurfaceBudget;
}

export interface PublicSurfaceIndexContract {
  version: string;
  scope: string;
  description: string;
  non_goals: string[];
  ownership_rules: string[];
  surface_categories: PublicSurfaceCategory[];
  surfaces: PublicSurfaceContractEntry[];
}

export interface AgentWorkspaceNormContract {
  surface_kind: string;
  version: string;
  norm_id: string;
  owner: string;
  scope: string;
  machine_boundary: string;
  supported_agent_registry: {
    source_ref: string;
    series_membership: string;
  };
  supported_agents: string[];
  default_workspace_precondition: {
    action_id: string;
    command: string;
    app_action_id: string;
    required_inputs: string[];
    optional_inputs: string[];
    must_run_before_domain_task_when_no_active_binding: boolean;
    reuse_active_binding_first: boolean;
    initialize_missing_workspace: boolean;
    append_missing_project_in_compatible_series_or_portfolio: boolean;
    default_entry_for_agents: boolean;
  };
  explicit_initialization: {
    command: string;
    app_action_id: string;
    role: string;
    default_entry_for_agents: boolean;
  };
  descriptor_delegates: {
    mcp: {
      tool_name: string;
      execution: string;
      delegates_to_action_id: string;
      descriptor_only: boolean;
      public_runtime: boolean;
    };
    skill: {
      intent: string;
      command_contract_id: string;
      delegates_to_action_id: string;
      descriptor_only: boolean;
      public_runtime: boolean;
    };
    openai: {
      tool_name: string;
      delegates_to_action_id: string;
      descriptor_only: boolean;
      public_runtime: boolean;
    };
    ai_sdk: {
      tool_name: string;
      delegates_to_action_id: string;
      descriptor_only: boolean;
      public_runtime: boolean;
    };
  };
  topology_contract: {
    contract_ref: string;
    profile_id: string;
    topology_model: string[];
    canonical_project_collection_role: string;
    canonical_project_unit_semantics: {
      workspace_unit: string;
      project_collection_role: string;
      project_unit_kind: string;
      stage_artifact_unit: string;
      owner_answer_unit: string;
    };
    project_stage_outputs_root: string;
    stage_output_root_protocol: {
      root: string;
      stage_folder_unit: string;
      stage_outputs_index_file: string;
      current_stage_pointer_file: string;
      stage_lifecycle_model: string[];
      required_stage_folder_shape: string[];
    };
    default_project_collection_path: string;
    workspace_modes: string[];
    series_capable_one_off_skeleton: boolean;
  };
  user_inspection: {
    ordinary_user_default_surface: string;
    project_stage_outputs_pattern: string;
    workspace_index_file: string;
    workspace_config_file: string;
    canonical_generated_root: string;
    canonical_projection_root: string;
    canonical_report_root: string;
    workspace_inspection_file: string;
    workspace_resource_inventory_file: string;
    workspace_report_file: string;
    stage_outputs_index_file: string;
    current_stage_pointer_file: string;
    canonical_user_inspection_roots: string[];
    runtime_state_is_default_user_surface: boolean;
    product_views_are_stage_outputs: boolean;
  };
  registry_policy: {
    writes_opl_workspace_registry: boolean;
    binding_owner: string;
    domain_repo_can_write_opl_registry: boolean;
  };
  runtime_state_boundary: {
    role: string;
    runtime_state_can_be_canonical_project_root: boolean;
    runtime_state_can_close_stage: boolean;
    runtime_state_can_replace_owner_receipt_or_typed_blocker: boolean;
  };
  authority_boundary: {
    opl_can_define_topology_contract: boolean;
    opl_can_project_workspace_refs: boolean;
    opl_can_write_domain_truth: boolean;
    opl_can_write_memory_body: boolean;
    opl_can_mutate_artifact_body: boolean;
    opl_can_create_owner_receipt: boolean;
    opl_can_create_typed_blocker: boolean;
    opl_can_authorize_quality_or_export: boolean;
    runtime_state_counts_as_user_default_surface: boolean;
    conformance_pass_counts_as_domain_ready: boolean;
  };
  workspace_governance_policy: {
    workspace_norm_projection_must_equal_contract_projection: boolean;
    profile_binding_required: boolean;
    profile_version: string;
    profile_fingerprint: string;
    topology_events_required: boolean;
    canonical_generated_projection_root: string;
    root_projection_files_are_compatibility_mirrors: boolean;
    workspace_report_is_default_user_summary: boolean;
    generated_projection_currentness_is_repairable_structural_finding: boolean;
    generated_projection_currentness_blocks_default_execution: boolean;
  };
  workspace_diagnostic_policy: {
    surface_kind: string;
    policy_id: string;
    default_execution_blocks_on: string;
    hard_blocker_rule: string;
    repairable_rule: string;
    advisory_rule: string;
    auto_repair_command_template: string;
    repairable_findings_block_default_execution: boolean;
    advisory_warnings_block_default_execution: boolean;
    hard_blocker_codes: string[];
    repairable_finding_codes: string[];
    advisory_warning_codes: string[];
  };
  domain_workspace_lifecycle_policy: {
    policy_ref: string;
    domain_repo_can_own_generic_workspace_lifecycle: boolean;
    domain_repo_must_declare_locator_not_lifecycle: boolean;
    opl_owns_lifecycle_projection: boolean;
    physical_delete_requires_domain_owner_receipt: boolean;
  };
  conformance_policy: {
    family_conformance_must_report_workspace_norm: boolean;
    workspace_norm_maturity_level: string;
    workspace_norm_pass_is_structural_only: boolean;
    workspace_norm_pass_can_claim_production_ready: boolean;
    workspace_norm_pass_can_claim_domain_ready: boolean;
    workspace_norm_pass_can_claim_artifact_or_quality_ready: boolean;
    l5_evidence_required: string[];
    blocked_reasons: string[];
  };
}
