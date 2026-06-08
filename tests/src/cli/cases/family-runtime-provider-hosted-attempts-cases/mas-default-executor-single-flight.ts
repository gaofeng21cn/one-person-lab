import { DatabaseSync } from 'node:sqlite';
import { WorkflowNotFoundError } from '@temporalio/common';

import {
  assert,
  test,
} from './helpers.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  defaultExecutorPayloadForOwner,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-single-flight-helpers.ts';

import { startDefaultExecutorStageAttempt } from '../../../../../src/family-runtime-default-executor-start.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/family-runtime-provider-hosted-attempts.ts';
import { familyRuntimePaths } from '../../../../../src/family-runtime-store.ts';
import {
  listStageAttemptsForTask,
} from '../../../../../src/family-runtime-stage-attempts.ts';
import { enqueueTask } from '../../../../../src/family-runtime-enqueue.ts';

function readinessPayloadWithStageNativeAnswer(sourceFingerprint: string) {
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    action_type: 'complete_medical_paper_readiness_surface',
    dispatch_authority: 'consumer_default_executor_dispatch',
    next_executable_owner: 'MedAutoScience',
    domain_owner: 'MedAutoScience',
    work_unit_id: 'complete_medical_paper_readiness_surface',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/complete_medical_paper_readiness_surface/readiness.json',
    owner_route_currentness_basis: {
      work_unit_id: 'complete_medical_paper_readiness_surface',
      work_unit_fingerprint: 'stage-current-owner-delta::complete_medical_paper_readiness_surface::authoring_runtime_authorization::/tmp/dm-cvd/studies/002-dm-china-us-mortality-attribution/artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
    },
  };
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
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, firstRow, firstPayload);
      assert.ok(firstAttempt);
      assert.equal(firstAttempt.status, 'queued');
      assert.equal(firstAttempt.provider_run.provider_status, 'registered');

      const secondAttempt = ensureProviderHostedStageAttempt(db, secondRow, secondPayload);
      let temporalStartCount = 0;
      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
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

test('family-runtime does not treat a stale-source claimed queued MAS default executor admission as cross-task live', async () => {
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
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, firstRow, firstPayload);
      assert.ok(firstAttempt);
      assert.equal(firstAttempt.status, 'queued');
      assert.equal(firstAttempt.provider_run.provider_status, 'registered');

      const secondAttempt = ensureProviderHostedStageAttempt(db, secondRow, secondPayload);
      let temporalStartCount = 0;
      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
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

test('family-runtime keeps MAS default executor admission single-flight across same-source task rows', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const firstPayload = defaultExecutorPayload('source-current');
      const secondPayload = defaultExecutorPayload('source-current');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-cross-task-same-source-first',
        payload: firstPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:same-source-first',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-cross-task-same-source-second',
        payload: secondPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:same-source-second',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id IN (?, ?)").run(
        'task-mas-default-cross-task-same-source-first',
        'task-mas-default-cross-task-same-source-second',
      );
      const firstRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-same-source-first',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const secondRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-cross-task-same-source-second',
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, firstRow, firstPayload);
      assert.ok(firstAttempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        firstAttempt.stage_attempt_id,
      );
      const secondAttempt = ensureProviderHostedStageAttempt(db, secondRow, secondPayload);
      let temporalStartCount = 0;

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
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
        'task-mas-default-cross-task-same-source-second',
      ) as { status: string; attempts: number };
      const secondAttempts = listStageAttemptsForTask(db, 'task-mas-default-cross-task-same-source-second');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-cross-task-same-source-second') as { payload_json: string } | undefined;

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

