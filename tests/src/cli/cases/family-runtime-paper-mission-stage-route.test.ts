import { assert, fs, os, path, runCli, shellSingleQuote, test } from '../helpers.ts';
import {
  familyRuntimePaths,
  inspectTask,
  openQueueDb,
  type FamilyRuntimeTaskRow,
} from '../../../../src/family-runtime-store.ts';
import {
  buildTemporalStageAttemptWorkflowInput,
  requireTemporalStageAttemptWorkflowInputLaunchable,
} from '../../../../src/family-runtime-temporal.ts';
import { enqueueTask } from '../../../../src/family-runtime-enqueue.ts';
import { dispatchFamilyRuntimeTask } from '../../../../src/family-runtime-task-dispatch.ts';

type StageRouteDispatchReadback = {
  status: 'running' | 'blocked';
  reason: string;
  blocker_reason?: string | null;
  stage_run_request: {
    request_status: string;
    stage_run_created: boolean;
    provider_attempt_requested: boolean;
    provider_running: boolean;
  };
  authority_boundary: {
    can_claim_provider_running: boolean;
    can_claim_paper_progress: boolean;
  };
};

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function writeDispatchTrap(scriptPath: string, proofPath: string) {
  fs.writeFileSync(
    scriptPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      `touch ${shellSingleQuote(proofPath)}`,
      'echo \'{"accepted":true,"surface_kind":"unexpected_mas_domain_handler_dispatch"}\'',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

function paperMissionRoutePayload(overrides: Record<string, unknown> = {}) {
  return {
    surface_kind: 'opl_mas_paper_mission_route_runtime_request',
    schema_version: 1,
    runtime_request_status: 'queued_request',
    runtime_request_kind: 'mas_paper_mission_stage_route',
    study_id: '002-dm-china-us-mortality-attribution',
    mission_id: 'paper-mission::002-dm-china-us-mortality-attribution::gate-clearing::auto',
    candidate_ref: 'ops/medautoscience/paper_mission_candidate_package/dm002/candidate.json',
    paper_mission_transaction_ref: 'paper-mission-transaction:dm002:1',
    opl_route_command_ref: 'paper-mission-transaction:dm002:1#opl_route_command',
    command_kind: 'start_next_stage',
    route_target: 'publication_gate_replay',
    stage_run_request: {
      request_status: 'requested',
      requested_by: 'mas_paper_mission_route_handoff',
      stage_run_created: false,
      provider_attempt_requested: false,
    },
    authority_boundary: {
      domain_truth_owner: 'med-autoscience',
      runtime_owner: 'one-person-lab',
      writes_owner_receipt: false,
      writes_typed_blocker: false,
      writes_human_gate: false,
      writes_current_package: false,
      writes_paper_body: false,
      can_claim_provider_running: false,
      can_claim_paper_progress: false,
      can_claim_runtime_ready: false,
    },
    ...overrides,
  };
}

function paperMissionRoutePayloadWithWorkspace(overrides: Record<string, unknown> = {}) {
  return paperMissionRoutePayload({
    workspace_root: '/tmp/mas-dm-cvd-workspace',
    command_cwd: '/tmp/mas-dm-cvd-workspace',
    opl_domain_export_context: {
      command_source: 'workspace_binding',
      command_cwd: '/tmp/mas-dm-cvd-workspace',
    },
    ...overrides,
  });
}

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
    const attempts = runCli(['family-runtime', 'attempt', 'list'], env);
    const dispatch = tick.family_runtime_tick.dispatches[0];
    const attempt = task.family_runtime_task.stage_attempts[0];

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
    assert.equal(attempt.status, 'queued');
    assert.equal(attempt.workspace_locator.runtime_request_kind, 'mas_paper_mission_stage_route');
    assert.equal(attempt.workspace_locator.study_id, '002-dm-china-us-mortality-attribution');
    assert.equal(attempt.workspace_locator.paper_mission_transaction_ref, 'paper-mission-transaction:dm002:1');
    assert.equal(attempt.workspace_locator.can_claim_provider_running, false);
    assert.equal(attempt.workspace_locator.can_claim_paper_progress, false);
    assert.equal(attempt.checkpoint_refs.includes('paper-mission-transaction:dm002:1'), true);
    assert.equal(attempts.family_runtime_stage_attempts.summary.total, 1);
    assert.equal(fs.existsSync(dispatchProofPath), false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
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

test('family-runtime tick reconciles terminal MAS PaperMission stage-route attempts out of running queue state', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-terminal-'));
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
      'paper-mission-route:dm002:terminal-reconcile',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['typed-blocker:opl_runtime_live_readback_required'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          next_owner: 'med-autoscience',
          reason: 'opl_runtime_live_readback_required',
        },
      }),
    ], env);
    const staleRunningQueue = runCli([
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
    const reconcile = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-terminal'], env);
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

    assert.equal(staleRunningQueue.family_runtime_queue.queue.total, 1);
    assert.equal(
      staleRunningQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness.status,
      'not_live',
    );
    assert.equal(
      staleRunningQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness.stage_attempt_status,
      'completed',
    );
    assert.equal(reconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 1);
    assert.deepEqual(
      reconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids,
      [taskId],
    );
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(task.family_runtime_task.stage_attempts[0].status, 'completed');
    assert.equal(task.family_runtime_task.stage_attempts[0].closeout_receipt_status, 'accepted_typed_closeout');
    assert.deepEqual(task.family_runtime_task.stage_attempts[0].closeout_refs, [
      'typed-blocker:opl_runtime_live_readback_required',
    ]);
    assert.equal(task.family_runtime_task.stage_attempts[0].route_impact.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(
      task.family_runtime_task.events.some((event: { event_type: string }) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled',
      ),
      true,
    );
    assert.equal(runningQueue.family_runtime_queue.queue.total, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime dispatch starts MAS PaperMission stage-route Temporal attempts in the same tick', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-temporal-'));
  const originalStateDir = process.env.OPL_STATE_DIR;
  const originalProvider = process.env.OPL_FAMILY_RUNTIME_PROVIDER;
  const originalTemporalAddress = process.env.OPL_TEMPORAL_ADDRESS;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
    process.env.OPL_TEMPORAL_ADDRESS = '127.0.0.1:7233';
    const { db, paths } = openQueueDb();
    const enqueued = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'paper_mission/stage-route',
      payload: paperMissionRoutePayloadWithWorkspace(),
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
    const launchableInput = requireTemporalStageAttemptWorkflowInputLaunchable(
      buildTemporalStageAttemptWorkflowInput(task.stage_attempts[0]),
    );
    assert.equal(launchableInput.workspace_locator.workspace_root, '/tmp/mas-dm-cvd-workspace');
    assert.equal(task.stage_attempts[0].attempt_count, 1);
    assert.equal(task.stage_attempts[0].provider_run.provider_status, 'running');
    assert.equal(task.events.some((event) => event.event_type === 'paper_mission_stage_route_temporal_started'), true);
    db.close();
  } finally {
    process.env.OPL_STATE_DIR = originalStateDir;
    process.env.OPL_FAMILY_RUNTIME_PROVIDER = originalProvider;
    process.env.OPL_TEMPORAL_ADDRESS = originalTemporalAddress;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime dispatch blocks MAS PaperMission stage-route when Temporal start fails', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-temporal-block-'));
  const originalStateDir = process.env.OPL_STATE_DIR;
  const originalProvider = process.env.OPL_FAMILY_RUNTIME_PROVIDER;
  const originalTemporalAddress = process.env.OPL_TEMPORAL_ADDRESS;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
    process.env.OPL_TEMPORAL_ADDRESS = '';
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
    process.env.OPL_STATE_DIR = originalStateDir;
    process.env.OPL_FAMILY_RUNTIME_PROVIDER = originalProvider;
    process.env.OPL_TEMPORAL_ADDRESS = originalTemporalAddress;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
