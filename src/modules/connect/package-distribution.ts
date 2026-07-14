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
  description: string;
  tags: readonly string[];
  repo_name: string;
  repo_url: string;
  scope: 'domain_module' | 'runtime_dependency' | 'framework_capability_package';
  package_id: 'mas' | 'mag' | 'rca' | 'oma' | 'obf' | 'mas-scholar-skills' | 'opl-flow';
  package_manifest_ref: string;
  owner_package_manifest_ref: string;
  owner_manifest_kind: 'standard_agent' | 'capability_package' | 'workflow_profile';
  owner_plugin_manifest_ref: string;
  owner_language_version_ref?: string;
  capability_dependencies?: readonly ModuleCapabilityDependency[];
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
  component_manifest_ref: string;
  component_manifest_digest: string;
};

export type OplPackageManifest = ReturnType<typeof buildOplPackageManifest>;

const PACKAGE_WORKFLOW_TRIGGER_POLICY = 'release_gate_workflow_call_or_manual_dispatch';
const PACKAGE_REMOTE_PUBLISH_STATUS = 'publication_workflow_configured_pending_remote_verification';
const RELEASE_SET_GENERATION_PATTERN = /^\d{2}\.\d{1,2}\.\d{1,2}(?:-r[1-9]\d*)?$/;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const PACKAGE_SPECS: PackageSpec[] = [
  {
    module_id: 'medautoscience',
    label: 'Med Auto Science',
    description: 'Medical research workflows for evidence, analysis, writing, figures, and submission.',
    tags: ['medical-research', 'evidence', 'manuscript'],
    repo_name: 'med-autoscience',
    repo_url: 'https://github.com/gaofeng21cn/med-autoscience.git',
    scope: 'domain_module',
    package_id: 'mas',
    package_manifest_ref: 'contracts/opl-framework/packages/mas.json',
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_manifest_kind: 'standard_agent',
    owner_plugin_manifest_ref: 'plugins/med-autoscience/.codex-plugin/plugin.json',
    owner_language_version_ref: 'pyproject.toml',
    capability_dependencies: getCapabilityDependenciesForModule('medautoscience'),
  },
  {
    module_id: 'medautogrant',
    label: 'Med Auto Grant',
    description: 'Grant planning, drafting, critique, revision, and submission workflows.',
    tags: ['grant-writing', 'proposal', 'review'],
    repo_name: 'med-autogrant',
    repo_url: 'https://github.com/gaofeng21cn/med-autogrant.git',
    scope: 'domain_module',
    package_id: 'mag',
    package_manifest_ref: 'contracts/opl-framework/packages/mag.json',
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_manifest_kind: 'standard_agent',
    owner_plugin_manifest_ref: 'plugins/med-autogrant/.codex-plugin/plugin.json',
    owner_language_version_ref: 'pyproject.toml',
  },
  {
    module_id: 'redcube',
    label: 'RedCube AI',
    description: 'Visual deliverable, presentation, and figure production workflows.',
    tags: ['visual-deliverables', 'presentations', 'figures'],
    repo_name: 'redcube-ai',
    repo_url: 'https://github.com/gaofeng21cn/redcube-ai.git',
    scope: 'domain_module',
    package_id: 'rca',
    package_manifest_ref: 'contracts/opl-framework/packages/rca.json',
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_manifest_kind: 'standard_agent',
    owner_plugin_manifest_ref: 'plugins/redcube-ai/.codex-plugin/plugin.json',
    owner_language_version_ref: 'package.json',
  },
  {
    module_id: 'oplmetaagent',
    label: 'OPL Meta Agent',
    description: 'Agent architecture, baseline, takeover, and OPL conformance workflows.',
    tags: ['agent-design', 'architecture', 'conformance'],
    repo_name: 'opl-meta-agent',
    repo_url: 'https://github.com/gaofeng21cn/opl-meta-agent.git',
    scope: 'domain_module',
    package_id: 'oma',
    package_manifest_ref: 'contracts/opl-framework/packages/oma.json',
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_manifest_kind: 'standard_agent',
    owner_plugin_manifest_ref: 'plugins/opl-meta-agent/.codex-plugin/plugin.json',
    owner_language_version_ref: 'package.json',
  },
  {
    module_id: 'oplbookforge',
    label: 'OPL Book Forge',
    description: 'Long-form book architecture, drafting, review, and publication workflows.',
    tags: ['book-authoring', 'long-form', 'publishing'],
    repo_name: 'opl-bookforge',
    repo_url: 'https://github.com/gaofeng21cn/opl-bookforge.git',
    scope: 'domain_module',
    package_id: 'obf',
    package_manifest_ref: 'contracts/opl-framework/packages/obf.json',
    owner_package_manifest_ref: 'contracts/opl_agent_package_manifest.json',
    owner_manifest_kind: 'standard_agent',
    owner_plugin_manifest_ref: 'plugins/opl-bookforge/.codex-plugin/plugin.json',
    owner_language_version_ref: 'package.json',
  },
  {
    module_id: 'scholarskills',
    label: 'MAS Scholar Skills',
    description: 'Reusable medical research capabilities consumed by Med Auto Science.',
    tags: ['medical-research', 'capabilities', 'skills'],
    repo_name: 'mas-scholar-skills',
    repo_url: 'https://github.com/gaofeng21cn/mas-scholar-skills.git',
    scope: 'framework_capability_package',
    package_id: 'mas-scholar-skills',
    package_manifest_ref: 'contracts/opl-framework/packages/mas-scholar-skills.json',
    owner_package_manifest_ref: 'contracts/opl_capability_package_manifest.json',
    owner_manifest_kind: 'capability_package',
    owner_plugin_manifest_ref: '.codex-plugin/plugin.json',
  },
  {
    module_id: 'oplflow',
    label: 'OPL Flow',
    description: 'Recommended OPL workflow profile and managed Codex policy.',
    tags: ['workflow-profile', 'codex', 'policy'],
    repo_name: 'opl-flow',
    repo_url: 'https://github.com/gaofeng21cn/opl-flow.git',
    scope: 'runtime_dependency',
    package_id: 'opl-flow',
    package_manifest_ref: 'contracts/opl-framework/packages/opl-flow.json',
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
  const source = JSON.parse(fs.readFileSync(path.join(repoRoot, spec.package_manifest_ref), 'utf8')) as Record<string, unknown>;
  return normalizeDistributionVersion(stringValue(source.version) ?? '0.0.0');
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
  };
}

