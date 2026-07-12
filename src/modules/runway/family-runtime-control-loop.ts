import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  inspectSelectedFamilyRuntimeProvidersWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import { readManagedProviderProjectionSummary } from './family-runtime-managed-provider-projection.ts';
import {
  buildQueueTemporalLifecycleBoundary,
  familyRuntimePaths,
  queueSummary,
} from './family-runtime-store.ts';
import { stageAttemptSummary } from './family-runtime-stage-attempts.ts';
import { runTemporalSchedulerCadenceCommand } from './family-runtime-scheduler.ts';
import { buildTemporalFirstRuntimeContract } from './family-runtime-temporal.ts';
import {
  inspectTemporalWorkerRestartGuardForLifecycle,
  type WorkerRestartGuard,
} from './family-runtime-provider-worker-repair.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';

type FamilyRuntimePaths = ReturnType<typeof familyRuntimePaths>;
type RunwayRepairAction = {
  action_id: string;
  owner: string;
  reason: string;
  command: string;
  mutation: boolean;
  blocks_runtime_execution: boolean;
  blocks_domain_progress_claim: boolean;
  queue_role?: string;
  queue_policy?: string;
  repairable_attempt_count?: number;
  blocked_attempt_count?: number;
  failed_attempt_count?: number;
};

type StageAttemptRepairBreakdownEntry = {
  status: string;
  reason: string;
  attempt_count: number;
  stage_id?: string;
};

type StageAttemptSummary = {
  total: number;
  by_status: Record<string, number>;
  repair_breakdown?: {
    sample_limit: number;
    by_status_reason: StageAttemptRepairBreakdownEntry[];
    by_status_stage_reason: StageAttemptRepairBreakdownEntry[];
  };
};

const FALSE_AUTHORITY_BOUNDARY = {
  can_execute_domain_action: false,
  can_write_domain_truth: false,
  can_write_domain_memory_body: false,
  can_mutate_artifact_body: false,
  can_sign_owner_receipt: false,
  can_create_typed_blocker: false,
  can_authorize_domain_ready: false,
  can_authorize_quality_verdict: false,
  can_authorize_export_verdict: false,
  provider_completion_is_domain_ready: false,
} as const;

const BLOCKED_ATTEMPT_REPAIR_COMMAND = 'opl family-runtime attempt list --status blocked --json';
const FAILED_ATTEMPT_REPAIR_COMMAND = 'opl family-runtime attempt list --status failed --json';
const ATTEMPT_CLASSIFICATION_ACTION_ID = 'classify_attempts_before_redrive';
const ATTEMPT_DIAGNOSTIC_QUEUE_ROLE = 'runtime_diagnostic_queue_not_stage_decision_authority';
const ATTEMPT_DIAGNOSTIC_QUEUE_POLICY = 'classify_before_redrive';

function readinessStatus(input: {
  providerReady: boolean;
  schedulerStatus: string | null;
  queueTotal: number;
  attemptTotal: number;
}) {
  if (!input.providerReady) {
    return 'blocked_provider_not_ready';
  }
  if (input.schedulerStatus === 'attention_required' || input.schedulerStatus === 'blocked_provider_not_ready') {
    return 'attention_required';
  }
  if (input.attemptTotal > 0) {
    return 'active_or_queued';
  }
  return 'idle_ready';
}

function countStatus(summary: { by_status: Record<string, number> }, statuses: string[]) {
  return statuses.reduce((total, status) => total + (summary.by_status[status] ?? 0), 0);
}

function schedulerNeedsRepair(status: string | null) {
  return status === 'attention_required' || status === 'blocked_provider_not_ready';
}

