import domainPrivatePlatformTailMatrixContract from '../../../contracts/opl-framework/domain-private-platform-tail-matrix.json' with { type: 'json' };
import { isRecord } from '../../kernel/contract-validation.ts';

type JsonRecord = Record<string, unknown>;

const CONTRACT_REF = 'contracts/opl-framework/domain-private-platform-tail-matrix.json' as const;

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
    : [];
}

function projectTailRow(row: JsonRecord) {
  const deleteGate = isRecord(row.delete_or_tombstone_gate) ? row.delete_or_tombstone_gate : {};
  const verificationSurface = isRecord(row.verification_surface) ? row.verification_surface : {};
  const ownerDecisionRequired = row.owner_decision_required === true;
  return {
    domain_id: row.domain_id,
    repo_id: row.repo_id,
    surface_id: row.surface_id,
    private_tail_class: stringList(row.private_tail_class),
    replacement_opl_primitive: stringList(row.replacement_opl_primitive),
    authority_retained: stringList(row.authority_retained),
    delete_or_tombstone_gate: {
      ...deleteGate,
      physical_delete_authorized: false,
      owner_decision_required: ownerDecisionRequired,
    },
    forbidden_claims: stringList(row.forbidden_claims),
    physical_delete_authorized: false,
    owner_decision_required: ownerDecisionRequired,
    verification_surface: verificationSurface,
  };
}

export function buildDomainPrivatePlatformTailMatrixReadback() {
  const contract = domainPrivatePlatformTailMatrixContract as JsonRecord;
  const rows = Array.isArray(contract.surfaces)
    ? contract.surfaces.filter(isRecord).map(projectTailRow)
    : [];
  return {
    surface_kind: 'opl_domain_private_platform_tail_matrix_readback.v1',
    owner: 'one-person-lab',
    contract_ref: CONTRACT_REF,
    source_contract_state: contract.state,
    source_phase: contract.source_phase,
    row_count: rows.length,
    physical_delete_authorized: false,
    owner_acceptance_claimed: false,
    domain_ready_claimed: false,
    production_ready_claimed: false,
    rows,
    authority_boundary: {
      readback_can_mutate_domain_repo_files: false,
      readback_can_write_domain_truth: false,
      readback_can_sign_domain_owner_receipt: false,
      readback_can_create_typed_blocker: false,
      readback_can_authorize_domain_repo_physical_delete: false,
      readback_can_claim_domain_ready: false,
      readback_can_claim_production_ready: false,
    },
  };
}
