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
        codex_default_profile: {
          model_provider: string;
          model: string;
          model_reasoning_effort: string;
          base_url: string;
          base_url_role: string;
          model_profile_role: string;
        };
        webui_docker_image: {
          image: string;
          aliases: string[];
          package_publish_owner: string;
          framework_role: string;
          framework_workflow_publish_status: string;
        };
        native_helper: {
          image: string;
          channel_status: string;
          package_publish_owner: string;
          target_tag_template: string;
        };
        modules: Record<string, {
          artifact: string;
          package_channel_status: string;
          remote_publish_status: string;
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
    output.packages_manifest.packages.webui_docker_image.package_publish_owner,
    'one-person-lab-app',
  );
  assert.equal(
    output.packages_manifest.packages.webui_docker_image.framework_role,
    'external_app_owned_package_reference',
  );
  assert.equal(
    output.packages_manifest.packages.webui_docker_image.framework_workflow_publish_status,
    'not_published_by_framework_packages_workflow',
  );
  assert.equal(
    output.packages_manifest.packages.native_helper.channel_status,
    'active_ghcr_oci_prebuild',
  );
  assert.equal(
    output.packages_manifest.packages.native_helper.package_publish_owner,
    'one-person-lab_framework_native_helper_prebuilds',
  );
  assert.equal(
    output.packages_manifest.packages.native_helper.target_tag_template,
    'ghcr.io/gaofeng21cn/one-person-lab-native-helper:<target>-<native_helper_version>',
  );
  assert.equal(output.packages_manifest.packages.codex_default_profile.model_provider, 'gflab');
  assert.equal(output.packages_manifest.packages.codex_default_profile.model, 'gpt-5.5');
  assert.equal(output.packages_manifest.packages.codex_default_profile.model_reasoning_effort, 'xhigh');
  assert.equal(output.packages_manifest.packages.codex_default_profile.base_url, 'https://gflabtoken.cn/v1');
  assert.equal(
    output.packages_manifest.packages.codex_default_profile.base_url_role,
    'product_default_provider_endpoint',
  );
  assert.equal(
    output.packages_manifest.packages.codex_default_profile.model_profile_role,
    'maintainer_current_initial_profile',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.artifact,
    'ghcr.io/gaofeng21cn/one-person-lab-modules/med-autoscience:26.4.27',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.package_channel_status,
    'experimental_manual_prepared_only',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.remote_publish_status,
    'not_auto_published_by_tag_push',
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
  assert.equal(Object.hasOwn(output.packages_manifest.packages.modules, 'meddeepscientist'), false);
  assert.equal(
    output.packages_manifest.packages.modules.redcube.install_strategy,
    'extract_to_managed_modules_root',
  );
  assert.equal(
    output.packages_manifest.packages.modules.oplmetaagent.artifact,
    'ghcr.io/gaofeng21cn/one-person-lab-modules/opl-meta-agent:26.4.27',
  );
  assert.equal(
    output.packages_manifest.packages.modules.oplmetaagent.remote_publish_status,
    'source_listed_remote_package_unpublished',
  );
  assert.equal(
    output.packages_manifest.packages.modules.oplmetaagent.fallback_git.repo_url,
    'https://github.com/gaofeng21cn/opl-meta-agent.git',
  );
});

