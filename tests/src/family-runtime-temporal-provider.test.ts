import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import * as activities from '../../src/family-runtime-temporal-activities.ts';
import {
  buildTemporalStageAttemptWorkflowContract,
  type TemporalStageAttemptWorkflowInput,
  type TemporalStageAttemptWorkflowState,
} from '../../src/family-runtime-temporal.ts';
import {
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
} from '../../src/family-runtime-temporal-constants.ts';
import {
  humanGateSignal,
  stageAttemptQuery,
  StageAttemptWorkflow,
  stageAttemptOperatorUpdate,
  userInstructionSignal,
} from '../../src/family-runtime-temporal-workflows.ts';
import {
  buildTemporalSchedulerHealthProjection,
  buildTemporalWorkerReadiness,
  resolveTemporalWorkerReadinessStatus,
} from '../../src/family-runtime-temporal-provider.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function workflowInput(): TemporalStageAttemptWorkflowInput {
  return {
    stage_attempt_id: 'sat_temporal_test',
    workflow_id: 'wf_temporal_test',
    domain_id: 'medautoscience',
    stage_id: 'analysis-campaign',
    workspace_locator: {
      workspace_root: '/tmp/mas',
    },
    source_fingerprint: 'sha256:test',
    executor_kind: 'codex_cli',
    retry_budget: {
      max_attempts: 3,
    },
    task_id: 'task-temporal-test',
    stage_packet_ref: 'packet:analysis',
    checkpoint_refs: ['checkpoint:seed'],
    codex_stage_runner: {
      runner_mode: 'dry_run',
    },
    closeout_packet: {
      surface_kind: 'stage_memory_closeout_packet',
      closeout_refs: ['receipt:domain-closeout'],
      consumed_refs: ['evidence:table1'],
      consumed_memory_refs: ['memory:route-policy'],
      writeback_receipt_refs: ['memory-writeback:receipt-1'],
      rejected_writes: [{ reason: 'domain_router_rejected' }],
      next_owner: 'med-autoscience',
      domain_ready_verdict: 'domain_gate_pending',
      route_impact: { route: 'review', next_owner: 'med-autoscience' },
    },
  };
}

test('Temporal stage attempt contract exposes Codex runner total and no-output budgets', () => {
  const contract = buildTemporalStageAttemptWorkflowContract();
  assert.equal(
    contract.activity_timeout_policy.codex_stage_activity.runner_timeout_ms,
    DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
  );
  assert.equal(
    contract.activity_timeout_policy.codex_stage_activity.runner_no_output_timeout_ms,
    DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  );
  assert.equal(
    contract.activity_timeout_policy.short_stage_activities.schedule_to_close_timeout,
    '10 minutes',
  );
  assert.equal(
    contract.activity_timeout_policy.short_stage_activities.stale_schedule_release_policy,
    'fail_short_activity_when_worker_does_not_pick_up_scheduled_task',
  );
  assert.equal(contract.activity_timeout_policy.short_stage_activities.retry.maximum_attempts, 3);
  assert.equal(contract.activity_timeout_policy.codex_stage_activity.retry.maximum_attempts, 1);
  assert.equal(contract.operator_action_updates[0], 'StageAttemptOperatorUpdate');
  assert.equal(
    contract.scheduler_tick_timeout_policy.workflow_run_timeout,
    '12 minutes',
  );
  assert.equal(
    contract.scheduler_tick_timeout_policy.workflow_execution_timeout,
    '12 minutes',
  );
  assert.equal(
    contract.scheduler_tick_timeout_policy.stale_overlap_release_policy,
    'fail_scheduler_tick_workflow_when_worker_does_not_pick_up_workflow_or_activity',
  );
});

