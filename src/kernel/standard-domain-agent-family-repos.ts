import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDefaultFamilyWorkspaceRoot } from './family-workspace-root.ts';

export interface StandardDomainAgentRepoInput {
  requested_agent_id: string | null;
  repo_dir: string;
}

export type FamilyRepoDefault = {
  requested_agent_id: string;
  directory: string;
};

const SOURCE_DIR = path.dirname(fileURLToPath(import.meta.url));
const OPL_REPO_ROOT = path.resolve(SOURCE_DIR, '../..');

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function hasDefaultFamilyConformanceSurface(repoDir: string) {
  return fs.existsSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'))
    || fs.existsSync(path.join(repoDir, 'contracts', 'scholar-skills-capability-modules.json'));
}

export function hasStandardDomainAgentSurface(repoDir: string) {
  return fs.existsSync(path.join(repoDir, 'contracts', 'domain_descriptor.json'));
}

function workspaceCandidatesFrom(seed: string, repoDefaults: readonly FamilyRepoDefault[]) {
  const resolvedSeed = path.resolve(seed);
  const repoDirectories = repoDefaults.map((entry) => entry.directory);
  return [
    resolvedSeed,
    path.dirname(resolvedSeed),
    resolveDefaultFamilyWorkspaceRoot({
      repoRootHint: resolvedSeed,
      familyRepoDirectories: repoDirectories,
    }),
  ];
}

export function discoverFamilyRepoInputs(
  repoDefaults: readonly FamilyRepoDefault[],
  hasSurface: (repoDir: string) => boolean,
): StandardDomainAgentRepoInput[] {
  const configuredWorkspaceRoot = process.env.OPL_FAMILY_WORKSPACE_ROOT?.trim();
  const workspaceRoots = unique([
    ...(configuredWorkspaceRoot
      ? [configuredWorkspaceRoot]
      : [
          ...workspaceCandidatesFrom(process.cwd(), repoDefaults),
          ...workspaceCandidatesFrom(OPL_REPO_ROOT, repoDefaults),
        ]),
  ].map((entry) => path.resolve(entry)));

  const repos: StandardDomainAgentRepoInput[] = [];
  for (const workspaceRoot of workspaceRoots) {
    for (const repo of repoDefaults) {
      const repoDir = path.join(workspaceRoot, repo.directory);
      if (
        hasSurface(repoDir)
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
