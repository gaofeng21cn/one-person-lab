import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { valid, gt } from 'semver';
import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import type { InstalledPackageDescriptor } from './installed-codex-plugin-directory-types.ts';
import type { SoftwareInstallation } from './package-installation-projection.ts';

const ACTION_ID = 'software_installation_execute';
const OPERATIONS = ['activate', 'unlink', 'uninstall', 'update'] as const;
function text(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function real(value: string) { try { return fs.realpathSync(value); } catch { return null; } }
function entrypoint(descriptor: InstalledPackageDescriptor) {
  return descriptor.manifest.entrypoints.find(entry => (entry.entrypoint_kind ?? entry.kind) === 'opl_software_installation_cli'
    && entry.protocol === 'opl_software_installation.v1' && ['python3', 'node'].includes(String(entry.runtime)));
}
export function supplementalInstallationOwner(descriptor: InstalledPackageDescriptor) {
  return entrypoint(descriptor)?.installation_scope === 'supplemental_payload';
}
function profileActions(descriptor: InstalledPackageDescriptor, readback: Record<string, unknown> | null) {
  const entry = entrypoint(descriptor);
  if (!supplementalInstallationOwner(descriptor) || !Array.isArray(entry?.installation_profiles)) return [];
  const version = isRecord(entry.release_target) ? text(entry.release_target.version) : null;
  if (!version || !valid(version)) return [];
  const installed = Array.isArray(readback?.installed_profiles) ? readback.installed_profiles : [];
  return entry.installation_profiles.filter(isRecord).flatMap(profile => {
    if (!text(profile.id) || !/^[a-z][a-z0-9_-]*$/.test(String(profile.id)) || installed.includes(profile.id)) return [];
    return [{ action_id: ACTION_ID, label: text(profile.label) ?? `Install ${profile.id}`,
      label_i18n: isRecord(profile.label_i18n) ? profile.label_i18n : null,
      semantic: 'install', status: 'available', confirmation_required: true, dry_run_supported: false,
      required_payload_fields: ['package_id', 'expected_revision', 'operation', 'version', 'profile'],
      payload: { package_id: descriptor.manifest.package_id, operation: 'install', version, profile: profile.id,
        expected_revision: createHash('sha256').update(JSON.stringify({ manifest: descriptor.manifest_sha256,
          profile, version, installations: readback?.installations ?? [] })).digest('hex') } }];
  });
}
function helper(descriptor: InstalledPackageDescriptor) {
  const entry = entrypoint(descriptor);
  const ref = text(entry?.source_ref);
  const root = real(descriptor.sourcePath);
  if (!entry || !ref || !root || path.isAbsolute(ref) || ref.split(/[\\/]/).includes('..')
    || !descriptor.manifest.content_lock_paths?.includes(ref)) return null;
  const file = real(path.join(root, ref));
  return file?.startsWith(`${root}${path.sep}`) ? { file, runtime: String(entry.runtime) } : null;
}
function invoke(descriptor: InstalledPackageDescriptor, payload: Record<string, unknown>, env: NodeJS.ProcessEnv, mutation = false) {
  const selected = helper(descriptor);
  if (!selected) return null;
  const result: unknown = JSON.parse(execFileSync(selected.runtime, [selected.file, '--stdin'], {
    input: JSON.stringify({ ...payload, package_id: descriptor.manifest.package_id }), encoding: 'utf8', env,
    timeout: mutation ? 600_000 : 3_000, maxBuffer: 512 * 1024, stdio: ['pipe', 'pipe', 'pipe'],
  }));
  if (!isRecord(result) || result.package_id !== descriptor.manifest.package_id || !Array.isArray(result.installations)) return null;
  return result;
}
export function softwareInstallationOperation(packageId: string, row: SoftwareInstallation, operation: string, version?: string) {
  return { action_id: ACTION_ID, label: operation, semantic: operation, status: 'available',
    required_payload_fields: ['package_id', 'installation_id', 'expected_revision', 'operation', ...(version ? ['version'] : [])],
    confirmation_required: true, dry_run_supported: false,
    payload: { package_id: packageId, installation_id: row.installation_id, expected_revision: row.revision, operation, ...(version ? { version } : {}) } };
}

/** Older installed carriers can be discovered from a typed owner declaration without executing newer source. */
function staticBundles(descriptor: InstalledPackageDescriptor, env: NodeJS.ProcessEnv): SoftwareInstallation[] {
  const discovery = entrypoint(descriptor)?.discovery;
  if (!isRecord(discovery) || discovery.kind !== 'macos_bundle' || !text(discovery.bundle_id)
    || !Array.isArray(discovery.bundle_names) || !text(discovery.executable)) return [];
  const home = env.HOME?.trim() || os.homedir();
  const names = discovery.bundle_names.filter((name): name is string => typeof name === 'string' && /^[^/\\]+\.app$/.test(name));
  return [path.join(home, 'Applications'), '/Applications'].flatMap(base => names.flatMap(name => {
    const location = real(path.join(base, name));
    if (!location) return [];
    try {
      const info = JSON.parse(execFileSync(env.OPL_PLUTIL_BIN?.trim() || 'plutil', ['-convert', 'json', '-o', '-', '--', path.join(location, 'Contents/Info.plist')], { encoding: 'utf8', timeout: 1_000, stdio: ['ignore', 'pipe', 'ignore'] }));
      if (info.CFBundleIdentifier !== discovery.bundle_id || !text(info.CFBundleShortVersionString)
        || !fs.existsSync(path.join(location, 'Contents/MacOS', String(discovery.executable)))) return [];
      const revision = createHash('sha256').update(JSON.stringify({ location, info })).digest('hex');
      return [{ installation_id: `local:${createHash('sha256').update(location).digest('hex').slice(0, 24)}`,
        kind: 'macos_bundle', version: info.CFBundleShortVersionString, mode: 'installed' as const,
        manager: 'package_owner', location, location_ref: location, evidence_ref: path.join(location, 'Contents/Info.plist'),
        active: false, entrypoint_verified: true, revision, available_actions: [], owner_settings_route: 'applications' }];
    } catch { return []; }
  }));
}

export function readSoftwareInstallationOwner(descriptor: InstalledPackageDescriptor, owner = descriptor, env: NodeJS.ProcessEnv = process.env) {
  if (!entrypoint(owner)) return null;
  let readback: Record<string, unknown> | null = null;
  try { readback = invoke(descriptor, { operation: 'inspect' }, env); } catch { /* Missing helper on an older carrier is a specific management gap. */ }
  if (!readback) return { installations: staticBundles(owner, env), active_installation_id: null,
    active_installation_status: 'unknown' as const, installation_actions: profileActions(owner, null), management_reason: 'installation_helper_update_required' };
  const release = entrypoint(owner)?.release_target;
  const availableVersion = isRecord(release) ? text(release.version) : null;
  const installations: SoftwareInstallation[] = (readback.installations as unknown[]).filter(isRecord).flatMap(raw => {
    if (!text(raw.installation_id) || !text(raw.version) || !text(raw.location) || !path.isAbsolute(String(raw.location))
      || !text(raw.revision) || !['release', 'development'].includes(String(raw.mode))) return [];
    const row: SoftwareInstallation = {
      installation_id: String(raw.installation_id), kind: text(raw.kind) ?? (raw.mode === 'development' ? 'developer_checkout' : 'macos_bundle'),
      version: String(raw.version), mode: raw.mode === 'development' ? 'development' : 'installed', manager: 'package_owner',
      location: String(raw.location), location_ref: String(raw.location), evidence_ref: `owner:${descriptor.manifest.package_id}:installation-inspect`,
      active: raw.active === true, entrypoint_verified: true, revision: String(raw.revision),
      available_version: raw.mode === 'release' ? availableVersion : null, available_actions: [],
      ...(text(raw.profile) ? { profile: String(raw.profile) } : {}),
    };
    row.available_actions = Array.isArray(raw.supported_actions) ? raw.supported_actions.filter((op): op is string =>
      typeof op === 'string' && OPERATIONS.includes(op as typeof OPERATIONS[number])
      && !(row.mode === 'development' && ['update', 'uninstall'].includes(op))
      && !(op === 'activate' && row.active)
      && !(op === 'update' && (!availableVersion || !valid(availableVersion) || !valid(row.version) || !gt(availableVersion, row.version))))
      .map(op => ({ ...softwareInstallationOperation(descriptor.manifest.package_id, row, op, op === 'update' ? availableVersion! : undefined),
        ...(text(raw.profile) ? { payload: { ...(softwareInstallationOperation(descriptor.manifest.package_id, row, op, op === 'update' ? availableVersion! : undefined).payload), profile: String(raw.profile) } } : {}) })) : [];
    return [row];
  });
  const active = installations.filter(row => row.active);
  const status = readback.active_installation_status === 'conflict' || active.length > 1 ? 'conflict' as const
    : readback.active_installation_status === 'unknown' ? 'unknown' as const : active.length === 1 ? 'active' as const : 'inactive' as const;
  const operations = entrypoint(descriptor)?.operations;
  const installable = Array.isArray(operations) && operations.includes('install') && availableVersion && valid(availableVersion)
    && !installations.some(row => row.mode === 'installed');
  const installationActions: Record<string, unknown>[] = supplementalInstallationOwner(owner) ? profileActions(owner, readback) : installable ? [{
    action_id: ACTION_ID, label: 'Install release', semantic: 'install', status: 'available',
    required_payload_fields: ['package_id', 'expected_revision', 'operation', 'version'],
    confirmation_required: true, dry_run_supported: false,
    payload: { package_id: descriptor.manifest.package_id, operation: 'install', version: availableVersion,
      expected_revision: createHash('sha256').update(JSON.stringify({ manifest: descriptor.manifest_sha256, installations, availableVersion })).digest('hex') },
  }] : [];
  return { installations, active_installation_id: status === 'active' ? active[0].installation_id : null,
    active_installation_status: status, installation_actions: installationActions,
    management_reason: null };
}

export function executeSoftwareInstallationOwner(descriptor: InstalledPackageDescriptor, payload: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env) {
  if (Object.keys(payload).some(key => !['package_id', 'installation_id', 'expected_revision', 'operation', 'version', 'profile'].includes(key)))
    throw new FrameworkContractError('cli_usage_error', 'Unsupported installation fields.');
  const projection = readSoftwareInstallationOwner(descriptor, descriptor, env);
  const row = projection?.installations.find(item => item.installation_id === payload.installation_id);
  const candidates = payload.operation === 'install' && payload.installation_id === undefined
    ? projection?.installation_actions : row?.available_actions;
  const candidate = candidates?.find(item => isRecord(item.payload) && item.payload.operation === payload.operation
    && item.payload.expected_revision === payload.expected_revision && item.payload.version === payload.version
    && item.payload.profile === payload.profile);
  if (payload.package_id !== descriptor.manifest.package_id || !candidate)
    throw new FrameworkContractError('cli_usage_error', 'Refresh this installation before changing it.', { reason_code: 'software_installation_stale_or_unavailable' });
  const request = payload.operation === 'install' ? { operation: 'install', version: payload.version,
    ...(payload.profile ? { profile: payload.profile } : {}) } : payload;
  const result = invoke(descriptor, request, env, true);
  if (!result) throw new FrameworkContractError('contract_shape_invalid', 'Installation owner did not return verifiable readback.');
  return result;
}
