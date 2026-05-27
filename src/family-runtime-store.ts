import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import { stableId } from './family-runtime-ids.ts';
import { masDomainRouteProjection } from './family-runtime-mas-domain-route.ts';
import { paperAutonomyProjection } from './family-runtime-paper-autonomy.ts';
import { deriveCurrentControlStateForTask } from './family-runtime-current-control-state.ts';
import { createStageAttemptTable, listStageAttemptsForTask } from './family-runtime-stage-attempt-ledger.ts';
import { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import { resolveOplStatePaths } from './runtime-state-paths.ts';

export { stableId } from './family-runtime-ids.ts';

export const QUEUE_SCHEMA_VERSION = 2;
export const DEFAULT_MAX_ATTEMPTS = 3;

export type FamilyRuntimeTaskStatus =
  | 'queued'
  | 'waiting_approval'
  | 'running'
  | 'succeeded'
  | 'retry_waiting'
  | 'blocked'
  | 'dead_letter'
  | 'denied';

export type FamilyRuntimeTaskRow = {
  task_id: string;
  domain_id: FamilyRuntimeDomainId;
  task_kind: string;
  payload_json: string;
  dedupe_key: string | null;
  priority: number;
  status: FamilyRuntimeTaskStatus;
  attempts: number;
  max_attempts: number;
  source: string;
  requires_approval: 0 | 1;
  approved_at: string | null;
  lease_owner: string | null;
  lease_expires_at: string | null;
  last_error: string | null;
  dead_letter_reason: string | null;
  created_at: string;
  updated_at: string;
};

type FamilyRuntimeEventRow = {
  event_id: string;
  task_id: string | null;
  domain_id: FamilyRuntimeDomainId | null;
  event_type: string;
  source: string;
  payload_json: string;
  created_at: string;
};

type FamilyRuntimeNotificationRow = {
  notification_id: string;
  task_id: string | null;
  severity: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  payload_json: string;
  created_at: string;
};

export function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function familyRuntimePaths() {
  const stateDir = resolveOplStatePaths().state_dir;
  const root = path.join(stateDir, 'family-runtime');
  return {
    state_dir: stateDir,
    root,
    queue_db: path.join(root, 'queue.sqlite'),
    dispatch_dir: path.join(root, 'dispatch'),
    proof_dir: path.join(root, 'proofs'),
    scheduler_dir: path.join(root, 'scheduler'),
    latest_temporal_production_proof: path.join(root, 'proofs', 'latest-temporal-production-proof.json'),
  };
}

export function openQueueDb() {
  const paths = familyRuntimePaths();
  fs.mkdirSync(paths.root, { recursive: true });
  fs.mkdirSync(paths.dispatch_dir, { recursive: true });
  fs.mkdirSync(paths.proof_dir, { recursive: true });
  fs.mkdirSync(paths.scheduler_dir, { recursive: true });
  const db = openFamilyRuntimeSqlite(paths.queue_db);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tasks (
      task_id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      task_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      dedupe_key TEXT UNIQUE,
      priority INTEGER NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      max_attempts INTEGER NOT NULL,
      source TEXT NOT NULL,
      requires_approval INTEGER NOT NULL,
      approved_at TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
      last_error TEXT,
      dead_letter_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      event_id TEXT PRIMARY KEY,
      task_id TEXT,
      domain_id TEXT,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      notification_id TEXT PRIMARY KEY,
      task_id TEXT,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
  `);
  createStageAttemptTable(db);
  db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run(
    'schema_version',
    String(QUEUE_SCHEMA_VERSION),
  );
  return { db, paths };
}

export function taskToPayload(row: FamilyRuntimeTaskRow) {
  const payload = JSON.parse(row.payload_json);
  return {
    task_id: row.task_id,
    domain_id: row.domain_id,
    task_kind: row.task_kind,
    payload,
    domain_route: masDomainRouteProjection(row, payload),
    paper_autonomy: paperAutonomyProjection(row, payload),
    dedupe_key: row.dedupe_key,
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    max_attempts: row.max_attempts,
    source: row.source,
    requires_approval: Boolean(row.requires_approval),
    approved_at: row.approved_at,
    lease: row.lease_owner
      ? {
          lease_owner: row.lease_owner,
          lease_expires_at: row.lease_expires_at,
        }
      : null,
    last_error: row.last_error,
    dead_letter_reason: row.dead_letter_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function eventToPayload(row: FamilyRuntimeEventRow) {
  return {
    event_id: row.event_id,
    task_id: row.task_id,
    domain_id: row.domain_id,
    event_type: row.event_type,
    source: row.source,
    payload: JSON.parse(row.payload_json),
    created_at: row.created_at,
  };
}

function notificationToPayload(row: FamilyRuntimeNotificationRow) {
  return {
    notification_id: row.notification_id,
    task_id: row.task_id,
    severity: row.severity,
    title: row.title,
    body: row.body,
    channel: row.channel,
    status: row.status,
    payload: JSON.parse(row.payload_json),
    created_at: row.created_at,
  };
}

export function insertEvent(
  db: DatabaseSync,
  input: {
    taskId?: string | null;
    domainId?: FamilyRuntimeDomainId | null;
    eventType: string;
    source: string;
    payload?: Record<string, unknown>;
  },
) {
  const createdAt = nowIso();
  const event = {
    event_id: randomId('evt'),
    task_id: input.taskId ?? null,
    domain_id: input.domainId ?? null,
    event_type: input.eventType,
    source: input.source,
    payload_json: JSON.stringify(input.payload ?? {}),
    created_at: createdAt,
  };
  db.prepare(`
    INSERT INTO events(event_id, task_id, domain_id, event_type, source, payload_json, created_at)
    VALUES (@event_id, @task_id, @domain_id, @event_type, @source, @payload_json, @created_at)
  `).run(event);
  return eventToPayload(event as FamilyRuntimeEventRow);
}

export function insertNotification(
  db: DatabaseSync,
  input: {
    taskId?: string | null;
    severity: 'info' | 'warning' | 'error';
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  },
) {
  const createdAt = nowIso();
  const notification = {
    notification_id: randomId('ntf'),
    task_id: input.taskId ?? null,
    severity: input.severity,
    title: input.title,
    body: input.body,
    channel: 'local_inbox',
    status: 'written',
    payload_json: JSON.stringify(input.payload ?? {}),
    created_at: createdAt,
  };
  db.prepare(`
    INSERT INTO notifications(notification_id, task_id, severity, title, body, channel, status, payload_json, created_at)
    VALUES (@notification_id, @task_id, @severity, @title, @body, @channel, @status, @payload_json, @created_at)
  `).run(notification);
  return notificationToPayload(notification as FamilyRuntimeNotificationRow);
}

export function queueSummary(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count FROM tasks GROUP BY status ORDER BY status
  `).all() as Array<{ status: FamilyRuntimeTaskStatus; count: number }>;
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.count]));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return { total, by_status: byStatus };
}

