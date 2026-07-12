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
  runCliFailure,
  test,
} from '../helpers.ts';

test('runtime action execute can apply and verify legacy cleanup plans from App drilldown', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-legacy-cleanup-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  const masManifest = structuredClone(loadFamilyManifestFixtures().medautoscience);
  masManifest.standard_domain_agent_skeleton = {
    surface_kind: 'standard_domain_agent_skeleton',
    version: 'standard-domain-agent-skeleton.v1',
    agent_id: 'mas',
    repo_source_boundary: {
      required_dirs: ['agent', 'contracts', 'runtime', 'docs'],
      forbidden_dirs: ['artifacts'],
    },
    artifact_boundary: {
      repo_contains_real_artifacts: false,
      artifact_roots_are_locators: true,
      workspace_artifact_locator_refs: ['workspace:/artifacts'],
      runtime_artifact_locator_refs: ['runtime:/receipts'],
    },
    artifact_locator_contract: {
      surface_kind: 'artifact_locator_contract',
      locator_model: 'workspace_runtime_artifact_root',
    },
    authority_boundary: {
      opl: 'framework_transport_and_projection_only',
      domain: 'truth_quality_artifact_owner',
    },
  };
  masManifest.physical_skeleton_follow_through = {
    surface_kind: 'mas_physical_skeleton_follow_through',
    status: 'minimum_repo_source_anchors_landed',
    source_refs: [
      'agent/README.md',
      'contracts/README.md',
      'runtime/README.md',
      'docs/status.md',
    ],
    direct_skill_parity_refs: ['proof:mas:direct-skill-parity'],
    opl_hosted_parity_refs: ['proof:mas:opl-hosted-parity'],
    replacement_parity_refs: ['proof:mas:replacement-parity'],
    provenance_refs: ['docs/history/runtime-substrate/mas-local-runtime-tombstone.md'],
    legacy_active_path_policy: 'physically_removed_or_history_tombstone_only',
    legacy_active_path_residue: [
      {
        path_family: 'default MAS local scheduler',
        state: 'tombstone_only',
        evidence_ref: 'docs/history/runtime-substrate/mas-local-scheduler-tombstone.md',
      },
    ],
  };
  masManifest.legacy_retirement_tombstone_proof = {
    status: 'no_active_default_caller_proven',
    active_default_callers: [],
    tombstone_refs: ['docs/history/runtime-substrate/mas-local-scheduler-tombstone.md'],
    source_refs: ['docs/decisions.md#temporal-runtime'],
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
    assert.equal(
      projection.operator_action_routing_refs.refs.some(
        (ref: { action_id: string; action_kind: string }) =>
          ref.action_id === 'legacy-cleanup:medautoscience:apply'
          && ref.action_kind === 'legacy_cleanup_apply',
      ),
      true,
    );
    assert.equal(
      projection.app_execution_bridge.safe_action_routes.some(
        (ref: { action_id: string; can_submit_to_safe_action_shell: boolean }) =>
          ref.action_id === 'legacy-cleanup:medautoscience:apply'
          && ref.can_submit_to_safe_action_shell,
      ),
      true,
    );

    const applyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'legacy-cleanup:medautoscience:apply',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(applyExecution.execution.execution_kind, 'opl_cli_legacy_cleanup_apply');
    assert.equal(applyExecution.execution.execution_status, 'executed');
    assert.equal(
      applyExecution.execution.executed_runtime_command,
      'opl agents legacy-cleanup apply --domain medautoscience --mode apply --source-ref opl://agents/med-autoscience/legacy-cleanup-plan',
    );
    assert.equal(
      applyExecution.execution.result.family_agent_legacy_cleanup_apply.lifecycle_apply.status,
      'applied',
    );
    assert.equal(
      applyExecution.execution.result.family_agent_legacy_cleanup_apply.authority_boundary.opl_can_move_or_delete_domain_repo_files,
      false,
    );

    const verifyExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      'legacy-cleanup:medautoscience:verify',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    }).runtime_operator_action_execution;

    assert.equal(verifyExecution.execution.execution_kind, 'opl_cli_legacy_cleanup_apply');
    assert.equal(verifyExecution.execution.execution_status, 'executed');
    assert.equal(
      verifyExecution.execution.result.family_agent_legacy_cleanup_apply.lifecycle_apply.status,
      'verified',
    );
    assert.equal(verifyExecution.authority_boundary.can_write_domain_truth, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('runtime action execute records MAS paper-line owner-chain results as refs-only domain dispatch evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-runtime-action-execute-mas-owner-chain-result-'));
  const { fixtureRoot, fixtureContractsRoot } = createFamilyContractsFixtureRoot();
  installRuntimePackageFixture(stateRoot, 'mas');
  try {
    const created = runCli([
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
      '{"workspace_root":"/tmp/mas","artifact_root":"/tmp/mas/artifacts","dispatch_ref":"mas-domain-dispatch:dm003:paper-line-owner-chain"}',
      '--task',
      'task-mas-paper-line-owner-chain',
      '--source-fingerprint',
      'sha256:mas-paper-line-owner-chain',
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });
    const attemptId = created.family_runtime_stage_attempt.attempt.stage_attempt_id;
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      attemptId,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: ['receipt:mas-paper-line-owner-chain-closeout'],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'bounded_repair',
          repair_command: 'medautosci domain-handler dispatch --task <task.json> --format json',
        },
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
    });

    const recordActionId = `domain_dispatch:medautoscience:${attemptId}:record`;
    const projection = runCli(['runtime', 'app-operator-drilldown', '--detail', 'full'], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
    }).app_operator_drilldown;
    assert.equal(
      projection.operator_action_routing_refs.refs.some(
        (ref: { action_id: string; action_kind: string }) =>
          ref.action_id === recordActionId
          && ref.action_kind === 'domain_dispatch_evidence_receipt_record',
      ),
      true,
    );

    const pollutedPayloadExecution = runCliFailure([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify({
        evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
        paper_line_owner_chain_results: [
          {
            surface_kind: 'mas_paper_line_owner_chain_result',
            paper_line_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            result_kind: 'owner_receipt',
            owner_receipt_refs: ['mas://dm003/domain-owner-receipt-2'],
            progress_delta_refs: ['mas://dm003/ai-reviewer-currentness'],
            body_included: true,
            readiness_claims: {
              claims_paper_closure: true,
              claims_publication_ready: true,
              claims_artifact_mutation_authorized: true,
              claims_current_package_updated: true,
            },
          },
        ],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
    });

    assert.equal(pollutedPayloadExecution.payload.error.code, 'cli_usage_error');
    assert.equal(
      pollutedPayloadExecution.payload.error.details.error_kind,
      'domain_dispatch_evidence_payload_authority_claims_forbidden',
    );
    assert.equal(pollutedPayloadExecution.payload.error.details.receipt_recorded, false);
    assert.equal(
      pollutedPayloadExecution.payload.error.details.preflight.can_record_refs_only_receipt,
      false,
    );
    assert.deepEqual(
      pollutedPayloadExecution.payload.error.details.forbidden_payload_authority_claims.map(
        (claim: { path: string }) => claim.path,
      ),
      [
        'paper_line_owner_chain_results[0].body_included',
        'paper_line_owner_chain_results[0].readiness_claims.claims_paper_closure',
        'paper_line_owner_chain_results[0].readiness_claims.claims_publication_ready',
        'paper_line_owner_chain_results[0].readiness_claims.claims_artifact_mutation_authorized',
        'paper_line_owner_chain_results[0].readiness_claims.claims_current_package_updated',
      ],
    );

    const recordExecution = runCli([
      'runtime',
      'action',
      'execute',
      '--action',
      recordActionId,
      '--payload',
      JSON.stringify({
        evidence_refs: ['mas://dm003/paper-facing-artifact-delta'],
        paper_line_owner_chain_results: [
          {
            surface_kind: 'mas_paper_line_owner_chain_result',
            paper_line_id: '003-dpcc-primary-care-phenotype-treatment-gap',
            result_kind: 'owner_receipt',
            owner_receipt_refs: ['mas://dm003/domain-owner-receipt'],
            stable_typed_blocker_refs: [],
            progress_delta_refs: ['mas://dm003/ai-reviewer-currentness'],
            no_forbidden_write_proof_ref: 'mas://dm003/no-forbidden-write',
            body_included: false,
            readiness_claims: {
              claims_paper_closure: false,
              claims_publication_ready: false,
              claims_artifact_mutation_authorized: false,
              claims_current_package_updated: false,
            },
          },
        ],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_PROVIDER_PROOF_WINDOW_SECONDS: '86400',
    }).runtime_operator_action_execution;

    assert.equal(recordExecution.execution.execution_kind, 'opl_cli_external_evidence_apply');
    assert.equal(
      recordExecution.execution.result.domain_dispatch_evidence_payload_preflight.selected_payload_path,
      'success_refs_path',
    );
    assert.deepEqual(
      recordExecution.execution.result.external_evidence_apply.receipt.receipt_refs,
      ['mas://dm003/domain-owner-receipt'],
    );
    assert.deepEqual(
      recordExecution.execution.result.external_evidence_apply.receipt.owner_chain_refs,
      ['mas://dm003/ai-reviewer-currentness', 'mas://dm003/no-forbidden-write'],
    );
    assert.deepEqual(
      recordExecution.execution.result.external_evidence_apply.receipt.typed_blocker_refs,
      [],
    );
    assert.equal(recordExecution.authority_boundary.can_write_domain_truth, false);
    assert.equal(recordExecution.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
