import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { locateInstalledPackage } from '../../src/adapters/integration/package-locator.ts';
import { runCli, runCliFailure, runCliReadOnly } from './cli/helpers.ts';

test('locateInstalledPackage resolves installed package root and validates asset containment', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pkg-locate-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pkg-locate-out-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  const pkgDir = path.join(root, 'custom-media-assets');
  fs.mkdirSync(path.join(pkgDir, '.codex-plugin'), { recursive: true });
  fs.mkdirSync(path.join(pkgDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(pkgDir, 'assets', 'catalog.json'), '{"items":[]}\n');
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'escape');
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(pkgDir, 'assets', 'escape.txt'));
  fs.writeFileSync(
    path.join(pkgDir, '.codex-plugin', 'plugin.json'),
    JSON.stringify({
      name: 'custom-media-assets',
      version: '0.1.0',
      description: 'Custom media assets fixture.',
    }),
  );

  const runner = () => ({
    status: 0,
    error: null,
    stdout: JSON.stringify({
      installed: [
        {
          pluginId: 'custom-media-assets@local',
          version: '0.1.0',
          installed: true,
          enabled: true,
          source: {
            source: 'codex_plugin_manager',
            path: pkgDir,
          },
          marketplaceSource: {
            source: 'local',
          },
        },
      ],
    }),
    stderr: '',
  });
  const env = { CODEX_HOME: root, OPL_STATE_DIR: root };

  const located = locateInstalledPackage({
    packageId: 'custom-media-assets',
    asset: 'assets/catalog.json',
    env,
    runner,
  }).opl_package_location;
  assert.equal(located.found, true);
  assert.equal(located.enabled, true);
  assert.equal(located.package_root, fs.realpathSync.native(pkgDir));
  assert.equal(located.asset_exists, true);
  assert.equal(located.asset_path, fs.realpathSync.native(path.join(pkgDir, 'assets/catalog.json')));

  const missingAsset = locateInstalledPackage({
    packageId: 'custom-media-assets',
    asset: 'assets/missing.json',
    env,
    runner,
  }).opl_package_location;
  assert.equal(missingAsset.found, true);
  assert.equal(missingAsset.asset_exists, false);

  const missingPkg = locateInstalledPackage({
    packageId: 'absent-package',
    env,
    runner,
  }).opl_package_location;
  assert.equal(missingPkg.found, false);
  assert.equal(missingPkg.package_root, null);

  assert.throws(
    () => locateInstalledPackage({ packageId: 'custom-media-assets', asset: '../escape', env, runner }),
    /escapes|contained/,
  );
  assert.throws(
    () => locateInstalledPackage({ packageId: 'custom-media-assets', asset: 'assets/escape.txt', env, runner }),
    /symlink escapes/,
  );
});

test('packages locate CLI is registry-backed and handles missing packages', async () => {
  const help = (await runCliReadOnly(['help', 'packages', 'locate'])).help;
  assert.equal(help.command, 'packages locate');
  assert.equal(help.registry.command_id, 'packages locate');

  const located = runCli(['packages', 'locate', 'does-not-exist-pkg']).opl_package_location;
  assert.equal(located.package_id, 'does-not-exist-pkg');
  assert.equal(located.found, false);

  const failure = runCliFailure(['packages', 'locate']);
  assert.equal(failure.payload.error.code, 'cli_usage_error');
});
