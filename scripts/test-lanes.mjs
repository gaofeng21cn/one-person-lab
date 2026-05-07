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
      'tests/src/cli-modularization.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/opl-session-runtime.test.ts',
    ]),
  ],
  fast: [
    { kind: 'command', command: 'scripts/repo-hygiene.sh', args: [] },
    nodeTest([
      'tests/src/verification-command-surfaces.test.ts',
      'tests/src/family-structure-advisory.test.ts',
      'tests/src/family-shared-release-discipline.test.ts',
      'tests/src/family-shared-release.test.ts',
      'tests/src/native-helper-family-smoke.test.ts',
      'tests/src/native-helper-prebuild.test.ts',
      'tests/src/family-runtime-attempt-contract.test.ts',
      'tests/src/family-domain-quality-projection-contract.test.ts',
      'tests/src/family-incident-learning-loop.test.ts',
      'tests/src/family-product-operator-projection.test.ts',
      'tests/src/quality-details.test.ts',
    ]),
  ],
  regression: [
    nodeTest([
      'tests/src/cli.test.ts',
      'tests/src/cli-codex-default-shell.test.ts',
      'tests/src/runtime-state-paths.test.ts',
      'tests/src/family-domain-catalog.test.ts',
      'tests/src/family-entry-contracts.test.ts',
      'tests/src/family-executor-adapter-contract.test.ts',
      'tests/src/product-entry-companions.test.ts',
      'tests/src/product-entry-runtime.test.ts',
      'tests/src/product-entry-program-companions.test.ts',
      'tests/src/family-orchestration.test.ts',
      'tests/src/runtime-task-companions.test.ts',
      'tests/src/skill-catalog.test.ts',
      'tests/src/opl-skills-boundary.test.ts',
      'tests/src/automation-companions.test.ts',
      'tests/src/full-internal-package.test.ts',
    ]),
  ],
  integration: [
    nodeTest([
      'tests/src/cli/cases/acp-runtime.test.ts',
      'tests/src/cli/cases/system-install.test.ts',
      'tests/src/cli/cases/web-runtime.test.ts',
      'tests/src/domain-definition-contract.test.ts',
      'tests/src/opl-acp-bridge.test.ts',
      'tests/src/opl-acp-jsonrpc-lifecycle.test.ts',
      'tests/src/opl-acp-stdio.test.ts',
      'tests/src/opl-managed-runtime-three-layer-contract.test.ts',
      'tests/src/opl-session-runtime.test.ts',
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

switch (command) {
  case 'list':
    printLaneList();
    break;
  case 'run':
    runLane(argv[1]);
    break;
  case 'assert-coverage':
    assertCoverage();
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    fail(`Unknown command: ${command}`);
}

function runLane(laneName) {
  const steps = lanes[laneName];
  if (!steps) {
    fail(`Unknown test lane: ${laneName}`);
  }

  for (const step of steps) {
    const result = runStep(step);
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

function runStep(step) {
  if (step.kind === 'command') {
    return spawnSync(step.command, step.args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
  }
  if (step.kind === 'npm') {
    return spawnSync(npmCommand(), step.args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
  }
  if (step.kind === 'node-test') {
    const args = [];
    if (step.stripTypes) {
      args.push('--experimental-strip-types');
    }
    args.push('--test', ...step.files);
    return spawnSync(process.execPath, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
  }
  fail(`Unsupported test lane step kind: ${step.kind}`);
}

function assertCoverage() {
  const trackedTests = trackedTestFiles();
  const covered = new Set();

  for (const file of laneEntryFiles()) {
    addImportClosure(file, covered);
  }

  const uncovered = trackedTests.filter((file) => !covered.has(file));
  if (uncovered.length > 0) {
    process.stderr.write('Active test files are not assigned to a test lane:\n');
    process.stderr.write(uncovered.map((file) => `- ${file}`).join('\n'));
    process.stderr.write('\n');
    process.exit(1);
  }

  process.stdout.write(`All ${trackedTests.length} active test files are assigned to a test lane.\n`);
}

function laneEntryFiles() {
  return Object.values(lanes).flatMap((steps) =>
    steps.flatMap((step) => step.kind === 'node-test' ? step.files : []),
  );
}

function trackedTestFiles() {
  const result = spawnSync('git', ['ls-files', 'tests/**/*.test.ts', 'tests/**/*.test.mjs'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || 'git ls-files failed\n');
    process.exit(result.status ?? 1);
  }
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .filter((file) => file.startsWith('tests/src/') || file.startsWith('tests/built/'))
    .sort();
}

function addImportClosure(relativePath, covered) {
  const normalized = normalizeRelativePath(relativePath);
  if (covered.has(normalized)) {
    return;
  }
  covered.add(normalized);

  const absolutePath = path.join(repoRoot, normalized);
  if (!fs.existsSync(absolutePath)) {
    return;
  }

  const source = fs.readFileSync(absolutePath, 'utf8');
  const importPattern = /import\s+(?:[^'"]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g;
  const sourceDir = path.dirname(normalized);
  for (const match of source.matchAll(importPattern)) {
    const imported = resolveImport(sourceDir, match[1]);
    if (imported && /\.(?:test\.)?(?:ts|mjs)$/.test(imported)) {
      addImportClosure(imported, covered);
    }
  }
}

function resolveImport(sourceDir, specifier) {
  const candidates = [];
  const base = normalizeRelativePath(path.join(sourceDir, specifier));
  candidates.push(base);
  if (!path.extname(base)) {
    candidates.push(`${base}.ts`, `${base}.mjs`);
  }
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(repoRoot, candidate))) {
      return candidate;
    }
  }
  return null;
}

function printLaneList() {
  for (const [laneName, steps] of Object.entries(lanes)) {
    process.stdout.write(`${laneName}\n`);
    for (const step of steps) {
      if (step.kind === 'node-test') {
        for (const file of step.files) {
          process.stdout.write(`  ${file}\n`);
        }
      } else if (step.kind === 'npm') {
        process.stdout.write(`  npm ${step.args.join(' ')}\n`);
      } else {
        process.stdout.write(`  ${step.command} ${step.args.join(' ')}\n`.trimEnd() + '\n');
      }
    }
  }
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

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
