import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

import {
  assert,
  createFakeCodexFixture,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  test,
} from '../helpers.ts';
import {
  resolveTemporalWorkerForegroundPaths,
} from '../../../../src/family-runtime-temporal-provider.ts';
import { resolveTemporalWorkerTaskQueue } from '../../../../src/family-runtime-temporal-provider-parts/worker-task-queue.ts';
import { startTemporalServiceLifecycle } from '../../../../src/family-runtime-temporal-service.ts';

function familyRuntimeEnv(stateRoot: string, extra: Record<string, string> = {}) {
  return {
    OPL_STATE_DIR: stateRoot,
    ...extra,
  };
}

function createTemporalResidencyCodexFixture() {
  const closeout = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:temporal-residency-domain-closeout'],
    consumed_refs: ['evidence:temporal-residency-table1'],
    consumed_memory_refs: ['memory:publication-route-stoploss'],
    writeback_receipt_refs: ['memory-writeback:temporal-residency-receipt'],
    rejected_writes: [{ reason: 'domain_truth_write_forbidden' }],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'bounded_repair',
      next_owner: 'med-autoscience',
    },
  };
  return createFakeCodexFixture(`
if [ "$1" = "exec" ]; then
  printf '{"type":"thread.started","thread_id":"thread-temporal-residency"}\\n'
  printf '{"type":"turn.started"}\\n'
  if printf '%s' "$*" | grep -q 'sat_temporal_residency_complete'; then
  printf '%s\\n' '${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', id: 'msg-closeout', text: JSON.stringify(closeout) } })}'
  fi
  printf '{"type":"turn.completed"}\\n'
  exit 0
fi
echo "unexpected fake codex args: $*" >&2
exit 64
`);
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

