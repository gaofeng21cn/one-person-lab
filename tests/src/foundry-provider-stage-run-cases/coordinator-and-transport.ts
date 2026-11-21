import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { scopedGatewayWorkspace } from '../foundry-kernel-cases/scoped-workspace.ts';
import { canonicalJsonBytes } from '../../../src/kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';
import {
  foundryContentDigest,
  type AgentBlueprint,
} from '../../../src/authority/evolution/index.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
} from '../../../src/authority/evidence/index.ts';
import {
  StageRunFoundryProviderCoordinator,
  StageRunFoundryProviderInvoker,
  type FoundryProviderStageRunGateway,
} from '../../../src/adapters/execution/foundry-provider-stage-run.ts';
import {
  CONTENT_KINDS,
  activity,
  provider,
  providerResourceBytes,
  state,
  transportBlueprint,
  writeProviderArtifact,
} from './support.ts';

function sha256(bytes: Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

export function registerCoordinatorTests(): void {
test('StageRun provider coordinator persists a pending cursor and advances one continuation per observation', async (t) => {
  const queries: string[] = [];
  let entryQueries = 0;
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:mission-intake' };
    },
    async query(workflowId) {
      queries.push(workflowId);
      if (workflowId === 'workflow:mission-intake' && entryQueries++ === 0) {
        return state({
          stage: 'mission-intake',
          status: 'running',
          attempts: [{
            stage_attempt_id: 'attempt:mission-intake',
            workflow_id: 'workflow:attempt:mission-intake',
            status: 'running',
          }],
        });
      }
      if (workflowId === 'workflow:mission-intake') {
        return state({ stage: 'mission-intake', next: 'workflow:evaluation-design' });
      }
      return state({
        stage: 'evaluation-design',
        refs: ['file:///terminal.json'],
        hashes: [`sha256:${'a'.repeat(64)}`],
      });
    },
    async cancel() {},
  };
  const coordinator = new StageRunFoundryProviderCoordinator({
    gateway,
    storage_root: scopedGatewayWorkspace(t),
    artifact_reader: { readExact: () => Buffer.from('{}') },
  });
  const invocation = {
    operation: 'design' as const,
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  };

  const launched = await coordinator.launch(invocation, 'operation:design');
  assert.equal(launched.status, 'pending');
  assert.equal(launched.current_stage_id, null);
  assert.deepEqual(launched.visited_path, []);

  const running = await coordinator.observe(launched, 'operation:design');
  assert.equal(running.status, 'pending');
  assert.equal(running.current_workflow_id, 'workflow:mission-intake');
  assert.equal(running.current_stage_id, 'mission-intake');
  assert.deepEqual(running.active_attempts, [{
    stage_attempt_id: 'attempt:mission-intake',
    workflow_id: 'workflow:attempt:mission-intake',
    status: 'running',
  }]);

  const continued = await coordinator.observe(running, 'operation:design');
  assert.equal(continued.status, 'pending');
  assert.equal(continued.current_workflow_id, 'workflow:evaluation-design');
  assert.deepEqual(continued.visited_path, [{
    workflow_id: 'workflow:mission-intake',
    stage_id: 'mission-intake',
  }]);
  assert.deepEqual(queries, ['workflow:mission-intake', 'workflow:mission-intake']);

  const terminal = await coordinator.observe(continued, 'operation:design');
  assert.equal(terminal.status, 'terminal');
  assert.deepEqual(terminal.artifact_refs, ['file:///terminal.json']);
  assert.deepEqual(queries, [
    'workflow:mission-intake',
    'workflow:mission-intake',
    'workflow:evaluation-design',
  ]);
});

