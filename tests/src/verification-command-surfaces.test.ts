import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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

test('repo-tracked verification command surfaces reference valid npm scripts and local test files', () => {
  const files = [
    'AGENTS.md',
    'docs/references/family-shared-release-maintenance.md',
    'contracts/opl-gateway/phase-1-exit-activation-package.json',
    'contracts/opl-gateway/minimal-admitted-domain-federation-activation-package.json',
    'contracts/opl-gateway/phase-2-central-reference-sync-board.json',
    'contracts/opl-gateway/phase-2-admitted-domain-delta-intake-refresh.json',
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

test('scripts/verify.sh provides the canonical verification wrapper', () => {
  const verifyScript = read('scripts/verify.sh');

  assert.match(verifyScript, /node scripts\/line-budget\.mjs/);
  assert.equal(
    (verifyScript.match(/node scripts\/line-budget\.mjs/g) ?? []).length,
    1,
  );
  assert.match(verifyScript, /npm test/);
  assert.match(verifyScript, /npm run family:shared-release -- check/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_family_shared_release\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_dependency_bootstrap\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_consumer_bootstrap\.py/);
  assert.match(verifyScript, /python\/opl-harness-shared\/tests\/test_editable_consumer_launcher\.py/);
  assert.match(verifyScript, /npm run test:meta/);
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
  assert.match(verifyScript, /smoke\|fast\|family\|meta\|fresh-install\|artifact\|native\|full\|lint\|line-budget\|typecheck/);
});

test('GitHub verification workflow runs the native helper production gates', () => {
  const workflow = read('.github/workflows/verify.yml');

  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npm run test:meta/);
  assert.match(workflow, /\.\/scripts\/verify\.sh native/);
  assert.match(workflow, /\.\/scripts\/verify\.sh lint/);
  assert.match(workflow, /npm run native:family-smoke -- --fixture --require-real-workspaces/);
  assert.match(workflow, /rust-toolchain/);
  assert.match(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'/);
});

test('GitHub native helper prebuild workflow packs release artifacts across supported platforms', () => {
  const workflow = read('.github/workflows/native-helper-prebuilds.yml');

  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /cargo build --release --workspace/);
  assert.match(workflow, /npm run native:prebuild-pack -- --source-dir target\/release/);
  assert.match(workflow, /npm run native:prebuild-check -- --prebuild-root dist\/native-helper-prebuilds/);
  assert.match(workflow, /npm run native:prebuild-archive -- --prebuild-root dist\/native-helper-prebuilds/);
  assert.match(workflow, /dist\/native-helper-prebuilds\/archives\/\*\.tar\.gz/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'/);
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

test('lint includes the tracked code line-budget guard', () => {
  assert.equal(packageJson.scripts?.lint, 'node ./scripts/lint.mjs && node ./scripts/line-budget.mjs');
  assert.equal(fs.existsSync(path.join(repoRoot, 'scripts/line-budget.mjs')), true);
});

test('test:full delegates to the parallel test lane wrapper', () => {
  const script = read('scripts/run-parallel-test-lanes.sh');

  assert.equal(packageJson.scripts?.['test:full'], './scripts/run-parallel-test-lanes.sh full');
  assert.match(script, /Usage: \$0 full/);
  assert.match(script, /"test:fast"/);
  assert.match(script, /"test:meta"/);
  assert.match(script, /"test:artifact"/);
  assert.match(script, /npm run "\$\{lane\}"/);
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

test('package.json exposes native helper gate scripts and package dry-run check', () => {
  assert.equal(packageJson.scripts?.['native:doctor'], 'node ./scripts/native-helper-doctor.mjs');
  assert.equal(packageJson.scripts?.['native:prebuild'], 'node ./scripts/native-helper-prebuild.mjs install');
  assert.equal(packageJson.scripts?.['native:prebuild-pack'], 'node ./scripts/native-helper-prebuild.mjs pack');
  assert.equal(packageJson.scripts?.['native:prebuild-archive'], 'node ./scripts/native-helper-prebuild.mjs archive');
  assert.equal(packageJson.scripts?.['native:prebuild-check'], 'node ./scripts/native-helper-prebuild.mjs check');
  assert.equal(packageJson.scripts?.['native:pack-check'], 'node ./scripts/native-helper-pack-check.mjs');
  assert.equal(packageJson.scripts?.['native:test'], 'cargo test --workspace');
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
    'NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/fresh-install-smoke.test.ts',
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'scripts/fresh-install-smoke.mjs')),
    true,
  );
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'contracts/opl-gateway/fresh-install-test-matrix.json')),
    true,
  );
});

test('GUI release publisher defaults to current arm64 artifacts only', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-release-test-'));
  const shellRoot = path.join(tmpRoot, 'opl-aion-shell');
  const outDir = path.join(shellRoot, 'out');
  const fakeBin = path.join(tmpRoot, 'bin');
  const version = '26.5.2';

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, 'gh'), '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });

  for (const name of [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.dmg.blockmap`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-arm64.zip.blockmap`,
    `One-Person-Lab-${version}-mac-universal.dmg`,
    `One-Person-Lab-${version}-mac-universal.dmg.blockmap`,
    `One-Person-Lab-${version}-mac-universal.zip`,
    `One-Person-Lab-${version}-mac-universal.zip.blockmap`,
    `One-Person-Lab-${version}-mac-x64.dmg`,
    `One-Person-Lab-${version}-mac-x64.dmg.blockmap`,
    `One-Person-Lab-${version}-mac-x64.zip`,
    `One-Person-Lab-${version}-mac-x64.zip.blockmap`,
  ]) {
    fs.writeFileSync(path.join(outDir, name), 'artifact');
  }

  const metadata = [
    `version: ${version}`,
    'files:',
    `  - url: One-Person-Lab-${version}-mac-arm64.zip`,
    '    sha512: test',
    '    size: 1',
    `  - url: One-Person-Lab-${version}-mac-arm64.dmg`,
    '    sha512: test',
    '    size: 1',
    `path: One-Person-Lab-${version}-mac-arm64.zip`,
    'sha512: test',
    "releaseDate: '2026-05-01T00:00:00.000Z'",
    '',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'latest-mac.yml'), metadata);
  fs.writeFileSync(
    path.join(outDir, 'latest-arm64-mac.yml'),
    [
      'version: 26.4.27',
      'files:',
      '  - url: One.Person.Lab-26.4.27-mac-arm64.zip',
      'path: One.Person.Lab-26.4.27-mac-arm64.zip',
      '',
    ].join('\n'),
  );

  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/publish-gui-release.mjs'),
      '--no-build',
      '--dry-run',
      '--shell-root',
      shellRoot,
      '--version',
      version,
      '--repo',
      'example/one-person-lab',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as { artifacts: string[] };
  assert.ok(
    payload.artifacts.some((artifact) => artifact.endsWith(`One-Person-Lab-${version}-mac-arm64.dmg`)),
  );
  assert.ok(
    payload.artifacts.some((artifact) => artifact.endsWith(`One-Person-Lab-${version}-mac-arm64.zip`)),
  );
  assert.ok(
    payload.artifacts.some((artifact) => artifact.endsWith('latest-mac.yml')),
  );
  assert.ok(
    payload.artifacts.some((artifact) => artifact.endsWith('latest-arm64-mac.yml')),
  );
  assert.equal(
    payload.artifacts.some((artifact) => artifact.includes('-mac-universal.')),
    false,
  );
  assert.equal(
    payload.artifacts.some((artifact) => artifact.includes('-mac-x64.')),
    false,
  );
  assert.equal(fs.readFileSync(path.join(outDir, 'latest-mac.yml'), 'utf8'), metadata);
});

