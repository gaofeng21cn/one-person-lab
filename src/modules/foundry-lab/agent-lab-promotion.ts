import {
  assessIndependentAiReviewReceipt,
  type AgentLabIndependentAiReviewAssessment,
} from './agent-lab.ts';
import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';

export const AGENT_LAB_PROMOTION_AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  can_train_or_deploy_model_weights: false,
};

export const AUTOMATIC_DEFAULT_AGENT_PROMOTION_READY = 'risk_tiered_after_independent_ai_review';
export const MECHANISM_REF = 'mechanism:agent-lab/default-stage-led-agent-mechanism';
export const MECHANISM_VERSION = 'opl-agent-lab-mechanism.v1';
export const NEXT_MECHANISM_VERSION = 'opl-agent-lab-mechanism.v1.canary.1';
export const ROLLBACK_TARGET_REF = `mechanism-version-ref:${MECHANISM_VERSION}`;

export type AgentLabPromotionRiskTier = 'low_risk' | 'medium_risk' | 'high_risk';

const MECHANISM_RISK_TIERS = {
  low_risk: {
    examples: ['prompt wording', 'rubric clarification', 'workbench display metadata', 'suite metadata'],
    auto_promotion: 'auto_promote_to_stable',
    required_gates: [
      'independent_ai_review',
      'regression_suite_passed',
      'canary_observation',
      'no_forbidden_write_proof',
      'rollback_target_ref',
    ],
  },
  medium_risk: {
    examples: ['stage policy', 'tool policy', 'retry policy', 'dead-letter policy', 'memory retrieval policy'],
    auto_promotion: 'auto_promote_to_canary',
    required_gates: [
      'independent_ai_review',
      'regression_suite_passed',
      'canary_observation',
      'no_forbidden_write_proof',
      'rollback_target_ref',
    ],
  },
  high_risk: {
    examples: [
      'domain truth',
      'publication verdict',
      'fundability verdict',
      'visual quality verdict',
      'artifact mutation',
      'memory accept/reject',
      'credential policy',
      'network policy',
      'write policy',
    ],
    auto_promotion: 'blocked_route_owner_or_human_gate',
    required_gates: ['domain_owner_or_human_gate'],
  },
};

export function buildIndependentAiReviewReceipt(input: {
  mechanismRef?: string;
  mechanismVersion?: string;
  candidateRef?: string;
  riskTier?: AgentLabPromotionRiskTier;
  sourceRefs?: string[];
  receiptSource?: 'generated_fixture' | 'synthetic_fixture' | 'real_independent_ai_review' | string;
  assessmentMode?: 'generated_fixture' | 'synthetic_fixture' | 'real_independent_ai_review' | string;
} = {}) {
  const mechanismRef = input.mechanismRef ?? MECHANISM_REF;
  const mechanismVersion = input.mechanismVersion ?? MECHANISM_VERSION;
  const candidateRef = input.candidateRef ?? 'mechanism-candidate:agent-lab/default-stage-led-agent-mechanism/next';
  const riskTier = input.riskTier ?? 'medium_risk';
  const receiptSource = input.receiptSource ?? 'generated_fixture';
  const assessmentMode = input.assessmentMode ?? 'generated_fixture';
  const verdict = riskTier === 'high_risk'
    ? 'blocked_route_owner_or_human_gate'
    : 'approved_for_risk_tiered_auto_promotion';

  return {
    receipt_ref: stableId('oaliar', [mechanismRef, mechanismVersion, candidateRef, riskTier, input.sourceRefs ?? []]),
    receipt_kind: 'independent_ai_review_receipt_ref',
    receipt_source: receiptSource,
    assessment_mode: assessmentMode,
    reviewer_agent_ref: 'agent-ref:opl-agent-lab/independent-ai-reviewer',
    reviewed_mechanism_candidate_ref: candidateRef,
    review_context_inherits_executor_context: false,
    execution_attempt_ref: 'stage-attempt-ref:agent-lab/generated-fixture-execution',
    review_attempt_ref: 'stage-attempt-ref:agent-lab/generated-fixture-review',
    verdict,
    risk_tier: riskTier,
    source_refs: input.sourceRefs ?? [
      'contract:opl-framework/agent-lab-contract',
      'suite:opl-agent-lab-sample-suite',
      'suite:opl-agent-lab-longline-suite',
    ],
    reviewed_refs: [
      mechanismRef,
      mechanismVersion,
      candidateRef,
      'contract:opl-framework/agent-lab-contract',
      'no-forbidden-write:agent-lab/mechanism-policy',
    ],
    blocks_domain_truth_write: true,
    blocks_memory_body_write: true,
    blocks_artifact_mutation: true,
    blocks_owner_receipt_write: true,
  };
}

