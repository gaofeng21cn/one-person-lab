import {
  assert,
  currentControlActionQueueItem,
  currentControlCommandOutboxRecord,
  DatabaseSync,
  familyRuntimeEnv,
  fs,
  ensureProviderHostedStageAttempt,
  os,
  path,
  providerObservationBoundary,
  record,
  runCli,
  test,
  writeDefaultExecutorDispatchPacket,
  writeJsonEmitterScript,
} from './shared.ts';
import type { FamilyRuntimeTaskRow } from './shared.ts';

test('family-runtime intake admits MAS current-control handoff action_queue provider candidates', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-action-queue-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-action-queue-'));
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
  const dm002DispatchRef = writeDefaultExecutorDispatchPacket(
    workspaceRoot,
    '002-dm-china-us-mortality-attribution',
    'return_to_ai_reviewer_workflow',
  );
  const dm003DispatchRef = writeDefaultExecutorDispatchPacket(
    workspaceRoot,
    '003-dpcc-primary-care-phenotype-treatment-gap',
    'return_to_ai_reviewer_workflow',
  );
  const dm002StagePacketRef = [
    'studies',
    '002-dm-china-us-mortality-attribution',
    'artifacts',
    'stage_packets',
    'return_to_ai_reviewer_workflow.stage-packet.json',
  ].join('/');
  const dm003StagePacketRef = [
    'studies',
    '003-dpcc-primary-care-phenotype-treatment-gap',
    'artifacts',
    'stage_packets',
    'return_to_ai_reviewer_workflow.stage-packet.json',
  ].join('/');
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state_handoff',
    schema_version: 1,
    generated_at: '2026-06-08T15:37:31+00:00',
    action_queue: [
      currentControlActionQueueItem({
        studyId: '002-dm-china-us-mortality-attribution',
        actionType: 'return_to_ai_reviewer_workflow',
        workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        workUnitFingerprint: 'sha256:handoff-dm002',
        sourceFingerprint: 'truth-snapshot::dm002-handoff',
        truthEpoch: 'truth-event-000040',
        runtimeHealthEpoch: 'runtime-health-event-006692',
        recoveryObligationId: 'paper-recovery-obligation:dm002:revise-ai-reviewer',
        dispatchRef: dm002DispatchRef,
        stagePacketRef: dm002StagePacketRef,
        stagePacketRefs: [dm002StagePacketRef],
        routeIdentityKey: 'owner-route::dm002::handoff',
        attemptIdempotencyKey: 'owner-route-attempt::dm002::handoff',
      }),
    ],
    studies: [
      {
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        action_queue: [
          currentControlActionQueueItem({
            studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
            actionType: 'return_to_ai_reviewer_workflow',
            workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
            workUnitFingerprint: 'sha256:handoff-dm003',
            sourceFingerprint: 'truth-snapshot::dm003-handoff',
            truthEpoch: 'truth-event-000030',
            runtimeHealthEpoch: 'runtime-health-event-006486',
            dispatchRef: dm003DispatchRef,
            stagePacketRef: dm003StagePacketRef,
            stagePacketRefs: [dm003StagePacketRef],
            routeIdentityKey: 'owner-route::dm003::handoff',
            attemptIdempotencyKey: 'owner-route-attempt::dm003::handoff',
          }),
        ],
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
    const tasks = queue.family_runtime_queue.tasks;
    const tasksByStudy = Object.fromEntries(tasks.map((task: { payload: { study_id: string } }) => [
      task.payload.study_id,
      task,
    ]));

    assert.equal(intake.family_runtime_intake.enqueued_count, 2);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(intake.family_runtime_intake.exports[0].exported_count, 2);
    assert.deepEqual(Object.keys(tasksByStudy).sort(), [
      '002-dm-china-us-mortality-attribution',
      '003-dpcc-primary-care-phenotype-treatment-gap',
    ]);
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].source, 'opl-current-control-provider-admission');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.provider_admission_schema_source, 'action_queue');
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.recovery_obligation_id,
      'paper-recovery-obligation:dm002:revise-ai-reviewer',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.provider_admission_identity.recovery_obligation_id,
      'paper-recovery-obligation:dm002:revise-ai-reviewer',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply.transition_kind,
      'execute_current_owner_delta',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply.runtime_apply_target.kind,
      'provider_attempt_or_owner_callable',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .transition_runtime_kind,
      'DomainProgressTransitionRuntime',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .exactly_one_apply.selected,
      true,
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .exactly_one_apply.non_advancing_apply,
      false,
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .read_model_metadata.observed_generation,
      'truth-event-000040',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .read_model_metadata.source_generation,
      'truth-event-000040',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .replay_fixture.replay_reads_body,
      false,
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.provider_admission_identity
        .domain_progress_transition_apply.transition_decision_ref,
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .transition_decision_ref,
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.domain_progress_transition_apply
        .authority_boundary.opl_can_create_domain_typed_blocker,
      false,
    );
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.source_fingerprint, 'truth-snapshot::dm002-handoff');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.dispatch_ref, dm002DispatchRef);
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_packet_ref, dm002StagePacketRef);
    assert.deepEqual(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.checkpoint_refs, [dm002StagePacketRef]);
    assert.deepEqual(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_packet_refs, [dm002StagePacketRef]);
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.route_identity_key, 'owner-route::dm002::handoff');
    assert.equal(tasksByStudy['002-dm-china-us-mortality-attribution'].payload.attempt_idempotency_key, 'owner-route-attempt::dm002::handoff');
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.owner_route_currentness_basis.truth_epoch,
      'truth-event-000040',
    );
    assert.equal(
      tasksByStudy['002-dm-china-us-mortality-attribution'].payload.stage_transition_authority_boundary.intent_can_write_domain_truth,
      false,
    );
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.work_unit_fingerprint, 'sha256:handoff-dm003');
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.recovery_obligation_id, undefined);
    assert.equal(
      tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.provider_admission_identity.recovery_obligation_id,
      undefined,
    );
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.dispatch_ref, dm003DispatchRef);
    assert.equal(tasksByStudy['003-dpcc-primary-care-phenotype-treatment-gap'].payload.stage_packet_ref, dm003StagePacketRef);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake preserves MAS owner-route refs for root provider admission candidate stage attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-root-provider-candidate-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-root-provider-candidate-'));
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
  const profilePath = path.join(workspaceRoot, 'ops', 'medautoscience', 'profiles', 'dm-cvd.local.toml');
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const actionType = 'request_opl_stage_attempt';
  const workUnitId = 'medical_prose_write_repair';
  const workUnitFingerprint = 'domain-transition::route_back_same_line::medical_prose_write_repair';
  const stagePacketRef = `mas://current-work-unit/${studyId}/${workUnitId}/stage-packet`;
  const attemptIdempotencyKey = 'paper-policy-request:5c447e99601513e78e08ca8f';
  const liveReadback = {
    surface_kind: 'opl_domain_progress_transition_runtime_live_readback',
    runtime_id: 'opl_domain_progress_transition_runtime',
    runtime_kind: 'DomainProgressTransitionRuntime',
    runtime_readback_status: 'complete_transaction',
    transaction_complete: true,
    causality: {
      command_id: 'dptc_dm003_owner_route_refs',
      event_id: 'dpte_dm003_owner_route_refs',
      outbox_item_id: 'dpto_dm003_owner_route_refs',
      transaction_id: 'dptx_dm003_owner_route_refs',
      source_generation: 'truth-event-000035-39f0b8e96689a623',
      expected_version: 'truth-event-000035-39f0b8e96689a623',
      same_transaction_event_and_outbox: true,
    },
    identity: {
      surface_kind: 'opl_domain_progress_transition_identity',
      command_id: 'dptc_dm003_owner_route_refs',
      event_id: 'dpte_dm003_owner_route_refs',
      latest_event_id: 'dpte_dm003_owner_route_refs',
      latest_outbox_item_id: 'dpto_dm003_owner_route_refs',
      latest_transaction_id: 'dptx_dm003_owner_route_refs',
      idempotency_key: attemptIdempotencyKey,
      transition_kind: 'StartProviderAttempt',
      outcome_kind: 'provider_admission_enqueued_or_blocked',
      aggregate_identity: {
        aggregate_kind: 'study_work_unit',
        aggregate_id: `${studyId}::${workUnitId}`,
        study_id: studyId,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
      },
      stage_run_identity: {
        stage_run_id: `stage-run:${studyId}:${workUnitId}`,
        route_identity_key: attemptIdempotencyKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        provider_attempt_ref: `opl://provider-admission/${studyId}/${attemptIdempotencyKey}`,
        attempt_lease_ref: `opl://attempt-leases/${attemptIdempotencyKey}`,
        source_generation: 'truth-event-000035-39f0b8e96689a623',
      },
    },
    latest_transaction_readback: {
      command_present: true,
      event_present: true,
      outbox_item_present: true,
      event_id: 'dpte_dm003_owner_route_refs',
      outbox_item_id: 'dpto_dm003_owner_route_refs',
      transition_event_id: 'dpte_dm003_owner_route_refs',
      outbox_transition_event_id: 'dpte_dm003_owner_route_refs',
      transaction_id: 'dptx_dm003_owner_route_refs',
      same_transaction_event_and_outbox: true,
      same_stage_run_identity: true,
    },
    read_model_readback: {
      latest_transaction_identity: {
        transaction_id: 'dptx_dm003_owner_route_refs',
        command_id: 'dptc_dm003_owner_route_refs',
        event_id: 'dpte_dm003_owner_route_refs',
        outbox_item_id: 'dpto_dm003_owner_route_refs',
        same_transaction_event_and_outbox: true,
        same_stage_run_identity: true,
        transaction_complete: true,
      },
      latest_outbox_identity: {
        outbox_item_id: 'dpto_dm003_owner_route_refs',
        transition_event_id: 'dpte_dm003_owner_route_refs',
        outbox_kind: 'start_provider_attempt',
      },
      latest_stage_run_identity: {
        stage_run_id: `stage-run:${studyId}:${workUnitId}`,
        route_identity_key: attemptIdempotencyKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        provider_attempt_ref: `opl://provider-admission/${studyId}/${attemptIdempotencyKey}`,
        attempt_lease_ref: `opl://attempt-leases/${attemptIdempotencyKey}`,
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
      observed_generation: 'truth-event-000035-39f0b8e96689a623',
      derived_generation: 'truth-event-000035-39f0b8e96689a623',
      lag_status: 'current',
    },
  };
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    quest_status: 'provider_admission_pending',
    provider_admission_pending_count: 1,
    transition_request_pending_count: 0,
    owner_route: {
      next_owner: 'write',
      owner_reason: workUnitId,
      failure_signature: actionType,
      source_fingerprint: workUnitFingerprint,
      source_refs: {
        attempt_idempotency_key: attemptIdempotencyKey,
        dispatch_ref: stagePacketRef,
        owner_route_currentness_basis: {
          action_fingerprint: workUnitFingerprint,
          current_action_source: 'paper_recovery_state.next_safe_action.successor_owner_action',
          current_work_unit_source: 'paper_recovery_state.next_safe_action.successor_owner_action',
          runtime_health_epoch: 'runtime-health-event-006980-17ebc33e78ffccbf',
          truth_epoch: 'truth-event-000035-39f0b8e96689a623',
          work_unit_fingerprint: workUnitFingerprint,
          work_unit_id: workUnitId,
        },
        route_identity_key: attemptIdempotencyKey,
        stage_packet_ref: stagePacketRef,
        stage_packet_refs: [stagePacketRef],
        work_unit_fingerprint: workUnitFingerprint,
        work_unit_id: workUnitId,
      },
      allowed_actions: [actionType],
      idempotency_key: attemptIdempotencyKey,
    },
    provider_admission_candidates: [
      {
        action_type: actionType,
        study_id: studyId,
        quest_id: studyId,
        status: 'provider_admission_pending',
        owner: 'write',
        action_fingerprint: workUnitFingerprint,
        work_unit_fingerprint: workUnitFingerprint,
        authority: 'mas_provider_admission_identity',
        work_unit_id: workUnitId,
        route_identity_key: attemptIdempotencyKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        idempotency_key: attemptIdempotencyKey,
        source: 'opl_current_control_state_action_queue',
        provider_admission_pending: true,
        transition_request_pending: false,
        provider_attempt_or_lease_required: true,
        provider_admission_requires_opl_runtime_result: false,
        provider_admission_identity: {
          study_id: studyId,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          route_identity_key: attemptIdempotencyKey,
          attempt_idempotency_key: attemptIdempotencyKey,
          request_idempotency_key: attemptIdempotencyKey,
          status: 'provider_admission_pending',
          provider_attempt_or_lease_required: true,
          opl_domain_progress_transition_runtime_live_readback: liveReadback,
        },
        opl_domain_progress_transition_runtime_live_readback: liveReadback,
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    profile: {
      profile_name: 'dm-cvd',
      profile_ref: profilePath,
    },
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [],
  });
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
  });
  try {
    const intake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const tasks = queue.family_runtime_queue.tasks;
    const task = tasks[0];
    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(task.task_id) as FamilyRuntimeTaskRow;
      const stageAttempt = ensureProviderHostedStageAttempt(db, row, task.payload, {
        eventSource: 'test-root-provider-candidate',
      });

      assert.equal(intake.family_runtime_intake.enqueued_count, 1);
      assert.equal(intake.family_runtime_intake.blocked_count, 0);
      assert.equal(tasks.length, 1);
      assert.equal(task.source, 'opl-current-control-provider-admission');
      assert.equal(task.payload.study_id, studyId);
      assert.equal(task.payload.action_type, actionType);
      assert.equal(task.payload.route_identity_key, attemptIdempotencyKey);
      assert.equal(task.payload.attempt_idempotency_key, attemptIdempotencyKey);
      assert.equal(task.payload.dispatch_ref, stagePacketRef);
      assert.equal(task.payload.stage_packet_ref, stagePacketRef);
      assert.deepEqual(task.payload.stage_packet_refs, [stagePacketRef]);
      assert.deepEqual(task.payload.checkpoint_refs, [stagePacketRef]);
      assert.equal(task.payload.owner_route_currentness_basis.truth_epoch, 'truth-event-000035-39f0b8e96689a623');
      assert.equal(task.payload.provider_attempt_or_lease_required, true);
      assert.ok(stageAttempt);
      assert.equal(stageAttempt.stage_id, 'domain_owner/default-executor-dispatch');
      assert.equal(stageAttempt.executor_kind, 'codex_cli');
      assert.equal(stageAttempt.status, 'queued');
      assert.deepEqual(stageAttempt.checkpoint_refs, [stagePacketRef]);
      assert.equal(stageAttempt.workspace_locator.route_identity_key, attemptIdempotencyKey);
      assert.equal(stageAttempt.workspace_locator.attempt_idempotency_key, attemptIdempotencyKey);
      assert.equal(
        record(stageAttempt.workspace_locator.provider_admission_identity).attempt_idempotency_key,
        attemptIdempotencyKey,
      );
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake merges root provider candidates with nested current-control action_queue candidates', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-dual-source-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-dual-source-'));
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
  const dm002StagePacketRef = [
    'studies',
    '002-dm-china-us-mortality-attribution',
    'artifacts',
    'stage_packets',
    'return_to_ai_reviewer_workflow.stage-packet.json',
  ].join('/');
  const dm003StagePacketRef = [
    'studies',
    '003-dpcc-primary-care-phenotype-treatment-gap',
    'artifacts',
    'stage_packets',
    'return_to_ai_reviewer_workflow.stage-packet.json',
  ].join('/');
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state_handoff',
    schema_version: 1,
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        owner_route_current: true,
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'return_to_ai_reviewer_workflow',
        work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
        work_unit_fingerprint: 'sha256:dual-source-dm002',
        action_fingerprint: 'sha256:dual-source-dm002',
        source_fingerprint: 'truth-snapshot::dual-source-dm002',
        dispatch_authority: 'ai_reviewer_record_production_handoff',
        stage_packet_ref: dm002StagePacketRef,
        stage_packet_refs: [dm002StagePacketRef],
        route_identity_key: 'owner-route::dm002::dual-source',
        attempt_idempotency_key: 'owner-route-attempt::dm002::dual-source',
        next_executable_owner: 'ai_reviewer',
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command_outbox_record: currentControlCommandOutboxRecord({
          studyId: '002-dm-china-us-mortality-attribution',
          actionType: 'return_to_ai_reviewer_workflow',
          workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
          workUnitFingerprint: 'sha256:dual-source-dm002',
          sourceGeneration: 'truth-event-dual-source-dm002',
          idempotencyKey: 'owner-route-attempt::dm002::dual-source',
        }),
      },
    ],
    studies: [
      {
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        action_queue: [
          currentControlActionQueueItem({
            studyId: '003-dpcc-primary-care-phenotype-treatment-gap',
            actionType: 'return_to_ai_reviewer_workflow',
            workUnitId: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
            workUnitFingerprint: 'sha256:dual-source-dm003',
            sourceFingerprint: 'truth-snapshot::dual-source-dm003',
            truthEpoch: 'truth-event-dual-source-dm003',
            runtimeHealthEpoch: 'runtime-health-event-dual-source-dm003',
            stagePacketRef: dm003StagePacketRef,
            stagePacketRefs: [dm003StagePacketRef],
            routeIdentityKey: 'owner-route::dm003::dual-source',
            attemptIdempotencyKey: 'owner-route-attempt::dm003::dual-source',
          }),
        ],
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
    const studies = queue.family_runtime_queue.tasks.map((task: { payload: { study_id: string } }) =>
      task.payload.study_id
    ).sort();

    assert.equal(intake.family_runtime_intake.enqueued_count, 2);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.deepEqual(studies, [
      '002-dm-china-us-mortality-attribution',
      '003-dpcc-primary-care-phenotype-treatment-gap',
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
