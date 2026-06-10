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

export type BrandModuleId =
  | 'charter'
  | 'atlas'
  | 'workspace'
  | 'pack'
  | 'stagecraft'
  | 'runway'
  | 'vault'
  | 'console'
  | 'foundry-lab'
  | 'connect';

export type BrandModuleMaturityLevel = 'L4_structural_baseline';

export type BrandModuleL5TargetLevel = 'L5_production_operating_maturity';

export type BrandModuleL5EvidenceClassId =
  | 'live_user_path'
  | 'cross_agent_scaleout'
  | 'long_soak_recovery'
  | 'release_install_evidence'
  | 'operator_repair_loop'
  | 'owner_acceptance'
  | 'no_second_truth_regression'
  | 'pack_compile_parity'
  | 'current_owner_delta_default_read'
  | 'capability_fail_open_boundary'
  | 'domain_authority_false_boundary'
  | 'cross_agent_foundry_agent_os_adoption';

export type BrandModuleL5EvidenceState = 'open' | 'satisfied' | 'blocked';

export interface BrandModuleL5ClaimPolicy {
  all_required_evidence_must_be_satisfied: true;
  docs_foldback_counts_as_l5: false;
  contract_validation_counts_as_l5: false;
  provider_completion_counts_as_l5: false;
  app_projection_counts_as_l5: false;
  conformance_pass_counts_as_l5: false;
}

export interface BrandModuleL5EvidenceClass {
  class_id: BrandModuleL5EvidenceClassId;
  definition: string;
  accepted_ref_shapes: string[];
}

export interface BrandModuleL5EvidenceRequirement {
  class_id: BrandModuleL5EvidenceClassId;
  owner: string;
  current_state: BrandModuleL5EvidenceState;
  evidence_refs?: string[];
  blocker_refs?: string[];
}

export interface BrandModuleL5OperatingEvidenceEntry {
  module_id: BrandModuleId;
  brand_name: string;
  current_level: BrandModuleMaturityLevel;
  l5_completion_status: 'evidence_required' | 'complete' | 'blocked';
  l5_can_be_claimed: boolean;
  immediate_enabling_surfaces: string[];
  evidence_requirements: BrandModuleL5EvidenceRequirement[];
  not_claims: string[];
}

export interface BrandModuleL5OperatingEvidenceContract {
  version: string;
  scope: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  baseline_level: BrandModuleMaturityLevel;
  target_level: BrandModuleL5TargetLevel;
  l5_claim_policy: BrandModuleL5ClaimPolicy;
  evidence_ledger_surfaces: {
    record_command: string;
    verify_command: string;
    list_command: string;
    ledger_file_name: string;
    refs_only: true;
    can_claim_l5_complete: false;
    can_create_owner_receipt: false;
    can_create_typed_blocker: false;
  };
  evidence_classes: BrandModuleL5EvidenceClass[];
  modules: BrandModuleL5OperatingEvidenceEntry[];
}

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

