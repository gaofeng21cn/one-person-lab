import type { DatabaseSync } from 'node:sqlite';

export const FAMILY_RUNTIME_QUEUE_SCHEMA_VERSION = 4;
export const EXECUTION_SCOPE_EXPAND_MIGRATION = 'execution_scope_expand_v4';

export function withImmediateSchemaMigration<T>(db: DatabaseSync, migrate: () => T): T {
  if (db.isTransaction) return migrate();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = migrate();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function readSqliteColumnNames(db: DatabaseSync, tableName: string) {
  return new Set(
    (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>)
      .map((row) => row.name),
  );
}

export function addSqliteColumnIfMissing(
  db: DatabaseSync,
  tableName: string,
  columns: Set<string>,
  name: string,
  ddl: string,
) {
  if (columns.has(name)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`);
  columns.add(name);
}

export function runFamilyRuntimeQueueSchemaMigration(
  db: DatabaseSync,
  apply: () => void,
) {
  return withImmediateSchemaMigration(db, () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS family_runtime_schema_migrations (
        schema_version INTEGER PRIMARY KEY,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at TEXT NOT NULL
      );
    `);
    apply();
    const appliedAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO family_runtime_schema_migrations(schema_version, migration_name, applied_at)
      VALUES (?, ?, ?)
      ON CONFLICT(schema_version) DO UPDATE SET
        migration_name = excluded.migration_name,
        applied_at = excluded.applied_at
    `).run(
      FAMILY_RUNTIME_QUEUE_SCHEMA_VERSION,
      EXECUTION_SCOPE_EXPAND_MIGRATION,
      appliedAt,
    );
    db.prepare(`
      INSERT INTO meta(key, value) VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(FAMILY_RUNTIME_QUEUE_SCHEMA_VERSION));
  });
}
