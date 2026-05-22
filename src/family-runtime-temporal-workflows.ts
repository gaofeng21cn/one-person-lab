import { condition, defineQuery, defineSignal, proxyActivities, setHandler } from '@temporalio/workflow';

import type {
  TemporalStageAttemptSignalPayload,
  TemporalStageAttemptWorkflowInput,
  TemporalStageAttemptWorkflowState,
  TemporalSchedulerTickWorkflowInput,
  TemporalSchedulerTickWorkflowState,
} from './family-runtime-temporal.ts';
import {
  CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  SHORT_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  SHORT_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
} from './family-runtime-temporal-constants.ts';

type StageAttemptActivities = {
  codexStageActivity(input: TemporalStageAttemptWorkflowInput): Promise<Record<string, unknown>>;
  domainSidecarDispatchActivity(input: TemporalStageAttemptWorkflowInput): Promise<Record<string, unknown>>;
  schedulerTickActivity(input: TemporalSchedulerTickWorkflowInput): Promise<Record<string, unknown>>;
};

export const stageAttemptQuery = defineQuery<TemporalStageAttemptWorkflowState>('StageAttemptQuery');
export const schedulerTickQuery = defineQuery<TemporalSchedulerTickWorkflowState>('SchedulerTickQuery');
export const humanGateSignal = defineSignal<[TemporalStageAttemptSignalPayload]>('HumanGateSignal');
export const userInstructionSignal = defineSignal<[TemporalStageAttemptSignalPayload]>('UserInstructionSignal');
export const resumeSignal = defineSignal<[TemporalStageAttemptSignalPayload]>('ResumeSignal');

const { codexStageActivity } = proxyActivities<Pick<StageAttemptActivities, 'codexStageActivity'>>({
  startToCloseTimeout: CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  heartbeatTimeout: CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  retry: {
    maximumAttempts: 1,
  },
});

const { domainSidecarDispatchActivity, schedulerTickActivity } = proxyActivities<Omit<StageAttemptActivities, 'codexStageActivity'>>({
  startToCloseTimeout: SHORT_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  heartbeatTimeout: SHORT_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  retry: {
    maximumAttempts: 1,
  },
});

function nowIso() {
  return new Date(Date.now()).toISOString();
}

function asStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry)) : [];
}

function asRecordList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry))
    : [];
}

