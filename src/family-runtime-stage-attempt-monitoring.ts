import { DatabaseSync } from 'node:sqlite';

import {
  inspectFamilyRuntimeProviderWithLifecycle,
} from './family-runtime-providers.ts';
import {
  buildStageAttemptCurrentProviderReadinessPayload,
} from './family-runtime-stage-attempts.ts';
import {
  listStageAttemptRows,
  parseStageAttemptJsonObject,
  stageAttemptToPayload,
} from './family-runtime-stage-attempt-ledger.ts';
import { buildStageProgressLog } from './family-runtime-stage-progress-log.ts';
import type {
  FamilyRuntimeDomainId,
  FamilyRuntimeProviderKind,
} from './family-runtime-types.ts';

type ProviderReadinessPaths = {
  root: string;
};

type ProviderReadinessOptions = {
  managedProviderProjection?: {
    managed_temporal_state_consistency?: Record<string, unknown> | null;
  } | null;
};

type StageAttemptPayload = ReturnType<typeof stageAttemptToPayload>;

export type StageAttemptMonitoringFilters = {
  domainId?: FamilyRuntimeDomainId;
  status?: string;
  studyId?: string;
  sinceHours?: number;
  compactTimeline?: boolean;
};

async function providerReadinessByKind(
  attempts: StageAttemptPayload[],
  paths: ProviderReadinessPaths,
  options: ProviderReadinessOptions,
) {
  const providerKinds = [...new Set(attempts.map((attempt) => attempt.provider_kind))];
  const entries = await Promise.all(providerKinds.map(async (providerKind) => {
    const provider = await inspectFamilyRuntimeProviderWithLifecycle(providerKind, paths, options);
    return [providerKind, buildStageAttemptCurrentProviderReadinessPayload(provider, providerKind)] as const;
  }));
  return new Map(entries);
}

function attachCurrentProviderReadiness(
  attempt: StageAttemptPayload,
  readinessByKind: Map<FamilyRuntimeProviderKind, ReturnType<typeof buildStageAttemptCurrentProviderReadinessPayload>>,
) {
  return {
    ...attempt,
    current_provider_readiness: readinessByKind.get(attempt.provider_kind) ?? null,
  };
}

function studyIdFromAttempt(attempt: StageAttemptPayload) {
  const workspaceStudyId = attempt.workspace_locator.study_id;
  return typeof workspaceStudyId === 'string' && workspaceStudyId.trim()
    ? workspaceStudyId.trim()
    : null;
}

function taskPayloadForAttempt(db: DatabaseSync, taskId: string | null) {
  if (!taskId) {
    return null;
  }
  const row = db.prepare('SELECT payload_json FROM tasks WHERE task_id = ?').get(taskId) as
    | { payload_json: string }
    | undefined;
  if (!row) {
    return null;
  }
  return parseStageAttemptJsonObject(row.payload_json);
}

function addStudyIdentity(values: string[], value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    values.push(value.trim());
  }
}

function addStudyIdentityList(values: string[], value: unknown) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      addStudyIdentity(values, entry);
    }
    return;
  }
  addStudyIdentity(values, value);
}

function studyIdentitiesFromRecord(record: Record<string, unknown> | null) {
  const values: string[] = [];
  if (!record) {
    return values;
  }
  addStudyIdentity(values, record.study_id);
  addStudyIdentity(values, record.studyId);
  addStudyIdentity(values, record.study_short_id);
  addStudyIdentity(values, record.studyShortId);
  addStudyIdentityList(values, record.target_studies);
  addStudyIdentityList(values, record.targetStudies);
  addStudyIdentity(values, record.quest_id);
  addStudyIdentity(values, record.questId);
  addStudyIdentityList(values, record.study_aliases);
  addStudyIdentityList(values, record.studyAliases);
  return values;
}

function firstStudyIdentityFromRecord(record: Record<string, unknown> | null) {
  return studyIdentitiesFromRecord(record)[0] ?? null;
}

function attemptStudyIdentities(db: DatabaseSync, attempt: StageAttemptPayload) {
  const values = [
    ...studyIdentitiesFromRecord(attempt.workspace_locator),
    ...studyIdentitiesFromRecord(taskPayloadForAttempt(db, attempt.task_id)),
  ];
  return [...new Set(values)];
}

