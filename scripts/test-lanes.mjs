#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const defaultStepTimeoutMs = 20 * 60 * 1000;
const maxStepTimeoutMs = 60 * 60 * 1000;
const stepTimeoutMs = parseStepTimeoutMs(process.env.OPL_TEST_LANE_STEP_TIMEOUT_MS);
const ownsPythonCacheRoot = !process.env.OPL_REPO_TEMP_ROOT;
const pythonCacheRoot = process.env.OPL_REPO_TEMP_ROOT
  ? path.join(process.env.OPL_REPO_TEMP_ROOT, 'node-test-python-cache')
  : fs.mkdtempSync(path.join(os.tmpdir(), 'opl-node-test-python-cache-'));
fs.mkdirSync(pythonCacheRoot, { recursive: true });
const toolTempDir = path.join(pythonCacheRoot, 'tmp');
fs.mkdirSync(toolTempDir, { recursive: true });
let testLaneStateRoot = null;
let testLaneHomeRoot = null;
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
  env: options.env ?? {},
});

const sourceTest = (patterns, options = {}) => nodeTest(
  expandTestFiles(patterns.map((pattern) => `tests/src/${pattern}`), options),
  options,
);

function expandTestFiles(patterns, options = {}) {
  const expanded = patterns.flatMap((pattern) => {
    const matches = fs.globSync(pattern, { cwd: repoRoot }).map(normalizeRelativePath);
    if (!matches.length) {
      fail(`Test lane pattern matched no files: ${pattern}`);
    }
    return matches;
  });
  const excluded = options.exclude ?? [];
  const staleExclusions = excluded.filter((file) => !expanded.includes(file));
  if (staleExclusions.length) {
    fail(`Test lane exclusions matched no expanded files: ${staleExclusions.join(', ')}`);
  }
  return expanded.filter((file) => !excluded.includes(file));
}

function selectTestRoots(patterns, options = {}) {
  const matched = new Set(expandTestFiles(patterns, options));
  return sourceTestRoots.filter((file) => matched.has(file));
}

export function discoverTestRoots(testFiles, sourceReader = readTestSource) {
  const availableFiles = new Set(testFiles.map(normalizeRelativePath));
  const importedFiles = new Set();
  for (const relativePath of availableFiles) {
    collectImportedTestFiles(relativePath, availableFiles, sourceReader)
      .forEach((imported) => importedFiles.add(imported));
  }
  return [...availableFiles].filter((file) => !importedFiles.has(file)).sort();
}

const sourceTestPatterns = ['tests/src/**/*.test.{ts,mjs}'];
const activeSourceTestFiles = expandTestFiles(sourceTestPatterns).sort();
const sourceTestRoots = discoverTestRoots(activeSourceTestFiles);

const readModelGateCliExclusions = [
  ...expandTestFiles([
    'tests/src/cli/cases/{agents-conformance-stage-pack-v2,agents-default-callers,agents-residue-decisions,domain-pack-compiler-canonical-targets,framework-readiness-cli-surface,system-dependency-doctor,web-runtime}.test.ts',
    'tests/src/cli/cases/connect-*.test.ts',
    'tests/src/cli/cases/pack-*.test.ts',
    'tests/src/cli/cases/release-*.test.ts',
  ]),
  ...expandTestFiles([
    'tests/src/cli/cases/{agents-run,artifact-provenance-bundle-ledger,brand-modules,capability-map-audit-script,cli-broken-pipe,cli-command-registry,family-manifest-fixtures,family-runtime-command-parser,framework-operating-maturity,okf-command-surface,opl-foundation-skills-plugin-surface,packages,read-only-cli-invocation,runtime-brand-module-l5-evidence-ledger,runtime-environment-substrate-command-surface,runtime-stage-candidate-portfolio-read-model,runtime-stage-run-evidence-pack-read-model,standard-agent-unified-public-surfaces}.test.ts',
  ]),
];

