#!/usr/bin/env node
/** Isolated end-to-end CLI benchmark. No production OPL state is read or written. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  launcher: { type: 'string', default: 'opl' },
  'launcher-arg': { type: 'string', multiple: true, default: [] },
  'artifact-root': { type: 'string' },
  'requirement-profile': { type: 'string' },
  'requirement-profile-id': { type: 'string', multiple: true, default: [] },
  domain: { type: 'string', default: 'benchmark' },
  profile: { type: 'string', default: 'python-noop' },
  platform: { type: 'string' },
  samples: { type: 'string', default: '30' },
  'prepare-timeout-ms': { type: 'string', default: '600000' },
  output: { type: 'string' },
  help: { type: 'boolean', default: false },
} });
if (values.help) {
  process.stdout.write(`Usage: node scripts/benchmark-runtime-environment.mjs [options]\n\n` +
    `  --launcher PATH              CLI executable; defaults to opl from PATH\n` +
    `  --launcher-arg ARG           Repeat for node/dist entrypoint arguments\n` +
    `  --artifact-root DIR         Parent of a new isolated benchmark directory\n` +
    `  --requirement-profile FILE  Explicit requirements (defaults to Python interpreter only)\n` +
    `  --requirement-profile-id ID Repeat to select the exact profile union\n` +
    `  --domain ID --profile ID --platform ID\n` +
    `  --samples N                 Warm samples, at least 20 (default 30)\n` +
    `  --prepare-timeout-ms N      Preparation deadline (default 600000)\n` +
    `  --output FILE               Also save the JSON report\n\n` +
    `A fresh OPL_STATE_DIR is always used. Native uv/renv download caches may be reused.\n` +
    `Artifacts are retained for inspection; their path is included in the report.\n`);
  process.exit(0);
}
const samples = Number(values.samples);
const prepareTimeout = Number(values['prepare-timeout-ms']);
if (!Number.isInteger(samples) || samples < 20) throw new Error('--samples must be an integer of at least 20.');
if (!Number.isFinite(prepareTimeout) || prepareTimeout <= 0) throw new Error('--prepare-timeout-ms must be positive.');
const parent = path.resolve(values['artifact-root'] ?? os.tmpdir());
fs.mkdirSync(parent, { recursive: true });
const root = fs.mkdtempSync(path.join(parent, 'opl-runtime-benchmark-'));
const state = path.join(root, 'state');
const firstTask = path.join(root, 'first-task');
const otherTask = path.join(root, 'other-task');
let requirement = values['requirement-profile'] ? path.resolve(values['requirement-profile']) : path.join(root, 'requirements.json');
let selected = values['requirement-profile-id'];
if (!values['requirement-profile']) {
  fs.writeFileSync(requirement, JSON.stringify({ profiles: [{
    profile_id: 'python-noop', runtime_binaries: [{ name: 'python3', required: true }],
    language_packages: { python: [], r: [] },
  }] }, null, 2));
  selected = ['python-noop'];
}
const env = { ...process.env, OPL_STATE_DIR: state, NODE_NO_WARNINGS: '1' };
const baseArgs = [
  ...values['launcher-arg'], 'env', 'run', '--domain', values.domain, '--profile', values.profile,
  '--requirement-profile', requirement, ...selected.flatMap((id) => ['--requirement-profile-id', id]),
  '--prepare-timeout-ms', String(prepareTimeout),
  ...(values.platform ? ['--platform', values.platform] : []),
];
function receipt(task, filename) {
  const file = path.join(task, 'build', filename);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
function run(task, label) {
  const records = path.join(task, 'build', 'executions');
  const previous = new Set(fs.existsSync(records) ? fs.readdirSync(records) : []);
  const start = performance.now();
  const command = spawnSync(values.launcher, [
    ...baseArgs, '--artifact-root', task, '--cwd', root, '--', 'python3', '-c', 'pass',
  ], { env, encoding: 'utf8', timeout: prepareTimeout + 30000, maxBuffer: 8 * 1024 * 1024 });
  const elapsed = performance.now() - start;
  if (command.status !== 0) {
    throw new Error(`${label} failed (exit ${command.status}, signal ${command.signal}): ${command.error?.message ?? ''}\n${command.stderr}\nArtifacts: ${root}`);
  }
  const created = fs.readdirSync(records).filter((name) => name.endsWith('.json') && !previous.has(name));
  if (created.length !== 1) throw new Error(`${label}: expected exactly one execution record, got ${created.length}`);
  const execution = JSON.parse(fs.readFileSync(path.join(records, created[0]), 'utf8'));
  return {
    wall_ms: elapsed, timings_ms: execution.timings_ms ?? null,
    cache_outcome: execution.cache_outcome ?? null,
    execution_id: execution.execution_id, environment_ref: execution.environment_ref,
    executable: execution.executable,
  };
}
const cold = run(firstTask, 'cold environment preparation');
const crossTask = run(otherTask, 'cross-task environment reuse');
const warm = Array.from({ length: samples }, (_, index) => run(firstTask, `warm sample ${index + 1}`));
function percentile(numbers, fraction) {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}
function distribution(numbers) {
  return { samples: numbers.length, p50_ms: percentile(numbers, 0.5), p95_ms: percentile(numbers, 0.95), min_ms: Math.min(...numbers), max_ms: Math.max(...numbers) };
}
function version(executable, args) {
  const result = spawnSync(executable, args, { env, encoding: 'utf8', timeout: 10000 });
  return result.status === 0 ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() : null;
}
function resolveLauncher(executable) {
  if (executable.includes(path.sep)) return fs.realpathSync(executable);
  for (const dir of (env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, executable);
    try { fs.accessSync(candidate, fs.constants.X_OK); return fs.realpathSync(candidate); } catch { /* next */ }
  }
  return executable;
}
const launcherPath = resolveLauncher(values.launcher);
const sourceEntry = values['launcher-arg'].find((arg) => {
  try { return fs.statSync(arg).isFile(); } catch { return false; }
}) ?? launcherPath;
const sourceRevision = version('git', ['-C', path.dirname(path.resolve(sourceEntry)), 'rev-parse', 'HEAD']);
const timingKeys = ['context_check', 'lock_wait', 'prepare', 'command', 'total'];
const report = {
  schema: 'opl-runtime-environment-benchmark.v1', generated_at: new Date().toISOString(),
  machine: { platform: process.platform, arch: process.arch, release: os.release(), cpus: os.cpus().length, cpu_model: os.cpus()[0]?.model, memory_bytes: os.totalmem() },
  runtime: { node: process.version, python: version(cold.executable, ['--version']), uv: version('uv', ['--version']), launcher: launcherPath, launcher_args: values['launcher-arg'], launcher_source_revision: sourceRevision },
  isolation: { artifact_root: root, opl_state_dir: state, package_download_cache: 'native shared uv/renv cache; not cleared', cold_meaning: 'fresh OPL environment/context, existing native package download cache may be warm' },
  selection: { requirement_profile: requirement, requirement_profile_ids: [...new Set(selected)].sort(), domain: values.domain, profile: values.profile },
  cold: { ...cold, preparation_receipt: receipt(firstTask, 'dependency_environment_receipt.json') },
  cross_task: { ...crossTask, preparation_receipt: receipt(otherTask, 'dependency_environment_receipt.json') },
  warm: {
    ...distribution(warm.map((sample) => sample.wall_ms)),
    phases: Object.fromEntries(timingKeys.flatMap((key) => {
      const numbers = warm.map((sample) => sample.timings_ms?.[key]).filter((value) => typeof value === 'number');
      return numbers.length ? [[key, distribution(numbers)]] : [];
    })),
    measurements: warm,
  },
  acceptance: {
    target: { p50_ms: 200, p95_ms: 350, minimum_samples: 20 },
    passed: percentile(warm.map((sample) => sample.wall_ms), 0.5) <= 200 && percentile(warm.map((sample) => sample.wall_ms), 0.95) <= 350,
    note: 'Local performance evidence only; correctness belongs to regression tests, not absolute CI timing thresholds.',
  },
};
const output = `${JSON.stringify(report, null, 2)}\n`;
if (values.output) {
  fs.mkdirSync(path.dirname(path.resolve(values.output)), { recursive: true });
  fs.writeFileSync(path.resolve(values.output), output);
}
process.stdout.write(output);
