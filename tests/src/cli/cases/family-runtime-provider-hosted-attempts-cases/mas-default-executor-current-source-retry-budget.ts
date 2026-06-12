import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  test,
} from './helpers.ts';
import {
  createQueueTables,
  defaultExecutorPayloadForOwner,
  insertDefaultExecutorTask,
  insertDefaultExecutorTaskWithPayload,
  insertQueuedDefaultExecutorTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-current-source-helpers.ts';

import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';
import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { familyRuntimePaths, type FamilyRuntimeTaskRow } from '../../../../../src/family-runtime-store.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';

test('family-runtime tick auto-redrives retryable MAS default executor provider blockers without new source row', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-auto-redrive-provider-blocker',
        sourceFingerprint: 'source-stable-provider-blocker',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'temporal_workflow_failed',
          dead_letter_reason = 'temporal_stage_attempt_failed'
        WHERE task_id = ?
      `).run('task-mas-default-auto-redrive-provider-blocker');
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-auto-redrive-provider-blocker',
      ) as FamilyRuntimeTaskRow;
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      const failedAttempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(failedAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'failed',
          blocked_reason = 'temporal_workflow_failed',
          attempt_count = 1,
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
        WHERE stage_attempt_id = ?
      `).run(failedAttempt.stage_attempt_id);

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-auto-redrive-provider-blocker',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '002-dm-china-us-mortality-attribution',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const redrivenTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason, lease_owner, lease_expires_at
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-auto-redrive-provider-blocker') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
        lease_owner: string | null;
        lease_expires_at: string | null;
      };
      const attempts = db.prepare(`
        SELECT status, blocked_reason
        FROM stage_attempts
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all('task-mas-default-auto-redrive-provider-blocker') as Array<{
        status: string;
        blocked_reason: string | null;
      }>;

      assert.equal(tick.mas_default_executor_auto_redriven_count, 1);
      assert.equal(tick.mas_default_executor_auto_dead_lettered_count, 0);
      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-auto-redrive-provider-blocker');
      assert.equal(redrivenTask.status, 'queued');
      assert.equal(redrivenTask.last_error, null);
      assert.equal(redrivenTask.dead_letter_reason, null);
      assert.equal(redrivenTask.lease_owner, null);
      assert.equal(redrivenTask.lease_expires_at, null);
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0].status, 'failed');
      assert.equal(attempts[1].status, 'queued');
      assert.equal(attempts[1].blocked_reason, null);
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick does not auto-redrive MAS default executor cancellation lifecycle blockers', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-auto-redrive-cancelled-blocker',
        sourceFingerprint: 'source-stable-cancelled-blocker',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'codex_cli_activity_cancelled',
          dead_letter_reason = 'temporal_stage_attempt_canceled'
        WHERE task_id = ?
      `).run('task-mas-default-auto-redrive-cancelled-blocker');
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-auto-redrive-cancelled-blocker',
      ) as FamilyRuntimeTaskRow;
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      const canceledAttempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(canceledAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'blocked',
          blocked_reason = 'codex_cli_activity_cancelled',
          attempt_count = 1,
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'canceled')
        WHERE stage_attempt_id = ?
      `).run(canceledAttempt.stage_attempt_id);

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-no-auto-redrive-cancelled-blocker',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '002-dm-china-us-mortality-attribution',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: () => {
          dispatchCount += 1;
          return { task_id: 'unexpected-dispatch' };
        },
      });
      const blockedTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-auto-redrive-cancelled-blocker') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const attempts = db.prepare(`
        SELECT status, blocked_reason
        FROM stage_attempts
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all('task-mas-default-auto-redrive-cancelled-blocker') as Array<{
        status: string;
        blocked_reason: string | null;
      }>;

      assert.equal(tick.mas_default_executor_auto_redriven_count, 0);
      assert.equal(tick.mas_default_executor_auto_dead_lettered_count, 0);
      assert.equal(tick.selected_count, 0);
      assert.equal(dispatchCount, 0);
      assert.equal(blockedTask.status, 'blocked');
      assert.equal(blockedTask.last_error, 'codex_cli_activity_cancelled');
      assert.equal(blockedTask.dead_letter_reason, 'temporal_stage_attempt_canceled');
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].status, 'blocked');
      assert.equal(attempts[0].blocked_reason, 'codex_cli_activity_cancelled');
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick does not auto-redrive superseded MAS default executor provider blocker', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-superseded-provider-blocker',
        sourceFingerprint: 'source-before-provider-blocker',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'temporal_workflow_failed',
          dead_letter_reason = 'temporal_stage_attempt_failed'
        WHERE task_id = ?
      `).run('task-mas-default-superseded-provider-blocker');
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-current-after-provider-blocker',
        sourceFingerprint: 'source-after-provider-blocker',
        createdAt: '2026-05-25T16:40:00.000Z',
      });
      const blockedRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-superseded-provider-blocker',
      ) as FamilyRuntimeTaskRow;
      const blockedPayload = JSON.parse(blockedRow.payload_json) as Record<string, unknown>;
      const failedAttempt = ensureProviderHostedStageAttempt(db, blockedRow, blockedPayload);
      assert.ok(failedAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'failed',
          blocked_reason = 'temporal_workflow_failed',
          attempt_count = 1,
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
        WHERE stage_attempt_id = ?
      `).run(failedAttempt.stage_attempt_id);

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-no-auto-redrive-superseded-provider-blocker',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '002-dm-china-us-mortality-attribution',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const blockedTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-superseded-provider-blocker') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const attemptCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM stage_attempts
        WHERE task_id = ?
      `).get('task-mas-default-superseded-provider-blocker') as { count: number };

      assert.equal(tick.mas_default_executor_auto_redriven_count, 0);
      assert.equal(tick.mas_default_executor_auto_dead_lettered_count, 0);
      assert.equal(tick.mas_default_executor_auto_redrive_stale_skipped_count, 0);
      assert.equal(
        tick.progress_first_owner_delta_admission.admission_status,
        'selected_before_maintenance_reconcile',
      );
      assert.equal(
        tick.progress_first_owner_delta_admission.maintenance_reconcile_deferred_by_owner_delta,
        true,
      );
      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-current-after-provider-blocker');
      assert.equal(blockedTask.status, 'blocked');
      assert.equal(blockedTask.last_error, 'temporal_workflow_failed');
      assert.equal(blockedTask.dead_letter_reason, 'temporal_stage_attempt_failed');
      assert.equal(attemptCount.count, 1);
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick dead-letters MAS default executor provider blocker when retry budget is exhausted', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-auto-redrive-budget-exhausted',
        sourceFingerprint: 'source-stable-provider-blocker-exhausted',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'blocked',
        attempts: 3,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'temporal_workflow_failed',
          dead_letter_reason = 'temporal_stage_attempt_failed'
        WHERE task_id = ?
      `).run('task-mas-default-auto-redrive-budget-exhausted');
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-auto-redrive-budget-exhausted',
      ) as FamilyRuntimeTaskRow;
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      for (let index = 0; index < 3; index += 1) {
        const attempt = ensureProviderHostedStageAttempt(db, row, payload, { newAttempt: true });
        assert.ok(attempt);
        db.prepare(`
          UPDATE stage_attempts
          SET status = 'failed',
            blocked_reason = 'temporal_workflow_failed',
            attempt_count = 1,
            provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
          WHERE stage_attempt_id = ?
        `).run(attempt.stage_attempt_id);
      }

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-auto-redrive-budget-exhausted',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '002-dm-china-us-mortality-attribution',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const task = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-auto-redrive-budget-exhausted') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const attemptCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM stage_attempts
        WHERE task_id = ?
      `).get('task-mas-default-auto-redrive-budget-exhausted') as { count: number };

      assert.equal(tick.mas_default_executor_auto_redriven_count, 0);
      assert.equal(tick.mas_default_executor_auto_dead_lettered_count, 1);
      assert.equal(tick.selected_count, 0);
      assert.equal(dispatchCount, 0);
      assert.equal(task.status, 'dead_letter');
      assert.equal(task.last_error, 'retry_budget_exhausted');
      assert.equal(task.dead_letter_reason, 'retry_budget_exhausted');
      assert.equal(attemptCount.count, 3);
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick counts default executor retry budget against the current domain source only', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-auto-redrive-current-source-budget',
        sourceFingerprint: 'source-current-provider-blocker',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'temporal_workflow_failed',
          dead_letter_reason = 'temporal_stage_attempt_failed'
        WHERE task_id = ?
      `).run('task-mas-default-auto-redrive-current-source-budget');
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-auto-redrive-current-source-budget',
      ) as FamilyRuntimeTaskRow;
      const currentPayload = JSON.parse(row.payload_json) as Record<string, unknown>;
      for (let index = 0; index < 9; index += 1) {
        const oldPayload = {
          ...currentPayload,
          source_fingerprint: `source-old-provider-blocker-${index}`,
        };
        const attempt = ensureProviderHostedStageAttempt(db, row, oldPayload, { newAttempt: true });
        assert.ok(attempt);
        db.prepare(`
          UPDATE stage_attempts
          SET status = 'completed',
            provider_run_json = json_set(provider_run_json, '$.provider_status', 'completed')
          WHERE stage_attempt_id = ?
        `).run(attempt.stage_attempt_id);
      }
      const failedCurrentAttempt = ensureProviderHostedStageAttempt(db, row, currentPayload, {
        newAttempt: true,
      });
      assert.ok(failedCurrentAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'failed',
          blocked_reason = 'temporal_workflow_failed',
          attempt_count = 1,
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
        WHERE stage_attempt_id = ?
      `).run(failedCurrentAttempt.stage_attempt_id);

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-auto-redrive-current-source-budget',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [
            {
              path: 'study_id',
              value: '002-dm-china-us-mortality-attribution',
            },
          ],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const task = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-auto-redrive-current-source-budget') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const currentAttemptCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM stage_attempts
        WHERE task_id = ?
          AND json_extract(workspace_locator_json, '$.domain_source_fingerprint') = ?
      `).get(
        'task-mas-default-auto-redrive-current-source-budget',
        'source-current-provider-blocker',
      ) as { count: number };

      assert.equal(tick.mas_default_executor_auto_redriven_count, 1);
      assert.equal(tick.mas_default_executor_auto_dead_lettered_count, 0);
      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-auto-redrive-current-source-budget');
      assert.equal(task.status, 'queued');
      assert.equal(task.last_error, null);
      assert.equal(task.dead_letter_reason, null);
      assert.equal(currentAttemptCount.count, 2);
    });
  } finally {
    db.close();
  }
});
