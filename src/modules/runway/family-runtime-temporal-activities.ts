import { Context, heartbeat } from '@temporalio/activity';

import { isRecord } from '../../kernel/contract-validation.ts';
import type { TemporalStageAttemptWorkflowInput } from './family-runtime-temporal.ts';
import {
  DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS,
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
} from './family-runtime-temporal-constants.ts';
import { runTemporalProviderCadenceReadback } from './family-runtime-scheduler.ts';
import { openQueueDb } from './family-runtime-store.ts';
import {
  recordStageAttemptActivityHeartbeat,
} from './family-runtime-stage-attempts.ts';
import {
  normalizeTypedStageCloseoutPacket,
  runAgentStageRunner,
} from './family-runtime-codex-stage-runner.ts';
import { codexActivityEventForTemporalHistory } from './family-runtime-temporal-history-summary.ts';
import { isRuntimeHardStopReason } from '../../kernel/progress-hard-stop-policy.ts';

function closeoutPacketFromRunnerReceipt(receipt: Record<string, unknown>) {
  if (isRecord(receipt.closeout_packet)) {
    return receipt.closeout_packet;
  }
  const agentReceipt = isRecord(receipt.agent_execution_receipt)
    ? receipt.agent_execution_receipt
    : null;
  return isRecord(agentReceipt?.closeout_packet) ? agentReceipt.closeout_packet : null;
}

function readStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry));
}

function readString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function compactStringList(value: unknown, maxEntries = 12, maxChars = 240) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, maxEntries)
    .map((entry) => (entry.length > maxChars ? `${entry.slice(0, maxChars)}...[omitted:${entry.length} chars]` : entry));
}

function compactDomainStageLogForRouteImpact(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  return {
    ...(readString(value.surface_kind) ? { surface_kind: readString(value.surface_kind) } : {}),
    ...(readString(value.semantic_status) ? { semantic_status: readString(value.semantic_status) } : {}),
    ...(readString(value.semantic_source) ? { semantic_source: readString(value.semantic_source) } : {}),
    ...(readString(value.stage_name) ? { stage_name: readString(value.stage_name) } : {}),
    ...(readString(value.problem_summary) ? { problem_summary: readString(value.problem_summary) } : {}),
    ...(readString(value.stage_goal) ? { stage_goal: readString(value.stage_goal) } : {}),
    ...(readString(value.progress_delta_classification)
      ? { progress_delta_classification: readString(value.progress_delta_classification) }
      : {}),
    ...(isRecord(value.deliverable_progress_delta)
      ? { deliverable_progress_delta: value.deliverable_progress_delta }
      : {}),
    ...(isRecord(value.platform_repair_delta)
      ? { platform_repair_delta: value.platform_repair_delta }
      : {}),
    ...(readString(value.next_forced_delta) ? { next_forced_delta: readString(value.next_forced_delta) } : {}),
    ...(readString(value.outcome) ? { outcome: readString(value.outcome) } : {}),
    ...(compactStringList(value.stage_work_done).length > 0
      ? { stage_work_done: compactStringList(value.stage_work_done) }
      : {}),
    ...(compactStringList(value.changed_stage_surfaces).length > 0
      ? { changed_stage_surfaces: compactStringList(value.changed_stage_surfaces) }
      : {}),
    ...(compactStringList(value.remaining_blockers).length > 0
      ? { remaining_blockers: compactStringList(value.remaining_blockers) }
      : {}),
    ...(compactStringList(value.evidence_refs).length > 0 ? { evidence_refs: compactStringList(value.evidence_refs) } : {}),
  };
}

