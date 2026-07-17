import { DatabaseSync } from 'node:sqlite';
import net from 'node:net';

import { assert, fs, os, path, test } from '../helpers.ts';
import { parseRegisteredFamilyRuntimeCommand } from '../../../../src/modules/runway/family-runtime-command-parts/registry.ts';
import { compactFastProviderState } from '../../../../src/modules/console/app-state.ts';
import { createFamilyRuntimeQueueTables } from '../../../../src/modules/runway/family-runtime-store.ts';
import {
  buildTemporalServiceSupervisorPlist,
  runTemporalServiceSupervisorCommand,
} from '../../../../src/modules/runway/family-runtime-temporal-service-supervisor.ts';
import {
  temporalServiceSupervisorConfigPath,
  temporalServiceSupervisorPlistPath,
  type TemporalServiceSupervisorLaunchctlResult,
} from '../../../../src/modules/runway/family-runtime-temporal-service-supervisor-state.ts';
import type { TemporalServiceLauncher } from '../../../../src/modules/runway/family-runtime-temporal-service.ts';
import { inspectTemporalServiceLifecycle } from '../../../../src/modules/runway/family-runtime-temporal-service.ts';
import { restartTemporalServiceLifecycle } from '../../../../src/modules/runway/family-runtime-temporal-service-command.ts';
import { inspectTemporalWorkerLifecycleFast } from '../../../../src/modules/runway/family-runtime-temporal-provider-parts/worker-lifecycle-fast.ts';

function createFixture() {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-supervisor-'));
  const root = path.join(stateDir, 'family-runtime');
  const launchAgentsDir = path.join(stateDir, 'home', 'Library', 'LaunchAgents');
  const temporalExecutablePath = path.join(stateDir, 'runtime', 'bin', 'temporal');
  fs.mkdirSync(path.dirname(temporalExecutablePath), { recursive: true });
  fs.writeFileSync(temporalExecutablePath, '#!/bin/sh\nexit 0\n', 'utf8');
  fs.chmodSync(temporalExecutablePath, 0o755);
  const temporalExecutable = fs.realpathSync(temporalExecutablePath);
  const paths = {
    state_dir: stateDir,
    root,
    queue_db: path.join(root, 'queue.sqlite'),
    dispatch_dir: path.join(root, 'dispatch'),
    proof_dir: path.join(root, 'proofs'),
    latest_temporal_production_proof: path.join(root, 'proofs', 'latest-temporal-production-proof.json'),
  };
  const db = new DatabaseSync(':memory:');
  createFamilyRuntimeQueueTables(db);
  const launcher: TemporalServiceLauncher = {
    serviceKind: 'temporal_cli',
    source: 'explicit_temporal_cli_path',
    executable: temporalExecutable,
    args: ['server', 'start-dev', '--ip', '127.0.0.1', '--port', '7233'],
    command: `${temporalExecutable} server start-dev --ip 127.0.0.1 --port 7233`,
    address: '127.0.0.1:7233',
  };
  return {
    stateDir,
    paths,
    db,
    launcher,
    launchAgentsDir,
    close() {
      db.close();
      fs.rmSync(stateDir, { recursive: true, force: true });
    },
  };
}

function launchctlResult(args: string[], ok: boolean, stdout = '', stderr = ''): TemporalServiceSupervisorLaunchctlResult {
  return {
    ok,
    status: ok ? 0 : 1,
    stdout,
    stderr,
    args,
  };
}

function createFakeLaunchctl(options: { replacePidOnKickstart?: boolean } = {}) {
  let loaded = false;
  let bootstrapCount = 0;
  let pid = 4242;
  const calls: string[][] = [];
  return {
    calls,
    get loaded() {
      return loaded;
    },
    get bootstrapCount() {
      return bootstrapCount;
    },
    run(args: string[]) {
      calls.push(args);
      if (args[0] === 'print') {
        return loaded
          ? launchctlResult(args, true, `state = running\npid = ${pid}\nlast exit code = 0\n`)
          : launchctlResult(args, false, '', 'Could not find service');
      }
      if (args[0] === 'bootstrap') {
        bootstrapCount += 1;
        loaded = true;
        return launchctlResult(args, true);
      }
      if (args[0] === 'bootout') {
        loaded = false;
        return launchctlResult(args, true);
      }
      if (args[0] === 'kickstart') {
        loaded = true;
        if (options.replacePidOnKickstart !== false) {
          pid += 1;
        }
        return launchctlResult(args, true);
      }
      return launchctlResult(args, false, '', `unexpected launchctl args: ${args.join(' ')}`);
    },
  };
}

