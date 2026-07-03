import {
  assert,
  currentControlCommandOutboxRecord,
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
import {
  appendDomainProgressTransitionRuntimeResultJsonl,
  buildDomainProgressTransitionRuntimeResult,
  normalizeDomainProgressTransitionCommand,
  readDomainProgressTransitionRuntimeReadbackJsonl,
} from '../../../../../src/modules/runway/family-runtime-domain-progress-transition-runtime.ts';

function completeRuntimeReadbackForCommand(input: {
  workspaceRoot: string;
  command: Record<string, unknown>;
  studyId: string;
  actionType: string;
  workUnitId: string;
  workUnitFingerprint: string;
  nextOwner: string;
  idempotencyKey: string;
}) {
  const normalized = normalizeDomainProgressTransitionCommand(input.command, {
    studyId: input.studyId,
    actionType: input.actionType,
    workUnitId: input.workUnitId,
    workUnitFingerprint: input.workUnitFingerprint,
    nextOwner: input.nextOwner,
  }).command;
  assert.ok(normalized);
  const logPath = path.join(
    input.workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'domain_progress_transition_runtime',
    'command_event_log.jsonl',
  );
  const append = appendDomainProgressTransitionRuntimeResultJsonl({
    logPath,
    result: buildDomainProgressTransitionRuntimeResult(normalized),
  });
  assert.equal(append.append_status, 'appended');
  const readback = readDomainProgressTransitionRuntimeReadbackJsonl({
    logPath,
    aggregateIdentity: normalized.aggregate_identity as Record<string, unknown>,
    idempotencyKey: input.idempotencyKey,
  });
  assert.equal(readback.runtime_readback_status, 'complete_transaction');
  return {
    command: normalized,
    runtimeResult: append.result,
    liveReadback: readback,
  };
}

test('family-runtime promotes current-control command alias only with complete same-transition readback', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-command-alias-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-command-alias-'));
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
  const actionType = 'run_quality_repair_batch';
  const workUnitId = 'medical_prose_write_repair';
  const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
  const attemptIdempotencyKey = 'paper-policy-request:current-control-command-alias';
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    `${actionType}.stage-packet.json`,
  ].join('/');
  const runtimeCommand = currentControlCommandOutboxRecord({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'truth-event-current-control-command-alias',
    idempotencyKey: attemptIdempotencyKey,
  });
  const { command, runtimeResult, liveReadback } = completeRuntimeReadbackForCommand({
    workspaceRoot,
    command: runtimeCommand,
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    nextOwner: 'write',
    idempotencyKey: attemptIdempotencyKey,
  });
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    provider_admission_pending_count: 1,
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: workUnitFingerprint,
        source_fingerprint: 'truth-snapshot::current-control-command-alias',
        dispatch_authority: 'consumer_default_executor_dispatch',
        stage_packet_ref: stagePacketRef,
        stage_packet_refs: [stagePacketRef],
        route_identity_key: attemptIdempotencyKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        next_executable_owner: 'write',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command: command,
        domain_progress_transition_runtime: runtimeResult,
        opl_domain_progress_transition_runtime_live_readback: liveReadback,
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
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
    ], env);
    const queue = runCli(['family-runtime', 'queue', 'list'], env);
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(queue.family_runtime_queue.tasks.length, 1);
    assert.deepEqual(task.payload.current_control_command_outbox_record, task.payload.current_control_command);
    assert.equal(task.payload.current_control_command_outbox_record.idempotency_key, attemptIdempotencyKey);
    assert.equal(
      task.payload.provider_admission_identity.current_control_command_outbox_record.idempotency_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      task.payload.opl_domain_progress_transition_runtime_live_readback.runtime_readback_status,
      'complete_transaction',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake prefers complete OPL readback over MAS request-only carrier for provider admission', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-complete-readback-over-request-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-complete-readback-over-request-'));
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
  const workUnitFingerprint =
    'domain-transition::ai_reviewer_re_eval::produce_ai_reviewer_publication_eval_record_against_current_inputs';
  const attemptIdempotencyKey = 'paper-policy-request:afa135a3051e8aa76700b447';
  const stagePacketRef = `mas://current-work-unit/${studyId}/${workUnitId}/stage-packet`;
  const oplCommand = currentControlCommandOutboxRecord({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'truth-event-000040-1a4d1f9cfed66d87',
    idempotencyKey: attemptIdempotencyKey,
  });
  const { liveReadback } = completeRuntimeReadbackForCommand({
    workspaceRoot,
    command: oplCommand,
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    nextOwner: 'ai_reviewer',
    idempotencyKey: attemptIdempotencyKey,
  });
  const requestOnlyCarrier = masDomainProgressTransitionRequest({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'truth-event-000040-1a4d1f9cfed66d87',
    idempotencyKey: attemptIdempotencyKey,
  });
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.mkdirSync(path.dirname(profilePath), { recursive: true });
  fs.writeFileSync(profilePath, '[workspace]\nname = "dm-cvd"\n', 'utf8');
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    quest_status: 'provider_admission_pending',
    provider_admission_pending_count: 1,
    transition_request_pending_count: 0,
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
        dispatch_authority: 'opl_current_control_state_handoff',
        stage_packet_ref: stagePacketRef,
        stage_packet_refs: [stagePacketRef],
        checkpoint_refs: [stagePacketRef],
        route_identity_key: attemptIdempotencyKey,
        attempt_idempotency_key: attemptIdempotencyKey,
        idempotency_key: attemptIdempotencyKey,
        next_executable_owner: 'ai_reviewer',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        opl_domain_progress_transition_request: requestOnlyCarrier,
        provider_admission_identity: {
          status: 'provider_admission_pending',
          study_id: studyId,
          work_unit_id: workUnitId,
          work_unit_fingerprint: workUnitFingerprint,
          route_identity_key: attemptIdempotencyKey,
          attempt_idempotency_key: attemptIdempotencyKey,
          request_idempotency_key: attemptIdempotencyKey,
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
      '--payload-match',
      `idempotency_key=${attemptIdempotencyKey}`,
    ], env);
    const queue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--study',
      studyId,
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload-match',
      `idempotency_key=${attemptIdempotencyKey}`,
    ], env);
    const task = queue.family_runtime_queue.tasks[0];

    assert.equal(intake.family_runtime_intake.enqueued_count, 1);
    assert.equal(intake.family_runtime_intake.blocked_count, 0);
    assert.equal(queue.family_runtime_queue.tasks.length, 1);
    assert.equal(task.payload.idempotency_key, attemptIdempotencyKey);
    assert.equal(task.payload.current_control_command.command_id, liveReadback.identity.command_id);
    assert.equal(task.payload.current_control_command.next_owner, 'ai_reviewer');
    assert.equal(task.payload.current_control_command.source_surface_kind, undefined);
    assert.equal(
      task.payload.provider_admission_identity.current_control_command_outbox_record.command_id,
      liveReadback.identity.command_id,
    );
    assert.equal(
      task.payload.domain_progress_transition_log_append.append_status,
      'idempotent_replay',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime rejects current-control command alias when runtime readback identity mismatches', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-command-alias-mismatch-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-current-control-command-alias-mismatch-'));
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
  const actionType = 'run_quality_repair_batch';
  const workUnitId = 'medical_prose_write_repair';
  const workUnitFingerprint = 'publication-blockers::0915410f804b3697';
  const commandIdempotencyKey = 'paper-policy-request:current-control-command-alias';
  const readbackIdempotencyKey = 'paper-policy-request:current-control-command-alias-other';
  const stagePacketRef = [
    'studies',
    studyId,
    'artifacts',
    'stage_packets',
    `${actionType}.stage-packet.json`,
  ].join('/');
  const command = currentControlCommandOutboxRecord({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'truth-event-current-control-command-alias',
    idempotencyKey: commandIdempotencyKey,
  });
  const mismatchedCommand = currentControlCommandOutboxRecord({
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    sourceGeneration: 'truth-event-current-control-command-alias-other',
    idempotencyKey: readbackIdempotencyKey,
  });
  const {
    runtimeResult,
    liveReadback,
  } = completeRuntimeReadbackForCommand({
    workspaceRoot,
    command: mismatchedCommand,
    studyId,
    actionType,
    workUnitId,
    workUnitFingerprint,
    nextOwner: 'write',
    idempotencyKey: readbackIdempotencyKey,
  });
  fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
  fs.writeFileSync(currentControlPath, JSON.stringify({
    surface: 'opl_current_control_state',
    provider_admission_pending_count: 1,
    provider_admission_candidates: [
      {
        status: 'provider_admission_pending',
        study_id: studyId,
        quest_id: studyId,
        action_type: actionType,
        work_unit_id: workUnitId,
        work_unit_fingerprint: workUnitFingerprint,
        action_fingerprint: workUnitFingerprint,
        source_fingerprint: 'truth-snapshot::current-control-command-alias-mismatch',
        dispatch_authority: 'consumer_default_executor_dispatch',
        stage_packet_ref: stagePacketRef,
        stage_packet_refs: [stagePacketRef],
        route_identity_key: commandIdempotencyKey,
        attempt_idempotency_key: commandIdempotencyKey,
        next_executable_owner: 'write',
        owner_route_current: true,
        provider_attempt_or_lease_required: true,
        provider_completion_is_domain_completion: false,
        stage_transition_authority_boundary: providerObservationBoundary(),
        current_control_command: command,
        domain_progress_transition_runtime: runtimeResult,
        opl_domain_progress_transition_runtime_live_readback: liveReadback,
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
      'current_control_provider_admission_command_record_missing',
    );
    assert.equal(queue.family_runtime_queue.tasks.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
