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
