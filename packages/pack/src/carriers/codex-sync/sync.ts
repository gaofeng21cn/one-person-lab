import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '@opl/core';
import semver from 'semver';
import { resolveConfiguredCodexHome } from './temp-hygiene.ts';
import { PackError } from '../../errors.ts';
import {
  CODEX_PLUGIN_NAME_REGEX,
  SemverSchema,
  type OplPackageManifestV2,
} from '../../manifest/schema.ts';
import { parsePackageManifestV2 } from '../../manifest/validate.ts';
import type {
  CodexSyncProjectionResult,
  ExternalCodexPluginSummary,
} from '../../types.ts';
import {
  OPL_LOCAL_MARKETPLACE_NAME,
  getCodexMarketplacePaths,
  projectPackageToCodexMarketplace,
  removeCodexMarketplaceProjection,
  resolveCodexMarketplaceRoot,
  resolveCodexPluginName,
  shouldSyncToCodex,
} from './project.ts';
import {
  ensureMarketplaceAvailable,
  type CodexCarrierRunner,
  type CodexPluginListResponse,
  type CodexPluginSummary,
} from './readback.ts';

export interface SyncPackageToCodexOptions {
  readonly manifest: OplPackageManifestV2;
  readonly installPath: string;
  readonly enabled: boolean;
  readonly action?: 'install' | 'update' | 'repair' | 'link' | 'sync';
  readonly marketplaceRoot?: string;
  readonly stateDir?: string;
  readonly runner?: CodexCarrierRunner;
  readonly env?: NodeJS.ProcessEnv;
}

/** Read the configured carrier without registering or installing anything. */
export async function codexPluginPresenceProblem(options: {
  manifest: OplPackageManifestV2;
  marketplaceRoot: string;
  runner: CodexCarrierRunner;
  env?: NodeJS.ProcessEnv;
}): Promise<string | null> {
  const { manifest, marketplaceRoot, runner } = options;
  const name = resolveCodexPluginName(manifest);
  const pluginId = `${name}@${OPL_LOCAL_MARKETPLACE_NAME}`;
  const listing = await runner.listPlugins({ marketplaceKinds: ['local'] }, options.env);
  const paths = getCodexMarketplacePaths(marketplaceRoot);
  const absolute = (file: string) => fs.existsSync(file) ? fs.realpathSync(file) : path.resolve(file);
  // Codex can report the manifest file instead of the configured directory.
  const sources = [paths.marketplace_root, paths.agents_marketplace_json, paths.root_marketplace_json].map(absolute);
  const relevantErrors = listing.marketplaceLoadErrors.filter((error) => {
    if (!error || typeof error !== 'object' || !('marketplacePath' in error) || typeof error.marketplacePath !== 'string') {
      return true;
    }
    return sources.includes(absolute(error.marketplacePath));
  });
  if (relevantErrors.length > 0) {
    throw new PackError('PACK_CODEX_SYNC_FAILED', 'Codex plugin/list could not read the configured marketplace.', {
      errors: relevantErrors,
    });
  }
  const candidates = listing.marketplaces.filter((mp) =>
    mp.path ? sources.includes(absolute(mp.path)) : mp.name === OPL_LOCAL_MARKETPLACE_NAME,
  ).flatMap((mp) => mp.plugins);
  const plugin = candidates.find((entry) => entry.id === pluginId) ?? candidates.find((entry) => entry.name === name);
  if (!plugin?.installed || !plugin.enabled) {
    return `Codex plugin/list does not show '${pluginId}' installed and enabled.`;
  }
  for (const version of [plugin.version, plugin.localVersion]) {
    if (version && version !== manifest.identity.version) {
      return `Codex plugin/list version mismatch for '${pluginId}': expected ${manifest.identity.version}, got ${version}.`;
    }
  }
  const projected = path.join(paths.plugins_dir, name);
  if (!fs.existsSync(path.join(projected, '.codex-plugin', 'plugin.json'))) {
    return `Codex plugin '${pluginId}' has no local marketplace projection.`;
  }
  if (plugin.source.type === 'local' && (!fs.existsSync(plugin.source.path) || absolute(plugin.source.path) !== absolute(projected))) {
    return `Codex plugin/list path mismatch for '${pluginId}'.`;
  }
  const expected = manifest.provides?.skills?.filter((skill) => skill.exposure !== 'opt_in') ?? [];
  if (expected.length && runner.readInstalledSkillPaths) {
    const skillPaths = await runner.readInstalledSkillPaths(plugin.id, options.env);
    const installed = new Set(skillPaths
      .filter((file) => path.basename(file) === 'SKILL.md')
      .map((file) => path.basename(path.dirname(file))));
    const missing = expected.filter((skill) => !installed.has(skill.id));
    if (missing.length) {
      return `Codex skills/list is missing skills from '${pluginId}': ${missing.map((skill) => skill.id).join(', ')}.`;
    }
  }
  return null;
}

