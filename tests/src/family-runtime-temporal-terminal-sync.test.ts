import test from 'node:test';
import assert from 'node:assert/strict';

import './family-runtime-temporal-terminal-sync-cases/attempt-precedence.ts';
import {
  createStageAttempt,
  inspectStageAttempt,
  listStageAttemptCloseouts,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';
import { queryStageAttempt } from '../../src/modules/runway/family-runtime-stage-attempt-query.ts';
import { markStageAttemptCancelRequested } from '../../src/modules/runway/family-runtime-stage-attempt-control.ts';
import {
  buildTemporalStageAttemptMissingWorkflowCancelReceipt,
} from '../../src/modules/runway/family-runtime-temporal-provider.ts';
import {
  blockedTemporalObservation,
  canceledTemporalObservation,
  createMasDefaultExecutorAttempt,
  createQueueTables,
  insertDomainRouteTask,
  insertMasDefaultExecutorTask,
  missingWorkflowObservation,
  withStageAttemptDb,
} from './family-runtime-temporal-terminal-sync-cases/helpers.ts';

test('missing Temporal workflow does not fail an unclaimed queued attempt', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-unclaimed-queued-workflow-missing',
      status: 'queued',
      createdAt,
    });
    const attempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-unclaimed-queued-workflow-missing',
    });
    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      missingWorkflowObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
      }),
    );
    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);

    assert.equal(synced, null);
    assert.equal(inspected.status, 'queued');
    assert.equal(inspected.blocked_reason, null);
    assert.equal(inspected.provider_run.provider_status, 'registered');
  });
});

test('Temporal cancelled terminal observation uses SDK spelling for provider-only cancellation', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-default-cancelled-releases',
      status: 'queued',
      createdAt,
    });
    const attempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-default-cancelled-releases',
      sourceFingerprint: 'sha256:mas-default-cancelled-releases',
    });

    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      canceledTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        workflowStatus: 'CANCELLED',
      }),
    );
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-cancelled-releases',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };

    assert.equal(synced?.blocked_reason, 'temporal_workflow_canceled');
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.provider_status, 'canceled');
    assert.equal(task.status, 'blocked');
    assert.equal(task.last_error, 'temporal_workflow_canceled');
    assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_canceled');
  });
});

