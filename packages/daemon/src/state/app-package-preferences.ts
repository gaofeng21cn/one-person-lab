import fs from 'node:fs';
import path from 'node:path';
import { isRecord, txImmediate, type SqliteDb } from '@opl/core';
import type { InstalledPackageRecord } from '@opl/pack';
import { DaemonRpcError } from '../errors.ts';

type PackageIdentity = Pick<InstalledPackageRecord, 'package_id' | 'manifest'>;
type ShortcutPreference = { visible: boolean | null; sort_order: number | null };
type StoredShortcut = { package_id: string; shortcut_id: string; visible: number | null; sort_order: number | null };

function legacyPreference(stateDir: string, name: string): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(fs.readFileSync(path.join(stateDir, name), 'utf8'));
    return isRecord(data) && data.version === 'g1' ? data : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      process.emitWarning(`Cannot import legacy App preferences from ${name}.`);
    }
    return null;
  }
}

// Keep user choices across upgrades and reinstalls. A later v2 write takes
// precedence when the legacy files are still present on subsequent starts.
export function initializeAppPackagePreferences(db: SqliteDb, stateDir: string): void {
  const packages = legacyPreference(stateDir, 'app-package-preferences.json')?.packages;
  const shortcuts = legacyPreference(stateDir, 'agent-package-home-shortcut-preferences.json')?.preferences;
  txImmediate(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_package_preferences (
        package_id TEXT PRIMARY KEY,
        enabled INTEGER NOT NULL CHECK(enabled IN (0, 1))
      );
      CREATE TABLE IF NOT EXISTS app_shortcut_preferences (
        package_id TEXT NOT NULL,
        shortcut_id TEXT NOT NULL,
        visible INTEGER CHECK(visible IN (0, 1)),
        sort_order INTEGER,
        PRIMARY KEY (package_id, shortcut_id)
      );
    `);
    if (isRecord(packages)) {
      const insert = db.prepare('INSERT OR IGNORE INTO app_package_preferences (package_id, enabled) VALUES (?, ?)');
      for (const [id, enabled] of Object.entries(packages)) {
        if (typeof enabled === 'boolean') insert.run(id, Number(enabled));
      }
    }
    if (Array.isArray(shortcuts)) {
      const insert = db.prepare('INSERT OR IGNORE INTO app_shortcut_preferences (package_id, shortcut_id, visible, sort_order) VALUES (?, ?, ?, ?)');
      for (const row of shortcuts) {
        if (!isRecord(row) || typeof row.package_id !== 'string' || typeof row.shortcut_id !== 'string' || typeof row.visible !== 'boolean') continue;
        insert.run(row.package_id, row.shortcut_id, Number(row.visible),
          typeof row.sort_order === 'number' && Number.isSafeInteger(row.sort_order) ? row.sort_order : null);
      }
    }
  });
}

export function readAppPackagePreferences(db: SqliteDb) {
  const enabled = new Map<string, boolean>();
  const shortcuts = new Map<string, Map<string, ShortcutPreference>>();
  const packages = db.prepare('SELECT package_id, enabled FROM app_package_preferences').all() as { package_id: string; enabled: number }[];
  for (const pkg of packages) enabled.set(pkg.package_id, pkg.enabled !== 0);
  const rows = db.prepare('SELECT package_id, shortcut_id, visible, sort_order FROM app_shortcut_preferences').all() as StoredShortcut[];
  for (const row of rows) {
    const byId = shortcuts.get(row.package_id) ?? new Map<string, ShortcutPreference>();
    byId.set(row.shortcut_id, { visible: row.visible === null ? null : row.visible !== 0, sort_order: row.sort_order });
    shortcuts.set(row.package_id, byId);
  }
  return { enabled, shortcuts };
}

export function isAppPackageEnabled(db: SqliteDb, packageId: string): boolean {
  return db.prepare('SELECT enabled FROM app_package_preferences WHERE package_id = ?').get(packageId)?.enabled !== 0;
}

export function setAppPackageEnabled(db: SqliteDb, pkg: PackageIdentity, payload: Record<string, unknown>, options: { dryRun: boolean }) {
  if (pkg.package_id !== payload.package_id || typeof payload.enabled !== 'boolean') {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'A matching package_id and boolean enabled are required.');
  }
  if (!options.dryRun) {
    db.prepare(`INSERT INTO app_package_preferences (package_id, enabled) VALUES (?, ?)
      ON CONFLICT(package_id) DO UPDATE SET enabled = excluded.enabled`).run(pkg.package_id, Number(payload.enabled));
  }
  return { surface_kind: 'opl_app_package_preference.v1', package_id: pkg.package_id,
    app_enabled: payload.enabled, dry_run: options.dryRun, scope: 'opl_app_desktop_and_webui' };
}

export function setAppShortcutPreference(db: SqliteDb, pkg: PackageIdentity, payload: Record<string, unknown>, options: { dryRun: boolean }) {
  const shortcutId = payload.shortcut_id ?? payload.shortcutId;
  const visible = payload.visible;
  const sortOrder = payload.sort_order ?? payload.sortOrder;
  if (pkg.package_id !== payload.package_id || typeof shortcutId !== 'string'
    || !pkg.manifest.identity.home_shortcuts?.some(item => item.id === shortcutId)
    || payload.exposure_action !== undefined || payload.exposureAction !== undefined
    || (visible === undefined && sortOrder === undefined)
    || (visible !== undefined && typeof visible !== 'boolean')
    || (sortOrder !== undefined && (typeof sortOrder !== 'number' || !Number.isSafeInteger(sortOrder)))) {
    throw new DaemonRpcError(-32602, 'INVALID_INPUT', 'Specify a declared home shortcut and a visibility or integer sort order.');
  }
  if (!options.dryRun) {
    db.prepare(`INSERT INTO app_shortcut_preferences (package_id, shortcut_id, visible, sort_order) VALUES (?, ?, ?, ?)
      ON CONFLICT(package_id, shortcut_id) DO UPDATE SET
        visible = COALESCE(excluded.visible, app_shortcut_preferences.visible),
        sort_order = COALESCE(excluded.sort_order, app_shortcut_preferences.sort_order)`)
      .run(pkg.package_id, shortcutId, visible === undefined ? null : Number(visible), sortOrder ?? null);
  }
  return { version: 'g2', opl_agent_package_home_shortcut_preferences: {
    surface_kind: 'opl_agent_package_home_shortcut_preferences_set', status: options.dryRun ? 'validated_no_write' : 'updated',
    package_id: pkg.package_id, shortcut_id: shortcutId, visible, sort_order: sortOrder, dry_run: options.dryRun,
  } };
}
