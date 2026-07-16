import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { recordList, stringList, stringValue } from '../../../kernel/json-record.ts';
import { canonicalAgentPackageId } from '../agent-package-identity.ts';
import {
  assertFirstPartyPackageCatalogVersion,
  resolveFirstPartyPackageCatalog,
} from '../agent-package-first-party.ts';
import { getOplPackageSpecs } from '../package-distribution.ts';
import {
  selectManagedCatalogPackageVersion,
  type ManagedCatalogVersion,
  type ManagedPackageCatalog,
} from './capability-reconciliation.ts';
import { agentPackageTargetCurrentness } from './currentness.ts';
import { normalizePackageManifest } from './manifest-normalizers.ts';
import { packageRoleFromInstalledLock } from './package-role.ts';
import { agentPackageLifecycleUxReadback } from './readback.ts';
import { resolveAgentPackageEffectiveSourcePolicy } from './source-policy.ts';
import {
  assertExplicitExternalRegistryClaim,
  fetchJsonSource,
  refsOnlyAuthorityBoundary,
  uniqueStrings,
} from './shared.ts';
import type {
  AgentPackageLock,
  AgentPackagePackageActionInput,
  AgentPackageRegistryCache,
  AgentPackageRegistryEntry,
  AgentPackageRole,
} from './types.ts';

type PackageStatusReadback = {
  status?: string;
  recommended_action?: string | null;
  operational_ready?: boolean;
  launch_allowed?: boolean;
  launch_blocked_reason?: string | null;
  materialization_readiness?: {
    status?: string;
  } | null;
  runtime_source_readiness?: {
    status?: string;
    live_verification_deferred?: boolean;
  } | null;
  currentness_detail_deferred?: boolean;
};

type DirectorySource = {
  package_id: string;
  display_name: string;
  publisher: string;
  description: string;
  tags: string[];
  package_role: AgentPackageRole | null;
  trust_tier: string;
  source: string;
  manifest_url: string;
  projected_version: string | null;
  selected_version: string | null;
  stable_version: string | null;
  registry_url: string | null;
  version_source_ref: string;
  source_kind: 'first_party_framework_projection' | 'first_party_release_catalog' | 'agent_package_registry_cache' | 'installed_package_lock';
  registry_source_ref: string | null;
  release_target: ManagedCatalogVersion | null;
  version_currentness: {
    status: 'live_release_set' | 'cached_release_set' | 'last_known_good_release_set' | 'framework_projection_only' | 'registry_cache' | 'installed_lock_only';
    live_verified: boolean;
    source_ref: string | null;
    source_digest: string | null;
    checked_at: string | null;
  };
};

export type FirstPartyDirectoryCatalogSnapshot = {
  catalog: ManagedPackageCatalog;
  freshness: 'live' | 'cached' | 'last_known_good';
  catalog_ref: string;
  catalog_digest: string | null;
  checked_at: string;
};

const PACKAGE_ROLES = new Set<AgentPackageRole>([
  'standard_agent',
  'framework_capability_package',
  'workflow_profile',
]);

function isFirstPartyDirectorySource(source: DirectorySource) {
  return source.source_kind === 'first_party_release_catalog'
    || source.source_kind === 'first_party_framework_projection';
}
function packageRoleFromManifest(payload: unknown, manifestUrl: string) {
  if (!isRecord(payload)) {
    normalizePackageManifest(payload, manifestUrl);
    throw new Error('unreachable');
  }
  const manifest = normalizePackageManifest(payload, manifestUrl);
  return { manifest, role: manifest.package_role };
}

function manifestDirectoryMetadata(payload: unknown, manifestUrl: string) {
  const { manifest, role } = packageRoleFromManifest(payload, manifestUrl);
  const raw = isRecord(payload) ? payload : {};
  return {
    package_id: manifest.package_id,
    display_name: manifest.display_name,
    publisher: manifest.publisher,
    description: stringValue(raw.description) ?? `${manifest.display_name} package.`,
    tags: uniqueStrings([...stringList(raw.tags), role, manifest.source]),
    package_role: role,
    selected_version: manifest.version,
  };
}

