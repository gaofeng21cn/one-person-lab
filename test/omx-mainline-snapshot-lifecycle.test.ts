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
const executionModelSpecPath = path.join(
  controlPlaneRoot,
  '.omx',
  'plans',
  'spec-opl-domain-onboarding-execution-model-alignment.md',
);
const candidateBacklogSyncSpecPath = path.join(
  controlPlaneRoot,
  '.omx',
  'plans',
  'spec-opl-candidate-domain-backlog-execution-model-sync.md',
);
const candidateBacklogDocPath = path.join(
  controlPlaneRoot,
  'docs',
  'opl-candidate-domain-backlog.md',
);
const candidateBacklogDocZhPath = path.join(
  controlPlaneRoot,
  'docs',
  'opl-candidate-domain-backlog.zh-CN.md',
);
const activePhase4SnapshotPattern = new RegExp(
  `${escapeForRegExp(path.join(contextRoot, 'opl-mainline-phase4-'))}[^\\s]+\\.md`,
  'g',
);

const currentProgramPath = path.join(contextRoot, 'CURRENT_PROGRAM.md');
const promptPath = path.join(contextRoot, 'OMX_TEAM_PROMPT.md');
const latestStatusPath = path.join(reportsRoot, 'LATEST_STATUS.md');
const iterationLogPath = path.join(reportsRoot, 'ITERATION_LOG.md');
const openIssuesPath = path.join(reportsRoot, 'OPEN_ISSUES.md');
const reportReadmePath = path.join(reportsRoot, 'README.md');

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
  const match = content.match(new RegExp(`^- ${escapeForRegExp(key)}: \`([^\`]+)\`$`, 'm'));
  assert.ok(match, `Expected ${key} metadata in the active Phase 4 snapshot.`);
  return match[1]!;
}

function extractLatestStatusField(content: string, key: string) {
  const match = content.match(new RegExp(`^- ${escapeForRegExp(key)}: \`([^\`]+)\`$`, 'm'));
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

  assert.match(currentProgramSnapshots[0]!, /candidate-domain-backlog-execution-model-sync/i);
  assert.match(prompt, /mirror the rule|镜像该 pointer-owner 规则/i);
  assert.match(latestStatus, /sole direct owner of the active snapshot path|sole direct active-snapshot path owner/i);
});

