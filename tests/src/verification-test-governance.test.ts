import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const packageJson = parseJsonText(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string> };

const structuralGatePatterns = [
  /OPL_QUALITY_DETAILS_COMPARE_REF/,
  /compare_ref="\$\{OPL_QUALITY_DETAILS_COMPARE_REF:-origin\/main\}"/,
  /OPL_QUALITY_DETAILS_TIMEOUT_SECONDS/,
  /quality_details_timeout_seconds="\$\{OPL_QUALITY_DETAILS_TIMEOUT_SECONDS:-240\}"/,
  /run_quality_details_with_timeout\(\)/,
  /process\.exit\(124\)/,
  /sentrux gate \./,
  /Compare ref \$\{compare_ref\} is unavailable; using HEAD\^ for quality details\./,
  /Sentrux baseline regression reported structural drift/,
  /OPL quality details exceeded \$\{quality_details_timeout_seconds\}s in the local structure gate/,
  /default structure lane is advisory/,
  /OPL_STRUCTURAL_QUALITY_STRICT=1/,
  /sentrux check \./,
  /'quality',\s*'details',\s*'--root',\s*'\.'/,
  /'--compare-ref',\s*compareRef/,
];

const verifyWorkflowBuildAndJsLanePatterns = [
  /npm ci/,
  /npm run build/,
  /npm run typecheck/,
  /npm run test:fast/,
  /npm run test:read-model-gates/,
  /npm run test:regression/,
  /npm run test:integration/,
  /npm run test:fresh-install/,
  /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'/,
];

const verifyWorkflowNativeAndStructurePatterns = [
  /\.\/scripts\/verify\.sh native/,
  /\.\/scripts\/verify\.sh lint/,
  /\.\/scripts\/verify\.sh structure/,
  /rust-toolchain/,
  /\.\/scripts\/install-sentrux-ci\.sh/,
  /OPL_QUALITY_DETAILS_TIMEOUT_SECONDS: '240'/,
  /fetch-depth: 0/,
  /git fetch --no-tags origin \+main:refs\/remotes\/origin\/main/,
];

const sentruxAdvisoryWorkflowPatterns = [
  /fetch-depth: 0/,
  /git fetch --no-tags origin \+main:refs\/remotes\/origin\/main/,
  /timeout-minutes: 30/,
  /sentrux gate \./,
  /sentrux check \./,
  /\.\/scripts\/install-sentrux-ci\.sh/,
  /uses: \.\/\.github\/actions\/quality-details/,
  /timeout-minutes: 5/,
  /continue-on-error: true/,
  /compare-ref: origin\/main/,
  /json-limit: '50'/,
  /timeout-seconds: '120'/,
  /path: artifacts\/opl-quality-details\/quality-details\.json/,
  /actions\/upload-artifact@v7/,
  /name: opl-quality-details/,
];

const qualityDetailsActionPatterns = [
  /actions\/setup-node@v6/,
  /node-version: '24'/,
  /npm ci --prefix "\$GITHUB_ACTION_PATH\/\.\.\/\.\.\/\.\."/,
  /node "\$GITHUB_ACTION_PATH\/emit-quality-details\.mjs"/,
  /OPL_QUALITY_DETAILS_COMPARE_REF/,
  /OPL_QUALITY_DETAILS_TIMEOUT_SECONDS/,
  /timeout-seconds/,
];

