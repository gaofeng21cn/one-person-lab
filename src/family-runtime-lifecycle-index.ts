import { createHash } from 'node:crypto';
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

export type LifecycleApplyMode = 'dry-run' | 'apply' | 'verify';

export type LifecycleApplyActionInput = {
  action_id: string;
  action_kind?: string;
  owner_scope: string;
  target_ref: string;
  restore_proof_refs?: string[];
  domain_artifact_mutation_receipt_refs?: string[];
  domain_owner_handoff_receipt_refs?: string[];
  no_active_caller_refs?: string[];
  replacement_parity_refs?: string[];
  manifest_ref?: string;
  checksum?: string;
};

export type LifecycleApplyInput = {
  mode: LifecycleApplyMode;
  target_domain_id: string;
  source_ref?: string;
  manifest_ref?: string;
  receipt_ref?: string | null;
  actions?: unknown[];
};

export type LifecycleReconcileInput = {
  target_domain_id?: string;
  expected_source_refs?: string[];
  expected_receipt_refs?: string[];
  expected_restore_proof_refs?: string[];
  expected_domain_artifact_mutation_receipt_refs?: string[];
  max_age_ms?: number | null;
  now?: string;
};

type NormalizedLifecycleApplyAction = {
  action_id: string;
  action_kind: string;
  owner_scope: string;
  target_ref: string;
  restore_proof_refs: string[];
  domain_artifact_mutation_receipt_refs: string[];
  domain_owner_handoff_receipt_refs: string[];
  no_active_caller_refs: string[];
  replacement_parity_refs: string[];
  manifest_ref: string | null;
  checksum: string | null;
};

type LifecycleApplyDecision = NormalizedLifecycleApplyAction & {
  receipt_ref: string;
  decision: 'blocked' | 'safe_to_apply';
  surface_role?: 'safe_cleanup_receipt' | 'domain_artifact_mutation_receipt_ref';
  writes_domain_truth: false;
  writes_memory_body: false;
  writes_artifact_body: false;
  writes_source_repo_active_file: false;
  ledger_roles?: string[];
  cleanup_receipt?: JsonRecord;
  blocker?: {
    blocker_kind: string;
    blocker_id: string;
    owner_scope: string;
    required_owner: string;
  };
};

type LifecycleApplySummary = {
  safe_action_count: number;
  unsafe_action_count: number;
  cleanup_receipt_count: number;
  restore_proof_ref_count: number;
  domain_artifact_mutation_receipt_ref_count: number;
  domain_owner_handoff_receipt_ref_count: number;
  no_active_caller_ref_count: number;
  replacement_parity_ref_count: number;
  verified_receipt_count: number;
  raw_verified_receipt_count: number;
  folded_duplicate_receipt_count: number;
  writes_performed: boolean;
};

const OPL_OWNED_APPLY_SCOPES = new Set([
  'opl_owned_runtime_ref',
  'opl_owned_index_ref',
  'opl_owned_provenance_ref',
  'opl_owned_tombstone_ref',
]);

const DOMAIN_RECEIPT_REF_SCOPES = new Set([
  'domain_owned_artifact_receipt_ref',
  'domain_artifact_mutation_receipt_ref',
  'domain_owner_handoff_receipt_ref',
]);

const LEGACY_CLEANUP_ACTION_KINDS = new Set([
  'record_domain_owner_handoff_receipt',
  'mark_opl_legacy_entry_tombstoned',
  'legacy_cleanup',
]);

const FORBIDDEN_APPLY_SCOPES = new Set([
  'domain_truth',
  'memory_body',
  'artifact_body',
  'source_repo_active_file',
  'domain_owned_artifact',
  'domain_owned_memory_body',
  'domain_owned_truth',
]);

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

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOptionalText(value: string | undefined | null) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function sha256(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
      authority_boundary: lifecycleIndexAuthorityBoundary(),
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

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter((value) => value.length > 0))].sort();
}

function payloadStringRefs(payload: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const value = payload[key];
    if (typeof value === 'string') {
      return [value];
    }
    return normalizeStringList(value);
  }));
}

function lifecycleIndexAuthorityBoundary() {
  return {
    storage_role: 'sqlite_sidecar_index',
    opl_can_write_domain_truth: false,
    opl_can_write_memory_body: false,
    opl_can_authorize_quality_or_export: false,
    domain_artifact_authority_preserved: true,
  };
}

type LifecycleRefRow = {
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
};