test('Active Phase 4 snapshot keeps predecessor/checkpoint metadata and carried-forward invariants explicit for the candidate-domain backlog execution-model sync tranche', () => {
  const currentProgram = read(currentProgramPath);
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];

  assert.ok(activeSnapshotPath, 'CURRENT_PROGRAM must still point at one active Phase 4 snapshot.');
  assert.match(activeSnapshotPath, /candidate-domain-backlog-execution-model-sync/i);

  const activeSnapshot = read(activeSnapshotPath);
  const predecessorTranche = extractBacktickedMetadata(activeSnapshot, 'predecessor_tranche');
  const checkpointBase = extractBacktickedMetadata(activeSnapshot, 'current_checkpoint_base');
  const latestStatusPredecessor = extractLatestStatusField(latestStatus, 'Predecessor tranche link');
  const latestStatusCheckpoint = extractLatestStatusField(latestStatus, 'Current checkpoint base');

  assert.equal(predecessorTranche, 'Phase 4 - domain onboarding execution-model alignment baseline');
  assert.match(checkpointBase, /^[0-9a-f]{7,}$/i);
  assert.equal(predecessorTranche, latestStatusPredecessor);
  assert.equal(checkpointBase, latestStatusCheckpoint);

  assert.match(activeSnapshot, /Phase 4 - candidate-domain backlog execution-model sync baseline/i);
  assert.match(activeSnapshot, /leader-owned candidate-domain backlog public-companion sync brief/i);
  assert.match(
    activeSnapshot,
    /CURRENT_PROGRAM\.md` -> active Phase 4 snapshot -> project truth -> domain onboarding contract -> candidate-domain backlog execution-model sync spec -> current `opl-mainline` reports/i,
  );
  assert.match(activeSnapshot, /Pointer ownership stays single-surface/i);
  assert.match(activeSnapshot, /Project-truth \+ onboarding \+ candidate-backlog companion stay governing/i);
  assert.match(activeSnapshot, /Report-pack role split stays explicit/i);
  assert.match(activeSnapshot, /Closeout ownership stays leader-held/i);
  assert.match(activeSnapshot, /Candidate backlog public companions stay reference-only/i);

  assert.match(currentProgram, /candidate-domain backlog execution-model sync baseline/i);
  assert.match(currentProgram, /public candidate-domain backlog companion wording/i);
  assert.match(
    currentProgram,
    /stable agent runtime surface、shared-base convergence path、或 code\/Agent responsibility split 的 future domain \/ ops proposal 仍只能保持 under-definition \/ deferred/i,
  );
  assert.match(
    prompt,
    /Lane C.*test\/opl-candidate-domain-backlog-execution-model-sync\.test\.ts.*test\/omx-mainline-snapshot-lifecycle\.test\.ts.*OPEN_ISSUES\.md.*ITERATION_LOG\.md.*consistency refresh/i,
  );
  assert.match(
    latestStatus,
    /Current `Phase 4 - candidate-domain backlog execution-model sync baseline` work is now the active tranche/i,
  );
});

test('Candidate-domain backlog execution-model sync baseline keeps public companions deterministic, reference-only, and non-admitting', () => {
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const openIssues = read(openIssuesPath);
  const currentProgram = read(currentProgramPath);
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];
  const activeSnapshot = read(activeSnapshotPath!);
  const executionModelSpec = read(executionModelSpecPath);
  const candidateBacklogSyncSpec = read(candidateBacklogSyncSpecPath);
  const candidateBacklogDoc = read(candidateBacklogDocPath);
  const candidateBacklogDocZh = read(candidateBacklogDocZhPath);

  assert.match(activeSnapshot, /Candidate source order stays deterministic/i);
  assert.match(activeSnapshot, /Public candidate-backlog companions stay aligned with machine-readable blockers/i);
  assert.match(activeSnapshot, /Execution-model blockers stay explicit before any admission language/i);
  assert.match(activeSnapshot, /No discovery, routing, or admission promotion without alignment/i);
  assert.match(activeSnapshot, /Unrelated dirty docs remain out of scope/i);

  assert.match(candidateBacklogSyncSpec, /docs\/opl-candidate-domain-backlog\.md/i);
  assert.match(candidateBacklogSyncSpec, /docs\/opl-candidate-domain-backlog\.zh-CN\.md/i);
  assert.match(candidateBacklogSyncSpec, /stable agent runtime surface/i);
  assert.match(candidateBacklogSyncSpec, /Auto\/Human-in-the-loop on one base/i);
  assert.match(candidateBacklogSyncSpec, /fixed-code-first/i);
  assert.match(candidateBacklogSyncSpec, /under definition \/ deferred/i);
  assert.match(executionModelSpec, /execution_model_aligned/i);

  for (const doc of [candidateBacklogDoc, candidateBacklogDocZh]) {
    assert.match(doc, /stable agent runtime surface/i);
    assert.match(doc, /Auto.*Human-in-the-loop.*share one base|共享同一基座/i);
    assert.match(doc, /code-versus-Agent responsibility split|code\/Agent responsibility split/i);
    assert.match(doc, /fixed-code-first/i);
    assert.match(doc, /under definition \/ deferred|under-definition \/ deferred|仍然只能停留在 under definition \/ deferred/i);
  }

  assert.match(prompt, /docs\/opl-candidate-domain-backlog\.md/i);
  assert.match(prompt, /docs\/opl-candidate-domain-backlog\.zh-CN\.md/i);
  assert.match(prompt, /不得把 candidate-domain backlog 文档升级成 admitted \/ ready \/ aligned/i);

  assert.match(
    latestStatus,
    /sync only the public candidate-domain backlog companion docs so they explicitly keep the stable agent runtime surface, the shared-base `Auto\/Human-in-the-loop` convergence path, and the code\/Agent responsibility split as blocker facts/i,
  );
  assert.match(
    latestStatus,
    /keep `G2` discovery readiness, `G3` routed-action readiness, and formal admission language blocked without execution-model alignment/i,
  );

  assert.match(openIssues, /public candidate-domain backlog companions/i);
  assert.match(openIssues, /stable agent runtime surface/i);
  assert.match(openIssues, /code\/Agent responsibility split/i);
});

test('Report-pack role split and active-tranche kickoff continuity stay explicit during candidate-domain backlog execution-model sync', () => {
  const reportReadme = read(reportReadmePath);
  const latestStatus = read(latestStatusPath);
  const iterationLog = read(iterationLogPath);
  const openIssues = read(openIssuesPath);

  assert.match(reportReadme, /`LATEST_STATUS\.md`：thin checkpoint \/ predecessor \/ verification surface/i);
  assert.match(reportReadme, /`ITERATION_LOG\.md`：append-only trace history/i);
  assert.match(reportReadme, /`OPEN_ISSUES\.md`：residual-risk \/ deferred surface/i);

  assert.match(
    latestStatus,
    /`LATEST_STATUS\.md` = checkpoint \/ predecessor \/ verification \/ next-tranche surface, `ITERATION_LOG\.md` = append-only trace history, `OPEN_ISSUES\.md` = residual-risk \/ deferred surface/i,
  );

  assert.match(
    iterationLog,
    /Phase 4 domain onboarding execution-model alignment baseline complete; next candidate-domain backlog execution-model sync tranche selected/i,
  );
  assert.match(
    iterationLog,
    /opl-mainline-phase4-candidate-domain-backlog-execution-model-sync-20260406T100336Z\.md/i,
  );
  assert.match(
    iterationLog,
    /public backlog companion docs|candidate-domain backlog execution-model sync baseline/i,
  );

  assert.match(openIssues, /The report routine must remain report-only/i);
  assert.match(openIssues, /runtime API surface/i);
  assert.match(openIssues, /handoff payload generation/i);
});

test('Phase 4 closeout and shutdown hygiene mirrors keep fallback, verification ownership, and shutdown order explicit', () => {
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const reportReadme = read(reportReadmePath);
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
  assert.match(latestStatus, /The failed team is now treated as recovery evidence only; final tranche integration, canonical verification, and report truth remain leader-owned/i);
  assert.match(latestStatus, /Leader-side verification on current HEAD \(`[0-9a-f]{7,}`\)/i);
  assert.match(latestStatus, /`git diff --check` ✅/i);
  assert.match(latestStatus, /`npm test` ✅/i);

  assert.match(
    reportReadme,
    /task lifecycle closeout、leader fallback transition 边界、final verification ownership、以及 shutdown -> orphan-cleanup 顺序都在同一 pass 内收口/i,
  );
  assert.match(
    reportReadme,
    /worker `completed` transitions 优先、leader fallback transition 只在 integrated-head evidence 已足够时兜底且需记因、leader 先重跑 canonical verification pack 并持有 final report truth、最后才允许 shutdown -> orphan-cleanup/i,
  );

  assert.match(openIssues, /orphan-recovery work/i);
});
