import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  createStageAttempt,
  createStageAttemptTable,
  inspectStageAttempt,
  listStageAttemptCloseouts,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../src/family-runtime-stage-attempts.ts';
import { markStageAttemptCancelRequested } from '../../src/family-runtime-stage-attempt-control.ts';
import { createFamilyRuntimeQueueTables } from '../../src/family-runtime-store.ts';

function withStageAttemptDb(fn: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    fn(db);
  } finally {
    db.close();
  }
}

function createQueueTables(db: DatabaseSync) {
  createFamilyRuntimeQueueTables(db);
}

function insertMasDefaultExecutorTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    status: 'queued' | 'running' | 'succeeded' | 'blocked';
    createdAt: string;
    lastError?: string | null;
    deadLetterReason?: string | null;
  },
) {
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status, attempts,
      max_attempts, source, requires_approval, approved_at, lease_owner, lease_expires_at,
      last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    'medautoscience',
    'domain_owner/default-executor-dispatch',
    '{}',
    null,
    0,
    input.status,
    1,
    3,
    'test',
    0,
    null,
    null,
    null,
    input.lastError ?? null,
    input.deadLetterReason ?? null,
    input.createdAt,
    input.createdAt,
  );
}

function insertDomainRouteTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    status: 'queued' | 'running' | 'succeeded' | 'blocked';
    createdAt: string;
  },
) {
  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status, attempts,
      max_attempts, source, requires_approval, approved_at, lease_owner, lease_expires_at,
      last_error, dead_letter_reason, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.taskId,
    'medautoscience',
    'domain_route/reconcile-apply',
    '{}',
    null,
    0,
    input.status,
    1,
    3,
    'test',
    0,
    null,
    null,
    null,
    null,
    null,
    input.createdAt,
    input.createdAt,
  );
}

function blockedTemporalObservation(input: {
  stageAttemptId: string;
  workflowId: string;
  createdAt: string;
}) {
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    workflow_status: 'COMPLETED',
    query: {
      surface_kind: 'temporal_stage_attempt_query',
      provider_kind: 'temporal',
      stage_attempt_id: input.stageAttemptId,
      workflow_id: input.workflowId,
      domain_id: 'medautoscience',
      stage_id: 'domain_owner/default-executor-dispatch',
      status: 'blocked',
      started_at: input.createdAt,
      updated_at: input.createdAt,
      activity_events: [],
      checkpoint_refs: ['checkpoint:mas-default-writer-start'],
      closeout_refs: [],
      consumed_refs: [],
      consumed_memory_refs: [],
      writeback_receipt_refs: [],
      rejected_writes: [],
      next_owner: 'med-autoscience',
      route_impact: {},
      human_gate_refs: [],
      signals: [],
      closeout_packet: { blocked_reason: 'typed_closeout_packet_required' },
      completion_boundary: {
        provider_completion: 'not_completed',
        domain_ready_verdict: null,
        provider_completion_is_domain_ready: false,
      },
      authority_boundary: {
        opl: 'temporal_workflow_transport_and_control_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    },
  } as const;
}

function failedTemporalObservation(input: {
  stageAttemptId: string;
  workflowId: string;
  createdAt: string;
}) {
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    workflow_status: 'FAILED',
    query: {
      surface_kind: 'temporal_stage_attempt_query',
      provider_kind: 'temporal',
      stage_attempt_id: input.stageAttemptId,
      workflow_id: input.workflowId,
      domain_id: 'medautoscience',
      stage_id: 'domain_owner/default-executor-dispatch',
      status: 'failed',
      started_at: input.createdAt,
      updated_at: input.createdAt,
      activity_events: [],
      checkpoint_refs: ['checkpoint:mas-default-writer-start'],
      closeout_refs: [],
      consumed_refs: [],
      consumed_memory_refs: [],
      writeback_receipt_refs: [],
      rejected_writes: [],
      next_owner: 'med-autoscience',
      route_impact: {},
      human_gate_refs: [],
      signals: [],
      closeout_packet: null,
      completion_boundary: {
        provider_completion: 'not_completed',
        domain_ready_verdict: null,
        provider_completion_is_domain_ready: false,
      },
      authority_boundary: {
        opl: 'temporal_workflow_transport_and_control_metadata_only',
        domain: 'truth_quality_artifact_gate_owner',
      },
    },
  } as const;
}

function canceledTemporalObservation(input: {
  stageAttemptId: string;
  workflowId: string;
  workflowStatus?: 'CANCELED' | 'CANCELLED';
}) {
  const workflowStatus = input.workflowStatus ?? 'CANCELED';
  return {
    surface_kind: 'temporal_stage_attempt_query_receipt',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    workflow_status: workflowStatus,
    query_error: {
      code: 'temporal_stage_attempt_query_unavailable_after_terminal',
      message: `Temporal workflow is already ${workflowStatus}; terminal cancellation is sufficient for provider sync.`,
    },
    authority_boundary: {
      opl: 'temporal_workflow_transport_and_control_metadata_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  } as const;
}

function missingWorkflowObservation(input: {
  stageAttemptId: string;
  workflowId: string;
}) {
  return {
    surface_kind: 'temporal_stage_attempt_query_unavailable',
    provider_kind: 'temporal',
    stage_attempt_id: input.stageAttemptId,
    workflow_id: input.workflowId,
    status: 'unavailable',
    reason: 'temporal_workflow_not_started_or_not_found',
    error: {
      code: 'temporal_workflow_not_found',
      message: 'workflow not found',
    },
  } as const;
}

function createMasDefaultExecutorAttempt(
  db: DatabaseSync,
  input: {
    taskId?: string;
    sourceFingerprint?: string;
  } = {},
) {
  return createStageAttempt(db, {
    domainId: 'medautoscience',
    stageId: 'domain_owner/default-executor-dispatch',
    providerKind: 'temporal',
    workspaceLocator: { workspace_root: '/tmp/mas' },
    sourceFingerprint: input.sourceFingerprint ?? 'sha256:mas-default-dispatch',
    executorKind: 'codex_cli',
    taskId: input.taskId,
    checkpointRefs: ['dispatch:mas-default-writer-start'],
  }).attempt;
}

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
