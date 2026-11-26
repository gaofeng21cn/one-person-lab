-- 0. Schema migration ledger
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  TEXT NOT NULL
);

-- 1. Project workspaces
CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id  TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  root_path     TEXT NOT NULL UNIQUE,
  domain_id     TEXT,
  revision      INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 2. In-situ knowledge sources (bodies stay in external user directories)
CREATE TABLE IF NOT EXISTS knowledge_sources (
  source_id         TEXT PRIMARY KEY,
  scope             TEXT NOT NULL CHECK (scope IN ('personal_profile', 'long_term_topic', 'project_local')),
  adapter_kind      TEXT NOT NULL,
  root_path         TEXT NOT NULL,
  accepted_revision TEXT,
  status            TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'unavailable')),
  updated_at        TEXT NOT NULL
);

-- 3. Immutable per-run knowledge snapshots
CREATE TABLE IF NOT EXISTS knowledge_snapshots (
  snapshot_id   TEXT PRIMARY KEY,
  stage_run_id  TEXT NOT NULL,
  source_id     TEXT NOT NULL REFERENCES knowledge_sources(source_id),
  revision      TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  created_at    TEXT NOT NULL
);

-- 4. Installed and dev-linked packages
CREATE TABLE IF NOT EXISTS installed_packages (
  package_id      TEXT PRIMARY KEY,
  version         TEXT NOT NULL,
  intent          TEXT NOT NULL CHECK (intent IN ('agent', 'app', 'extension', 'channel')),
  origin          TEXT NOT NULL CHECK (origin IN ('opl', 'external', 'local_dev')),
  install_mode    TEXT NOT NULL CHECK (install_mode IN ('release', 'dev_link')),
  install_path    TEXT NOT NULL,
  content_digest  TEXT NOT NULL,
  manifest_json   TEXT NOT NULL,
  enabled         INTEGER NOT NULL DEFAULT 1,
  carrier_synced  INTEGER NOT NULL DEFAULT 0,
  installed_at    TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- 5. Background package install, update, and repair operations
CREATE TABLE IF NOT EXISTS package_operations (
  op_id          TEXT PRIMARY KEY,
  batch_id       TEXT,
  package_id     TEXT NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('install', 'update', 'uninstall', 'repair', 'sync')),
  target_version TEXT,
  status         TEXT NOT NULL CHECK (status IN ('queued', 'preparing', 'downloading', 'verifying', 'installing', 'succeeded', 'failed', 'cancelled', 'interrupted')),
  reload_mode    TEXT CHECK (reload_mode IN ('none', 'renderer_reload', 'restart_required')),
  progress_json  TEXT NOT NULL DEFAULT '{}',
  error_json     TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- 6. Three-layer isolated connections (opaque credential handles only)
CREATE TABLE IF NOT EXISTS connections (
  connection_id     TEXT PRIMARY KEY,
  provider_type     TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  account_label     TEXT,
  credential_handle TEXT NOT NULL,
  security_revision INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'expired', 'deleted')),
  updated_at        TEXT NOT NULL
);

-- 7. Digest-bound package capability grants
CREATE TABLE IF NOT EXISTS connection_grants (
  grant_id                     TEXT PRIMARY KEY,
  consumer_package_id          TEXT NOT NULL,
  consumer_content_digest      TEXT NOT NULL,
  connection_id                TEXT NOT NULL REFERENCES connections(connection_id),
  connection_security_revision INTEGER NOT NULL,
  capability_id                TEXT NOT NULL,
  capability_title             TEXT NOT NULL,
  capability_risk              TEXT NOT NULL CHECK (capability_risk IN ('read', 'local_write', 'external_write')),
  status                       TEXT NOT NULL CHECK (status IN ('requested', 'granted', 'denied', 'revoked', 'superseded')),
  created_at                   TEXT NOT NULL,
  updated_at                   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_grants_lookup
  ON connection_grants(consumer_package_id, connection_id, capability_id, status);

-- 8. Top-level durable tasks
CREATE TABLE IF NOT EXISTS tasks (
  task_id      TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  agent_id     TEXT,
  title        TEXT NOT NULL,
  goal_prompt  TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('active', 'paused_by_human', 'awaiting_human', 'completed', 'cancelled', 'failed')),
  revision     INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

-- 9. Stage execution instances
CREATE TABLE IF NOT EXISTS stage_runs (
  stage_run_id    TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  stage_id        TEXT NOT NULL,
  seq_no          INTEGER NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('queued', 'running', 'awaiting_review', 'repair_required', 'human_gate', 'paused_by_human', 'completed', 'failed', 'cancelled')),
  executor_id     TEXT NOT NULL,
  model_id        TEXT,
  human_gate_json TEXT,
  revision        INTEGER NOT NULL DEFAULT 1,
  started_at      TEXT,
  finished_at     TEXT,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stage_runs_task
  ON stage_runs(task_id, seq_no);

-- 10. Single execution attempts with session handles and lease tracking
CREATE TABLE IF NOT EXISTS attempts (
  attempt_id           TEXT PRIMARY KEY,
  stage_run_id         TEXT NOT NULL REFERENCES stage_runs(stage_run_id) ON DELETE CASCADE,
  attempt_no           INTEGER NOT NULL,
  role                 TEXT NOT NULL CHECK (role IN ('producer', 'reviewer', 'repairer', 'utility')),
  executor_id          TEXT NOT NULL,
  executor_session_ref TEXT,
  local_pid            INTEGER,
  status               TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'interrupted', 'cancelled', 'timed_out')),
  lease_expires_at     TEXT,
  usage_json           TEXT NOT NULL DEFAULT '{}',
  error_json           TEXT,
  started_at           TEXT NOT NULL,
  finished_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempts_live
  ON attempts(status, lease_expires_at);

-- 11. Append-only refs-only evidence, receipts, debts, and review verdicts
CREATE TABLE IF NOT EXISTS ledger_entries (
  entry_id      TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  stage_run_id  TEXT REFERENCES stage_runs(stage_run_id),
  attempt_id    TEXT REFERENCES attempts(attempt_id),
  entry_kind    TEXT NOT NULL CHECK (entry_kind IN (
                  'artifact_ref', 'owner_receipt', 'quality_debt',
                  'review_verdict', 'typed_blocker', 'human_decision', 'failed_path_note'
                )),
  owner_id      TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_task
  ON ledger_entries(task_id, created_at);

CREATE TRIGGER IF NOT EXISTS trg_ledger_no_update
BEFORE UPDATE ON ledger_entries
BEGIN
  SELECT RAISE(ABORT, 'ledger_entries is append-only');
END;

-- 12. Persistent cron schedules
CREATE TABLE IF NOT EXISTS schedules (
  schedule_id    TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL REFERENCES workspaces(workspace_id),
  agent_id       TEXT,
  cron_expr      TEXT NOT NULL,
  timezone       TEXT NOT NULL DEFAULT 'local',
  overlap_policy TEXT NOT NULL CHECK (overlap_policy IN ('skip', 'buffer_one', 'cancel_other')) DEFAULT 'skip',
  payload_json   TEXT NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1,
  next_run_at    TEXT NOT NULL,
  last_run_at    TEXT,
  last_task_id   TEXT,
  updated_at     TEXT NOT NULL
);
