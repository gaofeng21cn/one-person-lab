import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

test('runtime App release evidence CLI records refs-only user-path evidence without readiness claims', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-evidence-state-'));
  try {
    const initial = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(initial.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(initial.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 0);

    const payload = {
      release_package_refs: ['release:package/app-v0.1.0.dmg'],
      screenshot_refs: ['screenshot:app/first-run.png'],
      reload_prompt_user_path_refs: ['user-path:reload-prompt/first-run'],
      provider_state_linkage_refs: ['provider-state:temporal/cadence-linked'],
      long_operator_evidence_refs: ['long-operator:app/soak-4h'],
    };
    const recordOutput = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify(payload),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;

    assert.equal(recordOutput.status, 'recorded');
    assert.equal(recordOutput.recorded_receipt_count, 1);
    assert.equal(recordOutput.receipt_refs.length, 1);
    assert.equal(
      recordOutput.receipt_refs[0].startsWith('opl://app-release-user-path-evidence/'),
      true,
    );
    assert.equal(
      recordOutput.ledger_file,
      path.join(stateRoot, 'app-release-user-path-evidence-ledger.json'),
    );
    assert.equal(recordOutput.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_release_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_claim_production_ready, false);
    assert.equal(recordOutput.receipts[0].authority_boundary.can_close_app_release_user_path, false);

    const listOutput = runCli(['runtime', 'app-release-evidence', 'list'], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger;
    assert.equal(listOutput.receipt_count, 1);
    assert.equal(listOutput.authority_boundary.refs_only, true);
    assert.equal(listOutput.authority_boundary.can_claim_production_ready, false);

    const summary = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(summary.summary.app_release_user_path_evidence_gate_count, 5);
    assert.equal(summary.summary.app_release_user_path_evidence_open_gate_count, 0);
    assert.equal(summary.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 1);
    assert.equal(summary.summary.app_release_user_path_production_user_path_ready, false);
    assert.equal(summary.summary.app_release_user_path_release_ready_claimed, false);
    assert.equal(summary.summary.app_release_user_path_production_ready_claimed, false);

    const evidence = summary.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(evidence.status, 'app_release_user_path_evidence_refs_observed');
    assert.equal(evidence.refs_observed_for_all_gates, true);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.release_ready_claimed, false);
    assert.equal(evidence.production_ready_claimed, false);
    assert.equal(evidence.authority_boundary.can_close_app_release_user_path, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence CLI keeps typed blockers as open operator attention', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-evidence-blocker-state-'));
  try {
    const recordOutput = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify({
        typed_blocker_refs: ['typed-blocker:app-release/reload-prompt-not-run'],
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');

    const summary = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(summary.summary.app_release_user_path_evidence_open_gate_count, 5);
    assert.equal(summary.summary.app_release_user_path_evidence_ledger_receipt_ref_count, 1);
    assert.equal(summary.summary.app_release_user_path_evidence_typed_blocker_ref_count, 1);

    const evidence = summary.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(evidence.status, 'app_release_user_path_evidence_open');
    assert.equal(evidence.blocked_by_typed_blocker_refs, true);
    assert.equal(evidence.refs_observed_for_all_gates, false);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.authority_boundary.can_close_app_release_user_path, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('runtime App release evidence CLI accepts singular ref fields for operator payloads', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-app-release-evidence-singular-state-'));
  try {
    const recordOutput = runCli([
      'runtime',
      'app-release-evidence',
      'record',
      '--payload',
      JSON.stringify({
        release_package_ref: 'release:package/app-v0.1.0.dmg',
        screenshot_ref: 'screenshot:app/first-run.png',
        reload_prompt_user_path_ref: 'user-path:reload-prompt/first-run',
        provider_state_linkage_ref: 'provider-state:temporal/cadence-linked',
        long_operator_evidence_ref: 'long-operator:app/soak-4h',
      }),
    ], {
      OPL_STATE_DIR: stateRoot,
    }).app_release_user_path_evidence_ledger_record;
    assert.equal(recordOutput.status, 'recorded');
    assert.deepEqual(recordOutput.receipts[0].release_package_refs, [
      'release:package/app-v0.1.0.dmg',
    ]);
    assert.deepEqual(recordOutput.receipts[0].screenshot_refs, [
      'screenshot:app/first-run.png',
    ]);

    const summary = runCli(['runtime', 'app-operator-drilldown'], {
      OPL_STATE_DIR: stateRoot,
    }).app_operator_drilldown;
    assert.equal(summary.summary.app_release_user_path_evidence_open_gate_count, 0);
    assert.equal(summary.summary.app_release_user_path_production_ready_claimed, false);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
