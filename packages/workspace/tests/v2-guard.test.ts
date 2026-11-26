import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runV2ImportGuard } from '../../../scripts/check-v2-import-guard.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('v2:guard passes for @opl/workspace with DAG [core, ledger] and DQS=0 single-quoted SQL', () => {
  const report = runV2ImportGuard({ rootDir: REPO_ROOT });
  assert.equal(report.ok, true, JSON.stringify(report.violations, null, 2));
  assert.ok(report.packagesChecked.includes('workspace'));
  assert.ok(report.dagEdges.includes('workspace -> core'));
  assert.ok(report.dagEdges.includes('workspace -> ledger'));
});

test('compiled dist/ ESM entrypoint resolves cleanly for @opl/workspace', async () => {
  const distIndex = path.join(REPO_ROOT, 'packages', 'workspace', 'dist', 'index.js');
  const distDts = path.join(REPO_ROOT, 'packages', 'workspace', 'dist', 'index.d.ts');
  assert.equal(fs.existsSync(distIndex), true);
  assert.equal(fs.existsSync(distDts), true);

  const mod = (await import('@opl/workspace')) as Record<string, unknown>;
  assert.equal(typeof mod.WorkspaceService, 'function');
  assert.equal(typeof mod.createWorkspaceService, 'function');
  assert.equal(typeof mod.ensureWorkspaceSchema, 'function');
  assert.equal(typeof mod.WorkspaceError, 'function');
});