export async function syncPackageToCodex(
  options: SyncPackageToCodexOptions,
): Promise<CodexSyncProjectionResult> {
  const marketplaceRoot = resolveCodexMarketplaceRoot({
    marketplaceRoot: options.marketplaceRoot,
    stateDir: options.stateDir,
    env: options.env,
  });
  const paths = getCodexMarketplacePaths(marketplaceRoot);
  const pluginName = resolveCodexPluginName(options.manifest);

  if (!options.enabled || !shouldSyncToCodex(options.manifest)) {
    const pluginId = `${pluginName}@${OPL_LOCAL_MARKETPLACE_NAME}`;
    if (options.runner) {
      const removeRes = await options.runner.runCli(
        ['plugin', 'remove', pluginId, '--json'],
        options.env,
      );
      if (removeRes.status !== 0 && removeRes.error) {
        throw new PackError(
          'PACK_CODEX_SYNC_FAILED',
          `Codex plugin remove failed for '${pluginId}': ${removeRes.error.message}`,
        );
      }
    }
    removeCodexMarketplaceProjection({
      packageId: options.manifest.identity.id,
      pluginName,
      marketplaceRoot,
    });
    return {
      package_id: options.manifest.identity.id,
      plugin_name: pluginName,
      synced: false,
      skipped_reason:
        options.manifest.host_hints?.codex?.sync_enabled === false
          ? 'sync_disabled'
          : 'no_codex_surface',
      marketplace_root: marketplaceRoot,
      marketplace_manifest_path: paths.agents_marketplace_json,
      plugin_dir: null,
      verified_by_readback: false,
    };
  }

  const projected = projectPackageToCodexMarketplace({
    manifest: options.manifest,
    installPath: options.installPath,
    marketplaceRoot,
  });

  let verifiedByReadback = false;
  if (options.runner) {
    await ensureMarketplaceAvailable({
      marketplaceName: OPL_LOCAL_MARKETPLACE_NAME,
      marketplaceSource: marketplaceRoot,
      action: options.action ?? 'sync',
      runner: options.runner,
      env: options.env,
    });

    const pluginId = `${pluginName}@${OPL_LOCAL_MARKETPLACE_NAME}`;
    const installRes = await options.runner.runCli(
      ['plugin', 'add', pluginId, '--json'],
      options.env,
    );
    if (installRes.status !== 0 || installRes.error) {
      throw new PackError(
        'PACK_CODEX_SYNC_FAILED',
        `Codex plugin add failed for '${pluginId}': ${installRes.stderr || installRes.error?.message || 'unknown error'}`,
      );
    }

    const problem = await codexPluginPresenceProblem({
      manifest: options.manifest, marketplaceRoot, runner: options.runner, env: options.env,
    });
    if (problem) throw new PackError('PACK_CODEX_SYNC_FAILED', problem);
    verifiedByReadback = true;
  }

  return {
    package_id: options.manifest.identity.id,
    plugin_name: pluginName,
    synced: true,
    marketplace_root: marketplaceRoot,
    marketplace_manifest_path: paths.agents_marketplace_json,
    plugin_dir: projected.plugin_dir,
    verified_by_readback: verifiedByReadback,
  };
}

