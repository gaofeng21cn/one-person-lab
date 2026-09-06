import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test, { type TestContext } from 'node:test';
import { resolveFoundryExecutionScope } from '../../src/adapters/execution/foundry-execution-scope.ts';
import { requireFamilyRuntimeExecutionScope } from '../../src/adapters/execution/family-runtime-execution-scope.ts';

import { FrameworkContractError } from '../../src/kernel/contract-validation.ts';
import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import { parseFamilyRuntimeCommand } from '../../src/adapters/execution/family-runtime-command.ts';
import { createCordisStageRouteComposition } from '../../src/host/plugins/cordis-agent-executor-experiment.ts';
import {
  FOUNDRY_PROTOCOL_VERSION,
  foundryContentDigest,
  normalizeFoundryProviderManifest,
  readFoundryProviderManifest,
  type AgentBlueprint,
  type FoundryProviderManifest,
  type FoundryActivityIdentity,
} from '../../src/authority/evolution/index.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
} from '../../src/authority/evidence/index.ts';
import {
  FileFoundryProviderArtifactReader,
  OplFoundryProviderStageRunGateway,
  queryFoundryProviderStageRunHandle,
  StageRunFoundryProviderCoordinator,
  StageRunFoundryProviderInvoker,
  type FoundryProviderStageRunGateway,
} from '../../src/adapters/execution/foundry-provider-stage-run.ts';

const provider: FoundryProviderManifest = {
  surface_kind: 'opl_foundry_provider',
  version: 'opl-foundry-provider.v1',
  provider_id: 'oma',
  agent_id: 'oma',
  package_id: 'oma',
  domain_id: 'agent_engineering',
  carrier_slug: 'opl-meta-agent',
  operations: {
    design: {
      input_schema_refs: ['opl://foundry-protocol/DesignRequest'],
      output_schema_ref: 'opl://foundry-protocol/AgentBlueprint',
      entry_stage_ref: 'mission-intake',
      required_stage_refs: ['mission-intake', 'evaluation-design'],
      optional_stage_refs: [],
      terminal_stage_ref: 'evaluation-design',
    },
    diagnose: {
      input_schema_refs: [
        'opl://foundry-protocol/DesignRequest',
        'opl://foundry-protocol/AgentBlueprint',
        'opl://foundry-protocol/EvidenceBundle',
      ],
      output_schema_ref: 'opl://foundry-protocol/EvolutionProposal',
      entry_stage_ref: 'evidence-diagnosis',
      required_stage_refs: ['evidence-diagnosis', 'evolution-proposal'],
      optional_stage_refs: [],
      terminal_stage_ref: 'evolution-proposal',
    },
  },
  projection_policy: {
    public_action_ids: ['engineer-fixture'],
    internal_operations_are_public_actions: false,
    internal_operations_are_cli_commands: false,
    internal_operations_are_mcp_tools: false,
  },
  authority_boundary: {
    provider_owns_design_semantics: true,
    provider_owns_evaluation_semantics: true,
    provider_owns_evidence_diagnosis: true,
    provider_owns_evolution_proposals: true,
    provider_owns_foundry_run_state: false,
    provider_owns_candidate_materialization: false,
    provider_owns_evaluation_execution: false,
    provider_owns_versions_or_activation: false,
    provider_can_return_patch_or_work_order: false,
    provider_can_view_protected_test_bodies: false,
    opl_can_write_target_domain_truth: false,
  },
};

