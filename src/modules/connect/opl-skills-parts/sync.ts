import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  readJsonFileOrNull,
  writeJsonPayloadFile,
} from '../../../kernel/json-file.ts';
import { resolveDefaultFamilyWorkspaceRoot } from '../../workspace/index.ts';
import { PACKAGED_MODULE_MARKER_FILE } from '../packaged-module-marker.ts';
import {
  buildMasScholarSkillsProfileManifest,
  MAS_SCHOLAR_SKILLS_PROFILE_PACKS,
  materializedMasScholarSkillsPackIds,
  SCHOLARSKILLS_AUTHORITY_FALSE_FLAGS,
} from './scholarskills-profile.ts';
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
  targetRoot?: string | null;
  resolveCodexHome: (home: string) => string;
  writeGeneratedPluginSurface: (
    inspected: InspectFamilySkillPack,
    home?: string,
  ) => GeneratedCodexPluginSurface | null;
};

type ScholarSkillsCopyPolicy = {
  copy_policy: string;
  copied_roots: string[];
  excluded_roots: string[];
};

const SCHOLARSKILLS_EXCLUDED_ROOTS = [
  '.git',
  'outputs',
  'build',
  'dist',
  'node_modules',
  'render-cache',
  'gallery/**/assets',
  'gallery/**/*.png',
  'gallery/**/*.svg',
  'gallery/**/*.html',
  'gallery/**/*.sidecar.json',
  'gallery/**/*.layout.json',
  'gallery/**/*.lock',
];

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

function resolveGitTopLevel(rootHint: string) {
  const result = spawnSync('git', ['-C', rootHint, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return null;
  }
  const topLevel = result.stdout.trim();
  return topLevel ? path.resolve(topLevel) : null;
}

function ensureManagedPathGitExclude(rootHint: string, managedPath: string, comment: string) {
  const gitTopLevel = resolveGitTopLevel(rootHint);
  if (!gitTopLevel) {
    return {
      status: 'skipped_not_git_repo',
      exclude_path: null,
      pattern: null,
    };
  }

  const excludePath = resolveGitInfoExcludePath(gitTopLevel);
  const relativePath = path.relative(gitTopLevel, managedPath).split(path.sep).join('/');
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
  fs.appendFileSync(excludePath, `${prefix}${comment}\n${pattern}\n`, 'utf8');
  return {
    status: 'added',
    exclude_path: excludePath,
    pattern,
  };
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

function isDirectory(pathname: string) {
  return fs.existsSync(pathname) && fs.statSync(pathname).isDirectory();
}

function copyDirectoryIfPresent(sourceRoot: string, targetRoot: string) {
  if (!isDirectory(sourceRoot)) {
    return false;
  }
  fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter: (source) => {
      const baseName = path.basename(source);
      if ([
        '.git',
        'outputs',
        'build',
        'dist',
        'node_modules',
        'render-cache',
        'assets',
      ].includes(baseName)) {
        return false;
      }
      return !/\.(png|svg|html|sidecar\.json|layout\.json|lock)$/i.test(baseName);
    },
  });
  return true;
}

function copySkillDirectoryIfPresent(sourceRoot: string, targetRoot: string) {
  if (!isDirectory(sourceRoot)) {
    return false;
  }
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter: (source) => ![
      '.git',
      'outputs',
      'build',
      'dist',
      'node_modules',
      'render-cache',
    ].includes(path.basename(source)),
  });
  return true;
}

function copyScholarSkillsOptionalReferenceRoots(
  sourceRoot: string,
  targetRoot: string,
) {
  return {
    contracts: copyDirectoryIfPresent(
      path.join(sourceRoot, 'contracts'),
      path.join(targetRoot, 'contracts'),
    ),
    docs: copyDirectoryIfPresent(
      path.join(sourceRoot, 'docs'),
      path.join(targetRoot, 'docs'),
    ),
    gallery: copyDirectoryIfPresent(
      path.join(sourceRoot, 'gallery'),
      path.join(targetRoot, 'gallery'),
    ),
  };
}

