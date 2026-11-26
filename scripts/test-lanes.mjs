#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const defaultStepTimeoutMs = 20 * 60 * 1000, maxStepTimeoutMs = 60 * 60 * 1000;
const stepTimeoutMs = (() => {
  const raw = process.env.OPL_TEST_LANE_STEP_TIMEOUT_MS;
  if (!raw) return defaultStepTimeoutMs;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n <= 0 || n > maxStepTimeoutMs) {
    fail(`OPL_TEST_LANE_STEP_TIMEOUT_MS must be a positive integer <= ${maxStepTimeoutMs}; got ${raw}`);
  }
  return n;
})();
const pythonCacheRoot = process.env.OPL_REPO_TEMP_ROOT
  ? path.join(process.env.OPL_REPO_TEMP_ROOT, 'node-test-python-cache')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'opl-node-test-python-cache-'));
fs.mkdirSync(path.join(pythonCacheRoot, 'tmp'), { recursive: true });
if (!process.env.OPL_REPO_TEMP_ROOT) {
  process.on('exit', () => fs.rmSync(pythonCacheRoot, { recursive: true, force: true }));
}
let testLaneStateRoot = null, testLaneHomeRoot = null;

const norm = (p) => p.split(path.sep).join('/');
const fail = (msg) => { process.stderr.write(`${msg}\n`); process.exit(1); };
const nodeTest = (files, o = {}) => ({ kind: 'node-test', files, phase: o.phase ?? null, stripTypes: o.stripTypes !== false, batchSize: o.batchSize ?? null, env: o.env ?? {} });
const sourceTest = (patterns, o = {}) => nodeTest(expandTestFiles(patterns.map((p) => `tests/src/${p}`), o), o);

function expandTestFiles(patterns, { exclude = [] } = {}) {
  const expanded = patterns.flatMap((pattern) => {
    const matches = fs.globSync(pattern, { cwd: repoRoot }).map(norm);
    if (!matches.length) fail(`Test lane pattern matched no files: ${pattern}`);
    return matches;
  });
  const stale = exclude.filter((f) => !expanded.includes(f));
  if (stale.length) fail(`Test lane exclusions matched no expanded files: ${stale.join(', ')}`);
  return expanded.filter((f) => !exclude.includes(f));
}

