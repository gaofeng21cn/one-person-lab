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

test('family-runtime does not let stale same-study action attempt block fresh StageRun identity', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const stalePayload = {
        ...defaultExecutorPayload('stale-source'),
        work_unit_id: 'gate-replay',
        work_unit_fingerprint: 'stale-work-unit-fp',
        idempotency_key: 'provider-admission::dm002::stale',
        owner_route: {
          source_refs: {
            owner_route_currentness_basis: {
              work_unit_id: 'gate-replay',
              work_unit_fingerprint: 'stale-work-unit-fp',
              truth_epoch: 'truth-stale',
              runtime_health_epoch: 'runtime-stale',
              source_eval_id: 'publication-eval::stale',
            },
          },
        },
      };
      const freshPayload = {
        ...defaultExecutorPayload('fresh-source'),
        work_unit_id: 'gate-replay',
        work_unit_fingerprint: 'fresh-work-unit-fp',
        idempotency_key: 'provider-admission::dm002::fresh',
        owner_route: {
          source_refs: {
            owner_route_currentness_basis: {
              work_unit_id: 'gate-replay',
              work_unit_fingerprint: 'fresh-work-unit-fp',
              truth_epoch: 'truth-fresh',
              runtime_health_epoch: 'runtime-fresh',
              source_eval_id: 'publication-eval::fresh',
            },
          },
        },
      };
      insertSucceededTask(db, {
        taskId: 'task-mas-default-stale-stage-run-first',
        payload: stalePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:stale-stage-run-first',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-fresh-stage-run-second',
        payload: freshPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:fresh-stage-run-second',
      });
      db.prepare("UPDATE tasks SET status = 'running', attempts = 1 WHERE task_id = ?").run(
        'task-mas-default-stale-stage-run-first',
      );
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-fresh-stage-run-second',
      );
      const firstRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-stale-stage-run-first',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const secondRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-fresh-stage-run-second',
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, firstRow, stalePayload);
      assert.ok(firstAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(firstAttempt.stage_attempt_id);
      const secondAttempt = ensureProviderHostedStageAttempt(db, secondRow, freshPayload);
      let temporalStartCount = 0;
      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row: secondRow,
        payload: freshPayload,
        providerHostedAttempt: secondAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
      });
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-fresh-stage-run-second') as { payload_json: string } | undefined;

      assert.ok(secondAttempt);
      assert.equal(result.status, 'running');
      assert.equal(temporalStartCount, 1);
      assert.equal(skipEvent, undefined);
    });
  } finally {
    db.close();
  }
});

test('family-runtime syncs a terminal same-dispatch MAS default executor attempt before deciding to skip', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const firstPayload = defaultExecutorPayload('source-current');
      const secondPayload = defaultExecutorPayload('source-current');
      insertSucceededTask(db, {
        taskId: 'task-mas-default-same-dispatch-terminal-first',
        payload: firstPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:same-dispatch-terminal-first',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-same-dispatch-terminal-second',
        payload: secondPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:same-dispatch-terminal-second',
      });
      db.prepare("UPDATE tasks SET status = 'running', attempts = 1 WHERE task_id = ?").run(
        'task-mas-default-same-dispatch-terminal-first',
      );
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-same-dispatch-terminal-second',
      );
      const firstRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-dispatch-terminal-first',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const secondRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-dispatch-terminal-second',
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const firstAttempt = ensureProviderHostedStageAttempt(db, firstRow, firstPayload);
      assert.ok(firstAttempt);
      assert.equal(firstAttempt.workspace_locator.source_eval_id, 'source-current');
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(firstAttempt.stage_attempt_id);
      const blockedSecondAttempt = ensureProviderHostedStageAttempt(db, secondRow, secondPayload);
      let temporalStartCount = 0;

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row: secondRow,
        payload: secondPayload,
        providerHostedAttempt: blockedSecondAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
        queryTemporalStageAttemptReadModel: async (attempt) => completedTemporalObservation({
          stageAttemptId: attempt.stage_attempt_id,
          workflowId: attempt.workflow_id,
          closeoutRefs: ['receipt:dm002/same-dispatch-terminal-closeout'],
        }),
      });
      const firstTask = db.prepare('SELECT status, last_error FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-dispatch-terminal-first',
      ) as { status: string; last_error: string | null };
      const [syncedFirstAttempt] = listStageAttemptsForTask(db, 'task-mas-default-same-dispatch-terminal-first');
      const secondTask = db.prepare('SELECT status, attempts FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-dispatch-terminal-second',
      ) as { status: string; attempts: number };
      const secondAttempts = listStageAttemptsForTask(db, 'task-mas-default-same-dispatch-terminal-second');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-same-dispatch-terminal-second') as { payload_json: string } | undefined;

      assert.equal(blockedSecondAttempt, null);
      assert.equal(firstTask.status, 'succeeded');
      assert.equal(firstTask.last_error, null);
      assert.equal(syncedFirstAttempt.status, 'completed');
      assert.equal(syncedFirstAttempt.closeout_receipt_status, 'accepted_typed_closeout');
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

