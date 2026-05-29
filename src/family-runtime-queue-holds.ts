import type { DatabaseSync } from 'node:sqlite';

import type { FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import { stableId } from './family-runtime-ids.ts';
import { nowIso } from './family-runtime-store.ts';
import {
  normalizeTaskScopeForStorage,
  taskInputMatchesScope,
} from './family-runtime-task-scope.ts';

export type ActiveFamilyRuntimeQueueHold = {
  hold_id: string;
  scope: FamilyRuntimeTaskScope;
  reason: string;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type QueueHoldRow = {
  hold_id: string;
  scope_json: string;
  reason: string;
  source: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function rowToHold(row: QueueHoldRow): ActiveFamilyRuntimeQueueHold {
  return {
    hold_id: row.hold_id,
    scope: JSON.parse(row.scope_json) as FamilyRuntimeTaskScope,
    reason: row.reason,
    source: row.source,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function upsertFamilyRuntimeQueueHold(
  db: DatabaseSync,
  input: {
    taskScope: FamilyRuntimeTaskScope;
    reason: string;
    source: string;
  },
) {
  const scope = normalizeTaskScopeForStorage(input.taskScope);
  const scopeJson = JSON.stringify(scope);
  const now = nowIso();
  const holdId = stableId('queue_hold', [scope]);
  db.prepare(`
    INSERT INTO queue_holds(hold_id, scope_json, reason, source, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(hold_id) DO UPDATE SET
      scope_json = excluded.scope_json,
      reason = excluded.reason,
      source = excluded.source,
      status = 'active',
      updated_at = excluded.updated_at
  `).run(holdId, scopeJson, input.reason, input.source, now, now);
  return rowToHold(db.prepare('SELECT * FROM queue_holds WHERE hold_id = ?').get(holdId) as QueueHoldRow);
}

export function activeFamilyRuntimeQueueHolds(db: DatabaseSync) {
  return (db.prepare(`
    SELECT * FROM queue_holds WHERE status = 'active' ORDER BY updated_at DESC, created_at DESC
  `).all() as QueueHoldRow[]).map(rowToHold);
}

export function activeQueueHoldForTaskInput(
  db: DatabaseSync,
  input: {
    domainId: string;
    taskKind: string;
    payload: Record<string, unknown>;
  },
) {
  return activeFamilyRuntimeQueueHolds(db).find((hold) =>
    taskInputMatchesScope(input, hold.scope)
  ) ?? null;
}
