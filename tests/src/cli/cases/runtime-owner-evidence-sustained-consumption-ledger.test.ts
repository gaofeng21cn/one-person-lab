import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';

test('runtime owner-evidence sustained-consumption records and verifies refs-only evidence', () => {
  const stateRoot = fs.mkdtempSync(path.join(
    os.tmpdir(),
    'opl-owner-evidence-sustained-consumption-state-',
  ));
  try {
    const env = { OPL_STATE_DIR: stateRoot };
    const receiptRef = 'opl://owner-evidence/sustained-consumption/example-domain';
    const targetIdentity = { domain_id: 'example-domain' };
    const payload = {
      receipt_ref: receiptRef,
      typed_blocker_refs: ['typed-blocker:owner-consumption/open'],
    };

    const recorded = runCli([
      'runtime',
      'owner-evidence-sustained-consumption',
      'record',
      '--target-identity',
      JSON.stringify(targetIdentity),
      '--payload',
      JSON.stringify(payload),
    ], env).owner_evidence_sustained_consumption_ledger_record;

    assert.equal(recorded.status, 'recorded');
    assert.equal(recorded.ledger_file, path.join(
      stateRoot,
      'owner-evidence-sustained-consumption-ledger.json',
    ));
    assert.equal(recorded.receipt_refs[0], receiptRef);

    const canonicalVerified = runCli([
      'runtime',
      'owner-evidence-sustained-consumption',
      'verify',
      '--receipt-ref',
      receiptRef,
    ], env).owner_evidence_sustained_consumption_ledger_verify;
    assert.equal(canonicalVerified.status, 'verified');
    assert.equal(canonicalVerified.receipt.source_surface, 'opl_owner_evidence_sustained_consumption_refs');

    const canonicalListed = runCli([
      'runtime',
      'owner-evidence-sustained-consumption',
      'list',
    ], env).owner_evidence_sustained_consumption_ledger;
    assert.equal(canonicalListed.verified_receipt_count, 1);
    assert.equal(canonicalListed.receipts[0].receipt_ref, receiptRef);
  } finally {
    fs.rmSync(stateRoot, { force: true, recursive: true });
  }
});
