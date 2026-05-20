import {
  assessIndependentAiReviewReceipt,
  runAgentLabSuite,
  type AgentLabSuite,
} from './agent-lab.ts';
import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { buildAgentLabAheEvidenceReadModel } from './agent-lab-ahe-evidence.ts';
import {
  buildAgentLabLogDrivenMechanismCandidateReadModel,
} from './agent-lab-control-read-models.ts';
import {
  AUTOMATIC_DEFAULT_AGENT_PROMOTION_READY,
  buildIndependentAiReviewReceipt,
  buildMechanismPromotionDecision,
  reviewReceiptFromRun,
  reviewReceiptRef,
} from './agent-lab-promotion.ts';
import { buildAgentLabVariantComparisonReadModel } from './agent-lab-variant-comparison.ts';
import { stableId } from './family-runtime-ids.ts';

const AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  can_train_or_deploy_model_weights: false,
};

type AgentLabSuiteResult = ReturnType<typeof runAgentLabSuite>;

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function optimizerCandidates(results: AgentLabSuiteResult[]) {
  return results.flatMap((result) =>
    result.runs.map((run) => {
      const riskTier = run.improvement_candidate.candidate_kind === 'prompt' ? 'low_risk' : 'medium_risk';
      const independentReview = buildIndependentAiReviewReceipt({
        candidateRef: run.improvement_candidate.candidate_ref,
        riskTier,
        sourceRefs: [result.result_id, run.run_id, ...run.improvement_candidate.evidence_refs],
      });
      const reviewReceipt = reviewReceiptFromRun(run, independentReview);
      const independentAiReviewAssessment = assessIndependentAiReviewReceipt(reviewReceipt);
      const promotionDecision = buildMechanismPromotionDecision({
        suiteStatus: run.status,
        riskTier,
        independentReview: reviewReceipt,
        independentAiReviewAssessment,
        promotionSafetyReady: run.promotion_safety_assessment.automatic_mechanism_promotion_ready,
        sourceRefs: [result.result_id, run.run_id, run.promotion_gate.gate_ref],
      });
      const passedFixtureGate = run.status === 'passed' && run.promotion_gate.gate_status === 'passed';
      return {
        candidate_ref: run.improvement_candidate.candidate_ref,
        candidate_kind: run.improvement_candidate.candidate_kind,
        target_ref: run.improvement_candidate.target_ref,
        source_suite_id: result.suite_id,
        source_run_id: run.run_id,
        domain_id: run.domain_id,
        risk_tier: riskTier,
        evidence_refs: run.improvement_candidate.evidence_refs,
        source_refs: unique([
          result.result_id,
          run.run_id,
          ...run.improvement_candidate.evidence_refs,
          ...run.mechanism_evolution_input_refs,
        ]),
        mechanism_evolution_input_refs: run.mechanism_evolution_input_refs,
        allowed_change_scope: run.improvement_candidate.allowed_change_scope,
        promotion_gate_ref: run.improvement_candidate.promotion_gate_ref,
        gate_status: run.promotion_gate.gate_status,
        independent_ai_review_ref: reviewReceiptRef(reviewReceipt),
        independent_ai_review_receipt: reviewReceipt,
        independent_ai_review_assessment: independentAiReviewAssessment,
        promotion_safety_assessment: run.promotion_safety_assessment,
        promotion_decision: promotionDecision.promotion_decision,
        promotion_receipt_ref: promotionDecision.promotion_receipt_ref,
        rollback_target_ref: promotionDecision.rollback_target_ref,
        candidate_status: !passedFixtureGate
          ? 'blocked'
          : promotionDecision.automatic_mechanism_promotion_ready
            ? 'gated_candidate_ready'
            : run.promotion_safety_assessment.safety_status === 'regression_guard_only'
              ? 'regression_guard_only'
              : independentAiReviewAssessment.review_status,
        automatic_mechanism_promotion_ready: promotionDecision.automatic_mechanism_promotion_ready,
        authority_boundary: AUTHORITY_BOUNDARY,
      };
    }));
}

