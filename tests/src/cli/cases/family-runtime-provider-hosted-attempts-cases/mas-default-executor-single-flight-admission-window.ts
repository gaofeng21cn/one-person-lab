import { DatabaseSync } from 'node:sqlite';
import { WorkflowNotFoundError } from '@temporalio/common';

import {
  assert,
  fs,
  os,
  path,
  parseJsonText,
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
      assert.equal(writerAttempts.length, 0);
      assert.ok(skipEvent);
      const skipPayload = parseJsonText(skipEvent.payload_json);
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
      assert.ok(noopEvent);
      const noopPayload = parseJsonText(noopEvent.payload_json);
      assert.equal(noopPayload.reason, 'same_study_live_stage_attempt_exists_at_enqueue');
      assert.equal(noopPayload.live_action_type, 'return_to_ai_reviewer_workflow');
      assert.equal(noopPayload.action_type, 'run_quality_repair_batch');
      assert.equal(noopPayload.stage_attempt_id, reviewerAttempt.stage_attempt_id);
      assert.ok(deferredEvent);
      const deferredPayload = parseJsonText(deferredEvent.payload_json);
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

      assert.equal(result.status, 'running');
      assert.equal(listStageAttemptsForTask(db, taskId)[0].status, 'running');
    });
  } finally {
    db.close();
  }
});
