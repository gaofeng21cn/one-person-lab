import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import { resolveStandardAgent } from '../../src/kernel/standard-agent-registry.ts';
import {
  foundryContentDigest,
  type AgentVersion,
  type MaterializedCandidate,
  type VersionRegistry,
} from '../../src/modules/foundry/index.ts';
import type { ActivationRuntimeBindingVerification } from '../../src/modules/foundry/ports.ts';
import { foundryStoragePaths, LedgerVersionRegistry } from '../../src/modules/ledger/index.ts';
import { HostedFoundryActivationRuntime } from '../../src/modules/runway/foundry-activation-runtime.ts';
import { DefaultHostedAgentRuntimeBindingResolver } from '../../src/modules/runway/hosted-agent-runtime-binding.ts';
import { runStandardAgentAction } from '../../src/modules/runway/standard-agent-action-runtime.ts';
import { runStandardAgentHandlerSandbox } from '../../src/modules/runway/standard-agent-handler-sandbox.ts';

function root(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sha256(bytes: string | Buffer) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

function actionDescriptor(handlerRef: string) {
  return {
    action_id: 'evaluate',
    title: 'evaluate',
    summary: 'Evaluate one fixture input.',
    owner: 'generated-fixture-owner',
    effect: 'read_only',
    execution_binding: { kind: 'handler_ref', handler_ref: handlerRef },
    input_schema_ref: 'contracts/input.schema.json',
    output_schema_ref: 'contracts/output.schema.json',
    required_fields: ['workspace_root', 'value'],
    optional_fields: [],
    workspace_locator_fields: ['workspace_root'],
    human_gate_ids: [],
    supported_surfaces: {
      cli: {},
      mcp: null,
      skill: null,
      product_entry: null,
      openai: null,
      ai_sdk: null,
    },
    authority_boundary: {},
  };
}

function actionCatalog(input: {
  targetDomainId: string;
  handlerRef: string;
  catalogVersion?: string;
}) {
  return {
    surface_kind: 'family_action_catalog',
    version: input.catalogVersion ?? 'family-action-catalog.v2',
    catalog_id: 'generated-fixture-actions',
    target_domain_id: input.targetDomainId,
    owner: 'generated-fixture-owner',
    authority_boundary: {
      domain_truth_owner: 'generated-fixture-owner',
      opl_role: 'projection_consumer_only',
      write_policy: 'no_domain_truth_writes',
      opl_can_write_domain_truth: false,
      opl_can_write_memory_body: false,
      opl_can_mutate_domain_artifact_body: false,
      opl_can_authorize_quality_or_export: false,
      provider_completion_is_domain_completion: false,
    },
    actions: [actionDescriptor(input.handlerRef)],
    notes: [],
  };
}

function inputSchema(label: string) {
  return {
    $id: `https://fixture.local/${label}/input.schema.json`,
    type: 'object',
    required: ['workspace_root', 'value'],
    properties: {
      workspace_root: { type: 'string', minLength: 1 },
      value: { type: 'integer' },
    },
    additionalProperties: false,
  };
}

function outputSchema(label: string, includeCandidateLabel: boolean) {
  return {
    $id: `https://fixture.local/${label}/output.schema.json`,
    type: 'object',
    required: includeCandidateLabel ? ['accepted', 'value', 'candidate_label'] : ['accepted', 'value'],
    properties: {
      accepted: { const: true },
      value: { type: 'integer' },
      ...(includeCandidateLabel ? { candidate_label: { const: label } } : {}),
    },
    additionalProperties: false,
  };
}

function handlerRegistry(handlerId: string) {
  return {
    surface_kind: 'domain_handler_registry',
    version: 'domain-handler-registry.v1',
    handlers: [{
      handler_id: handlerId,
      binding: { kind: 'typescript_export', file: 'handler.ts', export: 'evaluate' },
    }],
  };
}

function writePackageCheckout(checkoutRoot: string) {
  fs.mkdirSync(path.join(checkoutRoot, 'contracts'), { recursive: true });
  fs.writeFileSync(
    path.join(checkoutRoot, 'contracts/action_catalog.json'),
    canonicalJsonBytes(actionCatalog({ targetDomainId: 'medautoscience', handlerRef: 'handler:fixture.evaluate' })),
  );
  fs.writeFileSync(
    path.join(checkoutRoot, 'contracts/domain_handler_registry.json'),
    canonicalJsonBytes(handlerRegistry('fixture.evaluate')),
  );
  fs.writeFileSync(path.join(checkoutRoot, 'contracts/input.schema.json'), canonicalJsonBytes(inputSchema('package')));
  fs.writeFileSync(
    path.join(checkoutRoot, 'contracts/output.schema.json'),
    canonicalJsonBytes(outputSchema('package', false)),
  );
  fs.writeFileSync(path.join(checkoutRoot, 'handler.ts'), [
    'export function evaluate(request: Record<string, unknown>) {',
    '  return { accepted: true, value: request.value };',
    '}',
    '',
  ].join('\n'));
}

function createHostedCandidate(input: {
  stateRoot: string;
  targetAgentId: string;
  targetDomainId: string;
  label: string;
  catalogTargetDomainId?: string;
  catalogVersion?: string;
}): MaterializedCandidate {
  const blueprint = {
    surface_kind: 'opl_foundry_agent_blueprint',
    version: 'opl-foundry-protocol.v1',
    blueprint_id: `blueprint:${input.targetAgentId}:${input.label}`,
    target_agent_id: input.targetAgentId,
    target_domain_id: input.targetDomainId,
    content_refs: {
      prompt_refs: [],
      skill_refs: [],
      knowledge_refs: [],
      helper_refs: [],
      model_refs: [],
      tool_refs: [],
      schema_refs: [],
    },
    fixture_label: input.label,
  };
  const blueprintDigest = foundryContentDigest(blueprint);
  const resourceLock = {
    surface_kind: 'opl_foundry_candidate_resource_lock',
    version: 'opl-foundry-candidate-resource-lock.v1',
    blueprint_digest: blueprintDigest,
    resources: [],
  };
  const agentPack = {
    surface_kind: 'opl_foundry_agent_pack',
    version: 'opl-foundry-agent-pack.v1',
    target_agent_id: input.targetAgentId,
    target_domain_id: input.targetDomainId,
    blueprint_digest: blueprintDigest,
    content_bindings: [],
    resource_lock: {
      ref: 'contracts/resource-lock.json',
      digest: foundryContentDigest(resourceLock),
    },
  };
  const plannedFiles = [
    { path: 'agent-blueprint.json', bytes: canonicalJsonBytes(blueprint) },
    { path: 'agent/agent-pack.json', bytes: canonicalJsonBytes(agentPack) },
    { path: 'contracts/resource-lock.json', bytes: canonicalJsonBytes(resourceLock) },
    {
      path: 'contracts/action_catalog.json',
      bytes: canonicalJsonBytes(actionCatalog({
        targetDomainId: input.catalogTargetDomainId ?? input.targetDomainId,
        handlerRef: 'handler:generated.evaluate',
        catalogVersion: input.catalogVersion,
      })),
    },
    {
      path: 'contracts/domain_handler_registry.json',
      bytes: canonicalJsonBytes(handlerRegistry('generated.evaluate')),
    },
    { path: 'contracts/input.schema.json', bytes: canonicalJsonBytes(inputSchema(input.label)) },
    {
      path: 'contracts/output.schema.json',
      bytes: canonicalJsonBytes(outputSchema(input.label, true)),
    },
    {
      path: 'handler.ts',
      bytes: Buffer.from([
        'export function evaluate(request: Record<string, unknown>) {',
        `  return { accepted: true, value: request.value, candidate_label: '${input.label}' };`,
        '}',
        '',
      ].join('\n')),
    },
  ].sort((left, right) => left.path.localeCompare(right.path));
  const files = plannedFiles.map((entry) => ({
    path: entry.path,
    sha256: sha256(entry.bytes).slice('sha256:'.length),
    byte_size: entry.bytes.byteLength,
  }));
  const indexBase = {
    surface_kind: 'opl_foundry_candidate_file_index',
    version: 'opl-foundry-candidate-index.v2',
    blueprint_digest: blueprintDigest,
    files,
  };
  const candidateDigest = foundryContentDigest(indexBase);
  const directory = path.join(foundryStoragePaths(input.stateRoot).candidates, candidateDigest.slice('sha256:'.length));
  fs.mkdirSync(directory, { recursive: true });
  for (const entry of plannedFiles) {
    const file = path.join(directory, entry.path);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, entry.bytes);
  }
  fs.writeFileSync(path.join(directory, 'candidate-index.json'), canonicalJsonBytes({
    ...indexBase,
    candidate_digest: candidateDigest,
  }));
  return {
    surface_kind: 'opl_foundry_materialized_candidate',
    target_agent_id: input.targetAgentId,
    target_domain_id: input.targetDomainId,
    blueprint_digest: blueprintDigest,
    candidate_digest: candidateDigest,
    candidate_ref: `opl://foundry/candidate/${candidateDigest}`,
    manifest_digest: foundryContentDigest(agentPack),
  };
}

