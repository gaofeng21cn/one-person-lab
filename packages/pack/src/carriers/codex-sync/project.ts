import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveStatePaths } from '@opl/core';
import { PackError } from '../../errors.ts';
import { CODEX_PLUGIN_NAME_REGEX, type OplPackageManifestV2 } from '../../manifest/schema.ts';
import {
  isWithinDirectory,
  normalizeRelativePosixPath,
  resolveSafePackagePath,
} from '../../manifest/validate.ts';

export const OPL_LOCAL_MARKETPLACE_NAME = 'opl-local';

export interface CodexMarketplacePaths {
  readonly marketplace_root: string;
  readonly agents_marketplace_json: string;
  readonly root_marketplace_json: string;
  readonly plugins_dir: string;
}

export function resolveCodexMarketplaceRoot(options: {
  readonly marketplaceRoot?: string;
  readonly stateDir?: string;
  readonly env?: NodeJS.ProcessEnv;
} = {}): string {
  const env = options.env ?? process.env;
  const explicitMarketplace = options.marketplaceRoot?.trim() || env.OPL_CODEX_MARKETPLACE_DIR?.trim();
  if (explicitMarketplace) {
    return path.resolve(explicitMarketplace);
  }
  const explicitStateDir = options.stateDir?.trim() || env.OPL_STATE_DIR?.trim();
  if (explicitStateDir) {
    return path.join(path.resolve(explicitStateDir), 'carriers', 'codex-marketplace');
  }
  // Enforce test-context guard via resolveStatePaths() so tests never mutate user's ~/.opl.
  resolveStatePaths();
  const homeDir = env.HOME?.trim() || os.homedir();
  return path.join(homeDir, '.opl', 'carriers', 'codex-marketplace');
}

export function getCodexMarketplacePaths(marketplaceRoot: string): CodexMarketplacePaths {
  const root = path.resolve(marketplaceRoot);
  return {
    marketplace_root: root,
    agents_marketplace_json: path.join(root, '.agents', 'plugins', 'marketplace.json'),
    root_marketplace_json: path.join(root, 'marketplace.json'),
    plugins_dir: path.join(root, 'plugins'),
  };
}

export function shouldSyncToCodex(manifest: OplPackageManifestV2): boolean {
  const hint = manifest.host_hints?.codex;
  if (hint?.sync_enabled === false) return false;
  if (hint?.sync_enabled === true) return true;
  const hasSkills = (manifest.provides?.skills?.length ?? 0) > 0;
  const hasMcp = (manifest.provides?.mcp_servers?.length ?? 0) > 0;
  return hasSkills || hasMcp;
}

export function assertSafeCodexPluginName(pluginName: string): string {
  const trimmed = pluginName.trim();
  if (
    !trimmed
    || trimmed.length > 128
    || trimmed.includes('..')
    || trimmed.includes('/')
    || trimmed.includes('\\')
    || !CODEX_PLUGIN_NAME_REGEX.test(trimmed)
  ) {
    throw new PackError(
      'INVALID_MANIFEST',
      `Unsafe Codex plugin_name '${pluginName}': must match ${CODEX_PLUGIN_NAME_REGEX.source} without path traversal.`,
      { plugin_name: pluginName },
    );
  }
  return trimmed;
}

function resolveSafePluginTargetDir(pluginsDir: string, pluginName: string): string {
  const safeName = assertSafeCodexPluginName(pluginName);
  const resolvedPluginsDir = path.resolve(pluginsDir);
  const resolvedPluginDir = path.resolve(resolvedPluginsDir, safeName);
  if (!isWithinDirectory(resolvedPluginsDir, resolvedPluginDir) || resolvedPluginDir === resolvedPluginsDir) {
    throw new PackError(
      'INVALID_MANIFEST',
      `Codex plugin directory '${resolvedPluginDir}' escapes marketplace plugins directory '${resolvedPluginsDir}'.`,
      { plugin_name: pluginName, plugins_dir: resolvedPluginsDir },
    );
  }
  return resolvedPluginDir;
}

export function resolveCodexPluginName(manifest: OplPackageManifestV2): string {
  return assertSafeCodexPluginName(
    manifest.host_hints?.codex?.plugin_name?.trim() || manifest.identity.id,
  );
}

export function defaultCodexCategoryForIntent(
  intent: OplPackageManifestV2['identity']['intent'],
): string {
  switch (intent) {
    case 'agent':
      return 'Research';
    case 'app':
      return 'Productivity';
    case 'channel':
      return 'Communication';
    case 'extension':
    default:
      return 'Developer Tools';
  }
}

