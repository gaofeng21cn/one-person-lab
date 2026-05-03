import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  buildFullRuntimeCacheArchiveName,
  buildFullRuntimeCacheKey,
  buildFullPackageManifest,
  buildInternalArtifactNames,
  buildInternalPackageReadme,
  shouldExcludeRuntimePath,
} from '../../src/full-internal-package.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function writeExecutable(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

test('full internal manifest declares all first-run domain modules and Hermes lean runtime', () => {
  const manifest = buildFullPackageManifest({
    version: '26.5.1',
    generatedAt: '2026-05-01T00:00:00.000Z',
    components: {
      opl: { source_path: '/repo/opl', git_commit: 'oplsha', size_bytes: 1 },
      codex: { source_path: '/codex', version: '0.125.0', size_bytes: 2 },
      hermes: { source_path: '/hermes', version: '0.8.0', git_commit: 'hermessha', size_bytes: 3 },
      mas: { source_path: '/mas', git_commit: 'massha', size_bytes: 4 },
      mds: { source_path: '/mds', git_commit: 'mdssha', size_bytes: 5 },
      mag: { source_path: '/mag', git_commit: 'magsha', size_bytes: 6 },
      rca: { source_path: '/rca', git_commit: 'rcasha', size_bytes: 7 },
      node: { source_path: '/node', version: '22.16.0', size_bytes: 6 },
      python: { source_path: '/python', version: '3.12.12', size_bytes: 7 },
      uv: { source_path: '/uv', version: '0.9.5', size_bytes: 8 },
      officecli: { source_path: '/officecli', version: '1.0.70', size_bytes: 10 },
      skills: { source_path: '/skills', size_bytes: 9 },
    },
  });

  assert.equal(manifest.package_kind, 'opl_full_first_install_macos_arm64');
  assert.equal(manifest.runtime.install_root_template, '~/Library/Application Support/OPL/runtime/current');
  assert.equal(manifest.runtime.installed_runtime_path, '~/Library/Application Support/OPL/runtime/current');
  assert.equal(manifest.runtime.active_pointer_path, '~/Library/Application Support/OPL/runtime/current.json');
  assert.equal(
    manifest.runtime.version_metadata_path,
    '~/Library/Application Support/OPL/runtime/current/.opl-full-runtime-installed.json',
  );
  assert.equal(manifest.runtime.runtime_version_stored_in_metadata_only, true);
  assert.equal(
    manifest.runtime.domain_module_payload_policy,
    'packaged_runtime_modules_are_materialized_to_standard_state_modules_on_install',
  );
  assert.equal(manifest.runtime.managed_modules_root_template, '~/Library/Application Support/OPL/state/modules');
  assert.equal(manifest.components.mas.required, true);
  assert.equal(manifest.components.mas.role, 'primary_domain_module');
  assert.equal(manifest.components.mds.required, true);
  assert.equal(manifest.components.mds.visible_in_first_run_ui, false);
  assert.equal(manifest.components.mag.required, true);
  assert.equal(manifest.components.mag.role, 'grant_domain_module');
  assert.equal(manifest.components.mag.visible_in_first_run_ui, true);
  assert.equal(manifest.components.rca.required, true);
  assert.equal(manifest.components.rca.role, 'visual_deliverable_domain_module');
  assert.equal(manifest.components.rca.visible_in_first_run_ui, true);
  assert.equal(manifest.components.officecli.required, true);
  assert.equal(manifest.components.officecli.role, 'office_document_cli_binary');
  assert.equal(manifest.components.skills.role, 'recommended_codex_skills_including_officecli_ui_ux');
  assert.equal(manifest.components.hermes.profile, 'lean');
  assert.ok(manifest.components.hermes.excluded_capabilities.includes('web_ui'));
  assert.equal(manifest.distribution.github_release_upload, true);
  assert.equal(manifest.distribution.updater_metadata_allowed, false);
  assert.equal(manifest.distribution.runtime_auto_update, false);
  assert.equal(manifest.distribution.app_auto_update, 'standard_github_release_metadata_only');
  assert.ok(manifest.distribution.standard_update_assets.includes('latest-arm64-mac.yml'));
  assert.equal(manifest.distribution.signing_policy.matches_standard_release_mode, true);
  assert.equal(manifest.distribution.signing_policy.developer_id_when_configured, true);
  assert.equal(manifest.distribution.signing_policy.notarization_when_configured, true);
});

