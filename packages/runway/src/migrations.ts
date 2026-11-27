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
  return runMigrations(db, [MIGRATION_0004_RUNWAY, {
    version: 4002,
    name: 'runway_capability_calls',
    sql: `
      ALTER TABLE attempts ADD COLUMN reviewed_attempt_id TEXT REFERENCES attempts(attempt_id);
      CREATE TABLE runway_capability_calls (
        attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id) ON DELETE CASCADE,
        call_id_source TEXT NOT NULL,
        call_id TEXT NOT NULL,
        server TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        input_digest TEXT NOT NULL,
        output_digest TEXT NOT NULL,
        binding_digest TEXT,
        status TEXT NOT NULL DEFAULT 'observed' CHECK (status IN ('observed', 'conflict')),
        PRIMARY KEY (attempt_id, call_id_source, call_id)
      );
    `,
  }]);
}
