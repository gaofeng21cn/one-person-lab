import type { BrandModuleId } from './brand-contracts.ts';

export interface TargetOperatingArchitectureResourceKind {
  kind: string;
  owner: string;
  default_lane: string;
  truth_boundary: string;
}

export interface TargetOperatingArchitecturePlane {
  plane_id: string;
  owner_modules: BrandModuleId[];
  default_lane: string;
  inputs: string[];
  outputs: string[];
  forbidden_claims: string[];
  ordinary_path_eligible: boolean;
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
  codex_stage_route_owner: {
    semantic_owner: 'codex_cli';
    single_semantic_control_plane: true;
    progression_policy: string;
    route_capabilities: string[];
    passive_framework_projections: string[];
    forbidden_framework_route_decisions: string[];
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
    ordinary_progress_spine?: {
      default_planning_root: string;
      default_next_action_derives_from: string;
      lightweight_receipt: string;
      lightweight_receipt_tier: string;
      audit_sidecar_role: string;
    };
    artifact_tiers?: string[];
    progress_delta_receipt_cannot_authorize?: string[];
    audit_sidecar_must_not_generate_default_next_action?: boolean;
    surface_plane_binding_required: true;
    default_surface_requires_plane_ref: true;
    ordinary_surface_allowed_planes: string[];
    non_authority_surface_forbidden_outputs: string[];
    allowed_lanes: string[];
    small_detail_default_lanes: string[];
    hard_blocker_upgrade_conditions: string[];
    ordinary_path_must_not_be_overridden_by: string[];
    accepted_owner_answer_shapes: string[];
  };
  multi_plane_operating_system: {
    plane_model_id: string;
    default_ordinary_route: string;
    planes: TargetOperatingArchitecturePlane[];
    cross_plane_authority_boundary: Record<string, false>;
  };
  reconciler_model: {
    loop_granularity: string;
    required_loops: string[];
    loop_authority_boundary: Record<string, false>;
    substrate_policy: {
      temporal_role: string;
      worker_supervisor_role: string;
      progress_reconciler_role: string;
      false_authority_boundary: string;
    };
  };
  catalog_and_telemetry: {
    atlas_catalogs: string[];
    ledger_ref_streams: string[];
    ledger_policy: string;
    telemetry_body_policy: string;
  };
  app_console_policy: {
    default_screen_fields: string[];
    drilldown_only_fields: string[];
    gui_truth_owner: string;
    framework_role: string;
  };
  experience_operating_model: {
    model_id: string;
    purpose: string;
    default_user_path: {
      planning_root: string;
      first_screen_policy: string;
      primary_read_surface: string;
      drilldown_policy: string;
    };
    target_axes: Array<{
      axis_id: 'running_smoothness' | 'output_quality' | 'brand_feel';
      owner_modules: BrandModuleId[];
      success_policy: string;
      machine_checks: string[];
      forbidden_regressions: string[];
    }>;
    authority_boundary: Record<string, false>;
    forbidden_claims: string[];
  };
  agent_lab_improvement_plane: {
    role: string;
    may_produce: string[];
    must_not_produce: string[];
  };
  one_shot_plan_landing_model: {
    model_id: string;
    purpose: string;
    source_plan_ref: string;
    default_completion_semantics: string;
    implementation_slices: Array<{
      plan_id: string;
      title: string;
      status: 'opl_landed' | 'opl_landed_owner_gated' | 'external_owner_gated';
      opl_landed_surfaces: string[];
      validation_commands: string[];
      remaining_owner_gate: string;
      false_completion_claims: string[];
    }>;
    summary: {
      total_plan_count: number;
      opl_landed_count: number;
      opl_landed_owner_gated_count: number;
      external_owner_gated_count: number;
      all_opl_controlled_surfaces_landed: boolean;
      external_owner_evidence_still_required: boolean;
      ready_claim_authorized: false;
    };
    authority_boundary: Record<string, false>;
  };
  foundry_agent_os_standard: {
    pattern_id: string;
    source_pattern_ref: string;
    standard_agent_registry_ref: string;
    target_shape: string;
    new_agent_baseline_handoff_policy: {
      surface_kind: string;
      policy_id: string;
      owner: string;
      oma_owner: string;
      required_gates: string[];
      scaffold_or_generated_interface_can_claim_complete: false;
      conformance_or_suite_pass_can_claim_complete: false;
      exactly_one_terminal_outcome_required: true;
      accepted_terminal_outcomes: string[];
      authority_boundary: Record<string, false>;
    };
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
      resolver_abi_ref: string;
      selector_helper_ref: string;
      fail_open_policy: string;
      optional_ref_missing_default: string;
      route_required_ref_missing: string;
      must_not_create: string[];
    };
    cross_agent_conformance_required_claims: string[];
    os_readback_contract: {
      surface_kind: string;
      completion_audit_contract_ref: string;
      claim_scope: string;
      requires_lane_to_plan_mapping: true;
      requires_main_session_fresh_verification: true;
      docs_refs_tests_commit_only_can_score_100: false;
      readback_contract_landed_can_claim_complete: false;
      accepted_100_percent_evidence_kinds: string[];
      insufficient_100_percent_evidence_kinds: string[];
    };
    implementation_lane_refs: string[];
    authority_boundary: Record<string, false>;
    forbidden_claims: string[];
  };
  authority_boundary: Record<string, false>;
  forbidden_claims: string[];
}
