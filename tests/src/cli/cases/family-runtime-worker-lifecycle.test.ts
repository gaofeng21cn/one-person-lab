import { spawn } from 'node:child_process';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

import { TestWorkflowEnvironment } from '@temporalio/testing';

import {
  assert,
  fs,
  os,
  path,
  test,
} from '../helpers.ts';
import {
  buildTemporalStageAttemptWorkerOptionsForTest,
  buildTemporalWorkerReadiness,
  inspectTemporalWorkerLifecycle,
  startTemporalWorkerLifecycle,
  stopTemporalWorkerLifecycle,
} from '../../../../src/family-runtime-temporal-provider.ts';
import {
  inspectTemporalWorkerRuntimeDependencies,
} from '../../../../src/family-runtime-temporal-provider-parts/worker-dependencies.ts';
import {
  buildTemporalWorkerMutationGuard,
} from '../../../../src/family-runtime-temporal-provider-parts/worker-source-guard.ts';
import { currentWorkerSourceVersion } from '../../../../src/family-runtime-temporal-provider-parts/worker-state.ts';

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

test('Temporal worker source version ignores documentation-only git HEAD drift', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-runtime-source-version-'));
  const srcRoot = path.join(repoRoot, 'src');
  const modulePath = path.join(srcRoot, 'family-runtime-temporal-provider.ts');
  const helperPath = path.join(srcRoot, 'family-runtime-temporal-provider-parts', 'worker-state.ts');
  const docsPath = path.join(repoRoot, 'docs', 'status.md');
  const headPath = path.join(repoRoot, '.git', 'refs', 'heads', 'main');
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    fs.mkdirSync(path.dirname(modulePath), { recursive: true });
    fs.mkdirSync(path.dirname(helperPath), { recursive: true });
    fs.mkdirSync(path.dirname(docsPath), { recursive: true });
    fs.mkdirSync(path.dirname(headPath), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(headPath, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');
    fs.writeFileSync(modulePath, 'export const workerRuntime = 1;\n');
    fs.writeFileSync(helperPath, 'export const helperRuntime = 1;\n');
    fs.writeFileSync(docsPath, 'initial docs\n');

    const initial = currentWorkerSourceVersion(pathToFileURL(modulePath).href);
    fs.writeFileSync(headPath, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb\n');
    fs.writeFileSync(docsPath, 'updated docs\n');
    const docsOnly = currentWorkerSourceVersion(pathToFileURL(modulePath).href);
    fs.writeFileSync(modulePath, 'export const workerRuntime = 2;\n');
    const runtimeChanged = currentWorkerSourceVersion(pathToFileURL(modulePath).href);

    assert.equal(docsOnly, initial);
    assert.notEqual(runtimeChanged, initial);
    fs.writeFileSync(helperPath, 'export const helperRuntime = 2;\n');
    assert.notEqual(currentWorkerSourceVersion(pathToFileURL(modulePath).href), runtimeChanged);
  } finally {
    if (previousSourceVersion === undefined) {
      delete process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
    } else {
      process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = previousSourceVersion;
    }
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('Temporal worker mutation guard blocks developer checkout against default shared state', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-source-guard-home-'));
  const devRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-worker-source-guard-dev-'));
  const modulePath = path.join(devRoot, 'src', 'family-runtime-temporal-provider.ts');
  const previousHome = process.env.HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousAllow = process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER;
  try {
    fs.mkdirSync(path.dirname(modulePath), { recursive: true });
    fs.mkdirSync(path.join(devRoot, 'bin'), { recursive: true });
    fs.mkdirSync(path.join(devRoot, '.git', 'refs', 'heads'), { recursive: true });
    fs.writeFileSync(path.join(devRoot, 'package.json'), '{"name":"one-person-lab"}\n');
    fs.writeFileSync(path.join(devRoot, 'bin', 'opl'), '#!/bin/sh\n');
    fs.writeFileSync(modulePath, 'export const fixture = true;\n');
    fs.writeFileSync(path.join(devRoot, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    fs.writeFileSync(path.join(devRoot, '.git', 'refs', 'heads', 'main'), 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n');

    process.env.HOME = homeRoot;
    delete process.env.OPL_STATE_DIR;
    delete process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER;

    const sharedRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state', 'family-runtime');
    const blocked = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });
    const readiness = buildTemporalWorkerReadiness({
      address: '127.0.0.1:7233',
      serverReachable: true,
      workerStatus: null,
      workerMutationGuard: blocked,
    });
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.mutation_guard_status, 'blocked_developer_checkout_shared_state');
    assert.equal(blocked.source_is_git_checkout, true);
    assert.equal(blocked.state_dir_explicit, false);
    assert.equal(readiness.worker_mutation_guard?.mutation_guard_status, 'blocked_developer_checkout_shared_state');
    assert.equal(readiness.repair_action.action_id, 'start_temporal_worker');

    process.env.OPL_STATE_DIR = path.join(homeRoot, 'explicit-dev-state');
    const explicitState = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: path.join(process.env.OPL_STATE_DIR, 'family-runtime') },
    });
    assert.equal(explicitState.allowed, true);
    assert.equal(explicitState.mutation_guard_status, 'allowed_explicit_state_dir');

    delete process.env.OPL_STATE_DIR;
    process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER = '1';
    const explicitOverride = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });
    assert.equal(explicitOverride.allowed, true);
    assert.equal(explicitOverride.mutation_guard_status, 'allowed_explicit_developer_override');
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPL_STATE_DIR;
    } else {
      process.env.OPL_STATE_DIR = previousStateDir;
    }
    if (previousAllow === undefined) {
      delete process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER;
    } else {
      process.env.OPL_ALLOW_DEVELOPER_CHECKOUT_SHARED_WORKER = previousAllow;
    }
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(devRoot, { recursive: true, force: true });
  }
});

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

