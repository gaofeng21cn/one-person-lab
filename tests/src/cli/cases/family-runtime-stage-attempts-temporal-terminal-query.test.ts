import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import { ServiceError } from '@temporalio/client';
import { DatabaseSync } from 'node:sqlite';

import * as activities from '../../../../src/modules/runway/family-runtime-temporal-activities.ts';
import { buildTemporalStageAttemptWorkflowInputForTest } from '../../../../src/modules/runway/family-runtime-temporal-provider.ts';
import { queryTemporalStageAttemptReadModel } from '../../../../src/modules/runway/family-runtime-temporal-query.ts';
import { createStageAttempt, ingestStageAttemptCloseout } from '../../../../src/modules/runway/family-runtime-stage-attempts.ts';
import { enqueueTask } from '../../../../src/modules/runway/family-runtime-enqueue.ts';
import { openQueueDb } from '../../../../src/modules/runway/family-runtime-store.ts';
import type {
  TemporalStageAttemptWorkflowInput,
  TemporalStageAttemptWorkflowState,
} from '../../../../src/modules/runway/family-runtime-temporal.ts';
import { runFamilyRuntime } from '../../../../src/modules/runway/family-runtime.ts';
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

async function withEnv<T>(updates: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(Object.keys(updates).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(updates)) {
      process.env[key] = value;
    }
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}

