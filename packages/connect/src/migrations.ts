import { runMigrations, type MigrationResult, type SqliteDb, type SqliteMigration } from '@opl/core';

export const MIGRATION_0002_CONNECT: SqliteMigration = {
  version: 2001,
  name: '0002_connect',
  sql: `
ALTER TABLE connections ADD COLUMN endpoint TEXT;
ALTER TABLE connections ADD COLUMN capabilities_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE connections ADD COLUMN created_at TEXT NOT NULL DEFAULT '';

ALTER TABLE connection_grants ADD COLUMN request_batch_id TEXT;
ALTER TABLE connection_grants ADD COLUMN approved_by TEXT;
ALTER TABLE connection_grants ADD COLUMN approved_at TEXT;
ALTER TABLE connection_grants ADD COLUMN expires_at TEXT;
ALTER TABLE connection_grants ADD COLUMN decided_at TEXT;
ALTER TABLE connection_grants ADD COLUMN decided_by_client_kind TEXT;
ALTER TABLE connection_grants ADD COLUMN revoked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_grants_batch
  ON connection_grants(request_batch_id);

CREATE TABLE IF NOT EXISTS connect_audit_events (
  event_id            TEXT PRIMARY KEY,
  kind                TEXT NOT NULL,
  connection_id       TEXT NOT NULL,
  grant_id            TEXT,
  consumer_package_id TEXT,
  capability_id       TEXT,
  capability_risk     TEXT CHECK (capability_risk IS NULL OR capability_risk IN ('read', 'local_write', 'external_write')),
  disposition         TEXT CHECK (disposition IS NULL OR disposition IN ('completed', 'not_dispatched', 'provider_reported', 'unknown_after_dispatch')),
  actor_kind          TEXT NOT NULL,
  summary             TEXT NOT NULL,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_connect_audit_conn
  ON connect_audit_events(connection_id, created_at);
`,
};

export function ensureConnectSchema(db: SqliteDb): MigrationResult {
  return runMigrations(db, [MIGRATION_0002_CONNECT]);
}
