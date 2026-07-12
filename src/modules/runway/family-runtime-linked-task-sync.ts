import type { DatabaseSync } from 'node:sqlite';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  insertEvent,
  insertNotification,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';
import {
  clearTaskLeaseProjectionSql,
  FAMILY_RUNTIME_TASK_COLUMNS,
  FAMILY_RUNTIME_TASK_STATUS,
  taskFailureProjectionSql,
} from './family-runtime-queue-projection-boundary.ts';
import type { StageAttemptRow } from './family-runtime-stage-attempt-ledger.ts';
import {
  isStageNativeOwnerActionFromDomainProfile,
  stageAttemptRowHasStageNativeProgressOrOwnerAnswerFromDomainProfile,
} from './family-runtime-stage-native-owner-answer.ts';

type LinkedTask = Pick<
  FamilyRuntimeTaskRow,
  'task_id' | 'domain_id' | 'task_kind' | 'payload_json' | 'status' | 'last_error' | 'dead_letter_reason'
>;

const PROVIDER_ONLY_TASK_DEAD_LETTER_REASONS = new Set([
  'temporal_stage_attempt_start_failed',
  'temporal_stage_attempt_not_completed',
  'temporal_stage_attempt_failed',
  'temporal_stage_attempt_canceled',
]);

function linkedDefaultExecutorTask(
  db: DatabaseSync,
  row: StageAttemptRow,
) {
  if (!row.task_id) {
    return null;
  }
  const task = db.prepare(`
    SELECT task_id, domain_id, task_kind, payload_json, status, last_error, dead_letter_reason
    FROM tasks
    WHERE task_id = ?
  `).get(row.task_id) as LinkedTask | undefined;
  if (!task || !isStageNativeOwnerActionFromDomainProfile({
    row: task,
    payload: parseTaskPayload(task),
  })) {
    return null;
  }
  return task;
}

function laterAttemptPredicate() {
  return `
    (
      created_at > @created_at
      OR (created_at = @created_at AND rowid > (
        SELECT rowid FROM stage_attempts WHERE stage_attempt_id = @stage_attempt_id
      ))
    )
  `;
}

function hasLaterLinkedAttempt(
  db: DatabaseSync,
  row: StageAttemptRow,
) {
  if (!row.task_id) {
    return false;
  }
  const newerAttempt = db.prepare(`
    SELECT stage_attempt_id
    FROM stage_attempts
    WHERE task_id = @task_id AND stage_attempt_id != @stage_attempt_id
      AND ${laterAttemptPredicate()}
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `).get({
    task_id: row.task_id,
    stage_attempt_id: row.stage_attempt_id,
    created_at: row.created_at,
  }) as { stage_attempt_id: string } | undefined;
  return Boolean(newerAttempt);
}

function hasLaterAcceptedCloseoutAttempt(
  db: DatabaseSync,
  row: StageAttemptRow,
) {
  if (!row.task_id) {
    return false;
  }
  const newerCloseout = db.prepare(`
    SELECT stage_attempt_id
    FROM stage_attempts
    WHERE task_id = @task_id AND stage_attempt_id != @stage_attempt_id
      AND status = 'completed' AND closeout_receipt_status = 'accepted_typed_closeout'
      AND ${laterAttemptPredicate()}
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `).get({
    task_id: row.task_id,
    stage_attempt_id: row.stage_attempt_id,
    created_at: row.created_at,
  }) as { stage_attempt_id: string } | undefined;
  return Boolean(newerCloseout);
}

function canBlockFromProviderTerminalObservation(task: LinkedTask) {
  if (task.status === 'queued' || task.status === 'running' || task.status === 'succeeded') {
    return true;
  }
  return task.status === 'blocked'
    && task.dead_letter_reason !== null
    && PROVIDER_ONLY_TASK_DEAD_LETTER_REASONS.has(task.dead_letter_reason);
}

function canSucceedFromTypedCloseout(task: LinkedTask) {
  if (task.status === 'queued' || task.status === 'running' || task.status === 'succeeded') {
    return true;
  }
  return task.status === 'blocked'
    && task.dead_letter_reason !== null
    && PROVIDER_ONLY_TASK_DEAD_LETTER_REASONS.has(task.dead_letter_reason);
}

