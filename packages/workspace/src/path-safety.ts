import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { WorkspaceError, type WorkspaceErrorCode } from './errors.ts';
import type { SnapshotFileEntry } from './types.ts';

const SKIPPED_DIR_NAMES = new Set(['.git', 'node_modules', '.DS_Store']);

function hasAsciiControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function normalizePosixRelativeSegments(
  rawPath: string,
  errorCode: WorkspaceErrorCode = 'INVALID_PATH',
): string[] {
  if (typeof rawPath !== 'string' || rawPath.length === 0 || hasAsciiControlChar(rawPath)) {
    throw new WorkspaceError(
      errorCode === 'PATH_OUTSIDE_SOURCE' || errorCode === 'PATH_OUTSIDE_WORKSPACE'
        ? 'INVALID_PATH'
        : errorCode,
      'Path must be a non-empty relative path without control characters.',
      { path: rawPath },
    );
  }
  if (
    rawPath.startsWith('/')
    || rawPath.startsWith('\\')
    || /^[A-Za-z]:/.test(rawPath)
    || path.isAbsolute(rawPath)
    || path.win32.isAbsolute(rawPath)
  ) {
    throw new WorkspaceError(
      errorCode,
      `Absolute path '${rawPath}' is forbidden.`,
      { path: rawPath },
    );
  }
  const normalized = rawPath.replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (segments.some((seg) => seg === '' || seg === '.' || seg === '..')) {
    throw new WorkspaceError(
      errorCode,
      `Relative path '${rawPath}' contains forbidden traversal or empty segments.`,
      { path: rawPath },
    );
  }
  return segments;
}

export function assertSafeRelativePath(
  rawPath: string,
  errorCode: WorkspaceErrorCode = 'INVALID_PATH',
): string {
  return normalizePosixRelativeSegments(rawPath, errorCode).join('/');
}

export function isWithinRealRoot(realRoot: string, candidate: string): boolean {
  const rel = path.relative(realRoot, candidate);
  return (
    rel === ''
    || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
  );
}

export function resolveExistingRealDir(
  dirPath: string,
  missingErrorCode: WorkspaceErrorCode = 'SOURCE_UNAVAILABLE',
): string {
  const abs = path.resolve(dirPath);
  const stat = fs.statSync(abs, { throwIfNoEntry: false });
  if (!stat) {
    throw new WorkspaceError(
      missingErrorCode,
      `Directory '${dirPath}' does not exist.`,
      { root_path: dirPath },
    );
  }
  if (!stat.isDirectory()) {
    throw new WorkspaceError(
      'INVALID_INPUT',
      `Path '${dirPath}' is not a directory.`,
      { root_path: dirPath },
    );
  }
  return fs.realpathSync(abs);
}

export function resolveConfinedWritePath(rootDir: string, targetPath: string): {
  readonly normalizedRelPath: string;
  readonly realRoot: string;
  readonly resolvedPath: string;
} {
  const segments = normalizePosixRelativeSegments(targetPath, 'PATH_OUTSIDE_SOURCE');
  const normalizedRelPath = segments.join('/');
  const realRoot = resolveExistingRealDir(rootDir, 'SOURCE_UNAVAILABLE');

  let current = realRoot;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    current = path.resolve(current, segment);
    if (!isWithinRealRoot(realRoot, current) || current === realRoot) {
      throw new WorkspaceError(
        'PATH_OUTSIDE_SOURCE',
        `Target path '${targetPath}' escapes source root.`,
        { target_path: targetPath },
      );
    }

    const lstat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (lstat) {
      if (lstat.isSymbolicLink()) {
        throw new WorkspaceError(
          'PATH_OUTSIDE_SOURCE',
          `Symbolic link in writeback target path '${targetPath}' is forbidden.`,
          { target_path: targetPath, segment_path: segments.slice(0, index + 1).join('/') },
        );
      }
      const isLeaf = index === segments.length - 1;
      if (!isLeaf && !lstat.isDirectory()) {
        throw new WorkspaceError(
          'INVALID_INPUT',
          `Parent segment '${segments.slice(0, index + 1).join('/')}' is not a directory.`,
          { target_path: targetPath },
        );
      }
      if (isLeaf && lstat.isDirectory()) {
        throw new WorkspaceError(
          'INVALID_INPUT',
          `Writeback target '${targetPath}' is an existing directory.`,
          { target_path: targetPath },
        );
      }
    }
  }

  return {
    normalizedRelPath,
    realRoot,
    resolvedPath: current,
  };
}