function selectedCatalogVersion(entry: Record<string, unknown>, packageId: string) {
  const selectedVersion = stringValue(entry.selected_version);
  const versions = recordList(entry.versions);
  const selected = versions.find((candidate) =>
    stringValue(candidate.package_version) === selectedVersion
    && candidate.selection_status === 'selected_for_release_set'
  );
  if (!selectedVersion || !selected) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL package catalog entry has no selected stable version.', {
      package_id: packageId,
      selected_version: selectedVersion,
      failure_code: 'agent_package_directory_catalog_selection_invalid',
    });
  }
  return { selectedVersion, selected };
}

export function isOplPackageCatalog(payload: unknown) {
  if (!isRecord(payload)) return false;
  return payload.surface_kind === 'opl_package_catalog.v1'
    || payload.package_catalog_surface_kind === 'opl_package_catalog.v1';
}

export function normalizePackageCatalogRegistry(
  payload: unknown,
  registryUrl: string,
  registrySha256: string,
): AgentPackageRegistryCache {
  if (!isRecord(payload) || !isRecord(payload.packages) || !isRecord(payload.packages.package_catalog)) {
    throw new FrameworkContractError('contract_shape_invalid', 'OPL package catalog must declare packages.package_catalog.', {
      registry_url: registryUrl,
      failure_code: 'agent_package_directory_catalog_invalid',
    });
  }
  const entries = Object.entries(payload.packages.package_catalog).map(([declaredId, rawEntry], index) => {
    if (!isRecord(rawEntry)) {
      throw new FrameworkContractError('contract_shape_invalid', 'OPL package catalog entries must be objects.', {
        registry_url: registryUrl,
        entry_index: index,
        failure_code: 'agent_package_directory_catalog_invalid',
      });
    }
    const packageId = canonicalAgentPackageId(stringValue(rawEntry.package_id) ?? declaredId);
    if (!packageId || packageId !== declaredId) {
      throw new FrameworkContractError('contract_shape_invalid', 'OPL package catalog identity must be canonical and match its key.', {
        registry_url: registryUrl,
        declared_id: declaredId,
        package_id: packageId,
        failure_code: 'agent_package_directory_catalog_identity_invalid',
      });
    }
    if (resolveFirstPartyPackageCatalog(packageId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'External package catalogs cannot claim canonical first-party package identities.', {
        registry_url: registryUrl,
        package_id: packageId,
        failure_code: 'agent_package_registry_first_party_identity_collision',
      });
    }
    const declaredSource = assertExplicitExternalRegistryClaim(rawEntry.source, {
      field: 'source',
      sourceLabel: `${registryUrl}#packages.package_catalog.${packageId}`,
      failureCode: 'agent_package_directory_catalog_source_invalid',
    });
    const declaredTrustTier = assertExplicitExternalRegistryClaim(rawEntry.trust_tier, {
      field: 'trust_tier',
      sourceLabel: `${registryUrl}#packages.package_catalog.${packageId}`,
      failureCode: 'agent_package_directory_catalog_trust_tier_invalid',
    });
    const { selectedVersion, selected } = selectedCatalogVersion(rawEntry, packageId);
    const manifestUrl = stringValue(selected.manifest_url);
    const manifestJson = stringValue(selected.manifest_json);
    if (!manifestUrl || !manifestJson) {
      throw new FrameworkContractError('contract_shape_invalid', 'Selected package catalog versions require inline manifest identity.', {
        registry_url: registryUrl,
        package_id: packageId,
        failure_code: 'agent_package_directory_catalog_manifest_missing',
      });
    }
    const metadata = manifestDirectoryMetadata(parseJsonText(manifestJson), manifestUrl);
    const declaredRole = stringValue(rawEntry.package_role);
    if (!declaredRole || !PACKAGE_ROLES.has(declaredRole as AgentPackageRole) || declaredRole !== metadata.package_role) {
      throw new FrameworkContractError('contract_shape_invalid', 'OPL package catalog role must match the selected manifest.', {
        registry_url: registryUrl,
        package_id: packageId,
        declared_role: declaredRole,
        manifest_role: metadata.package_role,
        allowed_roles: [...PACKAGE_ROLES],
        failure_code: 'agent_package_directory_catalog_role_invalid',
      });
    }
    if (metadata.package_id !== packageId || metadata.selected_version !== selectedVersion) {
      throw new FrameworkContractError('contract_shape_invalid', 'OPL package catalog selection must match its inline manifest.', {
        registry_url: registryUrl,
        package_id: packageId,
        manifest_package_id: metadata.package_id,
        selected_version: selectedVersion,
        manifest_version: metadata.selected_version,
        failure_code: 'agent_package_directory_catalog_manifest_mismatch',
      });
    }
    return {
      package_id: packageId,
      display_name: stringValue(rawEntry.display_name) ?? metadata.display_name,
      publisher: stringValue(rawEntry.publisher) ?? metadata.publisher,
      description: stringValue(rawEntry.description) ?? metadata.description,
      tags: uniqueStrings([...stringList(rawEntry.tags), ...metadata.tags]),
      package_role: metadata.package_role,
      source: declaredSource,
      manifest_url: manifestUrl,
      version_source_ref: `${manifestUrl}#/version`,
      selected_version: selectedVersion,
      stable_version: selectedVersion,
      manifest_validation: 'catalog_inline_manifest' as const,
      trust_tier: declaredTrustTier,
      starter_default: rawEntry.starter_default === true,
      codex_visible_entry: null,
      required_skill_ids: [],
      optional_skill_ids: [],
      home_shortcut_ids: [],
      display_policy: null,
      ordinary_user_source: null,
    } satisfies AgentPackageRegistryEntry;
  });
  return {
    surface_kind: 'opl_agent_package_registry_cache',
    version: 'opl-agent-package-registry-cache.v1',
    refreshed_at: new Date().toISOString(),
    registry_url: registryUrl,
    registry_sha256: registrySha256,
    entry_count: entries.length,
    entries,
  };
}

