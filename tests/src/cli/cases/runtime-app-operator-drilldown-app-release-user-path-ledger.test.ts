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

test('runtime App projection consumes App release user-path evidence receipts', () => {
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
    assert.equal(output.summary.app_release_user_path_evidence_open_gate_count, 5);
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
    assert.equal(evidence.status, 'app_release_user_path_evidence_open');
    assert.equal(evidence.refs_observed_for_all_gates, false);
    assert.equal(evidence.evidence_ledger_status, 'ledger_refs_recorded_verify_pending');
    assert.equal(evidence.pending_verify_receipt_ref_count, 1);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.release_ready_claimed, false);
    assert.equal(evidence.production_ready_claimed, false);
    assert.equal(evidence.open_gate_count, 5);
    assert.deepEqual(evidence.open_gate_ids, [
      'release_package_refs',
      'screenshot_refs',
      'reload_prompt_user_path_refs',
      'provider_state_linkage_refs',
      'long_operator_evidence_refs',
    ]);
    assert.equal(evidence.gate_items.length, 5);
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

    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      record.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    const verifiedOutput = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const verifiedEvidence = verifiedOutput.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(verifiedOutput.summary.app_release_user_path_evidence_open_gate_count, 0);
    assert.equal(verifiedEvidence.status, 'app_release_user_path_evidence_refs_observed');
    assert.equal(verifiedEvidence.refs_observed_for_all_gates, true);
    assert.equal(verifiedEvidence.pending_verify_receipt_ref_count, 0);
    assert.equal(verifiedEvidence.open_gate_count, 0);
    assert.deepEqual(verifiedEvidence.open_gate_ids, []);
    assert.equal(verifiedEvidence.gate_items.length, 0);
    assert.equal(verifiedEvidence.authority_boundary.can_close_app_release_user_path, false);
  });
});

test('runtime App projection keeps typed blocker refs as operator attention', () => {
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

test('runtime App projection retires gate-scoped typed blocker after same-cohort refs verify', () => {
  withTempState('opl-app-release-user-path-blocker-retired-state-', (stateRoot) => {
    const blockerRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      typed_blocker_refs: [
        'typed_blocker_ref://one-person-lab-app/26.5.19/long-operator-evidence-pending?gate=long_operator_evidence_refs',
      ],
    });
    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      blockerRecord.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const successRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      release_package_refs: ['release://opl-app/full/26.5.19/dmg'],
      screenshot_refs: ['screenshot://opl-app/live-window/26.5.19.png'],
      reload_prompt_user_path_refs: ['receipt://opl-app/reload-prompt/26.5.19'],
      provider_state_linkage_refs: ['provider://temporal/cadence-window/26.5.19'],
      long_operator_evidence_refs: [
        'long_operator_evidence_ref://one-person-lab-app/26.5.19/operator-window/hash',
      ],
    });
    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      successRecord.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;

    assert.equal(evidence.status, 'app_release_user_path_evidence_refs_observed');
    assert.equal(evidence.refs_observed_for_all_gates, true);
    assert.equal(evidence.open_gate_count, 0);
    assert.deepEqual(evidence.open_gate_ids, []);
    assert.equal(evidence.typed_blocker_ref_count, 0);
    assert.equal(evidence.blocked_by_typed_blocker_refs, false);
    assert.deepEqual(evidence.historical_typed_blocker_refs, [
      'typed_blocker_ref://one-person-lab-app/26.5.19/long-operator-evidence-pending?gate=long_operator_evidence_refs',
    ]);
    assert.equal(evidence.historical_typed_blocker_ref_count, 1);
    assert.equal(evidence.production_user_path_ready, true);
    assert.equal(evidence.release_ready_claimed, false);
    assert.equal(evidence.production_ready_claimed, false);
    assert.equal(evidence.authority_boundary.can_close_app_release_user_path, false);
    assert.equal(output.summary.app_release_user_path_evidence_typed_blocker_ref_count, 0);
    assert.equal(output.summary.app_release_user_path_production_user_path_ready, true);
    assert.equal(output.summary.app_release_user_path_release_ready_claimed, false);
    assert.equal(output.summary.app_release_user_path_production_ready_claimed, false);
  });
});

