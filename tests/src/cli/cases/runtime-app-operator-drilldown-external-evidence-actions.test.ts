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

    const projection = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    assert.equal(projection.summary.domain_open_evidence_request_count, 1);
    assert.equal(projection.summary.external_evidence_action_route_count, 1);
    const recordRoute = projection.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) =>
        ref.action_id === 'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:record',
    );
    assert.equal(recordRoute.owner, 'opl');
    assert.equal(recordRoute.route_target_kind, 'opl_cli');
    assert.equal(recordRoute.execution_policy, 'opl_safe_action_shell');
    assert.equal(recordRoute.authority_boundary.can_write_domain_truth, false);
    assert.equal(recordRoute.authority_boundary.can_read_memory_body, false);
    assert.equal(recordRoute.authority_boundary.can_read_artifact_body, false);
    assert.equal(recordRoute.authority_boundary.can_authorize_export_verdict, false);
    assert.equal(recordRoute.required_return_shapes.includes('domain_owner_receipt'), true);
    assert.deepEqual(recordRoute.required_operator_payload_refs, [
      'evidence_refs',
      'domain_receipt_refs',
      'typed_blocker_refs',
      'no_regression_refs',
      'release_dist_refs',
      'direct_hosted_parity_refs',
      'owner_chain_refs',
      'memory_writeback_receipt_refs',
      'artifact_mutation_receipt_refs',
      'package_lifecycle_receipt_refs',
      'lifecycle_receipt_refs',
      'restore_proof_refs',
    ]);

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
        memory_writeback_receipt_refs: ['mas://memory/writeback/package-lifecycle.json'],
        artifact_mutation_receipt_refs: ['mas://artifact/mutation/package-lifecycle.json'],
        package_lifecycle_receipt_refs: ['mas://package/lifecycle/package-lifecycle.json'],
        lifecycle_receipt_refs: ['mas://lifecycle/cleanup/package-lifecycle.json'],
        restore_proof_refs: ['mas://restore/proof/package-lifecycle.json'],
        receipt_semantics: 'domain_owned_receipt_ref',
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
    assert.equal(
      verifyExecution.execution.result.external_evidence_apply.receipt.receipt_semantics,
      'domain_owned_receipt_ref',
    );
    assert.equal(verifyExecution.execution.result.external_evidence_apply.receipt.receipt_refs.includes(
      'mas://receipts/package-lifecycle/latest.json',
    ), true);
    assert.deepEqual(
      verifyExecution.execution.result.external_evidence_apply.receipt.memory_writeback_receipt_refs,
      ['mas://memory/writeback/package-lifecycle.json'],
    );
    assert.deepEqual(
      verifyExecution.execution.result.external_evidence_apply.receipt.artifact_mutation_receipt_refs,
      ['mas://artifact/mutation/package-lifecycle.json'],
    );
    assert.deepEqual(
      verifyExecution.execution.result.external_evidence_apply.receipt.package_lifecycle_receipt_refs,
      ['mas://package/lifecycle/package-lifecycle.json'],
    );
    assert.deepEqual(
      verifyExecution.execution.result.external_evidence_apply.receipt.lifecycle_receipt_refs,
      ['mas://lifecycle/cleanup/package-lifecycle.json'],
    );
    assert.deepEqual(
      verifyExecution.execution.result.external_evidence_apply.receipt.restore_proof_refs,
      ['mas://restore/proof/package-lifecycle.json'],
    );
    const verifiedDrilldown = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const verifiedReceipt = verifiedDrilldown.domain_evidence_request_refs.external_receipts.find(
      (receipt: { request_id: string }) =>
        receipt.request_id === 'app_workbench_package_ref_consumption',
    );
    assert.equal(verifiedReceipt.receipt_semantics, 'domain_owned_receipt_ref');
    assert.equal(verifiedReceipt.typed_blocker_refs.length, 0);
    assert.equal(
      verifiedReceipt.domain_receipt_refs.includes('mas://blockers/package-lifecycle-currentness.json'),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('standalone verified external evidence receipts feed memory artifact lifecycle counters without domain requests', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standalone-evidence-memory-lifecycle-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.functional_privatization_audit = {
    target_domain_id: 'med-autoscience',
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

    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'medautoscience',
      '--request-id',
      'memory-artifact-lifecycle-live-receipts',
      '--memory-writeback-receipt-ref',
      'mas://memory/writeback/live-receipt.json',
      '--artifact-mutation-receipt-ref',
      'mas://artifact/mutation/live-receipt.json',
      '--package-lifecycle-receipt-ref',
      'mas://package/lifecycle/live-receipt.json',
      '--lifecycle-receipt-ref',
      'mas://lifecycle/cleanup/live-receipt.json',
      '--restore-proof-ref',
      'mas://restore/proof/live-receipt.json',
      '--receipt-semantics',
      'domain_owned_receipt_ref',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'medautoscience',
      '--request-id',
      'memory-artifact-lifecycle-live-receipts',
      '--mode',
      'verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    for (const requestId of [
      'domain_dispatch:medautoscience:sat_fixture',
      'stage_production_evidence:medautoscience:review',
    ]) {
      runCli([
        'agents',
        'evidence',
        'apply',
        '--domain',
        'medautoscience',
        '--request-id',
        requestId,
        '--typed-blocker-ref',
        `mas://blockers/${requestId.replaceAll(':', '-')}.json`,
      ], {
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
      });
      runCli([
        'agents',
        'evidence',
        'apply',
        '--domain',
        'medautoscience',
        '--request-id',
        requestId,
        '--mode',
        'verify',
      ], {
        OPL_STATE_DIR: stateRoot,
        OPL_CONTRACTS_DIR: fixtureContractsRoot,
      });
    }

    const projection = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;

    assert.equal(projection.summary.domain_external_evidence_request_count, 0);
    assert.equal(projection.summary.domain_external_evidence_receipt_count, 1);
    assert.equal(projection.summary.domain_external_verified_evidence_receipt_count, 1);
    assert.equal(projection.summary.domain_external_verified_memory_writeback_receipt_ref_count, 1);
    assert.equal(projection.summary.domain_external_verified_artifact_mutation_receipt_ref_count, 1);
    assert.equal(projection.summary.domain_external_verified_package_lifecycle_receipt_ref_count, 1);
    assert.equal(projection.summary.domain_external_verified_lifecycle_receipt_ref_count, 1);
    assert.equal(projection.summary.domain_external_verified_restore_proof_ref_count, 1);
    assert.equal(projection.summary.memory_writeback_ref_count, 1);
    assert.deepEqual(
      projection.memory_writeback_refs.writeback_receipt_refs,
      ['mas://memory/writeback/live-receipt.json'],
    );
    assert.equal(
      projection.memory_writeback_refs.authority_boundary.can_read_memory_body,
      false,
    );
    assert.equal(
      projection.memory_writeback_refs.authority_boundary.can_accept_or_reject_memory_writeback,
      false,
    );
    assert.equal(projection.ref_family_refs.summary.memory_ref_count, 1);
    assert.equal(
      projection.runtime_visualization_projection.graph.nodes.some(
        (node: { node_kind: string; ref: string }) =>
          node.node_kind === 'memory_writeback_receipt'
          && node.ref === 'mas://memory/writeback/live-receipt.json',
      ),
      true,
    );
    assert.equal(
      projection.domain_evidence_request_refs.external_receipts[0].role,
      'standalone_external_evidence_receipt',
    );
    assert.equal(
      projection.domain_evidence_request_refs.external_receipts[0].domain_id,
      'medautoscience',
    );
    assert.equal(
      projection.domain_evidence_request_refs.external_receipts[0].authority_boundary.can_write_domain_truth,
      false,
    );
    assert.equal(
      projection.domain_evidence_request_refs.external_receipts[0].authority_boundary.can_read_memory_body,
      false,
    );
    assert.equal(
      projection.domain_evidence_request_refs.external_receipts[0].authority_boundary.can_read_artifact_body,
      false,
    );
    assert.equal(
      projection.domain_evidence_request_refs.external_receipts.some(
        (receipt: { request_id: string }) =>
          receipt.request_id.startsWith('domain_dispatch:')
          || receipt.request_id.startsWith('stage_production_evidence:'),
      ),
      false,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('standalone verified no-regression receipts remain visible without readiness authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standalone-evidence-no-regression-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const rcaManifest = structuredClone(loadFamilyManifestFixtures().redcube);
  rcaManifest.functional_privatization_audit = {
    target_domain_id: 'redcube_ai',
  };
  const receiptRef =
    'opl://external-evidence/redcube_ai/rca-cross-family-repeated-no-regression-20260528-4-refs';
  const noRegressionRefs = [
    'rca-no-regression:visual-stage:2026-05-27-opl-family-cross-family-repeat-a',
    'rca-no-regression:visual-stage:2026-05-27-opl-family-cross-family-repeat-b',
    'rca-no-regression:visual-stage:2026-05-28-opl-family-ppt-deck-window2',
    'rca-no-regression:visual-stage:2026-05-28-opl-family-xiaohongshu-window2',
  ];

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(rcaManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'redcube_ai',
      '--request-id',
      'rca-cross-family-repeated-no-regression-20260528-4-refs',
      '--receipt-ref',
      receiptRef,
      '--source-ref',
      'user-runtime-state:redcube-ai/evidence-scaleout/20260528-rca-no-regression-evidence',
      ...noRegressionRefs.flatMap((ref) => ['--no-regression-ref', ref]),
      '--receipt-semantics',
      'domain_owned_receipt_ref',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'redcube_ai',
      '--request-id',
      'rca-cross-family-repeated-no-regression-20260528-4-refs',
      '--receipt-ref',
      receiptRef,
      '--mode',
      'verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const projection = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;

    assert.equal(projection.summary.domain_external_evidence_request_count, 0);
    assert.equal(projection.summary.domain_external_evidence_receipt_count, 1);
    assert.equal(projection.summary.domain_external_verified_evidence_receipt_count, 1);
    assert.equal(projection.summary.domain_external_verified_no_regression_ref_count, 4);
    assert.equal(projection.summary.domain_external_verified_memory_writeback_receipt_ref_count, 0);
    const receipt = projection.domain_evidence_request_refs.external_receipts.find(
      (entry: { ref: string }) => entry.ref === receiptRef,
    );
    assert.ok(receipt);
    assert.equal(receipt.role, 'standalone_external_evidence_receipt');
    assert.equal(receipt.domain_id, 'redcube_ai');
    assert.equal(receipt.receipt_status, 'verified');
    assert.deepEqual(receipt.no_regression_refs, noRegressionRefs);
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
    assert.equal(receipt.authority_boundary.can_read_artifact_body, false);
    assert.equal(receipt.authority_boundary.can_mutate_artifact, false);
    assert.equal(receipt.authority_boundary.can_authorize_quality_verdict, false);

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
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).family_runtime_evidence_worklist;
    const worklistItem = worklist.worklist_items.find(
      (item: { receipt_ref: string }) => item.receipt_ref === receiptRef,
    );
    assert.ok(worklistItem);
    assert.equal(worklistItem.status, 'closed_by_receipt_ref');
    assert.equal(worklistItem.claim_scope, 'external_evidence_receipt');
    assert.equal(worklistItem.receipt_refs.includes(receiptRef), true);
    for (const ref of noRegressionRefs) {
      assert.equal(worklistItem.receipt_refs.includes(ref), true);
    }
    assert.equal(worklist.summary.domain_ready_authorized, false);
    assert.equal(worklist.summary.production_ready_authorized, false);
    assert.equal(worklistItem.evidence_requirement.can_claim_domain_ready, false);
    assert.equal(worklistItem.evidence_requirement.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('RCA workspace receipt scaleout projects workspace memory and lifecycle refs into the evidence worklist', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-rca-workspace-scaleout-evidence-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const rcaManifest = structuredClone(loadFamilyManifestFixtures().redcube);
  rcaManifest.functional_privatization_audit = {
    target_domain_id: 'redcube_ai',
  };
  const receiptRef =
    'opl://external-evidence/redcube_ai/rca-workspace-receipt-scaleout-20260528-6-workspaces';
  const workspaceIds = ['01', '02', '03', '04', '05', '06'];
  const domainReceiptRefs = workspaceIds.map((workspaceId) =>
    `rca-owner-receipt:visual-stage:20260528-rca-workspace-receipt-scaleout-refresh-workspace-${workspaceId}-domain-owner`
  );
  const memoryReceiptRefs = workspaceIds.flatMap((workspaceId) => [
    `rca-memory-receipt:visual-pattern:20260528-rca-workspace-receipt-scaleout-refresh-workspace-${workspaceId}-rejected-memory-rejected`,
    `rca-memory-receipt:visual-pattern:20260528-rca-workspace-receipt-scaleout-refresh-workspace-${workspaceId}-accepted-memory-accepted`,
  ]);
  const lifecycleReceiptRefs = workspaceIds.flatMap((workspaceId) => [
    `rca-lifecycle-receipt:retention:20260528-rca-workspace-receipt-scaleout-refresh-workspace-${workspaceId}-retention`,
    `rca-lifecycle-receipt:restore:20260528-rca-workspace-receipt-scaleout-refresh-workspace-${workspaceId}-restore`,
    `rca-lifecycle-receipt:cleanup:20260528-rca-workspace-receipt-scaleout-refresh-workspace-${workspaceId}-cleanup`,
  ]);
  const restoreProofRefs = lifecycleReceiptRefs.filter((ref) =>
    ref.startsWith('rca-lifecycle-receipt:restore:')
  );

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(rcaManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'redcube_ai',
      '--request-id',
      'rca-workspace-receipt-scaleout-20260528-6-workspaces',
      '--receipt-ref',
      receiptRef,
      '--source-ref',
      'redcube-ai/contracts/production_acceptance/rca-workspace-receipt-scaleout-evidence-20260528.json#actual_workspace_receipt_refs',
      '--evidence-ref',
      'rca.workspace_receipt_scaleout.2026-05-28.6-workspaces',
      ...domainReceiptRefs.flatMap((ref) => ['--domain-receipt-ref', ref]),
      ...memoryReceiptRefs.flatMap((ref) => ['--memory-writeback-receipt-ref', ref]),
      ...lifecycleReceiptRefs.flatMap((ref) => ['--lifecycle-receipt-ref', ref]),
      ...restoreProofRefs.flatMap((ref) => ['--restore-proof-ref', ref]),
      '--receipt-semantics',
      'domain_owned_receipt_ref',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'redcube_ai',
      '--request-id',
      'rca-workspace-receipt-scaleout-20260528-6-workspaces',
      '--receipt-ref',
      receiptRef,
      '--mode',
      'verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const projection = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;

    assert.equal(projection.summary.domain_external_evidence_receipt_count, 1);
    assert.equal(projection.summary.domain_external_verified_evidence_receipt_count, 1);
    assert.equal(projection.summary.domain_external_verified_memory_writeback_receipt_ref_count, 12);
    assert.equal(projection.summary.domain_external_verified_lifecycle_receipt_ref_count, 18);
    assert.equal(projection.summary.domain_external_verified_restore_proof_ref_count, 6);
    assert.equal(projection.summary.domain_external_verified_no_regression_ref_count, 0);
    assert.equal(projection.summary.memory_writeback_ref_count, 12);
    const receipt = projection.domain_evidence_request_refs.external_receipts.find(
      (entry: { ref: string }) => entry.ref === receiptRef,
    );
    assert.ok(receipt);
    assert.equal(receipt.role, 'standalone_external_evidence_receipt');
    assert.equal(receipt.domain_id, 'redcube_ai');
    assert.deepEqual(receipt.domain_receipt_refs, domainReceiptRefs);
    assert.deepEqual(receipt.memory_writeback_receipt_refs, memoryReceiptRefs);
    assert.deepEqual(receipt.lifecycle_receipt_refs, lifecycleReceiptRefs);
    assert.deepEqual(receipt.restore_proof_refs, restoreProofRefs);
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
    assert.equal(receipt.authority_boundary.can_read_memory_body, false);
    assert.equal(receipt.authority_boundary.can_read_artifact_body, false);
    assert.equal(receipt.authority_boundary.can_authorize_quality_verdict, false);

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
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).family_runtime_evidence_worklist;
    const worklistItem = worklist.worklist_items.find(
      (item: { receipt_ref: string }) => item.receipt_ref === receiptRef,
    );
    assert.ok(worklistItem);
    assert.equal(worklistItem.status, 'closed_by_receipt_ref');
    assert.equal(worklistItem.claim_scope, 'external_evidence_receipt');
    for (const ref of [
      receiptRef,
      ...domainReceiptRefs,
      ...memoryReceiptRefs,
      ...lifecycleReceiptRefs,
      ...restoreProofRefs,
    ]) {
      assert.equal(worklistItem.receipt_refs.includes(ref), true);
    }
    assert.equal(worklist.summary.domain_ready_authorized, false);
    assert.equal(worklist.summary.production_ready_authorized, false);
    assert.equal(worklistItem.evidence_requirement.can_claim_domain_ready, false);
    assert.equal(worklistItem.evidence_requirement.can_claim_production_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute records functional semantic equivalence refs through payload file only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-functional-semantic-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const rcaManifest = structuredClone(loadFamilyManifestFixtures().redcube);
  rcaManifest.privatized_functional_module_audit = {
    surface_kind: 'rca_privatized_functional_module_audit',
    target_domain_id: 'redcube_ai',
    modules: [
      {
        module_id: 'codex_executor_adapter',
        migration_class: 'refs_only_domain_adapter',
        classification: 'refs_only_adapter',
        owner: 'redcube_ai',
        active_caller_status: 'route_run_record_adapter_split_landed_opl_attempt_shell_pending',
        active_callers: ['deliverable route runner'],
        current_surface_refs: ['/domain_entry_contract/executor'],
        expected_opl_primitives: ['agent_executor_adapter'],
        semantic_equivalence_status: 'review_required',
        semantic_equivalence_reason:
          'active_caller_wording_requires_opl_semantic_equivalence_proof',
      },
    ],
  };
  const payloadPath = path.join(stateRoot, 'functional-semantic-payload.json');
  fs.writeFileSync(payloadPath, JSON.stringify({
    semantic_equivalence_proof_refs: ['rca://proof/codex-executor-adapter/semantic-equivalence'],
    opl_generated_or_hosted_surface_consumption_refs: ['opl://executors/codex-cli/default'],
    domain_owner_receipt_refs: ['rca://owner-receipts/codex-executor-adapter'],
    typed_blocker_refs: [],
    no_regression_evidence_refs: ['rca://proof/no-regression/codex-executor-adapter'],
  }));

  try {
    runCli([
      'workspace',
      'bind',
      '--project',
      'redcube',
      '--path',
      repoRoot,
      '--manifest-command',
      buildManifestCommand(rcaManifest),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const projection = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown;
    const actionId =
      'functional_privatization_semantic_equivalence:redcube:codex_executor_adapter:record';
    const route = projection.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === actionId,
    );
    assert.equal(route.action_kind, 'functional_privatization_semantic_equivalence_receipt_record');
    assert.equal(route.route_requires_domain_or_app_payload, true);
    assert.equal(route.creates_owner_receipt, false);
    assert.equal(route.authority_boundary.can_write_domain_truth, false);

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      actionId,
      '--payload-file',
      payloadPath,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(execution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(execution.execution.execution_status, 'executed');
    assert.equal(execution.execution.result.external_evidence_apply.status, 'recorded');
    assert.equal(
      execution.execution.result.external_evidence_apply.receipt.evidence_refs.includes(
        'rca://proof/codex-executor-adapter/semantic-equivalence',
      ),
      true,
    );
    assert.equal(
      execution.execution.result.external_evidence_apply.receipt.direct_hosted_parity_refs.includes(
        'opl://executors/codex-cli/default',
      ),
      true,
    );
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
