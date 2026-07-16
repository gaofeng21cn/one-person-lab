import crypto from 'node:crypto';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { FamilyRuntimeDomainProfiles } from './family-runtime-command.ts';
import type { FamilyRuntimeDomainId, TemporalStageAttemptSignalKind } from './family-runtime-types.ts';
import type {
  StageQualityAttemptRole,
  StageQualityFinding,
  StageQualityRepairMapEntry,
} from '../stagecraft/index.ts';
import { normalizeStageQualityAttemptRole } from '../stagecraft/index.ts';
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
import { requireStageQualityAttemptBoundary } from './family-runtime-stage-quality-attempt-boundary.ts';
import type {
  StageAttemptExecutionContentBinding,
  TemporalStageRunWorkflowInput,
} from './family-runtime-temporal-stage-run.ts';
import {
  deriveStageRunId,
  deriveStageRunWorkflowId,
  revalidateStageRunImmutableSpecContent,
  stageRunSpecSha256,
  type StageRunImmutableSpec,
  validateStageRunImmutableSpecEnvelope,
} from './family-runtime-stage-run-identity.ts';

export type {
  StageAttemptExecutionContentBinding,
  TemporalStageQualityAttemptMaterializationInput,
  TemporalStageQualityAttemptSyncInput,
  TemporalStageQualityCycleProjectionInput,
  TemporalStageQualityReviewReceiptInput,
  TemporalStageRunAttemptSummary,
  TemporalStageRunQualityRolePromptRefs,
  TemporalStageRunRouteLaunchInput,
  TemporalStageRunRouteLaunchReceipt,
  TemporalStageRunWorkflowInput,
  TemporalStageRunWorkflowState,
} from './family-runtime-temporal-stage-run.ts';

export const STAGE_ATTEMPT_WORKFLOW_NAME = 'StageAttemptWorkflow';
export const SCHEDULER_TICK_WORKFLOW_NAME = 'SchedulerTickWorkflow';
export const CODEX_STAGE_ACTIVITY_NAME = 'CodexStageActivity';
export const DOMAIN_HANDLER_DISPATCH_ACTIVITY_NAME = 'DomainHandlerDispatchActivity';
export const SCHEDULER_TICK_ACTIVITY_NAME = 'SchedulerTickActivity';
export const STAGE_RUN_WORKFLOW_NAME = 'StageRunWorkflow';
export const STAGE_ATTEMPT_ACTIVITY_NAME = 'StageAttemptActivity';
export const RECONCILE_WORKFLOW_NAME = 'ReconcileWorkflow';
export const HUMAN_GATE_SIGNAL_NAME = 'HumanGateSignal';
export const OWNER_RECEIPT_SIGNAL_NAME = 'OwnerReceiptSignal';
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
  HUMAN_GATE_SIGNAL_NAME,
  OWNER_RECEIPT_SIGNAL_NAME,
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
  stage_run_id?: string | null;
  stage_run_content_binding_version?: 'opl-stage-run-attempt-content-binding.v1' | null;
  stage_run_spec_sha256?: string | null;
  stage_run_spec?: StageRunImmutableSpec | null;
  execution_content_binding?: StageAttemptExecutionContentBinding | null;
  domain_pack_root?: string | null;
  quality_cycle_id?: string | null;
  attempt_role?: StageQualityAttemptRole | null;
  quality_round_index?: number | null;
  parent_attempt_ref?: string | null;
  parent_attempt_lineage?: {
    stage_run_id: string;
    quality_cycle_id: string;
  } | null;
  input_artifact_refs?: string[];
  reviewed_artifact_hashes?: string[];
  quality_source_refs?: string[];
  quality_rubric_refs?: string[];
  prior_finding_refs?: string[];
  repair_map_refs?: string[];
  quality_role_prompt_ref?: string | null;
  context_manifest_ref?: string | null;
  no_context_inheritance?: boolean | null;
  quality_context?: {
    findings?: StageQualityFinding[];
    repair_map?: StageQualityRepairMapEntry[];
    context_manifest?: Record<string, unknown>;
  };
  stage_attempt_executor_policy?: Record<string, unknown> | null;
  retry_budget: Record<string, unknown>;
  route_impact?: Record<string, unknown>;
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
  owner_receipt_refs?: string[];
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
  domain_profiles?: FamilyRuntimeDomainProfiles;
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
    opl: 'scheduler_cadence_provider_slo_and_queue_projection_bridge';
    domain: 'truth_quality_artifact_gate_owner';
  };
};

