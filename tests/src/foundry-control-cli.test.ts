import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildFoundryCommandSpecs } from '../../src/entrypoints/cli/cases/public-command-specs-parts/foundry.ts';
import { createPersistentFoundryControl } from '../../src/entrypoints/cli/modules/foundry-control.ts';
import { createFoundryLifecycleKernel } from '../../src/adapters/execution/foundry-lifecycle-runtime.ts';
import { buildFoundryTemporalActivities } from '../../src/adapters/execution/foundry-temporal-activities.ts';
import { foundryContentDigest, type DesignRequest } from '../../src/authority/evolution/index.ts';
import { foundryTemporalClientOptions } from '../../src/adapters/execution/foundry-temporal-control.ts';
import { familyRuntimePaths } from '../../src/adapters/execution/family-runtime-store.ts';

test('Foundry uses managed Temporal service and worker paths while preserving explicit isolation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-client-state-'));
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = root;
  t.after(() => {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  assert.equal(foundryTemporalClientOptions().paths?.root, familyRuntimePaths().root);
  const explicit = { paths: { root: '/isolated/runtime' }, addressOverride: '127.0.0.1:9999', namespaceOverride: 'test' };
  assert.deepEqual(foundryTemporalClientOptions(explicit), explicit);
});

test('provider load failure can terminalize and release the target without loading the provider again', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-lifecycle-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const kernel = createFoundryLifecycleKernel(root);
  let providerLoads = 0;
  const activities = buildFoundryTemporalActivities(() => {
    providerLoads += 1;
    throw new Error('semantic provider unavailable');
  }, null, null, () => kernel);
  const request: DesignRequest = {
    surface_kind: 'opl_foundry_design_request', version: 'opl-foundry-protocol.v1',
    request_id: 'request:lifecycle-recovery', mode: 'create', target_agent_id: 'lifecycle-fixture',
    target_domain_id: 'lifecycle-fixture', target_version_ref: null,
    objective: 'Verify durable failure cleanup.', acceptance_criteria: ['Target reservation is released.'],
    non_goals: ['No activation.'], source_refs: [],
    constraints: { capability_refs: [], permission_refs: [], privacy_requirements: [], cost_limits: {}, latency_limits: {} },
    delivery_policy: { activation_mode: 'qualify_only', max_generations: 1 },
  };
  const started = await activities.foundryStartRunActivity({
    run_id: 'lifecycle-failed', request, request_digest: foundryContentDigest(request),
  });
  assert.equal(started.run.state, 'accepted');
  await kernel.advanceRunStep(started.run.run_id);
  const failed = await activities.foundryFailRunActivity({
    run_id: started.run.run_id, failure_code: 'provider_unavailable', failure_message: 'semantic provider unavailable',
  });
  assert.equal(failed.run.state, 'failed');
  const replay = await activities.foundryFailRunActivity({
    run_id: started.run.run_id, failure_code: 'provider_unavailable', failure_message: 'semantic provider unavailable',
  });
  assert.equal(replay.run.revision, failed.run.revision);
  const next = await activities.foundryStartRunActivity({
    run_id: 'lifecycle-successor', request, request_digest: foundryContentDigest(request),
  });
  assert.equal(next.run.state, 'accepted');
  await assert.rejects(activities.foundryCancelRunActivity({
    run_id: next.run.run_id, expected_revision: next.run.revision, authority_receipt_ref: 'untrusted:receipt',
  }));
  assert.equal((await kernel.inspectRun(next.run.run_id)).run.state, 'accepted');
  assert.equal(providerLoads, 0);
});

test('persistent Foundry control keeps read commands physically read-only on absent storage', async (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-control-read-only-'));
  const root = path.join(parent, 'foundry');
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const control = createPersistentFoundryControl(root);

  assert.equal(fs.existsSync(root), false);
  assert.deepEqual(await control.listVersions('missing-agent', 'missing-domain'), []);
  await assert.rejects(control.inspectRun('foundry_read_only_missing'), /FoundryRun does not exist/);
  assert.equal(fs.existsSync(root), false);
});

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
