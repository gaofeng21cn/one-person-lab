import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type ResolveFamilyWorkspaceRootOptions = {
  repoRootHint?: string;
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

  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export function resolveFamilyWorkspaceRootFromRepoRoot(repoRoot: string) {
  let current = path.resolve(repoRoot);

  while (true) {
    const baseName = path.basename(current);
    if (baseName === '.worktrees' || baseName === 'worktrees') {
      return path.dirname(path.dirname(current));
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

  return resolveFamilyWorkspaceRootFromRepoRoot(resolveRepoRootPath(options));
}
