import { DatabaseSync } from 'node:sqlite';
import { WorkflowNotFoundError } from '@temporalio/common';

import {
  assert,
  fs,
  os,
  path,
  test,
} from './helpers.ts';

import { runSchedulerQueueTick } from '../../../../../src/family-runtime-scheduler-tick-runner.ts';
import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';
import {
  createFamilyRuntimeQueueTables,
  familyRuntimePaths,
  type FamilyRuntimeTaskRow,
} from '../../../../../src/family-runtime-store.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';

type TickDispatch = { task_id: string; status?: string };
type QueueTickWithMasDefaultExecutorRedrive = Awaited<
  ReturnType<typeof runFamilyRuntimeQueueTick<TickDispatch>>
>;

async function withIsolatedFamilyRuntimeEnv<T>(fn: () => T | Promise<T>) {
  const previous = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
  };
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-stale-admission-test-'));
  process.env.OPL_STATE_DIR = stateRoot;
  process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
  delete process.env.OPL_TEMPORAL_ADDRESS;
  delete process.env.TEMPORAL_ADDRESS;
  try {
    return await fn();
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
  createFamilyRuntimeQueueTables(db);
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

function insertDefaultExecutorTask(db: DatabaseSync) {
  const createdAt = '2026-05-25T16:30:00.000Z';
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status,
      attempts, max_attempts, source, requires_approval, approved_at, lease_owner,
      lease_expires_at, last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'task-mas-default-expired-admission-missing-workflow',
    'medautoscience',
    'domain_owner/default-executor-dispatch',
    JSON.stringify(defaultExecutorPayload('source-stable-expired-admission')),
    'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:source-stable-expired-admission',
    65,
    'running',
    1,
    3,
    'test-domain-export',
    0,
    null,
    'opl-family-runtime:stale',
    '2026-05-25T16:35:00.000Z',
    null,
    null,
    createdAt,
    createdAt,
  );
}

test('family-runtime tick recovers expired MAS default executor admission whose Temporal workflow was never started', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-expired-admission-missing-workflow',
      ) as FamilyRuntimeTaskRow;
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      const staleAttempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(staleAttempt);

      let queryCount = 0;
      let dispatchCount = 0;
      const tick = await runFamilyRuntimeQueueTick<TickDispatch>(db, familyRuntimePaths(), {
        source: 'test-expired-admission-missing-workflow',
        limit: 2,
        hydrate: false,
        taskScope: {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [{
            path: 'study_id',
            value: '002-dm-china-us-mortality-attribution',
          }],
        },
      }, {
        enqueueTask: () => ({ accepted: false }),
        queryTemporalStageAttempt: async () => {
          queryCount += 1;
          return {
            surface_kind: 'temporal_stage_attempt_query_unavailable',
            provider_kind: 'temporal',
            stage_attempt_id: staleAttempt.stage_attempt_id,
            workflow_id: staleAttempt.workflow_id,
            status: 'unavailable',
            reason: 'temporal_workflow_not_started_or_not_found',
            error: {
              code: 'temporal_workflow_not_found',
              message: 'workflow not found',
            },
          };
        },
        dispatchTask: (_db, _paths, selectedRow: FamilyRuntimeTaskRow) => {
          dispatchCount += 1;
          return { task_id: selectedRow.task_id };
        },
      });
      const task = db.prepare(`
        SELECT status, attempts, last_error, dead_letter_reason, lease_owner, lease_expires_at
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-expired-admission-missing-workflow') as {
        status: string;
        attempts: number;
        last_error: string | null;
        dead_letter_reason: string | null;
        lease_owner: string | null;
        lease_expires_at: string | null;
      };
      const attempts = db.prepare(`
        SELECT status, blocked_reason, provider_run_json
        FROM stage_attempts
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all('task-mas-default-expired-admission-missing-workflow') as Array<{
        status: string;
        blocked_reason: string | null;
        provider_run_json: string;
      }>;

      assert.equal(queryCount, 1);
      assert.equal(tick.mas_default_executor_terminal_synced_count, 1);
      assert.equal(tick.mas_default_executor_auto_redriven_count, 1);
      assert.equal(tick.selected_count, 1);
      assert.equal(dispatchCount, 1);
      assert.equal(task.status, 'queued');
      assert.equal(task.attempts, 0);
      assert.equal(task.last_error, null);
      assert.equal(task.dead_letter_reason, null);
      assert.equal(task.lease_owner, null);
      assert.equal(task.lease_expires_at, null);
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0].status, 'failed');
      assert.equal(attempts[0].blocked_reason, 'temporal_workflow_not_started_or_not_found');
      assert.equal(JSON.parse(attempts[0].provider_run_json).provider_status, 'failed');
      assert.equal(attempts[1].status, 'queued');
      assert.equal(attempts[1].blocked_reason, null);
    });
  } finally {
    db.close();
  }
});

