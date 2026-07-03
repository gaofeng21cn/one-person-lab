import type { JsonRecord } from '../../kernel/types.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from '../../kernel/refs-only-authority-boundary.ts';

function record(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function ownerWorkOrderSummary(workOrder: JsonRecord) {
  return {
    surface_kind: workOrder.surface_kind,
    work_order_id: workOrder.work_order_id,
    lane_id: workOrder.lane_id,
    status: workOrder.status,
    observed_ref_count: numberValue(workOrder.observed_ref_count),
    open_count: numberValue(workOrder.open_count),
    open_count_semantics: workOrder.open_count_semantics,
    next_required_owner_action: workOrder.next_required_owner_action,
    accepted_refs_only_result_shapes: Array.isArray(workOrder.accepted_refs_only_result_shapes)
      ? workOrder.accepted_refs_only_result_shapes
      : [],
    typed_blocker_work_order: record(workOrder.typed_blocker_work_order),
    ready_claim_authorized: workOrder.ready_claim_authorized === true,
    forbidden_opl_claims: Array.isArray(workOrder.forbidden_opl_claims)
      ? workOrder.forbidden_opl_claims
      : [],
    non_closing_inputs: Array.isArray(workOrder.non_closing_inputs)
      ? workOrder.non_closing_inputs
      : [],
    authority_boundary: record(workOrder.authority_boundary),
  };
}

export function buildMemoryArtifactLifecycleReadback(appOperatorDrilldown: JsonRecord) {
  const evidence = record(appOperatorDrilldown.memory_artifact_lifecycle);
  const summary = record(appOperatorDrilldown.summary);
  const lifecycleLedgerRefs = record(appOperatorDrilldown.lifecycle_ledger_refs);
  const ledgerProjection = record(
    appOperatorDrilldown.memory_artifact_lifecycle_evidence_projection,
  );
  const ledgerObservedCounts = record(ledgerProjection.observed_ref_counts);
  const ownerWorkOrder = record(evidence.lifecycle_owner_work_order);
  const latestHandoff = record(evidence.latest_lifecycle_apply_handoff);
  const status = stringValue(evidence.readiness_status) ?? 'owner_receipt_or_typed_blocker_required_not_ready';
  return {
    surface_kind: 'opl_memory_artifact_lifecycle_readback',
    source_command: 'opl runtime app-operator-drilldown --json',
    projection_policy:
      'thin_owner_followthrough_readback_from_app_operator_drilldown_no_body_or_domain_authority',
    status,
    ready_claim_authorized: false,
    next_required_owner_action:
      stringValue(ownerWorkOrder.next_required_owner_action)
      ?? 'domain_owner_record_memory_artifact_lifecycle_receipt_or_typed_blocker',
    owner_work_order: ownerWorkOrderSummary(ownerWorkOrder),
    summary: {
      observed_ref_count: numberValue(evidence.observed_ref_count),
      lifecycle_reconcile_issue_count:
        numberValue(evidence.lifecycle_reconcile_missing_ref_count)
        + numberValue(evidence.lifecycle_reconcile_extra_ref_count)
        + numberValue(evidence.lifecycle_reconcile_stale_ref_count),
      lifecycle_apply_handoff_attempt_count:
        numberValue(evidence.lifecycle_apply_handoff_attempt_count),
      lifecycle_apply_handoff_blocked_decision_count:
        numberValue(evidence.lifecycle_apply_handoff_blocked_decision_count),
      lifecycle_apply_handoff_safe_decision_count:
        numberValue(evidence.lifecycle_apply_handoff_safe_decision_count),
      memory_ref_count: numberValue(evidence.memory_ref_count),
      memory_writeback_ref_count: numberValue(evidence.memory_writeback_ref_count),
      artifact_ref_count: numberValue(evidence.artifact_ref_count),
      package_ref_count: numberValue(evidence.package_ref_count),
      export_ref_count: numberValue(evidence.export_ref_count),
      lifecycle_index_ref_count: numberValue(evidence.lifecycle_index_ref_count),
      restore_proof_ref_count: numberValue(evidence.restore_proof_ref_count),
      domain_artifact_mutation_receipt_ref_count:
        numberValue(evidence.domain_artifact_mutation_receipt_ref_count),
      external_verified_memory_writeback_receipt_ref_count:
        numberValue(evidence.external_verified_memory_writeback_receipt_ref_count),
      external_verified_artifact_mutation_receipt_ref_count:
        numberValue(evidence.external_verified_artifact_mutation_receipt_ref_count),
      external_verified_package_lifecycle_receipt_ref_count:
        numberValue(evidence.external_verified_package_lifecycle_receipt_ref_count),
      external_verified_lifecycle_receipt_ref_count:
        numberValue(evidence.external_verified_lifecycle_receipt_ref_count),
      app_summary_lifecycle_apply_receipt_count:
        numberValue(summary.lifecycle_apply_receipt_count),
      app_summary_lifecycle_apply_blocked_receipt_count:
        numberValue(summary.lifecycle_apply_blocked_receipt_count),
      ledger_receipt_ref_count:
        numberValue(summary.memory_artifact_lifecycle_evidence_ledger_receipt_ref_count),
      ledger_recorded_receipt_ref_count:
        numberValue(
          summary.memory_artifact_lifecycle_evidence_recorded_ledger_receipt_ref_count,
        ),
      ledger_verified_receipt_ref_count:
        numberValue(
          summary.memory_artifact_lifecycle_evidence_verified_ledger_receipt_ref_count,
        ),
      ledger_pending_verify_receipt_ref_count:
        numberValue(
          summary.memory_artifact_lifecycle_evidence_pending_verify_receipt_ref_count,
        ),
      ledger_typed_blocker_ref_count:
        numberValue(summary.memory_artifact_lifecycle_evidence_typed_blocker_ref_count),
      ledger_owner_acceptance_ref_count:
        numberValue(summary.memory_artifact_lifecycle_evidence_owner_acceptance_ref_count),
    },
    ledger_evidence_projection: {
      surface_kind: ledgerProjection.surface_kind
        ?? 'opl_memory_artifact_lifecycle_evidence_projection',
      status: stringValue(ledgerProjection.status) ?? 'lifecycle_evidence_required',
      evidence_ledger_status:
        stringValue(ledgerProjection.evidence_ledger_status) ?? 'ledger_refs_missing',
      receipt_count: numberValue(ledgerProjection.receipt_count),
      receipt_refs: Array.isArray(ledgerProjection.receipt_refs)
        ? ledgerProjection.receipt_refs
        : [],
      recorded_receipt_ref_count:
        numberValue(ledgerProjection.recorded_receipt_ref_count),
      recorded_receipt_refs: Array.isArray(ledgerProjection.recorded_receipt_refs)
        ? ledgerProjection.recorded_receipt_refs
        : [],
      verified_receipt_ref_count:
        numberValue(ledgerProjection.verified_receipt_ref_count),
      verified_receipt_refs: Array.isArray(ledgerProjection.verified_receipt_refs)
        ? ledgerProjection.verified_receipt_refs
        : [],
      pending_verify_receipt_ref_count:
        numberValue(ledgerProjection.pending_verify_receipt_ref_count),
      pending_verify_receipt_refs:
        Array.isArray(ledgerProjection.pending_verify_receipt_refs)
          ? ledgerProjection.pending_verify_receipt_refs
          : [],
      memory_receipt_refs: Array.isArray(ledgerProjection.memory_receipt_refs)
        ? ledgerProjection.memory_receipt_refs
        : [],
      memory_writeback_receipt_refs:
        Array.isArray(ledgerProjection.memory_writeback_receipt_refs)
          ? ledgerProjection.memory_writeback_receipt_refs
          : [],
      artifact_mutation_receipt_refs:
        Array.isArray(ledgerProjection.artifact_mutation_receipt_refs)
          ? ledgerProjection.artifact_mutation_receipt_refs
          : [],
      package_lifecycle_receipt_refs:
        Array.isArray(ledgerProjection.package_lifecycle_receipt_refs)
          ? ledgerProjection.package_lifecycle_receipt_refs
          : [],
      export_lifecycle_receipt_refs:
        Array.isArray(ledgerProjection.export_lifecycle_receipt_refs)
          ? ledgerProjection.export_lifecycle_receipt_refs
          : [],
      cleanup_restore_retention_receipt_refs:
        Array.isArray(ledgerProjection.cleanup_restore_retention_receipt_refs)
          ? ledgerProjection.cleanup_restore_retention_receipt_refs
          : [],
      typed_blocker_refs: Array.isArray(ledgerProjection.typed_blocker_refs)
        ? ledgerProjection.typed_blocker_refs
        : [],
      owner_acceptance_refs: Array.isArray(ledgerProjection.owner_acceptance_refs)
        ? ledgerProjection.owner_acceptance_refs
        : [],
      observed_ref_shapes: Array.isArray(ledgerProjection.observed_ref_shapes)
        ? ledgerProjection.observed_ref_shapes
        : [],
      observed_ref_counts: ledgerObservedCounts,
      ready_claim_authorized: ledgerProjection.ready_claim_authorized === true,
      verified_refs_only_ledger_counts_as_memory_ready:
        ledgerProjection.verified_refs_only_ledger_counts_as_memory_ready === true,
      verified_refs_only_ledger_counts_as_artifact_ready:
        ledgerProjection.verified_refs_only_ledger_counts_as_artifact_ready === true,
      verified_refs_only_ledger_counts_as_package_ready:
        ledgerProjection.verified_refs_only_ledger_counts_as_package_ready === true,
      verified_refs_only_ledger_counts_as_export_ready:
        ledgerProjection.verified_refs_only_ledger_counts_as_export_ready === true,
      authority_boundary: record(ledgerProjection.authority_boundary),
    },
    latest_lifecycle_apply_handoff: {
      handoff_ref: latestHandoff.handoff_ref ?? null,
      selected_payload_path: latestHandoff.selected_payload_path ?? null,
      candidate_ref_count: numberValue(latestHandoff.candidate_ref_count),
      writes_performed: latestHandoff.writes_performed === true,
      receipt_ref: latestHandoff.receipt_ref ?? null,
      typed_blocker_refs: Array.isArray(latestHandoff.typed_blocker_refs)
        ? latestHandoff.typed_blocker_refs
        : [],
      authority_boundary: record(latestHandoff.authority_boundary),
    },
    lifecycle_ledger_refs: {
      surface_kind: lifecycleLedgerRefs.surface_kind,
      summary: record(lifecycleLedgerRefs.summary),
      restore_proof_refs: Array.isArray(lifecycleLedgerRefs.restore_proof_refs)
        ? lifecycleLedgerRefs.restore_proof_refs
        : [],
      domain_artifact_mutation_receipt_refs:
        Array.isArray(lifecycleLedgerRefs.domain_artifact_mutation_receipt_refs)
          ? lifecycleLedgerRefs.domain_artifact_mutation_receipt_refs
          : [],
      reconcile_projection: record(lifecycleLedgerRefs.reconcile_projection),
    },
    non_closing_inputs: [
      'app_projection',
      'verified_refs_only_ledger',
      'lifecycle_reconcile_zero_issue_count',
      'open_count_zero',
      'opl_cleanup_apply_available',
      'typed_blocker_ref_without_owner_followthrough',
    ],
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
    authority_boundary: {
      ...buildAppDrilldownRefsOnlyAuthorityBoundary(),
      refs_only: true,
      can_write_memory_body: false,
      can_read_memory_body: false,
      can_accept_or_reject_memory_writeback: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_authorize_package_readiness: false,
      can_authorize_export_readiness: false,
      can_execute_domain_physical_delete: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_claim_memory_ready: false,
      can_claim_artifact_ready: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
}
