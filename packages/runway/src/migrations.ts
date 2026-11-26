import {
  runMigrations,
  type MigrationResult,
  type SqliteDb,
  type SqliteMigration,
} from '@opl/core';

export const MIGRATION_0004_RUNWAY: SqliteMigration = {
  version: 4001,
  name: '0004_runway',
  sql: `
ALTER TABLE schedules ADD COLUMN buffered_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE schedules ADD COLUMN last_status TEXT;
CREATE INDEX IF NOT EXISTS idx_schedules_due
  ON schedules(enabled, next_run_at);
`,
};

export function ensureRunwaySchema(db: SqliteDb): MigrationResult {
  return runMigrations(db, [MIGRATION_0004_RUNWAY]);
}
