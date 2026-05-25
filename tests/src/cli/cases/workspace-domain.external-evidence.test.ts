import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

test('agents evidence apply records and verifies refs-only external evidence receipts', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-external-evidence-'));
  const env = { OPL_STATE_DIR: stateRoot };

  try {
    const recorded = runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'med-autogrant',
      '--request-id',
      'hosted-caller-proof',
      '--request-pack-id',
      'mag.external.evidence',
      '--source-ref',
      'mag://requests/hosted-caller-proof',
      '--evidence-ref',
      'mag://proof/hosted-caller.json,mag://proof/app-route.json',
      '--domain-receipt-ref',
      'mag://receipts/owner-chain.json',
      '--typed-blocker-ref',
      'mag://blockers/user-review-needed.json',
      '--release-dist-ref',
      'app://release/full-package.dmg',
      '--direct-hosted-parity-ref',
      'mag://proof/direct-hosted-parity.json',
      '--owner-chain-ref',
      'mag://proof/owner-chain.json',
      '--memory-writeback-receipt-ref',
      'mag://memory/writeback/receipt.json',
      '--artifact-mutation-receipt-ref',
      'mag://artifact/mutation/receipt.json',
      '--package-lifecycle-receipt-ref',
      'mag://package/lifecycle/receipt.json',
      '--lifecycle-receipt-ref',
      'mag://lifecycle/cleanup/receipt.json',
      '--restore-proof-ref',
      'mag://restore/proof/receipt.json',
    ], env).external_evidence_apply;

    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.writes_performed, true);
    assert.equal(recorded.receipt.authority_boundary.opl_records_refs_only, true);
    assert.equal(recorded.receipt.authority_boundary.opl_can_write_domain_truth, false);
    assert.deepEqual(recorded.receipt.evidence_refs, [
      'mag://proof/hosted-caller.json',
      'mag://proof/app-route.json',
    ]);
    assert.deepEqual(recorded.receipt.memory_writeback_receipt_refs, [
      'mag://memory/writeback/receipt.json',
    ]);
    assert.deepEqual(recorded.receipt.artifact_mutation_receipt_refs, [
      'mag://artifact/mutation/receipt.json',
    ]);
    assert.deepEqual(recorded.receipt.package_lifecycle_receipt_refs, [
      'mag://package/lifecycle/receipt.json',
    ]);
    assert.deepEqual(recorded.receipt.lifecycle_receipt_refs, [
      'mag://lifecycle/cleanup/receipt.json',
    ]);
    assert.deepEqual(recorded.receipt.restore_proof_refs, [
      'mag://restore/proof/receipt.json',
    ]);
    assert.equal(recorded.receipt.authority_boundary.opl_can_read_memory_body, false);
    assert.equal(recorded.receipt.authority_boundary.opl_can_read_artifact_body, false);
    assert.equal(recorded.receipt.authority_boundary.opl_can_authorize_quality_or_export, false);

    const verified = runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'med-autogrant',
      '--request-id',
      'hosted-caller-proof',
      '--mode',
      'verify',
    ], env).external_evidence_apply;

    assert.equal(verified.status, 'verified');
    assert.equal(verified.writes_performed, true);
    assert.equal(verified.receipt.receipt_status, 'verified');
    assert.deepEqual(verified.receipt.owner_chain_refs, ['mag://proof/owner-chain.json']);
    assert.deepEqual(verified.receipt.package_lifecycle_receipt_refs, [
      'mag://package/lifecycle/receipt.json',
    ]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('agents evidence apply blocks verify without a matching request receipt', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-external-evidence-missing-'));
  const env = { OPL_STATE_DIR: stateRoot };

  try {
    const blocked = runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'med-autogrant',
      '--request-id',
      'missing-proof',
      '--mode',
      'verify',
    ], env).external_evidence_apply;

    assert.equal(blocked.status, 'blocked');
    assert.equal(blocked.writes_performed, false);
    assert.equal(blocked.blocker.blocker_id, 'external_evidence_receipt_not_found');
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
