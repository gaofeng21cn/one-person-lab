import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getAgentPackageManifestByModuleId,
  listFirstPartyAgentPackageManifests,
} from './agent-package-manifests.ts';
import { listCurrentPackageProjections } from '../../kernel/standard-agent-registry.ts';
import { getOplReleaseRepo, getOplReleaseVersion } from './opl-release.ts';
import { readBundledCodexDefaultProfile } from '../../kernel/local-codex-defaults.ts';
import { MANAGED_UPDATE_OWNER_FIELDS } from './managed-update-owner-boundary.ts';
import type { ModuleCapabilityDependency } from './system-installation/shared.ts';

export type PackageSpec = {
  module_id: string;
  label: string;
  description: string;
  tags: readonly string[];
  repo_name: string;
  repo_url: string;
  scope: 'domain_module' | 'runtime_dependency' | 'capability_package';
  package_id: string;
  package_manifest_ref: string;
  owner_package_manifest_ref: string;
  owner_manifest_kind: 'standard_agent' | 'capability_package' | 'workflow_profile';
  owner_plugin_manifest_ref: string;
  owner_language_version_ref?: string;
  capability_dependencies?: readonly ModuleCapabilityDependency[];
  version: string;
};

type BuildPackageManifestInput = Partial<{
  releaseSetGeneration: string;
  generatedAt: string;
  owner: string;
  rollbackVersion: string | null;
  retainVersions: number;
  appComponent: AppComponentInput | null;
  frameworkVersion: string;
}>;

type ComponentArtifact = {
  name: string;
  ref: string;
  digest: string;
  size: number;
  content_type: string;
};

export type AppComponentCarrier = {
  carrier_id: 'macos_standard' | 'docker_webui';
  carrier_kind: 'release_asset' | 'oci_image';
  ref: string;
  digest: string;
  size: number;
  package_profile: 'standard' | 'webui-full';
  content_fingerprint?: string;
};

export type AppComponentInput = {
  surface_kind: 'opl_app_component_manifest.v1';
  component_id: 'opl-app';
  version: string;
  source_commit: string;
  release_tag: string;
  release_url: string;
  release_status: 'draft' | 'published';
  primary_artifact: ComponentArtifact;
  artifacts: ComponentArtifact[];
  carriers?: AppComponentCarrier[];
  component_manifest_ref: string;
  component_manifest_digest: string;
};

export type OplPackageManifest = ReturnType<typeof buildOplPackageManifest>;

