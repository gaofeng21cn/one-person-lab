import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scopedGatewayWorkspace } from '../foundry-kernel-cases/scoped-workspace.ts';
import { resolveFoundryExecutionScope } from '../../../src/adapters/execution/foundry-execution-scope.ts';
import { buildStageRunImmutableContentBindings } from '../../../src/adapters/execution/family-runtime-stage-run-identity-parts/content-bindings.ts';
import { requireFamilyRuntimeExecutionScope } from '../../../src/adapters/execution/family-runtime-execution-scope.ts';
import { FrameworkContractError } from '../../../src/kernel/contract-validation.ts';
import { canonicalJsonBytes } from '../../../src/kernel/canonical-json.ts';
import {
  foundryContentDigest,
  normalizeFoundryProviderManifest,
  readFoundryProviderManifest,
} from '../../../src/authority/evolution/index.ts';
import { FileFoundryContentStore } from '../../../src/authority/evidence/index.ts';
import { StageRunFoundryProviderInvoker } from '../../../src/adapters/execution/foundry-provider-stage-run.ts';
import { activity, provider, state } from './support.ts';

export function registerProviderContractTests(): void {
for (const operation of ['design', 'diagnose'] as const) {
  test(`StageRun ${operation} binds declared output schemas and transport requirements before launch`, async (t) => {
    const storageRoot = scopedGatewayWorkspace(t);
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
    assert.match(
      contract.transport_requirements.join('\n'),
      /route_impact\.stage_quality_cycle\.artifact_refs and route_impact\.stage_quality_cycle\.artifact_hashes/,
    );
    assert.match(
      contract.transport_requirements.join('\n'),
      /a closeout metadata entry or reviewer snapshot member alone does not transport the bytes/,
    );
  });
}

test('StageRun provider binds admitted source bytes to its actual initial launch', async (t) => {
  const storageRoot = scopedGatewayWorkspace(t);
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
        const scope = resolveFoundryExecutionScope({ provider, workspace_root: storageRoot, run_id: activity.run_id });
        for (const ref of input.input_artifact_refs) {
          assert.ok(fs.realpathSync.native(new URL(ref)).startsWith(`${scope.canonical_work_item_root}${path.sep}`),
            'provider inputs must be inside the bound Foundry work-item root');
        }
        assert.deepEqual(input.execution_scope, scope);
        const packRoot = path.join(storageRoot, 'test-pack');
        fs.mkdirSync(packRoot);
        fs.writeFileSync(path.join(packRoot, 'binding.txt'), 'managed test binding');
        const bind = (executionScope = scope, hashes = input.input_artifact_hashes) => buildStageRunImmutableContentBindings({
          domainId: provider.domain_id, domainPackRoot: packRoot, workspaceRoot: storageRoot,
          scopeKind: 'work_item', executionScope,
          stageManifest: { ref: 'binding.txt', sha256: crypto.createHash('sha256').update('managed test binding').digest('hex') },
          qualityPolicyRef: 'binding.txt', stagePromptRef: 'binding.txt',
          rolePromptRefs: [], qualityRubricRefs: [], knowledgeRefs: [], skillRefs: [], policyRefs: [],
          stageGoalRefs: [], lineageRefs: [], checkpointRefs: [],
          stagePacketRef: input.input_artifact_refs[0]!, sourceRefs: input.input_artifact_refs,
          inputArtifacts: input.input_artifact_refs.map((ref, index) => ({ ref, sha256: `sha256:${hashes[index]!}`, identity_receipt_ref: null })),
        });
        const bindings = bind().filter((entry) => entry.purpose === 'input_artifact');
        assert.equal(bindings.length, 2);
        assert.ok(bindings.every((entry) => entry.scope_digest === scope.scope_digest));
        const otherScope = resolveFoundryExecutionScope({ provider, workspace_root: storageRoot, run_id: 'another-foundry-run' });
        assert.throws(() => bind(otherScope), (error) => error instanceof FrameworkContractError
          && error.details?.failure_code === 'stage_run_artifact_outside_work_item_root');
        assert.throws(() => bind(scope, input.input_artifact_hashes.map(() => '0'.repeat(64))),
          (error) => error instanceof FrameworkContractError
            && error.details?.failure_code === 'stage_run_artifact_byte_identity_mismatch');
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
  const storageRoot = scopedGatewayWorkspace(t);
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

}

export function registerProviderManifestTests(): void {
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

}