test('full first-install artifact names use release-safe naming', () => {
  assert.deepEqual(buildInternalArtifactNames('26.5.1'), {
    dmg: 'One-Person-Lab-Full-26.5.1-mac-arm64.dmg',
    runtimeTar: 'opl-runtime-full-26.5.1-macos-arm64.tar.zst',
    checksums: 'SHA256SUMS.txt',
    readme: 'README-Full-First-Install.txt',
    manifest: 'full-package-manifest.json',
  });
});

test('full runtime cache keys are stable per layer and archive-safe', () => {
  const first = buildFullRuntimeCacheKey({
    layerId: 'toolchain',
    parts: { codex: '0.1.0', node: 'v22.0.0' },
  });
  const second = buildFullRuntimeCacheKey({
    layerId: 'toolchain',
    parts: { codex: '0.1.0', node: 'v22.0.0' },
  });
  const third = buildFullRuntimeCacheKey({
    layerId: 'toolchain',
    parts: { codex: '0.1.1', node: 'v22.0.0' },
  });

  assert.equal(first, second);
  assert.notEqual(first, third);
  assert.match(first, /^full-runtime-v1-toolchain-[0-9a-f]{24}$/);
  assert.equal(
    buildFullRuntimeCacheArchiveName({ layerId: 'toolchain', key: first }),
    `${first}.tar.zst`,
  );
});

test('runtime staging excludes dev/runtime-heavy paths while preserving core entries', () => {
  assert.equal(shouldExcludeRuntimePath('hermes/.git/config'), true);
  assert.equal(shouldExcludeRuntimePath('hermes/tests/test_gateway.py'), true);
  assert.equal(shouldExcludeRuntimePath('hermes/web/package.json'), true);
  assert.equal(shouldExcludeRuntimePath('hermes/ui/package.json'), true);
  assert.equal(shouldExcludeRuntimePath('hermes/tools/voice_mode.py'), true);
  assert.equal(shouldExcludeRuntimePath('hermes/.venv/bin/python3'), true);
  assert.equal(shouldExcludeRuntimePath('modules/mds/src/ui/package.json'), true);
  assert.equal(shouldExcludeRuntimePath('modules/mas/.venv/bin/python3'), true);
  assert.equal(shouldExcludeRuntimePath('modules/mds/.worktrees/runtime-worktree-storage-prune/src/ui/bin/ds'), true);
  assert.equal(shouldExcludeRuntimePath('modules/mas/.codex/local.json'), true);
  assert.equal(shouldExcludeRuntimePath('modules/mas/.omx/state.json'), true);
  assert.equal(shouldExcludeRuntimePath('modules/mas/.git/HEAD'), true);
  assert.equal(shouldExcludeRuntimePath('modules/mas/.venv/lib/python3.12/site-packages/pip/__pycache__/x.pyc'), true);
  assert.equal(shouldExcludeRuntimePath('opl/node_modules/typescript/package.json'), true);
  assert.equal(shouldExcludeRuntimePath('opl/python/opl-harness-shared/.venv/bin/python3'), true);
  assert.equal(shouldExcludeRuntimePath('opl/dist/cli.js'), true);

  assert.equal(shouldExcludeRuntimePath('hermes/hermes_cli/gateway.py'), false);
  assert.equal(shouldExcludeRuntimePath('hermes/hermes_cli/cron.py'), false);
  assert.equal(shouldExcludeRuntimePath('modules/mas/src/medautosci/__init__.py'), false);
  assert.equal(shouldExcludeRuntimePath('modules/mds/src/med_deepscientist/__init__.py'), false);
  assert.equal(shouldExcludeRuntimePath('modules/mag/src/med_autogrant/__init__.py'), false);
  assert.equal(shouldExcludeRuntimePath('modules/rca/apps/redcube-cli/dist/cli.js'), false);
  assert.equal(shouldExcludeRuntimePath('modules/rca/packages/redcube-gateway/dist/index.js'), false);
});

test('packaged first-run CLI path does not eagerly load quality-details dev dependencies', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'src/cli/cases/public-command-specs.ts'), 'utf8');

  assert.doesNotMatch(
    source,
    /import\s+\{[^}]*buildQualityDetails[^}]*\}\s+from\s+['"]\.\.\/\.\.\/quality-details\/index\.ts['"]/,
  );
  assert.match(
    source,
    /await import\(['"]\.\.\/\.\.\/quality-details\/index\.ts['"]\)/,
  );
});