function buildAttemptRepairQueue(attempts: StageAttemptSummary) {
  const blockedAttemptCount = countStatus(attempts, ['blocked']);
  const failedAttemptCount = countStatus(attempts, ['failed']);
  const diagnosticAttemptCount = blockedAttemptCount + failedAttemptCount;
  const currentAttemptCount = countStatus(attempts, ['queued', 'running', 'checkpointed', 'human_gate']);
  const retiredAttemptCount = countStatus(attempts, ['completed', 'dead_lettered']);
  const items = [
    blockedAttemptCount > 0
      ? {
        status: 'blocked',
        attempt_count: blockedAttemptCount,
        reason: 'blocked_stage_attempts_require_owner_answer_typed_blocker_or_route_back_review',
        command: BLOCKED_ATTEMPT_REPAIR_COMMAND,
        mutation: false,
        queue_role: ATTEMPT_DIAGNOSTIC_QUEUE_ROLE,
        diagnostic_layer: 'stale',
        blocks_runtime_execution: false,
        blocks_domain_progress_claim: false,
      }
      : null,
    failedAttemptCount > 0
      ? {
        status: 'failed',
        attempt_count: failedAttemptCount,
        reason: 'failed_stage_attempts_require_failure_review_before_redrive_or_owner_escalation',
        command: FAILED_ATTEMPT_REPAIR_COMMAND,
        mutation: false,
        queue_role: ATTEMPT_DIAGNOSTIC_QUEUE_ROLE,
        diagnostic_layer: 'stale',
        blocks_runtime_execution: false,
        blocks_domain_progress_claim: false,
      }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    surface_kind: 'opl_runway_runtime_diagnostic_queue',
    queue_role: ATTEMPT_DIAGNOSTIC_QUEUE_ROLE,
    queue_policy: ATTEMPT_DIAGNOSTIC_QUEUE_POLICY,
    repair_policy: 'classify_before_redrive_runtime_diagnostic_only',
    summary: {
      total_attempt_count: attempts.total,
      current_attempt_count: currentAttemptCount,
      stale_attempt_count: diagnosticAttemptCount,
      retired_attempt_count: retiredAttemptCount,
      diagnostic_attempt_count: diagnosticAttemptCount,
      repairable_attempt_count: diagnosticAttemptCount,
      blocked_attempt_count: blockedAttemptCount,
      failed_attempt_count: failedAttemptCount,
      closeout_format_repair_attempt_count: 0,
      next_stage_decision_authority: false,
      runtime_control_authority: false,
    },
    layers: {
      current: {
        attempt_count: currentAttemptCount,
        status_set: ['queued', 'running', 'checkpointed', 'human_gate'],
        role: 'runtime_observation_only',
      },
      stale: {
        attempt_count: diagnosticAttemptCount,
        status_set: ['blocked', 'failed'],
        role: 'historical_backlog_classify_before_redrive',
      },
      retired: {
        attempt_count: retiredAttemptCount,
        status_set: ['completed', 'dead_lettered'],
        role: 'terminal_attempt_projection_only',
      },
      diagnostic: {
        attempt_count: diagnosticAttemptCount,
        status_set: ['blocked', 'failed'],
        role: ATTEMPT_DIAGNOSTIC_QUEUE_ROLE,
      },
    },
    breakdown: attempts.repair_breakdown ?? {
      sample_limit: 0,
      by_status_reason: [],
      by_status_stage_reason: [],
    },
    default_repair_command: items[0]?.command ?? null,
    items,
    authority_boundary: FALSE_AUTHORITY_BOUNDARY,
  };
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function workerRepairActionId(workerReadiness: Record<string, unknown> | null) {
  const repairAction = recordValue(workerReadiness?.repair_action);
  return stringValue(repairAction?.action_id);
}

function buildWorkerRestartGuardProjection(input: {
  paths: FamilyRuntimePaths;
  workerReadiness: unknown;
  degradedReason: string | null;
}) {
  const workerReadiness = recordValue(input.workerReadiness);
  if (!workerReadiness) {
    return null;
  }
  if (input.degradedReason !== 'temporal_worker_source_stale'
    && stringValue(workerReadiness.lifecycle_status) !== 'worker_source_stale'
    && stringValue(workerReadiness.readiness_status) !== 'worker_source_stale') {
    return null;
  }
  if (workerRepairActionId(workerReadiness) !== 'restart_temporal_worker') {
    return null;
  }
  return inspectTemporalWorkerRestartGuardForLifecycle(
    input.paths,
    workerReadiness as Parameters<typeof inspectTemporalWorkerRestartGuardForLifecycle>[1],
  );
}

function buildNextSafeAction(input: {
  status: string;
  providerReady: boolean;
  schedulerStatus: string | null;
  queueLifecycleBoundary: ReturnType<typeof buildQueueTemporalLifecycleBoundary>;
  queue: { total: number; by_status: Record<string, number> };
  attempts: { total: number; by_status: Record<string, number> };
}) {
  if (!input.providerReady) {
    return {
      action_id: 'repair_provider_liveness',
      owner: 'opl_provider_runtime_manager',
      reason: 'temporal_provider_not_ready',
      command: 'opl family-runtime repair --provider temporal --json',
      mutation: true,
      blocks_runtime_execution: true,
      blocks_domain_progress_claim: true,
    };
  }

  if (schedulerNeedsRepair(input.schedulerStatus)) {
    return {
      action_id: 'repair_provider_liveness',
      owner: 'opl_provider_runtime_manager',
      reason: 'temporal_scheduler_cadence_not_ready',
      command: 'opl family-runtime scheduler install --provider temporal --json',
      mutation: true,
      blocks_runtime_execution: true,
      blocks_domain_progress_claim: true,
    };
  }

  const activeAttemptCount = countStatus(input.attempts, ['created', 'starting', 'running', 'cancel_requested']);
  if (activeAttemptCount > 0) {
    return {
      action_id: 'resume',
      owner: 'opl_runway',
      reason: 'active_stage_attempts_need_observation_or_resume',
      command: 'opl family-runtime attempt list --json',
      mutation: false,
      active_attempt_count: activeAttemptCount,
      blocks_runtime_execution: false,
      blocks_domain_progress_claim: true,
    };
  }

  const repairableAttemptCount = countStatus(input.attempts, ['blocked', 'failed']);
  if (repairableAttemptCount > 0) {
    const blockedAttemptCount = countStatus(input.attempts, ['blocked']);
    const failedAttemptCount = countStatus(input.attempts, ['failed']);
    return {
      action_id: ATTEMPT_CLASSIFICATION_ACTION_ID,
      owner: 'opl_runway',
      reason: 'blocked_or_failed_stage_attempts_need_repair_classification',
      command: blockedAttemptCount > 0
        ? BLOCKED_ATTEMPT_REPAIR_COMMAND
        : FAILED_ATTEMPT_REPAIR_COMMAND,
      mutation: false,
      repairable_attempt_count: repairableAttemptCount,
      blocked_attempt_count: blockedAttemptCount,
      failed_attempt_count: failedAttemptCount,
      queue_role: ATTEMPT_DIAGNOSTIC_QUEUE_ROLE,
      queue_policy: ATTEMPT_DIAGNOSTIC_QUEUE_POLICY,
      blocks_runtime_execution: false,
      blocks_domain_progress_claim: false,
    };
  }

  return {
    action_id: 'no_safe_action',
    owner: 'codex_cli_or_domain_owner',
    reason: input.status === 'idle_ready'
      ? 'runtime_idle_waiting_for_current_owner_delta'
      : 'no_control_loop_action_selected',
    command: 'opl runway handoff-gates --json',
    mutation: false,
    blocks_runtime_execution: false,
    blocks_domain_progress_claim: false,
  };
}

export async function buildFamilyRuntimeControlLoopStatus(
  db: DatabaseSync,
  paths: FamilyRuntimePaths,
  requestedProvider?: FamilyRuntimeProviderKind,
) {
  const providerKind = resolveFamilyRuntimeProviderKind(requestedProvider);
  if (providerKind !== 'temporal') {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime control-loop status supports only --provider temporal.', {
      provider_kind: providerKind,
      allowed_provider_kinds: ['temporal'],
    });
  }

  const providerRuntime = await inspectSelectedFamilyRuntimeProvidersWithLifecycle({
    requestedProvider: providerKind,
    paths,
    options: {
      managedProviderProjection: readManagedProviderProjectionSummary(),
    },
  });
  const selected = providerRuntime.provider;
  const scheduler = await runTemporalSchedulerCadenceCommand(db, paths, {
    mode: 'scheduler_status',
    providerKind,
  });
  const schedulerRecord = scheduler as Record<string, unknown>;
  const schedulerAction = schedulerRecord.action && typeof schedulerRecord.action === 'object'
    ? schedulerRecord.action as Record<string, unknown>
    : null;
  const queue = queueSummary(db);
  const queueLifecycleBoundary = buildQueueTemporalLifecycleBoundary(db, providerKind);
  const attempts = stageAttemptSummary(db);
  const status = readinessStatus({
    providerReady: selected.ready,
    schedulerStatus: typeof scheduler.status === 'string' ? scheduler.status : null,
    queueTotal: queue.total,
    attemptTotal: attempts.total,
  });
  const schedulerStatus = typeof scheduler.status === 'string' ? scheduler.status : null;
  const workerRestartGuard = buildWorkerRestartGuardProjection({
    paths,
    workerReadiness: selected.details.worker_readiness,
    degradedReason: selected.degraded_reason,
  });
  const nextSafeAction = buildNextSafeAction({
    status,
    providerReady: selected.ready,
    schedulerStatus,
    queueLifecycleBoundary,
    queue,
    attempts,
  });

  return {
    surface_kind: 'opl_family_runtime_control_loop_status',
    module_id: 'runway',
    brand_name: 'OPL Runway',
    provider_kind: providerKind,
    control_loop_status: status,
    loop_model: {
      process_loop: {
        owner: 'opl_provider_runtime_manager',
        purpose: 'keep Temporal service, worker process, and scheduler cadence observable and repairable',
        provider_worker_supervisor_command: 'opl family-runtime provider-worker supervisor status --provider temporal',
        worker_status_command: 'opl family-runtime worker status --provider temporal',
        scheduler_status_command: 'opl family-runtime scheduler status --provider temporal',
      },
      execution_loop: {
        owner: 'opl_runway',
        purpose: 'observe, resume, repair, and reconcile provider-backed stage attempts',
        attempt_command: 'opl family-runtime attempt list --json',
        provider_slo_tick_command: 'opl family-runtime provider-slo tick --provider temporal',
      },
      semantic_loop: {
        owner: 'codex_cli_and_domain_owner',
        purpose: 'derive next current_owner_delta from owner answer, typed blocker, human gate, route-back evidence, or provider hard gate',
        default_read_root: 'current_owner_delta',
        progress_reconciler_role: 'desired_current_reconciliation_only',
        can_generate_domain_owner_answer: false,
      },
    },
    desired_current_reconciliation: {
      reconciler_id: 'runway_progress_reconciler',
      desired_state_ref: 'current_owner_delta',
      current_state_refs: [
        'stage_attempt_index',
        'temporal_workflow_visibility',
        'stage_attempt_ledger',
        'provider_worker_lifecycle',
        'scheduler_cadence',
      ],
      allowed_next_actions: [
        'resume',
        ATTEMPT_CLASSIFICATION_ACTION_ID,
        'repair_provider_liveness',
        'escalate_typed_blocker',
        'wait_for_owner_answer',
        'no_safe_action',
      ],
      selected_next_safe_action: nextSafeAction,
      forbidden_next_actions: [
        'write_domain_truth',
        'sign_owner_receipt',
        'create_domain_typed_blocker',
        'authorize_quality_verdict',
        'claim_domain_ready',
      ],
    },
    provider_runtime: {
      substrate: 'temporal',
      selected_provider: providerRuntime.selectedProvider,
      selected_ready: selected.ready,
      selected_status: selected.status,
      degraded_reason: selected.degraded_reason ?? null,
      runtime_dependency: selected.details.runtime_dependency ?? null,
      sqlite_sidecar_role: 'projection_and_readback_index_only',
      live_workflow_execution_ready: selected.ready
        && !schedulerNeedsRepair(schedulerStatus),
      temporal_first_runtime_contract: buildTemporalFirstRuntimeContract(),
    },
    worker_supervisor_liveness: {
      substrate: 'temporal_worker_supervisor',
      role: 'process_liveness_restart_and_host_health_only',
      status_command: 'opl family-runtime provider-worker supervisor status --provider temporal',
      worker_status_command: 'opl family-runtime worker status --provider temporal',
      provider_completion_is_semantic_progress: false,
    },
    scheduler_cadence: {
      substrate: 'temporal_scheduler',
      status: scheduler.status,
      schedule_id: schedulerAction && typeof schedulerAction.schedule_id === 'string'
        ? schedulerAction.schedule_id
        : null,
      health: schedulerRecord.health ?? null,
      repair_action: schedulerRecord.repair_action ?? null,
    },
    semantic_loop: {
      progress_reconciler_id: 'runway_progress_reconciler',
      role: 'semantic_execution_loop_desired_current_reconciliation_and_next_owner_projection',
      default_read_root: 'current_owner_delta',
      provider_completion_is_semantic_progress: false,
      can_generate_domain_owner_answer: false,
      selected_next_safe_action: nextSafeAction,
    },
    readiness: {
      readiness_status: status,
      provider_backed_runtime_ready: selected.ready,
      scheduler_cadence_ready: !schedulerNeedsRepair(schedulerStatus),
      live_workflow_execution_ready: selected.ready
        && !schedulerNeedsRepair(schedulerStatus),
      domain_progress_claim_ready: false,
      production_l5_ready: false,
      next_safe_action: nextSafeAction,
    },
    queue,
    queue_lifecycle_boundary: queueLifecycleBoundary,
    stage_attempts: attempts,
    handoff_gate: {
      accepted_owner_answer_refs: [
        'domain_owner_receipt_ref',
        'quality_gate_receipt_ref',
        'typed_blocker_ref',
        'human_gate_ref',
        'route_back_evidence_ref',
        'raw_stage_artifact_ref',
      ],
      handoff_policy: 'any_readable_artifact_advances_framework_derives_refs_only_envelope',
      provider_completion_is_owner_answer: false,
      gate_status: attempts.total > 0 || queue.total > 0
        ? 'owner_answer_required_after_runtime_observation'
        : 'idle_waiting_for_current_owner_delta_or_owner_answer',
    },
    recovery_repair: {
      repair_policy: 'classify_before_repair',
      repair_classes: [
        'worker_not_ready',
        'worker_source_stale',
        'scheduler_not_installed',
        'workflow_stale',
        'queue_missing_current_owner_delta',
        'receipt_invalid',
        'domain_owner_blocked',
      ],
      default_repair_command: status === 'blocked_provider_not_ready'
        ? 'opl family-runtime repair --provider temporal'
        : null,
      selected_repair_action: nextSafeAction.action_id === 'repair_provider_liveness'
        || nextSafeAction.action_id === ATTEMPT_CLASSIFICATION_ACTION_ID
        ? nextSafeAction
        : null,
      worker_restart_guard: workerRestartGuard,
    },
    authority_boundary: FALSE_AUTHORITY_BOUNDARY,
  };
}