async function registerCandidate(stateRoot: string, candidate: MaterializedCandidate, label: string) {
  const registry = new LedgerVersionRegistry(stateRoot);
  const registered = await registry.register({
    target_agent_id: candidate.target_agent_id,
    target_domain_id: candidate.target_domain_id,
    blueprint_digest: candidate.blueprint_digest,
    candidate,
    evidence_digest: sha256(`evidence:${label}`),
    risk_tier: 'low',
    qualified_at: `2026-07-17T00:00:0${label === 'v1' ? '1' : '2'}.000Z`,
  });
  return { registry, ...registered };
}

async function activationVerification(input: {
  stateRoot: string;
  workspaceRoot: string;
  version: AgentVersion;
  transactionKind: 'activate' | 'rollback';
  expectedRevision: number;
}): Promise<ActivationRuntimeBindingVerification> {
  const runtime = new HostedFoundryActivationRuntime({
    resolver: new DefaultHostedAgentRuntimeBindingResolver({ root_override: input.stateRoot }),
    candidate_directory: (candidateDigest) => path.join(
      foundryStoragePaths(input.stateRoot).candidates,
      candidateDigest.slice('sha256:'.length),
    ),
    workspace_root: input.workspaceRoot,
  });
  const preflight = await runtime.preflight({
    transaction_kind: input.transactionKind,
    version: input.version,
    expected_activation_revision: input.expectedRevision,
  });
  assert.ok(preflight.runtime_binding_ref);
  return {
    surface_kind: 'opl_foundry_activation_runtime_binding_verification',
    version: 'opl-foundry-activation-runtime-binding-verification.v1',
    verification_phase: 'pre_commit',
    transaction_kind: preflight.transaction_kind,
    target_agent_id: preflight.target_agent_id,
    target_domain_id: preflight.target_domain_id,
    version_id: preflight.version_id,
    version_digest: preflight.version_digest,
    candidate_digest: preflight.candidate_digest,
    candidate_ref: preflight.candidate_ref,
    expected_activation_revision: preflight.expected_activation_revision,
    preflight_ref: preflight.preflight_ref,
    runtime_binding_ref: preflight.runtime_binding_ref,
  };
}