test('family-runtime service parser exposes local Temporal lifecycle status command', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-service-status-'));
  try {
    const output = runCli(
      ['family-runtime', 'service', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      }),
    );

    assert.equal(output.family_runtime_service.surface_id, 'opl_family_runtime_service');
    assert.equal(output.family_runtime_service.action, 'status');
    assert.equal(output.family_runtime_service.service_status, 'not_configured');
    assert.deepEqual(output.family_runtime_service.blockers, ['temporal_local_service_not_managed']);
    assert.equal(
      output.family_runtime_service.repair_action.next_command,
      'opl family-runtime service start --provider temporal',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime service start fails closed when no local Temporal launcher is available', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-service-start-missing-'));
  const previousCommand = process.env.OPL_TEMPORAL_SERVICE_START_COMMAND;
  const previousPath = process.env.PATH;
  try {
    delete process.env.OPL_TEMPORAL_SERVICE_START_COMMAND;
    process.env.PATH = '';

    await assert.rejects(
      () => startTemporalServiceLifecycle({ root: path.join(stateRoot, 'family-runtime') }),
      (error: any) => {
        assert.equal(error.code, 'contract_shape_invalid');
        assert.equal(error.details.service_status, 'launcher_missing');
        assert.deepEqual(error.details.required_launcher, [
          'temporal CLI on PATH',
          'OPL_TEMPORAL_SERVICE_START_COMMAND',
        ]);
        return true;
      },
    );
  } finally {
    if (previousCommand === undefined) {
      delete process.env.OPL_TEMPORAL_SERVICE_START_COMMAND;
    } else {
      process.env.OPL_TEMPORAL_SERVICE_START_COMMAND = previousCommand;
    }
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime service status preserves managed process crash diagnostics', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-service-crash-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const statePath = path.join(runtimeRoot, 'temporal-service.json');
  try {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: 987654321,
      address: '127.0.0.1:7233',
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'test temporal service crash',
      log_refs: {
        stdout_path: path.join(runtimeRoot, 'logs', 'temporal-service.stdout.log'),
        stderr_path: path.join(runtimeRoot, 'logs', 'temporal-service.stderr.log'),
      },
    }, null, 2)}\n`);

    const output = runCli(
      ['family-runtime', 'service', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      }),
    );
    const service = output.family_runtime_service;

    assert.equal(service.service_status, 'stale_state');
    assert.deepEqual(service.blockers, ['temporal_local_service_stale_state']);
    assert.equal(service.managed_service_pid, 987654321);
    assert.equal(service.crash_diagnostic.pid, 987654321);
    assert.equal(service.crash_diagnostic.exit_status, 'process_not_alive');
    assert.equal(service.crash_diagnostic.log_refs.stderr_path.endsWith('temporal-service.stderr.log'), true);
    assert.equal(fs.existsSync(statePath), true);
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

test('family-runtime worker status preserves managed worker crash diagnostics', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-worker-crash-'));
  const runtimeRoot = path.join(stateRoot, 'family-runtime');
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const statePath = path.join(runtimeRoot, 'temporal-worker.json');
  try {
    fs.mkdirSync(runtimeRoot, { recursive: true });
    fs.writeFileSync(statePath, `${JSON.stringify({
      provider_kind: 'temporal',
      pid: 987654322,
      address,
      namespace: 'default',
      task_queue: 'opl-stage-attempts',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'test-worker-source',
      log_refs: {
        stdout_path: path.join(runtimeRoot, 'logs', 'temporal-worker.stdout.log'),
        stderr_path: path.join(runtimeRoot, 'logs', 'temporal-worker.stderr.log'),
      },
    }, null, 2)}\n`);

    const output = runCli(
      ['family-runtime', 'worker', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: address,
        OPL_TEMPORAL_WORKER_STATUS: '',
      }),
    );
    const worker = output.family_runtime_worker;

    assert.equal(worker.lifecycle_status, 'worker_not_ready');
    assert.deepEqual(worker.blockers, ['temporal_worker_process_exited']);
    assert.equal(worker.managed_worker_pid, 987654322);
    assert.equal(worker.managed_worker_process_alive, false);
    assert.equal(worker.crash_diagnostic.pid, 987654322);
    assert.equal(worker.crash_diagnostic.exit_status, 'process_not_alive');
    assert.equal(worker.crash_diagnostic.log_refs.stderr_path.endsWith('temporal-worker.stderr.log'), true);
    assert.equal(fs.existsSync(statePath), true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
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

test('Temporal worker status consumes managed local service state without env address', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-service-worker-status-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const child = spawn(process.execPath, [
    '-e',
    'setTimeout(() => {}, 30_000);',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  try {
    assert.equal(typeof child.pid, 'number');
    fs.mkdirSync(workerRoot, { recursive: true });
    fs.writeFileSync(path.join(workerRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: child.pid,
      address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'test temporal service',
    }, null, 2)}\n`);

    const output = runCli(
      ['family-runtime', 'worker', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_TEMPORAL_WORKER_STATUS: '',
      }),
    );
    const worker = output.family_runtime_worker;

    assert.equal(worker.lifecycle_status, 'worker_not_ready');
    assert.equal(worker.server_reachable, true);
    assert.equal(worker.address, address);
    assert.equal(worker.address_source, 'managed_local_service_state');
    assert.equal(worker.temporal_service_lifecycle.service_status, 'running');
    assert.equal(worker.temporal_service_lifecycle.managed_service_pid, child.pid);
    assert.deepEqual(worker.blockers, ['temporal_worker_not_ready']);
  } finally {
    process.kill(child.pid!, 'SIGTERM');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime residency proof reports Temporal live-evidence gaps fail-closed', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-residency-proof-gap-'));
  try {
    const output = runCli(
      ['family-runtime', 'residency', 'proof', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      }),
    );
    const proof = output.family_runtime_residency_proof;

    assert.equal(proof.surface_kind, 'opl_temporal_production_residency_proof');
    assert.equal(proof.closeout_status, 'production_residency_needs_live_evidence');
    assert.equal(proof.proofs.lifecycle.proof_status, 'needs_live_residency');
    assert.equal(proof.proofs.lifecycle.lifecycle_status, 'not_configured');
    assert.equal(proof.proofs.typed_closeout_required.proof_status, 'needs_more_evidence');
    assert.equal(
      proof.authority_boundary.domain,
      'truth_quality_artifact_gate_owner',
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime residency proof --production requires external Temporal readiness', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-production-residency-gap-'));
  try {
    const output = runCli(
      ['family-runtime', 'residency', 'proof', '--provider', 'temporal', '--production'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      }),
    );
    const proof = output.family_runtime_residency_proof;
    const production = proof.production_residency_proof;
    const persistedProofRef = path.join(stateRoot, 'family-runtime', 'proofs', 'latest-temporal-production-proof.json');

    assert.equal(proof.proof_mode, 'external_temporal_service_worker');
    assert.equal(proof.persisted_proof_ref, persistedProofRef);
    assert.equal(fs.existsSync(persistedProofRef), true);
    const persisted = JSON.parse(fs.readFileSync(persistedProofRef, 'utf8'));
    assert.equal(persisted.family_runtime_residency_proof.closeout_status, 'production_residency_needs_live_evidence');
    assert.equal(persisted.family_runtime_residency_proof.proof_mode, 'external_temporal_service_worker');
    assert.equal(proof.closeout_status, 'production_residency_needs_live_evidence');
    assert.equal(production.surface_kind, 'opl_temporal_external_production_residency_proof');
    assert.equal(production.closeout_status, 'production_residency_blocked');
    assert.deepEqual(production.blockers, ['temporal_runtime_not_configured']);
    assert.equal(production.blocker.blocker_kind, 'platform_dependency');
    assert.equal(production.blocker.blocker_status, 'not_configured');
    assert.deepEqual(production.blocker.blocker_ids, ['temporal_runtime_not_configured']);
    assert.equal(production.blocker.owner, 'operator');
    assert.equal(production.blocker.repair_action.action_id, 'configure_temporal_service');
    assert.equal(
      production.blocker.repair_action.next_command,
      'opl family-runtime service start --provider temporal',
    );
    assert.equal(production.runtime_snapshot.lifecycle_status, 'not_configured');
    assert.equal(production.runtime_snapshot.server_reachable, false);
    assert.equal(production.runtime_snapshot.worker_ready, false);
    assert.deepEqual(production.proof_receipt, {
      receipt_kind: 'temporal_production_residency_blocker',
      receipt_status: 'blocked',
      provider_kind: 'temporal',
      blocker_ids: ['temporal_runtime_not_configured'],
      repair_action_id: 'configure_temporal_service',
    });
    assert.deepEqual(production.checks, {
      external_temporal_server_reachable: false,
      managed_worker_ready: false,
      worker_completed_attempt: false,
      worker_restart_requery: false,
      signal_history_preserved: false,
      typed_closeout_required_for_completed: false,
      missing_closeout_blocks_completion: false,
      retry_or_dead_letter_boundary_observed: false,
      domain_truth_boundary_preserved: true,
    });
    const events = runCli(['family-runtime', 'events', 'export'], familyRuntimeEnv(stateRoot));
    const proofEvent = events.family_runtime_events.events.find((event: { event_type: string }) =>
      event.event_type === 'temporal_residency_proof'
    );
    assert.equal(proofEvent.payload.closeout_status, 'production_residency_needs_live_evidence');
    assert.deepEqual(proofEvent.payload.proof_receipt, production.proof_receipt);
    assert.equal(proofEvent.payload.persisted_proof_ref, persistedProofRef);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('standalone Temporal residency proof script defaults to user state root outside repo cwd', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-residency-script-home-'));
  const cwdRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-residency-script-cwd-'));
  const repoStateRoot = path.join(cwdRoot, '.opl-state');
  const expectedStateRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state');

  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'scripts', 'temporal-residency-proof.mjs'),
      '--production',
    ], {
      cwd: cwdRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: homeRoot,
        NODE_NO_WARNINGS: '1',
        OPL_STATE_DIR: '',
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
      },
    });

    assert.equal(result.status, 0, result.stderr);
    const proof = JSON.parse(result.stdout);
    assert.equal(proof.surface_kind, 'opl_temporal_external_production_residency_proof');
    assert.equal(proof.closeout_status, 'production_residency_blocked');
    assert.equal(
      proof.runtime_snapshot.managed_worker_state_path,
      path.join(expectedStateRoot, 'family-runtime', 'temporal-worker.json'),
    );
    assert.equal(fs.existsSync(repoStateRoot), false);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(cwdRoot, { recursive: true, force: true });
  }
});