test('Temporal service supervisor CLI parses the explicit lifecycle without conflating scheduler state', () => {
  assert.deepEqual(parseRegisteredFamilyRuntimeCommand([
    'service',
    'restart',
    '--provider',
    'temporal',
  ]), {
    mode: 'service_restart',
    providerKind: 'temporal',
    detach: true,
  });
  assert.deepEqual(parseRegisteredFamilyRuntimeCommand([
    'service',
    'supervisor',
    'status',
    '--provider',
    'temporal',
  ]), {
    mode: 'service_status',
    providerKind: 'temporal',
    supervisorAction: 'status',
  });
  assert.deepEqual(parseRegisteredFamilyRuntimeCommand([
    'service',
    'supervisor',
    'install',
    '--provider',
    'temporal',
  ]), {
    mode: 'service_start',
    providerKind: 'temporal',
    supervisorAction: 'install',
  });
  assert.deepEqual(parseRegisteredFamilyRuntimeCommand([
    'service',
    'supervisor',
    'trigger',
    '--provider',
    'temporal',
  ]), {
    mode: 'service_start',
    providerKind: 'temporal',
    supervisorAction: 'trigger',
  });
  assert.deepEqual(parseRegisteredFamilyRuntimeCommand([
    'service',
    'supervisor',
    'remove',
    '--provider',
    'temporal',
  ]), {
    mode: 'service_stop',
    providerKind: 'temporal',
    supervisorAction: 'remove',
  });
});

test('external and non-Darwin Temporal services project supervisor as not applicable without a false error', async () => {
  const fixture = createFixture();
  const server = net.createServer((socket) => socket.end());
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const serverAddress = server.address();
  assert.equal(typeof serverAddress, 'object');
  const port = typeof serverAddress === 'object' && serverAddress ? serverAddress.port : 0;
  process.env.OPL_TEMPORAL_ADDRESS = `127.0.0.1:${port}`;
  try {
    const lifecycle = await inspectTemporalServiceLifecycle(fixture.paths, {
      platform: 'linux',
      launchAgentsDir: fixture.launchAgentsDir,
      now: () => '2026-07-17T01:00:00.000Z',
    });

    assert.equal(lifecycle.service_status, 'external_running');
    assert.equal(lifecycle.supervisor.status, 'not_applicable');
    assert.equal(lifecycle.supervisor.supported, false);
    assert.equal(lifecycle.supervisor.applicable, false);
    assert.equal(lifecycle.supervisor.required, false);
    assert.equal(lifecycle.supervisor.ready, null);
    assert.equal(lifecycle.supervisor.error, null);
    assert.equal(lifecycle.repair_action.action_id, 'none');

    const restart = await restartTemporalServiceLifecycle(fixture.db, fixture.paths, {
      platform: 'linux',
      launchAgentsDir: fixture.launchAgentsDir,
    });
    assert.equal(restart.restart_status, 'not_applicable');
    assert.equal(restart.applicable, false);
    assert.equal(restart.reason, 'external_service_owned_outside_opl');
    assert.equal(restart.ready, true);
  } finally {
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fixture.close();
  }
});

test('a reachable detached macOS Temporal service still requires supervisor installation', async () => {
  const fixture = createFixture();
  const server = net.createServer((socket) => socket.end());
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  delete process.env.OPL_TEMPORAL_ADDRESS;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const serverAddress = server.address();
  assert.equal(typeof serverAddress, 'object');
  const port = typeof serverAddress === 'object' && serverAddress ? serverAddress.port : 0;
  fs.mkdirSync(fixture.paths.root, { recursive: true });
  fs.writeFileSync(path.join(fixture.paths.root, 'temporal-service.json'), `${JSON.stringify({
    provider_kind: 'temporal',
    service_kind: 'temporal_cli',
    pid: process.pid,
    address: `127.0.0.1:${port}`,
    started_at: '2026-07-17T00:59:00.000Z',
    status: 'running',
    command: `${fixture.launcher.executable} server start-dev`,
  }, null, 2)}\n`, 'utf8');
  try {
    const lifecycle = await inspectTemporalServiceLifecycle(fixture.paths, {
      platform: 'darwin',
      launchAgentsDir: fixture.launchAgentsDir,
      launchctlTarget: 'gui/501',
      runLaunchctl: (args) => launchctlResult(args, false, '', 'not loaded'),
    });

    assert.equal(lifecycle.service_status, 'running');
    assert.equal(lifecycle.supervisor.supported, true);
    assert.equal(lifecycle.supervisor.applicable, true);
    assert.equal(lifecycle.supervisor.required, true);
    assert.equal(lifecycle.supervisor.ready, false);
    assert.equal(lifecycle.repair_action.action_id, 'install_temporal_service_supervisor');
    assert.equal(
      lifecycle.repair_action.next_command,
      'opl family-runtime service supervisor install --provider temporal',
    );
  } finally {
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fixture.close();
  }
});