const qualityDetailsActionScriptPatterns = [
  /const qualityRoot = fs\.realpathSync\(rootInput\)/,
  /execFileSync\('git', \['-C', qualityRoot, 'fetch', '--no-tags', 'origin'/,
  /execFileSync\('git', \['-C', qualityRoot, 'rev-parse', '--verify'/,
  /compareArgs\.push\('--compare-ref', compareRef\)/,
  /function runOplQualityDetails\(args, outputFile\)/,
  /child\.kill\('SIGTERM'\)/,
  /status: 124/,
  /function writeDiagnostic\(status, reason\)/,
  /diagnostic:/,
  /qualityDetailsArgs\('markdown', markdownLimit\)/,
  /qualityDetailsArgs\('json', jsonLimit\)/,
];

const nativeHelperPrebuildWorkflowPatterns = [
  /include-linux:/,
  /include-windows:/,
  /Plan native helper prebuilds/,
  /platforms='\["macos-latest"'/,
  /inputs\.include-linux/,
  /inputs\.include-windows/,
  /macos-latest/,
  /ubuntu-latest/,
  /windows-latest/,
  /fromJson\(needs\.plan-native-helper-prebuilds\.outputs\.matrix\)/,
  /cargo build --release --workspace/,
  /npm run native:prebuild-pack -- --source-dir target\/release/,
  /npm run native:prebuild-check -- --prebuild-root dist\/native-helper-prebuilds/,
  /npm run native:prebuild-archive -- --prebuild-root dist\/native-helper-prebuilds/,
  /dist\/native-helper-prebuilds\/archives\/\*\.tar\.gz/,
  /Validate native helper package retention policy/,
  /retention_policy_recorded/,
  /dry_run_first_explicit_execute_required/,
  /actions\/upload-artifact@v7/,
  /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'/,
];

const expectedTestScripts = {
  'test:smoke': 'node ./scripts/test-lanes.mjs run smoke',
  'test:fast': 'node ./scripts/test-lanes.mjs run fast',
  'test:meta': 'node ./scripts/test-lanes.mjs run meta',
  'test:read-model-gates': 'node ./scripts/test-lanes.mjs run read-model-gates',
  'test:regression': 'node ./scripts/test-lanes.mjs run regression',
  'test:integration': 'node ./scripts/test-lanes.mjs run integration',
  'test:artifact': 'node ./scripts/test-lanes.mjs run artifact',
  'test:fresh-install': 'node ./scripts/test-lanes.mjs run fresh-install',
  'test:native': './scripts/verify.sh native',
  'test:structure': './scripts/verify.sh structure',
  'test:full:plan': 'node ./scripts/test-lanes.mjs plan full',
  'test:full': 'node ./scripts/test-lanes.mjs run full',
  test: 'npm run test:smoke',
};

const fullLanePatterns = [
  /buildUniqueFullLanePlan/,
  /expandPureTestAggregator/,
  /duplicateTestImportClosure/,
  /nodeTestIsolationScore/,
  /import_closure_duplicate_count/,
];

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertFilePatterns(relativePath: string, patterns: RegExp[]) {
  const content = read(relativePath);
  for (const pattern of patterns) {
    assert.match(content, pattern);
  }
}

test('local structural quality gate emits compare-ref quality details on Sentrux failures', () => {
  assertFilePatterns('scripts/run-structural-quality-gate.sh', structuralGatePatterns);
});

test('GitHub verification workflow runs build and JavaScript test gates', () => {
  assertFilePatterns('.github/workflows/verify.yml', verifyWorkflowBuildAndJsLanePatterns);
});

test('GitHub verification workflow runs native and local structure gates', () => {
  assertFilePatterns('.github/workflows/verify.yml', verifyWorkflowNativeAndStructurePatterns);
});

test('canonical native verification keeps fixture smoke in the same isolated environment', () => {
  assertFilePatterns('scripts/verify.sh', [
    /npm run native:family-smoke -- --fixture --require-real-workspaces/,
  ]);
});

test('Sentrux advisory workflow publishes OPL quality details sidecar', () => {
  assertFilePatterns('.github/workflows/sentrux-advisory.yml', sentruxAdvisoryWorkflowPatterns);
  assertFilePatterns('.github/actions/quality-details/action.yml', qualityDetailsActionPatterns);
  assertFilePatterns('.github/actions/quality-details/emit-quality-details.mjs', qualityDetailsActionScriptPatterns);
});

test('GitHub native helper prebuild workflow packs release artifacts across supported platforms', () => {
  assertFilePatterns('.github/workflows/native-helper-prebuilds.yml', nativeHelperPrebuildWorkflowPatterns);
});

test('lint remains a JavaScript lint entrypoint while line-budget has explicit advisory and strict entrypoints', () => {
  assert.equal(packageJson.scripts?.lint, 'node ./scripts/lint.mjs');
  assert.equal(packageJson.scripts?.['line-budget'], 'node ./scripts/line-budget.mjs');
  assert.equal(packageJson.scripts?.['line-budget:strict'], 'node ./scripts/line-budget.mjs --strict');
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/line-budget.mjs')), true);
});

test('line-budget advisory is backed by a reviewed strict-ratchet contract', () => {
  const contractPath = path.join(repoRoot, 'contracts/opl-framework/source-structure-budget.json');
  const contract = parseJsonText(fs.readFileSync(contractPath, 'utf8')) as {
    contract_kind?: string;
    default_limit?: number;
    baseline_policy?: { mode?: string };
    reasonable_refactor_policy?: {
      mode?: string;
      preferred_split_boundaries?: string[];
      characterization_first?: string[];
      completion_policy?: string;
    };
    reviewed_baselines?: Array<Record<string, unknown>>;
  };
  const script = read('scripts/line-budget.mjs');

  assert.equal(contract.contract_kind, 'opl_source_structure_budget.v1');
  assert.equal(contract.default_limit, 1000);
  assert.equal(contract.baseline_policy?.mode, 'scheduled_advisory_with_explicit_strict_ratchet');
  assert.equal(contract.reasonable_refactor_policy?.mode, 'line_budget_as_signal_not_splitter');
  assert.ok(contract.reasonable_refactor_policy?.preferred_split_boundaries?.includes('test_scenario'));
  assert.ok(contract.reasonable_refactor_policy?.characterization_first?.includes('runtime_authority'));
  assert.equal(
    contract.reasonable_refactor_policy?.completion_policy,
    'p0_queue_processed_until_cleared_blocked_or_budget_then_reasonable_p1_batch',
  );
  assert.equal(Array.isArray(contract.reviewed_baselines), true);
  for (const entry of contract.reviewed_baselines ?? []) {
    assert.equal(typeof entry.path, 'string');
    assert.equal(typeof entry.limit, 'number');
    assert.equal(typeof entry.owner, 'string');
    assert.equal(typeof entry.reason, 'string');
    assert.equal(typeof entry.intended_boundary, 'string');
  }
  assert.match(script, /source-structure-budget\.json/);
  assert.match(script, /line budget advisory/);
  assert.match(script, /--strict/);
  assert.match(script, /OPL_LINE_BUDGET_STRICT/);
  assert.match(script, /ratchet baseline blocks growth/);
  assert.match(script, /reviewed baseline contract entry/);
});

test('package.json exposes repo hygiene check and cleanup entrypoints', () => {
  assert.equal(packageJson.scripts?.['repo:hygiene'], 'scripts/repo-hygiene.sh');
  assert.equal(packageJson.scripts?.['repo:hygiene:fix'], 'scripts/repo-hygiene.sh --fix');
});

test('package.json exposes a single test lane registry for active test ownership', () => {
  const registryPath = path.join(repoRoot, 'scripts/test-lanes.mjs');
  assert.equal(fs.existsSync(registryPath), true);

  for (const [scriptName, command] of Object.entries(expectedTestScripts)) {
    assert.equal(packageJson.scripts?.[scriptName], command);
  }

  const coverage = spawnSync(process.execPath, [registryPath, 'assert-coverage'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: '1',
    },
  });

  assert.equal(coverage.status, 0, coverage.stderr);
});

test('test:full stays in the single test lane registry', () => {
  assert.equal(packageJson.scripts?.['test:full'], 'node ./scripts/test-lanes.mjs run full');
  assertFilePatterns('scripts/test-lanes.mjs', fullLanePatterns);

  const registryPath = path.join(repoRoot, 'scripts/test-lanes.mjs');
  const plan = spawnSync(process.execPath, [registryPath, 'plan', 'full'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(plan.status, 0, plan.stderr);
  const payload = parseJsonText(plan.stdout) as {
    deduplicated_entry_count: number;
    import_closure_duplicate_count: number;
    node_test_groups: Array<{
      source_lane: string;
      batch_size: number | null;
      env: Record<string, string>;
      files: string[];
    }>;
  };
  assert.ok(payload.deduplicated_entry_count > 0);
  assert.equal(payload.import_closure_duplicate_count, 0);
  assert.equal(
    payload.node_test_groups.some((group) =>
      group.source_lane === 'read-model-gates'
        && group.batch_size === 1
        && group.env.OPL_CLI_TEST_TIMEOUT_MS === '90000'),
    true,
  );

  const groupFor = (file: string) => payload.node_test_groups.filter(
    (group) => group.files.includes(file),
  );
  assert.deepEqual(
    groupFor('tests/src/family-runtime-temporal-terminal-sync.test.ts').map((group) => ({
      source_lane: group.source_lane,
      batch_size: group.batch_size,
    })),
    [{ source_lane: 'read-model-gates', batch_size: 1 }],
  );
  assert.deepEqual(
    groupFor('tests/src/cli/cases/family-runtime-cases/provider-repair.ts').map((group) => ({
      source_lane: group.source_lane,
      batch_size: group.batch_size,
    })),
    [{ source_lane: 'read-model-gates', batch_size: 1 }],
  );
  assert.equal(
    groupFor('tests/src/cli/cases/app-state-cases/public-surface.ts').length,
    1,
  );
  assert.deepEqual(
    groupFor('tests/src/cli/cases/system-startup-maintenance-cases/developer-mode-checkouts.ts').map((group) => ({
      source_lane: group.source_lane,
      batch_size: group.batch_size,
    })),
    [{ source_lane: 'read-model-gates', batch_size: 1 }],
  );

  const listed = spawnSync(process.execPath, [registryPath, 'list'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(listed.status, 0, listed.stderr);
  const fullOutput = listed.stdout.slice(listed.stdout.indexOf('\nfull\n') + 1);
  for (const nestedLane of [
    'test:artifact',
    'test:fast',
    'test:fresh-install',
    'test:read-model-gates',
    'test:meta',
    'test:regression',
    'test:integration',
  ]) {
    assert.doesNotMatch(fullOutput, new RegExp(`npm run ${nestedLane}`));
  }
});
