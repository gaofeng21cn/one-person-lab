import { isRecord } from '../../../../kernel/contract-validation.ts';
import { record, stringValue, type JsonRecord } from '../../../../kernel/json-record.ts';
import {
  buildStageAttemptRuntimeCurrentness,
  buildStageAttemptUsageProjection,
} from '../../../../adapters/execution/public/app-state.ts';
import { canonicalWorkspacePath } from '../catalog.ts';
import {
  attemptStageRunLaunch,
  effectiveAttemptStatus,
  normalizedStatus,
  numberValue,
} from '../execution-ledger.ts';
import { inspectTemporalRuntimeObservation } from '../temporal-runtime-observation.ts';
import type {
  TokenObservation,
  WorkItemCondition,
  WorkItemExecutionState,
  WorkItemProjectionItem,
} from '../types.ts';

export const QUEUED_STATUSES = new Set(['created', 'pending', 'queued', 'scheduled']);
export const SUCCEEDED_STATUSES = new Set(['completed', 'succeeded', 'closed']);
export const FAILED_STATUSES = new Set(['blocked', 'dead_lettered', 'failed']);
export const LIVE_STAGE_ATTEMPT_STATUSES = new Set([
  ...QUEUED_STATUSES,
  'running',
  'checkpointed',
  'human_gate',
]);
export const CURRENT_QUALITY_CYCLE_STATUSES = new Set([
  'awaiting_producer',
  'awaiting_review',
  'awaiting_repair',
]);
export const TEMPORAL_RUNTIME_OBSERVATION_SURFACE = 'temporal_stage_attempt_runtime_observation';
export const TEMPORAL_RUNTIME_OBSERVATION_SOURCE = 'temporal_workflow_query';

export function usageProjection(attempt: JsonRecord, scope: string) {
  return buildStageAttemptUsageProjection({
    stageAttemptId: stringValue(attempt.stage_attempt_id) ?? 'unknown-stage-attempt',
    projectionScope: scope,
    status: normalizedStatus(attempt.status),
    blockedReason: stringValue(attempt.blocked_reason),
    executorKind: stringValue(attempt.executor_kind),
    retryBudget: record(attempt.retry_budget),
    attemptCount: numberValue(attempt.attempt_count) ?? 1,
    providerRun: record(attempt.provider_run),
    activityEvents: Array.isArray(attempt.activity_events) ? attempt.activity_events : [],
    routeImpact: record(attempt.route_impact),
    usageObservation: isRecord(attempt.usage_observation) ? attempt.usage_observation : null,
  });
}

export function tokenObservation(input: {
  projections: ReturnType<typeof usageProjection>[];
  observedAt: string | null;
  stale?: boolean;
}): TokenObservation {
  const observed = input.projections.filter((projection) => projection.token.observed_count > 0);
  if (observed.length === 0) {
    return {
      state: input.stale ? 'stale' : 'missing',
      input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      observed_at: null,
      missing_reason: input.stale
        ? 'stage_attempt_projection_is_stale'
        : 'no_stage_attempt_usage_telemetry_observed',
      source_refs: [],
    };
  }
  return {
    state: input.stale ? 'stale' : 'observed',
    input_tokens: observed.reduce((total, projection) => total + (projection.token.input_tokens_observed ?? 0), 0),
    output_tokens: observed.reduce((total, projection) => total + (projection.token.output_tokens_observed ?? 0), 0),
    total_tokens: observed.reduce((total, projection) => total + (projection.token.total_tokens_observed ?? 0), 0),
    observed_at: input.observedAt,
    missing_reason: null,
    source_refs: [...new Set(observed.flatMap((projection) => projection.token.source_refs))],
  };
}

export function missingToken(reason: string): TokenObservation {
  return {
    state: 'missing',
    input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    observed_at: null,
    missing_reason: reason,
    source_refs: [],
  };
}

