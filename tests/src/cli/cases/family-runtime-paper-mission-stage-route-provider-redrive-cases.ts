import {
  assert,
  dispatchFamilyRuntimeTask,
  familyRuntimeEnv,
  FrameworkContractError,
  fs,
  inspectTask,
  installDirectDispatchEnv,
  openQueueDb,
  os,
  paperMissionRoutePayload,
  paperMissionRoutePayloadWithWorkspace,
  path,
  redriveWithInjectedTemporalProvider,
  runCli,
  type StageRouteDispatchReadback,
  syncStageAttemptFromTemporalTerminalObservation,
  test,
  type FamilyRuntimeTaskRow,
  enqueueTask,
} from './family-runtime-paper-mission-stage-route-helpers.ts';

test('family-runtime Temporal completed PaperMission stage-route without typed closeout becomes explicit blocker', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-temporal-missing-closeout-'));
  const restoreEnv = installDirectDispatchEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
  });
  try {
    const { db, paths } = openQueueDb();
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: paperMissionRoutePayloadWithWorkspace(),
      dedupeKey: 'paper-mission-route:dm002:temporal-missing-closeout',
      source: 'test',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(enqueued.task.task_id) as FamilyRuntimeTaskRow;
    const started = await dispatchFamilyRuntimeTask(db, paths, row, {
      temporalProviderModule: async () => ({
        startTemporalStageAttemptWorkflow: async (attempt) => ({
          surface_kind: 'temporal_stage_attempt_start_receipt',
          provider_kind: 'temporal',
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          first_execution_run_id: 'run-paper-mission-route-missing-closeout',
        }),
      }),
    }) as unknown as StageRouteDispatchReadback;
    const startedTask = inspectTask(db, enqueued.task.task_id);
    const attempt = startedTask.stage_attempts[0];

    assert.equal(started.status, 'running');
    assert.equal(startedTask.task.status, 'running');
    assert.equal(attempt.status, 'running');

    syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: attempt.stage_id,
        status: 'completed',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activity_events: [],
        stage_progress_log: {
          surface_kind: 'temporal_workflow_stage_progress_log',
          planned_work: {},
          timeline: [],
          visibility: {},
        },
        checkpoint_refs: [],
        closeout_refs: [],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: null,
        route_impact: {},
        human_gate_refs: [],
        signals: [],
        closeout_packet: null,
        completion_boundary: {
          provider_completion: 'completed',
          domain_ready_verdict: null,
          provider_completion_is_domain_ready: false,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    });

    const terminalTask = inspectTask(db, enqueued.task.task_id);
    assert.equal(terminalTask.task.status, 'blocked');
    assert.equal(terminalTask.task.last_error, 'temporal_stage_attempt_completed_missing_typed_closeout');
    assert.equal(terminalTask.task.dead_letter_reason, 'temporal_stage_attempt_completed_missing_typed_closeout');
    assert.equal(terminalTask.stage_attempts[0].status, 'blocked');
    assert.equal(terminalTask.stage_attempts[0].blocked_reason, 'temporal_stage_attempt_completed_missing_typed_closeout');
    assert.equal(terminalTask.stage_attempts[0].closeout_refs.length, 0);
    assert.equal(terminalTask.stage_attempts[0].closeout_receipt_status, null);
    assert.equal(
      terminalTask.events.some((event) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
        && event.payload.reason === 'temporal_stage_attempt_completed_missing_typed_closeout'
      ),
      true,
    );
    db.close();
  } finally {
    restoreEnv();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime redrives PaperMission stage-route typed closeout packet transport failure', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-closeout-redrive-'));
  const restoreEnv = installDirectDispatchEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
  });
  try {
    const { db, paths } = openQueueDb();
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: paperMissionRoutePayloadWithWorkspace({
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        mission_id: 'paper-mission::003-dpcc-primary-care-phenotype-treatment-gap::submission::auto',
        paper_mission_transaction_ref: 'paper-mission-transaction:dm003:submission',
        opl_route_command_ref: 'paper-mission-transaction:dm003:submission#opl_route_command',
        command_kind: 'resume_stage',
        route_target: 'continue paper-facing submission milestone work',
        route_identity_key: 'paper-mission-transaction:dm003:submission::route',
        attempt_idempotency_key: 'dm003:submission:consumed::opl-attempt',
        request_idempotency_key: 'dm003:submission:consumed::opl-request',
        stage_run_request: {
          request_status: 'requested',
          requested_by: 'mas_paper_mission_route_handoff',
          route_identity_key: 'paper-mission-transaction:dm003:submission::route',
          attempt_idempotency_key: 'dm003:submission:consumed::opl-attempt',
          stage_run_created: false,
          provider_attempt_requested: false,
        },
      }),
      dedupeKey: 'paper-mission-route:dm003:typed-closeout-redrive',
      source: 'test',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(enqueued.task.task_id) as FamilyRuntimeTaskRow;
    await dispatchFamilyRuntimeTask(db, paths, row, {
      temporalProviderModule: async () => ({
        startTemporalStageAttemptWorkflow: async (attempt) => ({
          surface_kind: 'temporal_stage_attempt_start_receipt',
          provider_kind: 'temporal',
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          first_execution_run_id: 'run-paper-mission-route-closeout-redrive-original',
        }),
      }),
    });
    const startedTask = inspectTask(db, enqueued.task.task_id);
    const originalAttempt = startedTask.stage_attempts[0];
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked',
        last_error = 'typed_closeout_packet_required',
        dead_letter_reason = 'typed_closeout_packet_required',
        updated_at = ?
      WHERE task_id = ?
    `).run(new Date().toISOString(), enqueued.task.task_id);
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'blocked',
        blocked_reason = 'typed_closeout_packet_required',
        closeout_refs_json = '[]',
        closeout_receipt_status = NULL,
        provider_run_json = json_set(
          provider_run_json,
          '$.provider_status', 'blocked',
          '$.terminal_observation.reason', 'typed_closeout_packet_required'
        ),
        updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(new Date().toISOString(), originalAttempt.stage_attempt_id);
    const staleWorkspaceLocator = { ...originalAttempt.workspace_locator };
    delete staleWorkspaceLocator.route_identity_key;
    delete staleWorkspaceLocator.attempt_idempotency_key;
    delete staleWorkspaceLocator.request_idempotency_key;
    staleWorkspaceLocator.candidate_ref = 'ops/medautoscience/paper_mission_candidate_package/legacy/package_manifest.json';
    const staleCloseoutAt = new Date().toISOString();
    db.prepare(`
      INSERT INTO stage_attempts(
        stage_attempt_id, idempotency_key, provider_kind, workflow_id, domain_id, stage_id, workspace_locator_json,
        source_fingerprint, executor_kind, status, checkpoint_refs_json, closeout_refs_json,
        human_gate_refs_json, retry_budget_json, attempt_count, task_id, blocked_reason,
        provider_receipt_json, provider_run_json, activity_events_json, route_impact_json,
        closeout_receipt_status, created_at, updated_at
      )
      VALUES (
        @stage_attempt_id, @idempotency_key, @provider_kind, @workflow_id, @domain_id, @stage_id, @workspace_locator_json,
        @source_fingerprint, @executor_kind, @status, @checkpoint_refs_json, @closeout_refs_json,
        @human_gate_refs_json, @retry_budget_json, @attempt_count, @task_id, @blocked_reason,
        @provider_receipt_json, @provider_run_json, @activity_events_json, @route_impact_json,
        @closeout_receipt_status, @created_at, @updated_at
      )
    `).run({
      stage_attempt_id: 'sat_legacy_accepted_no_currentness_identity',
      idempotency_key: 'idem_legacy_accepted_no_currentness_identity',
      provider_kind: 'temporal',
      workflow_id: 'wf_legacy_accepted_no_currentness_identity',
      domain_id: 'medautoscience',
      stage_id: originalAttempt.stage_id,
      workspace_locator_json: JSON.stringify(staleWorkspaceLocator),
      source_fingerprint: 'mas_paper_mission_route_source_legacy_no_identity',
      executor_kind: 'codex_cli',
      status: 'completed',
      checkpoint_refs_json: JSON.stringify(['paper-mission-transaction:dm003:legacy']),
      closeout_refs_json: JSON.stringify(['ops/medautoscience/paper_mission_consumption_ledger/legacy/opl_route_handoff.json']),
      human_gate_refs_json: JSON.stringify([]),
      retry_budget_json: JSON.stringify({ max_attempts: 3 }),
      attempt_count: 1,
      task_id: enqueued.task.task_id,
      blocked_reason: null,
      provider_receipt_json: JSON.stringify({ provider_kind: 'temporal' }),
      provider_run_json: JSON.stringify({
        provider_kind: 'temporal',
        workflow_id: 'wf_legacy_accepted_no_currentness_identity',
        provider_status: 'completed',
      }),
      activity_events_json: JSON.stringify([]),
      route_impact_json: JSON.stringify({}),
      closeout_receipt_status: 'accepted_typed_closeout',
      created_at: staleCloseoutAt,
      updated_at: staleCloseoutAt,
    });
    db.close();

    const blockedTask = runCli(['family-runtime', 'queue', 'inspect', enqueued.task.task_id], familyRuntimeEnv(stateRoot));
    const redrive = await redriveWithInjectedTemporalProvider(enqueued.task.task_id, {
      reason: 'typed_closeout_uri_ref_ingestion_fix_reloaded_worker',
      source: 'test-paper-route-closeout-redrive',
      firstExecutionRunId: 'run-paper-mission-route-closeout-redrive-redriven',
    });
    const redrivenDb = openQueueDb().db;
    const afterDispatch = inspectTask(redrivenDb, enqueued.task.task_id);
    const newestAttempt = afterDispatch.stage_attempts.find((attempt) =>
      attempt.stage_attempt_id === redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_id
    )!;

    const blockedAttempt = blockedTask.family_runtime_task.stage_attempts.find((attempt: Record<string, unknown>) =>
      attempt.stage_attempt_id === originalAttempt.stage_attempt_id
    );
    assert.equal(blockedTask.family_runtime_task.task.status, 'blocked');
    assert.equal(blockedAttempt?.blocked_reason, 'typed_closeout_packet_required');
    assert.equal(
      blockedTask.family_runtime_task.stage_attempts.some((attempt: Record<string, unknown>) =>
        attempt.stage_attempt_id === 'sat_legacy_accepted_no_currentness_identity'
        && attempt.closeout_receipt_status === 'accepted_typed_closeout'
      ),
      true,
    );
    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'running');
    assert.equal(redrive.family_runtime_redrive.provider_redrive_started, true);
    assert.equal(redrive.family_runtime_redrive.provider_redrive_followthrough.status, 'provider_started');
    assert.equal(redrive.family_runtime_redrive.provider_redrive_followthrough.provider_started, true);
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.status, 'running');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.executor_kind, 'codex_cli');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_executor_policy.executor_kind, 'codex_cli');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_executor_policy.model, 'gpt-5.5');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_executor_policy.provider, 'openai');
    assert.equal(
      redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_executor_policy.policy_source,
      'local_codex_default_materialized_at_stage_attempt_creation',
    );
    assert.equal(redrive.family_runtime_redrive.redrive_protocol.protocol, 'provider_transport_only');
    assert.equal(redrive.family_runtime_redrive.redrive_protocol.domain_progress_claim, false);
    assert.equal(redrive.family_runtime_redrive.authority_boundary.domain_truth_mutation, false);
    assert.equal(redrive.family_runtime_redrive.authority_boundary.owner_receipt_created, false);
    assert.equal(redrive.family_runtime_redrive.authority_boundary.typed_blocker_created, false);
    assert.equal(afterDispatch.task.status, 'running');
    assert.equal(newestAttempt.status, 'running');
    assert.equal(newestAttempt.provider_kind, 'temporal');
    assert.notEqual(newestAttempt.stage_attempt_id, originalAttempt.stage_attempt_id);
    assert.equal(
      newestAttempt.stage_attempt_id,
      redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_id,
    );
    syncStageAttemptFromTemporalTerminalObservation(redrivenDb, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: originalAttempt.stage_attempt_id,
      workflow_id: originalAttempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: originalAttempt.stage_attempt_id,
        workflow_id: originalAttempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: originalAttempt.stage_id,
        status: 'blocked',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activity_events: [],
        stage_progress_log: {
          surface_kind: 'temporal_workflow_stage_progress_log',
          planned_work: {},
          timeline: [],
          visibility: {},
        },
        checkpoint_refs: [],
        closeout_refs: [],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: null,
        route_impact: {},
        human_gate_refs: [],
        signals: [],
        closeout_packet: null,
        completion_boundary: {
          provider_completion: 'not_completed',
          domain_ready_verdict: null,
          provider_completion_is_domain_ready: false,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    });
    const afterStaleTerminalSync = inspectTask(redrivenDb, enqueued.task.task_id);
    assert.equal(afterStaleTerminalSync.task.status, 'running');
    const newestAttemptAfterStaleTerminalSync = afterStaleTerminalSync.stage_attempts.find((attempt) =>
      attempt.stage_attempt_id === newestAttempt.stage_attempt_id
    );
    assert.equal(newestAttemptAfterStaleTerminalSync?.status, 'running');
    assert.equal(newestAttempt.workspace_locator.study_id, '003-dpcc-primary-care-phenotype-treatment-gap');
    assert.equal(newestAttempt.workspace_locator.can_claim_paper_progress, false);
    assert.equal(newestAttempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(
      afterDispatch.events.some((event) =>
        event.event_type === 'task_operator_redrive_from_terminal_provider_transport'
        && event.payload.previous_stage_attempt_id === originalAttempt.stage_attempt_id
        && event.payload.previous_stage_attempt_blocked_reason === 'typed_closeout_packet_required'
        && event.payload.redriven_stage_attempt_id === newestAttempt.stage_attempt_id
        && event.payload.provider_redrive_started === true
        && (event.payload.redrive_protocol as Record<string, unknown>).domain_progress_claim === false
        && (event.payload.authority_boundary as Record<string, unknown>).domain_truth_mutation === false
      ),
      true,
    );
    redrivenDb.close();
  } finally {
    restoreEnv();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime blocks non-advancing PaperMission route-back redrive without MAS owner delta', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-nonadvancing-routeback-'));
  const restoreEnv = installDirectDispatchEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
  });
  try {
    const { db, paths } = openQueueDb();
    const payload = paperMissionRoutePayloadWithWorkspace({
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      mission_id: 'paper-mission::003-dpcc-primary-care-phenotype-treatment-gap::submission::auto',
      candidate_ref:
        '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_candidate_package/submission/package_manifest.json',
      paper_mission_transaction_ref: 'paper-mission-transaction:dm003:submission',
      opl_route_command_ref: 'paper-mission-transaction:dm003:submission#opl_route_command',
      command_kind: 'route_back',
      route_target: 'continue paper-facing submission milestone work',
      route_identity_key: 'paper-mission-transaction:dm003:submission::route',
      attempt_idempotency_key: 'dm003:submission:route-back::opl-attempt',
      request_idempotency_key: 'dm003:submission:route-back::opl-request',
      opl_route_handoff_record: {
        handoff_ref:
          '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_consumption_ledger/submission/opl_route_handoff.json',
      },
      stage_run_request: {
        request_status: 'requested',
        requested_by: 'mas_paper_mission_route_handoff',
        route_identity_key: 'paper-mission-transaction:dm003:submission::route',
        attempt_idempotency_key: 'dm003:submission:route-back::opl-attempt',
        stage_run_created: false,
        provider_attempt_requested: false,
      },
    });
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload,
      dedupeKey: 'paper-mission-route:dm003:nonadvancing-routeback',
      source: 'test',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(enqueued.task.task_id) as FamilyRuntimeTaskRow;
    await dispatchFamilyRuntimeTask(db, paths, row, {
      temporalProviderModule: async () => ({
        startTemporalStageAttemptWorkflow: async (attempt) => ({
          surface_kind: 'temporal_stage_attempt_start_receipt',
          provider_kind: 'temporal',
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          first_execution_run_id: 'run-paper-mission-route-nonadvancing-original',
        }),
      }),
    });
    const startedTask = inspectTask(db, enqueued.task.task_id);
    const originalAttempt = startedTask.stage_attempts[0];
    syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: originalAttempt.stage_attempt_id,
      workflow_id: originalAttempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: originalAttempt.stage_attempt_id,
        workflow_id: originalAttempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: originalAttempt.stage_id,
        status: 'completed',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activity_events: [],
        stage_progress_log: {
          surface_kind: 'temporal_workflow_stage_progress_log',
          planned_work: {},
          timeline: [],
          visibility: {},
        },
        checkpoint_refs: [],
        closeout_refs: ['route-back:dm003:submission:needs-executor-delta'],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: 'med-autoscience',
        route_impact: {
          command_kind: 'route_back',
          route_target: 'continue paper-facing submission milestone work',
          route_identity_key: 'paper-mission-transaction:dm003:submission::route',
          paper_mission_transaction_ref: 'paper-mission-transaction:dm003:submission',
          reason: 'route_back_same_transaction_requires_executor_delta',
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
        },
        human_gate_refs: [],
        signals: [],
        closeout_packet: {
          closeout_packet_surface_kind: 'stage_attempt_closeout_packet',
        },
        completion_boundary: {
          provider_completion: 'completed',
          domain_ready_verdict: 'domain_gate_pending',
          provider_completion_is_domain_ready: false,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    });
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked',
        last_error = 'codex_cli_typed_closeout_not_materialized',
        dead_letter_reason = 'codex_cli_typed_closeout_not_materialized',
        updated_at = ?
      WHERE task_id = ?
    `).run(new Date().toISOString(), enqueued.task.task_id);
    db.close();

    try {
      await redriveWithInjectedTemporalProvider(enqueued.task.task_id, {
        reason: 'operator_retry_without_new_owner_delta',
        source: 'test-paper-route-nonadvancing-routeback-redrive',
        firstExecutionRunId: 'run-paper-mission-route-nonadvancing-redriven',
      });
      assert.fail('expected non-advancing route-back redrive to be blocked');
    } catch (error) {
      assert.equal(error instanceof FrameworkContractError, true);
      const details = (error as FrameworkContractError).details as Record<string, unknown>;
      assert.equal(details.reason, 'non_advancing_route_back');
      assert.equal(details.provider_redrive_started, false);
      assert.equal(details.required_owner_delta, 'mas_owned_executor_delta_required');
      assert.equal(details.paper_mission_transaction_ref, 'paper-mission-transaction:dm003:submission');
      assert.equal(details.route_identity_key, 'paper-mission-transaction:dm003:submission::route');
      assert.deepEqual(details.accepted_advancing_delta_shapes, [
        'candidate_hash',
        'owner_answer_ref',
        'typed_blocker_ref',
        'human_gate_ref',
        'paper_facing_delta_ref',
      ]);
      assert.equal(
        (details.authority_boundary as Record<string, unknown>).provider_redrive_started,
        false,
      );
      assert.equal(
        (details.authority_boundary as Record<string, unknown>).domain_progress_claim,
        false,
      );
    }

    const afterDb = openQueueDb().db;
    const after = inspectTask(afterDb, enqueued.task.task_id);
    assert.equal(after.task.status, 'blocked');
    assert.equal(after.task.dead_letter_reason, 'codex_cli_typed_closeout_not_materialized');
    assert.equal(after.stage_attempts.length, 1);
    assert.equal(after.stage_attempts[0].stage_attempt_id, originalAttempt.stage_attempt_id);
    afterDb.close();
  } finally {
    restoreEnv();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

for (const providerRuntimeBlockerReason of [
  'codex_cli_typed_closeout_not_materialized',
  'codex_cli_provider_unavailable',
]) {
test(`family-runtime redrives PaperMission stage-route provider runtime blocker ${providerRuntimeBlockerReason}`, async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-runtime-blocker-redrive-'));
  const restoreEnv = installDirectDispatchEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
  });
  try {
    const { db, paths } = openQueueDb();
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: paperMissionRoutePayloadWithWorkspace({
        study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
        mission_id: 'paper-mission::003-dpcc-primary-care-phenotype-treatment-gap::submission::auto',
        paper_mission_transaction_ref: 'paper-mission-transaction:dm003:submission',
        opl_route_command_ref: 'paper-mission-transaction:dm003:submission#opl_route_command',
        command_kind: 'resume_stage',
        route_target: 'continue paper-facing submission milestone work',
        route_identity_key: 'paper-mission-transaction:dm003:submission::route',
        attempt_idempotency_key: 'dm003:submission:consumed::opl-attempt',
        request_idempotency_key: 'dm003:submission:consumed::opl-request',
        stage_run_request: {
          request_status: 'requested',
          requested_by: 'mas_paper_mission_route_handoff',
          route_identity_key: 'paper-mission-transaction:dm003:submission::route',
          attempt_idempotency_key: 'dm003:submission:consumed::opl-attempt',
          stage_run_created: false,
          provider_attempt_requested: false,
        },
      }),
      dedupeKey: 'paper-mission-route:dm003:codex-closeout-materialization-redrive',
      source: 'test',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(enqueued.task.task_id) as FamilyRuntimeTaskRow;
    await dispatchFamilyRuntimeTask(db, paths, row, {
      temporalProviderModule: async () => ({
        startTemporalStageAttemptWorkflow: async (attempt) => ({
          surface_kind: 'temporal_stage_attempt_start_receipt',
          provider_kind: 'temporal',
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          first_execution_run_id: 'run-paper-mission-route-runtime-blocker-original',
        }),
      }),
    });
    const startedTask = inspectTask(db, enqueued.task.task_id);
    const originalAttempt = startedTask.stage_attempts[0];
    const providerRuntimeBlockerRef =
      `opl://stage-attempts/${originalAttempt.stage_attempt_id}/runtime-blockers/${providerRuntimeBlockerReason}`;
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked',
        last_error = ?,
        dead_letter_reason = ?,
        updated_at = ?
      WHERE task_id = ?
    `).run(
      providerRuntimeBlockerReason,
      providerRuntimeBlockerReason,
      new Date().toISOString(),
      enqueued.task.task_id,
    );
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'blocked',
        blocked_reason = ?,
        closeout_refs_json = ?,
        closeout_receipt_status = NULL,
        provider_run_json = json_set(
          provider_run_json,
          '$.provider_status', 'blocked',
          '$.terminal_observation.reason', ?
        ),
        route_impact_json = json_set(
          route_impact_json,
          '$.runtime_blocker_owner', 'one-person-lab',
          '$.runtime_blocker_is_domain_owner_answer', json('false'),
          '$.provider_completion_is_domain_ready', json('false'),
          '$.runtime_blocker_ref', ?
        ),
        updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      providerRuntimeBlockerReason,
      JSON.stringify([providerRuntimeBlockerRef]),
      providerRuntimeBlockerReason,
      providerRuntimeBlockerRef,
      new Date().toISOString(),
      originalAttempt.stage_attempt_id,
    );
    db.close();

    const blockedTask = runCli(['family-runtime', 'queue', 'inspect', enqueued.task.task_id], familyRuntimeEnv(stateRoot));
    const redrive = await redriveWithInjectedTemporalProvider(enqueued.task.task_id, {
      reason: `${providerRuntimeBlockerReason}_cleared`,
      source: 'test-paper-route-runtime-blocker-redrive',
      firstExecutionRunId: `run-paper-mission-route-runtime-blocker-redriven-${providerRuntimeBlockerReason}`,
    });
    const redrivenDb = openQueueDb().db;
    const afterDispatch = inspectTask(redrivenDb, enqueued.task.task_id);
    const newestAttempt = afterDispatch.stage_attempts.find((attempt) =>
      attempt.stage_attempt_id === redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_id
    )!;
    const blockedAttempt = blockedTask.family_runtime_task.stage_attempts.find((attempt: Record<string, unknown>) =>
      attempt.stage_attempt_id === originalAttempt.stage_attempt_id
    );

    assert.equal(blockedTask.family_runtime_task.task.status, 'blocked');
    assert.equal(blockedAttempt?.blocked_reason, providerRuntimeBlockerReason);
    assert.deepEqual(blockedAttempt?.closeout_refs, [providerRuntimeBlockerRef]);
    assert.equal(redrive.family_runtime_redrive.redriven, true);
    assert.equal(redrive.family_runtime_redrive.task.status, 'running');
    assert.equal(redrive.family_runtime_redrive.provider_redrive_started, true);
    assert.equal(redrive.family_runtime_redrive.provider_redrive_followthrough.status, 'provider_started');
    assert.equal(redrive.family_runtime_redrive.provider_redrive_followthrough.provider_started, true);
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.status, 'running');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.executor_kind, 'codex_cli');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_executor_policy.executor_kind, 'codex_cli');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_executor_policy.model, 'gpt-5.5');
    assert.equal(redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_executor_policy.provider, 'openai');
    assert.equal(
      redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_executor_policy.policy_source,
      'local_codex_default_materialized_at_stage_attempt_creation',
    );
    assert.equal(redrive.family_runtime_redrive.redrive_protocol.protocol, 'provider_transport_only');
    assert.equal(redrive.family_runtime_redrive.redrive_protocol.domain_progress_claim, false);
    assert.equal(redrive.family_runtime_redrive.authority_boundary.domain_truth_mutation, false);
    assert.equal(redrive.family_runtime_redrive.authority_boundary.owner_receipt_created, false);
    assert.equal(redrive.family_runtime_redrive.authority_boundary.typed_blocker_created, false);
    assert.equal(afterDispatch.task.status, 'running');
    assert.equal(newestAttempt.status, 'running');
    assert.equal(newestAttempt.provider_kind, 'temporal');
    assert.notEqual(newestAttempt.stage_attempt_id, originalAttempt.stage_attempt_id);
    assert.equal(
      newestAttempt.stage_attempt_id,
      redrive.family_runtime_redrive.redriven_stage_attempt.stage_attempt_id,
    );
    assert.equal(newestAttempt.workspace_locator.study_id, '003-dpcc-primary-care-phenotype-treatment-gap');
    assert.equal(newestAttempt.workspace_locator.can_claim_paper_progress, false);
    assert.equal(newestAttempt.workspace_locator.opl_writes_domain_truth, false);
    assert.equal(
      afterDispatch.events.some((event) =>
        event.event_type === 'task_operator_redrive_from_terminal_provider_transport'
        && event.payload.previous_stage_attempt_id === originalAttempt.stage_attempt_id
        && event.payload.previous_stage_attempt_blocked_reason === providerRuntimeBlockerReason
        && event.payload.redriven_stage_attempt_id === newestAttempt.stage_attempt_id
        && event.payload.provider_redrive_started === true
        && (event.payload.redrive_protocol as Record<string, unknown>).domain_progress_claim === false
        && (event.payload.authority_boundary as Record<string, unknown>).domain_truth_mutation === false
      ),
      true,
    );
    redrivenDb.close();
  } finally {
    restoreEnv();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
}

test('family-runtime late typed closeout preserves PaperMission route impact and blocks same-lineage provider redrive', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-late-closeout-'));
  const restoreEnv = installDirectDispatchEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
  });
  try {
    const userStageLog = {
      surface_kind: 'opl_user_stage_log',
      semantic_status: 'provided_by_domain',
      semantic_source: 'med_autoscience.paper_mission_stage_route',
      stage_name: 'PaperMission stage route late closeout for DM002',
      progress_delta_classification: 'owner_route_transport',
    };
    const { db, paths } = openQueueDb();
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: paperMissionRoutePayloadWithWorkspace(),
      dedupeKey: 'paper-mission-route:dm002:late-closeout-after-blocker',
      source: 'test',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(enqueued.task.task_id) as FamilyRuntimeTaskRow;
    await dispatchFamilyRuntimeTask(db, paths, row, {
      temporalProviderModule: async () => ({
        startTemporalStageAttemptWorkflow: async (attempt) => ({
          surface_kind: 'temporal_stage_attempt_start_receipt',
          provider_kind: 'temporal',
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          first_execution_run_id: 'run-paper-mission-route-late-closeout',
        }),
      }),
    });
    const startedTask = inspectTask(db, enqueued.task.task_id);
    const attempt = startedTask.stage_attempts[0];

    syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: attempt.stage_id,
        status: 'completed',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activity_events: [],
        stage_progress_log: {
          surface_kind: 'temporal_workflow_stage_progress_log',
          planned_work: {},
          timeline: [],
          visibility: {},
        },
        checkpoint_refs: [],
        closeout_refs: [],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: null,
        route_impact: {},
        human_gate_refs: [],
        signals: [],
        closeout_packet: null,
        completion_boundary: {
          provider_completion: 'completed',
          domain_ready_verdict: null,
          provider_completion_is_domain_ready: false,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    });
    const providerOnlyBlockedTask = inspectTask(db, enqueued.task.task_id);
    assert.equal(providerOnlyBlockedTask.task.status, 'blocked');
    assert.equal(
      providerOnlyBlockedTask.task.last_error,
      'temporal_stage_attempt_completed_missing_typed_closeout',
    );

    syncStageAttemptFromTemporalTerminalObservation(db, {
      surface_kind: 'temporal_stage_attempt_query_receipt',
      provider_kind: 'temporal',
      stage_attempt_id: attempt.stage_attempt_id,
      workflow_id: attempt.workflow_id,
      workflow_status: 'COMPLETED',
      query: {
        surface_kind: 'temporal_stage_attempt_query',
        provider_kind: 'temporal',
        stage_attempt_id: attempt.stage_attempt_id,
        workflow_id: attempt.workflow_id,
        domain_id: 'medautoscience',
        stage_id: attempt.stage_id,
        status: 'completed',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activity_events: [],
        stage_progress_log: {
          surface_kind: 'temporal_workflow_stage_progress_log',
          planned_work: {},
          timeline: [],
          visibility: {},
        },
        checkpoint_refs: [],
        closeout_refs: ['typed-blocker:late-domain-gate'],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: 'med-autoscience',
        route_impact: {
          reason: 'late_closeout_domain_gate_pending',
          command_kind: 'route_back',
          route_target: 'publication_gate_replay',
          route_identity_key: 'paper-mission-transaction:dm002:1::route',
          paper_mission_transaction_ref: 'paper-mission-transaction:dm002:1',
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          user_stage_log: userStageLog,
          observed_failure_class: 'late_typed_closeout_after_provider_blocker',
          mission_artifact_impact: 'dm002_owner_route_not_advanced_without_mas_executor_delta',
          target_artifact_or_owner_path: 'paper_mission_run:002-dm-china-us-mortality-attribution#owner_route',
          recommended_next_action: 'MAS-owned executor must consume the OPL transition receipt and emit an advancing owner delta before OPL provider redrive',
        },
        human_gate_refs: [],
        signals: [],
        closeout_packet: {
          closeout_packet_surface_kind: 'stage_attempt_closeout_packet',
        },
        completion_boundary: {
          provider_completion: 'completed',
          domain_ready_verdict: 'domain_gate_pending',
          provider_completion_is_domain_ready: false,
        },
        authority_boundary: {
          opl: 'temporal_workflow_transport_and_control_metadata_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
    });

    const terminalTask = inspectTask(db, enqueued.task.task_id);
    assert.equal(terminalTask.task.status, 'blocked');
    assert.equal(terminalTask.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(terminalTask.task.dead_letter_reason, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(terminalTask.stage_attempts[0].status, 'completed');
    assert.equal(terminalTask.stage_attempts[0].closeout_receipt_status, 'accepted_typed_closeout');
    assert.deepEqual(terminalTask.stage_attempts[0].closeout_refs, ['typed-blocker:late-domain-gate']);
    const terminalReconcileEvent = terminalTask.events.filter((event) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
      ).at(-1);
    assert.equal(terminalReconcileEvent?.payload.reason, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(terminalReconcileEvent?.payload.opl_transition_receipt.role, 'transport_receipt_only');
    assert.equal(terminalReconcileEvent?.payload.opl_transition_receipt.receipt_status, 'terminal_closeout_observed');
    assert.equal(
      terminalReconcileEvent?.payload.opl_transition_receipt.route_impact.user_stage_log.semantic_status,
      'provided_by_domain',
    );
    assert.equal(
      terminalReconcileEvent?.payload.opl_transition_receipt.route_impact.user_stage_log.semantic_source,
      'med_autoscience.paper_mission_stage_route',
    );
    assert.equal(
      terminalReconcileEvent?.payload.opl_transition_receipt.route_impact.user_stage_log.progress_delta_classification,
      'owner_route_transport',
    );
    assert.equal(
      terminalReconcileEvent?.payload.opl_transition_receipt.route_impact.observed_failure_class,
      'late_typed_closeout_after_provider_blocker',
    );
    assert.equal(
      terminalReconcileEvent?.payload.opl_transition_receipt.mas_impact_receipt.observed_failure_class,
      'late_typed_closeout_after_provider_blocker',
    );
    assert.equal(
      terminalReconcileEvent?.payload.opl_transition_receipt.mas_impact_receipt.mission_artifact_impact,
      'dm002_owner_route_not_advanced_without_mas_executor_delta',
    );
    assert.equal(
      terminalReconcileEvent?.payload.opl_transition_receipt.mas_impact_receipt.recommended_next_action,
      'MAS-owned executor must consume the OPL transition receipt and emit an advancing owner delta before OPL provider redrive',
    );
    assert.equal(
      terminalReconcileEvent?.payload.opl_transition_receipt.authority_boundary.writes_owner_receipt,
      false,
    );
    assert.equal(
      terminalReconcileEvent?.payload.opl_transition_receipt.authority_boundary.can_claim_paper_progress,
      false,
    );
    assert.deepEqual(
      terminalReconcileEvent?.payload.mas_impact_receipt,
      terminalReconcileEvent?.payload.opl_transition_receipt.mas_impact_receipt,
    );
    db.close();

    try {
      await redriveWithInjectedTemporalProvider(enqueued.task.task_id, {
        reason: 'operator_retry_after_late_closeout_without_mas_executor_delta',
        source: 'test-paper-route-late-closeout-redrive',
        firstExecutionRunId: 'run-paper-mission-route-late-closeout-redrive',
      });
      assert.fail('expected late closeout same-lineage redrive to require MAS-owned executor delta');
    } catch (error) {
      assert.equal(error instanceof FrameworkContractError, true);
      const details = (error as FrameworkContractError).details as Record<string, unknown>;
      assert.equal(details.reason, 'non_advancing_route_back');
      assert.equal(details.required_owner_delta, 'mas_owned_executor_delta_required');
      assert.equal(details.provider_redrive_started, false);
      assert.equal(details.paper_mission_transaction_ref, 'paper-mission-transaction:dm002:1');
      assert.equal(details.route_identity_key, 'paper-mission-transaction:dm002:1::route');
    }

    const afterDb = openQueueDb().db;
    const after = inspectTask(afterDb, enqueued.task.task_id);
    assert.equal(after.stage_attempts.length, 1);
    assert.equal(after.stage_attempts[0].stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(after.task.status, 'blocked');
    assert.equal(after.task.dead_letter_reason, 'paper_mission_stage_route_domain_gate_pending');
    afterDb.close();
  } finally {
    restoreEnv();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
