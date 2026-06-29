import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FAMILY_REPO_DIRECTORIES = [
  'one-person-lab',
  'med-autoscience',
  'med-autogrant',
  'redcube-ai',
  'opl-meta-agent',
  'opl-bookforge',
  'opl-scholarskills',
] as const;

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

function isFamilyRepoDirectoryName(directoryName: string) {
  return FAMILY_REPO_DIRECTORIES.includes(directoryName as typeof FAMILY_REPO_DIRECTORIES[number]);
}

export function resolveFamilyWorkspaceRootFromRepoRoot(repoRoot: string) {
  let current = path.resolve(repoRoot);

  while (true) {
    const baseName = path.basename(current);
    if (baseName === '.worktrees' || baseName === 'worktrees') {
      const parent = path.dirname(current);
      return isFamilyRepoDirectoryName(path.basename(parent))
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

  return resolveFamilyWorkspaceRootFromRepoRoot(resolveRepoRootPath(options));
}