function readImportedTestFiles(file, available = null, sourceReader = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')) {
  const dir = path.dirname(file);
  return [...sourceReader(file).matchAll(/import\s+(?:[^'"]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g)]
    .map((m) => {
      const base = norm(path.join(dir, m[1]));
      const exists = available
        ? (c) => available.has(c) || fs.existsSync(path.join(repoRoot, c))
        : (c) => fs.existsSync(path.join(repoRoot, c));
      return (path.extname(base) ? [base] : [base, `${base}.ts`, `${base}.mjs`]).find(exists) ?? null;
    })
    .filter((f) => f && /\.(?:test\.)?(?:ts|mjs)$/.test(f));
}

function testEntryDependencies(testFiles, sourceReader = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8')) {
  const available = new Set(testFiles.map(norm)), deps = new Map(), cache = new Map();
  const readImports = (file) => cache.get(file)
    ?? cache.set(file, readImportedTestFiles(file, available, sourceReader).filter((f) => f.startsWith('tests/'))).get(file);
  for (const rel of available) {
    const imported = new Set(), visited = new Set([rel]), pending = [...readImports(rel)];
    while (pending.length) {
      const next = pending.pop();
      if (visited.has(next)) continue;
      visited.add(next);
      if (available.has(next)) imported.add(next);
      pending.push(...readImports(next));
    }
    deps.set(rel, imported);
  }
  return deps;
}

export function discoverTestRoots(testFiles, sourceReader) {
  const deps = testEntryDependencies(testFiles, sourceReader);
  const imported = new Set([...deps.values()].flatMap((s) => [...s]));
  return [...deps.keys()].filter((f) => !imported.has(f)).sort();
}

const sourceTestRoots = discoverTestRoots(expandTestFiles(['tests/src/**/*.test.{ts,mjs}']).sort());
const selectTestRoots = (patterns, o = {}) => { const m = new Set(expandTestFiles(patterns, o)); return sourceTestRoots.filter((f) => m.has(f)); };

const regressionCliTestFiles = expandTestFiles([
  'tests/src/cli/cases/{contracts-entry,runtime-manager-native,runtime-index-summary,system-surfaces,package-distribution,managed-update-kernel-projection,managed-update-kernel,framework-readiness-binding-cases,framework-locator,workspace-domain,contracts-help}.test.ts',
]);
const readModelGateCliExclusions = [
  ...regressionCliTestFiles,
  ...expandTestFiles([
    'tests/src/cli/cases/{agents-conformance-stage-pack-v2,agents-default-callers,agents-residue-decisions,domain-pack-compiler-canonical-targets,framework-readiness-cli-surface,system-dependency-doctor,web-runtime,agents-run,artifact-provenance-bundle-ledger,brand-modules,capability-map-audit-script,cli-broken-pipe,cli-command-registry,family-manifest-fixtures,family-runtime-command-parser,framework-operating-maturity,okf-command-surface,opl-foundation-skills-plugin-surface,packages,read-only-cli-invocation,runtime-brand-module-l5-evidence-ledger,runtime-environment-substrate-command-surface,runtime-stage-candidate-portfolio-read-model,runtime-stage-run-evidence-pack-read-model,standard-agent-unified-public-surfaces}.test.ts',
    'tests/src/cli/cases/{connect,pack,release}-*.test.ts',
  ]),
];
const readModelGateTestFiles = [
  ...selectTestRoots(['tests/src/cli/cases/**/*.test.{ts,mjs}'], { exclude: readModelGateCliExclusions }),
  ...selectTestRoots([
    'tests/src/domain-detail-view.test.ts', 'tests/src/work-item-*.test.ts', 'tests/src/app-state-view-model-runtime-scope.test.ts',
    'tests/src/current-owner-delta-topline.test.ts', 'tests/src/framework-readiness-attention-actions.test.ts',
    'tests/src/generic-substrate-projection.test.ts', 'tests/src/family-runtime-codex-stage-runner.test.ts',
    'tests/src/family-runtime-stage-attempt-closeout-ledger.test.ts',
    'tests/src/family-runtime-temporal-{provider,terminal-sync,runtime-observation-reconciliation}.test.ts',
    'tests/src/family-runtime-agent-stage-runner.test.ts', 'tests/src/foundry-temporal.test.ts',
    'tests/src/temporal-production-proof-fixture.test.ts', 'tests/src/default-executor-recovery.test.ts',
    'tests/src/agent-executor.test.ts', 'tests/src/framework-readiness-owner-delta-handoff-summary.test.ts',
    'tests/src/family-runtime-evidence-worklist-family-scope.test.ts', 'tests/src/runtime-app-operator-selected-safe-action.test.ts',
  ], { exclude: ['tests/src/work-item-file-boundary.test.ts', 'tests/src/work-item-inventory-binding.test.ts'] }),
  'tests/src/cli/cases/managed-update-kernel-projection.test.ts',
  'tests/src/cli/cases/packages-cases/workflow-policy-transaction.ts',
  'tests/src/cli/cases/framework-readiness-binding-cases.test.ts',
  'tests/src/cli/cases/workspace-domain.agent-skeleton.test.ts',
  'tests/src/cli/cases/workspace-domain.external-evidence.test.ts',
];
const fastLaneExcluded = new Set([...regressionCliTestFiles, ...expandTestFiles([
  'tests/built/**/*.test.{ts,mjs}',
  'tests/src/{agent-profile-spine,cli-acp-runtime,cli-codex-default-shell-sync-skills,cli-codex-default-shell,cli-install,cli,cli-modularization,domain-definition-contract,evidence-grounded-decision-agent-profile,family-domain-catalog,family-entry-contracts,family-executor-adapter-contract,family-orchestration,fresh-install-smoke,handoff-bundle,opl-skills-boundary,product-entry-agent-executor,product-entry-companions,product-entry-runtime,profile-capability-plan,runtime-state-paths,source-module-boundary,stage-run-mag-integration}.test.ts',
  'tests/src/cli/cases/{agents-conformance-stage-pack-v2,agents-default-callers,agents-residue-decisions,domain-pack-compiler-canonical-targets,framework-readiness-cli-surface,system-dependency-doctor,web-runtime}.test.ts',
])]);
const fastReadModelShared = new Set(['tests/src/cli/cases/{domain-pack-compiler-active-caller-targets,domain-pack-compiler-generated-interfaces,domain-pack-compiler-standard-agent-contract-pack}.test.ts'].flatMap((p) => expandTestFiles([p])));
const readModelGateSet = new Set(readModelGateTestFiles);
const fastTestFiles = sourceTestRoots.filter((f) => fastReadModelShared.has(f) || (!readModelGateSet.has(f) && !fastLaneExcluded.has(f)));
const fastTemporalStageRun = ['recovery', 'routing', 'outcomes', 'transport'].map((n) => `tests/src/family-runtime-temporal-stage-run-controller-${n}.test.ts`);
const fastIsolatedTemporal = ['tests/src/family-runtime-pack-bound-stage-quality-e2e.test.ts', 'tests/src/foundry-five-stage-accounting.test.ts', 'tests/src/family-runtime-temporal-stage-run-recovery-start.test.ts'];
const fastIsolatedCli = ['tests/src/cli/cases/packages.test.ts', 'tests/src/cli/cases/cli-command-registry.test.ts', 'tests/src/cli/cases/release-bundle.test.ts'];
const fastUnitFiles = fastTestFiles.filter((f) => !fastIsolatedTemporal.includes(f) && !fastTemporalStageRun.includes(f) && !fastIsolatedCli.includes(f));
const readModelTemporal = ['tests/src/family-runtime-temporal-provider.test.ts', 'tests/src/family-runtime-temporal-terminal-sync.test.ts', 'tests/src/cli/cases/family-runtime.test.ts', 'tests/src/cli/cases/family-runtime-provider-repair.test.ts', 'tests/src/cli/cases/family-runtime-worker.test.ts', 'tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts', 'tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts'];
const readModelIsolated = ['tests/src/cli/cases/system-seed-manifest.test.ts', 'tests/src/cli/cases/system-startup-maintenance.test.ts', 'tests/src/cli/cases/managed-update-kernel-projection.test.ts'];
const cliEnv90s = { OPL_CLI_TEST_TIMEOUT_MS: '90000' };

const lanes = {
  smoke: [
    { kind: 'npm', args: ['run', 'source:modules', '--', '--strict-imports', '--strict-cycles'] },
    sourceTest(['{verification-command-surfaces,target-architecture-schema-contracts,evidence-grounded-decision-agent-profile,agent-profile-spine,profile-capability-plan,evidence-grounded-stagecraft-runway,evidence-grounded-substrate,cognitive-computation-kernel-contract,advisory-knowledge-boundary-contract,durable-knowledge-catalog,knowledge-context-direct,opl-flow-completion-audit-contract,test-lanes-state-isolation,source-module-boundary,cli-modularization,runtime-state-paths,runtime-environment-substrate,opl-session-runtime}.test.ts', 'cli/cases/runtime-environment-substrate-command-surface.test.ts'], { batchSize: 25 }),
  ],
  fast: [
    { kind: 'command', phase: 'quality', command: process.execPath, args: ['scripts/test-lanes.mjs', 'assert-coverage'] },
    { kind: 'npm', phase: 'build', args: ['run', 'build'] },
    { kind: 'command', phase: 'quality', command: 'scripts/repo-hygiene.sh', args: [] },
    nodeTest(fastIsolatedTemporal, { phase: 'temporal', batchSize: 1 }),
    nodeTest(fastUnitFiles, { phase: 'unit', batchSize: 54, env: cliEnv90s }),
    nodeTest(fastIsolatedCli, { phase: 'cli', batchSize: 1, env: cliEnv90s }),
    nodeTest(fastTemporalStageRun, { phase: 'temporal', batchSize: 4 }),
  ],
  'read-model-gates': [
    nodeTest(readModelGateTestFiles.filter((f) => !readModelTemporal.includes(f) && !readModelIsolated.includes(f)), { batchSize: 20, env: cliEnv90s }),
    nodeTest(readModelIsolated, { batchSize: 1, env: cliEnv90s }),
    nodeTest(readModelTemporal, { batchSize: 1, env: cliEnv90s }),
  ],
  meta: [sourceTest(['{verification-command-surfaces,target-architecture-schema-contracts,cognitive-computation-kernel-contract,cli-modularization,runtime-state-paths,current-owner-delta-read-model-cache,family-product-operator-projection,framework-readiness-attention-actions}.test.ts', 'cli/cases/{system-dependency-doctor,framework-readiness-binding-cases,framework-readiness,runtime-manifest-cache-timeout,framework-readiness-attention-semantics,framework-readiness-cli-surface,agents-conformance-stage-pack-v2,agents-source-closure,agents-default-callers,agents-residue-decisions,domain-pack-compiler-canonical-targets}.test.ts'], { batchSize: 10 })],
  regression: [
    sourceTest(['{base-managed-dependencies,cli-codex-default-shell,cli-codex-default-shell-sync-skills,runtime-state-paths,family-domain-catalog,family-entry-contracts,family-executor-adapter-contract,handoff-bundle,product-entry-companions,product-entry-runtime,product-entry-agent-executor,family-orchestration,agent-package-home-localization,opl-skills-boundary}.test.ts'], { env: cliEnv90s }),
    nodeTest(regressionCliTestFiles, { batchSize: 4, env: cliEnv90s }),
  ],
  integration: [sourceTest(['{cli-acp-runtime,cli-install,domain-definition-contract}.test.ts', 'cli/cases/web-runtime.test.ts'], { env: cliEnv90s })],
  'stage-run-mag-integration': [sourceTest(['stage-run-mag-integration.test.ts'])],
  artifact: [{ kind: 'npm', args: ['run', 'build'] }, nodeTest(['tests/built/cli.test.mjs', 'tests/built/workbench-temporal.test.mjs', 'tests/built/workbench-task-workflow.test.mjs'], { stripTypes: false })],
  'fresh-install': [sourceTest(['fresh-install-smoke.test.ts'])],
};

const fullConstituents = ['artifact', 'fast', 'fresh-install', 'read-model-gates', 'meta', 'regression', 'integration'];
const mergeCfg = (a, b) => ({ batchSize: Math.min(a.batchSize, b.batchSize), stripTypes: a.stripTypes && b.stripTypes, env: { ...a.env, ...b.env } });
const dedupeSteps = (steps) => { const s = new Set(); return steps.filter((x) => { const k = JSON.stringify([x.kind, x.command ?? null, x.args ?? null]); return s.has(k) ? false : s.add(k); }); };
lanes.full = [
  ...dedupeSteps([{ kind: 'command', command: process.execPath, args: ['scripts/test-lanes.mjs', 'assert-coverage'] }, ...fullConstituents.flatMap((n) => (lanes[n] ?? []).filter((s) => s.kind !== 'node-test'))]),
  ...(() => {
    const cfgs = new Map(), groups = new Map();
    for (const n of fullConstituents) for (const s of lanes[n] ?? []) if (s.kind === 'node-test') {
      const c = { batchSize: s.batchSize ?? s.files.length, stripTypes: s.stripTypes !== false, env: s.env ?? {} };
      for (const f of s.files) cfgs.set(f, cfgs.has(f) ? mergeCfg(cfgs.get(f), c) : c);
    }
    const deps = testEntryDependencies([...cfgs.keys()]), imported = new Set([...deps.values()].flatMap((s) => [...s]));
    for (const [f, own] of cfgs) {
      if (imported.has(f)) continue;
      const c = [...deps.get(f)].reduce((acc, child) => (cfgs.has(child) ? mergeCfg(acc, cfgs.get(child)) : acc), own);
      const k = JSON.stringify([c.stripTypes, c.batchSize, c.env]);
      if (!groups.has(k)) groups.set(k, { c, files: [] });
      groups.get(k).files.push(f);
    }
    return [...groups.values()].map(({ c, files }) => nodeTest(files, c));
  })(),
  { kind: 'npm', args: ['run', 'typecheck'] }, { kind: 'npm', args: ['run', 'lint'] },
  { kind: 'command', command: 'scripts/verify.sh', args: ['structure'] }, { kind: 'command', command: 'scripts/verify.sh', args: ['native'] },
];

/**
 * @param {string} laneName
 * @param {string | null} [phase]
 * @param {string | null} [shard]
 */
export function laneTestPlan(laneName, phase = null, shard = null) {
  const all = lanes[laneName];
  if (!all) fail(`Unknown test lane: ${laneName}`);
  const sel = phase === null ? all : all.filter((s) => s.phase === phase);
  if (!sel.length) throw new Error(`Test lane ${laneName} has no steps for phase ${phase}`);
  if (shard === null) return sel;
  const m = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
  if (!m || Number(m[1]) > Number(m[2]) || !Number.isSafeInteger(Number(m[2]))) throw new Error('--shard must be an index/count with 1 <= index <= count');
  if (sel.some((s) => s.kind !== 'node-test')) throw new Error('--shard requires a test-only phase');
  const idx = Number(m[1]) - 1, cnt = Number(m[2]);
  const out = sel.map((s) => ({ ...s, files: s.files.filter((_, i) => i % cnt === idx) })).filter((s) => s.files.length);
  if (!out.length) throw new Error(`Shard ${shard} has no test files`);
  return out;
}

function stepEnv(extra = {}) {
  if (!testLaneStateRoot) {
    testLaneStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-lane-state-'));
    testLaneHomeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-lane-home-'));
    process.on('exit', () => { fs.rmSync(testLaneStateRoot, { recursive: true, force: true }); fs.rmSync(testLaneHomeRoot, { recursive: true, force: true }); });
  }
  const home = fs.mkdtempSync(path.join(testLaneHomeRoot, 'home-'));
  const gitVal = (k, d) => { const r = spawnSync('git', ['config', '--global', k], { encoding: 'utf8' }); return (r.status === 0 && r.stdout.trim()) || d; };
  fs.writeFileSync(path.join(home, '.gitconfig'), `[user]\n\tname = ${gitVal('user.name', 'OPL Test Lane')}\n\temail = ${gitVal('user.email', 'opl-test-lane@example.invalid')}\n[init]\n\tdefaultBranch = main\n[commit]\n\tgpgsign = false\n[tag]\n\tgpgsign = false\n`);
  return { ...extra, OPL_STATE_DIR: fs.mkdtempSync(path.join(testLaneStateRoot, 'step-')), HOME: home, USERPROFILE: home, GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig') };
}

function spawnStep(cmd, args, ctx, extraEnv = {}) {
  const start = performance.now();
  const res = spawnSync(cmd, args, {
    cwd: repoRoot, stdio: 'inherit', timeout: stepTimeoutMs, detached: true, killSignal: 'SIGTERM',
    env: {
      ...process.env, NODE_NO_WARNINGS: '1', TMPDIR: process.env.TMPDIR || path.join(pythonCacheRoot, 'tmp') + path.sep,
      NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE || path.join(pythonCacheRoot, 'node-compile-cache'),
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || path.join(pythonCacheRoot, 'npm-cache'),
      npm_config_cache: process.env.npm_config_cache || process.env.NPM_CONFIG_CACHE || path.join(pythonCacheRoot, 'npm-cache'),
      UV_CACHE_DIR: process.env.UV_CACHE_DIR || path.join(pythonCacheRoot, 'uv-cache'),
      UV_PROJECT_ENVIRONMENT: process.env.UV_PROJECT_ENVIRONMENT || path.join(pythonCacheRoot, 'uv-project-venv'),
      PIP_CACHE_DIR: process.env.PIP_CACHE_DIR || path.join(pythonCacheRoot, 'pip-cache'),
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || path.join(pythonCacheRoot, 'xdg-cache'),
      PYTHONDONTWRITEBYTECODE: process.env.PYTHONDONTWRITEBYTECODE || '1',
      PYTHONPYCACHEPREFIX: process.env.PYTHONPYCACHEPREFIX || path.join(pythonCacheRoot, 'pycache'),
      PYTEST_ADDOPTS: [process.env.PYTEST_ADDOPTS || '', '-p no:cacheprovider', `-o cache_dir=${path.join(pythonCacheRoot, 'pytest-cache')}`].filter(Boolean).join(' '),
      ...extraEnv,
    },
  });
  const stepLabel = [`${ctx.stepIndex + 1}:${ctx.stepKind}`, Number.isInteger(ctx.batchIndex) ? `batch=${ctx.batchIndex + 1}/${ctx.batchCount}` : null, ctx.batchFiles?.length ? `files=${ctx.batchFiles.join(',')}` : null].filter(Boolean).join(' ');
  process.stdout.write(`Test lane timing: ${JSON.stringify({ lane: ctx.laneName, step: stepLabel, duration_ms: Math.round(performance.now() - start), status: res.status })}\n`);
  if (res.error?.code === 'ETIMEDOUT' || res.status !== 0) {
    if (res.pid) try { process.kill(-res.pid, 'SIGKILL'); } catch { try { process.kill(res.pid, 'SIGKILL'); } catch {} }
    if (res.error?.code === 'ETIMEDOUT') { process.stderr.write(`Test lane step timed out. lane=${ctx.laneName} step=${stepLabel} command=${cmd} ${args.join(' ')} timeout_ms=${stepTimeoutMs}\n`); return { ...res, status: 1 }; }
  }
  return res;
}

export function runNodeTestStep(step, context) {
  const environment = {
    OPL_PACKAGE_PROJECTION_DIR: path.join(repoRoot, 'tests/fixtures/catalog/packages'),
    ...step.env,
  };
  const argsFor = (files) => ['--conditions=opl-source', ...(step.stripTypes ? ['--experimental-strip-types'] : []), '--test', ...files];
  if (!Number.isInteger(step.batchSize) || step.batchSize <= 0 || step.files.length <= step.batchSize) {
    return spawnStep(process.execPath, argsFor(step.files), { ...context, stepKind: step.kind, batchFiles: step.files }, stepEnv(environment));
  }
  const chunks = Array.from({ length: Math.ceil(step.files.length / step.batchSize) }, (_, i) => step.files.slice(i * step.batchSize, (i + 1) * step.batchSize));
  const failedBatches = [];
  for (const [batchIndex, files] of chunks.entries()) {
    const res = spawnStep(process.execPath, argsFor(files), { ...context, stepKind: step.kind, batchIndex, batchCount: chunks.length, batchFiles: files }, stepEnv(environment));
    if (res.status !== 0) { failedBatches.push({ batchIndex, batchCount: chunks.length, files }); if (!continueOnFailure()) return { ...res, failedBatches }; }
  }
  return failedBatches.length ? { status: 1, failedBatches } : { status: 0 };
}

const argv = process.argv.slice(2);
const continueOnFailure = () => process.env.OPL_TEST_LANE_CONTINUE === '1' || argv.slice(2).includes('--continue');
const optValue = (flag, err) => { const i = argv.indexOf(flag); if (i === -1) return null; const v = argv[i + 1]; if (!v || v.startsWith('--')) fail(err); return v; };

function assertCoverage() {
  for (const [lane, steps] of Object.entries(lanes)) {
    const seen = new Map();
    steps.filter((s) => s.kind === 'node-test').flatMap((s) => s.files).forEach((f, i) => seen.set(norm(f), [...(seen.get(norm(f)) ?? []), i + 1]));
    const dups = [...seen.entries()].filter(([, idxs]) => idxs.length > 1);
    if (dups.length) fail(`Test lane files are listed more than once in the same lane:\n${dups.map(([f, idxs]) => `- ${lane}: ${f} (${idxs.join(', ')})`).join('\n')}`);
  }
  const ls = spawnSync('git', ['ls-files', 'tests/**/*.test.ts', 'tests/**/*.test.mjs'], { cwd: repoRoot, encoding: 'utf8' });
  if (ls.status !== 0) fail(`${ls.stderr}git ls-files failed`);
  const tracked = ls.stdout.split('\n').filter((f) => f && fs.existsSync(path.join(repoRoot, f)) && (f.startsWith('tests/src/') || f.startsWith('tests/built/'))).sort();
  const covered = new Set(), stack = Object.values(lanes).flatMap((s) => s.filter((x) => x.kind === 'node-test').flatMap((x) => x.files)).map(norm);
  while (stack.length) {
    const rel = stack.pop();
    if (covered.has(rel)) continue;
    covered.add(rel);
    if (fs.existsSync(path.join(repoRoot, rel))) stack.push(...readImportedTestFiles(rel));
  }
  const uncovered = tracked.filter((f) => !covered.has(f));
  if (uncovered.length) fail(`Active test files are not assigned to a test lane:\n${uncovered.map((f) => `- ${f}`).join('\n')}`);
  process.stdout.write(`All ${tracked.length} active test files are assigned to a test lane.\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = argv[0] ?? 'help';
  if (cmd === 'list') Object.entries(lanes).forEach(([n, s]) => process.stdout.write(`${n}\n${s.map((x) => x.kind === 'node-test' ? x.files.map((f) => `  ${f}\n`).join('') : `  ${x.kind === 'npm' ? 'npm' : x.command} ${x.args.join(' ')}\n`).join('')}`));
  else if (cmd === 'plan') process.stdout.write(`${JSON.stringify(laneTestPlan(argv[1], optValue('--phase', '--phase requires a non-empty phase name'), optValue('--shard', '--shard requires an index/count')), null, 2)}\n`);
  else if (cmd === 'assert-coverage') assertCoverage();
  else if (cmd === 'run') {
    const steps = laneTestPlan(argv[1], optValue('--phase', '--phase requires a non-empty phase name'), optValue('--shard', '--shard requires an index/count')), failures = [];
    for (const [i, step] of steps.entries()) {
      const r = step.kind === 'node-test' ? runNodeTestStep(step, { laneName: argv[1], stepIndex: i }) : spawnStep(step.kind === 'npm' ? (process.platform === 'win32' ? 'npm.cmd' : 'npm') : step.command, step.args, { laneName: argv[1], stepIndex: i }, stepEnv(step.env));
      if (r.status !== 0) { if (!continueOnFailure()) process.exit(r.status ?? 1); failures.push(r.failedBatches?.length ? r.failedBatches.map((b) => `step ${i + 1} (${step.kind}) batch ${b.batchIndex + 1}/${b.batchCount}: ${b.files.join(', ')}`) : [`step ${i + 1} (${step.kind})`]).flat(); }
    }
    if (failures.length) fail(`Test lane ${argv[1]} failed in ${failures.length} step${failures.length === 1 ? '' : 's'} (continued run):\n${failures.map((f) => `- ${f}`).join('\n')}`);
  } else process.stdout.write(`Usage: scripts/test-lanes.mjs <command>\n\nCommands:\n  list\n  plan <lane> [--phase <name>] [--shard <index/count>]\n  run <${Object.keys(lanes).join('|')}>\n  assert-coverage\n`);
}
