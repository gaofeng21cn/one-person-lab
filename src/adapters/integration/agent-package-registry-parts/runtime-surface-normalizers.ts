import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { recordList, stringList, stringValue } from '../../../kernel/json-record.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import { assertStringValue } from './shared.ts';
import type {
  AgentPackageConfiguredCodexPluginCarrierDescriptor,
  AgentPackageDistributionPayload,
  AgentPackageManifest,
  AgentPackageManagedPolicySurfaceConfig,
  AgentPackageProfileSurfaceConfig,
  AgentPackageRuntimeModuleBinding,
} from './types.ts';
import { normalizePackageAccessFields } from './package-access.ts';

export function normalizeCodexDefaultExposure(
  codexSurface: Record<string, unknown>,
  manifestUrl: string,
) {
  const value = codexSurface.codex_default_exposure;
  if (value === undefined) return true;
  if (typeof value !== 'boolean') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package codex_default_exposure must be a boolean when declared.', {
      manifest_url: manifestUrl,
      codex_default_exposure: value,
      failure_code: 'agent_package_codex_default_exposure_invalid',
    });
  }
  return value;
}

export function normalizeCodexInteractionMode(
  codexSurface: Record<string, unknown>,
  manifestUrl: string,
) {
  const value = codexSurface.interaction_mode;
  if (value === undefined) return 'interactive' as const;
  if (value !== 'headless_internal') {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package interaction_mode must be headless_internal when declared.', {
      manifest_url: manifestUrl,
      interaction_mode: value,
      failure_code: 'agent_package_codex_interaction_mode_invalid',
    });
  }
  return value;
}

export function normalizeInteractiveCodexMode(
  codexSurface: Record<string, unknown>,
  manifestUrl: string,
  packageRole: 'standard_agent' | 'workflow_profile',
) {
  const interactionMode = normalizeCodexInteractionMode(codexSurface, manifestUrl);
  if (interactionMode !== 'interactive') {
    throw new FrameworkContractError('contract_shape_invalid', 'Only capability Packages may declare a headless internal Codex interaction mode.', {
      manifest_url: manifestUrl,
      package_role: packageRole,
      failure_code: 'agent_package_codex_interaction_mode_role_invalid',
    });
  }
  return interactionMode;
}

export function normalizedRelativePath(value: unknown, field: string) {
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

const RUNTIME_MODULE_REFERENCE_FIELDS = [
  'profile_ref',
  'profile_schema_ref',
  'registry_ref',
  'registry_schema_ref',
  'step_schema_ref',
] as const;

export function normalizeRuntimeModuleBindings(
  value: unknown,
  contentLockPaths: readonly string[],
  manifestUrl: string,
): AgentPackageRuntimeModuleBinding[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package runtime_module_bindings must be an array.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_runtime_module_bindings_invalid',
    });
  }
  const entries = recordList(value);
  if (entries.length !== value.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Package runtime_module_bindings entries must be objects.', {
      manifest_url: manifestUrl,
      failure_code: 'agent_package_runtime_module_bindings_invalid',
    });
  }
  const moduleIds = new Set<string>();
  return entries.map((entry, index) => {
    const field = `exports.runtime_module_bindings[${index}]`;
    const moduleId = assertStringValue(entry.module_id, `${field}.module_id`);
    if (moduleIds.has(moduleId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package runtime module ids must be unique.', {
        manifest_url: manifestUrl,
        module_id: moduleId,
        failure_code: 'agent_package_runtime_module_bindings_invalid',
      });
    }
    moduleIds.add(moduleId);
    const moduleKind = assertStringValue(entry.module_kind, `${field}.module_kind`);
    const adapterAbi = assertStringValue(entry.adapter_abi, `${field}.adapter_abi`);
    const handler = isRecord(entry.handler) ? entry.handler : null;
    if (!handler || handler.kind !== 'typescript_export') {
      throw new FrameworkContractError('contract_shape_invalid', 'Package runtime module handler must be a TypeScript export.', {
        manifest_url: manifestUrl,
        module_id: moduleId,
        failure_code: 'agent_package_runtime_module_handler_invalid',
      });
    }
    const handlerFile = normalizedRelativePath(handler.file, `${field}.handler.file`);
    const handlerExport = assertStringValue(handler.export, `${field}.handler.export`);
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(handlerExport)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package runtime module handler export is invalid.', {
        manifest_url: manifestUrl,
        module_id: moduleId,
        handler_export: handlerExport,
        failure_code: 'agent_package_runtime_module_handler_invalid',
      });
    }
    const references = RUNTIME_MODULE_REFERENCE_FIELDS.map((referenceField) => [
      referenceField,
      normalizedRelativePath(entry[referenceField], `${field}.${referenceField}`),
    ] as const);
    if (!Array.isArray(entry.contained_implementation_files)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package runtime module contained implementation files must be an array.', {
        manifest_url: manifestUrl,
        module_id: moduleId,
        failure_code: 'agent_package_runtime_module_bindings_invalid',
      });
    }
    const containedImplementationFiles = entry.contained_implementation_files.map((file, fileIndex) =>
      normalizedRelativePath(file, `${field}.contained_implementation_files[${fileIndex}]`));
    const lockedPaths = [
      handlerFile,
      ...references.map(([, reference]) => reference),
      ...containedImplementationFiles,
    ];
    const unlockedPaths = [...new Set(lockedPaths.filter((candidate) => !contentLockPaths.includes(candidate)))];
    if (unlockedPaths.length > 0) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package runtime module paths must be covered by the content lock.', {
        manifest_url: manifestUrl,
        module_id: moduleId,
        unlocked_paths: unlockedPaths,
        failure_code: 'agent_package_runtime_module_path_unlocked',
      });
    }
    const maxSteps = entry.max_steps;
    if (!Number.isSafeInteger(maxSteps) || (maxSteps as number) < 1 || (maxSteps as number) > 16) {
      throw new FrameworkContractError('contract_shape_invalid', 'Package runtime module max_steps must be a positive bounded integer.', {
        manifest_url: manifestUrl,
        module_id: moduleId,
        max_steps: maxSteps,
        failure_code: 'agent_package_runtime_module_bindings_invalid',
      });
    }
    return {
      ...entry,
      module_id: moduleId,
      module_kind: moduleKind,
      adapter_abi: adapterAbi,
      ...Object.fromEntries(references),
      handler: {
        ...handler,
        kind: 'typescript_export' as const,
        file: handlerFile,
        export: handlerExport,
      },
      max_steps: maxSteps as number,
      contained_implementation_files: containedImplementationFiles,
    } as AgentPackageRuntimeModuleBinding;
  });
}

