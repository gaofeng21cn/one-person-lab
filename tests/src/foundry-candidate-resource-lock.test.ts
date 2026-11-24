import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { Worker } from '@temporalio/worker';

import { packageRuntimeSourceCheckoutPath } from '../../src/adapters/execution/family-runtime-package-readiness.ts';
import { bindStageKnowledgeContext } from '../../src/adapters/execution/family-runtime-knowledge-context.ts';
import { verifyStageQualityCloseoutArtifactIdentity } from '../../src/adapters/execution/family-runtime-codex-stage-runner/artifact-identity-verification.ts';
import { FOUNDRY_EVALUATION_STAGE_CANDIDATE, type FoundryEvaluationStageAdmission } from '../../src/adapters/execution/foundry-evaluation-stage-candidate.ts';
import { codexStageAttemptEnv } from '../../src/adapters/execution/family-runtime-codex-stage-runner/provider-env.ts';
import { codexStageActivity, runFamilyRuntime } from '../../src/adapters/execution/index.ts';
import type { TemporalStageAttemptWorkflowInput, TemporalStageRunWorkflowInput } from '../../src/adapters/execution/family-runtime-temporal.ts';
import { createWorkItemExecutionScopeSnapshot } from '../../src/authority/workspace/index.ts';
import {
  FOUNDRY_PROTOCOL_VERSION,
  buildFoundryEvent,
  foundryContentDigest,
  type AgentBlueprint,
  type FoundryRunState,
} from '../../src/authority/evolution/index.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
  FileFoundryObjectStore,
  LedgerFoundryEventStore,
  LedgerVersionRegistry,
} from '../../src/authority/evidence/foundry-persistent-adapters.ts';
import {
  compileStandardAgentStageManifest,
  resolveStandardAgentStageQualityRuntimeBinding,
} from '../../src/authority/packages/standard-agent-stage-manifest.ts';
import { readStandardAgentStagePromptFile } from '../../src/authority/packages/standard-agent-stage-prompt.ts';
import { createCordisStageRouteComposition } from '../../src/host/plugins/cordis-agent-executor-experiment.ts';
import { buildCordisTemporalActivities } from '../../src/host/temporal-activity-projection.ts';
import { launchFoundryCandidateStageRun } from '../../src/host/foundry-evaluation-stage-run.ts';
import { readAgentPackageReadinessPort, registerAgentPackageReadinessPort } from '../../src/kernel/agent-package-readiness-port.ts';
import { FrameworkContractError, isRecord } from '../../src/kernel/contract-validation.ts';
import { restoreEnv } from './family-runtime-pack-bound-stage-quality-fixture.ts';
import { createTemporalTestWorkflowEnvironment } from './temporal-test-environment.ts';

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
      knowledge_requirements: [],
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

