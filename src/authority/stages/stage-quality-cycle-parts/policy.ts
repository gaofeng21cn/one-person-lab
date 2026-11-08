import type { StageQualityAttemptRole, StageQualityCyclePolicy, StageQualityCycleState, StageQualityReviewDepth, StageQualityReviewVerdict, StageQualityRiskTier } from "./types.ts";
import { FrameworkContractError } from "../../../kernel/contract-validation.ts";
import { normalizeStageQualityScopeBudget } from ".././stage-quality-scope-budget.ts";
import { nonEmptyStrings, requiredText } from "./primitives.ts";

export function normalizeStageQualityCyclePolicy(value: unknown): StageQualityCyclePolicy {
  const input = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const refinement = typeof input.in_thread_refinement === 'object' && input.in_thread_refinement !== null
    ? input.in_thread_refinement as Record<string, unknown>
    : {};
  const review = typeof input.formal_review === 'object' && input.formal_review !== null
    ? input.formal_review as Record<string, unknown>
    : {};
  const riskTier = review.risk_tier ?? 'medium';
  const reviewDepth = review.review_depth ?? (riskTier === 'low' ? 'focused' : riskTier === 'high' ? 'multi_axis' : 'full');
  const maxRepairRounds = review.max_repair_rounds ?? 3;
  if (!['low', 'medium', 'high'].includes(String(riskTier))) {
    throw new FrameworkContractError('contract_shape_invalid', 'formal_review.risk_tier is invalid.', { risk_tier: riskTier });
  }
  if (!['focused', 'full', 'multi_axis'].includes(String(reviewDepth))) {
    throw new FrameworkContractError('contract_shape_invalid', 'formal_review.review_depth is invalid.', { review_depth: reviewDepth });
  }
  if (!Number.isInteger(maxRepairRounds) || Number(maxRepairRounds) < 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'formal_review.max_repair_rounds must be a non-negative integer.');
  }
  return {
    surface_kind: 'opl_stage_quality_cycle_policy',
    version: 'stage-quality-cycle-policy.v1',
    in_thread_refinement: {
      allowed: refinement.allowed !== false,
      authoritative: false,
    },
    formal_review: {
      required: review.required === true,
      risk_tier: riskTier as StageQualityRiskTier,
      review_depth: reviewDepth as StageQualityReviewDepth,
      attempt_internal_parallel_review_facets_allowed: riskTier === 'high',
      context_isolation_required: true,
      max_repair_rounds: Number(maxRepairRounds),
      scope_budget: normalizeStageQualityScopeBudget(review.scope_budget, {
        legacyMaxRepairRounds: Number(maxRepairRounds),
      }),
    },
    budget_exhaustion: 'complete_with_quality_debt_if_consumable',
  };
}

export function initialStageQualityCycleState(input: {
  stageRunId: string;
  qualityCycleId: string;
  maxRepairRounds?: number;
  scopeBudget?: unknown;
}): StageQualityCycleState {
  const maxRepairRounds = input.maxRepairRounds ?? 3;
  if (!Number.isInteger(maxRepairRounds) || maxRepairRounds < 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'maxRepairRounds must be a non-negative integer.');
  }
  return {
    surface_kind: 'opl_stage_quality_cycle_state',
    version: 'stage-quality-cycle-state.v1',
    stage_run_id: requiredText(input.stageRunId, 'stage_run_id'),
    quality_cycle_id: requiredText(input.qualityCycleId, 'quality_cycle_id'),
    max_repair_rounds: maxRepairRounds,
    repair_rounds_used: 0,
    current_role: 'producer',
    status: 'awaiting_producer',
    selected_artifact_refs: [],
    quality_debt_refs: [],
    quality_scope_budget: normalizeStageQualityScopeBudget(input.scopeBudget, {
      legacyMaxRepairRounds: maxRepairRounds,
    }),
    quality_scope_budget_usage: {
      attempts_used: 0,
      elapsed_ms: 0,
      tokens_used: null,
      token_observation_status: 'missing',
    },
    quality_scope_budget_stop_reason: null,
  };
}

export function reduceStageQualityCycleState(
  state: StageQualityCycleState,
  event:
    | { kind: 'producer_completed'; artifact_refs: string[] }
    | { kind: 'review_completed'; verdict: StageQualityReviewVerdict; quality_debt_refs?: string[] }
    | { kind: 'repair_completed'; artifact_refs: string[] }
    | { kind: 'hard_stop' },
): StageQualityCycleState {
  if (['passed', 'quality_debt', 'hard_stopped'].includes(state.status)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Terminal Stage quality cycle cannot consume another event.', {
      status: state.status,
    });
  }
  if (event.kind === 'producer_completed') {
    if (state.status !== 'awaiting_producer') {
      throw new FrameworkContractError('contract_shape_invalid', 'producer_completed is out of order.');
    }
    return { ...state, status: 'awaiting_review', current_role: 'reviewer', selected_artifact_refs: nonEmptyStrings(event.artifact_refs, 'artifact_refs') };
  }
  if (event.kind === 'repair_completed') {
    if (state.status !== 'awaiting_repair') {
      throw new FrameworkContractError('contract_shape_invalid', 'repair_completed is out of order.');
    }
    return {
      ...state,
      repair_rounds_used: state.repair_rounds_used + 1,
      status: 'awaiting_review',
      current_role: 're_reviewer',
      selected_artifact_refs: nonEmptyStrings(event.artifact_refs, 'artifact_refs'),
    };
  }
  if (event.kind === 'hard_stop' || event.verdict === 'hard_stop') {
    return { ...state, status: 'hard_stopped', current_role: null };
  }
  if (event.verdict === 'pass') {
    return { ...state, status: 'passed', current_role: null };
  }
  const debtRefs = nonEmptyStrings(event.quality_debt_refs ?? [], 'quality_debt_refs');
  if (event.verdict === 'quality_debt' || state.repair_rounds_used >= state.max_repair_rounds) {
    if (state.selected_artifact_refs.length === 0) {
      return { ...state, status: 'hard_stopped', current_role: null };
    }
    return { ...state, status: 'quality_debt', current_role: null, quality_debt_refs: debtRefs };
  }
  return { ...state, status: 'awaiting_repair', current_role: 'repairer', quality_debt_refs: debtRefs };
}

export function classifyCodexSessionContinuation(input: {
  attemptRole: StageQualityAttemptRole;
  resumedThreadId?: string | null;
}) {
  return input.resumedThreadId
    ? {
        continuation_kind: 'protocol_closeout_resume' as const,
        counts_as_review_attempt: false,
        consumes_quality_revision_budget: false,
      }
    : {
        continuation_kind: 'new_stage_attempt_thread' as const,
        counts_as_review_attempt: ['reviewer', 're_reviewer'].includes(input.attemptRole),
        consumes_quality_revision_budget: input.attemptRole === 'repairer',
      };
}
