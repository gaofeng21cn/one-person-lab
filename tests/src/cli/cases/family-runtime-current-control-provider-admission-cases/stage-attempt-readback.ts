import {
  assert,
  DatabaseSync,
  createQueueTables,
  currentControlCommandOutboxRecord,
  ensureProviderHostedStageAttempt,
  familyRuntimeEnv,
  fs,
  insertQueuedTask,
  os,
  path,
  providerObservationBoundary,
  record,
  runCli,
  test,
  writeDefaultExecutorDispatchPacket,
  writeJsonEmitterScript,
} from './shared.ts';
import { deriveCurrentControlStateForTask } from '../../../../../src/modules/runway/family-runtime-current-control-state.ts';

test('family-runtime current-control recovery obligation id flows into stage attempt and read model without authority escalation', () => {
  const db = new DatabaseSync(':memory:');
  const obligationId = 'paper-recovery-obligation:dm002:stage-run-closeout';
  const payload = {
    profile: '/tmp/dm-cvd.profile.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'return_to_ai_reviewer_workflow',
    work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    work_unit_fingerprint: 'sha256:recovery-obligation-current',
    action_fingerprint: 'sha256:recovery-obligation-current',
    source_fingerprint: 'truth-snapshot::recovery-obligation-current',
    dispatch_authority: 'opl_current_control_state_handoff',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    executor_kind: 'codex_cli_default',
    next_executable_owner: 'ai_reviewer',
    authority_boundary: 'mas_default_executor_dispatch_request_only',
    owner_route_current: true,
    provider_attempt_or_lease_required: true,
    provider_completion_is_domain_completion: false,
    recovery_obligation_id: obligationId,
    stage_transition_authority_boundary: providerObservationBoundary(),
    provider_admission_schema_source: 'action_queue',
    provider_admission_identity: {
      status: 'provider_admission_pending',
      recovery_obligation_id: obligationId,
      provider_completion_is_domain_completion: false,
      stage_transition_authority_boundary: providerObservationBoundary(),
    },
    owner_route_currentness_basis: {
      schema_version: 1,
      surface: 'opl_current_control_state_handoff',
      generated_at: '2026-06-08T15:41:00+00:00',
      work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      work_unit_fingerprint: 'sha256:recovery-obligation-current',
      truth_epoch: 'truth-event-000041',
      runtime_health_epoch: 'runtime-health-event-006693',
      source_eval_id: 'source-eval:dm002:recovery-obligation',
    },
  };
  try {
    createQueueTables(db);
    insertQueuedTask(db, {
      taskId: 'task-recovery-obligation',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:recovery-obligation',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get('task-recovery-obligation') as Parameters<
      typeof ensureProviderHostedStageAttempt
    >[1];

    const attempt = ensureProviderHostedStageAttempt(db, row, payload);
    const readModel = deriveCurrentControlStateForTask(db, 'task-recovery-obligation');

    assert.ok(attempt);
    assert.equal(attempt.workspace_locator.recovery_obligation_id, obligationId);
    assert.equal(record(attempt.workspace_locator.provider_admission_identity).recovery_obligation_id, obligationId);
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempt.workspace_locator.opl_writes_artifact_gate, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
    assert.equal(readModel.stage_run_currentness_identity.recovery_obligation_id, obligationId);
    assert.equal(
      record(readModel.stage_run_currentness_identity.provider_admission_identity).recovery_obligation_id,
      obligationId,
    );
    assert.equal(readModel.authority_boundary.can_write_domain_truth, false);
    assert.equal(readModel.authority_boundary.opl_can_authorize_publication_ready, false);
    assert.equal(readModel.authority_boundary.opl_can_sign_domain_owner_receipt, false);
    assert.equal(readModel.authority_boundary.opl_can_authorize_domain_ready, false);
    assert.equal(
      readModel.missing_stage_run_currentness_identity_fields.includes('recovery_obligation_id'),
      false,
    );
  } finally {
    db.close();
  }
});

test('family-runtime current-control DomainProgressTransitionRuntime apply proof flows into provider admission attempt', () => {
  const db = new DatabaseSync(':memory:');
  const obligationId = 'paper-recovery-obligation:dm002:execute-current-owner-delta';
  const decisionId = [
    obligationId,
    'execute_current_owner_delta',
    'stage-run:dm002:current',
    'owner-route::dm002::pas-current',
    'owner-route-attempt::dm002::pas-current',
  ].join('|');
  const transitionApply = {
    surface_kind: 'opl_domain_progress_transition_packet',
    obligation_id: obligationId,
    transition_runtime_kind: 'DomainProgressTransitionRuntime',
    transition_decision_ref: decisionId,
    transition_kind: 'execute_current_owner_delta',
    transition_ref: 'mas://DM002/current-owner-delta/latest.json',
    provider_admission_identity_ref: 'opl://provider-admission/dm002/current',
    current_identity: {
      stage_run_id: 'stage-run:dm002:current',
      route_identity_key: 'owner-route::dm002::pas-current',
      attempt_idempotency_key: 'owner-route-attempt::dm002::pas-current',
      selected_dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
      stage_packet_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/current-control-pas.json',
      stage_packet_refs: [
        'studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/current-control-pas.json',
      ],
      provider_attempt_ref: 'opl://stage-attempts/stage-run:dm002:current',
      attempt_lease_ref: 'opl://leases/stage-run:dm002:current',
      workflow_ref: 'temporal://workflow/stage-run:dm002:current',
      source_fingerprint: 'truth-snapshot::pas-current',
      truth_epoch: 'truth-event-pas-current',
      runtime_health_epoch: 'runtime-health-event-pas-current',
      work_unit_fingerprint: 'sha256:pas-current',
    },
    runtime_apply_target: {
      kind: 'provider_attempt_or_owner_callable',
      provider_admission_required: true,
      owner_callable_required: true,
      domain_truth_owner: 'med-autoscience',
    },
    exactly_one_apply: {
      scope: 'stage_run_identity',
      selected: true,
      non_advancing_apply: false,
    },
    read_model_metadata: {
      observed_generation: 'truth-event-pas-current',
      derived_generation: 'truth-event-pas-current',
      source_generation: 'truth-event-pas-current',
      expected_version: 'truth-event-pas-current',
    },
    replay_fixture: {
      command_outbox_ref: 'opl://domain-progress-transition/outbox/owner-route-attempt%3A%3Adm002%3A%3Apas-current',
      stage_run_identity_ref: 'opl://domain-progress-transition/stage-run/owner-route%3A%3Adm002%3A%3Apas-current',
      replay_reads_body: false,
    },
    authority_boundary: {
      opl_can_write_mas_truth: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
  };
  const payload = {
    profile: '/tmp/dm-cvd.profile.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    quest_id: '002-dm-china-us-mortality-attribution',
    action_type: 'return_to_ai_reviewer_workflow',
    work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
    work_unit_fingerprint: 'sha256:pas-current',
    action_fingerprint: 'sha256:pas-current',
    source_fingerprint: 'truth-snapshot::pas-current',
    dispatch_authority: 'opl_current_control_state_handoff',
    dispatch_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/return_to_ai_reviewer_workflow.json',
    executor_kind: 'codex_cli_default',
    next_executable_owner: 'ai_reviewer',
    authority_boundary: 'mas_default_executor_dispatch_request_only',
    owner_route_current: true,
    provider_attempt_or_lease_required: true,
    provider_completion_is_domain_completion: false,
    recovery_obligation_id: obligationId,
    route_identity_key: 'owner-route::dm002::pas-current',
    attempt_idempotency_key: 'owner-route-attempt::dm002::pas-current',
    stage_packet_ref: 'studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/current-control-pas.json',
    stage_packet_refs: [
      'studies/002-dm-china-us-mortality-attribution/artifacts/stage_packets/current-control-pas.json',
    ],
    stage_transition_authority_boundary: providerObservationBoundary(),
    provider_admission_schema_source: 'action_queue',
    domain_progress_transition_apply: transitionApply,
    provider_admission_identity: {
      status: 'provider_admission_pending',
      recovery_obligation_id: obligationId,
      route_identity_key: 'owner-route::dm002::pas-current',
      attempt_idempotency_key: 'owner-route-attempt::dm002::pas-current',
      provider_completion_is_domain_completion: false,
      stage_transition_authority_boundary: providerObservationBoundary(),
      domain_progress_transition_apply: transitionApply,
    },
    owner_route_currentness_basis: {
      schema_version: 1,
      surface: 'opl_current_control_state_handoff',
      generated_at: '2026-06-15T08:00:00+00:00',
      work_unit_id: 'produce_ai_reviewer_publication_eval_record_against_current_inputs',
      work_unit_fingerprint: 'sha256:pas-current',
      truth_epoch: 'truth-event-pas-current',
      runtime_health_epoch: 'runtime-health-event-pas-current',
      source_eval_id: 'source-eval:dm002:pas-current',
    },
  };
  try {
    createQueueTables(db);
    insertQueuedTask(db, {
      taskId: 'task-pas-current-control',
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload,
      dedupeKey: 'mas:dm-cvd:002:default-executor:return_to_ai_reviewer_workflow:pas-current',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get('task-pas-current-control') as Parameters<
      typeof ensureProviderHostedStageAttempt
    >[1];

    const attempt = ensureProviderHostedStageAttempt(db, row, payload);
    const locatorTransitionApply = record(attempt?.workspace_locator.domain_progress_transition_apply);
    const locatorRuntimeApplyTarget = record(locatorTransitionApply.runtime_apply_target);
    const providerAdmissionApply = record(
      record(attempt?.workspace_locator.provider_admission_identity).domain_progress_transition_apply,
    );

    assert.ok(attempt);
    assert.equal(locatorTransitionApply.transition_kind, 'execute_current_owner_delta');
    assert.equal(locatorTransitionApply.transition_runtime_kind, 'DomainProgressTransitionRuntime');
    assert.equal(
      locatorRuntimeApplyTarget.kind,
      'provider_attempt_or_owner_callable',
    );
    assert.equal(record(locatorTransitionApply.exactly_one_apply).selected, true);
    assert.equal(record(locatorTransitionApply.exactly_one_apply).non_advancing_apply, false);
    assert.equal(record(locatorTransitionApply.read_model_metadata).observed_generation, 'truth-event-pas-current');
    assert.equal(record(locatorTransitionApply.replay_fixture).replay_reads_body, false);
    assert.equal(
      providerAdmissionApply.transition_ref,
      'mas://DM002/current-owner-delta/latest.json',
    );
    assert.equal(attempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(attempt.workspace_locator.opl_writes_publication_quality, false);
    assert.equal(attempt.workspace_locator.opl_writes_artifact_gate, false);
    assert.equal(attempt.workspace_locator.opl_writes_current_package, false);
  } finally {
    db.close();
  }
});

test('family-runtime intake reconciles current-control display owner to executable domain owner', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-owner-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-owner-'));
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
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const actionType = 'run_gate_clearing_batch';
  const workUnitId = 'dpcc_publication_gate_replay_after_current_ai_reviewer_record';
  const workUnitFingerprint = [
    'study-progress-current-owner-ticket',
    studyId,
    workUnitId,
    actionType,
  ].join('::');
  const dispatchRef = writeDefaultExecutorDispatchPacket(workspaceRoot, studyId, actionType);
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    'run_gate_clearing_batch.stage-packet.json',
  ].join('/');
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state_handoff',
    schema_version: 1,
    generated_at: '2026-06-10T07:30:00+00:00',
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: workUnitFingerprint,
        source_fingerprint: workUnitFingerprint,
        dispatch_authority: 'consumer_default_executor_dispatch',
        dispatch_path: path.join(workspaceRoot, dispatchRef),
        stage_packet_ref: stagePacketRef,
        stage_packet_refs: [stagePacketRef],
        route_identity_key: 'owner-route::dm003::gate-clearing-current',
        attempt_idempotency_key: 'owner-route-attempt::dm003::gate-clearing-current',
        next_executable_owner: 'finalize',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command_outbox_record: currentControlCommandOutboxRecord({
          studyId,
          actionType,
          workUnitId,
          workUnitFingerprint,
          sourceGeneration: 'truth-event-gate-clearing-current',
          idempotencyKey: 'owner-route-attempt::dm003::gate-clearing-current',
        }),
      },
    ],
  }), 'utf8');
  writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        domain_owner: 'gate_clearing_batch',
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        source_fingerprint: workUnitFingerprint,
        priority: 65,
        source: 'mas-domain-handler-export',
        dedupe_key: `mas:dm-cvd:${studyId}:default-executor:${actionType}:current`,
        payload: {
          profile: 'dm-cvd',
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          source_fingerprint: workUnitFingerprint,
          dispatch_authority: 'consumer_default_executor_dispatch',
          dispatch_ref: dispatchRef,
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'gate_clearing_batch',
          domain_owner: 'gate_clearing_batch',
          authority_boundary: 'mas_default_executor_dispatch_request_only',
        },
      },
    ],
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
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const queue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.exports[0].suppressed_count, 1);
    assert.equal(task.payload.next_executable_owner, 'gate_clearing_batch');
    assert.equal(task.payload.domain_owner, 'gate_clearing_batch');
    assert.equal(task.payload.executable_owner_source, 'domain_handler_current_owner_action');
    assert.equal(task.payload.provider_admission_identity.next_executable_owner, 'gate_clearing_batch');
    assert.equal(task.payload.provider_admission_identity.executable_owner_source, 'domain_handler_current_owner_action');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
