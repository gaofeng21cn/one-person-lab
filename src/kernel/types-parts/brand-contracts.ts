export type BrandModuleId =
  | 'charter'
  | 'atlas'
  | 'workspace'
  | 'pack'
  | 'stagecraft'
  | 'runway'
  | 'ledger'
  | 'console'
  | 'foundry'
  | 'connect';

export type BrandModuleMaturityLevel = 'L4_structural_baseline';

export type BrandModuleL5TargetLevel = 'L5_production_operating_maturity';

export type BrandModuleL5EvidenceClassId =
  | 'live_user_path'
  | 'ordinary_app_experience'
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

export interface BrandModuleL5OwnerRouteWorkOrderPolicy {
  surface_kind: 'opl_brand_module_l5_owner_route_work_order_policy';
  work_orders_are_refs_only: true;
  work_orders_close_l5: false;
  work_orders_can_create_owner_receipt: false;
  work_orders_can_create_typed_blocker: false;
  work_orders_can_claim_production_ready: false;
  accepted_route_ref_shapes: string[];
  non_closing_inputs: string[];
}

export interface BrandModuleL5EvidenceClass {
  class_id: BrandModuleL5EvidenceClassId;
  definition: string;
  accepted_ref_shapes: string[];
}

export interface BrandModuleL5EvidenceRequirement {
  class_id: BrandModuleL5EvidenceClassId;
  owner: string;
  owner_route_ref: string;
  owner_repo_ref: string;
  current_state: BrandModuleL5EvidenceState;
  evidence_refs?: string[];
  owner_acceptance_refs?: string[];
  blocker_refs?: string[];
  supporting_domain_owner_chain_refs?: string[];
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
  owner_route_work_order_policy: BrandModuleL5OwnerRouteWorkOrderPolicy;
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

export type StandardBrandModuleCliOperation =
  | 'status'
  | 'inspect'
  | 'interfaces'
  | 'validate'
  | 'doctor';

export type FoundryControlOperation =
  | 'status'
  | 'approve'
  | 'reject'
  | 'cancel'
  | 'versions'
  | 'rollback';

export type BrandModuleCliOperation = StandardBrandModuleCliOperation | FoundryControlOperation;

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

export interface SourceModuleMapEntry {
  module_id: BrandModuleId;
  brand_name: string;
  physical_root: string;
  public_entrypoint: string;
  primary_source_globs: string[];
  shared_source_globs: string[];
  owner_note: string;
}

export interface SourceModuleMapSharedKernelEntry {
  path: string;
  primary_module_id: BrandModuleId;
  consumer_module_ids: BrandModuleId[];
  role: string;
}

export interface SourceModuleMapContract {
  version: string;
  scope: string;
  owner: string;
  purpose: string;
  state: string;
  machine_boundary: string;
  source_root: string;
  physical_module_root: string;
  alignment_rules: string[];
  modules: SourceModuleMapEntry[];
  shared_kernel: SourceModuleMapSharedKernelEntry[];
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

export interface StandardBrandModuleNativeCliFamily {
  status: string;
  inspect: string;
  interfaces: string;
  validate: string;
  doctor: string;
  additional_commands: string[];
}

export interface FoundryControlCliFamily {
  control_commands: Record<FoundryControlOperation, string>;
  additional_commands: string[];
}

export type BrandModuleNativeCliFamily = StandardBrandModuleNativeCliFamily | FoundryControlCliFamily;

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
  foundry_control_operations: FoundryControlOperation[];
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

export interface BrandSystemOrdinaryAppExperienceAxis {
  axis_id: 'running_fluency' | 'output_quality' | 'brand_feel';
  user_visible_goal: string;
  app_projection_ref: string;
  l5_evidence_class_ref: string;
  must_not_claim: string[];
}

export interface BrandSystemOrdinaryAppExperience {
  surface_kind: 'opl_brand_ordinary_app_experience_profile';
  default_read_surface_ref: string;
  experience_axes: BrandSystemOrdinaryAppExperienceAxis[];
  l5_evidence_refs_only: true;
  authority_boundary: {
    can_claim_l5: false;
    can_claim_app_release_ready: false;
    can_authorize_quality_verdict: false;
    can_create_owner_receipt: false;
    can_create_typed_blocker: false;
  };
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
  ordinary_app_experience: BrandSystemOrdinaryAppExperience;
  receipt_blocker_language: BrandSystemReceiptBlockerLanguage;
  authority_boundary: BrandModuleAuthorityBoundary;
  forbidden_claims: string[];
}
