import {
  assert,
  DatabaseSync,
  familyRuntimeEnv,
  fs,
  masDomainProgressTransitionRequest,
  os,
  path,
  providerObservationBoundary,
  runCli,
  test,
  writeJsonEmitterScript,
} from './shared.ts';

test('family-runtime replays existing complete transition readback when MAS export no longer emits pending task', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-existing-readback-replay-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-existing-readback-replay-'));
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
  const actionType = 'run_quality_repair_batch';
  const workUnitId = 'medical_prose_write_repair';
  const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    `${actionType}.stage-packet.json`,
  ].join('/');
  const attemptIdempotencyKey = 'paper-policy-request:1a379264039c75d0e9cfd8f5';
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  const writePendingCurrentControl = () => fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    provider_admission_candidates: [
      {
        surface: 'opl_provider_admission_candidate',
        status: 'transition_request_pending',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: workUnitFingerprint,
        route_identity_key: attemptIdempotencyKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        owner_route_current: true,
        stage_packet_ref: stagePacketRef,
        stage_packet_refs: [stagePacketRef],
        source_refs: {
          route_identity_key: attemptIdempotencyKey,
          attempt_idempotency_key: attemptIdempotencyKey,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          stage_packet_ref: stagePacketRef,
        },
      },
    ],
    studies: [
      {
        study_id: studyId,
        current_control_action: {
          status: 'transition_request_pending',
          reason: 'await_opl_transition_readback',
          provider_admission_requires_opl_runtime_result: true,
          route_identity_key: attemptIdempotencyKey,
          attempt_idempotency_key: attemptIdempotencyKey,
          stage_packet_ref: stagePacketRef,
          stage_packet_refs: [stagePacketRef],
        },
      },
    ],
  }), 'utf8');
  writePendingCurrentControl();
  const writeExport = (tasks: unknown[]) => writeJsonEmitterScript(exportPath, {
    surface_kind: 'mas_family_domain_handler_export',
    profile: {
      profile_name: 'dm-cvd',
      profile_ref: profilePath,
    },
    workspace: {
      workspace_root: workspaceRoot,
      workspace_exists: true,
    },
    pending_family_tasks: tasks,
  });
  const pendingTask = {
    domain_id: 'medautoscience',
    task_kind: 'domain_owner/default-executor-dispatch',
    priority: 95,
    source: 'mas-domain-handler-export',
    dedupe_key: `mas:dm-cvd:${studyId}:transition-request:${actionType}`,
    source_fingerprint: 'truth-snapshot::dm003-transition-request',
    reason: 'current_control_transition_request_pending',
    payload: {
      profile: profilePath,
      study_id: studyId,
      quest_id: studyId,
      action_type: actionType,
      work_unit_id: workUnitId,
      work_unit_fingerprint: workUnitFingerprint,
      action_fingerprint: workUnitFingerprint,
      source_fingerprint: 'truth-snapshot::dm003-transition-request',
      dispatch_authority: 'domain_owner_transition_request',
      executor_kind: 'codex_cli_default',
      next_executable_owner: 'write',
      owner_route_current: true,
      provider_attempt_or_lease_required: true,
      provider_completion_is_domain_completion: false,
      route_identity_key: attemptIdempotencyKey,
      attempt_idempotency_key: attemptIdempotencyKey,
      stage_packet_ref: stagePacketRef,
      stage_packet_refs: [stagePacketRef],
      stage_transition_authority_boundary: providerObservationBoundary(),
      owner_route_currentness_basis: {
        observed_generation: 'truth-event-dm003-transition-request',
        derived_generation: 'truth-event-dm003-transition-request',
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
      },
      opl_domain_progress_transition_request: masDomainProgressTransitionRequest({
        studyId,
        actionType,
        workUnitId,
        workUnitFingerprint,
        sourceGeneration: 'truth-event-dm003-transition-request',
        idempotencyKey: attemptIdempotencyKey,
      }),
    },
  };
  writeExport([pendingTask]);
  const env = familyRuntimeEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_EXPORT: exportPath,
  });
  try {
    const firstIntake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    assert.equal(firstIntake.family_runtime_intake.enqueued_count, 1);
    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      db.prepare(`
        UPDATE tasks
        SET status = 'succeeded'
        WHERE dedupe_key = ?
      `).run(attemptIdempotencyKey);
    } finally {
      db.close();
    }
    writePendingCurrentControl();
    writeExport([]);

    const secondIntake = runCli([
      'family-runtime',
      'intake',
      '--domain',
      'medautoscience',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const refreshedCurrentControl = JSON.parse(fs.readFileSync(currentControlPath, 'utf8'));
    const queue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);

    assert.equal(secondIntake.family_runtime_intake.enqueued_count, 0);
    assert.equal(secondIntake.family_runtime_intake.idempotent_noop_count, 0);
    assert.equal(secondIntake.family_runtime_intake.exports[0].exported_count, 0);
    assert.equal(secondIntake.family_runtime_intake.exports[0].current_control_readback_publication_count, 1);
    assert.equal(
      secondIntake.family_runtime_intake.exports[0].current_control_readback_publications[0].source,
      'existing_terminal_queue_readback',
    );
    assert.equal(queue.family_runtime_queue.tasks[0].status, 'succeeded');
    assert.equal(
      refreshedCurrentControl.current_control_refresh_source,
      'opl_transition_runtime_readback_provider_admission',
    );
    assert.equal(refreshedCurrentControl.transition_request_pending_count, 0);
    assert.equal(refreshedCurrentControl.provider_admission_pending_count, 1);
    assert.equal(refreshedCurrentControl.provider_admission_candidates[0].status, 'provider_admission_pending');
    assert.equal(refreshedCurrentControl.provider_admission_candidates[0].attempt_idempotency_key, attemptIdempotencyKey);
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0]
        .opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    assert.equal(
      refreshedCurrentControl.studies[0].current_control_action.status,
      'provider_admission_pending',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