const readModelGateTopLevelPatterns = [
  'tests/src/domain-detail-view.test.ts',
  'tests/src/work-item-*.test.ts',
  'tests/src/app-state-view-model-runtime-scope.test.ts',
  'tests/src/current-owner-delta-topline.test.ts',
  'tests/src/framework-readiness-attention-actions.test.ts',
  'tests/src/generic-substrate-projection.test.ts',
  'tests/src/family-runtime-codex-stage-runner.test.ts',
  'tests/src/family-runtime-stage-attempt-closeout-ledger.test.ts',
  'tests/src/family-runtime-temporal-{provider,terminal-sync,runtime-observation-reconciliation}.test.ts',
  'tests/src/family-runtime-agent-stage-runner.test.ts',
  'tests/src/foundry-temporal.test.ts',
  'tests/src/temporal-production-proof-fixture.test.ts',
  'tests/src/default-executor-recovery.test.ts',
  'tests/src/agent-executor.test.ts',
  'tests/src/framework-readiness-owner-delta-handoff-summary.test.ts',
  'tests/src/family-runtime-evidence-worklist-family-scope.test.ts',
  'tests/src/runtime-app-operator-selected-safe-action.test.ts',
];

const readModelGateTestFiles = [
  ...selectTestRoots(
    ['tests/src/cli/cases/**/*.test.{ts,mjs}'],
    { exclude: readModelGateCliExclusions },
  ),
  ...selectTestRoots(readModelGateTopLevelPatterns, {
    exclude: [
      'tests/src/work-item-file-boundary.test.ts',
      'tests/src/work-item-inventory-binding.test.ts',
    ],
  }),
  // These imported files belong to this focused lane even though their aggregate
  // roots execute in fast or regression.
  'tests/src/cli/cases/managed-update-kernel-projection.test.ts',
  'tests/src/cli/cases/packages-cases/workflow-policy-transaction.test.ts',
  'tests/src/cli/cases/framework-readiness-binding-cases.test.ts',
  'tests/src/cli/cases/workspace-domain.agent-skeleton.test.ts',
  'tests/src/cli/cases/workspace-domain.external-evidence.test.ts',
];

const fastLaneExcludedTestFiles = new Set(expandTestFiles([
  'tests/built/**/*.test.{ts,mjs}',
  'tests/src/{agent-profile-spine,cli-acp-runtime,cli-codex-default-shell-sync-skills,cli-codex-default-shell,cli-install,cli,cli-modularization,domain-definition-contract,evidence-grounded-decision-agent-profile,family-domain-catalog,family-entry-contracts,family-executor-adapter-contract,family-orchestration,fresh-install-smoke,handoff-bundle,opl-skills-boundary,product-entry-agent-executor,product-entry-companions,product-entry-runtime,profile-capability-plan,refactor-patrol-state,runtime-state-paths,source-module-boundary,source-module-public-imports,stage-run-mag-integration}.test.ts',
  'tests/src/cli/cases/{agents-conformance-stage-pack-v2,agents-default-callers,agents-residue-decisions,domain-pack-compiler-canonical-targets,framework-readiness-cli-surface,system-dependency-doctor,web-runtime}.test.ts',
]));

const fastReadModelSharedTestFiles = new Set([
  'tests/src/cli/cases/domain-pack-compiler-active-caller-targets.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-generated-interfaces.test.ts',
  'tests/src/cli/cases/domain-pack-compiler-standard-agent-contract-pack.test.ts',
]);

const readModelGateTestFileSet = new Set(readModelGateTestFiles);
const fastTestFiles = sourceTestRoots.filter((file) => fastReadModelSharedTestFiles.has(file)
  || (!readModelGateTestFileSet.has(file) && !fastLaneExcludedTestFiles.has(file)));

const readModelGateTemporalHeavyTestFiles = [
  'tests/src/family-runtime-temporal-provider.test.ts',
  'tests/src/family-runtime-temporal-terminal-sync.test.ts',
  'tests/src/cli/cases/family-runtime.test.ts',
  'tests/src/cli/cases/family-runtime-provider-repair.test.ts',
  'tests/src/cli/cases/family-runtime-worker.test.ts',
  'tests/src/cli/cases/family-runtime-worker-lifecycle.test.ts',
  'tests/src/cli/cases/family-runtime-stage-attempts-temporal-provider.test.ts',
];

const fastTemporalStageRunControllerTestFiles = [
  'tests/src/family-runtime-temporal-stage-run-controller-recovery.test.ts',
  'tests/src/family-runtime-temporal-stage-run-controller-routing.test.ts',
  'tests/src/family-runtime-temporal-stage-run-controller-outcomes.test.ts',
  'tests/src/family-runtime-temporal-stage-run-controller-transport.test.ts',
];

