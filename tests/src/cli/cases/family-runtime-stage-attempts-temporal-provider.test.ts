import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

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
import { buildTemporalStageAttemptWorkflowInput } from '../../../../src/family-runtime-temporal.ts';
import { runFamilyRuntime } from '../../../../src/family-runtime.ts';
import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

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
        provider_run: Record<string, unknown>;
      };
      completion_boundary: {
        provider_completion_is_domain_ready: boolean;
      };
    };
    temporal_query: {
      surface_kind: 'temporal_stage_attempt_query_receipt';
      stage_attempt_id: string;
      workflow_id: string;
      workflow_status?: string;
      query: TemporalStageAttemptWorkflowState;
    };
  };
};

type TemporalStageAttemptInspectOutput = {
  family_runtime_stage_attempt: {
    attempt: {
      status: string;
      blocked_reason: string | null;
      provider_run: Record<string, unknown>;
    };
    temporal_query: TemporalStageAttemptQueryOutput['family_runtime_stage_attempt_query']['temporal_query'];
  };
};

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime temporal attempt start fails closed when Temporal address is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-start-missing-'));
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'scout',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--checkpoint-ref',
      'packet:scout',
      '--start',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_STATE_DIR: stateRoot,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);
    const attempts = runCli(['family-runtime', 'attempt', 'list'], familyRuntimeEnv(stateRoot));

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.match(output.error.message, /OPL_TEMPORAL_ADDRESS/);
    assert.equal(attempts.family_runtime_stage_attempts.summary.total, 1);
    assert.equal(attempts.family_runtime_stage_attempts.attempts[0].provider_kind, 'temporal');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal workflow input carries checkpoint stage packet and live Codex runner mode', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-input-'));
  try {
    const created = runCli([
      'family-runtime',
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
      '--executor-kind',
      'codex_cli',
      '--checkpoint-ref',
      'studies/002-dm/prompt.json',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;
    const input = buildTemporalStageAttemptWorkflowInput(created.family_runtime_stage_attempt.attempt);

    assert.equal(input.stage_packet_ref, 'studies/002-dm/prompt.json');
    assert.deepEqual(input.checkpoint_refs, ['studies/002-dm/prompt.json']);
    assert.equal(input.codex_stage_runner?.runner_mode, 'codex_cli');
    assert.equal(input.codex_stage_runner?.timeout_ms, 3_600_000);
    assert.equal(input.workspace_locator.workspace_root, '/tmp/dm-cvd');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime tick starts MAS default executor dispatch as Temporal Codex writer workflow', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-default-start-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-mas-default-${Date.now()}`;
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    OPL_TEMPORAL_TASK_QUEUE: process.env.OPL_TEMPORAL_TASK_QUEUE,
    OPL_TEMPORAL_WORKER_STATUS: process.env.OPL_TEMPORAL_WORKER_STATUS,
    OPL_TEMPORAL_WORKER_ENABLED: process.env.OPL_TEMPORAL_WORKER_ENABLED,
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
    }, null, 2)}\n`);
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async () => ({
          status: 'checkpointed',
          checkpoint_refs: ['checkpoint:mas-default-writer-start'],
        }),
      },
    });
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
    process.env.OPL_TEMPORAL_ADDRESS = '';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
    process.env.OPL_TEMPORAL_WORKER_STATUS = '';
    process.env.OPL_TEMPORAL_WORKER_ENABLED = '';

    const dispatchRef = 'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const enqueue = await runFamilyRuntime([
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        authority_boundary: 'mas_default_executor_dispatch_request_only',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:temporal-start',
    ]) as { family_runtime_enqueue: { task: { task_id: string } } };
    const taskId = enqueue.family_runtime_enqueue.task.task_id;

    const result = await worker.runUntil(async () => {
      const result = await runFamilyRuntime(['tick', '--source', 'test']) as {
        family_runtime_tick: {
          dispatches: Array<{
            status: string;
            temporal_start: { surface_kind: string };
            admitted_stage_attempt: { workflow_id: string; stage_attempt_id: string };
          }>;
        };
      };
      const startedAttempt = result.family_runtime_tick.dispatches[0].admitted_stage_attempt;
      await testEnv.sleep('2s');
      assert.ok(startedAttempt.stage_attempt_id);
      const task = await runFamilyRuntime(['queue', 'inspect', taskId]) as unknown as {
        family_runtime_task: {
          task: {
            status: string;
            last_error: string | null;
            dead_letter_reason: string | null;
          };
          events: Array<{
            event_type: string;
            payload: Record<string, unknown>;
          }>;
          stage_attempts: Array<{
            status: string;
            blocked_reason: string | null;
            provider_kind: string;
            executor_kind: string;
            stage_id: string;
            provider_run: { provider_status: string };
            closeout_receipt_status: string;
            checkpoint_refs: string[];
          }>;
        };
      };
      return { tick: result, task };
    });
    const { tick, task } = result;
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(tick.family_runtime_tick.dispatches[0].temporal_start.surface_kind, 'temporal_stage_attempt_start_receipt');
    assert.equal(task.family_runtime_task.task.status, 'blocked');
    assert.equal(task.family_runtime_task.task.last_error, 'typed_closeout_packet_required');
    assert.equal(task.family_runtime_task.task.dead_letter_reason, 'temporal_stage_attempt_not_completed');
    assert.equal(
      task.family_runtime_task.events.some((event) => (
        event.event_type === 'stage_attempt_terminal_blocked_task'
        && event.payload.reason === 'typed_closeout_packet_required'
      )),
      true,
    );
    assert.equal(attempt.status, 'blocked');
    assert.equal(attempt.blocked_reason, 'typed_closeout_packet_required');
    assert.equal(attempt.provider_kind, 'temporal');
    assert.equal(attempt.executor_kind, 'codex_cli');
    assert.equal(attempt.stage_id, 'domain_owner/default-executor-dispatch');
    assert.equal(attempt.provider_run.provider_status, 'blocked');
    assert.equal(attempt.closeout_receipt_status, null);
    assert.deepEqual(attempt.checkpoint_refs, [dispatchRef]);
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

test('family-runtime queue inspect syncs a completed MAS default executor Temporal closeout', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-mas-default-completed-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-mas-default-completed-${Date.now()}`;
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_FAMILY_RUNTIME_PROVIDER: process.env.OPL_FAMILY_RUNTIME_PROVIDER,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    OPL_TEMPORAL_TASK_QUEUE: process.env.OPL_TEMPORAL_TASK_QUEUE,
    OPL_TEMPORAL_WORKER_STATUS: process.env.OPL_TEMPORAL_WORKER_STATUS,
    OPL_TEMPORAL_WORKER_ENABLED: process.env.OPL_TEMPORAL_WORKER_ENABLED,
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
    }, null, 2)}\n`);
    const closeoutRefs = [
      'artifacts/supervision/reconcile/latest.json',
      'studies/002-dm/artifacts/controller/repair_execution_evidence/latest.json',
    ];
    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities: {
        ...activities,
        codexStageActivity: async () => ({
          status: 'checkpointed',
          checkpoint_refs: ['checkpoint:mas-default-writer-start'],
          closeout_packet: {
            surface_kind: 'domain_stage_closeout_packet',
            closeout_refs: closeoutRefs,
            consumed_refs: ['dispatch:mas-default-writer-start'],
            writeback_receipt_refs: ['receipt:writer-handoff'],
            next_owner: 'medautoscience',
            domain_ready_verdict: 'domain_gate_pending',
          },
        }),
      },
    });
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_FAMILY_RUNTIME_PROVIDER = 'temporal';
    process.env.OPL_TEMPORAL_ADDRESS = '';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
    process.env.OPL_TEMPORAL_WORKER_STATUS = '';
    process.env.OPL_TEMPORAL_WORKER_ENABLED = '';

    const dispatchRef = 'studies/002-dm/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json';
    const enqueue = await runFamilyRuntime([
      'enqueue',
      '--domain',
      'medautoscience',
      '--task-kind',
      'domain_owner/default-executor-dispatch',
      '--payload',
      JSON.stringify({
        profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
        study_id: '002-dm-china-us-mortality-attribution',
        quest_id: '002-dm-china-us-mortality-attribution',
        action_type: 'run_quality_repair_batch',
        dispatch_authority: 'quality_repair_batch_writer_handoff',
        next_executable_owner: 'write',
        executor_kind: 'codex_cli_default',
        dispatch_ref: dispatchRef,
        authority_boundary: 'mas_default_executor_dispatch_request_only',
      }),
      '--dedupe-key',
      'mas:dm-cvd:002:default-executor:run_quality_repair_batch:completed',
    ]) as { family_runtime_enqueue: { task: { task_id: string } } };
    const taskId = enqueue.family_runtime_enqueue.task.task_id;

    const result = await worker.runUntil(async () => {
      const result = await runFamilyRuntime(['tick', '--source', 'test']) as {
        family_runtime_tick: {
          dispatches: Array<{
            status: string;
            temporal_start: { surface_kind: string };
            admitted_stage_attempt: { stage_attempt_id: string };
          }>;
        };
      };
      await testEnv.sleep('2s');
      const task = await runFamilyRuntime(['queue', 'inspect', taskId]) as unknown as {
        family_runtime_task: {
          task: {
            status: string;
            last_error: string | null;
            dead_letter_reason: string | null;
          };
          stage_attempts: Array<{
            status: string;
            closeout_refs: string[];
            closeout_receipt_status: string;
            provider_run: { provider_status: string };
            route_impact: { domain_ready_verdict?: string };
          }>;
        };
      };
      return { tick: result, task };
    });
    const { tick, task } = result;
    const attempt = task.family_runtime_task.stage_attempts[0];

    assert.equal(tick.family_runtime_tick.dispatches[0].status, 'succeeded');
    assert.equal(task.family_runtime_task.task.status, 'succeeded');
    assert.equal(task.family_runtime_task.task.last_error, null);
    assert.equal(task.family_runtime_task.task.dead_letter_reason, null);
    assert.equal(attempt.status, 'completed');
    assert.deepEqual(attempt.closeout_refs, closeoutRefs);
    assert.equal(attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(attempt.provider_run.provider_status, 'completed');
    assert.equal(attempt.route_impact.domain_ready_verdict, 'domain_gate_pending');
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

test('family-runtime temporal attempt start blocks live Codex without stage packet', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-missing-packet-'));
  try {
    const created = runCli([
      'family-runtime',
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
      '--executor-kind',
      'codex_cli',
    ], familyRuntimeEnv(stateRoot)) as TemporalStageAttemptCreateOutput;
    const failure = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'start',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
        OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = JSON.parse(failure.stdout || failure.stderr);

    assert.notEqual(failure.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.equal(output.error.details.blocked_reason, 'codex_cli_stage_packet_ref_missing');
    assert.match(output.error.message, /stage packet ref/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime attempt inspect projects current provider readiness separately from creation receipt', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-attempt-current-provider-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const service = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  const worker = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  service.unref();
  worker.unref();

  try {
    assert.equal(typeof service.pid, 'number');
    assert.equal(typeof worker.pid, 'number');
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: service.pid,
      address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'test temporal service',
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: worker.pid,
      address,
      namespace: 'default',
      task_queue: 'opl-stage-attempts',
      started_at: new Date().toISOString(),
      status: 'ready',
    }, null, 2)}\n`);

    const env = familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
    });
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'ai_reviewer_re_eval',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], env);
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const inspected = runCli(['family-runtime', 'attempt', 'inspect', attemptId], env);
    const listed = runCli(['family-runtime', 'attempt', 'list'], env);

    assert.equal(
      created.family_runtime_stage_attempt.attempt.provider_receipt.receipt_status,
      'provider_code_landed_unconfigured',
    );
    assert.equal(created.family_runtime_stage_attempt.attempt.provider_receipt.provider_ready, false);
    assert.equal(inspected.family_runtime_stage_attempt.attempt.current_provider_readiness.provider_ready, true);
    assert.equal(inspected.family_runtime_stage_attempt.attempt.current_provider_readiness.status, 'ready');
    assert.equal(
      inspected.family_runtime_stage_attempt.attempt.current_provider_readiness.provider_receipt_is_creation_time_snapshot,
      true,
    );
    assert.equal(
      inspected.family_runtime_stage_attempt.attempt.current_provider_readiness.details.address_source,
      'managed_local_service_state',
    );
    assert.equal(listed.family_runtime_stage_attempts.attempts[0].current_provider_readiness.provider_ready, true);
  } finally {
    process.kill(service.pid!, 'SIGTERM');
    process.kill(worker.pid!, 'SIGTERM');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt query keeps local ledger readable when Temporal address is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-query-missing-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const query = runCli(['family-runtime', 'attempt', 'query', attemptId], {
      ...familyRuntimeEnv(stateRoot),
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    });

    assert.equal(query.family_runtime_stage_attempt_query.stage_attempt_query.attempt.stage_attempt_id, attemptId);
    assert.equal(query.family_runtime_stage_attempt_query.temporal_query.status, 'unavailable');
    assert.equal(
      query.family_runtime_stage_attempt_query.temporal_query.reason,
      'temporal_address_not_configured',
    );
    assert.equal(
      query.family_runtime_stage_attempt_query.temporal_query.authority_boundary.opl,
      'local_stage_attempt_ledger_projection_only',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt query reads managed local service state when env address is absent', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-query-managed-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-query-managed-${Date.now()}`;
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    OPL_TEMPORAL_TASK_QUEUE: process.env.OPL_TEMPORAL_TASK_QUEUE,
    OPL_TEMPORAL_WORKER_STATUS: process.env.OPL_TEMPORAL_WORKER_STATUS,
    OPL_TEMPORAL_WORKER_ENABLED: process.env.OPL_TEMPORAL_WORKER_ENABLED,
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
    }, null, 2)}\n`);

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: testEnv.namespace,
      taskQueue,
      workflowsPath: path.join(repoRoot, 'src', 'family-runtime-temporal-workflows.ts'),
      activities,
    });
    process.env.OPL_STATE_DIR = stateRoot;
    process.env.OPL_TEMPORAL_ADDRESS = '';
    process.env.TEMPORAL_ADDRESS = '';
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
    process.env.OPL_TEMPORAL_WORKER_STATUS = '';
    process.env.OPL_TEMPORAL_WORKER_ENABLED = '';

    const created = await runFamilyRuntime([
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
      '--checkpoint-ref',
      'checkpoint:managed-query',
    ]) as TemporalStageAttemptCreateOutput;
    const attempt = created.family_runtime_stage_attempt.attempt;

    const result = await worker.runUntil(async () => {
      const input = buildTemporalStageAttemptWorkflowInputForTest({
        ...attempt,
        task_id: attempt.task_id ?? 'task-managed-query',
        stage_packet_ref: 'packet:managed-query',
        checkpoint_refs: ['checkpoint:managed-query'],
        closeout_packet: {
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: ['receipt:managed-query'],
          consumed_refs: ['evidence:managed-query'],
          consumed_memory_refs: [],
          writeback_receipt_refs: [],
          rejected_writes: [],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: { decision: 'managed_query_test' },
        },
      });
      const handle = await testEnv.client.workflow.start('StageAttemptWorkflow', {
        args: [input],
        taskQueue,
        workflowId: attempt.workflow_id,
      });
      const query: TemporalStageAttemptQueryOutput =
        await runFamilyRuntime(['attempt', 'query', attempt.stage_attempt_id]) as TemporalStageAttemptQueryOutput;
      await handle.result();
      return query;
    });

    const temporalQuery = result.family_runtime_stage_attempt_query.temporal_query;

    assert.equal(temporalQuery.surface_kind, 'temporal_stage_attempt_query_receipt');
    assert.equal(temporalQuery.stage_attempt_id, attempt.stage_attempt_id);
    assert.equal(temporalQuery.workflow_id, attempt.workflow_id);
    assert.equal(['registered', 'running', 'checkpointed', 'completed'].includes(temporalQuery.query.status), true);
    assert.equal(temporalQuery.query.provider_kind, 'temporal');
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

test('family-runtime temporal terminal failure is projected into local attempt query and inspect', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-failed-projection-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-stage-query-failed-${Date.now()}`;
  const previousEnv = {
    OPL_STATE_DIR: process.env.OPL_STATE_DIR,
    OPL_TEMPORAL_ADDRESS: process.env.OPL_TEMPORAL_ADDRESS,
    TEMPORAL_ADDRESS: process.env.TEMPORAL_ADDRESS,
    OPL_TEMPORAL_NAMESPACE: process.env.OPL_TEMPORAL_NAMESPACE,
    OPL_TEMPORAL_TASK_QUEUE: process.env.OPL_TEMPORAL_TASK_QUEUE,
    OPL_TEMPORAL_WORKER_STATUS: process.env.OPL_TEMPORAL_WORKER_STATUS,
    OPL_TEMPORAL_WORKER_ENABLED: process.env.OPL_TEMPORAL_WORKER_ENABLED,
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
    assert.equal(temporalQuery.query.status, 'failed');
    assert.equal(stageQuery.attempt.status, 'failed');
    assert.equal(stageQuery.operator_visibility.status, 'failed');
    assert.equal(stageQuery.attempt.blocked_reason, 'temporal_workflow_failed');
    assert.equal(stageQuery.attempt.provider_run.provider_status, 'failed');
    assert.equal(terminalObservation.workflow_status, 'FAILED');
    assert.equal(terminalObservation.query_status, 'failed');
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

test('family-runtime temporal attempt signal fails closed when Temporal address is not configured', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-signal-missing-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'review',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas"}',
    ], familyRuntimeEnv(stateRoot));
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'signal',
      attemptId,
      '--kind',
      'resume',
      '--payload',
      '{"reason":"operator_resume"}',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        OPL_STATE_DIR: stateRoot,
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'contract_shape_invalid');
    assert.match(output.error.message, /OPL_TEMPORAL_ADDRESS/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal attempt start refuses non-temporal attempts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-start-provider-'));
  try {
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'review',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/rca"}',
    ], familyRuntimeEnv(stateRoot));
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'attempt',
      'start',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
      },
    });
    const output = JSON.parse(result.stdout || result.stderr);

    assert.notEqual(result.status, 0);
    assert.equal(output.error.code, 'cli_usage_error');
    assert.match(output.error.message, /temporal stage attempt/);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
