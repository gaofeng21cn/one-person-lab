#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ownsPythonCacheRoot = !process.env.OPL_REPO_TEMP_ROOT;
const pythonCacheRoot = process.env.OPL_REPO_TEMP_ROOT
  ? path.join(process.env.OPL_REPO_TEMP_ROOT, 'node-test-python-cache')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'opl-node-test-python-cache-'));
fs.mkdirSync(pythonCacheRoot, { recursive: true });
if (ownsPythonCacheRoot) {
  process.on('exit', () => {
    fs.rmSync(pythonCacheRoot, { recursive: true, force: true });
  });
}

const nodeTest = (files, options = {}) => ({
  kind: 'node-test',
  files,
  stripTypes: options.stripTypes !== false,
  batchSize: options.batchSize ?? null,
});

const lanes = {
  smoke: [
    nodeTest([
      'tests/src/verification-command-surfaces.test.ts',
      'tests/src/verification-test-governance.test.ts',
      'tests/src/cli-modularization.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/opl-session-runtime.test.ts',
    ], { batchSize: 25 }),
  ],
  fast: [
    { kind: 'command', command: 'scripts/repo-hygiene.sh', args: [] },
    nodeTest([
      'tests/src/verification-command-surfaces.test.ts',
      'tests/src/verification-test-governance.test.ts',
      'tests/src/active-path-residue-scan.test.ts',
      'tests/src/stale-compat-retirement-guard.test.ts',
      'tests/src/managed-shell-command-env.test.ts',
      'tests/src/family-structure-advisory.test.ts',
      'tests/src/family-shared-release-discipline.test.ts',
      'tests/src/family-shared-release.test.ts',
      'tests/src/native-helper-family-smoke.test.ts',
      'tests/src/native-helper-prebuild.test.ts',
      'tests/src/family-runtime-attempt-contract.test.ts',
      'tests/src/family-transition-runner.test.ts',
      'tests/src/functional-agent-runtime-harness.test.ts',
      'tests/src/functional-privatization-audit-envelope.test.ts',
      'tests/src/domain-dispatch-evidence-payload-preflight.test.ts',
      'tests/src/domain-dispatch-evidence-workorder-packet.test.ts',
      'tests/src/family-runtime-lifecycle-index.test.ts',
      'tests/src/agent-lab.test.ts',
      'tests/src/agent-lab-executor-aperture.test.ts',
      'tests/src/agent-lab-efficiency-nonregression.test.ts',
      'tests/src/agent-lab-token-cost-estimate.test.ts',
      'tests/src/agent-lab-complete.test.ts',
      'tests/src/agent-lab-ahe-evidence.test.ts',
      'tests/src/agent-lab-maturity-controls.test.ts',
      'tests/src/generic-substrate-projection.test.ts',
      'tests/src/family-stage-proof-bundle.test.ts',
      'tests/src/family-stage-cohort-loop.test.ts',
      'tests/src/family-stage-runtime-budget.test.ts',
      'tests/src/family-stage-assumption-lifecycle.test.ts',
      'tests/src/family-stage-replay-certification.test.ts',
      'tests/src/family-stage-pack-registry.test.ts',
      'tests/src/family-stage-integrity-metadata-contract.test.ts',
      'tests/src/family-stage-admission.test.ts',
      'tests/src/family-runtime-codex-stage-runner.test.ts',
      'tests/src/family-runtime-temporal-terminal-sync.test.ts',
      'tests/src/family-runtime-agent-stage-runner.test.ts',
      'tests/src/family-runtime-temporal-provider.test.ts',
      'tests/src/agent-executor.test.ts',
      'tests/src/cli/cases/system-startup-maintenance.test.ts',
      'tests/src/cli/cases/system-semantic-hygiene.test.ts',
      'tests/src/cli/cases/system-install-superpowers.test.ts',
      'tests/src/cli/cases/framework-readiness.test.ts',
      'tests/src/cli/cases/family-runtime-managed-state.test.ts',
      'tests/src/cli/cases/workspace-domain.transitions.test.ts',
      'tests/src/cli/cases/family-runtime.test.ts',
      'tests/src/cli/cases/family-runtime-task-scope.test.ts',
      'tests/src/domain-dispatch-evidence-workorder-packet.test.ts',
      'tests/src/cli/cases/family-runtime-evidence-worklist.test.ts',
      'tests/src/cli/cases/family-runtime-evidence-worklist-domain-blockers.test.ts',
      'tests/src/cli/cases/family-runtime-evidence-worklist-stage-payload.test.ts',
      'tests/src/cli/cases/family-runtime-mas-domain-route.test.ts',
      'tests/src/cli/cases/family-runtime-sidecar-timeout.test.ts',
      'tests/src/cli/cases/family-runtime-cross-repo-e2e.test.ts',
      'tests/src/cli/cases/family-runtime-binding-intake.test.ts',
      'tests/src/cli/cases/family-runtime-binding-deadletter.test.ts',
      'tests/src/cli/cases/family-runtime-paper-autonomy.test.ts',
      'tests/src/cli/cases/family-runtime-provider-hosted-attempts.test.ts',
      'tests/src/cli/cases/family-runtime-provider-slo.test.ts',
      'tests/src/cli/cases/family-runtime-transition-bridge.test.ts',
      'tests/src/cli/cases/workspace-domain.production-closeout.test.ts',
      'tests/src/cli/cases/workspace-domain.production-closeout-timeout.test.ts',
      'tests/src/cli/cases/workspace-domain.production-provider-slo-closeout.test.ts',
      'tests/src/cli/cases/workspace-domain.production-evidence-readiness.test.ts',
      'tests/src/cli/cases/workspace-domain.production-provider-slo-closeout.test.ts',
      'tests/src/cli/cases/family-runtime-worker.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempts.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempt-query-closeout.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempts-residency-proof.test.ts',
      'tests/src/cli/cases/family-runtime-stage-launch-gates.test.ts',
      'tests/src/cli/cases/family-runtime-stage-admission-contract-light.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempt-usage.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts',
      'tests/src/cli/cases/agent-lab.test.ts',
      'tests/src/cli/cases/agent-executor-cli.test.ts',
      'tests/src/cli/cases/agents-scaffold.test.ts',
      'tests/src/cli/cases/agents-conformance-stage-pack-v2.test.ts',
      'tests/src/cli/cases/agents-conformance.test.ts',
      'tests/src/cli/cases/domain-pack-compiler-drift-manifest.test.ts',
      'tests/src/cli/cases/domain-pack-compiler.test.ts',
      'tests/src/cli/cases/workspace-domain.stages-artifact-locator.test.ts',
      'tests/src/cli/cases/workspace-domain.stages-graph.test.ts',
      'tests/src/cli/cases/workspace-domain.external-evidence.test.ts',
      'tests/src/cli/cases/runtime-tray-domain-projection-ingestion.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-route-support.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-runtime-role.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-direct.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-lifecycle.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-actions.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-actions-ops.test.ts',
      'tests/src/cli/cases/runtime-app-operator-stage-evidence-actions.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-external-evidence-actions.test.ts',
      'tests/src/cli/cases/runtime-app-operator-stage-evidence-closeout.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-summary.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-oma-managed-install.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-oma-manual-required.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-owner-handoff.test.ts',
      'tests/src/cli/cases/runtime-tray-stage-attempt-workbench.test.ts',
      'tests/src/cli/cases/runtime-tray-stage-attempt-workbench-default-codex.test.ts',
      'tests/src/cli/cases/runtime-tray-provider-continuous-proof.test.ts',
      'tests/src/cli/cases/runtime-observability-export.test.ts',
      'tests/src/cli/cases/runtime-manager-provider.test.ts',
      'tests/src/cli/cases/runtime-lifecycle-operator.test.ts',
      'tests/src/family-domain-quality-projection-contract.test.ts',
      'tests/src/family-incident-learning-loop.test.ts',
      'tests/src/family-product-operator-projection.test.ts',
      'tests/src/quality-details.test.ts',
    ], { batchSize: 20 }),
  ],
  'fast-parallel': [
    { kind: 'command', command: 'scripts/repo-hygiene.sh', args: [] },
    nodeTest([
      'tests/src/verification-command-surfaces.test.ts',
      'tests/src/active-path-residue-scan.test.ts',
      'tests/src/stale-compat-retirement-guard.test.ts',
      'tests/src/managed-shell-command-env.test.ts',
      'tests/src/family-structure-advisory.test.ts',
      'tests/src/family-shared-release-discipline.test.ts',
      'tests/src/family-shared-release.test.ts',
      'tests/src/native-helper-family-smoke.test.ts',
      'tests/src/native-helper-prebuild.test.ts',
      'tests/src/family-runtime-attempt-contract.test.ts',
      'tests/src/family-transition-runner.test.ts',
      'tests/src/functional-agent-runtime-harness.test.ts',
      'tests/src/functional-privatization-audit-envelope.test.ts',
      'tests/src/domain-dispatch-evidence-payload-preflight.test.ts',
      'tests/src/family-runtime-lifecycle-index.test.ts',
      'tests/src/agent-lab.test.ts',
      'tests/src/agent-lab-executor-aperture.test.ts',
      'tests/src/agent-lab-efficiency-nonregression.test.ts',
      'tests/src/agent-lab-token-cost-estimate.test.ts',
      'tests/src/agent-lab-complete.test.ts',
      'tests/src/agent-lab-ahe-evidence.test.ts',
      'tests/src/agent-lab-maturity-controls.test.ts',
      'tests/src/generic-substrate-projection.test.ts',
      'tests/src/family-stage-proof-bundle.test.ts',
      'tests/src/family-stage-cohort-loop.test.ts',
      'tests/src/family-stage-runtime-budget.test.ts',
      'tests/src/family-stage-assumption-lifecycle.test.ts',
      'tests/src/family-stage-replay-certification.test.ts',
      'tests/src/family-stage-pack-registry.test.ts',
      'tests/src/family-stage-integrity-metadata-contract.test.ts',
      'tests/src/family-stage-admission.test.ts',
      'tests/src/family-runtime-codex-stage-runner.test.ts',
      'tests/src/family-runtime-temporal-terminal-sync.test.ts',
      'tests/src/family-runtime-agent-stage-runner.test.ts',
      'tests/src/family-runtime-temporal-provider.test.ts',
      'tests/src/agent-executor.test.ts',
      'tests/src/cli/cases/system-startup-maintenance.test.ts',
      'tests/src/cli/cases/system-semantic-hygiene.test.ts',
      'tests/src/cli/cases/system-install-superpowers.test.ts',
      'tests/src/cli/cases/family-runtime-managed-state.test.ts',
      'tests/src/cli/cases/workspace-domain.transitions.test.ts',
      'tests/src/cli/cases/family-runtime.test.ts',
      'tests/src/cli/cases/family-runtime-task-scope.test.ts',
      'tests/src/cli/cases/family-runtime-mas-domain-route.test.ts',
      'tests/src/cli/cases/family-runtime-sidecar-timeout.test.ts',
      'tests/src/cli/cases/family-runtime-cross-repo-e2e.test.ts',
      'tests/src/cli/cases/family-runtime-binding-intake.test.ts',
      'tests/src/cli/cases/family-runtime-binding-deadletter.test.ts',
      'tests/src/cli/cases/family-runtime-paper-autonomy.test.ts',
      'tests/src/cli/cases/family-runtime-provider-hosted-attempts.test.ts',
      'tests/src/cli/cases/family-runtime-provider-slo.test.ts',
      'tests/src/cli/cases/family-runtime-transition-bridge.test.ts',
      'tests/src/cli/cases/workspace-domain.production-closeout.test.ts',
      'tests/src/cli/cases/workspace-domain.production-closeout-timeout.test.ts',
      'tests/src/cli/cases/workspace-domain.production-provider-slo-closeout.test.ts',
      'tests/src/cli/cases/workspace-domain.production-evidence-readiness.test.ts',
      'tests/src/cli/cases/workspace-domain.production-provider-slo-closeout.test.ts',
      'tests/src/cli/cases/family-runtime-worker.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempts.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempt-query-closeout.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempts-residency-proof.test.ts',
      'tests/src/cli/cases/family-runtime-stage-launch-gates.test.ts',
      'tests/src/cli/cases/family-runtime-stage-admission-contract-light.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempt-usage.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts',
      'tests/src/cli/cases/agent-lab.test.ts',
      'tests/src/cli/cases/agent-executor-cli.test.ts',
      'tests/src/cli/cases/agents-scaffold.test.ts',
      'tests/src/cli/cases/agents-conformance-stage-pack-v2.test.ts',
      'tests/src/cli/cases/agents-conformance.test.ts',
      'tests/src/cli/cases/domain-pack-compiler-drift-manifest.test.ts',
      'tests/src/cli/cases/domain-pack-compiler.test.ts',
      'tests/src/cli/cases/workspace-domain.stages-artifact-locator.test.ts',
      'tests/src/cli/cases/workspace-domain.stages-graph.test.ts',
      'tests/src/cli/cases/workspace-domain.external-evidence.test.ts',
      'tests/src/cli/cases/runtime-tray-domain-projection-ingestion.test.ts',
      'tests/src/cli/cases/runtime-tray-stage-attempt-workbench.test.ts',
      'tests/src/cli/cases/runtime-tray-stage-attempt-workbench-default-codex.test.ts',
      'tests/src/cli/cases/runtime-tray-provider-continuous-proof.test.ts',
      'tests/src/cli/cases/runtime-observability-export.test.ts',
      'tests/src/cli/cases/runtime-manager-provider.test.ts',
      'tests/src/cli/cases/runtime-lifecycle-operator.test.ts',
      'tests/src/family-domain-quality-projection-contract.test.ts',
      'tests/src/family-incident-learning-loop.test.ts',
      'tests/src/quality-details.test.ts',
    ], { batchSize: 20 }),
  ],
  'read-model-gates': [
    nodeTest([
      'tests/src/verification-test-governance.test.ts',
      'tests/src/family-product-operator-projection.test.ts',
      'tests/src/cli/cases/framework-readiness.test.ts',
      'tests/src/domain-dispatch-evidence-workorder-packet.test.ts',
      'tests/src/cli/cases/family-runtime-evidence-worklist.test.ts',
      'tests/src/cli/cases/family-runtime-evidence-worklist-domain-blockers.test.ts',
      'tests/src/cli/cases/family-runtime-evidence-worklist-stage-payload.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-route-support.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-runtime-role.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-direct.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-lifecycle.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-actions.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-actions-ops.test.ts',
      'tests/src/cli/cases/runtime-app-operator-stage-evidence-actions.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-external-evidence-actions.test.ts',
      'tests/src/cli/cases/runtime-app-operator-stage-evidence-closeout.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-summary.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-oma-managed-install.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-oma-manual-required.test.ts',
      'tests/src/cli/cases/runtime-app-operator-drilldown-owner-handoff.test.ts',
      'tests/src/cli/cases/runtime-tray-stage-attempt-workbench-default-codex.test.ts',
    ]),
  ],
  meta: [
    nodeTest([
      'tests/src/verification-command-surfaces.test.ts',
      'tests/src/verification-test-governance.test.ts',
      'tests/src/cli-modularization.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/active-path-residue-scan.test.ts',
      'tests/src/stale-compat-retirement-guard.test.ts',
      'tests/src/cli/cases/system-semantic-hygiene.test.ts',
      'tests/src/cli/cases/framework-readiness.test.ts',
      'tests/src/cli/cases/agents-conformance-stage-pack-v2.test.ts',
      'tests/src/family-product-operator-projection.test.ts',
    ], { batchSize: 10 }),
  ],
  regression: [
    nodeTest([
      'tests/src/cli.test.ts',
      'tests/src/cli/cases/runtime-tray-mas-portal.test.ts',
      'tests/src/cli-codex-default-shell.test.ts',
      'tests/src/cli-codex-default-shell-passthrough.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/family-domain-catalog.test.ts',
      'tests/src/family-entry-contracts.test.ts',
      'tests/src/family-executor-adapter-contract.test.ts',
      'tests/src/product-entry-companions.test.ts',
      'tests/src/product-entry-runtime.test.ts',
      'tests/src/product-entry-program-companions.test.ts',
      'tests/src/product-entry-agent-executor.test.ts',
      'tests/src/family-orchestration.test.ts',
      'tests/src/runtime-task-companions.test.ts',
      'tests/src/skill-catalog.test.ts',
      'tests/src/opl-skills-boundary.test.ts',
      'tests/src/automation-companions.test.ts',
    ]),
  ],
  integration: [
    nodeTest([
      'tests/src/cli-acp-runtime.test.ts',
      'tests/src/cli-install.test.ts',
      'tests/src/cli/cases/web-runtime.test.ts',
      'tests/src/domain-definition-contract.test.ts',
    ]),
  ],
  artifact: [
    { kind: 'npm', args: ['run', 'build'] },
    nodeTest(['tests/built/cli.test.mjs'], { stripTypes: false }),
  ],
  'fresh-install': [
    nodeTest(['tests/src/fresh-install-smoke.test.ts']),
  ],
};

