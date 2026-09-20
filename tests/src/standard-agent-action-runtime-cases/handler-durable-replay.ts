import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonBytes } from '../../../src/kernel/canonical-json.ts';
import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';
import {
  inspectStandardAgentActionRunBinding,
  inspectStandardAgentActionRunCompletion,
  inspectStandardAgentActionRunPlan,
  reserveStandardAgentActionRunBinding,
} from '../../../src/adapters/execution/standard-agent-action-run-state.ts';
import { runStandardAgentAction } from '../../../src/adapters/execution/standard-agent-action-runtime.ts';
import { runStandardAgentHandlerSandbox } from '../../../src/adapters/execution/standard-agent-handler-sandbox.ts';

import { action, hostedSnapshot, managed, recordLedger, root, sha256, writeContracts } from '../standard-agent-action-runtime-shared.ts';

for (const failure of ['handler', 'schema', 'materialization', 'unknown-success'] as const) {
  test(`Handler ${failure} preserves completion identity and resumes without re-execution`, async () => {
    const checkoutRoot = root('opl-handler-failure-checkout-');
    const workspaceRoot = root('opl-handler-failure-workspace-');
    let handlerCalls = 0;
    let materializationCalls = 0;
    try {
      writeContracts(checkoutRoot, [action({
        actionId: 'evaluate',
        executionBinding: { kind: 'handler_ref', handler_ref: 'handler:fixture.evaluate' },
      })], {
        surface_kind: 'domain_handler_registry', version: 'domain-handler-registry.v1',
        handlers: [{
          handler_id: 'fixture.evaluate',
          binding: { kind: 'typescript_export', file: 'handler.ts', export: 'evaluate' },
        }],
      });
      fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), 'export function evaluate() {}\n');
      const output = failure === 'schema' ? { accepted: 'invalid' } : { accepted: true, value: 7 };
      const dependencies = {
        resolveManagedCheckout: managed(checkoutRoot, workspaceRoot) as never,
        recordLedger,
        runHandler: () => {
          handlerCalls += 1;
          if (failure === 'handler') throw new Error('fixture handler failure');
          return {
            runtime_kind: 'node_permission_model' as const, sandbox_kind: 'macos_sandbox_exec' as const,
            exit_code: 0, timed_out: false, output, stdout_bytes: canonicalJsonBytes(output), stderr: '',
          };
        },
        applyDomainArtifactCas: () => {
          materializationCalls += 1;
          if (failure === 'materialization') throw new FrameworkContractError('contract_shape_invalid', 'fixture CAS failure');
          if (failure === 'unknown-success' && materializationCalls === 1) throw new Error('fixture interrupted CAS');
          return null;
        },
      };
      const request = { domainId: 'mas', actionId: 'evaluate', workspaceRoot, payload: { value: 7 }, runId: failure };
      await assert.rejects(runStandardAgentAction(request, dependencies));
      const completionPath = path.join(workspaceRoot, 'control/opl/action_run_state', failure, 'completion.json');
      const completion = inspectStandardAgentActionRunCompletion({ workspaceRoot, runId: failure });
      if (failure === 'unknown-success') {
        assert.equal(completion, null);
        const resumed = await runStandardAgentAction(request, dependencies);
        assert.equal(resumed.standard_agent_action_run.status, 'completed');
        if (resumed.standard_agent_action_run.execution_kind !== 'handler_ref') assert.fail('expected Handler recovery');
        assert.deepEqual(resumed.standard_agent_action_run.result, output);
        assert.equal(inspectStandardAgentActionRunCompletion({ workspaceRoot, runId: failure })?.output_sha256, sha256(canonicalJsonBytes(output)).slice('sha256:'.length));
      } else {
        assert.equal(completion?.status, 'failed');
        assert.equal(completion?.failure_disposition, 'permanent');
        assert.equal(completion?.run_id, failure);
        assert.equal(completion?.action_id, 'evaluate');
        assert.equal(completion?.sandbox === null, failure === 'handler');
        if (failure !== 'handler') assert.equal(completion?.output_sha256, sha256(canonicalJsonBytes(output)).slice('sha256:'.length));
        const completionBytes = fs.readFileSync(completionPath);
        fs.unlinkSync(completionPath);
        await assert.rejects(runStandardAgentAction(request, dependencies));
        assert.deepEqual(fs.readFileSync(completionPath), completionBytes);
      }
      assert.equal(handlerCalls, 1);
    } finally {
      fs.rmSync(checkoutRoot, { recursive: true, force: true });
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
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
    const durableBinding = inspectStandardAgentActionRunBinding({
      workspaceRoot,
      runId: 'handler-run',
    });
    assert.deepEqual(durableBinding?.hosted_runtime_binding, run.hosted_runtime_binding);
    if (durableBinding?.hosted_runtime_binding.source_kind !== 'installed_native_carrier') assert.fail();
    assert.equal(durableBinding.hosted_runtime_binding.package_id, 'mas');
    assert.equal(durableBinding.hosted_runtime_binding.package_version, '0.2.25');
    assert.equal(durableBinding.hosted_runtime_binding.plugin_selector, 'med-autoscience@med-autoscience');
    assert.equal(durableBinding.hosted_runtime_binding.plugin_source_path, fs.realpathSync.native(checkoutRoot));
    assert.match(durableBinding.hosted_runtime_binding.owner_manifest_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(durableBinding.hosted_runtime_binding.source_tree_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.match(durableBinding.hosted_runtime_binding.action_contracts_sha256, /^sha256:[a-f0-9]{64}$/);
    assert.equal(run.package_use_binding, null);
    assert.equal(inspectStandardAgentActionRunPlan({ workspaceRoot, runId: 'handler-run' })?.package_use_binding, null);
    assert.equal(handlerCalls, 1);
    await assert.rejects(
      runStandardAgentAction({
        domainId: 'mas',
        actionId: 'evaluate',
        workspaceRoot,
        payload: { value: 7 },
        runId: 'handler-run',
        timeoutMs: 1_000,
      }, dependencies),
      /timeout conflicts with its frozen run plan/i,
    );
    assert.equal(handlerCalls, 1);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('completed native Handler replay survives carrier replacement from durable exact bytes', async () => {
  const checkoutV1 = root('opl-action-completed-replay-v1-');
  const checkoutV2 = root('opl-action-completed-replay-v2-');
  const workspaceRoot = root('opl-action-completed-replay-workspace-');
  let activeCheckout = checkoutV1;
  let activeVersion = '0.2.25';
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
        return await managed(activeCheckout, workspaceRoot, {
          package_version: activeVersion,
          carrier_installed_version: `${activeVersion}-${activeVersion === '0.2.25' ? 'a' : 'b'}`.padEnd(
            activeVersion.length + 65,
            activeVersion === '0.2.25' ? 'a' : 'b',
          ),
          source_tree_sha256: sha256(`native-tree:${activeVersion}`),
        })();
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
    activeVersion = '0.2.26';
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
    assert.equal(replayRun.package_use_binding, null);
    assert.equal(laterRun.package_use_binding, null);
    if (firstRun.hosted_runtime_binding.source_kind !== 'installed_native_carrier') assert.fail();
    if (laterRun.hosted_runtime_binding.source_kind !== 'installed_native_carrier') assert.fail();
    assert.equal(firstRun.hosted_runtime_binding.package_version, '0.2.25');
    assert.equal(laterRun.hosted_runtime_binding.package_version, '0.2.26');
    assert.equal(resolverCalls, 2);
    assert.equal(handlerCalls, 2);

    await assert.rejects(
      runStandardAgentAction({ ...request, payload: { value: 8 } }, dependencies),
      /payload conflicts with (?:the original request|its frozen run plan)/i,
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

    const bindingPath = path.join(
      workspaceRoot,
      'control',
      'opl',
      'action_run_state',
      request.runId,
      'binding.json',
    );
    const originalBinding = fs.readFileSync(bindingPath);
    fs.writeFileSync(
      bindingPath,
      '{"surface_kind":"opl_standard_agent_action_run_binding","version":"corrupt"}\n',
    );
    await assert.rejects(
      runStandardAgentAction(request, dependencies),
      /action run binding (?:is invalid|must contain)/i,
    );
    assert.equal(resolverCalls, 1);
    assert.equal(handlerCalls, 1);

    const bindingCopy = path.join(workspaceRoot, 'binding-copy.json');
    fs.writeFileSync(bindingCopy, originalBinding);
    fs.rmSync(bindingPath);
    fs.symlinkSync(bindingCopy, bindingPath);
    await assert.rejects(
      runStandardAgentAction(request, dependencies),
      /binding must be a physical file/i,
    );
    assert.equal(resolverCalls, 1);
    assert.equal(handlerCalls, 1);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('completion identity, schema, shape, and physical-file tampering fail before replay', async () => {
  const checkoutRoot = root('opl-action-completion-tamper-checkout-');
  const workspaceRoot = root('opl-action-completion-tamper-workspace-');
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
      runHandler: (input: Parameters<typeof runStandardAgentHandlerSandbox>[0]) => {
        handlerCalls += 1;
        return runStandardAgentHandlerSandbox(input);
      },
      recordLedger,
    };
    const request = {
      domainId: 'mas', actionId: 'evaluate', workspaceRoot, payload: { value: 17 }, runId: 'completion-tamper',
    };
    await runStandardAgentAction(request, dependencies);
    const completionPath = path.join(
      workspaceRoot,
      'control',
      'opl',
      'action_run_state',
      request.runId,
      'completion.json',
    );
    const original = JSON.parse(fs.readFileSync(completionPath, 'utf8')) as Record<string, any>;
    const cases = [
      { ...original, canonical_domain_id: ' ' },
      { ...original, action_id: ' ' },
      { ...original, binding_ref: ' ' },
      { ...original, status: 'started' },
      {
        ...original,
        execution_kind: 'stage_binding',
        status: 'completed',
        sandbox: null,
        completed_handler_replay: null,
      },
      { ...original, sandbox: { ...original.sandbox, exit_code: 1 } },
      { ...original, sandbox: { ...original.sandbox, timed_out: true } },
      { ...original, error: { error_code: 'bad', message: 'bad', details: {} } },
      { ...original, sandbox: { ...original.sandbox, unexpected: true } },
      {
        ...original,
        completed_handler_replay: {
          ...original.completed_handler_replay,
          output_schema_validation: {
            ...original.completed_handler_replay.output_schema_validation,
            schema_ref: 'contracts/input.schema.json',
          },
        },
      },
    ];
    for (const tampered of cases) {
      fs.writeFileSync(completionPath, canonicalJsonBytes(tampered));
      await assert.rejects(runStandardAgentAction(request, dependencies));
      fs.writeFileSync(completionPath, canonicalJsonBytes(original));
    }
    const physicalCopy = path.join(workspaceRoot, 'completion-copy.json');
    fs.writeFileSync(physicalCopy, canonicalJsonBytes(original));
    fs.rmSync(completionPath);
    fs.symlinkSync(physicalCopy, completionPath);
    await assert.rejects(
      runStandardAgentAction(request, dependencies),
      /completion must be a physical file/i,
    );
    assert.equal(handlerCalls, 1);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('durable action plan tampering and coherent shape forgery fail before G2 resolution', async () => {
  const checkoutRoot = root('opl-action-plan-tamper-checkout-');
  const workspaceRoot = root('opl-action-plan-tamper-workspace-');
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
    const request = (runId: string) => ({
      domainId: 'mas',
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 29 },
      runId,
    });

    await runStandardAgentAction(request('plan-hash-tamper'), dependencies);
    const hashState = path.join(
      workspaceRoot,
      'control',
      'opl',
      'action_run_state',
      'plan-hash-tamper',
    );
    const hashPlan = JSON.parse(fs.readFileSync(path.join(hashState, 'plan.json'), 'utf8'));
    hashPlan.started_at = '2099-01-01T00:00:00.000Z';
    fs.writeFileSync(path.join(hashState, 'plan.json'), canonicalJsonBytes(hashPlan));
    await assert.rejects(
      runStandardAgentAction(request('plan-hash-tamper'), dependencies),
      /plan conflicts with its frozen binding/i,
    );

    await runStandardAgentAction(request('plan-shape-forgery'), dependencies);
    const forgedState = path.join(
      workspaceRoot,
      'control',
      'opl',
      'action_run_state',
      'plan-shape-forgery',
    );
    const forgedPlan = JSON.parse(fs.readFileSync(path.join(forgedState, 'plan.json'), 'utf8'));
    const forgedBinding = JSON.parse(fs.readFileSync(path.join(forgedState, 'binding.json'), 'utf8'));
    forgedPlan.execution_kind = 'stage_binding';
    const forgedPlanBytes = canonicalJsonBytes(forgedPlan);
    forgedBinding.plan_sha256 = crypto.createHash('sha256').update(forgedPlanBytes).digest('hex');
    forgedBinding.plan_byte_size = forgedPlanBytes.byteLength;
    fs.writeFileSync(path.join(forgedState, 'plan.json'), forgedPlanBytes);
    fs.writeFileSync(path.join(forgedState, 'binding.json'), canonicalJsonBytes(forgedBinding));
    await assert.rejects(
      runStandardAgentAction(request('plan-shape-forgery'), dependencies),
      /does not contain its selected execution binding/i,
    );

    await runStandardAgentAction(request('plan-catalog-actions-forgery'), dependencies);
    const catalogState = path.join(
      workspaceRoot,
      'control',
      'opl',
      'action_run_state',
      'plan-catalog-actions-forgery',
    );
    const catalogPlan = JSON.parse(fs.readFileSync(path.join(catalogState, 'plan.json'), 'utf8'));
    const catalogBinding = JSON.parse(fs.readFileSync(path.join(catalogState, 'binding.json'), 'utf8'));
    catalogPlan.catalog.actions = {};
    const catalogPlanBytes = canonicalJsonBytes(catalogPlan);
    catalogBinding.plan_sha256 = crypto.createHash('sha256').update(catalogPlanBytes).digest('hex');
    catalogBinding.plan_byte_size = catalogPlanBytes.byteLength;
    fs.writeFileSync(path.join(catalogState, 'plan.json'), catalogPlanBytes);
    fs.writeFileSync(path.join(catalogState, 'binding.json'), canonicalJsonBytes(catalogBinding));
    await assert.rejects(
      runStandardAgentAction(request('plan-catalog-actions-forgery'), dependencies),
      /catalog is invalid/i,
    );

    await runStandardAgentAction(request('plan-symlink'), dependencies);
    const symlinkState = path.join(
      workspaceRoot,
      'control',
      'opl',
      'action_run_state',
      'plan-symlink',
    );
    const planPath = path.join(symlinkState, 'plan.json');
    const planCopy = path.join(workspaceRoot, 'plan-copy.json');
    fs.writeFileSync(planCopy, fs.readFileSync(planPath));
    fs.rmSync(planPath);
    fs.symlinkSync(planCopy, planPath);
    await assert.rejects(
      runStandardAgentAction(request('plan-symlink'), dependencies),
      /plan must be a physical file/i,
    );
    assert.equal(resolverCalls, 4);
    assert.equal(handlerCalls, 4);
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('v1 native carrier binding remains readable without an unbound v2 plan', () => {
  const checkoutRoot = root('opl-action-v1-binding-checkout-');
  const workspaceRoot = root('opl-action-v1-binding-workspace-');
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
    const snapshot = hostedSnapshot({ checkoutRoot, workspaceRoot, label: 'native-v1' });
    const binding = {
      surface_kind: 'opl_standard_agent_action_run_binding' as const,
      version: 'opl-standard-agent-action-run-binding.v1' as const,
      run_id: 'native-v1-run',
      canonical_domain_id: 'mas',
      action_id: 'evaluate',
      hosted_runtime_binding_ref: snapshot.provenance_ref,
      hosted_runtime_binding: snapshot.provenance,
    };
    const reserved = reserveStandardAgentActionRunBinding({ workspaceRoot, binding });
    assert.equal(reserved.status, 'reserved');
    assert.deepEqual(inspectStandardAgentActionRunBinding({
      workspaceRoot,
      runId: binding.run_id,
    }), binding);
    assert.equal(inspectStandardAgentActionRunPlan({ workspaceRoot, runId: binding.run_id }), null);
    assert.equal(
      reserveStandardAgentActionRunBinding({ workspaceRoot, binding }).status,
      'existing',
    );
  } finally {
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});