function closeoutRouteImpactForTemporalResult(
  closeout: ReturnType<typeof normalizeTypedStageCloseoutPacket>,
) {
  const routeImpact = closeout.route_impact ? { ...closeout.route_impact } : {};
  if (!isRecord(routeImpact.user_stage_log) && isRecord(closeout.user_stage_log)) {
    routeImpact.user_stage_log = compactDomainStageLogForRouteImpact(closeout.user_stage_log) ?? closeout.user_stage_log;
  }
  if (!isRecord(routeImpact.stage_log_summary) && isRecord(closeout.stage_log_summary)) {
    routeImpact.stage_log_summary = compactDomainStageLogForRouteImpact(closeout.stage_log_summary)
      ?? closeout.stage_log_summary;
  }
  if (!isRecord(routeImpact.human_stage_log) && isRecord(closeout.human_stage_log)) {
    routeImpact.human_stage_log = compactDomainStageLogForRouteImpact(closeout.human_stage_log)
      ?? closeout.human_stage_log;
  }
  return routeImpact;
}

function compactAuthorityBoundaryForTemporalResult(value: unknown) {
  const authority = isRecord(value) ? value : {};
  return {
    opl: readString(authority.opl),
    domain: readString(authority.domain),
    can_install_domain_daemon: readBoolean(authority.can_install_domain_daemon),
    can_write_domain_truth: readBoolean(authority.can_write_domain_truth),
    can_write_domain_memory_body: readBoolean(authority.can_write_domain_memory_body),
    can_create_domain_owner_receipt: readBoolean(authority.can_create_domain_owner_receipt),
    can_create_domain_typed_blocker: readBoolean(authority.can_create_domain_typed_blocker),
    can_execute_domain_action_without_queue_claim:
      readBoolean(authority.can_execute_domain_action_without_queue_claim),
    can_authorize_lifecycle_progress: readBoolean(authority.can_authorize_lifecycle_progress),
    can_authorize_domain_ready: readBoolean(authority.can_authorize_domain_ready),
    can_authorize_quality_verdict: readBoolean(authority.can_authorize_quality_verdict),
    can_authorize_export_verdict: readBoolean(authority.can_authorize_export_verdict),
    can_authorize_artifact_export: readBoolean(authority.can_authorize_artifact_export),
    can_execute_domain_repair: readBoolean(authority.can_execute_domain_repair),
    provider_completion_is_domain_ready: readBoolean(authority.provider_completion_is_domain_ready),
  };
}

export function compactCloseoutPacketForTemporalResult(value: unknown) {
  let closeout: ReturnType<typeof normalizeTypedStageCloseoutPacket>;
  try {
    closeout = normalizeTypedStageCloseoutPacket(value);
  } catch {
    return null;
  }

  const routeImpact = closeoutRouteImpactForTemporalResult(closeout);
  return {
    surface_kind: closeout.surface_kind,
    ...(closeout.stage_attempt_id ? { stage_attempt_id: closeout.stage_attempt_id } : {}),
    ...(closeout.idempotency_key ? { idempotency_key: closeout.idempotency_key } : {}),
    ...(closeout.closeout_id ? { closeout_id: closeout.closeout_id } : {}),
    closeout_refs: closeout.closeout_refs,
    ...(closeout.closeout_ref_metadata ? { closeout_ref_metadata: closeout.closeout_ref_metadata } : {}),
    consumed_refs: closeout.consumed_refs,
    consumed_memory_refs: closeout.consumed_memory_refs,
    writeback_receipt_refs: closeout.writeback_receipt_refs,
    rejected_writes: closeout.rejected_writes,
    ...(closeout.domain_output ? { domain_output: closeout.domain_output } : {}),
    ...(closeout.next_owner ? { next_owner: closeout.next_owner } : {}),
    ...(closeout.domain_ready_verdict ? { domain_ready_verdict: closeout.domain_ready_verdict } : {}),
    ...(Object.keys(routeImpact).length > 0 ? { route_impact: routeImpact } : {}),
    authority_boundary: closeout.authority_boundary,
    temporal_payload_policy: {
      surface_kind: 'temporal_activity_compacted_closeout_packet',
      full_closeout_body_omitted: true,
      retained_fields: [
        'surface_kind',
        'stage_attempt_id',
        'idempotency_key',
        'closeout_id',
        'closeout_refs',
        'closeout_ref_metadata',
        'consumed_refs',
        'consumed_memory_refs',
        'writeback_receipt_refs',
        'rejected_writes',
        'domain_output',
        'next_owner',
        'domain_ready_verdict',
        'route_impact',
        'authority_boundary',
      ],
      omitted_body_fields: [
        'user_stage_log',
        'stage_log_summary',
        'human_stage_log',
      ],
    },
  };
}