test('family-runtime enqueue preserves a newer MAS default executor dispatch while a live attempt is running', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const runningPayload = defaultExecutorPayload('source-before');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-live-running-before-enqueue',
        payload: runningPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:source-before',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'running', attempts = 1, lease_owner = 'opl-family-runtime:test',
          lease_expires_at = ?
        WHERE task_id = ?
      `).run(
        new Date(Date.now() + 60_000).toISOString(),
        'task-mas-default-live-running-before-enqueue',
      );
      const runningRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-live-running-before-enqueue',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const runningAttempt = ensureProviderHostedStageAttempt(db, runningRow, runningPayload);
      assert.ok(runningAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(runningAttempt.stage_attempt_id);

      const result = enqueueTask(db, {
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: {
          ...defaultExecutorPayload('source-after'),
          dispatch_authority: 'consumer_default_executor_dispatch',
        },
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:source-after',
        priority: 65,
        source: 'test-domain-export',
      });
      const tasks = db.prepare(`
        SELECT task_id, status, payload_json, lease_expires_at
        FROM tasks
        ORDER BY created_at ASC
      `).all() as Array<{
        task_id: string;
        status: string;
        payload_json: string;
        lease_expires_at: string | null;
      }>;
      const noopEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_dispatch_enqueue_noop'
        LIMIT 1
      `).get('task-mas-default-live-running-before-enqueue') as { payload_json: string } | undefined;
      const deferredEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_dispatch_enqueue_deferred'
        LIMIT 1
      `).get(result.task?.task_id) as { payload_json: string } | undefined;

      assert.equal(result.accepted, true);
      assert.equal(result.idempotent_noop, false);
      assert.notEqual(result.task?.task_id, 'task-mas-default-live-running-before-enqueue');
      assert.equal(tasks.length, 2);
      assert.equal(tasks[0].status, 'running');
      assert.equal(JSON.parse(tasks[0].payload_json).source_fingerprint, 'source-before');
      assert.equal(tasks[1].status, 'queued');
      assert.equal(JSON.parse(tasks[1].payload_json).source_fingerprint, 'source-after');
      assert.ok(tasks[0].lease_expires_at);
      assert.ok(Date.parse(tasks[0].lease_expires_at) > Date.now());
      assert.ok(noopEvent);
      assert.equal(JSON.parse(noopEvent.payload_json).candidate_source_fingerprint, 'source-after');
      assert.equal(JSON.parse(noopEvent.payload_json).stage_attempt_id, runningAttempt.stage_attempt_id);
      assert.ok(deferredEvent);
      assert.equal(JSON.parse(deferredEvent.payload_json).candidate_source_fingerprint, 'source-after');
      assert.equal(JSON.parse(deferredEvent.payload_json).stage_attempt_id, runningAttempt.stage_attempt_id);
    });
  } finally {
    db.close();
  }
});

test('family-runtime admits current write repair after live readiness attempt has Stage Native typed blocker answer', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const readinessPayload = readinessPayloadWithStageNativeAnswer('readiness-source-with-stage-answer');
      const writePayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'stage-native-next-action::08-publication_package_handoff::run_quality_repair_batch::artifacts/reports/medical_publication_surface/latest.json',
        actionType: 'run_quality_repair_batch',
        nextOwner: 'write',
        dispatchAuthority: 'quality_repair_batch_writer_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/writer-after-readiness-answer.json',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-live-readiness-stage-answer',
        payload: readinessPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:live-stage-answer',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-writer-after-readiness-stage-answer',
        payload: writePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:writer-after-readiness-stage-answer',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'running', attempts = 1, lease_owner = 'opl-family-runtime:test',
          lease_expires_at = ?
        WHERE task_id = ?
      `).run(
        new Date(Date.now() + 60_000).toISOString(),
        'task-mas-default-live-readiness-stage-answer',
      );
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-writer-after-readiness-stage-answer',
      );
      const readinessRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-live-readiness-stage-answer',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const writerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-writer-after-readiness-stage-answer',
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const readinessAttempt = ensureProviderHostedStageAttempt(db, readinessRow, readinessPayload);
      assert.ok(readinessAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(readinessAttempt.stage_attempt_id);

      const writerAttempt = ensureProviderHostedStageAttempt(db, writerRow, writePayload);
      let temporalStartCount = 0;
      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row: writerRow,
        payload: writePayload,
        providerHostedAttempt: writerAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
      });
      const writerTask = db.prepare('SELECT status, attempts FROM tasks WHERE task_id = ?').get(
        'task-mas-default-writer-after-readiness-stage-answer',
      ) as { status: string; attempts: number };
      const writerAttempts = listStageAttemptsForTask(db, 'task-mas-default-writer-after-readiness-stage-answer');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-writer-after-readiness-stage-answer') as { payload_json: string } | undefined;

      assert.ok(writerAttempt);
      assert.equal(result.status, 'running');
      assert.equal(temporalStartCount, 1);
      assert.equal(writerTask.status, 'running');
      assert.equal(writerTask.attempts, 1);
      assert.equal(writerAttempts.length, 1);
      assert.equal(writerAttempts[0].status, 'running');
      assert.equal(skipEvent, undefined);
    });
  } finally {
    db.close();
  }
});

