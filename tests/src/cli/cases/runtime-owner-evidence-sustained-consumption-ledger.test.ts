import {
  assert,
  fs,
  os,
  path,
  runCli,
  test,
} from '../helpers.ts';
import {
  buildRuntimeOwnerEvidenceSustainedConsumptionCommandSpecs,
} from '../../../../src/entrypoints/cli/cases/runtime-owner-evidence-sustained-consumption-command-spec.ts';

test('runtime owner-evidence sustained-consumption is canonical while MAG command stays legacy alias', () => {
  const stateRoot = fs.mkdtempSync(path.join(
    os.tmpdir(),
    'opl-owner-evidence-sustained-consumption-state-',
  ));
  try {
    const env = { OPL_STATE_DIR: stateRoot };
    const receiptRef = 'opl://owner-evidence/sustained-consumption/medautogrant';
    const targetIdentity = { domain_id: 'medautogrant' };
    const payload = {
      receipt_ref: receiptRef,
      typed_blocker_refs: ['typed-blocker:app/operator/mag/open'],
    };

    const commandSpecs = buildRuntimeOwnerEvidenceSustainedConsumptionCommandSpecs();
    assert.equal(
      commandSpecs['runtime mag-manifest-sustained-consumption list'].summary,
      'Deprecated legacy compatibility alias for runtime owner-evidence-sustained-consumption list.',
    );

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

    const legacyListed = runCli([
      'runtime',
      'mag-manifest-sustained-consumption',
      'list',
    ], env).owner_evidence_sustained_consumption_ledger;

    assert.equal(
      legacyListed.surface_kind,
      'opl_owner_evidence_sustained_consumption_ledger_projection',
    );
    assert.equal(legacyListed.receipts[0].source_surface, 'opl_owner_evidence_sustained_consumption_refs');
    assert.equal(legacyListed.receipts[0].receipt_ref, receiptRef);

    const legacyVerified = runCli([
      'runtime',
      'mag-manifest-sustained-consumption',
      'verify',
      '--receipt-ref',
      receiptRef,
    ], env).owner_evidence_sustained_consumption_ledger_verify;

    assert.equal(legacyVerified.status, 'verified');
    assert.equal(legacyVerified.receipt.source_surface, 'opl_owner_evidence_sustained_consumption_refs');

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
