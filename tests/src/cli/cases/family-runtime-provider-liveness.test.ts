import net from 'node:net';

import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

test('family-runtime status exposes Temporal worker liveness as first repair action when service is running', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-status-worker-liveness-'));
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const temporalAddress = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  try {
    const output = runCli(['family-runtime', 'status', '--provider', 'temporal'], familyRuntimeEnv(stateRoot, {
      OPL_TEMPORAL_ADDRESS: temporalAddress,
      OPL_TEMPORAL_NAMESPACE: 'opl-status-worker-liveness',
      OPL_TEMPORAL_TASK_QUEUE: 'opl-status-worker-liveness',
      OPL_TEMPORAL_WORKER_STATUS: '',
      OPL_TEMPORAL_WORKER_ENABLED: '',
    }));
    const runtime = output.family_runtime;

    assert.equal(runtime.readiness.degraded_reason, 'temporal_worker_not_ready');
    assert.equal(runtime.periodic_execution.status, 'blocked_provider_not_ready');
    assert.equal(runtime.periodic_execution.blocker.blocker_id, 'temporal_worker_not_ready');
    assert.equal(runtime.periodic_execution.blocker.next_repair_command, 'opl family-runtime worker start --provider temporal');
    assert.equal(runtime.periodic_execution.blocker.next_repair_action.action_id, 'start_temporal_worker');
    assert.equal(runtime.periodic_execution.blocker.worker_lifecycle_status, 'worker_not_ready');
    assert.equal(runtime.periodic_execution.blocker.temporal_service_status, 'external_running');
    assert.equal(runtime.periodic_execution.blocker.liveness_blocker_first, true);
    assert.equal(runtime.periodic_execution.blocker.next_repair_command.includes('service start'), false);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
