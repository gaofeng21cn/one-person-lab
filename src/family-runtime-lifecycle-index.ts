import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { resolveOplStatePaths } from './runtime-state-paths.ts';

type JsonRecord = Record<string, unknown>;

export type LifecycleIndexRecordInput = {
  domain_id: string;
  surface_id: string;
  surface_role: string;
  source_ref: string;
  receipt_ref?: string | null;
  checksum?: string | null;
  payload?: JsonRecord;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value: string, field: string) {
  const text = value.trim();
  if (!text) {
    throw new Error(`${field} is required.`);
  }
  return text;
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
  const db = new DatabaseSync(paths.lifecycle_index_db);
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
  `);
  return { db, paths };
}

function recordId(input: LifecycleIndexRecordInput) {
  return [
    normalizeText(input.domain_id, 'domain_id'),
    normalizeText(input.surface_id, 'surface_id'),
    normalizeText(input.source_ref, 'source_ref'),
  ].join('::');
}

export function recordFamilyRuntimeLifecycleRef(input: LifecycleIndexRecordInput) {
  const { db, paths } = openFamilyRuntimeLifecycleIndexDb();
  try {
    const updatedAt = nowIso();
    const refId = recordId(input);
    const payload = input.payload ?? {};
    db.prepare(`
      INSERT INTO lifecycle_refs(
        ref_id,
        domain_id,
        surface_id,
        surface_role,
        source_ref,
        receipt_ref,
        checksum,
        payload_json,
        created_at,
        updated_at
      )
      VALUES (@ref_id, @domain_id, @surface_id, @surface_role, @source_ref, @receipt_ref, @checksum, @payload_json, @created_at, @updated_at)
      ON CONFLICT(ref_id) DO UPDATE SET
        surface_role = excluded.surface_role,
        receipt_ref = excluded.receipt_ref,
        checksum = excluded.checksum,
        payload_json = excluded.payload_json,
        updated_at = excluded.updated_at
    `).run({
      ref_id: refId,
      domain_id: normalizeText(input.domain_id, 'domain_id'),
      surface_id: normalizeText(input.surface_id, 'surface_id'),
      surface_role: normalizeText(input.surface_role, 'surface_role'),
      source_ref: normalizeText(input.source_ref, 'source_ref'),
      receipt_ref: input.receipt_ref?.trim() || null,
      checksum: input.checksum?.trim() || null,
      payload_json: JSON.stringify(payload),
      created_at: updatedAt,
      updated_at: updatedAt,
    });
    return {
      surface_kind: 'family_runtime_lifecycle_index_record',
      owner: 'one-person-lab',
      status: 'recorded',
      ref_id: refId,
      lifecycle_index_db: paths.lifecycle_index_db,
      authority_boundary: {
        storage_role: 'sqlite_sidecar_index',
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        domain_artifact_authority_preserved: true,
      },
    };
  } finally {
    db.close();
  }
}

function parsePayload(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : {};
  } catch {
    return {};
  }
}

export function listFamilyRuntimeLifecycleRefs(input: { domain_id?: string } = {}) {
  const { db, paths } = openFamilyRuntimeLifecycleIndexDb();
  try {
    const rows = input.domain_id?.trim()
      ? db.prepare(`
        SELECT * FROM lifecycle_refs WHERE domain_id = ? ORDER BY updated_at DESC, ref_id ASC
      `).all(input.domain_id.trim())
      : db.prepare(`
        SELECT * FROM lifecycle_refs ORDER BY updated_at DESC, ref_id ASC
      `).all();
    const refs = (rows as Array<{
      ref_id: string;
      domain_id: string;
      surface_id: string;
      surface_role: string;
      source_ref: string;
      receipt_ref: string | null;
      checksum: string | null;
      payload_json: string;
      created_at: string;
      updated_at: string;
    }>).map((row) => ({
      ref_id: row.ref_id,
      domain_id: row.domain_id,
      surface_id: row.surface_id,
      surface_role: row.surface_role,
      source_ref: row.source_ref,
      receipt_ref: row.receipt_ref,
      checksum: row.checksum,
      payload: parsePayload(row.payload_json),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
    return {
      surface_kind: 'family_runtime_lifecycle_index',
      owner: 'one-person-lab',
      status: 'resolved',
      lifecycle_index_db: paths.lifecycle_index_db,
      summary: {
        total_ref_count: refs.length,
        filtered_domain_id: input.domain_id?.trim() || null,
      },
      refs,
      authority_boundary: {
        storage_role: 'sqlite_sidecar_index',
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_authorize_quality_or_export: false,
        domain_artifact_authority_preserved: true,
      },
    };
  } finally {
    db.close();
  }
}