export function deriveCodexCapabilities(manifest: OplPackageManifestV2): string[] {
  const caps = new Set<string>(['Interactive']);
  const wsAccess = manifest.permissions?.workspace?.access;
  if (wsAccess === 'read_write') {
    caps.add('Write');
  } else if (wsAccess === 'read') {
    caps.add('Read');
  }
  return [...caps];
}

function normalizeDotRelative(relPath: string): string {
  const clean = normalizeRelativePosixPath(relPath);
  return `./${clean}`;
}

function resolveMcpPathArg(installPath: string, value: string, allowSymlinks = true): string {
  if (value.startsWith('${PLUGIN_ROOT}/')) {
    return resolveSafePackagePath(installPath, value.slice('${PLUGIN_ROOT}/'.length), { allowSymlinks });
  }
  if (value === '${PLUGIN_ROOT}') {
    return installPath;
  }
  if (value.startsWith('./') || value.startsWith('../')) {
    return resolveSafePackagePath(installPath, value, { allowSymlinks });
  }
  return value;
}

export function buildCodexPluginJson(manifest: OplPackageManifestV2): Record<string, unknown> {
  const pluginName = resolveCodexPluginName(manifest);
  const hint = manifest.host_hints?.codex;
  const hasSkills = (manifest.provides?.skills?.length ?? 0) > 0;
  const hasMcp = (manifest.provides?.mcp_servers?.length ?? 0) > 0;
  const websiteURL = manifest.identity.homepage ?? manifest.identity.repository;
  const iconDot = manifest.identity.icon ? normalizeDotRelative(manifest.identity.icon) : undefined;

  return {
    name: pluginName,
    version: manifest.identity.version,
    description: manifest.identity.summary['en-US'],
    author: {
      name: manifest.identity.publisher,
      ...(manifest.identity.repository ? { url: manifest.identity.repository } : {}),
    },
    ...(manifest.identity.homepage ? { homepage: manifest.identity.homepage } : {}),
    ...(manifest.identity.repository ? { repository: manifest.identity.repository } : {}),
    ...(manifest.identity.license ? { license: manifest.identity.license } : {}),
    ...(manifest.identity.keywords?.length ? { keywords: [...manifest.identity.keywords] } : {}),
    ...(hasSkills ? { skills: './skills/' } : {}),
    ...(hasMcp ? { mcpServers: './mcp.json' } : {}),
    interface: {
      displayName: manifest.identity.name['en-US'],
      shortDescription: manifest.identity.summary['en-US'],
      longDescription: manifest.identity.description?.['en-US'] ?? manifest.identity.summary['en-US'],
      developerName: manifest.identity.publisher,
      category: hint?.category ?? defaultCodexCategoryForIntent(manifest.identity.intent),
      capabilities: hint?.capabilities?.length
        ? [...hint.capabilities]
        : deriveCodexCapabilities(manifest),
      ...(websiteURL ? { websiteURL } : {}),
      ...(iconDot ? { composerIcon: iconDot, logo: iconDot } : {}),
      ...(manifest.identity.default_prompts?.length
        ? { defaultPrompt: [...manifest.identity.default_prompts] }
        : {}),
      ...(hint?.brand_color ? { brandColor: hint.brand_color } : {}),
    },
  };
}

export function buildCodexMcpJson(
  manifest: OplPackageManifestV2,
  installPath: string,
  allowSymlinks = true,
): Record<string, unknown> | null {
  const servers = manifest.provides?.mcp_servers;
  if (!servers || servers.length === 0) return null;
  const realInstall = fs.realpathSync(installPath);
  const mcpServers: Record<string, unknown> = {};
  for (const server of servers) {
    if (server.transport === 'stdio') {
      mcpServers[server.id] = {
        type: 'stdio',
        command: resolveMcpPathArg(realInstall, server.command ?? '', allowSymlinks),
        args: (server.args ?? []).map((arg) => resolveMcpPathArg(realInstall, arg, allowSymlinks)),
        cwd: realInstall,
        ...(server.env_refs?.length ? { envRefs: [...server.env_refs] } : {}),
      };
    } else {
      mcpServers[server.id] = {
        type: 'http',
        url: server.url,
      };
    }
  }
  return {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers,
  };
}

export interface MarketplacePluginEntry {
  readonly name: string;
  readonly source: {
    readonly source: 'local';
    readonly path: string;
  };
  readonly policy: {
    readonly installation: 'AVAILABLE';
    readonly authentication: 'ON_INSTALL';
  };
  readonly opl_package_id: string;
  readonly version: string;
}

