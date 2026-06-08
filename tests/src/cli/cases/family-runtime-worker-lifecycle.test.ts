import { spawn } from 'node:child_process';
import net from 'node:net';
import { pathToFileURL } from 'node:url';

import { TestWorkflowEnvironment } from '@temporalio/testing';

import {
  assert,
  createFakeCodexFixture,
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
  runTemporalWorkerResidentLoop,
} from '../../../../src/family-runtime-temporal-provider-parts/worker-residency.ts';
import {
  stopOrphanTemporalForegroundWorkers,
} from '../../../../src/family-runtime-temporal-provider-parts/worker-process.ts';
import {
  inspectTemporalWorkerRuntimeDependencies,
} from '../../../../src/family-runtime-temporal-provider-parts/worker-dependencies.ts';
import {
  buildTemporalWorkerMutationGuard,
} from '../../../../src/family-runtime-temporal-provider-parts/worker-source-guard.ts';
import {
  currentWorkerSourceVersion,
  workerSourceVersionDiagnostic,
  workerSourceVersionsEquivalent,
} from '../../../../src/family-runtime-temporal-provider-parts/worker-state.ts';

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

test('Temporal worker source version currentness follows runtime content hash across source roots', () => {
  const hash = 'a'.repeat(64);
  const otherHash = 'b'.repeat(64);
  assert.equal(
    workerSourceVersionsEquivalent(
      `worker-runtime:/managed/runtime/current/opl/src:${hash}`,
      `worker-runtime:/Users/gaofeng/workspace/one-person-lab/src:${hash}`,
    ),
    true,
  );
  assert.equal(
    workerSourceVersionsEquivalent(
      `worker-runtime:/managed/runtime/current/opl/src:${hash}`,
      `worker-runtime:/Users/gaofeng/workspace/one-person-lab/src:${otherHash}`,
    ),
    false,
  );
  assert.equal(workerSourceVersionsEquivalent('git:old-worker-source', 'git:new-worker-source'), false);
  assert.equal(
    workerSourceVersionDiagnostic(
      `worker-runtime:/managed/runtime/current/opl/src:${hash}`,
      `worker-runtime:/Users/gaofeng/workspace/one-person-lab/src:${hash}`,
    ).diagnostic_id,
    'same_content_hash_different_source_root',
  );
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
    const configDir = path.dirname(sharedRoot);
    const configPath = path.join(configDir, 'developer-supervisor.json');
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
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, `${JSON.stringify({
      version: 'g1',
      enabled: 'auto',
      mode: 'developer_apply_safe',
      auto_enable_github_login: 'gaofeng21cn',
      updated_at: '2026-06-01T00:00:00.000Z',
    })}\n`);
    const autoDeveloperMode = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });
    assert.equal(autoDeveloperMode.allowed, false);
    assert.equal(autoDeveloperMode.mutation_guard_status, 'blocked_developer_checkout_shared_state');
    assert.equal(autoDeveloperMode.developer_supervisor_override, false);

    fs.writeFileSync(configPath, `${JSON.stringify({
      version: 'g1',
      enabled: 'on',
      mode: 'external_observe',
      auto_enable_github_login: 'gaofeng21cn',
      updated_at: '2026-06-01T00:00:00.000Z',
    })}\n`);
    const observeDeveloperMode = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });
    assert.equal(observeDeveloperMode.allowed, false);
    assert.equal(observeDeveloperMode.mutation_guard_status, 'blocked_developer_checkout_shared_state');
    assert.equal(observeDeveloperMode.developer_supervisor_override, false);

    fs.writeFileSync(configPath, `${JSON.stringify({
      version: 'g1',
      enabled: 'on',
      mode: 'developer_apply_safe',
      auto_enable_github_login: 'gaofeng21cn',
      updated_at: '2026-06-01T00:00:00.000Z',
    })}\n`);
    const developerApplySafe = buildTemporalWorkerMutationGuard({
      moduleUrl: pathToFileURL(modulePath).href,
      paths: { root: sharedRoot },
    });
    assert.equal(developerApplySafe.allowed, true);
    assert.equal(developerApplySafe.mutation_guard_status, 'allowed_explicit_developer_supervisor');
    assert.equal(developerApplySafe.developer_supervisor_override, true);
    assert.equal(developerApplySafe.developer_supervisor_config?.enabled, 'on');
    assert.equal(developerApplySafe.developer_supervisor_config?.mode, 'developer_apply_safe');

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

    const state = JSON.parse(fs.readFileSync(path.join(workerRoot, 'temporal-worker.json'), 'utf8'));
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

test('Temporal worker detached start passes resolved Codex binary to foreground worker env', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-codex-env-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const codex = createFakeCodexFixture('printf \'{}\\n\'');
  const sourceModulePath = path.join(stateRoot, 'family-runtime-temporal-provider.ts');
  const temporalServer = await createFakeTemporalServer();
  const previousPath = process.env.PATH;
  const previousCodexBin = process.env.OPL_CODEX_BIN;
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  const previousWorkerStatus = process.env.OPL_TEMPORAL_WORKER_STATUS;
  const previousSourceVersion = process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION;
  try {
    fs.mkdirSync(path.dirname(sourceModulePath), { recursive: true });
    fs.writeFileSync(sourceModulePath, 'export const workerRuntime = 1;\n');
    process.env.PATH = `${codex.fixtureRoot}:${process.env.PATH ?? ''}`;
    delete process.env.OPL_CODEX_BIN;
    process.env.OPL_TEMPORAL_ADDRESS = temporalServer.address;
    delete process.env.OPL_TEMPORAL_WORKER_STATUS;
    process.env.OPL_TEMPORAL_WORKER_SOURCE_VERSION = `worker-runtime:${path.dirname(sourceModulePath)}:${'a'.repeat(64)}`;

    const start = await startTemporalWorkerLifecycle({ root: workerRoot });

    assert.equal(start.start_status, 'started');
    assert.equal(start.spawned_worker_environment?.OPL_CODEX_BIN, codex.codexPath);
    assert.equal(start.spawned_worker_environment?.codex_binary_source, 'path');
    assert.equal(start.spawned_worker_environment?.OPL_TEMPORAL_ADDRESS, temporalServer.address);
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
      process.kill(JSON.parse(fs.readFileSync(path.join(workerRoot, 'temporal-worker.json'), 'utf8')).pid, 'SIGKILL');
    } catch {
      // The lifecycle under test may have exited before cleanup.
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(codex.fixtureRoot, { recursive: true, force: true });
    await temporalServer.close();
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
