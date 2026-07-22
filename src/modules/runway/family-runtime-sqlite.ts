import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';

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
    foreign_keys_enabled: true,
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
  db.exec('PRAGMA foreign_keys = ON;');
  const row = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
  if (row.foreign_keys !== 1) {
    db.close();
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Family runtime SQLite connection could not enable foreign-key enforcement.',
      { failure_code: 'family_runtime_sqlite_foreign_keys_disabled' },
    );
  }
  return db;
}

export function openFamilyRuntimeSqlite(path: string, options?: FamilyRuntimeSqliteOpenOptions) {
  const db = options === undefined ? new DatabaseSync(path) : new DatabaseSync(path, options);
  return configureFamilyRuntimeSqliteConnection(db);
}