function providerRuntimeCloseoutReason(closeout: ReturnType<typeof normalizeTypedStageCloseoutPacket>) {
  const authorityBoundary = closeout.authority_boundary;
  if (readString(authorityBoundary.opl) !== 'provider_runtime_closeout_transport_only') {
    return null;
  }
  return readString(closeout.route_impact?.provider_blocker_reason)
    ?? readString(closeout.rejected_writes[0]?.reason)
    ?? 'codex_cli_typed_closeout_not_materialized';
}

function compactTaskScopeForTemporalResult(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const payloadMatches = Array.isArray(value.payloadMatches) ? value.payloadMatches : [];
  const compactScope = {
    domainId: readString(value.domainId) ?? readString(value.domain_id),
    taskKind: readString(value.taskKind) ?? readString(value.task_kind),
    payload_match_count: payloadMatches.length,
    payload_matches_omitted: payloadMatches.length > 0,
  };
  return compactScope.domainId || compactScope.taskKind || compactScope.payload_match_count > 0
    ? compactScope
    : null;
}

function compactSchedulerQueueTickForTemporalResult(value: unknown) {
  const queueTick = isRecord(value) ? value : {};
  const hydration = isRecord(queueTick.hydration) ? queueTick.hydration : null;
  const dispatches = Array.isArray(queueTick.dispatches) ? queueTick.dispatches : [];
  return {
    source: readString(queueTick.source),
    limit: readNumber(queueTick.limit),
    hydrate: readBoolean(queueTick.hydrate),
    status: readString(queueTick.status),
    dispatch_blocked_reason: readString(queueTick.dispatch_blocked_reason),
    selected_count: readNumber(queueTick.selected_count) ?? 0,
    filtered_count: readNumber(queueTick.filtered_count) ?? 0,
    dispatches_count: dispatches.length,
    dispatches_omitted: true,
    hydration: hydration
      ? {
          source: readString(hydration.source),
          enqueued_count: readNumber(hydration.enqueued_count) ?? 0,
          requeued_count: readNumber(hydration.requeued_count) ?? 0,
          idempotent_noop_count: readNumber(hydration.idempotent_noop_count) ?? 0,
          filtered_count: readNumber(hydration.filtered_count) ?? 0,
        }
      : null,
  };
}

function compactRepairActionForTemporalResult(value: unknown) {
  const repairAction = isRecord(value) ? value : {};
  return {
    action_id: readString(repairAction.action_id),
    repair_action_id: readString(repairAction.repair_action_id),
    next_command: readString(repairAction.next_command),
    command: readString(repairAction.command),
  };
}

function compactProviderReadinessAfterSloForTemporalResult(value: unknown) {
  const readiness = isRecord(value) ? value : {};
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];
  return {
    surface_kind: readString(readiness.surface_kind),
    provider_kind: readString(readiness.provider_kind),
    ready: readBoolean(readiness.ready),
    status: readString(readiness.status),
    degraded_reason: readString(readiness.degraded_reason),
    worker_lifecycle_status: readString(readiness.worker_lifecycle_status),
    worker_readiness_status: readString(readiness.worker_readiness_status),
    worker_ready: readBoolean(readiness.worker_ready),
    blocker_count: blockers.length,
    blocker_ids: blockers
      .filter(isRecord)
      .map((blocker) => readString(blocker.blocker_id))
      .filter((entry): entry is string => Boolean(entry)),
    blockers_omitted: blockers.length > 0,
    repair_action: compactRepairActionForTemporalResult(readiness.repair_action),
    authority_boundary: compactAuthorityBoundaryForTemporalResult(readiness.authority_boundary),
  };
}

