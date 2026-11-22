import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { isCancellation, condition, patched, setHandler, upsertSearchAttributes } from '@temporalio/workflow';
import type { TemporalStageAttemptWorkflowInput, TemporalStageAttemptWorkflowState, TemporalStageAttemptSignalPayload } from './family-runtime-temporal.ts';
import {
  humanGateSignal,
  ownerReceiptSignal,
  userInstructionSignal,
  resumeSignal,
  stageAttemptOperatorUpdate,
  stageAttemptQuery,
} from './family-runtime-temporal-workflow-controls.ts';
import { codexStageActivity, domainHandlerDispatchActivity } from './family-runtime-temporal-workflow-activities.ts';
import {
  asRecord,
  asRecordList,
  asStringList,
  closeoutPacketFromCodexResult,
  closeoutRefsFrom,
  nowIso,
  requiredRecordList,
  upsertStageAttemptVisibility,
  validateCloseoutPacketForWorkflow,
  validateOperatorActionPayload,
} from './family-runtime-temporal-workflow-shared.ts';
import { codexActivityEventForTemporalHistory, providerBlockerFromCodexResult } from './family-runtime-temporal-history-summary.ts';
import { isStageRunQualityAttempt, requireGenericResumeAllowed, requireStageQualityAttemptBoundary, requireStageRunAttemptContentBindingVersion } from './family-runtime-stage-quality-attempt-boundary.ts';
import {
  validateInitialStageQualityReviewOutcome,
  type StageQualityFinding,
} from '../../authority/stages/public/stage-quality-cycle.ts';

function initialRepairFindingsError(routeImpact: Record<string, unknown>): FrameworkContractError | null {
  const envelope = asRecord(routeImpact.stage_quality_cycle);
  if (envelope.outcome !== 'repair_required') return null;
  try {
    validateInitialStageQualityReviewOutcome({
      outcome: 'repair_required',
      findings: requiredRecordList(envelope.findings, 'findings') as StageQualityFinding[],
    });
  } catch (error) {
    if (!(error instanceof FrameworkContractError)) throw error;
    return error;
  }
  return null;
}