test('packaged local Temporal address provenance remains managed while an unproven address remains external', async () => {
  const fixture = createFixture();
  const fakeLaunchctl = createFakeLaunchctl();
  const baseRuntime = {
    platform: 'darwin' as const,
    launchAgentsDir: fixture.launchAgentsDir,
    launchctlTarget: 'gui/501',
    runLaunchctl: (args: string[]) => fakeLaunchctl.run(args),
  };
  try {
    const managed = await inspectTemporalServiceLifecycle(fixture.paths, {
      ...baseRuntime,
      env: {
        OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
        OPL_TEMPORAL_ADDRESS_SOURCE: 'packaged_local_default',
      },
    });
    assert.equal(managed.address_source, 'packaged_local_default');
    assert.equal(managed.supervisor.applicable, true);
    assert.equal(managed.supervisor.required, true);

    const external = await inspectTemporalServiceLifecycle(fixture.paths, {
      ...baseRuntime,
      env: { OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233' },
    });
    assert.equal(external.address_source, 'environment');
    assert.equal(external.supervisor.applicable, false);
    assert.equal(external.supervisor.required, false);
    assert.equal(fakeLaunchctl.calls.every((args) => args[0] === 'print'), true);
  } finally {
    fixture.close();
  }
});

test('Temporal service supervisor installs an idempotent direct-executable launchd job and reports explicit readiness', async () => {
  const fixture = createFixture();
  const fakeLaunchctl = createFakeLaunchctl();
  const runtime = {
    platform: 'darwin' as const,
    launchAgentsDir: fixture.launchAgentsDir,
    launchctlTarget: 'gui/501',
    runLaunchctl: (args: string[]) => fakeLaunchctl.run(args),
    env: {
      OPL_TEMPORAL_ADDRESS: '127.0.0.1:7233',
      OPL_TEMPORAL_ADDRESS_SOURCE: 'packaged_local_default',
      OPL_TEMPORAL_CLI_PATH: fixture.launcher.executable,
      PATH: '',
    },
    probeServer: async () => fakeLaunchctl.loaded,
    readinessTimeoutMs: 0,
    now: () => '2026-07-17T00:00:00.000Z',
  };
  try {
    const first = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'install', runtime);
    const plistPath = temporalServiceSupervisorPlistPath(runtime);
    const plist = fs.readFileSync(plistPath, 'utf8');

    assert.equal(first.status, 'ready', JSON.stringify(first.supervisor.configuration_checks));
    assert.equal(first.supervisor.installed, true);
    assert.equal(first.supervisor.loaded, true);
    assert.equal(first.supervisor.ready, true);
    assert.equal(first.supervisor.observed_at, '2026-07-17T00:00:00.000Z');
    assert.equal(first.supervisor.error, null);
    assert.equal(first.supervisor.schedule_independent, true);
    assert.equal(first.supervisor.throttle_interval_seconds, 15);
    assert.match(plist, new RegExp(fixture.launcher.executable.replaceAll('/', '\\/')));
    assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
    assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/);
    assert.match(plist, /<key>ThrottleInterval<\/key>\s*<integer>15<\/integer>/);
    assert.match(plist, new RegExp(`<key>WorkingDirectory<\\/key>\\s*<string>${fixture.paths.root.replaceAll('/', '\\/')}<\\/string>`));
    assert.equal(plist.includes('/Users/gaofeng/workspace/one-person-lab'), false);
    assert.match(plist, /<key>PATH<\/key>\s*<string>\/usr\/bin:\/bin:\/usr\/sbin:\/sbin<\/string>/);
    const configPath = temporalServiceSupervisorConfigPath(fixture.paths);
    const configRaw = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configRaw) as {
      database_path: string;
      launcher_args: string[];
      launcher_sha256: string;
      plist_sha256: string;
    };
    const databaseArgumentIndex = config.launcher_args.indexOf('--db-filename');
    assert.equal(path.isAbsolute(config.database_path), true);
    assert.equal(config.launcher_args[databaseArgumentIndex + 1], config.database_path);
    assert.equal(plist.includes(config.database_path), true);
    assert.equal(fs.existsSync(path.dirname(config.database_path)), true);
    assert.match(config.launcher_sha256, /^[a-f0-9]{64}$/);
    assert.match(config.plist_sha256, /^[a-f0-9]{64}$/);
    assert.equal(buildTemporalServiceSupervisorPlist(fixture.paths, {
      ...fixture.launcher,
      args: config.launcher_args,
      command: [fixture.launcher.executable, ...config.launcher_args].join(' '),
    }), plist);

    const second = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'install', runtime);
    assert.equal(second.status, 'already_ready');
    assert.equal(fakeLaunchctl.bootstrapCount, 1);

    const status = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'status', runtime);
    assert.equal(status.supervisor.status, 'loaded_running');
    assert.equal(status.supervisor.pid, 4242);
    assert.equal(status.supervisor.last_exit_status, 0);

    fs.writeFileSync(configPath, `${JSON.stringify({
      ...config,
      database_path: path.join(fixture.paths.root, 'temporal-server', 'drift.sqlite'),
    }, null, 2)}\n`, 'utf8');
    const drifted = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'status', runtime);
    assert.equal(drifted.supervisor.configuration_current, false);
    assert.equal(drifted.supervisor.ready, false);
    assert.equal(drifted.supervisor.error, 'temporal_service_supervisor_configuration_drift');
    fs.writeFileSync(configPath, configRaw, 'utf8');

    fs.writeFileSync(plistPath, plist.replace('<key>KeepAlive</key>\n  <true/>', '<key>KeepAlive</key>\n  <false/>'), 'utf8');
    const plistDrifted = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'status', runtime);
    assert.equal(plistDrifted.supervisor.configuration_current, false);
    assert.equal(plistDrifted.supervisor.ready, false);
    assert.equal(plistDrifted.supervisor.error, 'temporal_service_supervisor_configuration_drift');
    fs.writeFileSync(plistPath, plist, 'utf8');

    const missingExecutablePath = `${fixture.launcher.executable}.missing-fixture`;
    fs.renameSync(fixture.launcher.executable, missingExecutablePath);
    const launcherMissing = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'status', runtime);
    assert.equal(launcherMissing.supervisor.configuration_current, false);
    assert.equal(launcherMissing.supervisor.ready, false);
    assert.equal(launcherMissing.supervisor.error, 'temporal_service_supervisor_configuration_drift');
    fs.renameSync(missingExecutablePath, fixture.launcher.executable);

    const restored = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'status', runtime);
    assert.equal(restored.supervisor.configuration_current, true);
    assert.equal(restored.supervisor.ready, true);

    const triggered = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'trigger', runtime);
    assert.equal(triggered.status, 'ready');
    assert.equal(fakeLaunchctl.calls.some((args) => args[0] === 'kickstart' && args[1] === '-k'), true);

    const removed = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'remove', runtime);
    assert.equal(removed.status, 'removed');
    assert.equal(removed.supervisor.installed, false);
    assert.equal(fs.existsSync(plistPath), false);
    assert.equal(fs.existsSync(temporalServiceSupervisorConfigPath(fixture.paths)), false);

    const removedAgain = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'remove', runtime);
    assert.equal(removedAgain.status, 'already_removed');
  } finally {
    fixture.close();
  }
});

