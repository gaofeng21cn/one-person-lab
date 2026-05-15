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
) as { scripts?: Record<string, string>; exports?: Record<string, string> };

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function listJsonFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(repoRoot, relativeDir);
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      return listJsonFiles(relativePath);
    }
    return entry.isFile() && entry.name.endsWith('.json') ? [relativePath] : [];
  });
}

test('repo hygiene blocks generated tmp artifacts from git', () => {
  const gitignore = read('.gitignore');
  assert.match(gitignore, /^tmp\/$/m);

  const result = spawnSync('git', ['ls-files', 'tmp'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '');
});

test('tracked files do not contain Google API key literals', () => {
  const googleApiKeyPattern = ['AI', 'za', '[0-9A-Za-z_-]{35}'].join('');
  const result = spawnSync(
    'git',
    ['grep', '-l', '-I', '-E', googleApiKeyPattern, '--', '.'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.notEqual(result.status, null, result.stderr);
  assert.equal(
    result.status,
    1,
    result.status === 0
      ? `tracked Google API key-like literal found in:\n${result.stdout}`
      : result.stderr,
  );
});

test('repo-tracked verification command surfaces reference valid npm scripts and local test files', () => {
  const files = [
    'contracts/opl-framework/runtime-manager-contract.json',
    'contracts/opl-framework/family-runtime-attempt-contract.json',
    'contracts/opl-framework/family-runtime-online-substrate-contract.json',
    'contracts/opl-framework/fresh-install-test-matrix.json',
  ];

  const npmRunPattern = /npm run ([a-z0-9:-]+)/gi;
  const localTestPattern = /(tests\/[^\s`'"]+\.(?:ts|mjs))/g;

  for (const relativePath of files) {
    const content = read(relativePath);

    for (const match of content.matchAll(npmRunPattern)) {
      const scriptName = match[1];
      assert.ok(
        packageJson.scripts?.[scriptName],
        `${relativePath} references missing npm script: ${scriptName}`,
      );
    }

    for (const match of content.matchAll(localTestPattern)) {
      const filePath = match[1];
      assert.ok(
        fs.existsSync(path.join(repoRoot, filePath)),
        `${relativePath} references missing test file: ${filePath}`,
      );
    }
  }
});

test('machine-readable framework contracts do not pin human docs paths', () => {
  const pinnedHumanDocPathPattern =
    /\b(?:README(?:\.zh-CN)?\.md|AGENTS\.md|docs\/[A-Za-z0-9_./-]+\.md(?:#[A-Za-z0-9_-]+)?|contracts\/[A-Za-z0-9_./-]+\.md)\b/g;

  for (const relativePath of listJsonFiles('contracts/opl-framework')) {
    const content = read(relativePath);
    const pinnedPaths = content.match(pinnedHumanDocPathPattern) ?? [];

    assert.deepEqual(
      pinnedPaths,
      [],
      `${relativePath} must use machine contract refs or human_doc:* semantic ids instead of pinning prose document paths`,
    );
  }
});

test('scripts/verify.sh provides the canonical verification wrapper', () => {
  const verifyScript = read('scripts/verify.sh');

  assert.match(verifyScript, /node scripts\/line-budget\.mjs/);
  assert.equal(
    (verifyScript.match(/node scripts\/line-budget\.mjs/g) ?? []).length,
    1,
  );
  assert.match(verifyScript, /npm run test:smoke/);
  assert.match(verifyScript, /npm run test:fast/);
  assert.match(verifyScript, /npm run test:regression/);
  assert.match(verifyScript, /npm run test:integration/);
  assert.match(verifyScript, /npm run family:shared-release -- check/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_family_shared_release\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_dependency_bootstrap\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_consumer_bootstrap\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_consumer_launcher\.py/);
  assert.match(verifyScript, /npm run test:fresh-install/);
  assert.match(verifyScript, /npm run test:artifact/);
  assert.match(verifyScript, /npm run test:full/);
  assert.match(verifyScript, /npm run native:doctor/);
  assert.match(verifyScript, /npm run native:prebuild-check/);
  assert.match(verifyScript, /npm run native:pack-check/);
  assert.match(verifyScript, /npm run native:test/);
  assert.match(verifyScript, /npm run native:build/);
  assert.match(verifyScript, /npm run native:cache/);
  assert.match(verifyScript, /npm run native:family-smoke/);
  assert.match(verifyScript, /\.\/scripts\/run-structural-quality-gate\.sh/);
  assert.match(verifyScript, /smoke\|fast\|regression\|integration\|structure\|family\|meta\|fresh-install\|artifact\|native\|full\|lint\|line-budget\|typecheck/);
});

test('native helper prebuild script handles platform executable names', () => {
  const prebuildScript = read('scripts/native-helper-prebuild.mjs');
  const cacheScript = read('scripts/native-helper-cache.mjs');
  const runtime = read('src/native-helper-runtime.ts');

  assert.match(prebuildScript, /targetTriple\.startsWith\('win32-'\)/);
  assert.match(prebuildScript, /--force-local/);
  assert.match(cacheScript, /process\.platform === 'win32'/);
  assert.match(runtime, /nativeHelperExecutableName/);
});

test('package.json exposes the canonical family shared release maintenance command', () => {
  assert.equal(packageJson.scripts?.['family:shared-release'], 'node ./scripts/family-shared-release.mjs');
  assert.equal(packageJson.exports?.['./family-shared-release'], './dist/family-shared-release.js');
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts/family-shared-release.mjs')),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/family-shared-release.ts')),
    true,
  );
});

test('package.json exports the unified domain-agent descriptor read model', () => {
  assert.equal(
    packageJson.exports?.['./family-domain-agent-descriptor'],
    './dist/family-domain-agent-descriptor.js',
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'src/family-domain-agent-descriptor.ts')),
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
    'RUSTC="$(rustup which --toolchain stable rustc)" "$(rustup which --toolchain stable cargo)" test --workspace',
  );
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/native-helper-prebuild.mjs')), true);
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/native-helper-pack-check.mjs')), true);
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
  const release = await import('../../src/opl-release.ts');
  const installCompanions = await import('../../src/install-companions.ts');
  const marker = await import('../../src/packaged-module-marker.ts');

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