for (const operation of ['design', 'diagnose'] as const) {
  test(`StageRun ${operation} binds declared output schemas and transport requirements before launch`, async (t) => {
    const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-output-contract-'));
    t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
    const declaredProvider = structuredClone(provider);
    declaredProvider.provider_id = 'another-provider';
    declaredProvider.agent_id = 'another-provider';
    declaredProvider.package_id = 'another-provider';
    declaredProvider.operations[operation].terminal_stage_ref = 'custom-terminal';
    declaredProvider.operations[operation].required_stage_refs.push('custom-terminal');
    let captured: Record<string, any> | undefined;
    const launchBoundary = new Error('stop after capturing immutable launch inputs');
    const invoker = new StageRunFoundryProviderInvoker({
      storage_root: storageRoot,
      gateway: {
        async launch(input) {
          const bytes = fs.readFileSync(new URL(input.input_artifact_refs[0]!));
          assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), input.input_artifact_hashes[0]);
          captured = JSON.parse(bytes.toString('utf8'));
          throw launchBoundary;
        },
        async cancel() {},
        async query() { throw new Error('not used'); },
      },
    });
    await assert.rejects(invoker.invoke({
      operation,
      provider: normalizeFoundryProviderManifest(declaredProvider),
      checkout_root: '/managed/another-provider',
      activity: { ...activity, phase: operation },
      provider_source_digest: `sha256:${'a'.repeat(64)}`,
      payload: {} as never,
    }), (error) => error === launchBoundary);
    assert.ok(captured);
    const contract = captured.output_contract;
    assert.ok(contract, 'immutable provider input must include its output contract');
    assert.equal(contract.terminal_stage_ref, 'custom-terminal');
    assert.equal(contract.output_schema_ref, declaredProvider.operations[operation].output_schema_ref);
    assert.equal(contract.provider_manifest_digest, foundryContentDigest(declaredProvider));
    assert.equal(contract.schemas.length, operation === 'design' ? 1 : 2);
    for (const entry of contract.schemas) {
      assert.equal(entry.size_bytes, Buffer.byteLength(entry.content));
      assert.equal(entry.sha256, `sha256:${crypto.createHash('sha256').update(entry.content).digest('hex')}`);
      assert.equal(entry.content_ref, `opl-content://sha256/${entry.sha256.slice(7)}`);
      assert.equal(JSON.parse(entry.content).$id, entry.schema_id);
    }
    const blueprint = JSON.parse(contract.schemas.at(-1).content);
    assert.equal(blueprint.properties.surface_kind.const, 'opl_foundry_agent_blueprint');
    assert.equal(blueprint.additionalProperties, false);
    assert.ok(blueprint.$defs.eval_spec);
    assert.match(contract.transport_requirements.join('\n'), /exactly one raw JSON artifact/);
    assert.match(contract.transport_requirements.join('\n'), /immutable reviewer snapshot/);
  });
}

test('StageRun provider binds admitted source bytes to its actual initial launch', async (t) => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-source-launch-'));
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  const bytes = Buffer.from('An arbitrary source body, transported exactly.\n');
  const content = new FileFoundryContentStore(storageRoot).put(bytes);
  const sourceRef = `source-material:${content.digest}`;
  const stopped = new Error('captured source launch');
  const invoker = new StageRunFoundryProviderInvoker({
    storage_root: storageRoot,
    gateway: {
      async launch(input) {
        assert.equal(input.input_artifact_refs.length, 2);
        const activityInput = JSON.parse(fs.readFileSync(new URL(input.input_artifact_refs[0]!), 'utf8'));
        assert.deepEqual(activityInput.source_artifacts, [{
          source_ref: sourceRef,
          ref: input.input_artifact_refs[1],
          sha256: input.input_artifact_hashes[1],
        }]);
        assert.equal(input.input_artifact_hashes[1], content.digest.slice(7));
        assert.deepEqual(fs.readFileSync(new URL(input.input_artifact_refs[1]!)), bytes);
        throw stopped;
      },
      async cancel() {},
      async query() { throw new Error('not used'); },
    },
  });
  await assert.rejects(invoker.invoke({
    operation: 'design', provider, checkout_root: '/managed/provider', activity,
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { source_refs: [sourceRef] } as never },
  }), (error) => error === stopped);
});

test('StageRun provider rejects a report wrapping the raw terminal protocol object', async (t) => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-output-wrapper-'));
  t.after(() => fs.rmSync(storageRoot, { recursive: true, force: true }));
  const output = canonicalJsonBytes({
    surface_kind: 'stage_report',
    blueprint: { surface_kind: 'opl_foundry_agent_blueprint' },
  });
  const invoker = new StageRunFoundryProviderInvoker({
    storage_root: storageRoot,
    gateway: {
      async launch() { return { workflow_id: 'workflow:mission-intake' }; },
      async cancel() {},
      async query(workflowId) {
        return workflowId === 'workflow:mission-intake'
          ? state({ stage: 'mission-intake', next: 'workflow:evaluation-design' })
          : state({
              stage: 'evaluation-design',
              refs: ['memory://wrapped-output'],
              hashes: [crypto.createHash('sha256').update(output).digest('hex')],
            });
      },
    },
    artifact_reader: { readExact: () => output },
  });
  await assert.rejects(invoker.invoke({
    operation: 'design',
    provider,
    checkout_root: '/managed/oma',
    provider_source_digest: `sha256:${'a'.repeat(64)}`,
    payload: { request: { marker: 'request' } as never },
    activity,
  }), /exactly one schema-targeted raw output artifact/);
});

