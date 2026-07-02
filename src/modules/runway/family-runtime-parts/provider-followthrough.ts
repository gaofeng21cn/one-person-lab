import type { DatabaseSync } from 'node:sqlite';

import { inspectStageAttempt } from '../family-runtime-stage-attempts.ts';
import {
  dispatchFamilyRuntimeTask,
} from '../family-runtime-task-dispatch.ts';
import {
  type familyRuntimePaths,
  type FamilyRuntimeTaskRow,
} from '../family-runtime-store.ts';
import { isPaperMissionStageRouteProviderRedriveTask } from '../family-runtime-redrive.ts';

async function temporalProviderModule() {
  return await import('../family-runtime-temporal-provider.ts');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function providerPreflightBlockedReason(value: unknown) {
  if (typeof value !== 'object' || value === null) {
    return 'provider_not_ready';
  }
  const record = value as Record<string, unknown>;
  const queueTick = typeof record.queue_tick === 'object' && record.queue_tick !== null
    ? record.queue_tick as Record<string, unknown>
    : {};
  if (typeof queueTick.dispatch_blocked_reason === 'string' && queueTick.dispatch_blocked_reason.trim()) {
    return queueTick.dispatch_blocked_reason;
  }
  const providerBlocker = typeof record.provider_blocker === 'object' && record.provider_blocker !== null
    ? record.provider_blocker as Record<string, unknown>
    : {};
  if (typeof providerBlocker.blocker_id === 'string' && providerBlocker.blocker_id.trim()) {
    return providerBlocker.blocker_id;
  }
  return 'provider_not_ready';
}

export function redrivenStageAttemptId(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const attempt = isRecord(value.redriven_stage_attempt) ? value.redriven_stage_attempt : null;
  return typeof attempt?.stage_attempt_id === 'string' && attempt.stage_attempt_id.trim()
    ? attempt.stage_attempt_id.trim()
    : null;
}

export async function paperMissionRedriveProviderFollowthrough(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  taskId: string,
  redriveResult: Record<string, unknown>,
  options: {
    temporalProviderModule?: Parameters<typeof dispatchFamilyRuntimeTask>[3]['temporalProviderModule'];
  } = {},
) {
  const stageAttemptId = redrivenStageAttemptId(redriveResult);
  if (!stageAttemptId) {
    return {
      status: 'not_applicable',
      reason: 'redrive_did_not_create_stage_attempt',
      stage_attempt_id: null,
      provider_started: false,
    };
  }
  const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow | undefined;
  if (!row) {
    return {
      status: 'blocked',
      reason: 'redriven_task_missing',
      stage_attempt_id: stageAttemptId,
      provider_started: false,
    };
  }
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  if (!isPaperMissionStageRouteProviderRedriveTask(row, payload)) {
    return {
      status: 'not_applicable',
      reason: 'not_paper_mission_stage_route_redrive',
      stage_attempt_id: stageAttemptId,
      provider_started: false,
    };
  }
  const attempt = inspectStageAttempt(db, stageAttemptId);
  if (attempt.status !== 'queued') {
    return {
      status: 'not_applicable',
      reason: `redriven_attempt_${attempt.status}`,
      stage_attempt_id: stageAttemptId,
      provider_started: false,
    };
  }
  const dispatch = await dispatchFamilyRuntimeTask(db, paths, row, {
    temporalProviderModule: options.temporalProviderModule ?? temporalProviderModule,
  });
  const refreshedAttempt = inspectStageAttempt(db, stageAttemptId);
  const providerStarted = refreshedAttempt.status === 'running'
    && isRecord(refreshedAttempt.provider_run)
    && refreshedAttempt.provider_run.provider_status === 'running';
  const dispatchRecord = dispatch as Record<string, unknown>;
  const dispatchReason = typeof dispatchRecord.reason === 'string'
    ? dispatchRecord.reason
    : null;
  return {
    status: providerStarted ? 'provider_started' : 'provider_not_started',
    reason: providerStarted ? 'paper_mission_redrive_provider_followthrough_started' : dispatchReason,
    stage_attempt_id: stageAttemptId,
    provider_started: providerStarted,
    dispatch,
  };
}
