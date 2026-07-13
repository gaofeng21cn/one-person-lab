import { isRecord } from '../../kernel/contract-validation.ts';
import {
  stringValue,
  uniqueStringList,
} from '../../kernel/json-record.ts';
import {
  taskRetryBudgetMaxAttemptsValue,
  taskRetryBudgetProjection,
} from './family-runtime-queue-projection-boundary.ts';

type JsonRecord = Record<string, unknown>;

export type StageAttemptUsageProjection = ReturnType<typeof buildStageAttemptUsageProjection>;
export type StageAttemptUsageSummary = ReturnType<typeof summarizeStageAttemptUsageProjections>;
export type ModelRouteCostProjection = ReturnType<typeof buildModelRouteCostProjection>;
export type ModelRouteCostProjectionSummary = ReturnType<typeof summarizeModelRouteCostProjections>;

type StageAttemptUsageInput = {
  stageAttemptId: string;
  projectionScope?: string;
  status: string;
  blockedReason?: string | null;
  executorKind?: string | null;
  retryBudget: JsonRecord;
  attemptCount: number;
  providerRun: JsonRecord;
  activityEvents: unknown[];
  routeImpact: JsonRecord;
  usageObservation?: JsonRecord | null;
};

type ModelRouteCostProjectionInput = StageAttemptUsageInput & {
  usageProjection: StageAttemptUsageProjection;
};

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function uniqueStrings(values: string[]) {
  return uniqueStringList(values);
}

function refsFromUnknown(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(refsFromUnknown);
  }
  if (isRecord(value)) {
    return [
      stringValue(value.session_ref),
      stringValue(value.usage_ref),
      stringValue(value.source_ref),
      stringValue(value.ref),
      stringValue(value.ref_id),
    ].filter((ref): ref is string => Boolean(ref));
  }
  return [];
}

function usageRefs(usage: JsonRecord) {
  const nestedCost = usageRecord(usage.cost_summary);
  return uniqueStrings([
    ...refsFromUnknown(usage.source_ref),
    ...refsFromUnknown(usage.usage_ref),
    ...refsFromUnknown(usage.usage_refs),
    ...refsFromUnknown(usage.session_usage_refs),
    ...refsFromUnknown(nestedCost.usage_ref),
    ...refsFromUnknown(nestedCost.source_ref),
    ...refsFromUnknown(nestedCost.usage_refs),
    ...refsFromUnknown(nestedCost.session_usage_refs),
  ]);
}

function addNullableTokenField(current: number | null, value: number | null, observedCount: number) {
  if (value === null || (observedCount > 0 && current === null)) return null;
  return (observedCount === 0 ? 0 : current!) + value;
}

function msBetween(startedAt: unknown, completedAt: unknown) {
  const started = stringValue(startedAt);
  const completed = stringValue(completedAt);
  if (!started || !completed) {
    return null;
  }
  const durationMs = Date.parse(completed) - Date.parse(started);
  return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : null;
}

function tokenUsage(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  return {
    input_tokens: numberValue(value.input_tokens),
    cached_input_tokens: numberValue(value.cached_input_tokens),
    output_tokens: numberValue(value.output_tokens),
    reasoning_output_tokens: numberValue(value.reasoning_output_tokens),
    total_tokens: numberValue(value.total_tokens),
  };
}

function usageStatus(usage: JsonRecord, nestedCost: JsonRecord) {
  return firstString(
    usage.cost_status,
    usage.usage_status,
    usage.telemetry_status,
    nestedCost.cost_status,
    nestedCost.usage_status,
    nestedCost.telemetry_status,
  );
}

function isUnreportedUsageStatus(status: string | null) {
  const normalized = status?.trim().toLowerCase() ?? '';
  return normalized === 'missing'
    || normalized.includes('unreported')
    || normalized.startsWith('not_measured');
}

function isZeroTokenUsage(tokens: ReturnType<typeof tokenUsage>) {
  return Boolean(
    tokens
      && tokens.input_tokens === 0
      && tokens.output_tokens === 0
      && tokens.total_tokens === 0
  );
}

function usageRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function hasUsageFields(value: JsonRecord) {
  const costSummary = usageRecord(value.cost_summary);
  return Boolean(
    value.usage_ref
    || value.token_usage
    || value.estimated_cost_usd
    || value.api_call_count
    || value.duration_ms
    || value.cadence_ref
    || costSummary.token_usage
    || costSummary.estimated_cost_usd
    || value.usage_status
    || value.telemetry_status
    || value.missing_reason
    || costSummary.usage_status
    || costSummary.telemetry_status
    || costSummary.missing_reason,
  );
}

function usageAuthorityBoundary() {
  return {
    opl: 'observed_usage_budget_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
    executor: 'executor_selection_owner_external_to_usage_projection',
    can_change_executor: false,
    can_auto_degrade: false,
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    provider_completion_is_domain_ready: false,
  };
}

function modelRouteCostAuthorityBoundary() {
  return {
    opl: 'model_route_cost_observability_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
    executor: 'executor_selection_owner_external_to_route_cost_projection',
    can_change_executor: false,
    can_auto_degrade: false,
    can_replace_quality_gate: false,
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    provider_completion_is_domain_ready: false,
  };
}

function firstString(...values: unknown[]) {
  return values.map(stringValue).find((value): value is string => Boolean(value)) ?? null;
}

function firstRecord(...values: unknown[]) {
  return values.find(isRecord) ?? {};
}

function refsFromRouteUnknown(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  if (Array.isArray(value)) {
    return value.flatMap(refsFromRouteUnknown);
  }
  if (isRecord(value)) {
    return [
      stringValue(value.ref),
      stringValue(value.ref_id),
      stringValue(value.path),
      stringValue(value.uri),
      stringValue(value.route_ref),
      stringValue(value.model_ref),
      stringValue(value.executor_route_ref),
    ].filter((ref): ref is string => Boolean(ref));
  }
  return [];
}

function refsFromKeys(record: JsonRecord, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => refsFromRouteUnknown(record[key])));
}

function modelRouteRecord(input: StageAttemptUsageInput) {
  return firstRecord(input.routeImpact.model_route, input.providerRun.model_route);
}

function retryPressureStatus(input: StageAttemptUsageInput, maxAttempts: number | null) {
  if (input.status === 'dead_lettered' && input.blockedReason === 'retry_budget_exhausted') {
    return 'retry_budget_exhausted';
  }
  if (maxAttempts === null) {
    return 'retry_budget_unknown';
  }
  if (input.attemptCount >= maxAttempts) {
    return 'retry_budget_exhausted';
  }
  if (input.attemptCount + 1 >= maxAttempts) {
    return 'retry_budget_pressure';
  }
  return 'retry_budget_available';
}

