import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  test,
  parseJsonText,
} from './helpers.ts';
import { enqueueTask } from '../../../../../src/modules/runway/family-runtime-enqueue.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/modules/runway/family-runtime-provider-hosted-attempts.ts';
import { listStageAttemptsForTask } from '../../../../../src/modules/runway/family-runtime-stage-attempts.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-single-flight-helpers.ts';

function gateClearingDefaultExecutorPayload(sourceFingerprint: string) {
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    action_type: 'run_gate_clearing_batch',
    dispatch_authority: 'publication_gate_replay_after_current_ai_reviewer_record',
    next_executable_owner: 'gate_clearing_batch',
    dispatch_ref: 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
  };
}

test('family-runtime derives MAS default executor stage packet from dispatch path when dispatch ref is absent', () => {
  const db = new DatabaseSync(':memory:');
  const workspaceRoot = '/tmp/dm-cvd-current-control';
  const dispatchRef = 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json';
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const payload: Record<string, unknown> = {
        ...gateClearingDefaultExecutorPayload('source-gate-clearing-dispatch-path'),
        workspace_root: workspaceRoot,
        dispatch_path: `${workspaceRoot}/${dispatchRef}`,
      };
      delete payload.dispatch_ref;
      insertSucceededTask(db, {
        taskId: 'task-mas-default-gate-clearing-dispatch-path',
        payload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:dispatch-path',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-gate-clearing-dispatch-path',
      );
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-gate-clearing-dispatch-path',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const attempt = ensureProviderHostedStageAttempt(db, row, payload);

      assert.ok(attempt);
      assert.deepEqual(attempt.checkpoint_refs, [dispatchRef]);
      assert.equal(attempt.workspace_locator.dispatch_ref, dispatchRef);
      assert.equal(attempt.workspace_locator.dispatch_path, `${workspaceRoot}/${dispatchRef}`);
    });
  } finally {
    db.close();
  }
});

test('family-runtime preserves MAS default executor explicit stage packet refs on stage attempt', () => {
  const db = new DatabaseSync(':memory:');
  const stagePacketRef = 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/run_gate_clearing_batch.stage-packet.json';
  const checkpointRef = 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/stage_packets/checkpoints/gate-clearing-current.json';
  const dispatchRef = 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json';
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const payload = {
        ...gateClearingDefaultExecutorPayload('source-gate-clearing-explicit-stage-packet'),
        stage_packet_ref: stagePacketRef,
        checkpoint_refs: [checkpointRef],
      };
      insertSucceededTask(db, {
        taskId: 'task-mas-default-gate-clearing-explicit-stage-packet',
        payload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:explicit-stage-packet',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-gate-clearing-explicit-stage-packet',
      );
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-gate-clearing-explicit-stage-packet',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const attempt = ensureProviderHostedStageAttempt(db, row, payload);

      assert.ok(attempt);
      assert.deepEqual(attempt.checkpoint_refs, [stagePacketRef, checkpointRef, dispatchRef]);
      assert.equal(attempt.workspace_locator.stage_packet_ref, stagePacketRef);
      assert.deepEqual(attempt.workspace_locator.stage_packet_refs, [stagePacketRef, checkpointRef, dispatchRef]);
      assert.equal(attempt.workspace_locator.dispatch_ref, dispatchRef);
    });
  } finally {
    db.close();
  }
});

test('family-runtime admits MAS gate-clearing default executor dispatch as Codex stage attempt', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const payload = gateClearingDefaultExecutorPayload('source-gate-clearing-current');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-gate-clearing-admission',
        payload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:admission',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-gate-clearing-admission',
      );
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-gate-clearing-admission',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      const attempts = listStageAttemptsForTask(db, 'task-mas-default-gate-clearing-admission');

      assert.ok(attempt);
      assert.equal(attempt.executor_kind, 'codex_cli');
      assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
      assert.equal(attempt.workspace_locator.next_executable_owner, 'gate_clearing_batch');
      assert.equal(attempt.workspace_locator.action_type, 'run_gate_clearing_batch');
      assert.deepEqual(attempt.checkpoint_refs, [payload.dispatch_ref]);
      assert.equal(attempts.length, 1);
    });
  } finally {
    db.close();
  }
});