test('package archive builder writes channel manifest checksums git source and release discipline gate', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-out-'));
  const previousManifest = path.join(outDir, 'previous-manifest.json');
  fs.writeFileSync(previousManifest, JSON.stringify({ opl_version: '26.4.30' }), 'utf8');

  const fixtures = {
    medautoscience: createGitModuleRemoteFixture('med-autoscience'),
    medautogrant: createGitModuleRemoteFixture('med-autogrant'),
    redcube: createGitModuleRemoteFixture('redcube-ai'),
    oplmetaagent: createGitModuleRemoteFixture('opl-meta-agent'),
  };

  const archiveBuilderOutput = execFileSync(process.execPath, [
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
      OPL_MODULE_PATH_MEDAUTOGRANT: fixtures.medautogrant.sourceRoot,
      OPL_MODULE_PATH_REDCUBE: fixtures.redcube.sourceRoot,
      OPL_MODULE_PATH_OPLMETAAGENT: fixtures.oplmetaagent.sourceRoot,
    },
  });
  const archiveBuilderResult = JSON.parse(archiveBuilderOutput) as {
    clone_root: string;
    modules_dir: string;
  };

  const releaseManifestPath = path.join(outDir, 'opl-release-manifest.json');
  const channelManifestPath = path.join(outDir, 'opl-channel-manifest.json');
  const checksumsPath = path.join(outDir, 'SHA256SUMS');
  const defaultCloneRoot = path.join(path.dirname(outDir), `${path.basename(outDir)}-package-sources`);
  const manifest = JSON.parse(fs.readFileSync(releaseManifestPath, 'utf8'));
  const channelManifest = JSON.parse(fs.readFileSync(channelManifestPath, 'utf8'));
  const checksums = fs.readFileSync(checksumsPath, 'utf8');
  const relativeCloneRootFromOutDir = path.relative(outDir, archiveBuilderResult.clone_root);

  assert.equal(archiveBuilderResult.clone_root, defaultCloneRoot);
  assert.equal(archiveBuilderResult.modules_dir, path.join(outDir, 'modules'));
  assert.equal(relativeCloneRootFromOutDir === '' || !relativeCloneRootFromOutDir.startsWith('..'), false);
  assert.equal(path.relative(repoRoot, archiveBuilderResult.clone_root).startsWith('..'), true);
  assert.equal(channelManifest.opl_version, manifest.opl_version);
  assert.equal(channelManifest.packages.codex_default_profile.model_provider, 'gflab');
  assert.equal(channelManifest.packages.codex_default_profile.base_url, 'https://gflabtoken.cn/v1');
  assert.equal(channelManifest.packages.codex_default_profile.base_url_role, 'product_default_provider_endpoint');
  assert.equal(channelManifest.packages.codex_default_profile.model_profile_role, 'maintainer_current_initial_profile');
  assert.equal(JSON.stringify(channelManifest.packages.codex_default_profile).includes('experimental_bearer_token'), false);
  assert.equal(manifest.release_automation.rollback.previous_version, '26.4.30');
  assert.equal(manifest.release_automation.cleanup.retain_versions, 4);
  assert.equal(manifest.release_automation.status, 'manual_prepared_only_not_consumed_by_module_install_update');
  assert.equal(manifest.release_automation.workflow_trigger_policy, 'workflow_dispatch_only');
  assert.equal(manifest.release_automation.remote_publish_status, 'not_auto_published_by_tag_push');
  assert.equal(manifest.release_automation.release_manifest_publication_status, 'artifact_only_not_ghcr_active_channel');
  assert.equal(manifest.packages.webui_docker_image.framework_workflow_publish_status, 'not_published_by_framework_packages_workflow');
  assert.equal(manifest.packages.native_helper.channel_status, 'active_ghcr_oci_prebuild');
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.rollback.version,
    '26.4.30',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.package_channel_status,
    'experimental_manual_prepared_only',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.workflow_trigger_policy,
    'workflow_dispatch_only',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.source_git.head_sha,
    fixtures.medautoscience.getHeadSha(),
  );
  assert.match(manifest.packages.modules.medautoscience.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    manifest.packages.modules.oplmetaagent.source_git.head_sha,
    fixtures.oplmetaagent.getHeadSha(),
  );
  assert.equal(
    manifest.packages.modules.oplmetaagent.remote_publish_status,
    'source_listed_remote_package_unpublished',
  );
  assert.match(manifest.packages.modules.oplmetaagent.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.match(checksums, /med-autoscience-26\.4\.31\.tar\.gz/);
  assert.match(checksums, /opl-meta-agent-26\.4\.31\.tar\.gz/);
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

test('package archive builder refreshes reused managed clones before archiving source', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-refresh-out-'));
  const cloneRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-refresh-clones-'));
  const gitConfigPath = path.join(os.tmpdir(), `opl-package-refresh-git-${Date.now()}.config`);

  const fixtures = {
    medautoscience: createGitModuleRemoteFixture('med-autoscience'),
    medautogrant: createGitModuleRemoteFixture('med-autogrant'),
    redcube: createGitModuleRemoteFixture('redcube-ai'),
    oplmetaagent: createGitModuleRemoteFixture('opl-meta-agent'),
  };
  fs.writeFileSync(
    gitConfigPath,
    [
      `[url "${fixtures.medautoscience.remoteRoot}"]`,
      '\tinsteadOf = https://github.com/gaofeng21cn/med-autoscience.git',
      '',
    ].join('\n'),
    'utf8',
  );

  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: gitConfigPath,
    OPL_MODULE_PATH_MEDAUTOGRANT: fixtures.medautogrant.sourceRoot,
    OPL_MODULE_PATH_REDCUBE: fixtures.redcube.sourceRoot,
    OPL_MODULE_PATH_OPLMETAAGENT: fixtures.oplmetaagent.sourceRoot,
  };

  execFileSync(process.execPath, [
    '--experimental-strip-types',
    path.join(repoRoot, 'scripts/package-module-archives.mjs'),
    '--version',
    '26.4.32',
    '--owner',
    'gaofeng21cn',
    '--out-dir',
    outDir,
    '--clone-root',
    cloneRoot,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });
  const advancedHead = fixtures.medautoscience.advance('CHANGELOG.md', 'fresh source\n', 'Advance module source');

  execFileSync(process.execPath, [
    '--experimental-strip-types',
    path.join(repoRoot, 'scripts/package-module-archives.mjs'),
    '--version',
    '26.4.32',
    '--owner',
    'gaofeng21cn',
    '--out-dir',
    outDir,
    '--clone-root',
    cloneRoot,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  });

  const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'opl-release-manifest.json'), 'utf8'));
  assert.equal(manifest.packages.modules.medautoscience.source_git.head_sha, advancedHead);
});

