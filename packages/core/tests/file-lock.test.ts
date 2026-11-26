import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  KernelError,
  acquireAdvisoryLock,
  withAdvisoryLockSync,
} from '../src/index.ts';

test('acquireAdvisoryLock creates 0600 lock, enforces contention, and verifies owner on release', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-lock-'));
  const lockPath = path.join(tmpDir, 'run', 'daemon.lock');
  try {
    const handle = acquireAdvisoryLock(lockPath, { ownerId: 'owner-1' });
    const mode = fs.statSync(lockPath).mode & 0o777;
    assert.equal(mode, 0o600);

    assert.throws(
      () => acquireAdvisoryLock(lockPath, { ownerId: 'owner-2', timeoutMs: 0 }),
      (err: unknown) => err instanceof KernelError && err.code === 'LOCK_CONTENTION',
    );

    assert.equal(handle.release(), true);
    assert.equal(handle.release(), false);
    assert.equal(fs.existsSync(lockPath), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('acquireAdvisoryLock reclaims dead-PID and stale locks atomically', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-lock-reclaim-'));
  const deadLockPath = path.join(tmpDir, 'dead.lock');
  const staleLockPath = path.join(tmpDir, 'stale.lock');
  try {
    fs.writeFileSync(
      deadLockPath,
      JSON.stringify({
        owner_id: 'dead-owner',
        pid: 99999999,
        acquired_at: new Date().toISOString(),
        process_identity: { pid: 99999999, proc_start_time_ticks: null, boot_id: null },
        stale_after_ms: 1_800_000,
      }),
      { mode: 0o600 },
    );

    const reclaimedDead = acquireAdvisoryLock(deadLockPath, { ownerId: 'new-owner' });
    assert.equal(reclaimedDead.owner_id, 'new-owner');
    assert.equal(reclaimedDead.release(), true);

    fs.writeFileSync(
      staleLockPath,
      JSON.stringify({
        owner_id: 'stale-owner',
        pid: process.pid,
        acquired_at: new Date(Date.now() - 10_000).toISOString(),
        process_identity: { pid: process.pid, proc_start_time_ticks: null, boot_id: null },
        stale_after_ms: 50,
      }),
      { mode: 0o600 },
    );
    const oldTime = new Date(Date.now() - 10_000);
    fs.utimesSync(staleLockPath, oldTime, oldTime);

    const result = withAdvisoryLockSync(staleLockPath, (h) => h.owner_id, {
      ownerId: 'fresh-owner',
      staleAfterMs: 50,
    });
    assert.equal(result, 'fresh-owner');
    assert.equal(fs.existsSync(staleLockPath), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('acquireAdvisoryLock preserves mutual exclusion under multi-process default-poll contention', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-lock-race-'));
  const lockPath = path.join(tmpDir, 'opld.lock');
  const coreEntryUrl = pathToFileURL(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/index.ts'),
  ).href;

  const holderScript = `
    import { acquireAdvisoryLock } from ${JSON.stringify(coreEntryUrl)};
    const handle = acquireAdvisoryLock(process.argv[1], { ownerId: 'live-holder', timeoutMs: 0 });
    process.stdout.write(JSON.stringify({ pid: process.pid, owner_id: handle.owner_id }) + '\\n');
    process.stdin.resume();
    process.stdin.on('end', () => {
      handle.release();
      process.exit(0);
    });
  `;

  const contenderScript = `
    import { KernelError, acquireAdvisoryLock } from ${JSON.stringify(coreEntryUrl)};
    const lockFile = process.argv[1];
    const ownerId = process.argv[2];
    try {
      const h = acquireAdvisoryLock(lockFile, { ownerId, timeoutMs: 200 });
      h.release();
      process.stdout.write(JSON.stringify({ ownerId, stolen: true }) + '\\n');
    } catch (err) {
      process.stdout.write(JSON.stringify({
        ownerId,
        stolen: false,
        code: err instanceof KernelError ? err.code : String(err),
      }) + '\\n');
    }
  `;

  const holder = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', holderScript, lockPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  try {
    const holderReady = await new Promise<{ pid: number; owner_id: string }>((resolve, reject) => {
      let buf = '';
      holder.stdout.on('data', (chunk) => {
        buf += chunk.toString('utf8');
        const nl = buf.indexOf('\n');
        if (nl !== -1) resolve(JSON.parse(buf.slice(0, nl)));
      });
      holder.stderr.on('data', (chunk) => {
        reject(new Error(`holder stderr: ${chunk.toString('utf8')}`));
      });
      holder.on('exit', (code) => {
        if (!buf.includes('\n')) reject(new Error(`holder exited early: ${code}`));
      });
    });

    const runContender = (id: string) =>
      new Promise<{ ownerId: string; stolen: boolean; code?: string }>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['--experimental-strip-types', '--input-type=module', '-e', contenderScript, lockPath, id],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let out = '';
        let err = '';
        child.stdout.on('data', (c) => (out += c.toString('utf8')));
        child.stderr.on('data', (c) => (err += c.toString('utf8')));
        child.on('exit', (code) => {
          if (code !== 0) reject(new Error(`contender ${id} exited ${code}: ${err}`));
          else resolve(JSON.parse(out.trim()));
        });
      });

    const results = await Promise.all([
      runContender('contender-1'),
      runContender('contender-2'),
      runContender('contender-3'),
    ]);

    const stolenCount = results.filter((r) => r.stolen).length;
    assert.equal(stolenCount, 0);
    for (const res of results) {
      assert.equal(res.code, 'LOCK_CONTENTION');
    }

    assert.equal(fs.existsSync(lockPath), true);
    const lockJson = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { pid: number; owner_id: string };
    assert.equal(lockJson.pid, holderReady.pid);
    assert.equal(lockJson.owner_id, 'live-holder');

    holder.stdin.end();
    await new Promise<void>((resolve) => holder.on('exit', () => resolve()));
    assert.equal(fs.existsSync(lockPath), false);

    const fresh = acquireAdvisoryLock(lockPath, { ownerId: 'after-holder', timeoutMs: 0 });
    assert.equal(fresh.release(), true);
  } finally {
    if (!holder.killed) holder.kill('SIGKILL');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
