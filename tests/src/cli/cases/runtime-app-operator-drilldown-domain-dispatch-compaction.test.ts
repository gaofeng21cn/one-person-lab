import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

test('domain dispatch evidence defaults to latest actionable attempt while preserving superseded provenance', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-domain-dispatch-compaction-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const workspaceLocator = {
    surface_kind: 'opl_provider_hosted_task_workspace_locator',
    workspace_root: '/tmp/dm-cvd',
    profile: '/tmp/dm-cvd/ops/medautoscience/profiles/dm-cvd.local.toml',
    study_id: '002-dm-china-us-mortality-attribution',
    action_type: 'run_quality_repair_batch',
    dispatch_authority: 'quality_repair_batch_writer_handoff',
    dispatch_ref:
      'studies/002-dm-china-us-mortality-attribution/artifacts/supervision/consumer/default_executor_dispatches/run_quality_repair_batch.json',
    next_executable_owner: 'write',
    domain_truth_owner: 'med-autoscience',
    opl_writes_domain_truth: false,
    opl_writes_publication_quality: false,
    opl_writes_artifact_gate: false,
    opl_writes_current_package: false,
  };
  const env = {
    OPL_STATE_DIR: stateRoot,
    OPL_CONTRACTS_DIR: fixtureContractsRoot,
  };
  const closeoutPacket = {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: ['receipt:writer-handoff'],
    next_owner: 'write',
    domain_ready_verdict: 'domain_gate_pending',
    route_impact: {
      decision: 'bounded_repair',
      next_owner: 'write',
      domain_ready_verdict: 'domain_gate_pending',
    },
  };

  try {
    const first = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify(workspaceLocator),
      '--task',
      'task-repeated-domain-dispatch',
      '--source-fingerprint',
      'truth-snapshot::first',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      first.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], env);

    const second = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'domain_owner/default-executor-dispatch',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify(workspaceLocator),
      '--task',
      'task-repeated-domain-dispatch',
      '--source-fingerprint',
      'truth-snapshot::second',
      '--new-attempt',
    ], env).family_runtime_stage_attempt.attempt;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      second.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify(closeoutPacket),
    ], env);

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], env)
      .app_operator_drilldown;
    const attempts = drilldown.domain_dispatch_evidence.attempts.filter(
      (attempt: { stage_id: string; workspace_locator: { dispatch_ref?: string } }) =>
        attempt.stage_id === 'domain_owner/default-executor-dispatch'
        && attempt.workspace_locator.dispatch_ref === workspaceLocator.dispatch_ref,
    );
    assert.equal(attempts.length, 2);
    const latest = [...attempts].sort((left: {
      updated_at?: string;
      created_at?: string;
      stage_attempt_id: string;
    }, right: {
      updated_at?: string;
      created_at?: string;
      stage_attempt_id: string;
    }) =>
      Date.parse(right.updated_at ?? '') - Date.parse(left.updated_at ?? '')
      || Date.parse(right.created_at ?? '') - Date.parse(left.created_at ?? '')
      || right.stage_attempt_id.localeCompare(left.stage_attempt_id)
    )[0];
    const superseded = attempts.find(
      (attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id !== latest.stage_attempt_id,
    );
    assert.equal(latest.default_actionable, true);
    assert.equal(latest.default_actionability_status, 'current');
    assert.equal(superseded.default_actionable, false);
    assert.equal(superseded.default_actionability_status, 'superseded');
    assert.equal(superseded.superseded_by_stage_attempt_id, latest.stage_attempt_id);
    assert.equal(
      superseded.superseded_reason,
      'newer_stage_attempt_with_same_domain_dispatch_identity',
    );
    assert.equal(drilldown.domain_dispatch_evidence.summary.attempt_count, 2);
    assert.equal(drilldown.domain_dispatch_evidence.summary.dispatch_identity_group_count, 1);
    assert.equal(
      drilldown.domain_dispatch_evidence.summary.current_default_actionable_attempt_count,
      1,
    );
    assert.equal(drilldown.domain_dispatch_evidence.summary.superseded_attempt_count, 1);

    const recordRoutes = drilldown.operator_action_routing_refs.refs.filter(
      (route: { action_kind: string }) =>
        route.action_kind === 'domain_dispatch_evidence_receipt_record',
    );
    assert.equal(recordRoutes.length, 1);
    assert.equal(recordRoutes[0].stage_attempt_id, latest.stage_attempt_id);
    assert.equal(recordRoutes[0].default_actionability_status, 'current');
    assert.equal(
      recordRoutes.some((route: { stage_attempt_id: string }) =>
        route.stage_attempt_id === superseded.stage_attempt_id
      ),
      false,
    );
    assert.equal(drilldown.summary.domain_dispatch_evidence_receipt_action_route_count, 1);
    assert.equal(
      drilldown.summary.domain_dispatch_evidence_receipt_record_requires_domain_or_app_payload_count,
      1,
    );
    assert.equal(drilldown.summary.evidence_envelope_open_count, 1);
    assert.equal(drilldown.summary.evidence_envelope_superseded_count, 1);

    const latestEnvelope = drilldown.evidence_envelope.envelopes.find(
      (envelope: { envelope_id: string }) =>
        envelope.envelope_id === `domain_dispatch:med-autoscience:${latest.stage_attempt_id}`,
    );
    const supersededEnvelope = drilldown.evidence_envelope.envelopes.find(
      (envelope: { envelope_id: string }) =>
        envelope.envelope_id === `domain_dispatch:med-autoscience:${superseded.stage_attempt_id}`,
    );
    assert.equal(latestEnvelope.status, 'open');
    assert.equal(latestEnvelope.next_route, recordRoutes[0].ref);
    assert.equal(supersededEnvelope.status, 'superseded');
    assert.equal(supersededEnvelope.next_route, null);
    assert.equal(supersededEnvelope.claim_allowed.owner_receipt_observed, false);
    assert.equal(supersededEnvelope.claim_allowed.domain_ready, false);
    assert.equal(supersededEnvelope.superseded_by_stage_attempt_id, latest.stage_attempt_id);

    const worklist = runCli([
      'family-runtime',
      'evidence-worklist',
      '--family-defaults',
      '--provider',
      'temporal',
      '--executor-kind',
      'codex_cli',
      '--detail',
      'full',
    ], env).family_runtime_evidence_worklist;
    assert.equal(worklist.summary.domain_dispatch_evidence_workorder_count, 1);
    assert.equal(worklist.domain_dispatch_evidence_workorder_packet.summary.workorder_count, 1);
    assert.equal(
      worklist.domain_dispatch_evidence_workorder_packet.workorders[0].stage_attempt_id,
      latest.stage_attempt_id,
    );
    assert.equal(worklist.evidence_envelope.summary.open_envelope_count, 1);
    assert.equal(worklist.evidence_envelope.summary.superseded_envelope_count, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