test('evaluation resolves the exact uninstalled pack and Stagecraft reads its bound prompt', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-evaluation-pack-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = new FileFoundryContentStore(root);
  const compiler = new ContentAddressedCandidateCompiler(root);
  const installedResources = resources(store);
  const evaluationResources = {
    ...installedResources,
    prompt: store.put(Buffer.from('Exact evaluation candidate prompt\n')),
  };
  async function materialize(runId: string, packResources: ResourceSet) {
    const packBlueprint = blueprint(packResources);
    return compiler.materialize({
      run_id: runId,
      blueprint: packBlueprint,
      blueprint_digest: foundryContentDigest(packBlueprint),
    });
  }
  const installed = await materialize('run:evaluation:installed', installedResources);
  const candidate = await materialize('run:evaluation:candidate', evaluationResources);
  const installedDirectory = compiler.candidateDirectory(installed.candidate_digest);
  const candidateDirectory = compiler.candidateDirectory(candidate.candidate_digest);
  const installedCheckout = packageRuntimeSourceCheckoutPath({
    installed_carrier_readback: { lifecycle_authority: 'carrier_owned', source_ref: installedDirectory },
    installed_readiness: { installed: true, physical_status: 'available', callability: 'callable' },
  });
  assert.equal(installedCheckout, installedDirectory);
  assert.notEqual(installedCheckout, candidateDirectory);
  const readPack = () => compiler.verifyMaterializedCandidate(candidate);
  const verified = readPack();
  assert.equal(verified.directory, fs.realpathSync.native(candidateDirectory));
  assert.equal(verified.manifest_digest, candidate.manifest_digest);
  assert.notEqual(verified.directory, installedCheckout);
  const binding = resolveStandardAgentStageQualityRuntimeBinding(verified.directory, 'deliver');
  assert.ok(binding?.enabled);
  const candidatePrompt = readStandardAgentStagePromptFile(verified.directory, binding.stage_prompt_ref);
  assert.equal(`sha256:${candidatePrompt.sha256}`, evaluationResources.prompt.digest);
  assert.notEqual(`sha256:${candidatePrompt.sha256}`, installedResources.prompt.digest);
  const registry = new LedgerVersionRegistry(root, { readOnly: true });
  assert.deepEqual(await registry.list(candidate.target_agent_id, candidate.target_domain_id), []);

  const wrongManifest = { ...candidate, manifest_digest: installed.manifest_digest };
  assert.notEqual(wrongManifest.manifest_digest, candidate.manifest_digest);
  assert.throws(
    () => compiler.verifyMaterializedCandidate(wrongManifest),
    /candidate manifest does not match the materialization record/,
  );
  fs.writeFileSync(path.join(candidateDirectory, binding.stage_prompt_ref), 'Drifted evaluation candidate prompt\n');
  assert.throws(readPack, /bytes do not match the immutable file index/);
});

