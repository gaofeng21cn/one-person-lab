import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveStandardAgent } from '../../src/kernel/standard-agent-registry.ts';
import type { StandardAgentStageQualityRuntimeBinding } from '../../src/modules/pack/index.ts';
import { runFamilyRuntime } from '../../src/modules/runway/family-runtime.ts';
import type {
  HostedAgentRuntimeBindingResolver,
  HostedAgentRuntimeBindingProvenance,
  HostedAgentRuntimeBindingSnapshot,
} from '../../src/modules/runway/hosted-agent-runtime-binding.ts';
import { inspectStandardAgentActionRunCompletion } from '../../src/modules/runway/standard-agent-action-run-state.ts';
import { runStandardAgentAction } from '../../src/modules/runway/standard-agent-action-runtime.ts';
import { runStandardAgentHandlerSandbox } from '../../src/modules/runway/standard-agent-handler-sandbox.ts';
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
  const foundryBound = actions.some((entry) => (
    (entry.execution_binding as Record<string, unknown> | undefined)?.kind === 'foundry_binding'
  ));
  fs.mkdirSync(path.join(checkoutRoot, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'action_catalog.json'), `${JSON.stringify({
    surface_kind: 'family_action_catalog',
    version: 'family-action-catalog.v2',
    catalog_id: 'fixture-actions',
    target_domain_id: 'medautoscience',
    owner: 'fixture-owner',
    authority_boundary: {
      domain_truth_owner: 'fixture-owner',
      opl_role: foundryBound ? 'foundry_runtime_owner' : 'projection_consumer_only',
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

function hostedSnapshot(input: {
  checkoutRoot: string;
  workspaceRoot: string;
  label: string;
}): HostedAgentRuntimeBindingSnapshot {
  const contentDigest = sha256(`content:${input.label}`);
  const artifactDigest = sha256(`artifact:${input.label}`);
  const provenance: HostedAgentRuntimeBindingProvenance = {
    surface_kind: 'opl_hosted_agent_runtime_binding_provenance',
    version: 'opl-hosted-agent-runtime-binding-provenance.v1',
    source_kind: 'managed_package_checkout',
    target_agent_id: 'mas',
    target_domain_id: 'medautoscience',
    package_id: 'mas',
    package_use_boundary_id: `package-use:${input.label}`,
    package_version: input.label,
    package_lock_ref: `opl://agent-package-lock/mas/${input.label}`,
    package_content_digest: contentDigest,
    package_artifact_digest: artifactDigest,
  };
  return {
    source_kind: provenance.source_kind,
    checkout_root: fs.realpathSync.native(input.checkoutRoot),
    workspace_root: fs.realpathSync.native(input.workspaceRoot),
    agent_id: 'mas',
    runtime_domain_id: 'medautoscience',
    target_domain_id: 'medautoscience',
    catalog_target_domain_ids: ['mas', 'medautoscience'],
    package_use_binding: { use_boundary_id: provenance.package_use_boundary_id },
    provenance,
    provenance_ref: `opl://hosted-agent-runtime-binding/${contentDigest}`,
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
    fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
      'export function evaluate(request: Record<string, unknown>) {',
      '  return { accepted: true, value: request.value };',
      '}',
      '',
    ].join('\n'));

    const dependencies = {
      resolveManagedCheckout: managed(checkoutRoot, workspaceRoot) as never,
      recordLedger,
      runHandler: (input: Parameters<typeof runStandardAgentHandlerSandbox>[0]) => {
        handlerCalls += 1;
        return runStandardAgentHandlerSandbox(input);
      },
    };
    const result = await runStandardAgentAction({
      domainId: 'mas',
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 7 },
      runId: 'handler-run',
    }, dependencies);
    const replay = await runStandardAgentAction({
      domainId: 'medautoscience',
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 7 },
      runId: 'handler-run',
    }, dependencies);
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
    assert.equal(replay.standard_agent_action_run.execution_kind, 'handler_ref');
    if (replay.standard_agent_action_run.execution_kind !== 'handler_ref') assert.fail();
    assert.equal(replay.standard_agent_action_run.output.sha256, run.output.sha256);
    assert.deepEqual(replay.standard_agent_action_run.result, run.result);
    assert.equal(handlerCalls, 1);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('completed managed Handler replay survives package replacement from durable exact bytes', async () => {
  const checkoutV1 = root('opl-action-completed-replay-v1-');
  const checkoutV2 = root('opl-action-completed-replay-v2-');
  const workspaceRoot = root('opl-action-completed-replay-workspace-');
  let activeCheckout = checkoutV1;
  let activeVersion = 'v1';
  let resolverCalls = 0;
  let handlerCalls = 0;
  try {
    for (const checkoutRoot of [checkoutV1, checkoutV2]) {
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
    }
    fs.writeFileSync(path.join(checkoutV1, 'handler.ts'), [
      'export function evaluate(request: Record<string, unknown>) {',
      '  return { accepted: true, value: Number(request.value) };',
      '}',
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(checkoutV2, 'handler.ts'), [
      'export function evaluate(request: Record<string, unknown>) {',
      '  return { accepted: true, value: Number(request.value) + 100 };',
      '}',
      '',
    ].join('\n'));
    const dependencies = {
      resolveManagedCheckout: (async () => {
        resolverCalls += 1;
        const resolved = await managed(activeCheckout, workspaceRoot)();
        const useBoundaryId = `package-use:${activeVersion}`;
        return {
          ...resolved,
          package_use_binding: { use_boundary_id: useBoundaryId },
          use_boundary_id: useBoundaryId,
        };
      }) as never,
      recordLedger,
      runHandler: (input: Parameters<typeof runStandardAgentHandlerSandbox>[0]) => {
        handlerCalls += 1;
        return runStandardAgentHandlerSandbox(input);
      },
    };
    const request = {
      domainId: 'mas',
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 7 },
      runId: 'completed-managed-handler',
    };
    const first = await runStandardAgentAction(request, dependencies);
    activeCheckout = checkoutV2;
    activeVersion = 'v2';
    fs.rmSync(checkoutV1, { recursive: true, force: true });

    const replay = await runStandardAgentAction(
      { ...request, domainId: 'medautoscience' },
      dependencies,
    );
    const later = await runStandardAgentAction(
      { ...request, runId: 'new-managed-handler' },
      dependencies,
    );
    const firstRun = first.standard_agent_action_run;
    const replayRun = replay.standard_agent_action_run;
    const laterRun = later.standard_agent_action_run;
    assert.equal(firstRun.execution_kind, 'handler_ref');
    assert.equal(replayRun.execution_kind, 'handler_ref');
    assert.equal(laterRun.execution_kind, 'handler_ref');
    if (
      firstRun.execution_kind !== 'handler_ref'
      || replayRun.execution_kind !== 'handler_ref'
      || laterRun.execution_kind !== 'handler_ref'
    ) assert.fail('expected Handler-bound action results');
    assert.deepEqual(firstRun.result, { accepted: true, value: 7 });
    assert.deepEqual(replayRun.result, { accepted: true, value: 7 });
    assert.deepEqual(laterRun.result, { accepted: true, value: 107 });
    assert.deepEqual(replayRun.package_use_binding, {
      use_boundary_id: 'package-use:v1',
    });
    assert.deepEqual(laterRun.package_use_binding, {
      use_boundary_id: 'package-use:v2',
    });
    assert.equal(resolverCalls, 2);
    assert.equal(handlerCalls, 2);

    await assert.rejects(
      runStandardAgentAction({ ...request, payload: { value: 8 } }, dependencies),
      /payload conflicts with the original request/i,
    );
    assert.equal(resolverCalls, 2);
    assert.equal(handlerCalls, 2);

    fs.writeFileSync(firstRun.request.file_path, '{"value":999}\n');
    await assert.rejects(
      runStandardAgentAction(request, dependencies),
      /completion does not match the persisted request or output bytes/i,
    );
    assert.equal(resolverCalls, 2);
    assert.equal(handlerCalls, 2);
  } finally {
    fs.rmSync(checkoutV1, { recursive: true, force: true });
    fs.rmSync(checkoutV2, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('corrupted durable binding fails before runtime resolution or handler execution', async () => {
  const checkoutRoot = root('opl-action-corrupt-binding-checkout-');
  const workspaceRoot = root('opl-action-corrupt-binding-workspace-');
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
    fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
      'export function evaluate(request: Record<string, unknown>) {',
      '  return { accepted: true, value: request.value };',
      '}',
      '',
    ].join('\n'));
    const dependencies = {
      resolveManagedCheckout: (async () => {
        resolverCalls += 1;
        return await managed(checkoutRoot, workspaceRoot)();
      }) as never,
      runHandler: (input: Parameters<typeof runStandardAgentHandlerSandbox>[0]) => {
        handlerCalls += 1;
        return runStandardAgentHandlerSandbox(input);
      },
      recordLedger,
    };
    const request = {
      domainId: 'mas',
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 13 },
      runId: 'corrupt-binding-run',
    };
    await runStandardAgentAction(request, dependencies);
    assert.equal(resolverCalls, 1);
    assert.equal(handlerCalls, 1);

    fs.writeFileSync(
      path.join(workspaceRoot, 'control', 'opl', 'action_run_state', request.runId, 'binding.json'),
      '{"surface_kind":"opl_standard_agent_action_run_binding","version":"corrupt"}\n',
    );
    await assert.rejects(
      runStandardAgentAction(request, dependencies),
      /action run binding (?:is invalid|must contain)/i,
    );
    assert.equal(resolverCalls, 1);
    assert.equal(handlerCalls, 1);
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
    const workspaceLocatorIndex = calls[0].indexOf('--workspace-locator');
    const runtimeWorkspaceLocator = JSON.parse(calls[0][workspaceLocatorIndex + 1]) as Record<string, unknown>;
    assert.deepEqual(runtimeWorkspaceLocator.package_use_binding, { use_boundary_id: 'package-use:fixture' });
    assert.equal(runtimeWorkspaceLocator.domain_pack_root, fs.realpathSync.native(checkoutRoot));
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
  let currentBindingResolutions = 0;
  let pinnedBindingResolutions = 0;
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
    const v1Snapshot = hostedSnapshot({ checkoutRoot, workspaceRoot, label: 'stage-v1' });
    const v2Snapshot = hostedSnapshot({ checkoutRoot, workspaceRoot, label: 'stage-v2' });
    let activeSnapshot = v1Snapshot;
    const snapshots = new Map([
      [v1Snapshot.provenance_ref, v1Snapshot],
      [v2Snapshot.provenance_ref, v2Snapshot],
    ]);
    const dependencies = {
      resolveRuntimeBinding: async () => {
        currentBindingResolutions += 1;
        return activeSnapshot;
      },
      resolvePinnedRuntimeBinding: async (
        input: Parameters<HostedAgentRuntimeBindingResolver['resolvePinned']>[0],
      ) => {
        pinnedBindingResolutions += 1;
        return snapshots.get(input.provenance_ref)
          ?? assert.fail(`missing pinned snapshot ${input.provenance_ref}`);
      },
      compileStageManifest: (() => ({})) as never,
      recordLedger,
      runStageRuntime,
    };

    const first = await runStandardAgentAction({
      domainId: 'mas', actionId: 'launch', workspaceRoot, payload: { value: 11 }, runId: 'hosted-one',
    }, dependencies);
    activeSnapshot = v2Snapshot;
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
    assert.equal(firstRun.hosted_runtime_binding_ref, v1Snapshot.provenance_ref);
    assert.equal(replayRun.hosted_runtime_binding_ref, v1Snapshot.provenance_ref);
    assert.equal(laterRun.hosted_runtime_binding_ref, v2Snapshot.provenance_ref);
    assert.equal(stageRuntimeCreateCalls, 2);
    assert.deepEqual(startedWorkflowIds.length, 2);
    assert.equal(new Set(startedWorkflowIds).size, 2);
    assert.equal(currentBindingResolutions, 2);
    assert.equal(pinnedBindingResolutions, 1);
  } finally {
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
  let attemptCalls = 0;
  let queryCalls = 0;
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
          attemptCalls += 1;
          return {
            family_runtime_stage_run: {
              stage_run_input: { workflow_id: 'wf-stage-query-unavailable' },
              blocked_reason: null,
              temporal_start: { start_status: 'started' },
            },
          };
        }
        queryCalls += 1;
        throw new Error('temporal query temporarily unavailable');
      },
    });
    const replay = await runStandardAgentAction({
      domainId: 'mas',
      actionId: 'launch',
      workspaceRoot,
      payload: { value: 3 },
      runId: 'stage-query-unavailable',
    }, {
      resolveManagedCheckout: managed(checkoutRoot, workspaceRoot) as never,
      compileStageManifest: (() => ({})) as never,
      recordLedger,
      runStageRuntime: async () => assert.fail('completed launch replay must not reach Stage runtime'),
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
    assert.equal(replay.standard_agent_action_run.output.sha256, run.output.sha256);
    assert.equal(attemptCalls, 1);
    assert.equal(queryCalls, 1);
    const completion = inspectStandardAgentActionRunCompletion({
      workspaceRoot,
      runId: 'stage-query-unavailable',
    });
    assert.equal(completion?.status, 'started');
    assert.equal(completion?.failure_disposition, null);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('Hosted Stage unknown-success retry reuses the frozen launch identity without persisting failure', async () => {
  const checkoutRoot = root('opl-stage-action-unknown-success-checkout-');
  const workspaceRoot = root('opl-stage-action-unknown-success-workspace-');
  const invocationIds: string[] = [];
  let attemptCalls = 0;
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
    const dependencies = {
      resolveManagedCheckout: managed(checkoutRoot, workspaceRoot) as never,
      compileStageManifest: (() => ({})) as never,
      recordLedger,
      runStageRuntime: async (args: string[]) => {
        if (args[0] === 'attempt') {
          attemptCalls += 1;
          const invocationIndex = args.indexOf('--stage-run-invocation-id');
          invocationIds.push(args[invocationIndex + 1]);
          if (attemptCalls === 1) throw new Error('launch response timed out after acceptance');
          return {
            family_runtime_stage_run: {
              stage_run_input: { workflow_id: 'wf-stage-unknown-success' },
              blocked_reason: null,
              temporal_start: { start_status: 'reconciled' },
            },
          };
        }
        return { family_runtime_stage_run_query: { status: 'running' } };
      },
    };
    const request = {
      domainId: 'mas',
      actionId: 'launch',
      workspaceRoot,
      payload: { value: 17 },
      runId: 'stage-unknown-success',
    };
    await assert.rejects(
      runStandardAgentAction(request, dependencies),
      (error: unknown) => {
        const details = (error as { details?: Record<string, unknown> }).details;
        assert.equal(details?.failure_disposition, 'unknown_success');
        assert.equal(details?.same_run_retry_required, true);
        return true;
      },
    );
    assert.equal(
      inspectStandardAgentActionRunCompletion({ workspaceRoot, runId: request.runId }),
      null,
    );

    const retried = await runStandardAgentAction(request, dependencies);
    const run = retried.standard_agent_action_run;
    assert.equal(run.execution_kind, 'stage_binding');
    if (run.execution_kind !== 'stage_binding') assert.fail();
    assert.equal(run.status, 'started');
    assert.equal(attemptCalls, 2);
    assert.equal(invocationIds.length, 2);
    assert.equal(invocationIds[1], invocationIds[0]);
    const completion = inspectStandardAgentActionRunCompletion({
      workspaceRoot,
      runId: request.runId,
    });
    assert.equal(completion?.status, 'started');
    assert.equal(completion?.failure_disposition, null);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('Hosted Foundry action starts one OPL-owned FoundryRun and replays immutable launch bytes', async () => {
  const checkoutRoot = root('opl-foundry-action-checkout-');
  const workspaceRoot = root('opl-foundry-action-workspace-');
  let starts = 0;
  let currentBindingResolutions = 0;
  let pinnedBindingResolutions = 0;
  try {
    const foundryAction = {
      ...action({
        actionId: 'engineer-agent',
        executionBinding: { kind: 'foundry_binding', provider_manifest_ref: 'contracts/foundry_provider.json' },
      }),
      effect: 'mutating',
      input_schema_ref: 'opl://foundry-protocol/DesignRequest',
      output_schema_ref: 'opl://foundry-control/FoundryRun',
      required_fields: [
        'surface_kind', 'version', 'request_id', 'mode', 'target_agent_id', 'target_domain_id',
        'target_version_ref', 'objective', 'acceptance_criteria', 'non_goals', 'source_refs', 'constraints',
        'delivery_policy',
      ],
      workspace_locator_fields: [],
    };
    writeContracts(checkoutRoot, [foundryAction]);
    fs.writeFileSync(path.join(checkoutRoot, 'contracts', 'foundry_provider.json'), `${JSON.stringify({
      surface_kind: 'opl_foundry_provider',
      version: 'opl-foundry-provider.v1',
      provider_id: 'fixture-provider',
      agent_id: 'fixture-provider',
      package_id: 'fixture-provider',
      domain_id: 'agent_engineering',
      carrier_slug: 'fixture-provider',
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
        public_action_ids: ['engineer-agent'],
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
    })}\n`);
    const payload = {
      surface_kind: 'opl_foundry_design_request',
      version: 'opl-foundry-protocol.v1',
      request_id: 'request:hosted-foundry',
      mode: 'create',
      target_agent_id: 'fixture-target',
      target_domain_id: 'fixture-domain',
      target_version_ref: null,
      objective: 'Build a tested fixture Agent.',
      acceptance_criteria: ['The required gate passes.'],
      non_goals: ['No production activation without policy.'],
      source_refs: ['source:fixture'],
      constraints: {
        capability_refs: ['capability:text'],
        permission_refs: [],
        privacy_requirements: ['privacy:no-sensitive-data'],
        cost_limits: { usd: 1 },
        latency_limits: { milliseconds: 1000 },
      },
      delivery_policy: { activation_mode: 'activate', max_generations: 5 },
    };
    const v1Snapshot = hostedSnapshot({ checkoutRoot, workspaceRoot, label: 'foundry-v1' });
    const v2Snapshot = hostedSnapshot({ checkoutRoot, workspaceRoot, label: 'foundry-v2' });
    let activeSnapshot = v1Snapshot;
    const snapshots = new Map([
      [v1Snapshot.provenance_ref, v1Snapshot],
      [v2Snapshot.provenance_ref, v2Snapshot],
    ]);
    const dependencies = {
      resolveRuntimeBinding: async () => {
        currentBindingResolutions += 1;
        return activeSnapshot;
      },
      resolvePinnedRuntimeBinding: async (
        input: Parameters<HostedAgentRuntimeBindingResolver['resolvePinned']>[0],
      ) => {
        pinnedBindingResolutions += 1;
        return snapshots.get(input.provenance_ref)
          ?? assert.fail(`missing pinned snapshot ${input.provenance_ref}`);
      },
      recordLedger,
      startFoundryRun: async ({ run_id }: { run_id: string }) => {
        starts += 1;
        return {
          run: {
            surface_kind: 'opl_foundry_run',
            version: 'opl-foundry-run.v1',
            run_id,
            state: 'accepted',
            revision: 1,
          },
          activation: { active_version_digest: null, revision: 0 },
        };
      },
    };
    const first = await runStandardAgentAction({
      domainId: 'mas', actionId: 'engineer-agent', workspaceRoot, payload, runId: 'foundry-hosted-run',
    }, dependencies as never);
    activeSnapshot = v2Snapshot;
    const replay = await runStandardAgentAction({
      domainId: 'mas', actionId: 'engineer-agent', workspaceRoot, payload, runId: 'foundry-hosted-run',
    }, dependencies as never);
    assert.equal(first.standard_agent_action_run.execution_kind, 'foundry_binding');
    assert.equal(first.standard_agent_action_run.status, 'started');
    assert.equal(
      first.standard_agent_action_run.authority_boundary.provider_role,
      'agent_design_evaluation_semantics_evidence_diagnosis_and_evolution_proposal',
    );
    assert.equal('oma_role' in first.standard_agent_action_run.authority_boundary, false);
    assert.equal(replay.standard_agent_action_run.output.sha256, first.standard_agent_action_run.output.sha256);
    assert.equal(first.standard_agent_action_run.hosted_runtime_binding_ref, v1Snapshot.provenance_ref);
    assert.equal(replay.standard_agent_action_run.hosted_runtime_binding_ref, v1Snapshot.provenance_ref);
    assert.equal(starts, 1);
    assert.equal(currentBindingResolutions, 1);
    assert.equal(pinnedBindingResolutions, 1);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
