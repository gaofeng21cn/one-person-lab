import { extract, list } from 'tar';

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
