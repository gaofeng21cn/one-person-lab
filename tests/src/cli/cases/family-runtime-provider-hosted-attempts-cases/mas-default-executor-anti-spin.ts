import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  test,
} from './helpers.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-single-flight-helpers.ts';

import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { familyRuntimePaths, type FamilyRuntimeTaskRow } from '../../../../../src/family-runtime-store.ts';
import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import {
  ingestStageAttemptCloseout,
  listStageAttemptsForTask,
} from '../../../../../src/family-runtime-stage-attempts.ts';

function insertQueuedDefaultExecutorTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
    createdAt: string;
  },
) {
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
      attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
      lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    'medautoscience',
    'domain_owner/default-executor-dispatch',
    JSON.stringify(input.payload),
    input.dedupeKey,
    65,
    'queued',
    0,
    3,
    'test-domain-export',
    0,
    null,
    null,
    null,
    null,
    null,
    input.createdAt,
    input.createdAt,
  );
}

function closeAttemptWithoutDeliverableDelta(
  db: DatabaseSync,
  input: {
    taskId: string;
    sourceFingerprint: string;
    blockerFamily: string;
    createdAt: string;
  },
) {
  const payload = defaultExecutorPayload(input.sourceFingerprint);
  insertSucceededTask(db, {
    taskId: input.taskId,
    payload,
    dedupeKey: `mas:dm-cvd:002:default-executor:anti-spin:${input.taskId}`,
  });
  db.prepare('UPDATE tasks SET created_at = ?, updated_at = ? WHERE task_id = ?').run(
    input.createdAt,
    input.createdAt,
    input.taskId,
  );
  const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.taskId) as FamilyRuntimeTaskRow;
  const attempt = ensureProviderHostedStageAttempt(db, row, payload);
  assert.ok(attempt);
  ingestStageAttemptCloseout(db, {
    stageAttemptId: attempt.stage_attempt_id,
    packet: {
      surface_kind: 'stage_attempt_closeout_packet',
      closeout_refs: [`receipt:${input.taskId}`],
      consumed_refs: [`source:${input.taskId}`],
      consumed_memory_refs: [],
      writeback_receipt_refs: [],
      rejected_writes: [],
      next_owner: 'med-autoscience',
      domain_ready_verdict: 'domain_gate_pending',
      route_impact: {
        typed_blocker_refs: [`typed-blocker:${input.blockerFamily}`],
        typed_blockers: [{
          blocker_id: input.blockerFamily,
          blocker_family: input.blockerFamily,
          required_owner: 'med-autoscience',
        }],
        progress_delta_classification: 'platform_repair',
        deliverable_progress_delta: {
          delta_count: 0,
          delta_refs: [],
        },
        platform_repair_delta: {
          delta_count: 1,
          delta_refs: [`platform-repair:${input.taskId}`],
        },
        next_forced_delta: 'domain_deliverable_or_owner_receipt_delta_required',
      },
    },
  });
}

