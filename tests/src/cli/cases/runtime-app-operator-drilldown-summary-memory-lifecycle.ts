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
