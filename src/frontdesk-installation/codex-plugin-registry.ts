import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { FrontDeskModuleId } from './shared.ts';

type CodexFamilyPluginSpec = {
  module_id: FrontDeskModuleId;
  marketplace_id: string;
  plugin_id: string;
  repo_name: string;
};

export type CodexPluginRegistryItem = {
  module_id: FrontDeskModuleId;
  marketplace_id: string;
  plugin_id: string;
  repo_path: string;
  marketplace_path: string;
  status: 'registered' | 'missing_marketplace';
  note: string | null;
};

export type CodexPluginRegistryResult = {
  surface_id: 'opl_codex_plugin_registry';
  codex_config_path: string;
  items: CodexPluginRegistryItem[];
  summary: {
    total: number;
    registered: number;
    missing_marketplace: number;
  };
};

const FAMILY_PLUGIN_SPECS: CodexFamilyPluginSpec[] = [
  {
    module_id: 'medautoscience',
    marketplace_id: 'mas-local',
    plugin_id: 'mas',
    repo_name: 'med-autoscience',
  },
  {
    module_id: 'medautogrant',
    marketplace_id: 'mag-local',
    plugin_id: 'mag',
    repo_name: 'med-autogrant',
  },
  {
    module_id: 'redcube',
    marketplace_id: 'rca-local',
    plugin_id: 'rca',
    repo_name: 'redcube-ai',
  },
];

function resolveHomeDir() {
  return process.env.HOME?.trim() || os.homedir();
}

function resolveCodexConfigPath(home = resolveHomeDir()) {
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
  return path.join(codexHome, 'config.toml');
}

function escapeTomlString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function removeTomlTable(text: string, tableHeader: string) {
  const lines = text.split('\n');
  const kept: string[] = [];
  let skipping = false;

  for (const line of lines) {
    if (/^\[[^\]]+\]/.test(line.trim())) {
      skipping = line.trim() === tableHeader;
    }
    if (!skipping) {
      kept.push(line);
    }
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

function upsertTomlTable(text: string, tableHeader: string, bodyLines: string[]) {
  const withoutTable = removeTomlTable(text, tableHeader);
  const table = [tableHeader, ...bodyLines].join('\n');
  return `${withoutTable.trimEnd()}\n\n${table}\n`;
}

function registerCodexPlugin(configPath: string, spec: CodexFamilyPluginSpec, repoPath: string) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  let text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  text = upsertTomlTable(text, `[marketplaces.${spec.marketplace_id}]`, [
    'source_type = "local"',
    `source = "${escapeTomlString(repoPath)}"`,
  ]);
  text = upsertTomlTable(text, `[plugins."${spec.plugin_id}@${spec.marketplace_id}"]`, [
    'enabled = true',
  ]);
  fs.writeFileSync(configPath, text, 'utf8');
}

export function registerOplFamilyCodexPlugins(
  selectedModules: FrontDeskModuleId[],
  moduleRepoPaths: Map<FrontDeskModuleId, string>,
  home = resolveHomeDir(),
): CodexPluginRegistryResult {
  const codexConfigPath = resolveCodexConfigPath(home);
  const selected = new Set(selectedModules);
  const items: CodexPluginRegistryItem[] = [];

  for (const spec of FAMILY_PLUGIN_SPECS) {
    if (!selected.has(spec.module_id)) {
      continue;
    }

    const repoPath = moduleRepoPaths.get(spec.module_id) ?? path.join(path.dirname(path.dirname(path.dirname(codexConfigPath))), spec.repo_name);
    const marketplacePath = path.join(repoPath, '.agents', 'plugins', 'marketplace.json');
    if (!fs.existsSync(marketplacePath)) {
      items.push({
        module_id: spec.module_id,
        marketplace_id: spec.marketplace_id,
        plugin_id: spec.plugin_id,
        repo_path: repoPath,
        marketplace_path: marketplacePath,
        status: 'missing_marketplace',
        note: 'Run the module Codex plugin installer before expecting the native Codex App plugin list to show this family plugin.',
      });
      continue;
    }

    registerCodexPlugin(codexConfigPath, spec, repoPath);
    items.push({
      module_id: spec.module_id,
      marketplace_id: spec.marketplace_id,
      plugin_id: spec.plugin_id,
      repo_path: repoPath,
      marketplace_path: marketplacePath,
      status: 'registered',
      note: null,
    });
  }

  return {
    surface_id: 'opl_codex_plugin_registry',
    codex_config_path: codexConfigPath,
    items,
    summary: {
      total: items.length,
      registered: items.filter((item) => item.status === 'registered').length,
      missing_marketplace: items.filter((item) => item.status === 'missing_marketplace').length,
    },
  };
}
