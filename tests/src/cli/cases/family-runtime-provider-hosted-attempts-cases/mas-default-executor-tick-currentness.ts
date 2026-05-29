import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  test,
} from './helpers.ts';
import {
  createQueueTables,
  defaultExecutorPayloadForOwner,
  insertDefaultExecutorTaskWithPayload,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-current-source-helpers.ts';

import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { familyRuntimePaths, type FamilyRuntimeTaskRow } from '../../../../../src/family-runtime-store.ts';

function reviewerPayload(input: {
  sourceFingerprint: string;
  dispatchRef: string;
}) {
  return defaultExecutorPayloadForOwner({
    sourceFingerprint: input.sourceFingerprint,
    actionType: 'return_to_ai_reviewer_workflow',
    nextOwner: 'ai_reviewer',
    dispatchAuthority: 'ai_reviewer_record_production_handoff',
    dispatchRef: input.dispatchRef,
  });
}

function studyTaskScope() {
  return {
    domainId: 'medautoscience',
    taskKind: 'domain_owner/default-executor-dispatch',
    payloadMatches: [
      {
        path: 'study_id',
        value: '002-dm-china-us-mortality-attribution',
      },
    ],
  };
}

test('family-runtime tick does not auto-redrive stale same-action reviewer blocker when current reviewer source row exists', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const stalePayload = reviewerPayload({
        sourceFingerprint: 'reviewer-source-before',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/stale.json',
      });
      const currentPayload = reviewerPayload({
        sourceFingerprint: 'reviewer-source-after',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/current.json',
      });
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-stale-reviewer-provider-blocker',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:stale-reviewer',
        createdAt: '2026-05-28T23:40:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'temporal_stage_attempt_not_completed',
          dead_letter_reason = 'temporal_stage_attempt_not_completed'
        WHERE task_id = ?
      `).run('task-mas-default-stale-reviewer-provider-blocker');
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-current-reviewer-source-row',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:current-reviewer',
        createdAt: '2026-05-28T23:50:00.000Z',
        status: 'queued',
      });
      const blockedRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-stale-reviewer-provider-blocker',
      ) as FamilyRuntimeTaskRow;
      const failedAttempt = ensureProviderHostedStageAttempt(db, blockedRow, stalePayload);
      assert.ok(failedAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'failed',
          blocked_reason = 'temporal_stage_attempt_not_completed',
          attempt_count = 1,
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
        WHERE stage_attempt_id = ?
      `).run(failedAttempt.stage_attempt_id);

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-current-reviewer-source-blocks-stale-redrive',
        limit: 10,
        hydrate: false,
        taskScope: studyTaskScope(),
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const staleTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-stale-reviewer-provider-blocker') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const staleAttemptCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM stage_attempts
        WHERE task_id = ?
      `).get('task-mas-default-stale-reviewer-provider-blocker') as { count: number };

      assert.equal(tick.mas_default_executor_auto_redriven_count, 0);
      assert.equal(tick.mas_default_executor_auto_dead_lettered_count, 0);
      assert.equal(tick.mas_default_executor_auto_redrive_stale_skipped_count, 1);
      assert.equal(tick.mas_default_executor_superseded_count, 0);
      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-current-reviewer-source-row');
      assert.equal(staleTask.status, 'blocked');
      assert.equal(staleTask.last_error, 'temporal_stage_attempt_not_completed');
      assert.equal(staleTask.dead_letter_reason, 'temporal_stage_attempt_not_completed');
      assert.equal(staleAttemptCount.count, 1);
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick selects only one MAS default executor candidate per study after redrive hydration', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-stale-redriven-same-tick',
        payload: reviewerPayload({
          sourceFingerprint: 'reviewer-source-before-single-flight',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/stale-single-flight.json',
        }),
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:stale-redriven-same-tick',
        createdAt: '2026-05-28T23:40:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      db.prepare(`
        UPDATE tasks
        SET last_error = 'temporal_stage_attempt_not_completed',
          dead_letter_reason = 'temporal_stage_attempt_not_completed'
        WHERE task_id = ?
      `).run('task-mas-default-stale-redriven-same-tick');
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-current-row-same-tick',
        payload: reviewerPayload({
          sourceFingerprint: 'reviewer-source-after-single-flight',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/current-single-flight.json',
        }),
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:current-row-same-tick',
        createdAt: '2026-05-28T23:50:00.000Z',
        status: 'queued',
      });

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-same-study-single-flight-after-auto-redrive',
        limit: 10,
        hydrate: false,
        taskScope: studyTaskScope(),
      }, {
        enqueueTask: () => ({ accepted: false }),
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });

      assert.equal(tick.mas_default_executor_auto_redriven_count, 0);
      assert.equal(tick.mas_default_executor_auto_redrive_stale_skipped_count, 1);
      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-current-row-same-tick');
    });
  } finally {
    db.close();
  }
});
