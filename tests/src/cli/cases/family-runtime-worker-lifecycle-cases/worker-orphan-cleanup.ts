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
  inspectTemporalWorkerLifecycle,
  runTemporalWorkerForeground,
  startTemporalWorkerLifecycle,
  stopTemporalWorkerLifecycle,
} from '../../../../../src/adapters/execution/family-runtime-temporal-provider.ts';
import {
  currentWorkerSourceVersion,
} from '../../../../../src/adapters/execution/family-runtime-temporal-provider-parts/worker-state.ts';
import {
  findTemporalForegroundWorkerPids,
  stopOrphanTemporalForegroundWorkers,
  temporalForegroundWorkerModulePathFromCommand,
} from '../../../../../src/adapters/execution/family-runtime-temporal-provider-parts/worker-process.ts';
import { createTemporalTestWorkflowEnvironment } from '../../../temporal-test-environment.ts';

test('Temporal worker module path parser preserves unquoted macOS paths with spaces', () => {
  const modulePath = '/Users/test/Library/Application Support/OPL/framework/one-person-lab/src/adapters/execution/family-runtime-temporal-provider.ts';
  const command = `/usr/local/bin/node --experimental-strip-types ${modulePath} --temporal-worker-foreground --family-runtime-root /Users/test/Library/Application Support/OPL/state/family-runtime`;

  assert.equal(temporalForegroundWorkerModulePathFromCommand(command), modulePath);
});

test('Temporal worker discovery ignores oversized unrelated process arguments', {
  skip: process.platform === 'win32',
}, () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-large-process-table-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const previousPath = process.env.PATH;
  const child = spawn(process.execPath, [
    '-e', 'setTimeout(() => {}, 30_000);', '--',
    '--temporal-worker-foreground', '--family-runtime-root', workerRoot,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  try {
    fs.writeFileSync(path.join(stateRoot, 'ps'), `#!${process.execPath}
const { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args.includes('-axo')) process.stdout.write('999999 unrelated-command '.repeat(70000) + '\\n');
process.stdout.write(execFileSync('/bin/ps', args));
`, { mode: 0o755 });
    process.env.PATH = `${stateRoot}:${previousPath ?? ''}`;

    assert.deepEqual(findTemporalForegroundWorkerPids({
      modulePath: '/unrelated/source/family-runtime-temporal-provider.ts',
      familyRuntimeRoot: workerRoot,
    }), [child.pid]);
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    try {
      process.kill(child.pid!, 'SIGKILL');
    } catch {
      // The fixture process may already have exited.
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker discovery distinguishes no matches from a failed process probe', {
  skip: process.platform === 'win32',
}, () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-failed-process-probe-'));
  const previousPath = process.env.PATH;
  try {
    const probe = path.join(stateRoot, 'pgrep');
    process.env.PATH = stateRoot;
    fs.writeFileSync(probe, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    assert.deepEqual(findTemporalForegroundWorkerPids({ modulePath: '/worker.ts' }), []);
    fs.writeFileSync(probe, '#!/bin/sh\nexit 2\n', { mode: 0o755 });
    assert.throws(
      () => findTemporalForegroundWorkerPids({ modulePath: '/worker.ts' }),
      /Unable to discover Temporal foreground worker processes/,
    );
    fs.rmSync(probe);
    assert.throws(
      () => findTemporalForegroundWorkerPids({ modulePath: '/worker.ts' }),
      /Unable to discover Temporal foreground worker processes/,
    );
  } finally {
    if (previousPath === undefined) delete process.env.PATH;
    else process.env.PATH = previousPath;
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Temporal worker lifecycle adopts the live managed worker namespace without counting it as duplicate', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-managed-namespace-'));
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
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousAddressSource = process.env.OPL_TEMPORAL_ADDRESS_SOURCE;
  const previousTemporalAddress = process.env.TEMPORAL_ADDRESS;
  const previousNamespace = process.env.OPL_TEMPORAL_NAMESPACE;
  const previousTaskQueue = process.env.OPL_TEMPORAL_TASK_QUEUE;
  try {
    assert.equal(typeof child.pid, 'number');
    fs.mkdirSync(workerRoot, { recursive: true });
    process.env.OPL_TEMPORAL_ADDRESS = '127.0.0.1:7233';
    delete process.env.OPL_TEMPORAL_ADDRESS_SOURCE;
    delete process.env.TEMPORAL_ADDRESS;
    delete process.env.OPL_TEMPORAL_NAMESPACE;
    process.env.OPL_TEMPORAL_TASK_QUEUE = 'opl-stage-attempts';
    const providerModuleUrl = new URL(
      '../../../../../src/adapters/execution/family-runtime-temporal-provider.ts',
      import.meta.url,
    ).href;
    const sourceVersion = currentWorkerSourceVersion(providerModuleUrl);
    fs.writeFileSync(path.join(workerRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: child.pid,
      address: '127.0.0.1:7233',
      namespace: 'opl-stage-v2',
      task_queue: 'opl-stage-attempts',
      started_at: '2026-08-03T00:00:00.000Z',
      status: 'ready',
      source_version: sourceVersion,
    }, null, 2)}\n`);

    const status = await inspectTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(status.namespace, 'opl-stage-v2');
    assert.equal(status.managed_worker_pid, child.pid);
    assert.equal(status.managed_worker_process_alive, true);
    assert.equal(status.managed_worker_source_current, true);
    assert.deepEqual(status.duplicate_worker_pids, []);
    if (status.visibility_readiness) {
      assert.equal(status.visibility_readiness.namespace, 'opl-stage-v2');
    }
  } finally {
    try {
      process.kill(child.pid!, 'SIGKILL');
    } catch {
      // The fixture process may already have exited.
    }
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    if (previousAddressSource === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS_SOURCE;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS_SOURCE = previousAddressSource;
    }
    if (previousTemporalAddress === undefined) {
      delete process.env.TEMPORAL_ADDRESS;
    } else {
      process.env.TEMPORAL_ADDRESS = previousTemporalAddress;
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
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

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
  let workerPid: number | undefined;
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
    workerPid = workerState.pid;
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
      if (workerPid !== undefined) process.kill(workerPid, 'SIGKILL');
    } catch {
      // The lifecycle under test should have removed the fixture process.
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