const activity: FoundryActivityIdentity = {
  run_id: 'run:provider-stage-test',
  iteration: 0,
  phase: 'design',
  input_digest: `sha256:${'1'.repeat(64)}`,
};

function scopedGatewayWorkspace(t: TestContext) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-scope-')));
  const state = path.join(root, 'state');
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(state); fs.mkdirSync(workspace);
  const previous = process.env.OPL_STATE_DIR;
  process.env.OPL_STATE_DIR = state;
  fs.writeFileSync(path.join(state, 'workspace-registry.json'), JSON.stringify({
    version: 'g2', bindings: [{
      binding_id: 'binding:foundry-test', project_scope_id: 'project:foundry-test',
      project_id: 'oma', project: 'OMA', workspace_path: workspace, status: 'active',
    }],
  }));
  t.after(() => {
    if (previous === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return workspace;
}

test('StageRun gateway uses the provider-declared public action instead of an OMA-specific constant', async (t) => {
  const workspaceRoot = scopedGatewayWorkspace(t);
  let args: string[] = [];
  const gateway = new OplFoundryProviderStageRunGateway((async (input: string[]) => {
    args = input;
    const command = parseFamilyRuntimeCommand(input);
    assert.equal(command.mode, 'attempt_create');
    if (command.mode !== 'attempt_create') throw new Error('Expected attempt_create');
    assert.equal(command.input.taskId, activity.run_id);
    assert.equal(command.input.scopeKind, 'work_item');
    const scope = requireFamilyRuntimeExecutionScope({
      scopeKind: command.input.scopeKind,
      executionScope: command.input.executionScope,
      workspaceLocator: command.input.workspaceLocator,
      domainId: command.input.domainId,
      operation: 'foundry-test-launch',
    });
    assert.ok(scope.executionScope?.canonical_work_item_root);
    assert.equal(scope.executionScope?.workspace_binding_id, 'binding:foundry-test');
    assert.deepEqual(command.input.inputArtifactHashes, [`sha256:${'2'.repeat(64)}`]);
    return {
      family_runtime_stage_run: {
        stage_run_input: { workflow_id: 'workflow:provider-action' },
      },
    };
  }) as never);
  await gateway.launch({
    provider,
    checkout_root: '/managed/provider',
    workspace_root: workspaceRoot,
    stage_id: 'mission-intake',
    stage_run_invocation_id: 'sri:provider-action',
    activity,
    input_artifact_refs: ['opl://foundry/input'],
    input_artifact_hashes: [`sha256:${'2'.repeat(64)}`],
  });
  assert.equal(args[args.indexOf('--action') + 1], 'engineer-fixture');
});

test('StageRun gateway forwards the Host Stagecraft composition to the runtime boundary', async (t) => {
  const workspaceRoot = scopedGatewayWorkspace(t);
  let composed = false;
  const gateway = new OplFoundryProviderStageRunGateway((async (_args, options) => {
    assert.equal(options?.createStageRouteComposition, createCordisStageRouteComposition);
    const composition = await options!.createStageRouteComposition!({});
    try {
      assert.equal(typeof composition.stageBinding.resolve, 'function');
      assert.equal(typeof composition.stageContext.observe, 'function');
      composed = true;
    } finally {
      await composition.dispose();
    }
    return { family_runtime_stage_run: { stage_run_input: { workflow_id: 'workflow:composition' } } };
  }) as typeof import('../../src/adapters/execution/family-runtime.ts').runFamilyRuntime, {
    create_stage_route_composition: createCordisStageRouteComposition,
  });
  await gateway.launch({
    provider,
    checkout_root: '/managed/provider',
    workspace_root: workspaceRoot,
    stage_id: 'mission-intake',
    stage_run_invocation_id: 'sri:composition',
    activity,
    input_artifact_refs: [],
    input_artifact_hashes: [],
  });
  assert.equal(composed, true);
});

test('StageRun gateway projects authoritative Temporal failure over a stale running query', async () => {
  const client = {
    async withDeadline(_deadline: number, fn: () => Promise<unknown>) {
      return fn();
    },
  };
  const handle = {
    async describe() {
      return {
        workflowId: 'workflow:failed-stage-run',
        runId: 'run:failed-stage-run',
        status: { name: 'FAILED' },
        memo: {
          stage_run_id: 'stage-run:failed-stage-run',
          domain_id: 'agent_engineering',
          stage_id: 'mission-intake',
        },
      };
    },
    async query() {
      throw new Error('A failed workflow query would expose stale running state.');
    },
    async result() {
      throw new Error('A failed workflow has no successful result.');
    },
  };

  const result = await queryFoundryProviderStageRunHandle(client as never, handle as never);
  assert.deepEqual(result, {
    surface_kind: 'temporal_stage_run_query',
    provider_kind: 'temporal',
    stage_run_id: 'stage-run:failed-stage-run',
    workflow_id: 'workflow:failed-stage-run',
    run_id: 'run:failed-stage-run',
    workflow_status: 'FAILED',
    domain_id: 'agent_engineering',
    stage_id: 'mission-intake',
    status: 'failed',
    artifact_refs: [],
    artifact_hashes: [],
    attempts: [],
    next_stage_run_launch: null,
    blocked_reason: 'temporal_stage_run_workflow_failed',
  });
});

test('StageRun gateway reads the authoritative result after Temporal completion', async () => {
  const terminal = state({
    stage: 'evaluation-design',
    refs: ['file:///terminal.json'],
    hashes: [`sha256:${'a'.repeat(64)}`],
  });
  const client = {
    async withDeadline(_deadline: number, fn: () => Promise<unknown>) {
      return fn();
    },
  };
  const handle = {
    async describe() {
      return {
        workflowId: 'workflow:completed-stage-run',
        runId: 'run:completed-stage-run',
        status: { name: 'COMPLETED' },
        memo: {},
      };
    },
    async query() {
      throw new Error('Completed StageRun state must come from the workflow result.');
    },
    async result() {
      return terminal;
    },
  };

  assert.equal(
    await queryFoundryProviderStageRunHandle(client as never, handle as never),
    terminal,
  );
});

test('Foundry provider manifest rejects every unknown field and contradictory authority at intake', async (t) => {
  const cases: Array<{
    name: string;
    mutate: (manifest: Record<string, any>) => void;
    error: RegExp;
  }> = [
    {
      name: 'root field',
      mutate: (manifest) => { manifest.unknown_root = true; },
      error: /manifest root fields/i,
    },
    {
      name: 'extra evaluate operation',
      mutate: (manifest) => { manifest.operations.evaluate = structuredClone(manifest.operations.design); },
      error: /operations fields/i,
    },
    {
      name: 'design operation field',
      mutate: (manifest) => { manifest.operations.design.unknown_binding = 'stage:unknown'; },
      error: /design operation fields/i,
    },
    {
      name: 'diagnose operation field',
      mutate: (manifest) => { manifest.operations.diagnose.unknown_binding = 'stage:unknown'; },
      error: /diagnose operation fields/i,
    },
    {
      name: 'projection policy field',
      mutate: (manifest) => { manifest.projection_policy.public_internal_alias = true; },
      error: /projection_policy fields/i,
    },
    {
      name: 'authority boundary field',
      mutate: (manifest) => { manifest.authority_boundary.provider_owns_runtime = true; },
      error: /authority_boundary fields/i,
    },
    {
      name: 'contradictory authority',
      mutate: (manifest) => { manifest.authority_boundary.provider_owns_foundry_run_state = true; },
      error: /takes OPL runtime authority/i,
    },
    {
      name: 'required Stage duplicate',
      mutate: (manifest) => { manifest.operations.design.required_stage_refs.push('mission-intake'); },
      error: /invalid closed Stage topology/i,
    },
    {
      name: 'entry Stage outside first required position',
      mutate: (manifest) => { manifest.operations.design.entry_stage_ref = 'evaluation-design'; },
      error: /invalid closed Stage topology/i,
    },
    {
      name: 'terminal Stage outside final required position',
      mutate: (manifest) => { manifest.operations.design.terminal_stage_ref = 'mission-intake'; },
      error: /invalid closed Stage topology/i,
    },
    {
      name: 'required and optional Stage overlap',
      mutate: (manifest) => { manifest.operations.design.optional_stage_refs.push('mission-intake'); },
      error: /invalid closed Stage topology/i,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const checkoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-closed-'));
      t.after(() => fs.rmSync(checkoutRoot, { recursive: true, force: true }));
      const manifest = structuredClone(provider) as unknown as Record<string, any>;
      scenario.mutate(manifest);
      const manifestFile = path.join(checkoutRoot, 'contracts/foundry_provider.json');
      fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
      fs.writeFileSync(manifestFile, canonicalJsonBytes(manifest));
      assert.throws(() => readFoundryProviderManifest(checkoutRoot), scenario.error);
    });
  }
});

function state(input: {
  stage: string;
  status?: string;
  next?: string | null;
  refs?: string[];
  hashes?: string[];
  currentRole?: string | null;
  attempts?: Array<Record<string, unknown>>;
  blockedReason?: string | null;
}) {
  return {
    surface_kind: 'temporal_stage_run_query',
    provider_kind: 'temporal',
    stage_run_id: `stage-run:${input.stage}`,
    workflow_id: `workflow:${input.stage}`,
    stage_id: input.stage,
    status: input.status ?? 'completed',
    artifact_refs: input.refs ?? [],
    artifact_hashes: input.hashes ?? [],
    next_stage_run_launch: input.next
      ? { target_workflow_id: input.next }
      : null,
    current_role: input.currentRole ?? null,
    attempts: input.attempts ?? [],
    blocked_reason: input.blockedReason ?? null,
    hard_stop_class: null,
    updated_at: new Date().toISOString(),
  };
}

test('StageRun provider coordinator persists a pending cursor and advances one continuation per observation', async () => {
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
    storage_root: fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-coordinator-')),
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

test('StageRun provider coordinator refuses terminal reads from a pending cursor and cancels its current StageRun', async () => {
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
    storage_root: fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-cancel-')),
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

test('StageRun provider cancellation follows an already-published continuation before cancelling', async () => {
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
    storage_root: fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-cancel-route-')),
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

test('StageRun provider coordinator rejects a cursor from another immutable operation', async () => {
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
    storage_root: fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-binding-')),
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

test('StageRun provider terminal read persists one exact replay result without relaunching', async () => {
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-replay-'));
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

const CONTENT_KINDS = ['prompt', 'skill', 'knowledge', 'helper', 'model', 'tool', 'schema'] as const;

function sha256(bytes: Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function providerResourceBytes(kind: typeof CONTENT_KINDS[number], label: string) {
  if (kind === 'schema') {
    return canonicalJsonBytes({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        request: { type: 'string' },
      },
      required: ['request'],
      additionalProperties: false,
    });
  }
  return Buffer.from(`${kind} ${label}\n`);
}

function writeProviderArtifact(root: string, name: string, bytes: Buffer) {
  const directory = path.join(root, 'provider-outputs');
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, name);
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  const digest = sha256(bytes);
  return {
    bytes,
    ref: pathToFileURL(file).href,
    sha256: `sha256:${digest}`,
    content_ref: `opl-content://sha256/${digest}`,
  };
}

function transportBlueprint(
  resources: Record<typeof CONTENT_KINDS[number], ReturnType<typeof writeProviderArtifact>>,
): AgentBlueprint {
  return {
    surface_kind: 'opl_foundry_agent_blueprint',
    version: FOUNDRY_PROTOCOL_VERSION,
    blueprint_id: 'blueprint:provider-transport-fixture',
    target_agent_id: 'provider-transport-agent',
    target_domain_id: 'provider_transport_domain',
    target_version_ref: null,
    design_request_digest: `sha256:${'1'.repeat(64)}`,
    generation: 0,
    stage_graph: {
      entry_stage_id: 'deliver',
      stages: [{
        stage_id: 'deliver',
        stage_kind: 'domain_delivery',
        goal: 'Deliver the provider transport fixture.',
        input_artifact_types: ['request'],
        output_artifact_types: ['delivery'],
        prompt_ref: resources.prompt.content_ref,
        skill_refs: [resources.skill.content_ref],
        knowledge_refs: [resources.knowledge.content_ref],
        capability_refs: ['capability:fixture'],
        next_stage_ids: [],
      }],
    },
    actions: [{
      action_id: 'deliver',
      summary: 'Deliver the provider transport fixture.',
      entry_stage_id: 'deliver',
      input_schema_ref: resources.schema.content_ref,
      output_schema_ref: resources.schema.content_ref,
    }],
    artifact_contracts: [{
      artifact_type: 'delivery',
      schema_ref: resources.schema.content_ref,
      authority_owner_ref: 'owner:fixture',
    }],
    content_refs: {
      prompt_refs: [resources.prompt.content_ref],
      skill_refs: [resources.skill.content_ref],
      knowledge_refs: [resources.knowledge.content_ref],
      helper_refs: [resources.helper.content_ref],
      model_refs: [resources.model.content_ref],
      tool_refs: [resources.tool.content_ref],
      schema_refs: [resources.schema.content_ref],
    },
    capability_requirements: ['capability:fixture'],
    authority_policy: {
      truth_owner_ref: 'owner:fixture',
      artifact_owner_ref: 'owner:fixture',
      quality_owner_ref: 'owner:fixture',
      permission_refs: [],
      generated_agent_can_modify_versions: false,
      generated_agent_can_modify_evaluation: false,
      generated_agent_can_modify_permissions: false,
      generated_agent_can_modify_activation: false,
    },
    memory_policy: {
      memory_classes: [],
      retention_refs: [],
      write_authority_refs: [],
    },
    assumptions: [],
    design_evidence_refs: [],
    eval_spec: {
      eval_spec_id: 'eval:provider-transport-fixture',
      public_cases: [{ case_id: 'case:fixture', test_ref: 'test:fixture', weight: 1, required: true }],
      protected_requirements: [{ category: 'protected-fixture', minimum_case_count: 1 }],
      gates: [{ gate_id: 'gate:fixture', metric: 'score', operator: 'gte', threshold: 1, required: true }],
      baseline_comparison: { required: false, regression_tolerance: 0 },
      independent_evaluator_required: true,
    },
    risk_hint: 'low',
  };
}

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
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-invoker-'));
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
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-observations-'));
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
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-coordinator-observations-'));
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
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-coordinator-blocked-'));
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
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-seven-class-'));
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
  const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-current-transport-'));
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

test('StageRun provider invocation fails closed when a required semantic Stage is skipped', async () => {
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
    storage_root: fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-skip-')),
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

test('Foundry provider artifact reader rejects symlinks and hash mismatches', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-artifact-'));
  const file = path.join(root, 'output.json');
  fs.writeFileSync(file, '{}\n', 'utf8');
  const link = path.join(root, 'output-link.json');
  fs.symlinkSync(file, link);
  const reader = new FileFoundryProviderArtifactReader({ allowed_root: root });

  assert.throws(() => reader.readExact({
    ref: pathToFileURL(file).href,
    sha256: `${'0'.repeat(64)}`,
  }), /do not match/);
  assert.throws(() => reader.readExact({
    ref: pathToFileURL(link).href,
    sha256: `${'0'.repeat(64)}`,
  }), /outside the allowed immutable transport boundary/);
});

test('default provider transport cannot read artifacts outside the Foundry storage root', async (t) => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-root-'));
  t.after(() => fs.rmSync(container, { recursive: true, force: true }));
  const storageRoot = path.join(container, 'foundry');
  fs.mkdirSync(storageRoot);
  const outside = path.join(container, 'outside.json');
  const bytes = canonicalJsonBytes({ surface_kind: 'opl_foundry_agent_blueprint' });
  fs.writeFileSync(outside, bytes);
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
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
            refs: [pathToFileURL(outside).href],
            hashes: [hash],
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
  }), /outside the allowed immutable transport boundary/);
});


test('Foundry scope survives generation retries and rejects another run or domain binding', (t) => {
  const workspace = scopedGatewayWorkspace(t);
  const input = { provider, workspace_root: workspace, run_id: 'foundry-run-a' };
  const first = resolveFoundryExecutionScope(input);
  assert.deepEqual(resolveFoundryExecutionScope(input), first);
  const other = resolveFoundryExecutionScope({ ...input, run_id: 'foundry-run-b' });
  assert.notEqual(first.work_item_scope_id, other.work_item_scope_id);
  assert.notEqual(first.scope_digest, other.scope_digest);
  assert.throws(() => requireFamilyRuntimeExecutionScope({
    scopeKind: 'work_item', executionScope: first,
    workspaceLocator: { workspace_root: workspace, execution_scope: other },
    operation: 'cross-run-test',
  }));
  assert.throws(() => requireFamilyRuntimeExecutionScope({
    scopeKind: 'domain', executionScope: first,
    workspaceLocator: { workspace_root: workspace, execution_scope: first },
    operation: 'cross-domain-test',
  }));
  assert.throws(() => resolveFoundryExecutionScope({ ...input, provider: {
    ...provider, agent_id: 'other', package_id: 'other', domain_id: 'other',
  } }), /existing provider workspace binding/);
});
