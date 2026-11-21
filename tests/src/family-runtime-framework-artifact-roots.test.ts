import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

function withStateDir<T>(stateDir: string, run: () => T): T {
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = stateDir;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
  }
}

async function load() {
  return import('../../src/adapters/execution/framework-owned-artifact-roots.ts');
}

test('exposes both framework artifact subtrees that exist', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-'));
  fs.mkdirSync(path.join(stateDir, 'runtime-state', 'stage-attempt-artifacts'), { recursive: true });
  fs.mkdirSync(path.join(stateDir, 'runtime-state', 'stage-artifact-identities'), { recursive: true });

  const { frameworkOwnedArtifactRoots } = await load();
  const roots = withStateDir(stateDir, frameworkOwnedArtifactRoots);
  assert.equal(roots.length, 2);
});

test('admits bytes and identity receipts under the framework subtrees', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-'));
  const artifacts = path.join(stateDir, 'runtime-state', 'stage-attempt-artifacts', 'sat_x');
  const identities = path.join(stateDir, 'runtime-state', 'stage-artifact-identities', 'sat_x');
  fs.mkdirSync(artifacts, { recursive: true });
  fs.mkdirSync(identities, { recursive: true });
  const artifact = path.join(artifacts, 'raw-executor-output.txt');
  const receipt = path.join(identities, 'receipt.json');
  fs.writeFileSync(artifact, 'raw\n');
  fs.writeFileSync(receipt, '{}\n');

  const { frameworkOwnedArtifactRoots, pathInsideRoots } = await load();
  const roots = withStateDir(stateDir, frameworkOwnedArtifactRoots);
  assert.equal(withStateDir(stateDir, () => pathInsideRoots(artifact, roots)), true);
  assert.equal(withStateDir(stateDir, () => pathInsideRoots(receipt, roots)), true);
});

test('still rejects a path outside every framework subtree', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-'));
  fs.mkdirSync(path.join(stateDir, 'runtime-state', 'stage-attempt-artifacts'), { recursive: true });
  const outside = path.join(stateDir, 'elsewhere.txt');
  fs.writeFileSync(outside, 'nope\n');

  const { frameworkOwnedArtifactRoots, pathInsideRoots } = await load();
  const roots = withStateDir(stateDir, frameworkOwnedArtifactRoots);
  assert.equal(withStateDir(stateDir, () => pathInsideRoots(outside, roots)), false);
});
