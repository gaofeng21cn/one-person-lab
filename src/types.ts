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
      mas_studies_boundary: {
        project_collection_path: string;
        legacy_project_collection_path: string;
        alias_role: string;
        canonical_role: string;
        canonical_project_unit_kind: string;
      };
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
    legacy_project_collection_aliases: string[];
    workspace_modes: string[];
    series_capable_one_off_skeleton: boolean;
  };
  domain_topology_profiles: Record<string, {
    profile: string;
    workspace_mode: string;
    project_kind: string;
    project_collection_path: string;
    canonical_project_collection_role: string;
    project_collection_alias_role: string;
    project_collection_display_label: string;
    project_semantic_aliases: string[];
    legacy_project_collection_aliases: string[];
    user_inspection_roots: string[];
    shared_resource_roots: string[];
  }>;
  user_inspection: {
    ordinary_user_default_surface: string;
    project_stage_outputs_pattern: string;
    workspace_index_file: string;
    workspace_config_file: string;
    workspace_inspection_file: string;
    workspace_resource_inventory_file: string;
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
  conformance_policy: {
    family_conformance_must_report_workspace_norm: boolean;
    workspace_norm_pass_is_structural_only: boolean;
    workspace_norm_pass_can_claim_domain_ready: boolean;
    workspace_norm_pass_can_claim_artifact_or_quality_ready: boolean;
    blocked_reasons: string[];
  };
}

export type BrandModuleId =
  | 'charter'
  | 'atlas'
  | 'workspace'
  | 'stagecraft'
  | 'runway'
  | 'vault'
  | 'console'
  | 'foundry-lab'
  | 'connect';

export type BrandModuleMaturityLevel = 'L4_structural_baseline';

export type BrandModuleCliOperation =
  | 'status'
  | 'inspect'
  | 'interfaces'
  | 'validate'
  | 'doctor';

export type AgentInternalBrandModuleCliOperation =
  | 'list'
  | 'inspect'
  | 'interfaces'
  | 'validate'
  | 'doctor';

export interface BrandModuleAuthorityBoundary {
  can_claim_domain_ready: false;
  can_claim_quality_verdict: false;
  can_claim_artifact_authority: false;
  can_claim_production_ready: false;
  can_write_domain_truth: false;
  can_write_memory_body: false;
  can_mutate_artifact_body: false;
  can_sign_owner_receipt: false;
  can_create_typed_blocker: false;
  can_replace_domain_owner: false;
  can_replace_ai_executor_planning: false;
}

export interface BrandModuleRegistryEntry {
  module_id: BrandModuleId;
  brand_name: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  module_doc_ref: string;
  contract_refs: string[];
  cli_surfaces: string[];
  app_surfaces: string[];
  descriptor_surfaces: string[];
  validation_surfaces: string[];
  status_doc_refs: string[];
  l4_gates: string[];
  maturity_level: BrandModuleMaturityLevel;
  authority_boundary: BrandModuleAuthorityBoundary;
  forbidden_claims: string[];
}

export interface BrandModuleRegistryContract {
  version: string;
  scope: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  baseline_module_id: BrandModuleId;
  maturity_model: Array<{
    level: BrandModuleMaturityLevel;
    definition: string;
    required_gates: string[];
  }>;
  external_reference_principles: string[];
  modules: BrandModuleRegistryEntry[];
}

export interface BrandCliPlatformFrontdoor {
  module_id: BrandModuleId;
  command: string;
  operations: BrandModuleCliOperation[];
}

export interface AgentInternalBrandModuleSpineEntry {
  agent_module_id: string;
  platform_analogue_module_id: BrandModuleId;
  purpose: string;
  command_pattern: string;
}

export interface BrandCliLegacyCommandOwnership {
  command_prefix: string;
  primary_module_id: BrandModuleId;
  secondary_module_ids: BrandModuleId[];
  status: string;
  migration_target: string;
  command_refs: string[];
  rationale: string;
}

export interface BrandCliGovernanceContract {
  version: string;
  scope: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  platform_frontdoors: BrandCliPlatformFrontdoor[];
  agent_internal_modules: {
    canonical_frontdoor: string;
    required_operations: AgentInternalBrandModuleCliOperation[];
    module_spine: AgentInternalBrandModuleSpineEntry[];
    authority_boundary: BrandModuleAuthorityBoundary;
  };
  legacy_command_ownership: BrandCliLegacyCommandOwnership[];
  drift_guards: string[];
}

export interface BrandModuleNativeCliFamily {
  status: string;
  inspect: string;
  interfaces: string;
  validate: string;
  doctor: string;
  additional_commands: string[];
}