function syntheticActivationVerification(input: {
  version: AgentVersion;
  transactionKind: 'activate' | 'rollback';
  expectedRevision: number;
  label: string;
}): ActivationRuntimeBindingVerification {
  return {
    surface_kind: 'opl_foundry_activation_runtime_binding_verification',
    version: 'opl-foundry-activation-runtime-binding-verification.v1',
    verification_phase: 'pre_commit',
    transaction_kind: input.transactionKind,
    target_agent_id: input.version.target_agent_id,
    target_domain_id: input.version.target_domain_id,
    version_id: input.version.version_id,
    version_digest: input.version.version_digest,
    candidate_digest: input.version.candidate_digest,
    candidate_ref: input.version.candidate_ref,
    expected_activation_revision: input.expectedRevision,
    preflight_ref: `opl://foundry/activation-runtime-preflights/${sha256(`preflight:${input.label}`)}`,
    runtime_binding_ref: `opl://foundry/prepared-runtime-bindings/${sha256(`binding:${input.label}`)}`,
  };
}

function recordLedger(input: Record<string, unknown>) {
  return {
    ledger_entry: { run_id: input.runId, status: input.status },
    recorded_event: { event_type: 'standard_agent_action_run_recorded' },
  } as never;
}

test('active candidate is frozen per invocation and later activation and rollback change the next binding', async () => {
  const stateRoot = root('opl-hosted-binding-state-');
  const workspaceRoot = root('opl-hosted-binding-workspace-');
  const targetAgentId = 'generated-fixture-agent';
  const targetDomainId = 'generated_fixture_domain';
  let packageFallbackCalls = 0;
  let handlerCalls = 0;
  const ledgerBindingRefs: string[] = [];
  try {
    const v1Candidate = createHostedCandidate({ stateRoot, targetAgentId, targetDomainId, label: 'v1' });
    const v2Candidate = createHostedCandidate({ stateRoot, targetAgentId, targetDomainId, label: 'v2' });
    const v1 = await registerCandidate(stateRoot, v1Candidate, 'v1');
    const v2 = await registerCandidate(stateRoot, v2Candidate, 'v2');
    const registry = v2.registry;
    const preflight = await new DefaultHostedAgentRuntimeBindingResolver({
      root_override: stateRoot,
    }).preflightFoundryCandidate({
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      version: v2.version,
      candidate_directory: path.join(
        foundryStoragePaths(stateRoot).candidates,
        v2Candidate.candidate_digest.slice('sha256:'.length),
      ),
      workspaceRoot,
    });
    assert.equal(preflight.status, 'ready');
    assert.equal(preflight.version_digest, v2.version.version_digest);
    assert.deepEqual(preflight.action_ids, ['evaluate']);
    assert.equal(preflight.package_use_binding.root_package.content_digest, v2Candidate.candidate_digest);
    assert.match(preflight.package_use_binding.dependency_closure_digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal((await registry.activation(targetAgentId, targetDomainId)).revision, 0);

    const v1ActivationVerification = await activationVerification({
      stateRoot,
      workspaceRoot,
      version: v1.version,
      transactionKind: 'activate',
      expectedRevision: 0,
    });
    const v2ActivationVerification = await activationVerification({
      stateRoot,
      workspaceRoot,
      version: v2.version,
      transactionKind: 'activate',
      expectedRevision: 1,
    });
    const rollbackVerification = await activationVerification({
      stateRoot,
      workspaceRoot,
      version: v1.version,
      transactionKind: 'rollback',
      expectedRevision: 2,
    });

    await registry.compareAndSwapActivation({
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      expected_revision: 0,
      version_digest: v1.version.version_digest,
      occurred_at: '2026-07-17T00:01:00.000Z',
      authority_receipt_ref: null,
      runtime_binding_verification: v1ActivationVerification,
    });
    let activationDuringFirstInvocation: ReturnType<LedgerVersionRegistry['compareAndSwapActivation']> | null = null;
    const dependencies = {
      foundryRootOverride: stateRoot,
      resolveManagedCheckout: (async () => {
        packageFallbackCalls += 1;
        throw new Error('active Foundry candidate must win over package fallback');
      }) as never,
      recordLedger: ((input: Record<string, unknown>) => {
        ledgerBindingRefs.push(String(input.bindingRef));
        return recordLedger(input);
      }) as never,
      runHandler: (args: Parameters<typeof runStandardAgentHandlerSandbox>[0]) => {
        handlerCalls += 1;
        if (!activationDuringFirstInvocation) {
          activationDuringFirstInvocation = registry.compareAndSwapActivation({
            target_agent_id: targetAgentId,
            target_domain_id: targetDomainId,
            expected_revision: 1,
            version_digest: v2.version.version_digest,
            occurred_at: '2026-07-17T00:02:00.000Z',
            authority_receipt_ref: null,
            runtime_binding_verification: v2ActivationVerification,
          });
        }
        return runStandardAgentHandlerSandbox(args);
      },
    };
    const first = await runStandardAgentAction({
      domainId: targetAgentId,
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 1 },
      runId: 'generated-v1-frozen',
    }, dependencies);
    await activationDuringFirstInvocation;
    const firstRun = first.standard_agent_action_run;
    assert.equal(firstRun.execution_kind, 'handler_ref');
    if (firstRun.execution_kind !== 'handler_ref') assert.fail('expected handler action result');
    assert.deepEqual(firstRun.result, { accepted: true, value: 1, candidate_label: 'v1' });
    assert.equal(firstRun.hosted_runtime_binding.source_kind, 'foundry_active_agent_version');
    if (firstRun.hosted_runtime_binding.source_kind !== 'foundry_active_agent_version') assert.fail();
    assert.equal(firstRun.hosted_runtime_binding.active_version_digest, v1.version.version_digest);
    assert.equal(firstRun.hosted_runtime_binding.activation_revision, 1);
    assert.equal(
      firstRun.hosted_runtime_binding.prepared_runtime_binding_ref,
      (await registry.activationHistory(targetAgentId, targetDomainId))[0]
        ?.runtime_binding_verification.runtime_binding_ref,
    );
    const v1Closure = (firstRun.package_use_binding as any).dependency_closure_digest as string;
    assert.match(v1Closure, /^sha256:[a-f0-9]{64}$/);
    assert.equal(firstRun.hosted_runtime_binding.package_closure_digest, v1Closure);
    assert.equal((firstRun.package_use_binding as any).binding_origin, 'foundry_active_agent_version');
    assert.equal(JSON.stringify(firstRun.hosted_runtime_binding).includes(stateRoot), false);

    const replay = await runStandardAgentAction({
      domainId: targetDomainId,
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 1 },
      runId: 'generated-v1-frozen',
    }, dependencies);
    const replayRun = replay.standard_agent_action_run;
    assert.equal(replayRun.execution_kind, 'handler_ref');
    if (replayRun.execution_kind !== 'handler_ref') assert.fail();
    assert.deepEqual(replayRun.result, firstRun.result);
    assert.equal(replayRun.output.sha256, firstRun.output.sha256);
    assert.equal(replayRun.hosted_runtime_binding_ref, firstRun.hosted_runtime_binding_ref);
    assert.equal(replayRun.hosted_runtime_binding.source_kind, 'foundry_active_agent_version');
    if (replayRun.hosted_runtime_binding.source_kind !== 'foundry_active_agent_version') assert.fail();
    assert.equal(replayRun.hosted_runtime_binding.active_version_digest, v1.version.version_digest);
    assert.equal(handlerCalls, 1);

    const second = await runStandardAgentAction({
      domainId: targetDomainId,
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 2 },
      runId: 'generated-v2-next-invocation',
    }, dependencies);
    const secondRun = second.standard_agent_action_run;
    assert.equal(secondRun.execution_kind, 'handler_ref');
    if (secondRun.execution_kind !== 'handler_ref') assert.fail();
    assert.deepEqual(secondRun.result, { accepted: true, value: 2, candidate_label: 'v2' });
    assert.equal(secondRun.hosted_runtime_binding.source_kind, 'foundry_active_agent_version');
    if (secondRun.hosted_runtime_binding.source_kind !== 'foundry_active_agent_version') assert.fail();
    assert.equal(secondRun.hosted_runtime_binding.active_version_digest, v2.version.version_digest);
    assert.equal(secondRun.hosted_runtime_binding.activation_revision, 2);
    assert.notEqual((secondRun.package_use_binding as any).dependency_closure_digest, v1Closure);

    await registry.rollback({
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      expected_revision: 2,
      version_digest: v1.version.version_digest,
      occurred_at: '2026-07-17T00:03:00.000Z',
      authority_receipt_ref: 'owner-receipt:generated-fixture-rollback',
      runtime_binding_verification: rollbackVerification,
    });
    const rolledBack = await runStandardAgentAction({
      domainId: targetAgentId,
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 3 },
      runId: 'generated-v1-after-rollback',
    }, dependencies);
    const rolledBackRun = rolledBack.standard_agent_action_run;
    assert.equal(rolledBackRun.execution_kind, 'handler_ref');
    if (rolledBackRun.execution_kind !== 'handler_ref') assert.fail();
    assert.deepEqual(rolledBackRun.result, { accepted: true, value: 3, candidate_label: 'v1' });
    assert.equal(rolledBackRun.hosted_runtime_binding.source_kind, 'foundry_active_agent_version');
    if (rolledBackRun.hosted_runtime_binding.source_kind !== 'foundry_active_agent_version') assert.fail();
    assert.equal(rolledBackRun.hosted_runtime_binding.active_version_digest, v1.version.version_digest);
    assert.equal(rolledBackRun.hosted_runtime_binding.activation_revision, 3);
    assert.equal((rolledBackRun.package_use_binding as any).dependency_closure_digest, v1Closure);
    assert.equal(handlerCalls, 3);
    assert.equal(packageFallbackCalls, 0);
    assert.deepEqual(ledgerBindingRefs.map((ref) => ref.split('?')[0]), [
      firstRun.hosted_runtime_binding_ref,
      firstRun.hosted_runtime_binding_ref,
      secondRun.hosted_runtime_binding_ref,
      rolledBackRun.hosted_runtime_binding_ref,
    ]);

    const pinnedVersionFile = path.join(
      foundryStoragePaths(stateRoot).registry,
      sha256(`${targetAgentId}\0${targetDomainId}`).slice('sha256:'.length),
      'epoch-v1',
      'agent-versions',
      `${v1.version.version_digest.slice('sha256:'.length)}.json`,
    );
    fs.rmSync(pinnedVersionFile);
    const replayAfterVersionDeletion = await runStandardAgentAction({
      domainId: targetAgentId,
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 1 },
      runId: 'generated-v1-frozen',
    }, dependencies);
    const replayedRun = replayAfterVersionDeletion.standard_agent_action_run;
    assert.equal(replayedRun.execution_kind, 'handler_ref');
    if (replayedRun.execution_kind !== 'handler_ref') assert.fail();
    assert.deepEqual(replayedRun.result, firstRun.result);
    assert.equal(
      replayedRun.hosted_runtime_binding_ref,
      firstRun.hosted_runtime_binding_ref,
    );
    assert.equal(replayedRun.output.sha256, firstRun.output.sha256);
    assert.equal(handlerCalls, 3);
    assert.equal(packageFallbackCalls, 0);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('hosted resolution rejects bytes-derived binding when durable activation verification disagrees', async () => {
  const stateRoot = root('opl-hosted-binding-durable-proof-state-');
  const workspaceRoot = root('opl-hosted-binding-durable-proof-workspace-');
  const targetAgentId = 'generated-durable-proof-agent';
  const targetDomainId = 'generated_durable_proof_domain';
  try {
    const candidate = createHostedCandidate({
      stateRoot,
      targetAgentId,
      targetDomainId,
      label: 'v1',
    });
    const registered = await registerCandidate(stateRoot, candidate, 'v1');
    const verification = await activationVerification({
      stateRoot,
      workspaceRoot,
      version: registered.version,
      transactionKind: 'activate',
      expectedRevision: 0,
    });
    await registered.registry.compareAndSwapActivation({
      target_agent_id: targetAgentId,
      target_domain_id: targetDomainId,
      expected_revision: 0,
      version_digest: registered.version.version_digest,
      occurred_at: '2026-07-17T00:04:00.000Z',
      authority_receipt_ref: null,
      runtime_binding_verification: verification,
    });
    const [transaction] = await registered.registry.activationHistory(targetAgentId, targetDomainId);
    assert.ok(transaction);
    const forged = {
      ...transaction,
      runtime_binding_verification: {
        ...transaction.runtime_binding_verification,
        runtime_binding_ref: `opl://foundry/prepared-runtime-bindings/${sha256('forged-durable-ref')}`,
      },
    };
    const registry: VersionRegistry = {
      register: (input) => registered.registry.register(input),
      list: (agentId, domainId) => registered.registry.list(agentId, domainId),
      resolveVersion: (ref, agentId, domainId) => registered.registry.resolveVersion(ref, agentId, domainId),
      activation: (agentId, domainId) => registered.registry.activation(agentId, domainId),
      activationHistory: async () => [forged],
      compareAndSwapActivation: (input) => registered.registry.compareAndSwapActivation(input),
      rollback: (input) => registered.registry.rollback(input),
    };

    await assert.rejects(
      new DefaultHostedAgentRuntimeBindingResolver({
        root_override: stateRoot,
        registry_factory: () => registry,
      }).resolve({ domainId: targetAgentId, workspaceRoot }),
      /durable activation runtime binding verification does not match/i,
    );
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('inactive Foundry target falls back to its managed package', async () => {
  const stateRoot = root('opl-hosted-binding-inactive-state-');
  const checkoutRoot = root('opl-hosted-binding-package-checkout-');
  const workspaceRoot = root('opl-hosted-binding-package-workspace-');
  let packageFallbackCalls = 0;
  try {
    await new LedgerVersionRegistry(stateRoot).activation('mas', 'medautoscience');
    writePackageCheckout(checkoutRoot);
    const result = await runStandardAgentAction({
      domainId: 'mas',
      actionId: 'evaluate',
      workspaceRoot,
      payload: { value: 9 },
      runId: 'inactive-foundry-package-fallback',
    }, {
      foundryRootOverride: stateRoot,
      resolveManagedCheckout: (async () => {
        packageFallbackCalls += 1;
        return {
          agent: resolveStandardAgent('mas')!,
          package_id: 'mas',
          workspace_root: fs.realpathSync.native(workspaceRoot),
          checkout_root: fs.realpathSync.native(checkoutRoot),
          package_status: { launch_allowed: true },
          package_use_binding: {
            surface_kind: 'opl_agent_package_use_binding.v1',
            use_boundary_id: 'package-use:fixture',
            root_package: { package_id: 'mas' },
          },
          use_boundary_id: 'package-use:fixture',
        };
      }) as never,
      recordLedger,
    });
    const run = result.standard_agent_action_run;
    assert.equal(run.execution_kind, 'handler_ref');
    if (run.execution_kind !== 'handler_ref') assert.fail();
    assert.deepEqual(run.result, { accepted: true, value: 9 });
    assert.equal(run.hosted_runtime_binding.source_kind, 'managed_package_checkout');
    assert.equal(packageFallbackCalls, 1);
  } finally {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(checkoutRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('active Foundry identity, byte integrity, and pack ABI faults fail closed', async () => {
  for (const fault of ['catalog-identity', 'missing-bytes', 'catalog-abi'] as const) {
    const stateRoot = root(`opl-hosted-binding-${fault}-state-`);
    const workspaceRoot = root(`opl-hosted-binding-${fault}-workspace-`);
    let packageFallbackCalls = 0;
    try {
      const targetAgentId = `generated-${fault}-agent`;
      const targetDomainId = `generated_${fault.replaceAll('-', '_')}_domain`;
      const candidate = createHostedCandidate({
        stateRoot,
        targetAgentId,
        targetDomainId,
        label: 'v1',
        ...(fault === 'catalog-identity' ? { catalogTargetDomainId: 'wrong-generated-domain' } : {}),
        ...(fault === 'catalog-abi' ? { catalogVersion: 'family-action-catalog.v999' } : {}),
      });
      const registered = await registerCandidate(stateRoot, candidate, 'v1');
      await registered.registry.compareAndSwapActivation({
        target_agent_id: targetAgentId,
        target_domain_id: targetDomainId,
        expected_revision: 0,
        version_digest: registered.version.version_digest,
        occurred_at: '2026-07-17T00:04:00.000Z',
        authority_receipt_ref: null,
        runtime_binding_verification: syntheticActivationVerification({
          version: registered.version,
          transactionKind: 'activate',
          expectedRevision: 0,
          label: fault,
        }),
      });
      if (fault === 'missing-bytes') {
        const directory = path.join(
          foundryStoragePaths(stateRoot).candidates,
          candidate.candidate_digest.slice('sha256:'.length),
        );
        fs.rmSync(path.join(directory, 'handler.ts'));
      }
      await assert.rejects(
        runStandardAgentAction({
          domainId: targetAgentId,
          actionId: 'evaluate',
          workspaceRoot,
          payload: { value: 1 },
          runId: `fail-closed-${fault}`,
        }, {
          foundryRootOverride: stateRoot,
          resolveManagedCheckout: (async () => {
            packageFallbackCalls += 1;
            throw new Error('active Foundry faults must not fall back to a package');
          }) as never,
          recordLedger,
        }),
        fault === 'catalog-identity'
          ? /catalog target does not match/
          : fault === 'missing-bytes'
            ? /missing or unexpected bytes/
            : /action contracts are invalid/i,
      );
      assert.equal(packageFallbackCalls, 0);
    } finally {
      fs.rmSync(stateRoot, { recursive: true, force: true });
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  }
});
