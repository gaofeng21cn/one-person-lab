import {
  condition,
  defineQuery,
  defineSignal,
  defineUpdate,
  executeChild,
  patched,
  proxyActivities,
  setHandler,
  upsertSearchAttributes,
} from '@temporalio/workflow';

import type {
  TemporalStageAttemptOperatorUpdateReceipt,
  TemporalStageAttemptSignalPayload,
  TemporalStageAttemptWorkflowInput,
  TemporalStageAttemptWorkflowState,
  TemporalStageQualityCycleProjectionInput,
  TemporalStageQualityAttemptSyncInput,
  TemporalStageQualityReviewReceiptInput,
  TemporalStageRunWorkflowInput,
  TemporalStageRunWorkflowState,
  TemporalStageRunRouteLaunchInput,
  TemporalStageRunRouteLaunchReceipt,
  TemporalStageQualityAttemptMaterializationInput,
  TemporalSchedulerTickWorkflowInput,
  TemporalSchedulerTickWorkflowState,
} from './family-runtime-temporal.ts';
import {
  evaluateStageQualityFindingClosure,
  validateStageQualityFindings,
  validateStageQualityRepairMap,
  type StageQualityAttemptRole,
  type StageQualityFinding,
  type StageQualityFindingClosure,
  type StageQualityRepairMapEntry,
  type StageQualityReReviewResult,
  type StageReviewReceipt,
} from '../stagecraft/public/stage-quality-cycle.ts';
import { evaluateStageQualityAttemptRoute } from '../stagecraft/public/stage-quality-route-selection.ts';
import {
  CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  SHORT_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  SHORT_STAGE_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT,
  SHORT_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
} from './family-runtime-temporal-constants.ts';
import {
  codexActivityEventForTemporalHistory,
  providerBlockerFromCodexResult,
} from './family-runtime-temporal-history-summary.ts';
import { requireStageQualityAttemptBoundary } from './family-runtime-stage-quality-attempt-boundary.ts';

type StageAttemptActivities = {
  codexStageActivity(input: TemporalStageAttemptWorkflowInput): Promise<Record<string, unknown>>;
  domainHandlerDispatchActivity(input: TemporalStageAttemptWorkflowInput): Promise<Record<string, unknown>>;
  schedulerTickActivity(input: TemporalSchedulerTickWorkflowInput): Promise<Record<string, unknown>>;
  stageQualityAttemptMaterializeActivity(
    input: TemporalStageQualityAttemptMaterializationInput,
  ): Promise<{
    attempt_ref: string;
    workflow_input: TemporalStageAttemptWorkflowInput;
  }>;
  stageQualityCycleProjectActivity(
    input: TemporalStageQualityCycleProjectionInput,
  ): Promise<Record<string, unknown>>;
  stageQualityAttemptSyncActivity(
    input: TemporalStageQualityAttemptSyncInput,
  ): Promise<Record<string, unknown> | null>;
  stageQualityReviewReceiptActivity(
    input: TemporalStageQualityReviewReceiptInput,
  ): Promise<StageReviewReceipt>;
  stageRunRouteLaunchActivity(
    input: TemporalStageRunRouteLaunchInput,
  ): Promise<TemporalStageRunRouteLaunchReceipt>;
};

export const stageAttemptQuery = defineQuery<TemporalStageAttemptWorkflowState>('StageAttemptQuery');
export const stageRunQuery = defineQuery<TemporalStageRunWorkflowState>('StageRunQuery');
export const schedulerTickQuery = defineQuery<TemporalSchedulerTickWorkflowState>('SchedulerTickQuery');
export const humanGateSignal = defineSignal<[TemporalStageAttemptSignalPayload]>('HumanGateSignal');
export const ownerReceiptSignal = defineSignal<[TemporalStageAttemptSignalPayload]>('OwnerReceiptSignal');
export const userInstructionSignal = defineSignal<[TemporalStageAttemptSignalPayload]>('UserInstructionSignal');
export const resumeSignal = defineSignal<[TemporalStageAttemptSignalPayload]>('ResumeSignal');
export const stageAttemptOperatorUpdate = defineUpdate<
  TemporalStageAttemptOperatorUpdateReceipt,
  [TemporalStageAttemptSignalPayload]
>('StageAttemptOperatorUpdate');

const { codexStageActivity } = proxyActivities<Pick<StageAttemptActivities, 'codexStageActivity'>>({
  startToCloseTimeout: CODEX_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  heartbeatTimeout: CODEX_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  retry: {
    maximumAttempts: 1,
  },
});

const { domainHandlerDispatchActivity, schedulerTickActivity } = proxyActivities<Omit<StageAttemptActivities, 'codexStageActivity'>>({
  scheduleToCloseTimeout: SHORT_STAGE_ACTIVITY_SCHEDULE_TO_CLOSE_TIMEOUT,
  startToCloseTimeout: SHORT_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  heartbeatTimeout: SHORT_STAGE_ACTIVITY_HEARTBEAT_TIMEOUT,
  retry: {
    maximumAttempts: 3,
  },
});