type TemporalStageAttemptQueryOutput = {
  family_runtime_stage_attempt_query: {
    stage_attempt_query: {
      attempt: {
        status: string;
        blocked_reason: string | null;
        provider_run: Record<string, unknown>;
        closeout_refs?: string[];
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
      query_source?: string;
      query_error?: {
        code?: string;
      };
    };
  };
};

test('family-runtime temporal terminal failure syncs even when terminal workflow query is unavailable', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-failed-query-unavailable-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-query-failed-unavailable-${Date.now()}`;
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
      source_version: 'git:query-failed-unavailable-current',
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
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:query-failed-unavailable-current';

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
      'checkpoint:failed-query-unavailable',
    ]) as TemporalStageAttemptCreateOutput;
    const attempt = created.family_runtime_stage_attempt.attempt;

    await worker.runUntil(async () => {
      const input = buildTemporalStageAttemptWorkflowInputForTest({
        ...attempt,
        task_id: attempt.task_id ?? 'task-failed-query-unavailable',
        stage_packet_ref: 'packet:failed-query-unavailable',
        checkpoint_refs: ['checkpoint:failed-query-unavailable'],
      });
      const handle = await testEnv.client.workflow.start('StageAttemptWorkflow', {
        args: [input],
        taskQueue,
        workflowId: attempt.workflow_id,
      });
      await assert.rejects(handle.result(), /Workflow execution failed/);
    });

    const result = await runFamilyRuntime(['attempt', 'query', attempt.stage_attempt_id]) as TemporalStageAttemptQueryOutput;
    const stageQuery = result.family_runtime_stage_attempt_query.stage_attempt_query;
    const temporalQuery = result.family_runtime_stage_attempt_query.temporal_query;
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
    assert.equal(terminalObservation.reason, 'temporal_workflow_failed');
    assert.equal(stageQuery.completion_boundary.provider_completion_is_domain_ready, false);
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

test('family-runtime temporal query classifies post-describe query failures as worker query unavailable', async () => {
  const attempt = {
    provider_kind: 'temporal',
    stage_attempt_id: 'sat-worker-query-unavailable',
    workflow_id: 'wf-worker-query-unavailable',
  } as Parameters<typeof queryTemporalStageAttemptReadModel>[0];

  const result = await queryTemporalStageAttemptReadModel(attempt, {
    queryTemporalStageAttemptWorkflow: async () => {
      const error = new ServiceError('Failed to query Workflow');
      Object.assign(error, {
        temporal_query_phase: 'workflow_query',
        workflow_status: 'RUNNING',
        run_id: 'run-worker-query-unavailable',
      });
      throw error;
    },
  });

  assert.ok(result);
  assert.equal(result.surface_kind, 'temporal_stage_attempt_query_unavailable');
  assert.equal('reason' in result, true);
  assert.equal('error' in result, true);
  assert.equal('workflow_status' in result, true);
  assert.equal('run_id' in result, true);
  if (!('reason' in result) || !('error' in result) || !('workflow_status' in result) || !('run_id' in result)) {
    throw new Error('expected temporal unavailable query projection');
  }
  assert.equal(result.reason, 'temporal_stage_attempt_query_unavailable');
  assert.equal(result.error.code, 'temporal_stage_attempt_query_unavailable');
  assert.equal(result.workflow_status, 'RUNNING');
  assert.equal(result.run_id, 'run-worker-query-unavailable');
});

test('family-runtime temporal read-model query is bounded when provider query hangs', async () => {
  const attempt = {
    provider_kind: 'temporal',
    stage_attempt_id: 'sat-provider-query-timeout',
    workflow_id: 'wf-provider-query-timeout',
  } as Parameters<typeof queryTemporalStageAttemptReadModel>[0];

  const startedAt = Date.now();
  const result = await withEnv({ OPL_TEMPORAL_STAGE_ATTEMPT_QUERY_TIMEOUT_MS: '20' }, async () =>
    await queryTemporalStageAttemptReadModel(attempt, {
      queryTemporalStageAttemptWorkflow: async () => await new Promise(() => {}),
    })
  );

  assert.ok(result);
  assert.equal(result.surface_kind, 'temporal_stage_attempt_query_unavailable');
  assert.equal('reason' in result, true);
  assert.equal('error' in result, true);
  if (!('reason' in result) || !('error' in result)) {
    throw new Error('expected temporal query timeout projection');
  }
  assert.equal(result.reason, 'temporal_stage_attempt_query_timeout');
  assert.equal(result.error.code, 'temporal_stage_attempt_query_timeout');
  assert.equal((result.error as Record<string, unknown>).timeout_ms, 20);
  assert.equal(Date.now() - startedAt < 1_000, true);
});

test('family-runtime queue inspect skips Temporal replay for completed typed closeout attempts', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-queue-inspect-completed-no-replay-'));
  let db: DatabaseSync | null = null;
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_STAGE_ATTEMPT_QUERY_TIMEOUT_MS: process.env.OPL_TEMPORAL_STAGE_ATTEMPT_QUERY_TIMEOUT_MS,
  };

  try {
    fs.mkdirSync(stateRoot, { recursive: true });
    process.env.OPL_STATE_DIR = stateRoot;
    db = openQueueDb().db;
    const enqueue = enqueueTask(db, {
      domainId: 'medautoscience',
      taskKind: 'domain_owner/default-executor-dispatch',
      payload: {
        study_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_ref: 'studies/002-dm/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
      },
      dedupeKey: 'mas:dm002:completed:no-replay',
    });
    if (!enqueue.task) {
      throw new Error('expected queued task for completed no-replay fixture');
    }
    const taskId = enqueue.task.task_id;
    const created = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'domain_owner/default-executor-dispatch',
      providerKind: 'temporal',
      workspaceLocator: {
        workspace_root: '/tmp/dm-cvd',
        dispatch_ref: 'studies/002-dm/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
      },
      sourceFingerprint: 'completed-no-replay',
      executorKind: 'codex_cli',
      taskId,
    });
    const closeoutRef = 'studies/002-dm/artifacts/supervision/consumer/default_executor_execution/latest.json';
    ingestStageAttemptCloseout(db, {
      stageAttemptId: created.attempt.stage_attempt_id,
      packet: {
        surface_kind: 'domain_stage_closeout_packet',
        closeout_refs: [closeoutRef],
        consumed_refs: ['dispatch:completed-no-replay'],
        writeback_receipt_refs: ['receipt:completed-no-replay'],
        next_owner: 'medautoscience',
        domain_ready_verdict: 'domain_gate_pending',
      },
    });
    db.prepare(`
      UPDATE tasks
      SET status = 'succeeded', last_error = NULL, dead_letter_reason = NULL
      WHERE task_id = ?
    `).run(taskId);
    process.env.OPL_TEMPORAL_ADDRESS = '127.0.0.1:1';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_STAGE_ATTEMPT_QUERY_TIMEOUT_MS = '20';

    const result = await runFamilyRuntime(['queue', 'inspect', taskId]) as {
      family_runtime_task: {
        task: { status: string };
        stage_attempts: Array<{
          status: string;
          closeout_refs: string[];
          closeout_receipt_status: string | null;
          provider_run: Record<string, unknown>;
        }>;
      };
    };

    const attempt = result.family_runtime_task.stage_attempts[0];
    assert.equal(result.family_runtime_task.task.status, 'succeeded');
    assert.equal(attempt.status, 'completed');
    assert.equal(attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.deepEqual(attempt.closeout_refs, [closeoutRef]);
    assert.equal('terminal_observation' in attempt.provider_run, false);
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (typeof value === 'string') {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
    db?.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal completed workflow syncs from result when query replay is nondeterministic', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-completed-result-sync-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-query-completed-legacy-${Date.now()}`;
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
      source_version: 'git:completed-result-sync-current',
    }, null, 2)}\n`);

    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_TEMPORAL_ADDRESS = '';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
    process.env.OPL_TEMPORAL_WORKER_STATUS = '';
    process.env.OPL_TEMPORAL_WORKER_ENABLED = '';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:completed-result-sync-current';

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
      'checkpoint:completed-result-sync',
    ]) as TemporalStageAttemptCreateOutput;
    const attempt = created.family_runtime_stage_attempt.attempt;

    const legacyWorker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'tests', 'src', 'cli', 'cases', 'fixtures', 'legacy-domain-sidecar-workflows.ts'),
      activities: {
        codexStageActivity: async () => ({
          checkpoint_refs: ['checkpoint:completed-result-sync'],
          closeout_packet: {
            surface_kind: 'stage_attempt_closeout_packet',
            closeout_refs: ['closeout:completed-result-sync'],
          },
        }),
        domainSidecarDispatchActivity: async () => ({
          surface_kind: 'temporal_domain_sidecar_dispatch_receipt',
          closeout_packet_surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: ['closeout:completed-result-sync'],
          consumed_refs: ['checkpoint:completed-result-sync'],
          consumed_memory_refs: [],
          writeback_receipt_refs: ['receipt:completed-result-sync'],
          rejected_writes: [],
          next_owner: 'medautoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: {},
        }),
      },
    });

    await legacyWorker.runUntil(async () => {
      const input = buildTemporalStageAttemptWorkflowInputForTest({
        ...attempt,
        task_id: attempt.task_id ?? 'task-completed-result-sync',
        stage_packet_ref: 'packet:completed-result-sync',
        checkpoint_refs: ['checkpoint:completed-result-sync'],
      });
      const handle = await testEnv.client.workflow.start('StageAttemptWorkflow', {
        args: [input],
        taskQueue,
        workflowId: attempt.workflow_id,
      });
      await handle.result();
    });

    const currentWorker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities,
    });
    const result = await currentWorker.runUntil(
      async () => await runFamilyRuntime(['attempt', 'query', attempt.stage_attempt_id]) as TemporalStageAttemptQueryOutput,
    );
    const stageQuery = result.family_runtime_stage_attempt_query.stage_attempt_query;
    const temporalQuery = result.family_runtime_stage_attempt_query.temporal_query;

    assert.equal(temporalQuery.surface_kind, 'temporal_stage_attempt_query_receipt');
    assert.equal(temporalQuery.workflow_status, 'COMPLETED');
    assert.equal(temporalQuery.query_source, 'workflow_result_after_terminal_completed');
    assert.equal(temporalQuery.query?.status, 'completed');
    assert.equal(stageQuery.attempt.status, 'completed');
    assert.equal(stageQuery.operator_visibility.status, 'completed');
    assert.equal(stageQuery.attempt.provider_run.provider_status, 'completed');
    assert.deepEqual(stageQuery.attempt.closeout_refs, ['closeout:completed-result-sync']);
    assert.equal(stageQuery.completion_boundary.provider_completion_is_domain_ready, false);
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
