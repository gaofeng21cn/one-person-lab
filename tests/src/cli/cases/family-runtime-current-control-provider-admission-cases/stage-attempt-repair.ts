import {
  assert,
  DatabaseSync,
  createQueueTables,
  currentControlAdmissionPayload,
  enqueueTask,
  ensureProviderHostedStageAttempt,
  insertCompletedCurrentControlStageAttempt,
  insertQueuedTask,
  test,
} from './shared.ts';
import type { FamilyRuntimeTaskRow } from './shared.ts';

test('family-runtime clears stale running MAS current-control admission when linked attempt is terminal same identity', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-running-terminal-same-identity';
    const stageAttemptId = 'sat_current_control_terminal_same_identity';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-running-terminal';
    const payload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-terminal-same-identity',
        '03',
        'publication-blockers::terminal-same-identity',
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_quality_repair_batch',
      next_executable_owner: 'write',
      work_unit_id: 'medical_prose_write_repair',
      required_output_surface: 'artifacts/controller/repair_execution_evidence/latest.json',
    };
    payload.owner_route_currentness_basis = {
      ...payload.owner_route_currentness_basis,
      work_unit_id: 'medical_prose_write_repair',
    };
    insertQueuedTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
    });
    db.prepare(`
      UPDATE tasks
      SET status = 'running', attempts = 1, lease_owner = 'opl-family-runtime:test',
        lease_expires_at = '2099-01-01T00:00:00.000Z'
      WHERE task_id = ?
    `).run(taskId);
    insertCompletedCurrentControlStageAttempt(db, {
      taskId,
      stageAttemptId,
      payload,
      closeoutRefs: [
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_execution/sat_current_control_terminal_same_identity.closeout.json',
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller/repair_execution_evidence/latest.json',
      ],
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare(`
      SELECT status, attempts, lease_owner, lease_expires_at, last_error, dead_letter_reason
      FROM tasks
      WHERE task_id = ?
    `).get(taskId) as {
      status: string;
      attempts: number;
      lease_owner: string | null;
      lease_expires_at: string | null;
      last_error: string | null;
      dead_letter_reason: string | null;
    };
    const event = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_running_current_control_terminal_attempt_noop'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const eventPayload = event ? JSON.parse(event.payload_json) : null;

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.task?.status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.attempts, 1);
    assert.equal(task.lease_owner, null);
    assert.equal(task.lease_expires_at, null);
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.ok(event);
    assert.equal(eventPayload.reason, 'terminal_stage_attempt_same_currentness_clears_stale_running_queue_projection');
    assert.equal(eventPayload.terminal_stage_attempt_id, stageAttemptId);
    assert.equal(eventPayload.terminal_stage_attempt_status, 'completed');
    assert.deepEqual(eventPayload.closeout_refs, [
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_execution/sat_current_control_terminal_same_identity.closeout.json',
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/controller/repair_execution_evidence/latest.json',
    ]);
    assert.equal(eventPayload.currentness_identity.work_unit_id, 'medical_prose_write_repair');
    assert.equal(eventPayload.authority_boundary.provider_stage_attempt_started, false);
    assert.equal(eventPayload.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    db.close();
  }
});

test('family-runtime repairs queued MAS current-control admission when linked stage attempt is live', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-queued-with-live-attempt';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-queued-live';
    const payload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-live-attempt',
        '04',
        'publication-blockers::queued-live-attempt',
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_quality_repair_batch',
      next_executable_owner: 'write',
      work_unit_id: 'medical_prose_write_repair',
      required_output_surface: 'artifacts/controller/repair_execution_evidence/latest.json',
    };
    payload.owner_route_currentness_basis = {
      ...payload.owner_route_currentness_basis,
      work_unit_id: 'medical_prose_write_repair',
    };
    insertQueuedTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow;
    const attempt = ensureProviderHostedStageAttempt(db, row, payload);
    assert.ok(attempt);
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'running',
        provider_run_json = ?,
        updated_at = '2026-06-12T23:45:34.381Z'
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify({
        provider_status: 'running',
        last_heartbeat_at: '2026-06-12T23:45:34.381Z',
      }),
      attempt.stage_attempt_id,
    );

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare(`
      SELECT status, attempts, lease_owner, lease_expires_at, last_error, dead_letter_reason
      FROM tasks
      WHERE task_id = ?
    `).get(taskId) as {
      status: string;
      attempts: number;
      lease_owner: string | null;
      lease_expires_at: string | null;
      last_error: string | null;
      dead_letter_reason: string | null;
    };
    const event = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_default_executor_live_attempt_lease_refreshed'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const eventPayload = event ? JSON.parse(event.payload_json) : null;

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.task?.status, 'running');
    assert.equal(task.status, 'running');
    assert.equal(task.attempts, 1);
    assert.ok(task.lease_owner);
    assert.ok(task.lease_expires_at);
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.ok(event);
    assert.equal(eventPayload.reason, 'same_task_live_stage_attempt_exists_at_enqueue');
    assert.equal(eventPayload.previous_status, 'queued');
    assert.equal(eventPayload.next_status, 'running');
    assert.equal(eventPayload.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    assert.equal(eventPayload.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    db.close();
  }
});
