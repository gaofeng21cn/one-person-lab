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
  assert.match(workflow, /Checkout Hermes-Agent/);
  assert.match(workflow, /repository: gaofeng21cn\/one-person-lab-app/);
  assert.match(workflow, /path: one-person-lab-app/);
  assert.match(workflow, /working-directory: one-person-lab-app\/shells\/aionui/);
  assert.match(workflow, /--shell-root "\$GITHUB_WORKSPACE\/one-person-lab-app\/shells\/aionui"/);
  assert.match(workflow, /Checkout MAG/);
  assert.match(workflow, /Checkout RCA/);
  assert.match(workflow, /Checkout OfficeCLI/);
  assert.match(workflow, /Checkout UI UX Pro Max skill/);
  assert.doesNotMatch(workflow, /Checkout MDS/);
  assert.match(workflow, /NousResearch\/hermes-agent/);
  assert.match(workflow, /gaofeng21cn\/med-autogrant/);
  assert.match(workflow, /gaofeng21cn\/redcube-ai/);
  assert.doesNotMatch(workflow, /gaofeng21cn\/med-deepscientist/);
  assert.match(workflow, /iOfficeAI\/OfficeCLI/);
  assert.match(workflow, /nextlevelbuilder\/ui-ux-pro-max-skill/);
  assert.match(workflow, /uv sync --project _external\/hermes-agent --no-dev/);
  assert.match(workflow, /uv sync --project med-autogrant --no-dev/);
  assert.doesNotMatch(workflow, /uv sync --project med-deepscientist/);
  assert.match(workflow, /npm ci --prefix redcube-ai/);
  assert.match(workflow, /npm run --prefix redcube-ai build/);
  assert.match(workflow, /echo "\$HOME\/\.local\/bin" >> "\$GITHUB_PATH"/);
  assert.match(workflow, /officecli --version/);
  assert.match(workflow, /OPL_FULL_HERMES_ROOT/);
  assert.match(workflow, /OPL_FULL_MAG_ROOT/);
  assert.match(workflow, /OPL_FULL_RCA_ROOT/);
  assert.doesNotMatch(workflow, /OPL_FULL_MDS_ROOT/);
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
  assert.match(workflow, /repository: gaofeng21cn\/one-person-lab-app/);
  assert.match(workflow, /path: one-person-lab-app/);
  assert.match(workflow, /working-directory: one-person-lab-app\/shells\/aionui/);
  assert.match(workflow, /hashFiles\('one-person-lab-app\/shells\/aionui\/package\.json', 'one-person-lab-app\/shells\/aionui\/bun\.lock'\)/);
  assert.match(workflow, /--shell-root "\$GITHUB_WORKSPACE\/one-person-lab-app\/shells\/aionui"/);
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

test('GUI release and Full package scripts default to the App active shell root', () => {
  const releaseScript = read('scripts/publish-gui-release.mjs');
  const fullPackageScript = read('scripts/build-full-internal-package.mjs');

  assert.match(releaseScript, /'one-person-lab-app', 'shells', 'aionui'/);
  assert.match(releaseScript, /OPL_APP_SHELL_ROOT \|\| process\.env\.OPL_AION_SHELL_ROOT/);
  assert.match(releaseScript, /Missing One Person Lab App active shell checkout/);
  assert.match(fullPackageScript, /OPL_FULL_GUI_ROOT/);
  assert.match(fullPackageScript, /'one-person-lab-app', 'shells', 'aionui'/);
});

test('GUI release publisher defaults to current arm64 artifacts only', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-release-test-'));
  const shellRoot = path.join(tmpRoot, 'one-person-lab-app', 'shells', 'aionui');
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
  const shellRoot = path.join(tmpRoot, 'one-person-lab-app', 'shells', 'aionui');
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
  fs.writeFileSync(
    path.join(fullDir, 'full-package-manifest.json'),
    JSON.stringify({
      generated_at: '2026-05-09T10:20:00.000Z',
      distribution: { updater_metadata_allowed: false },
      components: {
        mas: { git_commit: 'massha123456' },
        mag: { git_commit: 'magsha123456' },
        rca: { git_commit: 'rcasha123456' },
        officecli: { version: '1.0.73' },
      },
    }),
  );
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
  const shellRoot = path.join(tmpRoot, 'one-person-lab-app', 'shells', 'aionui');
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
  const shellRoot = path.join(tmpRoot, 'one-person-lab-app', 'shells', 'aionui');
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
  const shellRoot = path.join(tmpRoot, 'one-person-lab-app', 'shells', 'aionui');
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
  fs.writeFileSync(
    path.join(fullDir, 'full-package-manifest.json'),
    `${JSON.stringify({
      generated_at: '2026-05-09T10:20:00.000Z',
      distribution: { updater_metadata_allowed: false },
      components: {
        mas: { git_commit: 'massha123456' },
        mag: { git_commit: 'magsha123456' },
        rca: { git_commit: 'rcasha123456' },
        officecli: { version: '1.0.73' },
      },
    })}\n`,
  );
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
  const shellRoot = path.join(tmpRoot, 'one-person-lab-app', 'shells', 'aionui');
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
  fs.writeFileSync(
    path.join(fullDir, 'full-package-manifest.json'),
    `${JSON.stringify({
      generated_at: '2026-05-09T10:20:00.000Z',
      distribution: { updater_metadata_allowed: false },
      components: {
        mas: { git_commit: 'massha1' },
        mag: { git_commit: 'magsha1' },
        rca: { git_commit: 'rcasha1' },
        officecli: { version: '1.0.73' },
      },
    })}\n`,
  );
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
  assert.match(notes, /Full first-install package/);
  assert.match(notes, new RegExp(`One-Person-Lab-Full-${version}-mac-arm64\\.dmg`));
  assert.match(notes, /fastest first setup/);
  assert.match(notes, /preloads MAS, MAG, RCA, the family runtime support payload, OfficeCLI, and recommended companion skills/);
  assert.match(notes, /Full OPL readiness is Temporal-backed/);
  assert.match(notes, /Temporal is the required production durable stage-attempt provider/);
  assert.match(notes, /MDS remains retired and is not bundled as a default module or MAS runtime dependency/);
  assert.match(notes, /users still only need to configure their API key/);
  assert.match(notes, /not a separate update channel/);
  assert.match(notes, /App auto-update still follows the standard latest\*\.yml metadata/);
  assert.match(notes, /Bundled module versions/);
  assert.match(notes, /MAS: 2026-05-09 18:20 Beijing time build, main @ massha1/);
  assert.match(notes, /MAG: 2026-05-09 18:20 Beijing time build, main @ magsha1/);
  assert.match(notes, /RCA: 2026-05-09 18:20 Beijing time build, main @ rcasha1/);
  assert.doesNotMatch(notes, /Hermes-Agent: 2026-05-09 18:20 Beijing time build/);
  assert.match(notes, /OfficeCLI: 1\.0\.73/);
  assert.doesNotMatch(notes, /MAS\/MDS\/MAG\/RCA/);
  assert.doesNotMatch(notes, /Validation/);
  assert.doesNotMatch(notes, /Published assets/);
});

test('GUI release publisher rejects updater metadata that points at Full assets', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-gui-release-full-guard-test-'));
  const shellRoot = path.join(tmpRoot, 'one-person-lab-app', 'shells', 'aionui');
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
  const shellRoot = path.join(tmpRoot, 'one-person-lab-app', 'shells', 'aionui');
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
