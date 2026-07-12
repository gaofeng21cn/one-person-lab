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
) as { scripts?: Record<string, string>; exports?: Record<string, string> };

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
  assert.match(testLanes, /CARGO_TARGET_DIR/);
  assert.match(testLanes, /opl-node-test-python-cache-/);
  assert.match(testLanes, /PYTHONDONTWRITEBYTECODE/);
  assert.match(testLanes, /PYTHONPYCACHEPREFIX/);
  assert.match(testLanes, /-p no:cacheprovider/);
  assert.match(testLanes, /cache_dir=\$\{path\.join\(pythonCacheRoot, 'pytest-cache'\)\}/);
});

test('native helper prebuild script handles platform executable names', () => {
  const prebuildScript = read('scripts/native-helper-prebuild.mjs');
  const cacheScript = read('scripts/native-helper-cache.mjs');
  const smokeScript = read('scripts/native-helper-family-smoke.mjs');
  const runtime = read('src/modules/runway/native-helper-runtime.ts');

  assert.match(prebuildScript, /targetTriple\.startsWith\('win32-'\)/);
  assert.match(prebuildScript, /--force-local/);
  assert.match(prebuildScript, /process\.env\.CARGO_TARGET_DIR/);
  assert.match(cacheScript, /process\.platform === 'win32'/);
  assert.match(cacheScript, /process\.env\.CARGO_TARGET_DIR/);
  assert.match(smokeScript, /process\.env\.CARGO_TARGET_DIR/);
  assert.match(runtime, /nativeHelperExecutableName/);
});

test('package.json exports the unified domain-agent descriptor read model', () => {
  assert.equal(
    packageJson.exports?.['./family-domain-agent-descriptor'],
    './dist/modules/atlas/family-domain-agent-descriptor.js',
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/modules/atlas/family-domain-agent-descriptor.ts')),
    true,
  );
});

test('package.json exports the OPL functional agent runtime harness', () => {
  assert.equal(
    packageJson.exports?.['./functional-agent-runtime-harness'],
    './dist/modules/runway/functional-agent-runtime-harness.js',
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/modules/runway/functional-agent-runtime-harness.ts')),
    true,
  );
});

test('package.json exposes native helper gate scripts and package dry-run check', () => {
  assert.equal(packageJson.scripts?.['native:doctor'], 'node ./scripts/native-helper-doctor.mjs');
  assert.equal(packageJson.scripts?.['native:prebuild'], 'node ./scripts/native-helper-prebuild.mjs install');
  assert.equal(packageJson.scripts?.['native:prebuild-pack'], 'node ./scripts/native-helper-prebuild.mjs pack');
  assert.equal(packageJson.scripts?.['native:prebuild-archive'], 'node ./scripts/native-helper-prebuild.mjs archive');
  assert.equal(packageJson.scripts?.['native:prebuild-check'], 'node ./scripts/native-helper-prebuild.mjs check');
  assert.equal(packageJson.scripts?.['native:pack-check'], 'node ./scripts/native-helper-pack-check.mjs');
  assert.equal(
    packageJson.scripts?.['native:test'],
    'RUSTC="$(rustup which --toolchain stable rustc)" RUSTDOC="$(rustup which --toolchain stable rustdoc)" "$(rustup which --toolchain stable cargo)" test --workspace',
  );
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/native-helper-prebuild.mjs')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/native-helper-pack-check.mjs')), true);
});

test('package.json exposes package channel maintenance scripts', () => {
  assert.equal(packageJson.scripts?.['packages:manifest'], 'node --experimental-strip-types ./scripts/package-archives.mjs');
  assert.equal(packageJson.scripts?.['packages:release-discipline'], 'node ./scripts/package-release-discipline.mjs');
  assert.equal(packageJson.scripts?.['packages:daily-check'], 'node ./scripts/package-channel-daily-check.mjs');
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
  const release = await import('../../src/modules/connect/opl-release.ts');
  const installCompanions = await import('../../src/modules/connect/install-companions.ts');
  const marker = await import('../../src/modules/connect/packaged-module-marker.ts');

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
