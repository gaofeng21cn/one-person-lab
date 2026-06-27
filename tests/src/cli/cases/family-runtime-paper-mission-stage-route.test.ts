import './family-runtime-paper-mission-stage-route-terminal-cases.ts';
import './family-runtime-paper-mission-stage-route-provider-redrive-cases.ts';
import './family-runtime-paper-mission-stage-route-requeue-dispatch-cases.ts';
import {
  assert,
  buildTemporalStageAttemptWorkflowInput,
  familyRuntimeEnv,
  fs,
  os,
  paperMissionRoutePayload,
  paperMissionRoutePayloadWithCarrierIdentityOnly,
  path,
  runCli,
  test,
  writeCodexDefaultConfig,
  writeDispatchTrap,
} from './family-runtime-paper-mission-stage-route-helpers.ts';

test('family-runtime tick admits MAS PaperMission stage-route into OPL StageAttempt without domain dispatch', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-state-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-fixture-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch-trap');
  const dispatchProofPath = path.join(fixtureRoot, 'dispatch-ran');
  writeDispatchTrap(dispatchPath, dispatchProofPath);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
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
      'paper-mission-route:002-dm-china-us-mortality-attribution:paper-mission-transaction:dm002:1:start_next_stage',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-paper-route'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const runningQueue = runCli([
      'family-runtime',
      'queue',
      'list',
      '--domain',
      'medautoscience',
      '--study',
      '002-dm-china-us-mortality-attribution',
      '--task-kind',
      'paper_mission/stage-route',
      '--status',
      'running',
    ], env);
    const attempts = runCli(['family-runtime', 'attempt', 'list'], env);
    const dispatch = tick.family_runtime_tick.dispatches[0];
    const attempt = task.family_runtime_task.stage_attempts[0];
    const liveness = runningQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness;

    assert.equal(dispatch.status, 'running');
    assert.equal(dispatch.reason, 'paper_mission_stage_route_admitted_stage_run_start_pending');
    assert.equal(dispatch.stage_run_request.stage_run_created, true);
    assert.equal(dispatch.stage_run_request.provider_attempt_requested, false);
    assert.equal(dispatch.stage_run_request.provider_running, false);
    assert.equal(dispatch.authority_boundary.can_claim_provider_running, false);
    assert.equal(dispatch.authority_boundary.can_claim_paper_progress, false);
    assert.equal(task.family_runtime_task.task.status, 'running');
    assert.equal(task.family_runtime_task.task.last_error, 'paper_mission_stage_route_admitted_stage_run_start_pending');
    assert.equal(task.family_runtime_task.stage_attempts.length, 1);
    assert.equal(attempt.stage_id, 'publication_gate_replay');
    assert.equal(attempt.provider_kind, 'local_sqlite');
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.equal(attempt.stage_attempt_executor_policy.executor_kind, 'codex_cli');
    assert.equal(attempt.stage_attempt_executor_policy.model, 'gpt-5.5');
    assert.equal(attempt.stage_attempt_executor_policy.provider, 'openai');
    assert.equal(attempt.stage_attempt_executor_policy.reasoning_effort, 'high');
    assert.equal(attempt.stage_attempt_executor_policy.inherited_local_codex_default, true);
    assert.equal(attempt.status, 'queued');
    assert.equal(attempt.workspace_locator.runtime_request_kind, 'mas_paper_mission_stage_route');
    assert.equal(attempt.workspace_locator.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(attempt.workspace_locator.paper_mission_transaction_ref, 'paper-mission-transaction:dm002:1');
    assert.equal(attempt.workspace_locator.opl_route_command_ref, 'paper-mission-transaction:dm002:1#opl_route_command');
    assert.equal(attempt.workspace_locator.command_kind, 'start_next_stage');
    assert.equal(attempt.workspace_locator.route_target, 'publication_gate_replay');
    assert.equal(attempt.workspace_locator.route_identity_key, 'paper-mission-transaction:dm002:1::route');
    assert.equal(
      attempt.workspace_locator.attempt_idempotency_key,
      'dm002:gate-clearing:accepted-candidate::opl-attempt',
    );
    assert.equal(
      attempt.workspace_locator.request_idempotency_key,
      'dm002:gate-clearing:accepted-candidate::opl-request',
    );
    assert.equal(attempt.workspace_locator.can_claim_provider_running, false);
    assert.equal(attempt.workspace_locator.can_claim_paper_progress, false);
    assert.equal(attempt.checkpoint_refs.includes('paper-mission-transaction:dm002:1'), true);
    assert.equal(liveness.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(liveness.workspace_locator.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(liveness.route_command.opl_route_command_ref, 'paper-mission-transaction:dm002:1#opl_route_command');
    assert.equal(liveness.route_command.route_identity_key, 'paper-mission-transaction:dm002:1::route');
    assert.equal(
      liveness.route_command.attempt_idempotency_key,
      'dm002:gate-clearing:accepted-candidate::opl-attempt',
    );
    assert.equal(
      liveness.route_command.request_idempotency_key,
      'dm002:gate-clearing:accepted-candidate::opl-request',
    );
    assert.equal(liveness.route_command.workspace_root, null);
    assert.deepEqual(liveness.closeout_refs, []);
    assert.equal(liveness.stage_progress_log.surface_kind, 'opl_queue_task_linked_stage_attempt_progress_readback');
    assert.equal(liveness.stage_progress_log.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(attempts.family_runtime_stage_attempts.summary.total, 1);
    assert.equal(fs.existsSync(dispatchProofPath), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick materializes MAS PaperMission stage-route Codex executor policy from local defaults', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-policy-state-'));
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-policy-codex-'));
  try {
    writeCodexDefaultConfig(codexHome);
    const env = familyRuntimeEnv(stateRoot, {
      CODEX_HOME: codexHome,
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
      'paper-mission-route:dm002:policy-materialized',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-policy'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];
    const workflowInput = buildTemporalStageAttemptWorkflowInput(attempt);

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'running');
    assert.equal(attempt.status, 'queued');
    assert.equal(attempt.stage_attempt_executor_policy.executor_kind, 'codex_cli');
    assert.equal(attempt.stage_attempt_executor_policy.model, 'gpt-5.5');
    assert.equal(attempt.stage_attempt_executor_policy.provider, 'openai');
    assert.equal(attempt.stage_attempt_executor_policy.reasoning_effort, 'high');
    assert.equal(
      attempt.stage_attempt_executor_policy.policy_source,
      'local_codex_default_materialized_at_stage_attempt_creation',
    );
    assert.equal(attempt.stage_attempt_executor_policy.local_codex_config_ref, path.join(codexHome, 'config.toml'));
    assert.equal(workflowInput.stage_attempt_executor_policy?.provider, 'openai');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
});

test('family-runtime tick blocks MAS PaperMission stage-route when Codex executor policy cannot be materialized', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-policy-blocked-'));
  const codexHome = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-empty-codex-'));
  try {
    const env = familyRuntimeEnv(stateRoot, {
      CODEX_HOME: codexHome,
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
      'paper-mission-route:dm002:policy-missing',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-policy-missing'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(tick.family_runtime_tick.dispatches[0].reason, 'codex_cli_executor_policy_missing');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'codex_cli_executor_policy_missing');
    assert.equal(attempt.status, 'blocked');
    assert.equal(attempt.blocked_reason, 'codex_cli_executor_policy_missing');
    assert.equal(attempt.stage_attempt_executor_policy, null);
    assert.deepEqual(attempt.closeout_refs, [
      `opl://stage-attempts/${attempt.stage_attempt_id}/runtime-blockers/codex_cli_executor_policy_missing`,
    ]);
    assert.equal(attempt.route_impact.provider_blocker_reason, 'codex_cli_executor_policy_missing');
    assert.equal(attempt.route_impact.runtime_blocker_is_domain_owner_answer, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(codexHome, { recursive: true, force: true });
  }
});

test('family-runtime tick admits MAS PaperMission stage-route with identity from nested OPL carrier', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-nested-identity-'));
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
      JSON.stringify(paperMissionRoutePayloadWithCarrierIdentityOnly()),
      '--dedupe-key',
      'paper-mission-route:dm002:nested-route-identity',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-nested-identity'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'running');
    assert.equal(task.family_runtime_task.task.status, 'running');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(attempt.workspace_locator.route_identity_key, 'paper-mission-transaction:dm002:1::route');
    assert.equal(
      attempt.workspace_locator.attempt_idempotency_key,
      'dm002:gate-clearing:accepted-candidate::opl-attempt',
    );
    assert.equal(
      attempt.workspace_locator.request_idempotency_key,
      'dm002:gate-clearing:accepted-candidate::opl-request',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick blocks MAS PaperMission stage-route that claims MAS authority writes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-blocked-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_mission/stage-route',
      '--payload',
      JSON.stringify(paperMissionRoutePayload({
        authority_boundary: {
          writes_owner_receipt: true,
        },
      })),
      '--dedupe-key',
      'paper-mission-route:dm002:forbidden-authority',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-paper-route'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(
      tick.family_runtime_tick.dispatches[0].reason,
      'paper_mission_route_forbidden_authority_flag:writes_owner_receipt',
    );
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.stage_attempts.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick blocks MAS PaperMission stage-route without route identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-identity-blocked-'));
  try {
    const env = familyRuntimeEnv(stateRoot);
    const enqueue = runCli([
      'family-runtime',
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'paper_mission/stage-route',
      '--payload',
      JSON.stringify(paperMissionRoutePayload({
        route_identity_key: '',
        stage_run_request: {
          request_status: 'requested',
          requested_by: 'mas_paper_mission_route_handoff',
          stage_run_created: false,
          provider_attempt_requested: false,
        },
      })),
      '--dedupe-key',
      'paper-mission-route:dm002:missing-route-identity',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-missing-identity'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'blocked');
    assert.equal(
      tick.family_runtime_tick.dispatches[0].reason,
      'paper_mission_route_missing_identity_field:route_identity_key',
    );
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'paper_mission_route_missing_identity_field:route_identity_key');
    assert.equal(task.family_runtime_task.stage_attempts.length, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick materializes MAS PaperMission stage-route provider preflight blockers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-provider-block-'));
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-provider-block-fixture-'));
  const dispatchPath = path.join(fixtureRoot, 'dispatch-trap');
  const dispatchProofPath = path.join(fixtureRoot, 'dispatch-ran');
  writeDispatchTrap(dispatchPath, dispatchProofPath);
  try {
    const env = familyRuntimeEnv(stateRoot, {
      OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_FAMILY_RUNTIME_MEDAUTOSCIENCE_DISPATCH: dispatchPath,
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
      'paper-mission-route:002-dm-china-us-mortality-attribution:paper-mission-transaction:dm002:provider-block',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    const tick = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-provider-block'], env);
    const task = runCli(['family-runtime', 'queue', 'inspect', taskId], env);

    assert.equal(tick.family_runtime_tick.status, 'blocked_provider_not_ready');
    assert.equal(tick.family_runtime_tick.dispatches.length, 0);
    assert.equal(tick.family_runtime_tick.paper_mission_stage_route_provider_preflight.blockedCount, 1);
    assert.deepEqual(tick.family_runtime_tick.paper_mission_stage_route_provider_preflight.blockedTaskIds, [taskId]);
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.last_error, 'paper_mission_stage_route_provider_preflight_blocked');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'temporal_runtime_not_configured');
    assert.equal(task.family_runtime_task.stage_attempts.length, 0);
    assert.equal(
      task.family_runtime_task.events.some((event: { event_type: string }) =>
        event.event_type === 'paper_mission_stage_route_provider_preflight_blocked',
      ),
      true,
    );
    assert.equal(fs.existsSync(dispatchProofPath), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