const argv = process.argv.slice(2);
const command = argv[0] ?? 'help';
const commandHandlers = {
  list: printLaneList,
  run: () => runLane(argv[1]),
  'assert-coverage': assertCoverage,
  help: printHelp,
  '--help': printHelp,
  '-h': printHelp,
};

function runLane(laneName) {
  requireLane(laneName).forEach(runLaneStep);
}

function requireLane(laneName) {
  const steps = lanes[laneName];
  if (!steps) {
    fail(`Unknown test lane: ${laneName}`);
  }
  return steps;
}

function runLaneStep(step) {
  const result = runStep(step);
  exitOnFailure(result);
}

function runStep(step) {
  const stepRunner = stepRunners[step.kind];
  if (!stepRunner) {
    fail(`Unsupported test lane step kind: ${step.kind}`);
  }
  return stepRunner(step);
}

const stepRunners = {
  command: (step) => spawnStep(step.command, step.args),
  npm: (step) => spawnStep(npmCommand(), step.args),
  'node-test': runNodeTestStep,
};

function runNodeTestStep(step) {
  if (!Number.isInteger(step.batchSize) || step.batchSize <= 0 || step.files.length <= step.batchSize) {
    return spawnStep(process.execPath, nodeTestArgs(step));
  }
  for (const files of chunkFiles(step.files, step.batchSize)) {
    const result = spawnStep(process.execPath, nodeTestArgs({ ...step, files }));
    if (result.status !== 0) {
      return result;
    }
  }
  return { status: 0 };
}

