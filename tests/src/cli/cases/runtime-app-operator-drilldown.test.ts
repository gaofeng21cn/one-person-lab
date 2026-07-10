import net from 'node:net';

import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  loadFamilyManifestFixtures,
  os,
  path,
  repoRoot,
  runCli,
  spawn,
  test,
} from '../helpers.ts';

test('runtime snapshot exposes the user-visible summary and stale Temporal worker repair route', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const temporalAddress = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const workerProbe = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30_000);'], {
    detached: true,
    stdio: 'ignore',
  });
  workerProbe.unref();
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_TEMPORAL_ADDRESS: temporalAddress,
    OPL_TEMPORAL_NAMESPACE: 'opl-app-operator-worker-stale',
    OPL_TEMPORAL_TASK_QUEUE: 'opl-app-operator-worker-stale',
    OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:app-operator-current-worker',
  };
  try {
    assert.equal(typeof workerProbe.pid, 'number');
    fs.mkdirSync(path.join(stateRoot, 'family-runtime'), { recursive: true });
    fs.writeFileSync(
      path.join(stateRoot, 'family-runtime', 'temporal-worker.json'),
      `${JSON.stringify({
        provider_kind: 'temporal',
        pid: workerProbe.pid,
        address: temporalAddress,
        namespace: 'opl-app-operator-worker-stale',
        task_queue: 'opl-app-operator-worker-stale',
        started_at: new Date().toISOString(),
        status: 'ready',
        source_version: 'git:app-operator-old-worker',
        workflow_bundle_source_version: 'git:app-operator-old-worker',
      })}\n`,
    );
    runCli([
      'workspace', 'bind',
      '--project', 'medautoscience',
      '--path', repoRoot,
      '--manifest-command', buildManifestCommand(loadFamilyManifestFixtures().medautoscience),
    ], env);

    const summary = runCli(['runtime', 'snapshot'], env)
      .runtime_tray_snapshot.app_operator_drilldown;
    assert.equal(summary.detail_level, 'summary');
    assert.equal(summary.route_graph_refs, undefined);
    assert.equal(summary.operator_action_routing_refs, undefined);
    assert.equal(summary.authority_boundary.can_write_domain_truth, false);

    const full = runCli([
      'runtime', 'app-operator-drilldown', '--detail', 'full',
    ], env).app_operator_drilldown;
    assert.equal(full.detail_level, 'full');
    assert.equal(Array.isArray(full.operator_action_routing_refs.refs), true);
    const restartRoute = full.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === 'provider-worker:temporal:restart',
    );
    assert.ok(restartRoute);
    assert.equal(restartRoute.provider_worker_lifecycle_status, 'worker_source_stale');
    assert.equal(restartRoute.provider_worker_repair_action_id, 'restart_temporal_worker');
    assert.equal(restartRoute.owner, 'opl');
    assert.equal(full.authority_boundary.can_write_domain_truth, false);
  } finally {
    if (workerProbe.pid) {
      try {
        process.kill(workerProbe.pid, 'SIGTERM');
      } catch {
        // Process may already have exited.
      }
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