test('family-runtime keeps MAS default executor admission single-flight across same-study owner tasks', async () => {
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
      const writePayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'writer-source',
        actionType: 'run_quality_repair_batch',
        nextOwner: 'write',
        dispatchAuthority: 'quality_repair_batch_writer_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/writer.json',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-same-study-reviewer-live',
        payload: reviewerPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:reviewer-live',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-same-study-writer-candidate',
        payload: writePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:writer-candidate',
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id IN (?, ?)").run(
        'task-mas-default-same-study-reviewer-live',
        'task-mas-default-same-study-writer-candidate',
      );
      const reviewerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-reviewer-live',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const writerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-writer-candidate',
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const reviewerAttempt = ensureProviderHostedStageAttempt(db, reviewerRow, reviewerPayload);
      assert.ok(reviewerAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(reviewerAttempt.stage_attempt_id);
      const writerAttempt = ensureProviderHostedStageAttempt(db, writerRow, writePayload);
      let temporalStartCount = 0;

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row: writerRow,
        payload: writePayload,
        providerHostedAttempt: writerAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
      });
      const writerTask = db.prepare('SELECT status, attempts FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-writer-candidate',
      ) as { status: string; attempts: number };
      const writerAttempts = listStageAttemptsForTask(db, 'task-mas-default-same-study-writer-candidate');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-same-study-writer-candidate') as { payload_json: string } | undefined;

      assert.equal(result.status, 'skipped');
      assert.equal(result.reason, 'live_stage_attempt_exists_for_study');
      assert.equal(temporalStartCount, 0);
      assert.equal(writerTask.status, 'queued');
      assert.equal(writerTask.attempts, 0);
      assert.equal(writerAttempts.length, 0);
      assert.ok(skipEvent);
      const skipPayload = JSON.parse(skipEvent.payload_json);
      assert.equal(skipPayload.reason, 'live_stage_attempt_exists_for_study');
      assert.equal(skipPayload.stage_attempt_id, reviewerAttempt.stage_attempt_id);
      assert.equal(skipPayload.live_action_type, 'return_to_ai_reviewer_workflow');
      assert.equal(skipPayload.candidate_action_type, 'run_quality_repair_batch');
    });
  } finally {
    db.close();
  }
});

