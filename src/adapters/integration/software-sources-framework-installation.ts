import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { gt, valid } from 'semver';
import brandProfile from '../../../contracts/opl-framework/brand-system-profile.json' with { type: 'json' };
import { readFrameworkSoftwareRelease, refreshFrameworkSoftwareRelease } from './software-sources-framework-release.ts';
import { acquireManagedUpdateLock } from './managed-update-lock.ts';
import { runOplFrameworkSelfUpdate } from './system-installation/framework-self-update.ts';
import { isGitRepo, isOplFrameworkRoot, readManagedFrameworkGitInstallation } from './system-installation/framework-self-update-parts/source-resolution.ts';
import { pendingFrameworkArtifactResult } from './system-installation/framework-self-update-parts/staging.ts';
import { softwareInstallationOperation } from './agent-package-registry-parts/software-installation-owner.ts';
import type { SoftwareInstallation } from './agent-package-registry-parts/package-installation-projection.ts';

function record(file: string) {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    return isRecord(value) ? value : null;
  } catch { return null; }
}
function real(file: string) {
  try { return fs.realpathSync(file); } catch { return null; }
}

/** Read existing installation evidence, never the checkout executing this query. */
export function readFrameworkSoftwareInstallation(env: NodeJS.ProcessEnv = process.env) {
  const userHome = env.HOME?.trim() || os.homedir();
  const installedCommand = real(path.join(userHome, '.local', 'bin', 'opl'));
  const linkedRoot = installedCommand ? path.dirname(path.dirname(installedCommand)) : null;
  const candidates = [...new Set([
    linkedRoot,
    path.join(userHome, '.opl', 'one-person-lab'),
    env.OPL_FULL_RUNTIME_HOME?.trim() ? path.join(env.OPL_FULL_RUNTIME_HOME.trim(), 'opl') : null,
  ].filter((root): root is string => Boolean(root)))];
  for (const root of candidates) {
    const manifest = record(path.join(root, 'package.json'));
    const command = real(path.join(root, 'bin', 'opl'));
    if (manifest?.name !== 'opl-framework' || typeof manifest.version !== 'string' || !manifest.version.trim() || !command) continue;
    const linked = command === installedCommand;
    const fullRuntime = env.OPL_FULL_RUNTIME_HOME?.trim();
    const fullRuntimeRoot = fullRuntime ? real(path.join(fullRuntime, 'opl')) : null;
    const bundled = fullRuntimeRoot !== null && fullRuntimeRoot === real(root)
      && [ '.opl-full-runtime-installed.json', '.opl-studio-full-runtime-installed.json' ].some(name => {
        const marker = record(path.join(fullRuntime!, name));
        return typeof marker?.manifest_sha256 === 'string' && /^[0-9a-f]{64}$/.test(marker.manifest_sha256);
      });
    // A marker copied into a worktree is not an installed carrier. Require the
    // actual installed command, or the activated App runtime and its marker.
    if (!linked && !bundled) continue;
    const updated = record(path.join(root, '.opl-framework-source.json'));
    const boundary = isRecord(updated?.authority_boundary) ? updated.authority_boundary : {};
    const updatedRevision = updated?.surface_kind === 'opl_framework_runtime_source' && boundary.owner === 'one-person-lab'
      && typeof updated.source_head_sha === 'string' && /^[0-9a-f]{40}$/.test(updated.source_head_sha)
      ? updated.source_head_sha : null;
    const identity = record(path.join(root, '.opl-framework-installed-source-identity.json'));
    const installedIdentity = identity?.schema === 'opl_framework_installed_source_identity.v1'
      && typeof identity.framework_sha === 'string' && /^[0-9a-f]{40}$/.test(identity.framework_sha)
      && ['archive', 'git'].includes(String(identity.install_mode))
      && ['explicit_source_commit', 'install_ref', 'source_archive_url', 'github_commit_api', 'git_head'].includes(String(identity.identity_source))
      ? identity : null;
    if (!updatedRevision && !installedIdentity && !bundled) continue;
    return {
      installed: true as const,
      installed_version: manifest.version.trim(),
      installation_owner: 'opl_framework' as const,
      installation_kind: 'managed_runtime' as const,
      installation_evidence: updatedRevision ? 'framework_update_receipt' : installedIdentity ? 'framework_install_receipt' : 'app_runtime_marker',
      installed_source_revision: updatedRevision ?? (typeof installedIdentity?.framework_sha === 'string' ? installedIdentity.framework_sha : null),
      owner_settings_route: 'updates' as const,
      location: real(root),
      installation_id: `local:${createHash('sha256').update(real(root)!).digest('hex').slice(0, 24)}`,
      active: true,
      mode: 'installed' as const,
    };
  }
  return null;
}

