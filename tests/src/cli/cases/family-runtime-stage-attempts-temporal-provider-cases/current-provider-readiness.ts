import { spawn } from 'node:child_process';
import net from 'node:net';

import { assert, fs, installRuntimePackageFixture, os, path, runCli, test } from '../../helpers.ts';
import {
  resolveTemporalWorkerTaskQueue,
} from '../../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-task-queue.ts';

test('family-runtime attempt inspect uses current readiness instead of its creation snapshot', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-attempt-current-provider-'));
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
    installRuntimePackageFixture(stateRoot, 'redcube-ai');
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
    })}\n`);
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: worker.pid,
      address,
      namespace: 'default',
      task_queue: taskQueue,
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:attempt-current-provider',
    })}\n`);
    const env = {
      OPL_STATE_DIR: stateRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
      OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:attempt-current-provider',
    };
    const created = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'redcube',
      '--stage',
      'artifact_creation',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/redcube-runtime"}',
    ], env);
    const inspected = runCli([
      'family-runtime',
      'attempt',
      'inspect',
      created.family_runtime_stage_attempt.attempt.stage_attempt_id,
    ], env).family_runtime_stage_attempt.attempt;

    assert.equal(created.family_runtime_stage_attempt.attempt.provider_receipt.provider_ready, false);
    assert.equal(inspected.current_provider_readiness.provider_ready, true);
    assert.equal(inspected.current_provider_readiness.status, 'ready');
    assert.equal(
      inspected.provider_readiness_currentness.effective_provider_readiness_source,
      'current_provider_readiness',
    );
    assert.equal(
      inspected.provider_readiness_currentness.creation_receipt_currentness,
      'creation_time_snapshot',
    );
    assert.equal(
      inspected.provider_readiness_currentness.provider_receipt_is_current_readiness,
      false,
    );
    assert.equal(inspected.current_provider_readiness.details.address_source, 'managed_local_service_state');
  } finally {
    if (service.pid) process.kill(service.pid, 'SIGTERM');
    if (worker.pid) process.kill(worker.pid, 'SIGTERM');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
