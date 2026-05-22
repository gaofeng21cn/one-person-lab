import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import * as activities from '../../src/family-runtime-temporal-activities.ts';
import {
  type TemporalStageAttemptWorkflowInput,
  type TemporalStageAttemptWorkflowState,
} from '../../src/family-runtime-temporal.ts';
import {
  humanGateSignal,
  stageAttemptQuery,
  StageAttemptWorkflow,
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
    assert.ok(result.finalState.activity_events.some((event) => event.activity_kind === 'domain_sidecar_dispatch_activity'));
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
      (event) => event.activity_kind === 'domain_sidecar_dispatch_activity',
    );
    assert.equal(dispatchEvent?.activity_status, 'blocked');
    assert.equal(dispatchEvent?.blocked_reason, 'typed_closeout_packet_required');
  } finally {
    await testEnv.teardown();
  }
});