// Each of these starts its own Temporal test server. They run one file at a time
// so the server's five second connect budget is not consumed by fifteen other
// suites starting processes beside them.
const fastIsolatedTemporalTestFiles = [
  'tests/src/family-runtime-pack-bound-stage-quality-e2e.test.ts',
  'tests/src/family-runtime-temporal-stage-run-recovery-start.test.ts',
];

const fastIsolatedCliTestFiles = [
  'tests/src/cli/cases/packages.test.ts',
  'tests/src/cli/cases/cli-command-registry.test.ts',
  'tests/src/cli/cases/release-bundle.test.ts',
];

const fastNonTemporalHeavyTestFiles = fastTestFiles.filter(
  (file) => !fastIsolatedTemporalTestFiles.includes(file)
    && !fastTemporalStageRunControllerTestFiles.includes(file),
).filter(
  (file) => !fastIsolatedCliTestFiles.includes(file),
);

// Batches inside one node-test step run one after another, so the batch size
// decides how much of the file set can execute in parallel. Measured on the fast
// lane's mixed file set: 20 files per batch spent 163s across 12 serial batches,
// 54 spent 106s across 4, and a single batch spent 93s. 54 keeps the lane within
// a few seconds of the theoretical floor while keeping the failure report narrow
// enough to name the file set that broke.
const fastNonTemporalHeavyBatchSize = 54;

// These suites read ambient machine state - App carrier probes and startup
// maintenance locks - through helpers with a one second process budget. Sharing
// a batch with nineteen other suites can exhaust that budget on a loaded host, so
// they run one file at a time.
const readModelGateIsolatedHeavyTestFiles = [
  'tests/src/cli/cases/system-seed-manifest.test.ts',
  'tests/src/cli/cases/system-startup-maintenance.test.ts',
  'tests/src/cli/cases/managed-update-kernel-projection.test.ts',
];

const readModelGateNonTemporalHeavyTestFiles = readModelGateTestFiles.filter(
  (file) => !readModelGateTemporalHeavyTestFiles.includes(file)
    && !readModelGateIsolatedHeavyTestFiles.includes(file),
);

const lanes = {
  smoke: [
    { kind: 'npm', args: ['run', 'source:modules', '--', '--strict-imports', '--strict-cycles'] },
    sourceTest([
      '{verification-command-surfaces,target-architecture-schema-contracts,evidence-grounded-decision-agent-profile,agent-profile-spine,profile-capability-plan,evidence-grounded-stagecraft-runway,evidence-grounded-substrate,cognitive-computation-kernel-contract,advisory-knowledge-boundary-contract,opl-flow-completion-audit-contract,test-lanes-state-isolation,source-module-boundary,source-module-public-imports,cli-modularization,runtime-state-paths,runtime-environment-substrate,opl-session-runtime}.test.ts',
      'cli/cases/runtime-environment-substrate-command-surface.test.ts',
    ], { batchSize: 25 }),
  ],
  fast: [
    { kind: 'command', command: process.execPath, args: ['scripts/test-lanes.mjs', 'assert-coverage'] },
    { kind: 'npm', args: ['run', 'build'] },
    { kind: 'command', command: 'scripts/repo-hygiene.sh', args: [] },
    nodeTest(fastNonTemporalHeavyTestFiles, { batchSize: fastNonTemporalHeavyBatchSize }),
    nodeTest(fastIsolatedCliTestFiles, {
      batchSize: 1,
      env: { OPL_CLI_TEST_TIMEOUT_MS: '90000' },
    }),
    nodeTest(fastTemporalStageRunControllerTestFiles, { batchSize: 4 }),
    nodeTest(fastIsolatedTemporalTestFiles, { batchSize: 1 }),
  ],
  'read-model-gates': [
    nodeTest(readModelGateNonTemporalHeavyTestFiles, {
      batchSize: 20,
      env: { OPL_CLI_TEST_TIMEOUT_MS: '90000' },
    }),
    nodeTest(readModelGateIsolatedHeavyTestFiles, {
      batchSize: 1,
      env: { OPL_CLI_TEST_TIMEOUT_MS: '90000' },
    }),
    nodeTest(readModelGateTemporalHeavyTestFiles, {
      batchSize: 1,
      env: { OPL_CLI_TEST_TIMEOUT_MS: '90000' },
    }),
  ],
  meta: [
    sourceTest([
      '{verification-command-surfaces,target-architecture-schema-contracts,cognitive-computation-kernel-contract,refactor-patrol-state,cli-modularization,runtime-state-paths,current-owner-delta-read-model-cache,family-product-operator-projection}.test.ts',
      'framework-readiness-attention-actions.test.ts',
      'cli/cases/{system-dependency-doctor,framework-readiness-binding-cases,framework-readiness,runtime-manifest-cache-timeout,framework-readiness-attention-semantics,framework-readiness-cli-surface,agents-conformance-stage-pack-v2,agents-source-closure,agents-default-callers,agents-residue-decisions,domain-pack-compiler-canonical-targets}.test.ts',
    ], { batchSize: 10 }),
  ],
  regression: [
    sourceTest([
      '{base-managed-dependencies,cli-codex-default-shell,cli-codex-default-shell-sync-skills,runtime-state-paths,family-domain-catalog,family-entry-contracts,family-executor-adapter-contract,handoff-bundle,product-entry-companions,product-entry-runtime,product-entry-agent-executor,family-orchestration,agent-package-home-localization,opl-skills-boundary}.test.ts',
      'cli.test.ts',
    ], {
      env: { OPL_CLI_TEST_TIMEOUT_MS: '90000' },
    }),
  ],
  integration: [
    sourceTest([
      '{cli-acp-runtime,cli-install,domain-definition-contract}.test.ts',
      'cli/cases/web-runtime.test.ts',
    ], {
      env: { OPL_CLI_TEST_TIMEOUT_MS: '90000' },
    }),
  ],
  'stage-run-mag-integration': [
    sourceTest(['stage-run-mag-integration.test.ts']),
  ],
  artifact: [
    { kind: 'npm', args: ['run', 'build'] },
    nodeTest(['tests/built/cli.test.mjs', 'tests/built/workbench-temporal.test.mjs'], { stripTypes: false }),
  ],
  'fresh-install': [
    sourceTest(['fresh-install-smoke.test.ts']),
  ],
};

