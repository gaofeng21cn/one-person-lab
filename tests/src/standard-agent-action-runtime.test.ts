import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { resolveStandardAgent } from '../../src/kernel/standard-agent-registry.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../../src/modules/pack/index.ts';
import { runFamilyRuntime } from '../../src/modules/runway/family-runtime.ts';
import { runStandardAgentAction } from '../../src/modules/runway/standard-agent-action-runtime.ts';
import { normalizeStageQualityCyclePolicy } from '../../src/modules/stagecraft/stage-quality-cycle.ts';

function root(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function supportedSurfaces() {
  return {
    cli: {},
    mcp: null,
    skill: null,
    product_entry: null,
    openai: null,
    ai_sdk: null,
  };
}

function action(input: {
  actionId: string;
  executionBinding: Record<string, unknown>;
  stageRoute?: Record<string, unknown>;
}) {
  return {
    action_id: input.actionId,
    title: input.actionId,
    summary: 'Fixture action.',
    owner: 'fixture-owner',
    effect: 'read_only',
    execution_binding: input.executionBinding,
    input_schema_ref: 'contracts/input.schema.json',
    output_schema_ref: 'contracts/output.schema.json',
    required_fields: ['workspace_root', 'value'],
    optional_fields: [],
    workspace_locator_fields: ['workspace_root'],
    human_gate_ids: [],
    ...(input.stageRoute ? { stage_route: input.stageRoute } : {}),
    supported_surfaces: supportedSurfaces(),
    authority_boundary: {},
  };
}

function writeContracts(checkoutRoot: string, actions: Record<string, unknown>[], registry?: Record<string, unknown>) {
  fs.mkdirSync(path.join(checkoutRoot, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'action_catalog.json'), `${JSON.stringify({
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'fixture-actions',
    target_domain_id: 'medautoscience',
    owner: 'fixture-owner',
    authority_boundary: {
      domain_truth_owner: 'fixture-owner',
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_mutate_domain_artifact_body: false,
      opl_can_authorize_quality_or_export: false,
      provider_completion_is_domain_completion: false,
    },
    actions,
    notes: [],
  })}\n`);
  if (registry) {
    fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'domain_handler_registry.json'), `${JSON.stringify(registry)}\n`);
  }
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'input.schema.json'), `${JSON.stringify({
    $id: 'https://fixture.local/input.schema.json',
    type: 'object',
    required: ['workspace_root', 'value'],
    properties: {
      workspace_root: { type: 'string', minLength: 1 },
      value: { type: 'integer' },
    },
    additionalProperties: false,
  })}\n`);
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'output.schema.json'), `${JSON.stringify({
    $id: 'https://fixture.local/output.schema.json',
    type: 'object',
    required: ['accepted', 'value'],
    properties: {
      accepted: { const: true },
      value: { type: 'integer' },
    },
    additionalProperties: false,
  })}\n`);
}

function managed(
  checkoutRoot: string,
  workspaceRoot: string,
  packageUseBinding: Record<string, unknown> = { use_boundary_id: 'package-use:fixture' },
) {
  return async () => ({
    agent: resolveStandardAgent('mas')!,
    package_id: 'mas',
    workspace_root: fs.realpathSync.native(workspaceRoot),
    checkout_root: fs.realpathSync.native(checkoutRoot),
    package_status: { launch_allowed: true },
    package_use_binding: packageUseBinding,
    use_boundary_id: 'package-use:fixture',
  });
}