test('StageRun provider coordinator follows a bounded route_back continuation out of the terminal Stage', async (t) => {
  const routeBackProvider: typeof provider = {
    ...provider,
    operations: {
      ...provider.operations,
      design: {
        ...provider.operations.design,
        required_stage_refs: ['mission-intake', 'agent-blueprint-authoring', 'evaluation-design'],
      },
    },
  };
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:mission-intake' };
    },
    async query(workflowId) {
      if (workflowId === 'workflow:mission-intake') {
        return state({ stage: 'mission-intake', next: 'workflow:evaluation-design' });
      }
      if (workflowId === 'workflow:evaluation-design') {
        // Terminal Stage reviewer sent the blueprint back for one bounded
        // repair round instead of admitting it.
        return state({
          stage: 'evaluation-design',
          next: 'workflow:agent-blueprint-authoring-repair',
          routeDecision: 'route_back',
        });
      }
      if (workflowId === 'workflow:agent-blueprint-authoring-repair') {
        return state({ stage: 'agent-blueprint-authoring', next: 'workflow:evaluation-design-round-2' });
      }
      return state({
        stage: 'evaluation-design',
        refs: ['file:///terminal.json'],
        hashes: [`sha256:${'a'.repeat(64)}`],
      });
    },
    async cancel() {},
  };
  const coordinator = new StageRunFoundryProviderCoordinator({
    gateway,
    storage_root: scopedGatewayWorkspace(t),
    artifact_reader: { readExact: () => Buffer.from('{}') },
  });
  const invocation = {
    operation: 'design' as const,
    provider: routeBackProvider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  };

  let cursor = await coordinator.launch(invocation, 'operation:design');
  cursor = await coordinator.observe(cursor, 'operation:design');
  assert.equal(cursor.current_workflow_id, 'workflow:evaluation-design');

  const routedBack = await coordinator.observe(cursor, 'operation:design');
  assert.equal(routedBack.status, 'pending');
  assert.equal(routedBack.current_workflow_id, 'workflow:agent-blueprint-authoring-repair');
  assert.deepEqual(routedBack.continuation, {
    from_workflow_id: 'workflow:evaluation-design',
    target_workflow_id: 'workflow:agent-blueprint-authoring-repair',
  });

  const repaired = await coordinator.observe(routedBack, 'operation:design');
  assert.equal(repaired.status, 'pending');
  assert.equal(repaired.current_workflow_id, 'workflow:evaluation-design-round-2');

  const terminal = await coordinator.observe(repaired, 'operation:design');
  assert.equal(terminal.status, 'terminal');
  assert.deepEqual(terminal.artifact_refs, ['file:///terminal.json']);
  assert.deepEqual(
    terminal.visited_path.map((entry) => entry.stage_id),
    ['mission-intake', 'evaluation-design', 'agent-blueprint-authoring', 'evaluation-design'],
  );
});

test('StageRun provider coordinator keeps non-route_back continuations out of the terminal Stage fail-closed', async (t) => {
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:evaluation-design' };
    },
    async query() {
      return state({
        stage: 'evaluation-design',
        next: 'workflow:undeclared-advance',
        routeDecision: 'advance',
      });
    },
    async cancel() {},
  };
  const coordinator = new StageRunFoundryProviderCoordinator({
    gateway,
    storage_root: scopedGatewayWorkspace(t),
    artifact_reader: { readExact: () => Buffer.from('{}') },
  });
  const cursor = await coordinator.launch({
    operation: 'design' as const,
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  }, 'operation:design');

  await assert.rejects(
    coordinator.observe(cursor, 'operation:design'),
    /terminal Stage launched an undeclared continuation/,
  );
});

test('StageRun provider coordinator refuses terminal reads from a pending cursor and cancels its current StageRun', async (t) => {
  const cancelled: string[] = [];
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:mission-intake' };
    },
    async query() {
      return state({ stage: 'mission-intake', status: 'running' });
    },
    async cancel(workflowId) {
      cancelled.push(workflowId);
    },
  };
  const coordinator = new StageRunFoundryProviderCoordinator({
    gateway,
    storage_root: scopedGatewayWorkspace(t),
  });
  const invocation = {
    operation: 'design' as const,
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  };
  const cursor = await coordinator.launch(invocation, 'operation:design');

  await assert.rejects(
    coordinator.readTerminal(cursor, 'operation:design'),
    /not terminal/,
  );
  await coordinator.cancel(cursor, 'operation:design');
  assert.deepEqual(cancelled, ['workflow:mission-intake']);
});