// `test:full` used to chain the focused lanes, so the 26 test files that several
// lanes list executed once per lane. The aggregate lane derives its file set from
// those same lanes and keeps the strictest batch/env configuration per file, so
// every active test still runs, exactly once.
const fullLaneConstituentLanes = [
  'artifact',
  'fast',
  'fresh-install',
  'read-model-gates',
  'meta',
  'regression',
  'integration',
];

function stepConfiguration(step) {
  return {
    batchSize: step.batchSize ?? step.files.length,
    stripTypes: step.stripTypes !== false,
    env: step.env ?? {},
  };
}

function fullLaneNodeTestSteps() {
  const fileConfigurations = new Map();
  for (const laneName of fullLaneConstituentLanes) {
    for (const step of lanes[laneName] ?? []) {
      if (step.kind !== 'node-test') {
        continue;
      }
      for (const file of step.files) {
        const candidate = stepConfiguration(step);
        const existing = fileConfigurations.get(file);
        fileConfigurations.set(file, existing
          ? {
            batchSize: Math.min(existing.batchSize, candidate.batchSize),
            stripTypes: existing.stripTypes && candidate.stripTypes,
            env: { ...existing.env, ...candidate.env },
          }
          : candidate);
      }
    }
  }

  const groups = new Map();
  for (const [file, configuration] of fileConfigurations) {
    const key = JSON.stringify([configuration.stripTypes, configuration.batchSize, configuration.env]);
    if (!groups.has(key)) {
      groups.set(key, { configuration, files: [] });
    }
    groups.get(key).files.push(file);
  }
  // Keep the order the owning lanes declared: batching decisions, and therefore
  // per-batch process load, stay identical to running the focused lanes.
  return [...groups.values()].map(({ configuration, files }) => nodeTest(files, configuration));
}

function dedupeLaneSteps(steps) {
  const unique = [];
  const seen = new Set();
  for (const step of steps) {
    const key = JSON.stringify([step.kind, step.command ?? null, step.args ?? null]);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(step);
  }
  return unique;
}

function sharedLaneSteps(laneNames) {
  return dedupeLaneSteps(laneNames.flatMap((laneName) => (lanes[laneName] ?? [])
    .filter((step) => step.kind !== 'node-test')));
}

