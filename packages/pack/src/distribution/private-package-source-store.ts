import fs from 'node:fs';
import path from 'node:path';
import { isRecord, legacyDefaultStateEntry, txImmediate, type SqliteDb, type StatePaths } from '@opl/core';
import { PackError } from '../errors.ts';
import { isPrivatePackageSourceHandle } from './private-package-source-provider.ts';

export const defaultPrivateSourceId = 'github-packages:gaofeng21cn';
const sourceIdPattern = /^github-packages:([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)$/;

export function privateSourceOwner(id: string): string {
  const match = typeof id === 'string' && sourceIdPattern.exec(id);
  if (!match) throw new PackError('INVALID_INPUT', 'Expected a GitHub Packages source ID.');
  return match[1]!;
}

function legacySources(paths: StatePaths): Record<string, unknown>[] {
  const file = path.join(paths.state_dir, 'software-sources.json');
  const legacy = legacyDefaultStateEntry(paths, 'software-sources.json');
  try {
    let bytes: string;
    try {
      bytes = fs.readFileSync(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !legacy) throw error;
      bytes = fs.readFileSync(legacy, 'utf8');
    }
    const store: unknown = JSON.parse(bytes);
    if (isRecord(store) && store.surface_kind === 'opl_software_sources_store.v1' && Array.isArray(store.sources)) {
      const rows = store.sources.filter((row): row is Record<string, unknown> =>
        isRecord(row) && typeof row.source_id === 'string' && sourceIdPattern.test(row.source_id));
      const ids = rows.map(row => row.source_id);
      return rows.filter(row => ids.indexOf(row.source_id) === ids.lastIndexOf(row.source_id));
    }
    throw new Error('Invalid software sources.');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') process.emitWarning('Cannot import legacy software sources.');
    return [];
  }
}

export function initializePrivatePackageSourceStore(db: SqliteDb, paths: StatePaths): void {
  txImmediate(db, () => {
    if (db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'package_sources'").get()) return;
    db.exec(`
      CREATE TABLE package_sources (
        source_id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        credential_handle TEXT,
        enabled INTEGER NOT NULL CHECK(enabled IN (0, 1)),
        status TEXT NOT NULL,
        account_login TEXT,
        checked_at TEXT,
        error_message TEXT,
        updated_at TEXT NOT NULL,
        revision TEXT NOT NULL
      );
    `);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO package_sources
        (source_id, provider_id, credential_handle, enabled, status, account_login, checked_at, error_message, updated_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const row of legacySources(paths)) {
      if (typeof row.source_id !== 'string' || (row.provider_id !== undefined && row.provider_id !== 'github_packages')) continue;
      insert.run(
        row.source_id, 'github_packages',
        isPrivatePackageSourceHandle(row.credential_handle) ? row.credential_handle : null,
        Number(row.enabled === true),
        typeof row.status === 'string' ? row.status : 'unknown',
        typeof row.account_login === 'string' ? row.account_login : null,
        typeof row.checked_at === 'string' ? row.checked_at : typeof row.verified_at === 'string' ? row.verified_at : null,
        typeof row.error_message === 'string' ? row.error_message : typeof row.verification_reason === 'string' ? row.verification_reason : null,
        typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
        typeof row.revision === 'string' ? row.revision : 'imported',
      );
    }
  });
}

export function readConfiguredPrivatePackageHandle(db: SqliteDb, sourceId: string): string | null {
  privateSourceOwner(sourceId);
  if (!db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'package_sources'").get()) return null;
  const row = db.prepare("SELECT credential_handle FROM package_sources WHERE source_id = ? AND enabled = 1 AND provider_id = 'github_packages'").get(sourceId);
  return isPrivatePackageSourceHandle(row?.credential_handle) ? row.credential_handle : null;
}