test('family-runtime admits finalize-owned MAS gate-clearing default executor dispatch as Codex stage attempt', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const payload = {
        ...gateClearingDefaultExecutorPayload('source-gate-clearing-finalize-owner'),
        next_executable_owner: 'finalize',
      };
      insertSucceededTask(db, {
        taskId: 'task-mas-default-gate-clearing-finalize-owner',
        payload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:finalize-owner',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-gate-clearing-finalize-owner',
      );
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-gate-clearing-finalize-owner',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      const attempts = listStageAttemptsForTask(db, 'task-mas-default-gate-clearing-finalize-owner');

      assert.ok(attempt);
      assert.equal(attempt.executor_kind, 'codex_cli');
      assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
      assert.equal(attempt.workspace_locator.next_executable_owner, 'finalize');
      assert.equal(attempt.workspace_locator.action_type, 'run_gate_clearing_batch');
      assert.deepEqual(attempt.checkpoint_refs, [payload.dispatch_ref]);
      assert.equal(attempts.length, 1);
    });
  } finally {
    db.close();
  }
});

test('family-runtime admits a new MAS gate-clearing work unit after stale attempt is superseded', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const stalePayload = gateClearingDefaultExecutorPayload('source-gate-clearing-stale');
      const currentPayload = gateClearingDefaultExecutorPayload('source-gate-clearing-current');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-gate-clearing-source-advance',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:source-advance',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-gate-clearing-source-advance',
      );
      const staleRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-gate-clearing-source-advance',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const staleAttempt = ensureProviderHostedStageAttempt(db, staleRow, stalePayload);
      assert.ok(staleAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'blocked',
          blocked_reason = 'mas_default_executor_superseded_by_current_source',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'blocked')
        WHERE stage_attempt_id = ?
      `).run(
        staleAttempt.stage_attempt_id,
      );
      db.prepare("UPDATE tasks SET payload_json = ? WHERE task_id = ?").run(
        JSON.stringify(currentPayload),
        'task-mas-default-gate-clearing-source-advance',
      );
      const currentRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-gate-clearing-source-advance',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const currentAttempt = ensureProviderHostedStageAttempt(db, currentRow, currentPayload);
      const attempts = listStageAttemptsForTask(db, 'task-mas-default-gate-clearing-source-advance');

      assert.ok(currentAttempt);
      assert.notEqual(currentAttempt.stage_attempt_id, staleAttempt.stage_attempt_id);
      assert.equal(currentAttempt.workspace_locator.domain_source_fingerprint, 'source-gate-clearing-current');
      assert.equal(staleAttempt.workspace_locator.domain_source_fingerprint, 'source-gate-clearing-stale');
      assert.equal(attempts.length, 2);
    });
  } finally {
    db.close();
  }
});

test('family-runtime enqueue preserves MAS gate-clearing default executor handoff while same study attempt is live', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const livePayload = {
        ...defaultExecutorPayload('source-writer-live'),
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      };
      const gatePayload = gateClearingDefaultExecutorPayload('source-gate-clearing-current');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-live-writer-before-gate',
        payload: livePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_quality_repair_batch:writer-live',
      });
      db.prepare("UPDATE tasks SET status = 'running' WHERE task_id = ?").run(
        'task-mas-default-live-writer-before-gate',
      );
      const liveRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-live-writer-before-gate',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const liveAttempt = ensureProviderHostedStageAttempt(db, liveRow, livePayload);
      assert.ok(liveAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        liveAttempt.stage_attempt_id,
      );

      const enqueue = enqueueTask(db, {
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: gatePayload,
        dedupeKey: 'mas:dm-cvd:003:default-executor:run_gate_clearing_batch:admission',
        source: 'test-domain-export',
      });
      const queuedTask = db.prepare(`
        SELECT status, payload_json
        FROM tasks
        WHERE task_id = ?
      `).get(enqueue.task?.task_id) as { status: string; payload_json: string } | undefined;

      assert.equal(enqueue.accepted, true);
      assert.equal(queuedTask?.status, 'queued');
      assert.equal(parseJsonText(queuedTask?.payload_json ?? '{}').next_executable_owner, 'gate_clearing_batch');
    });
  } finally {
    db.close();
  }
});