function lifecycleIndexPayload(input: {
  refs: LifecycleRefRow[];
  lifecycleIndexDb: string;
  domainId?: string;
  status?: 'resolved' | 'missing';
}) {
  const refs = input.refs.map((row) => ({
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
    status: input.status ?? 'resolved',
    lifecycle_index_db: input.lifecycleIndexDb,
    summary: {
      total_ref_count: refs.length,
      filtered_domain_id: input.domainId?.trim() || null,
    },
  refs,
    authority_boundary: lifecycleIndexAuthorityBoundary(),
  };
}

function lifecycleApplyReceiptPayload(input: {
  rows: Array<{
    receipt_ref: string;
    target_domain_id: string;
    source_ref: string;
    mode: string;
    status: string;
    receipt_json: string;
    created_at: string;
  }>;
  lifecycleIndexDb: string;
  targetDomainId?: string;
  sourceRef?: string;
  status?: 'resolved' | 'missing';
}) {
  const receipts = input.rows.map((row) => {
    const receipt = parsePayload(row.receipt_json);
    return {
      receipt_ref: row.receipt_ref,
      target_domain_id: row.target_domain_id,
      source_ref: row.source_ref,
      mode: row.mode,
      status: row.status,
      restore_proof_refs: normalizeStringList(receipt.restore_proof_refs),
      domain_artifact_mutation_receipt_refs: normalizeStringList(
        receipt.domain_artifact_mutation_receipt_refs,
      ),
      domain_owner_handoff_receipt_refs: normalizeStringList(
        receipt.domain_owner_handoff_receipt_refs,
      ),
      no_active_caller_refs: normalizeStringList(receipt.no_active_caller_refs),
      replacement_parity_refs: normalizeStringList(receipt.replacement_parity_refs),
      receipt,
      created_at: row.created_at,
    };
  });
  return {
    surface_kind: 'family_runtime_lifecycle_apply_receipt_index',
    owner: 'one-person-lab',
    status: input.status ?? 'resolved',
    lifecycle_index_db: input.lifecycleIndexDb,
    filtered_target_domain_id: input.targetDomainId?.trim() || null,
    filtered_source_ref: input.sourceRef?.trim() || null,
    summary: {
      receipt_count: receipts.length,
      applied_receipt_count: receipts.filter((receipt) => receipt.status === 'applied').length,
      verified_receipt_count: receipts.filter((receipt) => receipt.status === 'verified').length,
      blocked_receipt_count: receipts.filter((receipt) => receipt.status === 'blocked').length,
    },
    receipts,
    authority_boundary: lifecycleApplyAuthorityBoundary(),
  };
}

export function readFamilyRuntimeLifecycleApplyReceipts(input: {
  target_domain_id?: string;
  source_ref?: string;
} = {}) {
  const paths = familyRuntimeLifecycleIndexPaths();
  if (!fs.existsSync(paths.lifecycle_index_db)) {
    return lifecycleApplyReceiptPayload({
      rows: [],
      lifecycleIndexDb: paths.lifecycle_index_db,
      targetDomainId: input.target_domain_id,
      sourceRef: input.source_ref,
      status: 'missing',
    });
  }

  const db = new DatabaseSync(paths.lifecycle_index_db, { readOnly: true });
  try {
    const table = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name = 'lifecycle_apply_receipts'
    `).get();
    if (!table) {
      return lifecycleApplyReceiptPayload({
        rows: [],
        lifecycleIndexDb: paths.lifecycle_index_db,
        targetDomainId: input.target_domain_id,
        sourceRef: input.source_ref,
      });
    }

    const targetDomainId = input.target_domain_id?.trim();
    const sourceRef = input.source_ref?.trim();
    const rows = targetDomainId && sourceRef
      ? db.prepare(`
        SELECT * FROM lifecycle_apply_receipts
        WHERE target_domain_id = ? AND source_ref = ?
        ORDER BY created_at DESC
      `).all(targetDomainId, sourceRef)
      : targetDomainId
        ? db.prepare(`
          SELECT * FROM lifecycle_apply_receipts
          WHERE target_domain_id = ?
          ORDER BY created_at DESC
        `).all(targetDomainId)
        : sourceRef
          ? db.prepare(`
            SELECT * FROM lifecycle_apply_receipts
            WHERE source_ref = ?
            ORDER BY created_at DESC
          `).all(sourceRef)
          : db.prepare(`
            SELECT * FROM lifecycle_apply_receipts
            ORDER BY created_at DESC
          `).all();
    return lifecycleApplyReceiptPayload({
      rows: rows as Array<{
        receipt_ref: string;
        target_domain_id: string;
        source_ref: string;
        mode: string;
        status: string;
        receipt_json: string;
        created_at: string;
      }>,
      lifecycleIndexDb: paths.lifecycle_index_db,
      targetDomainId: input.target_domain_id,
      sourceRef: input.source_ref,
    });
  } finally {
    db.close();
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
    return lifecycleIndexPayload({
      refs: rows as LifecycleRefRow[],
      lifecycleIndexDb: paths.lifecycle_index_db,
      domainId: input.domain_id,
    });
  } finally {
    db.close();
  }
}

export function readFamilyRuntimeLifecycleRefs(input: { domain_id?: string } = {}) {
  const paths = familyRuntimeLifecycleIndexPaths();
  if (!fs.existsSync(paths.lifecycle_index_db)) {
    return lifecycleIndexPayload({
      refs: [],
      lifecycleIndexDb: paths.lifecycle_index_db,
      domainId: input.domain_id,
      status: 'missing',
    });
  }

  const db = new DatabaseSync(paths.lifecycle_index_db, { readOnly: true });
  try {
    const rows = input.domain_id?.trim()
      ? db.prepare(`
        SELECT * FROM lifecycle_refs WHERE domain_id = ? ORDER BY updated_at DESC, ref_id ASC
      `).all(input.domain_id.trim())
      : db.prepare(`
        SELECT * FROM lifecycle_refs ORDER BY updated_at DESC, ref_id ASC
      `).all();
    return lifecycleIndexPayload({
      refs: rows as LifecycleRefRow[],
      lifecycleIndexDb: paths.lifecycle_index_db,
      domainId: input.domain_id,
    });
  } finally {
    db.close();
  }
}

function expectedRefs(value: string[] | undefined) {
  return uniqueStrings(value ?? []);
}

function missingRefs(expected: string[], actual: string[]) {
  const actualSet = new Set(actual);
  return expected.filter((ref) => !actualSet.has(ref));
}

function extraRefs(actual: string[], expected: string[]) {
  if (expected.length === 0) {
    return [];
  }
  const expectedSet = new Set(expected);
  return actual.filter((ref) => !expectedSet.has(ref));
}

export function reconcileFamilyRuntimeLifecycleRefs(input: LifecycleReconcileInput = {}) {
  const index = readFamilyRuntimeLifecycleRefs({ domain_id: input.target_domain_id });
  const refs = Array.isArray(index.refs) ? index.refs : [];
  const actualSourceRefs = uniqueStrings(refs.map((ref) =>
    typeof ref.source_ref === 'string' ? ref.source_ref : null
  ));
  const actualReceiptRefs = uniqueStrings(refs.map((ref) =>
    typeof ref.receipt_ref === 'string' ? ref.receipt_ref : null
  ));
  const actualRestoreProofRefs = uniqueStrings(refs.flatMap((ref) =>
    payloadStringRefs(isRecord(ref.payload) ? ref.payload : {}, ['restore_proof_ref', 'restore_proof_refs', 'restore_ref', 'restore_refs'])
  ));
  const actualDomainArtifactMutationReceiptRefs = uniqueStrings(refs.flatMap((ref) =>
    payloadStringRefs(
      isRecord(ref.payload) ? ref.payload : {},
      [
        'domain_artifact_mutation_receipt_ref',
        'domain_artifact_mutation_receipt_refs',
        'domain_owner_handoff_receipt_ref',
        'domain_owner_handoff_receipt_refs',
        'domain_owner_receipt_ref',
        'domain_owner_receipt_refs',
      ],
    )
  ));

  const expectedSourceRefs = expectedRefs(input.expected_source_refs);
  const expectedReceiptRefs = expectedRefs(input.expected_receipt_refs);
  const expectedRestoreProofRefs = expectedRefs(input.expected_restore_proof_refs);
  const expectedDomainArtifactMutationReceiptRefs = expectedRefs(
    input.expected_domain_artifact_mutation_receipt_refs,
  );
  const nowMs = Date.parse(input.now ?? nowIso());
  const maxAgeMs = typeof input.max_age_ms === 'number' && Number.isFinite(input.max_age_ms) && input.max_age_ms >= 0
    ? input.max_age_ms
    : null;
  const staleRefs = maxAgeMs === null
    ? []
    : refs
      .map((ref) => {
        const updatedAt = typeof ref.updated_at === 'string' ? ref.updated_at : null;
        const updatedAtMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
        const ageMs = Number.isFinite(updatedAtMs) ? nowMs - updatedAtMs : Number.POSITIVE_INFINITY;
        if (ageMs <= maxAgeMs) {
          return null;
        }
        return {
          ref_id: typeof ref.ref_id === 'string' ? ref.ref_id : null,
          domain_id: typeof ref.domain_id === 'string' ? ref.domain_id : null,
          source_ref: typeof ref.source_ref === 'string' ? ref.source_ref : null,
          receipt_ref: typeof ref.receipt_ref === 'string' ? ref.receipt_ref : null,
          updated_at: updatedAt,
          age_ms: ageMs,
        };
      })
      .filter((ref): ref is {
        ref_id: string | null;
        domain_id: string | null;
        source_ref: string | null;
        receipt_ref: string | null;
        updated_at: string | null;
        age_ms: number;
      } => Boolean(ref));

  const missing = {
    source_refs: missingRefs(expectedSourceRefs, actualSourceRefs),
    receipt_refs: missingRefs(expectedReceiptRefs, actualReceiptRefs),
    restore_proof_refs: missingRefs(expectedRestoreProofRefs, actualRestoreProofRefs),
    domain_artifact_mutation_receipt_refs: missingRefs(
      expectedDomainArtifactMutationReceiptRefs,
      actualDomainArtifactMutationReceiptRefs,
    ),
  };
  const extra = {
    source_refs: extraRefs(actualSourceRefs, expectedSourceRefs),
    receipt_refs: extraRefs(actualReceiptRefs, expectedReceiptRefs),
    restore_proof_refs: extraRefs(actualRestoreProofRefs, expectedRestoreProofRefs),
    domain_artifact_mutation_receipt_refs: extraRefs(
      actualDomainArtifactMutationReceiptRefs,
      expectedDomainArtifactMutationReceiptRefs,
    ),
  };
  const missingCount = Object.values(missing).reduce((count, values) => count + values.length, 0);
  const extraCount = Object.values(extra).reduce((count, values) => count + values.length, 0);
  const expectedCount = expectedSourceRefs.length
    + expectedReceiptRefs.length
    + expectedRestoreProofRefs.length
    + expectedDomainArtifactMutationReceiptRefs.length;
  const driftDetected = missingCount > 0 || extraCount > 0 || staleRefs.length > 0;
  const expectedDomainReceiptSatisfied =
    expectedDomainArtifactMutationReceiptRefs.length > 0
    && missing.domain_artifact_mutation_receipt_refs.length === 0;
  const expectedRestoreSatisfied =
    expectedRestoreProofRefs.length > 0
    && missing.restore_proof_refs.length === 0;
  const actualDomainReceiptObserved = actualDomainArtifactMutationReceiptRefs.length > 0;
  const actualRestoreObserved = actualRestoreProofRefs.length > 0;
  const domainDeleteReady = !driftDetected
    && (
      expectedCount > 0
        ? expectedDomainReceiptSatisfied && expectedRestoreSatisfied
        : actualDomainReceiptObserved && actualRestoreObserved
    );

  return {
    surface_kind: 'family_runtime_lifecycle_reconcile_projection',
    owner: 'one-person-lab',
    status: driftDetected ? 'drift_detected' : 'reconciled',
    target_domain_id: input.target_domain_id?.trim() || null,
    lifecycle_index_db: index.lifecycle_index_db,
    actual_refs: {
      source_refs: actualSourceRefs,
      receipt_refs: actualReceiptRefs,
      restore_proof_refs: actualRestoreProofRefs,
      domain_artifact_mutation_receipt_refs: actualDomainArtifactMutationReceiptRefs,
    },
    expected_refs: {
      source_refs: expectedSourceRefs,
      receipt_refs: expectedReceiptRefs,
      restore_proof_refs: expectedRestoreProofRefs,
      domain_artifact_mutation_receipt_refs: expectedDomainArtifactMutationReceiptRefs,
    },
    missing_refs: missing,
    extra_refs: extra,
    stale_refs: staleRefs,
    delete_ready_proof: {
      proof_kind: 'domain_owner_receipt_driven_delete_ready_proof',
      proof_status: driftDetected
        ? 'blocked_lifecycle_drift_detected'
        : expectedCount === 0
          ? domainDeleteReady
            ? 'domain_owner_receipt_refs_observed'
            : 'not_evaluated_no_expected_refs'
          : expectedDomainReceiptSatisfied && expectedRestoreSatisfied
            ? 'domain_owner_receipt_refs_observed'
            : 'opl_refs_reconciled_domain_delete_still_requires_owner_receipt',
      can_execute_delete: false,
      can_execute_domain_physical_delete: false,
      opl_cleanup_apply_ready: domainDeleteReady,
      opl_cleanup_apply_surface: 'opl family-runtime lifecycle apply --mode apply',
      required_executor: 'domain_agent_owner_or_operator',
      required_before_domain_delete: [
        'no_active_caller_proof',
        'replacement_parity_proof',
        'restore_proof_ref',
        'domain_owner_cleanup_or_artifact_mutation_receipt_ref',
      ],
    },
    summary: {
      indexed_ref_count: refs.length,
      expected_ref_count: expectedCount,
      missing_ref_count: missingCount,
      extra_ref_count: extraCount,
      stale_ref_count: staleRefs.length,
      drift_detected: driftDetected,
      can_execute_delete: false,
      can_execute_domain_physical_delete: false,
      opl_cleanup_apply_can_execute: domainDeleteReady,
    },
    authority_boundary: {
      ...lifecycleIndexAuthorityBoundary(),
      reconciliation_role: 'refs_only_lifecycle_drift_projection',
      opl_can_write_cleanup_ledger_receipts: true,
      opl_can_delete_domain_repo_files: false,
      opl_can_mutate_domain_artifacts: false,
    },
  };
}

function normalizeLifecycleActions(actions: unknown[] | undefined): NormalizedLifecycleApplyAction[] {
  return (actions ?? []).map((action) => ({
    action_id: normalizeText(String(isRecord(action) ? action.action_id ?? '' : ''), 'action_id'),
    action_kind: normalizeOptionalText(isRecord(action) && typeof action.action_kind === 'string'
      ? action.action_kind
      : null) ?? 'cleanup',
    owner_scope: normalizeText(String(isRecord(action) ? action.owner_scope ?? '' : ''), 'owner_scope'),
    target_ref: normalizeText(String(isRecord(action) ? action.target_ref ?? '' : ''), 'target_ref'),
    restore_proof_refs: normalizeStringList(isRecord(action) ? action.restore_proof_refs : undefined),
    domain_artifact_mutation_receipt_refs: normalizeStringList(
      isRecord(action) ? action.domain_artifact_mutation_receipt_refs : undefined,
    ),
    domain_owner_handoff_receipt_refs: normalizeStringList(
      isRecord(action) ? action.domain_owner_handoff_receipt_refs : undefined,
    ),
    no_active_caller_refs: normalizeStringList(
      isRecord(action) ? action.no_active_caller_refs : undefined,
    ),
    replacement_parity_refs: normalizeStringList(
      isRecord(action) ? action.replacement_parity_refs : undefined,
    ),
    manifest_ref: normalizeOptionalText(isRecord(action) && typeof action.manifest_ref === 'string'
      ? action.manifest_ref
      : null),
    checksum: normalizeOptionalText(isRecord(action) && typeof action.checksum === 'string'
      ? action.checksum
      : null),
  }));
}

function lifecycleApplyReceiptRef(input: {
  targetDomainId: string;
  sourceRef: string;
  actionId: string;
  targetRef: string;
  actionKind: string;
  ownerScope: string;
  manifestRef: string | null;
  restoreProofRefs: string[];
  domainArtifactMutationReceiptRefs: string[];
  domainOwnerHandoffReceiptRefs: string[];
  noActiveCallerRefs: string[];
  replacementParityRefs: string[];
}) {
  const digest = sha256(input).slice(0, 24);
  return `opl://family-runtime/lifecycle-apply/${input.targetDomainId}/${input.actionId}/${digest}`;
}

function decideLifecycleAction(
  action: NormalizedLifecycleApplyAction,
  input: {
    targetDomainId: string;
    sourceRef: string;
    manifestRef: string | null;
    createdAt: string;
  },
): LifecycleApplyDecision {
  const restoreProofRefs = action.restore_proof_refs;
  const domainReceiptRefs = uniqueStrings([
    ...action.domain_artifact_mutation_receipt_refs,
    ...action.domain_owner_handoff_receipt_refs,
  ]);
  const safeOplScope = OPL_OWNED_APPLY_SCOPES.has(action.owner_scope);
  const domainReceiptScope = DOMAIN_RECEIPT_REF_SCOPES.has(action.owner_scope);
  const forbiddenScope = FORBIDDEN_APPLY_SCOPES.has(action.owner_scope);
  const legacyCleanupAction = LEGACY_CLEANUP_ACTION_KINDS.has(action.action_kind);
  const hasNoActiveCallerProof = action.no_active_caller_refs.length > 0;
  const hasReplacementParityProof = action.replacement_parity_refs.length > 0;
  const receiptRef = lifecycleApplyReceiptRef({
    targetDomainId: input.targetDomainId,
    sourceRef: input.sourceRef,
    actionId: action.action_id,
    targetRef: action.target_ref,
    actionKind: action.action_kind,
    ownerScope: action.owner_scope,
    manifestRef: action.manifest_ref ?? input.manifestRef,
    restoreProofRefs: action.restore_proof_refs,
    domainArtifactMutationReceiptRefs: action.domain_artifact_mutation_receipt_refs,
    domainOwnerHandoffReceiptRefs: action.domain_owner_handoff_receipt_refs,
    noActiveCallerRefs: action.no_active_caller_refs,
    replacementParityRefs: action.replacement_parity_refs,
  });

  if (forbiddenScope || (!safeOplScope && !domainReceiptScope)) {
    return {
      ...action,
      receipt_ref: receiptRef,
      decision: 'blocked',
      writes_domain_truth: false,
      writes_memory_body: false,
      writes_artifact_body: false,
      writes_source_repo_active_file: false,
      blocker: {
        blocker_kind: 'lifecycle_apply_authority',
        blocker_id: forbiddenScope
          ? 'domain_owned_artifact_mutation_forbidden'
          : 'unsupported_lifecycle_apply_scope',
        owner_scope: action.owner_scope,
        required_owner: 'domain_agent',
      },
    };
  }

  if (
    legacyCleanupAction
    && (safeOplScope || domainReceiptScope)
    && (!hasNoActiveCallerProof || !hasReplacementParityProof)
  ) {
    return {
      ...action,
      receipt_ref: receiptRef,
      decision: 'blocked',
      writes_domain_truth: false,
      writes_memory_body: false,
      writes_artifact_body: false,
      writes_source_repo_active_file: false,
      blocker: {
        blocker_kind: 'legacy_cleanup_safety_gate',
        blocker_id: !hasNoActiveCallerProof
          ? 'no_active_caller_ref_required_before_legacy_cleanup_apply'
          : 'replacement_parity_ref_required_before_legacy_cleanup_apply',
        owner_scope: action.owner_scope,
        required_owner: 'domain_agent_or_operator',
      },
    };
  }

  if (domainReceiptScope && domainReceiptRefs.length === 0) {
    return {
      ...action,
      receipt_ref: receiptRef,
      decision: 'blocked',
      writes_domain_truth: false,
      writes_memory_body: false,
      writes_artifact_body: false,
      writes_source_repo_active_file: false,
      blocker: {
        blocker_kind: 'domain_owner_receipt',
        blocker_id: 'domain_artifact_mutation_receipt_ref_required',
        owner_scope: action.owner_scope,
        required_owner: 'domain_agent',
      },
    };
  }

  return {
    ...action,
    receipt_ref: receiptRef,
    decision: 'safe_to_apply',
    surface_role: domainReceiptScope ? 'domain_artifact_mutation_receipt_ref' : 'safe_cleanup_receipt',
    writes_domain_truth: false,
    writes_memory_body: false,
    writes_artifact_body: false,
    writes_source_repo_active_file: false,
    ledger_roles: ['locator', 'retention', 'restore'],
    cleanup_receipt: {
      receipt_ref: receiptRef,
      receipt_kind: domainReceiptScope
        ? 'domain_artifact_mutation_receipt_ref_record'
        : 'opl_safe_cleanup_receipt',
      target_domain_id: input.targetDomainId,
      source_ref: input.sourceRef,
      manifest_ref: action.manifest_ref ?? input.manifestRef,
      action_id: action.action_id,
      action_kind: action.action_kind,
      owner_scope: action.owner_scope,
      target_ref: action.target_ref,
      restore_proof_refs: restoreProofRefs,
      domain_artifact_mutation_receipt_refs: domainReceiptRefs,
      domain_owner_handoff_receipt_refs: action.domain_owner_handoff_receipt_refs,
      no_active_caller_refs: action.no_active_caller_refs,
      replacement_parity_refs: action.replacement_parity_refs,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_write_artifact_body: false,
        opl_can_write_source_repo_active_file: false,
        opl_can_move_or_delete_domain_repo_files: false,
        domain_repo_delete_requires_owner_receipt: true,
        domain_artifact_authority_preserved: true,
      },
    },
  };
}

function emptyLifecycleApplySummary(input: {
  restoreProofRefCount?: number;
  domainArtifactMutationReceiptRefCount?: number;
  domainOwnerHandoffReceiptRefCount?: number;
  noActiveCallerRefCount?: number;
  replacementParityRefCount?: number;
  verifiedReceiptCount?: number;
  rawVerifiedReceiptCount?: number;
  foldedDuplicateReceiptCount?: number;
} = {}): LifecycleApplySummary {
  return {
    safe_action_count: 0,
    unsafe_action_count: 0,
    cleanup_receipt_count: 0,
    restore_proof_ref_count: input.restoreProofRefCount ?? 0,
    domain_artifact_mutation_receipt_ref_count: input.domainArtifactMutationReceiptRefCount ?? 0,
    domain_owner_handoff_receipt_ref_count: input.domainOwnerHandoffReceiptRefCount ?? 0,
    no_active_caller_ref_count: input.noActiveCallerRefCount ?? 0,
    replacement_parity_ref_count: input.replacementParityRefCount ?? 0,
    verified_receipt_count: input.verifiedReceiptCount ?? 0,
    raw_verified_receipt_count: input.rawVerifiedReceiptCount ?? input.verifiedReceiptCount ?? 0,
    folded_duplicate_receipt_count: input.foldedDuplicateReceiptCount ?? 0,
    writes_performed: false,
  };
}

function summarizeLifecycleApply(
  actions: LifecycleApplyDecision[],
  writesPerformed: boolean,
): LifecycleApplySummary {
  const safeActions = actions.filter((action) => action.decision === 'safe_to_apply');
  const unsafeActions = actions.filter((action) => action.decision === 'blocked');
  const cleanupReceipts = safeActions
    .map((action) => isRecord(action.cleanup_receipt) ? action.cleanup_receipt : null)
    .filter((entry): entry is JsonRecord => Boolean(entry));
  return {
    safe_action_count: safeActions.length,
    unsafe_action_count: unsafeActions.length,
    cleanup_receipt_count: cleanupReceipts.length,
    restore_proof_ref_count: cleanupReceipts
      .flatMap((receipt) => normalizeStringList(receipt.restore_proof_refs))
      .length,
    domain_artifact_mutation_receipt_ref_count: cleanupReceipts
      .flatMap((receipt) => normalizeStringList(receipt.domain_artifact_mutation_receipt_refs))
      .length,
    domain_owner_handoff_receipt_ref_count: cleanupReceipts
      .flatMap((receipt) => normalizeStringList(receipt.domain_owner_handoff_receipt_refs))
      .length,
    no_active_caller_ref_count: cleanupReceipts
      .flatMap((receipt) => normalizeStringList(receipt.no_active_caller_refs))
      .length,
    replacement_parity_ref_count: cleanupReceipts
      .flatMap((receipt) => normalizeStringList(receipt.replacement_parity_refs))
      .length,
    verified_receipt_count: 0,
    raw_verified_receipt_count: 0,
    folded_duplicate_receipt_count: 0,
    writes_performed: writesPerformed,
  };
}

function lifecycleReceiptSemanticKey(receipt: {
  source_ref: string;
  receipt: JsonRecord;
}) {
  const payload = receipt.receipt;
  return JSON.stringify({
    receipt_kind: typeof payload.receipt_kind === 'string' ? payload.receipt_kind : null,
    source_ref: receipt.source_ref,
    action_id: typeof payload.action_id === 'string' ? payload.action_id : null,
    action_kind: typeof payload.action_kind === 'string' ? payload.action_kind : null,
    owner_scope: typeof payload.owner_scope === 'string' ? payload.owner_scope : null,
    target_ref: typeof payload.target_ref === 'string' ? payload.target_ref : null,
    restore_proof_refs: normalizeStringList(payload.restore_proof_refs),
    domain_artifact_mutation_receipt_refs: normalizeStringList(
      payload.domain_artifact_mutation_receipt_refs,
    ),
    domain_owner_handoff_receipt_refs: normalizeStringList(payload.domain_owner_handoff_receipt_refs),
    no_active_caller_refs: normalizeStringList(payload.no_active_caller_refs),
    replacement_parity_refs: normalizeStringList(payload.replacement_parity_refs),
  });
}

function foldLifecycleApplyReceiptsBySemanticIdentity<Receipt extends {
  receipt_ref: string;
  source_ref: string;
  receipt: JsonRecord;
}>(receipts: Receipt[]) {
  const folded = new Map<string, Receipt>();
  for (const receipt of receipts) {
    const key = lifecycleReceiptSemanticKey(receipt);
    if (!folded.has(key)) {
      folded.set(key, receipt);
    }
  }
  return [...folded.values()];
}

function insertLifecycleApplyReceipt(
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

function verifyLifecycleApply(input: LifecycleApplyInput) {
  const targetDomainId = normalizeText(input.target_domain_id, 'target_domain_id');
  const { db, paths } = openFamilyRuntimeLifecycleIndexDb();
  try {
    const rows = input.receipt_ref?.trim()
      ? db.prepare(`
        SELECT * FROM lifecycle_apply_receipts
        WHERE target_domain_id = ? AND receipt_ref = ?
        ORDER BY created_at DESC
      `).all(targetDomainId, input.receipt_ref.trim())
      : db.prepare(`
        SELECT * FROM lifecycle_apply_receipts
        WHERE target_domain_id = ?
        ORDER BY created_at DESC
      `).all(targetDomainId);
    const rawVerifiedReceipts = (rows as Array<{
      receipt_ref: string;
      target_domain_id: string;
      source_ref: string;
      mode: string;
      status: string;
      receipt_json: string;
      created_at: string;
    }>).map((row) => {
      const receipt = parsePayload(row.receipt_json);
      return {
        receipt_ref: row.receipt_ref,
        target_domain_id: row.target_domain_id,
        source_ref: row.source_ref,
        status: row.status,
        restore_proof_refs: normalizeStringList(receipt.restore_proof_refs),
        domain_artifact_mutation_receipt_refs: normalizeStringList(
          receipt.domain_artifact_mutation_receipt_refs,
        ),
        domain_owner_handoff_receipt_refs: normalizeStringList(
          receipt.domain_owner_handoff_receipt_refs,
        ),
        no_active_caller_refs: normalizeStringList(receipt.no_active_caller_refs),
        replacement_parity_refs: normalizeStringList(receipt.replacement_parity_refs),
        receipt,
        created_at: row.created_at,
      };
    });
    const verifiedReceipts = input.receipt_ref?.trim()
      ? rawVerifiedReceipts
      : foldLifecycleApplyReceiptsBySemanticIdentity(rawVerifiedReceipts);
    return {
      surface_kind: 'family_runtime_lifecycle_apply_receipt',
      owner: 'one-person-lab',
      mode: 'verify' as const,
      target_domain_id: targetDomainId,
      status: verifiedReceipts.length > 0 ? 'verified' : 'blocked',
      lifecycle_index_db: paths.lifecycle_index_db,
      receipt_ref: input.receipt_ref?.trim() || null,
      actions: [],
      cleanup_receipts: [],
      verified_receipts: verifiedReceipts,
      summary: emptyLifecycleApplySummary({
        restoreProofRefCount: verifiedReceipts.flatMap((receipt) => receipt.restore_proof_refs).length,
        domainArtifactMutationReceiptRefCount: verifiedReceipts
          .flatMap((receipt) => receipt.domain_artifact_mutation_receipt_refs)
          .length,
        domainOwnerHandoffReceiptRefCount: verifiedReceipts
          .flatMap((receipt) => receipt.domain_owner_handoff_receipt_refs)
          .length,
        noActiveCallerRefCount: verifiedReceipts
          .flatMap((receipt) => receipt.no_active_caller_refs)
          .length,
        replacementParityRefCount: verifiedReceipts
          .flatMap((receipt) => receipt.replacement_parity_refs)
          .length,
        verifiedReceiptCount: verifiedReceipts.length,
        rawVerifiedReceiptCount: rawVerifiedReceipts.length,
        foldedDuplicateReceiptCount: rawVerifiedReceipts.length - verifiedReceipts.length,
      }),
      authority_boundary: lifecycleApplyAuthorityBoundary(),
    };
  } finally {
    db.close();
  }
}

function lifecycleApplyAuthorityBoundary() {
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

export function runFamilyRuntimeLifecycleApply(input: LifecycleApplyInput) {
  if (input.mode === 'verify') {
    return verifyLifecycleApply(input);
  }

  const targetDomainId = normalizeText(input.target_domain_id, 'target_domain_id');
  const sourceRef = normalizeOptionalText(input.source_ref) ?? 'manual:lifecycle-apply';
  const manifestRef = normalizeOptionalText(input.manifest_ref);
  const createdAt = nowIso();
  const actions = normalizeLifecycleActions(input.actions);
  const decisions = actions.map((action) =>
    decideLifecycleAction(action, {
      targetDomainId,
      sourceRef,
      manifestRef,
      createdAt,
    })
  );
  const blocked = decisions.some((action) => action.decision === 'blocked');
  const cleanupReceipts = decisions
    .map((action) => isRecord(action.cleanup_receipt) ? action.cleanup_receipt : null)
    .filter((entry): entry is JsonRecord => Boolean(entry));
  const status = blocked
    ? 'blocked'
    : input.mode === 'dry-run'
      ? 'dry_run_ready'
      : 'applied';
  const receiptRef = `opl://family-runtime/lifecycle-apply/${targetDomainId}/batch/${sha256({
    targetDomainId,
    sourceRef,
    manifestRef,
    actions,
  }).slice(0, 24)}`;

  if (input.mode === 'apply' && !blocked) {
    const { db } = openFamilyRuntimeLifecycleIndexDb();
    try {
      for (const decision of decisions) {
        if (decision.decision !== 'safe_to_apply' || !isRecord(decision.cleanup_receipt)) {
          continue;
        }
        const checksum = decision.checksum ?? `sha256:${sha256(decision.cleanup_receipt)}`;
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
          ref_id: [
            targetDomainId,
            decision.action_id,
            decision.target_ref,
          ].join('::'),
          domain_id: targetDomainId,
          surface_id: decision.action_id,
          surface_role: decision.surface_role ?? 'safe_cleanup_receipt',
          source_ref: sourceRef,
          receipt_ref: decision.receipt_ref,
          checksum,
          payload_json: JSON.stringify(decision.cleanup_receipt),
          created_at: createdAt,
          updated_at: createdAt,
        });
        insertLifecycleApplyReceipt(db, {
          receiptRef: decision.receipt_ref,
          targetDomainId,
          sourceRef,
          mode: input.mode,
          status,
          receipt: decision.cleanup_receipt,
          createdAt,
        });
      }
      insertLifecycleApplyReceipt(db, {
        receiptRef,
        targetDomainId,
        sourceRef,
        mode: input.mode,
        status,
        receipt: {
          receipt_ref: receiptRef,
          receipt_kind: 'opl_lifecycle_apply_batch_receipt',
          target_domain_id: targetDomainId,
          source_ref: sourceRef,
          manifest_ref: manifestRef,
          action_receipt_refs: cleanupReceipts.map((receipt) => receipt.receipt_ref),
          restore_proof_refs: cleanupReceipts.flatMap((receipt) =>
            normalizeStringList(receipt.restore_proof_refs)
          ),
          domain_artifact_mutation_receipt_refs: cleanupReceipts.flatMap((receipt) =>
            normalizeStringList(receipt.domain_artifact_mutation_receipt_refs)
          ),
          domain_owner_handoff_receipt_refs: cleanupReceipts.flatMap((receipt) =>
            normalizeStringList(receipt.domain_owner_handoff_receipt_refs)
          ),
          no_active_caller_refs: cleanupReceipts.flatMap((receipt) =>
            normalizeStringList(receipt.no_active_caller_refs)
          ),
          replacement_parity_refs: cleanupReceipts.flatMap((receipt) =>
            normalizeStringList(receipt.replacement_parity_refs)
          ),
        },
        createdAt,
      });
    } finally {
      db.close();
    }
  }

  return {
    surface_kind: 'family_runtime_lifecycle_apply_receipt',
    owner: 'one-person-lab',
    mode: input.mode,
    target_domain_id: targetDomainId,
    status,
    source_ref: sourceRef,
    manifest_ref: manifestRef,
    receipt_ref: blocked || input.mode === 'dry-run' ? null : receiptRef,
    actions: decisions,
    cleanup_receipts: cleanupReceipts,
    verified_receipts: [],
    summary: summarizeLifecycleApply(decisions, input.mode === 'apply' && !blocked),
    authority_boundary: lifecycleApplyAuthorityBoundary(),
  };
}