test('family-runtime syncs a terminal same-study MAS default executor attempt before deciding to skip', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const reviewerPayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'reviewer-source-current',
        actionType: 'return_to_ai_reviewer_workflow',
        nextOwner: 'ai_reviewer',
        dispatchAuthority: 'ai_reviewer_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
      });
      const writePayload = defaultExecutorPayloadForOwner({
        sourceFingerprint: 'writer-source-after-reviewer',
        actionType: 'run_quality_repair_batch',
        nextOwner: 'write',
        dispatchAuthority: 'quality_repair_batch_writer_handoff',
        dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-same-study-terminal-reviewer',
        payload: reviewerPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:same-study-terminal',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-same-study-terminal-writer',
        payload: writePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:after-reviewer-terminal',
      });
      db.prepare("UPDATE tasks SET status = 'running', attempts = 1 WHERE task_id = ?").run(
        'task-mas-default-same-study-terminal-reviewer',
      );
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-same-study-terminal-writer',
      );
      const reviewerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-terminal-reviewer',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const writerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-terminal-writer',
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const reviewerAttempt = ensureProviderHostedStageAttempt(db, reviewerRow, reviewerPayload);
      assert.ok(reviewerAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(reviewerAttempt.stage_attempt_id);
      const blockedWriterAttempt = ensureProviderHostedStageAttempt(db, writerRow, writePayload);
      let temporalStartCount = 0;

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row: writerRow,
        payload: writePayload,
        providerHostedAttempt: blockedWriterAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
        queryTemporalStageAttemptReadModel: async (attempt) => completedTemporalObservation({
          stageAttemptId: attempt.stage_attempt_id,
          workflowId: attempt.workflow_id,
          closeoutRefs: ['receipt:dm002/same-study-reviewer-terminal-closeout'],
          nextOwner: 'write',
        }),
      });
      const reviewerTask = db.prepare('SELECT status, last_error FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-terminal-reviewer',
      ) as { status: string; last_error: string | null };
      const [syncedReviewerAttempt] = listStageAttemptsForTask(db, 'task-mas-default-same-study-terminal-reviewer');
      const writerTask = db.prepare('SELECT status, attempts FROM tasks WHERE task_id = ?').get(
        'task-mas-default-same-study-terminal-writer',
      ) as { status: string; attempts: number };
      const writerAttempts = listStageAttemptsForTask(db, 'task-mas-default-same-study-terminal-writer');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-same-study-terminal-writer') as { payload_json: string } | undefined;

      assert.equal(blockedWriterAttempt, null);
      assert.equal(reviewerTask.status, 'succeeded');
      assert.equal(reviewerTask.last_error, null);
      assert.equal(syncedReviewerAttempt.status, 'completed');
      assert.equal(syncedReviewerAttempt.closeout_receipt_status, 'accepted_typed_closeout');
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

