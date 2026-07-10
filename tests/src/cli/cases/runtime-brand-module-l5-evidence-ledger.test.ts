import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

function withState(run: (env: Record<string, string>) => void) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-l5-evidence-'));
  try {
    run({ OPL_STATE_DIR: stateDir });
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

test('brand-module L5 ledger records and verifies refs without claiming L5', () => {
  withState((env) => {
    const recorded = runCli([
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
    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.receipt.authority_boundary.refs_only, true);
    assert.equal(recorded.receipt.authority_boundary.can_create_owner_receipt, false);
    assert.equal(recorded.receipt.authority_boundary.can_claim_l5_complete, false);
    assert.equal(recorded.l5_claim_status_after_record, 'evidence_recorded_not_l5_claimed');

    const verified = runCli([
      'runtime',
      'brand-module-l5-evidence',
      'verify',
      '--receipt-ref',
      recorded.receipt_ref,
    ], env).brand_module_l5_evidence_ledger_verify;
    assert.equal(verified.status, 'verified');
    assert.equal(verified.receipt.receipt_status, 'verified');
    assert.equal(verified.l5_claim_status_after_verify, 'receipt_verified_not_l5_claimed');

    const listed = runCli([
      'runtime',
      'brand-module-l5-evidence',
      'list',
      '--module',
      'runway',
    ], env).brand_module_l5_evidence_ledger;
    assert.equal(listed.verified_receipt_count, 1);
    assert.equal(listed.authority_boundary.can_claim_l5_complete, false);

    const status = runCli(['brand-modules', 'l5-status', '--module', 'runway'], env)
      .brand_module_l5_status;
    assert.equal(status.status, 'evidence_required');
    assert.equal(status.modules[0].l5_can_be_claimed, false);
  });
});

test('brand-module L5 ledger preserves blocker ownership and rejects empty or mixed payloads', () => {
  withState((env) => {
    for (const payload of [
      { module_id: 'connect', evidence_class_id: 'cross_agent_scaleout' },
      {
        module_id: 'connect',
        evidence_class_id: 'cross_agent_scaleout',
        typed_blocker_refs: ['typed-blocker:connect/cross-agent-open'],
        evidence_refs: ['scaleout:connect/demo'],
      },
    ]) {
      const failure = runCliFailure([
        'runtime',
        'brand-module-l5-evidence',
        'record',
        '--payload',
        JSON.stringify(payload),
      ], env);
      assert.equal(failure.status, 2);
      assert.equal(failure.payload.error.code, 'cli_usage_error');
    }
    assert.equal(
      runCli(['runtime', 'brand-module-l5-evidence', 'list'], env)
        .brand_module_l5_evidence_ledger.receipt_count,
      0,
    );

    const blocker = runCli([
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
    assert.equal(blocker.status, 'recorded');
    assert.deepEqual(blocker.receipt.typed_blocker_refs, [
      'typed-blocker:connect/cross-agent-open',
    ]);
    assert.equal(blocker.receipt.authority_boundary.can_create_typed_blocker, false);

    const status = runCli(['brand-modules', 'l5-status', '--module', 'connect'], env)
      .brand_module_l5_status;
    const route = status.modules[0].owner_evidence_routes.find(
      (entry: { class_id: string }) => entry.class_id === 'cross_agent_scaleout',
    );
    assert.equal(route.owner_route_status, 'owner_typed_blocker_recorded');
    assert.equal(route.l5_claim_status, 'owner_typed_blocker_recorded_not_l5_claimed');
    assert.equal(route.authority_boundary.route_can_claim_l5, false);
  });
});
