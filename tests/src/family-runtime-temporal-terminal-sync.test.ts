import test from 'node:test';
import assert from 'node:assert/strict';

import './family-runtime-temporal-terminal-sync-cases/attempt-precedence.ts';
import {
  inspectStageAttempt,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import {
  blockedTemporalObservation,
  canceledTemporalObservation,
  completedTemporalObservation,
  createGenericDomainHandlerAttempt,
  createQueueTables,
  insertGenericDomainRouteTask,
  missingWorkflowObservation,
  withStageAttemptDb,
} from './family-runtime-temporal-terminal-sync-cases/helpers.ts';

const genericObservationIdentity = {
  domainId: 'redcube',
  stageId: 'domain_route/stage-route',
  checkpointRef: 'checkpoint:generic-domain-route',
  nextOwner: 'redcube',
} as const;

test('missing Temporal workflow leaves an unclaimed generic attempt intact', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    const taskId = 'task-generic-unclaimed';
    createQueueTables(db);
    insertGenericDomainRouteTask(db, { taskId, status: 'queued', createdAt });
    const attempt = createGenericDomainHandlerAttempt(db, { taskId });

    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      missingWorkflowObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
      }),
    );
    const task = db.prepare('SELECT status FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
    };

    assert.equal(synced, null);
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).status, 'queued');
    assert.equal(task.status, 'queued');
  });
});

test('missing Temporal workflow preserves a checkpointed generic domain handler attempt', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    const taskId = 'task-generic-domain-handler-checkpoint';
    createQueueTables(db);
    insertGenericDomainRouteTask(db, { taskId, status: 'succeeded', createdAt });
    const attempt = createGenericDomainHandlerAttempt(db, { taskId });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'checkpointed',
        provider_run_json = json_set(provider_run_json, '$.provider_status', 'checkpointed'),
        updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(createdAt, attempt.stage_attempt_id);

    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      missingWorkflowObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
      }),
    );
    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
    const task = db.prepare(
      'SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?',
    ).get(taskId) as {
      status: string;
      last_error: string | null;
      dead_letter_reason: string | null;
    };

    assert.equal(synced, null);
    assert.equal(inspected.status, 'checkpointed');
    assert.equal(inspected.provider_run.provider_status, 'checkpointed');
    assert.deepEqual({ ...task }, { status: 'succeeded', last_error: null, dead_letter_reason: null });
  });
});

for (const scenario of [
  {
    name: 'blocked',
    observation: blockedTemporalObservation,
    expectedAttemptStatus: 'blocked',
    expectedProviderStatus: 'blocked',
    expectedTaskReason: 'typed_closeout_packet_required',
  },
  {
    name: 'completed',
    observation: completedTemporalObservation,
    expectedAttemptStatus: 'completed',
    expectedProviderStatus: 'completed',
    expectedTaskReason: 'domain_route_domain_gate_pending',
  },
] as const) {
  test(`Temporal terminal sync owns generic domain-route ${scenario.name} transition`, () => {
    withStageAttemptDb((db) => {
      const createdAt = new Date().toISOString();
      const taskId = `task-generic-${scenario.name}`;
      createQueueTables(db);
      insertGenericDomainRouteTask(db, { taskId, status: 'running', createdAt });
      const attempt = createGenericDomainHandlerAttempt(db, { taskId });

      const synced = syncStageAttemptFromTemporalTerminalObservation(
        db,
        scenario.observation({
          stageAttemptId: attempt.stage_attempt_id,
          workflowId: attempt.workflow_id,
          createdAt,
          ...genericObservationIdentity,
        }),
      );
      const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
      const task = db.prepare(
        'SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?',
      ).get(taskId) as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };

      assert.equal(synced?.status, scenario.expectedAttemptStatus);
      assert.equal(inspected.provider_run.provider_status, scenario.expectedProviderStatus);
      assert.deepEqual({ ...task }, {
        status: 'blocked',
        last_error: scenario.expectedTaskReason,
        dead_letter_reason: scenario.expectedTaskReason,
      });
    });
  });
}

test('Temporal cancellation remains provider-only for a generic domain route', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    const taskId = 'task-generic-canceled';
    createQueueTables(db);
    insertGenericDomainRouteTask(db, { taskId, status: 'running', createdAt });
    const attempt = createGenericDomainHandlerAttempt(db, { taskId });

    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      canceledTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        workflowStatus: 'CANCELLED',
      }),
    );
    const task = db.prepare(
      'SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?',
    ).get(taskId) as {
      status: string;
      last_error: string | null;
      dead_letter_reason: string | null;
    };

    assert.equal(synced?.blocked_reason, 'temporal_workflow_canceled');
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.provider_status, 'canceled');
    assert.deepEqual({ ...task }, {
      status: 'dead_letter',
      last_error: 'temporal_workflow_canceled',
      dead_letter_reason: 'temporal_workflow_canceled',
    });
  });
});
