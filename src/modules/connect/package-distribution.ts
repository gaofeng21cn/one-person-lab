import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getAgentPackageManifestByModuleId,
  getCapabilityDependenciesForModule,
} from './agent-package-manifests.ts';
import { getOplReleaseRepo, getOplReleaseVersion } from './opl-release.ts';
import { readBundledCodexDefaultProfile } from '../../kernel/local-codex-defaults.ts';
import { MANAGED_UPDATE_OWNER_FIELDS } from './managed-update-owner-boundary.ts';
import type { ModuleCapabilityDependency } from './system-installation/shared.ts';

type PackageSourceId =
  | 'medautoscience'
  | 'medautogrant'
  | 'redcube'
  | 'oplmetaagent'
  | 'oplbookforge'
  | 'scholarskills'
  | 'oplflow';

type PackageSpec = {
  module_id: PackageSourceId;
  label: string;
  repo_name: string;
  repo_url: string;
  scope: 'domain_module' | 'runtime_dependency' | 'framework_capability_package';
  package_id: 'mas' | 'mag' | 'rca' | 'oma' | 'obf' | 'mas-scholar-skills' | 'opl-flow';
  agent_package_manifest_ref?: string;
  owner_package_manifest_ref: string;
  owner_manifest_kind: 'standard_agent' | 'capability_package' | 'workflow_profile';
  owner_plugin_manifest_ref: string;
  owner_language_version_ref?: string;
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
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const PACKAGE_SPECS: PackageSpec[] = [
  {
    module_id: 'medautoscience',
    label: 'Med Auto Science',
    repo_name: 'med-autoscience',
    repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
    scope: 'domain_module',
    package_id: 'mas',
    agent_package_manifest_ref: 'contracts/opl-framework/packages/mas.json',
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_manifest_kind: 'standard_agent',
    owner_plugin_manifest_ref: 'plugins/med-autoscience/.codex-plugin/plugin.json',
    owner_language_version_ref: 'pyproject.toml',
    capability_dependencies: getCapabilityDependenciesForModule('medautoscience'),
  },
  {
    module_id: 'medautogrant',
    label: 'Med Auto Grant',
    repo_name: 'med-autogrant',
    repo_url: 'https://github.com/gaofeng21cn/med-autogrant.git',
    scope: 'domain_module',
    package_id: 'mag',
    agent_package_manifest_ref: 'contracts/opl-framework/packages/mag.json',
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_manifest_kind: 'standard_agent',
    owner_plugin_manifest_ref: 'plugins/med-autogrant/.codex-plugin/plugin.json',
    owner_language_version_ref: 'pyproject.toml',
  },
  {
    module_id: 'redcube',
    label: 'RedCube AI',
    repo_name: 'redcube-ai',
    repo_url: 'https://github.com/gaofeng21cn/redcube-ai.git',
    scope: 'domain_module',
    package_id: 'rca',
    agent_package_manifest_ref: 'contracts/opl-framework/packages/rca.json',
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_manifest_kind: 'standard_agent',
    owner_plugin_manifest_ref: 'plugins/redcube-ai/.codex-plugin/plugin.json',
    owner_language_version_ref: 'package.json',
  },
  {
    module_id: 'oplmetaagent',
    label: 'OPL Meta Agent',
    repo_name: 'opl-meta-agent',
    repo_url: 'https://github.com/gaofeng21cn/opl-meta-agent.git',
    scope: 'domain_module',
    package_id: 'oma',
    agent_package_manifest_ref: 'contracts/opl-framework/packages/oma.json',
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_manifest_kind: 'standard_agent',
    owner_plugin_manifest_ref: 'plugins/opl-meta-agent/.codex-plugin/plugin.json',
    owner_language_version_ref: 'package.json',
  },
  {
    module_id: 'oplbookforge',
    label: 'OPL Book Forge',
    repo_name: 'opl-bookforge',
    repo_url: 'https://github.com/gaofeng21cn/opl-bookforge.git',
    scope: 'domain_module',
    package_id: 'obf',
    agent_package_manifest_ref: 'contracts/opl-framework/packages/obf.json',
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_manifest_kind: 'standard_agent',
    owner_plugin_manifest_ref: 'plugins/opl-bookforge/.codex-plugin/plugin.json',
    owner_language_version_ref: 'package.json',
  },
  {
    module_id: 'scholarskills',
    label: 'MAS Scholar Skills',
    repo_name: 'mas-scholar-skills',
    repo_url: 'https://github.com/gaofeng21cn/mas-scholar-skills.git',
    scope: 'framework_capability_package',
    package_id: 'mas-scholar-skills',
    agent_package_manifest_ref: 'contracts/opl-framework/packages/mas-scholar-skills.json',
    owner_package_manifest_ref: 'contracts/opl_capability_package_manifest.json',
    owner_manifest_kind: 'capability_package',
    owner_plugin_manifest_ref: '.codex-plugin/plugin.json',
  },
  {
    module_id: 'oplflow',
    label: 'OPL Flow',
    repo_name: 'opl-flow',
    repo_url: 'https://github.com/gaofeng21cn/opl-flow.git',
    scope: 'runtime_dependency',
    package_id: 'opl-flow',
    agent_package_manifest_ref: 'contracts/opl-framework/packages/opl-flow.json',
    owner_package_manifest_ref: 'contracts/workflow-policy.json',
    owner_manifest_kind: 'workflow_profile',
    owner_plugin_manifest_ref: '.codex-plugin/plugin.json',
  },
];

function resolveOwner(inputOwner?: string) {
  if (inputOwner?.trim()) {
    return inputOwner.trim();
  }
  const repo = getOplReleaseRepo();
  return repo.split('/')[0] || 'gaofeng21cn';
}

export function normalizeDistributionVersion(value: string) {
  const pep440Alpha = value.match(/^(\d+)\.(\d+)\.(\d+)a(\d+)$/);
  return pep440Alpha
    ? `${pep440Alpha[1]}.${pep440Alpha[2]}.${pep440Alpha[3]}-alpha.${pep440Alpha[4]}`
    : value;
}

function projectedPackageVersion(spec: PackageSpec) {
  if (!spec.agent_package_manifest_ref) return '0.0.0';
  const source = JSON.parse(fs.readFileSync(path.join(repoRoot, spec.agent_package_manifest_ref), 'utf8')) as Record<string, unknown>;
  return normalizeDistributionVersion(stringValue(source.version) ?? '0.0.0');
}

function buildPackageRef(owner: string, packageId: string, version: string) {
  return `ghcr.io/${owner}/one-person-lab-packages/${packageId}:${version}`;
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
      generated_by: 'scripts/package-archives.mjs',
      ghcr_ref: 'ghcr.io/<owner>/one-person-lab-manifest:<opl_version>',
      moving_tags: ['candidate', 'latest-stable'],
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
      applies_to: ['one-person-lab-packages/*', 'one-person-lab-manifest'],
      protected_tags: ['candidate', 'latest-stable'],
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

function buildPackageReleaseDiscipline(spec: PackageSpec, rollbackVersion: string | null) {
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

function dependencyOf(moduleId: PackageSourceId) {
  return PACKAGE_SPECS
    .filter((spec) => spec.capability_dependencies?.some((dependency) => dependency.module_id === moduleId))
    .map((spec) => spec.module_id);
}

function buildCodexStandaloneDistribution(spec: PackageSpec) {
  if (spec.module_id === 'oplflow') {
    return null;
  }
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
  const releaseChannel = process.env.OPL_RELEASE_CHANNEL?.trim() || 'candidate';
  if (!['candidate', 'latest-stable'].includes(releaseChannel)) {
    throw new Error(`OPL_RELEASE_CHANNEL must be candidate or latest-stable, got: ${releaseChannel}`);
  }

  return {
    manifest_version: 1,
    opl_version: version,
    gui_version: process.env.OPL_GUI_VERSION?.trim() || null,
    release_channel: releaseChannel,
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
      package_artifacts: Object.fromEntries(
        PACKAGE_SPECS.map((spec) => [
          spec.package_id,
          (() => {
            const packageVersion = projectedPackageVersion(spec);
            return {
            module_id: spec.module_id,
            package_id: spec.package_id,
            package_version: packageVersion,
            label: spec.label,
            repo_name: spec.repo_name,
            repo_url: spec.repo_url,
            scope: spec.scope,
            agent_package_manifest_ref: spec.agent_package_manifest_ref,
            version: packageVersion,
            artifact_kind: 'source_archive',
            artifact: buildPackageRef(owner, spec.package_id, packageVersion),
            owner_language_version: null as string | null,
            owner_source_commit: null as string | null,
            owner_version_tag: null as string | null,
            owner_package_manifest_json: null as string | null,
            owner_package_manifest_sha256: null as string | null,
            release_gate: null as string | null,
            package_content_digest: null as string | null,
            oci_artifact_digest: null as string | null,
            oci_artifact_status: 'pending_publish',
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
            release_discipline: buildPackageReleaseDiscipline(spec, rollbackVersion),
            install_strategy: 'extract_to_managed_modules_root',
            codex_standalone_distribution: buildCodexStandaloneDistribution(spec),
            capability_dependencies: spec.capability_dependencies ?? [],
            dependency_of: dependencyOf(spec.module_id),
            };
          })(),
        ]),
      ),
    },
  };
}

export function getOplPackageSpecs() {
  return [...PACKAGE_SPECS];
}

function sha256Payload(payload: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(payload).digest('hex')}`;
}

function stringRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function dependencyRequirements(source: Record<string, unknown>) {
  const dependencies = Array.isArray(source.capability_dependencies) ? source.capability_dependencies : [];
  return dependencies.map((candidate) => stringRecord(candidate))
    .filter((candidate): candidate is Record<string, unknown> => candidate !== null)
    .map((candidate) => ({
      package_id: stringValue(candidate.package_id),
      version_requirement: stringValue(candidate.version_requirement),
      capability_abi: stringValue(candidate.capability_abi),
      required: candidate.required === true,
    }))
    .filter((candidate): candidate is {
      package_id: string;
      version_requirement: string | null;
      capability_abi: string | null;
      required: boolean;
    } => candidate.package_id !== null)
    .sort((left, right) => left.package_id.localeCompare(right.package_id, 'en'));
}

function buildCurrentPackageCatalog(manifest: OplPackageManifest) {
  return Object.fromEntries(PACKAGE_SPECS.map((spec) => {
    if (!spec.agent_package_manifest_ref) {
      throw new Error(`Package module ${spec.module_id} has no agent package manifest ref.`);
    }
    const manifestPath = path.join(repoRoot, spec.agent_package_manifest_ref);
    const projectedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    const packageEntry = manifest.packages.package_artifacts[spec.package_id];
    const ownerManifest = packageEntry.owner_package_manifest_json
      ? JSON.parse(packageEntry.owner_package_manifest_json) as Record<string, unknown>
      : {};
    const packageManifest = spec.owner_manifest_kind === 'capability_package'
      ? {
          ...projectedManifest,
          ...ownerManifest,
          codex_surface: {
            ...stringRecord(projectedManifest.codex_surface),
            ...stringRecord(ownerManifest.codex_surface),
          },
        }
      : projectedManifest;
    const packageId = spec.package_id;
    const packageVersion = packageEntry.package_version;
    if (!packageVersion) {
      throw new Error(`Package manifest ${spec.agent_package_manifest_ref} has no package_id or version.`);
    }
    const codexSurface = stringRecord(packageManifest.codex_surface);
    const payloadRef = codexSurface ? stringValue(codexSurface.plugin_payload_manifest_url) : null;
    if (!payloadRef) {
      throw new Error(`Package manifest ${spec.agent_package_manifest_ref} has no payload manifest ref.`);
    }
    const payloadPath = path.join(path.dirname(manifestPath), payloadRef);
    const payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8')) as Record<string, unknown>;
    const normalizedManifest = {
      ...packageManifest,
      package_id: packageId,
      ...(spec.owner_manifest_kind === 'standard_agent' ? { agent_id: packageId } : {}),
      version: packageVersion,
    };
    const sourceArtifactRef = packageEntry.artifact;
    const trackedSourceCommit = stringValue(payload.source_commit);
    const normalizedPayload = {
      ...payload,
      package_id: packageId,
      package_version: packageVersion,
      source_commit: packageEntry.owner_source_commit,
      ...(trackedSourceCommit && trackedSourceCommit !== packageEntry.owner_source_commit
        ? { migration_source_commit: trackedSourceCommit }
        : {}),
      package_source: {
        transport: 'same_oci_artifact_source_archive',
        artifact_ref: sourceArtifactRef,
        archive_sha256: packageEntry.package_content_digest,
      },
      files: Array.isArray(payload.files)
        ? payload.files.map((candidate) => {
            const file = stringRecord(candidate) ?? {};
            const sourceUrl = stringValue(file.source_url);
            const sourcePath = stringValue(file.path);
            return {
              ...file,
              source_path: sourcePath,
              source_artifact_ref: sourceArtifactRef,
              ...(sourceUrl ? { migration_source_url: sourceUrl } : {}),
              source_url: undefined,
            };
          })
        : [],
    };
    const manifestSource = `${JSON.stringify(normalizedManifest, null, 2)}\n`;
    const payloadSource = `${JSON.stringify(normalizedPayload, null, 2)}\n`;
    const contentLock = stringRecord(packageManifest.content_lock);
    const distributionPayload = stringRecord(packageManifest.distribution_payload);
    const capabilityAbi = stringRecord(packageManifest.capability_abi);
    const dependencies = dependencyRequirements(packageManifest);
    const manifestUrl = `opl+oci://${sourceArtifactRef}#/agent-package-manifest.json`;
    const manifestSha256 = sha256Payload(manifestSource);
    const versionEntry = {
      package_version: packageVersion,
      module_id: spec.module_id,
      capability_abi: capabilityAbi ? stringValue(capabilityAbi.id) : null,
      channel: 'stable',
      promotion_status: 'promoted',
      manifest_url: manifestUrl,
      manifest_sha256: manifestSha256,
      manifest_json: manifestSource,
      agent_package_manifest: {
        ref: manifestUrl,
        sha256: manifestSha256,
      },
      content_digest: stringValue(contentLock?.digest)
        ?? stringValue(distributionPayload?.payload_digest_ref)
        ?? manifestSha256,
      payload_digest: sha256Payload(payloadSource),
      payload_manifest_json: payloadSource,
      payload_manifest_sha256: sha256Payload(payloadSource),
      source_artifact_ref: sourceArtifactRef,
      artifact_digest: packageEntry.oci_artifact_digest,
      artifact_status: packageEntry.oci_artifact_status,
      package_content_digest: packageEntry.package_content_digest,
      owner_language_version: packageEntry.owner_language_version,
      owner_source_commit: packageEntry.owner_source_commit,
      owner_version_tag: packageEntry.owner_version_tag,
      owner_package_manifest_sha256: packageEntry.owner_package_manifest_sha256,
      release_gate: packageEntry.release_gate,
      dependency_package_ids: dependencies.map((dependency) => dependency.package_id),
      dependency_requirements: dependencies,
    };
    return [packageId, {
      package_id: packageId,
      module_id: spec.module_id,
      package_role: spec.owner_manifest_kind === 'workflow_profile'
        ? 'workflow_profile'
        : spec.scope === 'framework_capability_package'
          ? 'framework_capability_package'
          : 'standard_agent',
      channel: 'stable',
      latest_version: packageVersion,
      dependency_package_ids: versionEntry.dependency_package_ids,
      versions: [versionEntry],
    }];
  }));
}

