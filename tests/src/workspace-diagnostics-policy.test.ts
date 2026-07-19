import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY,
  materializeFindings,
} from '../../src/modules/workspace/index.ts';
import {
  assertRepoSourceByproductsClean,
  fixRepoSourceByproducts,
  inspectRepoSourceByproducts,
} from '../../src/modules/workspace/repo-source-byproduct-guard.ts';
import { runCli } from './cli/helpers.ts';

test('workspace diagnostics keep hard blockers fail-closed when policy lists overlap', () => {
  const findings = materializeFindings(
    {
      ...DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY,
      repairable_finding_codes: [
        ...DEFAULT_WORKSPACE_DIAGNOSTIC_POLICY.repairable_finding_codes,
        'workspace_index_missing',
      ],
    },
    '/tmp/opl-workspace',
    [{
      code: 'workspace_index_missing',
      message: 'workspace_index.json is missing.',
    }],
  );

  assert.equal(findings[0].severity, 'hard_blocker');
  assert.equal(findings[0].default_blocks_execution, true);
  assert.equal(findings[0].repair_command, undefined);
});

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

test('workspace source-hygiene fix removes only ignored scan hits without following links', () => {
  const tempRoot = process.env.OPL_REPO_TEMP_ROOT || os.tmpdir();
  const root = fs.mkdtempSync(path.join(tempRoot, 'opl-source-fix-'));
  const outside = fs.mkdtempSync(path.join(tempRoot, 'opl-source-fix-outside-'));
  try {
    const initialized = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' });
    assert.equal(initialized.status, 0, initialized.stderr);
    fs.writeFileSync(path.join(root, '.gitignore'), '.venv/\nnode_modules\n');
    fs.mkdirSync(path.join(root, '.venv'));
    fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'preserve');
    fs.symlinkSync(outside, path.join(root, 'node_modules'));
    fs.mkdirSync(path.join(root, 'dist'));

    assert.throws(
      () => fixRepoSourceByproducts(root),
      /unignored or unremovable cache or install byproducts/,
    );
    assert.equal(fs.existsSync(path.join(root, '.venv')), false);
    assert.equal(fs.existsSync(path.join(root, 'node_modules')), false);
    assert.equal(fs.existsSync(path.join(outside, 'sentinel.txt')), true);
    assert.equal(fs.existsSync(path.join(root, 'dist')), true);

    fs.appendFileSync(path.join(root, '.gitignore'), 'dist/\n');
    const output = runCli(['workspace', 'source-hygiene', '--source-root', root, '--fix']);
    assert.equal(output.status, 'passed');
    assert.deepEqual(output.cleanup.removed_paths, ['dist']);
    assert.deepEqual(output.cleanup.skipped_paths, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});
