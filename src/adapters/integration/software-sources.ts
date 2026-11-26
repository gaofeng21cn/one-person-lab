import {
  addCatalogSoftwareSource,
  readSoftwareSource,
  readSoftwareSources,
  removeCatalogSoftwareSource,
  softwareSourceFailure,
  writeSoftwareSource,
} from './software-sources-store.ts';
import { assertCredentialHandleOnlyPayload } from './connection-registry.ts';
import { normalizeSoftwareSourceCredential } from './software-sources-store.ts';
import { verifySoftwareSourceCredential } from './software-sources-verification.ts';
import { readInstalledSoftwareProducts } from './software-sources-framework-installation.ts';
import { refreshFrameworkSoftwareRelease } from './software-sources-framework-release.ts';
import {
  readCatalogSourceCacheStatus,
  refreshCatalogSource,
  removeCatalogSourceCache,
} from './software-catalog-source.ts';
import { executeHomebrewSourceAction, HOMEBREW_ACTION_IDS, homebrewActionCatalog, readHomebrewSourceProjection, refreshHomebrewSource, type HomebrewActionId } from './homebrew-source.ts';
import type {
  SoftwareSource, SoftwareSourceConfigureInput, SoftwareSourceDependencies,
  SoftwareSourceProviderId,
} from './software-sources-types.ts';

export type SoftwareSourceActionId = 'source_list' | 'source_check' | 'source_configure' | 'source_disconnect' | 'source_add' | 'source_remove' | HomebrewActionId;
export const SOFTWARE_SOURCE_ACTION_IDS: readonly SoftwareSourceActionId[] = [
  'source_list', 'source_check', 'source_configure', 'source_disconnect', 'source_add', 'source_remove',
  ...HOMEBREW_ACTION_IDS,
];

const SOURCE_ACTIONS = [
  {
    action_id: 'source_list', label: 'List software sources', delegated_surface: 'opl sources list',
    payload_fields: [], mutates: 'none_read_only', dry_run_supported: true, confirmation_required: false,
    danger_level: 'none', impact: 'Read public and authorized software source metadata without credential values.', follow_up_action_ids: [], verify_action_id: null,
  },
  {
    action_id: 'source_check', label: 'Check software source access', delegated_surface: 'opl sources check --source-id <source_id>',
    payload_fields: ['source_id'], mutates: 'opl_software_source_verification_metadata', dry_run_supported: false, confirmation_required: false,
    danger_level: 'none', impact: 'Verify source availability through its provider and store only the status and timestamp.', follow_up_action_ids: ['source_list'], verify_action_id: 'source_list',
  },
  {
    action_id: 'source_configure', label: 'Configure software source', delegated_surface: 'opl sources configure --source-id <source_id>',
    payload_fields: ['source_id', 'provider_id', 'credential_handle', 'enabled'], default_payload: { provider_id: 'github_packages', credential_handle: 'provider:github_packages:gh-cli', enabled: true },
    mutates: 'opl_software_source_credential_reference', dry_run_supported: false, confirmation_required: true,
    danger_level: 'medium', impact: 'Store an opaque provider handle; no token or secret is written or returned.', follow_up_action_ids: ['source_check'], verify_action_id: 'source_list',
  },
  {
    action_id: 'source_disconnect', label: 'Disconnect software source', delegated_surface: 'opl sources disconnect --source-id <source_id>',
    payload_fields: ['source_id'], mutates: 'opl_software_source_credential_reference', dry_run_supported: false, confirmation_required: true,
    danger_level: 'medium', impact: 'Clear the source credential reference while preserving local Package installations.', follow_up_action_ids: ['source_list'], verify_action_id: 'source_list',
  },
  {
    action_id: 'source_add', label: 'Add catalog software source', delegated_surface: 'opl sources add --source-id <source_id> --url <catalog_index_url>',
    payload_fields: ['source_id', 'url', 'display_name'], mutates: 'opl_software_source_registration_and_catalog_cache', dry_run_supported: false, confirmation_required: true,
    danger_level: 'low', impact: 'Register an external opl-catalog software source index without writing credentials.', follow_up_action_ids: ['source_refresh', 'source_list'], verify_action_id: 'source_list',
  },
  {
    action_id: 'source_remove', label: 'Remove catalog software source', delegated_surface: 'opl sources remove --source-id <source_id>',
    payload_fields: ['source_id'], mutates: 'opl_software_source_registration_and_catalog_cache', dry_run_supported: false, confirmation_required: true,
    danger_level: 'medium', impact: 'Remove a registered external catalog source and delete its cached index.', follow_up_action_ids: ['source_list'], verify_action_id: 'source_list',
  },
] as const;

