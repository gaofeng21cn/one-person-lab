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

function extractBacktickedMetadata(content: string, key: string) {
  const match = content.match(new RegExp(`^- ${escapeForRegExp(key)}: \`([^\\\`]+)\`$`, 'm'));
  assert.ok(match, `Expected ${key} metadata in the active Phase 4 snapshot.`);
  return match[1]!;
}

function extractLatestStatusField(content: string, key: string) {
  const match = content.match(new RegExp(`^- ${escapeForRegExp(key)}: \`([^\\\`]+)\`$`, 'm'));
  assert.ok(match, `Expected ${key} field in LATEST_STATUS.md.`);
  return match[1]!;
}

test('CURRENT_PROGRAM is the sole direct active Phase 4 snapshot owner while prompt and latest status stay mirror-only', () => {
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
  assert.deepEqual(
    promptSnapshots,
    [],
    'OMX_TEAM_PROMPT must not carry a parallel direct active-snapshot path.',
  );
  assert.deepEqual(
    latestStatusSnapshots,
    [],
    'LATEST_STATUS must stay mirror-only instead of becoming a second active-path owner.',
  );
  assert.ok(knownSnapshots.has(currentProgramSnapshots[0]!), 'Active Phase 4 snapshot must exist on disk.');

  assert.match(prompt, /mirror the rule|镜像该 pointer-owner 规则/i);
  assert.match(latestStatus, /sole direct owner of the active snapshot path|sole direct active-snapshot path owner/i);
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
  assert.match(activeSnapshot, /historical-artifact status of superseded snapshots|historical-only/i);
  assert.match(activeSnapshot, /truth owner/i);
  assert.match(currentProgram, /tranche-scoped continuity brief|不取代长期 governing truth 或 report truth/i);
  assert.match(prompt, /minimal deterministic re-entry pack|最小 deterministic re-entry pack/i);
  assert.match(latestStatus, /historical-artifact status of superseded snapshots|historical artifacts only/i);
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
  assert.match(activeSnapshot, /record predecessor\/checkpoint facts|record the predecessor tranche plus current checkpoint base/i);
  assert.match(predecessorTranche, /^opl-mainline-phase-4-/);
  assert.match(checkpointBase, /^[0-9a-f]{7,}$/i);

  assert.match(currentProgram, /record predecessor tranche plus current checkpoint base|记录 predecessor tranche 与 checkpoint base/i);
  assert.match(currentProgram, /sole direct active-snapshot path owner|唯一直接持有 active Phase 4 snapshot path/i);
  assert.match(prompt, /same-pass routine|同一轮 kickoff\/closeout 内完成/i);
  assert.match(prompt, /record predecessor tranche 与 current checkpoint base|同步记录 predecessor tranche 与 current checkpoint base/i);
  assert.match(prompt, /mirror the rule|镜像该 pointer-owner 规则/i);
  assert.match(prompt, /minimal deterministic re-entry pack|最小 deterministic re-entry pack/i);
  assert.match(latestStatus, /same pass/i);
  assert.match(latestStatus, /record predecessor tranche \/ checkpoint base together/i);
  assert.match(
    openIssues,
    /without recording the predecessor tranche and current checkpoint base, moving the `CURRENT_PROGRAM\.md` pointer, and refreshing `OMX_TEAM_PROMPT\.md` plus the current `opl-mainline` report pack in the same pass/i,
  );
});

