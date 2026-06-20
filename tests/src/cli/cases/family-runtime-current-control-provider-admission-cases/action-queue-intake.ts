import {
  assert,
  currentControlActionQueueItem,
  currentControlCommandOutboxRecord,
  familyRuntimeEnv,
  fs,
  os,
  path,
  providerObservationBoundary,
  runCli,
  test,
  writeDefaultExecutorDispatchPacket,
  writeJsonEmitterScript,
} from './shared.ts';

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
