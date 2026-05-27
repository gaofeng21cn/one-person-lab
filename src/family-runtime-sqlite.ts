import { DatabaseSync } from 'node:sqlite';

export const FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS = 5_000;

export type FamilyRuntimeSqliteOpenOptions = ConstructorParameters<typeof DatabaseSync>[1];

export function configureFamilyRuntimeSqliteConnection(db: DatabaseSync) {
  db.exec(`PRAGMA busy_timeout = ${FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS};`);
  return db;
}

export function openFamilyRuntimeSqlite(path: string, options?: FamilyRuntimeSqliteOpenOptions) {
  const db = options === undefined ? new DatabaseSync(path) : new DatabaseSync(path, options);
  return configureFamilyRuntimeSqliteConnection(db);
}
