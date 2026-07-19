import type { DatabaseSync } from 'node:sqlite';

import { parseJsonText } from '../../kernel/json-file.ts';
import {
  record,
  stringList,
  stringValue,
} from '../../kernel/json-record.ts';
import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import {
  isDefaultExecutorDispatchTask,
  defaultExecutorWorkUnitIdentity,
} from './family-runtime-provider-hosted-attempts.ts';
import { isDomainRouteTask } from './family-runtime-domain-route.ts';
import type { StageAttemptRow } from './family-runtime-stage-attempt-ledger.ts';
import {
  buildModelRouteCostProjection,
  buildStageAttemptUsageProjection,
} from './family-runtime-stage-attempt-usage.ts';
import {
  buildStageProgressLog,
  summarizeStageProgressLogs,
} from './family-runtime-stage-progress-log.ts';
import {
  buildStageRunCurrentnessIdentity,
  missingStageRunCurrentnessIdentityFields,
} from './family-runtime-stage-run-currentness-identity.ts';
import {
  isDomainRouteStageRouteTask,
} from './family-runtime-domain-route-terminal-sync.ts';
import {
  domainOwnerAnswerObservationFromRecords,
  OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON,
  OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
} from './family-runtime-opl-attempt-admission-receipt.ts';

type ControlAttemptRow = StageAttemptRow & { rowid: number };
type WorkUnitIdentity = {
  action_type: string | null;
  work_unit_id: string | null;
  dispatch_ref: string | null;
  next_executable_owner: string | null;
  source_fingerprint: string | null;
};

const CURRENT_DEFAULT_EXECUTOR_TASK_STATUSES = new Set([
  'queued',
  'retry_waiting',
  'running',
  'waiting_approval',
  'succeeded',
]);
const STALE_WORK_UNIT_DIAGNOSTIC = 'stale/superseded_by_current_work_unit';

