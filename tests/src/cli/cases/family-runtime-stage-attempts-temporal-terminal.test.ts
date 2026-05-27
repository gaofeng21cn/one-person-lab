import { SearchAttributeType } from '@temporalio/common';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';

import * as activities from '../../../../src/family-runtime-temporal-activities.ts';
import {
  buildTemporalStageAttemptWorkflowInputForTest,
} from '../../../../src/family-runtime-temporal-provider.ts';
import type {
  TemporalStageAttemptWorkflowInput,
  TemporalStageAttemptWorkflowState,
} from '../../../../src/family-runtime-temporal.ts';
import { runFamilyRuntime } from '../../../../src/family-runtime.ts';
import {
  assert,
  fs,
  os,
  path,
  repoRoot,
  test,
} from '../helpers.ts';

type TemporalStageAttemptCreateOutput = {
  family_runtime_stage_attempt: {
    attempt: TemporalStageAttemptWorkflowInput;
  };
};

type TemporalStageAttemptQueryOutput = {
  family_runtime_stage_attempt_query: {
    stage_attempt_query: {
      attempt: {
        status: string;
        blocked_reason: string | null;
        provider_run: Record<string, unknown>;
      };
      operator_visibility: {
        status: string;
      };
      completion_boundary: {
        provider_completion_is_domain_ready: boolean;
      };
    };
    temporal_query: {
      surface_kind: 'temporal_stage_attempt_query_receipt';
      workflow_status?: string;
      query?: TemporalStageAttemptWorkflowState;
      query_error?: {
        code?: string;
      };
    };
  };
};

type TemporalStageAttemptInspectOutput = {
  family_runtime_stage_attempt: {
    attempt: {
      status: string;
      provider_run: Record<string, unknown>;
    };
    temporal_query: TemporalStageAttemptQueryOutput['family_runtime_stage_attempt_query']['temporal_query'];
  };
};

function createSearchableTemporalTestEnvironment() {
  return TestWorkflowEnvironment.createLocal({
    server: {
      searchAttributes: [
        { name: 'OplStageAttemptId', type: SearchAttributeType.KEYWORD },
        { name: 'OplDomainId', type: SearchAttributeType.KEYWORD },
        { name: 'OplStageId', type: SearchAttributeType.KEYWORD },
        { name: 'OplAttemptStatus', type: SearchAttributeType.KEYWORD },
        { name: 'OplStagePhase', type: SearchAttributeType.KEYWORD },
        { name: 'OplBlockedReason', type: SearchAttributeType.KEYWORD },
        { name: 'OplTaskId', type: SearchAttributeType.KEYWORD },
        { name: 'OplSourceFingerprint', type: SearchAttributeType.KEYWORD },
        { name: 'OplExecutorKind', type: SearchAttributeType.KEYWORD },
      ],
    },
  });
}

test('family-runtime temporal terminal failure is projected into local attempt query and inspect', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-failed-projection-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await createSearchableTemporalTestEnvironment();
  const taskQueue = `opl-stage-query-failed-${Date.now()}`;
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    OPL_TEMPORAL_TASK_QUEUE: process.env.OPL_TEMPORAL_TASK_QUEUE,
    OPL_TEMPORAL_WORKER_STATUS: process.env.OPL_TEMPORAL_WORKER_STATUS,
    OPL_TEMPORAL_WORKER_ENABLED: process.env.OPL_TEMPORAL_WORKER_ENABLED,
    OPL_TEMPORAL_WORKER_SOURCE_VERSION: process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION,
  };

  try {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: process.pid,
      address: testEnv.address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'temporal test server',
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: process.pid,
      address: testEnv.address,
      namespace: testEnv.namespace,
      task_queue: taskQueue,
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:query-failed-current',
    }, null, 2)}\n`);

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async () => {
          throw new Error('Activity task timed out');
        },
      },
    });
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_TEMPORAL_ADDRESS = '';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
    process.env.OPL_TEMPORAL_WORKER_STATUS = '';
    process.env.OPL_TEMPORAL_WORKER_ENABLED = '';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:query-failed-current';
    const created = await runFamilyRuntime([
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/dm-cvd"}',
      '--checkpoint-ref',
      'checkpoint:failed-query',
    ]) as TemporalStageAttemptCreateOutput;
    const attempt = created.family_runtime_stage_attempt.attempt;

    const result = await worker.runUntil(async () => {
      const input = buildTemporalStageAttemptWorkflowInputForTest({
        ...attempt,
        task_id: attempt.task_id ?? 'task-failed-query',
        stage_packet_ref: 'packet:failed-query',
        checkpoint_refs: ['checkpoint:failed-query'],
      });
      const handle = await testEnv.client.workflow.start('StageAttemptWorkflow', {
        args: [input],
        taskQueue,
        workflowId: attempt.workflow_id,
      });
      await assert.rejects(handle.result(), /Workflow execution failed/);
      const query = await runFamilyRuntime(['attempt', 'query', attempt.stage_attempt_id]) as TemporalStageAttemptQueryOutput;
      const inspect = await runFamilyRuntime(['attempt', 'inspect', attempt.stage_attempt_id]) as TemporalStageAttemptInspectOutput;
      return { query, inspect };
    });

    const stageQuery = result.query.family_runtime_stage_attempt_query.stage_attempt_query;
    const temporalQuery = result.query.family_runtime_stage_attempt_query.temporal_query;
    const terminalObservation = stageQuery.attempt.provider_run.terminal_observation as Record<string, unknown>;

    assert.equal(temporalQuery.surface_kind, 'temporal_stage_attempt_query_receipt');
    assert.equal(temporalQuery.workflow_status, 'FAILED');
    assert.equal(temporalQuery.query, undefined);
    assert.equal(temporalQuery.query_error?.code, 'temporal_stage_attempt_query_unavailable_after_terminal');
    assert.equal(stageQuery.attempt.status, 'failed');
    assert.equal(stageQuery.operator_visibility.status, 'failed');
    assert.equal(stageQuery.attempt.blocked_reason, 'temporal_workflow_failed');
    assert.equal(stageQuery.attempt.provider_run.provider_status, 'failed');
    assert.equal(terminalObservation.workflow_status, 'FAILED');
    assert.equal(terminalObservation.query_status, null);
    assert.equal(stageQuery.completion_boundary.provider_completion_is_domain_ready, false);
    assert.equal(result.inspect.family_runtime_stage_attempt.attempt.status, 'failed');
    assert.equal(result.inspect.family_runtime_stage_attempt.attempt.provider_run.provider_status, 'failed');
    assert.equal(result.inspect.family_runtime_stage_attempt.temporal_query.workflow_status, 'FAILED');
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
