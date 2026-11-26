import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openSqliteStore } from '@opl/core';

import { WorkspaceError, createWorkspaceService } from '../src/index.ts';

function containsBytesInDbOrWal(dbPath: string, needle: string): boolean {
  const needleBuf = Buffer.from(needle, 'utf8');
  for (const candidate of [dbPath, `${dbPath}-wal`]) {
    if (fs.existsSync(candidate)) {
      const buf = fs.readFileSync(candidate);
      if (buf.includes(needleBuf)) return true;
    }
  }
  return false;
}

test('in-situ knowledge sources bind via join table without copying raw body bytes into SQLite', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-ksrc-'));
  const dbPath = path.join(tmpDir, 'opl.db');
  const db = openSqliteStore(dbPath);
  try {
    const service = createWorkspaceService({ db });
    const ws = service.initWorkspace({ root_path: path.join(tmpDir, 'ws') });

    const obsidianDir = path.join(tmpDir, 'external-obsidian-vault');
    const localDir = path.join(tmpDir, 'external-local-notes');
    fs.mkdirSync(obsidianDir, { recursive: true });
    fs.mkdirSync(localDir, { recursive: true });

    const secretSentinelBody = 'INSITU_RAW_BODY_SENTINEL_NEVER_IN_SQLITE_9F2A11';
    fs.writeFileSync(path.join(obsidianDir, 'profile.md'), `# Profile\n${secretSentinelBody}\n`, 'utf8');
    fs.writeFileSync(path.join(localDir, 'methods.md'), '# Methods\nStandard RCT\n', 'utf8');

    const srcObs = service.bindSource({
      workspace_id: ws.workspace_id,
      scope: 'personal_profile',
      adapter_kind: 'obsidian_vault',
      root_path: obsidianDir,
    });
    const srcLocal = service.bindSource({
      workspace_id: ws.workspace_id,
      scope: 'project_local',
      adapter_kind: 'local_dir',
      root_path: localDir,
    });

    assert.equal(srcObs.status, 'active');
    assert.equal(srcObs.adapter_kind, 'obsidian_vault');
    assert.equal(srcLocal.scope, 'project_local');

    // Join table has both rows
    const joinRows = db
      .prepare('SELECT workspace_id, source_id FROM workspace_knowledge_sources WHERE workspace_id = ?')
      .all(ws.workspace_id) as Array<{ workspace_id: string; source_id: string }>;
    assert.equal(joinRows.length, 2);

    // Zero raw body bytes in opl.db or opl.db-wal
    assert.equal(containsBytesInDbOrWal(dbPath, secretSentinelBody), false);

    // Invalid scope rejects cleanly
    assert.throws(
      () =>
        service.bindSource({
          workspace_id: ws.workspace_id,
          scope: 'bogus_scope' as never,
          root_path: localDir,
        }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'INVALID_INPUT',
    );
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('listSources reconciles missing directory on disk to unavailable and persists to SQLite, removeSource revokes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-ksrc-life-'));
  const dbPath = path.join(tmpDir, 'opl.db');
  const db = openSqliteStore(dbPath);
  try {
    const service = createWorkspaceService({ db });
    const ws = service.initWorkspace({ root_path: path.join(tmpDir, 'ws') });

    const dirA = path.join(tmpDir, 'src-a');
    const dirB = path.join(tmpDir, 'src-b');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    fs.writeFileSync(path.join(dirA, 'a.md'), 'alpha\n', 'utf8');
    fs.writeFileSync(path.join(dirB, 'b.md'), 'beta\n', 'utf8');

    const srcA = service.bindSource({
      workspace_id: ws.workspace_id,
      scope: 'long_term_topic',
      adapter_kind: 'local_dir',
      root_path: dirA,
    });
    const srcB = service.bindSource({
      workspace_id: ws.workspace_id,
      scope: 'project_local',
      adapter_kind: 'local_dir',
      root_path: dirB,
    });

    // refreshSourceRevision increments revision and enforces expected_revision
    const refreshed = service.refreshSourceRevision({ source_id: srcB.source_id });
    assert.equal(refreshed.previous_revision, '1');
    assert.equal(refreshed.new_revision, '2');
    assert.equal(refreshed.file_count, 1);

    assert.throws(
      () =>
        service.refreshSourceRevision({
          source_id: srcB.source_id,
          expected_revision: '1',
        }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'REVISION_CONFLICT',
    );

    // Delete dirA from disk -> listSources must persist status='unavailable'
    fs.rmSync(dirA, { recursive: true, force: true });
    const sources = service.listSources(ws.workspace_id);
    const reloadedA = sources.find((s) => s.source_id === srcA.source_id);
    assert.equal(reloadedA?.status, 'unavailable');

    const dbRowA = db
      .prepare('SELECT status FROM knowledge_sources WHERE source_id = ?')
      .get(srcA.source_id) as { status: string };
    assert.equal(dbRowA.status, 'unavailable');

    // removeSource revokes and unbinds from workspace
    const removed = service.removeSource({
      source_id: srcB.source_id,
      workspace_id: ws.workspace_id,
    });
    assert.equal(removed.removed, true);
    assert.equal(removed.status, 'revoked');

    const dbRowB = db
      .prepare('SELECT status FROM knowledge_sources WHERE source_id = ?')
      .get(srcB.source_id) as { status: string };
    assert.equal(dbRowB.status, 'revoked');

    const afterRemove = service.listSources(ws.workspace_id);
    assert.equal(afterRemove.some((s) => s.source_id === srcB.source_id), false);
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('listSources backfills legacy metadata_json.source_ids into workspace_knowledge_sources', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-legacy-'));
  const dbPath = path.join(tmpDir, 'opl.db');
  const db = openSqliteStore(dbPath);
  try {
    const service = createWorkspaceService({ db });
    const ws = service.initWorkspace({ root_path: path.join(tmpDir, 'ws') });
    const legacyDir = path.join(tmpDir, 'legacy-src');
    fs.mkdirSync(legacyDir, { recursive: true });

    const unboundSrc = service.bindSource({
      scope: 'personal_profile',
      adapter_kind: 'local_dir',
      root_path: legacyDir,
    });

    // Simulate legacy M1.5 workspace metadata_json.source_ids without join row
    db.prepare('UPDATE workspaces SET metadata_json = ? WHERE workspace_id = ?').run(
      JSON.stringify({ source_ids: [unboundSrc.source_id] }),
      ws.workspace_id,
    );

    const listed = service.listSources(ws.workspace_id);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.source_id, unboundSrc.source_id);

    const joinRow = db
      .prepare(
        'SELECT workspace_id, source_id FROM workspace_knowledge_sources WHERE workspace_id = ? AND source_id = ?',
      )
      .get(ws.workspace_id, unboundSrc.source_id);
    assert.ok(joinRow);
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
