import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  requireTemporalStageRunWorkflowInputLaunchable,
  type TemporalStageRunWorkflowInput,
} from './family-runtime-temporal.ts';

export type StageRunLaunchStatus = 'registered' | 'starting' | 'start_failed' | 'started' | 'closed';

export const DEFAULT_STAGE_RUN_START_LEASE_MS = 30_000;

type StageRunLaunchRow = {
  stage_run_id: string;
  stage_run_invocation_id: string;
  stage_run_spec_sha256: string;
  domain_id: string;
  stage_id: string;
  workflow_id: string;
  parent_route_decision_ref: string | null;
  stage_run_input_json: string;
  launch_status: StageRunLaunchStatus;
  temporal_start_receipt_json: string | null;
  terminal_status: string | null;
  last_start_error: string | null;
  start_claim_token: string | null;
  start_claimed_at: string | null;
  start_lease_expires_at: string | null;
  start_attempt_count: number;
  created_at: string;
  updated_at: string;
};

function nowIso(now?: Date) {
  return (now ?? new Date()).toISOString();
}

function parseObject(value: string | null) {
  if (!value) return null;
  const parsed = parseJsonText(value);
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : null;
}

function rowPayload(row: StageRunLaunchRow) {
  return {
    surface_kind: 'opl_stage_run_launch_registry_entry',
    version: 'opl-stage-run-launch-registry-entry.v2',
    stage_run_id: row.stage_run_id,
    stage_run_invocation_id: row.stage_run_invocation_id,
    stage_run_spec_sha256: row.stage_run_spec_sha256,
    domain_id: row.domain_id,
    stage_id: row.stage_id,
    workflow_id: row.workflow_id,
    parent_route_decision_ref: row.parent_route_decision_ref,
    stage_run_input: parseObject(row.stage_run_input_json) as TemporalStageRunWorkflowInput,
    launch_status: row.launch_status,
    temporal_start_receipt: parseObject(row.temporal_start_receipt_json),
    terminal_status: row.terminal_status,
    last_start_error: row.last_start_error,
    start_claim: row.start_claim_token
      ? {
          token: row.start_claim_token,
          claimed_at: row.start_claimed_at,
          lease_expires_at: row.start_lease_expires_at,
          attempt_count: row.start_attempt_count,
        }
      : null,
    start_attempt_count: row.start_attempt_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
    authority_boundary: {
      opl: 'durable_stage_run_launch_identity_and_transport_recovery_only',
      domain: 'stage_semantics_truth_quality_artifact_and_route_judgment_owner',
      sqlite_is_domain_truth: false,
    },
  } as const;
}

