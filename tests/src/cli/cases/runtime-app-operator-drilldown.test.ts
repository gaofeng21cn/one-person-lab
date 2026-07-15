import net from 'node:net';

import {
  assert,
  buildManifestCommand,
  createFamilyContractsFixtureRoot,
  fs,
  installRuntimePackageFixture,
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
    assert.equal(restartRoute.authority_boundary.can_write_domain_truth, false);
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

test('runtime app operator projects completed memory trace refs without body or authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-operator-memory-trace-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const workspaceRoot = path.join(stateRoot, 'workspace');
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
    CODEX_HOME: path.join(stateRoot, 'codex-home'),
  };
  const rejectedMemoryBody = 'domain-owned rejected write body';

  try {
    fs.mkdirSync(workspaceRoot, { recursive: true });
    installRuntimePackageFixture(stateRoot, 'mas');
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'temporal',
      '--workspace-locator',
      JSON.stringify({
        workspace_root: workspaceRoot,
        artifact_root: path.join(workspaceRoot, 'artifacts'),
        source_refs: ['source:dataset'],
      }),
      '--task',
      'task-app-operator-memory-trace',
      '--checkpoint-ref',
      'checkpoint:analysis-start',
    ], env).family_runtime_stage_attempt.attempt;

    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attempt.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:analysis-closeout'],
        consumed_refs: ['artifact:table'],
        consumed_memory_refs: ['memory:route-policy'],
        writeback_receipt_refs: ['memory-writeback:receipt-1'],
        rejected_writes: [{
          ref: 'memory-rejected-write:analysis/unsafe-body',
          reason: 'domain_truth_write_forbidden',
          body: rejectedMemoryBody,
        }],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          memory_recall_trace_refs: ['memory-recall-trace:analysis/route-policy'],
          memory_retrieval_trace_refs: ['memory-retrieval-trace:analysis/route-policy'],
        },
      }),
    ], env);

    const full = runCli([
      'runtime', 'app-operator-drilldown', '--detail', 'full',
    ], env).app_operator_drilldown;
    const trace = full.memory_trace_projection;

    assert.equal(trace.surface_kind, 'opl_memory_trace_projection');
    assert.equal(trace.availability, 'memory_trace_refs_observed');
    assert.deepEqual(trace.consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(trace.recall_trace_refs, ['memory-recall-trace:analysis/route-policy']);
    assert.deepEqual(trace.retrieval_trace_refs, ['memory-retrieval-trace:analysis/route-policy']);
    assert.deepEqual(trace.writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.deepEqual(trace.rejected_write_refs, ['memory-rejected-write:analysis/unsafe-body']);
    assert.deepEqual(trace.source_refs, ['source:dataset']);
    for (const field of [
      'can_read_memory_body',
      'can_write_domain_memory_body',
      'can_accept_or_reject_memory_writeback',
      'can_authorize_quality_verdict',
    ]) {
      assert.equal(Object.hasOwn(trace.false_authority_flags, field), true, field + ' must be present');
      assert.equal(trace.false_authority_flags[field], false, field);
    }
    for (const field of [
      'can_read_memory_body',
      'can_write_domain_truth',
      'can_authorize_quality_verdict',
      'can_execute_domain_action',
    ]) {
      assert.equal(Object.hasOwn(trace.authority_boundary, field), true, field + ' must be present');
      assert.equal(trace.authority_boundary[field], false, field);
    }
    assert.equal(JSON.stringify(trace).includes(rejectedMemoryBody), false);
    assert.deepEqual(full.runtime_workbench.memory_trace_projection, trace);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
