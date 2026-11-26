import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { KernelError, ensureStateDir, resolveStatePaths } from '../src/index.ts';

test('resolveStatePaths fails closed under test context without explicit state dir', () => {
  const prevStateDir = process.env.OPL_STATE_DIR;
  const prevDataDir = process.env.OPL_DATA_DIR;
  const prevTempEnv = process.env.OPL_REPO_TEMP_ENV_ACTIVE;
  try {
    delete process.env.OPL_STATE_DIR;
    delete process.env.OPL_DATA_DIR;
    delete process.env.OPL_REPO_TEMP_ENV_ACTIVE;

    assert.throws(
      () => resolveStatePaths(),
      (err: unknown) => err instanceof KernelError && err.code === 'STATE_DIR_FORBIDDEN',
    );
  } finally {
    if (prevStateDir !== undefined) process.env.OPL_STATE_DIR = prevStateDir;
    if (prevDataDir !== undefined) process.env.OPL_DATA_DIR = prevDataDir;
    if (prevTempEnv !== undefined) process.env.OPL_REPO_TEMP_ENV_ACTIVE = prevTempEnv;
  }
});

test('resolveStatePaths honors explicit stateDir and OPL_STATE_DIR and ensureStateDir creates dirs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-paths-'));
  const prevStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = path.join(tmpDir, 'env-state');
    const fromEnv = resolveStatePaths();
    assert.equal(fromEnv.state_dir, path.resolve(tmpDir, 'env-state'));
    assert.equal(fromEnv.db_file, path.join(fromEnv.state_dir, 'opl.db'));
    assert.equal(fromEnv.lock_file, path.join(fromEnv.state_dir, 'run', 'opld.lock'));
    assert.equal(fromEnv.session_file, path.join(fromEnv.state_dir, 'run', 'opld.session.json'));

    const explicit = resolveStatePaths({ stateDir: path.join(tmpDir, 'arg-state') });
    assert.equal(explicit.state_dir, path.resolve(tmpDir, 'arg-state'));

    ensureStateDir(explicit);
    assert.equal(fs.existsSync(explicit.state_dir), true);
    assert.equal(fs.existsSync(explicit.run_dir), true);
  } finally {
    if (prevStateDir !== undefined) process.env.OPL_STATE_DIR = prevStateDir;
    else delete process.env.OPL_STATE_DIR;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