export async function enrichRegistryCacheManifestMetadata(cache: AgentPackageRegistryCache) {
  const entries = await Promise.all(cache.entries.map(async (entry) => {
    if (entry.manifest_validation === 'catalog_inline_manifest') return entry;
    const fetched = await fetchJsonSource(entry.manifest_url);
    const metadata = manifestDirectoryMetadata(fetched.payload, entry.manifest_url);
    if (metadata.package_id !== entry.package_id) {
      throw new FrameworkContractError('contract_shape_invalid', 'Registry entry package id must match its manifest.', {
        registry_url: cache.registry_url,
        manifest_url: entry.manifest_url,
        registry_package_id: entry.package_id,
        manifest_package_id: metadata.package_id,
        failure_code: 'registry_manifest_package_id_mismatch',
      });
    }
    if (entry.package_role && entry.package_role !== metadata.package_role) {
      throw new FrameworkContractError('contract_shape_invalid', 'Registry entry package role must match its manifest.', {
        registry_url: cache.registry_url,
        manifest_url: entry.manifest_url,
        package_id: entry.package_id,
        registry_package_role: entry.package_role,
        manifest_package_role: metadata.package_role,
        failure_code: 'registry_manifest_package_role_mismatch',
      });
    }
    if (entry.version_source_ref !== `${entry.manifest_url}#/version`) {
      throw new FrameworkContractError('contract_shape_invalid', 'Registry version source must point to the selected manifest version.', {
        registry_url: cache.registry_url,
        manifest_url: entry.manifest_url,
        package_id: entry.package_id,
        registry_version_source_ref: entry.version_source_ref,
        expected_version_source_ref: `${entry.manifest_url}#/version`,
        failure_code: 'registry_manifest_version_source_mismatch',
      });
    }
    for (const field of ['selected_version', 'stable_version'] as const) {
      const registryVersion = entry[field];
      if (registryVersion && registryVersion !== metadata.selected_version) {
        throw new FrameworkContractError('contract_shape_invalid', `Registry entry ${field} must match its manifest version.`, {
          registry_url: cache.registry_url,
          manifest_url: entry.manifest_url,
          package_id: entry.package_id,
          [`registry_${field}`]: registryVersion,
          manifest_version: metadata.selected_version,
          failure_code: `registry_manifest_${field.replace('_version', '')}_version_mismatch`,
        });
      }
    }
    return {
      ...entry,
      display_name: entry.display_name || metadata.display_name,
      publisher: entry.publisher || metadata.publisher,
      description: entry.description === `${entry.display_name} package.`
        ? metadata.description
        : entry.description,
      tags: uniqueStrings([...entry.tags, ...metadata.tags]),
      package_role: metadata.package_role,
      selected_version: metadata.selected_version,
      stable_version: entry.stable_version ?? metadata.selected_version,
      manifest_validation: 'fetched_manifest' as const,
    };
  }));
  return { ...cache, entries, entry_count: entries.length };
}

