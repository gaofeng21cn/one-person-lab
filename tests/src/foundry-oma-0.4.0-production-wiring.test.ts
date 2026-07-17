import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import { assertRepoJsonSchemaPayload } from '../../src/kernel/repo-json-schema.ts';
import {
  ManifestFoundryDesignerAdapter,
  readFoundryProviderManifest,
} from '../../src/modules/foundry/designer-adapter.ts';
import {
  assertBlueprintSatisfiesDesignRequest,
  assertEvaluationEvidenceFacts,
  foundryFrozenEvaluationPlanDigest,
} from '../../src/modules/foundry/evaluation-runtime.ts';
import {
  FOUNDRY_PROTOCOL_VERSION,
  foundryContentDigest,
  validateAgentBlueprint,
  validateDesignRequest,
  validateEvidenceBundle,
  validateEvolutionProposal,
  type AgentBlueprint,
  type DesignRequest,
  type EvidenceBundle,
  type EvolutionProposal,
} from '../../src/modules/foundry/protocol.ts';
import type { FoundryActivityIdentity } from '../../src/modules/foundry/ports.ts';
import { ContentAddressedCandidateCompiler } from '../../src/modules/ledger/foundry-persistent-adapters.ts';
import {
  StageRunFoundryProviderInvoker,
  type FoundryProviderStageRunGateway,
} from '../../src/modules/runway/foundry-provider-stage-run.ts';
import { createProductionFoundryKernel } from '../../src/modules/runway/foundry-production-runtime.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureRoot = path.join(repoRoot, 'tests/fixtures/oma-0.4.0');
const protocolFixtureRoot = path.join(fixtureRoot, 'foundry-protocol');
const exactOmaCommit = '33a91c7d7f6f71670c13ae63024c54f9063945ee';

type FixtureLock = {
  surface_kind: string;
  version: string;
  package_id: string;
  package_version: string;
  source_repo: string;
  source_commit: string;
  evidence_class: string;
  live_model_proof: boolean;
  files: Array<{ path: string; source_path: string; sha256: string }>;
};

type Artifact = {
  bytes: Buffer;
  ref: string;
  sha256: string;
  content_ref: string;
};

