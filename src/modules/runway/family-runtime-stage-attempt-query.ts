import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stringValue } from '../../kernel/json-record.ts';
import { buildCodexStageActivityInput } from './family-runtime-codex-stage-runner.ts';
import { buildFamilyRuntimeControlledApplyContract } from './family-runtime-controlled-apply.ts';
import { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
import {
  buildFamilyConflictSubject,
  buildStageAttemptConflictOrBlockerEnvelopes,
  canonicalOutcomeForStageAttempt,
} from '../stagecraft/index.ts';
import {
  inspectStageAttemptPayload,
  listStageAttemptCloseouts,
  listStageAttemptSignals,
} from './family-runtime-stage-attempt-ledger.ts';
import {
  buildTemporalStageAttemptWorkflowContract,
  buildTemporalStageAttemptWorkflowInput,
} from './family-runtime-temporal.ts';
import { buildAttemptGenericProjections } from './stage-attempt-projections/stage-attempt-generic-projections.ts';
import { buildAttemptHumanReviewBurdenBudget } from '../stagecraft/index.ts';
import { buildStageProgressLog } from './family-runtime-stage-progress-log.ts';
import { buildStageAttemptTruePathProof } from './family-runtime-stage-attempt-true-path-proof.ts';
import { buildModelRouteCostProjection } from './family-runtime-stage-attempt-usage.ts';
import type { TemporalStageAttemptVisibilityReadiness } from './family-runtime-temporal-visibility.ts';
import { providerReadinessCurrentness } from './family-runtime-stage-attempt-provider-readiness-currentness.ts';
import { buildStageAttemptRuntimeCurrentness } from './family-runtime-stage-attempt-runtime-currentness.ts';
import {
  buildStageAttemptCloseoutRefsOnlyContract,
  buildStageAttemptLaunchEnvelope,
} from '../stagecraft/index.ts';
import {
  FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS,
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS,
  FAMILY_RUNTIME_TASK_COLUMNS,
} from './family-runtime-queue-projection-boundary.ts';
import { deriveCurrentControlStateForAttempt } from './family-runtime-current-control-state.ts';
import { projectOplDomainTaskRuntimeContext } from './family-runtime-domain-task-runtime-context.ts';

type QueryStageAttemptOptions = {
  temporalVisibilityReadiness?: TemporalStageAttemptVisibilityReadiness | null;
  temporalQuery?: Record<string, unknown> | null;
  currentProviderReadiness?: Record<string, unknown> | null;
};

function stringListFrom(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function recordListFrom(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : [];
}

function recordFrom(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function signalPayloadsByKind(db: DatabaseSync, stageAttemptId: string, signalKind: string) {
  return listStageAttemptSignals(db, stageAttemptId).filter((signal) => signal.signal_kind === signalKind);
}

function taskDeadLetterForAttempt(db: DatabaseSync, attempt: NonNullable<ReturnType<typeof inspectStageAttemptPayload>>) {
  if (attempt.status !== FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.deadLettered) {
    return null;
  }
  const taskId = typeof attempt.task_id === 'string' ? attempt.task_id : null;
  const task = taskId
    ? db.prepare(`
      SELECT task_id, domain_id, task_kind, status, attempts, ${FAMILY_RUNTIME_TASK_COLUMNS.maxAttempts}, last_error, dead_letter_reason, updated_at
      FROM tasks
      WHERE task_id = ?
    `).get(taskId) as Record<string, unknown> | undefined
    : undefined;
  return {
    reason: attempt.blocked_reason ?? (typeof task?.dead_letter_reason === 'string' ? task.dead_letter_reason : null),
    task: task ?? null,
  };
}

function temporalDurableLifecycleReadback(input: {
  attempt: NonNullable<ReturnType<typeof inspectStageAttemptPayload>>;
  temporalQuery: Record<string, unknown> | null;
  workflowContract: ReturnType<typeof buildTemporalStageAttemptWorkflowContract> | null;
}) {
  if (input.attempt.provider_kind !== 'temporal' || !input.workflowContract) {
    return null;
  }
  const query = recordFrom(input.temporalQuery?.query);
  const querySurface = stringValue(input.temporalQuery?.surface_kind);
  const runId = stringValue(input.temporalQuery?.run_id);
  const workflowStatus = stringValue(input.temporalQuery?.workflow_status);
  const queryStatus = stringValue(query?.status);
  const queryAvailable = querySurface === 'temporal_stage_attempt_query_receipt';
  const contract = input.workflowContract.temporal_first_runtime_contract;
  const observedEvidence = [
    'workflow_id',
    'stage_attempt_identity',
    'temporal_schedule_identity',
    'temporal_task_queue_identity',
    queryAvailable ? 'temporal_workflow_query_readback' : null,
    runId ? 'temporal_run_id' : null,
  ].filter((entry): entry is string => Boolean(entry));

  return {
    surface_kind: 'temporal_durable_lifecycle_readback',
    provider_kind: 'temporal',
    readback_status: queryAvailable ? 'bound_to_temporal_query' : 'missing_temporal_history_or_query',
    stage_attempt_identity: {
      stage_attempt_id: input.attempt.stage_attempt_id,
      workflow_id: input.attempt.workflow_id,
      domain_id: input.attempt.domain_id,
      stage_id: input.attempt.stage_id,
      task_id: input.attempt.task_id ?? null,
      source_fingerprint: input.attempt.source_fingerprint,
    },
    workflow_history_identity: {
      workflow_id: input.attempt.workflow_id,
      run_id: runId,
      workflow_status: workflowStatus,
      query_status: queryStatus,
      workflow_history_ref: runId
        ? `temporal://workflow/${encodeURIComponent(input.attempt.workflow_id)}/runs/${encodeURIComponent(runId)}/history`
        : `temporal://workflow/${encodeURIComponent(input.attempt.workflow_id)}/history`,
      workflow_query_ref: `temporal://workflow/${encodeURIComponent(input.attempt.workflow_id)}/query/StageAttemptQuery`,
      query_source: stringValue(input.temporalQuery?.query_source)
        ?? (queryAvailable ? 'workflow_query' : stringValue(input.temporalQuery?.reason)),
    },
    schedule_identity: {
      schedule_id: contract.schedule_mapping.schedule_id,
      workflow_type: contract.schedule_mapping.workflow_type,
      cadence_owner: contract.schedule_mapping.cadence_owner,
      scheduler_may_write_terminal_state: false,
    },
    task_queue_identity: {
      default_task_queue: stringValue(input.attempt.provider_run.task_queue)
        ?? input.workflowContract.default_task_queue,
      resolver: contract.task_queue_mapping.resolver,
      grouping_policy: contract.task_queue_mapping.grouping_policy,
    },
    required_evidence: [
      'workflow_id',
      'temporal_workflow_history_or_query_readback',
      'stage_attempt_identity',
      'temporal_schedule_identity',
      'temporal_task_queue_identity',
      'authority_event_ref_or_projection_rebuild_ref',
    ],
    observed_evidence: observedEvidence,
    local_lifecycle_status_role: 'sqlite_stage_attempt_status_projection_only_not_temporal_lifecycle_truth',
    ready_claim_allowed: false,
    authority_boundary: {
      opl: 'temporal_lifecycle_readback_and_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

export function queryStageAttempt(
  db: DatabaseSync,
  stageAttemptId: string,
  options: QueryStageAttemptOptions = {},
) {
  const attempt = inspectStageAttemptPayload(db, stageAttemptId);
  if (!attempt) {
    throw new FrameworkContractError('cli_usage_error', 'Family runtime stage attempt not found.', {
      stage_attempt_id: stageAttemptId,
    });
  }
  const closeouts = listStageAttemptCloseouts(db, stageAttemptId);
  const humanGateLedger = signalPayloadsByKind(db, stageAttemptId, 'human_gate');
  const userInstructionLedger = signalPayloadsByKind(db, stageAttemptId, 'user_instruction');
  const resumeLedger = signalPayloadsByKind(db, stageAttemptId, 'resume');
  const latestCloseout = closeouts.at(-1)?.packet as Record<string, unknown> | undefined;
  const currentProviderReadiness = options.currentProviderReadiness ?? null;
  const readinessCurrentness = providerReadinessCurrentness(currentProviderReadiness, {
    currentProviderReadinessRef: 'stage_attempt_query.current_provider_readiness',
    creationReceiptRef: 'stage_attempt_query.attempt.provider_receipt',
  });
  const runtimeCurrentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus: attempt.status,
    providerKind: attempt.provider_kind,
    providerRun: attempt.provider_run,
    temporalQuery: options.temporalQuery,
  });
  const closeoutRefs = stringListFrom(attempt.closeout_refs);
  const consumedRefs = stringListFrom(latestCloseout?.consumed_refs);
  const consumedMemoryRefs = stringListFrom(latestCloseout?.consumed_memory_refs);
  const writebackReceiptRefs = stringListFrom(latestCloseout?.writeback_receipt_refs);
  const rejectedWrites = recordListFrom(latestCloseout?.rejected_writes);
  const domainOutput = recordFrom(latestCloseout?.domain_output);
  const domainOutputRef = stringValue(domainOutput?.output_ref);
  const subject = buildFamilyConflictSubject({
    domain: attempt.domain_id,
    stageId: attempt.stage_id,
    taskKind: attempt.stage_id,
    sourceFingerprint: attempt.source_fingerprint,
    idempotencyKey: attempt.idempotency_key,
    stageAttemptId: attempt.stage_attempt_id,
    taskId: attempt.task_id,
    sourceRefs: stringListFrom(attempt.workspace_locator.source_refs),
  });
  const domainReadyVerdict = typeof latestCloseout?.domain_ready_verdict === 'string'
    ? latestCloseout.domain_ready_verdict
    : null;
  const nextOwner = typeof latestCloseout?.next_owner === 'string'
    ? latestCloseout.next_owner
    : typeof attempt.route_impact.next_owner === 'string'
      ? attempt.route_impact.next_owner
      : attempt.domain_id;
  const controlledApplyContract = buildFamilyRuntimeControlledApplyContract({
    domainId: attempt.domain_id,
    stageId: attempt.stage_id,
    workspaceLocator: attempt.workspace_locator,
    routeImpact: attempt.route_impact,
  });
  const lifecyclePrimitives = buildFamilyRuntimeLifecyclePrimitives({
    workspaceLocator: attempt.workspace_locator,
    artifactRefs: [
      ...closeoutRefs,
      ...consumedRefs,
      ...writebackReceiptRefs,
    ],
  });
  const genericProjections = buildAttemptGenericProjections({
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    next_owner: nextOwner,
    route_impact: attempt.route_impact,
    workspace_locator: attempt.workspace_locator,
    source_fingerprint: attempt.source_fingerprint,
    checkpoint_refs: stringListFrom(attempt.checkpoint_refs),
    closeout_refs: closeoutRefs,
    consumed_refs: consumedRefs,
    consumed_memory_refs: consumedMemoryRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    artifact_refs: [
      ...closeoutRefs,
      ...consumedRefs,
      ...writebackReceiptRefs,
    ],
    rejected_writes: rejectedWrites,
    attention_flags: [
      attempt.status === 'human_gate' || humanGateLedger.length > 0 || stringListFrom(attempt.human_gate_refs).length > 0
        ? 'human_gate'
        : null,
      resumeLedger.length > 0 ? 'resume_available' : null,
      attempt.status === FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.deadLettered
        ? FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.deadLettered
        : null,
      attempt.blocked_reason ? 'blocked' : null,
      rejectedWrites.length > 0 ? 'rejected_writes' : null,
    ].filter((flag): flag is string => Boolean(flag)),
    human_gate_refs: stringListFrom(attempt.human_gate_refs),
    human_gate_ledger: humanGateLedger,
    resume_ledger: resumeLedger,
    [FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS.deadLetter]: taskDeadLetterForAttempt(db, attempt),
    domain_ready_verdict: domainReadyVerdict,
    controlled_apply_contract: controlledApplyContract,
    lifecycle_primitives: lifecyclePrimitives,
    current_provider_readiness: options.currentProviderReadiness ?? null,
    provider_readiness_currentness: readinessCurrentness,
  });
  const humanReviewBurdenBudget = buildAttemptHumanReviewBurdenBudget({
    targetDomainId: attempt.domain_id,
    stageId: attempt.stage_id,
    humanGateRefs: stringListFrom(attempt.human_gate_refs),
    humanGateLedger,
    routeImpact: attempt.route_impact,
  });
  const conflictOrBlockerEnvelopes = buildStageAttemptConflictOrBlockerEnvelopes({
    subject,
    attemptStatus: attempt.status,
    blockedReason: attempt.blocked_reason,
    humanGateRefs: stringListFrom(attempt.human_gate_refs),
    humanGateLedger,
    deadLetter: taskDeadLetterForAttempt(db, attempt),
    rejectedWrites,
    domainReadyVerdict,
    closeoutRefs,
    closeoutReceiptStatus: attempt.closeout_receipt_status,
    routeImpact: attempt.route_impact,
  });
  const canonicalOutcome = canonicalOutcomeForStageAttempt({
    attemptStatus: attempt.status,
    closeoutRefs,
    closeoutReceiptStatus: attempt.closeout_receipt_status,
  });
  const oplRuntimeContext = projectOplDomainTaskRuntimeContext({
    currentControlState: deriveCurrentControlStateForAttempt(db, stageAttemptId),
    stageAttemptQuery: {
      attempt,
      canonical_outcome: canonicalOutcome,
      resume_ledger: resumeLedger,
      domain_output: domainOutput,
    },
  });
  const workflowContract = attempt.provider_kind === 'temporal'
    ? buildTemporalStageAttemptWorkflowContract()
    : null;
  const temporalLifecycleReadback = temporalDurableLifecycleReadback({
    attempt,
    temporalQuery: options.temporalQuery ?? null,
    workflowContract,
  });
  const modelRouteCostProjection = buildModelRouteCostProjection({
    stageAttemptId: attempt.stage_attempt_id,
    status: attempt.status,
    blockedReason: attempt.blocked_reason,
    executorKind: attempt.executor_kind,
    retryBudget: attempt.retry_budget,
    attemptCount: attempt.attempt_count,
    providerRun: attempt.provider_run,
    activityEvents: attempt.activity_events,
    routeImpact: attempt.route_impact,
    usageProjection: attempt.usage_projection,
  });
  const stageProgressLog = buildStageProgressLog({
    stageAttemptId: attempt.stage_attempt_id,
    providerKind: attempt.provider_kind,
    executorKind: attempt.executor_kind,
    domainId: attempt.domain_id,
    stageId: attempt.stage_id,
    workflowId: attempt.workflow_id,
    taskId: attempt.task_id,
    workspaceLocator: attempt.workspace_locator,
    sourceFingerprint: attempt.source_fingerprint,
    status: attempt.status,
    blockedReason: attempt.blocked_reason,
    checkpointRefs: stringListFrom(attempt.checkpoint_refs),
    closeoutRefs,
    consumedRefs,
    consumedMemoryRefs,
    writebackReceiptRefs,
    humanGateRefs: stringListFrom(attempt.human_gate_refs),
    retryBudget: attempt.retry_budget,
    attemptCount: attempt.attempt_count,
    providerRun: attempt.provider_run,
    temporalVisibilityReadiness: options.temporalVisibilityReadiness,
    activityEvents: attempt.activity_events,
    routeImpact: attempt.route_impact,
    latestCloseout: latestCloseout ?? null,
    closeoutReceiptStatus: attempt.closeout_receipt_status,
    nextOwner,
    domainReadyVerdict,
    canonicalOutcome,
    usageProjection: attempt.usage_projection,
    modelRouteCostProjection,
    createdAt: attempt.created_at,
    updatedAt: attempt.updated_at,
  });
  const attemptTruePathProof = buildStageAttemptTruePathProof({
    stageAttemptId: attempt.stage_attempt_id,
    taskId: attempt.task_id,
    workflowId: attempt.workflow_id,
    providerKind: attempt.provider_kind,
    domainId: attempt.domain_id,
    stageId: attempt.stage_id,
    status: attempt.status,
    stageProgressLog,
    temporalQuery: options.temporalQuery,
  });
  const attemptLaunchEnvelope = buildStageAttemptLaunchEnvelope({
    stageAttemptId: attempt.stage_attempt_id,
    domainId: attempt.domain_id,
    stageId: attempt.stage_id,
    workspaceLocator: attempt.workspace_locator,
    sourceFingerprint: attempt.source_fingerprint,
  });
  const closeoutRefsOnlyContract = buildStageAttemptCloseoutRefsOnlyContract({
    stageAttemptId: attempt.stage_attempt_id,
    domainId: attempt.domain_id,
    stageId: attempt.stage_id,
    closeoutRefs,
    consumedRefs,
    writebackReceiptRefs,
    routeImpact: attempt.route_impact,
  });
  const executionIdentityResolved = attempt.identity_state === 'resolved'
    && attempt.scope_kind !== 'identity_unresolved';
  return {
    stage_attempt_query: {
      surface_kind: 'stage_attempt_query',
      attempt,
      workflow_contract: workflowContract,
      workflow_input:
        attempt.provider_kind === 'temporal' && executionIdentityResolved
          ? buildTemporalStageAttemptWorkflowInput(attempt)
          : null,
      codex_stage_activity: executionIdentityResolved
        ? buildCodexStageActivityInput({ attempt })
        : null,
      execution_identity_admission: {
        identity_state: attempt.identity_state,
        scope_kind: attempt.scope_kind,
        launch_allowed: executionIdentityResolved,
        blocked_reason: executionIdentityResolved ? null : 'runtime_execution_identity_unresolved',
      },
      attempt_launch_envelope: attemptLaunchEnvelope,
      closeout_refs_only_contract: closeoutRefsOnlyContract,
      lifecycle_primitives: lifecyclePrimitives,
      controlled_apply_contract: controlledApplyContract,
      canonical_outcome: canonicalOutcome,
      opl_runtime_context: oplRuntimeContext,
      opl_runtime_context_consumer_ref:
        `opl://stage-attempts/${encodeURIComponent(stageAttemptId)}/opl-runtime-context`,
      conflict_or_blocker_envelopes: conflictOrBlockerEnvelopes,
      operator_conflicts: conflictOrBlockerEnvelopes,
      ...genericProjections,
      provider_readiness_currentness: readinessCurrentness,
      runtime_currentness: runtimeCurrentness,
      temporal_durable_lifecycle_readback: temporalLifecycleReadback,
      usage_projection: attempt.usage_projection,
      memory_trace_projection: stageProgressLog.memory_trace_projection,
      model_route_cost_projection: modelRouteCostProjection,
      stage_progress_log: stageProgressLog,
      attempt_true_path_proof: attemptTruePathProof,
      domain_output: domainOutput,
      temporal_visibility: stageProgressLog.temporal_visibility,
      temporal_webui_ref: stageProgressLog.temporal_webui_ref,
      human_review_burden_budget: humanReviewBurdenBudget,
      operator_visibility: {
        provider_kind: attempt.provider_kind,
        attempt_id: attempt.stage_attempt_id,
        stage_id: attempt.stage_id,
        status: attempt.status,
        effective_runtime_status: runtimeCurrentness.effective_runtime_status,
        runtime_currentness: runtimeCurrentness,
        temporal_durable_lifecycle_readback: temporalLifecycleReadback,
        current_provider_readiness: currentProviderReadiness,
        provider_readiness_currentness: readinessCurrentness,
        codex_stage_activity_timeout_policy: workflowContract?.activity_timeout_policy.codex_stage_activity ?? null,
        provider_run: attempt.provider_run,
        activity_events: attempt.activity_events,
        heartbeat: {
          last_updated_at: attempt.updated_at,
          last_heartbeat_at: typeof attempt.provider_run.last_heartbeat_at === 'string'
            ? attempt.provider_run.last_heartbeat_at
            : null,
          checkpoint_refs: attempt.checkpoint_refs,
        },
        consumed_refs: consumedRefs,
        consumed_memory_refs: consumedMemoryRefs,
        writeback_receipt_refs: writebackReceiptRefs,
        closeout_refs: attempt.closeout_refs,
        closeout_receipt_status: attempt.closeout_receipt_status,
        domain_output_ref: domainOutputRef,
        route_impact: attempt.route_impact,
        rejected_writes: rejectedWrites,
        next_owner: nextOwner,
        human_gate_refs: attempt.human_gate_refs,
        human_gate_ledger: humanGateLedger,
        human_review_burden_budget: humanReviewBurdenBudget,
        user_instruction_ledger: userInstructionLedger,
        resume_ledger: resumeLedger,
        user_instructions: userInstructionLedger,
        resume_signals: resumeLedger,
        [FAMILY_RUNTIME_QUEUE_PROJECTION_FIELDS.deadLetter]: taskDeadLetterForAttempt(db, attempt),
        canonical_outcome: canonicalOutcome,
        operator_conflicts: conflictOrBlockerEnvelopes,
        usage_projection: attempt.usage_projection,
        memory_trace_projection: stageProgressLog.memory_trace_projection,
        model_route_cost_projection: modelRouteCostProjection,
        stage_progress_log: stageProgressLog,
        attempt_true_path_proof: attemptTruePathProof,
        temporal_visibility: stageProgressLog.temporal_visibility,
        temporal_webui_ref: stageProgressLog.temporal_webui_ref,
        attempt_launch_envelope: attemptLaunchEnvelope,
        closeout_refs_only_contract: closeoutRefsOnlyContract,
        authority_boundary: {
          opl: 'attempt_control_metadata_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
      completion_boundary: {
        provider_completion: attempt.status === 'completed' ? 'completed' : 'not_completed',
        domain_ready_verdict: domainReadyVerdict,
        provider_completion_is_domain_ready: false,
      },
      signals: listStageAttemptSignals(db, stageAttemptId),
      closeouts,
    },
  };
}
