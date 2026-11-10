import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isRecord } from '../../kernel/contract-validation.ts';
import brandProfile from '../../../contracts/opl-framework/brand-system-profile.json' with { type: 'json' };

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
    };
  }
  return null;
}

/** Installed products remain visible independently of optional distribution sources. */
export function readInstalledSoftwareProducts(env: NodeJS.ProcessEnv = process.env) {
  const installation = readFrameworkSoftwareInstallation(env);
  if (!installation) return [];
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
    available_version: null,
    update_status: 'unknown' as const,
    available_actions: [],
  }];
}