export function createStageRunLaunchTable(db: DatabaseSync) {
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS stage_run_launches (
      stage_run_id TEXT PRIMARY KEY,
      stage_run_invocation_id TEXT NOT NULL,
      stage_run_spec_sha256 TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL UNIQUE,
      parent_route_decision_ref TEXT,
      stage_run_input_json TEXT NOT NULL,
      launch_status TEXT NOT NULL,
      temporal_start_receipt_json TEXT,
      terminal_status TEXT,
      last_start_error TEXT,
      start_claim_token TEXT,
      start_claimed_at TEXT,
      start_lease_expires_at TEXT,
      start_attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(domain_id, stage_id, stage_run_invocation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_stage_run_launches_invocation
      ON stage_run_launches(domain_id, stage_id, stage_run_invocation_id);
    CREATE INDEX IF NOT EXISTS idx_stage_run_launches_status
      ON stage_run_launches(launch_status, updated_at);
  `);
  const columns = new Set((db.prepare('PRAGMA table_info(stage_run_launches)').all() as Array<{ name: string }>)
    .map((entry) => entry.name));
  for (const [column, definition] of [
    ['start_claim_token', 'TEXT'],
    ['start_claimed_at', 'TEXT'],
    ['start_lease_expires_at', 'TEXT'],
    ['start_attempt_count', 'INTEGER NOT NULL DEFAULT 0'],
  ] as const) {
    if (!columns.has(column)) db.exec(`ALTER TABLE stage_run_launches ADD COLUMN ${column} ${definition}`);
  }
}

function launchRow(db: DatabaseSync, stageRunId: string) {
  return db.prepare('SELECT * FROM stage_run_launches WHERE stage_run_id = ?')
    .get(stageRunId) as StageRunLaunchRow | undefined;
}

export function inspectStageRunLaunch(db: DatabaseSync, stageRunId: string) {
  const row = launchRow(db, stageRunId);
  if (!row) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun launch is not registered.',
      { stage_run_id: stageRunId },
    );
  }
  return rowPayload(row);
}

export function findStageRunLaunch(db: DatabaseSync, stageRunId: string) {
  createStageRunLaunchTable(db);
  const row = launchRow(db, stageRunId);
  return row ? rowPayload(row) : null;
}

export function registerStageRunLaunch(
  db: DatabaseSync,
  input: TemporalStageRunWorkflowInput,
) {
  const stageRunInput = requireTemporalStageRunWorkflowInputLaunchable(input, {
    revalidateContent: 'historical_evidence',
  });
  createStageRunLaunchTable(db);
  const canonicalInput = canonicalJsonText(stageRunInput);
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare(`
      SELECT * FROM stage_run_launches
      WHERE domain_id = ? AND stage_id = ? AND stage_run_invocation_id = ?
    `).get(
      stageRunInput.domain_id,
      stageRunInput.stage_id,
      stageRunInput.stage_run_invocation_id,
    ) as StageRunLaunchRow | undefined;
    if (existing) {
      if (
        existing.stage_run_id !== stageRunInput.stage_run_id
        || existing.stage_run_spec_sha256 !== stageRunInput.stage_run_spec_sha256
      ) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'StageRun invocation is already bound to a different immutable spec.',
          {
            failure_code: 'stage_run_invocation_spec_conflict',
            domain_id: stageRunInput.domain_id,
            stage_id: stageRunInput.stage_id,
            stage_run_invocation_id: stageRunInput.stage_run_invocation_id,
            existing_stage_run_id: existing.stage_run_id,
            received_stage_run_id: stageRunInput.stage_run_id,
            existing_stage_run_spec_sha256: existing.stage_run_spec_sha256,
            received_stage_run_spec_sha256: stageRunInput.stage_run_spec_sha256,
          },
        );
      }
      db.exec('COMMIT');
      return {
        registered: false,
        idempotent_replay: true,
        launch: rowPayload(existing),
      } as const;
    }
    requireTemporalStageRunWorkflowInputLaunchable(stageRunInput);
    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO stage_run_launches (
        stage_run_id, stage_run_invocation_id, stage_run_spec_sha256,
        domain_id, stage_id, workflow_id, parent_route_decision_ref,
        stage_run_input_json, launch_status, temporal_start_receipt_json,
        terminal_status, last_start_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'registered', NULL, NULL, NULL, ?, ?)
    `).run(
      stageRunInput.stage_run_id,
      stageRunInput.stage_run_invocation_id,
      stageRunInput.stage_run_spec_sha256,
      stageRunInput.domain_id,
      stageRunInput.stage_id,
      stageRunInput.workflow_id,
      stageRunInput.parent_route_decision_ref ?? null,
      canonicalInput,
      createdAt,
      createdAt,
    );
    const row = launchRow(db, stageRunInput.stage_run_id)!;
    db.exec('COMMIT');
    return {
      registered: true,
      idempotent_replay: false,
      launch: rowPayload(row),
    } as const;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function validLeaseMs(value: number | undefined) {
  if (value === undefined) return DEFAULT_STAGE_RUN_START_LEASE_MS;
  if (!Number.isSafeInteger(value) || value < 1 || value > 5 * 60_000) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'StageRun start claim lease must be an integer between 1 ms and 5 minutes.',
      { lease_ms: value },
    );
  }
  return value;
}

function activeStartingLease(row: StageRunLaunchRow, now: Date) {
  if (row.launch_status !== 'starting' || !row.start_claim_token || !row.start_lease_expires_at) {
    return false;
  }
  const expiresAt = Date.parse(row.start_lease_expires_at);
  return Number.isFinite(expiresAt) && expiresAt > now.getTime();
}

