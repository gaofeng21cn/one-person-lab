import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import {
  FoundryKernel,
  ManifestFoundryDesignerAdapter,
  foundryContentDigest,
  readFoundryProviderManifest,
  verifyFoundryEventChain,
  type MaterializedCandidate,
} from '../../src/authority/evolution/index.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryObjectStore,
  LedgerFoundryEventStore,
  LedgerFoundryOperationResultJournal,
  LedgerVersionRegistry,
} from '../../src/authority/evidence/index.ts';
import {
  StageRunFoundryProviderInvoker,
  type FoundryProviderStageRunGateway,
} from '../../src/adapters/execution/foundry-provider-stage-run.ts';
import { blueprint, request } from './foundry-kernel-cases/shared.ts';

// The gateway supplies explicit test fixtures, not LLM output or a Temporal execution.
// Everything after that boundary uses the production provider adapter, Kernel and stores.
const providerRoot = fileURLToPath(new URL('../fixtures/oma-0.4.0/', import.meta.url));
const provider = readFoundryProviderManifest(providerRoot, 'foundry_provider.json');
const contentKinds = ['prompt', 'skill', 'knowledge', 'helper', 'model', 'tool', 'schema'] as const;
type Defect = 'missing_bytes' | 'hash_mismatch' | 'wrong_generation';
type Target = { agent: string; domain: string; stage: string; action: string };