test('operator cancel request immediately blocks linked MAS task until Temporal terminal is visible', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-default-cancel-requested',
      status: 'running',
      createdAt,
    });
    const attempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-default-cancel-requested',
      sourceFingerprint: 'sha256:mas-default-cancel-requested',
    });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'running',
        provider_run_json = json_set(
          provider_run_json,
          '$.provider_status', 'running',
          '$.last_heartbeat_at', ?
        )
      WHERE stage_attempt_id = ?
    `).run(createdAt, attempt.stage_attempt_id);

    const requested = markStageAttemptCancelRequested(db, {
      stageAttemptId: attempt.stage_attempt_id,
      reason: 'manual_pause_for_mas_upgrade',
      source: 'test-supervisor',
      temporalCancel: {
        surface_kind: 'temporal_stage_attempt_cancel_receipt',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
      },
    });
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-cancel-requested',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };

    assert.equal(requested?.status, 'failed');
    assert.equal(requested?.blocked_reason, 'operator_cancel_requested');
    assert.equal(requested?.provider_run.provider_status, 'cancel_requested');
    assert.equal(task.status, 'blocked');
    assert.equal(task.last_error, 'operator_cancel_requested');
    assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_canceled');

    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      canceledTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
      }),
    );
    const terminalTask = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-cancel-requested',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };

    assert.equal(synced?.blocked_reason, 'temporal_workflow_canceled');
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.provider_status, 'canceled');
    assert.equal(terminalTask.status, 'blocked');
    assert.equal(terminalTask.last_error, 'temporal_workflow_canceled');
    assert.equal(terminalTask.dead_letter_reason, 'temporal_stage_attempt_canceled');
  });
});

test('operator cancel request retires linked MAS task when Temporal workflow is already missing', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-default-missing-workflow-cancel',
      status: 'queued',
      createdAt,
    });
    const attempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-default-missing-workflow-cancel',
      sourceFingerprint: 'sha256:mas-default-missing-workflow-cancel',
    });
    const temporalCancel = buildTemporalStageAttemptMissingWorkflowCancelReceipt({
      stageAttemptId: attempt.stage_attempt_id,
      workflowId: attempt.workflow_id,
      reason: 'superseded_by_publication_handoff_owner_gate',
      source: 'test-supervisor',
      message: 'workflow not found',
    });

    const requested = markStageAttemptCancelRequested(db, {
      stageAttemptId: attempt.stage_attempt_id,
      reason: 'superseded_by_publication_handoff_owner_gate',
      source: 'test-supervisor',
      temporalCancel,
    });
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-missing-workflow-cancel',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };

    assert.equal(temporalCancel.cancel_status, 'workflow_not_started_or_not_found');
    assert.equal(temporalCancel.degraded_reason, 'temporal_workflow_not_started_or_not_found');
    assert.equal(requested?.status, 'failed');
    assert.equal(requested?.blocked_reason, 'operator_cancel_requested');
    assert.equal(requested?.provider_run.provider_status, 'cancel_requested');
    assert.equal(task.status, 'blocked');
    assert.equal(task.last_error, 'operator_cancel_requested');
    assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_canceled');
  });
});

test('missing Temporal workflow does not fail synchronous domain handler checkpoint', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertDomainRouteTask(db, {
      taskId: 'task-domain-route-sync-checkpoint',
      status: 'succeeded',
      createdAt,
    });
    const attempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'domain_route/reconcile-apply',
      providerKind: 'temporal',
      workspaceLocator: { route_ref: 'domain_route/reconcile-apply' },
      sourceFingerprint: 'sha256:domain-route-sync-checkpoint',
      executorKind: 'domain_handler',
      taskId: 'task-domain-route-sync-checkpoint',
    }).attempt;
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'checkpointed',
        provider_run_json = json_set(
          provider_run_json,
          '$.provider_status', 'checkpointed',
          '$.last_heartbeat_at', ?
        ),
        activity_events_json = json_insert(activity_events_json, '$[#]', json(?))
      WHERE stage_attempt_id = ?
    `).run(
      createdAt,
      JSON.stringify({
        event_time: createdAt,
        activity_kind: 'domain_handler_dispatch_activity',
        activity_status: 'checkpointed',
        closeout_refs: [],
      }),
      attempt.stage_attempt_id,
    );

    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      missingWorkflowObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
      }),
    );
    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-domain-route-sync-checkpoint',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };

    assert.equal(synced, null);
    assert.equal(inspected.status, 'checkpointed');
    assert.equal(inspected.blocked_reason, null);
    assert.equal(inspected.provider_run.provider_status, 'checkpointed');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
  });
});

test('Temporal blocked terminal observation blocks MAS default executor task without typed closeout', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-default-closeout-required',
      status: 'succeeded',
      createdAt,
    });
    const attempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-default-closeout-required',
    });
    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      blockedTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        createdAt,
      }),
    );
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-closeout-required',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };
    const event = db.prepare('SELECT event_type, payload_json FROM events WHERE task_id = ?').get(
      'task-mas-default-closeout-required',
    ) as { event_type: string; payload_json: string };

    assert.equal(synced?.status, 'blocked');
    assert.equal(synced?.blocked_reason, 'typed_closeout_packet_required');
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.provider_status, 'blocked');
    assert.equal(task.status, 'blocked');
    assert.equal(task.last_error, 'typed_closeout_packet_required');
    assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_not_completed');
    assert.equal(event.event_type, 'stage_attempt_terminal_blocked_task');
    assert.equal(JSON.parse(event.payload_json).authority_boundary.provider_completion_is_domain_ready, false);
  });
});