export interface BrandCliPlatformCommandSurface {
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
  platform_command_surfaces: BrandCliPlatformCommandSurface[];
  agent_internal_modules: {
    canonical_command_surface: string;
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

export interface BrandSystemProductCognitionLayer {
  layer_id: 'opl_framework' | 'one_person_lab_app' | 'foundry_agents';
  product_name: string;
  user_understanding: string;
  maintainer_understanding: string;
  owner: string;
  authority_boundary: string[];
}

export interface BrandSystemModuleRoleRef {
  module_id: BrandModuleId;
  product_grammar_role: string;
  registry_ref: string;
  surface_contract_ref: string;
}

export interface BrandSystemAgentNaming {
  family_label: string;
  public_name_policy: string;
  machine_id_policy: string;
  required_agent_ids: string[];
  foundry_series_contract_ref: string;
}

export interface BrandSystemAppStatusLanguage {
  default_terms: string[];
  diagnostic_only_terms: string[];
  forbidden_default_terms: string[];
  default_state_ref: string;
  full_detail_policy_ref: string;
}

export interface BrandSystemVisualPatternGroup {
  group_id: 'design_tokens' | 'icons' | 'cards' | 'status_patterns';
  purpose: string;
  required_patterns: string[];
}

export interface BrandSystemReceiptBlockerLanguage {
  success_shape: string;
  blocked_shape: string;
  route_back_shape: string;
  owner_answer_schema_ref: string;
  owner_receipt_schema_ref: string;
  typed_blocker_schema_ref: string;
  wording_rules: string[];
}

export interface BrandSystemProfileContract {
  version: string;
  scope: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  source_refs: string[];
  product_cognition_layers: BrandSystemProductCognitionLayer[];
  brand_module_product_grammar: {
    module_ids: BrandModuleId[];
    module_role_refs: BrandSystemModuleRoleRef[];
  };
  agent_naming: BrandSystemAgentNaming;
  app_status_language: BrandSystemAppStatusLanguage;
  visual_system: {
    pattern_groups: BrandSystemVisualPatternGroup[];
  };
  receipt_blocker_language: BrandSystemReceiptBlockerLanguage;
  authority_boundary: BrandModuleAuthorityBoundary;
  forbidden_claims: string[];
}

export interface TargetOperatingArchitectureResourceKind {
  kind: string;
  owner: string;
  default_lane: string;
  truth_boundary: string;
}

export interface TargetOperatingArchitectureContract {
  contract_kind: string;
  schema_version: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  source_refs: string[];
  design_principles: string[];
  resource_model: {
    resource_shape: {
      required_fields: string[];
      spec_status_split_required: true;
      status_can_define_desired_state: false;
      conditions_are_status_not_truth: true;
    };
    resource_kinds: TargetOperatingArchitectureResourceKind[];
  };
  stage_transition_authority: {
    authority_owner: string;
    single_writer: true;
    event_log_policy: string;
    derived_state: string[];
    accepted_inputs: string[];
    forbidden_direct_writers: string[];
  };
  domain_pack_authority_abi: {
    default_agent_shape: string;
    domain_pack_must_declare: string[];
    opl_generated_or_hosted_surfaces: string[];
    authority_functions: string[];
    private_platform_residue_default_disposition: string;
  };
  surface_budget_compiler_policy: {
    ordinary_path_root: string;
    allowed_lanes: string[];
    small_detail_default_lanes: string[];
    hard_blocker_upgrade_conditions: string[];
    ordinary_path_must_not_be_overridden_by: string[];
    accepted_owner_answer_shapes: string[];
  };
  reconciler_model: {
    loop_granularity: string;
    required_loops: string[];
    loop_authority_boundary: Record<string, false>;
    substrate_policy?: {
      temporal_role: string;
      worker_supervisor_role: string;
      progress_reconciler_role: string;
      false_authority_boundary: string;
    };
  };
  catalog_and_telemetry: {
    atlas_catalogs: string[];
    vault_ref_streams: string[];
    vault_policy: string;
    telemetry_body_policy: string;
  };
  app_console_policy: {
    default_screen_fields: string[];
    drilldown_only_fields: string[];
    gui_truth_owner: string;
    framework_role: string;
  };
  agent_lab_improvement_plane: {
    role: string;
    may_produce: string[];
    must_not_produce: string[];
  };
  foundry_agent_os_standard: {
    pattern_id: string;
    source_pattern_ref: string;
    target_shape: string;
    applies_to_domain_agents: string[];
    domain_pack_examples: Record<string, string>;
    domain_authority_kernel_examples: Record<string, string[]>;
    opl_module_mapping: Array<{
      target_capability: string;
      primary_module: BrandModuleId;
      supporting_modules: BrandModuleId[];
      ordinary_lane: string;
      authority_boundary: string;
    }>;
    capability_registry_boundary: {
      owner_modules: BrandModuleId[];
      default_behavior: string;
      fail_open_policy: string;
      must_not_create: string[];
    };
    cross_agent_conformance_required_claims: string[];
    implementation_lane_refs: string[];
    authority_boundary: Record<string, false>;
    forbidden_claims: string[];
  };
  authority_boundary: Record<string, false>;
  forbidden_claims: string[];
}

export interface PackOsContract {
  schema_version: number;
  contract_id: 'opl-pack-os-contract.v1';
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  source_module: string;
  cli_surfaces: {
    inspect: string;
    install: string;
    registry: string;
    cache: string;
    distribute: string;
    lock: string;
    validate: string;
    mas_display_smoke: string;
  };
  descriptor_contract: {
    surface_kind: string;
    required_fields: string[];
    allowed_pack_kinds: string[];
    resource_roles: string[];
    relationship_to_domain_packs: string;
  };
  registry_cache_distribution_contract: {
    registry_surface_kind: string;
    install_receipt_surface_kind: string;
    cache_manifest_surface_kind: string;
    distribution_manifest_surface_kind: string;
    distribution_bundle_surface_kind: string;
    cache_layout: string;
    registry_rule: string;
    distribution_rule: string;
  };
  lock_contract: {
    surface_kind: string;
    output_role: string;
    required_fields: string[];
    content_hash_algorithm: string;
    lock_projection_rule: string;
  };
  lifecycle_model: {
    allowed_states: string[];
    hard_boundaries: string[];
  };
  authority_boundary: {
    opl_can_resolve_pack_descriptor: true;
    opl_can_write_pack_lock: true;
    opl_can_cache_pack_assets: true;
    opl_can_project_artifact_locator_refs: true;
    opl_can_transport_review_receipt_refs: true;
    opl_can_write_domain_truth: false;
    opl_can_mutate_artifact_body: false;
    opl_can_sign_domain_owner_receipt: false;
    opl_can_authorize_quality_verdict: false;
    opl_can_authorize_publication_readiness: false;
    opl_can_authorize_grant_readiness: false;
    opl_can_authorize_visual_export_readiness: false;
    opl_can_authorize_app_release_readiness: false;
    provider_completion_is_pack_quality_ready: false;
  };
  domain_handoff: {
    mas_display_pack_v2: {
      source_contract_ref: string;
      transport_role: string;
      domain_authority_owner: string;
      consumer_smoke_surface: string;
      audit_surface: string;
      forbidden_claim: string;
    };
    future_family_packs: string[];
  };
  forbidden_claims: string[];
  verification: {
    focused_tests: string[];
    required_commands_when_changed: string[];
  };
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
  brandModuleL5OperatingEvidence: BrandModuleL5OperatingEvidenceContract;
  brandSystemProfile: BrandSystemProfileContract;
  targetOperatingArchitecture: TargetOperatingArchitectureContract;
  packOs: PackOsContract;
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
    | 'brand_module_surfaces'
    | 'brand_module_l5_operating_evidence'
    | 'brand_system_profile'
    | 'target_operating_architecture'
    | 'pack_os';
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