test('Temporal StageAttemptWorkflow acks operator actions through Updates', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-update-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities,
    });

    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [workflowInput()],
        taskQueue,
        workflowId: `wf-temporal-update-test-${Date.now()}`,
      });
      const humanGateAck = await handle.executeUpdate(stageAttemptOperatorUpdate, {
        args: [{
          signal_kind: 'human_gate',
          payload: {
            human_gate_ref: 'gate:update-review',
            reason: 'needs_review',
          },
          source: 'test-update',
        }],
      });
      const instructionAck = await handle.executeUpdate(stageAttemptOperatorUpdate, {
        args: [{
          signal_kind: 'user_instruction',
          payload: {
            instruction_ref: 'user:update-instruction',
          },
          source: 'test-update',
        }],
      });
      const finalState = await handle.result();
      return { humanGateAck, instructionAck, finalState };
    });

    assert.equal(result.humanGateAck.update_status, 'accepted');
    assert.equal(result.humanGateAck.signal_kind, 'human_gate');
    assert.equal(result.humanGateAck.stage_attempt_id, 'sat_temporal_test');
    assert.equal(result.instructionAck.update_status, 'accepted');
    assert.equal(result.finalState.signals.length, 2);
    assert.deepEqual(result.finalState.human_gate_refs, ['gate:update-review']);
    assert.equal(
      result.finalState.signals.map((signal) => signal.source).includes('test-update'),
      true,
    );
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal StageAttemptWorkflow rejects invalid operator Updates before mutation', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-update-reject-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities,
    });

    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [workflowInput()],
        taskQueue,
        workflowId: `wf-temporal-update-reject-test-${Date.now()}`,
      });
      await assert.rejects(
        handle.executeUpdate(stageAttemptOperatorUpdate, {
          args: [{
            signal_kind: 'human_gate',
            payload: {
              reason: 'missing_ref',
            },
            source: 'test-update',
          }],
        }),
        (error) => error instanceof Error
          && error.name === 'WorkflowUpdateFailedError'
          && error.cause instanceof Error
          && /human_gate update requires payload\.human_gate_ref/.test(error.cause.message),
      );
      const queriedState = await handle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery);
      const finalState = await handle.result();
      return { queriedState, finalState };
    });

    assert.equal(result.queriedState.signals.length, 0);
    assert.equal(result.finalState.signals.length, 0);
    assert.deepEqual(result.finalState.human_gate_refs, []);
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal StageAttemptWorkflow retries short idempotent activities without retrying Codex activity', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-short-retry-test-${Date.now()}`;
  let codexAttempts = 0;
  let dispatchAttempts = 0;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async (input: TemporalStageAttemptWorkflowInput) => {
          codexAttempts += 1;
          return {
            surface_kind: 'temporal_codex_stage_activity_receipt',
            activity_kind: 'codex_stage_activity',
            activity_status: 'completed',
            stage_attempt_id: input.stage_attempt_id,
            stage_id: input.stage_id,
            checkpoint_refs: input.checkpoint_refs ?? [],
            closeout_packet: input.closeout_packet,
          };
        },
        domainHandlerDispatchActivity: async (input: TemporalStageAttemptWorkflowInput) => {
          dispatchAttempts += 1;
          if (dispatchAttempts === 1) {
            throw new Error('transient dispatch store failure');
          }
          return {
            surface_kind: 'temporal_domain_handler_dispatch_receipt',
            activity_kind: 'domain_handler_dispatch_activity',
            activity_status: 'completed',
            stage_attempt_id: input.stage_attempt_id,
            domain_id: input.domain_id,
            closeout_refs: ['receipt:retried-dispatch'],
            consumed_refs: [],
            consumed_memory_refs: [],
            writeback_receipt_refs: [],
            rejected_writes: [],
            next_owner: 'med-autoscience',
            domain_ready_verdict: 'domain_gate_pending',
            route_impact: { retry_observed: true },
            closeout_packet_surface_kind: 'stage_attempt_closeout_packet',
          };
        },
      },
    });

    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [workflowInput()],
        taskQueue,
        workflowId: `wf-temporal-short-retry-test-${Date.now()}`,
      });
      return await handle.result();
    });

    assert.equal(result.status, 'completed');
    assert.equal(codexAttempts, 1);
    assert.equal(dispatchAttempts, 2);
    assert.deepEqual(result.closeout_refs, ['receipt:retried-dispatch']);
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal StageAttemptWorkflow exposes activity state, signals, and completion boundary', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities,
    });

    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [workflowInput()],
        taskQueue,
        workflowId: `wf-temporal-test-${Date.now()}`,
      });
      await handle.signal(humanGateSignal, {
        signal_kind: 'human_gate',
        payload: {
          human_gate_ref: 'gate:operator-review',
          reason: 'needs_review',
        },
        source: 'test',
      });
      await handle.signal(userInstructionSignal, {
        signal_kind: 'user_instruction',
        payload: {
          instruction_ref: 'user:revision-10',
        },
        source: 'test',
      });
      const finalState = await handle.result();
      const queriedState = await handle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery);
      return { finalState, queriedState };
    });

    assert.equal(result.finalState.surface_kind, 'temporal_stage_attempt_query');
    assert.equal(result.finalState.status, 'completed');
    assert.equal(result.finalState.completion_boundary.provider_completion, 'completed');
    assert.equal(result.finalState.completion_boundary.provider_completion_is_domain_ready, false);
    assert.equal(result.finalState.completion_boundary.domain_ready_verdict, 'domain_gate_pending');
    assert.deepEqual(result.finalState.closeout_refs, ['receipt:domain-closeout']);
    assert.deepEqual(result.finalState.consumed_refs, ['evidence:table1']);
    assert.deepEqual(result.finalState.consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(result.finalState.writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.equal(result.finalState.rejected_writes[0].reason, 'domain_router_rejected');
    assert.equal(result.finalState.next_owner, 'med-autoscience');
    assert.ok(result.finalState.activity_events.some((event) => event.activity_kind === 'codex_stage_activity'));
    const codexCompletion = result.finalState.activity_events.find(
      (event) => event.activity_kind === 'codex_stage_activity' && event.activity_status === 'completed',
    ) as Record<string, any> | undefined;
    assert.equal(codexCompletion?.runner_status.runner_mode, 'dry_run');
    assert.equal(codexCompletion?.runner_status.live_process_started, false);
    assert.equal(codexCompletion?.heartbeat_summary.checkpoint_count, 1);
    assert.equal(codexCompletion?.progress_summary.progress_status, 'checkpointed');
    assert.equal(codexCompletion?.cost_summary.estimated_cost_usd, 0);
    assert.ok(result.finalState.activity_events.some((event) => event.activity_kind === 'domain_handler_dispatch_activity'));
    assert.equal(result.queriedState.signals.length, 2);
    assert.deepEqual(result.queriedState.human_gate_refs, ['gate:operator-review']);
    assert.equal(result.queriedState.authority_boundary.domain, 'truth_quality_artifact_gate_owner');
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal worker readiness helper reports live configured state without starting a worker', () => {
  const readiness = buildTemporalWorkerReadiness({
    address: '127.0.0.1:7233',
    workerEnabled: '1',
    workerStatus: 'ready',
    namespace: 'opl-test',
    taskQueue: 'opl-stage-attempts-test',
  });

  assert.equal(readiness.surface_kind, 'temporal_worker_readiness');
  assert.equal(readiness.readiness_status, 'ready');
  assert.equal(readiness.worker_ready, true);
  assert.equal(readiness.live_probe_started_worker, false);
  assert.equal(readiness.repair_action.action_id, 'none');
  assert.equal(
    readiness.repair_action.next_command,
    'opl family-runtime residency proof --provider temporal --production',
  );
  assert.equal(readiness.lifecycle.worker_helper, 'runTemporalStageAttemptWorkerUntil');
  assert.deepEqual(readiness.blockers, []);
});