export async function unsyncPackageFromCodex(options: {
  readonly packageId: string;
  readonly pluginName?: string;
  readonly marketplaceRoot?: string;
  readonly stateDir?: string;
  readonly runner?: CodexCarrierRunner;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<{ removed: boolean; verified_by_readback: boolean }> {
  const marketplaceRoot = resolveCodexMarketplaceRoot({
    marketplaceRoot: options.marketplaceRoot,
    stateDir: options.stateDir,
    env: options.env,
  });
  const pluginName = options.pluginName ?? options.packageId;
  const pluginId = `${pluginName}@${OPL_LOCAL_MARKETPLACE_NAME}`;

  if (options.runner) {
    const removeRes = await options.runner.runCli(
      ['plugin', 'remove', pluginId, '--json'],
      options.env,
    );
    if (removeRes.status !== 0 && removeRes.error) {
      throw new PackError(
        'PACK_CODEX_SYNC_FAILED',
        `Codex plugin remove failed for '${pluginId}': ${removeRes.error.message}`,
      );
    }
  }

  const removal = removeCodexMarketplaceProjection({
    packageId: options.packageId,
    pluginName,
    marketplaceRoot,
  });

  let verifiedByReadback = false;
  if (options.runner) {
    const listResp = await options.runner.listPlugins(
      { marketplaceKinds: ['local'] },
      options.env,
    );
    const realMarketplaceRoot = fs.existsSync(marketplaceRoot)
      ? fs.realpathSync(marketplaceRoot)
      : path.resolve(marketplaceRoot);
    const stillPresent = listResp.marketplaces
      .filter((mp) => {
        if (mp.name === OPL_LOCAL_MARKETPLACE_NAME) return true;
        if (!mp.path) return false;
        const mpReal = fs.existsSync(mp.path) ? fs.realpathSync(mp.path) : path.resolve(mp.path);
        return mpReal === realMarketplaceRoot;
      })
      .flatMap((mp) => mp.plugins)
      .some((entry) => entry.installed && (entry.id === pluginId || entry.name === pluginName));
    if (stillPresent) {
      throw new PackError(
        'PACK_CODEX_SYNC_FAILED',
        `Codex plugin/list still shows '${pluginId}' after removal.`,
      );
    }
    verifiedByReadback = true;
  }

  return {
    removed: removal.removed,
    verified_by_readback: verifiedByReadback,
  };
}

function toSafeKebabPackageId(raw: string): string {
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return normalized || 'codex-external-plugin';
}

function normalizeExternalPluginVersion(rawVersion: string | null | undefined): string {
  const candidate = typeof rawVersion === 'string' ? rawVersion.trim() : '';
  if (!candidate) return '0.1.0';
  if (SemverSchema.safeParse(candidate).success) {
    return candidate;
  }
  const validStrict = semver.valid(candidate);
  if (validStrict && SemverSchema.safeParse(validStrict).success) {
    return validStrict;
  }
  const coerced = semver.coerce(candidate);
  const validCoerced = coerced ? semver.valid(coerced) : null;
  if (validCoerced && SemverSchema.safeParse(validCoerced).success) {
    return validCoerced;
  }
  return '0.1.0';
}

// Codex reports the mutable marketplace checkout for local sources. Prefer the
// installed version in the selected carrier home, even after the checkout moves.
function installedLocalRoot(plugin: CodexPluginSummary, env: NodeJS.ProcessEnv): string | null {
  if (plugin.source.type !== 'local') return null;
  const parts = [plugin.marketplaceName, plugin.name, plugin.localVersion ?? plugin.version];
  if (parts.every((part): part is string => typeof part === 'string' && CODEX_PLUGIN_NAME_REGEX.test(part))) {
    const cacheRoot = path.join(resolveConfiguredCodexHome(env), 'plugins', 'cache', ...parts);
    if (fs.statSync(cacheRoot, { throwIfNoEntry: false })?.isDirectory()) return cacheRoot;
  }
  return plugin.source.path;
}

function installedPackageDescriptor(root: string | null, plugin: CodexPluginSummary) {
  if (!root) return null;
  try {
    const input: unknown = JSON.parse(fs.readFileSync(path.join(root, 'opl-package.json'), 'utf8'));
    if (!isRecord(input) || input.schema_version !== 'opl.package.v2') return null;
    const manifest = parsePackageManifestV2(input);
    if (manifest.identity.version !== (plugin.localVersion ?? plugin.version)) return null;
    return { manifest, internal: manifest.host_hints?.codex?.sync_enabled === false };
  } catch {
    // A native plugin without a readable OPL descriptor retains its carrier ID.
    return null;
  }
}

function synthesizeExternalManifest(plugin: CodexPluginSummary, packageId: string, descriptor?: OplPackageManifestV2): OplPackageManifestV2 {
  const iface = plugin.interface ?? {};
  const displayName =
    typeof iface.displayName === 'string' && iface.displayName.trim()
      ? iface.displayName.trim()
      : plugin.name;
  const shortDesc =
    typeof iface.shortDescription === 'string' && iface.shortDescription.trim()
      ? iface.shortDescription.trim()
      : `External Codex plugin (${plugin.id})`;
  const developer =
    typeof iface.developerName === 'string' && iface.developerName.trim()
      ? iface.developerName.trim()
      : 'codex-external';
  const version = normalizeExternalPluginVersion(plugin.localVersion ?? plugin.version);
  const safePluginName = CODEX_PLUGIN_NAME_REGEX.test(plugin.name.trim())
    ? plugin.name.trim()
    : packageId;

  return parsePackageManifestV2({
    schema_version: 'opl.package.v2',
    identity: {
      id: packageId,
      version,
      intent: descriptor?.identity.intent ?? 'extension',
      name: { 'zh-CN': displayName, 'en-US': displayName },
      summary: { 'zh-CN': shortDesc, 'en-US': shortDesc },
      publisher: developer,
    },
    // Preserve dependency and skill contracts. Executable entrypoints continue
    // to run through the native carrier that owns the installed plugin.
    dependencies: descriptor?.dependencies,
    provides: descriptor?.provides ? {
      skills: descriptor.provides.skills,
      module_ids: descriptor.provides.module_ids,
    } : undefined,
    host_hints: {
      codex: {
        sync_enabled: true,
        plugin_name: safePluginName,
        ...(typeof iface.category === 'string' && iface.category.trim()
          ? { category: iface.category.trim() }
          : {}),
        ...(typeof iface.brandColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(iface.brandColor)
          ? { brand_color: iface.brandColor }
          : {}),
      },
    },
  });
}

export interface ImportedExternalPluginRecord {
  readonly summary: ExternalCodexPluginSummary;
  readonly manifest: OplPackageManifestV2;
  readonly content_digest: string;
}

interface ExternalDiscoveryOptions {
  readonly runner: CodexCarrierRunner;
  readonly managedPluginIds?: ReadonlySet<string>;
  readonly marketplaceRoot?: string;
  readonly stateDir?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly primaryInventory?: CodexPluginListResponse;
}

export async function discoverExternalCodexPlugins(
  options: ExternalDiscoveryOptions,
  internalOnly = false,
): Promise<ImportedExternalPluginRecord[]> {
  const marketplaceRoot = resolveCodexMarketplaceRoot({
    marketplaceRoot: options.marketplaceRoot,
    stateDir: options.stateDir,
    env: options.env,
  });
  const realMarketplaceRoot = fs.existsSync(marketplaceRoot)
    ? fs.realpathSync(marketplaceRoot)
    : path.resolve(marketplaceRoot);
  const managedIds = options.managedPluginIds ?? new Set<string>();

  const response = options.primaryInventory ?? await options.runner.listPlugins({ forceRefetch: false }, options.env);
  if (response.marketplaceLoadErrors.length) {
    throw new PackError('PACK_CODEX_SYNC_FAILED', 'Incomplete external Codex inventory: marketplaceLoadErrors.');
  }
  const imported: ImportedExternalPluginRecord[] = [];
  const seenIds = new Set<string>();

  for (const mp of response.marketplaces) {
    if (mp.name === OPL_LOCAL_MARKETPLACE_NAME) continue;
    const mpResolved = mp.path
      ? fs.existsSync(mp.path)
        ? fs.realpathSync(mp.path)
        : path.resolve(mp.path)
      : null;
    if (mpResolved === realMarketplaceRoot) continue;

    for (const plugin of mp.plugins) {
      if (!plugin.installed) continue;
      if (managedIds.has(plugin.name) || managedIds.has(plugin.id)) continue;

      const localRoot = installedLocalRoot(plugin, options.env ?? process.env);
      const identity = installedPackageDescriptor(localRoot, plugin);
      if (internalOnly && !identity?.internal) continue;
      const baseId = identity?.manifest.identity.id ?? toSafeKebabPackageId(`codex-${plugin.marketplaceName}-${plugin.name}`);
      const pkgId = seenIds.has(baseId)
        ? toSafeKebabPackageId(`${baseId}-${crypto.createHash('sha256').update(plugin.id).digest('hex').slice(0, 6)}`)
        : baseId;
      seenIds.add(pkgId);

      const installPath =
        plugin.source.type === 'local'
          ? localRoot!
          : plugin.source.type === 'git'
            ? plugin.source.path ?? plugin.source.url
            : plugin.source.type === 'npm'
              ? `npm:${plugin.source.package}`
              : `codex-remote://${plugin.id}`;

      const manifest = synthesizeExternalManifest(plugin, pkgId, identity?.manifest);
      const digest = `sha256:${crypto
        .createHash('sha256')
        .update(JSON.stringify({ id: plugin.id, version: manifest.identity.version, source: plugin.source, ...(identity ? { descriptor: manifest } : {}) }))
        .digest('hex')}`;

      imported.push({
        summary: {
          package_id: pkgId,
          plugin_id: plugin.id,
          name: plugin.name,
          version: manifest.identity.version,
          enabled: plugin.enabled,
          source_type: plugin.source.type,
          install_path: installPath,
          marketplace_name: plugin.marketplaceName,
        },
        manifest,
        content_digest: digest,
      });
    }
  }

  return imported;
}


export async function discoverConfiguredCodexPackages(options: ExternalDiscoveryOptions & { readonly stateDir: string }) {
  const internalHome = path.join(options.stateDir, 'internal-package-carrier');
  const env = options.env ?? process.env;
  const primary = discoverExternalCodexPlugins(options);
  if (internalHome === resolveConfiguredCodexHome(env) || !fs.existsSync(path.join(internalHome, 'config.toml'))) {
    return primary;
  }
  const [userPackages, internalPackages] = await Promise.all([primary, discoverExternalCodexPlugins({
    ...options, primaryInventory: undefined, env: { ...env, CODEX_HOME: internalHome },
  }, true)]);
  // v1 assigned headless Packages to its internal carrier, including when the
  // same identity also appeared in the user's marketplace.
  const entries = new Map(userPackages.map(entry => [entry.summary.package_id, entry]));
  for (const entry of internalPackages) entries.set(entry.summary.package_id, entry);
  return [...entries.values()];
}
