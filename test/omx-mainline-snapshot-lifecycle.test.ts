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
const iterationLogPath = path.join(reportsRoot, 'ITERATION_LOG.md');
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

test('CURRENT_PROGRAM is the sole direct owner of the active Phase 4 snapshot path while prompt/status stay indirect', () => {
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
  assert.deepEqual(promptSnapshots, []);
  assert.deepEqual(latestStatusSnapshots, []);
  assert.ok(knownSnapshots.has(currentProgramSnapshots[0]!), 'Active Phase 4 snapshot must exist on disk.');

  assert.match(currentProgram, /sole direct owner of the active snapshot path|唯一直接持有 active Phase 4 snapshot path/i);
  assert.equal(
    0,
    promptSnapshots.length + latestStatusSnapshots.length,
    'OMX_TEAM_PROMPT and LATEST_STATUS must stay indirect so CURRENT_PROGRAM remains the sole direct path owner.',
  );
});

test('Phase 4 rollover choreography baseline records predecessor/checkpoint facts while keeping CURRENT_PROGRAM the sole direct path owner', () => {
  const currentProgram = read(currentProgramPath);
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const iterationLog = read(iterationLogPath);
  const openIssues = read(openIssuesPath);
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];
  const activeSnapshot = read(activeSnapshotPath!);

  assert.match(activeSnapshotPath!, /phase4-snapshot-rollover-choreography/i);
  assert.match(activeSnapshot, /^- predecessor_tranche: `[^`]+`$/m);
  assert.match(activeSnapshot, /^- current_checkpoint_base: `[0-9a-f]{7,}`$/im);
  assert.match(activeSnapshot, /leader-owned, same-pass rollover routine/i);
  assert.match(activeSnapshot, /sole direct owner of the active snapshot path/i);
  assert.match(activeSnapshot, /refreshing `OMX_TEAM_PROMPT\.md` and `\.omx\/reports\/opl-mainline\/\*` in the same pass/i);

  assert.match(currentProgram, /记录 predecessor tranche 与 checkpoint base|record predecessor(?:\/| )checkpoint facts/i);
  assert.match(prompt, /minimal deterministic re-entry pack|最小 deterministic re-entry pack/i);
  assert.match(latestStatus, /record predecessor tranche \/ checkpoint base together/i);
  assert.match(iterationLog, /same-pass pointer-move choreography/i);
  assert.match(
    openIssues,
    /without recording the predecessor tranche and current checkpoint base, moving the `CURRENT_PROGRAM\.md` pointer, and refreshing `OMX_TEAM_PROMPT\.md` plus the current `opl-mainline` report pack in the same pass/i,
  );
});

test('Phase 4 rollover pack keeps superseded snapshots historical without promoting a new truth owner', () => {
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
  assert.match(activeSnapshot, /historical-artifact status of superseded snapshots|must stay historical-only/i);
  assert.match(activeSnapshot, /truth owner/i);
  assert.match(currentProgram, /tranche-scoped continuity brief|不取代长期 governing truth 或 report truth/i);
  assert.match(prompt, /minimal deterministic re-entry pack|最小 deterministic re-entry pack/i);
  assert.match(latestStatus, /single-pointer owner contract|same-pass routine for creating a new snapshot/i);
  assert.match(openIssues, /deterministic re-entry order explicit/i);
});

test('Phase 4 rollover baseline keeps predecessor facts explicit while prompt and reports stay mirror-only', () => {
  const currentProgram = read(currentProgramPath);
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const openIssues = read(openIssuesPath);
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];

  assert.ok(activeSnapshotPath, 'CURRENT_PROGRAM must still point at one active Phase 4 snapshot.');

  const activeSnapshot = read(activeSnapshotPath);
  const predecessorTranche = extractBacktickedMetadata(activeSnapshot, 'predecessor_tranche');
  const checkpointBase = extractBacktickedMetadata(activeSnapshot, 'current_checkpoint_base');

  assert.match(activeSnapshot, /same-pass rollover routine|same-pass rollover choreography/i);
  assert.match(activeSnapshot, /record predecessor tranche plus current checkpoint base/i);
  assert.match(predecessorTranche, /^opl-mainline-phase-4-/);
  assert.match(checkpointBase, /^[0-9a-f]{7,}$/i);

  assert.match(currentProgram, /record predecessor tranche plus current checkpoint base/i);
  assert.match(currentProgram, /sole direct active-snapshot path owner|唯一直接持有 active Phase 4 snapshot path/i);
  assert.match(prompt, /mirror the rule|镜像该 pointer-owner 规则/i);
  assert.match(prompt, /minimal deterministic re-entry pack|最小 deterministic re-entry pack/i);
  assert.match(latestStatus, /same pass/i);
  assert.match(latestStatus, /record predecessor tranche \/ checkpoint base together/i);
  assert.match(
    openIssues,
    /without moving the `CURRENT_PROGRAM\.md` pointer and refreshing `OMX_TEAM_PROMPT\.md` plus the current `opl-mainline` report pack in the same pass/i,
  );
});
