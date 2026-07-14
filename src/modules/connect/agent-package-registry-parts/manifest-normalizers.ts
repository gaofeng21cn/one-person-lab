import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { recordList, stringList, stringValue } from '../../../kernel/json-record.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { MANIFEST_REQUIRED_FIELDS, REGISTRY_REQUIRED_FIELDS } from './constants.ts';
import {
  assertNoForbiddenFields,
  assertStringValue,
  missingFields,
  nowIso,
  uniqueStrings,
  validateUrlLike,
} from './shared.ts';
import type {
  AgentPackageCapabilityDependency,
  AgentPackageCapabilityProvider,
  AgentPackageManagedVersionCatalogSource,
  AgentPackageDistributionPayload,
  AgentPackageManifest,
  AgentPackageManagedPolicySurfaceConfig,
  AgentPackageOrdinaryUserSource,
  AgentPackageProfileSurfaceConfig,
  AgentPackageRegistryCache,
  AgentPackageRegistryEntry,
  AgentPackageRole,
} from './types.ts';

const AGENT_PACKAGE_ROLES = new Set<AgentPackageRole>([
  'standard_agent',
  'framework_capability_package',
  'workflow_profile',
]);

function normalizeAgentPackageRole(value: unknown, field: string): AgentPackageRole | null {
  const role = stringValue(value);
  if (!role) return null;
  if (!AGENT_PACKAGE_ROLES.has(role as AgentPackageRole)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry role is invalid.', {
      field,
      role,
      allowed_roles: [...AGENT_PACKAGE_ROLES],
      failure_code: 'agent_package_registry_role_invalid',
    });
  }
  return role as AgentPackageRole;
}

function normalizeCapabilityDependencies(
  value: unknown,
  manifestUrl: string,
): AgentPackageCapabilityDependency[] {
  if (!Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest capability_dependencies must be an array.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  const entries = recordList(value);
  if (entries.length !== value.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package capability dependencies must be objects.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_capability_dependency_invalid',
    });
  }
  const dependencies = entries.map((entry, index) => {
    const packageId = canonicalManifestIdentity(entry.package_id, `capability_dependencies[${index}].package_id`);
    const required = entry.required === true;
    const versionRequirement = assertStringValue(
      entry.version_requirement,
      `capability_dependencies[${index}].version_requirement`,
    );
    const capabilityAbi = assertStringValue(
      entry.capability_abi,
      `capability_dependencies[${index}].capability_abi`,
    );
    const requiredExportIds = uniqueStrings(stringList(entry.required_export_ids));
    const requiredModuleIds = uniqueStrings(stringList(entry.required_module_ids));
    if (!required || requiredExportIds.length === 0 || requiredModuleIds.length === 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Required capability dependencies must declare required=true, required_export_ids, and required_module_ids.', {
        manifest_url: manifestUrl,
        package_id: packageId,
        dependency_index: index,
        failure_code: 'agent_package_capability_dependency_invalid',
      });
    }
    const bootstrapManifestRef = stringValue(entry.bootstrap_manifest_url)
      ?? stringValue(entry.manifest_url);
    return {
      package_id: packageId,
      required,
      version_requirement: versionRequirement,
      capability_abi: capabilityAbi,
      required_export_ids: requiredExportIds,
      required_module_ids: requiredModuleIds,
      bootstrap_manifest_url: bootstrapManifestRef
        ? resolveManifestRelativeSource(bootstrapManifestRef, manifestUrl)
        : null,
      dependency_source: normalizeManagedVersionCatalogSource(entry.dependency_source, manifestUrl),
    };
  });
  const duplicatePackageIds = dependencies
    .map((entry) => entry.package_id)
    .filter((packageId, index, values) => values.indexOf(packageId) !== index);
  if (duplicatePackageIds.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability dependency package ids must be unique.', {
      manifest_url: manifestUrl,
      duplicate_package_ids: uniqueStrings(duplicatePackageIds),
      failure_code: 'agent_package_capability_dependency_invalid',
    });
  }
  return dependencies;
}

function normalizeManagedVersionCatalogSource(
  value: unknown,
  manifestUrl: string,
): AgentPackageManagedVersionCatalogSource | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)
    || value.kind !== 'managed_version_catalog'
    || (value.transport !== 'json_url' && value.transport !== 'opl_oci_channel')
    || (value.selection_policy !== 'highest_stable' && value.selection_policy !== 'highest_compatible')
    || value.digest_authority !== 'manifest_and_content_digest') {
    throw new FrameworkContractError('contract_shape_invalid', 'Managed package update source must declare a digest-authoritative version catalog.', {
      failure_code: 'agent_package_managed_version_catalog_invalid',
    });
  }
  const catalogRef = assertStringValue(value.catalog_ref, 'managed_version_catalog.catalog_ref');
  return {
    kind: 'managed_version_catalog' as const,
    transport: value.transport as AgentPackageManagedVersionCatalogSource['transport'],
    catalog_ref: value.transport === 'json_url'
      ? resolveManifestRelativeSource(catalogRef, manifestUrl)
      : catalogRef,
    selection_policy: value.selection_policy as AgentPackageManagedVersionCatalogSource['selection_policy'],
    digest_authority: 'manifest_and_content_digest' as const,
  };
}

