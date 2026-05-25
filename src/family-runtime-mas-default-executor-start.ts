import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import type { familyRuntimePaths, FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
} from './family-runtime-store.ts';
import {
  inspectStageAttempt,
  listStageAttemptsForTask,
  updateStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';
import { findLiveMasDefaultExecutorDispatchAttempt } from './family-runtime-provider-hosted-attempts.ts';

type FamilyRuntimePaths = ReturnType<typeof familyRuntimePaths>;
type StageAttemptPayload = ReturnType<typeof listStageAttemptsForTask>[number];
type TemporalProviderModule = () => Promise<{
  startTemporalStageAttemptWorkflow: (
    attempt: StageAttemptPayload,
    options: { paths: FamilyRuntimePaths },
  ) => Promise<Record<string, unknown>>;
}>;

const LIVE_STAGE_ATTEMPT_STATUSES = new Set(['running', 'checkpointed', 'human_gate']);

function contractErrorMessage(error: unknown) {
  if (error instanceof FrameworkContractError) {
    return error.message;
  }
  return error instanceof Error ? error.message : 'Unexpected provider start failure.';
}

function markStageAttemptTemporalStarted(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    temporalStart: Record<string, unknown>;
  },
) {
  const started = updateStageAttemptsForTask(db, {
    taskId: inspectStageAttempt(db, input.stageAttemptId).task_id ?? '',
    stageAttemptIds: [input.stageAttemptId],
    status: 'running',
    incrementAttempt: true,
    activityEvent: {
      activity_kind: 'temporal_stage_attempt_start',
      activity_status: 'started',
      temporal_start: input.temporalStart,
      authority_boundary: {
        opl: 'provider_transport_start_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    },
  });
  return started[0] ?? inspectStageAttempt(db, input.stageAttemptId);
}

function blockTaskForTemporalStartFailure(
  db: DatabaseSync,
  input: {
    row: FamilyRuntimeTaskRow;
    errorMessage: string;
    launchableAttempt: StageAttemptPayload | null;
  },
) {
  const blockedAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(input.errorMessage, 'temporal_stage_attempt_start_failed', blockedAt, input.row.task_id);
  insertEvent(db, {
    taskId: input.row.task_id,
    domainId: input.row.domain_id,
    eventType: 'stage_attempt_temporal_start_blocked',
    source: 'opl-family-runtime',
    payload: {
      stage_attempt_id: input.launchableAttempt?.stage_attempt_id ?? null,
      reason: 'temporal_stage_attempt_start_failed',
      error: input.errorMessage,
    },
  });
}

function claimMasDefaultExecutorTask(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
) {
  const leaseOwner = `opl-family-runtime:${process.pid}`;
  const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const attempt = row.attempts + 1;
  const claimedAt = nowIso();
  const result = db.prepare(`
    UPDATE tasks
    SET status = 'running', attempts = ?, lease_owner = ?, lease_expires_at = ?, updated_at = ?
    WHERE task_id = ? AND status IN ('queued', 'retry_waiting')
  `).run(attempt, leaseOwner, leaseExpiresAt, claimedAt, row.task_id);
  if (result.changes === 0) {
    return null;
  }
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_default_executor_claimed',
    source: 'opl-family-runtime',
    payload: {
      attempt,
      lease_owner: leaseOwner,
      lease_expires_at: leaseExpiresAt,
    },
  });
  return {
    attempt,
    lease_owner: leaseOwner,
    lease_expires_at: leaseExpiresAt,
  };
}

