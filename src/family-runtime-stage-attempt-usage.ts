type JsonRecord = Record<string, unknown>;

export type StageAttemptUsageProjection = ReturnType<typeof buildStageAttemptUsageProjection>;
export type StageAttemptUsageSummary = ReturnType<typeof summarizeStageAttemptUsageProjections>;

type StageAttemptUsageInput = {
  stageAttemptId: string;
  projectionScope?: string;
  status: string;
  blockedReason?: string | null;
  retryBudget: JsonRecord;
  attemptCount: number;
  providerRun: JsonRecord;
  activityEvents: unknown[];
  routeImpact: JsonRecord;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
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
      stringValue(value.ref),
      stringValue(value.ref_id),
    ].filter((ref): ref is string => Boolean(ref));
  }
  return [];
}

function usageRefs(usage: JsonRecord) {
  const nestedCost = usageRecord(usage.cost_summary);
  return uniqueStrings([
    ...refsFromUnknown(usage.usage_ref),
    ...refsFromUnknown(usage.usage_refs),
    ...refsFromUnknown(usage.session_usage_refs),
    ...refsFromUnknown(nestedCost.usage_ref),
    ...refsFromUnknown(nestedCost.usage_refs),
    ...refsFromUnknown(nestedCost.session_usage_refs),
  ]);
}

function add(sourceRefs: string[], ref: string, value: number | null) {
  return value === null ? 0 : (sourceRefs.push(ref), value);
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
    output_tokens: numberValue(value.output_tokens),
    total_tokens: numberValue(value.total_tokens),
  };
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
    || costSummary.estimated_cost_usd,
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

function usageInputs(input: StageAttemptUsageInput) {
  const providerUsage = usageRecord(input.providerRun.usage_projection);
  const activityEvents = input.activityEvents.filter(isRecord);
  const routeUsage = usageRecord(input.routeImpact.usage_projection);
  return [
    { ref: `stage_attempt:${input.stageAttemptId}#provider_run.usage_projection`, usage: providerUsage },
    ...activityEvents.map((event, index) => ({
      ref: `stage_attempt:${input.stageAttemptId}#activity_events[${index}]`,
      usage: event,
    })),
    { ref: `stage_attempt:${input.stageAttemptId}#route_impact.usage_projection`, usage: routeUsage },
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
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let tokenObservedCount = 0;
  let estimatedCostUsd = 0;
  let costObservedCount = 0;
  let apiCallCount = 0;
  let apiCallObservedCount = 0;
  let durationMs = 0;
  let durationObservedCount = 0;

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
    const entryUsageRefs = usageRefs(usage);
    sourceRefs.push(...entryUsageRefs);
    if (tokens) {
      const tokenRefs = entryUsageRefs.length > 0 ? entryUsageRefs : [entry.ref];
      inputTokens += add(tokenSourceRefs, tokenRefs[0]!, tokens.input_tokens);
      outputTokens += add(tokenSourceRefs, tokenRefs[0]!, tokens.output_tokens);
      totalTokens += add(tokenSourceRefs, tokenRefs[0]!, tokens.total_tokens);
      tokenSourceRefs.push(...tokenRefs.slice(1));
      if (tokens.input_tokens !== null || tokens.output_tokens !== null || tokens.total_tokens !== null) {
        tokenObservedCount += 1;
      }
    }
    const cost = numberValue(usage.estimated_cost_usd) ?? numberValue(nestedCost.estimated_cost_usd);
    if (cost !== null) {
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

  const maxAttempts = numberValue(input.retryBudget.max_attempts);
  const remainingAttempts = maxAttempts === null ? null : Math.max(0, maxAttempts - input.attemptCount);
  const pressureStatus = retryPressureStatus(input, maxAttempts);
  const hasObservedResourceUsage =
    tokenObservedCount + costObservedCount + apiCallObservedCount + durationObservedCount > 0;
  const retryBudgetObserved = Object.keys(input.retryBudget).length > 0;
  const telemetryStatus = hasObservedResourceUsage ? 'observed' : 'missing';

  return {
    surface_kind: 'opl_stage_attempt_usage_projection',
    projection_scope: input.projectionScope ?? 'stage_attempt',
    availability: hasObservedResourceUsage
      ? 'usage_observed'
      : retryBudgetObserved
        ? 'retry_budget_observed'
        : 'usage_unavailable',
    telemetry_status: telemetryStatus,
    missing_usage_telemetry_reason: hasObservedResourceUsage ? null : 'no_stage_attempt_usage_telemetry_observed',
    token: {
      observed_count: tokenObservedCount,
      input_tokens_observed: tokenObservedCount > 0 ? inputTokens : null,
      output_tokens_observed: tokenObservedCount > 0 ? outputTokens : null,
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
      max_attempts: maxAttempts,
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
  const resourceObserved = projections.filter((projection) =>
    projection.token.observed_count
    + projection.cost.observed_count
    + projection.api_calls.observed_count > 0
  );
  const retryPressure = projections.filter((projection) =>
    ['retry_budget_pressure', 'retry_budget_exhausted'].includes(projection.retry_budget.pressure_status)
  );
  return {
    surface_kind: 'opl_stage_attempt_usage_projection_summary',
    projection_scope: projectionScope,
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
      observed_count: projections.reduce((count, projection) => count + projection.token.observed_count, 0),
      total_tokens_observed: projections.reduce((count, projection) =>
        count + (projection.token.total_tokens_observed ?? 0), 0
      ),
    },
    cost: {
      observed_count: projections.reduce((count, projection) => count + projection.cost.observed_count, 0),
      estimated_cost_usd_observed: Number(projections.reduce((count, projection) =>
        count + (projection.cost.estimated_cost_usd_observed ?? 0), 0
      ).toFixed(6)),
    },
    api_calls: {
      observed_count: projections.reduce((count, projection) => count + projection.api_calls.observed_count, 0),
      count_observed: projections.reduce((count, projection) =>
        count + (projection.api_calls.count_observed ?? 0), 0
      ),
    },
    duration: {
      observed_count: projections.reduce((count, projection) => count + projection.duration.observed_count, 0),
      duration_ms_observed: projections.reduce((count, projection) =>
        count + (projection.duration.duration_ms_observed ?? 0), 0
      ),
    },
    cadence: {
      observed_count: uniqueStrings(projections.flatMap((projection) => projection.cadence.cadence_refs)).length,
      cadence_refs: uniqueStrings(projections.flatMap((projection) => projection.cadence.cadence_refs)),
    },
    source_refs: sourceRefs,
    authority_boundary: usageAuthorityBoundary(),
  };
}
