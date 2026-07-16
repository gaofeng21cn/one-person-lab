import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  FOUNDRY_PROTOCOL_VERSION,
  FoundryKernel,
  InMemoryOwnerGate,
  foundryContentDigest,
  foundryFrozenEvaluationPlanDigest,
  type AgentBlueprint,
  type DesignRequest,
  type DesignerPort,
  type EvaluationExecutor,
  type EvidenceBundle,
  type EvolutionProposal,
  type FoundryRunInspection,
  type MaterializedCandidate,
  type OwnerGateAction,
  type OwnerGateDecision,
} from '../../src/modules/foundry/index.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
  FileFoundryObjectStore,
  LedgerFoundryEventStore,
  LedgerFoundryOperationResultJournal,
  LedgerVersionRegistry,
} from '../../src/modules/ledger/index.ts';
import {
  DefaultHostedAgentRuntimeBindingResolver,
  HostedFoundryActivationRuntime,
  runStandardAgentAction,
} from '../../src/modules/runway/index.ts';

type StoredContent = ReturnType<FileFoundryContentStore['put']>;

type FixtureResources = {
  promptV1: StoredContent;
  promptBroken: StoredContent;
  promptV2: StoredContent;
  skill: StoredContent;
  knowledge: StoredContent;
  model: StoredContent;
  inputSchema: StoredContent;
  outputSchema: StoredContent;
};

type HostedInvocationObservation = {
  prompt_text: string;
  candidate_digest: string;
  dependency_closure_digest: string;
};

const TARGET_AGENT_ID = 'foundry-e2e-agent';
const TARGET_DOMAIN_ID = 'foundry_e2e_domain';
const OWNER_AUTHORITY_REF = 'owner-gate:foundry-e2e';
const NOW = '2026-07-17T00:00:00.000Z';

function resources(store: FileFoundryContentStore): FixtureResources {
  return {
    promptV1: store.put(Buffer.from('foundry e2e prompt version one\n')),
    promptBroken: store.put(Buffer.from('foundry e2e prompt rejected candidate\n')),
    promptV2: store.put(Buffer.from('foundry e2e prompt version two\n')),
    skill: store.put(Buffer.from('foundry e2e skill\n')),
    knowledge: store.put(Buffer.from('foundry e2e knowledge\n')),
    model: store.put(Buffer.from('foundry e2e model lock\n')),
    inputSchema: store.put(Buffer.from(JSON.stringify({
      type: 'object',
      required: ['workspace_root', 'value'],
      properties: {
        workspace_root: { type: 'string', minLength: 1 },
        value: { type: 'integer' },
      },
      additionalProperties: false,
    }))),
    outputSchema: store.put(Buffer.from(JSON.stringify({
      type: 'object',
      additionalProperties: true,
    }))),
  };
}

function designRequest(input: {
  requestId: string;
  mode: 'create' | 'improve';
  targetVersionRef: string | null;
}): DesignRequest {
  return {
    surface_kind: 'opl_foundry_design_request',
    version: FOUNDRY_PROTOCOL_VERSION,
    request_id: input.requestId,
    mode: input.mode,
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    target_version_ref: input.targetVersionRef,
    objective: 'Build and evolve an invocable content-addressed Agent.',
    acceptance_criteria: ['The generated delivery action passes its required evaluation gate.'],
    non_goals: ['No domain truth or Owner authority is delegated to the generated Agent.'],
    source_refs: ['source:foundry-e2e'],
    constraints: {
      capability_refs: ['capability:text'],
      permission_refs: [],
      privacy_requirements: ['privacy:no-sensitive-data'],
      cost_limits: { usd: 1 },
      latency_limits: { milliseconds: 1_000 },
    },
    delivery_policy: { activation_mode: 'activate', max_generations: 3 },
  };
}

