import { execFileSync } from 'node:child_process';

import { assert, createGitModuleRemoteFixture, fs, os, parseJsonText, path, repoRoot, runCli, test } from '../helpers.ts';
import { canonicalAgentPackageId } from '../../../../src/modules/connect/agent-package-identity.ts';
import { normalizeFirstPartyAgentPackageManifest } from '../../../../src/modules/connect/agent-package-manifests.ts';

test('packages manifest exposes active package-channel coordinates for module install updates', () => {
  const output = runCli(['connect', 'packages', 'manifest'], {
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
        framework_core: {
          package_name: string;
          artifact: string;
          package_consumption_status: string;
          current_install_update_source: string;
          release_discipline: { required_gates: string[] };
        };
        modules: Record<string, {
          artifact: string;
          scope: string;
          codex_standalone_distribution: null | {
            distribution_shape: string;
            plugin_id: string;
            required_skill_ids: string[];
            bundled_capability_package_ids: string[];
            distribution_payload: {
              oci_ref: string;
              payload_digest_ref: string;
              rolling_tag: string;
              install_truth: string;
              live_download_proof: boolean;
              installed_reload_proof: boolean;
            };
            user_install_action_count: number;
          };
          capability_dependencies: Array<Record<string, any>>;
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
    'ordinary_app_users_consume_managed_ghcr_capability_packages',
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
  assert.equal(output.packages_manifest.release_automation.status, 'active_managed_ghcr_capability_packages');
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
    'package_source_fingerprint',
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
  assert.equal(Object.hasOwn(output.packages_manifest.packages, 'webui_docker_image'), false);
  assert.equal(output.packages_manifest.packages.framework_core.package_name, 'one-person-lab-framework');
  assert.equal(output.packages_manifest.packages.framework_core.artifact, 'ghcr.io/gaofeng21cn/one-person-lab-framework:26.4.27');
  assert.equal(output.packages_manifest.packages.framework_core.package_consumption_status, 'consumed_by_runtime_substrate_updates');
  assert.equal(output.packages_manifest.packages.framework_core.current_install_update_source, 'opl_release_channel_manifest');
  assert.equal(
    output.packages_manifest.packages.framework_core.release_discipline.required_gates.includes('runtime_substrate_apply_and_rollback_tested'),
    true,
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
  assert.deepEqual(
    output.packages_manifest.packages.modules.medautoscience.capability_dependencies.map((dependency) => ({
      module_id: dependency.module_id,
      package_id: dependency.package_id,
      kind: dependency.kind,
      codex_distribution: dependency.codex_distribution,
      opl_distribution: dependency.opl_distribution,
      developer_distribution: dependency.developer_distribution,
      install_owner: dependency.install_owner,
      install_update_source: dependency.install_update_source,
      sync_scopes: dependency.sync_scopes,
      authority_boundary: dependency.authority_boundary,
    })),
    [
      {
        module_id: 'scholarskills',
        package_id: 'mas-scholar-skills',
        kind: 'framework_capability_package',
        codex_distribution: 'bundled',
        opl_distribution: 'managed_dependency',
        developer_distribution: 'source_checkout',
        install_owner: 'one-person-lab',
        install_update_source: 'ghcr_capability_packages_channel',
        sync_scopes: ['workspace', 'quest'],
        authority_boundary: {
          can_write_domain_truth: false,
          can_sign_owner_receipt: false,
          can_create_typed_blocker: false,
          can_write_runtime_queue: false,
        },
      },
    ],
  );
  assert.deepEqual(
    output.packages_manifest.packages.modules.medautoscience.codex_standalone_distribution,
    {
      distribution_shape: 'self_contained_fat_plugin',
      plugin_id: 'mas',
      required_skill_ids: ['mas', 'mas-scholar-skills'],
      bundled_capability_package_ids: ['mas-scholar-skills'],
      distribution_payload: {
        payload_kind: 'ghcr_oci_agent_package',
        payload_ref: 'ghcr.io/gaofeng21cn/opl-agent-med-autoscience:latest',
        payload_digest_ref: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
        required_skill_pack_lock_refs: [
          'opl://agent-package-lock/mas-scholar-skills/0.1.0a4/managed-ghcr-capability-package',
        ],
        proof_status: 'non_live_contract_fixture',
        live_download_proof: false,
        installed_reload_proof: false,
        oci_ref: 'ghcr.io/gaofeng21cn/opl-agent-med-autoscience:latest',
        oci_media_type: 'application/vnd.oci.image.manifest.v1+json',
        immutable_tag: '0.1.0a4',
        rolling_tag: 'latest',
        promotion_policy: 'daily_candidate_gates_then_promote_latest',
        install_truth: 'resolved_digest_lock',
      },
      user_install_action_count: 1,
    },
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
  assert.equal(
    output.packages_manifest.packages.modules.scholarskills.artifact,
    'ghcr.io/gaofeng21cn/one-person-lab-modules/mas-scholar-skills:26.4.27',
  );
  assert.equal(
    output.packages_manifest.packages.modules.scholarskills.scope,
    'framework_capability_package',
  );
  assert.equal(
    output.packages_manifest.packages.modules.scholarskills.current_install_update_source,
    'package_channel',
  );
  assert.equal(
    output.packages_manifest.packages.modules.scholarskills.developer_git_checkout_override.repo_url,
    'https://github.com/gaofeng21cn/mas-scholar-skills.git',
  );
  assert.deepEqual(output.packages_manifest.packages.modules.scholarskills.dependency_of, ['medautoscience']);
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
    scholarskills: createGitModuleRemoteFixture('mas-scholar-skills'),
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
      OPL_MODULE_PATH_SCHOLARSKILLS: fixtures.scholarskills.sourceRoot,
    },
  });
  const archiveBuilderResult = parseJsonText(archiveBuilderOutput) as {
    clone_root: string;
    modules_dir: string;
    framework_dir: string;
    release_discipline_workflows: string[];
  };

  const releaseManifestPath = path.join(outDir, 'opl-release-manifest.json');
  const channelManifestPath = path.join(outDir, 'opl-channel-manifest.json');
  const checksumsPath = path.join(outDir, 'SHA256SUMS');
  const defaultCloneRoot = path.join(path.dirname(outDir), `${path.basename(outDir)}-package-sources`);
  const manifest = parseJsonText(fs.readFileSync(releaseManifestPath, 'utf8')) as any;
  const channelManifest = parseJsonText(fs.readFileSync(channelManifestPath, 'utf8')) as any;
  const releaseManifestSource = fs.readFileSync(releaseManifestPath, 'utf8');
  const channelManifestSource = fs.readFileSync(channelManifestPath, 'utf8');
  const checksums = fs.readFileSync(checksumsPath, 'utf8');
  const relativeCloneRootFromOutDir = path.relative(outDir, archiveBuilderResult.clone_root);

  assert.equal(archiveBuilderResult.clone_root, defaultCloneRoot);
  assert.equal(archiveBuilderResult.modules_dir, path.join(outDir, 'modules'));
  assert.equal(archiveBuilderResult.framework_dir, path.join(outDir, 'framework'));
  assert.deepEqual(archiveBuilderResult.release_discipline_workflows, [
    '.github/workflows/packages.yml',
    '.github/workflows/release-package-channel.yml',
    '.github/workflows/daily-package-channel.yml',
  ]);
  assert.equal(fs.existsSync(path.join(outDir, '.github/workflows/packages.yml')), true);
  assert.equal(fs.existsSync(path.join(outDir, '.github/workflows/release-package-channel.yml')), true);
  assert.equal(fs.existsSync(path.join(outDir, '.github/workflows/daily-package-channel.yml')), true);
  assert.equal(relativeCloneRootFromOutDir === '' || !relativeCloneRootFromOutDir.startsWith('..'), false);
  assert.equal(path.relative(repoRoot, archiveBuilderResult.clone_root).startsWith('..'), true);
  assert.equal(channelManifest.opl_version, manifest.opl_version);
  assert.equal(channelManifest.manifest_role, 'opl_release_channel_manifest');
  assert.notEqual(channelManifestSource, releaseManifestSource);
  assert.equal(channelManifest.packages.codex_default_profile.model_provider, 'gflab');
  assert.equal(channelManifest.packages.codex_default_profile.base_url, 'https://gflabtoken.cn/v1');
  assert.equal(channelManifest.packages.codex_default_profile.base_url_role, 'product_default_provider_endpoint');
  assert.equal(channelManifest.packages.codex_default_profile.model_profile_role, 'maintainer_current_initial_profile');
  assert.equal(JSON.stringify(channelManifest.packages.codex_default_profile).includes('experimental_bearer_token'), false);
  assert.equal(manifest.release_automation.rollback.previous_version, '26.4.30');
  assert.equal(manifest.release_automation.cleanup.retain_versions, 4);
  assert.ok(manifest.release_automation.cleanup.protected_tags.includes('latest'));
  assert.equal(manifest.release_automation.status, 'active_managed_ghcr_capability_packages');
  assert.equal(manifest.release_automation.package_lifecycle_status, 'active_release_channel');
  assert.equal(manifest.release_automation.workflow_trigger_policy, 'release_gate_workflow_call_or_manual_dispatch');
  assert.equal(manifest.release_automation.remote_publish_status, 'release_gate_or_manual_dispatch_publishes_ghcr_packages');
  assert.equal(manifest.release_automation.release_manifest_publication_status, 'active_ghcr_channel_manifest');
  assert.equal(manifest.release_automation.release_manifest_package.package_channel_status, 'active_release_channel');
  assert.equal(manifest.release_automation.daily_package_channel.status, 'active_change_detected_daily_publish');
  assert.equal(manifest.release_automation.daily_package_channel.no_change_behavior, 'skip_without_publish');
  assert.equal(manifest.release_automation.daily_package_channel.version_template, '<utc_yy.m.d>-nightly');
  assert.equal(manifest.release_automation.daily_package_channel.force_publish_input, 'force_publish');
  assert.equal(Object.hasOwn(manifest.packages, 'webui_docker_image'), false);
  assert.equal(manifest.packages.framework_core.artifact, 'ghcr.io/gaofeng21cn/one-person-lab-framework:26.4.31');
  assert.match(manifest.packages.framework_core.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.match(manifest.packages.framework_core.source_git.head_sha, /^[0-9a-f]{40}$/);
  assert.equal(channelManifest.packages.framework_core.artifact, manifest.packages.framework_core.artifact);
  assert.match(checksums, /one-person-lab-framework-26\.4\.31\.tar\.gz/);
  assert.match(checksums, new RegExp(manifest.packages.framework_core.source_archive.sha256));
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
  assert.equal(
    manifest.packages.modules.medautoscience.capability_dependencies[0].package_id,
    'mas-scholar-skills',
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
  assert.equal(
    manifest.packages.modules.scholarskills.source_git.head_sha,
    fixtures.scholarskills.getHeadSha(),
  );
  assert.equal(manifest.packages.modules.scholarskills.scope, 'framework_capability_package');
  assert.deepEqual(manifest.packages.modules.scholarskills.dependency_of, ['medautoscience']);
  assert.match(manifest.packages.modules.scholarskills.source_archive.sha256, /^[0-9a-f]{64}$/);
  assert.match(checksums, /med-autoscience-26\.4\.31\.tar\.gz/);
  assert.match(checksums, /opl-meta-agent-26\.4\.31\.tar\.gz/);
  assert.match(checksums, /mas-scholar-skills-26\.4\.31\.tar\.gz/);
  assert.match(checksums, new RegExp(manifest.packages.modules.medautoscience.source_archive.sha256));

  execFileSync(process.execPath, [
    path.join(repoRoot, 'scripts/package-release-discipline.mjs'),
    '--manifest',
    releaseManifestPath,
  ], {
    cwd: os.tmpdir(),
    encoding: 'utf8',
  });
});

test('MAS first-party agent package manifest declares standalone bundle and OPL managed dependency from one source', () => {
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-packages/mas.json'),
    'utf8',
  )) as Record<string, any>;
  const schema = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-package-manifest.schema.json'),
    'utf8',
  )) as Record<string, any>;

  assert.equal(manifest.schema_ref, 'contracts/opl-framework/agent-package-manifest.schema.json');
  assert.equal(manifest.package_id, 'med-autoscience');
  assert.equal(manifest.agent_id, 'med-autoscience');
  assert.equal(manifest.version, '0.1.0a4');
  assert.equal(manifest.distribution_payload.rolling_tag, 'latest');
  assert.equal(manifest.distribution_payload.install_truth, 'resolved_digest_lock');
  assert.equal(manifest.distribution_payload.live_download_proof, false);
  assert.equal(manifest.distribution_payload.installed_reload_proof, false);
  assert.equal(schema.properties.capability_dependencies.items.properties.codex_distribution.const, 'bundled');
  assert.equal(schema.properties.distribution_payload.properties.rolling_tag.const, 'latest');
  assert.equal(schema.properties.distribution_payload.properties.install_truth.const, 'resolved_digest_lock');
  assert.deepEqual(manifest.codex_surface.required_skill_ids, ['mas', 'mas-scholar-skills']);
  assert.deepEqual(manifest.codex_surface.bundled_capability_package_ids, ['mas-scholar-skills']);
  assert.equal(manifest.opl_managed_surface.package_shape, 'thin_agent_package');
  assert.equal(manifest.opl_managed_surface.dependency_resolution, 'managed_dependency_graph');
  assert.deepEqual(
    manifest.capability_dependencies.map((dependency: Record<string, any>) => ({
      module_id: dependency.module_id,
      package_id: dependency.package_id,
      codex_distribution: dependency.codex_distribution,
      opl_distribution: dependency.opl_distribution,
      developer_distribution: dependency.developer_distribution,
    })),
    [
      {
        module_id: 'scholarskills',
        package_id: 'mas-scholar-skills',
        codex_distribution: 'bundled',
        opl_distribution: 'managed_dependency',
        developer_distribution: 'source_checkout',
      },
    ],
  );
});