export function buildModelRouteCostProjection(input: ModelRouteCostProjectionInput) {
  const route = modelRouteRecord(input);
  const selectedModelRef = firstString(
    route.selected_model_ref,
    route.model_ref,
    input.routeImpact.selected_model_ref,
    input.providerRun.selected_model_ref,
  );
  const selectedModel = firstString(
    route.selected_model,
    route.model,
    route.model_name,
    input.routeImpact.selected_model,
    input.providerRun.selected_model,
  );
  const executorRouteRefs = refsFromKeys(route, [
    'executor_route_ref',
    'executor_route_refs',
  ]);
  const routeRefs = refsFromKeys(route, [
    'route_ref',
    'route_refs',
    'model_route_ref',
    'model_route_refs',
  ]);
  const reasonRefs = refsFromKeys(route, [
    'route_reason_ref',
    'route_reason_refs',
    'reason_ref',
    'reason_refs',
  ]);
  const tierRefs = refsFromKeys(route, [
    'route_tier_ref',
    'route_tier_refs',
    'tier_ref',
    'tier_refs',
  ]);
  const fallbackRefs = refsFromKeys(route, [
    'fallback_ref',
    'fallback_refs',
    'fallback_route_ref',
    'fallback_route_refs',
  ]);
  const routeObserved = Boolean(
    selectedModelRef
    || selectedModel
    || executorRouteRefs.length > 0
    || routeRefs.length > 0
    || reasonRefs.length > 0
    || tierRefs.length > 0
    || fallbackRefs.length > 0,
  );
  const tokenObserved = Number(input.usageProjection.token.observed_count) > 0;
  const costObserved = Number(input.usageProjection.cost.observed_count) > 0;
  const routeSourceRef = `stage_attempt:${input.stageAttemptId}#route_impact.model_route`;
  const sourceRefs = uniqueStrings([
    ...(routeObserved ? [routeSourceRef] : []),
    ...(isRecord(input.providerRun.model_route) ? [`stage_attempt:${input.stageAttemptId}#provider_run.model_route`] : []),
    ...routeRefs,
    ...executorRouteRefs,
    ...reasonRefs,
    ...tierRefs,
    ...fallbackRefs,
    ...input.usageProjection.token.source_refs,
    ...input.usageProjection.cost.source_refs,
  ]);

  return {
    surface_kind: 'opl_model_route_cost_projection',
    projection_scope: input.projectionScope ?? 'stage_attempt',
    availability: routeObserved
      ? tokenObserved || costObserved
        ? 'model_route_cost_observed'
        : 'model_route_observed_usage_unlinked'
      : 'model_route_unavailable',
    selected_model: {
      model_ref: selectedModelRef,
      model: selectedModel,
    },
    selected_executor: {
      executor_kind: input.executorKind ?? firstString(route.executor_kind, input.providerRun.executor_kind),
      route_refs: executorRouteRefs,
    },
    route: {
      route_refs: routeRefs,
      reason: firstString(route.route_reason, route.reason),
      reason_refs: reasonRefs,
      tier: firstString(route.route_tier, route.tier),
      tier_refs: tierRefs,
      fallback_refs: fallbackRefs,
    },
    observed_usage_linkage: {
      telemetry_status: tokenObserved || costObserved ? 'observed' : 'missing',
      usage_projection_ref: `/stage_attempt_workbench/attempts/${input.stageAttemptId}/usage_projection`,
      token: {
        observed_count: input.usageProjection.token.observed_count,
        input_tokens_observed: input.usageProjection.token.input_tokens_observed,
        cached_input_tokens_observed: input.usageProjection.token.cached_input_tokens_observed,
        output_tokens_observed: input.usageProjection.token.output_tokens_observed,
        reasoning_output_tokens_observed: input.usageProjection.token.reasoning_output_tokens_observed,
        total_tokens_observed: input.usageProjection.token.total_tokens_observed,
        source_refs: input.usageProjection.token.source_refs,
      },
      cost: {
        observed_count: input.usageProjection.cost.observed_count,
        estimated_cost_usd_observed: input.usageProjection.cost.estimated_cost_usd_observed,
        source_refs: input.usageProjection.cost.source_refs,
      },
    },
    source_refs: sourceRefs,
    authority_boundary: modelRouteCostAuthorityBoundary(),
  };
}

function usageInputs(input: StageAttemptUsageInput) {
  const authoritativeUsage = usageRecord(input.usageObservation);
  if (Object.keys(authoritativeUsage).length > 0) {
    return [
      {
        ref: `stage_attempt:${input.stageAttemptId}#usage_observation`,
        usage: authoritativeUsage,
        token_authority: true,
      },
      {
        ref: `stage_attempt:${input.stageAttemptId}#provider_run`,
        usage: input.providerRun,
        token_authority: false,
      },
    ].filter((entry) => hasUsageFields(entry.usage));
  }
  const providerUsage = usageRecord(input.providerRun.usage_projection);
  const activityEvents = input.activityEvents.filter(isRecord);
  const routeUsage = usageRecord(input.routeImpact.usage_projection);
  return [
    { ref: `stage_attempt:${input.stageAttemptId}#provider_run`, usage: input.providerRun, token_authority: true },
    { ref: `stage_attempt:${input.stageAttemptId}#provider_run.usage_projection`, usage: providerUsage, token_authority: true },
    ...activityEvents.map((event, index) => ({
      ref: `stage_attempt:${input.stageAttemptId}#activity_events[${index}]`,
      usage: event,
      token_authority: true,
    })),
    { ref: `stage_attempt:${input.stageAttemptId}#route_impact.usage_projection`, usage: routeUsage, token_authority: true },
  ].filter((entry) => hasUsageFields(entry.usage));
}

