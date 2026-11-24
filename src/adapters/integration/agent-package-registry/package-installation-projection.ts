import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { valid, gt } from 'semver';
import type { InstalledPackageDescriptor } from './installed-codex-plugin-directory-types.ts';
import { readPackageInstallationReadback } from './package-installation-readback.ts';
import { resolveAgentPackageEffectiveSourcePolicy } from './source-policy.ts';
import { readSoftwareInstallationOwner, softwareInstallationOperation, supplementalInstallationOwner } from './software-installation-owner.ts';
import { getOplPackageSpecs } from '../package-distribution.ts';
import { readOplDeveloperSupervisorConfig } from '../../../kernel/system-preferences.ts';
import { resolveOplInstallUpdateSourcePolicy } from '../system-installation/modules.ts';

function real(value: string) { try { return fs.realpathSync(value); } catch { return null; } }
function versionAt(root: string, packageId: string) {
  const spec = getOplPackageSpecs().find(entry => entry.package_id === packageId);
  const files = [spec?.owner_package_manifest_ref, 'opl-package.json'].filter((file): file is string => Boolean(file));
  for (const file of files) {
    try {
      const value = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      if (value.package_id === packageId && typeof value.version === 'string') return value.version;
    } catch { /* Try the declared owner descriptor. */ }
  }
  return null;
}
export type SoftwareInstallation = {
  installation_id: string; kind: string; version: string; mode: 'installed' | 'development';
  manager: string; location: string; location_ref: string; evidence_ref: string;
  entrypoint_verified: boolean; active: boolean; revision: string;
  available_version?: string | null; owner_settings_route?: string;
  profile?: string;
  available_actions: Record<string, unknown>[];
};

/** The carrier and runtime owner select code; this read model only reports that choice. */
export function packageInstallationProjection(descriptor: InstalledPackageDescriptor, installed: boolean,
  availableVersion: string | null, env: NodeJS.ProcessEnv = process.env, owner = descriptor,
  hostedSourceRoot: string | null = null) {
  const local = readPackageInstallationReadback(descriptor.manifest.package_id, env);
  const native = readSoftwareInstallationOwner(descriptor, owner, env);
  const supplemental = supplementalInstallationOwner(owner);
  const installations: SoftwareInstallation[] = local.map(item => ({ ...item,
    revision: createHash('sha256').update(JSON.stringify(item)).digest('hex'),
    available_actions: [],
  }));
  for (const row of installations) {
    if (row.manager === 'uv') row.available_actions.push(softwareInstallationOperation(descriptor.manifest.package_id, row,
      row.mode === 'development' ? 'unlink' : 'uninstall'));
  }
  if (native) installations.push(...native.installations);
  const location = real(descriptor.sourcePath);
  const source = resolveAgentPackageEffectiveSourcePolicy(descriptor.manifest.package_id, { profile: 'fast' });
  const spec = getOplPackageSpecs().find(entry => entry.package_id === descriptor.manifest.package_id);
  const preference = source.module_id ? readOplDeveloperSupervisorConfig().module_source_preferences?.[source.module_id] : undefined;
  const hostedRefs = descriptor.manifest.package_role === 'standard_agent'
    ? descriptor.manifest.entrypoints.filter(entry => entry.entrypoint_kind === 'opl_hosted_action_catalog')
      .map(entry => String(entry.source_ref ?? '')) : [];
  const validHostedRoot = (root: string | null) => root && hostedRefs.length > 0
    && ['contracts/domain_descriptor.json', ...hostedRefs].every(ref => {
      const resolved = real(path.join(root, ref));
      return ref && resolved?.startsWith(root + path.sep) && fs.statSync(resolved).isFile();
    });
  const explicitlyRegistered = source.configured_by === 'developer_mode' || source.configured_by === 'developer_mode_package_override'
    || preference === 'developer' || preference === 'managed';
  const developerRoot = spec && explicitlyRegistered
    ? real(resolveOplInstallUpdateSourcePolicy(spec, { profile: 'fast' }).developer_checkout_path) : null;
  const developerPath = validHostedRoot(developerRoot) && developerRoot !== location ? developerRoot : null;
  const developerActive = developerPath !== null && hostedSourceRoot !== null && real(hostedSourceRoot) === developerPath;
  const canSelect = developerPath && validHostedRoot(location) && !['module_path_override', 'env_source_mode', 'module_repo_url_override', 'full_runtime_override'].includes(source.configured_by);
  if (installed && location && (!native || supplemental)) {
    const registeredLocal = descriptor.marketplaceSource && path.isAbsolute(descriptor.marketplaceSource)
      ? real(descriptor.marketplaceSource) : null;
    const localCheckout = registeredLocal && fs.existsSync(path.join(registeredLocal, '.git'))
      && (location === registeredLocal || location.startsWith(`${registeredLocal}${path.sep}`));
    const row: SoftwareInstallation = {
      installation_id: `carrier:${descriptor.pluginId}`, kind: 'codex_plugin', version: descriptor.manifest.version,
      mode: localCheckout ? 'development' : 'installed', manager: 'codex_plugin_manager',
      location, location_ref: descriptor.carrier_readback.source_ref, evidence_ref: descriptor.manifestPath,
      active: !developerActive && local.length === 0, entrypoint_verified: true,
      revision: createHash('sha256').update(JSON.stringify({ manifest: descriptor.manifest_sha256, location,
        hostedSourceRoot, enabled: descriptor.enabled })).digest('hex'), available_version: availableVersion, available_actions: [],
    };
    const operation = localCheckout ? 'unlink' : 'uninstall';
    row.available_actions.push(softwareInstallationOperation(descriptor.manifest.package_id, row, operation));
    if (canSelect && !row.active) row.available_actions.push(softwareInstallationOperation(descriptor.manifest.package_id, row, 'activate'));
    if (!localCheckout && availableVersion && valid(availableVersion) && valid(row.version) && gt(availableVersion, row.version))
      row.available_actions.push(softwareInstallationOperation(descriptor.manifest.package_id, row, 'update', availableVersion));
    installations.push(row);
  }
  const developerVersion = developerPath ? versionAt(developerPath, descriptor.manifest.package_id) : null;
  if (developerPath) {
    const version = developerVersion;
    if (version) {
      const row: SoftwareInstallation = {
      installation_id: `developer:${createHash('sha256').update(developerPath).digest('hex').slice(0, 24)}`,
      kind: 'developer_checkout', version, mode: 'development', manager: 'opl_framework',
      location: developerPath, location_ref: developerPath, evidence_ref: source.configured_by,
      active: developerActive, entrypoint_verified: true, revision: createHash('sha256').update(`${developerPath}:${version}:${hostedSourceRoot}`).digest('hex'),
      available_actions: [],
      };
      if (canSelect && !row.active) row.available_actions.push(softwareInstallationOperation(descriptor.manifest.package_id, row, 'activate'));
      installations.push(row);
    }
  }
  const active = installations.filter(item => item.active);
  const status = (!supplemental && native?.active_installation_status === 'unknown') || developerPath && !developerVersion ? 'unknown' as const
    : (!supplemental && native?.active_installation_status === 'conflict') || active.length > 1 ? 'conflict' as const
    : active.length === 1 ? 'active' as const : installed && !location ? 'unknown' as const : 'inactive' as const;
  return { local_installations: local, installations,
    ...(native ? { installation_management_reason: native.management_reason, installation_actions: native.installation_actions } : {}),
    active_installation_id: status === 'active' ? active[0].installation_id : null,
    active_installation_status: status };
}
