import fs from 'node:fs';

import {
  familyRuntimeLifecycleIndexPaths,
  isRecord,
  lifecycleApplyAuthorityBoundary,
  lifecycleIndexAuthorityBoundary,
  normalizeStringList,
  normalizeText,
  nowIso,
  openFamilyRuntimeLifecycleIndexDb,
  parsePayload,
  payloadStringRefs,
  uniqueStrings,
  type JsonRecord,
} from './family-runtime-lifecycle-store.ts';
import { openFamilyRuntimeSqlite } from './family-runtime-sqlite.ts';
export {
  familyRuntimeLifecycleIndexPaths,
  openFamilyRuntimeLifecycleIndexDb,
} from './family-runtime-lifecycle-store.ts';
export {
  runFamilyRuntimeLifecycleApply,
  type LifecycleApplyActionInput,
  type LifecycleApplyInput,
  type LifecycleApplyMode,
} from './family-runtime-lifecycle-apply.ts';

export type LifecycleIndexRecordInput = {
  domain_id: string;
  surface_id: string;
  surface_role: string;
  source_ref: string;
  receipt_ref?: string | null;
  checksum?: string | null;
  payload?: JsonRecord;
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

  const db = openFamilyRuntimeSqlite(paths.lifecycle_index_db, { readOnly: true });
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

  const db = openFamilyRuntimeSqlite(paths.lifecycle_index_db, { readOnly: true });
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
