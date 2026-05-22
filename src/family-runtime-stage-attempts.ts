import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import {
  buildStageAttemptProviderReceipt,
  inspectFamilyRuntimeProviderWithLifecycle,
  resolveFamilyRuntimeProviderKind,
} from './family-runtime-providers.ts';
import type {
  FamilyRuntimeDomainId,
  FamilyRuntimeProviderKind,
  TemporalStageAttemptSignalKind,
} from './family-runtime-types.ts';
import {
  buildCodexStageActivityInput,
  normalizeTypedStageCloseoutPacket,
  type TypedStageCloseoutPacket,
} from './family-runtime-codex-stage-runner.ts';
import { buildFamilyRuntimeControlledApplyContract } from './family-runtime-controlled-apply.ts';
import { buildFamilyRuntimeLifecyclePrimitives } from './family-runtime-lifecycle.ts';
import {
  buildDuplicateTaskEnvelope,
  buildFamilyConflictSubject,
  buildReceiptConflictEnvelope,
  buildStageAttemptConflictOrBlockerEnvelopes,
  canonicalOutcomeForStageAttempt,
} from './family-conflict-envelope.ts';
import {
  getStageAttemptRow,
  inspectStageAttemptPayload,
  listStageAttemptCloseouts,
  listStageAttempts,
  listStageAttemptsForTask,
  listStageAttemptSignals,
  parseStageAttemptJsonObject,
  parseStageAttemptJsonList,
  stageAttemptSignalToPayload,
  type StageAttemptCloseoutRow,
  type StageAttemptRow,
  type StageAttemptSignalRow,
  type StageAttemptStatus,
  stageAttemptToPayload,
} from './family-runtime-stage-attempt-ledger.ts';
import { stableId } from './family-runtime-ids.ts';
import {
  buildTemporalStageAttemptWorkflowContract,
  buildTemporalStageAttemptWorkflowInput,
  type TemporalStageAttemptWorkflowState,
} from './family-runtime-temporal.ts';
import { buildAttemptGenericProjections } from './runtime-tray-stage-attempt-generic-projections.ts';
import { buildAttemptHumanReviewBurdenBudget } from './family-human-review-budget.ts';

export {
  createStageAttemptTable,
  listStageAttemptCloseouts,
  listStageAttempts,
  listStageAttemptsForTask,
  listStageAttemptSignals,
  stageAttemptToPayload,
  type StageAttemptStatus,
} from './family-runtime-stage-attempt-ledger.ts';

export type StageAttemptCreateInput = {
  domainId: FamilyRuntimeDomainId;
  stageId: string;
  providerKind?: FamilyRuntimeProviderKind;
  workspaceLocator: Record<string, unknown>;
  sourceFingerprint?: string;
  executorKind?: string;
  executorBindingRef?: string;
  invocationMode?: string;
  boundedEditRef?: string;
  taskId?: string;
  retryBudget?: Record<string, unknown>;
  checkpointRefs?: string[];
  closeoutRefs?: string[];
  humanGateRefs?: string[];
  blockedReason?: string;
  launchAdmissionGate?: object;
  launchInvocation?: object;
  newAttempt?: boolean;
  start?: boolean;
};

type ProviderReadinessPaths = {
  root: string;
};

