import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ResolveFamilyWorkspaceRootOptions = {
  repoRootHint?: string;
  familyRepoDirectories?: readonly string[];
};

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function resolveRepoRootPath(options: ResolveFamilyWorkspaceRootOptions = {}) {
  const repoRootHint = normalizeOptionalString(options.repoRootHint);
  if (repoRootHint) {
    return path.resolve(repoRootHint);
  }

  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
}

function currentRepoDirectory(repoRoot: string) {
  const gitMetadata = path.join(repoRoot, '.git');
  if (fs.existsSync(gitMetadata) && fs.statSync(gitMetadata).isFile()) {
    const gitDir = fs.readFileSync(gitMetadata, 'utf8').trim().replace(/^gitdir:\s*/, '');
    const markerIndex = gitDir.lastIndexOf(`${path.sep}.git${path.sep}`);
    if (markerIndex > 0) {
      return path.basename(gitDir.slice(0, markerIndex));
    }
  }
  return path.basename(repoRoot);
}

export function resolveFamilyWorkspaceRootFromRepoRoot(
  repoRoot: string,
  familyRepoDirectories: readonly string[] = [],
) {
  let current = path.resolve(repoRoot);

  while (true) {
    const baseName = path.basename(current);
    if (baseName === '.worktrees' || baseName === 'worktrees') {
      const parent = path.dirname(current);
      return familyRepoDirectories.includes(path.basename(parent))
        ? path.dirname(parent)
        : parent;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.dirname(path.resolve(repoRoot));
    }
    current = parent;
  }
}

export function resolveDefaultFamilyWorkspaceRoot(options: ResolveFamilyWorkspaceRootOptions = {}) {
  const configuredWorkspaceRoot = normalizeOptionalString(process.env.OPL_FAMILY_WORKSPACE_ROOT);
  if (configuredWorkspaceRoot) {
    return path.resolve(configuredWorkspaceRoot);
  }

  const repoRoot = resolveRepoRootPath(options);
  return resolveFamilyWorkspaceRootFromRepoRoot(repoRoot, [
    currentRepoDirectory(repoRoot),
    ...(options.familyRepoDirectories ?? []),
  ]);
}