export type IndependentAiReviewReceiptInput =
  | ReturnType<typeof buildIndependentAiReviewReceipt>
  | Record<string, unknown>;

export function reviewReceiptRef(receipt: IndependentAiReviewReceiptInput) {
  return typeof receipt.receipt_ref === 'string'
    ? receipt.receipt_ref
    : 'independent-ai-review-receipt:missing';
}

function reviewReceiptVerdict(receipt: IndependentAiReviewReceiptInput) {
  return typeof receipt.verdict === 'string' ? receipt.verdict : null;
}

export function reviewReceiptFromRun(
  run: { mechanism_evolution_inputs?: unknown },
  fallback: ReturnType<typeof buildIndependentAiReviewReceipt>,
): IndependentAiReviewReceiptInput {
  const inputs = run.mechanism_evolution_inputs;
  if (isRecord(inputs) && isRecord(inputs.independent_ai_review_receipt)) {
    return inputs.independent_ai_review_receipt;
  }
  return fallback;
}

export function buildMechanismPromotionPolicy(
  independentReviewRef: string,
  independentAiReviewAssessment: AgentLabIndependentAiReviewAssessment = assessIndependentAiReviewReceipt(null),
) {
  return {
    policy_ref: 'mechanism-promotion-policy:agent-lab/risk-tiered-auto-promotion',
    automatic_mechanism_promotion_ready: independentAiReviewAssessment.ai_review_approved,
    default_mode: 'risk_tiered_auto_promotion_with_independent_ai_review',
    human_gate_default_required: false,
    risk_tiers: MECHANISM_RISK_TIERS,
    required_gate_refs: [
      independentReviewRef,
      'regression-suite:agent-lab/mechanism-promotion',
      'canary-observation-ref:agent-lab/mechanism-auto-promotion',
      'no-forbidden-write:agent-lab/mechanism-policy',
      ROLLBACK_TARGET_REF,
    ],
    high_risk_owner_or_human_gate_required: true,
    independent_ai_review_assessment: independentAiReviewAssessment,
    authority_boundary: AGENT_LAB_PROMOTION_AUTHORITY_BOUNDARY,
  };
}

export function buildMechanismVersionLedger(sourceRefs: string[] = []) {
  return {
    ledger_ref: stableId('oalmvl', [MECHANISM_REF, MECHANISM_VERSION, NEXT_MECHANISM_VERSION, sourceRefs]),
    current_version: MECHANISM_VERSION,
    candidate_version: NEXT_MECHANISM_VERSION,
    versions: [
      {
        version_ref: ROLLBACK_TARGET_REF,
        mechanism_version: MECHANISM_VERSION,
        status: 'stable',
        rollback_eligible: true,
      },
      {
        version_ref: `mechanism-version-ref:${NEXT_MECHANISM_VERSION}`,
        mechanism_version: NEXT_MECHANISM_VERSION,
        status: 'canary',
        rollback_eligible: true,
      },
    ],
  };
}

export function buildMechanismRollback(sourceRefs: string[] = []) {
  return {
    rollback_ref: stableId('oalmrb', [MECHANISM_REF, MECHANISM_VERSION, NEXT_MECHANISM_VERSION, sourceRefs]),
    rollback_target_ref: ROLLBACK_TARGET_REF,
    rollback_command_ref: 'command-ref:opl-agent-lab/mechanism-rollback',
    rollback_available: true,
    restores_version: MECHANISM_VERSION,
  };
}

