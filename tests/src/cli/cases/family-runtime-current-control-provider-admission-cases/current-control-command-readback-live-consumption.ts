import {
  assert,
  DatabaseSync,
  createQueueTables,
  currentControlCommandOutboxRecord,
  enqueueTask,
  insertSucceededTask,
  test,
} from './shared.ts';

test('family-runtime requeues transport-only MAS admission when live readback is nested under provider admission identity', () => {
  const db = new DatabaseSync(':memory:');
  try {
    createQueueTables(db);
    const taskId = 'task-mas-current-control-nested-live-readback';
    const dedupeKey = 'paper-policy-request:1a379264039c75d0e9cfd8f5';
    const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
    const actionType = 'run_quality_repair_batch';
    const workUnitId = 'medical_prose_write_repair';
    const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
    const stagePacketRef = [
      'studies',
      studyId,
      'artifacts',
      'supervision',
      'consumer',
      'default_executor_dispatches',
      'immutable',
      actionType,
      '33abc53e0c18295f5fa03738.json',
    ].join('/');
    const existingPayload: Record<string, any> = {
      profile: '/tmp/dm-cvd.profile.toml',
      study_id: studyId,
      quest_id: studyId,
      action_type: actionType,
      dispatch_authority: 'domain_owner_transition_request',
      next_executable_owner: 'write',
      executor_kind: 'codex_cli_default',
      dispatch_ref: `studies/${studyId}/artifacts/supervision/consumer/default_executor_dispatches/${actionType}.json`,
      stage_packet_ref: stagePacketRef,
      checkpoint_refs: [stagePacketRef],
      stage_packet_refs: [stagePacketRef],
      authority_boundary: 'mas_default_executor_dispatch_request_only',
      workspace_root: '/tmp/dm-cvd-workspace',
      source_fingerprint: workUnitFingerprint,
      route_identity_key: dedupeKey,
      attempt_idempotency_key: dedupeKey,
      work_unit_id: workUnitId,
      work_unit_fingerprint: workUnitFingerprint,
      action_fingerprint: workUnitFingerprint,
      provider_attempt_or_lease_required: true,
      provider_completion_is_domain_completion: false,
      owner_route_current: true,
    };
    const command: Record<string, any> = currentControlCommandOutboxRecord({
      studyId,
      actionType,
      workUnitId,
      workUnitFingerprint,
      sourceGeneration: 'truth-event-000035-39f0b8e96689a623',
      idempotencyKey: dedupeKey,
    });
    const liveReadback = {
      surface_kind: 'opl_domain_progress_transition_runtime_live_readback',
      runtime_id: 'opl_domain_progress_transition_runtime',
      storage_contract: 'append_only_physical_jsonl',
      runtime_readback_status: 'complete_transaction',
      transaction_complete: true,
      append_only_log_entry_count: 1,
      causality: {
        command_id: command.command_id,
        event_id: `event:${dedupeKey}`,
        outbox_item_id: `outbox:${dedupeKey}`,
        transaction_id: `transaction:${dedupeKey}`,
        source_generation: 'truth-event-000035-39f0b8e96689a623',
        expected_version: 'truth-event-000035-39f0b8e96689a623',
        same_transaction_event_and_outbox: true,
        runtime_readback_status: 'complete_transaction',
        transaction_complete: true,
      },
      identity: {
        surface_kind: 'opl_domain_progress_transition_identity',
        command_id: command.command_id,
        idempotency_key: dedupeKey,
        transition_kind: 'StartProviderAttempt',
        aggregate_identity: {
          aggregate_kind: 'study_work_unit',
          aggregate_id: `${studyId}::${workUnitId}`,
          study_id: studyId,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
        },
        stage_run_identity: {
          stage_run_id: `stage-run:${studyId}:${workUnitId}`,
          route_identity_key: dedupeKey,
          attempt_idempotency_key: dedupeKey,
          provider_attempt_ref: `opl://provider-admission/${studyId}/${dedupeKey}`,
          attempt_lease_ref: `opl://attempt-leases/${dedupeKey}`,
          source_generation: 'truth-event-000035-39f0b8e96689a623',
        },
      },
      latest_transaction_readback: {
        command_present: true,
        event_present: true,
        outbox_item_present: true,
        same_outbox_identity: true,
        same_transaction_event_and_outbox: true,
        same_stage_run_identity: true,
        event_id: `event:${dedupeKey}`,
        outbox_item_id: `outbox:${dedupeKey}`,
        transition_event_id: `event:${dedupeKey}`,
        outbox_transition_event_id: `event:${dedupeKey}`,
        stage_run_identity_readback: {
          stage_run_id: `stage-run:${studyId}:${workUnitId}`,
          route_identity_key: dedupeKey,
          attempt_idempotency_key: dedupeKey,
          provider_attempt_ref: `opl://provider-admission/${studyId}/${dedupeKey}`,
          attempt_lease_ref: `opl://attempt-leases/${dedupeKey}`,
        },
      },
      authority_boundary: {
        authority: false,
        runtime_owner: 'one-person-lab',
        opl_can_write_domain_truth: false,
        opl_can_create_domain_owner_receipt: false,
        opl_can_create_domain_typed_blocker: false,
        provider_completion_is_domain_completion: false,
        provider_completion_is_domain_ready: false,
        read_model_can_execute: false,
        projection_can_authorize_provider_admission: false,
      },
      replay_audit: {
        read_model_projection_consumable: true,
      },
      read_model_readback: {
        latest_transaction_identity: {
          transaction_id: `transaction:${dedupeKey}`,
          command_id: command.command_id,
          event_id: `event:${dedupeKey}`,
          outbox_item_id: `outbox:${dedupeKey}`,
          same_transaction_event_and_outbox: true,
          transaction_complete: true,
          same_stage_run_identity: true,
        },
        latest_outbox_identity: {
          outbox_item_id: `outbox:${dedupeKey}`,
          outbox_kind: 'start_provider_attempt',
          outbox_dedupe_key: dedupeKey,
          transition_event_id: `event:${dedupeKey}`,
        },
        latest_stage_run_identity: {
          stage_run_id: `stage-run:${studyId}:${workUnitId}`,
          route_identity_key: dedupeKey,
          attempt_idempotency_key: dedupeKey,
          provider_attempt_ref: `opl://provider-admission/${studyId}/${dedupeKey}`,
          attempt_lease_ref: `opl://attempt-leases/${dedupeKey}`,
          source_generation: 'truth-event-000035-39f0b8e96689a623',
        },
      },
      exactly_one_outcome: {
        selected: true,
        exactly_one_transition: true,
        transition_kind: 'StartProviderAttempt',
        outcome_kind: 'provider_admission_enqueued_or_blocked',
        non_advancing_apply: false,
      },
      projection_metadata: {
        surface_kind: 'opl_domain_progress_projection_metadata',
        runtime_id: 'opl_domain_progress_transition_runtime',
        authority: false,
        projection_role: 'complete_runtime_readback',
        read_model_projection_consumable: true,
        runtime_readback_status: 'complete_transaction',
        transaction_complete: true,
        observed_generation: 'truth-event-000035-39f0b8e96689a623',
        derived_generation: 'truth-event-000035-39f0b8e96689a623',
        lag_status: 'current',
      },
    };
    const runtimeResult = {
      surface_kind: 'opl_domain_progress_transition_runtime_result',
      runtime_id: 'opl_domain_progress_transition_runtime',
      command,
      transition_event: {
        surface_kind: 'opl_domain_progress_transition_event',
        transition_kind: 'StartProviderAttempt',
        command_id: command.command_id,
        idempotency_key: dedupeKey,
        aggregate_identity: command.aggregate_identity,
        stage_run_identity: liveReadback.identity.stage_run_identity,
        exactly_one_transition: true,
        outcome: {
          kind: 'provider_admission_enqueued_or_blocked',
          stable_outcome: true,
        },
      },
      transactional_outbox_item: {
        surface_kind: 'opl_domain_progress_transition_outbox_item',
        outbox_kind: 'start_provider_attempt',
        dispatch_allowed: true,
        idempotency_key: dedupeKey,
        aggregate_identity: command.aggregate_identity,
        stage_run_identity: liveReadback.identity.stage_run_identity,
      },
      projection_metadata: liveReadback.projection_metadata,
      read_model_rebuild_metadata: {
        surface_kind: 'opl_domain_progress_read_model_rebuild_metadata',
        runtime_id: 'opl_domain_progress_transition_runtime',
        authority: false,
        observed_generation: 'truth-event-000035-39f0b8e96689a623',
        derived_generation: 'truth-event-000035-39f0b8e96689a623',
      },
      idempotency_readback: {
        surface_kind: 'opl_domain_progress_transition_idempotency_log_readback',
        runtime_id: 'opl_domain_progress_transition_runtime',
        idempotency_key: dedupeKey,
        found: true,
      },
    };
    const nextPayload: Record<string, any> = {
      ...existingPayload,
      provider_admission_schema_source: 'transition_request_pending_task',
      owner_route_currentness_basis: {
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        truth_epoch: 'truth-event-000035-39f0b8e96689a623',
        runtime_health_epoch: 'runtime-health-event-006980-c004aeb3b04b4dc7',
        action_fingerprint: workUnitFingerprint,
        route_epoch: workUnitFingerprint,
        source_fingerprint: workUnitFingerprint,
      },
      current_control_command: command,
      domain_progress_transition_runtime: runtimeResult,
      provider_admission_identity: {
        ...existingPayload,
        status: 'provider_admission_pending',
        current_control_command: command,
        domain_progress_transition_runtime: runtimeResult,
        opl_domain_progress_transition_runtime_live_readback: liveReadback,
        opl_domain_progress_transition_live_readback: liveReadback,
        opl_transition_event: runtimeResult.transition_event,
        opl_transition_outbox_item: runtimeResult.transactional_outbox_item,
        projection_metadata: runtimeResult.projection_metadata,
        read_model_rebuild_metadata: runtimeResult.read_model_rebuild_metadata,
        transition_idempotency_readback: runtimeResult.idempotency_readback,
      },
    };
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
      source: 'test-current-control-nested-live-readback',
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
    const payload = JSON.parse(task.payload_json);
    const eventPayload = event ? JSON.parse(event.payload_json) : null;

    assert.equal(result.accepted, true);
    assert.equal(result.requeued_from_terminal, true);
    assert.equal(result.idempotent_noop, false);
    assert.equal(result.task?.status, 'queued');
    assert.equal(task.status, 'queued');
    assert.equal(task.attempts, 0);
    assert.equal(payload.current_control_command_outbox_record.idempotency_key, dedupeKey);
    assert.deepEqual(payload.current_control_command_outbox_record, payload.current_control_command);
    assert.equal(
      payload.opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    assert.equal(
      payload.provider_admission_identity.current_control_command_outbox_record.idempotency_key,
      dedupeKey,
    );
    assert.equal(
      payload.provider_admission_identity.opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    assert.ok(eventPayload);
    assert.equal(
      eventPayload.reason,
      'mas_current_control_provider_admission_command_readback_completed_after_transport_only_succeeded',
    );
    assert.equal(eventPayload.currentness_identity.attempt_idempotency_key, dedupeKey);
  } finally {
    db.close();
  }
});
