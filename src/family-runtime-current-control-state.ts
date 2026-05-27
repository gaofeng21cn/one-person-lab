import type { DatabaseSync } from 'node:sqlite';

import type { FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import type { StageAttemptRow } from './family-runtime-stage-attempt-ledger.ts';

type ControlAttemptRow = StageAttemptRow & { rowid: number };

function parseRecord(value: string | null | undefined) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseList(value: string | null | undefined) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function latestProviderActivityHeartbeat(
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

function currentControlAuthorityBoundary() {
  return {
    opl: 'reconciled_stage_runtime_control_projection_only',
    domain: 'truth_quality_artifact_gate_owner',
    reads_domain_latest_or_dispatch_latest: false,
    provider_completion_is_domain_ready: false,
    opl_can_authorize_domain_ready: false,
    opl_can_authorize_publication_ready: false,
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

function statusForCurrentAttempt(attempt: ControlAttemptRow) {
  if (attempt.status === 'completed' && attempt.closeout_receipt_status === 'accepted_typed_closeout') {
    return 'accepted_typed_closeout';
  }
  return attempt.status;
}

function terminalWithoutAcceptedCloseout(attempt: ControlAttemptRow, providerRun: Record<string, unknown>) {
  const providerStatus = stringValue(providerRun.provider_status);
  return (
    (attempt.status === 'completed' || providerStatus === 'completed')
    && attempt.closeout_receipt_status !== 'accepted_typed_closeout'
  );
}

function terminalAttemptRefs(attempts: ControlAttemptRow[], current: ControlAttemptRow | undefined) {
  return attempts
    .filter((attempt) => attempt.stage_attempt_id !== current?.stage_attempt_id)
    .filter((attempt) => ['completed', 'failed', 'blocked', 'dead_lettered'].includes(attempt.status))
    .map((attempt) => `opl://stage_attempts/${attempt.stage_attempt_id}`);
}

function isLiveProviderAttempt(attempt: ControlAttemptRow | undefined, providerRun: Record<string, unknown>) {
  if (!attempt) {
    return false;
  }
  const providerStatus = stringValue(providerRun.provider_status);
  return ['running', 'checkpointed', 'human_gate'].includes(attempt.status)
    || ['running', 'checkpointed', 'human_gate'].includes(providerStatus ?? '');
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
  const providerRun = current ? parseRecord(current.provider_run_json) : {};
  const activityEvents = current ? parseList(current.activity_events_json) : [];
  const livenessProviderRun = latestProviderActivityHeartbeat(activityEvents, providerRun);
  const liveProviderAttempt = isLiveProviderAttempt(current, providerRun);
  const closeoutRefs = current ? stringList(parseList(current.closeout_refs_json)) : [];
  const missingIdentity = requiredIdentityMissing(task, current);
  const staleEpochs = task && current ? staleEpochKinds(taskPayload, current) : [];
  const ownerReceiptRefs = uniqueStrings([
    ...refListFromRecord(latestCloseout, ['owner_receipt_ref', 'owner_receipt_refs']),
    ...refListFromRecord(parseRecord(current?.route_impact_json), [
      'owner_receipt_ref',
      'owner_receipt_refs',
      'domain_owner_receipt_ref',
      'domain_owner_receipt_refs',
    ]),
  ]);
  const typedBlockerRefs = uniqueStrings([
    ...refListFromRecord(latestCloseout, ['typed_blocker_ref', 'typed_blocker_refs']),
    ...refListFromRecord(parseRecord(current?.route_impact_json), ['typed_blocker_ref', 'typed_blocker_refs']),
  ]);
  const base = {
    surface_kind: 'opl_current_control_state',
    projection_policy: 'opl_reconciled_queue_attempt_provider_closeout_projection_only',
    task_id: taskId,
    domain_id: task?.domain_id ?? current?.domain_id ?? null,
    task_kind: task?.task_kind ?? null,
    active_run_id: liveProviderAttempt && current ? `opl-stage-attempt://${current.stage_attempt_id}` : null,
    active_stage_attempt_id: liveProviderAttempt ? current?.stage_attempt_id ?? null : null,
    active_workflow_id: liveProviderAttempt ? current?.workflow_id ?? null : null,
    running_provider_attempt: liveProviderAttempt,
    current_stage_attempt_id: current?.stage_attempt_id ?? null,
    workflow_id: current?.workflow_id ?? null,
    provider_kind: current?.provider_kind ?? null,
    source_fingerprint: current?.source_fingerprint ?? null,
    closeout_refs: closeoutRefs,
    closeout_receipt_status: current?.closeout_receipt_status ?? null,
    owner_receipt_refs: ownerReceiptRefs,
    typed_blocker_refs: typedBlockerRefs,
    stale_epoch_kinds: staleEpochs,
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
    superseded_terminal_attempt_refs: terminalAttemptRefs(attempts, current),
    derivation_sources: [
      'family_runtime_queue_task',
      'stage_attempt_ledger',
      'provider_run_projection',
      'typed_stage_closeout_ledger',
    ],
    forbidden_derivation_sources: [
      'mas_latest',
      'mas_dispatch_latest',
      'domain_publication_ready_verdict',
      'domain_artifact_ready_verdict',
    ],
    authority_boundary: currentControlAuthorityBoundary(),
  };

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
  if (terminalWithoutAcceptedCloseout(current, providerRun)) {
    return {
      ...base,
      reconciliation_status: 'blocked_provider_completed_missing_typed_closeout',
      current_attempt_state: 'blocked',
      blocker_reason: 'typed_closeout_packet_required',
    };
  }
  const currentState = statusForCurrentAttempt(current);
  return {
    ...base,
    reconciliation_status: currentState,
    current_attempt_state: currentState,
    blocker_reason: current.blocked_reason,
  };
}
