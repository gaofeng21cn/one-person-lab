import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string> };

const structuralGatePatterns = [
  /OPL_QUALITY_DETAILS_COMPARE_REF/,
  /compare_ref="\$\{OPL_QUALITY_DETAILS_COMPARE_REF:-origin\/main\}"/,
  /sentrux gate \./,
  /Compare ref \$\{compare_ref\} is unavailable; using HEAD\^ for quality details\./,
  /Sentrux baseline regression reported structural drift/,
  /line budget and explicit Sentrux rules remain blocking/,
  /sentrux check \./,
  /quality details --root \./,
  /--compare-ref "\$resolved_compare_ref"/,
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
  /npm run native:family-smoke -- --fixture --require-real-workspaces/,
  /rust-toolchain/,
  /\.\/scripts\/install-sentrux-ci\.sh/,
  /fetch-depth: 0/,
  /git fetch --no-tags --prune origin main:refs\/remotes\/origin\/main/,
];

const sentruxAdvisoryWorkflowPatterns = [
  /fetch-depth: 0/,
  /git fetch --no-tags --prune origin main:refs\/remotes\/origin\/main/,
  /sentrux gate \./,
  /sentrux check \./,
  /\.\/scripts\/install-sentrux-ci\.sh/,
  /uses: \.\/\.github\/actions\/quality-details/,
  /compare-ref: origin\/main/,
  /json-limit: '50'/,
  /path: artifacts\/opl-quality-details\/quality-details\.json/,
  /actions\/upload-artifact@v7/,
  /name: opl-quality-details/,
];

const qualityDetailsActionPatterns = [
  /actions\/setup-node@v6/,
  /node-version: '24'/,
  /npm ci --prefix "\$GITHUB_ACTION_PATH\/\.\.\/\.\.\/\.\."/,
  /OPL_QUALITY_DETAILS_COMPARE_REF/,
  /quality_root="\$\(cd "\$OPL_QUALITY_DETAILS_ROOT" && pwd\)"/,
  /git -C "\$quality_root" fetch --no-tags --prune origin "\$\{compare_branch\}:refs\/remotes\/origin\/\$\{compare_branch\}"/,
  /git -C "\$quality_root" rev-parse --verify "\$OPL_QUALITY_DETAILS_COMPARE_REF\^\{commit\}"/,
  /--compare-ref "\$OPL_QUALITY_DETAILS_COMPARE_REF"/,
  /quality details --root "\$quality_root" --format markdown/,
  /quality details --root "\$quality_root" --format json/,
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
  /actions\/upload-artifact@v7/,
  /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'/,
];

const expectedTestScripts = {
  'test:smoke': 'node ./scripts/test-lanes.mjs run smoke',
  'test:fast': 'node ./scripts/test-lanes.mjs run fast',
  'test:fast:parallel': 'node ./scripts/test-lanes.mjs run fast-parallel',
  'test:meta': 'node ./scripts/test-lanes.mjs run meta',
  'test:read-model-gates': 'node ./scripts/test-lanes.mjs run read-model-gates',
  'test:regression': 'node ./scripts/test-lanes.mjs run regression',
  'test:integration': 'node ./scripts/test-lanes.mjs run integration',
  'test:artifact': 'node ./scripts/test-lanes.mjs run artifact',
  'test:fresh-install': 'node ./scripts/test-lanes.mjs run fresh-install',
  'test:native': './scripts/verify.sh native',
  'test:structure': './scripts/verify.sh structure',
  test: 'npm run test:fast',
};

const fullLanePatterns = [
  /Usage: \$0 full/,
  /run-with-repo-temp-env\.sh/,
  /OPL_REPO_TEMP_ENV_ACTIVE/,
  /parallel_lanes=\(/,
  /serial_lanes=\(/,
  /"test:fast:parallel"/,
  /"test:read-model-gates"/,
  /"test:meta"/,
  /"test:regression"/,
  /"test:integration"/,
  /"test:artifact"/,
  /"test:fresh-install"/,
  /"test:native"/,
  /"test:structure"/,
  /"typecheck"/,
  /"lint"/,
  /for lane in "\$\{parallel_lanes\[@\]\}"/,
  /for lane in "\$\{serial_lanes\[@\]\}"/,
  /npm run "\$\{lane\}"/,
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

test('Sentrux advisory workflow publishes OPL quality details sidecar', () => {
  assertFilePatterns('.github/workflows/sentrux-advisory.yml', sentruxAdvisoryWorkflowPatterns);
  assertFilePatterns('.github/actions/quality-details/action.yml', qualityDetailsActionPatterns);
});

test('GitHub native helper prebuild workflow packs release artifacts across supported platforms', () => {
  assertFilePatterns('.github/workflows/native-helper-prebuilds.yml', nativeHelperPrebuildWorkflowPatterns);
});

test('lint includes the tracked code line-budget guard', () => {
  assert.equal(packageJson.scripts?.lint, 'node ./scripts/lint.mjs && node ./scripts/line-budget.mjs');
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/line-budget.mjs')), true);
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

test('test:full delegates to the parallel test lane wrapper', () => {
  assert.equal(packageJson.scripts?.['test:full'], './scripts/run-parallel-test-lanes.sh full');
  assertFilePatterns('scripts/run-parallel-test-lanes.sh', fullLanePatterns);
});
