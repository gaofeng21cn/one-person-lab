import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openSqliteStore, runMigrations } from '@opl/core';

import * as ledgerExports from '../src/index.ts';
import { LedgerError, LedgerStore } from '../src/index.ts';

function seedTaskFixture(workspaceRoot: string) {
  const db = openSqliteStore(path.join(workspaceRoot, 'opl.db'));
  runMigrations(db);
  const ts = new Date().toISOString();
  db.prepare('INSERT INTO workspaces VALUES (?, ?, ?, ?, 1, ?, ?, ?)').run(
    'ws-1',
    'Cardiology',
    workspaceRoot,
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
    'Analyze cohort',
    'active',
    ts,
    ts,
  );
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(
    'task-2',
    'ws-1',
    'mas',
    'Other',
    'Other goal',
    'active',
    ts,
    ts,
  );
  db.prepare(
    'INSERT INTO stage_runs VALUES (?, ?, ?, 1, ?, ?, ?, NULL, 1, ?, NULL, ?)',
  ).run('sr-1', 'task-1', 'analysis', 'running', 'codex', 'gpt-5-codex', ts, ts);
  db.prepare(
    'INSERT INTO stage_runs VALUES (?, ?, ?, 1, ?, ?, ?, NULL, 1, ?, NULL, ?)',
  ).run('sr-1b', 'task-1', 'review', 'running', 'codex', 'gpt-5-codex', ts, ts);
  db.prepare(
    'INSERT INTO stage_runs VALUES (?, ?, ?, 1, ?, ?, ?, NULL, 1, ?, NULL, ?)',
  ).run('sr-2', 'task-2', 'analysis', 'running', 'codex', 'gpt-5-codex', ts, ts);
  db.prepare(
    'INSERT INTO attempts VALUES (?, ?, 1, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, NULL)',
  ).run('att-1', 'sr-1', 'producer', 'codex', 'sess-1', 'running', ts, '{}', ts);
  return db;
}

