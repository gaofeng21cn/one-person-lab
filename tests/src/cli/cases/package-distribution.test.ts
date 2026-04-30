import { execFileSync } from 'node:child_process';

import { assert, createGitModuleRemoteFixture, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

test('packages manifest exposes package coordinates while marking module install updates as git-checkout based', () => {
  const output = runCli(['packages', 'manifest'], {
    OPL_RELEASE_VERSION: '26.4.27',
    OPL_PACKAGES_OWNER: 'gaofeng21cn',
    OPL_RELEASE_CHANNEL: 'stable',
  }) as {
    packages_manifest: {
      opl_version: string;
      release_channel: string;
      module_install_update_source: string;
      package_consumption_status: string;
      release_automation: {
        channel_manifest: {
          outputs: {
            channel_manifest: string;
            checksums: string;
          };
        };
        rollback: { strategy: string };
        cleanup: { strategy: string; retain_versions: number };
      };
      packages: {
        webui_docker_image: { image: string; aliases: string[] };
        native_helper: { image: string; target_tag_template: string };
        modules: Record<string, {
          artifact: string;
          package_consumption_status: string;
          current_install_update_source: string;
          fallback_git: { repo_url: string; ref: string };
          release_discipline: {
            current_latest_source: string;
            future_package_latest_source: string;
            required_gates: string[];
          };
          install_strategy: string;
          dependency_of: string[];
        }>;
      };
    };
  };

  assert.equal(output.packages_manifest.opl_version, '26.4.27');
  assert.equal(output.packages_manifest.release_channel, 'stable');
  assert.equal(output.packages_manifest.module_install_update_source, 'git_checkout');
  assert.equal(
    output.packages_manifest.package_consumption_status,
    'packages_defined_not_consumed_by_install_update',
  );
  assert.equal(output.packages_manifest.release_automation.channel_manifest.outputs.channel_manifest, 'opl-channel-manifest.json');
  assert.equal(output.packages_manifest.release_automation.channel_manifest.outputs.checksums, 'SHA256SUMS');
  assert.equal(output.packages_manifest.release_automation.rollback.strategy, 'previous_channel_manifest_target');
  assert.equal(
    output.packages_manifest.release_automation.cleanup.strategy,
    'retain_latest_n_versions_and_declared_rollbacks',
  );
  assert.equal(output.packages_manifest.release_automation.cleanup.retain_versions, 3);
  assert.equal(
    output.packages_manifest.packages.webui_docker_image.image,
    'ghcr.io/gaofeng21cn/one-person-lab-webui:26.4.27',
  );
  assert.equal(
    output.packages_manifest.packages.native_helper.target_tag_template,
    'ghcr.io/gaofeng21cn/one-person-lab-native-helper:<target>-<native_helper_version>',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.artifact,
    'ghcr.io/gaofeng21cn/one-person-lab-modules/med-autoscience:26.4.27',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.package_consumption_status,
    'defined_not_consumed_by_install_update',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.current_install_update_source,
    'git_checkout',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.release_discipline.current_latest_source,
    'git_checkout_upstream_default_branch',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.release_discipline.future_package_latest_source,
    'opl_release_channel_manifest',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.release_discipline.required_gates.includes(
      'sha256_recorded',
    ),
    true,
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.fallback_git.repo_url,
    'https://github.com/gaofeng21cn/med-autoscience.git',
  );
  assert.deepEqual(output.packages_manifest.packages.modules.meddeepscientist.dependency_of, ['medautoscience']);
  assert.equal(
    output.packages_manifest.packages.modules.redcube.install_strategy,
    'extract_to_managed_modules_root',
  );
});

test('package archive builder writes channel manifest checksums git source and release discipline gate', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-out-'));
  const previousManifest = path.join(outDir, 'previous-manifest.json');
  fs.writeFileSync(previousManifest, JSON.stringify({ opl_version: '26.4.30' }), 'utf8');

  const fixtures = {
    medautoscience: createGitModuleRemoteFixture('med-autoscience'),
    meddeepscientist: createGitModuleRemoteFixture('med-deepscientist'),
    medautogrant: createGitModuleRemoteFixture('med-autogrant'),
    redcube: createGitModuleRemoteFixture('redcube-ai'),
  };

  execFileSync(process.execPath, [
    '--experimental-strip-types',
    path.join(repoRoot, 'scripts/package-module-archives.mjs'),
    '--version',
    '26.4.31',
    '--owner',
    'gaofeng21cn',
    '--out-dir',
    outDir,
    '--previous-manifest',
    previousManifest,
    '--retain-versions',
    '4',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      OPL_MODULE_PATH_MEDAUTOSCIENCE: fixtures.medautoscience.sourceRoot,
      OPL_MODULE_PATH_MEDDEEPSCIENTIST: fixtures.meddeepscientist.sourceRoot,
      OPL_MODULE_PATH_MEDAUTOGRANT: fixtures.medautogrant.sourceRoot,
      OPL_MODULE_PATH_REDCUBE: fixtures.redcube.sourceRoot,
    },
  });

  const releaseManifestPath = path.join(outDir, 'opl-release-manifest.json');
  const channelManifestPath = path.join(outDir, 'opl-channel-manifest.json');
  const checksumsPath = path.join(outDir, 'SHA256SUMS');
  const manifest = JSON.parse(fs.readFileSync(releaseManifestPath, 'utf8'));
  const channelManifest = JSON.parse(fs.readFileSync(channelManifestPath, 'utf8'));
  const checksums = fs.readFileSync(checksumsPath, 'utf8');

  assert.equal(channelManifest.opl_version, manifest.opl_version);
  assert.equal(manifest.release_automation.rollback.previous_version, '26.4.30');
  assert.equal(manifest.release_automation.cleanup.retain_versions, 4);
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.rollback.version,
    '26.4.30',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.source_git.head_sha,
    fixtures.medautoscience.getHeadSha(),
  );
  assert.match(manifest.packages.modules.medautoscience.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.match(checksums, /med-autoscience-26\.4\.31\.tar\.gz/);
  assert.match(checksums, new RegExp(manifest.packages.modules.medautoscience.source_archive.sha256));

  execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-release-discipline.mjs'),
    '--manifest',
    releaseManifestPath,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
});
