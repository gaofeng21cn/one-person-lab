import {
  assert,
  createFamilyContractsFixtureRoot,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

test('runtime app-operator-drilldown defaults to summary-first refs and keeps full refs explicit', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-drilldown-summary-state-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  try {
    for (let index = 0; index < 12; index += 1) {
      const attempt = runCli([
        'family-runtime',
        'attempt',
        'create',
        '--domain',
        'medautoscience',
        '--stage',
        'write',
        '--provider',
        'local_sqlite',
        '--workspace-locator',
        JSON.stringify({
          workspace_root: `/tmp/mas-${index}`,
          artifact_root: `/tmp/mas-${index}/artifacts`,
          source_refs: [`source:dataset-${index}`],
        }),
        '--task',
        `task-app-drilldown-${index}`,
        '--checkpoint-ref',
        `checkpoint:write-start-${index}`,
      ], {
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
      });
      const attemptId = attempt.family_runtime_stage_attempt.attempt.stage_attempt_id;
      runCli([
        'family-runtime',
        'attempt',
        'fixture-run',
        attemptId,
        '--closeout-packet',
        JSON.stringify({
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_refs: [`receipt:write-closeout-${index}`],
          consumed_refs: [`artifact:table-${index}`],
          consumed_memory_refs: [`memory:route-policy-${index}`],
          writeback_receipt_refs: [`memory-writeback:receipt-${index}`],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
          route_impact: {
            decision: 'bounded_repair',
            owner_receipt_refs: [`owner-receipt:summary-${index}`],
            typed_blocker_refs: [`blocker:summary-${index}`],
            quality_refs: [`publication_eval/${index}.json`],
            readiness_refs: [`controller_decisions/${index}.json`],
            repair_command: `medautosci sidecar dispatch --task task-${index}.json --format json`,
            package_refs: [`package:submission-${index}`],
            export_refs: [`export:current-package-${index}`],
          },
        }),
      ], {
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
      });
    }

    const summaryOutput = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const summaryDrilldown = summaryOutput.app_operator_drilldown;
    assert.equal(summaryDrilldown.detail_level, 'summary');
    assert.equal(summaryDrilldown.summary.stage_attempt_count, 12);
    assert.equal(summaryDrilldown.summary.route_graph_ref_count, 12);
    assert.equal(summaryDrilldown.summary.operator_action_route_count > 36, true);
    assert.equal(summaryDrilldown.route_graph_refs.refs.length <= 10, true);
    assert.equal(summaryDrilldown.operator_action_routing_refs.refs.length <= 10, true);
    assert.equal(summaryDrilldown.production_evidence_tail_ledger.tail_items.length <= 10, true);
    assert.equal(summaryDrilldown.domain_dispatch_evidence.attempts.length, 10);
    assert.equal(summaryDrilldown.route_graph_refs.omitted_ref_count, 2);
    assert.equal(summaryDrilldown.domain_dispatch_evidence.omitted_ref_count, 2);
    assert.equal(
      summaryDrilldown.operator_action_routing_refs.omitted_ref_count,
      summaryDrilldown.summary.operator_action_route_count - 10,
    );
    assert.equal(
      summaryDrilldown.production_evidence_tail_ledger.omitted_ref_count,
      summaryDrilldown.summary.production_evidence_tail_item_count - 10,
    );

    const fullOutput = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const fullDrilldown = fullOutput.app_operator_drilldown;
    assert.equal(fullDrilldown.detail_level, 'full');
    assert.equal(fullDrilldown.route_graph_refs.refs.length, 12);
    assert.equal(fullDrilldown.domain_dispatch_evidence.attempts.length, 12);
    assert.equal(
      fullDrilldown.production_evidence_tail_ledger.tail_items.length,
      summaryDrilldown.summary.production_evidence_tail_item_count,
    );
    assert.equal(
      fullDrilldown.operator_action_routing_refs.refs.length,
      summaryDrilldown.summary.operator_action_route_count,
    );
    assert.equal(fullDrilldown.route_graph_refs.omitted_ref_count, 0);
    assert.equal(fullDrilldown.domain_dispatch_evidence.omitted_ref_count, 0);
    assert.equal(fullDrilldown.operator_action_routing_refs.omitted_ref_count, 0);
    assert.equal(fullDrilldown.production_evidence_tail_ledger.omitted_ref_count, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
