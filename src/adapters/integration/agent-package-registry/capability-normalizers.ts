import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { recordList, stringList, stringValue } from '../../../kernel/json-record.ts';
import {
  assertChannelProviderEntrypointsContentLocked,
  assertRemoteCompanionEntrypointsContentLocked,
  normalizePackageEntrypoints,
} from './channel-provider-entrypoint-contract.ts';
import { normalizeAppContributions } from './app-contribution-normalizers.ts';
import { normalizePresentation } from './presentation-normalizers.ts';
import {
  canonicalManifestIdentity,
  normalizeCodexDefaultExposure,
  normalizeCodexInteractionMode,
  normalizeConfiguredCodexPluginCarrier,
  normalizeManifestSourceFields,
  normalizeRuntimeModuleBindings,
  normalizedRelativePath,
  resolveManifestRelativeSource,
} from './runtime-surface-normalizers.ts';
import { assertStringValue, uniqueStrings, validateUrlLike } from './shared.ts';
import type {
  AgentPackageCapabilityDependency,
  AgentPackageCapabilityProvider,
  AgentPackageManagedVersionCatalogSource,
  AgentPackageManifest,
} from './types.ts';

export function normalizeCapabilityDependencies(
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
    const moduleId = assertStringValue(
      entry.module_id,
      `capability_dependencies[${index}].module_id`,
    );
    if (typeof entry.required !== 'boolean') {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package capability dependency required must be a boolean.', {
        manifest_url: manifestUrl,
        package_id: packageId,
        dependency_index: index,
        failure_code: 'agent_package_capability_dependency_invalid',
      });
    }
    const required = entry.required;
    const dependencyKind = entry.dependency_kind === undefined && required
      ? 'hard_runtime_dependency'
      : entry.dependency_kind;
    const expectedDependencyKind: AgentPackageCapabilityDependency['dependency_kind'] = required
      ? 'hard_runtime_dependency'
      : 'optional_enhancement';
    if (dependencyKind !== expectedDependencyKind) {
      throw new FrameworkContractError('contract_shape_invalid', 'Agent package capability dependency required and dependency_kind must agree.', {
        manifest_url: manifestUrl,
        package_id: packageId,
        dependency_index: index,
        required,
        expected_dependency_kind: expectedDependencyKind,
        actual_dependency_kind: dependencyKind,
        failure_code: 'agent_package_capability_dependency_invalid',
      });
    }
    const versionRequirement = stringValue(entry.version_requirement) ?? '*';
    const capabilityAbi = assertStringValue(
      entry.capability_abi,
      `capability_dependencies[${index}].capability_abi`,
    );
    const consumerProfileId = entry.consumer_profile_id === undefined
      ? null
      : assertStringValue(
          entry.consumer_profile_id,
          `capability_dependencies[${index}].consumer_profile_id`,
        );
    const requiredExportIds = uniqueStrings(stringList(entry.required_export_ids));
    const requiredModuleIds = uniqueStrings(stringList(entry.required_module_ids));
    if (requiredExportIds.length === 0 || requiredModuleIds.length === 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Capability dependencies must declare required_export_ids and required_module_ids.', {
        manifest_url: manifestUrl,
        package_id: packageId,
        dependency_index: index,
        failure_code: 'agent_package_capability_dependency_invalid',
      });
    }
    const bootstrapManifestRef = stringValue(entry.bootstrap_manifest_url)
      ?? stringValue(entry.manifest_url);
    return {
      module_id: moduleId,
      package_id: packageId,
      required,
      dependency_kind: expectedDependencyKind,
      version_requirement: versionRequirement,
      capability_abi: capabilityAbi,
      consumer_profile_id: consumerProfileId,
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

function normalizeCapabilityConsumerProfiles(
  value: unknown,
  exports: AgentPackageCapabilityProvider['exports'],
  moduleExportIds: string[],
): AgentPackageCapabilityProvider['consumer_profiles'] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability provider consumer_profiles must be an array.', {
      failure_code: 'agent_package_capability_consumer_profile_invalid',
    });
  }
  const rawProfiles = recordList(value);
  if (rawProfiles.length !== value.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability provider consumer profiles must be objects.', {
      failure_code: 'agent_package_capability_consumer_profile_invalid',
    });
  }
  const exportIds = new Set(exports.map((entry) => entry.export_id));
  const availableModuleIds = new Set(moduleExportIds);
  const profiles = rawProfiles.map((entry, index) => {
    const profileId = assertStringValue(entry.profile_id, `consumer_profiles[${index}].profile_id`);
    const consumerAgentId = canonicalManifestIdentity(
      entry.consumer_agent_id,
      `consumer_profiles[${index}].consumer_agent_id`,
    );
    const requiredExportIds = uniqueStrings(stringList(entry.required_export_ids));
    const requiredModuleIds = uniqueStrings(stringList(entry.required_module_ids));
    const missingExportIds = requiredExportIds.filter((exportId) => !exportIds.has(exportId));
    const missingModuleIds = requiredModuleIds.filter((moduleId) => !availableModuleIds.has(moduleId));
    if (
      requiredExportIds.length === 0
      || requiredModuleIds.length === 0
      || missingExportIds.length > 0
      || missingModuleIds.length > 0
    ) {
      throw new FrameworkContractError('contract_shape_invalid', 'Capability consumer profile must reference exported Skills and modules.', {
        profile_id: profileId,
        consumer_agent_id: consumerAgentId,
        missing_required_export_ids: missingExportIds,
        missing_required_module_ids: missingModuleIds,
        failure_code: 'agent_package_capability_consumer_profile_invalid',
      });
    }
    return {
      profile_id: profileId,
      consumer_agent_id: consumerAgentId,
      required_export_ids: requiredExportIds,
      required_module_ids: requiredModuleIds,
    };
  });
  const duplicateProfileIds = profiles
    .map((entry) => entry.profile_id)
    .filter((profileId, index, values) => values.indexOf(profileId) !== index);
  if (duplicateProfileIds.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability consumer profile ids must be unique.', {
      duplicate_profile_ids: uniqueStrings(duplicateProfileIds),
      failure_code: 'agent_package_capability_consumer_profile_invalid',
    });
  }
  return profiles;
}