function retainedVersions(previousManifest: unknown, packageId: string) {
  const root = stringRecord(previousManifest);
  const packages = stringRecord(root?.packages);
  const catalog = stringRecord(packages?.package_catalog);
  const entry = stringRecord(catalog?.[packageId]);
  return Array.isArray(entry?.versions)
    ? entry.versions.map((candidate) => stringRecord(candidate)).filter((candidate): candidate is Record<string, unknown> => candidate !== null)
    : [];
}

function isRetainableCatalogVersion(candidate: Record<string, unknown>) {
  const manifest = stringRecord(candidate.agent_package_manifest);
  const manifestJson = typeof candidate.manifest_json === 'string' ? candidate.manifest_json : null;
  const manifestSha256 = stringValue(candidate.manifest_sha256);
  return Boolean(
    stringValue(candidate.package_version)
    && stringValue(candidate.module_id)
    && stringValue(candidate.manifest_url)
    && manifestSha256?.match(/^sha256:[0-9a-f]{64}$/)
    && manifestJson
    && sha256Payload(manifestJson) === manifestSha256
    && stringValue(manifest?.ref)
    && stringValue(manifest?.sha256) === manifestSha256
    && stringValue(candidate.content_digest)?.match(/^sha256:[0-9a-f]{64}$/)
    && stringValue(candidate.payload_digest)?.match(/^sha256:[0-9a-f]{64}$/)
    && typeof candidate.payload_manifest_json === 'string'
    && sha256Payload(candidate.payload_manifest_json) === stringValue(candidate.payload_manifest_sha256)
    && stringValue(candidate.payload_manifest_sha256) === stringValue(candidate.payload_digest)
    && stringValue(candidate.source_artifact_ref)
  );
}

