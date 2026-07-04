import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import * as activities from '../../../src/modules/runway/family-runtime-temporal-activities.ts';
import {
  type TemporalStageAttemptWorkflowInput,
  type TemporalStageAttemptWorkflowState,
} from '../../../src/modules/runway/family-runtime-temporal.ts';
import {
  stageAttemptQuery,
  StageAttemptWorkflow,
  stageAttemptOperatorUpdate,
} from '../../../src/modules/runway/family-runtime-temporal-workflows.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..', '..');

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
    retry_budget: {},
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

test('Temporal StageAttemptWorkflow acks operator actions through Updates', async () => {
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-attempt-update-test-${Date.now()}`;
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
      workflowsPath: path.join(repoRoot, 'src', 'modules', 'runway', 'family-runtime-temporal-workflows.ts'),
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
