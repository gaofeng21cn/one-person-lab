import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '../../../kernel/contract-validation.ts';
import { packagePayloadProjection } from './configured-codex-plugin-carrier-payload.ts';
import { readPackageRegistryBytes } from './configured-codex-plugin-carrier-source.ts';
import { assertPackageDownloadAllowed, packageAccessSubject } from './package-access.ts';
import { credentialForGithubPackages } from './package-registry-access-provider.ts';
import { packageDownloadCache, packageTransferStateRoot } from './package-operation-state.ts';

function freeBytes(location: string) {
  let existing = location;
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  const stat = fs.statfsSync(existing);
  return stat.bavail * stat.bsize;
}
export function packageDownloadPlan(packageId: string, env: NodeJS.ProcessEnv = process.env) {
  const projection = packagePayloadProjection(packageId);
  const base = { package_id: packageId, version: projection?.packageVersion ?? null,
    install_location: projection ? path.join(packageTransferStateRoot(env), 'codex-plugin-marketplaces', projection.pluginId, 'plugins', projection.pluginId) : null,
    download_bytes: null as number | null, cached_bytes: 0, unpacked_bytes: null,
    available_disk_bytes: freeBytes(packageTransferStateRoot(env)), source: null as string | null };
  if (!projection) return { ...base, size_status: 'native_carrier' };
  const owner = projection.ownerManifest;
  const surface = isRecord(owner.codex_surface) ? owner.codex_surface : {};
  const carrier = isRecord(surface.configured_codex_plugin_carrier) ? surface.configured_codex_plugin_carrier : {};
  const publication = typeof carrier.publication_ref === 'string' ? carrier.publication_ref : '';
  const match = publication.match(/^ghcr\.io\/([a-z0-9._-]+\/one-person-lab-(?:private-)?packages\/[a-z0-9.-]+):latest-stable$/);
  if (!match || !projection.packageVersion) return { ...base, size_status: 'native_carrier' };
  const subject = packageAccessSubject({ ...owner, codex_surface: { ...surface, configured_codex_plugin_carrier: { ...carrier, publication_ref: `ghcr.io/${match[1]}:${projection.packageVersion}` } } });
  const access = owner.visibility === 'authorized_only' ? assertPackageDownloadAllowed(subject, env) : null;
  const credential = access ? credentialForGithubPackages(env, access.credential_handle) : null;
  if (access && !credential) throw new Error('private_package_credentials_unavailable');
  const token = JSON.parse(readPackageRegistryBytes(`https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(`repository:${match[1]}:pull`)}`, env, undefined, credential ?? undefined).toString()).token;
  if (typeof token !== 'string') throw new Error('package_registry_token_unavailable');
  const manifest = JSON.parse(readPackageRegistryBytes(`https://ghcr.io/v2/${match[1]}/manifests/${access?.registry_digest ?? projection.packageVersion}`, env, token).toString());
  const layers: Record<string, unknown>[] = Array.isArray(manifest.layers) ? manifest.layers.filter(isRecord) : [];
  const source = layers.find(layer => layer.mediaType === 'application/vnd.onepersonlab.package.source.v1+gzip');
  if (!source || typeof source.digest !== 'string' || layers.some(layer => !Number.isSafeInteger(layer.size) || Number(layer.size) < 0)) throw new Error('package_download_metadata_invalid');
  const cache = path.join(packageDownloadCache(source.digest, env), 'archive.tar.gz');
  const cached = [cache, `${cache}.part`].map(file => { const stat = fs.lstatSync(file, { throwIfNoEntry: false }); return stat?.isFile() ? stat.size : 0; });
  return { ...base, source: 'ghcr.io', download_bytes: layers.reduce((sum, layer) => sum + Number(layer.size), 0),
    cached_bytes: Math.min(Number(source.size), Math.max(...cached)), size_status: 'known' };
}