test('runtime App projection retires release-owner typed blocker after same-cohort owner verdict refs verify', () => {
  withTempState('opl-app-release-owner-blocker-retired-state-', (stateRoot) => {
    const blockerRef =
      'typed_blocker_ref://one-person-lab-app/release-owner/26.6.12-owner-verdict/verdict-pending';
    const blockerRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      typed_blocker_refs: [blockerRef],
    });
    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      blockerRecord.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const successRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      release_package_refs: [
        'release_package_receipt_ref://one-person-lab-app/v26.6.12/remote-release-verification?run=27415765472',
      ],
      screenshot_refs: [
        'screenshot_evidence_ref://one-person-lab-app/v26.6.12/standard-first-run/first-run-beginner.png',
      ],
      reload_prompt_user_path_refs: [
        'first_run_log_ref://one-person-lab-app/v26.6.12/standard-first-run/first-run.jsonl',
      ],
      provider_state_linkage_refs: [
        'provider_slo_receipt_ref://one-person-lab/v26.6.12/github-actions-window-cadence-satisfied',
      ],
      long_operator_evidence_refs: [
        'long_operator_evidence_ref://one-person-lab-app/v26.6.12/operator-evidence-bundle',
      ],
    });
    const ownerVerdictRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      release_owner_receipt_refs: [
        'release_owner_receipt_ref://one-person-lab-app/release-owner/v26.6.12/receipt-20260612-owner-verdict',
      ],
      install_evidence_refs: [
        'install_evidence_ref://one-person-lab-app/release-owner/26.6.12-owner-verdict/owner-review-handoff',
      ],
    });
    for (const receiptRef of [
      successRecord.receipt_refs[0],
      ownerVerdictRecord.receipt_refs[0],
    ]) {
      runCli([
        'runtime',
        'app-release-evidence',
        'verify',
        '--receipt-ref',
        receiptRef,
      ], {
        OPL_STATE_DIR: stateRoot,
      });
    }

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;

    assert.equal(evidence.status, 'app_release_user_path_evidence_refs_observed');
    assert.equal(evidence.refs_observed_for_all_gates, true);
    assert.equal(evidence.open_gate_count, 0);
    assert.deepEqual(evidence.open_gate_ids, []);
    assert.equal(evidence.typed_blocker_ref_count, 0);
    assert.equal(evidence.blocked_by_typed_blocker_refs, false);
    assert.deepEqual(evidence.historical_typed_blocker_refs, [blockerRef]);
    assert.equal(evidence.historical_typed_blocker_ref_count, 1);
    assert.equal(evidence.production_user_path_ready, true);
    assert.equal(evidence.release_ready_claimed, false);
    assert.equal(evidence.production_ready_claimed, false);
    assert.deepEqual(
      evidence.release_owner_verdict_handoff.observed_release_owner_receipt_refs,
      [
        'release_owner_receipt_ref://one-person-lab-app/release-owner/v26.6.12/receipt-20260612-owner-verdict',
      ],
    );
    assert.deepEqual(
      evidence.release_owner_verdict_handoff.observed_install_evidence_refs,
      [
        'install_evidence_ref://one-person-lab-app/release-owner/26.6.12-owner-verdict/owner-review-handoff',
      ],
    );
    assert.equal(
      evidence.release_owner_verdict_handoff.release_ready_authorized,
      false,
    );
    assert.equal(output.summary.app_release_user_path_evidence_typed_blocker_ref_count, 0);
    assert.equal(output.summary.app_release_user_path_production_user_path_ready, true);
    assert.equal(output.summary.app_release_user_path_release_ready_claimed, false);
    assert.equal(output.summary.app_release_user_path_production_ready_claimed, false);
  });
});

test('runtime App projection ignores typed blocker refs from a different release cohort', () => {
  withTempState('opl-app-release-user-path-cross-cohort-blocker-state-', (stateRoot) => {
    const blockerRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      typed_blocker_refs: [
        'typed_blocker_ref://one-person-lab-app/26.5.18/long-operator-evidence-pending?gate=long_operator_evidence_refs',
      ],
    });
    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      blockerRecord.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const packageRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      release_package_refs: ['release://opl-app/full/26.5.19/dmg'],
      provider_state_linkage_refs: ['provider://temporal/cadence-window/26.5.19'],
    });
    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      packageRecord.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;

    assert.equal(evidence.status, 'app_release_user_path_evidence_open');
    assert.deepEqual(evidence.open_gate_ids, [
      'screenshot_refs',
      'reload_prompt_user_path_refs',
      'long_operator_evidence_refs',
    ]);
    assert.equal(evidence.typed_blocker_ref_count, 0);
    assert.equal(evidence.blocked_by_typed_blocker_refs, false);
    assert.equal(evidence.historical_typed_blocker_ref_count, 1);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(output.summary.app_release_user_path_evidence_typed_blocker_ref_count, 0);
  });
});

