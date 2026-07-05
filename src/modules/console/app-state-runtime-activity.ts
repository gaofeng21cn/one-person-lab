import fs from 'node:fs';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { readJsonFileOrNull } from '../../kernel/json-file.ts';
import { recordList, stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';
import {
  buildStageAttemptUsageProjection,
  listStageAttempts,
  openFamilyRuntimeSqlite,
  resolveOplStatePaths,
  summarizeStageAttemptUsageProjections,
  buildStageAttemptRuntimeCurrentness,
} from '../runway/index.ts';
import { listWorkspaceBindings, type WorkspaceBinding } from '../workspace/index.ts';

const RUNNING_STAGE_ATTEMPT_STATUSES = new Set(['running']);
const ATTENTION_STAGE_ATTEMPT_STATUSES = new Set(['blocked', 'dead_lettered', 'failed', 'human_gate']);
const RECENT_STAGE_ATTEMPT_STATUSES = new Set(['completed']);
const MAX_STAGE_ATTEMPT_REFS_PER_STUDY = 8;

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = optionalString(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function normalizeStatus(value: unknown) {
  return optionalString(value)?.trim().toLowerCase().replace(/\s+/g, '_') ?? '';
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function sourceRef(filePath: string, role: string, label: string) {
  return {
    ref_kind: 'file',
    ref: filePath,
    role,
    label,
  };
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function recordValue(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function durationSecondsBetween(startedAt: string | null, endedAt: string | null) {
  if (!startedAt || !endedAt) {
    return null;
  }
  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs < startedMs) {
    return null;
  }
  return Math.floor((endedMs - startedMs) / 1000);
}

function queueDbPath() {
  return path.join(resolveOplStatePaths().state_dir, 'family-runtime', 'queue.sqlite');
}

function readFamilyRuntimeStageAttempts() {
  const dbPath = queueDbPath();
  if (!fs.existsSync(dbPath)) {
    return { queueDb: dbPath, attempts: [] };
  }
  const db = openFamilyRuntimeSqlite(dbPath, { readOnly: true });
  try {
    return {
      queueDb: dbPath,
      attempts: listStageAttempts(db).filter(isRecord),
    };
  } catch {
    return { queueDb: dbPath, attempts: [] };
  } finally {
    db.close();
  }
}

function rootMatches(candidate: string | null, roots: ReadonlySet<string>) {
  if (!candidate) {
    return false;
  }
  const resolvedCandidate = path.resolve(candidate);
  for (const root of roots) {
    const resolvedRoot = path.resolve(root);
    if (resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)) {
      return true;
    }
  }
  return false;
}

function stageAttemptWorkspaceMatches(attempt: JsonRecord, roots: ReadonlySet<string>) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return rootMatches(firstString(workspaceLocator.workspace_root, workspaceLocator.command_cwd), roots);
}

function stageAttemptHasWorkspaceRoot(attempt: JsonRecord) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return Boolean(firstString(workspaceLocator.workspace_root, workspaceLocator.command_cwd));
}

function stageAttemptStudyId(attempt: JsonRecord) {
  const workspaceLocator = isRecord(attempt.workspace_locator) ? attempt.workspace_locator : {};
  return firstString(workspaceLocator.study_id, workspaceLocator.quest_id);
}

function stageAttemptSourceRef(queueDb: string, attemptId: string) {
  return {
    ref_kind: 'sqlite',
    ref: `${queueDb}#stage_attempts/${attemptId}`,
    role: 'opl_family_runtime_stage_attempt',
    label: 'OPL family-runtime stage attempt',
  };
}

function stageAttemptWorkspaceCloseoutPath(root: string, attemptId: string) {
  return path.join(
    root,
    'ops',
    'medautoscience',
    'paper_mission_stage_attempts',
    attemptId,
    'stage_attempt_closeout_packet.json',
  );
}

function readWorkspaceCloseoutForAttempt(attempt: JsonRecord, roots: readonly string[]) {
  const attemptId = firstString(attempt.stage_attempt_id);
  if (!attemptId) {
    return null;
  }
  for (const root of roots) {
    const closeoutPath = stageAttemptWorkspaceCloseoutPath(root, attemptId);
    const payloadRaw = readJsonFileOrNull(closeoutPath);
    if (!isRecord(payloadRaw)) {
      continue;
    }
    const payload = payloadRaw;
    if (
      payload.surface_kind !== 'stage_attempt_closeout_packet'
      || firstString(payload.stage_attempt_id) !== attemptId
    ) {
      continue;
    }
    let statMtime: string | null = null;
    try {
      statMtime = fs.statSync(closeoutPath).mtime.toISOString();
    } catch {
      statMtime = null;
    }
    return {
      path: closeoutPath,
      payload,
      observedAt: firstString(payload.generated_at, payload.recorded_at, payload.updated_at) ?? statMtime,
    };
  }
  return null;
}

function receiptOwnerConsumptionRoot(root: string) {
  return path.join(root, 'ops', 'medautoscience', 'paper_mission_receipt_owner_consumption');
}

function receiptOwnerConsumptionFiles(root: string, studyId: string) {
  const ledgerRoot = receiptOwnerConsumptionRoot(root);
  const files: string[] = [];
  const visit = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === studyId) {
          files.push(path.join(child, 'receipt_owner_consumption.json'));
        }
        visit(child);
      }
    }
  };
  visit(ledgerRoot);
  return files;
}

