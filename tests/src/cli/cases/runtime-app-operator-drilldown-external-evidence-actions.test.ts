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
  test,
} from '../helpers.ts';

test('runtime action execute records and verifies external evidence request routes through OPL ledger only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-evidence-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.functional_privatization_audit = {
    target_domain_id: 'medautoscience',
    external_evidence_request_pack: {
      request_pack_id: 'mas.external_evidence_request_pack.fixture',
      owner: 'med-autoscience',
      request_owner: 'med-autoscience',
      requested_from: ['one-person-lab', 'codex_app'],
      policy: 'request_refs_receipt_shapes_and_parity_only_no_runtime_implementation',
      requests: [
        {
          request_id: 'app_workbench_package_ref_consumption',
          status: 'requested_not_received',
          required_evidence_refs: ['mas://artifacts/package-lifecycle/latest.json'],
          required_return_shapes: ['domain_owner_receipt', 'typed_blocker'],
          required_receipt_shapes: ['lifecycle_receipt_ref'],
          forbidden_payload_classes: ['domain_truth_body', 'artifact_body'],
          accepted_payload_policy: 'refs_receipts_and_shape_metadata_only',
          source_pointer: '/functional_privatization_audit/external_evidence_request_pack/requests/0',
        },
      ],
    },
  };

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'medautoscience',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(masManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const drilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    assert.equal(drilldown.summary.domain_open_evidence_request_count, 1);
    assert.equal(drilldown.summary.external_evidence_action_route_count, 1);
    const recordRoute = drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:record',
    );
    assert.equal(recordRoute.owner, 'opl');
    assert.equal(recordRoute.route_target_kind, 'opl_cli');
    assert.equal(recordRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(recordRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(recordRoute.required_return_shapes.includes('domain_owner_receipt'), true);

    const dryRun = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:record',
      '--dry-run',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(dryRun.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(dryRun.execution.execution_status, 'dry_run');
    assert.equal(dryRun.execution.result, null);

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:record',
      '--payload',
      JSON.stringify({
        evidence_refs: ['mas://artifacts/package-lifecycle/latest.json'],
        domain_receipt_refs: ['mas://receipts/package-lifecycle/latest.json'],
        typed_blocker_refs: ['mas://blockers/package-lifecycle-currentness.json'],
        no_regression_refs: ['mas://proof/no-regression/package-lifecycle.json'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(recordExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(recordExecution.execution.execution_status, 'executed');
    assert.equal(recordExecution.execution.result.external_evidence_apply.status, 'recorded');
    assert.equal(recordExecution.execution.result.external_evidence_apply.authority_boundary.opl_records_refs_only, true);
    assert.equal(recordExecution.authority_boundary.can_write_domain_truth, false);

    const recordedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    assert.equal(recordedDrilldown.summary.domain_recorded_evidence_receipt_request_count, 1);
    assert.equal(recordedDrilldown.summary.external_evidence_action_route_count, 1);
    const verifyRoute = recordedDrilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:verify',
    );
    assert.equal(verifyRoute.action_kind, 'external_evidence_receipt_verify');

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(verifyExecution.execution.result.external_evidence_apply.status, 'verified');
    assert.equal(verifyExecution.execution.result.external_evidence_apply.receipt.receipt_refs.includes(
      'mas://receipts/package-lifecycle/latest.json',
    ), true);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
