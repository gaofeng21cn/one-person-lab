import './queued-refresh-and-authority-guards.ts';
import {
  assert,
  DatabaseSync,
  createQueueTables,
  currentControlAdmissionPayload,
  currentControlCommandOutboxRecord,
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
import { parseJsonText } from '../../../../../src/kernel/json-file.ts';

function parseJsonRecord(raw: string): any {
  return parseJsonText(raw) as any;
}

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
    const payload = parseJsonRecord(task.payload_json);

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
      parseJsonRecord(requeueEvent.payload_json).reason,
      'mas_current_control_provider_admission_fresh_after_succeeded',
    );
  } finally {
    db.close();
  }
});

test('family-runtime rehydrates succeeded MAS current-control admission when provider lease is still required', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-succeeded-still-provider-required';
    const dedupeKey = 'owner-route::002-dm-china-us-mortality-attribution::gate-replay-current';
    const payload = {
      ...currentControlAdmissionPayload(
        'sha256:c69e0d2890655ebc1e7a774e9a83dfe333cbc855bf85c3b2cdaf021289e8fc32',
        '40',
        'sha256:c69e0d2890655ebc1e7a774e9a83dfe333cbc855bf85c3b2cdaf021289e8fc32',
      ),
      study_id: '002-dm-china-us-mortality-attribution',
      quest_id: '002-dm-china-us-mortality-attribution',
      action_type: 'run_gate_clearing_batch',
      next_executable_owner: 'gate_clearing_batch',
      work_unit_id: 'publication_gate_replay',
      provider_attempt_or_lease_required: true,
      provider_admission_identity: {
        surface: 'opl_provider_admission_candidate',
        status: 'provider_admission_pending',
        action_type: 'run_gate_clearing_batch',
        work_unit_id: 'publication_gate_replay',
        work_unit_fingerprint: 'sha256:c69e0d2890655ebc1e7a774e9a83dfe333cbc855bf85c3b2cdaf021289e8fc32',
        action_fingerprint: 'sha256:c69e0d2890655ebc1e7a774e9a83dfe333cbc855bf85c3b2cdaf021289e8fc32',
        provider_attempt_or_lease_required: true,
        route_identity_key:
          'owner-route::002-dm-china-us-mortality-attribution::truth-event-000040::gate_clearing_batch::publication_gate_replay',
        attempt_idempotency_key:
          'owner-route::002-dm-china-us-mortality-attribution::truth-event-000040::gate_clearing_batch::publication_gate_replay',
      },
    };
    payload.owner_route_currentness_basis = {
      ...payload.owner_route_currentness_basis,
      work_unit_id: 'publication_gate_replay',
      truth_epoch: 'truth-event-000040',
      runtime_health_epoch: 'runtime-health-event-006940',
    };
    insertSucceededTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
      source: 'test-current-control-replay',
    });
    const task = db.prepare('SELECT status, attempts, payload_json FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      attempts: number;
      payload_json: string;
    };
    const event = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const eventPayload = event ? parseJsonRecord(event.payload_json) : null;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.ok(eventPayload);
    assert.equal(
      eventPayload.reason,
      'mas_current_control_provider_admission_still_required_after_succeeded',
    );
    assert.equal(eventPayload.currentness_identity.work_unit_id, 'publication_gate_replay');
    assert.equal(eventPayload.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    db.close();
  }
});

