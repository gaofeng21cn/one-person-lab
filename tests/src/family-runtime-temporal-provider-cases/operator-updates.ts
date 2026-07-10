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
    stage_attempt_id: 'sat_temporal_update',
    workflow_id: 'wf_temporal_update',
    domain_id: 'redcube',
    stage_id: 'artifact_creation',
    workspace_locator: { workspace_root: '/tmp/redcube-runtime' },
    source_fingerprint: 'sha256:operator-update',
    executor_kind: 'codex_cli',
    retry_budget: {},
    task_id: 'task-temporal-update',
    stage_packet_ref: 'packet:artifact-creation',
    checkpoint_refs: ['checkpoint:seed'],
    codex_stage_runner: { runner_mode: 'dry_run' },
    closeout_packet: {
      surface_kind: 'stage_memory_closeout_packet',
      closeout_refs: ['receipt:domain-closeout'],
      next_owner: 'redcube',
      domain_ready_verdict: 'domain_gate_pending',
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
      const ack = await handle.executeUpdate(stageAttemptOperatorUpdate, {
        args: [{
          signal_kind: 'human_gate',
          payload: { human_gate_ref: 'gate:update-review', reason: 'needs_review' },
          source: 'test-update',
        }],
      });
      return { ack, finalState: await handle.result() };
    });

    assert.equal(result.ack.update_status, 'accepted');
    assert.equal(result.ack.signal_kind, 'human_gate');
    assert.equal(result.ack.signal_count, 1);
    assert.deepEqual(result.finalState.human_gate_refs, ['gate:update-review']);
    assert.equal(result.finalState.signals[0].source, 'test-update');
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
          args: [{ signal_kind: 'human_gate', payload: { reason: 'missing_ref' }, source: 'test-update' }],
        }),
        (error) => error instanceof Error
          && error.name === 'WorkflowUpdateFailedError'
          && error.cause instanceof Error
          && /human_gate update requires payload\.human_gate_ref/.test(error.cause.message),
      );
      const queriedState = await handle.query<TemporalStageAttemptWorkflowState>(stageAttemptQuery);
      return { queriedState, finalState: await handle.result() };
    });

    assert.equal(result.queriedState.signals.length, 0);
    assert.equal(result.finalState.signals.length, 0);
    assert.deepEqual(result.finalState.human_gate_refs, []);
  } finally {
    await testEnv.teardown();
  }
});
