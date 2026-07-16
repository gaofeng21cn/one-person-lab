import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FOUNDRY_PROTOCOL_VERSION,
  foundryContentDigest,
  type AgentBlueprint,
} from '../../src/modules/foundry/index.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
  LedgerVersionRegistry,
} from '../../src/modules/ledger/foundry-persistent-adapters.ts';
import {
  compileStandardAgentStageManifest,
  resolveStandardAgentStageQualityRuntimeBinding,
} from '../../src/modules/pack/standard-agent-stage-manifest.ts';

type StoredResource = ReturnType<FileFoundryContentStore['put']>;
type ResourceSet = Record<'prompt' | 'skill' | 'knowledge' | 'helper' | 'model' | 'tool' | 'schema', StoredResource>;

function digest(label: string) {
  return `sha256:${crypto.createHash('sha256').update(label).digest('hex')}`;
}

function resources(store: FileFoundryContentStore, modelBody = 'model fixture v1\n'): ResourceSet {
  return {
    prompt: store.put(Buffer.from('prompt fixture v1\n')),
    skill: store.put(Buffer.from('skill fixture v1\n')),
    knowledge: store.put(Buffer.from('knowledge fixture v1\n')),
    helper: store.put(Buffer.from('helper fixture v1\n')),
    model: store.put(Buffer.from(modelBody)),
    tool: store.put(Buffer.from('tool fixture v1\n')),
    schema: store.put(Buffer.from('{"type":"object","additionalProperties":true}\n')),
  };
}

function blueprint(input: ResourceSet): AgentBlueprint {
  return {
    surface_kind: 'opl_foundry_agent_blueprint',
    version: FOUNDRY_PROTOCOL_VERSION,
    blueprint_id: 'blueprint:resource-lock-fixture',
    target_agent_id: 'resource-lock-agent',
    target_domain_id: 'resource_lock_domain',
    target_version_ref: null,
    design_request_digest: digest('design-request'),
    generation: 0,
    stage_graph: {
      entry_stage_id: 'deliver',
      stages: [{
        stage_id: 'deliver',
        stage_kind: 'domain_delivery',
        goal: 'Deliver an exactly reproducible fixture.',
        input_artifact_types: ['request'],
        output_artifact_types: ['delivery'],
        prompt_ref: input.prompt.ref,
        skill_refs: [input.skill.ref],
        knowledge_refs: [input.knowledge.ref],
        capability_refs: ['capability:fixture'],
        next_stage_ids: [],
      }],
    },
    actions: [{
      action_id: 'deliver',
      summary: 'Deliver the fixture.',
      entry_stage_id: 'deliver',
      input_schema_ref: input.schema.ref,
      output_schema_ref: input.schema.ref,
    }],
    artifact_contracts: [{
      artifact_type: 'delivery',
      schema_ref: input.schema.ref,
      authority_owner_ref: 'owner:fixture',
    }],
    content_refs: {
      prompt_refs: [input.prompt.ref],
      skill_refs: [input.skill.ref],
      knowledge_refs: [input.knowledge.ref],
      helper_refs: [input.helper.ref],
      model_refs: [input.model.ref],
      tool_refs: [input.tool.ref],
      schema_refs: [input.schema.ref],
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
      eval_spec_id: 'eval:resource-lock-fixture',
      public_cases: [{ case_id: 'case:fixture', test_ref: 'test:fixture', weight: 1, required: true }],
      protected_requirements: [{ category: 'protected-fixture', minimum_case_count: 1 }],
      gates: [{ gate_id: 'gate:fixture', metric: 'score', operator: 'gte', threshold: 1, required: true }],
      baseline_comparison: { required: false, regression_tolerance: 0 },
      independent_evaluator_required: true,
    },
    risk_hint: 'low',
  };
}