function sourceActionProjection() {
  return [...SOURCE_ACTIONS.map(action => ({ ...action })), ...homebrewActionCatalog()];
}
function credentialPresent(source: SoftwareSource) {
  return Boolean(source.credential_handle);
}
function isCatalogProvider(source: SoftwareSource) {
  return source.provider_id === 'public_registry' || source.provider_id === 'catalog';
}
function publicSource(source: SoftwareSource, env: NodeJS.ProcessEnv = process.env) {
  const { credential_handle: _credential, ...safe } = source;
  const inventory = source.provider_id === 'homebrew' ? readHomebrewSourceProjection(env) : null;
  const catalogCache = isCatalogProvider(source) ? readCatalogSourceCacheStatus(source.source_id, env) : null;
  // Public built-in providers and gaofeng21cn are OPL sources. Custom catalogs and
  // third-party GitHub namespaces stay external.
  const catalogOrigin = source.provider_id === 'catalog'
    ? 'external' as const
    : source.provider_id !== 'github_packages' || source.source_id === 'github-packages:gaofeng21cn'
      ? 'opl' as const : 'external' as const;
  const sourceActions = [
    'source_list',
    'source_check',
    ...(source.visibility === 'authorized_only' ? ['source_configure', 'source_disconnect'] : []),
    ...(isCatalogProvider(source) ? ['source_refresh'] : []),
    ...(source.provider_id === 'catalog' ? ['source_remove'] : []),
    ...(inventory?.inventory_status === 'available' ? ['source_refresh'] : inventory?.inventory_reason === 'homebrew_tap_not_connected' ? ['source_setup'] : []),
  ];
  const availableActions = sourceActionProjection()
    .filter(action => sourceActions.includes(action.action_id))
    .map(action => action.action_id === 'source_refresh' && isCatalogProvider(source) ? {
      ...action,
      label: 'Refresh software catalog',
      mutates: 'opl_software_catalog_cache',
      confirmation_required: false,
      danger_level: 'none' as const,
      impact: 'Refresh the source index without upgrading installed software.',
    } : action);
  return {
    ...safe,
    catalog_origin: catalogOrigin,
    origin_basis: 'owner_projection' as const,
    catalog_source: { manager: 'opl_packages', marketplace_id: source.source_id, delivery: 'marketplace' as const },
    ...(inventory ?? {}),
    ...(catalogCache ? { catalog_cache: catalogCache } : {}),
    credential_handle_present: credentialPresent(source),
    catalog_refresh_required: isCatalogProvider(source) && (catalogCache?.stale ?? true),
    available_actions: availableActions,
  };
}
function normalizeOwner(value: string) {
  const owner = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/.test(owner)) return null;
  return owner;
}
function sourceOwner(sourceRepo?: string | null, publicationRef?: string | null) {
  const candidate = String(publicationRef ?? sourceRepo ?? '').trim();
  const ghcr = /^ghcr\.io\/([^/]+)\//i.exec(candidate);
  if (ghcr) return normalizeOwner(ghcr[1]);
  const github = /github\.com[/:]([^/]+)(?:\/|$)/i.exec(candidate);
  if (github) return normalizeOwner(github[1]);
  const short = /^([^/]+)\/[^/]+$/.exec(String(sourceRepo ?? ''));
  return short ? normalizeOwner(short[1]) : null;
}
function nowIso(deps: SoftwareSourceDependencies) { return (deps.now ?? (() => new Date()))().toISOString(); }
export async function refreshOplCatalogSource(sourceId: string, deps: SoftwareSourceDependencies = {}) {
  const env = deps.env ?? process.env;
  const source = readSoftwareSource(sourceId, env);
  if (source.provider_id === 'homebrew') {
    const inventory = await refreshHomebrewSource({ env, now: deps.now, run: deps.homebrewRun });
    const verified = writeSoftwareSource({
      ...source,
      status: inventory.inventory_status === 'available' ? 'public' : 'unknown',
      verified_at: inventory.inventory_checked_at ?? nowIso(deps),
      verification_reason: inventory.inventory_reason ?? 'homebrew_native_inventory_verified',
    }, source.revision, env);
    return { software_source: publicSource(verified, env), native_inventory: inventory };
  }
  if (!isCatalogProvider(source)) {
    softwareSourceFailure('software_source_refresh_unsupported', `Software source ${source.source_id} does not support refresh.`);
  }
  const synced = await refreshCatalogSource(source, env, { now: deps.now, catalogFetch: deps.catalogFetch });
  const stored = writeSoftwareSource({
    ...source,
    status: 'public',
    verified_at: synced.meta.fetched_at,
    verification_reason: synced.not_modified ? 'catalog_index_not_modified' : 'catalog_index_synced',
  }, source.revision, env);
  if (source.provider_id === 'public_registry' && !deps.verify && !deps.catalogFetch) {
    refreshFrameworkSoftwareRelease(env);
  }
  return { software_source: publicSource(stored, env), catalog_sync: synced };
}
export async function addOplSoftwareSource(
  input: { source_id: string; url: string; display_name?: string },
  deps: SoftwareSourceDependencies = {},
) {
  const env = deps.env ?? process.env;
  const created = addCatalogSoftwareSource(input, env);
  try {
    const synced = await refreshCatalogSource(created, env, { now: deps.now, catalogFetch: deps.catalogFetch });
    const stored = writeSoftwareSource({
      ...created,
      status: 'public',
      verified_at: synced.meta.fetched_at,
      verification_reason: 'catalog_index_synced',
    }, created.revision, env);
    return { software_source: publicSource(stored, env), catalog_sync: synced };
  } catch (error) {
    try {
      removeCatalogSoftwareSource(created.source_id, env);
      removeCatalogSourceCache(created.source_id, env);
    } catch {
      // Best-effort rollback if initial catalog fetch or digest verification fails.
    }
    throw error;
  }
}
export function removeOplSoftwareSource(sourceId: string, env: NodeJS.ProcessEnv = process.env) {
  const removed = removeCatalogSoftwareSource(sourceId, env);
  removeCatalogSourceCache(removed.source_id, env);
  return {
    removed_source_id: removed.source_id,
    cache_removed: true,
    local_installations_preserved: true,
  };
}
export async function checkOplSoftwareSource(sourceId: string, deps: SoftwareSourceDependencies = {}) {
  const env = deps.env ?? process.env;
  const source = readSoftwareSource(sourceId, env);
  if (source.provider_id === 'homebrew') {
    const inventory = await refreshHomebrewSource({ env, now: deps.now, run: deps.homebrewRun });
    return writeSoftwareSource({ ...source, status: inventory.inventory_status === 'available' ? 'public' : 'unknown', verified_at: nowIso(deps), verification_reason: inventory.inventory_reason ?? 'homebrew_native_inventory_verified' }, source.revision, env);
  }
  if (isCatalogProvider(source) && !deps.verify) {
    try {
      const synced = await refreshCatalogSource(source, env, { now: deps.now, catalogFetch: deps.catalogFetch });
      const stored = writeSoftwareSource({
        ...source,
        status: 'public',
        verified_at: synced.meta.fetched_at,
        verification_reason: synced.not_modified ? 'catalog_index_not_modified' : 'catalog_index_synced',
      }, source.revision, env);
      if (source.provider_id === 'public_registry' && !deps.catalogFetch) refreshFrameworkSoftwareRelease(env);
      return stored;
    } catch {
      const unavailable = {
        ...source,
        status: 'unknown' as const,
        verified_at: nowIso(deps),
        verification_reason: 'software_source_verification_unavailable',
      };
      const stored = writeSoftwareSource(unavailable, source.revision, env);
      if (source.provider_id === 'public_registry' && !deps.catalogFetch) refreshFrameworkSoftwareRelease(env);
      return stored;
    }
  }
  const credentialReader = deps.verify ? undefined : (deps.credentialReader
    ?? (await import('./agent-package-registry/package-registry-access-provider.ts')).credentialForGithubPackages);
  const result = deps.verify ? await deps.verify(source) : await verifySoftwareSourceCredential(source, env, {
    credentialReader,
  });
  const verified = { ...source, status: result.status, verified_at: nowIso(deps), verification_reason: result.verification_reason };
  const stored = writeSoftwareSource(verified, source.revision, env);
  if (source.provider_id === 'public_registry' && !deps.verify) refreshFrameworkSoftwareRelease(env);
  if (stored.visibility === 'authorized_only' && stored.status === 'authorized') {
    const refresh = deps.refreshPackageAccess
      ?? (await import('./agent-package-registry/package-access.ts')).refreshGithubPackageSourceAccess;
    await refresh(stored.source_id, env);
  }
  return stored;
}
export function listOplSoftwareSources(input: {
  packageEntries?: readonly unknown[];
  refreshRequiredSourceIds?: readonly string[];
} = {}, env: NodeJS.ProcessEnv = process.env) {
  const sources = readSoftwareSources(env);
  const entries = input.packageEntries ?? [];
  const entryCount = (source: SoftwareSource) => entries.filter(entry => {
    if (!entry || typeof entry !== 'object') return false;
    const value = entry as Record<string, unknown>;
    const sourceId = typeof value.source_id === 'string' ? value.source_id : (value.package_access && typeof value.package_access === 'object' && typeof (value.package_access as Record<string, unknown>).source_id === 'string' ? (value.package_access as Record<string, unknown>).source_id : null);
    if (source.source_id === 'public-registry:opl') {
      const access = value.package_access as Record<string, unknown> | undefined;
      const carrier = value.configured_carrier as Record<string, unknown> | undefined;
      return sourceId === source.source_id || (access?.visibility !== 'authorized_only'
        && value.visibility !== 'authorized_only'
        && typeof carrier?.publication_ref === 'string'
        && /^ghcr\.io\/gaofeng21cn\/one-person-lab-packages\//.test(carrier.publication_ref));
    }
    if (source.provider_id === 'homebrew') return false;
    return sourceId === source.source_id;
  }).length;
  const safeEntries = sources.map(source => {
    // Failed source probes have their own retry delay. They never extend an
    // authorization snapshot or expose hidden Package metadata.
    const recentFailure = source.status !== 'authorized' && source.verified_at !== null
      && Date.now() - Date.parse(source.verified_at) < 60_000;
    const catalogCacheCount = isCatalogProvider(source)
      ? readCatalogSourceCacheStatus(source.source_id, env).package_count
      : null;
    return {
      ...publicSource(source, env),
      access_refresh_required: source.visibility === 'authorized_only' && source.enabled
        && credentialPresent(source) && !recentFailure
        && (input.refreshRequiredSourceIds?.includes(source.source_id) ?? false),
      entry_count: source.provider_id === 'homebrew'
        ? readHomebrewSourceProjection(env).entry_count
        : input.packageEntries === undefined
          ? catalogCacheCount
          : source.provider_id === 'catalog' && catalogCacheCount !== null
            ? catalogCacheCount
            : entryCount(source),
    };
  });
  return {
    surface_kind: 'opl_software_sources_projection.v1', status: safeEntries.some(source => source.enabled && source.credential_handle_present && ['expired', 'forbidden', 'revoked', 'unknown'].includes(source.status)) ? 'attention_required' : 'available',
    entries: safeEntries,
    installed_products: readInstalledSoftwareProducts(env),
    authority_boundary: { owner: 'opl_framework', credential_values_exposed: false, installation_mutation_owner: 'native_carrier', package_installation_owner: 'opl_packages', native_software_installation_owner: 'homebrew' },
  };
}
export function configureOplSoftwareSource(input: SoftwareSourceConfigureInput) {
  assertCredentialHandleOnlyPayload(input);
  const source = readSoftwareSource(input.source_id);
  if (source.visibility !== 'authorized_only') softwareSourceFailure('software_source_public_reconfigure_forbidden', 'Public software sources are managed by Framework and cannot receive credentials.');
  if (input.provider_id && input.provider_id !== source.provider_id) softwareSourceFailure('software_source_provider_mismatch', 'source provider_id does not match the registered source.');
  const handle = input.credential_handle === undefined ? 'provider:github_packages:gh-cli' : input.credential_handle;
  const credentialHandle = normalizeSoftwareSourceCredential(handle);
  const next = { ...source, credential_handle: credentialHandle, enabled: input.enabled ?? true, status: credentialHandle && (input.enabled ?? true) ? 'unknown' as const : 'signed_out' as const, verified_at: null, verification_reason: credentialHandle ? 'configured_requires_check' : 'credential_reference_missing' };
  const stored = writeSoftwareSource(next, source.revision);
  return { software_source: publicSource(stored), next_action: stored.status === 'unknown' ? 'source_check' : 'source_list' };
}
export function disconnectOplSoftwareSource(sourceId: string) {
  const source = readSoftwareSource(sourceId);
  if (source.visibility !== 'authorized_only') softwareSourceFailure('software_source_public_disconnect_forbidden', 'Public software sources cannot be disconnected from the managed catalog.');
  const stored = writeSoftwareSource({ ...source, enabled: true, credential_handle: null, status: 'signed_out', verified_at: null, verification_reason: 'credential_reference_removed' }, source.revision);
  return { software_source: publicSource(stored), local_installations_preserved: true };
}
export function resolvePackageSourceCredentialProvider(sourceRepo?: string | null, publicationRef?: string | null, env: NodeJS.ProcessEnv = process.env) {
  const owner = sourceOwner(sourceRepo, publicationRef);
  if (!owner) return null;
  const source = readSoftwareSource(`github-packages:${owner}`, env);
  return { provider_id: 'github_packages' as const, source_id: source.source_id, enabled: source.enabled, credential_handle: source.credential_handle, revision: source.revision };
}
export function executeOplSoftwareSourceAction(actionId: SoftwareSourceActionId, payload: Record<string, unknown>, deps: SoftwareSourceDependencies = {}) {
  assertCredentialHandleOnlyPayload(payload);
  const allowed = actionId === 'source_list'
    ? []
    : actionId === 'source_configure'
      ? ['source_id', 'provider_id', 'credential_handle', 'enabled']
      : actionId === 'source_add'
        ? ['source_id', 'url', 'display_name']
        : ['source_install', 'source_update', 'source_uninstall'].includes(actionId)
          ? ['source_id', 'item_id', 'expected_revision']
          : ['source_id'];
  if (Object.keys(payload).some(field => !allowed.includes(field))) softwareSourceFailure('software_source_payload_invalid', 'Software source action contains unsupported fields.');
  if (payload.enabled !== undefined && typeof payload.enabled !== 'boolean') softwareSourceFailure('software_source_payload_invalid', 'enabled must be a boolean.');
  if (actionId === 'source_list') {
    if (Object.keys(payload).length) softwareSourceFailure('software_source_payload_invalid', 'source_list accepts an empty payload.');
    return { software_sources: listOplSoftwareSources({}, deps.env) };
  }
  const sourceId = payload.source_id;
  if (typeof sourceId !== 'string' || !sourceId.trim()) softwareSourceFailure('software_source_id_required', 'source_id is required.');
  const trimmedSourceId = sourceId.trim();
  if (actionId === 'source_add') {
    if (typeof payload.url !== 'string' || !payload.url.trim()) {
      softwareSourceFailure('software_source_url_invalid', 'url is required.');
    }
    if (payload.display_name !== undefined && typeof payload.display_name !== 'string') {
      softwareSourceFailure('software_source_payload_invalid', 'display_name must be a string.');
    }
    return addOplSoftwareSource({
      source_id: trimmedSourceId,
      url: payload.url.trim(),
      display_name: payload.display_name,
    }, deps);
  }
  if (actionId === 'source_remove') {
    return removeOplSoftwareSource(trimmedSourceId, deps.env);
  }
  if (actionId === 'source_refresh') {
    const targetSource = readSoftwareSource(trimmedSourceId, deps.env);
    if (isCatalogProvider(targetSource)) {
      return refreshOplCatalogSource(trimmedSourceId, deps);
    }
  }
  if (HOMEBREW_ACTION_IDS.includes(actionId as HomebrewActionId)) return executeHomebrewSourceAction(actionId as HomebrewActionId, { ...payload, source_id: trimmedSourceId }, { env: deps.env, now: deps.now, run: deps.homebrewRun }).then(result => {
    const source = readSoftwareSource(trimmedSourceId, deps.env);
    const verified = writeSoftwareSource({ ...source, status: result.native_inventory.inventory_status === 'available' ? 'public' : 'unknown', verified_at: result.native_inventory.inventory_checked_at, verification_reason: result.native_inventory.inventory_reason ?? 'homebrew_native_inventory_verified' }, source.revision, deps.env);
    return { ...result, software_source: publicSource(verified, deps.env) };
  });
  if (actionId === 'source_check') return checkOplSoftwareSource(trimmedSourceId, deps).then(source => ({ software_source: publicSource(source, deps.env) }));
  if (actionId === 'source_configure') {
    const result = configureOplSoftwareSource({ source_id: trimmedSourceId, provider_id: payload.provider_id as SoftwareSourceProviderId | undefined, credential_handle: payload.credential_handle as string | null | undefined, enabled: payload.enabled === undefined ? undefined : payload.enabled === true });
    if (!result.software_source.credential_handle_present || !result.software_source.enabled) return result;
    return checkOplSoftwareSource(trimmedSourceId, deps).then(source => ({ software_source: publicSource(source, deps.env), next_action: 'source_list' }));
  }
  if (actionId === 'source_disconnect') return disconnectOplSoftwareSource(trimmedSourceId);
  softwareSourceFailure('software_source_action_unknown', `Unknown software source action: ${actionId}.`);
}
export function softwareSourceActionCatalog() { return sourceActionProjection(); }
export type { SoftwareSource, SoftwareSourceStatus } from './software-sources-types.ts';
