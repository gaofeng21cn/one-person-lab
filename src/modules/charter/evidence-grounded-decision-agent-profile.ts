import {
  buildEvidenceGroundedDecisionAgentProfileReadback,
  EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
} from '../pack/index.ts';
import { record, recordList, stringValue } from '../../kernel/json-record.ts';

function text(value: unknown, fallback: string) {
  return stringValue(value) ?? fallback;
}

export function buildEvidenceGroundedCharterProfileBoundaryReadback() {
  const readback = buildEvidenceGroundedDecisionAgentProfileReadback()
    .evidence_grounded_decision_agent_profile;
  const contract = record(readback.contract);
  const authority = record(readback.authority_boundary);

  return {
    version: 'g2',
    evidence_grounded_charter_profile_boundary: {
      surface_kind: 'opl_charter_evidence_grounded_decision_agent_profile_boundary',
      version: 'evidence-grounded-charter-profile-boundary.v1',
      module_id: 'charter',
      brand_module: 'OPL Charter',
      profile_id: readback.profile_id,
      contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
      boundary_role: 'forbidden_claims_and_false_authority_policy',
      live_evidence_observed: false,
      forbidden_claims: recordList(contract.forbidden_claims).map((claim) => ({
        claim_id: text(claim.claim_id, 'unknown'),
        owner: text(claim.owner, 'unknown'),
        forbidden: claim.forbidden === true,
      })),
      false_authority_flags: authority,
      no_new_brand_module: true,
      implements_concrete_domain_agent: false,
      implements_medical_or_hematology_agent: false,
      authority_boundary: {
        charter_projection_only: true,
        can_create_domain_agent: false,
        can_claim_domain_ready: false,
        can_claim_quality_verdict: false,
        can_claim_final_decision: false,
        can_claim_artifact_authority: false,
        can_create_owner_receipt: false,
        can_create_domain_typed_blocker: false,
        can_claim_production_ready: false,
      },
    },
  };
}