type FamilyRuntimeControlLoopStatus = Awaited<ReturnType<typeof buildFamilyRuntimeControlLoopStatus>>;

function selectedRepairActionWithAttemptQueue(input: {
  selectedRepairAction: FamilyRuntimeControlLoopStatus['recovery_repair']['selected_repair_action'];
  attemptRepairQueue: ReturnType<typeof buildAttemptRepairQueue>;
}): RunwayRepairAction | null {
  if (!input.selectedRepairAction) {
    return null;
  }
  const selectedRepairRecord = recordValue(input.selectedRepairAction);
  const repairAction: RunwayRepairAction = {
    action_id: input.selectedRepairAction.action_id,
    owner: input.selectedRepairAction.owner,
    reason: input.selectedRepairAction.reason,
    command: input.selectedRepairAction.command,
    mutation: input.selectedRepairAction.mutation,
    blocks_runtime_execution: input.selectedRepairAction.blocks_runtime_execution,
    blocks_domain_progress_claim: input.selectedRepairAction.blocks_domain_progress_claim,
  };
  const queueRole = stringValue(selectedRepairRecord?.queue_role);
  if (queueRole) {
    repairAction.queue_role = queueRole;
  }
  const queuePolicy = stringValue(selectedRepairRecord?.queue_policy);
  if (queuePolicy) {
    repairAction.queue_policy = queuePolicy;
  }
  if (repairAction.action_id === ATTEMPT_CLASSIFICATION_ACTION_ID) {
    repairAction.queue_role = input.attemptRepairQueue.queue_role;
    repairAction.queue_policy = input.attemptRepairQueue.queue_policy;
  }
  if (typeof input.selectedRepairAction.repairable_attempt_count === 'number') {
    repairAction.repairable_attempt_count = input.selectedRepairAction.repairable_attempt_count;
  }
  if (typeof input.selectedRepairAction.blocked_attempt_count === 'number') {
    repairAction.blocked_attempt_count = input.selectedRepairAction.blocked_attempt_count;
  }
  if (typeof input.selectedRepairAction.failed_attempt_count === 'number') {
    repairAction.failed_attempt_count = input.selectedRepairAction.failed_attempt_count;
  }
  if (repairAction.action_id !== ATTEMPT_CLASSIFICATION_ACTION_ID || !input.attemptRepairQueue.default_repair_command) {
    return repairAction;
  }
  return {
    ...repairAction,
    command: input.attemptRepairQueue.default_repair_command,
    repairable_attempt_count: input.attemptRepairQueue.summary.repairable_attempt_count,
    blocked_attempt_count: input.attemptRepairQueue.summary.blocked_attempt_count,
    failed_attempt_count: input.attemptRepairQueue.summary.failed_attempt_count,
  };
}

