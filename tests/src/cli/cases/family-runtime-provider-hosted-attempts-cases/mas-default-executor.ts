import {
  assert,
  createDispatchFixture,
  familyRuntimeEnv,
  fs,
  os,
  path,
  runCli,
  test,
} from './helpers.ts';
import { DatabaseSync } from 'node:sqlite';

import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';
import { startMasDefaultExecutorDispatchAttempt } from '../../../../../src/family-runtime-mas-default-executor-start.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { createFamilyRuntimeQueueTables, familyRuntimePaths } from '../../../../../src/family-runtime-store.ts';
import { runFamilyRuntimeQueueTick } from '../../../../../src/family-runtime-tick.ts';
import {
  listStageAttemptsForTask,
  syncStageAttemptFromTemporalTerminalObservation,
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
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-direct-test-'));
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
  createFamilyRuntimeQueueTables(db);
}

function insertSucceededTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    domainId: string;
    taskKind: string;
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
    input.domainId,
    input.taskKind,
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

test('family-runtime admits MAS AI reviewer default executor dispatch without domain truth authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-ai-reviewer-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
payload = task["payload"]
assert task["task_kind"] == "domain_owner/default-executor-dispatch"
assert payload["action_type"] == "return_to_ai_reviewer_workflow"
assert payload["next_executable_owner"] == "ai_reviewer"
print(json.dumps({
    "accepted": True,
    "surface_kind": "mas_family_domain_handler_dispatch_receipt",
    "task_id": task["task_id"],
    "task_kind": task["task_kind"],
    "will_start_llm_worker": True,
    "dispatch": {
        "execution_policy": "opl_default_executor_stage_attempt_admission",
        "result": {
            "surface": "default_executor_dispatch_request_admission",
            "status": "admitted",
            "next_owner": "ai_reviewer",
            "dispatch_ref": payload["dispatch_ref"]
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json';
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd.profile.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'return_to_ai_reviewer_workflow',
        dispatch_authority: 'ai_reviewer_record_production_handoff',
        next_executable_owner: 'ai_reviewer',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        authority_boundary: 'mas_default_executor_dispatch_request_only',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_manuscript',
        domain_owner: 'ai_reviewer',
        source_fingerprint: 'truth-snapshot::085b4164f248a2f4c92bf66b',
        workspace_root: '/tmp/explicit-workspace-root',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:ai-reviewer',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.domain_id, 'medautoscience');
    assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.equal(attempt.workspace_locator.workspace_root, '/tmp/explicit-workspace-root');
    assert.equal(attempt.workspace_locator.action_type, 'return_to_ai_reviewer_workflow');
    assert.equal(attempt.workspace_locator.dispatch_authority, 'ai_reviewer_record_production_handoff');
    assert.equal(attempt.workspace_locator.dispatch_ref, dispatchRef);
    assert.equal(attempt.workspace_locator.next_executable_owner, 'ai_reviewer');
    assert.equal(attempt.workspace_locator.domain_truth_owner, 'med-autoscience');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempt.workspace_locator.opl_writes_artifact_gate, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
    assert.equal(attempt.workspace_locator.domain_source_fingerprint, 'truth-snapshot::085b4164f248a2f4c92bf66b');
    assert.deepEqual(attempt.checkpoint_refs, [dispatchRef]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime does not auto-requeue succeeded MAS default executor dispatch from domain export updates', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:auto-requeue-guard';
    const basePayload = defaultExecutorPayload('source-before');
    insertSucceededTask(db, {
      taskId: 'task-mas-default-succeeded-provider-admission',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: basePayload,
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...basePayload,
        source_fingerprint: 'source-after',
        owner_route_work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_manuscript',
      },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-mas-default-succeeded-provider-admission',
    ) as { status: string; payload_json: string };
    const requeueEvents = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = 'task_requeued_from_domain_export_update'",
    ).get('task-mas-default-succeeded-provider-admission') as { count: number };

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.ok(result.task);
    assert.equal(result.task.status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(JSON.parse(task.payload_json).source_fingerprint, 'source-before');
    assert.equal(requeueEvents.count, 0);
  } finally {
    db.close();
  }
});

test('family-runtime refreshes succeeded MAS default executor dispatch metadata when domain owner fingerprint changes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:succeeded-owner-fingerprint-redrive';
    const basePayload = defaultExecutorPayload('source-current');
    insertSucceededTask(db, {
      taskId: 'task-mas-default-succeeded-owner-fingerprint-redrive',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...basePayload,
        opl_domain_export_context: {
          command_source: 'module_exec_profile',
          owner_fingerprint: 'module_exec_profile:/tmp/profile.toml:medautoscience:managed_root:head-before:/tmp/modules/med-autoscience',
        },
      },
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...basePayload,
        opl_domain_export_context: {
          command_source: 'module_exec_profile',
          owner_fingerprint: 'module_exec_profile:/tmp/profile.toml:medautoscience:managed_root:head-after:/tmp/modules/med-autoscience',
        },
      },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-mas-default-succeeded-owner-fingerprint-redrive',
    ) as { status: string; payload_json: string };
    const payload = JSON.parse(task.payload_json);
    const refreshEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_metadata_refreshed_from_domain_export'
      LIMIT 1
    `).get('task-mas-default-succeeded-owner-fingerprint-redrive') as { payload_json: string } | undefined;

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(task.status, 'succeeded');
    assert.equal(
      payload.opl_domain_export_context.owner_fingerprint,
      'module_exec_profile:/tmp/profile.toml:medautoscience:managed_root:head-after:/tmp/modules/med-autoscience',
    );
    assert.ok(refreshEvent);
    assert.equal(
      JSON.parse(refreshEvent.payload_json).reason,
      'domain_export_owner_fingerprint_changed_after_succeeded',
    );
  } finally {
    db.close();
  }
});

test('family-runtime keeps MAS default executor admission single-flight while a live attempt exists', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:single-flight';
      const taskId = 'task-mas-default-single-flight';
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
      const firstAttempt = ensureProviderHostedStageAttempt(db, row, basePayload);
      assert.ok(firstAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        firstAttempt.stage_attempt_id,
      );

      const secondAttempt = ensureProviderHostedStageAttempt(db, row, {
        ...basePayload,
        source_fingerprint: 'source-after',
      });
      const attempts = listStageAttemptsForTask(db, taskId);
      const createdEvents = db.prepare(`
        SELECT COUNT(*) AS count
        FROM events
        WHERE task_id = ? AND event_type = 'stage_attempt_created_for_provider_hosted_task'
      `).get(taskId) as { count: number };

      assert.equal(secondAttempt, null);
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].status, 'running');
      assert.equal(createdEvents.count, 1);
    });
  } finally {
    db.close();
  }
});

test('family-runtime keeps MAS default executor dispatch single-flight even when a refreshed source row appears', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const firstPayload = defaultExecutorPayload('source-before');
      const secondPayload = defaultExecutorPayload('source-after');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-cross-task-live-first',
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: firstPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:first-source',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-cross-task-live-second',
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: secondPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:second-source',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id IN (?, ?)").run(
        'task-mas-default-cross-task-live-first',
        'task-mas-default-cross-task-live-second',
      );
      const firstRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-live-first',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const secondRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-live-second',
      ) as Parameters<typeof startMasDefaultExecutorDispatchAttempt>[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, firstRow, firstPayload);
      assert.ok(firstAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        firstAttempt.stage_attempt_id,
      );
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
        'task-mas-default-cross-task-live-second',
      ) as { status: string; attempts: number };
      const secondAttempts = listStageAttemptsForTask(db, 'task-mas-default-cross-task-live-second');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-cross-task-live-second') as { payload_json: string } | undefined;

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

test('family-runtime blocks stale MAS default executor attempts when a newer source supersedes the task', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const stalePayload = defaultExecutorPayload('source-before');
      const currentPayload = defaultExecutorPayload('source-after');
      const staleTaskId = 'task-mas-default-superseded-stale';
      const currentTaskId = 'task-mas-default-superseded-current';
      insertSucceededTask(db, {
        taskId: staleTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:stale',
      });
      insertSucceededTask(db, {
        taskId: currentTaskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: currentPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:current',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id IN (?, ?)").run(staleTaskId, currentTaskId);
      const staleRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(staleTaskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];
      const staleAttempt = ensureProviderHostedStageAttempt(db, staleRow, stalePayload);
      assert.ok(staleAttempt);

      const tick = await runFamilyRuntimeQueueTick(db, familyRuntimePaths(), {
        source: 'test-superseded-default-executor',
        limit: 10,
        hydrate: false,
      }, {
        enqueueTask,
        dispatchTask: async (_db, _paths, row) => ({
          status: 'selected',
          task_id: row.task_id,
        }),
      });
      const staleTask = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(staleTaskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
      const [blockedAttempt] = listStageAttemptsForTask(db, staleTaskId);
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_superseded_by_current_source'
        LIMIT 1
      `).get(staleTaskId) as { payload_json: string } | undefined;
      const eventPayload = event ? JSON.parse(event.payload_json) : null;

      assert.equal(tick.mas_default_executor_superseded_count, 1);
      assert.deepEqual(tick.dispatches, [{ status: 'selected', task_id: currentTaskId }]);
      assert.equal(staleTask.status, 'blocked');
      assert.equal(staleTask.last_error, 'mas_default_executor_superseded_by_current_source');
      assert.equal(staleTask.dead_letter_reason, 'mas_default_executor_superseded_by_current_source');
      assert.equal(blockedAttempt.status, 'blocked');
      assert.equal(blockedAttempt.blocked_reason, 'mas_default_executor_superseded_by_current_source');
      assert.equal(blockedAttempt.provider_run.provider_status, 'blocked');
      assert.ok(eventPayload);
      assert.deepEqual(eventPayload.blocked_stage_attempt_ids, [staleAttempt.stage_attempt_id]);
      assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    });
  } finally {
    db.close();
  }
});

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