test('StageRun provider cancellation follows an already-published continuation before cancelling', async (t) => {
  const queried: string[] = [];
  const cancelled: string[] = [];
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:mission-intake' };
    },
    async query(workflowId) {
      queried.push(workflowId);
      return workflowId === 'workflow:mission-intake'
        ? state({ stage: 'mission-intake', next: 'workflow:evaluation-design' })
        : state({ stage: 'evaluation-design', status: 'running' });
    },
    async cancel(workflowId) {
      cancelled.push(workflowId);
    },
  };
  const coordinator = new StageRunFoundryProviderCoordinator({
    gateway,
    storage_root: scopedGatewayWorkspace(t),
  });
  const invocation = {
    operation: 'design' as const,
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  };
  const cursor = await coordinator.launch(invocation, 'operation:design');
  const cancelledCursor = await coordinator.cancel(cursor, 'operation:design');

  assert.deepEqual(queried, ['workflow:mission-intake', 'workflow:evaluation-design']);
  assert.deepEqual(cancelled, ['workflow:evaluation-design']);
  assert.equal(cancelledCursor.current_workflow_id, 'workflow:evaluation-design');
});

test('StageRun provider coordinator rejects a cursor from another immutable operation', async (t) => {
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:mission-intake' };
    },
    async query() {
      throw new Error('query must not run for a mismatched cursor');
    },
    async cancel() {
      throw new Error('cancel must not run for a mismatched cursor');
    },
  };
  const coordinator = new StageRunFoundryProviderCoordinator({
    gateway,
    storage_root: scopedGatewayWorkspace(t),
  });
  const invocation = {
    operation: 'design' as const,
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  };
  const cursor = await coordinator.launch(invocation, 'operation:design');

  await assert.rejects(coordinator.observe(cursor, 'operation:other'), /does not bind/);
  await assert.rejects(coordinator.cancel(cursor, 'operation:other'), /does not bind/);
  await assert.rejects(
    coordinator.observe({ ...cursor, provider_manifest: null as never }, 'operation:design'),
    FrameworkContractError,
  );
  await assert.rejects(
    coordinator.readTerminal({
      ...cursor,
      status: 'terminal',
      artifact_refs: ['file:///result.json'],
      artifact_hashes: [],
    }, 'operation:design'),
    /does not bind/,
  );
});

test('StageRun provider terminal read persists one exact replay result without relaunching', async (t) => {
  const storageRoot = scopedGatewayWorkspace(t);
  const output = canonicalJsonBytes({
    surface_kind: 'opl_foundry_agent_blueprint',
    marker: 'persisted-terminal-output',
    content_refs: {
      prompt_refs: [],
      skill_refs: [],
      knowledge_refs: [],
      helper_refs: [],
      model_refs: [],
      tool_refs: [],
      schema_refs: [],
    },
  });
  let launches = 0;
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      launches += 1;
      return { workflow_id: 'workflow:mission-intake' };
    },
    async query(workflowId) {
      return workflowId === 'workflow:mission-intake'
        ? state({ stage: 'mission-intake', next: 'workflow:evaluation-design' })
        : state({
            stage: 'evaluation-design',
            refs: ['file:///terminal.json'],
            hashes: [`sha256:${sha256(output)}`],
          });
    },
    async cancel() {},
  };
  const coordinator = new StageRunFoundryProviderCoordinator({
    gateway,
    storage_root: storageRoot,
    artifact_reader: { readExact: () => output },
  });
  const invocation = {
    operation: 'design' as const,
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  };
  let cursor = await coordinator.launch(invocation, 'operation:design');
  cursor = await coordinator.observe(cursor, 'operation:design');
  cursor = await coordinator.observe(cursor, 'operation:design');
  await coordinator.readTerminal(cursor, 'operation:design');

  const replayInvoker = new StageRunFoundryProviderInvoker({
    gateway,
    storage_root: storageRoot,
    artifact_reader: { readExact: () => output },
    operation_key: 'operation:design',
  });
  const replay = await replayInvoker.invoke(invocation) as Record<string, unknown>;
  assert.equal(replay.marker, 'persisted-terminal-output');
  await assert.rejects(
    replayInvoker.invoke({
      ...invocation,
      provider_source_digest: `sha256:${'b'.repeat(64)}`,
    }),
    /does not bind the immutable provider invocation/,
  );
  await assert.rejects(
    new StageRunFoundryProviderInvoker({
      gateway,
      storage_root: storageRoot,
      artifact_reader: { readExact: () => output },
      operation_key: 'operation:other',
      replay_only: true,
    }).invoke(invocation),
    /does not bind the immutable provider invocation/,
  );
  assert.equal(launches, 1);
});

}

