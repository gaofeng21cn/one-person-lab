import {
  assert,
  buildTemporalStageAttemptWorkflowInput,
  dispatchFamilyRuntimeTask,
  enqueueTask,
  familyRuntimeEnv,
  fs,
  inspectTask,
  installDirectDispatchEnv,
  openQueueDb,
  os,
  paperMissionRoutePayload,
  paperMissionRoutePayloadWithWorkspace,
  path,
  requireTemporalStageAttemptWorkflowInputLaunchable,
  runCli,
  type StageRouteDispatchReadback,
  test,
  type FamilyRuntimeTaskRow,
} from './family-runtime-paper-mission-stage-route-helpers.ts';

test('family-runtime requeues fresh MAS PaperMission handoff after domain gate terminal closeout', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-fresh-handoff-'));
  const originalStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const { db } = openQueueDb();
    const dedupeKey = 'paper-mission-route:dm002:fresh-handoff-after-domain-gate';
    const firstHandoffRef =
      '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_consumption_ledger/old/opl_route_handoff.json';
    const freshHandoffRef =
      '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_consumption_ledger/fresh/opl_route_handoff.json';
    const firstPayload = paperMissionRoutePayloadWithWorkspace({
      candidate_ref: '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_candidate_package/old/package_manifest.json',
      paper_mission_transaction_ref: 'paper-mission-transaction:dm002:old',
      opl_route_command_ref: 'paper-mission-transaction:dm002:old#opl_route_command',
      opl_route_handoff_record: {
        handoff_ref: firstHandoffRef,
      },
    });
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: firstPayload,
      dedupeKey,
      source: 'test',
    });
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked',
        last_error = 'paper_mission_stage_route_domain_gate_pending',
        dead_letter_reason = 'paper_mission_stage_route_domain_gate_pending'
      WHERE task_id = ?
    `).run(enqueued.task.task_id);

    const freshPayload = paperMissionRoutePayloadWithWorkspace({
      candidate_ref: '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_candidate_package/fresh/package_manifest.json',
      paper_mission_transaction_ref: 'paper-mission-transaction:dm002:fresh',
      opl_route_command_ref: 'paper-mission-transaction:dm002:fresh#opl_route_command',
      opl_route_handoff_record: {
        handoff_ref: freshHandoffRef,
      },
    });
    const requeued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: freshPayload,
      dedupeKey,
      source: 'test-fresh-handoff',
    });
    const task = inspectTask(db, enqueued.task.task_id);
    const event = task.events.find((entry) =>
      entry.event_type === 'task_requeued_from_paper_mission_stage_route_domain_gate_fresh_handoff'
    );

    assert.equal(requeued.accepted, true);
    assert.equal(requeued.requeued_from_terminal, true);
    assert.equal(requeued.idempotent_noop, false);
    assert.equal(task.task.status, 'queued');
    assert.equal(task.task.dead_letter_reason, null);
    assert.equal(task.task.last_error, null);
    assert.equal(task.task.payload.candidate_ref, freshPayload.candidate_ref);
    assert.equal(task.task.payload.paper_mission_transaction_ref, freshPayload.paper_mission_transaction_ref);
    assert.notEqual(event, undefined);
    assert.equal(event?.payload.reason, 'paper_mission_stage_route_domain_gate_fresh_handoff');
    assert.equal(event?.payload.previous_candidate_ref, firstPayload.candidate_ref);
    assert.equal(event?.payload.next_candidate_ref, freshPayload.candidate_ref);
    assert.equal(event?.payload.previous_opl_route_handoff_ref, firstHandoffRef);
    assert.equal(event?.payload.next_opl_route_handoff_ref, freshHandoffRef);
    assert.equal(event?.payload.authority_boundary.domain_truth_mutation, false);
    assert.equal(event?.payload.authority_boundary.provider_completion_is_domain_ready, false);
    db.close();
  } finally {
    process.env.OPL_STATE_DIR = originalStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime requeues fresh MAS PaperMission handoff after recoverable provider runtime blocker', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-provider-recovered-'));
  const originalStateDir = process.env.OPL_STATE_DIR;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const { db } = openQueueDb();
    const dedupeKey = 'paper-mission-route:dm003:fresh-handoff-after-provider-recovered';
    const firstHandoffRef =
      '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_consumption_ledger/provider-old/opl_route_handoff.json';
    const freshHandoffRef =
      '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_consumption_ledger/provider-fresh/opl_route_handoff.json';
    const firstPayload = paperMissionRoutePayloadWithWorkspace({
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      mission_id: 'paper-mission::003-dpcc-primary-care-phenotype-treatment-gap::submission::auto',
      candidate_ref:
        '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_candidate_package/provider-old/package_manifest.json',
      paper_mission_transaction_ref: 'paper-mission-transaction:dm003:provider-old',
      opl_route_command_ref: 'paper-mission-transaction:dm003:provider-old#opl_route_command',
      command_kind: 'resume_stage',
      route_target: 'continue paper-facing submission milestone work',
      route_identity_key: 'paper-mission-transaction:dm003:provider::route',
      attempt_idempotency_key: 'dm003:provider-recovered::opl-attempt',
      request_idempotency_key: 'dm003:provider-recovered::opl-request',
      opl_route_handoff_record: {
        handoff_ref: firstHandoffRef,
      },
    });
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: firstPayload,
      dedupeKey,
      source: 'test-provider-runtime-blocker',
    });
    const providerRuntimeBlockerReason = 'closeout_not_materialized';
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked',
        last_error = ?,
        dead_letter_reason = ?
      WHERE task_id = ?
    `).run(
      providerRuntimeBlockerReason,
      providerRuntimeBlockerReason,
      enqueued.task.task_id,
    );

    const freshPayload = paperMissionRoutePayloadWithWorkspace({
      study_id: '003-dpcc-primary-care-phenotype-treatment-gap',
      mission_id: 'paper-mission::003-dpcc-primary-care-phenotype-treatment-gap::submission::auto',
      candidate_ref:
        '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_candidate_package/provider-fresh/package_manifest.json',
      paper_mission_transaction_ref: 'paper-mission-transaction:dm003:provider-fresh',
      opl_route_command_ref: 'paper-mission-transaction:dm003:provider-fresh#opl_route_command',
      command_kind: 'resume_stage',
      route_target: 'continue paper-facing submission milestone work',
      route_identity_key: 'paper-mission-transaction:dm003:provider::route',
      attempt_idempotency_key: 'dm003:provider-recovered::opl-attempt',
      request_idempotency_key: 'dm003:provider-recovered::opl-request',
      opl_route_handoff_record: {
        handoff_ref: freshHandoffRef,
      },
    });
    const requeued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: freshPayload,
      dedupeKey,
      source: 'test-provider-recovered-fresh-handoff',
    });
    const task = inspectTask(db, enqueued.task.task_id);
    const event = task.events.find((entry) =>
      entry.event_type === 'task_requeued_from_paper_mission_stage_route_provider_runtime_fresh_handoff'
    );

    assert.equal(requeued.accepted, true);
    assert.equal(requeued.requeued_from_terminal, true);
    assert.equal(requeued.idempotent_noop, false);
    assert.equal(task.task.status, 'queued');
    assert.equal(task.task.dead_letter_reason, null);
    assert.equal(task.task.last_error, null);
    assert.equal(task.task.payload.candidate_ref, freshPayload.candidate_ref);
    assert.equal(task.task.payload.paper_mission_transaction_ref, freshPayload.paper_mission_transaction_ref);
    assert.notEqual(event, undefined);
    assert.equal(event?.payload.reason, 'paper_mission_stage_route_provider_runtime_fresh_handoff');
    assert.equal(event?.payload.previous_provider_runtime_reason, providerRuntimeBlockerReason);
    assert.equal(event?.payload.previous_candidate_ref, firstPayload.candidate_ref);
    assert.equal(event?.payload.next_candidate_ref, freshPayload.candidate_ref);
    assert.equal(event?.payload.previous_opl_route_handoff_ref, firstHandoffRef);
    assert.equal(event?.payload.next_opl_route_handoff_ref, freshHandoffRef);
    assert.equal(event?.payload.authority_boundary.domain_truth_mutation, false);
    assert.equal(event?.payload.authority_boundary.provider_stage_attempt_started, false);
    assert.equal(event?.payload.authority_boundary.can_claim_paper_progress, false);
    db.close();
  } finally {
    process.env.OPL_STATE_DIR = originalStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime requeues fresh MAS PaperMission handoff after legacy route identity blocker', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-fresh-identity-'));
  const originalStateDir = process.env.OPL_STATE_DIR;
  const dedupeKey = 'paper-mission-route:dm002:fresh-handoff-after-legacy-identity-blocker';
  const firstHandoffRef =
    '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_consumption_ledger/identity-old/opl_route_handoff.json';
  const freshHandoffRef =
    '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_consumption_ledger/identity-fresh/opl_route_handoff.json';
  let taskId = '';
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const { db } = openQueueDb();
    const firstPayload = paperMissionRoutePayloadWithWorkspace({
      route_identity_key: undefined,
      attempt_idempotency_key: 'dm002:gate-clearing:legacy-blocked::opl-attempt',
      request_idempotency_key: 'dm002:gate-clearing:legacy-blocked::opl-request',
      stage_run_request: {
        request_status: 'requested',
        requested_by: 'mas_paper_mission_route_handoff',
        stage_run_created: false,
        provider_attempt_requested: false,
      },
      candidate_ref:
        '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_candidate_package/identity-old/package_manifest.json',
      paper_mission_transaction_ref: 'paper-mission-transaction:dm002:identity-old',
      opl_route_command_ref: 'paper-mission-transaction:dm002:identity-old#opl_route_command',
      opl_route_handoff_record: {
        handoff_ref: firstHandoffRef,
      },
    });
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: firstPayload,
      dedupeKey,
      source: 'test-legacy-identity-blocker',
    });
    taskId = enqueued.task.task_id;
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked',
        last_error = 'paper_mission_route_missing_identity_field:route_identity_key',
        dead_letter_reason = 'paper_mission_route_missing_identity_field:route_identity_key'
      WHERE task_id = ?
    `).run(taskId);

    const freshPayload = paperMissionRoutePayloadWithWorkspace({
      route_identity_key: undefined,
      attempt_idempotency_key: undefined,
      request_idempotency_key: undefined,
      stage_run_request: {
        request_status: 'requested',
        requested_by: 'mas_paper_mission_route_handoff',
        stage_run_created: false,
        provider_attempt_requested: false,
      },
      candidate_ref:
        '/tmp/mas-dm-cvd-workspace/ops/medautoscience/paper_mission_candidate_package/identity-fresh/package_manifest.json',
      paper_mission_transaction_ref: 'paper-mission-transaction:dm002:identity-fresh',
      opl_route_command_ref: 'paper-mission-transaction:dm002:identity-fresh#opl_route_command',
      opl_route_handoff_record: {
        handoff_ref: freshHandoffRef,
        opl_runtime_carrier: {
          command_kind: 'start_next_stage',
          route_target: 'publication_gate_replay',
          route_identity_key: 'paper-mission-transaction:dm002:identity-fresh::route',
          attempt_idempotency_key: 'dm002:gate-clearing:identity-fresh::opl-attempt',
          request_idempotency_key: 'dm002:gate-clearing:identity-fresh::opl-request',
        },
      },
    });
    const requeued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: freshPayload,
      dedupeKey,
      source: 'test-fresh-identity-handoff',
    });
    const task = inspectTask(db, taskId);
    const event = task.events.find((entry) =>
      entry.event_type === 'task_requeued_from_paper_mission_stage_route_identity_validator_fresh_handoff'
    );

    assert.equal(requeued.accepted, true);
    assert.equal(requeued.requeued_from_terminal, true);
    assert.equal(requeued.idempotent_noop, false);
    assert.equal(task.task.status, 'queued');
    assert.equal(task.task.dead_letter_reason, null);
    assert.equal(task.task.last_error, null);
    assert.equal(task.task.payload.candidate_ref, freshPayload.candidate_ref);
    assert.equal(task.task.payload.paper_mission_transaction_ref, freshPayload.paper_mission_transaction_ref);
    assert.notEqual(event, undefined);
    assert.equal(event?.payload.reason, 'paper_mission_stage_route_identity_validator_fresh_handoff');
    assert.equal(
      event?.payload.previous_identity_blocker_reason,
      'paper_mission_route_missing_identity_field:route_identity_key',
    );
    assert.equal(event?.payload.next_route_identity_key, 'paper-mission-transaction:dm002:identity-fresh::route');
    assert.equal(event?.payload.next_attempt_idempotency_key, 'dm002:gate-clearing:identity-fresh::opl-attempt');
    assert.equal(event?.payload.previous_opl_route_handoff_ref, firstHandoffRef);
    assert.equal(event?.payload.next_opl_route_handoff_ref, freshHandoffRef);
    assert.equal(event?.payload.authority_boundary.domain_truth_mutation, false);
    assert.equal(event?.payload.authority_boundary.provider_completion_is_domain_ready, false);
    db.close();

    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-fresh-identity-redrive'], env);
    const inspected = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = inspected.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'running');
    assert.equal(inspected.family_runtime_task.task.status, 'running');
    assert.equal(inspected.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(inspected.family_runtime_task.stage_attempts.length, 1);
    assert.equal(attempt.workspace_locator.route_identity_key, 'paper-mission-transaction:dm002:identity-fresh::route');
    assert.equal(
      attempt.workspace_locator.attempt_idempotency_key,
      'dm002:gate-clearing:identity-fresh::opl-attempt',
    );
    assert.equal(attempt.workspace_locator.can_claim_paper_progress, false);
  } finally {
    process.env.OPL_STATE_DIR = originalStateDir;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick does not promote MAS PaperMission stage-route domain-ready verdicts into OPL success', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-domain-ready-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
    });
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_mission/stage-route',
      '--payload',
      JSON.stringify(paperMissionRoutePayload()),
      '--dedupe-key',
      'paper-mission-route:dm002:terminal-domain-ready',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-domain-ready-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002-domain-ready',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:provider-domain-ready-transport-only'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_ready',
        route_impact: {
          decision: 'domain_owner_review_required',
          next_owner: 'med-autoscience',
          reason: 'provider_completion_not_mas_authority',
        },
      }),
    ], env);
    const immediateTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const reconcile = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-domain-ready-terminal'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const reconcileEvent = task.family_runtime_task.events.find((event: { event_type: string }) =>
      event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
    );

    assert.equal(immediateTask.family_runtime_task.task.status, 'blocked');
    assert.equal(
      immediateTask.family_runtime_task.task.last_error,
      'paper_mission_stage_route_domain_authority_required',
    );
    assert.equal(reconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 0);
    assert.deepEqual(reconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, []);
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_authority_required');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'paper_mission_stage_route_domain_authority_required');
    assert.equal(task.family_runtime_task.stage_attempts[0].status, 'completed');
    assert.equal(task.family_runtime_task.stage_attempts[0].closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(task.family_runtime_task.stage_attempts[0].route_impact.domain_ready_verdict, 'domain_ready');
    assert.notEqual(reconcileEvent, undefined);
    assert.equal(reconcileEvent.payload.next_status, 'blocked');
    assert.equal(
      reconcileEvent.payload.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(
      reconcileEvent.payload.authority_boundary.can_claim_paper_progress,
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime dispatch starts MAS PaperMission stage-route Temporal attempts in the same tick', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-temporal-'));
  const restoreEnv = installDirectDispatchEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
  });
  try {
    const { db, paths } = openQueueDb();
    const userStageLog = {
      surface_kind: 'opl_user_stage_log',
      semantic_status: 'provided_by_domain',
      semantic_source: 'med_autoscience.paper_mission_stage_route',
      stage_name: 'PaperMission stage route for DM002',
      problem_summary: 'MAS routed a submission milestone candidate through OPL.',
      stage_goal: 'Carry the route command without claiming MAS paper authority.',
      progress_delta_classification: 'deliverable_progress',
      deliverable_progress_delta: {
        delta_count: 1,
        delta_refs: ['ops/medautoscience/paper_mission_candidate_package/dm002/candidate.json'],
      },
      platform_repair_delta: {
        delta_count: 0,
        delta_refs: [],
      },
      next_forced_delta: 'domain_owner_answer_or_human_gate_or_non_synonymous_paper_delta',
      stage_work_done: ['materialized start_next_stage request'],
      changed_stage_surfaces: ['ops/medautoscience/paper_mission_candidate_package/dm002/candidate.json'],
      outcome: 'domain_gate_pending',
      remaining_blockers: ['paper_mission_stage_route_domain_gate_pending'],
      evidence_refs: ['paper-mission-transaction:dm002:1'],
    };
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: paperMissionRoutePayloadWithWorkspace({
        route_impact: {
          decision: 'start_next_stage',
          domain_ready_verdict: 'domain_gate_pending',
          user_stage_log: userStageLog,
        },
      }),
      dedupeKey: 'paper-mission-route:dm002:temporal-start',
      source: 'test',
    });
    let observedWorkspaceRoot: unknown = null;
    let observedCommandCwd: unknown = null;
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(enqueued.task.task_id) as FamilyRuntimeTaskRow;
    const started = await dispatchFamilyRuntimeTask(db, paths, row, {
      temporalProviderModule: async () => ({
        startTemporalStageAttemptWorkflow: async (attempt) => {
          observedWorkspaceRoot = attempt.workspace_locator.workspace_root;
          observedCommandCwd = attempt.workspace_locator.command_cwd;
          return {
            surface_kind: 'temporal_stage_attempt_start_receipt',
            provider_kind: 'temporal',
            stage_attempt_id: attempt.stage_attempt_id,
            workflow_id: attempt.workflow_id,
            first_execution_run_id: 'run-paper-mission-route',
          };
        },
      }),
    }) as unknown as StageRouteDispatchReadback;
    const task = inspectTask(db, enqueued.task.task_id);

    assert.equal(started.status, 'running');
    assert.equal(started.reason, 'paper_mission_stage_route_temporal_started');
    assert.equal(started.stage_run_request.provider_attempt_requested, true);
    assert.equal(started.stage_run_request.provider_running, true);
    assert.equal(started.authority_boundary.can_claim_provider_running, true);
    assert.equal(started.authority_boundary.can_claim_paper_progress, false);
    assert.equal(observedWorkspaceRoot, '/tmp/mas-dm-cvd-workspace');
    assert.equal(observedCommandCwd, '/tmp/mas-dm-cvd-workspace');
    assert.equal(task.stage_attempts[0].provider_kind, 'temporal');
    assert.equal(task.stage_attempts[0].status, 'running');
    assert.equal(task.stage_attempts[0].workspace_locator.workspace_root, '/tmp/mas-dm-cvd-workspace');
    assert.equal(task.stage_attempts[0].workspace_locator.command_cwd, '/tmp/mas-dm-cvd-workspace');
    assert.equal(task.stage_attempts[0].workspace_locator.command_source, 'workspace_binding');
    assert.equal(task.stage_attempts[0].route_impact.decision, 'start_next_stage');
    const attemptRouteImpact = task.stage_attempts[0].route_impact as {
      user_stage_log?: { semantic_status?: string };
    };
    assert.equal(
      attemptRouteImpact.user_stage_log?.semantic_status,
      'provided_by_domain',
    );
    const queriedAttempt = runCli([
      'family-runtime',
      'attempt',
      'query',
      task.stage_attempts[0].stage_attempt_id,
      '--json',
    ], familyRuntimeEnv(stateRoot));
    const stageProgressLog =
      queriedAttempt.family_runtime_stage_attempt_query.stage_attempt_query.stage_progress_log;
    assert.equal(
      stageProgressLog.user_stage_log.semantic_status,
      'provided_by_domain',
    );
    assert.equal(
      stageProgressLog.user_stage_log.semantic_source,
      'route_impact',
    );
    assert.equal(
      stageProgressLog.user_stage_log.progress_delta_classification,
      'deliverable_progress',
    );
    const launchableInput = requireTemporalStageAttemptWorkflowInputLaunchable(
      buildTemporalStageAttemptWorkflowInput(task.stage_attempts[0]),
    );
    const launchableRouteImpact = launchableInput.route_impact as {
      user_stage_log?: { semantic_status?: string };
      domain_ready_verdict?: string;
    };
    assert.equal(launchableInput.workspace_locator.workspace_root, '/tmp/mas-dm-cvd-workspace');
    assert.equal(launchableRouteImpact.user_stage_log?.semantic_status, 'provided_by_domain');
    assert.equal(launchableRouteImpact.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(task.stage_attempts[0].attempt_count, 1);
    assert.equal(task.stage_attempts[0].provider_run.provider_status, 'running');
    assert.equal(task.events.some((event) => event.event_type === 'paper_mission_stage_route_temporal_started'), true);
    db.close();
  } finally {
    restoreEnv();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime dispatch blocks MAS PaperMission stage-route when Temporal start fails', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-temporal-block-'));
  const restoreEnv = installDirectDispatchEnv(stateRoot, {
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_TEMPORAL_ADDRESS: '',
  });
  try {
    const { db, paths } = openQueueDb();
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: paperMissionRoutePayload(),
      dedupeKey: 'paper-mission-route:dm002:temporal-start-blocked',
      source: 'test',
    });
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(enqueued.task.task_id) as FamilyRuntimeTaskRow;
    const blocked = await dispatchFamilyRuntimeTask(db, paths, row, {
      temporalProviderModule: async () => ({
        startTemporalStageAttemptWorkflow: async () => {
          throw new Error('Temporal address is required for paper mission route start.');
        },
      }),
    }) as unknown as StageRouteDispatchReadback;
    const task = inspectTask(db, enqueued.task.task_id);

    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.reason, 'paper_mission_stage_route_temporal_start_failed');
    assert.equal(blocked.blocker_reason, 'Temporal address is required for paper mission route start.');
    assert.equal(blocked.stage_run_request.stage_run_created, true);
    assert.equal(blocked.stage_run_request.provider_attempt_requested, false);
    assert.equal(blocked.authority_boundary.can_claim_provider_running, false);
    assert.equal(blocked.authority_boundary.can_claim_paper_progress, false);
    assert.equal(task.task.status, 'blocked');
    assert.equal(task.stage_attempts[0].provider_kind, 'temporal');
    assert.equal(task.stage_attempts[0].status, 'blocked');
    assert.equal(task.stage_attempts[0].blocked_reason, 'Temporal address is required for paper mission route start.');
    assert.equal(task.events.some((event) => event.event_type === 'paper_mission_stage_route_temporal_start_blocked'), true);
    db.close();
  } finally {
    restoreEnv();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
