import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

test('runtime brand-module L5 evidence ledger records and verifies refs without closing L5', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-l5-evidence-state-'));
  const env = { OPL_STATE_DIR: stateDir };

  try {
    const record = runCli([
      'runtime',
      'brand-module-l5-evidence',
      'record',
      '--payload',
      JSON.stringify({
        module_id: 'runway',
        evidence_class_id: 'long_soak_recovery',
        evidence_refs: ['long-soak:runway/demo'],
        owner_acceptance_refs: ['owner-acceptance:runway/demo'],
      }),
    ], env).brand_module_l5_evidence_ledger_record;

    assert.equal(record.status, 'recorded');
    assert.equal(record.recorded_receipt_count, 1);
    assert.equal(record.receipt.module_id, 'runway');
    assert.equal(record.receipt.evidence_class_id, 'long_soak_recovery');
    assert.equal(record.receipt.evidence_refs.includes('long-soak:runway/demo'), true);
    assert.equal(record.receipt.owner_acceptance_refs.includes('owner-acceptance:runway/demo'), true);
    assert.equal(record.receipt.authority_boundary.can_claim_l5_complete, false);
    assert.equal(record.l5_claim_status_after_record, 'evidence_recorded_not_l5_claimed');

    const listedBeforeVerify = runCli([
      'runtime',
      'brand-module-l5-evidence',
      'list',
      '--module',
      'runway',
    ], env).brand_module_l5_evidence_ledger;
    assert.equal(listedBeforeVerify.receipt_count, 1);
    assert.equal(listedBeforeVerify.verified_receipt_count, 0);
    assert.equal(listedBeforeVerify.filters.module_id, 'runway');
    assert.equal(listedBeforeVerify.authority_boundary.can_claim_l5_complete, false);

    const verify = runCli([
      'runtime',
      'brand-module-l5-evidence',
      'verify',
      '--receipt-ref',
      record.receipt_ref,
    ], env).brand_module_l5_evidence_ledger_verify;
    assert.equal(verify.status, 'verified');
    assert.equal(verify.receipt.receipt_status, 'verified');
    assert.equal(verify.l5_claim_status_after_verify, 'receipt_verified_not_l5_claimed');

    const listedAfterVerify = runCli([
      'runtime',
      'brand-module-l5-evidence',
      'list',
      '--module',
      'runway',
      '--class',
      'long_soak_recovery',
    ], env).brand_module_l5_evidence_ledger;
    assert.equal(listedAfterVerify.receipt_count, 1);
    assert.equal(listedAfterVerify.verified_receipt_count, 1);
    assert.equal(listedAfterVerify.l5_claim_status, 'ledger_refs_only_not_l5_claimed');

    const status = runCli(['brand-modules', 'l5-status'], env).brand_module_l5_status;
    assert.equal(status.status, 'evidence_required');
    assert.equal(status.l5_complete_module_count, 0);
    assert.deepEqual(status.l5_complete_module_ids, []);
    assert.equal(status.evidence_ledger.receipt_count, 1);
      assert.equal(status.evidence_ledger.verified_receipt_count, 1);
      const runway = status.modules.find((entry: { module_id: string }) => entry.module_id === 'runway');
      assert.equal(runway.evidence_ledger.receipt_count, 1);
      assert.deepEqual(runway.evidence_ledger.verified_evidence_class_ids, ['long_soak_recovery']);
      assert.equal(runway.l5_can_be_claimed, false);
      assert.equal(runway.evidence_requirement_count, 13);
      assert.equal(runway.open_requirement_count, 3);
      const route = runway.owner_evidence_routes.find((entry: { class_id: string }) =>
        entry.class_id === 'long_soak_recovery'
      );
      assert.equal(route.owner_route_status, 'owner_evidence_recorded_not_l5_claimed');
      assert.equal(route.blocker_state, 'refs_observed_not_l5_claim');
      assert.equal(route.observed_receipt_count, 1);
      assert.equal(route.verified_receipt_count, 1);
      assert.deepEqual(route.observed_ref_shapes, [
        'long_soak_ref',
        'evidence_ref',
        'operator_evidence_ref',
        'owner_acceptance_ref',
        'ledger_receipt_ref',
      ]);
    assert.equal(route.observed_receipt_refs.includes(record.receipt_ref), true);
    assert.equal(route.observed_evidence_refs.includes('long-soak:runway/demo'), true);
    assert.equal(route.observed_evidence_refs.includes('owner-acceptance:runway/demo'), true);
    assert.equal(route.l5_claim_status, 'owner_evidence_refs_observed_not_l5_claimed');
    assert.equal(route.authority_boundary.route_can_claim_l5, false);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('runtime brand-module L5 evidence ledger accepts blockers and rejects mixed blocker success refs', () => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-l5-blocker-state-'));
  const env = { OPL_STATE_DIR: stateDir };

  try {
      const record = runCli([
        'runtime',
        'brand-module-l5-evidence',
        'record',
        '--payload',
        JSON.stringify({
          module_id: 'connect',
          evidence_class_id: 'cross_agent_scaleout',
          typed_blocker_refs: ['typed-blocker:connect/cross-agent-open'],
        }),
      ], env).brand_module_l5_evidence_ledger_record;
      assert.equal(record.status, 'recorded');
      assert.equal(record.receipt.typed_blocker_refs.includes('typed-blocker:connect/cross-agent-open'), true);

      const status = runCli(['brand-modules', 'l5-status', '--module', 'connect'], env).brand_module_l5_status;
      const connect = status.modules[0];
      const route = connect.owner_evidence_routes.find((entry: { class_id: string }) =>
        entry.class_id === 'cross_agent_scaleout'
      );
    assert.equal(status.status, 'evidence_required');
    assert.equal(connect.l5_can_be_claimed, false);
    assert.equal(connect.next_action_summary.false_completion_guard.ready_claim_authorized, false);
    assert.equal(route.owner_route_status, 'owner_typed_blocker_recorded');
    assert.equal(route.blocker_state, 'typed_blocker_recorded');
    assert.equal(route.next_owner_action, 'resolve_typed_blocker_or_record_owner_acceptance_ref');
      assert.equal(route.owner_evidence_closure_state, 'owner_typed_blocker_recorded');
      assert.equal(route.observed_typed_blocker_ref_count, 2);
      assert.equal(
        route.observed_evidence_refs.includes(
          'typed-blocker:opl-brand-l5/connect/cross_agent_scaleout/owner-evidence-needed-20260612',
        ),
        true,
      );
      assert.equal(
        route.observed_evidence_refs.includes('typed-blocker:connect/cross-agent-open'),
        true,
      );
    assert.equal(route.l5_claim_status, 'owner_typed_blocker_recorded_not_l5_claimed');

    const failure = runCliFailure([
      'runtime',
      'brand-module-l5-evidence',
      'record',
      '--payload',
      JSON.stringify({
          module_id: 'connect',
          evidence_class_id: 'cross_agent_scaleout',
          typed_blocker_refs: ['typed-blocker:connect/cross-agent-open'],
          evidence_refs: ['scaleout:connect/demo'],
        }),
    ], env);
    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.match(failure.payload.error.message, /cannot mix typed blockers/);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