interface MarketplaceDocument {
  name: string;
  interface?: { displayName: string };
  plugins: MarketplacePluginEntry[];
}

function readMarketplaceDoc(filePath: string): MarketplaceDocument {
  if (!fs.existsSync(filePath)) {
    return {
      name: OPL_LOCAL_MARKETPLACE_NAME,
      interface: { displayName: 'OPL Local Plugins' },
      plugins: [],
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<MarketplaceDocument>;
    return {
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name : OPL_LOCAL_MARKETPLACE_NAME,
      interface: parsed.interface ?? { displayName: 'OPL Local Plugins' },
      plugins: Array.isArray(parsed.plugins) ? parsed.plugins : [],
    };
  } catch {
    return {
      name: OPL_LOCAL_MARKETPLACE_NAME,
      interface: { displayName: 'OPL Local Plugins' },
      plugins: [],
    };
  }
}

function writeMarketplaceDocs(paths: CodexMarketplacePaths, doc: MarketplaceDocument): void {
  const jsonText = `${JSON.stringify(doc, null, 2)}\n`;
  fs.mkdirSync(path.dirname(paths.agents_marketplace_json), { recursive: true });
  fs.writeFileSync(paths.agents_marketplace_json, jsonText, 'utf8');
  fs.mkdirSync(path.dirname(paths.root_marketplace_json), { recursive: true });
  fs.writeFileSync(paths.root_marketplace_json, jsonText, 'utf8');
}

// Codex omits symlinks when it stages a local plugin in its installation cache.
// Materialize declared resources with copy-on-write where the filesystem supports it.
function copyCarrierResource(
  packageRoot: string,
  source: string,
  destination: string,
  allowSymlinks: boolean,
  ancestors = new Set<string>(),
): void {
  let stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) {
    const relativePath = path.relative(packageRoot, source).split(path.sep).join('/');
    source = resolveSafePackagePath(packageRoot, relativePath, { allowSymlinks });
    stat = fs.statSync(source);
  }
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_FICLONE);
    return;
  }
  if (!stat.isDirectory() || ancestors.has(source) || isWithinDirectory(source, destination)) {
    throw new PackError('INVALID_INPUT', `Invalid or recursive Codex plugin resource at '${source}'.`);
  }
  ancestors.add(source);
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source)) {
    copyCarrierResource(packageRoot, path.join(source, entry), path.join(destination, entry), allowSymlinks, ancestors);
  }
  ancestors.delete(source);
}

