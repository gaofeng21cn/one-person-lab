import type {
  FamilyDomainEntryContractSurface,
  FamilySharedHandoffSurface,
  GatewayInteractionContractSurface,
} from '../family-entry-contracts.ts';

type JsonRecord = Record<string, unknown>;

export interface NormalizedSurfaceRef {
  ref_kind: string;
  ref: string;
  role?: string;
  label?: string;
}

export interface NormalizedTaskSurfaceDescriptor {
  surface_kind: string;
  summary: string;
  command: string | null;
  ref: NormalizedSurfaceRef | null;
  step_id: string | null;
  locator_fields: string[];
}

export interface NormalizedCheckpointSummary {
  surface_kind: 'checkpoint_summary';
  status: string;
  summary: string;
  checkpoint_id: string | null;
  recorded_at: string | null;
  lineage_ref: NormalizedSurfaceRef | null;
  verification_ref: NormalizedSurfaceRef | null;
}

export interface NormalizedRuntimeInventory {
  surface_kind: 'runtime_inventory';
  summary: string;
  runtime_owner: string;
  domain_owner: string;
  executor_owner: string;
  substrate: string;
  availability: string;
  health_status: string;
  status_surface: NormalizedSurfaceRef | null;
  attention_surface: NormalizedSurfaceRef | null;
  recovery_surface: NormalizedSurfaceRef | null;
  workspace_binding: JsonRecord | null;
  domain_projection: JsonRecord | null;
}

export interface NormalizedTaskLifecycle {
  surface_kind: 'task_lifecycle';
  task_kind: string;
  task_id: string;
  status: string;
  summary: string;
  session_id: string | null;
  run_id: string | null;
  progress_surface: NormalizedTaskSurfaceDescriptor | null;
  resume_surface: NormalizedTaskSurfaceDescriptor | null;
  checkpoint_summary: NormalizedCheckpointSummary | null;
  human_gate_ids: string[];
  domain_projection: JsonRecord | null;
}

export interface NormalizedRuntimeControl {
  surface_kind: 'runtime_control';
  summary: string;
  domain_agent_id: string;
  runtime_owner: string;
  domain_owner: string;
  executor_owner: string;
  status: string;
  session_id: string | null;
  run_id: string | null;
  restore_point: string | null;
  control_gate_ids: string[];
  direct_entry_command: string | null;
  federated_entry_command: string | null;
  control_surfaces: {
    resume: NormalizedTaskSurfaceDescriptor | null;
    interrupt: NormalizedTaskSurfaceDescriptor | null;
    approval: NormalizedTaskSurfaceDescriptor | null;
    progress: NormalizedTaskSurfaceDescriptor | null;
    artifact_pickup: NormalizedTaskSurfaceDescriptor | null;
  };
  domain_projection: JsonRecord | null;
}

export interface NormalizedSessionContinuity {
  surface_kind: 'session_continuity';
  summary: string;
  domain_agent_id: string;
  runtime_owner: string;
  domain_owner: string;
  executor_owner: string;
  status: string;
  session_id: string | null;
  run_id: string | null;
  entry_surface: NormalizedTaskSurfaceDescriptor | null;
  progress_surface: NormalizedTaskSurfaceDescriptor | null;
  artifact_surface: NormalizedTaskSurfaceDescriptor | null;
  restore_surface: NormalizedTaskSurfaceDescriptor | null;
  checkpoint_summary: NormalizedCheckpointSummary | null;
  human_gate_ids: string[];
  domain_projection: JsonRecord | null;
}

export interface NormalizedProgressProjection {
  surface_kind: 'progress_projection';
  headline: string;
  latest_update: string;
  next_step: string;
  status_summary: string;
  session_id: string | null;
  current_status: string | null;
  runtime_status: string | null;
  progress_surface: NormalizedTaskSurfaceDescriptor | null;
  artifact_surface: NormalizedTaskSurfaceDescriptor | null;
  inspect_paths: string[];
  attention_items: string[];
  human_gate_ids: string[];
  domain_projection: JsonRecord | null;
}

export interface NormalizedArtifactFileDescriptor {
  file_id: string;
  label: string;
  kind: 'deliverable' | 'supporting';
  path: string;
  summary: string;
  ref: NormalizedSurfaceRef | null;
}

export interface NormalizedArtifactInventory {
  surface_kind: 'artifact_inventory';
  session_id: string | null;
  workspace_path: string | null;
  summary: {
    deliverable_files_count: number;
    supporting_files_count: number;
    total_files_count: number;
  };
  deliverable_files: NormalizedArtifactFileDescriptor[];
  supporting_files: NormalizedArtifactFileDescriptor[];
  progress_headline: string | null;
  artifact_surface: NormalizedTaskSurfaceDescriptor | null;
  inspect_paths: string[];
  domain_projection: JsonRecord | null;
}