test('LedgerStore enforces FK mapping and cross-task/stage mismatch checks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-fk-'));
  const db = seedTaskFixture(tmpDir);
  try {
    const store = new LedgerStore(db);

    assert.throws(
      () =>
        store.append({
          task_id: 'missing-task',
          entry_kind: 'typed_blocker',
          owner_id: 'opl.runway',
          payload: { code: 'x' },
        }),
      (err: unknown) => err instanceof LedgerError && err.code === 'TASK_NOT_FOUND',
    );

    assert.throws(
      () =>
        store.append({
          task_id: 'task-1',
          stage_run_id: 'missing-sr',
          entry_kind: 'typed_blocker',
          owner_id: 'opl.runway',
          payload: { code: 'x' },
        }),
      (err: unknown) => err instanceof LedgerError && err.code === 'STAGE_RUN_NOT_FOUND',
    );

    assert.throws(
      () =>
        store.append({
          task_id: 'task-1',
          stage_run_id: 'sr-2',
          entry_kind: 'typed_blocker',
          owner_id: 'opl.runway',
          payload: { code: 'x' },
        }),
      (err: unknown) => err instanceof LedgerError && err.code === 'TASK_STAGE_MISMATCH',
    );

    assert.throws(
      () =>
        store.append({
          task_id: 'task-1',
          stage_run_id: 'sr-1',
          attempt_id: 'missing-att',
          entry_kind: 'typed_blocker',
          owner_id: 'opl.runway',
          payload: { code: 'x' },
        }),
      (err: unknown) => err instanceof LedgerError && err.code === 'ATTEMPT_NOT_FOUND',
    );

    assert.throws(
      () =>
        store.append({
          task_id: 'task-1',
          stage_run_id: 'sr-1b',
          attempt_id: 'att-1',
          entry_kind: 'typed_blocker',
          owner_id: 'opl.runway',
          payload: { code: 'x' },
        }),
      (err: unknown) => err instanceof LedgerError && err.code === 'STAGE_ATTEMPT_MISMATCH',
    );
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('LedgerStore handles timeline ordering, debts resolution/waiver, and file hash lineage verification', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-store-'));
  const db = seedTaskFixture(tmpDir);
  const appendedEvents: string[] = [];
  try {
    const store = new LedgerStore(db, {
      onAppended: (entries) => {
        for (const e of entries) appendedEvents.push(e.entry_id);
      },
    });

    const planPath = path.join(tmpDir, 'analysis', 'plan.md');
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, '# Plan\nCohort = 120\n', 'utf8');
    const planSha = crypto.createHash('sha256').update(fs.readFileSync(planPath)).digest('hex');

    const fixedTs = '2026-11-24T12:00:00.000Z';
    store.appendBatch([
      {
        entry_id: 'le-1',
        task_id: 'task-1',
        stage_run_id: 'sr-1',
        attempt_id: 'att-1',
        entry_kind: 'artifact_ref',
        owner_id: 'mas',
        payload: { path: 'analysis/plan.md', sha256: `sha256:${planSha}` },
        created_at: fixedTs,
      },
      {
        entry_id: 'le-2',
        task_id: 'task-1',
        stage_run_id: 'sr-1',
        attempt_id: 'att-1',
        entry_kind: 'quality_debt',
        owner_id: 'mas',
        payload: { debt_id: 'debt-fig1', summary: 'Missing figure 1', blocks_submission: true },
        created_at: fixedTs,
      },
      {
        entry_id: 'le-3',
        task_id: 'task-1',
        stage_run_id: 'sr-1',
        attempt_id: 'att-1',
        entry_kind: 'quality_debt',
        owner_id: 'mas',
        payload: { code: 'debt-supp', summary: 'Optional supplement', blocks_submission: false },
        created_at: fixedTs,
      },
    ]);

    assert.deepEqual(appendedEvents, ['le-1', 'le-2', 'le-3']);

    // Deterministic same-timestamp ordering
    const tl = store.timeline({ task_id: 'task-1' });
    assert.deepEqual(
      tl.map((e) => e.entry_id),
      ['le-1', 'le-2', 'le-3'],
    );
    assert.equal(store.artifacts({ task_id: 'task-1' }).length, 1);

    // Lineage fails before blocking debt is resolved
    const beforeDebtFix = store.verifyLineage('task-1', {
      workspace_root: tmpDir,
      check_file_hashes: true,
    });
    assert.equal(beforeDebtFix.ok, false);
    assert.equal(beforeDebtFix.open_blocking_debts, 1);
    assert.equal(beforeDebtFix.artifact_hash_mismatches.length, 0);

    // Resolve debt-fig1 via owner_receipt and waive debt-supp via human_decision
    store.append({
      entry_id: 'le-4',
      task_id: 'task-1',
      stage_run_id: 'sr-1',
      entry_kind: 'owner_receipt',
      owner_id: 'mas',
      payload: { resolves_debt: 'debt-fig1', status: 'ready_for_review' },
    });
    assert.equal(store.receipts({ task_id: 'task-1' }).length, 1);

    store.append({
      entry_id: 'le-5',
      task_id: 'task-1',
      entry_kind: 'human_decision',
      owner_id: 'human',
      payload: { decision: 'waive_debt', waived_debt_ids: ['debt-supp'] },
    });

    assert.equal(store.debts({ task_id: 'task-1', unresolved_only: true }).length, 0);
    const allDebts = store.debts({ task_id: 'task-1' });
    assert.deepEqual(
      allDebts.map((d) => ({ key: d.debt_key, status: d.status })),
      [
        { key: 'debt-fig1', status: 'resolved' },
        { key: 'debt-supp', status: 'waived' },
      ],
    );

    store.recordReview({
      task_id: 'task-1',
      stage_run_id: 'sr-1',
      owner_id: 'mas.reviewer',
      verdict: 'pass',
      verified_hashes: [planSha],
    });

    const verified = store.verifyLineage('task-1', {
      workspace_root: tmpDir,
      check_file_hashes: true,
    });
    assert.equal(verified.ok, true);
    assert.equal(verified.latest_review_verdict, 'pass');
    assert.equal(verified.total_entries, 6);

    // Tamper file on disk -> hash mismatch detected
    fs.writeFileSync(planPath, '# Tampered\n', 'utf8');
    const tampered = store.verifyLineage('task-1', {
      workspace_root: tmpDir,
      check_file_hashes: true,
    });
    assert.equal(tampered.ok, false);
    assert.equal(tampered.artifact_hash_mismatches.length, 1);
    assert.equal(tampered.artifact_hash_mismatches[0]?.reason, 'hash_mismatch');
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Ledger API and SQLite table enforce append-only semantics (zero update/delete APIs)', () => {
  const mutatorPrefix = /^(?:update|delete|remove|purge)/i;
  for (const name of Object.keys(ledgerExports)) {
    assert.equal(mutatorPrefix.test(name), false, `Unexpected mutator export: ${name}`);
  }
  for (const name of Object.getOwnPropertyNames(LedgerStore.prototype)) {
    assert.equal(mutatorPrefix.test(name), false, `Unexpected mutator method: ${name}`);
  }
});