test('Temporal scheduler health projection surfaces current stale action repair without domain authority', () => {
  const healthy = buildTemporalSchedulerHealthProjection({
    scheduleStatus: 'active',
    info: {
      num_actions_skipped_overlap: 0,
      running_actions: [],
    },
  });
  const stale = buildTemporalSchedulerHealthProjection({
    scheduleStatus: 'active',
    info: {
      num_actions_skipped_overlap: 59,
      running_actions: [{
        type: 'startWorkflow',
        workflow: {
          workflowId: 'opl-family-runtime-provider-scheduler-tick-2026-05-18T04:05:00Z',
          firstExecutionRunId: '019e3942-31ec-785c-978d-3d904d85423a',
        },
      }],
    },
  });

  assert.equal(healthy.health_status, 'healthy');
  assert.equal(healthy.repair_action.action_id, 'none');
  assert.equal(stale.health_status, 'attention_required');
  assert.equal(stale.running_action_count, 1);
  assert.equal(stale.num_actions_skipped_overlap, 59);
  assert.equal(stale.historical_overlap_skip_observed, true);
  assert.equal(stale.repair_action.action_id, 'inspect_or_repair_stale_scheduler_tick');
  assert.equal(stale.repair_action.terminate_stale_workflow_requires_operator, true);
  assert.equal(stale.authority_boundary.can_terminate_workflow_automatically, false);
  assert.equal(stale.authority_boundary.can_write_domain_truth, false);
});

