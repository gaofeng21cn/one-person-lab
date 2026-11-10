import { readSoftwareSource, readSoftwareSources, softwareSourceFailure, writeSoftwareSource } from './software-sources-store.ts';
import { assertCredentialHandleOnlyPayload } from './connection-registry-parts/credential-handle.ts';
import { normalizeSoftwareSourceCredential } from './software-sources-store.ts';
import { verifySoftwareSourceCredential } from './software-sources-verification.ts';
import { executeHomebrewSourceAction, HOMEBREW_ACTION_IDS, homebrewActionCatalog, readHomebrewSourceProjection, refreshHomebrewSource, type HomebrewActionId } from './homebrew-source.ts';
import type {
  SoftwareSource, SoftwareSourceConfigureInput, SoftwareSourceDependencies,
  SoftwareSourceProviderId,
} from './software-sources-types.ts';

export type SoftwareSourceActionId = 'source_list' | 'source_check' | 'source_configure' | 'source_disconnect' | HomebrewActionId;
export const SOFTWARE_SOURCE_ACTION_IDS: readonly SoftwareSourceActionId[] = [
  'source_list', 'source_check', 'source_configure', 'source_disconnect',
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
] as const;

function sourceActionProjection() {
  return [...SOURCE_ACTIONS.map(action => ({ ...action })), ...homebrewActionCatalog()];
}
function credentialPresent(source: SoftwareSource) {
  return Boolean(source.credential_handle);
}
function publicSource(source: SoftwareSource) {
  const { credential_handle: _credential, ...safe } = source;
  const inventory = source.provider_id === 'homebrew' ? readHomebrewSourceProjection() : null;
  const sourceActions = ['source_list', 'source_check', ...(source.visibility === 'authorized_only' ? ['source_configure', 'source_disconnect'] : []),
    ...(inventory?.inventory_status === 'available' ? ['source_refresh'] : inventory?.inventory_reason === 'homebrew_tap_not_connected' ? ['source_setup'] : [])];
  return { ...safe, ...(inventory ?? {}), credential_handle_present: credentialPresent(source), available_actions: sourceActionProjection().filter(action => sourceActions.includes(action.action_id)) };
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
export async function checkOplSoftwareSource(sourceId: string, deps: SoftwareSourceDependencies = {}) {
  const source = readSoftwareSource(sourceId);
  if (source.provider_id === 'homebrew') {
    const inventory = await refreshHomebrewSource({ env: deps.env, now: deps.now, run: deps.homebrewRun });
    return writeSoftwareSource({ ...source, status: inventory.inventory_status === 'available' ? 'public' : 'unknown', verified_at: nowIso(deps), verification_reason: inventory.inventory_reason ?? 'homebrew_native_inventory_verified' }, source.revision);
  }
  const credentialReader = deps.verify ? undefined : (deps.credentialReader
    ?? (await import('./agent-package-registry-parts/package-registry-access-provider.ts')).credentialForGithubPackages);
  const result = deps.verify ? await deps.verify(source) : await verifySoftwareSourceCredential(source, deps.env ?? process.env, {
    credentialReader,
  });
  const verified = { ...source, status: result.status, verified_at: nowIso(deps), verification_reason: result.verification_reason };
  const stored = writeSoftwareSource(verified, source.revision);
  if (stored.visibility === 'authorized_only' && stored.status === 'authorized') {
    const refresh = deps.refreshPackageAccess
      ?? (await import('./agent-package-registry-parts/package-access.ts')).refreshGithubPackageSourceAccess;
    await refresh(stored.source_id, deps.env ?? process.env);
  }
  return stored;
}
export function listOplSoftwareSources(input: { packageEntries?: readonly unknown[] } = {}) {
  const sources = readSoftwareSources();
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
  const safeEntries = sources.map(source => ({ ...publicSource(source), entry_count: source.provider_id === 'homebrew' ? readHomebrewSourceProjection().entry_count : input.packageEntries === undefined ? null : entryCount(source) }));
  return {
    surface_kind: 'opl_software_sources_projection.v1', status: safeEntries.some(source => source.enabled && source.credential_handle_present && ['expired', 'forbidden', 'revoked', 'unknown'].includes(source.status)) ? 'attention_required' : 'available',
    entries: safeEntries,
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
  const allowed = actionId === 'source_list' ? [] : actionId === 'source_configure' ? ['source_id', 'provider_id', 'credential_handle', 'enabled'] : ['source_install', 'source_update', 'source_uninstall'].includes(actionId) ? ['source_id', 'item_id', 'expected_revision'] : ['source_id'];
  if (Object.keys(payload).some(field => !allowed.includes(field))) softwareSourceFailure('software_source_payload_invalid', 'Software source action contains unsupported fields.');
  if (payload.enabled !== undefined && typeof payload.enabled !== 'boolean') softwareSourceFailure('software_source_payload_invalid', 'enabled must be a boolean.');
  if (actionId === 'source_list') {
    if (Object.keys(payload).length) softwareSourceFailure('software_source_payload_invalid', 'source_list accepts an empty payload.');
    return { software_sources: listOplSoftwareSources() };
  }
  const sourceId = payload.source_id;
  if (typeof sourceId !== 'string' || !sourceId.trim()) softwareSourceFailure('software_source_id_required', 'source_id is required.');
  if (HOMEBREW_ACTION_IDS.includes(actionId as HomebrewActionId)) return executeHomebrewSourceAction(actionId as HomebrewActionId, { ...payload, source_id: sourceId.trim() }, { env: deps.env, now: deps.now, run: deps.homebrewRun }).then(result => {
    const source = readSoftwareSource(sourceId.trim());
    const verified = writeSoftwareSource({ ...source, status: result.native_inventory.inventory_status === 'available' ? 'public' : 'unknown', verified_at: result.native_inventory.inventory_checked_at, verification_reason: result.native_inventory.inventory_reason ?? 'homebrew_native_inventory_verified' }, source.revision);
    return { ...result, software_source: publicSource(verified) };
  });
  if (actionId === 'source_check') return checkOplSoftwareSource(sourceId.trim(), deps).then(source => ({ software_source: publicSource(source) }));
  if (actionId === 'source_configure') {
    const result = configureOplSoftwareSource({ source_id: sourceId.trim(), provider_id: payload.provider_id as SoftwareSourceProviderId | undefined, credential_handle: payload.credential_handle as string | null | undefined, enabled: payload.enabled === undefined ? undefined : payload.enabled === true });
    if (!result.software_source.credential_handle_present || !result.software_source.enabled) return result;
    return checkOplSoftwareSource(sourceId.trim(), deps).then(source => ({ software_source: publicSource(source), next_action: 'source_list' }));
  }
  if (actionId === 'source_disconnect') return disconnectOplSoftwareSource(sourceId.trim());
  softwareSourceFailure('software_source_action_unknown', `Unknown software source action: ${actionId}.`);
}
export function softwareSourceActionCatalog() { return sourceActionProjection(); }
export type { SoftwareSource, SoftwareSourceStatus } from './software-sources-types.ts';
