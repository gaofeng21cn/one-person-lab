import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  test,
} from './helpers.ts';
import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { insertEvent } from '../../../../../src/family-runtime-store.ts';
import { listStageAttemptsForTask } from '../../../../../src/family-runtime-stage-attempts.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-single-flight-helpers.ts';

function readinessSurfacePayload(sourceFingerprint: string) {
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    action_type: 'complete_medical_paper_readiness_surface',
    dispatch_authority: 'consumer_default_executor_dispatch',
    next_executable_owner: 'MedAutoScience',
    domain_owner: 'MedAutoScience',
    work_unit_id: 'complete_medical_paper_readiness_surface',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/complete_medical_paper_readiness_surface/186ef28f465b50a2961653c6.json',
  };
}

test('family-runtime admits MAS-owned readiness surface default executor dispatch as Codex stage attempt', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const taskId = 'task-mas-default-readiness-medautoscience-owner';
      const payload = readinessSurfacePayload('readiness-owner-source');
      insertSucceededTask(db, {
        taskId,
        payload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:medautoscience',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];

      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      const attempts = listStageAttemptsForTask(db, taskId);

      assert.ok(attempt);
      assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
      assert.equal(attempt.executor_kind, 'codex_cli');
      assert.equal(attempt.workspace_locator.next_executable_owner, 'MedAutoScience');
      assert.equal(attempt.workspace_locator.action_type, 'complete_medical_paper_readiness_surface');
      assert.deepEqual(attempt.checkpoint_refs, [payload.dispatch_ref]);
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].stage_attempt_id, attempt.stage_attempt_id);
    });
  } finally {
    db.close();
  }
});

test('family-runtime requeues transport-only succeeded MAS-owned readiness admission with no provider attempt', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-default-readiness-transport-only';
    const dedupeKey = 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:transport-only';
    const payload = readinessSurfacePayload('readiness-transport-only-source');
    insertSucceededTask(db, { taskId, payload, dedupeKey });
    insertEvent(db, {
      taskId,
      domainId: 'medautoscience',
      eventType: 'task_dispatch_succeeded',
      source: 'test-legacy-domain-handler',
      payload: {
        output: {
          surface_kind: 'mas_family_domain_handler_dispatch_receipt',
          accepted: true,
          opl_attempt_admission_requested: true,
          opl_attempt_admission_status: 'requested',
          dispatch: {
            execution_policy: 'opl_default_executor_stage_attempt_admission',
            result: {
              status: 'opl_attempt_admission_requested',
              next_owner: 'MedAutoScience',
            },
          },
        },
      },
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-domain-export-replay',
    });
    const task = db.prepare('SELECT status, attempts, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      taskId,
    ) as { status: string; attempts: number; last_error: string | null; dead_letter_reason: string | null };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_transport_only_succeeded_default_executor_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.ok(requeueEvent);
    assert.equal(JSON.parse(requeueEvent.payload_json).reason, 'transport_only_admission_without_provider_stage_attempt');
  } finally {
    db.close();
  }
});
