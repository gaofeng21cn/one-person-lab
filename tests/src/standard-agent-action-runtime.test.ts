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

function sha256(bytes: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function writeStagePack(checkoutRoot: string): StandardAgentStageQualityRuntimeBinding {
  const files = new Map<string, string>([
    ['agent/stages/manifest.json', '{"stages":["intake"]}\n'],
    ['contracts/stage_quality_cycle_policy.json', '{"stages":{}}\n'],
    ['agent/prompts/intake.md', '# Intake producer\n'],
    ['agent/prompts/stage-quality.md', [
      '# Stage quality roles',
      '## Producer', 'Produce the artifact.',
      '## Reviewer', 'Review exact artifact bytes.',
      '## Repairer', 'Repair required findings.',
      '## Re Reviewer', 'Close prior findings.',
      '',
    ].join('\n')],
    ['agent/quality_gates/stage.md', '# Stage rubric\n'],
    ['agent/goals/intake.md', '# Intake goal\n'],
    ['agent/sources/request.md', '# Hosted request source\n'],
    ['agent/lineage/intake.json', '{"stage_id":"intake"}\n'],
  ]);
  for (const [ref, bytes] of files) {
    const filePath = path.join(checkoutRoot, ref);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, bytes);
  }
  const manifestBytes = files.get('agent/stages/manifest.json')!;
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
    stage_goal_refs: ['agent/goals/intake.md'],
    source_refs: ['agent/sources/request.md'],
    lineage_refs: ['agent/lineage/intake.json'],
    manifest_ref: 'agent/stages/manifest.json',
    manifest_sha256: sha256(manifestBytes).slice('sha256:'.length),
  };
}

