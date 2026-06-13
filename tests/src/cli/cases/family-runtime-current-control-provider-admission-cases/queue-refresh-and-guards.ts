import {
  assert,
  DatabaseSync,
  createQueueTables,
  currentControlAdmissionPayload,
  enqueueTask,
  ensureProviderHostedStageAttempt,
  familyRuntimeEnv,
  fs,
  insertCompletedCurrentControlStageAttempt,
  insertQueuedTask,
  insertSucceededTask,
  os,
  path,
  providerObservationBoundary,
  record,
  runCli,
  test,
  writeJsonEmitterScript,
} from './shared.ts';
import type { FamilyRuntimeTaskRow } from './shared.ts';

test('family-runtime rehydrates terminal MAS current-control admission only when currentness identity is fresh', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-terminal-admission';
    const dedupeKey = 'owner-route::002-dm-china-us-mortality-attribution::current-control-admission';
    const firstPayload = currentControlAdmissionPayload('truth-snapshot::dm002-generation-1', '01');
    insertSucceededTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: firstPayload,
      dedupeKey,
    });

    const identical = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: firstPayload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const freshPayload = currentControlAdmissionPayload('truth-snapshot::dm002-generation-2', '02');
    const fresh = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare('SELECT status, attempts, payload_json FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      attempts: number;
      payload_json: string;
    };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const payload = JSON.parse(task.payload_json);

    assert.equal(identical.accepted, false);
    assert.equal(identical.idempotent_noop, true);
    assert.equal(identical.task?.status, 'succeeded');
    assert.equal(fresh.accepted, true);
    assert.equal(fresh.requeued_from_terminal, true);
    assert.equal(fresh.idempotent_noop, false);
    assert.equal(fresh.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(payload.source_fingerprint, 'truth-snapshot::dm002-generation-2');
    assert.equal(payload.owner_route_currentness_basis.truth_epoch, 'truth-event-02');
    assert.ok(requeueEvent);
    assert.equal(
      JSON.parse(requeueEvent.payload_json).reason,
      'mas_current_control_provider_admission_fresh_after_succeeded',
    );
  } finally {
    db.close();
  }
});

test('family-runtime rehydrates terminal MAS current-control admission when stage attempt identity is stale', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-terminal-attempt-stale-admission';
    const stageAttemptId = 'sat_current_control_attempt_stale_identity';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-admission';
    const workUnitFingerprint = 'sha256:same-current-control-work-unit';
    const staleAttemptPayload: Record<string, any> = currentControlAdmissionPayload(
      'truth-snapshot::dm003-generation-1',
      '01',
      workUnitFingerprint,
    );
    const freshPayload: Record<string, any> = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-generation-2',
        '02',
        workUnitFingerprint,
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    };
    insertSucceededTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
    });
    insertCompletedCurrentControlStageAttempt(db, {
      taskId,
      stageAttemptId,
      payload: staleAttemptPayload,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare('SELECT status, attempts, payload_json FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      attempts: number;
      payload_json: string;
    };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const payload = JSON.parse(task.payload_json);
    const eventPayload = requeueEvent ? JSON.parse(requeueEvent.payload_json) : null;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(payload.source_fingerprint, 'truth-snapshot::dm003-generation-2');
    assert.equal(payload.owner_route_currentness_basis.truth_epoch, 'truth-event-02');
    assert.ok(requeueEvent);
    assert.equal(
      eventPayload.reason,
      'mas_current_control_provider_admission_fresh_after_terminal_attempt',
    );
    assert.equal(eventPayload.terminal_stage_attempt_id, stageAttemptId);
    assert.equal(
      eventPayload.terminal_currentness_identity.source_fingerprint,
      'truth-snapshot::dm003-generation-1',
    );
    assert.equal(
      eventPayload.next_currentness_identity.source_fingerprint,
      'truth-snapshot::dm003-generation-2',
    );
  } finally {
    db.close();
  }
});

