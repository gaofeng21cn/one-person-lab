import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

export type PackageSourceArchiveEntry = { path: string; kind: 'file' | 'directory'; size?: number };

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
    entries.push({ path: entry.path, kind: entry.type === 'File' ? 'file' : 'directory', size: entry.size });
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

export function materializePackageSourceCommit(checkoutRoot: string, commit: string, env: NodeJS.ProcessEnv) {
  const temporaryRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-developer-source-')));
  const cleanup = () => fs.rmSync(temporaryRoot, { recursive: true, force: true });
  try {
    const git = (args: string[]) => spawnSync('git', ['--no-replace-objects', '-C', checkoutRoot, ...args], {
      env, encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 120_000,
    });
    const resolved = git(['rev-parse', '--verify', '--end-of-options', `${commit}^{commit}`]);
    if (!/^[0-9a-f]{40}$/.test(commit) || resolved.status !== 0 || resolved.error
      || resolved.stdout.trim() !== commit) {
      throw new Error('Developer checkout does not contain the selected source commit.');
    }
    const archivePath = path.join(temporaryRoot, 'source.tar.gz');
    const archived = git(['archive', '--format=tar.gz', '--prefix=source/', `--output=${archivePath}`, commit]);
    if (archived.status !== 0 || archived.error) throw new Error('Developer source commit could not be archived.');
    packageSourceArchiveDigest(archivePath);
    const entries = readPackageSourceArchiveEntries(archivePath, 'source');
    if (!packageSourceArchiveMembersStayWithinRoot(entries, 'source')) {
      throw new Error('Developer source archive must contain only physical files within its declared root.');
    }
    extractPackageSourceArchive(archivePath, temporaryRoot);
    return { sourceRoot: path.join(temporaryRoot, 'source'), cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
