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
      requests: [
        {
          request_id: 'app_workbench_package_ref_consumption',
          status: 'requested_not_received',
          required_evidence_refs: ['mas://artifacts/package-lifecycle/latest.json'],
          required_return_shapes: ['domain_owner_receipt', 'typed_blocker'],
          accepted_payload_policy: 'refs_receipts_and_shape_metadata_only',
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

    const actionId = 'external_evidence_request:medautoscience:app_workbench_package_ref_consumption:record';
    const route = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).app_operator_drilldown.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === actionId,
    );
    assert.equal(route.action_kind, 'external_evidence_receipt_record');
    assert.equal(route.authority_boundary.can_write_domain_truth, false);
    assert.equal(route.authority_boundary.can_read_artifact_body, false);

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      actionId,
      '--payload',
      JSON.stringify({
        evidence_refs: ['mas://artifacts/package-lifecycle/latest.json'],
        domain_receipt_refs: ['mas://receipts/package-lifecycle/latest.json'],
        typed_blocker_refs: ['mas://blockers/package-lifecycle-currentness.json'],
        receipt_semantics: 'domain_owned_receipt_ref',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(recordExecution.execution.result.external_evidence_apply.status, 'recorded');
    assert.equal(recordExecution.authority_boundary.can_write_domain_truth, false);

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

    assert.equal(verifyExecution.execution.result.external_evidence_apply.status, 'verified');
    assert.equal(
      verifyExecution.execution.result.external_evidence_apply.receipt.receipt_refs.includes(
        'mas://receipts/package-lifecycle/latest.json',
      ),
      true,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('standalone verified external receipts feed projections without readiness authority', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-standalone-evidence-no-regression-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const rcaManifest = structuredClone(loadFamilyManifestFixtures().redcube);
  rcaManifest.functional_privatization_audit = { target_domain_id: 'redcube_ai' };
  const receiptRef = 'opl://external-evidence/redcube_ai/no-regression-refs';

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
      'no-regression-refs',
      '--receipt-ref',
      receiptRef,
      '--no-regression-ref',
      'rca-no-regression:visual-stage',
      '--memory-writeback-receipt-ref',
      'rca-memory-receipt:visual-pattern',
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
      'no-regression-refs',
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
    const receipt = projection.domain_evidence_request_refs.external_receipts.find(
      (entry: { ref: string }) => entry.ref === receiptRef,
    );
    assert.ok(receipt);
    assert.equal(projection.summary.domain_external_verified_evidence_receipt_count, 1);
    assert.equal(projection.summary.domain_external_verified_no_regression_ref_count, 1);
    assert.equal(projection.summary.memory_writeback_ref_count, 1);
    assert.equal(receipt.authority_boundary.can_write_domain_truth, false);
    assert.equal(receipt.authority_boundary.can_authorize_quality_verdict, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute records functional semantic equivalence refs through payload file only', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-functional-semantic-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const rcaManifest = structuredClone(loadFamilyManifestFixtures().redcube);
  rcaManifest.functional_privatization_audit = {
    surface_kind: 'functional_privatization_audit',
    schema_version: 1,
    owner: 'redcube-ai',
    domain_id: 'redcube_ai',
    target_domain_id: 'redcube_ai',
    modules: [
      {
        module_id: 'codex_executor_adapter',
        classification: 'refs_only_domain_adapter',
        code_paths: ['agent/executors/codex_executor_adapter.ts'],
        active_callers: [],
        migration_action: 'retain_refs_only_domain_adapter',
        retention_reason: 'RCA retains visual-domain semantics while OPL owns execution.',
        standardization_layer: 'private_platform_residue_inventory',
        semantic_equivalence_status: 'review_required',
      },
    ],
    retired_generated_surface_provenance: [
      {
        surface_id: 'rca_private_codex_executor',
        replacement_ref: 'opl://executors/codex-cli/default',
        provenance_refs: ['rca://history/codex-executor-adapter'],
      },
    ],
    bridge_exit_gate: {
      physical_delete_authorization_refs: [],
      no_forbidden_write_refs: [],
      provenance_refs: [],
    },
    authority_boundary: {
      can_write_domain_truth: false,
      can_authorize_quality_verdict: false,
    },
  };
  const payloadPath = path.join(stateRoot, 'functional-semantic-payload.json');
  fs.writeFileSync(payloadPath, JSON.stringify({
    semantic_equivalence_proof_refs: ['rca://proof/codex-executor-adapter/semantic-equivalence'],
    opl_generated_or_hosted_surface_consumption_refs: ['opl://executors/codex-cli/default'],
    domain_owner_receipt_refs: ['rca://owner-receipts/codex-executor-adapter'],
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

    const execution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'functional_privatization_semantic_equivalence:redcube:codex_executor_adapter:record',
      '--payload-file',
      payloadPath,
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(execution.execution.result.external_evidence_apply.status, 'recorded');
    assert.equal(
      execution.execution.result.external_evidence_apply.receipt.evidence_refs.includes(
        'rca://proof/codex-executor-adapter/semantic-equivalence',
      ),
      true,
    );
    assert.equal(execution.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
