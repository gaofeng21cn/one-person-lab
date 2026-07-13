import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stableId } from '../../kernel/stable-id.ts';
import { domainRouteProjection } from './family-runtime-domain-route.ts';
import {
  deriveCurrentControlStateForTask,
  latestProviderActivityHeartbeat,
} from './family-runtime-current-control-state.ts';
import { queryStageAttempt } from './family-runtime-stage-attempt-query.ts';
import { createStageAttemptTable, listStageAttemptsForTask } from './family-runtime-stage-attempt-ledger.ts';
import { createStageRunLaunchTable } from './family-runtime-stage-run-launch-registry.ts';
import { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
import type { FamilyRuntimeDomainId, FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import { resolveOplStatePaths } from './runtime-state-paths.ts';
import type { FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import { taskRowMatchesScope } from './family-runtime-task-scope.ts';
import {
  FAMILY_RUNTIME_QUEUE_PROJECTION_BOUNDARY,
  FAMILY_RUNTIME_TASK_COLUMNS,
  FAMILY_RUNTIME_TASK_STATUS,
} from './family-runtime-queue-projection-boundary.ts';

export { stableId } from '../../kernel/stable-id.ts';

export const QUEUE_SCHEMA_VERSION = 3;
export const DEFAULT_MAX_ATTEMPTS = 3;
const RUNTIME_LEDGER_MAX_STRING_LENGTH = 4_096;
const RUNTIME_LEDGER_MAX_ARRAY_ITEMS = 20;
const RUNTIME_LEDGER_MAX_OBJECT_KEYS = 40;
const RUNTIME_LEDGER_MAX_DEPTH = 6;

export type FamilyRuntimeTaskStatus =
  typeof FAMILY_RUNTIME_TASK_STATUS[keyof typeof FAMILY_RUNTIME_TASK_STATUS];

type FamilyRuntimeTaskProjectionColumns = {
  [FAMILY_RUNTIME_TASK_COLUMNS.maxAttempts]: number;
  [FAMILY_RUNTIME_TASK_COLUMNS.leaseOwner]: string | null;
  [FAMILY_RUNTIME_TASK_COLUMNS.leaseExpiresAt]: string | null;
  [FAMILY_RUNTIME_TASK_COLUMNS.deadLetterReason]: string | null;
};

export type FamilyRuntimeTaskRow = FamilyRuntimeTaskProjectionColumns & {
  task_id: string;
  domain_id: FamilyRuntimeDomainId;
  task_kind: string;
  payload_json: string;
  dedupe_key: string | null;
  priority: number;
  status: FamilyRuntimeTaskStatus;
  attempts: number;
  source: string;
  requires_approval: 0 | 1;
  approved_at: string | null;
  last_error: string | null;
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

function sha256Text(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function boundedLedgerValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    if (value.length <= RUNTIME_LEDGER_MAX_STRING_LENGTH) {
      return value;
    }
    return {
      surface_kind: 'opl_runtime_ledger_truncated_string',
      truncated: true,
      original_length: value.length,
      sha256: sha256Text(value),
      preview: value.slice(0, RUNTIME_LEDGER_MAX_STRING_LENGTH),
    };
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (depth >= RUNTIME_LEDGER_MAX_DEPTH) {
    const encoded = JSON.stringify(value);
    return {
      surface_kind: 'opl_runtime_ledger_truncated_value',
      truncated: true,
      reason: 'max_depth',
      original_json_length: encoded.length,
      sha256: sha256Text(encoded),
    };
  }
  if (Array.isArray(value)) {
    const items = value
      .slice(0, RUNTIME_LEDGER_MAX_ARRAY_ITEMS)
      .map((entry) => boundedLedgerValue(entry, depth + 1));
    return value.length <= RUNTIME_LEDGER_MAX_ARRAY_ITEMS
      ? items
      : {
          items,
          truncated: true,
          original_length: value.length,
          omitted_count: value.length - RUNTIME_LEDGER_MAX_ARRAY_ITEMS,
        };
  }

  const entries = Object.entries(value);
  const boundedEntries = entries
    .slice(0, RUNTIME_LEDGER_MAX_OBJECT_KEYS)
    .map(([key, entry]) => [key, boundedLedgerValue(entry, depth + 1)] as const);
  return {
    ...Object.fromEntries(boundedEntries),
    ...(entries.length > RUNTIME_LEDGER_MAX_OBJECT_KEYS
      ? {
          _truncated: true,
          _original_key_count: entries.length,
          _omitted_key_count: entries.length - RUNTIME_LEDGER_MAX_OBJECT_KEYS,
        }
      : {}),
  };
}

function boundedLedgerPayload(payload: Record<string, unknown> | undefined) {
  return boundedLedgerValue(payload ?? {}) as Record<string, unknown>;
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
    latest_temporal_production_proof: path.join(root, 'proofs', 'latest-temporal-production-proof.json'),
  };
}

export function createFamilyRuntimeQueueTables(db: DatabaseSync) {
  const tables = FAMILY_RUNTIME_QUEUE_PROJECTION_BOUNDARY.tables;
  const columns = FAMILY_RUNTIME_TASK_COLUMNS;
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ${tables.tasks} (
      task_id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      task_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      dedupe_key TEXT UNIQUE,
      priority INTEGER NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      ${columns.maxAttempts} INTEGER NOT NULL,
      source TEXT NOT NULL,
      requires_approval INTEGER NOT NULL,
      approved_at TEXT,
      ${columns.leaseOwner} TEXT,
      ${columns.leaseExpiresAt} TEXT,
      last_error TEXT,
      ${columns.deadLetterReason} TEXT,
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
    CREATE TABLE IF NOT EXISTS ${tables.queue_holds} (
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
  createStageRunLaunchTable(db);
}

export function openQueueDb() {
  const paths = familyRuntimePaths();
  fs.mkdirSync(paths.root, { recursive: true });
  fs.mkdirSync(paths.dispatch_dir, { recursive: true });
  fs.mkdirSync(paths.proof_dir, { recursive: true });
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
  const payload = parseJsonText(row.payload_json) as Record<string, any>;
  const columns = FAMILY_RUNTIME_TASK_COLUMNS;
  return {
    task_id: row.task_id,
    domain_id: row.domain_id,
    task_kind: row.task_kind,
    payload,
    domain_route: domainRouteProjection(row, payload),
    dedupe_key: row.dedupe_key,
    priority: row.priority,
    status: row.status,
    attempts: row.attempts,
    [columns.maxAttempts]: row[columns.maxAttempts],
    source: row.source,
    requires_approval: Boolean(row.requires_approval),
    approved_at: row.approved_at,
    lease: row[columns.leaseOwner]
      ? {
          [columns.leaseOwner]: row[columns.leaseOwner],
          [columns.leaseExpiresAt]: row[columns.leaseExpiresAt],
        }
      : null,
    last_error: row.last_error,
    [columns.deadLetterReason]: row[columns.deadLetterReason],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
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

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function latestActivityEvent(activityEvents: unknown[]) {
  return activityEvents.filter(isRecord).at(-1) ?? null;
}

function activityEventTime(event: Record<string, unknown> | null) {
  if (!event) {
    return null;
  }
  return stringValue(event.event_time) ?? stringValue(event.observed_at) ?? stringValue(event.created_at);
}

function compactStageProgressForLiveness(input: {
  stageAttemptId: string | null;
  activityEvents: unknown[];
  checkpointRefs: string[];
  closeoutRefs: string[];
}) {
  const latestActivity = latestActivityEvent(input.activityEvents);
  return {
    surface_kind: 'opl_stage_attempt_projection_linked_progress_readback',
    stage_attempt_id: input.stageAttemptId,
    activity_event_count: input.activityEvents.length,
    latest_activity_at: activityEventTime(latestActivity),
    latest_activity_kind: stringValue(latestActivity?.activity_kind),
    latest_activity_status: stringValue(latestActivity?.activity_status),
    latest_heartbeat_kind: stringValue(latestActivity?.heartbeat_kind),
    latest_runner_event_kind: stringValue(latestActivity?.runner_event_kind),
    checkpoint_refs: input.checkpointRefs,
    closeout_refs: input.closeoutRefs,
  };
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
  const workspaceLocator = isRecord(currentAttempt.workspace_locator)
    ? currentAttempt.workspace_locator
    : {};
  const checkpointRefs = stringList(currentAttempt.checkpoint_refs);
  const closeoutRefs = stringList(currentAttempt.closeout_refs);
  const providerRunWithHeartbeat = latestProviderActivityHeartbeat(activityEvents, providerRun);
  const lastHeartbeatAt = stringValue(providerRunWithHeartbeat.last_heartbeat_at);
  const stageAttemptStatus = stringValue(currentAttempt.status);
  const providerStatus = stringValue(providerRun.provider_status);
  const livenessStatus = liveStageAttemptStatus(stageAttemptStatus)
    ? (lastHeartbeatAt ? 'live' : 'live_missing_heartbeat')
    : 'not_live';
  return {
    surface_kind: 'opl_stage_attempt_projection_linked_liveness',
    projection_scope: 'stage_attempt_index',
    status: livenessStatus,
    stage_attempt_id: stringValue(currentAttempt.stage_attempt_id),
    workflow_id: stringValue(currentAttempt.workflow_id),
    stage_id: stringValue(currentAttempt.stage_id),
    provider_kind: stringValue(currentAttempt.provider_kind),
    executor_kind: stringValue(currentAttempt.executor_kind),
    task_id: row.task_id,
    workspace_locator: workspaceLocator,
    route_command: {
      command_kind: stringValue(workspaceLocator.command_kind),
      route_target: stringValue(workspaceLocator.route_target),
      opl_route_command_ref: stringValue(workspaceLocator.opl_route_command_ref),
      paper_mission_transaction_ref: stringValue(workspaceLocator.paper_mission_transaction_ref),
      route_identity_key: stringValue(workspaceLocator.route_identity_key),
      attempt_idempotency_key: stringValue(workspaceLocator.attempt_idempotency_key),
      request_idempotency_key: stringValue(workspaceLocator.request_idempotency_key),
      candidate_ref: stringValue(workspaceLocator.candidate_ref),
      workspace_root: stringValue(workspaceLocator.workspace_root),
      command_cwd: stringValue(workspaceLocator.command_cwd),
      command_source: stringValue(workspaceLocator.command_source),
    },
    stage_attempt_status: stageAttemptStatus,
    provider_status: providerStatus,
    last_heartbeat_at: lastHeartbeatAt,
    ledger_last_heartbeat_at: stringValue(providerRunWithHeartbeat.ledger_last_heartbeat_at),
    liveness_source: stringValue(providerRunWithHeartbeat.liveness_source),
    last_activity_heartbeat_kind: stringValue(providerRunWithHeartbeat.last_activity_heartbeat_kind),
    last_runner_event_kind: stringValue(providerRunWithHeartbeat.last_runner_event_kind),
    checkpoint_refs: checkpointRefs,
    closeout_refs: closeoutRefs,
    closeout_ref_count: closeoutRefs.length,
    closeout_receipt_status: stringValue(currentAttempt.closeout_receipt_status),
    stage_progress_log: compactStageProgressForLiveness({
      stageAttemptId: stringValue(currentAttempt.stage_attempt_id),
      activityEvents,
      checkpointRefs,
      closeoutRefs,
    }),
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
    payload: parseJsonText(row.payload_json) as Record<string, any>,
    created_at: row.created_at,
  };
}

function latestDomainRouteTransportReceipt(events: ReturnType<typeof eventToPayload>[]) {
  for (const event of [...events].reverse()) {
    if (event.event_type !== 'domain_route_terminal_task_projected') {
      continue;
    }
    const payload = isRecord(event.payload) ? event.payload : {};
    const receipt = payload.opl_transport_receipt;
    if (
      isRecord(receipt)
      && receipt.surface_kind === 'opl_domain_route_terminal_transport_receipt'
    ) {
      return receipt;
    }
  }
  return null;
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
    payload: parseJsonText(row.payload_json) as Record<string, any>,
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
    payload_json: JSON.stringify(boundedLedgerPayload(input.payload)),
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
    payload_json: JSON.stringify(boundedLedgerPayload(input.payload)),
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

const TEMPORAL_COMPETING_QUEUE_STATUSES: FamilyRuntimeTaskStatus[] = [
  FAMILY_RUNTIME_TASK_STATUS.running,
  FAMILY_RUNTIME_TASK_STATUS.retryWaiting,
  FAMILY_RUNTIME_TASK_STATUS.blocked,
  FAMILY_RUNTIME_TASK_STATUS.deadLetter,
  FAMILY_RUNTIME_TASK_STATUS.succeeded,
];

function temporalCompetingQueueTasks(db: DatabaseSync) {
  const taskColumns = FAMILY_RUNTIME_TASK_COLUMNS;
  const placeholders = TEMPORAL_COMPETING_QUEUE_STATUSES.map(() => '?').join(', ');
  const rows = db.prepare(`
    WITH competing_tasks AS (
      SELECT
        t.task_id,
        t.status,
        t.task_kind,
        t.dedupe_key,
        t.attempts,
        t.${taskColumns.maxAttempts},
        t.${taskColumns.leaseOwner},
        t.${taskColumns.leaseExpiresAt},
        t.last_error,
        t.${taskColumns.deadLetterReason},
        t.updated_at,
        t.created_at,
        COUNT(sa.stage_attempt_id) AS stage_attempt_count,
        SUM(CASE WHEN sa.provider_kind = 'temporal' THEN 1 ELSE 0 END) AS temporal_stage_attempt_count
      FROM tasks t
      LEFT JOIN stage_attempts sa ON sa.task_id = t.task_id
      WHERE t.status IN (${placeholders})
      GROUP BY t.task_id, t.status, t.task_kind, t.dedupe_key, t.updated_at, t.created_at
      HAVING SUM(CASE WHEN sa.provider_kind = 'temporal' THEN 1 ELSE 0 END) = 0
    )
    SELECT
      task_id,
      status,
      task_kind,
      dedupe_key,
      attempts,
      ${taskColumns.maxAttempts},
      ${taskColumns.leaseOwner},
      ${taskColumns.leaseExpiresAt},
      last_error,
      ${taskColumns.deadLetterReason},
      stage_attempt_count,
      temporal_stage_attempt_count,
      COUNT(*) OVER() AS total_competing_task_count
    FROM competing_tasks
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 10
  `).all(...TEMPORAL_COMPETING_QUEUE_STATUSES) as Array<{
    task_id: string;
    status: FamilyRuntimeTaskStatus;
    task_kind: string;
    dedupe_key: string | null;
    attempts: number;
    [FAMILY_RUNTIME_TASK_COLUMNS.maxAttempts]: number;
    [FAMILY_RUNTIME_TASK_COLUMNS.leaseOwner]: string | null;
    [FAMILY_RUNTIME_TASK_COLUMNS.leaseExpiresAt]: string | null;
    last_error: string | null;
    [FAMILY_RUNTIME_TASK_COLUMNS.deadLetterReason]: string | null;
    stage_attempt_count: number;
    temporal_stage_attempt_count: number;
    total_competing_task_count: number;
  }>;
  return {
    totalCount: Number(rows[0]?.total_competing_task_count ?? 0),
    tasks: rows.map((row) => ({
      task_id: row.task_id,
      status: row.status,
      task_kind: row.task_kind,
      dedupe_key: row.dedupe_key,
      attempts: Number(row.attempts ?? 0),
      [taskColumns.maxAttempts]: Number(row[taskColumns.maxAttempts] ?? 0),
      lease: row[taskColumns.leaseOwner]
        ? {
            [taskColumns.leaseOwner]: row[taskColumns.leaseOwner],
            [taskColumns.leaseExpiresAt]: row[taskColumns.leaseExpiresAt],
          }
        : null,
      last_error: row.last_error,
      [taskColumns.deadLetterReason]: row[taskColumns.deadLetterReason],
      stage_attempt_count: Number(row.stage_attempt_count ?? 0),
      temporal_stage_attempt_count: Number(row.temporal_stage_attempt_count ?? 0),
      projection_handoff: {
      status_role: 'retired_task_status_projection_only',
        lease_role: 'local_worker_pickup_projection_only_not_live_attempt_truth',
        retry_budget_role: 'local_retry_budget_projection_only_temporal_retry_policy_required',
        terminal_reason_role: 'local_failure_projection_only_temporal_history_required',
      allowed_local_action: 'read_projection_and_emit_operator_handoff_only',
      scheduler_mutation_allowed: false,
        domain_progress_claim_allowed: false,
        ready_claim_allowed: false,
      },
    })),
  };
}

export function buildQueueTemporalLifecycleBoundary(
  db: DatabaseSync,
  selectedProvider: FamilyRuntimeProviderKind,
) {
  const taskColumns = FAMILY_RUNTIME_TASK_COLUMNS;
  const competing = selectedProvider === 'temporal'
    ? temporalCompetingQueueTasks(db)
    : { totalCount: 0, tasks: [] };
  const gateStatus = competing.totalCount > 0 ? 'diagnostic_only' : 'pass';
  const temporalLifecycleHandoff = {
    surface_kind: 'opl_temporal_durable_lifecycle_handoff',
    mature_substrate: 'Temporal workflow history/task queue/retry policy/schedule',
    status: gateStatus === 'diagnostic_only' ? 'diagnostic_only' : 'not_required',
    owner: 'opl_runway',
    migration_policy:
      'rebuild_or_link_lifecycle_from_temporal_history_before_runtime_ready_claim',
    required_evidence: [
      'workflow_id',
      'temporal_workflow_history_or_query_readback',
      'stage_attempt_identity',
      'temporal_retry_policy_readback_for_attempt_budget',
      'temporal_activity_failure_or_dead_letter_history', // reuse-first: allow Temporal-owned dead-letter evidence vocabulary.
      'authority_event_ref_or_projection_rebuild_ref',
      'operator_projection_repair_or_retirement_receipt',
    ],
    readback_surfaces: [
      'opl family-runtime status --json',
      'opl family-runtime attempt list --json',
      'opl runway reconcile --json',
    ],
    local_projection_field_policy: {
      tasks_status: 'handoff_readback_only_not_temporal_workflow_status',
      tasks_attempts: 'handoff_readback_only_temporal_retry_policy_required',
      tasks_max_attempts: 'handoff_readback_only_temporal_retry_policy_required', // reuse-first: allow local max_attempts vocabulary boundary.
      tasks_lease_owner: 'handoff_readback_only_not_worker_or_activity_ownership', // reuse-first: allow local lease_owner vocabulary boundary.
      tasks_lease_expires_at: 'handoff_readback_only_not_worker_or_activity_ownership', // reuse-first: allow local lease_owner vocabulary boundary.
      tasks_dead_letter_reason: 'handoff_readback_only_temporal_failure_history_required', // reuse-first: allow local dead-letter vocabulary boundary.
    },
    allowed_local_action:
      'read_projection_and_emit_operator_handoff_only',
    forbidden_local_actions: [
      'treat_sqlite_task_status_as_temporal_lifecycle_truth',
      'retry_or_dead_letter_without_temporal_history',
      'derive_retry_budget_from_tasks_max_attempts', // reuse-first: allow local max_attempts vocabulary boundary.
      'derive_worker_liveness_from_tasks_lease_owner', // reuse-first: allow local lease_owner vocabulary boundary.
      'derive_terminal_failure_from_tasks_dead_letter_reason', // reuse-first: allow local dead-letter vocabulary boundary.
      'claim_provider_backed_runtime_ready',
      'claim_domain_progress_or_domain_ready',
      'schedule_tick_from_local_lifecycle_projection',
    ],
    handoff_claims: {
      scheduler_mutation_allowed: false,
      domain_progress_claim_allowed: false,
      provider_ready_claim_authority: 'not_this_handoff_readback',
      ready_claim_allowed_without_temporal_history: false,
    },
  };
  return {
    surface_kind: 'opl_family_runtime_sqlite_sidecar_projection_boundary',
    selected_provider: selectedProvider,
    sqlite_role: 'stage_attempt_projection_index_not_runtime_queue_or_provider',
    temporal_role: 'durable_workflow_activity_retry_dead_letter_and_schedule_truth',
    field_roles: {
      projection_or_audit_when_temporal_selected: [
        'tasks.status',
        'tasks.attempts',
        `${FAMILY_RUNTIME_QUEUE_PROJECTION_BOUNDARY.tables.tasks}.${taskColumns.maxAttempts}`,
        `${FAMILY_RUNTIME_QUEUE_PROJECTION_BOUNDARY.tables.tasks}.${taskColumns.leaseOwner}`,
        `${FAMILY_RUNTIME_QUEUE_PROJECTION_BOUNDARY.tables.tasks}.${taskColumns.leaseExpiresAt}`,
        'tasks.last_error',
        `${FAMILY_RUNTIME_QUEUE_PROJECTION_BOUNDARY.tables.tasks}.${taskColumns.deadLetterReason}`,
        'stage_attempts.status',
        'stage_attempts.provider_run_json',
        'stage_attempts.activity_events_json',
        'stage_attempt_signals.*',
      ],
      retired_task_identity_projection_fields: [
        'tasks.task_id',
        'tasks.domain_id',
        'tasks.task_kind',
        'tasks.payload_json',
        'tasks.dedupe_key',
        'tasks.priority',
        'tasks.source',
        'tasks.requires_approval',
        'tasks.approved_at',
      ],
      temporal_owned_lifecycle_when_temporal_selected: [
        'workflow_history',
        'workflow_status',
        'activity_retry_policy',
        'activity_retry_policy.maximum_attempts',
        'activity_dead_letter_or_failure',
        'workflow_task_or_activity_task_ownership',
        'schedule_cadence',
        'signal_history',
      ],
    },
    gate: {
      status: gateStatus,
      reason: gateStatus === 'diagnostic_only'
        ? 'retired_local_task_projection_observed_without_temporal_stage_attempt'
        : null,
      temporal_migration_required: false,
      required_evidence: temporalLifecycleHandoff.required_evidence,
      allowed_readbacks: temporalLifecycleHandoff.readback_surfaces,
      competing_statuses: TEMPORAL_COMPETING_QUEUE_STATUSES,
      competing_task_count: competing.totalCount,
      competing_tasks: competing.tasks,
      readiness_effect: gateStatus === 'diagnostic_only'
        ? 'none_diagnostic_projection_only'
        : 'none',
      scheduler_mutation_allowed: false,
      domain_progress_claim_allowed: false,
      ready_claim_allowed: false,
      forbidden_mutations_when_attention_needed: [],
    },
    temporal_durable_lifecycle_handoff: temporalLifecycleHandoff,
    authority_boundary: {
      opl_sqlite_can_project_runtime_state: true,
      opl_sqlite_can_own_temporal_durable_lifecycle: false,
      temporal_owns_durable_lifecycle_when_selected: selectedProvider === 'temporal',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      provider_completion_is_domain_ready: false,
    },
  };
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
  const taskPayload = taskToPayload(task);
  const currentControlState = deriveCurrentControlStateForTask(db, taskId);
  const currentStageAttemptId = typeof currentControlState.current_stage_attempt_id === 'string'
    ? currentControlState.current_stage_attempt_id
    : null;
  const currentAttemptQuery = currentStageAttemptId
    ? queryStageAttempt(db, currentStageAttemptId).stage_attempt_query
    : null;
  const transportReceipt = latestDomainRouteTransportReceipt(events);
  const receiptProjection = transportReceipt
    ? {
        opl_transport_receipt: transportReceipt,
        mas_impact_receipt: isRecord(transportReceipt.mas_impact_receipt)
          ? transportReceipt.mas_impact_receipt
          : null,
      }
    : {};
  return {
    task: {
      ...taskPayload,
      ...receiptProjection,
      current_control_state: {
        ...currentControlState,
        ...receiptProjection,
      },
      opl_runtime_context: currentAttemptQuery?.opl_runtime_context ?? null,
      opl_runtime_context_consumer_ref: currentAttemptQuery?.opl_runtime_context_consumer_ref ?? null,
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