export function buildStageAttemptUsageProjection(input: StageAttemptUsageInput) {
  const sourceRefs = [`stage_attempt:${input.stageAttemptId}#retry_budget`];
  const inputEntries = usageInputs(input);
  const tokenSourceRefs: string[] = [];
  const costSourceRefs: string[] = [];
  const apiCallSourceRefs: string[] = [];
  const durationSourceRefs: string[] = [];
  const cadenceRefs = stringValue(input.retryBudget.cadence_ref) ? [stringValue(input.retryBudget.cadence_ref)!] : [];
  const cadenceSourceRefs = cadenceRefs.length > 0 ? [`stage_attempt:${input.stageAttemptId}#retry_budget`] : [];
  let inputTokens: number | null = null;
  let cachedInputTokens: number | null = null;
  let outputTokens: number | null = null;
  let reasoningOutputTokens: number | null = null;
  let totalTokens: number | null = null;
  let tokenObservedCount = 0;
  let estimatedCostUsd = 0;
  let costObservedCount = 0;
  let apiCallCount = 0;
  let apiCallObservedCount = 0;
  let durationMs = 0;
  let durationObservedCount = 0;
  const missingUsageReasons: string[] = [];

  const providerDurationMs = msBetween(input.providerRun.started_at, input.providerRun.completed_at);
  if (providerDurationMs !== null) {
    durationMs += providerDurationMs;
    durationObservedCount += 1;
    durationSourceRefs.push(`stage_attempt:${input.stageAttemptId}#provider_run.duration`);
  }

  for (const entry of inputEntries) {
    sourceRefs.push(entry.ref);
    const usage = entry.usage;
    const nestedCost = usageRecord(usage.cost_summary);
    const tokens = tokenUsage(usage.token_usage) ?? tokenUsage(nestedCost.token_usage);
    const status = usageStatus(usage, nestedCost);
    const missingReason = firstString(
      usage.missing_reason,
      usage.missing_usage_telemetry_reason,
      nestedCost.missing_reason,
      nestedCost.missing_usage_telemetry_reason,
    );
    if (missingReason) {
      missingUsageReasons.push(missingReason);
    }
    const unreportedZeroUsage = isUnreportedUsageStatus(status) && isZeroTokenUsage(tokens);
    const entryUsageRefs = usageRefs(usage);
    sourceRefs.push(...entryUsageRefs);
    const hasObservedTokens = Boolean(
      tokens
      && (tokens.input_tokens !== null || tokens.output_tokens !== null || tokens.total_tokens !== null),
    );
    if (entry.token_authority && tokens && hasObservedTokens && !unreportedZeroUsage) {
      const tokenRefs = entryUsageRefs.length > 0 ? entryUsageRefs : [entry.ref];
      inputTokens = addNullableTokenField(inputTokens, tokens.input_tokens, tokenObservedCount);
      cachedInputTokens = addNullableTokenField(cachedInputTokens, tokens.cached_input_tokens, tokenObservedCount);
      outputTokens = addNullableTokenField(outputTokens, tokens.output_tokens, tokenObservedCount);
      reasoningOutputTokens = addNullableTokenField(
        reasoningOutputTokens,
        tokens.reasoning_output_tokens,
        tokenObservedCount,
      );
      totalTokens = addNullableTokenField(totalTokens, tokens.total_tokens, tokenObservedCount);
      tokenSourceRefs.push(...tokenRefs);
      tokenObservedCount += 1;
    }
    const cost = numberValue(usage.estimated_cost_usd) ?? numberValue(nestedCost.estimated_cost_usd);
    if (cost !== null && !(isUnreportedUsageStatus(status) && cost === 0)) {
      estimatedCostUsd += cost;
      costObservedCount += 1;
      costSourceRefs.push(entry.ref);
    }
    const calls = numberValue(usage.api_call_count);
    if (calls !== null) {
      apiCallCount += calls;
      apiCallObservedCount += 1;
      apiCallSourceRefs.push(entry.ref);
    }
    const observedDurationMs = numberValue(usage.duration_ms);
    if (observedDurationMs !== null) {
      durationMs += observedDurationMs;
      durationObservedCount += 1;
      durationSourceRefs.push(entry.ref);
    }
    const cadenceRef = stringValue(usage.cadence_ref);
    if (cadenceRef) {
      cadenceRefs.push(cadenceRef);
      cadenceSourceRefs.push(entry.ref);
    }
  }

  const maxAttempts = numberValue(taskRetryBudgetMaxAttemptsValue(input.retryBudget));
  const remainingAttempts = maxAttempts === null ? null : Math.max(0, maxAttempts - input.attemptCount);
  const pressureStatus = retryPressureStatus(input, maxAttempts);
  const hasObservedResourceUsage =
    tokenObservedCount + costObservedCount + apiCallObservedCount + durationObservedCount > 0;
  const retryBudgetObserved = Object.keys(input.retryBudget).length > 0;
  const observationStatus = stringValue(input.usageObservation?.telemetry_status);
  const telemetryStatus = observationStatus === 'observed'
    || observationStatus === 'partial'
    || observationStatus === 'missing'
    || observationStatus === 'stale'
    ? observationStatus
    : hasObservedResourceUsage ? 'observed' : 'missing';
  const authoritativeMissingReason = stringValue(input.usageObservation?.missing_reason);
  const authoritativeSourceRef = stringValue(input.usageObservation?.source_ref);
  const authoritativeObservedAt = stringValue(input.usageObservation?.observed_at);

  return {
    surface_kind: 'opl_stage_attempt_usage_projection',
    projection_scope: input.projectionScope ?? 'stage_attempt',
    availability: hasObservedResourceUsage
      ? 'usage_observed'
      : retryBudgetObserved
        ? 'retry_budget_observed'
        : 'usage_unavailable',
    telemetry_status: telemetryStatus,
    source_ref: authoritativeSourceRef,
    observed_at: authoritativeObservedAt,
    missing_usage_telemetry_reason: telemetryStatus === 'observed'
      ? null
      : authoritativeMissingReason
        ?? uniqueStrings(missingUsageReasons)[0]
        ?? 'no_stage_attempt_usage_telemetry_observed',
    token: {
      observed_count: tokenObservedCount,
      input_tokens_observed: tokenObservedCount > 0 ? inputTokens : null,
      cached_input_tokens_observed: tokenObservedCount > 0 ? cachedInputTokens : null,
      output_tokens_observed: tokenObservedCount > 0 ? outputTokens : null,
      reasoning_output_tokens_observed: tokenObservedCount > 0 ? reasoningOutputTokens : null,
      total_tokens_observed: tokenObservedCount > 0 ? totalTokens : null,
      source_refs: uniqueStrings(tokenSourceRefs),
    },
    cost: {
      observed_count: costObservedCount,
      estimated_cost_usd_observed: costObservedCount > 0 ? Number(estimatedCostUsd.toFixed(6)) : null,
      source_refs: uniqueStrings(costSourceRefs),
    },
    api_calls: {
      observed_count: apiCallObservedCount,
      count_observed: apiCallObservedCount > 0 ? apiCallCount : null,
      source_refs: uniqueStrings(apiCallSourceRefs),
    },
    duration: {
      observed_count: durationObservedCount,
      duration_ms_observed: durationObservedCount > 0 ? durationMs : null,
      source_refs: uniqueStrings(durationSourceRefs),
    },
    cadence: {
      observed_count: uniqueStrings(cadenceRefs).length,
      cadence_refs: uniqueStrings(cadenceRefs),
      source_refs: uniqueStrings(cadenceSourceRefs),
    },
    retry_budget: {
      observed_count: Object.keys(input.retryBudget).length > 0 ? 1 : 0,
      ...taskRetryBudgetProjection(maxAttempts),
      used_attempts: input.attemptCount,
      remaining_attempts: remainingAttempts,
      cadence_ref: stringValue(input.retryBudget.cadence_ref),
      pressure_status: pressureStatus,
    },
    source_refs: uniqueStrings(sourceRefs),
    authority_boundary: usageAuthorityBoundary(),
  };
}

