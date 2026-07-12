import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  FrameworkContractError,
  isRecord,
} from '../../../kernel/contract-validation.ts';
import {
  STANDARD_AGENT_REGISTRY,
  STANDARD_AGENT_SERIES_MEMBERSHIP,
} from '../../../kernel/standard-agent-registry.ts';
import {
  readJsonFileOrNull,
  writeJsonPayloadFile,
} from '../../../kernel/json-file.ts';
import { PACKAGED_MODULE_MARKER_FILE } from '../packaged-module-marker.ts';
import type {
  InspectFamilySkillPack,
  SkillPackSyncScope,
  SyncFamilySkillPack,
} from './registry.ts';
import { FRAMEWORK_CAPABILITY_PACKAGE_AUTHORITY_BOUNDARY } from './registry.ts';

type MaterializedCodexPluginCarrier = {
  plugin_root: string;
  [key: string]: unknown;
};

type RunSkillPackInstallerOptions = {
  home?: string;
  scope: SkillPackSyncScope;
  targetRoot?: string | null;
  resolveCodexHome: (home: string) => string;
  writeMaterializedPluginCarrier: (
    inspected: InspectFamilySkillPack,
    home?: string,
  ) => MaterializedCodexPluginCarrier | null;
};

type ScholarSkillsCopyPolicy = {
  copy_policy: string;
  copied_roots: string[];
  excluded_roots: string[];
};

const STANDARD_AGENT_PLUGIN_NAMES = new Set<string>(
  STANDARD_AGENT_REGISTRY
    .filter((entry) => entry.series_membership === STANDARD_AGENT_SERIES_MEMBERSHIP)
    .map((entry) => entry.canonical_plugin_name),
);

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

  if (STANDARD_AGENT_PLUGIN_NAMES.has(inspected.canonical_plugin_name)) {
    fs.rmSync(codexSkillDir, { recursive: true, force: true });
    return null;
  }

  assertCapabilitySkillTargetReplaceable(
    codexSkillDir,
    inspected,
    inspected.canonical_plugin_name,
  );
  fs.rmSync(codexSkillDir, { recursive: true, force: true });
  fs.cpSync(path.dirname(inspected.skill_entry_path), codexSkillDir, { recursive: true });
  writeJsonFile(path.join(codexSkillDir, '.opl-connect-skill-sync.json'), {
    surface_kind: 'opl_connect_managed_framework_capability_skill_dir',
    schema_version: 'g1',
    capability_package_id: inspected.canonical_plugin_name,
    skill_id: inspected.canonical_plugin_name,
    source_skill_dir: path.dirname(inspected.skill_entry_path),
  });

  return {
    skill_root: codexSkillDir,
    skill_entry_path: path.join(codexSkillDir, 'SKILL.md'),
  };
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

function materializedCapabilitySkillIds(pluginSourcePath: string) {
  const skillsRoot = path.join(pluginSourcePath, 'skills');
  if (!isDirectory(skillsRoot)) {
    return [];
  }
  return fs.readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((skillId) => fs.existsSync(path.join(skillsRoot, skillId, 'SKILL.md')))
    .sort();
}

function assertCapabilitySkillTargetReplaceable(
  targetSkillDir: string,
  inspected: InspectFamilySkillPack,
  skillId: string,
) {
  if (!fs.existsSync(targetSkillDir)) {
    return;
  }
  const marker = readJsonFileOrNull(path.join(targetSkillDir, '.opl-connect-skill-sync.json'));
  const receipt = readJsonFileOrNull(path.join(targetSkillDir, '.opl-install-receipt.json'));
  const managedSpecialist = isRecord(marker) && (
    (
      marker.surface_kind === 'opl_connect_managed_framework_capability_skill_dir'
      && marker.capability_package_id === inspected.canonical_plugin_name
      && marker.skill_id === skillId
    )
    || marker.surface_kind === 'opl_connect_managed_mas_scholar_skills_specialist_dir'
  );
  const managedAggregate = skillId === inspected.canonical_plugin_name
    && isRecord(receipt)
    && receipt.receipt_kind === 'opl_scholarskills_workspace_or_quest_local_install_receipt';
  if (managedSpecialist || managedAggregate) {
    return;
  }
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Capability skill sync refuses to replace an unmanaged target directory.',
    {
      capability_package_id: inspected.canonical_plugin_name,
      skill_id: skillId,
      target_skill_dir: targetSkillDir,
      required_owner_marker: '.opl-connect-skill-sync.json or .opl-install-receipt.json',
    },
    2,
  );
}

