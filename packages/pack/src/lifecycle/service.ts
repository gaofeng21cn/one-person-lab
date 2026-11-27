import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';
import {
  assertTrustedHost,
  newId,
  nowIso,
  resolveStatePaths,
  type ClientContext,
  type SqliteDb,
} from '@opl/core';
import type { InstalledPackageSnapshot } from '@opl/connect';
import { PackError } from '../errors.ts';
import {
  buildPackage,
  computeLiveDirectoryContentDigest,
  readPackageManifestFromDir,
  verifyReleaseLock,
} from '../build/build-package.ts';
import { verifyManifestPathsExist } from '../build/content-lock.ts';
import {
  codexPluginPresenceProblem,
  discoverConfiguredCodexPackages,
  syncPackageToCodex,
  unsyncPackageFromCodex,
} from '../carriers/codex-sync/sync.ts';
import { resolveCodexMarketplaceRoot, resolveCodexPluginName, shouldSyncToCodex } from '../carriers/codex-sync/project.ts';
import { createProcessCodexRunner, type CodexCarrierRunner, type CodexPluginListResponse } from '../carriers/codex-sync/readback.ts';
import { extractPackageSourceArchive, packageSourceArchiveDigest } from '../distribution/archive.ts';
import type { DownloadTransport } from '../distribution/download-worker.ts';
import { copyDirectoryPhysical, downloadOciSource } from '../distribution/source-files.ts';
import {
  resolveNpmTarball,
  type RegistryFetch,
} from '../distribution/registry-client.ts';
import { migrateV1Package, type MigrateV1Result } from '../migrate/migrate-v1.ts';
import type { OplPackageManifestV2 } from '../manifest/schema.ts';
import { isWithinDirectory } from '../manifest/validate.ts';
import type {
  BuildPackageResult,
  CodexSyncProjectionResult,
  InstallSourceSpec,
  PackageUpdateSource,
  InstalledPackageRecord,
  PackEventBus,
  PackageIntent,
  PackageOperationAction,
  PackageOperationRecord,
  PackageOrigin,
  ReloadMode,
} from '../types.ts';
import { assertRequiredPackageDependency } from './dependency.ts';
import { PackStore } from './pack-store.ts';
import { classifyReloadMode, combineReloadModes } from './reload-mode.ts';

import { managedUpdateProjection, type PackageUpdateFailure, type PackageUpdateRow } from './managed-update-projection.ts';

type OfficialUpdateResolver = (packageId: string) => Promise<{
  readonly manifest: OplPackageManifestV2;
  readonly source: InstallSourceSpec;
  dispose(): Promise<void> | void;
}>;

export interface CreatePackServiceOptions {
  readonly resolveOfficialUpdate?: OfficialUpdateResolver;
  readonly db: SqliteDb;
  readonly stateDir?: string;
  readonly marketplaceRoot?: string;
  readonly eventBus?: PackEventBus;
  readonly codexRunner?: CodexCarrierRunner;
  readonly fetchImpl?: RegistryFetch;
  readonly downloadTransport?: DownloadTransport;
  readonly nowIso?: () => string;
  readonly skipMigrations?: boolean;
}

export interface InstallPackageResult {
  readonly package: InstalledPackageRecord;
  readonly operation: PackageOperationRecord;
  readonly reload_mode: ReloadMode;
  readonly codex_sync: CodexSyncProjectionResult;
}

export interface BatchOperationResult {
  readonly batch_id: string;
  readonly reload_mode: ReloadMode;
  readonly results: readonly InstallPackageResult[];
}

export interface UninstallPackageResult {
  readonly package_id: string;
  readonly removed: boolean;
  readonly revoked_grants: number;
  readonly reload_mode: ReloadMode;
  readonly operation: PackageOperationRecord;
}

function assertTrustedIfProvided(clientContext: ClientContext | undefined, action: string): void {
  if (!clientContext) return;
  try {
    assertTrustedHost(clientContext, action);
  } catch (error) {
    throw new PackError(
      'PACK_TRUSTED_HOST_REQUIRED',
      error instanceof Error ? error.message : `Action '${action}' requires a trusted host client.`,
      { client_kind: clientContext.client_kind, action },
      { cause: error },
    );
  }
}

function verifyExpectedArchiveIntegrity(
  bytes: Uint8Array,
  spec: {
    readonly expected_digest?: string;
    readonly integrity?: string;
    readonly shasum?: string;
  },
  label: string,
): void {
  if (spec.integrity) {
    const tokens = spec.integrity.trim().split(/\s+/).filter(Boolean);
    const parsedTokens: Array<{ algo: 'sha512' | 'sha384' | 'sha256' | 'sha1'; b64: string }> = [];
    for (const token of tokens) {
      const match = token.match(/^(sha512|sha384|sha256|sha1)-([A-Za-z0-9+/=]+)$/);
      if (match) {
        parsedTokens.push({
          algo: match[1] as 'sha512' | 'sha384' | 'sha256' | 'sha1',
          b64: match[2],
        });
      }
    }
    if (parsedTokens.length === 0) {
      throw new PackError(
        'PACK_LOCK_MISMATCH',
        `Unsupported SRI integrity format for '${label}': '${spec.integrity}'.`,
      );
    }
    for (const item of parsedTokens) {
      const actualB64 = crypto.createHash(item.algo).update(bytes).digest('base64');
      if (actualB64 !== item.b64) {
        throw new PackError(
          'PACK_LOCK_MISMATCH',
          `npm tarball integrity mismatch for '${label}': expected ${item.algo}-${item.b64}, got ${item.algo}-${actualB64}.`,
        );
      }
    }
  }
  if (spec.shasum) {
    const actualSha1 = crypto.createHash('sha1').update(bytes).digest('hex');
    if (actualSha1.toLowerCase() !== spec.shasum.trim().toLowerCase()) {
      throw new PackError(
        'PACK_LOCK_MISMATCH',
        `npm tarball shasum mismatch for '${label}': expected ${spec.shasum}, got ${actualSha1}.`,
      );
    }
  }
  if (spec.expected_digest) {
    const expected = spec.expected_digest.trim();
    const sriMatch = expected.match(/^(sha512|sha384|sha256)-([A-Za-z0-9+/=]+)$/);
    if (sriMatch) {
      const actualB64 = crypto.createHash(sriMatch[1]).update(bytes).digest('base64');
      if (actualB64 !== sriMatch[2]) {
        throw new PackError(
          'PACK_LOCK_MISMATCH',
          `Package archive digest mismatch for '${label}': expected ${expected}.`,
        );
      }
    } else {
      const actualSha256 = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
      if (actualSha256 !== expected) {
        throw new PackError(
          'PACK_LOCK_MISMATCH',
          `Package archive digest mismatch for '${label}': expected ${expected}, got ${actualSha256}.`,
        );
      }
    }
  }
}

