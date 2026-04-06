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

test('Active Phase 4 snapshot keeps predecessor/checkpoint metadata and carried-forward invariants explicit for the onramp guardrail tranche', () => {
  const currentProgram = read(currentProgramPath);
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];

  assert.ok(activeSnapshotPath, 'CURRENT_PROGRAM must still point at one active Phase 4 snapshot.');
  assert.match(activeSnapshotPath, /multi-domain-onramp-guardrail/i);

  const activeSnapshot = read(activeSnapshotPath);
  const predecessorTranche = extractBacktickedMetadata(activeSnapshot, 'predecessor_tranche');
  const checkpointBase = extractBacktickedMetadata(activeSnapshot, 'current_checkpoint_base');
  const latestStatusPredecessor = extractLatestStatusField(latestStatus, 'Predecessor tranche link');
  const latestStatusCheckpoint = extractLatestStatusField(latestStatus, 'Current checkpoint base');

  assert.match(predecessorTranche, /^opl-mainline-phase-4-/i);
  assert.match(checkpointBase, /^[0-9a-f]{7,}$/i);
  assert.equal(predecessorTranche, latestStatusPredecessor);
  assert.equal(checkpointBase, latestStatusCheckpoint);

  assert.match(activeSnapshot, /Phase 4 - multi-domain onramp guardrail baseline/i);
  assert.match(activeSnapshot, /leader-owned, same-pass guardrail baseline/i);
  assert.match(
    activeSnapshot,
    /deterministic re-entry order still begins with `CURRENT_PROGRAM\.md` -> active Phase 4 snapshot -> checkpoint cadence spec -> verification baseline spec -> current `opl-mainline` reports/i,
  );
  assert.match(activeSnapshot, /Pointer ownership stays single-surface/i);
  assert.match(activeSnapshot, /Thin handoff stays derived/i);
  assert.match(activeSnapshot, /Report-pack role split stays explicit/i);
  assert.match(activeSnapshot, /Closeout ownership stays leader-held/i);

  assert.match(currentProgram, /multi-domain onramp guardrail baseline/i);
  assert.match(currentProgram, /plan-local guardrail brief/i);
  assert.match(
    currentProgram,
    /不得升级成 runtime registry、payload contract、launcher workflow、audit persistence、或 domain mutation surface/i,
  );
  assert.match(
    prompt,
    /Lane C.*test\/omx-mainline-snapshot-lifecycle\.test\.ts.*OPEN_ISSUES\.md.*ITERATION_LOG\.md.*consistency refresh/i,
  );
  assert.match(
    latestStatus,
    /Current `Phase 4 - multi-domain onramp guardrail baseline` work should now be treated as the next tranche/i,
  );
});

test('Onramp guardrail wording keeps API hooks and observability deferred, plan-local, and non-operative', () => {
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const openIssues = read(openIssuesPath);
  const currentProgram = read(currentProgramPath);
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];
  const activeSnapshot = read(activeSnapshotPath!);

  assert.match(activeSnapshot, /Guardrails are plan-local only/i);
  assert.match(activeSnapshot, /Deferred means deferred/i);
  assert.match(activeSnapshot, /not as executable runtime behavior/i);
  assert.match(
    activeSnapshot,
    /without inventing a new runtime registry, handoff payload, or persistence ledger/i,
  );

  assert.match(
    prompt,
    /不得把这些词升级成 runtime API、launcher workflow、routed action、audit persistence、或第二份 active snapshot path truth/i,
  );
  assert.match(
    prompt,
    /不得承诺可执行 runtime surface、payload contract、server、launcher state、或 domain mutation/i,
  );

  assert.match(
    latestStatus,
    /freeze one plan-local guardrail brief for the future OMX next stage .* without introducing executable runtime surfaces/i,
  );
  assert.match(
    latestStatus,
    /treat any `API hooks` \/ `observability` language as explanatory and deferred guardrails only; no server, launcher, routed action, or audit persistence semantics may be smuggled in/i,
  );
  assert.match(latestStatus, /keep `CLI-first` \+ `read-only` \+ `no-runtime` \+ `no-truth-shift`/i);

  assert.match(
    openIssues,
    /If the active or follow-on `multi-domain onramp guardrail` line turns `API hooks`, `observability`, or future-domain entry guidance into runtime API promises, launcher workflows, routed actions, payload contracts, audit persistence, or domain mutation semantics/i,
  );
  assert.match(openIssues, /runtime API surface/i);
});

test('Report-pack role split and Lane C consistency refresh stay explicit and report-local during the onramp guardrail tranche', () => {
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

  assert.match(activeSnapshot, /Report-pack role split stays explicit/i);
  assert.match(activeSnapshot, /`LATEST_STATUS\.md` remains the thin checkpoint \/ predecessor \/ verification \/ next-tranche surface/i);
  assert.match(activeSnapshot, /`ITERATION_LOG\.md` stays append-only trace history/i);
  assert.match(activeSnapshot, /`OPEN_ISSUES\.md` stays the residual-risk \/ deferred surface/i);

  assert.match(reportReadme, /`LATEST_STATUS\.md`：thin checkpoint \/ predecessor \/ verification surface/i);
  assert.match(reportReadme, /`ITERATION_LOG\.md`：append-only trace history/i);
  assert.match(reportReadme, /`OPEN_ISSUES\.md`：residual-risk \/ deferred surface/i);

  assert.match(
    latestStatus,
    /`LATEST_STATUS\.md` = checkpoint \/ predecessor \/ verification \/ next-tranche surface, `ITERATION_LOG\.md` = append-only trace history, `OPEN_ISSUES\.md` = residual-risk \/ deferred surface/i,
  );

  assert.match(iterationLog, /Phase 4 multi-domain onramp guardrail baseline consistency audit refresh/i);
  assert.match(
    iterationLog,
    /Audited `test\/omx-mainline-snapshot-lifecycle\.test\.ts`, `OPEN_ISSUES\.md`, and `ITERATION_LOG\.md`.*current `multi-domain onramp guardrail baseline`/i,
  );
  assert.match(
    iterationLog,
    /no runtime API, launcher workflow, routed action, payload contract, audit persistence, or domain mutation expansion/i,
  );

  assert.match(openIssues, /The report routine must remain report-only/i);
  assert.match(openIssues, /runtime API surface/i);
  assert.match(openIssues, /handoff payload generation/i);
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
