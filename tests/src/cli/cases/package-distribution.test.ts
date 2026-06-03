import { execFileSync } from 'node:child_process';

import { assert, createGitModuleRemoteFixture, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

test('packages manifest exposes active package-channel coordinates for module install updates', () => {
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
      developer_module_source_override: {
        env: string;
        scope: string;
        app_setting_surface: string;
      };
      release_automation: {
        status: string;
        package_lifecycle_status: string;
        workflow_trigger_policy: string;
        remote_publish_status: string;
        release_manifest_publication_status: string;
        release_manifest_package: {
          package_channel_status: string;
          publication_status: string;
          current_install_update_source: string;
          developer_override_source: string;
        };
        channel_manifest: {
          outputs: {
            channel_manifest: string;
            checksums: string;
          };
        };
        rollback: { strategy: string };
        cleanup: { strategy: string; retain_versions: number; protected_tags: string[]; execution_mode: string };
        daily_package_channel: {
          status: string;
          workflow: string;
          version_template: string;
          change_detector: string;
          comparison: string;
          no_change_behavior: string;
          publish_gate: string;
          manual_repair_trigger: string;
          force_publish_input: string;
        };
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
          publish_status_policy: {
            workflow: string;
            publication_mode: string;
            pull_restore_consumers: string[];
          };
          retention_policy: {
            strategy: string;
            retain_versions: number;
            protected_tags: string[];
            execution_mode: string;
          };
          required_gates: string[];
        };
        modules: Record<string, {
          artifact: string;
          package_channel_status: string;
          package_lifecycle_status: string;
          package_lifecycle_reason: string;
          remote_publish_status: string;
          package_consumption_status: string;
          current_install_update_source: string;
          developer_git_checkout_override: { repo_url: string; ref: string };
          release_discipline: {
            package_lifecycle_status: string;
            workflow_trigger_policy: string;
            current_latest_source: string;
            developer_override_source: string;
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
  assert.equal(output.packages_manifest.module_install_update_source, 'package_channel');
  assert.equal(
    output.packages_manifest.package_consumption_status,
    'stable_app_release_consumes_package_channel',
  );
  assert.equal(output.packages_manifest.developer_module_source_override.env, 'OPL_MODULE_SOURCE_MODE=git_checkout');
  assert.equal(output.packages_manifest.developer_module_source_override.scope, 'developer_mode_checkout');
  assert.equal(output.packages_manifest.developer_module_source_override.app_setting_surface, 'Developer Mode');
  assert.equal(output.packages_manifest.release_automation.channel_manifest.outputs.channel_manifest, 'opl-channel-manifest.json');
  assert.equal(output.packages_manifest.release_automation.channel_manifest.outputs.checksums, 'SHA256SUMS');
  assert.equal(output.packages_manifest.release_automation.rollback.strategy, 'previous_channel_manifest_target');
  assert.equal(
    output.packages_manifest.release_automation.cleanup.strategy,
    'retain_latest_n_versions_and_declared_rollbacks',
  );
  assert.equal(output.packages_manifest.release_automation.cleanup.retain_versions, 3);
  assert.equal(output.packages_manifest.release_automation.status, 'active_stable_package_channel');
  assert.equal(output.packages_manifest.release_automation.package_lifecycle_status, 'active_release_channel');
  assert.equal(output.packages_manifest.release_automation.workflow_trigger_policy, 'release_gate_workflow_call_or_manual_dispatch');
  assert.equal(output.packages_manifest.release_automation.remote_publish_status, 'release_gate_or_manual_dispatch_publishes_ghcr_packages');
  assert.equal(output.packages_manifest.release_automation.release_manifest_publication_status, 'active_ghcr_channel_manifest');
  assert.equal(
    output.packages_manifest.release_automation.release_manifest_package.package_channel_status,
    'active_release_channel',
  );
  assert.equal(
    output.packages_manifest.release_automation.release_manifest_package.publication_status,
    'published_to_ghcr_by_packages_workflow',
  );
  assert.equal(
    output.packages_manifest.release_automation.release_manifest_package.current_install_update_source,
    'opl_release_channel_manifest',
  );
  assert.equal(
    output.packages_manifest.release_automation.release_manifest_package.developer_override_source,
    'git_checkout',
  );
  assert.equal(
    output.packages_manifest.release_automation.cleanup.execution_mode,
    'dry_run_first_explicit_execute_required',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.status,
    'active_change_detected_daily_publish',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.workflow,
    '.github/workflows/daily-package-channel.yml',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.version_template,
    '<utc_yy.m.d>-nightly',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.change_detector,
    'scripts/package-channel-daily-check.mjs',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.comparison,
    'module_source_fingerprint',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.no_change_behavior,
    'skip_without_publish',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.publish_gate,
    'daily_package_channel_changed',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.manual_repair_trigger,
    'workflow_dispatch',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.force_publish_input,
    'force_publish',
  );
  assert.ok(output.packages_manifest.release_automation.cleanup.protected_tags.includes('latest'));
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
  assert.equal(
    output.packages_manifest.packages.native_helper.publish_status_policy.workflow,
    '.github/workflows/native-helper-prebuilds.yml',
  );
  assert.equal(
    output.packages_manifest.packages.native_helper.publish_status_policy.publication_mode,
    'active_ghcr_oci_prebuild',
  );
  assert.equal(
    output.packages_manifest.packages.native_helper.publish_status_policy.pull_restore_consumers.includes(
      'opl system repair-native-helpers',
    ),
    true,
  );
  assert.equal(
    output.packages_manifest.packages.native_helper.retention_policy.strategy,
    'retain_latest_n_versions_and_declared_rollbacks',
  );
  assert.equal(output.packages_manifest.packages.native_helper.retention_policy.retain_versions, 3);
  assert.ok(output.packages_manifest.packages.native_helper.retention_policy.protected_tags.includes('latest'));
  assert.equal(
    output.packages_manifest.packages.native_helper.retention_policy.execution_mode,
    'dry_run_first_explicit_execute_required',
  );
  assert.equal(
    output.packages_manifest.packages.native_helper.required_gates.includes('retention_policy_recorded'),
    true,
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
    'active_release_channel',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.package_lifecycle_status,
    'active_release_channel',
  );
  assert.match(
    output.packages_manifest.packages.modules.medautoscience.package_lifecycle_reason,
    /package-channel/,
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.remote_publish_status,
    'published_to_ghcr_by_packages_workflow',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.package_consumption_status,
    'consumed_by_package_channel_installs',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.current_install_update_source,
    'package_channel',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.release_discipline.current_latest_source,
    'opl_release_channel_manifest',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.release_discipline.developer_override_source,
    'git_checkout',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.release_discipline.workflow_trigger_policy,
    'release_gate_workflow_call_or_manual_dispatch',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.release_discipline.package_lifecycle_status,
    'active_release_channel',
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.release_discipline.required_gates.includes(
      'sha256_recorded',
    ),
    true,
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.release_discipline.required_gates.includes(
      'ghcr_module_artifact_published',
    ),
    true,
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.release_discipline.required_gates.includes(
      'developer_git_checkout_override_declared',
    ),
    true,
  );
  assert.equal(
    output.packages_manifest.packages.modules.medautoscience.developer_git_checkout_override.repo_url,
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
    'published_to_ghcr_by_packages_workflow',
  );
  assert.equal(
    output.packages_manifest.packages.modules.oplmetaagent.developer_git_checkout_override.repo_url,
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
  assert.ok(manifest.release_automation.cleanup.protected_tags.includes('latest'));
  assert.equal(manifest.release_automation.status, 'active_stable_package_channel');
  assert.equal(manifest.release_automation.package_lifecycle_status, 'active_release_channel');
  assert.equal(manifest.release_automation.workflow_trigger_policy, 'release_gate_workflow_call_or_manual_dispatch');
  assert.equal(manifest.release_automation.remote_publish_status, 'release_gate_or_manual_dispatch_publishes_ghcr_packages');
  assert.equal(manifest.release_automation.release_manifest_publication_status, 'active_ghcr_channel_manifest');
  assert.equal(manifest.release_automation.release_manifest_package.package_channel_status, 'active_release_channel');
  assert.equal(manifest.release_automation.daily_package_channel.status, 'active_change_detected_daily_publish');
  assert.equal(manifest.release_automation.daily_package_channel.no_change_behavior, 'skip_without_publish');
  assert.equal(manifest.release_automation.daily_package_channel.version_template, '<utc_yy.m.d>-nightly');
  assert.equal(manifest.release_automation.daily_package_channel.force_publish_input, 'force_publish');
  assert.equal(manifest.packages.webui_docker_image.framework_workflow_publish_status, 'not_published_by_framework_packages_workflow');
  assert.equal(manifest.packages.native_helper.channel_status, 'active_ghcr_oci_prebuild');
  assert.equal(manifest.packages.native_helper.retention_policy.retain_versions, 4);
  assert.ok(manifest.packages.native_helper.retention_policy.protected_tags.includes('latest'));
  assert.equal(manifest.packages.native_helper.required_gates.includes('ghcr_oci_archive_pushed'), true);
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.rollback.version,
    '26.4.30',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.package_channel_status,
    'active_release_channel',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.package_lifecycle_status,
    'active_release_channel',
  );
  assert.equal(
    manifest.packages.modules.medautoscience.release_discipline.workflow_trigger_policy,
    'release_gate_workflow_call_or_manual_dispatch',
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
    'published_to_ghcr_by_packages_workflow',
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

test('framework packages workflow is release-gated and manually repairable without WebUI publishing', () => {
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/packages.yml'), 'utf8');
  const releaseCallerWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/release-package-channel.yml'), 'utf8');
  const dailyPackageWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/daily-package-channel.yml'), 'utf8');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /workflow_call:/);
  assert.match(workflow, /release_gate:\s*\n\s*description: Release gate or workflow that authorized package publication/);
  assert.match(workflow, /version="\$\{version#v\}"/);
  assert.match(releaseCallerWorkflow, /release:\s*\n\s*types:\s*\n\s*-\s*published/);
  assert.match(releaseCallerWorkflow, /uses:\s+\.\/\.github\/workflows\/packages\.yml/);
  assert.match(releaseCallerWorkflow, /release_gate:\s*github_release_published/);
  assert.doesNotMatch(workflow, /\n  push:\n/);
  assert.doesNotMatch(workflow, /webui-image:/);
  assert.match(workflow, /oras push/);
  assert.match(workflow, /one-person-lab-modules/);
  assert.match(workflow, /one-person-lab-manifest:\$\{OPL_RELEASE_VERSION\}/);
  assert.match(workflow, /oras tag "ghcr\.io\/\$\{OPL_PACKAGES_OWNER\}\/one-person-lab-manifest:\$\{OPL_RELEASE_VERSION\}" stable/);
  assert.doesNotMatch(workflow, /docker\/build-push-action/);
  assert.doesNotMatch(workflow, /one-person-lab-webui/);
  assert.match(workflow, /Upload prepared package artifacts/);
  assert.match(dailyPackageWorkflow, /schedule:/);
  assert.match(dailyPackageWorkflow, /cron:/);
  assert.match(dailyPackageWorkflow, /base="\$\(date -u \+'%y\.%-m\.%-d'\)"/);
  assert.match(dailyPackageWorkflow, /\[\[ "\$base" == \*-nightly \]\]/);
  assert.match(dailyPackageWorkflow, /version="\$\{base\}-nightly"/);
  assert.match(dailyPackageWorkflow, /workflow_dispatch:/);
  assert.match(dailyPackageWorkflow, /force_publish:/);
  assert.match(dailyPackageWorkflow, /npm run packages:manifest/);
  assert.match(dailyPackageWorkflow, /npm run packages:daily-check/);
  assert.match(dailyPackageWorkflow, /one-person-lab-manifest:stable/);
  assert.match(dailyPackageWorkflow, /test -n "\$current"/);
  assert.match(dailyPackageWorkflow, /args\+=\(--current-manifest "\$\{\{ steps\.current\.outputs\.current_manifest \}\}"\)/);
  assert.match(dailyPackageWorkflow, /uses:\s+\.\/\.github\/workflows\/packages\.yml/);
  assert.match(dailyPackageWorkflow, /release_gate:\s*daily_package_channel_changed/);
  assert.match(dailyPackageWorkflow, /publish_required == 'true'/);
  assert.match(dailyPackageWorkflow, /publish_required="true"/);
  assert.doesNotMatch(dailyPackageWorkflow, /\n\s*push:\n/);
  assert.doesNotMatch(dailyPackageWorkflow, /one-person-lab-webui/);
});

function writeFakeGh(tempRoot: string, packageVersions: Record<string, unknown[]>, missingPackages = new Set<string>()) {
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const ghPath = path.join(binDir, 'gh');
  fs.writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
function decodePackageFromPath(raw) {
  const match = String(raw).match(/\\/packages\\/container\\/([^/]+)\\/versions/);
  return match ? decodeURIComponent(match[1]) : '';
}
if (args[0] === 'api' && args.includes('--jq')) {
  const packageName = decodePackageFromPath(args.find((arg) => String(arg).includes('/packages/container/')));
  const missing = new Set(JSON.parse(process.env.FAKE_MISSING_PACKAGES_JSON || '[]'));
  if (missing.has(packageName)) process.exit(1);
  const versions = JSON.parse(process.env.FAKE_PACKAGE_VERSIONS_JSON || '{}')[packageName] || [];
  for (const version of versions) {
    process.stdout.write(JSON.stringify(version));
    process.stdout.write('\\n');
  }
  process.exit(0);
}
if (args[0] === 'api' && args.includes('-X') && args.includes('DELETE')) {
  fs.appendFileSync(process.env.FAKE_GH_LOG, JSON.stringify(args) + '\\n');
  process.exit(0);
}
console.error('unexpected gh args: ' + JSON.stringify(args));
process.exit(2);
`,
    'utf8',
  );
  fs.chmodSync(ghPath, 0o755);
  return {
    binDir,
    env: {
      FAKE_PACKAGE_VERSIONS_JSON: JSON.stringify(packageVersions),
      FAKE_MISSING_PACKAGES_JSON: JSON.stringify([...missingPackages]),
    },
  };
}

test('GHCR package cleanup dry-runs active native helper and active package-channel packages', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-ghcr-cleanup-'));
  const packageVersions = {
    'one-person-lab-native-helper': [
      { id: 1, updated_at: '2026-06-01T00:00:00Z', metadata: { container: { tags: ['darwin-arm64-0.1.0'] } } },
      { id: 2, updated_at: '2026-05-31T00:00:00Z', metadata: { container: { tags: ['linux-x64-0.1.0'] } } },
      { id: 3, updated_at: '2026-05-30T00:00:00Z', metadata: { container: { tags: ['windows-x64-0.1.0'] } } },
      { id: 4, updated_at: '2026-05-20T00:00:00Z', metadata: { container: { tags: ['old-0.0.9'] } } },
      { id: 5, updated_at: '2026-05-19T00:00:00Z', metadata: { container: { tags: ['latest'] } } },
    ],
    'one-person-lab-modules/med-autoscience': [
      { id: 11, updated_at: '2026-05-06T00:00:00Z', metadata: { container: { tags: ['26.5.6'] } } },
      { id: 12, updated_at: '2026-05-02T00:00:00Z', metadata: { container: { tags: ['26.5.2-a'] } } },
      { id: 13, updated_at: '2026-05-01T00:00:00Z', metadata: { container: { tags: ['26.5.1'] } } },
      { id: 14, updated_at: '2026-04-30T00:00:00Z', metadata: { container: { tags: ['26.4.30'] } } },
      { id: 15, updated_at: '2026-04-29T00:00:00Z', metadata: { container: { tags: ['stable'] } } },
    ],
    'one-person-lab-modules/med-autogrant': [],
    'one-person-lab-modules/redcube-ai': [],
    'one-person-lab-manifest': [
      { id: 21, updated_at: '2026-05-06T00:00:00Z', metadata: { container: { tags: ['26.5.6'] } } },
      { id: 22, updated_at: '2026-05-02T00:00:00Z', metadata: { container: { tags: ['26.5.2-a'] } } },
      { id: 23, updated_at: '2026-05-01T00:00:00Z', metadata: { container: { tags: ['26.5.1'] } } },
      { id: 24, updated_at: '2026-04-30T00:00:00Z', metadata: { container: { tags: ['26.4.30'] } } },
    ],
  };
  const { binDir, env } = writeFakeGh(tempRoot, packageVersions, new Set(['one-person-lab-modules/opl-meta-agent']));
  const summaryPath = path.join(tempRoot, 'summary.json');
  const logPath = path.join(tempRoot, 'gh.log');

  const result = execFileSync(process.execPath, [
    '--experimental-strip-types',
    'scripts/cleanup-ghcr-package-versions.mjs',
    '--owner',
    'owner',
    '--summary-path',
    summaryPath,
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
      FAKE_GH_LOG: logPath,
    },
  });

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  assert.match(result, /opl_framework_ghcr_package_cleanup\.v1/);
  assert.equal(summary.status, 'dry_run');
  assert.equal(fs.existsSync(logPath), false);
  const nativeHelper = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-native-helper');
  assert.deepEqual(nativeHelper.protected_version_ids, [1, 2, 3, 5]);
  assert.deepEqual(nativeHelper.candidates.map((candidate: { id: number }) => candidate.id), [4]);
  const mas = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-modules/med-autoscience');
  assert.equal(mas.package_kind, 'active_module_package');
  assert.equal(mas.lifecycle_status, 'active_release_channel');
  assert.deepEqual(mas.protected_version_ids, [11, 12, 13, 15]);
  assert.deepEqual(mas.candidates.map((candidate: { id: number }) => candidate.id), [14]);
  const manifest = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-manifest');
  assert.equal(manifest.package_kind, 'active_channel_manifest');
  assert.equal(manifest.lifecycle_status, 'active_release_channel');
  const missing = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-modules/opl-meta-agent');
  assert.equal(missing.status, 'not_found_or_unreadable');
});

test('release discipline fails closed when workflow restores tag-push or WebUI publishing', () => {
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
      '  workflow_call:',
      '    inputs:',
      '      opl_version:',
      '        required: true',
      '        type: string',
      '      release_gate:',
      '        required: true',
      '        type: string',
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
