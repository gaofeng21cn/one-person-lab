import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStageAttempt,
  inspectStageAttempt,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../../src/modules/runway/family-runtime-stage-attempts.ts';
import {
  blockedTemporalObservation,
  completedTemporalObservation,
  createMasDefaultExecutorAttempt,
  createQueueTables,
  failedTemporalObservation,
  insertMasDefaultExecutorTask,
  withStageAttemptDb,
} from './helpers.ts';

function newerAttempt(db: Parameters<typeof createStageAttempt>[0], taskId: string, sourceFingerprint: string) {
  return createStageAttempt(db, {
    domainId: 'medautoscience',
    stageId: 'domain_owner/default-executor-dispatch',
    providerKind: 'temporal',
    workspaceLocator: { workspace_root: '/tmp/mas', redrive: true },
    sourceFingerprint,
    executorKind: 'codex_cli',
    taskId,
    checkpointRefs: ['dispatch:mas-default-writer-start'],
  }).attempt;
}

test('older terminal failure cannot overwrite a newer accepted closeout', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    const taskId = 'task-newer-closeout-wins';
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId,
      status: 'blocked',
      createdAt,
      lastError: 'temporal_workflow_failed',
      deadLetterReason: 'temporal_stage_attempt_failed',
    });
    const older = createMasDefaultExecutorAttempt(db, { taskId, sourceFingerprint: 'sha256:older' });
    const newer = newerAttempt(db, taskId, 'sha256:newer');

    syncStageAttemptFromTemporalTerminalObservation(db, completedTemporalObservation({
      stageAttemptId: newer.stage_attempt_id,
      workflowId: newer.workflow_id,
      createdAt,
    }));
    syncStageAttemptFromTemporalTerminalObservation(db, failedTemporalObservation({
      stageAttemptId: older.stage_attempt_id,
      workflowId: older.workflow_id,
      createdAt,
    }));
    const task = db.prepare('SELECT status, last_error FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      last_error: string | null;
    };

    assert.equal(inspectStageAttempt(db, older.stage_attempt_id).status, 'failed');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.last_error, null);
  });
});

test('older terminal blocker cannot overwrite a newer live redrive', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    const taskId = 'task-newer-redrive-running';
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, { taskId, status: 'succeeded', createdAt });
    const older = createMasDefaultExecutorAttempt(db, { taskId, sourceFingerprint: 'sha256:older' });
    const newer = newerAttempt(db, taskId, 'sha256:redrive');
    db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(newer.stage_attempt_id);

    syncStageAttemptFromTemporalTerminalObservation(db, blockedTemporalObservation({
      stageAttemptId: older.stage_attempt_id,
      workflowId: older.workflow_id,
      createdAt,
    }));
    const task = db.prepare('SELECT status, last_error FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      last_error: string | null;
    };

    assert.equal(inspectStageAttempt(db, older.stage_attempt_id).status, 'blocked');
    assert.equal(inspectStageAttempt(db, newer.stage_attempt_id).status, 'running');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.last_error, null);
  });
});