function resolveExtractedPackageRoot(extractRoot: string): string {
  if (fs.existsSync(path.join(extractRoot, 'opl-package.json'))) {
    return extractRoot;
  }
  const entries = fs
    .readdirSync(extractRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '.git');
  if (entries.length === 1) {
    const nested = path.join(extractRoot, entries[0].name);
    if (fs.existsSync(path.join(nested, 'opl-package.json'))) {
      return nested;
    }
  }
  throw new PackError(
    'PACK_ARCHIVE_INVALID',
    'Extracted package archive does not contain opl-package.json at root or single top-level folder.',
  );
}

export class PackService {
  readonly store: PackStore;
  readonly stateDir: string;
  readonly packagesRoot: string;
  readonly cacheRoot: string;
  readonly marketplaceRoot?: string;
  readonly #codexRunner?: CodexCarrierRunner;
  readonly #fetchImpl?: RegistryFetch;
  readonly #downloadTransport?: DownloadTransport;
  readonly #resolveOfficialUpdate?: OfficialUpdateResolver;
  readonly #packageMutations = new Map<string, Promise<void>>();
  readonly #activeControllers = new Map<string, AbortController>();

  constructor(options: CreatePackServiceOptions) {
    this.store = new PackStore({
      db: options.db,
      eventBus: options.eventBus,
      nowIso: options.nowIso,
      skipMigrations: options.skipMigrations,
    });
    const statePaths = resolveStatePaths({ stateDir: options.stateDir });
    this.stateDir = statePaths.state_dir;
    this.packagesRoot = path.join(this.stateDir, 'packages');
    this.cacheRoot = path.join(this.stateDir, 'cache', 'downloads');
    this.marketplaceRoot = options.marketplaceRoot;
    this.#codexRunner = options.codexRunner;
    this.#fetchImpl = options.fetchImpl;
    this.#resolveOfficialUpdate = options.resolveOfficialUpdate;
    this.#downloadTransport = options.downloadTransport;
  }

