import type {
  ModelRouteCostProjection,
  StageAttemptUsageProjection,
} from './family-runtime-stage-attempt-usage.ts';
import {
  buildMemoryTraceProjection,
} from './stage-attempt-projections/memory-locator-index.ts';
import {
  buildTemporalStageAttemptVisibility,
  buildTemporalWebUiRef,
  type TemporalStageAttemptVisibilityReadiness,
} from './family-runtime-temporal-visibility.ts';
import {
  buildProgressDeltaReceipt,
  progressDeltaReceiptDeltaClassFromStageClassification,
  type StageProgressDeltaClassification,
} from '../ledger/index.ts';
import { buildStageAttemptRuntimeCurrentness } from './family-runtime-stage-attempt-runtime-currentness.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import {
  standardAgentProgressDeltaKeySet,
  type StandardAgentProgressDeltaKeySet,
} from '../connect/index.ts';
import {
  recordList as sharedRecordList,
  stringList as sharedStringList,
  stringValue,
  uniqueStringList,
} from '../../kernel/json-record.ts';
import {
  taskRetryBudgetMaxAttemptsValue,
  taskRetryBudgetProjection,
} from './family-runtime-queue-projection-boundary.ts';

type JsonRecord = Record<string, unknown>;

export type StageProgressLogInput = {
  stageAttemptId: string;
  projectionScope?: string;
  providerKind: string;
  executorKind: string;
  domainId: string;
  stageId: string;
  workflowId: string;
  taskId?: string | null;
  workspaceLocator: JsonRecord;
  sourceFingerprint?: string | null;
  status: string;
  blockedReason?: string | null;
  checkpointRefs: string[];
  closeoutRefs: string[];
  consumedRefs: string[];
  consumedMemoryRefs: string[];
  writebackReceiptRefs: string[];
  humanGateRefs?: string[];
  retryBudget: JsonRecord;
  attemptCount: number;
  providerRun: JsonRecord;
  temporalVisibilityReadiness?: TemporalStageAttemptVisibilityReadiness | null;
  activityEvents: unknown[];
  routeImpact: JsonRecord;
  latestCloseout?: JsonRecord | null;
  closeoutReceiptStatus?: string | null;
  nextOwner: string;
  domainReadyVerdict?: string | null;
  canonicalOutcome?: string | null;
  usageProjection: StageAttemptUsageProjection;
  modelRouteCostProjection: ModelRouteCostProjection;
  createdAt?: string | null;
  updatedAt?: string | null;
  progressDeltaKeys?: StandardAgentProgressDeltaKeySet;
};

export type StageProgressLogProjection = ReturnType<typeof buildStageProgressLog>;
export type StageProgressLogSummary = ReturnType<typeof summarizeStageProgressLogs>;

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function uniqueStrings(values: string[]) {
  return uniqueStringList(values);
}

function stringList(value: unknown) {
  const scalar = stringValue(value);
  return scalar ? [scalar] : sharedStringList(value);
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
      stringValue(value.ref),
      stringValue(value.ref_id),
      stringValue(value.path),
      stringValue(value.uri),
    ].filter((ref): ref is string => Boolean(ref));
  }
  return [];
}

function refsFromRecord(record: JsonRecord | null | undefined, keys: string[]) {
  if (!record) {
    return [];
  }
  return keys.flatMap((key) => refsFromUnknown(record[key]));
}

function recordList(value: unknown) {
  return sharedRecordList(value);
}

function firstRecordFrom(record: JsonRecord | null | undefined, keys: string[]) {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
}

function packetLikeRef(value: string) {
  return value.startsWith('packet:')
    || value.includes('/default_executor_dispatches/')
    || value.includes('/stage_packets/')
    || value.endsWith('.stage-packet.json')
    || value.endsWith('/stage-packet.json');
}

function stagePacketRefs(input: StageProgressLogInput) {
  return uniqueStrings([
    ...input.activityEvents.filter(isRecord).flatMap((event) => refsFromUnknown(event.stage_packet_ref)),
    ...input.checkpointRefs.filter(packetLikeRef),
    ...refsFromUnknown(input.workspaceLocator.stage_packet_ref),
    ...refsFromUnknown(input.workspaceLocator.stage_packet_refs),
  ]);
}

function activityEventRefs(input: StageProgressLogInput) {
  return input.activityEvents
    .map((event, index) => isRecord(event)
      ? [
          stringValue(event.event_ref),
          stringValue(event.ref),
          `stage_attempt:${input.stageAttemptId}#activity_events[${index}]`,
        ].filter((ref): ref is string => Boolean(ref))[0]
      : `stage_attempt:${input.stageAttemptId}#activity_events[${index}]`)
    .filter((ref): ref is string => Boolean(ref));
}

function eventTime(event: JsonRecord) {
  return stringValue(event.event_time) ?? stringValue(event.observed_at) ?? stringValue(event.created_at);
}