export function normalizeProfileSurface(value: unknown): AgentPackageProfileSurfaceConfig | null {
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

export function normalizeManagedPolicySurface(value: unknown): AgentPackageManagedPolicySurfaceConfig | null {
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

export function normalizeDistributionPayload(value: unknown): AgentPackageDistributionPayload | null {
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

export function normalizeSkillPackRefs(skillPacks: Record<string, unknown>[]) {
  return skillPacks.flatMap((pack) => {
    const packId = stringValue(pack.id);
    const source = stringValue(pack.source);
    const version = stringValue(pack.version);
    return packId ? [`${packId}${source ? `@${source}` : ''}${version ? `#${version}` : ''}`] : [];
  });
}

export function canonicalManifestIdentity(value: unknown, field: string) {
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

export function resolveManifestRelativeSource(value: string, manifestUrl: string) {
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

export function normalizeOwnerLanguageVersion(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || value.scheme !== 'pep440' || !stringValue(value.value)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package owner_language_version must declare a supported scheme and value.', {
      failure_code: 'agent_package_owner_language_version_invalid',
    });
  }
  return { scheme: 'pep440' as const, value: stringValue(value.value)! };
}

function normalizeCarrierSourceAuthority(
  payload: Record<string, unknown>,
  codexSurface: Record<string, unknown>,
  manifestUrl: string,
) {
  const sourceCommit = stringValue(payload.source_commit);
  const carrierSourceCommit = stringValue(codexSurface.carrier_source_commit);
  const invalidFields = [
    sourceCommit !== null && !/^[0-9a-f]{40}$/.test(sourceCommit) ? 'source_commit' : null,
    carrierSourceCommit !== null && !/^[0-9a-f]{40}$/.test(carrierSourceCommit) ? 'codex_surface.carrier_source_commit' : null,
  ].filter((entry): entry is string => entry !== null);
  if (invalidFields.length > 0 || (sourceCommit !== null && carrierSourceCommit !== null && sourceCommit !== carrierSourceCommit)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Agent package manifest carrier source commit authority is invalid or conflicting.', {
      manifest_url: manifestUrl,
      source_commit: sourceCommit,
      carrier_source_commit: carrierSourceCommit,
      invalid_fields: invalidFields,
      failure_code: 'agent_package_manifest_carrier_source_commit_invalid',
    });
  }
  return { sourceCommit, carrierSourceCommit };
}

type ManifestSourceFields = Pick<
  AgentPackageManifest,
  | 'display_name'
  | 'publisher'
  | 'version'
  | 'owner_language_version'
  | 'source'
  | 'source_repo'
  | 'source_commit'
  | 'carrier_source_commit'
  | 'verified_payload_source_commit'
  | 'visibility'
  | 'access_policy_ref'
  | 'credential_provider'
>;

export function normalizeManifestSourceFields(
  payload: Record<string, unknown>,
  codexSurface: Record<string, unknown>,
  manifestUrl: string,
  values: {
    displayName: string;
    publisher: string;
    ownerLanguageVersion: AgentPackageManifest['owner_language_version'];
    source: string;
  },
): ManifestSourceFields {
  const carrierAuthority = normalizeCarrierSourceAuthority(payload, codexSurface, manifestUrl);
  const access = normalizePackageAccessFields(payload, String(payload.package_id));
  return {
    display_name: values.displayName,
    publisher: values.publisher,
    version: normalizePackageVersion(payload.version),
    owner_language_version: values.ownerLanguageVersion,
    source: values.source,
    source_repo: stringValue(payload.source_repo),
    ...access,
    source_commit: carrierAuthority.sourceCommit,
    carrier_source_commit: carrierAuthority.carrierSourceCommit,
    verified_payload_source_commit: null,
  };
}

export function normalizeConfiguredCodexPluginCarrier(
  value: unknown,
  input: {
    packageId: string;
    requiredSkillIds: string[];
    manifestUrl: string;
    interactionMode: 'interactive' | 'headless_internal';
  },
): AgentPackageConfiguredCodexPluginCarrierDescriptor | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured Codex Plugin Manager carrier must declare its native carrier and Codex CLI executor route.',
      {
        package_id: input.packageId,
        manifest_url: input.manifestUrl,
        failure_code: 'configured_codex_plugin_carrier_descriptor_invalid',
      },
    );
  }
  const normalizedCarrier = isRecord(value.carrier) ? value.carrier : null;
  const normalizedExecutor = isRecord(value.executor) ? value.executor : null;
  const kind = value.kind ?? normalizedCarrier?.kind;
  const executorRoute = value.executor_route ?? normalizedExecutor?.route;
  if (kind !== 'codex_plugin_manager' || executorRoute !== 'codex_cli') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured Codex Plugin Manager carrier must declare its native carrier and Codex CLI executor route.',
      {
        package_id: input.packageId,
        manifest_url: input.manifestUrl,
        failure_code: 'configured_codex_plugin_carrier_descriptor_invalid',
      },
    );
  }
  const declaredPackageId = stringValue(value.packageId);
  if (declaredPackageId && declaredPackageId !== input.packageId) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured Codex Plugin Manager carrier package identity must match its manifest.',
      {
        package_id: input.packageId,
        carrier_package_id: declaredPackageId,
        manifest_url: input.manifestUrl,
        failure_code: 'configured_codex_plugin_carrier_descriptor_invalid',
      },
    );
  }
  const pluginSelector = assertStringValue(
    value.plugin_selector ?? normalizedCarrier?.pluginId,
    'codex_surface.configured_codex_plugin_carrier.plugin_selector',
  );
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*@[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pluginSelector)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured Codex Plugin Manager plugin selector is invalid.',
      {
        package_id: input.packageId,
        plugin_selector: pluginSelector,
        manifest_url: input.manifestUrl,
        failure_code: 'configured_codex_plugin_carrier_descriptor_invalid',
      },
    );
  }
  const marketplaceSourceValue = value.marketplace_source ?? normalizedCarrier?.marketplaceSource;
  const marketplaceSource = marketplaceSourceValue === undefined || marketplaceSourceValue === null
    ? null
    : assertStringValue(
        marketplaceSourceValue,
        'codex_surface.configured_codex_plugin_carrier.marketplace_source',
      );
  if (marketplaceSource?.startsWith('-') || marketplaceSource?.includes('\0')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured Codex Plugin Manager marketplace source is invalid.',
      {
        package_id: input.packageId,
        marketplace_source: marketplaceSource,
        manifest_url: input.manifestUrl,
        failure_code: 'configured_codex_plugin_carrier_descriptor_invalid',
      },
    );
  }
  const normalizedRequiredSkills = stringList(normalizedExecutor?.requiredSkillIds);
  if (normalizedExecutor && (
    normalizedRequiredSkills.length !== input.requiredSkillIds.length
    || normalizedRequiredSkills.some((skillId) => !input.requiredSkillIds.includes(skillId))
  )) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured Codex Plugin Manager executor Skills must match the normalized Package manifest.',
      {
        package_id: input.packageId,
        manifest_url: input.manifestUrl,
        failure_code: 'configured_codex_plugin_carrier_descriptor_invalid',
      },
    );
  }
  return {
    packageId: input.packageId,
    interactionMode: input.interactionMode,
    carrier: {
      kind: 'codex_plugin_manager',
      pluginId: pluginSelector,
      marketplaceSource,
    },
    executor: {
      route: 'codex_cli',
      requiredSkillIds: [...input.requiredSkillIds],
    },
    publicationRef: value.publication_ref === undefined
      && value.publicationRef === undefined
      ? null
      : value.publication_ref === null || value.publicationRef === null
      ? null
      : assertStringValue(
          value.publication_ref ?? value.publicationRef,
          'codex_surface.configured_codex_plugin_carrier.publication_ref',
        ),
  };
}