test('family-runtime does not start MAS default executor Temporal workflow from a stale unclaimed task row', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:stale-claim';
      const taskId = 'task-mas-default-stale-claim';
      const basePayload = defaultExecutorPayload('source-before');
      insertSucceededTask(db, {
        taskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: basePayload,
        dedupeKey,
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const staleQueuedRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof startMasDefaultExecutorDispatchAttempt
      >[2]['row'];
      const providerHostedAttempt = ensureProviderHostedStageAttempt(db, staleQueuedRow, basePayload);
      db.prepare("UPDATE tasks SET status = 'running', lease_owner = 'other-worker' WHERE task_id = ?").run(taskId);
      let temporalStartCount = 0;

      const result = await startMasDefaultExecutorDispatchAttempt(db, familyRuntimePaths(), {
        row: staleQueuedRow,
        payload: basePayload,
        providerHostedAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
      });
      const task = db.prepare('SELECT status, lease_owner FROM tasks WHERE task_id = ?').get(taskId) as {
        status: string;
        lease_owner: string | null;
      };
      const admittedEvents = db.prepare(`
        SELECT COUNT(*) AS count
        FROM events
        WHERE task_id = ? AND event_type = 'task_admitted_default_executor_stage_attempt'
      `).get(taskId) as { count: number };

      assert.equal(result.status, 'skipped');
      assert.equal(result.reason, 'task_already_claimed');
      assert.equal(temporalStartCount, 0);
      assert.equal(task.status, 'running');
      assert.equal(task.lease_owner, 'other-worker');
      assert.equal(admittedEvents.count, 0);
    });
  } finally {
    db.close();
  }
});