function firstActivityAt(events: JsonRecord[]) {
  return events.map(eventTime).find((value): value is string => Boolean(value)) ?? null;
}

function latestActivityAt(events: JsonRecord[]) {
  return events.map(eventTime).filter((value): value is string => Boolean(value)).at(-1) ?? null;
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

function eventKind(event: JsonRecord) {
  return stringValue(event.event_kind)
    ?? stringValue(event.heartbeat_kind)
    ?? stringValue(event.activity_kind)
    ?? 'activity_event';
}

function activityTimeline(input: StageProgressLogInput) {
  return input.activityEvents.filter(isRecord).map((event, index) => ({
    event_id: `stage_attempt:${input.stageAttemptId}:activity_event:${index}`,
    event_kind: eventKind(event),
    activity_kind: stringValue(event.activity_kind),
    activity_status: stringValue(event.activity_status),
    runner_event_kind: stringValue(event.runner_event_kind),
    stage_packet_ref: stringValue(event.stage_packet_ref),
    checkpoint_refs: uniqueStrings(refsFromUnknown(event.checkpoint_refs)),
    observed_at: eventTime(event),
    ref: `stage_attempt:${input.stageAttemptId}#activity_events[${index}]`,
  }));
}

function runnerProgressEvents(events: JsonRecord[]) {
  return events.filter((event) =>
    stringValue(event.heartbeat_kind) === 'codex_stage_activity_runner_progress'
    || Boolean(stringValue(event.runner_event_kind))
  );
}

function stageProgressAuthorityBoundary() {
  return {
    opl: 'stage_attempt_progress_observability_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
    provider: 'runtime_lifecycle_owner_not_domain_ready_owner',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_write_domain_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    provider_completion_is_domain_ready: false,
  };
}

function usageTelemetry(input: StageProgressLogInput) {
  const usage = input.usageProjection;
  const observedCount =
    Number(usage.token.observed_count)
    + Number(usage.cost.observed_count)
    + Number(usage.api_calls.observed_count)
    + Number(usage.duration.observed_count);
  return {
    telemetry_status: observedCount > 0 ? 'observed' : 'missing',
    token_observed: Number(usage.token.observed_count) > 0,
    cost_observed: Number(usage.cost.observed_count) > 0,
    api_calls_observed: Number(usage.api_calls.observed_count) > 0,
    duration_observed: Number(usage.duration.observed_count) > 0,
    missing_usage_telemetry_reason: observedCount > 0 ? null : 'no_stage_attempt_usage_telemetry_observed',
  };
}

function userStageLogAuthorityBoundary() {
  return {
    opl: 'user_stage_log_container_timing_usage_and_refs_projection_only',
    domain: 'human_readable_stage_semantics_owner',
    semantic_body_source: 'domain_typed_closeout_or_route_impact_only',
    can_infer_domain_semantics: false,
    can_write_domain_truth: false,
    can_authorize_quality_verdict: false,
  };
}

function statusFromObservedCount(count: number) {
  return count > 0 ? 'observed' : 'missing';
}

function durationForUserStageLog(input: StageProgressLogInput, durationMsObserved: number | null) {
  const telemetryObserved = Number(input.usageProjection.duration.observed_count) > 0;
  const providerDurationMs = msBetween(input.providerRun.started_at, input.providerRun.completed_at);
  const attemptWallClockMs = msBetween(input.createdAt, input.updatedAt);
  const durationMs = durationMsObserved ?? providerDurationMs ?? attemptWallClockMs;
  const durationSource = durationMsObserved !== null
    ? 'usage_projection'
    : providerDurationMs !== null
      ? 'provider_run_started_completed_at'
      : attemptWallClockMs !== null
        ? 'stage_attempt_created_updated_at_fallback'
        : null;
  return {
    status: durationMs !== null ? 'observed' : 'missing',
    duration_ms: durationMs,
    duration_source: durationSource,
    usage_projection_ref: `/stage_attempt_workbench/attempts/${input.stageAttemptId}/usage_projection`,
    duration_telemetry_status: telemetryObserved ? 'observed' : 'missing',
    telemetry_fallback_used: durationMsObserved === null && durationMs !== null,
    missing_duration_reason: telemetryObserved ? null : 'no_stage_attempt_duration_telemetry_observed',
  };
}

function tokenUsageForUserStageLog(input: StageProgressLogInput) {
  const usage = input.usageProjection;
  const observed = Number(usage.token.observed_count) > 0;
  return {
    status: statusFromObservedCount(Number(usage.token.observed_count)),
    input_tokens: observed ? numberValue(usage.token.input_tokens_observed) : null,
    output_tokens: observed ? numberValue(usage.token.output_tokens_observed) : null,
    total_tokens: observed ? numberValue(usage.token.total_tokens_observed) : null,
    observed_count: Number(usage.token.observed_count),
    usage_projection_ref: `/stage_attempt_workbench/attempts/${input.stageAttemptId}/usage_projection`,
    source_refs: usage.token.source_refs,
    missing_token_usage_reason: observed ? null : 'no_stage_attempt_token_usage_telemetry_observed',
  };
}

function costForUserStageLog(input: StageProgressLogInput) {
  const usage = input.usageProjection;
  const observed = Number(usage.cost.observed_count) > 0;
  return {
    status: statusFromObservedCount(Number(usage.cost.observed_count)),
    estimated_cost_usd: observed ? numberValue(usage.cost.estimated_cost_usd_observed) : null,
    observed_count: Number(usage.cost.observed_count),
    usage_projection_ref: `/stage_attempt_workbench/attempts/${input.stageAttemptId}/usage_projection`,
    source_refs: usage.cost.source_refs,
    missing_cost_reason: observed ? null : 'no_stage_attempt_cost_telemetry_observed',
  };
}

function observabilityForUserStageLog(
  duration: ReturnType<typeof durationForUserStageLog>,
  tokens: ReturnType<typeof tokenUsageForUserStageLog>,
  cost: ReturnType<typeof costForUserStageLog>,
) {
  const missingFields = [
    duration.status === 'missing' ? 'duration' : null,
    tokens.status === 'missing' ? 'token_usage' : null,
    cost.status === 'missing' ? 'cost' : null,
  ].filter((field): field is string => Boolean(field));
  return {
    observability_status: missingFields.length === 0 ? 'observed' : 'missing',
    missing_observability_fields: missingFields,
  };
}

function semanticList(summary: JsonRecord | null, keys: string[]) {
  if (!summary) {
    return [];
  }
  for (const key of keys) {
    const values = stringList(summary[key]);
    if (values.length > 0) {
      return values;
    }
  }
  return [];
}

function semanticText(summary: JsonRecord | null, keys: string[]) {
  if (!summary) {
    return null;
  }
  for (const key of keys) {
    const value = stringValue(summary[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function semanticRecord(summary: JsonRecord | null, keys: string[]) {
  if (!summary) {
    return null;
  }
  for (const key of keys) {
    const value = summary[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
}

function progressDeltaFromRecord(record: JsonRecord | null, keys: string[], defaultSummary: string | null) {
  const delta = semanticRecord(record, keys);
  const deltaRefs = delta
    ? uniqueStrings(refsFromRecord(delta, ['delta_ref', 'delta_refs', 'refs', 'evidence_refs']))
    : [];
  const deltaCount = delta
    ? numberValue(delta.delta_count) ?? deltaRefs.length
    : 0;
  return {
    delta_count: deltaCount,
    delta_refs: deltaRefs,
    delta_summary: delta
      ? semanticText(delta, ['delta_summary', 'summary', 'work_summary'])
      : defaultSummary,
  };
}

const PROGRESS_DELTA_CLASSIFICATIONS = new Set([
  'deliverable_progress',
  'platform_repair',
  'mixed',
  'typed_blocker',
  'human_gate',
  'stop_loss',
]);

const REQUIRED_DOMAIN_STAGE_LOG_FIELDS = [
  'stage_name',
  'problem_summary',
  'stage_goal',
  'progress_delta_classification',
  'deliverable_progress_delta',
  'platform_repair_delta',
  'next_forced_delta',
  'stage_work_done',
  'changed_stage_surfaces',
  'outcome',
  'remaining_blockers',
  'evidence_refs',
] as const;

function normalizedProgressDeltaClassification(value: string | null): StageProgressDeltaClassification | null {
  if (!value) {
    return null;
  }
  return PROGRESS_DELTA_CLASSIFICATIONS.has(value)
    ? value as StageProgressDeltaClassification
    : 'typed_blocker';
}

function invalidProgressDeltaClassification(value: string | null) {
  return Boolean(value && !PROGRESS_DELTA_CLASSIFICATIONS.has(value));
}

function userStageLogProgressDeltas(
  semanticSummary: JsonRecord | null,
  routeImpact: JsonRecord,
  semanticStatus: string,
  progressDeltaKeys: StandardAgentProgressDeltaKeySet,
) {
  const deliverableKeys = progressDeltaKeys.deliverable;
  const platformKeys = progressDeltaKeys.platform;
  const deliverableDelta = progressDeltaFromRecord(semanticSummary, deliverableKeys, null);
  const platformDelta = progressDeltaFromRecord(semanticSummary, platformKeys, null);
  const routeDeliverableDelta = progressDeltaFromRecord(routeImpact, deliverableKeys, null);
  const routePlatformDelta = progressDeltaFromRecord(routeImpact, platformKeys, null);
  const mergedDeliverableDelta = {
    delta_count: deliverableDelta.delta_count || routeDeliverableDelta.delta_count,
    delta_refs: uniqueStrings([...deliverableDelta.delta_refs, ...routeDeliverableDelta.delta_refs]),
    delta_summary: deliverableDelta.delta_summary ?? routeDeliverableDelta.delta_summary,
  };
  const mergedPlatformDelta = {
    delta_count: platformDelta.delta_count || routePlatformDelta.delta_count,
    delta_refs: uniqueStrings([...platformDelta.delta_refs, ...routePlatformDelta.delta_refs]),
    delta_summary: platformDelta.delta_summary ?? routePlatformDelta.delta_summary,
  };
  const rawClassification = semanticText(semanticSummary, ['progress_delta_classification'])
    ?? semanticText(routeImpact, ['progress_delta_classification']);
  const inferredClassification = semanticStatus === 'missing_domain_semantic_summary'
    ? 'typed_blocker'
    : mergedDeliverableDelta.delta_count > 0 && mergedPlatformDelta.delta_count > 0
      ? 'mixed'
      : mergedDeliverableDelta.delta_count > 0
        ? 'deliverable_progress'
        : mergedPlatformDelta.delta_count > 0
          ? 'platform_repair'
          : 'typed_blocker';
  const classification = normalizedProgressDeltaClassification(rawClassification) ?? inferredClassification;
  return {
    progress_delta_classification: classification,
    invalid_progress_delta_classification: invalidProgressDeltaClassification(rawClassification),
    raw_progress_delta_classification: rawClassification,
    deliverable_progress_delta: {
      ...mergedDeliverableDelta,
      has_deliverable_delta: mergedDeliverableDelta.delta_count > 0 || mergedDeliverableDelta.delta_refs.length > 0,
    },
    platform_repair_delta: {
      ...mergedPlatformDelta,
      has_platform_repair_delta: mergedPlatformDelta.delta_count > 0 || mergedPlatformDelta.delta_refs.length > 0,
    },
    next_forced_delta: semanticText(semanticSummary, ['next_forced_delta'])
      ?? semanticText(routeImpact, ['next_forced_delta'])
      ?? (semanticStatus === 'missing_domain_semantic_summary'
        ? 'domain_user_stage_log_or_typed_blocker_with_lineage_required'
        : 'deliverable_progress_delta_or_typed_blocker_with_lineage_required'),
  };
}

function progressDeltaReceiptForUserStageLog(input: StageProgressLogInput, userStageLog: ReturnType<typeof buildUserStageLog>) {
  const producedRefs = uniqueStrings([
    ...userStageLog.evidence_refs,
    ...userStageLog.deliverable_progress_delta.delta_refs,
    ...userStageLog.platform_repair_delta.delta_refs,
    ...input.humanGateRefs ?? [],
    `stage_attempt:${input.stageAttemptId}#user_stage_log`,
  ]);
  const consumedRefs = uniqueStrings([
    ...input.consumedRefs,
    ...input.consumedMemoryRefs,
    ...refsFromUnknown(input.workspaceLocator.source_refs),
    ...refsFromUnknown(input.workspaceLocator.dispatch_ref),
    ...refsFromUnknown(input.workspaceLocator.dispatch_refs),
    input.sourceFingerprint ? `source_fingerprint:${input.sourceFingerprint}` : null,
  ].filter((entry): entry is string => Boolean(entry)));
  return buildProgressDeltaReceipt({
    receipt_id: `progress-delta:${input.stageAttemptId}`,
    domain_id: input.domainId,
    task_or_study_ref: input.taskId ?? stringValue(input.workspaceLocator.study_id) ?? `stage_attempt:${input.stageAttemptId}`,
    stage_ref: input.stageId,
    producer: 'opl_stage_progress_log',
    delta_classification: progressDeltaReceiptDeltaClassFromStageClassification(
      userStageLog.progress_delta_classification,
    ),
    changed_surfaces: userStageLog.changed_stage_surfaces.length > 0
      ? userStageLog.changed_stage_surfaces
      : ['stage_progress_log.user_stage_log'],
    produced_refs: producedRefs,
    consumed_refs: consumedRefs.length > 0
      ? consumedRefs
      : [`stage_attempt:${input.stageAttemptId}`],
    next_owner: input.nextOwner,
    next_required_delta: userStageLog.next_forced_delta,
  });
}

function domainStageSummary(input: StageProgressLogInput) {
  return firstRecordFrom(input.latestCloseout, [
    'user_stage_log',
    'stage_log_summary',
    'human_stage_log',
  ]) ?? firstRecordFrom(input.routeImpact, [
    'user_stage_log',
    'stage_log_summary',
    'human_stage_log',
  ]);
}

function hasDomainStageLogField(
  summary: JsonRecord,
  field: typeof REQUIRED_DOMAIN_STAGE_LOG_FIELDS[number],
  progressDeltaKeys: StandardAgentProgressDeltaKeySet,
) {
  switch (field) {
    case 'stage_name':
      return Boolean(semanticText(summary, ['stage_name', 'stage_label', 'name']));
    case 'problem_summary':
      return Boolean(semanticText(summary, ['problem_summary', 'problem', 'issue_summary']));
    case 'stage_goal':
      return Boolean(semanticText(summary, ['stage_goal', 'goal', 'intended_work']));
    case 'progress_delta_classification':
      return Boolean(semanticText(summary, ['progress_delta_classification']));
    case 'deliverable_progress_delta':
      return semanticRecord(summary, progressDeltaKeys.deliverable) !== null;
    case 'platform_repair_delta':
      return semanticRecord(summary, progressDeltaKeys.platform) !== null;
    case 'next_forced_delta':
      return Boolean(semanticText(summary, ['next_forced_delta']));
    case 'stage_work_done':
      return semanticList(summary, [
        'stage_work_done',
        'deliverable_work_done',
        'work_done_summary',
        'work_done',
        'actual_work',
        'changed_content_summary',
      ]).length > 0;
    case 'changed_stage_surfaces':
      return semanticList(summary, [
        'changed_stage_surfaces',
        'changed_deliverable_surfaces',
        'changed_surfaces',
        'artifact_surfaces',
      ]).length > 0;
    case 'outcome':
      return Boolean(semanticText(summary, ['outcome', 'stage_outcome']));
    case 'remaining_blockers':
      return Array.isArray(summary.remaining_blockers)
        || Array.isArray(summary.blockers)
        || Array.isArray(summary.remaining_issues);
    case 'evidence_refs':
      return semanticList(summary, ['evidence_refs', 'supporting_refs']).length > 0;
  }
}

function missingDomainStageLogFields(
  summary: JsonRecord | null,
  progressDeltaKeys: StandardAgentProgressDeltaKeySet,
) {
  if (!summary) {
    return [...REQUIRED_DOMAIN_STAGE_LOG_FIELDS];
  }
  return REQUIRED_DOMAIN_STAGE_LOG_FIELDS.filter((field) =>
    !hasDomainStageLogField(summary, field, progressDeltaKeys));
}

function buildUserStageLog(input: StageProgressLogInput, durationMsObserved: number | null) {
  const semanticSummary = domainStageSummary(input);
  const semanticSource = semanticSummary
    ? isRecord(input.latestCloseout)
      && [
        'user_stage_log',
        'stage_log_summary',
        'human_stage_log',
      ].some((key) => input.latestCloseout?.[key] === semanticSummary)
        ? 'latest_closeout'
        : 'route_impact'
    : null;
  const duration = durationForUserStageLog(input, durationMsObserved);
  const tokens = tokenUsageForUserStageLog(input);
  const cost = costForUserStageLog(input);
  const progressDeltaKeys = input.progressDeltaKeys ?? standardAgentProgressDeltaKeySet(input.domainId);
  const missingDomainFields = missingDomainStageLogFields(semanticSummary, progressDeltaKeys);
  const stageName = semanticText(semanticSummary, ['stage_name', 'stage_label', 'name'])
    ?? `${input.domainId}/${input.stageId}`;
  const problemSummary = semanticText(semanticSummary, ['problem_summary', 'problem', 'issue_summary']);
  const stageGoal = semanticText(semanticSummary, ['stage_goal', 'goal', 'intended_work']);
  const stageWorkDone = semanticList(semanticSummary, [
    'stage_work_done',
    'deliverable_work_done',
    'work_done_summary',
    'work_done',
    'actual_work',
    'changed_content_summary',
  ]);
  const changedStageSurfaces = semanticList(semanticSummary, [
    'changed_stage_surfaces',
    'changed_deliverable_surfaces',
    'changed_surfaces',
    'artifact_surfaces',
  ]);
  const remainingBlockers = uniqueStrings([
    ...semanticList(semanticSummary, ['remaining_blockers', 'blockers', 'remaining_issues']),
    ...semanticList(input.routeImpact, ['remaining_blockers', 'typed_blockers']),
    ...refsFromRecord(input.latestCloseout, ['typed_blocker_ref', 'typed_blocker_refs']),
    ...refsFromRecord(input.routeImpact, ['typed_blocker_ref', 'typed_blocker_refs']),
  ]);
  const outcome = semanticText(semanticSummary, ['outcome', 'stage_outcome'])
    ?? input.canonicalOutcome
    ?? input.domainReadyVerdict
    ?? input.status;
  const evidenceRefs = uniqueStrings([
    ...semanticList(semanticSummary, ['evidence_refs', 'supporting_refs']),
    ...input.closeoutRefs,
    ...input.consumedRefs,
    ...input.writebackReceiptRefs,
  ]);
  const usageRefs = uniqueStrings([
    ...refsFromRecord(semanticSummary, ['usage_ref', 'usage_refs', 'token_usage_ref', 'token_usage_refs']),
    ...refsFromRecord(input.routeImpact, ['usage_ref', 'usage_refs', 'token_usage_ref', 'token_usage_refs']),
    ...refsFromRecord(
      isRecord(input.routeImpact.usage_projection) ? input.routeImpact.usage_projection : null,
      ['usage_ref', 'usage_refs'],
    ),
  ]);
  const tokenUsageRefs = uniqueStrings([
    ...refsFromRecord(semanticSummary, ['token_usage_ref', 'token_usage_refs']),
    ...refsFromRecord(input.routeImpact, ['token_usage_ref', 'token_usage_refs']),
  ]);
  const costRefs = uniqueStrings([
    ...refsFromRecord(semanticSummary, ['cost_ref', 'cost_refs']),
    ...refsFromRecord(input.routeImpact, ['cost_ref', 'cost_refs']),
    ...refsFromRecord(
      isRecord(input.routeImpact.usage_projection) ? input.routeImpact.usage_projection : null,
      ['cost_ref', 'cost_refs'],
    ),
  ]);
  const semanticStatus = semanticSummary ? 'provided_by_domain' : 'missing_domain_semantic_summary';
  const progressDeltas = userStageLogProgressDeltas(
    semanticSummary,
    input.routeImpact,
    semanticStatus,
    progressDeltaKeys,
  );
  const observability = observabilityForUserStageLog(duration, tokens, cost);
  return {
    surface_kind: 'opl_user_stage_log',
    projection_policy: 'opl_time_usage_refs_plus_domain_provided_human_semantics_no_domain_inference',
    semantic_status: semanticStatus,
    observability_status: observability.observability_status,
    missing_observability_fields: observability.missing_observability_fields,
    semantic_source: semanticSource,
    stage_name: stageName,
    problem_summary: problemSummary,
    stage_goal: stageGoal,
    progress_delta_classification: progressDeltas.progress_delta_classification,
    deliverable_progress_delta: progressDeltas.deliverable_progress_delta,
    platform_repair_delta: progressDeltas.platform_repair_delta,
    next_forced_delta: progressDeltas.next_forced_delta,
    stage_work_done: stageWorkDone,
    changed_stage_surfaces: changedStageSurfaces,
    outcome,
    remaining_blockers: remainingBlockers,
    duration,
    token_usage: tokens,
    cost,
    usage_refs: usageRefs,
    token_usage_refs: tokenUsageRefs,
    cost_refs: costRefs,
    evidence_refs: evidenceRefs,
    semantic_gap: semanticSummary ? (
      progressDeltas.invalid_progress_delta_classification
        ? {
          reason: 'domain_closeout_provided_invalid_progress_delta_classification',
          raw_progress_delta_classification: progressDeltas.raw_progress_delta_classification,
          required_domain_fields: [
            'progress_delta_classification',
            'deliverable_progress_delta',
            'platform_repair_delta',
            'next_forced_delta',
            'evidence_refs',
          ],
        }
        : missingDomainFields.length > 0
          ? {
            reason: 'domain_closeout_provided_incomplete_user_stage_log',
            missing_domain_fields: missingDomainFields,
            required_domain_fields: [...REQUIRED_DOMAIN_STAGE_LOG_FIELDS],
          }
          : null
    ) : {
      reason: 'domain_closeout_did_not_provide_user_stage_log',
      required_domain_fields: [...REQUIRED_DOMAIN_STAGE_LOG_FIELDS],
    },
    authority_boundary: userStageLogAuthorityBoundary(),
  };
}

export function buildStageProgressLog(input: StageProgressLogInput) {
  const activityEvents = input.activityEvents.filter(isRecord);
  const runnerEvents = runnerProgressEvents(activityEvents);
  const ownerReceiptRefs = uniqueStrings([
    ...refsFromRecord(input.latestCloseout, [
      'owner_receipt_ref',
      'owner_receipt_refs',
      'domain_owner_receipt_ref',
      'domain_owner_receipt_refs',
    ]),
    ...refsFromRecord(input.routeImpact, [
      'owner_receipt_ref',
      'owner_receipt_refs',
      'domain_owner_receipt_ref',
      'domain_owner_receipt_refs',
    ]),
  ]);
  const typedBlockerRefs = uniqueStrings([
    ...refsFromRecord(input.latestCloseout, ['typed_blocker_ref', 'typed_blocker_refs']),
    ...refsFromRecord(input.routeImpact, ['typed_blocker_ref', 'typed_blocker_refs']),
  ]);
  const routeRefs = uniqueStrings([
    ...refsFromRecord(input.routeImpact, [
      'route_ref',
      'route_refs',
      'proposal_ref',
      'proposal_refs',
      'quality_ref',
      'quality_refs',
      'readiness_ref',
      'readiness_refs',
      'handoff_ref',
      'handoff_refs',
    ]),
    ...refsFromUnknown(input.workspaceLocator.dispatch_ref),
  ]);
  const sourceRefs = uniqueStrings(refsFromUnknown(input.workspaceLocator.source_refs));
  const dispatchRefs = uniqueStrings([
    ...refsFromUnknown(input.workspaceLocator.dispatch_ref),
    ...refsFromUnknown(input.workspaceLocator.dispatch_refs),
  ]);
  const durationMsObserved = numberValue(input.usageProjection.duration.duration_ms_observed);
  const userStageLog = buildUserStageLog(input, durationMsObserved);
  const memoryTraceProjection = buildMemoryTraceProjection({
    stage_attempt_id: input.stageAttemptId,
    domain_id: input.domainId,
    stage_id: input.stageId,
    consumed_memory_refs: input.consumedMemoryRefs,
    writeback_receipt_refs: input.writebackReceiptRefs,
    rejected_writes: recordList(input.latestCloseout?.rejected_writes),
    route_impact: input.routeImpact,
    workspace_locator: input.workspaceLocator,
  }, input.projectionScope ?? 'stage_attempt');
  const temporalVisibility = buildTemporalStageAttemptVisibility({
    providerKind: input.providerKind,
    stageAttemptId: input.stageAttemptId,
    workflowId: input.workflowId,
    domainId: input.domainId,
    stageId: input.stageId,
    status: input.status,
    stagePhase: stringValue(input.providerRun.current_phase) ?? input.status,
    blockedReason: input.blockedReason,
    taskId: input.taskId,
    sourceFingerprint: input.sourceFingerprint,
    executorKind: input.executorKind,
    providerRun: input.providerRun,
    visibilityReadiness: input.temporalVisibilityReadiness,
  });
  const runtimeCurrentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus: input.status,
    providerKind: input.providerKind,
    providerRun: input.providerRun,
  });
  const progressDeltaReceipt = progressDeltaReceiptForUserStageLog(input, userStageLog);
  return {
    surface_kind: 'opl_stage_progress_log',
    projection_scope: input.projectionScope ?? 'stage_attempt',
    projection_policy: 'temporal_backed_opl_refs_only_stage_observability_no_domain_truth',
    stage_attempt_id: input.stageAttemptId,
    domain_id: input.domainId,
    stage_id: input.stageId,
    temporal_visibility: temporalVisibility,
    runtime_currentness: runtimeCurrentness,
    temporal_webui_ref: buildTemporalWebUiRef(temporalVisibility),
    intended_work: {
      provider_kind: input.providerKind,
      executor_kind: input.executorKind,
      workflow_id: input.workflowId,
      domain_id: input.domainId,
      stage_id: input.stageId,
      task_id: input.taskId ?? null,
      source_fingerprint: input.sourceFingerprint ?? null,
      workspace_locator: input.workspaceLocator,
      workspace_root: stringValue(input.workspaceLocator.workspace_root),
      runtime_root: stringValue(input.workspaceLocator.runtime_root),
      artifact_root: stringValue(input.workspaceLocator.artifact_root),
      profile_ref: stringValue(input.workspaceLocator.profile_ref),
      source_refs: sourceRefs,
      dispatch_refs: dispatchRefs,
      stage_packet_refs: stagePacketRefs(input),
      retry_budget: {
        ...input.retryBudget,
        attempt_count: input.attemptCount,
        ...taskRetryBudgetProjection(numberValue(taskRetryBudgetMaxAttemptsValue(input.retryBudget))),
      },
    },
    actual_work: {
      status: input.status,
      effective_runtime_status: runtimeCurrentness.effective_runtime_status,
      runtime_currentness: runtimeCurrentness,
      blocked_reason: input.blockedReason ?? null,
      provider_status: stringValue(input.providerRun.provider_status),
      closeout_receipt_status: input.closeoutReceiptStatus ?? null,
      canonical_outcome: input.canonicalOutcome ?? null,
      closeout_refs: input.closeoutRefs,
      consumed_refs: input.consumedRefs,
      consumed_memory_refs: input.consumedMemoryRefs,
      writeback_receipt_refs: input.writebackReceiptRefs,
      rejected_writes: recordList(input.latestCloseout?.rejected_writes),
      rejected_write_count: recordList(input.latestCloseout?.rejected_writes).length,
      route_impact: input.routeImpact,
      route_decision: stringValue(input.routeImpact.decision),
      next_owner: input.nextOwner,
      domain_ready_verdict: input.domainReadyVerdict ?? null,
    },
    timeline: {
      created_at: input.createdAt ?? null,
      updated_at: input.updatedAt ?? null,
      provider_started_at: stringValue(input.providerRun.started_at),
      provider_completed_at: stringValue(input.providerRun.completed_at),
      last_heartbeat_at: stringValue(input.providerRun.last_heartbeat_at),
      first_activity_event_at: firstActivityAt(activityEvents),
      latest_activity_event_at: latestActivityAt(activityEvents),
      activity_event_count: activityEvents.length,
      runner_progress_event_count: runnerEvents.length,
      runner_progress_latest_event_kind: stringValue(runnerEvents.at(-1)?.runner_event_kind),
      duration_ms_observed: durationMsObserved,
      duration_telemetry_status: Number(input.usageProjection.duration.observed_count) > 0 ? 'observed' : 'missing',
      events: activityTimeline(input),
    },
    usage: input.usageProjection,
    model_route_cost_projection: input.modelRouteCostProjection,
    usage_telemetry: usageTelemetry(input),
    memory_trace_projection: memoryTraceProjection,
    user_stage_log: userStageLog,
    progress_delta_receipt: progressDeltaReceipt,
    evidence_refs: {
      checkpoint_refs: input.checkpointRefs,
      closeout_refs: input.closeoutRefs,
      consumed_refs: input.consumedRefs,
      consumed_memory_refs: input.consumedMemoryRefs,
      writeback_receipt_refs: input.writebackReceiptRefs,
      human_gate_refs: input.humanGateRefs ?? [],
      owner_receipt_refs: ownerReceiptRefs,
      typed_blocker_refs: typedBlockerRefs,
      route_refs: routeRefs,
      source_refs: sourceRefs,
      memory_trace_refs: uniqueStrings([
        ...memoryTraceProjection.consumed_memory_refs,
        ...memoryTraceProjection.recall_trace_refs,
        ...memoryTraceProjection.retrieval_trace_refs,
        ...memoryTraceProjection.writeback_receipt_refs,
        ...memoryTraceProjection.rejected_write_refs,
        ...memoryTraceProjection.source_refs,
      ]),
      dispatch_refs: dispatchRefs,
      stage_packet_refs: stagePacketRefs(input),
      activity_event_refs: activityEventRefs(input),
      progress_delta_receipt_refs: [progressDeltaReceipt.receipt_id],
      activity_event_count: activityEvents.length,
    },
    authority_boundary: stageProgressAuthorityBoundary(),
  };
}

export function summarizeStageProgressLogs(
  projections: StageProgressLogProjection[],
  projectionScope = 'stage_attempt_workbench',
) {
  const temporalLogs = projections.filter((projection) => projection.temporal_visibility);
  const temporalWebUiRefs = temporalLogs
    .map((projection) => stringValue(projection.temporal_webui_ref?.url))
    .filter((ref): ref is string => Boolean(ref));
  const usageMissing = projections.filter((projection) =>
    projection.usage_telemetry.telemetry_status === 'missing'
  );
  const durationObserved = projections.filter((projection) =>
    projection.timeline.duration_telemetry_status === 'observed'
  );
  const userDurationObserved = projections.filter((projection) =>
    projection.user_stage_log.duration.status === 'observed'
  );
  const userDurationFallback = projections.filter((projection) =>
    projection.user_stage_log.duration.telemetry_fallback_used === true
  );
  const activityEventRefs = uniqueStrings(projections.flatMap((projection) =>
    projection.evidence_refs.activity_event_refs
  ));
  const progressDeltaReceiptRefs = uniqueStrings(projections.flatMap((projection) =>
    projection.evidence_refs.progress_delta_receipt_refs
  ));
  return {
    surface_kind: 'opl_stage_progress_log_summary',
    projection_scope: projectionScope,
    attempt_count: projections.length,
    temporal_attempt_count: temporalLogs.length,
    completed_attempt_count: projections.filter((projection) =>
      projection.actual_work.status === 'completed'
    ).length,
    blocked_attempt_count: projections.filter((projection) =>
      ['blocked', 'failed', 'dead_lettered', 'human_gate'].includes(projection.actual_work.status)
    ).length,
    activity_event_count: projections.reduce((count, projection) =>
      count + projection.timeline.activity_event_count, 0
    ),
    runner_progress_event_count: projections.reduce((count, projection) =>
      count + projection.timeline.runner_progress_event_count, 0
    ),
    duration_observed_attempt_count: durationObserved.length,
    user_duration_observed_attempt_count: userDurationObserved.length,
    user_duration_fallback_attempt_count: userDurationFallback.length,
    missing_usage_telemetry_attempt_count: usageMissing.length,
    temporal_webui_ref_count: uniqueStrings(temporalWebUiRefs).length,
    temporal_visibility_readiness_statuses: uniqueStrings(temporalLogs
      .map((projection) => stringValue(projection.temporal_visibility?.visibility_readiness.readiness_status))
      .filter((entry): entry is string => Boolean(entry))),
    activity_event_ref_count: activityEventRefs.length,
    progress_delta_receipt_ref_count: progressDeltaReceiptRefs.length,
    attempt_refs: projections.map((projection) =>
      `/stage_attempt_workbench/attempts/${projection.stage_attempt_id}/stage_progress_log`
    ),
    progress_delta_receipt_refs: progressDeltaReceiptRefs,
    temporal_webui_refs: uniqueStrings(temporalWebUiRefs),
    authority_boundary: stageProgressAuthorityBoundary(),
  };
}