function copiedOptionalRoots(optionalCopied: Record<string, boolean>) {
  return Object.entries(optionalCopied)
    .filter(([, copied]) => copied)
    .map(([root]) => root);
}

function copyProjectLocalScholarSkillsSource(
  inspected: InspectFamilySkillPack,
  targetPluginRoot: string,
): ScholarSkillsCopyPolicy {
  fs.rmSync(targetPluginRoot, { recursive: true, force: true });
  fs.mkdirSync(targetPluginRoot, { recursive: true });

  fs.cpSync(
    path.join(inspected.plugin_source_path, '.codex-plugin'),
    path.join(targetPluginRoot, '.codex-plugin'),
    { recursive: true },
  );
  fs.cpSync(
    path.join(inspected.plugin_source_path, 'skills'),
    path.join(targetPluginRoot, 'skills'),
    { recursive: true },
  );

  const optionalCopied = copyScholarSkillsOptionalReferenceRoots(
    inspected.plugin_source_path,
    targetPluginRoot,
  );

  return {
    copy_policy: 'scholarskills_project_local_filtered_copy',
    copied_roots: [
      '.codex-plugin',
      'skills',
      ...copiedOptionalRoots(optionalCopied),
    ],
    excluded_roots: SCHOLARSKILLS_EXCLUDED_ROOTS,
  };
}

function resolveGitHead(repoRoot: string) {
  const result = spawnSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return resolvePackagedSourceHead(repoRoot);
  }
  const head = result.stdout.trim();
  return head || resolvePackagedSourceHead(repoRoot);
}

function resolvePackagedSourceHead(repoRoot: string) {
  const markerPath = path.join(repoRoot, PACKAGED_MODULE_MARKER_FILE);
  if (!fs.existsSync(markerPath) || !fs.statSync(markerPath).isFile()) {
    return null;
  }
  const parsed = readJsonFileOrNull(markerPath);
  const sourceGit = isRecord(parsed) && isRecord(parsed.source_git) ? parsed.source_git : null;
  const head = sourceGit?.head_sha;
  return typeof head === 'string' && head.trim().length > 0 ? head.trim() : null;
}

function copyMaterializedMasScholarSkillsSpecialistDirs(
  inspected: InspectFamilySkillPack,
  targetCodexSkillsRoot: string,
) {
  const installedPackIds = ['mas-scholar-skills'];
  for (const pack of MAS_SCHOLAR_SKILLS_PROFILE_PACKS) {
    if (pack.pack_id === 'mas-scholar-skills') {
      continue;
    }
    const sourceSkillDir = path.join(inspected.plugin_source_path, 'skills', pack.skill_dir);
    const targetSkillDir = path.join(targetCodexSkillsRoot, pack.skill_dir);
    if (copySkillDirectoryIfPresent(sourceSkillDir, targetSkillDir)) {
      writeJsonFile(path.join(targetSkillDir, '.opl-connect-skill-sync.json'), {
        surface_kind: 'opl_connect_managed_mas_scholar_skills_specialist_dir',
        schema_version: 'g1',
        pack_id: pack.pack_id,
        source_skill_dir: sourceSkillDir,
      });
      installedPackIds.push(pack.pack_id);
    } else if (isOplConnectManagedSpecialistDir(targetSkillDir)) {
      fs.rmSync(targetSkillDir, { recursive: true, force: true });
    }
  }
  return installedPackIds;
}

function isOplConnectManagedSpecialistDir(targetSkillDir: string) {
  const markerPath = path.join(targetSkillDir, '.opl-connect-skill-sync.json');
  if (!fs.existsSync(markerPath)) {
    return false;
  }
  const marker = readJsonFileOrNull(markerPath);
  return isRecord(marker) && marker.surface_kind === 'opl_connect_managed_mas_scholar_skills_specialist_dir';
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJsonPayloadFile(filePath, value);
}