test('foreground Temporal worker entrypoint resolves user state root outside repo cwd', () => {
  const homeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-worker-home-'));
  const cwdRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-temporal-worker-cwd-'));
  const repoStateRoot = path.join(cwdRoot, '.opl-state');
  const expectedStateRoot = path.join(homeRoot, 'Library', 'Application Support', 'OPL', 'state');
  const previousHome = process.env.HOME;
  const previousStateDir = process.env.OPL_STATE_DIR;
  const previousCwd = process.cwd();

  try {
    process.env.HOME = homeRoot;
    process.env.OPL_STATE_DIR = '';
    process.chdir(cwdRoot);

    const paths = resolveTemporalWorkerForegroundPaths();

    assert.equal(paths.root, path.join(expectedStateRoot, 'family-runtime'));
    assert.equal(fs.existsSync(repoStateRoot), false);
  } finally {
    process.chdir(previousCwd);
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
    fs.rmSync(homeRoot, { recursive: true, force: true });
    fs.rmSync(cwdRoot, { recursive: true, force: true });
  }
});

test('family-runtime residency proof --production reads managed local Temporal service state', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-production-service-proof-'));
  const workerRoot = path.join(stateRoot, 'family-runtime');
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
    fs.mkdirSync(workerRoot, { recursive: true });
    const taskQueue = resolveTemporalWorkerTaskQueue({ root: workerRoot });
    fs.writeFileSync(path.join(workerRoot, 'temporal-service.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      service_kind: 'custom_command',
      pid: service.pid,
      address,
      started_at: new Date().toISOString(),
      status: 'running',
      command: 'test temporal service',
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(workerRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: worker.pid,
      address,
      namespace: 'default',
      task_queue: taskQueue,
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:production-proof-current',
    }, null, 2)}\n`);

    const output = runCli(
      ['family-runtime', 'residency', 'proof', '--provider', 'temporal', '--production'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:production-proof-current',
      }),
    );
    const production = output.family_runtime_residency_proof.production_residency_proof;

    assert.equal(production.proof_environment, 'local_temporal_service_and_managed_worker');
    assert.equal(production.closeout_status, 'production_residency_blocked');
    assert.equal(production.blocker.blocker_status, 'worker_transport_probe_failed');
    assert.ok(!production.blocker.error_message.includes('requires OPL_TEMPORAL_ADDRESS'));
    assert.equal(production.runtime_snapshot.address_source, 'managed_local_service_state');
    assert.equal(production.runtime_snapshot.temporal_service_lifecycle.service_status, 'running');
    assert.equal(production.runtime_snapshot.temporal_service_lifecycle.managed_service_pid, service.pid);
    assert.equal(production.runtime_snapshot.server_reachable, true);
    assert.equal(production.runtime_snapshot.worker_ready, true);
  } finally {
    process.kill(service.pid!, 'SIGTERM');
    process.kill(worker.pid!, 'SIGTERM');
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime temporal provider status uses managed service and worker lifecycle state', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-temporal-managed-status-'));
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
    assert.equal(typeof service.pid, 'number');
    assert.equal(typeof worker.pid, 'number');
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
    }, null, 2)}\n`);
    fs.writeFileSync(path.join(runtimeRoot, 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: worker.pid,
      address,
      namespace: 'default',
      task_queue: taskQueue,
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:managed-status-current',
    }, null, 2)}\n`);

    const output = runCli(
      ['family-runtime', 'status', '--provider', 'temporal'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_TEMPORAL_WORKER_STATUS: '',
        OPL_TEMPORAL_WORKER_ENABLED: '',
        OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:managed-status-current',
      }),
    );
    const provider = output.family_runtime.provider_runtime.providers.temporal;

    assert.equal(output.family_runtime.readiness.provider_ready, true);
    assert.equal(output.family_runtime.readiness.full_online_ready, true);
    assert.equal(output.family_runtime.readiness.degraded, false);
    assert.equal(provider.status, 'ready');
    assert.equal(provider.ready, true);
    assert.equal(provider.degraded_reason, null);
    assert.equal(provider.details.address, address);
    assert.equal(provider.details.address_source, 'managed_local_service_state');
    assert.equal(provider.details.worker_ready, true);
    assert.equal(provider.details.worker_readiness.surface_kind, 'temporal_worker_lifecycle_status');
    assert.equal(provider.details.worker_readiness.lifecycle_status, 'ready');
    assert.equal(provider.details.adapter_mode, 'managed_temporal_provider_ready');
  } finally {
    if (typeof service.pid === 'number') {
      try {
        process.kill(service.pid, 'SIGTERM');
      } catch {
        // already stopped
      }
    }
    if (typeof worker.pid === 'number') {
      try {
        process.kill(worker.pid, 'SIGTERM');
      } catch {
        // already stopped
      }
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime residency proof rejects conflicting live and production modes', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-production-residency-conflict-'));
  try {
    const result = spawnSync(process.execPath, [
      '--experimental-strip-types',
      path.join(repoRoot, 'src', 'cli.ts'),
      'family-runtime',
      'residency',
      'proof',
      '--provider',
      'temporal',
      '--live',
      '--production',
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_NO_WARNINGS: '1',
        ...familyRuntimeEnv(stateRoot),
      },
    });
    const payload = JSON.parse(result.stderr);

    assert.equal(result.status, 2);
    assert.equal(payload.error.code, 'cli_usage_error');
    assert.deepEqual(payload.error.details.mutually_exclusive, ['--live', '--production']);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('family-runtime residency proof --live runs Temporal test server and real workers', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-family-runtime-live-residency-proof-'));
  const { fixtureRoot: codexFixtureRoot, codexPath } = createTemporalResidencyCodexFixture();
  try {
    const output = runCli(
      ['family-runtime', 'residency', 'proof', '--provider', 'temporal', '--live'],
      familyRuntimeEnv(stateRoot, {
        OPL_TEMPORAL_ADDRESS: '',
        TEMPORAL_ADDRESS: '',
        OPL_CODEX_BIN: codexPath,
      }),
    );
    const proof = output.family_runtime_residency_proof;
    const live = proof.live_residency_proof;

    assert.equal(proof.proof_mode, 'temporal_live_test_server_worker');
    assert.equal(proof.closeout_status, 'production_residency_code_path_proven');
    assert.equal(live.surface_kind, 'opl_temporal_residency_live_proof');
    assert.equal(live.proof_environment, 'temporal_test_server_and_real_worker');
    assert.equal(live.closeout_status, 'production_residency_code_path_proven');
    assert.deepEqual(live.checks, {
      temporal_test_server_started: true,
      worker_completed_attempt: true,
      worker_restart_requery: true,
      signal_history_preserved: true,
      typed_closeout_required_for_completed: true,
      missing_closeout_blocks_completion: true,
      domain_truth_boundary_preserved: true,
    });
    assert.equal(live.completed_attempt.status, 'completed');
    assert.equal(live.completed_attempt.signal_count, 3);
    assert.deepEqual(live.completed_attempt.closeout_refs, ['receipt:temporal-residency-domain-closeout']);
    assert.equal(live.restarted_worker_requery.requery_status, 'stage_attempt_query_available_after_worker_restart');
    assert.equal(live.blocked_attempt.status, 'blocked');
    assert.equal(live.blocked_attempt.provider_completion, 'not_completed');
    assert.equal(live.blocked_attempt.blocked_reason, 'codex_cli_typed_closeout_not_materialized');
    assert.equal(live.authority_boundary.domain, 'truth_quality_artifact_gate_owner');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(codexFixtureRoot, { recursive: true, force: true });
  }
});