test('runtime App projection does not combine App release user-path refs across release cohorts', () => {
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
    assert.equal(evidence.cohort_guard.status, 'cohort_unscoped');
    assert.deepEqual(evidence.cohort_guard.candidate_cohort_ids, []);
    assert.equal(evidence.gate_items[0].cohort_guard_status, 'cohort_unscoped');
    assert.equal(output.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(output.summary.app_release_user_path_production_ready_claimed, false);

    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      packageRecord.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });
    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      firstRunRecord.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const verifiedOutput = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const verifiedEvidence = verifiedOutput.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(verifiedEvidence.status, 'app_release_user_path_evidence_open');
    assert.equal(verifiedEvidence.refs_observed_for_all_gates, false);
    assert.equal(verifiedEvidence.open_gate_count, 5);
    assert.deepEqual(verifiedEvidence.open_gate_ids, [
      'release_package_refs',
      'screenshot_refs',
      'reload_prompt_user_path_refs',
      'provider_state_linkage_refs',
      'long_operator_evidence_refs',
    ]);
    assert.equal(verifiedEvidence.ledger_receipt_ref_count, 2);
    assert.equal(verifiedEvidence.cohort_guard.status, 'cohort_ambiguous');
    assert.deepEqual(verifiedEvidence.cohort_guard.candidate_cohort_ids, [
      'app-release-cohort:26.5.18',
      'app-release-cohort:26.5.19',
    ]);
    assert.equal(verifiedEvidence.gate_items[0].cohort_guard_status, 'cohort_ambiguous');
    assert.equal(verifiedOutput.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(verifiedOutput.summary.app_release_user_path_production_ready_claimed, false);

    const nextStep = verifiedOutput.attention_first_payload.evidence_next_steps.items.find(
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

test('runtime App projection selects the latest complete App release user-path cohort', () => {
  withTempState('opl-app-release-user-path-latest-complete-cohort-state-', (stateRoot) => {
    const oldCohortRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      release_package_refs: ['release://opl-app/full/26.5.19/dmg'],
      screenshot_refs: ['screenshot://opl-app/live-window/26.5.19.png'],
      reload_prompt_user_path_refs: ['receipt://opl-app/reload-prompt/26.5.19'],
      provider_state_linkage_refs: ['provider://temporal/cadence-window/26.5.19'],
      long_operator_evidence_refs: [
        'long_operator_evidence_ref://one-person-lab-app/26.5.19/operator-window/hash',
      ],
    });
    const draftCohortRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      release_package_refs: [
        'release_package_receipt_ref://one-person-lab-app/26.5.28-draft.20260527235839/remote-release-verification?run=26545950818&sha256=f342065b6c9a4841954e3d6e85e7167ecf9cfc5668bb067970a69909fc5fab04',
      ],
      screenshot_refs: [
        'screenshot_evidence_ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-vm-full/settings-runtime.png?artifact=7254845667&sha256=33c40c74c372b3d47b5cee969628434c05155d9632ac36c6ac13fad73b8404e3',
      ],
      reload_prompt_user_path_refs: [
        'first_run_log_ref://one-person-lab-app/26.5.28-draft.20260527235839/clean-vm-full/smoke-events?artifact=7254845667&sha256=952f076465fafce0f9ade0e865b68d9c0cfdbded1b774bc5587c8dcbc9b3945a',
      ],
      provider_state_linkage_refs: [
        'provider_slo_receipt_ref://one-person-lab/temporal/26.5.28-draft.20260527235839/window-cadence-satisfied?run=26545950818',
      ],
      long_operator_evidence_refs: [
        'long_operator_evidence_ref://one-person-lab-app/26.5.28-draft.20260527235839/github-actions-clean-vm?run=26545950818&standard_artifact=7254791472&full_artifact=7254845667',
      ],
    });

    for (const receiptRef of [
      oldCohortRecord.receipt_refs[0],
      draftCohortRecord.receipt_refs[0],
    ]) {
      runCli([
        'runtime',
        'app-release-evidence',
        'verify',
        '--receipt-ref',
        receiptRef,
      ], {
        OPL_STATE_DIR: stateRoot,
      });
    }

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;

    assert.equal(evidence.status, 'app_release_user_path_evidence_refs_observed');
    assert.equal(evidence.refs_observed_for_all_gates, true);
    assert.equal(evidence.production_user_path_ready, true);
    assert.equal(evidence.open_gate_count, 0);
    assert.deepEqual(evidence.open_gate_ids, []);
    assert.equal(evidence.cohort_guard.status, 'cohort_selected');
    assert.equal(
      evidence.cohort_guard.selected_cohort_id,
      'app-release-cohort:26.5.28-draft.20260527235839',
    );
    assert.deepEqual(evidence.cohort_guard.candidate_cohort_ids, [
      'app-release-cohort:26.5.19',
      'app-release-cohort:26.5.28-draft.20260527235839',
    ]);
    assert.equal(
      output.summary.app_release_user_path_evidence_open_gate_count,
      0,
    );
    assert.equal(output.summary.app_release_user_path_production_user_path_ready, true);
    assert.equal(output.summary.app_release_user_path_release_ready_claimed, false);
    assert.equal(output.summary.app_release_user_path_production_ready_claimed, false);
  });
});

