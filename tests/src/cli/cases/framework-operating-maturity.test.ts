import { assert, fs, os, path, runCli, runCliFailure, test } from '../helpers.ts';
import { createFamilyDefaultContractWorkspace } from './domain-pack-compiler-fixtures.ts';

function recordAppReleaseUserPathEvidence(
  env: Record<string, string>,
  payload: Record<string, unknown>,
) {
  return runCli([
    'runtime',
    'app-release-evidence',
    'record',
    '--payload',
    JSON.stringify(payload),
  ], env).app_release_user_path_evidence_ledger_record;
}

test('framework operating maturity aggregates scaleout and L5 gaps without ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

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

    assert.equal(maturity.summary.brand_module_l5_evidence_required_module_count, 10);
    assert.equal(maturity.brand_module_l5.status, 'evidence_required');
    assert.equal(maturity.brand_module_l5.l5_complete_module_count, 0);
    assert.equal(maturity.brand_module_l5.evidence_ledger.verified_receipt_count, 0);

    assert.equal(maturity.summary.cleanup_retirement_open_decision_count, 0);
    assert.equal(
      maturity.cleanup_retirement.status,
      'waiting_for_structural_prerequisites',
    );
    assert.equal(maturity.cleanup_retirement.deletion_evidence_worklist_count, 32);
    assert.equal(maturity.cleanup_retirement.owner_decision_missing_count, 0);
    assert.equal(maturity.cleanup_retirement.structural_prerequisites_observed, false);
    assert.equal(maturity.cleanup_retirement.all_deletion_evidence_requirements_observed, false);
    assert.equal(maturity.cleanup_retirement.physical_delete_authorized, false);
    assert.equal(maturity.cleanup_retirement.default_caller_delete_ready, false);
    assert.equal(maturity.cleanup_retirement.next_required_owner_action, 'domain_owner_choose_delete_authorize_keep_or_typed_blocker');

    assert.equal(maturity.summary.app_release_user_path_open_count, 1);
    assert.equal(maturity.app_release_user_path.status, 'evidence_required');
    assert.equal(maturity.app_release_user_path.production_user_path_ready, false);
    assert.equal(maturity.app_release_user_path.release_ready_authorized, false);
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
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity consumes verified App release user-path evidence without release-ready claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-operating-maturity-app-state-'));
  const workspaceRoot = createFamilyDefaultContractWorkspace();
  try {
    const env: Record<string, string> = {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
    };
    const record = recordAppReleaseUserPathEvidence(env, {
      release_package_refs: [
        'release_package_receipt_ref://one-person-lab-app/26.5.28-draft.20260527235839/remote-release-verification',
      ],
      screenshot_refs: [
        'screenshot_evidence_ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-vm-full/settings-runtime.png',
      ],
      reload_prompt_user_path_refs: [
        'first_run_log_ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-vm-full/smoke-events',
      ],
      provider_state_linkage_refs: [
        'provider_slo_receipt_ref://one-person-lab/temporal/26.5.28-draft.20260527235839/window-cadence-satisfied',
      ],
      long_operator_evidence_refs: [
        'long_operator_evidence_ref://one-person-lab-app/26.5.28-draft.20260527235839/github-actions-clean-vm',
      ],
    });
    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      record.receipt_refs[0],
    ], env);

    const maturity = runCli([
      'framework',
      'operating-maturity',
      '--family-defaults',
    ], env).framework_operating_maturity;

    assert.equal(maturity.summary.app_release_user_path_open_count, 0);
    assert.equal(
      maturity.app_release_user_path.status,
      'evidence_recorded_not_release_ready_claim',
    );
    assert.equal(maturity.app_release_user_path.next_required_delta, 'release_owner_verdict_still_not_claimed_by_opl');
    assert.equal(maturity.app_release_user_path.production_user_path_ready, true);
    assert.equal(maturity.app_release_user_path.open_gate_count, 0);
    assert.equal(maturity.app_release_user_path.pending_verify_receipt_ref_count, 0);
    assert.equal(maturity.app_release_user_path.typed_blocker_ref_count, 0);
    assert.equal(maturity.app_release_user_path.verified_ledger_receipt_ref_count, 1);
    assert.equal(
      maturity.app_release_user_path.selected_cohort_id,
      'app-release-cohort:26.5.28-draft.20260527235839',
    );
    assert.equal(maturity.app_release_user_path.release_ready_authorized, false);
    assert.equal(maturity.authority_boundary.can_claim_app_release_ready, false);
    assert.equal(maturity.authority_boundary.can_claim_production_ready, false);
    assert.equal(maturity.not_claims.includes('app_release_ready'), true);
    assert.equal(maturity.not_claims.includes('production_ready'), true);
    assert.equal(maturity.status, 'evidence_required');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('framework operating maturity requires family defaults', () => {
  const failure = runCliFailure([
    'framework',
    'operating-maturity',
  ]);

  assert.equal(failure.payload.error.code, 'cli_usage_error');
  assert.match(failure.payload.error.message, /requires --family-defaults/);
});
