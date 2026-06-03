import { DatabaseSync } from 'node:sqlite';

const FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS = 5_000;
const FAMILY_RUNTIME_SQLITE_JOURNAL_MODE = 'WAL';

export type FamilyRuntimeSqliteOpenOptions = ConstructorParameters<typeof DatabaseSync>[1];

export function familyRuntimeSqliteSidecarPolicy() {
  return {
    surface_kind: 'opl_family_runtime_sqlite_sidecar_policy',
    contract_ref: 'contracts/opl-framework/state-index-kernel-contract.json',
    storage_role: 'sqlite_sidecar_index',
    journal_mode: FAMILY_RUNTIME_SQLITE_JOURNAL_MODE,
    busy_timeout_ms: FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS,
    single_writer_assumption: true,
    network_filesystem_multi_writer_supported: false,
    stores_domain_truth: false,
    stores_memory_body: false,
    stores_artifact_body: false,
    stores_quality_or_export_verdict: false,
    rebuildable_from_file_truth_and_refs: true,
  } as const;
}

function configureFamilyRuntimeSqliteConnection(db: DatabaseSync) {
  db.exec(`PRAGMA busy_timeout = ${FAMILY_RUNTIME_SQLITE_BUSY_TIMEOUT_MS};`);
  return db;
}

export function openFamilyRuntimeSqlite(path: string, options?: FamilyRuntimeSqliteOpenOptions) {
  const db = options === undefined ? new DatabaseSync(path) : new DatabaseSync(path, options);
  return configureFamilyRuntimeSqliteConnection(db);
}