export interface NormalizedSkillDescriptor {
  surface_kind: 'skill_descriptor';
  skill_id: string;
  title: string;
  owner: string;
  distribution_mode: string;
  target_surface_kind: string;
  description: string;
  command: string | null;
  readiness: string;
  tags: string[];
  domain_projection: JsonRecord | null;
}

export interface NormalizedSkillCatalog {
  surface_kind: 'skill_catalog';
  summary: string;
  skills: NormalizedSkillDescriptor[];
  supported_commands: string[];
  command_contracts: JsonRecord[];
}

export interface NormalizedAutomationDescriptor {
  surface_kind: 'automation_descriptor';
  automation_id: string;
  title: string;
  owner: string;
  trigger_kind: string;
  target_surface_kind: string;
  summary: string;
  readiness_status: string;
  gate_policy: string;
  output_expectation: string[];
  target_command: string | null;
  domain_projection: JsonRecord | null;
}

export interface NormalizedAutomationCatalog {
  surface_kind: 'automation';
  summary: string;
  automations: NormalizedAutomationDescriptor[];
  readiness_summary: string | null;
}

export type DomainManifestStatus =
  | 'not_bound'
  | 'manifest_not_configured'
  | 'command_failed'
  | 'invalid_json'
  | 'invalid_manifest'
  | 'resolved';