export function registerTransportTests(): void {
test('StageRun provider invocation follows declared Stages even when observation persistence fails', async (t) => {
  const output = canonicalJsonBytes({
    surface_kind: 'opl_foundry_agent_blueprint',
    marker: 'exact-terminal-output',
    content_refs: {
      prompt_refs: [],
      skill_refs: [],
      knowledge_refs: [],
      helper_refs: [],
      model_refs: [],
      tool_refs: [],
      schema_refs: [],
    },
  });
  const launches: Array<Parameters<FoundryProviderStageRunGateway['launch']>[0]> = [];
  const gateway: FoundryProviderStageRunGateway = {
    async launch(input) {
      launches.push(input);
      return { workflow_id: 'workflow:mission-intake' };
    },
    async cancel() {},
    async query(workflowId) {
      return workflowId === 'workflow:mission-intake'
        ? state({ stage: 'mission-intake', next: 'workflow:evaluation-design' })
        : state({
            stage: 'evaluation-design',
            refs: ['memory://terminal-output'],
            hashes: [`${'a'.repeat(64)}`],
          });
    },
  };
  const storageRoot = scopedGatewayWorkspace(t);
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  fs.writeFileSync(path.join(storageRoot, 'provider-observations'), 'not a directory');
  const invoker = new StageRunFoundryProviderInvoker({
    gateway,
    storage_root: storageRoot,
    poll_interval_ms: 1,
    timeout_ms: 100,
    artifact_reader: { readExact: () => output },
  });

  const result = await invoker.invoke({
    operation: 'design',
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  });

  assert.equal((result as Record<string, unknown>).marker, 'exact-terminal-output');
  assert.equal(launches.length, 1);
  assert.deepEqual(launches[0]?.activity, activity);
  assert.equal(launches[0]?.stage_id, 'mission-intake');
  assert.equal(launches[0]?.input_artifact_refs.length, 1);
  assert.equal(launches[0]?.input_artifact_hashes.length, 1);
});

test('StageRun provider preserves observation history across retries and reports the failing attempt', async (t) => {
  const storageRoot = scopedGatewayWorkspace(t);
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:mission-intake' };
    },
    async cancel() {},
    async query() {
      return state({
        stage: 'mission-intake',
        status: 'blocked',
        currentRole: null,
        blockedReason: 'codex_cli_provider_unavailable',
        attempts: [{
          attempt_role: 'producer',
          stage_attempt_id: 'sat_mission_intake_producer_0',
          status: 'blocked',
        }],
      });
    },
  };
  const invoker = new StageRunFoundryProviderInvoker({ gateway, storage_root: storageRoot });

  await assert.rejects(invoker.invoke({
    operation: 'design',
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  }), (error: Error) => {
    assert.match(error.message, /codex_cli_provider_unavailable/);
    assert.match(error.message, /sat_mission_intake_producer_0/);
    assert.match(error.message, /observation_receipt_ref/);
    return true;
  });
  const receiptFile = path.join(
    storageRoot,
    'provider-observations',
    `${crypto.createHash('sha256').update(canonicalJsonBytes({
      run_id: activity.run_id,
      iteration: activity.iteration,
      phase: activity.phase,
      input_digest: activity.input_digest,
    })).digest('hex')}.json`,
  );
  assert.equal(fs.existsSync(receiptFile), true);
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8')) as Record<string, any>;
  assert.equal(receipt.surface_kind, 'opl_foundry_provider_stage_run_observation_receipt');
  assert.equal(receipt.observations.length, 1);
  assert.equal(receipt.observations[0].stage_id, 'mission-intake');
  assert.equal(receipt.observations[0].attempt.stage_attempt_id, 'sat_mission_intake_producer_0');
  await assert.rejects(invoker.invoke({
    operation: 'design', provider, checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never }, activity,
  }));
  const retried = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  assert.deepEqual(retried.observations[0], receipt.observations[0]);
  assert.ok(retried.observations.length >= receipt.observations.length);
});

