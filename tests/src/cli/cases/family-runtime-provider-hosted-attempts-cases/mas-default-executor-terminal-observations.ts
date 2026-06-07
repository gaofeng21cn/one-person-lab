import { DatabaseSync } from 'node:sqlite';

import { assert, test } from './helpers.ts';

import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import {
  listStageAttemptsForTask,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../../../../src/family-runtime-stage-attempts.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-helpers.ts';

test('family-runtime blocks a requeued MAS default executor task when its linked Temporal attempt terminally fails', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:terminal-failed-after-requeue';
      const taskId = 'task-mas-default-terminal-failed-after-requeue';
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
      const attempt = ensureProviderHostedStageAttempt(db, row, basePayload);
      assert.ok(attempt);

      syncStageAttemptFromTemporalTerminalObservation(db, {
        surface_kind: 'temporal_stage_attempt_query_receipt',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        workflow_status: 'FAILED',
        query: {
          status: 'failed',
          closeout_refs: [],
          consumed_refs: [],
          consumed_memory_refs: [],
          writeback_receipt_refs: [],
          rejected_writes: [],
          completion_boundary: {
            provider_completion: 'failed',
            domain_ready_verdict: 'domain_gate_pending',
          },
          route_impact: {},
          next_owner: null,
        },
      });
      const task = db.prepare(`
        SELECT status, last_error, dead_letter_reason, lease_owner, lease_expires_at
        FROM tasks
        WHERE task_id = ?
      `).get(taskId) as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
        lease_owner: string | null;
        lease_expires_at: string | null;
      };
      const [syncedAttempt] = listStageAttemptsForTask(db, taskId);
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'stage_attempt_terminal_failed_task'
        LIMIT 1
      `).get(taskId) as { payload_json: string } | undefined;

      assert.equal(task.status, 'blocked');
      assert.equal(task.last_error, 'temporal_workflow_failed');
      assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_failed');
      assert.equal(task.lease_owner, null);
      assert.equal(task.lease_expires_at, null);
      assert.equal(syncedAttempt.status, 'failed');
      assert.equal(syncedAttempt.blocked_reason, 'temporal_workflow_failed');
      assert.ok(event);
      assert.equal(JSON.parse(event.payload_json).task_dead_letter_reason, 'temporal_stage_attempt_failed');
    });
  } finally {
    db.close();
  }
});

test('family-runtime succeeds a requeued MAS default executor task when its linked Temporal attempt has typed closeout', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:completed-after-requeue';
      const taskId = 'task-mas-default-completed-after-requeue';
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
      const attempt = ensureProviderHostedStageAttempt(db, row, basePayload);
      assert.ok(attempt);

      syncStageAttemptFromTemporalTerminalObservation(db, {
        surface_kind: 'temporal_stage_attempt_query_receipt',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        workflow_status: 'COMPLETED',
        query: {
          status: 'completed',
          closeout_refs: ['receipt:dm002/repaired-package'],
          consumed_refs: ['dispatch:dm002/quality-repair'],
          consumed_memory_refs: [],
          writeback_receipt_refs: ['receipt:dm002/owner-writeback'],
          rejected_writes: [],
          next_owner: 'medautoscience',
          route_impact: {
            study_id: '002-dm-china-us-mortality-attribution',
          },
          completion_boundary: {
            provider_completion: 'completed',
            domain_ready_verdict: 'domain_gate_pending',
          },
          closeout_packet: {
            surface_kind: 'domain_stage_closeout_packet',
            closeout_refs: ['receipt:dm002/repaired-package'],
            consumed_refs: ['dispatch:dm002/quality-repair'],
            writeback_receipt_refs: ['receipt:dm002/owner-writeback'],
            next_owner: 'medautoscience',
            domain_ready_verdict: 'domain_gate_pending',
          },
        },
      });
      const task = db.prepare(`
        SELECT status, last_error, dead_letter_reason, lease_owner, lease_expires_at
        FROM tasks
        WHERE task_id = ?
      `).get(taskId) as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
        lease_owner: string | null;
        lease_expires_at: string | null;
      };
      const [syncedAttempt] = listStageAttemptsForTask(db, taskId);
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'stage_attempt_terminal_completed_task'
        LIMIT 1
      `).get(taskId) as { payload_json: string } | undefined;

      assert.equal(task.status, 'succeeded');
      assert.equal(task.last_error, null);
      assert.equal(task.dead_letter_reason, null);
      assert.equal(task.lease_owner, null);
      assert.equal(task.lease_expires_at, null);
      assert.equal(syncedAttempt.status, 'completed');
      assert.equal(syncedAttempt.closeout_receipt_status, 'accepted_typed_closeout');
      assert.ok(event);
      assert.equal(JSON.parse(event.payload_json).reason, 'temporal_stage_attempt_completed');
    });
  } finally {
    db.close();
  }
});
