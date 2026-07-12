import fs from 'node:fs';
import path from 'node:path';

import { developerModePrefersLocalCheckouts } from '../developer-mode-source-policy.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../../workspace/index.ts';
import { resolveOplStatePaths } from '../../../kernel/runtime-state-paths.ts';
import type { SkillPackSpec } from './registry.ts';

export function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isDirectory(filePath: string) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}

function resolveManagedModulesRoot() {
  const explicitRoot = normalizeOptionalString(process.env.OPL_MODULES_ROOT);
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  return path.join(resolveOplStatePaths().state_dir, 'modules');
}

export function resolveCodexHome(home: string) {
  return normalizeOptionalString(process.env.CODEX_HOME) ?? path.join(home, '.codex');
}

function resolveOplStateDirForHome(home?: string) {
  const explicitStateDir = normalizeOptionalString(process.env.OPL_STATE_DIR);
  if (explicitStateDir) {
    return path.resolve(explicitStateDir);
  }
  if (home) {
    return path.join(path.resolve(home), 'Library', 'Application Support', 'OPL', 'state');
  }
  return resolveOplStatePaths().state_dir;
}

export function resolveMaterializedPluginRootForName(pluginName: string, home?: string) {
  return path.join(
    resolveOplStateDirForHome(home),
    'codex-plugin-carriers',
    `${pluginName}-local`,
    'plugins',
    pluginName,
  );
}

export function resolveRepoRoot(spec: SkillPackSpec) {
  const envKey = `OPL_${spec.domain_id.toUpperCase()}_REPO_ROOT`;
  const envValue = normalizeOptionalString(process.env[envKey]);
  if (envValue) {
    return path.resolve(envValue);
  }

  const siblingRepoRoot = path.join(resolveDefaultFamilyWorkspaceRoot(), spec.project);
  if (spec.domain_id === 'scholarskills') {
    const canonicalRepoRoot = normalizeOptionalString(process.env.OPL_MAS_SCHOLAR_SKILLS_REPO_ROOT);
    if (canonicalRepoRoot) {
      return path.resolve(canonicalRepoRoot);
    }
    const modulePathValue = normalizeOptionalString(process.env.OPL_MODULE_PATH_SCHOLARSKILLS)
      ?? normalizeOptionalString(process.env.OPL_MODULE_PATH_MAS_SCHOLAR_SKILLS);
    if (modulePathValue) {
      return path.resolve(modulePathValue);
    }
    const managedRepoRoot = path.join(resolveManagedModulesRoot(), spec.project);
    if (developerModePrefersLocalCheckouts() && isDirectory(siblingRepoRoot)) {
      return siblingRepoRoot;
    }
    if (isDirectory(managedRepoRoot)) {
      return managedRepoRoot;
    }
    if (isDirectory(siblingRepoRoot)) {
      return siblingRepoRoot;
    }
    return managedRepoRoot;
  }

  const gitCheckoutSourceMode = normalizeOptionalString(process.env.OPL_MODULE_SOURCE_MODE) === 'git_checkout'
    || developerModePrefersLocalCheckouts();
  if (gitCheckoutSourceMode && isDirectory(siblingRepoRoot)) {
    return siblingRepoRoot;
  }

  const managedRepoRoot = path.join(resolveManagedModulesRoot(), spec.project);
  if (isDirectory(managedRepoRoot)) {
    return managedRepoRoot;
  }

  const modulePathValue = normalizeOptionalString(process.env[`OPL_MODULE_PATH_${spec.module_id}`]);
  if (modulePathValue) {
    return path.resolve(modulePathValue);
  }

  if (isDirectory(siblingRepoRoot)) {
    return siblingRepoRoot;
  }

  return managedRepoRoot;
}

export function buildPluginManifestPath(spec: SkillPackSpec, repoRoot: string) {
  if (spec.source_kind === 'opl_standard_codex_carrier') {
    return path.join(
      repoRoot,
      'plugins',
      spec.plugin_name,
      '.codex-plugin',
      'plugin.json',
    );
  }

  return path.join(repoRoot, '.codex-plugin', 'plugin.json');
}

export function buildSkillEntryPath(spec: SkillPackSpec, repoRoot: string) {
  if (spec.source_kind === 'opl_standard_codex_carrier') {
    return path.join(repoRoot, 'agent', 'primary_skill', 'SKILL.md');
  }

  return path.join(repoRoot, 'skills', spec.canonical_plugin_name, 'SKILL.md');
}

export function buildStandardPluginCarrierSkillPath(spec: SkillPackSpec, repoRoot: string) {
  return path.join(repoRoot, 'plugins', spec.plugin_name, 'skills', spec.plugin_name, 'SKILL.md');
}

export function buildInstallerPath(spec: SkillPackSpec, repoRoot: string) {
  if (spec.installer_relative_paths.length === 0) {
    return '';
  }
  return resolveFirstExistingPath(spec.installer_relative_paths.map((relativePath) => path.join(repoRoot, relativePath)));
}

function resolveFirstExistingPath(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

export function buildPluginSourcePath(pluginManifestPath: string) {
  return path.dirname(path.dirname(pluginManifestPath));
}

export function buildInstallerCommandPreview(
  spec: SkillPackSpec,
  repoRoot: string,
  _home?: string,
) {
  const publicDomainId = spec.domain_id === 'scholarskills'
    ? 'mas-scholar-skills'
    : spec.domain_id;
  if (spec.domain_id === 'scholarskills') {
    return [
      'opl',
      'packages',
      'activate',
      'mas',
      '--scope',
      'workspace',
      '--target-workspace',
      '<workspace-root>',
    ];
  }

  return ['opl', 'connect', 'sync-skills', '--domain', publicDomainId];
}
