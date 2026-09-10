import fs from 'node:fs';
import path from 'node:path';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import {
  agentPluginSkillsRelativeRoot,
  resolveAgentPluginManifest,
} from '../../../kernel/agent-plugin-manifest.ts';
import { parseJsonText } from '../../../kernel/json-file.ts';
import {
  parseTomlDocument,
  renderTomlDocument,
} from './codex-config-document.ts';
import {
  configuredCodexHome,
  localReadbackFailure,
  pluginBareName,
  stringValue,
} from './configured-codex-plugin-carrier-native.ts';
import type {
  CodexPluginListEntry,
} from './configured-codex-plugin-carrier-types.ts';
import type { AgentPackageConfiguredCodexPluginCarrierDescriptor } from './types.ts';

type TomlTable = ReturnType<typeof parseTomlDocument>['tables'][number];

function realDirectory(candidatePath: string) {
  const resolved = path.resolve(candidatePath);
  try {
    const stat = fs.lstatSync(resolved);
    return stat.isDirectory() && !stat.isSymbolicLink()
      ? fs.realpathSync(resolved)
      : null;
  } catch {
    return null;
  }
}
function safeRelativeDirectory(rootPath: string, rootReal: string, relativePath: string) {
  if (path.isAbsolute(relativePath)) return null;
  const resolved = path.resolve(rootPath, relativePath);
  const relative = path.relative(rootPath, resolved);
  try {
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
    let current = rootPath;
    for (const component of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
    }
    const real = fs.realpathSync(resolved);
    return real === rootReal || real.startsWith(`${rootReal}${path.sep}`) ? resolved : null;
  } catch {
    return null;
  }
}

function pluginSkillsRef(sourceRoot: string, sourceRootReal: string) {
  try {
    const resolved = resolveAgentPluginManifest([sourceRoot]);
    if (!resolved || resolved.pluginRoot !== sourceRoot) return null;
    return agentPluginSkillsRelativeRoot(resolved);
  } catch {
    return null;
  }
}

function safePluginSkillsRoot(sourcePath: string | null) {
  if (!sourcePath) return null;
  const sourceRoot = path.resolve(sourcePath);
  const sourceRootReal = realDirectory(sourceRoot);
  if (!sourceRootReal) return null;
  const relativeSkillsRoot = pluginSkillsRef(sourceRoot, sourceRootReal);
  return relativeSkillsRoot
    ? safeRelativeDirectory(sourceRoot, sourceRootReal, relativeSkillsRoot)
    : null;
}

function isSafeRequiredSkillFile(skillsRoot: string, skillsRootReal: string, skillId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(skillId)) return false;
  const skillDirectory = path.join(skillsRoot, skillId);
  const skillPath = path.join(skillDirectory, 'SKILL.md');
  try {
    const skillDirectoryStat = fs.lstatSync(skillDirectory);
    const skillStat = fs.lstatSync(skillPath);
    const skillReal = fs.realpathSync(skillPath);
    return skillDirectoryStat.isDirectory() && !skillDirectoryStat.isSymbolicLink()
      && skillStat.isFile() && !skillStat.isSymbolicLink()
      && skillReal.startsWith(`${skillsRootReal}${path.sep}`);
  } catch {
    return false;
  }
}

export function missingRequiredSkills(sourcePath: string | null, requiredSkillIds: string[]) {
  const skillsRoot = safePluginSkillsRoot(sourcePath);
  if (!skillsRoot) return requiredSkillIds;
  const skillsRootReal = fs.realpathSync(skillsRoot);
  return requiredSkillIds.filter(
    (skillId) => !isSafeRequiredSkillFile(skillsRoot, skillsRootReal, skillId),
  );
}