function firstPartyDirectorySources(snapshot: FirstPartyDirectoryCatalogSnapshot | null): DirectorySource[] {
  return getOplPackageSpecs().map((spec) => {
    const selected = snapshot
      ? selectManagedCatalogPackageVersion(snapshot.catalog, spec.package_id)
      : null;
    if (selected) assertFirstPartyPackageCatalogVersion(spec.package_id, selected);
    const currentnessStatus = snapshot?.freshness === 'live'
      ? 'live_release_set'
      : snapshot?.freshness === 'cached'
        ? 'cached_release_set'
        : snapshot?.freshness === 'last_known_good'
          ? 'last_known_good_release_set'
          : 'framework_projection_only';
    return {
      package_id: spec.package_id,
      display_name: spec.label,
      publisher: 'one-person-lab',
      description: spec.description,
      tags: [...spec.tags],
      package_role: spec.package_role,
      trust_tier: spec.trust_tier,
      source: 'first_party',
      manifest_url: selected?.manifest_url ?? spec.package_manifest_ref,
      projected_version: spec.selected_version,
      selected_version: selected?.package_version ?? null,
      stable_version: selected?.package_version ?? null,
      registry_url: null,
      version_source_ref: selected
        ? `${snapshot!.catalog_ref}#packages.package_catalog.${spec.package_id}.selected_version`
        : `${spec.package_manifest_ref}#/version`,
      source_kind: selected ? 'first_party_release_catalog' : 'first_party_framework_projection',
      registry_source_ref: selected ? snapshot!.catalog_ref : spec.package_manifest_ref,
      version_currentness: {
        status: currentnessStatus,
        live_verified: snapshot?.freshness === 'live',
        source_ref: snapshot?.catalog_ref ?? spec.package_manifest_ref,
        source_digest: snapshot?.catalog_digest ?? null,
        checked_at: snapshot?.checked_at ?? null,
      },
      release_target: selected,
    };
  });
}

function registryDirectorySource(cache: AgentPackageRegistryCache, entry: AgentPackageRegistryEntry): DirectorySource {
  return {
    package_id: entry.package_id,
    display_name: entry.display_name,
    publisher: entry.publisher,
    description: entry.description,
    tags: [...entry.tags],
    package_role: entry.package_role,
    trust_tier: entry.trust_tier,
    source: entry.source,
    manifest_url: entry.manifest_url,
    projected_version: null,
    selected_version: entry.selected_version,
    stable_version: entry.stable_version,
    registry_url: cache.registry_url,
    version_source_ref: entry.version_source_ref,
    source_kind: 'agent_package_registry_cache',
    registry_source_ref: cache.registry_url,
    version_currentness: {
      status: 'registry_cache',
      live_verified: false,
      source_ref: cache.registry_url,
      source_digest: cache.registry_sha256,
      checked_at: cache.refreshed_at,
    },
    release_target: null,
  };
}

function lockDirectorySource(lock: AgentPackageLock, packageRole: AgentPackageRole | null): DirectorySource {
  return {
    package_id: lock.package_id,
    display_name: lock.display_name,
    publisher: lock.publisher,
    description: `${lock.display_name} installed package.`,
    tags: uniqueStrings(['installed', ...(packageRole ? [packageRole] : [])]),
    package_role: packageRole,
    trust_tier: lock.trust_tier,
    source: lock.source_kind,
    manifest_url: lock.manifest_url,
    projected_version: null,
    selected_version: lock.package_version,
    stable_version: null,
    registry_url: null,
    version_source_ref: `${lock.manifest_url}#/version`,
    source_kind: 'installed_package_lock',
    registry_source_ref: null,
    version_currentness: {
      status: 'installed_lock_only',
      live_verified: false,
      source_ref: lock.release_channel_ref ?? lock.manifest_url,
      source_digest: lock.release_channel_digest ?? null,
      checked_at: lock.updated_at,
    },
    release_target: null,
  };
}