function normalizeCapabilityProvider(value: unknown): AgentPackageCapabilityProvider | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.exports)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability provider must declare an exports array.', {
      failure_code: 'agent_package_capability_provider_invalid',
    });
  }
  const capabilityAbi = assertStringValue(value.capability_abi, 'capability_provider.capability_abi');
  const rawExports = recordList(value.exports);
  if (rawExports.length !== value.exports.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability provider exports must be objects.', {
      failure_code: 'agent_package_capability_provider_invalid',
    });
  }
  const exports = rawExports.map((entry, index) => {
    const installMode = stringValue(entry.install_mode);
    if (installMode !== 'core_required' && installMode !== 'optional_named_specialty') {
      throw new FrameworkContractError('contract_shape_invalid', 'Capability provider export install_mode is invalid.', {
        export_index: index,
        install_mode: installMode,
        failure_code: 'agent_package_capability_provider_invalid',
      });
    }
    return {
      export_id: assertStringValue(entry.export_id, `capability_provider.exports[${index}].export_id`),
      skill_id: assertStringValue(entry.skill_id, `capability_provider.exports[${index}].skill_id`),
      install_mode: installMode as 'core_required' | 'optional_named_specialty',
    };
  });
  for (const field of ['export_id', 'skill_id'] as const) {
    const duplicateValues = exports
      .map((entry) => entry[field])
      .filter((entry, index, values) => values.indexOf(entry) !== index);
    if (duplicateValues.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', `Capability provider ${field} values must be unique.`, {
        duplicate_values: uniqueStrings(duplicateValues),
        failure_code: 'agent_package_capability_provider_invalid',
      });
    }
  }
  const moduleExportIds = uniqueStrings(stringList(value.module_export_ids));
  return { capability_abi: capabilityAbi, exports, module_export_ids: moduleExportIds };
}