function parseTaskPayload(task: LinkedTask) {
  try {
    const parsed = parseJsonText(task.payload_json);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isMissingStageNativeProgressOrOwnerAnswer(task: LinkedTask, row: StageAttemptRow) {
  const payload = parseTaskPayload(task);
  return isStageNativeOwnerActionFromDomainProfile({ row: task, payload })
    && !stageAttemptRowHasStageNativeProgressOrOwnerAnswerFromDomainProfile({
      row,
      currentPayload: payload,
    });
}

export function markLinkedDefaultExecutorTaskCompleted(
  db: DatabaseSync,
  input: {
    row: StageAttemptRow;
    observedAt: string;
  },
) {
  const task = linkedDefaultExecutorTask(db, input.row);
  if (!task || hasLaterLinkedAttempt(db, input.row)) {
    return;
  }
  const alreadySucceeded = task.status === 'succeeded'
    && task.last_error === null
    && task.dead_letter_reason === null;
  if (alreadySucceeded || !canSucceedFromTypedCloseout(task)) {
    return;
  }
  const missingRecognizedEnvelope = isMissingStageNativeProgressOrOwnerAnswer(task, input.row);
  db.prepare(`
    UPDATE tasks
    SET status = ?, ${clearTaskLeaseProjectionSql()},
      last_error = NULL, ${FAMILY_RUNTIME_TASK_COLUMNS.deadLetterReason} = NULL, updated_at = ?
    WHERE task_id = ?
  `).run(FAMILY_RUNTIME_TASK_STATUS.succeeded, input.observedAt, input.row.task_id);
  insertEvent(db, {
    taskId: input.row.task_id,
    domainId: input.row.domain_id,
    eventType: 'stage_attempt_terminal_completed_task',
    source: 'opl-family-runtime',
    payload: {
      stage_attempt_id: input.row.stage_attempt_id,
      workflow_id: input.row.workflow_id,
      reason: 'temporal_stage_attempt_completed',
      ...(missingRecognizedEnvelope
        ? {
            quality_debt: 'stage_native_progress_envelope_missing_but_provider_attempt_completed',
            next_stage_blocked: false,
            framework_should_derive_progress_envelope: true,
          }
        : {}),
      cleared_dead_letter_reason: task.dead_letter_reason,
      authority_boundary: {
        opl: 'provider_attempt_status_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    },
  });
  insertNotification(db, {
    taskId: input.row.task_id,
    severity: missingRecognizedEnvelope ? 'warning' : 'info',
    title: missingRecognizedEnvelope
      ? 'Family runtime attempt completed with derived progress debt'
      : 'Family runtime default executor attempt completed',
    body: input.row.stage_attempt_id,
    payload: {
      stage_attempt_id: input.row.stage_attempt_id,
      reason: 'temporal_stage_attempt_completed',
      ...(missingRecognizedEnvelope
        ? { quality_debt: 'stage_native_progress_envelope_missing_nonblocking' }
        : {}),
    },
  });
}

export function blockLinkedDefaultExecutorTask(
  db: DatabaseSync,
  input: {
    row: StageAttemptRow;
    reason: string;
    observedAt: string;
    taskDeadLetterReason:
      | 'temporal_stage_attempt_failed'
      | 'temporal_stage_attempt_not_completed'
      | 'temporal_stage_attempt_start_failed'
      | 'temporal_stage_attempt_canceled';
    eventType: string;
  },
) {
  const task = linkedDefaultExecutorTask(db, input.row);
  if (
    !task
    || hasLaterLinkedAttempt(db, input.row)
    || hasLaterAcceptedCloseoutAttempt(db, input.row)
    || !canBlockFromProviderTerminalObservation(task)
  ) {
    return;
  }
  if (
    task.status === 'blocked'
    && task.last_error === input.reason
    && task.dead_letter_reason === input.taskDeadLetterReason
  ) {
    return;
  }
  db.prepare(`
    UPDATE tasks
    SET status = ?, ${taskFailureProjectionSql()}
    WHERE task_id = ?
  `).run(FAMILY_RUNTIME_TASK_STATUS.blocked, input.reason, input.taskDeadLetterReason, input.observedAt, input.row.task_id);
  insertEvent(db, {
    taskId: input.row.task_id,
    domainId: input.row.domain_id,
    eventType: input.eventType,
    source: 'opl-family-runtime',
    payload: {
      stage_attempt_id: input.row.stage_attempt_id,
      workflow_id: input.row.workflow_id,
      reason: input.reason,
      task_dead_letter_reason: input.taskDeadLetterReason,
      authority_boundary: {
        opl: 'provider_attempt_status_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    },
  });
  insertNotification(db, {
    taskId: input.row.task_id,
    severity: 'error',
    title: 'Family runtime default executor attempt blocked',
    body: input.reason,
    payload: {
      stage_attempt_id: input.row.stage_attempt_id,
      reason: input.reason,
      task_dead_letter_reason: input.taskDeadLetterReason,
    },
  });
}
