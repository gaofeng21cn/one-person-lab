import { DatabaseSync } from 'node:sqlite';

import { parseJsonText } from '../../kernel/json-file.ts';
import {
  record as recordValue,
  stringValue as optionalString,
} from '../../kernel/json-record.ts';
import {
  DOMAIN_ROUTE_RUNTIME_REQUEST_KIND,
  DOMAIN_ROUTE_RUNTIME_REQUEST_SURFACE_KIND,
  DOMAIN_ROUTE_STAGE_ROUTE_TASK_KIND,
  domainRouteRuntimeRequest,
} from './family-runtime-domain-route.ts';
import {
  getStageAttemptRow,
  listStageAttemptsForTask,
  stageAttemptToPayload,
  type StageAttemptStatus,
} from './family-runtime-stage-attempt-ledger.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';
import {
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS,
  FAMILY_RUNTIME_TASK_COLUMNS,
  FAMILY_RUNTIME_TASK_STATUS,
  taskFailureProjectionSql,
} from './family-runtime-queue-projection-boundary.ts';

export const DOMAIN_ROUTE_PROGRESS_OBSERVED_REASON = 'domain_route_consumable_progress_observed';
export const DOMAIN_ROUTE_NO_CONSUMABLE_ARTIFACT_REASON = 'domain_route_no_consumable_artifact';
export const DOMAIN_ROUTE_TERMINAL_PROJECTED_EVENT = 'domain_route_terminal_task_projected';

const TERMINAL_STAGE_ATTEMPT_STATUSES = new Set<StageAttemptStatus>([
  'blocked',
  'completed',
  'failed',
  FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.deadLettered,
]);
const LIVE_STAGE_ATTEMPT_STATUSES = new Set<StageAttemptStatus>([
  'queued',
  'running',
  'checkpointed',
  'human_gate',
]);
const RECONCILABLE_BLOCKERS = new Set([
  DOMAIN_ROUTE_PROGRESS_OBSERVED_REASON,
  DOMAIN_ROUTE_NO_CONSUMABLE_ARTIFACT_REASON,
  'domain_route_temporal_start_failed',
  'temporal_stage_attempt_completed_without_consumable_artifact',
  'typed_closeout_domain_route_user_stage_log_missing',
]);

type StageAttemptPayload = ReturnType<typeof stageAttemptToPayload>;

function payloadFromTask(row: FamilyRuntimeTaskRow) {
  return parseJsonText(row.payload_json) as Record<string, unknown>;
}

export function domainRouteIdentityValue(
  payload: Record<string, unknown>,
  field: string,
) {
  const runtimeRequest = domainRouteRuntimeRequest(payload) ?? {};
  const routeIdentity = recordValue(runtimeRequest.route_identity);
  const attemptIdentity = recordValue(runtimeRequest.attempt_identity);
  const topLevelRouteIdentity = recordValue(payload.route_identity);
  const topLevelAttemptIdentity = recordValue(payload.attempt_identity);
  const stageRunRequest = recordValue(payload.stage_run_request);
  return optionalString(payload[field])
    ?? optionalString(runtimeRequest[field])
    ?? optionalString(routeIdentity[field])
    ?? optionalString(attemptIdentity[field])
    ?? optionalString(topLevelRouteIdentity[field])
    ?? optionalString(topLevelAttemptIdentity[field])
    ?? optionalString(stageRunRequest[field]);
}