test('candidate resource lock binds all external behavior bytes and survives exact version readback', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-resource-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new FileFoundryContentStore(root);
  const agentBlueprint = blueprint(resources(store));
  const blueprintDigest = foundryContentDigest(agentBlueprint);
  const compiler = new ContentAddressedCandidateCompiler(root);
  const first = await compiler.materialize({
    run_id: 'run:resource-lock:first',
    blueprint: agentBlueprint,
    blueprint_digest: blueprintDigest,
  });
  const replay = await compiler.materialize({
    run_id: 'run:resource-lock:replay',
    blueprint: structuredClone(agentBlueprint),
    blueprint_digest: blueprintDigest,
  });
  assert.deepEqual(replay, first);

  const directory = compiler.candidateDirectory(first.candidate_digest);
  const lock = JSON.parse(fs.readFileSync(path.join(directory, 'contracts/resource-lock.json'), 'utf8')) as {
    surface_kind: string;
    resources: Array<{
      kind: string;
      declared_ref: string;
      immutable_ref: string;
      pack_path: string;
      sha256: string;
    }>;
  };
  assert.equal(lock.surface_kind, 'opl_foundry_candidate_resource_lock');
  assert.deepEqual(lock.resources.map((entry) => entry.kind), [
    'prompt', 'skill', 'knowledge', 'helper', 'model', 'tool', 'schema',
  ]);
  for (const entry of lock.resources) {
    assert.equal(entry.declared_ref, entry.immutable_ref);
    assert.match(entry.immutable_ref, /^opl-content:\/\/sha256\/[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.join(directory, entry.pack_path)), true);
    assert.equal(entry.sha256, entry.immutable_ref.replace('opl-content://sha256/', 'sha256:'));
  }
  const candidateIndex = JSON.parse(fs.readFileSync(path.join(directory, 'candidate-index.json'), 'utf8')) as {
    version: string;
    files: Array<{ path: string }>;
  };
  assert.equal(candidateIndex.version, 'opl-foundry-candidate-index.v2');
  assert.equal(candidateIndex.files.some((entry) => entry.path === 'contracts/resource-lock.json'), true);

  const actionCatalog = JSON.parse(
    fs.readFileSync(path.join(directory, 'contracts/action_catalog.json'), 'utf8'),
  ) as Record<string, any>;
  const stageManifest = JSON.parse(
    fs.readFileSync(path.join(directory, 'agent/stages/manifest.json'), 'utf8'),
  ) as Record<string, any>;
  const schemaBinding = lock.resources.find((entry) => entry.kind === 'schema')!;
  const promptBinding = lock.resources.find((entry) => entry.kind === 'prompt')!;
  const toolBinding = lock.resources.find((entry) => entry.kind === 'tool')!;
  assert.equal(actionCatalog.surface_kind, 'family_action_catalog');
  assert.equal(actionCatalog.version, 'family-action-catalog.v2');
  assert.equal(actionCatalog.actions[0].execution_binding.kind, 'stage_binding');
  assert.equal(actionCatalog.actions[0].input_schema_ref, schemaBinding.pack_path);
  assert.equal(actionCatalog.actions[0].output_schema_ref, schemaBinding.pack_path);
  assert.equal(stageManifest.surface_kind, 'opl_standard_agent_declarative_stage_manifest');
  assert.equal(stageManifest.version, 'opl-standard-agent-declarative-stage-manifest.v1');
  assert.equal(stageManifest.stages[0].stage_kind, 'domain_specific');
  assert.equal(stageManifest.stages[0].prompt_ref, promptBinding.pack_path);
  assert.match(schemaBinding.pack_path, /^content\/schema\/[a-f0-9]{64}\.json$/);
  assert.match(toolBinding.pack_path, /^agent\/tools\/[a-f0-9]{64}\.blob$/);
  assert.doesNotMatch(fs.readFileSync(path.join(directory, 'contracts/action_catalog.json'), 'utf8'), /opl_foundry_generated/);
  assert.doesNotMatch(fs.readFileSync(path.join(directory, 'agent/stages/manifest.json'), 'utf8'), /opl_foundry_generated/);

  const compiled = compileStandardAgentStageManifest(directory);
  assert.equal(compiled.source_binding.canonical_agent_id, agentBlueprint.target_agent_id);
  assert.equal(compiled.source_binding.domain_id, agentBlueprint.target_domain_id);
  const runtimeBinding = resolveStandardAgentStageQualityRuntimeBinding(directory, 'deliver');
  assert.equal(runtimeBinding?.enabled, true);
  assert.deepEqual(Object.keys(runtimeBinding?.role_prompt_refs ?? {}).sort(), [
    'producer', 're_reviewer', 'repairer', 'reviewer',
  ]);
  assert.deepEqual(runtimeBinding?.quality_rubric_refs, ['agent/quality_gates/foundry-quality-rubric.md']);

  const registry = new LedgerVersionRegistry(root);
  const registered = await registry.register({
    target_agent_id: agentBlueprint.target_agent_id,
    target_domain_id: agentBlueprint.target_domain_id,
    blueprint_digest: blueprintDigest,
    candidate: first,
    evidence_digest: digest('qualified-evidence'),
    risk_tier: 'low',
    qualified_at: '2026-07-16T00:00:00.000Z',
  });
  await registry.compareAndSwapActivation({
    target_agent_id: agentBlueprint.target_agent_id,
    target_domain_id: agentBlueprint.target_domain_id,
    expected_revision: 0,
    version_digest: registered.version.version_digest,
    occurred_at: '2026-07-16T00:01:00.000Z',
    authority_receipt_ref: null,
    runtime_binding_verification: {
      surface_kind: 'opl_foundry_activation_runtime_binding_verification',
      version: 'opl-foundry-activation-runtime-binding-verification.v1',
      verification_phase: 'pre_commit',
      transaction_kind: 'activate',
      target_agent_id: registered.version.target_agent_id,
      target_domain_id: registered.version.target_domain_id,
      version_id: registered.version.version_id,
      version_digest: registered.version.version_digest,
      candidate_digest: registered.version.candidate_digest,
      candidate_ref: registered.version.candidate_ref,
      expected_activation_revision: 0,
      preflight_ref: `opl://foundry/activation-runtime-preflights/${digest('resource-lock-preflight')}`,
      runtime_binding_ref: `opl://foundry/prepared-runtime-bindings/${digest('resource-lock-binding')}`,
    },
  });
  const model = lock.resources.find((entry) => entry.kind === 'model')!;
  fs.writeFileSync(path.join(directory, model.pack_path), 'model drifted!\n');
  await assert.rejects(
    new LedgerVersionRegistry(root).list(agentBlueprint.target_agent_id, agentBlueprint.target_domain_id),
    /candidate bytes do not match the immutable file index/,
  );
  await assert.rejects(
    new LedgerVersionRegistry(root).activation(agentBlueprint.target_agent_id, agentBlueprint.target_domain_id),
    /candidate bytes do not match the immutable file index/,
  );
});