test('Foundry candidate launches a real Temporal StageRun and keeps the candidate through review, routing and retries', { timeout: 90_000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-frozen-candidate-stage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspaceRoot = path.join(root, 'workspace');
  const workItemRoot = path.join(workspaceRoot, 'case-01');
  fs.mkdirSync(workItemRoot, { recursive: true });
  const testEnv = await createTemporalTestWorkflowEnvironment();
  t.after(() => testEnv.teardown());
  const namespace = testEnv.namespace ?? 'default';
  const taskQueue = `foundry-candidate-stage-${crypto.randomUUID()}`;
  const env = {
    OPL_STATE_DIR: path.join(root, 'state'),
    OPL_FAMILY_WORKSPACE_ROOT: path.join(root, 'family-workspace'),
    OPL_TEMPORAL_ADDRESS: testEnv.address,
    OPL_TEMPORAL_NAMESPACE: namespace,
    OPL_TEMPORAL_TASK_QUEUE: taskQueue,
    OPL_TEMPORAL_TEST_ALLOW_UNINDEXED_VISIBILITY: '1',
  };
  const originalEnv = new Map(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => restoreEnv(originalEnv));
  const originalReadiness = readAgentPackageReadinessPort();
  t.after(() => { if (originalReadiness) registerAgentPackageReadinessPort(originalReadiness); });

  const store = new FileFoundryContentStore();
  const compiler = new ContentAddressedCandidateCompiler();
  const initialResources = resources(store);
  const initialBlueprint = { ...blueprint(initialResources), target_agent_id: 'med-autoscience', target_domain_id: 'medautoscience' };
  const candidateResources = { ...initialResources, prompt: store.put(Buffer.from('Temporal candidate B prompt\n')) };
  const candidateBlueprint = { ...blueprint(candidateResources), target_agent_id: 'med-autoscience', target_domain_id: 'medautoscience' };
  const entry = candidateBlueprint.stage_graph.stages[0]!;
  entry.next_stage_ids = ['verify'];
  candidateBlueprint.stage_graph.stages.push({
    ...entry, stage_id: 'verify', prompt_ref: candidateResources.prompt.ref, next_stage_ids: [],
  });
  const runId = 'run:frozen-candidate-stage';
  const installed = await compiler.materialize({
    run_id: 'run:installed-stage', blueprint: initialBlueprint, blueprint_digest: foundryContentDigest(initialBlueprint),
  });
  const candidate = await compiler.materialize({
    run_id: runId, blueprint: candidateBlueprint, blueprint_digest: foundryContentDigest(candidateBlueprint),
  });
  const installedDirectory = path.join(root, 'installed');
  fs.cpSync(compiler.candidateDirectory(installed.candidate_digest), installedDirectory, { recursive: true });
  const providerPackageId = 'fixture-provider';
  const providerDigest = digest('provider contents');
  const content = 'Approved evaluation knowledge\n';
  const bodyRef = 'agent/knowledge/evaluation.md';
  fs.mkdirSync(path.dirname(path.join(installedDirectory, bodyRef)), { recursive: true });
  fs.writeFileSync(path.join(installedDirectory, bodyRef), content);
  fs.writeFileSync(path.join(installedDirectory, 'contracts/durable_knowledge_catalog.json'), JSON.stringify({
    surface_kind: 'opl_durable_knowledge_catalog',
    version: 'durable-knowledge-catalog.v2',
    owner: 'one-person-lab',
    items: [{
      surface_kind: 'opl_durable_knowledge_item',
      version: 'durable-knowledge-item.v2',
      knowledge_id: 'fixture.evaluation-method',
      title: 'Evaluation method',
      scope: { kind: 'product', id: candidate.target_domain_id },
      content_kind: 'mechanism',
      owner: candidate.target_domain_id,
      body_ref: { kind: 'repo_path', ref: bodyRef, sha256: digest(content) },
      applicability: { domains: [candidate.target_domain_id], stages: ['deliver', 'verify'] },
      requirement: 'required',
      status: 'active',
      reviewed_at: '2026-01-01T00:00:00Z',
      next_review_at: '2099-01-01T00:00:00Z',
      authority_boundary: {
        semantic_body_owner: candidate.target_domain_id,
        opl_role: 'catalog_recall_and_receipt_projection_only',
      },
    }],
  }));
  registerAgentPackageReadinessPort({
    readStatus: () => ({
      opl_agent_package_status: {
        installed_package_count: 1,
        launch_allowed: true,
        installed_content_digest: installed.candidate_digest,
        installed_manifest_sha256: installed.manifest_digest,
        installed_carrier_readback: {
          kind: 'local', lifecycle_authority: 'carrier_owned', source_ref: installedDirectory, version: '1.0.0',
        },
        installed_readiness: { installed: true, physical_status: 'available', callability: 'callable' },
        package_dependency_readiness: { dependencies: [{
          package_id: providerPackageId, installed_version: '1.0.0', content_digest: providerDigest,
          required: true, reasons: [],
        }] },
      },
    }),
  });

  const ledger = new LedgerFoundryEventStore();
  const objects = new FileFoundryObjectStore();
  await objects.put(candidateBlueprint);
  const object = await objects.put(candidate);
  const targetKey = `${candidate.target_agent_id}\0${candidate.target_domain_id}`;
  let previousEventHash: string | null = null;
  let previousState: FoundryRunState | null = null;
  const transitions = [
    ['accepted', 'foundry_run_accepted', {
      target_agent_id: candidate.target_agent_id, target_domain_id: candidate.target_domain_id,
      generation: 0, activation_revision_at_start: 0, request_digest: digest('frozen-candidate-stage-request'),
    }],
    ['designing', 'design_started', {}],
    ['materializing', 'blueprint_admitted', { blueprint_digest: candidate.blueprint_digest }],
    ['evaluating', 'candidate_materialized', { candidate_digest: candidate.candidate_digest, candidate_record_digest: object.digest }],
  ] as const;
  for (const [index, [state, eventType, payload]] of transitions.entries()) {
    const event = buildFoundryEvent({
      runId, revision: index + 1, eventType, fromState: previousState, toState: state,
      occurredAt: '2026-11-23T00:00:00.000Z', idempotencyKey: `${runId}:${eventType}`,
      previousEventHash, payload,
    });
    if (index === 0) await ledger.create({ target_key: targetKey, event });
    else await ledger.append({ target_key: targetKey, event, expected_revision: index });
    previousState = state;
    previousEventHash = event.event_hash;
  }

  const executionScope = createWorkItemExecutionScopeSnapshot({
    projectScopeId: 'project:frozen-candidate-stage',
    workspaceBindingId: 'workspace-binding:frozen-candidate-stage',
    domainId: candidate.target_domain_id,
    workspaceRoot,
    canonicalWorkItemRoot: workItemRoot,
    payload: { work_item_id: 'case-01' },
    requirement: { kind: 'work_item', alias_fields: ['work_item_id'] },
  });
  let admissionDrift = false;
  const admitEvaluationStage: FoundryEvaluationStageAdmission = async (input) => {
    assert.equal(input.evaluation.candidate_digest, candidate.candidate_digest);
    assert.equal(input.scopeDigest, executionScope.scope_digest);
    assert.deepEqual(input.blueprint.capability_requirements, ['capability:fixture']);
    return {
      authorityRef: `fixture:admission:${input.stageId}`,
      providerPackageIds: admissionDrift ? [] : [providerPackageId],
      knowledgeContext: bindStageKnowledgeContext({
        repoDir: installedDirectory,
        domainPackRoot: installedDirectory,
        domainId: candidate.target_domain_id,
        stageId: input.stageId,
        taskIntent: input.actionId,
      }),
    };
  };
  let rejectedChangedAdmission = false;
  const observedAttempts: TemporalStageAttemptWorkflowInput[] = [];
  const activities = buildCordisTemporalActivities({ admitEvaluationStage });
  const worker = await Worker.create({
    connection: testEnv.nativeConnection,
    namespace,
    taskQueue,
    workflowsPath: path.resolve(import.meta.dirname, '../../src/adapters/execution/family-runtime-temporal-workflows.ts'),
    activities: {
      ...activities,
      async codexStageActivity(attempt: TemporalStageAttemptWorkflowInput) {
        const evaluation = FOUNDRY_EVALUATION_STAGE_CANDIDATE in attempt.workspace_locator;
        if (evaluation && !rejectedChangedAdmission) {
          admissionDrift = true;
          try {
            await assert.rejects(
              () => codexStageActivity(attempt, { admitEvaluationStage, createAttemptComposition() {
                assert.fail('Provider must not start after a changed evaluation admission.');
              } }),
              /differs from the verified Foundry candidate and native dependencies/,
            );
            rejectedChangedAdmission = true;
          } finally {
            admissionDrift = false;
          }
        }
        return codexStageActivity(attempt, {
          admitEvaluationStage,
          createAttemptComposition: () => ({
            snapshot: { snapshot_id: 'fixture', snapshot_digest: digest('composition'), binding: {} },
            dispose() {},
            executor: { async execute(input) {
              assert.ok(input.effectiveStagePrompt?.content?.includes(evaluation ? 'Temporal candidate B prompt' : 'prompt fixture v1'));
              assert.ok(input.effectiveManagedContent?.some((entry) => entry.content === content));
              const runnerEnv = codexStageAttemptEnv({ attempt: input.attempt, workspaceRoot });
              assert.equal(runnerEnv.OPL_ROOT_PACKAGE_CONTENT_DIGEST, evaluation ? candidate.candidate_digest : installed.candidate_digest);
              assert.match(runnerEnv.OPL_PROVIDER_PACKAGES_JSON ?? '', /fixture-provider/);
              observedAttempts.push(attempt);
              const artifactPath = path.join(workItemRoot, `${attempt.stage_attempt_id}.txt`);
              const contents = `${attempt.stage_id} ${attempt.attempt_role} evidence`;
              fs.writeFileSync(artifactPath, contents);
              const ref = pathToFileURL(artifactPath).href;
              const sha256 = digest(contents);
              const producing = attempt.attempt_role === 'producer' || attempt.attempt_role === 'repairer';
              const needsRepair = evaluation && attempt.stage_id === 'deliver' && attempt.attempt_role === 'reviewer';
              const findingId = 'finding:fixture';
              const review = needsRepair ? {
                outcome: 'repair_required',
                findings: [{
                  finding_id: findingId,
                  required: true,
                  severity: 'critical',
                  evidence_refs: [ref],
                  repair_expectation: 'Complete the fixture evidence.',
                }],
              } : {
                outcome: 'pass',
                findings: [],
                ...(attempt.attempt_role === 're_reviewer' ? {
                  finding_closures: [{ finding_id: findingId, status: 'closed', evidence_refs: [ref] }],
                  repair_regressions: [],
                  critical_new_findings: [],
                  optional_observations: [],
                } : {}),
              };
              const repair = attempt.attempt_role === 'repairer' ? {
                repair_map: [{
                  finding_id: findingId,
                  repair_status: 'repaired',
                  changed_artifact_refs: [ref],
                  repair_evidence_refs: [ref],
                }],
              } : {};
              const closeout = verifyStageQualityCloseoutArtifactIdentity({
                attempt: attempt as unknown as Record<string, unknown>,
                workspaceRoot,
                closeoutPacket: {
                  surface_kind: 'stage_attempt_closeout_packet',
                  stage_attempt_id: attempt.stage_attempt_id,
                  stage_run_id: attempt.stage_run_id!,
                  scope_digest: attempt.execution_scope?.scope_digest,
                  closeout_refs: [ref],
                  closeout_ref_metadata: [{ kind: 'artifact', ref, sha256 }],
                  consumed_refs: [], consumed_memory_refs: [], writeback_receipt_refs: [], rejected_writes: [],
                  next_owner: null, domain_ready_verdict: null,
                  authority_boundary: { opl: 'closeout_transport_only', domain: 'truth_quality_artifact_gate_owner' },
                  route_impact: {
                    stage_quality_cycle: producing
                      ? { artifact_refs: [ref], artifact_hashes: [sha256], ...repair }
                      : review,
                    ...(!producing && !needsRepair ? { stage_route_decision: {
                      decision_kind: evaluation && attempt.stage_id === 'deliver' ? 'advance' : 'complete',
                      ...(evaluation && attempt.stage_id === 'deliver' ? { target_stage_id: 'verify' } : {}),
                      evidence_refs: [ref],
                    } } : {}),
                  },
                },
              });
              return {
                runner_status: { exit_code: 0 },
                stage_attempt_id: attempt.stage_attempt_id, checkpoint_refs: [],
                progress_summary: { thread_id: attempt.stage_attempt_id, execution_session_ref: `codex://threads/${attempt.stage_attempt_id}` },
                closeout_packet: closeout,
              };
            } },
          }),
        });
      },
    },
  });
  await worker.runUntil(async () => {
    const candidatePack = compiler.verifyMaterializedCandidate(candidate);
    const invocationId = 'foundry-evaluation-case-01';
    const workspaceLocator = {
      workspace_root: executionScope.workspace_root,
      execution_scope: executionScope,
      [FOUNDRY_EVALUATION_STAGE_CANDIDATE]: {
        run_id: runId, phase: 'evaluation', generation: 0, candidate_digest: candidate.candidate_digest,
        case_kind: 'public', case_digest: foundryContentDigest(candidateBlueprint.eval_spec.public_cases[0]!),
      },
    };
    await assert.rejects(() => runFamilyRuntime([
      'attempt', 'create', '--domain', candidate.target_domain_id, '--stage', 'deliver', '--action', 'deliver',
      '--provider', 'temporal', '--workspace-locator', JSON.stringify(workspaceLocator),
      '--scope-kind', 'work_item', '--execution-scope', JSON.stringify(executionScope),
      '--stage-run-invocation-id', invocationId, '--start',
    ]), (error: unknown) => error instanceof FrameworkContractError
      && error.details?.failure_code === 'foundry_evaluation_stage_candidate_binding_invalid');
    const launch = (testCase = candidateBlueprint.eval_spec.public_cases[0]!) => launchFoundryCandidateStageRun({
      admitEvaluationStage,
      evaluationCase: {
        run_id: runId, generation: 0, phase: 'evaluation',
        subject: { kind: 'candidate', candidate, candidate_pack: candidatePack },
        test_case: testCase,
      },
      executionScope, stageId: 'deliver', actionId: 'deliver', invocationId,
    });
    await assert.rejects(
      () => launch({ ...candidateBlueprint.eval_spec.public_cases[0]!, test_ref: 'fixture:wrong-case' }),
      /does not match the frozen Foundry EvalSpec/,
    );
    const result = await launch();
    const { stage_run_input: stageRun } = result.family_runtime_stage_run as { stage_run_input: TemporalStageRunWorkflowInput };
    assert.equal(stageRun.domain_pack_root, candidatePack.directory);
    const stagePackage = stageRun.stage_run_spec.package_closure?.root_package;
    assert.ok(isRecord(stagePackage));
    assert.equal(stagePackage.content_digest, candidate.candidate_digest);
    const handle = testEnv.client.workflow.getHandle(stageRun.workflow_id);
    const first = await handle.result();
    assert.ok(first.next_stage_run_launch?.target_workflow_id, JSON.stringify(first));
    const second = await testEnv.client.workflow.getHandle(first.next_stage_run_launch.target_workflow_id).result();
    assert.equal(second.next_stage_run_launch?.materialization_status, 'workflow_complete', JSON.stringify(second));
    assert.deepEqual(observedAttempts.map((attempt) => [attempt.stage_id, attempt.attempt_role]), [
      ['deliver', 'producer'], ['deliver', 'reviewer'], ['deliver', 'repairer'], ['deliver', 're_reviewer'],
      ['verify', 'producer'], ['verify', 'reviewer'],
    ]);
    for (const attempt of observedAttempts) {
      assert.equal(attempt.domain_pack_root, candidatePack.directory);
      const rootPackage = attempt.execution_content_binding?.spec.package_closure?.root_package;
      assert.ok(isRecord(rootPackage));
      assert.equal(rootPackage.content_digest, candidate.candidate_digest);
    }
    assert.equal(rejectedChangedAdmission, true);
    const replay = await launch();
    const replayStageRun = (replay.family_runtime_stage_run as { stage_run_input: TemporalStageRunWorkflowInput }).stage_run_input;
    assert.equal(replayStageRun.workflow_id, stageRun.workflow_id);
    assert.equal(replayStageRun.stage_run_spec_sha256, stageRun.stage_run_spec_sha256);

    const ordinary = await runFamilyRuntime([
      'attempt', 'create', '--domain', candidate.target_domain_id, '--stage', 'deliver', '--action', 'deliver',
      '--provider', 'temporal', '--workspace-locator', JSON.stringify({ workspace_root: workspaceRoot, execution_scope: executionScope }),
      '--scope-kind', 'work_item', '--execution-scope', JSON.stringify(executionScope),
      '--stage-run-invocation-id', 'ordinary-installed-run', '--start',
    ], { createStageRouteComposition: createCordisStageRouteComposition });
    const installedStageRun = (ordinary.family_runtime_stage_run as { stage_run_input: TemporalStageRunWorkflowInput }).stage_run_input;
    assert.equal(installedStageRun.domain_pack_root, installedDirectory);
    const installedResult = await testEnv.client.workflow.getHandle(installedStageRun.workflow_id).result();
    assert.equal(installedResult.next_stage_run_launch?.materialization_status, 'workflow_complete', JSON.stringify(installedResult));
    assert.equal(observedAttempts.at(-1)?.domain_pack_root, installedDirectory);
  });
});
