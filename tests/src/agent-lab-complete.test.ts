import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';

import {
  buildAgentLabEvolutionResult,
  buildAgentLabOptimizeResult,
  buildAgentLabVariantComparisonReadModel,
} from '../../src/modules/foundry-lab/agent-lab-complete.ts';
import { buildSampleAgentLabSuite } from '../../src/modules/foundry-lab/agent-lab.ts';

const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agent-lab-complete-state-'));
const previousStateRoot = process.env.OPL_STATE_DIR;
process.env.OPL_STATE_DIR = stateRoot;
after(() => {
  if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
  else process.env.OPL_STATE_DIR = previousStateRoot;
  fs.rmSync(stateRoot, { recursive: true, force: true });
});

function independentReview(candidateRef: string, riskTier: 'low_risk' | 'medium_risk') {
  return {
    receipt_ref: `independent-ai-review-receipt:${candidateRef}`,
    receipt_source: 'real_independent_ai_review',
    assessment_mode: 'real_independent_ai_review',
    reviewer_ref: 'reviewer-ref:agent-lab/independent',
    reviewer_agent_ref: 'agent-ref:opl-agent-lab/independent-ai-reviewer',
    reviewed_mechanism_candidate_ref: candidateRef,
    execution_attempt_ref: `stage-attempt:executor:${candidateRef}`,
    review_attempt_ref: `stage-attempt:reviewer:${candidateRef}`,
    request_ref: `review-request-ref:${candidateRef}`,
    response_ref: `review-response-ref:${candidateRef}`,
    evidence_refs: [`review-evidence-ref:${candidateRef}`],
    no_shared_context: true,
    review_context_inherits_executor_context: false,
    forbidden_write_scan_ref: `no-forbidden-write-scan-ref:${candidateRef}`,
    verdict: 'approved_for_risk_tiered_auto_promotion',
    risk_tier: riskTier,
  };
}

function makePromotable(task: any, riskTier: 'low_risk' | 'medium_risk') {
  const candidateRef = task.improvement_candidate.candidate_ref;
  const failureDeltaRef = `failure-delta:${candidateRef}`;
  const review = independentReview(candidateRef, riskTier);
  return {
    ...task,
    improvement_candidate: {
      ...task.improvement_candidate,
      evidence_refs: [...task.improvement_candidate.evidence_refs, failureDeltaRef],
    },
    mechanism_evolution_inputs: {
      ...(task.mechanism_evolution_inputs ?? {}),
      independent_ai_review_receipt: review,
    },
    promotion_gate: {
      ...task.promotion_gate,
      failure_delta_refs: [failureDeltaRef],
      independent_ai_review_receipt_refs: [review.receipt_ref],
      promotion_receipt_refs: [`mechanism-promotion-receipt:${candidateRef}`],
      rollback_target_refs: [`mechanism-version-ref:${candidateRef}`],
      canary_observation_refs: [`canary-observation-ref:${candidateRef}`],
    },
  };
}

test('Agent Lab evolution stays refs-only and blocked without independent review', () => {
  const result = buildAgentLabEvolutionResult(buildSampleAgentLabSuite());

  assert.equal(result.surface_kind, 'opl_agent_lab_evolution_result');
  assert.equal(result.status, 'blocked_from_auto_promotion');
  assert.equal(result.mechanism_promotion_decision.independent_ai_review_assessment.review_status, 'review_pending');
  assert.equal(result.next_mechanism_candidate.default_promotion, false);
  assert.equal(result.meta_edit_receipt.writes_domain_truth, false);
  assert.equal(result.meta_edit_receipt.writes_memory_body, false);
  assert.equal(result.meta_edit_receipt.mutates_artifact, false);
  assert.equal(result.automatic_model_training_ready, false);
  assert.equal(result.authority_boundary.can_train_or_deploy_model_weights, false);
});

test('Agent Lab optimizer maps complete safety refs to one gated promotion candidate', () => {
  const suite = buildSampleAgentLabSuite();
  const candidateRef = suite.tasks[1].improvement_candidate.candidate_ref;
  suite.tasks[1] = makePromotable(suite.tasks[1], 'medium_risk');

  const result = buildAgentLabOptimizeResult(suite);
  const candidate = result.gated_optimizer_candidate_set.candidates.find((entry: any) =>
    entry.candidate_ref === candidateRef);

  assert.equal(result.status, 'gated_candidate_set_ready');
  assert.equal(result.gated_optimizer_candidate_set.auto_promotable_candidate_count, 1);
  assert.equal(candidate?.promotion_safety_assessment.safety_status, 'promotion_ready');
  assert.equal(candidate?.automatic_mechanism_promotion_ready, true);
  assert.equal(candidate?.promotion_decision, 'auto_promote_to_canary');
  assert.equal(result.authority_boundary.can_promote_default_agent_without_gate, false);
});

test('Agent Lab variant comparison only routes the selected winner to the promotion gate', () => {
  const suite = buildSampleAgentLabSuite();
  const firstCandidateRef = suite.tasks[0].improvement_candidate.candidate_ref;
  const selectedCandidateRef = suite.tasks[1].improvement_candidate.candidate_ref;
  suite.tasks[0] = makePromotable(suite.tasks[0], 'low_risk');
  suite.tasks[1] = makePromotable(suite.tasks[1], 'medium_risk');

  const comparison = buildAgentLabVariantComparisonReadModel({
    suiteResult: buildAgentLabOptimizeResult(suite).suite_result,
    selectedCandidateRef,
  });
  const selected = comparison.variants.find((entry: any) => entry.candidate_ref === selectedCandidateRef);
  const unselected = comparison.variants.find((entry: any) => entry.candidate_ref === firstCandidateRef);

  assert.deepEqual(comparison.promotion_eligibility.risk_tiered_promotion_gate_candidate_refs, [
    selectedCandidateRef,
  ]);
  assert.equal(selected?.role, 'winner');
  assert.equal(selected?.promotion_eligibility.eligible_for_risk_tiered_promotion_gate, true);
  assert.equal(unselected?.role, 'loser');
  assert.equal(unselected?.learning_only, true);
  assert.equal(unselected?.promotion_eligibility.eligible_for_risk_tiered_promotion_gate, false);
  assert.equal(comparison.promotion_eligibility.unselected_variants_can_authorize_domain_ready, false);
  assert.equal(comparison.promotion_eligibility.unselected_variants_can_promote_default_agent, false);
});
