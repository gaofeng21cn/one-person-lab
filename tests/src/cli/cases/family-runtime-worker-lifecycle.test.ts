import { spawn } from 'node:child_process';
import net from 'node:net';

import './family-runtime-worker-lifecycle-cases/dependency-readiness.ts';
import './family-runtime-worker-lifecycle-cases/worker-orphan-cleanup.ts';
import './family-runtime-worker-lifecycle-cases/source-currentness-and-guards.ts';
import {
  assert,
  createFakeCodexFixture,
  fs,
  os,
  parseJsonText,
  path,
  test,
} from '../helpers.ts';
import {
  DEFAULT_TEMPORAL_TASK_QUEUE,
} from '../../../../src/modules/runway/family-runtime-temporal.ts';
import {
  buildTemporalStageAttemptWorkerOptionsForTest,
  buildTemporalWorkerReadiness,
  inspectTemporalWorkerLifecycle,
  startTemporalWorkerLifecycle,
  stopTemporalWorkerLifecycle,
} from '../../../../src/modules/runway/family-runtime-temporal-provider.ts';
import {
  runTemporalWorkerResidentLoop,
} from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-residency.ts';
import {
  resolveTemporalWorkerTaskQueue,
} from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-task-queue.ts';

async function createFakeTemporalServer() {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    address: `127.0.0.1:${(server.address() as net.AddressInfo).port}`,
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

function writeTemporalWorkerState(workerRoot: string, state: Record<string, unknown>) {
  fs.mkdirSync(workerRoot, { recursive: true });
  fs.writeFileSync(
    path.join(workerRoot, 'temporal-worker.json'),
    `${JSON.stringify({ provider_kind: 'temporal', ...state }, null, 2)}\n`,
  );
}

function withWorkerEnv<T>(env: Record<string, string | undefined>, fn: () => Promise<T>) {
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return fn().finally(() => {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test('Temporal worker lifecycle re-query proves resident state and stop transition', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-requery-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const server = await createFakeTemporalServer();
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  try {
    assert.equal(typeof child.pid, 'number');
    writeTemporalWorkerState(workerRoot, {
      pid: child.pid,
      address: server.address,
      namespace: 'opl-worker-requery-test',
      task_queue: 'opl-worker-requery',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:worker-requery-current',
    });

    await withWorkerEnv({
      OPL_TEMPORAL_ADDRESS: server.address,
      OPL_TEMPORAL_NAMESPACE: 'opl-worker-requery-test',
      OPL_TEMPORAL_TASK_QUEUE: 'opl-worker-requery',
      OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:worker-requery-current',
      OPL_TEMPORAL_WORKER_STATUS: undefined,
    }, async () => {
      const requery = await inspectTemporalWorkerLifecycle({ root: workerRoot });
      const restart = await startTemporalWorkerLifecycle({ root: workerRoot });
      const stop = await stopTemporalWorkerLifecycle({ root: workerRoot });

      assert.equal(requery.lifecycle_status, 'ready');
      assert.equal(restart.start_status, 'already_ready');
      assert.equal(stop.stop_status, 'stopped');
      assert.deepEqual(stop.status.blockers, ['temporal_worker_not_ready']);
    });
  } finally {
    try {
      process.kill(child.pid!, 'SIGTERM');
    } catch {
      // The lifecycle under test may already have removed the fixture process.
    }
    await server.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal resident worker records restart and shutdown state', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-resident-restart-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  let runCount = 0;

  try {
    await runTemporalWorkerResidentLoop({
      paths: { root: workerRoot },
      baseState: {
        provider_kind: 'temporal',
        pid: process.pid,
        address: '127.0.0.1:7233',
        namespace: 'opl-worker-resident-restart-test',
        task_queue: 'opl-worker-resident-restart',
        started_at: new Date().toISOString(),
        source_version: 'git:resident-worker-current',
      },
      restartDelayMs: 0,
      isShutdownRequested: () => runCount >= 2,
      runWorkerOnce: async () => {
        runCount += 1;
      },
    });

    const state = parseJsonText(fs.readFileSync(path.join(workerRoot, 'temporal-worker.json'), 'utf8')) as any;
    assert.equal(runCount, 2);
    assert.equal(state.status, 'exited');
    assert.equal(state.last_exit.exit_status, 'worker_shutdown_requested');
    assert.equal(state.resident_restart_count, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal managed worker uses prebuilt bundle and source-version guards', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-bundle-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');

  try {
    await withWorkerEnv({
      OPL_TEMPORAL_NAMESPACE: 'opl-worker-bundle-test',
      OPL_TEMPORAL_TASK_QUEUE: 'opl-worker-bundle',
    }, async () => {
      const built = await buildTemporalStageAttemptWorkerOptionsForTest(
        { root: workerRoot },
        { sourceVersion: 'worker-runtime:test-bundle-source' },
      );
      const readiness = buildTemporalWorkerReadiness({
        address: '127.0.0.1:7233',
        workerStatus: 'ready',
        namespace: 'opl-worker-bundle-test',
        taskQueue: 'opl-worker-bundle',
        managedWorkerWorkflowBundlePath: built.workflow_bundle.code_path,
        managedWorkerWorkflowBundleVersion: built.workflow_bundle.workflow_bundle_version,
        managedWorkerWorkflowBundleSourceVersion: built.workflow_bundle.workflow_bundle_source_version,
        expectedWorkerSourceVersion: 'worker-runtime:test-bundle-source',
        managedWorkerSourceCurrent: true,
      });

      assert.equal('workflowsPath' in built.worker_options, false);
      assert.equal(built.workflow_bundle.workflow_bundle_source_version, 'worker-runtime:test-bundle-source');
      assert.match(built.workflow_bundle.workflow_bundle_version, /^workflow-bundle:sha256:/);
      assert.equal(fs.existsSync(built.workflow_bundle.code_path), true);
      assert.equal(readiness.managed_worker_workflow_bundle_source_current, true);
      assert.equal(readiness.lifecycle.workflow_bundle_policy.production_worker_uses_prebuilt_bundle, true);
      assert.equal(readiness.lifecycle.workflow_bundle_policy.workflows_path_allowed_for_managed_worker, false);
    });
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker start fails closed over a stale managed worker', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-stale-start-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const server = await createFakeTemporalServer();
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  try {
    assert.equal(typeof child.pid, 'number');
    writeTemporalWorkerState(workerRoot, {
      pid: child.pid,
      address: server.address,
      namespace: 'opl-worker-stale-start-test',
      task_queue: 'opl-worker-stale-start',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:old-worker-source',
    });

    await withWorkerEnv({
      OPL_TEMPORAL_ADDRESS: server.address,
      OPL_TEMPORAL_NAMESPACE: 'opl-worker-stale-start-test',
      OPL_TEMPORAL_TASK_QUEUE: 'opl-worker-stale-start',
      OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:new-worker-source',
      OPL_TEMPORAL_WORKER_STATUS: undefined,
    }, async () => {
      const requery = await inspectTemporalWorkerLifecycle({ root: workerRoot });
      assert.equal(requery.lifecycle_status, 'worker_source_stale');
      assert.deepEqual(requery.blockers, ['temporal_worker_source_stale']);
      await assert.rejects(
        () => startTemporalWorkerLifecycle({ root: workerRoot }),
        (error: unknown) => {
          assert.equal((error as { code?: string }).code, 'contract_shape_invalid');
          return true;
        },
      );
    });
  } finally {
    try {
      process.kill(child.pid!, 'SIGTERM');
    } catch {
      // The lifecycle under test should keep the original worker alive until explicit stop.
    }
    await server.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal detached start passes resolved Codex binary to foreground worker env', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-codex-env-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const codex = createFakeCodexFixture('printf \'{}\\n\'');
  const sourceModulePath = path.join(stateRoot, 'family-runtime-temporal-provider.ts');
  const temporalServer = await createFakeTemporalServer();
  let workerPid: number | undefined;

  try {
    fs.mkdirSync(path.dirname(sourceModulePath), { recursive: true });
    fs.writeFileSync(sourceModulePath, 'export const workerRuntime = 1;\n');
    await withWorkerEnv({
      PATH: `${codex.fixtureRoot}:${process.env.PATH ?? ''}`,
      OPL_CODEX_BIN: undefined,
      OPL_TEMPORAL_ADDRESS: temporalServer.address,
      OPL_TEMPORAL_TASK_QUEUE: undefined,
      OPL_TEMPORAL_WORKER_STATUS: undefined,
      OPL_TEMPORAL_WORKER_SOURCE_VERSION: `worker-runtime:${path.dirname(sourceModulePath)}:${'a'.repeat(64)}`,
    }, async () => {
      const start = await startTemporalWorkerLifecycle({ root: workerRoot });
      const workerState = parseJsonText(fs.readFileSync(path.join(workerRoot, 'temporal-worker.json'), 'utf8')) as any;
      const expectedTaskQueue = resolveTemporalWorkerTaskQueue({ root: workerRoot });
      workerPid = workerState.pid;

      assert.equal(start.start_status, 'started');
      assert.equal(start.spawned_worker_environment?.OPL_CODEX_BIN, codex.codexPath);
      assert.equal(start.spawned_worker_environment?.codex_binary_source, 'path');
      assert.equal(start.spawned_worker_environment?.OPL_TEMPORAL_ADDRESS, temporalServer.address);
      assert.equal(start.spawned_worker_environment?.OPL_TEMPORAL_TASK_QUEUE, expectedTaskQueue);
      assert.notEqual(expectedTaskQueue, DEFAULT_TEMPORAL_TASK_QUEUE);
      assert.equal(workerState.task_queue, expectedTaskQueue);
    });
  } finally {
    if (workerPid) {
      try {
        process.kill(workerPid, 'SIGKILL');
      } catch {
        // The lifecycle under test may have exited before cleanup.
      }
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(codex.fixtureRoot, { recursive: true, force: true });
    await temporalServer.close();
  }
});
