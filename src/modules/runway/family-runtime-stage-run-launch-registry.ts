import type { DatabaseSync } from 'node:sqlite';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  requireTemporalStageRunWorkflowInputLaunchable,
  type TemporalStageRunWorkflowInput,
} from './family-runtime-temporal.ts';
import { verifyStageRunImmutableContentBindingsAtUse } from './family-runtime-stage-run-identity.ts';

export type StageRunLaunchStatus =
  | 'registered'
  | 'starting'
  | 'start_failed'
  | 'started'
  | 'closed';

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

function temporalExecutionIdentity(
  receipt: Record<string, unknown>,
  expected: Pick<StageRunLaunchRow,
    | 'stage_run_id'
    | 'stage_run_invocation_id'
    | 'stage_run_spec_sha256'
    | 'workflow_id'>,
) {
  const workflowId = typeof receipt.workflow_id === 'string' && receipt.workflow_id.trim()
    ? receipt.workflow_id.trim()
    : null;
  const receivedIdentity = {
    stage_run_id: typeof receipt.stage_run_id === 'string' ? receipt.stage_run_id.trim() : null,
    stage_run_invocation_id: typeof receipt.stage_run_invocation_id === 'string'
      ? receipt.stage_run_invocation_id.trim()
      : null,
    stage_run_spec_sha256: typeof receipt.stage_run_spec_sha256 === 'string'
      ? receipt.stage_run_spec_sha256.trim()
      : null,
    workflow_id: workflowId,
  };
  const expectedIdentity = {
    stage_run_id: expected.stage_run_id,
    stage_run_invocation_id: expected.stage_run_invocation_id,
    stage_run_spec_sha256: expected.stage_run_spec_sha256,
    workflow_id: expected.workflow_id,
  };
  if (canonicalJsonText(receivedIdentity) !== canonicalJsonText(expectedIdentity)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun start receipt must bind the registered Run, invocation, spec, and workflow.',
      {
        failure_code: 'stage_run_temporal_receipt_identity_mismatch',
        expected_identity: expectedIdentity,
        received_identity: receivedIdentity,
      },
    );
  }
  const firstExecutionRunId = typeof receipt.first_execution_run_id === 'string'
    && receipt.first_execution_run_id.trim()
    ? receipt.first_execution_run_id.trim()
    : null;
  if (!firstExecutionRunId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Temporal StageRun start receipt must bind the first execution run id.',
      {
        failure_code: 'stage_run_temporal_execution_run_id_missing',
        workflow_id: expected.workflow_id,
      },
    );
  }
  return { workflow_id: workflowId, first_execution_run_id: firstExecutionRunId };
}

