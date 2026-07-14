import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runNodeTestStep } from '../../scripts/test-lanes.mjs';
import { runCli, runCliAsync, runCliReadOnly } from './cli/helpers.ts';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

function processExists(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
      return false;
    }
    throw error;
  }
}

async function waitForProcessExit(pid: number) {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (!processExists(pid)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.fail(`Process ${pid} remained alive after its failed test lane step exited.`);
}

test('every Node test batch receives a distinct runner-owned OPL_STATE_DIR', () => {
  const captureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-lane-state-capture-'));
  const captureFile = path.join(captureRoot, 'state-dirs.txt');
  const callerStateDir = path.join(captureRoot, 'caller-state-must-not-be-used');
  const callerRegistryFile = path.join(callerStateDir, 'workspace-registry.json');
  const callerRegistryBytes = Buffer.from('{"version":"g2","bindings":[{"sentinel":true}]}\n');

  try {
    fs.mkdirSync(callerStateDir, { recursive: true });
    fs.writeFileSync(callerRegistryFile, callerRegistryBytes);
    const result = runNodeTestStep({
      kind: 'node-test',
      files: [
        'tests/fixtures/test-lanes/state-probe-a.mjs',
        'tests/fixtures/test-lanes/state-probe-b.mjs',
      ],
      stripTypes: false,
      batchSize: 1,
      env: {
        NODE_TEST_CONTEXT: undefined,
        OPL_STATE_DIR: callerStateDir,
        OPL_TEST_BATCH_STATE_CAPTURE_FILE: captureFile,
      },
    }, {
      laneName: 'state-isolation-test',
      stepIndex: 0,
    });

    assert.equal(result.status, 0);
    const stateDirs = fs.readFileSync(captureFile, 'utf8').trim().split('\n');
    assert.equal(stateDirs.length, 2);
    assert.equal(new Set(stateDirs).size, 2);
    assert.equal(stateDirs.includes(callerStateDir), false);
    for (const stateDir of stateDirs) {
      assert.equal(fs.statSync(stateDir).isDirectory(), true);
      assert.equal(path.relative(os.tmpdir(), stateDir).startsWith('..'), false);
    }
    assert.deepEqual(fs.readFileSync(callerRegistryFile), callerRegistryBytes);
    assert.equal(process.cwd(), repoRoot);
  } finally {
    fs.rmSync(captureRoot, { recursive: true, force: true });
  }
});

test('a failed Node test step cleans up its detached process group', {
  skip: process.platform === 'win32',
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-lane-process-group-'));
  const pidFile = path.join(root, 'orphan.pid');
  let childPid: number | null = null;

  try {
    const result = runNodeTestStep({
      kind: 'node-test',
      files: ['tests/fixtures/test-lanes/failing-orphan-probe.test.mjs'],
      stripTypes: false,
      batchSize: 1,
      env: {
        NODE_TEST_CONTEXT: undefined,
        OPL_TEST_LANE_ORPHAN_PID_FILE: pidFile,
      },
    }, {
      laneName: 'process-group-cleanup-test',
      stepIndex: 0,
    });

    assert.notEqual(result.status, 0);
    childPid = Number(fs.readFileSync(pidFile, 'utf8'));
    assert.equal(Number.isSafeInteger(childPid) && childPid > 0, true);
    await waitForProcessExit(childPid);
  } finally {
    if (childPid && processExists(childPid)) {
      process.kill(childPid, 'SIGKILL');
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('direct CLI test helpers never inherit the caller workspace registry', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-cli-helper-state-isolation-'));
  const callerStateDir = path.join(root, 'caller-state');
  const callerRegistryFile = path.join(callerStateDir, 'workspace-registry.json');
  const workspaceRoot = path.join(root, 'workspaces');
  const callerRegistryBytes = Buffer.from('{"version":"g2","bindings":[],"sentinel":"caller-registry"}\n');
  const previousStateDir = process.env.OPL_STATE_DIR;

  try {
    fs.mkdirSync(callerStateDir, { recursive: true });
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(callerRegistryFile, callerRegistryBytes);
    process.env.OPL_STATE_DIR = callerStateDir;

    const initialized = runCli([
      'workspace',
      'init',
      '--agent',
      'rca',
      '--workspace-root',
      workspaceRoot,
      '--workspace-id',
      'state-isolation-probe',
      '--project-id',
      'deck-probe',
    ]).workspace_initialization;
    const asyncCatalog = (await runCliAsync(['workspace', 'list'])).workspace_catalog as {
      state_dir: string;
    };
    const readOnlyCatalog = (await runCliReadOnly(['workspace', 'list'])).workspace_catalog;

    assert.equal(initialized.workspace_id, 'state-isolation-probe');
    assert.notEqual(asyncCatalog.state_dir, callerStateDir);
    assert.notEqual(readOnlyCatalog.state_dir, callerStateDir);
    assert.equal(process.env.OPL_STATE_DIR, callerStateDir);
    assert.deepEqual(fs.readFileSync(callerRegistryFile), callerRegistryBytes);
  } finally {
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
