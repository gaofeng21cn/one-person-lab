import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../../kernel/contract-validation.ts';
import { getStageAttemptRow } from './persistence.ts';
import {
  stageAttemptCloseoutToPayload,
  stageAttemptSignalToPayload,
  stageAttemptToPayload,
  parseStageAttemptCloseoutJsonObject,
} from './payload.ts';
import type {
  StageAttemptRow,
  StageAttemptStatus,
  StageAttemptSignalRow,
  StageAttemptCloseoutRow,
} from './types.ts';

export function listStageAttempts(db: DatabaseSync, options: {
  workUnitLimitPerLane?: number;
  attemptLimitPerWorkUnit?: number;
  archived?: 'exclude' | 'only' | 'include';
} = {}) {
  const workUnitLimitPerLane = options.workUnitLimitPerLane;
  const attemptLimitPerWorkUnit = options.attemptLimitPerWorkUnit;
  if (
    typeof workUnitLimitPerLane === 'number'
    && Number.isInteger(workUnitLimitPerLane)
    && workUnitLimitPerLane > 0
    && typeof attemptLimitPerWorkUnit === 'number'
    && Number.isInteger(attemptLimitPerWorkUnit)
    && attemptLimitPerWorkUnit > 0
  ) {
    return (db.prepare(`
      WITH normalized AS (
        SELECT
          stage_attempt_id,
          domain_id,
          status,
          created_at,
          updated_at,
          COALESCE(
            NULLIF(json_extract(workspace_locator_json, '$.work_unit_id'), ''),
            NULLIF(json_extract(workspace_locator_json, '$.task_or_work_unit_ref'), ''),
            NULLIF(json_extract(workspace_locator_json, '$.task_ref'), ''),
            task_id,
            stage_attempt_id
          ) AS work_unit_key
        FROM stage_attempts
        WHERE ${options.archived === 'only' ? 'archived_at IS NOT NULL' : options.archived === 'include' ? '1 = 1' : 'archived_at IS NULL'}
      ), ranked AS (
        SELECT
          normalized.*,
          ROW_NUMBER() OVER (
            PARTITION BY domain_id, work_unit_key
            ORDER BY updated_at DESC, created_at DESC, stage_attempt_id DESC
          ) AS attempt_rank
        FROM normalized
      ), latest AS (
        SELECT
          ranked.*,
          CASE
            WHEN status = 'running' THEN 'running'
            WHEN status IN ('blocked', 'dead_lettered', 'failed', 'human_gate') THEN 'attention'
            ELSE 'recent'
          END AS activity_lane
        FROM ranked
        WHERE attempt_rank = 1
      ), selected AS (
        SELECT
          latest.*,
          ROW_NUMBER() OVER (
            PARTITION BY activity_lane
            ORDER BY updated_at DESC, created_at DESC, stage_attempt_id DESC
          ) AS lane_rank
        FROM latest
      )
      SELECT stage_attempts.*
      FROM ranked
      JOIN selected
        ON selected.domain_id = ranked.domain_id
        AND selected.work_unit_key = ranked.work_unit_key
      JOIN stage_attempts
        ON stage_attempts.stage_attempt_id = ranked.stage_attempt_id
      WHERE selected.lane_rank <= ?
        AND ranked.attempt_rank <= ?
      ORDER BY
        CASE selected.activity_lane WHEN 'running' THEN 0 WHEN 'attention' THEN 1 ELSE 2 END,
        selected.updated_at DESC,
        selected.created_at DESC,
        selected.stage_attempt_id DESC,
        ranked.attempt_rank ASC
    `).all(workUnitLimitPerLane, attemptLimitPerWorkUnit) as StageAttemptRow[])
      .map(stageAttemptToPayload);
  }
  return (db.prepare(`
    SELECT * FROM stage_attempts
    WHERE ${options.archived === 'only' ? 'archived_at IS NOT NULL' : options.archived === 'include' ? '1 = 1' : 'archived_at IS NULL'}
    ORDER BY updated_at DESC, created_at DESC
  `).all() as StageAttemptRow[]).map(stageAttemptToPayload);
}

const ARCHIVABLE_STAGE_ATTEMPT_STATUSES = new Set<StageAttemptStatus>([
  'completed',
  'failed',
  'dead_lettered',
]);

