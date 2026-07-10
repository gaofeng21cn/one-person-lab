import test from 'node:test';
import assert from 'node:assert/strict';

import './family-runtime-temporal-terminal-sync-cases/attempt-precedence.ts';
import {
  createStageAttempt,
  inspectStageAttempt,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import {
  blockedTemporalObservation,
  canceledTemporalObservation,
  completedTemporalObservation,
  createQueueTables,
  insertDomainRouteTask,
  missingWorkflowObservation,
  withStageAttemptDb,
} from './family-runtime-temporal-terminal-sync-cases/helpers.ts';

const genericObservationIdentity = { domainId: 'redcube', stageId: 'domain_route/stage-route', checkpointRef: 'checkpoint:generic-domain-route', nextOwner: 'redcube' } as const;

function createGenericDomainHandlerAttempt(db: Parameters<typeof createStageAttempt>[0], taskId: string) {
  return createStageAttempt(db, {
    domainId: 'redcube', stageId: 'domain_route/stage-route', providerKind: 'temporal',
    workspaceLocator: { route_ref: 'domain_route/stage-route' }, sourceFingerprint: 'sha256:generic-domain-route', executorKind: 'domain_handler',
    taskId, checkpointRefs: ['checkpoint:generic-domain-route'],
  }).attempt;
}

function taskState(db: Parameters<typeof createStageAttempt>[0], taskId: string) {
  return db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(taskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
}

for (const [name, taskStatus, attemptStatus, providerStatus] of [
  ['unclaimed', 'queued', 'queued', 'registered'],
  ['checkpointed', 'succeeded', 'checkpointed', 'checkpointed'],
] as const) {
  test(`missing Temporal workflow preserves ${name} generic domain handler state`, () => {
    withStageAttemptDb((db) => {
      const createdAt = new Date().toISOString(), taskId = `task-generic-${name}`;
      createQueueTables(db);
      insertDomainRouteTask(db, { taskId, status: taskStatus, createdAt });
      const attempt = createGenericDomainHandlerAttempt(db, taskId);
      if (attemptStatus === 'checkpointed') {
        db.prepare(`UPDATE stage_attempts SET status = 'checkpointed', provider_run_json = json_set(provider_run_json,
          '$.provider_status', 'checkpointed'), updated_at = ? WHERE stage_attempt_id = ?`)
          .run(createdAt, attempt.stage_attempt_id);
      }

      const synced = syncStageAttemptFromTemporalTerminalObservation(db, missingWorkflowObservation({
        stageAttemptId: attempt.stage_attempt_id, workflowId: attempt.workflow_id }));
      const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
      assert.equal(synced, null);
      assert.equal(inspected.status, attemptStatus); assert.equal(inspected.provider_run.provider_status, providerStatus);
      assert.deepEqual({ ...taskState(db, taskId) }, { status: taskStatus, last_error: null, dead_letter_reason: null });
    });
  });
}

for (const [name, observation, expectedStatus, expectedTaskReason] of [
  ['blocked', blockedTemporalObservation, 'blocked', 'typed_closeout_packet_required'],
  ['completed', completedTemporalObservation, 'completed', 'domain_route_domain_gate_pending'],
] as const) {
  test(`Temporal terminal sync owns generic domain-route ${name} transition`, () => {
    withStageAttemptDb((db) => {
      const createdAt = new Date().toISOString(), taskId = `task-generic-${name}`;
      createQueueTables(db);
      insertDomainRouteTask(db, { taskId, status: 'running', createdAt });
      const attempt = createGenericDomainHandlerAttempt(db, taskId);

      const synced = syncStageAttemptFromTemporalTerminalObservation(db, observation({
        stageAttemptId: attempt.stage_attempt_id, workflowId: attempt.workflow_id,
        createdAt, ...genericObservationIdentity }));
      const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
      assert.equal(synced?.status, expectedStatus); assert.equal(inspected.provider_run.provider_status, expectedStatus);
      assert.deepEqual({ ...taskState(db, taskId) }, { status: 'blocked', last_error: expectedTaskReason, dead_letter_reason: expectedTaskReason });
    });
  });
}

test('Temporal cancellation remains provider-only for a generic domain route', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString(), taskId = 'task-generic-canceled';
    createQueueTables(db);
    insertDomainRouteTask(db, { taskId, status: 'running', createdAt });
    const attempt = createGenericDomainHandlerAttempt(db, taskId);

    const synced = syncStageAttemptFromTemporalTerminalObservation(db, canceledTemporalObservation({
      stageAttemptId: attempt.stage_attempt_id, workflowId: attempt.workflow_id, workflowStatus: 'CANCELLED' }));
    assert.equal(synced?.blocked_reason, 'temporal_workflow_canceled');
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.provider_status, 'canceled');
    assert.deepEqual({ ...taskState(db, taskId) }, { status: 'dead_letter',
      last_error: 'temporal_workflow_canceled', dead_letter_reason: 'temporal_workflow_canceled' });
  });
});
