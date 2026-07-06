import { DatabaseSync } from 'node:sqlite';

import {
  assert,
  test,
  parseJsonText,
} from './helpers.ts';

import { ensureProviderHostedStageAttempt } from '../../../../../src/modules/runway/family-runtime-provider-hosted-attempts.ts';
import {
  listStageAttemptsForTask,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../../../../src/modules/runway/family-runtime-stage-attempts.ts';
import {
  createQueueTables,
  defaultExecutorPayload,
  insertSucceededTask,
  withIsolatedFamilyRuntimeEnv,
} from './mas-default-executor-helpers.ts';

function readinessSurfacePayload(sourceFingerprint: string) {
  return {
    ...defaultExecutorPayload(sourceFingerprint),
    action_type: 'complete_medical_paper_readiness_surface',
    dispatch_authority: 'consumer_default_executor_dispatch',
    next_executable_owner: 'MedAutoScience',
    domain_owner: 'MedAutoScience',
    work_unit_id: 'complete_medical_paper_readiness_surface',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/immutable/complete_medical_paper_readiness_surface/186ef28f465b50a2961653c6.json',
    owner_route_currentness_basis: {
      work_unit_id: 'complete_medical_paper_readiness_surface',
      work_unit_fingerprint: `stage-current-owner-delta::complete_medical_paper_readiness_surface::${sourceFingerprint}`,
    },
  };
}

function completedTemporalObservation(input: {
  stageAttemptId: string;
  workflowId: string;
  closeoutRefs: string[];
  routeImpact?: Record<string, unknown>;
}) {
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    workflow_status: 'COMPLETED',
    query: {
      status: 'completed',
      closeout_refs: input.closeoutRefs,
      consumed_refs: ['dispatch:dm002/medical-readiness'],
      consumed_memory_refs: [],
      writeback_receipt_refs: [],
      rejected_writes: [],
      next_owner: 'medautoscience',
      route_impact: input.routeImpact ?? {},
      completion_boundary: {
        provider_completion: 'completed',
        domain_ready_verdict: 'domain_gate_pending',
      },
      closeout_packet: {
        surface_kind: 'domain_stage_closeout_packet',
        closeout_refs: input.closeoutRefs,
        consumed_refs: ['dispatch:dm002/medical-readiness'],
        writeback_receipt_refs: [],
        next_owner: 'medautoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: input.routeImpact ?? {},
      },
    },
  };
}

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
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(taskId) as {
        status: string;
        last_error: string | null;
        dead_letter_reason: string | null;
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
      assert.equal(syncedAttempt.status, 'failed');
      assert.equal(syncedAttempt.blocked_reason, 'temporal_workflow_failed');
      assert.ok(event);
      assert.equal(parseJsonText(event.payload_json).task_dead_letter_reason, 'temporal_stage_attempt_failed');
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
        SELECT status, last_error
        FROM tasks
        WHERE task_id = ?
      `).get(taskId) as {
        status: string;
        last_error: string | null;
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
      assert.equal(syncedAttempt.status, 'completed');
      assert.equal(syncedAttempt.closeout_receipt_status, 'accepted_typed_closeout');
      assert.ok(event);
      assert.equal(parseJsonText(event.payload_json).reason, 'temporal_stage_attempt_completed');
    });
  } finally {
    db.close();
  }
});

test('family-runtime blocks completed MAS readiness attempt that lacks Stage Native owner answer', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:terminal-missing-answer';
      const taskId = 'task-mas-readiness-terminal-missing-answer';
      const payload = readinessSurfacePayload('readiness-terminal-missing-answer');
      insertSucceededTask(db, {
        taskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload,
        dedupeKey,
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];
      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(attempt);

      syncStageAttemptFromTemporalTerminalObservation(db, completedTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        closeoutRefs: [
          'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_execution/latest.json',
          'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
        ],
        routeImpact: {
          action_type: 'complete_medical_paper_readiness_surface',
          owner_result_status: 'typed_blocker_or_stop_loss',
        },
      }));
      const task = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(taskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
      const [syncedAttempt] = listStageAttemptsForTask(db, taskId);
      const event = db.prepare(`
        SELECT payload_json
        FROM events
        WHERE task_id = ? AND event_type = 'stage_attempt_terminal_missing_stage_native_owner_answer_task'
        LIMIT 1
      `).get(taskId) as { payload_json: string } | undefined;

      assert.equal(task.status, 'blocked');
      assert.equal(task.last_error, 'stage_native_owner_answer_missing_after_default_executor_completion');
      assert.equal(task.dead_letter_reason, 'stage_native_owner_answer_missing_after_default_executor_completion');
      assert.equal(syncedAttempt.status, 'completed');
      assert.equal(syncedAttempt.closeout_receipt_status, 'accepted_typed_closeout');
      assert.ok(event);
      assert.equal(
        parseJsonText(event.payload_json).reason,
        'stage_native_owner_answer_missing_after_default_executor_completion',
      );
    });
  } finally {
    db.close();
  }
});

test('family-runtime succeeds completed MAS readiness attempt when closeout ref matches current Stage Native source', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const stageNativeRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json';
      const currentSource = `stage-current-owner-delta::complete_medical_paper_readiness_surface::authoring_runtime_authorization::/tmp/dm-cvd/${stageNativeRef}`;
      const dedupeKey = 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:terminal-current-closeout-ref';
      const taskId = 'task-mas-readiness-terminal-current-closeout-ref';
      const payload = readinessSurfacePayload(currentSource);
      insertSucceededTask(db, {
        taskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload,
        dedupeKey,
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];
      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(attempt);

      syncStageAttemptFromTemporalTerminalObservation(db, completedTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        closeoutRefs: [
          'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_execution/latest.json',
          stageNativeRef,
        ],
        routeImpact: {
          action_type: 'complete_medical_paper_readiness_surface',
          owner_result_status: 'typed_blocker_or_stop_loss',
        },
      }));
      const task = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(taskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
      const [syncedAttempt] = listStageAttemptsForTask(db, taskId);
      const missingEventCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM events
        WHERE task_id = ? AND event_type = 'stage_attempt_terminal_missing_stage_native_owner_answer_task'
      `).get(taskId) as { count: number };

      assert.equal(task.status, 'succeeded');
      assert.equal(task.last_error, null);
      assert.equal(task.dead_letter_reason, null);
      assert.equal(syncedAttempt.status, 'completed');
      assert.equal(syncedAttempt.closeout_receipt_status, 'accepted_typed_closeout');
      assert.equal(missingEventCount.count, 0);
    });
  } finally {
    db.close();
  }
});