export function buildMechanismPromotionDecision(input: {
  suiteStatus?: 'passed' | 'blocked';
  riskTier?: AgentLabPromotionRiskTier;
  independentReview?: IndependentAiReviewReceiptInput;
  independentAiReviewAssessment?: AgentLabIndependentAiReviewAssessment;
  promotionSafetyReady?: boolean;
  sourceRefs?: string[];
} = {}) {
  const suiteStatus = input.suiteStatus ?? 'passed';
  const riskTier = input.riskTier ?? 'medium_risk';
  const independentReview = input.independentReview ?? buildIndependentAiReviewReceipt({ riskTier });
  const independentAiReviewAssessment = input.independentAiReviewAssessment
    ?? assessIndependentAiReviewReceipt(independentReview);
  const gatesPassed = suiteStatus === 'passed'
    && riskTier !== 'high_risk'
    && input.promotionSafetyReady === true
    && independentAiReviewAssessment.ai_review_approved
    && reviewReceiptVerdict(independentReview) === 'approved_for_risk_tiered_auto_promotion';
  const promotionDecision = riskTier === 'high_risk'
    ? 'blocked_route_owner_or_human_gate'
    : gatesPassed
      ? MECHANISM_RISK_TIERS[riskTier].auto_promotion
      : independentAiReviewAssessment.review_status === 'review_pending'
        ? 'blocked_from_auto_promotion'
        : 'blocked';
  const promotedToStatus = promotionDecision === 'auto_promote_to_stable'
    ? 'stable'
    : promotionDecision === 'auto_promote_to_canary'
      ? 'canary'
      : 'blocked';

  return {
    automatic_mechanism_promotion_ready: gatesPassed,
    risk_tier: riskTier,
    promotion_decision: promotionDecision,
    independent_ai_review_ref: reviewReceiptRef(independentReview),
    independent_ai_review_assessment: independentAiReviewAssessment,
    promotion_receipt_ref: `mechanism-promotion-receipt:${stableId('oalmpr', [
      MECHANISM_REF,
      NEXT_MECHANISM_VERSION,
      promotionDecision,
      input.sourceRefs ?? [],
    ])}`,
    rollback_target_ref: ROLLBACK_TARGET_REF,
    canary: {
      required: riskTier !== 'high_risk',
      status: riskTier !== 'high_risk' && gatesPassed ? 'observed' : 'missing_or_not_required',
      observation_ref: 'canary-observation-ref:agent-lab/mechanism-auto-promotion',
    },
    high_risk_owner_or_human_gate_required: riskTier === 'high_risk',
    promoted_to_status: promotedToStatus,
    source_refs: input.sourceRefs ?? [],
    authority_boundary: AGENT_LAB_PROMOTION_AUTHORITY_BOUNDARY,
  };
}

export function buildMechanismPromotionReceipt(decision: ReturnType<typeof buildMechanismPromotionDecision>) {
  return {
    receipt_ref: decision.promotion_receipt_ref,
    receipt_kind: 'mechanism_promotion_receipt_ref',
    mechanism_ref: MECHANISM_REF,
    from_version: MECHANISM_VERSION,
    to_version: NEXT_MECHANISM_VERSION,
    risk_tier: decision.risk_tier,
    promotion_decision: decision.promotion_decision,
    promoted_to_status: decision.promoted_to_status,
    independent_ai_review_ref: decision.independent_ai_review_ref,
    rollback_target_ref: decision.rollback_target_ref,
    writes_domain_truth: false,
    writes_memory_body: false,
    mutates_artifact: false,
    writes_owner_receipt: false,
    trains_or_deploys_model_weights: false,
    authority_boundary: AGENT_LAB_PROMOTION_AUTHORITY_BOUNDARY,
  };
}
