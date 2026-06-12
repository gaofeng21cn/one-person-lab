import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './family-runtime-temporal-provider-cases/scheduler-and-readiness.ts';
import {
  defaultPayloadConverter,
  fromPayloadsAtIndex,
} from '@temporalio/common/lib/converter/payload-converter.js';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import * as activities from '../../src/family-runtime-temporal-activities.ts';
import {
  compactCloseoutPacketForTemporalResult,
} from '../../src/family-runtime-temporal-activities.ts';
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
  buildTemporalStageAttemptWorkflowInputForTest,
  buildTemporalStageAttemptReplayGateForTest,
  buildTemporalWorkerReadiness,
} from '../../src/family-runtime-temporal-provider.ts';
import {
  buildTemporalStageAttemptSearchAttributes,
  buildTemporalStageAttemptVisibilityReadiness,
} from '../../src/family-runtime-temporal-visibility.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function firstActivityResultFromHistory(history: { events?: Array<Record<string, any>> | null }) {
  const completion = (history.events ?? []).find((event) => event.activityTaskCompletedEventAttributes);
  const payloads = completion?.activityTaskCompletedEventAttributes?.result?.payloads;
  return fromPayloadsAtIndex<Record<string, any>>(defaultPayloadConverter, 0, payloads);
}

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
  assert.deepEqual(contract.required_search_attributes, [
    'OplStageAttemptId',
    'OplDomainId',
    'OplStageId',
    'OplAttemptStatus',
    'OplStagePhase',
    'OplBlockedReason',
    'OplTaskId',
    'OplSourceFingerprint',
    'OplExecutorKind',
  ]);
});

test('Temporal visibility readiness requires OPL stage attempt Search Attributes', () => {
  const blocked = buildTemporalStageAttemptVisibilityReadiness({
    namespace: 'opl-test',
    observedCustomAttributes: { OplStageAttemptId: 'Keyword' },
  });
  const ready = buildTemporalStageAttemptVisibilityReadiness({
    namespace: 'opl-test',
    observedCustomAttributes: {
      OplStageAttemptId: 'Keyword',
      OplDomainId: 'Keyword',
      OplStageId: 'Keyword',
      OplAttemptStatus: 'Keyword',
      OplStagePhase: 'Keyword',
      OplBlockedReason: 'Keyword',
      OplTaskId: 'Keyword',
      OplSourceFingerprint: 'Keyword',
      OplExecutorKind: 'Keyword',
    },
  });

  assert.equal(blocked.readiness_status, 'missing_search_attributes');
  assert.deepEqual(blocked.missing_search_attributes.map((attribute) => attribute.name), [
    'OplDomainId',
    'OplStageId',
    'OplAttemptStatus',
    'OplStagePhase',
    'OplBlockedReason',
    'OplTaskId',
    'OplSourceFingerprint',
    'OplExecutorKind',
  ]);
  assert.equal(blocked.repair_action?.action_id, 'install_temporal_stage_attempt_search_attributes');
  assert.equal(ready.readiness_status, 'ready');
  assert.deepEqual(ready.missing_search_attributes, []);
  assert.equal(ready.repair_action, null);
});

test('Temporal workflow start Search Attributes are array-valued even when optional fields are absent', () => {
  const attributes = buildTemporalStageAttemptSearchAttributes({
    ...workflowInput(),
    source_fingerprint: null,
    task_id: null,
    provider_blocker: null,
  });

  assert.deepEqual(attributes.OplBlockedReason, []);
  assert.deepEqual(attributes.OplTaskId, []);
  assert.deepEqual(attributes.OplSourceFingerprint, []);
  for (const [name, value] of Object.entries(attributes)) {
    assert.equal(Array.isArray(value), true, `${name} must be an array for Temporal start`);
  }
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
    assert.equal(codexCompletion?.cost_summary.cost_status, 'not_measured_dry_run');
    assert.equal(codexCompletion?.cost_summary.estimated_cost_usd, 0);
    assert.ok(result.finalState.activity_events.some((event) => event.activity_kind === 'domain_handler_dispatch_activity'));
    assert.equal(result.queriedState.signals.length, 2);
    assert.deepEqual(result.queriedState.human_gate_refs, ['gate:operator-review']);
    assert.equal(result.queriedState.authority_boundary.domain, 'truth_quality_artifact_gate_owner');
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal replay gate replays completed StageAttemptWorkflow history with the production bundle', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-replay-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities,
    });
    const workflowId = `wf-temporal-replay-test-${Date.now()}`;

    const history = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [workflowInput()],
        taskQueue,
        workflowId,
      });
      await handle.signal(humanGateSignal, {
        signal_kind: 'human_gate',
        payload: {
          human_gate_ref: 'gate:replay-operator-review',
          reason: 'replay_gate_signal_history',
        },
        source: 'replay-test',
      });
      await handle.signal(userInstructionSignal, {
        signal_kind: 'user_instruction',
        payload: {
          instruction_ref: 'user:replay-revision-request',
        },
        source: 'replay-test',
      });
      await handle.result();
      return await handle.fetchHistory();
    });

    const gate = await buildTemporalStageAttemptReplayGateForTest(history, workflowId);

    assert.equal(gate.surface_kind, 'temporal_stage_attempt_replay_gate');
    assert.equal(gate.replay_status, 'passed');
    assert.equal(gate.workflow_id, workflowId);
    const replayBundle = gate.worker_options.workflowBundle;
    assert.ok(replayBundle && 'codePath' in replayBundle);
    assert.equal(replayBundle.codePath, gate.workflow_bundle.code_path);
    assert.equal('workflowsPath' in gate.worker_options, false);
    assert.match(gate.workflow_bundle.workflow_bundle_version, /^workflow-bundle:sha256:/);
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