function blueprint(
  request: DesignRequest,
  fixture: FixtureResources,
  generation: number,
  promptRef: string,
): AgentBlueprint {
  return {
    surface_kind: 'opl_foundry_agent_blueprint',
    version: FOUNDRY_PROTOCOL_VERSION,
    blueprint_id: `blueprint:${request.request_id}:${generation}`,
    target_agent_id: request.target_agent_id,
    target_domain_id: request.target_domain_id,
    target_version_ref: request.target_version_ref,
    design_request_digest: foundryContentDigest(request),
    generation,
    stage_graph: {
      entry_stage_id: 'deliver',
      stages: [{
        stage_id: 'deliver',
        stage_kind: 'domain_delivery',
        goal: 'Deliver the accepted fixture output.',
        input_artifact_types: ['request'],
        output_artifact_types: ['delivery'],
        prompt_ref: promptRef,
        skill_refs: [fixture.skill.ref],
        knowledge_refs: [fixture.knowledge.ref],
        capability_refs: ['capability:text'],
        next_stage_ids: [],
      }],
    },
    actions: [{
      action_id: 'deliver',
      summary: 'Deliver the fixture output.',
      entry_stage_id: 'deliver',
      input_schema_ref: fixture.inputSchema.ref,
      output_schema_ref: fixture.outputSchema.ref,
    }],
    artifact_contracts: [{
      artifact_type: 'delivery',
      schema_ref: fixture.outputSchema.ref,
      authority_owner_ref: 'owner:foundry-e2e',
    }],
    content_refs: {
      prompt_refs: [promptRef],
      skill_refs: [fixture.skill.ref],
      knowledge_refs: [fixture.knowledge.ref],
      helper_refs: [],
      model_refs: [fixture.model.ref],
      tool_refs: [],
      schema_refs: [fixture.inputSchema.ref, fixture.outputSchema.ref],
    },
    capability_requirements: ['capability:text'],
    authority_policy: {
      truth_owner_ref: 'owner:foundry-e2e',
      artifact_owner_ref: 'owner:foundry-e2e',
      quality_owner_ref: 'owner:foundry-e2e',
      permission_refs: [],
      generated_agent_can_modify_versions: false,
      generated_agent_can_modify_evaluation: false,
      generated_agent_can_modify_permissions: false,
      generated_agent_can_modify_activation: false,
    },
    memory_policy: {
      memory_classes: ['delivery-observation'],
      retention_refs: ['retention:foundry-e2e'],
      write_authority_refs: ['owner:foundry-e2e'],
    },
    assumptions: ['The Framework hosted Stage runtime is available.'],
    design_evidence_refs: ['evidence:foundry-e2e-design'],
    eval_spec: {
      eval_spec_id: 'eval:foundry-e2e',
      public_cases: [{
        case_id: 'case:required',
        test_ref: 'test:foundry-e2e-required',
        weight: 1,
        required: true,
      }],
      protected_requirements: [{
        category: 'privacy:no-sensitive-data',
        minimum_case_count: 1,
      }],
      gates: [{
        gate_id: 'gate:required',
        metric: 'score',
        operator: 'gte',
        threshold: 1,
        required: true,
      }],
      baseline_comparison: {
        required: request.mode !== 'create',
        regression_tolerance: 0,
      },
      independent_evaluator_required: true,
    },
    risk_hint: 'low',
  };
}

