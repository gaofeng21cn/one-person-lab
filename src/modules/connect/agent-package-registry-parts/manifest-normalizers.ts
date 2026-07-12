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
  AgentPackageDistributionPayload,
  AgentPackageManifest,
  AgentPackageOrdinaryUserSource,
  AgentPackageProfileSurfaceConfig,
  AgentPackageRegistryCache,
  AgentPackageRegistryEntry,
} from './types.ts';

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
    const manifestRef = stringValue(entry.manifest_url);
    return {
      package_id: packageId,
      required,
      version_requirement: versionRequirement,
      capability_abi: capabilityAbi,
      required_export_ids: requiredExportIds,
      required_module_ids: requiredModuleIds,
      manifest_url: manifestRef ? resolveManifestRelativeSource(manifestRef, manifestUrl) : null,
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
    || value.rolling_tag !== 'latest'
    || value.promotion_policy !== 'daily_candidate_gates_then_promote_latest'
    || value.install_truth !== 'resolved_digest_lock'
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package OCI distribution must be latest-only and digest-lock based.', {
      failure_code: 'agent_package_distribution_policy_invalid',
      required: {
        live_download_proof: false,
        installed_reload_proof: false,
        rolling_tag: 'latest',
        promotion_policy: 'daily_candidate_gates_then_promote_latest',
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
    rolling_tag: 'latest',
    promotion_policy: 'daily_candidate_gates_then_promote_latest',
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
    value.kind !== 'ghcr_oci_artifact_rolling_latest'
    || value.latest_is_only_ordinary_user_channel !== true
    || value.latest_is_install_truth !== false
    || value.developer_checkout_auto_apply_allowed !== false
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package ordinary user source must use GHCR OCI rolling latest without treating latest as install truth.', {
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
  if (!ordinaryUserRef.endsWith(':latest')) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package ordinary user ref must be the latest tag.', {
      source: sourceLabel,
      failure_code: 'agent_package_ordinary_source_latest_ref_required',
      ordinary_user_ref: ordinaryUserRef,
    });
  }
  return {
    kind: 'ghcr_oci_artifact_rolling_latest',
    artifact_ref: assertStringValue(value.artifact_ref, `${sourceLabel}.artifact_ref`),
    ordinary_user_ref: ordinaryUserRef,
    immutable_version_ref: assertStringValue(value.immutable_version_ref, `${sourceLabel}.immutable_version_ref`),
    latest_is_only_ordinary_user_channel: true,
    install_truth: installTruth,
    latest_is_install_truth: false,
    developer_checkout_auto_apply_allowed: false,
  };
}

export function normalizeRegistryEntry(entry: Record<string, unknown>, index: number): AgentPackageRegistryEntry {
  const missing = missingFields(entry, REGISTRY_REQUIRED_FIELDS);
  assertNoForbiddenFields(entry, `registry.entries.${index}`);
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package registry entry is missing required fields.', {
      entry_index: index,
      missing_fields: missing,
    });
  }
  const manifestUrl = stringValue(entry.manifest_url)!;
  validateUrlLike(manifestUrl, `entries.${index}.manifest_url`);
  return {
    package_id: canonicalManifestIdentity(entry.package_id, `registry.entries.${index}.package_id`),
    display_name: stringValue(entry.display_name)!,
    publisher: stringValue(entry.publisher)!,
    source: stringValue(entry.source)!,
    manifest_url: manifestUrl,
    latest_version: stringValue(entry.latest_version)!,
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
    display_name: stringValue(payload.display_name)!,
    publisher: stringValue(payload.publisher)!,
    version: stringValue(payload.version)!,
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
  if (payload.exports.optional_skills_installed_by_default !== false) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package optional skills must not be installed by default.', {
      manifest_url: manifestUrl,
      failure_code: 'capability_package_optional_default_forbidden',
    });
  }
  const packageId = canonicalManifestIdentity(payload.package_id, 'package_id');
  const coreSkillIds = uniqueStrings(stringList(payload.exports.core_skill_ids));
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
    contentSkillIds.length !== coreSkillIds.length
    || contentSkillIds.some((skillId) => !coreSkillIds.includes(skillId))
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package content lock must contain exactly the declared core skills.', {
      manifest_url: manifestUrl,
      core_skill_ids: coreSkillIds,
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
  return {
    package_id: packageId,
    agent_id: packageId,
    display_name: assertStringValue(payload.display_name, 'display_name'),
    publisher: assertStringValue(payload.publisher, 'publisher'),
    version: assertStringValue(payload.version, 'version'),
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
    required_skill_ids: coreSkillIds,
    optional_skill_refs: [assertStringValue(payload.exports.optional_skill_policy_ref, 'exports.optional_skill_policy_ref')],
    plugin_id: pluginId,
    plugin_source_path: pluginSourcePath,
    plugin_payload_manifest_url: null,
    plugin_payload_manifest_sha256: null,
    plugin_payload_cache_path: null,
    profile_surface: null,
    capability_dependencies: [],
    capability_provider: {
      capability_abi: capabilityAbi,
      exports: coreSkillIds.map((skillId) => ({
        export_id: skillId,
        skill_id: skillId,
        install_mode: 'core_required' as const,
      })),
      module_export_ids: coreModuleIds,
    },
    content_digest: contentDigest,
    content_lock_paths: contentLockPaths,
  };
}

export function normalizePackageManifest(payload: unknown, manifestUrl: string): AgentPackageManifest {
  return isRecord(payload) && payload.surface_kind === 'opl_capability_package_manifest.v2'
    ? normalizeCapabilityPackageManifest(payload, manifestUrl)
    : normalizeManifest(payload, manifestUrl);
}
