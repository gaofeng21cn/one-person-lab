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
const seamInventorySpecPath = path.join(
  controlPlaneRoot,
  '.omx',
  'plans',
  'spec-opl-mainline-next-stage-api-hooks-observability-seams.md',
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

  assert.match(prompt, /mirror the rule|镜像该 pointer-owner 规则/i);
  assert.match(latestStatus, /sole direct owner of the active snapshot path|sole direct active-snapshot path owner/i);
});

test('Active Phase 4 snapshot keeps predecessor/checkpoint metadata and carried-forward invariants explicit for the seam inventory tranche', () => {
  const currentProgram = read(currentProgramPath);
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];

  assert.ok(activeSnapshotPath, 'CURRENT_PROGRAM must still point at one active Phase 4 snapshot.');
  assert.match(activeSnapshotPath, /multi-domain-onramp-guardrail-api-hooks-observability-seam-inventory/i);

  const activeSnapshot = read(activeSnapshotPath);
  const predecessorTranche = extractBacktickedMetadata(activeSnapshot, 'predecessor_tranche');
  const checkpointBase = extractBacktickedMetadata(activeSnapshot, 'current_checkpoint_base');
  const latestStatusPredecessor = extractLatestStatusField(latestStatus, 'Predecessor tranche link');
  const latestStatusCheckpoint = extractLatestStatusField(latestStatus, 'Current checkpoint base');

  assert.match(predecessorTranche, /^opl-mainline-phase-4-/i);
  assert.match(checkpointBase, /^[0-9a-f]{7,}$/i);
  assert.equal(predecessorTranche, latestStatusPredecessor);
  assert.equal(checkpointBase, latestStatusCheckpoint);

  assert.match(activeSnapshot, /Phase 4 - API hooks \/ observability seam inventory baseline/i);
  assert.match(activeSnapshot, /leader-owned, same-pass seam inventory baseline/i);
  assert.match(
    activeSnapshot,
    /later OMX work must still enter from `CURRENT_PROGRAM\.md` -> active Phase 4 snapshot -> checkpoint cadence spec -> verification baseline spec -> current `opl-mainline` reports/i,
  );
  assert.match(activeSnapshot, /Pointer ownership stays single-surface/i);
  assert.match(activeSnapshot, /Onramp guardrail stays governing/i);
  assert.match(activeSnapshot, /Report-pack role split stays explicit/i);
  assert.match(activeSnapshot, /Closeout ownership stays leader-held/i);

  assert.match(currentProgram, /API hooks \/ observability seam inventory baseline/i);
  assert.match(currentProgram, /plan-local seam inventory \/ boundary brief/i);
  assert.match(
    currentProgram,
    /不得升级成 webhook、route handler、RPC contract、payload schema、telemetry pipeline、runtime log sink、audit persistence、dashboard SLA、或 domain mutation surface/i,
  );
  assert.match(
    prompt,
    /Lane C.*test\/omx-mainline-snapshot-lifecycle\.test\.ts.*OPEN_ISSUES\.md.*ITERATION_LOG\.md.*consistency refresh/i,
  );
  assert.match(
    latestStatus,
    /Current `Phase 4 - API hooks \/ observability seam inventory baseline` work remains the active tranche/i,
  );
});

test('Seam inventory wording keeps API hooks and observability deferred, plan-local, and non-operative', () => {
  const prompt = read(promptPath);
  const latestStatus = read(latestStatusPath);
  const openIssues = read(openIssuesPath);
  const currentProgram = read(currentProgramPath);
  const activeSnapshotPath = collectActivePhase4SnapshotPaths(currentProgram)[0];
  const activeSnapshot = read(activeSnapshotPath!);
  const seamInventorySpec = read(seamInventorySpecPath);

  assert.match(activeSnapshot, /API hooks stay deferred descriptive seams only/i);
  assert.match(activeSnapshot, /Observability stays report-local and non-operative/i);
  assert.match(activeSnapshot, /Seam inventory does not become execution authority/i);
  assert.match(activeSnapshot, /Expansion still requires a separately approved tranche/i);

  assert.match(seamInventorySpec, /Read-only contract loading seam/i);
  assert.match(seamInventorySpec, /Registry lookup seam/i);
  assert.match(seamInventorySpec, /Boundary explanation seam/i);
  assert.match(seamInventorySpec, /Report-trigger explanation seam/i);
  assert.match(seamInventorySpec, /Verification evidence seam/i);
  assert.match(seamInventorySpec, /Trace digest seam/i);
  assert.match(seamInventorySpec, /Cross-domain entry diagnostics seam/i);
  assert.match(seamInventorySpec, /webhook、route handler、RPC contract、payload schema/i);
  assert.match(seamInventorySpec, /telemetry pipeline、metrics backend、runtime log sink、audit persistence、dashboard SLA/i);

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
    /freeze one narrower plan-local seam inventory brief in .*spec-opl-mainline-next-stage-api-hooks-observability-seams\.md/i,
  );
  assert.match(
    latestStatus,
    /keep any future `API hooks` seam language descriptive and deferred only/i,
  );
  assert.match(
    latestStatus,
    /keep any future `observability` seam language report-local and non-operative only/i,
  );
  assert.match(latestStatus, /keep `CLI-first` \+ `read-only` \+ `no-runtime` \+ `no-truth-shift`/i);

  assert.match(
    openIssues,
    /If the active or follow-on `API hooks \/ observability seam inventory` line turns reserved seam names into runtime API promises, webhook\/route\/RPC contracts, payload schemas, telemetry pipelines, runtime log sinks, audit persistence, dashboard backends, server surfaces, or domain mutation semantics/i,
  );
  assert.match(openIssues, /runtime API surface/i);
});

test('Report-pack role split and Lane C consistency refresh stay explicit and report-local during the seam inventory tranche', () => {
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

  assert.match(iterationLog, /Phase 4 API hooks \/ observability seam inventory baseline leader recovery \/ consistency refresh/i);
  assert.match(
    iterationLog,
    /Added `\/Users\/gaofeng\/workspace\/one-person-lab\/.omx\/plans\/spec-opl-mainline-next-stage-api-hooks-observability-seams\.md`.*CURRENT_PROGRAM\.md.*sole direct active-snapshot path owner/i,
  );
  assert.match(
    iterationLog,
    /Realigned `test\/omx-mainline-snapshot-lifecycle\.test\.ts` to the current `API hooks \/ observability seam inventory baseline` and removed the off-scope `test\/read-only-surface-guardrails\.test\.ts` carry-over/i,
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
  assert.match(latestStatus, /The failed team is now treated as recovery evidence only; final tranche integration, canonical verification, and report truth remain leader-owned/i);

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