function normalizedRelativePath(value: unknown, field: string) {
  const raw = assertStringValue(value, field);
  const normalized = path.normalize(raw);
  if (path.isAbsolute(raw) || normalized === '.' || normalized === '..' || normalized.startsWith(`..${path.sep}`)) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must stay within its declared package or Codex home root.`, {
      field,
      value: raw,
      failure_code: 'agent_package_profile_path_invalid',
    });
  }
  return normalized;
}

function normalizeProfileSurface(value: unknown): AgentPackageProfileSurfaceConfig | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || !isRecord(value.runtime_profile)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package profile_surface must declare runtime_profile.', {
      failure_code: 'agent_package_profile_surface_invalid',
    });
  }
  if (value.existing_profile_policy !== 'semantic_merge_required') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package profile_surface must fail closed to semantic merge for existing profiles.', {
      failure_code: 'agent_package_profile_surface_invalid',
      field: 'profile_surface.existing_profile_policy',
    });
  }
  if (value.runtime_profile.target_id !== 'user_agents_profile') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package runtime profile must target the canonical user profile id.', {
      failure_code: 'agent_package_profile_surface_invalid',
      field: 'profile_surface.runtime_profile.target_id',
    });
  }
  const authoringSources = recordList(value.authoring_sources ?? []);
  if (!Array.isArray(value.authoring_sources) || authoringSources.length !== value.authoring_sources.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package profile_surface.authoring_sources must be an array of objects.', {
      failure_code: 'agent_package_profile_surface_invalid',
    });
  }
  if (!Array.isArray(value.merge_context_paths)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package profile_surface.merge_context_paths must be an array.', {
      failure_code: 'agent_package_profile_surface_invalid',
    });
  }
  return {
    runtime_profile: {
      source_path: normalizedRelativePath(value.runtime_profile.source_path, 'profile_surface.runtime_profile.source_path'),
      target_id: 'user_agents_profile',
    },
    authoring_sources: authoringSources.map((entry, index) => {
      if (entry.target_id !== 'user_taste_source') {
        throw new FrameworkContractError('contract_shape_invalid', 'Agent package authoring source must target the canonical user authoring id.', {
          failure_code: 'agent_package_profile_surface_invalid',
          field: `profile_surface.authoring_sources[${index}].target_id`,
        });
      }
      return {
        source_path: normalizedRelativePath(entry.source_path, `profile_surface.authoring_sources[${index}].source_path`),
        target_id: 'user_taste_source' as const,
      };
    }),
    merge_context_paths: stringList(value.merge_context_paths).map((entry, index) =>
      normalizedRelativePath(entry, `profile_surface.merge_context_paths[${index}]`)),
    existing_profile_policy: 'semantic_merge_required',
  };
}

function normalizeManagedPolicySurface(value: unknown): AgentPackageManagedPolicySurfaceConfig | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || value.policy_kind !== 'opl_flow_workflow_policy') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package managed_policy_surface must declare a supported policy kind.', {
      failure_code: 'agent_package_managed_policy_surface_invalid',
    });
  }
  return {
    policy_kind: 'opl_flow_workflow_policy',
    source_path: normalizedRelativePath(value.source_path, 'managed_policy_surface.source_path'),
    schema_path: normalizedRelativePath(value.schema_path, 'managed_policy_surface.schema_path'),
  };
}

function normalizeDistributionPayload(value: unknown): AgentPackageDistributionPayload | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package distribution_payload must be a JSON object.', {
      failure_code: 'agent_package_distribution_payload_invalid',
    });
  }
  if (
    value.live_download_proof !== false
    || value.installed_reload_proof !== false
    || value.moving_tag !== 'latest-stable'
    || value.promotion_policy !== 'daily_candidate_gates_then_promote_latest_stable'
    || value.install_truth !== 'resolved_digest_lock'
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Package OCI distribution must use candidate/latest-stable and digest-lock install truth.', {
      failure_code: 'agent_package_distribution_policy_invalid',
      required: {
        live_download_proof: false,
        installed_reload_proof: false,
        moving_tag: 'latest-stable',
        promotion_policy: 'daily_candidate_gates_then_promote_latest_stable',
        install_truth: 'resolved_digest_lock',
      },
    });
  }
  const payloadDigestRef = assertStringValue(value.payload_digest_ref, 'distribution_payload.payload_digest_ref');
  if (!/^sha256:[0-9a-f]{64}$/.test(payloadDigestRef)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package install truth must be a SHA-256 digest ref.', {
      failure_code: 'agent_package_distribution_digest_required',
      payload_digest_ref: payloadDigestRef,
    });
  }
  const requiredSkillPackLockRefs = stringList(value.required_skill_pack_lock_refs);
  return {
    payload_kind: assertStringValue(value.payload_kind, 'distribution_payload.payload_kind'),
    payload_ref: assertStringValue(value.payload_ref, 'distribution_payload.payload_ref'),
    payload_digest_ref: payloadDigestRef,
    required_skill_pack_lock_refs: requiredSkillPackLockRefs,
    proof_status: assertStringValue(value.proof_status, 'distribution_payload.proof_status'),
    live_download_proof: false,
    installed_reload_proof: false,
    oci_ref: assertStringValue(value.oci_ref, 'distribution_payload.oci_ref'),
    oci_media_type: assertStringValue(value.oci_media_type, 'distribution_payload.oci_media_type'),
    immutable_tag: assertStringValue(value.immutable_tag, 'distribution_payload.immutable_tag'),
    moving_tag: 'latest-stable',
    promotion_policy: 'daily_candidate_gates_then_promote_latest_stable',
    install_truth: 'resolved_digest_lock',
  };
}

function normalizeOrdinaryUserSource(value: unknown, sourceLabel: string): AgentPackageOrdinaryUserSource | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package ordinary_user_source must be a JSON object.', {
      source: sourceLabel,
      failure_code: 'agent_package_ordinary_source_invalid',
    });
  }
  if (
    value.kind !== 'ghcr_oci_artifact_latest_stable'
    || value.registry !== 'ghcr.io'
    || value.latest_stable_is_only_ordinary_user_channel !== true
    || value.latest_stable_is_install_truth !== false
    || value.latest_stable_role !== 'ordinary_user_latest_stable_pointer_after_candidate_gates'
    || value.daily_candidate_build_gate !== 'daily_candidate_build_must_pass_before_promote_latest_stable'
    || value.developer_checkout_auto_apply_allowed !== false
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Package ordinary user source must use GHCR latest-stable after candidate gates without treating the moving tag as install truth.', {
      source: sourceLabel,
      failure_code: 'agent_package_ordinary_source_policy_invalid',
    });
  }
  const installTruth = stringList(value.install_truth);
  for (const required of ['immutable_version_tag', 'oci_digest', 'package_lock_receipt']) {
    if (!installTruth.includes(required)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package ordinary user source must declare immutable tag, OCI digest, and package lock receipt as install truth.', {
        source: sourceLabel,
        failure_code: 'agent_package_ordinary_source_install_truth_invalid',
        missing_install_truth: required,
      });
    }
  }
  const ordinaryUserRef = assertStringValue(value.ordinary_user_ref, `${sourceLabel}.ordinary_user_ref`);
  if (!ordinaryUserRef.endsWith(':latest-stable')) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Package ordinary user ref must be the latest-stable tag.', {
      source: sourceLabel,
      failure_code: 'agent_package_ordinary_source_latest_stable_ref_required',
      ordinary_user_ref: ordinaryUserRef,
    });
  }
  const artifactRef = assertStringValue(value.artifact_ref, `${sourceLabel}.artifact_ref`);
  const immutableVersionRefPattern = assertStringValue(
    value.immutable_version_ref_pattern,
    `${sourceLabel}.immutable_version_ref_pattern`,
  );
  const candidateRef = assertStringValue(value.candidate_ref, `${sourceLabel}.candidate_ref`);
  if (ordinaryUserRef !== `${artifactRef}:latest-stable`
    || candidateRef !== `${artifactRef}:candidate`
    || immutableVersionRefPattern !== `${artifactRef}:<semver>`) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL Package channel refs must share one canonical OCI artifact repository.', {
      source: sourceLabel,
      failure_code: 'agent_package_ordinary_source_repository_mismatch',
    });
  }
  return {
    kind: 'ghcr_oci_artifact_latest_stable',
    registry: 'ghcr.io',
    artifact_ref: artifactRef,
    ordinary_user_ref: ordinaryUserRef,
    immutable_version_ref_pattern: immutableVersionRefPattern,
    candidate_ref: candidateRef,
    latest_stable_role: 'ordinary_user_latest_stable_pointer_after_candidate_gates',
    latest_stable_is_only_ordinary_user_channel: true,
    daily_candidate_build_gate: 'daily_candidate_build_must_pass_before_promote_latest_stable',
    install_truth: installTruth,
    latest_stable_is_install_truth: false,
    developer_checkout_auto_apply_allowed: false,
  };
}

export function normalizeRegistryEntry(entry: Record<string, unknown>, index: number): AgentPackageRegistryEntry {
  const declaredPackageId = stringValue(entry.package_id);
  const packageId = declaredPackageId
    ? canonicalManifestIdentity(declaredPackageId, `registry.entries.${index}.package_id`)
    : null;
  const missing = missingFields(entry, REGISTRY_REQUIRED_FIELDS);
  assertNoForbiddenFields(entry, `registry.entries.${index}`);
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry entry is missing required fields.', {
      entry_index: index,
      missing_fields: missing,
    });
  }
  if ('latest_version' in entry) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry entries must not duplicate package version truth.', {
      entry_index: index,
      forbidden_field: 'latest_version',
      canonical_field: 'version_source_ref',
      failure_code: 'agent_package_registry_latest_version_retired',
    });
  }
  const manifestUrl = stringValue(entry.manifest_url)!;
  const versionSourceRef = stringValue(entry.version_source_ref)!;
  if (!manifestUrl.startsWith('opl+oci://')) {
    validateUrlLike(manifestUrl, `entries.${index}.manifest_url`);
  }
  if (!versionSourceRef.startsWith('opl+oci://')) {
    validateUrlLike(versionSourceRef, `entries.${index}.version_source_ref`);
  }
  const displayName = stringValue(entry.display_name)!;
  const packageRole = normalizeAgentPackageRole(entry.package_role, `entries.${index}.package_role`);
  const selectedVersion = stringValue(entry.selected_version);
  const stableVersion = stringValue(entry.stable_version);
  const manifestValidation = stringValue(entry.manifest_validation) ?? 'deferred';
  if (!['deferred', 'fetched_manifest', 'catalog_inline_manifest'].includes(manifestValidation)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry manifest validation state is invalid.', {
      entry_index: index,
      manifest_validation: manifestValidation,
      failure_code: 'agent_package_registry_manifest_validation_invalid',
    });
  }
  return {
    package_id: packageId!,
    display_name: displayName,
    publisher: stringValue(entry.publisher)!,
    description: stringValue(entry.description) ?? `${displayName} package.`,
    tags: uniqueStrings([...stringList(entry.tags), ...(packageRole ? [packageRole] : [])]),
    package_role: packageRole,
    source: stringValue(entry.source)!,
    manifest_url: manifestUrl,
    version_source_ref: versionSourceRef,
    selected_version: selectedVersion,
    stable_version: stableVersion,
    manifest_validation: manifestValidation as AgentPackageRegistryEntry['manifest_validation'],
    trust_tier: stringValue(entry.trust_tier)!,
    starter_default: entry.starter_default === true,
    codex_visible_entry: stringValue(entry.codex_visible_entry),
    required_skill_ids: stringList(entry.required_skill_ids),
    optional_skill_ids: stringList(entry.optional_skill_ids),
    home_shortcut_ids: stringList(entry.home_shortcut_ids),
    display_policy: stringValue(entry.display_policy),
    ordinary_user_source: normalizeOrdinaryUserSource(entry.ordinary_user_source, `registry.entries.${index}.ordinary_user_source`),
  };
}

export function normalizeRegistry(payload: unknown, registryUrl: string, registrySha256: string): AgentPackageRegistryCache {
  if (!isRecord(payload) || !Array.isArray(payload.entries)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry must contain an entries array.', {
      registry_url: registryUrl,
      required: ['entries'],
    });
  }
  const entries = recordList(payload.entries).map(normalizeRegistryEntry);
  if (entries.length !== payload.entries.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry entries must be JSON objects.', {
      registry_url: registryUrl,
      entry_count: payload.entries.length,
      valid_entry_count: entries.length,
    });
  }
  const duplicatePackageIds = entries
    .map((entry) => entry.package_id)
    .filter((packageId, index, values) => values.indexOf(packageId) !== index);
  if (duplicatePackageIds.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry package_id values must be unique.', {
      registry_url: registryUrl,
      duplicate_package_ids: uniqueStrings(duplicatePackageIds),
    });
  }
  return {
    surface_kind: 'opl_agent_package_registry_cache',
    version: 'opl-agent-package-registry-cache.v1',
    refreshed_at: nowIso(),
    registry_url: registryUrl,
    registry_sha256: registrySha256,
    entry_count: entries.length,
    entries,
  };
}

function normalizeSkillPackRefs(skillPacks: Record<string, unknown>[]) {
  return skillPacks.flatMap((pack) => {
    const packId = stringValue(pack.id);
    const source = stringValue(pack.source);
    const version = stringValue(pack.version);
    return packId ? [`${packId}${source ? `@${source}` : ''}${version ? `#${version}` : ''}`] : [];
  });
}

function canonicalManifestIdentity(value: unknown, field: string) {
  const declared = assertStringValue(value, field).toLowerCase();
  const canonical = canonicalAgentPackageId(declared);
  if (canonical !== declared) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package identity fields must use canonical package ids.', {
      field,
      declared_id: declared,
      canonical_id: canonical,
      failure_code: 'agent_package_identity_not_canonical',
    });
  }
  return declared;
}

function resolveManifestRelativeSource(value: string, manifestUrl: string) {
  if (
    value.startsWith('http://')
    || value.startsWith('https://')
    || value.startsWith('file:')
    || path.isAbsolute(value)
  ) {
    return value;
  }
  if (manifestUrl.startsWith('http://') || manifestUrl.startsWith('https://')) {
    return new URL(value, manifestUrl).toString();
  }
  const manifestPath = manifestUrl.startsWith('file:') ? fileURLToPath(manifestUrl) : manifestUrl;
  return path.resolve(path.dirname(manifestPath), value);
}

function normalizeManagedRuntimeSourceCarrier(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)
    || value.carrier_kind !== 'opl_managed_module_source'
    || !stringValue(value.module_id)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package runtime_source_carrier must declare an OPL managed module id.', {
      failure_code: 'agent_package_runtime_source_carrier_invalid',
      required: ['carrier_kind=opl_managed_module_source', 'module_id'],
    });
  }
  return {
    carrier_kind: 'opl_managed_module_source' as const,
    module_id: stringValue(value.module_id)!,
  };
}

function normalizePackageVersion(value: unknown) {
  const version = assertStringValue(value, 'version');
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package version must use SemVer.', {
      version,
      failure_code: 'agent_package_semver_required',
    });
  }
  return version;
}

function normalizeOwnerLanguageVersion(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || value.scheme !== 'pep440' || !stringValue(value.value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package owner_language_version must declare a supported scheme and value.', {
      failure_code: 'agent_package_owner_language_version_invalid',
    });
  }
  return { scheme: 'pep440' as const, value: stringValue(value.value)! };
}

export function normalizeManifest(payload: unknown, manifestUrl: string): AgentPackageManifest {
  if (!isRecord(payload)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must be a JSON object.', {
      manifest_url: manifestUrl,
    });
  }
  assertNoForbiddenFields(payload, 'manifest');
  const missing = missingFields(payload, MANIFEST_REQUIRED_FIELDS);
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest is missing required fields.', {
      manifest_url: manifestUrl,
      missing_fields: missing,
      failure_code: 'invalid_package_manifest',
    });
  }
  if (payload.surface_kind !== 'opl_agent_package_manifest.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest surface_kind must be opl_agent_package_manifest.v1.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  if (payload.carrier_source_role !== 'codex_plugin_default_carrier_not_package_truth') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest carrier_source_role must keep Codex plugin as carrier, not package truth.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  const declaredPackageRole = stringValue(payload.package_role);
  if (declaredPackageRole && declaredPackageRole !== 'standard_agent') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest declares an incompatible package role.', {
      manifest_url: manifestUrl,
      declared_role: declaredPackageRole,
      expected_role: 'standard_agent',
      failure_code: 'agent_package_manifest_role_invalid',
    });
  }
  const capabilityDependencies = normalizeCapabilityDependencies(payload.capability_dependencies, manifestUrl);
  const capabilityProvider = normalizeCapabilityProvider(payload.capability_provider);
  const healthCheck = isRecord(payload.health_check) ? payload.health_check : {};
  if (!isRecord(payload.codex_surface)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest codex_surface must be a JSON object.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  const rawSkillPacks = payload.skill_packs ?? [];
  const rawEntrypoints = payload.entrypoints ?? [];
  const rawPermissions = payload.permissions ?? [];
  const skillPacks = recordList(rawSkillPacks);
  const entrypoints = recordList(rawEntrypoints);
  if (!Array.isArray(rawSkillPacks) || skillPacks.length !== rawSkillPacks.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest skill_packs must be an array of objects.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  if (!Array.isArray(rawEntrypoints) || entrypoints.length !== rawEntrypoints.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest entrypoints must be an array of objects.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  if (!Array.isArray(rawPermissions)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest permissions must be an array.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  const requiredSkillIds = uniqueStrings(stringList(payload.codex_surface.required_skill_ids));
  if (requiredSkillIds.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must declare codex_surface.required_skill_ids.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_package_manifest',
    });
  }
  if (capabilityProvider) {
    const providerCoreSkillIds = capabilityProvider.exports
      .filter((entry) => entry.install_mode === 'core_required')
      .map((entry) => entry.skill_id);
    if (
      providerCoreSkillIds.length === 0
      || providerCoreSkillIds.length !== requiredSkillIds.length
      || providerCoreSkillIds.some((skillId) => !requiredSkillIds.includes(skillId))
    ) {
      throw new FrameworkContractError('contract_shape_invalid', 'Capability provider required_skill_ids must exactly match core_required exports.', {
        required_skill_ids: requiredSkillIds,
        provider_core_skill_ids: providerCoreSkillIds,
        failure_code: 'agent_package_capability_provider_core_mismatch',
      });
    }
  }
  const pluginId = stringValue(payload.codex_surface.plugin_id)
    ?? stringList(payload.codex_surface.plugin_ids)[0]
    ?? null;
  const pluginSourcePath = stringValue(payload.codex_surface.plugin_source_path)
    ?? stringValue(payload.codex_surface.local_plugin_source_path)
    ?? stringValue(payload.codex_surface.plugin_root);
  const pluginPayloadManifestRef = stringValue(payload.codex_surface.plugin_payload_manifest_url)
    ?? stringValue(payload.codex_surface.remote_payload_manifest_url);
  const pluginPayloadManifestUrl = pluginPayloadManifestRef
    ? resolveManifestRelativeSource(pluginPayloadManifestRef, manifestUrl)
    : null;
  if (pluginPayloadManifestUrl) {
    validateUrlLike(pluginPayloadManifestUrl, 'codex_surface.plugin_payload_manifest_url');
  }
  const distributionPayload = normalizeDistributionPayload(payload.distribution_payload);
  const codexVisibleEntry = pluginId
    ?? stringValue(payload.codex_surface.codex_visible_entry)
    ?? stringValue(payload.agent_id)!;
  return {
    package_id: canonicalManifestIdentity(payload.package_id, 'package_id'),
    agent_id: canonicalManifestIdentity(payload.agent_id, 'agent_id'),
    package_role: 'standard_agent',
    display_name: stringValue(payload.display_name)!,
    publisher: stringValue(payload.publisher)!,
    version: normalizePackageVersion(payload.version),
    owner_language_version: normalizeOwnerLanguageVersion(payload.owner_language_version),
    source: stringValue(payload.source)!,
    codex_surface: payload.codex_surface,
    skill_packs: skillPacks,
    entrypoints,
    health_check: healthCheck,
    permissions: rawPermissions,
    distribution_payload: distributionPayload,
    update_channel: stringValue(payload.update_channel) ?? 'manifest_url',
    rollback_ref: stringValue(payload.rollback_ref) ?? `rollback-ref:${canonicalManifestIdentity(payload.package_id, 'package_id')}/unavailable`, // reuse-first: allow owner-routed package provenance ref, not package-manager rollback.
    codex_visible_entry: codexVisibleEntry,
    required_skill_ids: requiredSkillIds,
    optional_skill_refs: uniqueStrings([
      ...stringList(payload.codex_surface.optional_skill_ids),
      ...normalizeSkillPackRefs(skillPacks.filter((pack) => stringValue(pack.install_mode) !== 'bundled_required')),
    ]),
    plugin_id: pluginId,
    plugin_source_path: pluginSourcePath,
    plugin_payload_manifest_url: pluginPayloadManifestUrl,
    plugin_payload_manifest_sha256: null,
    plugin_payload_cache_path: null,
    profile_surface: normalizeProfileSurface(payload.profile_surface),
    managed_policy_surface: normalizeManagedPolicySurface(payload.managed_policy_surface),
    runtime_source_carrier: normalizeManagedRuntimeSourceCarrier(payload.runtime_source_carrier),
    managed_update_source: normalizeManagedVersionCatalogSource(payload.managed_update_source, manifestUrl),
    capability_dependencies: capabilityDependencies,
    capability_provider: capabilityProvider,
    content_digest: distributionPayload?.payload_digest_ref ?? null,
    content_lock_paths: [],
  };
}

export function normalizeCapabilityPackageManifest(payload: unknown, manifestUrl: string): AgentPackageManifest {
  if (!isRecord(payload) || payload.surface_kind !== 'opl_capability_package_manifest.v2') {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package manifest must use opl_capability_package_manifest.v2.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
  if (!isRecord(payload.capability_abi) || !isRecord(payload.exports) || !isRecord(payload.content_lock)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package manifest must declare ABI, exports, and content lock.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
  if (payload.exports.optional_skills_installed_by_default !== true
    || payload.exports.default_materialization_policy !== 'all_exported_skills') {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package must materialize every declared Skill while keeping specialty readiness non-blocking.', {
      manifest_url: manifestUrl,
      failure_code: 'capability_package_default_materialization_invalid',
    });
  }
  const packageId = canonicalManifestIdentity(payload.package_id, 'package_id');
  const coreSkillIds = uniqueStrings(stringList(payload.exports.core_skill_ids));
  const specialtySkillIds = uniqueStrings(stringList(payload.exports.specialty_skill_ids));
  const allSkillIds = [...coreSkillIds, ...specialtySkillIds];
  if (new Set(allSkillIds).size !== allSkillIds.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package core and specialty skill ids must not overlap.', {
      manifest_url: manifestUrl,
      failure_code: 'capability_package_export_overlap',
    });
  }
  if (coreSkillIds.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package must export at least one core skill.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
  const capabilityAbi = assertStringValue(payload.capability_abi.id, 'capability_abi.id');
  const contentDigest = assertStringValue(payload.content_lock.digest, 'content_lock.digest');
  if (!/^sha256:[0-9a-f]{64}$/.test(contentDigest)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package content lock digest must be sha256.', {
      manifest_url: manifestUrl,
      content_digest: contentDigest,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
  const contentLockPaths = uniqueStrings(stringList(payload.content_lock.paths).map((entry, index) =>
    normalizedRelativePath(entry, `content_lock.paths[${index}]`)));
  const coreModuleIds = uniqueStrings(stringList(payload.exports.core_module_ids));
  if (coreModuleIds.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package must export at least one core module contract id.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
  const contentSkillIds = contentLockPaths.flatMap((entry) => {
    const match = entry.match(/^skills\/([^/]+)\/SKILL\.md$/);
    return match ? [match[1]] : [];
  });
  if (
    contentSkillIds.length !== allSkillIds.length
    || contentSkillIds.some((skillId) => !allSkillIds.includes(skillId))
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package content lock must contain exactly the declared core skills.', {
      manifest_url: manifestUrl,
      core_skill_ids: coreSkillIds,
      specialty_skill_ids: specialtySkillIds,
      content_skill_ids: contentSkillIds,
      failure_code: 'capability_package_core_content_mismatch',
    });
  }
  const codexSurface = isRecord(payload.codex_surface) ? payload.codex_surface : {};
  const pluginId = stringValue(codexSurface.plugin_id) ?? packageId;
  const pluginSourceRef = stringValue(codexSurface.plugin_source_path);
  const pluginSourcePath = pluginSourceRef
    ? resolveManifestRelativeSource(pluginSourceRef, manifestUrl)
    : null;
  const pluginPayloadManifestRef = stringValue(codexSurface.plugin_payload_manifest_url);
  const pluginPayloadManifestUrl = pluginPayloadManifestRef
    ? resolveManifestRelativeSource(pluginPayloadManifestRef, manifestUrl)
    : null;
  if (pluginPayloadManifestUrl) {
    validateUrlLike(pluginPayloadManifestUrl, 'codex_surface.plugin_payload_manifest_url');
  }
  return {
    package_id: packageId,
    agent_id: null,
    package_role: 'framework_capability_package',
    display_name: assertStringValue(payload.display_name, 'display_name'),
    publisher: assertStringValue(payload.publisher, 'publisher'),
    version: normalizePackageVersion(payload.version),
    owner_language_version: null,
    source: assertStringValue(payload.source, 'source'),
    codex_surface: codexSurface,
    skill_packs: [],
    entrypoints: [],
    health_check: {},
    permissions: [],
    distribution_payload: null,
    update_channel: 'manifest_url',
    rollback_ref: `rollback-ref:${packageId}/dependency-closure-lkg`,
    codex_visible_entry: pluginId,
    required_skill_ids: allSkillIds,
    optional_skill_refs: [assertStringValue(payload.exports.optional_skill_policy_ref, 'exports.optional_skill_policy_ref')],
    plugin_id: pluginId,
    plugin_source_path: pluginSourcePath,
    plugin_payload_manifest_url: pluginPayloadManifestUrl,
    plugin_payload_manifest_sha256: null,
    plugin_payload_cache_path: null,
    profile_surface: null,
    managed_policy_surface: null,
    runtime_source_carrier: null,
    managed_update_source: null,
    capability_dependencies: [],
    capability_provider: {
      capability_abi: capabilityAbi,
      exports: [...coreSkillIds.map((skillId) => ({
        export_id: skillId,
        skill_id: skillId,
        install_mode: 'core_required' as const,
      })), ...specialtySkillIds.map((skillId) => ({
        export_id: skillId,
        skill_id: skillId,
        install_mode: 'optional_named_specialty' as const,
      }))],
      module_export_ids: coreModuleIds,
    },
    content_digest: contentDigest,
    content_lock_paths: contentLockPaths,
  };
}

export function normalizeWorkflowProfilePackageManifest(payload: unknown, manifestUrl: string): AgentPackageManifest {
  if (!isRecord(payload) || payload.surface_kind !== 'opl_workflow_profile_package_manifest.v1') {
    throw new FrameworkContractError('contract_shape_invalid', 'Workflow profile package manifest must use opl_workflow_profile_package_manifest.v1.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_workflow_profile_package_manifest',
    });
  }
  if (payload.agent_id !== undefined) {
    throw new FrameworkContractError('contract_shape_invalid', 'Workflow profile packages must not declare an Agent identity.', {
      manifest_url: manifestUrl,
      failure_code: 'workflow_profile_package_agent_identity_forbidden',
    });
  }
  if (payload.package_role !== 'workflow_profile'
    || payload.carrier_source_role !== 'codex_plugin_default_carrier_not_package_truth') {
    throw new FrameworkContractError('contract_shape_invalid', 'Workflow profile package role or carrier boundary is invalid.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_workflow_profile_package_manifest',
    });
  }
  const packageId = canonicalManifestIdentity(payload.package_id, 'package_id');
  const codexSurface = isRecord(payload.codex_surface) ? payload.codex_surface : null;
  if (!codexSurface) {
    throw new FrameworkContractError('contract_shape_invalid', 'Workflow profile package must declare codex_surface.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_workflow_profile_package_manifest',
    });
  }
  const requiredSkillIds = uniqueStrings(stringList(codexSurface.required_skill_ids));
  if (requiredSkillIds.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Workflow profile package must declare required_skill_ids.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_workflow_profile_package_manifest',
    });
  }
  const pluginId = assertStringValue(codexSurface.plugin_id, 'codex_surface.plugin_id');
  const pluginPayloadManifestRef = assertStringValue(
    codexSurface.plugin_payload_manifest_url,
    'codex_surface.plugin_payload_manifest_url',
  );
  const pluginPayloadManifestUrl = resolveManifestRelativeSource(pluginPayloadManifestRef, manifestUrl);
  validateUrlLike(pluginPayloadManifestUrl, 'codex_surface.plugin_payload_manifest_url');
  const profileSurface = normalizeProfileSurface(payload.profile_surface);
  const managedPolicySurface = normalizeManagedPolicySurface(payload.managed_policy_surface);
  if (!profileSurface || !managedPolicySurface) {
    throw new FrameworkContractError('contract_shape_invalid', 'Workflow profile package must declare profile and managed policy surfaces.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_workflow_profile_package_manifest',
    });
  }
  return {
    package_id: packageId,
    agent_id: null,
    package_role: 'workflow_profile',
    display_name: assertStringValue(payload.display_name, 'display_name'),
    publisher: assertStringValue(payload.publisher, 'publisher'),
    version: normalizePackageVersion(payload.version),
    owner_language_version: null,
    source: assertStringValue(payload.source, 'source'),
    codex_surface: codexSurface,
    skill_packs: [],
    entrypoints: [],
    health_check: {},
    permissions: [],
    distribution_payload: normalizeDistributionPayload(payload.distribution_payload),
    update_channel: 'manifest_url',
    rollback_ref: `rollback-ref:${packageId}/profile-migration-lkg`,
    codex_visible_entry: pluginId,
    required_skill_ids: requiredSkillIds,
    optional_skill_refs: [],
    plugin_id: pluginId,
    plugin_source_path: null,
    plugin_payload_manifest_url: pluginPayloadManifestUrl,
    plugin_payload_manifest_sha256: null,
    plugin_payload_cache_path: null,
    profile_surface: profileSurface,
    managed_policy_surface: managedPolicySurface,
    runtime_source_carrier: null,
    managed_update_source: null,
    capability_dependencies: [],
    capability_provider: null,
    content_digest: null,
    content_lock_paths: [],
  };
}

export function normalizePackageManifest(payload: unknown, manifestUrl: string): AgentPackageManifest {
  if (isRecord(payload) && payload.surface_kind === 'opl_capability_package_manifest.v2') {
    return normalizeCapabilityPackageManifest(payload, manifestUrl);
  }
  if (isRecord(payload) && payload.surface_kind === 'opl_workflow_profile_package_manifest.v1') {
    return normalizeWorkflowProfilePackageManifest(payload, manifestUrl);
  }
  return normalizeManifest(payload, manifestUrl);
}