test('Temporal blocked terminal observation retains provider-runtime blocker closeout refs', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-provider-runtime-blocker-closeout-ref',
      status: 'succeeded',
      createdAt,
    });
    const attempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-provider-runtime-blocker-closeout-ref',
      sourceFingerprint: 'sha256:provider-runtime-blocker-closeout-ref',
    });
    const runtimeBlockerRef =
      `opl://stage-attempts/${attempt.stage_attempt_id}/runtime-blockers/codex_cli_typed_closeout_not_materialized`;
    const synced = syncStageAttemptFromTemporalTerminalObservation(db, {
      ...blockedTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        createdAt,
        blockedReason: 'codex_cli_typed_closeout_not_materialized',
      }),
      query: {
        ...blockedTemporalObservation({
          stageAttemptId: attempt.stage_attempt_id,
          workflowId: attempt.workflow_id,
          createdAt,
          blockedReason: 'codex_cli_typed_closeout_not_materialized',
        }).query,
        closeout_refs: [runtimeBlockerRef],
        consumed_refs: ['paper-mission-transaction:dm003-submission-milestone'],
        rejected_writes: [{
          surface_kind: 'opl_provider_runtime_typed_blocker_ref',
          blocker_ref: runtimeBlockerRef,
          reason: 'codex_cli_typed_closeout_not_materialized',
          provider_completion_is_domain_ready: false,
        }],
        route_impact: {
          runtime_blocker_ref: runtimeBlockerRef,
          provider_completion_is_domain_ready: false,
        },
        closeout_packet: {
          surface_kind: 'temporal_domain_handler_dispatch_receipt',
          activity_status: 'blocked',
          blocked_reason: 'codex_cli_typed_closeout_not_materialized',
          closeout_refs: [runtimeBlockerRef],
          authority_boundary: {
            opl: 'domain_handler_transport_only',
            domain: 'domain_handler_dispatch_and_receipt_owner',
            provider_completion_is_domain_ready: false,
          },
        },
      },
    });
    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
    const terminalEvent = inspected.activity_events.find((event) =>
      event.activity_kind === 'temporal_stage_attempt_terminal_observation'
    );

    assert.equal(synced?.status, 'blocked');
    assert.equal(inspected.closeout_receipt_status, null);
    assert.deepEqual(inspected.closeout_refs, [runtimeBlockerRef]);
    assert.equal(inspected.route_impact.runtime_blocker_ref, runtimeBlockerRef);
    assert.equal(inspected.route_impact.provider_completion_is_domain_ready, false);
    assert.deepEqual(terminalEvent?.closeout_refs, [runtimeBlockerRef]);
    assert.equal(listStageAttemptCloseouts(db, attempt.stage_attempt_id).length, 0);
  });
});

test('Temporal blocked terminal observation classifies Codex activity cancellation as lifecycle blocker', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-default-codex-activity-cancelled',
      status: 'succeeded',
      createdAt,
    });
    const attempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-default-codex-activity-cancelled',
    });
    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      blockedTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        createdAt,
        blockedReason: 'codex_cli_activity_cancelled',
      }),
    );
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-codex-activity-cancelled',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };
    const event = db.prepare('SELECT event_type, payload_json FROM events WHERE task_id = ?').get(
      'task-mas-default-codex-activity-cancelled',
    ) as { event_type: string; payload_json: string };

    assert.equal(synced?.status, 'blocked');
    assert.equal(synced?.blocked_reason, 'codex_cli_activity_cancelled');
    assert.equal(task.status, 'blocked');
    assert.equal(task.last_error, 'codex_cli_activity_cancelled');
    assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_canceled');
    assert.equal(event.event_type, 'stage_attempt_terminal_blocked_task');
    assert.equal(JSON.parse(event.payload_json).task_dead_letter_reason, 'temporal_stage_attempt_canceled');
  });
});

test('Temporal blocked terminal observation refreshes stale MAS default executor blocked reason', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-default-stale-blocked-reason',
      status: 'blocked',
      createdAt,
      lastError: 'MAS default executor dispatch has no launchable Temporal Codex stage attempt.',
      deadLetterReason: 'temporal_stage_attempt_start_failed',
    });
    const attempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-default-stale-blocked-reason',
    });
    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      blockedTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
        createdAt,
      }),
    );
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-stale-blocked-reason',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };
    const event = db.prepare('SELECT event_type, payload_json FROM events WHERE task_id = ?').get(
      'task-mas-default-stale-blocked-reason',
    ) as { event_type: string; payload_json: string };

    assert.equal(synced?.status, 'blocked');
    assert.equal(synced?.blocked_reason, 'typed_closeout_packet_required');
    assert.equal(task.status, 'blocked');
    assert.equal(task.last_error, 'typed_closeout_packet_required');
    assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_not_completed');
    assert.equal(event.event_type, 'stage_attempt_terminal_blocked_task');
    assert.equal(JSON.parse(event.payload_json).task_dead_letter_reason, 'temporal_stage_attempt_not_completed');
  });
});