export function summarizeStageAttemptUsageProjections(
  projections: StageAttemptUsageProjection[],
  projectionScope = 'stage_attempt_workbench',
) {
  const sourceRefs = uniqueStrings(projections.flatMap((projection) => projection.source_refs));
  const tokenProjectionBySource = new Map<string, StageAttemptUsageProjection>();
  projections.forEach((projection, index) => {
    const key = projection.source_ref
      ? `authoritative:${projection.source_ref}`
      : `stage_attempt_projection:${index}`;
    if (!tokenProjectionBySource.has(key)) tokenProjectionBySource.set(key, projection);
  });
  const tokenProjections = [...tokenProjectionBySource.values()];
  const tokenObservedCount = tokenProjections.reduce(
    (count, projection) => count + projection.token.observed_count,
    0,
  );
  const costObservedCount = projections.reduce((count, projection) => count + projection.cost.observed_count, 0);
  const apiCallObservedCount = projections.reduce((count, projection) => count + projection.api_calls.observed_count, 0);
  const durationObservedCount = projections.reduce((count, projection) => count + projection.duration.observed_count, 0);
  const resourceObserved = projections.filter((projection) =>
    projection.token.observed_count
    + projection.cost.observed_count
    + projection.api_calls.observed_count > 0
  );
  const retryPressure = projections.filter((projection) =>
    ['retry_budget_pressure', 'retry_budget_exhausted'].includes(projection.retry_budget.pressure_status)
  );
  const telemetryStatuses = projections.map((projection) => projection.telemetry_status);
  const telemetryStatus = projections.length === 0
    ? 'missing'
    : telemetryStatuses.every((status) => status === 'observed')
      ? 'observed'
      : telemetryStatuses.every((status) => status === 'stale')
        ? 'stale'
        : telemetryStatuses.every((status) => status === 'missing')
          ? 'missing'
          : 'partial';
  const missingReasons = uniqueStrings(
    projections
      .map((projection) => projection.missing_usage_telemetry_reason)
      .filter((reason): reason is string => Boolean(reason)),
  );
  const observedAt = projections
    .map((projection) => projection.observed_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
  const summedTokenField = (field: keyof StageAttemptUsageProjection['token']) => {
    const observed = tokenProjections.filter((projection) => projection.token.observed_count > 0);
    if (observed.length === 0) return null;
    const values = observed.map((projection) => projection.token[field]);
    if (values.some((value) => typeof value !== 'number')) return null;
    return (values as number[]).reduce((total, value) => total + value, 0);
  };
  return {
    surface_kind: 'opl_stage_attempt_usage_projection_summary',
    projection_scope: projectionScope,
    telemetry_status: telemetryStatus,
    source_ref: projections.length === 1 ? projections[0]?.source_ref ?? null : null,
    observed_at: observedAt,
    missing_usage_telemetry_reason: telemetryStatus === 'observed'
      ? null
      : missingReasons[0] ?? 'no_stage_attempt_usage_telemetry_observed',
    missing_usage_telemetry_reasons: missingReasons,
    attempt_count: projections.length,
    observed_attempt_count: projections.filter((projection) => projection.source_refs.length > 0).length,
    resource_usage_observed_attempt_count: resourceObserved.length,
    retry_pressure_attempt_count: retryPressure.length,
    retry_budget_exhausted_count: projections.filter((projection) =>
      projection.retry_budget.pressure_status === 'retry_budget_exhausted'
    ).length,
    retry_budget_unknown_count: projections.filter((projection) =>
      projection.retry_budget.pressure_status === 'retry_budget_unknown'
    ).length,
    source_ref_count: sourceRefs.length,
    token: {
      observed_count: tokenObservedCount,
      input_tokens_observed: summedTokenField('input_tokens_observed'),
      cached_input_tokens_observed: summedTokenField('cached_input_tokens_observed'),
      output_tokens_observed: summedTokenField('output_tokens_observed'),
      reasoning_output_tokens_observed: summedTokenField('reasoning_output_tokens_observed'),
      total_tokens_observed: summedTokenField('total_tokens_observed'),
    },
    cost: {
      observed_count: costObservedCount,
      estimated_cost_usd_observed: costObservedCount > 0
        ? Number(projections.reduce((count, projection) =>
            count + (projection.cost.estimated_cost_usd_observed ?? 0), 0
          ).toFixed(6))
        : null,
    },
    api_calls: {
      observed_count: apiCallObservedCount,
      count_observed: apiCallObservedCount > 0
        ? projections.reduce((count, projection) => count + (projection.api_calls.count_observed ?? 0), 0)
        : null,
    },
    duration: {
      observed_count: durationObservedCount,
      duration_ms_observed: durationObservedCount > 0
        ? projections.reduce((count, projection) => count + (projection.duration.duration_ms_observed ?? 0), 0)
        : null,
    },
    cadence: {
      observed_count: uniqueStrings(projections.flatMap((projection) => projection.cadence.cadence_refs)).length,
      cadence_refs: uniqueStrings(projections.flatMap((projection) => projection.cadence.cadence_refs)),
    },
    source_refs: sourceRefs,
    authority_boundary: usageAuthorityBoundary(),
  };
}

export function summarizeModelRouteCostProjections(
  projections: ModelRouteCostProjection[],
  projectionScope = 'stage_attempt_workbench',
) {
  const sourceRefs = uniqueStrings(projections.flatMap((projection) => projection.source_refs));
  const routeObserved = projections.filter((projection) =>
    projection.availability !== 'model_route_unavailable'
  );
  return {
    surface_kind: 'opl_model_route_cost_projection_summary',
    projection_scope: projectionScope,
    attempt_count: projections.length,
    route_observed_attempt_count: routeObserved.length,
    token_linked_attempt_count: projections.filter((projection) =>
      Number(projection.observed_usage_linkage.token.observed_count) > 0
    ).length,
    cost_linked_attempt_count: projections.filter((projection) =>
      Number(projection.observed_usage_linkage.cost.observed_count) > 0
    ).length,
    selected_model_refs: uniqueStrings(projections
      .map((projection) => projection.selected_model.model_ref)
      .filter((ref): ref is string => Boolean(ref))),
    selected_models: uniqueStrings(projections
      .map((projection) => projection.selected_model.model)
      .filter((model): model is string => Boolean(model))),
    executor_route_refs: uniqueStrings(projections.flatMap((projection) =>
      projection.selected_executor.route_refs
    )),
    route_refs: uniqueStrings(projections.flatMap((projection) => projection.route.route_refs)),
    reason_refs: uniqueStrings(projections.flatMap((projection) => projection.route.reason_refs)),
    tier_refs: uniqueStrings(projections.flatMap((projection) => projection.route.tier_refs)),
    fallback_refs: uniqueStrings(projections.flatMap((projection) => projection.route.fallback_refs)),
    source_ref_count: sourceRefs.length,
    source_refs: sourceRefs,
    authority_boundary: modelRouteCostAuthorityBoundary(),
  };
}
