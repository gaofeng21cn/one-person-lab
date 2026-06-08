import { spawn } from 'node:child_process';
import net from 'node:net';

import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../../helpers.ts';
import {
  assertCurrentProviderReadiness,
  assertProviderReadinessCurrentness,
} from '../family-runtime-stage-attempts-temporal-provider-fixtures.ts';
import { resolveTemporalWorkerTaskQueue } from '../../../../../src/family-runtime-temporal-provider-parts/worker-task-queue.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

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
    const taskQueue = resolveTemporalWorkerTaskQueue({ root: runtimeRoot });
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
      task_queue: taskQueue,
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:attempt-current-provider',
    }, null, 2)}\n`);

    const env = familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:attempt-current-provider',
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
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--checkpoint-ref',
      'runtime/checkpoints/attempt-current-provider.json',
    ], env);
    const runningCompact = runCli([
      'family-runtime',
      'attempt',
      'list',
      '--status',
      'checkpointed',
      '--compact-timeline',
    ], env);

    assert.equal(
      created.family_runtime_stage_attempt.attempt.provider_receipt.receipt_status,
      'provider_code_landed_unconfigured',
    );
    assert.equal(created.family_runtime_stage_attempt.attempt.provider_receipt.provider_ready, false);
    assertCurrentProviderReadiness(inspected.family_runtime_stage_attempt.attempt.current_provider_readiness);
    assert.equal(
      inspected.family_runtime_stage_attempt.attempt.current_provider_readiness.provider_receipt_is_creation_time_snapshot,
      true,
    );
    assertProviderReadinessCurrentness(inspected.family_runtime_stage_attempt.attempt.provider_readiness_currentness);
    assert.equal(
      inspected.family_runtime_stage_attempt.attempt.current_provider_readiness.details.address_source,
      'managed_local_service_state',
    );
    assertCurrentProviderReadiness(listed.family_runtime_stage_attempts.attempts[0].current_provider_readiness);
    assertProviderReadinessCurrentness(
      listed.family_runtime_stage_attempts.attempts[0].provider_readiness_currentness,
    );
    assert.equal(runningCompact.family_runtime_stage_attempts.compact_timeline.length, 1);
    assertCurrentProviderReadiness(
      runningCompact.family_runtime_stage_attempts.compact_timeline[0].current_provider_readiness,
    );
    assertProviderReadinessCurrentness(
      runningCompact.family_runtime_stage_attempts.compact_timeline[0].provider_readiness_currentness,
    );
    assertProviderReadinessCurrentness(
      runningCompact.family_runtime_stage_attempts.compact_timeline[0]
        .operator_summary.provider_readiness_currentness,
    );
  } finally {
    process.kill(service.pid!, 'SIGTERM');
    process.kill(worker.pid!, 'SIGTERM');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
