import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '../../../kernel/contract-validation.ts';
import { resolvePackagesRootForManifest } from '../../../kernel/standard-agent-registry.ts';
import type { InstalledPackageDescriptor } from './installed-codex-plugin-directory-types.ts';

/** Artwork uses the existing payload's immutable provenance, never a second asset catalog. */
export function packageArtworkUrl(
  descriptor: InstalledPackageDescriptor,
  options?: { authorizedSourcePath?: string | null },
): string | null {
  const { manifest } = descriptor;
  const icon = manifest.presentation?.icon_ref;
  const commit = manifest.carrier_source_commit;
  const payloadRef = manifest.plugin_payload_manifest_url;
  if (manifest.visibility === 'authorized_only' || !icon || !commit || !/^[0-9a-f]{40}$/.test(commit)
    || !payloadRef || !/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+\.(?:svg|png|webp)$/.test(icon)) return null;
  try {
    const repo = new URL(manifest.source_repo ?? '');
    if (repo.protocol !== 'https:' || repo.host !== 'github.com' || repo.username || repo.password
      || repo.search || repo.hash || !/^\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo.pathname)) return null;
    const root = resolvePackagesRootForManifest(descriptor.manifestPath);
    const payloadPath = path.resolve(root, payloadRef);
    if (!payloadPath.startsWith(`${root}${path.sep}`)) return null;
    const payload: unknown = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    if (!isRecord(payload) || payload.package_id !== manifest.package_id || payload.package_version !== manifest.version
      || payload.source_commit !== commit || !Array.isArray(payload.files)) return null;
    const sourceRoot = payload.source_root === '.' ? '' : payload.source_root;
    if (typeof sourceRoot !== 'string' || sourceRoot.split('/').some(part => part === '..' || part === '.')) return null;
    const file = payload.files.find(file => isRecord(file) && file.path === icon);
    if (!isRecord(file) || !/^sha256:[0-9a-f]{64}$/.test(String(file.sha256)) || typeof file.source_url !== 'string') return null;
    const repoPrefix = `https://raw.githubusercontent.com${repo.pathname.replace(/\.git$/, '')}/${commit}/`;
    if (!file.source_url.startsWith(repoPrefix)) return null;
    const sourceRelPath = file.source_url.slice(repoPrefix.length);
    if (!/^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._/-]+\.(?:svg|png|webp)$/.test(sourceRelPath)) return null;
    if (options && options.authorizedSourcePath !== undefined) {
      return typeof options.authorizedSourcePath === 'string' && sourceRelPath === options.authorizedSourcePath
        ? file.source_url
        : null;
    }
    const expectedCarrierPath = `${sourceRoot ? `${sourceRoot}/` : ''}${icon}`;
    if (sourceRelPath === expectedCarrierPath || sourceRelPath === icon) return file.source_url;
    const matchesAliasedEntry = payload.files.some(other => isRecord(other)
      && other.sha256 === file.sha256
      && other.source_url === file.source_url
      && (other.path === sourceRelPath || `${sourceRoot ? `${sourceRoot}/` : ''}${String(other.path)}` === sourceRelPath));
    if (matchesAliasedEntry) return file.source_url;
    const allowlistRoots = [
      path.resolve(root, '..', 'allowlists'),
      path.resolve(root, '..', 'package-payload-allowlists'),
    ];
    for (const allowlistRoot of allowlistRoots) {
      const allowlistPath = path.resolve(allowlistRoot, `${manifest.package_id}.json`);
      if (allowlistPath.startsWith(`${allowlistRoot}${path.sep}`) && fs.existsSync(allowlistPath)) {
        const allowlist: unknown = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
        if (isRecord(allowlist)
          && allowlist.package_id === manifest.package_id
          && allowlist.source_root === payload.source_root
          && allowlist.carrier_projection_ref === 'contracts/carrier_projection.json'
          && Array.isArray(allowlist.paths)
          && allowlist.paths.includes(icon)) {
          return file.source_url;
        }
      }
    }
    return null;
  } catch { return null; }
}