function recoveryRepairStatus(input: {
  selectedRepairAction: RunwayRepairAction | null;
  workerRestartGuard?: WorkerRestartGuard | null;
}) {
  if (input.workerRestartGuard?.guard_status === 'blocked') {
    return 'repair_blocked_by_worker_restart_guard';
  }
  if (input.selectedRepairAction?.action_id === ATTEMPT_CLASSIFICATION_ACTION_ID) {
    return 'runtime_diagnostic_queue';
  }
  if (input.selectedRepairAction) {
    return 'repair_action_available';
  }
  return 'no_repair_action_selected';
}

export function buildRunwayReadinessProjection(controlLoop: FamilyRuntimeControlLoopStatus) {
  return {
    surface_kind: 'opl_runway_readiness',
    module_id: 'runway',
    brand_name: 'OPL Runway',
    readiness_status: controlLoop.readiness.readiness_status,
    provider_backed_runtime_ready: controlLoop.readiness.provider_backed_runtime_ready,
    scheduler_cadence_ready: controlLoop.readiness.scheduler_cadence_ready,
    live_workflow_execution_ready: controlLoop.readiness.live_workflow_execution_ready,
    next_safe_action: controlLoop.readiness.next_safe_action,
    queue: controlLoop.queue,
    queue_lifecycle_boundary: controlLoop.queue_lifecycle_boundary,
    stage_attempts: controlLoop.stage_attempts,
    provider_runtime: controlLoop.provider_runtime,
    worker_supervisor_liveness: controlLoop.worker_supervisor_liveness,
    scheduler_cadence: controlLoop.scheduler_cadence,
    not_claims: [
      'domain_ready',
      'quality_verdict',
      'artifact_authority',
      'production_long_soak_complete',
      'provider_completion_is_semantic_progress',
    ],
    authority_boundary: controlLoop.authority_boundary,
  };
}