lanes.full = [
  ...dedupeLaneSteps([
    { kind: 'command', command: process.execPath, args: ['scripts/test-lanes.mjs', 'assert-coverage'] },
    ...sharedLaneSteps(fullLaneConstituentLanes),
  ]),
  ...fullLaneNodeTestSteps(),
  { kind: 'npm', args: ['run', 'typecheck'] },
  { kind: 'npm', args: ['run', 'lint'] },
  { kind: 'command', command: 'scripts/verify.sh', args: ['structure'] },
  { kind: 'command', command: 'scripts/verify.sh', args: ['native'] },
];

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
  const steps = requireLane(laneName);
  const failures = [];
  steps.forEach((step, index) => {
    const result = runLaneStep(laneName, step, index);
    if (result.status === 0) {
      return;
    }
    if (!shouldContinueOnFailure()) {
      exitOnFailure(result);
    }
    failures.push(...describeStepFailures(step, index, result));
  });
  if (failures.length > 0) {
    reportLaneFailures(laneName, failures);
    process.exit(1);
  }
}

function requireLane(laneName) {
  const steps = lanes[laneName];
  if (!steps) {
    fail(`Unknown test lane: ${laneName}`);
  }
  return steps;
}

function runLaneStep(laneName, step, stepIndex) {
  return runStep(step, { laneName, stepIndex });
}

function shouldContinueOnFailure() {
  return process.env.OPL_TEST_LANE_CONTINUE === '1' || argv.slice(2).includes('--continue');
}

function describeStepFailures(step, stepIndex, result) {
  if (result.failedBatches?.length) {
    return result.failedBatches.map((batch) =>
      `step ${stepIndex + 1} (${step.kind}) batch ${batch.batchIndex + 1}/${batch.batchCount}: ${batch.files.join(', ')}`);
  }
  return [
    `step ${stepIndex + 1} (${step.kind})${step.files ? `: ${step.files.join(', ')}` : ''}`,
  ];
}

function reportLaneFailures(laneName, failures) {
  process.stderr.write(
    `Test lane ${laneName} failed in ${failures.length} step${failures.length === 1 ? '' : 's'} (continued run):\n`,
  );
  failures.forEach((failure) => process.stderr.write(`- ${failure}\n`));
}

function runStep(step, context) {
  const stepRunner = stepRunners[step.kind];
  if (!stepRunner) {
    fail(`Unsupported test lane step kind: ${step.kind}`);
  }
  return stepRunner(step, context);
}

const stepRunners = {
  command: (step, context) => spawnStep(step.command, step.args, {
    ...context,
    stepKind: step.kind,
  }, { env: createTestStepEnv(step.env) }),
  npm: (step, context) => spawnStep(npmCommand(), step.args, {
    ...context,
    stepKind: step.kind,
  }, { env: createTestStepEnv(step.env) }),
  'node-test': runNodeTestStep,
};

export function runNodeTestStep(step, context) {
  if (!Number.isInteger(step.batchSize) || step.batchSize <= 0 || step.files.length <= step.batchSize) {
    return spawnStep(process.execPath, nodeTestArgs(step), {
      ...context,
      stepKind: step.kind,
      batchFiles: step.files,
    }, { env: createTestStepEnv(step.env) });
  }
  const chunks = chunkFiles(step.files, step.batchSize);
  const failedBatches = [];
  for (const [batchIndex, files] of chunks.entries()) {
    const result = spawnStep(process.execPath, nodeTestArgs({ ...step, files }), {
      ...context,
      stepKind: step.kind,
      batchIndex,
      batchCount: chunks.length,
      batchFiles: files,
    }, { env: createTestStepEnv(step.env) });
    if (result.status !== 0) {
      failedBatches.push({ batchIndex, batchCount: chunks.length, files });
      if (!shouldContinueOnFailure()) {
        return { ...result, failedBatches };
      }
    }
  }
  return failedBatches.length === 0 ? { status: 0 } : { status: 1, failedBatches };
}

function createTestStepEnv(stepEnv = {}) {
  if (!testLaneStateRoot) {
    testLaneStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-lane-state-'));
    process.on('exit', () => {
      fs.rmSync(testLaneStateRoot, { recursive: true, force: true });
    });
  }
  const stateDir = fs.mkdtempSync(path.join(testLaneStateRoot, 'step-'));
  const homeDir = createTestStepHome();
  return {
    ...stepEnv,
    OPL_STATE_DIR: stateDir,
    HOME: homeDir,
    USERPROFILE: homeDir,
    GIT_CONFIG_GLOBAL: path.join(homeDir, '.gitconfig'),
  };
}

