import {
  assert,
  fs,
  os,
  path,
  runCli,
  runCliFailure,
  test,
} from '../helpers.ts';

const targetIdentity = { domain_id: 'example-domain' };

function record(stateRoot: string, payload: Record<string, unknown>) {
  return runCli([
    'runtime',
    'owner-evidence-sustained-consumption',
    'record',
    '--target-identity',
    JSON.stringify(targetIdentity),
    '--payload',
    JSON.stringify(payload),
  ], { OPL_STATE_DIR: stateRoot }).owner_evidence_sustained_consumption_ledger_record;
}

test('owner-evidence sustained-consumption keeps one current refs-only receipt per target', () => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-owner-evidence-'));
  const env = { OPL_STATE_DIR: stateRoot };
  try {
    const success = record(stateRoot, {
      receipt_ref: 'opl://owner-evidence/sustained-consumption/example-domain/success',
      app_operator_consumption_refs: ['app-operator:example-domain/consumed'],
      default_caller_consumption_refs: ['default-caller:example-domain/consumed'],
      owner_payload_response_refs: ['owner-payload:example-domain/response'],
      workspace_receipt_scaleout_evidence_refs: ['workspace-receipt:example-domain/scaleout'],
      no_forbidden_write_refs: ['no-forbidden-write:example-domain/current'],
      long_soak_or_typed_blocker_refs: ['long-soak:example-domain/current'],
    });
    assert.equal(success.status, 'recorded');
    assert.equal(success.receipts[0].payload_path, 'sustained_consumption_refs_path');
    assert.equal(success.receipts[0].authority_boundary.refs_only, true);
    assert.equal(success.receipts[0].authority_boundary.can_create_owner_receipt, false);
    assert.equal(success.receipts[0].authority_boundary.can_claim_production_ready, false);

    const canonicalVerified = runCli([
      'runtime',
      'owner-evidence-sustained-consumption',
      'verify',
      '--receipt-ref',
      success.receipt_refs[0],
    ], env).owner_evidence_sustained_consumption_ledger_verify;
    assert.equal(canonicalVerified.status, 'verified');
    assert.equal(canonicalVerified.receipt.source_surface, 'opl_owner_evidence_sustained_consumption_refs');

    const blocker = record(stateRoot, {
      receipt_ref: 'opl://owner-evidence/sustained-consumption/example-domain/blocker',
      typed_blocker_refs: ['typed-blocker:app/operator/example-domain/open'],
    });
    assert.equal(blocker.receipts[0].payload_path, 'typed_blocker_path');
    assert.equal(blocker.receipts[0].authority_boundary.can_generate_typed_blocker, false);

    const current = runCli([
      'runtime',
      'owner-evidence-sustained-consumption',
      'list',
    ], env).owner_evidence_sustained_consumption_ledger;
    assert.equal(current.receipt_count, 1);
    assert.equal(current.receipts[0].receipt_ref, blocker.receipt_refs[0]);
    assert.deepEqual(current.receipts[0].typed_blocker_refs, [
      'typed-blocker:app/operator/example-domain/open',
    ]);
  } finally {
    fs.rmSync(stateRoot, { force: true, recursive: true });
  }
});

test('owner-evidence sustained-consumption rejects empty, placeholder, and mixed payloads', () => {
  const invalidPayloads = [
    {},
    { typed_blocker_refs: ['<typed-blocker-ref>'] },
    {
      typed_blocker_refs: ['typed-blocker:example-domain/open'],
      app_operator_consumption_refs: ['app-operator:example-domain/consumed'],
    },
  ];

  for (const [index, payload] of invalidPayloads.entries()) {
    const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), `opl-owner-evidence-invalid-${index}-`));
    const env = { OPL_STATE_DIR: stateRoot };
    try {
      const failure = runCliFailure([
        'runtime',
        'owner-evidence-sustained-consumption',
        'record',
        '--target-identity',
        JSON.stringify(targetIdentity),
        '--payload',
        JSON.stringify(payload),
      ], env);
      assert.equal(failure.status, 2);
      assert.equal(failure.payload.error.code, 'cli_usage_error');
      assert.equal(failure.payload.error.details.receipt_recorded, false);
      assert.equal(failure.payload.error.details.preflight.can_record_refs_only_receipt, false);
      assert.equal(
        runCli(['runtime', 'owner-evidence-sustained-consumption', 'list'], env)
          .owner_evidence_sustained_consumption_ledger.receipt_count,
        0,
      );
    } finally {
      fs.rmSync(stateRoot, { force: true, recursive: true });
    }
  }
});

test('runtime evidence commands use strict standard option parsing', () => {
  for (const command of [
    'owner-evidence-sustained-consumption',
    'app-release-evidence',
    'codex-app-runtime-evidence',
    'provider-long-soak-evidence',
    'domain-owner-payload-summary',
    'memory-artifact-lifecycle-evidence',
    'developer-mode-closeout',
    'brand-module-l5-evidence',
  ]) {
    const failure = runCliFailure(['runtime', command, 'record', '--unknown']);
    assert.equal(failure.status, 2);
    assert.equal(failure.payload.error.code, 'cli_usage_error');
    assert.equal(failure.payload.error.details.parser_adapter, 'node_util_parse_args');
  }

  const positional = runCliFailure([
    'runtime',
    'provider-long-soak-evidence',
    'verify',
    'unexpected-positional',
  ]);
  assert.equal(positional.payload.error.details.parser_adapter, 'node_util_parse_args');

  for (const args of [
    ['--payload', '{}', '--payload', '{}'],
    ['--payload', '{}', '--payload-file', 'unused.json'],
  ]) {
    const duplicatePayload = runCliFailure([
      'runtime',
      'owner-evidence-sustained-consumption',
      'record',
      '--target-identity',
      JSON.stringify(targetIdentity),
      ...args,
    ]);
    assert.deepEqual(duplicatePayload.payload.error.details.options, [
      '--payload',
      '--payload-file',
    ]);
  }
});
