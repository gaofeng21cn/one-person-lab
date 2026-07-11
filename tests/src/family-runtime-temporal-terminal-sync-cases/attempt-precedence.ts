import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStageAttempt,
  inspectStageAttempt,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../../src/modules/runway/family-runtime-stage-attempts.ts';
import {
  blockedTemporalObservation,
  createMasDefaultExecutorAttempt,
  createQueueTables,
  failedTemporalObservation,
  insertMasDefaultExecutorTask,
  withStageAttemptDb,
} from './helpers.ts';

test('Older terminal failure cannot overwrite newer accepted closeout for the same MAS default executor task', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-default-newer-closeout-wins',
      status: 'blocked',
      createdAt,
      lastError: 'temporal_workflow_failed',
      deadLetterReason: 'temporal_stage_attempt_failed',
      payload: { source_fingerprint: 'sha256:newer-completed-dispatch' },
    });
    const olderAttempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-default-newer-closeout-wins',
      sourceFingerprint: 'sha256:older-failed-dispatch',
    });
    const newerAttempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'domain_owner/default-executor-dispatch',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/mas', attempt: 'newer' },
      sourceFingerprint: 'sha256:newer-completed-dispatch',
      executorKind: 'codex_cli',
      taskId: 'task-mas-default-newer-closeout-wins',
      checkpointRefs: ['dispatch:mas-default-writer-start'],
    }).attempt;

    syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: newerAttempt.stage_attempt_id,
      workflow_id: newerAttempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: newerAttempt.stage_attempt_id,
        workflow_id: newerAttempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
        status: 'completed',
        started_at: createdAt,
        updated_at: createdAt,
        activity_events: [],
        checkpoint_refs: ['dispatch:mas-default-writer-start'],
        closeout_refs: ['artifacts/supervision/reconcile/latest.json'],
        consumed_refs: ['dispatch:mas-default-writer-start'],
        consumed_memory_refs: [],
        writeback_receipt_refs: ['receipt:writer-handoff'],
        rejected_writes: [],
        next_owner: 'medautoscience',
        route_impact: {
          stage_native_closeout: {
            surface_kind: 'medical_paper_readiness_stage_native_closeout',
            status: 'materialized',
            source_fingerprint: 'sha256:newer-completed-dispatch',
            written_ref: 'artifacts/stage_outputs/08-publication_package_handoff/receipts/owner_receipt.json',
          },
        },
        human_gate_refs: [],
        signals: [],
        closeout_packet: {
          surface_kind: 'temporal_domain_handler_dispatch_receipt',
          closeout_packet_surface_kind: 'domain_stage_closeout_packet',
          closeout_refs: ['artifacts/supervision/reconcile/latest.json'],
        },
        completion_boundary: {
          provider_completion: 'completed',
          domain_ready_verdict: 'domain_gate_pending',
          provider_completion_is_domain_ready: false,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    });
    syncStageAttemptFromTemporalTerminalObservation(
      db,
      failedTemporalObservation({
        stageAttemptId: olderAttempt.stage_attempt_id,
        workflowId: olderAttempt.workflow_id,
        createdAt,
      }),
    );
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-newer-closeout-wins',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };
    const olderSynced = inspectStageAttempt(db, olderAttempt.stage_attempt_id);
    const failureTaskEvents = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = 'stage_attempt_terminal_failed_task'",
    ).get('task-mas-default-newer-closeout-wins') as { count: number };

    assert.equal(olderSynced.status, 'failed');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.equal(failureTaskEvents.count, 0);
  });
});

test('Older terminal blocker cannot overwrite newer live redrive attempt for the same MAS default executor task', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-default-newer-redrive-running',
      status: 'succeeded',
      createdAt,
    });
    const olderAttempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-default-newer-redrive-running',
      sourceFingerprint: 'sha256:older-blocked-dispatch',
    });
    const newerAttempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'domain_owner/default-executor-dispatch',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/mas', attempt: 'newer-redrive' },
      sourceFingerprint: 'sha256:newer-redrive-dispatch',
      executorKind: 'codex_cli',
      taskId: 'task-mas-default-newer-redrive-running',
      checkpointRefs: ['dispatch:mas-default-writer-start'],
    }).attempt;
    db.prepare("UPDATE stage_attempts SET status = 'running' WHERE stage_attempt_id = ?").run(
      newerAttempt.stage_attempt_id,
    );

    syncStageAttemptFromTemporalTerminalObservation(
      db,
      blockedTemporalObservation({
        stageAttemptId: olderAttempt.stage_attempt_id,
        workflowId: olderAttempt.workflow_id,
        createdAt,
      }),
    );
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-newer-redrive-running',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };
    const olderSynced = inspectStageAttempt(db, olderAttempt.stage_attempt_id);
    const blockerTaskEvents = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = 'stage_attempt_terminal_blocked_task'",
    ).get('task-mas-default-newer-redrive-running') as { count: number };

    assert.equal(olderSynced.status, 'blocked');
    assert.equal(olderSynced.blocked_reason, 'typed_closeout_packet_required');
    assert.equal(inspectStageAttempt(db, newerAttempt.stage_attempt_id).status, 'running');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.equal(blockerTaskEvents.count, 0);
  });
});
