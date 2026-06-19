import {
  assert,
  currentControlCommandOutboxRecord,
  familyRuntimeEnv,
  fs,
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
} from '../../../../../src/family-runtime-domain-progress-transition-runtime.ts';

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
