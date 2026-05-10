import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

import { GatewayContractError } from './contracts.ts';
import {
  DOMAIN_ADAPTERS,
  parseFamilyRuntimeCommand,
  type EnqueueInput,
  type FamilyRuntimeDomainId,
} from './family-runtime-command.ts';
import { ensureHermesBridge, inspectHermesBridge } from './family-runtime-hermes-bridge.ts';
import { resolveOplStatePaths } from './runtime-state-paths.ts';

const QUEUE_SCHEMA_VERSION = 1;
const DEFAULT_MAX_ATTEMPTS = 3;

type FamilyRuntimeTaskStatus =
  | 'queued'
  | 'waiting_approval'
  | 'running'
  | 'succeeded'
  | 'retry_waiting'
  | 'blocked'
  | 'dead_letter'
  | 'denied';

type FamilyRuntimeTaskRow = {
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

function nowIso() {
  return new Date().toISOString();
}

function stableId(prefix: string, parts: unknown[]) {
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex')
    .slice(0, 24);
  return `${prefix}_${digest}`;
}

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function familyRuntimePaths() {
  const stateDir = resolveOplStatePaths().state_dir;
  const root = path.join(stateDir, 'family-runtime');
  return {
    state_dir: stateDir,
    root,
    queue_db: path.join(root, 'queue.sqlite'),
    dispatch_dir: path.join(root, 'dispatch'),
  };
}

function openQueueDb() {
  const paths = familyRuntimePaths();
  fs.mkdirSync(paths.root, { recursive: true });
  fs.mkdirSync(paths.dispatch_dir, { recursive: true });
  const db = new DatabaseSync(paths.queue_db);
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
  db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run(
    'schema_version',
    String(QUEUE_SCHEMA_VERSION),
  );
  return { db, paths };
}

function taskToPayload(row: FamilyRuntimeTaskRow) {
  return {
    task_id: row.task_id,
    domain_id: row.domain_id,
    task_kind: row.task_kind,
    payload: JSON.parse(row.payload_json),
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

function insertEvent(
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

function insertNotification(
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

function queueSummary(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count FROM tasks GROUP BY status ORDER BY status
  `).all() as Array<{ status: FamilyRuntimeTaskStatus; count: number }>;
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.count]));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return { total, by_status: byStatus };
}

function buildStatusPayload(db: DatabaseSync, paths = familyRuntimePaths()) {
  const bridge = inspectHermesBridge();
  const fullOnlineReady =
    bridge.disabled === false
    && bridge.gateway_ready
    && bridge.cron_registered
    && bridge.webhook_registered;

  return {
    version: 'g2',
    family_runtime: {
      surface_id: 'opl_family_runtime',
      hermes_runtime_provider: 'required_for_online_family_runtime',
      state: {
        state_dir: paths.state_dir,
        runtime_dir: paths.root,
        queue_db: paths.queue_db,
        queue_schema_version: QUEUE_SCHEMA_VERSION,
      },
      readiness: {
        full_online_ready: fullOnlineReady,
        degraded: !fullOnlineReady,
        degraded_reason: fullOnlineReady
          ? null
          : bridge.disabled
            ? 'hermes_online_disabled_for_development_or_offline_diagnostics'
            : 'hermes_gateway_cron_or_webhook_not_ready',
      },
      substrate_owner: {
        hermes: [
          'gateway_residency',
          'cron_wakeup',
          'webhook_intake',
          'session_store',
          'delivery_transport',
          'approval_transport',
          'memory_profile_isolation',
        ],
      },
      opl_owner: {
        queue: 'typed_family_queue',
        dispatch: 'domain_adapter_dispatch',
        notification_policy: 'all_delivery_events_are_written_to_local_inbox_first',
        forbidden_authority: [
          'domain_truth',
          'domain_quality_verdict',
          'domain_artifact_or_publication_gate',
        ],
      },
      domain_adapters: DOMAIN_ADAPTERS,
      queue: queueSummary(db),
      hermes_bridge: bridge,
    },
  };
}

function enqueueTask(db: DatabaseSync, input: EnqueueInput) {
  const createdAt = nowIso();
  const dedupeKey = input.dedupeKey?.trim() || null;
  if (dedupeKey) {
    const existing = db.prepare('SELECT * FROM tasks WHERE dedupe_key = ?').get(dedupeKey) as
      | FamilyRuntimeTaskRow
      | undefined;
    if (existing) {
      insertEvent(db, {
        taskId: existing.task_id,
        domainId: existing.domain_id,
        eventType: 'dedupe_noop',
        source: input.source ?? 'opl-cli',
        payload: { dedupe_key: dedupeKey },
      });
      return {
        accepted: false,
        idempotent_noop: true,
        task: taskToPayload(existing),
      };
    }
  }

  const taskId = stableId('frt', [
    input.domainId,
    input.taskKind,
    dedupeKey,
    input.payload,
    createdAt,
  ]);
  const status: FamilyRuntimeTaskStatus = input.requiresApproval ? 'waiting_approval' : 'queued';
  const task = {
    task_id: taskId,
    domain_id: input.domainId,
    task_kind: input.taskKind,
    payload_json: JSON.stringify(input.payload),
    dedupe_key: dedupeKey,
    priority: input.priority ?? 0,
    status,
    attempts: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    source: input.source ?? 'opl-cli',
    requires_approval: input.requiresApproval ? 1 : 0,
    approved_at: null,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    dead_letter_reason: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status, attempts, max_attempts,
      source, requires_approval, approved_at, lease_owner, lease_expires_at, last_error, dead_letter_reason,
      created_at, updated_at
    )
    VALUES (
      @task_id, @domain_id, @task_kind, @payload_json, @dedupe_key, @priority, @status, @attempts, @max_attempts,
      @source, @requires_approval, @approved_at, @lease_owner, @lease_expires_at, @last_error, @dead_letter_reason,
      @created_at, @updated_at
    )
  `).run(task);
  insertEvent(db, {
    taskId,
    domainId: input.domainId,
    eventType: status === 'waiting_approval' ? 'task_waiting_approval' : 'task_enqueued',
    source: input.source ?? 'opl-cli',
    payload: { task_kind: input.taskKind, dedupe_key: dedupeKey },
  });
  insertNotification(db, {
    taskId,
    severity: 'info',
    title: status === 'waiting_approval' ? 'Family runtime task waiting for approval' : 'Family runtime task queued',
    body: `${input.domainId}:${input.taskKind}`,
    payload: { status },
  });
  return {
    accepted: true,
    idempotent_noop: false,
    task: taskToPayload(task as FamilyRuntimeTaskRow),
  };
}

function writeDispatchTask(paths: ReturnType<typeof familyRuntimePaths>, row: FamilyRuntimeTaskRow) {
  const dispatchPath = path.join(paths.dispatch_dir, `${row.task_id}.json`);
  fs.writeFileSync(
    dispatchPath,
    JSON.stringify({
      task_id: row.task_id,
      domain_id: row.domain_id,
      task_kind: row.task_kind,
      payload: JSON.parse(row.payload_json),
      attempts: row.attempts,
      source: 'opl_family_runtime',
      authority_boundary: {
        hermes: 'online_runtime_substrate_only',
        opl: 'typed_queue_and_dispatch_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    }, null, 2),
    'utf8',
  );
  return dispatchPath;
}

function commandForDomain(domainId: FamilyRuntimeDomainId, taskPath: string) {
  const override = process.env[`OPL_FAMILY_RUNTIME_${domainId.toUpperCase()}_DISPATCH`]?.trim();
  if (override) {
    return [...override.split(/\s+/), taskPath];
  }

  return [...DOMAIN_ADAPTERS[domainId].dispatch_command, '--task', taskPath, '--format', 'json'];
}

function parseDispatchOutput(stdout: string) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return {};
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { raw_stdout: trimmed };
  }
}

function dispatchTask(db: DatabaseSync, paths: ReturnType<typeof familyRuntimePaths>, row: FamilyRuntimeTaskRow) {
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  if (payload.domain_truth_write === true || payload.artifact_gate_override === true) {
    const updatedAt = nowIso();
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked', last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ?
    `).run(
      'Domain truth or artifact gate writes are forbidden through the OPL family runtime queue.',
      'domain_forbidden_write',
      updatedAt,
      row.task_id,
    );
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_blocked_domain_forbidden_write',
      source: 'opl-family-runtime',
      payload,
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'error',
      title: 'Family runtime task blocked',
      body: 'OPL queue cannot write domain truth, quality verdicts, or artifact gates.',
      payload: { reason: 'domain_forbidden_write' },
    });
    return { task_id: row.task_id, status: 'blocked', reason: 'domain_forbidden_write' };
  }

  const leaseOwner = `opl-family-runtime:${process.pid}`;
  const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const attempt = row.attempts + 1;
  const runningAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = 'running', attempts = ?, lease_owner = ?, lease_expires_at = ?, updated_at = ?
    WHERE task_id = ? AND status IN ('queued', 'retry_waiting')
  `).run(attempt, leaseOwner, leaseExpiresAt, runningAt, row.task_id);
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_dispatch_started',
    source: 'opl-family-runtime',
    payload: { attempt, lease_owner: leaseOwner, lease_expires_at: leaseExpiresAt },
  });

  const dispatchPath = writeDispatchTask(paths, { ...row, attempts: attempt });
  const command = commandForDomain(row.domain_id, dispatchPath);
  const result = spawnSync(command[0], command.slice(1), {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const exitCode = result.status ?? (result.error ? 127 : 1);
  const output = parseDispatchOutput(stdout);
  const succeeded = exitCode === 0 && output.forbidden_domain_truth_write !== true;

  if (succeeded) {
    const completedAt = nowIso();
    db.prepare(`
      UPDATE tasks
      SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = ?
      WHERE task_id = ?
    `).run(completedAt, row.task_id);
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_dispatch_succeeded',
      source: 'opl-family-runtime',
      payload: { command_preview: command, output },
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'info',
      title: 'Family runtime task dispatched',
      body: `${row.domain_id}:${row.task_kind}`,
      payload: { output },
    });
    return { task_id: row.task_id, status: 'succeeded', command_preview: command, output };
  }

  const errorMessage = result.error?.message || stderr || stdout || `Domain dispatch exited ${exitCode}.`;
  const nextStatus: FamilyRuntimeTaskStatus = attempt >= row.max_attempts ? 'dead_letter' : 'retry_waiting';
  const failedAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = ?, lease_owner = NULL, lease_expires_at = NULL, last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(
    nextStatus,
    errorMessage,
    nextStatus === 'dead_letter' ? 'retry_budget_exhausted' : null,
    failedAt,
    row.task_id,
  );
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: nextStatus === 'dead_letter' ? 'task_dead_lettered' : 'task_dispatch_retry_queued',
    source: 'opl-family-runtime',
    payload: { command_preview: command, exit_code: exitCode, stderr, stdout },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: nextStatus === 'dead_letter' ? 'error' : 'warning',
    title: nextStatus === 'dead_letter' ? 'Family runtime task dead-lettered' : 'Family runtime task queued for retry',
    body: errorMessage,
    payload: { attempt, max_attempts: row.max_attempts },
  });
  return {
    task_id: row.task_id,
    status: nextStatus,
    command_preview: command,
    exit_code: exitCode,
    error: errorMessage,
  };
}

function runTick(db: DatabaseSync, paths: ReturnType<typeof familyRuntimePaths>, source: string, limit: number) {
  const rows = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('queued', 'retry_waiting')
    ORDER BY priority DESC, created_at ASC
    LIMIT ?
  `).all(limit) as FamilyRuntimeTaskRow[];
  insertEvent(db, {
    eventType: 'tick_started',
    source,
    payload: { limit, selected_count: rows.length },
  });
  const dispatches = rows.map((row) => dispatchTask(db, paths, row));
  insertEvent(db, {
    eventType: 'tick_completed',
    source,
    payload: { dispatches_count: dispatches.length },
  });
  return {
    source,
    selected_count: rows.length,
    dispatches,
  };
}

function approveTask(
  db: DatabaseSync,
  input: { taskId: string; decision: 'approve' | 'deny'; reason?: string },
) {
  const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.taskId) as
    | FamilyRuntimeTaskRow
    | undefined;
  if (!row) {
    throw new GatewayContractError('cli_usage_error', 'Family runtime task not found.', {
      task_id: input.taskId,
    });
  }
  const updatedAt = nowIso();
  const status: FamilyRuntimeTaskStatus = input.decision === 'approve' ? 'queued' : 'denied';
  db.prepare(`
    UPDATE tasks
    SET status = ?, approved_at = ?, last_error = ?, updated_at = ?
    WHERE task_id = ?
  `).run(
    status,
    input.decision === 'approve' ? updatedAt : null,
    input.decision === 'deny' ? input.reason ?? 'approval_denied' : null,
    updatedAt,
    input.taskId,
  );
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: input.decision === 'approve' ? 'task_approved' : 'task_denied',
    source: 'opl-cli',
    payload: { reason: input.reason ?? null },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: input.decision === 'approve' ? 'info' : 'warning',
    title: input.decision === 'approve' ? 'Family runtime task approved' : 'Family runtime task denied',
    body: row.task_id,
    payload: { decision: input.decision, reason: input.reason ?? null },
  });
  return taskToPayload(
    db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.taskId) as FamilyRuntimeTaskRow,
  );
}

function listTasks(db: DatabaseSync) {
  return (db.prepare(`
    SELECT * FROM tasks ORDER BY priority DESC, created_at ASC
  `).all() as FamilyRuntimeTaskRow[]).map(taskToPayload);
}

function inspectTask(db: DatabaseSync, taskId: string) {
  const task = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow | undefined;
  if (!task) {
    throw new GatewayContractError('cli_usage_error', 'Family runtime task not found.', {
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
    task: taskToPayload(task),
    events,
    notifications,
  };
}

function listEvents(db: DatabaseSync) {
  return (db.prepare(`
    SELECT * FROM events ORDER BY created_at ASC
  `).all() as FamilyRuntimeEventRow[]).map(eventToPayload);
}

function listNotifications(db: DatabaseSync) {
  return (db.prepare(`
    SELECT * FROM notifications ORDER BY created_at ASC
  `).all() as FamilyRuntimeNotificationRow[]).map(notificationToPayload);
}

export function runFamilyRuntime(args: string[]) {
  const parsed = parseFamilyRuntimeCommand(args);
  const { db, paths } = openQueueDb();
  try {
    if (parsed.mode === 'status') {
      return buildStatusPayload(db, paths);
    }
    if (parsed.mode === 'doctor') {
      const status = buildStatusPayload(db, paths).family_runtime;
      return {
        version: 'g2',
        family_runtime_doctor: {
          surface_id: 'opl_family_runtime_doctor',
          doctor_status: status.readiness.full_online_ready ? 'ready' : 'degraded',
          blockers: status.hermes_bridge.issues,
          repair_command: 'opl family-runtime repair',
          status,
        },
      };
    }
    if (parsed.mode === 'install' || parsed.mode === 'repair') {
      const bridge = ensureHermesBridge(parsed.mode);
      insertEvent(db, {
        eventType: `hermes_bridge_${parsed.mode}`,
        source: 'opl-cli',
        payload: { status: bridge.status, actions: bridge.actions },
      });
      return {
        version: 'g2',
        family_runtime_bridge: {
          surface_id: 'opl_family_runtime_hermes_bridge',
          ...bridge,
        },
      };
    }
    if (parsed.mode === 'enqueue') {
      return {
        version: 'g2',
        family_runtime_enqueue: {
          surface_id: 'opl_family_runtime_enqueue',
          ...enqueueTask(db, parsed.input),
        },
      };
    }
    if (parsed.mode === 'tick') {
      return {
        version: 'g2',
        family_runtime_tick: {
          surface_id: 'opl_family_runtime_tick',
          ...runTick(db, paths, parsed.source ?? 'manual', parsed.limit ?? 10),
          queue: queueSummary(db),
        },
      };
    }
    if (parsed.mode === 'queue_list') {
      return {
        version: 'g2',
        family_runtime_queue: {
          surface_id: 'opl_family_runtime_queue',
          queue: queueSummary(db),
          tasks: listTasks(db),
        },
      };
    }
    if (parsed.mode === 'queue_inspect') {
      return {
        version: 'g2',
        family_runtime_task: {
          surface_id: 'opl_family_runtime_task',
          ...inspectTask(db, parsed.taskId),
        },
      };
    }
    if (parsed.mode === 'approve') {
      return {
        version: 'g2',
        family_runtime_approval: {
          surface_id: 'opl_family_runtime_approval',
          decision: parsed.decision,
          task: approveTask(db, parsed),
        },
      };
    }
    if (parsed.mode === 'notify_list') {
      return {
        version: 'g2',
        family_runtime_notifications: {
          surface_id: 'opl_family_runtime_notifications',
          notifications: listNotifications(db),
        },
      };
    }
    if (parsed.mode === 'events_export') {
      return {
        version: 'g2',
        family_runtime_events: {
          surface_id: 'opl_family_runtime_events',
          events: listEvents(db),
        },
      };
    }
    throw new Error(`Unhandled family runtime mode: ${(parsed as { mode: string }).mode}`);
  } finally {
    db.close();
  }
}