/** Installed products remain visible independently of optional distribution sources. */
export function readInstalledSoftwareProducts(env: NodeJS.ProcessEnv = process.env) {
  const installation = readFrameworkSoftwareInstallation(env);
  if (!installation) return [];
  const update = frameworkInstallationUpdate(installation, env);
  const product = brandProfile.product_cognition_layers.find(layer => layer.layer_id === 'opl_framework')!;
  const description = 'description_i18n' in product ? product.description_i18n : undefined;
  return [{
    ...installation,
    catalog_origin: 'opl' as const,
    origin_basis: 'owner_manifest' as const,
    catalog_source: { manager: 'opl_framework', delivery: 'local' as const },
    product_id: `github:gaofeng21cn/${product.owner}`,
    product_display_name: product.product_name,
    item_id: 'managed:opl-framework',
    name: 'opl-framework',
    display_name: product.product_name,
    description: description?.['en-US'] ?? null,
    ...(description ? { description_i18n: description } : {}),
    kind: 'managed_runtime' as const,
    ...update,
  }];
}

function frameworkInstallationUpdate(installation: NonNullable<ReturnType<typeof readFrameworkSoftwareInstallation>>, env: NodeJS.ProcessEnv) {
  const release = readFrameworkSoftwareRelease(env).entry;
  const location = installation.location!;
  const pending = record(`${location}.pending.json`);
  const pendingVersion = pending?.surface_kind === 'opl_framework_pending_generation.v1'
    && pending.target_root === location && pending.pending_root === `${location}.pending`
    && isOplFrameworkRoot(`${location}.pending`)
    ? record(path.join(`${location}.pending`, 'package.json'))?.version : null;
  const managedGit = readManagedFrameworkGitInstallation(location, env);
  const managed = !isGitRepo(location) || managedGit !== null;
  const updateStatus = pendingVersion ? 'needs_restart' as const
    : release && valid(installation.installed_version)
      ? gt(release.channel_version, installation.installed_version) ? 'available' as const : 'current' as const
      : 'unknown' as const;
  const revision = createHash('sha256').update(JSON.stringify({ installation, release, pending, managedGit })).digest('hex');
  const row: SoftwareInstallation = {
    installation_id: installation.installation_id, kind: installation.installation_kind,
    manager: installation.installation_owner, location, location_ref: location,
    evidence_ref: installation.installation_evidence, version: installation.installed_version,
    mode: managed ? 'installed' : 'development', active: true, entrypoint_verified: true,
    revision, available_version: release?.channel_version ?? null, available_actions: [],
  };
  if (managed && (!managedGit || (managedGit.clean && managedGit.source_current)) && updateStatus === 'available')
    row.available_actions.push(softwareInstallationOperation('opl-framework', row, 'update', release!.channel_version));
  return {
    revision, available_version: release?.channel_version ?? null, update_status: updateStatus,
    pending_version: typeof pendingVersion === 'string' ? pendingVersion : null,
    available_actions: row.available_actions, installations: [row],
    active_installation_id: row.installation_id, active_installation_status: 'active' as const,
  };
}

/** The selected Framework installation uses its existing updater, lock and restart activation. */
export function executeFrameworkSoftwareInstallation(payload: Record<string, unknown>) {
  if (Object.keys(payload).some(key => !['package_id', 'installation_id', 'expected_revision', 'operation', 'version'].includes(key))
    || payload.package_id !== 'opl-framework' || payload.operation !== 'update') {
    throw new FrameworkContractError('cli_usage_error', 'Unsupported Framework installation operation.');
  }
  const lock = acquireManagedUpdateLock({ operation: 'apply', componentId: 'opl_framework' });
  try {
    const release = refreshFrameworkSoftwareRelease();
    const product = readInstalledSoftwareProducts()[0];
    const row = product?.installations.find(item => item.installation_id === payload.installation_id);
    const action = row?.available_actions.find(item => isRecord(item.payload)
      && item.payload.expected_revision === payload.expected_revision && item.payload.version === payload.version);
    if (!release || !row || !action) throw new FrameworkContractError('cli_usage_error', 'Refresh this Framework installation before updating it.', { reason_code: 'software_installation_stale_or_unavailable' });
    const result = runOplFrameworkSelfUpdate({ targetRoot: row.location, channelEntry: release,
      sourceRoot: '', sourceArchive: '', allowChannelArtifact: true, stageOnly: true });
    if (result.status === 'manual_required' || !pendingFrameworkArtifactResult(row.location, {
      sourceHeadSha: release.source_git_head_sha, sourceArchiveSha256: release.source_archive_sha256,
    }) || record(path.join(`${row.location}.pending`, 'package.json'))?.version !== payload.version) {
      throw new FrameworkContractError('contract_shape_invalid', 'The Framework updater did not confirm the requested pending version.', { reason: result.reason });
    }
    return { status: 'needs_restart', package_id: 'opl-framework', version: payload.version,
      installation_id: row.installation_id, result, installations: readInstalledSoftwareProducts()[0]?.installations ?? [] };
  } finally { lock.release(); }
}