function writeStageRuntimeFixture(checkoutRoot: string): StandardAgentStageQualityRuntimeBinding {
  const write = (ref: string, bytes: string) => {
    const file = path.join(checkoutRoot, ref);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes, 'utf8');
  };
  const manifestRef = 'agent/stages/manifest.json';
  write(manifestRef, `${JSON.stringify({
    surface_kind: 'opl_standard_agent_declarative_stage_manifest',
    version: 'opl-standard-agent-declarative-stage-manifest.v1',
    stages: [{ stage_id: 'intake', goal: 'Process the hosted action request.' }],
  })}\n`);
  write('contracts/stage_quality_cycle_policy.json', '{"stages":{"intake":{"enabled":true}}}\n');
  write('agent/prompts/intake.md', '# Intake prompt\n');
  write('agent/prompts/stage-quality.md', '# Producer\n# Reviewer\n# Repairer\n# Re Reviewer\n');
  write('agent/quality_gates/stage.md', '# Stage rubric\n');
  write('agent/stages/intake.md', '# Intake source policy\n');
  return {
    surface_kind: 'opl_pack_bound_stage_quality_runtime_binding',
    version: 'opl-pack-bound-stage-quality-runtime-binding.v1',
    stage_id: 'intake',
    declared_stage_ids: ['intake'],
    enabled: true,
    stage_role: null,
    policy_ref: 'contracts/stage_quality_cycle_policy.json#/stages/intake',
    stage_prompt_ref: 'agent/prompts/intake.md',
    quality_policy: normalizeStageQualityCyclePolicy({
      formal_review: { required: true, risk_tier: 'high', max_repair_rounds: 3 },
    }),
    handoff_review_boundary: null,
    role_prompt_refs: {
      producer: 'agent/prompts/stage-quality.md#producer',
      reviewer: 'agent/prompts/stage-quality.md#reviewer',
      repairer: 'agent/prompts/stage-quality.md#repairer',
      re_reviewer: 'agent/prompts/stage-quality.md#re-reviewer',
    },
    quality_rubric_refs: ['agent/quality_gates/stage.md'],
    stage_goal_refs: [`${manifestRef}#/stages/0/goal`],
    source_refs: ['agent/stages/intake.md'],
    lineage_refs: [`${manifestRef}#/stages/0`],
    manifest_ref: manifestRef,
    manifest_sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(checkoutRoot, manifestRef)))
      .digest('hex'),
  };
}

function packageUseBinding() {
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'package-use:hosted-durable-replay',
    use_receipt_ref: 'opl://agent-package/use/hosted-durable-replay',
    root_package: {
      package_id: 'mas',
      package_version: '0.2.1',
      package_lock_ref: 'opl://agent-package-lock/mas/0.2.1',
      manifest_sha256: crypto.createHash('sha256').update('mas-manifest').digest('hex'),
      content_digest: `sha256:${crypto.createHash('sha256').update('mas-content').digest('hex')}`,
    },
    provider_packages: [],
    dependency_closure_digest: crypto.createHash('sha256').update('mas-closure').digest('hex'),
  };
}

function recordLedger(input: Record<string, unknown>) {
  return {
    ledger_entry: {
      run_id: input.runId,
      status: input.status,
    },
    recorded_event: { event_type: 'standard_agent_action_run_recorded' },
  } as never;
}

