import type { StageRunEvent } from './stage-run-kernel.ts';

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

export type StageRunOutputLayout = {
  surface_kind: 'opl_stage_run_output_layout';
  stage_run_id: string;
  stage_step_id: string;
  output_root: string;
  run_directory: string;
  cycle_directory: string;
  attempt_directory: string;
  run_directory_ref: string;
  step_ref: string;
  output_manifest_path: string;
  runner_receipt_path: string;
  single_pass_receipt_path: string;
};

export type StageRunExecutorKind = 'codex_cli' | 'agent_cli' | 'domain_cli' | 'native_helper';

export type StageRunRunnerDispatchReceipt = {
  surface_kind: 'opl_stage_run_runner_dispatch_receipt';
  version: 'stage-run-runner-dispatch.v1';
  dispatch_id: string;
  idempotency_key: string;
  idempotent_replay: boolean;
  identity: StageRunCycleIdentity;
  executor: {
    kind: StageRunExecutorKind;
    executor_ref: string;
  };
  argv_fingerprint: string;
  argv_count: number;
  env_keys: string[];
  env_fingerprint: string;
  input_refs: string[];
  declared_output_refs: string[];
  output_manifest_ref: string;
  runner_receipt_ref: string;
  timeout_ms: number;
  process_log_policy: 'metadata_only';
  stdout_sha256: string;
  stdout_byte_count: number;
  stderr_sha256: string;
  stderr_byte_count: number;
  process_status: 'process_completed' | 'process_failed' | 'process_timed_out';
  exit_code: number;
  signal: NodeJS.Signals | null;
  timed_out: boolean;
  stage_run_events: StageRunEvent[];
  owner_receipt_ref: null;
  typed_blocker_ref: null;
  domain_result_ref: null;
  authority_boundary: typeof STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY;
};

export type StageRunCycleManifest = {
  surface_kind: 'opl_stage_run_cycle_manifest';
  version: 'stage-run-cycle.v1';
  manifest_id: string;
  target_agent_ref: string;
  descriptor_ref: string;
  run_ref: string;
  input_refs: string[];
  stage_bindings: Array<{
    stage_ref: string;
    handler_id: string;
  }>;
  max_cycles: number;
  max_attempts_per_cycle: number;
  no_progress_limit: number;
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

export type StageRunSinglePassResult = {
  status: 'completed' | 'failed';
  output_refs: string[];
  checkpoint_ref?: string;
  closeout_refs: string[];
  runtime_blocker_refs?: string[];
};

export type StageRunSinglePassContext = {
  manifest: StageRunCycleManifest;
  identity: StageRunCycleIdentity;
  output_layout: StageRunOutputLayout;
  input_refs: string[];
  checkpoint_refs: string[];
  step_receipt_refs: string[];
};

export type StageRunSinglePassHandlerBinding = {
  surface_kind: 'opl_stage_run_single_pass_handler_binding';
  handler_id: string;
  run: (
    context: StageRunSinglePassContext,
  ) => StageRunSinglePassResult | Promise<StageRunSinglePassResult>;
};

export type StageRunCycleState = {
  surface_kind: 'opl_stage_run_cycle_state';
  version: 'stage-run-cycle.v1';
  stage_run_id: string;
  target_agent_ref: string;
  descriptor_ref: string;
  run_ref: string;
  status: 'running' | 'checkpoint_accepted' | 'rollback_required' | 'blocked' | 'exhausted';
  cycle_index: number;
  attempt_index: number;
  completed_step_count: number;
  consecutive_no_progress_count: number;
  checkpoint_refs: string[];
  accepted_checkpoint_ref: string | null;
  rollback_to_checkpoint_ref: string | null;
  latest_output_refs: string[];
  step_receipt_refs: string[];
  closeout_refs: string[];
  output_manifest_refs: string[];
  route_decision_refs: string[];
  typed_blocker_refs: string[];
  human_gate_refs: string[];
  runtime_blocker_refs: string[];
  termination_reason: string | null;
  domain_typed_blocker_created: false;
  authority_boundary: typeof STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY;
};

export const STAGE_RUN_ORCHESTRATION_AUTHORITY_BOUNDARY = {
  owner: 'one-person-lab',
  can_orchestrate_stage_cycles: true,
  can_dispatch_typed_runner: true,
  can_manage_output_directories: true,
  can_record_refs_only_closeout: true,
  can_write_domain_truth: false,
  can_mutate_artifact_body: false,
  can_create_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_quality_verdict: false,
  can_claim_domain_ready: false,
  process_exit_is_domain_result: false,
  handler_completion_is_domain_result: false,
  checkpoint_ref_is_owner_receipt: false,
} as const;
