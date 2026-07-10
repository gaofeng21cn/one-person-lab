export const STAGE_RUN_CANONICAL_LAUNCH_OWNER = 'one-person-lab' as const;

export const STAGE_RUN_CANONICAL_RUNNER_REF =
  'src/modules/runway/family-runtime-codex-stage-runner.ts#runAgentStageRunner' as const;

export type StageRunCycleIdentityInput = {
  target_agent_ref: string;
  descriptor_ref: string;
  stage_ref: string;
  run_ref: string;
  cycle_index: number;
  attempt_index: number;
};

export type StageRunCycleIdentity = StageRunCycleIdentityInput & {
  surface_kind: 'opl_stage_run_cycle_identity';
  version: 'stage-run-cycle-identity.v1';
  stage_run_id: string;
  stage_step_id: string;
  idempotency_key: string;
};

export type StageRunCycleManifest = {
  surface_kind: 'opl_stage_run_cycle_manifest';
  version: 'stage-run-cycle.v1';
  manifest_id: string;
  target_agent_ref: string;
  descriptor_ref: string;
  run_ref: string;
  launch_owner: typeof STAGE_RUN_CANONICAL_LAUNCH_OWNER;
  input_refs: string[];
  stage_bindings: Array<{
    stage_ref: string;
    runner_ref: typeof STAGE_RUN_CANONICAL_RUNNER_REF;
  }>;
  max_cycles: number;
  max_attempts_per_cycle: number;
};

export type StageRunRouteDecision = {
  decision: 'dispatch' | 'accepted' | 'rollback' | 'blocked';
  stage_ref?: string;
  decision_refs: string[];
  accepted_checkpoint_ref?: string;
  rollback_to_checkpoint_ref?: string;
  typed_blocker_refs?: string[];
  human_gate_refs?: string[];
  runtime_blocker_refs?: string[];
};

export type StageRunEffectObservation = {
  effect_status: 'domain_result' | 'typed_blocker' | 'runtime_blocker';
  stage_ref: string;
  domain_result_ref?: string;
  typed_blocker_ref?: string;
  runtime_blocker_ref?: string;
  output_refs?: string[];
  checkpoint_ref?: string;
  closeout_refs?: string[];
};

export type StageRunCycleEvent =
  | {
      surface_kind: 'opl_stage_run_route_decision_event';
      version: 'stage-run-cycle-event.v1';
      event_kind: 'route_decision';
      route_decision: StageRunRouteDecision;
    }
  | {
      surface_kind: 'opl_stage_run_effect_observation_event';
      version: 'stage-run-cycle-event.v1';
      event_kind: 'effect_observation';
      effect: StageRunEffectObservation;
    };

export type StageRunCycleState = {
  surface_kind: 'opl_stage_run_cycle_state';
  version: 'stage-run-cycle.v1';
  manifest_id: string;
  stage_run_id: string;
  target_agent_ref: string;
  descriptor_ref: string;
  run_ref: string;
  status: 'running' | 'checkpoint_accepted' | 'rollback_required' | 'blocked' | 'exhausted';
  cycle_index: number;
  attempt_index: number;
  completed_step_count: number;
  pending_stage_ref: string | null;
  checkpoint_refs: string[];
  accepted_checkpoint_ref: string | null;
  rollback_to_checkpoint_ref: string | null;
  latest_output_refs: string[];
  domain_result_refs: string[];
  closeout_refs: string[];
  route_decision_refs: string[];
  typed_blocker_refs: string[];
  human_gate_refs: string[];
  runtime_blocker_refs: string[];
  termination_reason: string | null;
  domain_typed_blocker_created: false;
  authority_boundary: typeof STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY;
};

export const STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY = Object.freeze({
  owner: 'one-person-lab',
  can_reduce_refs_only_cycle_state: true,
  can_build_stable_cycle_identity: true,
  can_dispatch_runner: false,
  can_spawn_process: false,
  can_manage_output_directories: false,
  can_write_execution_receipts: false,
  can_write_run_closeout: false,
  can_choose_domain_route: false,
  can_write_domain_truth: false,
  can_mutate_artifact_body: false,
  can_create_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_quality_verdict: false,
  can_claim_domain_ready: false,
  effect_owner: 'canonical_stage_runner_and_target_domain_agent',
} as const);
