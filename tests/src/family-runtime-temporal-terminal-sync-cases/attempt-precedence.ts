import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createStageAttempt,
  ingestStageAttemptCloseout,
  inspectStageAttempt,
  syncStageAttemptFromTemporalTerminalObservation,
} from '../../../src/adapters/execution/family-runtime-stage-attempts.ts';
import { getStageAttemptRow } from '../../../src/adapters/execution/family-runtime-stage-attempt-ledger.ts';
import {
  blockLinkedDefaultExecutorTask,
  markLinkedDefaultExecutorTaskCompleted,
} from '../../../src/adapters/execution/family-runtime-linked-task-sync.ts';
import {
  blockedTemporalObservation,
  completedTemporalObservation,
  createMasDefaultExecutorAttempt,
  createQueueTables,
  failedTemporalObservation,
  insertMasDefaultExecutorTask,
  withStageAttemptDb,
} from './helpers.ts';

for (const role of ['reviewer', 're_reviewer'] as const) {
  test(`Accepted ${role} closeout survives a diagnostic with new refs and no verdict`, () => {
    withStageAttemptDb((db) => {
      const attempt = createStageAttempt(db, {
        domainId: 'example', stageId: 'review', providerKind: 'temporal',
        workspaceLocator: { workspace_root: '/tmp/review-projection' },
        sourceFingerprint: `sha256:${role}`, executorKind: 'domain_handler',
      }).attempt;
      db.prepare('UPDATE stage_attempts SET attempt_role = ? WHERE stage_attempt_id = ?')
        .run(role, attempt.stage_attempt_id);
      ingestStageAttemptCloseout(db, {
        stageAttemptId: attempt.stage_attempt_id,
        packet: {
          surface_kind: 'stage_attempt_closeout_packet',
          stage_attempt_id: attempt.stage_attempt_id,
          closeout_refs: ['receipt:accepted-review'],
          route_impact: { stage_quality_cycle: { outcome: 'pass' } },
        },
      });
      const before = inspectStageAttempt(db, attempt.stage_attempt_id);
      const diagnostic = completedTemporalObservation({
        stageAttemptId: attempt.stage_attempt_id, workflowId: attempt.workflow_id,
        createdAt: new Date().toISOString(), domainId: 'example', stageId: 'review',
      });
      for (let replay = 0; replay < 2; replay += 1) {
        syncStageAttemptFromTemporalTerminalObservation(db, diagnostic);
        const after = inspectStageAttempt(db, attempt.stage_attempt_id);
        assert.equal(after.status, 'completed');
        assert.deepEqual(after.route_impact, before.route_impact);
        assert.deepEqual(after.closeout_refs, before.closeout_refs);
        assert.equal(after.closeout_receipt_status, 'accepted_typed_closeout');
      }
      const updated = {
        ...diagnostic,
        query: { ...diagnostic.query, route_impact: { stage_quality_cycle: { outcome: 'quality_debt' } } },
      };
      syncStageAttemptFromTemporalTerminalObservation(db, updated);
      const afterUpdate = inspectStageAttempt(db, attempt.stage_attempt_id);
      assert.equal(afterUpdate.route_impact.stage_quality_cycle.outcome, 'quality_debt');
      assert.ok(afterUpdate.closeout_refs.includes('receipt:domain-closeout'));
    });
  });
}

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
            written_ref: 'artifacts/medical_paper/readiness_owner_receipt.json',
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
    db.exec('DROP TABLE tasks');
    markLinkedDefaultExecutorTaskCompleted(db, {
      row: getStageAttemptRow(db, newerAttempt.stage_attempt_id)!,
      observedAt: createdAt,
    });
    blockLinkedDefaultExecutorTask(db, {
      row: getStageAttemptRow(db, olderAttempt.stage_attempt_id)!,
      reason: 'temporal_workflow_failed',
      observedAt: createdAt,
      taskDeadLetterReason: 'temporal_stage_attempt_failed',
      eventType: 'stage_attempt_terminal_failed_task',
    });
    const olderSynced = inspectStageAttempt(db, olderAttempt.stage_attempt_id);
    const failureTaskEvents = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = 'stage_attempt_terminal_failed_task'",
    ).get('task-mas-default-newer-closeout-wins') as { count: number };

    assert.equal(olderSynced.status, 'completed');
    assert.equal(olderSynced.blocked_reason, null);
    assert.ok(olderSynced.closeout_refs.some((ref) => ref.endsWith('/failure-diagnostic')));
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
    db.exec('DROP TABLE tasks');
    blockLinkedDefaultExecutorTask(db, {
      row: getStageAttemptRow(db, olderAttempt.stage_attempt_id)!,
      reason: 'zero_readable_artifact',
      observedAt: createdAt,
      taskDeadLetterReason: 'temporal_stage_attempt_not_completed',
      eventType: 'stage_attempt_terminal_blocked_task',
    });
    const olderSynced = inspectStageAttempt(db, olderAttempt.stage_attempt_id);
    const blockerTaskEvents = db.prepare(
      "SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = 'stage_attempt_terminal_blocked_task'",
    ).get('task-mas-default-newer-redrive-running') as { count: number };

    assert.equal(olderSynced.status, 'completed');
    assert.equal(olderSynced.blocked_reason, null);
    assert.ok(olderSynced.closeout_refs.some((ref) => ref.includes('quality-debt-diagnostics')));
    assert.equal(inspectStageAttempt(db, newerAttempt.stage_attempt_id).status, 'running');
    assert.equal(blockerTaskEvents.count, 0);
  });
});

test('Duplicate linked terminal block calls write one event and notification', () => {
  withStageAttemptDb((db) => {
    const createdAt = new Date().toISOString();
    const taskId = 'task-mas-default-duplicate-block';
    createQueueTables(db);
    insertMasDefaultExecutorTask(db, { taskId, status: 'running', createdAt });
    const attempt = createMasDefaultExecutorAttempt(db, { taskId });
    db.prepare("UPDATE stage_attempts SET status = 'failed', blocked_reason = ?, updated_at = ? WHERE stage_attempt_id = ?")
      .run('temporal_workflow_failed', createdAt, attempt.stage_attempt_id);
    const input = {
      row: getStageAttemptRow(db, attempt.stage_attempt_id)!,
      reason: 'temporal_workflow_failed',
      observedAt: createdAt,
      taskDeadLetterReason: 'temporal_stage_attempt_failed',
      eventType: 'stage_attempt_terminal_failed_task',
    } as const;
    blockLinkedDefaultExecutorTask(db, input);
    blockLinkedDefaultExecutorTask(db, input);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM events WHERE task_id = ? AND event_type = ? AND json_extract(payload_json, '$.stage_attempt_id') = ?")
      .get(taskId, input.eventType, attempt.stage_attempt_id) as { count: number }).count, 1);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM notifications WHERE task_id = ? AND json_extract(payload_json, '$.stage_attempt_id') = ?")
      .get(taskId, attempt.stage_attempt_id) as { count: number }).count, 1);
  });
});
