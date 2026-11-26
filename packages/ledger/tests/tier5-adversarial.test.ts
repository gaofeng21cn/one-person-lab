import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openSqliteStore, runMigrations } from '@opl/core';
import {
  LedgerError,
  LedgerStore,
  MAX_LEDGER_PAYLOAD_BYTES,
  MAX_LEDGER_REF_LENGTH,
  assertRefsOnlyPayload,
  verifyTaskLineage,
} from '../src/index.ts';

function setupLedgerDb(tmpDir: string) {
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  runMigrations(db);
  const now = new Date().toISOString();
  db.prepare('INSERT INTO workspaces (workspace_id, name, root_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    'ws-1',
    'WS',
    tmpDir,
    now,
    now,
  );
  db.prepare(
    "INSERT INTO tasks (task_id, workspace_id, title, goal_prompt, status, created_at, updated_at) VALUES (?, ?, 'T', 'G', 'active', ?, ?)",
  ).run('task-1', 'ws-1', now, now);
  return { db, store: new LedgerStore(db) };
}

test('T5-LEDGER-01 (G-LEDGER-01 / BUG-P1-04): verifyTaskLineage handles dangling relative symlinks under symlinked workspace_root and missing tasks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-ledger-'));
  try {
    const realWs = path.join(tmpDir, 'real-ws');
    const aliasWs = path.join(tmpDir, 'alias-ws');
    fs.mkdirSync(path.join(realWs, 'artifacts'), { recursive: true });
    fs.symlinkSync(realWs, aliasWs, 'dir');

    // Dangling relative symlink INSIDE workspace under symlinked workspace_root
    fs.symlinkSync('missing.txt', path.join(realWs, 'artifacts', 'broken.txt'));
    // Escaping dangling symlink INSIDE workspace
    fs.symlinkSync('../../outside.txt', path.join(realWs, 'artifacts', 'escape.txt'));

    const { db, store } = setupLedgerDb(tmpDir);
    try {
      store.append({
        task_id: 'task-1',
        entry_kind: 'artifact_ref',
        owner_id: 'opl.runway',
        payload: { path: 'artifacts/broken.txt' },
      });
      const resBroken = verifyTaskLineage(db, 'task-1', {
        workspace_root: aliasWs,
        check_file_hashes: true,
      });
      assert.equal(resBroken.ok, false);
      assert.equal(resBroken.artifact_hash_mismatches[0]?.reason, 'missing');

      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO tasks (task_id, workspace_id, title, goal_prompt, status, created_at, updated_at) VALUES ('task-esc', 'ws-1', 'T', 'G', 'active', ?, ?)",
      ).run(now, now);
      store.append({
        task_id: 'task-esc',
        entry_kind: 'artifact_ref',
        owner_id: 'opl.runway',
        payload: { path: 'artifacts/escape.txt' },
      });
      const resEsc = verifyTaskLineage(db, 'task-esc', {
        workspace_root: aliasWs,
        check_file_hashes: true,
      });
      assert.equal(resEsc.artifact_hash_mismatches[0]?.reason, 'path_escape');

      // Non-existent task returns empty clean summary
      const resEmpty = verifyTaskLineage(db, 'task-nonexistent', { workspace_root: aliasWs });
      assert.equal(resEmpty.total_entries, 0);
      assert.equal(resEmpty.ok, true);
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-LEDGER-02 (G-LEDGER-02): enforces exact depth=6 vs 7, UTF-8 byte cap vs char length, ref length, and finite numbers', () => {
  const depth6 = { a: { b: { c: { d: { e: 'ok' } } } } };
  assert.doesNotThrow(() => assertRefsOnlyPayload(depth6));

  const depth7 = { a: { b: { c: { d: { e: { f: { g: 'too-deep' } } } } } } };
  assert.throws(
    () => assertRefsOnlyPayload(depth7),
    (err: unknown) => err instanceof LedgerError && err.code === 'REFS_ONLY_VIOLATION',
  );

  // Multibyte UTF-8 exceeding 16,384 bytes while staying under 16,384 chars & 2,048 chars per string
  const cjkChunk = '中'.repeat(1800); // 1800 chars, 5400 UTF-8 bytes
  assert.throws(
    () => assertRefsOnlyPayload({ notes: [cjkChunk, cjkChunk, cjkChunk, 'x'.repeat(200)] }),
    (err: unknown) =>
      err instanceof LedgerError
      && err.code === 'REFS_ONLY_VIOLATION'
      && err.details.reason === 'payload_size_exceeded',
  );
  assert.equal(MAX_LEDGER_PAYLOAD_BYTES, 16_384);

  // *_ref length boundary (1024 passes, 1025 fails)
  assert.doesNotThrow(() => assertRefsOnlyPayload({ doc_ref: 'a'.repeat(MAX_LEDGER_REF_LENGTH) }));
  assert.throws(
    () => assertRefsOnlyPayload({ doc_ref: 'a'.repeat(MAX_LEDGER_REF_LENGTH + 1) }),
    (err: unknown) => err instanceof LedgerError && err.code === 'REFS_ONLY_VIOLATION',
  );

  // Non-finite numbers rejected
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () => assertRefsOnlyPayload({ score: bad }),
      (err: unknown) => err instanceof LedgerError && err.code === 'REFS_ONLY_VIOLATION',
    );
  }
});
