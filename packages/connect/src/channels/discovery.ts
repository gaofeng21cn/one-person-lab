import fs from 'node:fs';
import path from 'node:path';

import { isRecord, type SqliteDb } from '@opl/core';

import {
  ChannelError,
  type ChannelAccessController,
  type ChannelPackageDiscovery,
  type ChannelUiActionDeclaration,
  type ChannelUiViewDeclaration,
  type DiscoveredChannelEntrypoint,
  type DiscoveredChannelPackage,
} from './types.ts';

interface RawInstalledRow {
  readonly package_id: string;
  readonly version: string;
  readonly intent: 'agent' | 'app' | 'extension' | 'channel';
  readonly install_path: string;
  readonly content_digest: string;
  readonly manifest_json: string;
  readonly enabled: number;
}

export function resolveSafePackageModulePath(installPath: string, moduleRef: string): string {
  if (typeof installPath !== 'string' || !installPath.trim()) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Package install_path must be non-empty.');
  }
  if (typeof moduleRef !== 'string' || !moduleRef.trim()) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Channel entrypoint module_ref must be non-empty.');
  }
  if (
    moduleRef.includes('\0')
    || moduleRef.includes('\\')
    || /^[A-Za-z]:/.test(moduleRef)
    || path.isAbsolute(moduleRef)
  ) {
    throw new ChannelError(
      'CHANNEL_IDENTITY_MISMATCH',
      `Channel entrypoint module_ref '${moduleRef}' must be a relative path inside the package root.`,
    );
  }
  const normalizedSegments = moduleRef.replace(/\\/g, '/').split('/');
  if (normalizedSegments.some((seg) => seg === '..')) {
    throw new ChannelError(
      'CHANNEL_IDENTITY_MISMATCH',
      `Channel entrypoint module_ref '${moduleRef}' must not escape package root.`,
    );
  }

  let realInstallRoot: string;
  try {
    realInstallRoot = fs.realpathSync(path.resolve(installPath));
  } catch (error) {
    throw new ChannelError(
      'CHANNEL_PROVIDER_UNAVAILABLE',
      `Package install_path '${installPath}' does not exist.`,
      { cause: error },
    );
  }

  const candidatePath = path.resolve(realInstallRoot, moduleRef);
  let realCandidate: string;
  try {
    realCandidate = fs.realpathSync(candidatePath);
  } catch (error) {
    throw new ChannelError(
      'CHANNEL_PROVIDER_UNAVAILABLE',
      `Channel entrypoint '${moduleRef}' cannot be resolved on disk.`,
      { cause: error },
    );
  }

  const rel = path.relative(realInstallRoot, realCandidate);
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) {
    throw new ChannelError(
      'CHANNEL_IDENTITY_MISMATCH',
      `Channel entrypoint '${moduleRef}' escapes package install_path via symlink or traversal.`,
    );
  }

  return realCandidate;
}

export function instantiateChannelFactory<T = unknown>(
  exportedModule: Record<string, unknown>,
  exportName = 'default',
): T {
  if (!isRecord(exportedModule)) {
    throw new ChannelError('CHANNEL_INVALID_INPUT', 'Channel module must export an object.');
  }
  const candidate = exportedModule[exportName];
  if (typeof candidate !== 'function') {
    throw new ChannelError(
      'CHANNEL_INVALID_INPUT',
      `Channel module export '${exportName}' must be a zero-arg synchronous factory function.`,
    );
  }
  if (candidate.length !== 0) {
    throw new ChannelError(
      'CHANNEL_INVALID_INPUT',
      `Channel factory '${exportName}' must accept 0 arguments (got ${candidate.length}).`,
    );
  }
  const instance = (candidate as () => unknown)();
  if (
    instance !== null
    && (typeof instance === 'object' || typeof instance === 'function')
    && typeof (instance as PromiseLike<unknown>).then === 'function'
  ) {
    throw new ChannelError(
      'CHANNEL_INVALID_INPUT',
      `Channel factory '${exportName}' must be synchronous and must not return a Promise/thenable.`,
    );
  }
  return instance as T;
}

export function assertDeclaredChannelAccessMatches(
  views: readonly ChannelUiViewDeclaration[],
  controller: ChannelAccessController,
  expectedViewType: 'channel_access' | 'remote_companion_access' = 'channel_access',
): ReadonlySet<string> {
  const matchingViews = views.filter((v) => v.view_type === expectedViewType);
  if (matchingViews.length === 0) {
    throw new ChannelError(
      'CHANNEL_ACCESS_UNDECLARED',
      `Manifest does not declare any '${expectedViewType}' UI view.`,
    );
  }
  const view = matchingViews.find((v) => v.data_ref === controller.data_ref);
  if (!view) {
    throw new ChannelError(
      'CHANNEL_ACCESS_UNDECLARED',
      `Controller data_ref '${controller.data_ref}' is not declared in manifest '${expectedViewType}' views.`,
    );
  }
  const declaredActionRefs = new Set(view.actions.map((a) => a.action_ref));
  for (const ref of controller.action_refs) {
    if (!declaredActionRefs.has(ref)) {
      throw new ChannelError(
        'CHANNEL_ACCESS_UNDECLARED',
        `Controller action_ref '${ref}' is not declared in manifest UI view '${view.id}'.`,
      );
    }
  }
  for (const ref of declaredActionRefs) {
    if (!controller.action_refs.includes(ref)) {
      throw new ChannelError(
        'CHANNEL_ACCESS_UNDECLARED',
        `Manifest declared action_ref '${ref}' missing on controller.`,
      );
    }
  }
  return new Set(
    view.actions.filter((a) => a.confirm === true).map((a) => a.action_ref),
  );
}

