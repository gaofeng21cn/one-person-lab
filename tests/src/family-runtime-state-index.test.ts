import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

import { runCli } from './cli/helpers-parts/runner.ts';

function withTempState<T>(fn: (root: string) => T) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-index-'));
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function tableNames(dbPath: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return (db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `).all() as Array<{ name: string }>).map((row) => row.name);
  } finally {
    db.close();
  }
}

function tableCount(dbPath: string, table: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return (db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
  } finally {
    db.close();
  }
}

function tableValue<T>(dbPath: string, query: string) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return db.prepare(query).get() as T;
  } finally {
    db.close();
  }
}

function writeJson(file: string, payload: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
}

test('opl index rebuild materializes refs-only SQLite sidecar databases', () => {
  withTempState((root) => {
    const rebuilt = runCli(['index', 'rebuild', '--domain', 'medautoscience'], { OPL_STATE_DIR: root });
    const index = rebuilt.state_index;

    assert.equal(index.surface_kind, 'opl_state_index_kernel');
    assert.equal(index.action, 'rebuild');
    assert.equal(index.status, 'ready');
    assert.equal(index.summary.database_count, 4);
    assert.equal(index.summary.ready_database_count, 4);
    assert.equal(index.authority_boundary.sqlite_sidecar_source_of_truth, false);
    assert.equal(index.authority_boundary.stores_artifact_body, false);
    assert.equal(index.authority_boundary.sqlite_record_counts_as_stage_complete, false);

    const runtimeRoot = path.join(root, 'family-runtime');
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'queue.sqlite')), true);
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'lifecycle-index.sqlite')), true);
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'artifact-index.sqlite')), true);
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'read-model.sqlite')), true);
    assert.equal(tableNames(path.join(runtimeRoot, 'artifact-index.sqlite')).includes('artifact_refs'), true);
    assert.equal(tableNames(path.join(runtimeRoot, 'read-model.sqlite')).includes('owner_route_index'), true);
    assert.equal(index.stage_artifact_projection.scanned_attempt_count, 0);
  });
});

test('opl index rebuild projects Stage Folder refs into artifact and read-model sidecars', () => {
  withTempState((root) => {
    const opened = runCli(
      [
        'stage',
        'open',
        '--domain',
        'redcube_ai',
        '--program',
        'program-a',
        '--topic',
        'topic-a',
        '--deliverable',
        'deck-a',
        '--stage',
        'artifact_creation',
        '--stage-order',
        '4',
        '--attempt',
        'attempt-a',
      ],
      { OPL_STATE_DIR: root },
    ).stage_artifact_runtime as {
      attempt_workspace: { outputs_dir: string; receipts_dir: string };
    };
    fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'deck.png'), 'png');
    writeJson(path.join(opened.attempt_workspace.receipts_dir, 'owner.json'), {
      receipt_ref: 'rca-owner-receipt:deck-a',
    });
    runCli(
      [
        'stage',
        'commit',
        '--domain',
        'redcube_ai',
        '--program',
        'program-a',
        '--topic',
        'topic-a',
        '--deliverable',
        'deck-a',
        '--stage',
        'artifact_creation',
        '--attempt',
        'attempt-a',
        '--terminal-status',
        'success',
        '--required-output',
        'deck.png',
        '--owner-receipt-ref',
        'rca-owner-receipt:deck-a',
      ],
      { OPL_STATE_DIR: root },
    );

    const rebuilt = runCli(['index', 'rebuild', '--domain', 'redcube_ai'], { OPL_STATE_DIR: root }).state_index;
    const runtimeRoot = path.join(root, 'family-runtime');
    const artifactDb = path.join(runtimeRoot, 'artifact-index.sqlite');
    const readModelDb = path.join(runtimeRoot, 'read-model.sqlite');

    assert.equal(rebuilt.status, 'ready');
    assert.equal(rebuilt.stage_artifact_projection.scanned_attempt_count, 1);
    assert.equal(rebuilt.stage_artifact_projection.scanned_deliverable_count, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.manifest_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.artifact_ref_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.receipt_ref_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.operator_read_model_rows.artifact_drilldown_rows, 1);
    assert.equal(tableCount(artifactDb, 'manifest_index'), 1);
    assert.equal(tableCount(artifactDb, 'artifact_refs'), 1);
    assert.equal(tableCount(artifactDb, 'receipt_refs'), 1);
    assert.equal(tableCount(readModelDb, 'artifact_drilldown'), 1);
    assert.equal(tableCount(readModelDb, 'owner_route_index'), 1);

    const manifestRow = tableValue<{ domain_id: string; stage_id: string; receipt_ref: string }>(
      artifactDb,
      'SELECT domain_id, stage_id, receipt_ref FROM manifest_index',
    );
    assert.deepEqual({ ...manifestRow }, {
      domain_id: 'redcube_ai',
      stage_id: 'artifact_creation',
      receipt_ref: 'rca-owner-receipt:deck-a',
    });
    const artifactRow = tableValue<{ locator_json: string }>(artifactDb, 'SELECT locator_json FROM artifact_refs');
    assert.equal(JSON.parse(artifactRow.locator_json).output_ref_kind, 'physical_file_ref');
    const drilldownRow = tableValue<{ drilldown_json_ref: string }>(
      readModelDb,
      'SELECT drilldown_json_ref FROM artifact_drilldown',
    );
    assert.equal(JSON.parse(drilldownRow.drilldown_json_ref).artifact_body_access, false);
  });
});

test('opl index rebuild projects medautoscience Stage Folder refs with normalized domain filter', () => {
  withTempState((root) => {
    const opened = runCli(
      [
        'stage',
        'open',
        '--domain',
        'medautoscience',
        '--program',
        'state-index-canary',
        '--topic',
        'dm-cvd',
        '--deliverable',
        'dm002-runtime-state-index',
        '--stage',
        'runtime_storage_refs',
        '--stage-order',
        '1',
        '--attempt',
        'canary-2026-06-04',
      ],
      { OPL_STATE_DIR: root },
    ).stage_artifact_runtime as {
      attempt_workspace: { outputs_dir: string; receipts_dir: string };
    };
    fs.writeFileSync(path.join(opened.attempt_workspace.outputs_dir, 'restore_proof_canary.json'), '{}');
    writeJson(path.join(opened.attempt_workspace.receipts_dir, 'mas-owner.json'), {
      receipt_ref: 'mas-runtime-storage-restore-proof-canary:dm002:20260604T015617Z',
    });
    runCli(
      [
        'stage',
        'commit',
        '--domain',
        'medautoscience',
        '--program',
        'state-index-canary',
        '--topic',
        'dm-cvd',
        '--deliverable',
        'dm002-runtime-state-index',
        '--stage',
        'runtime_storage_refs',
        '--attempt',
        'canary-2026-06-04',
        '--terminal-status',
        'success',
        '--required-output',
        'restore_proof_canary.json',
        '--owner-receipt-ref',
        'mas-runtime-storage-restore-proof-canary:dm002:20260604T015617Z',
      ],
      { OPL_STATE_DIR: root },
    );

    const rebuilt = runCli(['index', 'rebuild', '--domain', 'med-autoscience'], { OPL_STATE_DIR: root }).state_index;
    const runtimeRoot = path.join(root, 'family-runtime');
    const artifactDb = path.join(runtimeRoot, 'artifact-index.sqlite');
    const readModelDb = path.join(runtimeRoot, 'read-model.sqlite');

    assert.equal(rebuilt.status, 'ready');
    assert.equal(rebuilt.stage_artifact_projection.filtered_domain_id, 'med-autoscience');
    assert.equal(rebuilt.stage_artifact_projection.scanned_attempt_count, 1);
    assert.equal(rebuilt.stage_artifact_projection.scanned_deliverable_count, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.current_pointer_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.manifest_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.artifact_ref_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.artifact_index_rows.receipt_ref_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.operator_read_model_rows.artifact_drilldown_rows, 1);
    assert.equal(rebuilt.stage_artifact_projection.operator_read_model_rows.owner_route_rows, 1);
    assert.equal(tableCount(artifactDb, 'manifest_index'), 1);
    assert.equal(tableCount(artifactDb, 'stage_current_pointers'), 1);
    assert.equal(tableCount(readModelDb, 'owner_route_index'), 1);

    const currentPointerRow = tableValue<{ payload_ref_json: string }>(
      artifactDb,
      'SELECT payload_ref_json FROM stage_current_pointers',
    );
    const currentPointerPayload = JSON.parse(currentPointerRow.payload_ref_json);
    assert.equal(
      currentPointerPayload.pointer_role,
      'artifact_attempt_pointer_not_stage_run_current_pointer',
    );
    assert.equal(currentPointerPayload.stage_run_current_pointer, false);
    assert.equal(currentPointerPayload.stage_run_terminal_state, false);
    assert.equal(currentPointerPayload.current_owner_delta, false);
    const ownerRouteRow = tableValue<{ route_json_ref: string }>(
      readModelDb,
      'SELECT route_json_ref FROM owner_route_index',
    );
    const ownerRoutePayload = JSON.parse(ownerRouteRow.route_json_ref);
    assert.equal(
      ownerRoutePayload.pointer_role,
      'artifact_attempt_pointer_not_stage_run_current_pointer',
    );
    assert.equal(ownerRoutePayload.stage_run_current_pointer, false);
    assert.equal(ownerRoutePayload.stage_run_terminal_state, false);
    assert.equal(ownerRoutePayload.current_owner_delta, false);

    const manifestRow = tableValue<{ domain_id: string; stage_id: string; receipt_ref: string }>(
      artifactDb,
      'SELECT domain_id, stage_id, receipt_ref FROM manifest_index',
    );
    assert.deepEqual({ ...manifestRow }, {
      domain_id: 'medautoscience',
      stage_id: 'runtime_storage_refs',
      receipt_ref: 'mas-runtime-storage-restore-proof-canary:dm002:20260604T015617Z',
    });
  });
});

test('opl index doctor reports missing sidecar databases before rebuild', () => {
  withTempState((root) => {
    const doctor = runCli(['index', 'doctor'], { OPL_STATE_DIR: root }).state_index;

    assert.equal(doctor.action, 'doctor');
    assert.equal(doctor.status, 'degraded');
    assert.equal(doctor.summary.missing_database_count, 4);
    assert.equal(doctor.summary.maintenance_run_ref, null);
    assert.deepEqual(
      doctor.databases.map((database: { status: string }) => database.status),
      ['missing', 'missing', 'missing', 'missing'],
    );
  });
});

test('opl index checkpoint integrity-check and backup maintain existing sidecar databases', () => {
  withTempState((root) => {
    runCli(['index', 'rebuild'], { OPL_STATE_DIR: root });

    const checkpoint = runCli(['index', 'checkpoint'], { OPL_STATE_DIR: root }).state_index;
    assert.equal(checkpoint.status, 'ready');
    assert.equal(checkpoint.checkpoint_results.length, 4);
    assert.equal(checkpoint.summary.maintenance_run_ref.startsWith('opl-state-index-maintenance:checkpoint:'), true);

    const integrity = runCli(['index', 'integrity-check'], { OPL_STATE_DIR: root }).state_index;
    assert.equal(integrity.status, 'ready');
    assert.deepEqual(
      integrity.databases.map((database: { integrity_check: string }) => database.integrity_check),
      ['ok', 'ok', 'ok', 'ok'],
    );

    const backup = runCli(['index', 'backup'], { OPL_STATE_DIR: root }).state_index.backup;
    assert.equal(backup.files.length, 4);
    assert.equal(fs.existsSync(backup.backup_root), true);
    assert.equal(backup.files.every((file: { backup_path: string }) => fs.existsSync(file.backup_path)), true);
  });
});
