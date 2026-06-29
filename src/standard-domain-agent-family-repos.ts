import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFamilyWorkspaceRootFromRepoRoot } from './family-workspace-root.ts';

interface StandardDomainAgentRepoInput {
  requested_agent_id: string | null;
  repo_dir: string;
}

export const DEFAULT_FAMILY_REPOS = [
  { requested_agent_id: 'mas', directory: 'med-autoscience' },
  { requested_agent_id: 'mag', directory: 'med-autogrant' },
  { requested_agent_id: 'rca', directory: 'redcube-ai' },
  { requested_agent_id: 'opl-meta-agent', directory: 'opl-meta-agent' },
  { requested_agent_id: 'opl-bookforge', directory: 'opl-bookforge' },
  { requested_agent_id: 'opl-scholarskills', directory: 'opl-scholarskills' },
] as const;

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const OPL_REPO_ROOT = path.resolve(SOURCE_DIR, '..');

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function hasDefaultFamilyConformanceSurface(repoDir: string) {
  return fs.existsSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'))
    || fs.existsSync(path.join(repoDir, 'contracts', 'scholar-skills-capability-modules.json'));
}

function workspaceCandidatesFrom(seed: string) {
  const resolvedSeed = path.resolve(seed);
  const candidates = [resolvedSeed, path.dirname(resolvedSeed), resolveFamilyWorkspaceRootFromRepoRoot(resolvedSeed)];
  let current = resolvedSeed;
  while (current !== path.dirname(current)) {
    if (path.basename(current) === '.worktrees') {
      candidates.push(resolveFamilyWorkspaceRootFromRepoRoot(seed));
    }
    current = path.dirname(current);
  }
  return candidates;
}

export function defaultFamilyRepoInputs(): StandardDomainAgentRepoInput[] {
  const configuredWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT?.trim();
  const workspaceRoots = unique([
    ...(configuredWorkspaceRoot
      ? [configuredWorkspaceRoot]
      : [
          ...workspaceCandidatesFrom(process.cwd()),
          ...workspaceCandidatesFrom(OPL_REPO_ROOT),
        ]),
  ].map((entry) => path.resolve(entry)));

  const repos: StandardDomainAgentRepoInput[] = [];
  for (const workspaceRoot of workspaceRoots) {
    for (const repo of DEFAULT_FAMILY_REPOS) {
      const repoDir = path.join(workspaceRoot, repo.directory);
      if (
        hasDefaultFamilyConformanceSurface(repoDir)
        && !repos.some((entry) => path.resolve(entry.repo_dir) === path.resolve(repoDir))
      ) {
        repos.push({
          requested_agent_id: repo.requested_agent_id,
          repo_dir: repoDir,
        });
      }
    }
  }
  return repos;
}
