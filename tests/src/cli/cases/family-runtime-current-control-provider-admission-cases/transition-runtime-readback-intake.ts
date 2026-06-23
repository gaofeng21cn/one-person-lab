import {
  assert,
  familyRuntimeEnv,
  fs,
  masPaperMissionOplRuntimeCarrier,
  masDomainProgressTransitionRequest,
  os,
  path,
  providerObservationBoundary,
  runCli,
  test,
  writeJsonEmitterScript,
} from './shared.ts';
import './transition-runtime-readback-intake-parts/provider-admission-publication.ts';

test('family-runtime intake promotes MAS transition request-only task into OPL runtime-backed provider admission', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-request-pending-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-request-pending-'));
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
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    studies: [
      {
        study_id: studyId,
        current_control_action: {
          status: 'transition_request_pending',
          reason: 'await_opl_transition_readback',
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
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const tasks = queue.family_runtime_queue.tasks;

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.suppressed_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(intake.family_runtime_intake.exports[0].current_control_readback_publication_count, 1);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].source, 'opl-current-control-transition-request');
    assert.equal(tasks[0].payload.provider_admission_schema_source, 'transition_request_pending_task');
    assert.equal(tasks[0].payload.study_id, studyId);
    assert.equal(tasks[0].payload.action_type, actionType);
    assert.equal(tasks[0].payload.work_unit_id, workUnitId);
    assert.equal(tasks[0].payload.route_identity_key, attemptIdempotencyKey);
    assert.equal(tasks[0].payload.attempt_idempotency_key, attemptIdempotencyKey);
    assert.equal(tasks[0].payload.domain_progress_transition_runtime.transition_event.transition_kind, 'StartProviderAttempt');
    assert.equal(tasks[0].payload.domain_progress_transition_runtime.transition_event.exactly_one_transition, true);
    assert.equal(tasks[0].payload.domain_progress_transition_log_ref, 'runtime/artifacts/supervision/domain_progress_transition_runtime/command_event_log.jsonl');
    assert.equal(tasks[0].payload.domain_progress_transition_log_append.append_status, 'appended');
    assert.equal(tasks[0].payload.domain_progress_transition_log_append.appended_entry_count, 3);
    assert.equal(tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.surface_kind, 'opl_domain_progress_transition_runtime_live_readback');
    assert.equal(tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.runtime_readback_status, 'complete_transaction');
    assert.equal(tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.transaction_complete, true);
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.latest_transaction_readback
        .same_transaction_event_and_outbox,
      true,
    );
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.identity.latest_event_id,
      tasks[0].payload.opl_transition_event.event_id,
    );
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.identity.latest_outbox_item_id,
      tasks[0].payload.opl_transition_outbox_item.outbox_item_id,
    );
    assert.deepEqual(
      tasks[0].payload.opl_domain_progress_transition_live_readback,
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback,
    );
    assert.equal(tasks[0].payload.opl_transition_outbox_item.dispatch_allowed, true);
    assert.equal(tasks[0].payload.provider_admission_identity.domain_progress_transition_log_ref, 'runtime/artifacts/supervision/domain_progress_transition_runtime/command_event_log.jsonl');
    assert.equal(
      tasks[0].payload.provider_admission_identity.opl_domain_progress_transition_runtime_live_readback
        .identity.latest_event_id,
      tasks[0].payload.opl_transition_event.event_id,
    );
    assert.equal(tasks[0].payload.current_control_command_outbox_record.idempotency_key, attemptIdempotencyKey);
    assert.deepEqual(
      tasks[0].payload.current_control_command_outbox_record,
      tasks[0].payload.current_control_command,
    );
    assert.deepEqual(
      tasks[0].payload.provider_admission_identity.current_control_command_outbox_record,
      tasks[0].payload.current_control_command,
    );
    assert.equal(tasks[0].payload.current_control_command.idempotency_key, attemptIdempotencyKey);
    assert.equal(tasks[0].payload.current_control_command.runtime_kind, 'DomainProgressTransitionRuntime');
    const refreshedCurrentControl = JSON.parse(fs.readFileSync(currentControlPath, 'utf8'));
    assert.equal(
      refreshedCurrentControl.current_control_refresh_source,
      'opl_transition_runtime_readback_provider_admission',
    );
    assert.equal(refreshedCurrentControl.provider_admission_pending_count, 1);
    assert.equal(refreshedCurrentControl.transition_request_pending_count, 0);
    assert.equal(refreshedCurrentControl.provider_admission_candidates[0].status, 'provider_admission_pending');
    assert.equal(refreshedCurrentControl.provider_admission_candidates[0].study_id, studyId);
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0].attempt_idempotency_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0].route_identity_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0].provider_admission_identity
        .opl_domain_progress_transition_runtime_live_readback.identity.latest_event_id,
      tasks[0].payload.opl_transition_event.event_id,
    );
    assert.deepEqual(
      refreshedCurrentControl.provider_admission_candidates[0].current_control_command_outbox_record,
      refreshedCurrentControl.provider_admission_candidates[0].current_control_command,
    );
    assert.deepEqual(
      refreshedCurrentControl.provider_admission_candidates[0]
        .provider_admission_identity.current_control_command_outbox_record,
      refreshedCurrentControl.provider_admission_candidates[0].current_control_command,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0]
        .opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    assert.equal(
      refreshedCurrentControl.studies[0].current_control_action.status,
      'provider_admission_pending',
    );
    assert.equal(
      refreshedCurrentControl.studies[0].current_control_action.reason,
      'opl_transition_runtime_readback_published',
    );
    assert.equal(
      refreshedCurrentControl.latest_provider_admission_identity.attempt_idempotency_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_projection_metadata.projection_role,
      'console_read_model_from_runway_transition_runtime',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

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
          stage_transition_authority_boundary: providerObservationBoundary(),
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
    const refreshedCurrentControl = JSON.parse(fs.readFileSync(currentControlPath, 'utf8'));

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.suppressed_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].source, 'opl-current-control-transition-request');
    assert.equal(tasks[0].payload.provider_admission_schema_source, 'transition_request_pending_task');
    assert.equal(tasks[0].task_kind, 'domain_owner/default-executor-dispatch');
    assert.equal(tasks[0].payload.provider_admission_source_task_kind, 'paper_mission/start_or_resume');
    assert.equal(tasks[0].payload.provider_admission_identity.provider_admission_source_task_kind, 'paper_mission/start_or_resume');
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