test('LedgerStore handles >1000 entries in verifyLineage and debts without truncation', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-1005-'));
  const db = seedTaskFixture(tmpDir);
  try {
    const store = new LedgerStore(db);
    const batch = Array.from({ length: 1001 }, (_, i) => ({
      task_id: 'task-1',
      stage_run_id: 'sr-1',
      entry_kind: 'owner_receipt' as const,
      owner_id: 'mas',
      payload: { seq: i },
      created_at: '2026-11-24T12:00:00.000Z',
    }));
    store.appendBatch(batch);

    store.appendBatch([
      {
        task_id: 'task-1',
        stage_run_id: 'sr-1',
        entry_kind: 'quality_debt',
        owner_id: 'mas',
        payload: { debt_id: 'debt-late', summary: 'Late debt past 1000', blocks_submission: true },
        created_at: '2026-11-24T12:01:00.000Z',
      },
      {
        task_id: 'task-1',
        stage_run_id: 'sr-1',
        entry_kind: 'artifact_ref',
        owner_id: 'mas',
        payload: { path: 'missing/late.md', sha256: 'deadbeef' },
        created_at: '2026-11-24T12:02:00.000Z',
      },
      {
        task_id: 'task-1',
        stage_run_id: 'sr-1',
        entry_kind: 'review_verdict',
        owner_id: 'mas.reviewer',
        payload: { verdict: 'rejected' },
        created_at: '2026-11-24T12:03:00.000Z',
      },
      {
        task_id: 'task-1',
        stage_run_id: 'sr-1',
        entry_kind: 'quality_debt',
        owner_id: 'mas',
        payload: { debt_id: 'debt-late-resolved', summary: 'Resolved late', blocks_submission: true },
        created_at: '2026-11-24T12:04:00.000Z',
      },
    ]);

    const res = store.verifyLineage('task-1', {
      workspace_root: tmpDir,
      check_file_hashes: true,
    });
    assert.equal(res.ok, false);
    assert.equal(res.total_entries, 1005);
    assert.equal(res.open_blocking_debts, 2);
    assert.equal(res.latest_review_verdict, 'rejected');
    assert.equal(res.artifact_hash_mismatches.length, 1);
    assert.equal(res.artifact_hash_mismatches[0]?.reason, 'missing');

    // Resolve one late debt after index 1000 and verify queryDebts captures it
    store.append({
      task_id: 'task-1',
      stage_run_id: 'sr-1',
      entry_kind: 'owner_receipt',
      owner_id: 'mas',
      payload: { resolves_debt: 'debt-late-resolved', status: 'fixed' },
      created_at: '2026-11-24T12:05:00.000Z',
    });
    const openDebts = store.debts({ task_id: 'task-1', unresolved_only: true });
    assert.deepEqual(
      openDebts.map((d) => d.debt_key),
      ['debt-late'],
    );
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('verifyTaskLineage detects symlink path_escape and non-file directory without EISDIR crash', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-symlink-'));
  const wsRoot = path.join(tmpDir, 'ws');
  const outsideDir = path.join(tmpDir, 'outside');
  fs.mkdirSync(path.join(wsRoot, 'artifacts'), { recursive: true });
  fs.mkdirSync(outsideDir, { recursive: true });
  const outsideSecret = path.join(outsideDir, 'secret.txt');
  fs.writeFileSync(outsideSecret, 'TOP_SECRET', 'utf8');
  const secretSha = crypto.createHash('sha256').update(fs.readFileSync(outsideSecret)).digest('hex');
  fs.symlinkSync(outsideSecret, path.join(wsRoot, 'artifacts', 'leak.txt'));

  const db = seedTaskFixture(tmpDir);
  try {
    const store = new LedgerStore(db);
    store.appendBatch([
      {
        entry_id: 'le-sym',
        task_id: 'task-1',
        entry_kind: 'artifact_ref',
        owner_id: 'mas',
        payload: { path: 'artifacts/leak.txt', sha256: secretSha },
      },
      {
        entry_id: 'le-dir',
        task_id: 'task-1',
        entry_kind: 'artifact_ref',
        owner_id: 'mas',
        payload: { path: 'artifacts', sha256: secretSha },
      },
    ]);

    const res = store.verifyLineage('task-1', {
      workspace_root: wsRoot,
      check_file_hashes: true,
    });
    assert.equal(res.ok, false);
    assert.deepEqual(
      res.artifact_hash_mismatches.map((m) => ({ entry_id: m.entry_id, reason: m.reason })),
      [
        { entry_id: 'le-sym', reason: 'path_escape' },
        { entry_id: 'le-dir', reason: 'not_a_file' },
      ],
    );
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('queryDebts enforces chronological causality, post-commit onAppended, and timeline input/timezone guards', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-causality-'));
  const db = seedTaskFixture(tmpDir);
  const events: string[] = [];
  try {
    const store = new LedgerStore(db, {
      onAppended: (entries) => {
        for (const e of entries) events.push(e.entry_id);
      },
    });

    // Receipt BEFORE future debt must NOT close future debt
    store.appendBatch([
      {
        entry_id: 'le-early-receipt',
        task_id: 'task-1',
        entry_kind: 'owner_receipt',
        owner_id: 'mas',
        payload: { resolves_debt: 'd-future', status: 'premature' },
        created_at: '2026-11-24T10:00:00.000Z',
      },
      {
        entry_id: 'le-future-debt',
        task_id: 'task-1',
        entry_kind: 'quality_debt',
        owner_id: 'mas',
        payload: { debt_id: 'd-future', summary: 'Opened after early receipt' },
        created_at: '2026-11-24T10:00:05.000Z',
      },
    ]);
    assert.deepEqual(events, ['le-early-receipt', 'le-future-debt']);
    assert.deepEqual(
      store.debts({ task_id: 'task-1', unresolved_only: true }).map((d) => d.debt_key),
      ['d-future'],
    );

    // Rolled-back outer transaction must NOT fire onAppended
    const beforeRollbackCount = events.length;
    assert.throws(() => {
      db.exec('BEGIN IMMEDIATE');
      try {
        store.append({
          entry_id: 'le-rolled-back',
          task_id: 'task-1',
          entry_kind: 'typed_blocker',
          owner_id: 'opl.runway',
          payload: { code: 'rollback_test' },
        });
        throw new Error('OUTER_ABORT');
      } catch (err) {
        if (db.isTransaction) db.exec('ROLLBACK');
        throw err;
      }
    }, /OUTER_ABORT/);
    assert.equal(events.length, beforeRollbackCount);

    // NaN / negative limit & offset must throw INVALID_LEDGER_INPUT
    for (const badQuery of [
      { task_id: 'task-1', limit: Number.NaN },
      { task_id: 'task-1', limit: 0 },
      { task_id: 'task-1', limit: -5 },
      { task_id: 'task-1', offset: Number.NaN },
      { task_id: 'task-1', offset: -1 },
    ]) {
      assert.throws(
        () => store.timeline(badQuery),
        (err: unknown) => err instanceof LedgerError && err.code === 'INVALID_LEDGER_INPUT',
      );
    }

    // Timezone normalization on `since`: 17:00+08:00 == 09:00Z < 10:00Z
    store.append({
      entry_id: 'le-tz-early',
      task_id: 'task-1',
      entry_kind: 'typed_blocker',
      owner_id: 'opl.runway',
      payload: { code: 'tz_early' },
      created_at: '2026-11-24T17:00:00+08:00',
    });
    const afterTenZ = store.timeline({
      task_id: 'task-1',
      since: '2026-11-24T10:00:00Z',
    });
    assert.equal(afterTenZ.some((e) => e.entry_id === 'le-tz-early'), false);
    const afterEightZ = store.timeline({
      task_id: 'task-1',
      since: '2026-11-24T08:00:00Z',
    });
    assert.equal(afterEightZ.some((e) => e.entry_id === 'le-tz-early'), true);
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