export function claimStageRunStart(
  db: DatabaseSync,
  input: {
    stageRunId: string;
    now?: Date;
    leaseMs?: number;
    claimToken?: string;
  },
) {
  createStageRunLaunchTable(db);
  const now = input.now ?? new Date();
  const leaseMs = validLeaseMs(input.leaseMs);
  const claimToken = input.claimToken?.trim() || crypto.randomUUID();
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = launchRow(db, input.stageRunId);
    if (!existing) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun start cannot be claimed before launch registration.',
        { stage_run_id: input.stageRunId },
      );
    }
    if (existing.launch_status === 'started' || existing.launch_status === 'closed') {
      db.exec('COMMIT');
      return {
        claimed: false,
        claim_status: existing.launch_status,
        claim_token: null,
        launch: rowPayload(existing),
      } as const;
    }
    if (activeStartingLease(existing, now)) {
      db.exec('COMMIT');
      return {
        claimed: false,
        claim_status: 'active_starting' as const,
        claim_token: null,
        launch: rowPayload(existing),
      } as const;
    }
    const claimedAt = nowIso(now);
    const leaseExpiresAt = nowIso(new Date(now.getTime() + leaseMs));
    const result = db.prepare(`
      UPDATE stage_run_launches
      SET launch_status = 'starting',
          start_claim_token = ?,
          start_claimed_at = ?,
          start_lease_expires_at = ?,
          start_attempt_count = start_attempt_count + 1,
          last_start_error = NULL,
          updated_at = ?
      WHERE stage_run_id = ?
        AND launch_status IN ('registered', 'start_failed', 'starting')
    `).run(
      claimToken,
      claimedAt,
      leaseExpiresAt,
      claimedAt,
      input.stageRunId,
    );
    if (result.changes !== 1) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun start claim lost its compare-and-set race.',
        {
          failure_code: 'stage_run_start_claim_conflict',
          stage_run_id: input.stageRunId,
        },
      );
    }
    const claimed = launchRow(db, input.stageRunId)!;
    db.exec('COMMIT');
    return {
      claimed: true,
      claim_status: existing.launch_status === 'starting'
        ? 'stale_lease_takeover' as const
        : 'claimed' as const,
      claim_token: claimToken,
      launch: rowPayload(claimed),
    } as const;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function recordStageRunTemporalStart(
  db: DatabaseSync,
  input: {
    stageRunId: string;
    temporalStartReceipt: Record<string, unknown>;
    claimToken?: string | null;
    now?: Date;
  },
) {
  createStageRunLaunchTable(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = launchRow(db, input.stageRunId);
    if (!row) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun start cannot be recorded before launch registration.',
        { stage_run_id: input.stageRunId },
      );
    }
    const receipt = input.temporalStartReceipt;
    const workflowId = typeof receipt.workflow_id === 'string' ? receipt.workflow_id.trim() : '';
    const firstExecutionRunId = typeof receipt.first_execution_run_id === 'string'
      ? receipt.first_execution_run_id.trim()
      : '';
    const optionalIdentityMismatch = (
      (typeof receipt.stage_run_id === 'string' && receipt.stage_run_id !== row.stage_run_id)
      || (
        typeof receipt.stage_run_invocation_id === 'string'
        && receipt.stage_run_invocation_id !== row.stage_run_invocation_id
      )
      || (
        typeof receipt.stage_run_spec_sha256 === 'string'
        && receipt.stage_run_spec_sha256 !== row.stage_run_spec_sha256
      )
    );
    if (workflowId !== row.workflow_id || !firstExecutionRunId || optionalIdentityMismatch) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun start receipt does not bind the registered Run and first execution.',
        {
          failure_code: 'stage_run_temporal_start_receipt_identity_mismatch',
          stage_run_id: row.stage_run_id,
          expected_workflow_id: row.workflow_id,
          received_workflow_id: workflowId || null,
          first_execution_run_id: firstExecutionRunId || null,
        },
      );
    }
    const existingReceipt = parseObject(row.temporal_start_receipt_json);
    const existingFirstExecutionRunId = existingReceipt
      && typeof existingReceipt.first_execution_run_id === 'string'
      ? existingReceipt.first_execution_run_id
      : null;
    if (
      (row.launch_status === 'started' || row.launch_status === 'closed')
      && existingFirstExecutionRunId
      && existingFirstExecutionRunId !== firstExecutionRunId
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'One StageRun workflow id cannot bind two Temporal first executions.',
        {
          failure_code: 'stage_run_temporal_execution_identity_conflict',
          stage_run_id: row.stage_run_id,
          existing_first_execution_run_id: existingFirstExecutionRunId,
          received_first_execution_run_id: firstExecutionRunId,
        },
      );
    }
    if (row.launch_status === 'closed' || row.launch_status === 'started') {
      db.exec('COMMIT');
      return rowPayload(row);
    }
    db.prepare(`
      UPDATE stage_run_launches
      SET launch_status = 'started',
          temporal_start_receipt_json = ?,
          terminal_status = NULL,
          last_start_error = NULL,
          start_claim_token = NULL,
          start_claimed_at = NULL,
          start_lease_expires_at = NULL,
          updated_at = ?
      WHERE stage_run_id = ? AND launch_status IN ('registered', 'starting', 'start_failed')
    `).run(canonicalJsonText(receipt), nowIso(input.now), input.stageRunId);
    const updated = launchRow(db, input.stageRunId)!;
    db.exec('COMMIT');
    return rowPayload(updated);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function recordStageRunStartFailure(
  db: DatabaseSync,
  input: { stageRunId: string; claimToken: string; error: unknown; now?: Date },
) {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  db.prepare(`
    UPDATE stage_run_launches
    SET launch_status = 'start_failed',
        last_start_error = ?,
        start_claim_token = NULL,
        start_claimed_at = NULL,
        start_lease_expires_at = NULL,
        updated_at = ?
    WHERE stage_run_id = ?
      AND launch_status = 'starting'
      AND start_claim_token = ?
  `).run(message, nowIso(input.now), input.stageRunId, input.claimToken);
  return inspectStageRunLaunch(db, input.stageRunId);
}

