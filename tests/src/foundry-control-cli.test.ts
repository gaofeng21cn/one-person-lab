import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFoundryCommandSpecs } from '../../src/entrypoints/cli/cases/public-command-specs-parts/foundry.ts';

test('Foundry operator CLI exposes only status, Owner decisions, cancel, versions, and rollback', async () => {
  const calls: Array<{ operation: string; input: unknown; options?: unknown }> = [];
  const control = {
    inspectRun: async (runId: string) => ({
      run: { run_id: runId, state: 'accepted' },
      terminal_readback: { terminal: false, state: 'accepted' },
    }),
    submitOwnerDecision: async (input: unknown, options: unknown) => {
      calls.push({ operation: 'decision', input, options });
      return { run: { state: 'canary' } };
    },
    cancelRun: async (input: unknown) => {
      calls.push({ operation: 'cancel', input });
      return { run: { state: 'cancelled' } };
    },
    listVersions: async (targetAgentId: string, targetDomainId: string) => [{
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      version_digest: `sha256:${'a'.repeat(64)}`,
    }],
    rollbackActivation: async (input: unknown) => {
      calls.push({ operation: 'rollback', input });
      return { transaction_kind: 'rollback' };
    },
  };
  const specs = buildFoundryCommandSpecs(control as never);
  assert.deepEqual(Object.keys(specs).sort(), [
    'foundry approve',
    'foundry cancel',
    'foundry reject',
    'foundry rollback',
    'foundry status',
    'foundry versions',
  ]);
  assert.deepEqual(await specs['foundry status'].handler(['--run-id', 'run:fixture']), {
    foundry_run: {
      run: { run_id: 'run:fixture', state: 'accepted' },
      terminal_readback: { terminal: false, state: 'accepted' },
    },
  });
  await specs['foundry approve'].handler([
    '--run-id', 'run:fixture',
    '--expected-revision', '7',
    '--authority-receipt-ref', 'owner-receipt:approve',
  ]);
  await specs['foundry reject'].handler([
    '--run-id', 'run:fixture',
    '--expected-revision', '8',
    '--authority-receipt-ref', 'owner-receipt:reject',
  ]);
  assert.deepEqual(calls.slice(0, 2), [
    {
      operation: 'decision',
      input: {
        run_id: 'run:fixture',
        expected_revision: 7,
        authority_receipt_ref: 'owner-receipt:approve',
        decision: 'approve',
      },
      options: { advance: false },
    },
    {
      operation: 'decision',
      input: {
        run_id: 'run:fixture',
        expected_revision: 8,
        authority_receipt_ref: 'owner-receipt:reject',
        decision: 'reject',
      },
      options: { advance: false },
    },
  ]);
});

test('Foundry operator CLI rejects stale or malformed revision arguments before mutation', async () => {
  const specs = buildFoundryCommandSpecs({
    submitOwnerDecision: async () => assert.fail('must not mutate'),
  } as never);
  await assert.rejects(
    Promise.resolve().then(() => specs['foundry approve'].handler([
      '--run-id', 'run:fixture',
      '--expected-revision=-1',
      '--authority-receipt-ref', 'owner-receipt:approve',
    ])),
    /non-negative integer/,
  );
});