test('family-runtime requeues succeeded MAS admission when complete command readback arrives after transport-only row', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-transport-only-succeeded';
    const dedupeKey = 'paper-policy-request:1a379264039c75d0e9cfd8f5';
    const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
    const stagePacketRef = [
      'studies',
      '003-dpcc-primary-care-phenotype-treatment-gap',
      'immutable',
      'run_quality_repair_batch',
      '33abc53e0c18295f5fa03738.json',
    ].join('/');
    const existingPayload: Record<string, any> = {
      profile: '/tmp/dm-cvd.profile.toml',
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_quality_repair_batch',
      dispatch_authority: 'consumer_default_executor_dispatch',
      next_executable_owner: 'write',
      executor_kind: 'codex_cli_default',
      dispatch_ref:
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
      stage_packet_ref: stagePacketRef,
      checkpoint_refs: [stagePacketRef],
      stage_packet_refs: [stagePacketRef],
      authority_boundary: 'mas_default_executor_dispatch_request_only',
      workspace_root: '/tmp/dm-cvd-workspace',
      source_fingerprint: 'publication-blockers::0915410f804b3697',
      route_identity_key: dedupeKey,
      attempt_idempotency_key: dedupeKey,
      work_unit_id: 'medical_prose_write_repair',
      work_unit_fingerprint: workUnitFingerprint,
      action_fingerprint: workUnitFingerprint,
      provider_attempt_or_lease_required: true,
      provider_completion_is_domain_completion: false,
      owner_route_current: true,
    };
    const nextPayload: Record<string, any> = {
      ...currentControlAdmissionPayload(
        'publication-blockers::0915410f804b3697',
        '41',
        workUnitFingerprint,
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_quality_repair_batch',
      next_executable_owner: 'write',
      work_unit_id: 'medical_prose_write_repair',
      route_identity_key: dedupeKey,
      attempt_idempotency_key: dedupeKey,
      stage_packet_ref: stagePacketRef,
      checkpoint_refs: [stagePacketRef],
      stage_packet_refs: [stagePacketRef],
      provider_attempt_or_lease_required: true,
      provider_completion_is_domain_completion: false,
    };
    nextPayload.current_control_command_outbox_record = currentControlCommandOutboxRecord({
      studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
      actionType: 'run_quality_repair_batch',
      workUnitId: 'medical_prose_write_repair',
      workUnitFingerprint,
      sourceGeneration: 'truth-event-41',
      idempotencyKey: dedupeKey,
    });
    nextPayload.current_control_command = nextPayload.current_control_command_outbox_record;
    nextPayload.provider_admission_identity = {
      ...nextPayload.provider_admission_identity,
      status: 'provider_admission_pending',
      route_identity_key: dedupeKey,
      attempt_idempotency_key: dedupeKey,
      work_unit_id: 'medical_prose_write_repair',
      work_unit_fingerprint: workUnitFingerprint,
      action_fingerprint: workUnitFingerprint,
      provider_attempt_or_lease_required: true,
      current_control_command_outbox_record: nextPayload.current_control_command_outbox_record,
    };
    nextPayload.owner_route_currentness_basis = {
      ...nextPayload.owner_route_currentness_basis,
      work_unit_id: 'medical_prose_write_repair',
      work_unit_fingerprint: workUnitFingerprint,
      truth_epoch: 'truth-event-41',
      runtime_health_epoch: 'runtime-health-event-41',
    };
    nextPayload.opl_domain_progress_transition_runtime_live_readback = {
      surface_kind: 'opl_domain_progress_transition_runtime_live_readback',
      runtime_id: 'DomainProgressTransitionRuntime',
      runtime_readback_status: 'complete_transaction',
      transaction_complete: true,
      identity: {
        command_id: nextPayload.current_control_command_outbox_record.command_id,
        idempotency_key: dedupeKey,
      },
      latest_transaction_readback: {
        same_transaction_event_and_outbox: true,
        same_outbox_identity: true,
        same_stage_run_identity: true,
      },
    };
    nextPayload.provider_admission_identity.opl_domain_progress_transition_runtime_live_readback =
      nextPayload.opl_domain_progress_transition_runtime_live_readback;
    insertSucceededTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: existingPayload,
      dedupeKey,
    });

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: nextPayload,
      dedupeKey,
      source: 'test-current-control-command-readback',
    });
    const task = db.prepare('SELECT status, attempts, payload_json FROM tasks WHERE task_id = ?').get(taskId) as {
      status: string;
      attempts: number;
      payload_json: string;
    };
    const event = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_requeued_from_mas_current_control_provider_admission'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const payload = parseJsonRecord(task.payload_json);
    const eventPayload = event ? parseJsonRecord(event.payload_json) : null;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.deepEqual(payload.current_control_command_outbox_record, payload.current_control_command);
    assert.equal(payload.current_control_command_outbox_record.idempotency_key, dedupeKey);
    assert.ok(eventPayload);
    assert.equal(
      eventPayload.reason,
      'mas_current_control_provider_admission_command_readback_completed_after_transport_only_succeeded',
    );
    assert.equal(eventPayload.currentness_identity.attempt_idempotency_key, dedupeKey);
    assert.equal(eventPayload.authority_boundary.provider_completion_is_domain_ready, false);
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
    const payload = parseJsonRecord(task.payload_json);
    const eventPayload = requeueEvent ? parseJsonRecord(requeueEvent.payload_json) : null;

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

