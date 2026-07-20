import fs from 'node:fs';
import path from 'node:path';

function resolveContainedRepoPathByKind(
  repoDir: string,
  ref: string,
  label: string,
  containerLabel: string,
  pathKind: string,
) {
  if (!ref.trim() || path.isAbsolute(ref) || ref.includes('\0') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) {
    throw new Error(`${label} must be a repo-relative local ${pathKind}: ${ref}`);
  }
  const repoRoot = fs.realpathSync.native(repoDir);
  const resolved = path.resolve(repoRoot, ref);
  let realPath: string;
  try {
    realPath = fs.realpathSync.native(resolved);
  } catch {
    throw new Error(`${label} does not exist: ${ref}`);
  }
  const relative = path.relative(repoRoot, realPath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes its ${containerLabel}: ${ref}`);
  }
  return {
    real_path: realPath,
    repo_relative_ref: relative.split(path.sep).join('/'),
  };
}

export function resolveContainedRepoPath(
  repoDir: string,
  ref: string,
  label: string,
  containerLabel = 'repo',
) {
  return resolveContainedRepoPathByKind(repoDir, ref, label, containerLabel, 'path');
}

export function resolveContainedRepoJsonFile(
  repoDir: string,
  ref: string,
  label: string,
  containerLabel = 'repo',
) {
  const resolved = resolveContainedRepoPathByKind(repoDir, ref, label, containerLabel, 'JSON path');
  if (path.extname(resolved.real_path).toLowerCase() !== '.json') {
    throw new Error(`${label} must reference a repo-local JSON file: ${ref}`);
  }
  return resolved;
}
