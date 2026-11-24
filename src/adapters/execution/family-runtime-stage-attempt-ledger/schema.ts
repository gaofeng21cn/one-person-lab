import type { DatabaseSync } from 'node:sqlite';

import { createRuntimeExecutionScopeTable } from '../family-runtime-execution-scope-persistence.ts';
import {
  addSqliteColumnIfMissing,
  readSqliteColumnNames,
  withImmediateSchemaMigration,
} from '../family-runtime-schema-migrations.ts';

export function createStageAttemptTable(db: DatabaseSync) {
  db.exec('PRAGMA busy_timeout = 5000');
  return withImmediateSchemaMigration(db, () => {
    createRuntimeExecutionScopeTable(db);
    db.exec(`
    CREATE TABLE IF NOT EXISTS stage_attempts (
      stage_attempt_id TEXT PRIMARY KEY,
      idempotency_key TEXT NOT NULL,
      provider_kind TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      workspace_locator_json TEXT NOT NULL,
      source_fingerprint TEXT,
      executor_kind TEXT NOT NULL,
      stage_attempt_executor_policy_json TEXT,
      stage_run_id TEXT,
      scope_kind TEXT NOT NULL DEFAULT 'identity_unresolved'
        CHECK(scope_kind IN ('work_item', 'domain', 'system', 'identity_unresolved')),
      project_scope_id TEXT,
      work_item_scope_id TEXT,
      workspace_binding_id TEXT,
      binding_version_id TEXT,
      scope_digest TEXT REFERENCES execution_scopes(scope_digest),
      execution_scope_json TEXT,
      identity_state TEXT NOT NULL DEFAULT 'identity_unresolved'
        CHECK(identity_state IN ('resolved', 'identity_unresolved', 'quarantined')),
      quality_cycle_id TEXT,
      attempt_role TEXT,
      quality_round_index INTEGER,
      parent_attempt_ref TEXT,
      input_artifact_refs_json TEXT NOT NULL DEFAULT '[]',
      reviewed_artifact_hashes_json TEXT NOT NULL DEFAULT '[]',
      quality_source_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_knowledge_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_skill_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_policy_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_stage_goal_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_lineage_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_rubric_refs_json TEXT NOT NULL DEFAULT '[]',
      prior_finding_refs_json TEXT NOT NULL DEFAULT '[]',
      repair_map_refs_json TEXT NOT NULL DEFAULT '[]',
      quality_context_json TEXT NOT NULL DEFAULT '{}',
      quality_role_prompt_ref TEXT,
      execution_session_ref TEXT,
      usage_observation_json TEXT,
      context_manifest_ref TEXT,
      context_manifest_json TEXT,
      no_context_inheritance INTEGER,
      status TEXT NOT NULL,
      checkpoint_refs_json TEXT NOT NULL,
      closeout_refs_json TEXT NOT NULL,
      human_gate_refs_json TEXT NOT NULL,
      retry_budget_json TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      task_id TEXT,
      blocked_reason TEXT,
      provider_receipt_json TEXT NOT NULL,
      provider_run_json TEXT NOT NULL,
      activity_events_json TEXT NOT NULL,
      route_impact_json TEXT NOT NULL,
      closeout_receipt_status TEXT,
      archived_at TEXT,
      archived_reason TEXT,
      archived_source TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_idempotency ON stage_attempts(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_domain_stage ON stage_attempts(domain_id, stage_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_task_id ON stage_attempts(task_id);
    CREATE INDEX IF NOT EXISTS idx_stage_attempts_status ON stage_attempts(status, updated_at);
    CREATE TABLE IF NOT EXISTS stage_attempt_signals (
      signal_id TEXT PRIMARY KEY,
      stage_attempt_id TEXT NOT NULL,
      signal_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_attempt_signals_attempt ON stage_attempt_signals(stage_attempt_id, created_at);
    CREATE TABLE IF NOT EXISTS stage_attempt_closeouts (
      closeout_id TEXT PRIMARY KEY,
      stage_attempt_id TEXT NOT NULL,
      packet_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_attempt_closeouts_attempt ON stage_attempt_closeouts(stage_attempt_id, created_at);
    CREATE TABLE IF NOT EXISTS stage_quality_cycles (
      quality_cycle_id TEXT PRIMARY KEY,
      stage_run_id TEXT NOT NULL,
      domain_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      state_json TEXT NOT NULL,
      current_attempt_ref TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stage_quality_cycles_stage_run
      ON stage_quality_cycles(stage_run_id, stage_id, updated_at);
    `);
    const columns = readSqliteColumnNames(db, 'stage_attempts');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'idempotency_key', "idempotency_key TEXT NOT NULL DEFAULT ''");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'provider_run_json', "provider_run_json TEXT NOT NULL DEFAULT '{}'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'activity_events_json', "activity_events_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'route_impact_json', "route_impact_json TEXT NOT NULL DEFAULT '{}'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'closeout_receipt_status', 'closeout_receipt_status TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'stage_attempt_executor_policy_json', 'stage_attempt_executor_policy_json TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'stage_run_id', 'stage_run_id TEXT');
    addSqliteColumnIfMissing(
      db,
      'stage_attempts',
      columns,
      'scope_kind',
      "scope_kind TEXT NOT NULL DEFAULT 'identity_unresolved' CHECK(scope_kind IN ('work_item', 'domain', 'system', 'identity_unresolved'))",
    );
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'project_scope_id', 'project_scope_id TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'work_item_scope_id', 'work_item_scope_id TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'workspace_binding_id', 'workspace_binding_id TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'binding_version_id', 'binding_version_id TEXT');
    addSqliteColumnIfMissing(
      db,
      'stage_attempts',
      columns,
      'scope_digest',
      'scope_digest TEXT REFERENCES execution_scopes(scope_digest)',
    );
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'execution_scope_json', 'execution_scope_json TEXT');
    addSqliteColumnIfMissing(
      db,
      'stage_attempts',
      columns,
      'identity_state',
      "identity_state TEXT NOT NULL DEFAULT 'identity_unresolved' CHECK(identity_state IN ('resolved', 'identity_unresolved', 'quarantined'))",
    );
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_cycle_id', 'quality_cycle_id TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'attempt_role', 'attempt_role TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_round_index', 'quality_round_index INTEGER');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'parent_attempt_ref', 'parent_attempt_ref TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'input_artifact_refs_json', "input_artifact_refs_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'reviewed_artifact_hashes_json', "reviewed_artifact_hashes_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_source_refs_json', "quality_source_refs_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_stage_goal_refs_json', "quality_stage_goal_refs_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_lineage_refs_json', "quality_lineage_refs_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_rubric_refs_json', "quality_rubric_refs_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_knowledge_refs_json', "quality_knowledge_refs_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_skill_refs_json', "quality_skill_refs_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_policy_refs_json', "quality_policy_refs_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'prior_finding_refs_json', "prior_finding_refs_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'repair_map_refs_json', "repair_map_refs_json TEXT NOT NULL DEFAULT '[]'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_context_json', "quality_context_json TEXT NOT NULL DEFAULT '{}'");
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'quality_role_prompt_ref', 'quality_role_prompt_ref TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'execution_session_ref', 'execution_session_ref TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'usage_observation_json', 'usage_observation_json TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'context_manifest_ref', 'context_manifest_ref TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'context_manifest_json', 'context_manifest_json TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'no_context_inheritance', 'no_context_inheritance INTEGER');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'archived_at', 'archived_at TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'archived_reason', 'archived_reason TEXT');
    addSqliteColumnIfMissing(db, 'stage_attempts', columns, 'archived_source', 'archived_source TEXT');
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stage_attempts_idempotency ON stage_attempts(idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_stage_attempts_archived ON stage_attempts(archived_at, updated_at);
      CREATE INDEX IF NOT EXISTS idx_stage_attempts_quality_cycle
        ON stage_attempts(stage_run_id, quality_cycle_id, quality_round_index, attempt_role);
      CREATE INDEX IF NOT EXISTS idx_stage_attempts_work_item_scope
        ON stage_attempts(work_item_scope_id, stage_id, updated_at);
      CREATE INDEX IF NOT EXISTS idx_stage_attempts_scope_digest ON stage_attempts(scope_digest);
    `);
  });
}
