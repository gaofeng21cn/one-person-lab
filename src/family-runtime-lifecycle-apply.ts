import {
  DOMAIN_RECEIPT_REF_SCOPES,
  FORBIDDEN_APPLY_SCOPES,
  LEGACY_CLEANUP_ACTION_KINDS,
  OPL_OWNED_APPLY_SCOPES,
  insertLifecycleApplyReceipt,
  isRecord,
  lifecycleApplyAuthorityBoundary,
  normalizeOptionalText,
  normalizeStringList,
  normalizeText,
  nowIso,
  openFamilyRuntimeLifecycleIndexDb,
  parsePayload,
  sha256,
  uniqueStrings,
  type JsonRecord,
  type LifecycleApplyMode,
} from './family-runtime-lifecycle-store.ts';

export type { LifecycleApplyMode } from './family-runtime-lifecycle-store.ts';

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

export function runFamilyRuntimeLifecycleApply(input: LifecycleApplyInput) {
  if (input.mode === 'verify') {
    return verifyLifecycleApply(input);
  }

  const targetDomainId = normalizeText(input.target_domain_id, 'target_domain_id');
  const sourceRef = normalizeOptionalText(input.source_ref) ?? 'manual:lifecycle-apply';
  const manifestRef = normalizeOptionalText(input.manifest_ref);
  const actions = normalizeLifecycleActions(input.actions);
  const decisions = actions.map((action) =>
    decideLifecycleAction(action, {
      targetDomainId,
      sourceRef,
      manifestRef,
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
    const createdAt = nowIso();
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
