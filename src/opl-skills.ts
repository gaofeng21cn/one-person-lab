import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { GatewayContractError } from './contracts.ts';
import { resolveFrontDeskStatePaths } from './frontdesk-state.ts';

type SkillPackInstallerKind = 'bash' | 'node';

type SkillPackSpec = {
  domain_id: 'medautoscience' | 'medautogrant' | 'redcube';
  project: string;
  label: string;
  plugin_name: string;
  canonical_plugin_name: 'mas' | 'mag' | 'rca';
  installer_kind: SkillPackInstallerKind;
  installer_relative_path: string;
};

type InspectFamilySkillPack = {
  domain_id: string;
  project: string;
  label: string;
  plugin_name: string;
  canonical_plugin_name: string;
  repo_root: string;
  repo_found: boolean;
  plugin_manifest_path: string;
  plugin_manifest_found: boolean;
  skill_entry_path: string;
  skill_entry_found: boolean;
  installer_path: string;
  installer_found: boolean;
  ready_to_sync: boolean;
  installer_kind: SkillPackInstallerKind;
  command_preview: string[];
};

type SyncFamilySkillPack = InspectFamilySkillPack & {
  sync_status: 'synced' | 'skipped';
  installer_result: Record<string, unknown> | null;
  stdout: string;
  stderr: string;
};

type ReadFamilySkillPacksOptions = {
  domains?: string[];
};

type SyncFamilySkillPacksOptions = ReadFamilySkillPacksOptions & {
  home?: string;
};

const FAMILY_SKILL_PACK_SPECS: SkillPackSpec[] = [
  {
    domain_id: 'medautoscience',
    project: 'med-autoscience',
    label: 'Med Auto Science',
    plugin_name: 'med-autoscience',
    canonical_plugin_name: 'mas',
    installer_kind: 'bash',
    installer_relative_path: path.join('scripts', 'install-codex-plugin.sh'),
  },
  {
    domain_id: 'medautogrant',
    project: 'med-autogrant',
    label: 'Med Auto Grant',
    plugin_name: 'med-autogrant',
    canonical_plugin_name: 'mag',
    installer_kind: 'bash',
    installer_relative_path: path.join('scripts', 'install-codex-plugin.sh'),
  },
  {
    domain_id: 'redcube',
    project: 'redcube-ai',
    label: 'RedCube AI',
    plugin_name: 'redcube-ai',
    canonical_plugin_name: 'rca',
    installer_kind: 'node',
    installer_relative_path: path.join('scripts', 'install-codex-plugin.mjs'),
  },
];

const DOMAIN_ALIAS_MAP = new Map<string, SkillPackSpec['domain_id']>([
  ['mas', 'medautoscience'],
  ['medautoscience', 'medautoscience'],
  ['med-autoscience', 'medautoscience'],
  ['med_auto_science', 'medautoscience'],
  ['mag', 'medautogrant'],
  ['medautogrant', 'medautogrant'],
  ['med-autogrant', 'medautogrant'],
  ['med_auto_grant', 'medautogrant'],
  ['rca', 'redcube'],
  ['redcube', 'redcube'],
  ['redcube-ai', 'redcube'],
  ['redcube_ai', 'redcube'],
]);

type ResolveFamilyWorkspaceRootOptions = {
  repoRootHint?: string;
};

function isDirectory(filePath: string) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
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

function resolveManagedModulesRoot() {
  const explicitRoot = normalizeOptionalString(process.env.OPL_MODULES_ROOT);
  if (explicitRoot) {
    return path.resolve(explicitRoot);
  }

  return path.join(resolveFrontDeskStatePaths().state_dir, 'modules');
}

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeDomainSelection(domains: string[] | undefined) {
  if (!domains || domains.length === 0) {
    return null;
  }

  const normalized = new Set<SkillPackSpec['domain_id']>();
  for (const domain of domains) {
    const key = domain.trim().toLowerCase();
    const resolved = DOMAIN_ALIAS_MAP.get(key);
    if (!resolved) {
      throw new GatewayContractError(
        'cli_usage_error',
        `Unknown skill pack domain: ${domain}.`,
        {
          domain,
          allowed_domains: [...new Set(DOMAIN_ALIAS_MAP.keys())].sort(),
        },
      );
    }
    normalized.add(resolved);
  }

  return normalized;
}

