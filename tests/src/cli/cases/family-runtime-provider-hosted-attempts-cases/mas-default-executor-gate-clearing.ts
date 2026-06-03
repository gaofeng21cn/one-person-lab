import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  test,
} from './helpers.ts';
import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { listStageAttemptsForTask } from '../../../../../src/family-runtime-stage-attempts.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-single-flight-helpers.ts';

function gateClearingDefaultExecutorPayload(sourceFingerprint: string) {
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    action_type: 'run_gate_clearing_batch',
    dispatch_authority: 'publication_gate_replay_after_current_ai_reviewer_record',
    next_executable_owner: 'gate_clearing_batch',
    dispatch_ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
  };
}

test('family-runtime admits MAS gate-clearing default executor dispatch as Codex stage attempt', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const payload = gateClearingDefaultExecutorPayload('source-gate-clearing-current');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-gate-clearing-admission',
        payload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:admission',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-gate-clearing-admission',
      );
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-gate-clearing-admission',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      const attempts = listStageAttemptsForTask(db, 'task-mas-default-gate-clearing-admission');

      assert.ok(attempt);
      assert.equal(attempt.executor_kind, 'codex_cli');
      assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
      assert.equal(attempt.workspace_locator.next_executable_owner, 'gate_clearing_batch');
      assert.equal(attempt.workspace_locator.action_type, 'run_gate_clearing_batch');
      assert.deepEqual(attempt.checkpoint_refs, [payload.dispatch_ref]);
      assert.equal(attempts.length, 1);
    });
  } finally {
    db.close();
  }
});

test('family-runtime enqueue preserves MAS gate-clearing default executor handoff while same study attempt is live', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const livePayload = {
        ...defaultExecutorPayload('source-writer-live'),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      };
      const gatePayload = gateClearingDefaultExecutorPayload('source-gate-clearing-current');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-live-writer-before-gate',
        payload: livePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_quality_repair_batch:writer-live',
      });
      db.prepare("UPDATE tasks SET status = 'running' WHERE task_id = ?").run(
        'task-mas-default-live-writer-before-gate',
      );
      const liveRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-live-writer-before-gate',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const liveAttempt = ensureProviderHostedStageAttempt(db, liveRow, livePayload);
      assert.ok(liveAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        liveAttempt.stage_attempt_id,
      );

      const enqueue = enqueueTask(db, {
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: gatePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:admission',
        source: 'test-domain-export',
      });
      const queuedTask = db.prepare(`
        SELECT status, payload_json
        FROM tasks
        WHERE task_id = ?
      `).get(enqueue.task?.task_id) as { status: string; payload_json: string } | undefined;

      assert.equal(enqueue.accepted, true);
      assert.equal(queuedTask?.status, 'queued');
      assert.equal(JSON.parse(queuedTask?.payload_json ?? '{}').next_executable_owner, 'gate_clearing_batch');
    });
  } finally {
    db.close();
  }
});
