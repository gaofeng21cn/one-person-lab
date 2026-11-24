import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '../../../kernel/contract-validation.ts';
import type { InstalledPackageDescriptor } from './installed-codex-plugin-directory-types.ts';

/** Artwork uses the existing payload's immutable provenance, never a second asset catalog. */
export function packageArtworkUrl(descriptor: InstalledPackageDescriptor): string | null {
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
    const root = path.dirname(descriptor.manifestPath);
    const payloadPath = path.resolve(root, payloadRef);
    if (!payloadPath.startsWith(`${root}${path.sep}`)) return null;
    const payload: unknown = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
    if (!isRecord(payload) || payload.package_id !== manifest.package_id || payload.package_version !== manifest.version
      || payload.source_commit !== commit || !Array.isArray(payload.files)) return null;
    const sourceRoot = payload.source_root === '.' ? '' : payload.source_root;
    if (typeof sourceRoot !== 'string' || sourceRoot.split('/').some(part => part === '..' || part === '.')) return null;
    const file = payload.files.find(file => isRecord(file) && file.path === icon);
    const expected = `https://raw.githubusercontent.com${repo.pathname.replace(/\.git$/, '')}/${commit}/${sourceRoot ? `${sourceRoot}/` : ''}${icon}`;
    return isRecord(file) && /^sha256:[0-9a-f]{64}$/.test(String(file.sha256)) && file.source_url === expected ? expected : null;
  } catch { return null; }
}
