import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runNodeTestStep } from '../../scripts/test-lanes.mjs';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');

test('every Node test batch receives a distinct runner-owned OPL_STATE_DIR', () => {
  const captureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-lane-state-capture-'));
  const captureFile = path.join(captureRoot, 'state-dirs.txt');
  const callerStateDir = path.join(captureRoot, 'caller-state-must-not-be-used');

  try {
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
    assert.equal(fs.existsSync(callerStateDir), false);
    assert.equal(process.cwd(), repoRoot);
  } finally {
    fs.rmSync(captureRoot, { recursive: true, force: true });
  }
});