const PACKAGE_WORKFLOW_TRIGGER_POLICY = 'independent_owner_channel_workflow_call_or_manual_dispatch';
const PACKAGE_REMOTE_PUBLISH_STATUS = 'publication_workflow_configured_pending_remote_verification';
const RELEASE_SET_GENERATION_PATTERN = /^\d{2}\.\d{1,2}\.\d{1,2}(?:-r[1-9]\d*)?$/;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function projectionString(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Package projection must declare ${field}.`);
  }
  return value.trim();
}

function projectionRecord(payload: Record<string, unknown>, field: string) {
  const value = payload[field];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function projectionOwnerManifestKind(payload: Record<string, unknown>) {
  if (payload.surface_kind === 'opl_agent_package_manifest.v1') return 'standard_agent' as const;
  if (payload.package_role === 'workflow_profile' || payload.surface_kind === 'opl_workflow_profile_package_manifest.v1') {
    return 'workflow_profile' as const;
  }
  return 'capability_package' as const;
}

function projectionDescription(payload: Record<string, unknown>, fallback: string) {
  const presentation = projectionRecord(payload, 'presentation');
  const descriptionI18n = presentation ? projectionRecord(presentation, 'description_i18n') : null;
  const english = descriptionI18n?.['en-US'];
  return typeof english === 'string' && english.trim() ? english.trim() : fallback;
}

export function loadOplPackageSpecs(packageDirectory?: string): PackageSpec[] {
  const agentManifests = new Map(
    listFirstPartyAgentPackageManifests(packageDirectory)
      .map((manifest) => [manifest.package_id, manifest]),
  );
  return listCurrentPackageProjections(packageDirectory).map(({ source_ref, payload }) => {
    const packageId = projectionString(payload, 'package_id');
    const label = projectionString(payload, 'display_name');
    const ownerManifestKind = projectionOwnerManifestKind(payload);
    const agentManifest = agentManifests.get(packageId);
    const runtimeCarrier = projectionRecord(payload, 'runtime_source_carrier');
    const publicationSource = projectionRecord(payload, 'publication_source');
    const moduleId = agentManifest?.module_id
      ?? (typeof publicationSource?.module_id === 'string' ? publicationSource.module_id : null)
      ?? (typeof runtimeCarrier?.module_id === 'string' ? runtimeCarrier.module_id : packageId);
    const repoUrl = projectionString(payload, 'source_repo');
    const repoName = repoUrl.replace(/[\\/]+$/, '').replace(/\.git$/, '').split(/[\\/]/).at(-1) ?? repoUrl;
    return {
      module_id: moduleId,
      label,
      description: agentManifest?.description ?? projectionDescription(payload, label),
      tags: ownerManifestKind === 'standard_agent'
        ? ['domain-agent']
        : ownerManifestKind === 'capability_package'
          ? ['capability-package']
          : ['workflow-profile'],
      repo_name: agentManifest?.repo_name ?? repoName,
      repo_url: agentManifest?.repo_url ?? repoUrl,
      scope: ownerManifestKind === 'standard_agent'
        ? 'domain_module'
        : ownerManifestKind === 'capability_package'
          ? 'capability_package'
          : 'runtime_dependency',
      package_id: packageId,
      package_manifest_ref: source_ref,
      owner_package_manifest_ref: agentManifest?.owner_package_manifest_ref
        ?? (typeof publicationSource?.owner_package_manifest_ref === 'string'
          ? publicationSource.owner_package_manifest_ref
          : source_ref),
      owner_manifest_kind: ownerManifestKind,
      owner_plugin_manifest_ref: agentManifest?.owner_plugin_manifest_ref
        ?? (typeof publicationSource?.owner_plugin_manifest_ref === 'string'
          ? publicationSource.owner_plugin_manifest_ref
          : '.codex-plugin/plugin.json'),
      ...(agentManifest?.owner_language_version_ref
        ? { owner_language_version_ref: agentManifest.owner_language_version_ref }
        : typeof publicationSource?.owner_language_version_ref === 'string'
          ? { owner_language_version_ref: publicationSource.owner_language_version_ref }
          : {}),
      capability_dependencies: agentManifest?.capability_dependencies ?? [],
      version: projectionString(payload, 'version'),
    };
  });
}

const PACKAGE_SPECS = loadOplPackageSpecs();

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
  return normalizeDistributionVersion(spec.version);
}

function buildPackageRef(owner: string, packageId: string, version: string) {
  return `ghcr.io/${owner}/one-person-lab-packages/${packageId}:${version}`;
}

function buildFrameworkRef(owner: string, version: string) {
  return `ghcr.io/${owner}/one-person-lab-framework:${version}`;
}

function frameworkVersion(explicitVersion?: string) {
  const version = explicitVersion ?? stringValue(
    (JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as Record<string, unknown>).version,
  );
  if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error(`OPL Base package.json version must be stable SemVer, got: ${version ?? 'missing'}`);
  }
  return version;
}

function buildAppComponent(input: AppComponentInput | null | undefined) {
  if (!input) {
    return {
      component_id: 'opl-app',
      component_kind: 'app',
      version: null,
      source_commit: null,
      artifact_ref: null,
      artifact_digest: null,
      artifact_status: 'pending_app_owner_manifest',
      release_status: null,
      component_manifest_ref: null,
      component_manifest_digest: null,
      artifacts: [],
      carriers: [],
    };
  }
  return {
    component_id: 'opl-app',
    component_kind: 'app',
    version: input.version,
    source_commit: input.source_commit,
    artifact_ref: input.primary_artifact.ref,
    artifact_digest: input.primary_artifact.digest,
    artifact_status: 'published_immutable',
    release_status: input.release_status,
    release_tag: input.release_tag,
    release_url: input.release_url,
    component_manifest_ref: input.component_manifest_ref,
    component_manifest_digest: input.component_manifest_digest,
    artifacts: input.artifacts,
    carriers: input.carriers ?? [{
      carrier_id: 'macos_standard',
      carrier_kind: 'release_asset',
      ref: input.primary_artifact.ref,
      digest: input.primary_artifact.digest,
      size: input.primary_artifact.size,
      package_profile: 'standard',
    }],
  };
}

export function normalizeReleaseSetGeneration(value: string) {
  const generation = value.trim().replace(/^v/, '');
  if (!RELEASE_SET_GENERATION_PATTERN.test(generation)) {
    throw new Error(`Release Set generation must use YY.M.D or YY.M.D-rN, got: ${value}`);
  }
  return generation;
}

function packageRole(spec: PackageSpec): 'standard_agent' | 'capability_package' | 'workflow_profile' {
  return spec.owner_manifest_kind === 'workflow_profile'
    ? 'workflow_profile'
    : spec.scope === 'capability_package'
      ? 'capability_package'
      : 'standard_agent';
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
    release_manifest_publication_status: 'configured_pending_remote_verification',
    release_manifest_package: {
      package_name: 'one-person-lab-manifest',
      package_channel_status: 'active_release_channel',
      publication_status: 'publication_workflow_configured',
      current_install_update_source: 'opl_release_channel_manifest',
      developer_override_source: 'git_checkout',
    },
    channel_manifest: {
      manifest_kind: 'opl_release_channel_manifest.v1',
      generated_by: 'scripts/package-archives.mjs',
      ghcr_ref: 'ghcr.io/<owner>/one-person-lab-manifest:<release_set_generation>',
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
      command: 'npm run packages:manifest -- --release-set-generation <yy.m.d[-rN]>',
      artifact_kind: 'git_archive_source_tarball',
      publication_mode: 'ghcr_package_channel_and_workflow_artifact',
      automatic_trigger: 'workflow_call_from_release_gate',
      manual_repair_trigger: 'workflow_dispatch',
      required_input: 'release_set_generation',
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
      generation_template: '<utc_yy.m.d[-rN_auto]>',
      change_detector: 'scripts/package-channel-daily-check.mjs',
      comparison: 'package_source_fingerprint',
      ignored_fields: ['release_set_generation', 'generated_at', 'artifact tag'],
      no_change_behavior: 'skip_without_publish',
      publish_gate: 'daily_package_channel_changed',
      manual_repair_trigger: 'workflow_dispatch',
      force_publish_input: 'force_publish',
    },
  };
}

function buildPackageReleaseDiscipline(spec: PackageSpec, rollbackVersion: string | null) {
  return {
    package_truth_owner: spec.repo_name,
    package_publish_owner: 'framework_packages_workflow',
    package_channel_status: 'active_release_channel',
    package_lifecycle_status: 'active_release_channel',
    workflow_trigger_policy: PACKAGE_WORKFLOW_TRIGGER_POLICY,
    remote_publish_status: PACKAGE_REMOTE_PUBLISH_STATUS,
    current_stable_source: 'per_package_owner_latest_stable',
    developer_override_source: 'git_checkout',
    required_gates: [
      'upstream_default_branch_reachable',
      'clean_checkout_or_fresh_clone',
      'source_archive_built_from_head',
      'sha256_recorded',
      'ghcr_package_artifact_published',
      'immutable_version_remote_digest_preflight',
      'repository_source_association_verified',
      'anonymous_digest_pull_verified',
      'owner_latest_stable_promoted',
      'anonymous_owner_channel_readback_verified',
      'shared_release_set_not_required_for_ordinary_currentness',
      'developer_git_checkout_override_declared',
      'rollback_target_declared_when_previous_manifest_exists',
    ],
    [MANAGED_UPDATE_OWNER_FIELDS.revertPlan]: rollbackVersion
      ? {
          version: rollbackVersion,
          source: 'previous_owner_package_channel_target',
        }
      : null,
  };
}

function dependencyOf(moduleId: string) {
  return PACKAGE_SPECS
    .filter((spec) => spec.capability_dependencies?.some((dependency) => dependency.module_id === moduleId))
    .map((spec) => spec.package_id);
}

function buildCodexStandaloneDistribution(spec: PackageSpec) {
  if (spec.owner_manifest_kind === 'workflow_profile') {
    return null;
  }
  const agentPackageManifest = spec.owner_manifest_kind === 'standard_agent'
    ? getAgentPackageManifestByModuleId(spec.module_id)
    : null;
  if (spec.owner_manifest_kind === 'capability_package' && !agentPackageManifest) {
    return {
      distribution_shape: 'repo_carrier_source',
      plugin_id: spec.package_id,
      required_skill_ids: [spec.package_id],
      bundled_capability_package_ids: [],
      carrier_source_role: 'codex_plugin_default_carrier_not_package_truth',
      package_manifest_ref: spec.package_manifest_ref,
      user_install_action_count: 1,
    };
  }
  if (!agentPackageManifest) {
    return null;
  }
  return {
    distribution_shape: agentPackageManifest.codex_surface.standalone_distribution,
    plugin_id: agentPackageManifest.codex_surface.plugin_id,
    required_skill_ids: agentPackageManifest.codex_surface.required_skill_ids,
    bundled_capability_package_ids: agentPackageManifest.codex_surface.bundled_capability_package_ids ?? [],
    carrier_source_role: agentPackageManifest.carrier_source_role,
    package_manifest_ref: spec.package_manifest_ref,
    ...(agentPackageManifest.distribution_payload
      ? { distribution_payload: agentPackageManifest.distribution_payload }
      : {}),
    user_install_action_count: 1,
  };
}

export function buildOplPackageManifest(input: BuildPackageManifestInput = {}) {
  const releaseSetGeneration = normalizeReleaseSetGeneration(
    input.releaseSetGeneration
      ?? process.env.OPL_RELEASE_SET_GENERATION
      ?? getOplReleaseVersion(),
  );
  const owner = resolveOwner(input.owner);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const retainVersions = normalizeRetainVersions(input.retainVersions);
  const rollbackVersion = input.rollbackVersion === undefined ? null : input.rollbackVersion;
  const baseVersion = frameworkVersion(input.frameworkVersion);
  const packageMembers = Object.fromEntries(PACKAGE_SPECS.map((spec) => {
    const packageVersion = projectedPackageVersion(spec);
    return [spec.package_id, {
      component_id: spec.package_id,
      component_kind: 'package',
      package_id: spec.package_id,
      package_role: packageRole(spec),
      package_version: packageVersion,
      version: packageVersion,
      owner_source_commit: null as string | null,
      source_commit: null as string | null,
      oci_artifact_ref: buildPackageRef(owner, spec.package_id, packageVersion),
      artifact_ref: buildPackageRef(owner, spec.package_id, packageVersion),
      oci_artifact_digest: null as string | null,
      artifact_digest: null as string | null,
      artifact_status: 'pending_remote_verification',
    }];
  }));

  return {
    manifest_version: 1,
    release_set_generation: releaseSetGeneration,
    release_set: {
      surface_kind: 'opl_release_set.v2',
      schema_ref: 'contracts/opl-framework/release-set-v2.schema.json',
      generation: releaseSetGeneration,
      generation_scheme: 'calver_yy.m.d_optional_revision',
      selection_status: 'selected_ecosystem_components',
      promotion_evidence_status: 'requires_remote_tag_readback',
      catalog_carrier: `ghcr.io/${owner}/one-person-lab-manifest:${releaseSetGeneration}`,
      catalog_carrier_is_package_identity: false,
      component_count: PACKAGE_SPECS.length + 2,
      component_ids: ['opl-base', 'opl-app', ...PACKAGE_SPECS.map((spec) => spec.package_id)],
      bom_status: 'planned',
      bom_digest: null as string | null,
      update_decision: {
        comparison_key: 'component_id+version+artifact_digest',
        release_set_revision_affects_component_update: false,
        unchanged_component_behavior: 'reuse_existing_artifact_digest_without_rebuild_or_reinstall',
      },
      channel_pointer_policy: {
        mutable_tags: ['candidate', 'latest-stable'],
        promotion_mode: 'retag_exact_immutable_release_set_digest',
        channel_is_not_bom_content: true,
      },
      components: {
        base: {
          component_id: 'opl-base',
          component_kind: 'base',
          version: baseVersion,
          source_commit: null as string | null,
          artifact_ref: buildFrameworkRef(owner, baseVersion),
          artifact_digest: null as string | null,
          artifact_status: 'pending_remote_verification',
        },
        app: buildAppComponent(input.appComponent),
        packages: {
          component_kind: 'package_collection',
          package_count: PACKAGE_SPECS.length,
          package_ids: PACKAGE_SPECS.map((spec) => spec.package_id),
          members: packageMembers,
        },
      },
    },
    generated_at: generatedAt,
    package_install_update_source: 'per_package_owner_latest_stable',
    package_consumption_status: 'ordinary_app_users_compose_independent_ghcr_packages',
    developer_package_source_override: {
      carrier_env: 'OPL_MODULE_SOURCE_MODE=git_checkout',
      scope: 'developer_mode_checkout',
      app_setting_surface: 'Developer Mode',
      rule: 'Developer Mode selects explicit repo checkout carriers; ordinary App users resolve each selected Package from its owner latest-stable channel.',
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
        version: baseVersion,
        artifact_kind: 'framework_source_archive',
        artifact: buildFrameworkRef(owner, baseVersion),
        package_channel_status: 'active_release_channel',
        package_lifecycle_status: 'active_release_channel',
        remote_publish_status: PACKAGE_REMOTE_PUBLISH_STATUS,
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
          current_stable_source: 'opl_release_channel_manifest',
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
            package_id: spec.package_id,
            package_version: packageVersion,
            label: spec.label,
            carrier_locator: {
              carrier_kind: 'opl_managed_module_source',
              module_id: spec.module_id,
              repo_name: spec.repo_name,
              repo_url: spec.repo_url,
            },
            scope: spec.scope,
            package_manifest_ref: spec.package_manifest_ref,
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
            oci_artifact_status: 'pending_remote_verification',
            package_channel_status: 'active_release_channel',
            package_lifecycle_status: 'active_release_channel',
            package_lifecycle_reason: 'ordinary App users resolve this Package from its independent GHCR owner channel; domain truth remains repo-owned',
            remote_publish_status: PACKAGE_REMOTE_PUBLISH_STATUS,
            package_consumption_status: 'consumed_by_independent_owner_channel_installs',
            current_install_update_source: 'per_package_owner_latest_stable',
            developer_git_checkout_override: {
              repo_url: spec.repo_url,
              ref: 'main',
              app_setting_surface: 'Developer Mode',
              env: `OPL_MODULE_SOURCE_MODE=git_checkout or OPL_MODULE_PATH_${spec.module_id.toUpperCase()}`,
              env_role: 'low_level_diagnostic_ci_override',
            },
            release_discipline: buildPackageReleaseDiscipline(spec, rollbackVersion),
            install_strategy: 'extract_to_managed_package_root',
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

export function getOplPackageSpecs(packageDirectory?: string) {
  return loadOplPackageSpecs(packageDirectory).map((spec) => ({
    ...spec,
    tags: [...spec.tags],
    package_role: packageRole(spec),
    selected_version: projectedPackageVersion(spec),
    stable_version: null,
    manifest_url: spec.package_manifest_ref,
    trust_tier: 'first_party' as const,
  }));
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

function packageRelativePath(value: string | null, field: string, allowRoot = false) {
  if (!value || value.includes('\\') || path.posix.isAbsolute(value)) {
    throw new Error(`${field} must be a relative POSIX package path.`);
  }
  const normalized = path.posix.normalize(value);
  if (normalized === '..'
    || normalized.startsWith('../')
    || (!allowRoot && normalized === '.')) {
    throw new Error(`${field} must stay inside the package source archive root.`);
  }
  return normalized;
}

export function materializeArchiveBackedPackagePayload(input: {
  payload: Record<string, unknown>;
  payloadRef: string;
  packageId: string;
  packageVersion: string;
  ownerSourceCommit: string | null;
  sourceArtifactRef: string;
  archiveSha256: string | null;
  archiveRoot: string;
}) {
  if (!/^[0-9a-f]{40}$/.test(input.ownerSourceCommit ?? '')) {
    throw new Error(`${input.payloadRef}.source_commit must be an exact Git commit.`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(input.archiveSha256 ?? '')) {
    throw new Error(`${input.payloadRef}.package_source.archive_sha256 must be an exact SHA-256 digest.`);
  }
  const expectedArtifactSuffix = `/one-person-lab-packages/${input.packageId}:${input.packageVersion}`;
  if (!input.sourceArtifactRef.startsWith('ghcr.io/')
    || !input.sourceArtifactRef.endsWith(expectedArtifactSuffix)) {
    throw new Error(`${input.payloadRef}.package_source.artifact_ref must select the exact Package id and version.`);
  }
  const archiveRoot = packageRelativePath(
    input.archiveRoot,
    `${input.payloadRef}.package_source.archive_root`,
  );
  const sourceRepo = stringValue(input.payload.source_repo);
  let expectedArchiveRoot: string | null = null;
  try {
    const sourceUrl = sourceRepo ? new URL(sourceRepo) : null;
    const components = sourceUrl?.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/') ?? [];
    if (sourceUrl?.protocol === 'https:' && sourceUrl.hostname === 'github.com' && components.length === 2) {
      expectedArchiveRoot = components[1];
    }
  } catch {
    expectedArchiveRoot = null;
  }
  if (!expectedArchiveRoot || archiveRoot !== expectedArchiveRoot) {
    throw new Error(`${input.payloadRef}.package_source.archive_root must match the Package owner repository.`);
  }
  const payloadSourceRoot = packageRelativePath(
    stringValue(input.payload.source_root),
    `${input.payloadRef}.source_root`,
    true,
  );
  if (!Array.isArray(input.payload.files) || input.payload.files.length === 0) {
    throw new Error(`${input.payloadRef}.files must contain at least one payload file.`);
  }
  const trackedSourceCommit = stringValue(input.payload.source_commit);
  return {
    ...input.payload,
    package_id: input.packageId,
    package_version: input.packageVersion,
    source_commit: input.ownerSourceCommit,
    ...(input.payload.surface_kind === 'opl_package_payload_manifest.v2'
      ? {}
      : { source_root: undefined }),
    ...(trackedSourceCommit && trackedSourceCommit !== input.ownerSourceCommit
      ? { migration_source_commit: trackedSourceCommit }
      : {}),
    package_source: {
      transport: 'same_oci_artifact_source_archive',
      artifact_ref: input.sourceArtifactRef,
      archive_sha256: input.archiveSha256,
      archive_root: archiveRoot,
    },
    files: input.payload.files.map((candidate, index) => {
      const file = stringRecord(candidate);
      if (!file) {
        throw new Error(`${input.payloadRef}.files[${index}] must be an object.`);
      }
      const payloadFilePath = packageRelativePath(
        stringValue(file.path),
        `${input.payloadRef}.files[${index}].path`,
      );
      const sourcePath = payloadSourceRoot === '.'
        ? payloadFilePath
        : path.posix.join(payloadSourceRoot, payloadFilePath);
      const archiveFile = { ...file };
      delete archiveFile.content_utf8;
      delete archiveFile.content_base64;
      delete archiveFile.source_url;
      delete archiveFile.source_path;
      delete archiveFile.source_artifact_ref;
      return {
        ...archiveFile,
        path: payloadFilePath,
        source_path: sourcePath,
        source_artifact_ref: input.sourceArtifactRef,
      };
    }),
  };
}

function dependencyPackageIds(source: Record<string, unknown>) {
  const dependencies = Array.isArray(source.capability_dependencies) ? source.capability_dependencies : [];
  return dependencies.map((candidate) => stringRecord(candidate))
    .filter((candidate): candidate is Record<string, unknown> => candidate !== null)
    .map((candidate) => stringValue(candidate.package_id))
    .filter((packageId): packageId is string => packageId !== null)
    .sort((left, right) => left.localeCompare(right, 'en'));
}

function buildCurrentPackageCatalog(manifest: OplPackageManifest) {
  return Object.fromEntries(PACKAGE_SPECS.map((spec) => {
    const manifestPath = path.join(repoRoot, spec.package_manifest_ref);
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
      throw new Error(`Package manifest ${spec.package_manifest_ref} has no package_id or version.`);
    }
    const codexSurface = stringRecord(packageManifest.codex_surface);
    const payloadRef = codexSurface ? stringValue(codexSurface.plugin_payload_manifest_url) : null;
    if (!payloadRef) {
      throw new Error(`Package manifest ${spec.package_manifest_ref} has no payload manifest ref.`);
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
    const normalizedPayload = materializeArchiveBackedPackagePayload({
      payload,
      payloadRef,
      packageId,
      packageVersion,
      ownerSourceCommit: packageEntry.owner_source_commit,
      sourceArtifactRef,
      archiveSha256: packageEntry.package_content_digest,
      archiveRoot: spec.repo_name,
    });
    const manifestSource = `${JSON.stringify(normalizedManifest, null, 2)}\n`;
    const payloadSource = `${JSON.stringify(normalizedPayload, null, 2)}\n`;
    const contentLock = stringRecord(packageManifest.content_lock);
    const distributionPayload = stringRecord(packageManifest.distribution_payload);
    const dependencyIds = dependencyPackageIds(packageManifest);
    const manifestUrl = `opl+oci://${sourceArtifactRef}#/package-manifest.json`;
    const manifestSha256 = sha256Payload(manifestSource);
    const versionEntry = {
      package_version: packageVersion,
      selection_status: 'selected_for_release_set',
      manifest_url: manifestUrl,
      manifest_sha256: manifestSha256,
      manifest_json: manifestSource,
      package_manifest: {
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
      dependency_package_ids: dependencyIds,
    };
    return [packageId, {
      package_id: packageId,
      display_name: spec.label,
      publisher: 'one-person-lab',
      description: spec.description,
      tags: [...spec.tags],
      package_role: packageRole(spec),
      trust_tier: 'first_party',
      selected_version: packageVersion,
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
  const manifest = stringRecord(candidate.package_manifest);
  const manifestJson = typeof candidate.manifest_json === 'string' ? candidate.manifest_json : null;
  const manifestSha256 = stringValue(candidate.manifest_sha256);
  return Boolean(
    stringValue(candidate.package_version)
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
  const leftSelected = left.selection_status === 'selected_for_release_set' ? 1 : 0;
  const rightSelected = right.selection_status === 'selected_for_release_set' ? 1 : 0;
  if (leftSelected !== rightSelected) {
    return rightSelected - leftSelected;
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
    const previousCurrentVersion = previousVersions.find((candidate) => (
      stringValue(candidate.package_version) === generatedCurrentVersion.package_version
    ));
    const immutableIdentityFields = [
      'package_content_digest',
      'owner_source_commit',
      'owner_package_manifest_sha256',
      'owner_language_version',
      'owner_version_tag',
      'source_artifact_ref',
    ] as const;
    const immutableIdentityDrift = previousCurrentVersion
      ? immutableIdentityFields.filter((field) => (
          (previousCurrentVersion[field] ?? null) !== (generatedCurrentVersion[field] ?? null)
        ))
      : [];
    if (immutableIdentityDrift.length > 0) {
      throw new Error(
        `Immutable Package version collision for ${packageId}:${generatedCurrentVersion.package_version}: `
        + `${immutableIdentityDrift.join(', ')} changed. Bump the owner Package version before publication.`,
      );
    }
    const reusablePublishedVersion = previousCurrentVersion
      && previousCurrentVersion.artifact_status === 'published_immutable'
      && /^sha256:[0-9a-f]{64}$/.test(stringValue(previousCurrentVersion.artifact_digest) ?? '')
      ? previousCurrentVersion
      : null;
    if (reusablePublishedVersion && !isRetainableCatalogVersion(reusablePublishedVersion)) {
      throw new Error(
        `Published immutable Package version ${packageId}:${generatedCurrentVersion.package_version} `
        + 'is incomplete in the previous channel manifest.',
      );
    }
    const currentVersion = reusablePublishedVersion
      ? {
          ...generatedCurrentVersion,
          artifact_digest: reusablePublishedVersion.artifact_digest,
          artifact_status: reusablePublishedVersion.artifact_status,
          selection_status: 'selected_for_release_set',
        }
      : generatedCurrentVersion;
    const retained = previousVersions
      .filter(isRetainableCatalogVersion)
      .map((candidate): Record<string, unknown> => {
        const retainedVersion: Record<string, unknown> = {
          ...candidate,
          selection_status: 'retained_history',
        };
        delete retainedVersion.capability_abi;
        delete retainedVersion.compatibility;
        delete retainedVersion.dependency_requirements;
        return retainedVersion;
      });
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
      dependency_package_ids: Array.isArray(currentVersion.dependency_package_ids)
        ? currentVersion.dependency_package_ids
        : current.dependency_package_ids,
      versions: [...byVersion.values()].sort(comparePackageVersions).slice(0, retainVersions),
    }];
  }));
}