test('candidate compiler rejects mutable refs and resource drift, while a new exact ref creates a new candidate', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-resource-drift-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new FileFoundryContentStore(root);
  const initialResources = resources(store);
  const initialBlueprint = blueprint(initialResources);
  const compiler = new ContentAddressedCandidateCompiler(root);
  const initial = await compiler.materialize({
    run_id: 'run:resource-drift:initial',
    blueprint: initialBlueprint,
    blueprint_digest: foundryContentDigest(initialBlueprint),
  });

  const revisedBlueprint = blueprint({
    ...initialResources,
    model: store.put(Buffer.from('model fixture v2\n')),
  });
  const revised = await compiler.materialize({
    run_id: 'run:resource-drift:revised',
    blueprint: revisedBlueprint,
    blueprint_digest: foundryContentDigest(revisedBlueprint),
  });
  assert.notEqual(revised.candidate_digest, initial.candidate_digest);

  const mutableModel = structuredClone(initialBlueprint);
  mutableModel.content_refs.model_refs = ['opl://model/reasoning-default'];
  await assert.rejects(
    compiler.materialize({
      run_id: 'run:resource-drift:mutable-model',
      blueprint: mutableModel,
      blueprint_digest: foundryContentDigest(mutableModel),
    }),
    /require exact immutable opl-content refs/,
  );
  const pathPrompt = structuredClone(initialBlueprint);
  pathPrompt.content_refs.prompt_refs = ['agent/prompts/deliver.md'];
  pathPrompt.stage_graph.stages[0]!.prompt_ref = 'agent/prompts/deliver.md';
  await assert.rejects(
    compiler.materialize({
      run_id: 'run:resource-drift:path-prompt',
      blueprint: pathPrompt,
      blueprint_digest: foundryContentDigest(pathPrompt),
    }),
    /require exact immutable opl-content refs/,
  );

  const modelBlob = path.join(root, 'content', `${initialResources.model.digest.slice('sha256:'.length)}.blob`);
  fs.writeFileSync(modelBlob, 'model fixture drift\n');
  await assert.rejects(
    compiler.materialize({
      run_id: 'run:resource-drift:tampered-store',
      blueprint: initialBlueprint,
      blueprint_digest: foundryContentDigest(initialBlueprint),
    }),
    /content store bytes fail digest verification/,
  );
});
