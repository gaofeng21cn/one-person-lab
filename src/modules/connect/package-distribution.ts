import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  getAgentPackageManifestByModuleId,
  getCapabilityDependenciesForModule,
} from './agent-package-manifests.ts';
import { getOplReleaseRepo, getOplReleaseVersion } from './opl-release.ts';
import { readBundledCodexDefaultProfile } from '../../kernel/local-codex-defaults.ts';
import { MANAGED_UPDATE_OWNER_FIELDS } from './managed-update-owner-boundary.ts';
import type { ModuleCapabilityDependency } from './system-installation/shared.ts';

type PackageModuleId =
  | 'medautoscience'
  | 'medautogrant'
  | 'redcube'
  | 'oplmetaagent'
  | 'oplbookforge'
  | 'scholarskills';

type PackageModuleSpec = {
  module_id: PackageModuleId;
  label: string;
  repo_name: string;
  repo_url: string;
  scope: 'domain_module' | 'runtime_dependency' | 'framework_capability_package';
  package_name: string;
  agent_package_manifest_ref?: string;
  capability_dependencies?: readonly ModuleCapabilityDependency[];
};

type BuildPackageManifestInput = Partial<{
  version: string;
  generatedAt: string;
  owner: string;
  rollbackVersion: string | null;
  retainVersions: number;
}>;

export type OplPackageManifest = ReturnType<typeof buildOplPackageManifest>;

const PACKAGE_WORKFLOW_TRIGGER_POLICY = 'release_gate_workflow_call_or_manual_dispatch';
const PACKAGE_REMOTE_PUBLISH_STATUS = 'release_gate_or_manual_dispatch_publishes_ghcr_packages';

const MODULE_SPECS: PackageModuleSpec[] = [
  {
    module_id: 'medautoscience',
    label: 'Med Auto Science',
    repo_name: 'med-autoscience',
    repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
    scope: 'domain_module',
    package_name: 'med-autoscience',
    agent_package_manifest_ref: 'contracts/opl-framework/agent-packages/mas.json',
    capability_dependencies: getCapabilityDependenciesForModule('medautoscience'),
  },
  {
    module_id: 'medautogrant',
    label: 'Med Auto Grant',
    repo_name: 'med-autogrant',
    repo_url: 'https://github.com/gaofeng21cn/med-autogrant.git',
    scope: 'domain_module',
    package_name: 'med-autogrant',
    agent_package_manifest_ref: 'contracts/opl-framework/agent-packages/mag.json',
  },
  {
    module_id: 'redcube',
    label: 'RedCube AI',
    repo_name: 'redcube-ai',
    repo_url: 'https://github.com/gaofeng21cn/redcube-ai.git',
    scope: 'domain_module',
    package_name: 'redcube-ai',
    agent_package_manifest_ref: 'contracts/opl-framework/agent-packages/rca.json',
  },
  {
    module_id: 'oplmetaagent',
    label: 'OPL Meta Agent',
    repo_name: 'opl-meta-agent',
    repo_url: 'https://github.com/gaofeng21cn/opl-meta-agent.git',
    scope: 'domain_module',
    package_name: 'opl-meta-agent',
    agent_package_manifest_ref: 'contracts/opl-framework/agent-packages/oma.json',
  },
  {
    module_id: 'oplbookforge',
    label: 'OPL Book Forge',
    repo_name: 'opl-bookforge',
    repo_url: 'https://github.com/gaofeng21cn/opl-bookforge.git',
    scope: 'domain_module',
    package_name: 'opl-bookforge',
    agent_package_manifest_ref: 'contracts/opl-framework/agent-packages/bookforge.json',
  },
  {
    module_id: 'scholarskills',
    label: 'MAS Scholar Skills',
    repo_name: 'mas-scholar-skills',
    repo_url: 'https://github.com/gaofeng21cn/mas-scholar-skills.git',
    scope: 'framework_capability_package',
    package_name: 'mas-scholar-skills',
  },
];

function resolveOwner(inputOwner?: string) {
  if (inputOwner?.trim()) {
    return inputOwner.trim();
  }
  const repo = getOplReleaseRepo();
  return repo.split('/')[0] || 'gaofeng21cn';
}