export function buildRunwayReconcileProjection(controlLoop: FamilyRuntimeControlLoopStatus) {
  return {
    surface_kind: 'opl_runway_reconcile',
    module_id: 'runway',
    brand_name: 'OPL Runway',
    reconciliation_status: controlLoop.control_loop_status,
    reconciler_id: controlLoop.desired_current_reconciliation.reconciler_id,
    desired_state_ref: controlLoop.desired_current_reconciliation.desired_state_ref,
    current_state_refs: controlLoop.desired_current_reconciliation.current_state_refs,
    selected_next_safe_action: controlLoop.desired_current_reconciliation.selected_next_safe_action,
    observed_state: {
      provider_ready: controlLoop.provider_runtime.selected_ready,
      scheduler_status: controlLoop.scheduler_cadence.status,
      queue: controlLoop.queue,
      queue_lifecycle_boundary: controlLoop.queue_lifecycle_boundary,
      stage_attempts: controlLoop.stage_attempts,
    },
    reconcile_policy: 'read_only_desired_current_projection',
    mutation_performed: false,
    apply_command: controlLoop.desired_current_reconciliation.selected_next_safe_action.mutation
      ? controlLoop.desired_current_reconciliation.selected_next_safe_action.command
      : null,
    forbidden_next_actions: controlLoop.desired_current_reconciliation.forbidden_next_actions,
    authority_boundary: controlLoop.authority_boundary,
  };
}

