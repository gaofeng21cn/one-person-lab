import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildFullPackageManifest,
  buildInternalArtifactNames,
  buildInternalPackageReadme,
  shouldExcludeRuntimePath,
} from '../../src/full-internal-package.ts';

test('full internal manifest declares MAS required, MDS backend hidden, and Hermes lean runtime', () => {
  const manifest = buildFullPackageManifest({
    version: '26.5.1',
    generatedAt: '2026-05-01T00:00:00.000Z',
    components: {
      opl: { source_path: '/repo/opl', git_commit: 'oplsha', size_bytes: 1 },
      codex: { source_path: '/codex', version: '0.125.0', size_bytes: 2 },
      hermes: { source_path: '/hermes', version: '0.8.0', git_commit: 'hermessha', size_bytes: 3 },
      mas: { source_path: '/mas', git_commit: 'massha', size_bytes: 4 },
      mds: { source_path: '/mds', git_commit: 'mdssha', size_bytes: 5 },
      node: { source_path: '/node', version: '22.16.0', size_bytes: 6 },
      python: { source_path: '/python', version: '3.12.12', size_bytes: 7 },
      uv: { source_path: '/uv', version: '0.9.5', size_bytes: 8 },
      skills: { source_path: '/skills', size_bytes: 9 },
    },
  });

  assert.equal(manifest.package_kind, 'opl_full_first_install_macos_arm64');
  assert.equal(manifest.runtime.install_root_template, '~/Library/Application Support/OPL/runtime/<version>');
  assert.equal(manifest.components.mas.required, true);
  assert.equal(manifest.components.mas.role, 'primary_domain_module');
  assert.equal(manifest.components.mds.required, true);
  assert.equal(manifest.components.mds.visible_in_first_run_ui, false);
  assert.equal(manifest.components.hermes.profile, 'lean');
  assert.ok(manifest.components.hermes.excluded_capabilities.includes('web_ui'));
  assert.equal(manifest.distribution.github_release_upload, true);
  assert.equal(manifest.distribution.updater_metadata_allowed, false);
  assert.equal(manifest.distribution.runtime_auto_update, false);
  assert.equal(manifest.distribution.app_auto_update, 'standard_github_release_metadata_only');
  assert.ok(manifest.distribution.standard_update_assets.includes('latest-arm64-mac.yml'));
  assert.equal(manifest.distribution.signing_policy.release_requires_notarization, true);
});

test('full first-install artifact names use release-safe naming', () => {
  assert.deepEqual(buildInternalArtifactNames('26.5.1'), {
    dmg: 'One-Person-Lab-Full-26.5.1-mac-arm64.dmg',
    runtimeTar: 'opl-runtime-full-26.5.1-macos-arm64.tar.zst',
    checksums: 'SHA256SUMS.txt',
    readme: 'README-首次安装说明.txt',
    manifest: 'full-package-manifest.json',
  });
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

  assert.equal(shouldExcludeRuntimePath('hermes/hermes_cli/gateway.py'), false);
  assert.equal(shouldExcludeRuntimePath('hermes/hermes_cli/cron.py'), false);
  assert.equal(shouldExcludeRuntimePath('modules/mas/src/medautosci/__init__.py'), false);
  assert.equal(shouldExcludeRuntimePath('modules/mds/src/med_deepscientist/__init__.py'), false);
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
  assert.match(text, /Application Support\/OPL\/runtime\/26\.5\.1/);
  assert.match(text, /API key/);
  assert.match(text, /正式 GitHub Release 资产必须通过 Developer ID 签名和 Apple 公证/);
});

test('packaged module marker lets git-stripped MAS runtime count as installed', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-full-marker-'));
  const originalStateDir = process.env.OPL_STATE_DIR;
  const originalModulesRoot = process.env.OPL_MODULES_ROOT;
  try {
    const modulesRoot = path.join(tempRoot, 'modules');
    const masRoot = path.join(modulesRoot, 'med-autoscience');
    fs.mkdirSync(masRoot, { recursive: true });
    fs.writeFileSync(
      path.join(masRoot, 'opl-runtime-module.json'),
      JSON.stringify({
        module_id: 'medautoscience',
        repo_name: 'med-autoscience',
        source_git: { head_sha: 'abc123' },
        packaged_runtime: true,
      }),
      'utf8',
    );
    process.env.OPL_STATE_DIR = path.join(tempRoot, 'state');
    process.env.OPL_MODULES_ROOT = modulesRoot;

    const { buildOplModules } = await import('../../src/system-installation/modules.ts');
    const surface = buildOplModules().modules;
    const mas = surface.modules.find((entry) => entry.module_id === 'medautoscience');

    assert.equal(mas?.installed, true);
    assert.equal(mas?.install_origin, 'managed_root');
    assert.equal(mas?.health_status, 'ready');
    assert.equal(mas?.git?.head_sha, 'abc123');
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
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