function chunkFiles(files, size) {
  const chunks = [];
  for (let index = 0; index < files.length; index += size) {
    chunks.push(files.slice(index, index + size));
  }
  return chunks;
}

function spawnStep(commandName, args) {
  return spawnSync(commandName, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      TMPDIR: process.env.TMPDIR || path.join(pythonCacheRoot, 'tmp') + path.sep,
      NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE || path.join(pythonCacheRoot, 'node-compile-cache'),
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || path.join(pythonCacheRoot, 'npm-cache'),
      npm_config_cache: process.env.npm_config_cache || process.env.NPM_CONFIG_CACHE || path.join(pythonCacheRoot, 'npm-cache'),
      UV_CACHE_DIR: process.env.UV_CACHE_DIR || path.join(pythonCacheRoot, 'uv-cache'),
      UV_PROJECT_ENVIRONMENT: process.env.UV_PROJECT_ENVIRONMENT || path.join(pythonCacheRoot, 'uv-project-venv'),
      PIP_CACHE_DIR: process.env.PIP_CACHE_DIR || path.join(pythonCacheRoot, 'pip-cache'),
      CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || path.join(pythonCacheRoot, 'cargo-target'),
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || path.join(pythonCacheRoot, 'xdg-cache'),
      PYTHONDONTWRITEBYTECODE: process.env.PYTHONDONTWRITEBYTECODE || '1',
      PYTHONPYCACHEPREFIX: process.env.PYTHONPYCACHEPREFIX || path.join(pythonCacheRoot, 'pycache'),
      PYTEST_ADDOPTS: [
        process.env.PYTEST_ADDOPTS || '',
        '-p no:cacheprovider',
        `-o cache_dir=${path.join(pythonCacheRoot, 'pytest-cache')}`,
      ].filter(Boolean).join(' '),
    },
  });
}

