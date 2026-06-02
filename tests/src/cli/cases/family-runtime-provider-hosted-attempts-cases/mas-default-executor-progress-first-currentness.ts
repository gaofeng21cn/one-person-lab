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

import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { familyRuntimePaths, type FamilyRuntimeTaskRow } from '../../../../../src/family-runtime-store.ts';
import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';

test('family-runtime tick selects newer MAS default executor row when same dispatch stale live attempt is terminal after query', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-live-terminal-after-query',
        sourceFingerprint: 'source-before-terminal-after-query',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'running',
        attempts: 1,
        leaseOwner: 'opl-family-runtime:test',
        leaseExpiresAt: '2026-05-25T16:35:00.000Z',
      });
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-newer-after-live-terminal-query',
        sourceFingerprint: 'source-after-terminal-after-query',
        createdAt: '2026-05-25T16:40:00.000Z',
      });
      const runningRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-live-terminal-after-query',
      ) as FamilyRuntimeTaskRow;
      const runningPayload = JSON.parse(runningRow.payload_json) as Record<string, unknown>;
      const runningAttempt = ensureProviderHostedStageAttempt(db, runningRow, runningPayload);
      assert.ok(runningAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        runningAttempt.stage_attempt_id,
      );

      let queryCount = 0;
      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-live-terminal-after-query-selection',
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
        queryTemporalStageAttempt: async () => {
          queryCount += 1;
          return {
            surface_kind: 'temporal_stage_attempt_query_receipt',
            provider_kind: 'temporal',
            stage_attempt_id: runningAttempt.stage_attempt_id,
            workflow_id: runningAttempt.workflow_id,
            workflow_status: 'FAILED',
            query_error: {
              code: 'temporal_stage_attempt_query_unavailable_after_terminal',
              message: 'Temporal workflow is already FAILED; terminal failure is sufficient for provider sync.',
            },
          };
        },
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: row.task_id };
        },
      });
      const oldTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason, lease_owner, lease_expires_at
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-live-terminal-after-query') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
        lease_owner: string | null;
        lease_expires_at: string | null;
      };

      assert.equal(queryCount, 1);
      assert.equal(tick.mas_default_executor_live_skipped_count, 0);
      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-newer-after-live-terminal-query');
      assert.equal(oldTask.status, 'blocked');
      assert.equal(oldTask.last_error, 'temporal_workflow_failed');
      assert.equal(oldTask.dead_letter_reason, 'temporal_stage_attempt_failed');
      assert.equal(oldTask.lease_owner, null);
      assert.equal(oldTask.lease_expires_at, null);
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick dispatches current owner row before unrelated maintenance reconcile', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const unrelatedMaintenancePayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: 'source-maintenance-other-study',
          actionType: 'return_to_ai_reviewer_workflow',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'ai_reviewer_record_production_handoff',
          dispatchRef: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow/reviewer.json',
        }),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      };
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-running-maintenance-same-study',
        payload: unrelatedMaintenancePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:return_to_ai_reviewer_workflow:maintenance',
        createdAt: '2026-05-25T16:00:00.000Z',
        status: 'running',
        attempts: 1,
        leaseOwner: 'opl-family-runtime:test',
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const maintenanceRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-running-maintenance-same-study',
      ) as FamilyRuntimeTaskRow;
      const maintenancePayload = JSON.parse(maintenanceRow.payload_json) as Record<string, unknown>;
      const maintenanceAttempt = ensureProviderHostedStageAttempt(db, maintenanceRow, maintenancePayload);
      assert.ok(maintenanceAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        maintenanceAttempt.stage_attempt_id,
      );
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-current-owner-row-before-maintenance',
        sourceFingerprint: 'source-current-owner-before-maintenance',
        createdAt: '2026-05-25T16:40:00.000Z',
      });

      let queryCount = 0;
      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-owner-delta-before-maintenance',
        limit: 1,
        hydrate: false,
      }, {
        enqueueTask: () => ({ accepted: false }),
        queryTemporalStageAttempt: async () => {
          queryCount += 1;
          return {
            surface_kind: 'temporal_stage_attempt_query_receipt',
            provider_kind: 'temporal',
            stage_attempt_id: maintenanceAttempt.stage_attempt_id,
            workflow_id: maintenanceAttempt.workflow_id,
            workflow_status: 'FAILED',
          };
        },
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: row.task_id };
        },
      });
      const maintenanceTask = db.prepare(`
        SELECT status, last_error
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-running-maintenance-same-study') as {
        status: string;
        last_error: string | null;
      };

      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-current-owner-row-before-maintenance');
      assert.equal(queryCount, 0);
      assert.equal(tick.mas_default_executor_terminal_synced_count, 0);
      assert.equal(maintenanceTask.status, 'running');
      assert.equal(maintenanceTask.last_error, null);
    });
  } finally {
    db.close();
  }
});
