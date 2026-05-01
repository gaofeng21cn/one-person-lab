#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'src', 'cli.ts');
const args = new Set(process.argv.slice(2));

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function makeTempRoot(scenarioId) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `opl-fresh-install-${scenarioId}-`));
}

function baseEnv(root, extra = {}) {
  return {
    HOME: path.join(root, 'home'),
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_MODULES_ROOT: path.join(root, 'modules'),
    OPL_FIRST_RUN_LOG_PATH: path.join(root, 'logs', 'first-run.jsonl'),
    PATH: '/usr/bin:/bin',
    SHELL: process.env.SHELL || '/bin/bash',
    TMPDIR: os.tmpdir(),
    NODE_NO_WARNINGS: '1',
    ...extra,
  };
}

function runOpl(commandArgs, env, expectedStatus = 0) {
  fs.mkdirSync(env.HOME, { recursive: true });
  fs.mkdirSync(env.OPL_STATE_DIR, { recursive: true });
  fs.mkdirSync(env.OPL_MODULES_ROOT, { recursive: true });
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', cliPath, ...commandArgs],
    {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
    },
  );

  assert.equal(
    result.status,
    expectedStatus,
    [
      `opl ${commandArgs.join(' ')} exited with ${result.status}`,
      `stdout=${result.stdout}`,
      `stderr=${result.stderr}`,
    ].join('\n'),
  );

  const raw = expectedStatus === 0 ? result.stdout : result.stderr;
  return JSON.parse(raw);
}

function createFakeCodex(root, version) {
  const binDir = path.join(root, 'tools');
  const codexPath = path.join(binDir, 'codex');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(
    codexPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'if [[ "${1:-}" == "--version" ]]; then',
      `  printf '%s\\n' ${JSON.stringify(`codex-cli ${version}`)}`,
      '  exit 0',
      'fi',
      'echo "unsupported codex fixture command: $*" >&2',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return binDir;
}

function createGitModuleFixtures(modulesRoot) {
  const repoNames = [
    'med-autoscience',
    'med-deepscientist',
    'med-autogrant',
    'redcube-ai',
  ];

  for (const repoName of repoNames) {
    const repoPath = path.join(modulesRoot, repoName);
    fs.mkdirSync(repoPath, { recursive: true });
    const result = spawnSync('git', ['init', '-q'], {
      cwd: repoPath,
      encoding: 'utf8',
      env: { ...process.env, HOME: modulesRoot },
    });
    assert.equal(result.status, 0, result.stderr);
  }
}

function assertInitializeState(output, expected) {
  const initialize = output.system_initialize;
  assert.equal(initialize.setup_flow.phase, expected.phase);
  assert.deepEqual(initialize.setup_flow.blocking_items.sort(), [...expected.blocking].sort());
  assert.equal(initialize.first_run_log.surface_id, 'opl_first_run_log');
  assert.equal(
    initialize.gui_first_run_automation.accessibility_labels.window,
    'opl-first-run-window',
  );
}

function runCase(scenarioId, fn) {
  const root = makeTempRoot(scenarioId);
  const startedAt = new Date().toISOString();
  try {
    const result = fn(root);
    return {
      scenario_id: scenarioId,
      status: 'passed',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      artifacts: result.artifacts ?? [],
      observations: result.observations ?? {},
    };
  } catch (error) {
    return {
      scenario_id: scenarioId,
      status: 'failed',
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (!args.has('--keep-tmp')) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

function cleanUserMissingCodex(root) {
  const env = baseEnv(root);
  const output = runOpl(['system', 'initialize'], env);
  assertInitializeState(output, {
    phase: 'environment',
    blocking: ['codex', 'domain_modules'],
  });
  return { observations: { overall_state: output.system_initialize.overall_state } };
}

function compatibleCodexMissingModules(root) {
  const tools = createFakeCodex(root, '0.125.0');
  const env = baseEnv(root, { PATH: `${tools}:/usr/bin:/bin` });
  const output = runOpl(['system', 'initialize'], env);
  assertInitializeState(output, {
    phase: 'modules',
    blocking: ['domain_modules'],
  });
  return { observations: { codex_version: output.system_initialize.core_engines.codex.parsed_version } };
}

function outdatedCodex(root) {
  const tools = createFakeCodex(root, '0.121.0');
  const env = baseEnv(root, { PATH: `${tools}:/usr/bin:/bin` });
  const output = runOpl(['system', 'initialize'], env);
  assertInitializeState(output, {
    phase: 'environment',
    blocking: ['codex', 'domain_modules'],
  });
  assert.equal(output.system_initialize.core_engines.codex.version_status, 'outdated');
  return { observations: { codex_issue: output.system_initialize.core_engines.codex.issues[0] } };
}

function readyBaseline(root) {
  const tools = createFakeCodex(root, '0.125.0');
  const env = baseEnv(root, { PATH: `${tools}:/usr/bin:/bin` });
  createGitModuleFixtures(env.OPL_MODULES_ROOT);
  const output = runOpl(['system', 'initialize'], env);
  assertInitializeState(output, {
    phase: 'review',
    blocking: [],
  });
  assert.equal(output.system_initialize.setup_flow.ready_to_launch, true);
  return { observations: { installed_modules_count: output.system_initialize.module_summary.installed_modules_count } };
}

function offlineModuleInstallBlocker(root) {
  const env = baseEnv(root, {
    OPL_MODULE_REPO_URL_MEDAUTOSCIENCE: path.join(root, 'missing-remote.git'),
  });
  const output = runOpl(['module', 'install', '--module', 'medautoscience'], env, 3);
  assert.equal(output.error.code, 'build_command_failed');
  return { observations: { error_code: output.error.code } };
}

function vmArtifactsOnly() {
  return {
    surface_id: 'opl_clean_vm_first_launch_artifacts',
    required_runner: 'self-hosted macOS VM runner',
    reset_requirement: 'Start from a clean macOS snapshot before each release DMG launch.',
    artifact_paths: [
      '~/Library/Logs/One Person Lab/first-run.jsonl',
      '~/Library/Application Support/OPL/state',
      'system-initialize.json',
      'modules.json',
      'first-launch.png',
      'unified-log.txt',
    ],
  };
}

if (args.has('--vm-artifacts-only')) {
  writeJson(vmArtifactsOnly());
  process.exit(0);
}

const cases = [
  runCase('clean_user_missing_codex', cleanUserMissingCodex),
  runCase('compatible_codex_missing_modules', compatibleCodexMissingModules),
  runCase('outdated_codex', outdatedCodex),
  runCase('ready_baseline', readyBaseline),
  runCase('offline_module_install_blocker', offlineModuleInstallBlocker),
];
const failed = cases.filter((entry) => entry.status !== 'passed');

writeJson({
  surface_id: 'opl_fresh_install_smoke',
  status: failed.length === 0 ? 'passed' : 'failed',
  summary: {
    total: cases.length,
    passed: cases.length - failed.length,
    failed: failed.length,
  },
  cases,
});

process.exitCode = failed.length === 0 ? 0 : 1;