function normalizeManagedVersionCatalogSource(
  value: unknown,
  manifestUrl: string,
): AgentPackageManagedVersionCatalogSource | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)
    || value.kind !== 'managed_version_catalog'
    || (value.transport !== 'json_url' && value.transport !== 'opl_oci_channel')
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
    digest_authority: 'manifest_and_content_digest' as const,
  };
}

export function normalizeCapabilityProvider(value: unknown): AgentPackageCapabilityProvider | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || !Array.isArray(value.exports)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability provider must declare an exports array.', {
      failure_code: 'agent_package_capability_provider_invalid',
    });
  }
  const capabilityAbi = assertStringValue(value.capability_abi, 'capability_provider.capability_abi');
  const declaredMaterializationPolicy = stringValue(value.default_materialization_policy);
  const defaultMaterializationPolicy = declaredMaterializationPolicy === 'core_skills_only'
    ? 'core_skills_only' as const
    : declaredMaterializationPolicy === null || declaredMaterializationPolicy === 'all_exported_skills'
      ? 'all_exported_skills' as const
      : null;
  if (defaultMaterializationPolicy === null) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability provider default Skill materialization policy is invalid.', {
      default_materialization_policy: value.default_materialization_policy,
      failure_code: 'agent_package_capability_provider_invalid',
    });
  }
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
  const defaultMaterializedSkillIds = uniqueStrings(stringList(value.default_materialized_skill_ids));
  const coreSkillIds = exports
    .filter((entry) => entry.install_mode === 'core_required')
    .map((entry) => entry.skill_id);
  const effectiveDefaultMaterializedSkillIds = defaultMaterializedSkillIds.length > 0
    ? defaultMaterializedSkillIds
    : coreSkillIds;
  if (effectiveDefaultMaterializedSkillIds.some((skillId) => !exports.some((entry) => entry.skill_id === skillId))) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability provider default materialized Skills must be declared exports.', {
      default_materialized_skill_ids: effectiveDefaultMaterializedSkillIds,
      failure_code: 'agent_package_capability_provider_default_materialization_invalid',
    });
  }
  const consumerProfiles = normalizeCapabilityConsumerProfiles(
    value.consumer_profiles,
    exports,
    moduleExportIds,
  );
  return {
    capability_abi: capabilityAbi,
    exports,
    module_export_ids: moduleExportIds,
    default_materialized_skill_ids: effectiveDefaultMaterializedSkillIds,
    default_materialization_policy: defaultMaterializationPolicy,
    consumer_profiles: consumerProfiles,
  };
}

