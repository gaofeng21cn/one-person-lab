import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { parseJsonText } from '../../kernel/json-file.ts';
import { resolveOplStatePaths } from '../../kernel/runtime-state-paths.ts';

type EntityKind = 'project' | 'task';
type CloudMutationInput = {
  operationId: string;
  workspaceId: string;
  entityKind: EntityKind;
  localId: string;
  projectId?: string;
  taskId?: string;
  baseVersion: number;
  operation: 'append' | 'replace';
  payload: Record<string, unknown>;
  contentDigest?: string;
};
type OutboxRow = {
  operation_id: string;
  idempotency_key: string;
  workspace_id: string;
  entity_kind: EntityKind;
  local_id: string;
  project_id: string;
  task_id: string;
  base_version: number;
  operation: 'append' | 'replace';
  payload_json: string;
  content_digest: string;
  status: string;
  created_at: string;
  updated_at: string;
};
export type CloudMutation = Omit<OutboxRow, 'payload_json'> & {
  payload: Record<string, unknown>;
};
type PushOptions = {
  origin: string;
  workspaceId: string;
  organizationId: string;
  clientId: string;
  sessionCookie: string;
  csrfToken: string;
  fetchImpl?: typeof fetch;
};
type PullOptions = {
  origin: string;
  workspaceId: string;
  sessionCookie: string;
  limit?: number;
  fetchImpl?: typeof fetch;
  applyChange?: (change: Record<string, unknown>) => void | Promise<void>;
};

