import {
  assert,
  familyRuntimeEnv,
  fs,
  masPaperMissionOplRuntimeCarrier,
  os,
  parseJsonText,
  path,
  providerObservationBoundary,
  runCli,
  test,
  writeJsonEmitterScript,
} from '../shared.ts';

test('family-runtime intake consumes MAS PaperMissionTransaction opl_runtime_carrier as OPL runtime-backed provider admission', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-carrier-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-carrier-'));
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
  const studyId = '002-dm-china-us-mortality-attribution';
  const actionType = 'publication_gate_replay';
  const workUnitId = 'gate_clearing_claim_evidence_repair';
  const workUnitFingerprint = 'paper-mission-transaction::dm002::gate';
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'paper_mission',
    'publication_gate_replay.stage-packet.json',
  ].join('/');
  const idempotencyKey = 'paper-mission-transaction::dm002::gate';
  const attemptIdempotencyKey = `${idempotencyKey}::opl-attempt`;
  const carrier = masPaperMissionOplRuntimeCarrier({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'paper_mission_transaction_contract_v1',
    expectedVersion: 'paper_mission_transaction_contract_v1',
    idempotencyKey,
  });
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    studies: [
      {
        study_id: studyId,
        current_control_action: {
          status: 'transition_request_pending',
          reason: 'paper_mission_transaction_waiting_for_opl_runtime_live_readback',
          provider_admission_requires_opl_runtime_result: true,
        },
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
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_mission/start_or_resume',
        priority: 100,
        source: 'mas-paper-mission-transaction-carrier',
        dedupe_key: `paper-mission:${studyId}:${workUnitId}`,
        source_fingerprint: workUnitFingerprint,
        reason: 'paper_mission_transaction_opl_runtime_carrier_pending',
        payload: {
          profile: profilePath,
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          action_fingerprint: workUnitFingerprint,
          source_fingerprint: workUnitFingerprint,
          dispatch_authority: 'paper_mission_transaction',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'ai_reviewer',
          owner_route_current: true,
          provider_attempt_or_lease_required: false,
          provider_completion_is_domain_completion: false,
          stage_packet_ref: stagePacketRef,
          stage_packet_refs: [stagePacketRef],
          stage_transition_authority_boundary: carrier.authority_boundary,
          owner_route_currentness_basis: {
            source: 'paper_mission_transaction',
            truth_epoch: 'paper_mission_transaction_contract_v1',
            runtime_health_epoch: 'paper_mission_transaction_contract_v1',
            work_unit_id: workUnitId,
            work_unit_fingerprint: workUnitFingerprint,
          },
          opl_runtime_carrier: carrier,
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
      'paper_mission/start_or_resume',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const tasks = queue.family_runtime_queue.tasks;
    const refreshedCurrentControl = parseJsonText(fs.readFileSync(currentControlPath, 'utf8'));

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.suppressed_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].source, 'opl-current-control-transition-request');
    assert.equal(tasks[0].payload.provider_admission_schema_source, 'transition_request_pending_task');
    assert.equal(tasks[0].task_kind, 'domain_owner/default-executor-dispatch');
    assert.equal(tasks[0].payload.provider_admission_source_task_kind, 'paper_mission/start_or_resume');
    assert.equal(tasks[0].payload.provider_admission_identity.provider_admission_source_task_kind, 'paper_mission/start_or_resume');
    assert.deepEqual(tasks[0].payload.stage_transition_authority_boundary, carrier.authority_boundary);
    assert.equal(tasks[0].payload.route_identity_key, carrier.route_identity_key);
    assert.equal(tasks[0].payload.attempt_idempotency_key, attemptIdempotencyKey);
    assert.equal(tasks[0].payload.idempotency_key, carrier.request_idempotency_key);
    assert.equal(tasks[0].payload.request_idempotency_key, carrier.request_idempotency_key);
    assert.deepEqual(tasks[0].payload.opl_domain_progress_transition_request, carrier);
    assert.equal(tasks[0].payload.opl_runtime_carrier, undefined);
    assert.equal(tasks[0].payload.current_control_command.source_kind, 'paper_mission_transaction_opl_route_command');
    assert.equal(
      tasks[0].payload.current_control_command.paper_mission_transaction_ref,
      carrier.paper_mission_transaction_ref,
    );
    assert.equal(
      tasks[0].payload.current_control_command.transition_request_payload_scope,
      'identity_refs_and_contract_metadata_only',
    );
    assert.equal(tasks[0].payload.current_control_command.transition_kind, 'StartProviderAttempt');
    assert.equal(tasks[0].payload.current_control_command.runtime_owner, 'one-person-lab');
    assert.equal(tasks[0].payload.current_control_command.idempotency_key, carrier.request_idempotency_key);
    assert.equal(
      tasks[0].payload.current_control_command.stage_run_identity.route_identity_key,
      carrier.route_identity_key,
    );
    assert.equal(
      tasks[0].payload.current_control_command.stage_run_identity.attempt_idempotency_key,
      carrier.attempt_idempotency_key,
    );
    assert.equal(tasks[0].payload.opl_transition_outbox_item.dispatch_allowed, true);
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.identity.idempotency_key,
      carrier.request_idempotency_key,
    );
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.identity.stage_run_identity
        .attempt_idempotency_key,
      carrier.attempt_idempotency_key,
    );
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.transaction_complete,
      true,
    );
    assert.equal(tasks[0].payload.projection_metadata.authority, false);
    assert.equal(tasks[0].payload.domain_progress_transition_runtime.authority_boundary.opl_can_write_domain_truth, false);
    assert.equal(
      tasks[0].payload.domain_progress_transition_runtime.authority_boundary.provider_completion_is_domain_completion,
      false,
    );
    assert.equal(refreshedCurrentControl.provider_admission_pending_count, 1);
    assert.equal(refreshedCurrentControl.transition_request_pending_count, 0);
    assert.equal(refreshedCurrentControl.provider_admission_candidates[0].request_idempotency_key, carrier.request_idempotency_key);
    assert.equal(refreshedCurrentControl.provider_admission_candidates[0].attempt_idempotency_key, carrier.attempt_idempotency_key);
    assert.equal(refreshedCurrentControl.studies[0].current_control_action.status, 'provider_admission_pending');
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0]
        .opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_projection_metadata.provider_completion_is_domain_completion,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime blocks MAS PaperMissionTransaction carrier when request-only boundary grants OPL authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-carrier-authority-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-carrier-authority-'));
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
  const studyId = '002-dm-china-us-mortality-attribution';
  const actionType = 'publication_gate_replay';
  const workUnitId = 'gate_clearing_claim_evidence_repair';
  const workUnitFingerprint = 'paper-mission-transaction::dm002::gate';
  const carrier = masPaperMissionOplRuntimeCarrier({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'paper_mission_transaction_contract_v1',
    expectedVersion: 'paper_mission_transaction_contract_v1',
    idempotencyKey: 'paper-mission-transaction::dm002::gate',
  });

  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    studies: [
      {
        study_id: studyId,
        current_control_action: {
          status: 'transition_request_pending',
          reason: 'paper_mission_transaction_waiting_for_opl_runtime_live_readback',
          provider_admission_requires_opl_runtime_result: true,
        },
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
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_mission/start_or_resume',
        priority: 100,
        source: 'mas-paper-mission-transaction-carrier',
        dedupe_key: `paper-mission:${studyId}:${workUnitId}`,
        source_fingerprint: workUnitFingerprint,
        reason: 'paper_mission_transaction_opl_runtime_carrier_pending',
        payload: {
          profile: profilePath,
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          action_fingerprint: workUnitFingerprint,
          source_fingerprint: workUnitFingerprint,
          dispatch_authority: 'paper_mission_transaction',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'ai_reviewer',
          owner_route_current: true,
          provider_attempt_or_lease_required: false,
          provider_completion_is_domain_completion: false,
          stage_transition_authority_boundary: {
            ...carrier.authority_boundary,
            mas_can_authorize_provider_admission: true,
          },
          opl_runtime_carrier: carrier,
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
      'paper_mission/start_or_resume',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_provider_admission_missing_stage_authority_boundary',
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime blocks MAS PaperMissionTransaction carrier when payload identity conflicts with carrier identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-carrier-mismatch-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-carrier-mismatch-'));
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
  const studyId = '002-dm-china-us-mortality-attribution';
  const actionType = 'publication_gate_replay';
  const workUnitId = 'gate_clearing_claim_evidence_repair';
  const workUnitFingerprint = 'paper-mission-transaction::dm002::gate';
  const stagePacketRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/paper_mission/publication_gate_replay.stage-packet.json';
  const carrier = masPaperMissionOplRuntimeCarrier({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'paper_mission_transaction_contract_v1',
    expectedVersion: 'paper_mission_transaction_contract_v1',
    idempotencyKey: 'paper-mission-transaction::dm002::gate',
  });
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    studies: [
      {
        study_id: studyId,
        current_control_action: {
          status: 'transition_request_pending',
          provider_admission_requires_opl_runtime_result: true,
        },
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
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_mission/start_or_resume',
        priority: 100,
        source: 'mas-paper-mission-transaction-carrier',
        dedupe_key: `paper-mission:${studyId}:${workUnitId}`,
        source_fingerprint: workUnitFingerprint,
        payload: {
          profile: profilePath,
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          action_fingerprint: workUnitFingerprint,
          source_fingerprint: workUnitFingerprint,
          dispatch_authority: 'paper_mission_transaction',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'ai_reviewer',
          owner_route_current: true,
          provider_attempt_or_lease_required: false,
          provider_completion_is_domain_completion: false,
          route_identity_key: 'wrong-route-key',
          attempt_idempotency_key: 'wrong-attempt-key',
          request_idempotency_key: 'wrong-request-key',
          stage_packet_ref: stagePacketRef,
          stage_packet_refs: [stagePacketRef],
          stage_transition_authority_boundary: providerObservationBoundary(),
          opl_runtime_carrier: carrier,
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
      'paper_mission/start_or_resume',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_transition_request_identity_mismatch',
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime does not enqueue provider admission for MAS PaperMissionTransaction typed-blocker carrier', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-typed-blocker-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-paper-mission-typed-blocker-'));
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
  const actionType = 'typed_blocker';
  const workUnitId = 'medical_prose_write_repair_publication_gate_replay';
  const workUnitFingerprint = 'paper-mission-transaction::dm003::typed-blocker';
  const stagePacketRef = 'studies/003-dpcc-primary-care-phenotype-treatment-gap/artifacts/paper_mission/typed_blocker.stage-packet.json';
  const baseCarrier = masPaperMissionOplRuntimeCarrier({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'paper_mission_transaction_contract_v1',
    expectedVersion: 'paper_mission_transaction_contract_v1',
    idempotencyKey: 'paper-mission-transaction::dm003::typed-blocker',
  });
  const carrier = {
    ...baseCarrier,
    opl_route_command: {
      command_kind: 'stop_with_typed_blocker',
      target: 'current_owner_route_superseded_by_existing_typed_blocker',
      reason: 'typed_blocker',
      runtime_owner: 'one-person-lab',
    },
  };
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    studies: [
      {
        study_id: studyId,
        current_control_action: {
          status: 'transition_request_pending',
          provider_admission_requires_opl_runtime_result: true,
        },
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
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'paper_mission/start_or_resume',
        priority: 100,
        source: 'mas-paper-mission-transaction-carrier',
        dedupe_key: `paper-mission:${studyId}:${workUnitId}`,
        source_fingerprint: workUnitFingerprint,
        payload: {
          profile: profilePath,
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          action_fingerprint: workUnitFingerprint,
          source_fingerprint: workUnitFingerprint,
          dispatch_authority: 'paper_mission_transaction',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'med-autoscience',
          owner_route_current: true,
          provider_attempt_or_lease_required: false,
          provider_completion_is_domain_completion: false,
          stage_packet_ref: stagePacketRef,
          stage_packet_refs: [stagePacketRef],
          stage_transition_authority_boundary: providerObservationBoundary(),
          opl_runtime_carrier: carrier,
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
      'paper_mission/start_or_resume',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_provider_admission_requires_start_provider_attempt',
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
