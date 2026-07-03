import {
  countValue as numberValue,
  record,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';

function readinessStatus(input: {
  observedRefCount: number;
  reconcileIssueCount: number;
  lifecycleApplyHandoffBlockedDecisionCount: number;
  lifecycleApplyHandoffSafeDecisionCount: number;
}) {
  if (input.reconcileIssueCount > 0) {
    return 'lifecycle_reconcile_attention_required_not_ready';
  }
  if (input.lifecycleApplyHandoffBlockedDecisionCount > 0
    && input.lifecycleApplyHandoffSafeDecisionCount === 0) {
    return 'typed_blocker_work_order_required_not_ready';
  }
  if (input.observedRefCount > 0) {
    return 'refs_observed_not_memory_or_artifact_ready';
  }
  return 'owner_receipt_or_typed_blocker_required_not_ready';
}

function lifecycleOwnerWorkOrder(input: {
  readinessStatus: string;
  observedRefCount: number;
  reconcileIssueCount: number;
  lifecycleApplyHandoffAttemptCount: number;
  lifecycleApplyHandoffBlockedDecisionCount: number;
  lifecycleApplyHandoffSafeDecisionCount: number;
  domainPhysicalDeleteCanExecute: boolean;
  oplCleanupApplyCanExecute: boolean;
  latestLifecycleApplyHandoff: unknown;
}) {
  return {
    surface_kind: 'opl_memory_artifact_lifecycle_owner_work_order',
    work_order_id: 'memory-artifact-lifecycle-owner-decision',
    lane_id: 'memory_artifact_lifecycle_apply',
    status: input.readinessStatus,
    observed_ref_count: input.observedRefCount,
    open_count: input.reconcileIssueCount > 0
      ? input.reconcileIssueCount
      : input.observedRefCount > 0
        ? 0
        : 1,
    open_count_semantics:
      'open_count_tracks_refs_or_reconcile_gaps_only_zero_does_not_authorize_memory_artifact_package_or_export_ready',
    next_required_owner_action:
      'domain_owner_record_memory_artifact_lifecycle_receipt_or_typed_blocker',
    owner: 'domain_repository_or_app_live_operator',
    accepted_refs_only_result_shapes: [
      'memory_receipt_ref',
      'memory_writeback_receipt_ref',
      'artifact_mutation_receipt_ref',
      'package_export_lifecycle_receipt_ref',
      'cleanup_restore_retention_receipt_ref',
      'typed_blocker_ref',
      'owner_acceptance_ref',
    ],
    typed_blocker_work_order: {
      status: input.lifecycleApplyHandoffBlockedDecisionCount > 0
        ? 'typed_blocker_refs_observed_followthrough_required'
        : 'typed_blocker_ref_accepted_if_owner_cannot_close_receipt',
      selected_payload_path:
        stringValue(record(input.latestLifecycleApplyHandoff).selected_payload_path),
      blocked_decision_count: input.lifecycleApplyHandoffBlockedDecisionCount,
      safe_decision_count: input.lifecycleApplyHandoffSafeDecisionCount,
      accepted_ref_shape: 'typed_blocker_ref',
      latest_typed_blocker_refs:
        stringList(record(input.latestLifecycleApplyHandoff).typed_blocker_refs),
    },
    lifecycle_apply_handoff_attempt_count: input.lifecycleApplyHandoffAttemptCount,
    lifecycle_apply_handoff_blocked_decision_count:
      input.lifecycleApplyHandoffBlockedDecisionCount,
    lifecycle_apply_handoff_safe_decision_count: input.lifecycleApplyHandoffSafeDecisionCount,
    lifecycle_reconcile_issue_count: input.reconcileIssueCount,
    domain_physical_delete_can_execute: input.domainPhysicalDeleteCanExecute,
    opl_cleanup_apply_can_execute: input.oplCleanupApplyCanExecute,
    ready_claim_authorized: false,
    forbidden_opl_claims: [
      'memory_body_saved_or_accepted',
      'artifact_body_mutated',
      'artifact_ready',
      'package_ready',
      'export_ready',
      'domain_ready',
      'production_ready',
      'domain_physical_delete_authorization',
    ],
    non_closing_inputs: [
      'app_projection',
      'verified_refs_only_ledger',
      'lifecycle_reconcile_zero_issue_count',
      'open_count_zero',
      'opl_cleanup_apply_available',
      'typed_blocker_ref_without_owner_followthrough',
    ],
    authority_boundary: {
      work_order_can_write_domain_truth: false,
      work_order_can_write_memory_body: false,
      work_order_can_accept_or_reject_memory_writeback: false,
      work_order_can_read_artifact_body: false,
      work_order_can_mutate_artifact_body: false,
      work_order_can_authorize_package_readiness: false,
      work_order_can_authorize_export_readiness: false,
      work_order_can_execute_domain_physical_delete: false,
      work_order_can_sign_domain_owner_receipt: false,
      work_order_can_create_typed_blocker: false,
      work_order_can_claim_domain_ready: false,
      work_order_can_claim_production_ready: false,
    },
  };
}

export function buildMemoryArtifactLifecycleEvidence(drilldown: JsonRecord) {
  const summary = record(drilldown.summary);
  const lifecycleSummary = record(record(drilldown.lifecycle_ledger_refs).summary);
  const ledgerProjection = record(drilldown.memory_artifact_lifecycle_evidence_projection);
  const ledgerObservedCounts = record(ledgerProjection.observed_ref_counts);
  const memoryRefCount = numberValue(summary.memory_ref_count);
  const memoryWritebackRefCount = numberValue(summary.memory_writeback_ref_count);
  const dispatchMemoryWritebackRefCount =
    numberValue(summary.domain_dispatch_evidence_memory_writeback_ref_count);
  const packageRefCount = numberValue(summary.package_ref_count);
  const exportRefCount = numberValue(summary.export_ref_count);
  const artifactRefCount = numberValue(summary.artifact_ref_count);
  const lifecycleIndexRefCount = numberValue(summary.lifecycle_index_ref_count);
  const restoreProofRefCount = numberValue(summary.lifecycle_restore_proof_ref_count);
  const artifactMutationReceiptRefCount =
    numberValue(summary.lifecycle_domain_artifact_mutation_receipt_ref_count);
  const lifecycleApplyHandoffAttemptCount =
    numberValue(summary.lifecycle_apply_handoff_attempt_count);
  const lifecycleApplyHandoffBlockedDecisionCount =
    numberValue(summary.lifecycle_apply_handoff_blocked_decision_count);
  const lifecycleApplyHandoffSafeDecisionCount =
    numberValue(summary.lifecycle_apply_handoff_safe_decision_count);
  const externalMemoryWritebackReceiptRefCount =
    numberValue(summary.domain_external_verified_memory_writeback_receipt_ref_count);
  const externalArtifactMutationReceiptRefCount =
    numberValue(summary.domain_external_verified_artifact_mutation_receipt_ref_count);
  const externalPackageLifecycleReceiptRefCount =
    numberValue(summary.domain_external_verified_package_lifecycle_receipt_ref_count);
  const externalLifecycleReceiptRefCount =
    numberValue(summary.domain_external_verified_lifecycle_receipt_ref_count);
  const externalRestoreProofRefCount =
    numberValue(summary.domain_external_verified_restore_proof_ref_count);
  const ledgerMemoryReceiptRefCount =
    numberValue(ledgerObservedCounts.memory_receipt_ref_count);
  const ledgerMemoryWritebackReceiptRefCount =
    numberValue(ledgerObservedCounts.memory_writeback_receipt_ref_count);
  const ledgerArtifactMutationReceiptRefCount =
    numberValue(ledgerObservedCounts.artifact_mutation_receipt_ref_count);
  const ledgerPackageLifecycleReceiptRefCount =
    numberValue(ledgerObservedCounts.package_lifecycle_receipt_ref_count);
  const ledgerExportLifecycleReceiptRefCount =
    numberValue(ledgerObservedCounts.export_lifecycle_receipt_ref_count);
  const ledgerCleanupRestoreRetentionReceiptRefCount =
    numberValue(ledgerObservedCounts.cleanup_restore_retention_receipt_ref_count);
  const ledgerTypedBlockerRefs = stringList(ledgerProjection.typed_blocker_refs);
  const ledgerOwnerAcceptanceRefs = stringList(ledgerProjection.owner_acceptance_refs);
  const reconcileMissingRefCount = numberValue(summary.lifecycle_reconcile_missing_ref_count);
  const reconcileExtraRefCount = numberValue(summary.lifecycle_reconcile_extra_ref_count);
  const reconcileStaleRefCount = numberValue(summary.lifecycle_reconcile_stale_ref_count);
  const observedRefCount = memoryRefCount
    + memoryWritebackRefCount
    + dispatchMemoryWritebackRefCount
    + packageRefCount
    + exportRefCount
    + artifactRefCount
    + lifecycleIndexRefCount
    + restoreProofRefCount
    + artifactMutationReceiptRefCount
    + externalMemoryWritebackReceiptRefCount
    + externalArtifactMutationReceiptRefCount
    + externalPackageLifecycleReceiptRefCount
    + externalLifecycleReceiptRefCount
    + externalRestoreProofRefCount
    + ledgerMemoryReceiptRefCount
    + ledgerMemoryWritebackReceiptRefCount
    + ledgerArtifactMutationReceiptRefCount
    + ledgerPackageLifecycleReceiptRefCount
    + ledgerExportLifecycleReceiptRefCount
    + ledgerCleanupRestoreRetentionReceiptRefCount
    + ledgerOwnerAcceptanceRefs.length;
  const reconcileIssueCount = reconcileMissingRefCount
    + reconcileExtraRefCount
    + reconcileStaleRefCount;
  const latestLifecycleApplyHandoff =
    record(drilldown.lifecycle_ledger_refs).latest_lifecycle_apply_handoff ?? null;
  const lifecycleReadinessStatus = readinessStatus({
    observedRefCount,
    reconcileIssueCount,
    lifecycleApplyHandoffBlockedDecisionCount,
    lifecycleApplyHandoffSafeDecisionCount,
  });
  const domainPhysicalDeleteCanExecute =
    summary.lifecycle_domain_physical_delete_can_execute === true;
  const oplCleanupApplyCanExecute =
    summary.lifecycle_opl_cleanup_apply_can_execute === true;
  return {
    surface_kind: 'opl_app_drilldown_memory_artifact_lifecycle_evidence',
    projection_policy:
      'refs_only_counts_from_memory_artifact_package_export_domain_dispatch_and_lifecycle_surfaces_no_body_or_mutation_authority',
    status: reconcileIssueCount > 0
      ? 'lifecycle_reconcile_attention_required'
      : observedRefCount > 0
        ? 'refs_observed'
        : 'no_refs_observed',
    readiness_status: lifecycleReadinessStatus,
    ready_claim_authorized: false,
    open_count_zero_is_not_memory_or_artifact_ready: true,
    observed_refs_are_refs_only_inputs: true,
    lifecycle_owner_work_order: lifecycleOwnerWorkOrder({
      readinessStatus: lifecycleReadinessStatus,
      observedRefCount,
      reconcileIssueCount,
      lifecycleApplyHandoffAttemptCount,
      lifecycleApplyHandoffBlockedDecisionCount,
      lifecycleApplyHandoffSafeDecisionCount,
      domainPhysicalDeleteCanExecute,
      oplCleanupApplyCanExecute,
      latestLifecycleApplyHandoff,
    }),
    observed_ref_count: observedRefCount,
    memory_ref_count: memoryRefCount,
    memory_writeback_ref_count: memoryWritebackRefCount,
    domain_dispatch_memory_writeback_ref_count: dispatchMemoryWritebackRefCount,
    package_ref_count: packageRefCount,
    export_ref_count: exportRefCount,
    artifact_ref_count: artifactRefCount,
    lifecycle_index_ref_count: lifecycleIndexRefCount,
    restore_proof_ref_count: restoreProofRefCount,
    domain_artifact_mutation_receipt_ref_count: artifactMutationReceiptRefCount,
    lifecycle_apply_handoff_attempt_count: lifecycleApplyHandoffAttemptCount,
    lifecycle_apply_handoff_blocked_decision_count: lifecycleApplyHandoffBlockedDecisionCount,
    lifecycle_apply_handoff_safe_decision_count: lifecycleApplyHandoffSafeDecisionCount,
    latest_lifecycle_apply_handoff: latestLifecycleApplyHandoff,
    external_verified_memory_writeback_receipt_ref_count: externalMemoryWritebackReceiptRefCount,
    external_verified_artifact_mutation_receipt_ref_count: externalArtifactMutationReceiptRefCount,
    external_verified_package_lifecycle_receipt_ref_count: externalPackageLifecycleReceiptRefCount,
    external_verified_lifecycle_receipt_ref_count: externalLifecycleReceiptRefCount,
    external_verified_restore_proof_ref_count: externalRestoreProofRefCount,
    evidence_ledger_status:
      stringValue(ledgerProjection.evidence_ledger_status) ?? 'ledger_refs_missing',
    ledger_receipt_ref_count: numberValue(ledgerProjection.receipt_count),
    ledger_recorded_receipt_ref_count:
      numberValue(ledgerProjection.recorded_receipt_ref_count),
    ledger_verified_receipt_ref_count:
      numberValue(ledgerProjection.verified_receipt_ref_count),
    ledger_pending_verify_receipt_ref_count:
      numberValue(ledgerProjection.pending_verify_receipt_ref_count),
    ledger_receipt_refs: stringList(ledgerProjection.receipt_refs),
    ledger_verified_receipt_refs: stringList(ledgerProjection.verified_receipt_refs),
    ledger_pending_verify_receipt_refs:
      stringList(ledgerProjection.pending_verify_receipt_refs),
    ledger_memory_receipt_ref_count: ledgerMemoryReceiptRefCount,
    ledger_memory_writeback_receipt_ref_count: ledgerMemoryWritebackReceiptRefCount,
    ledger_artifact_mutation_receipt_ref_count: ledgerArtifactMutationReceiptRefCount,
    ledger_package_lifecycle_receipt_ref_count: ledgerPackageLifecycleReceiptRefCount,
    ledger_export_lifecycle_receipt_ref_count: ledgerExportLifecycleReceiptRefCount,
    ledger_cleanup_restore_retention_receipt_ref_count:
      ledgerCleanupRestoreRetentionReceiptRefCount,
    ledger_typed_blocker_ref_count: ledgerTypedBlockerRefs.length,
    ledger_latest_typed_blocker_refs: ledgerTypedBlockerRefs,
    ledger_owner_acceptance_ref_count: ledgerOwnerAcceptanceRefs.length,
    ledger_owner_acceptance_refs: ledgerOwnerAcceptanceRefs,
    ledger_projection: ledgerProjection,
    lifecycle_reconcile_status: stringValue(lifecycleSummary.lifecycle_reconcile_status),
    lifecycle_reconcile_missing_ref_count: reconcileMissingRefCount,
    lifecycle_reconcile_extra_ref_count: reconcileExtraRefCount,
    lifecycle_reconcile_stale_ref_count: reconcileStaleRefCount,
    domain_physical_delete_requires_owner_receipt:
      summary.lifecycle_domain_physical_delete_requires_owner_receipt === true,
    domain_physical_delete_can_execute: domainPhysicalDeleteCanExecute,
    opl_cleanup_apply_can_execute: oplCleanupApplyCanExecute,
    forbidden_opl_claims: [
      'memory_body_saved_or_accepted',
      'artifact_body_mutated',
      'artifact_ready',
      'package_ready',
      'export_ready',
      'domain_ready',
      'production_ready',
      'domain_physical_delete_authorization',
    ],
    full_detail_sections: [
      'memory_writeback_refs',
      'artifact_gallery_refs',
      'package_export_lifecycle_refs',
      'domain_dispatch_evidence',
      'domain_evidence_request_refs',
      'lifecycle_ledger_refs',
      'lifecycle_ledger_refs.lifecycle_apply_handoff_attempts',
    ],
    authority_boundary: {
      ...buildAppDrilldownRefsOnlyAuthorityBoundary(),
      refs_only: true,
      can_accept_or_reject_memory_writeback: false,
      can_mutate_artifact_body: false,
      can_authorize_package_readiness: false,
      can_authorize_export_readiness: false,
      can_execute_domain_physical_delete: false,
      verified_refs_only_ledger_counts_as_memory_ready: false,
      verified_refs_only_ledger_counts_as_artifact_ready: false,
      verified_refs_only_ledger_counts_as_package_ready: false,
      verified_refs_only_ledger_counts_as_export_ready: false,
    },
  };
}
