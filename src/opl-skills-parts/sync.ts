import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { resolveDefaultFamilyWorkspaceRoot } from '../family-workspace-root.ts';
import type {
  InspectFamilySkillPack,
  SkillPackSyncScope,
  SkillPackTargetProject,
  SyncFamilySkillPack,
} from './registry.ts';

type GeneratedCodexPluginSurface = {
  plugin_root: string;
  [key: string]: unknown;
};

type RunSkillPackInstallerOptions = {
  home?: string;
  scope: SkillPackSyncScope;
  targetProject?: SkillPackTargetProject | null;
  resolveCodexHome: (home: string) => string;
  writeGeneratedPluginSurface: (
    inspected: InspectFamilySkillPack,
    home?: string,
  ) => GeneratedCodexPluginSurface | null;
};

function resolveHome(home?: string) {
  return home ? path.resolve(home) : (process.env.HOME ?? null);
}

function syncCodexSkillMirror(
  inspected: InspectFamilySkillPack,
  options: Pick<RunSkillPackInstallerOptions, 'home' | 'resolveCodexHome'>,
) {
  if (!inspected.skill_entry_found || !inspected.skill_entry_valid) {
    return null;
  }

  const resolvedHome = resolveHome(options.home);
  if (!resolvedHome) {
    return null;
  }

  const codexSkillDir = path.join(
    options.resolveCodexHome(resolvedHome),
    'skills',
    inspected.canonical_plugin_name,
  );

  if (['mas', 'mag', 'rca'].includes(inspected.canonical_plugin_name)) {
    fs.rmSync(codexSkillDir, { recursive: true, force: true });
    return null;
  }

  fs.rmSync(codexSkillDir, { recursive: true, force: true });
  fs.cpSync(path.dirname(inspected.skill_entry_path), codexSkillDir, { recursive: true });

  return {
    skill_root: codexSkillDir,
    skill_entry_path: path.join(codexSkillDir, 'SKILL.md'),
  };
}

function normalizeOptionalString(value: string | undefined | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function targetProjectEnvKey(targetProject: SkillPackTargetProject) {
  return `OPL_${targetProject.toUpperCase()}_REPO_ROOT`;
}

function targetProjectRepoName(targetProject: SkillPackTargetProject) {
  return targetProject === 'medautoscience' ? 'med-autoscience' : targetProject;
}

function resolveProjectLocalTargetRepoRoot(
  targetProject: SkillPackTargetProject,
  inspected: InspectFamilySkillPack,
) {
  const envValue = normalizeOptionalString(process.env[targetProjectEnvKey(targetProject)]);
  if (envValue) {
    return path.resolve(envValue);
  }

  return path.join(
    resolveDefaultFamilyWorkspaceRoot({ repoRootHint: inspected.repo_root }),
    targetProjectRepoName(targetProject),
  );
}

function resolveGitInfoExcludePath(repoRoot: string) {
  const result = spawnSync('git', ['-C', repoRoot, 'rev-parse', '--git-path', 'info/exclude'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return null;
  }
  const rawPath = result.stdout.trim();
  if (!rawPath) {
    return null;
  }
  return path.isAbsolute(rawPath) ? rawPath : path.join(repoRoot, rawPath);
}

function ensureProjectLocalMirrorGitExclude(repoRoot: string, pluginRoot: string) {
  const excludePath = resolveGitInfoExcludePath(repoRoot);
  const relativePath = path.relative(repoRoot, pluginRoot).split(path.sep).join('/');
  const pattern = `/${relativePath}/`;
  if (!excludePath) {
    return {
      status: 'skipped_not_git_repo',
      exclude_path: null,
      pattern,
    };
  }

  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
  const lines = existing.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(pattern)) {
    return {
      status: 'already_present',
      exclude_path: excludePath,
      pattern,
    };
  }

  const prefix = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
  fs.appendFileSync(
    excludePath,
    `${prefix}# OPL-managed project-local ScholarSkills mirror; not MAS source truth.\n${pattern}\n`,
    'utf8',
  );
  return {
    status: 'added',
    exclude_path: excludePath,
    pattern,
  };
}

function syncProjectLocalSkillMirror(
  inspected: InspectFamilySkillPack,
  targetProject: SkillPackTargetProject,
) {
  if (inspected.domain_id !== 'scholarskills') {
    return {
      status: 'skipped',
      skip_reason: 'project_local_scope_only_supported_for_scholarskills',
      target_project: targetProject,
    };
  }

  if (!inspected.plugin_manifest_found || !inspected.skill_entry_found || !inspected.skill_entry_valid) {
    return {
      status: 'skipped',
      skip_reason: 'source_plugin_not_ready',
      target_project: targetProject,
      plugin_source_path: inspected.plugin_source_path,
    };
  }

  const targetRepoRoot = resolveProjectLocalTargetRepoRoot(targetProject, inspected);
  if (!fs.existsSync(targetRepoRoot) || !fs.statSync(targetRepoRoot).isDirectory()) {
    return {
      status: 'skipped',
      skip_reason: 'target_project_repo_root_missing',
      target_project: targetProject,
      target_repo_root: targetRepoRoot,
      expected_repo_root_env: targetProjectEnvKey(targetProject),
    };
  }

  const targetPluginRoot = path.join(targetRepoRoot, 'plugins', inspected.canonical_plugin_name);
  fs.rmSync(targetPluginRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetPluginRoot), { recursive: true });
  fs.cpSync(inspected.plugin_source_path, targetPluginRoot, { recursive: true });
  const gitExclude = ensureProjectLocalMirrorGitExclude(targetRepoRoot, targetPluginRoot);

  return {
    status: 'installed',
    target_scope: 'project',
    target_project: targetProject,
    target_repo_root: targetRepoRoot,
    plugin_source_path: inspected.plugin_source_path,
    project_local_plugin_root: targetPluginRoot,
    project_local_plugin_manifest_path: path.join(targetPluginRoot, '.codex-plugin', 'plugin.json'),
    project_local_skill_entry_path: path.join(
      targetPluginRoot,
      'skills',
      inspected.canonical_plugin_name,
      'SKILL.md',
    ),
    project_local_git_exclude: gitExclude,
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    },
  };
}