function nodeTestArgs(step) {
  const args = step.stripTypes ? ['--experimental-strip-types'] : [];
  args.push('--test', ...step.files);
  return args;
}

function assertCoverage() {
  const trackedTests = trackedTestFiles();
  const covered = coveredTestFiles();
  const uncovered = trackedTests.filter((file) => !covered.has(file));
  failOnUncoveredTests(uncovered);

  process.stdout.write(`All ${trackedTests.length} active test files are assigned to a test lane.\n`);
}

function coveredTestFiles() {
  const covered = new Set();
  laneEntryFiles().forEach((file) => addImportClosure(file, covered));
  return covered;
}

function failOnUncoveredTests(uncovered) {
  if (uncovered.length === 0) {
    return;
  }
  process.stderr.write('Active test files are not assigned to a test lane:\n');
  process.stderr.write(uncovered.map((file) => `- ${file}`).join('\n'));
  process.stderr.write('\n');
  process.exit(1);
}

function laneEntryFiles() {
  return Object.values(lanes).flatMap(laneNodeTestFiles);
}

function laneNodeTestFiles(steps) {
  return steps.filter(isNodeTestStep).flatMap(stepFiles);
}

function isNodeTestStep(step) {
  return step.kind === 'node-test';
}

function stepFiles(step) {
  return step.files;
}

