import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { create as tarCreate, extract as tarExtract, list as tarList } from 'tar';
import { PackError } from '../errors.ts';

export const MAX_PACKAGE_SOURCE_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;

export interface PackageSourceArchiveEntry {
  readonly path: string;
  readonly kind: 'file' | 'directory';
  readonly size?: number;
}

export function packageSourceArchiveDigest(archivePath: string): string {
  let descriptor: number;
  try {
    descriptor = fs.openSync(archivePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    throw new PackError(
      'PACK_ARCHIVE_INVALID',
      `Unable to open archive '${archivePath}': ${error instanceof Error ? error.message : String(error)}`,
      { archive_path: archivePath },
      { cause: error },
    );
  }
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_PACKAGE_SOURCE_ARCHIVE_BYTES)) {
      throw new PackError(
        'PACK_ARCHIVE_INVALID',
        'Package source archive must be a bounded physical regular file.',
        { archive_path: archivePath },
      );
    }
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let count: number;
    while ((count = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, count));
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    const linked = fs.lstatSync(archivePath, { bigint: true });
    const realArchive = fs.realpathSync(archivePath);
    const expectedViaRealDir = path.join(
      fs.realpathSync(path.dirname(archivePath)),
      path.basename(archivePath),
    );
    if (
      !linked.isFile()
      || realArchive !== expectedViaRealDir
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || linked.dev !== after.dev
      || linked.ino !== after.ino
    ) {
      throw new PackError(
        'PACK_ARCHIVE_INVALID',
        'Package source archive changed during verification or is not a canonical physical file.',
        { archive_path: archivePath },
      );
    }
    return `sha256:${hash.digest('hex')}`;
  } finally {
    fs.closeSync(descriptor);
  }
}

export function readPackageSourceArchiveEntries(archivePath: string): PackageSourceArchiveEntry[] {
  const entries: PackageSourceArchiveEntry[] = [];
  tarList({
    file: archivePath,
    sync: true,
    strict: true,
    onReadEntry(entry) {
      if (entry.type !== 'File' && entry.type !== 'Directory') {
        throw new PackError(
          'PACK_ARCHIVE_INVALID',
          `Package source archive contains unsupported member type '${entry.type}' at '${entry.path}'.`,
          { path: entry.path, type: entry.type },
        );
      }
      entries.push({
        path: entry.path,
        kind: entry.type === 'File' ? 'file' : 'directory',
        size: entry.size,
      });
    },
  });
  if (entries.length === 0) {
    throw new PackError('PACK_ARCHIVE_INVALID', 'Package source archive contains no members.');
  }
  return entries;
}

export function packageSourceArchiveMembersStayWithinRoot(
  entries: readonly PackageSourceArchiveEntry[],
  archiveRoot?: string,
): boolean {
  if (entries.length === 0) return false;
  const root = archiveRoot ? archiveRoot.replace(/\/+$/, '').replace(/^\.\//, '') : null;
  return entries.every((entry) => {
    const raw = entry.path.replace(/\/+$/, '');
    if (!raw || raw === '.' || raw.includes('\0') || raw.includes('\\') || raw.startsWith('/')) {
      return false;
    }
    if (/^[A-Za-z]:/.test(raw)) return false;
    const name = raw.startsWith('./') ? raw.slice(2) : raw;
    if (!name || name.startsWith('/')) return false;
    if (root) {
      if (name === root) return true;
      if (!name.startsWith(`${root}/`)) return false;
      return name
        .slice(root.length + 1)
        .split('/')
        .every((part) => part !== '' && part !== '.' && part !== '..');
    }
    return name.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
  });
}

export function extractPackageSourceArchive(
  archivePath: string,
  destination: string,
  options: { expectedRoot?: string; strip?: number } = {},
): PackageSourceArchiveEntry[] {
  const entries = readPackageSourceArchiveEntries(archivePath);
  if (!packageSourceArchiveMembersStayWithinRoot(entries, options.expectedRoot)) {
    throw new PackError(
      'PACK_ARCHIVE_INVALID',
      'Package source archive contains unsafe or escaping member paths.',
      { archive_path: archivePath, expected_root: options.expectedRoot ?? null },
    );
  }
  fs.mkdirSync(destination, { recursive: true });
  tarExtract({
    file: archivePath,
    cwd: destination,
    sync: true,
    strict: true,
    preservePaths: false,
    preserveOwner: false,
    noChmod: true,
    noMtime: true,
    ...(options.strip !== undefined ? { strip: options.strip } : {}),
  });
  return entries;
}

export function createPackageSourceArchive(
  sourceDir: string,
  archivePath: string,
  paths: readonly string[],
): string {
  const realSource = fs.realpathSync(sourceDir);
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  tarCreate(
    {
      file: archivePath,
      cwd: realSource,
      gzip: true,
      portable: true,
      sync: true,
      strict: true,
      follow: false,
    },
    [...paths],
  );
  return packageSourceArchiveDigest(archivePath);
}