const {
  stageQualityAttemptMaterializeActivity,
  stageQualityAttemptSyncActivity,
  stageQualityCycleProjectActivity,
  stageQualityReviewReceiptActivity,
  stageRunRouteLaunchActivity,
} = proxyActivities<Pick<
  StageAttemptActivities,
  | 'stageQualityAttemptMaterializeActivity'
  | 'stageQualityAttemptSyncActivity'
  | 'stageQualityCycleProjectActivity'
  | 'stageQualityReviewReceiptActivity'
  | 'stageRunRouteLaunchActivity'
>>({
  startToCloseTimeout: SHORT_STAGE_ACTIVITY_START_TO_CLOSE_TIMEOUT,
  retry: {
    maximumAttempts: 3,
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

function upsertStageAttemptVisibility(input: {
  enabled?: boolean;
  status: TemporalStageAttemptWorkflowState['status'];
  phase: string;
  blockedReason?: string | null;
}) {
  if (!input.enabled || !patched('opl-stage-attempt-visibility-status-v1')) {
    return;
  }
  upsertSearchAttributes({
    OplAttemptStatus: [input.status],
    OplStagePhase: [input.phase],
    OplBlockedReason: input.blockedReason ? [input.blockedReason] : [],
  });
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

function validateCloseoutPacketForWorkflow(input: {
  closeoutPacket: Record<string, unknown> | null;
  workflowInput: TemporalStageAttemptWorkflowInput;
}) {
  const closeoutPacket = input.closeoutPacket;
  if (!closeoutPacket) {
    return { closeoutPacket: null, providerBlocker: null };
  }
  const closeoutAttemptId = typeof closeoutPacket.stage_attempt_id === 'string' && closeoutPacket.stage_attempt_id.trim()
    ? closeoutPacket.stage_attempt_id.trim()
    : null;
  if (closeoutAttemptId && closeoutAttemptId !== input.workflowInput.stage_attempt_id) {
    return {
      closeoutPacket: null,
      providerBlocker: {
        blocked_reason: 'typed_closeout_stage_attempt_id_mismatch',
        route_impact: {
          provider_blocker_reason: 'typed_closeout_stage_attempt_id_mismatch',
          provider_blocker_surface: 'codex_stage_activity.closeout_packet.stage_attempt_id',
          expected_stage_attempt_id: input.workflowInput.stage_attempt_id,
          actual_stage_attempt_id: closeoutAttemptId,
        },
      },
    };
  }
  return { closeoutPacket, providerBlocker: null };
}

function validateOperatorActionPayload(signal: TemporalStageAttemptSignalPayload) {
  if (signal.signal_kind === 'human_gate') {
    const humanGateRef = typeof signal.payload.human_gate_ref === 'string'
      ? signal.payload.human_gate_ref.trim()
      : '';
    if (!humanGateRef) {
      throw new Error('human_gate update requires payload.human_gate_ref');
    }
  }
  if (signal.signal_kind === 'owner_receipt') {
    const ownerReceiptRef = typeof signal.payload.owner_receipt_ref === 'string'
      ? signal.payload.owner_receipt_ref.trim()
      : '';
    if (!ownerReceiptRef) {
      throw new Error('owner_receipt update requires payload.owner_receipt_ref');
    }
  }
  if (signal.signal_kind === 'user_instruction') {
    const instructionRef = typeof signal.payload.instruction_ref === 'string'
      ? signal.payload.instruction_ref.trim()
      : '';
    if (!instructionRef) {
      throw new Error('user_instruction update requires payload.instruction_ref');
    }
  }
  if (signal.signal_kind === 'resume') {
    const reason = typeof signal.payload.reason === 'string'
      ? signal.payload.reason.trim()
      : '';
    const resumeRef = typeof signal.payload.resume_ref === 'string'
      ? signal.payload.resume_ref.trim()
      : '';
    if (!reason && !resumeRef) {
      throw new Error('resume update requires payload.reason or payload.resume_ref');
    }
  }
}

export async function StageAttemptWorkflow(
  input: TemporalStageAttemptWorkflowInput,
): Promise<TemporalStageAttemptWorkflowState> {
  requireStageQualityAttemptBoundary(input as unknown as Record<string, unknown>);
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
    stage_progress_log: {
      surface_kind: 'temporal_workflow_stage_progress_log',
      planned_work: {
        stage_attempt_id: input.stage_attempt_id,
        workflow_id: input.workflow_id,
        domain_id: input.domain_id,
        stage_id: input.stage_id,
        executor_kind: input.executor_kind,
        task_id: input.task_id ?? null,
        stage_packet_ref: input.stage_packet_ref ?? null,
        checkpoint_refs: asStringList(input.checkpoint_refs),
      },
      timeline: [],
      visibility: {
        query: 'StageAttemptQuery',
        search_attribute_refs: {
          OplStageAttemptId: input.stage_attempt_id,
          OplDomainId: input.domain_id,
          OplStageId: input.stage_id,
          OplExecutorKind: input.executor_kind,
          OplTaskId: input.task_id ?? null,
          source_fingerprint: input.source_fingerprint ?? null,
        },
      },
    },
    checkpoint_refs: asStringList(input.checkpoint_refs),
    closeout_refs: [],
    consumed_refs: [],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: null,
    route_impact: asRecord(input.route_impact),
    human_gate_refs: [],
    owner_receipt_refs: [],
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
  const visibilitySearchAttributesUpsertEnabled =
    input.visibility_search_attributes_upsert_enabled === true;
  const updateVisibility = (
    phase: string,
    blockedReason?: string | null,
  ) => upsertStageAttemptVisibility({
    enabled: visibilitySearchAttributesUpsertEnabled,
    status: state.status,
    phase,
    blockedReason,
  });
  updateVisibility('registered');

  const recordSignal = (signal: TemporalStageAttemptSignalPayload) => {
    const status = signal.signal_kind === 'human_gate' ? 'human_gate' : state.status;
    state = {
      ...state,
      status,
      updated_at: nowIso(),
      signals: [...state.signals, signal],
      human_gate_refs: signal.signal_kind === 'human_gate' && typeof signal.payload.human_gate_ref === 'string'
        ? [...new Set([...state.human_gate_refs, signal.payload.human_gate_ref])]
        : state.human_gate_refs,
      owner_receipt_refs: signal.signal_kind === 'owner_receipt' && typeof signal.payload.owner_receipt_ref === 'string'
        ? [...new Set([...(state.owner_receipt_refs ?? []), signal.payload.owner_receipt_ref])]
        : state.owner_receipt_refs,
    };
    updateVisibility(signal.signal_kind === 'human_gate' ? 'human_gate' : 'operator_update');
  };

  const recordResume = (signal: TemporalStageAttemptSignalPayload) => {
    const status = state.status === 'human_gate' || state.status === 'failed' ? 'running' : state.status;
    state = {
      ...state,
      status,
      updated_at: nowIso(),
      signals: [...state.signals, signal],
    };
    updateVisibility('resume_requested');
  };

  setHandler(stageAttemptQuery, () => state);
  setHandler(humanGateSignal, recordSignal);
  setHandler(ownerReceiptSignal, recordSignal);
  setHandler(userInstructionSignal, recordSignal);
  setHandler(resumeSignal, recordResume);
  setHandler(
    stageAttemptOperatorUpdate,
    (signal) => {
      if (signal.signal_kind === 'resume') {
        recordResume(signal);
      } else {
        recordSignal(signal);
      }
      return {
        surface_kind: 'temporal_stage_attempt_operator_update_receipt',
        provider_kind: 'temporal',
        update_status: 'accepted',
        stage_attempt_id: state.stage_attempt_id,
        workflow_id: state.workflow_id,
        signal_kind: signal.signal_kind,
        signal_count: state.signals.length,
        updated_at: state.updated_at,
        authority_boundary: {
          opl: 'temporal_update_ack_and_transport_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
          provider_completion_is_domain_ready: false,
        },
      };
    },
    {
      validator: validateOperatorActionPayload,
    },
  );

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
      stage_progress_log: {
        ...state.stage_progress_log,
        timeline: [
          ...state.stage_progress_log.timeline,
          {
            event_kind: 'codex_stage_activity_started',
            activity_kind: 'codex_stage_activity',
            activity_status: 'running',
            observed_at: nowIso(),
            stage_packet_ref: input.stage_packet_ref ?? null,
          },
        ],
      },
    };
    updateVisibility('codex_stage_activity_running');
    const codexResult = await codexStageActivity(input);
    const codexCheckpointRefs = asStringList(codexResult.checkpoint_refs);
    const codexActivityEvent = codexActivityEventForTemporalHistory(codexResult);
    state = {
      ...state,
      status: codexCheckpointRefs.length > 0 ? 'checkpointed' : 'running',
      updated_at: nowIso(),
      checkpoint_refs: [...new Set([...state.checkpoint_refs, ...codexCheckpointRefs])],
      activity_events: [
        ...state.activity_events,
        codexActivityEvent,
      ],
      stage_progress_log: {
        ...state.stage_progress_log,
        timeline: [
          ...state.stage_progress_log.timeline,
          {
            event_kind: 'codex_stage_activity_completed',
            activity_kind: 'codex_stage_activity',
            activity_status: 'completed',
            observed_at: nowIso(),
            checkpoint_refs: codexCheckpointRefs,
          },
        ],
      },
    };
    updateVisibility('codex_stage_activity_completed');

    const codexCloseoutValidation = validateCloseoutPacketForWorkflow({
      closeoutPacket: closeoutPacketFromCodexResult(codexResult),
      workflowInput: input,
    });
    const codexCloseoutPacket = codexCloseoutValidation.closeoutPacket;
    const providerBlocker = codexCloseoutValidation.providerBlocker ?? providerBlockerFromCodexResult(codexResult);
    const dispatchResult = await domainHandlerDispatchActivity({
      ...input,
      closeout_packet: codexCloseoutPacket ?? input.closeout_packet ?? null,
      provider_blocker: providerBlocker,
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
          activity_kind: 'domain_handler_dispatch_activity',
          activity_status: 'completed',
          ...dispatchResult,
        },
      ],
      stage_progress_log: {
        ...state.stage_progress_log,
        timeline: [
          ...state.stage_progress_log.timeline,
          {
            event_kind: 'domain_handler_dispatch_activity_completed',
            activity_kind: 'domain_handler_dispatch_activity',
            activity_status: 'completed',
            observed_at: nowIso(),
            closeout_refs: closeoutRefs,
            blocked_reason: dispatchBlockedReason,
          },
        ],
      },
      completion_boundary: {
        provider_completion: providerCompleted ? 'completed' : 'not_completed',
        domain_ready_verdict: providerCompleted && typeof dispatchResult.domain_ready_verdict === 'string'
          ? dispatchResult.domain_ready_verdict
          : null,
        provider_completion_is_domain_ready: false,
      },
    };
    updateVisibility(
      providerCompleted ? 'domain_handler_dispatch_completed' : 'domain_handler_dispatch_blocked',
      dispatchBlockedReason,
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    state = {
      ...state,
      status: 'failed',
      updated_at: nowIso(),
      activity_events: [
        ...state.activity_events,
        {
          activity_kind: 'temporal_stage_attempt_workflow',
          activity_status: 'failed',
          error: errorMessage,
        },
      ],
      stage_progress_log: {
        ...state.stage_progress_log,
        timeline: [
          ...state.stage_progress_log.timeline,
          {
            event_kind: 'temporal_stage_attempt_workflow_failed',
            activity_kind: 'temporal_stage_attempt_workflow',
            activity_status: 'failed',
            observed_at: nowIso(),
            error: errorMessage,
          },
        ],
      },
    };
    updateVisibility('temporal_stage_attempt_workflow_failed', errorMessage.slice(0, 200));
    if (input.attempt_role) {
      return state;
    }
    throw error;
  }

  await condition(() => false, '1 second');
  return state;
}

function qualityEnvelopeFromAttempt(state: TemporalStageAttemptWorkflowState) {
  const closeout = asRecord(state.closeout_packet);
  const routeImpact = asRecord(closeout.route_impact);
  return asRecord(routeImpact.stage_quality_cycle);
}

function executionSessionRefFromAttemptState(state: TemporalStageAttemptWorkflowState) {
  for (let index = state.activity_events.length - 1; index >= 0; index -= 1) {
    const event = asRecord(state.activity_events[index]);
    if (event.activity_kind !== 'codex_stage_activity') continue;
    const progress = asRecord(event.progress_summary);
    if (typeof progress.execution_session_ref === 'string' && progress.execution_session_ref) {
      return progress.execution_session_ref;
    }
    if (typeof progress.thread_id === 'string' && progress.thread_id) {
      return `codex://threads/${progress.thread_id}`;
    }
  }
  return null;
}

function qualityArtifactIdentity(
  state: TemporalStageAttemptWorkflowState,
  value: Record<string, unknown>,
  inputIdentity?: {
    artifactRefs: string[];
    artifactHashes: string[];
    artifactIdentityReceiptRefs: string[];
  },
) {
  const artifactRefs = asStringList(value.artifact_refs);
  const artifactHashes = asStringList(value.artifact_hashes);
  if (artifactRefs.length === 0 && inputIdentity) return inputIdentity;
  if (artifactRefs.length === 0 || artifactRefs.length !== artifactHashes.length) {
    throw new Error('Stage quality attempt must return equal non-empty artifact_refs and artifact_hashes.');
  }
  if (
    inputIdentity
    && (
      JSON.stringify(artifactRefs) !== JSON.stringify(inputIdentity.artifactRefs)
      || JSON.stringify(artifactHashes) !== JSON.stringify(inputIdentity.artifactHashes)
    )
  ) {
    throw new Error('Reviewer Attempt cannot replace the exact artifact identity it was asked to review.');
  }
  if (inputIdentity) return inputIdentity;

  const closeout = asRecord(state.closeout_packet);
  const metadata = asRecordList(closeout.closeout_ref_metadata);
  const receiptRefs = artifactRefs.map((artifactRef, index) => {
    const entry = metadata.find((candidate) => candidate.ref === artifactRef || candidate.uri === artifactRef);
    if (!entry || typeof entry.sha256 !== 'string' || entry.sha256 !== artifactHashes[index]) {
      throw new Error(
        'Producer and repairer artifact identity must match domain-owned closeout_ref_metadata SHA receipts.',
      );
    }
    return artifactRef;
  });
  return {
    artifactRefs,
    artifactHashes,
    artifactIdentityReceiptRefs: receiptRefs,
  };
}

function findingList(value: unknown) {
  return validateStageQualityFindings(asRecordList(value) as StageQualityFinding[]);
}

function repairMapList(value: unknown, findings: StageQualityFinding[]) {
  return validateStageQualityRepairMap({
    findings,
    repairMap: asRecordList(value) as StageQualityRepairMapEntry[],
  });
}

function findingClosureList(value: unknown) {
  return asRecordList(value) as StageQualityFindingClosure[];
}

function qualityOutcome(value: Record<string, unknown>) {
  const outcome = typeof value.outcome === 'string' ? value.outcome : null;
  if (
    outcome === 'pass'
    || outcome === 'repair_required'
    || outcome === 'quality_debt'
    || outcome === 'blocked'
    || outcome === 'human_gate'
  ) {
    return outcome;
  }
  throw new Error('Stage quality attempt returned an invalid outcome.');
}

function stageRunQualityCycleId(input: TemporalStageRunWorkflowInput) {
  return `quality-cycle:${input.stage_run_id}`;
}

function validateWorkflowStageRunInput(input: TemporalStageRunWorkflowInput) {
  for (const [field, value] of Object.entries({
    stage_run_id: input.stage_run_id,
    quality_policy_ref: input.quality_policy_ref,
    domain_pack_root: input.domain_pack_root,
    stage_manifest_ref: input.stage_manifest_ref,
    stage_manifest_sha256: input.stage_manifest_sha256,
  })) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`StageRun pack binding requires ${field}.`);
    }
  }
  const roleKeys = Object.keys(input.role_prompt_refs ?? {}).sort();
  if (JSON.stringify(roleKeys) !== JSON.stringify(['producer', 're_reviewer', 'repairer', 'reviewer'])) {
    throw new Error('StageRun role_prompt_refs must use only producer, reviewer, repairer, and re_reviewer.');
  }
  const maxRepairRounds = input.quality_policy?.formal_review?.max_repair_rounds;
  if (!Number.isInteger(maxRepairRounds) || maxRepairRounds < 0 || maxRepairRounds > 3) {
    throw new Error('StageRun quality repair budget must be between zero and three.');
  }
  if (!Array.isArray(input.quality_rubric_refs) || input.quality_rubric_refs.length === 0) {
    throw new Error('StageRun quality rubric refs are required.');
  }
  if (
    !Array.isArray(input.declared_stage_ids)
    || input.declared_stage_ids.length === 0
    || !input.declared_stage_ids.includes(input.stage_id)
  ) {
    throw new Error('StageRun route transport requires declared Stage ids including the current Stage.');
  }
  if (input.stage_role === 'cross_stage_meta_review' && input.quality_policy.formal_review.required) {
    throw new Error('Cross-stage Meta Review Stage cannot recursively require formal Stage Review.');
  }
}