function stageAttemptIdFromRef(...values: unknown[]) {
  for (const value of values) {
    const text = firstString(value);
    if (!text) {
      continue;
    }
    if (text.startsWith('sat_') || text.startsWith('sat-')) {
      return text;
    }
    const oplMarker = 'opl://stage-attempts/';
    if (text.includes(oplMarker)) {
      return text.split(oplMarker, 2)[1]?.split(/[\/#]/, 1)[0] ?? null;
    }
    const pathMarker = 'paper_mission_stage_attempts/';
    if (text.includes(pathMarker)) {
      return text.split(pathMarker, 2)[1]?.split('/', 1)[0] ?? null;
    }
  }
  return null;
}

function ownerConsumptionSummaryFromFile(filePath: string, latestAttemptId: string | null) {
  const payloadRaw = readJsonFileOrNull(filePath);
  if (!isRecord(payloadRaw)) {
    return null;
  }
  const payload = payloadRaw;
  if (
    payload.surface_kind !== 'paper_mission_receipt_owner_consumption'
    || payload.status !== 'owner_consumption_applied'
  ) {
    return null;
  }
  const receiptEvidence = isRecord(payload.receipt_evidence) ? payload.receipt_evidence : {};
  const consumption = isRecord(payload.mas_receipt_consumption) ? payload.mas_receipt_consumption : {};
  const stageClosure = isRecord(payload.stage_closure_decision)
    ? payload.stage_closure_decision
    : isRecord(payload.stage_closure)
      ? payload.stage_closure
      : {};
  const oplCloseout = isRecord(stageClosure.opl_closeout) ? stageClosure.opl_closeout : {};
  const consumedAttemptId = stageAttemptIdFromRef(
    oplCloseout.stage_attempt_id,
    receiptEvidence.stage_attempt_ref,
    receiptEvidence.receipt_ref,
    receiptEvidence.runtime_closeout_ref,
    consumption.route_checkpoint_evidence_ref,
    consumption.typed_runtime_blocker_ref,
  );
  let statMtime: string | null = null;
  try {
    statMtime = fs.statSync(filePath).mtime.toISOString();
  } catch {
    statMtime = null;
  }
  return {
    path: filePath,
    payload,
    status: firstString(consumption.status) ?? firstString(payload.status),
    ownerResultKind: firstString(consumption.owner_result_kind),
    consumedAttemptId,
    consumedCloseoutRef: firstString(
      consumption.route_checkpoint_evidence_ref,
      consumption.typed_runtime_blocker_ref,
      receiptEvidence.runtime_closeout_ref,
    ),
    recordedAt: firstString(stageClosure.recorded_at, payload.recorded_at, payload.generated_at) ?? statMtime,
    matchesRuntimeCloseout: Boolean(latestAttemptId && consumedAttemptId && latestAttemptId === consumedAttemptId),
  };
}

function readLatestMasOwnerConsumptionForStudy(input: {
  roots: readonly string[];
  studyId: string | null;
  latestAttemptId: string | null;
}) {
  if (!input.studyId) {
    return null;
  }
  const candidates = input.roots
    .flatMap((root) => receiptOwnerConsumptionFiles(root, input.studyId ?? ''))
    .map((filePath) => ownerConsumptionSummaryFromFile(filePath, input.latestAttemptId))
    .filter((entry): entry is NonNullable<ReturnType<typeof ownerConsumptionSummaryFromFile>> => Boolean(entry));
  if (candidates.length === 0) {
    return null;
  }
  return candidates.sort((left, right) =>
    `${right.recordedAt ?? ''}${right.path}`.localeCompare(`${left.recordedAt ?? ''}${left.path}`)
  )[0];
}

function stageAttemptLane(status: string): 'running' | 'attention' | 'recent' | null {
  if (RUNNING_STAGE_ATTEMPT_STATUSES.has(status)) {
    return 'running';
  }
  if (ATTENTION_STAGE_ATTEMPT_STATUSES.has(status)) {
    return 'attention';
  }
  if (RECENT_STAGE_ATTEMPT_STATUSES.has(status)) {
    return 'recent';
  }
  return null;
}

function overlayStageAttemptsByStudyId(input: {
  attempts: JsonRecord[];
  candidateRoots: string[];
  knownStudyIds: ReadonlySet<string>;
}) {
  const roots = new Set(input.candidateRoots);
  const byStudyId = new Map<string, JsonRecord[]>();
  for (const attempt of input.attempts) {
    const studyId = stageAttemptStudyId(attempt);
    const status = normalizeStatus(attempt.status);
    const lane = stageAttemptLane(status);
    const workspaceMatches = stageAttemptWorkspaceMatches(attempt, roots);
    if (
      optionalString(attempt.domain_id) !== 'medautoscience'
      || !studyId
      || !lane
      || (!workspaceMatches && (stageAttemptHasWorkspaceRoot(attempt) || !input.knownStudyIds.has(studyId)))
    ) {
      continue;
    }
    const attempts = byStudyId.get(studyId) ?? [];
    if (attempts.length < MAX_STAGE_ATTEMPT_REFS_PER_STUDY) {
      byStudyId.set(studyId, [...attempts, attempt]);
    }
  }
  return byStudyId;
}

function overlayStageAttempts(input: {
  item: JsonRecord;
  attempts: JsonRecord[];
  queueDb: string;
  candidateRoots: string[];
}) {
  const [latest] = input.attempts;
  const latestProviderRun = recordValue(latest.provider_run_json ?? latest.provider_run);
  const latestRetryBudget = recordValue(latest.retry_budget_json ?? latest.retry_budget);
  const latestRouteImpact = recordValue(latest.route_impact_json ?? latest.route_impact);
  const latestActivityEvents = Array.isArray(latest.activity_events_json)
    ? latest.activity_events_json
    : Array.isArray(latest.activity_events)
      ? latest.activity_events
      : [];
  const closeout = readWorkspaceCloseoutForAttempt(latest, input.candidateRoots);
  const latestStatus = closeout && normalizeStatus(latest.status) === 'running'
    ? 'completed'
    : normalizeStatus(latest.status);
  const stageAttemptIds = input.attempts
    .map((attempt) => firstString(attempt.stage_attempt_id))
    .filter((entry): entry is string => Boolean(entry));
  const stageId = firstString(latest.stage_id);
  const workflowId = firstString(latest.workflow_id);
  const attemptId = firstString(latest.stage_attempt_id);
  const studyId = firstString(input.item.study_id);
  const ownerConsumption = readLatestMasOwnerConsumptionForStudy({
    roots: input.candidateRoots,
    studyId,
    latestAttemptId: attemptId,
  });
  const ownerConsumptionDrift = Boolean(ownerConsumption && closeout && !ownerConsumption.matchesRuntimeCloseout);
  const lane = ownerConsumptionDrift ? 'attention' : stageAttemptLane(latestStatus) ?? 'attention';
  const stageStartedAt = firstString(latestProviderRun.started_at, latest.created_at);
  const lastHeartbeatAt = firstString(latestProviderRun.last_heartbeat_at, latest.updated_at);
  const stageElapsedSeconds = durationSecondsBetween(stageStartedAt, firstString(
    closeout?.observedAt,
    latestProviderRun.completed_at,
    lastHeartbeatAt,
    latest.updated_at,
  ));
  const latestUsageProjection = buildStageAttemptUsageProjection({
    stageAttemptId: attemptId ?? 'unknown-stage-attempt',
    projectionScope: 'app_state_runtime_activity',
    status: latestStatus || 'unknown',
    blockedReason: firstString(latest.blocked_reason),
    executorKind: firstString(latest.executor_kind),
    retryBudget: latestRetryBudget,
    attemptCount: typeof latest.attempt_count === 'number' ? latest.attempt_count : 1,
    providerRun: latestProviderRun,
    activityEvents: latestActivityEvents,
    routeImpact: latestRouteImpact,
  });
  const totalUsageProjection = summarizeStageAttemptUsageProjections(input.attempts.map((attempt) =>
    buildStageAttemptUsageProjection({
      stageAttemptId: firstString(attempt.stage_attempt_id) ?? 'unknown-stage-attempt',
      projectionScope: 'app_state_runtime_activity_total',
      status: normalizeStatus(attempt.status) || 'unknown',
      blockedReason: firstString(attempt.blocked_reason),
      executorKind: firstString(attempt.executor_kind),
      retryBudget: recordValue(attempt.retry_budget_json ?? attempt.retry_budget),
      attemptCount: typeof attempt.attempt_count === 'number' ? attempt.attempt_count : 1,
      providerRun: recordValue(attempt.provider_run_json ?? attempt.provider_run),
      activityEvents: Array.isArray(attempt.activity_events_json)
        ? attempt.activity_events_json
        : Array.isArray(attempt.activity_events)
          ? attempt.activity_events
          : [],
      routeImpact: recordValue(attempt.route_impact_json ?? attempt.route_impact),
    })
  ), 'app_state_runtime_activity_total');
  const runtimeCurrentness = buildStageAttemptRuntimeCurrentness({
    ledgerStatus: latestStatus || 'unknown',
    providerKind: firstString(latest.provider_kind) ?? 'unknown',
    providerRun: latestProviderRun,
  });
  const masNextActionSummary = firstString(
    input.item.next_action_summary,
    input.item.action_summary,
    input.item.summary,
  );
  const sourceRefs = [
    ...recordList(input.item.source_refs),
    ...input.attempts.flatMap((attempt) => {
      const attemptId = firstString(attempt.stage_attempt_id);
      return attemptId ? [stageAttemptSourceRef(input.queueDb, attemptId)] : [];
    }),
    ...(closeout ? [sourceRef(closeout.path, 'stage_attempt_closeout_packet', 'OPL stage attempt closeout packet')] : []),
    ...(ownerConsumption ? [sourceRef(ownerConsumption.path, 'mas_receipt_owner_consumption', 'MAS owner consumption readback')] : []),
  ];
  const updatedAt = firstString(closeout?.observedAt, latest.updated_at, input.item.updated_at);
  const actionSummary = ownerConsumptionDrift
    ? 'Latest OPL runtime closeout differs from the MAS owner-consumed receipt; read MAS paper-mission/study-progress before any paper-progress claim.'
    : ownerConsumption?.matchesRuntimeCloseout
      ? masNextActionSummary
        ? `OPL runtime stage attempt completed and MAS consumed that runtime receipt. MAS next legal step: ${masNextActionSummary}`
        : 'OPL runtime stage attempt completed and MAS consumed that runtime receipt; read MAS paper-mission/study-progress for the next legal owner action before any paper-progress claim.'
      : lane === 'running'
    ? 'OPL runtime stage attempt is running; MAS terminalization is still required before any paper-progress claim.'
    : lane === 'attention'
      ? 'OPL runtime stage attempt needs operator attention; MAS terminalization is still required before any paper-progress claim.'
      : masNextActionSummary
        ? `OPL runtime stage attempt completed. MAS next legal step: ${masNextActionSummary}`
        : 'OPL runtime stage attempt completed; read MAS paper-mission/study-progress for the next legal owner action before any paper-progress claim.';

  return {
    ...input.item,
    lane,
    status: firstString(latestStatus, latest.status, input.item.status),
    status_label: lane === 'running'
      ? (firstString(input.item.status_label) ?? 'OPL runtime running')
      : ownerConsumptionDrift
        ? 'OPL/MAS readback attention'
        : `OPL runtime ${latestStatus || 'needs attention'}`,
    summary: firstString(input.item.summary)
      ?? (closeout && attemptId
        ? `OPL runtime attempt ${attemptId} has terminal closeout evidence.`
        : attemptId
        ? `OPL runtime attempt ${attemptId} is ${latestStatus || 'not advancing'}.`
        : `OPL runtime attempt is ${latestStatus || 'not advancing'}.`),
    updated_at: updatedAt,
    source_refs: sourceRefs,
    ...(ownerConsumption ? {
      mas_owner_consumption_status: ownerConsumption.status,
      mas_owner_consumption_ref: ownerConsumption.path,
      mas_owner_consumed_stage_attempt_id: ownerConsumption.consumedAttemptId,
      mas_owner_consumed_closeout_ref: ownerConsumption.consumedCloseoutRef,
      mas_owner_consumption_matches_runtime_closeout: ownerConsumption.matchesRuntimeCloseout,
    } : {}),
    action_owner: lane === 'running' ? 'runtime' : lane === 'attention' ? 'opl' : 'none',
    action_kind: ownerConsumptionDrift ? 'currentness_check' : lane === 'attention' ? 'quality_gate' : null,
    action_summary: actionSummary,
    next_action_summary: actionSummary,
    active_run_id: workflowId ?? attemptId ?? firstString(input.item.active_run_id),
    active_stage_id: stageId ?? firstString(input.item.active_stage_id, input.item.status),
    active_stage_label: stageId ?? firstString(input.item.active_stage_label, input.item.status_label),
    agent_display_name: firstString(input.item.agent_display_name, input.item.project_label, input.item.domain_owner) ?? 'MAS',
    project_display_name: firstString(input.item.project_display_name, input.item.title, input.item.study_id) ?? 'MAS study',
    work_item_display_name: firstString(input.item.work_item_display_name, input.item.title, input.item.study_id) ?? 'MAS task',
    execution_run_label: firstString(input.item.execution_run_label, stageId, input.item.status_label),
    stage_started_at: stageStartedAt,
    elapsed_seconds: stageElapsedSeconds,
    last_heartbeat_at: lastHeartbeatAt,
    running_proof_status: firstString(runtimeCurrentness.running_proof_status) ?? 'not_applicable',
    running_proof_summary: ownerConsumptionDrift
      ? 'latest_runtime_closeout_differs_from_owner_consumed_receipt'
      : firstString(runtimeCurrentness.reason)
        ?? (lane === 'running' ? 'running_confirmed' : 'not_running'),
    current_stage_usage: {
      telemetry_status: firstString(latestUsageProjection.telemetry_status) ?? 'missing',
      total_tokens_observed: numberValue(latestUsageProjection.token.total_tokens_observed),
      estimated_cost_usd_observed: numberValue(latestUsageProjection.cost.estimated_cost_usd_observed),
      duration_ms_observed: numberValue(latestUsageProjection.duration.duration_ms_observed),
      api_call_count_observed: numberValue(latestUsageProjection.api_calls.count_observed),
      source_ref_count: latestUsageProjection.source_refs.length,
    },
    task_total_usage: {
      telemetry_status: totalUsageProjection.resource_usage_observed_attempt_count > 0 ? 'observed' : 'missing',
      total_tokens_observed: numberValue(totalUsageProjection.token.total_tokens_observed),
      estimated_cost_usd_observed: numberValue(totalUsageProjection.cost.estimated_cost_usd_observed),
      duration_ms_observed: numberValue(totalUsageProjection.duration.duration_ms_observed),
      api_call_count_observed: numberValue(totalUsageProjection.api_calls.count_observed),
      observed_attempt_count: numberValue(totalUsageProjection.resource_usage_observed_attempt_count),
    },
    usage_telemetry_status: totalUsageProjection.resource_usage_observed_attempt_count > 0 ? 'observed' : 'missing',
    typed_blocker_summary: firstString(
      input.item.typed_blocker_summary,
      latest.blocked_reason,
      ownerConsumptionDrift ? 'owner_consumption_drift_after_latest_runtime_closeout' : null,
    ),
    typed_blocker_owner: ownerConsumptionDrift ? 'medautoscience' : firstString(input.item.typed_blocker_owner, input.item.domain_owner),
    resolution_route: actionSummary,
    stage_attempt_ids: [
      ...new Set([
        ...stringList(input.item.stage_attempt_ids),
        ...stageAttemptIds,
      ]),
    ],
    runtime_readback_source: 'opl_family_runtime_queue_stage_attempts',
    runtime_attempt_status: latestStatus,
    runtime_closeout_observed: Boolean(closeout),
    runtime_closeout_ref: closeout?.path ?? null,
    provider_kind: firstString(latest.provider_kind),
    workflow_id: workflowId,
    authority_boundary: {
      projection_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_verdict: false,
      provider_completion_is_domain_ready: false,
    },
  };
}

function mergeFamilyRuntimeStageAttempts(input: {
  items: JsonRecord[];
  candidateRoots: string[];
}) {
  const { queueDb, attempts } = readFamilyRuntimeStageAttempts();
  if (attempts.length === 0) {
    return input.items;
  }
  const knownStudyIds = new Set(
    input.items.map((item) => firstString(item.study_id)).filter((entry): entry is string => Boolean(entry)),
  );
  const overlayByStudyId = overlayStageAttemptsByStudyId({
    attempts,
    candidateRoots: input.candidateRoots,
    knownStudyIds,
  });
  if (overlayByStudyId.size === 0) {
    return input.items;
  }
  return input.items.map((item) => {
    const studyId = firstString(item.study_id);
    const studyAttempts = studyId ? overlayByStudyId.get(studyId) : null;
    return studyAttempts && studyAttempts.length > 0
      ? overlayStageAttempts({ item, attempts: studyAttempts, queueDb, candidateRoots: input.candidateRoots })
      : item;
  });
}

function commandForMasStudy(profileRef: string | null, studyId: string) {
  if (!profileRef) {
    return null;
  }
  return [
    'uv run python -m med_autoscience.cli',
    'study',
    'progress',
    '--profile',
    JSON.stringify(profileRef),
    '--study-id',
    JSON.stringify(studyId),
    '--format',
    'json',
  ].join(' ');
}

function recommendedCommands(profileRef: string | null, studyId: string) {
  return [
    {
      step_id: 'inspect_study_progress',
      title: '查看任务进度',
      surface_kind: 'study_progress',
      command: commandForMasStudy(profileRef, studyId),
    },
  ].filter((entry): entry is {
    step_id: string;
    title: string;
    surface_kind: string;
    command: string;
  } => Boolean(entry.command));
}

function laneForStudy(study: JsonRecord) {
  const macroState = normalizeStatus(study.macro_state);
  const currentStage = normalizeStatus(study.current_stage);
  const workerState = normalizeStatus(study.worker_state);
  const writerState = normalizeStatus(study.writer_state);
  const runtimeHealth = normalizeStatus(study.runtime_health_status);
  const workerRunning = study.worker_running === true;
  const actualWriteActive = study.actual_write_active === true;
  const activeRunId = firstString(study.active_run_id);
  const providerLivenessObserved = workerRunning
    || actualWriteActive
    || ['running', 'live', 'active'].includes(workerState)
    || ['running', 'live', 'active'].includes(writerState);
  const liveStageObserved = ['running', 'live', 'active'].includes(currentStage)
    || ['running', 'live', 'active'].includes(macroState);

  if (providerLivenessObserved || (activeRunId && liveStageObserved)) {
    return 'running';
  }

  if (
    Boolean(activeRunId)
      || ['attention', 'blocked', 'failed', 'human_gate', 'needs_attention', 'queued', 'stale'].includes(macroState)
      || ['blocked', 'failed', 'human_gate', 'needs_attention', 'queued', 'stale'].includes(currentStage)
      || ['blocked', 'failed', 'stale', 'missing', 'escalated'].includes(runtimeHealth)
  ) {
    return 'attention';
  }

  return 'recent';
}

function normalizeStudyItem(input: {
  workspaceRoot: string;
  profileRef: string | null;
  sourcePath: string;
  sourceRole: string;
  sourceLabel: string;
  study: JsonRecord;
  runtimeStatusSummary?: JsonRecord | null;
}): JsonRecord | null {
  const studyId = firstString(input.study.study_id);
  if (!studyId || studyId === 'workspace-overview') {
    return null;
  }
  const lane = laneForStudy(input.study);
  const freshness = isRecord(input.study.freshness) ? input.study.freshness : {};
  const runtimeStatusSummary = isRecord(input.runtimeStatusSummary)
    ? input.runtimeStatusSummary
    : {};
  const commands = recommendedCommands(input.profileRef, studyId);
  const summary = firstString(
    input.study.state_summary,
    input.study.summary,
    freshness.summary,
    runtimeStatusSummary.status_summary,
    input.study.user_next,
  );
  const nextActionSummary = firstString(
    runtimeStatusSummary.next_action_summary,
    input.study.next_action_summary,
    input.study.next_system_action,
    input.study.operator_focus,
  );

  return {
    item_id: `medautoscience:study:${studyId}`,
    project_id: 'medautoscience',
    project_label: 'MAS',
    lane,
    title: firstString(input.study.display_title) ?? studyId,
    status: firstString(input.study.current_stage, input.study.macro_state, input.study.worker_state, input.study.runtime_health_status),
    status_label: firstString(input.study.state_label),
    summary,
    updated_at: firstString(input.study.last_seen_at, freshness.latest_event_at),
    command: commands[0]?.command ?? null,
    workspace_path: input.workspaceRoot,
    runtime_owner: 'provider_backed_family_runtime',
    domain_owner: 'med-autoscience',
    source_refs: [
      sourceRef(input.sourcePath, input.sourceRole, input.sourceLabel),
    ],
    action_owner: lane === 'attention' ? 'opl' : lane === 'running' ? 'runtime' : 'none',
    requires_user_action: false,
    action_kind: lane === 'attention' ? 'quality_gate' : null,
    action_summary: firstString(nextActionSummary, summary)
      ?? (lane === 'running' ? 'MAS 论文线正在运行。' : 'MAS 论文线当前没有活跃运行任务。'),
    study_id: studyId,
    workspace_label: firstString(input.study.profile_name),
    detail_summary: summary,
    next_action_summary: nextActionSummary,
    active_run_id: firstString(input.study.active_run_id, runtimeStatusSummary.active_run_id),
    health_status: firstString(input.study.worker_state, input.study.macro_state, input.study.runtime_health_status),
    blockers: [],
    recommended_commands: commands,
  };
}

function studyRuntimeStatusSummaryPath(workspaceRoot: string, studyId: string) {
  return path.join(
    workspaceRoot,
    'studies',
    studyId,
    'artifacts',
    'runtime',
    'runtime_status_summary.json',
  );
}

function readStudyRuntimeStatusSummary(workspaceRoot: string, studyId: string) {
  const payload = readJsonFileOrNull(studyRuntimeStatusSummaryPath(workspaceRoot, studyId));
  return isRecord(payload) ? payload : null;
}

function portalPayloadPath(workspaceRoot: string) {
  return path.join(workspaceRoot, 'artifacts', 'runtime', 'progress_portal', 'latest.json');
}

function workspaceRootFromProfileRef(profileRef: string | null) {
  if (!profileRef) {
    return null;
  }
  const profileDir = path.dirname(profileRef);
  const medAutoScienceDir = path.dirname(profileDir);
  const opsDir = path.dirname(medAutoScienceDir);
  return path.basename(profileDir) === 'profiles'
    && path.basename(medAutoScienceDir) === 'medautoscience'
    && path.basename(opsDir) === 'ops'
    ? path.dirname(opsDir)
    : null;
}

function workspaceRootCandidates(workspaceRoot: string, profileRef: string | null) {
  return [...new Set([
    workspaceRootFromProfileRef(profileRef),
    workspaceRoot,
  ].filter((entry): entry is string => Boolean(entry)))];
}

function runtimeBindingsForOverview() {
  return listWorkspaceBindings()
    .filter((binding) =>
      binding.status !== 'archived'
      && binding.project_id === 'medautoscience',
    )
    .sort((left, right) =>
      Number(right.status === 'active') - Number(left.status === 'active')
      || `${right.updated_at}:${right.binding_id}`.localeCompare(`${left.updated_at}:${left.binding_id}`)
    );
}

function decorateRuntimeItemForBinding(
  item: JsonRecord,
  binding: WorkspaceBinding,
  workspaceRoot: string,
) {
  const studyId = firstString(item.study_id);
  const workspaceLabel = firstString(
    item.workspace_label,
    binding.label,
    path.basename(workspaceRoot),
    binding.project,
    binding.project_id,
  ) ?? binding.project_id;
  const itemId = studyId
    ? `${binding.project_id}:binding:${binding.binding_id}:study:${studyId}`
    : firstString(
      item.item_id,
      `${binding.project_id}:binding:${binding.binding_id}:runtime:${path.basename(workspaceRoot)}`,
    ) ?? `${binding.project_id}:binding:${binding.binding_id}:runtime`;
  const projectDisplayName = firstString(
    item.project_display_name,
    workspaceLabel,
    binding.label,
    binding.project,
    binding.project_id,
  ) ?? binding.project_id;
  return {
    ...item,
    item_id: itemId,
    project_id: firstString(item.project_id, binding.project_id) ?? binding.project_id,
    project_label: firstString(item.project_label, binding.project, binding.project_id) ?? binding.project_id,
    workspace_path: firstString(item.workspace_path, workspaceRoot) ?? workspaceRoot,
    workspace_label: workspaceLabel,
    workspace_binding_id: binding.binding_id,
    workspace_binding_status: binding.status,
    workspace_binding_active: binding.status === 'active',
    workspace_scope_id: `workspace:${binding.binding_id}`,
    project_scope_id: `project:${binding.project_id}:${binding.binding_id}`,
    agent_scope_id: `agent:${binding.project_id}`,
    task_scope_id: `task:${itemId}`,
    agent_display_name: firstString(item.agent_display_name, item.project_label, binding.project, binding.project_id)
      ?? binding.project_id,
    project_display_name: projectDisplayName,
    work_item_display_name: firstString(item.work_item_display_name, item.title, studyId, itemId) ?? itemId,
    execution_run_label: firstString(
      item.execution_run_label,
      item.active_run_id,
      item.active_stage_id,
      item.status_label,
      item.status,
    ),
  };
}

function decorateRuntimeItemsForBinding(
  items: readonly JsonRecord[],
  binding: WorkspaceBinding,
  workspaceRoot: string,
) {
  return items.map((item) => decorateRuntimeItemForBinding(item, binding, workspaceRoot));
}

function buildFromPortalPayload(workspaceRoot: string, profileRef: string | null, payloadPath: string, payload: JsonRecord) {
  const workbenchProjection = isRecord(payload.mas_opl_runtime_workbench_projection)
    ? payload.mas_opl_runtime_workbench_projection
    : null;
  if (workbenchProjection && workbenchProjection.surface_kind === 'mas_opl_runtime_workbench_projection') {
    return recordList(workbenchProjection.studies)
      .map((study) => {
        const studyId = firstString(study.study_id);
        return normalizeStudyItem({
          workspaceRoot,
          profileRef,
          sourcePath: payloadPath,
          sourceRole: 'mas_opl_runtime_workbench_projection',
          sourceLabel: 'MAS OPL Runtime Workbench projection',
          study,
          runtimeStatusSummary: studyId
            ? readStudyRuntimeStatusSummary(workspaceRoot, studyId)
            : null,
        });
      })
      .filter((entry): entry is JsonRecord => Boolean(entry));
  }

  const workspace = isRecord(payload.workspace) ? payload.workspace : {};
  return recordList(workspace.studies)
    .map((study) => {
      const studyId = firstString(study.study_id);
      return normalizeStudyItem({
        workspaceRoot,
        profileRef,
        sourcePath: payloadPath,
        sourceRole: 'mas_progress_portal_payload',
        sourceLabel: 'MAS Progress Portal payload',
        study,
        runtimeStatusSummary: studyId
          ? readStudyRuntimeStatusSummary(workspaceRoot, studyId)
          : null,
      });
    })
    .filter((entry): entry is JsonRecord => Boolean(entry));
}

function buildFromStudyRuntimeFiles(workspaceRoot: string, profileRef: string | null) {
  const studiesDir = path.join(workspaceRoot, 'studies');
  let names: string[];
  try {
    names = fs.readdirSync(studiesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }

  return names.flatMap((studyId) => {
    const studyRoot = path.join(studiesDir, studyId);
    const supervisionPath = path.join(studyRoot, 'artifacts', 'runtime', 'runtime_supervision', 'latest.json');
    const statusPath = path.join(studyRoot, 'artifacts', 'runtime', 'runtime_status_summary.json');
    const supervisionPayload = readJsonFileOrNull(supervisionPath);
    const statusPayload = readJsonFileOrNull(statusPath);
    const supervision = isRecord(supervisionPayload) ? supervisionPayload : null;
    const status = isRecord(statusPayload) ? statusPayload : null;
    if (!supervision && !status) {
      return [];
    }
    const study = {
      study_id: studyId,
      current_stage: firstString(supervision?.quest_status, status?.current_stage),
      macro_state: firstString(supervision?.health_status, status?.health_status),
      runtime_health_status: firstString(supervision?.health_status, status?.health_status),
      active_run_id: firstString(supervision?.active_run_id),
      worker_running: supervision?.worker_running,
      state_summary: firstString(status?.status_summary, supervision?.summary),
      next_action_summary: firstString(status?.next_action_summary, supervision?.next_action_summary),
      last_seen_at: firstString(status?.generated_at, supervision?.recorded_at),
    };
    const item = normalizeStudyItem({
      workspaceRoot,
      profileRef,
      sourcePath: supervision ? supervisionPath : statusPath,
      sourceRole: supervision ? 'runtime_supervision' : 'runtime_status_summary',
      sourceLabel: supervision ? 'runtime_supervision/latest.json' : 'runtime_status_summary.json',
      study,
    });
    return item ? [item] : [];
  });
}

export function buildAppStateRuntimeActivityItems() {
  return runtimeBindingsForOverview().flatMap((binding) => {
    const locator = binding.direct_entry.workspace_locator;
    const workspaceRoot = firstString(locator?.workspace_root, binding.workspace_path);
    if (!workspaceRoot) {
      return [];
    }

    const profileRef = firstString(locator?.profile_ref);
    const candidateRoots = workspaceRootCandidates(workspaceRoot, profileRef);
    for (const candidateRoot of candidateRoots) {
      const portalPath = portalPayloadPath(candidateRoot);
      const portalPayload = readJsonFileOrNull(portalPath);
      if (isRecord(portalPayload)) {
        return decorateRuntimeItemsForBinding(
          mergeFamilyRuntimeStageAttempts({
            items: buildFromPortalPayload(candidateRoot, profileRef, portalPath, portalPayload),
            candidateRoots,
          }),
          binding,
          workspaceRoot,
        );
      }
    }

    for (const candidateRoot of candidateRoots) {
      const items = buildFromStudyRuntimeFiles(candidateRoot, profileRef);
      if (items.length > 0) {
        return decorateRuntimeItemsForBinding(
          mergeFamilyRuntimeStageAttempts({ items, candidateRoots }),
          binding,
          workspaceRoot,
        );
      }
    }
    return [];
  });
}
