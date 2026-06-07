import { assert, runCli, test } from '../helpers.ts';
import { buildReadyAgentRepo } from './agents-conformance-fixtures.ts';

test('agents readiness exposes StageRun adoption read model without readiness authority', () => {
  const repoDir = buildReadyAgentRepo();
  const readiness = runCli([
    'agents',
    'readiness',
    '--agent',
    `sample=${repoDir}`,
  ]).agent_readiness;

  const adoption = readiness.stage_run_domain_adoption_read_model;
  assert.equal(adoption.surface_kind, 'opl_stage_run_domain_adoption_read_model');
  assert.equal(adoption.status, 'passed');
  assert.equal(adoption.domain_count, 1);
  assert.equal(adoption.controlled_canary_evidence_scope, 'controlled_fixture_not_live_domain_progress');
  assert.equal(adoption.production_evidence_tail_count, 2);
  assert.equal(adoption.open_production_evidence_tail_count, 2);
  assert.equal(
    adoption.live_stage_run_progress_evidence_worklist.surface_kind,
    'opl_live_stage_run_progress_evidence_worklist',
  );
  assert.equal(adoption.live_stage_run_progress_evidence_worklist.open_domain_count, 1);
  assert.equal(
    adoption.live_stage_run_progress_evidence_worklist.domains[0].next_required_owner_action,
    'domain_owner_live_receipt_typed_blocker_no_regression_or_long_soak_ref_required',
  );
  assert.equal(
    adoption.live_stage_run_progress_evidence_worklist.authority_boundary.can_sign_owner_receipt,
    false,
  );
  assert.equal(
    adoption.live_stage_run_progress_evidence_worklist.authority_boundary.can_create_typed_blocker,
    false,
  );
  assert.equal(adoption.controlled_canary_claims_live_domain_progress, false);
  assert.equal(adoption.conformance_pass_counts_as_domain_ready, false);
  assert.equal(adoption.conformance_pass_counts_as_production_ready, false);
  assert.equal(adoption.authority_boundary.can_claim_domain_ready, false);
  assert.equal(adoption.authority_boundary.can_create_typed_blocker, false);
  assert.equal(readiness.summary.stage_run_domain_adoption_status, 'passed');
  assert.equal(readiness.summary.stage_run_domain_adoption_domain_count, 1);
  assert.equal(
    readiness.summary.stage_run_controlled_canary_evidence_scope,
    'controlled_fixture_not_live_domain_progress',
  );

  const domain = adoption.domains[0];
  assert.equal(domain.domain_id, 'sample-brief-agent');
  assert.equal(domain.stage_run_kernel_profile_status, 'passed');
  assert.equal(domain.stage_run_canary_evidence_status, 'passed');
  assert.equal(domain.stage_run_canary_evidence_scope, 'controlled_fixture_not_live_domain_progress');
  assert.equal(domain.structural_conformance_is_domain_ready, false);
  assert.equal(domain.authority_boundary.can_claim_production_ready, false);
});
