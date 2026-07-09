import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEvidenceGroundedDecisionAgentProfileAtlasCatalog } from '../../src/modules/atlas/index.ts';
import { buildEvidenceGroundedDecisionAgentProfileConsoleDrilldown } from '../../src/modules/console/index.ts';
import { buildEvidenceGroundedDecisionAgentProfileFoundryLabEvalSurface } from '../../src/modules/foundry-lab/index.ts';

function everyAuthorityFlagFalse(boundary: Record<string, unknown>) {
  return Object.entries(boundary)
    .filter(([key]) => key.startsWith('profile_can_') || key.startsWith('pack_can_'))
    .every(([, value]) => value === false);
}

test('Evidence profile module projections expose catalog, refs-only drilldown, and non-live eval gates', () => {
  const atlas = buildEvidenceGroundedDecisionAgentProfileAtlasCatalog()
    .atlas_evidence_grounded_decision_agent_profile_catalog;
  const consoleDrilldown = buildEvidenceGroundedDecisionAgentProfileConsoleDrilldown({
    trace_refs: ['trace-ref:fixture/evidence-profile'],
    evidence_refs: ['evidence-ref:fixture/profile'],
    source_refs: ['source-ref:fixture/profile'],
    artifact_refs: ['artifact-ref:fixture/advisory-output'],
    retrieval_receipt_refs: ['retrieval-receipt-ref:fixture/profile'],
    tool_receipt_refs: ['tool-receipt-ref:fixture/profile'],
  }).console_evidence_grounded_decision_agent_profile_drilldown;
  const foundry = buildEvidenceGroundedDecisionAgentProfileFoundryLabEvalSurface()
    .foundry_lab_evidence_grounded_decision_agent_profile_eval;

  assert.equal(atlas.surface_kind, 'opl_atlas_evidence_grounded_decision_agent_profile_catalog');
  assert.equal(atlas.catalog_role, 'discoverable_catalog_not_live_evidence');
  assert.equal(atlas.live_evidence_observed, false);
  assert.equal(atlas.profile_mode_catalog.some((entry) => entry.mode_class === 'evidence_lookup'), true);
  assert.equal(atlas.capability_catalog.some((entry) => entry.object_name === 'EvidencePacket'), true);
  assert.equal(atlas.tool_card_catalog.some((entry) => entry.tool_card_id === 'tool-result-envelope'), true);
  assert.equal(atlas.eval_suite_catalog.some((entry) => entry.rule_id === 'evidence_conflict'), true);
  assert.equal(atlas.limitation_catalog.some((entry) =>
    'claim_id' in entry && entry.claim_id === 'quality_verdict'
  ), true);
  assert.equal(atlas.authority_boundary.catalog_can_claim_live_evidence, false);
  assert.equal(atlas.authority_boundary.catalog_can_claim_owner_verdict, false);
  assert.equal(everyAuthorityFlagFalse(atlas.authority_boundary), true);

  assert.equal(
    consoleDrilldown.surface_kind,
    'opl_console_evidence_grounded_decision_agent_profile_drilldown',
  );
  assert.deepEqual(consoleDrilldown.trace_refs, ['trace-ref:fixture/evidence-profile']);
  assert.deepEqual(consoleDrilldown.evidence_trace.evidence_refs, ['evidence-ref:fixture/profile']);
  assert.deepEqual(consoleDrilldown.evidence_trace.source_refs, ['source-ref:fixture/profile']);
  assert.deepEqual(consoleDrilldown.evidence_trace.artifact_refs, ['artifact-ref:fixture/advisory-output']);
  assert.equal(consoleDrilldown.evidence_trace.source_body_read, false);
  assert.equal(consoleDrilldown.evidence_trace.artifact_body_read, false);
  assert.equal(
    consoleDrilldown.policy_status.evidence_grounding.status,
    'evidence_refs_observed_not_owner_verdict',
  );
  assert.equal(consoleDrilldown.next_safe_action.mutates, 'none_read_only');
  assert.equal(consoleDrilldown.next_safe_action.can_claim_owner_verdict, false);
  assert.equal(consoleDrilldown.authority_boundary.drilldown_reads_source_body, false);
  assert.equal(everyAuthorityFlagFalse(consoleDrilldown.authority_boundary), true);

  assert.equal(
    foundry.surface_kind,
    'opl_foundry_lab_evidence_grounded_decision_agent_profile_eval_surface',
  );
  assert.equal(foundry.surface_role, 'eval_promotion_suite_not_live_evidence');
  assert.equal(foundry.live_evidence_observed, false);
  assert.equal(foundry.eval_suite.mode_coverage.some((entry) => entry.mode_class === 'comparison'), true);
  assert.equal(
    foundry.eval_suite.fail_closed_coverage.every((entry) => entry.success_closeout_allowed === false),
    true,
  );
  assert.equal(
    foundry.independent_review_receipt_requirement.receipt_object,
    'IndependentReviewReceipt',
  );
  assert.equal(foundry.independent_review_receipt_requirement.receipt_ref_required, true);
  assert.equal(foundry.independent_review_receipt_requirement.receipt_body_required, false);
  assert.equal(foundry.independent_review_receipt_requirement.review_receipt_can_replace_owner_verdict, false);
  assert.equal(foundry.promotion_gate.independent_review_receipt_required, true);
  assert.equal(foundry.promotion_gate.review_receipt_can_replace_owner_verdict, false);
  assert.equal(foundry.promotion_gate.ref_promotion_gate_can_replace_owner_verdict, false);
  assert.equal(foundry.promotion_gate.can_promote_to_owner_receipt, false);
  assert.equal(foundry.promotion_gate.can_promote_to_production_ready, false);
  assert.equal(foundry.authority_boundary.eval_surface_can_claim_owner_verdict, false);
  assert.equal(everyAuthorityFlagFalse(foundry.authority_boundary), true);
});