function parseRecord(value: unknown) {
  if (!value) {
    return {};
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') {
    return {};
  }
  try {
    return record(parseJsonText(value));
  } catch {
    return {};
  }
}
function parseList(value: string | null | undefined) {
  if (!value) {
    return [];
  }
  try {
    const parsed = parseJsonText(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

export function latestProviderActivityHeartbeat(
  activityEvents: unknown[],
  providerRun: Record<string, unknown>,
) {
  const ledgerLastHeartbeatAt = stringValue(providerRun.last_heartbeat_at);
  const activityHeartbeatEvents = activityEvents
    .filter((entry): entry is Record<string, unknown> =>
      typeof entry === 'object' && entry !== null && !Array.isArray(entry)
    )
    .filter((entry) =>
      stringValue(entry.activity_kind) === 'codex_stage_activity'
      && [
        'codex_stage_activity_supervision',
        'codex_stage_activity_runner_progress',
      ].includes(stringValue(entry.heartbeat_kind) ?? '')
    )
    .map((entry) => ({
      event_time: stringValue(entry.event_time),
      heartbeat_kind: stringValue(entry.heartbeat_kind),
      runner_event_kind: stringValue(entry.runner_event_kind),
    }))
    .filter((entry): entry is {
      event_time: string;
      heartbeat_kind: string | null;
      runner_event_kind: string | null;
    } => Boolean(entry.event_time))
    .sort((left, right) => left.event_time.localeCompare(right.event_time));
  const activityHeartbeat = activityHeartbeatEvents.at(-1) ?? null;
  if (
    activityHeartbeat
    && (!ledgerLastHeartbeatAt || activityHeartbeat.event_time >= ledgerLastHeartbeatAt)
  ) {
    return {
      ...providerRun,
      last_heartbeat_at: activityHeartbeat.event_time,
      ledger_last_heartbeat_at: ledgerLastHeartbeatAt,
      liveness_source: 'provider_activity_event',
      last_activity_heartbeat_kind: activityHeartbeat.heartbeat_kind,
      last_runner_event_kind: activityHeartbeat.runner_event_kind,
    };
  }
  return {
    ...providerRun,
    last_heartbeat_at: ledgerLastHeartbeatAt,
    ledger_last_heartbeat_at: ledgerLastHeartbeatAt,
    liveness_source: ledgerLastHeartbeatAt ? 'provider_run' : null,
    last_activity_heartbeat_kind: stringValue(providerRun.last_activity_heartbeat_kind),
    last_runner_event_kind: stringValue(providerRun.last_runner_event_kind),
  };
}

function refListFromRecord(value: Record<string, unknown>, keys: string[]) {
  return uniqueStrings(keys.flatMap((key) => {
    const entry = value[key];
    if (typeof entry === 'string') {
      return [entry];
    }
    return stringList(entry);
  }));
}

function typedBlockerRefsFromCloseoutRefs(refs: string[]) {
  return refs.filter((ref) =>
    ref.startsWith('typed-blocker:')
    || ref.startsWith('typed-blocker://')
    || ref.includes('-typed-blocker:')
    || ref.includes('domain-dispatch-typed-blocker:')
  );
}

function qualityDebtProjectionFromRecords(records: Record<string, unknown>[]) {
  const topLevelSources = records.flatMap((source) => [
    source,
    parseRecord(source.route_impact),
  ]);
  const nestedQualityDebtSources = topLevelSources.map((source) =>
    parseRecord(source.quality_debt)
  );
  const qualityDebtRefs = uniqueStrings([
    ...topLevelSources,
    ...nestedQualityDebtSources,
  ].flatMap((source) =>
    refListFromRecord(source, ['quality_debt_ref', 'quality_debt_refs'])
  ));
  const explicitQualityDebtReasonKeys = [
    'quality_debt_reason',
    'quality_debt_reasons',
    'quality_debt_codes',
    'normalization_findings',
  ];
  const qualityDebtReasonCodes = uniqueStrings([
    ...topLevelSources.flatMap((source) =>
      refListFromRecord(source, explicitQualityDebtReasonKeys)
    ),
    ...nestedQualityDebtSources.flatMap((source) =>
      refListFromRecord(source, [
        'reason_code',
        'reason_codes',
        ...explicitQualityDebtReasonKeys,
      ])
    ),
  ]);
  return {
    status: qualityDebtRefs.length > 0 || qualityDebtReasonCodes.length > 0
      ? 'quality_debt_observed'
      : 'no_quality_debt_observed',
    quality_debt_refs: qualityDebtRefs,
    quality_debt_reason_codes: qualityDebtReasonCodes,
    projection_policy: 'copy_domain_or_runtime_authored_quality_debt_without_semantic_inference',
    domain_quality_verdict_inferred: false,
    quality_or_readiness_authorized: false,
  };
}

function currentControlAuthorityBoundary() {
  return {
    opl: 'reconciled_stage_runtime_control_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
    reads_domain_latest_or_dispatch_latest: false,
    provider_completion_is_domain_ready: false,
    opl_can_authorize_domain_ready: false,
    opl_can_authorize_artifact_ready: false,
    opl_can_sign_domain_owner_receipt: false,
    can_write_domain_truth: false,
  };
}

function readTask(db: DatabaseSync, taskId: string) {
  return db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow | undefined;
}

function readAttempts(db: DatabaseSync, taskId: string) {
  return db.prepare(`
    SELECT rowid, *
    FROM stage_attempts
    WHERE task_id = ?
    ORDER BY created_at DESC, rowid DESC
  `).all(taskId) as ControlAttemptRow[];
}

function readAttempt(db: DatabaseSync, stageAttemptId: string) {
  return db.prepare(`
    SELECT rowid, *
    FROM stage_attempts
    WHERE stage_attempt_id = ?
  `).get(stageAttemptId) as ControlAttemptRow | undefined;
}

function readTaskForAttempt(db: DatabaseSync, attempt: ControlAttemptRow | undefined) {
  return attempt?.task_id ? readTask(db, attempt.task_id) : undefined;
}

function readLatestCloseoutPacket(db: DatabaseSync, stageAttemptId: string) {
  const row = db.prepare(`
    SELECT packet_json
    FROM stage_attempt_closeouts
    WHERE stage_attempt_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(stageAttemptId) as { packet_json: string } | undefined;
  return row ? parseRecord(row.packet_json) : {};
}

function currentStageProgressLog(
  current: ControlAttemptRow | undefined,
  providerRun: Record<string, unknown>,
  activityEvents: unknown[],
  latestCloseout: Record<string, unknown>,
) {
  if (!current) {
    return null;
  }
  const workspaceLocator = parseRecord(current.workspace_locator_json);
  const routeImpact = parseRecord(current.route_impact_json);
  const retryBudget = parseRecord(current.retry_budget_json);
  const checkpointRefs = stringList(parseList(current.checkpoint_refs_json));
  const closeoutRefs = stringList(parseList(current.closeout_refs_json));
  const usageProjection = buildStageAttemptUsageProjection({
    stageAttemptId: current.stage_attempt_id,
    status: current.status,
    blockedReason: current.blocked_reason,
    executorKind: current.executor_kind,
    retryBudget,
    attemptCount: current.attempt_count,
    providerRun,
    activityEvents,
    routeImpact,
  });
  const modelRouteCostProjection = buildModelRouteCostProjection({
    stageAttemptId: current.stage_attempt_id,
    status: current.status,
    blockedReason: current.blocked_reason,
    executorKind: current.executor_kind,
    retryBudget,
    attemptCount: current.attempt_count,
    providerRun,
    activityEvents,
    routeImpact,
    usageProjection,
  });
  return buildStageProgressLog({
    stageAttemptId: current.stage_attempt_id,
    projectionScope: 'current_control_state',
    providerKind: current.provider_kind,
    executorKind: current.executor_kind,
    domainId: current.domain_id,
    stageId: current.stage_id,
    workflowId: current.workflow_id,
    taskId: current.task_id,
    workspaceLocator,
    sourceFingerprint: current.source_fingerprint,
    status: current.status,
    blockedReason: current.blocked_reason,
    checkpointRefs,
    closeoutRefs,
    consumedRefs: stringList(latestCloseout.consumed_refs),
    consumedMemoryRefs: stringList(latestCloseout.consumed_memory_refs),
    writebackReceiptRefs: stringList(latestCloseout.writeback_receipt_refs),
    humanGateRefs: stringList(parseList(current.human_gate_refs_json)),
    retryBudget,
    attemptCount: current.attempt_count,
    providerRun,
    activityEvents,
    routeImpact,
    latestCloseout,
    closeoutReceiptStatus: current.closeout_receipt_status,
    nextOwner: stringValue(latestCloseout.next_owner) ?? stringValue(routeImpact.next_owner) ?? current.domain_id,
    domainReadyVerdict: stringValue(latestCloseout.domain_ready_verdict) ?? stringValue(routeImpact.domain_ready_verdict),
    canonicalOutcome: statusForCurrentAttempt(current, providerRun),
    usageProjection,
    modelRouteCostProjection,
    createdAt: current.created_at,
    updatedAt: current.updated_at,
  });
}

function requiredIdentityMissing(task: FamilyRuntimeTaskRow | undefined, attempt: ControlAttemptRow | undefined) {
  return [
    task?.task_id ? null : 'task_id',
    task?.domain_id ? null : 'task.domain_id',
    task?.task_kind ? null : 'task.task_kind',
    attempt?.stage_attempt_id ? null : 'stage_attempt_id',
    attempt?.workflow_id ? null : 'workflow_id',
    attempt?.task_id ? null : 'attempt.task_id',
    attempt?.domain_id ? null : 'attempt.domain_id',
    attempt?.stage_id ? null : 'stage_id',
    attempt?.provider_kind ? null : 'provider_kind',
    attempt?.idempotency_key ? null : 'idempotency_key',
    attempt?.source_fingerprint ? null : 'source_fingerprint',
  ].filter((entry): entry is string => Boolean(entry));
}

function staleEpochKinds(taskPayload: Record<string, unknown>, attempt: ControlAttemptRow) {
  const workspaceLocator = parseRecord(attempt.workspace_locator_json);
  const attemptDomainSourceFingerprint = stringValue(workspaceLocator.domain_source_fingerprint);
  const checks = [
    {
      kind: 'source_fingerprint',
      taskValue: stringValue(taskPayload.source_fingerprint),
      attemptValue: attemptDomainSourceFingerprint ?? attempt.source_fingerprint,
    },
    {
      kind: 'route_epoch',
      taskValue: stringValue(taskPayload.route_epoch),
      attemptValue: stringValue(workspaceLocator.route_epoch),
    },
    {
      kind: 'truth_epoch',
      taskValue: stringValue(taskPayload.truth_epoch),
      attemptValue: stringValue(workspaceLocator.truth_epoch),
    },
  ];
  return checks
    .filter((check) => check.taskValue && check.attemptValue && check.taskValue !== check.attemptValue)
    .map((check) => check.kind);
}

function rawArtifactRefFromProviderRun(providerRun: Record<string, unknown>) {
  const processOutput = record(providerRun.process_output_summary);
  const rawArtifact = record(processOutput.raw_stage_artifact);
  const progressProjection = record(processOutput.progress_closeout_projection);
  const acceptedProgress = record(progressProjection.accepted_progress);
  return stringValue(rawArtifact.output_ref) ?? stringValue(acceptedProgress.raw_artifact_ref);
}

function statusForCurrentAttempt(attempt: ControlAttemptRow, providerRun: Record<string, unknown>) {
  if (attempt.status === 'completed' && attempt.closeout_receipt_status === 'accepted_typed_closeout') {
    return 'accepted_typed_closeout';
  }
  if (attempt.status === 'completed' && rawArtifactRefFromProviderRun(providerRun)) {
    return 'completed_with_quality_debt';
  }
  return attempt.status;
}

function terminalWithoutAcceptedCloseout(attempt: ControlAttemptRow, providerRun: Record<string, unknown>) {
  const providerStatus = stringValue(providerRun.provider_status);
  return (
    (attempt.status === 'completed' || providerStatus === 'completed')
    && attempt.closeout_receipt_status !== 'accepted_typed_closeout'
    && !rawArtifactRefFromProviderRun(providerRun)
  );
}

function taskSuccessSupersedesProviderTransportObservation(
  task: FamilyRuntimeTaskRow | undefined,
  attempt: ControlAttemptRow | undefined,
  providerRun: Record<string, unknown>,
) {
  if (task?.status !== 'succeeded' || !attempt || attempt.executor_kind !== 'domain_handler') {
    return null;
  }
  const terminalObservation = parseRecord(providerRun.terminal_observation);
  const blockerReason = attempt.blocked_reason ?? stringValue(terminalObservation.reason);
  const providerStatus = stringValue(providerRun.provider_status);
  const isProviderTransportOnlyFailure = attempt.status === 'failed'
    && providerStatus === 'failed'
    && blockerReason === 'temporal_workflow_not_started_or_not_found';
  return isProviderTransportOnlyFailure ? blockerReason : null;
}

function terminalAttemptRefs(attempts: ControlAttemptRow[], current: ControlAttemptRow | undefined) {
  return attempts
    .filter((attempt) => attempt.stage_attempt_id !== current?.stage_attempt_id)
    .filter((attempt) => ['completed', 'failed', 'blocked', 'dead_lettered'].includes(attempt.status))
    .map((attempt) => `opl://stage_attempts/${attempt.stage_attempt_id}`);
}

function refsOnlyDomainHandlerCheckpoint(attempt: ControlAttemptRow | undefined) {
  return Boolean(
    attempt
    && attempt.status === 'checkpointed'
    && attempt.executor_kind === 'domain_handler'
    && attempt.closeout_receipt_status === 'domain_handler_receipt_ref_only',
  );
}

function domainHandlerProviderAttemptRequested(
  task: FamilyRuntimeTaskRow | undefined,
  attempt: ControlAttemptRow | undefined,
) {
  if (task?.status !== 'running' || task.last_error !== OPL_ATTEMPT_ADMISSION_REQUESTED_REASON) {
    return false;
  }
  if (!attempt) {
    return true;
  }
  return attempt.status === 'queued'
    && attempt.executor_kind === 'domain_handler'
    && attempt.closeout_receipt_status === 'domain_handler_receipt_ref_only';
}

function domainRouteAdmissionRequested(
  task: FamilyRuntimeTaskRow | undefined,
  taskPayload: Record<string, unknown>,
  attempt: ControlAttemptRow | undefined,
) {
  return Boolean(
    task
    && !attempt
    && ['queued', 'retry_waiting', 'running'].includes(task.status)
    && isDomainRouteStageRouteTask(task, taskPayload),
  );
}

function isLiveProviderAttempt(attempt: ControlAttemptRow | undefined, providerRun: Record<string, unknown>) {
  if (!attempt) {
    return false;
  }
  if (refsOnlyDomainHandlerCheckpoint(attempt)) {
    return false;
  }
  const providerStatus = stringValue(providerRun.provider_status);
  return ['running', 'checkpointed', 'human_gate'].includes(attempt.status)
    || ['running', 'checkpointed', 'human_gate'].includes(providerStatus ?? '');
}

function isNewerTask(
  left: Pick<FamilyRuntimeTaskRow, 'created_at' | 'task_id'>,
  right: Pick<FamilyRuntimeTaskRow, 'created_at' | 'task_id'>,
) {
  if (left.created_at !== right.created_at) {
    return left.created_at > right.created_at;
  }
  return left.task_id > right.task_id;
}

function workUnitIdentity(
  payload: Record<string, unknown>,
  attempt: ControlAttemptRow | undefined = undefined,
): WorkUnitIdentity {
  const workspaceLocator = attempt ? parseRecord(attempt.workspace_locator_json) : {};
  return {
    action_type: stringValue(payload.action_type) ?? stringValue(workspaceLocator.action_type),
    work_unit_id: stringValue(payload.work_unit_id) ?? stringValue(workspaceLocator.work_unit_id),
    dispatch_ref: stringValue(payload.dispatch_ref) ?? stringValue(workspaceLocator.dispatch_ref),
    next_executable_owner:
      stringValue(payload.next_executable_owner) ?? stringValue(workspaceLocator.next_executable_owner),
    source_fingerprint:
      stringValue(payload.source_fingerprint) ?? stringValue(workspaceLocator.domain_source_fingerprint),
  };
}

function mismatchedWorkUnitIdentityFields(stale: WorkUnitIdentity, current: WorkUnitIdentity) {
  return (['action_type', 'work_unit_id', 'dispatch_ref'] as const)
    .filter((field) => stale[field] && current[field] && stale[field] !== current[field]);
}

function currentDefaultExecutorSameWorkUnitTask(
  db: DatabaseSync,
  task: FamilyRuntimeTaskRow,
  taskPayload: Record<string, unknown>,
  current: ControlAttemptRow,
) {
  if (!isDefaultExecutorDispatchTask(task, taskPayload)) {
    return null;
  }
  const defaultExecutorWorkUnitId = defaultExecutorWorkUnitIdentity(task, taskPayload);
  if (!defaultExecutorWorkUnitId) {
    return null;
  }
  const staleWorkUnit = workUnitIdentity(taskPayload, current);
  const rows = db.prepare(`
    SELECT *
    FROM tasks
    ORDER BY created_at DESC, task_id DESC
  `).all() as FamilyRuntimeTaskRow[];
  for (const row of rows) {
    if (
      row.task_id === task.task_id
      || !CURRENT_DEFAULT_EXECUTOR_TASK_STATUSES.has(row.status)
      || !isNewerTask(row, task)
    ) {
      continue;
    }
    const payload = parseRecord(row.payload_json);
    if (
      !isDefaultExecutorDispatchTask(row, payload)
      || defaultExecutorWorkUnitIdentity(row, payload) !== defaultExecutorWorkUnitId
    ) {
      continue;
    }
    const currentWorkUnit = workUnitIdentity(payload);
    const mismatchedIdentityFields = mismatchedWorkUnitIdentityFields(staleWorkUnit, currentWorkUnit);
    if (mismatchedIdentityFields.length === 0) {
      continue;
    }
    return {
      task: row,
      payload,
      staleWorkUnit,
      currentWorkUnit,
      mismatchedIdentityFields,
    };
  }
  return null;
}

function staleWorkUnitDiagnostic(
  db: DatabaseSync,
  task: FamilyRuntimeTaskRow | undefined,
  taskPayload: Record<string, unknown>,
  current: ControlAttemptRow | undefined,
  liveProviderAttempt: boolean,
) {
  if (!task || !current || !liveProviderAttempt) {
    return null;
  }
  const currentTask = currentDefaultExecutorSameWorkUnitTask(db, task, taskPayload, current);
  if (!currentTask) {
    return null;
  }
  return {
    diagnostic: STALE_WORK_UNIT_DIAGNOSTIC,
    status: 'stale',
    stale_task_id: task.task_id,
    stale_stage_attempt_id: current.stage_attempt_id,
    superseded_by_task_id: currentTask.task.task_id,
    stale_task_status: task.status,
    current_task_status: currentTask.task.status,
    stale_work_unit: currentTask.staleWorkUnit,
    current_work_unit: currentTask.currentWorkUnit,
    mismatched_identity_fields: currentTask.mismatchedIdentityFields,
    authority_boundary: {
      opl: 'current_control_projection_diagnostic_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_attempt_cancelled: false,
      provider_completion_is_domain_ready: false,
      starts_concurrent_attempt: false,
    },
  };
}

export function deriveCurrentControlStateForTask(db: DatabaseSync, taskId: string) {
  const task = readTask(db, taskId);
  const attempts = readAttempts(db, taskId);
  const current = attempts[0];
  return deriveCurrentControlStateFromRows(db, taskId, task, attempts, current);
}

export function deriveCurrentControlStateForAttempt(db: DatabaseSync, stageAttemptId: string) {
  const current = readAttempt(db, stageAttemptId);
  const task = readTaskForAttempt(db, current);
  const attempts = current?.task_id ? readAttempts(db, current.task_id) : current ? [current] : [];
  return deriveCurrentControlStateFromRows(db, current?.task_id ?? null, task, attempts, current);
}

function deriveCurrentControlStateFromRows(
  db: DatabaseSync,
  taskId: string | null,
  task: FamilyRuntimeTaskRow | undefined,
  attempts: ControlAttemptRow[],
  current: ControlAttemptRow | undefined,
) {
  const taskPayload = parseRecord(task?.payload_json);
  const latestCloseout = current ? readLatestCloseoutPacket(db, current.stage_attempt_id) : {};
  const currentWorkspaceLocator = current ? parseRecord(current.workspace_locator_json) : {};
  const stageRunCurrentnessIdentity = buildStageRunCurrentnessIdentity({
    task: task
      ? {
          domain_id: task.domain_id,
          task_id: task.task_id,
          payload: taskPayload,
        }
      : null,
    taskPayload: {
      ...taskPayload,
      workspace_locator: currentWorkspaceLocator,
    },
    stageAttempt: current
      ? {
          domain_id: current.domain_id,
          stage_id: current.stage_id,
          stage_attempt_id: current.stage_attempt_id,
          source_fingerprint: current.source_fingerprint,
          idempotency_key: current.idempotency_key,
          workflow_id: current.workflow_id,
          task_id: current.task_id,
          workspace_locator: currentWorkspaceLocator,
        }
      : null,
  });
  const providerRun = current ? parseRecord(current.provider_run_json) : {};
  const routeImpact = parseRecord(current?.route_impact_json);
  const activityEvents = current ? parseList(current.activity_events_json) : [];
  const livenessProviderRun = latestProviderActivityHeartbeat(activityEvents, providerRun);
  const liveProviderAttempt = isLiveProviderAttempt(current, providerRun);
  const staleWorkUnit = staleWorkUnitDiagnostic(db, task, taskPayload, current, liveProviderAttempt);
  const projectedLiveProviderAttempt = liveProviderAttempt && !staleWorkUnit;
  const closeoutRefs = current ? stringList(parseList(current.closeout_refs_json)) : [];
  const stageProgressLog = currentStageProgressLog(current, livenessProviderRun, activityEvents, latestCloseout);
  const missingIdentity = requiredIdentityMissing(task, current);
  const staleEpochs = task && current ? staleEpochKinds(taskPayload, current) : [];
  const ownerReceiptRefs = uniqueStrings([
    ...refListFromRecord(latestCloseout, ['owner_receipt_ref', 'owner_receipt_refs']),
    ...refListFromRecord(routeImpact, [
      'owner_receipt_ref',
      'owner_receipt_refs',
      'domain_owner_receipt_ref',
      'domain_owner_receipt_refs',
    ]),
  ]);
  const typedBlockerRefs = uniqueStrings([
    ...refListFromRecord(latestCloseout, ['typed_blocker_ref', 'typed_blocker_refs']),
    ...refListFromRecord(routeImpact, ['typed_blocker_ref', 'typed_blocker_refs']),
    ...typedBlockerRefsFromCloseoutRefs(closeoutRefs),
  ]);
  const qualitySummary = qualityDebtProjectionFromRecords([
    taskPayload,
    routeImpact,
    latestCloseout,
  ]);
  const ownerAnswerObservation = task
    && isDomainRouteTask(task.domain_id, task.task_kind, taskPayload)
    ? domainOwnerAnswerObservationFromRecords([
        { source: 'task_payload', value: taskPayload },
        { source: 'stage_attempt_route_impact', value: routeImpact },
        { source: 'latest_closeout', value: latestCloseout },
      ])
    : null;
  const base = {
    surface_kind: 'opl_current_control_state',
    projection_policy: 'opl_reconciled_queue_attempt_provider_closeout_projection_only',
    task_id: taskId,
    domain_id: task?.domain_id ?? current?.domain_id ?? null,
    task_kind: task?.task_kind ?? null,
    active_run_id: projectedLiveProviderAttempt && current ? `opl-stage-attempt://${current.stage_attempt_id}` : null,
    active_stage_attempt_id: projectedLiveProviderAttempt ? current?.stage_attempt_id ?? null : null,
    active_workflow_id: projectedLiveProviderAttempt ? current?.workflow_id ?? null : null,
    running_provider_attempt: projectedLiveProviderAttempt,
    current_stage_attempt_id: current?.stage_attempt_id ?? null,
    workflow_id: current?.workflow_id ?? null,
    provider_kind: current?.provider_kind ?? null,
    source_fingerprint: current?.source_fingerprint ?? null,
    closeout_refs: closeoutRefs,
    closeout_receipt_status: current?.closeout_receipt_status ?? null,
    owner_receipt_refs: ownerReceiptRefs,
    typed_blocker_refs: typedBlockerRefs,
    quality_debt_refs: qualitySummary.quality_debt_refs,
    quality_debt_reason_codes: qualitySummary.quality_debt_reason_codes,
    quality_summary: qualitySummary,
    stale_epoch_kinds: staleEpochs,
    stale_work_unit_diagnostic: staleWorkUnit,
    stage_run_currentness_identity: stageRunCurrentnessIdentity,
    missing_stage_run_currentness_identity_fields:
      missingStageRunCurrentnessIdentityFields(stageRunCurrentnessIdentity),
    missing_identity_fields: missingIdentity,
    provider_run: {
      provider_status: stringValue(providerRun.provider_status),
      completed_at: stringValue(providerRun.completed_at),
      last_heartbeat_at: stringValue(livenessProviderRun.last_heartbeat_at),
      ledger_last_heartbeat_at: stringValue(livenessProviderRun.ledger_last_heartbeat_at),
      liveness_source: stringValue(livenessProviderRun.liveness_source),
      last_activity_heartbeat_kind: stringValue(livenessProviderRun.last_activity_heartbeat_kind),
      last_runner_event_kind: stringValue(livenessProviderRun.last_runner_event_kind),
    },
    stage_progress_log: stageProgressLog
      ? summarizeStageProgressLogs([stageProgressLog], 'current_control_state')
      : summarizeStageProgressLogs([], 'current_control_state'),
    active_stage_attempt_stage_progress_log_ref: current
      ? `/stage_attempt_workbench/attempts/${current.stage_attempt_id}/stage_progress_log`
      : null,
    superseded_terminal_attempt_refs: terminalAttemptRefs(attempts, current),
    derivation_sources: [
      'stage_attempt_projection_task',
      'stage_attempt_ledger',
      'provider_run_projection',
      'typed_stage_closeout_ledger',
    ],
    forbidden_derivation_sources: [
      'domain_latest',
      'domain_dispatch_latest',
      'domain_readiness_verdict',
      'domain_artifact_ready_verdict',
    ],
    authority_boundary: currentControlAuthorityBoundary(),
  };

  if (ownerAnswerObservation) {
    return {
      ...base,
      reconciliation_status: 'domain_owner_answer_observed',
      current_attempt_state: 'blocked',
      blocker_reason: ownerAnswerObservation.reason,
      domain_owner_answer_observation: ownerAnswerObservation,
      authority_boundary: {
        ...base.authority_boundary,
        provider_completion_is_domain_ready: false,
        refs_only_checkpoint_is_running_proof: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
      },
    };
  }
  if (
    domainHandlerProviderAttemptRequested(task, current)
    || domainRouteAdmissionRequested(task, taskPayload, current)
  ) {
    return {
      ...base,
      reconciliation_status: 'provider_attempt_requested',
      current_attempt_state: current ? 'queued' : 'provider_start_pending',
      blocker_reason: OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON,
      authority_boundary: {
        ...base.authority_boundary,
        provider_completion_is_domain_ready: false,
        refs_only_checkpoint_is_running_proof: false,
      },
    };
  }
  if (!task || !current || missingIdentity.length > 0) {
    return {
      ...base,
      reconciliation_status: 'blocked_missing_identity',
      current_attempt_state: 'blocked',
      blocker_reason: 'missing_control_identity',
    };
  }
  if (staleEpochs.length > 0) {
    return {
      ...base,
      reconciliation_status: 'blocked_stale_epoch',
      current_attempt_state: 'blocked',
      blocker_reason: 'stale_route_source_or_truth_epoch',
    };
  }
  if (staleWorkUnit) {
    return {
      ...base,
      reconciliation_status: 'blocked_stale_work_unit',
      current_attempt_state: 'blocked',
      blocker_reason: STALE_WORK_UNIT_DIAGNOSTIC,
    };
  }
  if (refsOnlyDomainHandlerCheckpoint(current)) {
    return {
      ...base,
      reconciliation_status: 'checkpointed_refs_only_domain_handler_receipt',
      current_attempt_state: 'checkpointed',
      blocker_reason: 'domain_handler_receipt_ref_only_not_provider_running_proof',
      authority_boundary: {
        ...base.authority_boundary,
        provider_completion_is_domain_ready: false,
        refs_only_checkpoint_is_running_proof: false,
      },
    };
  }
  if (terminalWithoutAcceptedCloseout(current, providerRun)) {
    return {
      ...base,
      reconciliation_status: 'completed_with_quality_debt_no_output_diagnostic',
      current_attempt_state: 'succeeded',
      blocker_reason: null,
      progress_diagnostic_ref: `opl://stage-attempts/${current.stage_attempt_id}/no-output-diagnostic`,
      next_stage_may_start: true,
    };
  }
  const supersededProviderTransportReason = taskSuccessSupersedesProviderTransportObservation(
    task,
    current,
    providerRun,
  );
  if (supersededProviderTransportReason) {
    return {
      ...base,
      reconciliation_status: 'succeeded',
      current_attempt_state: 'succeeded',
      blocker_reason: null,
      terminal_provider_transport_observation_superseded: true,
      superseded_terminal_observation_reason: supersededProviderTransportReason,
      superseded_by_task_status: task.status,
    };
  }
  const currentState = statusForCurrentAttempt(current, providerRun);
  return {
    ...base,
    reconciliation_status: currentState,
    current_attempt_state: currentState,
    blocker_reason: current.blocked_reason,
  };
}