test('Temporal completed terminal observation clears provider-only MAS default executor task blocker', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-default-completed-clears-provider-blocker',
      status: 'blocked',
      createdAt,
      lastError: 'temporal_workflow_failed',
      deadLetterReason: 'temporal_stage_attempt_failed',
    });
    const attempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-default-completed-clears-provider-blocker',
      sourceFingerprint: 'sha256:mas-default-completed-clears-provider-blocker',
    });
    const synced = syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
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
        route_impact: {},
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
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-completed-clears-provider-blocker',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };
    const event = db.prepare('SELECT event_type, payload_json FROM events WHERE task_id = ?').get(
      'task-mas-default-completed-clears-provider-blocker',
    ) as { event_type: string; payload_json: string };

    assert.equal(synced?.status, 'completed');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.equal(event.event_type, 'stage_attempt_terminal_completed_task');
    assert.equal(JSON.parse(event.payload_json).cleared_dead_letter_reason, 'temporal_stage_attempt_failed');
  });
});

test('Temporal canceled terminal observation releases MAS default executor task as provider-only cancellation', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, {
      taskId: 'task-mas-default-canceled-releases',
      status: 'succeeded',
      createdAt,
    });
    const attempt = createMasDefaultExecutorAttempt(db, {
      taskId: 'task-mas-default-canceled-releases',
      sourceFingerprint: 'sha256:mas-default-canceled-releases',
    });

    const synced = syncStageAttemptFromTemporalTerminalObservation(
      db,
      canceledTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id,
        workflowId: attempt.workflow_id,
      }),
    );
    const task = db.prepare('SELECT status, last_error, dead_letter_reason FROM tasks WHERE task_id = ?').get(
      'task-mas-default-canceled-releases',
    ) as { status: string; last_error: string | null; dead_letter_reason: string | null };
    const event = db.prepare('SELECT event_type, payload_json FROM events WHERE task_id = ?').get(
      'task-mas-default-canceled-releases',
    ) as { event_type: string; payload_json: string };

    assert.equal(synced?.status, 'failed');
    assert.equal(synced?.blocked_reason, 'temporal_workflow_canceled');
    assert.equal(inspectStageAttempt(db, attempt.stage_attempt_id).provider_run.provider_status, 'canceled');
    assert.equal(task.status, 'blocked');
    assert.equal(task.last_error, 'temporal_workflow_canceled');
    assert.equal(task.dead_letter_reason, 'temporal_stage_attempt_canceled');
    assert.equal(event.event_type, 'stage_attempt_terminal_canceled_task');
    assert.equal(JSON.parse(event.payload_json).authority_boundary.provider_completion_is_domain_ready, false);
  });
});

