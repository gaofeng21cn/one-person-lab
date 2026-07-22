import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isRecord } from '../../../kernel/contract-validation.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import { resolveStandardAgent } from '../../../kernel/standard-agent-registry.ts';
import { OPL_CONNECT_MCP_SERVER_ID } from '../opl-connect-mcp-tools.ts';
import type { OplModuleId } from './shared.ts';

export type CodexPluginRegistryPackId = OplModuleId | 'scholarskills';

type CodexFamilyPluginSpec = {
  module_id: OplModuleId | null;
  pack_id: CodexPluginRegistryPackId;
  marketplace_id: string;
  plugin_id: string;
  repo_name: string;
  display_name: string;
  category: string;
  ownership_kind: 'standard_agent_codex_carrier' | 'framework_capability_plugin';
  distribution_role: 'domain_agent_plugin_pack' | 'framework_capability_plugin_pack';
  framework_owned_capability: boolean;
  domain_module: boolean;
  brand_module: boolean;
  authority_boundary: {
    can_write_domain_truth: false;
    can_sign_owner_receipt: false;
    can_create_typed_blocker: false;
    can_write_runtime_queue: false;
  };
  legacy_standalone_mcp_server_ids: string[];
};

export type LocalCodexPluginMarketplaceSpec = {
  marketplace_id: string;
  plugin_id: string;
  display_name: string;
  category: string;
};

export type LocalCodexPluginMarketplace = {
  marketplace_root: string;
  marketplace_path: string;
  plugin_manifest_path: string;
  marketplace_plugin_path: string;
};

export type CodexPluginRegistryItem = {
  module_id: OplModuleId | null;
  pack_id: string;
  marketplace_id: string;
  plugin_id: string;
  repo_path: string;
  plugin_source_path: string;
  plugin_manifest_path: string;
  marketplace_root: string;
  marketplace_path: string;
  marketplace_plugin_path: string;
  status: 'registered' | 'missing_plugin_manifest';
  ownership_kind: CodexFamilyPluginSpec['ownership_kind'];
  distribution_role: CodexFamilyPluginSpec['distribution_role'];
  framework_owned_capability: boolean;
  domain_module: boolean;
  brand_module: boolean;
  authority_boundary: CodexFamilyPluginSpec['authority_boundary'];
  note: string | null;
};

export type CodexPluginRegistryResult = {
  surface_id: 'opl_codex_plugin_registry';
  codex_config_path: string;
  unified_mcp_server: {
    server_id: typeof OPL_CONNECT_MCP_SERVER_ID;
    status: 'registered';
    owner: 'one-person-lab';
    transport: 'stdio';
    command: 'opl';
    args: ['connect', 'mcp-stdio'];
    read_only_default: true;
    progressive_discovery: true;
  };
  items: CodexPluginRegistryItem[];
  summary: {
    total: number;
    registered: number;
    missing_marketplace: number;
    missing_plugin_manifest: number;
    removed_standalone_mcp_servers: number;
    removed_superseded_plugin_tables: number;
    removed_superseded_plugin_paths: string[];
    registered_unified_mcp_servers: 1;
  };
};