export interface BrandModuleSurfaceAppDescriptor {
  action_id: string;
  command: string;
  mutation: boolean;
  descriptor_only: boolean;
}

export interface BrandModuleSurfaceContractEntry {
  module_id: BrandModuleId;
  brand_name: string;
  command_prefix: string;
  surface_kind_prefix: string;
  state: string;
  module_doc_ref: string;
  object_model: {
    primary_objects: string[];
    canonical_contract_refs: string[];
    read_model_refs: string[];
  };
  native_cli_family: BrandModuleNativeCliFamily;
  app_read_model: {
    descriptors: BrandModuleSurfaceAppDescriptor[];
    projection_refs: string[];
  };
  descriptor_surface: {
    delegate_ids: string[];
    descriptor_refs: string[];
  };
  validation: {
    commands: string[];
    checks: string[];
    required_refs: string[];
  };
  doctor: {
    checks: string[];
    fail_closed_on: string[];
  };
  status: {
    completion_level: BrandModuleMaturityLevel;
    evidence_refs: string[];
    not_claims: string[];
  };
  authority_boundary: BrandModuleAuthorityBoundary;
  forbidden_claims: string[];
  notes: string;
}

export interface BrandModuleSurfacesContract {
  version: string;
  scope: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  baseline_module_id: BrandModuleId;
  required_native_subcommands: string[];
  required_gates: string[];
  modules: BrandModuleSurfaceContractEntry[];
}

export interface WorkstreamsRegistry {
  version: string;
  workstreams: WorkstreamContract[];
}

export interface DomainsRegistry {
  version: string;
  domains: DomainContract[];
}

export type ContractsRootSource = 'cwd' | 'env' | 'cli_flag' | 'api' | 'cli_entry';

export interface FrameworkContractsLoadOptions {
  searchFrom?: string;
  contractsDir?: string;
  source?: ContractsRootSource;
}

export interface FrameworkContracts {
  contractsDir: string;
  contractsRootSource: ContractsRootSource;
  workstreams: WorkstreamsRegistry;
  domains: DomainsRegistry;
  stageSelectionVocabulary: StageSelectionVocabularyContract;
  taskTopology: TaskTopologyContract;
  publicSurfaceIndex: PublicSurfaceIndexContract;
  agentWorkspaceNorm: AgentWorkspaceNormContract;
  brandModuleRegistry: BrandModuleRegistryContract;
  brandCliGovernance: BrandCliGovernanceContract;
  brandModuleSurfaces: BrandModuleSurfacesContract;
}

export interface ContractValidationEntry {
  contract_id:
    | 'workstreams'
    | 'domains'
    | 'stage_selection_vocabulary'
    | 'task_topology'
    | 'public_surface_index'
    | 'agent_workspace_norm'
    | 'brand_module_registry'
    | 'brand_cli_governance'
    | 'brand_module_surfaces';
  file: string;
  schema_version: string;
  status: 'valid';
}

export interface ContractValidationSummary {
  status: 'valid';
  contracts_dir: string;
  contracts_root_source: ContractsRootSource;
  validated_contracts: ContractValidationEntry[];
}

export interface DomainAgentSelectionInput {
  intent: string;
  target: string;
  goal: string;
  preferredFamily?: string;
  requestKind?: string;
}

export type ResolutionResult =
  | {
      status: 'selected_domain_agent_entry';
      request_kind: string;
      workstream_id: string;
      domain_id: string;
      entry_surface: 'domain_agent_entry';
      recommended_family: string | null;
      confidence: 'medium' | 'high';
      reason: string;
      selection_evidence: string[];
    }
  | {
      status: 'domain_boundary';
      request_kind: string;
      domain_id: string;
      workstream_id: null;
      recommended_family: string | null;
      reason: string;
      selection_evidence: string[];
    }
  | {
      status: 'unknown_domain';
      request_kind: string;
      candidate_workstream_id: string;
      reason: string;
      selection_evidence: string[];
    }
  | {
      status: 'ambiguous_task';
      request_kind: string;
      candidate_workstreams: string[];
      candidate_domains: string[];
      reason: string;
      selection_evidence: string[];
      required_clarification: string[];
    };

export interface BoundaryExplanation {
  request_summary: string;
  boundary_status: ResolutionResult['status'];
  boundary_evidence: string[];
  resolved_domain: string | null;
  resolved_workstream_id: string | null;
  candidate_workstream_id?: string;
  candidate_workstreams?: string[];
  candidate_domains?: string[];
  reason: string;
  required_clarification?: string[];
  rejected_domains: Array<{
    domain_id: string;
    reason: string;
  }>;
}

export type ResolveRequestInput = DomainAgentSelectionInput;
