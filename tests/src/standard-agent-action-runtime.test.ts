import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveStandardAgent } from '../../src/kernel/standard-agent-registry.ts';
import { runStandardAgentAction } from '../../src/modules/runway/standard-agent-action-runtime.ts';

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
    assert.deepEqual(run.temporal_stage_run_query, {
      family_runtime_stage_run_query: { status: 'running' },
    });
    assert.equal(run.temporal_stage_run_query_error, null);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
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
