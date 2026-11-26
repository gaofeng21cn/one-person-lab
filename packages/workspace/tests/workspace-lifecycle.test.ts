import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openSqliteStore } from '@opl/core';

import { WorkspaceError, createWorkspaceService } from '../src/index.ts';

function setupWorkspaceFixture() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ws-life-'));
  const dbPath = path.join(tmpDir, 'opl.db');
  const db = openSqliteStore(dbPath);
  let mutations = 0;
  const service = createWorkspaceService({
    db,
    onMutate: () => {
      mutations += 1;
    },
  });
  return {
    tmpDir,
    db,
    service,
    getMutations: () => mutations,
    cleanup: () => {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}

test('initWorkspace creates directory, assigns revision=1, and rejects duplicate root_path and symlink aliases', () => {
  const fx = setupWorkspaceFixture();
  try {
    const wsRoot = path.join(fx.tmpDir, 'projects', 'study-a');
    const created = fx.service.initWorkspace({
      root_path: wsRoot,
      name: 'Study A',
      domain_id: 'mas',
      metadata: { stage: 'draft' },
    });

    assert.equal(fs.existsSync(wsRoot), true);
    assert.equal(created.name, 'Study A');
    assert.equal(created.domain_id, 'mas');
    assert.equal(created.revision, 1);
    assert.equal(created.root_path, fs.realpathSync(wsRoot));
    assert.deepEqual(JSON.parse(created.metadata_json), { stage: 'draft' });
    assert.equal(fx.getMutations(), 1);

    // Direct duplicate root_path fails with WORKSPACE_DUPLICATE
    assert.throws(
      () => fx.service.initWorkspace({ root_path: wsRoot }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'WORKSPACE_DUPLICATE',
    );

    // Symlink alias pointing to same directory also fails with WORKSPACE_DUPLICATE
    const aliasPath = path.join(fx.tmpDir, 'study-a-link');
    fs.symlinkSync(wsRoot, aliasPath, 'dir');
    assert.throws(
      () => fx.service.initWorkspace({ root_path: aliasPath }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'WORKSPACE_DUPLICATE',
    );

    // Dangling symlink root_path fails with WorkspaceError('INVALID_PATH') instead of raw ENOENT
    const danglingRoot = path.join(fx.tmpDir, 'dangling-ws-link');
    fs.symlinkSync(path.join(fx.tmpDir, 'missing-target-dir'), danglingRoot, 'dir');
    assert.throws(
      () => fx.service.initWorkspace({ root_path: danglingRoot }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'INVALID_PATH',
    );
  } finally {
    fx.cleanup();
  }
});

test('listWorkspaces, inspectWorkspace, and updateWorkspaceRevision CAS enforce optimistic concurrency', () => {
  const fx = setupWorkspaceFixture();
  try {
    const ws1 = fx.service.initWorkspace({ root_path: path.join(fx.tmpDir, 'ws1') });
    const ws2 = fx.service.initWorkspace({ root_path: path.join(fx.tmpDir, 'ws2'), domain_id: 'mag' });

    const listed = fx.service.listWorkspaces();
    assert.equal(listed.length, 2);
    assert.deepEqual(
      listed.map((w) => w.workspace_id),
      [ws1.workspace_id, ws2.workspace_id],
    );

    const inspected = fx.service.inspectWorkspace(ws1.workspace_id);
    assert.equal(inspected.workspace.workspace_id, ws1.workspace_id);
    assert.deepEqual(inspected.sources, []);
    assert.deepEqual(inspected.snapshots, []);

    // CAS update succeeds
    const updated = fx.service.updateWorkspaceRevision({
      workspace_id: ws1.workspace_id,
      expected_revision: 1,
      name: 'Study 1 Renamed',
      domain_id: 'mas',
      metadata_patch: { owner: 'lead', count: 2 },
    });
    assert.equal(updated.revision, 2);
    assert.equal(updated.name, 'Study 1 Renamed');
    assert.equal(updated.domain_id, 'mas');
    assert.deepEqual(JSON.parse(updated.metadata_json), { owner: 'lead', count: 2 });

    // Stale expected_revision rejects with REVISION_CONFLICT
    assert.throws(
      () =>
        fx.service.updateWorkspaceRevision({
          workspace_id: ws1.workspace_id,
          expected_revision: 1,
          name: 'Stale Overwrite',
        }),
      (err: unknown) =>
        err instanceof WorkspaceError
        && err.code === 'REVISION_CONFLICT'
        && err.rpcCode === -32009,
    );

    // Unknown workspace rejects with WORKSPACE_NOT_FOUND
    assert.throws(
      () => fx.service.getWorkspace('ws_missing'),
      (err: unknown) =>
        err instanceof WorkspaceError
        && err.code === 'WORKSPACE_NOT_FOUND'
        && err.rpcCode === -32004,
    );
  } finally {
    fx.cleanup();
  }
});