test('Phase 4 trace / issue history baseline keeps report-pack roles explicit and report-local', () => {
  const currentProgram = read(currentProgramPath);
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];
  const activeSnapshot = read(activeSnapshotPath!);
  const reportReadme = read(path.join(reportsRoot, 'README.md'));
  const latestStatus = read(latestStatusPath);
  const iterationLog = read(iterationLogPath);
  const openIssues = read(openIssuesPath);

  assert.match(
    currentProgram,
    /LATEST_STATUS\.md`：thin checkpoint \/ predecessor \/ verification surface|LATEST_STATUS\.md`: thin checkpoint \/ predecessor \/ verification surface/i,
  );
  assert.match(
    currentProgram,
    /OPEN_ISSUES\.md`：residual-risk \/ deferred surface|OPEN_ISSUES\.md`: residual-risk \/ deferred surface/i,
  );
  assert.match(
    activeSnapshot,
    /LATEST_STATUS\.md` keeps the thin checkpoint \/ predecessor \/ verification \/ next-tranche surface/i,
  );
  assert.match(
    activeSnapshot,
    /report-local continuity metadata rather than runtime audit truth, launcher state, or any new persistence surface/i,
  );
  assert.match(
    reportReadme,
    /LATEST_STATUS\.md`：thin checkpoint \/ predecessor \/ verification surface|LATEST_STATUS\.md`: thin checkpoint \/ predecessor \/ verification surface/i,
  );
  assert.match(
    reportReadme,
    /ITERATION_LOG\.md`：append-only trace history|ITERATION_LOG\.md`: append-only trace history/i,
  );
  assert.match(
    reportReadme,
    /OPEN_ISSUES\.md`：residual-risk \/ deferred surface|OPEN_ISSUES\.md`: residual-risk \/ deferred surface/i,
  );
  assert.match(latestStatus, /Predecessor tranche link: `opl-mainline-phase-4-closeout`/i);
  assert.match(
    latestStatus,
    /LATEST_STATUS\.md` = checkpoint \/ predecessor \/ verification \/ next-tranche surface/i,
  );
  assert.match(
    iterationLog,
    /LATEST_STATUS\.md` now keeps checkpoint base \+ predecessor tranche linkage \+ latest verification evidence \+ next tranche brief/i,
  );
  assert.match(
    openIssues,
    /LATEST_STATUS\.md` stops keeping checkpoint base, predecessor tranche linkage, and latest verification evidence explicit/i,
  );
  assert.match(
    openIssues,
    /OPEN_ISSUES\.md` stops surfacing residual risks and deferred non-goals/i,
  );
});

test('Phase 4 closeout and shutdown hygiene mirrors keep fallback, verification ownership, and shutdown order explicit', () => {
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const reportReadme = read(path.join(reportsRoot, 'README.md'));
  const openIssues = read(openIssuesPath);

  assert.match(
    prompt,
    /only when integrated head(?:'|’)s evidence is already sufficient and lifecycle still lags|只有在 integrated head 的 evidence 已足够且 lifecycle 仍滞后时/i,
  );
  assert.match(prompt, /final verification \/ report truth|final verification.*report truth/i);
  assert.match(
    prompt,
    /pending=0 \/ in_progress=0 \/ failed=0.*omx team shutdown.*orphan-cleanup|omx team shutdown.*orphan-cleanup/i,
  );

  assert.match(latestStatus, /workers should transition tasks to `completed`/i);
  assert.match(
    latestStatus,
    /only when integrated-head evidence is already sufficient and lifecycle still lags may the leader use the official fallback transition/i,
  );
  assert.match(latestStatus, /leader reruns the canonical verification pack on the integrated head/i);
  assert.match(latestStatus, /call `omx team shutdown` only after `pending=0 \/ in_progress=0 \/ failed=0`/i);

  assert.match(
    reportReadme,
    /task lifecycle closeout、leader fallback transition 边界、final verification ownership、以及 shutdown -> orphan-cleanup 顺序都在同一 pass 内收口/i,
  );
  assert.match(
    reportReadme,
    /worker `completed` transitions 优先、leader fallback transition 只在 integrated-head evidence 已足够时兜底且需记因、leader 先重跑 canonical verification pack 并持有 final report truth、最后才允许 shutdown -> orphan-cleanup/i,
  );
  assert.match(
    openIssues,
    /uses the leader fallback transition before integrated-head evidence is already sufficient or without recording why/i,
  );
});

test('Phase 4 trace / issue history baseline keeps report-pack roles explicit and report-local', () => {
  const currentProgram = read(currentProgramPath);
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];
  const activeSnapshot = read(activeSnapshotPath!);
  const reportReadme = read(path.join(reportsRoot, 'README.md'));
  const latestStatus = read(latestStatusPath);
  const iterationLog = read(iterationLogPath);
  const openIssues = read(openIssuesPath);

  assert.match(currentProgram, /`LATEST_STATUS\.md`：thin checkpoint \/ predecessor \/ verification surface/i);
  assert.match(currentProgram, /`ITERATION_LOG\.md`：append-only trace history/i);
  assert.match(currentProgram, /`OPEN_ISSUES\.md`：residual-risk \/ deferred surface/i);

  assert.match(activeSnapshot, /Per-file roles stay explicit/i);
  assert.match(
    activeSnapshot,
    /`LATEST_STATUS\.md` keeps the thin checkpoint \/ predecessor \/ verification \/ next-tranche surface/i,
  );
  assert.match(activeSnapshot, /report-local continuity metadata rather than runtime audit truth/i);

  assert.match(reportReadme, /Phase 4 trace \/ issue history baseline/i);
  assert.match(reportReadme, /`LATEST_STATUS\.md`：当前 phase \/ tranche 状态摘要、current checkpoint base、verification evidence、以及 next-tranche guardrails/i);
  assert.match(
    reportReadme,
    /后续 OMX stage 应直接读取这组 report-local fields，而不是回放 stale mailbox、挂起 pane、或 verbose ad-hoc 日志/i,
  );

  assert.match(latestStatus, /keep checkpoint \/ verification \/ residual-risk continuity explicit inside the current report pack/i);
  assert.match(
    latestStatus,
    /`LATEST_STATUS\.md` = checkpoint \/ predecessor \/ verification \/ next-tranche surface, `ITERATION_LOG\.md` = append-only trace history, `OPEN_ISSUES\.md` = residual-risk \/ deferred surface/i,
  );

  assert.match(iterationLog, /Phase 4 trace \/ issue history baseline discoverability refresh/i);
  assert.match(iterationLog, /Locked the report-local role split/i);

  assert.match(openIssues, /Future teams can still regress the trace \/ issue history baseline/i);
  assert.match(openIssues, /follow-on work may drift back to stale mailbox reconstruction/i);
});