test('Temporal stage attempt contract exposes Codex cancellation and payload-history guards', () => {
  const input = buildTemporalStageAttemptWorkflowInputForTest({
    ...workflowInput(),
    stage_packet_ref: `packet:${'x'.repeat(140_000)}`,
  });

  const contract = buildTemporalStageAttemptWorkflowContract();
  assert.equal(contract.activity_timeout_policy.codex_stage_activity.cancellation_delivered_by_heartbeat, true);
  assert.equal(contract.payload_history_policy.max_inline_string_bytes, 131_072);
  assert.equal(contract.payload_history_policy.large_payload_storage, 'external_ref_required');
  assert.equal(input.stage_packet_ref, 'payload_ref:sha256:bd0056ae8e68b912');
  assert.equal(input.payload_guard?.truncated_fields[0].field, 'stage_packet_ref');
  assert.equal(input.payload_guard?.policy.large_payload_storage, 'external_ref_required');
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
    assert.deepEqual(result.closeout_refs, [
      'opl://stage-attempts/sat_temporal_test/runtime-blockers/codex_cli_unsupported_function_call',
    ]);
    assert.equal(result.completion_boundary.provider_completion, 'not_completed');
    assert.equal(result.completion_boundary.provider_completion_is_domain_ready, false);
    assert.equal(
      (dispatchEvent?.route_impact as Record<string, unknown>)?.runtime_blocker_is_domain_owner_answer,
      false,
    );
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal Codex activity result stored in history is refs-only by default', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-activity-summary-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities,
    });

    const history = await worker.runUntil(async () => {
      const input = workflowInput();
      const workflowId = `wf-temporal-activity-summary-test-${Date.now()}`;
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{
          ...input,
          closeout_packet: null,
          executor_kind: 'codex_cli',
          codex_stage_runner: {
            runner_mode: 'dry_run',
          },
        }],
        taskQueue,
        workflowId,
      });
      await handle.result();
      return await handle.fetchHistory();
    });

    const activityReceipt = firstActivityResultFromHistory(history);
    assert.equal(activityReceipt.stdout, undefined);
    assert.equal(activityReceipt.stderr, undefined);
    assert.equal(activityReceipt.log_body, undefined);
    assert.equal(activityReceipt.agent_execution_receipt, undefined);
    assert.equal(JSON.stringify(activityReceipt).includes('command_preview'), false);
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal StageAttemptWorkflow stores refs-only Codex activity summaries in workflow state', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-payload-guard-test-${Date.now()}`;
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
          process_output_summary: {
            exit_code: 130,
            final_message_chars: 180_000,
            stderr_tail: ['y'.repeat(4_000)],
            timeout_reason: 'activity_cancelled',
            blocked_reason: 'codex_cli_activity_cancelled',
            recovered_session_path: '/tmp/codex/session.jsonl',
          },
          progress_summary: {
            runner_events: [{
              event_kind: 'agent_message',
              value: 'x'.repeat(4_000),
            }],
          },
          stdout: 'must-not-enter-workflow-history',
          stderr: 'must-not-enter-workflow-history',
          log_body: 'must-not-enter-workflow-history',
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
        workflowId: `wf-temporal-payload-guard-test-${Date.now()}`,
      });
      return await handle.result();
    });

    const codexEvent = result.activity_events.find(
      (event) => event.activity_kind === 'codex_stage_activity' && event.activity_status === 'completed',
    ) as Record<string, any> | undefined;
    assert.ok(codexEvent, 'workflow state must keep a small Codex activity event summary.');
    assert.equal(codexEvent.stdout, undefined);
    assert.equal(codexEvent.stderr, undefined);
    assert.equal(codexEvent.log_body, undefined);
    assert.equal(codexEvent.closeout_packet, undefined);
    assert.equal(codexEvent.process_output_summary.final_message_chars, 180_000);
    assert.deepEqual(codexEvent.process_output_summary.stderr_tail, []);
    assert.equal(codexEvent.process_output_summary.recovered_session_path, '/tmp/codex/session.jsonl');
    assert.deepEqual(codexEvent.progress_summary.runner_events, [{
      event_kind: 'agent_message',
      value: '[omitted:4000 chars]',
    }]);
    assert.equal(codexEvent.provider_blocker.blocked_reason, 'codex_cli_activity_cancelled');
    assert.equal(JSON.stringify(codexEvent).includes('must-not-enter-workflow-history'), false);
    assert.equal(JSON.stringify(codexEvent).includes('xxxx'), false);
    assert.equal(JSON.stringify(codexEvent).includes('yyyy'), false);

    const dispatchEvent = result.activity_events.find(
      (event) => event.activity_kind === 'domain_handler_dispatch_activity',
    );
    assert.equal(dispatchEvent?.activity_status, 'blocked');
    assert.equal(dispatchEvent?.blocked_reason, 'codex_cli_activity_cancelled');
    assert.deepEqual(result.closeout_refs, [
      'opl://stage-attempts/sat_temporal_test/runtime-blockers/codex_cli_activity_cancelled',
    ]);
    assert.equal(result.completion_boundary.provider_completion, 'not_completed');
    assert.equal(result.completion_boundary.provider_completion_is_domain_ready, false);
    assert.equal(
      (dispatchEvent?.route_impact as Record<string, unknown>)?.runtime_blocker_is_domain_owner_answer,
      false,
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
    assert.deepEqual(result.closeout_refs, [
      'opl://stage-attempts/sat_temporal_test/runtime-blockers/typed_closeout_stage_attempt_id_mismatch',
    ]);
    const dispatchEvent = result.activity_events.find(
      (event) => event.activity_kind === 'domain_handler_dispatch_activity',
    );
    assert.equal(dispatchEvent?.activity_status, 'blocked');
    assert.equal(dispatchEvent?.blocked_reason, 'typed_closeout_stage_attempt_id_mismatch');
    assert.equal(
      (dispatchEvent?.route_impact as Record<string, unknown>)?.runtime_blocker_is_domain_owner_answer,
      false,
    );
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal Codex activity compacts typed closeout packets before activity completion', () => {
  const largeCloseout = {
    surface_kind: 'stage_attempt_closeout_packet',
    stage_attempt_id: 'sat_large_temporal_payload',
    idempotency_key: 'idem-large-temporal-payload',
    closeout_refs: ['receipt:large-closeout'],
    consumed_refs: ['paper:draft.md'],
    consumed_memory_refs: ['memory:route-policy'],
    writeback_receipt_refs: ['memory-writeback:receipt-1'],
    rejected_writes: [{ reason: 'domain_truth_write_forbidden', body: 'small ref-only reason' }],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: { next_owner: 'publication_gate' },
    authority_boundary: {
      opl: 'closeout_transport_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
    paper_stage_log: {
      stage_name: 'run_gate_clearing_batch',
      stage_work_done: ['x'.repeat(2_000_000)],
      paper_work_done: ['y'.repeat(2_000_000)],
    },
    user_stage_log: {
      body: 'z'.repeat(2_000_000),
    },
    full_transcript: 'must-not-enter-temporal-completion',
  };

  const compacted = compactCloseoutPacketForTemporalResult(largeCloseout);
  assert.ok(compacted);
  assert.equal(compacted.surface_kind, 'stage_attempt_closeout_packet');
  assert.equal(compacted.stage_attempt_id, 'sat_large_temporal_payload');
  assert.deepEqual(compacted.closeout_refs, ['receipt:large-closeout']);
  assert.deepEqual(compacted.consumed_refs, ['paper:draft.md']);
  assert.deepEqual(compacted.consumed_memory_refs, ['memory:route-policy']);
  assert.deepEqual(compacted.writeback_receipt_refs, ['memory-writeback:receipt-1']);
  assert.deepEqual(compacted.rejected_writes, [{ reason: 'domain_truth_write_forbidden', body: 'small ref-only reason' }]);
  assert.equal(compacted.next_owner, 'med-autoscience');
  assert.equal(compacted.domain_ready_verdict, 'domain_gate_pending');
  assert.deepEqual(compacted.route_impact, { next_owner: 'publication_gate' });
  const compactedRecord = compacted as Record<string, unknown>;
  assert.equal(compactedRecord.paper_stage_log, undefined);
  assert.equal(compactedRecord.user_stage_log, undefined);
  assert.equal(compactedRecord.full_transcript, undefined);
  assert.equal(compacted.temporal_payload_policy.full_closeout_body_omitted, true);
  assert.equal(JSON.stringify(compacted).includes('must-not-enter-temporal-completion'), false);
  assert.ok(
    Buffer.byteLength(JSON.stringify(compacted), 'utf8') < 20_000,
    'Temporal completion payload must stay refs-only and small.',
  );
});
