import {
  assert,
  DatabaseSync,
  ensureProviderHostedStageAttempt,
  familyRuntimeEnv,
  fs,
  masDomainProgressTransitionRequest,
  os,
  path,
  providerObservationBoundary,
  runCli,
  test,
  writeJsonEmitterScript,
} from '../shared.ts';
import { publishCurrentControlProviderAdmissionReadback } from '../../../../../../src/modules/runway/family-runtime-domain-intake-parts/current-control-provider-admission.ts';

test('family-runtime refuses to publish provider admission readback from incomplete transition runtime transaction', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-incomplete-transition-readback-'));
  const workspaceRoot = path.join(fixtureRoot, 'workspace');
  const currentControlPath = path.join(
    workspaceRoot,
    'runtime',
    'artifacts',
    'supervision',
    'opl_current_control_state',
    'latest.json',
  );
  const incompleteReadback = {
    surface_kind: 'opl_domain_progress_transition_runtime_live_readback',
    runtime_id: 'opl_domain_progress_transition_runtime',
    runtime_readback_status: 'incomplete_transaction',
    transaction_complete: false,
    causality: {
      same_transaction_event_and_outbox: false,
      runtime_readback_status: 'incomplete_transaction',
      transaction_complete: false,
      fail_closed_reason: 'domain_progress_transition_readback_incomplete_transaction',
    },
    exactly_one_outcome: {
      selected: false,
      exactly_one_transition: false,
      stable_outcome: false,
      fail_closed: true,
      outcome_kind: 'blocked_incomplete_transaction',
    },
    latest_transaction_readback: {
      transaction_id: 'dptx:incomplete',
      command_present: true,
      event_present: true,
      outbox_item_present: false,
      same_transaction_event_and_outbox: false,
      same_stage_run_identity: false,
    },
  };
  const payload = {
    study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    quest_id: '003-dpcc-primary-care-phenotype-treatment-gap',
    action_type: 'run_quality_repair_batch',
    work_unit_id: 'medical_prose_write_repair',
    work_unit_fingerprint: 'publication-blockers::incomplete-readback',
    action_fingerprint: 'publication-blockers::incomplete-readback',
    source_fingerprint: 'truth-snapshot::incomplete-readback',
    route_identity_key: 'paper-policy-request:incomplete-readback',
    attempt_idempotency_key: 'paper-policy-request:incomplete-readback',
    next_executable_owner: 'write',
    owner_route_current: true,
    provider_completion_is_domain_completion: false,
    opl_domain_progress_transition_runtime_live_readback: incompleteReadback,
    provider_admission_identity: {
      status: 'provider_admission_pending',
      route_identity_key: 'paper-policy-request:incomplete-readback',
      attempt_idempotency_key: 'paper-policy-request:incomplete-readback',
      provider_completion_is_domain_completion: false,
      opl_domain_progress_transition_runtime_live_readback: incompleteReadback,
    },
  };
  try {
    fs.mkdirSync(path.dirname(currentControlPath), { recursive: true });
    fs.writeFileSync(currentControlPath, JSON.stringify({
      surface: 'opl_current_control_state',
      transition_request_pending_count: 1,
      provider_admission_pending_count: 0,
      provider_admission_candidates: [],
    }, null, 2), 'utf8');

    const published = publishCurrentControlProviderAdmissionReadback({
      output: {
        workspace: {
          workspace_root: workspaceRoot,
          workspace_exists: true,
        },
      },
      taskInput: {
        domainId: 'medautoscience',
        taskKind: 'domain_owner/default-executor-dispatch',
        source: 'opl-current-control-transition-request',
        priority: 95,
        dedupeKey: 'mas:dm-cvd:003:transition-request:incomplete-readback',
        requiresApproval: false,
        payload,
      },
      taskResult: {
        accepted: true,
        task: { payload },
      },
    });
    const currentControl = JSON.parse(fs.readFileSync(currentControlPath, 'utf8'));

    assert.equal(published.published, false);
    assert.equal(published.reason, 'transition_runtime_live_readback_incomplete');
    assert.equal(currentControl.provider_admission_pending_count, 0);
    assert.equal(currentControl.transition_request_pending_count, 1);
    assert.deepEqual(currentControl.provider_admission_candidates, []);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime intake consumes terminal OPL provider admission instead of republishing pending on volatile refresh', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-terminal-consumed-readback-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-terminal-consumed-readback-'));
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
  const routeIdentityKey = 'owner-route::dm003::quality-repair-current';
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
  const writeExport = (runtimeHealthEpoch: string, generatedAt: string) => writeJsonEmitterScript(exportPath, {
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
          route_identity_key: routeIdentityKey,
          attempt_idempotency_key: attemptIdempotencyKey,
          stage_packet_ref: stagePacketRef,
          stage_packet_refs: [stagePacketRef],
          stage_transition_authority_boundary: providerObservationBoundary(),
          owner_route_currentness_basis: {
            generated_at: generatedAt,
            observed_generation: 'truth-event-dm003-transition-request',
            derived_generation: 'truth-event-dm003-transition-request',
            work_unit_id: workUnitId,
            work_unit_fingerprint: workUnitFingerprint,
            truth_epoch: 'truth-event-dm003-transition-request',
            runtime_health_epoch: runtimeHealthEpoch,
            currentness_digest_basis: {
              runtime_digest: runtimeHealthEpoch,
              stable_truth_digest: 'truth-event-dm003-transition-request',
              volatile_projection_digest: `projection:${runtimeHealthEpoch}`,
              work_unit_digest: workUnitFingerprint,
            },
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
  writeExport('runtime-health-event-01', '2026-06-17T14:55:58Z');
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
      const task = db.prepare(`
        SELECT *
        FROM tasks
        WHERE dedupe_key = ?
      `).get(attemptIdempotencyKey) as any;
      assert.ok(task);
      const taskPayload = JSON.parse(task.payload_json);
      const attempt = ensureProviderHostedStageAttempt(db, task, taskPayload, {
        eventSource: 'test-terminal-consumed-readback',
      });
      assert.ok(attempt);
      const closeoutRefs = [
        `studies/${studyId}/artifacts/supervision/consumer/default_executor_execution/${attempt.stage_attempt_id}.closeout.json`,
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
        attempt.stage_attempt_id,
      );
      db.prepare(`
        UPDATE tasks
        SET status = 'succeeded'
        WHERE task_id = ?
      `).run(task.task_id);
    } finally {
      db.close();
    }
    writeExport('runtime-health-event-02', '2026-06-17T15:00:00Z');

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
    assert.equal(secondIntake.family_runtime_intake.requeued_count, 0);
    assert.equal(secondIntake.family_runtime_intake.idempotent_noop_count, 1);
    assert.equal(secondIntake.family_runtime_intake.exports[0].current_control_readback_publication_count, 1);
    assert.equal(
      secondIntake.family_runtime_intake.exports[0].current_control_readback_publications[0].status,
      'provider_admission_terminal_consumed',
    );
    assert.equal(queue.family_runtime_queue.tasks[0].status, 'succeeded');
    assert.equal(
      refreshedCurrentControl.current_control_refresh_source,
      'opl_transition_runtime_readback_provider_admission_terminal_consumed',
    );
    assert.equal(refreshedCurrentControl.provider_admission_pending_count, 0);
    assert.equal(refreshedCurrentControl.provider_admission_candidates.length, 0);
    assert.equal(
      refreshedCurrentControl.studies[0].current_control_action.status,
      'provider_admission_terminal_consumed',
    );
    assert.equal(
      refreshedCurrentControl.latest_provider_admission_terminal_consumed_readback.status,
      'provider_admission_terminal_consumed',
    );
    assert.equal(
      refreshedCurrentControl.latest_provider_admission_terminal_consumed_readback.currentness_identity
        .attempt_idempotency_key,
      attemptIdempotencyKey,
    );
    assert.equal(
      refreshedCurrentControl.provider_admission_projection_metadata.terminal_consumed,
      true,
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
