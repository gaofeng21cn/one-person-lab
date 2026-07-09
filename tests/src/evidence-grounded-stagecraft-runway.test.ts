import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEvidenceGroundedRunwayProfilePolicyReadback } from '../../src/modules/runway/index.ts';
import { buildEvidenceGroundedStagecraftProfilePolicyReadback } from '../../src/modules/stagecraft/index.ts';

const requiredModeClasses = [
  'evidence_lookup',
  'comparison',
  'differential_reasoning',
  'risk_or_priority_stratification',
  'recommendation_options',
  'insufficient_evidence_route_back',
];

const requiredReceiptFields = [
  'mode_id',
  'evidence_threshold_ref',
  'tool_affordance_boundary_ref',
  'source_freshness_window_ref',
  'selected_executor_binding_ref',
  'route_back_or_human_gate_policy_ref',
];

const humanGateCloseoutRefs = [
  'human_gate_ref',
  'route_back_ref',
  'typed_blocker_ref',
];

test('Evidence profile Stagecraft and Runway expose non-live refs-only policy readbacks', () => {
  const stagecraft = buildEvidenceGroundedStagecraftProfilePolicyReadback()
    .evidence_grounded_stagecraft_profile;
  const runway = buildEvidenceGroundedRunwayProfilePolicyReadback()
    .evidence_grounded_runway_profile;

  assert.equal(stagecraft.live_evidence_performed, false);
  assert.equal(stagecraft.policy_projection_role, 'non_live_refs_only_advisory_policy_projection');
  assert.deepEqual(stagecraft.mode_routing_receipt.required_receipt_fields, requiredReceiptFields);
  assert.deepEqual(stagecraft.mode_routing_receipt.required_ref_fields, requiredReceiptFields.slice(1));
  assert.deepEqual(stagecraft.allowed_mode_classes, requiredModeClasses);
  assert.equal(stagecraft.mode_routing_receipt.can_replace_domain_policy, false);
  assert.deepEqual(
    stagecraft.evidence_sufficiency_policy.insufficient_evidence_route_back.allowed_route_refs,
    humanGateCloseoutRefs,
  );
  assert.equal(
    stagecraft.evidence_sufficiency_policy.insufficient_evidence_route_back.mode_class,
    'insufficient_evidence_route_back',
  );
  assert.equal(stagecraft.evidence_sufficiency_policy.can_claim_quality_verdict, false);
  assert.equal(stagecraft.independent_review_requirement_gate.advisory_only, true);
  assert.deepEqual(
    stagecraft.independent_review_requirement_gate.acceptable_review_refs,
    ['independent_review_receipt_ref'],
  );
  assert.equal(stagecraft.independent_review_requirement_gate.can_authorize_final_decision, false);
  assert.equal(stagecraft.authority_boundary.can_claim_final_decision, false);
  assert.equal(stagecraft.authority_boundary.can_create_domain_typed_blocker, false);

  assert.equal(runway.live_evidence_performed, false);
  assert.equal(runway.attempt_closeout_policy.all_rules_fail_closed, true);
  assert.equal(
    runway.attempt_closeout_policy.success_closeout_allowed_when_any_fail_closed_rule_matches,
    false,
  );
  assert.equal(runway.attempt_closeout_policy.can_closeout_fail_closed_rule_as_success, false);
  assert.equal(
    runway.attempt_closeout_policy.allowed_closeout_refs_by_rule
      .every((rule) => rule.success_closeout_allowed === false),
    true,
  );
  assert.deepEqual(runway.human_gate_lifecycle_policy.allowed_closeout_refs, humanGateCloseoutRefs);
  assert.equal(
    runway.human_gate_lifecycle_policy.human_gate_decision_can_be_fabricated_by_opl,
    false,
  );
  assert.deepEqual(
    runway.human_gate_decision_readback_projection.accepted_closeout_refs,
    humanGateCloseoutRefs,
  );
  assert.equal(runway.human_gate_decision_readback_projection.required_external_decision_ref, 'human_gate_ref');
  assert.equal(runway.human_gate_decision_readback_projection.opl_can_fabricate_decision, false);
  assert.equal(runway.authority_boundary.can_create_human_gate_decision, false);
  assert.equal(runway.authority_boundary.can_closeout_fail_closed_rule_as_success, false);
});