test('runtime App projection does not let an older complete cohort hide newer incomplete App release evidence', () => {
  withTempState('opl-app-release-user-path-newer-incomplete-cohort-state-', (stateRoot) => {
    const oldCohortRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      release_package_refs: ['release://opl-app/full/26.5.19/dmg'],
      screenshot_refs: ['screenshot://opl-app/live-window/26.5.19.png'],
      reload_prompt_user_path_refs: ['receipt://opl-app/reload-prompt/26.5.19'],
      provider_state_linkage_refs: ['provider://temporal/cadence-window/26.5.19'],
      long_operator_evidence_refs: [
        'long_operator_evidence_ref://one-person-lab-app/26.5.19/operator-window/hash',
      ],
    });
    const newerPackageOnlyRecord = recordAppReleaseUserPathEvidence(stateRoot, {
      release_package_refs: [
        'release_package_receipt_ref://one-person-lab-app/26.5.28-draft.20260527235839/remote-release-verification?run=26545950818',
      ],
    });

    for (const receiptRef of [
      oldCohortRecord.receipt_refs[0],
      newerPackageOnlyRecord.receipt_refs[0],
    ]) {
      runCli([
        'runtime',
        'app-release-evidence',
        'verify',
        '--receipt-ref',
        receiptRef,
      ], {
        OPL_STATE_DIR: stateRoot,
      });
    }

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;

    assert.equal(evidence.status, 'app_release_user_path_evidence_open');
    assert.equal(evidence.refs_observed_for_all_gates, false);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.open_gate_count, 5);
    assert.equal(evidence.cohort_guard.status, 'cohort_ambiguous');
    assert.deepEqual(evidence.cohort_guard.complete_cohort_ids, [
      'app-release-cohort:26.5.19',
    ]);
    assert.equal(output.summary.app_release_user_path_production_user_path_ready, false);
  });
});

test('runtime App projection tolerates malformed percent escapes in App release refs', () => {
  withTempState('opl-app-release-user-path-malformed-percent-state-', (stateRoot) => {
    const record = recordAppReleaseUserPathEvidence(stateRoot, {
      release_package_refs: [
        'release_package_receipt_ref://one-person-lab-app/26.5.29-draft.1/remote-release-verification?path=bad%zz',
      ],
      screenshot_refs: [
        'screenshot_evidence_ref://one-person-lab-app/26.5.29-draft.1/settings-runtime.png?path=bad%zz',
      ],
      reload_prompt_user_path_refs: [
        'first_run_log_ref://one-person-lab-app/26.5.29-draft.1/first-run?path=bad%zz',
      ],
      provider_state_linkage_refs: [
        'provider_slo_receipt_ref://one-person-lab/temporal/26.5.29-draft.1/window-cadence-satisfied?path=bad%zz',
      ],
      long_operator_evidence_refs: [
        'long_operator_evidence_ref://one-person-lab-app/26.5.29-draft.1/github-actions-clean-vm?path=bad%zz',
      ],
    });

    runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      record.receipt_refs[0],
    ], {
      OPL_STATE_DIR: stateRoot,
    });

    const output = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    const evidence = output.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;

    assert.equal(evidence.status, 'app_release_user_path_evidence_refs_observed');
    assert.equal(evidence.cohort_guard.status, 'cohort_selected');
    assert.equal(
      evidence.cohort_guard.selected_cohort_id,
      'app-release-cohort:26.5.29-draft.1',
    );
    assert.equal(output.summary.app_release_user_path_evidence_open_gate_count, 0);
  });
});
