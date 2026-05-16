#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const nodeTest = (files, options = {}) => ({
  kind: 'node-test',
  files,
  stripTypes: options.stripTypes !== false,
});

const lanes = {
  smoke: [
    nodeTest([
      'tests/src/verification-command-surfaces.test.ts',
      'tests/src/verification-test-governance.test.ts',
      'tests/src/cli-modularization.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/opl-session-runtime.test.ts',
    ]),
  ],
  fast: [
    { kind: 'command', command: 'scripts/repo-hygiene.sh', args: [] },
    nodeTest([
      'tests/src/verification-command-surfaces.test.ts',
      'tests/src/verification-test-governance.test.ts',
      'tests/src/active-path-residue-scan.test.ts',
      'tests/src/stale-compat-retirement-guard.test.ts',
      'tests/src/family-structure-advisory.test.ts',
      'tests/src/family-shared-release-discipline.test.ts',
      'tests/src/family-shared-release.test.ts',
      'tests/src/native-helper-family-smoke.test.ts',
      'tests/src/native-helper-prebuild.test.ts',
      'tests/src/family-runtime-attempt-contract.test.ts',
      'tests/src/family-transition-runner.test.ts',
      'tests/src/functional-agent-runtime-harness.test.ts',
      'tests/src/family-runtime-codex-stage-runner.test.ts',
      'tests/src/family-runtime-temporal-provider.test.ts',
      'tests/src/agent-executor.test.ts',
      'tests/src/cli/cases/family-runtime-managed-state.test.ts',
      'tests/src/cli/cases/workspace-domain.transitions.test.ts',
      'tests/src/cli/cases/family-runtime.test.ts',
      'tests/src/cli/cases/family-runtime-binding-intake.test.ts',
      'tests/src/cli/cases/family-runtime-paper-autonomy.test.ts',
      'tests/src/cli/cases/family-runtime-provider-hosted-attempts.test.ts',
      'tests/src/cli/cases/family-runtime-provider-slo.test.ts',
      'tests/src/cli/cases/family-runtime-transition-bridge.test.ts',
      'tests/src/cli/cases/workspace-domain.production-closeout.test.ts',
      'tests/src/cli/cases/workspace-domain.production-provider-slo-closeout.test.ts',
      'tests/src/cli/cases/workspace-domain.production-evidence-readiness.test.ts',
      'tests/src/cli/cases/workspace-domain.production-provider-slo-closeout.test.ts',
      'tests/src/cli/cases/family-runtime-worker.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempts.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempt-usage.test.ts',
      'tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts',
      'tests/src/cli/cases/agent-executor-cli.test.ts',
      'tests/src/cli/cases/agents-scaffold.test.ts',
      'tests/src/cli/cases/runtime-tray-domain-projection-ingestion.test.ts',
      'tests/src/cli/cases/runtime-tray-stage-attempt-workbench.test.ts',
      'tests/src/cli/cases/runtime-tray-provider-continuous-proof.test.ts',
      'tests/src/cli/cases/runtime-observability-export.test.ts',
      'tests/src/cli/cases/runtime-manager-provider.test.ts',
      'tests/src/family-domain-quality-projection-contract.test.ts',
      'tests/src/family-incident-learning-loop.test.ts',
      'tests/src/family-product-operator-projection.test.ts',
      'tests/src/quality-details.test.ts',
    ]),
  ],
  regression: [
    nodeTest([
      'tests/src/cli.test.ts',
      'tests/src/cli/cases/runtime-tray-mas-portal.test.ts',
      'tests/src/cli-codex-default-shell.test.ts',
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
  'node-test': (step) => spawnStep(process.execPath, nodeTestArgs(step)),
};

function spawnStep(commandName, args) {
  return spawnSync(commandName, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
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