test('first-party agent package manifest canonicalizes legacy package and assistant ids without changing plugin or skill ids', () => {
  const normalized = normalizeFirstPartyAgentPackageManifest({
    agent_id: 'mas',
    package_id: 'medautoscience',
    version: '0.1.0a4',
    source: 'first_party',
    distribution_payload: {
      payload_kind: 'ghcr_oci_agent_package',
      payload_ref: 'ghcr.io/gaofeng21cn/opl-agent-med-autoscience:latest',
      payload_digest_ref: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      required_skill_pack_lock_refs: [
        'opl://agent-package-lock/mas-scholar-skills/0.1.0a4/managed-ghcr-capability-package',
      ],
      proof_status: 'non_live_contract_fixture',
      live_download_proof: false,
      installed_reload_proof: false,
      oci_ref: 'ghcr.io/gaofeng21cn/opl-agent-med-autoscience:latest',
      oci_media_type: 'application/vnd.oci.image.manifest.v1+json',
      immutable_tag: '0.1.0a4',
      rolling_tag: 'latest',
      promotion_policy: 'daily_candidate_gates_then_promote_latest',
      install_truth: 'resolved_digest_lock',
    },
    codex_surface: {
      plugin_id: 'mas',
      standalone_distribution: 'self_contained_fat_plugin',
      required_skill_ids: ['mas', 'mas-scholar-skills'],
      bundled_capability_package_ids: ['mas-scholar-skills'],
    },
    capability_dependencies: [
      {
        module_id: 'scholarskills',
        package_id: 'mas-scholar-skills',
        kind: 'framework_capability_package',
        required_for: ['workspace_or_quest_codex_discovery'],
        codex_distribution: 'bundled',
        opl_distribution: 'managed_dependency',
        developer_distribution: 'source_checkout',
        sync_scopes: ['workspace', 'quest'],
        sync_command_refs: ['opl connect sync-skills --domain mas-scholar-skills --scope workspace --target-workspace <workspace-root> --json'],
        authority_boundary: {
          can_write_domain_truth: false,
          can_sign_owner_receipt: false,
          can_create_typed_blocker: false,
          can_write_runtime_queue: false,
        },
      },
    ],
  });

  assert.equal(normalized.package_id, 'med-autoscience');
  assert.equal(normalized.agent_id, 'med-autoscience');
  assert.equal(normalized.codex_surface.plugin_id, 'mas');
  assert.deepEqual(normalized.codex_surface.required_skill_ids, ['mas', 'mas-scholar-skills']);
  assert.equal(canonicalAgentPackageId('obf'), 'opl-bookforge');
});