// A checkout-local HOME keeps lane steps hermetic: descriptor and carrier reads
// must not consume the invoking user's installed state, and an empty home is
// orders of magnitude cheaper than a populated one.
function createTestStepHome() {
  if (!testLaneHomeRoot) {
    testLaneHomeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-test-lane-home-'));
    process.on('exit', () => {
      fs.rmSync(testLaneHomeRoot, { recursive: true, force: true });
    });
  }
  const homeDir = fs.mkdtempSync(path.join(testLaneHomeRoot, 'home-'));
  fs.writeFileSync(path.join(homeDir, '.gitconfig'), gitConfigContents(), 'utf8');
  return homeDir;
}

function gitConfigContents() {
  const identity = (key, fallback) => {
    const result = spawnSync('git', ['config', '--global', key], { encoding: 'utf8' });
    const value = result.status === 0 ? result.stdout.trim() : '';
    return value || fallback;
  };
  return [
    '[user]',
    `\tname = ${identity('user.name', 'OPL Test Lane')}`,
    `\temail = ${identity('user.email', 'opl-test-lane@example.invalid')}`,
    '[init]',
    '\tdefaultBranch = main',
    '[commit]',
    '\tgpgsign = false',
    '[tag]',
    '\tgpgsign = false',
    '',
  ].join('\n');
}

function chunkFiles(files, size) {
  const chunks = [];
  for (let index = 0; index < files.length; index += size) {
    chunks.push(files.slice(index, index + size));
  }
  return chunks;
}

function spawnStep(commandName, args, context, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    timeout: stepTimeoutMs,
    detached: true,
    killSignal: 'SIGTERM',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
      TMPDIR: process.env.TMPDIR || toolTempDir + path.sep,
      NODE_COMPILE_CACHE: process.env.NODE_COMPILE_CACHE || path.join(pythonCacheRoot, 'node-compile-cache'),
      NPM_CONFIG_CACHE: process.env.NPM_CONFIG_CACHE || path.join(pythonCacheRoot, 'npm-cache'),
      npm_config_cache: process.env.npm_config_cache || process.env.NPM_CONFIG_CACHE || path.join(pythonCacheRoot, 'npm-cache'),
      UV_CACHE_DIR: process.env.UV_CACHE_DIR || path.join(pythonCacheRoot, 'uv-cache'),
      UV_PROJECT_ENVIRONMENT: process.env.UV_PROJECT_ENVIRONMENT || path.join(pythonCacheRoot, 'uv-project-venv'),
      PIP_CACHE_DIR: process.env.PIP_CACHE_DIR || path.join(pythonCacheRoot, 'pip-cache'),
      XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || path.join(pythonCacheRoot, 'xdg-cache'),
      PYTHONDONTWRITEBYTECODE: process.env.PYTHONDONTWRITEBYTECODE || '1',
      PYTHONPYCACHEPREFIX: process.env.PYTHONPYCACHEPREFIX || path.join(pythonCacheRoot, 'pycache'),
      PYTEST_ADDOPTS: [
        process.env.PYTEST_ADDOPTS || '',
        '-p no:cacheprovider',
        `-o cache_dir=${path.join(pythonCacheRoot, 'pytest-cache')}`,
      ].filter(Boolean).join(' '),
      ...(options.env ?? {}),
    },
  });
  if (isTimeoutResult(result)) {
    cleanupProcessGroup(result);
    reportStepTimeout(commandName, args, context);
    return { ...result, status: 1 };
  }
  if (result.status !== 0) {
    cleanupProcessGroup(result);
  }
  return result;
}

function nodeTestArgs(step) {
  const args = ['--conditions=opl-source'];
  if (step.stripTypes) args.push('--experimental-strip-types');
  args.push('--test', ...step.files);
  return args;
}

