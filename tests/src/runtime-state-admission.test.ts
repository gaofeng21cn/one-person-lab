import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const fixture = 'tests/fixtures/runtime-state-paths/node-test-state-admission.test.mjs';
const sentinelBytes = Buffer.from('default-state-must-remain-untouched\n');

function defaultStateDir(homeRoot: string) {
  return path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state');
}

function childTestEnv(homeRoot: string, overrides: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: homeRoot };
  delete env.OPL_STATE_DIR;
  delete env.OPL_DATA_DIR;
  delete env.AIONUI_DATA_DIR;
  delete env.OPL_REPO_TEMP_ENV_ACTIVE;
  delete env.OPL_REPO_TEMP_ROOT;
  delete env.NODE_TEST_CONTEXT;
  delete env.JEST_WORKER_ID;
  delete env.VITEST_WORKER_ID;
  return { ...env, ...overrides };
}

function runAdmissionProbe(env: NodeJS.ProcessEnv) {
  return spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--test', fixture],
    { cwd: repoRoot, encoding: 'utf8', env },
  );
}

function seedDefaultState(homeRoot: string) {
  const stateDir = defaultStateDir(homeRoot);
  const sentinel = path.join(stateDir, 'sentinel.txt');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(sentinel, sentinelBytes);
  return { stateDir, sentinel };
}

function assertDefaultStateUntouched(stateDir: string, sentinel: string) {
  assert.deepEqual(fs.readFileSync(sentinel), sentinelBytes);
  assert.deepEqual(fs.readdirSync(stateDir), ['sentinel.txt']);
}

test('direct Node test context without OPL_STATE_DIR fails before touching default state', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-state-admission-blocked-'));
  const homeRoot = path.join(root, 'home');
  const { stateDir, sentinel } = seedDefaultState(homeRoot);

  try {
    const result = runAdmissionProbe(childTestEnv(homeRoot, {
      OPL_TEST_EXPECT_STATE_ADMISSION: 'blocked',
    }));

    assert.equal(result.status, 0, result.stderr);
    assertDefaultStateUntouched(stateDir, sentinel);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('direct Node test context may open an explicitly isolated OPL_STATE_DIR', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-state-admission-allowed-'));
  const homeRoot = path.join(root, 'home');
  const explicitStateDir = path.join(root, 'explicit-state');
  const { stateDir, sentinel } = seedDefaultState(homeRoot);

  try {
    const result = runAdmissionProbe(childTestEnv(homeRoot, {
      OPL_STATE_DIR: explicitStateDir,
      OPL_TEST_EXPECT_STATE_ADMISSION: 'allowed',
    }));

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(explicitStateDir, 'family-runtime', 'queue.sqlite')), true);
    assertDefaultStateUntouched(stateDir, sentinel);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('repo temp test context may open a state path contained by its declared temp root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-state-admission-repo-temp-'));
  const homeRoot = path.join(root, 'home');
  const { stateDir, sentinel } = seedDefaultState(homeRoot);

  try {
    const result = runAdmissionProbe(childTestEnv(homeRoot, {
      OPL_REPO_TEMP_ENV_ACTIVE: '1',
      OPL_REPO_TEMP_ROOT: root,
      OPL_TEST_EXPECT_STATE_ADMISSION: 'repo-temp-allowed',
    }));

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readFileSync(sentinel), sentinelBytes);
    assert.deepEqual(fs.readdirSync(stateDir), ['family-runtime', 'sentinel.txt']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
