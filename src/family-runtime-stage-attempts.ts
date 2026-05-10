import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { GatewayContractError } from './contracts.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-command.ts';
import {
  buildStageAttemptProviderReceipt,
  resolveFamilyRuntimeProviderKind,
  type FamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';

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
};

type StageAttemptRow = {
  stage_attempt_id: string;
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
  created_at: string;
  updated_at: string;
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
    throw new GatewayContractError('cli_usage_error', 'Stage attempt requires a non-empty stage id.', {
      required: ['--stage'],
    });
  }
  return normalized;
}

function normalizeJsonList(value?: string[]) {
  return Array.isArray(value) ? value.filter((entry) => entry.trim()).map((entry) => entry.trim()) : [];
}

export function createStageAttemptTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stage_attempts (
      stage_attempt_id TEXT PRIMARY KEY,
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_domain_stage ON stage_attempts(domain_id, stage_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_task_id ON stage_attempts(task_id);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_status ON stage_attempts(status, updated_at);
  `);
}

export function stageAttemptToPayload(row: StageAttemptRow) {
  return {
    stage_attempt_id: row.stage_attempt_id,
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
  const row = {
    stage_attempt_id: stageAttemptId,
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
    task_id: input.taskId?.trim() || null,
    blocked_reason: input.blockedReason?.trim() || null,
    provider_receipt_json: JSON.stringify(providerReceipt),
    created_at: createdAt,
    updated_at: createdAt,
  };
  db.prepare(`
    INSERT INTO stage_attempts(
      stage_attempt_id, provider_kind, workflow_id, domain_id, stage_id, workspace_locator_json,
      source_fingerprint, executor_kind, status, checkpoint_refs_json, closeout_refs_json,
      human_gate_refs_json, retry_budget_json, attempt_count, task_id, blocked_reason,
      provider_receipt_json, created_at, updated_at
    )
    VALUES (
      @stage_attempt_id, @provider_kind, @workflow_id, @domain_id, @stage_id, @workspace_locator_json,
      @source_fingerprint, @executor_kind, @status, @checkpoint_refs_json, @closeout_refs_json,
      @human_gate_refs_json, @retry_budget_json, @attempt_count, @task_id, @blocked_reason,
      @provider_receipt_json, @created_at, @updated_at
    )
  `).run(row);
  return stageAttemptToPayload(row as StageAttemptRow);
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
    throw new GatewayContractError('cli_usage_error', 'Family runtime stage attempt not found.', {
      stage_attempt_id: stageAttemptId,
    });
  }
  return stageAttemptToPayload(row);
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
  },
) {
  const rows = db.prepare('SELECT * FROM stage_attempts WHERE task_id = ?').all(input.taskId) as StageAttemptRow[];
  if (rows.length === 0) {
    return [];
  }
  const updatedAt = nowIso();
  const attempts = rows.map((row) => {
    const checkpointRefs = input.checkpointRefs ?? parseJsonList(row.checkpoint_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const closeoutRefs = input.closeoutRefs ?? parseJsonList(row.closeout_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const humanGateRefs = input.humanGateRefs ?? parseJsonList(row.human_gate_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    db.prepare(`
      UPDATE stage_attempts
      SET status = ?, attempt_count = ?, checkpoint_refs_json = ?, closeout_refs_json = ?,
        human_gate_refs_json = ?, blocked_reason = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      input.status,
      input.incrementAttempt ? row.attempt_count + 1 : row.attempt_count,
      JSON.stringify(checkpointRefs),
      JSON.stringify(closeoutRefs),
      JSON.stringify(humanGateRefs),
      input.blockedReason === undefined ? row.blocked_reason : input.blockedReason,
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
