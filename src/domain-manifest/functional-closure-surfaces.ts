import {
  isRecord,
  normalizeRecordList,
} from './shared-utils.ts';
import {
  buildFunctionalPrivatizationAudit,
} from '../functional-privatization-audit.ts';

type JsonRecord = Record<string, unknown>;

export function normalizeFunctionalClosureSurfaces(manifest: JsonRecord) {
  return {
    functional_consumer_boundary: isRecord(manifest.functional_consumer_boundary)
      ? manifest.functional_consumer_boundary
      : null,
    owner_receipt_contract: isRecord(manifest.owner_receipt_contract)
      ? manifest.owner_receipt_contract
      : null,
    domain_owner_receipt_contract: isRecord(manifest.domain_owner_receipt_contract)
      ? manifest.domain_owner_receipt_contract
      : null,
    managed_temporal_state_consistency: isRecord(manifest.managed_temporal_state_consistency)
      ? manifest.managed_temporal_state_consistency
      : null,
    controlled_stage_attempt_projection: isRecord(manifest.controlled_stage_attempt_projection)
      ? manifest.controlled_stage_attempt_projection
      : null,
    operator_evidence_readiness_projection: isRecord(manifest.operator_evidence_readiness_projection)
      ? manifest.operator_evidence_readiness_projection
      : null,
    controlled_soak_no_regression_attempt: isRecord(manifest.controlled_soak_no_regression_attempt)
      ? manifest.controlled_soak_no_regression_attempt
      : null,
    lifecycle_apply_requests: normalizeRecordList(
      manifest.lifecycle_apply_requests,
      'lifecycle_apply_requests',
    ),
    lifecycle_guarded_apply_proof: isRecord(manifest.lifecycle_guarded_apply_proof)
      ? manifest.lifecycle_guarded_apply_proof
      : null,
    physical_skeleton_follow_through: isRecord(manifest.physical_skeleton_follow_through)
      ? manifest.physical_skeleton_follow_through
      : null,
    legacy_retirement_tombstone_proof: isRecord(manifest.legacy_retirement_tombstone_proof)
      ? manifest.legacy_retirement_tombstone_proof
      : null,
    runtime_residue_retirement: isRecord(manifest.runtime_residue_retirement)
      ? manifest.runtime_residue_retirement
      : null,
    functional_privatization_audit: buildFunctionalPrivatizationAudit(manifest),
  };
}
