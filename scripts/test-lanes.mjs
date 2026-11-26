#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultStepTimeoutMs = 20 * 60 * 1000;
const maxStepTimeoutMs = 60 * 60 * 1000;
const stepTimeoutMs = (() => {
  const raw = process.env.OPL_TEST_LANE_STEP_TIMEOUT_MS;
  if (!raw) return defaultStepTimeoutMs;
  const n = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n <= 0 || n > maxStepTimeoutMs) {
    fail(`OPL_TEST_LANE_STEP_TIMEOUT_MS must be a positive integer <= ${maxStepTimeoutMs}; got ${raw}`);
  }
  return n;
})();

const tempRoot = process.env.OPL_REPO_TEMP_ROOT
  ? path.join(process.env.OPL_REPO_TEMP_ROOT, 'node-test-lane-cache')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'opl-node-test-lane-cache-'));
fs.mkdirSync(path.join(tempRoot, 'tmp'), { recursive: true });
if (!process.env.OPL_REPO_TEMP_ROOT) {
  process.on('exit', () => fs.rmSync(tempRoot, { recursive: true, force: true }));
}

let testLaneStateRoot = null;
let testLaneHomeRoot = null;

const norm = (p) => p.split(path.sep).join('/');
function fail(msg) {
  process.stderr.write(`${msg}\n`);
  process.exit(1);
}

function expandTestFiles(patterns) {
  return patterns.flatMap((pattern) => {
    const matches = fs.globSync(pattern, { cwd: repoRoot }).map(norm).sort();
    if (!matches.length) fail(`Test lane pattern matched no files: ${pattern}`);
    return matches;
  });
}

const nodeTest = (files, o = {}) => ({
  kind: 'node-test',
  files,
  phase: o.phase ?? null,
  stripTypes: o.stripTypes !== false,
  batchSize: o.batchSize ?? null,
  env: o.env ?? {},
});

const v2PackageTests = expandTestFiles(['packages/*/tests/*.test.ts']);
const extensionTests = expandTestFiles(['extensions/*/tests/*.test.mjs']);
const rootScriptTests = expandTestFiles(['tests/macos-sparkle-release.test.mjs', 'tests/release-note-writer.test.mjs']);
const builtTests = expandTestFiles(['tests/built/*.test.mjs']);
const e2eSelfTests = expandTestFiles(['tests/e2e/*.self.test.mjs', 'tests/e2e/stubs/*.self.test.mjs']);

const lanes = {
  smoke: [
    { kind: 'npm', phase: 'quality', args: ['run', 'v2:guard'] },
    { kind: 'command', phase: 'quality', command: process.execPath, args: ['--experimental-strip-types', './scripts/generate-v2-contracts.mjs', '--check'] },
    nodeTest(v2PackageTests, { phase: 'unit' }),
  ],
  fast: [
    { kind: 'command', phase: 'quality', command: process.execPath, args: ['scripts/test-lanes.mjs', 'assert-coverage'] },
    { kind: 'npm', phase: 'build', args: ['run', 'v2:build'] },
    { kind: 'npm', phase: 'build', args: ['run', 'v2:typecheck'] },
    { kind: 'npm', phase: 'quality', args: ['run', 'v2:guard'] },
    { kind: 'command', phase: 'quality', command: 'scripts/repo-hygiene.sh', args: [] },
    nodeTest(v2PackageTests, { phase: 'unit' }),
    nodeTest([...extensionTests, ...rootScriptTests, ...e2eSelfTests], { phase: 'extensions', stripTypes: false }),
  ],
  artifact: [
    { kind: 'npm', phase: 'build', args: ['run', 'build'] },
    nodeTest(builtTests, { phase: 'artifact', stripTypes: false }),
  ],
  'link-source-access': [
    nodeTest(expandTestFiles(['tests/link-source-access.test.mjs']), { phase: 'link-source-access', stripTypes: false }),
  ],
};

lanes.full = [
  ...lanes.fast,
  ...lanes.artifact,
  { kind: 'npm', phase: 'quality', args: ['run', 'lint'] },
  { kind: 'command', phase: 'quality', command: 'scripts/verify.sh', args: ['structure'] },
  { kind: 'command', phase: 'family', command: 'scripts/verify.sh', args: ['family'] },
];

export function laneTestPlan(laneName, phase = null, shard = null) {
  const all = lanes[laneName];
  if (!all) fail(`Unknown test lane: ${laneName}`);
  const sel = phase === null ? all : all.filter((s) => s.phase === phase);
  if (!sel.length) throw new Error(`Test lane ${laneName} has no steps for phase ${phase}`);
  if (shard === null) return sel;
  const m = /^([1-9]\d*)\/([1-9]\d*)$/.exec(shard);
  if (!m || Number(m[1]) > Number(m[2]) || !Number.isSafeInteger(Number(m[2]))) {
    throw new Error('--shard must be an index/count with 1 <= index <= count');
  }
  if (sel.some((s) => s.kind !== 'node-test')) throw new Error('--shard requires a test-only phase');
  const idx = Number(m[1]) - 1;
  const cnt = Number(m[2]);
  const out = sel
    .map((s) => ({ ...s, files: s.files.filter((_, i) => i % cnt === idx) }))
    .filter((s) => s.files.length);
  if (!out.length) throw new Error(`Shard ${shard} has no test files`);
  return out;
}

