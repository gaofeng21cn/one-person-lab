import type { FamilyRuntimeDomainId, TemporalStageAttemptSignalKind } from './family-runtime-types.ts';

export const STAGE_ATTEMPT_WORKFLOW_NAME = 'StageAttemptWorkflow';
export const CODEX_STAGE_ACTIVITY_NAME = 'CodexStageActivity';
export const DOMAIN_SIDECAR_DISPATCH_ACTIVITY_NAME = 'DomainSidecarDispatchActivity';
export const DEFAULT_TEMPORAL_TASK_QUEUE = 'opl-stage-attempts';

export const TEMPORAL_STAGE_ATTEMPT_SIGNALS = [
  'HumanGateSignal',
  'UserInstructionSignal',
  'ResumeSignal',
] as const;

export const TEMPORAL_STAGE_ATTEMPT_QUERIES = [
  'StageAttemptQuery',
] as const;

export type { TemporalStageAttemptSignalKind } from './family-runtime-types.ts';

export type TemporalStageAttemptSignalPayload = {
  signal_kind: TemporalStageAttemptSignalKind;
  payload: Record<string, unknown>;
  source?: string;
  received_at?: string;
};

export type TemporalStageAttemptWorkflowInput = {
  stage_attempt_id: string;
  workflow_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  workspace_locator: Record<string, unknown>;
  source_fingerprint: string | null;
  executor_kind: string;
  retry_budget: Record<string, unknown>;
  task_id?: string | null;
  stage_packet_ref?: string | null;
  checkpoint_refs?: string[];
  closeout_packet?: Record<string, unknown> | null;
  codex_stage_runner?: {
    runner_mode?: 'dry_run' | 'live_dry_run' | 'codex_cli';
    timeout_ms?: number;
  };
};

export type TemporalStageAttemptWorkflowState = {
  surface_kind: 'temporal_stage_attempt_query';
  provider_kind: 'temporal';
  stage_attempt_id: string;
  workflow_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  status: 'registered' | 'running' | 'checkpointed' | 'blocked' | 'human_gate' | 'completed' | 'failed';
  started_at: string;
  updated_at: string;
  activity_events: Array<Record<string, unknown>>;
  checkpoint_refs: string[];
  closeout_refs: string[];
  consumed_refs: string[];
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
  rejected_writes: Array<Record<string, unknown>>;
  next_owner: string | null;
  route_impact: Record<string, unknown>;
  human_gate_refs: string[];
  signals: TemporalStageAttemptSignalPayload[];
  closeout_packet: Record<string, unknown> | null;
  completion_boundary: {
    provider_completion: 'completed' | 'not_completed';
    domain_ready_verdict: string | null;
    provider_completion_is_domain_ready: false;
  };
  authority_boundary: {
    opl: 'temporal_workflow_transport_and_control_metadata_only';
    domain: 'truth_quality_artifact_gate_owner';
  };
};

export function buildTemporalStageAttemptWorkflowContract() {
  return {
    provider_kind: 'temporal',
    workflow_name: STAGE_ATTEMPT_WORKFLOW_NAME,
    activity_names: {
      codex_stage_activity: CODEX_STAGE_ACTIVITY_NAME,
      domain_sidecar_dispatch_activity: DOMAIN_SIDECAR_DISPATCH_ACTIVITY_NAME,
    },
    signals: [...TEMPORAL_STAGE_ATTEMPT_SIGNALS],
    queries: [...TEMPORAL_STAGE_ATTEMPT_QUERIES],
    default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
    provider_completion_boundary: {
      provider_completion: 'workflow/activity transport completed',
      domain_ready_verdict: 'read from domain-owned quality or gate surface',
      opl_forbidden_authority: [
        'domain_truth',
        'domain_quality_verdict',
        'canonical_artifact_write',
      ],
    },
  };
}

export function buildTemporalStageAttemptWorkflowInput(
  attempt: {
    stage_attempt_id: string;
    workflow_id: string;
    domain_id: FamilyRuntimeDomainId;
    stage_id: string;
    workspace_locator: Record<string, unknown>;
    source_fingerprint: string | null;
    executor_kind: string;
    retry_budget: Record<string, unknown>;
    task_id?: string | null;
    checkpoint_refs?: unknown[];
  },
): TemporalStageAttemptWorkflowInput {
  return {
    stage_attempt_id: attempt.stage_attempt_id,
    workflow_id: attempt.workflow_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    workspace_locator: attempt.workspace_locator,
    source_fingerprint: attempt.source_fingerprint,
    executor_kind: attempt.executor_kind,
    retry_budget: attempt.retry_budget,
    task_id: typeof attempt.task_id === 'string' ? attempt.task_id : null,
    checkpoint_refs: Array.isArray(attempt.checkpoint_refs)
      ? attempt.checkpoint_refs.filter((entry: unknown): entry is string => typeof entry === 'string')
      : [],
  };
}

export function resolveTemporalAddress() {
  return process.env.OPL_TEMPORAL_ADDRESS?.trim() || process.env.TEMPORAL_ADDRESS?.trim() || null;
}

export function resolveTemporalNamespace() {
  return process.env.OPL_TEMPORAL_NAMESPACE?.trim() || 'default';
}

export function resolveTemporalTaskQueue() {
  return process.env.OPL_TEMPORAL_TASK_QUEUE?.trim() || DEFAULT_TEMPORAL_TASK_QUEUE;
}