function trackedTestFiles() {
  const result = spawnSync('git', ['ls-files', 'tests/**/*.test.ts', 'tests/**/*.test.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assertSuccessfulGitLsFiles(result);
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .filter(isActiveTrackedTestFile)
    .sort();
}

function assertSuccessfulGitLsFiles(result) {
  if (result.status === 0) {
    return;
  }
  process.stderr.write(result.stderr);
  process.stderr.write('git ls-files failed\n');
  process.exit(1);
}

function isActiveTrackedTestFile(file) {
  if (!fs.existsSync(path.join(repoRoot, file))) {
    return false;
  }
  return file.startsWith('tests/src/') || file.startsWith('tests/built/');
}

function addImportClosure(relativePath, covered) {
  const normalized = normalizeRelativePath(relativePath);
  if (!shouldReadForClosure(normalized, covered)) {
    return;
  }

  collectImportedTestFiles(normalized).forEach((imported) => addImportClosure(imported, covered));
}

function shouldReadForClosure(relativePath, covered) {
  return markCovered(relativePath, covered) && trackedFileExists(relativePath);
}

function markCovered(relativePath, covered) {
  if (covered.has(relativePath)) {
    return false;
  }
  covered.add(relativePath);
  return true;
}

function collectImportedTestFiles(relativePath) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  const importPattern = /import\s+(?:[^'"]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g;
  const sourceDir = path.dirname(relativePath);
  return [...source.matchAll(importPattern)]
    .map((match) => resolveImport(sourceDir, match[1]))
    .filter(isImportableTestFile);
}

function isImportableTestFile(file) {
  return Boolean(file && /\.(?:test\.)?(?:ts|mjs)$/.test(file));
}

function resolveImport(sourceDir, specifier) {
  const base = normalizeRelativePath(path.join(sourceDir, specifier));
  return importCandidates(base).find(trackedFileExists) ?? null;
}

function importCandidates(base) {
  return path.extname(base) ? [base] : [base, `${base}.ts`, `${base}.mjs`];
}

function trackedFileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function printLaneList() {
  Object.entries(lanes).forEach(printLane);
}

function printLane([laneName, steps]) {
  process.stdout.write(`${laneName}\n`);
  steps.forEach((step) => process.stdout.write(formatLaneStep(step)));
}

const laneStepFormatters = {
  command: formatCommandStep,
  npm: formatNpmStep,
  'node-test': formatNodeTestStep,
};

function formatLaneStep(step) {
  const formatter = laneStepFormatters[step.kind];
  return formatter(step);
}

function formatNodeTestStep(step) {
  return step.files.map((file) => `  ${file}\n`).join('');
}

function formatNpmStep(step) {
  return `  npm ${step.args.join(' ')}\n`;
}

function formatCommandStep(step) {
  return `  ${step.command} ${step.args.join(' ')}\n`.trimEnd() + '\n';
}

function printHelp() {
  process.stdout.write(`Usage: scripts/test-lanes.mjs <command>\n\n`);
  process.stdout.write('Commands:\n');
  process.stdout.write('  list\n');
  process.stdout.write('  run <smoke|fast|regression|integration|artifact|fresh-install>\n');
  process.stdout.write('  assert-coverage\n');
}

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function exitOnFailure(result) {
  if (result.status === 0) {
    return;
  }
  process.exit(exitStatus(result));
}

function exitStatus(result) {
  return result.status === null ? 1 : result.status;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const commandHandler = commandHandlers[command];
if (!commandHandler) {
  fail(`Unknown command: ${command}`);
}
commandHandler();