test('GUI release publisher can explicitly target universal artifacts', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-release-universal-test-'));
  const shellRoot = path.join(tmpRoot, 'opl-aion-shell');
  const outDir = path.join(shellRoot, 'out');
  const fakeBin = path.join(tmpRoot, 'bin');
  const version = '26.5.1';

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, 'gh'), '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });

  for (const name of [
    `One-Person-Lab-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-mac-arm64.zip`,
    `One-Person-Lab-${version}-mac-universal.dmg`,
    `One-Person-Lab-${version}-mac-universal.dmg.blockmap`,
    `One-Person-Lab-${version}-mac-universal.zip`,
    `One-Person-Lab-${version}-mac-universal.zip.blockmap`,
  ]) {
    fs.writeFileSync(path.join(outDir, name), 'artifact');
  }

  fs.writeFileSync(
    path.join(outDir, 'latest-mac.yml'),
    [
      `version: ${version}`,
      'files:',
      `  - url: One-Person-Lab-${version}-mac-universal.zip`,
      `path: One-Person-Lab-${version}-mac-universal.zip`,
      '',
    ].join('\n'),
  );

  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/publish-gui-release.mjs'),
      '--no-build',
      '--dry-run',
      '--shell-root',
      shellRoot,
      '--version',
      version,
      '--repo',
      'example/one-person-lab',
      '--mac-arch',
      'universal',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as { artifacts: string[]; mac_arch: string };
  assert.equal(payload.mac_arch, 'universal');
  assert.ok(
    payload.artifacts.some((artifact) => artifact.endsWith(`One-Person-Lab-${version}-mac-universal.dmg`)),
  );
  assert.equal(
    payload.artifacts.some((artifact) => artifact.includes('-mac-arm64.')),
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