function stageRunStopped(state: TemporalStageRunWorkflowState) {
  return ['completed_with_quality_debt', 'blocked', 'human_gate', 'failed'].includes(state.status);
}

function hasConsumableArtifact(state: TemporalStageRunWorkflowState) {
  return state.artifact_refs.length > 0
    && state.artifact_refs.length === state.artifact_hashes.length;
}

const HARD_STAGE_QUALITY_STOP_CLASSES = new Set([
  'zero_consumable_artifact',
  'safety_or_compliance',
  'permission_or_credential_boundary',
  'human_decision_required',
  'authority_boundary_violation',
  'stale_or_mismatched_stage_identity',
]);

function qualityFailureRef(input: TemporalStageRunWorkflowInput, reason: string) {
  return `opl://stage-runs/${encodeURIComponent(input.stage_run_id)}/quality-debt/${encodeURIComponent(reason)}`;
}

function declaredHardStop(envelope: Record<string, unknown>) {
  return typeof envelope.hard_stop_class === 'string'
    && HARD_STAGE_QUALITY_STOP_CLASSES.has(envelope.hard_stop_class);
}

function reviewVerdictForOutcome(outcome: ReturnType<typeof qualityOutcome>): StageReviewReceipt['verdict'] {
  if (outcome === 'pass') return 'pass';
  if (outcome === 'repair_required') return 'repair_required';
  if (outcome === 'quality_debt') return 'quality_debt';
  return 'hard_stop';
}

