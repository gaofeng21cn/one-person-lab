import {
  assert,
  fs,
  os,
  path,
  runCliAsync,
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

test('agents evidence apply preserves structured refs as opaque values', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-external-evidence-opaque-ref-'));
  const env = { OPL_STATE_DIR: stateRoot };
  const structuredRef = "{'writer_state': 'queued', 'user_next': 'repair', 'reason': 'quality'}";

  try {
    const recorded = runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'med-autoscience',
      '--request-id',
      'domain_dispatch:medautoscience:sat-current',
      '--evidence-ref',
      structuredRef,
    ], env).external_evidence_apply;

    assert.equal(recorded.status, 'recorded');
    assert.deepEqual(recorded.receipt.evidence_refs, [structuredRef]);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('agents evidence apply writes external evidence ledger atomically', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-external-evidence-atomic-'));
  const env = { OPL_STATE_DIR: stateRoot };
  const ledgerPath = path.join(stateRoot, 'external-evidence-ledger.json');

  try {
    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'med-autoscience',
      '--request-id',
      'stage_production_evidence:medautoscience:review',
      '--request-pack-id',
      'mas.stage.evidence',
      '--source-ref',
      'mas://stage/review',
      '--typed-blocker-ref',
      'mas://typed-blockers/review-owner-receipt-pending',
    ], env);

    fs.chmodSync(ledgerPath, 0o444);

    runCli([
      'agents',
      'evidence',
      'apply',
      '--domain',
      'med-autoscience',
      '--request-id',
      'stage_production_evidence:medautoscience:review',
      '--mode',
      'verify',
    ], env);

    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    assert.equal(ledger.receipts.length, 1);
    assert.equal(ledger.receipts[0].receipt_status, 'verified');
    assert.deepEqual(fs.readdirSync(stateRoot).filter((entry) =>
      entry.includes('external-evidence-ledger.json.') && entry.endsWith('.tmp')
    ), []);
  } finally {
    if (fs.existsSync(ledgerPath)) {
      fs.chmodSync(ledgerPath, 0o644);
    }
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('agents evidence apply serializes concurrent ledger records without losing receipts', async () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-agents-external-evidence-concurrent-'));
  const env = { OPL_STATE_DIR: stateRoot };
  const ledgerPath = path.join(stateRoot, 'external-evidence-ledger.json');

  try {
    await Promise.all([
      runCliAsync([
        'agents',
        'evidence',
        'apply',
        '--domain',
        'med-autoscience',
        '--request-id',
        'domain_dispatch:medautoscience:sat_one',
        '--request-pack-id',
        'mas.domain_dispatch_evidence',
        '--source-ref',
        '/stage_attempt_workbench/attempts/sat_one/domain_dispatch_evidence',
        '--typed-blocker-ref',
        'mas://typed-blockers/sat-one',
      ], env),
      runCliAsync([
        'agents',
        'evidence',
        'apply',
        '--domain',
        'med-autoscience',
        '--request-id',
        'domain_dispatch:medautoscience:sat_two',
        '--request-pack-id',
        'mas.domain_dispatch_evidence',
        '--source-ref',
        '/stage_attempt_workbench/attempts/sat_two/domain_dispatch_evidence',
        '--typed-blocker-ref',
        'mas://typed-blockers/sat-two',
      ], env),
    ]);

    const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    assert.deepEqual(
      ledger.receipts.map((receipt: Record<string, unknown>) => receipt.request_id).sort(),
      [
        'domain_dispatch:medautoscience:sat_one',
        'domain_dispatch:medautoscience:sat_two',
      ],
    );
    assert.deepEqual(fs.readdirSync(stateRoot).filter((entry) =>
      entry.endsWith('.tmp') || entry.endsWith('.lock')
    ), []);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});