function stagePackageUseBinding() {
  return {
    surface_kind: 'opl_agent_package_use_binding.v1',
    use_boundary_id: 'package-use:hosted-stage-test',
    use_receipt_ref: 'opl://agent-package/use/hosted-stage-test',
    root_package: {
      package_id: 'mas',
      package_version: '0.2.2',
      owner_language_version: { scheme: 'pep440', value: '0.2.2' },
      package_lock_ref: 'opl://agent-package-lock/mas/0.2.2',
      manifest_sha256: `sha256:${'1'.repeat(64)}`,
      content_digest: `sha256:${'2'.repeat(64)}`,
      source_artifact_ref: 'oci://opl/mas@sha256:fixture',
      artifact_digest: `sha256:${'3'.repeat(64)}`,
    },
    provider_packages: [],
    dependency_closure_digest: `sha256:${'4'.repeat(64)}`,
    core_skill_tree_digest: null,
    skill_tree_digest: null,
  };
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

function managed(checkoutRoot: string, workspaceRoot: string) {
  return async () => ({
    agent: resolveStandardAgent('mas')!,
    package_id: 'mas',
    workspace_root: fs.realpathSync.native(workspaceRoot),
    checkout_root: fs.realpathSync.native(checkoutRoot),
    package_status: { launch_allowed: true },
    package_use_binding: { use_boundary_id: 'package-use:fixture' },
    use_boundary_id: 'package-use:fixture',
  });
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

test('Hosted Handler replay reads G1 output without resolving or executing G2', async () => {
  const checkoutRoot = root('opl-action-handler-replay-checkout-');
  const workspaceRoot = root('opl-action-handler-replay-workspace-');
  const reservationDb = new DatabaseSync(':memory:');
  let resolverCalls = 0;
  let handlerCalls = 0;
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
    fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), 'export const evaluate = () => null;\n');
    const resolveG1 = managed(checkoutRoot, workspaceRoot);
    const dependencies = {
      actionRunReservationDb: reservationDb,
      resolveManagedCheckout: (async () => {
        resolverCalls += 1;
        if (resolverCalls > 1) throw new Error('G2 resolver must not run during replay');
        return resolveG1();
      }) as never,
      runHandler: (() => {
        handlerCalls += 1;
        const output = { accepted: true, value: 17 };
        return {
          runtime_kind: 'node_permission_model',
          sandbox_kind: 'macos_sandbox_exec',
          exit_code: 0,
          timed_out: false,
          stdout_bytes: Buffer.from(`${JSON.stringify(output)}\n`, 'utf8'),
          stderr: '',
          output,
        };
      }) as never,
      recordLedger,
    };

    const first = await runStandardAgentAction({
      domainId: 'mas', actionId: 'evaluate', workspaceRoot, payload: { value: 17 }, runId: 'handler-g1',
    }, dependencies);
    const replay = await runStandardAgentAction({
      domainId: 'medautoscience',
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 17 },
      runId: 'handler-g1',
    }, dependencies);

    const firstRun = first.standard_agent_action_run;
    const replayRun = replay.standard_agent_action_run;
    assert.equal(firstRun.execution_kind, 'handler_ref');
    assert.equal(replayRun.execution_kind, 'handler_ref');
    if (firstRun.execution_kind !== 'handler_ref' || replayRun.execution_kind !== 'handler_ref') {
      assert.fail('expected handler action results');
    }
    assert.equal(resolverCalls, 1);
    assert.equal(handlerCalls, 1);
    assert.deepEqual(replayRun.result, { accepted: true, value: 17 });
    assert.equal(
      replayRun.output.sha256,
      firstRun.output.sha256,
    );
    assert.deepEqual(
      replayRun.package_use_binding,
      firstRun.package_use_binding,
    );
  } finally {
    reservationDb.close();
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

test('Hosted Stage action replays one durable registry launch and starts a later run separately', async () => {
  const checkoutRoot = root('opl-stage-action-durable-checkout-');
  const workspaceRoot = root('opl-stage-action-durable-workspace-');
  const stateRoot = root('opl-stage-action-durable-state-');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const stageBinding = writeStagePack(checkoutRoot);
  const startedWorkflowIds: string[] = [];
  const firstExecutionByWorkflow = new Map<string, string>();
  let stageRuntimeCreateCalls = 0;
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
    const runStageRuntime: typeof runFamilyRuntime = async (args) => {
      if (args[0] === 'attempt' && args[1] === 'create') stageRuntimeCreateCalls += 1;
      return await runFamilyRuntime(args, {
        stageRunRuntime: {
          ensurePackageLaunchReady: async () => ({
            launch_allowed: true,
            runtime_source_readiness: { checkout_path: checkoutRoot },
            package_use_binding: stagePackageUseBinding(),
          } as never),
          resolveStageBinding: () => stageBinding,
          startWorkflow: async (input) => {
            startedWorkflowIds.push(input.workflow_id);
            const firstExecutionRunId = `run-${input.stage_run_id}`;
            firstExecutionByWorkflow.set(input.workflow_id, firstExecutionRunId);
            return {
              workflow_id: input.workflow_id,
              first_execution_run_id: firstExecutionRunId,
              workflow_status: 'RUNNING',
            };
          },
          describeWorkflow: async (input) => ({
            workflow_found: true,
            workflow_id: input.workflow_id,
            first_execution_run_id: firstExecutionByWorkflow.get(input.workflow_id),
            workflow_status: 'RUNNING',
          }),
          queryWorkflow: async ({ workflowId }) => ({
            workflow_id: workflowId,
            workflow_status: 'RUNNING',
          }),
        },
      });
    };
    const dependencies = {
      resolveManagedCheckout: managed(checkoutRoot, workspaceRoot) as never,
      compileStageManifest: (() => ({})) as never,
      recordLedger,
      runStageRuntime,
    };

    const first = await runStandardAgentAction({
      domainId: 'mas', actionId: 'launch', workspaceRoot, payload: { value: 11 }, runId: 'hosted-one',
    }, dependencies);
    const replay = await runStandardAgentAction({
      domainId: 'mas', actionId: 'launch', workspaceRoot, payload: { value: 11 }, runId: 'hosted-one',
    }, dependencies);
    const later = await runStandardAgentAction({
      domainId: 'mas', actionId: 'launch', workspaceRoot, payload: { value: 11 }, runId: 'hosted-two',
    }, dependencies);

    const firstRun = first.standard_agent_action_run;
    const replayRun = replay.standard_agent_action_run;
    const laterRun = later.standard_agent_action_run;
    assert.equal(firstRun.execution_kind, 'stage_binding');
    assert.equal(replayRun.execution_kind, 'stage_binding');
    assert.equal(laterRun.execution_kind, 'stage_binding');
    if (
      firstRun.execution_kind !== 'stage_binding'
      || replayRun.execution_kind !== 'stage_binding'
      || laterRun.execution_kind !== 'stage_binding'
    ) assert.fail('expected stage-bound hosted action results');
    assert.equal(firstRun.stage_run_invocation_id, replayRun.stage_run_invocation_id);
    assert.notEqual(firstRun.stage_run_invocation_id, laterRun.stage_run_invocation_id);
    assert.equal(
      (firstRun.temporal_stage_run.family_runtime_stage_run as any).durable_launch.start_status,
      'started',
    );
    assert.equal(
      (replayRun.temporal_stage_run.family_runtime_stage_run as any).durable_launch.start_status,
      'started',
    );
    assert.equal(replayRun.output.sha256, firstRun.output.sha256);
    assert.equal(stageRuntimeCreateCalls, 2);
    assert.deepEqual(startedWorkflowIds.length, 2);
    assert.equal(new Set(startedWorkflowIds).size, 2);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(stateRoot, { recursive: true, force: true });
  }
});

