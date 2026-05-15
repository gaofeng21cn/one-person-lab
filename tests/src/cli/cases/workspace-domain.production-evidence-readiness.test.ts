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
