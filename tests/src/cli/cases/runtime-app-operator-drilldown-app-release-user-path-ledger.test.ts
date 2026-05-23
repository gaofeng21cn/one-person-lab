import { assert, fs, os, path, runCli, test } from '../helpers.ts';

function withTempState<T>(prefix: string, run: (stateRoot: string) => T) {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return run(stateRoot);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

function recordAppReleaseUserPathEvidence(stateRoot: string, payload: Record<string, unknown>) {
  return runCli([
    'runtime',
    'app-release-evidence',
    'record',
    '--payload',
    JSON.stringify(payload),
  ], {
    OPL_STATE_DIR: stateRoot,
  }).app_release_user_path_evidence_ledger_record;
}

test('runtime App drilldown consumes App release user-path evidence receipts', () => {
  withTempState('opl-app-release-user-path-ledger-state-', (stateRoot) => {
    const record = recordAppReleaseUserPathEvidence(stateRoot, {
      release_package_refs: ['release://opl-app/full/2026-05-22/dmg'],
      screenshot_refs: ['screenshot://opl-app/first-run/2026-05-22.png'],
      reload_prompt_user_path_refs: ['receipt://opl-app/reload-prompt/2026-05-22'],
      provider_state_linkage_refs: ['provider://temporal/cadence-window/2026-05-22'],
      long_operator_evidence_refs: ['soak://opl-app/operator/2026-05-22'],
    });
    assert.equal(record.status, 'recorded');
    assert.equal(record.recorded_receipt_count, 1);

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(output.summary.app_release_user_path_evidence_open_gate_count, 0);
    assert.equal(output.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 1);
    assert.equal(
      output.summary.app_release_user_path_evidence_recorded_ledger_receipt_ref_count,
      1,
    );
    assert.equal(
      output.summary.app_release_user_path_evidence_verified_ledger_receipt_ref_count,
      0,
    );
    assert.equal(
      output.summary.app_release_user_path_evidence_pending_verify_receipt_ref_count,
      1,
    );
    assert.equal(output.summary.app_release_user_path_evidence_typed_blocker_ref_count, 0);
    assert.equal(output.summary.app_release_user_path_production_user_path_ready, false);
    assert.equal(output.summary.app_release_user_path_release_ready_claimed, false);
    assert.equal(output.summary.app_release_user_path_production_ready_claimed, false);

    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(evidence.status, 'app_release_user_path_evidence_verify_pending');
    assert.equal(evidence.refs_observed_for_all_gates, true);
    assert.equal(evidence.evidence_ledger_status, 'ledger_refs_recorded_verify_pending');
    assert.equal(evidence.pending_verify_receipt_ref_count, 1);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.release_ready_claimed, false);
    assert.equal(evidence.production_ready_claimed, false);
    assert.equal(evidence.open_gate_count, 0);
    assert.deepEqual(evidence.open_gate_ids, []);
    assert.equal(evidence.gate_items.length, 0);
    assert.equal(evidence.ledger_receipt_ref_count, 1);
    assert.equal(evidence.authority_boundary.can_close_app_release_user_path, false);
    const nextStep = output.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'app_release_user_path_evidence',
    );
    assert.equal(Boolean(nextStep), true);
    assert.equal(nextStep.receipt_verification_required, true);
    assert.equal(nextStep.pending_verify_receipt_ref_count, 1);
    assert.equal(
      nextStep.verification_command_ref,
      `opl runtime app-release-evidence verify --receipt-ref ${record.receipt_refs[0]}`,
    );
    assert.equal(nextStep.can_submit_verify_to_safe_action_shell, true);
    assert.equal(nextStep.can_close_without_domain_or_app_payload, true);
    assert.equal(nextStep.can_close_app_release_user_path, false);
  });
});

test('runtime App drilldown keeps typed blocker refs as operator attention', () => {
  withTempState('opl-app-release-user-path-blocker-state-', (stateRoot) => {
    recordAppReleaseUserPathEvidence(stateRoot, {
      typed_blocker_refs: ['typed-blocker://opl-app/release-user-path/screenshot-missing'],
    });

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(output.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(output.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 1);
    assert.equal(output.summary.app_release_user_path_evidence_pending_verify_receipt_ref_count, 1);
    assert.equal(output.summary.app_release_user_path_evidence_typed_blocker_ref_count, 1);

    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(evidence.status, 'app_release_user_path_evidence_open');
    assert.equal(evidence.blocked_by_typed_blocker_refs, true);
    assert.equal(evidence.typed_blocker_ref_count, 1);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.refs_observed_for_all_gates, false);

    const nextStep = output.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'app_release_user_path_evidence',
    );
    assert.equal(Boolean(nextStep), true);
    assert.equal(
      nextStep.record_action_id,
      'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
    );
    assert.equal(nextStep.can_submit_record_to_safe_action_shell, true);
    assert.equal(nextStep.blocked_by_typed_blocker_refs, true);
    assert.equal(nextStep.typed_blocker_ref_count, 1);
    assert.equal(nextStep.can_close_app_release_user_path, false);
  });
});

test('runtime App drilldown does not combine App release user-path refs across release cohorts', () => {
  withTempState('opl-app-release-user-path-cohort-state-', (stateRoot) => {
    const packageRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      release_package_refs: ['release://opl-app/full/26.5.19/dmg'],
      provider_state_linkage_refs: ['provider://temporal/cadence-window/26.5.19'],
    });
    const firstRunRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      receipt_ref: 'opl://app-release-user-path-evidence/26.5.18-first-run',
      screenshot_refs: ['screenshot://opl-app/first-run/26.5.18.png'],
      reload_prompt_user_path_refs: ['receipt://opl-app/reload-prompt/26.5.18'],
      long_operator_evidence_refs: ['soak://opl-app/operator/26.5.18'],
    });
    assert.equal(packageRecord.status, 'recorded');
    assert.equal(firstRunRecord.status, 'recorded');

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;

    assert.equal(evidence.status, 'app_release_user_path_evidence_open');
    assert.equal(evidence.refs_observed_for_all_gates, false);
    assert.equal(evidence.open_gate_count, 5);
    assert.deepEqual(evidence.open_gate_ids, [
      'release_package_refs',
      'screenshot_refs',
      'reload_prompt_user_path_refs',
      'provider_state_linkage_refs',
      'long_operator_evidence_refs',
    ]);
    assert.equal(evidence.ledger_receipt_ref_count, 2);
    assert.equal(evidence.cohort_guard.status, 'cohort_ambiguous');
    assert.deepEqual(evidence.cohort_guard.candidate_cohort_ids, [
      'app-release-cohort:26.5.18',
      'app-release-cohort:26.5.19',
    ]);
    assert.equal(evidence.gate_items[0].cohort_guard_status, 'cohort_ambiguous');
    assert.equal(output.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(output.summary.app_release_user_path_production_ready_claimed, false);

    const nextStep = output.attention_first_payload.evidence_next_steps.items.find(
      (item: { step_kind: string }) => item.step_kind === 'app_release_user_path_evidence',
    );
    assert.equal(Boolean(nextStep), true);
    assert.equal(nextStep.cohort_guard_status, 'cohort_ambiguous');
    assert.deepEqual(nextStep.candidate_cohort_ids, [
      'app-release-cohort:26.5.18',
      'app-release-cohort:26.5.19',
    ]);
    assert.equal(nextStep.can_close_app_release_user_path, false);
  });
});
