import crypto from 'node:crypto';
import fs from 'node:fs';
import { extract, list } from 'tar';

// Source bundles may contain media; JSON and individual files retain their smaller bounds.
export const MAX_PACKAGE_SOURCE_ARCHIVE_BYTES = 2 * 1024 * 1024 * 1024;

export function packageSourceArchiveDigest(archivePath: string) {
  const descriptor = fs.openSync(archivePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size > BigInt(MAX_PACKAGE_SOURCE_ARCHIVE_BYTES)) {
      throw new Error('Package source archive must be a bounded physical regular file.');
    }
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (let count; (count = fs.readSync(descriptor, buffer)) > 0;) hash.update(buffer.subarray(0, count));
    const after = fs.fstatSync(descriptor, { bigint: true });
    const linked = fs.lstatSync(archivePath, { bigint: true });
    if (!linked.isFile() || fs.realpathSync(archivePath) !== archivePath
      || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || linked.dev !== after.dev || linked.ino !== after.ino) {
      throw new Error('Package source archive changed or is not a canonical physical file.');
    }
    return `sha256:${hash.digest('hex')}`;
  } finally { fs.closeSync(descriptor); }
}

export type PackageSourceArchiveEntry = { path: string; kind: 'file' | 'directory' };

// Use the same structured reader for inspection and extraction. PAX and GNU
// metadata can override a header's path; checking only its ustar name while a
// different extractor honors the override would admit traversal. Member paths
// here are the effective paths, independent of the host's locale.
export function readPackageSourceArchiveEntries(archivePath: string, _archiveRoot: string): PackageSourceArchiveEntry[] {
  const entries: PackageSourceArchiveEntry[] = [];
  list({ file: archivePath, sync: true, strict: true, onReadEntry(entry) {
    if (entry.type !== 'File' && entry.type !== 'Directory') {
      throw new Error('Package source archive contains a non-physical member type.');
    }
    entries.push({ path: entry.path, kind: entry.type === 'File' ? 'file' : 'directory' });
  } });
  if (entries.length === 0) throw new Error('Package source archive contains no members.');
  return entries;
}

export function packageSourceArchiveMembersStayWithinRoot(entries: PackageSourceArchiveEntry[], archiveRoot: string) {
  const root = archiveRoot.replace(/\/$/, '');
  return entries.length > 0 && entries.every((entry) => {
    const name = entry.path.replace(/\/$/, '');
    if (name.includes('\\')) return false;
    if (name === root) return true;
    if (!name.startsWith(`${root}/`)) return false;
    return name.slice(root.length + 1).split('/').every((part) => part !== '' && part !== '.' && part !== '..');
  });
}

export function extractPackageSourceArchive(archivePath: string, destination: string) {
  extract({ file: archivePath, cwd: destination, sync: true, strict: true,
    preservePaths: false, preserveOwner: false, noChmod: true, noMtime: true });
}
