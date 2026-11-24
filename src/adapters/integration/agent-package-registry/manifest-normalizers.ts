import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { recordList, stringList, stringValue } from '../../../kernel/json-record.ts';
import { MANIFEST_REQUIRED_FIELDS } from './constants.ts';
import { normalizePackageEntrypoints } from './channel-provider-entrypoint-contract.ts';
import { normalizeAppContributions } from './app-contribution-normalizers.ts';
import {
  normalizeCapabilityDependencies,
  normalizeCapabilityPackageManifest,
  normalizeCapabilityProvider,
} from './capability-normalizers.ts';
import { normalizePresentation } from './presentation-normalizers.ts';
import {
  canonicalManifestIdentity,
  normalizeCodexDefaultExposure,
  normalizeConfiguredCodexPluginCarrier,
  normalizeDistributionPayload,
  normalizeInteractiveCodexMode,
  normalizeManifestSourceFields,
  normalizeManagedPolicySurface,
  normalizeOwnerLanguageVersion,
  normalizeProfileSurface,
  normalizeSkillPackRefs,
  resolveManifestRelativeSource,
} from './runtime-surface-normalizers.ts';
import {
  assertNoForbiddenFields,
  assertStringValue,
  missingFields,
  uniqueStrings,
  validateUrlLike,
} from './shared.ts';
import type { AgentPackageManifest, AgentPackageRole } from './types.ts';

export { normalizeAppContributions, normalizeCapabilityPackageManifest };

const AGENT_PACKAGE_ROLES = new Set<AgentPackageRole>([
  'standard_agent',
  'capability_package',
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
  const packageId = canonicalManifestIdentity(payload.package_id, 'package_id');
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
  const entrypoints = normalizePackageEntrypoints(rawEntrypoints, manifestUrl);
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
  const codexInteractionMode = normalizeInteractiveCodexMode(
    payload.codex_surface,
    manifestUrl,
    'standard_agent',
  );
  const codexVisibleEntry = pluginId
    ?? stringValue(payload.codex_surface.codex_visible_entry)
    ?? stringValue(payload.agent_id)!;
  return {
    package_id: packageId,
    agent_id: canonicalManifestIdentity(payload.agent_id, 'agent_id'),
    package_role: 'standard_agent',
    ...normalizeManifestSourceFields(
      payload,
      payload.codex_surface,
      manifestUrl,
      {
        displayName: stringValue(payload.display_name)!,
        publisher: stringValue(payload.publisher)!,
        ownerLanguageVersion: normalizeOwnerLanguageVersion(payload.owner_language_version),
        source: stringValue(payload.source)!,
      },
    ),
    codex_surface: payload.codex_surface,
    codex_default_exposure: normalizeCodexDefaultExposure(payload.codex_surface, manifestUrl),
    codex_interaction_mode: codexInteractionMode,
    skill_packs: skillPacks,
    entrypoints,
    health_check: healthCheck,
    permissions: rawPermissions,
    distribution_payload: distributionPayload,
    update_channel: stringValue(payload.update_channel) ?? 'manifest_url',
    codex_visible_entry: codexVisibleEntry,
    required_skill_ids: requiredSkillIds,
    optional_skill_refs: uniqueStrings([
      ...stringList(payload.codex_surface.optional_skill_ids),
      ...normalizeSkillPackRefs(skillPacks.filter((pack) => stringValue(pack.install_mode) !== 'bundled_required')),
    ]),
    presentation: normalizePresentation(payload.presentation, manifestUrl),
    plugin_id: pluginId,
    plugin_source_path: pluginSourcePath,
    plugin_payload_manifest_url: pluginPayloadManifestUrl,
    plugin_payload_manifest_sha256: null,
    plugin_payload_cache_path: null,
    profile_surface: normalizeProfileSurface(payload.profile_surface),
    managed_policy_surface: normalizeManagedPolicySurface(payload.managed_policy_surface),
    capability_dependencies: capabilityDependencies,
    capability_provider: capabilityProvider,
    runtime_module_bindings: [],
    content_digest: distributionPayload?.payload_digest_ref ?? null,
    content_lock_canonicalization: null,
    content_lock_paths: [],
    configured_codex_plugin_carrier: normalizeConfiguredCodexPluginCarrier(
      payload.codex_surface.configured_codex_plugin_carrier,
      { packageId, requiredSkillIds, manifestUrl, interactionMode: codexInteractionMode },
    ),
    app_contributions: normalizeAppContributions(payload.app_contributions, manifestUrl),
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
  const codexInteractionMode = normalizeInteractiveCodexMode(
    codexSurface,
    manifestUrl,
    'workflow_profile',
  );
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
    codex_default_exposure: normalizeCodexDefaultExposure(codexSurface, manifestUrl),
    codex_interaction_mode: codexInteractionMode,
    skill_packs: [],
    entrypoints: [],
    health_check: {},
    permissions: [],
    distribution_payload: normalizeDistributionPayload(payload.distribution_payload),
    update_channel: 'manifest_url',
    codex_visible_entry: pluginId,
    required_skill_ids: requiredSkillIds,
    optional_skill_refs: [],
    presentation: normalizePresentation(payload.presentation, manifestUrl),
    plugin_id: pluginId,
    plugin_source_path: null,
    plugin_payload_manifest_url: pluginPayloadManifestUrl,
    plugin_payload_manifest_sha256: null,
    plugin_payload_cache_path: null,
    profile_surface: profileSurface,
    managed_policy_surface: managedPolicySurface,
    capability_dependencies: [],
    capability_provider: null,
    runtime_module_bindings: [],
    content_digest: null,
    content_lock_canonicalization: null,
    content_lock_paths: [],
    configured_codex_plugin_carrier: normalizeConfiguredCodexPluginCarrier(
      codexSurface.configured_codex_plugin_carrier,
      { packageId, requiredSkillIds, manifestUrl, interactionMode: codexInteractionMode },
    ),
    app_contributions: normalizeAppContributions(payload.app_contributions, manifestUrl),
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