function openDb() {
  const databasePath = resolveOplStatePaths().cloud_sync_db;
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS outbox (
      operation_id TEXT PRIMARY KEY, idempotency_key TEXT UNIQUE NOT NULL,
      workspace_id TEXT NOT NULL, entity_kind TEXT NOT NULL, local_id TEXT NOT NULL,
      project_id TEXT NOT NULL, task_id TEXT NOT NULL, base_version INTEGER NOT NULL,
      operation TEXT NOT NULL, payload_json TEXT NOT NULL, content_digest TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS aliases (
      workspace_id TEXT NOT NULL, local_id TEXT NOT NULL, canonical_id TEXT NOT NULL,
      entity_kind TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(workspace_id, entity_kind, local_id)
    );
    CREATE TABLE IF NOT EXISTS cursors (
      workspace_id TEXT PRIMARY KEY, cursor INTEGER NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS conflicts (
      conflict_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, event_json TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inbox (
      event_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, cursor INTEGER NOT NULL,
      event_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(workspace_id, cursor)
    );
  `);
  return db;
}

const scalarMetadataFields = new Set(['title', 'description', 'status', 'updatedAt']);
const listMetadataFields = new Set(['labels', 'artifactRefs', 'receiptRefs', 'continuationRefs']);

function normalizeMetadataPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('cloud sync payload requires a metadata object');
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (scalarMetadataFields.has(key) && (typeof fieldValue === 'string' || fieldValue === null)) {
      normalized[key] = fieldValue;
      continue;
    }
    if (
      listMetadataFields.has(key) &&
      (fieldValue === null || (Array.isArray(fieldValue) && fieldValue.every((item) => typeof item === 'string')))
    ) {
      normalized[key] = fieldValue;
      continue;
    }
    throw new Error(`unsupported metadata field: ${key}`);
  }
  return normalized;
}

function normalizeCloudEvent(event: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const key of [
    'id', 'operationId', 'workspaceId', 'entityKind', 'projectId', 'taskId', 'clientId',
    'actorUserId', 'operation', 'status', 'contentDigest', 'idempotencyKey', 'requestHash',
    'conflictId', 'occurredAt',
  ]) {
    if (typeof event[key] === 'string') normalized[key] = event[key];
  }
  for (const key of ['cursor', 'baseVersion', 'serverVersion']) {
    if (typeof event[key] === 'number') normalized[key] = event[key];
  }
  if (event.payload !== undefined) {
    if (event.status === 'conflict') {
      const payload = event.payload as Record<string, unknown>;
      normalized.payload = {
        current: normalizeMetadataPayload(payload?.current),
        incoming: normalizeMetadataPayload(payload?.incoming),
      };
    } else {
      normalized.payload = normalizeMetadataPayload(event.payload);
    }
  }
  return normalized;
}

function mutationFromRow(row: OutboxRow): CloudMutation {
  const { payload_json, ...fields } = row;
  return { ...fields, payload: parseJsonText(payload_json) as Record<string, unknown> };
}

export function queueCloudMutation(input: CloudMutationInput): CloudMutation {
  const payloadJson = JSON.stringify(normalizeMetadataPayload(input.payload));
  const db = openDb();
  try {
    const operationId = input.operationId.trim();
    if (!operationId) throw new Error('cloud sync queue requires operationId');
    const idempotencyKey = operationId;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO outbox (
        operation_id, idempotency_key, workspace_id, entity_kind, local_id,
        project_id, task_id, base_version, operation, payload_json,
        content_digest, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(
      operationId, idempotencyKey, input.workspaceId, input.entityKind, input.localId,
      input.projectId ?? '', input.taskId ?? '', input.baseVersion, input.operation,
      payloadJson, input.contentDigest ?? '', now, now,
    );
    const stored = db.prepare('SELECT * FROM outbox WHERE operation_id = ?').get(operationId) as OutboxRow;
    if (
      stored.workspace_id !== input.workspaceId || stored.entity_kind !== input.entityKind ||
      stored.local_id !== input.localId || stored.project_id !== (input.projectId ?? '') ||
      stored.task_id !== (input.taskId ?? '') || stored.base_version !== input.baseVersion ||
      stored.operation !== input.operation || stored.payload_json !== payloadJson ||
      stored.content_digest !== (input.contentDigest ?? '')
    ) {
      throw new Error(`operation identity already bound with different content: ${operationId}`);
    }
    return mutationFromRow(stored);
  } finally {
    db.close();
  }
}

export function listPendingCloudMutations(workspaceId: string): CloudMutation[] {
  const db = openDb();
  try {
    return (db.prepare(
      "SELECT * FROM outbox WHERE workspace_id = ? AND status = 'pending' ORDER BY rowid",
    ).all(workspaceId) as OutboxRow[]).map(mutationFromRow);
  } finally {
    db.close();
  }
}

function markApplied(operationId: string) {
  const db = openDb();
  try {
    db.prepare("UPDATE outbox SET status = 'applied', updated_at = ? WHERE operation_id = ?")
      .run(new Date().toISOString(), operationId);
  } finally {
    db.close();
  }
}

export function saveCanonicalAlias(
  workspaceId: string,
  localId: string,
  canonicalId: string,
  entityKind: EntityKind,
) {
  const db = openDb();
  try {
    db.prepare(
      'INSERT OR IGNORE INTO aliases(workspace_id, local_id, canonical_id, entity_kind, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(workspaceId, localId, canonicalId, entityKind, new Date().toISOString());
    const alias = db.prepare(
      'SELECT canonical_id FROM aliases WHERE workspace_id = ? AND entity_kind = ? AND local_id = ?',
    ).get(workspaceId, entityKind, localId) as { canonical_id: string };
    if (alias.canonical_id !== canonicalId) {
      throw new Error(`canonical alias already bound for ${workspaceId}/${entityKind}/${localId}`);
    }
  } finally {
    db.close();
  }
}

export function resolveCanonicalAlias(workspaceId: string, localId: string, entityKind: EntityKind): string | null {
  const db = openDb();
  try {
    const row = db.prepare(
      'SELECT canonical_id FROM aliases WHERE workspace_id = ? AND entity_kind = ? AND local_id = ?',
    ).get(workspaceId, entityKind, localId) as
      | { canonical_id: string }
      | undefined;
    return row?.canonical_id ?? null;
  } finally {
    db.close();
  }
}

export function readCloudCursor(workspaceId: string): number {
  const db = openDb();
  try {
    const row = db.prepare('SELECT cursor FROM cursors WHERE workspace_id = ?').get(workspaceId) as
      | { cursor: number }
      | undefined;
    return row?.cursor ?? 0;
  } finally {
    db.close();
  }
}

export function saveCloudCursor(workspaceId: string, cursor: number) {
  const db = openDb();
  try {
    db.prepare(`
      INSERT INTO cursors(workspace_id, cursor, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET cursor = excluded.cursor, updated_at = excluded.updated_at
      WHERE excluded.cursor > cursors.cursor
    `).run(workspaceId, cursor, new Date().toISOString());
  } finally {
    db.close();
  }
}

function saveConflict(workspaceId: string, event: Record<string, unknown>) {
  const conflictId = typeof event.conflictId === 'string' ? event.conflictId : '';
  if (!conflictId) throw new Error('cloud conflict requires conflictId');
  const eventJson = JSON.stringify(normalizeCloudEvent(event));
  const db = openDb();
  try {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO conflicts(conflict_id, workspace_id, event_json, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(conflictId, workspaceId, eventJson, String(event.status ?? 'conflict'), now, now);
    const stored = db.prepare('SELECT workspace_id, event_json FROM conflicts WHERE conflict_id = ?')
      .get(conflictId) as { workspace_id: string; event_json: string };
    if (stored.workspace_id !== workspaceId || stored.event_json !== eventJson) {
      throw new Error(`cloud conflict already stored with different content: ${conflictId}`);
    }
  } finally {
    db.close();
  }
}

export function listCloudConflicts(workspaceId: string): Record<string, unknown>[] {
  const db = openDb();
  try {
    return (db.prepare(
      'SELECT event_json FROM conflicts WHERE workspace_id = ? ORDER BY created_at, conflict_id',
    ).all(workspaceId) as Array<{ event_json: string }>).map(
      ({ event_json }) => parseJsonText(event_json) as Record<string, unknown>,
    );
  } finally {
    db.close();
  }
}

export function saveCloudChange(workspaceId: string, event: Record<string, unknown>) {
  const eventId = typeof event.id === 'string' ? event.id : '';
  const cursor = typeof event.cursor === 'number' ? event.cursor : 0;
  if (!eventId || cursor < 1) throw new Error('cloud change requires id and cursor');
  const eventJson = JSON.stringify(normalizeCloudEvent(event));
  const db = openDb();
  try {
    db.prepare(
      'INSERT OR IGNORE INTO inbox(event_id, workspace_id, cursor, event_json, created_at) VALUES (?, ?, ?, ?, ?)',
    ).run(eventId, workspaceId, cursor, eventJson, new Date().toISOString());
    const stored = db.prepare('SELECT workspace_id, cursor, event_json FROM inbox WHERE event_id = ?')
      .get(eventId) as { workspace_id: string; cursor: number; event_json: string } | undefined;
    if (!stored) throw new Error(`cloud change cursor already bound: ${workspaceId}/${cursor}`);
    if (stored.workspace_id !== workspaceId || stored.cursor !== cursor || stored.event_json !== eventJson) {
      throw new Error(`cloud change already stored with different content: ${eventId}`);
    }
  } finally {
    db.close();
  }
}

export function listCloudChanges(workspaceId: string): Record<string, unknown>[] {
  const db = openDb();
  try {
    return (db.prepare('SELECT event_json FROM inbox WHERE workspace_id = ? ORDER BY cursor')
      .all(workspaceId) as Array<{ event_json: string }>).map(
      ({ event_json }) => parseJsonText(event_json) as Record<string, unknown>,
    );
  } finally {
    db.close();
  }
}

export async function pushCloudOutbox(options: PushOptions) {
  let applied = 0;
  let conflicts = 0;
  for (const mutation of listPendingCloudMutations(options.workspaceId)) {
    const alias = resolveCanonicalAlias(options.workspaceId, mutation.local_id, mutation.entity_kind);
    const projectId = mutation.project_id || (mutation.entity_kind === 'project' ? alias : '');
    const taskId = mutation.task_id || (mutation.entity_kind === 'task' ? alias : '');
    if (!projectId || (mutation.entity_kind === 'task' && !taskId)) break;
    let response: Response;
    try {
      response = await (options.fetchImpl ?? fetch)(
        new URL(`/api/workspaces/${encodeURIComponent(options.workspaceId)}/sync/mutations`, options.origin),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json', cookie: options.sessionCookie,
            'x-opl-csrf': options.csrfToken, 'Idempotency-Key': mutation.idempotency_key,
          },
          body: JSON.stringify({
            operationId: mutation.operation_id, organizationId: options.organizationId,
            entityKind: mutation.entity_kind, projectId, taskId, clientId: options.clientId,
            baseVersion: mutation.base_version, operation: mutation.operation,
            payload: mutation.payload, contentDigest: mutation.content_digest,
            occurredAt: mutation.created_at,
          }),
        },
      );
    } catch {
      break;
    }
    if (response.status === 503) break;
    const body = (await response.json()) as Record<string, unknown>;
    if (response.status === 409) {
      if (typeof body.conflictId === 'string' && body.conflictId) {
        saveConflict(options.workspaceId, body);
        conflicts += 1;
        break;
      }
      throw new Error(`cloud sync push conflict: ${typeof body.error === 'string' ? body.error : 'unknown'}`);
    }
    if (!response.ok) throw new Error(`cloud sync push failed: ${response.status}`);
    const returnedId = mutation.entity_kind === 'project' ? body.projectId : body.taskId;
    if (typeof returnedId !== 'string' || !returnedId) {
      throw new Error('cloud sync response missing canonical id');
    }
    saveCanonicalAlias(options.workspaceId, mutation.local_id, returnedId, mutation.entity_kind);
    markApplied(mutation.operation_id);
    applied += 1;
  }
  return { applied, conflicts, pending: listPendingCloudMutations(options.workspaceId).length };
}

export async function pullCloudChanges(options: PullOptions) {
  const currentCursor = readCloudCursor(options.workspaceId);
  const url = new URL(
    `/api/workspaces/${encodeURIComponent(options.workspaceId)}/sync/changes`,
    options.origin,
  );
  url.searchParams.set('after', String(currentCursor));
  url.searchParams.set('limit', String(options.limit ?? 50));
  const response = await (options.fetchImpl ?? fetch)(url, { headers: { cookie: options.sessionCookie } });
  if (!response.ok) throw new Error(`cloud sync pull failed: ${response.status}`);
  const page = (await response.json()) as Record<string, unknown>;
  if (
    !Array.isArray(page.changes) || !Number.isSafeInteger(page.nextCursor) ||
    Number(page.nextCursor) < currentCursor
  ) {
    throw new Error('cloud sync response has invalid change page');
  }
  const nextCursor = Number(page.nextCursor);
  const changes = [...page.changes].sort(
    (left, right) => Number((left as Record<string, unknown>).cursor) - Number((right as Record<string, unknown>).cursor),
  ) as Array<Record<string, unknown>>;
  let previousCursor = currentCursor;
  for (const change of changes) {
    if (
      typeof change.id !== 'string' || !change.id || !Number.isSafeInteger(change.cursor) ||
      Number(change.cursor) <= previousCursor || Number(change.cursor) > nextCursor
    ) {
      throw new Error('cloud sync response has invalid change identity');
    }
    if (change.status !== 'conflict' && change.status !== 'accepted' && change.status !== 'resolved') {
      throw new Error(`invalid cloud change status: ${String(change.status)}`);
    }
    previousCursor = Number(change.cursor);
  }
  let applied = 0;
  let conflicts = 0;
  for (const change of changes) {
    if (change.status === 'conflict') {
      saveConflict(options.workspaceId, change);
      conflicts += 1;
    } else {
      saveCloudChange(options.workspaceId, change);
      await options.applyChange?.(change);
      applied += 1;
    }
  }
  saveCloudCursor(options.workspaceId, nextCursor);
  return { applied, conflicts, cursor: nextCursor, hasMore: page.hasMore === true };
}

export function importCloudContinuation(input: {
  workspaceId: string;
  localProjectId: string;
  localTaskId: string;
  continuation: Record<string, unknown>;
}) {
  if (
    resolveCanonicalAlias(input.workspaceId, input.localProjectId, 'project') !== input.continuation.projectId ||
    resolveCanonicalAlias(input.workspaceId, input.localTaskId, 'task') !== input.continuation.taskId
  ) {
    throw new Error('continuation project/task identity mismatch');
  }
  const refs = Object.fromEntries(
    ['continuationId', 'receiptId', 'projectId', 'taskId'].map((field) => {
      const value = input.continuation[field];
      if (typeof value !== 'string' || !value) throw new Error(`cloud continuation missing ${field}`);
      return [field, value];
    }),
  );
  if (
    path.basename(input.localTaskId) !== input.localTaskId ||
    input.localTaskId === '.' || input.localTaskId === '..'
  ) {
    throw new Error('invalid local task id');
  }
  const taskStateDir = resolveOplStatePaths().task_state_dir;
  const taskDir = path.join(taskStateDir, input.localTaskId);
  fs.mkdirSync(taskStateDir, { recursive: true });
  if (fs.existsSync(taskDir) && fs.lstatSync(taskDir).isSymbolicLink()) {
    throw new Error('cloud continuation task directory cannot be a symlink');
  }
  fs.mkdirSync(taskDir, { recursive: true });
  const realStateDir = fs.realpathSync(taskStateDir);
  const realTaskDir = fs.realpathSync(taskDir);
  if (path.dirname(realTaskDir) !== realStateDir) throw new Error('cloud continuation task path escapes state');
  const target = path.join(realTaskDir, 'cloud-continuation.json');
  const temporary = `${target}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(refs, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  return refs;
}
