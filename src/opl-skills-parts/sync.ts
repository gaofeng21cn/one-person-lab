import fs from 'node:fs';
import path from 'node:path';

import type { InspectFamilySkillPack, SyncFamilySkillPack } from './registry.ts';

type GeneratedCodexPluginSurface = {
  plugin_root: string;
  [key: string]: unknown;
};

type RunSkillPackInstallerOptions = {
  home?: string;
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

export function runSkillPackInstaller(
  inspected: InspectFamilySkillPack,
  options: RunSkillPackInstallerOptions,
): SyncFamilySkillPack {
  if (!inspected.ready_to_sync) {
    return {
      ...inspected,
      sync_status: 'skipped',
      installer_result: null,
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