function requireSameTemporalExecution(input: {
  existingReceipt: Record<string, unknown>;
  receivedReceipt: Record<string, unknown>;
  expected: StageRunLaunchRow;
}) {
  const existing = temporalExecutionIdentity(input.existingReceipt, input.expected);
  const received = temporalExecutionIdentity(input.receivedReceipt, input.expected);
  if (existing.first_execution_run_id !== received.first_execution_run_id) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'One StageRun launch cannot be rebound to a different Temporal execution.',
      {
        failure_code: 'stage_run_temporal_execution_identity_conflict',
        workflow_id: input.expected.workflow_id,
        existing_first_execution_run_id: existing.first_execution_run_id,
        received_first_execution_run_id: received.first_execution_run_id,
      },
    );
  }
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
  verifyStageRunImmutableContentBindingsAtUse(
    stageRunInput.stage_run_spec,
    stageRunInput.domain_pack_root,
  );
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
      const persistedInput = parseObject(existing.stage_run_input_json) as TemporalStageRunWorkflowInput;
      const refreshedInput = {
        ...persistedInput,
        workspace_locator: stageRunInput.workspace_locator,
        domain_pack_root: stageRunInput.domain_pack_root,
      };
      if (canonicalJsonText(refreshedInput) !== existing.stage_run_input_json) {
        db.prepare(`
          UPDATE stage_run_launches
          SET stage_run_input_json = ?, updated_at = ?
          WHERE stage_run_id = ?
        `).run(canonicalJsonText(refreshedInput), nowIso(), existing.stage_run_id);
      }
      const replay = launchRow(db, existing.stage_run_id)!;
      db.exec('COMMIT');
      return {
        registered: false,
        idempotent_replay: true,
        launch: rowPayload(replay),
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

export function claimStageRunStart(db: DatabaseSync, stageRunId: string) {
  createStageRunLaunchTable(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = launchRow(db, stageRunId);
    if (!existing) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun start cannot be claimed before launch registration.',
        { stage_run_id: stageRunId },
      );
    }
    if (existing.launch_status !== 'registered' && existing.launch_status !== 'start_failed') {
      db.exec('COMMIT');
      return {
        claimed: false,
        launch: rowPayload(existing),
      } as const;
    }
    const updated = db.prepare(`
      UPDATE stage_run_launches
      SET launch_status = 'starting', last_start_error = NULL, updated_at = ?
      WHERE stage_run_id = ? AND launch_status = ?
    `).run(nowIso(), stageRunId, existing.launch_status);
    if (updated.changes !== 1) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun start claim lost its compare-and-swap transition.',
        {
          failure_code: 'stage_run_start_claim_conflict',
          stage_run_id: stageRunId,
          expected_launch_status: existing.launch_status,
        },
      );
    }
    const claimed = launchRow(db, stageRunId)!;
    db.exec('COMMIT');
    return {
      claimed: true,
      launch: rowPayload(claimed),
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
  createStageRunLaunchTable(db);
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = launchRow(db, input.stageRunId);
    if (!existing) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun start cannot be recorded before launch registration.',
        { stage_run_id: input.stageRunId },
      );
    }
    temporalExecutionIdentity(input.temporalStartReceipt, existing);
    const existingReceipt = parseObject(existing.temporal_start_receipt_json);
    if (existingReceipt) {
      requireSameTemporalExecution({
        existingReceipt,
        receivedReceipt: input.temporalStartReceipt,
        expected: existing,
      });
    }
    if (!['starting', 'start_failed', 'started', 'closed'].includes(existing.launch_status)) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Temporal StageRun start receipt requires an accepted start intent.',
        {
          failure_code: 'stage_run_start_receipt_transition_invalid',
          stage_run_id: input.stageRunId,
          launch_status: existing.launch_status,
        },
      );
    }
    if (!existingReceipt) {
      db.prepare(`
        UPDATE stage_run_launches
        SET launch_status = CASE
              WHEN launch_status = 'closed' THEN 'closed'
              ELSE 'started'
            END,
            temporal_start_receipt_json = ?,
            terminal_status = CASE WHEN launch_status = 'closed' THEN terminal_status ELSE NULL END,
            last_start_error = CASE WHEN launch_status = 'closed' THEN last_start_error ELSE NULL END,
            updated_at = CASE WHEN launch_status = 'closed' THEN updated_at ELSE ? END
        WHERE stage_run_id = ?
      `).run(canonicalJsonText(input.temporalStartReceipt), nowIso(), input.stageRunId);
    } else if (existing.launch_status === 'starting' || existing.launch_status === 'start_failed') {
      db.prepare(`
        UPDATE stage_run_launches
        SET launch_status = 'started', terminal_status = NULL,
            last_start_error = NULL, updated_at = ?
        WHERE stage_run_id = ?
      `).run(nowIso(), input.stageRunId);
    }
    const persisted = launchRow(db, input.stageRunId)!;
    db.exec('COMMIT');
    return rowPayload(persisted);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function recordStageRunStartFailure(
  db: DatabaseSync,
  input: { stageRunId: string; error: unknown },
) {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  db.prepare(`
    UPDATE stage_run_launches
    SET launch_status = 'start_failed', last_start_error = ?, updated_at = ?
    WHERE stage_run_id = ? AND launch_status = 'starting'
  `).run(message, nowIso(), input.stageRunId);
  return inspectStageRunLaunch(db, input.stageRunId);
}

export function recordStageRunClosed(
  db: DatabaseSync,
  input: { stageRunId: string; terminalStatus: string },
) {
  const result = db.prepare(`
    UPDATE stage_run_launches
    SET launch_status = 'closed',
        terminal_status = CASE WHEN launch_status = 'closed' THEN terminal_status ELSE ? END,
        last_start_error = NULL,
        updated_at = CASE WHEN launch_status = 'closed' THEN updated_at ELSE ? END
    WHERE stage_run_id = ?
  `).run(input.terminalStatus, nowIso(), input.stageRunId);
  return result.changes === 1 ? inspectStageRunLaunch(db, input.stageRunId) : null;
}
