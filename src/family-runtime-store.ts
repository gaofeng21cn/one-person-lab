import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import { stableId } from './family-runtime-ids.ts';
import { masDomainRouteProjection } from './family-runtime-mas-domain-route.ts';
import { paperAutonomyProjection } from './family-runtime-paper-autonomy.ts';
import {
  deriveCurrentControlStateForTask,
  latestProviderActivityHeartbeat,
} from './family-runtime-current-control-state.ts';
import { createStageAttemptTable, listStageAttemptsForTask } from './family-runtime-stage-attempt-ledger.ts';
import { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import { resolveOplStatePaths } from './runtime-state-paths.ts';
import type { FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import { taskRowMatchesScope } from './family-runtime-task-scope.ts';

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

export function createFamilyRuntimeQueueTables(db: DatabaseSync) {
  db.exec(`
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
    CREATE TABLE IF NOT EXISTS queue_holds (
      hold_id TEXT PRIMARY KEY,
      scope_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority DESC, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
    CREATE INDEX IF NOT EXISTS idx_queue_holds_status ON queue_holds(status, updated_at);
  `);
  createStageAttemptTable(db);
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
  `);
  createFamilyRuntimeQueueTables(db);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function liveStageAttemptStatus(status: string | null) {
  return status === 'running' || status === 'checkpointed' || status === 'human_gate';
}

function taskLeaseCurrentness(
  row: FamilyRuntimeTaskRow,
  linkedHeartbeatAt: string | null,
) {
  const leaseExpiresAt = row.lease_expires_at;
  if (!leaseExpiresAt) {
    return 'missing';
  }
  const leaseExpires = parseTimestamp(leaseExpiresAt);
  if (leaseExpires === null) {
    return 'invalid';
  }
  if (leaseExpires > Date.now()) {
    return 'fresh';
  }
  const heartbeat = parseTimestamp(linkedHeartbeatAt);
  if (heartbeat !== null && heartbeat > leaseExpires) {
    return 'expired_but_provider_heartbeat_fresh';
  }
  return 'expired';
}

function queueTaskLinkedStageAttemptLiveness(db: DatabaseSync, row: FamilyRuntimeTaskRow) {
  if (row.status !== 'running') {
    return null;
  }
  const attempts = (listStageAttemptsForTask(db, row.task_id) as unknown[])
    .filter(isRecord);
  const currentAttempt = attempts.find((attempt) =>
    liveStageAttemptStatus(stringValue(attempt.status))
  ) ?? attempts[0];
  if (!currentAttempt) {
    return null;
  }
  const providerRun = isRecord(currentAttempt.provider_run)
    ? currentAttempt.provider_run
    : {};
  const activityEvents = Array.isArray(currentAttempt.activity_events)
    ? currentAttempt.activity_events
    : [];
  const providerRunWithHeartbeat = latestProviderActivityHeartbeat(activityEvents, providerRun);
  const lastHeartbeatAt = stringValue(providerRunWithHeartbeat.last_heartbeat_at);
  const stageAttemptStatus = stringValue(currentAttempt.status);
  const providerStatus = stringValue(providerRun.provider_status);
  const livenessStatus = liveStageAttemptStatus(stageAttemptStatus)
    ? (lastHeartbeatAt ? 'live' : 'live_missing_heartbeat')
    : 'not_live';
  return {
    surface_kind: 'opl_queue_task_linked_stage_attempt_liveness',
    projection_scope: 'queue_list',
    status: livenessStatus,
    stage_attempt_id: stringValue(currentAttempt.stage_attempt_id),
    workflow_id: stringValue(currentAttempt.workflow_id),
    stage_id: stringValue(currentAttempt.stage_id),
    provider_kind: stringValue(currentAttempt.provider_kind),
    executor_kind: stringValue(currentAttempt.executor_kind),
    stage_attempt_status: stageAttemptStatus,
    provider_status: providerStatus,
    last_heartbeat_at: lastHeartbeatAt,
    ledger_last_heartbeat_at: stringValue(providerRunWithHeartbeat.ledger_last_heartbeat_at),
    liveness_source: stringValue(providerRunWithHeartbeat.liveness_source),
    last_activity_heartbeat_kind: stringValue(providerRunWithHeartbeat.last_activity_heartbeat_kind),
    last_runner_event_kind: stringValue(providerRunWithHeartbeat.last_runner_event_kind),
    task_lease_expires_at: row.lease_expires_at,
    task_lease_currentness: taskLeaseCurrentness(row, lastHeartbeatAt),
    authority_boundary: {
      opl: 'queue_task_liveness_projection_only',
      queue_lease_role: 'worker_pickup_lease_not_live_attempt_truth',
      temporal_heartbeat_role: 'provider_attempt_liveness_observability',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
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

export type FamilyRuntimeTaskListFilter = {
  status?: string;
  taskScope?: FamilyRuntimeTaskScope;
};

function listTaskRows(db: DatabaseSync) {
  return db.prepare(`
    SELECT * FROM tasks ORDER BY priority DESC, created_at ASC
  `).all() as FamilyRuntimeTaskRow[];
}

function taskRowMatchesFilter(row: FamilyRuntimeTaskRow, filter?: FamilyRuntimeTaskListFilter) {
  if (filter?.status && row.status !== filter.status) {
    return false;
  }
  return taskRowMatchesScope(row, filter?.taskScope);
}

function filteredTaskRows(db: DatabaseSync, filter?: FamilyRuntimeTaskListFilter) {
  const rows = listTaskRows(db);
  if (!filter?.status && !filter?.taskScope) {
    return rows;
  }
  return rows.filter((row) => taskRowMatchesFilter(row, filter));
}

export function queueSummary(db: DatabaseSync, filter?: FamilyRuntimeTaskListFilter) {
  const rows = filteredTaskRows(db, filter);
  const byStatus = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {});
  return { total: rows.length, by_status: byStatus };
}

export function listTasks(db: DatabaseSync, filter?: FamilyRuntimeTaskListFilter) {
  return filteredTaskRows(db, filter).map((row) => {
    const payload = taskToPayload(row);
    const linkedStageAttemptLiveness = queueTaskLinkedStageAttemptLiveness(db, row);
    return linkedStageAttemptLiveness
      ? {
          ...payload,
          linked_stage_attempt_liveness: linkedStageAttemptLiveness,
        }
      : payload;
  });
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

export function inspectTaskWithStageAttemptProjections(
  db: DatabaseSync,
  taskId: string,
  stageAttempts: unknown[],
) {
  return {
    ...inspectTask(db, taskId),
    stage_attempts: stageAttempts,
    app_operator_drilldown_ref: '/runtime_tray_snapshot/app_operator_drilldown',
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
