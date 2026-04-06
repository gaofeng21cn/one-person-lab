import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const controlPlaneRoot = resolveControlPlaneRoot();
const contextRoot = path.join(controlPlaneRoot, '.omx', 'context');
const reportsRoot = path.join(controlPlaneRoot, '.omx', 'reports', 'opl-mainline');
const activePhase4SnapshotPattern = new RegExp(
  `${escapeForRegExp(path.join(contextRoot, 'opl-mainline-phase4-'))}[^\\s\`]+\\.md`,
  'g',
);

const currentProgramPath = path.join(contextRoot, 'CURRENT_PROGRAM.md');
const promptPath = path.join(contextRoot, 'OMX_TEAM_PROMPT.md');
const latestStatusPath = path.join(reportsRoot, 'LATEST_STATUS.md');
const openIssuesPath = path.join(reportsRoot, 'OPEN_ISSUES.md');

function resolveControlPlaneRoot() {
  const localCurrentProgram = path.join(repoRoot, '.omx', 'context', 'CURRENT_PROGRAM.md');
  if (fs.existsSync(localCurrentProgram)) {
    return repoRoot;
  }

  const teamStateRoot = process.env.OMX_TEAM_STATE_ROOT;
  if (teamStateRoot) {
    const sharedRoot = path.resolve(teamStateRoot, '..', '..');
    const sharedCurrentProgram = path.join(sharedRoot, '.omx', 'context', 'CURRENT_PROGRAM.md');
    if (fs.existsSync(sharedCurrentProgram)) {
      return sharedRoot;
    }
  }

  throw new Error(
    'Unable to locate .omx/context/CURRENT_PROGRAM.md from the repo root or OMX_TEAM_STATE_ROOT.',
  );
}

function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function read(filePath: string) {
  return fs.readFileSync(filePath, 'utf8');
}

function collectActivePhase4SnapshotPaths(content: string) {
  return [...new Set(content.match(activePhase4SnapshotPattern) ?? [])];
}

test('CURRENT_PROGRAM owns the single active Phase 4 snapshot pointer and other surfaces route discovery through it', () => {
  const currentProgram = read(currentProgramPath);
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const knownSnapshots = new Set(
    fs.readdirSync(contextRoot)
      .filter((fileName) => /^opl-mainline-phase4-.*\.md$/.test(fileName))
      .map((fileName) => path.join(contextRoot, fileName)),
  );

  const currentProgramSnapshots = collectActivePhase4SnapshotPaths(currentProgram);
  const promptSnapshots = collectActivePhase4SnapshotPaths(prompt);
  const latestStatusSnapshots = collectActivePhase4SnapshotPaths(latestStatus);

  assert.equal(currentProgramSnapshots.length, 1);
  assert.ok(knownSnapshots.has(currentProgramSnapshots[0]!), 'Active Phase 4 snapshot must exist on disk.');
  assert.ok(promptSnapshots.length <= 1, 'Prompt should not invent multiple active Phase 4 snapshot paths.');
  assert.ok(
    latestStatusSnapshots.length <= 1,
    'LATEST_STATUS should not invent multiple active Phase 4 snapshot paths.',
  );

  if (promptSnapshots.length === 1) {
    assert.deepEqual(promptSnapshots, currentProgramSnapshots);
  }

  if (latestStatusSnapshots.length === 1) {
    assert.deepEqual(latestStatusSnapshots, currentProgramSnapshots);
  }

  assert.match(
    prompt,
    /CURRENT_PROGRAM\.md[^.\n]*active Phase 4 snapshot|从 `CURRENT_PROGRAM\.md` 解析 active Phase 4 snapshot/i,
    'OMX_TEAM_PROMPT must route active Phase 4 snapshot discovery through CURRENT_PROGRAM.',
  );
  assert.match(
    latestStatus,
    /CURRENT_PROGRAM\.md[^.\n]*(active Phase 4 snapshot pointer|sole direct owner of the active snapshot path|sole direct active-snapshot path owner)/i,
    'LATEST_STATUS must describe CURRENT_PROGRAM as the active Phase 4 snapshot pointer owner.',
  );
});

test('Phase 4 snapshot lifecycle pack keeps superseded snapshots historical without promoting a new truth owner', () => {
  const currentProgram = read(currentProgramPath);
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const openIssues = read(openIssuesPath);
  const phase4SnapshotFiles = fs.readdirSync(contextRoot)
    .filter((fileName) => /^opl-mainline-phase4-.*\.md$/.test(fileName));
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];
  const activeSnapshot = read(activeSnapshotPath!);

  assert.ok(
    phase4SnapshotFiles.length >= 2,
    'Phase 4 snapshot lifecycle baseline should keep at least one superseded historical snapshot on disk.',
  );
  assert.match(activeSnapshot, /historical artifacts|historical-artifact|historical-only/i);
  assert.match(activeSnapshot, /truth owner/i);
  assert.match(currentProgram, /tranche-scoped continuity brief|不取代长期 governing truth 或 report truth/i);
  assert.match(prompt, /minimal deterministic re-entry pack|最小 deterministic re-entry pack/i);
  assert.match(
    latestStatus,
    /snapshot creation \/ refresh \/ supersession|create \/ refresh \/ supersede semantics|create \/ refresh \/ supersede/i,
  );
  assert.match(openIssues, /deterministic re-entry order explicit/i);
});
