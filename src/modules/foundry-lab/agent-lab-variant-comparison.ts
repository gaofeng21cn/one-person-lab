import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from '../runway/family-runtime-ids.ts';

type AgentLabSuiteResult = {
  result_id: string;
  suite_id: string;
  status: 'passed' | 'blocked' | string;
  refs: {
    promotion_gate_refs?: string[];
    failure_delta_refs?: string[];
    mechanism_evolution_input_refs?: string[];
    [key: string]: unknown;
  };
  runs: Array<{
    run_id: string;
    status: 'passed' | 'blocked' | string;
    domain_id: string;
    failure_taxonomy: string[];
    improvement_candidate: {
      candidate_ref: string;
      candidate_kind: string;
      target_ref: string;
      evidence_refs: string[];
      promotion_gate_ref: string;
      allowed_change_scope: string;
    };
    promotion_gate: {
      gate_ref: string;
      gate_status: 'passed' | 'blocked' | string;
      regression_suite_refs: string[];
      failure_delta_refs?: string[];
      no_forbidden_write_proof_refs?: string[];
    };
    promotion_safety_assessment: {
      safety_status: string;
      risk_tier: 'low_risk' | 'medium_risk' | 'high_risk' | string;
      automatic_mechanism_promotion_ready: boolean;
      failure_delta_refs: string[];
      missing_required_refs: string[];
    };
    independent_ai_review_assessment: {
      review_status: string;
      ai_review_approved: boolean;
      receipt_ref: string | null;
    };
    mechanism_evolution_input_refs: string[];
    trajectory?: Record<string, unknown>;
  }>;
};

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function optionalRefs(values: string[] | undefined) {
  return unique(Array.isArray(values) ? values : []);
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function riskRank(riskTier: string) {
  if (riskTier === 'low_risk') {
    return 0;
  }
  if (riskTier === 'medium_risk') {
    return 1;
  }
  return 2;
}

function promotionEligible(run: AgentLabSuiteResult['runs'][number]) {
  return run.status === 'passed'
    && run.promotion_gate.gate_status === 'passed'
    && run.promotion_safety_assessment.automatic_mechanism_promotion_ready
    && run.independent_ai_review_assessment.ai_review_approved;
}

function variantRegressionCount(run: AgentLabSuiteResult['runs'][number]) {
  const missingRefs = run.promotion_safety_assessment.missing_required_refs.length;
  const failureTaxonomy = run.failure_taxonomy.length;
  const gateBlocked = run.promotion_gate.gate_status === 'blocked' ? 1 : 0;
  const safetyBlocked = run.promotion_safety_assessment.safety_status === 'promotion_blocked' ? 1 : 0;
  return missingRefs + failureTaxonomy + gateBlocked + safetyBlocked;
}

function variantSortKey(run: AgentLabSuiteResult['runs'][number]) {
  return [
    promotionEligible(run) ? 0 : 1,
    variantRegressionCount(run),
    riskRank(run.promotion_safety_assessment.risk_tier),
    run.improvement_candidate.candidate_ref,
  ] as const;
}

function compareVariants(
  left: AgentLabSuiteResult['runs'][number],
  right: AgentLabSuiteResult['runs'][number],
) {
  const leftKey = variantSortKey(left);
  const rightKey = variantSortKey(right);
  for (let index = 0; index < leftKey.length; index += 1) {
    const leftValue = leftKey[index];
    const rightValue = rightKey[index];
    if (leftValue < rightValue) {
      return -1;
    }
    if (leftValue > rightValue) {
      return 1;
    }
  }
  return 0;
}

export function buildAgentLabVariantComparisonReadModel(input: {
  suiteResult: AgentLabSuiteResult;
  selectedCandidateRef?: string;
  sourceRefs?: string[];
}) {
  const { suiteResult } = input;
  const sortedRuns = [...suiteResult.runs].sort(compareVariants);
  const selectedRun = input.selectedCandidateRef
    ? suiteResult.runs.find((run) => run.improvement_candidate.candidate_ref === input.selectedCandidateRef)
    : sortedRuns[0];
  const winnerRun = selectedRun ?? sortedRuns[0];
  const winnerCandidateRef = winnerRun?.improvement_candidate.candidate_ref ?? null;
  const variantRows = suiteResult.runs.map((run) => {
    const candidateRef = run.improvement_candidate.candidate_ref;
    const isWinner = candidateRef === winnerCandidateRef;
    const eligible = isWinner && promotionEligible(run);
    const evidenceDelta = {
      delta_ref: stableId('oalvcd', [
        suiteResult.result_id,
        candidateRef,
        run.improvement_candidate.evidence_refs,
        run.promotion_safety_assessment.failure_delta_refs,
      ]),
      added_evidence_refs: unique([
        ...run.improvement_candidate.evidence_refs,
        ...run.mechanism_evolution_input_refs,
        ...optionalRefs(run.promotion_gate.failure_delta_refs),
      ]),
      blocked_evidence_refs: run.status === 'passed'
        ? []
        : unique([
          ...run.failure_taxonomy.map((entry) => `failure-taxonomy-ref:${entry}`),
          ...run.promotion_safety_assessment.missing_required_refs.map((entry) =>
            `missing-required-ref:${entry}`),
        ]),
      learning_ref: `variant-learning-ref:${stableId('oalvcl', [suiteResult.result_id, candidateRef])}`,
      domain_truth_delta_written: false,
      memory_body_delta_written: false,
      artifact_delta_written: false,
    };
    const regressionCount = variantRegressionCount(run);
    const trace = optionalRecord(run.trajectory);
    const commandRefs = optionalRefs(trace.command_refs as string[] | undefined);
    const fileRefs = optionalRefs(trace.file_refs as string[] | undefined);
    const subagentRefs = optionalRefs(trace.subagent_refs as string[] | undefined);
    const worktreeRefs = optionalRefs(trace.worktree_refs as string[] | undefined);
    const testRefs = optionalRefs(trace.test_refs as string[] | undefined);
    const webSourceRefs = optionalRefs(trace.web_source_refs as string[] | undefined);
    const reviewerRefs = optionalRefs(trace.review_receipt_refs as string[] | undefined);
    const predictedFlipRefs = unique([
      ...run.promotion_safety_assessment.missing_required_refs.map((entry) =>
        `predicted-flip-ref:agent-lab/${candidateRef}/${entry}`),
      ...(regressionCount === 0 && !eligible
        ? [`predicted-flip-ref:agent-lab/${candidateRef}/needs-selected-winner-gate`]
        : []),
    ]);
    const riskRefs = unique([
      `risk-tier-ref:agent-lab/${run.promotion_safety_assessment.risk_tier}`,
      ...(run.independent_ai_review_assessment.ai_review_approved
        ? []
        : [`risk-ref:agent-lab/${candidateRef}/independent-ai-review-not-approved`]),
      ...(run.promotion_safety_assessment.safety_status === 'promotion_blocked'
        ? [`risk-ref:agent-lab/${candidateRef}/promotion-safety-blocked`]
        : []),
    ]);

    return {
      candidate_ref: candidateRef,
      role: isWinner ? 'winner' : 'loser',
      candidate_kind: run.improvement_candidate.candidate_kind,
      source_run_id: run.run_id,
      domain_id: run.domain_id,
      target_ref: run.improvement_candidate.target_ref,
      risk_tier: run.promotion_safety_assessment.risk_tier,
      promotion_gate_ref: run.promotion_gate.gate_ref,
      regression_count: regressionCount,
      evidence_delta: evidenceDelta,
      command_refs: commandRefs,
      file_refs: fileRefs,
      subagent_refs: subagentRefs,
      worktree_refs: worktreeRefs,
      test_refs: testRefs,
      web_source_refs: webSourceRefs,
      reviewer_refs: reviewerRefs,
      blocker_refs: evidenceDelta.blocked_evidence_refs,
      predicted_impact_refs: predictedFlipRefs.map((ref) =>
        ref.replace('predicted-flip-ref:', 'predicted-impact-ref:')),
      predicted_flip_refs: predictedFlipRefs,
      next_run_falsification_refs: unique([
        ...run.promotion_safety_assessment.missing_required_refs.map((entry) =>
          `next-run-falsification-ref:agent-lab/${candidateRef}/${entry}`),
        ...(regressionCount === 0 && !eligible
          ? [`next-run-falsification-ref:agent-lab/${candidateRef}/selected-winner-gate`]
          : []),
      ]),
      risk_refs: riskRefs,
      cost_duration: {
        estimate_ref: `cost-duration-estimate-ref:agent-lab/${candidateRef}`,
        estimate_basis: 'result_ref_and_regression_count_estimate_only',
        estimated_cost_units: commandRefs.length + fileRefs.length + regressionCount + 1,
        estimated_duration_minutes: 5 + (testRefs.length * 3) + (regressionCount * 2),
        actual_provider_usage_receipt_ref: null,
      },
      promotion_eligibility: {
        selected_for_risk_tiered_gate: isWinner,
        eligible_for_risk_tiered_promotion_gate: eligible,
        promotion_eligible: eligible,
        blocked_reason_refs: eligible
          ? []
          : unique([
            ...(isWinner ? [] : ['blocked-ref:agent-lab/unselected-variant-learning-only']),
            ...run.promotion_safety_assessment.missing_required_refs.map((entry) =>
              `blocked-ref:agent-lab/${entry}`),
            ...(run.independent_ai_review_assessment.ai_review_approved
              ? []
              : ['blocked-ref:agent-lab/independent-ai-review-not-approved']),
          ]),
        can_authorize_domain_ready: false,
        can_authorize_quality_verdict: false,
        can_mutate_artifact_body: false,
        can_promote_default_agent: false,
      },
      learning_only: !isWinner,
      authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
    };
  });
  const winner = variantRows.find((variant) => variant.role === 'winner') ?? null;
  const losers = variantRows.filter((variant) => variant.role === 'loser');

  return {
    surface_kind: 'opl_agent_lab_variant_comparison_read_model',
    version: 'opl-agent-lab.v1.variant-comparison',
    read_model_id: stableId('oalvc', [
      suiteResult.result_id,
      variantRows.map((variant) => variant.candidate_ref),
      winnerCandidateRef,
      input.sourceRefs ?? [],
    ]),
    status: winner?.promotion_eligibility.eligible_for_risk_tiered_promotion_gate
      ? 'winner_selected_for_risk_tiered_gate'
      : 'winner_selected_learning_or_blocked',
    refs_only: true,
    source_refs: unique([
      suiteResult.result_id,
      ...optionalRefs(suiteResult.refs.promotion_gate_refs),
      ...optionalRefs(suiteResult.refs.failure_delta_refs),
      ...optionalRefs(suiteResult.refs.mechanism_evolution_input_refs),
      ...(input.sourceRefs ?? []),
    ]),
    variant_candidate_refs: variantRows.map((variant) => variant.candidate_ref),
    selected_candidate_ref: winnerCandidateRef,
    winner_candidate_ref: winnerCandidateRef,
    loser_candidate_refs: losers.map((variant) => variant.candidate_ref),
    variants: variantRows,
    per_variant_evidence_delta: variantRows.map((variant) => ({
      candidate_ref: variant.candidate_ref,
      ...variant.evidence_delta,
    })),
    predicted_flip_refs: unique(variantRows.flatMap((variant) => variant.predicted_flip_refs)),
    risk_refs: unique(variantRows.flatMap((variant) => variant.risk_refs)),
    regression_count: variantRows.reduce((total, variant) => total + variant.regression_count, 0),
    promotion_eligibility: {
      risk_tiered_promotion_gate_candidate_refs: winner?.promotion_eligibility.eligible_for_risk_tiered_promotion_gate
        && winnerCandidateRef
        ? [winnerCandidateRef]
        : [],
      learning_only_candidate_refs: losers.map((variant) => variant.candidate_ref),
      unselected_variants_can_authorize_domain_ready: false,
      unselected_variants_can_promote_default_agent: false,
      selected_winner_required_for_existing_promotion_gate: true,
    },
    summary: {
      variant_count: variantRows.length,
      loser_count: losers.length,
      promotion_eligible_winner_count: winner?.promotion_eligibility.eligible_for_risk_tiered_promotion_gate ? 1 : 0,
      learning_only_count: losers.length,
      regression_count: variantRows.reduce((total, variant) => total + variant.regression_count, 0),
    },
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}
