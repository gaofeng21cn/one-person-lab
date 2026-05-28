import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  fs,
  os,
  path,
  test,
} from './helpers.ts';

import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';
import { familyRuntimePaths, type FamilyRuntimeTaskRow } from '../../../../../src/family-runtime-store.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { createStageAttemptTable } from '../../../../../src/family-runtime-stage-attempts.ts';

function withIsolatedFamilyRuntimeEnv<T>(fn: () => T) {
  const previous = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER,
  };
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-source-test-'));
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

function createQueueTables(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE tasks (
      task_id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL,
      task_kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      dedupe_key TEXT UNIQUE,
      priority INTEGER NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL,
      max_attempts INTEGER NOT NULL,
      source TEXT NOT NULL,
      requires_approval INTEGER NOT NULL,
      approved_at TEXT,
      lease_owner TEXT,
      lease_expires_at TEXT,
      last_error TEXT,
      dead_letter_reason TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE events (
      event_id TEXT PRIMARY KEY,
      task_id TEXT,
      domain_id TEXT,
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE notifications (
      notification_id TEXT PRIMARY KEY,
      task_id TEXT,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  createStageAttemptTable(db);
}

function defaultExecutorPayload(sourceFingerprint: string) {
  return {
    profile: '/tmp/dm-cvd.profile.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'return_to_ai_reviewer_workflow',
    dispatch_authority: 'ai_reviewer_record_production_handoff',
    next_executable_owner: 'ai_reviewer',
    executor_kind: 'codex_cli_default',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    authority_boundary: 'mas_default_executor_dispatch_request_only',
    workspace_root: '/tmp/explicit-workspace-root',
    source_fingerprint: sourceFingerprint,
  };
}

function defaultExecutorPayloadForOwner(input: {
  sourceFingerprint: string;
  actionType: string;
  nextOwner: 'write' | 'ai_reviewer';
  dispatchAuthority: string;
  dispatchRef: string;
}) {
  return {
    ...defaultExecutorPayload(input.sourceFingerprint),
    action_type: input.actionType,
    dispatch_authority: input.dispatchAuthority,
    next_executable_owner: input.nextOwner,
    dispatch_ref: input.dispatchRef,
  };
}

function insertQueuedDefaultExecutorTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    sourceFingerprint: string;
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
    JSON.stringify(defaultExecutorPayload(input.sourceFingerprint)),
    `mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:${input.sourceFingerprint}`,
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

function insertDefaultExecutorTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    sourceFingerprint: string;
    createdAt: string;
    status: string;
    attempts?: number;
    leaseOwner?: string | null;
    leaseExpiresAt?: string | null;
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
    JSON.stringify(defaultExecutorPayload(input.sourceFingerprint)),
    `mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:${input.sourceFingerprint}`,
    65,
    input.status,
    input.attempts ?? 0,
    3,
    'test-domain-export',
    0,
    null,
    input.leaseOwner ?? null,
    input.leaseExpiresAt ?? null,
    null,
    null,
    input.createdAt,
    input.createdAt,
  );
}

function insertDefaultExecutorTaskWithPayload(
  db: DatabaseSync,
  input: {
    taskId: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
    createdAt: string;
    status: string;
    attempts?: number;
    leaseOwner?: string | null;
    leaseExpiresAt?: string | null;
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
    input.status,
    input.attempts ?? 0,
    3,
    'test-domain-export',
    0,
    null,
    input.leaseOwner ?? null,
    input.leaseExpiresAt ?? null,
    null,
    null,
    input.createdAt,
    input.createdAt,
  );
}

test('family-runtime tick selects the current MAS default executor source and skips older queued residue', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-source-old',
        sourceFingerprint: 'source-before',
        createdAt: '2026-05-25T16:30:00.000Z',
      });
      insertQueuedDefaultExecutorTask(db, {
        taskId: 'task-mas-default-source-current',
        sourceFingerprint: 'source-after',
        createdAt: '2026-05-25T16:40:00.000Z',
      });

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
        dispatchTask: (_db, _paths, row: FamilyRuntimeTaskRow) => ({
          task_id: row.task_id,
          source_fingerprint: JSON.parse(row.payload_json).source_fingerprint,
        }),
      });

      assert.equal(tick.selected_count, 1);
      assert.equal(tick.dispatches.length, 1);
      assert.equal(tick.dispatches[0].task_id, 'task-mas-default-source-current');
      assert.equal(tick.dispatches[0].source_fingerprint, 'source-after');
      assert.equal(tick.mas_default_executor_superseded_count, 1);
    });
  } finally {
    db.close();
  }
});

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
      const runningPayload = JSON.parse(runningRow.payload_json) as Record<string, unknown>;
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
      const skipPayload = JSON.parse(skipEvent.payload_json);
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
      const oldPayload = JSON.parse(oldRow.payload_json) as Record<string, unknown>;
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
      const oldPayload = JSON.parse(oldRow.payload_json) as Record<string, unknown>;
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
      const oldPayload = JSON.parse(oldRow.payload_json) as Record<string, unknown>;
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
      const runningPayload = JSON.parse(runningRow.payload_json) as Record<string, unknown>;
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
      assert.deepEqual(JSON.parse(completedAttempt.closeout_refs_json), ['receipt:dm002/repaired-package']);
    });
  } finally {
    db.close();
  }
});

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
