import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FailClosedOwnerGate,
  InMemoryOwnerGate,
  materializeOwnerAuthorityReceipt,
  validateOwnerAuthorityReceipt,
  validateOwnerGateVerification,
  type OwnerAuthorityReceiptStatement,
  type OwnerGateVerificationContext,
} from '../../src/modules/foundry/index.ts';
import { ProcessFoundryOwnerGate } from '../../src/modules/runway/foundry-owner-gate.ts';

const fixedNow = '2026-07-16T00:00:00.000Z';

function context(
  input: Partial<OwnerGateVerificationContext> = {},
): OwnerGateVerificationContext {
  return {
    surface_kind: 'opl_foundry_owner_gate_verification_context',
    version: 'opl-foundry-owner-gate-verification-context.v1',
    authority_receipt_ref: 'replaced-by-receipt',
    action: 'approve_canary',
    decision: 'approve',
    target_agent_id: 'fixture-agent',
    target_domain_id: 'fixture-domain',
    run_id: 'run:fixture',
    version_digest: `sha256:${'1'.repeat(64)}`,
    expected_revision: 7,
    allowed_authority_refs: ['owner-gate:fixture'],
    ...input,
  };
}

function statement(
  verificationContext: OwnerGateVerificationContext,
  input: Partial<OwnerAuthorityReceiptStatement> = {},
): OwnerAuthorityReceiptStatement {
  return {
    surface_kind: 'opl_foundry_owner_authority_receipt',
    version: 'opl-foundry-owner-authority-receipt.v1',
    receipt_id: `receipt:${verificationContext.action}:${verificationContext.expected_revision}`,
    authority_ref: verificationContext.allowed_authority_refs[0]!,
    action: verificationContext.action,
    decision: verificationContext.decision,
    target_agent_id: verificationContext.target_agent_id,
    target_domain_id: verificationContext.target_domain_id,
    run_id: verificationContext.run_id,
    version_digest: verificationContext.version_digest,
    expected_revision: verificationContext.expected_revision,
    issued_at: fixedNow,
    ...input,
  };
}

test('Owner authority receipts are canonical content-addressed internal objects', () => {
  const receipt = materializeOwnerAuthorityReceipt(statement(context()));
  assert.match(receipt.receipt_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    receipt.receipt_ref,
    `opl://foundry/owner-authority-receipts/${receipt.receipt_digest}`,
  );
  assert.deepEqual(validateOwnerAuthorityReceipt(receipt), receipt);
  assert.throws(
    () => validateOwnerAuthorityReceipt({ ...receipt, target_domain_id: 'other-domain' }),
    /ref or digest does not match/,
  );
  assert.throws(
    () => validateOwnerAuthorityReceipt({ ...receipt, extra_control: true }),
    /unknown or missing fields/,
  );
});

test('InMemoryOwnerGate rejects arbitrary refs and every mismatched authority dimension', async (t) => {
  const mutations: Array<[string, Partial<OwnerAuthorityReceiptStatement>]> = [
    ['wrong target', { target_agent_id: 'other-agent' }],
    ['wrong action', { action: 'approve_active' }],
    ['wrong decision', { action: 'reject_canary', decision: 'reject' }],
    ['wrong version', { version_digest: `sha256:${'2'.repeat(64)}` }],
    ['wrong revision', { expected_revision: 8 }],
    ['wrong authority', { authority_ref: 'owner-gate:other' }],
  ];
  for (const [label, mutation] of mutations) {
    await t.test(label, async () => {
      const gate = new InMemoryOwnerGate(() => fixedNow);
      const base = context();
      const receipt = gate.register(statement(base, mutation));
      await assert.rejects(gate.verify({ ...base, authority_receipt_ref: receipt.receipt_ref }), /exact requested authority mutation|action and decision/);
    });
  }

  await assert.rejects(
    new InMemoryOwnerGate().verify(context({ authority_receipt_ref: 'arbitrary-nonempty-ref' })),
    /not registered/,
  );
});

test('ProcessFoundryOwnerGate transports an exact context and Kernel-side validation checks its result', async () => {
  const base = context();
  const receipt = materializeOwnerAuthorityReceipt(statement(base));
  const exactContext = { ...base, authority_receipt_ref: receipt.receipt_ref };
  const verification = {
    surface_kind: 'opl_foundry_owner_gate_verification',
    version: 'opl-foundry-owner-gate-verification.v1',
    verifier_id: 'owner-verifier:fixture-process',
    verification_ref: 'opl://owner-verifier/fixture-process/7',
    verified_at: fixedNow,
    covered_authority_ref: receipt.authority_ref,
    receipt,
  };
  const script = `
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (request.surface_kind !== 'opl_foundry_owner_gate_process_request') process.exit(91);
    if (request.context.authority_receipt_ref !== ${JSON.stringify(receipt.receipt_ref)}) process.exit(92);
    process.stdout.write(${JSON.stringify(JSON.stringify(verification))});
  `;
  const gate = new ProcessFoundryOwnerGate({
    executable: process.execPath,
    args: ['--input-type=module', '--eval', script],
    timeout_ms: 10_000,
  });
  assert.deepEqual(
    validateOwnerGateVerification(exactContext, await gate.verify(exactContext)),
    verification,
  );
});

test('unconfigured production OwnerGate fails closed', async () => {
  await assert.rejects(
    new FailClosedOwnerGate().verify(context()),
    /no configured authority verifier/,
  );
});