function copyWorkspaceOrQuestLocalScholarSkillsSkill(
  inspected: InspectFamilySkillPack,
  targetRoot: string,
  targetScope: Extract<SkillPackSyncScope, 'workspace' | 'quest'>,
) {
  const resolvedTargetRoot = path.resolve(targetRoot);
  const targetCodexSkillsRoot = path.join(resolvedTargetRoot, '.codex', 'skills');
  const skillRoot = path.join(
    targetCodexSkillsRoot,
    inspected.canonical_plugin_name,
  );

  fs.rmSync(skillRoot, { recursive: true, force: true });
  fs.mkdirSync(skillRoot, { recursive: true });
  fs.copyFileSync(inspected.skill_entry_path, path.join(skillRoot, 'SKILL.md'));

  const optionalCopied = copyScholarSkillsOptionalReferenceRoots(
    inspected.plugin_source_path,
    skillRoot,
  );
  const copyPolicy: ScholarSkillsCopyPolicy = {
    copy_policy: 'scholarskills_workspace_or_quest_local_filtered_skill_copy',
    copied_roots: [
      'SKILL.md',
      ...copiedOptionalRoots(optionalCopied),
    ],
    excluded_roots: SCHOLARSKILLS_EXCLUDED_ROOTS,
  };
  const installedPackIds = copyMaterializedMasScholarSkillsSpecialistDirs(
    inspected,
    targetCodexSkillsRoot,
  );
  const masScholarSkillsProfile = buildMasScholarSkillsProfileManifest({
    sourceRoot: inspected.repo_root,
    pluginSourcePath: inspected.plugin_source_path,
    targetScope,
    targetRoot: resolvedTargetRoot,
    installRoot: targetCodexSkillsRoot,
    installedPackIds,
  });
  const masScholarSkillsProfileManifestPath = path.join(
    skillRoot,
    '.opl-mas-scholarskills-sync-manifest.json',
  );
  const receiptPath = path.join(skillRoot, '.opl-install-receipt.json');
  const gitExclude = ensureManagedPathGitExclude(
    resolvedTargetRoot,
    skillRoot,
    '# OPL-managed ScholarSkills local Codex discovery install; not paper/study truth.',
  );
  const receipt = {
    receipt_kind: 'opl_scholarskills_workspace_or_quest_local_install_receipt',
    schema_version: 'g1',
    source_repo_path: inspected.repo_root,
    source_plugin_path: inspected.plugin_source_path,
    source_head: resolveGitHead(inspected.repo_root),
    target_scope: targetScope,
    target_root: resolvedTargetRoot,
    skill_root: skillRoot,
    skill_entry: path.join(skillRoot, 'SKILL.md'),
    codex_discovery_kind: 'workspace_or_quest_local_skill',
    project_mirror_deprecated_for_paper_execution: true,
    project_mirror_non_default_paper_execution_path: true,
    copy_policy: copyPolicy.copy_policy,
    copied_roots: copyPolicy.copied_roots,
    excluded_roots: copyPolicy.excluded_roots,
    git_exclude: gitExclude,
    mas_scholar_skills_profile_manifest_path: masScholarSkillsProfileManifestPath,
    mas_scholar_skills_profile: masScholarSkillsProfile,
    authority_flags: SCHOLARSKILLS_AUTHORITY_FALSE_FLAGS,
  };
  writeJsonFile(masScholarSkillsProfileManifestPath, masScholarSkillsProfile);
  writeJsonFile(receiptPath, receipt);

  return {
    status: 'installed',
    target_scope: targetScope,
    target_root: resolvedTargetRoot,
    workspace_or_quest_local_skill_root: skillRoot,
    workspace_or_quest_local_skill_entry_path: path.join(skillRoot, 'SKILL.md'),
    install_receipt_path: receiptPath,
    install_receipt: receipt,
    codex_discovery_kind: 'workspace_or_quest_local_skill',
    copy: copyPolicy,
    workspace_or_quest_git_exclude: gitExclude,
    mas_scholar_skills_profile_manifest_path: masScholarSkillsProfileManifestPath,
    mas_scholar_skills_profile: masScholarSkillsProfile,
    authority_boundary: SCHOLARSKILLS_AUTHORITY_FALSE_FLAGS,
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
  const mirrorCopy = copyProjectLocalScholarSkillsSource(inspected, targetPluginRoot);
  const gitExclude = ensureProjectLocalMirrorGitExclude(targetRepoRoot, targetPluginRoot);
  const masScholarSkillsProfile = buildMasScholarSkillsProfileManifest({
    sourceRoot: inspected.repo_root,
    pluginSourcePath: inspected.plugin_source_path,
    targetScope: 'project',
    targetProject,
    targetRoot: targetRepoRoot,
    installRoot: targetPluginRoot,
    installedPackIds: materializedMasScholarSkillsPackIds(inspected.plugin_source_path),
  });
  const masScholarSkillsProfileManifestPath = path.join(
    targetPluginRoot,
    '.opl-mas-scholarskills-sync-manifest.json',
  );
  writeJsonFile(masScholarSkillsProfileManifestPath, masScholarSkillsProfile);

  return {
    status: 'installed',
    target_scope: 'project',
    target_project: targetProject,
    target_repo_root: targetRepoRoot,
    plugin_source_path: inspected.plugin_source_path,
    project_local_copy: mirrorCopy,
    project_local_plugin_root: targetPluginRoot,
    project_local_plugin_manifest_path: path.join(targetPluginRoot, '.codex-plugin', 'plugin.json'),
    project_local_skill_entry_path: path.join(
      targetPluginRoot,
      'skills',
      inspected.canonical_plugin_name,
      'SKILL.md',
    ),
    project_local_git_exclude: gitExclude,
    project_mirror_deprecated_for_paper_execution: true,
    project_mirror_non_default_paper_execution_path: true,
    mas_scholar_skills_profile_manifest_path: masScholarSkillsProfileManifestPath,
    mas_scholar_skills_profile: masScholarSkillsProfile,
    authority_boundary: {
      ...SCHOLARSKILLS_AUTHORITY_FALSE_FLAGS,
    },
  };
}

function syncWorkspaceOrQuestLocalSkill(
  inspected: InspectFamilySkillPack,
  targetScope: Extract<SkillPackSyncScope, 'workspace' | 'quest'>,
  targetRoot: string | null | undefined,
) {
  if (inspected.domain_id !== 'scholarskills') {
    return {
      status: 'skipped',
      skip_reason: 'workspace_or_quest_local_scope_only_supported_for_scholarskills',
      target_scope: targetScope,
      target_root: targetRoot ? path.resolve(targetRoot) : null,
    };
  }

  if (!inspected.skill_entry_found || !inspected.skill_entry_valid) {
    return {
      status: 'skipped',
      skip_reason: 'source_skill_not_ready',
      target_scope: targetScope,
      target_root: targetRoot ? path.resolve(targetRoot) : null,
      plugin_source_path: inspected.plugin_source_path,
    };
  }

  if (!targetRoot) {
    return {
      status: 'skipped',
      skip_reason: 'workspace_or_quest_target_required',
      target_scope: targetScope,
      target_root: null,
      required: targetScope === 'workspace'
        ? ['--target-workspace <path> or --target-root <path>']
        : ['--target-quest <path> or --target-root <path>'],
    };
  }

  const resolvedTargetRoot = path.resolve(targetRoot);
  if (!fs.existsSync(resolvedTargetRoot) || !fs.statSync(resolvedTargetRoot).isDirectory()) {
    return {
      status: 'skipped',
      skip_reason: 'target_root_missing',
      target_scope: targetScope,
      target_root: resolvedTargetRoot,
    };
  }
  return copyWorkspaceOrQuestLocalScholarSkillsSkill(
    inspected,
    resolvedTargetRoot,
    targetScope,
  );
}

function readTargetRootFromInstallerResult(result: unknown) {
  if (!isRecord(result)) {
    return null;
  }
  const targetRoot = result.target_root ?? result.target_repo_root;
  return typeof targetRoot === 'string' ? targetRoot : null;
}

function readWorkspaceOrQuestSkillRootFromInstallerResult(result: unknown) {
  if (!isRecord(result)) {
    return null;
  }
  const skillRoot = result.workspace_or_quest_local_skill_root;
  return typeof skillRoot === 'string' ? skillRoot : null;
}

function codexDiscoveryKindForScope(scope: SkillPackSyncScope) {
  if (scope === 'codex') {
    return 'codex_home_plugin_registry';
  }
  if (scope === 'project') {
    return 'project_local_plugin_mirror';
  }
  return 'workspace_or_quest_local_skill';
}

function projectMirrorDeprecatedForPaperExecution(scope: SkillPackSyncScope) {
  return scope === 'project';
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
      target_scope: options.scope,
      target_project: options.targetProject ?? null,
      target_root: options.targetRoot ? path.resolve(options.targetRoot) : null,
      workspace_or_quest_local_skill_root: null,
      codex_discovery_kind: codexDiscoveryKindForScope(options.scope),
      project_mirror_deprecated_for_paper_execution: projectMirrorDeprecatedForPaperExecution(options.scope),
      project_mirror_non_default_paper_execution_path: projectMirrorDeprecatedForPaperExecution(options.scope),
      installer_result: null,
      registry_repo_root: null,
      stdout: '',
      stderr: '',
    };
  }

  if (options.scope === 'project') {
    const targetProject = options.targetProject ?? 'medautoscience';
    const projectLocalSkillMirror = syncProjectLocalSkillMirror(inspected, targetProject);
    const targetRoot = readTargetRootFromInstallerResult(projectLocalSkillMirror);
    return {
      ...inspected,
      sync_status: projectLocalSkillMirror.status === 'installed' ? 'synced' : 'skipped',
      sync_scope: 'project',
      target_scope: 'project',
      target_project: targetProject,
      target_root: targetRoot,
      workspace_or_quest_local_skill_root: null,
      codex_discovery_kind: 'project_local_plugin_mirror',
      project_mirror_deprecated_for_paper_execution: true,
      project_mirror_non_default_paper_execution_path: true,
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

  if (options.scope === 'workspace' || options.scope === 'quest') {
    const localSkillInstall = syncWorkspaceOrQuestLocalSkill(
      inspected,
      options.scope,
      options.targetRoot,
    );
    return {
      ...inspected,
      sync_status: localSkillInstall.status === 'installed' ? 'synced' : 'skipped',
      sync_scope: options.scope,
      target_scope: options.scope,
      target_project: null,
      target_root: readTargetRootFromInstallerResult(localSkillInstall),
      workspace_or_quest_local_skill_root: readWorkspaceOrQuestSkillRootFromInstallerResult(localSkillInstall),
      codex_discovery_kind: 'workspace_or_quest_local_skill',
      project_mirror_deprecated_for_paper_execution: false,
      project_mirror_non_default_paper_execution_path: false,
      installer_result: {
        source: 'workspace_or_quest_local_codex_skill',
        plugin_source_path: inspected.plugin_source_path,
        skill_entry_path: inspected.skill_entry_path,
        workspace_or_quest_local_skill: localSkillInstall,
      },
      registry_repo_root: null,
      stdout: '',
      stderr: '',
    };
  }

  if (inspected.source_kind === 'opl_standard_codex_carrier') {
    const codexPluginSurface = options.writeGeneratedPluginSurface(inspected, options.home);
    return {
      ...inspected,
      sync_status: 'synced',
      sync_scope: 'codex',
      target_scope: 'codex',
      target_project: null,
      target_root: null,
      workspace_or_quest_local_skill_root: null,
      codex_discovery_kind: 'codex_home_plugin_registry',
      project_mirror_deprecated_for_paper_execution: false,
      project_mirror_non_default_paper_execution_path: false,
      installer_result: {
        generated_surface: 'opl_standard_codex_plugin_carrier',
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
    target_scope: 'codex',
    target_project: null,
    target_root: null,
    workspace_or_quest_local_skill_root: null,
    codex_discovery_kind: 'codex_home_plugin_registry',
    project_mirror_deprecated_for_paper_execution: false,
    project_mirror_non_default_paper_execution_path: false,
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
