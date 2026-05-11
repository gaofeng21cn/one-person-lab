import { spawnSync } from 'node:child_process';
import net from 'node:net';

import { assert, fs, os, path, repoRoot, runCli, test } from '../helpers.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    OPL_DISABLE_HERMES_ONLINE: '1',
    ...extra,
  };
}

test('family-runtime worker parser exposes temporal lifecycle status command', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-status-'));
  try {
    const output = runCli(
      ['family-runtime', 'worker', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      }),
    );

    assert.equal(output.family_runtime_worker.surface_id, 'opl_family_runtime_worker');
    assert.equal(output.family_runtime_worker.action, 'status');
    assert.equal(output.family_runtime_worker.lifecycle_status, 'not_configured');
    assert.deepEqual(output.family_runtime_worker.blockers, ['temporal_runtime_not_configured']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime worker status distinguishes unreachable server from worker_not_ready', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-readiness-'));
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  try {
    const workerNotReady = runCli(
      ['family-runtime', 'worker', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: address,
        OPL_TEMPORAL_WORKER_STATUS: '',
        OPL_TEMPORAL_WORKER_ENABLED: '',
      }),
    );
    const ready = runCli(
      ['family-runtime', 'worker', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: address,
        OPL_TEMPORAL_WORKER_STATUS: 'ready',
      }),
    );

    assert.equal(workerNotReady.family_runtime_worker.lifecycle_status, 'worker_not_ready');
    assert.deepEqual(workerNotReady.family_runtime_worker.blockers, ['temporal_worker_not_ready']);
    assert.equal(ready.family_runtime_worker.lifecycle_status, 'ready');
    assert.equal(ready.family_runtime_worker.worker_ready, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }

  const unreachableStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-unreachable-'));
  try {
    const unreachable = runCli(
      ['family-runtime', 'worker', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(unreachableStateRoot, {
        OPL_TEMPORAL_ADDRESS: address,
        OPL_TEMPORAL_WORKER_STATUS: 'ready',
      }),
    );
    assert.equal(unreachable.family_runtime_worker.lifecycle_status, 'server_unreachable');
    assert.deepEqual(unreachable.family_runtime_worker.blockers, ['temporal_server_unreachable']);
  } finally {
    fs.rmSync(unreachableStateRoot, { recursive: true, force: true });
  }
});

test('family-runtime worker start fails closed when Temporal is not configured or unreachable', () => {
  const missingStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-start-missing-'));
  const unreachableStateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-start-unreachable-'));
  try {
    const missing = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'worker',
      'start',
      '--provider',
      'temporal',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(missingStateRoot, {
          OPL_TEMPORAL_ADDRESS: '',
          TEMPORAL_ADDRESS: '',
        }),
      },
    });
    const missingPayload = JSON.parse(missing.stderr);

    const unreachable = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'worker',
      'start',
      '--provider',
      'temporal',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(unreachableStateRoot, {
          OPL_TEMPORAL_ADDRESS: '127.0.0.1:9',
        }),
      },
    });
    const unreachablePayload = JSON.parse(unreachable.stderr);

    assert.equal(missing.status, 3);
    assert.equal(missingPayload.error.code, 'contract_shape_invalid');
    assert.equal(missingPayload.error.details.lifecycle_status, 'not_configured');
    assert.equal(unreachable.status, 3);
    assert.equal(unreachablePayload.error.code, 'contract_shape_invalid');
    assert.equal(unreachablePayload.error.details.lifecycle_status, 'server_unreachable');
  } finally {
    fs.rmSync(missingStateRoot, { recursive: true, force: true });
    fs.rmSync(unreachableStateRoot, { recursive: true, force: true });
  }
});
