import fs from 'node:fs';
import path from 'node:path';
import { PackError } from '../errors.ts';
import {
  resolveOciArtifact,
  type RegistryFetch,
} from './registry-client.ts';

export function freeDiskBytes(location: string): number {
  let existing = path.resolve(location);
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const stat = fs.statfsSync(existing);
  return Number(stat.bavail) * Number(stat.bsize);
}

export function packageDownloadCacheDir(cacheRoot: string, digest: string): string {
  const safeDigest = digest.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safeDigest) {
    throw new PackError('INVALID_INPUT', `Invalid digest '${digest}'.`);
  }
  return path.join(cacheRoot, safeDigest);
}

export interface PackageDownloadPlan {
  readonly package_id: string;
  readonly version: string | null;
  readonly install_location: string;
  readonly source: 'oci' | 'npm' | 'local';
  readonly download_bytes: number | null;
  readonly cached_bytes: number;
  readonly unpacked_bytes: number | null;
  readonly available_disk_bytes: number;
  readonly size_status: 'known' | 'unknown' | 'local';
  readonly digest?: string;
  readonly blob_url?: string;
  readonly token?: string;
}

export async function planOciPackageDownload(input: {
  readonly packageId: string;
  readonly version: string;
  readonly ociRef: string;
  readonly installLocation: string;
  readonly cacheRoot: string;
  readonly authHeader?: string;
  readonly fetchImpl?: RegistryFetch;
  readonly signal?: AbortSignal;
}): Promise<PackageDownloadPlan> {
  const availableDiskBytes = freeDiskBytes(input.cacheRoot);
  const resolved = await resolveOciArtifact({
    ociRef: input.ociRef,
    version: input.version,
    authHeader: input.authHeader,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });

  const cacheDir = packageDownloadCacheDir(input.cacheRoot, resolved.digest);
  const completePath = path.join(cacheDir, 'archive.tar.gz');
  const partPath = `${completePath}.part`;
  const cachedSizes = [completePath, partPath].map((file) => {
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    return stat?.isFile() ? stat.size : 0;
  });
  const totalBytes = resolved.layers.reduce((sum, layer) => sum + layer.size, 0);

  return {
    package_id: input.packageId,
    version: resolved.reference,
    install_location: input.installLocation,
    source: 'oci',
    download_bytes: totalBytes,
    cached_bytes: Math.min(resolved.size, Math.max(...cachedSizes)),
    unpacked_bytes: null,
    available_disk_bytes: availableDiskBytes,
    size_status: 'known',
    digest: resolved.digest,
    blob_url: resolved.blob_url,
    token: resolved.token,
  };
}