function tomlTableValue(table: TomlTable, key: string, required: boolean) {
  const matches = table.content.split('\n').slice(1).flatMap((line) => {
    const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`));
    return match ? [match[1]] : [];
  });
  if (matches.length > 1 || (required && matches.length !== 1)) {
    localReadbackFailure('configured_codex_plugin_carrier_local_config_invalid',
      'Configured Codex local carrier table has a missing or duplicate required key.', {
        table: table.header, key, value_count: matches.length,
      });
  }
  return matches[0] ?? null;
}

function tomlStringValue(table: TomlTable, key: string) {
  const raw = tomlTableValue(table, key, true)!;
  try {
    const parsed = parseJsonText(raw);
    if (typeof parsed === 'string' && parsed.trim()) return parsed;
  } catch {
    // The owner-generated local carrier uses TOML basic strings compatible with JSON string syntax.
  }
  return localReadbackFailure(
    'configured_codex_plugin_carrier_local_config_invalid',
    'Configured Codex local carrier string is invalid.',
    { table: table.header, key },
  );
}

function tomlEnabledValue(table: TomlTable) {
  const raw = tomlTableValue(table, 'enabled', false);
  if (raw === null || raw === 'true') return true;
  if (raw === 'false') return false;
  return localReadbackFailure(
    'configured_codex_plugin_carrier_local_config_invalid',
    'Configured Codex local carrier enabled flag is invalid.',
    { table: table.header },
  );
}

function safeRealDirectory(candidatePath: string, rootPath?: string) {
  const resolved = path.resolve(candidatePath);
  try {
    const stat = fs.lstatSync(resolved);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('not a real directory');
    const real = fs.realpathSync(resolved);
    if (rootPath) {
      const root = path.resolve(rootPath);
      const rootReal = fs.realpathSync(root);
      if (real === rootReal || !real.startsWith(`${rootReal}${path.sep}`)) {
        throw new Error('directory escapes owner root');
      }
    }
    return resolved;
  } catch {
    return localReadbackFailure(
      'configured_codex_plugin_carrier_local_source_unsafe',
      'Configured Codex local carrier source directory is missing or unsafe.',
      { candidate_path: resolved, owner_root: rootPath ?? null },
    );
  }
}

function safeJsonRecord(filePath: string, rootPath: string) {
  const resolved = path.resolve(filePath);
  const root = path.resolve(rootPath);
  try {
    const stat = fs.lstatSync(resolved);
    const real = fs.realpathSync(resolved);
    const rootReal = fs.realpathSync(root);
    if (!stat.isFile() || stat.isSymbolicLink() || !real.startsWith(`${rootReal}${path.sep}`)) {
      throw new Error('JSON path is not a real file inside its owner root');
    }
    const parsed = parseJsonText(fs.readFileSync(resolved, 'utf8'));
    if (!isRecord(parsed)) throw new Error('JSON root is not an object');
    return parsed;
  } catch {
    return localReadbackFailure(
      'configured_codex_plugin_carrier_local_manifest_invalid',
      'Configured Codex local carrier manifest is missing, unsafe, or invalid.',
      { manifest_path: resolved, owner_root: root },
    );
  }
}

function assertSafeRequiredSkills(sourcePath: string, requiredSkillIds: string[]) {
  const skillsRoot = safePluginSkillsRoot(sourcePath);
  if (!skillsRoot) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_local_required_skill_invalid',
      'Configured Codex local carrier Skill root is missing or unsafe.',
      { plugin_source_path: sourcePath },
    );
  }
  const skillsRootReal = fs.realpathSync(skillsRoot);
  for (const skillId of requiredSkillIds) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(skillId)) {
      localReadbackFailure(
        'configured_codex_plugin_carrier_local_required_skill_invalid',
        'Configured Codex local carrier has an invalid required Skill identity.',
        { required_skill_id: skillId },
      );
    }
    const skillPath = path.join(skillsRoot, skillId, 'SKILL.md');
    if (!isSafeRequiredSkillFile(skillsRoot, skillsRootReal, skillId)) {
      localReadbackFailure(
        'configured_codex_plugin_carrier_local_required_skill_invalid',
        'Configured Codex local carrier required Skill is missing or unsafe.',
        { required_skill_id: skillId, required_skill_path: skillPath },
      );
    }
  }
}

function assertSafePluginTree(sourcePath: string) {
  const sourceRootReal = fs.realpathSync(sourcePath);
  const visit = (current: string) => {
    for (const entry of fs.readdirSync(current)) {
      const candidate = path.join(current, entry);
      const stat = fs.lstatSync(candidate);
      const real = fs.realpathSync(candidate);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())
        || !real.startsWith(`${sourceRootReal}${path.sep}`)) {
        localReadbackFailure(
          'configured_codex_plugin_carrier_local_source_unsafe',
          'Configured Codex local plugin tree contains an unsafe filesystem entry.',
          { plugin_source_path: sourcePath, unsafe_path: candidate },
        );
      }
      if (stat.isDirectory()) visit(candidate);
    }
  };
  visit(sourcePath);
}

export function readConfiguredLocalPluginEntry(input: {
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor; env: NodeJS.ProcessEnv;
}): CodexPluginListEntry {
  const pluginId = input.descriptor.carrier.pluginId;
  const separator = pluginId.lastIndexOf('@');
  const pluginName = pluginId.slice(0, separator);
  const marketplaceId = pluginId.slice(separator + 1);
  const codexHome = safeRealDirectory(configuredCodexHome(input.env));
  const configPath = path.join(codexHome, 'config.toml');
  let configText: string;
  try {
    const stat = fs.lstatSync(configPath);
    const real = fs.realpathSync(configPath);
    const codexHomeReal = fs.realpathSync(codexHome);
    if (!stat.isFile() || stat.isSymbolicLink() || !real.startsWith(`${codexHomeReal}${path.sep}`)) {
      throw new Error('config is not a real file inside Codex home');
    }
    configText = fs.readFileSync(configPath, 'utf8');
  } catch {
    localReadbackFailure(
      'configured_codex_plugin_carrier_local_config_missing',
      'Configured Codex local carrier config is missing or unsafe.',
      { config_path: configPath },
    );
  }
  const document = parseTomlDocument(configText);
  const sameNamePluginTables = document.tables.filter((table) => {
    if (!table.header.startsWith('plugins.')) return false;
    return pluginBareName(table.header.slice('plugins.'.length)) === pluginName;
  });
  const pluginTables = sameNamePluginTables.filter((table) => table.header === `plugins.${pluginId}`);
  const marketplaceTables = document.tables.filter(
    (table) => table.header === `marketplaces.${marketplaceId}`,
  );
  if (sameNamePluginTables.length !== 1
    || pluginTables.length !== 1
    || marketplaceTables.length !== 1) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_local_config_ambiguous',
      'Configured Codex local carrier does not have one exact plugin and marketplace table.',
      {
        plugin_id: pluginId,
        same_name_plugin_table_count: sameNamePluginTables.length,
        exact_plugin_table_count: pluginTables.length,
        marketplace_table_count: marketplaceTables.length,
      },
    );
  }
  const marketplaceTable = marketplaceTables[0];
  if (tomlStringValue(marketplaceTable, 'source_type') !== 'local') {
    localReadbackFailure(
      'configured_codex_plugin_carrier_local_marketplace_required',
      'Configured Codex filesystem readback only accepts a local marketplace.',
      { marketplace_id: marketplaceId },
    );
  }
  const configuredSource = tomlStringValue(marketplaceTable, 'source');
  const declaredSource = input.descriptor.carrier.marketplaceSource;
  if (!declaredSource
    || !path.isAbsolute(configuredSource)
    || path.resolve(configuredSource) !== path.resolve(declaredSource)) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_local_marketplace_identity_mismatch',
      'Configured Codex local marketplace does not match the owner descriptor.',
      {
        marketplace_id: marketplaceId,
        configured_source: configuredSource,
        declared_source: declaredSource,
      },
    );
  }
  const marketplaceRoot = safeRealDirectory(configuredSource);
  const marketplaceManifest = safeJsonRecord(
    path.join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json'), marketplaceRoot);
  if (stringValue(marketplaceManifest.name) !== marketplaceId
    || !Array.isArray(marketplaceManifest.plugins)) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_local_marketplace_identity_mismatch',
      'Configured Codex local marketplace manifest identity is invalid.',
      { marketplace_id: marketplaceId },
    );
  }
  const matchingPlugins = marketplaceManifest.plugins.flatMap((value) => {
    const entry = isRecord(value) ? value : null;
    return entry && stringValue(entry.name) === pluginName ? [entry] : [];
  });
  if (matchingPlugins.length !== 1) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_local_marketplace_identity_mismatch',
      'Configured Codex local marketplace must declare one exact plugin source.',
      { plugin_id: pluginId, matching_plugin_count: matchingPlugins.length },
    );
  }
  const source = isRecord(matchingPlugins[0].source) ? matchingPlugins[0].source : null;
  const relativeSourcePath = stringValue(source?.path);
  if (stringValue(source?.source) !== 'local'
    || !relativeSourcePath
    || path.isAbsolute(relativeSourcePath)) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_local_source_unsafe',
      'Configured Codex local marketplace plugin source is not a safe relative local path.',
      { plugin_id: pluginId, source_path: relativeSourcePath },
    );
  }
  const pluginSourcePath = safeRealDirectory(path.resolve(marketplaceRoot, relativeSourcePath), marketplaceRoot);
  const resolvedPlugin = resolveAgentPluginManifest([pluginSourcePath], { expectedName: pluginName });
  if (!resolvedPlugin) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_local_manifest_invalid',
      'Configured Codex local carrier manifest is missing.',
      { plugin_source_path: pluginSourcePath },
    );
  }
  const pluginManifest = resolvedPlugin.manifest;
  const version = stringValue(pluginManifest.version);
  if (stringValue(pluginManifest.name) !== pluginName || !version) {
    localReadbackFailure(
      'configured_codex_plugin_carrier_local_plugin_identity_mismatch',
      'Configured Codex local plugin manifest identity is invalid.',
      { plugin_id: pluginId },
    );
  }
  assertSafePluginTree(pluginSourcePath);
  assertSafeRequiredSkills(pluginSourcePath, input.descriptor.executor.requiredSkillIds);
  return { pluginId, version, installed: true, enabled: tomlEnabledValue(pluginTables[0]),
    sourcePath: pluginSourcePath, marketplaceSource: marketplaceRoot };
}

function replacePluginEnabledTable(input: {
  configPath: string;
  pluginId: string;
  enabled: boolean;
  beforeConfigReplace?: () => void;
}) {
  const beforeExists = fs.existsSync(input.configPath);
  const before = beforeExists
    ? fs.readFileSync(input.configPath, 'utf8')
    : '';
  const expectedHeader = `plugins.${input.pluginId}`;
  const document = parseTomlDocument(before);
  const target = document.tables.find((table) => table.header === expectedHeader) ?? null;
  const enabledLine = `enabled = ${input.enabled ? 'true' : 'false'}`;
  const tables = target
    ? document.tables.map((table) => {
      if (table !== target) return table;
      const lines = table.content.trimEnd().split('\n');
      const enabledIndexes = lines.flatMap((line, index) => /^\s*enabled\s*=/.test(line) ? [index] : []);
      if (enabledIndexes.length > 1) {
        throw new FrameworkContractError(
          'contract_shape_invalid',
          'Configured Codex plugin table has duplicate enabled keys.',
          {
            plugin_id: input.pluginId,
            config_path: input.configPath,
            failure_code: 'configured_codex_plugin_carrier_config_duplicate_enabled',
          },
        );
      }
      if (enabledIndexes.length === 1) lines[enabledIndexes[0]] = enabledLine;
      else lines.push(enabledLine);
      return { content: `${lines.join('\n').trimEnd()}\n` };
    })
    : [
      ...document.tables,
      { content: `[plugins."${input.pluginId}"]\n${enabledLine}\n` },
    ];
  const after = renderTomlDocument(document.preamble, tables);
  if (after === before) return false;
  fs.mkdirSync(path.dirname(input.configPath), { recursive: true });
  const temporary = path.join(
    path.dirname(input.configPath),
    `.${path.basename(input.configPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, after, { encoding: 'utf8', mode: 0o600 });
    input.beforeConfigReplace?.();
    const currentExists = fs.existsSync(input.configPath);
    const current = currentExists
      ? fs.readFileSync(input.configPath, 'utf8')
      : '';
    if (currentExists !== beforeExists || current !== before) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Codex config changed during configured plugin toggle.',
        {
          plugin_id: input.pluginId,
          config_path: input.configPath,
          failure_code: 'configured_codex_plugin_carrier_config_apply_conflict',
        },
      );
    }
    fs.renameSync(temporary, input.configPath);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
  return true;
}

export function setConfiguredPluginEnabled(input: {
  descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  entries: CodexPluginListEntry[];
  enabled: boolean;
  env: NodeJS.ProcessEnv;
  beforeConfigReplace?: () => void;
  selection: (input: {
    entries: CodexPluginListEntry[];
    descriptor: AgentPackageConfiguredCodexPluginCarrierDescriptor;
  }) => {
    entry: CodexPluginListEntry | null;
    ambiguous: boolean;
    unexpectedOnly: boolean;
  };
  precedence: (input: {
    ambiguous: boolean;
    unexpectedOnly: boolean;
    installed: boolean;
  }) => string;
}) {
  const selection = input.selection({
    entries: input.entries,
    descriptor: input.descriptor,
  });
  if (!selection.entry?.installed || selection.ambiguous || selection.unexpectedOnly) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Configured Codex plugin toggle requires one exact installed native carrier source.',
      {
        package_id: input.descriptor.packageId,
        plugin_id: input.descriptor.carrier.pluginId,
        precedence: input.precedence({
          ambiguous: selection.ambiguous,
          unexpectedOnly: selection.unexpectedOnly,
          installed: Boolean(selection.entry?.installed),
        }),
        failure_code: 'configured_codex_plugin_carrier_toggle_requires_exact_installed_source',
      },
    );
  }
  return replacePluginEnabledTable({
    configPath: path.join(configuredCodexHome(input.env), 'config.toml'),
    pluginId: input.descriptor.carrier.pluginId,
    enabled: input.enabled,
    beforeConfigReplace: input.beforeConfigReplace,
  });
}
