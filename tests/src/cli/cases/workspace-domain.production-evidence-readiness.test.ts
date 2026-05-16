import { assert, createFamilyContractsFixtureRoot, fs, os, path, runCli, test } from '../helpers.ts';

test('framework production-closeout exposes refs-only production evidence readiness summary', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-production-evidence-readiness-state-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const closeout = runCli(['framework', 'production-closeout'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).production_functional_closeout;
    const readiness = closeout.production_evidence_readiness;

    assert.equal(readiness.surface_kind, 'opl_production_evidence_readiness_summary');
    assert.equal(readiness.projection_scope, 'production_functional_closeout');
    assert.equal(readiness.readiness_status, 'functional_evidence_has_pending_gates');
    assert.equal(readiness.live_soak_gate.claims_live_soak_complete, false);
    assert.equal(
      readiness.pending_gates.includes('production_provider_readiness'),
      true,
    );
    assert.equal(
      readiness.pending_gates.includes('provider_hosted_domain_stage_attempts'),
      true,
    );
    assert.equal(readiness.provider_slo_evidence.provider_ready, false);
    assert.equal(readiness.provider_slo_evidence.proof_slo_status, 'no_proof_observed');
    assert.equal(readiness.provider_slo_evidence.slo_execution_receipts.event_count, 0);
    assert.equal(readiness.stage_attempt_evidence.ledger_attempt_count, 0);
    assert.equal(readiness.domain_coverage.domain_count, 3);
    assert.equal(readiness.domain_coverage.domain_with_attempt_count, 0);
    assert.equal(
      readiness.domain_coverage.domains.every((domain: { coverage_status: string }) =>
        domain.coverage_status === 'missing_stage_attempt_evidence'
      ),
      true,
    );
    assert.equal(readiness.authority_boundary.can_execute_domain_action, false);
    assert.equal(readiness.authority_boundary.can_write_domain_truth, false);
    assert.equal(readiness.authority_boundary.can_write_domain_memory_body, false);
    assert.equal(readiness.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(readiness.authority_boundary.can_authorize_quality_verdict, false);
    assert.equal(readiness.authority_boundary.provider_completion_is_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('framework production-closeout counts MAS guarded-apply receipts as refs-only owner-chain evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-production-evidence-readiness-mas-'));
  const { fixtureContractsRoot } = createFamilyContractsFixtureRoot();

  try {
    const dm002 = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'paper_autonomy/guarded-apply',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        surface_kind: 'opl_provider_hosted_task_workspace_locator',
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        study_id: 'DM002',
        provider_attempt_id: 'opl-temporal:nfpitnet:DM002:provider-hosted-guarded-apply',
        target_studies: ['DM002'],
        authority_boundary: 'mas_owner_guarded_apply_only',
      }),
      '--source-fingerprint',
      'source:dm002-owner-receipt',
    ], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      dm002.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'domain_stage_closeout_packet',
        closeout_refs: [
          'artifacts/runtime/opl_family_sidecar/dispatch_receipts/dm002-owner.json',
          'mas-sidecar-dispatch:frt-dm002',
        ],
        consumed_refs: ['studies/002-early-residual-risk/artifacts/controller_decisions/latest.json'],
        rejected_writes: [],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_owner_receipt_observed',
        route_impact: {
          decision: 'applied',
          guarded_apply_status: 'mas_owner_apply_receipt_observed',
          provider_attempt_state: 'mas_owner_receipt_present',
          receipt_ref: 'artifacts/runtime/opl_family_sidecar/dispatch_receipts/dm002-owner.json',
          typed_blocker_count: 0,
          forbidden_write_guard_result: 'fail_closed_no_forbidden_writes',
          writes_performed: false,
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_owner_receipt_observed',
        },
      }),
    ], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

    const dm003 = runCli([
      'family-runtime',
      'attempt',
      'create',
      '--domain',
      'medautoscience',
      '--stage',
      'paper_autonomy/guarded-apply',
      '--provider',
      'local_sqlite',
      '--workspace-locator',
      JSON.stringify({
        surface_kind: 'opl_provider_hosted_task_workspace_locator',
        domain_id: 'medautoscience',
        task_kind: 'paper_autonomy/guarded-apply',
        study_id: 'DM003',
        provider_attempt_id: 'opl-temporal:nfpitnet:DM003:provider-hosted-guarded-apply',
        target_studies: ['DM003'],
        authority_boundary: 'mas_owner_guarded_apply_only',
      }),
      '--source-fingerprint',
      'source:dm003-typed-blocker',
    ], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });
    runCli([
      'family-runtime',
      'attempt',
      'fixture-run',
      dm003.family_runtime_stage_attempt.attempt.stage_attempt_id,
      '--closeout-packet',
      JSON.stringify({
        surface_kind: 'domain_stage_closeout_packet',
        closeout_refs: [
          'artifacts/runtime/opl_family_sidecar/dispatch_receipts/dm003-blocker.json',
          'mas-sidecar-dispatch:frt-dm003',
        ],
        consumed_refs: ['mas-paper-soak:DM003:typed_blocker'],
        rejected_writes: [
          {
            blocker_kind: 'mas_guarded_apply_owner_receipt',
            blocker_id: 'mas_owner_apply_receipt_missing:dm003',
            owner: 'MedAutoScience',
            write_permitted: false,
          },
        ],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: {
          decision: 'typed_blocker',
          guarded_apply_status: 'blocked_no_mas_owner_apply_receipt',
          provider_attempt_state: 'mas_owner_receipt_missing',
          receipt_ref: 'artifacts/runtime/opl_family_sidecar/dispatch_receipts/dm003-blocker.json',
          typed_blocker_count: 1,
          forbidden_write_guard_result: 'fail_closed_no_forbidden_writes',
          writes_performed: false,
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
        },
      }),
    ], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
    });

    const closeout = runCli(['framework', 'production-closeout'], {
      OPL_CONTRACTS_DIR: fixtureContractsRoot,
      OPL_STATE_DIR: stateRoot,
      OPL_TEMPORAL_ADDRESS: '',
      TEMPORAL_ADDRESS: '',
    }).production_functional_closeout;
    const readiness = closeout.production_evidence_readiness;
    const mas = readiness.domain_coverage.domains.find((domain: { domain_id: string }) =>
      domain.domain_id === 'medautoscience'
    );

    assert.equal(mas.coverage_status, 'owner_chain_ref_or_typed_blocker_observed');
    assert.equal(mas.owner_receipt_ref_count, 1);
    assert.equal(mas.typed_blocker_count, 1);
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.surface_kind, 'opl_stage_attempt_control_loop_summary');
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.projection_scope, 'production_functional_closeout');
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.summary.attempt_count, 2);
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.summary.receipt_ref_count, 1);
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.summary.blocker_count, 1);
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.summary.domain_with_action_route_count, 1);
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.summary.domain_with_blocker_count, 1);
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.summary.action_route_count > 0, true);
    assert.equal(
      closeout.stage_attempt_evidence.control_loop_summary.source_refs.includes(
        '/stage_attempt_evidence/domain_breakdown/medautoscience',
      ),
      true,
    );
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.authority_boundary.can_execute_domain_action, false);
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.authority_boundary.can_write_domain_truth, false);
    assert.equal(closeout.stage_attempt_evidence.control_loop_summary.authority_boundary.can_authorize_domain_ready, false);
    assert.equal(
      readiness.pending_gates.includes('domain_owner_chain_refs_or_typed_blockers'),
      false,
    );
    assert.equal(readiness.live_soak_gate.claims_live_soak_complete, false);
    assert.equal(readiness.authority_boundary.can_write_domain_truth, false);
    assert.equal(readiness.authority_boundary.can_authorize_domain_ready, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