function copyMaterializedCapabilitySkillDirs(
  inspected: InspectFamilySkillPack,
  targetCodexSkillsRoot: string,
) {
  const skillIds = materializedCapabilitySkillIds(inspected.plugin_source_path);
  for (const skillId of skillIds) {
    if (skillId === inspected.canonical_plugin_name) {
      continue;
    }
    const sourceSkillDir = path.join(inspected.plugin_source_path, 'skills', skillId);
    const targetSkillDir = path.join(targetCodexSkillsRoot, skillId);
    assertCapabilitySkillTargetReplaceable(targetSkillDir, inspected, skillId);
    if (copySkillDirectoryIfPresent(sourceSkillDir, targetSkillDir)) {
      writeJsonFile(path.join(targetSkillDir, '.opl-connect-skill-sync.json'), {
        surface_kind: 'opl_connect_managed_framework_capability_skill_dir',
        schema_version: 'g1',
        capability_package_id: inspected.canonical_plugin_name,
        skill_id: skillId,
        source_skill_dir: sourceSkillDir,
      });
    }
  }

  if (isDirectory(targetCodexSkillsRoot)) {
    for (const entry of fs.readdirSync(targetCodexSkillsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || skillIds.includes(entry.name)) {
        continue;
      }
      const targetSkillDir = path.join(targetCodexSkillsRoot, entry.name);
      const marker = readJsonFileOrNull(path.join(targetSkillDir, '.opl-connect-skill-sync.json'));
      if (
        isRecord(marker)
        && (
          (
            marker.surface_kind === 'opl_connect_managed_framework_capability_skill_dir'
            && marker.capability_package_id === inspected.canonical_plugin_name
          )
          || marker.surface_kind === 'opl_connect_managed_mas_scholar_skills_specialist_dir'
        )
      ) {
        fs.rmSync(targetSkillDir, { recursive: true, force: true });
      }
    }
  }
  return skillIds;
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

  assertCapabilitySkillTargetReplaceable(
    skillRoot,
    inspected,
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
  const materializedSkillIds = copyMaterializedCapabilitySkillDirs(
    inspected,
    targetCodexSkillsRoot,
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
    copy_policy: copyPolicy.copy_policy,
    copied_roots: copyPolicy.copied_roots,
    excluded_roots: copyPolicy.excluded_roots,
    git_exclude: gitExclude,
    materialized_skill_ids: materializedSkillIds,
    content_owner: inspected.project,
    framework_role: 'validation_install_sync_and_provenance_only',
    authority_flags: FRAMEWORK_CAPABILITY_PACKAGE_AUTHORITY_BOUNDARY,
  };
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
    materialized_skill_ids: materializedSkillIds,
    authority_boundary: FRAMEWORK_CAPABILITY_PACKAGE_AUTHORITY_BOUNDARY,
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
  return 'workspace_or_quest_local_skill';
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
      target_root: options.targetRoot ? path.resolve(options.targetRoot) : null,
      workspace_or_quest_local_skill_root: null,
      codex_discovery_kind: codexDiscoveryKindForScope(options.scope),
      installer_result: null,
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
      target_root: readTargetRootFromInstallerResult(localSkillInstall),
      workspace_or_quest_local_skill_root: readWorkspaceOrQuestSkillRootFromInstallerResult(localSkillInstall),
      codex_discovery_kind: 'workspace_or_quest_local_skill',
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
    const codexPluginCarrier = options.writeMaterializedPluginCarrier(inspected, options.home);
    return {
      ...inspected,
      sync_status: 'synced',
      sync_scope: 'codex',
      target_scope: 'codex',
      target_root: null,
      workspace_or_quest_local_skill_root: null,
      codex_discovery_kind: 'codex_home_plugin_registry',
      installer_result: {
        materialized_surface: 'repo_local_codex_plugin_carrier',
        materialized_codex_plugin_carrier: codexPluginCarrier,
      },
      registry_repo_root: codexPluginCarrier ? path.dirname(path.dirname(codexPluginCarrier.plugin_root)) : null,
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
    target_root: null,
    workspace_or_quest_local_skill_root: null,
    codex_discovery_kind: 'codex_home_plugin_registry',
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