test('Temporal scheduler health projection keeps historical overlap skips informational after recovery', () => {
  const recovered = buildTemporalSchedulerHealthProjection({
    scheduleStatus: 'active',
    info: {
      num_actions_skipped_overlap: 60,
      running_actions: [],
    },
  });

  assert.equal(recovered.health_status, 'healthy');
  assert.equal(recovered.running_action_count, 0);
  assert.equal(recovered.num_actions_skipped_overlap, 60);
  assert.equal(recovered.historical_overlap_skip_observed, true);
  assert.equal(recovered.repair_action.action_id, 'none');
  assert.equal(
    recovered.repair_action.reason,
    'scheduler_cadence_healthy_historical_overlap_skip_retained',
  );
});

test('Temporal worker lifecycle status distinguishes configured, server, and worker readiness gates', () => {
  assert.equal(resolveTemporalWorkerReadinessStatus({
    address: null,
    serverReachable: false,
    workerReady: false,
  }), 'not_configured');
  assert.equal(resolveTemporalWorkerReadinessStatus({
    address: '127.0.0.1:7233',
    serverReachable: false,
    workerReady: false,
  }), 'server_unreachable');
  assert.equal(resolveTemporalWorkerReadinessStatus({
    address: '127.0.0.1:7233',
    serverReachable: true,
    workerReady: false,
  }), 'worker_not_ready');
  assert.equal(resolveTemporalWorkerReadinessStatus({
    address: '127.0.0.1:7233',
    serverReachable: true,
    workerReady: true,
  }), 'ready');
});