test('Temporal worker readiness blocks missing SWC native workflow bundler dependency', () => {
  const failingRequire = (() => {
    throw new Error('Failed to load native binding');
  }) as unknown as NodeJS.Require;
  Object.assign(failingRequire, {
    resolve: () => '/tmp/opl-runtime/node_modules/@swc/core/index.js',
    cache: {},
    extensions: {},
    main: undefined,
  });
  const dependencyHealth = inspectTemporalWorkerRuntimeDependencies({
    dependencyRequire: failingRequire,
  });
  const readiness = buildTemporalWorkerReadiness({
    address: '127.0.0.1:7233',
    serverReachable: true,
    workerStatus: 'ready',
    workerDependencyHealth: dependencyHealth,
  });

  assert.equal(dependencyHealth.status, 'blocked');
  assert.equal(dependencyHealth.blocker?.blocker_id, 'temporal_worker_swc_native_binding_unavailable');
  assert.equal(readiness.readiness_status, 'worker_dependency_unavailable');
  assert.equal(readiness.worker_ready, false);
  assert.deepEqual(readiness.blockers, ['temporal_worker_dependency_unavailable']);
  assert.equal(readiness.repair_action.action_id, 'repair_temporal_worker_runtime_dependencies');
  assert.match(readiness.repair_action.next_command ?? '', /npm install --include=optional/);
  assert.equal(readiness.authority_boundary.domain, 'truth_quality_artifact_gate_owner');
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
    assert.equal(requery.managed_worker_pid, null);
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
    let workerState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    while (Date.now() < deadline && workerState.source_version !== 'git:detached-worker-current') {
      await new Promise((resolve) => setTimeout(resolve, 50));
      workerState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
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

test('Temporal worker stop cleans orphan foreground worker after state file is missing', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-orphan-stop-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const testEnv = await TestWorkflowEnvironment.createTimeSkipping();
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
    const workerState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
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
      process.kill(JSON.parse(fs.readFileSync(path.join(workerRoot, 'temporal-worker.json'), 'utf8')).pid, 'SIGKILL');
    } catch {
      // The lifecycle under test should have removed the fixture process or state file.
    }
    await testEnv.teardown();
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