test('StageRun provider Coordinator accumulates bound observations across coordinator instances', async (t) => {
  const storageRoot = scopedGatewayWorkspace(t);
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  let launches = 0;
  let continueStage = false;
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      launches += 1;
      return { workflow_id: 'workflow:mission-intake' };
    },
    async cancel() {},
    async query(workflowId) {
      if (workflowId === 'workflow:evaluation-design') {
        return state({ stage: 'evaluation-design' });
      }
      return continueStage
        ? state({ stage: 'mission-intake', next: 'workflow:evaluation-design' })
        : state({ stage: 'mission-intake', status: 'running' });
    },
  };
  const firstCoordinator = new StageRunFoundryProviderCoordinator({ gateway, storage_root: storageRoot });
  const invocation = {
    operation: 'design' as const,
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  };
  const launched = await firstCoordinator.launch(invocation, 'operation:direct-observation');
  const running = await firstCoordinator.observe(launched, launched.operation_key);
  const receiptFile = path.join(storageRoot, 'provider-observations', `${running.activity_key}.json`);
  const firstReceipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  assert.equal(firstReceipt.version, 'opl-foundry-provider-stage-run-observation.v2');
  assert.deepEqual(firstReceipt.binding, {
    cursor_version: running.version,
    operation_key: running.operation_key,
    operation: 'design',
    activity_key: running.activity_key,
    provider_id: provider.provider_id,
    provider_manifest_digest: foundryContentDigest(provider),
    provider_source_digest: invocation.provider_source_digest,
    checkout_root: path.resolve(invocation.checkout_root),
  });
  assert.equal(firstReceipt.observations.length, 1);

  continueStage = true;
  const secondCoordinator = new StageRunFoundryProviderCoordinator({ gateway, storage_root: storageRoot });
  const continued = await secondCoordinator.observe(running, running.operation_key);
  const terminal = await new StageRunFoundryProviderCoordinator({ gateway, storage_root: storageRoot })
    .observe(continued, continued.operation_key);
  assert.equal(terminal.status, 'terminal');
  const finalReceipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  assert.deepEqual(finalReceipt.binding, firstReceipt.binding);
  assert.deepEqual(finalReceipt.observations[0], firstReceipt.observations[0]);
  assert.deepEqual(finalReceipt.observations.map((entry: { stage_id: string }) => entry.stage_id), [
    'mission-intake', 'mission-intake', 'evaluation-design',
  ]);
  assert.equal(launches, 1);
});

test('StageRun provider Coordinator reports blocked diagnostics and the exact persisted observation receipt', async (t) => {
  const storageRoot = scopedGatewayWorkspace(t);
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  const gateway: FoundryProviderStageRunGateway = {
    async launch() { return { workflow_id: 'workflow:mission-intake' }; },
    async cancel() {},
    async query() {
      return state({
        stage: 'mission-intake',
        status: 'blocked',
        blockedReason: 'codex_cli_provider_unavailable',
        attempts: [{
          attempt_role: 'producer',
          stage_attempt_id: 'sat_direct_coordinator_producer_0',
          status: 'blocked',
        }],
      });
    },
  };
  const coordinator = new StageRunFoundryProviderCoordinator({ gateway, storage_root: storageRoot });
  const cursor = await coordinator.launch({
    operation: 'design',
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  }, 'operation:direct-blocked');
  const receiptFile = path.join(storageRoot, 'provider-observations', `${cursor.activity_key}.json`);
  await assert.rejects(coordinator.observe(cursor, cursor.operation_key), (error: Error) => {
    assert.match(error.message, /codex_cli_provider_unavailable/);
    assert.match(error.message, /sat_direct_coordinator_producer_0/);
    assert.ok(error.message.includes(pathToFileURL(receiptFile).href));
    return true;
  });
  const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
  assert.equal(receipt.binding.operation_key, cursor.operation_key);
  assert.equal(receipt.status, 'blocked');
  assert.equal(receipt.observations.length, 1);
  assert.equal(receipt.observations[0].attempt.stage_attempt_id, 'sat_direct_coordinator_producer_0');
});

