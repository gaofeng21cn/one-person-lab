import { DatabaseSync } from 'node:sqlite';
import { WorkflowNotFoundError } from '@temporalio/common';

import {
  assert,
  fs,
  os,
  path,
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
import type { TemporalStageAttemptWorkflowState } from '../../../../../src/family-runtime-temporal.ts';

type QueryTemporalStageAttemptReadModel = NonNullable<
  Parameters<typeof startDefaultExecutorStageAttempt>[2]['queryTemporalStageAttemptReadModel']
>;
type TemporalStageAttemptReadModelObservation = Awaited<ReturnType<QueryTemporalStageAttemptReadModel>>;

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

function writeRepairPayloadWithCurrentnessBasisOnly() {
  const workUnitFingerprint = 'stage-native-next-action::08-publication_package_handoff::run_quality_repair_batch::artifacts/reports/medical_publication_surface/latest.json';
  const payload = defaultExecutorPayloadForOwner({
    sourceFingerprint: workUnitFingerprint,
    actionType: 'run_quality_repair_batch',
    nextOwner: 'write',
    dispatchAuthority: 'quality_repair_batch_writer_handoff',
    dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
  });
  delete (payload as Record<string, unknown>).dispatch_ref;
  delete (payload as Record<string, unknown>).source_fingerprint;
  return {
    ...payload,
    repeat_suppression_key: workUnitFingerprint,
    owner_route: {
      current_owner: 'mas_controller',
      source_fingerprint: workUnitFingerprint,
      currentness_contract: {
        fail_closed_when_missing: true,
        basis: {
          work_unit_id: 'run_quality_repair_batch',
          work_unit_fingerprint: workUnitFingerprint,
          truth_epoch: 'stage-native-next-action::002-dm-china-us-mortality-attribution::08-publication_package_handoff',
          runtime_health_epoch: 'stage-native-next-action::002-dm-china-us-mortality-attribution::08-publication_package_handoff::health',
        },
      },
    },
    progress_first_closeout_admission: {
      admission_status: 'ready',
      export_new_default_executor_task: true,
      immutable_dispatch_packet: null,
    },
  };
}

function completedTemporalObservation(input: {
  stageAttemptId: string;
  workflowId: string;
  closeoutRefs: string[];
  nextOwner?: string;
}): TemporalStageAttemptReadModelObservation {
  const closeoutPacket = {
    surface_kind: 'domain_stage_closeout_packet',
    closeout_refs: input.closeoutRefs,
    consumed_refs: ['dispatch:dm-cvd/default-executor'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: input.nextOwner ?? 'medautoscience',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {},
  };
  const query = {
    surface_kind: 'temporal_stage_attempt_query',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    domain_id: 'medautoscience',
    stage_id: 'domain_owner/default-executor-dispatch',
    status: 'completed',
    started_at: '2026-06-11T00:00:00.000Z',
    updated_at: '2026-06-11T00:01:00.000Z',
    activity_events: [],
    stage_progress_log: {
      surface_kind: 'temporal_workflow_stage_progress_log',
      planned_work: {},
      timeline: [],
      visibility: {},
    },
    checkpoint_refs: [],
    closeout_refs: input.closeoutRefs,
    consumed_refs: ['dispatch:dm-cvd/default-executor'],
    consumed_memory_refs: [],
    writeback_receipt_refs: [],
    rejected_writes: [],
    next_owner: input.nextOwner ?? 'medautoscience',
    route_impact: {},
    human_gate_refs: [],
    signals: [],
    closeout_packet: closeoutPacket,
    completion_boundary: {
      provider_completion: 'completed',
      domain_ready_verdict: 'domain_gate_pending',
      provider_completion_is_domain_ready: false,
    },
    authority_boundary: {
      opl: 'temporal_workflow_transport_and_control_metadata_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  } satisfies TemporalStageAttemptWorkflowState;
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    run_id: 'test-terminal-run',
    workflow_status: 'COMPLETED',
    query_source: 'test_completed_temporal_observation',
    query,
    authority_boundary: {
      opl: 'temporal_workflow_transport_and_control_metadata_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

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
      assert.equal(firstAttempt.workspace_locator.source_eval_id, 'source-current');
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
      assert.equal(noopEvent, undefined);
      assert.equal(deferredEvent, undefined);
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

test('family-runtime admits MAS current write repair when dispatch identity lives in currentness basis', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const readinessPayload = readinessPayloadWithStageNativeAnswer('readiness-source-with-stage-answer');
      const writePayload = writeRepairPayloadWithCurrentnessBasisOnly();
      insertSucceededTask(db, {
        taskId: 'task-mas-default-live-readiness-stage-answer-for-currentness-only',
        payload: readinessPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:live-stage-answer-currentness-only',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-writer-currentness-only',
        payload: writePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:currentness-only',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'running', attempts = 1, lease_owner = 'opl-family-runtime:test',
          lease_expires_at = ?
        WHERE task_id = ?
      `).run(
        new Date(Date.now() + 60_000).toISOString(),
        'task-mas-default-live-readiness-stage-answer-for-currentness-only',
      );
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-writer-currentness-only',
      );
      const readinessRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-live-readiness-stage-answer-for-currentness-only',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const writerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-writer-currentness-only',
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
      const writerAttempts = listStageAttemptsForTask(db, 'task-mas-default-writer-currentness-only');
      const writerTask = db.prepare('SELECT status, attempts FROM tasks WHERE task_id = ?').get(
        'task-mas-default-writer-currentness-only',
      ) as { status: string; attempts: number };
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-writer-currentness-only') as { payload_json: string } | undefined;

      assert.ok(writerAttempt);
      assert.equal(writerAttempt.executor_kind, 'codex_cli');
      assert.equal(writerAttempt.workspace_locator.action_type, 'run_quality_repair_batch');
      assert.equal(
        writerAttempt.workspace_locator.domain_source_fingerprint,
        (writePayload.owner_route as { source_fingerprint: string }).source_fingerprint,
      );
      assert.deepEqual(writerAttempt.checkpoint_refs, []);
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

test('family-runtime syncs terminal same-study attempt before live owner-task skip', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const reviewerPayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'reviewer-source-terminal-before-writer',
        actionType: 'return_to_ai_reviewer_workflow',
        nextOwner: 'ai_reviewer',
        dispatchAuthority: 'ai_reviewer_record_production_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/return_to_ai_reviewer_workflow/reviewer-terminal.json',
      });
      const writePayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'writer-source-after-reviewer-terminal',
        actionType: 'run_quality_repair_batch',
        nextOwner: 'write',
        dispatchAuthority: 'quality_repair_batch_writer_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/writer-after-terminal.json',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-same-study-reviewer-terminal-before-writer',
        payload: reviewerPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:reviewer-terminal-before-writer',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-same-study-writer-after-reviewer-terminal',
        payload: writePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:writer-after-reviewer-terminal',
      });
      db.prepare(`
        UPDATE tasks
        SET status = 'running', attempts = 1, lease_owner = 'opl-family-runtime:stale',
          lease_expires_at = ?
        WHERE task_id = ?
      `).run(
        new Date(Date.now() + 60_000).toISOString(),
        'task-mas-default-same-study-reviewer-terminal-before-writer',
      );
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-same-study-writer-after-reviewer-terminal',
      );
      const reviewerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-reviewer-terminal-before-writer',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const writerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-writer-after-reviewer-terminal',
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
      let queryCount = 0;

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row: writerRow,
        payload: writePayload,
        providerHostedAttempt: writerAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async (attempt) => {
            temporalStartCount += 1;
            return {
              surface_kind: 'temporal_stage_attempt_start_receipt',
              provider_kind: 'temporal',
              stage_attempt_id: attempt.stage_attempt_id,
              workflow_id: attempt.workflow_id,
              first_execution_run_id: 'writer-run-after-reviewer-terminal',
            };
          },
        }),
        queryTemporalStageAttemptReadModel: async (attempt) => {
          queryCount += 1;
          assert.equal(attempt.stage_attempt_id, reviewerAttempt.stage_attempt_id);
          return completedTemporalObservation({
            stageAttemptId: reviewerAttempt.stage_attempt_id,
            workflowId: reviewerAttempt.workflow_id,
            closeoutRefs: ['receipt:dm003/reviewer-terminal'],
            nextOwner: 'write',
          });
        },
      });
      const reviewerTask = db.prepare('SELECT status, lease_owner, lease_expires_at FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-reviewer-terminal-before-writer',
      ) as { status: string; lease_owner: string | null; lease_expires_at: string | null };
      const writerTask = db.prepare('SELECT status, attempts FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-writer-after-reviewer-terminal',
      ) as { status: string; attempts: number };
      const reviewerAttempts = listStageAttemptsForTask(db, 'task-mas-default-same-study-reviewer-terminal-before-writer');
      const writerAttempts = listStageAttemptsForTask(db, 'task-mas-default-same-study-writer-after-reviewer-terminal');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-same-study-writer-after-reviewer-terminal') as { payload_json: string } | undefined;

      assert.equal(queryCount, 1);
      assert.equal(result.status, 'running');
      assert.equal(temporalStartCount, 1);
      assert.equal(reviewerTask.status, 'succeeded');
      assert.equal(reviewerTask.lease_owner, null);
      assert.equal(reviewerTask.lease_expires_at, null);
      assert.equal(writerTask.status, 'running');
      assert.equal(writerTask.attempts, 1);
      assert.equal(reviewerAttempts.length, 1);
      assert.equal(reviewerAttempts[0].status, 'completed');
      assert.equal(reviewerAttempts[0].closeout_receipt_status, 'accepted_typed_closeout');
      assert.equal(writerAttempts.length, 1);
      assert.equal(writerAttempts[0].status, 'running');
      assert.equal(skipEvent, undefined);
    });
  } finally {
    db.close();
  }
});
