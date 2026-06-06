import crypto from 'node:crypto';

import { FrameworkContractError } from './contracts.ts';
import type { FamilyRuntimeDomainId, TemporalStageAttemptSignalKind } from './family-runtime-types.ts';
import {
  CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS,
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
  SHORT_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  SHORT_STAGE_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT,
  SHORT_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  SCHEDULER_TICK_WORKFLOW_RUN_TIMEOUT,
} from './family-runtime-temporal-constants.ts';
import {
  buildTemporalStageAttemptVisibilityReadiness,
  TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES,
} from './family-runtime-temporal-visibility.ts';

export const STAGE_ATTEMPT_WORKFLOW_NAME = 'StageAttemptWorkflow';
export const SCHEDULER_TICK_WORKFLOW_NAME = 'SchedulerTickWorkflow';
export const CODEX_STAGE_ACTIVITY_NAME = 'CodexStageActivity';
export const DOMAIN_HANDLER_DISPATCH_ACTIVITY_NAME = 'DomainHandlerDispatchActivity';
export const SCHEDULER_TICK_ACTIVITY_NAME = 'SchedulerTickActivity';
export const DEFAULT_TEMPORAL_TASK_QUEUE = 'opl-stage-attempts';
export const TEMPORAL_MAX_INLINE_PAYLOAD_BYTES = 128 * 1024;

export const TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTE_NAMES = [
  'OplStageAttemptId',
  'OplDomainId',
  'OplStageId',
  'OplAttemptStatus',
  'OplStagePhase',
  'OplBlockedReason',
  'OplTaskId',
  'OplSourceFingerprint',
  'OplExecutorKind',
] as const;

export const TEMPORAL_STAGE_ATTEMPT_SIGNALS = [
  'HumanGateSignal',
  'UserInstructionSignal',
  'ResumeSignal',
] as const;

export const TEMPORAL_STAGE_ATTEMPT_QUERIES = [
  'StageAttemptQuery',
] as const;

export const TEMPORAL_STAGE_ATTEMPT_UPDATES = [
  'StageAttemptOperatorUpdate',
] as const;

export type { TemporalStageAttemptSignalKind } from './family-runtime-types.ts';

export {
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
  SCHEDULER_TICK_WORKFLOW_RUN_TIMEOUT,
};

export type TemporalStageAttemptSignalPayload = {
  signal_kind: TemporalStageAttemptSignalKind;
  payload: Record<string, unknown>;
  source?: string;
  received_at?: string;
};

