import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { MIGRATION_0001_INITIAL_V2, openSqliteStore, runMigrations, txImmediate } from '../src/index.ts';

const EXPECTED_TABLES = [
  'schema_migrations',
  'workspaces',
  'knowledge_sources',
  'knowledge_snapshots',
  'installed_packages',
  'package_operations',
  'connections',
  'connection_grants',
  'tasks',
  'stage_runs',
  'attempts',
  'ledger_entries',
  'schedules',
].sort();

const EXPECTED_INDEXES = [
  'idx_attempts_live',
  'idx_grants_lookup',
  'idx_ledger_task',
  'idx_stage_runs_task',
];

test('openSqliteStore configures WAL, DQS=0, foreign_keys, and busy_timeout', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-sqlite-'));
  const dbPath = path.join(tmpDir, 'state.db');
  const db = openSqliteStore(dbPath);
  try {
    const mode = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    const busy = db.prepare('PRAGMA busy_timeout').get() as { timeout: number };
    assert.equal(mode.journal_mode.toLowerCase(), 'wal');
    assert.equal(fk.foreign_keys, 1);
    assert.equal(busy.timeout, 5000);

    // DQS=0 must reject double-quoted SQL string literals
    assert.throws(() => {
      db.prepare('SELECT "double_quoted_literal" AS val').get();
    });
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('runMigrations creates all 13 tables, 4 indexes, trigger, and is idempotent', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-mig-'));
  const dbPath = path.join(tmpDir, 'opl.db');
  const db = openSqliteStore(dbPath);
  try {
    const first = runMigrations(db);
    assert.deepEqual(first.applied, [1, 1001]);
    assert.deepEqual(first.skipped, []);
    assert.equal(first.current_version, 1001);

    const second = runMigrations(db);
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, [1, 1001]);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      tables.map((t) => t.name).sort(),
      EXPECTED_TABLES,
    );

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    assert.deepEqual(
      indexes.map((i) => i.name),
      EXPECTED_INDEXES,
    );

    const cols = db.prepare('PRAGMA table_info(installed_packages)').all() as Array<{ name: string }>;
    assert.ok(cols.some((c) => c.name === 'carrier_synced'));

    // Extra migration support
    const third = runMigrations(db, [
      {
        version: 1002,
        name: '1002_test_extra',
        sql: 'CREATE TABLE IF NOT EXISTS test_extra (id TEXT PRIMARY KEY);',
      },
    ]);
    assert.deepEqual(third.applied, [1002]);
    assert.deepEqual(third.skipped, [1, 1001]);
    assert.equal(third.current_version, 1002);
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('migrating a pre-update-source database preserves existing installs with an unknown source', () => {
  const db = openSqliteStore(':memory:');
  try {
    db.exec(MIGRATION_0001_INITIAL_V2.sql);
    db.exec(`
      INSERT INTO schema_migrations VALUES (1, '0001_initial_v2', '2026-01-01');
      INSERT INTO installed_packages (package_id, version, intent, origin, install_mode, install_path,
        content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at)
      VALUES ('installed-before-migration', '1.2.0', 'app', 'opl', 'release', '/example/package',
        'test-digest', '{}', 0, 0, '2026-01-01', '2026-01-01');
    `);
    assert.deepEqual(runMigrations(db).applied, [1001]);
    const row = db.prepare('SELECT version, enabled, update_source_json FROM installed_packages').get();
    assert.equal(row?.version, '1.2.0');
    assert.equal(row?.enabled, 0);
    assert.equal(row?.update_source_json, null);
  } finally {
    db.close();
  }
});

test('txImmediate supports commit, rollback, nested savepoints, append-only update trigger, and cascade delete', () => {
  const db = openSqliteStore(':memory:');
  try {
    runMigrations(db);
    const ts = new Date().toISOString();

    txImmediate(db, () => {
      db.prepare('INSERT INTO workspaces VALUES (?, ?, ?, ?, 1, ?, ?, ?)').run(
        'ws-1',
        'Test WS',
        '/tmp/ws-1',
        'agent-alpha',
        '{}',
        ts,
        ts,
      );
      db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(
        'task-1',
        'ws-1',
        'agent-alpha',
        'Task 1',
        'Goal',
        'active',
        ts,
        ts,
      );
      db.prepare(
        'INSERT INTO stage_runs VALUES (?, ?, ?, 1, ?, ?, ?, NULL, 1, ?, NULL, ?)',
      ).run('sr-1', 'task-1', 'plan', 'running', 'exec_alpha', 'model-1', ts, ts);
      db.prepare(
        'INSERT INTO ledger_entries VALUES (?, ?, ?, NULL, ?, ?, ?, ?)',
      ).run('le-1', 'task-1', 'sr-1', 'artifact_ref', 'agent-alpha', '{"path":"a.md"}', ts);

      // Nested savepoint rollback must not abort outer transaction
      assert.throws(() => {
        txImmediate(db, () => {
          db.prepare(
            'INSERT INTO ledger_entries VALUES (?, ?, ?, NULL, ?, ?, ?, ?)',
          ).run('le-inner', 'task-1', 'sr-1', 'artifact_ref', 'agent-alpha', '{"path":"b.md"}', ts);
          throw new Error('inner-abort');
        });
      }, /inner-abort/);
    });

    const countAfter = db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get() as { c: number };
    assert.equal(countAfter.c, 1);

    // BEFORE UPDATE trigger blocks mutation on ledger_entries
    assert.throws(() => {
      db.prepare("UPDATE ledger_entries SET owner_id = 'mutated' WHERE entry_id = 'le-1'").run();
    }, /append-only/);

    // Outer rollback removes everything
    assert.throws(() => {
      txImmediate(db, () => {
        db.prepare('INSERT INTO workspaces VALUES (?, ?, ?, ?, 1, ?, ?, ?)').run(
          'ws-2',
          'WS 2',
          '/tmp/ws-2',
          null,
          '{}',
          ts,
          ts,
        );
        throw new Error('outer-abort');
      });
    }, /outer-abort/);
    assert.equal(
      (db.prepare("SELECT COUNT(*) AS c FROM workspaces WHERE workspace_id = 'ws-2'").get() as { c: number }).c,
      0,
    );

    // ON DELETE CASCADE from tasks still cleans up stage_runs and ledger_entries
    db.prepare("DELETE FROM tasks WHERE task_id = 'task-1'").run();
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS c FROM stage_runs').get() as { c: number }).c,
      0,
    );
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').get() as { c: number }).c,
      0,
    );

    // Nested savepoint with INSERT OR ROLLBACK must propagate original SQLite constraint error (not no such savepoint)
    assert.throws(
      () =>
        txImmediate(db, () => {
          db.prepare('INSERT INTO workspaces VALUES (?, ?, ?, ?, 1, ?, ?, ?)').run(
            'ws-or-rb',
            'WS OR RB',
            '/tmp/ws-or-rb',
            null,
            '{}',
            ts,
            ts,
          );
          txImmediate(db, () => {
            db.prepare('INSERT OR ROLLBACK INTO tasks VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(
              't-or-rb',
              'missing-ws',
              'agent',
              'Title',
              'Goal',
              'active',
              ts,
              ts,
            );
          });
        }),
      /FOREIGN KEY constraint failed/i,
    );
  } finally {
    db.close();
  }
});