function assertCoverage() {
  failOnDuplicateLaneEntryFiles(duplicateLaneEntryFiles());

  const trackedTests = trackedTestFiles();
  const covered = coveredTestFiles();
  const uncovered = trackedTests.filter((file) => !covered.has(file));
  failOnUncoveredTests(uncovered);

  process.stdout.write(`All ${trackedTests.length} active test files are assigned to a test lane.\n`);
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

function duplicateLaneEntryFiles() {
  const duplicates = [];
  for (const [laneName, steps] of Object.entries(lanes)) {
    const occurrences = new Map();
    laneNodeTestFiles(steps).forEach((file, index) => {
      const normalized = normalizeRelativePath(file);
      if (!occurrences.has(normalized)) {
        occurrences.set(normalized, []);
      }
      occurrences.get(normalized).push(index + 1);
    });
    for (const [file, indexes] of occurrences.entries()) {
      if (indexes.length > 1) {
        duplicates.push({ laneName, file, indexes });
      }
    }
  }
  return duplicates;
}

function failOnDuplicateLaneEntryFiles(duplicates) {
  if (duplicates.length === 0) {
    return;
  }
  process.stderr.write('Test lane files are listed more than once in the same lane:\n');
  process.stderr.write(
    duplicates
      .map(({ laneName, file, indexes }) => `- ${laneName}: ${file} (${indexes.join(', ')})`)
      .join('\n'),
  );
  process.stderr.write('\n');
  process.exit(1);
}

function coveredTestFiles() {
  const covered = new Set();
  laneEntryFiles().forEach((file) => addImportClosure(file, covered));
  return covered;
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

function collectImportedTestFiles(relativePath, availableFiles = null, sourceReader = readTestSource) {
  const source = sourceReader(relativePath);
  const importPattern = /import\s+(?:[^'"]+\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g;
  const sourceDir = path.dirname(relativePath);
  return [...source.matchAll(importPattern)]
    .map((match) => resolveImport(sourceDir, match[1], availableFiles))
    .filter(isImportableTestFile);
}

function isImportableTestFile(file) {
  return Boolean(file && /\.(?:test\.)?(?:ts|mjs)$/.test(file));
}

function resolveImport(sourceDir, specifier, availableFiles = null) {
  const base = normalizeRelativePath(path.join(sourceDir, specifier));
  const fileExists = availableFiles
    ? (candidate) => availableFiles.has(candidate)
    : trackedFileExists;
  return importCandidates(base).find(fileExists) ?? null;
}

function importCandidates(base) {
  return path.extname(base) ? [base] : [base, `${base}.ts`, `${base}.mjs`];
}

function trackedFileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readTestSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
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
  process.stdout.write(`  run <${Object.keys(lanes).join('|')}>\n`);
  process.stdout.write('  assert-coverage\n');
  process.stdout.write('\nOptions:\n');
  process.stdout.write('  --continue   Run every batch after a failure and print the full failure summary\n');
  process.stdout.write('               (equivalent to OPL_TEST_LANE_CONTINUE=1)\n');
}

function normalizeRelativePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function npmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function parseStepTimeoutMs(rawValue) {
  if (!rawValue) {
    return defaultStepTimeoutMs;
  }
  if (!/^\d+$/.test(rawValue)) {
    fail(`OPL_TEST_LANE_STEP_TIMEOUT_MS must be a positive integer <= ${maxStepTimeoutMs}; got ${rawValue}`);
  }
  const parsed = Number(rawValue);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > maxStepTimeoutMs) {
    fail(`OPL_TEST_LANE_STEP_TIMEOUT_MS must be a positive integer <= ${maxStepTimeoutMs}; got ${rawValue}`);
  }
  return parsed;
}

function isTimeoutResult(result) {
  return result.error?.code === 'ETIMEDOUT';
}

function cleanupProcessGroup(result) {
  if (!result.pid) {
    return;
  }
  try {
    process.kill(-result.pid, 'SIGKILL');
  } catch {
    try {
      process.kill(result.pid, 'SIGKILL');
    } catch {
      // The child result is authoritative; cleanup is best-effort for its process group.
    }
  }
}

function reportStepTimeout(commandName, args, context) {
  process.stderr.write([
    'Test lane step timed out.',
    `lane=${context.laneName}`,
    `step=${formatStepContext(context)}`,
    `command=${formatSpawnCommand(commandName, args)}`,
    `timeout_ms=${stepTimeoutMs}`,
  ].join(' ') + '\n');
}

function formatStepContext(context) {
  const parts = [`${context.stepIndex + 1}:${context.stepKind}`];
  if (Number.isInteger(context.batchIndex)) {
    parts.push(`batch=${context.batchIndex + 1}/${context.batchCount}`);
  }
  if (context.batchFiles?.length) {
    parts.push(`files=${context.batchFiles.join(',')}`);
  }
  return parts.join(' ');
}

function formatSpawnCommand(commandName, args) {
  return [commandName, ...args].join(' ');
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

function main() {
  const commandHandler = commandHandlers[command];
  if (!commandHandler) {
    fail(`Unknown command: ${command}`);
  }
  commandHandler();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