test('family-runtime treats claimed same-study reviewer admission window as live before provider start', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const reviewerPayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'reviewer-source-admission-window',
        actionType: 'return_to_ai_reviewer_workflow',
        nextOwner: 'ai_reviewer',
        dispatchAuthority: 'ai_reviewer_record_production_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/reviewer-admission-window.json',
      });
      const writePayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'writer-source-during-reviewer-admission',
        actionType: 'run_quality_repair_batch',
        nextOwner: 'write',
        dispatchAuthority: 'quality_repair_batch_writer_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/writer-during-reviewer-admission.json',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-same-study-reviewer-claimed-before-provider-start',
        payload: reviewerPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:reviewer-claimed-before-provider-start',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-same-study-writer-during-reviewer-admission',
        payload: writePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:writer-during-reviewer-admission',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'running', attempts = 1, lease_owner = 'opl-family-runtime:test',
          lease_expires_at = ?
        WHERE task_id = ?
      `).run(
        new Date(Date.now() + 60_000).toISOString(),
        'task-mas-default-same-study-reviewer-claimed-before-provider-start',
      );
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-same-study-writer-during-reviewer-admission',
      );
      const reviewerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-reviewer-claimed-before-provider-start',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const writerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-writer-during-reviewer-admission',
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const reviewerAttempt = ensureProviderHostedStageAttempt(db, reviewerRow, reviewerPayload);
      assert.ok(reviewerAttempt);
      assert.equal(reviewerAttempt.status, 'queued');
      assert.equal(reviewerAttempt.provider_run.provider_status, 'registered');
      const writerAttempt = ensureProviderHostedStageAttempt(db, writerRow, writePayload);
      let temporalStartCount = 0;

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row: writerRow,
        payload: writePayload,
        providerHostedAttempt: writerAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
      });
      const writerTask = db.prepare('SELECT status, attempts FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-writer-during-reviewer-admission',
      ) as { status: string; attempts: number };
      const writerAttempts = listStageAttemptsForTask(db, 'task-mas-default-same-study-writer-during-reviewer-admission');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-same-study-writer-during-reviewer-admission') as { payload_json: string } | undefined;

      assert.equal(result.status, 'skipped');
      assert.equal(result.reason, 'live_stage_attempt_exists_for_study');
      assert.equal(temporalStartCount, 0);
      assert.equal(writerTask.status, 'queued');
      assert.equal(writerTask.attempts, 0);
      assert.equal(writerAttempts.length, 0);
      assert.ok(skipEvent);
      const skipPayload = JSON.parse(skipEvent.payload_json);
      assert.equal(skipPayload.reason, 'live_stage_attempt_exists_for_study');
      assert.equal(skipPayload.stage_attempt_id, reviewerAttempt.stage_attempt_id);
      assert.equal(skipPayload.live_action_type, 'return_to_ai_reviewer_workflow');
      assert.equal(skipPayload.candidate_action_type, 'run_quality_repair_batch');
    });
  } finally {
    db.close();
  }
});

test('family-runtime enqueue preserves MAS default executor same-study owner tasks while deferring launch', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const reviewerPayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'reviewer-source',
        actionType: 'return_to_ai_reviewer_workflow',
        nextOwner: 'ai_reviewer',
        dispatchAuthority: 'ai_reviewer_record_production_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/reviewer.json',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-live-reviewer-before-writer-enqueue',
        payload: reviewerPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:reviewer-live-before-enqueue',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'running', attempts = 1, lease_owner = 'opl-family-runtime:test',
          lease_expires_at = ?
        WHERE task_id = ?
      `).run(
        new Date(Date.now() + 60_000).toISOString(),
        'task-mas-default-live-reviewer-before-writer-enqueue',
      );
      const reviewerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-live-reviewer-before-writer-enqueue',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const reviewerAttempt = ensureProviderHostedStageAttempt(db, reviewerRow, reviewerPayload);
      assert.ok(reviewerAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(reviewerAttempt.stage_attempt_id);

      const result = enqueueTask(db, {
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload: defaultExecutorPayloadForOwner({
          sourceFingerprint: 'writer-source',
          actionType: 'run_quality_repair_batch',
          nextOwner: 'write',
          dispatchAuthority: 'quality_repair_batch_writer_handoff',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/writer.json',
        }),
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:writer-enqueue',
        priority: 65,
        source: 'test-domain-export',
      });
      const tasks = db.prepare(`
        SELECT task_id, status
        FROM tasks
        ORDER BY created_at ASC
      `).all() as Array<{ task_id: string; status: string }>;
      const noopEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_dispatch_enqueue_noop'
        LIMIT 1
      `).get('task-mas-default-live-reviewer-before-writer-enqueue') as { payload_json: string } | undefined;
      const deferredEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_dispatch_enqueue_deferred'
        LIMIT 1
      `).get(result.task?.task_id) as { payload_json: string } | undefined;

      assert.equal(result.accepted, true);
      assert.equal(result.idempotent_noop, false);
      assert.notEqual(result.task?.task_id, 'task-mas-default-live-reviewer-before-writer-enqueue');
      assert.equal(tasks.length, 2);
      assert.equal(tasks[0].status, 'running');
      assert.equal(tasks[1].status, 'queued');
      assert.ok(noopEvent);
      const noopPayload = JSON.parse(noopEvent.payload_json);
      assert.equal(noopPayload.reason, 'same_study_live_stage_attempt_exists_at_enqueue');
      assert.equal(noopPayload.live_action_type, 'return_to_ai_reviewer_workflow');
      assert.equal(noopPayload.action_type, 'run_quality_repair_batch');
      assert.equal(noopPayload.stage_attempt_id, reviewerAttempt.stage_attempt_id);
      assert.ok(deferredEvent);
      const deferredPayload = JSON.parse(deferredEvent.payload_json);
      assert.equal(deferredPayload.reason, 'same_study_live_stage_attempt_exists_at_enqueue');
      assert.equal(deferredPayload.live_action_type, 'return_to_ai_reviewer_workflow');
      assert.equal(deferredPayload.action_type, 'run_quality_repair_batch');
      assert.equal(deferredPayload.stage_attempt_id, reviewerAttempt.stage_attempt_id);
    });
  } finally {
    db.close();
  }
});