test('family-runtime succeeds completed MAS readiness attempt with Stage Native owner answer', () => {
  const db = new DatabaseSync(':memory:');
  try {
    withIsolatedFamilyRuntimeEnv(() => {
      createQueueTables(db);
      const dedupeKey = 'mas:dm-cvd:002:default-executor:complete_medical_paper_readiness_surface:terminal-stage-native-answer';
      const taskId = 'task-mas-readiness-terminal-stage-native-answer';
      const payload = readinessSurfacePayload('readiness-terminal-stage-native-answer');
      insertSucceededTask(db, {
        taskId,
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        payload,
        dedupeKey,
      });
      db.prepare("UPDATE tasks SET status = 'queued' WHERE task_id = ?").run(taskId);
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as Parameters<
        typeof ensureProviderHostedStageAttempt
      >[1];
      const attempt = ensureProviderHostedStageAttempt(db, row, payload);
      assert.ok(attempt);

      syncStageAttemptFromTemporalTerminalObservation(db, completedTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        closeoutRefs: [
          'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_execution/latest.json',
          'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
        ],
        routeImpact: {
          action_type: 'complete_medical_paper_readiness_surface',
          stage_native_closeout: {
            surface_kind: 'medical_paper_readiness_stage_native_closeout',
            status: 'materialized',
            stage_id: '08-publication_package_handoff',
            terminal_outcome_kind: 'typed_blocker',
            written_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/typed_blocker.json',
            closeout_binding: {
              source_fingerprint: 'readiness-terminal-stage-native-answer',
              work_unit_fingerprint: 'stage-current-owner-delta::complete_medical_paper_readiness_surface::readiness-terminal-stage-native-answer',
            },
          },
        },
      }));
      const task = db.prepare(`
        SELECT status, last_error, dead_letter_reason
        FROM tasks
        WHERE task_id = ?
      `).get(taskId) as { status: string; last_error: string | null; dead_letter_reason: string | null };
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
      assert.equal(syncedAttempt.status, 'completed');
      assert.equal(syncedAttempt.closeout_receipt_status, 'accepted_typed_closeout');
      assert.ok(event);
      assert.equal(parseJsonText(event.payload_json).reason, 'temporal_stage_attempt_completed');
    });
  } finally {
    db.close();
  }
});
