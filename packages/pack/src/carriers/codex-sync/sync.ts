import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import semver from 'semver';
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

    const listResp = await options.runner.listPlugins(
      { marketplaceKinds: ['local'] },
      options.env,
    );
    if (listResp.marketplaceLoadErrors.length > 0) {
      throw new PackError('PACK_CODEX_SYNC_FAILED', 'Codex plugin/list reported marketplace load errors.', {
        errors: listResp.marketplaceLoadErrors,
      });
    }

    const realMarketplaceRoot = fs.existsSync(marketplaceRoot)
      ? fs.realpathSync(marketplaceRoot)
      : path.resolve(marketplaceRoot);
    const scopedPlugins = listResp.marketplaces
      .filter((mp) => {
        if (mp.name === OPL_LOCAL_MARKETPLACE_NAME) return true;
        if (!mp.path) return false;
        const mpReal = fs.existsSync(mp.path) ? fs.realpathSync(mp.path) : path.resolve(mp.path);
        return mpReal === realMarketplaceRoot;
      })
      .flatMap((mp) => mp.plugins);
    const matched =
      scopedPlugins.find((entry) => entry.id === pluginId)
      ?? scopedPlugins.find((entry) => entry.name === pluginName);

    if (!matched || !matched.installed || !matched.enabled) {
      throw new PackError(
        'PACK_CODEX_SYNC_FAILED',
        `Codex plugin/list readback parity failed for '${pluginId}'.`,
        { matched: matched ?? null },
      );
    }
    const reportedVersion = matched.version ?? matched.localVersion;
    if (reportedVersion && reportedVersion !== options.manifest.identity.version) {
      throw new PackError(
        'PACK_CODEX_SYNC_FAILED',
        `Codex plugin/list version mismatch for '${pluginId}': expected ${options.manifest.identity.version}, got ${reportedVersion}.`,
      );
    }
    if (matched.localVersion && matched.localVersion !== options.manifest.identity.version) {
      throw new PackError(
        'PACK_CODEX_SYNC_FAILED',
        `Codex plugin/list localVersion mismatch for '${pluginId}': expected ${options.manifest.identity.version}, got ${matched.localVersion}.`,
      );
    }
    if (matched.source.type === 'local') {
      const realPluginDir = fs.realpathSync(projected.plugin_dir);
      const realReported = fs.existsSync(matched.source.path)
        ? fs.realpathSync(matched.source.path)
        : path.resolve(matched.source.path);
      if (realReported !== realPluginDir) {
        throw new PackError(
          'PACK_CODEX_SYNC_FAILED',
          `Codex plugin/list path mismatch for '${pluginId}': expected ${realPluginDir}, got ${realReported}.`,
        );
      }
    }
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

function synthesizeExternalManifest(plugin: CodexPluginSummary, packageId: string): OplPackageManifestV2 {
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
      intent: 'extension',
      name: { 'zh-CN': displayName, 'en-US': displayName },
      summary: { 'zh-CN': shortDesc, 'en-US': shortDesc },
      publisher: developer,
    },
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

export async function discoverExternalCodexPlugins(options: {
  readonly runner: CodexCarrierRunner;
  readonly managedPluginIds?: ReadonlySet<string>;
  readonly marketplaceRoot?: string;
  readonly stateDir?: string;
  readonly env?: NodeJS.ProcessEnv;
}): Promise<ImportedExternalPluginRecord[]> {
  const marketplaceRoot = resolveCodexMarketplaceRoot({
    marketplaceRoot: options.marketplaceRoot,
    stateDir: options.stateDir,
    env: options.env,
  });
  const realMarketplaceRoot = fs.existsSync(marketplaceRoot)
    ? fs.realpathSync(marketplaceRoot)
    : path.resolve(marketplaceRoot);
  const managedIds = options.managedPluginIds ?? new Set<string>();

  const response = await options.runner.listPlugins({ forceRefetch: false }, options.env);
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

      const baseId = toSafeKebabPackageId(`codex-${plugin.marketplaceName}-${plugin.name}`);
      const pkgId = seenIds.has(baseId)
        ? toSafeKebabPackageId(`${baseId}-${crypto.createHash('sha256').update(plugin.id).digest('hex').slice(0, 6)}`)
        : baseId;
      seenIds.add(pkgId);

      const installPath =
        plugin.source.type === 'local'
          ? plugin.source.path
          : plugin.source.type === 'git'
            ? plugin.source.path ?? plugin.source.url
            : plugin.source.type === 'npm'
              ? `npm:${plugin.source.package}`
              : `codex-remote://${plugin.id}`;

      const manifest = synthesizeExternalManifest(plugin, pkgId);
      const digest = `sha256:${crypto
        .createHash('sha256')
        .update(JSON.stringify({ id: plugin.id, version: manifest.identity.version, source: plugin.source }))
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