test('scheduler tick syncs missing Temporal workflows through the safe read model before dispatch', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      insertDefaultExecutorTask(db);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-expired-admission-missing-workflow',
      ) as FamilyRuntimeTaskRow;
      const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
      const staleAttempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(staleAttempt);

      let rawQueryCount = 0;
      let safeQueryCount = 0;
      const paths = familyRuntimePaths();
      const tick = await runSchedulerQueueTick(
        db,
        paths,
        'test-scheduler-expired-admission-missing-workflow',
        2,
        false,
        {
          domainId: 'medautoscience',
          taskKind: 'domain_owner/default-executor-dispatch',
          payloadMatches: [{
            path: 'study_id',
            value: '002-dm-china-us-mortality-attribution',
          }],
        },
        undefined,
        {
          temporalProviderModule: async () => ({
            queryTemporalStageAttemptWorkflow: async () => {
              rawQueryCount += 1;
              throw new WorkflowNotFoundError(
                `workflow not found for ID: ${staleAttempt.workflow_id}`,
                staleAttempt.workflow_id,
                undefined,
              );
            },
            startTemporalStageAttemptWorkflow: async (attempt) => ({
              surface_kind: 'temporal_stage_attempt_start_receipt',
              provider_kind: 'temporal',
              stage_attempt_id: attempt.stage_attempt_id,
              workflow_id: attempt.workflow_id,
              first_execution_run_id: 'test-run',
              eagerly_started: false,
              namespace: 'default',
              task_queue: 'opl-family-runtime',
              authority_boundary: {
                opl: 'temporal_workflow_transport_and_control_metadata_only',
                domain: 'truth_quality_artifact_gate_owner',
              },
            }),
          }),
          queryTemporalStageAttemptReadModel: async (attempt) => {
            safeQueryCount += 1;
            return {
              surface_kind: 'temporal_stage_attempt_query_unavailable',
              provider_kind: 'temporal',
              stage_attempt_id: attempt.stage_attempt_id,
              workflow_id: attempt.workflow_id,
              status: 'unavailable',
              reason: 'temporal_workflow_not_started_or_not_found',
              error: {
                code: 'temporal_workflow_not_found',
                message: 'workflow not found',
              },
              authority_boundary: {
                opl: 'local_stage_attempt_ledger_projection_only',
                domain: 'truth_quality_artifact_gate_owner',
              },
            };
          },
        },
      ) as QueueTickWithMasDefaultExecutorRedrive;
      const task = db.prepare(`
        SELECT status, attempts, last_error, dead_letter_reason, lease_owner, lease_expires_at
        FROM tasks
        WHERE task_id = ?
      `).get('task-mas-default-expired-admission-missing-workflow') as {
        status: string;
        attempts: number;
        last_error: string | null;
        dead_letter_reason: string | null;
        lease_owner: string | null;
        lease_expires_at: string | null;
      };
      const attempts = db.prepare(`
        SELECT status, blocked_reason, provider_run_json
        FROM stage_attempts
        WHERE task_id = ?
        ORDER BY created_at ASC
      `).all('task-mas-default-expired-admission-missing-workflow') as Array<{
        status: string;
        blocked_reason: string | null;
        provider_run_json: string;
      }>;

      assert.equal(rawQueryCount, 0);
      assert.equal(safeQueryCount, 1);
      assert.equal(tick.mas_default_executor_terminal_synced_count, 1);
      assert.equal(tick.mas_default_executor_auto_redriven_count, 1);
      assert.equal(tick.selected_count, 1);
      assert.equal(tick.dispatches[0].status, 'running');
      assert.equal(task.status, 'running');
      assert.equal(task.attempts, 1);
      assert.equal(task.last_error, null);
      assert.equal(task.dead_letter_reason, null);
      assert.ok(task.lease_owner);
      assert.ok(task.lease_expires_at);
      assert.equal(attempts.length, 2);
      assert.equal(attempts[0].status, 'failed');
      assert.equal(attempts[0].blocked_reason, 'temporal_workflow_not_started_or_not_found');
      assert.equal(JSON.parse(attempts[0].provider_run_json).provider_status, 'failed');
      assert.equal(attempts[1].status, 'running');
      assert.equal(attempts[1].blocked_reason, null);
      assert.equal(JSON.parse(attempts[1].provider_run_json).provider_status, 'running');
    });
  } finally {
    db.close();
  }
});
