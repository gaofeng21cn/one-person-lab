import { Context, heartbeat } from '@temporalio/activity';

import type { TemporalStageAttemptWorkflowInput } from './family-runtime-temporal.ts';
import {
  DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS,
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
} from './family-runtime-temporal-constants.ts';
import { runSchedulerTick } from './family-runtime-scheduler.ts';
import { runSchedulerQueueTick } from './family-runtime-scheduler-tick-runner.ts';
import { openQueueDb } from './family-runtime-store.ts';
import {
  recordStageAttemptActivityHeartbeat,
} from './family-runtime-stage-attempts.ts';
import {
  normalizeTypedStageCloseoutPacket,
  runAgentStageRunner,
} from './family-runtime-codex-stage-runner.ts';
import { codexActivityEventForTemporalHistory } from './family-runtime-temporal-history-summary.ts';

async function temporalProviderModule() {
  return await import('./family-runtime-temporal-provider.ts');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

export function compactCloseoutPacketForTemporalResult(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const surfaceKind = typeof value.surface_kind === 'string' ? value.surface_kind : null;
  if (
    surfaceKind !== 'stage_attempt_closeout_packet'
    && surfaceKind !== 'stage_memory_closeout_packet'
    && surfaceKind !== 'domain_stage_closeout_packet'
  ) {
    return null;
  }
  const closeoutRefs = [
    ...readStringList(value.closeout_refs),
    ...(typeof value.closeout_ref === 'string' && value.closeout_ref ? [value.closeout_ref] : []),
    ...(typeof value.receipt_ref === 'string' && value.receipt_ref ? [value.receipt_ref] : []),
    ...(typeof value.packet_ref === 'string' && value.packet_ref ? [value.packet_ref] : []),
  ];
  if (closeoutRefs.length === 0) {
    return null;
  }

  return {
    surface_kind: surfaceKind,
    ...(typeof value.stage_attempt_id === 'string' ? { stage_attempt_id: value.stage_attempt_id } : {}),
    ...(typeof value.idempotency_key === 'string' ? { idempotency_key: value.idempotency_key } : {}),
    ...(typeof value.closeout_id === 'string' ? { closeout_id: value.closeout_id } : {}),
    closeout_refs: [...new Set(closeoutRefs)],
    consumed_refs: readStringList(value.consumed_refs),
    consumed_memory_refs: readStringList(value.consumed_memory_refs),
    writeback_receipt_refs: readStringList(value.writeback_receipt_refs),
    rejected_writes: Array.isArray(value.rejected_writes) ? value.rejected_writes.filter(isRecord) : [],
    ...(typeof value.next_owner === 'string' ? { next_owner: value.next_owner } : {}),
    ...(typeof value.domain_ready_verdict === 'string'
      ? { domain_ready_verdict: value.domain_ready_verdict }
      : {}),
    ...(isRecord(value.route_impact) ? { route_impact: value.route_impact } : {}),
    authority_boundary: isRecord(value.authority_boundary)
      ? value.authority_boundary
      : {
          opl: 'closeout_transport_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
    temporal_payload_policy: {
      surface_kind: 'temporal_activity_compacted_closeout_packet',
      full_closeout_body_omitted: true,
      retained_fields: [
        'surface_kind',
        'stage_attempt_id',
        'idempotency_key',
        'closeout_id',
        'closeout_refs',
        'consumed_refs',
        'consumed_memory_refs',
        'writeback_receipt_refs',
        'rejected_writes',
        'next_owner',
        'domain_ready_verdict',
        'route_impact',
        'authority_boundary',
      ],
      omitted_body_fields: [
        'paper_stage_log',
        'user_stage_log',
        'stage_log_summary',
        'human_stage_log',
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
      runtime_blocker_ref: blockerRef,
      runtime_blocker_owner: 'one-person-lab',
      runtime_blocker_is_domain_owner_answer: false,
      provider_completion_is_domain_ready: false,
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
      blocked_reason: providerBlockerReason ?? 'typed_closeout_packet_required',
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
  return {
    version: 'g2',
    family_runtime_scheduler_tick: await runSchedulerTick(
      db,
      paths,
      {
        providerKind: input.provider_kind,
        force: input.force,
        limit: input.limit,
        hydrate: input.hydrate,
        domainProfiles: input.domain_profiles,
      },
      (source, limit, hydrate, taskScope, domainProfiles, queueTickOptions) => runSchedulerQueueTick(
        db,
        paths,
        source,
        limit,
        hydrate,
        taskScope,
        domainProfiles,
        {
          temporalProviderModule,
          dispatchEnabled: queueTickOptions?.dispatchEnabled,
          blockedReason: queueTickOptions?.blockedReason,
        },
      ),
    ),
  };
}
