import fs from 'node:fs';
import path from 'node:path';
import { PackError } from '../errors.ts';
import type { InstallSourceSpec } from '../types.ts';
import { downloadPackageArchive, type PackageDownloadRequest } from './download-worker.ts';
import { resolveOciArtifact, type RegistryFetch } from './registry-client.ts';

export function copyDirectoryPhysical(srcDir: string, destDir: string): void {
  const realSrc = fs.realpathSync(srcDir);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });
  const copyWalk = (curSrc: string, curDest: string): void => {
    for (const entry of fs.readdirSync(curSrc, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.DS_Store') {
        continue;
      }
      const fromPath = path.join(curSrc, entry.name);
      const toPath = path.join(curDest, entry.name);
      const lstat = fs.lstatSync(fromPath);
      if (lstat.isSymbolicLink()) {
        throw new PackError(
          'PACK_SYMLINK_ESCAPE',
          `Release package source contains forbidden symlink '${fromPath}'.`,
        );
      }
      if (lstat.isDirectory()) {
        if (
          entry.name === '.codegraph' ||
          entry.name === '.tsbuildinfo' ||
          entry.name === '__pycache__' ||
          entry.name === '.pytest_cache' ||
          entry.name === '.ruff_cache' ||
          entry.name === '.venv'
        ) {
          continue;
        }
        fs.mkdirSync(toPath, { recursive: true });
        copyWalk(fromPath, toPath);
      } else if (lstat.isFile()) {
        if (entry.name.endsWith('.pyc') || entry.name.endsWith('.tsbuildinfo')) {
          continue;
        }
        fs.copyFileSync(fromPath, toPath);
      }
    }
  };
  copyWalk(realSrc, destDir);
}

export async function downloadOciSource(
  source: InstallSourceSpec,
  options: Pick<PackageDownloadRequest, 'cacheRoot' | 'transport' | 'signal' | 'onProgress'> & { fetchImpl?: RegistryFetch },
): Promise<string> {
  if (!source.ref) throw new PackError('INVALID_INPUT', 'OCI source requires ref.');
  const resolved = await resolveOciArtifact({
    ociRef: source.ref,
    version: source.version,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });
  if (source.expected_digest && resolved.digest !== source.expected_digest) {
    throw new PackError(
      'PACK_LOCK_MISMATCH',
      `OCI digest mismatch: expected ${source.expected_digest}, got ${resolved.digest}.`,
    );
  }
  return downloadPackageArchive({
    url: resolved.blob_url,
    token: resolved.token,
    digest: resolved.digest,
    size: resolved.size,
    packageId: source.package_id ?? resolved.repository,
    allowInsecureHttp: resolved.blob_url.startsWith('http://127.0.0.1')
      || resolved.blob_url.startsWith('http://localhost'),
    ...options,
  });
}