function compactProviderBlockerForTemporalResult(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  return {
    blocker_kind: readString(value.blocker_kind),
    blocker_id: readString(value.blocker_id),
    next_repair_command: readString(value.next_repair_command),
    next_repair_action: compactRepairActionForTemporalResult(value.next_repair_action),
    worker_lifecycle_status: readString(value.worker_lifecycle_status),
    temporal_service_status: readString(value.temporal_service_status),
    temporal_server_reachable: readBoolean(value.temporal_server_reachable),
    liveness_blocker_first: readBoolean(value.liveness_blocker_first),
  };
}

function compactProviderSloForTemporalResult(value: unknown) {
  const providerSlo = isRecord(value) ? value : {};
  const receipt = isRecord(providerSlo.provider_slo_execution_receipt)
    ? providerSlo.provider_slo_execution_receipt
    : {};
  const workerRepair = isRecord(providerSlo.provider_worker_repair_receipt)
    ? providerSlo.provider_worker_repair_receipt
    : {};
  return {
    surface_id: readString(providerSlo.surface_id),
    provider_kind: readString(providerSlo.provider_kind),
    execution_status: readString(providerSlo.execution_status),
    skipped: readBoolean(providerSlo.skipped),
    event_id: readString(providerSlo.event_id),
    provider_slo_execution_receipt: {
      receipt_status: readString(receipt.receipt_status),
      execution_status: readString(receipt.execution_status),
      skip_reason: readString(receipt.skip_reason),
      receipt_kind: readString(receipt.receipt_kind),
    },
    provider_worker_repair_receipt: {
      repair_status: readString(workerRepair.repair_status),
      repair_action_id: readString(workerRepair.repair_action_id),
      command: readString(workerRepair.command),
      can_execute_domain_repair: readBoolean(workerRepair.can_execute_domain_repair),
    },
  };
}

function compactQueueProjectionBridgeForTemporalResult(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  return {
    surface_kind: readString(value.surface_kind),
    bridge_id: readString(value.bridge_id),
    provider_ready_after_slo: readBoolean(value.provider_ready_after_slo),
    bridge_status: readString(value.bridge_status),
    blocked_reason: readString(value.blocked_reason),
    trigger: readString(value.trigger),
    hydrated_pending_family_task_projection_count:
      readNumber(value.hydrated_pending_family_task_projection_count) ?? 0,
    hydration_idempotent_noop_projection_count:
      readNumber(value.hydration_idempotent_noop_projection_count) ?? 0,
    hydration_filtered_projection_count: readNumber(value.hydration_filtered_projection_count) ?? 0,
    selected_task_projection_count: readNumber(value.selected_task_projection_count) ?? 0,
    dispatch_projection_count: readNumber(value.dispatch_projection_count) ?? 0,
    scheduler_limit: readNumber(value.scheduler_limit),
    operator_audit_counts_only: readBoolean(value.operator_audit_counts_only),
    durable_lifecycle_truth: readBoolean(value.durable_lifecycle_truth),
    can_authorize_lifecycle_progress: readBoolean(value.can_authorize_lifecycle_progress),
    authority_boundary: compactAuthorityBoundaryForTemporalResult(value.authority_boundary),
  };
}

