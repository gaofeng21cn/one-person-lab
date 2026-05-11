import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-command.ts';
import {
  buildStageAttemptProviderReceipt,
  resolveFamilyRuntimeProviderKind,
  type FamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import {
  buildCodexStageActivityInput,
  normalizeTypedStageCloseoutPacket,
  type TypedStageCloseoutPacket,
} from './family-runtime-codex-stage-runner.ts';
import { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
import {
  buildTemporalStageAttemptWorkflowContract,
  buildTemporalStageAttemptWorkflowInput,
  type TemporalStageAttemptSignalKind,
} from './family-runtime-temporal.ts';

export type StageAttemptStatus =
  | 'queued'
  | 'running'
  | 'checkpointed'
  | 'blocked'
  | 'human_gate'
  | 'completed'
  | 'failed'
  | 'dead_lettered';

export type StageAttemptCreateInput = {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  providerKind?: FamilyRuntimeProviderKind;
  workspaceLocator: Record<string, unknown>;
  sourceFingerprint?: string;
  executorKind?: string;
  taskId?: string;
  retryBudget?: Record<string, unknown>;
  checkpointRefs?: string[];
  closeoutRefs?: string[];
  humanGateRefs?: string[];
  blockedReason?: string;
  newAttempt?: boolean;
  start?: boolean;
};

type StageAttemptRow = {
  stage_attempt_id: string;
  idempotency_key: string;
  provider_kind: FamilyRuntimeProviderKind;
  workflow_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  workspace_locator_json: string;
  source_fingerprint: string | null;
  executor_kind: string;
  status: StageAttemptStatus;
  checkpoint_refs_json: string;
  closeout_refs_json: string;
  human_gate_refs_json: string;
  retry_budget_json: string;
  attempt_count: number;
  task_id: string | null;
  blocked_reason: string | null;
  provider_receipt_json: string;
  provider_run_json: string;
  activity_events_json: string;
  route_impact_json: string;
  closeout_receipt_status: string | null;
  created_at: string;
  updated_at: string;
};

type StageAttemptSignalRow = {
  signal_id: string;
  stage_attempt_id: string;
  signal_kind: TemporalStageAttemptSignalKind;
  payload_json: string;
  source: string;
  created_at: string;
};

type StageAttemptCloseoutRow = {
  closeout_id: string;
  stage_attempt_id: string;
  packet_json: string;
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

function parseJsonObject(value: string) {
  const parsed = JSON.parse(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function parseJsonList(value: string) {
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [];
}

function normalizeStageId(stageId: string) {
  const normalized = stageId.trim();
  if (!normalized) {
    throw new FrameworkContractError('cli_usage_error', 'Stage attempt requires a non-empty stage id.', {
      required: ['--stage'],
    });
  }
  return normalized;
}

function normalizeJsonList(value?: string[]) {
  return Array.isArray(value) ? value.filter((entry) => entry.trim()).map((entry) => entry.trim()) : [];
}

function normalizeRouteImpact(packet: TypedStageCloseoutPacket) {
  const routeImpact = packet.route_impact && typeof packet.route_impact === 'object' && !Array.isArray(packet.route_impact)
    ? packet.route_impact
    : {};
  return {
    ...routeImpact,
    next_owner: packet.next_owner,
    domain_ready_verdict: packet.domain_ready_verdict,
  };
}

function signalPayloadsByKind(
  db: DatabaseSync,
  stageAttemptId: string,
  signalKind: TemporalStageAttemptSignalKind,
) {
  return listStageAttemptSignals(db, stageAttemptId).filter((signal) => signal.signal_kind === signalKind);
}

function taskDeadLetterForAttempt(db: DatabaseSync, attempt: ReturnType<typeof stageAttemptToPayload>) {
  if (attempt.status !== 'dead_lettered') {
    return null;
  }
  const taskId = typeof attempt.task_id === 'string' ? attempt.task_id : null;
  const task = taskId
    ? db.prepare(`
      SELECT task_id, domain_id, task_kind, status, attempts, max_attempts, last_error, dead_letter_reason, updated_at
      FROM tasks
      WHERE task_id = ?
    `).get(taskId) as Record<string, unknown> | undefined
    : undefined;
  return {
    reason: attempt.blocked_reason ?? (typeof task?.dead_letter_reason === 'string' ? task.dead_letter_reason : null),
    task: task ?? null,
  };
}

function normalizeActivityEvent(value: Record<string, unknown>) {
  return {
    event_time: nowIso(),
    ...value,
  };
}

function appendActivityEventToRow(row: StageAttemptRow, event: Record<string, unknown>) {
  return [
    ...parseJsonList(row.activity_events_json).filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    ),
    normalizeActivityEvent(event),
  ];
}

function readColumnNames(db: DatabaseSync, tableName: string) {
  return new Set(
    (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map((row) => row.name),
  );
}

function addColumnIfMissing(db: DatabaseSync, tableName: string, columns: Set<string>, name: string, ddl: string) {
  if (!columns.has(name)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
    columns.add(name);
  }
}

export function createStageAttemptTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stage_attempts (
      stage_attempt_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      provider_kind TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      workspace_locator_json TEXT NOT NULL,
      source_fingerprint TEXT,
      executor_kind TEXT NOT NULL,
      status TEXT NOT NULL,
      checkpoint_refs_json TEXT NOT NULL,
      closeout_refs_json TEXT NOT NULL,
      human_gate_refs_json TEXT NOT NULL,
      retry_budget_json TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      task_id TEXT,
      blocked_reason TEXT,
      provider_receipt_json TEXT NOT NULL,
      provider_run_json TEXT NOT NULL,
      activity_events_json TEXT NOT NULL,
      route_impact_json TEXT NOT NULL,
      closeout_receipt_status TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_idempotency ON stage_attempts(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_domain_stage ON stage_attempts(domain_id, stage_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_task_id ON stage_attempts(task_id);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_status ON stage_attempts(status, updated_at);
    CREATE TABLE IF NOT EXISTS stage_attempt_signals (
      signal_id TEXT PRIMARY KEY,
      stage_attempt_id TEXT NOT NULL,
      signal_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_attempt_signals_attempt ON stage_attempt_signals(stage_attempt_id, created_at);
    CREATE TABLE IF NOT EXISTS stage_attempt_closeouts (
      closeout_id TEXT PRIMARY KEY,
      stage_attempt_id TEXT NOT NULL,
      packet_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_attempt_closeouts_attempt ON stage_attempt_closeouts(stage_attempt_id, created_at);
  `);
  const columns = readColumnNames(db, 'stage_attempts');
  addColumnIfMissing(db, 'stage_attempts', columns, 'idempotency_key', "idempotency_key TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing(db, 'stage_attempts', columns, 'provider_run_json', "provider_run_json TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'activity_events_json', "activity_events_json TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'route_impact_json', "route_impact_json TEXT NOT NULL DEFAULT '{}'");
  addColumnIfMissing(db, 'stage_attempts', columns, 'closeout_receipt_status', 'closeout_receipt_status TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_stage_attempts_idempotency ON stage_attempts(idempotency_key)');
}

export function stageAttemptToPayload(row: StageAttemptRow) {
  return {
    stage_attempt_id: row.stage_attempt_id,
    idempotency_key: row.idempotency_key,
    provider_kind: row.provider_kind,
    workflow_id: row.workflow_id,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    workspace_locator: parseJsonObject(row.workspace_locator_json),
    source_fingerprint: row.source_fingerprint,
    executor_kind: row.executor_kind,
    status: row.status,
    checkpoint_refs: parseJsonList(row.checkpoint_refs_json),
    closeout_refs: parseJsonList(row.closeout_refs_json),
    human_gate_refs: parseJsonList(row.human_gate_refs_json),
    retry_budget: parseJsonObject(row.retry_budget_json),
    attempt_count: row.attempt_count,
    task_id: row.task_id,
    blocked_reason: row.blocked_reason,
    provider_receipt: parseJsonObject(row.provider_receipt_json),
    provider_run: parseJsonObject(row.provider_run_json),
    activity_events: parseJsonList(row.activity_events_json),
    route_impact: parseJsonObject(row.route_impact_json),
    closeout_receipt_status: row.closeout_receipt_status,
    authority_boundary: {
      opl: 'attempt_control_metadata_and_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      executor: 'codex_cli_or_domain_selected_executor',
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createStageAttempt(db: DatabaseSync, input: StageAttemptCreateInput) {
  const stageId = normalizeStageId(input.stageId);
  const providerKind = resolveFamilyRuntimeProviderKind(input.providerKind);
  const createdAt = nowIso();
  const sourceFingerprint = input.sourceFingerprint?.trim() || null;
  const executorKind = input.executorKind?.trim() || 'codex_cli';
  const retryBudget = input.retryBudget ?? { max_attempts: 3 };
  const taskId = input.taskId?.trim() || null;
  const baseIdempotencyKey = stableId('idem', [
    input.domainId,
    stageId,
    providerKind,
    input.workspaceLocator,
    sourceFingerprint,
    taskId,
  ]);
  const idempotencyKey = input.newAttempt
    ? stableId('idem', [baseIdempotencyKey, 'new_attempt', createdAt])
    : baseIdempotencyKey;
  if (!input.newAttempt) {
    const existing = db.prepare(`
      SELECT * FROM stage_attempts WHERE idempotency_key = ? ORDER BY created_at ASC LIMIT 1
    `).get(idempotencyKey) as StageAttemptRow | undefined;
    if (existing) {
      return {
        created: false,
        idempotent_noop: true,
        attempt: stageAttemptToPayload(existing),
      };
    }
  }
  const stageAttemptId = stableId('sat', [
    input.domainId,
    stageId,
    providerKind,
    input.workspaceLocator,
    sourceFingerprint,
    input.taskId ?? null,
    createdAt,
  ]);
  const workflowId = stableId('wf', [input.domainId, stageId, stageAttemptId]);
  const providerReceipt = buildStageAttemptProviderReceipt({
    providerKind,
    stageAttemptId,
    workflowId,
  });
  const providerRun = {
    provider_kind: providerKind,
    workflow_id: workflowId,
    provider_status: 'registered',
    started_at: null,
    completed_at: null,
    last_heartbeat_at: null,
  };
  const row = {
    stage_attempt_id: stageAttemptId,
    idempotency_key: idempotencyKey,
    provider_kind: providerKind,
    workflow_id: workflowId,
    domain_id: input.domainId,
    stage_id: stageId,
    workspace_locator_json: JSON.stringify(input.workspaceLocator),
    source_fingerprint: sourceFingerprint,
    executor_kind: executorKind,
    status: input.blockedReason ? 'blocked' : 'queued',
    checkpoint_refs_json: JSON.stringify(normalizeJsonList(input.checkpointRefs)),
    closeout_refs_json: JSON.stringify(normalizeJsonList(input.closeoutRefs)),
    human_gate_refs_json: JSON.stringify(normalizeJsonList(input.humanGateRefs)),
    retry_budget_json: JSON.stringify(retryBudget),
    attempt_count: 0,
    task_id: taskId,
    blocked_reason: input.blockedReason?.trim() || null,
    provider_receipt_json: JSON.stringify(providerReceipt),
    provider_run_json: JSON.stringify(providerRun),
    activity_events_json: JSON.stringify([]),
    route_impact_json: JSON.stringify({}),
    closeout_receipt_status: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  db.prepare(`
    INSERT INTO stage_attempts(
      stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id, workspace_locator_json,
      source_fingerprint, executor_kind, status, checkpoint_refs_json, closeout_refs_json,
      human_gate_refs_json, retry_budget_json, attempt_count, task_id, blocked_reason,
      provider_receipt_json, provider_run_json, activity_events_json, route_impact_json,
      closeout_receipt_status, created_at, updated_at
    )
    VALUES (
      @stage_attempt_id, @idempotency_key, @provider_kind, @workflow_id, @domain_id, @stage_id, @workspace_locator_json,
      @source_fingerprint, @executor_kind, @status, @checkpoint_refs_json, @closeout_refs_json,
      @human_gate_refs_json, @retry_budget_json, @attempt_count, @task_id, @blocked_reason,
      @provider_receipt_json, @provider_run_json, @activity_events_json, @route_impact_json,
      @closeout_receipt_status, @created_at, @updated_at
    )
  `).run(row);
  return {
    created: true,
    idempotent_noop: false,
    attempt: stageAttemptToPayload(row as StageAttemptRow),
  };
}

export function listStageAttempts(db: DatabaseSync) {
  return (db.prepare(`
    SELECT * FROM stage_attempts ORDER BY updated_at DESC, created_at DESC
  `).all() as StageAttemptRow[]).map(stageAttemptToPayload);
}

export function listStageAttemptsForTask(db: DatabaseSync, taskId: string) {
  return (db.prepare(`
    SELECT * FROM stage_attempts WHERE task_id = ? ORDER BY updated_at DESC, created_at DESC
  `).all(taskId) as StageAttemptRow[]).map(stageAttemptToPayload);
}

export function inspectStageAttempt(db: DatabaseSync, stageAttemptId: string) {
  const row = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(stageAttemptId) as
    | StageAttemptRow
    | undefined;
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Family runtime stage attempt not found.', {
      stage_attempt_id: stageAttemptId,
    });
  }
  return stageAttemptToPayload(row);
}

function signalToPayload(row: StageAttemptSignalRow) {
  return {
    signal_id: row.signal_id,
    stage_attempt_id: row.stage_attempt_id,
    signal_kind: row.signal_kind,
    payload: parseJsonObject(row.payload_json),
    source: row.source,
    created_at: row.created_at,
  };
}

function closeoutToPayload(row: StageAttemptCloseoutRow) {
  return {
    closeout_id: row.closeout_id,
    stage_attempt_id: row.stage_attempt_id,
    packet: parseJsonObject(row.packet_json),
    created_at: row.created_at,
  };
}

export function listStageAttemptSignals(db: DatabaseSync, stageAttemptId: string) {
  return (db.prepare(`
    SELECT * FROM stage_attempt_signals WHERE stage_attempt_id = ? ORDER BY created_at ASC
  `).all(stageAttemptId) as StageAttemptSignalRow[]).map(signalToPayload);
}

export function listStageAttemptCloseouts(db: DatabaseSync, stageAttemptId: string) {
  return (db.prepare(`
    SELECT * FROM stage_attempt_closeouts WHERE stage_attempt_id = ? ORDER BY created_at ASC
  `).all(stageAttemptId) as StageAttemptCloseoutRow[]).map(closeoutToPayload);
}

export function signalStageAttempt(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    signalKind: TemporalStageAttemptSignalKind;
    payload: Record<string, unknown>;
    source?: string;
  },
) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  const createdAt = nowIso();
  const signal = {
    signal_id: stableId('sig', [input.stageAttemptId, input.signalKind, input.payload, createdAt]),
    stage_attempt_id: input.stageAttemptId,
    signal_kind: input.signalKind,
    payload_json: JSON.stringify(input.payload),
    source: input.source?.trim() || 'opl-cli',
    created_at: createdAt,
  };
  db.prepare(`
    INSERT INTO stage_attempt_signals(signal_id, stage_attempt_id, signal_kind, payload_json, source, created_at)
    VALUES (@signal_id, @stage_attempt_id, @signal_kind, @payload_json, @source, @created_at)
  `).run(signal);

  if (input.signalKind === 'human_gate') {
    const currentHumanGateRefs = Array.isArray(attempt.human_gate_refs)
      ? attempt.human_gate_refs.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const humanGateRef = typeof input.payload.human_gate_ref === 'string'
      ? input.payload.human_gate_ref
      : signal.signal_id;
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'human_gate', human_gate_refs_json = ?, blocked_reason = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify([...new Set([...currentHumanGateRefs, humanGateRef])]),
      typeof input.payload.reason === 'string' ? input.payload.reason : 'human_gate_signal_received',
      createdAt,
      input.stageAttemptId,
    );
  } else if (input.signalKind === 'resume') {
    db.prepare(`
      UPDATE stage_attempts
      SET status = CASE WHEN status IN ('human_gate', 'blocked', 'failed') THEN 'queued' ELSE status END,
        blocked_reason = NULL, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(createdAt, input.stageAttemptId);
  } else if (input.signalKind === 'user_instruction') {
    db.prepare(`
      UPDATE stage_attempts
      SET provider_run_json = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify({
        ...attempt.provider_run,
        last_user_instruction_signal_id: signal.signal_id,
        last_user_instruction_at: createdAt,
      }),
      createdAt,
      input.stageAttemptId,
    );
  }

  return {
    attempt: inspectStageAttempt(db, input.stageAttemptId),
    signal: signalToPayload(signal as StageAttemptSignalRow),
  };
}

export function ingestStageAttemptCloseout(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    packet: TypedStageCloseoutPacket | Record<string, unknown>;
  },
) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  const packet = normalizeTypedStageCloseoutPacket(input.packet);
  const createdAt = nowIso();
  const closeoutId = packet.closeout_id
    ?? stableId('closeout', [input.stageAttemptId, packet.surface_kind, packet.closeout_refs]);
  db.prepare(`
    INSERT OR IGNORE INTO stage_attempt_closeouts(closeout_id, stage_attempt_id, packet_json, created_at)
    VALUES (?, ?, ?, ?)
  `).run(closeoutId, input.stageAttemptId, JSON.stringify(packet), createdAt);
  const persistedCloseouts = db.prepare(
    'SELECT COUNT(*) AS count FROM stage_attempt_closeouts WHERE closeout_id = ?',
  ).get(closeoutId) as { count: number };
  const existingCloseoutRefs = Array.isArray(attempt.closeout_refs)
    ? attempt.closeout_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const humanGateRefs = Array.isArray(attempt.human_gate_refs)
    ? attempt.human_gate_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const currentRow = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as StageAttemptRow;
  const providerRun = {
    ...attempt.provider_run,
    provider_status: 'completed',
    completed_at: createdAt,
    last_heartbeat_at: createdAt,
  };
  const activityEvents = appendActivityEventToRow(currentRow, {
    activity_kind: 'typed_closeout_ingest',
    activity_status: 'completed',
    closeout_id: closeoutId,
    closeout_refs: packet.closeout_refs,
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = 'completed', closeout_refs_json = ?, human_gate_refs_json = ?, blocked_reason = NULL,
      provider_run_json = ?, activity_events_json = ?, route_impact_json = ?, closeout_receipt_status = ?,
      updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    JSON.stringify([...new Set([...existingCloseoutRefs, ...packet.closeout_refs])]),
    JSON.stringify(humanGateRefs),
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    JSON.stringify(normalizeRouteImpact(packet)),
    'accepted_typed_closeout',
    createdAt,
    input.stageAttemptId,
  );
  return {
    attempt: inspectStageAttempt(db, input.stageAttemptId),
    closeout: {
      closeout_id: closeoutId,
      stage_attempt_id: input.stageAttemptId,
      packet,
      created_at: createdAt,
      persisted_count: persistedCloseouts.count,
    },
  };
}

export function runStageAttemptFixtureActivity(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    stagePacketRef?: string | null;
    checkpointRefs?: string[];
    closeoutPacket?: Record<string, unknown>;
  },
) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  const startedAt = nowIso();
  const checkpointRefs = normalizeJsonList(input.checkpointRefs);
  const currentRow = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as StageAttemptRow;
  const providerRun = {
    ...attempt.provider_run,
    provider_kind: attempt.provider_kind,
    workflow_id: attempt.workflow_id,
    provider_status: checkpointRefs.length > 0 ? 'checkpointed' : 'running',
    started_at: typeof attempt.provider_run.started_at === 'string' ? attempt.provider_run.started_at : startedAt,
    last_heartbeat_at: startedAt,
  };
  const activityEvents = appendActivityEventToRow(currentRow, {
    activity_kind: 'codex_stage_activity',
    activity_status: checkpointRefs.length > 0 ? 'checkpointed' : 'running',
    stage_packet_ref: input.stagePacketRef ?? null,
    checkpoint_refs: checkpointRefs,
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = ?, attempt_count = attempt_count + 1, checkpoint_refs_json = ?,
      provider_run_json = ?, activity_events_json = ?, updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    checkpointRefs.length > 0 ? 'checkpointed' : 'running',
    JSON.stringify(checkpointRefs),
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    startedAt,
    input.stageAttemptId,
  );
  const runningAttempt = inspectStageAttempt(db, input.stageAttemptId);
  const activity = buildCodexStageActivityInput({
    attempt: runningAttempt,
    stagePacketRef: input.stagePacketRef,
  });
  const closeout = input.closeoutPacket
    ? ingestStageAttemptCloseout(db, {
        stageAttemptId: input.stageAttemptId,
        packet: input.closeoutPacket,
      })
    : null;
  const finalAttempt = inspectStageAttempt(db, input.stageAttemptId);
  return {
    provider_fixture_run: {
      provider_completion: closeout ? 'completed' : 'checkpointed',
      domain_ready_verdict: closeout?.closeout.packet.domain_ready_verdict ?? null,
      started_at: startedAt,
    },
    activity,
    attempt_before: attempt,
    attempt: finalAttempt,
    closeout,
  };
}

export function queryStageAttempt(db: DatabaseSync, stageAttemptId: string) {
  const attempt = inspectStageAttempt(db, stageAttemptId);
  const closeouts = listStageAttemptCloseouts(db, stageAttemptId);
  const humanGateLedger = signalPayloadsByKind(db, stageAttemptId, 'human_gate');
  const userInstructionLedger = signalPayloadsByKind(db, stageAttemptId, 'user_instruction');
  const resumeLedger = signalPayloadsByKind(db, stageAttemptId, 'resume');
  const latestCloseout = closeouts.at(-1)?.packet as Record<string, unknown> | undefined;
  const closeoutRefs = Array.isArray(attempt.closeout_refs)
    ? attempt.closeout_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    stage_attempt_query: {
      surface_kind: 'stage_attempt_query',
      attempt,
      workflow_contract:
        attempt.provider_kind === 'temporal'
          ? buildTemporalStageAttemptWorkflowContract()
          : null,
      workflow_input:
        attempt.provider_kind === 'temporal'
          ? buildTemporalStageAttemptWorkflowInput(attempt)
          : null,
      codex_stage_activity: buildCodexStageActivityInput({ attempt }),
      lifecycle_primitives: buildFamilyRuntimeLifecyclePrimitives({
        workspaceLocator: attempt.workspace_locator,
        artifactRefs: closeoutRefs,
      }),
      operator_visibility: {
        provider_kind: attempt.provider_kind,
        attempt_id: attempt.stage_attempt_id,
        stage_id: attempt.stage_id,
        status: attempt.status,
        provider_run: attempt.provider_run,
        activity_events: attempt.activity_events,
        heartbeat: {
          last_updated_at: attempt.updated_at,
          last_heartbeat_at: typeof attempt.provider_run.last_heartbeat_at === 'string'
            ? attempt.provider_run.last_heartbeat_at
            : null,
          checkpoint_refs: attempt.checkpoint_refs,
        },
        consumed_refs: Array.isArray(latestCloseout?.consumed_refs) ? latestCloseout.consumed_refs : [],
        consumed_memory_refs: Array.isArray(latestCloseout?.consumed_memory_refs)
          ? latestCloseout.consumed_memory_refs
          : [],
        writeback_receipt_refs: Array.isArray(latestCloseout?.writeback_receipt_refs)
          ? latestCloseout.writeback_receipt_refs
          : [],
        closeout_refs: attempt.closeout_refs,
        closeout_receipt_status: attempt.closeout_receipt_status,
        route_impact: attempt.route_impact,
        rejected_writes: Array.isArray(latestCloseout?.rejected_writes) ? latestCloseout.rejected_writes : [],
        next_owner: typeof latestCloseout?.next_owner === 'string' ? latestCloseout.next_owner : null,
        human_gate_refs: attempt.human_gate_refs,
        human_gate_ledger: humanGateLedger,
        user_instruction_ledger: userInstructionLedger,
        resume_ledger: resumeLedger,
        user_instructions: userInstructionLedger,
        resume_signals: resumeLedger,
        dead_letter: taskDeadLetterForAttempt(db, attempt),
        authority_boundary: {
          opl: 'attempt_control_metadata_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
      completion_boundary: {
        provider_completion: attempt.status === 'completed' ? 'completed' : 'not_completed',
        domain_ready_verdict:
          typeof latestCloseout?.domain_ready_verdict === 'string'
            ? latestCloseout.domain_ready_verdict
            : null,
        provider_completion_is_domain_ready: false,
      },
      signals: listStageAttemptSignals(db, stageAttemptId),
      closeouts,
    },
  };
}

export function updateStageAttemptsForTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    status: StageAttemptStatus;
    incrementAttempt?: boolean;
    checkpointRefs?: string[];
    closeoutRefs?: string[];
    humanGateRefs?: string[];
    blockedReason?: string | null;
    activityEvent?: Record<string, unknown>;
  },
) {
  const rows = db.prepare('SELECT * FROM stage_attempts WHERE task_id = ?').all(input.taskId) as StageAttemptRow[];
  if (rows.length === 0) {
    return [];
  }
  const updatedAt = nowIso();
  const attempts = rows.map((row) => {
    const status = input.status === 'completed' ? 'checkpointed' : input.status;
    const checkpointRefs = input.checkpointRefs ?? parseJsonList(row.checkpoint_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const closeoutRefs = input.closeoutRefs ?? parseJsonList(row.closeout_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const humanGateRefs = input.humanGateRefs ?? parseJsonList(row.human_gate_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const providerRun = {
      ...parseJsonObject(row.provider_run_json),
      provider_status: status,
      last_heartbeat_at: updatedAt,
    };
    const activityEvents = input.activityEvent
      ? appendActivityEventToRow(row, input.activityEvent)
      : parseJsonList(row.activity_events_json);
    const closeoutReceiptStatus = input.status === 'completed' && closeoutRefs.length > 0
      ? 'domain_sidecar_receipt_ref_only'
      : null;
    db.prepare(`
      UPDATE stage_attempts
      SET status = ?, attempt_count = ?, checkpoint_refs_json = ?, closeout_refs_json = ?,
        human_gate_refs_json = ?, blocked_reason = ?, provider_run_json = ?, activity_events_json = ?,
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
      closeoutReceiptStatus,
      closeoutReceiptStatus,
      updatedAt,
      row.stage_attempt_id,
    );
    return inspectStageAttempt(db, row.stage_attempt_id);
  });
  return attempts;
}

export function stageAttemptSummary(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count FROM stage_attempts GROUP BY status ORDER BY status
  `).all() as Array<{ status: StageAttemptStatus; count: number }>;
  return {
    total: rows.reduce((sum, row) => sum + row.count, 0),
    by_status: Object.fromEntries(rows.map((row) => [row.status, row.count])),
  };
}
