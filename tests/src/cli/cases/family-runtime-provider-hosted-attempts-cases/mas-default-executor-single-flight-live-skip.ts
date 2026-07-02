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

import { startDefaultExecutorStageAttempt } from '../../../../../src/modules/runway/family-runtime-default-executor-start.ts';
import { ensureProviderHostedStageAttempt } from '../../../../../src/modules/runway/family-runtime-provider-hosted-attempts.ts';
import { familyRuntimePaths } from '../../../../../src/modules/runway/family-runtime-store.ts';
import {
  listStageAttemptsForTask,
} from '../../../../../src/modules/runway/family-runtime-stage-attempts.ts';
import { enqueueTask } from '../../../../../src/modules/runway/family-runtime-enqueue.ts';
import type { TemporalStageAttemptWorkflowState } from '../../../../../src/modules/runway/family-runtime-temporal.ts';

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
