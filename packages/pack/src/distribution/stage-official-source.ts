import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readPackageManifestFromDir, verifyReleaseLock } from '../build/build-package.ts';
import { verifyManifestPathsExist } from '../build/content-lock.ts';
import { PackError } from '../errors.ts';
import type { InstallSourceSpec } from '../types.ts';
import { extractPackageSourceArchive } from './archive.ts';
import { normalizeDistributionVersion, type RegistryFetch } from './registry-client.ts';
import { copyDirectoryPhysical, downloadOciSource } from './source-files.ts';

function officialArchiveRoot(extractRoot: string): string {
  if (fs.existsSync(path.join(extractRoot, 'opl-package.json'))
      || fs.existsSync(path.join(extractRoot, 'plugins'))
      || fs.existsSync(path.join(extractRoot, 'contracts'))) return extractRoot;
  const entries = fs.readdirSync(extractRoot, { withFileTypes: true });
  if (entries.length === 1 && entries[0]!.isDirectory()) return path.join(extractRoot, entries[0]!.name);
  throw new PackError('PACK_ARCHIVE_INVALID', 'Official package source has no package root.');
}

/** Stage a pre-downloaded official tarball archive with full manifest & release lock verification. */
export function stageOfficialPackageArchive(
  archivePath: string,
  source: InstallSourceSpec,
  release?: { version: string; commit: string; contentDigest: string } | null,
  options: { signal?: AbortSignal } = {},
  seed?: { commit?: string; contentDigest?: string },
) {
  options.signal?.throwIfAborted();
  if (!source.package_id) throw new PackError('INVALID_INPUT', 'Official package source requires its catalog identity.');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-official-pkg-'));
  const dispose = () => fs.rmSync(tmpRoot, { recursive: true, force: true });
  try {
    let pkgRoot = path.join(tmpRoot, 'source');
    extractPackageSourceArchive(archivePath, pkgRoot);
    pkgRoot = officialArchiveRoot(pkgRoot);
    return verifyAndReturnStagedRoot(tmpRoot, pkgRoot, source, release, options, seed, dispose);
  } catch (error) {
    dispose();
    throw error;
  }
}

function verifyAndReturnStagedRoot(
  _tmpRoot: string,
  pkgRoot: string,
  source: InstallSourceSpec,
  release: { version: string; commit: string; contentDigest: string } | null | undefined,
  options: { signal?: AbortSignal },
  seed: { commit?: string; contentDigest?: string } | undefined,
  dispose: () => void,
) {
  options.signal?.throwIfAborted();
  const { manifest } = readPackageManifestFromDir(pkgRoot);
  if (manifest.identity.id !== source.package_id) {
    throw new PackError('INVALID_MANIFEST', `Expected official package '${source.package_id}', got '${manifest.identity.id}'.`);
  }
  if (source.version && manifest.identity.version !== normalizeDistributionVersion(source.version)) {
    throw new PackError('PACK_LOCK_MISMATCH', `Package version differs from the Catalog selection for '${source.package_id}'.`);
  }
  verifyManifestPathsExist(pkgRoot, manifest, { allowSymlinks: false });
  if (release || seed || fs.existsSync(path.join(pkgRoot, 'opl-release.lock.json'))) {
    const { lock } = verifyReleaseLock(pkgRoot);
    if (release && (lock.version !== release.version || lock.git_commit !== release.commit || lock.digest !== release.contentDigest)) {
      throw new PackError('PACK_LOCK_MISMATCH', `Packaged release lock differs from the Catalog release for '${source.package_id}'.`);
    }
    if ((seed?.commit && lock.git_commit !== seed.commit) || (seed?.contentDigest && lock.digest !== seed.contentDigest)) {
      throw new PackError('PACK_LOCK_MISMATCH', `Packaged release lock differs from the Full seed for '${source.package_id}'.`);
    }
  }
  const localSource: InstallSourceSpec = { kind: 'local_dir', path: pkgRoot, package_id: source.package_id };
  return { manifest, source: localSource, dispose };
}

/** Prepare the exact source selected by the official catalog or offline seed. */
export async function stageOfficialPackageSource(
  source: InstallSourceSpec,
  release?: { version: string; commit: string; contentDigest: string } | null,
  fetchImpl?: RegistryFetch,
  authHeader?: string,
  options: Partial<Pick<Parameters<typeof downloadOciSource>[1], 'cacheRoot' | 'opId' | 'signal' | 'onProgress' | 'transport'>> = {},
  seed?: { commit?: string; contentDigest?: string },
) {
  options.signal?.throwIfAborted();
  if (!source.package_id) throw new PackError('INVALID_INPUT', 'Official package source requires its catalog identity.');
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-official-pkg-'));
  const dispose = () => fs.rmSync(tmpRoot, { recursive: true, force: true });
  try {
    let pkgRoot = path.join(tmpRoot, 'source');
    if (source.kind === 'local_dir' && source.path) {
      copyDirectoryPhysical(source.path, pkgRoot);
    } else if (source.kind === 'oci') {
      options.onProgress?.({ stage: 'resolving_oci', bytes_done: 0 });
      const archive = await downloadOciSource(source, {
        cacheRoot: options.cacheRoot ?? path.join(tmpRoot, 'download'), fetchImpl, authHeader,
        onProgress: options.onProgress, signal: options.signal, opId: options.opId, transport: options.transport,
      });
      extractPackageSourceArchive(archive, pkgRoot);
      pkgRoot = officialArchiveRoot(pkgRoot);
    } else {
      throw new PackError('INVALID_INPUT', 'Official package requires a local seed directory or an OCI source.');
    }
    return verifyAndReturnStagedRoot(tmpRoot, pkgRoot, source, release, options, seed, dispose);
  } catch (error) {
    dispose();
    throw error;
  }
}