function stepEnv(extra = {}) {
  if (!testLaneStateRoot) {
    testLaneStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-lane-state-'));
    testLaneHomeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-lane-home-'));
    process.on('exit', () => {
      fs.rmSync(testLaneStateRoot, { recursive: true, force: true });
      fs.rmSync(testLaneHomeRoot, { recursive: true, force: true });
    });
  }
  const home = fs.mkdtempSync(path.join(testLaneHomeRoot, 'home-'));
  return {
    ...extra,
    OPL_STATE_DIR: fs.mkdtempSync(path.join(testLaneStateRoot, 'step-')),
    HOME: home,
    USERPROFILE: home,
  };
}

function spawnStep(cmd, args, ctx, extraEnv = {}) {
  const start = performance.now();
  const res = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    timeout: stepTimeoutMs,
    detached: true,
    killSignal: 'SIGTERM',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      TMPDIR: process.env.TMPDIR || `${path.join(tempRoot, 'tmp')}${path.sep}`,
      PYTHONDONTWRITEBYTECODE: process.env.PYTHONDONTWRITEBYTECODE || '1',
      ...extraEnv,
    },
  });
  const stepLabel = `${ctx.stepIndex + 1}:${ctx.stepKind}`;
  process.stdout.write(`Test lane timing: ${JSON.stringify({ lane: ctx.laneName, step: stepLabel, duration_ms: Math.round(performance.now() - start), status: res.status })}\n`);
  if (res.error?.code === 'ETIMEDOUT' || res.status !== 0) {
    if (res.pid) {
      try { process.kill(-res.pid, 'SIGKILL'); } catch { try { process.kill(res.pid, 'SIGKILL'); } catch {} }
    }
    if (res.error?.code === 'ETIMEDOUT') {
      process.stderr.write(`Test lane step timed out. lane=${ctx.laneName} step=${stepLabel}\n`);
      return { ...res, status: 1 };
    }
  }
  return res;
}

export function runNodeTestStep(step, context) {
  const argsFor = (files) => [
    ...(step.stripTypes ? ['--conditions=opl-source', '--experimental-strip-types'] : []),
    '--test',
    ...files,
  ];
  return spawnStep(process.execPath, argsFor(step.files), { ...context, stepKind: step.kind }, stepEnv(step.env));
}

function assertCoverage() {
  const discovered = new Set([
    ...expandTestFiles(['packages/*/tests/*.test.ts']),
    ...expandTestFiles(['extensions/*/tests/*.test.mjs']),
    ...expandTestFiles(['tests/*.test.mjs']),
    ...expandTestFiles(['tests/built/*.test.mjs']),
  ]);
  const covered = new Set(
    [...lanes.fast, ...lanes.artifact, ...lanes['link-source-access']]
      .filter((s) => s.kind === 'node-test')
      .flatMap((s) => s.files)
      .map(norm),
  );
  const uncovered = [...discovered].filter((f) => !covered.has(f)).sort();
  if (uncovered.length) {
    fail(`Active test files are not assigned to a test lane:\n${uncovered.map((f) => `- ${f}`).join('\n')}`);
  }
  process.stdout.write(`All ${discovered.size} active v2 test files are assigned to a test lane.\n`);
}

const argv = process.argv.slice(2);
const optValue = (flag, err) => {
  const i = argv.indexOf(flag);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith('--')) fail(err);
  return v;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = argv[0] ?? 'help';
  if (cmd === 'list') {
    Object.entries(lanes).forEach(([n, s]) =>
      process.stdout.write(`${n}\n${s.map((x) => (x.kind === 'node-test' ? x.files.map((f) => `  ${f}\n`).join('') : `  ${x.kind === 'npm' ? 'npm' : x.command} ${x.args.join(' ')}\n`)).join('')}`),
    );
  } else if (cmd === 'plan') {
    process.stdout.write(`${JSON.stringify(laneTestPlan(argv[1], optValue('--phase', '--phase requires a non-empty phase name'), optValue('--shard', '--shard requires an index/count')), null, 2)}\n`);
  } else if (cmd === 'assert-coverage') {
    assertCoverage();
  } else if (cmd === 'run') {
    const steps = laneTestPlan(argv[1], optValue('--phase', '--phase requires a non-empty phase name'), optValue('--shard', '--shard requires an index/count'));
    for (const [i, step] of steps.entries()) {
      const r = step.kind === 'node-test'
        ? runNodeTestStep(step, { laneName: argv[1], stepIndex: i })
        : spawnStep(step.kind === 'npm' ? (process.platform === 'win32' ? 'npm.cmd' : 'npm') : step.command, step.args, { laneName: argv[1], stepIndex: i }, stepEnv(step.env));
      if (r.status !== 0) process.exit(r.status ?? 1);
    }
  } else {
    process.stdout.write(`Usage: scripts/test-lanes.mjs <command>\n\nCommands:\n  list\n  plan <lane> [--phase <name>] [--shard <index/count>]\n  run <${Object.keys(lanes).join('|')}>\n  assert-coverage\n`);
  }
}