export function resolveConfinedReadPath(
  rootDir: string,
  relPath: string,
  outsideErrorCode: WorkspaceErrorCode = 'PATH_OUTSIDE_WORKSPACE',
): {
  readonly normalizedRelPath: string;
  readonly realRoot: string;
  readonly resolvedPath: string;
  readonly sizeBytes: number;
} {
  const segments = normalizePosixRelativeSegments(relPath, outsideErrorCode);
  const normalizedRelPath = segments.join('/');
  const missingRootCode = outsideErrorCode === 'PATH_OUTSIDE_SOURCE'
    ? 'SOURCE_UNAVAILABLE'
    : 'WORKSPACE_NOT_FOUND';
  const realRoot = resolveExistingRealDir(rootDir, missingRootCode);

  const candidate = path.resolve(realRoot, normalizedRelPath);
  if (!isWithinRealRoot(realRoot, candidate) || candidate === realRoot) {
    throw new WorkspaceError(
      outsideErrorCode,
      `Path '${relPath}' escapes root directory.`,
      { path: relPath },
    );
  }

  let current = realRoot;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    current = path.resolve(current, segment);
    if (!isWithinRealRoot(realRoot, current) || current === realRoot) {
      throw new WorkspaceError(
        outsideErrorCode,
        `Path '${relPath}' escapes root directory.`,
        { path: relPath },
      );
    }

    const segLstat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!segLstat) {
      throw new WorkspaceError(
        'FILE_NOT_FOUND',
        `File '${relPath}' does not exist.`,
        { path: relPath },
      );
    }
    if (segLstat.isSymbolicLink()) {
      let realSeg: string;
      try {
        realSeg = fs.realpathSync(current);
      } catch {
        throw new WorkspaceError(
          'FILE_NOT_FOUND',
          `File '${relPath}' cannot be resolved on disk (dangling symlink).`,
          { path: relPath },
        );
      }
      if (!isWithinRealRoot(realRoot, realSeg)) {
        throw new WorkspaceError(
          outsideErrorCode,
          `Symlink '${relPath}' escapes root directory.`,
          { path: relPath },
        );
      }
      const segTargetStat = fs.statSync(realSeg, { throwIfNoEntry: false });
      if (!segTargetStat || !segTargetStat.isDirectory()) {
        throw new WorkspaceError(
          'FILE_NOT_FOUND',
          `File '${relPath}' does not exist.`,
          { path: relPath },
        );
      }
      current = realSeg;
    } else if (!segLstat.isDirectory()) {
      throw new WorkspaceError(
        'FILE_NOT_FOUND',
        `File '${relPath}' does not exist.`,
        { path: relPath },
      );
    }
  }

  const leafCandidate = path.resolve(current, segments[segments.length - 1]!);
  if (!isWithinRealRoot(realRoot, leafCandidate) || leafCandidate === realRoot) {
    throw new WorkspaceError(
      outsideErrorCode,
      `Path '${relPath}' escapes root directory.`,
      { path: relPath },
    );
  }

  const lstat = fs.lstatSync(leafCandidate, { throwIfNoEntry: false });
  if (!lstat) {
    throw new WorkspaceError(
      'FILE_NOT_FOUND',
      `File '${relPath}' does not exist.`,
      { path: relPath },
    );
  }

  let realTarget: string;
  try {
    realTarget = fs.realpathSync(leafCandidate);
  } catch {
    throw new WorkspaceError(
      'FILE_NOT_FOUND',
      `File '${relPath}' cannot be resolved on disk (dangling symlink).`,
      { path: relPath },
    );
  }

  if (!isWithinRealRoot(realRoot, realTarget) || realTarget === realRoot) {
    throw new WorkspaceError(
      outsideErrorCode,
      `Symlink '${relPath}' escapes root directory.`,
      { path: relPath },
    );
  }

  const stat = fs.statSync(realTarget, { throwIfNoEntry: false });
  if (!stat || !stat.isFile()) {
    throw new WorkspaceError(
      'INVALID_INPUT',
      `Path '${relPath}' is not a regular file.`,
      { path: relPath },
    );
  }

  return {
    normalizedRelPath,
    realRoot,
    resolvedPath: realTarget,
    sizeBytes: stat.size,
  };
}