export function reviewChainSummary(input: {
  attempts: JsonRecord[];
  cumulativeTokens: TokenObservation;
}) {
  const stageRuns = new Map<string, JsonRecord[]>();
  for (const attempt of input.attempts) {
    const stageRunId = stringValue(attempt.stage_run_id);
    if (!stageRunId) continue;
    stageRuns.set(stageRunId, [...(stageRuns.get(stageRunId) ?? []), attempt]);
  }
  let maxRouteBackRounds: number | null = null;
  let routeBackRoundsUsed = 0;
  let totalRepairRounds = 0;
  for (const stageAttempts of stageRuns.values()) {
    const launch = attemptStageRunLaunch(stageAttempts[0]!);
    const routeBudget = record(record(launch.stage_run_input).route_budget);
    const max = numberValue(routeBudget.max_route_back_rounds);
    const used = numberValue(routeBudget.route_back_rounds_used);
    if (max !== null) maxRouteBackRounds = maxRouteBackRounds === null ? max : Math.max(maxRouteBackRounds, max);
    if (used !== null) routeBackRoundsUsed = Math.max(routeBackRoundsUsed, used);
    totalRepairRounds += Math.max(0, ...stageAttempts.map((attempt) => numberValue(attempt.quality_round_index) ?? 0));
  }
  return {
    stage_run_count: stageRuns.size,
    total_attempt_count: input.attempts.length,
    total_repair_rounds: totalRepairRounds,
    max_route_back_rounds: maxRouteBackRounds,
    route_back_rounds_used: routeBackRoundsUsed,
    total_tokens_observed: input.cumulativeTokens.total_tokens,
    token_observation_status: input.cumulativeTokens.state === 'observed'
      ? 'observed' as const
      : input.cumulativeTokens.state === 'stale'
        ? 'partial' as const
        : 'missing' as const,
  };
}

type TemporalRuntimeObservation = {
  fresh: boolean;
  running: boolean;
  reason: string;
};

export function temporalRuntimeObservation(attempt: JsonRecord, providerRun: JsonRecord): TemporalRuntimeObservation {
  const observation = record(providerRun.runtime_observation);
  if (Object.keys(observation).length === 0) {
    return { fresh: false, running: false, reason: 'temporal_runtime_observation_missing' };
  }
  if (
    stringValue(observation.surface_kind) !== TEMPORAL_RUNTIME_OBSERVATION_SURFACE
    || stringValue(observation.source) !== TEMPORAL_RUNTIME_OBSERVATION_SOURCE
  ) {
    return { fresh: false, running: false, reason: 'temporal_runtime_observation_provenance_invalid' };
  }
  if (
    !stringValue(observation.stage_attempt_id)
    || !stringValue(observation.workflow_id)
    || stringValue(observation.stage_attempt_id) !== stringValue(attempt.stage_attempt_id)
    || stringValue(observation.workflow_id) !== stringValue(attempt.workflow_id)
  ) {
    return { fresh: false, running: false, reason: 'temporal_runtime_observation_identity_mismatch' };
  }
  const temporal = inspectTemporalRuntimeObservation(observation);
  if (temporal.status === 'invalid') {
    return { fresh: false, running: false, reason: 'temporal_runtime_observation_time_invalid' };
  }
  if (temporal.status === 'expired') {
    return { fresh: false, running: false, reason: 'temporal_runtime_observation_expired' };
  }
  if (temporal.status === 'not_running') {
    return { fresh: false, running: false, reason: 'temporal_runtime_observation_not_running' };
  }
  return { fresh: true, running: true, reason: 'temporal_runtime_observation_running_confirmed' };
}

export function executionState(latest: JsonRecord) {
  const ledgerStatus = effectiveAttemptStatus(latest);
  const providerRun = record(latest.provider_run);
  const runtimeObservation = stringValue(latest.provider_kind) === 'temporal'
    ? temporalRuntimeObservation(latest, providerRun)
    : { fresh: false, running: false, reason: 'runtime_observation_not_applicable' };
  const baseCurrentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus,
    providerKind: stringValue(latest.provider_kind) ?? 'unknown',
    providerRun,
  });
  const currentness = runtimeObservation.running
    && QUEUED_STATUSES.has(ledgerStatus)
    && normalizedStatus(baseCurrentness.effective_runtime_status) !== 'running'
    ? {
        ...baseCurrentness,
        effective_runtime_status: 'running',
        running_proof_status: 'running_confirmed',
        projection_status: 'current_or_not_running_claim',
        reason: null,
        running_proof_sources: ['temporal_runtime_observation'],
      }
    : baseCurrentness;
  const effectiveRuntimeStatus = normalizedStatus(currentness.effective_runtime_status);
  let state: WorkItemExecutionState = 'unknown';
  if (effectiveRuntimeStatus === 'running') {
    state = currentness.running_proof_status === 'running_confirmed' ? 'running' : 'unknown';
  } else if (QUEUED_STATUSES.has(effectiveRuntimeStatus)) {
    state = 'queued';
  } else if (SUCCEEDED_STATUSES.has(effectiveRuntimeStatus)) {
    state = 'succeeded';
  } else if (FAILED_STATUSES.has(effectiveRuntimeStatus)) {
    state = 'failed';
  } else if (ledgerStatus === 'human_gate') {
    state = 'idle';
  }
  return {
    state,
    ledgerStatus,
    effectiveRuntimeStatus,
    currentness,
    runtimeObservation,
  };
}

