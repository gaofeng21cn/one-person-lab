import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { openFamilyRuntimeLifecycleIndexDb } from './family-runtime-lifecycle-store.ts';
import { familyRuntimeSqliteSidecarPolicy, openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
import { createFamilyRuntimeQueueTables, familyRuntimePaths } from './family-runtime-store.ts';
import { rebuildStageArtifactSidecarProjection } from './family-runtime-state-index-parts/stage-artifact-projection.ts';

export type FamilyRuntimeStateIndexAction =
  | 'doctor'
  | 'rebuild'
  | 'checkpoint'
  | 'integrity-check'
  | 'backup';

export type FamilyRuntimeStateIndexInput = {
  action: FamilyRuntimeStateIndexAction;
  domain_id?: string;
};

const STATE_INDEX_VERSION = 'opl-state-index-kernel.v1';

type DatabaseDefinition = {
  database_id: string;
  path: string;
  owned_tables: string[];
  ensure: () => void;
};

function nowIso() {
  return new Date().toISOString();
}

function createRefsOnlyArtifactIndexTables(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stage_current_pointers (
      domain_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      payload_ref_json TEXT NOT NULL,
      PRIMARY KEY(domain_id, program_id, stage_id)
    );
    CREATE TABLE IF NOT EXISTS manifest_index (
      domain_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      manifest_ref TEXT NOT NULL,
      PRIMARY KEY(domain_id, program_id, stage_id, attempt_id)
    );
    CREATE TABLE IF NOT EXISTS artifact_refs (
      artifact_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      locator_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipt_refs (
      receipt_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      locator_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS blocker_refs (
      blocker_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      locator_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lineage_events (
      event_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      event_json_ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lineage_edges (
      edge_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      edge_json_ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS retention_ledger (
      retention_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      retention_json_ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS restore_proofs (
      restore_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT NOT NULL,
      stage_id TEXT NOT NULL,
      attempt_id TEXT NOT NULL,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      restore_json_ref TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifact_refs_domain_stage ON artifact_refs(domain_id, stage_id, indexed_at);
    CREATE INDEX IF NOT EXISTS idx_receipt_refs_domain_stage ON receipt_refs(domain_id, stage_id, indexed_at);
    CREATE INDEX IF NOT EXISTS idx_blocker_refs_domain_stage ON blocker_refs(domain_id, stage_id, indexed_at);
  `);
  db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run(
    'schema_version',
    STATE_INDEX_VERSION,
  );
}

function createRefsOnlyOperatorReadModelTables(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS operator_tasks (
      task_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT,
      stage_id TEXT,
      attempt_id TEXT,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      task_json_ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artifact_drilldown (
      drilldown_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT,
      stage_id TEXT,
      attempt_id TEXT,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      drilldown_json_ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS owner_route_index (
      route_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT,
      stage_id TEXT,
      attempt_id TEXT,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      route_json_ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_fingerprints (
      fingerprint_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT,
      stage_id TEXT,
      attempt_id TEXT,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      fingerprint_json_ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_unit_outbox (
      outbox_ref TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      program_id TEXT,
      stage_id TEXT,
      attempt_id TEXT,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      outbox_json_ref TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS maintenance_runs (
      run_ref TEXT PRIMARY KEY,
      domain_id TEXT,
      program_id TEXT,
      stage_id TEXT,
      attempt_id TEXT,
      surface_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      content_hash TEXT,
      observed_at TEXT NOT NULL,
      indexed_at TEXT NOT NULL,
      index_version TEXT NOT NULL,
      rebuild_epoch TEXT NOT NULL,
      maintenance_json_ref TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_operator_tasks_domain ON operator_tasks(domain_id, indexed_at);
    CREATE INDEX IF NOT EXISTS idx_owner_route_index_domain ON owner_route_index(domain_id, indexed_at);
    CREATE INDEX IF NOT EXISTS idx_work_unit_outbox_domain ON work_unit_outbox(domain_id, indexed_at);
  `);
  db.prepare('INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)').run(
    'schema_version',
    STATE_INDEX_VERSION,
  );
}

function ensureDatabase(file: string, createTables: (db: DatabaseSync) => void) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = openFamilyRuntimeSqlite(file);
  try {
    createTables(db);
  } finally {
    db.close();
  }
}

function stateIndexDatabaseDefinitions(): DatabaseDefinition[] {
  const paths = familyRuntimePaths();
  return [
    {
      database_id: 'queue',
      path: paths.queue_db,
      owned_tables: ['tasks', 'events', 'notifications', 'queue_holds', 'stage_attempts'],
      ensure: () => {
        fs.mkdirSync(paths.root, { recursive: true });
        const db = openFamilyRuntimeSqlite(paths.queue_db);
        try {
          db.exec('PRAGMA journal_mode = WAL;');
          createFamilyRuntimeQueueTables(db);
        } finally {
          db.close();
        }
      },
    },
    {
      database_id: 'lifecycle_index',
      path: path.join(paths.root, 'lifecycle-index.sqlite'),
      owned_tables: ['lifecycle_refs', 'lifecycle_apply_receipts'],
      ensure: () => {
        const { db } = openFamilyRuntimeLifecycleIndexDb();
        db.close();
      },
    },
    {
      database_id: 'artifact_index',
      path: path.join(paths.root, 'artifact-index.sqlite'),
      owned_tables: [
        'stage_current_pointers',
        'manifest_index',
        'artifact_refs',
        'receipt_refs',
        'blocker_refs',
        'lineage_events',
        'lineage_edges',
        'retention_ledger',
        'restore_proofs',
      ],
      ensure: () => ensureDatabase(path.join(paths.root, 'artifact-index.sqlite'), createRefsOnlyArtifactIndexTables),
    },
    {
      database_id: 'operator_read_model',
      path: path.join(paths.root, 'read-model.sqlite'),
      owned_tables: [
        'operator_tasks',
        'artifact_drilldown',
        'owner_route_index',
        'source_fingerprints',
        'work_unit_outbox',
        'maintenance_runs',
      ],
      ensure: () => ensureDatabase(path.join(paths.root, 'read-model.sqlite'), createRefsOnlyOperatorReadModelTables),
    },
  ];
}

function inspectDatabase(definition: DatabaseDefinition) {
  if (!fs.existsSync(definition.path)) {
    return {
      database_id: definition.database_id,
      path: definition.path,
      status: 'missing',
      owned_tables: definition.owned_tables,
      present_tables: [],
      missing_tables: definition.owned_tables,
      integrity_check: null,
      row_counts: {},
    };
  }
  const db = openFamilyRuntimeSqlite(definition.path, { readOnly: true });
  try {
    const tables = (db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name
    `).all() as Array<{ name: string }>).map((row) => row.name);
    const missingTables = definition.owned_tables.filter((table) => !tables.includes(table));
    const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    const rowCounts = Object.fromEntries(definition.owned_tables
      .filter((table) => tables.includes(table))
      .map((table) => {
        const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
        return [table, row.count];
      }));
    return {
      database_id: definition.database_id,
      path: definition.path,
      status: missingTables.length === 0 && integrity.integrity_check === 'ok' ? 'ready' : 'degraded',
      owned_tables: definition.owned_tables,
      present_tables: tables,
      missing_tables: missingTables,
      integrity_check: integrity.integrity_check,
      row_counts: rowCounts,
    };
  } finally {
    db.close();
  }
}

function checkpointDatabase(definition: DatabaseDefinition) {
  definition.ensure();
  const db = openFamilyRuntimeSqlite(definition.path);
  try {
    const checkpoint = db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as Record<string, unknown>;
    db.exec('PRAGMA optimize;');
    return {
      database_id: definition.database_id,
      path: definition.path,
      status: 'checkpointed',
      checkpoint,
    };
  } finally {
    db.close();
  }
}

function backupDatabases(definitions: DatabaseDefinition[]) {
  const timestamp = nowIso().replaceAll(':', '-').replaceAll('.', '-');
  const backupRoot = path.join(familyRuntimePaths().root, 'backups', timestamp);
  fs.mkdirSync(backupRoot, { recursive: true });
  const files = definitions.map((definition) => {
    checkpointDatabase(definition);
    const backupPath = path.join(backupRoot, path.basename(definition.path));
    fs.copyFileSync(definition.path, backupPath);
    return {
      database_id: definition.database_id,
      source_path: definition.path,
      backup_path: backupPath,
      copied: true,
    };
  });
  return {
    backup_root: backupRoot,
    files,
  };
}

function writeMaintenanceRun(action: FamilyRuntimeStateIndexAction, status: string, domainId?: string) {
  const definition = stateIndexDatabaseDefinitions().find((entry) => entry.database_id === 'operator_read_model');
  if (!definition) {
    return null;
  }
  definition.ensure();
  const db = openFamilyRuntimeSqlite(definition.path);
  try {
    const observedAt = nowIso();
    const runRef = `opl-state-index-maintenance:${action}:${observedAt}`;
    db.prepare(`
      INSERT INTO maintenance_runs(
        run_ref,
        domain_id,
        surface_id,
        source_ref,
        observed_at,
        indexed_at,
        index_version,
        rebuild_epoch,
        maintenance_json_ref
      )
      VALUES (@run_ref, @domain_id, @surface_id, @source_ref, @observed_at, @indexed_at, @index_version, @rebuild_epoch, @maintenance_json_ref)
    `).run({
      run_ref: runRef,
      domain_id: domainId ?? null,
      surface_id: 'opl_state_index_kernel',
      source_ref: 'contracts/opl-framework/state-index-kernel-contract.json',
      observed_at: observedAt,
      indexed_at: observedAt,
      index_version: STATE_INDEX_VERSION,
      rebuild_epoch: observedAt,
      maintenance_json_ref: JSON.stringify({ action, status }),
    });
    return runRef;
  } finally {
    db.close();
  }
}

export function runFamilyRuntimeStateIndex(input: FamilyRuntimeStateIndexInput) {
  const definitions = stateIndexDatabaseDefinitions();
  let stageArtifactProjection = null;
  if (input.action === 'rebuild') {
    for (const definition of definitions) {
      definition.ensure();
    }
    stageArtifactProjection = rebuildStageArtifactSidecarProjection({
      domainId: input.domain_id,
      definitions,
      indexVersion: STATE_INDEX_VERSION,
    });
  }
  const checkpoint_results = input.action === 'checkpoint'
    ? definitions.map(checkpointDatabase)
    : [];
  const backup = input.action === 'backup' ? backupDatabases(definitions) : null;
  if (input.action === 'integrity-check') {
    for (const definition of definitions) {
      definition.ensure();
    }
  }
  const inspected = definitions.map(inspectDatabase);
  const missing = inspected.filter((database) => database.status === 'missing');
  const degraded = inspected.filter((database) => database.status === 'degraded');
  const status = missing.length === 0 && degraded.length === 0 ? 'ready' : 'degraded';
  const maintenanceRunRef = input.action === 'doctor'
    ? null
    : writeMaintenanceRun(input.action, status, input.domain_id);
  return {
    version: 'g2',
    state_index: {
      surface_kind: 'opl_state_index_kernel',
      version: STATE_INDEX_VERSION,
      action: input.action,
      status,
      state_root: familyRuntimePaths().root,
      filtered_domain_id: input.domain_id ?? null,
      contract_ref: 'contracts/opl-framework/state-index-kernel-contract.json',
      sqlite_sidecar_policy: familyRuntimeSqliteSidecarPolicy(),
      summary: {
        database_count: inspected.length,
        ready_database_count: inspected.filter((database) => database.status === 'ready').length,
        missing_database_count: missing.length,
        degraded_database_count: degraded.length,
        maintenance_run_ref: maintenanceRunRef,
      },
      databases: inspected,
      stage_artifact_projection: stageArtifactProjection,
      checkpoint_results,
      backup,
      maintenance_policy: {
        checkpoint_required: true,
        backup_required: true,
        integrity_check_required: true,
        optimize_required: true,
        backup_command: 'opl index backup --json',
        checkpoint_command: 'opl index checkpoint --json',
        integrity_command: 'opl index integrity-check --json',
      },
      authority_boundary: {
        file_truth_source_of_truth: true,
        sqlite_sidecar_source_of_truth: false,
        sqlite_record_counts_as_stage_complete: false,
        stores_domain_truth: false,
        stores_memory_body: false,
        stores_artifact_body: false,
        stores_quality_or_export_verdict: false,
        opl_can_create_domain_owner_receipt: false,
      },
    },
  };
}