test('Temporal completed terminal observation ingests closeout refs into local attempt ledger', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    const attempt = createMasDefaultExecutorAttempt(db, {
      sourceFingerprint: 'sha256:mas-default-completed-dispatch',
    });
    const synced = syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
        status: 'completed',
        started_at: createdAt,
        updated_at: createdAt,
        activity_events: [{
          activity_kind: 'codex_stage_activity',
          activity_status: 'completed',
          closeout_packet: {
            surface_kind: 'domain_stage_closeout_packet',
            closeout_refs: ['raw-codex-closeout-should-not-be-authoritative.json'],
            consumed_refs: ['dispatch:mas-default-writer-start'],
            writeback_receipt_refs: ['receipt:writer-handoff'],
            next_owner: 'medautoscience',
            domain_ready_verdict: 'domain_gate_pending',
          },
        }],
        checkpoint_refs: ['dispatch:mas-default-writer-start'],
        closeout_refs: [
          'artifacts/supervision/reconcile/latest.json',
          'studies/002-dm/artifacts/controller/repair_execution_evidence/latest.json',
        ],
        consumed_refs: ['dispatch:mas-default-writer-start'],
        consumed_memory_refs: [],
        writeback_receipt_refs: ['receipt:writer-handoff'],
        rejected_writes: [],
        next_owner: 'medautoscience',
        route_impact: {},
        human_gate_refs: [],
        signals: [],
        closeout_packet: {
          surface_kind: 'temporal_domain_handler_dispatch_receipt',
          closeout_packet_surface_kind: 'domain_stage_closeout_packet',
          closeout_refs: [
            'artifacts/supervision/reconcile/latest.json',
            'studies/002-dm/artifacts/controller/repair_execution_evidence/latest.json',
          ],
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
    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);

    assert.equal(synced?.status, 'completed');
    assert.equal(inspected.closeout_receipt_status, 'accepted_typed_closeout');
    assert.deepEqual(inspected.closeout_refs, [
      'artifacts/supervision/reconcile/latest.json',
      'studies/002-dm/artifacts/controller/repair_execution_evidence/latest.json',
    ]);
    assert.equal(inspected.provider_run.provider_status, 'completed');
    assert.equal(listStageAttemptCloseouts(db, attempt.stage_attempt_id).length, 1);
  });
});

test('Temporal completed terminal observation persists Codex activity token usage into attempt projections', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    const attempt = createMasDefaultExecutorAttempt(db, {
      sourceFingerprint: 'sha256:mas-default-completed-token-usage',
    });
    const synced = syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: 'domain_owner/default-executor-dispatch',
        status: 'completed',
        started_at: createdAt,
        updated_at: createdAt,
        activity_events: [{
          activity_kind: 'codex_stage_activity',
          activity_status: 'completed',
          cost_summary: {
            cost_status: 'observed',
            estimated_cost_usd: 0.17,
            usage_ref: 'codex_session_usage:dm002-stage#sha256:token123',
            session_usage_refs: {
              session_ref: 'codex_session:dm002-stage',
              source_path: '/tmp/codex-home/sessions/2026/06/28/dm002-stage.jsonl',
              source_hash: 'sha256:token123',
              billing_boundary: 'refs_only_absolute_cumulative_total_delta',
            },
            token_usage: {
              input_tokens: 1900,
              output_tokens: 640,
              total_tokens: 2540,
            },
          },
        }],
        checkpoint_refs: ['dispatch:mas-default-writer-start'],
        closeout_refs: ['artifacts/supervision/reconcile/latest.json'],
        consumed_refs: ['dispatch:mas-default-writer-start'],
        consumed_memory_refs: [],
        writeback_receipt_refs: ['receipt:writer-handoff'],
        rejected_writes: [],
        next_owner: 'medautoscience',
        route_impact: {},
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
    const inspected = inspectStageAttempt(db, attempt.stage_attempt_id);
    const query = queryStageAttempt(db, attempt.stage_attempt_id).stage_attempt_query;
    const usage = query.usage_projection;
    const userStageLog = query.stage_progress_log.user_stage_log;
    const persistedCostSummary = inspected.provider_run.cost_summary as {
      token_usage: { total_tokens: number };
    };

    assert.equal(synced?.status, 'completed');
    assert.equal(persistedCostSummary.token_usage.total_tokens, 2540);
    assert.equal(usage.telemetry_status, 'observed');
    assert.equal(usage.token.observed_count, 1);
    assert.equal(usage.token.input_tokens_observed, 1900);
    assert.equal(usage.token.output_tokens_observed, 640);
    assert.equal(usage.token.total_tokens_observed, 2540);
    assert.deepEqual(usage.token.source_refs, [
      'codex_session_usage:dm002-stage#sha256:token123',
      'codex_session:dm002-stage',
    ]);
    assert.equal(usage.cost.estimated_cost_usd_observed, 0.17);
    assert.equal(query.operator_visibility.usage_projection.token.total_tokens_observed, 2540);
    assert.equal(query.stage_progress_log.usage_telemetry.telemetry_status, 'observed');
    assert.equal(userStageLog.token_usage.status, 'observed');
    assert.equal(userStageLog.token_usage.total_tokens, 2540);
  });
});