test('family-runtime tick blocks repeated same-source MAS default executor dispatches without deliverable delta', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      closeAttemptWithoutDeliverableDelta(db, {
        taskId: 'task-mas-default-anti-spin-first',
        sourceFingerprint: 'source-spin',
        blockerFamily: 'reviewer_refresh_currentness',
        createdAt: '2026-06-02T00:00:00.000Z',
      });
      closeAttemptWithoutDeliverableDelta(db, {
        taskId: 'task-mas-default-anti-spin-second',
        sourceFingerprint: 'source-spin',
        blockerFamily: 'reviewer_refresh_currentness',
        createdAt: '2026-06-02T00:10:00.000Z',
      });
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-anti-spin-candidate',
        payload: defaultExecutorPayload('source-spin'),
        dedupeKey: 'mas:dm-cvd:002:default-executor:anti-spin:candidate',
        createdAt: '2026-06-02T00:20:00.000Z',
      });

      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-progress-first-anti-spin',
        limit: 10,
        hydrate: false,
      }, {
        enqueueTask,
        dispatchTask: (_db, _paths, row) => {
          dispatchCount += 1;
          return { task_id: row.task_id, status: 'selected' };
        },
      });
      const task = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-anti-spin-candidate') as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
      };
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_progress_first_anti_spin_blocked'
        LIMIT 1
      `).get('task-mas-default-anti-spin-candidate') as { payload_json: string } | undefined;
      const eventPayload = event ? JSON.parse(event.payload_json) : null;

      assert.equal(tick.progress_first_anti_spin_blocked_count, 1);
      assert.equal(tick.selected_count, 0);
      assert.equal(dispatchCount, 0);
      assert.equal(task.status, 'blocked');
      assert.equal(task.last_error, 'progress_first_owner_delta_required');
      assert.equal(task.dead_letter_reason, 'progress_first_owner_delta_required');
      assert.deepEqual(listStageAttemptsForTask(db, 'task-mas-default-anti-spin-candidate'), []);
      assert.ok(eventPayload);
      assert.equal(eventPayload.reason, 'progress_first_owner_delta_required');
      assert.equal(eventPayload.lineage.repeat_count, 2);
      assert.equal(eventPayload.lineage.next_forced_delta, 'domain_deliverable_or_owner_receipt_delta_required');
      assert.equal(eventPayload.stop_loss_state.status, 'frozen');
      assert.equal(eventPayload.stop_loss_state.lineage_repeat_count, 2);
      assert.equal(eventPayload.stop_loss_state.fresh_owner_delta_required_to_resume, true);
      assert.equal(eventPayload.stop_loss_policy.freeze_state, 'frozen');
      assert.equal(eventPayload.stop_loss_policy.authority_boundary.opl_can_freeze_default_launch, true);
      assert.equal(eventPayload.stop_loss_policy.authority_boundary.opl_can_synthesize_fallback_verdict, false);
      assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
      assert.equal(eventPayload.authority_boundary.can_create_owner_receipt, false);
      assert.equal(eventPayload.authority_boundary.can_create_typed_blocker, false);
      assert.equal(eventPayload.authority_boundary.can_claim_domain_ready, false);
    });
  } finally {
    db.close();
  }
});

test('family-runtime anti-spin gate allows fresh source, typed blocker, deliverable delta, or human override payloads', async () => {
  const cases = [
    {
      taskId: 'task-mas-default-anti-spin-new-source',
      payload: defaultExecutorPayload('source-fresh'),
    },
    {
      taskId: 'task-mas-default-anti-spin-typed-blocker',
      payload: {
        ...defaultExecutorPayload('source-spin'),
        typed_blocker_refs: ['typed-blocker:mas/reviewer-refresh-owned'],
      },
    },
    {
      taskId: 'task-mas-default-anti-spin-deliverable',
      payload: {
        ...defaultExecutorPayload('source-spin'),
        deliverable_progress_delta: {
          delta_count: 1,
          delta_refs: ['paper-delta:reviewer-refresh'],
        },
      },
    },
    {
      taskId: 'task-mas-default-anti-spin-human-override',
      payload: {
        ...defaultExecutorPayload('source-spin'),
        progress_first_human_override_ref: 'human-override:continue-default-executor',
      },
    },
  ];
  for (const [index, item] of cases.entries()) {
    const db = new DatabaseSync(':memory:');
    try {
      await withIsolatedFamilyRuntimeEnv(async () => {
        createQueueTables(db);
        closeAttemptWithoutDeliverableDelta(db, {
          taskId: `task-mas-default-anti-spin-bypass-first-${index}`,
          sourceFingerprint: 'source-spin',
          blockerFamily: 'reviewer_refresh_currentness',
          createdAt: '2026-06-02T01:00:00.000Z',
        });
        closeAttemptWithoutDeliverableDelta(db, {
          taskId: `task-mas-default-anti-spin-bypass-second-${index}`,
          sourceFingerprint: 'source-spin',
          blockerFamily: 'reviewer_refresh_currentness',
          createdAt: '2026-06-02T01:10:00.000Z',
        });
        insertQueuedDefaultExecutorTask(db, {
          taskId: item.taskId,
          payload: item.payload,
          dedupeKey: `mas:dm-cvd:002:default-executor:anti-spin:bypass:${index}`,
          createdAt: '2026-06-02T01:20:00.000Z',
        });

        const dispatchedTaskIds: string[] = [];
        const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
          source: 'test-progress-first-anti-spin-bypass',
          limit: 10,
          hydrate: false,
        }, {
          enqueueTask,
          dispatchTask: (_db, _paths, row) => {
            dispatchedTaskIds.push(row.task_id);
            return { task_id: row.task_id, status: 'selected' };
          },
        });

        assert.equal(tick.progress_first_anti_spin_blocked_count, 0);
        assert.deepEqual(dispatchedTaskIds, [item.taskId]);
      });
    } finally {
      db.close();
    }
  }
});