export function setStageAttemptArchived(
  db: DatabaseSync,
  input: { stageAttemptId: string; archived: boolean; reason: string; source: string },
) {
  const row = getStageAttemptRow(db, input.stageAttemptId);
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Stage attempt not found.', {
      stage_attempt_id: input.stageAttemptId,
    });
  }
  if (input.archived && !ARCHIVABLE_STAGE_ATTEMPT_STATUSES.has(row.status)) {
    throw new FrameworkContractError('cli_usage_error', 'Only terminal stage attempts can be archived.', {
      stage_attempt_id: input.stageAttemptId,
      status: row.status,
      archivable_statuses: [...ARCHIVABLE_STAGE_ATTEMPT_STATUSES],
    });
  }
  const archivedAt = input.archived ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE stage_attempts
    SET archived_at = ?, archived_reason = ?, archived_source = ?
    WHERE stage_attempt_id = ?
  `).run(
    archivedAt,
    input.archived ? input.reason : null,
    input.archived ? input.source : null,
    input.stageAttemptId,
  );
  return stageAttemptToPayload(getStageAttemptRow(db, input.stageAttemptId)!);
}

export function listStageAttemptRows(
  db: DatabaseSync,
  limit?: number,
  archived: 'exclude' | 'only' | 'include' = 'exclude',
) {
  const archiveWhere = archived === 'only' ? 'archived_at IS NOT NULL' : archived === 'include' ? '1 = 1' : 'archived_at IS NULL';
  if (typeof limit === 'number' && Number.isInteger(limit) && limit > 0) {
    return db.prepare(`
      SELECT * FROM stage_attempts WHERE ${archiveWhere} ORDER BY updated_at DESC, created_at DESC LIMIT ?
    `).all(limit) as StageAttemptRow[];
  }
  return db.prepare(`
    SELECT * FROM stage_attempts WHERE ${archiveWhere} ORDER BY updated_at DESC, created_at DESC
  `).all() as StageAttemptRow[];
}

export function latestStageAttemptCloseoutPacketsByAttempt(db: DatabaseSync, stageAttemptIds: string[]) {
  const byAttempt = new Map<string, Record<string, unknown>>();
  if (stageAttemptIds.length === 0) {
    return byAttempt;
  }
  const rows = db.prepare(`
    SELECT stage_attempt_id, packet_json
    FROM stage_attempt_closeouts
    WHERE stage_attempt_id IN (${stageAttemptIds.map(() => '?').join(',')})
    ORDER BY stage_attempt_id ASC, created_at ASC, rowid ASC
  `).all(...stageAttemptIds) as Pick<StageAttemptCloseoutRow, 'stage_attempt_id' | 'packet_json'>[];
  for (const row of rows) {
    byAttempt.set(row.stage_attempt_id, parseStageAttemptCloseoutJsonObject(row.packet_json));
  }
  return byAttempt;
}

export function stageAttemptSignalsByAttempt(db: DatabaseSync, stageAttemptIds: string[]) {
  const byAttempt = new Map<string, ReturnType<typeof stageAttemptSignalToPayload>[]>();
  if (stageAttemptIds.length === 0) {
    return byAttempt;
  }
  const rows = db.prepare(`
    SELECT *
    FROM stage_attempt_signals
    WHERE stage_attempt_id IN (${stageAttemptIds.map(() => '?').join(',')})
    ORDER BY stage_attempt_id ASC, created_at ASC
  `).all(...stageAttemptIds) as StageAttemptSignalRow[];
  for (const row of rows) {
    const signals = byAttempt.get(row.stage_attempt_id) ?? [];
    signals.push(stageAttemptSignalToPayload(row));
    byAttempt.set(row.stage_attempt_id, signals);
  }
  return byAttempt;
}

export function listStageAttemptsForTask(db: DatabaseSync, taskId: string) {
  return (db.prepare(`
    SELECT * FROM stage_attempts WHERE task_id = ? ORDER BY updated_at DESC, created_at DESC
  `).all(taskId) as StageAttemptRow[]).map(stageAttemptToPayload);
}
export function listStageAttemptSignals(db: DatabaseSync, stageAttemptId: string) {
  return (db.prepare(`
    SELECT * FROM stage_attempt_signals WHERE stage_attempt_id = ? ORDER BY created_at ASC
  `).all(stageAttemptId) as StageAttemptSignalRow[]).map(stageAttemptSignalToPayload);
}

export function listStageAttemptCloseouts(db: DatabaseSync, stageAttemptId: string) {
  return (db.prepare(`
    SELECT * FROM stage_attempt_closeouts WHERE stage_attempt_id = ? ORDER BY created_at ASC, rowid ASC
  `).all(stageAttemptId) as StageAttemptCloseoutRow[]).map(stageAttemptCloseoutToPayload);
}