test('framework packages workflow only prepares manual package artifacts', () => {
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/packages.yml'), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n  push:\n/);
  assert.doesNotMatch(workflow, /webui-image:/);
  assert.doesNotMatch(workflow, /oras push/);
  assert.doesNotMatch(workflow, /docker\/build-push-action/);
  assert.doesNotMatch(workflow, /one-person-lab-webui/);
  assert.doesNotMatch(workflow, /one-person-lab-manifest:\$\{OPL_RELEASE_VERSION\}/);
  assert.match(workflow, /Upload prepared package artifacts/);
});

test('release discipline fails closed when workflow restores package or WebUI publishing', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-discipline-root-'));
  const workflowPath = path.join(tempRoot, '.github', 'workflows', 'packages.yml');
  const manifestPath = path.join(tempRoot, 'opl-release-manifest.json');
  const manifest = (runCli(['packages', 'manifest'], {
    OPL_RELEASE_VERSION: '26.4.35',
    OPL_PACKAGES_OWNER: 'gaofeng21cn',
  }) as { packages_manifest: unknown }).packages_manifest;

  fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    workflowPath,
    [
      'name: Publish OPL Packages',
      'on:',
      '  workflow_dispatch:',
      '  push:',
      '    tags:',
      "      - 'v*'",
      'jobs:',
      '  module-packages:',
      '    steps:',
      '      - run: oras push "ghcr.io/example/one-person-lab-manifest:${OPL_RELEASE_VERSION}"',
      '  webui-image:',
      '    steps:',
      '      - uses: docker/build-push-action@v6',
      '        with:',
      '          tags: ghcr.io/example/one-person-lab-webui:latest',
      '',
    ].join('\n'),
    'utf8',
  );

  assert.throws(
    () => execFileSync(process.execPath, [
      path.join(repoRoot, 'scripts/package-release-discipline.mjs'),
      '--manifest',
      manifestPath,
    ], {
      cwd: tempRoot,
      encoding: 'utf8',
    }),
    /package workflow must not restore tag-push publishing/,
  );
});
