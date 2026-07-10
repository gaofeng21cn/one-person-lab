import { DatabaseSync } from 'node:sqlite';

import {
  inspectFamilyRuntimeProviderWithLifecycle,
  isFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import {
  buildStageAttemptCurrentProviderReadinessPayload,
  providerReadinessCurrentness,
} from './family-runtime-stage-attempt-provider-readiness-currentness.ts';
import {
  listStageAttemptRows,
  parseStageAttemptJsonObject,
  stageAttemptToPayload,
} from './family-runtime-stage-attempt-ledger.ts';
import { buildStageProgressLog } from './family-runtime-stage-progress-log.ts';
import { buildStageAttemptRuntimeCurrentness } from './family-runtime-stage-attempt-runtime-currentness.ts';
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
    managed_temporal_state_consistency_declared?: boolean;
    family_stage_control_plane_declared?: boolean;
    domain_memory_descriptor_declared?: boolean;
    owner_receipt_contract_declared?: boolean;
    legacy_retirement_tombstone_declared?: boolean;
  } | null;
};

type StageAttemptPayload = ReturnType<typeof stageAttemptToPayload>;
type CurrentProviderReadiness =
  | ReturnType<typeof buildStageAttemptCurrentProviderReadinessPayload>
  | ReturnType<typeof retiredLocalSqliteProviderReadiness>;
type ProviderReadinessCurrentness = ReturnType<typeof providerReadinessCurrentness>;
type StageProgressLog = ReturnType<typeof buildStageProgressLog>;

const COMPACT_TIMELINE_REF_LIMIT = 5;
const COMPACT_TIMELINE_ATTEMPT_LIMIT = 25;
const COMPACT_TIMELINE_EVIDENCE_REF_FAMILIES = [
  'checkpoint_refs',
  'closeout_refs',
  'owner_receipt_refs',
  'typed_blocker_refs',
  'human_gate_refs',
  'dispatch_refs',
  'stage_packet_refs',
] as const;

export type StageAttemptMonitoringFilters = {
  domainId?: FamilyRuntimeDomainId;
  status?: string;
  studyId?: string;
  sinceHours?: number;
  compactTimeline?: boolean;
  full?: boolean;
};

async function providerReadinessByKind(
  attempts: StageAttemptPayload[],
  paths: ProviderReadinessPaths,
  options: ProviderReadinessOptions,
) {
  const providerKinds = [...new Set(attempts.map((attempt) => String(attempt.provider_kind)))];
  const entries: Array<[string, CurrentProviderReadiness]> = await Promise.all(providerKinds.map(async (providerKind) => {
    if (providerKind === 'local_sqlite') {
      return [providerKind, retiredLocalSqliteProviderReadiness()];
    }
    if (!isFamilyRuntimeProviderKind(providerKind)) {
      const provider = await inspectFamilyRuntimeProviderWithLifecycle(providerKind as never, paths, options);
      return [providerKind, buildStageAttemptCurrentProviderReadinessPayload(provider, providerKind as never)];
    }
    const provider = await inspectFamilyRuntimeProviderWithLifecycle(providerKind, paths, options);
    return [providerKind, buildStageAttemptCurrentProviderReadinessPayload(provider, providerKind)];
  }));
  return new Map<string, CurrentProviderReadiness>(entries);
}

