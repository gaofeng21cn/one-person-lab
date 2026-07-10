import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    stage_attempt_id: 'sat_temporal_test',
    workflow_id: 'wf_temporal_test',
    domain_id: 'medautoscience',
    stage_id: 'analysis-campaign',
    workspace_locator: { workspace_root: '/tmp/mas' },
    source_fingerprint: 'sha256:test',
    executor_kind: 'codex_cli',
    retry_budget: { max_attempts: 3 },
    task_id: 'task-temporal-test',
    stage_packet_ref: 'packet:analysis',
    checkpoint_refs: ['checkpoint:seed'],
    codex_stage_runner: { runner_mode: 'dry_run' },
    closeout_packet: {
      surface_kind: 'stage_memory_closeout_packet',
      closeout_refs: ['receipt:domain-closeout'],
      consumed_refs: [],
      consumed_memory_refs: [],
      writeback_receipt_refs: [],
      rejected_writes: [],
      next_owner: 'med-autoscience',
      domain_ready_verdict: 'domain_gate_pending',
    },
  };
}

test('Temporal provider contract maps activity budgets and required Search Attributes', () => {
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
  assert.ok(contract.required_search_attributes.includes('OplStageAttemptId'));
  assert.ok(contract.required_search_attributes.includes('OplSourceFingerprint'));
});

test('Temporal visibility readiness fails closed until required Search Attributes exist', () => {
  const contract = buildTemporalStageAttemptWorkflowContract();
  const blocked = buildTemporalStageAttemptVisibilityReadiness({
    namespace: 'opl-test',
    observedCustomAttributes: { OplStageAttemptId: 'Keyword' },
  });
  const ready = buildTemporalStageAttemptVisibilityReadiness({
    namespace: 'opl-test',
    observedCustomAttributes: Object.fromEntries(
      contract.required_search_attributes.map((name) => [name, 'Keyword']),
    ),
  });

  assert.equal(blocked.readiness_status, 'missing_search_attributes');
  assert.ok(blocked.missing_search_attributes.length > 0);
  assert.equal(blocked.repair_action?.action_id, 'install_temporal_stage_attempt_search_attributes');
  assert.equal(ready.readiness_status, 'ready');
});

test('Temporal workflow start maps optional Search Attributes to arrays', () => {
  const attributes = buildTemporalStageAttemptSearchAttributes({
    ...workflowInput(),
    source_fingerprint: null,
    task_id: null,
    provider_blocker: null,
  });

  assert.deepEqual(attributes.OplTaskId, []);
  assert.deepEqual(attributes.OplSourceFingerprint, []);
  assert.equal(Object.values(attributes).every(Array.isArray), true);
});

test('Temporal integration retries short activities without replaying Codex', async () => {
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
            next_owner: 'med-autoscience',
            domain_ready_verdict: 'domain_gate_pending',
            route_impact: {},
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
  } finally {
    await testEnv.teardown();
  }
});

test('Temporal replay gate accepts production workflow history', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-replay-test-${Date.now()}`;
  try {
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
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
        signal_kind: 'human_gate',
        payload: { human_gate_ref: 'gate:replay', reason: 'replay_history' },
        source: 'test',
      });
      await handle.signal(userInstructionSignal, {
        signal_kind: 'user_instruction',
        payload: { instruction_ref: 'user:replay' },
        source: 'test',
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