function buildPackageRef(owner: string, name: string, version: string) {
  return `ghcr.io/${owner}/one-person-lab-modules/${name}:${version}`;
}

function buildFrameworkRef(owner: string, version: string) {
  return `ghcr.io/${owner}/one-person-lab-framework:${version}`;
}

function normalizeRetainVersions(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 3;
  }
  return Math.max(2, Math.floor(value));
}

function buildReleaseAutomation(retainVersions: number, rollbackVersion: string | null) {
  return {
    status: 'active_managed_ghcr_capability_packages',
    package_lifecycle_status: 'active_release_channel',
    workflow_trigger_policy: PACKAGE_WORKFLOW_TRIGGER_POLICY,
    remote_publish_status: PACKAGE_REMOTE_PUBLISH_STATUS,
    release_manifest_publication_status: 'active_ghcr_channel_manifest',
    release_manifest_package: {
      package_name: 'one-person-lab-manifest',
      package_channel_status: 'active_release_channel',
      publication_status: 'published_to_ghcr_by_packages_workflow',
      current_install_update_source: 'opl_release_channel_manifest',
      developer_override_source: 'git_checkout',
    },
    channel_manifest: {
      manifest_kind: 'opl_release_channel_manifest.v1',
      generated_by: 'scripts/package-module-archives.mjs',
      ghcr_ref: 'ghcr.io/<owner>/one-person-lab-manifest:<opl_version>',
      moving_tags: ['latest'],
      outputs: {
        release_manifest: 'opl-release-manifest.json',
        channel_manifest: 'opl-channel-manifest.json',
        checksums: 'SHA256SUMS',
      },
      current_latest_source: 'ghcr_channel_manifest',
    },
    artifact_build: {
      workflow: '.github/workflows/packages.yml',
      command: 'npm run packages:manifest -- --version <opl_version>',
      artifact_kind: 'git_archive_source_tarball',
      publication_mode: 'ghcr_package_channel_and_workflow_artifact',
      automatic_trigger: 'workflow_call_from_release_gate',
      manual_repair_trigger: 'workflow_dispatch',
      required_input: 'opl_version',
    },
    checksum: {
      algorithm: 'sha256',
      recorded_in: ['source_archive.sha256', 'SHA256SUMS'],
      required_before_publish: true,
      required_before_prepared_artifact: true,
    },
    [MANAGED_UPDATE_OWNER_FIELDS.revertPlan]: {
      strategy: 'previous_channel_manifest_target',
      previous_version: rollbackVersion,
      input: '--previous-manifest <path>',
      failure_behavior: 'keep_current_git_checkout_or_restore_previous_manifest_target',
    },
    cleanup: {
      strategy: 'retain_latest_n_versions_and_declared_rollbacks',
      retain_versions: retainVersions,
      applies_to: ['one-person-lab-modules/*', 'one-person-lab-manifest'],
      protected_tags: ['latest'],
      execution_mode: 'dry_run_first_explicit_execute_required',
      destructive_action_requires: 'package_admin_with_delete_packages_scope',
    },
    daily_package_channel: {
      status: 'active_change_detected_daily_publish',
      workflow: '.github/workflows/daily-package-channel.yml',
      schedule: 'daily',
      version_template: '<utc_yy.m.d>',
      change_detector: 'scripts/package-channel-daily-check.mjs',
      comparison: 'package_source_fingerprint',
      ignored_fields: ['opl_version', 'generated_at', 'artifact tag'],
      no_change_behavior: 'skip_without_publish',
      publish_gate: 'daily_package_channel_changed',
      manual_repair_trigger: 'workflow_dispatch',
      force_publish_input: 'force_publish',
    },
  };
}

