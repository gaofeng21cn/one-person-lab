import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { listCurrentPackageProjections } from '../../kernel/standard-agent-registry.ts';
import { canonicalAgentPackageId } from './agent-package-identity.ts';
import { normalizePackageManifest } from './agent-package-registry-parts/manifest-normalizers.ts';
import type { AgentPackageCapabilityDependency, AgentPackagePresentation } from './agent-package-registry-parts/types.ts';
import type { ModuleCapabilityDependency } from './system-installation/shared.ts';

type CodexCarrierDistribution = 'repo_carrier_source' | 'generated_carrier_surface';

export type FirstPartyAgentPackageManifest = {
  agent_id: string;
  package_id: string;
  version: string;
  source: string;
  carrier_source_role: 'codex_plugin_default_carrier_not_package_truth';
  package_core: Record<string, unknown> | null;
  distribution_payload: null | {
    payload_kind: string;
    payload_ref: string;
    payload_digest_ref: string;
    required_skill_pack_lock_refs: readonly string[];
    proof_status: string;
    live_download_proof: false;
    installed_reload_proof: false;
    oci_ref: string;
    oci_media_type: string;
    immutable_tag: string;
    moving_tag: 'latest-stable';
    promotion_policy: 'daily_candidate_gates_then_promote_latest_stable';
    install_truth: 'resolved_digest_lock';
  };
  codex_surface: {
    plugin_id: string;
    standalone_distribution: CodexCarrierDistribution;
    required_skill_ids: readonly string[];
    bundled_capability_package_ids?: readonly string[];
  };
  carrier_adapters: readonly Record<string, unknown>[];
  dependency_profiles: readonly unknown[];
  capability_dependencies: readonly ModuleCapabilityDependency[];
  presentation: AgentPackagePresentation | null;
  package_manifest_ref: string;
  module_id: string;
  display_name: string;
  description: string;
  repo_name: string;
  repo_url: string;
  owner_package_manifest_ref: string;
  owner_plugin_manifest_ref: string;
  owner_language_version_ref: string | null;
};

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

function requiredString(value: unknown, field: string) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  throw new FrameworkContractError('contract_shape_invalid', `Agent package manifest must declare ${field}.`, {
    contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
    field,
  });
}

function requireCanonicalPackageIdentity(value: unknown, field: string) {
  const declared = requiredString(value, field).toLowerCase();
  const canonical = canonicalAgentPackageId(declared);
  if (canonical !== declared) {
    throw new FrameworkContractError('contract_shape_invalid', `Agent package manifest ${field} must use its canonical id.`, {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field,
      declared_id: declared,
      canonical_id: canonical,
      failure_code: 'agent_package_identity_not_canonical',
    });
  }
  return declared;
}

function requireStringList(value: unknown, field: string) {
  const values = stringList(value);
  if (values.length > 0) {
    return values;
  }
  throw new FrameworkContractError('contract_shape_invalid', `Agent package manifest must declare ${field}.`, {
    contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
    field,
  });
}

function requireLiteral<T extends string>(value: unknown, expected: T, field: string) {
  if (value === expected) {
    return expected;
  }
  throw new FrameworkContractError('contract_shape_invalid', `Agent package manifest ${field} must be ${expected}.`, {
    contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
    field,
    expected,
    actual: value,
  });
}

function projectCapabilityDependency(value: unknown, normalized: AgentPackageCapabilityDependency): ModuleCapabilityDependency {
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest capability dependency must be a framework capability package.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'capability_dependencies.kind',
    });
  }
  const kind = value.kind ?? 'capability_package';
  if (kind !== 'capability_package' && kind !== 'framework_capability_package') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest capability dependency kind is invalid.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'capability_dependencies.kind',
    });
  }
  const authorityBoundary = isRecord(value.authority_boundary) ? value.authority_boundary : {};
  if (
    authorityBoundary.can_write_domain_truth !== false
    || authorityBoundary.can_sign_owner_receipt !== false
    || authorityBoundary.can_create_typed_blocker !== false
    || authorityBoundary.can_write_runtime_queue !== false
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest capability dependency authority boundary must be false-only.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'capability_dependencies.authority_boundary',
    });
  }
  return {
    module_id: normalized.module_id,
    package_id: normalized.package_id,
    kind,
    required: normalized.required,
    dependency_kind: normalized.dependency_kind,
    version_requirement: normalized.version_requirement,
    capability_abi: normalized.capability_abi,
    ...(normalized.consumer_profile_id ? { consumer_profile_id: normalized.consumer_profile_id } : {}),
    required_export_ids: requireStringList(value.required_export_ids, 'capability_dependencies.required_export_ids'),
    required_module_ids: requireStringList(value.required_module_ids, 'capability_dependencies.required_module_ids'),
    ...(typeof value.manifest_url === 'string' ? { manifest_url: value.manifest_url } : {}),
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    },
  };
}

function normalizeFirstPartyManifest(payload: Record<string, unknown>) {
  if (isRecord(payload.distribution_payload)
    && !Array.isArray(payload.distribution_payload.required_skill_pack_lock_refs)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must declare distribution_payload.required_skill_pack_lock_refs.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'distribution_payload.required_skill_pack_lock_refs',
    });
  }
  const manifestUrl = `framework://contracts/opl-framework/packages/${requiredString(payload.package_id, 'package_id')}.json`;
  try {
    return normalizePackageManifest(payload, manifestUrl);
  } catch (error) {
    if (
      error instanceof FrameworkContractError
      && error.details?.failure_code === 'agent_package_presentation_invalid'
      && 'presentation' in payload
    ) {
      const { presentation: _invalidPresentation, ...manifestWithoutPresentation } = payload;
      return normalizePackageManifest(manifestWithoutPresentation, manifestUrl);
    }
    throw error;
  }
}

