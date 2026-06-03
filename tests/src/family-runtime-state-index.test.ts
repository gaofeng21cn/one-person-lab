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
