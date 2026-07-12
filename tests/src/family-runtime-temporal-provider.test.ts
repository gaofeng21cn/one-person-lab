import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import './family-runtime-temporal-provider-cases/closeout-payload-compaction.ts';
import './family-runtime-temporal-provider-cases/operator-updates.ts';
import './family-runtime-temporal-provider-cases/scheduler-and-readiness.ts';
import './family-runtime-temporal-provider-cases/codex-activity-history.ts';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import * as activities from '../../src/modules/runway/family-runtime-temporal-activities.ts';
import {
  buildTemporalStageAttemptWorkflowContract,
  type TemporalStageAttemptWorkflowInput,
} from '../../src/modules/runway/family-runtime-temporal.ts';
import {
  DEFAULT_CODEX_STAGE_RUNNER_NO_OUTPUT_TIMEOUT_MS,
  DEFAULT_CODEX_STAGE_RUNNER_TIMEOUT_MS,
} from '../../src/modules/runway/family-runtime-temporal-constants.ts';
import {
  humanGateSignal,
  StageAttemptWorkflow,
  userInstructionSignal,
} from '../../src/modules/runway/family-runtime-temporal-workflows.ts';
import {
  buildTemporalStageAttemptReplayGateForTest,
} from '../../src/modules/runway/family-runtime-temporal-provider.ts';
import {
  buildTemporalStageAttemptSearchAttributes,
  buildTemporalStageAttemptVisibilityReadiness,
} from '../../src/modules/runway/family-runtime-temporal-visibility.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

function workflowInput(): TemporalStageAttemptWorkflowInput {
  return {
    stage_attempt_id: 'sat_temporal_test', workflow_id: 'wf_temporal_test',
    domain_id: 'redcube', stage_id: 'artifact_creation',
    workspace_locator: { workspace_root: '/tmp/redcube-runtime' },
    source_fingerprint: 'sha256:runtime-owner', executor_kind: 'codex_cli',
    retry_budget: { max_attempts: 3 }, task_id: 'task-temporal-owner-test',
    stage_packet_ref: 'packet:artifact-creation', checkpoint_refs: ['checkpoint:artifact-seed'],
    codex_stage_runner: { runner_mode: 'dry_run' },
    closeout_packet: {
      surface_kind: 'stage_memory_closeout_packet', closeout_refs: ['receipt:domain-closeout'],
      consumed_refs: [], consumed_memory_refs: [], writeback_receipt_refs: [], rejected_writes: [],
      next_owner: 'redcube', domain_ready_verdict: 'domain_gate_pending',
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
  assert.equal(contract.activity_timeout_policy.short_stage_activities.retry.maximum_attempts, 3);
  assert.equal(contract.activity_timeout_policy.codex_stage_activity.retry.maximum_attempts, 1);
  assert.equal(contract.operator_action_updates[0], 'StageAttemptOperatorUpdate');
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
  assert.equal(blocked.repair_action?.action_id, 'install_temporal_stage_attempt_search_attributes');
  assert.equal(ready.readiness_status, 'ready');
  assert.deepEqual(ready.missing_search_attributes, []);
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
  assert.equal(Object.values(attributes).every(Array.isArray), true);
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
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
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
            next_owner: 'redcube',
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

test('Temporal StageAttemptWorkflow blocks provider completion when typed closeout is missing', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-blocked-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
      activities,
    });
    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{ ...workflowInput(), closeout_packet: null }],
        taskQueue,
        workflowId: `wf-temporal-blocked-test-${Date.now()}`,
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
    assert.equal(dispatchEvent?.blocked_reason, 'zero_readable_artifact');
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
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
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
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{ ...workflowInput(), closeout_packet: null }],
        taskQueue,
        workflowId: `wf-temporal-runner-blocker-test-${Date.now()}`,
      });
      return await handle.result();
    });

    const dispatchEvent = result.activity_events.find(
      (event) => event.activity_kind === 'domain_handler_dispatch_activity',
    );
    assert.equal(result.status, 'blocked');
    assert.equal(dispatchEvent?.blocked_reason, 'codex_cli_unsupported_function_call');
    assert.deepEqual(result.closeout_refs, [
      'opl://stage-attempts/sat_temporal_test/runtime-blockers/codex_cli_unsupported_function_call',
    ]);
    assert.equal(result.completion_boundary.provider_completion_is_domain_ready, false);
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
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
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
            consumed_refs: ['artifact:draft'],
            next_owner: 'redcube',
            domain_ready_verdict: 'domain_gate_pending',
          },
        }),
      },
    });
    const result = await worker.runUntil(async () => {
      const handle = await testEnv.client.workflow.start(StageAttemptWorkflow, {
        args: [{ ...workflowInput(), closeout_packet: null }],
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
    assert.equal(dispatchEvent?.blocked_reason, 'typed_closeout_stage_attempt_id_mismatch');
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal replay gate accepts production workflow history', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-replay-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection, namespace: testEnv.namespace, taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
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
        signal_kind: 'human_gate', payload: { human_gate_ref: 'gate:replay', reason: 'replay_history' }, source: 'test',
      });
      await handle.signal(userInstructionSignal, {
        signal_kind: 'user_instruction', payload: { instruction_ref: 'user:replay' }, source: 'test',
      });
      await handle.result();
      return await handle.fetchHistory();
    });

    const gate = await buildTemporalStageAttemptReplayGateForTest(history, workflowId);
    assert.equal(gate.replay_status, 'passed');
    assert.equal(gate.workflow_id, workflowId);
    assert.ok(gate.worker_options.workflowBundle && 'codePath' in gate.worker_options.workflowBundle);
    assert.equal('workflowsPath' in gate.worker_options, false);
  } finally {
    await testEnv.teardown();
  }
});