test('family-runtime syncs terminal same-task MAS default executor attempt before live skip', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const payload = defaultExecutorPayload('source-terminal-before-live-skip');
      const taskId = 'task-mas-default-same-task-terminal-sync';
      insertSucceededTask(db, {
        taskId,
        payload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:same-task-terminal-sync',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'running', attempts = 1, lease_owner = 'opl-family-runtime:stale',
          lease_expires_at = ?
        WHERE task_id = ?
      `).run(new Date(Date.now() + 60_000).toISOString(), taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof startDefaultExecutorStageAttempt
      >[2]['row'];
      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(attempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        attempt.stage_attempt_id,
      );

      let temporalStartCount = 0;
      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row,
        payload,
        providerHostedAttempt: null,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
        queryTemporalStageAttemptReadModel: async () => ({
          surface_kind: 'temporal_stage_attempt_query_receipt',
          provider_kind: 'temporal',
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          run_id: 'test-run',
          workflow_status: 'FAILED',
          query_error: {
            code: 'temporal_stage_attempt_query_unavailable_after_terminal',
            message: 'Temporal workflow is already FAILED; terminal failure is sufficient for provider sync.',
          },
          authority_boundary: {
            opl: 'temporal_workflow_transport_and_control_metadata_only',
            domain: 'truth_quality_artifact_gate_owner',
          },
        }),
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
      const syncedAttempt = listStageAttemptsForTask(db, taskId)[0];
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get(taskId) as { payload_json: string } | undefined;

      assert.equal(result.status, 'blocked');
      assert.equal(result.reason, 'temporal_stage_attempt_failed');
      assert.equal(temporalStartCount, 0);
      assert.equal(task.status, 'blocked');
      assert.equal(task.last_error, 'temporal_workflow_failed');
      assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_failed');
      assert.equal(task.lease_owner, null);
      assert.equal(task.lease_expires_at, null);
      assert.equal(syncedAttempt.status, 'failed');
      assert.equal(syncedAttempt.blocked_reason, 'temporal_workflow_failed');
      assert.equal(skipEvent, undefined);
    });
  } finally {
    db.close();
  }
});

test('family-runtime syncs missing same-task MAS default executor workflow before live skip', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const payload = defaultExecutorPayload('source-missing-workflow-before-live-skip');
      const taskId = 'task-mas-default-same-task-missing-workflow-sync';
      insertSucceededTask(db, {
        taskId,
        payload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:same-task-missing-workflow-sync',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'queued', attempts = 1
        WHERE task_id = ?
      `).run(taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof startDefaultExecutorStageAttempt
      >[2]['row'];
      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(attempt);
      db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
        attempt.stage_attempt_id,
      );

      let rawQueryCount = 0;
      let safeQueryCount = 0;
      let temporalStartCount = 0;
      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row,
        payload,
        providerHostedAttempt: null,
        temporalProviderModule: async () => ({
          queryTemporalStageAttemptWorkflow: async () => {
            rawQueryCount += 1;
            throw new WorkflowNotFoundError(
              `workflow not found for ID: ${attempt.workflow_id}`,
              attempt.workflow_id,
              undefined,
            );
          },
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
        queryTemporalStageAttemptReadModel: async (observedAttempt) => {
          safeQueryCount += 1;
          return {
            surface_kind: 'temporal_stage_attempt_query_unavailable',
            provider_kind: 'temporal',
            stage_attempt_id: observedAttempt.stage_attempt_id,
            workflow_id: observedAttempt.workflow_id,
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
      const syncedAttempt = listStageAttemptsForTask(db, taskId)[0];
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get(taskId) as { payload_json: string } | undefined;

      assert.equal(rawQueryCount, 0);
      assert.equal(safeQueryCount, 1);
      assert.equal(result.status, 'blocked');
      assert.equal(result.reason, 'temporal_stage_attempt_start_failed');
      assert.equal(temporalStartCount, 0);
      assert.equal(task.status, 'blocked');
      assert.equal(task.last_error, 'temporal_workflow_not_started_or_not_found');
      assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_start_failed');
      assert.equal(task.lease_owner, null);
      assert.equal(task.lease_expires_at, null);
      assert.equal(syncedAttempt.status, 'failed');
      assert.equal(syncedAttempt.blocked_reason, 'temporal_workflow_not_started_or_not_found');
      assert.equal(skipEvent, undefined);
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
        typeof startDefaultExecutorStageAttempt
      >[2]['row'];
      const providerHostedAttempt = ensureProviderHostedStageAttempt(db, row, basePayload);
      assert.ok(providerHostedAttempt);

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
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