type ProviderReadinessOptions = {
  managedProviderProjection?: {
    managed_temporal_state_consistency?: Record<string, unknown> | null;
  } | null;
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeStageId(stageId: string) {
  const normalized = stageId.trim();
  if (!normalized) {
    throw new FrameworkContractError('cli_usage_error', 'Stage attempt requires a non-empty stage id.', {
      required: ['--stage'],
    });
  }
  return normalized;
}

function normalizeJsonList(value?: string[]) {
  return Array.isArray(value) ? value.filter((entry) => entry.trim()).map((entry) => entry.trim()) : [];
}

function normalizeRouteImpact(packet: TypedStageCloseoutPacket) {
  const routeImpact = packet.route_impact && typeof packet.route_impact === 'object' && !Array.isArray(packet.route_impact)
    ? packet.route_impact
    : {};
  return {
    ...routeImpact,
    next_owner: packet.next_owner,
    domain_ready_verdict: packet.domain_ready_verdict,
  };
}

function stringListFrom(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function recordListFrom(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => (
        typeof entry === 'object' && entry !== null && !Array.isArray(entry)
      ))
    : [];
}

function signalPayloadsByKind(
  db: DatabaseSync,
  stageAttemptId: string,
  signalKind: TemporalStageAttemptSignalKind,
) {
  return listStageAttemptSignals(db, stageAttemptId).filter((signal) => signal.signal_kind === signalKind);
}

function taskDeadLetterForAttempt(db: DatabaseSync, attempt: ReturnType<typeof stageAttemptToPayload>) {
  if (attempt.status !== 'dead_lettered') {
    return null;
  }
  const taskId = typeof attempt.task_id === 'string' ? attempt.task_id : null;
  const task = taskId
    ? db.prepare(`
      SELECT task_id, domain_id, task_kind, status, attempts, max_attempts, last_error, dead_letter_reason, updated_at
      FROM tasks
      WHERE task_id = ?
    `).get(taskId) as Record<string, unknown> | undefined
    : undefined;
  return {
    reason: attempt.blocked_reason ?? (typeof task?.dead_letter_reason === 'string' ? task.dead_letter_reason : null),
    task: task ?? null,
  };
}

function normalizeActivityEvent(value: Record<string, unknown>) {
  return {
    event_time: nowIso(),
    ...value,
  };
}

function appendActivityEventToRow(row: StageAttemptRow, event: Record<string, unknown>) {
  return [
    ...parseStageAttemptJsonList(row.activity_events_json).filter(
      (entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    ),
    normalizeActivityEvent(event),
  ];
}

type TemporalStageAttemptTerminalObservation = {
  surface_kind: 'temporal_stage_attempt_query_receipt';
  provider_kind: 'temporal';
  stage_attempt_id: string;
  workflow_id: string;
  workflow_status?: string;
  query?: TemporalStageAttemptWorkflowState;
};

function isTemporalStageAttemptTerminalObservation(
  observation: unknown,
): observation is TemporalStageAttemptTerminalObservation {
  return (
    typeof observation === 'object'
    && observation !== null
    && !Array.isArray(observation)
    && (observation as Record<string, unknown>).surface_kind === 'temporal_stage_attempt_query_receipt'
    && (observation as Record<string, unknown>).provider_kind === 'temporal'
    && typeof (observation as Record<string, unknown>).stage_attempt_id === 'string'
    && typeof (observation as Record<string, unknown>).workflow_id === 'string'
  );
}

function temporalTerminalFailureReason(observation: TemporalStageAttemptTerminalObservation) {
  if (observation.workflow_status === 'FAILED') {
    return 'temporal_workflow_failed';
  }
  if (observation.workflow_status === 'TIMED_OUT') {
    return 'temporal_workflow_timed_out';
  }
  if (observation.query?.status === 'failed') {
    return 'temporal_stage_attempt_query_failed';
  }
  return null;
}

export function createStageAttempt(db: DatabaseSync, input: StageAttemptCreateInput) {
  const stageId = normalizeStageId(input.stageId);
  const providerKind = resolveFamilyRuntimeProviderKind(input.providerKind);
  const createdAt = nowIso();
  const sourceFingerprint = input.sourceFingerprint?.trim() || null;
  const executorKind = input.executorKind?.trim() || 'codex_cli';
  const retryBudget = input.retryBudget ?? { max_attempts: 3 };
  const taskId = input.taskId?.trim() || null;
  const baseIdempotencyKey = stableId('idem', [
    input.domainId,
    stageId,
    providerKind,
    input.workspaceLocator,
    sourceFingerprint,
    taskId,
  ]);
  const idempotencyKey = input.newAttempt
    ? stableId('idem', [baseIdempotencyKey, 'new_attempt', createdAt])
    : baseIdempotencyKey;
  if (!input.newAttempt) {
    const existing = db.prepare(`
      SELECT * FROM stage_attempts WHERE idempotency_key = ? ORDER BY created_at ASC LIMIT 1
    `).get(idempotencyKey) as StageAttemptRow | undefined;
    if (existing) {
      const attempt = stageAttemptToPayload(existing);
      return {
        created: false,
        idempotent_noop: true,
        attempt,
        conflict_or_blocker_envelopes: [
          buildDuplicateTaskEnvelope({
            subject: buildFamilyConflictSubject({
              domain: attempt.domain_id,
              stageId: attempt.stage_id,
              taskKind: attempt.stage_id,
              sourceFingerprint: attempt.source_fingerprint,
              idempotencyKey: attempt.idempotency_key,
              stageAttemptId: attempt.stage_attempt_id,
              taskId: attempt.task_id,
            }),
            existingAttemptRef: `opl://stage_attempts/${attempt.stage_attempt_id}`,
          }),
        ],
      };
    }
  }
  const stageAttemptId = stableId('sat', [
    input.domainId,
    stageId,
    providerKind,
    input.workspaceLocator,
    sourceFingerprint,
    input.taskId ?? null,
    createdAt,
  ]);
  const workflowId = stableId('wf', [input.domainId, stageId, stageAttemptId]);
  const providerReceipt = buildStageAttemptProviderReceipt({
    providerKind,
    stageAttemptId,
    workflowId,
  });
  const providerRun = {
    provider_kind: providerKind,
    workflow_id: workflowId,
    provider_status: 'registered',
    started_at: null,
    completed_at: null,
    last_heartbeat_at: null,
  };
  const initialActivityEvents: Record<string, unknown>[] = input.launchAdmissionGate
    ? [{
        event_kind: 'stage_launch_admission_gate',
        event_time: createdAt,
        gate: input.launchAdmissionGate,
      }]
    : [];
  if (input.launchInvocation) {
    initialActivityEvents.push({
      event_kind: 'stage_launch_invocation',
      event_time: createdAt,
      invocation: input.launchInvocation,
    });
  }
  const row = {
    stage_attempt_id: stageAttemptId,
    idempotency_key: idempotencyKey,
    provider_kind: providerKind,
    workflow_id: workflowId,
    domain_id: input.domainId,
    stage_id: stageId,
    workspace_locator_json: JSON.stringify(input.workspaceLocator),
    source_fingerprint: sourceFingerprint,
    executor_kind: executorKind,
    status: input.blockedReason ? 'blocked' : 'queued',
    checkpoint_refs_json: JSON.stringify(normalizeJsonList(input.checkpointRefs)),
    closeout_refs_json: JSON.stringify(normalizeJsonList(input.closeoutRefs)),
    human_gate_refs_json: JSON.stringify(normalizeJsonList(input.humanGateRefs)),
    retry_budget_json: JSON.stringify(retryBudget),
    attempt_count: 0,
    task_id: taskId,
    blocked_reason: input.blockedReason?.trim() || null,
    provider_receipt_json: JSON.stringify(providerReceipt),
    provider_run_json: JSON.stringify(providerRun),
    activity_events_json: JSON.stringify(initialActivityEvents),
    route_impact_json: JSON.stringify({}),
    closeout_receipt_status: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
  db.prepare(`
    INSERT INTO stage_attempts(
      stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id, workspace_locator_json,
      source_fingerprint, executor_kind, status, checkpoint_refs_json, closeout_refs_json,
      human_gate_refs_json, retry_budget_json, attempt_count, task_id, blocked_reason,
      provider_receipt_json, provider_run_json, activity_events_json, route_impact_json,
      closeout_receipt_status, created_at, updated_at
    )
    VALUES (
      @stage_attempt_id, @idempotency_key, @provider_kind, @workflow_id, @domain_id, @stage_id, @workspace_locator_json,
      @source_fingerprint, @executor_kind, @status, @checkpoint_refs_json, @closeout_refs_json,
      @human_gate_refs_json, @retry_budget_json, @attempt_count, @task_id, @blocked_reason,
      @provider_receipt_json, @provider_run_json, @activity_events_json, @route_impact_json,
      @closeout_receipt_status, @created_at, @updated_at
    )
  `).run(row);
  return {
    created: true,
    idempotent_noop: false,
    attempt: stageAttemptToPayload(row as StageAttemptRow),
  };
}

function currentProviderReadinessPayload(
  provider: Awaited<ReturnType<typeof inspectFamilyRuntimeProviderWithLifecycle>>,
  providerKind: FamilyRuntimeProviderKind,
) {
  return {
    surface_kind: 'stage_attempt_current_provider_readiness',
    provider_kind: providerKind,
    provider_ready: provider.ready,
    status: provider.status,
    degraded_reason: provider.degraded_reason,
    capabilities: provider.capabilities,
    details: provider.details,
    provider_receipt_is_creation_time_snapshot: true,
    authority_boundary: {
      opl: 'current_provider_lifecycle_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

async function providerReadinessByKind(
  attempts: ReturnType<typeof stageAttemptToPayload>[],
  paths: ProviderReadinessPaths,
  options: ProviderReadinessOptions,
) {
  const providerKinds = [...new Set(attempts.map((attempt) => attempt.provider_kind))];
  const entries = await Promise.all(providerKinds.map(async (providerKind) => {
    const provider = await inspectFamilyRuntimeProviderWithLifecycle(providerKind, paths, options);
    return [providerKind, currentProviderReadinessPayload(provider, providerKind)] as const;
  }));
  return new Map(entries);
}

function attachCurrentProviderReadiness(
  attempt: ReturnType<typeof stageAttemptToPayload>,
  readinessByKind: Map<FamilyRuntimeProviderKind, ReturnType<typeof currentProviderReadinessPayload>>,
) {
  return {
    ...attempt,
    current_provider_readiness: readinessByKind.get(attempt.provider_kind) ?? null,
  };
}

export async function listStageAttemptsWithCurrentProviderReadiness(
  db: DatabaseSync,
  paths: ProviderReadinessPaths,
  options: ProviderReadinessOptions = {},
) {
  const attempts = listStageAttempts(db);
  const readinessByKind = await providerReadinessByKind(attempts, paths, options);
  return attempts.map((attempt) => attachCurrentProviderReadiness(attempt, readinessByKind));
}

export function inspectStageAttempt(db: DatabaseSync, stageAttemptId: string) {
  const attempt = inspectStageAttemptPayload(db, stageAttemptId);
  if (!attempt) {
    throw new FrameworkContractError('cli_usage_error', 'Family runtime stage attempt not found.', {
      stage_attempt_id: stageAttemptId,
    });
  }
  return attempt;
}

export function syncStageAttemptFromTemporalTerminalObservation(
  db: DatabaseSync,
  observation: unknown,
) {
  if (!isTemporalStageAttemptTerminalObservation(observation)) {
    return null;
  }
  const failureReason = temporalTerminalFailureReason(observation);
  if (!failureReason) {
    return null;
  }
  const row = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    observation.stage_attempt_id,
  ) as StageAttemptRow | undefined;
  if (!row || row.provider_kind !== 'temporal' || row.workflow_id !== observation.workflow_id) {
    return null;
  }
  if (row.status === 'completed' && row.closeout_receipt_status) {
    return stageAttemptToPayload(row);
  }
  const observedAt = nowIso();
  const providerRun = {
    ...parseStageAttemptJsonObject(row.provider_run_json),
    provider_kind: 'temporal',
    workflow_id: observation.workflow_id,
    provider_status: 'failed',
    completed_at: observedAt,
    last_heartbeat_at: observedAt,
    terminal_observation: {
      source: 'temporal_stage_attempt_query',
      workflow_status: observation.workflow_status ?? null,
      query_status: observation.query?.status ?? null,
      reason: failureReason,
    },
  };
  const activityEvents = appendActivityEventToRow(row, {
    activity_kind: 'temporal_stage_attempt_terminal_observation',
    activity_status: 'failed',
    workflow_status: observation.workflow_status ?? null,
    query_status: observation.query?.status ?? null,
    reason: failureReason,
    authority_boundary: {
      opl: 'provider_transport_status_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = 'failed', blocked_reason = ?, provider_run_json = ?, activity_events_json = ?,
      closeout_receipt_status = NULL, updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    failureReason,
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    observedAt,
    observation.stage_attempt_id,
  );
  return inspectStageAttempt(db, observation.stage_attempt_id);
}

export async function inspectStageAttemptWithCurrentProviderReadiness(
  db: DatabaseSync,
  stageAttemptId: string,
  paths: ProviderReadinessPaths,
  options: ProviderReadinessOptions = {},
) {
  const attempt = inspectStageAttempt(db, stageAttemptId);
  const provider = await inspectFamilyRuntimeProviderWithLifecycle(attempt.provider_kind, paths, options);
  return {
    ...attempt,
    current_provider_readiness: currentProviderReadinessPayload(provider, attempt.provider_kind),
  };
}

export function signalStageAttempt(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    signalKind: TemporalStageAttemptSignalKind;
    payload: Record<string, unknown>;
    source?: string;
  },
) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  const createdAt = nowIso();
  const signal = {
    signal_id: stableId('sig', [input.stageAttemptId, input.signalKind, input.payload, createdAt]),
    stage_attempt_id: input.stageAttemptId,
    signal_kind: input.signalKind,
    payload_json: JSON.stringify(input.payload),
    source: input.source?.trim() || 'opl-cli',
    created_at: createdAt,
  };
  db.prepare(`
    INSERT INTO stage_attempt_signals(signal_id, stage_attempt_id, signal_kind, payload_json, source, created_at)
    VALUES (@signal_id, @stage_attempt_id, @signal_kind, @payload_json, @source, @created_at)
  `).run(signal);

  if (input.signalKind === 'human_gate') {
    const currentHumanGateRefs = Array.isArray(attempt.human_gate_refs)
      ? attempt.human_gate_refs.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const humanGateRef = typeof input.payload.human_gate_ref === 'string'
      ? input.payload.human_gate_ref
      : signal.signal_id;
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'human_gate', human_gate_refs_json = ?, blocked_reason = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify([...new Set([...currentHumanGateRefs, humanGateRef])]),
      typeof input.payload.reason === 'string' ? input.payload.reason : 'human_gate_signal_received',
      createdAt,
      input.stageAttemptId,
    );
  } else if (input.signalKind === 'resume') {
    db.prepare(`
      UPDATE stage_attempts
      SET status = CASE WHEN status IN ('human_gate', 'blocked', 'failed') THEN 'queued' ELSE status END,
        blocked_reason = NULL, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(createdAt, input.stageAttemptId);
  } else if (input.signalKind === 'user_instruction') {
    db.prepare(`
      UPDATE stage_attempts
      SET provider_run_json = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify({
        ...attempt.provider_run,
        last_user_instruction_signal_id: signal.signal_id,
        last_user_instruction_at: createdAt,
      }),
      createdAt,
      input.stageAttemptId,
    );
  }

  return {
    attempt: inspectStageAttempt(db, input.stageAttemptId),
    signal: stageAttemptSignalToPayload(signal as StageAttemptSignalRow),
  };
}

export function ingestStageAttemptCloseout(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    packet: TypedStageCloseoutPacket | Record<string, unknown>;
  },
) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  const packet = normalizeTypedStageCloseoutPacket(input.packet);
  const createdAt = nowIso();
  const closeoutId = packet.closeout_id
    ?? stableId('closeout', [input.stageAttemptId, packet.surface_kind, packet.closeout_refs]);
  const packetJson = JSON.stringify(packet);
  const existingCloseout = db.prepare(`
    SELECT * FROM stage_attempt_closeouts WHERE closeout_id = ?
  `).get(closeoutId) as StageAttemptCloseoutRow | undefined;
  if (existingCloseout) {
    if (existingCloseout.stage_attempt_id !== input.stageAttemptId || existingCloseout.packet_json !== packetJson) {
      const subject = buildFamilyConflictSubject({
        domain: attempt.domain_id,
        stageId: attempt.stage_id,
        taskKind: attempt.stage_id,
        sourceFingerprint: attempt.source_fingerprint,
        idempotencyKey: attempt.idempotency_key,
        stageAttemptId: attempt.stage_attempt_id,
        taskId: attempt.task_id,
      });
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage closeout id already exists with a different typed closeout packet.',
        {
          closeout_id: closeoutId,
          stage_attempt_id: input.stageAttemptId,
          existing_stage_attempt_id: existingCloseout.stage_attempt_id,
          required: ['unique closeout_id per typed packet'],
          receipt_conflict: buildReceiptConflictEnvelope({
            subject,
            reason: 'stage_closeout_id_already_exists_with_different_packet',
            evidenceRefs: [
              `opl://stage_attempt_closeouts/${closeoutId}`,
              `opl://stage_attempts/${input.stageAttemptId}`,
            ],
          }),
        },
      );
    }
    return {
      attempt,
      closeout: {
        closeout_id: closeoutId,
        stage_attempt_id: input.stageAttemptId,
        packet,
        created_at: existingCloseout.created_at,
        persisted_count: 1,
        idempotent_noop: true,
      },
    };
  }
  db.prepare(`
    INSERT OR IGNORE INTO stage_attempt_closeouts(closeout_id, stage_attempt_id, packet_json, created_at)
    VALUES (?, ?, ?, ?)
  `).run(closeoutId, input.stageAttemptId, packetJson, createdAt);
  const persistedCloseouts = db.prepare(
    'SELECT COUNT(*) AS count FROM stage_attempt_closeouts WHERE closeout_id = ?',
  ).get(closeoutId) as { count: number };
  const existingCloseoutRefs = Array.isArray(attempt.closeout_refs)
    ? attempt.closeout_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const humanGateRefs = Array.isArray(attempt.human_gate_refs)
    ? attempt.human_gate_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const currentRow = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as StageAttemptRow;
  const providerRun = {
    ...attempt.provider_run,
    provider_status: 'completed',
    completed_at: createdAt,
    last_heartbeat_at: createdAt,
  };
  const activityEvents = appendActivityEventToRow(currentRow, {
    activity_kind: 'typed_closeout_ingest',
    activity_status: 'completed',
    closeout_id: closeoutId,
    closeout_refs: packet.closeout_refs,
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = 'completed', closeout_refs_json = ?, human_gate_refs_json = ?, blocked_reason = NULL,
      provider_run_json = ?, activity_events_json = ?, route_impact_json = ?, closeout_receipt_status = ?,
      updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    JSON.stringify([...new Set([...existingCloseoutRefs, ...packet.closeout_refs])]),
    JSON.stringify(humanGateRefs),
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    JSON.stringify(normalizeRouteImpact(packet)),
    'accepted_typed_closeout',
    createdAt,
    input.stageAttemptId,
  );
  return {
    attempt: inspectStageAttempt(db, input.stageAttemptId),
    closeout: {
      closeout_id: closeoutId,
      stage_attempt_id: input.stageAttemptId,
      packet,
      created_at: createdAt,
      persisted_count: persistedCloseouts.count,
      idempotent_noop: false,
    },
  };
}

export function runStageAttemptFixtureActivity(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    stagePacketRef?: string | null;
    checkpointRefs?: string[];
    closeoutPacket?: Record<string, unknown>;
  },
) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  const startedAt = nowIso();
  const checkpointRefs = normalizeJsonList(input.checkpointRefs);
  const currentRow = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as StageAttemptRow;
  const providerRun = {
    ...attempt.provider_run,
    provider_kind: attempt.provider_kind,
    workflow_id: attempt.workflow_id,
    provider_status: checkpointRefs.length > 0 ? 'checkpointed' : 'running',
    started_at: typeof attempt.provider_run.started_at === 'string' ? attempt.provider_run.started_at : startedAt,
    last_heartbeat_at: startedAt,
  };
  const activityEvents = appendActivityEventToRow(currentRow, {
    activity_kind: 'codex_stage_activity',
    activity_status: checkpointRefs.length > 0 ? 'checkpointed' : 'running',
    stage_packet_ref: input.stagePacketRef ?? null,
    checkpoint_refs: checkpointRefs,
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = ?, attempt_count = attempt_count + 1, checkpoint_refs_json = ?,
      provider_run_json = ?, activity_events_json = ?, updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    checkpointRefs.length > 0 ? 'checkpointed' : 'running',
    JSON.stringify(checkpointRefs),
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    startedAt,
    input.stageAttemptId,
  );
  const runningAttempt = inspectStageAttempt(db, input.stageAttemptId);
  const activity = buildCodexStageActivityInput({
    attempt: runningAttempt,
    stagePacketRef: input.stagePacketRef,
  });
  const closeout = input.closeoutPacket
    ? ingestStageAttemptCloseout(db, {
        stageAttemptId: input.stageAttemptId,
        packet: input.closeoutPacket,
      })
    : null;
  const finalAttempt = inspectStageAttempt(db, input.stageAttemptId);
  return {
    provider_fixture_run: {
      provider_completion: closeout ? 'completed' : 'checkpointed',
      domain_ready_verdict: closeout?.closeout.packet.domain_ready_verdict ?? null,
      started_at: startedAt,
    },
    activity,
    attempt_before: attempt,
    attempt: finalAttempt,
    closeout,
  };
}

export function queryStageAttempt(db: DatabaseSync, stageAttemptId: string) {
  const attempt = inspectStageAttempt(db, stageAttemptId);
  const closeouts = listStageAttemptCloseouts(db, stageAttemptId);
  const humanGateLedger = signalPayloadsByKind(db, stageAttemptId, 'human_gate');
  const userInstructionLedger = signalPayloadsByKind(db, stageAttemptId, 'user_instruction');
  const resumeLedger = signalPayloadsByKind(db, stageAttemptId, 'resume');
  const latestCloseout = closeouts.at(-1)?.packet as Record<string, unknown> | undefined;
  const closeoutRefs = stringListFrom(attempt.closeout_refs);
  const consumedRefs = stringListFrom(latestCloseout?.consumed_refs);
  const consumedMemoryRefs = stringListFrom(latestCloseout?.consumed_memory_refs);
  const writebackReceiptRefs = stringListFrom(latestCloseout?.writeback_receipt_refs);
  const rejectedWrites = recordListFrom(latestCloseout?.rejected_writes);
  const subject = buildFamilyConflictSubject({
    domain: attempt.domain_id,
    stageId: attempt.stage_id,
    taskKind: attempt.stage_id,
    sourceFingerprint: attempt.source_fingerprint,
    idempotencyKey: attempt.idempotency_key,
    stageAttemptId: attempt.stage_attempt_id,
    taskId: attempt.task_id,
    sourceRefs: stringListFrom(attempt.workspace_locator.source_refs),
  });
  const domainReadyVerdict = typeof latestCloseout?.domain_ready_verdict === 'string'
    ? latestCloseout.domain_ready_verdict
    : null;
  const nextOwner = typeof latestCloseout?.next_owner === 'string'
    ? latestCloseout.next_owner
    : typeof attempt.route_impact.next_owner === 'string'
      ? attempt.route_impact.next_owner
      : attempt.domain_id;
  const controlledApplyContract = buildFamilyRuntimeControlledApplyContract({
    domainId: attempt.domain_id,
    stageId: attempt.stage_id,
    workspaceLocator: attempt.workspace_locator,
    routeImpact: attempt.route_impact,
  });
  const lifecyclePrimitives = buildFamilyRuntimeLifecyclePrimitives({
    workspaceLocator: attempt.workspace_locator,
    artifactRefs: [
      ...closeoutRefs,
      ...consumedRefs,
      ...writebackReceiptRefs,
    ],
  });
  const genericProjections = buildAttemptGenericProjections({
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    next_owner: nextOwner,
    route_impact: attempt.route_impact,
    workspace_locator: attempt.workspace_locator,
    source_fingerprint: attempt.source_fingerprint,
    checkpoint_refs: stringListFrom(attempt.checkpoint_refs),
    closeout_refs: closeoutRefs,
    consumed_refs: consumedRefs,
    consumed_memory_refs: consumedMemoryRefs,
    writeback_receipt_refs: writebackReceiptRefs,
    artifact_refs: [
      ...closeoutRefs,
      ...consumedRefs,
      ...writebackReceiptRefs,
    ],
    rejected_writes: rejectedWrites,
    attention_flags: [
      attempt.status === 'human_gate' || humanGateLedger.length > 0 || stringListFrom(attempt.human_gate_refs).length > 0
        ? 'human_gate'
        : null,
      resumeLedger.length > 0 ? 'resume_available' : null,
      attempt.status === 'dead_lettered' ? 'dead_lettered' : null,
      attempt.blocked_reason ? 'blocked' : null,
      rejectedWrites.length > 0 ? 'rejected_writes' : null,
    ].filter((flag): flag is string => Boolean(flag)),
    human_gate_refs: stringListFrom(attempt.human_gate_refs),
    human_gate_ledger: humanGateLedger,
    resume_ledger: resumeLedger,
    dead_letter: taskDeadLetterForAttempt(db, attempt),
    domain_ready_verdict: domainReadyVerdict,
    controlled_apply_contract: controlledApplyContract,
    lifecycle_primitives: lifecyclePrimitives,
    current_provider_readiness: null,
  });
  const humanReviewBurdenBudget = buildAttemptHumanReviewBurdenBudget({
    targetDomainId: attempt.domain_id,
    stageId: attempt.stage_id,
    humanGateRefs: stringListFrom(attempt.human_gate_refs),
    humanGateLedger,
    routeImpact: attempt.route_impact,
  });
  const conflictOrBlockerEnvelopes = buildStageAttemptConflictOrBlockerEnvelopes({
    subject,
    attemptStatus: attempt.status,
    blockedReason: attempt.blocked_reason,
    humanGateRefs: stringListFrom(attempt.human_gate_refs),
    humanGateLedger,
    deadLetter: taskDeadLetterForAttempt(db, attempt),
    rejectedWrites,
    domainReadyVerdict,
    closeoutRefs,
    closeoutReceiptStatus: attempt.closeout_receipt_status,
    routeImpact: attempt.route_impact,
  });
  const canonicalOutcome = canonicalOutcomeForStageAttempt({
    attemptStatus: attempt.status,
    closeoutRefs,
    closeoutReceiptStatus: attempt.closeout_receipt_status,
  });
  return {
    stage_attempt_query: {
      surface_kind: 'stage_attempt_query',
      attempt,
      workflow_contract:
        attempt.provider_kind === 'temporal'
          ? buildTemporalStageAttemptWorkflowContract()
          : null,
      workflow_input:
        attempt.provider_kind === 'temporal'
          ? buildTemporalStageAttemptWorkflowInput(attempt)
          : null,
      codex_stage_activity: buildCodexStageActivityInput({ attempt }),
      lifecycle_primitives: lifecyclePrimitives,
      controlled_apply_contract: controlledApplyContract,
      canonical_outcome: canonicalOutcome,
      conflict_or_blocker_envelopes: conflictOrBlockerEnvelopes,
      operator_conflicts: conflictOrBlockerEnvelopes,
      ...genericProjections,
      usage_projection: attempt.usage_projection,
      human_review_burden_budget: humanReviewBurdenBudget,
      operator_visibility: {
        provider_kind: attempt.provider_kind,
        attempt_id: attempt.stage_attempt_id,
        stage_id: attempt.stage_id,
        status: attempt.status,
        provider_run: attempt.provider_run,
        activity_events: attempt.activity_events,
        heartbeat: {
          last_updated_at: attempt.updated_at,
          last_heartbeat_at: typeof attempt.provider_run.last_heartbeat_at === 'string'
            ? attempt.provider_run.last_heartbeat_at
            : null,
          checkpoint_refs: attempt.checkpoint_refs,
        },
        consumed_refs: consumedRefs,
        consumed_memory_refs: consumedMemoryRefs,
        writeback_receipt_refs: writebackReceiptRefs,
        closeout_refs: attempt.closeout_refs,
        closeout_receipt_status: attempt.closeout_receipt_status,
        route_impact: attempt.route_impact,
        rejected_writes: rejectedWrites,
        next_owner: nextOwner,
        human_gate_refs: attempt.human_gate_refs,
        human_gate_ledger: humanGateLedger,
        human_review_burden_budget: humanReviewBurdenBudget,
        user_instruction_ledger: userInstructionLedger,
        resume_ledger: resumeLedger,
        user_instructions: userInstructionLedger,
        resume_signals: resumeLedger,
        dead_letter: taskDeadLetterForAttempt(db, attempt),
        canonical_outcome: canonicalOutcome,
        operator_conflicts: conflictOrBlockerEnvelopes,
        usage_projection: attempt.usage_projection,
        authority_boundary: {
          opl: 'attempt_control_metadata_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
      completion_boundary: {
        provider_completion: attempt.status === 'completed' ? 'completed' : 'not_completed',
        domain_ready_verdict: domainReadyVerdict,
        provider_completion_is_domain_ready: false,
      },
      signals: listStageAttemptSignals(db, stageAttemptId),
      closeouts,
    },
  };
}

export function updateStageAttemptsForTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    status: StageAttemptStatus;
    stageAttemptIds?: string[];
    incrementAttempt?: boolean;
    checkpointRefs?: string[];
    closeoutRefs?: string[];
    humanGateRefs?: string[];
    blockedReason?: string | null;
    activityEvent?: Record<string, unknown>;
  },
) {
  const rows = input.stageAttemptIds && input.stageAttemptIds.length > 0
    ? db.prepare(`
      SELECT * FROM stage_attempts
      WHERE task_id = ? AND stage_attempt_id IN (${input.stageAttemptIds.map(() => '?').join(',')})
    `).all(input.taskId, ...input.stageAttemptIds) as StageAttemptRow[]
    : db.prepare('SELECT * FROM stage_attempts WHERE task_id = ?').all(input.taskId) as StageAttemptRow[];
  if (rows.length === 0) {
    return [];
  }
  const updatedAt = nowIso();
  const attempts = rows.map((row) => {
    const status = input.status === 'completed' ? 'checkpointed' : input.status;
    const checkpointRefs = input.checkpointRefs ?? parseStageAttemptJsonList(row.checkpoint_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const closeoutRefs = input.closeoutRefs ?? parseStageAttemptJsonList(row.closeout_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const humanGateRefs = input.humanGateRefs ?? parseStageAttemptJsonList(row.human_gate_refs_json).filter(
      (entry): entry is string => typeof entry === 'string',
    );
    const providerRun = {
      ...parseStageAttemptJsonObject(row.provider_run_json),
      provider_status: status,
      last_heartbeat_at: updatedAt,
    };
    const activityEvents = input.activityEvent
      ? appendActivityEventToRow(row, input.activityEvent)
      : parseStageAttemptJsonList(row.activity_events_json);
    const closeoutReceiptStatus = input.status === 'completed' && closeoutRefs.length > 0
      ? 'domain_sidecar_receipt_ref_only'
      : null;
    db.prepare(`
      UPDATE stage_attempts
      SET status = ?, attempt_count = ?, checkpoint_refs_json = ?, closeout_refs_json = ?,
        human_gate_refs_json = ?, blocked_reason = ?, provider_run_json = ?, activity_events_json = ?,
        closeout_receipt_status = CASE WHEN ? IS NOT NULL AND closeout_receipt_status IS NULL THEN ? ELSE closeout_receipt_status END,
        updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      status,
      input.incrementAttempt ? row.attempt_count + 1 : row.attempt_count,
      JSON.stringify(checkpointRefs),
      JSON.stringify(closeoutRefs),
      JSON.stringify(humanGateRefs),
      input.blockedReason === undefined ? row.blocked_reason : input.blockedReason,
      JSON.stringify(providerRun),
      JSON.stringify(activityEvents),
      closeoutReceiptStatus,
      closeoutReceiptStatus,
      updatedAt,
      row.stage_attempt_id,
    );
    return inspectStageAttempt(db, row.stage_attempt_id);
  });
  return attempts;
}

export function stageAttemptSummary(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count FROM stage_attempts GROUP BY status ORDER BY status
  `).all() as Array<{ status: StageAttemptStatus; count: number }>;
  return {
    total: rows.reduce((sum, row) => sum + row.count, 0),
    by_status: Object.fromEntries(rows.map((row) => [row.status, row.count])),
  };
}
