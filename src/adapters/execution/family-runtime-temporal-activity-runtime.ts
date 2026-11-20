import { Context, heartbeat } from '@temporalio/activity';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { createTemporalStageActivitySessionObserverFromPort } from './public/temporal-stage-activity-session-observer-port.ts';
import {
  type TemporalStageAttemptWorkflowInput,
} from './family-runtime-temporal.ts';
import {
  DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS,
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
} from './family-runtime-temporal-constants.ts';
import { runTemporalProviderCadenceReadback } from './family-runtime-scheduler.ts';
import { openQueueDb } from './family-runtime-store.ts';
import { recordStageAttemptActivityHeartbeat } from './family-runtime-stage-attempts.ts';
import { requirePersistedAttemptActivityIdentity } from './family-runtime-temporal-activity-identity.ts';
import {
  closeoutPacketFromRunnerReceipt,
  compactCloseoutPacketForTemporalResult,
  compactSchedulerTickForTemporalResult,
  providerRuntimeCloseoutReason,
  readNumber,
  readString,
} from './family-runtime-temporal-activity-result-compaction.ts';
import { normalizeTypedStageCloseoutPacket } from './family-runtime-codex-stage-runner.ts';
import { codexActivityEventForTemporalHistory } from './family-runtime-temporal-history-summary.ts';
import { resolveStageRunAttemptExecutorContent } from './family-runtime-stage-run-attempt-content.ts';
import {
  isRuntimeHardStopReason,
  runtimeHardStopClassForReason,
} from '../../kernel/progress-hard-stop-policy.ts';
import type {
  RunwayAttemptComposition,
  RunwayAttemptCompositionFactory,
} from './composition-factory-ports.ts';
function recordActivityHeartbeat(input: {
  stageAttemptId: string;
  heartbeatKind: string;
  namespace?: string | null;
  runnerEventKind?: string | null;
  executionSessionRef?: string | null;
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
  const hardStopClass = runtimeHardStopClassForReason(input.providerBlockerReason);
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
      ...(hardStopClass ? { hard_stop_class: hardStopClass } : {}),
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

export async function codexStageActivity(
  input: TemporalStageAttemptWorkflowInput,
  options: {
    createAttemptComposition?: RunwayAttemptCompositionFactory;
  } = {},
) {
  requirePersistedAttemptActivityIdentity(input, 'temporal_codex_stage_activity');
  const coordinationObserver = createTemporalStageActivitySessionObserverFromPort(input);
  const cancellationSignal = Context.current().cancellationSignal;
  const observedAt = new Date().toISOString();
  heartbeat({
    stage_attempt_id: input.stage_attempt_id,
    stage_id: input.stage_id,
    checkpoint_refs: input.checkpoint_refs ?? [],
  });
  recordActivityHeartbeat({
    stageAttemptId: input.stage_attempt_id,
    heartbeatKind: 'codex_stage_activity_started',
    namespace: Context.current().info.namespace,
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
      namespace: Context.current().info.namespace,
      checkpointRefs: input.checkpoint_refs ?? [],
    });
    coordinationObserver.heartbeat();
  }, DEFAULT_CODEX_STAGE_ACTIVITY_HEARTBEAT_INTERVAL_MS);
  let attemptComposition: RunwayAttemptComposition | null = null;
  try {
    const executorContent = resolveStageRunAttemptExecutorContent(input);
    attemptComposition = options.createAttemptComposition
      ? await options.createAttemptComposition({
          attemptRef: `opl://stage-attempts/${encodeURIComponent(input.stage_attempt_id)}`,
        })
      : null;
    if (!attemptComposition) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Codex Stage activity requires a Host-provided Runway attempt composition.',
        { failure_code: 'host_runway_attempt_composition_factory_missing' },
      );
    }
    const runnerReceipt = await attemptComposition.executor.execute({
      attempt: input as unknown as Record<string, unknown>,
      ...executorContent,
      stagePacketRef: input.stage_packet_ref,
      runnerMode: input.codex_stage_runner?.runner_mode,
      observedAt,
      timeoutMs: input.codex_stage_runner?.timeout_ms ?? DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
      noOutputTimeoutMs: input.codex_stage_runner?.no_output_timeout_ms
        ?? DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
      signal: cancellationSignal,
      onRunnerProgress(event) {
        const executionSessionRef = event.event_kind === 'thread.started' && event.value
          ? `codex://threads/${event.value}`
          : null;
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
          namespace: Context.current().info.namespace,
          runnerEventKind: event.event_kind,
          executionSessionRef,
          checkpointRefs: input.checkpoint_refs ?? [],
        });
        coordinationObserver.onRunnerProgress(event);
      },
    });
    const runnerReceiptRecord = runnerReceipt as unknown as Record<string, unknown>;
    const runnerStatus = isRecord(runnerReceiptRecord.runner_status)
      ? runnerReceiptRecord.runner_status
      : {};
    const processOutputSummary = isRecord(runnerReceiptRecord.process_output_summary)
      ? runnerReceiptRecord.process_output_summary
      : {};
    const exitCode = readNumber(runnerStatus.exit_code);
    const timeoutReason = readString(processOutputSummary.timeout_reason);
    const coordinationTerminalState = cancellationSignal.aborted
        || timeoutReason === 'activity_cancelled'
      ? 'cancelled'
      : exitCode !== null && exitCode !== 0 || timeoutReason
        ? 'failed'
        : 'completed';
    coordinationObserver.terminal(coordinationTerminalState);
    const coordinationObservation = coordinationObserver.summary();
    const activityReceipt = {
      surface_kind: 'temporal_codex_stage_activity_receipt',
      activity_kind: 'codex_stage_activity',
      activity_status: 'completed',
      stage_attempt_id: input.stage_attempt_id,
      stage_id: input.stage_id,
      executor_kind: input.executor_kind,
      checkpoint_refs: input.checkpoint_refs ?? [],
      stage_packet_ref: input.stage_packet_ref ?? null,
      cordis_composition_snapshot_ref: {
        snapshot_id: attemptComposition.snapshot.snapshot_id,
        snapshot_digest: attemptComposition.snapshot.snapshot_digest,
        executor_route: attemptComposition.snapshot.binding.executor_route,
      },
      ...runnerReceipt,
      coordination_observation: coordinationObservation,
      authority_boundary: {
        opl: 'activity_packet_and_receipt_transport_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    };
    return {
      ...codexActivityEventForTemporalHistory(activityReceipt),
      coordination_observation: coordinationObservation,
      closeout_packet: compactCloseoutPacketForTemporalResult(
        closeoutPacketFromRunnerReceipt(runnerReceiptRecord),
      ),
    };
  } catch (error) {
    coordinationObserver.terminal(cancellationSignal.aborted ? 'cancelled' : 'failed');
    const coordinationObservation = coordinationObserver.summary();
    const blockedReason = error instanceof FrameworkContractError
      && typeof error.details?.blocked_reason === 'string'
      && error.details.blocked_reason.trim()
      ? error.details.blocked_reason.trim()
      : null;
    if (!blockedReason) throw error;
    return {
      ...codexActivityEventForTemporalHistory({
        surface_kind: 'temporal_codex_stage_activity_receipt',
        activity_kind: 'codex_stage_activity',
        activity_status: 'blocked',
        stage_attempt_id: input.stage_attempt_id,
        stage_id: input.stage_id,
        executor_kind: input.executor_kind,
        checkpoint_refs: input.checkpoint_refs ?? [],
        stage_packet_ref: input.stage_packet_ref ?? null,
        runner_status: {
          runner_kind: 'codex_cli',
          runner_mode: input.codex_stage_runner?.runner_mode ?? 'codex_cli',
          live_process_started: false,
        },
        progress_summary: {
          progress_status: 'blocked_before_executor_session',
          execution_session_ref: null,
        },
        process_output_summary: {
          blocked_reason: blockedReason,
          pre_codex_typed_preflight_blocker: true,
        },
        coordination_observation: coordinationObservation,
      }),
      coordination_observation: coordinationObservation,
      closeout_packet: null,
    };
  } finally {
    clearInterval(heartbeatInterval);
    await attemptComposition?.dispose();
  }
}

export async function domainHandlerDispatchActivity(input: TemporalStageAttemptWorkflowInput) {
  requirePersistedAttemptActivityIdentity(input, 'temporal_domain_handler_dispatch_activity');
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
    if (input.attempt_role !== 'reviewer' && input.attempt_role !== 're_reviewer'
      && !isRuntimeHardStopReason(providerBlockerReason)) {
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
    if (input.attempt_role !== 'reviewer' && input.attempt_role !== 're_reviewer'
      && !isRuntimeHardStopReason(providerRuntimeReason)) {
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
    ...(closeout.closeout_normalization ? { closeout_packet: closeout } : {}),
    ...(closeout.closeout_ref_metadata
      ? { closeout_ref_metadata: closeout.closeout_ref_metadata }
      : {}),
    ...(closeout.domain_output ? { domain_output: closeout.domain_output } : {}),
    authority_boundary: closeout.authority_boundary.opl === 'raw_executor_output_progress_envelope_only'
      ? closeout.authority_boundary : {
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
