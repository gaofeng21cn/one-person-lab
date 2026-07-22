import type { DatabaseSync } from 'node:sqlite';

import { blockLinkedDefaultExecutorTask } from './family-runtime-linked-task-sync.ts';
import {
  getStageAttemptRow,
  parseStageAttemptJsonObject,
  parseStageAttemptJsonList,
  stageAttemptToPayload,
  type StageAttemptRow,
} from './family-runtime-stage-attempt-ledger.ts';
import { nowIso } from './family-runtime-store.ts';
import { requireResolvedPersistedStageAttemptIdentity } from './family-runtime-persisted-identity-admission.ts';
import {
  FAMILY_RUNTIME_TASK_COLUMNS,
  taskLeaseProjectionSelectSql,
  type TaskLeaseProjectionRow,
} from './family-runtime-queue-projection-boundary.ts';

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

function stageAttemptHasProviderStarted(row: StageAttemptRow) {
  if (row.executor_kind === 'domain_handler') {
    return false;
  }
  return ['running', 'checkpointed', 'human_gate'].includes(row.status);
}

function linkedRunningTaskLeaseState(db: DatabaseSync, row: StageAttemptRow) {
  if (!row.task_id) {
    return null;
  }
  return db.prepare(`
    SELECT ${taskLeaseProjectionSelectSql()}
    FROM tasks
    WHERE task_id = ?
  `).get(row.task_id) as TaskLeaseProjectionRow | undefined ?? null;
}

function isExpiredOrUnleasedDefaultExecutorAdmission(db: DatabaseSync, row: StageAttemptRow) {
  if (
    row.executor_kind !== 'codex_cli'
    || row.status !== 'queued'
    || parseStageAttemptJsonObject(row.provider_run_json).provider_status !== 'registered'
  ) {
    return false;
  }
  const task = linkedRunningTaskLeaseState(db, row);
  if (task?.status !== 'running') {
    return false;
  }
  const leaseOwner = task[FAMILY_RUNTIME_TASK_COLUMNS.leaseOwner];
  const leaseExpiresAtText = task[FAMILY_RUNTIME_TASK_COLUMNS.leaseExpiresAt];
  if (!leaseOwner || !leaseExpiresAtText) {
    return true;
  }
  const leaseExpiresAt = Date.parse(leaseExpiresAtText);
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= Date.now();
}

function canFailStageAttemptForWorkflowMissing(
  db: DatabaseSync,
  row: StageAttemptRow,
) {
  return stageAttemptHasProviderStarted(row)
    || isExpiredOrUnleasedDefaultExecutorAdmission(db, row);
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
  ) {
    return null;
  }
  requireResolvedPersistedStageAttemptIdentity({
    db,
    stageAttemptId: observation.stage_attempt_id,
    operation: 'sync_stage_attempt_from_temporal_unavailable_observation',
  });
  if (!canFailStageAttemptForWorkflowMissing(db, row)) return null;
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
  blockLinkedDefaultExecutorTask(db, {
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