test('Temporal StageAttemptWorkflow blocks provider completion when typed closeout is missing', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-blocked-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities,
    });

    const result = await worker.runUntil(async () => {
      const input = workflowInput();
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{
          ...input,
          closeout_packet: null,
        }],
        taskQueue,
        workflowId: `wf-temporal-blocked-test-${Date.now()}`,
      });
      return await handle.result();
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.completion_boundary.provider_completion, 'not_completed');
    assert.equal(result.completion_boundary.domain_ready_verdict, null);
    assert.deepEqual(result.closeout_refs, []);
    const dispatchEvent = result.activity_events.find(
      (event) => event.activity_kind === 'domain_handler_dispatch_activity',
    );
    assert.equal(dispatchEvent?.activity_status, 'blocked');
    assert.equal(dispatchEvent?.blocked_reason, 'typed_closeout_packet_required');
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal StageAttemptWorkflow surfaces Codex runner protocol blockers before domain dispatch', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-runner-blocker-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async (input: TemporalStageAttemptWorkflowInput) => ({
          surface_kind: 'temporal_codex_stage_activity_receipt',
          activity_kind: 'codex_stage_activity',
          activity_status: 'completed',
          stage_attempt_id: input.stage_attempt_id,
          stage_id: input.stage_id,
          checkpoint_refs: input.checkpoint_refs ?? [],
          closeout_packet: null,
          process_output_summary: {
            exit_code: 124,
            timeout_reason: 'unsupported_tool_protocol',
            blocked_reason: 'codex_cli_unsupported_function_call',
            pending_function_call_count: 1,
            function_call_names: ['exec_command'],
          },
        }),
      },
    });

    const result = await worker.runUntil(async () => {
      const input = workflowInput();
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{
          ...input,
          closeout_packet: null,
        }],
        taskQueue,
        workflowId: `wf-temporal-runner-blocker-test-${Date.now()}`,
      });
      return await handle.result();
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.closeout_packet?.blocked_reason, 'codex_cli_unsupported_function_call');
    const dispatchEvent = result.activity_events.find(
      (event) => event.activity_kind === 'domain_handler_dispatch_activity',
    );
    assert.equal(dispatchEvent?.activity_status, 'blocked');
    assert.equal(dispatchEvent?.blocked_reason, 'codex_cli_unsupported_function_call');
    assert.equal(
      (dispatchEvent?.route_impact as Record<string, unknown>)?.provider_blocker_reason,
      'codex_cli_unsupported_function_call',
    );
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal StageAttemptWorkflow consumes Codex activity typed closeout for provider completion', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-codex-closeout-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async (input: TemporalStageAttemptWorkflowInput) => ({
          surface_kind: 'temporal_codex_stage_activity_receipt',
          activity_kind: 'codex_stage_activity',
          activity_status: 'completed',
          stage_attempt_id: input.stage_attempt_id,
          stage_id: input.stage_id,
          checkpoint_refs: input.checkpoint_refs ?? [],
          closeout_packet: {
            surface_kind: 'stage_attempt_closeout_packet',
            closeout_refs: ['receipt:codex-closeout'],
            consumed_refs: ['paper:draft.md'],
            next_owner: 'med-autoscience',
            domain_ready_verdict: 'domain_gate_pending',
          },
        }),
      },
    });

    const result = await worker.runUntil(async () => {
      const input = workflowInput();
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{
          ...input,
          closeout_packet: null,
        }],
        taskQueue,
        workflowId: `wf-temporal-codex-closeout-test-${Date.now()}`,
      });
      return await handle.result();
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.completion_boundary.provider_completion, 'completed');
    assert.equal(result.completion_boundary.domain_ready_verdict, 'domain_gate_pending');
    assert.deepEqual(result.closeout_refs, ['receipt:codex-closeout']);
    assert.deepEqual(result.consumed_refs, ['paper:draft.md']);
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal StageAttemptWorkflow rejects Codex activity closeout for a different stage attempt', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-stale-closeout-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async (input: TemporalStageAttemptWorkflowInput) => ({
          surface_kind: 'temporal_codex_stage_activity_receipt',
          activity_kind: 'codex_stage_activity',
          activity_status: 'completed',
          stage_attempt_id: input.stage_attempt_id,
          stage_id: input.stage_id,
          checkpoint_refs: input.checkpoint_refs ?? [],
          closeout_packet: {
            surface_kind: 'stage_attempt_closeout_packet',
            stage_attempt_id: 'sat_previous_temporal_attempt',
            closeout_refs: ['receipt:stale-codex-closeout'],
            consumed_refs: ['paper:draft.md'],
            next_owner: 'med-autoscience',
            domain_ready_verdict: 'domain_gate_pending',
          },
        }),
      },
    });

    const result = await worker.runUntil(async () => {
      const input = workflowInput();
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{
          ...input,
          closeout_packet: null,
        }],
        taskQueue,
        workflowId: `wf-temporal-stale-closeout-test-${Date.now()}`,
      });
      return await handle.result();
    });

    assert.equal(result.status, 'blocked');
    assert.equal(result.completion_boundary.provider_completion, 'not_completed');
    assert.deepEqual(result.closeout_refs, []);
    const dispatchEvent = result.activity_events.find(
      (event) => event.activity_kind === 'domain_handler_dispatch_activity',
    );
    assert.equal(dispatchEvent?.activity_status, 'blocked');
    assert.equal(dispatchEvent?.blocked_reason, 'typed_closeout_stage_attempt_id_mismatch');
  } finally {
    await testEnv.teardown();
  }
});
