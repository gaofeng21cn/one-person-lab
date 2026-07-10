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
  createMasDefaultExecutorAttempt,
  createQueueTables,
  insertMasDefaultExecutorTask,
  missingWorkflowObservation,
  withStageAttemptDb,
} from './family-runtime-temporal-terminal-sync-cases/helpers.ts';

test('missing Temporal workflow leaves an unclaimed queued attempt intact', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-unclaimed',
      status: 'queued',
      createdAt,
    });
    const attempt = createMasDefaultExecutorAttempt(db, { taskId: 'task-unclaimed' });

    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      missingWorkflowObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
      }),
    );

    assert.equal(synced, null);
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).status, 'queued');
  });
});

const terminalCases = [
  {
    name: 'blocked',
    taskStatus: 'succeeded' as const,
    observation: blockedTemporalObservation,
    expectedAttemptStatus: 'blocked',
    expectedProviderStatus: 'blocked',
    expectedTaskStatus: 'blocked',
    expectedDeadLetter: 'temporal_stage_attempt_not_completed',
  },
  {
    name: 'completed',
    taskStatus: 'blocked' as const,
    observation: completedTemporalObservation,
    expectedAttemptStatus: 'completed',
    expectedProviderStatus: 'completed',
    expectedTaskStatus: 'succeeded',
    expectedDeadLetter: null,
  },
] as const;

for (const scenario of terminalCases) {
  test(`Temporal terminal sync owns ${scenario.name} state transition`, () => {
    withStageAttemptDb((db) => {
      const createdAt = new Date().toISOString();
      const taskId = `task-${scenario.name}`;
      createQueueTables(db);
      insertMasDefaultExecutorTask(db, {
        taskId,
        status: scenario.taskStatus,
        createdAt,
        lastError: scenario.taskStatus === 'blocked' ? 'temporal_workflow_failed' : null,
        deadLetterReason: scenario.taskStatus === 'blocked' ? 'temporal_stage_attempt_failed' : null,
      });
      const attempt = createMasDefaultExecutorAttempt(db, { taskId });

      const synced = syncStageAttemptFromTemporalTerminalObservation(
        db,
        scenario.observation({
          stageAttemptId: attempt.stage_attempt_id,
          workflowId: attempt.workflow_id,
          createdAt,
        }),
      );
      const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
      const task = db.prepare('SELECT status, dead_letter_reason FROM tasks WHERE task_id = ?').get(taskId) as {
        status: string;
        dead_letter_reason: string | null;
      };

      assert.equal(synced?.status, scenario.expectedAttemptStatus);
      assert.equal(inspected.provider_run.provider_status, scenario.expectedProviderStatus);
      assert.equal(task.status, scenario.expectedTaskStatus);
      assert.equal(task.dead_letter_reason, scenario.expectedDeadLetter);
    });
  });
}

test('Temporal cancellation spelling remains provider-only and fails closed', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, { taskId: 'task-canceled', status: 'queued', createdAt });
    const attempt = createMasDefaultExecutorAttempt(db, { taskId: 'task-canceled' });

    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      canceledTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        workflowStatus: 'CANCELLED',
      }),
    );
    const task = db.prepare('SELECT status, dead_letter_reason FROM tasks WHERE task_id = ?').get('task-canceled') as {
      status: string;
      dead_letter_reason: string | null;
    };

    assert.equal(synced?.blocked_reason, 'temporal_workflow_canceled');
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.provider_status, 'canceled');
    assert.equal(task.status, 'blocked');
    assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_canceled');
  });
});