const FAMILY_PLUGIN_SPECS: CodexFamilyPluginSpec[] = [
  {
    module_id: 'medautoscience',
    pack_id: 'medautoscience',
    marketplace_id: 'med-autoscience-local',
    plugin_id: 'med-autoscience',
    repo_name: 'med-autoscience',
    display_name: 'Med Auto Science Local',
    category: 'Research',
    ownership_kind: 'standard_agent_codex_carrier',
    distribution_role: 'domain_agent_plugin_pack',
    framework_owned_capability: false,
    domain_module: true,
    brand_module: false,
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    },
    legacy_standalone_mcp_server_ids: ['med-autoscience', 'medautosci', 'mas'],
  },
  {
    module_id: 'medautogrant',
    pack_id: 'medautogrant',
    marketplace_id: 'med-autogrant-local',
    plugin_id: 'med-autogrant',
    repo_name: 'med-autogrant',
    display_name: 'Med Auto Grant Local',
    category: 'Research',
    ownership_kind: 'standard_agent_codex_carrier',
    distribution_role: 'domain_agent_plugin_pack',
    framework_owned_capability: false,
    domain_module: true,
    brand_module: false,
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    },
    legacy_standalone_mcp_server_ids: ['med-autogrant', 'medautogrant', 'mag'],
  },
  {
    module_id: 'redcube',
    pack_id: 'redcube',
    marketplace_id: 'redcube-ai-local',
    plugin_id: 'redcube-ai',
    repo_name: 'redcube-ai',
    display_name: 'RedCube AI Local',
    category: 'Creative',
    ownership_kind: 'standard_agent_codex_carrier',
    distribution_role: 'domain_agent_plugin_pack',
    framework_owned_capability: false,
    domain_module: true,
    brand_module: false,
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    },
    legacy_standalone_mcp_server_ids: ['redcube-ai', 'redcube', 'rca'],
  },
  {
    module_id: 'oplmetaagent',
    pack_id: 'oplmetaagent',
    marketplace_id: 'opl-meta-agent-local',
    plugin_id: 'opl-meta-agent',
    repo_name: 'opl-meta-agent',
    display_name: 'OPL Meta Agent Local',
    category: 'Productivity',
    ownership_kind: 'standard_agent_codex_carrier',
    distribution_role: 'domain_agent_plugin_pack',
    framework_owned_capability: false,
    domain_module: true,
    brand_module: false,
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    },
    legacy_standalone_mcp_server_ids: ['opl-meta-agent', 'oplmetaagent', 'oma'],
  },
  {
    module_id: 'oplbookforge',
    pack_id: 'oplbookforge',
    marketplace_id: 'opl-bookforge-local',
    plugin_id: 'opl-bookforge',
    repo_name: 'opl-bookforge',
    display_name: 'OPL Book Forge Local',
    category: 'Productivity',
    ownership_kind: 'standard_agent_codex_carrier',
    distribution_role: 'domain_agent_plugin_pack',
    framework_owned_capability: false,
    domain_module: true,
    brand_module: false,
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    },
    legacy_standalone_mcp_server_ids: ['opl-bookforge', 'oplbookforge', 'bookforge', 'obf'],
  },
  {
    module_id: null,
    pack_id: 'scholarskills',
    marketplace_id: 'mas-scholar-skills-local',
    plugin_id: 'mas-scholar-skills',
    repo_name: 'mas-scholar-skills',
    display_name: 'MAS Scholar Skills Local',
    category: 'Productivity',
    ownership_kind: 'framework_capability_plugin',
    distribution_role: 'framework_capability_plugin_pack',
    framework_owned_capability: true,
    domain_module: false,
    brand_module: false,
    authority_boundary: {
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_write_runtime_queue: false,
    },
    legacy_standalone_mcp_server_ids: [],
  },
];

function resolveHomeDir() {
  return process.env.HOME?.trim() || os.homedir();
}

function resolveCodexConfigPath(home = resolveHomeDir()) {
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
  return path.join(codexHome, 'config.toml');
}