function resolveRepoRoot(spec: SkillPackSpec) {
  const envKey = `OPL_${spec.domain_id.toUpperCase()}_REPO_ROOT`;
  const envValue = normalizeOptionalString(process.env[envKey]);
  if (envValue) {
    return path.resolve(envValue);
  }

  const managedRepoRoot = path.join(resolveManagedModulesRoot(), spec.project);
  if (isDirectory(managedRepoRoot)) {
    return managedRepoRoot;
  }

  const siblingRepoRoot = path.join(resolveDefaultFamilyWorkspaceRoot(), spec.project);
  if (isDirectory(siblingRepoRoot)) {
    return siblingRepoRoot;
  }

  return managedRepoRoot;
}

function buildPluginManifestPath(spec: SkillPackSpec, repoRoot: string) {
  return resolveFirstExistingPath([
    path.join(repoRoot, 'plugins', spec.canonical_plugin_name, '.codex-plugin', 'plugin.json'),
    path.join(repoRoot, 'plugins', spec.plugin_name, '.codex-plugin', 'plugin.json'),
  ]);
}

function buildSkillEntryPath(spec: SkillPackSpec, repoRoot: string) {
  return resolveFirstExistingPath([
    path.join(repoRoot, 'plugins', spec.canonical_plugin_name, 'skills', spec.canonical_plugin_name, 'SKILL.md'),
    path.join(repoRoot, 'plugins', spec.plugin_name, 'skills', spec.plugin_name, 'SKILL.md'),
  ]);
}

function buildInstallerPath(spec: SkillPackSpec, repoRoot: string) {
  return path.join(repoRoot, spec.installer_relative_path);
}