function buildModuleReleaseDiscipline(spec: PackageModuleSpec, rollbackVersion: string | null) {
  return {
    module_truth_owner: spec.repo_name,
    package_publish_owner: 'framework_packages_workflow',
    package_channel_status: 'active_release_channel',
    package_lifecycle_status: 'active_release_channel',
    workflow_trigger_policy: PACKAGE_WORKFLOW_TRIGGER_POLICY,
    remote_publish_status: 'published_to_ghcr_by_packages_workflow',
    current_latest_source: 'opl_release_channel_manifest',
    developer_override_source: 'git_checkout',
    required_gates: [
      'upstream_default_branch_reachable',
      'clean_checkout_or_fresh_clone',
      'source_archive_built_from_head',
      'sha256_recorded',
      'channel_manifest_written',
      'ghcr_module_artifact_published',
      'release_manifest_published',
      'developer_git_checkout_override_declared',
      'rollback_target_declared_when_previous_manifest_exists',
    ],
    [MANAGED_UPDATE_OWNER_FIELDS.revertPlan]: rollbackVersion
      ? {
          version: rollbackVersion,
          source: 'previous_channel_manifest',
        }
      : null,
  };
}

function dependencyOf(moduleId: PackageModuleId) {
  return MODULE_SPECS
    .filter((spec) => spec.capability_dependencies?.some((dependency) => dependency.module_id === moduleId))
    .map((spec) => spec.module_id);
}

function buildCodexStandaloneDistribution(spec: PackageModuleSpec) {
  const agentPackageManifest = getAgentPackageManifestByModuleId(spec.module_id);
  if (!agentPackageManifest) {
    return null;
  }
  return {
    distribution_shape: agentPackageManifest.codex_surface.standalone_distribution,
    plugin_id: agentPackageManifest.codex_surface.plugin_id,
    required_skill_ids: agentPackageManifest.codex_surface.required_skill_ids,
    bundled_capability_package_ids: agentPackageManifest.codex_surface.bundled_capability_package_ids ?? [],
    carrier_source_role: agentPackageManifest.carrier_source_role,
    package_manifest_ref: spec.agent_package_manifest_ref,
    ...(agentPackageManifest.distribution_payload
      ? { distribution_payload: agentPackageManifest.distribution_payload }
      : {}),
    user_install_action_count: 1,
  };
}

