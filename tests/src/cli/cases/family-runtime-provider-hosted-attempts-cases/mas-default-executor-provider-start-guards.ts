import { DatabaseSync } from 'node:sqlite';

import { assert, test } from './helpers.ts';

import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { startDefaultExecutorStageAttempt } from '../../../../../src/family-runtime-default-executor-start.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { familyRuntimePaths } from '../../../../../src/family-runtime-store.ts';
import { listStageAttemptsForTask } from '../../../../../src/family-runtime-stage-attempts.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-helpers.ts';

test('family-runtime keeps MAS default executor admission single-flight while a live attempt exists', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:single-flight';
      const taskId = 'task-mas-default-single-flight';
      const basePayload = defaultExecutorPayload('source-before');
      insertSucceededTask(db, {
        taskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: basePayload,
        dedupeKey,
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];
      const firstAttempt = ensureProviderHostedStageAttempt(db, row, basePayload);
      assert.ok(firstAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        firstAttempt.stage_attempt_id,
      );

      const secondAttempt = ensureProviderHostedStageAttempt(db, row, {
        ...basePayload,
        source_fingerprint: 'source-after',
      });
      const attempts = listStageAttemptsForTask(db, taskId);
      const createdEvents = db.prepare(`
        SELECT COUNT(*) AS count
        FROM events
        WHERE task_id = ? AND event_type = 'stage_attempt_created_for_provider_hosted_task'
      `).get(taskId) as { count: number };

      assert.equal(secondAttempt, null);
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].status, 'running');
      assert.equal(createdEvents.count, 1);
    });
  } finally {
    db.close();
  }
});

test('family-runtime keeps MAS default executor dispatch single-flight even when a refreshed source row appears', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const firstPayload = defaultExecutorPayload('source-before');
      const secondPayload = defaultExecutorPayload('source-after');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-cross-task-live-first',
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: firstPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:first-source',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-cross-task-live-second',
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: secondPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:second-source',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id IN (?, ?)").run(
        'task-mas-default-cross-task-live-first',
        'task-mas-default-cross-task-live-second',
      );
      const firstRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-live-first',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const secondRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-live-second',
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, firstRow, firstPayload);
      assert.ok(firstAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        firstAttempt.stage_attempt_id,
      );
      const secondAttempt = ensureProviderHostedStageAttempt(db, secondRow, secondPayload);
      let temporalStartCount = 0;

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row: secondRow,
        payload: secondPayload,
        providerHostedAttempt: secondAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
      });
      const secondTask = db.prepare('SELECT status, attempts FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-live-second',
      ) as { status: string; attempts: number };
      const secondAttempts = listStageAttemptsForTask(db, 'task-mas-default-cross-task-live-second');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-cross-task-live-second') as { payload_json: string } | undefined;

      assert.equal(result.status, 'skipped');
      assert.equal(result.reason, 'live_stage_attempt_exists_for_dispatch');
      assert.equal(temporalStartCount, 0);
      assert.equal(secondTask.status, 'queued');
      assert.equal(secondTask.attempts, 0);
      assert.equal(secondAttempts.length, 0);
      assert.ok(skipEvent);
      assert.equal(JSON.parse(skipEvent.payload_json).stage_attempt_id, firstAttempt.stage_attempt_id);
    });
  } finally {
    db.close();
  }
});

test('family-runtime does not start MAS default executor Temporal workflow from a stale unclaimed task row', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:stale-claim';
      const taskId = 'task-mas-default-stale-claim';
      const basePayload = defaultExecutorPayload('source-before');
      insertSucceededTask(db, {
        taskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: basePayload,
        dedupeKey,
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const staleQueuedRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof startDefaultExecutorStageAttempt
      >[2]['row'];
      const providerHostedAttempt = ensureProviderHostedStageAttempt(db, staleQueuedRow, basePayload);
      db.prepare("UPDATE tasks SET status = 'running', lease_owner = 'other-worker' WHERE task_id = ?").run(taskId);
      let temporalStartCount = 0;

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row: staleQueuedRow,
        payload: basePayload,
        providerHostedAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
      });
      const task = db.prepare('SELECT status, lease_owner FROM tasks WHERE task_id = ?').get(taskId) as {
        status: string;
        lease_owner: string | null;
      };
      const admittedEvents = db.prepare(`
        SELECT COUNT(*) AS count
        FROM events
        WHERE task_id = ? AND event_type = 'task_admitted_default_executor_stage_attempt'
      `).get(taskId) as { count: number };

      assert.equal(result.status, 'skipped');
      assert.equal(result.reason, 'task_already_claimed');
      assert.equal(temporalStartCount, 0);
      assert.equal(task.status, 'running');
      assert.equal(task.lease_owner, 'other-worker');
      assert.equal(admittedEvents.count, 0);
    });
  } finally {
    db.close();
  }
});

test('family-runtime does not block MAS default executor task when a live attempt is already running', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:live-skip';
      const taskId = 'task-mas-default-live-skip';
      const basePayload = defaultExecutorPayload('source-before');
      insertSucceededTask(db, {
        taskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: basePayload,
        dedupeKey,
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof startDefaultExecutorStageAttempt
      >[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, row, basePayload);
      assert.ok(firstAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        firstAttempt.stage_attempt_id,
      );
      let temporalStartCount = 0;

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row,
        payload: basePayload,
        providerHostedAttempt: null,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
      });
      const task = db.prepare('SELECT status, dead_letter_reason FROM tasks WHERE task_id = ?').get(taskId) as {
        status: string;
        dead_letter_reason: string | null;
      };

      assert.equal(result.status, 'skipped');
      assert.equal(result.reason, 'live_stage_attempt_exists');
      assert.equal(temporalStartCount, 0);
      assert.equal(task.status, 'queued');
      assert.equal(task.dead_letter_reason, null);
      assert.equal(listStageAttemptsForTask(db, taskId).length, 1);
    });
  } finally {
    db.close();
  }
});
