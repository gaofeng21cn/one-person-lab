import {
  buildEvidenceGroundedDecisionAgentProfileReadback,
  EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
} from '../pack/index.ts';
import { record, recordList, stringList, stringValue } from '../../kernel/json-record.ts';

function text(value: unknown, fallback: string) {
  return stringValue(value) ?? fallback;
}

function authorityBoundary(value: unknown) {
  return {
    ...record(value),
    eval_surface_role: 'non_live_eval_and_promotion_gate_projection',
    eval_surface_can_claim_live_evidence: false,
    eval_surface_can_claim_runtime_ready: false,
    eval_surface_can_claim_domain_ready: false,
    eval_surface_can_claim_quality_verdict: false,
    eval_surface_can_claim_owner_verdict: false,
    eval_surface_can_create_owner_receipt: false,
    eval_surface_can_promote_to_production_ready: false,
  };
}

export function buildEvidenceGroundedDecisionAgentProfileFoundryLabEvalSurface() {
  const readback = buildEvidenceGroundedDecisionAgentProfileReadback()
    .evidence_grounded_decision_agent_profile;
  const contract = record(readback.contract);
  const modeRoutingPolicy = record(readback.mode_routing_policy);
  const evidencePolicy = record(readback.evidence_policy);
  const humanGatePolicy = record(readback.human_gate_policy);
  const unsupportedEvidenceBlockerPolicy = record(readback.unsupported_evidence_blocker_policy);

  return {
    version: 'g2',
    foundry_lab_evidence_grounded_decision_agent_profile_eval: {
      surface_kind: 'opl_foundry_lab_evidence_grounded_decision_agent_profile_eval_surface',
      version: 'evidence-grounded-decision-agent-profile-foundry-lab-eval.v1',
      profile_id: readback.profile_id,
      contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
      surface_role: 'eval_promotion_suite_not_live_evidence',
      live_evidence_observed: false,
      eval_suite: {
        suite_id: 'eval-suite:evidence-grounded-decision-agent-profile/non-live-contract',
        suite_role: 'contract_projection_and_regression_review',
        target_profile_id: readback.profile_id,
        target_contract_ref: EVIDENCE_GROUNDED_DECISION_AGENT_PROFILE_CONTRACT_REF,
        mode_coverage: stringList(modeRoutingPolicy.allowed_mode_classes).map((modeClass) => ({
          mode_class: modeClass,
          required_policy_ref: text(modeRoutingPolicy.policy_id, 'evidence_grounded_mode_routing.v1'),
        })),
        evidence_policy_coverage: {
          policy_id: text(evidencePolicy.policy_id, 'refs_only_evidence_grounding.v1'),
          required_evidence_fields: stringList(evidencePolicy.required_evidence_fields),
          accepted_conflict_statuses: stringList(evidencePolicy.accepted_conflict_statuses),
          body_storage_policy: text(evidencePolicy.body_storage_policy, 'refs_only_no_source_body_in_profile_contract'),
          can_claim_quality_verdict: false,
        },
        fail_closed_coverage: recordList(contract.fail_closed_rules).map((rule) => ({
          rule_id: text(rule.rule_id, 'unknown'),
          success_closeout_allowed: rule.success_closeout_allowed === true ? true : false,
          allowed_outcomes: stringList(rule.allowed_outcomes),
        })),
        forbidden_claim_coverage: recordList(contract.forbidden_claims).map((claim) => ({
          claim_id: text(claim.claim_id, 'unknown'),
          owner: text(claim.owner, 'unknown'),
          forbidden: claim.forbidden === true,
        })),
      },
      independent_review_receipt_requirement: {
        receipt_object: 'IndependentReviewReceipt',
        receipt_ref_required: true,
        receipt_body_required: false,
        required_for: [
          'eval_suite_review',
          'promotion_gate_review',
          'regression_review',
        ],
        must_be_independent_from_executor_context: true,
        review_receipt_can_replace_owner_verdict: false,
      },
      promotion_gate: {
        gate_id: 'promotion-gate:evidence-grounded-decision-agent-profile/non-live',
        gate_role: 'ref_promotion_gate_for_profile_surface_only',
        required_ref_kinds: [
          'eval_suite_receipt_ref',
          'independent_review_receipt_ref',
          'owner_verdict_ref_for_domain_or_quality_claim',
        ],
        human_gate_policy_ref: text(humanGatePolicy.policy_id, 'decision_support_human_gate.v1'),
        unsupported_evidence_blocker_policy_ref: text(
          unsupportedEvidenceBlockerPolicy.policy_id,
          'unsupported_evidence_blocker.v1',
        ),
        independent_review_receipt_required: true,
        review_receipt_ref_promotion_gate_required: true,
        review_receipt_can_replace_owner_verdict: false,
        ref_promotion_gate_can_replace_owner_verdict: false,
        can_promote_to_domain_ready: false,
        can_promote_to_quality_verdict: false,
        can_promote_to_owner_receipt: false,
        can_promote_to_production_ready: false,
      },
      authority_boundary: authorityBoundary(readback.authority_boundary),
    },
  };
}
