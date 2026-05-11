import { assert, createFamilyContractsFixtureRoot, fs, os, path, runCli, test } from '../helpers.ts';

test('runtime snapshot projects stage attempt workbench without owning domain verdicts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-stage-attempt-workbench-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    const attempt = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'analysis-campaign',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      '{"workspace_root":"/tmp/mas","runtime_root":"/tmp/mas/runtime","artifact_root":"/tmp/mas/artifacts"}',
      '--task',
      'task-runtime-snapshot-attempt',
      '--checkpoint-ref',
      'checkpoint:analysis-seed',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attempt.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--stage-packet-ref',
      'packet:analysis',
      '--checkpoint-ref',
      'checkpoint:analysis-midpoint',
      '--closeout-packet',
      '{"surface_kind":"stage_attempt_closeout_packet","closeout_refs":["receipt:analysis-closeout"],"consumed_refs":["evidence:table1"],"consumed_memory_refs":["memory:route-policy"],"writeback_receipt_refs":["memory-writeback:receipt-1"],"rejected_writes":[{"reason":"domain_truth_write_forbidden"}],"next_owner":"med-autoscience","domain_ready_verdict":"domain_gate_pending","route_impact":{"decision":"bounded_repair"}}',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_DISABLE_HERMES_ONLINE: '1',
    });

    const output = runCli(['runtime', 'snapshot'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const snapshot = output.runtime_tray_snapshot;

    assert.equal(snapshot.stage_attempt_workbench.surface_kind, 'opl_stage_attempt_workbench');
    assert.equal(snapshot.stage_attempt_workbench.availability, 'available');
    assert.equal(snapshot.stage_attempt_workbench.provider_completion_is_domain_ready, false);
    assert.equal(snapshot.stage_attempt_workbench.summary.total, 1);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].provider_kind, 'local_sqlite');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].stage_id, 'analysis-campaign');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].completion_boundary.provider_completion, 'completed');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].completion_boundary.domain_ready_verdict, 'domain_gate_pending');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].completion_boundary.provider_completion_is_domain_ready, false);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].consumed_memory_refs, ['memory:route-policy']);
    assert.deepEqual(snapshot.stage_attempt_workbench.attempts[0].writeback_receipt_refs, ['memory-writeback:receipt-1']);
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].rejected_writes[0].reason, 'domain_truth_write_forbidden');
    assert.equal(snapshot.stage_attempt_workbench.attempts[0].route_impact.decision, 'bounded_repair');
    assert.equal(snapshot.source_refs.some((ref: { role: string }) => ref.role === 'stage_attempt_workbench'), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
