import {
  assert,
} from '../helpers.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function assertMemoryArtifactLifecycleEvidence(summaryDrilldown: JsonRecord) {
  const attention = record(summaryDrilldown.attention_first_payload);
  const evidenceAfterContract = record(attention.evidence_after_contract);
  const evidence = record(evidenceAfterContract.memory_artifact_lifecycle_evidence);
  const summary = record(summaryDrilldown.summary);
  const authorityBoundary = record(evidence.authority_boundary);
  assert.equal(
    evidence.surface_kind,
    'opl_app_drilldown_memory_artifact_lifecycle_evidence',
  );
  assert.equal(evidence.status, 'refs_observed');
  assert.equal(
    evidence.readiness_status,
    'refs_observed_not_memory_or_artifact_ready',
  );
  assert.equal(evidence.ready_claim_authorized, false);
  assert.equal(evidence.open_count_zero_is_not_memory_or_artifact_ready, true);
  assert.equal(evidence.observed_refs_are_refs_only_inputs, true);
  const workOrder = record(evidence.lifecycle_owner_work_order);
  const typedBlockerWorkOrder = record(workOrder.typed_blocker_work_order);
  assert.equal(
    workOrder.surface_kind,
    'opl_memory_artifact_lifecycle_owner_work_order',
  );
  assert.equal(workOrder.lane_id, 'memory_artifact_lifecycle_apply');
  assert.equal(workOrder.ready_claim_authorized, false);
  assert.equal(
    workOrder.next_required_owner_action,
    'domain_owner_record_memory_artifact_lifecycle_receipt_or_typed_blocker',
  );
  assert.equal(
    workOrder.open_count_semantics,
    'open_count_tracks_refs_or_reconcile_gaps_only_zero_does_not_authorize_memory_artifact_package_or_export_ready',
  );
  assert.equal(
    Array.isArray(workOrder.accepted_refs_only_result_shapes)
      && workOrder.accepted_refs_only_result_shapes.includes('typed_blocker_ref'),
    true,
  );
  assert.equal(
    Array.isArray(workOrder.forbidden_opl_claims)
      && workOrder.forbidden_opl_claims.includes('artifact_ready'),
    true,
  );
  assert.equal(
    Array.isArray(workOrder.non_closing_inputs)
      && workOrder.non_closing_inputs.includes('open_count_zero'),
    true,
  );
  assert.equal(typedBlockerWorkOrder.accepted_ref_shape, 'typed_blocker_ref');
  assert.equal(record(workOrder.authority_boundary).work_order_can_mutate_artifact_body, false);
  assert.equal(record(workOrder.authority_boundary).work_order_can_write_memory_body, false);
  assert.equal(evidence.memory_ref_count, summary.memory_ref_count);
  assert.equal(
    evidence.memory_writeback_ref_count,
    summary.memory_writeback_ref_count,
  );
  assert.equal(
    evidence.domain_dispatch_memory_writeback_ref_count,
    summary.domain_dispatch_evidence_memory_writeback_ref_count,
  );
  assert.equal(evidence.package_ref_count, summary.package_ref_count);
  assert.equal(evidence.export_ref_count, summary.export_ref_count);
  assert.equal(evidence.artifact_ref_count, summary.artifact_ref_count);
  assert.equal(
    evidence.domain_artifact_mutation_receipt_ref_count,
    summary.lifecycle_domain_artifact_mutation_receipt_ref_count,
  );
  assert.equal(
    evidence.external_verified_memory_writeback_receipt_ref_count,
    summary.domain_external_verified_memory_writeback_receipt_ref_count,
  );
  assert.equal(
    evidence.external_verified_artifact_mutation_receipt_ref_count,
    summary.domain_external_verified_artifact_mutation_receipt_ref_count,
  );
  assert.equal(
    evidence.external_verified_package_lifecycle_receipt_ref_count,
    summary.domain_external_verified_package_lifecycle_receipt_ref_count,
  );
  assert.equal(
    evidence.external_verified_lifecycle_receipt_ref_count,
    summary.domain_external_verified_lifecycle_receipt_ref_count,
  );
  assert.equal(
    evidence.external_verified_restore_proof_ref_count,
    summary.domain_external_verified_restore_proof_ref_count,
  );
  assert.equal(numberValue(evidence.observed_ref_count) > 0, true);
  assert.equal(authorityBoundary.can_read_memory_body, false);
  assert.equal(authorityBoundary.can_accept_or_reject_memory_writeback, false);
  assert.equal(authorityBoundary.can_read_artifact_body, false);
  assert.equal(authorityBoundary.can_mutate_artifact_body, false);
  assert.equal(authorityBoundary.can_execute_domain_physical_delete, false);
}
