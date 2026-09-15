import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseJsonText } from '../../src/kernel/json-file.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const packageJson = parseJsonText(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
) as {
  scripts?: Record<string, string>;
  exports?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('new-machine bootstrap smoke uses Connect canonical skill sync surface', () => {
  const smokeScript = read('scripts/new-machine-codex-bootstrap-docker-smoke.mjs');

  assert.match(smokeScript, /opl connect sync-skills --domain mas --domain rca/);
  assert.doesNotMatch(smokeScript, /opl skill sync --domain mas --domain rca/);
});

test('new-machine bootstrap smoke uses Foundry Agent command surface fields', () => {
  const smokeScript = read('scripts/new-machine-codex-bootstrap-docker-smoke.mjs');

  assert.match(smokeScript, /foundry_agent_series\?\.canonical_command_surface/);
  assert.match(smokeScript, /Foundry Agent series command surface/);
  assert.doesNotMatch(smokeScript, /canonical_frontdoor/);
  assert.doesNotMatch(smokeScript, /Foundry Agent series frontdoor/);
});

test('new-machine bootstrap smoke proves an isolated unknown Package through its native carrier', () => {
  const smokeScript = read('scripts/new-machine-codex-bootstrap-docker-smoke.mjs');

  assert.match(smokeScript, /opl packages install future\.agent-lab/);
  assert.match(smokeScript, /opl app state --profile fast --json/);
  assert.match(smokeScript, /opl packages uninstall future\.agent-lab/);
  assert.match(smokeScript, /opl_unknown_package_isolation/);
  assert.match(smokeScript, /plugin list --available --json/);
  assert.match(smokeScript, /native_carrier_is_lifecycle_authority/);
  for (const retiredSurface of [
    '--manifest-url',
    '--trust-tier',
    'physical_surface',
    'future-agent-private-state-snapshot',
    'agent-package-locks.json',
    'agent-package-lifecycle-ledger.json',
  ]) {
    assert.doesNotMatch(smokeScript, new RegExp(retiredSurface.replaceAll('.', '\\.')));
  }
});

test('OPL Python helpers are part of Framework and have no package manifest', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, 'python', 'opl_framework', '__init__.py')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'python', 'pyproject.toml')), false);
  assert.equal(fs.existsSync(path.join(repoRoot, 'python', 'uv.lock')), false);
});

test('node test lanes propagate Python cache isolation to spawned tests', () => {
  const testLanes = read('scripts/test-lanes.mjs');

  assert.match(testLanes, /OPL_REPO_TEMP_ROOT/);
  assert.match(testLanes, /NODE_COMPILE_CACHE/);
  assert.match(testLanes, /NPM_CONFIG_CACHE/);
  assert.match(testLanes, /UV_PROJECT_ENVIRONMENT/);
  assert.match(testLanes, /opl-node-test-python-cache-/);
  assert.match(testLanes, /PYTHONDONTWRITEBYTECODE/);
  assert.match(testLanes, /PYTHONPYCACHEPREFIX/);
  assert.match(testLanes, /-p no:cacheprovider/);
  assert.match(testLanes, /cache_dir=\$\{path\.join\(pythonCacheRoot, 'pytest-cache'\)\}/);
});

test('carrier-only installs every dependency required by the prepare build', () => {
  assert.equal(packageJson.dependencies?.['@types/semver'], '7.7.1');
  assert.equal(packageJson.devDependencies?.['@types/semver'], undefined);

  const packageLock = parseJsonText(read('package-lock.json')) as {
    packages?: Record<string, {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      dev?: boolean;
    }>;
  };
  assert.equal(packageLock.packages?.['']?.dependencies?.['@types/semver'], '7.7.1');
  assert.equal(packageLock.packages?.['']?.devDependencies?.['@types/semver'], undefined);
  assert.equal(packageLock.packages?.['node_modules/@types/semver']?.dev, undefined);
});

test('native helper uses the Framework Node standard-library entrypoint', () => {
  const helperScript = read('scripts/native-helper.mjs');
  const smokeScript = read('scripts/native-helper-family-smoke.mjs');
  const runtime = read('src/adapters/execution/native-helper-runtime.ts');

  assert.match(helperScript, /node-stdlib\.v1/);
  assert.match(helperScript, /fs\.readFileSync\(0, 'utf8'\)[\s\S]*JSON\.parse\(input\)/);
  assert.match(smokeScript, /source: 'framework_node'/);
  assert.match(runtime, /nativeHelperExecutableName/);
  assert.match(runtime, /scripts\/native-helper\.mjs/);
  assert.doesNotMatch(runtime, /crate_version|nativeHelperCacheDir|target\/debug/);
});

test('package.json exports the unified domain-agent descriptor read model', () => {
  assert.equal(
    packageJson.exports?.['./family-domain-agent-descriptor'],
    './dist/read-models/catalog/family-domain-agent-descriptor.js',
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/read-models/catalog/family-domain-agent-descriptor.ts')),
    true,
  );
});