export function buildRunwayHandoffGatesProjection(controlLoop: FamilyRuntimeControlLoopStatus) {
  return {
    surface_kind: 'opl_runway_handoff_gates',
    module_id: 'runway',
    brand_name: 'OPL Runway',
    gate_status: controlLoop.handoff_gate.gate_status,
    handoff_policy: controlLoop.handoff_gate.handoff_policy,
    accepted_owner_answer_refs: controlLoop.handoff_gate.accepted_owner_answer_refs,
    provider_completion_is_owner_answer: controlLoop.handoff_gate.provider_completion_is_owner_answer,
    provider_completion_is_semantic_progress: controlLoop.semantic_loop.provider_completion_is_semantic_progress,
    next_safe_action: controlLoop.semantic_loop.selected_next_safe_action,
    route_back_policy: 'domain_owner_receipt_quality_gate_typed_blocker_human_gate_or_route_back_ref_required',
    authority_boundary: controlLoop.authority_boundary,
  };
}

export function buildRunwayRecoveryRepairProjection(controlLoop: FamilyRuntimeControlLoopStatus) {
  const workerRestartGuard = controlLoop.recovery_repair.worker_restart_guard ?? null;
  const attemptRepairQueue = buildAttemptRepairQueue(controlLoop.stage_attempts);
  const selectedRepairAction = selectedRepairActionWithAttemptQueue({
    selectedRepairAction: controlLoop.recovery_repair.selected_repair_action,
    attemptRepairQueue,
  });
  return {
    surface_kind: 'opl_runway_recovery_repair',
    module_id: 'runway',
    brand_name: 'OPL Runway',
    repair_status: recoveryRepairStatus({
      selectedRepairAction,
      workerRestartGuard,
    }),
    repair_policy: controlLoop.recovery_repair.repair_policy,
    repair_classes: controlLoop.recovery_repair.repair_classes,
    selected_repair_action: selectedRepairAction,
    default_repair_command: controlLoop.recovery_repair.default_repair_command
      ?? (selectedRepairAction?.action_id === ATTEMPT_CLASSIFICATION_ACTION_ID ? attemptRepairQueue.default_repair_command : null),
    attempt_repair_queue: attemptRepairQueue,
    worker_restart_guard: workerRestartGuard,
    repair_blocker_ids: workerRestartGuard?.blocker_ids ?? [],
    repair_can_mutate_worker: workerRestartGuard
      ? workerRestartGuard.guard_status === 'ready'
      : selectedRepairAction?.mutation === true,
    provider_runtime: controlLoop.provider_runtime,
    scheduler_cadence: controlLoop.scheduler_cadence,
    queue: controlLoop.queue,
    stage_attempts: controlLoop.stage_attempts,
    authority_boundary: controlLoop.authority_boundary,
  };
}