function englishPresentationValue(payload: Record<string, unknown>, field: string) {
  const presentation = isRecord(payload.presentation) ? payload.presentation : {};
  const values = isRecord(presentation[field]) ? presentation[field] : {};
  return typeof values['en-US'] === 'string' && values['en-US'].trim()
    ? values['en-US'].trim()
    : null;
}

function repoNameFromUrl(repoUrl: string) {
  const normalized = repoUrl.replace(/[\\/]+$/, '').replace(/\.git$/, '');
  return normalized.split(/[\\/]/).at(-1) || repoUrl;
}

export function normalizeFirstPartyAgentPackageManifest(payload: unknown): FirstPartyAgentPackageManifest {
  if (!isRecord(payload)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must be a JSON object.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
    });
  }
  const agentId = requireCanonicalPackageIdentity(payload.agent_id, 'agent_id');
  const packageId = requireCanonicalPackageIdentity(payload.package_id, 'package_id');
  const normalized = normalizeFirstPartyManifest(payload);
  if (!isRecord(payload.codex_surface)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must declare codex_surface.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'codex_surface',
    });
  }
  if (!isRecord(payload.runtime_source_carrier) || !isRecord(payload.publication_source)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must project runtime carrier and publication source metadata.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'runtime_source_carrier|publication_source',
    });
  }
  const codexSurface = payload.codex_surface;
  const runtimeSourceCarrier = payload.runtime_source_carrier;
  const publicationSource = payload.publication_source;
  const repoUrl = requiredString(payload.source_repo, 'source_repo');
  const displayName = requiredString(payload.display_name, 'display_name');
  const capabilityDependencies = Array.isArray(payload.capability_dependencies)
    ? payload.capability_dependencies.map((value, index) => projectCapabilityDependency(value, normalized.capability_dependencies[index]))
    : null;
  if (!capabilityDependencies) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest must declare capability_dependencies.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'capability_dependencies',
    });
  }
  const standaloneDistribution = codexSurface.standalone_distribution;
  if (standaloneDistribution !== 'repo_carrier_source'
    && standaloneDistribution !== 'generated_carrier_surface') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest codex_surface.standalone_distribution is invalid.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'codex_surface.standalone_distribution',
      actual: standaloneDistribution,
    });
  }
  return {
    agent_id: agentId,
    package_id: packageId,
    version: requiredString(payload.version, 'version'),
    source: requiredString(payload.source, 'source'),
    carrier_source_role: requireLiteral(
      payload.carrier_source_role,
      'codex_plugin_default_carrier_not_package_truth',
      'carrier_source_role',
    ),
    package_core: isRecord(payload.package_core) ? payload.package_core : null,
    distribution_payload: normalized.distribution_payload,
    codex_surface: {
      plugin_id: requiredString(codexSurface.plugin_id, 'codex_surface.plugin_id'),
      standalone_distribution: standaloneDistribution,
      required_skill_ids: requireStringList(codexSurface.required_skill_ids, 'codex_surface.required_skill_ids'),
      bundled_capability_package_ids: stringList(codexSurface.bundled_capability_package_ids),
    },
    carrier_adapters: Array.isArray(payload.carrier_adapters)
      ? payload.carrier_adapters.filter(isRecord)
      : [],
    dependency_profiles: Array.isArray(payload.dependency_profiles)
      ? payload.dependency_profiles
      : [],
    capability_dependencies: capabilityDependencies,
    presentation: normalized.presentation ?? null,
    package_manifest_ref: `contracts/opl-framework/packages/${packageId}.json`,
    module_id: requiredString(runtimeSourceCarrier.module_id, 'runtime_source_carrier.module_id'),
    display_name: displayName,
    description: englishPresentationValue(payload, 'description_i18n') ?? displayName,
    repo_name: repoNameFromUrl(repoUrl),
    repo_url: repoUrl,
    owner_package_manifest_ref: requiredString(
      publicationSource.owner_package_manifest_ref,
      'publication_source.owner_package_manifest_ref',
    ),
    owner_plugin_manifest_ref: requiredString(
      publicationSource.owner_plugin_manifest_ref,
      'publication_source.owner_plugin_manifest_ref',
    ),
    owner_language_version_ref: typeof publicationSource.owner_language_version_ref === 'string'
      ? requiredString(publicationSource.owner_language_version_ref, 'publication_source.owner_language_version_ref')
      : null,
  };
}

export function listFirstPartyAgentPackageManifests(packageDirectory?: string) {
  return listCurrentPackageProjections(packageDirectory)
    .filter(({ payload }) => payload.surface_kind === 'opl_agent_package_manifest.v1')
    .map(({ payload }) => normalizeFirstPartyAgentPackageManifest(payload));
}

export function getAgentPackageManifestByModuleId(moduleId: string, packageDirectory?: string) {
  return listFirstPartyAgentPackageManifests(packageDirectory)
    .find((manifest) => manifest.module_id === moduleId) ?? null;
}

export function getCapabilityDependenciesForModule(moduleId: string, packageDirectory?: string) {
  return getAgentPackageManifestByModuleId(moduleId, packageDirectory)?.capability_dependencies ?? [];
}

export function listFirstPartyAgentPackageDependencyProfiles() {
  return listFirstPartyAgentPackageManifests()
    .flatMap((manifest) => manifest.dependency_profiles);
}