test('family-runtime does not block MAS default executor task when a live attempt is already running', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:live-skip';
      const taskId = 'task-mas-default-live-skip';
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
        typeof startMasDefaultExecutorDispatchAttempt
      >[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, row, basePayload);
      assert.ok(firstAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        firstAttempt.stage_attempt_id,
      );
      let temporalStartCount = 0;

      const result = await startMasDefaultExecutorDispatchAttempt(db, familyRuntimePaths(), {
        row,
        payload: basePayload,
        providerHostedAttempt: null,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
      });
      const task = db.prepare('SELECT status, dead_letter_reason FROM tasks WHERE task_id = ?').get(taskId) as {
        status: string;
        dead_letter_reason: string | null;
      };

      assert.equal(result.status, 'skipped');
      assert.equal(result.reason, 'live_stage_attempt_exists');
      assert.equal(temporalStartCount, 0);
      assert.equal(task.status, 'queued');
      assert.equal(task.dead_letter_reason, null);
      assert.equal(listStageAttemptsForTask(db, taskId).length, 1);
    });
  } finally {
    db.close();
  }
});

test('family-runtime refreshes refs-only evidence payloads on succeeded MAS default executor dispatches', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:evidence-payload-refresh';
    const basePayload = defaultExecutorPayload('source-current');
    insertSucceededTask(db, {
      taskId: 'task-mas-default-succeeded-provider-admission-evidence-payload',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: basePayload,
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        ...basePayload,
        domain_dispatch_evidence_record_payload: {
          surface_kind: 'mas_domain_dispatch_evidence_record_payload',
          record_payload: {
            domain_id: 'medautoscience',
            task_kind: 'domain_owner/default-executor-dispatch',
            study_id: '002-dm-china-us-mortality-attribution',
            domain_source_fingerprint: 'source-current',
            typed_blocker_refs: ['mas-typed-blocker:DM002'],
            no_regression_refs: ['mas-no-forbidden-write:DM002'],
            evidence_refs: ['dispatch.json'],
          },
        },
      },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-mas-default-succeeded-provider-admission-evidence-payload',
    ) as { status: string; payload_json: string };
    const payload = JSON.parse(task.payload_json);
    const requeueEvents = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = 'task_requeued_from_domain_export_update'",
    ).get('task-mas-default-succeeded-provider-admission-evidence-payload') as { count: number };

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.ok(result.task);
    assert.equal(result.task.status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(payload.domain_dispatch_evidence_record_payload.surface_kind, 'mas_domain_dispatch_evidence_record_payload');
    assert.deepEqual(
      payload.domain_dispatch_evidence_record_payload.record_payload.typed_blocker_refs,
      ['mas-typed-blocker:DM002'],
    );
    assert.equal(requeueEvents.count, 0);
  } finally {
    db.close();
  }
});