function retiredLocalSqliteProviderReadiness() {
  return {
    surface_kind: 'stage_attempt_retired_provider_readiness_diagnostic',
    provider_kind: 'local_sqlite',
    provider_ready: false,
    status: 'retired_runtime_provider',
    degraded_reason: 'local_sqlite_retired_runtime_provider',
    capabilities: [],
    details: {
      provider_role: 'retired_runtime_provider',
      selected_runtime_provider: 'temporal',
      production_required_provider: 'temporal',
      local_sqlite_role: 'projection_and_readback_index_only',
      diagnostic: 'retired_attempt_provider_kind_observed',
      remediation: 'query_attempts_through_temporal_backed_projection_before_redrive_or_owner_escalation',
    },
    provider_receipt_is_creation_time_snapshot: true,
    authority_boundary: {
      opl: 'retired_provider_projection_diagnostic_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

function retiredProviderEnvDiagnostic() {
  const configured = process.env.OPL_FAMILY_RUNTIME_PROVIDER?.trim();
  if (configured !== 'local_sqlite') {
    return null;
  }
  return {
    env: 'OPL_FAMILY_RUNTIME_PROVIDER',
    configured_provider: configured,
    selected_runtime_provider: 'temporal',
    diagnostic_status: 'retired_env_provider_ignored_for_attempt_projection',
    reason: 'local_sqlite_retired_runtime_provider',
    local_sqlite_role: 'projection_and_readback_index_only',
  };
}

function attachCurrentProviderReadiness(
  attempt: StageAttemptPayload,
  readinessByKind: Map<string, CurrentProviderReadiness>,
) {
  const currentProviderReadiness = readinessByKind.get(attempt.provider_kind) ?? null;
  const runtimeCurrentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus: attempt.status,
    providerKind: attempt.provider_kind,
    providerRun: attempt.provider_run,
  });
  return {
    ...attempt,
    effective_runtime_status: runtimeCurrentness.effective_runtime_status,
    runtime_currentness: runtimeCurrentness,
    current_provider_readiness: currentProviderReadiness,
    provider_readiness_currentness: providerReadinessCurrentness(currentProviderReadiness, {
      currentProviderReadinessRef: 'attempt.current_provider_readiness',
      creationReceiptRef: 'attempt.provider_receipt',
    }),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function providerLivenessAttention(
  currentProviderReadiness: CurrentProviderReadiness | null,
  refs: {
    currentProviderReadinessRef: string;
    attemptRef: string;
  },
) {
  if (!currentProviderReadiness) {
    return {
      surface_kind: 'stage_attempt_provider_liveness_attention',
      attention_status: 'unknown',
      severity: 'diagnostic',
      reason: 'current_provider_readiness_missing',
      provider_kind: null,
      provider_ready: null,
      worker_lifecycle_status: null,
      repair_action_id: null,
      next_command: null,
      progress_first_effect: 'inspect_current_provider_readiness_before_interpreting_attempt_progress',
      current_provider_readiness_ref: null,
      attempt_ref: refs.attemptRef,
      authority_boundary: {
        opl: 'provider_liveness_operator_attention_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        can_authorize_quality_verdict: false,
      },
    };
  }
  if (currentProviderReadiness.provider_ready === true) {
    return {
      surface_kind: 'stage_attempt_provider_liveness_attention',
      attention_status: 'none',
      severity: 'none',
      reason: null,
      provider_kind: currentProviderReadiness.provider_kind,
      provider_ready: true,
      worker_lifecycle_status: null,
      repair_action_id: null,
      next_command: null,
      progress_first_effect: 'provider_live_continue_with_stage_progress_evidence',
      current_provider_readiness_ref: refs.currentProviderReadinessRef,
      attempt_ref: refs.attemptRef,
      authority_boundary: {
        opl: 'provider_liveness_operator_attention_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        can_authorize_quality_verdict: false,
      },
    };
  }

  const details = record(currentProviderReadiness.details);
  const workerReadiness = record(details.worker_readiness);
  const repairAction = record(workerReadiness.repair_action);
  const workerLifecycleStatus = stringValue(workerReadiness.lifecycle_status)
    ?? stringValue(workerReadiness.readiness_status);
  const repairActionId = stringValue(repairAction.action_id);
  const nextCommand = stringValue(repairAction.next_command)
    ?? (currentProviderReadiness.provider_kind === 'temporal'
      ? 'opl family-runtime worker status --provider temporal'
      : null);
  const providerReason = currentProviderReadiness.degraded_reason
    ?? stringValue(currentProviderReadiness.status)
    ?? 'provider_not_ready';

  return {
    surface_kind: 'stage_attempt_provider_liveness_attention',
    attention_status: 'blocked_provider_not_ready',
    severity: 'blocking',
    reason: providerReason,
    provider_kind: currentProviderReadiness.provider_kind,
    provider_ready: false,
    worker_lifecycle_status: workerLifecycleStatus,
    repair_action_id: repairActionId,
    next_command: nextCommand,
    progress_first_effect: 'attempt_exists_but_provider_not_live_repair_provider_before_read_model_reconcile',
    current_provider_readiness_ref: refs.currentProviderReadinessRef,
    attempt_ref: refs.attemptRef,
    authority_boundary: {
      opl: 'provider_liveness_operator_attention_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
    },
  };
}

function compactProviderReadiness(
  currentProviderReadiness: CurrentProviderReadiness | null,
) {
  if (!currentProviderReadiness) {
    return null;
  }
  const details = record(currentProviderReadiness.details);
  const workerReadiness = record(details.worker_readiness);
  const repairAction = record(workerReadiness.repair_action);
  const managedDomainProjectionSummary = record(details.managed_domain_projection_summary);
  const temporalVisibilityReadiness = record(details.temporal_visibility_readiness);
  const managedTemporalProjectionReadiness = record(details.managed_temporal_projection_readiness);
  return {
    surface_kind: 'stage_attempt_current_provider_readiness_compact_ref',
    provider_kind: currentProviderReadiness.provider_kind,
    provider_ready: currentProviderReadiness.provider_ready,
    status: currentProviderReadiness.status,
    degraded_reason: currentProviderReadiness.degraded_reason,
    capability_count: currentProviderReadiness.capabilities.length,
    capability_refs_omitted_count: currentProviderReadiness.capabilities.length,
    worker_readiness_summary: Object.keys(workerReadiness).length > 0
      ? {
          readiness_status: stringValue(workerReadiness.readiness_status),
          lifecycle_status: stringValue(workerReadiness.lifecycle_status),
          worker_ready: typeof workerReadiness.worker_ready === 'boolean'
            ? workerReadiness.worker_ready
            : null,
          blocker_count: Array.isArray(workerReadiness.blockers) ? workerReadiness.blockers.length : 0,
          first_blocker: Array.isArray(workerReadiness.blockers)
            ? stringValue(workerReadiness.blockers[0])
            : null,
          repair_action_id: stringValue(repairAction.action_id),
          repair_next_command: stringValue(repairAction.next_command),
        }
      : null,
    temporal_visibility_summary: Object.keys(temporalVisibilityReadiness).length > 0
      ? {
          readiness_status: stringValue(temporalVisibilityReadiness.readiness_status),
          ready: typeof temporalVisibilityReadiness.ready === 'boolean'
            ? temporalVisibilityReadiness.ready
            : null,
        }
      : null,
    managed_domain_projection_summary: Object.keys(managedDomainProjectionSummary).length > 0
      ? managedDomainProjectionSummary
      : null,
    managed_temporal_projection_readiness_summary: Object.keys(managedTemporalProjectionReadiness).length > 0
      ? {
          readiness_status: stringValue(managedTemporalProjectionReadiness.readiness_status),
          lifecycle_status: stringValue(managedTemporalProjectionReadiness.lifecycle_status),
          projection_status: stringValue(managedTemporalProjectionReadiness.projection_status),
          projection_declares_service_ready:
            typeof managedTemporalProjectionReadiness.projection_declares_service_ready === 'boolean'
              ? managedTemporalProjectionReadiness.projection_declares_service_ready
              : null,
          projection_declares_worker_ready:
            typeof managedTemporalProjectionReadiness.projection_declares_worker_ready === 'boolean'
              ? managedTemporalProjectionReadiness.projection_declares_worker_ready
              : null,
          provider_ready_effect: stringValue(managedTemporalProjectionReadiness.provider_ready_effect),
        }
      : null,
    omitted_payloads: [
      'details',
      'managed_temporal_state_consistency',
      'managed_domain_provider_projection_summary',
      'domain_manifest',
      'payload_body',
    ],
    provider_receipt_is_creation_time_snapshot:
      currentProviderReadiness.provider_receipt_is_creation_time_snapshot,
    authority_boundary: currentProviderReadiness.authority_boundary,
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

function compactRefList(value: unknown) {
  const refs = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    refs: refs.slice(0, COMPACT_TIMELINE_REF_LIMIT),
    omitted_count: Math.max(0, refs.length - COMPACT_TIMELINE_REF_LIMIT),
    total_count: refs.length,
  };
}

function compactEvidenceRefs(evidenceRefs: StageProgressLog['evidence_refs']) {
  const entries = COMPACT_TIMELINE_EVIDENCE_REF_FAMILIES.map((key) => [
    key,
    compactRefList(evidenceRefs[key]),
  ]);
  const included = new Set(COMPACT_TIMELINE_EVIDENCE_REF_FAMILIES);
  const omittedFamilies = Object.keys(evidenceRefs).filter((key) => !included.has(key as never));
  return Object.assign(Object.fromEntries(entries), {
    omitted_ref_families: omittedFamilies,
  });
}

function compactProgressDelta(value: unknown) {
  const delta = record(value);
  const refs = compactRefList(delta.delta_refs);
  return {
    delta_count: typeof delta.delta_count === 'number' ? delta.delta_count : refs.total_count,
    has_delta: typeof delta.has_deliverable_delta === 'boolean'
      ? delta.has_deliverable_delta
      : typeof delta.has_platform_repair_delta === 'boolean'
        ? delta.has_platform_repair_delta
        : refs.total_count > 0,
    delta_refs: refs.refs,
    omitted_ref_count: refs.omitted_count,
    delta_summary: stringValue(delta.delta_summary),
  };
}

function compactSemanticGap(value: unknown) {
  const gap = record(value);
  if (Object.keys(gap).length === 0) {
    return null;
  }
  const requiredFields = Array.isArray(gap.required_domain_fields)
    ? gap.required_domain_fields.filter((entry): entry is string => typeof entry === 'string')
    : [];
  return {
    reason: stringValue(gap.reason),
    required_domain_fields: requiredFields.slice(0, COMPACT_TIMELINE_REF_LIMIT),
    required_domain_field_count: requiredFields.length,
    omitted_required_domain_field_count: Math.max(
      0,
      requiredFields.length - COMPACT_TIMELINE_REF_LIMIT,
    ),
  };
}

function compactNextInspectionHint(userStageLog: StageProgressLog['user_stage_log'], stageAttemptId: string) {
  return {
    command: `opl family-runtime attempt query ${stageAttemptId}`,
    reason: userStageLog.semantic_gap
      ? 'domain_semantic_summary_missing_or_invalid_inspect_attempt_query_and_domain_closeout_refs'
      : 'inspect_attempt_query_for_full_stage_progress_log',
    expected_next_delta: userStageLog.next_forced_delta,
    authority_boundary: userStageLog.authority_boundary,
  };
}

function providerReadinessSummary(currentProviderReadiness: CurrentProviderReadiness | null) {
  const compactReadiness = compactProviderReadiness(currentProviderReadiness);
  if (!compactReadiness) {
    return {
      provider_kind: null,
      provider_ready: null,
      provider_status: null,
      provider_degraded_reason: null,
      worker_readiness_status: null,
      worker_lifecycle_status: null,
      repair_action_id: null,
      repair_next_command: null,
    };
  }
  const workerSummary = record(compactReadiness.worker_readiness_summary);
  return {
    provider_kind: compactReadiness.provider_kind,
    provider_ready: compactReadiness.provider_ready,
    provider_status: compactReadiness.status,
    provider_degraded_reason: compactReadiness.degraded_reason,
    worker_readiness_status: stringValue(workerSummary.readiness_status),
    worker_lifecycle_status: stringValue(workerSummary.lifecycle_status),
    repair_action_id: stringValue(workerSummary.repair_action_id),
    repair_next_command: stringValue(workerSummary.repair_next_command),
  };
}

function refCount(value: unknown) {
  const summary = record(value);
  return typeof summary.total_count === 'number' ? summary.total_count : 0;
}

function livenessSummary(value: unknown) {
  const attention = record(value);
  return {
    attention_status: stringValue(attention.attention_status),
    severity: stringValue(attention.severity),
    reason: stringValue(attention.reason),
    next_command: stringValue(attention.next_command),
    progress_first_effect: stringValue(attention.progress_first_effect),
  };
}

function compactAuthorityBoundary(value: unknown) {
  const boundary = record(value);
  return {
    opl: stringValue(boundary.opl),
    domain: stringValue(boundary.domain),
    can_write_domain_truth: typeof boundary.can_write_domain_truth === 'boolean'
      ? boundary.can_write_domain_truth
      : null,
    can_authorize_quality_verdict: typeof boundary.can_authorize_quality_verdict === 'boolean'
      ? boundary.can_authorize_quality_verdict
      : null,
    provider_completion_is_domain_ready:
      typeof boundary.provider_completion_is_domain_ready === 'boolean'
        ? boundary.provider_completion_is_domain_ready
        : null,
  };
}

function compactTiming(stageProgressLog: StageProgressLog) {
  return {
    created_at: stageProgressLog.timeline.created_at,
    updated_at: stageProgressLog.timeline.updated_at,
    provider_started_at: stageProgressLog.timeline.provider_started_at,
    provider_completed_at: stageProgressLog.timeline.provider_completed_at,
    last_heartbeat_at: stageProgressLog.timeline.last_heartbeat_at,
    latest_activity_event_at: stageProgressLog.timeline.latest_activity_event_at,
    activity_event_count: stageProgressLog.timeline.activity_event_count,
  };
}

function compactDuration(value: unknown) {
  const duration = record(value);
  return {
    status: stringValue(duration.status),
    duration_ms: typeof duration.duration_ms === 'number' ? duration.duration_ms : null,
    duration_source: stringValue(duration.duration_source),
    telemetry_fallback_used: typeof duration.telemetry_fallback_used === 'boolean'
      ? duration.telemetry_fallback_used
      : null,
  };
}

function compactTokenUsage(value: unknown) {
  const usage = record(value);
  return {
    status: stringValue(usage.status),
    input_tokens: typeof usage.input_tokens === 'number' ? usage.input_tokens : null,
    output_tokens: typeof usage.output_tokens === 'number' ? usage.output_tokens : null,
    total_tokens: typeof usage.total_tokens === 'number' ? usage.total_tokens : null,
    observed_count: typeof usage.observed_count === 'number' ? usage.observed_count : null,
  };
}

function compactOperatorSummary(input: {
  attempt: StageAttemptPayload;
  studyId: string | null;
  stageProgressLog: StageProgressLog;
  currentProviderReadiness: CurrentProviderReadiness | null;
  providerReadinessCurrentness: ProviderReadinessCurrentness;
  livenessAttention: ReturnType<typeof providerLivenessAttention>;
  evidenceRefs: ReturnType<typeof compactEvidenceRefs>;
  semanticGap: ReturnType<typeof compactSemanticGap>;
  nextInspectionHint: ReturnType<typeof compactNextInspectionHint>;
}) {
  return {
    attempt: input.attempt.stage_attempt_id,
    task: input.attempt.task_id,
    status: input.attempt.status,
    effective_runtime_status: input.stageProgressLog.runtime_currentness.effective_runtime_status,
    runtime_currentness: input.stageProgressLog.runtime_currentness,
    stage: input.attempt.stage_id,
    study: input.studyId,
    domain: input.attempt.domain_id,
    action: 'opl_family_runtime_attempt_query',
    owner: input.stageProgressLog.actual_work.next_owner,
    timing: {
      started_at: input.stageProgressLog.timeline.provider_started_at,
      completed_at: input.stageProgressLog.timeline.provider_completed_at,
      last_heartbeat_at: input.stageProgressLog.timeline.last_heartbeat_at,
      activity_event_count: input.stageProgressLog.timeline.activity_event_count,
    },
    provider_readiness: providerReadinessSummary(input.currentProviderReadiness),
    provider_readiness_currentness: input.providerReadinessCurrentness,
    provider_liveness_attention: livenessSummary(input.livenessAttention),
    progress_delta_classification:
      input.stageProgressLog.user_stage_log.progress_delta_classification,
    closeout_refs: input.evidenceRefs.closeout_refs.refs,
    closeout_ref_count: refCount(input.evidenceRefs.closeout_refs),
    owner_receipt_ref_count: refCount(input.evidenceRefs.owner_receipt_refs),
    typed_blocker_ref_count: refCount(input.evidenceRefs.typed_blocker_refs),
    semantic_gap_reason: input.semanticGap?.reason ?? null,
    next_inspection: {
      command: input.nextInspectionHint.command,
      reason: input.nextInspectionHint.reason,
      expected_next_delta: input.nextInspectionHint.expected_next_delta,
    },
  };
}

function compactTimelineOperatorSummary(
  attempt: StageAttemptPayload,
  studyId: string | null,
  stageProgressLog: StageProgressLog,
  currentProviderReadiness: CurrentProviderReadiness | null,
  providerReadinessCurrentness: ProviderReadinessCurrentness,
) {
  const evidenceRefs = compactEvidenceRefs(stageProgressLog.evidence_refs);
  const livenessAttention = providerLivenessAttention(currentProviderReadiness, {
    currentProviderReadinessRef: 'compact_timeline.current_provider_readiness',
    attemptRef: `opl://stage_attempts/${attempt.stage_attempt_id}`,
  });
  const semanticGap = compactSemanticGap(stageProgressLog.user_stage_log.semantic_gap);
  const nextInspectionHint = compactNextInspectionHint(
    stageProgressLog.user_stage_log,
    attempt.stage_attempt_id,
  );
  return compactOperatorSummary({
    attempt,
    studyId,
    stageProgressLog,
    currentProviderReadiness,
    providerReadinessCurrentness,
    livenessAttention,
    evidenceRefs,
    semanticGap,
    nextInspectionHint,
  });
}

function compactTimelineForAttempt(
  db: DatabaseSync,
  attempt: StageAttemptPayload,
  currentProviderReadiness: CurrentProviderReadiness | null,
  options: { auditSafe?: boolean } = {},
) {
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
  const readinessCurrentness = providerReadinessCurrentness(currentProviderReadiness, {
    currentProviderReadinessRef: 'compact_timeline.current_provider_readiness',
    creationReceiptRef: 'compact_timeline.provider_receipt',
  });
  const livenessAttention = providerLivenessAttention(currentProviderReadiness, {
    currentProviderReadinessRef: 'compact_timeline.current_provider_readiness',
    attemptRef: `opl://stage_attempts/${attempt.stage_attempt_id}`,
  });
  const evidenceRefs = compactEvidenceRefs(stageProgressLog.evidence_refs);
  const semanticGap = compactSemanticGap(stageProgressLog.user_stage_log.semantic_gap);
  const nextInspectionHint = compactNextInspectionHint(
    stageProgressLog.user_stage_log,
    attempt.stage_attempt_id,
  );
  const operatorSummary = compactTimelineOperatorSummary(
    attempt,
    studyId,
    stageProgressLog,
    currentProviderReadiness,
    readinessCurrentness,
  );
  const base = {
    stage_attempt_id: attempt.stage_attempt_id,
    task_id: attempt.task_id,
    provider_kind: attempt.provider_kind,
    domain_id: attempt.domain_id,
    study_id: studyId,
    stage_id: attempt.stage_id,
    status: attempt.status,
    effective_runtime_status: stageProgressLog.runtime_currentness.effective_runtime_status,
    runtime_currentness: stageProgressLog.runtime_currentness,
    blocked_reason: attempt.blocked_reason,
    current_provider_readiness: compactProviderReadiness(currentProviderReadiness),
    provider_readiness_currentness: readinessCurrentness,
    provider_liveness_attention: livenessAttention,
    updated_at: attempt.updated_at,
    progress_delta_classification: stageProgressLog.user_stage_log.progress_delta_classification,
    deliverable_progress_delta: compactProgressDelta(
      stageProgressLog.user_stage_log.deliverable_progress_delta,
    ),
    platform_repair_delta: compactProgressDelta(
      stageProgressLog.user_stage_log.platform_repair_delta,
    ),
    next_forced_delta: stageProgressLog.user_stage_log.next_forced_delta,
    semantic_status: stageProgressLog.user_stage_log.semantic_status,
    duration: compactDuration(stageProgressLog.user_stage_log.duration),
    token_usage: compactTokenUsage(stageProgressLog.user_stage_log.token_usage),
    evidence_refs: evidenceRefs,
    closeout_refs: evidenceRefs.closeout_refs.refs,
    timeline: compactTiming(stageProgressLog),
    semantic_gap: semanticGap,
    next_inspection_hint: nextInspectionHint,
    operator_summary: operatorSummary,
    authority_boundary: compactAuthorityBoundary(stageProgressLog.authority_boundary),
  };
  if (options.auditSafe === true) {
    return {
      stage_attempt_id: base.stage_attempt_id,
      task_id: base.task_id,
      provider_kind: attempt.provider_kind,
      domain_id: base.domain_id,
      study_id: base.study_id,
      stage_id: base.stage_id,
      status: base.status,
      effective_runtime_status: base.effective_runtime_status,
      runtime_currentness: base.runtime_currentness,
      blocked_reason: base.blocked_reason,
      updated_at: base.updated_at,
      progress_delta_classification: base.progress_delta_classification,
      semantic_status: base.semantic_status,
      closeout_refs: base.closeout_refs,
      current_provider_readiness: {
        provider_kind: base.current_provider_readiness?.provider_kind ?? null,
        provider_ready: base.current_provider_readiness?.provider_ready ?? null,
        status: base.current_provider_readiness?.status ?? null,
        degraded_reason: base.current_provider_readiness?.degraded_reason ?? null,
      },
      provider_readiness_currentness: base.provider_readiness_currentness,
      provider_liveness_attention: livenessSummary(base.provider_liveness_attention),
      operator_summary: {
        attempt: base.operator_summary.attempt,
        status: base.operator_summary.status,
        effective_runtime_status: base.operator_summary.effective_runtime_status,
        runtime_currentness: base.operator_summary.runtime_currentness,
        stage: base.operator_summary.stage,
        study: base.operator_summary.study,
        domain: base.operator_summary.domain,
        owner: base.operator_summary.owner,
        action: base.operator_summary.action,
        provider_liveness_attention: base.operator_summary.provider_liveness_attention,
        progress_delta_classification: base.operator_summary.progress_delta_classification,
        closeout_ref_count: base.operator_summary.closeout_ref_count,
        semantic_gap_reason: base.operator_summary.semantic_gap_reason,
        next_inspection: base.operator_summary.next_inspection,
      },
      authority_boundary: base.authority_boundary,
    };
  }
  return base;
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
  const effectiveCompactTimeline = filters.full === true ? false : true;
  const auditSafeTimeline = effectiveCompactTimeline && filters.compactTimeline !== true;
  const baseAttempts = listStageAttemptRows(db).map(stageAttemptToPayload);
  const filteredAttempts = baseAttempts.filter((attempt) =>
    attemptMatchesMonitoringFilters(db, attempt, filters, sinceIso)
  );
  const compactTimelineAttempts = effectiveCompactTimeline
    ? [...filteredAttempts]
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .slice(0, COMPACT_TIMELINE_ATTEMPT_LIMIT)
    : filteredAttempts;
  const readinessByKind = await providerReadinessByKind(filteredAttempts, paths, options);
  const compactTimeline = effectiveCompactTimeline
    ? compactTimelineAttempts.map((attempt) =>
        compactTimelineForAttempt(db, attempt, readinessByKind.get(attempt.provider_kind) ?? null, {
          auditSafe: auditSafeTimeline,
        })
      )
    : null;
  const fullAttempts = effectiveCompactTimeline
    ? null
    : filteredAttempts.map((attempt) =>
        compactTimelineForAttempt(db, attempt, readinessByKind.get(attempt.provider_kind) ?? null)
      );
  return {
    provider_runtime_metadata: {
      selected_runtime_provider: 'temporal',
      production_required_provider: 'temporal',
      sqlite_sidecar_role: 'projection_and_readback_index_only',
      retired_env_diagnostic: retiredProviderEnvDiagnostic(),
    },
    filters: {
      domain_id: filters.domainId ?? null,
      status: filters.status ?? null,
      study_id: filters.studyId ?? null,
      since_hours: filters.sinceHours ?? null,
      since_at: sinceIso,
      compact_timeline: effectiveCompactTimeline,
      full: filters.full === true,
    },
    summary: {
      total: baseAttempts.length,
      filtered_total: filteredAttempts.length,
      compact_timeline_returned_total: effectiveCompactTimeline
        ? compactTimelineAttempts.length
        : null,
      compact_timeline_omitted_total: effectiveCompactTimeline
        ? Math.max(0, filteredAttempts.length - compactTimelineAttempts.length)
        : null,
      compact_timeline_limit: effectiveCompactTimeline
        ? COMPACT_TIMELINE_ATTEMPT_LIMIT
        : null,
      by_status: Object.fromEntries(
        [...new Set(filteredAttempts.map((attempt) => attempt.status))].sort().map((status) => [
          status,
          filteredAttempts.filter((attempt) => attempt.status === status).length,
        ]),
      ),
    },
    attempts: compactTimeline ?? fullAttempts ?? [],
    compact_timeline: compactTimeline,
  };
}
