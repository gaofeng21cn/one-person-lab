import fs from 'node:fs';
import path from 'node:path';
import { isRecord } from '@opl/core';
import {
  buildPackage,
  listPrivatePackageSources,
  createOfficialPackageResolver,
  ensurePackage,
  ExactPackageReleaseSchema,
  migrateV1Package,
  readPackageManifestFromDir,
  verifyReleaseLock,
  type InstallSourceSpec,
  type PackageIntent,
  type PackageOrigin,
} from '@opl/pack';
import { DaemonRpcError } from '../../errors.ts';
import type { RpcHandler, SocketConnectionState } from '../../server/socket-server.ts';
import { toProjectedPackageSummary } from '../../state/app-state-cache.ts';
import type { DaemonRuntime } from '../../state/runtime.ts';
import { coerceInstallSourceSpec, pickBoolean, pickString } from '../../utils/normalize.ts';
import { requireTrustedHost } from '../context.ts';
import { executeSoftwareSourceAction, softwareSourceActions } from '../software-source-actions.ts';

export function registerPackRoutes(handlers: Map<string, RpcHandler>, runtime: DaemonRuntime): void {
  const handlePackList: RpcHandler = async (params) => {
    await runtime.waitForInitialPackageDiscovery();
    const intent = pickString(params, 'intent') as PackageIntent | undefined;
    const origin = pickString(params, 'origin') as PackageOrigin | undefined;
    const query = pickString(params, 'query');
    const enabledOnly = pickBoolean(params, 'enabled_only', 'enabledOnly');
    const packages = runtime.packService
      .list({
        ...(intent ? { intent } : {}),
        ...(origin ? { origin } : {}),
        ...(query ? { query } : {}),
        ...(enabledOnly !== undefined ? { enabledOnly } : {}),
      })
      .map(toProjectedPackageSummary);
    return { packages };
  };
  handlers.set('pack.list', handlePackList);
  handlers.set('pack.catalog.list', handlePackList);
  handlers.set('pack.search', handlePackList);

  handlers.set('pack.sources.list', (_params, conn) => {
    requireTrustedHost(conn, 'pack.sources.list');
    return { software_sources: { entries: listPrivatePackageSources(runtime.db) } };
  });
  for (const command of ['configure', 'check', 'disconnect'] as const) {
    const method = 'pack.sources.' + command;
    const action = softwareSourceActions.find(item => item.action_id === 'source_' + command)!;
    handlers.set(method, async (params, conn) => {
      requireTrustedHost(conn, method);
      try {
        const execution = await executeSoftwareSourceAction(
          action, { ...params, confirmed: true }, false, runtime.db, () => runtime.appStateCache.invalidate(),
        );
        return {
          ...execution.app_action_execution.result,
          ...(command === 'configure' ? { next_action: 'source_list' } : {}),
          ...(command === 'disconnect' ? { local_installations_preserved: true } : {}),
        };
      } finally {
        runtime.appStateCache.invalidate();
      }
    });
  }

  handlers.set('pack.inspect', async (params) => {
    await runtime.waitForInitialPackageDiscovery();
    const packageId = pickString(params, 'package_id', 'packageId', 'id');
    const dir = pickString(params, 'dir');
    if (dir) {
      const { realRoot, manifest } = readPackageManifestFromDir(dir);
      const lockPath = path.join(realRoot, 'opl-release.lock.json');
      const lock = fs.existsSync(lockPath) ? verifyReleaseLock(realRoot, undefined, { allowSymlinks: true }) : null;
      const installed = runtime.packService.inspect(manifest.identity.id);
      return {
        manifest,
        dir: realRoot,
        lock,
        installed: installed ? toProjectedPackageSummary(installed) : null,
      };
    }
    if (!packageId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.inspect requires package_id or dir.');
    }
    const installed = runtime.packService.inspect(packageId);
    if (!installed) {
      throw new DaemonRpcError(-32013, 'PACK_NOT_FOUND', `Package '${packageId}' is not installed.`);
    }
    return {
      ...toProjectedPackageSummary(installed),
      manifest: installed.manifest,
      installed: toProjectedPackageSummary(installed),
    };
  });

  async function handlePackEnsure(params: Record<string, unknown>, conn: SocketConnectionState, requireExact = false) {
    const ctx = requireTrustedHost(conn, 'pack.ensure');
    const packageId = pickString(params, 'package_id', 'packageId');
    if (!packageId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(packageId) || packageId.length > 128) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.ensure requires a valid Package ID.');
    }
    const runtimeRoot = params.runtime_root;
    if (runtimeRoot != null && (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot))) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.ensure requires an absolute Full runtime directory.');
    }
    const exact = requireExact || Object.hasOwn(params, 'exact_release')
      ? ExactPackageReleaseSchema.safeParse(params.exact_release)
      : undefined;
    if (exact && !exact.success) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'exact_release requires a valid version, git_commit and digest.');
    }
    const dryRun = pickBoolean(params, 'dry_run', 'dryRun') ?? false;
    try {
      return await ensurePackage(runtime.packService, {
        packageId,
        dryRun,
        exactRelease: exact?.data,
        clientContext: ctx,
        resolveSource: createOfficialPackageResolver({
          runtimeRoot,
          db: runtime.db,
        }),
        installSource: (input) => runtime.installPackage(input),
      });
    } finally {
      // A dependency may have been enabled even if a later Package failed.
      if (!dryRun) {
        runtime.syncDeclaredProviders();
        await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
        runtime.appStateCache.invalidate();
      }
    }
  }
  handlers.set('pack.ensure', handlePackEnsure);
  handlers.set('pack.ensureExact', (params, conn) => handlePackEnsure(params, conn, true));

  handlers.set('pack.build', (params) => {
    const dir = pickString(params, 'dir') ?? '.';
    const dryRun = pickBoolean(params, 'dry_run', 'dryRun') ?? false;
    const writeLock = dryRun ? false : (pickBoolean(params, 'write_lock', 'writeLock') ?? true);
    return buildPackage(dir, { writeLock, dryRun });
  });

  handlers.set('pack.link', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.link');
    const dir = pickString(params, 'dir') ?? '';
    if (!dir) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.link requires dir.');
    }
    const syncCodex = pickBoolean(params, 'sync_codex', 'syncCodex') ?? true;
    const res = await runtime.linkPackage({ dir, syncCodex, clientContext: ctx });
    return {
      ...res,
      package: toProjectedPackageSummary(res.package),
    };
  });

  handlers.set('pack.unlink', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.unlink');
    const packageId = pickString(params, 'package_id', 'packageId', 'id') ?? '';
    if (!packageId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.unlink requires package_id.');
    }
    const res = await runtime.packService.unlink({ packageId, clientContext: ctx });
    runtime.syncDeclaredProviders();
    await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
    runtime.appStateCache.invalidate();
    return res;
  });

  const handlePackInstall: RpcHandler = async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.install');
    const syncCodex = pickBoolean(params, 'sync_codex', 'syncCodex') ?? true;
    const rawSources = params.sources;
    if (Array.isArray(rawSources)) {
      const specs = rawSources.map((s) => coerceInstallSourceSpec(s));
      const res = await runtime.packService.installBatch({
        sources: specs,
        syncCodex,
        clientContext: ctx,
      });
      runtime.syncDeclaredProviders();
      await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
      runtime.appStateCache.invalidate();
      return res;
    }
    const rawSource = params.source ?? params.manifest;
    const spec = coerceInstallSourceSpec(rawSource, pickString(params, 'package_id', 'packageId'));
    const res = await runtime.installPackage({
      source: spec,
      syncCodex,
      clientContext: ctx,
    });
    return {
      ...res,
      package: toProjectedPackageSummary(res.package),
    };
  };
  handlers.set('pack.install', handlePackInstall);
  handlers.set('pack.installBatch', handlePackInstall);

  handlers.set('pack.uninstall', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.uninstall');
    const packageId = pickString(params, 'package_id', 'packageId', 'id') ?? '';
    if (!packageId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.uninstall requires package_id.');
    }
    const res = await runtime.packService.uninstall({ packageId, clientContext: ctx });
    runtime.syncDeclaredProviders();
    await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
    runtime.appStateCache.invalidate();
    return res;
  });

  handlers.set('pack.update', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.update');
    const packageId = pickString(params, 'package_id', 'packageId', 'id') ?? '';
    if (!packageId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.update requires package_id.');
    }
    const syncCodex = pickBoolean(params, 'sync_codex', 'syncCodex') ?? true;
    const spec = coerceInstallSourceSpec(params.source, packageId);
    const res = await runtime.packService.update({
      packageId,
      source: spec,
      syncCodex,
      clientContext: ctx,
    });
    runtime.syncDeclaredProviders();
    await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
    runtime.appStateCache.invalidate();
    return {
      ...res,
      package: toProjectedPackageSummary(res.package),
    };
  });

  handlers.set('pack.updatePlan', (_params, conn) => {
    requireTrustedHost(conn, 'pack.updatePlan');
    return runtime.packService.updatePlan();
  });

  handlers.set('pack.updateAll', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.updateAll');
    const syncCodex = pickBoolean(params, 'sync_codex', 'syncCodex') ?? true;
    const updates: Array<{ packageId: string; source: InstallSourceSpec }> = [];

    if (Array.isArray(params.updates)) {
      for (const item of params.updates) {
        if (!isRecord(item)) continue;
        const pkgId =
          typeof item.package_id === 'string'
            ? item.package_id
            : typeof item.packageId === 'string'
              ? item.packageId
              : '';
        if (!pkgId) continue;
        const rawSource = item.source ?? (isRecord(params.sources) ? params.sources[pkgId] : undefined);
        updates.push({
          packageId: pkgId,
          source: coerceInstallSourceSpec(rawSource, pkgId),
        });
      }
    } else if (isRecord(params.sources)) {
      for (const [pkgId, rawSource] of Object.entries(params.sources)) {
        updates.push({
          packageId: pkgId,
          source: coerceInstallSourceSpec(rawSource, pkgId),
        });
      }
    }

    if (params.updates !== undefined && !Array.isArray(params.updates)
      || params.sources !== undefined && !isRecord(params.sources)) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Invalid package update batch.');
    }
    const res = await runtime.packService.updateAll({
      ...(params.updates !== undefined || params.sources !== undefined ? { updates } : {}),
      background: pickBoolean(params, 'background'),
      syncCodex,
      clientContext: ctx,
    });
    runtime.syncDeclaredProviders();
    await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
    runtime.appStateCache.invalidate();
    return res;
  });

  handlers.set('pack.toggle', async (params, conn) => {
    const ctx = requireTrustedHost(conn, 'pack.toggle');
    const packageId = pickString(params, 'package_id', 'packageId', 'id') ?? '';
    const enabled = pickBoolean(params, 'enabled');
    if (!packageId || enabled === undefined) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.toggle requires package_id and enabled boolean.');
    }
    const res = await runtime.packService.toggle({ packageId, enabled, clientContext: ctx });
    runtime.syncDeclaredProviders();
    await runtime.channelHost.reconcileWithInstalledPackages().catch(() => {});
    runtime.appStateCache.invalidate();
    return {
      ...res,
      package: toProjectedPackageSummary(res.package),
    };
  });

  handlers.set('pack.operation.status', (params) => {
    const opId = pickString(params, 'op_id', 'opId');
    const batchId = pickString(params, 'batch_id', 'batchId');
    return runtime.packService.operationStatus({
      ...(opId ? { opId } : {}),
      ...(batchId ? { batchId } : {}),
    });
  });

  handlers.set('pack.operation.cancel', (params, conn) => {
    requireTrustedHost(conn, 'pack.operation.cancel');
    const opId = pickString(params, 'op_id', 'opId') ?? '';
    if (!opId) {
      throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'pack.operation.cancel requires op_id.');
    }
    return runtime.packService.cancelOperation(opId);
  });

  handlers.set('pack.migrateV1', (params) => {
    const repoDir = pickString(params, 'repo_dir', 'repoDir', 'dir') ?? '.';
    const apply = pickBoolean(params, 'apply') ?? false;
    const clean = pickBoolean(params, 'clean') ?? false;
    return migrateV1Package({ repoDir, apply, clean });
  });

  const handleCodexSync: RpcHandler = async (params, conn) => {
    requireTrustedHost(conn, 'pack.codexSync');
    const packageId = pickString(params, 'package_id', 'packageId');
    const importExternal = pickBoolean(params, 'import_external', 'importExternal') ?? true;
    return runtime.codexSync({ packageId, importExternal });
  };
  handlers.set('pack.codexSync', handleCodexSync);
  handlers.set('pack.sync.codex', handleCodexSync);
}