function attemptStudyId(db: DatabaseSync, attempt: StageAttemptPayload) {
  return studyIdFromAttempt(attempt)
    ?? firstStudyIdentityFromRecord(taskPayloadForAttempt(db, attempt.task_id))
    ?? firstStudyIdentityFromRecord(attempt.workspace_locator);
}

function attemptMatchesMonitoringFilters(
  db: DatabaseSync,
  attempt: StageAttemptPayload,
  filters: StageAttemptMonitoringFilters = {},
  sinceIso: string | null,
) {
  return (!filters.domainId || attempt.domain_id === filters.domainId)
    && (!filters.status || attempt.status === filters.status)
    && (!sinceIso || attempt.updated_at >= sinceIso || attempt.created_at >= sinceIso)
    && (!filters.studyId || attemptStudyIdentities(db, attempt).includes(filters.studyId));
}

function latestCloseoutPacket(db: DatabaseSync, stageAttemptId: string) {
  const row = db.prepare(`
    SELECT packet_json FROM stage_attempt_closeouts
    WHERE stage_attempt_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(stageAttemptId) as { packet_json: string } | undefined;
  return row ? parseStageAttemptJsonObject(row.packet_json) : null;
}

function compactTimelineOperatorSummary(
  attempt: StageAttemptPayload,
  studyId: string | null,
  stageProgressLog: ReturnType<typeof buildStageProgressLog>,
) {
  const userStageLog = stageProgressLog.user_stage_log;
  return {
    attempt: attempt.stage_attempt_id,
    status: attempt.status,
    stage: attempt.stage_id,
    study: studyId,
    domain: attempt.domain_id,
    action: 'opl_family_runtime_attempt_query',
    owner: stageProgressLog.actual_work.next_owner,
    started_at: stageProgressLog.timeline.provider_started_at,
    completed_at: stageProgressLog.timeline.provider_completed_at,
    last_heartbeat_at: stageProgressLog.timeline.last_heartbeat_at,
    progress_delta_classification: userStageLog.progress_delta_classification,
    evidence_refs: stageProgressLog.evidence_refs,
    closeout_refs: stageProgressLog.evidence_refs.closeout_refs,
    semantic_gap: userStageLog.semantic_gap,
    next_inspection_hint: {
      command: `opl family-runtime attempt query ${attempt.stage_attempt_id}`,
      reason: userStageLog.semantic_gap
        ? 'domain_semantic_summary_missing_or_invalid_inspect_attempt_query_and_domain_closeout_refs'
        : 'inspect_attempt_query_for_full_stage_progress_log',
      expected_next_delta: userStageLog.next_forced_delta,
      authority_boundary: userStageLog.authority_boundary,
    },
  };
}

function compactTimelineForAttempt(db: DatabaseSync, attempt: StageAttemptPayload) {
  const studyId = attemptStudyId(db, attempt);
  const stageProgressLog = buildStageProgressLog({
    stageAttemptId: attempt.stage_attempt_id,
    projectionScope: 'attempt_list_compact_timeline',
    providerKind: attempt.provider_kind,
    executorKind: attempt.executor_kind,
    domainId: attempt.domain_id,
    stageId: attempt.stage_id,
    workflowId: attempt.workflow_id,
    taskId: attempt.task_id,
    workspaceLocator: attempt.workspace_locator,
    sourceFingerprint: attempt.source_fingerprint,
    status: attempt.status,
    blockedReason: attempt.blocked_reason,
    checkpointRefs: attempt.checkpoint_refs.filter((entry): entry is string => typeof entry === 'string'),
    closeoutRefs: attempt.closeout_refs.filter((entry): entry is string => typeof entry === 'string'),
    consumedRefs: [],
    consumedMemoryRefs: [],
    writebackReceiptRefs: [],
    humanGateRefs: attempt.human_gate_refs.filter((entry): entry is string => typeof entry === 'string'),
    retryBudget: attempt.retry_budget,
    attemptCount: attempt.attempt_count,
    providerRun: attempt.provider_run,
    temporalVisibilityReadiness: null,
    activityEvents: attempt.activity_events,
    routeImpact: attempt.route_impact,
    latestCloseout: latestCloseoutPacket(db, attempt.stage_attempt_id),
    closeoutReceiptStatus: attempt.closeout_receipt_status,
    nextOwner: typeof attempt.route_impact.next_owner === 'string' ? attempt.route_impact.next_owner : 'domain_owner',
    domainReadyVerdict: typeof attempt.route_impact.domain_ready_verdict === 'string'
      ? attempt.route_impact.domain_ready_verdict
      : null,
    canonicalOutcome: null,
    usageProjection: attempt.usage_projection,
    modelRouteCostProjection: attempt.model_route_cost_projection,
    createdAt: attempt.created_at,
    updatedAt: attempt.updated_at,
  });
  const operatorSummary = compactTimelineOperatorSummary(attempt, studyId, stageProgressLog);
  return {
    stage_attempt_id: attempt.stage_attempt_id,
    task_id: attempt.task_id,
    domain_id: attempt.domain_id,
    study_id: studyId,
    stage_id: attempt.stage_id,
    status: attempt.status,
    blocked_reason: attempt.blocked_reason,
    updated_at: attempt.updated_at,
    progress_delta_classification: stageProgressLog.user_stage_log.progress_delta_classification,
    deliverable_progress_delta: stageProgressLog.user_stage_log.deliverable_progress_delta,
    platform_repair_delta: stageProgressLog.user_stage_log.platform_repair_delta,
    next_forced_delta: stageProgressLog.user_stage_log.next_forced_delta,
    semantic_status: stageProgressLog.user_stage_log.semantic_status,
    duration: stageProgressLog.user_stage_log.duration,
    token_usage: stageProgressLog.user_stage_log.token_usage,
    evidence_refs: stageProgressLog.user_stage_log.evidence_refs,
    timeline: {
      created_at: stageProgressLog.timeline.created_at,
      updated_at: stageProgressLog.timeline.updated_at,
      provider_started_at: stageProgressLog.timeline.provider_started_at,
      provider_completed_at: stageProgressLog.timeline.provider_completed_at,
      last_heartbeat_at: stageProgressLog.timeline.last_heartbeat_at,
      latest_activity_event_at: stageProgressLog.timeline.latest_activity_event_at,
      activity_event_count: stageProgressLog.timeline.activity_event_count,
    },
    semantic_gap: stageProgressLog.user_stage_log.semantic_gap,
    next_inspection_hint: operatorSummary.next_inspection_hint,
    operator_summary: operatorSummary,
    authority_boundary: stageProgressLog.authority_boundary,
  };
}

export async function listStageAttemptsWithMonitoringProjection(
  db: DatabaseSync,
  paths: ProviderReadinessPaths,
  options: ProviderReadinessOptions = {},
  filters: StageAttemptMonitoringFilters = {},
) {
  const sinceIso = typeof filters.sinceHours === 'number'
    ? new Date(Date.now() - filters.sinceHours * 60 * 60 * 1000).toISOString()
    : null;
  const baseAttempts = listStageAttemptRows(db).map(stageAttemptToPayload);
  const filteredAttempts = baseAttempts.filter((attempt) =>
    attemptMatchesMonitoringFilters(db, attempt, filters, sinceIso)
  );
  const readinessByKind = filters.compactTimeline
    ? null
    : await providerReadinessByKind(filteredAttempts, paths, options);
  return {
    filters: {
      domain_id: filters.domainId ?? null,
      status: filters.status ?? null,
      study_id: filters.studyId ?? null,
      since_hours: filters.sinceHours ?? null,
      since_at: sinceIso,
      compact_timeline: filters.compactTimeline === true,
    },
    summary: {
      total: baseAttempts.length,
      filtered_total: filteredAttempts.length,
      by_status: Object.fromEntries(
        [...new Set(filteredAttempts.map((attempt) => attempt.status))].sort().map((status) => [
          status,
          filteredAttempts.filter((attempt) => attempt.status === status).length,
        ]),
      ),
    },
    attempts: readinessByKind
      ? filteredAttempts.map((attempt) => attachCurrentProviderReadiness(attempt, readinessByKind))
      : filteredAttempts,
    compact_timeline: filters.compactTimeline
      ? filteredAttempts.map((attempt) => compactTimelineForAttempt(db, attempt))
      : null,
  };
}
