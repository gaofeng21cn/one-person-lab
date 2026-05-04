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
  assert.match(verifyScript, /\.\/scripts\/run-structural-quality-gate\.sh/);
  assert.match(verifyScript, /smoke\|fast\|structure\|family\|meta\|fresh-install\|artifact\|native\|full\|lint\|line-budget\|typecheck/);
});

test('local structural quality gate emits compare-ref quality details on Sentrux failures', () => {
  const script = read('scripts/run-structural-quality-gate.sh');

  assert.match(script, /OPL_QUALITY_DETAILS_COMPARE_REF/);
  assert.match(script, /compare_ref="\$\{OPL_QUALITY_DETAILS_COMPARE_REF:-origin\/main\}"/);
  assert.match(script, /sentrux gate \./);
  assert.match(script, /sentrux check \./);
  assert.match(script, /quality details --root \./);
  assert.match(script, /--compare-ref "\$compare_ref"/);
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

test('Sentrux advisory workflow publishes OPL quality details sidecar', () => {
  const workflow = read('.github/workflows/sentrux-advisory.yml');
  const action = read('.github/actions/quality-details/action.yml');

  assert.match(workflow, /fetch-depth: 0/);
  assert.match(workflow, /git fetch --no-tags --prune origin main:refs\/remotes\/origin\/main/);
  assert.match(workflow, /sentrux gate \./);
  assert.match(workflow, /sentrux check \./);
  assert.match(workflow, /uses: \.\/\.github\/actions\/quality-details/);
  assert.match(workflow, /compare-ref: origin\/main/);
  assert.match(workflow, /json-limit: '50'/);
  assert.match(workflow, /path: artifacts\/opl-quality-details\/quality-details\.json/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /name: opl-quality-details/);
  assert.match(action, /actions\/setup-node@v4/);
  assert.match(action, /node-version: '24'/);
  assert.match(action, /npm ci --prefix "\$GITHUB_ACTION_PATH\/\.\.\/\.\.\/\.\."/);
  assert.match(action, /OPL_QUALITY_DETAILS_COMPARE_REF/);
  assert.match(action, /--compare-ref "\$OPL_QUALITY_DETAILS_COMPARE_REF"/);
  assert.match(action, /quality details --root "\$OPL_QUALITY_DETAILS_ROOT" --format markdown/);
  assert.match(action, /quality details --root "\$OPL_QUALITY_DETAILS_ROOT" --format json/);
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

test('Full first-install release workflow builds without signing secrets and keeps updater metadata standard-only', () => {
  const workflow = read('.github/workflows/full-first-install-release.yml');

  assert.equal(
    packageJson.scripts?.['packages:full-release'],
    'node --experimental-strip-types ./scripts/build-full-internal-package.mjs --out-dir dist/opl-full-release',
  );
  assert.match(workflow, /BUILD_CERTIFICATE_BASE64/);
  assert.match(workflow, /same unsigned packaging mode as the current standard GitHub release/);
  assert.match(workflow, /OPL_MAC_STRICT_SIGNING_CHECKS=false/);
  assert.match(workflow, /ulimit -n 65536/);
  assert.match(workflow, /force_rebuild_runtime_cache/);
  assert.match(workflow, /actions\/cache\/restore@v4/);
  assert.match(workflow, /actions\/cache\/save@v4/);
  assert.match(workflow, /Reset Full runtime layer cache when forced/);
  assert.match(workflow, /Checkout MAG/);
  assert.match(workflow, /Checkout RCA/);
  assert.match(workflow, /Checkout OfficeCLI/);
  assert.match(workflow, /Checkout UI UX Pro Max skill/);
  assert.match(workflow, /gaofeng21cn\/med-autogrant/);
  assert.match(workflow, /gaofeng21cn\/redcube-ai/);
  assert.match(workflow, /iOfficeAI\/OfficeCLI/);
  assert.match(workflow, /nextlevelbuilder\/ui-ux-pro-max-skill/);
  assert.match(workflow, /uv sync --project med-autogrant --no-dev/);
  assert.match(workflow, /npm ci --prefix redcube-ai/);
  assert.match(workflow, /npm run --prefix redcube-ai build/);
  assert.match(workflow, /echo "\$HOME\/\.local\/bin" >> "\$GITHUB_PATH"/);
  assert.match(workflow, /officecli --version/);
  assert.match(workflow, /OPL_FULL_MAG_ROOT/);
  assert.match(workflow, /OPL_FULL_RCA_ROOT/);
  assert.match(workflow, /OPL_FULL_OFFICECLI_ROOT/);
  assert.match(workflow, /OPL_FULL_UI_UX_PRO_MAX_ROOT/);
  assert.match(workflow, /npm --silent run packages:full-release/);
  assert.match(workflow, /--print-runtime-cache-keys/);
  assert.match(workflow, /--runtime-cache-dir/);
  assert.match(workflow, /--runtime-cache-mode readwrite/);
  assert.match(workflow, /appleIdPassword/);
  assert.match(workflow, /codesign --verify --deep --strict/);
  assert.match(workflow, /spctl --assess --type execute/);
  assert.match(workflow, /hdiutil verify/);
  assert.match(workflow, /shasum -a 256 -c SHA256SUMS\.txt/);
  assert.match(workflow, /gh release view "v\$\{OPL_RELEASE_VERSION\}"/);
  assert.match(workflow, /gh release download "v\$\{OPL_RELEASE_VERSION\}"/);
  assert.match(workflow, /--full-package-only/);
  assert.match(workflow, /--include-full-package/);
  assert.doesNotMatch(workflow, /Build standard macOS arm64 assets/);
  assert.doesNotMatch(workflow, /cp out\/One-Person-Lab-\$\{OPL_RELEASE_VERSION\}-mac-arm64\.\*/);
});

test('standard macOS release workflow publishes only updater-owned standard assets', () => {
  const workflow = read('.github/workflows/standard-macos-release.yml');

  assert.match(workflow, /OPL Standard macOS Release/);
  assert.match(workflow, /Build standard macOS arm64 assets/);
  assert.match(workflow, /npm run build-mac:arm64/);
  assert.match(workflow, /grep -R "One-Person-Lab-Full" release\/latest\*\.yml/);
  assert.match(workflow, /npm run gui:release/);
  assert.doesNotMatch(workflow, /Checkout Hermes-Agent/);
  assert.doesNotMatch(workflow, /Checkout MAS/);
  assert.doesNotMatch(workflow, /Checkout MDS/);
  assert.doesNotMatch(workflow, /Checkout MAG/);
  assert.doesNotMatch(workflow, /Checkout RCA/);
  assert.doesNotMatch(workflow, /med-autogrant/);
  assert.doesNotMatch(workflow, /redcube-ai/);
  assert.doesNotMatch(workflow, /uv sync/);
  assert.doesNotMatch(workflow, /packages:full-release/);
  assert.doesNotMatch(workflow, /--include-full-package/);
  assert.doesNotMatch(workflow, /--full-package-only/);
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
    `One-Person-Lab-Full-${version}-mac-arm64.dmg`,
    `One-Person-Lab-${version}-a-mac-arm64.dmg`,
    `One-Person-Lab-${version}-a-mac-arm64.dmg.blockmap`,
    `One-Person-Lab-${version}-a-mac-arm64.zip`,
    `One-Person-Lab-${version}-a-mac-arm64.zip.blockmap`,
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
  assert.equal(
    payload.artifacts.some((artifact) => artifact.includes(`${version}-a-mac-arm64`)),
    false,
  );
  assert.equal(
    payload.artifacts.some((artifact) => artifact.includes('One-Person-Lab-Full')),
    false,
  );
  assert.equal(fs.readFileSync(path.join(outDir, 'latest-mac.yml'), 'utf8'), metadata);
});

test('GUI release publisher uploads Full first-install assets only when explicitly requested', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-release-full-test-'));
  const shellRoot = path.join(tmpRoot, 'opl-aion-shell');
  const outDir = path.join(shellRoot, 'out');
  const fullDir = path.join(tmpRoot, 'full');
  const fakeBin = path.join(tmpRoot, 'bin');
  const version = '26.5.2';

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(fullDir, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, 'gh'), '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });

  fs.writeFileSync(path.join(outDir, `One-Person-Lab-${version}-mac-arm64.dmg`), 'standard dmg');
  fs.writeFileSync(path.join(outDir, `One-Person-Lab-${version}-mac-arm64.zip`), 'standard zip');
  fs.writeFileSync(
    path.join(outDir, 'latest-mac.yml'),
    [
      `version: ${version}`,
      'files:',
      `  - url: One-Person-Lab-${version}-mac-arm64.zip`,
      `  - url: One-Person-Lab-${version}-mac-arm64.dmg`,
      `path: One-Person-Lab-${version}-mac-arm64.zip`,
      '',
    ].join('\n'),
  );

  fs.writeFileSync(path.join(fullDir, `One-Person-Lab-Full-${version}-mac-arm64.dmg`), 'full dmg');
  fs.writeFileSync(path.join(fullDir, 'full-package-manifest.json'), '{"distribution":{"updater_metadata_allowed":false}}\n');
  fs.writeFileSync(path.join(fullDir, 'SHA256SUMS.txt'), 'abc  file\n');
  fs.writeFileSync(path.join(fullDir, 'README-Full-First-Install.txt'), 'readme\n');

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
      '--full-package-dir',
      fullDir,
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
  const payload = JSON.parse(result.stdout) as {
    artifacts: string[];
    standard_artifacts: string[];
    full_package_artifacts: string[];
  };
  assert.ok(payload.standard_artifacts.some((artifact) => artifact.endsWith('latest-arm64-mac.yml')));
  assert.ok(payload.full_package_artifacts.some((artifact) => artifact.endsWith(`One-Person-Lab-Full-${version}-mac-arm64.dmg`)));
  assert.ok(payload.artifacts.some((artifact) => artifact.endsWith('README-Full-First-Install.txt')));
  assert.equal(payload.full_package_artifacts.some((artifact) => artifact.endsWith('.tar.zst')), false);
  const generatedArm64Metadata = fs.readFileSync(path.join(outDir, 'latest-arm64-mac.yml'), 'utf8');
  assert.doesNotMatch(generatedArm64Metadata, /Full/);
});

test('GUI release publisher writes standard release notes with update guidance', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-release-notes-test-'));
  const shellRoot = path.join(tmpRoot, 'opl-aion-shell');
  const outDir = path.join(shellRoot, 'out');
  const originalCwd = process.cwd();
  const fakeBin = path.join(tmpRoot, 'bin');
  const ghLog = path.join(tmpRoot, 'gh.jsonl');
  const version = '26.5.2';

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  spawnSync('git', ['init'], { cwd: shellRoot, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.email', 'release@example.local'], { cwd: shellRoot, stdio: 'ignore' });
  spawnSync('git', ['config', 'user.name', 'Release Test'], { cwd: shellRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(shellRoot, 'baseline.txt'), 'baseline\n');
  spawnSync('git', ['add', 'baseline.txt'], { cwd: shellRoot, stdio: 'ignore' });
  spawnSync('git', ['commit', '-m', 'baseline'], { cwd: shellRoot, stdio: 'ignore' });
  spawnSync('git', ['tag', 'v1.9.23'], { cwd: shellRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(shellRoot, 'settings.txt'), 'settings\n');
  spawnSync('git', ['add', 'settings.txt'], { cwd: shellRoot, stdio: 'ignore' });
  spawnSync('git', ['commit', '-m', 'fix(settings): align overview module health'], { cwd: shellRoot, stdio: 'ignore' });
  fs.writeFileSync(path.join(shellRoot, 'runtime.txt'), 'runtime\n');
  spawnSync('git', ['add', 'runtime.txt'], { cwd: shellRoot, stdio: 'ignore' });
  spawnSync('git', ['commit', '-m', 'fix(settings): streamline runtime personalization'], { cwd: shellRoot, stdio: 'ignore' });
  fs.writeFileSync(
    path.join(fakeBin, 'gh'),
    [
      '#!/usr/bin/env node',
      "const fs = require('fs');",
      `const log = ${JSON.stringify(ghLog)};`,
      'const args = process.argv.slice(2);',
      "fs.appendFileSync(log, JSON.stringify(args) + '\\n');",
      "if (args[0] === 'release' && args[1] === 'view') process.exit(1);",
      "if (args[0] === 'release' && (args[1] === 'create' || args[1] === 'upload')) process.exit(0);",
      'process.exit(1);',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  fs.writeFileSync(path.join(outDir, `One-Person-Lab-${version}-mac-arm64.dmg`), 'standard dmg');
  fs.writeFileSync(path.join(outDir, `One-Person-Lab-${version}-mac-arm64.zip`), 'standard zip');
  fs.writeFileSync(
    path.join(outDir, 'latest-mac.yml'),
    [
      `version: ${version}`,
      'files:',
      `  - url: One-Person-Lab-${version}-mac-arm64.zip`,
      `  - url: One-Person-Lab-${version}-mac-arm64.dmg`,
      `path: One-Person-Lab-${version}-mac-arm64.zip`,
      '',
    ].join('\n'),
  );

  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/publish-gui-release.mjs'),
      '--no-build',
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
  const calls = fs.readFileSync(ghLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]);
  const createCall = calls.find((args) => args[0] === 'release' && args[1] === 'create');
  assert.ok(createCall, 'expected gh release create to be called');
  const notes = createCall[createCall.indexOf('--notes') + 1];
  assert.match(notes, /Update guidance:/);
  assert.match(notes, /Changes in this release:/);
  assert.match(notes, /Settings: Align overview module health/);
  assert.match(notes, /Settings: Streamline runtime personalization/);
  assert.match(notes, /Existing users should update from inside the app/);
  assert.match(notes, /standard DMG\/ZIP assets and latest\*\.yml metadata remain the only auto-updater source/);
  assert.doesNotMatch(notes, /Full first-install package:/);
  assert.doesNotMatch(notes, /One-Person-Lab-Full/);

  const dryRun = spawnSync(
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
      cwd: originalCwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    },
  );
  assert.equal(dryRun.status, 0, dryRun.stderr);
  const payload = JSON.parse(dryRun.stdout) as { release_notes: string };
  assert.match(payload.release_notes, /Changes in this release:/);
  assert.match(payload.release_notes, /Settings: Align overview module health/);
});

test('GUI release publisher suggests same-day suffixes instead of incrementing the date version', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-release-date-version-test-'));
  const shellRoot = path.join(tmpRoot, 'opl-aion-shell');
  const outDir = path.join(shellRoot, 'out');
  const fakeBin = path.join(tmpRoot, 'bin');
  const dateVersion = '26.5.2';

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(
    path.join(fakeBin, 'gh'),
    [
      '#!/usr/bin/env bash',
      'if [[ "$1 $2 $3" == "release view v26.5.2" ]]; then exit 0; fi',
      'if [[ "$1 $2 $3" == "release view v26.5.2-a" ]]; then exit 1; fi',
      'exit 1',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  fs.writeFileSync(path.join(outDir, `One-Person-Lab-${dateVersion}-a-mac-arm64.dmg`), 'standard dmg');
  fs.writeFileSync(path.join(outDir, `One-Person-Lab-${dateVersion}-a-mac-arm64.zip`), 'standard zip');
  fs.writeFileSync(
    path.join(outDir, 'latest-mac.yml'),
    [
      `version: ${dateVersion}-a`,
      'files:',
      `  - url: One-Person-Lab-${dateVersion}-a-mac-arm64.dmg`,
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
      '--repo',
      'example/one-person-lab',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        OPL_RELEASE_DATE: '2026-05-02',
        PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ''}`,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as {
    tag: string;
    release_exists: boolean;
    create_release: boolean;
    standard_artifacts: string[];
  };
  assert.equal(payload.tag, `v${dateVersion}-a`);
  assert.equal(payload.release_exists, false);
  assert.equal(payload.create_release, true);
  assert.ok(payload.standard_artifacts.some((artifact) => artifact.endsWith(`One-Person-Lab-${dateVersion}-a-mac-arm64.dmg`)));
});

test('GUI release publisher can upload only Full first-install assets for an existing standard release', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-release-full-only-test-'));
  const shellRoot = path.join(tmpRoot, 'opl-aion-shell');
  const fullDir = path.join(tmpRoot, 'full');
  const fakeBin = path.join(tmpRoot, 'bin');
  const version = '26.5.2';

  fs.mkdirSync(shellRoot, { recursive: true });
  fs.mkdirSync(fullDir, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(
    path.join(fakeBin, 'gh'),
    '#!/usr/bin/env bash\nif [[ "$1 $2" == "release view" ]]; then exit 0; fi\nexit 1\n',
    { mode: 0o755 },
  );

  fs.writeFileSync(path.join(fullDir, `One-Person-Lab-Full-${version}-mac-arm64.dmg`), 'full dmg');
  fs.writeFileSync(path.join(fullDir, 'full-package-manifest.json'), '{"distribution":{"updater_metadata_allowed":false}}\n');
  fs.writeFileSync(path.join(fullDir, 'SHA256SUMS.txt'), 'abc  file\n');
  fs.writeFileSync(path.join(fullDir, 'README-Full-First-Install.txt'), 'readme\n');

  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/publish-gui-release.mjs'),
      '--dry-run',
      '--shell-root',
      shellRoot,
      '--version',
      version,
      '--repo',
      'example/one-person-lab',
      '--full-package-only',
      '--full-package-dir',
      fullDir,
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
  const payload = JSON.parse(result.stdout) as {
    build: boolean;
    full_package_only: boolean;
    artifacts: string[];
    standard_artifacts: string[];
    full_package_artifacts: string[];
    create_release: boolean;
    release_exists: boolean;
  };
  assert.equal(payload.build, false);
  assert.equal(payload.full_package_only, true);
  assert.equal(payload.release_exists, true);
  assert.equal(payload.create_release, false);
  assert.deepEqual(payload.standard_artifacts, []);
  assert.ok(payload.full_package_artifacts.some((artifact) => artifact.endsWith(`One-Person-Lab-Full-${version}-mac-arm64.dmg`)));
  assert.equal(payload.artifacts.every((artifact) => artifact.includes('Full') || artifact.endsWith('full-package-manifest.json') || artifact.endsWith('SHA256SUMS.txt') || artifact.endsWith('README-Full-First-Install.txt')), true);
});

test('GUI release publisher appends Full purpose notes to an existing standard release', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-release-full-notes-test-'));
  const shellRoot = path.join(tmpRoot, 'opl-aion-shell');
  const fullDir = path.join(tmpRoot, 'full');
  const fakeBin = path.join(tmpRoot, 'bin');
  const ghLog = path.join(tmpRoot, 'gh.jsonl');
  const version = '26.5.2';

  fs.mkdirSync(shellRoot, { recursive: true });
  fs.mkdirSync(fullDir, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(
    path.join(fakeBin, 'gh'),
    [
      '#!/usr/bin/env node',
      "const fs = require('fs');",
      `const log = ${JSON.stringify(ghLog)};`,
      'const args = process.argv.slice(2);',
      "fs.appendFileSync(log, JSON.stringify(args) + '\\n');",
      "if (args[0] === 'release' && args[1] === 'view' && args.includes('body')) {",
      "  process.stdout.write('One Person Lab desktop GUI release 26.5.2\\n');",
      '  process.exit(0);',
      '}',
      "if (args[0] === 'release' && args[1] === 'view') process.exit(0);",
      "if (args[0] === 'release' && (args[1] === 'edit' || args[1] === 'upload')) process.exit(0);",
      'process.exit(1);',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );

  fs.writeFileSync(path.join(fullDir, `One-Person-Lab-Full-${version}-mac-arm64.dmg`), 'full dmg');
  fs.writeFileSync(path.join(fullDir, 'full-package-manifest.json'), '{"distribution":{"updater_metadata_allowed":false}}\n');
  fs.writeFileSync(path.join(fullDir, 'SHA256SUMS.txt'), 'abc  file\n');
  fs.writeFileSync(path.join(fullDir, 'README-Full-First-Install.txt'), 'readme\n');

  const result = spawnSync(
    process.execPath,
    [
      path.join(repoRoot, 'scripts/publish-gui-release.mjs'),
      '--shell-root',
      shellRoot,
      '--version',
      version,
      '--repo',
      'example/one-person-lab',
      '--full-package-only',
      '--full-package-dir',
      fullDir,
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
  const calls = fs.readFileSync(ghLog, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]);
  const editCall = calls.find((args) => args[0] === 'release' && args[1] === 'edit');
  assert.ok(editCall, 'expected gh release edit to be called');
  const notes = editCall[editCall.indexOf('--notes') + 1];
  assert.match(notes, /Update guidance:/);
  assert.match(notes, /Full first-install package:/);
  assert.match(notes, new RegExp(`One-Person-Lab-Full-${version}-mac-arm64\\.dmg`));
  assert.match(notes, /reduce the time from first launch to the first MAS, MAG, or RCA task/);
  assert.match(notes, /bundles the MAS\/MDS\/MAG\/RCA domain modules, Hermes runtime payload, OfficeCLI CLI binary, and recommended companion skills/);
  assert.match(notes, /users still configure their API key normally/);
  assert.match(notes, /not referenced by latest\*\.yml/);
  assert.match(notes, /not used by the auto-updater/);
});

test('GUI release publisher rejects updater metadata that points at Full assets', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-release-full-guard-test-'));
  const shellRoot = path.join(tmpRoot, 'opl-aion-shell');
  const outDir = path.join(shellRoot, 'out');
  const fakeBin = path.join(tmpRoot, 'bin');
  const version = '26.5.2';

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, 'gh'), '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });
  fs.writeFileSync(path.join(outDir, `One-Person-Lab-${version}-mac-arm64.dmg`), 'standard dmg');
  fs.writeFileSync(
    path.join(outDir, 'latest-mac.yml'),
    [
      `version: ${version}`,
      'files:',
      `  - url: One-Person-Lab-Full-${version}-mac-arm64.dmg`,
      `path: One-Person-Lab-Full-${version}-mac-arm64.dmg`,
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

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /must not reference One Person Lab Full assets/);
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