test('readme documents GitHub Release first-install distribution and app update boundary', () => {
  const text = buildInternalPackageReadme({
    version: '26.5.1',
    dmgName: 'One-Person-Lab-Full-26.5.1-mac-arm64.dmg',
    runtimeTarName: null,
    notarized: false,
  });

  assert.match(text, /GitHub Release/);
  assert.match(text, /latest\*\.yml/);
  assert.match(text, /自动更新目标/);
  assert.match(text, /Application Support\/OPL\/runtime\/current/);
  assert.match(text, /Application Support\/OPL\/state\/modules\/<repo-name>/);
  assert.match(text, /current\.json/);
  assert.match(text, /\.opl-full-runtime-installed\.json/);
  assert.match(text, /officecli CLI binary/);
  assert.match(text, /officecli-docx\/pptx\/xlsx/);
  assert.match(text, /ui-ux-pro-max/);
  assert.doesNotMatch(text, /Application Support\/OPL\/runtime\/26\.5\.1/);
  assert.match(text, /API key/);
  assert.match(text, /确认 Codex、Hermes-Agent、MAS、MDS backend、MAG、RCA、officecli CLI 与推荐 skills 状态/);
  assert.match(text, /当前标准 GitHub DMG 的同等发布模式/);
  assert.match(text, /右键打开/);
});

