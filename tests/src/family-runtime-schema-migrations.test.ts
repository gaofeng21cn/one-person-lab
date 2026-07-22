import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';

import {
  createFamilyRuntimeQueueTables,
  QUEUE_SCHEMA_VERSION,
} from '../../src/modules/runway/family-runtime-store.ts';
import { openFamilyRuntimeSqlite } from '../../src/modules/runway/family-runtime-sqlite.ts';

function createLegacyQueue(pathToDb: string) {
  const db = new DatabaseSync(pathToDb);
  db.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta(key, value) VALUES ('schema_version', '3');
    CREATE TABLE stage_run_launches (
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
    CREATE TABLE stage_attempts (
      stage_attempt_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      provider_kind TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      workspace_locator_json TEXT NOT NULL,
      source_fingerprint TEXT,
      executor_kind TEXT NOT NULL,
      stage_attempt_executor_policy_json TEXT,
      stage_run_id TEXT,
      quality_cycle_id TEXT,
      attempt_role TEXT,
      quality_round_index INTEGER,
      parent_attempt_ref TEXT,
      input_artifact_refs_json TEXT NOT NULL DEFAULT '[]',
      reviewed_artifact_hashes_json TEXT NOT NULL DEFAULT '[]',
      quality_source_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_stage_goal_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_lineage_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_rubric_refs_json TEXT NOT NULL DEFAULT '[]',
      prior_finding_refs_json TEXT NOT NULL DEFAULT '[]',
      repair_map_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_context_json TEXT NOT NULL DEFAULT '{}',
      quality_role_prompt_ref TEXT,
      execution_session_ref TEXT,
      usage_observation_json TEXT,
      context_manifest_ref TEXT,
      context_manifest_json TEXT,
      no_context_inheritance INTEGER,
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
      archived_at TEXT,
      archived_reason TEXT,
      archived_source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const now = '2026-07-21T00:00:00.000Z';
  db.prepare(`
    INSERT INTO stage_run_launches(
      stage_run_id, stage_run_invocation_id, stage_run_spec_sha256, domain_id, stage_id,
      workflow_id, stage_run_input_json, launch_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'sr_legacy', 'sri_legacy', 'a'.repeat(64), 'medautoscience', 'baseline',
    'wf_legacy', '{}', 'started', now, now,
  );
  db.prepare(`
    INSERT INTO stage_attempts(
      stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id,
      workspace_locator_json, executor_kind, status, checkpoint_refs_json, closeout_refs_json,
      human_gate_refs_json, retry_budget_json, attempt_count, provider_receipt_json,
      provider_run_json, activity_events_json, route_impact_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'sat_legacy', 'idem_legacy', 'temporal', 'wf_attempt_legacy', 'medautoscience', 'baseline',
    JSON.stringify({ workspace_root: '/tmp/shared', study_id: 'study-001' }), 'codex_cli',
    'running', '[]', '[]', '[]', '{}', 1, '{}', '{}', '[]', '{}', now, now,
  );
  db.close();
}

function migrationWorker(dbPath: string) {
  const storeUrl = pathToFileURL(path.resolve('src/modules/runway/family-runtime-store.ts')).href;
  const sqliteUrl = pathToFileURL(path.resolve('src/modules/runway/family-runtime-sqlite.ts')).href;
  const source = [
    "import { parentPort, workerData } from 'node:worker_threads';",
    `import { createFamilyRuntimeQueueTables } from ${JSON.stringify(storeUrl)};`,
    `import { openFamilyRuntimeSqlite } from ${JSON.stringify(sqliteUrl)};`,
    'const db = openFamilyRuntimeSqlite(workerData.dbPath);',
    'try {',
    '  createFamilyRuntimeQueueTables(db);',
    '  parentPort.postMessage({ ok: true });',
    '} catch (error) {',
    '  parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });',
    '} finally { db.close(); }',
  ].join('\n');
  const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), {
    workerData: { dbPath },
  });
  return Promise.all([
    new Promise<Record<string, unknown>>((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    }),
    new Promise<void>((resolve, reject) => {
      worker.once('exit', (code) => code === 0
        ? resolve()
        : reject(new Error(`Migration worker exited with ${code}.`)));
    }),
  ]).then(([result]) => result);
}

test('queue schema expands legacy rows without inventing execution scope identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scope-migration-'));
  const dbPath = path.join(root, 'queue.sqlite');
  createLegacyQueue(dbPath);
  const db = openFamilyRuntimeSqlite(dbPath);
  try {
    createFamilyRuntimeQueueTables(db);
    createFamilyRuntimeQueueTables(db);
    const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
    assert.equal(version.value, String(QUEUE_SCHEMA_VERSION));
    const migration = db.prepare(`
      SELECT migration_name FROM family_runtime_schema_migrations WHERE schema_version = ?
    `).get(QUEUE_SCHEMA_VERSION) as { migration_name: string };
    assert.equal(migration.migration_name, 'execution_scope_expand_v4');
    const stageRun = db.prepare(`
      SELECT scope_kind, identity_state, execution_scope_json FROM stage_run_launches
      WHERE stage_run_id = 'sr_legacy'
    `).get() as Record<string, unknown>;
    const attempt = db.prepare(`
      SELECT scope_kind, identity_state, execution_scope_json FROM stage_attempts
      WHERE stage_attempt_id = 'sat_legacy'
    `).get() as Record<string, unknown>;
    assert.deepEqual({ ...stageRun }, {
      scope_kind: 'identity_unresolved',
      identity_state: 'identity_unresolved',
      execution_scope_json: null,
    });
    assert.deepEqual({ ...attempt }, { ...stageRun });
    assert.throws(() => db.prepare(`
      UPDATE stage_run_launches SET scope_digest = ? WHERE stage_run_id = 'sr_legacy'
    `).run(`sha256:${'f'.repeat(64)}`), /FOREIGN KEY constraint failed/u);
    const foreignKeyCheck = db.prepare('PRAGMA foreign_key_check').all();
    assert.deepEqual(foreignKeyCheck, []);
  } finally {
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('two processes can expand the same queue schema idempotently', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-scope-migration-race-'));
  const dbPath = path.join(root, 'queue.sqlite');
  createLegacyQueue(dbPath);
  try {
    const results = await Promise.all([migrationWorker(dbPath), migrationWorker(dbPath)]);
    assert.equal(results.every((result) => result.ok === true), true, JSON.stringify(results));
    const db = openFamilyRuntimeSqlite(dbPath, { readOnly: true });
    try {
      const rows = db.prepare('SELECT * FROM family_runtime_schema_migrations').all();
      assert.equal(rows.length, 1);
      const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
      assert.equal(version.value, String(QUEUE_SCHEMA_VERSION));
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
