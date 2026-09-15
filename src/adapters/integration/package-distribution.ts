import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getAgentPackageManifestByModuleId,
  listFirstPartyAgentPackageManifests,
} from './agent-package-manifests.ts';
import { listCurrentPackageProjections } from '../../kernel/standard-agent-registry.ts';
import { getOplReleaseRepo } from './opl-release.ts';
import { readBundledCodexDefaultProfile } from '../../kernel/local-codex-defaults.ts';
import { assertJsonSchemaPayload } from '../../kernel/schema-registry.ts';
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
  publication_channel_admission: 'admitted' | 'development_only';
  capability_dependencies?: readonly ModuleCapabilityDependency[];
  version: string;
};

type BuildPackageManifestInput = Partial<{
  generatedAt: string;
  owner: string;
  rollbackVersion: string | null;
  retainVersions: number;
  frameworkVersion: string;
}>;

export type OplPackageManifest = ReturnType<typeof buildOplPackageManifest>;

const PACKAGE_WORKFLOW_TRIGGER_POLICY = 'independent_owner_channel_workflow_call_or_manual_dispatch';
const PACKAGE_REMOTE_PUBLISH_STATUS = 'publication_workflow_configured_pending_remote_verification';
const PACKAGE_PAYLOAD_MANIFEST_SCHEMA_REF = 'contracts/opl-framework/package-payload-manifest-v2.schema.json';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const packagePayloadManifestSchema = JSON.parse(fs.readFileSync(
  path.join(repoRoot, PACKAGE_PAYLOAD_MANIFEST_SCHEMA_REF),
  'utf8',
)) as Record<string, unknown>;

function assertCanonicalPackagePayloadManifest(payload: Record<string, unknown>, sourceRef: string) {
  if (payload.surface_kind !== 'opl_package_payload_manifest.v2'
    || payload.schema_ref !== PACKAGE_PAYLOAD_MANIFEST_SCHEMA_REF) {
    throw new Error(`${sourceRef} must use the canonical v2 Package payload manifest.`);
  }
  assertJsonSchemaPayload({
    schemaId: typeof packagePayloadManifestSchema.$id === 'string'
      ? packagePayloadManifestSchema.$id
      : PACKAGE_PAYLOAD_MANIFEST_SCHEMA_REF,
    schema: packagePayloadManifestSchema,
    sourceRef: PACKAGE_PAYLOAD_MANIFEST_SCHEMA_REF,
  }, payload);
}

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

function projectionPublicationChannelAdmission(payload: Record<string, unknown>) {
  const value = payload.publication_channel_admission;
  if (value === undefined || value === 'admitted') return 'admitted' as const;
  if (value === 'development_only') return value;
  throw new Error('Package projection publication_channel_admission must be admitted or development_only.');
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
          : 'plugin.json'),
      ...(agentManifest?.owner_language_version_ref
        ? { owner_language_version_ref: agentManifest.owner_language_version_ref }
        : typeof publicationSource?.owner_language_version_ref === 'string'
          ? { owner_language_version_ref: publicationSource.owner_language_version_ref }
          : {}),
      publication_channel_admission: projectionPublicationChannelAdmission(payload),
      capability_dependencies: agentManifest?.capability_dependencies ?? [],
      version: projectionString(payload, 'version'),
    };
  });
}

const APP_OWNED_PACKAGE_REPO = 'one-person-lab-app';

function isFrameworkManagedPackage(spec: PackageSpec) {
  return spec.repo_name !== APP_OWNED_PACKAGE_REPO;
}

function isFrameworkPublishedPackage(spec: PackageSpec) {
  return isFrameworkManagedPackage(spec) && spec.publication_channel_admission === 'admitted';
}

const PUBLISHED_PACKAGE_SPECS = loadOplPackageSpecs().filter(isFrameworkPublishedPackage);

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
    package_lifecycle_status: 'active_release_channel',
    workflow_trigger_policy: PACKAGE_WORKFLOW_TRIGGER_POLICY,
    remote_publish_status: PACKAGE_REMOTE_PUBLISH_STATUS,
    artifact_build: { workflow: '.github/workflows/publish-package.yml', required_input: 'package_id' },
    cleanup: {
      retain_versions: retainVersions,
      execution_mode: 'dry_run_first_explicit_execute_required',
      protected_tags: ['candidate', 'latest-stable'],
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
  return PUBLISHED_PACKAGE_SPECS
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
  const owner = resolveOwner(input.owner);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const retainVersions = normalizeRetainVersions(input.retainVersions);
  const rollbackVersion = input.rollbackVersion === undefined ? null : input.rollbackVersion;
  const baseVersion = frameworkVersion(input.frameworkVersion);
  return {
    manifest_version: 1,
    manifest_role: 'local_package_distribution_projection',
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
        current_install_update_source: 'framework_owner_channel',
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
          current_stable_source: 'framework_owner_channel',
          developer_override_source: 'git_checkout',
          required_gates: [
            'source_archive_built_from_head',
            'sha256_recorded',
            'framework_version_annotation_written',
            'ghcr_framework_artifact_published',
                        'runtime_substrate_apply_and_rollback_tested',
          ],
          [MANAGED_UPDATE_OWNER_FIELDS.revertPlan]: rollbackVersion
            ? {
                version: rollbackVersion,
                source: 'previous_framework_artifact',
              }
            : null,
        },
      },
      package_artifacts: Object.fromEntries(
        PUBLISHED_PACKAGE_SPECS.map((spec) => [
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
  return loadOplPackageSpecs(packageDirectory).filter(isFrameworkManagedPackage).map((spec) => ({
    ...spec,
    tags: [...spec.tags],
    package_role: packageRole(spec),
    selected_version: projectedPackageVersion(spec),
    stable_version: null,
    manifest_url: spec.package_manifest_ref,
    trust_tier: 'first_party' as const,
  }));
}

export function getPublicationAdmittedOplPackageSpecs(packageDirectory?: string) {
  return loadOplPackageSpecs(packageDirectory).filter(isFrameworkPublishedPackage).map((spec) => ({
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
  assertCanonicalPackagePayloadManifest(input.payload, input.payloadRef);
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
  if (input.payload.package_id !== input.packageId
    || input.payload.package_version !== input.packageVersion
    || input.payload.source_commit !== input.ownerSourceCommit) {
    throw new Error(`${input.payloadRef} identity must match the exact Package publication selection.`);
  }
  const seenPayloadPaths = new Set<string>();
  const materialized = {
    ...input.payload,
    package_id: input.packageId,
    package_version: input.packageVersion,
    source_commit: input.ownerSourceCommit,
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
      if (seenPayloadPaths.has(payloadFilePath)) {
        throw new Error(`${input.payloadRef}.files repeats package path ${payloadFilePath}.`);
      }
      seenPayloadPaths.add(payloadFilePath);
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
  assertCanonicalPackagePayloadManifest(materialized, input.payloadRef);
  return materialized;
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