export function isDomainRouteStageRouteTask(
  row: Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>,
  payload: Record<string, unknown>,
) {
  if (row.task_kind !== DOMAIN_ROUTE_STAGE_ROUTE_TASK_KIND) {
    return false;
  }
  const runtimeRequest = domainRouteRuntimeRequest(payload);
  if (!runtimeRequest) {
    return true;
  }
  return runtimeRequest.surface_kind === DOMAIN_ROUTE_RUNTIME_REQUEST_SURFACE_KIND
    && (
      runtimeRequest.runtime_request_kind === DOMAIN_ROUTE_RUNTIME_REQUEST_KIND
      || runtimeRequest.runtime_request_kind === undefined
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

function taskStatusForTerminalAttempt(attempt: StageAttemptPayload) {
  if (attempt.status === 'failed' || attempt.status === FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS.deadLettered) {
    const reason = attempt.blocked_reason ?? 'domain_route_provider_terminal_failure';
    return {
      status: FAMILY_RUNTIME_TASK_STATUS.deadLetter,
      reason,
      deadLetterReason: reason,
    };
  }
  if (attempt.status === 'completed' && attempt.closeout_refs.length > 0) {
    return {
      status: FAMILY_RUNTIME_TASK_STATUS.succeeded,
      reason: DOMAIN_ROUTE_PROGRESS_OBSERVED_REASON,
      deadLetterReason: null,
    };
  }
  const routeImpact = recordValue(attempt.route_impact);
  const domainReadyVerdict = optionalString(routeImpact.domain_ready_verdict);
  const reason = attempt.blocked_reason
    ?? (domainReadyVerdict ? `domain_route_${domainReadyVerdict}` : null)
    ?? DOMAIN_ROUTE_NO_CONSUMABLE_ARTIFACT_REASON;
  return {
    status: 'blocked' as const,
    reason,
    deadLetterReason: reason,
  };
}

function firstCloseoutRef(terminalAttempt: StageAttemptPayload) {
  return terminalAttempt.closeout_refs.find(
    (entry) => typeof entry === 'string' && entry.trim().length > 0,
  ) ?? null;
}

function transportReceiptStatus(
  terminalAttempt: StageAttemptPayload,
  nextTask: ReturnType<typeof taskStatusForTerminalAttempt>,
) {
  if (nextTask.status === FAMILY_RUNTIME_TASK_STATUS.deadLetter) {
    return 'provider_terminal_blocked';
  }
  if (nextTask.status === FAMILY_RUNTIME_TASK_STATUS.succeeded) {
    return terminalAttempt.closeout_receipt_status === 'accepted_typed_closeout'
      ? 'typed_closeout_progress_observed'
      : 'consumable_progress_observed';
  }
  return 'runtime_blocker_observed';
}

function transportReceipt(input: {
  row: FamilyRuntimeTaskRow;
  payload: Record<string, unknown>;
  terminalAttempt: StageAttemptPayload;
  nextTask: ReturnType<typeof taskStatusForTerminalAttempt>;
}) {
  const runtimeRequest = domainRouteRuntimeRequest(input.payload);
  const routeImpact = recordValue(input.terminalAttempt.route_impact);
  const stageAttemptId = input.terminalAttempt.stage_attempt_id;
  return {
    surface_kind: 'opl_domain_route_terminal_transport_receipt',
    schema_version: 1,
    receipt_status: transportReceiptStatus(input.terminalAttempt, input.nextTask),
    role: 'transport_receipt_only',
    source_event_type: DOMAIN_ROUTE_TERMINAL_PROJECTED_EVENT,
    domain_id: input.row.domain_id,
    task_kind: input.row.task_kind,
    profile_ref: optionalString(runtimeRequest?.profile_ref),
    command_kind: domainRouteIdentityValue(input.payload, 'command_kind'),
    route_target: domainRouteIdentityValue(input.payload, 'route_target'),
    work_unit_id: domainRouteIdentityValue(input.payload, 'work_unit_id'),
    work_unit_fingerprint: domainRouteIdentityValue(input.payload, 'work_unit_fingerprint'),
    route_identity_key: domainRouteIdentityValue(input.payload, 'route_identity_key'),
    attempt_idempotency_key: domainRouteIdentityValue(input.payload, 'attempt_idempotency_key'),
    request_idempotency_key: domainRouteIdentityValue(input.payload, 'request_idempotency_key'),
    domain_route_handoff_ref: domainRouteIdentityValue(input.payload, 'domain_route_handoff_ref'),
    domain_route_transaction_ref: domainRouteIdentityValue(input.payload, 'domain_route_transaction_ref'),
    domain_route_command_ref: domainRouteIdentityValue(input.payload, 'domain_route_command_ref'),
    task_id: input.row.task_id,
    task_status: input.row.status,
    reconciled_task_status: input.nextTask.status,
    stage_attempt_id: stageAttemptId,
    stage_attempt_status: input.terminalAttempt.status,
    stage_attempt_ref: stageAttemptId ? `opl://stage-attempts/${stageAttemptId}` : null,
    runtime_closeout_ref: firstCloseoutRef(input.terminalAttempt)
      ?? (input.row.task_id
        ? `opl://family-runtime/tasks/${input.row.task_id}/terminal-closeout-readback`
        : null),
    typed_runtime_blocker_ref: input.nextTask.status === FAMILY_RUNTIME_TASK_STATUS.succeeded
      ? null
      : firstCloseoutRef(input.terminalAttempt),
    closeout_refs: input.terminalAttempt.closeout_refs,
    closeout_receipt_status: input.terminalAttempt.closeout_receipt_status,
    blocked_reason: input.nextTask.status === FAMILY_RUNTIME_TASK_STATUS.succeeded
      ? null
      : input.nextTask.reason,
    progress_reason: input.nextTask.status === FAMILY_RUNTIME_TASK_STATUS.succeeded
      ? input.nextTask.reason
      : null,
    route_impact: Object.keys(routeImpact).length > 0 ? routeImpact : null,
    semantic_route_owner: 'decisive_codex_attempt',
    transport_projection_blocks_next_stage: false,
    authority_boundary: {
      role: 'transport_receipt_only',
      writes_domain_truth: false,
      writes_domain_quality_verdict: false,
      writes_domain_owner_receipt: false,
      writes_domain_typed_blocker: false,
      writes_domain_human_gate: false,
      writes_domain_current_package: false,
      writes_domain_artifact_body: false,
      can_select_next_stage: false,
      can_project_consumable_artifact_progress: true,
      can_claim_provider_running: false,
      can_claim_domain_ready: false,
      can_claim_domain_quality: false,
      can_claim_runtime_ready: false,
    },
  };
}

function alreadyReconciled(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM events
    WHERE task_id = ?
      AND event_type = ?
      AND json_extract(payload_json, '$.stage_attempt_id') = ?
      AND json_type(payload_json, '$.opl_transport_receipt') IS NOT NULL
    LIMIT 1
  `).get(row.task_id, DOMAIN_ROUTE_TERMINAL_PROJECTED_EVENT, terminalAttempt.stage_attempt_id));
}

function canReconcileTask(
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
) {
  if (row.status === 'running') {
    return true;
  }
  if (row.status !== 'blocked') {
    return false;
  }
  const reason = row[FAMILY_RUNTIME_TASK_COLUMNS.deadLetterReason] ?? row.last_error;
  return terminalAttempt.closeout_refs.length > 0
    || (typeof reason === 'string' && RECONCILABLE_BLOCKERS.has(reason));
}

function reconcileTaskRowWithAttempt(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
  source: string,
) {
  const payload = payloadFromTask(row);
  if (!isDomainRouteStageRouteTask(row, payload)
    || !TERMINAL_STAGE_ATTEMPT_STATUSES.has(terminalAttempt.status)
    || hasLaterLiveLinkedStageAttempt(db, terminalAttempt)
    || !canReconcileTask(row, terminalAttempt)
    || alreadyReconciled(db, row, terminalAttempt)
  ) {
    return false;
  }
  const nextTask = taskStatusForTerminalAttempt(terminalAttempt);
  const oplTransportReceipt = transportReceipt({ row, payload, terminalAttempt, nextTask });
  const reconciledAt = nowIso();
  const result = db.prepare(`
    UPDATE tasks
    SET status = ?, ${taskFailureProjectionSql()}
    WHERE task_id = ? AND status = ?
  `).run(
    nextTask.status,
    nextTask.status === FAMILY_RUNTIME_TASK_STATUS.succeeded ? null : nextTask.reason,
    nextTask.deadLetterReason,
    reconciledAt,
    row.task_id,
    row.status,
  );
  if (result.changes === 0) {
    return false;
  }
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: DOMAIN_ROUTE_TERMINAL_PROJECTED_EVENT,
    source,
    payload: {
      previous_status: row.status,
      next_status: nextTask.status,
      reason: nextTask.reason,
      stage_attempt_id: terminalAttempt.stage_attempt_id,
      stage_attempt_status: terminalAttempt.status,
      closeout_refs: terminalAttempt.closeout_refs,
      closeout_receipt_status: terminalAttempt.closeout_receipt_status,
      opl_transport_receipt: oplTransportReceipt,
      authority_boundary: oplTransportReceipt.authority_boundary,
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: nextTask.status === FAMILY_RUNTIME_TASK_STATUS.deadLetter
      ? 'error'
      : nextTask.status === FAMILY_RUNTIME_TASK_STATUS.succeeded
        ? 'info'
        : 'warning',
    title: nextTask.status === FAMILY_RUNTIME_TASK_STATUS.deadLetter
      ? 'Domain route provider terminal failure observed'
      : nextTask.status === FAMILY_RUNTIME_TASK_STATUS.succeeded
        ? 'Domain route consumable progress observed'
        : 'Domain route blocked by a hard boundary',
    body: `${row.domain_id}:${row.task_kind} ${nextTask.reason}`,
    payload: {
      reason: nextTask.reason,
      stage_attempt_id: terminalAttempt.stage_attempt_id,
      closeout_refs: terminalAttempt.closeout_refs,
      can_claim_provider_running: false,
      consumable_progress_observed: nextTask.status === FAMILY_RUNTIME_TASK_STATUS.succeeded,
      next_stage_may_start: nextTask.status === FAMILY_RUNTIME_TASK_STATUS.succeeded,
      can_claim_domain_ready: false,
    },
  });
  return true;
}

export function reconcileDomainRouteTerminalTaskForAttempt(
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
  const reconciled = reconcileTaskRowWithAttempt(
    db,
    taskRow,
    stageAttemptToPayload(row),
    input.source,
  );
  return { reconciled, taskId: row.task_id };
}

export function reconcileDomainRouteTerminalTasks(
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
    if (!isDomainRouteStageRouteTask(row, payload)) {
      continue;
    }
    const terminalAttempt = listStageAttemptsForTask(db, row.task_id).find(
      latestLinkedTerminalStageAttempt(row),
    );
    if (terminalAttempt && reconcileTaskRowWithAttempt(db, row, terminalAttempt, source)) {
      reconciledCount += 1;
      reconciledTaskIds.add(row.task_id);
    }
  }
  return { reconciledCount, reconciledTaskIds };
}
