import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  EventBus,
  KernelError,
  PluginLoader,
  acquireAdvisoryLock,
  openSqliteStore,
  runMigrations,
  txImmediate,
} from '../src/index.ts';

test('T5-CORE-01 (G-CORE-01 / BUG-P1-05): reclaims dangling symlink locks and corrupt lock files by staleAfterMs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-core-lock-'));
  try {
    const danglingLock = path.join(tmpDir, 'dangling.lock');
    fs.symlinkSync(path.join(tmpDir, 'nonexistent-target'), danglingLock);
    const oldTime = new Date(Date.now() - 60_000);
    fs.lutimesSync(danglingLock, oldTime, oldTime);

    const h1 = acquireAdvisoryLock(danglingLock, {
      ownerId: 'reclaimer-1',
      staleAfterMs: 1,
      timeoutMs: 0,
    });
    assert.equal(h1.owner_id, 'reclaimer-1');
    assert.equal(fs.lstatSync(danglingLock).isSymbolicLink(), false);
    assert.equal(h1.release(), true);

    // Non-backdated dangling symlink is also reclaimed when staleAfterMs > 0
    fs.symlinkSync(path.join(tmpDir, 'missing-2'), danglingLock);
    const h1b = acquireAdvisoryLock(danglingLock, {
      ownerId: 'reclaimer-1b',
      staleAfterMs: 60_000,
      timeoutMs: 0,
    });
    assert.equal(h1b.release(), true);

    // Corrupt non-JSON regular lock file respects staleAfterMs
    const corruptLock = path.join(tmpDir, 'corrupt.lock');
    fs.writeFileSync(corruptLock, '{corrupt-not-json', { mode: 0o600 });
    assert.throws(
      () => acquireAdvisoryLock(corruptLock, { ownerId: 'c1', staleAfterMs: 0, timeoutMs: 0 }),
      (err: unknown) => err instanceof KernelError && err.code === 'LOCK_CONTENTION',
    );
    fs.utimesSync(corruptLock, oldTime, oldTime);
    const h2 = acquireAdvisoryLock(corruptLock, { ownerId: 'c2', staleAfterMs: 5, timeoutMs: 0 });
    assert.equal(h2.release(), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-CORE-02 (G-CORE-02 / BUG-P1-08): PluginLoader disposeAll resilience, async/rejecting factories, and EventBus throwing onError', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-core-plugin-'));
  try {
    let disposedA = false;
    const loader = new PluginLoader();
    loader.register({
      id: 'plugin-a',
      dispose: () => {
        disposedA = true;
      },
    });
    await loader.initAll();
    // Register uninitialized plugin with missing dep after plugin-a is live
    loader.register({
      id: 'plugin-b-broken',
      dependencies: ['missing-x'],
    });

    const { errors } = await loader.disposeAll();
    assert.equal(errors.length, 0);
    assert.equal(disposedA, true, 'disposeAll must still dispose live plugin-a when resolveOrder fails');

    // loadFromModule async factory + rejecting factory
    const okMod = path.join(tmpDir, 'async-factory.mjs');
    fs.writeFileSync(okMod, 'export default async () => ({ id: "async-factory-mod" });\n', 'utf8');
    const badMod = path.join(tmpDir, 'reject-factory.mjs');
    fs.writeFileSync(badMod, 'export default async () => { throw new Error("factory_boom"); };\n', 'utf8');

    const loaded = await loader.loadFromModule(pathToFileURL(okMod).href);
    assert.equal(loaded.id, 'async-factory-mod');
    await assert.rejects(
      () => loader.loadFromModule(pathToFileURL(badMod).href),
      /factory_boom/,
    );

    // EventBus listener error when onError itself throws does not block sibling listeners
    let siblingRan = false;
    const bus = new EventBus<{ ping: { v: number } }>({
      onError: () => {
        throw new Error('onError_boom');
      },
    });
    bus.on('ping', () => {
      throw new Error('listener_boom');
    });
    bus.on('ping', () => {
      siblingRan = true;
    });
    bus.emit('ping', { v: 1 });
    assert.equal(siblingRan, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-CORE-03 (G-CORE-03 & G-CORE-04): sqlite busyTimeoutMs/nested savepoints/migrations and import-guard adversarial probes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-core-db-'));
  try {
    const dbPath = path.join(tmpDir, 'test.db');
    for (const badTimeout of [-1, Number.NaN, 12.5]) {
      assert.throws(
        () => openSqliteStore(dbPath, { busyTimeoutMs: badTimeout }),
        (err: unknown) => err instanceof KernelError && err.code === 'INVALID_INPUT',
      );
    }

    assert.throws(
      () => openSqliteStore(path.join(tmpDir, 'missing.db'), { readOnly: true }),
      /SQLITE|unable to open|ENOENT/i,
    );

    const db = openSqliteStore(dbPath);
    try {
      assert.throws(
        () => runMigrations(db, [{ version: 0, name: 'bad_zero', sql: 'SELECT 1;' }]),
        (err: unknown) => err instanceof KernelError && err.code === 'DB_MIGRATION_FAILED',
      );
      assert.throws(
        () => runMigrations(db, [{ version: 1, name: 'dup_one', sql: 'SELECT 1;' }]),
        (err: unknown) => err instanceof KernelError && err.code === 'DB_MIGRATION_FAILED',
      );

      runMigrations(db);
      db.exec('CREATE TABLE IF NOT EXISTS t5_kv (k TEXT PRIMARY KEY)');
      txImmediate(db, () => {
        db.prepare("INSERT INTO t5_kv (k) VALUES ('outer-1')").run();
        assert.throws(() => {
          txImmediate(db, () => {
            db.prepare("INSERT INTO t5_kv (k) VALUES ('inner-2-abort')").run();
            throw new Error('abort_level_2');
          });
        }, /abort_level_2/);
        txImmediate(db, () => {
          db.prepare("INSERT INTO t5_kv (k) VALUES ('inner-3-commit')").run();
        });
      });

      const rows = db.prepare('SELECT k FROM t5_kv ORDER BY k').all() as Array<{ k: string }>;
      assert.deepEqual(rows.map((r) => r.k), ['inner-3-commit', 'outer-1']);
    } finally {
      db.close();
    }

    // G-CORE-04: verify check-v2-import-guard.mjs catches dynamic import() & DQS=0 in a temp probe
    const guardScript = path.resolve(import.meta.dirname, '../../../scripts/check-v2-import-guard.mjs');
    const probeRes = spawnSync(process.execPath, [guardScript, '--strict-m4'], {
      cwd: path.resolve(import.meta.dirname, '../../..'),
      encoding: 'utf8',
    });
    assert.equal(probeRes.status, 0, probeRes.stderr);

    const guardProbeDir = path.join(tmpDir, 'guard-probe');
    fs.mkdirSync(path.join(guardProbeDir, 'packages', 'core', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(guardProbeDir, 'packages', 'core', 'package.json'),
      JSON.stringify({ name: '@opl/core', version: '2.0.0' }),
    );
    fs.writeFileSync(
      path.join(guardProbeDir, 'packages', 'core', 'src', 'bad.ts'),
      [
        'export async function loadDyn(x: string) { return import(`@opl/${x}`); }',
        'export const badSql = \'SELECT "bad_dqs" FROM tasks\';',
      ].join('\n'),
      'utf8',
    );
    const badProbe = spawnSync(process.execPath, [guardScript, '--root', guardProbeDir, '--json'], {
      encoding: 'utf8',
    });
    assert.equal(badProbe.status, 1);
    const parsedProbe = JSON.parse(badProbe.stdout) as { violations: Array<{ rule: string }> };
    const rules = new Set(parsedProbe.violations.map((v) => v.rule));
    assert.equal(rules.has('core-dynamic-import-forbidden'), true);
    assert.equal(rules.has('dqs0-ts-sql-double-quote'), true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
