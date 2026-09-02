import assert from 'node:assert/strict';
import test from 'node:test';

import {
  startTemporalStageRunRecoveryWorkflow,
  startTemporalStageRunWorkflow,
} from '../../src/adapters/execution/family-runtime-temporal-provider.ts';
import { createTemporalTestWorkflowEnvironment } from './temporal-test-environment.ts';
import { stageRunInput } from './family-runtime-stage-run-launch-cases/shared.ts';

test('Temporal recovery creates one new Run for the same StageRun workflow id and replays idempotently', async () => {
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-stage-run-recovery-start-${Date.now()}`;
  const envKeys = [
    'OPL_TEMPORAL_ADDRESS',
    'TEMPORAL_ADDRESS',
    'OPL_TEMPORAL_NAMESPACE',
    'OPL_TEMPORAL_TASK_QUEUE',
    'OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY',
  ];
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  process.env.OPL_TEMPORAL_ADDRESS = testEnv.address;
  delete process.env.TEMPORAL_ADDRESS;
  process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
  process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
  process.env.OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY = '1';
  try {
    const input = stageRunInput({ invocationId: 'sri_temporal_recovery_reuse' });
    const original = await startTemporalStageRunWorkflow(input);
    const originalHandle = testEnv.client.workflow.getHandle(input.workflow_id);
    await originalHandle.terminate('test-close-before-recovery');

    const artifactHash = `sha256:${'a'.repeat(64)}`;
    const recoveryInput = {
      ...input,
      recovery_resume: {
        surface_kind: 'opl_stage_run_recovery_resume' as const,
        version: 'opl-stage-run-recovery-resume.v1' as const,
        recovery_id: 'recovery:temporal-reuse',
        quality_cycle_id: `quality-cycle:${input.stage_run_id}`,
        producer_attempt_ref: 'opl://stage_attempts/sat_temporal_recovered_producer',
        producer_attempt_summary: {
          attempt_role: 'producer' as const,
          quality_round_index: 0,
          stage_attempt_id: 'sat_temporal_recovered_producer',
          workflow_id: 'wf_temporal_recovered_producer',
          execution_session_ref: 'codex://threads/temporal-recovered-producer',
          artifact_producer_attempt_ref: null,
          status: 'completed' as const,
          artifact_refs: ['artifact:temporal-recovered'],
          artifact_hashes: [artifactHash],
          artifact_identity_receipt_refs: ['artifact-identity:temporal-recovered'],
        },
        artifact_refs: ['artifact:temporal-recovered'],
        artifact_hashes: [artifactHash],
        artifact_identity_receipt_refs: ['artifact-identity:temporal-recovered'],
        review_input_snapshot_materialization_request: null,
      },
    };

    const recovered = await startTemporalStageRunRecoveryWorkflow(recoveryInput);
    assert.equal(recovered.workflow_id, input.workflow_id);
    assert.notEqual(recovered.recovery_run_id, original.first_execution_run_id);
    assert.equal(recovered.recovered_existing_execution, false);

    const replay = await startTemporalStageRunRecoveryWorkflow(recoveryInput);
    assert.equal(replay.recovery_run_id, recovered.recovery_run_id);
    assert.equal(replay.recovered_existing_execution, true);

    await testEnv.client.workflow.getHandle(input.workflow_id).terminate('test-terminal-recovery-retry');
    const retried = await startTemporalStageRunRecoveryWorkflow(recoveryInput);
    assert.notEqual(retried.recovery_run_id, recovered.recovery_run_id);
    assert.equal(retried.recovered_existing_execution, false);

    await testEnv.client.workflow.getHandle(input.workflow_id).terminate('test-cleanup');
  } finally {
    for (const key of envKeys) {
      const value = previousEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await testEnv.teardown();
  }
});