function installedRoleResolution(lock: AgentPackageLock, source: DirectorySource | null) {
  try {
    return {
      role: packageRoleFromInstalledLock(lock),
      source: 'installed_lock' as const,
      diagnostic: null,
    };
  } catch (error) {
    const legacyRoleMissing = error instanceof FrameworkContractError
      && error.details?.failure_code === 'agent_package_lock_role_missing';
    if (legacyRoleMissing && source && isFirstPartyDirectorySource(source) && source.package_role) {
      return {
        role: source.package_role,
        source: 'first_party_catalog_identity_fallback' as const,
        diagnostic: null,
      };
    }
    return {
      role: null,
      source: 'unresolved_installed_lock' as const,
      diagnostic: {
        code: error instanceof FrameworkContractError ? error.code : 'unexpected_error',
        message: error instanceof Error ? error.message : 'Installed package role could not be resolved.',
      },
    };
  }
}

function packageAction(
  actionId: string,
  payload: Record<string, unknown>,
  requiredPayloadFields: string[],
  confirmationRequired: boolean,
) {
  return {
    action_id: actionId,
    action_ref: `app_state.actions#${actionId}`,
    payload,
    required_payload_fields: requiredPayloadFields,
    confirmation_required: confirmationRequired,
  };
}

function installPayload(source: DirectorySource) {
  if (isFirstPartyDirectorySource(source)) {
    return { package_id: source.package_id };
  }
  return source.registry_url
    ? {
        package_id: source.package_id,
        registry_url: source.registry_url,
      }
    : {
        package_id: source.package_id,
        manifest_url: source.manifest_url,
        trust_tier: source.trust_tier,
      };
}

function activationPayload(
  source: DirectorySource,
  context: Pick<AgentPackagePackageActionInput, 'scope' | 'targetWorkspace' | 'targetQuest'> | null,
) {
  return {
    package_id: source.package_id,
    ...(context?.scope ? { scope: context.scope } : {}),
    ...(context?.targetWorkspace ? { target_workspace: context.targetWorkspace } : {}),
    ...(context?.targetQuest ? { target_quest: context.targetQuest } : {}),
  };
}

function availableActions(
  source: DirectorySource,
  installed: boolean,
  activated: boolean,
  context: Pick<AgentPackagePackageActionInput, 'scope' | 'targetWorkspace' | 'targetQuest'> | null,
  activationAllowed: boolean,
  automaticUpdateAllowed: boolean,
) {
  if (!source.package_role) {
    if (installed) {
      return [
        packageAction('agent_package_repair', { package_id: source.package_id }, ['package_id'], true),
        packageAction('agent_package_uninstall', { package_id: source.package_id }, ['package_id'], true),
      ];
    }
    return [packageAction(
      'refresh_registry',
      { registry_url: source.registry_url },
      ['registry_url'],
      false,
    )];
  }
  if (!installed) {
    const payload = installPayload(source);
    return [packageAction(
      'install_from_manifest_url',
      payload,
      Object.hasOwn(payload, 'registry_url')
        ? ['registry_url', 'package_id']
        : Object.hasOwn(payload, 'manifest_url')
          ? ['manifest_url', 'trust_tier']
          : ['package_id'],
      true,
    )];
  }
  const updatePayload = isFirstPartyDirectorySource(source)
    ? { package_id: source.package_id }
    : source.registry_url
      ? {
          package_id: source.package_id,
          registry_url: source.registry_url,
        }
      : {
          package_id: source.package_id,
          manifest_url: source.manifest_url,
          trust_tier: source.trust_tier,
        };
  return [
    ...(!activated && activationAllowed ? [packageAction('agent_package_activate', activationPayload(source, context), [
        'package_id',
        'scope',
        'target_workspace or target_quest',
      ], false)] : []),
    ...(automaticUpdateAllowed
      ? [packageAction('agent_package_update', updatePayload, ['package_id'], true)]
      : []),
    packageAction('agent_package_repair', { package_id: source.package_id }, ['package_id'], true),
    packageAction('agent_package_preferences_set', { package_id: source.package_id }, [
      'package_id',
      'exposure_action or shortcut_id',
    ], false),
    packageAction('agent_package_uninstall', { package_id: source.package_id }, ['package_id'], true),
  ];
}

