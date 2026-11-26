import {
  EventBus,
  newId,
  nowIso,
  txImmediate,
  type SqliteDb,
} from '@opl/core';
import { ensureConnectSchema } from '@opl/connect';
import { PackError } from '../errors.ts';
import type { OplPackageManifestV2 } from '../manifest/schema.ts';
import { parsePackageManifestV2 } from '../manifest/validate.ts';
import type {
  InstalledPackageRecord,
  PackEventBus,
  PackEvents,
  PackProgressEvent,
  PackageInstallMode,
  PackageIntent,
  PackageOperationAction,
  PackageOperationErrorInfo,
  PackageOperationProgress,
  PackageOperationRecord,
  PackageOperationStatus,
  PackageOrigin,
  ReloadMode,
} from '../types.ts';

interface RawInstalledPackageRow {
  package_id: string;
  version: string;
  intent: PackageIntent;
  origin: PackageOrigin;
  install_mode: PackageInstallMode;
  install_path: string;
  content_digest: string;
  manifest_json: string;
  enabled: number;
  carrier_synced: number;
  installed_at: string;
  updated_at: string;
}

interface RawPackageOperationRow {
  op_id: string;
  batch_id: string | null;
  package_id: string;
  action: PackageOperationAction;
  target_version: string | null;
  status: PackageOperationStatus;
  reload_mode: ReloadMode | null;
  progress_json: string;
  error_json: string | null;
  created_at: string;
  updated_at: string;
}

function mapInstalledRow(row: RawInstalledPackageRow): InstalledPackageRecord {
  const manifest = parsePackageManifestV2(JSON.parse(row.manifest_json) as unknown);
  const synced = row.carrier_synced === 1;
  return Object.freeze({
    package_id: row.package_id,
    version: row.version,
    intent: row.intent,
    origin: row.origin,
    install_mode: row.install_mode,
    install_path: row.install_path,
    content_digest: row.content_digest,
    manifest,
    manifest_json: row.manifest_json,
    enabled: row.enabled === 1,
    carrier_synced: synced,
    codex_synced: synced,
    installed_at: row.installed_at,
    updated_at: row.updated_at,
  });
}

