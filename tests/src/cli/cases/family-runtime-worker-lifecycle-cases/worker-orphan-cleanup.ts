import { spawn } from 'node:child_process';

import {
  assert,
  fs,
  os,
  parseJsonText,
  path,
  test,
} from '../../helpers.ts';
import {
  runTemporalWorkerForeground,
  startTemporalWorkerLifecycle,
  stopTemporalWorkerLifecycle,
} from '../../../../../src/modules/runway/family-runtime-temporal-provider.ts';
import {
  stopOrphanTemporalForegroundWorkers,
} from '../../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-process.ts';
import { createTemporalTestWorkflowEnvironment } from '../../../temporal-test-environment.ts';

test('Temporal worker stop cleans orphan foreground worker after state file is missing', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-orphan-stop-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await createTemporalTestWorkflowEnvironment();
  const taskQueue = `opl-worker-orphan-stop-${Date.now()}`;
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
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = 'git:orphan-worker-current';
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    delete process.env.OPL_TEMPORAL_WORKER_ENABLED;

    const start = await startTemporalWorkerLifecycle({ root: workerRoot });
    const statePath = path.join(workerRoot, 'temporal-worker.json');
    const workerState = parseJsonText(
      fs.readFileSync(statePath, 'utf8'),
    ) as { pid: number };
    fs.rmSync(statePath, { force: true });

    const stop = await stopTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(start.start_status, 'started');
    assert.equal(typeof workerState.pid, 'number');
    assert.equal(stop.stop_status, 'stopped');
    assert.equal(stop.stopped_pid, null);
    assert.deepEqual(stop.orphan_stopped_pids, [workerState.pid]);
    assert.equal(stop.orphan_stop_actions.length, 1);
    assert.equal(stop.orphan_stop_actions[0].signal, 'SIGTERM');
    assert.equal(stop.status.lifecycle_status, 'worker_not_ready');
    assert.throws(() => process.kill(workerState.pid, 0));
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
    try {
      const state = parseJsonText(
        fs.readFileSync(path.join(workerRoot, 'temporal-worker.json'), 'utf8'),
      ) as { pid: number };
      process.kill(state.pid, 'SIGKILL');
    } catch {
      // The lifecycle under test should have removed the fixture process or state file.
    }
    await testEnv.teardown();
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker foreground startup evicts older same-root foreground workers before configuration checks', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-foreground-evicts-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousTemporalAddress = process.env.TEMPORAL_ADDRESS;
  const oldWorker = spawn(process.execPath, [
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
  oldWorker.unref();
  try {
    assert.equal(typeof oldWorker.pid, 'number');
    delete process.env.OPL_TEMPORAL_ADDRESS;
    delete process.env.TEMPORAL_ADDRESS;

    await assert.rejects(
      () => runTemporalWorkerForeground({ root: workerRoot }),
      /Temporal worker foreground requires OPL_TEMPORAL_ADDRESS/,
    );

    assert.throws(() => process.kill(oldWorker.pid!, 0));
  } finally {
    try {
      process.kill(oldWorker.pid!, 'SIGKILL');
    } catch {
      // The foreground startup should have removed the fixture process.
    }
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousTemporalAddress === undefined) {
      delete process.env.TEMPORAL_ADDRESS;
    } else {
      process.env.TEMPORAL_ADDRESS = previousTemporalAddress;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker stop cleans root-tagged orphan foreground worker from a different source path', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-cross-source-orphan-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const child = spawn(process.execPath, [
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
  child.unref();
  try {
    assert.equal(typeof child.pid, 'number');
    fs.mkdirSync(workerRoot, { recursive: true });

    const stop = await stopTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(stop.stop_status, 'stopped');
    assert.equal(stop.stopped_pid, null);
    assert.deepEqual(stop.orphan_stopped_pids, [child.pid]);
    assert.equal(stop.status.lifecycle_status, 'not_configured');
    assert.throws(() => process.kill(child.pid!, 0));
  } finally {
    try {
      process.kill(child.pid!, 'SIGKILL');
    } catch {
      // The lifecycle under test should have removed the fixture process.
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker orphan cleanup is scoped to the requested family runtime root', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-root-scoped-orphan-'));
  const targetRoot = path.join(stateRoot, 'target-family-runtime');
  const otherRoot = path.join(stateRoot, 'other-family-runtime');
  const modulePath = path.resolve('src/family-runtime-temporal-provider.ts');
  const childArgs = (root: string) => [
    '-e',
    'setTimeout(() => {}, 30_000);',
    '--',
    '--temporal-worker-foreground',
    '--family-runtime-root',
    root,
    modulePath,
  ];
  const target = spawn(process.execPath, childArgs(targetRoot), {
    detached: true,
    stdio: 'ignore',
  });
  const other = spawn(process.execPath, childArgs(otherRoot), {
    detached: true,
    stdio: 'ignore',
  });
  target.unref();
  other.unref();
  try {
    assert.equal(typeof target.pid, 'number');
    assert.equal(typeof other.pid, 'number');

    const stop = await stopOrphanTemporalForegroundWorkers({
      modulePath,
      familyRuntimeRoot: targetRoot,
    });

    assert.deepEqual(stop.orphan_stopped_pids, [target.pid]);
    assert.throws(() => process.kill(target.pid!, 0));
    assert.doesNotThrow(() => process.kill(other.pid!, 0));
  } finally {
    for (const pid of [target.pid, other.pid]) {
      try {
        process.kill(pid!, 'SIGKILL');
      } catch {
        // The lifecycle under test should have removed the target process.
      }
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
