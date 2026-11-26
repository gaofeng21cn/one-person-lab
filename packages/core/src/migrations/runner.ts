import type { DatabaseSync } from 'node:sqlite';

import { KernelError, toErrorMessage } from '../errors.ts';
import { nowIso } from '../ids.ts';
import { txImmediate } from '../sqlite.ts';
import { MIGRATION_0001_INITIAL_V2, type SqliteMigration } from './0001_initial_v2.ts';

export interface MigrationResult {
  readonly applied: readonly number[];
  readonly skipped: readonly number[];
  readonly current_version: number;
}

export function runMigrations(
  db: DatabaseSync,
  extraMigrations: readonly SqliteMigration[] = [],
): MigrationResult {
  const all = [MIGRATION_0001_INITIAL_V2, ...extraMigrations].sort(
    (a, b) => a.version - b.version,
  );
  const seenVersions = new Set<number>();
  for (const migration of all) {
    if (!Number.isInteger(migration.version) || migration.version <= 0) {
      throw new KernelError('DB_MIGRATION_FAILED', 'Migration version must be a positive integer.', {
        version: migration.version,
        name: migration.name,
      });
    }
    if (seenVersions.has(migration.version)) {
      throw new KernelError('DB_MIGRATION_FAILED', `Duplicate migration version ${migration.version}.`, {
        version: migration.version,
        name: migration.name,
      });
    }
    seenVersions.add(migration.version);
  }

  return txImmediate(db, () => {
    db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
    );
    const appliedRows = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
      .all() as Array<{ version: number }>;
    const alreadyApplied = new Set(appliedRows.map((row) => row.version));

    const applied: number[] = [];
    const skipped: number[] = [];
    const insertStmt = db.prepare(
      'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
    );

    for (const migration of all) {
      if (alreadyApplied.has(migration.version)) {
        skipped.push(migration.version);
        continue;
      }
      try {
        db.exec(migration.sql);
        insertStmt.run(migration.version, migration.name, nowIso());
        applied.push(migration.version);
      } catch (error) {
        throw new KernelError(
          'DB_MIGRATION_FAILED',
          `Migration ${migration.version} (${migration.name}) failed: ${toErrorMessage(error)}`,
          { version: migration.version, name: migration.name },
          { cause: error },
        );
      }
    }

    const currentVersion = all.length > 0 ? all[all.length - 1]!.version : 0;
    return {
      applied,
      skipped,
      current_version: currentVersion,
    };
  });
}
