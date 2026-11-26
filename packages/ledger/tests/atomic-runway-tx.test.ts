import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openSqliteStore, runMigrations, txImmediate } from '@opl/core';

import {
  LedgerError,
  appendEntriesWithDb,
  appendEntryWithDb,
  queryTimeline,
} from '../src/index.ts';

function createRunwayDb(tmpDir: string) {
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  runMigrations(db);
  const ts = new Date().toISOString();
  db.prepare('INSERT INTO workspaces VALUES (?, ?, ?, ?, 1, ?, ?, ?)').run(
    'ws-1',
    'Study',
    tmpDir,
    'mas',
    '{}',
    ts,
    ts,
  );
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(
    'task-1',
    'ws-1',
    'mas',
    'Paper',
    'Goal',
    'active',
    ts,
    ts,
  );
  db.prepare(
    'INSERT INTO stage_runs VALUES (?, ?, ?, 1, ?, ?, ?, NULL, 1, ?, NULL, ?)',
  ).run('sr-1', 'task-1', 'analysis', 'running', 'antigravity', 'gemini-4-neon-high', ts, ts);
  db.prepare(
    'INSERT INTO attempts VALUES (?, ?, 1, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, NULL)',
  ).run('att-1', 'sr-1', 'producer', 'antigravity', 'ag-conv-1', 'running', ts, '{}', ts);
  return db;
}

test('Runway + Ledger atomic txImmediate commits together and rolls back on REVISION_CONFLICT or REFS_ONLY_VIOLATION', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-tx-'));
  const db = createRunwayDb(tmpDir);
  try {
    const completeAttemptAtomically = (params: {
      expectedRevision: number;
      ledgerInputs: Parameters<typeof appendEntriesWithDb>[1];
    }) =>
      txImmediate(db, () => {
        const now = new Date().toISOString();
        const upd = db
          .prepare(
            "UPDATE stage_runs SET status = 'completed', revision = revision + 1, finished_at = ?, updated_at = ? WHERE stage_run_id = ? AND revision = ?",
          )
          .run(now, now, 'sr-1', params.expectedRevision);
        if (upd.changes !== 1) {
          throw new Error('REVISION_CONFLICT');
        }
        db.prepare("UPDATE attempts SET status = 'succeeded', finished_at = ? WHERE attempt_id = ?").run(
          now,
          'att-1',
        );
        return appendEntriesWithDb(db, params.ledgerInputs);
      });

    // 1. Stale revision aborts without inserting ledger entries
    assert.throws(
      () =>
        completeAttemptAtomically({
          expectedRevision: 99,
          ledgerInputs: [
            {
              task_id: 'task-1',
              stage_run_id: 'sr-1',
              attempt_id: 'att-1',
              entry_kind: 'artifact_ref',
              owner_id: 'mas',
              payload: { path: 'analysis/plan.md', sha256: 'abc123' },
            },
          ],
        }),
      /REVISION_CONFLICT/,
    );
    assert.equal(queryTimeline(db, { task_id: 'task-1' }).length, 0);

    // 2. Ledger REFS_ONLY_VIOLATION rolls back stage_runs and attempts updates
    assert.throws(
      () =>
        completeAttemptAtomically({
          expectedRevision: 1,
          ledgerInputs: [
            {
              task_id: 'task-1',
              stage_run_id: 'sr-1',
              attempt_id: 'att-1',
              entry_kind: 'artifact_ref',
              owner_id: 'mas',
              payload: { path: 'analysis/plan.md', body: 'FORBIDDEN_INLINE_BODY' } as never,
            },
          ],
        }),
      (err: unknown) => err instanceof LedgerError && err.code === 'REFS_ONLY_VIOLATION',
    );

    const srAfterFail = db
      .prepare('SELECT status, revision FROM stage_runs WHERE stage_run_id = ?')
      .get('sr-1') as { status: string; revision: number };
    const attAfterFail = db
      .prepare('SELECT status FROM attempts WHERE attempt_id = ?')
      .get('att-1') as { status: string };
    assert.equal(srAfterFail.status, 'running');
    assert.equal(srAfterFail.revision, 1);
    assert.equal(attAfterFail.status, 'running');
    assert.equal(queryTimeline(db, { task_id: 'task-1' }).length, 0);

    // 3. Valid revision + valid refs-only entries commit atomically
    const committed = completeAttemptAtomically({
      expectedRevision: 1,
      ledgerInputs: [
        {
          task_id: 'task-1',
          stage_run_id: 'sr-1',
          attempt_id: 'att-1',
          entry_kind: 'artifact_ref',
          owner_id: 'mas',
          payload: { path: 'analysis/plan.md', sha256: 'abc123' },
        },
        {
          task_id: 'task-1',
          stage_run_id: 'sr-1',
          attempt_id: 'att-1',
          entry_kind: 'quality_debt',
          owner_id: 'mas',
          payload: { code: 'fig2_ci_missing', blocks_submission: true },
        },
      ],
    });
    assert.equal(committed.length, 2);

    const srAfterOk = db
      .prepare('SELECT status, revision FROM stage_runs WHERE stage_run_id = ?')
      .get('sr-1') as { status: string; revision: number };
    const attAfterOk = db
      .prepare('SELECT status FROM attempts WHERE attempt_id = ?')
      .get('att-1') as { status: string };
    assert.equal(srAfterOk.status, 'completed');
    assert.equal(srAfterOk.revision, 2);
    assert.equal(attAfterOk.status, 'succeeded');

    // Append another entry directly inside an outer txImmediate
    txImmediate(db, () => {
      appendEntryWithDb(db, {
        task_id: 'task-1',
        stage_run_id: 'sr-1',
        entry_kind: 'owner_receipt',
        owner_id: 'mas',
        payload: { status: 'handed_off', resolves_debt: 'fig2_ci_missing' },
      });
    });
    assert.equal(queryTimeline(db, { task_id: 'task-1' }).length, 3);
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
