import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertRepoSourceByproductsClean,
  inspectRepoSourceByproducts,
} from '../../src/modules/workspace/repo-source-byproduct-guard.ts';

test('repo source byproduct guard uses the platform glob and excludes worktree internals', () => {
  const root = fs.mkdtempSync(path.join(process.env.OPL_REPO_TEMP_ROOT || os.tmpdir(), 'opl-source-guard-'));
  try {
    fs.mkdirSync(path.join(root, 'src', '__pycache__'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', '__pycache__', 'module.pyc'), 'cache');
    fs.mkdirSync(path.join(root, '.worktrees', 'candidate', 'node_modules'), { recursive: true });

    const report = inspectRepoSourceByproducts(root);
    assert.equal(report.status, 'blocked');
    assert.deepEqual(report.issues.map((issue) => issue.path), ['src/__pycache__']);
    assert.equal(report.authority_boundary.source_clean_counts_as_domain_ready, false);
    assert.throws(() => assertRepoSourceByproductsClean(root), /cache or install byproducts/);

    fs.rmSync(path.join(root, 'src', '__pycache__'), { recursive: true });
    assert.equal(assertRepoSourceByproductsClean(root).status, 'passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