test('family-runtime consumes same-attempt materialized MAS closeout before same-study live skip', async () => {
  const db = new DatabaseSync(':memory:');
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-mas-materialized-closeout-test-'));
  try {
    await withIsolatedFamilyRuntimeEnv(async () => {
      createQueueTables(db);
      const reviewerPayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: 'publication-blockers::gate-replay-current',
          actionType: 'run_gate_clearing_batch',
          nextOwner: 'ai_reviewer',
          dispatchAuthority: 'consumer_default_executor_dispatch',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_gate_clearing_batch.json',
        }),
        workspace_root: workspaceRoot,
        work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
        work_unit_fingerprint: 'publication-blockers::gate-replay-current',
      };
      const writePayload = {
        ...defaultExecutorPayloadForOwner({
          sourceFingerprint: 'publication-blockers::0915410f804b3697',
          actionType: 'run_quality_repair_batch',
          nextOwner: 'write',
          dispatchAuthority: 'quality_repair_batch_writer_handoff',
          dispatchRef: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        }),
        workspace_root: workspaceRoot,
        work_unit_id: 'medical_prose_write_repair',
        work_unit_fingerprint: 'publication-blockers::0915410f804b3697',
      };
      insertSucceededTask(db, {
        taskId: 'task-mas-default-materialized-closeout-reviewer',
        payload: reviewerPayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_gate_clearing_batch:materialized-closeout',
      });
      insertSucceededTask(db, {
        taskId: 'task-mas-default-materialized-closeout-writer',
        payload: writePayload,
        dedupeKey: 'mas:dm-cvd:002:default-executor:run_quality_repair_batch:after-materialized-closeout',
      });
      db.prepare("UPDATE tasks SET status = 'running', attempts = 1 WHERE task_id = ?").run(
        'task-mas-default-materialized-closeout-reviewer',
      );
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(
        'task-mas-default-materialized-closeout-writer',
      );
      const reviewerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-materialized-closeout-reviewer',
      ) as Parameters<typeof ensureProviderHostedStageAttempt>[1];
      const writerRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(
        'task-mas-default-materialized-closeout-writer',
      ) as Parameters<typeof startDefaultExecutorStageAttempt>[2]['row'];
      const reviewerAttempt = ensureProviderHostedStageAttempt(db, reviewerRow, reviewerPayload);
      assert.ok(reviewerAttempt);
      db.prepare(`
        UPDATE stage_attempts
        SET status = 'running',
          provider_run_json = json_set(provider_run_json, '$.provider_status', 'running')
        WHERE stage_attempt_id = ?
      `).run(reviewerAttempt.stage_attempt_id);
      const closeoutDir = path.join(
        workspaceRoot,
        'studies',
        '002-dm-china-us-mortality-attribution',
        'artifacts',
        'supervision',
        'consumer',
        'default_executor_execution',
      );
      fs.mkdirSync(closeoutDir, { recursive: true });
      fs.writeFileSync(
        path.join(closeoutDir, `${reviewerAttempt.stage_attempt_id}.closeout.json`),
        `${JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          stage_attempt_id: reviewerAttempt.stage_attempt_id,
          closeout_refs: [
            `studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_execution/${reviewerAttempt.stage_attempt_id}.closeout.json`,
            'studies/002-dm-china-us-mortality-attribution/artifacts/controller/gate_clearing_batch/latest.json',
          ],
          consumed_refs: ['dispatch:dm002/gate-replay'],
          consumed_memory_refs: [],
          writeback_receipt_refs: [],
          rejected_writes: [],
          next_owner: 'write',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: {
            action_type: 'run_gate_clearing_batch',
            work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
            next_forced_delta: {
              owner: 'write',
              work_unit_id: 'medical_prose_write_repair',
            },
          },
          authority_boundary: {
            opl: 'default_executor_materialized_closeout_transport_only',
            domain: 'truth_quality_artifact_gate_owner',
          },
        }, null, 2)}\n`,
        'utf8',
      );
      const blockedWriterAttempt = ensureProviderHostedStageAttempt(db, writerRow, writePayload);
      let temporalStartCount = 0;

      const result = await startDefaultExecutorStageAttempt(db, familyRuntimePaths(), {
        row: writerRow,
        payload: writePayload,
        providerHostedAttempt: blockedWriterAttempt,
        temporalProviderModule: async () => ({
          startTemporalStageAttemptWorkflow: async () => {
            temporalStartCount += 1;
            return { surface_kind: 'temporal_stage_attempt_start_receipt' };
          },
        }),
        queryTemporalStageAttemptReadModel: async () => ({
          surface_kind: 'temporal_stage_attempt_query_unavailable',
          provider_kind: 'temporal',
          stage_attempt_id: reviewerAttempt.stage_attempt_id,
          workflow_id: reviewerAttempt.workflow_id,
          run_id: 'test-stale-running-run',
          workflow_status: 'RUNNING',
          status: 'unavailable',
          reason: 'temporal_stage_attempt_query_unavailable',
          error: {
            code: 'temporal_stage_attempt_query_unavailable',
            message: 'Temporal read model still reports the old workflow as non-terminal.',
          },
          authority_boundary: {
            opl: 'local_stage_attempt_ledger_projection_only',
            domain: 'truth_quality_artifact_gate_owner',
          },
        }),
      });
      const reviewerTask = db.prepare('SELECT status, last_error FROM tasks WHERE task_id = ?').get(
        'task-mas-default-materialized-closeout-reviewer',
      ) as { status: string; last_error: string | null };
      const [syncedReviewerAttempt] = listStageAttemptsForTask(
        db,
        'task-mas-default-materialized-closeout-reviewer',
      );
      const writerTask = db.prepare('SELECT status, attempts FROM tasks WHERE task_id = ?').get(
        'task-mas-default-materialized-closeout-writer',
      ) as { status: string; attempts: number };
      const writerAttempts = listStageAttemptsForTask(db, 'task-mas-default-materialized-closeout-writer');
      const skipEvent = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_skip'
        LIMIT 1
      `).get('task-mas-default-materialized-closeout-writer') as { payload_json: string } | undefined;

      assert.equal(blockedWriterAttempt, null);
      assert.equal(reviewerTask.status, 'succeeded');
      assert.equal(reviewerTask.last_error, null);
      assert.equal(syncedReviewerAttempt.status, 'completed');
      assert.equal(syncedReviewerAttempt.closeout_receipt_status, 'accepted_typed_closeout');
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
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
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