export async function startMasDefaultExecutorDispatchAttempt(
  db: DatabaseSync,
  paths: FamilyRuntimePaths,
  input: {
    row: FamilyRuntimeTaskRow;
    payload: Record<string, unknown>;
    providerHostedAttempt: StageAttemptPayload | null;
    temporalProviderModule: TemporalProviderModule;
  },
) {
  const { row, payload, providerHostedAttempt, temporalProviderModule } = input;
  let temporalStart: Record<string, unknown> | null = null;
  const liveAttempt = listStageAttemptsForTask(db, row.task_id).find((attempt) => (
    attempt.provider_kind === 'temporal'
    && attempt.executor_kind === 'codex_cli'
    && LIVE_STAGE_ATTEMPT_STATUSES.has(attempt.status)
  )) ?? null;
  if (liveAttempt) {
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_default_executor_live_attempt_skip',
      source: 'opl-family-runtime',
      payload: {
        reason: 'live_stage_attempt_exists',
        stage_attempt_id: liveAttempt.stage_attempt_id,
      },
    });
    return {
      task_id: row.task_id,
      status: 'skipped',
      reason: 'live_stage_attempt_exists',
      admitted_stage_attempt: liveAttempt,
      stage_attempts: listStageAttemptsForTask(db, row.task_id),
    };
  }
  const liveDispatchAttempt = findLiveMasDefaultExecutorDispatchAttempt(db, row, payload);
  if (liveDispatchAttempt) {
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_default_executor_live_attempt_skip',
      source: 'opl-family-runtime',
      payload: {
        reason: 'live_stage_attempt_exists_for_dispatch',
        stage_attempt_id: liveDispatchAttempt.stage_attempt_id,
        task_id: liveDispatchAttempt.task_id,
        dispatch_ref: payload.dispatch_ref ?? null,
        action_type: payload.action_type ?? null,
        study_id: payload.study_id ?? null,
      },
    });
    return {
      task_id: row.task_id,
      status: 'skipped',
      reason: 'live_stage_attempt_exists_for_dispatch',
      admitted_stage_attempt: liveDispatchAttempt,
      stage_attempts: listStageAttemptsForTask(db, row.task_id),
    };
  }
  const taskClaim = claimMasDefaultExecutorTask(db, row);
  if (!taskClaim) {
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_default_executor_claim_skipped',
      source: 'opl-family-runtime',
      payload: {
        reason: 'task_already_claimed',
        stale_status: row.status,
      },
    });
    return {
      task_id: row.task_id,
      status: 'skipped',
      reason: 'task_already_claimed',
      stage_attempts: listStageAttemptsForTask(db, row.task_id),
    };
  }
  const launchableAttempt = providerHostedAttempt ?? listStageAttemptsForTask(db, row.task_id).find((attempt) => (
    attempt.provider_kind === 'temporal'
    && attempt.executor_kind === 'codex_cli'
    && attempt.status === 'queued'
  )) ?? null;
  if (!launchableAttempt || launchableAttempt.status === 'blocked') {
    const errorMessage = launchableAttempt?.blocked_reason ?? 'MAS default executor dispatch has no launchable Temporal Codex stage attempt.';
    blockTaskForTemporalStartFailure(db, { row, errorMessage, launchableAttempt });
    return {
      task_id: row.task_id,
      status: 'blocked',
      reason: 'temporal_stage_attempt_start_failed',
      error: errorMessage,
      admitted_stage_attempt: launchableAttempt,
      stage_attempts: listStageAttemptsForTask(db, row.task_id),
    };
  }

  try {
    const { startTemporalStageAttemptWorkflow } = await temporalProviderModule();
    temporalStart = await startTemporalStageAttemptWorkflow(launchableAttempt, { paths });
    markStageAttemptTemporalStarted(db, {
      stageAttemptId: launchableAttempt.stage_attempt_id,
      temporalStart,
    });
  } catch (error) {
    const errorMessage = contractErrorMessage(error);
    blockTaskForTemporalStartFailure(db, { row, errorMessage, launchableAttempt });
    const blockedStageAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      stageAttemptIds: providerHostedAttempt ? [providerHostedAttempt.stage_attempt_id] : undefined,
      status: 'blocked',
      blockedReason: errorMessage,
      activityEvent: {
        activity_kind: 'temporal_stage_attempt_start',
        activity_status: 'blocked',
        reason: 'temporal_stage_attempt_start_failed',
        error: errorMessage,
        authority_boundary: {
          opl: 'provider_transport_start_only',
          domain: 'truth_quality_artifact_gate_owner',
          provider_completion_is_domain_ready: false,
        },
      },
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'error',
      title: 'Family runtime default executor start blocked',
      body: errorMessage,
      payload: {
        reason: 'temporal_stage_attempt_start_failed',
        stage_attempt_id: launchableAttempt?.stage_attempt_id ?? null,
      },
    });
    return {
      task_id: row.task_id,
      status: 'blocked',
      reason: 'temporal_stage_attempt_start_failed',
      error: errorMessage,
      admitted_stage_attempt: launchableAttempt,
      stage_attempts: blockedStageAttempts.length > 0
        ? blockedStageAttempts
        : listStageAttemptsForTask(db, row.task_id),
    };
  }

  const completedAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = ?
    WHERE task_id = ?
  `).run(completedAt, row.task_id);
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_admitted_default_executor_stage_attempt',
    source: 'opl-family-runtime',
    payload: {
      task_kind: row.task_kind,
      dispatch_ref: payload.dispatch_ref,
      stage_attempt_id: launchableAttempt?.stage_attempt_id ?? null,
      temporal_start: temporalStart,
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: 'info',
    title: 'Family runtime default executor task admitted',
    body: `${row.domain_id}:${row.task_kind}`,
    payload: {
      dispatch_ref: payload.dispatch_ref,
      stage_attempt_id: launchableAttempt?.stage_attempt_id ?? null,
      temporal_start: temporalStart,
    },
  });
  return {
    task_id: row.task_id,
    status: 'succeeded',
    admitted_stage_attempt: launchableAttempt,
    temporal_start: temporalStart,
    stage_attempts: listStageAttemptsForTask(db, row.task_id),
  };
}