function recommendedActionId(input: {
  installed: boolean;
  activated: boolean;
  statusAction: string | null;
  lifecycleAction: string | null;
  availableActionIds: Set<string>;
}) {
  if (!input.installed) {
    if (input.availableActionIds.has('install_from_manifest_url')) return 'install_from_manifest_url';
    if (input.availableActionIds.has('refresh_registry')) return 'refresh_registry';
    return null;
  }
  const candidate = input.statusAction ?? input.lifecycleAction;
  const normalized = candidate === 'repair'
    ? 'agent_package_repair'
    : candidate === 'install_from_manifest_url'
      ? 'agent_package_update'
      : candidate;
  if (normalized && input.availableActionIds.has(normalized)) return normalized;
  if (!input.activated && input.availableActionIds.has('agent_package_activate')) return 'agent_package_activate';
  return null;
}

export function buildAgentPackageDirectory(input: {
  registryCache: AgentPackageRegistryCache | null;
  locks: AgentPackageLock[];
  detail: 'fast' | 'full';
  firstPartyCatalog?: FirstPartyDirectoryCatalogSnapshot | null;
  readStatus?: (packageId: string) => PackageStatusReadback;
  actionContext?: (packageId: string) => Pick<AgentPackagePackageActionInput, 'scope' | 'targetWorkspace' | 'targetQuest'> | null;
}) {
  const sources = new Map(firstPartyDirectorySources(input.firstPartyCatalog ?? null)
    .map((entry) => [entry.package_id, entry]));
  for (const entry of input.registryCache?.entries ?? []) {
    if (resolveFirstPartyPackageCatalog(entry.package_id)) continue;
    const existing = sources.get(entry.package_id);
    const candidate = registryDirectorySource(input.registryCache!, entry);
    if (!existing || !isFirstPartyDirectorySource(existing)) {
      sources.set(entry.package_id, existing ? {
        ...existing,
        ...candidate,
        tags: uniqueStrings([...existing.tags, ...candidate.tags]),
        source_kind: existing.source_kind,
        registry_source_ref: existing.registry_source_ref,
      } : candidate);
    }
  }
  const locksById = new Map(input.locks.map((lock) => [lock.package_id, lock]));
  const installedRoles = new Map(input.locks.map((lock) => {
    const source = sources.get(lock.package_id) ?? null;
    const resolution = installedRoleResolution(lock, source);
    if (!source) sources.set(lock.package_id, lockDirectorySource(lock, resolution.role));
    return [lock.package_id, resolution] as const;
  }));
  const entries = [...sources.values()].map((source) => {
    const lock = locksById.get(source.package_id) ?? null;
    const installed = Boolean(lock);
    const sourcePolicy = resolveFirstPartyPackageCatalog(source.package_id)
      ? resolveAgentPackageEffectiveSourcePolicy(source.package_id, { profile: input.detail })
      : null;
    const installedRole = lock ? installedRoles.get(source.package_id)! : null;
    const effectiveSource = installed
      ? { ...source, package_role: installedRole!.role }
      : source;
    const roleKnown = effectiveSource.package_role !== null;
    const roleMismatch = Boolean(
      installedRole?.role
      && source.package_role
      && installedRole.role !== source.package_role,
    );
    const roleRepairRequired = installed && (!roleKnown || roleMismatch);
    const lifecycle = agentPackageLifecycleUxReadback({ packageId: source.package_id, lock });
    let status: PackageStatusReadback = {};
    let statusReadError: { code: string; message: string } | null = null;
    if (installed) {
      try {
        status = input.readStatus?.(source.package_id) ?? {};
      } catch (error) {
        statusReadError = {
          code: error instanceof FrameworkContractError ? error.code : 'unexpected_error',
          message: error instanceof Error ? error.message : 'Package status read failed.',
        };
        status = {
          recommended_action: 'agent_package_repair',
          operational_ready: false,
          launch_allowed: false,
          launch_blocked_reason: 'package_status_read_failed',
        };
      }
    }
    const materializationStatus = status.materialization_readiness?.status ?? null;
    const activationRequired = status.recommended_action === 'agent_package_activate'
      || lifecycle.recommended_action === 'agent_package_activate';
    const activated = installed
      && !roleRepairRequired
      && !activationRequired
      && status.operational_ready === true
      && status.launch_allowed === true
      && (materializationStatus === 'current' || materializationStatus === 'not_required');
    const verificationDeferred = installed && activated && (
      input.detail === 'fast'
      || status.currentness_detail_deferred === true
      || status.runtime_source_readiness?.live_verification_deferred === true
    );
    const actionContext = input.actionContext?.(source.package_id) ?? null;
    const desiredSourceKind = sourcePolicy?.desired_source_kind ?? lock?.source_kind ?? null;
    const targetCurrentness = lock && source.release_target && desiredSourceKind
      ? agentPackageTargetCurrentness({
          lock,
          target: source.release_target,
          desiredSourceKind,
        })
      : null;
    const sourcePolicyStatus = !sourcePolicy
      ? 'not_applicable'
      : sourcePolicy.desired_source_kind === 'developer_checkout_override'
        ? !sourcePolicy.developer_checkout_available
          ? 'manual_required'
          : lock?.source_kind === 'developer_checkout_override'
            ? 'current'
            : 'reconciliation_available'
        : lock && lock.source_kind !== 'first_party_managed_cohort'
          ? 'reconciliation_available'
          : 'current';
    const automaticSourceReconciliationAllowed = Boolean(
      sourcePolicy
      && sourcePolicyStatus === 'reconciliation_available'
      && (
        sourcePolicy.desired_source_kind === 'first_party_managed_cohort'
        || sourcePolicy.developer_checkout_available
      ),
    );
    const actions = statusReadError
      ? [packageAction('agent_package_repair', { package_id: source.package_id }, ['package_id'], true)]
      : availableActions(
          effectiveSource,
          installed,
          activated,
          actionContext,
          lock?.exposure_state !== 'disabled',
          lock?.source_kind !== 'developer_checkout_override' && (
            sourcePolicy?.package_channel_auto_update === true
            || automaticSourceReconciliationAllowed
            || !sourcePolicy
          ),
        );
    const recommendedAction = recommendedActionId({
      installed,
      activated,
      statusAction: roleRepairRequired ? 'agent_package_repair' : status.recommended_action ?? null,
      lifecycleAction: lifecycle.recommended_action,
      availableActionIds: new Set(actions.map((action) => action.action_id)),
    });
    const readinessStatus = installed && !roleKnown
      ? 'migration_required'
      : roleMismatch || statusReadError
        ? 'repair_required'
        : !installed
      ? roleKnown ? 'not_installed' : 'migration_required'
        : activated
          ? verificationDeferred ? 'verification_deferred' : 'ready'
          : recommendedAction === 'agent_package_activate'
            ? 'activation_required'
          : 'attention_needed';
    return {
      package_id: source.package_id,
      display_name: source.display_name,
      publisher: source.publisher,
      description: source.description,
      tags: source.tags,
      package_role: effectiveSource.package_role,
      role_state: {
        status: !installed
          ? roleKnown ? 'declared' : 'migration_required'
          : !roleKnown
            ? 'migration_required'
            : roleMismatch
              ? 'mismatch_repair_required'
              : 'current',
        source: installedRole?.source ?? source.source_kind,
        discovered_role: source.package_role,
        installed_role: installedRole?.role ?? null,
        diagnostic: installedRole?.diagnostic ?? null,
      },
      trust_tier: source.trust_tier,
      source_explanation: {
        kind: source.source_kind,
        source: source.source,
        summary: source.source_kind === 'first_party_release_catalog'
          ? 'Release Set selection resolved by the canonical managed Package catalog selector.'
          : source.source_kind === 'first_party_framework_projection'
            ? 'Framework-owned first-party Package projection; no Release Set selection was verified for this readback.'
          : source.source_kind === 'agent_package_registry_cache'
            ? 'Validated discovery metadata from the Framework Agent Package registry cache.'
            : 'Installed lock retained after its discovery source became unavailable.',
        catalog_ref: source.source_kind === 'first_party_release_catalog'
          ? resolveFirstPartyPackageCatalog(source.package_id)?.catalogSource.catalog_ref ?? null
          : null,
        registry_url: source.registry_url,
        registry_source_ref: source.registry_source_ref,
        version_source_ref: source.version_source_ref,
        installed_source_kind: lock?.source_kind ?? null,
        effective_source_policy: sourcePolicy,
        source_policy_status: sourcePolicyStatus,
      },
      manifest_url: source.manifest_url,
      projected_version: source.projected_version,
      selected_version: source.selected_version,
      stable_version: source.stable_version,
      version_currentness: source.version_currentness,
      target_manifest_sha256: source.release_target?.manifest_sha256 ?? null,
      target_content_digest: source.release_target?.content_digest ?? null,
      target_artifact_digest: source.release_target?.artifact_digest ?? null,
      package_currentness: !installed
        ? {
            status: source.release_target ? 'not_installed' : 'unknown',
            reasons: source.release_target ? ['package_not_installed'] : ['release_set_unavailable'],
          }
        : sourcePolicyStatus === 'manual_required'
          ? {
              status: 'manual_required',
              reasons: [
                'developer_checkout_unavailable',
                ...(targetCurrentness?.reasons ?? []),
              ],
            }
          : sourcePolicyStatus === 'reconciliation_available'
            ? targetCurrentness ?? {
              status: 'update_available',
              reasons: ['source_policy_mismatch', 'release_set_unavailable'],
            }
            : targetCurrentness ?? {
                status: 'unknown',
                reasons: ['release_set_unavailable'],
              },
      installed_version: lock?.package_version ?? null,
      installed_content_digest: lock?.content_digest ?? null,
      installed_artifact_digest: lock?.artifact_digest ?? null,
      installed,
      activated,
      installability: {
        status: installed
          ? roleRepairRequired ? 'migration_required' : 'installed'
          : roleKnown ? 'installable' : 'migration_required',
        installable: !installed && roleKnown,
      },
      readiness: {
        status: readinessStatus,
        operational_ready: installed && !verificationDeferred && status.operational_ready === true,
        launch_allowed: installed && !verificationDeferred && status.launch_allowed === true,
        verification_deferred: verificationDeferred,
        reason: !installed
          ? roleKnown ? 'package_not_installed' : 'registry_role_refresh_required'
          : roleRepairRequired
            ? roleMismatch ? 'installed_role_mismatch' : 'installed_role_migration_required'
            : status.launch_blocked_reason
              ?? (activated
                ? verificationDeferred ? 'live_verification_deferred' : null
                : 'package_activation_required'),
        detail_surface: `opl packages status --package-id ${source.package_id} --json`,
        status_read_error: statusReadError,
      },
      recommended_action: recommendedAction,
      recommended_action_ref: actions.find((action) => action.action_id === recommendedAction) ?? null,
      available_actions: actions,
      ...(input.detail === 'full' ? {
        lifecycle_ux: lifecycle,
        lock_ref: lock?.lock_ref ?? null,
        scope_materialization_count: lock?.scope_materializations?.length ?? 0,
      } : {}),
      authority_boundary: refsOnlyAuthorityBoundary(),
    };
  }).sort((left, right) => left.display_name.localeCompare(right.display_name, 'en'));
  return {
    surface_kind: 'opl_agent_package_directory.v1',
    status: entries.some((entry) => entry.role_state.status === 'migration_required'
      || entry.role_state.status === 'mismatch_repair_required'
      || entry.readiness.status === 'repair_required')
      ? 'attention_required'
      : 'available',
    source_catalog_kind: 'opl_framework_package_projection+optional_release_set+opl_agent_package_registry_cache',
    first_party_release_currentness: {
      status: input.firstPartyCatalog?.freshness ?? 'unknown',
      live_verified: input.firstPartyCatalog?.freshness === 'live',
      catalog_ref: input.firstPartyCatalog?.catalog_ref ?? null,
      catalog_digest: input.firstPartyCatalog?.catalog_digest ?? null,
      checked_at: input.firstPartyCatalog?.checked_at ?? null,
    },
    detail: input.detail,
    entry_count: entries.length,
    installed_package_count: entries.filter((entry) => entry.installed).length,
    installable_package_count: entries.filter((entry) => entry.installability.installable).length,
    migration_required_count: entries.filter((entry) => entry.installability.status === 'migration_required').length,
    entries,
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
