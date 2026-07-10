import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCli } from './cli/helpers.ts';
import {
  assertRepoSourceByproductsClean,
  inspectRepoSourceByproducts,
} from '../../src/modules/workspace/repo-source-byproduct-guard.ts';

test('repo source byproduct guard fails closed and excludes worktree internals', () => {
  const root = fs.mkdtempSync(path.join(process.env.OPL_REPO_TEMP_ROOT || os.tmpdir(), 'opl-source-guard-'));
  try {
    fs.mkdirSync(path.join(root, 'src', '__pycache__'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', '__pycache__', 'module.pyc'), 'cache');
    fs.writeFileSync(path.join(root, '.hidden.pyc'), 'hidden cache');
    fs.writeFileSync(path.join(root, '.egg-info'), 'hidden install metadata');
    fs.writeFileSync(path.join(root, 'legacy.egg-info'), 'install metadata');
    fs.mkdirSync(path.join(root, '.worktrees', 'candidate', 'node_modules'), { recursive: true });
    fs.symlinkSync(path.join(root, 'missing-node-modules'), path.join(root, 'node_modules'));

    const report = inspectRepoSourceByproducts(root);
    assert.equal(report.status, 'blocked');
    assert.deepEqual(report.issues.map((issue) => issue.path), [
      '.egg-info',
      '.hidden.pyc',
      'legacy.egg-info',
      'node_modules',
      'src/__pycache__',
    ]);
    assert.equal(report.issues[0]?.byproduct_type, 'file');
    assert.equal(report.authority_boundary.source_clean_counts_as_domain_ready, false);
    assert.throws(() => assertRepoSourceByproductsClean(root), /cache or install byproducts/);

    fs.rmSync(path.join(root, 'src', '__pycache__'), { recursive: true });
    fs.rmSync(path.join(root, '.hidden.pyc'));
    fs.rmSync(path.join(root, '.egg-info'));
    fs.rmSync(path.join(root, 'legacy.egg-info'));
    fs.rmSync(path.join(root, 'node_modules'));
    assert.equal(assertRepoSourceByproductsClean(root).status, 'passed');

    fs.mkdirSync(path.join(root, 'locked'));
    fs.chmodSync(path.join(root, 'locked'), 0o000);
    assert.equal(inspectRepoSourceByproducts(root).status, 'blocked');
    fs.chmodSync(path.join(root, 'locked'), 0o700);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('workspace source-hygiene is the public fail-closed transport', () => {
  const root = fs.mkdtempSync(path.join(process.env.OPL_REPO_TEMP_ROOT || os.tmpdir(), 'opl-source-cli-'));
  try {
    const output = runCli(['workspace', 'source-hygiene', '--source-root', root]);
    assert.equal(output.surface_kind, 'opl_repo_source_byproduct_guard');
    assert.equal(output.status, 'passed');

    fs.mkdirSync(path.join(root, '.venv'));
    assert.throws(
      () => runCli(['workspace', 'source-hygiene', '--source-root', root]),
      /cache or install byproducts/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