function asRecord(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function closeoutRefsFrom(value: Record<string, unknown>) {
  return [
    ...asStringList(value.closeout_refs),
    ...(typeof value.closeout_ref === 'string' ? [value.closeout_ref] : []),
    ...(typeof value.receipt_ref === 'string' ? [value.receipt_ref] : []),
  ];
}

function closeoutPacketFromCodexResult(value: Record<string, unknown>) {
  const closeout = asRecord(value.closeout_packet);
  return Object.keys(closeout).length > 0 ? closeout : null;
}

export async function StageAttemptWorkflow(
  input: TemporalStageAttemptWorkflowInput,
): Promise<TemporalStageAttemptWorkflowState> {
  let state: TemporalStageAttemptWorkflowState = {
    surface_kind: 'temporal_stage_attempt_query',
    provider_kind: 'temporal',
    stage_attempt_id: input.stage_attempt_id,
    workflow_id: input.workflow_id,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    status: 'registered',
    started_at: nowIso(),
    updated_at: nowIso(),
    activity_events: [],
    checkpoint_refs: asStringList(input.checkpoint_refs),
    closeout_refs: [],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: null,
    route_impact: {},
    human_gate_refs: [],
    signals: [],
    closeout_packet: null,
    completion_boundary: {
      provider_completion: 'not_completed',
      domain_ready_verdict: null,
      provider_completion_is_domain_ready: false,
    },
    authority_boundary: {
      opl: 'temporal_workflow_transport_and_control_metadata_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };

  const recordSignal = (signal: TemporalStageAttemptSignalPayload) => {
    state = {
      ...state,
      status: signal.signal_kind === 'human_gate' ? 'human_gate' : state.status,
      updated_at: nowIso(),
      signals: [...state.signals, signal],
      human_gate_refs: signal.signal_kind === 'human_gate' && typeof signal.payload.human_gate_ref === 'string'
        ? [...new Set([...state.human_gate_refs, signal.payload.human_gate_ref])]
        : state.human_gate_refs,
    };
  };

  setHandler(stageAttemptQuery, () => state);
  setHandler(humanGateSignal, recordSignal);
  setHandler(userInstructionSignal, recordSignal);
  setHandler(resumeSignal, (signal) => {
    state = {
      ...state,
      status: state.status === 'human_gate' || state.status === 'failed' ? 'running' : state.status,
      updated_at: nowIso(),
      signals: [...state.signals, signal],
    };
  });

  try {
    state = {
      ...state,
      status: 'running',
      updated_at: nowIso(),
      activity_events: [
        ...state.activity_events,
        {
          activity_kind: 'codex_stage_activity',
          activity_status: 'running',
          stage_packet_ref: input.stage_packet_ref ?? null,
        },
      ],
    };
    const codexResult = await codexStageActivity(input);
    const codexCheckpointRefs = asStringList(codexResult.checkpoint_refs);
    state = {
      ...state,
      status: codexCheckpointRefs.length > 0 ? 'checkpointed' : 'running',
      updated_at: nowIso(),
      checkpoint_refs: [...new Set([...state.checkpoint_refs, ...codexCheckpointRefs])],
      activity_events: [
        ...state.activity_events,
        {
          activity_kind: 'codex_stage_activity',
          activity_status: 'completed',
          ...codexResult,
        },
      ],
    };

    const codexCloseoutPacket = closeoutPacketFromCodexResult(codexResult);
    const dispatchResult = await domainSidecarDispatchActivity({
      ...input,
      closeout_packet: codexCloseoutPacket ?? input.closeout_packet ?? null,
    });
    const closeoutRefs = closeoutRefsFrom(dispatchResult);
    const routeImpact = asRecord(dispatchResult.route_impact);
    const dispatchBlockedReason = typeof dispatchResult.blocked_reason === 'string'
      ? dispatchResult.blocked_reason
      : null;
    const providerCompleted = closeoutRefs.length > 0 && !dispatchBlockedReason;
    state = {
      ...state,
      status: providerCompleted ? 'completed' : 'blocked',
      updated_at: nowIso(),
      closeout_refs: [...new Set([...state.closeout_refs, ...closeoutRefs])],
      consumed_refs: asStringList(dispatchResult.consumed_refs),
      consumed_memory_refs: asStringList(dispatchResult.consumed_memory_refs),
      writeback_receipt_refs: asStringList(dispatchResult.writeback_receipt_refs),
      rejected_writes: asRecordList(dispatchResult.rejected_writes),
      next_owner: typeof dispatchResult.next_owner === 'string' ? dispatchResult.next_owner : null,
      route_impact: routeImpact,
      closeout_packet: dispatchResult,
      activity_events: [
        ...state.activity_events,
        {
          activity_kind: 'domain_sidecar_dispatch_activity',
          activity_status: 'completed',
          ...dispatchResult,
        },
      ],
      completion_boundary: {
        provider_completion: providerCompleted ? 'completed' : 'not_completed',
        domain_ready_verdict: providerCompleted && typeof dispatchResult.domain_ready_verdict === 'string'
          ? dispatchResult.domain_ready_verdict
          : null,
        provider_completion_is_domain_ready: false,
      },
    };
  } catch (error) {
    state = {
      ...state,
      status: 'failed',
      updated_at: nowIso(),
      activity_events: [
        ...state.activity_events,
        {
          activity_kind: 'temporal_stage_attempt_workflow',
          activity_status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      ],
    };
    throw error;
  }

  await condition(() => false, '1 second');
  return state;
}

export async function SchedulerTickWorkflow(
  input: TemporalSchedulerTickWorkflowInput,
): Promise<TemporalSchedulerTickWorkflowState> {
  let state: TemporalSchedulerTickWorkflowState = {
    surface_kind: 'temporal_scheduler_tick_query',
    provider_kind: 'temporal',
    status: 'registered',
    tick_source: input.tick_source,
    started_at: nowIso(),
    updated_at: nowIso(),
    receipt: null,
    error: null,
    authority_boundary: {
      opl: 'scheduler_cadence_queue_and_provider_slo_owner',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
  setHandler(schedulerTickQuery, () => state);

  try {
    state = {
      ...state,
      status: 'running',
      updated_at: nowIso(),
    };
    const receipt = await schedulerTickActivity(input);
    state = {
      ...state,
      status: 'completed',
      updated_at: nowIso(),
      receipt,
    };
  } catch (error) {
    state = {
      ...state,
      status: 'failed',
      updated_at: nowIso(),
      error: error instanceof Error ? error.message : String(error),
    };
    throw error;
  }

  return state;
}