test('Temporal supervisor adopts a reachable detached server only after bounded stop and port release', async () => {
  const fixture = createFixture();
  const fakeLaunchctl = createFakeLaunchctl();
  let detachedRunning = true;
  let stopCount = 0;
  let restartCount = 0;
  const order: string[] = [];
  try {
    const result = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'install', {
      platform: 'darwin',
      launchAgentsDir: fixture.launchAgentsDir,
      launchctlTarget: 'gui/501',
      runLaunchctl: (args) => {
        if (args[0] === 'bootstrap') order.push('bootstrap');
        return fakeLaunchctl.run(args);
      },
      resolveLauncher: () => fixture.launcher,
      inspectDetachedService: () => ({
        surface_kind: 'temporal_detached_service_state',
        state: null,
        running: detachedRunning,
        pid: 80437,
        address: fixture.launcher.address,
        service_kind: 'temporal_cli',
      }),
      stopDetachedService: (async () => {
        stopCount += 1;
        order.push('stop_detached');
        detachedRunning = false;
        return { stop_status: 'stopped' } as never;
      }),
      startDetachedService: (async () => {
        restartCount += 1;
        return { status: { service_status: 'running' } } as never;
      }),
      probeServer: async () => detachedRunning || fakeLaunchctl.loaded,
      readinessTimeoutMs: 0,
      now: () => '2026-07-17T00:00:00.000Z',
    });

    assert.equal(result.status, 'ready');
    assert.equal(result.ready, true);
    assert.equal(result.detached_service_migration?.status, 'adopted_by_supervisor');
    assert.equal(stopCount, 1);
    assert.equal(restartCount, 0);
    assert.deepEqual(order, ['stop_detached', 'bootstrap']);
  } finally {
    fixture.close();
  }
});