test('family-runtime still requeues generic succeeded tasks when domain export changes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'mag:generic:succeeded:export-update';
    insertSucceededTask(db, {
      taskId: 'task-generic-succeeded-export-update',
      domainId: 'medautogrant',
      taskKind: 'user-loop/wakeup',
      payload: { workspace_root: '/tmp/mag', source_fingerprint: 'source-before' },
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautogrant',
      taskKind: 'user-loop/wakeup',
      payload: { workspace_root: '/tmp/mag', source_fingerprint: 'source-after' },
      dedupeKey,
      source: 'test-domain-export',
    });
    const task = db.prepare('SELECT status, payload_json FROM tasks WHERE task_id = ?').get(
      'task-generic-succeeded-export-update',
    ) as { status: string; payload_json: string };

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(task.status, 'queued');
    assert.equal(JSON.parse(task.payload_json).source_fingerprint, 'source-after');
  } finally {
    db.close();
  }
});

test('family-runtime blocks MAS default executor dispatch when Temporal cannot start Codex writer attempt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
import sys
from pathlib import Path

task = json.loads(Path(sys.argv[1]).read_text())
assert task["task_kind"] == "domain_owner/default-executor-dispatch"
payload = task["payload"]
assert payload["study_id"] == "002-dm-china-us-mortality-attribution"
assert payload["dispatch_ref"].endswith("default_executor_dispatches/run_quality_repair_batch.json")
print(json.dumps({
    "accepted": True,
    "surface_kind": "mas_family_domain_handler_dispatch_receipt",
    "task_id": task["task_id"],
    "task_kind": task["task_kind"],
    "will_start_llm_worker": True,
    "dispatch": {
        "execution_policy": "opl_default_executor_stage_attempt_admission",
        "result": {
            "surface": "default_executor_dispatch_request_admission",
            "status": "admitted",
            "next_owner": "write",
            "dispatch_ref": payload["dispatch_ref"]
        }
    }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd.profile.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        authority_boundary: 'mas_default_executor_dispatch_request_only',
        source_refs: [
          {
            role: 'default_executor_dispatch_request',
            ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
            exists: true,
            body_included: false,
          },
        ],
        workspace_root: '/tmp/explicit-workspace-root',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:writer',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.domain_id, 'medautoscience');
    assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.equal(attempt.task_id, taskId);
    assert.equal(attempt.status, 'blocked');
    assert.match(attempt.blocked_reason, /OPL_TEMPORAL_ADDRESS/);
    assert.equal(attempt.workspace_locator.workspace_root, '/tmp/explicit-workspace-root');
    assert.equal(attempt.workspace_locator.dispatch_ref, 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json');
    assert.equal(attempt.workspace_locator.next_executable_owner, 'write');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
    assert.deepEqual(attempt.checkpoint_refs, [
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime derives MAS default executor workspace root from profile when payload omits workspace_root', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-default-executor-root-'));
  const dispatch = createDispatchFixture(`
python3 - "$TASK_PATH" <<'PY'
import json
print(json.dumps({
  "accepted": True,
  "surface_kind": "mas_family_domain_handler_dispatch_receipt",
  "dispatch": {
    "action_type": "default_executor_dispatch_request",
    "result": {"status": "admitted"}
  }
}))
PY
`);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatch.dispatchPath,
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    });
    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        authority_boundary: 'mas_default_executor_dispatch_request_only',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:profile-root',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(attempt.workspace_locator.workspace_root, '/tmp/dm-cvd');
    assert.equal(attempt.workspace_locator.domain_truth_owner, 'med-autoscience');
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.deepEqual(attempt.checkpoint_refs, [dispatchRef]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(dispatch.fixtureRoot, { recursive: true, force: true });
  }
});
