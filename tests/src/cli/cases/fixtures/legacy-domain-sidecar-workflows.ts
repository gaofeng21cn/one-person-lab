import { condition, defineQuery, proxyActivities, setHandler } from '@temporalio/workflow';

const stageAttemptQuery = defineQuery<Record<string, unknown>>('StageAttemptQuery');

const { codexStageActivity } = proxyActivities<{
  codexStageActivity(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}>({
  startToCloseTimeout: '65 minutes',
  heartbeatTimeout: '5 minutes',
  retry: { maximumAttempts: 1 },
});

const { domainSidecarDispatchActivity } = proxyActivities<{
  domainSidecarDispatchActivity(input: Record<string, unknown>): Promise<Record<string, unknown>>;
}>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '10 minutes',
  retry: { maximumAttempts: 1 },
});

function nowIso() {
  return new Date(Date.now()).toISOString();
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry)) : [];
}

function recordValue(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function StageAttemptWorkflow(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  let state: Record<string, unknown> = {
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
    checkpoint_refs: stringList(input.checkpoint_refs),
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
  setHandler(stageAttemptQuery, () => state);

  state = {
    ...state,
    status: 'running',
    updated_at: nowIso(),
    activity_events: [
      ...stringList([]),
      {
        activity_kind: 'codex_stage_activity',
        activity_status: 'running',
        stage_packet_ref: input.stage_packet_ref ?? null,
      },
    ],
  };
  const codexResult = await codexStageActivity(input);
  state = {
    ...state,
    status: 'checkpointed',
    updated_at: nowIso(),
    checkpoint_refs: [...new Set([...stringList(state.checkpoint_refs), ...stringList(codexResult.checkpoint_refs)])],
    activity_events: [
      ...(Array.isArray(state.activity_events) ? state.activity_events : []),
      {
        activity_kind: 'codex_stage_activity',
        activity_status: 'completed',
        ...codexResult,
      },
    ],
  };
  const dispatchResult = await domainSidecarDispatchActivity({
    ...input,
    closeout_packet: recordValue(codexResult.closeout_packet),
  });
  state = {
    ...state,
    status: 'completed',
    updated_at: nowIso(),
    closeout_refs: stringList(dispatchResult.closeout_refs),
    consumed_refs: stringList(dispatchResult.consumed_refs),
    consumed_memory_refs: stringList(dispatchResult.consumed_memory_refs),
    writeback_receipt_refs: stringList(dispatchResult.writeback_receipt_refs),
    rejected_writes: Array.isArray(dispatchResult.rejected_writes) ? dispatchResult.rejected_writes : [],
    next_owner: typeof dispatchResult.next_owner === 'string' ? dispatchResult.next_owner : null,
    route_impact: recordValue(dispatchResult.route_impact),
    closeout_packet: dispatchResult,
    activity_events: [
      ...(Array.isArray(state.activity_events) ? state.activity_events : []),
      {
        activity_kind: 'domain_sidecar_dispatch_activity',
        activity_status: 'completed',
        ...dispatchResult,
      },
    ],
    completion_boundary: {
      provider_completion: 'completed',
      domain_ready_verdict: typeof dispatchResult.domain_ready_verdict === 'string' ? dispatchResult.domain_ready_verdict : null,
      provider_completion_is_domain_ready: false,
    },
  };
  await condition(() => false, '1 second');
  return state;
}
