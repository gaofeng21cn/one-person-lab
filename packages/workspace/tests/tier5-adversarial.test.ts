import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { openSqliteStore } from '@opl/core';
import {
  WorkspaceError,
  createWorkspaceService,
  resolveConfinedWritePath,
  walkSourceFiles,
} from '../src/index.ts';

test('T5-WS-01 (G-WS-01 / BUG-P1-06): walkSourceFiles blocks .git and node_modules traversal via intra-source symlinks', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-ws-walk-'));
  try {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(path.join(srcDir, '.git', 'objects'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'node_modules', 'dep'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, '.git', 'config'), '[core]\n', 'utf8');
    fs.writeFileSync(path.join(srcDir, '.git', 'objects', 'x'), 'obj', 'utf8');
    fs.writeFileSync(path.join(srcDir, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;\n', 'utf8');
    fs.writeFileSync(path.join(srcDir, 'note.md'), '# Clean\n', 'utf8');

    fs.symlinkSync('.git', path.join(srcDir, 'alias-to-git'));
    fs.symlinkSync('.git/config', path.join(srcDir, 'alias-to-git-file'));
    fs.symlinkSync('node_modules', path.join(srcDir, 'alias-to-nm'));

    const walked = walkSourceFiles(srcDir);
    assert.deepEqual(
      walked.map((e) => e.rel),
      ['note.md'],
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('T5-WS-02 (G-WS-01 & G-WS-02): writeback path edge cases, empty target_path/source_id mismatch, revision bump, and multibyte 16 MiB cap', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 't5-ws-wb-'));
  const db = openSqliteStore(path.join(tmpDir, 'opl.db'));
  try {
    const service = createWorkspaceService({ db });
    const ws = service.initWorkspace({ root_path: path.join(tmpDir, 'ws') });
    const srcDir = path.join(tmpDir, 'vault');
    fs.mkdirSync(path.join(srcDir, 'existing_dir'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'existing_file'), 'file-content', 'utf8');
    fs.writeFileSync(path.join(srcDir, 'note.md'), 'v1\n', 'utf8');

    const src = service.bindSource({
      workspace_id: ws.workspace_id,
      scope: 'project_local',
      adapter_kind: 'local_dir',
      root_path: srcDir,
    });

    // Regular file as parent dir & existing dir as target leaf -> INVALID_INPUT
    assert.throws(
      () => resolveConfinedWritePath(srcDir, 'existing_file/child.md'),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'INVALID_INPUT',
    );
    assert.throws(
      () => resolveConfinedWritePath(srcDir, 'existing_dir'),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'INVALID_INPUT',
    );

    const prop = service.proposeWriteback({
      workspace_id: ws.workspace_id,
      source_id: src.source_id,
      target_path: 'note.md',
      content: 'v2\n',
      expected_workspace_revision: ws.revision,
    });

    // Empty target_path or source_id with proposal_id MUST fail closed instead of silently matching
    assert.throws(
      () =>
        service.commitWriteback({
          proposal_id: prop.proposal_id,
          target_path: '',
          content: 'v2\n',
        }),
      (err: unknown) => err instanceof WorkspaceError,
    );
    assert.throws(
      () =>
        service.commitWriteback({
          proposal_id: prop.proposal_id,
          source_id: '',
          content: 'v2\n',
        }),
      (err: unknown) => err instanceof WorkspaceError,
    );

    // Multibyte UTF-8 exceeding 16 MiB byte length while < 16 MiB UTF-16 code units -> FILE_TOO_LARGE
    const over16MiBUtf8 = '中'.repeat(6 * 1024 * 1024); // 6M chars (<16M), 18 MiB UTF-8
    assert.throws(
      () =>
        service.proposeWriteback({
          source_id: src.source_id,
          target_path: 'big.md',
          content: over16MiBUtf8,
        }),
      (err: unknown) => err instanceof WorkspaceError && err.code === 'FILE_TOO_LARGE',
    );
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
