import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { DatabaseSync } from 'node:sqlite';

import { parseJsonText } from '../../kernel/json-file.ts';
import {
  record,
  stringList,
  type JsonRecord,
} from '../../kernel/json-record.ts';
import { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
import { resolveOplStatePaths } from './runtime-state-paths.ts';

export type { JsonRecord };
export { isRecord } from '../../kernel/contract-validation.ts';

export type LifecycleApplyMode = 'dry-run' | 'apply' | 'verify';

export const OPL_OWNED_APPLY_SCOPES = new Set([
  'opl_owned_runtime_ref',
  'opl_owned_index_ref',
  'opl_owned_provenance_ref',
  'opl_owned_tombstone_ref',
]);

export const DOMAIN_RECEIPT_REF_SCOPES = new Set([
  'domain_owned_artifact_receipt_ref',
  'domain_artifact_mutation_receipt_ref',
  'domain_owner_handoff_receipt_ref',
]);

export const LEGACY_CLEANUP_ACTION_KINDS = new Set([
  'record_domain_owner_handoff_receipt',
  'mark_opl_legacy_entry_tombstoned',
  'legacy_cleanup',
]);

export const FORBIDDEN_APPLY_SCOPES = new Set([
  'domain_truth',
  'memory_body',
  'artifact_body',
  'source_repo_active_file',
  'domain_owned_artifact',
  'domain_owned_memory_body',
  'domain_owned_truth',
]);

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeText(value: string, field: string) {
  const text = value.trim();
  if (!text) {
    throw new Error(`${field} is required.`);
  }
  return text;
}

export function normalizeOptionalText(value: string | undefined | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeStringList(value: unknown) {
  return stringList(value);
}

export function sha256(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function parsePayload(value: string) {
  try {
    return record(parseJsonText(value));
  } catch {
    return {};
  }
}

export function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter((value) => value.length > 0))].sort();
}

export function payloadStringRefs(payload: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const value = payload[key];
    if (typeof value === 'string') {
      return [value];
    }
    return normalizeStringList(value);
  }));
}

export function familyRuntimeLifecycleIndexPaths() {
  const stateDir = resolveOplStatePaths().state_dir;
  const root = path.join(stateDir, 'family-runtime');
  return {
    state_dir: stateDir,
    root,
    lifecycle_index_db: path.join(root, 'lifecycle-index.sqlite'),
  };
}

export function openFamilyRuntimeLifecycleIndexDb() {
  const paths = familyRuntimeLifecycleIndexPaths();
  fs.mkdirSync(paths.root, { recursive: true });
  const db = openFamilyRuntimeSqlite(paths.lifecycle_index_db);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS lifecycle_refs (
      ref_id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      surface_id TEXT NOT NULL,
      surface_role TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      receipt_ref TEXT,
      checksum TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lifecycle_refs_domain ON lifecycle_refs(domain_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_lifecycle_refs_surface ON lifecycle_refs(surface_id, updated_at);
    CREATE TABLE IF NOT EXISTS lifecycle_apply_receipts (
      receipt_ref TEXT PRIMARY KEY,
      target_domain_id TEXT NOT NULL,
      source_ref TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lifecycle_apply_receipts_domain ON lifecycle_apply_receipts(target_domain_id, created_at);
  `);
  return { db, paths };
}

export function lifecycleIndexAuthorityBoundary() {
  return {
    storage_role: 'sqlite_sidecar_index',
    opl_can_write_domain_truth: false,
    opl_can_write_memory_body: false,
    opl_can_authorize_quality_or_export: false,
    domain_artifact_authority_preserved: true,
  };
}

export function lifecycleApplyAuthorityBoundary() {
  return {
    opl_apply_scopes: [...OPL_OWNED_APPLY_SCOPES],
    domain_receipt_ref_scopes: [...DOMAIN_RECEIPT_REF_SCOPES],
    forbidden_apply_scopes: [...FORBIDDEN_APPLY_SCOPES],
    opl_can_write_domain_truth: false,
    opl_can_write_memory_body: false,
    opl_can_write_artifact_body: false,
    opl_can_write_source_repo_active_file: false,
    opl_can_move_or_delete_domain_repo_files: false,
    domain_repo_delete_requires_owner_receipt: true,
    domain_artifact_authority_preserved: true,
  };
}

export function insertLifecycleApplyReceipt(
  db: DatabaseSync,
  input: {
    receiptRef: string;
    targetDomainId: string;
    sourceRef: string;
    mode: LifecycleApplyMode;
    status: string;
    receipt: JsonRecord;
    createdAt: string;
  },
) {
  db.prepare(`
    INSERT INTO lifecycle_apply_receipts(
      receipt_ref,
      target_domain_id,
      source_ref,
      mode,
      status,
      receipt_json,
      created_at
    )
    VALUES (@receipt_ref, @target_domain_id, @source_ref, @mode, @status, @receipt_json, @created_at)
    ON CONFLICT(receipt_ref) DO UPDATE SET
      status = excluded.status,
      receipt_json = excluded.receipt_json
  `).run({
    receipt_ref: input.receiptRef,
    target_domain_id: input.targetDomainId,
    source_ref: input.sourceRef,
    mode: input.mode,
    status: input.status,
    receipt_json: JSON.stringify(input.receipt),
    created_at: input.createdAt,
  });
}