test('MAS first-party agent package manifest fails closed for unsafe dependency declarations', () => {
  const manifest = parseJsonText(fs.readFileSync(
    path.join(repoRoot, 'contracts/opl-framework/agent-packages/mas.json'),
    'utf8',
  )) as Record<string, any>;
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...manifest,
      capability_dependencies: [],
    }),
    /must declare capability_dependencies/,
  );
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...manifest,
      distribution_payload: {
        ...manifest.distribution_payload,
        install_truth: 'latest',
      },
    }),
    /distribution_payload.install_truth must be resolved_digest_lock/,
  );
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...manifest,
      capability_dependencies: [
        {
          ...manifest.capability_dependencies[0],
          authority_boundary: {
            ...manifest.capability_dependencies[0].authority_boundary,
            can_write_domain_truth: true,
          },
        },
      ],
    }),
    /authority boundary must be false-only/,
  );
  assert.throws(
    () => normalizeFirstPartyAgentPackageManifest({
      ...manifest,
      capability_dependencies: [
        {
          ...manifest.capability_dependencies[0],
          sync_scopes: ['workspace'],
        },
      ],
    }),
    /workspace and quest scopes/,
  );
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
    scholarskills: createGitModuleRemoteFixture('mas-scholar-skills'),
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
    OPL_MODULE_PATH_SCHOLARSKILLS: fixtures.scholarskills.sourceRoot,
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

  const manifest = parseJsonText(fs.readFileSync(path.join(outDir, 'opl-release-manifest.json'), 'utf8')) as any;
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
  assert.match(workflow, /one-person-lab-framework/);
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
const { parse: parseJsonText } = JSON;
function decodePackageFromPath(raw) {
  const match = String(raw).match(/\\/packages\\/container\\/([^/]+)\\/versions/);
  return match ? decodeURIComponent(match[1]) : '';
}
if (args[0] === 'api' && args.includes('--jq')) {
  const packageName = decodePackageFromPath(args.find((arg) => String(arg).includes('/packages/container/')));
  const missing = new Set(parseJsonText(process.env.FAKE_MISSING_PACKAGES_JSON || '[]'));
  if (missing.has(packageName)) process.exit(1);
  const versions = parseJsonText(process.env.FAKE_PACKAGE_VERSIONS_JSON || '{}')[packageName] || [];
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
      { id: 14, updated_at: '2026-04-30T00:00:00Z', metadata: { container: { tags: ['26.4.30', 'manual-keep'] } } },
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
    'one-person-lab-framework': [
      { id: 31, updated_at: '2026-05-06T00:00:00Z', metadata: { container: { tags: ['26.5.6'] } } },
      { id: 32, updated_at: '2026-05-02T00:00:00Z', metadata: { container: { tags: ['26.5.2-a'] } } },
      { id: 33, updated_at: '2026-05-01T00:00:00Z', metadata: { container: { tags: ['26.5.1'] } } },
      { id: 34, updated_at: '2026-04-30T00:00:00Z', metadata: { container: { tags: ['26.4.30'] } } },
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
    '--protected-tag',
    'manual-keep',
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

  const summary = parseJsonText(fs.readFileSync(summaryPath, 'utf8')) as any;
  assert.match(result, /opl_framework_ghcr_package_cleanup\.v1/);
  assert.equal(summary.status, 'dry_run');
  assert.deepEqual(summary.extra_protected_tags, ['manual-keep']);
  assert.equal(fs.existsSync(logPath), false);
  const nativeHelper = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-native-helper');
  assert.deepEqual(nativeHelper.protected_version_ids, [1, 2, 3, 5]);
  assert.deepEqual(nativeHelper.candidates.map((candidate: { id: number }) => candidate.id), [4]);
  const mas = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-modules/med-autoscience');
  assert.equal(mas.package_kind, 'active_module_package');
  assert.equal(mas.lifecycle_status, 'active_release_channel');
  assert.deepEqual(mas.protected_version_ids, [11, 12, 13, 14, 15]);
  assert.deepEqual(mas.candidates.map((candidate: { id: number }) => candidate.id), []);
  const manifest = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-manifest');
  assert.equal(manifest.package_kind, 'active_channel_manifest');
  assert.equal(manifest.lifecycle_status, 'active_release_channel');
  const frameworkCore = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-framework');
  assert.equal(frameworkCore.package_kind, 'framework_core');
  assert.equal(frameworkCore.lifecycle_status, 'active_release_channel');
  assert.deepEqual(frameworkCore.candidates.map((candidate: { id: number }) => candidate.id), [34]);
  const missing = summary.packages.find((entry: { package_name: string }) => entry.package_name === 'one-person-lab-modules/opl-meta-agent');
  assert.equal(missing.status, 'not_found_or_unreadable');
});

test('release discipline fails closed when workflow restores tag-push or WebUI publishing', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-discipline-root-'));
  const workflowPath = path.join(tempRoot, '.github', 'workflows', 'packages.yml');
  const manifestPath = path.join(tempRoot, 'opl-release-manifest.json');
  const manifest = (runCli(['connect', 'packages', 'manifest'], {
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
