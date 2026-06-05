import { assert, runCli, test } from '../helpers.ts';

test('framework readiness projects agent StageRun adoption without authority promotion', () => {
  const readiness = runCli([
    'framework',
    'readiness',
    '--family-defaults',
  ]).framework_readiness;

  const tail = readiness.agent_conformance_tail;
  const adoption = tail.stage_run_domain_adoption_read_model;
  assert.equal(adoption.surface_kind, 'opl_stage_run_domain_adoption_read_model');
  assert.equal(tail.stage_run_domain_adoption_status, adoption.status);
  assert.equal(tail.stage_run_domain_adoption_domain_count, adoption.domain_count);
  assert.equal(
    tail.stage_run_controlled_canary_evidence_scope,
    adoption.controlled_canary_evidence_scope,
  );
  assert.equal(adoption.controlled_canary_claims_live_domain_progress, false);
  assert.equal(adoption.conformance_pass_counts_as_domain_ready, false);
  assert.equal(adoption.conformance_pass_counts_as_production_ready, false);
  assert.equal(adoption.authority_boundary.can_claim_live_domain_progress, false);
  assert.equal(adoption.authority_boundary.can_claim_domain_ready, false);
  assert.equal(adoption.authority_boundary.can_claim_production_ready, false);
  assert.equal(adoption.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(adoption.authority_boundary.can_create_typed_blocker, false);
  assert.equal(adoption.authority_boundary.can_authorize_physical_delete, false);
  assert.deepEqual(
    tail.authority_boundary.stage_run_domain_adoption_authority_boundary,
    adoption.authority_boundary,
  );
  assert.equal(
    adoption.domains.every((domain: { structural_conformance_is_domain_ready: boolean }) =>
      domain.structural_conformance_is_domain_ready === false
    ),
    true,
  );
});