test('Hosted Handler action validates schemas, runs the callable, and persists exact bytes', async () => {
  const checkoutRoot = root('opl-action-runtime-checkout-');
  const workspaceRoot = root('opl-action-runtime-workspace-');
  try {
    writeContracts(checkoutRoot, [action({
      actionId: 'evaluate',
      executionBinding: { kind: 'handler_ref', handler_ref: 'handler:fixture.evaluate' },
    })], {
      surface_kind: 'domain_handler_registry',
      version: 'domain-handler-registry.v1',
      handlers: [{
        handler_id: 'fixture.evaluate',
        binding: { kind: 'typescript_export', file: 'handler.ts', export: 'evaluate' },
      }],
    });
    fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
      'export function evaluate(request: Record<string, unknown>) {',
      '  return { accepted: true, value: request.value };',
      '}',
      '',
    ].join('\n'));

    const result = await runStandardAgentAction({
      domainId: 'mas',
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 7 },
      runId: 'handler-run',
    }, {
      resolveManagedCheckout: managed(checkoutRoot, workspaceRoot) as never,
      recordLedger,
    });
    const run = result.standard_agent_action_run;
    assert.equal(run.execution_kind, 'handler_ref');
    if (run.execution_kind !== 'handler_ref') assert.fail('expected handler action result');
    assert.equal(run.status, 'completed');
    assert.deepEqual(run.result, { accepted: true, value: 7 });
    assert.equal(fs.readFileSync(run.output.file_path, 'utf8'), '{"accepted":true,"value":7}\n');
    assert.deepEqual(JSON.parse(fs.readFileSync(run.request.file_path, 'utf8')), {
      value: 7,
      workspace_root: fs.realpathSync.native(workspaceRoot),
    });
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('Hosted Stage action passes a SHA-bound request ref into Temporal StageRun create/start/query', async () => {
  const checkoutRoot = root('opl-stage-action-checkout-');
  const workspaceRoot = root('opl-stage-action-workspace-');
  const calls: string[][] = [];
  try {
    const stageRoute = {
      entry_stage_ref: 'intake',
      required_stage_refs: ['intake'],
      optional_stage_refs: [],
      terminal_stage_refs: ['intake'],
      route_policy: 'ai_selected_progress_route',
    };
    writeContracts(checkoutRoot, [action({
      actionId: 'launch',
      executionBinding: { kind: 'stage_binding', stage_manifest_ref: 'agent/stages/manifest.json' },
      stageRoute,
    })]);

    const result = await runStandardAgentAction({
      domainId: 'mas',
      actionId: 'launch',
      workspaceRoot,
      payload: { value: 3 },
      runId: 'stage-run',
    }, {
      resolveManagedCheckout: managed(checkoutRoot, workspaceRoot) as never,
      compileStageManifest: (() => ({})) as never,
      recordLedger,
      runStageRuntime: async (args) => {
        calls.push(args);
        if (args[0] === 'attempt') {
          return {
            family_runtime_stage_run: {
              stage_run_input: { workflow_id: 'wf-stage-run' },
              blocked_reason: null,
              temporal_start: { start_status: 'started' },
            },
          };
        }
        return { family_runtime_stage_run_query: { status: 'running' } };
      },
    });
    const run = result.standard_agent_action_run;
    assert.equal(run.execution_kind, 'stage_binding');
    if (run.execution_kind !== 'stage_binding') assert.fail('expected stage action result');
    assert.equal(run.status, 'started');
    assert.equal(run.ledger.status, 'started');
    assert.deepEqual(calls[1], ['stage-run', 'query', 'wf-stage-run']);
    const checkpointIndex = calls[0].indexOf('--checkpoint-ref');
    assert.match(calls[0][checkpointIndex + 1], /^file:/);
    assert.equal(fs.existsSync(new URL(calls[0][checkpointIndex + 1])), true);
    const invocationIndex = calls[0].indexOf('--stage-run-invocation-id');
    assert.equal(calls[0][invocationIndex + 1], run.stage_run_invocation_id);
    const artifactRefIndex = calls[0].indexOf('--input-artifact-ref');
    const artifactHashIndex = calls[0].indexOf('--input-artifact-sha256');
    const sourceFingerprintIndex = calls[0].indexOf('--source-fingerprint');
    assert.equal(calls[0][artifactRefIndex + 1], calls[0][checkpointIndex + 1]);
    assert.equal(calls[0][artifactHashIndex + 1], calls[0][sourceFingerprintIndex + 1]);
    assert.deepEqual(run.temporal_stage_run_query, {
      family_runtime_stage_run_query: { status: 'running' },
    });
    assert.equal(run.temporal_stage_run_query_error, null);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('Hosted action replay reconciles one durable StageRun execution through deterministic RPC replay', async () => {
  const checkoutRoot = root('opl-hosted-durable-checkout-');
  const workspaceRoot = root('opl-hosted-durable-workspace-');
  const stateRoot = root('opl-hosted-durable-state-');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  let startCalls = 0;
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    const stageRoute = {
      entry_stage_ref: 'intake',
      required_stage_refs: ['intake'],
      optional_stage_refs: [],
      terminal_stage_refs: ['intake'],
      route_policy: 'ai_selected_progress_route',
    };
    writeContracts(checkoutRoot, [action({
      actionId: 'launch',
      executionBinding: { kind: 'stage_binding', stage_manifest_ref: 'agent/stages/manifest.json' },
      stageRoute,
    })]);
    const stageBinding = writeStageRuntimeFixture(checkoutRoot);
    const useBinding = packageUseBinding();
    const runRealStageRuntime = (args: string[]) => runFamilyRuntime(args, {
      stageRunRuntime: {
        ensurePackageLaunchReady: async () => ({
          launch_allowed: true,
          runtime_source_readiness: { checkout_path: checkoutRoot },
          package_use_binding: useBinding,
        } as any),
        resolveStageBinding: () => stageBinding,
        startWorkflow: async (workflowInput) => {
          startCalls += 1;
          return {
            stage_run_id: workflowInput.stage_run_id,
            stage_run_invocation_id: workflowInput.stage_run_invocation_id,
            stage_run_spec_sha256: workflowInput.stage_run_spec_sha256,
            workflow_id: workflowInput.workflow_id,
            workflow_status: 'RUNNING',
            first_execution_run_id: 'temporal-run-hosted-replay',
          };
        },
        queryWorkflow: async ({ workflowId }) => ({ workflow_id: workflowId, status: 'running' }),
      },
    });
    const actionInput = {
      domainId: 'mas',
      actionId: 'launch',
      workspaceRoot,
      payload: { value: 3 },
      runId: 'hosted-durable-replay',
    };
    const dependencies = {
      resolveManagedCheckout: managed(checkoutRoot, workspaceRoot, useBinding) as never,
      compileStageManifest: (() => ({})) as never,
      recordLedger,
      runStageRuntime: runRealStageRuntime,
    };
    const first = await runStandardAgentAction(actionInput, dependencies);
    const replay = await runStandardAgentAction(actionInput, dependencies);
    const firstRun = first.standard_agent_action_run;
    const replayRun = replay.standard_agent_action_run;
    assert.equal(firstRun.execution_kind, 'stage_binding');
    assert.equal(replayRun.execution_kind, 'stage_binding');
    if (firstRun.execution_kind !== 'stage_binding' || replayRun.execution_kind !== 'stage_binding') {
      assert.fail('expected Stage action results');
    }
    assert.equal(replayRun.stage_run_invocation_id, firstRun.stage_run_invocation_id);
    assert.equal(
      (replayRun.temporal_stage_run.family_runtime_stage_run as any).stage_run_input.stage_run_id,
      (firstRun.temporal_stage_run.family_runtime_stage_run as any).stage_run_input.stage_run_id,
    );
    assert.equal(startCalls, 2);

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const launches = db.prepare(`
        SELECT stage_run_invocation_id, launch_status, temporal_start_receipt_json
        FROM stage_run_launches
      `).all() as Array<Record<string, unknown>>;
      assert.equal(launches.length, 1);
      assert.equal(launches[0]?.stage_run_invocation_id, firstRun.stage_run_invocation_id);
      assert.equal(launches[0]?.launch_status, 'started');
      assert.match(String(launches[0]?.temporal_start_receipt_json), /temporal-run-hosted-replay/);
    } finally {
      db.close();
    }
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('concurrent Hosted action replay returns one canonical output over one Temporal execution', async () => {
  const checkoutRoot = root('opl-hosted-concurrent-checkout-');
  const workspaceRoot = root('opl-hosted-concurrent-workspace-');
  const stateRoot = root('opl-hosted-concurrent-state-');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  let startCalls = 0;
  let observeFirstStart!: () => void;
  let releaseFirstStart!: () => void;
  const firstStartObserved = new Promise<void>((resolve) => { observeFirstStart = resolve; });
  const firstStartReleased = new Promise<void>((resolve) => { releaseFirstStart = resolve; });
  try {
    process.env.OPL_STATE_DIR = stateRoot;
    writeContracts(checkoutRoot, [action({
      actionId: 'launch',
      executionBinding: { kind: 'stage_binding', stage_manifest_ref: 'agent/stages/manifest.json' },
      stageRoute: {
        entry_stage_ref: 'intake',
        required_stage_refs: ['intake'],
        optional_stage_refs: [],
        terminal_stage_refs: ['intake'],
        route_policy: 'ai_selected_progress_route',
      },
    })]);
    const stageBinding = writeStageRuntimeFixture(checkoutRoot);
    const useBinding = packageUseBinding();
    const runRealStageRuntime = (args: string[]) => runFamilyRuntime(args, {
      stageRunRuntime: {
        ensurePackageLaunchReady: async () => ({
          launch_allowed: true,
          runtime_source_readiness: { checkout_path: checkoutRoot },
          package_use_binding: useBinding,
        } as any),
        resolveStageBinding: () => stageBinding,
        startWorkflow: async (workflowInput) => {
          startCalls += 1;
          if (startCalls === 1) {
            observeFirstStart();
            await firstStartReleased;
          }
          return {
            stage_run_id: workflowInput.stage_run_id,
            stage_run_invocation_id: workflowInput.stage_run_invocation_id,
            stage_run_spec_sha256: workflowInput.stage_run_spec_sha256,
            workflow_id: workflowInput.workflow_id,
            workflow_status: 'RUNNING',
            first_execution_run_id: 'temporal-run-hosted-concurrent',
            recovered_existing_execution: startCalls > 1,
          };
        },
        queryWorkflow: async ({ workflowId }) => ({ workflow_id: workflowId, status: 'running' }),
      },
    });
    const actionInput = {
      domainId: 'mas',
      actionId: 'launch',
      workspaceRoot,
      payload: { value: 3 },
      runId: 'hosted-concurrent-replay',
    };
    const dependencies = {
      resolveManagedCheckout: managed(checkoutRoot, workspaceRoot, useBinding) as never,
      compileStageManifest: (() => ({})) as never,
      recordLedger,
      runStageRuntime: runRealStageRuntime,
    };

    const firstPromise = runStandardAgentAction(actionInput, dependencies);
    await firstStartObserved;
    const second = await runStandardAgentAction(actionInput, dependencies);
    releaseFirstStart();
    const first = await firstPromise;
    const firstRun = first.standard_agent_action_run;
    const secondRun = second.standard_agent_action_run;
    assert.equal(firstRun.execution_kind, 'stage_binding');
    assert.equal(secondRun.execution_kind, 'stage_binding');
    if (firstRun.execution_kind !== 'stage_binding' || secondRun.execution_kind !== 'stage_binding') {
      assert.fail('expected Stage action results');
    }
    assert.equal(startCalls, 2);
    assert.equal(firstRun.output.sha256, secondRun.output.sha256);
    assert.deepEqual(firstRun.temporal_stage_run, secondRun.temporal_stage_run);
    assert.equal(
      ((firstRun.temporal_stage_run.family_runtime_stage_run as any)
        .durable_launch.launch.temporal_start_receipt.first_execution_run_id),
      'temporal-run-hosted-concurrent',
    );

    const db = new DatabaseSync(path.join(stateRoot, 'family-runtime', 'queue.sqlite'));
    try {
      const launches = db.prepare('SELECT stage_run_id, workflow_id FROM stage_run_launches').all();
      assert.equal(launches.length, 1);
    } finally {
      db.close();
    }
  } finally {
    releaseFirstStart();
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Hosted Stage action keeps started truth when post-launch query is unavailable', async () => {
  const checkoutRoot = root('opl-stage-action-query-failure-checkout-');
  const workspaceRoot = root('opl-stage-action-query-failure-workspace-');
  const ledgerStatuses: string[] = [];
  try {
    writeContracts(checkoutRoot, [action({
      actionId: 'launch',
      executionBinding: { kind: 'stage_binding', stage_manifest_ref: 'agent/stages/manifest.json' },
      stageRoute: {
        entry_stage_ref: 'intake',
        required_stage_refs: ['intake'],
        optional_stage_refs: [],
        terminal_stage_refs: ['intake'],
        route_policy: 'ai_selected_progress_route',
      },
    })]);

    const result = await runStandardAgentAction({
      domainId: 'mas',
      actionId: 'launch',
      workspaceRoot,
      payload: { value: 3 },
      runId: 'stage-query-unavailable',
    }, {
      resolveManagedCheckout: managed(checkoutRoot, workspaceRoot) as never,
      compileStageManifest: (() => ({})) as never,
      recordLedger: ((input: Record<string, unknown>) => {
        ledgerStatuses.push(String(input.status));
        return recordLedger(input);
      }) as never,
      runStageRuntime: async (args) => {
        if (args[0] === 'attempt') {
          return {
            family_runtime_stage_run: {
              stage_run_input: { workflow_id: 'wf-stage-query-unavailable' },
              blocked_reason: null,
              temporal_start: { start_status: 'started' },
            },
          };
        }
        throw new Error('temporal query temporarily unavailable');
      },
    });
    const run = result.standard_agent_action_run;
    assert.equal(run.execution_kind, 'stage_binding');
    if (run.execution_kind !== 'stage_binding') assert.fail('expected stage action result');
    assert.equal(run.status, 'started');
    assert.deepEqual(ledgerStatuses, ['started']);
    assert.equal(run.temporal_stage_run_query, null);
    assert.deepEqual(run.temporal_stage_run_query_error, {
      error_code: 'standard_agent_action_observation_failed',
      message: 'temporal query temporarily unavailable',
    });
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