function evidence(input: {
  runId: string;
  request: DesignRequest;
  blueprint: AgentBlueprint;
  candidate: MaterializedCandidate;
  baselineDigest: string | null;
  qualified: boolean;
}): EvidenceBundle {
  const result = input.qualified ? 'pass' as const : 'fail' as const;
  return {
    surface_kind: 'opl_foundry_evidence_bundle',
    version: FOUNDRY_PROTOCOL_VERSION,
    evidence_id: `evidence:${input.runId}:${input.blueprint.generation}:${result}`,
    target_agent_id: input.request.target_agent_id,
    target_domain_id: input.request.target_domain_id,
    target_version_ref: input.request.target_version_ref,
    blueprint_digest: foundryContentDigest(input.blueprint),
    candidate_digest: input.candidate.candidate_digest,
    baseline_version_digest: input.baselineDigest,
    frozen_test_plan_digest: foundryFrozenEvaluationPlanDigest(input.blueprint.eval_spec),
    public_results: [{
      case_id: 'case:required',
      status: result,
      score: input.qualified ? 1 : 0,
      evidence_refs: ['evidence:foundry-e2e-public'],
    }],
    baseline_public_results: input.baselineDigest === null ? null : [{
      case_id: 'case:required',
      status: 'pass',
      score: 1,
      evidence_refs: ['evidence:foundry-e2e-baseline-public'],
    }],
    baseline_protected_aggregates: input.baselineDigest === null ? null : [{
      category: 'privacy:no-sensitive-data',
      total: 1,
      passed: 1,
      failed: 0,
      score: 1,
    }],
    protected_aggregates: [{
      category: 'privacy:no-sensitive-data',
      total: 1,
      passed: input.qualified ? 1 : 0,
      failed: input.qualified ? 0 : 1,
      score: input.qualified ? 1 : 0,
    }],
    independent_review: {
      evaluator_ref: 'reviewer:foundry-e2e-independent',
      evaluation_execution_ref: `evaluation:${input.runId}:${input.blueprint.generation}`,
      review_execution_ref: `review:${input.runId}:${input.blueprint.generation}`,
      verdict: result,
      findings: input.qualified ? [] : ['The proposed prompt failed the required fixture gate.'],
      evidence_refs: ['evidence:foundry-e2e-independent-review'],
    },
    candidate_cost_observations: { usd: 0 },
    candidate_latency_observations: { milliseconds: 0 },
    safety_observations: [],
    safety_delta: { incidents: 0 },
    cost_delta: { usd: 0 },
    latency_delta: { milliseconds: 0 },
    failure_classification: input.qualified ? [] : [{
      failure_class: 'quality_gate',
      gate_id: 'gate:required',
      severity: 'high',
      evidence_refs: ['evidence:foundry-e2e-failed-gate'],
    }],
    qualified: input.qualified,
    gate_score: input.qualified ? 1 : 0,
    provenance: {
      foundry_run_id: input.runId,
      generation: input.blueprint.generation,
      producer_id: 'evaluator:foundry-e2e',
      evaluated_at: NOW,
      source_refs: ['evaluation:foundry-e2e-frozen-plan'],
    },
  };
}

function designer(fixture: FixtureResources): DesignerPort {
  return {
    producer_id: 'designer:foundry-e2e',
    async design(request) {
      const prompt = request.mode === 'create' ? fixture.promptV1.ref : fixture.promptBroken.ref;
      return blueprint(request, fixture, 0, prompt);
    },
    async diagnose(input): Promise<EvolutionProposal> {
      const next = blueprint(input.request, fixture, input.blueprint.generation + 1, fixture.promptV2.ref);
      return {
        surface_kind: 'opl_foundry_evolution_proposal',
        version: FOUNDRY_PROTOCOL_VERSION,
        proposal_id: `proposal:${input.request.request_id}:${next.generation}`,
        target_agent_id: input.request.target_agent_id,
        target_domain_id: input.request.target_domain_id,
        target_version_ref: input.request.target_version_ref,
        blueprint_digest: foundryContentDigest(input.blueprint),
        evidence_digest: foundryContentDigest(input.evidence),
        root_causes: [{
          failure_class: 'quality_gate',
          explanation: 'The initial improvement prompt failed the required delivery gate.',
          evidence_refs: ['evidence:foundry-e2e-failed-gate'],
        }],
        next_blueprint: next,
        semantic_diff: [{
          operation: 'replace',
          semantic_path: '/content_refs/prompt_refs/0',
          rationale: 'Replace the rejected prompt with the evaluated version-two prompt.',
        }],
        expected_benefits: ['The required delivery gate should pass.'],
        new_tests: [],
        trade_offs: ['The active prompt bytes change.'],
        risk_hints: ['low'],
      };
    },
  };
}

function evaluator(fixture: FixtureResources): EvaluationExecutor {
  return {
    evaluator_id: 'evaluator:foundry-e2e',
    async evaluate(input) {
      return evidence({
        runId: input.run_id,
        request: input.request,
        blueprint: input.blueprint,
        candidate: input.candidate,
        baselineDigest: input.baseline_version?.version_digest ?? null,
        qualified: input.blueprint.content_refs.prompt_refs[0] !== fixture.promptBroken.ref,
      });
    },
    async canary(input) {
      return evidence({
        runId: input.run_id,
        request: input.request,
        blueprint: input.blueprint,
        candidate: input.candidate,
        baselineDigest: input.baseline_version?.version_digest ?? null,
        qualified: true,
      });
    },
  };
}