test('Temporal supervisor restores exact prior files when bootstrap fails', async () => {
  const fixture = createFixture();
  const plistPath = temporalServiceSupervisorPlistPath({ launchAgentsDir: fixture.launchAgentsDir });
  const configPath = temporalServiceSupervisorConfigPath(fixture.paths);
  const oldPlist = 'old plist bytes\n';
  const oldConfig = 'old config bytes\n';
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(plistPath, oldPlist, 'utf8');
  fs.writeFileSync(configPath, oldConfig, 'utf8');
  try {
    const result = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'install', {
      platform: 'darwin',
      launchAgentsDir: fixture.launchAgentsDir,
      launchctlTarget: 'gui/501',
      resolveLauncher: () => fixture.launcher,
      runLaunchctl: (args) => args[0] === 'bootstrap'
        ? launchctlResult(args, false, '', 'fixture bootstrap failed')
        : launchctlResult(args, args[0] === 'bootout'),
      probeServer: async () => false,
      readinessTimeoutMs: 0,
    });

    assert.equal(result.status, 'blocked_bootstrap_failed');
    assert.equal(result.ready, false);
    assert.equal(result.rollback?.status, 'restored');
    assert.equal(fs.readFileSync(plistPath, 'utf8'), oldPlist);
    assert.equal(fs.readFileSync(configPath, 'utf8'), oldConfig);
  } finally {
    fixture.close();
  }
});

test('Temporal supervisor removes an unready adopted job and restores the detached server', async () => {
  const fixture = createFixture();
  const fakeLaunchctl = createFakeLaunchctl();
  let detachedRunning = true;
  let restartCount = 0;
  try {
    const result = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'install', {
      platform: 'darwin',
      launchAgentsDir: fixture.launchAgentsDir,
      launchctlTarget: 'gui/501',
      runLaunchctl: (args) => fakeLaunchctl.run(args),
      resolveLauncher: () => fixture.launcher,
      inspectDetachedService: () => ({
        surface_kind: 'temporal_detached_service_state',
        state: null,
        running: detachedRunning,
        pid: 80437,
        address: fixture.launcher.address,
        service_kind: 'temporal_cli',
      }),
      stopDetachedService: (async () => {
        detachedRunning = false;
        return { stop_status: 'stopped' } as never;
      }),
      startDetachedService: (async () => {
        restartCount += 1;
        detachedRunning = true;
        return { status: { service_status: 'running' } } as never;
      }),
      probeServer: async () => detachedRunning,
      readinessTimeoutMs: 0,
    });

    assert.equal(result.status, 'blocked_supervisor_unready_detached_restored');
    assert.equal(result.ready, false);
    assert.equal(result.detached_service_migration?.status, 'rolled_back_to_detached');
    assert.equal(restartCount, 1);
    assert.equal(fakeLaunchctl.loaded, false);
    assert.equal(fs.existsSync(temporalServiceSupervisorPlistPath({ launchAgentsDir: fixture.launchAgentsDir })), false);
    assert.equal(fs.existsSync(temporalServiceSupervisorConfigPath(fixture.paths)), false);
  } finally {
    fixture.close();
  }
});