function resolveFirstExistingPath(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function buildInstallerCommandPreview(
  spec: SkillPackSpec,
  repoRoot: string,
  home?: string,
) {
  const installerPath = buildInstallerPath(spec, repoRoot);
  const sharedArgs = ['--repo-root', repoRoot];
  if (home) {
    sharedArgs.push('--home', home);
  }

  if (spec.installer_kind === 'bash') {
    return ['bash', installerPath, ...sharedArgs, '--skip-tools'];
  }

  return ['node', installerPath, ...sharedArgs];
}

function maybeParseJsonRecord(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function inspectFamilySkillPack(spec: SkillPackSpec): InspectFamilySkillPack {
  return inspectFamilySkillPackAtRepoRoot(spec, resolveRepoRoot(spec));
}

function inspectFamilySkillPackAtRepoRoot(
  spec: SkillPackSpec,
  repoRoot: string,
): InspectFamilySkillPack {
  const repoFound = fs.existsSync(repoRoot) && fs.statSync(repoRoot).isDirectory();
  const pluginManifestPath = buildPluginManifestPath(spec, repoRoot);
  const skillEntryPath = buildSkillEntryPath(spec, repoRoot);
  const installerPath = buildInstallerPath(spec, repoRoot);
  const pluginManifestFound = fs.existsSync(pluginManifestPath) && fs.statSync(pluginManifestPath).isFile();
  const skillEntryFound = fs.existsSync(skillEntryPath) && fs.statSync(skillEntryPath).isFile();
  const installerFound = fs.existsSync(installerPath) && fs.statSync(installerPath).isFile();

  return {
    domain_id: spec.domain_id,
    project: spec.project,
    label: spec.label,
    plugin_name: spec.plugin_name,
    canonical_plugin_name: spec.canonical_plugin_name,
    repo_root: repoRoot,
    repo_found: repoFound,
    plugin_manifest_path: pluginManifestPath,
    plugin_manifest_found: pluginManifestFound,
    skill_entry_path: skillEntryPath,
    skill_entry_found: skillEntryFound,
    installer_path: installerPath,
    installer_found: installerFound,
    ready_to_sync: repoFound && pluginManifestFound && skillEntryFound && installerFound,
    installer_kind: spec.installer_kind,
    command_preview: buildInstallerCommandPreview(spec, repoRoot),
  };
}

function runInstaller(
  inspected: InspectFamilySkillPack,
  home?: string,
): SyncFamilySkillPack {
  if (!inspected.ready_to_sync) {
    return {
      ...inspected,
      sync_status: 'skipped',
      installer_result: null,
      stdout: '',
      stderr: '',
    };
  }

  const commandPreview = buildInstallerCommandPreview(
    FAMILY_SKILL_PACK_SPECS.find((item) => item.domain_id === inspected.domain_id)!,
    inspected.repo_root,
    home,
  );
  const [command, ...args] = commandPreview;
  const result = spawnSync(command, args, {
    cwd: inspected.repo_root,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) {
    throw new GatewayContractError(
      'build_command_failed',
      `Failed to launch skill pack installer for ${inspected.domain_id}.`,
      {
        domain_id: inspected.domain_id,
        repo_root: inspected.repo_root,
        command: commandPreview,
        cause: result.error.message,
      },
    );
  }

  if ((result.status ?? 1) !== 0) {
    throw new GatewayContractError(
      'build_command_failed',
      `Skill pack installer failed for ${inspected.domain_id}.`,
      {
        domain_id: inspected.domain_id,
        repo_root: inspected.repo_root,
        command: commandPreview,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      },
    );
  }

  return {
    ...inspected,
    sync_status: 'synced',
    installer_result: maybeParseJsonRecord(result.stdout ?? ''),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export function syncFamilySkillPackFromRepoRoot(
  domainId: SkillPackSpec['domain_id'],
  repoRoot: string,
  options: Partial<{
    home: string;
  }> = {},
) {
  const spec = FAMILY_SKILL_PACK_SPECS.find((entry) => entry.domain_id === domainId);
  if (!spec) {
    throw new GatewayContractError(
      'cli_usage_error',
      `Unknown skill pack domain: ${domainId}.`,
      {
        domain_id: domainId,
        allowed_domains: FAMILY_SKILL_PACK_SPECS.map((entry) => entry.domain_id),
      },
    );
  }

  return runInstaller(
    inspectFamilySkillPackAtRepoRoot(spec, path.resolve(repoRoot)),
    normalizeOptionalString(options.home) ?? undefined,
  );
}

export function readFamilySkillPacks(options: ReadFamilySkillPacksOptions = {}) {
  const selectedDomains = normalizeDomainSelection(options.domains);
  const packs = FAMILY_SKILL_PACK_SPECS
    .filter((spec) => !selectedDomains || selectedDomains.has(spec.domain_id))
    .map((spec) => inspectFamilySkillPack(spec));

  return {
    version: 'g2',
    skill_catalog: {
      surface_id: 'opl_skill_catalog',
      workspace_root: resolveDefaultFamilyWorkspaceRoot(),
      packs,
      summary: {
        total: packs.length,
        ready_to_sync: packs.filter((entry) => entry.ready_to_sync).length,
        repo_found: packs.filter((entry) => entry.repo_found).length,
      },
    },
  };
}

export function syncFamilySkillPacks(options: SyncFamilySkillPacksOptions = {}) {
  const selectedDomains = normalizeDomainSelection(options.domains);
  const resolvedHome = normalizeOptionalString(options.home) ?? null;
  const inspectedPacks = FAMILY_SKILL_PACK_SPECS
    .filter((spec) => !selectedDomains || selectedDomains.has(spec.domain_id))
    .map((spec) => inspectFamilySkillPack(spec));
  const packs = inspectedPacks.map((inspected) => runInstaller(inspected, resolvedHome ?? undefined));

  return {
    version: 'g2',
    skill_sync: {
      surface_id: 'opl_skill_sync',
      workspace_root: resolveDefaultFamilyWorkspaceRoot(),
      home: resolvedHome ?? process.env.HOME ?? null,
      packs,
      summary: {
        total: packs.length,
        synced: packs.filter((entry) => entry.sync_status === 'synced').length,
        skipped: packs.filter((entry) => entry.sync_status === 'skipped').length,
      },
    },
  };
}
