import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { nowIso } from '@opl/core';
import { PackError } from '../errors.ts';
import {
  OplReleaseLockV2Schema,
  type OplPackageManifestV2,
  type OplReleaseLockV2,
} from '../manifest/schema.ts';
import { parsePackageManifestV2 } from '../manifest/validate.ts';
import type { BuildPackageResult } from '../types.ts';
import {
  CANONICALIZATION_ALGORITHM,
  collectPackageReleasePaths,
  computePackageContentDigest,
  sortPosixPaths,
  verifyManifestPathsExist,
} from './content-lock.ts';

export interface BuildPackageOptions {
  readonly writeLock?: boolean;
  readonly builtAt?: string;
  readonly gitCommit?: string;
  readonly allowSymlinks?: boolean;
  readonly excludePaths?: ReadonlySet<string>;
}

function tryDetectGitCommit(packageRoot: string): string | undefined {
  try {
    const output = execFileSync('git', ['-C', packageRoot, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    return /^[0-9a-f]{40}$/.test(output) ? output : undefined;
  } catch {
    return undefined;
  }
}

export function readPackageManifestFromDir(packageRoot: string): {
  realRoot: string;
  manifestPath: string;
  manifest: OplPackageManifestV2;
} {
  if (!fs.existsSync(packageRoot)) {
    throw new PackError('PACK_NOT_FOUND', `Package directory does not exist: ${packageRoot}`, {
      package_root: packageRoot,
    });
  }
  const realRoot = fs.realpathSync(packageRoot);
  const stat = fs.statSync(realRoot);
  if (!stat.isDirectory()) {
    throw new PackError('INVALID_INPUT', `Package path is not a directory: ${realRoot}`, {
      package_root: realRoot,
    });
  }
  const manifestPath = path.join(realRoot, 'opl-package.json');
  if (!fs.existsSync(manifestPath)) {
    throw new PackError(
      'PACK_MISSING_PATH',
      `Missing opl-package.json at ${manifestPath}`,
      { package_root: realRoot, path: 'opl-package.json' },
    );
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
  } catch (error) {
    throw new PackError(
      'INVALID_MANIFEST',
      `Failed to parse JSON in ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`,
      { manifest_path: manifestPath },
      { cause: error },
    );
  }
  const manifest = parsePackageManifestV2(raw);
  return { realRoot, manifestPath, manifest };
}

export function computeLiveDirectoryContentDigest(
  packageRoot: string,
  options: { allowSymlinks?: boolean; excludePaths?: ReadonlySet<string> } = {},
): { paths: string[]; digest: string } {
  const realRoot = fs.realpathSync(packageRoot);
  const paths = collectPackageReleasePaths(realRoot, {
    allowSymlinks: options.allowSymlinks ?? false,
    excludePaths: options.excludePaths,
  });
  if (paths.length === 0) {
    throw new PackError('PACK_MISSING_PATH', `Package directory '${realRoot}' contains no files.`, {
      package_root: realRoot,
    });
  }
  const digest = computePackageContentDigest(paths, (rel) =>
    fs.readFileSync(path.join(realRoot, rel)),
  );
  return { paths, digest };
}

export function buildPackage(
  packageRoot: string,
  options: BuildPackageOptions = {},
): BuildPackageResult {
  const { realRoot, manifest } = readPackageManifestFromDir(packageRoot);
  const allowSymlinks = options.allowSymlinks ?? false;

  verifyManifestPathsExist(realRoot, manifest, { allowSymlinks });

  const { paths, digest } = computeLiveDirectoryContentDigest(realRoot, {
    allowSymlinks,
    excludePaths: options.excludePaths,
  });

  if (!paths.includes('opl-package.json')) {
    throw new PackError('PACK_MISSING_PATH', 'opl-package.json must be included in release files.', {
      package_root: realRoot,
    });
  }

  const gitCommit = options.gitCommit ?? tryDetectGitCommit(realRoot);
  const lockObj: OplReleaseLockV2 = {
    schema_version: 'opl.release.lock.v2',
    package_id: manifest.identity.id,
    version: manifest.identity.version,
    algorithm: 'sha256',
    canonicalization: CANONICALIZATION_ALGORITHM,
    file_count: paths.length,
    paths,
    digest,
    built_at: options.builtAt ?? nowIso(),
    ...(gitCommit ? { git_commit: gitCommit } : {}),
    ...(manifest.dependencies?.packages?.length
      ? {
          dependencies: manifest.dependencies.packages.map((dep) => ({
            id: dep.id,
            ...(dep.version ? { version: dep.version } : {}),
          })),
        }
      : {}),
  };

  const lock = OplReleaseLockV2Schema.parse(lockObj);
  const lockPath = path.join(realRoot, 'opl-release.lock.json');
  if (options.writeLock !== false) {
    const existingLockLstat = fs.lstatSync(lockPath, { throwIfNoEntry: false });
    if (existingLockLstat?.isSymbolicLink()) {
      throw new PackError(
        'PACK_SYMLINK_ESCAPE',
        `Cannot write opl-release.lock.json: target '${lockPath}' is a symlink.`,
        { package_root: realRoot, path: 'opl-release.lock.json' },
      );
    }
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  }

  return {
    package_root: realRoot,
    manifest,
    lock,
    lock_path: lockPath,
    digest,
  };
}

export function verifyReleaseLock(
  packageRoot: string,
  lockInput?: unknown,
  options: { allowExtraFiles?: boolean; allowSymlinks?: boolean } = {},
): { lock: OplReleaseLockV2; digest: string } {
  const { realRoot, manifest } = readPackageManifestFromDir(packageRoot);
  let rawLock = lockInput;
  if (rawLock === undefined) {
    const lockPath = path.join(realRoot, 'opl-release.lock.json');
    const lockLstat = fs.lstatSync(lockPath, { throwIfNoEntry: false });
    if (!lockLstat) {
      throw new PackError(
        'PACK_LOCK_MISMATCH',
        `Missing opl-release.lock.json at ${lockPath}`,
        { package_root: realRoot },
      );
    }
    if (lockLstat.isSymbolicLink()) {
      throw new PackError(
        'PACK_SYMLINK_ESCAPE',
        `opl-release.lock.json cannot be a symlink.`,
        { package_root: realRoot, path: 'opl-release.lock.json' },
      );
    }
    if (!lockLstat.isFile()) {
      throw new PackError(
        'PACK_LOCK_MISMATCH',
        `opl-release.lock.json must be a regular file.`,
        { package_root: realRoot, path: 'opl-release.lock.json' },
      );
    }
    try {
      rawLock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as unknown;
    } catch (error) {
      throw new PackError(
        'PACK_LOCK_MISMATCH',
        `Invalid JSON in opl-release.lock.json: ${error instanceof Error ? error.message : String(error)}`,
        { package_root: realRoot },
        { cause: error },
      );
    }
  }

  const parsedLock = OplReleaseLockV2Schema.safeParse(rawLock);
  if (!parsedLock.success) {
    throw new PackError(
      'PACK_LOCK_MISMATCH',
      `Invalid opl-release.lock.json schema: ${parsedLock.error.message}`,
      { package_root: realRoot },
    );
  }
  const lock = parsedLock.data;
  if (lock.package_id !== manifest.identity.id || lock.version !== manifest.identity.version) {
    throw new PackError(
      'PACK_LOCK_MISMATCH',
      `Lock identity (${lock.package_id}@${lock.version}) does not match manifest (${manifest.identity.id}@${manifest.identity.version}).`,
      {
        lock_id: lock.package_id,
        lock_version: lock.version,
        manifest_id: manifest.identity.id,
        manifest_version: manifest.identity.version,
      },
    );
  }

  if (lock.file_count !== lock.paths.length) {
    throw new PackError(
      'PACK_LOCK_MISMATCH',
      `Lock file_count (${lock.file_count}) does not match paths.length (${lock.paths.length}).`,
    );
  }

  const expectedSorted = sortPosixPaths(lock.paths);
  for (let i = 0; i < lock.paths.length; i += 1) {
    if (lock.paths[i] !== expectedSorted[i]) {
      throw new PackError('PACK_LOCK_MISMATCH', 'Lock paths are not canonically sorted.');
    }
    if (i > 0 && lock.paths[i] === lock.paths[i - 1]) {
      throw new PackError('PACK_LOCK_MISMATCH', `Duplicate path '${lock.paths[i]}' in lock.`);
    }
  }

  const allowSymlinks = options.allowSymlinks ?? false;
  const diskPaths = collectPackageReleasePaths(realRoot, { allowSymlinks });
  const diskSet = new Set(diskPaths);
  const lockSet = new Set(lock.paths);

  for (const rel of lock.paths) {
    if (!diskSet.has(rel)) {
      throw new PackError(
        'PACK_LOCK_MISMATCH',
        `Locked file '${rel}' is missing from package directory.`,
        { path: rel },
      );
    }
  }

  if (!options.allowExtraFiles) {
    for (const rel of diskPaths) {
      if (!lockSet.has(rel)) {
        throw new PackError(
          'PACK_LOCK_MISMATCH',
          `Unexpected unlocked file '${rel}' found in package directory.`,
          { path: rel },
        );
      }
    }
  }

  const recomputedDigest = computePackageContentDigest(lock.paths, (rel) =>
    fs.readFileSync(path.join(realRoot, rel)),
  );
  if (recomputedDigest !== lock.digest) {
    throw new PackError(
      'PACK_LOCK_MISMATCH',
      `Content lock digest mismatch: expected ${lock.digest}, got ${recomputedDigest}.`,
      { expected: lock.digest, actual: recomputedDigest },
    );
  }

  return { lock, digest: recomputedDigest };
}