export function recordStageRunClosed(
  db: DatabaseSync,
  input: { stageRunId: string; terminalStatus: string; now?: Date },
) {
  const terminalStatus = input.terminalStatus.trim().toLowerCase();
  if (!terminalStatus) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Closed StageRun launch requires a terminal Temporal status.',
      { stage_run_id: input.stageRunId },
    );
  }
  createStageRunLaunchTable(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const row = launchRow(db, input.stageRunId);
    if (!row) {
      db.exec('COMMIT');
      return null;
    }
    if (row.launch_status === 'closed') {
      if (row.terminal_status && row.terminal_status !== terminalStatus) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Closed StageRun launch cannot change its terminal status.',
          {
            failure_code: 'stage_run_terminal_status_conflict',
            stage_run_id: input.stageRunId,
            existing_terminal_status: row.terminal_status,
            received_terminal_status: terminalStatus,
          },
        );
      }
      db.exec('COMMIT');
      return rowPayload(row);
    }
    if (row.launch_status !== 'started') {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun can close only after its Temporal execution identity is recorded.',
        {
          failure_code: 'stage_run_close_before_start_receipt',
          stage_run_id: input.stageRunId,
          launch_status: row.launch_status,
        },
      );
    }
    const result = db.prepare(`
      UPDATE stage_run_launches
      SET launch_status = 'closed',
          terminal_status = ?,
          last_start_error = NULL,
          start_claim_token = NULL,
          start_claimed_at = NULL,
          start_lease_expires_at = NULL,
          updated_at = ?
      WHERE stage_run_id = ? AND launch_status = 'started'
    `).run(terminalStatus, nowIso(input.now), input.stageRunId);
    if (result.changes !== 1) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'StageRun terminal close lost its compare-and-set transition.',
        {
          failure_code: 'stage_run_terminal_close_conflict',
          stage_run_id: input.stageRunId,
        },
      );
    }
    const closed = launchRow(db, input.stageRunId)!;
    db.exec('COMMIT');
    return rowPayload(closed);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
