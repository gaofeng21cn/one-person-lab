import { DatabaseSync } from 'node:sqlite';

import {
  getStageAttemptRow,
  listStageAttemptsForTask,
  stageAttemptToPayload,
  type StageAttemptStatus,
} from './family-runtime-stage-attempt-ledger.ts';
import {
  DEFAULT_MAX_ATTEMPTS,
  insertEvent,
  insertNotification,
  nowIso,
  stableId,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';

export const PAPER_MISSION_STAGE_ROUTE_TASK_KIND = 'paper_mission/stage-route';
export const PAPER_MISSION_STAGE_ROUTE_RUNTIME_REQUEST_KIND = 'mas_paper_mission_stage_route';

const PAPER_MISSION_STAGE_ROUTE_DOMAIN_GATE_PENDING_REASON = 'paper_mission_stage_route_domain_gate_pending';
const PAPER_MISSION_STAGE_ROUTE_TERMINAL_SUCCESSOR_REASON =
  'paper_mission_stage_route_terminal_closeout_successor_admitted';
const PAPER_MISSION_STAGE_ROUTE_TERMINAL_SUCCESSOR_POLICY =
  'terminal_provider_closeout_cannot_self_admit_successor_external_fresh_handoff_required';
const MAX_TERMINAL_SUCCESSOR_GENERATION = 1;
const SUCCESSOR_ROUTE_COMMAND_KINDS = new Set([
  'route_back',
  'resume_stage',
  'start_next_stage',
]);
const TERMINAL_SUCCESSOR_REQUIRED_IDENTITY_FIELDS = [
  'study_id',
  'paper_mission_transaction_ref',
  'opl_route_command_ref',
  'command_kind',
  'route_target',
  'route_identity_key',
  'attempt_idempotency_key',
] as const;
const TERMINAL_STAGE_ATTEMPT_STATUSES = new Set<StageAttemptStatus>([
  'blocked',
  'completed',
  'failed',
  'dead_lettered',
]);
const LIVE_STAGE_ATTEMPT_STATUSES = new Set<StageAttemptStatus>([
  'queued',
  'running',
  'checkpointed',
  'human_gate',
]);
const SUPERSEDABLE_PROVIDER_BLOCKERS = new Set([
  'paper_mission_stage_route_temporal_start_failed',
  'temporal_stage_attempt_completed_missing_typed_closeout',
]);
const BACKFILLABLE_TERMINAL_ROUTE_BLOCKERS = new Set([
  PAPER_MISSION_STAGE_ROUTE_DOMAIN_GATE_PENDING_REASON,
]);

type StageAttemptPayload = ReturnType<typeof stageAttemptToPayload>;

function payloadFromTask(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as Record<string, unknown>;
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function paperMissionStageRouteIdentityValue(
  payload: Record<string, unknown>,
  field: string,
) {
  const handoffRecord = recordValue(payload.opl_route_handoff_record);
  const handoffCarrier = recordValue(handoffRecord.opl_runtime_carrier);
  const topLevelCarrier = recordValue(payload.opl_runtime_carrier);
  const stageRunRequest = recordValue(payload.stage_run_request);
  return optionalString(payload[field])
    ?? optionalString(handoffRecord[field])
    ?? optionalString(handoffCarrier[field])
    ?? optionalString(topLevelCarrier[field])
    ?? optionalString(stageRunRequest[field]);
}

function numericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function terminalSuccessorGeneration(payload: Record<string, unknown>) {
  const explicitGeneration = numericValue(payload.terminal_successor_generation);
  if (explicitGeneration !== null) {
    return explicitGeneration;
  }
  return optionalString(payload.requeued_from_terminal_task_id) ? 1 : 0;
}

export function isPaperMissionStageRouteTask(
  row: Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>,
  payload: Record<string, unknown>,
) {
  return row.domain_id === 'medautoscience'
    && row.task_kind === PAPER_MISSION_STAGE_ROUTE_TASK_KIND
    && payload.surface_kind === 'opl_mas_paper_mission_route_runtime_request'
    && (
      payload.runtime_request_kind === PAPER_MISSION_STAGE_ROUTE_RUNTIME_REQUEST_KIND
      || payload.runtime_request_kind === undefined
    );
}

function latestLinkedTerminalStageAttempt(row: FamilyRuntimeTaskRow) {
  return (attempt: StageAttemptPayload) => (
    attempt.task_id === row.task_id
    && TERMINAL_STAGE_ATTEMPT_STATUSES.has(attempt.status)
  );
}

function hasLaterLiveLinkedStageAttempt(
  db: DatabaseSync,
  terminalAttempt: StageAttemptPayload,
) {
  if (!terminalAttempt.task_id) {
    return false;
  }
  const laterLiveAttempt = db.prepare(`
    SELECT stage_attempt_id
    FROM stage_attempts
    WHERE task_id = @task_id
      AND stage_attempt_id != @stage_attempt_id
      AND status IN (${[...LIVE_STAGE_ATTEMPT_STATUSES].map((status) => `'${status}'`).join(', ')})
      AND (
        created_at > @created_at
        OR (created_at = @created_at AND rowid > (
          SELECT rowid FROM stage_attempts WHERE stage_attempt_id = @stage_attempt_id
        ))
      )
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `).get({
    task_id: terminalAttempt.task_id,
    stage_attempt_id: terminalAttempt.stage_attempt_id,
    created_at: terminalAttempt.created_at,
  }) as { stage_attempt_id: string } | undefined;
  return Boolean(laterLiveAttempt);
}

function paperMissionStageRouteTaskStatusForTerminalAttempt(attempt: StageAttemptPayload) {
  const routeImpact = attempt.route_impact && typeof attempt.route_impact === 'object'
    ? attempt.route_impact as Record<string, unknown>
    : {};
  const domainReadyVerdict = typeof routeImpact.domain_ready_verdict === 'string'
    ? routeImpact.domain_ready_verdict
    : null;
  if (attempt.status === 'failed' || attempt.status === 'dead_lettered') {
    const reason = attempt.blocked_reason ?? 'paper_mission_stage_route_provider_terminal_failure';
    return {
      status: 'dead_letter' as const,
      reason,
      deadLetterReason: reason,
    };
  }
  const verdictReason = domainReadyVerdict === 'domain_ready'
    ? 'paper_mission_stage_route_domain_authority_required'
    : (domainReadyVerdict ? `paper_mission_stage_route_${domainReadyVerdict}` : null);
  const reason = attempt.blocked_reason
    ?? verdictReason
    ?? PAPER_MISSION_STAGE_ROUTE_DOMAIN_GATE_PENDING_REASON;
  return {
    status: 'blocked' as const,
    reason,
    deadLetterReason: reason,
  };
}

function transitionReceiptStatusForTerminalAttempt(
  terminalAttempt: StageAttemptPayload,
  nextTask: ReturnType<typeof paperMissionStageRouteTaskStatusForTerminalAttempt>,
) {
  if (nextTask.status === 'dead_letter') {
    return 'provider_terminal_blocked';
  }
  if (terminalAttempt.closeout_receipt_status === 'accepted_typed_closeout') {
    return 'terminal_closeout_observed';
  }
  if (nextTask.reason === PAPER_MISSION_STAGE_ROUTE_DOMAIN_GATE_PENDING_REASON) {
    return 'domain_gate_pending';
  }
  return 'typed_runtime_blocker_observed';
}

function firstCloseoutRef(terminalAttempt: StageAttemptPayload) {
  return terminalAttempt.closeout_refs.find(
    (entry) => typeof entry === 'string' && entry.trim().length > 0,
  ) ?? null;
}

function oplTransitionReceiptForTerminalAttempt(input: {
  row: FamilyRuntimeTaskRow;
  payload: Record<string, unknown>;
  terminalAttempt: StageAttemptPayload;
  nextTask: ReturnType<typeof paperMissionStageRouteTaskStatusForTerminalAttempt>;
}) {
  const stageAttemptId = input.terminalAttempt.stage_attempt_id;
  const taskId = input.row.task_id;
  return {
    surface_kind: 'opl_transition_receipt',
    schema_version: 1,
    receipt_status: transitionReceiptStatusForTerminalAttempt(input.terminalAttempt, input.nextTask),
    role: 'transport_receipt_only',
    source_event_type: 'paper_mission_stage_route_terminal_task_reconciled',
    study_id: paperMissionStageRouteIdentityValue(input.payload, 'study_id') ?? input.payload.study_id ?? null,
    mission_id: paperMissionStageRouteIdentityValue(input.payload, 'mission_id') ?? input.payload.mission_id ?? null,
    paper_mission_transaction_ref: paperMissionStageRouteIdentityValue(
      input.payload,
      'paper_mission_transaction_ref',
    ),
    opl_route_command_ref: paperMissionStageRouteIdentityValue(input.payload, 'opl_route_command_ref'),
    command_kind: paperMissionStageRouteIdentityValue(input.payload, 'command_kind'),
    route_target: paperMissionStageRouteIdentityValue(input.payload, 'route_target'),
    route_identity_key: paperMissionStageRouteIdentityValue(input.payload, 'route_identity_key'),
    attempt_idempotency_key: paperMissionStageRouteIdentityValue(input.payload, 'attempt_idempotency_key'),
    request_idempotency_key: paperMissionStageRouteIdentityValue(input.payload, 'request_idempotency_key'),
    task_id: taskId,
    task_status: input.row.status,
    reconciled_task_status: input.nextTask.status,
    stage_attempt_id: stageAttemptId,
    stage_attempt_status: input.terminalAttempt.status,
    stage_attempt_ref: stageAttemptId ? `opl://stage-attempts/${stageAttemptId}` : null,
    runtime_closeout_ref: firstCloseoutRef(input.terminalAttempt)
      ?? (taskId ? `opl://family-runtime/tasks/${taskId}/terminal-closeout-readback` : null),
    typed_runtime_blocker_ref: firstCloseoutRef(input.terminalAttempt),
    closeout_refs: input.terminalAttempt.closeout_refs,
    closeout_receipt_status: input.terminalAttempt.closeout_receipt_status,
    blocked_reason: input.nextTask.reason,
    can_change_stage_terminal_decision: false,
    can_select_next_owner: false,
    authority_boundary: {
      role: 'transport_receipt_only',
      writes_domain_truth: false,
      writes_owner_receipt: false,
      writes_typed_blocker: false,
      writes_human_gate: false,
      writes_current_package: false,
      writes_paper_body: false,
      writes_publication_eval_latest: false,
      writes_controller_decision: false,
      can_claim_provider_running: false,
      can_claim_paper_progress: false,
      can_claim_runtime_ready: false,
      can_claim_submission_ready: false,
    },
  };
}

function hasAcceptedTypedCloseout(attempt: StageAttemptPayload) {
  return attempt.status === 'completed'
    && attempt.closeout_receipt_status === 'accepted_typed_closeout'
    && attempt.closeout_refs.some((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function shouldAdmitSuccessorForTerminalRoute(
  payload: Record<string, unknown>,
  terminalAttempt: StageAttemptPayload,
  nextTask: ReturnType<typeof paperMissionStageRouteTaskStatusForTerminalAttempt>,
) {
  return terminalCloseoutSelfAdmissionAllowed()
    && isTerminalSuccessorCandidate(payload, terminalAttempt, nextTask);
}

function terminalCloseoutSelfAdmissionAllowed() {
  return false;
}

function isTerminalSuccessorCandidate(
  payload: Record<string, unknown>,
  terminalAttempt: StageAttemptPayload,
  nextTask: ReturnType<typeof paperMissionStageRouteTaskStatusForTerminalAttempt>,
) {
  const commandKind = paperMissionStageRouteIdentityValue(payload, 'command_kind');
  const generation = terminalSuccessorGeneration(payload);
  return nextTask.status === 'blocked'
    && nextTask.reason === PAPER_MISSION_STAGE_ROUTE_DOMAIN_GATE_PENDING_REASON
    && hasAcceptedTypedCloseout(terminalAttempt)
    && generation < MAX_TERMINAL_SUCCESSOR_GENERATION
    && Boolean(commandKind && SUCCESSOR_ROUTE_COMMAND_KINDS.has(commandKind));
}

function missingTerminalSuccessorIdentityFields(payload: Record<string, unknown>) {
  return TERMINAL_SUCCESSOR_REQUIRED_IDENTITY_FIELDS.filter(
    (field) => !paperMissionStageRouteIdentityValue(payload, field),
  );
}

function successorDedupeKey(row: FamilyRuntimeTaskRow, terminalAttempt: StageAttemptPayload) {
  return [
    'paper-mission-route-terminal-successor',
    row.task_id,
    terminalAttempt.stage_attempt_id,
  ].join(':');
}

function successorPayloadForTerminalAttempt(
  payload: Record<string, unknown>,
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
  reason: string,
) {
  const stageRunRequest = recordValue(payload.stage_run_request);
  const authorityBoundary = recordValue(payload.authority_boundary);
  const generation = terminalSuccessorGeneration(payload) + 1;
  const commandKind = paperMissionStageRouteIdentityValue(payload, 'command_kind');
  const routeTarget = paperMissionStageRouteIdentityValue(payload, 'route_target');
  const routeIdentityKey = paperMissionStageRouteIdentityValue(payload, 'route_identity_key');
  const attemptIdempotencyKey = paperMissionStageRouteIdentityValue(payload, 'attempt_idempotency_key');
  const requestIdempotencyKey = paperMissionStageRouteIdentityValue(payload, 'request_idempotency_key');
  return {
    ...payload,
    runtime_request_status: 'queued_request',
    ...(commandKind ? { command_kind: commandKind } : {}),
    ...(routeTarget ? { route_target: routeTarget } : {}),
    ...(routeIdentityKey ? { route_identity_key: routeIdentityKey } : {}),
    ...(attemptIdempotencyKey ? { attempt_idempotency_key: attemptIdempotencyKey } : {}),
    ...(requestIdempotencyKey ? { request_idempotency_key: requestIdempotencyKey } : {}),
    terminal_successor_generation: generation,
    terminal_successor_max_generation: MAX_TERMINAL_SUCCESSOR_GENERATION,
    terminal_successor_root_task_id: optionalString(payload.terminal_successor_root_task_id) ?? row.task_id,
    requeued_from_terminal_task_id: row.task_id,
    requeued_from_terminal_stage_attempt_id: terminalAttempt.stage_attempt_id,
    requeued_from_terminal_reason: reason,
    requeued_from_terminal_closeout_refs: terminalAttempt.closeout_refs,
    requeued_from_terminal_closeout_receipt_status: terminalAttempt.closeout_receipt_status,
    stage_run_request: {
      ...stageRunRequest,
      request_status: 'requested',
      requested_by: 'paper_mission_stage_route_terminal_closeout',
      previous_task_id: row.task_id,
      previous_stage_attempt_id: terminalAttempt.stage_attempt_id,
      previous_terminal_reason: reason,
      command_kind: commandKind,
      route_target: routeTarget,
      route_identity_key: routeIdentityKey,
      attempt_idempotency_key: attemptIdempotencyKey,
      request_idempotency_key: requestIdempotencyKey,
      domain_truth_owner: 'med-autoscience',
      runtime_owner: 'one-person-lab',
      stage_run_created: false,
      provider_attempt_requested: false,
      provider_running: false,
    },
    authority_boundary: {
      ...authorityBoundary,
      writes_owner_receipt: false,
      writes_typed_blocker: false,
      writes_human_gate: false,
      writes_current_package: false,
      writes_paper_body: false,
      can_claim_provider_running: false,
      can_claim_paper_progress: false,
      can_claim_runtime_ready: false,
    },
  };
}

function enqueuePaperMissionStageRouteSuccessor(
  db: DatabaseSync,
  input: {
    row: FamilyRuntimeTaskRow;
    payload: Record<string, unknown>;
    terminalAttempt: StageAttemptPayload;
    source: string;
    reason: string;
    queuedAt: string;
  },
) {
  const dedupeKey = successorDedupeKey(input.row, input.terminalAttempt);
  const existing = db.prepare('SELECT * FROM tasks WHERE dedupe_key = ?').get(dedupeKey) as
    | FamilyRuntimeTaskRow
    | undefined;
  if (existing) {
    return { created: false, taskId: existing.task_id, dedupeKey };
  }
  const payload = successorPayloadForTerminalAttempt(
    input.payload,
    input.row,
    input.terminalAttempt,
    input.reason,
  );
  const taskId = stableId('frt', [
    input.row.domain_id,
    input.row.task_kind,
    dedupeKey,
    payload,
    input.queuedAt,
  ]);
  const task = {
    task_id: taskId,
    domain_id: input.row.domain_id,
    task_kind: input.row.task_kind,
    payload_json: JSON.stringify(payload),
    dedupe_key: dedupeKey,
    priority: input.row.priority,
    status: 'queued',
    attempts: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    source: input.source,
    requires_approval: 0,
    approved_at: null,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    dead_letter_reason: null,
    created_at: input.queuedAt,
    updated_at: input.queuedAt,
  };
  const result = db.prepare(`
    INSERT OR IGNORE INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status, attempts, max_attempts,
      source, requires_approval, approved_at, lease_owner, lease_expires_at, last_error, dead_letter_reason,
      created_at, updated_at
    )
    VALUES (
      @task_id, @domain_id, @task_kind, @payload_json, @dedupe_key, @priority, @status, @attempts, @max_attempts,
      @source, @requires_approval, @approved_at, @lease_owner, @lease_expires_at, @last_error, @dead_letter_reason,
      @created_at, @updated_at
    )
  `).run(task);
  const refreshed = db.prepare('SELECT * FROM tasks WHERE dedupe_key = ?').get(dedupeKey) as
    | FamilyRuntimeTaskRow
    | undefined;
  if (!refreshed) {
    return { created: false, taskId: null, dedupeKey };
  }
  if (result.changes > 0) {
    insertEvent(db, {
      taskId: refreshed.task_id,
      domainId: refreshed.domain_id,
      eventType: 'task_enqueued',
      source: input.source,
      payload: {
        task_kind: refreshed.task_kind,
        dedupe_key: dedupeKey,
        active_hold_id: null,
        active_hold_reason: null,
        requeued_from_terminal_task_id: input.row.task_id,
        requeued_from_terminal_stage_attempt_id: input.terminalAttempt.stage_attempt_id,
        reason: PAPER_MISSION_STAGE_ROUTE_TERMINAL_SUCCESSOR_REASON,
      },
    });
    insertNotification(db, {
      taskId: refreshed.task_id,
      severity: 'info',
      title: 'MAS PaperMission stage route successor queued',
      body: `${refreshed.domain_id}:${refreshed.task_kind}`,
      payload: {
        status: 'queued',
        dedupe_key: dedupeKey,
        requeued_from_terminal_task_id: input.row.task_id,
        requeued_from_terminal_stage_attempt_id: input.terminalAttempt.stage_attempt_id,
      },
    });
  }
  return { created: result.changes > 0, taskId: refreshed.task_id, dedupeKey };
}

function existingPaperMissionStageRouteSuccessor(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
) {
  return db.prepare('SELECT * FROM tasks WHERE dedupe_key = ?').get(
    successorDedupeKey(row, terminalAttempt),
  ) as FamilyRuntimeTaskRow | undefined;
}

function existingTerminalSuccessorIdentityNotReadyEvent(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
) {
  return db.prepare(`
    SELECT 1
    FROM events
    WHERE task_id = ?
      AND event_type = 'paper_mission_stage_route_terminal_task_reconciled'
      AND json_extract(payload_json, '$.stage_attempt_id') = ?
      AND json_extract(payload_json, '$.terminal_successor_identity_ready') = 0
      AND json_type(payload_json, '$.opl_transition_receipt') IS NOT NULL
    LIMIT 1
  `).get(row.task_id, terminalAttempt.stage_attempt_id) as { 1: number } | undefined;
}

function existingTerminalTaskReconciledEvent(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
) {
  return db.prepare(`
    SELECT 1
    FROM events
    WHERE task_id = ?
      AND event_type = 'paper_mission_stage_route_terminal_task_reconciled'
      AND json_extract(payload_json, '$.stage_attempt_id') = ?
      AND json_type(payload_json, '$.opl_transition_receipt') IS NOT NULL
    LIMIT 1
  `).get(row.task_id, terminalAttempt.stage_attempt_id) as { 1: number } | undefined;
}

function canReconcilePaperMissionStageRouteTask(
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
) {
  if (row.status === 'running') {
    return true;
  }
  if (row.status !== 'blocked' || !hasAcceptedTypedCloseout(terminalAttempt)) {
    return false;
  }
  const reason = row.dead_letter_reason ?? row.last_error;
  return typeof reason === 'string'
    && (
      SUPERSEDABLE_PROVIDER_BLOCKERS.has(reason)
      || BACKFILLABLE_TERMINAL_ROUTE_BLOCKERS.has(reason)
    );
}

function hasSupersedableProviderBlocker(row: FamilyRuntimeTaskRow) {
  const reason = row.dead_letter_reason ?? row.last_error;
  return typeof reason === 'string' && SUPERSEDABLE_PROVIDER_BLOCKERS.has(reason);
}

function canBackfillBlockedTerminalSuccessor(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
  terminalAttempt: StageAttemptPayload,
) {
  const reason = row.dead_letter_reason ?? row.last_error;
  return row.status === 'blocked'
    && typeof reason === 'string'
    && BACKFILLABLE_TERMINAL_ROUTE_BLOCKERS.has(reason)
    && shouldAdmitSuccessorForTerminalRoute(
      payload,
      terminalAttempt,
      paperMissionStageRouteTaskStatusForTerminalAttempt(terminalAttempt),
    );
}

function reconcilePaperMissionStageRouteTaskRowWithAttempt(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
  source: string,
) {
  const payload = payloadFromTask(row);
  if (!isPaperMissionStageRouteTask(row, payload)) {
    return false;
  }
  if (!TERMINAL_STAGE_ATTEMPT_STATUSES.has(terminalAttempt.status)) {
    return false;
  }
  if (hasLaterLiveLinkedStageAttempt(db, terminalAttempt)) {
    return false;
  }
  if (!canReconcilePaperMissionStageRouteTask(row, terminalAttempt)) {
    return false;
  }
  const nextTask = paperMissionStageRouteTaskStatusForTerminalAttempt(terminalAttempt);
  const oplTransitionReceipt = oplTransitionReceiptForTerminalAttempt({
    row,
    payload,
    terminalAttempt,
    nextTask,
  });
  const reconciledAt = nowIso();
  const missingSuccessorIdentityFields = missingTerminalSuccessorIdentityFields(payload);
  const successorIdentityReady = missingSuccessorIdentityFields.length === 0;
  if (!successorIdentityReady && existingTerminalSuccessorIdentityNotReadyEvent(db, row, terminalAttempt)) {
    return false;
  }
  const admitSuccessor = successorIdentityReady
    && shouldAdmitSuccessorForTerminalRoute(payload, terminalAttempt, nextTask);
  const terminalSuccessorCandidate = successorIdentityReady
    && isTerminalSuccessorCandidate(payload, terminalAttempt, nextTask);
  if (
    row.status === 'blocked'
    && !admitSuccessor
    && !canBackfillBlockedTerminalSuccessor(row, payload, terminalAttempt)
    && !hasSupersedableProviderBlocker(row)
    && existingTerminalTaskReconciledEvent(db, row, terminalAttempt)
  ) {
    return false;
  }
  if (row.status === 'blocked' && admitSuccessor && existingPaperMissionStageRouteSuccessor(db, row, terminalAttempt)) {
    return false;
  }
  const backfillOnly = successorIdentityReady
    && canBackfillBlockedTerminalSuccessor(row, payload, terminalAttempt);
  const result = db.prepare(`
    UPDATE tasks
    SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ? AND status = ?
  `).run(
    nextTask.status,
    nextTask.reason,
    nextTask.deadLetterReason,
    reconciledAt,
    row.task_id,
    row.status,
  );
  if (result.changes === 0 && !backfillOnly) {
    return false;
  }
  const successor = admitSuccessor
    ? enqueuePaperMissionStageRouteSuccessor(db, {
        row,
        payload,
        terminalAttempt,
        source,
        reason: nextTask.reason,
        queuedAt: reconciledAt,
      })
    : null;
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: backfillOnly
      ? 'paper_mission_stage_route_terminal_successor_backfilled'
      : 'paper_mission_stage_route_terminal_task_reconciled',
    source,
    payload: {
      previous_status: row.status,
      next_status: nextTask.status,
      reason: nextTask.reason,
      backfill_only: backfillOnly,
      study_id: payload.study_id ?? null,
      mission_id: payload.mission_id ?? null,
      command_kind: payload.command_kind ?? null,
      route_target: payload.route_target ?? null,
      route_identity_key: paperMissionStageRouteIdentityValue(payload, 'route_identity_key'),
      attempt_idempotency_key: paperMissionStageRouteIdentityValue(payload, 'attempt_idempotency_key'),
      request_idempotency_key: paperMissionStageRouteIdentityValue(payload, 'request_idempotency_key'),
      terminal_successor_identity_ready: successorIdentityReady,
      terminal_successor_policy: PAPER_MISSION_STAGE_ROUTE_TERMINAL_SUCCESSOR_POLICY,
      terminal_successor_self_admission_suppressed: terminalSuccessorCandidate,
      missing_terminal_successor_identity_fields: missingSuccessorIdentityFields,
      stage_attempt_id: terminalAttempt.stage_attempt_id,
      stage_attempt_status: terminalAttempt.status,
      provider_status: terminalAttempt.provider_run.provider_status ?? null,
      closeout_refs: terminalAttempt.closeout_refs,
      closeout_receipt_status: terminalAttempt.closeout_receipt_status,
      opl_transition_receipt: oplTransitionReceipt,
      domain_ready_verdict: terminalAttempt.route_impact.domain_ready_verdict ?? null,
      successor_task_id: successor?.taskId ?? null,
      successor_dedupe_key: successor?.dedupeKey ?? null,
      successor_created: successor?.created ?? false,
      authority_boundary: {
        opl: successor
          ? 'queue_attempt_terminal_reconciliation_and_successor_admission_only'
          : 'queue_attempt_terminal_reconciliation_only',
        domain: 'truth_quality_artifact_gate_owner',
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        paper_body_mutation: false,
        owner_receipt_mutation: false,
        typed_blocker_mutation: false,
        human_gate_mutation: false,
        provider_completion_is_domain_ready: false,
        successor_provider_admission_requested: false,
        can_claim_provider_running: false,
        can_claim_paper_progress: false,
      },
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: nextTask.status === 'dead_letter' ? 'error' : 'warning',
    title: nextTask.status === 'dead_letter'
      ? 'MAS PaperMission stage route provider terminal failure observed'
      : 'MAS PaperMission stage route waiting for MAS domain gate',
    body: `${row.domain_id}:${row.task_kind} ${nextTask.reason}`,
    payload: {
      reason: nextTask.reason,
      stage_attempt_id: terminalAttempt.stage_attempt_id,
      closeout_refs: terminalAttempt.closeout_refs,
      can_claim_provider_running: false,
      can_claim_paper_progress: false,
    },
  });
  return true;
}

export function reconcilePaperMissionStageRouteTerminalTaskForAttempt(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    source: string;
  },
) {
  const row = getStageAttemptRow(db, input.stageAttemptId);
  if (!row?.task_id) {
    return { reconciled: false, taskId: null };
  }
  const taskRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(row.task_id) as
    | FamilyRuntimeTaskRow
    | undefined;
  if (!taskRow) {
    return { reconciled: false, taskId: row.task_id };
  }
  const reconciled = reconcilePaperMissionStageRouteTaskRowWithAttempt(
    db,
    taskRow,
    stageAttemptToPayload(row),
    input.source,
  );
  return { reconciled, taskId: row.task_id };
}

export function reconcilePaperMissionStageRouteTerminalTasks(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let reconciledCount = 0;
  const reconciledTaskIds = new Set<string>();
  for (const row of rows) {
    if (row.status !== 'running' && row.status !== 'blocked') {
      continue;
    }
    const payload = payloadFromTask(row);
    if (!isPaperMissionStageRouteTask(row, payload)) {
      continue;
    }
    const terminalAttempt = listStageAttemptsForTask(db, row.task_id).find(
      latestLinkedTerminalStageAttempt(row),
    );
    if (!terminalAttempt) {
      continue;
    }
    if (reconcilePaperMissionStageRouteTaskRowWithAttempt(db, row, terminalAttempt, source)) {
      reconciledCount += 1;
      reconciledTaskIds.add(row.task_id);
    }
  }
  return { reconciledCount, reconciledTaskIds };
}