test('managed macOS Temporal restart uses kickstart -k and only succeeds after fresh service and supervisor readback', async () => {
  const fixture = createFixture();
  const fakeLaunchctl = createFakeLaunchctl();
  const server = net.createServer((socket) => socket.end());
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  delete process.env.OPL_TEMPORAL_ADDRESS;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const serverAddress = server.address();
  assert.equal(typeof serverAddress, 'object');
  const port = typeof serverAddress === 'object' && serverAddress ? serverAddress.port : 0;
  const launcher: TemporalServiceLauncher = {
    ...fixture.launcher,
    address: `127.0.0.1:${port}`,
    args: ['server', 'start-dev', '--ip', '127.0.0.1', '--port', String(port)],
    command: `${fixture.launcher.executable} server start-dev --ip 127.0.0.1 --port ${port}`,
  };
  const runtime = {
    platform: 'darwin' as const,
    launchAgentsDir: fixture.launchAgentsDir,
    launchctlTarget: 'gui/501',
    runLaunchctl: (args: string[]) => fakeLaunchctl.run(args),
    resolveLauncher: () => launcher,
    probeServer: async () => true,
    readinessTimeoutMs: 0,
    now: () => '2026-07-17T01:01:00.000Z',
  };
  try {
    const installed = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'install', runtime);
    assert.equal(installed.ready, true);
    const callCountBeforeRestart = fakeLaunchctl.calls.length;

    const restarted = await restartTemporalServiceLifecycle(fixture.db, fixture.paths, runtime);
    const restartCalls = fakeLaunchctl.calls.slice(callCountBeforeRestart);

    assert.equal(restarted.restart_status, 'restarted');
    assert.equal(restarted.applicable, true);
    assert.equal(restarted.ready, true);
    assert.equal(restarted.status.service_status, 'running');
    assert.equal(restarted.status.supervisor.required, true);
    assert.equal(restarted.status.supervisor.ready, true);
    assert.equal(restarted.status.supervisor.error, null);
    assert.equal(restarted.previous_supervisor_pid, 4242);
    assert.equal(restarted.supervisor_pid, 4243);
    assert.equal(restarted.supervisor_pid_changed, true);
    assert.equal(restarted.supervisor_operation?.action, 'trigger');
    assert.equal(restarted.supervisor_operation?.status, 'ready');
    assert.deepEqual(
      restartCalls.find((args) => args[0] === 'kickstart'),
      ['kickstart', '-k', 'gui/501/ai.opl.family-runtime.temporal-service'],
    );
  } finally {
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fixture.close();
  }
});

test('managed macOS Temporal restart fails closed when kickstart keeps the same supervisor PID', async () => {
  const fixture = createFixture();
  const fakeLaunchctl = createFakeLaunchctl({ replacePidOnKickstart: false });
  const server = net.createServer((socket) => socket.end());
  const previousAddress = process.env.OPL_TEMPORAL_ADDRESS;
  delete process.env.OPL_TEMPORAL_ADDRESS;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const serverAddress = server.address();
  assert.equal(typeof serverAddress, 'object');
  const port = typeof serverAddress === 'object' && serverAddress ? serverAddress.port : 0;
  const launcher: TemporalServiceLauncher = {
    ...fixture.launcher,
    address: `127.0.0.1:${port}`,
    args: ['server', 'start-dev', '--ip', '127.0.0.1', '--port', String(port)],
    command: `${fixture.launcher.executable} server start-dev --ip 127.0.0.1 --port ${port}`,
  };
  const runtime = {
    platform: 'darwin' as const,
    launchAgentsDir: fixture.launchAgentsDir,
    launchctlTarget: 'gui/501',
    runLaunchctl: (args: string[]) => fakeLaunchctl.run(args),
    resolveLauncher: () => launcher,
    probeServer: async () => true,
    readinessTimeoutMs: 0,
    now: () => '2026-07-17T01:01:30.000Z',
  };
  try {
    const installed = await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'install', runtime);
    assert.equal(installed.ready, true);

    const restarted = await restartTemporalServiceLifecycle(fixture.db, fixture.paths, runtime);

    assert.equal(restarted.restart_status, 'restart_unready');
    assert.equal(restarted.applicable, true);
    assert.equal(restarted.ready, false);
    assert.equal(restarted.reason, 'supervisor_pid_not_replaced');
    assert.equal(restarted.previous_supervisor_pid, 4242);
    assert.equal(restarted.supervisor_pid, 4242);
    assert.equal(restarted.supervisor_pid_changed, false);
    assert.equal(restarted.status.service_status, 'running');
    assert.equal(restarted.status.supervisor.ready, true);
    assert.equal(restarted.supervisor_operation?.status, 'ready');
  } finally {
    if (previousAddress === undefined) {
      delete process.env.OPL_TEMPORAL_ADDRESS;
    } else {
      process.env.OPL_TEMPORAL_ADDRESS = previousAddress;
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fixture.close();
  }
});

