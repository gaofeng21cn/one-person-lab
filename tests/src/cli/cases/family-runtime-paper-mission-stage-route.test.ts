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
import { syncStageAttemptFromTemporalTerminalObservation } from '../../../../src/family-runtime-stage-attempts.ts';

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
    route_identity_key: 'paper-mission-transaction:dm002:1::route',
    attempt_idempotency_key: 'dm002:gate-clearing:accepted-candidate::opl-attempt',
    request_idempotency_key: 'dm002:gate-clearing:accepted-candidate::opl-request',
    stage_run_request: {
      request_status: 'requested',
      requested_by: 'mas_paper_mission_route_handoff',
      route_identity_key: 'paper-mission-transaction:dm002:1::route',
      attempt_idempotency_key: 'dm002:gate-clearing:accepted-candidate::opl-attempt',
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

test('family-runtime typed closeout reconciles terminal MAS PaperMission stage-route and admits successor execution', () => {
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
    const immediateTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
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

    assert.equal(immediateTask.family_runtime_task.task.status, 'blocked');
    assert.equal(immediateTask.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(reconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 0);
    assert.deepEqual(reconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, []);
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
    const terminalReconcileEvents = task.family_runtime_task.events.filter((event: { event_type: string }) =>
      event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
    );
    assert.equal(terminalReconcileEvents.length, 1);
    assert.equal(terminalReconcileEvents[0].source, 'typed-closeout-ingest:paper-mission-stage-route-terminal');
    assert.equal(
      terminalReconcileEvents[0].payload.authority_boundary.provider_completion_is_domain_ready,
      false,
    );
    assert.equal(
      terminalReconcileEvents[0].payload.authority_boundary.can_claim_paper_progress,
      false,
    );
    assert.equal(
      terminalReconcileEvents[0].payload.route_identity_key,
      'paper-mission-transaction:dm002:1::route',
    );
    assert.equal(
      terminalReconcileEvents[0].payload.attempt_idempotency_key,
      'dm002:gate-clearing:accepted-candidate::opl-attempt',
    );
    assert.equal(runningQueue.family_runtime_queue.queue.total, 1);
    assert.notEqual(runningQueue.family_runtime_queue.tasks[0].task_id, taskId);
    assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.requeued_from_terminal_task_id, taskId);
    assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.requeued_from_terminal_stage_attempt_id, attemptId);
    assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.terminal_successor_generation, 1);
    assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.terminal_successor_max_generation, 1);
    assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.terminal_successor_root_task_id, taskId);
    assert.equal(runningQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness.stage_attempt_id !== attemptId, true);
    assert.equal(
      runningQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness.route_command.opl_route_command_ref,
      'paper-mission-transaction:dm002:1#opl_route_command',
    );
    assert.equal(
      runningQueue.family_runtime_queue.tasks[0].payload.route_identity_key,
      'paper-mission-transaction:dm002:1::route',
    );
    assert.equal(
      runningQueue.family_runtime_queue.tasks[0].payload.attempt_idempotency_key,
      'dm002:gate-clearing:accepted-candidate::opl-attempt',
    );
    assert.equal(
      runningQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness.route_command.route_identity_key,
      'paper-mission-transaction:dm002:1::route',
    );
    assert.equal(
      runningQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness.route_command.attempt_idempotency_key,
      'dm002:gate-clearing:accepted-candidate::opl-attempt',
    );
    assert.deepEqual(runningQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness.closeout_refs, []);
    const secondReconcile = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-terminal-repeat'], env);
    const repeatedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const repeatedRunningQueue = runCli([
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
    assert.equal(secondReconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 0);
    assert.deepEqual(secondReconcile.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, []);
    assert.equal(
      repeatedTask.family_runtime_task.events.filter((event: { event_type: string }) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
      ).length,
      1,
    );
    assert.equal(repeatedRunningQueue.family_runtime_queue.queue.total, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime terminal successor admission is bounded to one OPL followthrough generation', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-terminal-bounded-'));
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
      'paper-mission-route:dm002:terminal-bounded',
    ], env);
    const originalTaskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-bounded-start'], env);
    const originalRunningTask = runCli(['family-runtime', 'queue', 'inspect', originalTaskId], env);
    const originalAttemptId = originalRunningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      originalAttemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002-bounded-original',
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
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-bounded-terminal'], env);
    const successorQueue = runCli([
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
    assert.equal(successorQueue.family_runtime_queue.queue.total, 1);
    const successorTaskId = successorQueue.family_runtime_queue.tasks[0].task_id;
    const successorAttemptId = successorQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness.stage_attempt_id;
    assert.notEqual(successorTaskId, originalTaskId);
    assert.notEqual(successorAttemptId, originalAttemptId);
    assert.equal(successorQueue.family_runtime_queue.tasks[0].payload.terminal_successor_generation, 1);

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      successorAttemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002-bounded-successor',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['typed-blocker:opl_runtime_live_readback_required:successor'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          next_owner: 'med-autoscience',
          reason: 'successor_opl_runtime_live_readback_required',
        },
      }),
    ], env);
    const originalAfterSuccessorCloseout = runCli(['family-runtime', 'queue', 'inspect', originalTaskId], env);
    const successorAfterCloseout = runCli(['family-runtime', 'queue', 'inspect', successorTaskId], env);
    const runningAfterSuccessorCloseout = runCli([
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

    assert.equal(successorAfterCloseout.family_runtime_task.task.status, 'blocked');
    assert.equal(successorAfterCloseout.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
    assert.equal(
      successorAfterCloseout.family_runtime_task.events.filter((event: { event_type: string }) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
      ).length,
      1,
    );
    const successorReconcileEvent = successorAfterCloseout.family_runtime_task.events.find((event: { event_type: string }) =>
      event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
    );
    assert.equal(successorReconcileEvent.payload.successor_task_id, null);
    assert.equal(successorReconcileEvent.payload.successor_created, false);
    assert.equal(runningAfterSuccessorCloseout.family_runtime_queue.queue.total, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime backfills successor admission for historical blocked terminal PaperMission stage-route tasks', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-terminal-backfill-'));
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
      JSON.stringify(paperMissionRoutePayload({
        command_kind: 'resume_stage',
        route_target: 'continue paper-facing submission milestone work',
      })),
      '--dedupe-key',
      'paper-mission-route:dm002:terminal-backfill',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-backfill-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002-backfill',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['typed-blocker:historical-opl-runtime-live-readback-required'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          next_owner: 'med-autoscience',
          reason: 'historical_opl_runtime_live_readback_required',
        },
      }),
    ], env);
    const afterCloseout = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    assert.equal(afterCloseout.family_runtime_task.task.status, 'blocked');
    assert.equal(afterCloseout.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');

    const originalStateDir = process.env.OPL_STATE_DIR;
    try {
      process.env.OPL_STATE_DIR = stateRoot;
      const { db } = openQueueDb();
      db.prepare('DELETE FROM tasks WHERE dedupe_key = ?').run(`paper-mission-route-terminal-successor:${taskId}:${attemptId}`);
      db.prepare(`
        DELETE FROM events
        WHERE event_type = 'task_enqueued'
          AND json_extract(payload_json, '$.dedupe_key') = ?
      `).run(`paper-mission-route-terminal-successor:${taskId}:${attemptId}`);
      db.close();
    } finally {
      process.env.OPL_STATE_DIR = originalStateDir;
    }

    const backfill = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-backfill-terminal'], env);
    const backfilledTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
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
    assert.equal(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 1);
    assert.deepEqual(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, [taskId]);
    assert.equal(runningQueue.family_runtime_queue.queue.total, 1);
    assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.requeued_from_terminal_task_id, taskId);
    assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.requeued_from_terminal_stage_attempt_id, attemptId);
    assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.terminal_successor_generation, 1);
    const backfillEvents = backfilledTask.family_runtime_task.events.filter((event: { event_type: string }) =>
      event.event_type === 'paper_mission_stage_route_terminal_successor_backfilled'
    );
    assert.equal(backfillEvents.length, 1);
    assert.equal(backfillEvents[0].payload.backfill_only, true);
    assert.equal(backfillEvents[0].payload.successor_created, true);

    const repeatedBackfill = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-backfill-terminal-repeat'], env);
    const repeatedTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    assert.equal(repeatedBackfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 0);
    assert.equal(
      repeatedTask.family_runtime_task.events.filter((event: { event_type: string }) =>
        event.event_type === 'paper_mission_stage_route_terminal_successor_backfilled'
      ).length,
      1,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime does not backfill terminal successors from legacy PaperMission routes without route identity', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-terminal-legacy-'));
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
      JSON.stringify(paperMissionRoutePayload({
        command_kind: 'resume_stage',
        route_target: 'continue paper-facing submission milestone work',
      })),
      '--dedupe-key',
      'paper-mission-route:dm002:legacy-terminal-backfill',
    ], env);
    const taskId = enqueue.family_runtime_enqueue.task.task_id;
    runCli(['family-runtime', 'tick', '--source', 'test-paper-route-legacy-start'], env);
    const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--stage-packet-ref',
      'packet:paper-mission-route-dm002-legacy',
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['typed-blocker:legacy-route-identity-missing'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          next_owner: 'med-autoscience',
          reason: 'legacy_route_identity_missing',
        },
      }),
    ], env);
    const afterCloseout = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
    assert.equal(afterCloseout.family_runtime_task.task.status, 'blocked');
    assert.equal(afterCloseout.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');

    const originalStateDir = process.env.OPL_STATE_DIR;
    try {
      process.env.OPL_STATE_DIR = stateRoot;
      const { db } = openQueueDb();
      db.prepare('DELETE FROM tasks WHERE dedupe_key = ?').run(`paper-mission-route-terminal-successor:${taskId}:${attemptId}`);
      db.prepare(`
        UPDATE tasks
        SET payload_json = json_remove(
            payload_json,
            '$.route_identity_key',
            '$.attempt_idempotency_key',
            '$.request_idempotency_key'
          )
        WHERE task_id = ?
      `).run(taskId);
      db.prepare(`
        DELETE FROM events
        WHERE event_type = 'task_enqueued'
          AND json_extract(payload_json, '$.dedupe_key') = ?
      `).run(`paper-mission-route-terminal-successor:${taskId}:${attemptId}`);
      db.close();
    } finally {
      process.env.OPL_STATE_DIR = originalStateDir;
    }

    const backfill = runCli(['family-runtime', 'tick', '--source', 'test-paper-route-legacy-terminal'], env);
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
    const identityNotReadyEvents = task.family_runtime_task.events.filter(
      (event: { event_type: string; payload: Record<string, unknown> }) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
        && event.payload.terminal_successor_identity_ready === false,
    );
    const reconcileEvent = identityNotReadyEvents[0];

    assert.equal(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_count, 1);
    assert.deepEqual(backfill.family_runtime_tick.reconciled_paper_mission_stage_route_terminal_task_ids, [taskId]);
    assert.equal(runningQueue.family_runtime_queue.queue.total, 0);
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
    assert.notEqual(reconcileEvent, undefined);
    assert.equal(identityNotReadyEvents.length, 1);
    assert.equal(reconcileEvent.payload.successor_task_id, null);
    assert.equal(reconcileEvent.payload.successor_created, false);
    assert.equal(reconcileEvent.payload.terminal_successor_identity_ready, false);
    assert.deepEqual(reconcileEvent.payload.missing_terminal_successor_identity_fields, [
      'route_identity_key',
      'attempt_idempotency_key',
    ]);
    assert.equal(reconcileEvent.payload.authority_boundary.can_claim_paper_progress, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

for (const commandKind of ['route_back', 'resume_stage'] as const) {
  test(`family-runtime terminal successor admission supports ${commandKind} PaperMission route commands`, () => {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-paper-mission-stage-route-${commandKind}-`));
    try {
      const env = familyRuntimeEnv(stateRoot, {
        OPL_FAMILY_RUNTIME_PROVIDER: 'local_sqlite',
      });
      const transactionRef = `paper-mission-transaction:dm002:${commandKind}:terminal-successor`;
      const routeTarget = commandKind === 'route_back'
        ? 'gate_clearing_claim_evidence_repair'
        : 'continue paper-facing submission milestone work';
      const enqueue = runCli([
        'family-runtime',
        'enqueue',
        '--domain',
        'medautoscience',
        '--task-kind',
        'paper_mission/stage-route',
        '--payload',
        JSON.stringify(paperMissionRoutePayload({
          paper_mission_transaction_ref: transactionRef,
          opl_route_command_ref: `${transactionRef}#opl_route_command`,
          command_kind: commandKind,
          route_target: routeTarget,
        })),
        '--dedupe-key',
        `paper-mission-route:dm002:${commandKind}:terminal-successor`,
      ], env);
      const taskId = enqueue.family_runtime_enqueue.task.task_id;
      runCli(['family-runtime', 'tick', '--source', `test-paper-route-${commandKind}-start`], env);
      const runningTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
      const attemptId = runningTask.family_runtime_task.stage_attempts[0].stage_attempt_id;
      runCli([
        'family-runtime',
        'attempt',
        'fixture-run',
        attemptId,
        '--stage-packet-ref',
        `packet:paper-mission-route-dm002-${commandKind}`,
        '--closeout-packet',
        JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: [`typed-blocker:${commandKind}:opl_runtime_live_readback_required`],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: {
            decision: 'bounded_repair',
            next_owner: 'med-autoscience',
            reason: `${commandKind}_opl_runtime_live_readback_required`,
          },
        }),
      ], env);
      runCli(['family-runtime', 'tick', '--source', `test-paper-route-${commandKind}-terminal`], env);
      const originalTask = runCli(['family-runtime', 'queue', 'inspect', taskId], env);
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

      assert.equal(originalTask.family_runtime_task.task.status, 'blocked');
      assert.equal(originalTask.family_runtime_task.task.last_error, 'paper_mission_stage_route_domain_gate_pending');
      assert.equal(runningQueue.family_runtime_queue.queue.total, 1);
      assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.command_kind, commandKind);
      assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.route_target, routeTarget);
      assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.requeued_from_terminal_task_id, taskId);
      assert.equal(runningQueue.family_runtime_queue.tasks[0].payload.requeued_from_terminal_stage_attempt_id, attemptId);
      assert.equal(runningQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness.stage_attempt_id !== attemptId, true);
      assert.equal(
        runningQueue.family_runtime_queue.tasks[0].linked_stage_attempt_liveness.route_command.opl_route_command_ref,
        `${transactionRef}#opl_route_command`,
      );
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
    }
  });
}

test('family-runtime Temporal completed PaperMission stage-route without typed closeout becomes explicit blocker', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-temporal-missing-closeout-'));
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
    process.env.OPL_STATE_DIR = originalStateDir;
    process.env.OPL_FAMILY_RUNTIME_PROVIDER = originalProvider;
    process.env.OPL_TEMPORAL_ADDRESS = originalTemporalAddress;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime late typed closeout supersedes provider-only missing closeout blocker', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-paper-mission-stage-route-late-closeout-'));
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
    assert.equal(
      terminalTask.events.filter((event) =>
        event.event_type === 'paper_mission_stage_route_terminal_task_reconciled'
      ).at(-1)?.payload.reason,
      'paper_mission_stage_route_domain_gate_pending',
    );
    db.close();
  } finally {
    process.env.OPL_STATE_DIR = originalStateDir;
    process.env.OPL_FAMILY_RUNTIME_PROVIDER = originalProvider;
    process.env.OPL_TEMPORAL_ADDRESS = originalTemporalAddress;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

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