export function rlTransitionRefs(results: AgentLabSuiteResult[]) {
  return results.flatMap((result) =>
    result.runs.map((run) => ({
      transition_ref: stableId('oalrt', [
        result.suite_id,
        run.task_id,
        run.trajectory.trajectory_ref,
        run.scorecard.scorecard_ref,
        run.promotion_gate.gate_ref,
      ]),
      source_suite_id: result.suite_id,
      source_run_id: run.run_id,
      trajectory_ref: run.trajectory.trajectory_ref,
      run_ref: run.trajectory.run_ref,
      scorecard_ref: run.scorecard.scorecard_ref,
      reward_authority_ref: run.scorecard.scorecard_ref,
      promotion_gate_ref: run.promotion_gate.gate_ref,
      status: run.status === 'passed' ? 'transition_ref_ready' : 'blocked',
      can_train_or_deploy_model_weights: false,
      can_promote_default_agent_without_gate: false,
      authority_boundary: AUTHORITY_BOUNDARY,
    })));
}

export function buildAgentLabOptimizeResult(input: AgentLabSuite) {
  const suiteResult = runAgentLabSuite(input);
  const candidates = optimizerCandidates([suiteResult]);
  const transitions = rlTransitionRefs([suiteResult]);
  const aheEvidence = buildAgentLabAheEvidenceReadModel({
    suite: input,
    results: suiteResult.runs,
  });
  const variantComparison = buildAgentLabVariantComparisonReadModel({ suiteResult });
  const logDrivenCandidates = buildAgentLabLogDrivenMechanismCandidateReadModel([
    suiteResult.result_id,
    ...suiteResult.refs.mechanism_evolution_input_refs,
  ]);
  const autoPromotableCandidates = candidates.filter((candidate) =>
    candidate.automatic_mechanism_promotion_ready);
  const aiReviewApprovedCount = candidates.filter((candidate) =>
    candidate.independent_ai_review_assessment.ai_review_approved).length;
  const optimizeStatus = suiteResult.status !== 'passed'
    ? 'blocked'
    : autoPromotableCandidates.length > 0
      ? 'gated_candidate_set_ready'
      : candidates.some((candidate) => candidate.independent_ai_review_assessment.review_status === 'review_pending')
        ? 'review_pending'
        : 'blocked_from_auto_promotion';

  return {
    surface_kind: 'opl_agent_lab_optimize_result',
    version: 'opl-agent-lab.v1.optimize',
    optimize_id: stableId('oalo', [suiteResult.result_id, candidates, transitions]),
    status: optimizeStatus,
    suite_result: suiteResult,
    gated_optimizer_candidate_set: {
      candidate_count: candidates.length,
      promotable_candidate_count: candidates.filter((candidate) =>
        candidate.candidate_status === 'gated_candidate_ready').length,
      auto_promotable_candidate_count: autoPromotableCandidates.length,
      regression_guard_only_count: candidates.filter((candidate) =>
        candidate.candidate_status === 'regression_guard_only').length,
      ai_review_approved_count: aiReviewApprovedCount,
      candidates,
    },
    ahe_evidence: aheEvidence,
    variant_comparison: variantComparison,
    log_driven_mechanism_candidates: logDrivenCandidates,
    log_mined_candidate_refs: logDrivenCandidates.log_mined_candidate_refs,
    rl_transition_refs: {
      transition_count: transitions.length,
      transitions,
    },
    automatic_mechanism_promotion_ready: suiteResult.status === 'passed' && autoPromotableCandidates.length > 0,
    automatic_model_training_ready: false,
    automatic_default_agent_promotion_ready: AUTOMATIC_DEFAULT_AGENT_PROMOTION_READY,
    authority_boundary: AUTHORITY_BOUNDARY,
  };
}
