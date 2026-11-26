import { runMigrations, type MigrationResult, type SqliteDb, type SqliteMigration } from '@opl/core';

export const MIGRATION_0003_WORKSPACE: SqliteMigration = {
  version: 3001,
  name: '0003_workspace',
  sql: `
CREATE TABLE IF NOT EXISTS workspace_knowledge_sources (
  workspace_id  TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
  source_id     TEXT NOT NULL REFERENCES knowledge_sources(source_id) ON DELETE CASCADE,
  bound_at      TEXT NOT NULL,
  PRIMARY KEY (workspace_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_ws_sources_source
  ON workspace_knowledge_sources(source_id);

CREATE TABLE IF NOT EXISTS workspace_writeback_proposals (
  proposal_id        TEXT PRIMARY KEY,
  workspace_id       TEXT REFERENCES workspaces(workspace_id) ON DELETE SET NULL,
  source_id          TEXT NOT NULL REFERENCES knowledge_sources(source_id) ON DELETE CASCADE,
  target_path        TEXT NOT NULL,
  accepted_revision  TEXT NOT NULL,
  content_sha256     TEXT NOT NULL,
  byte_size          INTEGER NOT NULL,
  before_sha256      TEXT,
  status             TEXT NOT NULL CHECK (status IN ('proposed', 'committed', 'superseded', 'cancelled')),
  created_at         TEXT NOT NULL,
  committed_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_wb_proposals_source
  ON workspace_writeback_proposals(source_id, status);

CREATE INDEX IF NOT EXISTS idx_snapshots_stage_run
  ON knowledge_snapshots(stage_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_source
  ON knowledge_snapshots(source_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_knowledge_snapshots_no_update
BEFORE UPDATE ON knowledge_snapshots
BEGIN
  SELECT RAISE(ABORT, 'knowledge_snapshots is immutable');
END;
`,
};

export function ensureWorkspaceSchema(db: SqliteDb): MigrationResult {
  return runMigrations(db, [MIGRATION_0003_WORKSPACE]);
}