export function buildOplPackageManifest(input: BuildPackageManifestInput = {}) {
  const version = input.version?.trim() || getOplReleaseVersion();
  const owner = resolveOwner(input.owner);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const retainVersions = normalizeRetainVersions(input.retainVersions);
  const rollbackVersion = input.rollbackVersion === undefined ? null : input.rollbackVersion;

  return {
    manifest_version: 1,
    opl_version: version,
    gui_version: process.env.OPL_GUI_VERSION?.trim() || null,
    release_channel: process.env.OPL_RELEASE_CHANNEL?.trim() || 'latest',
    generated_at: generatedAt,
    module_install_update_source: 'package_channel',
    package_consumption_status: 'ordinary_app_users_consume_managed_ghcr_capability_packages',
    developer_module_source_override: {
      env: 'OPL_MODULE_SOURCE_MODE=git_checkout',
      scope: 'developer_mode_checkout',
      app_setting_surface: 'Developer Mode',
      rule: 'Developer Mode is the App/system settings surface for repo checkout module sources; ordinary App users consume the GHCR capability packages channel as the non-development install/update source.',
      low_level_env_role: 'diagnostic_ci_override',
    },
    release_automation: buildReleaseAutomation(retainVersions, rollbackVersion),
    packages: {
      codex_default_profile: readBundledCodexDefaultProfile(),
      native_helper: {
        image: `ghcr.io/${owner}/one-person-lab-native-helper`,
        channel_status: 'active_ghcr_oci_prebuild',
        package_publish_owner: 'one-person-lab_framework_native_helper_prebuilds',
        version_source: 'native/opl-native-helper/Cargo.toml',
        target_tag_template: `ghcr.io/${owner}/one-person-lab-native-helper:<target>-<native_helper_version>`,
        publish_status_policy: {
          workflow: '.github/workflows/native-helper-prebuilds.yml',
          trigger_policy: 'push_main_or_manual_dispatch',
          publication_mode: 'active_ghcr_oci_prebuild',
          pull_restore_consumers: ['opl system repair-native-helpers', 'opl install', 'npm run native:repair'],
        },
        retention_policy: {
          strategy: 'retain_latest_n_versions_and_declared_rollbacks',
          retain_versions: retainVersions,
          applies_to: ['one-person-lab-native-helper'],
          protected_tags: ['latest'],
          protected_tag_pattern: '<target>-<native_helper_version>',
          execution_mode: 'dry_run_first_explicit_execute_required',
          destructive_action_requires: 'package_admin_with_delete_packages_scope',
        },
        required_gates: [
          'native_helper_prebuild_pack',
          'native_helper_prebuild_check',
          'native_helper_archive_written',
          'binary_sha256_recorded',
          'ghcr_oci_archive_pushed',
          'retention_policy_recorded',
        ],
      },
      framework_core: {
        package_name: 'one-person-lab-framework',
        label: 'OPL Framework Core',
        version,
        artifact_kind: 'framework_source_archive',
        artifact: buildFrameworkRef(owner, version),
        package_channel_status: 'active_release_channel',
        package_lifecycle_status: 'active_release_channel',
        remote_publish_status: 'published_to_ghcr_by_packages_workflow',
        package_consumption_status: 'consumed_by_runtime_substrate_updates',
        current_install_update_source: 'opl_release_channel_manifest',
        developer_git_checkout_override: {
          repo_url: 'https://github.com/gaofeng21cn/one-person-lab.git',
          ref: 'main',
          app_setting_surface: 'Developer Mode',
          env: 'OPL_FRAMEWORK_UPDATE_SOURCE',
          env_role: 'low_level_diagnostic_ci_override',
        },
        release_discipline: {
          package_channel_status: 'active_release_channel',
          package_lifecycle_status: 'active_release_channel',
          workflow_trigger_policy: PACKAGE_WORKFLOW_TRIGGER_POLICY,
          current_latest_source: 'opl_release_channel_manifest',
          developer_override_source: 'git_checkout',
          required_gates: [
            'source_archive_built_from_head',
            'sha256_recorded',
            'channel_manifest_written',
            'ghcr_framework_artifact_published',
            'release_manifest_published',
            'runtime_substrate_apply_and_rollback_tested',
          ],
          [MANAGED_UPDATE_OWNER_FIELDS.revertPlan]: rollbackVersion
            ? {
                version: rollbackVersion,
                source: 'previous_channel_manifest',
              }
            : null,
        },
      },
      modules: Object.fromEntries(
        MODULE_SPECS.map((spec) => [
          spec.module_id,
          {
            module_id: spec.module_id,
            label: spec.label,
            repo_name: spec.repo_name,
            repo_url: spec.repo_url,
            scope: spec.scope,
            version,
            artifact_kind: 'source_archive',
            artifact: buildPackageRef(owner, spec.package_name, version),
            package_channel_status: 'active_release_channel',
            package_lifecycle_status: 'active_release_channel',
            package_lifecycle_reason: 'ordinary App users and package-channel installs consume the GHCR capability packages channel; domain truth remains repo-owned',
            remote_publish_status: 'published_to_ghcr_by_packages_workflow',
            package_consumption_status: 'consumed_by_package_channel_installs',
            current_install_update_source: 'package_channel',
            developer_git_checkout_override: {
              repo_url: spec.repo_url,
              ref: 'main',
              app_setting_surface: 'Developer Mode',
              env: `OPL_MODULE_SOURCE_MODE=git_checkout or OPL_MODULE_PATH_${spec.module_id.toUpperCase()}`,
              env_role: 'low_level_diagnostic_ci_override',
            },
            release_discipline: buildModuleReleaseDiscipline(spec, rollbackVersion),
            install_strategy: 'extract_to_managed_modules_root',
            codex_standalone_distribution: buildCodexStandaloneDistribution(spec),
            capability_dependencies: spec.capability_dependencies ?? [],
            dependency_of: dependencyOf(spec.module_id),
          },
        ]),
      ),
    },
  };
}

export function getOplPackageModuleSpecs() {
  return [...MODULE_SPECS];
}

export function buildOplPackageChannelManifest(manifest: OplPackageManifest) {
  return {
    ...manifest,
    manifest_role: 'opl_release_channel_manifest',
    manifest_role_reason: 'distinct OCI layer for GHCR package-channel publication',
  };
}

export function sha256File(filePath: string) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

export function writeOplPackageManifest(outputPath: string, manifest = buildOplPackageManifest()) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return outputPath;
}
