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

type LifecycleApplyMode = 'dry-run' | 'apply' | 'verify';

export type LifecycleApplyActionInput = {
  action_id: string;
  action_kind?: string;
  owner_scope: string;
  target_ref: string;
  restore_proof_refs?: string[];
  domain_artifact_mutation_receipt_refs?: string[];
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

type NormalizedLifecycleApplyAction = {
  action_id: string;
  action_kind: string;
  owner_scope: string;
  target_ref: string;
  restore_proof_refs: string[];
  domain_artifact_mutation_receipt_refs: string[];
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
  createdAt: string;
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
  const domainReceiptRefs = action.domain_artifact_mutation_receipt_refs;
  const safeOplScope = OPL_OWNED_APPLY_SCOPES.has(action.owner_scope);
  const domainReceiptScope = DOMAIN_RECEIPT_REF_SCOPES.has(action.owner_scope);
  const forbiddenScope = FORBIDDEN_APPLY_SCOPES.has(action.owner_scope);
  const receiptRef = lifecycleApplyReceiptRef({
    targetDomainId: input.targetDomainId,
    sourceRef: input.sourceRef,
    actionId: action.action_id,
    targetRef: action.target_ref,
    createdAt: input.createdAt,
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
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_write_memory_body: false,
        opl_can_write_artifact_body: false,
        opl_can_write_source_repo_active_file: false,
        domain_artifact_authority_preserved: true,
      },
    },
  };
}

function summarizeLifecycleApply(actions: LifecycleApplyDecision[], writesPerformed: boolean) {
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
    verified_receipt_count: 0,
    writes_performed: writesPerformed,
  };
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
    const verifiedReceipts = (rows as Array<{
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
        receipt,
        created_at: row.created_at,
      };
    });
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
      summary: {
        safe_action_count: 0,
        unsafe_action_count: 0,
        cleanup_receipt_count: 0,
        restore_proof_ref_count: verifiedReceipts.flatMap((receipt) => receipt.restore_proof_refs).length,
        domain_artifact_mutation_receipt_ref_count: verifiedReceipts
          .flatMap((receipt) => receipt.domain_artifact_mutation_receipt_refs)
          .length,
        verified_receipt_count: verifiedReceipts.length,
        writes_performed: false,
      },
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
    createdAt,
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