function parseUiViews(manifest: Record<string, unknown>): ChannelUiViewDeclaration[] {
  const viewsOut: ChannelUiViewDeclaration[] = [];
  const ui = isRecord(manifest.ui) ? manifest.ui : null;
  const declarative = ui && isRecord(ui.declarative) ? ui.declarative : null;
  const rawViews = declarative && Array.isArray(declarative.views) ? declarative.views : [];

  for (const rawView of rawViews) {
    if (!isRecord(rawView)) continue;
    const id = typeof rawView.id === 'string' ? rawView.id.trim() : '';
    const viewType = typeof rawView.view_type === 'string' ? rawView.view_type.trim() : '';
    const dataRef = typeof rawView.data_ref === 'string' ? rawView.data_ref.trim() : '';
    if (!id || !viewType || !dataRef) continue;
    const rawActions = Array.isArray(rawView.actions) ? rawView.actions : [];
    const actions: ChannelUiActionDeclaration[] = [];
    for (const rawAction of rawActions) {
      if (!isRecord(rawAction)) continue;
      const actionId = typeof rawAction.id === 'string' ? rawAction.id.trim() : '';
      const actionRef = typeof rawAction.action_ref === 'string' ? rawAction.action_ref.trim() : '';
      if (!actionId || !actionRef) continue;
      actions.push({
        id: actionId,
        action_ref: actionRef,
        ...(rawAction.confirm === true ? { confirm: true } : {}),
      });
    }
    viewsOut.push({
      id,
      view_type: viewType,
      data_ref: dataRef,
      actions,
    });
  }
  return viewsOut;
}

function parseEntrypoints(
  installPath: string,
  rawList: unknown,
  kind: 'channel' | 'remote_companion',
): DiscoveredChannelEntrypoint[] {
  if (!Array.isArray(rawList)) return [];
  const out: DiscoveredChannelEntrypoint[] = [];
  for (const entry of rawList) {
    if (!isRecord(entry)) continue;
    const channelId = typeof entry.channel_id === 'string'
      ? entry.channel_id.trim()
      : typeof entry.id === 'string'
        ? entry.id.trim()
        : '';
    const ep = isRecord(entry.entrypoint) ? entry.entrypoint : entry;
    const moduleRef = typeof ep.module === 'string'
      ? ep.module.trim()
      : typeof ep.module_ref === 'string'
        ? ep.module_ref.trim()
        : '';
    const exportName = typeof ep.export === 'string' && ep.export.trim()
      ? ep.export.trim()
      : 'default';
    if (!channelId || !moduleRef) continue;
    const resolvedModulePath = resolveSafePackageModulePath(installPath, moduleRef);
    out.push({
      kind,
      channel_id: channelId,
      module_ref: moduleRef,
      resolved_module_path: resolvedModulePath,
      export_name: exportName,
    });
  }
  return out;
}

export class SqliteChannelPackageDiscovery implements ChannelPackageDiscovery {
  readonly #db: SqliteDb;

  constructor(db: SqliteDb) {
    this.#db = db;
  }

  listEnabledChannelPackages(): readonly DiscoveredChannelPackage[] {
    const rows = this.#db
      .prepare(
        'SELECT package_id, version, intent, install_path, content_digest, manifest_json, enabled FROM installed_packages WHERE enabled = 1 ORDER BY package_id ASC',
      )
      .all() as unknown as RawInstalledRow[];

    const packages: DiscoveredChannelPackage[] = [];
    for (const row of rows) {
      let manifest: Record<string, unknown>;
      try {
        const parsed = JSON.parse(row.manifest_json) as unknown;
        if (!isRecord(parsed)) continue;
        manifest = parsed;
      } catch {
        continue;
      }

      const provides = isRecord(manifest.provides) ? manifest.provides : null;
      const rawChannels = provides ? provides.channels : undefined;
      const rawCompanions = provides ? provides.remote_companion_connectors : undefined;

      const hasChannelProvides = Array.isArray(rawChannels) && rawChannels.length > 0;
      const hasCompanionProvides = Array.isArray(rawCompanions) && rawCompanions.length > 0;
      if (row.intent !== 'channel' && !hasChannelProvides && !hasCompanionProvides) {
        continue;
      }

      let channels: DiscoveredChannelEntrypoint[];
      let remoteCompanions: DiscoveredChannelEntrypoint[];
      try {
        channels = parseEntrypoints(row.install_path, rawChannels, 'channel');
        remoteCompanions = parseEntrypoints(
          row.install_path,
          rawCompanions,
          'remote_companion',
        );
      } catch {
        continue;
      }
      const uiViews = parseUiViews(manifest);
      const artifactDigest = typeof manifest.artifact_digest === 'string'
        ? manifest.artifact_digest
        : typeof manifest.package_artifact_digest === 'string'
          ? manifest.package_artifact_digest
          : null;

      packages.push(
        Object.freeze({
          package_id: row.package_id,
          version: row.version,
          intent: row.intent,
          install_path: row.install_path,
          content_digest: row.content_digest,
          artifact_digest: artifactDigest,
          channels: Object.freeze(channels),
          remote_companions: Object.freeze(remoteCompanions),
          ui_views: Object.freeze(uiViews),
        }),
      );
    }

    return Object.freeze(packages);
  }
}