export async function StageRunWorkflow(
  input: TemporalStageRunWorkflowInput,
): Promise<TemporalStageRunWorkflowState> {
  validateWorkflowStageRunInput(input);
  const qualityCycleId = stageRunQualityCycleId(input);
  let state: TemporalStageRunWorkflowState = {
    surface_kind: 'temporal_stage_run_query',
    provider_kind: 'temporal',
    stage_run_id: input.stage_run_id,
    workflow_id: input.workflow_id,
    quality_cycle_id: qualityCycleId,
    domain_id: input.domain_id,
    stage_id: input.stage_id,
    status: 'registered',
    current_role: null,
    repair_rounds_used: 0,
    max_repair_rounds: input.quality_policy.formal_review.max_repair_rounds,
    attempts: [],
    findings: [],
    repair_map: [],
    finding_closures: [],
    review_receipts: [],
    artifact_refs: asStringList(input.artifact_refs),
    artifact_hashes: asStringList(input.artifact_hashes),
    artifact_identity_receipt_refs: [],
    quality_debt_refs: [],
    route_quality_debt_refs: [],
    decisive_attempt_role: null,
    decisive_attempt_ref: null,
    selected_stage_route: null,
    route_evidence_refs: [],
    route_recommendations: [],
    next_stage_run_launch: null,
    blocked_reason: null,
    sqlite_projection: { status: 'pending', error: null },
    started_at: nowIso(),
    updated_at: nowIso(),
    authority_boundary: {
      opl: 'durable_quality_loop_orchestration_and_refs_transport_only',
      domain: 'review_findings_repair_artifact_and_quality_verdict_owner',
      provider_completion_is_domain_ready: false,
    },
  };
  setHandler(stageRunQuery, () => state);
  const observedSessions = new Set<string>();

  const terminalize = async (nextState: TemporalStageRunWorkflowState) => {
    const routeDecisionRequired = nextState.status === 'completed'
      || nextState.status === 'completed_with_quality_debt';
    state = routeDecisionRequired && !nextState.selected_stage_route
      ? {
          ...nextState,
          route_quality_debt_refs: [...new Set([
            ...nextState.route_quality_debt_refs,
            qualityFailureRef(input, 'decisive_attempt_route_decision_missing'),
          ])],
        }
      : nextState;
    if (
      routeDecisionRequired
      && state.selected_stage_route
      && state.decisive_attempt_ref
    ) {
      const nextStageRunLaunch = await stageRunRouteLaunchActivity({
        parent_stage_run: input,
        decisive_attempt_ref: state.decisive_attempt_ref,
        decision: state.selected_stage_route,
        artifact_refs: state.artifact_refs,
        artifact_hashes: state.artifact_hashes,
      });
      state = {
        ...state,
        next_stage_run_launch: nextStageRunLaunch,
        updated_at: nowIso(),
      };
    }
    try {
      await stageQualityCycleProjectActivity({ stage_run: input, state });
      state = { ...state, sqlite_projection: { status: 'synced', error: null } };
    } catch (error) {
      state = {
        ...state,
        sqlite_projection: {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
    return state;
  };

  const runAttempt = async (attemptInput: {
    role: StageQualityAttemptRole;
    round: number;
    parentAttemptRef?: string | null;
    artifactRefs: string[];
    artifactHashes: string[];
    artifactIdentityReceiptRefs: string[];
    findings?: StageQualityFinding[];
    repairMap?: StageQualityRepairMapEntry[];
  }) => {
    state = { ...state, status: 'running', current_role: attemptInput.role, updated_at: nowIso() };
    const materialized = await stageQualityAttemptMaterializeActivity({
      stage_run: input,
      quality_cycle_id: qualityCycleId,
      attempt_role: attemptInput.role,
      quality_round_index: attemptInput.round,
      parent_attempt_ref: attemptInput.parentAttemptRef,
      artifact_refs: attemptInput.artifactRefs,
      artifact_hashes: attemptInput.artifactHashes,
      artifact_identity_receipt_refs: attemptInput.artifactIdentityReceiptRefs,
      findings: attemptInput.findings,
      repair_map: attemptInput.repairMap,
    });
    const childInput = materialized.workflow_input;
    const result = await executeChild(StageAttemptWorkflow, {
      args: [childInput],
      workflowId: childInput.workflow_id,
    });
    await stageQualityAttemptSyncActivity({
      attempt_ref: materialized.attempt_ref,
      workflow_state: result,
    });
    const executionSessionRef = executionSessionRefFromAttemptState(result);
    if (!executionSessionRef) {
      throw new Error(`Stage quality ${attemptInput.role} Attempt did not expose an execution session identity.`);
    }
    if (observedSessions.has(executionSessionRef)) {
      throw new Error(`Stage quality Attempt reused provider session ${executionSessionRef}.`);
    }
    observedSessions.add(executionSessionRef);
    const envelope = qualityEnvelopeFromAttempt(result);
    const reviewRole = attemptInput.role === 'reviewer' || attemptInput.role === 're_reviewer';
    const attemptReturnedArtifactIdentity = asStringList(envelope.artifact_refs).length > 0;
    const artifactIdentity = result.status === 'completed' || (!reviewRole && attemptReturnedArtifactIdentity)
      ? qualityArtifactIdentity(
          result,
          envelope,
          reviewRole
            ? {
                artifactRefs: attemptInput.artifactRefs,
                artifactHashes: attemptInput.artifactHashes,
                artifactIdentityReceiptRefs: attemptInput.artifactIdentityReceiptRefs,
              }
            : undefined,
        )
      : {
          artifactRefs: attemptInput.artifactRefs,
          artifactHashes: attemptInput.artifactHashes,
          artifactIdentityReceiptRefs: attemptInput.artifactIdentityReceiptRefs,
        };
    const routeImpact = asRecord(asRecord(result.closeout_packet).route_impact);
    const routeEvaluation = evaluateStageQualityAttemptRoute({
      attempt: childInput as unknown as Record<string, unknown>,
      routeImpact,
    });
    const routeRejectionReasons = [
      ...routeEvaluation.decision_rejection_reasons,
      ...routeEvaluation.recommendation_rejection_reasons,
    ];
    state = {
      ...state,
      attempts: [...state.attempts, {
        attempt_role: attemptInput.role,
        quality_round_index: attemptInput.round,
        stage_attempt_id: childInput.stage_attempt_id,
        workflow_id: childInput.workflow_id,
        execution_session_ref: executionSessionRef,
        status: result.status,
        artifact_refs: artifactIdentity.artifactRefs,
        artifact_hashes: artifactIdentity.artifactHashes,
        artifact_identity_receipt_refs: artifactIdentity.artifactIdentityReceiptRefs,
      }],
      artifact_refs: artifactIdentity.artifactRefs,
      artifact_hashes: artifactIdentity.artifactHashes,
      artifact_identity_receipt_refs: artifactIdentity.artifactIdentityReceiptRefs,
      route_quality_debt_refs: [
        ...new Set([
          ...state.route_quality_debt_refs,
          ...routeRejectionReasons.map((reason) => qualityFailureRef(input, `route-output:${reason}`)),
        ]),
      ],
      route_recommendations: routeEvaluation.recommendation
        ? [...state.route_recommendations, {
            attempt_ref: materialized.attempt_ref,
            attempt_role: attemptInput.role,
            quality_round_index: attemptInput.round,
            recommendation: routeEvaluation.recommendation,
          }]
        : state.route_recommendations,
      updated_at: nowIso(),
    };
    if (result.status === 'human_gate') {
      state = { ...state, status: 'human_gate', current_role: null, blocked_reason: 'human_gate' };
    } else if (result.status === 'blocked' || result.status === 'failed') {
      const reason = typeof envelope.blocked_reason === 'string'
        ? envelope.blocked_reason
        : `stage_quality_${attemptInput.role}_not_completed`;
      const recoverableAttemptCanContinue = hasConsumableArtifact(state)
        && !declaredHardStop(envelope)
        && (
          (attemptInput.role === 'producer' && input.quality_policy.formal_review.required)
          || attemptInput.role === 'repairer'
        );
      state = recoverableAttemptCanContinue
        ? {
            ...state,
            status: 'running',
            current_role: null,
            blocked_reason: null,
          }
        : hasConsumableArtifact(state) && !declaredHardStop(envelope)
          ? {
            ...state,
            status: 'completed_with_quality_debt',
            current_role: null,
            quality_debt_refs: [...new Set([...state.quality_debt_refs, qualityFailureRef(input, reason)])],
            blocked_reason: null,
          }
          : {
            ...state,
            status: 'blocked',
            current_role: null,
            blocked_reason: reason,
          };
    }
    return {
      result,
      envelope,
      attemptRole: attemptInput.role,
      attemptRef: materialized.attempt_ref,
      executionSessionRef,
      routeEvaluation,
      reviewedArtifactRefs: attemptInput.artifactRefs,
      reviewedArtifactHashes: attemptInput.artifactHashes,
    };
  };

  const commitTerminalRouteDecision = (attempt: Awaited<ReturnType<typeof runAttempt>>) => {
    if (!attempt.routeEvaluation.decision) return;
    state = {
      ...state,
      decisive_attempt_role: attempt.attemptRole,
      decisive_attempt_ref: attempt.attemptRef,
      selected_stage_route: attempt.routeEvaluation.decision,
      route_evidence_refs: attempt.routeEvaluation.decision.evidence_refs,
      updated_at: nowIso(),
    };
  };

  try {
    let parentAttemptRef: string | null = null;
    const producer = await runAttempt({
      role: 'producer',
      round: 0,
      artifactRefs: state.artifact_refs,
      artifactHashes: state.artifact_hashes,
      artifactIdentityReceiptRefs: state.artifact_identity_receipt_refs,
    });
    parentAttemptRef = producer.attemptRef;
    if (stageRunStopped(state)) {
      if (!input.quality_policy.formal_review.required && state.status === 'completed_with_quality_debt') {
        commitTerminalRouteDecision(producer);
      }
      return terminalize(state);
    }
    if (!input.quality_policy.formal_review.required) {
      commitTerminalRouteDecision(producer);
      return terminalize({ ...state, status: 'completed', current_role: null, updated_at: nowIso() });
    }

    const review = await runAttempt({
      role: 'reviewer',
      round: 0,
      parentAttemptRef,
      artifactRefs: state.artifact_refs,
      artifactHashes: state.artifact_hashes,
      artifactIdentityReceiptRefs: state.artifact_identity_receipt_refs,
    });
    parentAttemptRef = review.attemptRef;
    if (stageRunStopped(state)) return terminalize(state);
    const initialOutcome = qualityOutcome(review.envelope);
    const initialReviewReceipt = await stageQualityReviewReceiptActivity({
      producer_attempt_ref: producer.attemptRef,
      reviewer_attempt_ref: review.attemptRef,
      rubric_refs: input.quality_rubric_refs,
      verdict: reviewVerdictForOutcome(initialOutcome),
    });
    let findings = findingList(review.envelope.findings);
    state = { ...state, findings, review_receipts: [...state.review_receipts, initialReviewReceipt] };
    if (initialOutcome === 'pass') {
      commitTerminalRouteDecision(review);
      return terminalize({ ...state, status: 'completed', current_role: null, updated_at: nowIso() });
    }
    if (initialOutcome === 'quality_debt') {
      commitTerminalRouteDecision(review);
      return terminalize({
        ...state,
        status: 'completed_with_quality_debt',
        current_role: null,
        quality_debt_refs: asStringList(review.envelope.quality_debt_refs),
        updated_at: nowIso(),
      });
    }
    if (initialOutcome === 'blocked' || initialOutcome === 'human_gate') {
      const reason = typeof review.envelope.blocked_reason === 'string'
        ? review.envelope.blocked_reason
        : initialOutcome;
      const hardStop = initialOutcome === 'human_gate'
        || declaredHardStop(review.envelope)
        || !hasConsumableArtifact(state);
      return terminalize({
        ...state,
        status: hardStop ? initialOutcome : 'completed_with_quality_debt',
        current_role: null,
        blocked_reason: hardStop ? reason : null,
        quality_debt_refs: hardStop
          ? state.quality_debt_refs
          : [...new Set([...state.quality_debt_refs, qualityFailureRef(input, reason)])],
        updated_at: nowIso(),
      });
    }

    let lastReReview: Awaited<ReturnType<typeof runAttempt>> | null = null;
    for (let round = 1; round <= state.max_repair_rounds; round += 1) {
      const repair = await runAttempt({
        role: 'repairer',
        round,
        parentAttemptRef,
        artifactRefs: state.artifact_refs,
        artifactHashes: state.artifact_hashes,
        artifactIdentityReceiptRefs: state.artifact_identity_receipt_refs,
        findings,
      });
      parentAttemptRef = repair.attemptRef;
      if (stageRunStopped(state)) return terminalize(state);
      const repairMap = repairMapList(repair.envelope.repair_map, findings);
      state = { ...state, repair_map: repairMap };
      const reReview = await runAttempt({
        role: 're_reviewer',
        round,
        parentAttemptRef,
        artifactRefs: state.artifact_refs,
        artifactHashes: state.artifact_hashes,
        artifactIdentityReceiptRefs: state.artifact_identity_receipt_refs,
        findings,
        repairMap,
      });
      lastReReview = reReview;
      parentAttemptRef = reReview.attemptRef;
      state = { ...state, repair_rounds_used: round };
      if (stageRunStopped(state)) return terminalize(state);
      const reReviewResult: StageQualityReReviewResult = {
        finding_closures: findingClosureList(reReview.envelope.finding_closures),
        repair_regressions: findingList(reReview.envelope.repair_regressions),
        critical_new_findings: findingList(reReview.envelope.critical_new_findings),
        optional_observations: asRecordList(reReview.envelope.optional_observations) as StageQualityReReviewResult['optional_observations'],
      };
      const closure = evaluateStageQualityFindingClosure({ findings, repairMap, reReview: reReviewResult });
      const reReviewReceipt = await stageQualityReviewReceiptActivity({
        producer_attempt_ref: repair.attemptRef,
        reviewer_attempt_ref: reReview.attemptRef,
        rubric_refs: input.quality_rubric_refs,
        verdict: closure.trigger_repair ? 'repair_required' : 'pass',
      });
      state = {
        ...state,
        finding_closures: reReviewResult.finding_closures,
        review_receipts: [...state.review_receipts, reReviewReceipt],
      };
      if (!closure.trigger_repair) {
        commitTerminalRouteDecision(reReview);
        return terminalize({ ...state, status: 'completed', current_role: null, updated_at: nowIso() });
      }
      const openIds = new Set(closure.open_required_finding_ids);
      findings = [
        ...findings.filter((finding) => openIds.has(finding.finding_id)),
        ...reReviewResult.repair_regressions,
        ...reReviewResult.critical_new_findings,
      ];
      state = { ...state, findings };
    }

    if (lastReReview) commitTerminalRouteDecision(lastReReview);

    if (state.artifact_refs.length === 0 || state.artifact_hashes.length === 0) {
      return terminalize({
        ...state,
        status: 'blocked',
        current_role: null,
        blocked_reason: 'stage_quality_budget_exhausted_without_consumable_artifact',
        updated_at: nowIso(),
      });
    }
    return terminalize({
      ...state,
      status: 'completed_with_quality_debt',
      current_role: null,
      quality_debt_refs: [
        ...new Set([
          ...state.quality_debt_refs,
          ...state.findings.map((finding) => `quality-debt:${finding.finding_id}`),
        ]),
      ],
      updated_at: nowIso(),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return terminalize(hasConsumableArtifact(state)
      ? {
          ...state,
          status: 'completed_with_quality_debt',
          current_role: null,
          quality_debt_refs: [...new Set([...state.quality_debt_refs, qualityFailureRef(input, reason)])],
          blocked_reason: null,
          updated_at: nowIso(),
        }
      : {
          ...state,
          status: 'blocked',
          current_role: null,
          blocked_reason: 'stage_quality_failed_without_consumable_artifact',
          updated_at: nowIso(),
        });
  }
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
      opl: 'scheduler_cadence_provider_slo_and_queue_projection_bridge',
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

export const ReconcileWorkflow = SchedulerTickWorkflow;