  // Serialize changes to a package across the async carrier call and the database
  // write. A concurrent disable or uninstall must see the installed version it acts on.
  private async acquirePackageMutation(packageId: string): Promise<() => void> {
    const previous = this.#packageMutations.get(packageId);
    let release!: () => void;
    const active = new Promise<void>(resolve => { release = resolve; });
    this.#packageMutations.set(packageId, active);
    await previous;
    return () => {
      if (this.#packageMutations.get(packageId) === active) this.#packageMutations.delete(packageId);
      release();
    };
  }

  get eventBus(): PackEventBus {
    return this.store.eventBus;
  }

  async verifyRuntimeDigest(snapshot: InstalledPackageSnapshot): Promise<boolean> {
    try {
      if (!fs.existsSync(snapshot.install_path)) return false;
      const installed = this.store.getInstalledPackage(snapshot.package_id);
      const allowSymlinks = installed?.install_mode === 'dev_link';
      if (!allowSymlinks) {
        const lockPath = path.join(snapshot.install_path, 'opl-release.lock.json');
        if (fs.existsSync(lockPath)) {
          const verified = verifyReleaseLock(snapshot.install_path, undefined, {
            allowSymlinks: false,
          });
          return verified.digest === snapshot.content_digest;
        }
      }
      const live = computeLiveDirectoryContentDigest(snapshot.install_path, {
        allowSymlinks,
      });
      return live.digest === snapshot.content_digest;
    } catch {
      return false;
    }
  }

  private assertDependenciesSatisfied(manifest: OplPackageManifestV2): void {
    for (const dep of manifest.dependencies?.packages ?? []) {
      const installed = this.store.getInstalledPackage(dep.id);
      assertRequiredPackageDependency(manifest.identity.id, dep, installed?.enabled ? installed.manifest : null);
    }
  }

  private async materializeSourceToStaging(input: {
    readonly source: InstallSourceSpec;
    readonly opId?: string;
    readonly signal: AbortSignal;
  }): Promise<{ stagingDir: string; cleanup: () => void }> {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-pack-stage-'));
    const cleanup = () => fs.rmSync(tmpRoot, { recursive: true, force: true });

    try {
      if (input.source.kind === 'local_dir') {
        const srcDir = input.source.path;
        if (!srcDir || !fs.existsSync(srcDir)) {
          throw new PackError('PACK_NOT_FOUND', `Local package directory not found: ${srcDir ?? ''}`);
        }
        const stagingDir = path.join(tmpRoot, 'pkg');
        copyDirectoryPhysical(srcDir, stagingDir);
        return { stagingDir, cleanup };
      }

      if (input.source.kind === 'tarball') {
        const tarballPath = input.source.path;
        if (!tarballPath || !fs.existsSync(tarballPath)) {
          throw new PackError('PACK_NOT_FOUND', `Package tarball not found: ${tarballPath ?? ''}`);
        }
        const digest = packageSourceArchiveDigest(tarballPath);
        if (input.source.expected_digest && digest !== input.source.expected_digest) {
          throw new PackError(
            'PACK_LOCK_MISMATCH',
            `Tarball digest mismatch: expected ${input.source.expected_digest}, got ${digest}.`,
          );
        }
        const extractDir = path.join(tmpRoot, 'extracted');
        extractPackageSourceArchive(tarballPath, extractDir);
        return { stagingDir: resolveExtractedPackageRoot(extractDir), cleanup };
      }

      if (input.source.kind === 'oci') {
        if (!input.source.ref) {
          throw new PackError('INVALID_INPUT', 'OCI source requires ref.');
        }
        if (input.opId) this.store.transitionOperation(input.opId, {
          status: 'downloading',
          progress: { stage: 'resolving_oci', bytes_done: 0 },
        });
        const archivePath = await downloadOciSource(input.source, {
          cacheRoot: this.cacheRoot,
          fetchImpl: this.#fetchImpl,
          signal: input.signal,
          transport: this.#downloadTransport,
          onProgress: (progress) => {
            if (input.opId) this.store.transitionOperation(input.opId, {
              status: progress.stage === 'verifying' ? 'verifying' : 'downloading',
              progress,
            });
          },
        });
        const extractDir = path.join(tmpRoot, 'extracted');
        extractPackageSourceArchive(archivePath, extractDir);
        return { stagingDir: resolveExtractedPackageRoot(extractDir), cleanup };
      }

      if (input.source.kind === 'npm') {
        if (!input.source.ref) {
          throw new PackError('INVALID_INPUT', 'npm source requires package name in ref.');
        }
        if (input.opId) this.store.transitionOperation(input.opId, {
          status: 'downloading',
          progress: { stage: 'resolving_npm', bytes_done: 0 },
        });
        const resolved = await resolveNpmTarball({
          packageName: input.source.ref,
          version: input.source.version,
          fetchImpl: this.#fetchImpl,
          signal: input.signal,
        });
        const fetchImpl = this.#fetchImpl;
        const tarballRes = fetchImpl
          ? await fetchImpl(resolved.tarball_url, { signal: input.signal })
          : await fetch(resolved.tarball_url, { signal: input.signal });
        if (!tarballRes.ok) {
          throw new PackError(
            'PACK_DOWNLOAD_FAILED',
            `Failed to download npm tarball '${resolved.tarball_url}' (HTTP ${tarballRes.status}).`,
          );
        }
        const tarballBytes = new Uint8Array(await tarballRes.arrayBuffer());
        verifyExpectedArchiveIntegrity(
          tarballBytes,
          {
            expected_digest: input.source.expected_digest,
            integrity: resolved.integrity,
            shasum: resolved.shasum,
          },
          resolved.package_name,
        );
        const archivePath = path.join(tmpRoot, 'npm-package.tgz');
        fs.writeFileSync(archivePath, tarballBytes, { mode: 0o600 });
        const extractDir = path.join(tmpRoot, 'extracted');
        extractPackageSourceArchive(archivePath, extractDir);
        return { stagingDir: resolveExtractedPackageRoot(extractDir), cleanup };
      }

      throw new PackError('INVALID_INPUT', `Unsupported install source kind '${String(input.source.kind)}'.`);
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  private async installOrUpdateFromSource(input: {
    readonly source: InstallSourceSpec;
    readonly action: 'install' | 'update';
    readonly updateSource?: PackageUpdateSource;
    readonly expectedUpdate?: { installedVersion: string; installedDigest: string; availableVersion: string; background?: boolean };
    readonly batchId?: string | null;
    readonly syncCodex?: boolean;
    readonly clientContext?: ClientContext;
  }): Promise<InstallPackageResult> {
    assertTrustedIfProvided(input.clientContext, `pack.${input.action}`);
    const opId = newId('packop');
    const pkgHint = input.source.package_id ?? input.source.path ?? input.source.ref ?? 'unknown';
    const controller = new AbortController();
    this.#activeControllers.set(opId, controller);

    this.store.createOperation({
      op_id: opId,
      batch_id: input.batchId ?? null,
      package_id: pkgHint,
      action: input.action,
      target_version: input.source.version ?? null,
      status: 'preparing',
      progress: { stage: 'preparing' },
    });

    let cleanupStaging: (() => void) | undefined;
    let releaseMutation: (() => void) | undefined;
    try {
      const staged = await this.materializeSourceToStaging({
        source: input.source,
        opId,
        signal: controller.signal,
      });
      cleanupStaging = staged.cleanup;

      if (controller.signal.aborted) {
        throw new PackError('PACK_OPERATION_CANCELLED', 'Operation was cancelled.');
      }

      const { manifest } = readPackageManifestFromDir(staged.stagingDir);
      if (input.source.package_id && manifest.identity.id !== input.source.package_id) {
        throw new PackError(
          'INVALID_MANIFEST',
          `Package manifest id '${manifest.identity.id}' does not match expected package_id '${input.source.package_id}'.`,
          { expected_package_id: input.source.package_id, actual_package_id: manifest.identity.id },
        );
      }
      releaseMutation = await this.acquirePackageMutation(manifest.identity.id);
      const installedBefore = this.store.getInstalledPackage(manifest.identity.id);
      if (input.action === 'update' && !installedBefore) {
        throw new PackError('PACK_NOT_FOUND', 'Package was removed before the update.');
      }
      if (input.expectedUpdate && (installedBefore?.version !== input.expectedUpdate.installedVersion
        || installedBefore?.content_digest !== input.expectedUpdate.installedDigest
        || (input.expectedUpdate.background && !installedBefore.enabled)
        || installedBefore.origin !== 'opl' || installedBefore.install_mode !== 'release'
        || manifest.identity.version !== input.expectedUpdate.availableVersion)) {
        throw new PackError('PACK_OPERATION_BUSY', 'Package or source version changed during update. Check for updates again.');
      }
      const enabled = installedBefore?.enabled ?? true;
      this.store.transitionOperation(opId, {
        status: 'verifying',
        package_id: manifest.identity.id,
        progress: { stage: 'verifying' },
      });

      verifyManifestPathsExist(staged.stagingDir, manifest, { allowSymlinks: false });
      this.assertDependenciesSatisfied(manifest);

      const lockPath = path.join(staged.stagingDir, 'opl-release.lock.json');
      const digest = fs.existsSync(lockPath)
        ? verifyReleaseLock(staged.stagingDir, undefined, { allowSymlinks: false }).digest
        : buildPackage(staged.stagingDir, { writeLock: true }).digest;

      const destDir = path.join(this.packagesRoot, manifest.identity.id, manifest.identity.version);
      this.store.transitionOperation(opId, {
        status: 'installing',
        target_version: manifest.identity.version,
        progress: { stage: 'installing' },
      });

      fs.mkdirSync(path.dirname(destDir), { recursive: true });
      const tmpDest = `${destDir}.tmp-${opId}`;
      let backupDest: string | null = null;
      let movedToDest = false;
      try {
        copyDirectoryPhysical(staged.stagingDir, tmpDest);
        const lockFileInStaged = path.join(staged.stagingDir, 'opl-release.lock.json');
        if (fs.existsSync(lockFileInStaged)) {
          fs.copyFileSync(lockFileInStaged, path.join(tmpDest, 'opl-release.lock.json'));
        }
        backupDest = fs.existsSync(destDir) ? `${destDir}.bak-${opId}` : null;
        if (backupDest) {
          fs.rmSync(backupDest, { recursive: true, force: true });
          fs.renameSync(destDir, backupDest);
        }

        let codexSync: CodexSyncProjectionResult = {
          package_id: manifest.identity.id,
          plugin_name: resolveCodexPluginName(manifest),
          synced: false,
          skipped_reason: 'no_codex_surface',
          marketplace_root: this.marketplaceRoot ?? '',
          marketplace_manifest_path: '',
          plugin_dir: null,
          verified_by_readback: false,
        };
        let installed: InstalledPackageRecord;
        fs.renameSync(tmpDest, destDir);
        movedToDest = true;
        if (input.syncCodex !== false) {
          codexSync = await syncPackageToCodex({
            manifest,
            installPath: destDir,
            enabled,
            action: input.action,
            marketplaceRoot: this.marketplaceRoot,
            stateDir: this.stateDir,
            runner: this.#codexRunner,
          });
        }

        installed = this.store.upsertInstalledPackage({
          manifest,
          origin: 'opl',
          install_mode: 'release',
          install_path: fs.realpathSync(destDir),
          content_digest: digest,
          enabled,
          carrier_synced: codexSync.synced,
          source: input.updateSource ?? (input.source.path
            ? { ...input.source, path: path.resolve(input.source.path) } : input.source),
        });
        if (backupDest) {
          fs.rmSync(backupDest, { recursive: true, force: true });
        }

        const reloadMode = classifyReloadMode(manifest, { action: input.action });
        const opRecord = this.store.transitionOperation(opId, {
          status: 'succeeded',
          target_version: manifest.identity.version,
          reload_mode: reloadMode,
          progress: { stage: 'completed', bytes_done: 1, bytes_total: 1 },
        });

        return {
          package: installed,
          codex_sync: codexSync,
          reload_mode: reloadMode,
          operation: opRecord,
        };
      } catch (postMoveError) {
        if (movedToDest) {
          fs.rmSync(destDir, { recursive: true, force: true });
        } else {
          fs.rmSync(tmpDest, { recursive: true, force: true });
        }
        if (backupDest && fs.existsSync(backupDest)) {
          fs.renameSync(backupDest, destDir);
        }
        throw postMoveError;
      }
    } catch (error) {
      const cancelled =
        controller.signal.aborted
        || (error instanceof PackError &&
          (error.code === 'PACK_OPERATION_CANCELLED' || error.code === 'PACK_DOWNLOAD_CANCELLED'));
      const code = error instanceof PackError ? error.code : 'PACK_OPERATION_FAILED';
      const message = error instanceof Error ? error.message : String(error);
      this.store.transitionOperation(opId, {
        status: cancelled ? 'cancelled' : 'failed',
        error: { code, message },
      });
      throw error;
    } finally {
      releaseMutation?.();
      this.#activeControllers.delete(opId);
      cleanupStaging?.();
    }
  }

  async install(input: {
    readonly updateSource?: PackageUpdateSource;
    readonly source: InstallSourceSpec;
    readonly syncCodex?: boolean;
    readonly clientContext?: ClientContext;
  }): Promise<InstallPackageResult> {
    return this.installOrUpdateFromSource({
      source: input.source,
      updateSource: input.updateSource,
      action: 'install',
      syncCodex: input.syncCodex,
      clientContext: input.clientContext,
    });
  }

  async installBatch(input: {
    readonly sources: readonly InstallSourceSpec[];
    readonly syncCodex?: boolean;
    readonly clientContext?: ClientContext;
  }): Promise<BatchOperationResult> {
    assertTrustedIfProvided(input.clientContext, 'pack.installBatch');
    const batchId = newId('packbatch');
    const results: InstallPackageResult[] = [];
    for (const source of input.sources) {
      const res = await this.installOrUpdateFromSource({
        source,
        action: 'install',
        batchId,
        syncCodex: input.syncCodex,
        clientContext: input.clientContext,
      });
      results.push(res);
    }
    return {
      batch_id: batchId,
      reload_mode: combineReloadModes(results.map((r) => r.reload_mode)),
      results,
    };
  }

  async update(input: {
    readonly updateSource?: PackageUpdateSource;
    readonly packageId: string;
    readonly source: InstallSourceSpec;
    readonly syncCodex?: boolean;
    readonly clientContext?: ClientContext;
  }): Promise<InstallPackageResult> {
    const existing = this.store.getInstalledPackage(input.packageId);
    if (!existing) {
      throw new PackError('PACK_NOT_FOUND', `Package '${input.packageId}' is not installed.`);
    }
    return this.installOrUpdateFromSource({
      source: { ...input.source, package_id: input.packageId },
      updateSource: input.updateSource,
      action: 'update',
      syncCodex: input.syncCodex,
      clientContext: input.clientContext,
    });
  }

  // Use the original installation source. The installed copy alone cannot establish
  // ownership of a remote package that happens to have the same ID.
  private async visitManagedUpdates(
    apply?: { batchId: string; syncCodex?: boolean; clientContext?: ClientContext; background?: boolean },
  ) {
    const packages: PackageUpdateRow[] = [];
    const failures: PackageUpdateFailure[] = [];
    const results: InstallPackageResult[] = [];
    for (const pkg of this.store.listInstalledPackages()) {
      const row = { package_id: pkg.package_id, installed_version: pkg.version };
      const provenance = this.store.getInstallSource(pkg.package_id);
      if (pkg.install_mode === 'dev_link' || pkg.origin !== 'opl' || !provenance) {
        packages.push({ ...row, available_version: null, status: 'unmanaged',
          reason: pkg.install_mode === 'dev_link' ? 'development_link' : 'no_managed_source' });
        continue;
      }
      let cleanup: (() => Promise<void> | void) | undefined;
      try {
        let source: InstallSourceSpec;
        let manifest: OplPackageManifestV2;
        if (provenance.kind === 'official') {
          if (!this.#resolveOfficialUpdate || provenance.package_id !== pkg.package_id) {
            throw new PackError('PACK_NOT_FOUND', 'Official update source is unavailable.');
          }
          const resolved = await this.#resolveOfficialUpdate(pkg.package_id);
          cleanup = () => resolved.dispose();
          source = resolved.source;
          manifest = resolved.manifest;
        } else if (provenance.kind === 'local_dir' && provenance.path) {
          source = provenance;
          manifest = readPackageManifestFromDir(provenance.path).manifest;
        } else {
          const staged = await this.materializeSourceToStaging({
            source: provenance, signal: AbortSignal.timeout(120_000),
          });
          cleanup = staged.cleanup;
          source = { kind: 'local_dir', path: staged.stagingDir };
          manifest = readPackageManifestFromDir(staged.stagingDir).manifest;
        }
        if (manifest.identity.id !== pkg.package_id) {
          throw new PackError('INVALID_MANIFEST', 'Update source contains a different package.');
        }
        const version = manifest.identity.version;
        const available = semver.gt(version, pkg.version);
        if (available && apply && (!apply.background || pkg.enabled)) {
          const result = await this.installOrUpdateFromSource({
            action: 'update', source: { ...source, package_id: pkg.package_id }, updateSource: provenance,
            expectedUpdate: { installedVersion: pkg.version, installedDigest: pkg.content_digest, availableVersion: version, background: apply.background },
            batchId: apply.batchId, syncCodex: apply.syncCodex, clientContext: apply.clientContext,
          });
          results.push(result);
          packages.push({ ...row, installed_version: result.package.version, available_version: version, status: 'current' });
        } else {
          packages.push({ ...row, available_version: version, status: available ? 'available' : 'current',
            ...(!pkg.enabled ? { background_eligible: false, reason: 'user_disabled_package' } : {}) });
        }
      } catch (error) {
        const code = error instanceof PackError ? error.code : 'PACK_OPERATION_FAILED';
        failures.push({ package_id: pkg.package_id, code, message: error instanceof Error ? error.message : String(error) });
        packages.push({ ...row, available_version: null, status: 'unavailable', reason: code });
      } finally {
        await cleanup?.();
      }
    }
    return { packages, failures, results };
  }

  async updatePlan() {
    const { packages, failures } = await this.visitManagedUpdates();
    return { packages, failures, managed_update: managedUpdateProjection(packages, failures) };
  }

  async updateAll(input: {
    readonly updates?: ReadonlyArray<{ readonly packageId: string; readonly source: InstallSourceSpec }>;
    readonly syncCodex?: boolean;
    readonly background?: boolean;
    readonly clientContext?: ClientContext;
  }) {
    assertTrustedIfProvided(input.clientContext, 'pack.updateAll');
    const batchId = newId('packbatch');
    if (input.updates === undefined) {
      const batch = await this.visitManagedUpdates({ ...input, batchId });
      const mode = combineReloadModes(batch.results.map(result => result.reload_mode));
      return { batch_id: batchId, reload_mode: mode, ...batch,
        managed_update: managedUpdateProjection(batch.packages, batch.failures, mode) };
    }
    const results: InstallPackageResult[] = [];
    for (const item of input.updates) {
      const res = await this.installOrUpdateFromSource({
        source: { ...item.source, package_id: item.packageId }, action: 'update', batchId,
        syncCodex: input.syncCodex, clientContext: input.clientContext,
      });
      results.push(res);
    }
    const rows: PackageUpdateRow[] = results.map(({ package: pkg }) => ({
      package_id: pkg.package_id, installed_version: pkg.version, available_version: pkg.version, status: 'current',
    }));
    const mode = combineReloadModes(results.map(result => result.reload_mode));
    return { batch_id: batchId, reload_mode: mode, packages: rows, failures: [], results,
      managed_update: managedUpdateProjection(rows, [], mode) };
  }

  async link(input: {
    readonly dir: string;
    readonly syncCodex?: boolean;
    readonly clientContext?: ClientContext;
  }): Promise<InstallPackageResult> {
    assertTrustedIfProvided(input.clientContext, 'pack.link');
    const { realRoot, manifest } = readPackageManifestFromDir(input.dir);
    verifyManifestPathsExist(realRoot, manifest, { allowSymlinks: true });

    const opId = newId('packop');
    this.store.createOperation({
      op_id: opId,
      package_id: manifest.identity.id,
      action: 'sync',
      target_version: manifest.identity.version,
      status: 'verifying',
      progress: { stage: 'linking' },
    });

    const release = await this.acquirePackageMutation(manifest.identity.id);
    try {
      const { digest } = computeLiveDirectoryContentDigest(realRoot, { allowSymlinks: true });
      let codexSync: CodexSyncProjectionResult = {
        package_id: manifest.identity.id,
        plugin_name: resolveCodexPluginName(manifest),
        synced: false,
        skipped_reason: 'no_codex_surface',
        marketplace_root: this.marketplaceRoot ?? '',
        marketplace_manifest_path: '',
        plugin_dir: null,
        verified_by_readback: false,
      };
      if (input.syncCodex !== false) {
        codexSync = await syncPackageToCodex({
          manifest,
          installPath: realRoot,
          enabled: true,
          action: 'link',
          marketplaceRoot: this.marketplaceRoot,
          stateDir: this.stateDir,
          runner: this.#codexRunner,
        });
      }

      const record = this.store.upsertInstalledPackage({
        manifest,
        origin: 'local_dev',
        install_mode: 'dev_link',
        install_path: realRoot,
        content_digest: digest,
        enabled: true,
        carrier_synced: codexSync.synced,
      });

      const reloadMode = classifyReloadMode(manifest, { action: 'link' });
      const op = this.store.transitionOperation(opId, {
        status: 'succeeded',
        reload_mode: reloadMode,
        progress: { stage: 'completed' },
      });

      return {
        package: record,
        operation: op,
        reload_mode: reloadMode,
        codex_sync: codexSync,
      };
    } catch (error) {
      this.store.transitionOperation(opId, {
        status: 'failed',
        error: {
          code: error instanceof PackError ? error.code : 'PACK_OPERATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    } finally {
      release();
    }
  }

  async unlink(input: {
    readonly packageId: string;
    readonly clientContext?: ClientContext;
  }): Promise<UninstallPackageResult> {
    assertTrustedIfProvided(input.clientContext, 'pack.unlink');
    const existing = this.store.getInstalledPackage(input.packageId);
    if (!existing) {
      throw new PackError('PACK_NOT_FOUND', `Package '${input.packageId}' is not installed.`);
    }
    if (existing.install_mode !== 'dev_link') {
      throw new PackError(
        'INVALID_INPUT',
        `Package '${input.packageId}' is not linked in dev_link mode; use uninstall instead.`,
      );
    }
    return this.uninstall({ packageId: input.packageId, clientContext: input.clientContext });
  }

  async uninstall(input: {
    readonly packageId: string;
    readonly clientContext?: ClientContext;
  }): Promise<UninstallPackageResult> {
    assertTrustedIfProvided(input.clientContext, 'pack.uninstall');
    const release = await this.acquirePackageMutation(input.packageId);
    try {
      return await this.uninstallInstalledPackage(input.packageId);
    } finally {
      release();
    }
  }

  private async uninstallInstalledPackage(packageId: string): Promise<UninstallPackageResult> {
    const existing = this.store.getInstalledPackage(packageId);
    if (!existing) {
      throw new PackError('PACK_NOT_FOUND', `Package '${packageId}' is not installed.`);
    }

    if (existing.origin === 'external') {
      throw new PackError('INVALID_INPUT', `Uninstall '${packageId}' through its Codex marketplace, then refresh Package discovery.`);
    }

    const opId = newId('packop');
    this.store.createOperation({
      op_id: opId,
      package_id: packageId,
      action: 'uninstall',
      target_version: existing.version,
      status: 'installing',
      progress: { stage: 'uninstalling' },
    });

    try {
      await unsyncPackageFromCodex({
        packageId: existing.package_id,
        pluginName: resolveCodexPluginName(existing.manifest),
        marketplaceRoot: this.marketplaceRoot,
        stateDir: this.stateDir,
        runner: this.#codexRunner,
      });

      const { removed, revoked_grants } = this.store.deleteInstalledPackageAndRevokeGrants(
        packageId,
      );

      // Critical safety invariant: NEVER delete dev_link source directories!
      if (removed && removed.install_mode === 'release' && removed.origin === 'opl') {
        const realPackagesRoot = fs.existsSync(this.packagesRoot)
          ? fs.realpathSync(this.packagesRoot)
          : path.resolve(this.packagesRoot);
        const pkgDir = fs.existsSync(removed.install_path)
          ? fs.realpathSync(removed.install_path)
          : path.resolve(removed.install_path);
        if (isWithinDirectory(realPackagesRoot, pkgDir) && pkgDir !== realPackagesRoot) {
          fs.rmSync(pkgDir, { recursive: true, force: true });
        }

        const packageContainerCandidate = path.join(realPackagesRoot, removed.package_id);
        const containerLstat = fs.lstatSync(packageContainerCandidate, { throwIfNoEntry: false });
        if (containerLstat && !containerLstat.isSymbolicLink() && containerLstat.isDirectory()) {
          const realContainer = fs.realpathSync(packageContainerCandidate);
          if (
            isWithinDirectory(realPackagesRoot, realContainer)
            && realContainer !== realPackagesRoot
            && path.dirname(realContainer) === realPackagesRoot
          ) {
            for (const entry of fs.readdirSync(realContainer, { withFileTypes: true })) {
              const entryPath = path.join(realContainer, entry.name);
              const entryLstat = fs.lstatSync(entryPath, { throwIfNoEntry: false });
              if (!entryLstat) continue;
              if (entryLstat.isSymbolicLink()) {
                fs.unlinkSync(entryPath);
                continue;
              }
              const realEntry = fs.realpathSync(entryPath);
              if (isWithinDirectory(realContainer, realEntry) && realEntry !== realContainer) {
                fs.rmSync(realEntry, { recursive: true, force: true });
              }
            }
            if (fs.readdirSync(realContainer).length === 0) {
              fs.rmdirSync(realContainer);
            }
          }
        }
      }

      const reloadMode = classifyReloadMode(existing.manifest, { action: 'uninstall' });
      const op = this.store.transitionOperation(opId, {
        status: 'succeeded',
        reload_mode: reloadMode,
        progress: { stage: 'completed' },
      });

      return {
        package_id: packageId,
        removed: Boolean(removed),
        revoked_grants,
        reload_mode: reloadMode,
        operation: op,
      };
    } catch (error) {
      this.store.transitionOperation(opId, {
        status: 'failed',
        error: {
          code: error instanceof PackError ? error.code : 'PACK_OPERATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  async toggle(input: {
    readonly packageId: string;
    readonly enabled: boolean;
    readonly clientContext?: ClientContext;
  }): Promise<{ readonly package: InstalledPackageRecord; readonly reload_mode: ReloadMode }> {
    assertTrustedIfProvided(input.clientContext, 'pack.toggle');
    const release = await this.acquirePackageMutation(input.packageId);
    try {
      if (this.inspect(input.packageId)?.origin === 'external') {
        throw new PackError('INVALID_INPUT', `Enable or disable '${input.packageId}' through its Codex marketplace, then refresh Package discovery.`);
      }
      const updated = this.store.setPackageEnabled(input.packageId, input.enabled);
      const syncResult = await syncPackageToCodex({
        manifest: updated.manifest,
        installPath: updated.install_path,
        enabled: updated.enabled,
        action: 'sync',
        marketplaceRoot: this.marketplaceRoot,
        stateDir: this.stateDir,
        runner: this.#codexRunner,
      });
      const finalRecord = this.store.setPackageCarrierSynced(input.packageId, syncResult.synced);
      return {
        package: finalRecord,
        reload_mode: classifyReloadMode(finalRecord.manifest, { action: 'toggle' }),
      };
    } finally {
      release();
    }
  }

  list(filter: {
    readonly intent?: PackageIntent;
    readonly origin?: PackageOrigin;
    readonly query?: string;
    readonly enabledOnly?: boolean;
  } = {}): InstalledPackageRecord[] {
    return this.store.listInstalledPackages(filter);
  }

  inspect(packageId: string): InstalledPackageRecord | null {
    return this.store.getInstalledPackage(packageId);
  }

  async readInstalledPackagePresence(packageId: string): Promise<{ files_present: boolean; carrier_ready: boolean }> {
    const pkg = this.inspect(packageId);
    const missing = { files_present: false, carrier_ready: false };
    if (!pkg) return missing;
    if (pkg.origin === 'external') {
      const inventory = await discoverConfiguredCodexPackages({
        runner: this.#codexRunner ?? createProcessCodexRunner(),
        marketplaceRoot: this.marketplaceRoot,
        stateDir: this.stateDir,
      });
      // External packages can have opaque Codex source URLs and no v2 manifest on disk.
      // Verify the original installation with its carrier, including changes made outside OPL.
      const current = inventory.find(({ summary, content_digest }) =>
        summary.package_id === pkg.package_id && summary.version === pkg.version
        && summary.install_path === pkg.install_path && content_digest === pkg.content_digest);
      return current ? { files_present: true, carrier_ready: current.summary.enabled } : missing;
    }

    try {
      const { manifest } = readPackageManifestFromDir(pkg.install_path);
      if (manifest.identity.id !== pkg.package_id || manifest.identity.version !== pkg.version) return missing;
      verifyManifestPathsExist(pkg.install_path, pkg.manifest, { allowSymlinks: pkg.install_mode === 'dev_link' });
    } catch (error) {
      if (error instanceof PackError && ['PACK_NOT_FOUND', 'PACK_MISSING_PATH'].includes(error.code)) return missing;
      throw error;
    }
    if (!pkg.enabled || !shouldSyncToCodex(pkg.manifest)) {
      return { files_present: true, carrier_ready: pkg.enabled };
    }
    const problem = await codexPluginPresenceProblem({
      manifest: pkg.manifest,
      marketplaceRoot: resolveCodexMarketplaceRoot({ marketplaceRoot: this.marketplaceRoot, stateDir: this.stateDir }),
      runner: this.#codexRunner ?? createProcessCodexRunner(),
    });
    return { files_present: true, carrier_ready: problem === null };
  }

  async codexSync(input: {
    readonly packageId?: string;
    readonly importExternal?: boolean;
    readonly requireReadback?: boolean;
  } = {}): Promise<{
    readonly synced: readonly CodexSyncProjectionResult[];
    readonly imported_external: readonly InstalledPackageRecord[];
  }> {
    const targets = input.packageId
      ? [this.store.getInstalledPackage(input.packageId)].filter(
          (p): p is InstalledPackageRecord => p !== null,
        )
      : this.store.listInstalledPackages().filter((p) => p.origin !== 'external');

    if (input.packageId && targets.length === 0) {
      throw new PackError('PACK_NOT_FOUND', `Package '${input.packageId}' is not installed.`);
    }

    if (input.packageId && targets[0]?.origin === 'external') {
      throw new PackError('INVALID_INPUT', 'External plugins are managed by their configured Codex marketplace.');
    }
    const runner = this.#codexRunner ?? (input.requireReadback ? createProcessCodexRunner() : undefined);
    const synced: CodexSyncProjectionResult[] = [];
    for (const pkg of targets) {

      const res = await syncPackageToCodex({
        manifest: pkg.manifest,
        installPath: pkg.install_path,
        enabled: pkg.enabled,
        action: 'sync',
        marketplaceRoot: this.marketplaceRoot,
        stateDir: this.stateDir,
        runner,
      });
      this.store.setPackageCarrierSynced(pkg.package_id, res.synced);
      synced.push(res);
    }

    const importedExternal = input.importExternal && runner
      ? await this.refreshExternalCodexPackages(runner)
      : [];

    return {
      synced,
      imported_external: importedExternal,
    };
  }

  async refreshExternalCodexPackages(
    runner: CodexCarrierRunner,
    env = process.env,
    primaryInventory?: CodexPluginListResponse,
  ): Promise<InstalledPackageRecord[]> {
    const discovered = await discoverConfiguredCodexPackages({
      runner, env, primaryInventory, marketplaceRoot: this.marketplaceRoot, stateDir: this.stateDir,
    });
    // Take the managed snapshot after awaited readback. Another request may
    // have installed a managed Package while the carrier was answering.
    const managed = this.list().filter(pkg => pkg.origin !== 'external');
    const managedNames = new Set(managed.map(pkg => resolveCodexPluginName(pkg.manifest)));
    const managedIds = new Set(managed.map(pkg => pkg.package_id));
    const imported = [];
    for (const entry of discovered) {
      const { summary, manifest, content_digest } = entry;
      if (managedIds.has(summary.package_id) || managedNames.has(summary.name)) continue;
      imported.push(this.store.upsertInstalledPackage({
        manifest, content_digest, origin: 'external', install_mode: 'release',
        install_path: summary.install_path, enabled: summary.enabled, carrier_synced: true,
      }));
    }
    const seen = new Set(imported.map(pkg => pkg.package_id));
    for (const record of this.list({ origin: 'external' })) {
      if (!seen.has(record.package_id)) this.store.deleteInstalledPackageAndRevokeGrants(record.package_id);
    }
    return imported;
  }

  build(input: {
    readonly dir: string;
    readonly writeLock?: boolean;
    readonly dryRun?: boolean;
    readonly builtAt?: string;
    readonly gitCommit?: string;
  }): BuildPackageResult {
    return buildPackage(input.dir, {
      writeLock: input.writeLock,
      dryRun: input.dryRun,
      builtAt: input.builtAt,
      gitCommit: input.gitCommit,
    });
  }

  migrateV1(input: {
    readonly repoDir: string;
    readonly apply?: boolean;
    readonly clean?: boolean;
  }): MigrateV1Result {
    return migrateV1Package(input);
  }

  operationStatus(input: {
    readonly opId?: string;
    readonly batchId?: string;
  } = {}): PackageOperationRecord | PackageOperationRecord[] | null {
    if (input.opId) {
      return this.store.getOperation(input.opId);
    }
    return this.store.listOperations({ batch_id: input.batchId });
  }

  cancelOperation(opId: string): PackageOperationRecord {
    const controller = this.#activeControllers.get(opId);
    if (controller) {
      controller.abort();
    }
    const existing = this.store.getOperation(opId);
    if (!existing) {
      throw new PackError('PACK_NOT_FOUND', `Package operation '${opId}' not found.`);
    }
    if (
      existing.status === 'succeeded'
      || existing.status === 'failed'
      || existing.status === 'cancelled'
    ) {
      return existing;
    }
    return this.store.transitionOperation(opId, {
      status: 'cancelled',
      error: {
        code: 'PACK_OPERATION_CANCELLED',
        message: `Operation '${opId}' was cancelled by caller.`,
      },
    });
  }

  reconcileOperations(): PackageOperationRecord[] {
    return this.store.reconcileOperations();
  }
}

export function createPackService(options: CreatePackServiceOptions): PackService {
  return new PackService(options);
}