export function buildTemporalStageAttemptWorkflowContract() {
  return {
    provider_kind: 'temporal',
    workflow_name: STAGE_ATTEMPT_WORKFLOW_NAME,
    stage_run_controller_workflow_name: STAGE_RUN_WORKFLOW_NAME,
    stage_attempt_child_workflow_name: STAGE_ATTEMPT_WORKFLOW_NAME,
    temporal_first_runtime_contract: buildTemporalFirstRuntimeContract(),
    scheduler_tick_workflow_name: SCHEDULER_TICK_WORKFLOW_NAME,
    activity_names: {
      codex_stage_activity: CODEX_STAGE_ACTIVITY_NAME,
      domain_handler_dispatch_activity: DOMAIN_HANDLER_DISPATCH_ACTIVITY_NAME,
      scheduler_tick_activity: SCHEDULER_TICK_ACTIVITY_NAME,
      stage_quality_attempt_materialize_activity: 'StageQualityAttemptMaterializeActivity',
      stage_quality_attempt_sync_activity: 'StageQualityAttemptSyncActivity',
      stage_quality_cycle_project_activity: 'StageQualityCycleProjectActivity',
      stage_quality_review_receipt_activity: 'StageQualityReviewReceiptActivity',
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

export function buildTemporalFirstRuntimeContract() {
  return {
    surface_kind: 'opl_temporal_first_runtime_contract',
    contract_id: 'opl_family_runtime_temporal_first_contract',
    contract_ref: 'contracts/opl-framework/family-runtime-temporal-first-contract.json',
    provider_kind: 'temporal',
    production_substrate: 'temporal_required_for_live_workflow_execution',
    readback_policy: 'contract_projection_only_no_live_temporal_service_started',
    workflow_activity_signal_mapping: {
      stage_run_workflow: {
        contract_name: STAGE_RUN_WORKFLOW_NAME,
        temporal_kind: 'workflow',
        current_workflow_type: STAGE_RUN_WORKFLOW_NAME,
        child_workflow_type: STAGE_ATTEMPT_WORKFLOW_NAME,
        role: 'non_model_durable_stage_run_controller_for_bounded_quality_attempts',
        task_queue: 'domain_runtime_lane_task_queue',
        event_history_role: 'durable_quality_loop_attempt_lineage_budget_and_terminalization_history',
        sqlite_role: 'projection_audit_cache_not_durable_lifecycle_truth',
      },
      stage_attempt_workflow: {
        contract_name: STAGE_ATTEMPT_WORKFLOW_NAME,
        temporal_kind: 'child_workflow',
        parent_workflow_type: STAGE_RUN_WORKFLOW_NAME,
        role: 'one_context_isolated_executor_invocation_for_a_framework_bounded_attempt_role',
        may_create_authoritative_attempts: false,
        may_transition_stage: false,
      },
      stage_attempt_activity: {
        contract_name: STAGE_ATTEMPT_ACTIVITY_NAME,
        temporal_kind: 'activity',
        current_activity_types: [
          CODEX_STAGE_ACTIVITY_NAME,
          DOMAIN_HANDLER_DISPATCH_ACTIVITY_NAME,
        ],
        role: 'execute_codex_or_domain_handler_attempt_and_return_refs_only_closeout_transport',
        retry_policy_owner: 'temporal_activity_retry_policy',
        dead_letter_role: 'temporal_failure_history_plus_opl_operator_projection_only',
      },
      reconcile_workflow: {
        contract_name: RECONCILE_WORKFLOW_NAME,
        temporal_kind: 'workflow',
        current_workflow_type: SCHEDULER_TICK_WORKFLOW_NAME,
        current_activity_type: SCHEDULER_TICK_ACTIVITY_NAME,
        role: 'scheduled_desired_current_reconciliation_and_next_safe_action_projection',
        schedule_id: 'opl-family-runtime-provider-scheduler',
        scheduler_role: 'trigger_reconcile_cadence_only_not_domain_terminal_state_writer',
      },
      human_gate_signal: {
        contract_name: HUMAN_GATE_SIGNAL_NAME,
        temporal_kind: 'signal',
        signal_kind: 'human_gate',
        role: 'append_human_gate_ref_to_workflow_history_and_projection',
        closes_stage: false,
      },
      owner_receipt_signal: {
        contract_name: OWNER_RECEIPT_SIGNAL_NAME,
        temporal_kind: 'signal',
        signal_kind: 'owner_receipt',
        role: 'append_domain_owner_receipt_ref_to_workflow_history_and_projection',
        owner_receipt_is_ref_only: true,
        opl_can_sign_owner_receipt: false,
        closes_stage_without_domain_authority: false,
      },
    },
    task_queue_mapping: {
      default_task_queue: DEFAULT_TEMPORAL_TASK_QUEUE,
      resolver: 'resolveTemporalWorkerTaskQueue(paths)',
      grouping_policy: 'family_runtime_root_and_domain_runtime_lane',
      priority_and_rate_policy: 'temporal_or_worker_level_policy_only_not_sqlite_queue_truth',
    },
    retry_mapping: {
      codex_stage_activity: {
        maximum_attempts: 1,
        reason: 'codex_cli_subprocess_must_not_be_duplicated_by_temporal_retry',
      },
      short_idempotent_activities: {
        maximum_attempts: 3,
        reason: 'projection_or_dispatch_activity_retry_owned_by_temporal',
      },
      opl_dead_letter_role: 'authority_ref_and_operator_projection_only',
    },
    schedule_mapping: {
      schedule_id: 'opl-family-runtime-provider-scheduler',
      workflow_type: SCHEDULER_TICK_WORKFLOW_NAME,
      target_contract_workflow: RECONCILE_WORKFLOW_NAME,
      cadence_owner: 'temporal_schedule',
      scheduler_may_enqueue_domain_work_directly: false,
      scheduler_may_write_terminal_state: false,
    },
    event_history_mapping: {
      temporal_history_is_durable_lifecycle_truth: true,
      required_history_refs: [
        'WorkflowExecutionStarted',
        'ActivityTaskScheduled',
        'ActivityTaskCompleted',
        'WorkflowExecutionSignaled',
        'WorkflowExecutionCompleted',
        'WorkflowExecutionFailed',
      ],
      sqlite_projection_only_fields: [
        'tasks.status',
        'stage_attempts.status',
        'stage_attempt_signals.payload_json',
      ],
      sqlite_sidecar_role: 'projection_and_readback_index_only_not_runtime_provider',
    },
    durable_lifecycle_readback: {
      command_surface: 'opl family-runtime attempt query <stage_attempt_id>',
      surface_kind: 'temporal_durable_lifecycle_readback',
      binds_identity: [
        'workflow_id',
        'run_id',
        'stage_attempt_id',
        'schedule_id',
        'task_queue',
      ],
      required_evidence: [
        'workflow_id',
        'temporal_workflow_history_or_query_readback',
        'stage_attempt_identity',
        'temporal_schedule_identity',
        'temporal_task_queue_identity',
        'authority_event_ref_or_projection_rebuild_ref',
      ],
      sqlite_status_role: 'projection_only_not_temporal_lifecycle_truth',
      ready_claim_allowed_without_temporal_history: false,
    },
    false_ready_boundary: {
      live_workflow_execution_ready_requires: [
        'temporal_service_reachable',
        'temporal_worker_ready',
        'scheduler_cadence_ready',
        'temporal_history_or_authority_projection_rebuilds_lifecycle',
      ],
      not_proven_by: [
        'contract_readback',
        'sqlite_projection_clean',
        'local_provider_pass',
        'focused_tests_pass',
        'provider_completion',
      ],
      forbidden_claims: [
        'production_ready',
        'domain_ready',
        'owner_acceptance',
        'provider_completion_is_domain_completion',
        'sqlite_queue_is_durable_lifecycle_truth',
      ],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_domain_ready: false,
      provider_completion_is_domain_ready: false,
    },
  } as const;
}

export function temporalPayloadHistoryPolicy() {
  return {
    max_inline_string_bytes: TEMPORAL_MAX_INLINE_PAYLOAD_BYTES,
    large_payload_storage: 'external_ref_required',
    large_payload_ref_prefix: 'payload_ref:sha256:',
    scheduler_tick_activity_result: {
      result_surface_kind: 'temporal_scheduler_tick_activity_receipt',
      max_inline_bytes: TEMPORAL_MAX_INLINE_PAYLOAD_BYTES,
      full_scheduler_tick_body_omitted: true,
      retained_summary_fields: [
        'provider_cadence_surface_kind',
        'scheduler_owner',
        'cadence_owner',
        'provider_kind',
        'cadence_source',
        'cadence_status',
        'task_scope',
        'provider_readiness_after_slo',
        'provider_liveness_blocker',
        'provider_blocker',
        'provider_slo_summary',
        'queue_projection_bridge',
        'retired_queue_tick',
        'authority_boundary',
      ],
      omitted_body_fields: [
        'provider_runtime',
        'provider_runtime_after_slo',
        'provider_slo',
        'task_scope.payloadMatches',
        'provider_readiness_after_slo.blockers',
        'provider_readiness_after_slo.repair_action.body',
        'provider_liveness_blocker.next_repair_action.body',
        'provider_blocker.next_repair_action.body',
        'queue_projection_bridge.body',
        'retired_queue_tick.dispatches',
      ],
      authority_boundary: {
        can_write_domain_truth: false,
        can_write_domain_memory_body: false,
        can_authorize_quality_verdict: false,
        can_authorize_export_verdict: false,
        provider_completion_is_domain_ready: false,
      },
    },
  } as const;
}

function payloadRefFor(value: string) {
  return `${temporalPayloadHistoryPolicy().large_payload_ref_prefix}${crypto.createHash('sha256').update(value).digest('hex').slice(0, 16)}`;
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function optionalRecord(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
    stage_run_id?: string | null;
    quality_cycle_id?: string | null;
    attempt_role?: unknown;
    quality_round_index?: number | null;
    parent_attempt_ref?: string | null;
    input_artifact_refs?: unknown[];
    reviewed_artifact_hashes?: unknown[];
    quality_source_refs?: unknown[];
    quality_rubric_refs?: unknown[];
    prior_finding_refs?: unknown[];
    repair_map_refs?: unknown[];
    quality_context?: Record<string, unknown> | null;
    quality_role_prompt_ref?: string | null;
    context_manifest_ref?: string | null;
    context_manifest?: Record<string, unknown> | null;
    no_context_inheritance?: boolean | null;
    stage_attempt_executor_policy?: unknown;
    retry_budget: Record<string, unknown>;
    route_impact?: Record<string, unknown>;
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
    stage_run_id: optionalText(attempt.stage_run_id),
    quality_cycle_id: optionalText(attempt.quality_cycle_id),
    attempt_role: attempt.attempt_role
      ? normalizeStageQualityAttemptRole(attempt.attempt_role)
      : null,
    quality_round_index: Number.isInteger(attempt.quality_round_index)
      ? attempt.quality_round_index
      : null,
    parent_attempt_ref: optionalText(attempt.parent_attempt_ref),
    parent_attempt_lineage: attempt.parent_attempt_ref
      ? {
          stage_run_id: optionalText(attempt.stage_run_id) ?? '',
          quality_cycle_id: optionalText(attempt.quality_cycle_id) ?? '',
        }
      : null,
    input_artifact_refs: Array.isArray(attempt.input_artifact_refs)
      ? attempt.input_artifact_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    reviewed_artifact_hashes: Array.isArray(attempt.reviewed_artifact_hashes)
      ? attempt.reviewed_artifact_hashes.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    quality_source_refs: Array.isArray(attempt.quality_source_refs)
      ? attempt.quality_source_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    quality_rubric_refs: Array.isArray(attempt.quality_rubric_refs)
      ? attempt.quality_rubric_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    prior_finding_refs: Array.isArray(attempt.prior_finding_refs)
      ? attempt.prior_finding_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    repair_map_refs: Array.isArray(attempt.repair_map_refs)
      ? attempt.repair_map_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      : [],
    quality_role_prompt_ref: optionalText(attempt.quality_role_prompt_ref),
    context_manifest_ref: optionalText(attempt.context_manifest_ref),
    no_context_inheritance: attempt.no_context_inheritance ?? null,
    quality_context: attempt.context_manifest || attempt.quality_context
      ? {
          ...(attempt.quality_context ?? {}),
          ...(attempt.context_manifest ? { context_manifest: attempt.context_manifest } : {}),
        }
      : undefined,
    stage_attempt_executor_policy: optionalRecord(attempt.stage_attempt_executor_policy),
    retry_budget: attempt.retry_budget,
    route_impact: optionalRecord(attempt.route_impact) ?? {},
    task_id: typeof attempt.task_id === 'string' ? attempt.task_id : null,
    stage_packet_ref: checkpointRefs[0] ?? null,
    checkpoint_refs: checkpointRefs,
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
  requireStageQualityAttemptBoundary(input as unknown as Record<string, unknown>);
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

export function requireTemporalStageRunWorkflowInputLaunchable(
  input: TemporalStageRunWorkflowInput,
  options: { revalidateContent?: boolean | 'historical_evidence' } = {},
) {
  for (const [field, value] of Object.entries({
    stage_run_id: input.stage_run_id,
    stage_run_invocation_id: input.stage_run_invocation_id,
    stage_run_spec_sha256: input.stage_run_spec_sha256,
    workflow_id: input.workflow_id,
    stage_id: input.stage_id,
    stage_packet_ref: input.stage_packet_ref,
    quality_policy_ref: input.quality_policy_ref,
    domain_pack_root: input.domain_pack_root,
    stage_manifest_ref: input.stage_manifest_ref,
    stage_manifest_sha256: input.stage_manifest_sha256,
  })) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new FrameworkContractError('contract_shape_invalid', `StageRun quality controller requires ${field}.`, {
        field,
      });
    }
  }
  const expectedStageRunId = deriveStageRunId({
    domainId: input.domain_id,
    stageId: input.stage_id,
    stageRunInvocationId: input.stage_run_invocation_id,
  });
  if (input.stage_run_id !== expectedStageRunId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun id must derive only from domain, Stage, and durable invocation identity.',
      {
        failure_code: 'stage_run_identity_mismatch',
        stage_run_id: input.stage_run_id,
        expected_stage_run_id: expectedStageRunId,
      },
    );
  }
  const expectedWorkflowId = deriveStageRunWorkflowId(expectedStageRunId);
  if (input.workflow_id !== expectedWorkflowId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun workflow id must derive only from the canonical StageRun id.',
      {
        failure_code: 'stage_run_workflow_identity_mismatch',
        stage_run_id: input.stage_run_id,
        workflow_id: input.workflow_id,
        expected_workflow_id: expectedWorkflowId,
      },
    );
  }
  const spec = input.stage_run_spec;
  if (
    spec?.surface_kind !== 'opl_stage_run_immutable_spec'
    || spec.version !== 'opl-stage-run-immutable-spec.v1'
    || spec.domain_id !== input.domain_id
    || spec.stage_id !== input.stage_id
    || spec.parent_route_decision_ref !== input.parent_route_decision_ref
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable spec lineage must match its launch envelope.',
      {
        failure_code: 'stage_run_spec_lineage_mismatch',
        stage_run_id: input.stage_run_id,
      },
    );
  }
  if (
    !Array.isArray(input.declared_stage_ids)
    || input.declared_stage_ids.length === 0
    || input.declared_stage_ids.some((stageId) => typeof stageId !== 'string' || !stageId.trim())
    || !input.declared_stage_ids.includes(input.stage_id)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun route transport requires the current Stage and every target to use declared Stage ids.',
      { stage_id: input.stage_id, declared_stage_ids: input.declared_stage_ids },
    );
  }
  const roleKeys = Object.keys(input.role_prompt_refs ?? {}).sort();
  const expectedRoleKeys = ['producer', 're_reviewer', 'repairer', 'reviewer'];
  if (JSON.stringify(roleKeys) !== JSON.stringify(expectedRoleKeys)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun role_prompt_refs must use only the bounded Framework Attempt roles.',
      { expected_roles: expectedRoleKeys, received_roles: roleKeys },
    );
  }
  if (Object.values(input.role_prompt_refs).some((ref) => typeof ref !== 'string' || !ref.trim())) {
    throw new FrameworkContractError('contract_shape_invalid', 'StageRun role prompt refs must be non-empty.');
  }
  if (!Array.isArray(input.quality_rubric_refs) || input.quality_rubric_refs.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'StageRun quality controller requires quality rubric refs.');
  }
  if (input.stage_role === 'cross_stage_meta_review' && input.quality_policy.formal_review.required) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Cross-stage Meta Review Stage cannot recursively require formal Stage Review.',
    );
  }
  const maxRepairRounds = input.quality_policy?.formal_review?.max_repair_rounds;
  if (!Number.isInteger(maxRepairRounds) || maxRepairRounds < 0 || maxRepairRounds > 3) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun quality repair budget must be an integer between zero and three.',
      { max_repair_rounds: maxRepairRounds },
    );
  }
  validateStageRunImmutableSpecEnvelope({
    spec,
    domainId: input.domain_id,
    stageId: input.stage_id,
    actionId: input.action_id,
    taskId: input.task_id,
    workspaceLocator: input.workspace_locator,
    stageManifestRef: input.stage_manifest_ref,
    stageManifestSha256: input.stage_manifest_sha256,
    qualityPolicyRef: input.quality_policy_ref,
    qualityPolicy: input.quality_policy as unknown as Record<string, unknown>,
    stagePacketRef: input.stage_packet_ref,
    checkpointRefs: input.checkpoint_refs,
    sourceFingerprint: input.source_fingerprint,
    sourceRefs: input.source_refs,
    artifactRefs: input.artifact_refs,
    artifactHashes: input.artifact_hashes,
    artifactIdentityReceiptRefs: input.artifact_identity_receipt_refs,
    rolePromptRefs: input.role_prompt_refs,
    qualityRubricRefs: input.quality_rubric_refs,
    stageGoalRefs: input.stage_goal_refs,
    lineageRefs: input.lineage_refs,
    executorKind: input.executor_kind,
    stageAttemptExecutorPolicy: input.stage_attempt_executor_policy,
    parentRouteDecisionRef: input.parent_route_decision_ref,
  });
  const expectedSpecSha256 = stageRunSpecSha256(spec);
  if (input.stage_run_spec_sha256 !== expectedSpecSha256) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun immutable spec digest does not match the exact canonical spec.',
      {
        failure_code: 'stage_run_spec_digest_mismatch',
        stage_run_id: input.stage_run_id,
        expected_stage_run_spec_sha256: expectedSpecSha256,
        received_stage_run_spec_sha256: input.stage_run_spec_sha256,
      },
    );
  }
  if (!spec.package_closure) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Pack-bound StageRun launch requires an immutable package dependency closure.',
      {
        failure_code: 'stage_run_package_closure_missing',
        stage_run_id: input.stage_run_id,
      },
    );
  }
  if (options.revalidateContent !== false) {
    revalidateStageRunImmutableSpecContent({
      spec,
      domainPackRoot: input.domain_pack_root,
      workspaceLocator: input.workspace_locator,
      skipManagedPackBytes: options.revalidateContent === 'historical_evidence',
    });
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