export async function StageAttemptWorkflow(
  input: TemporalStageAttemptWorkflowInput,
): Promise<TemporalStageAttemptWorkflowState> {
  const allowLegacyUnboundContent = !patched('opl-stage-run-attempt-content-binding-v1');
  const cancellationPropagationEnabled = patched('opl-stage-run-child-cancellation-propagation-v1');
  const initialRepairFindingsRequired = patched('opl-stage-attempt-initial-review-repair-findings-v1');
  const currentStageRunAttemptProtocol = !allowLegacyUnboundContent;
  const stageRunQualityAttempt = isStageRunQualityAttempt(input as unknown as Record<string, unknown>);
  let state: TemporalStageAttemptWorkflowState = {
    surface_kind: 'temporal_stage_attempt_query',
    provider_kind: 'temporal',
    stage_attempt_id: input.stage_attempt_id,
    stage_run_id: input.stage_run_id ?? null,
    workflow_id: input.workflow_id,
    scope_kind: input.scope_kind ?? (input.execution_scope ? 'work_item' : 'domain'),
    execution_scope: input.execution_scope ?? null,
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
          OplStageRunId: input.stage_run_id ?? null,
          OplWorkItemScopeId: input.execution_scope?.work_item_scope_id ?? null,
        },
        workflow_identity: {
          project_scope_id: input.execution_scope?.project_scope_id ?? null,
          work_item_scope_id: input.execution_scope?.work_item_scope_id ?? null,
          workspace_binding_id: input.execution_scope?.workspace_binding_id ?? null,
          scope_digest: input.execution_scope?.scope_digest ?? null,
          domain_id: input.domain_id,
          stage_id: input.stage_id,
          executor_kind: input.executor_kind,
          task_id: input.task_id ?? null,
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
  const validateAndRecord = (
    signal: TemporalStageAttemptSignalPayload,
    record: (value: TemporalStageAttemptSignalPayload) => void,
  ) => {
    validateOperatorActionPayload(signal, input);
    record(signal);
  };
  let forbiddenGenericResume: TemporalStageAttemptSignalPayload | null = null;
  const rejectGenericResume = (signal: TemporalStageAttemptSignalPayload) => {
    forbiddenGenericResume = signal;
    state = {
      ...state,
      status: 'failed',
      updated_at: nowIso(),
      signals: [...state.signals, signal],
      route_impact: {
        ...state.route_impact,
        generic_resume_rejection: { failure_code: 'stage_run_quality_attempt_generic_resume_forbidden',
          source: signal.source ?? null },
      },
    };
    updateVisibility('generic_resume_rejected', 'stage_run_quality_attempt_generic_resume_forbidden');
  };
  const requireNoForbiddenGenericResume = () => forbiddenGenericResume
    ? requireGenericResumeAllowed(input as unknown as Record<string, unknown>, 'resume')
    : undefined;
  setHandler(stageAttemptQuery, () => state);
  setHandler(humanGateSignal, (signal) => validateAndRecord(signal, recordSignal));
  setHandler(ownerReceiptSignal, (signal) => validateAndRecord(signal, recordSignal));
  setHandler(userInstructionSignal, (signal) => validateAndRecord(signal, recordSignal));
  setHandler(resumeSignal, (signal) => validateAndRecord(
    signal,
    stageRunQualityAttempt && currentStageRunAttemptProtocol ? rejectGenericResume : recordResume,
  ));
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
        stage_run_id: state.stage_run_id ?? null,
        workflow_id: state.workflow_id,
        scope_kind: state.scope_kind,
        execution_scope: state.execution_scope,
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
      validator: (signal) => {
        validateOperatorActionPayload(signal, input);
        if (currentStageRunAttemptProtocol) requireGenericResumeAllowed(input as unknown as Record<string, unknown>, signal.signal_kind);
      },
    },
  );
  try {
    requireStageRunAttemptContentBindingVersion(input as unknown as Record<string, unknown>, { allowLegacyUnbound: allowLegacyUnboundContent });
    requireStageQualityAttemptBoundary(input as unknown as Record<string, unknown>);
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
    requireNoForbiddenGenericResume();
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
    const dispatched = await domainHandlerDispatchActivity({
      ...input,
      closeout_packet: codexCloseoutPacket ?? input.closeout_packet ?? null,
      provider_blocker: providerBlocker,
    });
    requireNoForbiddenGenericResume();
    const closeoutRefs = closeoutRefsFrom(dispatched);
    const reviewError = initialRepairFindingsRequired && input.attempt_role === 'reviewer'
      && !dispatched.blocked_reason && closeoutRefs.length > 0
      ? initialRepairFindingsError(asRecord(dispatched.route_impact))
      : null;
    const dispatchResult = reviewError
      ? {
          ...dispatched,
          activity_status: 'blocked',
          blocked_reason: 'stage_quality_review_repair_findings_invalid',
          next_owner: null,
          domain_ready_verdict: null,
          route_impact: {
            review_protocol_rejection: {
              message: reviewError.message,
              ...(typeof reviewError.details?.field === 'string' ? { field: reviewError.details.field } : {}),
            },
          },
        }
      : dispatched;
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
    if (cancellationPropagationEnabled && isCancellation(error)) throw error;
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

  const operatorUpdateWindowMs = Number.isFinite(
    asRecord(input.route_impact).operator_update_window_ms,
  )
    ? Math.max(1_000, Math.min(
      60_000,
      Number(asRecord(input.route_impact).operator_update_window_ms),
    ))
    : 1_000;
  await condition(() => false, `${operatorUpdateWindowMs} milliseconds`);
  return state;
}
