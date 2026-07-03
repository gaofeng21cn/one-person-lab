import {
  readFamilyRuntimeLifecycleApplyReceipts,
  readFamilyRuntimeLifecycleRefs,
  reconcileFamilyRuntimeLifecycleRefs,
} from '../../runway/index.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import {
  numberValue,
  record,
  recordList,
  stringList,
  stringValue,
  uniqueStrings,
} from './value-utils.ts';

function lifecycleApplyHandoffAttempts(applyReceiptIndex: Record<string, unknown>) {
  return recordList(applyReceiptIndex.receipts)
    .filter((receipt) => stringList(receipt.handoff_refs).length > 0)
    .map((receipt) => {
      const payload = record(receipt.receipt);
      const handoffSummary = record(payload.handoff_summary);
      const status = stringValue(receipt.status);
      return {
        apply_attempt_ref: stringValue(receipt.receipt_ref),
        receipt_ref: status === 'applied' ? stringValue(receipt.receipt_ref) : null,
        target_domain_id: stringValue(receipt.target_domain_id),
        source_ref: stringValue(receipt.source_ref),
        mode: stringValue(receipt.mode),
        status,
        handoff_ref: stringList(receipt.handoff_refs)[0] ?? stringValue(handoffSummary.handoff_ref),
        handoff_refs: stringList(receipt.handoff_refs),
        action_kind: stringValue(payload.action_kind),
        action_count: numberValue(payload.action_count),
        safe_action_count: numberValue(payload.safe_action_count),
        blocked_action_count: numberValue(payload.blocked_action_count),
        candidate_ref_count: numberValue(handoffSummary.candidate_ref_count),
        candidate_refs: stringList(handoffSummary.candidate_refs),
        typed_blocker_refs: stringList(receipt.typed_blocker_refs),
        selected_payload_path: stringValue(payload.selected_payload_path)
          ?? stringValue(handoffSummary.selected_payload_path),
        writes_performed: payload.writes_performed === true,
        authority_boundary: {
          ...buildAppDrilldownRefsOnlyAuthorityBoundary(),
          can_execute_domain_physical_cleanup: false,
          can_mutate_artifact_body: false,
          can_create_domain_owner_receipt: false,
          can_claim_domain_ready: false,
          can_claim_production_ready: false,
        },
        created_at: stringValue(receipt.created_at),
      };
    });
}

export function buildLifecycleLedgerRefs() {
  const index = readFamilyRuntimeLifecycleRefs();
  const applyReceiptIndex = readFamilyRuntimeLifecycleApplyReceipts();
  const reconcile = reconcileFamilyRuntimeLifecycleRefs();
  const refs = recordList(index.refs);
  const handoffAttempts = lifecycleApplyHandoffAttempts(applyReceiptIndex);
  const restoreProofRefs = uniqueStrings(refs.flatMap((entry) =>
    stringList(record(entry.payload).restore_proof_refs)
  )).sort();
  const domainArtifactMutationReceiptRefs = uniqueStrings(refs.flatMap((entry) =>
    stringList(record(entry.payload).domain_artifact_mutation_receipt_refs)
  )).sort();
  const applySummary = record(applyReceiptIndex.summary);
  const reconcileSummary = record(reconcile.summary);
  return {
    surface_kind: 'opl_app_drilldown_lifecycle_ledger_refs',
    projection_policy: 'opl_owned_lifecycle_index_refs_only',
    lifecycle_index_db: stringValue(index.lifecycle_index_db),
    refs: refs.map((entry) => ({
      ref: stringValue(entry.ref_id),
      role: stringValue(entry.surface_role) ?? 'lifecycle_index_ref',
      domain_id: stringValue(entry.domain_id),
      surface_id: stringValue(entry.surface_id),
      source_ref: stringValue(entry.source_ref),
      receipt_ref: stringValue(entry.receipt_ref),
      checksum: stringValue(entry.checksum),
      updated_at: stringValue(entry.updated_at),
    })).filter((entry) => entry.ref),
    restore_proof_refs: restoreProofRefs,
    domain_artifact_mutation_receipt_refs: domainArtifactMutationReceiptRefs,
    lifecycle_apply_receipt_index: applyReceiptIndex,
    lifecycle_apply_handoff_attempts: handoffAttempts,
    latest_lifecycle_apply_handoff: handoffAttempts[0] ?? null,
    summary: {
      lifecycle_index_ref_count: refs.length,
      restore_proof_ref_count: restoreProofRefs.length,
      domain_artifact_mutation_receipt_ref_count: domainArtifactMutationReceiptRefs.length,
      lifecycle_apply_receipt_count: numberValue(applySummary.receipt_count),
      lifecycle_apply_blocked_receipt_count: numberValue(applySummary.blocked_receipt_count),
      lifecycle_apply_handoff_attempt_count: handoffAttempts.length,
      lifecycle_apply_handoff_blocked_decision_count:
        handoffAttempts.reduce((sum, attempt) => sum + attempt.blocked_action_count, 0),
      lifecycle_apply_handoff_safe_decision_count:
        handoffAttempts.reduce((sum, attempt) => sum + attempt.safe_action_count, 0),
      lifecycle_reconcile_status: stringValue(reconcile.status),
      lifecycle_reconcile_missing_ref_count: numberValue(reconcileSummary.missing_ref_count),
      lifecycle_reconcile_extra_ref_count: numberValue(reconcileSummary.extra_ref_count),
      lifecycle_reconcile_stale_ref_count: numberValue(reconcileSummary.stale_ref_count),
      lifecycle_delete_ready_proof_status: stringValue(record(reconcile.delete_ready_proof).proof_status),
      lifecycle_domain_physical_delete_requires_owner_receipt: true,
      lifecycle_domain_physical_delete_can_execute:
        reconcileSummary.can_execute_domain_physical_delete === true,
      lifecycle_opl_cleanup_apply_can_execute:
        reconcileSummary.opl_cleanup_apply_can_execute === true,
    },
    reconcile_projection: reconcile,
    authority_boundary: buildAppDrilldownRefsOnlyAuthorityBoundary(),
  };
}