test('Hosted Stage replay resumes the G1 launch when G2 route drifts before output persistence', async () => {
  const checkoutRoot = root('opl-stage-action-g1-replay-checkout-');
  const workspaceRoot = root('opl-stage-action-g1-replay-workspace-');
  const stateRoot = root('opl-stage-action-g1-replay-state-');
  const reservationDb = new DatabaseSync(':memory:');
  const previousStateRoot = process.env.OPL_STATE_DIR;
  const stageBinding = writeStagePack(checkoutRoot);
  const startedWorkflowIds: string[] = [];
  const firstExecutionByWorkflow = new Map<string, string>();
  let resolverCalls = 0;
  let packageReadinessCalls = 0;
  let stageRuntimeCreateCalls = 0;
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
    const runStageRuntime: typeof runFamilyRuntime = async (args) => {
      if (args[0] === 'attempt' && args[1] === 'create') stageRuntimeCreateCalls += 1;
      return runFamilyRuntime(args, {
        stageRunRuntime: {
          ensurePackageLaunchReady: async () => {
            packageReadinessCalls += 1;
            return {
              launch_allowed: true,
              runtime_source_readiness: { checkout_path: checkoutRoot },
              package_use_binding: stagePackageUseBinding(),
            } as never;
          },
          resolveStageBinding: () => stageBinding,
          startWorkflow: async (stageRunInput) => {
            startedWorkflowIds.push(stageRunInput.workflow_id);
            const firstExecutionRunId = `run-${stageRunInput.stage_run_id}`;
            firstExecutionByWorkflow.set(stageRunInput.workflow_id, firstExecutionRunId);
            return {
              workflow_id: stageRunInput.workflow_id,
              first_execution_run_id: firstExecutionRunId,
              workflow_status: 'RUNNING',
            };
          },
          describeWorkflow: async ({ workflow_id: workflowId }) => ({
            workflow_found: true,
            workflow_id: workflowId,
            first_execution_run_id: firstExecutionByWorkflow.get(workflowId),
            workflow_status: 'RUNNING',
          }),
          queryWorkflow: async ({ workflowId }) => ({
            workflow_id: workflowId,
            workflow_status: 'RUNNING',
          }),
        },
      });
    };
    const resolveG1 = managed(checkoutRoot, workspaceRoot);
    const dependencies = {
      actionRunReservationDb: reservationDb,
      resolveManagedCheckout: (async () => {
        resolverCalls += 1;
        if (resolverCalls > 1) throw new Error('G2 resolver must not run during replay');
        return resolveG1();
      }) as never,
      compileStageManifest: (() => ({})) as never,
      recordLedger,
      runStageRuntime,
    };

    const first = await runStandardAgentAction({
      domainId: 'mas', actionId: 'launch', workspaceRoot, payload: { value: 23 }, runId: 'stage-g1',
    }, dependencies);
    const firstRun = first.standard_agent_action_run;
    assert.equal(firstRun.execution_kind, 'stage_binding');
    if (firstRun.execution_kind !== 'stage_binding') assert.fail('expected stage-bound hosted action result');
    fs.rmSync(firstRun.output.file_path);
    writeContracts(checkoutRoot, [action({
      actionId: 'launch',
      executionBinding: { kind: 'stage_binding', stage_manifest_ref: 'agent/stages/manifest.json' },
      stageRoute: {
        entry_stage_ref: 'review',
        required_stage_refs: ['review'],
        optional_stage_refs: [],
        terminal_stage_refs: ['review'],
        route_policy: 'ai_selected_progress_route',
      },
    })]);

    const replay = await runStandardAgentAction({
      domainId: 'mas', actionId: 'launch', workspaceRoot, payload: { value: 23 }, runId: 'stage-g1',
    }, dependencies);
    const replayRun = replay.standard_agent_action_run;
    assert.equal(replayRun.execution_kind, 'stage_binding');
    if (replayRun.execution_kind !== 'stage_binding') assert.fail('expected stage-bound hosted action result');
    assert.equal(resolverCalls, 1);
    assert.equal(packageReadinessCalls, 1);
    assert.equal(stageRuntimeCreateCalls, 2);
    assert.equal(startedWorkflowIds.length, 1);
    assert.equal(replayRun.stage_route.entry_stage_ref, 'intake');
    assert.equal(
      (replayRun as { stage_run_invocation_id: string }).stage_run_invocation_id,
      firstRun.stage_run_invocation_id,
    );
    assert.deepEqual(
      replayRun.package_use_binding,
      firstRun.package_use_binding,
    );
    assert.equal(fs.existsSync(replayRun.output.file_path), true);
  } finally {
    if (previousStateRoot === undefined) delete process.env.OPL_STATE_DIR;
    else process.env.OPL_STATE_DIR = previousStateRoot;
    reservationDb.close();
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