test('StageRun provider transports all seven exact content classes into a compiler-complete candidate', async (t) => {
  const storageRoot = scopedGatewayWorkspace(t);
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  const resources = Object.fromEntries(CONTENT_KINDS.map((kind) => [
    kind,
    writeProviderArtifact(storageRoot, `${kind}.blob`, providerResourceBytes(kind, 'provider bytes')),
  ])) as Record<typeof CONTENT_KINDS[number], ReturnType<typeof writeProviderArtifact>>;
  const blueprint = transportBlueprint(resources);
  const protocolArtifact = writeProviderArtifact(
    storageRoot,
    'agent-blueprint.json',
    canonicalJsonBytes(blueprint),
  );
  const terminalArtifacts = [protocolArtifact, ...CONTENT_KINDS.map((kind) => resources[kind])];
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:mission-intake' };
    },
    async cancel() {},
    async query(workflowId) {
      return workflowId === 'workflow:mission-intake'
        ? state({ stage: 'mission-intake', next: 'workflow:evaluation-design' })
        : state({
            stage: 'evaluation-design',
            refs: terminalArtifacts.map((entry) => entry.ref),
            hashes: terminalArtifacts.map((entry) => entry.sha256),
          });
    },
  };
  const invoker = new StageRunFoundryProviderInvoker({ gateway, storage_root: storageRoot });
  const transported = await invoker.invoke({
    operation: 'design',
    provider,
    checkout_root: '/managed/provider',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  }) as AgentBlueprint;
  const compiler = new ContentAddressedCandidateCompiler(storageRoot);
  const candidate = await compiler.materialize({
    run_id: activity.run_id,
    blueprint: transported,
    blueprint_digest: foundryContentDigest(transported),
  });
  const lock = JSON.parse(fs.readFileSync(
    path.join(compiler.candidateDirectory(candidate.candidate_digest), 'contracts/resource-lock.json'),
    'utf8',
  )) as { resources: Array<{ kind: string; declared_ref: string; sha256: string }> };

  assert.deepEqual(lock.resources.map((entry) => entry.kind), CONTENT_KINDS);
  for (const kind of CONTENT_KINDS) {
    const binding = lock.resources.find((entry) => entry.kind === kind);
    assert.equal(binding?.declared_ref, resources[kind].content_ref);
    assert.equal(binding?.sha256, resources[kind].sha256);
  }
});

test('StageRun provider requires current terminal SHA transport even when exact resource bytes are cached', async (t) => {
  const storageRoot = scopedGatewayWorkspace(t);
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  const resources = Object.fromEntries(CONTENT_KINDS.map((kind) => [
    kind,
    writeProviderArtifact(storageRoot, `${kind}.blob`, providerResourceBytes(kind, 'cached transport bytes')),
  ])) as Record<typeof CONTENT_KINDS[number], ReturnType<typeof writeProviderArtifact>>;
  new FileFoundryContentStore(storageRoot).put(resources.model.bytes, resources.model.content_ref);
  const protocolArtifact = writeProviderArtifact(
    storageRoot,
    'agent-blueprint.json',
    canonicalJsonBytes(transportBlueprint(resources)),
  );
  const terminalArtifacts = [
    protocolArtifact,
    ...CONTENT_KINDS.filter((kind) => kind !== 'model').map((kind) => resources[kind]),
  ];
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:mission-intake' };
    },
    async cancel() {},
    async query(workflowId) {
      return workflowId === 'workflow:mission-intake'
        ? state({ stage: 'mission-intake', next: 'workflow:evaluation-design' })
        : state({
            stage: 'evaluation-design',
            refs: terminalArtifacts.map((entry) => entry.ref),
            hashes: terminalArtifacts.map((entry) => entry.sha256),
          });
    },
  };
  const invoker = new StageRunFoundryProviderInvoker({ gateway, storage_root: storageRoot });

  await assert.rejects(invoker.invoke({
    operation: 'design',
    provider,
    checkout_root: '/managed/provider',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  }), /did not transport bytes for a content-addressed AgentBlueprint ref/);
});

test('StageRun provider invocation fails closed when a required semantic Stage is skipped', async (t) => {
  const gateway: FoundryProviderStageRunGateway = {
    async launch() {
      return { workflow_id: 'workflow:evaluation-design' };
    },
    async cancel() {},
    async query() {
      return state({
        stage: 'evaluation-design',
        refs: ['memory://terminal-output'],
        hashes: [`${'b'.repeat(64)}`],
      });
    },
  };
  const invoker = new StageRunFoundryProviderInvoker({
    gateway,
    storage_root: scopedGatewayWorkspace(t),
    artifact_reader: {
      readExact: () => canonicalJsonBytes({ surface_kind: 'opl_foundry_agent_blueprint' }),
    },
  });

  await assert.rejects(invoker.invoke({
    operation: 'design',
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  }), /skipped required semantic Stages/);
});

}