test('family-runtime rehydrates blocked MAS current-control admission when terminal attempts are stale', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-blocked-stale-terminal-attempts';
    const stageAttemptId = 'sat_current_control_blocked_stale_terminal';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-blocked-stale';
    const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
    const staleAttemptPayload: Record<string, any> = currentControlAdmissionPayload(
      workUnitFingerprint,
      '01',
      workUnitFingerprint,
    );
    staleAttemptPayload.owner_route_currentness_basis = {
      ...staleAttemptPayload.owner_route_currentness_basis,
      source_eval_id:
        'publication-eval::003-dpcc-primary-care-phenotype-treatment-gap::003-dpcc-primary-care-phenotype-treatment-gap::2026-06-12T20:06:05+00:00',
    };
    const freshPayload: Record<string, any> = {
      ...currentControlAdmissionPayload(
        workUnitFingerprint,
        '02',
        workUnitFingerprint,
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_quality_repair_batch',
      next_executable_owner: 'write',
      work_unit_id: 'medical_prose_write_repair',
      required_output_surface: 'artifacts/controller/repair_execution_evidence/latest.json',
    };
    freshPayload.owner_route_currentness_basis = {
      ...freshPayload.owner_route_currentness_basis,
      work_unit_id: 'medical_prose_write_repair',
      source_eval_id:
        'publication-eval::003-dpcc-primary-care-phenotype-treatment-gap::003-dpcc-primary-care-phenotype-treatment-gap::2026-06-13T00:48:48+00:00',
    };
    insertQueuedTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
    });
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked', attempts = 1,
        last_error = 'default executor dispatch has no launchable Temporal Codex stage attempt.',
        dead_letter_reason = 'temporal_stage_attempt_start_failed'
      WHERE task_id = ?
    `).run(taskId);
    insertCompletedCurrentControlStageAttempt(db, {
      taskId,
      stageAttemptId,
      payload: staleAttemptPayload,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare(`
      SELECT status, attempts, last_error, dead_letter_reason, payload_json
      FROM tasks
      WHERE task_id = ?
    `).get(taskId) as {
      status: string;
      attempts: number;
      last_error: string | null;
      dead_letter_reason: string | null;
      payload_json: string;
    };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const eventPayload = requeueEvent ? JSON.parse(requeueEvent.payload_json) : null;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(task.last_error, null);
    assert.equal(task.dead_letter_reason, null);
    assert.ok(requeueEvent);
    assert.equal(
      eventPayload.reason,
      'mas_current_control_provider_admission_fresh_after_terminal_attempt',
    );
    assert.equal(eventPayload.terminal_stage_attempt_id, stageAttemptId);
    assert.equal(
      eventPayload.terminal_currentness_identity.source_eval_id,
      'publication-eval::003-dpcc-primary-care-phenotype-treatment-gap::003-dpcc-primary-care-phenotype-treatment-gap::2026-06-12T20:06:05+00:00',
    );
    assert.equal(
      eventPayload.next_currentness_identity.source_eval_id,
      'publication-eval::003-dpcc-primary-care-phenotype-treatment-gap::003-dpcc-primary-care-phenotype-treatment-gap::2026-06-13T00:48:48+00:00',
    );
  } finally {
    db.close();
  }
});

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

test('family-runtime enqueue replaces stale queued MAS current-control admission for newer work-unit fingerprint', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-queued-stale-admission';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-admission';
    const stalePayload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-generation-1',
        '01',
        'current-ai-reviewer-gate-replay::003::old-record',
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_gate_clearing_batch',
      next_executable_owner: 'finalize',
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    stalePayload.owner_route_currentness_basis = {
      ...stalePayload.owner_route_currentness_basis,
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    const freshPayload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-generation-2',
        '02',
        'current-ai-reviewer-gate-replay::003::20260611T122549Z::sat_64c5fb484e8ee7b3971786ee',
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_gate_clearing_batch',
      next_executable_owner: 'finalize',
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    freshPayload.owner_route_currentness_basis = {
      ...freshPayload.owner_route_currentness_basis,
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    insertQueuedTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: stalePayload,
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare('SELECT status, attempts, payload_json FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      attempts: number;
      payload_json: string;
    };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const payload = JSON.parse(task.payload_json);
    const eventPayload = requeueEvent ? JSON.parse(requeueEvent.payload_json) : null;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, false);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(payload.source_fingerprint, 'truth-snapshot::dm003-generation-2');
    assert.equal(
      payload.owner_route_currentness_basis.work_unit_fingerprint,
      'current-ai-reviewer-gate-replay::003::20260611T122549Z::sat_64c5fb484e8ee7b3971786ee',
    );
    assert.ok(requeueEvent);
    assert.equal(
      eventPayload.reason,
      'mas_current_control_provider_admission_fresh_after_queued',
    );
    assert.equal(
      eventPayload.previous_currentness_identity.work_unit_fingerprint,
      'current-ai-reviewer-gate-replay::003::old-record',
    );
    assert.equal(eventPayload.next_status, 'queued');
    assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    assert.equal(eventPayload.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    db.close();
  }
});

test('family-runtime stage attempt locator keeps fresh MAS payload fingerprint ahead of stale nested owner-route basis', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const payload = {
      ...currentControlAdmissionPayload(
        'sha256:fresh-source',
        '03',
        'sha256:fresh-top-level-work-unit',
      ),
      owner_route: {
        currentness_contract: {
          basis: {
            work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
            work_unit_fingerprint: 'sha256:stale-nested-owner-route-basis',
            truth_epoch: 'truth-event-stale',
            runtime_health_epoch: 'runtime-health-event-stale',
          },
        },
        source_refs: {
          owner_route_currentness_basis: {
            work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
            work_unit_fingerprint: 'sha256:fresh-top-level-work-unit',
            truth_epoch: 'truth-event-03',
            runtime_health_epoch: 'runtime-health-event-03',
          },
        },
        work_unit_fingerprint: 'sha256:fresh-top-level-work-unit',
        source_fingerprint: 'sha256:fresh-source',
      },
      owner_route_currentness_basis: undefined,
    };
    const taskId = 'task-mas-current-control-fresh-payload-over-stale-nested-basis';
    insertQueuedTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey: 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::fresh-payload-over-stale-nested',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow;
    const attempt = ensureProviderHostedStageAttempt(db, row, payload);

    assert.ok(attempt);
    assert.equal(
      attempt.workspace_locator.work_unit_fingerprint,
      'sha256:fresh-top-level-work-unit',
    );
    assert.equal(attempt.workspace_locator.domain_source_fingerprint, 'sha256:fresh-source');
    const ownerRoute = record(attempt.workspace_locator.owner_route);
    const currentnessContract = record(ownerRoute.currentness_contract);
    const basis = record(currentnessContract.basis);
    assert.equal(
      basis.work_unit_fingerprint,
      'sha256:stale-nested-owner-route-basis',
    );
  } finally {
    db.close();
  }
});

test('family-runtime enqueue keeps stale queued MAS current-control admission behind approval gate when refreshed', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-waiting-stale-admission';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-admission-held';
    const stalePayload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-generation-1',
        '01',
        'current-ai-reviewer-gate-replay::003::old-held-record',
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_gate_clearing_batch',
      next_executable_owner: 'finalize',
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    stalePayload.owner_route_currentness_basis = {
      ...stalePayload.owner_route_currentness_basis,
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    const freshPayload = {
      ...currentControlAdmissionPayload(
        'truth-snapshot::dm003-generation-2',
        '02',
        'current-ai-reviewer-gate-replay::003::held-fresh-record',
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_gate_clearing_batch',
      next_executable_owner: 'finalize',
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    freshPayload.owner_route_currentness_basis = {
      ...freshPayload.owner_route_currentness_basis,
      work_unit_id: 'dpcc_publication_gate_replay_after_current_ai_reviewer_record',
    };
    insertQueuedTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: stalePayload,
      dedupeKey,
      status: 'waiting_approval',
      requiresApproval: true,
      lastError: 'operator_hold:publication_gate_review',
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: freshPayload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare('SELECT status, attempts, requires_approval, last_error, payload_json FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      attempts: number;
      requires_approval: number;
      last_error: string | null;
      payload_json: string;
    };
    const requeueEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const payload = JSON.parse(task.payload_json);
    const eventPayload = requeueEvent ? JSON.parse(requeueEvent.payload_json) : null;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, false);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'waiting_approval');
    assert.equal(result.task?.requires_approval, true);
    assert.equal(result.task?.approved_at, null);
    assert.equal(task.status, 'waiting_approval');
    assert.equal(task.requires_approval, 1);
    assert.equal(task.last_error, 'operator_hold:publication_gate_review');
    assert.equal(task.attempts, 0);
    assert.equal(payload.action_type, 'run_gate_clearing_batch');
    assert.equal(payload.next_executable_owner, 'finalize');
    assert.equal(payload.source_fingerprint, 'truth-snapshot::dm003-generation-2');
    assert.equal(
      payload.owner_route_currentness_basis.work_unit_fingerprint,
      'current-ai-reviewer-gate-replay::003::held-fresh-record',
    );
    assert.ok(requeueEvent);
    assert.equal(
      eventPayload.reason,
      'mas_current_control_provider_admission_fresh_after_queued',
    );
    assert.equal(eventPayload.previous_status, 'waiting_approval');
    assert.equal(eventPayload.next_status, 'waiting_approval');
    assert.equal(
      eventPayload.previous_currentness_identity.work_unit_fingerprint,
      'current-ai-reviewer-gate-replay::003::old-held-record',
    );
    assert.equal(
      eventPayload.next_currentness_identity.work_unit_fingerprint,
      'current-ai-reviewer-gate-replay::003::held-fresh-record',
    );
    assert.equal(eventPayload.authority_boundary.domain_truth_mutation, false);
    assert.equal(eventPayload.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    db.close();
  }
});

test('family-runtime enqueue treats concurrent dedupe-key insert as idempotent noop', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-admission-race';
    const payload = currentControlAdmissionPayload(
      'truth-snapshot::dm003-generation-race',
      'race',
      'sha256:concurrent-current-control-work-unit',
    );
    const concurrentTaskId = 'task-concurrent-current-control-admission';
    let selectCount = 0;
    let insertedConcurrentTask = false;
    const raceDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== 'prepare') {
          return Reflect.get(target, prop, receiver);
        }
        return (sql: string) => {
          const statement = target.prepare(sql);
          const normalizedSql = sql.replace(/\s+/g, ' ').trim();
          if (normalizedSql === 'SELECT * FROM tasks WHERE dedupe_key = ?') {
            return {
              get(...args: Parameters<typeof statement.get>) {
                selectCount += 1;
                if (selectCount === 1) {
                  return undefined;
                }
                return statement.get(...args);
              },
            };
          }
          if (normalizedSql.startsWith('INSERT INTO tasks(')) {
            return {
              run(...args: Parameters<typeof statement.run>) {
                if (!insertedConcurrentTask) {
                  insertedConcurrentTask = true;
                  insertSucceededTask(db, {
                    taskId: concurrentTaskId,
                    domainId: 'medautoscience',
                    taskKind: 'domain_owner/default-executor-dispatch',
                    payload,
                    dedupeKey,
                  });
                }
                return statement.run(...args);
              },
            };
          }
          return statement;
        };
      },
    }) as DatabaseSync;

    const result = enqueueTask(raceDb, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-current-control-concurrent-intake',
    });
    const event = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_enqueue_dedupe_race_noop'
      LIMIT 1
    `).get(concurrentTaskId) as { payload_json: string } | undefined;

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.task?.task_id, concurrentTaskId);
    assert.equal(result.task?.status, 'succeeded');
    assert.ok(event);
    assert.equal(
      JSON.parse(event.payload_json).reason,
      'concurrent_enqueue_dedupe_key_won_by_existing_task',
    );
  } finally {
    db.close();
  }
});

test('family-runtime intake blocks current-control provider candidates that claim domain completion authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-authority-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-authority-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:current-dm002',
        action_fingerprint: 'sha256:current-dm002',
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_completion_is_domain_completion: true,
        stage_transition_authority_boundary: providerObservationBoundary(),
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_provider_completion_claims_domain_completion',
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake blocks current-control provider candidates without Stage Authority boundary', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-boundary-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-boundary-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const exportPath = path.join(fixtureRoot, 'export');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:current-dm002',
        action_fingerprint: 'sha256:current-dm002',
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_completion_is_domain_completion: false,
      },
      {
        status: 'provider_admission_pending',
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:current-dm003',
        action_fingerprint: 'sha256:current-dm003',
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: {
          ...providerObservationBoundary(),
          intent_can_publish_current_owner_delta: true,
        },
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 2);
    assert.deepEqual(
      intake.family_runtime_intake.exports[0].blocked.map((entry: { reason: string }) => entry.reason),
      [
        'current_control_provider_admission_missing_stage_authority_boundary',
        'current_control_provider_admission_missing_stage_authority_boundary',
      ],
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