export function normalizeReleaseSetGeneration(value: string) {
  const generation = value.trim().replace(/^v/, '');
  if (!RELEASE_SET_GENERATION_PATTERN.test(generation)) {
    throw new Error(`Release Set generation must use YY.M.D or YY.M.D-rN, got: ${value}`);
  }
  return generation;
}

function packageRole(spec: PackageSpec): 'standard_agent' | 'framework_capability_package' | 'workflow_profile' {
  return spec.owner_manifest_kind === 'workflow_profile'
    ? 'workflow_profile'
    : spec.scope === 'framework_capability_package'
      ? 'framework_capability_package'
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
    current_stable_source: 'opl_release_channel_manifest',
    developer_override_source: 'git_checkout',
    required_gates: [
      'upstream_default_branch_reachable',
      'clean_checkout_or_fresh_clone',
      'source_archive_built_from_head',
      'sha256_recorded',
      'channel_manifest_written',
      'ghcr_package_artifact_published',
      'immutable_version_remote_digest_preflight',
      'repository_source_association_verified',
      'anonymous_digest_pull_verified',
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
    .map((spec) => spec.package_id);
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
    package_install_update_source: 'package_channel',
    package_consumption_status: 'ordinary_app_users_consume_managed_ghcr_packages',
    developer_package_source_override: {
      carrier_env: 'OPL_MODULE_SOURCE_MODE=git_checkout',
      scope: 'developer_mode_checkout',
      app_setting_surface: 'Developer Mode',
      rule: 'Developer Mode selects explicit repo checkout carriers; ordinary App users consume the GHCR OPL Packages latest-stable Release Set.',
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
            package_lifecycle_reason: 'ordinary App users and package-channel installs consume the GHCR capability packages channel; domain truth remains repo-owned',
            remote_publish_status: PACKAGE_REMOTE_PUBLISH_STATUS,
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

export function getOplPackageSpecs() {
  return PACKAGE_SPECS.map((spec) => ({
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
    const payloadSourceRoot = packageRelativePath(
      stringValue(payload.source_root),
      `${payloadRef}.source_root`,
      true,
    );
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
      ...(payload.surface_kind === 'opl_package_payload_manifest.v2'
        ? {}
        : { source_root: undefined }),
      ...(trackedSourceCommit && trackedSourceCommit !== packageEntry.owner_source_commit
        ? { migration_source_commit: trackedSourceCommit }
        : {}),
      package_source: {
        transport: 'same_oci_artifact_source_archive',
        artifact_ref: sourceArtifactRef,
        archive_sha256: packageEntry.package_content_digest,
        archive_root: spec.repo_name,
      },
      files: Array.isArray(payload.files)
          ? payload.files.map((candidate) => {
            const file = stringRecord(candidate) ?? {};
            const payloadFilePath = packageRelativePath(
              stringValue(file.path),
              `${payloadRef}.files[].path`,
            );
            const sourcePath = payloadSourceRoot === '.'
              ? payloadFilePath
              : path.posix.join(payloadSourceRoot, payloadFilePath);
            return {
              ...file,
              path: payloadFilePath,
              source_path: sourcePath,
              source_artifact_ref: sourceArtifactRef,
              content_utf8: undefined,
              content_base64: undefined,
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
    const manifestUrl = `opl+oci://${sourceArtifactRef}#/package-manifest.json`;
    const manifestSha256 = sha256Payload(manifestSource);
    const versionEntry = {
      package_version: packageVersion,
      capability_abi: capabilityAbi ? stringValue(capabilityAbi.id) : null,
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
      dependency_package_ids: dependencies.map((dependency) => dependency.package_id),
      dependency_requirements: dependencies,
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
          ...reusablePublishedVersion,
          selection_status: 'selected_for_release_set',
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
        selection_status: 'retained_history',
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