export function projectPackageToCodexMarketplace(input: {
  readonly manifest: OplPackageManifestV2;
  readonly installPath: string;
  readonly marketplaceRoot: string;
  readonly allowSymlinksInSource?: boolean;
}): {
  readonly plugin_name: string;
  readonly plugin_dir: string;
  readonly marketplace_paths: CodexMarketplacePaths;
  readonly plugin_json: Record<string, unknown>;
} {
  const realInstall = fs.realpathSync(input.installPath);
  const allowSymlinks = input.allowSymlinksInSource ?? true;
  const pluginName = resolveCodexPluginName(input.manifest);
  const paths = getCodexMarketplacePaths(input.marketplaceRoot);
  const pluginDir = resolveSafePluginTargetDir(paths.plugins_dir, pluginName);

  const existingMarketplace = readMarketplaceDoc(paths.agents_marketplace_json);
  const colliding = existingMarketplace.plugins.find(
    (p) => p.name === pluginName && p.opl_package_id !== input.manifest.identity.id,
  );
  if (colliding) {
    throw new PackError(
      'PACK_CODEX_SYNC_FAILED',
      `Codex plugin_name '${pluginName}' is already registered by package '${colliding.opl_package_id}'.`,
      {
        reason: 'plugin_name_collision',
        plugin_name: pluginName,
        existing_package_id: colliding.opl_package_id,
        package_id: input.manifest.identity.id,
      },
    );
  }

  const pluginJson = buildCodexPluginJson(input.manifest);
  const mcpJson = buildCodexMcpJson(input.manifest, realInstall, allowSymlinks);

  // A failed resource copy must leave the previously installed projection usable.
  fs.mkdirSync(paths.plugins_dir, { recursive: true });
  const staging = fs.mkdtempSync(path.join(paths.plugins_dir, '.opl-stage-'));
  const stagedPlugin = path.join(staging, 'next');
  const priorPlugin = path.join(staging, 'previous');
  try {
    fs.mkdirSync(path.join(stagedPlugin, '.codex-plugin'), { recursive: true });
    fs.writeFileSync(
      path.join(stagedPlugin, '.codex-plugin', 'plugin.json'),
      `${JSON.stringify(pluginJson, null, 2)}\n`,
      'utf8',
    );

    if (mcpJson) {
      fs.writeFileSync(
        path.join(stagedPlugin, 'mcp.json'),
        `${JSON.stringify(mcpJson, null, 2)}\n`,
        'utf8',
      );
    }

    // Only package-declared skills belong in the native installation cache.
    for (const skill of input.manifest.provides?.skills ?? []) {
      const skillDir = resolveSafePackagePath(realInstall, skill.path, { allowSymlinks });
      resolveSafePackagePath(realInstall, `${normalizeRelativePosixPath(skill.path)}/SKILL.md`, {
        allowSymlinks,
      });
      copyCarrierResource(realInstall, skillDir, path.join(stagedPlugin, 'skills', skill.id), allowSymlinks);
    }

    const rootAssetsDir = path.join(realInstall, 'assets');
    const assetsLstat = fs.lstatSync(rootAssetsDir, { throwIfNoEntry: false });
    if (assetsLstat) {
      const resolvedAssets = resolveSafePackagePath(realInstall, 'assets', { allowSymlinks });
      if (fs.statSync(resolvedAssets).isDirectory()) {
        copyCarrierResource(realInstall, resolvedAssets, path.join(stagedPlugin, 'assets'), allowSymlinks);
      }
    }

    if (input.manifest.identity.icon) {
      const cleanIcon = normalizeRelativePosixPath(input.manifest.identity.icon);
      const resolvedIcon = resolveSafePackagePath(realInstall, cleanIcon, { allowSymlinks });
      if (!cleanIcon.startsWith('assets/')) {
        const iconDestination = path.join(stagedPlugin, cleanIcon);
        copyCarrierResource(realInstall, resolvedIcon, iconDestination, allowSymlinks);
      }
    }

    if (fs.existsSync(pluginDir)) fs.renameSync(pluginDir, priorPlugin);
    try {
      fs.renameSync(stagedPlugin, pluginDir);
    } catch (error) {
      if (fs.existsSync(priorPlugin)) fs.renameSync(priorPlugin, pluginDir);
      throw error;
    }
    fs.rmSync(priorPlugin, { recursive: true, force: true });
  } finally {
    if (!fs.existsSync(priorPlugin)) fs.rmSync(staging, { recursive: true, force: true });
  }

  // Update marketplace.json (.agents/plugins/marketplace.json + root mirror)
  const doc = readMarketplaceDoc(paths.agents_marketplace_json);
  const filtered = doc.plugins.filter(
    (p) => p.name !== pluginName && p.opl_package_id !== input.manifest.identity.id,
  );
  filtered.push({
    name: pluginName,
    source: {
      source: 'local',
      path: `./plugins/${pluginName}`,
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL',
    },
    opl_package_id: input.manifest.identity.id,
    version: input.manifest.identity.version,
  });
  filtered.sort((a, b) => a.name.localeCompare(b.name));
  doc.plugins = filtered;
  writeMarketplaceDocs(paths, doc);

  return {
    plugin_name: pluginName,
    plugin_dir: pluginDir,
    marketplace_paths: paths,
    plugin_json: pluginJson,
  };
}

export function removeCodexMarketplaceProjection(input: {
  readonly packageId: string;
  readonly pluginName?: string;
  readonly marketplaceRoot: string;
}): { removed: boolean; remaining_plugins: number } {
  const paths = getCodexMarketplacePaths(input.marketplaceRoot);
  const doc = readMarketplaceDoc(paths.agents_marketplace_json);
  const matching = doc.plugins.filter(
    (p) => p.opl_package_id === input.packageId || (input.pluginName && p.name === input.pluginName),
  );
  const namesToDelete = new Set<string>(matching.map((p) => p.name));
  if (input.pluginName) namesToDelete.add(input.pluginName);
  namesToDelete.add(input.packageId);

  let removed = false;
  for (const name of namesToDelete) {
    const dir = resolveSafePluginTargetDir(paths.plugins_dir, name);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      removed = true;
    }
  }

  const nextPlugins = doc.plugins.filter(
    (p) => p.opl_package_id !== input.packageId && !namesToDelete.has(p.name),
  );
  if (nextPlugins.length !== doc.plugins.length) {
    removed = true;
    doc.plugins = nextPlugins;
    writeMarketplaceDocs(paths, doc);
  }
  return { removed, remaining_plugins: nextPlugins.length };
}
