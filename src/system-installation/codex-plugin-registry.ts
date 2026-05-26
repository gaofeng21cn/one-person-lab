import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { OplModuleId } from './shared.ts';

type CodexFamilyPluginSpec = {
  module_id: OplModuleId;
  marketplace_id: string;
  plugin_id: string;
  repo_name: string;
  legacy_standalone_mcp_server_ids: string[];
};

export type CodexPluginRegistryItem = {
  module_id: OplModuleId;
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
    removed_standalone_mcp_servers: number;
  };
};

const FAMILY_PLUGIN_SPECS: CodexFamilyPluginSpec[] = [
  {
    module_id: 'medautoscience',
    marketplace_id: 'mas-local',
    plugin_id: 'mas',
    repo_name: 'med-autoscience',
    legacy_standalone_mcp_server_ids: ['med-autoscience', 'medautosci', 'mas'],
  },
  {
    module_id: 'medautogrant',
    marketplace_id: 'mag-local',
    plugin_id: 'mag',
    repo_name: 'med-autogrant',
    legacy_standalone_mcp_server_ids: ['med-autogrant', 'medautogrant', 'mag'],
  },
  {
    module_id: 'redcube',
    marketplace_id: 'rca-local',
    plugin_id: 'rca',
    repo_name: 'redcube-ai',
    legacy_standalone_mcp_server_ids: ['redcube-ai', 'redcube', 'rca'],
  },
  {
    module_id: 'oplmetaagent',
    marketplace_id: 'opl-meta-agent-local',
    plugin_id: 'opl-meta-agent',
    repo_name: 'opl-meta-agent',
    legacy_standalone_mcp_server_ids: ['opl-meta-agent', 'oplmetaagent', 'oma'],
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
  return removeTomlTables(text, (header) => header === tableHeader).text;
}

function removeTomlTables(
  text: string,
  shouldRemove: (tableHeader: string) => boolean,
) {
  const lines = text.split('\n');
  const kept: string[] = [];
  let skipping = false;
  let removed = 0;

  for (const line of lines) {
    if (/^\[[^\]]+\]/.test(line.trim())) {
      skipping = shouldRemove(line.trim());
      if (skipping) {
        removed += 1;
      }
    }
    if (!skipping) {
      kept.push(line);
    }
  }

  return {
    text: kept.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(),
    removed,
  };
}

function upsertTomlTable(text: string, tableHeader: string, bodyLines: string[]) {
  const withoutTable = removeTomlTable(text, tableHeader);
  const table = [tableHeader, ...bodyLines].join('\n');
  return `${withoutTable.trimEnd()}\n\n${table}\n`;
}

function quoteTomlTableSegment(value: string) {
  return `"${escapeTomlString(value)}"`;
}

function buildStandaloneMcpServerTablePrefixes(spec: CodexFamilyPluginSpec) {
  return spec.legacy_standalone_mcp_server_ids.flatMap((serverId) => [
    `[mcp_servers.${serverId}]`,
    `[mcp_servers.${quoteTomlTableSegment(serverId)}]`,
    `[mcp_servers.${serverId}.`,
    `[mcp_servers.${quoteTomlTableSegment(serverId)}.`,
  ]);
}

function removeStandaloneMcpServerTables(text: string, spec: CodexFamilyPluginSpec) {
  const prefixes = buildStandaloneMcpServerTablePrefixes(spec);
  return removeTomlTables(text, (header) => prefixes.some((prefix) => header === prefix || header.startsWith(prefix)));
}

function registerCodexPlugin(configPath: string, spec: CodexFamilyPluginSpec, repoPath: string) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  let text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const standaloneMcpRemoval = removeStandaloneMcpServerTables(text, spec);
  text = standaloneMcpRemoval.text;
  text = upsertTomlTable(text, `[marketplaces.${spec.marketplace_id}]`, [
    'source_type = "local"',
    `source = "${escapeTomlString(repoPath)}"`,
  ]);
  text = upsertTomlTable(text, `[plugins."${spec.plugin_id}@${spec.marketplace_id}"]`, [
    'enabled = true',
  ]);
  fs.writeFileSync(configPath, text, 'utf8');
  return standaloneMcpRemoval.removed;
}

export function registerOplFamilyCodexPlugins(
  selectedModules: OplModuleId[],
  moduleRepoPaths: Map<OplModuleId, string>,
  home = resolveHomeDir(),
): CodexPluginRegistryResult {
  const codexConfigPath = resolveCodexConfigPath(home);
  const selected = new Set(selectedModules);
  const items: CodexPluginRegistryItem[] = [];
  let removedStandaloneMcpServers = 0;

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

    removedStandaloneMcpServers += registerCodexPlugin(codexConfigPath, spec, repoPath);
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
      removed_standalone_mcp_servers: removedStandaloneMcpServers,
    },
  };
}
