import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openSqliteStore } from '@opl/core';

import { WorkspaceError, createWorkspaceService } from '../src/index.ts';

test('createSnapshot generates deterministic manifest, enforces immutability trigger, and verifies/reads files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-snap-'));
  const dbPath = path.join(tmpDir, 'opl.db');
  const db = openSqliteStore(dbPath);
  try {
    const service = createWorkspaceService({ db });
    const ws = service.initWorkspace({ root_path: path.join(tmpDir, 'ws') });
    const srcDir = path.join(tmpDir, 'vault');
    fs.mkdirSync(path.join(srcDir, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'notes', 'b.md'), 'body-b\n', 'utf8');
    fs.writeFileSync(path.join(srcDir, 'a.md'), 'body-a\n', 'utf8');

    const src = service.bindSource({
      workspace_id: ws.workspace_id,
      scope: 'long_term_topic',
      adapter_kind: 'obsidian_vault',
      root_path: srcDir,
    });

    const snap1 = service.createSnapshot({
      workspace_id: ws.workspace_id,
      stage_run_id: 'sr-1',
    });
    const snap2 = service.createSnapshot({
      workspace_id: ws.workspace_id,
      stage_run_id: 'sr-2',
    });

    assert.equal(snap1.manifest.file_count, 2);
    assert.deepEqual(
      snap1.manifest.files.map((f) => f.rel),
      ['a.md', 'notes/b.md'],
    );
    assert.equal(snap1.manifest.tree_sha256, snap2.manifest.tree_sha256);

    // Zero raw body content in manifest_json or DB
    assert.equal(snap1.snapshots[0]?.manifest_json.includes('body-a'), false);

    // Immutability trigger blocks UPDATE on knowledge_snapshots
    assert.throws(
      () => {
        db.prepare("UPDATE knowledge_snapshots SET revision = '99' WHERE snapshot_id = ?").run(
          snap1.snapshot_id,
        );
      },
      /knowledge_snapshots is immutable/,
    );

    // verifySnapshot passes initially and readSnapshotFile succeeds
    const verifyClean = service.verifySnapshot(snap1.snapshot_id);
    assert.equal(verifyClean.ok, true);
    const readNote = service.readSnapshotFile(snap1.snapshot_id, 'notes/b.md');
    assert.equal(readNote.content, 'body-b\n');

    // Drift on disk is detected by verifySnapshot and readSnapshotFile
    fs.writeFileSync(path.join(srcDir, 'notes', 'b.md'), 'drifted-b\n', 'utf8');
    const verifyDrifted = service.verifySnapshot(snap1.snapshot_id);
    assert.equal(verifyDrifted.ok, false);
    assert.equal(verifyDrifted.drifted.length, 1);
    assert.equal(verifyDrifted.drifted[0]?.rel, 'notes/b.md');

    assert.throws(
      () => service.readSnapshotFile(snap1.snapshot_id, 'notes/b.md'),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'REVISION_CONFLICT',
    );
    const allowedDrifted = service.readSnapshotFile(snap1.snapshot_id, 'notes/b.md', {
      allow_drifted: true,
    });
    assert.equal(allowedDrifted.content, 'drifted-b\n');
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('createSnapshot fails closed on revoked/unavailable/vanished source and persists unavailable', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-snap-fail-'));
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    const service = createWorkspaceService({ db });
    const srcRevokedDir = path.join(tmpDir, 'revoked-src');
    const srcVanishDir = path.join(tmpDir, 'vanish-src');
    fs.mkdirSync(srcRevokedDir, { recursive: true });
    fs.mkdirSync(srcVanishDir, { recursive: true });

    const srcRevoked = service.bindSource({
      scope: 'project_local',
      root_path: srcRevokedDir,
    });
    service.removeSource({ source_id: srcRevoked.source_id });
    assert.throws(
      () => service.createSnapshot({ stage_run_id: 'sr-revoked', source_id: srcRevoked.source_id }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'SOURCE_REVOKED',
    );

    const srcVanish = service.bindSource({
      scope: 'project_local',
      root_path: srcVanishDir,
    });
    fs.rmSync(srcVanishDir, { recursive: true, force: true });
    assert.throws(
      () => service.createSnapshot({ stage_run_id: 'sr-vanish', source_id: srcVanish.source_id }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'SOURCE_UNAVAILABLE',
    );

    // Unavailable status persisted even though createSnapshot threw
    const persisted = db
      .prepare('SELECT status FROM knowledge_sources WHERE source_id = ?')
      .get(srcVanish.source_id) as { status: string };
    assert.equal(persisted.status, 'unavailable');
    assert.equal(service.listSnapshots({ source_id: srcVanish.source_id }).length, 0);
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('walkSourceFiles survives dangling symlinks and symlink directory cycles safely', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-symlink-walk-'));
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    const service = createWorkspaceService({ db });
    const srcDir = path.join(tmpDir, 'src');
    const subDir = path.join(srcDir, 'sub');
    const outsideDir = path.join(tmpDir, 'outside');
    fs.mkdirSync(subDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'keep.md'), 'keep\n', 'utf8');
    fs.writeFileSync(path.join(outsideDir, 'secret.md'), 'outside-secret\n', 'utf8');

    // Dangling symlink
    fs.symlinkSync(path.join(tmpDir, 'non-existent-target.md'), path.join(srcDir, 'dangling.md'));
    // Escaping symlink
    fs.symlinkSync(path.join(outsideDir, 'secret.md'), path.join(srcDir, 'escape.md'));
    // Self-referential symlink directory loop
    fs.symlinkSync(srcDir, path.join(subDir, 'loop-back'), 'dir');

    const src = service.bindSource({
      scope: 'project_local',
      root_path: srcDir,
    });
    const snap = service.createSnapshot({
      stage_run_id: 'sr-symlink',
      source_id: src.source_id,
    });

    assert.deepEqual(
      snap.manifest.files.map((f) => f.rel),
      ['keep.md'],
    );
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('walkSourceFiles prioritizes canonical directories over alphabetically earlier intra-source directory symlinks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-canonical-dir-'));
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    const service = createWorkspaceService({ db });
    const srcDir = path.join(tmpDir, 'src');
    const zReal = path.join(srcDir, 'z_real');
    fs.mkdirSync(zReal, { recursive: true });
    fs.writeFileSync(path.join(zReal, 'inside.md'), 'canonical body\n', 'utf8');
    fs.symlinkSync(zReal, path.join(srcDir, 'a_alias'), 'dir');

    const src = service.bindSource({
      scope: 'project_local',
      root_path: srcDir,
    });
    const snap = service.createSnapshot({
      stage_run_id: 'sr-canonical',
      source_id: src.source_id,
    });

    assert.deepEqual(
      snap.manifest.files.map((f) => f.rel),
      ['z_real/inside.md'],
    );
    const readBack = service.readSnapshotFile(snap.snapshot_id, 'z_real/inside.md');
    assert.equal(readBack.content, 'canonical body\n');
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