function comparePackageVersions(left: Record<string, unknown>, right: Record<string, unknown>) {
  const leftPromoted = left.promotion_status === 'promoted' ? 1 : 0;
  const rightPromoted = right.promotion_status === 'promoted' ? 1 : 0;
  if (leftPromoted !== rightPromoted) {
    return rightPromoted - leftPromoted;
  }
  const versionOrder = stringValue(right.package_version)?.localeCompare(
    stringValue(left.package_version) ?? '',
    'en',
    { numeric: true, sensitivity: 'base' },
  ) ?? 0;
  if (versionOrder !== 0) {
    return versionOrder;
  }
  return (stringValue(left.manifest_url) ?? '').localeCompare(stringValue(right.manifest_url) ?? '', 'en');
}

function mergePackageCatalog(
  currentCatalog: ReturnType<typeof buildCurrentPackageCatalog>,
  previousManifest: unknown,
  retainVersions: number,
) {
  return Object.fromEntries(Object.entries(currentCatalog).map(([packageId, current]) => {
    const previousVersions = retainedVersions(previousManifest, packageId);
    const generatedCurrentVersion = current.versions[0];
    const reusablePublishedVersion = previousVersions.find((candidate) => (
      stringValue(candidate.package_version) === generatedCurrentVersion.package_version
      && stringValue(candidate.package_content_digest) === generatedCurrentVersion.package_content_digest
      && candidate.artifact_status === 'published_immutable'
      && /^sha256:[0-9a-f]{64}$/.test(stringValue(candidate.artifact_digest) ?? '')
    ));
    const currentVersion = reusablePublishedVersion
      ? {
          ...generatedCurrentVersion,
          artifact_digest: reusablePublishedVersion.artifact_digest,
          artifact_status: 'published_immutable',
        }
      : generatedCurrentVersion;
    const retained = previousVersions
      .filter(isRetainableCatalogVersion)
      .filter((candidate) => (
        currentVersion.capability_abi === null
        || stringValue(candidate.capability_abi) === currentVersion.capability_abi
      ))
      .map((candidate): Record<string, unknown> => ({
        ...candidate,
        channel: 'stable',
        promotion_status: 'retained',
      }));
    const byVersion = new Map<string, Record<string, unknown>>();
    byVersion.set(currentVersion.package_version, currentVersion);
    for (const candidate of retained) {
      const version = stringValue(candidate.package_version);
      if (version && !byVersion.has(version)) {
        byVersion.set(version, candidate);
      }
    }
    return [packageId, {
      ...current,
      versions: [...byVersion.values()].sort(comparePackageVersions).slice(0, retainVersions),
    }];
  }));
}

export function buildOplPackageChannelManifest(manifest: OplPackageManifest, previousManifest: unknown = null) {
  const retainVersions = manifest.release_automation.cleanup.retain_versions;
  const packageCatalog = mergePackageCatalog(
    buildCurrentPackageCatalog(manifest),
    previousManifest,
    retainVersions,
  );
  return {
    ...manifest,
    manifest_role: 'opl_release_channel_manifest',
    manifest_role_reason: 'distinct OCI layer for GHCR package-channel publication',
    package_catalog_surface_kind: 'opl_package_catalog.v1',
    packages: {
      ...manifest.packages,
      package_catalog: packageCatalog,
    },
    package_catalog_digest: sha256Payload(JSON.stringify(packageCatalog)),
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
