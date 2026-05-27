import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import { buildCodexStageActivityInput } from './family-runtime-codex-stage-runner.ts';
import { buildFamilyRuntimeControlledApplyContract } from './family-runtime-controlled-apply.ts';
import { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
import {
  buildFamilyConflictSubject,
  buildStageAttemptConflictOrBlockerEnvelopes,
  canonicalOutcomeForStageAttempt,
} from './family-conflict-envelope.ts';
import {
  inspectStageAttemptPayload,
  listStageAttemptCloseouts,
  listStageAttemptSignals,
} from './family-runtime-stage-attempt-ledger.ts';
import { buildTemporalStageAttemptWorkflowContract, buildTemporalStageAttemptWorkflowInput } from './family-runtime-temporal.ts';
import { buildAttemptGenericProjections } from './runtime-tray-stage-attempt-generic-projections.ts';
import { buildAttemptHumanReviewBurdenBudget } from './family-human-review-budget.ts';
import { buildStageProgressLog } from './family-runtime-stage-progress-log.ts';

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

function signalPayloadsByKind(db: DatabaseSync, stageAttemptId: string, signalKind: string) {
  return listStageAttemptSignals(db, stageAttemptId).filter((signal) => signal.signal_kind === signalKind);
}

function taskDeadLetterForAttempt(db: DatabaseSync, attempt: NonNullable<ReturnType<typeof inspectStageAttemptPayload>>) {
  if (attempt.status !== 'dead_lettered') {
    return null;
  }
  const taskId = typeof attempt.task_id === 'string' ? attempt.task_id : null;
  const task = taskId
    ? db.prepare(`
      SELECT task_id, domain_id, task_kind, status, attempts, max_attempts, last_error, dead_letter_reason, updated_at
      FROM tasks
      WHERE task_id = ?
    `).get(taskId) as Record<string, unknown> | undefined
    : undefined;
  return {
    reason: attempt.blocked_reason ?? (typeof task?.dead_letter_reason === 'string' ? task.dead_letter_reason : null),
    task: task ?? null,
  };
}

export function queryStageAttempt(db: DatabaseSync, stageAttemptId: string) {
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
  const closeoutRefs = stringListFrom(attempt.closeout_refs);
  const consumedRefs = stringListFrom(latestCloseout?.consumed_refs);
  const consumedMemoryRefs = stringListFrom(latestCloseout?.consumed_memory_refs);
  const writebackReceiptRefs = stringListFrom(latestCloseout?.writeback_receipt_refs);
  const rejectedWrites = recordListFrom(latestCloseout?.rejected_writes);
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
      attempt.status === 'dead_lettered' ? 'dead_lettered' : null,
      attempt.blocked_reason ? 'blocked' : null,
      rejectedWrites.length > 0 ? 'rejected_writes' : null,
    ].filter((flag): flag is string => Boolean(flag)),
    human_gate_refs: stringListFrom(attempt.human_gate_refs),
    human_gate_ledger: humanGateLedger,
    resume_ledger: resumeLedger,
    dead_letter: taskDeadLetterForAttempt(db, attempt),
    domain_ready_verdict: domainReadyVerdict,
    controlled_apply_contract: controlledApplyContract,
    lifecycle_primitives: lifecyclePrimitives,
    current_provider_readiness: null,
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
  const workflowContract = attempt.provider_kind === 'temporal'
    ? buildTemporalStageAttemptWorkflowContract()
    : null;
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
    activityEvents: attempt.activity_events,
    routeImpact: attempt.route_impact,
    latestCloseout: latestCloseout ?? null,
    closeoutReceiptStatus: attempt.closeout_receipt_status,
    nextOwner,
    domainReadyVerdict,
    canonicalOutcome,
    usageProjection: attempt.usage_projection,
    createdAt: attempt.created_at,
    updatedAt: attempt.updated_at,
  });
  return {
    stage_attempt_query: {
      surface_kind: 'stage_attempt_query',
      attempt,
      workflow_contract: workflowContract,
      workflow_input:
        attempt.provider_kind === 'temporal'
          ? buildTemporalStageAttemptWorkflowInput(attempt)
          : null,
      codex_stage_activity: buildCodexStageActivityInput({ attempt }),
      lifecycle_primitives: lifecyclePrimitives,
      controlled_apply_contract: controlledApplyContract,
      canonical_outcome: canonicalOutcome,
      conflict_or_blocker_envelopes: conflictOrBlockerEnvelopes,
      operator_conflicts: conflictOrBlockerEnvelopes,
      ...genericProjections,
      usage_projection: attempt.usage_projection,
      stage_progress_log: stageProgressLog,
      temporal_visibility: stageProgressLog.temporal_visibility,
      temporal_webui_ref: stageProgressLog.temporal_webui_ref,
      human_review_burden_budget: humanReviewBurdenBudget,
      operator_visibility: {
        provider_kind: attempt.provider_kind,
        attempt_id: attempt.stage_attempt_id,
        stage_id: attempt.stage_id,
        status: attempt.status,
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
        dead_letter: taskDeadLetterForAttempt(db, attempt),
        canonical_outcome: canonicalOutcome,
        operator_conflicts: conflictOrBlockerEnvelopes,
        usage_projection: attempt.usage_projection,
        stage_progress_log: stageProgressLog,
        temporal_visibility: stageProgressLog.temporal_visibility,
        temporal_webui_ref: stageProgressLog.temporal_webui_ref,
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
