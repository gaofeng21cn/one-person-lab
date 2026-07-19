import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export const STAGE_QUALITY_SCOPE_BUDGET_STOP_REASONS = [
  'max_attempts_exhausted',
  'max_elapsed_exhausted',
  'max_tokens_exhausted',
] as const;

export type StageQualityScopeBudgetStopReason =
  typeof STAGE_QUALITY_SCOPE_BUDGET_STOP_REASONS[number];

export type StageQualityScopeBudget = {
  surface_kind: 'opl_stage_quality_scope_budget';
  version: 'opl-stage-quality-scope-budget.v1';
  max_attempts: number;
  max_elapsed_ms: number;
  max_tokens: number;
  token_budget_requires_observed_usage: true;
  foreground_execution_must_use_managed_attempt: true;
};

export type StageQualityScopeBudgetUsage = {
  attempts_used: number;
  elapsed_ms: number;
  tokens_used: number | null;
};

export const DEFAULT_STAGE_QUALITY_SCOPE_MAX_ELAPSED_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_STAGE_QUALITY_SCOPE_MAX_TOKENS = 1_000_000;

export function aggregateStageQualityScopeTokenUsage(
  observations: Array<number | null | undefined>,
) {
  for (const observation of observations) {
    if (
      observation !== null
      && observation !== undefined
      && (!Number.isSafeInteger(observation) || observation < 0)
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage quality token observations must be non-negative safe integers when present.',
      );
    }
  }
  if (
    observations.length === 0
    || observations.some((observation) => observation === null || observation === undefined)
  ) {
    return {
      tokens_used: null,
      token_observation_status: 'missing' as const,
    };
  }
  const observed = observations as number[];
  return {
    tokens_used: observed.reduce((sum, observation) => sum + observation, 0),
    token_observation_status: 'observed' as const,
  };
}

function boundedInteger(value: unknown, field: string, minimum: number, maximum: number) {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `${field} must be an integer between ${minimum} and ${maximum}.`,
      { field, value: value ?? null },
    );
  }
  return Number(value);
}

export function normalizeStageQualityScopeBudget(
  value: unknown,
  options: { legacyMaxRepairRounds?: number } = {},
): StageQualityScopeBudget {
  if (value !== undefined && value !== null && (
    typeof value !== 'object' || Array.isArray(value)
  )) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'scope_budget must be an object when declared.',
    );
  }
  const input = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (
    input.surface_kind !== undefined
    && input.surface_kind !== 'opl_stage_quality_scope_budget'
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'scope_budget.surface_kind is unsupported.',
    );
  }
  if (
    input.version !== undefined
    && input.version !== 'opl-stage-quality-scope-budget.v1'
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'scope_budget.version is unsupported.',
    );
  }
  const legacyMaxRepairRounds = options.legacyMaxRepairRounds ?? 3;
  const maxAttempts = boundedInteger(
    input.max_attempts ?? legacyMaxRepairRounds,
    'scope_budget.max_attempts',
    0,
    3,
  );
  if (options.legacyMaxRepairRounds !== undefined && maxAttempts !== legacyMaxRepairRounds) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'scope_budget.max_attempts must equal formal_review.max_repair_rounds during v1 migration.',
      { max_attempts: maxAttempts, max_repair_rounds: legacyMaxRepairRounds },
    );
  }
  const maxElapsedMs = boundedInteger(
    input.max_elapsed_ms ?? DEFAULT_STAGE_QUALITY_SCOPE_MAX_ELAPSED_MS,
    'scope_budget.max_elapsed_ms',
    1,
    7 * 24 * 60 * 60 * 1000,
  );
  const maxTokens = boundedInteger(
    input.max_tokens ?? DEFAULT_STAGE_QUALITY_SCOPE_MAX_TOKENS,
    'scope_budget.max_tokens',
    1,
    10_000_000,
  );
  if (
    input.token_budget_requires_observed_usage !== undefined
    && input.token_budget_requires_observed_usage !== true
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Token budget enforcement requires observed usage and cannot infer missing telemetry.',
    );
  }
  if (
    input.foreground_execution_must_use_managed_attempt !== undefined
    && input.foreground_execution_must_use_managed_attempt !== true
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Foreground quality execution cannot bypass the managed StageAttempt budget.',
    );
  }
  return {
    surface_kind: 'opl_stage_quality_scope_budget',
    version: 'opl-stage-quality-scope-budget.v1',
    max_attempts: maxAttempts,
    max_elapsed_ms: maxElapsedMs,
    max_tokens: maxTokens,
    token_budget_requires_observed_usage: true,
    foreground_execution_must_use_managed_attempt: true,
  };
}

export function evaluateStageQualityScopeBudget(input: {
  budget: unknown;
  usage: StageQualityScopeBudgetUsage;
  openFindingPriorities: Array<'p0' | 'p1' | 'p2'>;
  hasConsumableArtifact: boolean;
}) {
  const budget = normalizeStageQualityScopeBudget(input.budget);
  const attemptsUsed = boundedInteger(input.usage.attempts_used, 'usage.attempts_used', 0, 1_000_000);
  const elapsedMs = boundedInteger(input.usage.elapsed_ms, 'usage.elapsed_ms', 0, Number.MAX_SAFE_INTEGER);
  const tokensUsed = input.usage.tokens_used === null
    ? null
    : boundedInteger(input.usage.tokens_used, 'usage.tokens_used', 0, Number.MAX_SAFE_INTEGER);
  const exhaustedReasons: StageQualityScopeBudgetStopReason[] = [];
  if (attemptsUsed >= budget.max_attempts) exhaustedReasons.push('max_attempts_exhausted');
  if (elapsedMs >= budget.max_elapsed_ms) exhaustedReasons.push('max_elapsed_exhausted');
  if (tokensUsed !== null && tokensUsed >= budget.max_tokens) exhaustedReasons.push('max_tokens_exhausted');
  const exhausted = exhaustedReasons.length > 0;
  const highPriorityOpen = input.openFindingPriorities.some((priority) => priority === 'p0' || priority === 'p1');
  const disposition = !exhausted
    ? 'continue'
    : !input.hasConsumableArtifact
      ? 'hard_stop_no_consumable_artifact'
      : highPriorityOpen
        ? 'route_back_or_human_owner'
        : 'complete_with_quality_debt';
  return {
    surface_kind: 'opl_stage_quality_scope_budget_evaluation' as const,
    version: 'opl-stage-quality-scope-budget-evaluation.v1' as const,
    status: exhausted ? 'exhausted' as const : 'available' as const,
    disposition,
    stop_reason: exhaustedReasons[0] ?? null,
    exhausted_reasons: exhaustedReasons,
    usage: {
      attempts_used: attemptsUsed,
      attempts_remaining: Math.max(0, budget.max_attempts - attemptsUsed),
      elapsed_ms: elapsedMs,
      elapsed_ms_remaining: Math.max(0, budget.max_elapsed_ms - elapsedMs),
      tokens_used: tokensUsed,
      tokens_remaining: tokensUsed === null ? null : Math.max(0, budget.max_tokens - tokensUsed),
      token_observation_status: tokensUsed === null ? 'missing' as const : 'observed' as const,
    },
    budget,
    authority_boundary: {
      framework_controls_attempt_budget: true,
      framework_can_issue_domain_quality_verdict: false,
      missing_token_telemetry_is_not_zero_usage: true,
    },
  };
}