function synchronizeReleaseSetBom(
  manifest: OplPackageManifest,
  packageCatalog: ReturnType<typeof mergePackageCatalog>,
) {
  const packageArtifacts = manifest.packages.package_artifacts as Record<string, {
    oci_artifact_digest: string | null;
    oci_artifact_status: string;
    remote_publish_status: string;
  }>;
  const members = manifest.release_set.components.packages.members as Record<string, {
    owner_source_commit: string | null;
    source_commit: string | null;
    oci_artifact_digest: string | null;
    artifact_digest: string | null;
    artifact_status: string;
  }>;
  let complete = true;
  for (const [packageId, catalogEntry] of Object.entries(packageCatalog)) {
    const selected = catalogEntry.versions.find((candidate) => (
      candidate.selection_status === 'selected_for_release_set'
    ));
    const artifact = packageArtifacts[packageId];
    const member = members[packageId];
    if (!selected || !artifact || !member) {
      complete = false;
      continue;
    }
    const digest = stringValue(selected.artifact_digest);
    const status = stringValue(selected.artifact_status) ?? 'pending_remote_verification';
    const ownerSourceCommit = stringValue(selected.owner_source_commit);
    artifact.oci_artifact_digest = digest;
    artifact.oci_artifact_status = status;
    artifact.remote_publish_status = status === 'published_immutable'
      ? 'verified_reused_immutable_artifact'
      : PACKAGE_REMOTE_PUBLISH_STATUS;
    member.owner_source_commit = ownerSourceCommit;
    member.source_commit = ownerSourceCommit;
    member.oci_artifact_digest = digest;
    member.artifact_digest = digest;
    member.artifact_status = status;
    if (status !== 'published_immutable'
      || !/^sha256:[0-9a-f]{64}$/.test(digest ?? '')
      || !/^[0-9a-f]{40}$/.test(ownerSourceCommit ?? '')) {
      complete = false;
    }
  }
  const base = manifest.release_set.components.base;
  const app = manifest.release_set.components.app;
  const baseComplete = base.artifact_status === 'published_immutable'
    && /^sha256:[0-9a-f]{64}$/.test(base.artifact_digest ?? '')
    && /^[0-9a-f]{40}$/.test(base.source_commit ?? '');
  const appComplete = app.artifact_status === 'published_immutable'
    && /^sha256:[0-9a-f]{64}$/.test(app.artifact_digest ?? '')
    && /^[0-9a-f]{40}$/.test(app.source_commit ?? '');
  manifest.release_set.bom_status = complete && baseComplete && appComplete
    ? 'complete'
    : 'pending_remote_verification';
}

export function buildOplPackageChannelManifest(manifest: OplPackageManifest, previousManifest: unknown = null) {
  const retainVersions = manifest.release_automation.cleanup.retain_versions;
  const packageCatalog = mergePackageCatalog(
    buildCurrentPackageCatalog(manifest),
    previousManifest,
    retainVersions,
  );
  synchronizeReleaseSetBom(manifest, packageCatalog);
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