export function runSkillPackInstaller(
  inspected: InspectFamilySkillPack,
  options: RunSkillPackInstallerOptions,
): SyncFamilySkillPack {
  if (!inspected.ready_to_sync) {
    return {
      ...inspected,
      sync_status: 'skipped',
      sync_scope: options.scope,
      target_project: options.targetProject ?? null,
      installer_result: null,
      registry_repo_root: null,
      stdout: '',
      stderr: '',
    };
  }

  if (options.scope === 'project') {
    const targetProject = options.targetProject ?? 'medautoscience';
    const projectLocalSkillMirror = syncProjectLocalSkillMirror(inspected, targetProject);
    return {
      ...inspected,
      sync_status: projectLocalSkillMirror.status === 'installed' ? 'synced' : 'skipped',
      sync_scope: 'project',
      target_project: targetProject,
      installer_result: {
        source: 'project_local_capability_skill_mirror',
        plugin_source_path: inspected.plugin_source_path,
        plugin_manifest_path: inspected.plugin_manifest_path,
        skill_entry_path: inspected.skill_entry_path,
        project_local_skill_mirror: projectLocalSkillMirror,
      },
      registry_repo_root: null,
      stdout: '',
      stderr: '',
    };
  }

  if (inspected.source_kind === 'opl_generated_plugin_surface') {
    const codexPluginSurface = options.writeGeneratedPluginSurface(inspected, options.home);
    return {
      ...inspected,
      sync_status: 'synced',
      sync_scope: 'codex',
      target_project: null,
      installer_result: {
        generated_surface: 'opl_generated_codex_plugin_descriptor',
        generated_codex_plugin: codexPluginSurface,
      },
      registry_repo_root: codexPluginSurface ? path.dirname(path.dirname(codexPluginSurface.plugin_root)) : null,
      stdout: '',
      stderr: '',
    };
  }

  const codexSkillMirror = syncCodexSkillMirror(inspected, options);
  const repoLocalMarketplacePath = path.join(inspected.repo_root, '.agents', 'plugins', 'marketplace.json');

  return {
    ...inspected,
    sync_status: 'synced',
    sync_scope: 'codex',
    target_project: null,
    installer_result: {
      source: 'tracked_codex_plugin_source',
      plugin_source_path: inspected.plugin_source_path,
      plugin_manifest_path: inspected.plugin_manifest_path,
      skill_entry_path: inspected.skill_entry_path,
      repo_local_marketplace_path: repoLocalMarketplacePath,
      repo_local_marketplace_written: false,
      ...(inspected.installer_found ? { legacy_installer_path: inspected.installer_path } : {}),
      ...(codexSkillMirror ? { codex_skill_mirror: codexSkillMirror } : {}),
    },
    registry_repo_root: inspected.repo_root,
    stdout: '',
    stderr: '',
  };
}