export function compactSchedulerTickForTemporalResult(value: unknown) {
  const tick = isRecord(value) ? value : {};
  const authorityBoundary = isRecord(tick.authority_boundary)
    ? tick.authority_boundary
    : {
        opl: 'temporal_provider_cadence_readback_only',
        domain: 'truth_quality_artifact_gate_owner',
      };
  return {
    surface_kind: 'temporal_scheduler_tick_activity_receipt',
    activity_kind: 'scheduler_tick_activity',
    activity_status: 'completed',
    provider_cadence_surface_kind: readString(tick.surface_kind),
    scheduler_owner: readString(tick.scheduler_owner),
    cadence_owner: readString(tick.cadence_owner),
    provider_kind: readString(tick.provider_kind),
    cadence_source: readString(tick.cadence_source),
    cadence_status: readString(tick.status),
    task_scope: compactTaskScopeForTemporalResult(tick.task_scope),
    provider_readiness_after_slo: compactProviderReadinessAfterSloForTemporalResult(
      tick.provider_readiness_after_slo,
    ),
    provider_liveness_blocker: compactProviderBlockerForTemporalResult(tick.provider_liveness_blocker),
    provider_blocker: compactProviderBlockerForTemporalResult(tick.provider_blocker),
    provider_slo_summary: compactProviderSloForTemporalResult(tick.provider_slo),
    queue_projection_bridge: compactQueueProjectionBridgeForTemporalResult(
      tick.queue_projection_bridge,
    ),
    retired_queue_tick: compactSchedulerQueueTickForTemporalResult(tick.retired_queue_tick),
    full_scheduler_tick_omitted: true,
    provider_runtime_after_slo_omitted: true,
    provider_slo_omitted: true,
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
      ...compactAuthorityBoundaryForTemporalResult(authorityBoundary),
      can_write_domain_truth: false,
      can_write_domain_memory_body: false,
      can_authorize_quality_verdict: false,
      can_authorize_export_verdict: false,
      provider_completion_is_domain_ready: false,
    },
    temporal_payload_policy: {
      surface_kind: 'temporal_activity_compacted_scheduler_tick',
      full_scheduler_tick_body_omitted: true,
      retained_fields: [
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
    },
  };
}

function recordActivityHeartbeat(input: {
  stageAttemptId: string;
  heartbeatKind: string;
  runnerEventKind?: string | null;
  checkpointRefs?: string[];
}) {
  try {
    const { db } = openQueueDb();
    try {
      recordStageAttemptActivityHeartbeat(db, input);
    } finally {
      db.close();
    }
  } catch {
    // Temporal heartbeat remains authoritative for activity timeout; the SQLite
    // projection is operator liveness metadata and must not fail the activity.
  }
}

