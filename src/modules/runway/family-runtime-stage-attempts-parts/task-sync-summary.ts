import { DatabaseSync } from 'node:sqlite';

import {
  parseStageAttemptJsonList,
  parseStageAttemptJsonObject,
  type StageAttemptRow,
  type StageAttemptStatus,
} from '../family-runtime-stage-attempt-ledger.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from '../family-runtime-execution-scope-persistence.ts';
import {
  appendActivityEventToRow,
  nowIso,
} from './shared.ts';
import { inspectStageAttempt } from './inspect.ts';

export function updateStageAttemptsForTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    status: StageAttemptStatus;
    stageAttemptIds?: string[];
    incrementAttempt?: boolean;
    checkpointRefs?: string[];
    closeoutRefs?: string[];
    closeoutReceiptStatus?: string | null;
    humanGateRefs?: string[];
    blockedReason?: string | null;
    routeImpact?: Record<string, unknown>;
    activityEvent?: Record<string, unknown>;
  },
) {
  const ownsTransaction = !db.isTransaction;
  try {
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    const rows = input.stageAttemptIds && input.stageAttemptIds.length > 0
      ? db.prepare(`
        SELECT * FROM stage_attempts
        WHERE task_id = ? AND stage_attempt_id IN (${input.stageAttemptIds.map(() => '?').join(',')})
      `).all(input.taskId, ...input.stageAttemptIds) as StageAttemptRow[]
      : db.prepare('SELECT * FROM stage_attempts WHERE task_id = ?').all(input.taskId) as StageAttemptRow[];
    for (const row of rows) {
      requireRuntimeExecutionScopeMutationAllowed(
        db,
        row as unknown as Record<string, unknown>,
        'update_stage_attempts_for_task',
      );
    }
    if (rows.length === 0) {
      if (ownsTransaction) db.exec('COMMIT');
      return [];
    }
    const updatedAt = nowIso();
    const attempts = rows.map((row) => {
    const status = input.status === 'completed' ? 'checkpointed' : input.status;
    const checkpointRefs = input.checkpointRefs ?? parseStageAttemptJsonList(row.checkpoint_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const closeoutRefs = input.closeoutRefs ?? parseStageAttemptJsonList(row.closeout_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const humanGateRefs = input.humanGateRefs ?? parseStageAttemptJsonList(row.human_gate_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const providerRun = {
      ...parseStageAttemptJsonObject(row.provider_run_json),
      provider_status: status,
      last_heartbeat_at: updatedAt,
    };
    const routeImpact = input.routeImpact
      ? { ...parseStageAttemptJsonObject(row.route_impact_json), ...input.routeImpact }
      : parseStageAttemptJsonObject(row.route_impact_json);
    const activityEvents = input.activityEvent
      ? appendActivityEventToRow(row, input.activityEvent)
      : parseStageAttemptJsonList(row.activity_events_json);
    const closeoutReceiptStatus = input.closeoutReceiptStatus !== undefined
      ? input.closeoutReceiptStatus
      : input.status === 'completed' && closeoutRefs.length > 0
        ? 'domain_handler_receipt_ref_only'
        : null;
    db.prepare(`
      UPDATE stage_attempts
      SET status = ?, attempt_count = ?, checkpoint_refs_json = ?, closeout_refs_json = ?,
        human_gate_refs_json = ?, blocked_reason = ?, provider_run_json = ?, activity_events_json = ?,
        route_impact_json = ?,
        closeout_receipt_status = CASE WHEN ? IS NOT NULL AND closeout_receipt_status IS NULL THEN ? ELSE closeout_receipt_status END,
        updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      status,
      input.incrementAttempt ? row.attempt_count + 1 : row.attempt_count,
      JSON.stringify(checkpointRefs),
      JSON.stringify(closeoutRefs),
      JSON.stringify(humanGateRefs),
      input.blockedReason === undefined ? row.blocked_reason : input.blockedReason,
      JSON.stringify(providerRun),
      JSON.stringify(activityEvents),
      JSON.stringify(routeImpact),
      closeoutReceiptStatus,
      closeoutReceiptStatus,
      updatedAt,
      row.stage_attempt_id,
    );
    return inspectStageAttempt(db, row.stage_attempt_id);
    });
    if (ownsTransaction) db.exec('COMMIT');
    return attempts;
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

export function stageAttemptSummary(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count FROM stage_attempts GROUP BY status ORDER BY status
  `).all() as Array<{ status: StageAttemptStatus; count: number }>;
  const reasonRows = db.prepare(`
    SELECT status, COALESCE(blocked_reason, 'unclassified') AS reason, COUNT(*) AS count
    FROM stage_attempts
    WHERE status IN ('blocked', 'failed')
    GROUP BY status, reason
    ORDER BY count DESC, status, reason
    LIMIT 25
  `).all() as Array<{ status: StageAttemptStatus; reason: string; count: number }>;
  const stageRows = db.prepare(`
    SELECT status, stage_id, COALESCE(blocked_reason, 'unclassified') AS reason, COUNT(*) AS count
    FROM stage_attempts
    WHERE status IN ('blocked', 'failed')
    GROUP BY status, stage_id, reason
    ORDER BY count DESC, status, stage_id, reason
    LIMIT 25
  `).all() as Array<{ status: StageAttemptStatus; stage_id: string; reason: string; count: number }>;
  return {
    total: rows.reduce((sum, row) => sum + row.count, 0),
    by_status: Object.fromEntries(rows.map((row) => [row.status, row.count])),
    repair_breakdown: {
      sample_limit: 25,
      by_status_reason: reasonRows.map((row) => ({
        status: row.status,
        reason: row.reason,
        attempt_count: row.count,
      })),
      by_status_stage_reason: stageRows.map((row) => ({
        status: row.status,
        stage_id: row.stage_id,
        reason: row.reason,
        attempt_count: row.count,
      })),
    },
  };
}
