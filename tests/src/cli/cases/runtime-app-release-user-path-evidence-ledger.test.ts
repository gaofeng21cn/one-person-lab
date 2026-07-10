import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

const recordAction = 'app_release_user_path_evidence:one_person_lab_app_release_user_path:record';

function withStateRoot(prefix: string, run: (stateRoot: string) => void): void {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    run(stateRoot);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
}

function recordEvidence(stateRoot: string, payload: Record<string, unknown>) {
  return runCli([
    'runtime',
    'app-release-evidence',
    'record',
    '--payload',
    JSON.stringify(payload),
  ], { OPL_STATE_DIR: stateRoot }).app_release_user_path_evidence_ledger_record;
}

test('App release ledger records, verifies, and stays refs-only without ready claims', () => {
  withStateRoot('opl-app-release-evidence-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const initial = runCli([
      'runtime',
      'app-operator-drilldown',
      '--detail',
      'full',
    ], env).app_operator_drilldown;
    const route = initial.operator_action_routing_refs.refs.find(
      (ref: { action_id: string }) => ref.action_id === recordAction,
    );
    assert.equal(route.payload_owner, 'app_live_operator_or_release_owner');
    assert.equal(route.route_requires_domain_or_app_payload, true);
    assert.equal(route.empty_payload_template_is_success_evidence, false);
    assert.equal(route.payload_workorder.authority_boundary.refs_only, true);
    assert.equal(route.payload_workorder.authority_boundary.can_create_owner_receipt, false);
    assert.equal(route.payload_workorder.authority_boundary.can_claim_release_ready, false);
    assert.equal(route.payload_workorder.authority_boundary.can_close_app_release_user_path, false);

    const recorded = recordEvidence(stateRoot, {
      release_package_refs: ['release:package/app-v0.1.0.dmg'],
      screenshot_refs: ['screenshot:app/first-run.png'],
      reload_prompt_user_path_refs: ['user-path:reload-prompt/first-run'],
      provider_state_linkage_refs: ['provider-state:temporal/cadence-linked'],
      long_operator_evidence_refs: ['long-operator:app/soak-4h'],
    });
    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.recorded_receipt_count, 1);
    assert.equal(
      recorded.ledger_file,
      path.join(stateRoot, 'app-release-user-path-evidence-ledger.json'),
    );
    assert.equal(recorded.receipts[0].receipt_path, 'same_cohort_release_user_path_refs_path');
    assert.equal(recorded.receipts[0].authority_boundary.refs_only, true);
    assert.equal(recorded.receipts[0].authority_boundary.can_claim_release_ready, false);
    assert.equal(recorded.receipts[0].authority_boundary.can_claim_production_ready, false);

    const pending = runCli([
      'runtime',
      'app-operator-drilldown',
      '--detail',
      'full',
    ], env).app_operator_drilldown;
    assert.equal(pending.summary.app_release_user_path_evidence_pending_verify_receipt_ref_count, 1);
    assert.equal(pending.summary.app_release_user_path_production_ready_claimed, false);

    const verified = runCli([
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      recorded.receipt_refs[0],
    ], env).app_release_user_path_evidence_ledger_verify;
    assert.equal(verified.status, 'verified');
    assert.equal(verified.receipt.receipt_status, 'verified');
    assert.equal(verified.receipt.authority_boundary.can_claim_release_ready, false);

    const current = runCli(['runtime', 'app-operator-drilldown'], env).app_operator_drilldown;
    assert.equal(current.summary.app_release_user_path_evidence_pending_verify_receipt_ref_count, 0);
    assert.equal(current.summary.app_release_user_path_evidence_verified_ledger_receipt_ref_count, 1);
    assert.equal(current.summary.app_release_user_path_release_ready_claimed, false);
    assert.equal(current.summary.app_release_user_path_production_ready_claimed, false);
  });
});

test('App release ledger keeps each owner payload path non-authoritative', () => {
  const cases = [
    {
      payload: { owner_acceptance_refs: ['owner-acceptance:app-release/26.5.19'] },
      receiptPath: 'release_owner_acceptance_path',
    },
    {
      payload: { release_owner_receipt_refs: ['release-owner:app/26.5.19'] },
      receiptPath: 'release_owner_verdict_path',
    },
    {
      payload: { install_evidence_refs: ['install-evidence:app/26.5.19'] },
      receiptPath: 'release_owner_verdict_path',
    },
  ];

  for (const [index, entry] of cases.entries()) {
    withStateRoot(`opl-app-release-owner-path-${index}-`, (stateRoot) => {
      const recorded = recordEvidence(stateRoot, entry.payload);
      assert.equal(recorded.receipts[0].receipt_path, entry.receiptPath);
      assert.equal(recorded.receipts[0].authority_boundary.refs_only, true);
      assert.equal(recorded.receipts[0].authority_boundary.can_claim_release_ready, false);
      assert.equal(recorded.receipts[0].authority_boundary.can_claim_production_ready, false);
    });
  }
});

test('App release ledger preserves typed blockers and rejects mixed or empty payloads', () => {
  withStateRoot('opl-app-release-blocker-', (stateRoot) => {
    const env = { OPL_STATE_DIR: stateRoot };
    const blocker = recordEvidence(stateRoot, {
      typed_blocker_refs: ['typed-blocker:app-release/reload-prompt-not-run'],
    });
    assert.equal(blocker.status, 'recorded');
    assert.equal(blocker.receipts[0].receipt_path, 'release_owner_typed_blocker_path');

    const summary = runCli(['runtime', 'app-operator-drilldown'], env).app_operator_drilldown;
    const evidence = summary.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
    assert.equal(evidence.blocked_by_typed_blocker_refs, true);
    assert.equal(evidence.production_user_path_ready, false);
    assert.equal(evidence.authority_boundary.can_close_app_release_user_path, false);
  });

  const invalidPayloads = [
    {},
    {
      release_package_refs: ['release:package/app-v0.1.0.dmg'],
      typed_blocker_refs: ['typed-blocker:app-release/screenshot-missing'],
    },
  ];
  for (const [index, payload] of invalidPayloads.entries()) {
    withStateRoot(`opl-app-release-invalid-${index}-`, (stateRoot) => {
      const env = { OPL_STATE_DIR: stateRoot };
      const failure = runCliFailure([
        'runtime',
        'action',
        'execute',
        '--action',
        recordAction,
        '--payload',
        JSON.stringify(payload),
      ], env);
      assert.equal(failure.status, 2);
      assert.equal(failure.payload.error.code, 'cli_usage_error');
      assert.equal(failure.payload.error.details.receipt_recorded, false);
      assert.equal(
        runCli(['runtime', 'app-release-evidence', 'list'], env)
          .app_release_user_path_evidence_ledger.receipt_count,
        0,
      );
    });
  }
});