export function listTasks(db: DatabaseSync) {
  return (db.prepare(`
    SELECT * FROM tasks ORDER BY priority DESC, created_at ASC
  `).all() as FamilyRuntimeTaskRow[]).map(taskToPayload);
}

export function inspectTask(db: DatabaseSync, taskId: string) {
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow | undefined;
  if (!task) {
    throw new FrameworkContractError('cli_usage_error', 'Family runtime task not found.', {
      task_id: taskId,
    });
  }
  const events = (db.prepare(`
    SELECT * FROM events WHERE task_id = ? ORDER BY created_at ASC
  `).all(taskId) as FamilyRuntimeEventRow[]).map(eventToPayload);
  const notifications = (db.prepare(`
    SELECT * FROM notifications WHERE task_id = ? ORDER BY created_at ASC
  `).all(taskId) as FamilyRuntimeNotificationRow[]).map(notificationToPayload);
  return {
    task: {
      ...taskToPayload(task),
      current_control_state: deriveCurrentControlStateForTask(db, taskId),
    },
    stage_attempts: listStageAttemptsForTask(db, taskId),
    events,
    notifications,
  };
}

export function listEvents(db: DatabaseSync) {
  return (db.prepare(`
    SELECT * FROM events ORDER BY created_at ASC
  `).all() as FamilyRuntimeEventRow[]).map(eventToPayload);
}

export function listNotifications(db: DatabaseSync) {
  return (db.prepare(`
    SELECT * FROM notifications ORDER BY created_at ASC
  `).all() as FamilyRuntimeNotificationRow[]).map(notificationToPayload);
}