export type TemporalStageAttemptOperatorUpdateReceipt = {
  surface_kind: 'temporal_stage_attempt_operator_update_receipt';
  provider_kind: 'temporal';
  update_status: 'accepted';
  stage_attempt_id: string;
  workflow_id: string;
  signal_kind: TemporalStageAttemptSignalKind;
  signal_count: number;
  updated_at: string;
  authority_boundary: {
    opl: 'temporal_update_ack_and_transport_metadata_only';
    domain: 'truth_quality_artifact_gate_owner';
    provider_completion_is_domain_ready: false;
  };
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
  payload_guard?: {
    policy: ReturnType<typeof temporalPayloadHistoryPolicy>;
    truncated_fields: Array<{
      field: string;
      original_bytes: number;
      ref: string;
    }>;
  };
  closeout_packet?: Record<string, unknown> | null;
  provider_blocker?: {
    blocked_reason?: string | null;
    route_impact?: Record<string, unknown>;
  } | null;
  opl_execution_authorization?: {
    owner: 'one-person-lab';
    executor_kind: string;
    provider_attempt_ref: string;
    stage_attempt_id: string;
    attempt_lease_ref: string;
    attempt_lease_status: 'active';
    execution_authorization_decision_ref: string;
    stage_run_id: string;
    domain_id: FamilyRuntimeDomainId;
    stage_id: string;
    generation: 0;
    phase: 'launch';
    selected_executor: string;
    workspace_scope_ref: string;
    artifact_scope_ref: string;
    source_fingerprint: string;
    idempotency_key: string;
    current_pointer_ref: string;
    stage_manifest_ref?: string | null;
    authority_boundary: {
      opl_can_write_domain_truth: false;
      opl_can_create_owner_receipt: false;
      opl_can_create_typed_blocker: false;
    };
  };
  visibility_search_attributes_upsert_enabled?: boolean;
  codex_stage_runner?: {
    runner_mode?: 'dry_run' | 'live_dry_run' | 'codex_cli';
    timeout_ms?: number;
    no_output_timeout_ms?: number;
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
  stage_progress_log: {
    surface_kind: 'temporal_workflow_stage_progress_log';
    planned_work: Record<string, unknown>;
    timeline: Array<Record<string, unknown>>;
    visibility: Record<string, unknown>;
  };
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

export type TemporalSchedulerTickWorkflowInput = {
  provider_kind: 'temporal';
  tick_source: string;
  force?: boolean;
  limit?: number;
  hydrate?: boolean;
};

export type TemporalSchedulerTickWorkflowState = {
  surface_kind: 'temporal_scheduler_tick_query';
  provider_kind: 'temporal';
  status: 'registered' | 'running' | 'completed' | 'failed';
  tick_source: string;
  started_at: string;
  updated_at: string;
  receipt: Record<string, unknown> | null;
  error: string | null;
  authority_boundary: {
    opl: 'scheduler_cadence_queue_and_provider_slo_owner';
    domain: 'truth_quality_artifact_gate_owner';
  };
};

export function buildTemporalStageAttemptWorkflowContract() {
  return {
    provider_kind: 'temporal',
    workflow_name: STAGE_ATTEMPT_WORKFLOW_NAME,
    scheduler_tick_workflow_name: SCHEDULER_TICK_WORKFLOW_NAME,
    activity_names: {
      codex_stage_activity: CODEX_STAGE_ACTIVITY_NAME,
      domain_handler_dispatch_activity: DOMAIN_HANDLER_DISPATCH_ACTIVITY_NAME,
      scheduler_tick_activity: SCHEDULER_TICK_ACTIVITY_NAME,
    },
    signals: [...TEMPORAL_STAGE_ATTEMPT_SIGNALS],
    queries: [...TEMPORAL_STAGE_ATTEMPT_QUERIES],
    required_search_attributes: [...TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTE_NAMES],
    operator_action_updates: [...TEMPORAL_STAGE_ATTEMPT_UPDATES],
    default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
    visibility_contract: buildTemporalStageAttemptVisibilityReadiness(),
    search_attributes: TEMPORAL_STAGE_ATTEMPT_SEARCH_ATTRIBUTES.map((attribute) => ({
      name: attribute.name,
      type: attribute.type,
      source: attribute.source,
    })),
    scheduler_tick_timeout_policy: {
      workflow_run_timeout: SCHEDULER_TICK_WORKFLOW_RUN_TIMEOUT,
      workflow_execution_timeout: SCHEDULER_TICK_WORKFLOW_RUN_TIMEOUT,
      stale_overlap_release_policy:
        'fail_scheduler_tick_workflow_when_worker_does_not_pick_up_workflow_or_activity',
    },
    provider_completion_boundary: {
      provider_completion: 'workflow/activity transport completed',
      domain_ready_verdict: 'read from domain-owned quality or gate surface',
      opl_forbidden_authority: [
        'domain_truth',
        'domain_quality_verdict',
        'canonical_artifact_write',
      ],
    },
    activity_timeout_policy: {
      codex_stage_activity: {
        start_to_close_timeout: CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
        heartbeat_timeout: CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
        heartbeat_interval_ms: DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS,
        cancellation_delivered_by_heartbeat: true,
        runner_timeout_ms: DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
        runner_no_output_timeout_ms: DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
        retry: {
          maximum_attempts: 1,
          reason: 'codex_cli_subprocess_must_not_be_duplicated_by_temporal_retry',
        },
      },
      short_stage_activities: {
        schedule_to_close_timeout: SHORT_STAGE_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT,
        start_to_close_timeout: SHORT_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
        heartbeat_timeout: SHORT_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
        retry: {
          maximum_attempts: 3,
          reason: 'short_idempotent_opl_projection_or_dispatch_activity_retry',
        },
        stale_schedule_release_policy:
          'fail_short_activity_when_worker_does_not_pick_up_scheduled_task',
      },
    },
    payload_history_policy: temporalPayloadHistoryPolicy(),
  };
}

export function temporalPayloadHistoryPolicy() {
  return {
    max_inline_string_bytes: TEMPORAL_MAX_INLINE_PAYLOAD_BYTES,
    large_payload_storage: 'external_ref_required',
    large_payload_ref_prefix: 'payload_ref:sha256:',
  } as const;
}

function payloadRefFor(value: string) {
  return `${temporalPayloadHistoryPolicy().large_payload_ref_prefix}${crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stageRunIdFor(input: { domain_id: string; stage_id: string }) {
  return [
    'app-stage-run',
    input.domain_id,
    input.stage_id,
  ]
    .map((entry) => entry.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown')
    .join(':');
}

function workspaceScopeRef(workspaceLocator: Record<string, unknown>) {
  return optionalText(workspaceLocator.workspace_scope_ref)
    ?? optionalText(workspaceLocator.workspace_ref)
    ?? (optionalText(workspaceLocator.workspace_root)
      ? `workspace:${optionalText(workspaceLocator.workspace_root)}`
      : null)
    ?? (optionalText(workspaceLocator.repo_root)
      ? `workspace:${optionalText(workspaceLocator.repo_root)}`
      : null);
}

function artifactScopeRef(input: { workspaceLocator: Record<string, unknown>; stagePacketRef: string | null }) {
  return optionalText(input.workspaceLocator.artifact_scope_ref)
    ?? optionalText(input.workspaceLocator.stage_artifact_unit_ref)
    ?? optionalText(input.workspaceLocator.lineage_ref)
    ?? (input.stagePacketRef ? `stage-packet:${input.stagePacketRef}` : null);
}

function stageManifestRef(input: { workspaceLocator: Record<string, unknown>; stageId: string }) {
  return optionalText(input.workspaceLocator.stage_manifest_ref)
    ?? optionalText(input.workspaceLocator.manifest_ref)
    ?? `opl://stage-manifests/${encodeURIComponent(input.stageId)}`;
}

function buildLaunchExecutionAuthorization(input: {
  stageAttemptId: string;
  workflowId: string;
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  executorKind: string;
  taskId: string | null;
  workspaceLocator: Record<string, unknown>;
  stagePacketRef: string | null;
  sourceFingerprint: string | null;
  idempotencyKey: string | null;
}) {
  const workspaceScope = workspaceScopeRef(input.workspaceLocator);
  const artifactScope = artifactScopeRef({
    workspaceLocator: input.workspaceLocator,
    stagePacketRef: input.stagePacketRef,
  });
  if (!workspaceScope || !artifactScope || !input.sourceFingerprint || !input.idempotencyKey) {
    return undefined;
  }
  const stageRunId = stageRunIdFor({ domain_id: input.domainId, stage_id: input.stageId });
  const taskOrAttemptId = input.taskId ?? input.stageAttemptId;
  return {
    owner: 'one-person-lab' as const,
    executor_kind: input.executorKind,
    provider_attempt_ref: `temporal://attempt/${encodeURIComponent(input.stageAttemptId)}`,
    stage_attempt_id: input.stageAttemptId,
    attempt_lease_ref: `opl://stage-attempts/${encodeURIComponent(input.stageAttemptId)}/leases/${encodeURIComponent(taskOrAttemptId)}/active`,
    attempt_lease_status: 'active' as const,
    execution_authorization_decision_ref: `opl://stage-attempts/${encodeURIComponent(input.stageAttemptId)}/execution-authorizations/${encodeURIComponent(taskOrAttemptId)}/${encodeURIComponent(input.workflowId)}`,
    stage_run_id: stageRunId,
    domain_id: input.domainId,
    stage_id: input.stageId,
    generation: 0 as const,
    phase: 'launch' as const,
    selected_executor: input.executorKind,
    workspace_scope_ref: workspaceScope,
    artifact_scope_ref: artifactScope,
    source_fingerprint: input.sourceFingerprint,
    idempotency_key: input.idempotencyKey,
    current_pointer_ref: `opl://stage-runs/${encodeURIComponent(stageRunId)}/current`,
    stage_manifest_ref: stageManifestRef({
      workspaceLocator: input.workspaceLocator,
      stageId: input.stageId,
    }),
    authority_boundary: {
      opl_can_write_domain_truth: false as const,
      opl_can_create_owner_receipt: false as const,
      opl_can_create_typed_blocker: false as const,
    },
  };
}

function guardInlineString(input: {
  field: string;
  value?: string | null;
  truncatedFields: Array<{ field: string; original_bytes: number; ref: string }>;
}) {
  if (!input.value) {
    return input.value ?? null;
  }
  const bytes = Buffer.byteLength(input.value, 'utf8');
  if (bytes <= TEMPORAL_MAX_INLINE_PAYLOAD_BYTES) {
    return input.value;
  }
  const ref = payloadRefFor(input.value);
  input.truncatedFields.push({
    field: input.field,
    original_bytes: bytes,
    ref,
  });
  return ref;
}

export function guardTemporalStageAttemptWorkflowInputPayload(
  input: TemporalStageAttemptWorkflowInput,
): TemporalStageAttemptWorkflowInput {
  const truncatedFields: Array<{ field: string; original_bytes: number; ref: string }> = [];
  const checkpointRefs = (input.checkpoint_refs ?? [])
    .map((entry, index) => guardInlineString({
      field: `checkpoint_refs[${index}]`,
      value: entry,
      truncatedFields,
    }))
    .filter((entry): entry is string => typeof entry === 'string');
  const stagePacketRef = guardInlineString({
    field: 'stage_packet_ref',
    value: input.stage_packet_ref ?? checkpointRefs[0] ?? null,
    truncatedFields,
  });
  if (truncatedFields.length === 0) {
    return input;
  }
  return {
    ...input,
    stage_packet_ref: stagePacketRef,
    checkpoint_refs: checkpointRefs,
    payload_guard: {
      policy: temporalPayloadHistoryPolicy(),
      truncated_fields: [
        ...(input.payload_guard?.truncated_fields ?? []),
        ...truncatedFields,
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
    idempotency_key?: string | null;
    task_id?: string | null;
    checkpoint_refs?: unknown[];
  },
): TemporalStageAttemptWorkflowInput {
  const checkpointRefs = Array.isArray(attempt.checkpoint_refs)
    ? attempt.checkpoint_refs.filter((entry: unknown): entry is string => typeof entry === 'string')
    : [];
  const executorKind = attempt.executor_kind;
  return guardTemporalStageAttemptWorkflowInputPayload({
    stage_attempt_id: attempt.stage_attempt_id,
    workflow_id: attempt.workflow_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    workspace_locator: attempt.workspace_locator,
    source_fingerprint: attempt.source_fingerprint,
    executor_kind: executorKind,
    retry_budget: attempt.retry_budget,
    task_id: typeof attempt.task_id === 'string' ? attempt.task_id : null,
    stage_packet_ref: checkpointRefs[0] ?? null,
    checkpoint_refs: checkpointRefs,
    opl_execution_authorization: buildLaunchExecutionAuthorization({
      stageAttemptId: attempt.stage_attempt_id,
      workflowId: attempt.workflow_id,
      domainId: attempt.domain_id,
      stageId: attempt.stage_id,
      executorKind,
      taskId: typeof attempt.task_id === 'string' ? attempt.task_id : null,
      workspaceLocator: attempt.workspace_locator,
      stagePacketRef: checkpointRefs[0] ?? null,
      sourceFingerprint: attempt.source_fingerprint,
      idempotencyKey: optionalText(attempt.idempotency_key),
    }),
    codex_stage_runner: executorKind === 'codex_cli'
      ? {
          runner_mode: 'codex_cli',
          timeout_ms: DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
          no_output_timeout_ms: DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
        }
      : undefined,
  });
}

export function requireTemporalStageAttemptWorkflowInputLaunchable(input: TemporalStageAttemptWorkflowInput) {
  if (input.executor_kind === 'codex_cli' && (!input.stage_packet_ref || input.stage_packet_ref === 'unavailable')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal codex_cli workflow input requires a real stage packet ref.',
      {
        stage_attempt_id: input.stage_attempt_id,
        workflow_id: input.workflow_id,
        executor_kind: input.executor_kind,
        blocked_reason: 'codex_cli_stage_packet_ref_missing',
        required: ['checkpoint_refs[0]'],
      },
    );
  }
  const workspaceRoot = typeof input.workspace_locator.workspace_root === 'string' && input.workspace_locator.workspace_root.trim()
    ? input.workspace_locator.workspace_root.trim()
    : typeof input.workspace_locator.repo_root === 'string' && input.workspace_locator.repo_root.trim()
      ? input.workspace_locator.repo_root.trim()
      : null;
  if (input.executor_kind === 'codex_cli' && !workspaceRoot) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal codex_cli workflow input requires a domain workspace root.',
      {
        stage_attempt_id: input.stage_attempt_id,
        workflow_id: input.workflow_id,
        executor_kind: input.executor_kind,
        blocked_reason: 'codex_cli_workspace_root_missing',
        required: ['workspace_locator.workspace_root or workspace_locator.repo_root'],
      },
    );
  }
  return input;
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
