import type { DatabaseSync } from 'node:sqlite';

import { blockLinkedMasDefaultExecutorTask } from './family-runtime-linked-task-sync.ts';
import {
  getStageAttemptRow,
  parseStageAttemptJsonObject,
  parseStageAttemptJsonList,
  stageAttemptToPayload,
  type StageAttemptRow,
} from './family-runtime-stage-attempt-ledger.ts';
import { nowIso } from './family-runtime-store.ts';

type TemporalStageAttemptUnavailableObservation = {
  surface_kind: 'temporal_stage_attempt_query_unavailable';
  provider_kind: 'temporal';
  stage_attempt_id: string;
  workflow_id: string;
  status: 'unavailable';
  reason: string;
};

function isTemporalStageAttemptUnavailableObservation(
  observation: unknown,
): observation is TemporalStageAttemptUnavailableObservation {
  return (
    typeof observation === 'object'
    && observation !== null
    && !Array.isArray(observation)
    && (observation as Record<string, unknown>).surface_kind === 'temporal_stage_attempt_query_unavailable'
    && (observation as Record<string, unknown>).provider_kind === 'temporal'
    && (observation as Record<string, unknown>).status === 'unavailable'
    && typeof (observation as Record<string, unknown>).stage_attempt_id === 'string'
    && typeof (observation as Record<string, unknown>).workflow_id === 'string'
    && typeof (observation as Record<string, unknown>).reason === 'string'
  );
}

function temporalUnavailableFailureReason(
  observation: TemporalStageAttemptUnavailableObservation,
) {
  if (observation.reason === 'temporal_workflow_not_started_or_not_found') {
    return 'temporal_workflow_not_started_or_not_found';
  }
  return null;
}

function linkedTaskForWorkflowMissingObservation(db: DatabaseSync, row: StageAttemptRow) {
  if (!row.task_id) {
    return null;
  }
  try {
    return db.prepare(`
      SELECT domain_id, task_kind, status, lease_expires_at
      FROM tasks
      WHERE task_id = ?
    `).get(row.task_id) as {
      domain_id: string;
      task_kind: string;
      status: string;
      lease_expires_at: string | null;
    } | undefined ?? null;
  } catch {
    return null;
  }
}

function stageAttemptHasProviderStarted(row: StageAttemptRow) {
  if (row.executor_kind === 'domain_handler') {
    return false;
  }
  return ['running', 'checkpointed', 'human_gate'].includes(row.status);
}

function hasExpiredRunningMasDefaultExecutorLease(db: DatabaseSync, row: StageAttemptRow) {
  const task = linkedTaskForWorkflowMissingObservation(db, row);
  if (
    !task
    || task.domain_id !== 'medautoscience'
    || task.task_kind !== 'domain_owner/default-executor-dispatch'
    || task.status !== 'running'
    || !task.lease_expires_at
  ) {
    return false;
  }
  const leaseExpiresAt = Date.parse(task.lease_expires_at);
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= Date.now();
}

function canFailStageAttemptForWorkflowMissing(
  db: DatabaseSync,
  row: StageAttemptRow,
) {
  if (stageAttemptHasProviderStarted(row)) {
    return true;
  }
  return row.status === 'queued' && hasExpiredRunningMasDefaultExecutorLease(db, row);
}

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

export function syncStageAttemptFromTemporalUnavailableObservation(
  db: DatabaseSync,
  observation: unknown,
) {
  if (!isTemporalStageAttemptUnavailableObservation(observation)) {
    return null;
  }
  const failureReason = temporalUnavailableFailureReason(observation);
  if (!failureReason) {
    return null;
  }
  const row = getStageAttemptRow(db, observation.stage_attempt_id);
  if (
    !row
    || row.provider_kind !== 'temporal'
    || row.workflow_id !== observation.workflow_id
    || !canFailStageAttemptForWorkflowMissing(db, row)
  ) {
    return null;
  }
  const observedAt = nowIso();
  const providerRun = {
    ...parseStageAttemptJsonObject(row.provider_run_json),
    provider_kind: 'temporal',
    workflow_id: observation.workflow_id,
    provider_status: 'failed',
    completed_at: observedAt,
    last_heartbeat_at: observedAt,
    terminal_observation: {
      source: 'temporal_stage_attempt_query_unavailable',
      workflow_status: null,
      query_status: observation.status,
      reason: failureReason,
    },
  };
  const activityEvents = appendActivityEventToRow(row, {
    activity_kind: 'temporal_stage_attempt_terminal_observation',
    activity_status: 'failed',
    workflow_status: null,
    query_status: observation.status,
    reason: failureReason,
    authority_boundary: {
      opl: 'provider_transport_status_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = 'failed', blocked_reason = ?, provider_run_json = ?, activity_events_json = ?,
      closeout_receipt_status = NULL, updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    failureReason,
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    observedAt,
    observation.stage_attempt_id,
  );
  blockLinkedMasDefaultExecutorTask(db, {
    row,
    reason: failureReason,
    observedAt,
    taskDeadLetterReason: 'temporal_stage_attempt_start_failed',
    eventType: 'stage_attempt_temporal_workflow_missing_task',
  });
  return stageAttemptToPayload({
    ...row,
    status: 'failed',
    blocked_reason: failureReason,
    provider_run_json: JSON.stringify(providerRun),
    activity_events_json: JSON.stringify(activityEvents),
    closeout_receipt_status: null,
    updated_at: observedAt,
  });
}