test('package.json does not export the retired transition harness control plane', () => {
  assert.equal(
    packageJson.exports?.['./functional-agent-runtime-harness'],
    undefined,
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/adapters/execution/functional-agent-runtime-harness.ts')),
    false,
  );
  assert.equal(packageJson.exports?.['./family-transition-runner'], undefined);
});

test('package.json exposes the native helper doctor and family smoke gates', () => {
  assert.equal(packageJson.scripts?.['native:doctor'], 'node ./scripts/native-helper-doctor.mjs');
  assert.equal(packageJson.scripts?.['native:repair'], 'node ./scripts/native-helper-doctor.mjs');
  assert.equal(packageJson.scripts?.['native:family-smoke'], 'node ./scripts/native-helper-family-smoke.mjs');
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/native-helper.mjs')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/native-helper-family-smoke.mjs')), true);
  for (const retiredScript of [
    'native-helper-cache.mjs',
    'native-helper-pack-check.mjs',
    'native-helper-prebuild.mjs',
    'native-helper-repair.mjs',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, 'scripts', retiredScript)), false, retiredScript);
  }
});

test('package.json exposes package channel maintenance scripts', () => {
  assert.equal(packageJson.scripts?.['packages:manifest'], undefined);
  assert.equal(packageJson.scripts?.['packages:payload'], 'node ./scripts/first-party-package-payload.mjs');
  assert.equal(packageJson.scripts?.['packages:release-discipline'], undefined);
  assert.equal(packageJson.scripts?.['framework:archive'], 'node scripts/framework-archive.mjs');
  assert.equal(packageJson.scripts?.['packages:cleanup-ghcr'], 'node --experimental-strip-types ./scripts/cleanup-ghcr-package-versions.mjs');
});

test('package.json exposes the fresh-install smoke lane', () => {
  assert.equal(
    packageJson.scripts?.['fresh-install:smoke'],
    'node ./scripts/fresh-install-smoke.mjs',
  );
  assert.equal(
    packageJson.scripts?.['test:fresh-install'],
    'node ./scripts/test-lanes.mjs run fresh-install',
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts/fresh-install-smoke.mjs')),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'contracts/opl-framework/fresh-install-test-matrix.json')),
    true,
  );
});

test('framework repository does not own App release or Full DMG publishing entrypoints', () => {
  for (const scriptName of ['gui:release', 'packages:full-internal', 'packages:full-release']) {
    assert.equal(
      packageJson.scripts?.[scriptName],
      undefined,
      `Framework package.json must not expose App release script ${scriptName}`,
    );
  }

  for (const relativePath of [
    '.github/workflows/standard-macos-release.yml',
    '.github/workflows/full-first-install-release.yml',
    'scripts/publish-gui-release.mjs',
    'scripts/build-full-internal-package.mjs',
    'scripts/full-internal-package-runtime-wrappers.mjs',
    'src/full-internal-package.ts',
    'tests/src/full-internal-package.test.ts',
  ]) {
    assert.equal(
      fs.existsSync(path.join(repoRoot, relativePath)),
      false,
      `Framework repo must not keep App release ownership surface: ${relativePath}`,
    );
  }
});

test('framework release discovery consumes App repo assets without publishing them', async () => {
  const release = await import('../../src/adapters/integration/opl-release.ts');
  const installCompanions = await import('../../src/adapters/integration/install-companions.ts');
  const marker = await import('../../src/adapters/integration/packaged-module-marker.ts');

  assert.equal(release.getOplReleaseRepo(), 'gaofeng21cn/one-person-lab-app');
  assert.equal(
    release.buildOplGuiArtifactName({ platform: 'macos', arch: 'arm64', ext: 'dmg', version: '26.5.15' }),
    'One-Person-Lab-26.5.15-mac-arm64.dmg',
  );
  assert.equal(marker.PACKAGED_MODULE_MARKER_FILE, 'opl-runtime-module.json');

  const gui = installCompanions.buildOplGuiShellSurface(repoRoot);
  assert.equal(gui.owner, 'one-person-lab-app');
  assert.equal(gui.release_repo, 'gaofeng21cn/one-person-lab-app');
  assert.equal(
    gui.prebuilt_artifacts[0].distributable_patterns.includes('One-Person-Lab-26.4.27-mac-arm64.dmg'),
    false,
  );
  assert.equal(
    gui.prebuilt_artifacts[0].distributable_patterns.includes('One-Person-Lab-26.6.27-mac-arm64.dmg'),
    true,
  );
  assert.equal(
    gui.notes.some((note) => /uploaded to the one-person-lab GitHub Release/.test(note)),
    false,
  );
});

test('package.json exposes the native MAS/MAG family indexing smoke command', () => {
  assert.equal(packageJson.scripts?.['native:family-smoke'], 'node ./scripts/native-helper-family-smoke.mjs');
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts/native-helper-family-smoke.mjs')),
    true,
  );
});