function resolveOplStateDir(home = resolveHomeDir()) {
  const explicitStateDir = process.env.OPL_STATE_DIR?.trim();
  return explicitStateDir
    ? path.resolve(explicitStateDir)
    : path.join(home, 'Library', 'Application Support', 'OPL', 'state');
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

function resolveFamilyPluginSpec(packageId: string, pluginId: string) {
  const agent = resolveStandardAgent(packageId);
  if (!agent || agent.plugin_name !== pluginId) {
    return null;
  }
  return FAMILY_PLUGIN_SPECS.find((spec) =>
    spec.plugin_id === agent.plugin_name && spec.repo_name === agent.project
  ) ?? null;
}

function supersededMarketplaceIds(packageId: string, pluginId: string) {
  const spec = resolveFamilyPluginSpec(packageId, pluginId);
  const agent = resolveStandardAgent(packageId);
  if (!spec || !agent) {
    return [];
  }
  return [...new Set([
    `${agent.agent_id}-local`,
    `opl-agent-${agent.agent_id}-local`,
  ])].filter((marketplaceId) => marketplaceId !== spec.marketplace_id);
}

export function resolveCanonicalOplFamilyMarketplaceId(packageId: string, pluginId: string) {
  return resolveFamilyPluginSpec(packageId, pluginId)?.marketplace_id ?? null;
}

export function removeSupersededOplFamilyCodexConfigTables(
  text: string,
  packageId: string,
  pluginId: string,
) {
  const spec = resolveFamilyPluginSpec(packageId, pluginId);
  if (!spec) {
    return {
      text,
      removed: 0,
      removed_standalone_mcp_servers: 0,
      removed_superseded_plugin_tables: 0,
    };
  }
  const legacyMarketplaceIds = supersededMarketplaceIds(packageId, pluginId);
  const retiredPlugins = removeTomlTables(text, (header) =>
    legacyMarketplaceIds.some((marketplaceId) =>
      header === `[marketplaces.${marketplaceId}]`
      || header === `[marketplaces.${quoteTomlTableSegment(marketplaceId)}]`
      || (header.startsWith('[plugins."') && header.endsWith(`@${marketplaceId}"]`))
    )
  );
  const retiredMcp = removeStandaloneMcpServerTables(retiredPlugins.text, spec);
  return {
    text: retiredMcp.text,
    removed: retiredPlugins.removed + retiredMcp.removed,
    removed_standalone_mcp_servers: retiredMcp.removed,
    removed_superseded_plugin_tables: retiredPlugins.removed,
  };
}

export function removeSupersededOplFamilyCodexPluginPaths(
  packageId: string,
  pluginId: string,
  home = resolveHomeDir(),
  dryRun = false,
) {
  const codexHome = process.env.CODEX_HOME?.trim() || path.join(home, '.codex');
  const stateDir = resolveOplStateDir(home);
  const candidates = supersededMarketplaceIds(packageId, pluginId).flatMap((marketplaceId) => [
    path.join(stateDir, 'codex-plugin-marketplaces', marketplaceId),
    path.join(codexHome, 'plugins', 'cache', marketplaceId),
  ]);
  const existing = candidates.filter((candidate) => fs.existsSync(candidate));
  if (dryRun) {
    return [];
  }
  for (const candidate of existing) {
    fs.rmSync(candidate, { recursive: true, force: true });
  }
  return existing;
}

function writeJsonFile(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function resolveFirstExistingPath(candidates: string[]) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function resolvePluginSourcePath(spec: CodexFamilyPluginSpec, repoPath: string) {
  return resolveFirstExistingPath([
    path.join(repoPath, '.codex-plugin', 'plugin.json'),
    path.join(repoPath, 'plugins', spec.plugin_id, '.codex-plugin', 'plugin.json'),
  ]);
}

function defaultRepoPathForSpec(spec: CodexFamilyPluginSpec, codexConfigPath: string) {
  if (spec.pack_id === 'scholarskills') {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  }
  return path.join(path.dirname(path.dirname(path.dirname(codexConfigPath))), spec.repo_name);
}

function readJsonRecord(filePath: string): Record<string, unknown> {
  const parsed = parseJsonText(fs.readFileSync(filePath, 'utf8'));
  return isRecord(parsed) ? parsed : {};
}

function materializeRepoLocalPluginCarrier(
  spec: LocalCodexPluginMarketplaceSpec,
  pluginSourcePath: string,
  linkPath: string,
) {
  const sourceManifest = readJsonRecord(path.join(pluginSourcePath, '.codex-plugin', 'plugin.json'));
  if (sourceManifest.name !== spec.plugin_id) {
    throw new Error(`Plugin manifest name mismatch: expected ${spec.plugin_id}, got ${String(sourceManifest.name)}`);
  }

  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.cpSync(pluginSourcePath, linkPath, { recursive: true });
}

export function materializeLocalCodexPluginMarketplace(
  spec: LocalCodexPluginMarketplaceSpec,
  pluginSourcePath: string,
  marketplaceRoot: string,
): LocalCodexPluginMarketplace {
  const marketplacePath = path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
  const linkPath = path.join(marketplaceRoot, 'plugins', spec.plugin_id);
  const pluginManifestPath = path.join(linkPath, '.codex-plugin', 'plugin.json');

  materializeRepoLocalPluginCarrier(spec, pluginSourcePath, linkPath);
  writeJsonFile(marketplacePath, {
    name: spec.marketplace_id,
    interface: {
      displayName: spec.display_name,
    },
    plugins: [
      {
        name: spec.plugin_id,
        source: {
          source: 'local',
          path: `./plugins/${spec.plugin_id}`,
        },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_INSTALL',
        },
        category: spec.category,
      },
    ],
  });

  return {
    marketplace_root: marketplaceRoot,
    marketplace_path: marketplacePath,
    plugin_manifest_path: pluginManifestPath,
    marketplace_plugin_path: linkPath,
  };
}

export function registerLocalCodexPlugin(
  configPath: string,
  spec: Pick<LocalCodexPluginMarketplaceSpec, 'marketplace_id' | 'plugin_id'>,
  marketplaceRoot: string,
  removeTables: ((text: string) => { text: string; removed: number }) | null = null,
) {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  let text = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const removal = removeTables?.(text) ?? { text, removed: 0 };
  text = removal.text;
  text = upsertTomlTable(text, `[marketplaces.${spec.marketplace_id}]`, [
    'source_type = "local"',
    `source = "${escapeTomlString(marketplaceRoot)}"`,
  ]);
  text = upsertTomlTable(text, `[plugins."${spec.plugin_id}@${spec.marketplace_id}"]`, [
    'enabled = true',
  ]);
  fs.writeFileSync(configPath, text, 'utf8');
  return removal.removed;
}

export function unregisterLocalCodexPlugin(
  configPath: string,
  marketplaceId: string | null,
  pluginId: string | null,
) {
  if (!marketplaceId || !pluginId || !fs.existsSync(configPath)) {
    return;
  }
  let text = fs.readFileSync(configPath, 'utf8');
  text = removeTomlTable(text, `[plugins."${escapeTomlString(`${pluginId}@${marketplaceId}`)}"]`);
  text = removeTomlTable(text, `[marketplaces.${marketplaceId}]`);
  fs.writeFileSync(configPath, `${text.trimEnd()}\n`, 'utf8');
}

function registerOplConnectMcpServer(configPath: string): CodexPluginRegistryResult['unified_mcp_server'] {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const current = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
  const tableHeaders = [
    `[mcp_servers.${OPL_CONNECT_MCP_SERVER_ID}]`,
    `[mcp_servers.${quoteTomlTableSegment(OPL_CONNECT_MCP_SERVER_ID)}]`,
  ];
  const withoutStaleServer = removeTomlTables(current, (header) => tableHeaders.some(
    (tableHeader) => header === tableHeader || header.startsWith(`${tableHeader.slice(0, -1)}.`),
  ));
  const text = upsertTomlTable(withoutStaleServer.text, tableHeaders[0], [
    'command = "opl"',
    'args = ["connect", "mcp-stdio"]',
  ]);
  fs.writeFileSync(configPath, text, 'utf8');
  return {
    server_id: OPL_CONNECT_MCP_SERVER_ID,
    status: 'registered',
    owner: 'one-person-lab',
    transport: 'stdio',
    command: 'opl',
    args: ['connect', 'mcp-stdio'],
    read_only_default: true,
    progressive_discovery: true,
  };
}

export function registerOplFamilyCodexPlugins(
  selectedPacks: CodexPluginRegistryPackId[],
  moduleRepoPaths: Map<CodexPluginRegistryPackId, string>,
  home = resolveHomeDir(),
): CodexPluginRegistryResult {
  const codexConfigPath = resolveCodexConfigPath(home);
  const selected = new Set<string>(selectedPacks);
  const items: CodexPluginRegistryItem[] = [];
  let removedStandaloneMcpServers = 0;
  let removedSupersededPluginTables = 0;
  const removedSupersededPluginPaths: string[] = [];

  for (const spec of FAMILY_PLUGIN_SPECS) {
    if (!selected.has(spec.pack_id)) {
      continue;
    }

    const repoPath = moduleRepoPaths.get(spec.pack_id) ?? defaultRepoPathForSpec(spec, codexConfigPath);
    const pluginManifestPath = resolvePluginSourcePath(spec, repoPath);
    if (!fs.existsSync(pluginManifestPath)) {
      const pluginSourcePath = path.dirname(path.dirname(pluginManifestPath));
      items.push({
        module_id: spec.module_id,
        pack_id: spec.pack_id,
        marketplace_id: spec.marketplace_id,
        plugin_id: spec.plugin_id,
        repo_path: repoPath,
        plugin_source_path: pluginSourcePath,
        plugin_manifest_path: pluginManifestPath,
        marketplace_root: path.join(resolveOplStateDir(home), 'codex-plugin-marketplaces', spec.marketplace_id),
        marketplace_path: path.join(resolveOplStateDir(home), 'codex-plugin-marketplaces', spec.marketplace_id, '.agents', 'plugins', 'marketplace.json'),
        marketplace_plugin_path: path.join(resolveOplStateDir(home), 'codex-plugin-marketplaces', spec.marketplace_id, 'plugins', spec.plugin_id),
        status: 'missing_plugin_manifest',
        ownership_kind: spec.ownership_kind,
        distribution_role: spec.distribution_role,
        framework_owned_capability: spec.framework_owned_capability,
        domain_module: spec.domain_module,
        brand_module: spec.brand_module,
        authority_boundary: spec.authority_boundary,
        note: 'The module checkout must provide a tracked repo-local Codex plugin carrier so OPL can copy it into the local marketplace without writing into the module repo.',
      });
      continue;
    }

    const pluginSourcePath = path.dirname(path.dirname(pluginManifestPath));
    const marketplaceRoot = path.join(resolveOplStateDir(home), 'codex-plugin-marketplaces', spec.marketplace_id);
    const marketplace = materializeLocalCodexPluginMarketplace(spec, pluginSourcePath, marketplaceRoot);
    registerLocalCodexPlugin(
      codexConfigPath,
      spec,
      marketplace.marketplace_root,
      (text) => {
        const removal = removeSupersededOplFamilyCodexConfigTables(
          text,
          spec.pack_id,
          spec.plugin_id,
        );
        removedStandaloneMcpServers += removal.removed_standalone_mcp_servers;
        removedSupersededPluginTables += removal.removed_superseded_plugin_tables;
        return removal;
      },
    );
    removedSupersededPluginPaths.push(...removeSupersededOplFamilyCodexPluginPaths(
      spec.pack_id,
      spec.plugin_id,
      home,
    ));
    items.push({
      module_id: spec.module_id,
      pack_id: spec.pack_id,
      marketplace_id: spec.marketplace_id,
      plugin_id: spec.plugin_id,
      repo_path: repoPath,
      plugin_source_path: pluginSourcePath,
      plugin_manifest_path: marketplace.plugin_manifest_path,
      marketplace_root: marketplace.marketplace_root,
      marketplace_path: marketplace.marketplace_path,
      marketplace_plugin_path: marketplace.marketplace_plugin_path,
      status: 'registered',
      ownership_kind: spec.ownership_kind,
      distribution_role: spec.distribution_role,
      framework_owned_capability: spec.framework_owned_capability,
      domain_module: spec.domain_module,
      brand_module: spec.brand_module,
      authority_boundary: spec.authority_boundary,
      note: null,
    });
  }

  const unifiedMcpServer = registerOplConnectMcpServer(codexConfigPath);

  return {
    surface_id: 'opl_codex_plugin_registry',
    codex_config_path: codexConfigPath,
    unified_mcp_server: unifiedMcpServer,
    items,
    summary: {
      total: items.length,
      registered: items.filter((item) => item.status === 'registered').length,
      missing_marketplace: items.filter((item) => item.status === 'missing_plugin_manifest').length,
      missing_plugin_manifest: items.filter((item) => item.status === 'missing_plugin_manifest').length,
      removed_standalone_mcp_servers: removedStandaloneMcpServers,
      removed_superseded_plugin_tables: removedSupersededPluginTables,
      removed_superseded_plugin_paths: removedSupersededPluginPaths,
      registered_unified_mcp_servers: 1,
    },
  };
}