function sha256(bytes: Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function writeArtifact(root: string, name: string, bytes: Buffer) {
  const file = path.join(root, name);
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  return {
    ref: pathToFileURL(file).href,
    sha256: `sha256:${sha256(bytes)}`,
    contentRef: `opl-content://sha256/${sha256(bytes)}`,
    bytes,
  };
}

function createBuildFixture(root: string, target: Target, defect?: Defect) {
  const artifactRoot = path.join(root, 'provider-output', target.agent);
  fs.mkdirSync(artifactRoot, { recursive: true });
  const designRequest = request({
    request_id: `request:${target.agent}`,
    target_agent_id: target.agent,
    target_domain_id: target.domain,
    objective: `Build the ${target.domain} fixture package.`,
    delivery_policy: { activation_mode: 'qualify_only', max_generations: 1 },
  });
  const resources = Object.fromEntries(contentKinds.map((kind) => [kind, writeArtifact(
    artifactRoot,
    `${kind}.blob`,
    kind === 'schema'
      ? canonicalJsonBytes({ type: 'object', properties: { value: { type: 'string' } }, required: ['value'] })
      : Buffer.from(`${target.domain} ${kind} fixture bytes\n`),
  )])) as Record<typeof contentKinds[number], ReturnType<typeof writeArtifact>>;
  const output = blueprint(designRequest, defect === 'wrong_generation' ? 1 : 0, resources.prompt.contentRef);
  output.content_refs = {
    prompt_refs: [resources.prompt.contentRef],
    skill_refs: [resources.skill.contentRef],
    knowledge_refs: [resources.knowledge.contentRef],
    helper_refs: [resources.helper.contentRef],
    model_refs: [resources.model.contentRef],
    tool_refs: [resources.tool.contentRef],
    schema_refs: [resources.schema.contentRef],
  };
  output.stage_graph.entry_stage_id = target.stage;
  output.stage_graph.stages[0] = {
    ...output.stage_graph.stages[0]!,
    stage_id: target.stage,
    skill_refs: output.content_refs.skill_refs,
    knowledge_refs: output.content_refs.knowledge_refs,
  };
  output.actions[0] = {
    ...output.actions[0]!,
    action_id: target.action,
    entry_stage_id: target.stage,
    input_schema_ref: resources.schema.contentRef,
    output_schema_ref: resources.schema.contentRef,
  };
  output.artifact_contracts[0]!.schema_ref = resources.schema.contentRef;
  const protocol = writeArtifact(artifactRoot, 'agent-blueprint.json', canonicalJsonBytes(output));
  const transported = [protocol, ...contentKinds
    .filter((kind) => defect !== 'missing_bytes' || kind !== 'knowledge')
    .map((kind) => resources[kind])];
  if (defect === 'hash_mismatch') {
    fs.writeFileSync(fileURLToPath(resources.prompt.ref), 'tampered fixture bytes\n');
  }
  const observedStages: string[] = [];
  const stages = provider.operations.design.required_stage_refs;
  const workflowId = (stage: string) => `fixture:${target.agent}:${stage}`;
  const gateway: FoundryProviderStageRunGateway = {
    async cancel() {},
    async launch() {
      return { workflow_id: workflowId(stages[0]!) };
    },
    async query(id) {
      const index = stages.findIndex((stage) => workflowId(stage) === id);
      assert.notEqual(index, -1);
      const stage = stages[index]!;
      observedStages.push(stage);
      const terminal = stage === provider.operations.design.terminal_stage_ref;
      return {
        stage_run_id: `fixture-stage:${target.agent}:${stage}`,
        workflow_id: id,
        stage_id: stage,
        status: 'completed',
        artifact_refs: terminal ? transported.map((artifact) => artifact.ref) : [],
        artifact_hashes: terminal ? transported.map((artifact) => artifact.sha256) : [],
        next_stage_run_launch: terminal ? null : { target_workflow_id: workflowId(stages[index + 1]!) },
        current_role: null,
        attempts: [],
        blocked_reason: null,
      };
    },
  };
  const compiler = new ContentAddressedCandidateCompiler(root);
  const objects = new FileFoundryObjectStore(root);
  const events = new LedgerFoundryEventStore(root);
  const versions = new LedgerVersionRegistry(root);
  let evaluationCalls = 0;
  const unexpectedEvaluation = async (): Promise<never> => {
    evaluationCalls += 1;
    throw new Error('Package construction must not execute qualification or canary evaluation.');
  };
  const kernel = new FoundryKernel({
    designer: new ManifestFoundryDesignerAdapter({
      checkout_root: providerRoot,
      provider_source_digest: `sha256:${'a'.repeat(64)}`,
      provider_manifest: provider,
      invoker: new StageRunFoundryProviderInvoker({ gateway, storage_root: root }),
    }),
    compiler,
    objects,
    events,
    versions,
    operationResults: new LedgerFoundryOperationResultJournal(root),
    evaluator: {
      evaluator_id: 'fixture:unconfigured-independent-evaluator',
      qualification_capability: { status: 'unavailable', execution_mode: 'unconfigured', protected_fact_authority: 'none' },
      evaluate: unexpectedEvaluation,
      canary: unexpectedEvaluation,
    },
  });
  return { kernel, compiler, objects, events, versions, designRequest, output, resources, observedStages,
    evaluationCalls: () => evaluationCalls };
}

test('fixture provider builds distinct domain packages through Kernel admission without evaluation', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-acceptance-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const candidates = new Set<string>();
  for (const target of [
    { agent: 'fixture-ibd-agent', domain: 'fixture_ibd_evidence', stage: 'answer-evidence', action: 'answer-question' },
    { agent: 'fixture-book-agent', domain: 'fixture_publishing', stage: 'outline-book', action: 'plan-book' },
  ]) {
    const fixture = createBuildFixture(root, target);
    const runId = `run:${target.agent}`;
    assert.equal((await fixture.kernel.startRun({ request: fixture.designRequest, run_id: runId })).state, 'accepted');
    for (const state of ['designing', 'materializing', 'evaluating']) {
      assert.equal((await fixture.kernel.advanceRunStep(runId)).run.state, state);
    }
    const inspection = await fixture.kernel.inspectRun(runId);
    const events = await new LedgerFoundryEventStore(root).read(runId);
    verifyFoundryEventChain(events);
    assert.deepEqual(events.map((event) => event.event_type), [
      'foundry_run_accepted', 'design_started', 'blueprint_admitted', 'candidate_materialized',
    ]);
    const receiptEvent = events.at(-1)!;
    assert.equal(typeof receiptEvent.payload.candidate_record_digest, 'string');
    const recordDigest = receiptEvent.payload.candidate_record_digest as string;
    const record = await new FileFoundryObjectStore(root).get<MaterializedCandidate>(recordDigest);
    assert.ok(record);
    assert.equal(record.surface_kind, 'opl_foundry_materialized_candidate');
    assert.equal(foundryContentDigest(record), recordDigest);
    assert.equal(record.candidate_digest, inspection.run.candidate_digest);
    assert.equal(record.blueprint_digest, foundryContentDigest(fixture.output));
    assert.equal(record.target_agent_id, target.agent);
    assert.equal(record.target_domain_id, target.domain);
    assert.equal(record.candidate_ref, `opl://foundry/candidate/${record.candidate_digest}`);
    const directory = fixture.compiler.candidateDirectory(record.candidate_digest);
    const index = JSON.parse(fs.readFileSync(path.join(directory, 'candidate-index.json'), 'utf8')) as {
      surface_kind: string; version: string; blueprint_digest: string; candidate_digest: string;
      files: Array<{ path: string; sha256: string; byte_size: number }>;
    };
    assert.equal(index.candidate_digest, record.candidate_digest);
    const { candidate_digest: ignored, ...digestInput } = index;
    assert.equal(foundryContentDigest(digestInput), record.candidate_digest);
    for (const entry of index.files) {
      const bytes = fs.readFileSync(path.join(directory, entry.path));
      assert.equal(sha256(bytes), entry.sha256, entry.path);
      assert.equal(bytes.byteLength, entry.byte_size, entry.path);
    }
    const pack = JSON.parse(fs.readFileSync(path.join(directory, 'agent/agent-pack.json'), 'utf8'));
    assert.equal(foundryContentDigest(pack), record.manifest_digest);
    assert.equal(pack.actions[0].action_id, target.action);
    assert.equal(pack.entry_stage_id, target.stage);
    assert.equal(pack.conformance.status, 'valid');
    const lock = JSON.parse(fs.readFileSync(path.join(directory, 'contracts/resource-lock.json'), 'utf8')) as {
      resources: Array<{ kind: typeof contentKinds[number]; pack_path: string; declared_ref: string }>;
    };
    assert.deepEqual(lock.resources.map((entry) => entry.kind), contentKinds);
    for (const resource of lock.resources) {
      assert.equal(resource.declared_ref, fixture.resources[resource.kind].contentRef);
      assert.deepEqual(fs.readFileSync(path.join(directory, resource.pack_path)), fixture.resources[resource.kind].bytes);
    }
    assert.deepEqual(fixture.observedStages, provider.operations.design.required_stage_refs);
    assert.equal(fixture.evaluationCalls(), 0);
    assert.equal(inspection.run.version_digest, null);
    assert.equal(inspection.activation.active_version_digest, null);
    assert.equal((await fixture.versions.list(target.agent, target.domain)).length, 0);
    candidates.add(record.candidate_digest);
  }
  assert.equal(candidates.size, 2);
});