export function normalizeCapabilityPackageManifest(payload: unknown, manifestUrl: string): AgentPackageManifest {
  if (!isRecord(payload) || payload.surface_kind !== 'opl_capability_package_manifest.v2') {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package manifest must use opl_capability_package_manifest.v2.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
  if (
    payload.package_role !== 'capability_package'
    && payload.package_role !== 'framework_capability_package'
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package manifest package_role must identify a Framework capability package.', {
      manifest_url: manifestUrl,
      package_role: payload.package_role,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
  if (!isRecord(payload.capability_abi) || !isRecord(payload.exports) || !isRecord(payload.content_lock)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package manifest must declare ABI, exports, and content lock.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
  const optionalSkillsInstalledByDefault = payload.exports.optional_skills_installed_by_default;
  const declaredMaterializationPolicy = stringValue(payload.exports.default_materialization_policy);
  const defaultMaterializationPolicy = declaredMaterializationPolicy === 'core_skills_only'
    ? 'core_skills_only' as const
    : declaredMaterializationPolicy === 'all_exported_skills'
      ? 'all_exported_skills' as const
      : optionalSkillsInstalledByDefault === true
        ? 'all_exported_skills' as const
        : optionalSkillsInstalledByDefault === false
          ? 'core_skills_only' as const
          : null;
  if (typeof optionalSkillsInstalledByDefault !== 'boolean'
    || defaultMaterializationPolicy === null
    || (optionalSkillsInstalledByDefault !== (defaultMaterializationPolicy === 'all_exported_skills'))) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package default Skill materialization policy is inconsistent.', {
      manifest_url: manifestUrl,
      optional_skills_installed_by_default: optionalSkillsInstalledByDefault,
      default_materialization_policy: defaultMaterializationPolicy,
      failure_code: 'capability_package_default_materialization_invalid',
    });
  }
  const packageId = canonicalManifestIdentity(payload.package_id, 'package_id');
  const coreSkillIds = uniqueStrings(stringList(payload.exports.core_skill_ids));
  const entrypoints = normalizePackageEntrypoints(payload.entrypoints, manifestUrl);
  if (
    coreSkillIds.length === 0
    && !entrypoints.some((entry) => (
      entry.kind === 'channel_provider' || entry.kind === 'remote_companion_connector'
    ))
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package must export at least one core skill unless it provides a channel provider entrypoint or a remote companion connector entrypoint.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
  const specialtySkillIds = uniqueStrings(stringList(payload.exports.specialty_skill_ids));
  const allSkillIds = [...coreSkillIds, ...specialtySkillIds];
  if (new Set(allSkillIds).size !== allSkillIds.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package core and specialty skill ids must not overlap.', {
      manifest_url: manifestUrl,
      failure_code: 'capability_package_export_overlap',
    });
  }
  const declaredDefaultMaterializedSkillIds = uniqueStrings(
    stringList(payload.exports.default_materialized_skill_ids),
  );
  const defaultMaterializedSkillIds = declaredDefaultMaterializedSkillIds.length > 0
    ? declaredDefaultMaterializedSkillIds
    : coreSkillIds;
  if (defaultMaterializedSkillIds.some((skillId) => !allSkillIds.includes(skillId))) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package default materialized Skills must be declared exports.', {
      manifest_url: manifestUrl,
      default_materialized_skill_ids: defaultMaterializedSkillIds,
      failure_code: 'capability_package_default_materialization_invalid',
    });
  }
  const capabilityAbi = assertStringValue(payload.capability_abi.id, 'capability_abi.id');
  if (payload.content_lock.algorithm !== 'sha256') {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package content lock algorithm must be sha256.', {
      manifest_url: manifestUrl,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
  const contentLockCanonicalization = assertStringValue(
    payload.content_lock.canonicalization,
    'content_lock.canonicalization',
  );
  if (contentLockCanonicalization !== 'ordered_path_length_file_length_bytes') {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package content lock canonicalization is unsupported.', {
      manifest_url: manifestUrl,
      content_lock_canonicalization: contentLockCanonicalization,
      failure_code: 'invalid_capability_package_manifest',
    });
  }
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
  assertChannelProviderEntrypointsContentLocked(entrypoints, contentLockPaths, manifestUrl);
  assertRemoteCompanionEntrypointsContentLocked(entrypoints, contentLockPaths, manifestUrl);
  const runtimeModuleBindings = normalizeRuntimeModuleBindings(
    payload.exports.runtime_module_bindings,
    contentLockPaths,
    manifestUrl,
  );
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
  const capabilityExports = [...coreSkillIds.map((skillId) => ({
    export_id: skillId,
    skill_id: skillId,
    install_mode: 'core_required' as const,
  })), ...specialtySkillIds.map((skillId) => ({
    export_id: skillId,
    skill_id: skillId,
    install_mode: 'optional_named_specialty' as const,
  }))];
  const consumerProfiles = normalizeCapabilityConsumerProfiles(
    payload.consumer_profiles,
    capabilityExports,
    coreModuleIds,
  );
  const codexInteractionMode = normalizeCodexInteractionMode(codexSurface, manifestUrl);
  const codexDefaultExposure = normalizeCodexDefaultExposure(codexSurface, manifestUrl);
  const optionalInstallPolicy = codexSurface.optional_install_policy
    ?? defaultMaterializationPolicy;
  if (optionalInstallPolicy !== defaultMaterializationPolicy) {
    throw new FrameworkContractError('contract_shape_invalid', 'Capability package Codex install policy must match its default materialization policy.', {
      manifest_url: manifestUrl,
      optional_install_policy: optionalInstallPolicy,
      default_materialization_policy: defaultMaterializationPolicy,
      failure_code: 'capability_package_codex_materialization_policy_invalid',
    });
  }
  if (codexInteractionMode === 'headless_internal' && codexDefaultExposure !== false) {
    throw new FrameworkContractError('contract_shape_invalid', 'Headless internal capability Packages must disable default Codex exposure.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_codex_interaction_mode_exposure_invalid',
    });
  }
  const pluginId = stringValue(codexSurface.plugin_id) ?? packageId;
  const pluginSourceRef = stringValue(codexSurface.plugin_source_path);
  const pluginSourcePath = pluginSourceRef
    ? resolveManifestRelativeSource(pluginSourceRef, manifestUrl)
    : null;
  const pluginPayloadManifestRef = stringValue(codexSurface.plugin_payload_manifest_url);
  const pluginPayloadManifestUrl = pluginPayloadManifestRef
    ? resolveManifestRelativeSource(pluginPayloadManifestRef, manifestUrl)
    : null;
  const carrierRequiredSkillIds = defaultMaterializationPolicy === 'all_exported_skills'
    ? allSkillIds
    : defaultMaterializedSkillIds;
  if (pluginPayloadManifestUrl) {
    validateUrlLike(pluginPayloadManifestUrl, 'codex_surface.plugin_payload_manifest_url');
  }
  return {
    package_id: packageId,
    agent_id: null,
    package_role: 'capability_package',
    ...normalizeManifestSourceFields(
      payload,
      codexSurface,
      manifestUrl,
      {
        displayName: assertStringValue(payload.display_name, 'display_name'),
        publisher: assertStringValue(payload.publisher, 'publisher'),
        ownerLanguageVersion: null,
        source: assertStringValue(payload.source, 'source'),
      },
    ),
    codex_surface: codexSurface,
    codex_default_exposure: codexDefaultExposure,
    codex_interaction_mode: codexInteractionMode,
    skill_packs: [],
    entrypoints,
    health_check: {},
    permissions: [],
    distribution_payload: null,
    update_channel: 'manifest_url',
    codex_visible_entry: pluginId,
    required_skill_ids: allSkillIds,
    optional_skill_refs: [assertStringValue(payload.exports.optional_skill_policy_ref, 'exports.optional_skill_policy_ref')],
    presentation: normalizePresentation(payload.presentation, manifestUrl),
    plugin_id: pluginId,
    plugin_source_path: pluginSourcePath,
    plugin_payload_manifest_url: pluginPayloadManifestUrl,
    plugin_payload_manifest_sha256: null,
    plugin_payload_cache_path: null,
    profile_surface: null,
    managed_policy_surface: null,
    capability_dependencies: [],
    capability_provider: {
      capability_abi: capabilityAbi,
      exports: capabilityExports,
      module_export_ids: coreModuleIds,
      default_materialized_skill_ids: defaultMaterializedSkillIds,
      default_materialization_policy: defaultMaterializationPolicy,
      consumer_profiles: consumerProfiles,
    },
    runtime_module_bindings: runtimeModuleBindings,
    content_digest: contentDigest,
    content_lock_canonicalization: contentLockCanonicalization,
    content_lock_paths: contentLockPaths,
    configured_codex_plugin_carrier: normalizeConfiguredCodexPluginCarrier(
      codexSurface.configured_codex_plugin_carrier,
      {
        packageId,
        requiredSkillIds: carrierRequiredSkillIds,
        manifestUrl,
        interactionMode: codexInteractionMode,
      },
    ),
    app_contributions: normalizeAppContributions(payload.app_contributions, manifestUrl),
  };
}
