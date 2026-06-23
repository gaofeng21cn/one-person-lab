import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { developerModePrefersLocalCheckouts } from '../developer-mode-source-policy.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../family-workspace-root.ts';
import { resolveOplStatePaths } from '../runtime-state-paths.ts';
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

export function resolveGeneratedPluginRootForName(canonicalPluginName: string, home?: string) {
  return path.join(
    resolveOplStateDirForHome(home),
    'generated-codex-plugins',
    `${canonicalPluginName}-local`,
    'plugins',
    canonicalPluginName,
  );
}

export function resolveRepoRoot(spec: SkillPackSpec) {
  if (spec.domain_id === 'scholarskills') {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  }

  const envKey = `OPL_${spec.domain_id.toUpperCase()}_REPO_ROOT`;
  const envValue = normalizeOptionalString(process.env[envKey]);
  if (envValue) {
    return path.resolve(envValue);
  }

  const siblingRepoRoot = path.join(resolveDefaultFamilyWorkspaceRoot(), spec.project);
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
  if (spec.source_kind === 'opl_generated_plugin_surface') {
    return path.join(
      resolveGeneratedPluginRootForName(spec.canonical_plugin_name),
      '.codex-plugin',
      'plugin.json',
    );
  }

  return resolveFirstExistingPath([
    path.join(repoRoot, '.codex-plugin', 'plugin.json'),
    path.join(repoRoot, 'plugins', spec.canonical_plugin_name, '.codex-plugin', 'plugin.json'),
    path.join(repoRoot, 'plugins', spec.plugin_name, '.codex-plugin', 'plugin.json'),
  ]);
}

export function buildSkillEntryPath(spec: SkillPackSpec, repoRoot: string) {
  if (spec.source_kind === 'opl_generated_plugin_surface') {
    return path.join(
      resolveGeneratedPluginRootForName(spec.canonical_plugin_name),
      'skills',
      spec.canonical_plugin_name,
      'SKILL.md',
    );
  }

  return resolveFirstExistingPath([
    path.join(repoRoot, 'plugins', spec.canonical_plugin_name, 'skills', spec.canonical_plugin_name, 'SKILL.md'),
    path.join(repoRoot, 'plugins', spec.plugin_name, 'skills', spec.plugin_name, 'SKILL.md'),
  ]);
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
  if (spec.source_kind === 'opl_generated_plugin_surface') {
    return ['opl', 'agents', 'interfaces', '--repo-dir', repoRoot, '--format', 'skill'];
  }

  return ['opl', 'connect', 'sync-skills', '--domain', spec.domain_id];
}
