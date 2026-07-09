import net from 'node:net';

import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  repoRoot,
  runCli,
  spawn,
  test,
} from '../helpers.ts';
import {
  buildMasAppOperatorDrilldownFixtureManifest,
  createOmaContractFixture,
  insertProviderProof,
} from './runtime-app-operator-drilldown-helpers.ts';

test('runtime snapshot exposes App operator refs-only owner-aware read model', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const omaRepoDir = createOmaContractFixture(fixtureRoot);
  const server = net.createServer((socket) => socket.end());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const temporalAddress = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const workerProbe = spawn(process.execPath, [
    '-e',
    'setTimeout(() => {}, 30_000);',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  workerProbe.unref();
  const testEnv = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    OPL_META_AGENT_REPO_DIR: omaRepoDir,
    OPL_FAMILY_RUNTIME_PROVIDER: 'temporal',
    OPL_TEMPORAL_ADDRESS: temporalAddress,
    OPL_TEMPORAL_NAMESPACE: 'opl-app-operator-worker-stale',
    OPL_TEMPORAL_TASK_QUEUE: 'opl-app-operator-worker-stale',
    OPL_TEMPORAL_WORKER_SOURCE_VERSION: 'git:app-operator-current-worker',
  };

  try {
    assert.equal(typeof workerProbe.pid, 'number');
    fs.mkdirSync(path.join(stateRoot, 'family-runtime'), { recursive: true });
    fs.writeFileSync(path.join(stateRoot, 'family-runtime', 'temporal-worker.json'), `${JSON.stringify({
      provider_kind: 'temporal',
      pid: workerProbe.pid,
      address: temporalAddress,
      namespace: 'opl-app-operator-worker-stale',
      task_queue: 'opl-app-operator-worker-stale',
      started_at: new Date().toISOString(),
      status: 'ready',
      source_version: 'git:app-operator-old-worker',
      workflow_bundle_source_version: 'git:app-operator-old-worker',
    }, null, 2)}\n`);
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(buildMasAppOperatorDrilldownFixtureManifest()),
    ], testEnv);
    runCli(['family-runtime', 'events', 'export'], testEnv);
    insertProviderProof(stateRoot);

    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'write',
      '--provider',
      'temporal',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts","dispatch_ref":"mas-domain-dispatch:dm-cvd:app-drilldown","source_refs":["source:dataset"]}',
      '--task',
      'task-app-drilldown',
      '--checkpoint-ref',
      'checkpoint:write-start',
      '--source-fingerprint',
      'sha256:app-drilldown-source',
    ], testEnv).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attempt.stage_attempt_id,
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:write-closeout"],"consumed_refs":["artifact:table"],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending"}',
    ], testEnv);

    const snapshot = runCli(['runtime', 'snapshot'], testEnv).runtime_tray_snapshot.app_operator_drilldown;
    assert.equal(snapshot.detail_level, 'summary');
    assert.equal(snapshot.route_graph_refs, undefined);
    assert.equal(snapshot.operator_action_routing_refs, undefined);
    assert.equal(snapshot.attention_first_payload.next_safe_action.submit_via, 'opl runtime action execute');
    assert.equal(snapshot.attention_first_payload.provider_health.authority_boundary.can_write_domain_truth, false);

    const full = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], testEnv).app_operator_drilldown;
    const restartRoute = full.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === 'provider-worker:temporal:restart',
    );
    assert.ok(restartRoute);
    assert.equal(restartRoute.owner, 'opl');
    assert.equal(restartRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(full.summary.domain_open_evidence_request_count >= 1, true);
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
