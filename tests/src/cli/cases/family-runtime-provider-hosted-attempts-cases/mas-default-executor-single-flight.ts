import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  fs,
  os,
  path,
  test,
} from './helpers.ts';

import { startMasDefaultExecutorDispatchAttempt } from '../../../../../src/family-runtime-mas-default-executor-start.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { familyRuntimePaths } from '../../../../../src/family-runtime-store.ts';
import {
  createStageAttemptTable,
  listStageAttemptsForTask,
} from '../../../../../src/family-runtime-stage-attempts.ts';

function withIsolatedFamilyRuntimeEnv<T>(fn: () => T) {
  const previous = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_WORKER_ENABLED: process.env.OPL_TEMPORAL_WORKER_ENABLED,
    OPL_TEMPORAL_WORKER_STATUS: process.env.OPL_TEMPORAL_WORKER_STATUS,
  };
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-single-flight-test-'));
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
  process.env.OPL_TEMPORAL_ADDRESS = '';
  process.env.TEMPORAL_ADDRESS = '';
  process.env.OPL_TEMPORAL_WORKER_ENABLED = '';
  process.env.OPL_TEMPORAL_WORKER_STATUS = '';
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
    action_type: 'run_quality_repair_batch',
    dispatch_authority: 'quality_repair_batch_writer_handoff',
    next_executable_owner: 'write',
    executor_kind: 'codex_cli_default',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
    authority_boundary: 'mas_default_executor_dispatch_request_only',
    workspace_root: '/tmp/explicit-workspace-root',
    source_fingerprint: sourceFingerprint,
  };
}

function insertSucceededTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
  },
) {
  const createdAt = new Date().toISOString();
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
    0,
    'succeeded',
    0,
    3,
    'test',
    0,
    null,
    null,
    null,
    null,
    null,
    createdAt,
    createdAt,
  );
}

test('family-runtime does not treat unstarted registered MAS default executor attempt as cross-task live', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const firstPayload = defaultExecutorPayload('source-before');
      const secondPayload = defaultExecutorPayload('source-after');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-cross-task-registered-first',
        payload: firstPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:registered-first-source',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-cross-task-registered-second',
        payload: secondPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:registered-second-source',
      });
      db.prepare("UPDATE tasks SET status = 'running', attempts = 1 WHERE task_id = ?").run(
        'task-mas-default-cross-task-registered-first',
      );
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-cross-task-registered-second',
      );
      const firstRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-registered-first',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const secondRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-registered-second',
      ) as Parameters<typeof startMasDefaultExecutorDispatchAttempt>[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, firstRow, firstPayload);
      assert.ok(firstAttempt);
      assert.equal(firstAttempt.status, 'queued');
      assert.equal(firstAttempt.provider_run.provider_status, 'registered');

      const secondAttempt = ensureProviderHostedStageAttempt(db, secondRow, secondPayload);
      let temporalStartCount = 0;
      const result = await startMasDefaultExecutorDispatchAttempt(db, familyRuntimePaths(), {
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
        'task-mas-default-cross-task-registered-second',
      ) as { status: string; attempts: number };
      const secondAttempts = listStageAttemptsForTask(db, 'task-mas-default-cross-task-registered-second');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-cross-task-registered-second') as { payload_json: string } | undefined;

      assert.ok(secondAttempt);
      assert.equal(result.status, 'running');
      assert.equal(temporalStartCount, 1);
      assert.equal(secondTask.status, 'running');
      assert.equal(secondTask.attempts, 1);
      assert.equal(secondAttempts.length, 1);
      assert.equal(secondAttempts[0].status, 'running');
      assert.equal(skipEvent, undefined);
    });
  } finally {
    db.close();
  }
});

test('family-runtime treats a claimed queued MAS default executor admission as cross-task live', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const firstPayload = defaultExecutorPayload('source-before');
      const secondPayload = defaultExecutorPayload('source-after');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-cross-task-claimed-queued-first',
        payload: firstPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:claimed-queued-first-source',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-cross-task-claimed-queued-second',
        payload: secondPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:claimed-queued-second-source',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'running', attempts = 1, lease_owner = 'opl-family-runtime:test',
          lease_expires_at = ?
        WHERE task_id = ?
      `).run(
        new Date(Date.now() + 60_000).toISOString(),
        'task-mas-default-cross-task-claimed-queued-first',
      );
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-cross-task-claimed-queued-second',
      );
      const firstRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-claimed-queued-first',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const secondRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-claimed-queued-second',
      ) as Parameters<typeof startMasDefaultExecutorDispatchAttempt>[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, firstRow, firstPayload);
      assert.ok(firstAttempt);
      assert.equal(firstAttempt.status, 'queued');
      assert.equal(firstAttempt.provider_run.provider_status, 'registered');

      const secondAttempt = ensureProviderHostedStageAttempt(db, secondRow, secondPayload);
      let temporalStartCount = 0;
      const result = await startMasDefaultExecutorDispatchAttempt(db, familyRuntimePaths(), {
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
        'task-mas-default-cross-task-claimed-queued-second',
      ) as { status: string; attempts: number };
      const secondAttempts = listStageAttemptsForTask(db, 'task-mas-default-cross-task-claimed-queued-second');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-cross-task-claimed-queued-second') as { payload_json: string } | undefined;

      assert.equal(secondAttempt, null);
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

test('family-runtime treats MAS default executor Temporal admission as running until provider closeout', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:admission-running';
      const taskId = 'task-mas-default-admission-running';
      const basePayload = defaultExecutorPayload('source-before');
      insertSucceededTask(db, {
        taskId,
        payload: basePayload,
        dedupeKey,
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof startMasDefaultExecutorDispatchAttempt
      >[2]['row'];
      const providerHostedAttempt = ensureProviderHostedStageAttempt(db, row, basePayload);
      assert.ok(providerHostedAttempt);

      const result = await startMasDefaultExecutorDispatchAttempt(db, familyRuntimePaths(), {
        row,
        payload: basePayload,
        providerHostedAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => ({
            surface_kind: 'temporal_stage_attempt_start_receipt',
            workflow_id: providerHostedAttempt.workflow_id,
          }),
        }),
      });
      const task = db.prepare(`
        SELECT status, attempts, last_error, dead_letter_reason, lease_owner, lease_expires_at
        FROM tasks
        WHERE task_id = ?
      `).get(taskId) as {
        status: string;
        attempts: number;
        last_error: string | null;
        dead_letter_reason: string | null;
        lease_owner: string | null;
        lease_expires_at: string | null;
      };

      assert.equal(result.status, 'running');
      assert.equal(task.status, 'running');
      assert.equal(task.attempts, 1);
      assert.equal(task.last_error, null);
      assert.equal(task.dead_letter_reason, null);
      assert.ok(task.lease_owner);
      assert.ok(task.lease_expires_at);
      assert.equal(listStageAttemptsForTask(db, taskId)[0].status, 'running');
    });
  } finally {
    db.close();
  }
});