export function sha256Prefixed(data: Uint8Array | string): string {
  const hex = crypto.createHash('sha256').update(data).digest('hex');
  return `sha256:${hex}`;
}

export function walkSourceFiles(rootDir: string): SnapshotFileEntry[] {
  const realRoot = resolveExistingRealDir(rootDir, 'SOURCE_UNAVAILABLE');
  const visitedRealDirs = new Set<string>([realRoot]);
  const deferredSymlinks: Array<{ readonly full: string; readonly rel: string }> = [];
  const out: SnapshotFileEntry[] = [];

  const visitRealDir = (currentDir: string, relPrefix: string): void => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const ent of entries) {
      if (SKIPPED_DIR_NAMES.has(ent.name)) continue;
      const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
      const full = path.join(currentDir, ent.name);
      const lstat = fs.lstatSync(full, { throwIfNoEntry: false });
      if (!lstat) continue;

      if (lstat.isSymbolicLink()) {
        deferredSymlinks.push({ full, rel });
        continue;
      }

      if (lstat.isDirectory()) {
        const realSubdir = fs.realpathSync(full);
        if (!isWithinRealRoot(realRoot, realSubdir)) continue;
        if (visitedRealDirs.has(realSubdir)) continue;
        visitedRealDirs.add(realSubdir);
        visitRealDir(realSubdir, rel);
      } else if (lstat.isFile()) {
        const bytes = fs.readFileSync(full);
        out.push({
          rel,
          sha256: sha256Prefixed(bytes),
          size_bytes: bytes.byteLength,
        });
      }
    }
  };

  // Phase 1: walk canonical non-symlink directories and files first so real paths
  // always populate visitedRealDirs before any intra-source symlink aliases.
  visitRealDir(realRoot, '');

  // Phase 2: process deferred symlinks in deterministic code-point order.
  deferredSymlinks.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  while (deferredSymlinks.length > 0) {
    const item = deferredSymlinks.shift()!;
    let targetReal: string;
    try {
      targetReal = fs.realpathSync(item.full);
    } catch {
      // Dangling symlink: skip safely without crashing snapshot/refresh.
      continue;
    }
    if (!isWithinRealRoot(realRoot, targetReal)) {
      continue;
    }
    const relTarget = path.relative(realRoot, targetReal).replace(/\\/g, '/');
    if (relTarget.split('/').some((seg) => SKIPPED_DIR_NAMES.has(seg))) {
      continue;
    }
    const targetStat = fs.statSync(targetReal, { throwIfNoEntry: false });
    if (!targetStat) continue;
    if (targetStat.isDirectory()) {
      if (visitedRealDirs.has(targetReal)) continue;
      visitedRealDirs.add(targetReal);
      visitRealDir(targetReal, item.rel);
    } else if (targetStat.isFile()) {
      const bytes = fs.readFileSync(targetReal);
      out.push({
        rel: item.rel,
        sha256: sha256Prefixed(bytes),
        size_bytes: bytes.byteLength,
      });
    }
  }

  out.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return out;
}

export function atomicWriteFile(targetPath: string, contentBuffer: Buffer): void {
  const parentDir = path.dirname(targetPath);
  fs.mkdirSync(parentDir, { recursive: true });

  const existingLstat = fs.lstatSync(targetPath, { throwIfNoEntry: false });
  if (existingLstat?.isSymbolicLink()) {
    throw new WorkspaceError(
      'PATH_OUTSIDE_SOURCE',
      `Target '${targetPath}' became a symbolic link prior to write.`,
      { target_path: targetPath },
    );
  }

  const tmpPath = path.join(
    parentDir,
    `.opl-wb-${process.pid}-${crypto.randomUUID()}.tmp`,
  );

  let fd: number | null = null;
  let renamed = false;
  try {
    fd = fs.openSync(tmpPath, 'wx', 0o600);
    let offset = 0;
    while (offset < contentBuffer.byteLength) {
      const written = fs.writeSync(fd, contentBuffer, offset, contentBuffer.byteLength - offset);
      offset += written;
    }
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, targetPath);
    renamed = true;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore close failure on cleanup
      }
    }
    if (!renamed) {
      try {
        fs.rmSync(tmpPath, { force: true });
      } catch {
        // ignore temp cleanup failure
      }
    }
  }
}