test('packaged module markers are staging sources until materialized into managed module roots', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-marker-'));
  const originalStateDir = process.env.OPL_STATE_DIR;
  const originalModulesRoot = process.env.OPL_MODULES_ROOT;
  const originalModulePaths = new Map(
    ['MEDAUTOSCIENCE', 'MEDDEEPSCIENTIST', 'MEDAUTOGRANT', 'REDCUBE'].map((suffix) => {
      const key = `OPL_MODULE_PATH_${suffix}`;
      return [key, process.env[key]] as const;
    }),
  );
  try {
    const runtimeModulesRoot = path.join(tempRoot, 'runtime', 'current', 'modules');
    const moduleSpecs = [
      ['medautoscience', 'med-autoscience', 'mas', 'abc123'],
      ['meddeepscientist', 'med-deepscientist', 'mds', 'def456'],
      ['medautogrant', 'med-autogrant', 'mag', 'fed789'],
      ['redcube', 'redcube-ai', 'rca', 'cba987'],
    ] as const;
    for (const [moduleId, repoName, runtimeDir, headSha] of moduleSpecs) {
      const moduleRoot = path.join(runtimeModulesRoot, runtimeDir);
      fs.mkdirSync(path.join(moduleRoot, 'scripts'), { recursive: true });
      fs.writeFileSync(
        path.join(moduleRoot, 'opl-runtime-module.json'),
        JSON.stringify({
          module_id: moduleId,
          repo_name: repoName,
          source_git: { head_sha: headSha },
          packaged_runtime: true,
        }),
        'utf8',
      );
      fs.writeFileSync(
        path.join(moduleRoot, 'scripts', 'opl-module-healthcheck.sh'),
        '#!/usr/bin/env bash\nset -euo pipefail\n',
        { mode: 0o755 },
      );
    }
    process.env.OPL_STATE_DIR = path.join(tempRoot, 'state');
    process.env.OPL_MODULES_ROOT = path.join(tempRoot, 'managed-modules');
    process.env.OPL_MODULE_PATH_MEDAUTOSCIENCE = path.join(runtimeModulesRoot, 'mas');
    process.env.OPL_MODULE_PATH_MEDDEEPSCIENTIST = path.join(runtimeModulesRoot, 'mds');
    process.env.OPL_MODULE_PATH_MEDAUTOGRANT = path.join(runtimeModulesRoot, 'mag');
    process.env.OPL_MODULE_PATH_REDCUBE = path.join(runtimeModulesRoot, 'rca');

    const { buildOplModules, runOplModuleAction } = await import('../../src/system-installation/modules.ts');
    const surface = buildOplModules().modules;
    const byId = new Map(surface.modules.map((entry) => [entry.module_id, entry]));

    for (const [moduleId] of moduleSpecs) {
      const module = byId.get(moduleId);
      assert.equal(module?.installed, false);
      assert.equal(module?.install_origin, 'missing');
      assert.equal(module?.recommended_action, 'install');
    }

    const installed = runOplModuleAction('install', 'redcube').module_action.module;
    assert.equal(installed.installed, true);
    assert.equal(installed.install_origin, 'managed_root');
    assert.equal(installed.checkout_path, path.join(tempRoot, 'managed-modules', 'redcube-ai'));
    assert.equal(installed.git?.head_sha, 'cba987');
    assert.equal(fs.existsSync(path.join(installed.checkout_path, 'opl-runtime-module.json')), true);

    const refreshed = buildOplModules().modules.modules.find((entry) => entry.module_id === 'redcube');
    assert.equal(refreshed?.install_origin, 'managed_root');
    assert.equal(refreshed?.checkout_path, path.join(tempRoot, 'managed-modules', 'redcube-ai'));
    assert.equal(refreshed?.git?.head_sha, 'cba987');
    assert.equal(refreshed?.available_actions.includes('remove'), true);
  } finally {
    if (originalStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = originalStateDir;
    }
    if (originalModulesRoot === undefined) {
      delete process.env.OPL_MODULES_ROOT;
    } else {
      process.env.OPL_MODULES_ROOT = originalModulesRoot;
    }
    for (const [key, value] of originalModulePaths) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('full runtime layer cache records miss then hit when zstd is available', () => {
  if (spawnSync('which', ['zstd'], { encoding: 'utf8' }).status !== 0) {
    assert.ok(true, 'zstd is not available in this environment; CI workflow installs it for Full runtime cache packaging.');
    return;
  }

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-cache-test-'));
  try {
    const guiRoot = path.join(tmpRoot, 'opl-aion-shell');
    const outDir = path.join(guiRoot, 'out');
    const cacheDir = path.join(tmpRoot, 'cache');
    const outputDir = path.join(tmpRoot, 'out');
    const version = '26.5.99';
    fs.mkdirSync(outDir, { recursive: true });

    const codexRoot = path.join(tmpRoot, 'codex');
    const codexVendor = path.join(
      codexRoot,
      'node_modules',
      '@openai',
      'codex-darwin-arm64',
      'vendor',
      'aarch64-apple-darwin',
    );
    fs.mkdirSync(codexRoot, { recursive: true });
    fs.writeFileSync(path.join(codexRoot, 'package.json'), '{"version":"0.1.0"}\n');
    writeExecutable(path.join(codexVendor, 'codex', 'codex'), '#!/usr/bin/env bash\necho codex 0.1.0\n');
    writeExecutable(path.join(codexVendor, 'path', 'rg'), '#!/usr/bin/env bash\necho rg\n');

    const pythonRoot = path.join(tmpRoot, 'python', 'cpython-3.12.0-macos-aarch64-none');
    writeExecutable(path.join(pythonRoot, 'bin', 'python3'), '#!/usr/bin/env bash\necho Python 3.12.0\n');
    const uvBin = path.join(tmpRoot, 'bin', 'uv');
    writeExecutable(uvBin, '#!/usr/bin/env bash\necho uv 0.1.0\n');
    const officeCliBin = path.join(tmpRoot, 'bin', 'officecli');
    writeExecutable(officeCliBin, '#!/usr/bin/env bash\necho 1.0.70-test\n');

    for (const [name, executable] of [
      ['hermes-agent', 'hermes'],
      ['med-autoscience', 'mas'],
      ['med-deepscientist', 'mds'],
      ['med-autogrant', 'mag'],
      ['redcube-ai', 'rca'],
    ]) {
      const root = path.join(tmpRoot, name);
      fs.mkdirSync(root, { recursive: true });
      fs.writeFileSync(path.join(root, 'README.md'), `${name}\n`);
      if (executable === 'hermes') {
        writeExecutable(path.join(root, 'hermes'), '#!/usr/bin/env python3\nprint("hermes")\n');
      }
      if (executable !== 'hermes' && ['mas', 'mag', 'rca'].includes(executable)) {
        fs.mkdirSync(path.join(root, 'plugins', executable, 'skills', executable), { recursive: true });
        fs.writeFileSync(
          path.join(root, 'plugins', executable, 'skills', executable, 'SKILL.md'),
          `---\nname: ${executable}\ndescription: ${executable} app skill\n---\n\n# ${executable}\n`,
          'utf8',
        );
      }
    }
    const officeCliRoot = path.join(tmpRoot, 'OfficeCLI');
    fs.mkdirSync(officeCliRoot, { recursive: true });
    fs.writeFileSync(
      path.join(officeCliRoot, 'SKILL.md'),
      '---\nname: officecli\ndescription: OfficeCLI core skill\n---\n\n# officecli\n',
      'utf8',
    );
    for (const skillName of ['officecli-docx', 'officecli-pptx', 'officecli-xlsx']) {
      fs.mkdirSync(path.join(officeCliRoot, 'skills', skillName), { recursive: true });
      fs.writeFileSync(
        path.join(officeCliRoot, 'skills', skillName, 'SKILL.md'),
        `---\nname: ${skillName}\ndescription: ${skillName} skill\n---\n\n# ${skillName}\n`,
        'utf8',
      );
    }
    const uiUxRoot = path.join(tmpRoot, 'ui-ux-pro-max-skill');
    fs.mkdirSync(path.join(uiUxRoot, '.claude', 'skills', 'ui-ux-pro-max'), { recursive: true });
    fs.mkdirSync(path.join(uiUxRoot, 'src', 'ui-ux-pro-max', 'data'), { recursive: true });
    fs.writeFileSync(
      path.join(uiUxRoot, '.claude', 'skills', 'ui-ux-pro-max', 'SKILL.md'),
      '---\nname: ui-ux-pro-max\ndescription: UI UX skill\n---\n\n# ui-ux-pro-max\n',
      'utf8',
    );
    fs.writeFileSync(path.join(uiUxRoot, 'src', 'ui-ux-pro-max', 'data', 'palettes.json'), '{}\n', 'utf8');

    const runPackage = () => {
      fs.writeFileSync(path.join(outDir, `One-Person-Lab-${version}-mac-arm64.dmg`), 'fake dmg');
      return spawnSync(
        process.execPath,
        [
          '--experimental-strip-types',
          path.join(repoRoot, 'scripts/build-full-internal-package.mjs'),
          '--version',
          version,
          '--out-dir',
          outputDir,
          '--gui-root',
          guiRoot,
          '--hermes-root',
          path.join(tmpRoot, 'hermes-agent'),
          '--mas-root',
          path.join(tmpRoot, 'med-autoscience'),
          '--mds-root',
          path.join(tmpRoot, 'med-deepscientist'),
          '--mag-root',
          path.join(tmpRoot, 'med-autogrant'),
          '--rca-root',
          path.join(tmpRoot, 'redcube-ai'),
          '--codex-root',
          codexRoot,
          '--node-bin',
          process.execPath,
          '--uv-bin',
          uvBin,
          '--python-root',
          pythonRoot,
          '--officecli-bin',
          officeCliBin,
          '--officecli-root',
          officeCliRoot,
          '--ui-ux-pro-max-root',
          uiUxRoot,
          '--runtime-cache-dir',
          cacheDir,
          '--runtime-cache-mode',
          'readwrite',
          '--skip-gui-build',
        ],
        {
          cwd: repoRoot,
          encoding: 'utf8',
        },
      );
    };

    const first = runPackage();
    assert.equal(first.status, 0, first.stderr);
    const firstPayload = JSON.parse(first.stdout) as { runtime_cache: { events: Array<{ status: string }> } };
    assert.deepEqual(
      firstPayload.runtime_cache.events.map((event) => event.status),
      ['miss_written', 'miss_written', 'miss_written', 'miss_written'],
    );

    const second = runPackage();
    assert.equal(second.status, 0, second.stderr);
    const secondPayload = JSON.parse(second.stdout) as { runtime_cache: { events: Array<{ status: string }> } };
    assert.deepEqual(
      secondPayload.runtime_cache.events.map((event) => event.status),
      ['hit', 'hit', 'hit', 'hit'],
    );
    assert.ok(fs.existsSync(path.join(outputDir, `One-Person-Lab-Full-${version}-mac-arm64.dmg`)));
    const runtimeRoot = path.join(guiRoot, 'packaged-runtimes', 'opl-full-runtime', 'runtime', 'current');
    assert.ok(fs.existsSync(path.join(runtimeRoot, 'bin', 'officecli')));
    for (const skillName of ['mas', 'mag', 'rca', 'officecli', 'officecli-docx', 'officecli-pptx', 'officecli-xlsx', 'ui-ux-pro-max']) {
      assert.equal(
        fs.existsSync(path.join(runtimeRoot, 'skills', skillName, 'SKILL.md')),
        true,
        `${skillName} should be staged in the Full runtime skills layer`,
      );
    }
    assert.equal(fs.existsSync(path.join(runtimeRoot, 'skills', 'ui-ux-pro-max', 'data', 'palettes.json')), true);
    for (const [moduleDir, moduleId] of [
      ['mas', 'medautoscience'],
      ['mds', 'meddeepscientist'],
      ['mag', 'medautogrant'],
      ['rca', 'redcube'],
    ]) {
      const marker = JSON.parse(
        fs.readFileSync(
          path.join(
            guiRoot,
            'packaged-runtimes',
            'opl-full-runtime',
            'runtime',
            'current',
            'modules',
            moduleDir,
            'opl-runtime-module.json',
          ),
          'utf8',
        ),
      ) as { module_id: string; packaged_runtime: boolean };
      assert.equal(marker.module_id, moduleId);
      assert.equal(marker.packaged_runtime, true);
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});
