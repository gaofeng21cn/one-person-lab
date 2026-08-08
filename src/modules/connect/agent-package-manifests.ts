import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { listCurrentPackageProjections } from '../../kernel/standard-agent-registry.ts';
import { canonicalAgentPackageId } from './agent-package-identity.ts';
import { normalizePackageManifest } from './agent-package-registry-parts/manifest-normalizers.ts';
import type { AgentPackagePresentation } from './agent-package-registry-parts/types.ts';
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

function normalizeStringList(value: unknown, field: string) {
  if (Array.isArray(value)) {
    return stringList(value);
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

function normalizeDistributionPayload(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isRecord(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest distribution_payload must be a JSON object.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'distribution_payload',
    });
  }
  const movingTag = requireLiteral(value.moving_tag, 'latest-stable', 'distribution_payload.moving_tag');
  const installTruth = requireLiteral(value.install_truth, 'resolved_digest_lock', 'distribution_payload.install_truth');
  const payloadDigestRef = requiredString(value.payload_digest_ref, 'distribution_payload.payload_digest_ref');
  if (!/^sha256:[0-9a-f]{64}$/.test(payloadDigestRef)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest distribution_payload.payload_digest_ref must be a SHA-256 digest ref.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'distribution_payload.payload_digest_ref',
    });
  }
  if (value.live_download_proof !== false || value.installed_reload_proof !== false) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest distribution_payload must not claim live download or installed reload proof.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'distribution_payload',
    });
  }
  return {
    payload_kind: requiredString(value.payload_kind, 'distribution_payload.payload_kind'),
    payload_ref: requiredString(value.payload_ref, 'distribution_payload.payload_ref'),
    payload_digest_ref: payloadDigestRef,
    required_skill_pack_lock_refs: normalizeStringList(
      value.required_skill_pack_lock_refs,
      'distribution_payload.required_skill_pack_lock_refs',
    ),
    proof_status: requiredString(value.proof_status, 'distribution_payload.proof_status'),
    live_download_proof: false as const,
    installed_reload_proof: false as const,
    oci_ref: requiredString(value.oci_ref, 'distribution_payload.oci_ref'),
    oci_media_type: requiredString(value.oci_media_type, 'distribution_payload.oci_media_type'),
    immutable_tag: requiredString(value.immutable_tag, 'distribution_payload.immutable_tag'),
    moving_tag: movingTag,
    promotion_policy: requireLiteral(
      value.promotion_policy,
      'daily_candidate_gates_then_promote_latest_stable',
      'distribution_payload.promotion_policy',
    ),
    install_truth: installTruth,
  };
}

function normalizeCapabilityDependency(value: unknown): ModuleCapabilityDependency {
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
  if (typeof value.required !== 'boolean') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package capability dependency must declare required as a boolean.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'capability_dependencies.required',
    });
  }
  const dependencyKind = value.dependency_kind === undefined && value.required
    ? 'hard_runtime_dependency'
    : value.dependency_kind;
  const expectedDependencyKind: ModuleCapabilityDependency['dependency_kind'] = value.required
    ? 'hard_runtime_dependency'
    : 'optional_enhancement';
  if (dependencyKind !== expectedDependencyKind) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package capability dependency required and dependency_kind must agree.', {
      contract_ref: 'contracts/opl-framework/agent-package-manifest.schema.json',
      field: 'capability_dependencies.dependency_kind',
      required: value.required,
      expected_dependency_kind: expectedDependencyKind,
      actual_dependency_kind: dependencyKind,
    });
  }
  return {
    module_id: requiredString(value.module_id, 'capability_dependencies.module_id') as ModuleCapabilityDependency['module_id'],
    package_id: requiredString(value.package_id, 'capability_dependencies.package_id'),
    kind,
    required: value.required,
    dependency_kind: expectedDependencyKind,
    version_requirement: typeof value.version_requirement === 'string'
      ? requiredString(value.version_requirement, 'capability_dependencies.version_requirement')
      : '*',
    capability_abi: requiredString(value.capability_abi, 'capability_dependencies.capability_abi'),
    ...(typeof value.consumer_profile_id === 'string'
      ? { consumer_profile_id: requiredString(value.consumer_profile_id, 'capability_dependencies.consumer_profile_id') }
      : {}),
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

function normalizeFirstPartyAgentPackagePresentation(payload: Record<string, unknown>) {
  const manifestUrl = `framework://contracts/opl-framework/packages/${requiredString(payload.package_id, 'package_id')}.json`;
  try {
    return normalizePackageManifest(payload, manifestUrl).presentation ?? null;
  } catch (error) {
    if (
      error instanceof FrameworkContractError
      && error.details?.failure_code === 'agent_package_presentation_invalid'
      && 'presentation' in payload
    ) {
      const { presentation: _invalidPresentation, ...manifestWithoutPresentation } = payload;
      normalizePackageManifest(manifestWithoutPresentation, manifestUrl);
      return null;
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
    ? payload.capability_dependencies.map(normalizeCapabilityDependency)
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
    distribution_payload: normalizeDistributionPayload(payload.distribution_payload),
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
    presentation: normalizeFirstPartyAgentPackagePresentation(payload),
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
