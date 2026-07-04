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

import { parseJsonText } from '../../../../../src/kernel/json-file.ts';
import { runFamilyRuntimeQueueTick } from '../../../../../src/modules/runway/family-runtime-tick.ts';
import { enqueueTask } from '../../../../../src/modules/runway/family-runtime-enqueue.ts';
import { familyRuntimePaths, type FamilyRuntimeTaskRow } from '../../../../../src/modules/runway/family-runtime-store.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/modules/runway/family-runtime-provider-hosted-attempts.ts';

test('family-runtime tick does not select newer MAS default executor row while same dispatch has a live running attempt with expired lease', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-live-running-expired-lease',
        sourceFingerprint: 'source-before',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'running',
        attempts: 1,
        leaseOwner: 'opl-family-runtime:test',
        leaseExpiresAt: '2026-05-25T16:35:00.000Z',
      });
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-newer-queued-same-dispatch',
        sourceFingerprint: 'source-after',
        createdAt: '2026-05-25T16:40:00.000Z',
      });
      const runningRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-live-running-expired-lease',
      ) as FamilyRuntimeTaskRow;
      const runningPayload = parseJsonText(runningRow.payload_json) as Record<string, unknown>;
      const runningAttempt = ensureProviderHostedStageAttempt(db, runningRow, runningPayload);
      assert.ok(runningAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        runningAttempt.stage_attempt_id,
      );

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-current-source-selection',
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
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: row.task_id };
        },
      });
      const refreshedRunningTask = db.prepare(`
        SELECT lease_owner, lease_expires_at
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-live-running-expired-lease') as {
        lease_owner: string | null;
        lease_expires_at: string | null;
      };

      assert.equal(tick.selected_count, 0);
      assert.equal(tick.dispatches.length, 0);
      assert.equal(dispatchCount, 0);
      assert.ok(refreshedRunningTask.lease_owner);
      assert.ok(refreshedRunningTask.lease_expires_at);
      assert.ok(Date.parse(refreshedRunningTask.lease_expires_at) > Date.now());
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick does not select write owner row while same-study reviewer attempt is live', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const reviewerPayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'reviewer-source',
        actionType: 'return_to_ai_reviewer_workflow',
        nextOwner: 'ai_reviewer',
        dispatchAuthority: 'ai_reviewer_record_production_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/reviewer.json',
      });
      const writerPayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'writer-source',
        actionType: 'run_quality_repair_batch',
        nextOwner: 'write',
        dispatchAuthority: 'quality_repair_batch_writer_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/writer.json',
      });
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-live-reviewer-before-tick',
        payload: reviewerPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:reviewer-live-before-tick',
        createdAt: '2026-05-28T19:29:00.000Z',
        status: 'running',
        attempts: 1,
        leaseOwner: 'opl-family-runtime:test',
        leaseExpiresAt: '2026-05-28T19:34:00.000Z',
      });
      insertDefaultExecutorTaskWithPayload(db, {
        taskId: 'task-mas-default-queued-writer-during-reviewer',
        payload: writerPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:writer-during-reviewer',
        createdAt: '2026-05-28T19:40:00.000Z',
        status: 'queued',
      });
      const reviewerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-live-reviewer-before-tick',
      ) as FamilyRuntimeTaskRow;
      const reviewerAttempt = ensureProviderHostedStageAttempt(db, reviewerRow, reviewerPayload);
      assert.ok(reviewerAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(reviewerAttempt.stage_attempt_id);

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-same-study-single-flight',
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
          return { unexpected_dispatch: true };
        },
      });
      const writerTask = db.prepare('SELECT status, attempts FROM tasks WHERE task_id = ?').get(
        'task-mas-default-queued-writer-during-reviewer',
      ) as { status: string; attempts: number };
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_dispatch_tick_skip'
        LIMIT 1
      `).get('task-mas-default-queued-writer-during-reviewer') as { payload_json: string } | undefined;

      assert.equal(tick.selected_count, 0);
      assert.equal(tick.mas_default_executor_live_skipped_count, 1);
      assert.equal(dispatchCount, 0);
      assert.equal(writerTask.status, 'queued');
      assert.equal(writerTask.attempts, 0);
      assert.ok(skipEvent);
      const skipPayload = parseJsonText(skipEvent.payload_json) as {
        reason?: string;
        stage_attempt_id?: string;
        live_action_type?: string;
        action_type?: string;
      };
      assert.equal(skipPayload.reason, 'same_study_live_stage_attempt_exists');
      assert.equal(skipPayload.stage_attempt_id, reviewerAttempt.stage_attempt_id);
      assert.equal(skipPayload.live_action_type, 'return_to_ai_reviewer_workflow');
      assert.equal(skipPayload.action_type, 'run_quality_repair_batch');
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick ignores terminal MAS default executor attempts when selecting refreshed dispatch row', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-terminal-old',
        sourceFingerprint: 'source-before',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'succeeded',
        attempts: 1,
      });
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-newer-after-terminal',
        sourceFingerprint: 'source-after',
        createdAt: '2026-05-25T16:40:00.000Z',
      });
      const oldRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-terminal-old',
      ) as FamilyRuntimeTaskRow;
      const oldPayload = parseJsonText(oldRow.payload_json) as Record<string, unknown>;
      const oldAttempt = ensureProviderHostedStageAttempt(db, oldRow, oldPayload);
      assert.ok(oldAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'failed',
          blocked_reason = 'temporal_workflow_failed',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'failed')
        WHERE stage_attempt_id = ?
      `).run(oldAttempt.stage_attempt_id);

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-terminal-source-selection',
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
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: row.task_id };
        },
      });

      assert.equal(tick.selected_count, 1);
      assert.equal(tick.mas_default_executor_live_skipped_count, 0);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-newer-after-terminal');
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick ignores stale live MAS default executor attempts once linked task is terminal', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-terminal-with-stale-live-attempt',
        sourceFingerprint: 'source-before',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'blocked',
        attempts: 1,
      });
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-newer-after-stale-live-attempt',
        sourceFingerprint: 'source-after',
        createdAt: '2026-05-25T16:40:00.000Z',
      });
      const oldRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-terminal-with-stale-live-attempt',
      ) as FamilyRuntimeTaskRow;
      const oldPayload = parseJsonText(oldRow.payload_json) as Record<string, unknown>;
      const oldAttempt = ensureProviderHostedStageAttempt(db, oldRow, oldPayload);
      assert.ok(oldAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(oldAttempt.stage_attempt_id);

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-stale-live-source-selection',
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
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: row.task_id };
        },
      });

      assert.equal(tick.selected_count, 1);
      assert.equal(tick.mas_default_executor_live_skipped_count, 0);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-newer-after-stale-live-attempt');
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick syncs terminal cross-task MAS default executor attempts before live skip', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-cross-task-temporal-failed',
        sourceFingerprint: 'source-before',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'running',
        attempts: 1,
        leaseOwner: 'opl-family-runtime:stale',
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-current-after-temporal-failed',
        sourceFingerprint: 'source-after',
        createdAt: '2026-05-25T16:40:00.000Z',
      });
      const oldRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-temporal-failed',
      ) as FamilyRuntimeTaskRow;
      const oldPayload = parseJsonText(oldRow.payload_json) as Record<string, unknown>;
      const oldAttempt = ensureProviderHostedStageAttempt(db, oldRow, oldPayload);
      assert.ok(oldAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        oldAttempt.stage_attempt_id,
      );

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-terminal-cross-task-source-selection',
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
        queryTemporalStageAttempt: async () => ({
          surface_kind: 'temporal_stage_attempt_query_receipt',
          provider_kind: 'temporal',
          stage_attempt_id: oldAttempt.stage_attempt_id,
          workflow_id: oldAttempt.workflow_id,
          workflow_status: 'FAILED',
          query_error: {
            code: 'temporal_stage_attempt_query_unavailable_after_terminal',
            message: 'Temporal workflow is already FAILED; terminal failure is sufficient for provider sync.',
          },
        }),
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: row.task_id };
        },
      });
      const oldTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason, lease_owner, lease_expires_at
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-cross-task-temporal-failed') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
        lease_owner: string | null;
        lease_expires_at: string | null;
      };
      const oldAttemptAfterSync = db.prepare(`
        SELECT status, blocked_reason
        FROM stage_attempts
        WHERE stage_attempt_id = ?
      `).get(oldAttempt.stage_attempt_id) as { status: string; blocked_reason: string | null };

      assert.equal(tick.selected_count, 1);
      assert.equal(tick.mas_default_executor_live_skipped_count, 0);
      assert.equal(dispatchCount, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-current-after-temporal-failed');
      assert.equal(oldTask.status, 'blocked');
      assert.equal(oldTask.last_error, 'temporal_workflow_failed');
      assert.equal(oldTask.dead_letter_reason, 'temporal_stage_attempt_failed');
      assert.equal(oldTask.lease_owner, null);
      assert.equal(oldTask.lease_expires_at, null);
      assert.equal(oldAttemptAfterSync.status, 'failed');
      assert.equal(oldAttemptAfterSync.blocked_reason, 'temporal_workflow_failed');
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick syncs a completed running MAS default executor attempt without queued work', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-running-temporal-completed-no-queued-row',
        sourceFingerprint: 'source-stable-completed-no-queued-row',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'running',
        attempts: 1,
        leaseOwner: 'opl-family-runtime:stale',
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const runningRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-running-temporal-completed-no-queued-row',
      ) as FamilyRuntimeTaskRow;
      const runningPayload = parseJsonText(runningRow.payload_json) as Record<string, unknown>;
      const runningAttempt = ensureProviderHostedStageAttempt(db, runningRow, runningPayload);
      assert.ok(runningAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        runningAttempt.stage_attempt_id,
      );

      let queryCount = 0;
      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-sync-running-completed-no-queued-row',
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
                provider_completion_is_domain_ready: false,
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
          };
        },
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const completedTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason, lease_owner, lease_expires_at
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-running-temporal-completed-no-queued-row') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
        lease_owner: string | null;
        lease_expires_at: string | null;
      };
      const [completedAttempt] = db.prepare(`
        SELECT status, closeout_receipt_status, closeout_refs_json
        FROM stage_attempts
        WHERE task_id = ?
      `).all('task-mas-default-running-temporal-completed-no-queued-row') as Array<{
        status: string;
        closeout_receipt_status: string | null;
        closeout_refs_json: string;
      }>;

      assert.equal(tick.selected_count, 0);
      assert.equal(tick.mas_default_executor_terminal_synced_count, 1);
      assert.equal(queryCount, 1);
      assert.equal(dispatchCount, 0);
      assert.equal(completedTask.status, 'succeeded');
      assert.equal(completedTask.last_error, null);
      assert.equal(completedTask.dead_letter_reason, null);
      assert.equal(completedTask.lease_owner, null);
      assert.equal(completedTask.lease_expires_at, null);
      assert.equal(completedAttempt.status, 'completed');
      assert.equal(completedAttempt.closeout_receipt_status, 'accepted_typed_closeout');
      assert.deepEqual(parseJsonText(completedAttempt.closeout_refs_json) as string[], ['receipt:dm002/repaired-package']);
    });
  } finally {
    db.close();
  }
});

test('family-runtime tick reports missing Temporal query handler for running MAS default executor sync', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db, {
        taskId: 'task-mas-default-running-temporal-without-query-handler',
        sourceFingerprint: 'source-stable-missing-query-handler',
        createdAt: '2026-05-25T16:30:00.000Z',
        status: 'running',
        attempts: 1,
        leaseOwner: 'opl-family-runtime:stale',
        leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      const runningRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-running-temporal-without-query-handler',
      ) as FamilyRuntimeTaskRow;
      const runningPayload = parseJsonText(runningRow.payload_json) as Record<string, unknown>;
      const runningAttempt = ensureProviderHostedStageAttempt(db, runningRow, runningPayload);
      assert.ok(runningAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        runningAttempt.stage_attempt_id,
      );

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-sync-running-missing-query-handler',
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
      const diagnosticEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'default_executor_temporal_query_handler_missing'
        LIMIT 1
      `).get('task-mas-default-running-temporal-without-query-handler') as { payload_json: string } | undefined;

      assert.equal(tick.selected_count, 0);
      assert.equal(dispatchCount, 0);
      assert.equal(tick.mas_default_executor_terminal_synced_count, 0);
      assert.equal(tick.mas_default_executor_temporal_query_handler_missing_count, 1);
      assert.ok(diagnosticEvent);
      const payload = parseJsonText(diagnosticEvent.payload_json) as {
        reason?: string;
        stage_attempt_id?: string;
        workflow_id?: string;
        sync_status?: string;
        authority_boundary?: {
          domain_truth_mutation?: boolean;
          production_readiness_claim?: boolean;
        };
      };
      assert.equal(payload.reason, 'temporal_query_handler_missing');
      assert.equal(payload.stage_attempt_id, runningAttempt.stage_attempt_id);
      assert.equal(payload.workflow_id, runningAttempt.workflow_id);
      assert.equal(payload.sync_status, 'terminal_observation_not_attempted');
      assert.equal(payload.authority_boundary?.domain_truth_mutation, false);
      assert.equal(payload.authority_boundary?.production_readiness_claim, false);
    });
  } finally {
    db.close();
  }
});