function authorityReceipt(input: {
  ownerGate: InMemoryOwnerGate;
  inspection: FoundryRunInspection;
  action: OwnerGateAction;
  decision: OwnerGateDecision;
}) {
  return input.ownerGate.register({
    surface_kind: 'opl_foundry_owner_authority_receipt',
    version: 'opl-foundry-owner-authority-receipt.v1',
    receipt_id: `receipt:${input.inspection.run.run_id}:${input.action}:${input.inspection.run.revision}`,
    authority_ref: OWNER_AUTHORITY_REF,
    action: input.action,
    decision: input.decision,
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    run_id: input.inspection.run.run_id,
    version_digest: input.inspection.run.version_digest,
    expected_revision: input.inspection.run.revision,
    issued_at: NOW,
  }).receipt_ref;
}

async function activateRun(kernel: FoundryKernel, ownerGate: InMemoryOwnerGate, request: DesignRequest, runId: string) {
  await kernel.startRun({ request, run_id: runId });
  let inspection = await kernel.advanceUntilPause(runId);
  if (inspection.run.state === 'completed_active') return inspection;
  assert.equal(inspection.run.state, 'awaiting_owner_canary');
  inspection = await kernel.submitOwnerDecision({
    run_id: runId,
    expected_revision: inspection.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorityReceipt({
      ownerGate,
      inspection,
      action: 'approve_canary',
      decision: 'approve',
    }),
  });
  if (inspection.run.state === 'completed_active') return inspection;
  assert.equal(inspection.run.state, 'awaiting_owner_active');
  return kernel.submitOwnerDecision({
    run_id: runId,
    expected_revision: inspection.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorityReceipt({
      ownerGate,
      inspection,
      action: 'approve_active',
      decision: 'approve',
    }),
  });
}

function recordLedger(input: Record<string, unknown>) {
  return {
    ledger_entry: { run_id: input.runId, status: input.status },
    recorded_event: { event_type: 'standard_agent_action_run_recorded' },
  } as never;
}

function stageRuntime() {
  return async (args: string[]) => {
    if (args[0] === 'stage-run' && args[1] === 'query') {
      return { family_runtime_stage_run_query: { workflow_id: args[2] } } as never;
    }
    assert.equal(args[0], 'attempt');
    assert.equal(args[1], 'create');
    const locatorIndex = args.indexOf('--workspace-locator');
    assert.notEqual(locatorIndex, -1);
    const locator = JSON.parse(args[locatorIndex + 1]!) as {
      domain_pack_root: string;
      package_use_binding: {
        root_package: { content_digest: string };
        dependency_closure_digest: string;
      };
    };
    const manifest = JSON.parse(fs.readFileSync(
      path.join(locator.domain_pack_root, 'agent/stages/manifest.json'),
      'utf8',
    )) as { stages: Array<{ stage_id: string; prompt_ref: string }> };
    const stage = manifest.stages.find((entry) => entry.stage_id === 'deliver');
    assert.ok(stage);
    const observation: HostedInvocationObservation = {
      prompt_text: fs.readFileSync(path.join(locator.domain_pack_root, stage.prompt_ref), 'utf8').trim(),
      candidate_digest: locator.package_use_binding.root_package.content_digest,
      dependency_closure_digest: locator.package_use_binding.dependency_closure_digest,
    };
    return {
      family_runtime_stage_run: {
        stage_run_input: { workflow_id: `workflow:${observation.candidate_digest}` },
        blocked_reason: null,
      },
      foundry_e2e_observation: observation,
    } as never;
  };
}

