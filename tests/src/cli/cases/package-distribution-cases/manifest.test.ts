import {
  assert,
  canonicalAgentPackageId,
  createGitModuleRemoteFixture,
  execFileSync,
  fs,
  normalizeFirstPartyAgentPackageManifest,
  os,
  parseJsonText,
  path,
  repoRoot,
  runCli,
  test,
} from './helpers.ts';
import { readBundledCodexDefaultProfile } from '../../../../../src/kernel/local-codex-defaults.ts';
import { getPublicationAdmittedOplPackageSpecs } from '../../../../../src/adapters/integration/package-distribution.ts';

const codexDefaultProfile = readBundledCodexDefaultProfile();

test('packages manifest exposes independent owner currentness and compatibility snapshot coordinates', () => {
  const packageSpecs = getPublicationAdmittedOplPackageSpecs();
  const masPackage = packageSpecs.find((spec) => spec.package_id === 'mas');
  const omaPackage = packageSpecs.find((spec) => spec.package_id === 'oma');
  const scholarPackage = packageSpecs.find((spec) => spec.package_id === 'mas-scholar-skills');
  const flowPackage = packageSpecs.find((spec) => spec.package_id === 'opl-flow');
  assert.ok(masPackage);
  assert.ok(omaPackage);
  assert.ok(scholarPackage);
  assert.ok(flowPackage);
  const output = runCli(['connect', 'packages', 'manifest'], {
    OPL_RELEASE_SET_GENERATION: '26.4.27',
    OPL_PACKAGES_OWNER: 'gaofeng21cn',
    OPL_RELEASE_CHANNEL: 'candidate',
  }) as {
    packages_manifest: {
      release_set_generation: string;
      release_set: {
        surface_kind: string;
        generation: string;
        component_count: number;
        component_ids: string[];
        catalog_carrier_is_package_identity: boolean;
        components: {
          base: { component_id: string; version: string; artifact_ref: string };
          app: { component_id: string; version: string | null; artifact_status: string };
          packages: { package_count: number; package_ids: string[]; members: Record<string, unknown> };
        };
      };
      package_install_update_source: string;
      package_consumption_status: string;
      developer_package_source_override: {
        carrier_env: string;
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
          publication_workflow: string;
          generation_template: string;
          change_detector: string;
          comparison: string;
          no_change_behavior: string;
          publish_gate: string;
          manual_repair_trigger: string;
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
        framework_core: {
          package_name: string;
          artifact: string;
          package_consumption_status: string;
          current_install_update_source: string;
          release_discipline: { required_gates: string[] };
        };
        package_artifacts: Record<string, {
          artifact: string;
          package_id: string;
          package_version: string;
          scope: string;
          package_manifest_ref: string;
          carrier_locator: { carrier_kind: string; module_id: string; repo_name: string; repo_url: string };
          codex_standalone_distribution: null | {
            distribution_shape: string;
            plugin_id: string;
            required_skill_ids: string[];
            bundled_capability_package_ids: string[];
            carrier_source_role: string;
            package_manifest_ref: string;
            distribution_payload?: {
              oci_ref: string;
              payload_digest_ref: string;
              moving_tag: string;
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
            current_stable_source: string;
            developer_override_source: string;
            required_gates: string[];
          };
          install_strategy: string;
          dependency_of: string[];
        }>;
      };
    };
  };

  assert.equal(output.packages_manifest.release_set_generation, '26.4.27');
  assert.equal(output.packages_manifest.release_set.generation, '26.4.27');
  assert.equal(output.packages_manifest.release_set.surface_kind, 'opl_release_set.v2');
  const packageCount = getPublicationAdmittedOplPackageSpecs().length;
  assert.equal(output.packages_manifest.release_set.component_count, packageCount + 2);
  assert.equal(output.packages_manifest.release_set.components.packages.package_count, packageCount);
  assert.equal(output.packages_manifest.release_set.components.base.component_id, 'opl-base');
  assert.equal(output.packages_manifest.release_set.components.app.component_id, 'opl-app');
  assert.equal(output.packages_manifest.release_set.catalog_carrier_is_package_identity, false);
  assert.equal(output.packages_manifest.package_install_update_source, 'per_package_owner_latest_stable');
  assert.equal(
    output.packages_manifest.package_consumption_status,
    'ordinary_app_users_compose_independent_ghcr_packages',
  );
  assert.equal(output.packages_manifest.developer_package_source_override.carrier_env, 'OPL_MODULE_SOURCE_MODE=git_checkout');
  assert.equal(output.packages_manifest.developer_package_source_override.scope, 'developer_mode_checkout');
  assert.equal(output.packages_manifest.developer_package_source_override.app_setting_surface, 'Developer Mode');
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
  assert.equal(output.packages_manifest.release_automation.workflow_trigger_policy, 'independent_owner_channel_workflow_call_or_manual_dispatch');
  assert.equal(output.packages_manifest.release_automation.remote_publish_status, 'publication_workflow_configured_pending_remote_verification');
  assert.equal(output.packages_manifest.release_automation.release_manifest_publication_status, 'configured_pending_remote_verification');
  assert.equal(
    output.packages_manifest.release_automation.release_manifest_package.package_channel_status,
    'active_release_channel',
  );
  assert.equal(
    output.packages_manifest.release_automation.release_manifest_package.publication_status,
    'publication_workflow_configured',
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
    'active_change_detection_with_independent_publication',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.workflow,
    '.github/workflows/daily-package-channel.yml',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.publication_workflow,
    '.github/workflows/daily-package-channel-publication.yml',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.generation_template,
    '<utc_yy.m.d[-rN_auto]>',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.change_detector,
    'scripts/package-channel-daily-check.mjs + scripts/package-owner-channel-plan.mjs',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.comparison,
    'independent_owner_channel_version_and_content_lock',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.no_change_behavior,
    'skip_without_publish',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.publish_gate,
    'new_version_with_changed_content_or_verified_channel_bootstrap',
  );
  assert.equal(
    output.packages_manifest.release_automation.daily_package_channel.manual_repair_trigger,
    'workflow_dispatch',
  );
  assert.equal(Object.hasOwn(output.packages_manifest.release_automation.daily_package_channel, 'force_publish_input'), false);
  assert.deepEqual(output.packages_manifest.release_automation.cleanup.protected_tags, ['candidate', 'latest-stable']);
  assert.equal(Object.hasOwn(output.packages_manifest.packages, 'webui_docker_image'), false);
  assert.equal(output.packages_manifest.packages.framework_core.package_name, 'one-person-lab-framework');
  assert.equal(output.packages_manifest.packages.framework_core.artifact, 'ghcr.io/gaofeng21cn/one-person-lab-framework:0.3.5');
  assert.equal(output.packages_manifest.packages.framework_core.package_consumption_status, 'consumed_by_runtime_substrate_updates');
  assert.equal(output.packages_manifest.packages.framework_core.current_install_update_source, 'opl_release_channel_manifest');
  assert.equal(
    output.packages_manifest.packages.framework_core.release_discipline.required_gates.includes('runtime_substrate_apply_and_rollback_tested'),
    true,
  );
  assert.equal(Object.hasOwn(output.packages_manifest.packages, 'native_helper'), false);
  assert.equal(output.packages_manifest.packages.codex_default_profile.model_provider, 'oplgateway');
  assert.equal(output.packages_manifest.packages.codex_default_profile.model, codexDefaultProfile.model);
  assert.equal(
    output.packages_manifest.packages.codex_default_profile.model_reasoning_effort,
    codexDefaultProfile.model_reasoning_effort,
  );
  assert.equal(output.packages_manifest.packages.codex_default_profile.base_url, 'https://gateway.medopl.com/v1');
  assert.equal(
    output.packages_manifest.packages.codex_default_profile.base_url_role,
    'opl_base_default_provider_endpoint',
  );
  assert.equal(
    output.packages_manifest.packages.codex_default_profile.model_profile_role,
    'opl_flow_recommendation_projection',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.artifact,
    `ghcr.io/gaofeng21cn/one-person-lab-packages/mas:${masPackage.version}`,
  );
  assert.equal(output.packages_manifest.packages.package_artifacts.mas.package_id, 'mas');
  assert.equal(output.packages_manifest.packages.package_artifacts.mas.package_version, masPackage.version);
  assert.equal(output.packages_manifest.packages.package_artifacts.mas.carrier_locator.module_id, 'medautoscience');
  assert.equal(output.packages_manifest.packages.package_artifacts.mas.carrier_locator.repo_name, 'med-autoscience');
  assert.equal(Object.hasOwn(output.packages_manifest.packages.package_artifacts.mas, 'module_id'), false);
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.package_channel_status,
    'active_release_channel',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.package_lifecycle_status,
    'active_release_channel',
  );
  assert.match(
    output.packages_manifest.packages.package_artifacts.mas.package_lifecycle_reason,
    /independent GHCR owner channel/,
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.remote_publish_status,
    'publication_workflow_configured_pending_remote_verification',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.package_consumption_status,
    'consumed_by_independent_owner_channel_installs',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.current_install_update_source,
    'per_package_owner_latest_stable',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.release_discipline.current_stable_source,
    'per_package_owner_latest_stable',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.release_discipline.developer_override_source,
    'git_checkout',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.release_discipline.workflow_trigger_policy,
    'independent_owner_channel_workflow_call_or_manual_dispatch',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.release_discipline.package_lifecycle_status,
    'active_release_channel',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.release_discipline.required_gates.includes(
      'sha256_recorded',
    ),
    true,
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.release_discipline.required_gates.includes(
      'ghcr_package_artifact_published',
    ),
    true,
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.release_discipline.required_gates.includes(
      'developer_git_checkout_override_declared',
    ),
    true,
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.mas.developer_git_checkout_override.repo_url,
    'https://github.com/gaofeng21cn/med-autoscience.git',
  );
  assert.deepEqual(
    output.packages_manifest.packages.package_artifacts.mas.capability_dependencies.map((dependency) => ({
      module_id: dependency.module_id,
      package_id: dependency.package_id,
      kind: dependency.kind,
      required: dependency.required,
      dependency_kind: dependency.dependency_kind,
      version_requirement: dependency.version_requirement,
      capability_abi: dependency.capability_abi,
      authority_boundary: dependency.authority_boundary,
    })),
    [
      {
        module_id: 'scholarskills',
        package_id: 'mas-scholar-skills',
        kind: 'capability_package',
        required: true,
        dependency_kind: 'hard_runtime_dependency',
        version_requirement: '*',
        capability_abi: 'mas-scholar-skills.v1',
        authority_boundary: {
          can_write_domain_truth: false,
          can_sign_owner_receipt: false,
          can_create_typed_blocker: false,
          can_write_runtime_queue: false,
        },
      },
    ],
  );
  for (const field of [
    'codex_distribution',
    'opl_distribution',
    'developer_distribution',
    'install_owner',
    'install_update_source',
    'sync_scopes',
    'required_for',
  ]) {
    assert.equal(
      Object.hasOwn(output.packages_manifest.packages.package_artifacts.mas.capability_dependencies[0], field),
      false,
    );
  }
  assert.deepEqual(
    output.packages_manifest.packages.package_artifacts.mas.codex_standalone_distribution,
    {
      distribution_shape: 'repo_carrier_source',
      plugin_id: 'med-autoscience',
      required_skill_ids: ['med-autoscience'],
      bundled_capability_package_ids: [],
      carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
      package_manifest_ref: 'contracts/opl-framework/packages/mas.json',
      user_install_action_count: 1,
    },
  );
  assert.equal(Object.hasOwn(output.packages_manifest.packages.package_artifacts, 'meddeepscientist'), false);
  assert.equal(
    output.packages_manifest.packages.package_artifacts.rca.install_strategy,
    'extract_to_managed_package_root',
  );
  assert.deepEqual(
    output.packages_manifest.packages.package_artifacts.rca.codex_standalone_distribution,
    {
      distribution_shape: 'repo_carrier_source',
      plugin_id: 'redcube-ai',
      required_skill_ids: ['redcube-ai'],
      bundled_capability_package_ids: [],
      carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
      package_manifest_ref: 'contracts/opl-framework/packages/rca.json',
      user_install_action_count: 1,
    },
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.oma.artifact,
    `ghcr.io/gaofeng21cn/one-person-lab-packages/oma:${omaPackage.version}`,
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.oma.remote_publish_status,
    'publication_workflow_configured_pending_remote_verification',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts.oma.developer_git_checkout_override.repo_url,
    'https://github.com/gaofeng21cn/opl-meta-agent.git',
  );
  const omaCodexStandaloneDistribution = output.packages_manifest.packages.package_artifacts.oma.codex_standalone_distribution;
  assert.ok(omaCodexStandaloneDistribution);
  assert.equal(omaCodexStandaloneDistribution.distribution_shape, 'repo_carrier_source');
  assert.equal(omaCodexStandaloneDistribution.package_manifest_ref, 'contracts/opl-framework/packages/oma.json');
  const scholarArtifact = output.packages_manifest.packages.package_artifacts['mas-scholar-skills'];
  assert.equal(scholarArtifact.package_version, scholarPackage.version);
  assert.equal(
    scholarArtifact.artifact,
    `ghcr.io/gaofeng21cn/one-person-lab-packages/mas-scholar-skills:${scholarPackage.version}`,
  );
  assert.equal(output.packages_manifest.packages.package_artifacts['opl-flow'].package_id, 'opl-flow');
  assert.equal(output.packages_manifest.packages.package_artifacts['opl-flow'].package_version, flowPackage.version);
  assert.equal(output.packages_manifest.packages.package_artifacts['opl-flow'].codex_standalone_distribution, null);
  assert.equal(
    output.packages_manifest.packages.package_artifacts['opl-flow'].artifact,
    `ghcr.io/gaofeng21cn/one-person-lab-packages/opl-flow:${flowPackage.version}`,
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts['mas-scholar-skills'].scope,
    'capability_package',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts['mas-scholar-skills'].package_manifest_ref,
    'contracts/opl-framework/packages/mas-scholar-skills.json',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts['mas-scholar-skills'].current_install_update_source,
    'per_package_owner_latest_stable',
  );
  assert.equal(
    output.packages_manifest.packages.package_artifacts['mas-scholar-skills'].developer_git_checkout_override.repo_url,
    'https://github.com/gaofeng21cn/mas-scholar-skills.git',
  );
  assert.deepEqual(output.packages_manifest.packages.package_artifacts['mas-scholar-skills'].dependency_of, ['mas', 'mag']);
});