test('full and compact fast projections preserve fresh supervisor readiness fields', async () => {
  const fixture = createFixture();
  const fakeLaunchctl = createFakeLaunchctl();
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const serverAddress = server.address();
  assert.equal(typeof serverAddress, 'object');
  const port = typeof serverAddress === 'object' && serverAddress ? serverAddress.port : 0;
  const launcher: TemporalServiceLauncher = {
    ...fixture.launcher,
    address: `127.0.0.1:${port}`,
    args: ['server', 'start-dev', '--ip', '127.0.0.1', '--port', String(port)],
    command: `${fixture.launcher.executable} server start-dev --ip 127.0.0.1 --port ${port}`,
  };
  const serviceRuntime = {
    platform: 'darwin' as const,
    launchAgentsDir: fixture.launchAgentsDir,
    launchctlTarget: 'gui/501',
    runLaunchctl: (args: string[]) => fakeLaunchctl.run(args),
    now: () => '2026-07-17T01:02:03.000Z',
  };
  try {
    await runTemporalServiceSupervisorCommand(fixture.db, fixture.paths, 'install', {
      ...serviceRuntime,
      resolveLauncher: () => launcher,
      probeServer: async () => true,
      readinessTimeoutMs: 0,
    });
    const callCountBeforeReadback = fakeLaunchctl.calls.length;
    const full = await inspectTemporalServiceLifecycle(fixture.paths, serviceRuntime);
    assert.equal(full.supervisor.installed, true);
    assert.equal(full.supervisor.loaded, true);
    assert.equal(full.supervisor.ready, true);
    assert.equal(full.supervisor.observed_at, '2026-07-17T01:02:03.000Z');
    assert.equal(full.supervisor.error, null);
    assert.equal(full.supervisor.supported, true);
    assert.equal(full.supervisor.applicable, true);
    assert.equal(full.supervisor.required, true);

    const fast = await inspectTemporalWorkerLifecycleFast(fixture.paths, { serviceRuntime });
    assert.equal(fast.service_ready, true);
    assert.equal(fast.server_reachable, true);
    const fastLifecycle = fast.temporal_service_lifecycle as Record<string, any>;
    assert.equal((fastLifecycle.supervisor as Record<string, unknown>).ready, true);
    const compact = compactFastProviderState({
      selected_provider: 'temporal',
      temporal: {
        details: {
          worker_readiness: fast,
        },
      },
    });
    const compactSupervisor = (
      compact.temporal.details.worker_readiness.temporal_service_lifecycle as Record<string, any>
    ).supervisor as Record<string, unknown>;
    assert.deepEqual({
      installed: compactSupervisor.installed,
      loaded: compactSupervisor.loaded,
      ready: compactSupervisor.ready,
      observed_at: compactSupervisor.observed_at,
      error: compactSupervisor.error,
      supported: compactSupervisor.supported,
      applicable: compactSupervisor.applicable,
      required: compactSupervisor.required,
    }, {
      installed: true,
      loaded: true,
      ready: true,
      observed_at: '2026-07-17T01:02:03.000Z',
      error: null,
      supported: true,
      applicable: true,
      required: true,
    });
    const readbackCalls = fakeLaunchctl.calls.slice(callCountBeforeReadback);
    assert.equal(readbackCalls.length > 0, true);
    assert.equal(readbackCalls.every((args) => args[0] === 'print'), true);
    assert.equal(
      readbackCalls.some((args) => ['bootstrap', 'bootout', 'kickstart'].includes(args[0] ?? '')),
      false,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fixture.close();
  }
});
