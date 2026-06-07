import { assert, fs, os, path, runCli, test } from '../helpers.ts';
import { createFamilyWorkspaceFixture } from './runtime-app-operator-drilldown-helpers.ts';

test('framework readiness keeps recorded App release user-path receipts in verify follow-through', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-app-release-state-'));
  const familyWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-framework-app-release-family-'));
  try {
    const { omaRepoDir, workspaceRoot } = createFamilyWorkspaceFixture(familyWorkspaceRoot);
    const payload = {
      release_package_refs: ['release://opl-app/full/2026-05-22/dmg'],
      screenshot_refs: ['screenshot://opl-app/first-run/2026-05-22.png'],
      reload_prompt_user_path_refs: ['receipt://opl-app/reload-prompt/2026-05-22'],
      provider_state_linkage_refs: ['provider://temporal/cadence-window/2026-05-22'],
      long_operator_evidence_refs: ['soak://opl-app/operator/2026-05-22'],
    };
    const record = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify(payload),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;
    assert.equal(record.status, 'recorded');

    const readiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_META_AGENT_REPO_DIR: omaRepoDir,
    }).framework_readiness;
    const evidence = readiness.attention_first_payload.app_release_user_path_evidence;
    assert.equal(evidence.status, 'app_release_user_path_evidence_open');
    assert.equal(evidence.open_gate_count, 5);
    assert.deepEqual(evidence.open_gate_ids, [
      'release_package_refs',
      'screenshot_refs',
      'reload_prompt_user_path_refs',
      'provider_state_linkage_refs',
      'long_operator_evidence_refs',
    ]);
    assert.equal(evidence.pending_verify_receipt_ref_count, 1);
    assert.equal(evidence.evidence_ledger_status, 'ledger_refs_recorded_verify_pending');
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.authority_boundary.can_close_app_release_user_path, false);

    const warning = readiness.attention_first_payload.warnings.find(
      (item: { warning_id?: string }) => item.warning_id === 'app_release_user_path_evidence',
    );
    assert.equal(Boolean(warning), true);
    assert.equal(warning.open_gate_count, 5);
    assert.equal(warning.pending_verify_receipt_ref_count, 1);
    assert.equal(warning.count, 6);

    const action = readiness.attention_first_payload.next_safe_actions.find(
      (item: { action_kind?: string }) =>
        item.action_kind === 'app_release_user_path_evidence_review',
    );
    if (readiness.attention_first_payload.blockers.length === 0) {
      assert.equal(Boolean(action), true);
      assert.equal(action.status, 'app_release_user_path_evidence_open');
      assert.equal(action.pending_verify_receipt_ref_count, 1);
      assert.equal(action.receipt_verification_required, true);
      assert.equal(
        action.verification_action_id,
        'app_release_user_path_evidence:one_person_lab_app_release_user_path:verify',
      );
      assert.equal(action.can_close_without_domain_or_app_payload, true);
      assert.equal(action.can_close_app_release_user_path, false);
      assert.equal(action.can_claim_production_ready, false);
    } else {
      assert.equal(
        readiness.attention_first_payload.next_safe_actions[0].step_kind,
        'framework_kernel_blocker_inspection',
      );
    }

    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      record.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    const verifiedReadiness = runCli(['framework', 'readiness', '--family-defaults'], {
      OPL_STATE_DIR: stateRoot,
      OPL_FAMILY_WORKSPACE_ROOT: workspaceRoot,
      OPL_META_AGENT_REPO_DIR: omaRepoDir,
    }).framework_readiness;
    assert.equal(
      verifiedReadiness.attention_first_payload.app_release_user_path_evidence.status,
      'app_release_user_path_evidence_refs_observed',
    );
    assert.equal(
      verifiedReadiness.attention_first_payload.app_release_user_path_evidence
        .pending_verify_receipt_ref_count,
      0,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(familyWorkspaceRoot, { recursive: true, force: true });
  }
});
