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
        evidence_class_id: 'release_install_evidence',
        typed_blocker_refs: ['typed-blocker:connect/release-open'],
      }),
    ], env).brand_module_l5_evidence_ledger_record;
    assert.equal(record.status, 'recorded');
    assert.equal(record.receipt.typed_blocker_refs.includes('typed-blocker:connect/release-open'), true);

    const failure = runCliFailure([
      'runtime',
      'brand-module-l5-evidence',
      'record',
      '--payload',
      JSON.stringify({
        module_id: 'connect',
        evidence_class_id: 'release_install_evidence',
        typed_blocker_refs: ['typed-blocker:connect/release-open'],
        evidence_refs: ['release:connect/demo'],
      }),
    ], env);
    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.match(failure.payload.error.message, /cannot mix typed blockers/);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