for (const defect of ['missing_bytes', 'hash_mismatch', 'wrong_generation'] as const) {
  test(`fixture package admission rejects ${defect} without a materialization receipt`, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-package-rejection-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const fixture = createBuildFixture(root, {
      agent: 'fixture-rejected-agent', domain: 'fixture_rejected', stage: 'analyse', action: 'run-analysis',
    }, defect);
    const runId = `run:reject:${defect}`;
    await fixture.kernel.startRun({ request: fixture.designRequest, run_id: runId });
    assert.equal((await fixture.kernel.advanceRunStep(runId)).run.state, 'designing');
    const inspection = await fixture.kernel.advanceRunStep(runId);
    assert.equal(inspection.run.state, 'quarantined');
    assert.equal(inspection.run.candidate_digest, null);
    const events = await fixture.events.read(runId);
    assert.equal(events.at(-1)!.event_type, 'foundry_output_quarantined');
    const expectedReason = {
      missing_bytes: /did not transport bytes/,
      hash_mismatch: /bytes do not match the StageRun hash/,
      wrong_generation: /Initial AgentBlueprint is stale or has the wrong generation/,
    }[defect];
    assert.match(String(events.at(-1)!.payload.failure_message), expectedReason);
    assert.equal(events.some((event) => event.event_type === 'candidate_materialized'), false);
    assert.equal(fixture.evaluationCalls(), 0);
  });
}
