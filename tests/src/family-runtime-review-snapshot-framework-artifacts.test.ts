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
  return import('../../src/adapters/execution/family-runtime-review-transport-store.ts');
}

test('admits a framework-owned stage-attempt artifact outside the workspace root', async () => {
  // A producer that closes out with a raw artifact leaves its bytes in
  // <state_dir>/runtime-state/stage-attempt-artifacts/<attempt>/, which is a sibling of the
  // domain workspace root. The Reviewer snapshot has to carry those bytes.
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-'));
  const workspaceRoot = path.join(stateDir, 'foundry');
  const artifactDir = path.join(stateDir, 'runtime-state', 'stage-attempt-artifacts', 'sat_x');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifact = path.join(artifactDir, 'raw-executor-output.txt');
  fs.writeFileSync(artifact, 'raw\n');

  const { resolveContainedWorkspaceFile } = await load();
  const resolved = withStateDir(stateDir, () => resolveContainedWorkspaceFile(workspaceRoot, artifact));
  assert.equal(resolved.source_path, fs.realpathSync.native(artifact));
});

test('still rejects a path outside both the workspace and the framework root', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-'));
  const workspaceRoot = path.join(stateDir, 'foundry');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const outside = path.join(stateDir, 'elsewhere.txt');
  fs.writeFileSync(outside, 'nope\n');

  const { resolveContainedWorkspaceFile } = await load();
  assert.throws(
    () => withStateDir(stateDir, () => resolveContainedWorkspaceFile(workspaceRoot, outside)),
    /escapes the declared workspace root/,
  );
});

test('still admits a path inside the workspace root', async () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-state-'));
  const workspaceRoot = path.join(stateDir, 'foundry');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  const inside = path.join(workspaceRoot, 'run.json');
  fs.writeFileSync(inside, '{}\n');

  const { resolveContainedWorkspaceFile } = await load();
  const resolved = withStateDir(stateDir, () => resolveContainedWorkspaceFile(workspaceRoot, inside));
  assert.equal(resolved.source_path, fs.realpathSync.native(inside));
});