function invocationObservation(result: Awaited<ReturnType<typeof runStandardAgentAction>>) {
  const run = result.standard_agent_action_run;
  assert.equal(run.execution_kind, 'stage_binding');
  if (run.execution_kind !== 'stage_binding') assert.fail('Expected a generated Stage-bound action.');
  assert.equal(run.hosted_runtime_binding.source_kind, 'foundry_active_agent_version');
  if (run.hosted_runtime_binding.source_kind !== 'foundry_active_agent_version') {
    assert.fail('Expected an active Foundry AgentVersion binding.');
  }
  const temporal = run.temporal_stage_run as Record<string, unknown>;
  const observation = temporal.foundry_e2e_observation as HostedInvocationObservation;
  return {
    prompt: observation.prompt_text,
    versionDigest: run.hosted_runtime_binding.active_version_digest,
    candidateDigest: run.hosted_runtime_binding.candidate_digest,
    closureDigest: run.hosted_runtime_binding.package_closure_digest,
    activationRevision: run.hosted_runtime_binding.activation_revision,
    observedCandidateDigest: observation.candidate_digest,
    observedClosureDigest: observation.dependency_closure_digest,
  };
}

test('file-backed Foundry create, evolve, hosted invoke, and rollback preserve exact active bytes', async (t) => {
  const stateRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-e2e-state-'));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-e2e-workspace-'));
  t.after(() => {
    fs.rmSync(stateRoot, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  const fixture = resources(new FileFoundryContentStore(stateRoot));
  const compiler = new ContentAddressedCandidateCompiler(stateRoot);
  const versions = new LedgerVersionRegistry(stateRoot);
  const events = new LedgerFoundryEventStore(stateRoot);
  const ownerGate = new InMemoryOwnerGate(() => NOW);
  ownerGate.registerAuthorityPolicy({
    policy_ref: 'opl://foundry/authority-policies/foundry-e2e-agent',
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    authority_refs: [OWNER_AUTHORITY_REF],
  });
  let packageFallbackCalls = 0;
  const resolver = new DefaultHostedAgentRuntimeBindingResolver({
    root_override: stateRoot,
    resolve_managed_checkout: (async () => {
      packageFallbackCalls += 1;
      throw new Error('An active Foundry AgentVersion must win over package fallback.');
    }) as never,
  });
  const kernel = new FoundryKernel({
    designer: designer(fixture),
    evaluator: evaluator(fixture),
    compiler,
    objects: new FileFoundryObjectStore(stateRoot),
    events,
    versions,
    operationResults: new LedgerFoundryOperationResultJournal(stateRoot),
    activationRuntime: new HostedFoundryActivationRuntime({
      resolver,
      candidate_directory: (candidateDigest) => compiler.candidateDirectory(candidateDigest),
      workspace_root: workspaceRoot,
    }),
    ownerGate,
    clock: { now: () => NOW },
  });
  const runtimeDependencies = {
    foundryRootOverride: stateRoot,
    resolveManagedCheckout: (async () => {
      packageFallbackCalls += 1;
      throw new Error('An active Foundry AgentVersion must win over package fallback.');
    }) as never,
    runStageRuntime: stageRuntime() as never,
    recordLedger,
  };

  const created = await activateRun(
    kernel,
    ownerGate,
    designRequest({ requestId: 'request:foundry-e2e:create', mode: 'create', targetVersionRef: null }),
    'run:foundry-e2e:create',
  );
  assert.equal(
    created.run.state,
    'completed_active',
    JSON.stringify(await events.read('run:foundry-e2e:create')),
  );
  assert.equal(created.run.generation, 0);
  const createActivation = await versions.activation(TARGET_AGENT_ID, TARGET_DOMAIN_ID);
  assert.equal(createActivation.revision, 1);
  assert.ok(createActivation.active_version_digest);
  const versionV1 = await versions.resolveVersion(
    createActivation.active_version_digest,
    TARGET_AGENT_ID,
    TARGET_DOMAIN_ID,
  );
  assert.ok(versionV1);

  const invokedV1 = invocationObservation(await runStandardAgentAction({
    domainId: TARGET_AGENT_ID,
    actionId: 'deliver',
    workspaceRoot,
    payload: { value: 1 },
    runId: 'action-foundry-e2e-v1',
  }, runtimeDependencies));
  assert.equal(invokedV1.prompt, 'foundry e2e prompt version one');
  assert.equal(invokedV1.versionDigest, versionV1.version_digest);
  assert.equal(invokedV1.candidateDigest, versionV1.candidate_digest);
  assert.equal(invokedV1.observedCandidateDigest, invokedV1.candidateDigest);
  assert.equal(invokedV1.observedClosureDigest, invokedV1.closureDigest);
  assert.equal(invokedV1.activationRevision, 1);

  const improved = await activateRun(
    kernel,
    ownerGate,
    designRequest({
      requestId: 'request:foundry-e2e:improve',
      mode: 'improve',
      targetVersionRef: versionV1.version_digest,
    }),
    'run:foundry-e2e:improve',
  );
  assert.equal(improved.run.state, 'completed_active');
  assert.equal(improved.run.generation, 1);
  const improveEventTypes = (await events.read('run:foundry-e2e:improve')).map((event) => event.event_type);
  assert.equal(improveEventTypes.includes('evaluation_failed'), true);
  assert.equal(improveEventTypes.includes('evolution_proposal_admitted'), true);
  const improveActivation = await versions.activation(TARGET_AGENT_ID, TARGET_DOMAIN_ID);
  assert.equal(improveActivation.revision, 2);
  assert.ok(improveActivation.active_version_digest);
  const versionV2 = await versions.resolveVersion(
    improveActivation.active_version_digest,
    TARGET_AGENT_ID,
    TARGET_DOMAIN_ID,
  );
  assert.ok(versionV2);
  assert.notEqual(versionV2.version_digest, versionV1.version_digest);
  assert.notEqual(versionV2.candidate_digest, versionV1.candidate_digest);

  const invokedV2 = invocationObservation(await runStandardAgentAction({
    domainId: TARGET_DOMAIN_ID,
    actionId: 'deliver',
    workspaceRoot,
    payload: { value: 2 },
    runId: 'action-foundry-e2e-v2',
  }, runtimeDependencies));
  assert.equal(invokedV2.prompt, 'foundry e2e prompt version two');
  assert.equal(invokedV2.versionDigest, versionV2.version_digest);
  assert.equal(invokedV2.candidateDigest, versionV2.candidate_digest);
  assert.notEqual(invokedV2.closureDigest, invokedV1.closureDigest);
  assert.equal(invokedV2.observedCandidateDigest, invokedV2.candidateDigest);
  assert.equal(invokedV2.observedClosureDigest, invokedV2.closureDigest);
  assert.equal(invokedV2.activationRevision, 2);

  const rollbackReceipt = ownerGate.register({
    surface_kind: 'opl_foundry_owner_authority_receipt',
    version: 'opl-foundry-owner-authority-receipt.v1',
    receipt_id: 'receipt:foundry-e2e:rollback:2',
    authority_ref: OWNER_AUTHORITY_REF,
    action: 'rollback',
    decision: 'rollback',
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    run_id: null,
    version_digest: versionV1.version_digest,
    expected_revision: improveActivation.revision,
    issued_at: NOW,
  });
  const rollback = await kernel.rollbackActivation({
    target_agent_id: TARGET_AGENT_ID,
    target_domain_id: TARGET_DOMAIN_ID,
    version_digest: versionV1.version_digest,
    expected_revision: improveActivation.revision,
    authority_receipt_ref: rollbackReceipt.receipt_ref,
  });
  assert.equal(rollback.from_version_digest, versionV2.version_digest);
  assert.equal(rollback.to_version_digest, versionV1.version_digest);
  assert.equal(rollback.next_revision, 3);

  const invokedAfterRollback = invocationObservation(await runStandardAgentAction({
    domainId: TARGET_AGENT_ID,
    actionId: 'deliver',
    workspaceRoot,
    payload: { value: 3 },
    runId: 'action-foundry-e2e-rollback-v1',
  }, runtimeDependencies));
  assert.deepEqual(invokedAfterRollback, {
    ...invokedV1,
    activationRevision: 3,
  });
  assert.equal(packageFallbackCalls, 0);
});