const contentKinds = ['prompt', 'skill', 'knowledge', 'helper', 'model', 'tool', 'schema'] as const;
type ContentKind = typeof contentKinds[number];

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function sha256(bytes: string | Buffer) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function writeArtifact(root: string, name: string, bytes: Buffer): Artifact {
  const file = path.join(root, 'provider-outputs', name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  const digest = sha256(bytes);
  return {
    bytes,
    ref: pathToFileURL(file).href,
    sha256: `sha256:${digest}`,
    content_ref: `opl-content://sha256/${digest}`,
  };
}

function resourceBytes(kind: ContentKind) {
  if (kind === 'schema') {
    return canonicalJsonBytes({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { request: { type: 'string' } },
      required: ['request'],
      additionalProperties: false,
    });
  }
  return Buffer.from(`OMA 0.4.0 deterministic ${kind} transport fixture\n`, 'utf8');
}

function transportResources(root: string) {
  return Object.fromEntries(contentKinds.map((kind) => [
    kind,
    writeArtifact(root, `${kind}.blob`, resourceBytes(kind)),
  ])) as Record<ContentKind, Artifact>;
}

function transportableBlueprint(
  request: DesignRequest,
  resources: Record<ContentKind, Artifact>,
): AgentBlueprint {
  return {
    surface_kind: 'opl_foundry_agent_blueprint',
    version: FOUNDRY_PROTOCOL_VERSION,
    blueprint_id: 'blueprint:oma-0.4.0-deterministic-transport',
    target_agent_id: request.target_agent_id,
    target_domain_id: request.target_domain_id,
    target_version_ref: request.target_version_ref,
    design_request_digest: foundryContentDigest(request),
    generation: 0,
    stage_graph: {
      entry_stage_id: 'evidence-synthesis',
      stages: [{
        stage_id: 'evidence-synthesis',
        stage_kind: 'semantic',
        goal: 'Produce a deterministic claim-support map for production wiring verification.',
        input_artifact_types: ['source_bundle'],
        output_artifact_types: ['research_brief'],
        prompt_ref: resources.prompt.content_ref,
        skill_refs: [resources.skill.content_ref],
        knowledge_refs: [resources.knowledge.content_ref],
        capability_refs: [...request.constraints.capability_refs],
        next_stage_ids: [],
      }],
    },
    actions: [{
      action_id: 'produce-research-brief',
      summary: 'Produce the deterministic research brief fixture.',
      entry_stage_id: 'evidence-synthesis',
      input_schema_ref: resources.schema.content_ref,
      output_schema_ref: resources.schema.content_ref,
    }],
    artifact_contracts: [{
      artifact_type: 'research_brief',
      schema_ref: resources.schema.content_ref,
      authority_owner_ref: 'opl://owner/fixture-research',
    }],
    content_refs: {
      prompt_refs: [resources.prompt.content_ref],
      skill_refs: [resources.skill.content_ref],
      knowledge_refs: [resources.knowledge.content_ref],
      helper_refs: [resources.helper.content_ref],
      model_refs: [resources.model.content_ref],
      tool_refs: [resources.tool.content_ref],
      schema_refs: [resources.schema.content_ref],
    },
    capability_requirements: [...request.constraints.capability_refs],
    authority_policy: {
      truth_owner_ref: 'opl://owner/fixture-research',
      artifact_owner_ref: 'opl://owner/fixture-research',
      quality_owner_ref: 'opl://owner/fixture-research',
      permission_refs: [...request.constraints.permission_refs],
      generated_agent_can_modify_versions: false,
      generated_agent_can_modify_evaluation: false,
      generated_agent_can_modify_permissions: false,
      generated_agent_can_modify_activation: false,
    },
    memory_policy: {
      memory_classes: ['task_observation'],
      retention_refs: ['opl://retention/fixture-research/default'],
      write_authority_refs: ['opl://owner/fixture-research'],
    },
    assumptions: ['This payload is deterministic transport evidence, not live OMA model output.'],
    design_evidence_refs: [...request.source_refs],
    eval_spec: {
      eval_spec_id: 'eval:oma-0.4.0-deterministic-transport',
      public_cases: [{
        case_id: 'public-claim-support',
        test_ref: 'opl://test/fixture-research-agent/public-claim-support',
        weight: 1,
        required: true,
      }],
      protected_requirements: request.constraints.privacy_requirements.map((category) => ({
        category,
        minimum_case_count: 1,
      })),
      gates: [{
        gate_id: 'required-quality-floor',
        metric: 'score',
        operator: 'gte',
        threshold: 0.9,
        required: true,
      }],
      baseline_comparison: { required: false, regression_tolerance: 0 },
      independent_evaluator_required: true,
    },
    risk_hint: 'low',
  };
}

function deterministicEvidence(request: DesignRequest, blueprint: AgentBlueprint): EvidenceBundle {
  return {
    surface_kind: 'opl_foundry_evidence_bundle',
    version: FOUNDRY_PROTOCOL_VERSION,
    evidence_id: 'evidence:oma-0.4.0-deterministic-transport',
    target_agent_id: request.target_agent_id,
    target_domain_id: request.target_domain_id,
    target_version_ref: request.target_version_ref,
    blueprint_digest: foundryContentDigest(blueprint),
    candidate_digest: `sha256:${'6'.repeat(64)}`,
    baseline_version_digest: null,
    frozen_test_plan_digest: foundryFrozenEvaluationPlanDigest(blueprint.eval_spec),
    public_results: [{
      case_id: 'public-claim-support',
      status: 'fail',
      score: 0.5,
      evidence_refs: ['opl://evidence/oma-0.4.0-deterministic-public'],
    }],
    baseline_public_results: null,
    baseline_protected_aggregates: null,
    protected_aggregates: request.constraints.privacy_requirements.map((category) => ({
      category,
      total: 1,
      passed: 1,
      failed: 0,
      score: 1,
    })),
    independent_review: {
      evaluator_ref: 'opl://evaluator/deterministic-independent',
      evaluation_execution_ref: 'opl://evaluation-execution/oma-0.4.0-deterministic',
      review_execution_ref: 'opl://review-execution/oma-0.4.0-deterministic',
      verdict: 'fail',
      findings: ['The deterministic fixture intentionally requests a no-change diagnosis.'],
      evidence_refs: ['opl://evidence/oma-0.4.0-deterministic-review'],
    },
    candidate_cost_observations: { total_usd: 1 },
    candidate_latency_observations: { p95_seconds: 1 },
    safety_observations: [],
    safety_delta: { policy_violation_count: 0 },
    cost_delta: { total_usd: 1 },
    latency_delta: { p95_seconds: 1 },
    failure_classification: [{
      failure_class: 'semantic_quality_gap',
      gate_id: 'required-quality-floor',
      severity: 'medium',
      evidence_refs: ['opl://evidence/oma-0.4.0-deterministic-public'],
    }],
    qualified: false,
    gate_score: 0.5,
    provenance: {
      foundry_run_id: 'run:oma-0.4.0-deterministic',
      generation: 0,
      producer_id: 'opl-foundry-deterministic-fixture',
      evaluated_at: '2026-07-17T00:00:00.000Z',
      source_refs: ['opl://evaluation-execution/oma-0.4.0-deterministic'],
    },
  };
}

function noChangeProposal(
  request: DesignRequest,
  blueprint: AgentBlueprint,
  evidence: EvidenceBundle,
): EvolutionProposal {
  return {
    surface_kind: 'opl_foundry_evolution_proposal',
    version: FOUNDRY_PROTOCOL_VERSION,
    proposal_id: 'proposal:oma-0.4.0-deterministic-no-change',
    target_agent_id: request.target_agent_id,
    target_domain_id: request.target_domain_id,
    target_version_ref: request.target_version_ref,
    blueprint_digest: foundryContentDigest(blueprint),
    evidence_digest: foundryContentDigest(evidence),
    root_causes: [{
      failure_class: 'semantic_quality_gap',
      explanation: 'The deterministic evidence does not admit a safe semantic change.',
      evidence_refs: ['opl://evidence/oma-0.4.0-deterministic-public'],
    }],
    next_blueprint: blueprint,
    semantic_diff: [],
    expected_benefits: [],
    new_tests: [],
    trade_offs: ['The deterministic candidate remains unchanged.'],
    risk_hints: [],
  };
}

function stageState(input: {
  operation: 'design' | 'diagnose';
  stage: string;
  next: string | null;
  artifacts?: Artifact[];
}) {
  return {
    surface_kind: 'temporal_stage_run_query',
    provider_kind: 'temporal',
    stage_run_id: `stage-run:${input.operation}:${input.stage}`,
    workflow_id: `workflow:${input.operation}:${input.stage}`,
    stage_id: input.stage,
    status: 'completed',
    artifact_refs: (input.artifacts ?? []).map((entry) => entry.ref),
    artifact_hashes: (input.artifacts ?? []).map((entry) => entry.sha256),
    next_stage_run_launch: input.next
      ? { target_workflow_id: `workflow:${input.operation}:${input.next}` }
      : null,
    blocked_reason: null,
  };
}

test('OMA 0.4.0 deterministic fixture bytes are locked to exact commit without claiming live model proof', () => {
  const lock = readJson<FixtureLock>(path.join(fixtureRoot, 'source-lock.json'));
  assert.equal(lock.surface_kind, 'opl_foundry_oma_fixture_lock');
  assert.equal(lock.version, 'opl-foundry-oma-fixture-lock.v1');
  assert.equal(lock.package_id, 'oma');
  assert.equal(lock.package_version, '0.4.0');
  assert.equal(lock.source_commit, exactOmaCommit);
  assert.equal(lock.evidence_class, 'deterministic_local_fixture');
  assert.equal(lock.live_model_proof, false);
  assert.deepEqual(lock.files.map(({ path: fixturePath, source_path: sourcePath }) => ({
    fixture_path: fixturePath,
    source_path: sourcePath,
  })), [
    { fixture_path: 'foundry_provider.json', source_path: 'contracts/foundry_provider.json' },
    {
      fixture_path: 'foundry-protocol/design-request.json',
      source_path: 'contracts/fixtures/foundry-protocol/design-request.json',
    },
    {
      fixture_path: 'foundry-protocol/agent-blueprint.json',
      source_path: 'contracts/fixtures/foundry-protocol/agent-blueprint.json',
    },
    {
      fixture_path: 'foundry-protocol/evidence-bundle.json',
      source_path: 'contracts/fixtures/foundry-protocol/evidence-bundle.json',
    },
    {
      fixture_path: 'foundry-protocol/evolution-proposal.json',
      source_path: 'contracts/fixtures/foundry-protocol/evolution-proposal.json',
    },
  ]);

  const payload = readJson<{ package_id: string; package_version: string; source_commit: string }>(
    path.join(repoRoot, 'contracts/opl-framework/packages/payloads/oma-0.4.0.json'),
  );
  assert.deepEqual(
    { package_id: payload.package_id, package_version: payload.package_version, source_commit: payload.source_commit },
    { package_id: 'oma', package_version: '0.4.0', source_commit: exactOmaCommit },
  );
  for (const entry of lock.files) {
    assert.equal(
      `sha256:${sha256(fs.readFileSync(path.join(fixtureRoot, entry.path)))}`,
      entry.sha256,
      entry.path,
    );
  }
});

test('OMA 0.4.0 core Foundry fixtures pass Framework conformance without checkout-dependent skips', () => {
  const requestValue = readJson<unknown>(path.join(protocolFixtureRoot, 'design-request.json'));
  const blueprintValue = readJson<unknown>(path.join(protocolFixtureRoot, 'agent-blueprint.json'));
  const evidenceValue = readJson<unknown>(path.join(protocolFixtureRoot, 'evidence-bundle.json'));
  const proposalValue = readJson<unknown>(path.join(protocolFixtureRoot, 'evolution-proposal.json'));
  for (const [schemaRef, payload] of [
    ['contracts/opl-framework/foundry-design-request.schema.json', requestValue],
    ['contracts/opl-framework/foundry-agent-blueprint.schema.json', blueprintValue],
    ['contracts/opl-framework/foundry-evidence-bundle.schema.json', evidenceValue],
    ['contracts/opl-framework/foundry-evolution-proposal.schema.json', proposalValue],
  ] as const) {
    assert.equal(assertRepoJsonSchemaPayload({
      repoRoot,
      schemaRef,
      payload,
      label: `OMA 0.4.0 fixture ${schemaRef}`,
    }).status, 'valid');
  }

  const request = validateDesignRequest(requestValue);
  const blueprint = validateAgentBlueprint(blueprintValue);
  const evidence = validateEvidenceBundle(evidenceValue);
  const proposal = validateEvolutionProposal(proposalValue);
  assert.equal(blueprint.design_request_digest, foundryContentDigest(request));
  assert.equal(evidence.blueprint_digest, foundryContentDigest(blueprint));
  assert.equal(proposal.blueprint_digest, foundryContentDigest(blueprint));
  assert.equal(proposal.evidence_digest, foundryContentDigest(evidence));
  assert.notEqual(
    evidence.independent_review.evaluation_execution_ref,
    evidence.independent_review.review_execution_ref,
  );
  assertBlueprintSatisfiesDesignRequest(request, blueprint);
  assert.equal(evidence.frozen_test_plan_digest, foundryFrozenEvaluationPlanDigest(blueprint.eval_spec));
  assertEvaluationEvidenceFacts({
    request,
    spec: blueprint.eval_spec,
    evidence,
    baseline_present: false,
  });

  const provider = readFoundryProviderManifest(fixtureRoot, 'foundry_provider.json');
  assert.equal(provider.provider_id, 'oma');
  assert.equal(provider.domain_id, 'agent_engineering');
  assert.deepEqual(provider.projection_policy.public_action_ids, ['engineer-agent']);
  assert.equal(provider.authority_boundary.provider_owns_foundry_run_state, false);
  assert.equal(provider.authority_boundary.provider_owns_evaluation_execution, false);
  assert.equal(provider.authority_boundary.provider_owns_versions_or_activation, false);
});

test('OMA 0.4.0 deterministic local wiring traverses declared StageRun semantics and compiles exact transported bytes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-oma-0.4.0-wiring-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const provider = readFoundryProviderManifest(fixtureRoot, 'foundry_provider.json');
  const request = validateDesignRequest(readJson(path.join(protocolFixtureRoot, 'design-request.json')));
  const resources = transportResources(root);
  const blueprint = transportableBlueprint(request, resources);
  const evidence = deterministicEvidence(request, blueprint);
  const proposal = noChangeProposal(request, blueprint, evidence);
  const designArtifact = writeArtifact(root, 'agent-blueprint.json', canonicalJsonBytes(blueprint));
  const proposalArtifact = writeArtifact(root, 'evolution-proposal.json', canonicalJsonBytes(proposal));
  const resourceArtifacts = contentKinds.map((kind) => resources[kind]);
  const queriedStages = { design: [] as string[], diagnose: [] as string[] };
  const gateway: FoundryProviderStageRunGateway = {
    async launch(input) {
      const operation = input.activity.phase;
      assert.ok(operation === 'design' || operation === 'diagnose');
      assert.equal(input.provider.provider_id, 'oma');
      assert.equal(input.checkout_root, fs.realpathSync.native(fixtureRoot));
      assert.equal(input.stage_id, provider.operations[operation].entry_stage_ref);
      assert.equal(input.input_artifact_refs.length, 1);
      assert.equal(input.input_artifact_hashes.length, 1);
      return { workflow_id: `workflow:${operation}:${input.stage_id}` };
    },
    async query(workflowId) {
      const match = /^workflow:(design|diagnose):(.+)$/.exec(workflowId);
      assert.ok(match);
      const operation = match[1] as 'design' | 'diagnose';
      const stage = match[2]!;
      const stages = provider.operations[operation].required_stage_refs;
      const index = stages.indexOf(stage);
      assert.notEqual(index, -1);
      queriedStages[operation].push(stage);
      const next = stages[index + 1] ?? null;
      const artifacts = next === null
        ? [operation === 'design' ? designArtifact : proposalArtifact, ...resourceArtifacts]
        : [];
      return stageState({ operation, stage, next, artifacts });
    },
  };
  const adapter = new ManifestFoundryDesignerAdapter({
    checkout_root: fixtureRoot,
    provider_manifest_ref: 'foundry_provider.json',
    invoker: new StageRunFoundryProviderInvoker({
      gateway,
      storage_root: root,
      poll_interval_ms: 1,
      timeout_ms: 1_000,
    }),
  });
  assert.equal(adapter.producer_id, 'foundry-provider:oma');

  const designActivity: FoundryActivityIdentity = {
    run_id: 'run:oma-0.4.0-deterministic',
    iteration: 0,
    phase: 'design',
    input_digest: foundryContentDigest(request),
  };
  const designed = await adapter.design(request, designActivity);
  assert.deepEqual(designed, blueprint);
  assertBlueprintSatisfiesDesignRequest(request, designed);
  assert.deepEqual(queriedStages.design, provider.operations.design.required_stage_refs);

  const compiler = new ContentAddressedCandidateCompiler(root);
  const candidate = await compiler.materialize({
    run_id: designActivity.run_id,
    blueprint: designed,
    blueprint_digest: foundryContentDigest(designed),
  });
  assert.match(candidate.candidate_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(
    compiler.candidateDirectory(candidate.candidate_digest),
    'contracts/resource-lock.json',
  )), true);

  const diagnosed = await adapter.diagnose({
    request,
    blueprint: designed,
    evidence,
    activity: {
      run_id: designActivity.run_id,
      iteration: 0,
      phase: 'diagnose',
      input_digest: foundryContentDigest(evidence),
    },
  });
  assert.deepEqual(diagnosed, proposal);
  assert.deepEqual(queriedStages.diagnose, provider.operations.diagnose.required_stage_refs);
});

test('production composition selects OMA 0.4.0 by default without claiming a live model run', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-oma-0.4.0-production-composition-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const checkout = path.join(root, 'checkout');
  fs.mkdirSync(path.join(checkout, 'contracts'), { recursive: true });
  fs.copyFileSync(
    path.join(fixtureRoot, 'foundry_provider.json'),
    path.join(checkout, 'contracts/foundry_provider.json'),
  );
  const resolvedAgentIds: string[] = [];
  const kernel = await createProductionFoundryKernel({
    root_override: path.join(root, 'state'),
    resolve_managed_checkout: (async (input: { domainId: string }) => {
      resolvedAgentIds.push(input.domainId);
      return { checkout_root: checkout };
    }) as never,
  });
  assert.deepEqual(resolvedAgentIds, ['oma']);
  assert.equal(typeof kernel.startRun, 'function');
  assert.equal(readJson<FixtureLock>(path.join(fixtureRoot, 'source-lock.json')).live_model_proof, false);
});
