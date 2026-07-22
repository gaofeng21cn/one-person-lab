import type { DatabaseSync } from 'node:sqlite';

import {
  blockLinkedDefaultExecutorTask,
} from './family-runtime-linked-task-sync.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from './family-runtime-execution-scope-persistence.ts';
import {
  getStageAttemptRow,
  parseStageAttemptJsonObject,
  parseStageAttemptJsonList,
  stageAttemptToPayload,
  type StageAttemptRow,
} from './family-runtime-stage-attempt-ledger.ts';
import { nowIso } from './family-runtime-store.ts';

function appendActivityEventToRow(row: StageAttemptRow, event: Record<string, unknown>) {
  return [
    ...parseStageAttemptJsonList(row.activity_events_json).filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    ),
    {
      event_time: nowIso(),
      ...event,
    },
  ];
}

export function markStageAttemptOperatorHoldRequested(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    reason: string;
    source: string;
    taskScope?: Record<string, unknown>;
    holdId?: string | null;
  },
) {
  const row = getStageAttemptRow(db, input.stageAttemptId);
  if (!row || !['queued', 'running', 'checkpointed', 'human_gate'].includes(row.status)) {
    return null;
  }
  const updatedAt = nowIso();
  const providerRun = {
    ...parseStageAttemptJsonObject(row.provider_run_json),
    provider_status: 'operator_hold_requested',
    last_heartbeat_at: updatedAt,
    operator_hold: {
      reason: input.reason,
      source: input.source,
      hold_id: input.holdId ?? null,
      requested_at: updatedAt,
    },
  };
  const activityEvents = appendActivityEventToRow(row, {
    activity_kind: 'operator_hold_requested',
    activity_status: 'human_gate',
    reason: input.reason,
    source: input.source,
    task_scope: input.taskScope ?? null,
    hold_id: input.holdId ?? null,
    authority_boundary: {
      opl: 'queue_and_attempt_pause_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = 'human_gate', blocked_reason = ?, provider_run_json = ?, activity_events_json = ?,
      updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    input.reason,
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    updatedAt,
    input.stageAttemptId,
  );
  return stageAttemptToPayload({
    ...row,
    status: 'human_gate',
    blocked_reason: input.reason,
    provider_run_json: JSON.stringify(providerRun),
    activity_events_json: JSON.stringify(activityEvents),
    updated_at: updatedAt,
  });
}

export function markStageAttemptCancelRequested(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    reason: string;
    source?: string;
    temporalCancel?: Record<string, unknown> | null;
  },
) {
  const ownsTransaction = !db.isTransaction;
  try {
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    const row = getStageAttemptRow(db, input.stageAttemptId);
    if (!row) {
      if (ownsTransaction) db.exec('COMMIT');
      return null;
    }
    requireRuntimeExecutionScopeMutationAllowed(
      db,
      row,
      'mark_stage_attempt_cancel_requested',
    );
    if (row.provider_kind !== 'temporal') {
      if (ownsTransaction) db.exec('COMMIT');
      return null;
    }
    if (['completed', 'dead_lettered'].includes(row.status)) {
      if (ownsTransaction) db.exec('COMMIT');
      return stageAttemptToPayload(row);
    }
    const updatedAt = nowIso();
    const providerRun = {
      ...parseStageAttemptJsonObject(row.provider_run_json),
      provider_kind: 'temporal',
      workflow_id: row.workflow_id,
      provider_status: 'cancel_requested',
      completed_at: updatedAt,
      last_heartbeat_at: updatedAt,
      cancel_request: {
        reason: input.reason,
        source: input.source ?? 'opl-cli',
        requested_at: updatedAt,
        temporal_cancel: input.temporalCancel ?? null,
      },
    };
    const activityEvents = appendActivityEventToRow(row, {
      activity_kind: 'temporal_stage_attempt_cancel_requested',
      activity_status: 'cancel_requested',
      reason: input.reason,
      source: input.source ?? 'opl-cli',
      temporal_cancel: input.temporalCancel ?? null,
      authority_boundary: {
        opl: 'provider_attempt_cancellation_transport_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'failed', blocked_reason = 'operator_cancel_requested',
        provider_run_json = ?, activity_events_json = ?, closeout_receipt_status = NULL,
        updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(JSON.stringify(providerRun), JSON.stringify(activityEvents), updatedAt, input.stageAttemptId);
    blockLinkedDefaultExecutorTask(db, {
      row,
      reason: 'operator_cancel_requested',
      observedAt: updatedAt,
      taskDeadLetterReason: 'temporal_stage_attempt_canceled',
      eventType: 'stage_attempt_cancel_requested_task',
    });
    const result = stageAttemptToPayload({
      ...row,
      status: 'failed',
      blocked_reason: 'operator_cancel_requested',
      provider_run_json: JSON.stringify(providerRun),
      activity_events_json: JSON.stringify(activityEvents),
      closeout_receipt_status: null,
      updated_at: updatedAt,
    });
    if (ownsTransaction) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