function mapOperationRow(row: RawPackageOperationRow): PackageOperationRecord {
  let progress: PackageOperationProgress = {};
  try {
    progress = JSON.parse(row.progress_json || '{}') as PackageOperationProgress;
  } catch {
    progress = {};
  }
  let error: PackageOperationErrorInfo | null = null;
  if (row.error_json) {
    try {
      error = JSON.parse(row.error_json) as PackageOperationErrorInfo;
    } catch {
      error = { code: 'UNKNOWN', message: row.error_json };
    }
  }
  return Object.freeze({
    op_id: row.op_id,
    batch_id: row.batch_id,
    package_id: row.package_id,
    action: row.action,
    target_version: row.target_version,
    status: row.status,
    reload_mode: row.reload_mode,
    progress,
    error,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

export interface PackStoreOptions {
  readonly db: SqliteDb;
  readonly eventBus?: PackEventBus;
  readonly nowIso?: () => string;
  readonly skipMigrations?: boolean;
}

export class PackStore {
  readonly db: SqliteDb;
  readonly eventBus: PackEventBus;
  readonly #nowIso: () => string;

  constructor(options: PackStoreOptions) {
    this.db = options.db;
    this.eventBus = options.eventBus ?? new EventBus<PackEvents>();
    this.#nowIso = options.nowIso ?? nowIso;
    if (!options.skipMigrations) {
      ensureConnectSchema(this.db);
    }
  }

  getInstalledPackage(packageId: string): InstalledPackageRecord | null {
    const row = this.db
      .prepare(
        'SELECT package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at FROM installed_packages WHERE package_id = ?',
      )
      .get(packageId) as unknown as RawInstalledPackageRow | undefined;
    return row ? mapInstalledRow(row) : null;
  }

  listInstalledPackages(filter: {
    readonly intent?: PackageIntent;
    readonly origin?: PackageOrigin;
    readonly query?: string;
    readonly enabledOnly?: boolean;
  } = {}): InstalledPackageRecord[] {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filter.intent) {
      clauses.push('intent = ?');
      params.push(filter.intent);
    }
    if (filter.origin) {
      clauses.push('origin = ?');
      params.push(filter.origin);
    }
    if (filter.enabledOnly) {
      clauses.push('enabled = 1');
    }
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at FROM installed_packages ${whereSql} ORDER BY package_id ASC`,
      )
      .all(...params) as unknown as RawInstalledPackageRow[];

    const mapped = rows.map(mapInstalledRow);
    const q = filter.query?.trim().toLowerCase();
    if (!q) return mapped;
    return mapped.filter((pkg) => {
      if (pkg.package_id.toLowerCase().includes(q)) return true;
      if (pkg.manifest.identity.name['en-US'].toLowerCase().includes(q)) return true;
      if (pkg.manifest.identity.name['zh-CN'].toLowerCase().includes(q)) return true;
      if (pkg.manifest.identity.summary['en-US'].toLowerCase().includes(q)) return true;
      return (pkg.manifest.identity.keywords ?? []).some((k) => k.toLowerCase().includes(q));
    });
  }

  upsertInstalledPackage(input: {
    readonly manifest: OplPackageManifestV2;
    readonly origin: PackageOrigin;
    readonly install_mode: PackageInstallMode;
    readonly install_path: string;
    readonly content_digest: string;
    readonly enabled?: boolean;
    readonly carrier_synced?: boolean;
  }): InstalledPackageRecord {
    const ts = this.#nowIso();
    const manifestJson = JSON.stringify(input.manifest);
    const enabledVal = input.enabled === false ? 0 : 1;
    const syncedVal = input.carrier_synced ? 1 : 0;

    return txImmediate(this.db, (db) => {
      const existing = db
        .prepare('SELECT installed_at FROM installed_packages WHERE package_id = ?')
        .get(input.manifest.identity.id) as { installed_at?: string } | undefined;
      const installedAt = existing?.installed_at ?? ts;

      db.prepare(
        `INSERT INTO installed_packages (
          package_id, version, intent, origin, install_mode, install_path,
          content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(package_id) DO UPDATE SET
          version = excluded.version,
          intent = excluded.intent,
          origin = excluded.origin,
          install_mode = excluded.install_mode,
          install_path = excluded.install_path,
          content_digest = excluded.content_digest,
          manifest_json = excluded.manifest_json,
          enabled = excluded.enabled,
          carrier_synced = excluded.carrier_synced,
          updated_at = excluded.updated_at`,
      ).run(
        input.manifest.identity.id,
        input.manifest.identity.version,
        input.manifest.identity.intent,
        input.origin,
        input.install_mode,
        input.install_path,
        input.content_digest,
        manifestJson,
        enabledVal,
        syncedVal,
        installedAt,
        ts,
      );

      const row = db
        .prepare(
          'SELECT package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at FROM installed_packages WHERE package_id = ?',
        )
        .get(input.manifest.identity.id) as unknown as RawInstalledPackageRow;
      return mapInstalledRow(row);
    });
  }

  setPackageEnabled(packageId: string, enabled: boolean): InstalledPackageRecord {
    const ts = this.#nowIso();
    return txImmediate(this.db, (db) => {
      const res = db
        .prepare('UPDATE installed_packages SET enabled = ?, updated_at = ? WHERE package_id = ?')
        .run(enabled ? 1 : 0, ts, packageId);
      if (res.changes === 0) {
        throw new PackError('PACK_NOT_FOUND', `Package '${packageId}' is not installed.`);
      }
      const row = db
        .prepare(
          'SELECT package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at FROM installed_packages WHERE package_id = ?',
        )
        .get(packageId) as unknown as RawInstalledPackageRow;
      return mapInstalledRow(row);
    });
  }

  setPackageCarrierSynced(packageId: string, carrierSynced: boolean): InstalledPackageRecord {
    const ts = this.#nowIso();
    return txImmediate(this.db, (db) => {
      const res = db
        .prepare('UPDATE installed_packages SET carrier_synced = ?, updated_at = ? WHERE package_id = ?')
        .run(carrierSynced ? 1 : 0, ts, packageId);
      if (res.changes === 0) {
        throw new PackError('PACK_NOT_FOUND', `Package '${packageId}' is not installed.`);
      }
      const row = db
        .prepare(
          'SELECT package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at FROM installed_packages WHERE package_id = ?',
        )
        .get(packageId) as unknown as RawInstalledPackageRow;
      return mapInstalledRow(row);
    });
  }

  deleteInstalledPackageAndRevokeGrants(packageId: string): {
    readonly removed: InstalledPackageRecord | null;
    readonly revoked_grants: number;
  } {
    const ts = this.#nowIso();
    return txImmediate(this.db, (db) => {
      const row = db
        .prepare(
          'SELECT package_id, version, intent, origin, install_mode, install_path, content_digest, manifest_json, enabled, carrier_synced, installed_at, updated_at FROM installed_packages WHERE package_id = ?',
        )
        .get(packageId) as unknown as RawInstalledPackageRow | undefined;
      if (!row) {
        return { removed: null, revoked_grants: 0 };
      }
      const removed = mapInstalledRow(row);
      const grantRes = db
        .prepare(
          "UPDATE connection_grants SET status = 'revoked', revoked_at = ?, updated_at = ? WHERE consumer_package_id = ? AND status IN ('requested', 'granted')",
        )
        .run(ts, ts, packageId);
      db.prepare('DELETE FROM installed_packages WHERE package_id = ?').run(packageId);
      return {
        removed,
        revoked_grants: Number(grantRes.changes ?? 0),
      };
    });
  }

  createOperation(input: {
    readonly op_id?: string;
    readonly batch_id?: string | null;
    readonly package_id: string;
    readonly action: PackageOperationAction;
    readonly target_version?: string | null;
    readonly status?: PackageOperationStatus;
    readonly reload_mode?: ReloadMode | null;
    readonly progress?: PackageOperationProgress;
  }): PackageOperationRecord {
    const wasInTransaction = this.db.isTransaction;
    const ts = this.#nowIso();
    const opId = input.op_id ?? newId('packop');
    const status = input.status ?? 'queued';
    const progressJson = JSON.stringify(input.progress ?? {});

    const record = txImmediate(this.db, (db) => {
      db.prepare(
        `INSERT INTO package_operations (
          op_id, batch_id, package_id, action, target_version, status,
          reload_mode, progress_json, error_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      ).run(
        opId,
        input.batch_id ?? null,
        input.package_id,
        input.action,
        input.target_version ?? null,
        status,
        input.reload_mode ?? null,
        progressJson,
        ts,
        ts,
      );
      const row = db
        .prepare(
          'SELECT op_id, batch_id, package_id, action, target_version, status, reload_mode, progress_json, error_json, created_at, updated_at FROM package_operations WHERE op_id = ?',
        )
        .get(opId) as unknown as RawPackageOperationRow;
      return mapOperationRow(row);
    });

    if (!wasInTransaction) {
      this.emitProgress(record);
    }
    return record;
  }

  transitionOperation(
    opId: string,
    patch: {
      readonly status: PackageOperationStatus;
      readonly target_version?: string | null;
      readonly reload_mode?: ReloadMode | null;
      readonly progress?: PackageOperationProgress;
      readonly error?: PackageOperationErrorInfo | null;
    },
  ): PackageOperationRecord {
    const wasInTransaction = this.db.isTransaction;
    const ts = this.#nowIso();

    const record = txImmediate(this.db, (db) => {
      const existing = db
        .prepare(
          'SELECT op_id, batch_id, package_id, action, target_version, status, reload_mode, progress_json, error_json, created_at, updated_at FROM package_operations WHERE op_id = ?',
        )
        .get(opId) as unknown as RawPackageOperationRow | undefined;
      if (!existing) {
        throw new PackError('PACK_NOT_FOUND', `Package operation '${opId}' not found.`);
      }
      const nextTargetVersion =
        patch.target_version !== undefined ? patch.target_version : existing.target_version;
      const nextReloadMode =
        patch.reload_mode !== undefined ? patch.reload_mode : existing.reload_mode;
      const nextProgressJson =
        patch.progress !== undefined ? JSON.stringify(patch.progress) : existing.progress_json;
      const nextErrorJson =
        patch.error !== undefined
          ? patch.error === null
            ? null
            : JSON.stringify(patch.error)
          : existing.error_json;

      db.prepare(
        'UPDATE package_operations SET target_version = ?, status = ?, reload_mode = ?, progress_json = ?, error_json = ?, updated_at = ? WHERE op_id = ?',
      ).run(
        nextTargetVersion,
        patch.status,
        nextReloadMode,
        nextProgressJson,
        nextErrorJson,
        ts,
        opId,
      );

      const updated = db
        .prepare(
          'SELECT op_id, batch_id, package_id, action, target_version, status, reload_mode, progress_json, error_json, created_at, updated_at FROM package_operations WHERE op_id = ?',
        )
        .get(opId) as unknown as RawPackageOperationRow;
      return mapOperationRow(updated);
    });

    if (!wasInTransaction) {
      this.emitProgress(record);
    }
    return record;
  }

  getOperation(opId: string): PackageOperationRecord | null {
    const row = this.db
      .prepare(
        'SELECT op_id, batch_id, package_id, action, target_version, status, reload_mode, progress_json, error_json, created_at, updated_at FROM package_operations WHERE op_id = ?',
      )
      .get(opId) as unknown as RawPackageOperationRow | undefined;
    return row ? mapOperationRow(row) : null;
  }

  listOperations(filter: {
    readonly batch_id?: string;
    readonly package_id?: string;
    readonly status?: PackageOperationStatus;
  } = {}): PackageOperationRecord[] {
    const clauses: string[] = [];
    const params: string[] = [];
    if (filter.batch_id) {
      clauses.push('batch_id = ?');
      params.push(filter.batch_id);
    }
    if (filter.package_id) {
      clauses.push('package_id = ?');
      params.push(filter.package_id);
    }
    if (filter.status) {
      clauses.push('status = ?');
      params.push(filter.status);
    }
    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db
      .prepare(
        `SELECT op_id, batch_id, package_id, action, target_version, status, reload_mode, progress_json, error_json, created_at, updated_at FROM package_operations ${whereSql} ORDER BY created_at DESC, rowid DESC`,
      )
      .all(...params) as unknown as RawPackageOperationRow[];
    return rows.map(mapOperationRow);
  }

  reconcileOperations(): PackageOperationRecord[] {
    const wasInTransaction = this.db.isTransaction;
    const ts = this.#nowIso();
    const interrupted = txImmediate(this.db, (db) => {
      const stale = db
        .prepare(
          "SELECT op_id FROM package_operations WHERE status IN ('queued', 'preparing', 'downloading', 'verifying', 'installing')",
        )
        .all() as Array<{ op_id: string }>;
      if (stale.length === 0) return [];
      db.prepare(
        "UPDATE package_operations SET status = 'interrupted', error_json = ?, updated_at = ? WHERE status IN ('queued', 'preparing', 'downloading', 'verifying', 'installing')",
      ).run(
        JSON.stringify({
          code: 'PACK_OPERATION_INTERRUPTED',
          message: 'Operation was interrupted before completion and reconciled on startup.',
        }),
        ts,
      );
      return stale.map((s) =>
        mapOperationRow(
          db
            .prepare(
              'SELECT op_id, batch_id, package_id, action, target_version, status, reload_mode, progress_json, error_json, created_at, updated_at FROM package_operations WHERE op_id = ?',
            )
            .get(s.op_id) as unknown as RawPackageOperationRow,
        ),
      );
    });

    if (!wasInTransaction) {
      for (const rec of interrupted) {
        this.emitProgress(rec);
      }
    }
    return interrupted;
  }

  emitProgress(record: PackageOperationRecord): void {
    const payload: PackProgressEvent = Object.freeze({
      op_id: record.op_id,
      batch_id: record.batch_id,
      package_id: record.package_id,
      action: record.action,
      target_version: record.target_version,
      status: record.status,
      reload_mode: record.reload_mode,
      progress: record.progress,
      error: record.error,
      timestamp: record.updated_at,
    });
    this.eventBus.emit('event.pack.progress', payload);
  }
}