test('family-runtime consumes terminal MAS current-control admission when only volatile projection epochs changed', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-terminal-consumed-volatile-refresh';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::terminal-consumed';
    const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
    const payload: Record<string, any> = {
      ...currentControlAdmissionPayload(
        workUnitFingerprint,
        '01',
        workUnitFingerprint,
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_quality_repair_batch',
      next_executable_owner: 'write',
      work_unit_id: 'medical_prose_write_repair',
      route_identity_key: 'paper-policy-request:1a379264039c75d0e9cfd8f5',
      attempt_idempotency_key: 'paper-policy-request:1a379264039c75d0e9cfd8f5',
      stage_packet_ref:
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/77fa1796dc1d50c2b7687a9f.json',
      stage_packet_refs: [
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/77fa1796dc1d50c2b7687a9f.json',
      ],
    };
    payload.provider_admission_identity = {
      ...payload.provider_admission_identity,
      route_identity_key: payload.route_identity_key,
      attempt_idempotency_key: payload.attempt_idempotency_key,
      action_fingerprint: workUnitFingerprint,
      stage_packet_ref: payload.stage_packet_ref,
      stage_packet_refs: payload.stage_packet_refs,
    };
    payload.owner_route_currentness_basis = {
      ...payload.owner_route_currentness_basis,
      work_unit_id: 'medical_prose_write_repair',
      work_unit_fingerprint: workUnitFingerprint,
      truth_epoch: 'truth-event-stable-dm003',
      runtime_health_epoch: 'runtime-health-event-01',
      generated_at: '2026-06-17T14:55:58Z',
      currentness_digest_basis: {
        runtime_digest: 'runtime-volatile-01',
        stable_truth_digest: 'truth-stable-dm003',
        volatile_projection_digest: 'projection-volatile-01',
        work_unit_digest: 'work-unit-stable-dm003',
      },
    };
    const volatileRefreshPayload: Record<string, any> = {
      ...payload,
      owner_route_currentness_basis: {
        ...payload.owner_route_currentness_basis,
        runtime_health_epoch: 'runtime-health-event-02',
        generated_at: '2026-06-17T15:00:00Z',
        currentness_digest_basis: {
          ...payload.owner_route_currentness_basis.currentness_digest_basis,
          runtime_digest: 'runtime-volatile-02',
          volatile_projection_digest: 'projection-volatile-02',
        },
      },
    };
    insertSucceededTask(db, {
      taskId,
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey,
    });
    const taskRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow;
    const stageAttempt = ensureProviderHostedStageAttempt(db, taskRow, payload, {
      eventSource: 'test-current-control-terminal-consumption',
    });
    assert.ok(stageAttempt);
    const closeoutRefs = [
      `studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_execution/${stageAttempt.stage_attempt_id}.closeout.json`,
    ];
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'completed',
        closeout_refs_json = ?,
        provider_receipt_json = ?,
        provider_run_json = ?,
        closeout_receipt_status = 'accepted_typed_closeout'
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify(closeoutRefs),
      JSON.stringify({ closeout_refs: closeoutRefs }),
      JSON.stringify({ provider_status: 'completed' }),
      stageAttempt.stage_attempt_id,
    );

    const result = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: volatileRefreshPayload,
      dedupeKey,
      source: 'test-current-control-terminal-consumption',
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
    const consumedEvent = db.prepare(`
      SELECT payload_json
      FROM events
      WHERE task_id = ? AND event_type = 'task_current_control_provider_admission_already_consumed'
      LIMIT 1
    `).get(taskId) as { payload_json: string } | undefined;
    const eventPayload = consumedEvent ? parseJsonRecord(consumedEvent.payload_json) : null;

    assert.equal(result.accepted, false);
    assert.equal(result.idempotent_noop, true);
    assert.equal(result.requeued_from_terminal, false);
    assert.equal(result.task?.status, 'succeeded');
    assert.equal(task.status, 'succeeded');
    assert.equal(task.attempts, 0);
    assert.equal(parseJsonRecord(task.payload_json).owner_route_currentness_basis.runtime_health_epoch, 'runtime-health-event-01');
    assert.equal(requeueEvent, undefined);
    assert.ok(consumedEvent);
    assert.equal(eventPayload.reason, 'terminal_stage_attempt_consumed_same_transition_identity');
    assert.equal(eventPayload.terminal_stage_attempt_id, stageAttempt.stage_attempt_id);
    assert.equal(eventPayload.currentness_identity.attempt_idempotency_key, 'paper-policy-request:1a379264039c75d0e9cfd8f5');
    assert.equal(eventPayload.authority_boundary.provider_stage_attempt_started, false);
    assert.equal(eventPayload.authority_boundary.provider_completion_is_domain_ready, false);
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
    const eventPayload = requeueEvent ? parseJsonRecord(requeueEvent.payload_json) : null;

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
    const payload = parseJsonRecord(task.payload_json);
    const eventPayload = requeueEvent ? parseJsonRecord(requeueEvent.payload_json) : null;

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

test('family-runtime enqueue replaces same-fingerprint MAS current-control admission when stage packet identity changes', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-queued-stale-stage-packet';
    const dedupeKey = 'owner-route::003-dpcc-primary-care-phenotype-treatment-gap::current-control-stage-packet';
    const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
    const stalePayload = {
      ...currentControlAdmissionPayload(
        workUnitFingerprint,
        '01',
        workUnitFingerprint,
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_quality_repair_batch',
      next_executable_owner: 'write',
      work_unit_id: 'medical_prose_write_repair',
      stage_packet_ref:
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
      stage_packet_refs: [
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
      ],
    };
    stalePayload.owner_route_currentness_basis = {
      ...stalePayload.owner_route_currentness_basis,
      work_unit_id: 'medical_prose_write_repair',
    };
    const freshPayload = {
      ...currentControlAdmissionPayload(
        workUnitFingerprint,
        '01',
        workUnitFingerprint,
      ),
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      action_type: 'run_quality_repair_batch',
      next_executable_owner: 'write',
      work_unit_id: 'medical_prose_write_repair',
      stage_packet_ref:
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/77fa1796dc1d50c2b7687a9f.json',
      stage_packet_refs: [
        'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/77fa1796dc1d50c2b7687a9f.json',
      ],
    };
    freshPayload.owner_route_currentness_basis = {
      ...freshPayload.owner_route_currentness_basis,
      work_unit_id: 'medical_prose_write_repair',
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
      source: 'test-current-control-stage-packet-refresh',
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
    const payload = parseJsonRecord(task.payload_json);
    const eventPayload = requeueEvent ? parseJsonRecord(requeueEvent.payload_json) : null;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, false);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(
      payload.stage_packet_ref,
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/77fa1796dc1d50c2b7687a9f.json',
    );
    assert.ok(requeueEvent);
    assert.equal(
      eventPayload.reason,
      'mas_current_control_provider_admission_fresh_after_queued',
    );
    assert.equal(
      eventPayload.previous_currentness_identity.stage_packet_ref,
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
    );
    assert.equal(
      eventPayload.next_currentness_identity.stage_packet_ref,
      'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/supervision/consumer/default_executor_dispatches/immutable/run_quality_repair_batch/77fa1796dc1d50c2b7687a9f.json',
    );
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