export function attemptStartedAfterLifecycleSnapshot(
  attempt: JsonRecord,
  lifecycleSnapshotAt: string,
) {
  const startedAt = stringValue(record(attempt.provider_run).started_at)
    ?? stringValue(attempt.created_at);
  const startedTime = Date.parse(startedAt ?? '');
  const snapshotTime = Date.parse(lifecycleSnapshotAt);
  return Number.isFinite(startedTime)
    && Number.isFinite(snapshotTime)
    && startedTime > snapshotTime;
}

export function currentRuntimeWakeAttempt(
  attempts: JsonRecord[],
  lifecycleSnapshotAt: string,
) {
  return attempts.find((attempt) => (
    LIVE_STAGE_ATTEMPT_STATUSES.has(effectiveAttemptStatus(attempt))
    && attemptStartedAfterLifecycleSnapshot(attempt, lifecycleSnapshotAt)
  )) ?? null;
}

function firstRecord(...values: unknown[]) {
  return values.find(isRecord) ?? {};
}

export function currentRepairRoute(item: WorkItemProjectionItem, latest: JsonRecord) {
  const routeImpact = record(latest.route_impact);
  const route = firstRecord(
    routeImpact.current_repair_route,
    routeImpact.repair_route,
    routeImpact.selected_repair_route,
  );
  const binding = record(route.binding);
  const workspacePath = stringValue(route.workspace_path) ?? stringValue(binding.workspace_path);
  const workItemId = stringValue(route.work_item_id) ?? stringValue(binding.work_item_id);
  const observedGeneration = stringValue(route.observed_generation)
    ?? stringValue(route.work_item_generation)
    ?? stringValue(binding.observed_generation);
  const responsibleComponent = stringValue(route.responsible_component) ?? stringValue(route.owner);
  const issue = stringValue(route.issue) ?? stringValue(route.issue_summary);
  const impact = stringValue(route.impact) ?? stringValue(route.impact_summary);
  const repairAction = stringValue(route.repair_action) ?? stringValue(route.repair_action_summary);
  const expectedOutcome = stringValue(route.expected_outcome);
  const identityMatches = Boolean(
    workspacePath
    && canonicalWorkspacePath(workspacePath) === canonicalWorkspacePath(item.identity.workspace_path)
    && workItemId === item.identity.work_item_id
    && observedGeneration === item.lifecycle.observed_generation,
  );
  const complete = Boolean(
    route.blocking_current_progress === true
    && identityMatches
    && responsibleComponent
    && issue
    && impact
    && repairAction
    && expectedOutcome,
  );
  return {
    declared: Object.keys(route).length > 0,
    complete,
    responsible_component: responsibleComponent,
    issue,
    impact,
    repair_action: repairAction,
    expected_outcome: expectedOutcome,
  };
}

export function condition(input: Omit<WorkItemCondition, 'ref'> & { ref?: string | null }): WorkItemCondition {
  return { ...input, ref: input.ref ?? null };
}

export function humanGateAction(
  item: WorkItemProjectionItem,
  attempt: JsonRecord,
): WorkItemProjectionItem['action'] {
  const attemptId = stringValue(attempt.stage_attempt_id) ?? 'unknown-stage-attempt';
  const stageId = stringValue(attempt.stage_id);
  const gateRef = Array.isArray(attempt.human_gate_refs)
    ? attempt.human_gate_refs.map(stringValue).find(Boolean) ?? null
    : null;
  const summary = stringValue(attempt.blocked_reason)
    ?? '当前阶段已到人工确认点，需要你决定后才能继续。';
  return {
    kind: 'user_action',
    title: '确认后续处理',
    title_key: 'runtimeHumanGate.action.title',
    summary,
    summary_key: 'runtimeHumanGate.action.summary',
    message_args: {
      item_id: item.item_id,
      stage_attempt_id: attemptId,
      ...(stageId ? { stage_id: stageId } : {}),
      ...(gateRef ? { human_gate_ref: gateRef } : {}),
    },
    owner: 'user',
    owner_kind: 'user',
    owner_display_name: '你',
    action_ref: gateRef ?? `runtime-human-gate:${attemptId}`,
    dry_run_required: false,
  };
}
