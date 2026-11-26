import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openSqliteStore, txImmediate } from '@opl/core';
import { queryTimeline } from '@opl/ledger';

import { WorkspaceError, createWorkspaceService } from '../src/index.ts';

function containsStringInSqliteFiles(dbPath: string, needle: string): boolean {
  const needleBuf = Buffer.from(needle, 'utf8');
  for (const filePath of [dbPath, `${dbPath}-wal`]) {
    if (fs.existsSync(filePath)) {
      if (fs.readFileSync(filePath).includes(needleBuf)) return true;
    }
  }
  return false;
}

test('writeback proposals persist digest-only across service restarts with zero raw body bytes in SQLite', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-wb-'));
  const dbPath = path.join(tmpDir, 'opl.db');
  const db1 = openSqliteStore(dbPath);
  let db2: ReturnType<typeof openSqliteStore> | null = null;
  try {
    const svc1 = createWorkspaceService({ db: db1 });
    const ws = svc1.initWorkspace({ root_path: path.join(tmpDir, 'ws') });
    const vaultDir = path.join(tmpDir, 'vault');
    fs.mkdirSync(vaultDir, { recursive: true });
    const targetFile = path.join(vaultDir, 'notes', 'summary.md');
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, 'INITIAL_NOTE_V1\n', 'utf8');

    const src = svc1.bindSource({
      workspace_id: ws.workspace_id,
      scope: 'long_term_topic',
      adapter_kind: 'obsidian_vault',
      root_path: vaultDir,
    });

    const preSnapshot = svc1.createSnapshot({
      workspace_id: ws.workspace_id,
      stage_run_id: 'sr-pre-wb',
    });

    const proposedBody = 'PROPOSED_SENSITIVE_WRITEBACK_BODY_ZERO_DB_LEAK_7711\n';
    const proposal = svc1.proposeWriteback({
      workspace_id: ws.workspace_id,
      source_id: src.source_id,
      target_path: 'notes/summary.md',
      content: proposedBody,
      accepted_revision: '1',
    });
    assert.equal(proposal.status, 'proposed');
    assert.ok(proposal.before_sha256?.startsWith('sha256:'));
    assert.equal(containsStringInSqliteFiles(dbPath, proposedBody), false);

    // Close DB and reopen new WorkspaceService (simulating opld restart)
    db1.close();
    db2 = openSqliteStore(dbPath);
    const svc2 = createWorkspaceService({ db: db2 });

    // Tampered content against proposal_id fails
    assert.throws(
      () =>
        svc2.commitWriteback({
          proposal_id: proposal.proposal_id,
          content: 'TAMPERED_CONTENT\n',
        }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'INVALID_INPUT',
    );
    assert.equal(fs.readFileSync(targetFile, 'utf8'), 'INITIAL_NOTE_V1\n');

    // Valid commit succeeds across restart
    const committed = svc2.commitWriteback({
      proposal_id: proposal.proposal_id,
      content: proposedBody,
      require_unchanged_before: true,
    });
    assert.equal(committed.committed, true);
    assert.equal(committed.previous_revision, '1');
    assert.equal(committed.new_revision, '2');
    assert.equal(fs.readFileSync(targetFile, 'utf8'), proposedBody);
    assert.equal(containsStringInSqliteFiles(dbPath, proposedBody), false);

    // Pre-writeback snapshot remains intact
    const snapRead = svc2.getSnapshot(preSnapshot.snapshot_id);
    assert.equal(snapRead.manifest.revision, '1');

    // Re-committing same proposal or using stale accepted_revision fails with REVISION_CONFLICT
    assert.throws(
      () =>
        svc2.commitWriteback({
          proposal_id: proposal.proposal_id,
          content: proposedBody,
        }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'REVISION_CONFLICT',
    );
    assert.throws(
      () =>
        svc2.commitWriteback({
          source_id: src.source_id,
          target_path: 'notes/summary.md',
          content: 'stale overwrite\n',
          accepted_revision: '1',
        }),
      (err: unknown) =>
        err instanceof WorkspaceError
        && err.code === 'REVISION_CONFLICT'
        && err.rpcCode === -32009,
    );
    assert.equal(fs.readFileSync(targetFile, 'utf8'), proposedBody);
  } finally {
    try {
      db1.close();
    } catch {
      // already closed
    }
    db2?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('writeback and readWorkspaceFile reject traversal, absolute paths, and symlink escapes/redirections', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-sec-'));
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    const service = createWorkspaceService({ db });
    const wsDir = path.join(tmpDir, 'ws');
    const srcDir = path.join(tmpDir, 'src');
    const outsideDir = path.join(tmpDir, 'outside');
    fs.mkdirSync(wsDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(outsideDir, 'pwn.txt'), 'secret\n', 'utf8');
    fs.writeFileSync(path.join(wsDir, 'readme.md'), 'hello workspace\n', 'utf8');

    // Symlink inside workspace escaping outside
    fs.symlinkSync(path.join(outsideDir, 'pwn.txt'), path.join(wsDir, 'escape-read.txt'));
    // Symlink inside source (both escaping and intra-source target)
    fs.symlinkSync(outsideDir, path.join(srcDir, 'linked-out'), 'dir');
    fs.writeFileSync(path.join(srcDir, 'real.md'), 'real\n', 'utf8');
    fs.symlinkSync(path.join(srcDir, 'real.md'), path.join(srcDir, 'intra-link.md'));

    const ws = service.initWorkspace({ root_path: wsDir });
    const src = service.bindSource({
      workspace_id: ws.workspace_id,
      scope: 'project_local',
      root_path: srcDir,
    });

    // readWorkspaceFile works for legitimate files and enforces max_bytes & confinement
    const okRead = service.readWorkspaceFile({
      workspace_id: ws.workspace_id,
      path: 'readme.md',
    });
    assert.equal(okRead.content, 'hello workspace\n');

    assert.throws(
      () => service.readWorkspaceFile({ workspace_id: ws.workspace_id, path: 'readme.md', max_bytes: 5 }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'FILE_TOO_LARGE',
    );
    assert.throws(
      () => service.readWorkspaceFile({ workspace_id: ws.workspace_id, path: '../outside/pwn.txt' }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'PATH_OUTSIDE_WORKSPACE',
    );
    assert.throws(
      () => service.readWorkspaceFile({ workspace_id: ws.workspace_id, path: 'escape-read.txt' }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'PATH_OUTSIDE_WORKSPACE',
    );

    // Writeback rejects traversal, absolute paths, symlink dirs, and intra-source symlinks
    for (const badPath of [
      '../outside/pwn.txt',
      '/tmp/abs.txt',
      'linked-out/evil.md',
      'intra-link.md',
    ]) {
      assert.throws(
        () =>
          service.proposeWriteback({
            source_id: src.source_id,
            target_path: badPath,
            content: 'x',
          }),
        (err: unknown) => err instanceof WorkspaceError && err.code === 'PATH_OUTSIDE_SOURCE',
        `Expected PATH_OUTSIDE_SOURCE for '${badPath}'`,
      );
    }
    assert.equal(fs.readFileSync(path.join(outsideDir, 'pwn.txt'), 'utf8'), 'secret\n');
    assert.equal(fs.readFileSync(path.join(srcDir, 'real.md'), 'utf8'), 'real\n');
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('commitWriteback atomically appends Ledger artifact_ref and rolls back both DB and disk on failure', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-ledger-'));
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    let ledgerCallbacks = 0;
    const service = createWorkspaceService({
      db,
      onLedgerAppended: () => {
        ledgerCallbacks += 1;
      },
    });
    const ws = service.initWorkspace({ root_path: path.join(tmpDir, 'ws') });
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const src = service.bindSource({
      workspace_id: ws.workspace_id,
      scope: 'project_local',
      root_path: srcDir,
    });

    const ts = new Date().toISOString();
    db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(
      'task-wb-1',
      ws.workspace_id,
      'mas',
      'Writeback Task',
      'Goal',
      'active',
      ts,
      ts,
    );

    // Failure in ledger FK rolls back source revision update and never writes file to disk
    assert.throws(() =>
      service.commitWriteback({
        source_id: src.source_id,
        target_path: 'output/should-not-exist.md',
        content: 'should rollback\n',
        ledger: {
          task_id: 'task-missing',
          owner_id: 'mas',
        },
      }),
    );
    assert.equal(fs.existsSync(path.join(srcDir, 'output', 'should-not-exist.md')), false);
    assert.equal(service.getSource(src.source_id).accepted_revision, '1');

    // Valid task commits writeback + ledger entry atomically
    const committed = service.commitWriteback({
      source_id: src.source_id,
      target_path: 'output/accepted.md',
      content: 'accepted result\n',
      ledger: {
        task_id: 'task-wb-1',
        owner_id: 'mas',
        role: 'producer',
      },
    });
    assert.ok(committed.ledger_entry_id);
    assert.equal(ledgerCallbacks, 1);
    assert.equal(fs.readFileSync(path.join(srcDir, 'output', 'accepted.md'), 'utf8'), 'accepted result\n');

    const entries = queryTimeline(db, { task_id: 'task-wb-1' });
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.entry_kind, 'artifact_ref');
    assert.equal(entries[0]?.entry_id, committed.ledger_entry_id);
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('commitWriteback rejects stale proposal_id with current accepted_revision, mismatched workspace_id, missing workspace_id for expected_workspace_revision, escaping ancestor symlinks, and nested-tx onLedgerAppended', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-iter2-'));
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    let ledgerCallbacks = 0;
    const service = createWorkspaceService({
      db,
      onLedgerAppended: () => {
        ledgerCallbacks += 1;
      },
    });
    const wsDir = path.join(tmpDir, 'ws');
    const wsOtherDir = path.join(tmpDir, 'ws-other');
    const srcDir = path.join(tmpDir, 'src');
    const outsideDir = path.join(tmpDir, 'outside');
    fs.mkdirSync(wsDir, { recursive: true });
    fs.mkdirSync(wsOtherDir, { recursive: true });
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'doc.md'), 'v1\n', 'utf8');
    fs.symlinkSync(outsideDir, path.join(wsDir, 'escape-dir'), 'dir');

    const ws = service.initWorkspace({ root_path: wsDir });
    const wsOther = service.initWorkspace({ root_path: wsOtherDir });
    const src = service.bindSource({
      workspace_id: ws.workspace_id,
      scope: 'project_local',
      root_path: srcDir,
    });

    // 1. Escaping directory symlink + nonexistent leaf throws PATH_OUTSIDE_WORKSPACE uniformly
    assert.throws(
      () => service.readWorkspaceFile({ workspace_id: ws.workspace_id, path: 'escape-dir/nonexistent.txt' }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'PATH_OUTSIDE_WORKSPACE',
    );

    // 2. expected_workspace_revision without workspace_id throws INVALID_INPUT
    assert.throws(
      () =>
        service.proposeWriteback({
          source_id: src.source_id,
          target_path: 'doc.md',
          content: 'no-ws\n',
          expected_workspace_revision: 1,
        }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'INVALID_INPUT',
    );
    assert.throws(
      () =>
        service.commitWriteback({
          source_id: src.source_id,
          target_path: 'doc.md',
          content: 'no-ws\n',
          expected_workspace_revision: 1,
        }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'INVALID_INPUT',
    );

    // 3. Stale proposal_id + current accepted_revision override fails with REVISION_CONFLICT
    const staleProposal = service.proposeWriteback({
      workspace_id: ws.workspace_id,
      source_id: src.source_id,
      target_path: 'doc.md',
      content: 'from-stale-proposal\n',
    });
    const advanced = service.commitWriteback({
      workspace_id: ws.workspace_id,
      source_id: src.source_id,
      target_path: 'doc.md',
      content: 'v2\n',
    });
    assert.equal(advanced.new_revision, '2');

    assert.throws(
      () =>
        service.commitWriteback({
          proposal_id: staleProposal.proposal_id,
          content: 'from-stale-proposal\n',
          accepted_revision: '2',
        }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'REVISION_CONFLICT',
    );

    // 4. Proposal workspace_id mismatch fails with INVALID_INPUT
    const wsProposal = service.proposeWriteback({
      workspace_id: ws.workspace_id,
      source_id: src.source_id,
      target_path: 'doc.md',
      content: 'v3\n',
    });
    assert.throws(
      () =>
        service.commitWriteback({
          proposal_id: wsProposal.proposal_id,
          workspace_id: wsOther.workspace_id,
          content: 'v3\n',
        }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'INVALID_INPUT',
    );

    // 5. Nested transaction suppresses #onLedgerAppended until outer tx commits
    const ts = new Date().toISOString();
    db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)').run(
      'task-nested-1',
      ws.workspace_id,
      'mas',
      'Nested Task',
      'Goal',
      'active',
      ts,
      ts,
    );
    txImmediate(db, () => {
      service.commitWriteback({
        proposal_id: wsProposal.proposal_id,
        content: 'v3\n',
        ledger: { task_id: 'task-nested-1', owner_id: 'mas' },
      });
      assert.equal(ledgerCallbacks, 0);
    });
    assert.equal(ledgerCallbacks, 0);
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
