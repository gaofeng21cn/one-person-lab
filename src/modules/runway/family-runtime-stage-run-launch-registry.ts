import type { DatabaseSync } from 'node:sqlite';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  requireTemporalStageRunWorkflowInputLaunchable,
  type TemporalStageRunWorkflowInput,
} from './family-runtime-temporal.ts';

export type StageRunLaunchStatus = 'registered' | 'start_failed' | 'started' | 'closed';

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
  created_at: string;
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
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
    version: 'opl-stage-run-launch-registry-entry.v1',
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
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(domain_id, stage_id, stage_run_invocation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_stage_run_launches_invocation
      ON stage_run_launches(domain_id, stage_id, stage_run_invocation_id);
    CREATE INDEX IF NOT EXISTS idx_stage_run_launches_status
      ON stage_run_launches(launch_status, updated_at);
  `);
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

export function registerStageRunLaunch(
  db: DatabaseSync,
  input: TemporalStageRunWorkflowInput,
) {
  const stageRunInput = requireTemporalStageRunWorkflowInputLaunchable(input);
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

export function recordStageRunTemporalStart(
  db: DatabaseSync,
  input: { stageRunId: string; temporalStartReceipt: Record<string, unknown> },
) {
  const updatedAt = nowIso();
  const result = db.prepare(`
    UPDATE stage_run_launches
    SET launch_status = CASE WHEN launch_status = 'closed' THEN 'closed' ELSE 'started' END,
        temporal_start_receipt_json = ?,
        terminal_status = CASE WHEN launch_status = 'closed' THEN terminal_status ELSE NULL END,
        last_start_error = NULL, updated_at = ?
    WHERE stage_run_id = ?
  `).run(canonicalJsonText(input.temporalStartReceipt), updatedAt, input.stageRunId);
  if (result.changes !== 1) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun start cannot be recorded before launch registration.',
      { stage_run_id: input.stageRunId },
    );
  }
  return inspectStageRunLaunch(db, input.stageRunId);
}

export function recordStageRunStartFailure(
  db: DatabaseSync,
  input: { stageRunId: string; error: unknown },
) {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  db.prepare(`
    UPDATE stage_run_launches
    SET launch_status = 'start_failed', last_start_error = ?, updated_at = ?
    WHERE stage_run_id = ? AND launch_status != 'closed'
  `).run(message, nowIso(), input.stageRunId);
  return inspectStageRunLaunch(db, input.stageRunId);
}

export function recordStageRunClosed(
  db: DatabaseSync,
  input: { stageRunId: string; terminalStatus: string },
) {
  const result = db.prepare(`
    UPDATE stage_run_launches
    SET launch_status = 'closed', terminal_status = ?, last_start_error = NULL, updated_at = ?
    WHERE stage_run_id = ?
  `).run(input.terminalStatus, nowIso(), input.stageRunId);
  return result.changes === 1 ? inspectStageRunLaunch(db, input.stageRunId) : null;
}