export interface NormalizedDomainManifest {
  surface_kind: string;
  manifest_version: number | string | null;
  manifest_kind: string;
  target_domain_id: string;
  formal_entry: {
    default: string;
    supported_protocols: string[];
    internal_surface: string | null;
  };
  workspace_locator: JsonRecord;
  runtime: JsonRecord | null;
  managed_runtime_contract: {
    shared_contract_ref: string;
    runtime_owner: string;
    domain_owner: string;
    executor_owner: string;
    supervision_status_surface: {
      surface_kind: string;
      owner: string;
    };
    attention_queue_surface: {
      surface_kind: string;
      owner: string;
    };
    recovery_contract_surface: {
      surface_kind: string;
      owner: string;
    };
    fail_closed_rules: string[];
  } | null;
  repo_mainline: JsonRecord | null;
  product_entry_status: {
    summary: string | null;
    next_focus: string[];
    remaining_gaps_count: number | null;
  } | null;
  frontdoor_surface: {
    shell_key: string;
    command: string | null;
    surface_kind: string | null;
    summary: string | null;
    continuation_shell_key: string | null;
    continuation_command: string | null;
  } | null;
  operator_loop_surface: {
    shell_key: string;
    command: string | null;
    surface_kind: string | null;
    summary: string | null;
    continuation_shell_key: string | null;
    continuation_command: string | null;
  } | null;
  operator_loop_actions: Record<string, JsonRecord>;
  recommended_shell: string | null;
  recommended_command: string | null;
  schema_ref: string | null;
  domain_entry_contract: FamilyDomainEntryContractSurface | null;
  gateway_interaction_contract: GatewayInteractionContractSurface | null;
  product_entry_shell: Record<string, JsonRecord>;
  shared_handoff: FamilySharedHandoffSurface;
  product_entry_overview: {
    surface_kind: string;
    summary: string | null;
    frontdoor_command: string | null;
    recommended_command: string | null;
    operator_loop_command: string | null;
    progress_surface: {
      surface_kind: string | null;
      command: string | null;
      step_id: string | null;
    } | null;
    resume_surface: {
      surface_kind: string | null;
      command: string | null;
      session_locator_field: string | null;
      checkpoint_locator_field: string | null;
    } | null;
    recommended_step_id: string | null;
    next_focus: string[];
    remaining_gaps_count: number | null;
    human_gate_ids: string[];
  } | null;
  product_entry_preflight: {
    surface_kind: string;
    summary: string | null;
    ready_to_try_now: boolean | null;
    recommended_check_command: string | null;
    recommended_start_command: string | null;
    blocking_check_ids: string[];
    checks: Array<{
      check_id: string;
      title: string | null;
      status: string | null;
      blocking: boolean | null;
      summary: string | null;
      command: string | null;
    }>;
  } | null;
  product_entry_readiness: {
    surface_kind: string;
    verdict: string | null;
    usable_now: boolean | null;
    good_to_use_now: boolean | null;
    fully_automatic: boolean | null;
    user_experience_level: string | null;
    summary: string | null;
    recommended_start_surface: string | null;
    recommended_start_command: string | null;
    recommended_loop_surface: string | null;
    recommended_loop_command: string | null;
    workflow_coverage: Array<{
      step_id: string;
      manual_flow_label: string | null;
      coverage_status: string | null;
      current_surface: string | null;
      remaining_gap: string | null;
    }>;
    blocking_gaps: string[];
  } | null;
  grant_authoring_readiness: {
    surface_kind: string;
    verdict: string | null;
    usable_now: boolean | null;
    good_to_use_now: boolean | null;
    fully_automatic: boolean | null;
    user_experience_level: string | null;
    summary: string | null;
    recommended_start_surface: string | null;
    recommended_start_command: string | null;
    recommended_loop_surface: string | null;
    recommended_loop_command: string | null;
    workflow_coverage: Array<{
      step_id: string;
      manual_flow_label: string | null;
      coverage_status: string | null;
      current_surface: string | null;
      remaining_gap: string | null;
    }>;
    blocking_gaps: string[];
  } | null;
  product_entry_guardrails: {
    surface_kind: string;
    summary: string | null;
    guardrail_classes: Array<{
      guardrail_id: string;
      trigger: string | null;
      symptom: string | null;
      recommended_command: string | null;
    }>;
    recovery_loop: Array<{
      step_id: string;
      title: string | null;
      command: string | null;
      surface_kind: string | null;
    }>;
  } | null;
  phase3_clearance_lane: {
    surface_kind: string;
    summary: string | null;
    recommended_step_id: string | null;
    recommended_command: string | null;
    clearance_targets: Array<{
      target_id: string;
      title: string | null;
      commands: string[];
    }>;
    clearance_loop: Array<{
      step_id: string;
      title: string | null;
      command: string | null;
      surface_kind: string | null;
    }>;
    proof_surfaces: Array<{
      surface_kind: string | null;
      command: string | null;
      ref: string | null;
    }>;
    recommended_phase_command: string | null;
  } | null;
  phase4_backend_deconstruction: {
    surface_kind: string;
    summary: string | null;
    substrate_targets: Array<{
      capability_id: string;
      owner: string | null;
      summary: string | null;
    }>;
    backend_retained_now: string[];
    current_backend_chain: string[];
    optional_executor_proofs: JsonRecord[];
    promotion_rules: string[];
    deconstruction_map_doc: string | null;
    recommended_phase_command: string | null;
  } | null;
  phase5_platform_target: {
    surface_kind: string;
    summary: string | null;
    sequence_scope: string | null;
    current_step_id: string | null;
    current_readiness_summary: string | null;
    north_star_topology: JsonRecord | null;
    target_internal_modules: string[];
    landing_sequence: Array<{
      step_id: string;
      title: string | null;
      phase_id: string | null;
      status: string | null;
      summary: string | null;
    }>;
    completed_step_ids: string[];
    remaining_step_ids: string[];
    promotion_gates: string[];
    recommended_phase_command: string | null;
    land_now: string[];
    not_yet: string[];
  } | null;
  product_entry_start: {
    surface_kind: string;
    summary: string | null;
    recommended_mode_id: string | null;
    modes: Array<{
      mode_id: string;
      title: string | null;
      command: string | null;
      surface_kind: string | null;
      summary: string | null;
      requires: string[];
    }>;
    resume_surface: {
      surface_kind: string | null;
      command: string | null;
      session_locator_field: string | null;
      checkpoint_locator_field: string | null;
    } | null;
    human_gate_ids: string[];
  } | null;
  product_entry_quickstart: {
    surface_kind: string;
    summary: string | null;
    recommended_step_id: string | null;
    steps: Array<{
      step_id: string;
      title: string | null;
      command: string | null;
      surface_kind: string | null;
      summary: string | null;
      requires: string[];
    }>;
    resume_contract: JsonRecord | null;
    human_gate_ids: string[];
  } | null;
  family_orchestration: {
    action_graph_ref: JsonRecord | null;
    action_graph: JsonRecord | null;
    human_gates: JsonRecord[];
    resume_contract: JsonRecord | null;
    event_envelope_surface: JsonRecord | null;
    checkpoint_lineage_surface: JsonRecord | null;
  } | null;
  runtime_inventory: NormalizedRuntimeInventory | null;
  task_lifecycle: NormalizedTaskLifecycle | null;
  runtime_control: NormalizedRuntimeControl | null;
  session_continuity: NormalizedSessionContinuity | null;
  progress_projection: NormalizedProgressProjection | null;
  artifact_inventory: NormalizedArtifactInventory | null;
  skill_catalog: NormalizedSkillCatalog | null;
  automation: NormalizedAutomationCatalog | null;
  remaining_gaps: string[];
  notes: string[];
}

export interface DomainManifestCatalogEntry {
  project_id: string;
  project: string;
  binding_id: string | null;
  workspace_path: string | null;
  manifest_command: string | null;
  status: DomainManifestStatus;
  manifest: NormalizedDomainManifest | null;
  error: {
    code: string;
    message: string;
    stdout: string | null;
    stderr: string | null;
  } | null;
}
