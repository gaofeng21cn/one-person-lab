import { assert, runCli, runCliFailure, test } from '../helpers.ts';

test('framework operating maturity aggregates scaleout and L5 gaps without ready claims', () => {
  const maturity = runCli([
    'framework',
    'operating-maturity',
    '--family-defaults',
  ]).framework_operating_maturity;

  assert.equal(maturity.surface_kind, 'opl_family_operating_maturity_readout');
  assert.equal(maturity.owner, 'one-person-lab');
  assert.equal(maturity.status, 'evidence_required');
  assert.equal(maturity.baseline_level, 'L4_executable_baseline');
  assert.equal(maturity.target_level, 'L5_production_operating_maturity');

  assert.equal(maturity.summary.domain_owner_chain_open_domain_count, 4);
  assert.deepEqual(maturity.domain_owner_chain_scaleout.accepted_refs_only_result_shapes, [
    'domain_owner_receipt_ref',
    'typed_blocker_ref',
    'human_gate_ref',
    'quality_or_export_receipt_ref',
    'no_regression_ref',
    'long_soak_ref',
  ]);
  assert.equal(
    maturity.domain_owner_chain_scaleout.domains.every(
      (entry: { status: string; conformance_can_claim_domain_ready: boolean }) =>
        entry.status === 'required_from_domain_owner'
        && entry.conformance_can_claim_domain_ready === false,
    ),
    true,
  );

  assert.equal(maturity.summary.brand_module_l5_evidence_required_module_count, 9);
  assert.equal(maturity.brand_module_l5.status, 'evidence_required');
  assert.equal(maturity.brand_module_l5.l5_complete_module_count, 0);
  assert.equal(maturity.brand_module_l5.evidence_ledger.verified_receipt_count, 0);

  assert.equal(maturity.cleanup_retirement.physical_delete_authorized, false);
  assert.equal(maturity.cleanup_retirement.default_caller_delete_ready, false);
  assert.equal(maturity.cleanup_retirement.next_required_owner_action, 'domain_owner_choose_delete_authorize_keep_or_typed_blocker');

  assert.equal(maturity.app_release_user_path.status, 'evidence_required');
  assert.equal(maturity.provider_long_soak.status, 'evidence_required');
  assert.equal(maturity.memory_artifact_lifecycle.status, 'evidence_required');

  assert.deepEqual(maturity.next_owner_actions.map((entry: { lane: string }) => entry.lane), [
    'domain_owner_chain_scaleout',
    'brand_module_l5_operating_maturity',
    'app_release_user_path',
    'provider_long_soak',
    'private_platform_retirement',
    'memory_artifact_lifecycle_apply',
  ]);

  assert.equal(maturity.authority_boundary.can_claim_domain_ready, false);
  assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
  assert.equal(maturity.authority_boundary.can_claim_l5, false);
  assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
  assert.equal(maturity.authority_boundary.can_sign_owner_receipt, false);
  assert.equal(maturity.authority_boundary.can_create_typed_blocker, false);
});

test('framework operating maturity requires family defaults', () => {
  const failure = runCliFailure([
    'framework',
    'operating-maturity',
  ]);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
});
