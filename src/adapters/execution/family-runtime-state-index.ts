import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { openFamilyRuntimeLifecycleIndexDb } from './family-runtime-lifecycle-store.ts';
import { familyRuntimeSqliteSidecarPolicy, openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
import { createFamilyRuntimeQueueTables, familyRuntimePaths } from './family-runtime-store.ts';
import { rebuildStageArtifactSidecarProjection } from './family-runtime-state-index-stage-artifact-projection.ts';

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
const DEFAULT_BACKUP_RETENTION_MAX_COUNT = 3;
const DEFAULT_BACKUP_RETENTION_MAX_AGE_DAYS = 14;
const DEFAULT_BACKUP_RETENTION_MAX_BYTES = 8 * 1024 * 1024 * 1024;

type DatabaseDefinition = {
  database_id: string;
  path: string;
  owned_tables: string[];
  ensure: () => void;
};

function nowIso() {
  return new Date().toISOString();
}

function positiveIntegerEnvironmentValue(key: string, fallback: number) {
  const parsed = Number(process.env[key] ?? '');
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function backupRetentionPolicy() {
  return {
    max_count: positiveIntegerEnvironmentValue(
      'OPL_STATE_INDEX_BACKUP_MAX_COUNT',
      DEFAULT_BACKUP_RETENTION_MAX_COUNT,
    ),
    max_age_days: positiveIntegerEnvironmentValue(
      'OPL_STATE_INDEX_BACKUP_MAX_AGE_DAYS',
      DEFAULT_BACKUP_RETENTION_MAX_AGE_DAYS,
    ),
    max_bytes: positiveIntegerEnvironmentValue(
      'OPL_STATE_INDEX_BACKUP_MAX_BYTES',
      DEFAULT_BACKUP_RETENTION_MAX_BYTES,
    ),
  };
}

function pathBytes(targetPath: string): number {
  const stat = fs.lstatSync(targetPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    return stat.size;
  }
  return fs.readdirSync(targetPath).reduce(
    (total, entry) => total + pathBytes(path.join(targetPath, entry)),
    0,
  );
}

type BackupGeneration = {
  generation_id: string;
  paths: string[];
  bytes: number;
  modified_at_ms: number;
  kind: 'state_index_directory' | 'legacy_sqlite_backup';
};

function listBackupGenerations(storageRoot: string) {
  if (!fs.existsSync(storageRoot)) {
    return { generations: [] as BackupGeneration[], unmanaged_paths: [] as string[] };
  }
  const generations = new Map<string, BackupGeneration>();
  const unmanagedPaths: string[] = [];
  for (const name of fs.readdirSync(storageRoot)) {
    const entryPath = path.join(storageRoot, name);
    const stat = fs.lstatSync(entryPath);
    let generationId: string | null = null;
    let kind: BackupGeneration['kind'] | null = null;
    if (stat.isDirectory() && !stat.isSymbolicLink() && /^\d{4}-\d{2}-\d{2}T/.test(name)) {
      generationId = `state-index:${name}`;
      kind = 'state_index_directory';
    } else if (stat.isFile() && name.includes('.backup-')) {
      generationId = `legacy:${name.replace(/-(?:shm|wal)$/, '')}`;
      kind = 'legacy_sqlite_backup';
    }
    if (!generationId || !kind) {
      unmanagedPaths.push(entryPath);
      continue;
    }
    const existing = generations.get(generationId);
    if (existing) {
      existing.paths.push(entryPath);
      existing.bytes += pathBytes(entryPath);
      existing.modified_at_ms = Math.max(existing.modified_at_ms, stat.mtimeMs);
    } else {
      generations.set(generationId, {
        generation_id: generationId,
        paths: [entryPath],
        bytes: pathBytes(entryPath),
        modified_at_ms: stat.mtimeMs,
        kind,
      });
    }
  }
  return {
    generations: [...generations.values()].sort(
      (left, right) => right.modified_at_ms - left.modified_at_ms,
    ),
    unmanaged_paths: unmanagedPaths,
  };
}

function pruneBackupGenerations(storageRoot: string, protectedBackupRoot: string) {
  const policy = backupRetentionPolicy();
  const inventory = listBackupGenerations(storageRoot);
  const protectedPath = path.resolve(protectedBackupRoot);
  const ordered = [...inventory.generations].sort((left, right) => {
    const leftProtected = left.paths.some((entry) => path.resolve(entry) === protectedPath);
    const rightProtected = right.paths.some((entry) => path.resolve(entry) === protectedPath);
    if (leftProtected !== rightProtected) return leftProtected ? -1 : 1;
    return right.modified_at_ms - left.modified_at_ms;
  });
  const retained: BackupGeneration[] = [];
  const pruned: Array<BackupGeneration & { reasons: string[] }> = [];
  let retainedBytes = 0;
  let reclaimedBytes = 0;
  const now = Date.now();
  for (const generation of ordered) {
    const isProtected = generation.paths.some((entry) => path.resolve(entry) === protectedPath);
    const reasons = [
      ...(now - generation.modified_at_ms > policy.max_age_days * 24 * 60 * 60 * 1000
        ? ['max_age_days']
        : []),
      ...(retained.length >= policy.max_count ? ['max_count'] : []),
      ...(retainedBytes + generation.bytes > policy.max_bytes ? ['max_bytes'] : []),
    ];
    if (isProtected || reasons.length === 0) {
      retained.push(generation);
      retainedBytes += generation.bytes;
      continue;
    }
    reclaimedBytes += generation.bytes;
    pruned.push({ ...generation, reasons });
  }
  pruned.sort((left, right) => left.modified_at_ms - right.modified_at_ms);
  for (const generation of pruned) {
    for (const candidatePath of generation.paths) {
      const resolved = path.resolve(candidatePath);
      if (!resolved.startsWith(`${path.resolve(storageRoot)}${path.sep}`)) {
        throw new Error(`Backup retention candidate escaped storage root: ${resolved}`);
      }
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
  return {
    status: retainedBytes <= policy.max_bytes
      ? 'bounded'
      : 'latest_backup_retained_over_byte_budget',
    policy,
    protected_backup_root: protectedBackupRoot,
    retained,
    pruned,
    retained_bytes: retainedBytes,
    reclaimed_bytes: reclaimedBytes,
    unmanaged_paths: inventory.unmanaged_paths,
  };
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
      database_id: 'stage_attempt_index',
      path: paths.queue_db,
      owned_tables: [
        'tasks',
        'events',
        'notifications',
        'stage_attempts',
        'stage_quality_cycles',
        'stage_run_launches',
      ],
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
  const timestamp = `${nowIso().replaceAll(':', '-').replaceAll('.', '-')}-${process.pid}`;
  const backupStorageRoot = path.join(familyRuntimePaths().root, 'backups');
  const backupRoot = path.join(backupStorageRoot, timestamp);
  fs.mkdirSync(backupRoot, { recursive: true });
  try {
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
      retention: pruneBackupGenerations(backupStorageRoot, backupRoot),
    };
  } catch (error) {
    fs.rmSync(backupRoot, { recursive: true, force: true });
    throw error;
  }
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
        backup_retention: backupRetentionPolicy(),
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
