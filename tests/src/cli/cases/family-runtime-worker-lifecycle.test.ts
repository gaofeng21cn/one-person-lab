import { spawn } from 'node:child_process';
import net from 'node:net';

import { TestWorkflowEnvironment } from '@temporalio/testing';

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

test('Temporal worker lifecycle re-query proves resident state and stop transition', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-requery-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const server = await createFakeTemporalServer();
  const address = server.address;
  const child = spawn(process.execPath, [
    '-e',
    'setTimeout(() => {}, 30_000);',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousNamespace = process.env.OPL_TEMPORAL_NAMESPACE;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    assert.equal(typeof child.pid, 'number');
    fs.mkdirSync(workerRoot, { recursive: true });
    fs.writeFileSync(path.join(workerRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: child.pid,
      address,
      namespace: 'opl-worker-requery-test',
      task_queue: 'opl-worker-requery',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:worker-requery-current',
    }, null, 2)}\n`);

    process.env.OPL_TEMPORAL_ADDRESS = address;
    process.env.OPL_TEMPORAL_NAMESPACE = 'opl-worker-requery-test';
    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-worker-requery';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:worker-requery-current';
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;

    const requery = await inspectTemporalWorkerLifecycle({ root: workerRoot });
    const restart = await startTemporalWorkerLifecycle({ root: workerRoot });
    const stop = await stopTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(requery.lifecycle_status, 'ready');
    assert.equal(requery.managed_worker_pid, child.pid);
    assert.equal(restart.start_status, 'already_ready');
    assert.equal(restart.status.managed_worker_pid, child.pid);
    assert.equal(stop.stop_status, 'stopped');
    assert.equal(stop.before.lifecycle_status, 'ready');
    assert.equal(stop.status.lifecycle_status, 'worker_not_ready');
    assert.deepEqual(stop.status.blockers, ['temporal_worker_not_ready']);
  } finally {
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.OPL_TEMPORAL_NAMESPACE;
    } else {
      process.env.OPL_TEMPORAL_NAMESPACE = previousNamespace;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    if (previousWorkerStatus === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    } else {
      process.env.OPL_TEMPORAL_WORKER_STATUS = previousWorkerStatus;
    }
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    await server.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal resident worker restarts when worker.run returns without shutdown', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-resident-restart-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const baseState = {
    provider_kind: 'temporal' as const,
    pid: process.pid,
    address: '127.0.0.1:7233',
    namespace: 'opl-worker-resident-restart-test',
    task_queue: 'opl-worker-resident-restart',
    started_at: new Date().toISOString(),
    source_version: 'git:resident-worker-current',
  };
  let runCount = 0;
  try {
    await runTemporalWorkerResidentLoop({
      paths: { root: workerRoot },
      baseState,
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

test('Temporal managed worker uses a prebuilt workflow bundle with source-version metadata', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-bundle-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const previousNamespace = process.env.OPL_TEMPORAL_NAMESPACE;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  try {
    process.env.OPL_TEMPORAL_NAMESPACE = 'opl-worker-bundle-test';
    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-worker-bundle';

    const built = await buildTemporalStageAttemptWorkerOptionsForTest(
      { root: workerRoot },
      { sourceVersion: 'worker-runtime:test-bundle-source' },
    );

    assert.equal('workflowsPath' in built.worker_options, false);
    assert.deepEqual(built.worker_options.workflowBundle, {
      codePath: built.workflow_bundle.code_path,
    });
    assert.equal(built.workflow_bundle.provider_kind, 'temporal');
    assert.equal(built.workflow_bundle.workflow_bundle_source_version, 'worker-runtime:test-bundle-source');
    assert.match(built.workflow_bundle.workflow_bundle_version, /^workflow-bundle:sha256:/);
    assert.equal(built.workflow_bundle.task_queue, 'opl-worker-bundle');
    assert.equal(fs.existsSync(built.workflow_bundle.code_path), true);
    assert.equal(fs.existsSync(built.workflow_bundle.manifest_path), true);

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

    assert.equal(readiness.managed_worker_workflow_bundle_path, built.workflow_bundle.code_path);
    assert.equal(readiness.managed_worker_workflow_bundle_version, built.workflow_bundle.workflow_bundle_version);
    assert.equal(readiness.managed_worker_workflow_bundle_source_current, true);
    assert.equal(readiness.lifecycle.workflow_bundle_policy.production_worker_uses_prebuilt_bundle, true);
    assert.equal(readiness.lifecycle.workflow_bundle_policy.workflows_path_allowed_for_managed_worker, false);
  } finally {
    if (previousNamespace === undefined) {
      delete process.env.OPL_TEMPORAL_NAMESPACE;
    } else {
      process.env.OPL_TEMPORAL_NAMESPACE = previousNamespace;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker lifecycle rejects stale managed worker source version', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-stale-source-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const server = await createFakeTemporalServer();
  const address = server.address;
  const child = spawn(process.execPath, [
    '-e',
    'setTimeout(() => {}, 30_000);',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousNamespace = process.env.OPL_TEMPORAL_NAMESPACE;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    assert.equal(typeof child.pid, 'number');
    fs.mkdirSync(workerRoot, { recursive: true });
    fs.writeFileSync(path.join(workerRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: child.pid,
      address,
      namespace: 'opl-worker-stale-source-test',
      task_queue: 'opl-worker-stale-source',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:old-worker-source',
    }, null, 2)}\n`);

    process.env.OPL_TEMPORAL_ADDRESS = address;
    process.env.OPL_TEMPORAL_NAMESPACE = 'opl-worker-stale-source-test';
    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-worker-stale-source';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:new-worker-source';
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;

    const requery = await inspectTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(requery.lifecycle_status, 'worker_source_stale');
    assert.equal(requery.worker_ready, false);
    assert.equal(requery.managed_worker_pid, child.pid);
    assert.equal(requery.managed_worker_process_alive, true);
    assert.equal(requery.stale_worker_pid, child.pid);
    assert.equal(requery.managed_worker_source_version, 'git:old-worker-source');
    assert.equal(requery.expected_worker_source_version, 'git:new-worker-source');
    assert.equal(requery.managed_worker_source_current, false);
    assert.deepEqual(requery.blockers, ['temporal_worker_source_stale']);
    assert.equal(requery.repair_action.action_id, 'restart_temporal_worker');

    const stop = await stopTemporalWorkerLifecycle({ root: workerRoot });
    assert.equal(stop.stop_status, 'stopped');
    assert.equal(stop.stopped_pid, child.pid);
  } finally {
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.OPL_TEMPORAL_NAMESPACE;
    } else {
      process.env.OPL_TEMPORAL_NAMESPACE = previousNamespace;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    if (previousWorkerStatus === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    } else {
      process.env.OPL_TEMPORAL_WORKER_STATUS = previousWorkerStatus;
    }
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    try {
      process.kill(child.pid!, 'SIGTERM');
    } catch {
      // The lifecycle under test may already have removed the fixture process.
    }
    await server.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker lifecycle compares managed dist foreground executable source version', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-dist-foreground-stale-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const repoRoot = path.join(stateRoot, 'repo');
  const srcRoot = path.join(repoRoot, 'src');
  const distRoot = path.join(repoRoot, 'dist');
  const srcModulePath = path.join(srcRoot, 'family-runtime-temporal-provider.ts');
  const distModulePath = path.join(distRoot, 'family-runtime-temporal-provider.js');
  const server = await createFakeTemporalServer();
  const address = server.address;
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousNamespace = process.env.OPL_TEMPORAL_NAMESPACE;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  let child: ReturnType<typeof spawn> | null = null;
  try {
    fs.mkdirSync(path.dirname(srcModulePath), { recursive: true });
    fs.mkdirSync(path.dirname(distModulePath), { recursive: true });
    fs.writeFileSync(srcModulePath, 'export const workerRuntime = 1;\n');
    fs.writeFileSync(distModulePath, 'setTimeout(() => {}, 30_000);\n');

    child = spawn(process.execPath, [
      distModulePath,
      '--temporal-worker-foreground',
      '--family-runtime-root',
      workerRoot,
    ], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    assert.equal(typeof child.pid, 'number');
    fs.mkdirSync(workerRoot, { recursive: true });
    fs.writeFileSync(path.join(workerRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: child.pid,
      address,
      namespace: 'opl-worker-dist-foreground-stale-test',
      task_queue: 'opl-worker-dist-foreground-stale',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: `worker-runtime:${srcRoot}:${'a'.repeat(64)}`,
      workflow_bundle_source_version: `worker-runtime:${srcRoot}:${'a'.repeat(64)}`,
    }, null, 2)}\n`);

    process.env.OPL_TEMPORAL_ADDRESS = address;
    process.env.OPL_TEMPORAL_NAMESPACE = 'opl-worker-dist-foreground-stale-test';
    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-worker-dist-foreground-stale';
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;

    const requery = await inspectTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(requery.lifecycle_status, 'worker_source_stale');
    assert.equal(requery.worker_ready, false);
    assert.equal(requery.managed_worker_pid, child.pid);
    assert.equal(requery.stale_worker_pid, child.pid);
    assert.equal(requery.expected_worker_source_version?.startsWith(`worker-runtime:${distRoot}:`), true);
    assert.equal(requery.managed_worker_source_current, false);
    assert.deepEqual(requery.blockers, ['temporal_worker_source_stale']);
  } finally {
    if (child?.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        try {
          process.kill(child.pid, 'SIGTERM');
        } catch {
          // Test cleanup best effort.
        }
      }
    }
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.OPL_TEMPORAL_NAMESPACE;
    } else {
      process.env.OPL_TEMPORAL_NAMESPACE = previousNamespace;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    if (previousWorkerStatus === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    } else {
      process.env.OPL_TEMPORAL_WORKER_STATUS = previousWorkerStatus;
    }
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    await server.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker start fails closed instead of spawning over a stale managed worker', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-stale-start-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const server = await createFakeTemporalServer();
  const address = server.address;
  const child = spawn(process.execPath, [
    '-e',
    'setTimeout(() => {}, 30_000);',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousNamespace = process.env.OPL_TEMPORAL_NAMESPACE;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    assert.equal(typeof child.pid, 'number');
    fs.mkdirSync(workerRoot, { recursive: true });
    fs.writeFileSync(path.join(workerRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: child.pid,
      address,
      namespace: 'opl-worker-stale-start-test',
      task_queue: 'opl-worker-stale-start',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:old-worker-source',
    }, null, 2)}\n`);

    process.env.OPL_TEMPORAL_ADDRESS = address;
    process.env.OPL_TEMPORAL_NAMESPACE = 'opl-worker-stale-start-test';
    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-worker-stale-start';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:new-worker-source';
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;

    await assert.rejects(
      () => startTemporalWorkerLifecycle({ root: workerRoot }),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, 'contract_shape_invalid');
        assert.equal(
          ((error as { details?: Record<string, unknown> }).details ?? {}).lifecycle_status,
          'worker_source_stale',
        );
        return true;
      },
    );

    assert.doesNotThrow(() => process.kill(child.pid!, 0));
  } finally {
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.OPL_TEMPORAL_NAMESPACE;
    } else {
      process.env.OPL_TEMPORAL_NAMESPACE = previousNamespace;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    if (previousWorkerStatus === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    } else {
      process.env.OPL_TEMPORAL_WORKER_STATUS = previousWorkerStatus;
    }
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    try {
      process.kill(child.pid!, 'SIGTERM');
    } catch {
      // The lifecycle under test should keep the original worker alive until explicit stop.
    }
    await server.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker lifecycle accepts same runtime content hash from managed source root', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-managed-root-current-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const server = await createFakeTemporalServer();
  const address = server.address;
  const child = spawn(process.execPath, [
    '-e',
    'setTimeout(() => {}, 30_000);',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousNamespace = process.env.OPL_TEMPORAL_NAMESPACE;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  const contentHash = 'c'.repeat(64);
  try {
    assert.equal(typeof child.pid, 'number');
    fs.mkdirSync(workerRoot, { recursive: true });
    fs.writeFileSync(path.join(workerRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: child.pid,
      address,
      namespace: 'opl-worker-managed-root-current-test',
      task_queue: 'opl-worker-managed-root-current',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: `worker-runtime:/Users/gaofeng/Library/Application Support/OPL/runtime/current/opl/src:${contentHash}`,
      workflow_bundle_source_version: `worker-runtime:/Users/gaofeng/Library/Application Support/OPL/runtime/current/opl/src:${contentHash}`,
    }, null, 2)}\n`);

    process.env.OPL_TEMPORAL_ADDRESS = address;
    process.env.OPL_TEMPORAL_NAMESPACE = 'opl-worker-managed-root-current-test';
    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-worker-managed-root-current';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = `worker-runtime:/Users/gaofeng/workspace/one-person-lab/src:${contentHash}`;
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;

    const requery = await inspectTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(requery.lifecycle_status, 'ready');
    assert.equal(requery.worker_ready, true);
    assert.equal(requery.managed_worker_pid, child.pid);
    assert.equal(requery.stale_worker_pid, null);
    assert.equal(requery.managed_worker_source_current, true);
    assert.equal(
      requery.operator_diagnostic.source_version.diagnostic_id,
      'same_content_hash_different_source_root',
    );
    assert.equal(
      requery.operator_diagnostic.provider_ready_unchanged_by_source_root_equivalence,
      true,
    );
    assert.equal(requery.managed_worker_workflow_bundle_source_current, true);
    assert.deepEqual(requery.blockers, []);
    assert.equal(requery.worker_mutation_guard?.allowed, true);
  } finally {
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.OPL_TEMPORAL_NAMESPACE;
    } else {
      process.env.OPL_TEMPORAL_NAMESPACE = previousNamespace;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    if (previousWorkerStatus === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    } else {
      process.env.OPL_TEMPORAL_WORKER_STATUS = previousWorkerStatus;
    }
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    try {
      process.kill(child.pid!, 'SIGTERM');
    } catch {
      // The lifecycle under test may already have removed the fixture process.
    }
    await server.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker stop force-cleans detached workers that ignore SIGTERM', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-force-stop-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const server = await createFakeTemporalServer();
  const address = server.address;
  const child = spawn(process.execPath, [
    '-e',
    'process.on("SIGTERM", () => {}); console.log("ready"); setInterval(() => {}, 30_000);',
  ], {
    detached: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousNamespace = process.env.OPL_TEMPORAL_NAMESPACE;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    assert.equal(typeof child.pid, 'number');
    await new Promise<void>((resolve) => child.stdout.once('data', () => resolve()));
    fs.mkdirSync(workerRoot, { recursive: true });
    fs.writeFileSync(path.join(workerRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: child.pid,
      address,
      namespace: 'opl-worker-force-stop-test',
      task_queue: 'opl-worker-force-stop',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:force-stop-current',
    }, null, 2)}\n`);

    process.env.OPL_TEMPORAL_ADDRESS = address;
    process.env.OPL_TEMPORAL_NAMESPACE = 'opl-worker-force-stop-test';
    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-worker-force-stop';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:force-stop-current';
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;

    const stop = await stopTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(stop.stop_status, 'force_stopped');
    assert.equal(stop.stopped_pid, child.pid);
    assert.deepEqual(
      stop.stop_actions.map((action: any) => action.signal),
      ['SIGTERM', 'SIGKILL'],
    );
    assert.equal(stop.status.lifecycle_status, 'worker_not_ready');
    assert.throws(() => process.kill(child.pid!, 0));
  } finally {
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.OPL_TEMPORAL_NAMESPACE;
    } else {
      process.env.OPL_TEMPORAL_NAMESPACE = previousNamespace;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    if (previousWorkerStatus === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    } else {
      process.env.OPL_TEMPORAL_WORKER_STATUS = previousWorkerStatus;
    }
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    try {
      process.kill(child.pid!, 'SIGKILL');
    } catch {
      // The lifecycle under test should have removed the fixture process.
    }
    await server.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal detached worker keeps source version after foreground state rewrite', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-detached-source-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
  const taskQueue = `opl-worker-detached-source-${Date.now()}`;
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousNamespace = process.env.OPL_TEMPORAL_NAMESPACE;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  const previousWorkerEnabled = process.env.OPL_TEMPORAL_WORKER_ENABLED;
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    fs.mkdirSync(workerRoot, { recursive: true });
    process.env.OPL_TEMPORAL_ADDRESS = testEnv.address;
    process.env.OPL_TEMPORAL_NAMESPACE = testEnv.namespace ?? 'default';
    process.env.OPL_TEMPORAL_TASK_QUEUE = taskQueue;
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:detached-worker-current';
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    delete process.env.OPL_TEMPORAL_WORKER_ENABLED;

    const start = await startTemporalWorkerLifecycle({ root: workerRoot });
    const statePath = path.join(workerRoot, 'temporal-worker.json');
    const deadline = Date.now() + 5_000;
    let workerState = parseJsonText(fs.readFileSync(statePath, 'utf8')) as any;
    while (Date.now() < deadline && workerState.source_version !== 'git:detached-worker-current') {
      await new Promise((resolve) => setTimeout(resolve, 50));
      workerState = parseJsonText(fs.readFileSync(statePath, 'utf8')) as any;
    }
    const requery = await inspectTemporalWorkerLifecycle({ root: workerRoot });
    const stop = await stopTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(start.start_status, 'started');
    assert.equal(workerState.source_version, 'git:detached-worker-current');
    assert.equal(workerState.status, 'ready');
    assert.equal(requery.lifecycle_status, 'ready');
    assert.equal(requery.managed_worker_source_current, true);
    assert.equal(requery.managed_worker_source_version, 'git:detached-worker-current');
    assert.equal(stop.stop_status, 'stopped');
  } finally {
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.OPL_TEMPORAL_NAMESPACE;
    } else {
      process.env.OPL_TEMPORAL_NAMESPACE = previousNamespace;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    if (previousWorkerStatus === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    } else {
      process.env.OPL_TEMPORAL_WORKER_STATUS = previousWorkerStatus;
    }
    if (previousWorkerEnabled === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_ENABLED;
    } else {
      process.env.OPL_TEMPORAL_WORKER_ENABLED = previousWorkerEnabled;
    }
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker status fails closed when duplicate foreground workers share one runtime root', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-duplicate-status-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const server = await createFakeTemporalServer();
  const address = server.address;
  const managed = spawn(process.execPath, [
    '-e',
    'setTimeout(() => {}, 30_000);',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  const duplicate = spawn(process.execPath, [
    '-e',
    'setTimeout(() => {}, 30_000);',
    '--',
    '--temporal-worker-foreground',
    '--family-runtime-root',
    workerRoot,
  ], {
    detached: true,
    stdio: 'ignore',
  });
  managed.unref();
  duplicate.unref();
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousNamespace = process.env.OPL_TEMPORAL_NAMESPACE;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  const previousWorkerEnabled = process.env.OPL_TEMPORAL_WORKER_ENABLED;
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    assert.equal(typeof managed.pid, 'number');
    assert.equal(typeof duplicate.pid, 'number');
    fs.mkdirSync(workerRoot, { recursive: true });
    fs.writeFileSync(path.join(workerRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: managed.pid,
      address,
      namespace: 'opl-worker-duplicate-status-test',
      task_queue: 'opl-worker-duplicate-status',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:duplicate-worker-current',
    }, null, 2)}\n`);

    process.env.OPL_TEMPORAL_ADDRESS = address;
    process.env.OPL_TEMPORAL_NAMESPACE = 'opl-worker-duplicate-status-test';
    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-worker-duplicate-status';
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:duplicate-worker-current';
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    delete process.env.OPL_TEMPORAL_WORKER_ENABLED;

    const requery = await inspectTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(requery.lifecycle_status, 'duplicate_worker');
    assert.equal(requery.worker_ready, false);
    assert.equal(requery.managed_worker_pid, managed.pid);
    assert.deepEqual(requery.duplicate_worker_pids, [duplicate.pid]);
    assert.deepEqual(requery.blockers, ['temporal_worker_duplicate_foreground']);
    assert.equal(requery.repair_action.action_id, 'restart_temporal_worker');
  } finally {
    for (const pid of [managed.pid, duplicate.pid]) {
      try {
        process.kill(pid!, 'SIGKILL');
      } catch {
        // The lifecycle under test may have removed the fixture process.
      }
    }
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousNamespace === undefined) {
      delete process.env.OPL_TEMPORAL_NAMESPACE;
    } else {
      process.env.OPL_TEMPORAL_NAMESPACE = previousNamespace;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    if (previousWorkerStatus === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    } else {
      process.env.OPL_TEMPORAL_WORKER_STATUS = previousWorkerStatus;
    }
    if (previousWorkerEnabled === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_ENABLED;
    } else {
      process.env.OPL_TEMPORAL_WORKER_ENABLED = previousWorkerEnabled;
    }
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    await server.close();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker detached start passes resolved Codex binary to foreground worker env', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-codex-env-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const codex = createFakeCodexFixture('printf \'{}\\n\'');
  const sourceModulePath = path.join(stateRoot, 'family-runtime-temporal-provider.ts');
  const temporalServer = await createFakeTemporalServer();
  const previousPath = process.env.PATH;
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  const previousWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    fs.mkdirSync(path.dirname(sourceModulePath), { recursive: true });
    fs.writeFileSync(sourceModulePath, 'export const workerRuntime = 1;\n');
    process.env.PATH = `${codex.fixtureRoot}:${process.env.PATH ?? ''}`;
    delete process.env.OPL_CODEX_BIN;
    process.env.OPL_TEMPORAL_ADDRESS = temporalServer.address;
    delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = `worker-runtime:${path.dirname(sourceModulePath)}:${'a'.repeat(64)}`;

    const start = await startTemporalWorkerLifecycle({ root: workerRoot });
    const workerState = parseJsonText(fs.readFileSync(path.join(workerRoot, 'temporal-worker.json'), 'utf8')) as any;
    const expectedTaskQueue = resolveTemporalWorkerTaskQueue({ root: workerRoot });

    assert.equal(start.start_status, 'started');
    assert.equal(start.spawned_worker_environment?.OPL_CODEX_BIN, codex.codexPath);
    assert.equal(start.spawned_worker_environment?.codex_binary_source, 'path');
    assert.equal(start.spawned_worker_environment?.OPL_TEMPORAL_ADDRESS, temporalServer.address);
    assert.equal(start.spawned_worker_environment?.OPL_TEMPORAL_TASK_QUEUE, expectedTaskQueue);
    assert.notEqual(expectedTaskQueue, DEFAULT_TEMPORAL_TASK_QUEUE);
    assert.equal(workerState.task_queue, expectedTaskQueue);
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    if (previousCodexBin === undefined) {
      delete process.env.OPL_CODEX_BIN;
    } else {
      process.env.OPL_CODEX_BIN = previousCodexBin;
    }
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousTaskQueue === undefined) {
      delete process.env.OPL_TEMPORAL_TASK_QUEUE;
    } else {
      process.env.OPL_TEMPORAL_TASK_QUEUE = previousTaskQueue;
    }
    if (previousWorkerStatus === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    } else {
      process.env.OPL_TEMPORAL_WORKER_STATUS = previousWorkerStatus;
    }
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    try {
      process.kill((parseJsonText(fs.readFileSync(path.join(workerRoot, 'temporal-worker.json'), 'utf8')) as any).pid, 'SIGKILL');
    } catch {
      // The lifecycle under test may have exited before cleanup.
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(codex.fixtureRoot, { recursive: true, force: true });
    await temporalServer.close();
  }
});