test('family-runtime intake consumes MAS current-control transition_request_candidates as OPL runtime-backed provider admission', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-candidate-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-transition-candidate-'));
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
  const actionType = 'return_to_ai_reviewer_workflow';
  const workUnitId = 'produce_ai_reviewer_publication_eval_record_against_current_inputs';
  const workUnitFingerprint = 'domain-transition::ai_reviewer_re_eval::produce_ai_reviewer_publication_eval_record_against_current_inputs';
  const stagePacketRef = `mas://current-work-unit/${studyId}/${workUnitId}/stage-packet`;
  const attemptIdempotencyKey = 'paper-policy-request:afa135a3051e8aa76700b447';
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    quest_status: 'transition_request_pending',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    transition_request_candidates: [
      {
        status: 'transition_request_pending',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: workUnitFingerprint,
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        dispatch_authority: null,
        dispatch_ref: stagePacketRef,
        stage_packet_ref: stagePacketRef,
        stage_packet_refs: [stagePacketRef],
        checkpoint_refs: [stagePacketRef],
        route_identity_key: attemptIdempotencyKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        idempotency_key: attemptIdempotencyKey,
        provider_attempt_or_lease_required: false,
        provider_admission_requires_opl_runtime_result: true,
        opl_transition_runtime_required: true,
        source_refs: {
          dispatch_ref: stagePacketRef,
          route_identity_key: attemptIdempotencyKey,
          attempt_idempotency_key: attemptIdempotencyKey,
          stage_packet_ref: stagePacketRef,
          stage_packet_refs: [stagePacketRef],
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
        },
        currentness_basis: {
          truth_epoch: 'truth-event-000040-1a4d1f9cfed66d87',
          runtime_health_epoch: 'runtime-health-event-007038-962223086f82031d',
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
        },
        opl_domain_progress_transition_request: masDomainProgressTransitionRequest({
          studyId,
          actionType,
          workUnitId,
          workUnitFingerprint,
          sourceGeneration: 'truth-event-000040-1a4d1f9cfed66d87',
          expectedVersion: 'truth-event-000040-1a4d1f9cfed66d87',
          idempotencyKey: attemptIdempotencyKey,
        }),
      },
    ],
    action_queue: [
      {
        status: 'transition_request_pending',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: workUnitFingerprint,
        owner: 'ai_reviewer',
        authority: 'mas_provider_admission_identity',
        route_identity_key: attemptIdempotencyKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        idempotency_key: attemptIdempotencyKey,
      },
    ],
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
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const tasks = queue.family_runtime_queue.tasks;

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(intake.family_runtime_intake.exports[0].current_control_readback_publication_count, 1);
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].source, 'opl-current-control-transition-request');
    assert.equal(tasks[0].payload.provider_admission_schema_source, 'transition_request_pending_task');
    assert.equal(tasks[0].payload.route_identity_key, attemptIdempotencyKey);
    assert.equal(tasks[0].payload.attempt_idempotency_key, attemptIdempotencyKey);
    assert.equal(tasks[0].payload.stage_packet_ref, stagePacketRef);
    assert.equal(tasks[0].payload.provider_attempt_or_lease_required, false);
    assert.equal(tasks[0].payload.current_control_command.transition_kind, 'StartProviderAttempt');
    assert.equal(tasks[0].payload.current_control_command.postcondition.kind, 'provider_admission_enqueued_or_blocked');
    assert.equal(tasks[0].payload.opl_transition_outbox_item.dispatch_allowed, true);
    assert.equal(
      tasks[0].payload.opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    const refreshedCurrentControl = JSON.parse(fs.readFileSync(currentControlPath, 'utf8'));
    assert.equal(refreshedCurrentControl.provider_admission_pending_count, 1);
    assert.equal(refreshedCurrentControl.transition_request_pending_count, 0);
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0].attempt_idempotency_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0]
        .opl_domain_progress_transition_runtime_live_readback.identity.stage_run_identity
        .attempt_idempotency_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_candidates[0].current_control_command.transition_kind,
      'StartProviderAttempt',
    );
    assert.equal(refreshedCurrentControl.studies[0].current_control_action.status, 'provider_admission_pending');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime records NonAdvancingApply when authorized stage packet lacks OPL transition request', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-non-advancing-current-transition-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-non-advancing-current-transition-'));
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
  const runtimeLogPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'domain_progress_transition_runtime',
    'command_event_log.jsonl',
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
    'supervision',
    'consumer',
    'default_executor_dispatches',
    'immutable',
    'run_quality_repair_batch',
    '33abc53e0c18295f5fa03738.json',
  ].join('/');
  const ownerRouteIdempotencyKey = [
    'paper-recovery',
    studyId,
    actionType,
    workUnitFingerprint,
  ].join('::');
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    current_executable_owner_action: {
      action_type: actionType,
      work_unit_id: workUnitId,
      work_unit_fingerprint: workUnitFingerprint,
    },
    studies: [
      {
        study_id: studyId,
        current_control_action: {
          status: 'transition_request_pending',
          reason: 'await_opl_transition_readback',
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
        task_kind: 'domain_owner/default-executor-dispatch',
        priority: 95,
        source: 'mas-domain-handler-export',
        dedupe_key: `mas:dm-cvd:${studyId}:authorized-stage-packet:${actionType}`,
        source_fingerprint: workUnitFingerprint,
        reason: 'current_control_transition_request_pending',
        blocked_reason: 'opl_execution_authorization_required',
        execution_requires_opl_authorization: true,
        payload: {
          profile: profilePath,
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          action_fingerprint: workUnitFingerprint,
          source_fingerprint: workUnitFingerprint,
          dispatch_authority: 'consumer_default_executor_dispatch',
          dispatch_status: 'transition_request_pending',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'write',
          owner_route_current: true,
          provider_attempt_or_lease_required: false,
          provider_completion_is_domain_completion: false,
          stage_packet_ref: stagePacketRef,
          stage_packet_refs: [stagePacketRef],
          stage_transition_authority_boundary: providerObservationBoundary(),
          owner_route: {
            idempotency_key: ownerRouteIdempotencyKey,
            trace_id: `owner-route-trace::${studyId}::8069bb095591944f`,
            next_owner: 'write',
            currentness_contract: {
              basis: {
                truth_epoch: workUnitFingerprint,
                runtime_health_epoch: workUnitFingerprint,
                work_unit_id: workUnitId,
                work_unit_fingerprint: workUnitFingerprint,
              },
              fail_closed_when_missing: true,
              missing_required_fields: [],
              status: 'currentness_basis_required',
            },
            source_refs: {
              source_surface: 'paper_recovery_state',
              supervisor_authority: 'paper_autonomy_supervisor_decision',
            },
          },
          owner_route_currentness_basis: {
            source: 'paper_recovery_state.next_safe_action.successor_owner_action',
            truth_epoch: workUnitFingerprint,
            runtime_health_epoch: workUnitFingerprint,
            work_unit_id: workUnitId,
            work_unit_fingerprint: workUnitFingerprint,
          },
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
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const refreshedCurrentControl = JSON.parse(fs.readFileSync(currentControlPath, 'utf8'));
    const logEntries = fs.readFileSync(runtimeLogPath, 'utf8').trim().split(/\r?\n/u).map((line) => JSON.parse(line));

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.suppressed_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(intake.family_runtime_intake.exports[0].current_control_readback_publication_count, 1);
    assert.equal(
      intake.family_runtime_intake.exports[0].current_control_readback_publications[0].status,
      'transition_non_advancing_apply_recorded',
    );
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_transition_non_advancing_apply_recorded',
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
    assert.equal(logEntries.length, 3);
    assert.equal(logEntries[1].payload.transition_kind, 'NonAdvancingApply');
    assert.equal(refreshedCurrentControl.provider_admission_pending_count, 0);
    assert.equal(refreshedCurrentControl.transition_request_pending_count, 0);
    assert.equal(refreshedCurrentControl.current_executable_owner_action, null);
    assert.equal(
      refreshedCurrentControl.current_control_refresh_source,
      'opl_transition_runtime_readback_non_advancing_apply',
    );
    assert.equal(
      refreshedCurrentControl.studies[0].current_control_action.status,
      'transition_non_advancing_apply_recorded',
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_non_advancing_apply_readback
        .runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_non_advancing_apply_readback
        .runtime_live_readback.transaction_complete,
      true,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_non_advancing_apply_readback
        .runtime_result.exactly_one_outcome.non_advancing_apply,
      true,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_non_advancing_apply_readback
        .runtime_live_readback.replay_audit.replay_status,
      'replay_ready',
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_non_advancing_apply_readback
        .runtime_live_readback.replay_audit.read_model_projection_consumable,
      true,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_projection_metadata.replay_audit_status,
      'replay_ready',
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_projection_metadata.replay_audit_consumable,
      true,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_projection_metadata.provider_admission_allowed,
      false,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_projection_metadata.current_executable_owner_action_allowed,
      false,
    );
    assert.equal(
      refreshedCurrentControl.domain_progress_transition_projection_metadata.paper_progress_delta,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime blocks NonAdvancingApply readback for stale route or stage packet identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-non-advancing-stale-identity-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-non-advancing-stale-identity-'));
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
  const runtimeLogPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'domain_progress_transition_runtime',
    'command_event_log.jsonl',
  );
  const studyId = '003-dpcc-primary-care-phenotype-treatment-gap';
  const actionType = 'run_quality_repair_batch';
  const workUnitId = 'medical_prose_write_repair';
  const workUnitFingerprint = 'publication-blockers::stale-identity';
  const currentStagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    'current-quality-repair.stage-packet.json',
  ].join('/');
  const staleStagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    'stale-quality-repair.stage-packet.json',
  ].join('/');
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    transition_request_pending_count: 1,
    provider_admission_pending_count: 0,
    current_executable_owner_action: {
      action_type: actionType,
      work_unit_id: workUnitId,
      work_unit_fingerprint: workUnitFingerprint,
      route_identity_key: 'owner-route::dm003::current',
      attempt_idempotency_key: 'owner-route-attempt::dm003::current',
      stage_packet_ref: currentStagePacketRef,
      stage_packet_refs: [currentStagePacketRef],
    },
    studies: [
      {
        study_id: studyId,
        current_control_action: {
          status: 'transition_request_pending',
          reason: 'await_opl_transition_readback',
          provider_admission_requires_opl_runtime_result: true,
          route_identity_key: 'owner-route::dm003::current',
          attempt_idempotency_key: 'owner-route-attempt::dm003::current',
          stage_packet_ref: currentStagePacketRef,
          stage_packet_refs: [currentStagePacketRef],
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
    pending_family_tasks: [
      {
        domain_id: 'medautoscience',
        task_kind: 'domain_owner/default-executor-dispatch',
        priority: 95,
        source: 'mas-domain-handler-export',
        dedupe_key: `mas:dm-cvd:${studyId}:stale-authorized-stage-packet:${actionType}`,
        source_fingerprint: workUnitFingerprint,
        reason: 'current_control_transition_request_pending',
        blocked_reason: 'opl_execution_authorization_required',
        execution_requires_opl_authorization: true,
        payload: {
          study_id: studyId,
          quest_id: studyId,
          action_type: actionType,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          action_fingerprint: workUnitFingerprint,
          source_fingerprint: workUnitFingerprint,
          dispatch_status: 'transition_request_pending',
          executor_kind: 'codex_cli_default',
          next_executable_owner: 'write',
          owner_route_current: true,
          provider_completion_is_domain_completion: false,
          stage_packet_ref: staleStagePacketRef,
          stage_packet_refs: [staleStagePacketRef],
          route_identity_key: 'owner-route::dm003::stale',
          attempt_idempotency_key: 'owner-route-attempt::dm003::stale',
          stage_transition_authority_boundary: providerObservationBoundary(),
          owner_route_currentness_basis: {
            truth_epoch: workUnitFingerprint,
            runtime_health_epoch: workUnitFingerprint,
            work_unit_id: workUnitId,
            work_unit_fingerprint: workUnitFingerprint,
          },
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
    const queue = runCli(['family-runtime', 'queue', 'list'], env);

    assert.equal(intake.family_runtime_intake.enqueued_count, 0);
    assert.equal(intake.family_runtime_intake.blocked_count, 1);
    assert.equal(
      intake.family_runtime_intake.exports[0].blocked[0].reason,
      'current_control_transition_non_advancing_apply_not_current',
    );
    assert.equal(intake.family_runtime_intake.exports[0].current_control_readback_publication_count, 0);
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
    assert.equal(fs.existsSync(runtimeLogPath), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
