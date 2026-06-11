import { DatabaseSync } from 'node:sqlite';

import { assert, test } from './helpers.ts';

import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { familyRuntimePaths } from '../../../../../src/family-runtime-store.ts';
import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';
import { listStageAttemptsForTask } from '../../../../../src/family-runtime-stage-attempts.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-helpers.ts';

test('family-runtime blocks stale MAS default executor attempts when a newer source supersedes the task', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const stalePayload = defaultExecutorPayload('source-before');
      const currentPayload = defaultExecutorPayload('source-after');
      const staleTaskId = 'task-mas-default-superseded-stale';
      const currentTaskId = 'task-mas-default-superseded-current';
      insertSucceededTask(db, {
        taskId: staleTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:stale',
      });
      insertSucceededTask(db, {
        taskId: currentTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:current',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id IN (?, ?)").run(staleTaskId, currentTaskId);
      db.prepare("UPDATE tasks SET created_at = '2026-05-31T00:00:00.000Z' WHERE task_id = ?").run(staleTaskId);
      db.prepare("UPDATE tasks SET created_at = '2026-05-31T00:01:00.000Z' WHERE task_id = ?").run(currentTaskId);
      const staleRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(staleTaskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];
      const staleAttempt = ensureProviderHostedStageAttempt(db, staleRow, stalePayload);
      assert.ok(staleAttempt);

      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-superseded-default-executor',
        limit: 10,
        hydrate: false,
      }, {
        enqueueTask,
        dispatchTask: async (_db, _paths, row) => ({
          status: 'selected',
          task_id: row.task_id,
        }),
      });
      const staleTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(staleTaskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
      const [blockedAttempt] = listStageAttemptsForTask(db, staleTaskId);
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_superseded_by_current_source'
        LIMIT 1
      `).get(staleTaskId) as { payload_json: string } | undefined;
      const eventPayload = event ? JSON.parse(event.payload_json) : null;

      assert.equal(tick.mas_default_executor_superseded_count, 1);
      assert.equal(tick.default_executor_superseded_count, 1);
      assert.deepEqual(tick.dispatches, [{ status: 'selected', task_id: currentTaskId }]);
      assert.equal(staleTask.status, 'blocked');
      assert.equal(staleTask.last_error, 'mas_default_executor_superseded_by_current_source');
      assert.equal(staleTask.dead_letter_reason, 'mas_default_executor_superseded_by_current_source');
      assert.equal(blockedAttempt.status, 'blocked');
      assert.equal(blockedAttempt.blocked_reason, 'mas_default_executor_superseded_by_current_source');
      assert.equal(blockedAttempt.activity_events.at(-1).activity_kind, 'mas_default_executor_currentness');
      assert.equal(blockedAttempt.provider_run.provider_status, 'blocked');
      assert.ok(eventPayload);
      assert.deepEqual(eventPayload.blocked_stage_attempt_ids, [staleAttempt.stage_attempt_id]);
      assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    });
  } finally {
    db.close();
  }
});

test('family-runtime reconciles historical superseded MAS default executor attempts left queued', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const stalePayload = defaultExecutorPayload('source-before');
      const currentPayload = defaultExecutorPayload('source-after');
      const staleTaskId = 'task-mas-default-historical-superseded-stale';
      const currentTaskId = 'task-mas-default-historical-superseded-current';
      insertSucceededTask(db, {
        taskId: staleTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:return_to_ai_reviewer_workflow:stale',
      });
      insertSucceededTask(db, {
        taskId: currentTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:return_to_ai_reviewer_workflow:current',
      });
      db.prepare("UPDATE tasks SET created_at = '2026-05-31T00:00:00.000Z' WHERE task_id = ?").run(staleTaskId);
      db.prepare("UPDATE tasks SET created_at = '2026-05-31T00:01:00.000Z' WHERE task_id = ?").run(currentTaskId);
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked', last_error = ?, dead_letter_reason = ?
        WHERE task_id = ?
      `).run(
        'mas_default_executor_superseded_by_current_source',
        'mas_default_executor_superseded_by_current_source',
        staleTaskId,
      );
      const staleRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(staleTaskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];
      const staleAttempt = ensureProviderHostedStageAttempt(db, staleRow, stalePayload);
      assert.ok(staleAttempt);

      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-historical-superseded-default-executor',
        limit: 10,
        hydrate: false,
      }, {
        enqueueTask,
        dispatchTask: async (_db, _paths, row) => ({
          status: 'selected',
          task_id: row.task_id,
        }),
      });
      const [blockedAttempt] = listStageAttemptsForTask(db, staleTaskId);
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_superseded_attempts_reconciled'
        LIMIT 1
      `).get(staleTaskId) as { payload_json: string } | undefined;
      const eventPayload = event ? JSON.parse(event.payload_json) : null;

      assert.equal(tick.mas_default_executor_superseded_attempt_reconciled_count, 1);
      assert.deepEqual(tick.dispatches, []);
      assert.equal(blockedAttempt.status, 'blocked');
      assert.equal(blockedAttempt.blocked_reason, 'mas_default_executor_superseded_by_current_source');
      assert.equal(blockedAttempt.provider_run.provider_status, 'blocked');
      assert.ok(eventPayload);
      assert.deepEqual(eventPayload.reconciled_stage_attempt_ids, [staleAttempt.stage_attempt_id]);
      assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    });
  } finally {
    db.close();
  }
});

test('family-runtime does not let historical superseded blocker shadow current MAS admission', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const stalePayload = defaultExecutorPayload('source-before');
      const currentPayload = defaultExecutorPayload('source-after');
      const staleTaskId = 'task-mas-default-superseded-blocker-residue';
      const currentTaskId = 'task-mas-default-current-admission-after-superseded-blocker';
      insertSucceededTask(db, {
        taskId: staleTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:return_to_ai_reviewer_workflow:superseded-blocker',
      });
      insertSucceededTask(db, {
        taskId: currentTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:return_to_ai_reviewer_workflow:current-after-blocker',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'queued', created_at = '2026-06-11T00:01:00.000Z'
        WHERE task_id = ?
      `).run(currentTaskId);
      db.prepare(`
        UPDATE tasks
        SET status = 'blocked',
          last_error = 'mas_default_executor_superseded_by_current_source',
          dead_letter_reason = 'mas_default_executor_superseded_by_current_source',
          created_at = '2026-06-11T00:02:00.000Z'
        WHERE task_id = ?
      `).run(staleTaskId);

      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-superseded-blocker-does-not-shadow-current-admission',
        limit: 10,
        hydrate: false,
      }, {
        enqueueTask,
        dispatchTask: async (_db, _paths, row) => ({
          status: 'selected',
          task_id: row.task_id,
        }),
      });
      const currentTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(currentTaskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
      const supersededEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_superseded_by_current_source'
        LIMIT 1
      `).get(currentTaskId) as { payload_json: string } | undefined;

      assert.equal(tick.mas_default_executor_superseded_count, 0);
      assert.deepEqual(tick.dispatches, [{ status: 'selected', task_id: currentTaskId }]);
      assert.equal(currentTask.status, 'queued');
      assert.equal(currentTask.last_error, null);
      assert.equal(currentTask.dead_letter_reason, null);
      assert.equal(supersededEvent, undefined);
    });
  } finally {
    db.close();
  }
});