function providerRuntimeBlockerCloseout(input: {
  stageAttemptId: string;
  stageId: string;
  domainId: string;
  providerBlockerReason: string | null;
  routeImpact: Record<string, unknown>;
}) {
  if (!input.providerBlockerReason) {
    return null;
  }
  const blockerRef = `opl://stage-attempts/${
    encodeURIComponent(input.stageAttemptId)
  }/runtime-blockers/${encodeURIComponent(input.providerBlockerReason)}`;
  return {
    closeout_refs: [blockerRef],
    rejected_writes: [{
      surface_kind: 'opl_provider_runtime_typed_blocker_ref',
      blocker_id: input.providerBlockerReason,
      blocker_ref: blockerRef,
      stage_attempt_id: input.stageAttemptId,
      stage_id: input.stageId,
      domain_id: input.domainId,
      owner: 'one-person-lab',
      reason: input.providerBlockerReason,
      provider_completion_is_domain_ready: false,
      authority_boundary: {
        opl: 'provider_runtime_blocker_ref_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        can_create_domain_owner_receipt: false,
        can_create_domain_typed_blocker: false,
        can_authorize_quality_verdict: false,
        can_claim_domain_ready: false,
      },
    }],
    route_impact: {
      ...input.routeImpact,
      provider_blocker_reason: input.providerBlockerReason,
      provider_blocker_surface: 'codex_stage_activity.process_output_summary',
      runtime_blocker_ref: blockerRef,
      runtime_blocker_owner: 'one-person-lab',
      runtime_blocker_is_domain_owner_answer: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

function providerRuntimeQualityDebtCloseout(input: {
  stageAttemptId: string;
  domainId: string;
  providerReason: string;
  routeImpact: Record<string, unknown>;
}) {
  const diagnosticRef = `opl://stage-attempts/${
    encodeURIComponent(input.stageAttemptId)
  }/quality-debt-diagnostics/${encodeURIComponent(input.providerReason)}`;
  return {
    surface_kind: 'temporal_domain_handler_dispatch_receipt',
    activity_kind: 'domain_handler_dispatch_activity',
    activity_status: 'completed_with_quality_debt',
    stage_attempt_id: input.stageAttemptId,
    domain_id: input.domainId,
    closeout_refs: [diagnosticRef],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: input.domainId,
    domain_ready_verdict: null,
    route_impact: {
      ...input.routeImpact,
      progression_effect: 'next_stage_may_start',
      quality_debt_refs: [diagnosticRef],
      provider_quality_debt_reason: input.providerReason,
      provider_quality_debt_diagnostic_ref: diagnosticRef,
    },
    closeout_packet_surface_kind: 'stage_attempt_closeout_packet',
    authority_boundary: {
      opl: 'provider_quality_debt_diagnostic_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
      diagnostic_blocks_next_stage: false,
    },
  };
}

export async function codexStageActivity(input: TemporalStageAttemptWorkflowInput) {
  const observedAt = new Date().toISOString();
  heartbeat({
    stage_attempt_id: input.stage_attempt_id,
    stage_id: input.stage_id,
    checkpoint_refs: input.checkpoint_refs ?? [],
  });
  recordActivityHeartbeat({
    stageAttemptId: input.stage_attempt_id,
    heartbeatKind: 'codex_stage_activity_started',
    checkpointRefs: input.checkpoint_refs ?? [],
  });
  const heartbeatInterval = setInterval(() => {
    heartbeat({
      stage_attempt_id: input.stage_attempt_id,
      stage_id: input.stage_id,
      checkpoint_refs: input.checkpoint_refs ?? [],
      heartbeat_kind: 'codex_stage_activity_supervision',
    });
    recordActivityHeartbeat({
      stageAttemptId: input.stage_attempt_id,
      heartbeatKind: 'codex_stage_activity_supervision',
      checkpointRefs: input.checkpoint_refs ?? [],
    });
  }, DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS);
  try {
    const runnerReceipt = await runAgentStageRunner({
      attempt: input as unknown as Record<string, unknown>,
      stagePacketRef: input.stage_packet_ref,
      runnerMode: input.codex_stage_runner?.runner_mode,
      observedAt,
      timeoutMs: input.codex_stage_runner?.timeout_ms ?? DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
      noOutputTimeoutMs: input.codex_stage_runner?.no_output_timeout_ms
        ?? DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
      signal: Context.current().cancellationSignal,
      onRunnerProgress(event) {
        heartbeat({
          stage_attempt_id: input.stage_attempt_id,
          stage_id: input.stage_id,
          checkpoint_refs: input.checkpoint_refs ?? [],
          heartbeat_kind: 'codex_stage_activity_runner_progress',
          runner_event_kind: event.event_kind,
        });
        recordActivityHeartbeat({
          stageAttemptId: input.stage_attempt_id,
          heartbeatKind: 'codex_stage_activity_runner_progress',
          runnerEventKind: event.event_kind,
          checkpointRefs: input.checkpoint_refs ?? [],
        });
      },
    });
    const activityReceipt = {
      surface_kind: 'temporal_codex_stage_activity_receipt',
      activity_kind: 'codex_stage_activity',
      activity_status: 'completed',
      stage_attempt_id: input.stage_attempt_id,
      stage_id: input.stage_id,
      executor_kind: input.executor_kind,
      checkpoint_refs: input.checkpoint_refs ?? [],
      stage_packet_ref: input.stage_packet_ref ?? null,
      ...runnerReceipt,
      authority_boundary: {
        opl: 'activity_packet_and_receipt_transport_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
    return {
      ...codexActivityEventForTemporalHistory(activityReceipt),
      closeout_packet: compactCloseoutPacketForTemporalResult(closeoutPacketFromRunnerReceipt(runnerReceipt)),
    };
  } finally {
    clearInterval(heartbeatInterval);
  }
}

export async function domainHandlerDispatchActivity(input: TemporalStageAttemptWorkflowInput) {
  heartbeat({
    stage_attempt_id: input.stage_attempt_id,
    stage_id: input.stage_id,
  });
  if (!input.closeout_packet) {
    const providerBlockerReason = input.provider_blocker?.blocked_reason?.trim() || null;
    const routeImpact = input.provider_blocker?.route_impact ?? {};
    if (!providerBlockerReason) {
      const diagnosticRef = `opl://stage-attempts/${input.stage_attempt_id}/no-output-diagnostic`;
      return {
        surface_kind: 'temporal_domain_handler_dispatch_receipt',
        activity_kind: 'domain_handler_dispatch_activity',
        activity_status: 'completed_with_quality_debt',
        stage_attempt_id: input.stage_attempt_id,
        domain_id: input.domain_id,
        closeout_refs: [diagnosticRef],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: input.domain_id,
        domain_ready_verdict: null,
        route_impact: {
          ...routeImpact,
          progression_effect: 'next_stage_may_start',
          quality_debt_refs: [diagnosticRef],
          no_output_diagnostic_ref: diagnosticRef,
        },
        closeout_packet_surface_kind: 'stage_attempt_closeout_packet',
        authority_boundary: {
          opl: 'no_output_diagnostic_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
          provider_completion_is_domain_ready: false,
          diagnostic_blocks_next_stage: false,
        },
      };
    }
    if (!isRuntimeHardStopReason(providerBlockerReason)) {
      return providerRuntimeQualityDebtCloseout({
        stageAttemptId: input.stage_attempt_id,
        domainId: input.domain_id,
        providerReason: providerBlockerReason,
        routeImpact,
      });
    }
    const runtimeBlocker = providerRuntimeBlockerCloseout({
      stageAttemptId: input.stage_attempt_id,
      stageId: input.stage_id,
      domainId: input.domain_id,
      providerBlockerReason,
      routeImpact,
    });
    return {
      surface_kind: 'temporal_domain_handler_dispatch_receipt',
      activity_kind: 'domain_handler_dispatch_activity',
      activity_status: 'blocked',
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      closeout_refs: runtimeBlocker?.closeout_refs ?? [],
      consumed_refs: [],
      consumed_memory_refs: [],
      writeback_receipt_refs: [],
      rejected_writes: runtimeBlocker?.rejected_writes ?? [],
      next_owner: input.domain_id,
      domain_ready_verdict: null,
      route_impact: runtimeBlocker?.route_impact ?? routeImpact,
      blocked_reason: providerBlockerReason,
      closeout_packet_surface_kind: null,
      authority_boundary: {
        opl: 'domain_handler_transport_only',
        domain: 'domain_handler_dispatch_and_receipt_owner',
        provider_runtime_blocker_ref_only: Boolean(runtimeBlocker),
        provider_runtime_blocker_is_domain_owner_answer: false,
        provider_completion_is_domain_ready: false,
      },
    };
  }
  const closeout = normalizeTypedStageCloseoutPacket(input.closeout_packet);
  const providerRuntimeReason = providerRuntimeCloseoutReason(closeout);
  if (providerRuntimeReason) {
    if (!isRuntimeHardStopReason(providerRuntimeReason)) {
      return providerRuntimeQualityDebtCloseout({
        stageAttemptId: input.stage_attempt_id,
        domainId: input.domain_id,
        providerReason: providerRuntimeReason,
        routeImpact: closeout.route_impact ?? {},
      });
    }
    const runtimeBlocker = providerRuntimeBlockerCloseout({
      stageAttemptId: input.stage_attempt_id,
      stageId: input.stage_id,
      domainId: input.domain_id,
      providerBlockerReason: providerRuntimeReason,
      routeImpact: closeout.route_impact ?? {},
    });
    return {
      surface_kind: 'temporal_domain_handler_dispatch_receipt',
      activity_kind: 'domain_handler_dispatch_activity',
      activity_status: 'blocked',
      stage_attempt_id: input.stage_attempt_id,
      domain_id: input.domain_id,
      closeout_refs: runtimeBlocker?.closeout_refs ?? closeout.closeout_refs,
      consumed_refs: closeout.consumed_refs,
      consumed_memory_refs: closeout.consumed_memory_refs,
      writeback_receipt_refs: closeout.writeback_receipt_refs,
      rejected_writes: runtimeBlocker?.rejected_writes ?? closeout.rejected_writes,
      next_owner: closeout.next_owner ?? input.domain_id,
      domain_ready_verdict: null,
      route_impact: runtimeBlocker?.route_impact ?? closeout.route_impact ?? {},
      blocked_reason: providerRuntimeReason,
      closeout_packet_surface_kind: closeout.surface_kind,
      authority_boundary: {
        opl: 'domain_handler_transport_only',
        domain: 'domain_handler_dispatch_and_receipt_owner',
        provider_runtime_blocker_ref_only: true,
        provider_runtime_blocker_is_domain_owner_answer: false,
        provider_completion_is_domain_ready: false,
      },
    };
  }
  return {
    surface_kind: 'temporal_domain_handler_dispatch_receipt',
    activity_kind: 'domain_handler_dispatch_activity',
    activity_status: 'completed',
    stage_attempt_id: input.stage_attempt_id,
    domain_id: input.domain_id,
    closeout_refs: closeout.closeout_refs,
    consumed_refs: closeout.consumed_refs,
    consumed_memory_refs: closeout.consumed_memory_refs,
    writeback_receipt_refs: closeout.writeback_receipt_refs,
    rejected_writes: closeout.rejected_writes,
    next_owner: closeout.next_owner ?? input.domain_id,
    domain_ready_verdict: closeout.domain_ready_verdict ?? 'domain_gate_pending',
    route_impact: closeout.route_impact ?? {},
    closeout_packet_surface_kind: closeout.surface_kind,
    ...(closeout.closeout_ref_metadata
      ? { closeout_ref_metadata: closeout.closeout_ref_metadata }
      : {}),
    ...(closeout.domain_output ? { domain_output: closeout.domain_output } : {}),
    authority_boundary: {
      opl: 'domain_handler_transport_only',
      domain: 'domain_handler_dispatch_and_receipt_owner',
    },
  };
}

export async function schedulerTickActivity(input: {
  provider_kind: 'temporal';
  tick_source?: string;
  force?: boolean;
  limit?: number;
  hydrate?: boolean;
  domain_profiles?: import('./family-runtime-command.ts').FamilyRuntimeDomainProfiles;
}) {
  heartbeat({
    provider_kind: input.provider_kind,
    tick_source: input.tick_source ?? 'temporal-schedule',
    limit: input.limit ?? 10,
  });
  const { db, paths } = openQueueDb();
  const tick = await runTemporalProviderCadenceReadback(
    db,
    paths,
    {
      providerKind: input.provider_kind,
      force: input.force,
      limit: input.limit,
      hydrate: input.hydrate,
      domainProfiles: input.domain_profiles,
    },
  );
  return {
    version: 'g2',
    temporal_provider_cadence_readback: compactSchedulerTickForTemporalResult(tick),
  };
}

export const StageAttemptActivity = codexStageActivity;
