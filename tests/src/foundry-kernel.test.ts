import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonBytes } from '../../src/kernel/canonical-json.ts';
import { assertRepoJsonSchemaPayload } from '../../src/kernel/repo-json-schema.ts';
import {
  DeterministicInMemoryCandidateCompiler,
  InMemoryActivationRuntime,
  InMemoryFoundryEventStore,
  InMemoryFoundryObjectStore,
  InMemoryOwnerGate,
  InMemoryVersionRegistry,
} from '../../src/modules/foundry/in-memory-adapters.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
  FileFoundryObjectStore,
  LedgerFoundryEventStore,
  LedgerVersionRegistry,
} from '../../src/modules/ledger/foundry-persistent-adapters.ts';
import {
  FunctionFoundryDesignerAdapter,
  ManifestFoundryDesignerAdapter,
  readFoundryProviderManifest,
} from '../../src/modules/foundry/designer-adapter.ts';
import {
  FoundryKernel,
  FoundryTransientActivityError,
} from '../../src/modules/foundry/kernel.ts';
import {
  assertBlueprintSatisfiesDesignRequest,
  assertEvaluationEvidenceFacts,
  evaluateDesignRequestResourceConstraints,
  FrozenPlanEvaluationRuntime,
  foundryFrozenEvaluationPlanDigest,
  isQualificationGradeEvaluationRuntime,
  recomputeEvaluationQualification,
  type EvaluationCaseExecutor,
  type IndependentEvaluationReviewer,
} from '../../src/modules/foundry/evaluation-runtime.ts';
import type {
  ActivationRuntime,
  CandidateCompiler,
  DesignerPort,
  EvaluationExecutor,
  FoundryEventStore,
  MaterializedCandidate,
  OwnerGateAction,
  OwnerGateDecision,
  VersionRegistry,
} from '../../src/modules/foundry/ports.ts';
import {
  FOUNDRY_PROTOCOL_VERSION,
  assertFoundryProtocolPurity,
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
import { verifyFoundryEventChain } from '../../src/modules/foundry/state-machine.ts';
import { ProcessFoundryEvaluationExecutor } from '../../src/modules/runway/foundry-process-evaluator.ts';
import { createProductionFoundryKernel } from '../../src/modules/runway/foundry-production-runtime.ts';
import type { resolveStandardAgentManagedCheckout } from '../../src/modules/runway/standard-agent-managed-checkout.ts';
import { compileStandardAgentStageManifest } from '../../src/modules/pack/standard-agent-stage-manifest.ts';

const ownerGate = new InMemoryOwnerGate(() => '2026-07-16T00:00:00.000Z');
ownerGate.registerAuthorityPolicy({
  policy_ref: 'opl://foundry/authority-policies/fixture-agent',
  target_agent_id: 'fixture-agent',
  target_domain_id: 'fixture-domain',
  authority_refs: ['owner-gate:activation'],
});
ownerGate.registerAuthorityPolicy({
  policy_ref: 'opl://foundry/authority-policies/oma',
  target_agent_id: 'oma',
  target_domain_id: 'agent_engineering',
  authority_refs: ['owner-gate:activation'],
});

function authorizeRunMutation(input: {
  inspection: Awaited<ReturnType<FoundryKernel['inspectRun']>>;
  action: OwnerGateAction;
  decision: OwnerGateDecision;
  authority_ref?: string;
}) {
  const { inspection } = input;
  return ownerGate.register({
    surface_kind: 'opl_foundry_owner_authority_receipt',
    version: 'opl-foundry-owner-authority-receipt.v1',
    receipt_id: `receipt:${inspection.run.run_id}:${input.action}:${inspection.run.revision}`,
    authority_ref: input.authority_ref ?? 'owner-gate:activation',
    action: input.action,
    decision: input.decision,
    target_agent_id: inspection.request.target_agent_id,
    target_domain_id: inspection.request.target_domain_id,
    run_id: inspection.run.run_id,
    version_digest: inspection.run.version_digest,
    expected_revision: inspection.run.revision,
    issued_at: '2026-07-16T00:00:00.000Z',
  }).receipt_ref;
}

function authorizeRollback(input: {
  target_agent_id: string;
  target_domain_id: string;
  version_digest: string;
  expected_revision: number;
}) {
  return ownerGate.register({
    surface_kind: 'opl_foundry_owner_authority_receipt',
    version: 'opl-foundry-owner-authority-receipt.v1',
    receipt_id: `receipt:rollback:${input.target_agent_id}:${input.version_digest}:${input.expected_revision}`,
    authority_ref: 'owner-gate:activation',
    action: 'rollback',
    decision: 'rollback',
    target_agent_id: input.target_agent_id,
    target_domain_id: input.target_domain_id,
    run_id: null,
    version_digest: input.version_digest,
    expected_revision: input.expected_revision,
    issued_at: '2026-07-16T00:00:00.000Z',
  }).receipt_ref;
}

function request(input: Partial<DesignRequest> = {}): DesignRequest {
  return {
    surface_kind: 'opl_foundry_design_request',
    version: FOUNDRY_PROTOCOL_VERSION,
    request_id: 'request:create:fixture',
    mode: 'create',
    target_agent_id: 'fixture-agent',
    target_domain_id: 'fixture-domain',
    target_version_ref: null,
    objective: 'Build a fixture Agent.',
    acceptance_criteria: ['The required gate passes.'],
    non_goals: ['No production secrets.'],
    source_refs: ['source:fixture'],
    constraints: {
      capability_refs: ['capability:text'],
      permission_refs: [],
      privacy_requirements: ['privacy:no-sensitive-data'],
      cost_limits: { usd: 1 },
      latency_limits: { milliseconds: 1000 },
    },
    delivery_policy: { activation_mode: 'activate', max_generations: 5 },
    ...input,
  };
}

function blueprint(designRequest: DesignRequest, generation: number, promptRef: string): AgentBlueprint {
  const inputSchemaRef = `opl-content://sha256/${'a'.repeat(64)}`;
  const outputSchemaRef = `opl-content://sha256/${'b'.repeat(64)}`;
  return {
    surface_kind: 'opl_foundry_agent_blueprint',
    version: FOUNDRY_PROTOCOL_VERSION,
    blueprint_id: `blueprint:${designRequest.request_id}:${generation}`,
    target_agent_id: designRequest.target_agent_id,
    target_domain_id: designRequest.target_domain_id,
    target_version_ref: designRequest.target_version_ref,
    design_request_digest: foundryContentDigest(designRequest),
    generation,
    stage_graph: {
      entry_stage_id: 'deliver',
      stages: [{
        stage_id: 'deliver',
        stage_kind: 'domain_delivery',
        goal: 'Deliver the accepted artifact.',
        input_artifact_types: ['request'],
        output_artifact_types: ['delivery'],
        prompt_ref: promptRef,
        skill_refs: ['skill:fixture'],
        knowledge_refs: ['knowledge:fixture'],
        capability_refs: ['capability:text'],
        next_stage_ids: [],
      }],
    },
    actions: [{
      action_id: 'deliver',
      summary: 'Deliver the fixture artifact.',
      entry_stage_id: 'deliver',
      input_schema_ref: inputSchemaRef,
      output_schema_ref: outputSchemaRef,
    }],
    artifact_contracts: [{
      artifact_type: 'delivery',
      schema_ref: outputSchemaRef,
      authority_owner_ref: 'owner:fixture-domain',
    }],
    content_refs: {
      prompt_refs: [promptRef],
      skill_refs: ['skill:fixture'],
      knowledge_refs: ['knowledge:fixture'],
      helper_refs: [],
      model_refs: ['model:default'],
      tool_refs: [],
      schema_refs: [inputSchemaRef, outputSchemaRef],
    },
    capability_requirements: ['capability:text'],
    authority_policy: {
      truth_owner_ref: 'owner:fixture-domain',
      artifact_owner_ref: 'owner:fixture-domain',
      quality_owner_ref: 'owner:fixture-domain',
      permission_refs: [...designRequest.constraints.permission_refs],
      generated_agent_can_modify_versions: false,
      generated_agent_can_modify_evaluation: false,
      generated_agent_can_modify_permissions: false,
      generated_agent_can_modify_activation: false,
    },
    memory_policy: {
      memory_classes: ['delivery-observation'],
      retention_refs: ['retention:fixture'],
      write_authority_refs: ['owner:fixture-domain'],
    },
    assumptions: ['The fixture runtime is available.'],
    design_evidence_refs: ['evidence:design-fixture'],
    eval_spec: {
      eval_spec_id: 'eval:fixture',
      public_cases: [{ case_id: 'case:required', test_ref: 'test:required', weight: 1, required: true }],
      protected_requirements: [{ category: 'privacy:no-sensitive-data', minimum_case_count: 1 }],
      gates: [{ gate_id: 'gate:required', metric: 'score', operator: 'gte', threshold: 1, required: true }],
      baseline_comparison: { required: designRequest.mode !== 'create', regression_tolerance: 0 },
      independent_evaluator_required: true,
    },
    risk_hint: 'low',
  };
}

class FixtureDesigner implements DesignerPort {
  readonly producer_id = 'designer:fixture';

  async design(designRequest: DesignRequest) {
    return blueprint(designRequest, 0, designRequest.mode === 'create' ? 'prompt:v1' : 'prompt:v3');
  }

  async diagnose(input: Parameters<DesignerPort['diagnose']>[0]): Promise<EvolutionProposal> {
    const next = blueprint(input.request, input.blueprint.generation + 1, 'prompt:v2');
    return {
      surface_kind: 'opl_foundry_evolution_proposal' as const,
      version: FOUNDRY_PROTOCOL_VERSION,
      proposal_id: `proposal:${next.generation}`,
      target_agent_id: input.request.target_agent_id,
      target_domain_id: input.request.target_domain_id,
      target_version_ref: input.request.target_version_ref,
      blueprint_digest: foundryContentDigest(input.blueprint),
      evidence_digest: foundryContentDigest(input.evidence),
      root_causes: [{
        failure_class: 'quality_gate',
        explanation: 'The initial prompt omitted the accepted behavior.',
        evidence_refs: ['evidence:failed-gate'],
      }],
      next_blueprint: next,
      semantic_diff: [{
        operation: 'replace' as const,
        semantic_path: '/content_refs/prompt_refs/0',
        rationale: 'Adopt the evaluated behavior.',
      }],
      expected_benefits: ['The required gate should pass.'],
      new_tests: [],
      trade_offs: ['The prompt is more explicit.'],
      risk_hints: ['low' as const],
    };
  }
}

class NoChangeDesigner implements DesignerPort {
  readonly producer_id = 'designer:no-change-fixture';

  design(input: DesignRequest) {
    return new FixtureDesigner().design(input);
  }

  async diagnose(input: Parameters<DesignerPort['diagnose']>[0]) {
    return {
      surface_kind: 'opl_foundry_evolution_proposal' as const,
      version: FOUNDRY_PROTOCOL_VERSION,
      proposal_id: `proposal:no-change:${input.blueprint.generation}`,
      target_agent_id: input.request.target_agent_id,
      target_domain_id: input.request.target_domain_id,
      target_version_ref: input.request.target_version_ref,
      blueprint_digest: foundryContentDigest(input.blueprint),
      evidence_digest: foundryContentDigest(input.evidence),
      root_causes: [{
        failure_class: 'no_safe_agent_change',
        explanation: 'The evidence does not support a safe Agent semantic change.',
        evidence_refs: ['evidence:no-safe-change'],
      }],
      next_blueprint: structuredClone(input.blueprint),
      semantic_diff: [],
      expected_benefits: [],
      new_tests: [],
      trade_offs: ['The current candidate remains unqualified.'],
      risk_hints: [] as Array<'low' | 'medium' | 'high'>,
    };
  }
}

function evidence(input: {
  runId: string;
  designRequest: DesignRequest;
  agentBlueprint: AgentBlueprint;
  candidate: MaterializedCandidate;
  baselineDigest: string | null;
  qualified: boolean;
  planDigest?: string;
}): EvidenceBundle {
  return {
    surface_kind: 'opl_foundry_evidence_bundle',
    version: FOUNDRY_PROTOCOL_VERSION,
    evidence_id: `evidence:${input.runId}:${input.agentBlueprint.generation}:${input.qualified}`,
    target_agent_id: input.designRequest.target_agent_id,
    target_domain_id: input.designRequest.target_domain_id,
    target_version_ref: input.designRequest.target_version_ref,
    blueprint_digest: foundryContentDigest(input.agentBlueprint),
    candidate_digest: input.candidate.candidate_digest,
    baseline_version_digest: input.baselineDigest,
    frozen_test_plan_digest: input.planDigest ?? foundryFrozenEvaluationPlanDigest(input.agentBlueprint.eval_spec),
    public_results: [{
      case_id: 'case:required',
      status: input.qualified ? 'pass' : 'fail',
      score: input.qualified ? 1 : 0,
      evidence_refs: ['evidence:public-result'],
    }],
    baseline_public_results: input.baselineDigest === null ? null : [{
      case_id: 'case:required',
      status: 'pass',
      score: 1,
      evidence_refs: ['evidence:baseline-public-result'],
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
      evaluator_ref: 'reviewer:independent',
      evaluation_execution_ref: `evaluation:${input.runId}:${input.agentBlueprint.generation}`,
      review_execution_ref: `review:${input.runId}:${input.agentBlueprint.generation}`,
      verdict: input.qualified ? 'pass' : 'fail',
      findings: input.qualified ? [] : ['The required behavior is missing.'],
      evidence_refs: ['evidence:independent-review'],
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
      evidence_refs: ['evidence:failed-gate'],
    }],
    qualified: input.qualified,
    gate_score: input.qualified ? 1 : 0,
    provenance: {
      foundry_run_id: input.runId,
      generation: input.agentBlueprint.generation,
      producer_id: 'evaluator:fixture',
      evaluated_at: '2026-07-16T00:00:00.000Z',
      source_refs: ['evaluation:frozen-plan'],
    },
  };
}

class FixtureEvaluator implements EvaluationExecutor {
  readonly evaluator_id = 'evaluator:fixture';
  readonly mutatePlanAtGeneration: number | null;

  constructor(mutatePlanAtGeneration: number | null = null) {
    this.mutatePlanAtGeneration = mutatePlanAtGeneration;
  }

  async evaluate(input: Parameters<EvaluationExecutor['evaluate']>[0]) {
    return evidence({
      runId: input.run_id,
      designRequest: input.request,
      agentBlueprint: input.blueprint,
      candidate: input.candidate,
      baselineDigest: input.baseline_version?.version_digest ?? null,
      qualified: !input.blueprint.content_refs.prompt_refs.includes('prompt:v1'),
      planDigest: input.blueprint.generation === this.mutatePlanAtGeneration
        ? `sha256:${'e'.repeat(64)}`
        : foundryFrozenEvaluationPlanDigest(input.blueprint.eval_spec),
    });
  }

  async canary(input: Parameters<EvaluationExecutor['canary']>[0]) {
    return evidence({
      runId: input.run_id,
      designRequest: input.request,
      agentBlueprint: input.blueprint,
      candidate: input.candidate,
      baselineDigest: input.baseline_version?.version_digest ?? null,
      qualified: true,
    });
  }
}

class HighRiskDesigner extends FixtureDesigner {
  override async design(designRequest: DesignRequest) {
    const result = await super.design(designRequest);
    if (designRequest.mode !== 'create') {
      result.stage_graph.stages[0]!.output_artifact_types = ['delivery', 'audit-record'];
    }
    return result;
  }
}

class AddedEvaluationCaseDesigner extends FixtureDesigner {
  override async diagnose(input: Parameters<DesignerPort['diagnose']>[0]) {
    const proposal = await super.diagnose(input) as EvolutionProposal;
    proposal.next_blueprint.eval_spec.public_cases.push({
      case_id: 'case:regression',
      test_ref: 'test:regression',
      weight: 1,
      required: true,
    });
    proposal.new_tests.push({
      case_id: 'case:regression',
      test_ref: 'test:regression',
      rationale: 'Retain the evaluated behavior as a required public regression case.',
    });
    proposal.semantic_diff.push({
      operation: 'add',
      semantic_path: '/eval_spec/public_cases/1',
      rationale: 'Freeze the newly admitted regression case for the next generation.',
    });
    return proposal;
  }
}

class AddedEvaluationCaseEvaluator extends FixtureEvaluator {
  override async evaluate(input: Parameters<EvaluationExecutor['evaluate']>[0]) {
    const result = await super.evaluate(input);
    if (input.blueprint.generation > 0) {
      result.public_results.push({
        case_id: 'case:regression',
        status: 'pass',
        score: 1,
        evidence_refs: ['evidence:public-regression-result'],
      });
    }
    return result;
  }
}

class BudgetEvaluator extends FixtureEvaluator {
  override async evaluate(input: Parameters<EvaluationExecutor['evaluate']>[0]) {
    const result = evidence({
      runId: input.run_id,
      designRequest: input.request,
      agentBlueprint: input.blueprint,
      candidate: input.candidate,
      baselineDigest: input.baseline_version?.version_digest ?? null,
      qualified: false,
    });
    result.public_results[0]!.score = input.blueprint.generation / 10;
    result.gate_score = input.blueprint.generation / 10;
    return result;
  }
}

class StaleEvidenceEvaluator extends FixtureEvaluator {
  override async evaluate(input: Parameters<EvaluationExecutor['evaluate']>[0]) {
    const result = await super.evaluate(input);
    result.blueprint_digest = `sha256:${'0'.repeat(64)}`;
    return result;
  }
}

class MutatingEvidenceEvaluator extends FixtureEvaluator {
  readonly #mutate: (evidenceBundle: EvidenceBundle) => void;

  constructor(mutate: (evidenceBundle: EvidenceBundle) => void) {
    super();
    this.#mutate = mutate;
  }

  override async evaluate(input: Parameters<EvaluationExecutor['evaluate']>[0]) {
    const result = await super.evaluate(input);
    this.#mutate(result);
    return result;
  }
}

class PassingDesigner extends FixtureDesigner {
  override async design(designRequest: DesignRequest) {
    return blueprint(designRequest, 0, 'prompt:v2');
  }
}

class CountingCandidateCompiler implements CandidateCompiler {
  readonly #delegate = new DeterministicInMemoryCandidateCompiler();
  calls = 0;

  materialize(input: Parameters<CandidateCompiler['materialize']>[0]) {
    this.calls += 1;
    return this.#delegate.materialize(input);
  }
}

class BaselineComparisonDesigner extends FixtureDesigner {
  override async design(designRequest: DesignRequest) {
    const result = blueprint(designRequest, 0, 'prompt:v3');
    result.eval_spec.gates[0]!.threshold = 0.5;
    return result;
  }
}

class HiddenBaselineRegressionEvaluator extends FixtureEvaluator {
  override async evaluate(input: Parameters<EvaluationExecutor['evaluate']>[0]) {
    const result = evidence({
      runId: input.run_id,
      designRequest: input.request,
      agentBlueprint: input.blueprint,
      candidate: input.candidate,
      baselineDigest: input.baseline_version?.version_digest ?? null,
      qualified: true,
    });
    result.public_results[0]!.score = 0.8;
    result.gate_score = 0.8;
    return result;
  }
}

class CanaryRegressionEvaluator extends FixtureEvaluator {
  override async canary(input: Parameters<EvaluationExecutor['canary']>[0]) {
    return evidence({
      runId: input.run_id,
      designRequest: input.request,
      agentBlueprint: input.blueprint,
      candidate: input.candidate,
      baselineDigest: input.baseline_version?.version_digest ?? null,
      qualified: false,
    });
  }
}

class ControlledActivationRuntime implements ActivationRuntime {
  readonly #delegate: InMemoryActivationRuntime;
  #preflightFailure: string | null;
  readonly #mismatchReadback: boolean;
  readonly #emptyRuntimeBindingRef: boolean;
  preflightCalls = 0;
  readbackCalls = 0;

  constructor(
    versions: VersionRegistry,
    options: {
      preflightFailure?: string;
      mismatchReadback?: boolean;
      emptyRuntimeBindingRef?: boolean;
    } = {},
  ) {
    this.#delegate = new InMemoryActivationRuntime(versions);
    this.#preflightFailure = options.preflightFailure ?? null;
    this.#mismatchReadback = options.mismatchReadback ?? false;
    this.#emptyRuntimeBindingRef = options.emptyRuntimeBindingRef ?? false;
  }

  denyPreflight(message: string) {
    this.#preflightFailure = message;
  }

  async preflight(input: Parameters<ActivationRuntime['preflight']>[0]) {
    this.preflightCalls += 1;
    if (this.#preflightFailure) throw new Error(this.#preflightFailure);
    const preflight = await this.#delegate.preflight(input);
    return {
      ...preflight,
      runtime_binding_ref: this.#emptyRuntimeBindingRef
        ? ''
        : `opl://foundry/test-prepared-runtime-bindings/${preflight.version_digest}/${preflight.expected_activation_revision}`,
    };
  }

  async readback(input: Parameters<ActivationRuntime['readback']>[0]) {
    this.readbackCalls += 1;
    const readback = await this.#delegate.readback(input);
    return this.#mismatchReadback
      ? { ...readback, candidate_digest: `sha256:${'f'.repeat(64)}` }
      : readback;
  }
}

function harness(
  evaluator: EvaluationExecutor = new FixtureEvaluator(),
  activationRuntime?: (versions: InMemoryVersionRegistry) => ActivationRuntime,
) {
  const events = new InMemoryFoundryEventStore();
  const versions = new InMemoryVersionRegistry();
  const runtime = activationRuntime?.(versions);
  const kernel = new FoundryKernel({
    designer: new FixtureDesigner(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    evaluator,
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions,
    activationRuntime: runtime,
    ownerGate,
    clock: { now: () => '2026-07-16T00:00:00.000Z' },
  });
  return { kernel, events, versions, activationRuntime: runtime };
}

test('DesignRequest capability, permission, and privacy constraints are mandatory blueprint coverage', async () => {
  const constrainedRequest = request({
    request_id: 'request:constraint-coverage',
    constraints: {
      capability_refs: ['capability:text', 'capability:search'],
      permission_refs: ['owner-gate:permission:publish'],
      privacy_requirements: ['privacy:no-sensitive-data', 'privacy:no-cross-owner-disclosure'],
      cost_limits: { usd: 1 },
      latency_limits: { milliseconds: 1000 },
    },
  });
  const covered = blueprint(constrainedRequest, 0, 'prompt:constraints');
  covered.capability_requirements.push('capability:search');
  covered.eval_spec.protected_requirements.push({
    category: 'privacy:no-cross-owner-disclosure',
    minimum_case_count: 1,
  });
  assert.doesNotThrow(() => assertBlueprintSatisfiesDesignRequest(constrainedRequest, covered));

  for (const [detailKey, mutate] of [
    ['missing_capability_refs', (candidate: AgentBlueprint) => candidate.capability_requirements.pop()],
    ['missing_permission_refs', (candidate: AgentBlueprint) => candidate.authority_policy.permission_refs.pop()],
    ['missing_privacy_protected_requirements', (candidate: AgentBlueprint) => candidate.eval_spec.protected_requirements.pop()],
  ] as const) {
    const invalid = structuredClone(covered);
    mutate(invalid);
    assert.throws(
      () => assertBlueprintSatisfiesDesignRequest(constrainedRequest, invalid),
      (error: unknown) => Array.isArray(
        (error as { details?: Record<string, unknown> }).details?.[detailKey],
      ),
    );
  }

  const designer: DesignerPort = {
    producer_id: 'designer:constraint-dropping',
    async design() {
      const invalid = structuredClone(covered);
      invalid.eval_spec.protected_requirements.pop();
      return invalid;
    },
    async diagnose(): Promise<never> {
      throw new Error('diagnose must not run');
    },
  };
  const events = new InMemoryFoundryEventStore();
  const kernel = new FoundryKernel({
    designer,
    compiler: new DeterministicInMemoryCandidateCompiler(),
    evaluator: new FixtureEvaluator(),
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions: new InMemoryVersionRegistry(),
  });
  await kernel.startRun({ request: constrainedRequest, run_id: 'run:constraint-dropping' });
  const inspection = await kernel.advanceUntilPause('run:constraint-dropping');
  assert.equal(inspection.run.state, 'quarantined');
  assert.equal(inspection.run.candidate_digest, null);
});

test('DesignRequest cost and latency limits require matching observations and block qualification when exceeded', () => {
  const designRequest = request();
  assert.deepEqual(evaluateDesignRequestResourceConstraints({
    request: designRequest,
    candidate_cost_observations: { usd: 0.5 },
    candidate_latency_observations: { milliseconds: 1200 },
  }), {
    results: [
      { constraint_kind: 'cost', metric: 'usd', limit: 1, observed: 0.5, passed: true },
      { constraint_kind: 'latency', metric: 'milliseconds', limit: 1000, observed: 1200, passed: false },
    ],
    passed: false,
  });
  assert.throws(() => evaluateDesignRequestResourceConstraints({
    request: designRequest,
    candidate_cost_observations: { tokens: 10 },
    candidate_latency_observations: { milliseconds: 100 },
  }), /missing required cost observations/);
});

test('high and critical safety observations force unqualified evidence with exact failure classification', async () => {
  const designRequest = request({ request_id: 'request:safety-observation' });
  const agentBlueprint = blueprint(designRequest, 0, 'prompt:safety-observation');
  const candidate = await new DeterministicInMemoryCandidateCompiler().materialize({
    run_id: 'run:safety-observation',
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
  });
  const unsafe = evidence({
    runId: 'run:safety-observation',
    designRequest,
    agentBlueprint,
    candidate,
    baselineDigest: null,
    qualified: true,
  });
  unsafe.safety_observations = [{
    observation_id: 'safety:unsafe-write',
    event_type: 'forbidden_write_attempt',
    severity: 'high',
    evidence_refs: ['evidence:safety:unsafe-write'],
  }];
  unsafe.failure_classification = [{
    failure_class: 'safety_event',
    gate_id: 'safety_observation:safety:unsafe-write',
    severity: 'high',
    evidence_refs: ['evidence:safety:unsafe-write'],
  }];
  unsafe.qualified = false;

  const facts = assertEvaluationEvidenceFacts({
    request: designRequest,
    spec: agentBlueprint.eval_spec,
    evidence: unsafe,
    baseline_present: false,
  });
  assert.equal(facts.safetyPassed, false);
  assert.throws(() => assertEvaluationEvidenceFacts({
    request: designRequest,
    spec: agentBlueprint.eval_spec,
    evidence: { ...unsafe, failure_classification: [] },
    baseline_present: false,
  }), /safety failure classifications do not match/);
});

async function activateCreateRun(
  kernel: FoundryKernel,
  runId: string,
  designRequest: DesignRequest = request(),
  diagnostic?: () => Promise<unknown>,
) {
  await kernel.startRun({ request: designRequest, run_id: runId });
  let inspection = await kernel.advanceUntilPause(runId);
  if (inspection.run.state !== 'awaiting_owner_canary') {
    assert.fail(JSON.stringify({ run: inspection.run, diagnostic: await diagnostic?.() }));
  }
  assert.equal(inspection.run.generation, 1);
  inspection = await kernel.submitOwnerDecision({
    run_id: runId,
    expected_revision: inspection.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection,
      action: 'approve_canary',
      decision: 'approve',
    }),
  });
  assert.equal(inspection.run.state, 'awaiting_owner_active');
  return kernel.submitOwnerDecision({
    run_id: runId,
    expected_revision: inspection.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection,
      action: 'approve_active',
      decision: 'approve',
    }),
  });
}

async function prepareActivatingCreateRun(kernel: FoundryKernel, runId: string) {
  await kernel.startRun({ request: request({ request_id: `request:${runId}` }), run_id: runId });
  let inspection = await kernel.advanceUntilPause(runId);
  assert.equal(inspection.run.state, 'awaiting_owner_canary');
  inspection = await kernel.submitOwnerDecision({
    run_id: runId,
    expected_revision: inspection.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection,
      action: 'approve_canary',
      decision: 'approve',
    }),
  });
  assert.equal(inspection.run.state, 'awaiting_owner_active');
  const activating = await kernel.submitOwnerDecision({
    run_id: runId,
    expected_revision: inspection.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection,
      action: 'approve_active',
      decision: 'approve',
    }),
  }, { advance: false });
  assert.equal(activating.run.state, 'activating');
  return activating;
}

test('FoundryKernel evolves a failed design, gates high risk, activates, and rolls back exact bytes', async () => {
  const { kernel, events, versions } = harness();
  const first = await activateCreateRun(kernel, 'run:create');
  assert.equal(first.run.state, 'completed_active');
  const [versionOne] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.equal(first.activation.active_version_digest, versionOne!.version_digest);
  const activationEvent = (await events.read('run:create')).at(-1)!;
  assert.equal(activationEvent.event_type, 'activation_completed');
  assert.equal(typeof activationEvent.payload.activation_runtime_preflight_ref, 'string');
  assert.equal(typeof activationEvent.payload.activation_runtime_binding_ref, 'string');
  assert.equal(
    activationEvent.payload.activation_runtime_binding_ref,
    activationEvent.payload.activation_runtime_preflight_ref,
  );
  assert.deepEqual(activationEvent.payload.activation_runtime_binding_verification, {
    surface_kind: 'opl_foundry_activation_runtime_binding_verification',
    version: 'opl-foundry-activation-runtime-binding-verification.v1',
    verification_phase: 'pre_commit',
    transaction_kind: 'activate',
    target_agent_id: versionOne!.target_agent_id,
    target_domain_id: versionOne!.target_domain_id,
    version_id: versionOne!.version_id,
    version_digest: versionOne!.version_digest,
    candidate_digest: versionOne!.candidate_digest,
    candidate_ref: versionOne!.candidate_ref,
    expected_activation_revision: 0,
    preflight_ref: activationEvent.payload.activation_runtime_preflight_ref,
    runtime_binding_ref: activationEvent.payload.activation_runtime_binding_ref,
  });
  const [activationTransaction] = await versions.activationHistory('fixture-agent', 'fixture-domain');
  assert.ok(activationTransaction);
  assert.deepEqual(
    activationTransaction.runtime_binding_verification,
    activationEvent.payload.activation_runtime_binding_verification,
  );
  assert.equal(Object.hasOwn(activationEvent.payload, 'activation_runtime_readback'), false);

  const improveRequest = request({
    request_id: 'request:improve:fixture',
    mode: 'improve',
    target_version_ref: versionOne!.version_digest,
  });
  await kernel.startRun({ request: improveRequest, run_id: 'run:improve' });
  const second = await kernel.advanceUntilPause('run:improve');
  assert.equal(second.run.risk_tier, 'low');
  assert.equal(second.run.state, 'completed_active');
  const allVersions = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.equal(allVersions.length, 2);
  assert.notEqual(allVersions[1]!.version_digest, versionOne!.version_digest);

  const rollback = await kernel.rollbackActivation({
    target_agent_id: 'fixture-agent',
    target_domain_id: 'fixture-domain',
    version_digest: versionOne!.version_digest,
    expected_revision: 2,
    authority_receipt_ref: authorizeRollback({
      target_agent_id: 'fixture-agent',
      target_domain_id: 'fixture-domain',
      version_digest: versionOne!.version_digest,
      expected_revision: 2,
    }),
  });
  assert.equal(rollback.transaction_kind, 'rollback');
  assert.equal(rollback.runtime_preflight.version_digest, versionOne!.version_digest);
  assert.equal(rollback.runtime_binding_verification.verification_phase, 'pre_commit');
  assert.equal(rollback.runtime_binding_verification.version_digest, versionOne!.version_digest);
  assert.equal(rollback.runtime_binding_verification.candidate_digest, versionOne!.candidate_digest);
  assert.equal(rollback.runtime_binding_verification.expected_activation_revision, 2);
  assert.deepEqual(
    (await versions.activationHistory('fixture-agent', 'fixture-domain')).at(-1)?.runtime_binding_verification,
    rollback.runtime_binding_verification,
  );
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, versionOne!.version_digest);
  assert.equal(verifyFoundryEventChain(await events.read('run:create')).status, 'valid');
});

test('FoundryKernel preserves the activation pointer when hosted candidate preflight fails', async () => {
  let controlled: ControlledActivationRuntime | undefined;
  const { kernel, versions, events } = harness(new FixtureEvaluator(), (registry) => {
    controlled = new ControlledActivationRuntime(registry, { preflightFailure: 'hosted ABI preflight denied' });
    return controlled;
  });
  await prepareActivatingCreateRun(kernel, 'run:activation-preflight-failure');

  const failed = await kernel.advanceRunStep('run:activation-preflight-failure');
  assert.equal(failed.run.state, 'failed');
  assert.match(String((await events.read('run:activation-preflight-failure')).at(-1)?.payload.failure_message),
    /hosted ABI preflight denied/);
  assert.equal(controlled?.preflightCalls, 1);
  assert.equal(controlled?.readbackCalls, 0);
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, null);
  assert.equal((await kernel.inspectRun('run:activation-preflight-failure')).run.state, 'failed');
  assert.equal((await events.read('run:activation-preflight-failure'))
    .some((event) => event.event_type === 'activation_completed'), false);
});

test('FoundryKernel does not change the pointer or read back runtime when activation CAS is stale', async () => {
  const backing = new InMemoryVersionRegistry();
  const staleVersions: VersionRegistry = {
    register: (input) => backing.register(input),
    list: (targetAgentId, targetDomainId) => backing.list(targetAgentId, targetDomainId),
    resolveVersion: (ref, targetAgentId, targetDomainId) => backing.resolveVersion(ref, targetAgentId, targetDomainId),
    activation: (targetAgentId, targetDomainId) => backing.activation(targetAgentId, targetDomainId),
    activationHistory: (targetAgentId, targetDomainId) => backing.activationHistory(targetAgentId, targetDomainId),
    compareAndSwapActivation: async () => { throw new Error('ActivationPointer compare-and-swap failed: stale fixture'); },
    rollback: (input) => backing.rollback(input),
  };
  const activationRuntime = new ControlledActivationRuntime(staleVersions);
  const events = new InMemoryFoundryEventStore();
  const kernel = new FoundryKernel({
    designer: new FixtureDesigner(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    evaluator: new FixtureEvaluator(),
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions: staleVersions,
    activationRuntime,
    ownerGate,
    clock: { now: () => '2026-07-16T00:00:00.000Z' },
  });
  await prepareActivatingCreateRun(kernel, 'run:activation-stale-cas');

  const failed = await kernel.advanceRunStep('run:activation-stale-cas');
  assert.equal(failed.run.state, 'failed');
  assert.match(String((await events.read('run:activation-stale-cas')).at(-1)?.payload.failure_message),
    /compare-and-swap failed: stale fixture/);
  assert.equal(activationRuntime.preflightCalls, 1);
  assert.equal(activationRuntime.readbackCalls, 0);
  assert.equal((await backing.activation('fixture-agent', 'fixture-domain')).active_version_digest, null);
  assert.equal((await events.read('run:activation-stale-cas'))
    .some((event) => event.event_type === 'activation_completed'), false);
});

test('FoundryKernel uses exact pre-commit binding verification instead of post-CAS readback', async () => {
  let controlled: ControlledActivationRuntime | undefined;
  const { kernel, versions, events } = harness(new FixtureEvaluator(), (registry) => {
    controlled = new ControlledActivationRuntime(registry, { mismatchReadback: true });
    return controlled;
  });
  await prepareActivatingCreateRun(kernel, 'run:activation-readback-mismatch');
  const [version] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(version);

  const completed = await kernel.advanceRunStep('run:activation-readback-mismatch');
  assert.equal(completed.run.state, 'completed_active');
  assert.equal(controlled?.preflightCalls, 1);
  assert.equal(controlled?.readbackCalls, 0);
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, version.version_digest);
  const activationEvent = (await events.read('run:activation-readback-mismatch')).at(-1)!;
  assert.equal(activationEvent.event_type, 'activation_completed');
  assert.equal(
    (activationEvent.payload.activation_runtime_binding_verification as { verification_phase?: unknown })
      .verification_phase,
    'pre_commit',
  );
  assert.equal(Object.hasOwn(activationEvent.payload, 'activation_runtime_readback'), false);
});

test('FoundryKernel rejects an empty prepared runtime binding before activation CAS', async () => {
  let controlled: ControlledActivationRuntime | undefined;
  const { kernel, versions, events } = harness(new FixtureEvaluator(), (registry) => {
    controlled = new ControlledActivationRuntime(registry, { emptyRuntimeBindingRef: true });
    return controlled;
  });
  await prepareActivatingCreateRun(kernel, 'run:activation-binding-preflight-mismatch');

  const quarantined = await kernel.advanceRunStep('run:activation-binding-preflight-mismatch');
  assert.equal(quarantined.run.state, 'quarantined');
  assert.match(
    String((await events.read('run:activation-binding-preflight-mismatch')).at(-1)?.payload.failure_message),
    /preflight does not bind the exact target AgentVersion and revision/,
  );
  assert.equal(controlled?.preflightCalls, 1);
  assert.equal(controlled?.readbackCalls, 0);
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, null);
  assert.equal((await versions.activationHistory('fixture-agent', 'fixture-domain')).length, 0);
});

test('FoundryKernel rollback commits from exact pre-commit binding verification without post-CAS readback', async () => {
  let controlled: ControlledActivationRuntime | undefined;
  const { kernel, versions } = harness(new FixtureEvaluator(), (registry) => {
    controlled = new ControlledActivationRuntime(registry, { mismatchReadback: true });
    return controlled;
  });
  await activateCreateRun(kernel, 'run:rollback-precommit-baseline');
  const [baseline] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(baseline);
  await kernel.startRun({
    request: request({
      request_id: 'request:rollback-precommit-improve',
      mode: 'improve',
      target_version_ref: baseline.version_digest,
    }),
    run_id: 'run:rollback-precommit-improve',
  });
  const improved = await kernel.advanceUntilPause('run:rollback-precommit-improve');
  assert.equal(improved.run.state, 'completed_active');

  const rollback = await kernel.rollbackActivation({
    target_agent_id: 'fixture-agent',
    target_domain_id: 'fixture-domain',
    version_digest: baseline.version_digest,
    expected_revision: 2,
    authority_receipt_ref: authorizeRollback({
      target_agent_id: 'fixture-agent',
      target_domain_id: 'fixture-domain',
      version_digest: baseline.version_digest,
      expected_revision: 2,
    }),
  });

  assert.equal(rollback.runtime_binding_verification.verification_phase, 'pre_commit');
  assert.equal(rollback.runtime_binding_verification.transaction_kind, 'rollback');
  assert.equal(rollback.runtime_binding_verification.version_digest, baseline.version_digest);
  assert.equal(rollback.runtime_binding_verification.expected_activation_revision, 2);
  assert.equal(controlled?.preflightCalls, 3);
  assert.equal(controlled?.readbackCalls, 0);
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, baseline.version_digest);
  assert.equal((await versions.activationHistory('fixture-agent', 'fixture-domain')).length, 3);
});

test('FoundryKernel rollback preflight failure preserves the current pointer and activation history', async () => {
  let controlled: ControlledActivationRuntime | undefined;
  const { kernel, versions } = harness(new FixtureEvaluator(), (registry) => {
    controlled = new ControlledActivationRuntime(registry);
    return controlled;
  });
  await activateCreateRun(kernel, 'run:rollback-preflight-baseline');
  const [baseline] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(baseline);
  await kernel.startRun({
    request: request({
      request_id: 'request:rollback-preflight-improve',
      mode: 'improve',
      target_version_ref: baseline.version_digest,
    }),
    run_id: 'run:rollback-preflight-improve',
  });
  const improved = await kernel.advanceUntilPause('run:rollback-preflight-improve');
  assert.equal(improved.run.state, 'completed_active');
  const before = await versions.activation('fixture-agent', 'fixture-domain');
  assert.equal(before.revision, 2);
  controlled!.denyPreflight('rollback prepared binding denied');

  await assert.rejects(kernel.rollbackActivation({
    target_agent_id: 'fixture-agent',
    target_domain_id: 'fixture-domain',
    version_digest: baseline.version_digest,
    expected_revision: before.revision,
    authority_receipt_ref: authorizeRollback({
      target_agent_id: 'fixture-agent',
      target_domain_id: 'fixture-domain',
      version_digest: baseline.version_digest,
      expected_revision: before.revision,
    }),
  }), /rollback prepared binding denied/);

  assert.deepEqual(await versions.activation('fixture-agent', 'fixture-domain'), before);
  assert.equal((await versions.activationHistory('fixture-agent', 'fixture-domain')).length, 2);
  assert.equal(controlled?.readbackCalls, 0);
});

test('FoundryKernel takeover binds an exact active baseline and activates a separately qualified version', async () => {
  const { kernel, versions } = harness();
  await activateCreateRun(kernel, 'run:takeover-baseline');
  const [baseline] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(baseline);

  const takeoverRequest = request({
    request_id: 'request:takeover:fixture',
    mode: 'takeover',
    target_version_ref: baseline.version_digest,
  });
  await kernel.startRun({ request: takeoverRequest, run_id: 'run:takeover' });
  const completed = await kernel.advanceUntilPause('run:takeover');

  assert.equal(completed.run.state, 'completed_active');
  assert.equal(completed.run.risk_tier, 'low');
  assert.equal(completed.request.target_version_ref, baseline.version_digest);
  assert.equal((await kernel.listVersions('fixture-agent', 'fixture-domain')).length, 2);
  assert.notEqual((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, baseline.version_digest);
});

test('FoundryKernel Owner rejection is terminal and preserves the prior activation pointer', async () => {
  const { kernel, versions } = harness();
  await kernel.startRun({ request: request(), run_id: 'run:owner-reject' });
  const waiting = await kernel.advanceUntilPause('run:owner-reject');
  assert.equal(waiting.run.state, 'awaiting_owner_canary');

  const rejected = await kernel.submitOwnerDecision({
    run_id: 'run:owner-reject',
    expected_revision: waiting.run.revision,
    decision: 'reject',
    authority_receipt_ref: authorizeRunMutation({
      inspection: waiting,
      action: 'reject_canary',
      decision: 'reject',
    }),
  });

  assert.equal(rejected.run.state, 'rejected');
  assert.equal((await versions.activation('fixture-agent', 'fixture-domain')).active_version_digest, null);
});

test('FoundryKernel verifies exact OwnerGate coverage before appending an authority event', async () => {
  const { kernel, events } = harness();
  await kernel.startRun({ request: request(), run_id: 'run:owner-gate-exact' });
  const waiting = await kernel.advanceUntilPause('run:owner-gate-exact');
  const revisionBefore = waiting.run.revision;
  const eventCountBefore = (await events.read(waiting.run.run_id)).length;
  const wrongTarget = ownerGate.register({
    surface_kind: 'opl_foundry_owner_authority_receipt',
    version: 'opl-foundry-owner-authority-receipt.v1',
    receipt_id: 'receipt:wrong-target',
    authority_ref: 'owner-gate:activation',
    action: 'approve_canary',
    decision: 'approve',
    target_agent_id: 'other-agent',
    target_domain_id: waiting.request.target_domain_id,
    run_id: waiting.run.run_id,
    version_digest: waiting.run.version_digest,
    expected_revision: waiting.run.revision,
    issued_at: '2026-07-16T00:00:00.000Z',
  });
  await assert.rejects(kernel.submitOwnerDecision({
    run_id: waiting.run.run_id,
    expected_revision: waiting.run.revision,
    decision: 'approve',
    authority_receipt_ref: wrongTarget.receipt_ref,
  }, { advance: false }), /exact requested authority mutation/);
  const unchanged = await kernel.inspectRun(waiting.run.run_id);
  assert.equal(unchanged.run.revision, revisionBefore);
  assert.equal((await events.read(waiting.run.run_id)).length, eventCountBefore);

  const authorityReceiptRef = authorizeRunMutation({
    inspection: waiting,
    action: 'approve_canary',
    decision: 'approve',
  });
  const approved = await kernel.submitOwnerDecision({
    run_id: waiting.run.run_id,
    expected_revision: waiting.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorityReceiptRef,
  }, { advance: false });
  const authorityEvent = (await events.read(waiting.run.run_id)).at(-1)!;
  assert.equal(authorityEvent.event_type, 'owner_approved');
  assert.equal(authorityEvent.payload.owner_authority_receipt_ref, authorityReceiptRef);
  assert.equal(
    authorityEvent.payload.owner_authority_receipt_digest,
    authorityReceiptRef.slice(authorityReceiptRef.lastIndexOf('/') + 1),
  );
  const replay = await kernel.submitOwnerDecision({
    run_id: waiting.run.run_id,
    expected_revision: waiting.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorityReceiptRef,
  }, { advance: false });
  assert.equal(replay.run.revision, approved.run.revision);
});

test('FoundryKernel rejects authority selected outside the Framework-owned target policy', async () => {
  const { kernel, events } = harness();
  await kernel.startRun({ request: request(), run_id: 'run:untrusted-owner-authority' });
  const waiting = await kernel.advanceUntilPause('run:untrusted-owner-authority');
  const revision = waiting.run.revision;
  const eventCount = (await events.read(waiting.run.run_id)).length;
  const receiptRef = authorizeRunMutation({
    inspection: waiting,
    action: 'approve_canary',
    decision: 'approve',
    authority_ref: 'owner-gate:attacker',
  });
  await assert.rejects(kernel.submitOwnerDecision({
    run_id: waiting.run.run_id,
    expected_revision: revision,
    decision: 'approve',
    authority_receipt_ref: receiptRef,
  }), /Framework-owned target authority policy/);
  assert.equal((await kernel.inspectRun(waiting.run.run_id)).run.revision, revision);
  assert.equal((await events.read(waiting.run.run_id)).length, eventCount);
});

test('FoundryKernel rejects missing or stale non-create baselines before design starts', async () => {
  const { kernel } = harness();
  await activateCreateRun(kernel, 'run:exact-baseline');
  const [historicalBaseline] = await kernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(historicalBaseline);

  await assert.rejects(kernel.startRun({
    request: request({
      request_id: 'request:takeover:missing-baseline',
      mode: 'takeover',
      target_version_ref: null,
    }),
    run_id: 'run:missing-baseline',
  }), /exact target version digest/);
  await assert.rejects(kernel.startRun({
    request: request({
      request_id: 'request:takeover:stale-baseline',
      mode: 'takeover',
      target_version_ref: `sha256:${'9'.repeat(64)}`,
    }),
    run_id: 'run:stale-baseline',
  }), /existing exact target version/);

  await kernel.startRun({
    request: request({
      request_id: 'request:takeover:advance-active',
      mode: 'takeover',
      target_version_ref: historicalBaseline.version_digest,
    }),
    run_id: 'run:advance-active',
  });
  assert.equal((await kernel.advanceUntilPause('run:advance-active')).run.state, 'completed_active');
  await assert.rejects(kernel.startRun({
    request: request({
      request_id: 'request:improve:historical-baseline',
      mode: 'improve',
      target_version_ref: historicalBaseline.version_digest,
    }),
    run_id: 'run:historical-baseline',
  }), /exact active AgentVersion/);

  await assert.rejects(kernel.startRun({
    request: request({ request_id: 'request:create:existing-active' }),
    run_id: 'run:create-existing-active',
  }), /no active AgentVersion/);
});

test('FoundryKernel exhausts the declared evolution generation budget even when scores improve', async () => {
  const { kernel, events } = harness(new BudgetEvaluator());
  await kernel.startRun({
    request: request({
      request_id: 'request:generation-budget',
      delivery_policy: { activation_mode: 'activate', max_generations: 1 },
    }),
    run_id: 'run:generation-budget',
  });
  const completed = await kernel.advanceUntilPause('run:generation-budget');

  assert.equal(completed.run.state, 'completed_unqualified');
  assert.equal(completed.run.generation, 1);
  assert.equal((await events.read('run:generation-budget')).at(-1)?.event_type, 'evolution_budget_exhausted');
});

test('FoundryKernel quarantines stale EvidenceBundle content binding', async () => {
  const { kernel, events } = harness(new StaleEvidenceEvaluator());
  await kernel.startRun({ request: request(), run_id: 'run:stale-evidence' });
  const inspection = await kernel.advanceUntilPause('run:stale-evidence');

  assert.equal(inspection.run.state, 'quarantined');
  assert.match(String((await events.read('run:stale-evidence')).at(-1)?.payload.failure_message), /stale/);
});

test('FoundryKernel recomputes evaluator facts and quarantines self-reported qualification', async (t) => {
  const mutations: Array<[string, (bundle: EvidenceBundle) => void, RegExp]> = [
    ['qualified boolean', (bundle) => { bundle.qualified = true; }, /qualification or gate score/],
    ['gate score', (bundle) => { bundle.gate_score = 1; }, /qualification or gate score/],
    ['public case identity', (bundle) => { bundle.public_results[0]!.case_id = 'case:invented'; }, /unknown or duplicate/],
    ['protected minimum count', (bundle) => {
      Object.assign(bundle.protected_aggregates[0]!, { total: 0, passed: 0, failed: 0, score: 0 });
    }, /frozen requirement/],
    ['protected aggregate score', (bundle) => { bundle.protected_aggregates[0]!.score = 1; }, /counts or score/],
    ['independent reviewer identity', (bundle) => {
      bundle.independent_review.evaluator_ref = 'evaluator:fixture';
    }, /provenance or content binding/],
  ];
  for (const [label, mutate, expectedMessage] of mutations) {
    await t.test(label, async () => {
      const { kernel, events } = harness(new MutatingEvidenceEvaluator(mutate));
      const runId = `run:tampered:${label.replaceAll(' ', '-')}`;
      await kernel.startRun({ request: request(), run_id: runId });
      const inspection = await kernel.advanceUntilPause(runId);
      assert.equal(inspection.run.state, 'quarantined');
      assert.match(String((await events.read(runId)).at(-1)?.payload.failure_message), expectedMessage);
    });
  }
});

test('FoundryKernel recomputes required baseline regression from complete public results', async () => {
  const events = new InMemoryFoundryEventStore();
  const versions = new InMemoryVersionRegistry();
  const objects = new InMemoryFoundryObjectStore();
  const compiler = new DeterministicInMemoryCandidateCompiler();
  const baselineKernel = new FoundryKernel({
    designer: new FixtureDesigner(),
    evaluator: new FixtureEvaluator(),
    compiler,
    objects,
    events,
    versions,
    ownerGate,
  });
  await activateCreateRun(baselineKernel, 'run:baseline-regression-source');
  const [baseline] = await baselineKernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(baseline);
  const evaluator = new HiddenBaselineRegressionEvaluator();
  const kernel = new FoundryKernel({
    designer: new BaselineComparisonDesigner(),
    evaluator,
    compiler,
    objects,
    events,
    versions,
    ownerGate,
  });
  const takeover = request({
    request_id: 'request:hidden-baseline-regression',
    mode: 'takeover',
    target_version_ref: baseline.version_digest,
  });
  await kernel.startRun({ request: takeover, run_id: 'run:hidden-baseline-regression' });
  const inspection = await kernel.advanceUntilPause('run:hidden-baseline-regression');

  assert.equal(inspection.run.state, 'quarantined');
  assert.match(
    String((await events.read('run:hidden-baseline-regression')).at(-1)?.payload.failure_message),
    /qualification or gate score/,
  );
});

test('FoundryKernel qualification and canary reuse one admitted materialized candidate', async () => {
  const compiler = new CountingCandidateCompiler();
  const observedCandidateDigests: string[] = [];
  const fixture = new FixtureEvaluator();
  const evaluator: EvaluationExecutor = {
    evaluator_id: fixture.evaluator_id,
    evaluate: async (input) => {
      observedCandidateDigests.push(input.candidate.candidate_digest);
      return fixture.evaluate(input);
    },
    canary: async (input) => {
      observedCandidateDigests.push(input.candidate.candidate_digest);
      return fixture.canary(input);
    },
  };
  const kernel = new FoundryKernel({
    designer: new PassingDesigner(),
    evaluator,
    compiler,
    objects: new InMemoryFoundryObjectStore(),
    events: new InMemoryFoundryEventStore(),
    versions: new InMemoryVersionRegistry(),
    ownerGate,
  });
  await kernel.startRun({ request: request(), run_id: 'run:single-materialization' });
  const waiting = await kernel.advanceUntilPause('run:single-materialization');
  assert.equal(waiting.run.state, 'awaiting_owner_canary');
  assert.equal(compiler.calls, 1);
  const canary = await kernel.submitOwnerDecision({
    run_id: waiting.run.run_id,
    expected_revision: waiting.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection: waiting,
      action: 'approve_canary',
      decision: 'approve',
    }),
  }, { advance: false });
  assert.equal(canary.run.state, 'canary');
  await kernel.advanceRunStep(canary.run.run_id);

  assert.equal(compiler.calls, 1);
  assert.deepEqual(observedCandidateDigests, [waiting.run.candidate_digest, waiting.run.candidate_digest]);
});

test('Process evaluator transport excludes protected bodies and cannot self-report qualification', async (t) => {
  const designRequest = request({ request_id: 'request:external-process-evaluator' });
  const agentBlueprint = blueprint(designRequest, 0, 'prompt:v1');
  const expectedPlanDigest = foundryFrozenEvaluationPlanDigest(agentBlueprint.eval_spec);
  const packRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-process-pack-'));
  t.after(() => fs.rmSync(packRoot, { recursive: true, force: true }));
  const candidateDirectories = new Map<string, string>();
  const exactPackCompiler: CandidateCompiler = {
    async materialize(input) {
      const manifestBytes = canonicalJsonBytes({
        surface_kind: 'opl_foundry_test_candidate_manifest',
        blueprint_digest: input.blueprint_digest,
      });
      const manifestSha = crypto.createHash('sha256').update(manifestBytes).digest('hex');
      const files = [{
        path: 'agent/agent-pack.json',
        sha256: manifestSha,
        byte_size: manifestBytes.byteLength,
      }];
      const candidateDigest = foundryContentDigest({
        surface_kind: 'opl_foundry_candidate_file_index',
        version: 'opl-foundry-candidate-index.v2',
        blueprint_digest: input.blueprint_digest,
        files,
      });
      const directory = path.join(packRoot, candidateDigest.slice('sha256:'.length));
      fs.mkdirSync(path.join(directory, 'agent'), { recursive: true });
      fs.writeFileSync(path.join(directory, files[0]!.path), manifestBytes);
      fs.writeFileSync(path.join(directory, 'candidate-index.json'), canonicalJsonBytes({
        surface_kind: 'opl_foundry_candidate_file_index',
        version: 'opl-foundry-candidate-index.v2',
        blueprint_digest: input.blueprint_digest,
        candidate_digest: candidateDigest,
        files,
      }));
      candidateDirectories.set(candidateDigest, directory);
      return {
        surface_kind: 'opl_foundry_materialized_candidate',
        target_agent_id: input.blueprint.target_agent_id,
        target_domain_id: input.blueprint.target_domain_id,
        blueprint_digest: input.blueprint_digest,
        candidate_digest: candidateDigest,
        candidate_ref: `opl://foundry/candidate/${candidateDigest}`,
        manifest_digest: `sha256:${manifestSha}`,
      };
    },
  };
  const evaluatorScript = `
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const transport = JSON.stringify(input);
    if (/hidden_test_bod|protected_test_bod/.test(transport)) process.exit(91);
    if (input.protected_test_transport?.bodies_in_request !== false) process.exit(92);
    process.stdout.write(JSON.stringify({
      surface_kind: 'opl_foundry_evidence_bundle',
      version: 'opl-foundry-protocol.v1',
      evidence_id: 'evidence:external-process',
      target_agent_id: input.request.target_agent_id,
      target_domain_id: input.request.target_domain_id,
      target_version_ref: input.request.target_version_ref,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: input.candidate.candidate_digest,
      baseline_version_digest: null,
      frozen_test_plan_digest: '${expectedPlanDigest}',
      public_results: [{ case_id: 'case:required', status: 'fail', score: 0, evidence_refs: ['evidence:public'] }],
      baseline_public_results: null,
      baseline_protected_aggregates: null,
      protected_aggregates: [{ category: 'privacy:no-sensitive-data', total: 1, passed: 0, failed: 1, score: 0 }],
      independent_review: {
        evaluator_ref: 'reviewer:external-process',
        evaluation_execution_ref: 'evaluation:external-process',
        review_execution_ref: 'review:external-process',
        verdict: 'fail',
        findings: ['candidate failed'],
        evidence_refs: ['evidence:review']
      },
      safety_delta: { incidents: 0 },
      cost_delta: { usd: 0 },
      latency_delta: { milliseconds: 0 },
      failure_classification: [],
      qualified: true,
      gate_score: 1,
      provenance: {
        foundry_run_id: input.run_id,
        generation: input.blueprint.generation,
        producer_id: input.evaluator_id,
        evaluated_at: '2026-07-16T00:00:00.000Z',
        source_refs: ['evidence:external-process']
      }
    }));
  `;
  const evaluator = new ProcessFoundryEvaluationExecutor({
    execution_mode: 'offline_projected_pack_observation.v1',
    executable: process.execPath,
    args: ['--input-type=module', '--eval', evaluatorScript],
    reviewer_executable: process.execPath,
    reviewer_args: ['--input-type=module', '--eval', `
      process.stdout.write(JSON.stringify({
        surface_kind: 'opl_foundry_independent_review_result',
        version: 'opl-foundry-independent-review-result.v1',
        verdict: 'fail',
        findings: ['candidate failed'],
        evidence_refs: ['evidence:review']
      }));
    `],
    candidate_pack_resolver: {
      resolveDirectory: (candidate) => candidateDirectories.get(candidate.candidate_digest) ?? '',
    },
    timeout_ms: 10_000,
  });
  const events = new InMemoryFoundryEventStore();
  const kernel = new FoundryKernel({
    designer: new FixtureDesigner(),
    evaluator,
    compiler: exactPackCompiler,
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions: new InMemoryVersionRegistry(),
  });
  await kernel.startRun({ request: designRequest, run_id: 'run:external-process-evaluator' });
  const inspection = await kernel.advanceUntilPause('run:external-process-evaluator');

  assert.equal(inspection.run.state, 'quarantined');
  assert.match(
    String((await events.read(inspection.run.run_id)).at(-1)?.payload.failure_message),
    /evaluation observation/i,
  );
});

test('OMA self-improvement remains high risk and rolls canary regression back to the exact active version', async () => {
  const events = new InMemoryFoundryEventStore();
  const versions = new InMemoryVersionRegistry();
  const objects = new InMemoryFoundryObjectStore();
  const compiler = new DeterministicInMemoryCandidateCompiler();
  const dependencies = (designer: DesignerPort, evaluator: EvaluationExecutor) => ({
    designer,
    evaluator,
    compiler,
    objects,
    events,
    versions,
    ownerGate,
    clock: { now: () => '2026-07-16T00:00:00.000Z' },
  });
  const baselineKernel = new FoundryKernel(dependencies(new FixtureDesigner(), new FixtureEvaluator()));
  const omaCreateRequest = request({
    request_id: 'request:oma:create',
    target_agent_id: 'oma',
    target_domain_id: 'agent_engineering',
  });
  await activateCreateRun(baselineKernel, 'run:oma:create', omaCreateRequest);
  const [baseline] = await baselineKernel.listVersions('oma', 'agent_engineering');
  assert.ok(baseline);

  const kernel = new FoundryKernel(dependencies(new HighRiskDesigner(), new CanaryRegressionEvaluator()));
  const improveRequest = request({
    request_id: 'request:oma:high-risk-improve',
    mode: 'improve',
    target_agent_id: 'oma',
    target_domain_id: 'agent_engineering',
    target_version_ref: baseline.version_digest,
  });
  await kernel.startRun({ request: improveRequest, run_id: 'run:oma:high-risk-improve' });
  const waiting = await kernel.advanceUntilPause('run:oma:high-risk-improve');
  assert.equal(waiting.run.risk_tier, 'high');
  assert.equal(waiting.run.state, 'awaiting_owner_canary');
  const before = await versions.activation('oma', 'agent_engineering');

  const canary = await kernel.submitOwnerDecision({
    run_id: 'run:oma:high-risk-improve',
    expected_revision: waiting.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection: waiting,
      action: 'approve_canary',
      decision: 'approve',
    }),
  }, { advance: false });
  assert.equal(canary.run.state, 'canary');
  const rolledBack = await kernel.advanceRunStep('run:oma:high-risk-improve');
  const after = await versions.activation('oma', 'agent_engineering');

  assert.equal(rolledBack.run.state, 'evidence_ready');
  assert.deepEqual(after, before);
  const rollbackEvent = (await events.read('run:oma:high-risk-improve')).at(-1);
  assert.equal(rollbackEvent?.event_type, 'canary_regression_rolled_back');
  assert.equal(rollbackEvent?.payload.rollback_to_version_digest, baseline.version_digest);
});

test('FoundryKernel rejects stale Owner decisions and locks one writer per target', async () => {
  const { kernel } = harness();
  await kernel.startRun({ request: request(), run_id: 'run:locked' });
  await assert.rejects(
    kernel.startRun({ request: request({ request_id: 'request:concurrent' }), run_id: 'run:concurrent' }),
    /active write FoundryRun/,
  );
  const waiting = await kernel.advanceUntilPause('run:locked');
  await assert.rejects(kernel.submitOwnerDecision({
    run_id: 'run:locked',
    expected_revision: waiting.run.revision - 1,
    decision: 'approve',
    authority_receipt_ref: 'owner-receipt:stale',
  }), /revision compare-and-swap failed/);
  const cancelledHarness = harness();
  await cancelledHarness.kernel.startRun({ request: request(), run_id: 'run:cancelled' });
  const cancelGate = await cancelledHarness.kernel.advanceUntilPause('run:cancelled');
  const cancelled = await cancelledHarness.kernel.cancelRun({
    run_id: 'run:cancelled',
    expected_revision: cancelGate.run.revision,
    authority_receipt_ref: authorizeRunMutation({
      inspection: cancelGate,
      action: 'cancel',
      decision: 'cancel',
    }),
  });
  assert.equal(cancelled.run.state, 'cancelled');
});

test('FoundryKernel cancels accepted and designing runs from Framework-owned authority without a Blueprint', async () => {
  for (const phase of ['accepted', 'designing'] as const) {
    const { kernel, events } = harness();
    const runId = `run:cancel-before-blueprint:${phase}`;
    await kernel.startRun({
      request: request({ request_id: `request:cancel-before-blueprint:${phase}` }),
      run_id: runId,
    });
    if (phase === 'designing') await kernel.advanceRunStep(runId);
    const before = await kernel.inspectRun(runId);
    assert.equal(before.run.state, phase);
    assert.equal(before.run.blueprint_digest, null);

    const authorityReceiptRef = authorizeRunMutation({
      inspection: before,
      action: 'cancel',
      decision: 'cancel',
    });
    const cancelled = await kernel.cancelRun({
      run_id: runId,
      expected_revision: before.run.revision,
      authority_receipt_ref: authorityReceiptRef,
    });
    assert.equal(cancelled.run.state, 'cancelled');
    assert.equal(cancelled.run.blueprint_digest, null);
    assert.equal((await events.read(runId)).at(-1)?.event_type, 'foundry_run_cancelled');
    assert.deepEqual(await kernel.cancelRun({
      run_id: runId,
      expected_revision: before.run.revision,
      authority_receipt_ref: authorityReceiptRef,
    }), cancelled);
  }
});

test('FoundryKernel quarantines evidence that changes the frozen test plan', async () => {
  const { kernel } = harness(new FixtureEvaluator(1));
  await kernel.startRun({ request: request(), run_id: 'run:mutated-plan' });
  const inspection = await kernel.advanceUntilPause('run:mutated-plan');
  assert.equal(inspection.run.state, 'quarantined');
});

test('FoundryKernel requires independent designer and evaluator identities', () => {
  const evaluator = new FixtureEvaluator();
  Object.defineProperty(evaluator, 'evaluator_id', { value: 'designer:fixture' });
  assert.throws(() => new FoundryKernel({
    designer: new FixtureDesigner(),
    evaluator,
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events: new InMemoryFoundryEventStore(),
    versions: new InMemoryVersionRegistry(),
  }), /independent producer identities/);
});

test('FoundryKernel retries only explicitly transient activities without consuming a generation', async () => {
  const fixture = new FixtureDesigner();
  let transientAttempts = 0;
  const designer = new FunctionFoundryDesignerAdapter({
    producer_id: 'designer:transient-fixture',
    design: async (input) => {
      transientAttempts += 1;
      if (transientAttempts < 3) {
        throw new FoundryTransientActivityError('temporary designer transport failure');
      }
      return fixture.design(input);
    },
    diagnose: (input) => fixture.diagnose(input),
  });
  const kernel = new FoundryKernel({
    designer,
    evaluator: new FixtureEvaluator(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events: new InMemoryFoundryEventStore(),
    versions: new InMemoryVersionRegistry(),
    activityMaxAttempts: 3,
  });

  await kernel.startRun({ request: request(), run_id: 'run:transient-retry' });
  const inspection = await kernel.advanceUntilPause('run:transient-retry');
  assert.equal(transientAttempts, 3);
  assert.equal(inspection.run.generation, 1);
  assert.equal(inspection.run.state, 'awaiting_owner_canary');
});

test('FoundryKernel does not retry permanent activity failures', async () => {
  let attempts = 0;
  const designer = new FunctionFoundryDesignerAdapter({
    producer_id: 'designer:permanent-fixture',
    design: async () => {
      attempts += 1;
      throw new Error('permanent provider failure');
    },
    diagnose: (input) => new FixtureDesigner().diagnose(input),
  });
  const kernel = new FoundryKernel({
    designer,
    evaluator: new FixtureEvaluator(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events: new InMemoryFoundryEventStore(),
    versions: new InMemoryVersionRegistry(),
    activityMaxAttempts: 3,
  });

  await kernel.startRun({ request: request(), run_id: 'run:permanent-failure' });
  const inspection = await kernel.advanceUntilPause('run:permanent-failure');
  assert.equal(attempts, 1);
  assert.equal(inspection.run.generation, 0);
  assert.equal(inspection.run.state, 'failed');
});

test('FoundryKernel terminates an exact no-change diagnosis without creating a duplicate generation', async () => {
  const events = new InMemoryFoundryEventStore();
  const versions = new InMemoryVersionRegistry();
  const kernel = new FoundryKernel({
    designer: new NoChangeDesigner(),
    evaluator: new FixtureEvaluator(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions,
  });

  await kernel.startRun({ request: request(), run_id: 'run:no-change' });
  const inspection = await kernel.advanceUntilPause('run:no-change');
  assert.equal(inspection.run.state, 'completed_unqualified');
  assert.equal(inspection.run.generation, 0);
  assert.equal((await kernel.listVersions('fixture-agent', 'fixture-domain')).length, 0);
  assert.equal((await events.read('run:no-change')).at(-1)?.event_type, 'evolution_no_change');
});

test('FoundryKernel freezes an admitted evaluation plan per generation while allowing stronger next-generation tests', async () => {
  const events = new InMemoryFoundryEventStore();
  const kernel = new FoundryKernel({
    designer: new AddedEvaluationCaseDesigner(),
    evaluator: new AddedEvaluationCaseEvaluator(),
    compiler: new DeterministicInMemoryCandidateCompiler(),
    objects: new InMemoryFoundryObjectStore(),
    events,
    versions: new InMemoryVersionRegistry(),
  });
  const designRequest = request({
    request_id: 'request:stronger-next-generation-plan',
    delivery_policy: { activation_mode: 'qualify_only', max_generations: 5 },
  });

  await kernel.startRun({ request: designRequest, run_id: 'run:stronger-next-generation-plan' });
  const completed = await kernel.advanceUntilPause('run:stronger-next-generation-plan');

  assert.equal(completed.run.state, 'completed_qualified');
  assert.equal(completed.run.generation, 1);
  const evaluationEvents = (await events.read(completed.run.run_id)).filter((event) =>
    event.event_type === 'evaluation_failed' || event.event_type === 'candidate_qualified');
  assert.equal(evaluationEvents.length, 2);
  assert.notEqual(
    evaluationEvents[0]?.payload.frozen_test_plan_digest,
    evaluationEvents[1]?.payload.frozen_test_plan_digest,
  );
});

test('Evaluation Runtime isolates protected execution and evaluates baseline and candidate on one plan', async () => {
  const designRequest = request({
    request_id: 'request:evaluation-runtime',
    mode: 'takeover',
    target_version_ref: `sha256:${'1'.repeat(64)}`,
  });
  const agentBlueprint = blueprint(designRequest, 0, 'prompt:evaluation-runtime');
  const candidate = await new DeterministicInMemoryCandidateCompiler().materialize({
    run_id: 'run:evaluation-runtime',
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
  });
  const baseline: Awaited<ReturnType<InMemoryVersionRegistry['resolveVersion']>> & {} = {
    surface_kind: 'opl_foundry_agent_version',
    version_id: 'version:baseline',
    version_digest: designRequest.target_version_ref!,
    target_agent_id: designRequest.target_agent_id,
    target_domain_id: designRequest.target_domain_id,
    blueprint_digest: `sha256:${'2'.repeat(64)}`,
    candidate_digest: `sha256:${'3'.repeat(64)}`,
    candidate_ref: 'opl://foundry/candidate/baseline',
    qualification_digest: `sha256:${'4'.repeat(64)}`,
    created_at: '2026-07-16T00:00:00.000Z',
  };
  const publicSubjects: string[] = [];
  const protectedSubjects: string[] = [];
  let reviewedProtectedAggregate: unknown = null;
  const executor: EvaluationCaseExecutor = {
    executor_id: 'executor:evaluation-runtime',
    executionRef: ({ run_id, generation, phase }) => `evaluation:${run_id}:${generation}:${phase}`,
    async runPublicCase(input) {
      publicSubjects.push(`${input.subject.kind}:${input.test_case.case_id}`);
      return {
        case_id: input.test_case.case_id,
        status: 'pass',
        score: input.subject.kind === 'candidate' ? 1 : 0.8,
        evidence_refs: [`evidence:public:${input.subject.kind}`],
      };
    },
    async runProtectedRequirement(input) {
      protectedSubjects.push(`${input.subject.kind}:${input.requirement.category}`);
      const aggregate = {
        category: input.requirement.category,
        total: input.requirement.minimum_case_count,
        passed: input.requirement.minimum_case_count,
        failed: 0,
        score: 1,
      };
      return {
        aggregate,
        receipt_ref: `opl://foundry/protected-requirement-receipts/${input.subject.kind}/${encodeURIComponent(input.requirement.category)}`,
        aggregate_digest: foundryContentDigest(aggregate),
      };
    },
    async observeResourceObservations() {
      return {
        candidate_cost_observations: { usd: 0 },
        candidate_latency_observations: { milliseconds: 0 },
        safety_observations: [],
        safety_delta: { incidents: 0 },
        cost_delta: { usd: 0 },
        latency_delta: { milliseconds: 0 },
      };
    },
  };
  const reviewer: IndependentEvaluationReviewer = {
    reviewer_id: 'reviewer:evaluation-runtime',
    async review(input) {
      reviewedProtectedAggregate = input.protected_aggregates;
      return {
        execution_ref: 'review-execution:independent-review',
        verdict: 'pass',
        findings: [],
        evidence_refs: ['evidence:independent-review'],
      };
    },
  };
  const runtime = new FrozenPlanEvaluationRuntime({
    evaluator_id: 'evaluator:evaluation-runtime',
    executor,
    reviewer,
    now: () => '2026-07-16T00:00:00.000Z',
  });

  assert.deepEqual(runtime.qualification_capability, {
    status: 'qualification_grade',
    execution_mode: 'frozen_plan_evaluation_runtime.v1',
    protected_fact_authority: 'framework_owned_case_executor',
  });
  assert.equal(isQualificationGradeEvaluationRuntime(runtime), true);
  assert.equal(isQualificationGradeEvaluationRuntime({
    evaluator_id: runtime.evaluator_id,
    qualification_capability: runtime.qualification_capability,
    evaluate: (input) => runtime.evaluate(input),
    canary: (input) => runtime.canary(input),
  }), false);

  const result = await runtime.evaluate({
    run_id: 'run:evaluation-runtime',
    request: designRequest,
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
    candidate,
    baseline_version: baseline,
  });

  assert.deepEqual(publicSubjects, ['candidate:case:required', 'baseline:case:required']);
  assert.deepEqual(protectedSubjects, [
    'candidate:privacy:no-sensitive-data',
    'baseline:privacy:no-sensitive-data',
  ]);
  assert.deepEqual(reviewedProtectedAggregate, result.protected_aggregates);
  assert.equal(result.independent_review.evaluator_ref, reviewer.reviewer_id);
  assert.equal(result.provenance.producer_id, runtime.evaluator_id);
  assert.equal(result.baseline_version_digest, baseline.version_digest);
  assert.equal(result.baseline_public_results?.[0]?.score, 0.8);
  assert.equal(result.baseline_protected_aggregates?.[0]?.score, 1);
  assert.equal(result.frozen_test_plan_digest, foundryFrozenEvaluationPlanDigest(agentBlueprint.eval_spec));
  assert.equal(result.qualified, true);
  assert.ok(result.provenance.source_refs.includes(
    'opl://foundry/protected-requirement-receipts/candidate/privacy%3Ano-sensitive-data',
  ));
  assert.ok(result.provenance.source_refs.includes(
    'opl://foundry/protected-requirement-receipts/baseline/privacy%3Ano-sensitive-data',
  ));

  const tamperedRuntime = new FrozenPlanEvaluationRuntime({
    evaluator_id: 'evaluator:tampered-protected-receipt',
    executor: {
      ...executor,
      runProtectedRequirement: async (input) => ({
        ...await executor.runProtectedRequirement(input),
        aggregate_digest: `sha256:${'f'.repeat(64)}`,
      }),
    },
    reviewer,
  });
  await assert.rejects(() => tamperedRuntime.evaluate({
    run_id: 'run:tampered-protected-receipt',
    request: designRequest,
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
    candidate,
    baseline_version: baseline,
  }), /direct receipt ref and exact digest/);
});

test('baseline comparison rejects per-category protected regressions and incomplete baseline aggregates', () => {
  const designRequest = request({
    request_id: 'request:protected-baseline-regression',
    mode: 'takeover',
    target_version_ref: `sha256:${'1'.repeat(64)}`,
  });
  const spec = blueprint(designRequest, 0, 'prompt:protected-baseline-regression').eval_spec;
  const common = {
    request: designRequest,
    spec,
    public_results: [{
      case_id: 'case:required',
      status: 'pass' as const,
      score: 1,
      evidence_refs: ['evidence:candidate-public'],
    }],
    baseline_public_results: [{
      case_id: 'case:required',
      status: 'pass' as const,
      score: 1,
      evidence_refs: ['evidence:baseline-public'],
    }],
    independent_review_verdict: 'pass' as const,
    baseline_present: true,
    candidate_cost_observations: { usd: 0 },
    candidate_latency_observations: { milliseconds: 0 },
    safety_observations: [],
  };
  const regressed = recomputeEvaluationQualification({
    ...common,
    protected_aggregates: [{
      category: 'privacy:no-sensitive-data',
      total: 2,
      passed: 1,
      failed: 1,
      score: 0.5,
    }],
    baseline_protected_aggregates: [{
      category: 'privacy:no-sensitive-data',
      total: 2,
      passed: 2,
      failed: 0,
      score: 1,
    }],
  });
  assert.equal(regressed.baselinePublicPassed, true);
  assert.equal(regressed.baselineProtectedPassed, false);
  assert.equal(regressed.baselinePassed, false);
  assert.equal(regressed.qualified, false);

  assert.throws(() => recomputeEvaluationQualification({
    ...common,
    protected_aggregates: [{
      category: 'privacy:no-sensitive-data', total: 1, passed: 1, failed: 0, score: 1,
    }],
    baseline_protected_aggregates: null,
  }), /must exist exactly when an exact baseline version is bound/);
  assert.throws(() => recomputeEvaluationQualification({
    ...common,
    protected_aggregates: [{
      category: 'privacy:no-sensitive-data', total: 1, passed: 1, failed: 0, score: 1,
    }],
    baseline_protected_aggregates: [],
  }), /exactly one aggregate for every frozen requirement/);
});

test('frozen evaluation plan digest binds public cases and all qualification policy', () => {
  const spec = blueprint(request(), 0, 'prompt:frozen-plan').eval_spec;
  const changedPublicCase = structuredClone(spec);
  changedPublicCase.public_cases[0]!.test_ref = 'test:changed-public-case';
  const changedProtectedRequirement = structuredClone(spec);
  changedProtectedRequirement.protected_requirements[0]!.minimum_case_count += 1;

  assert.notEqual(
    foundryFrozenEvaluationPlanDigest(spec),
    foundryFrozenEvaluationPlanDigest(changedPublicCase),
  );
  assert.notEqual(
    foundryFrozenEvaluationPlanDigest(spec),
    foundryFrozenEvaluationPlanDigest(changedProtectedRequirement),
  );
});

test('Evaluation Runtime requires pairwise-independent evaluator, executor, and reviewer identities', () => {
  const executor: EvaluationCaseExecutor = {
    executor_id: 'identity:shared',
    executionRef: () => 'execution:shared',
    runPublicCase: async () => ({ case_id: 'case', status: 'pass', score: 1, evidence_refs: ['evidence:case'] }),
    runProtectedRequirement: async () => {
      const aggregate = { category: 'protected', total: 1, passed: 1, failed: 0, score: 1 };
      return {
        aggregate,
        receipt_ref: 'opl://foundry/protected-requirement-receipts/identity',
        aggregate_digest: foundryContentDigest(aggregate),
      };
    },
    observeResourceObservations: async () => ({
      candidate_cost_observations: {},
      candidate_latency_observations: {},
      safety_observations: [],
      safety_delta: {},
      cost_delta: {},
      latency_delta: {},
    }),
  };
  const reviewer: IndependentEvaluationReviewer = {
    reviewer_id: 'identity:shared',
    review: async () => ({
      execution_ref: 'review:shared',
      verdict: 'pass',
      findings: [],
      evidence_refs: ['evidence:review'],
    }),
  };
  assert.throws(() => new FrozenPlanEvaluationRuntime({
    evaluator_id: 'identity:evaluator',
    executor,
    reviewer,
  }), /distinct identities/);
});

test('the four Foundry protocol objects match canonical closed JSON Schemas', async () => {
  const designRequest = request();
  const agentBlueprint = blueprint(designRequest, 0, 'prompt:v1');
  const compiler = new DeterministicInMemoryCandidateCompiler();
  const candidate = await compiler.materialize({
    run_id: 'run:schema',
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
  });
  const evidenceBundle = evidence({
    runId: 'run:schema',
    designRequest,
    agentBlueprint,
    candidate,
    baselineDigest: null,
    qualified: false,
  });
  const evolutionProposal = await new FixtureDesigner().diagnose({
    request: designRequest,
    blueprint: agentBlueprint,
    evidence: evidenceBundle,
    activity: {
      run_id: 'run:schema',
      iteration: 0,
      phase: 'diagnose',
      input_digest: foundryContentDigest({
        blueprint_digest: foundryContentDigest(agentBlueprint),
        evidence_digest: foundryContentDigest(evidenceBundle),
      }),
    },
  });
  for (const [schemaRef, payload] of [
    ['contracts/opl-framework/foundry-design-request.schema.json', designRequest],
    ['contracts/opl-framework/foundry-agent-blueprint.schema.json', agentBlueprint],
    ['contracts/opl-framework/foundry-evidence-bundle.schema.json', evidenceBundle],
    ['contracts/opl-framework/foundry-evolution-proposal.schema.json', evolutionProposal],
  ] as const) {
    assert.equal(assertRepoJsonSchemaPayload({
      repoRoot: process.cwd(),
      schemaRef,
      payload,
      label: schemaRef,
    }).status, 'valid');
  }
  assert.throws(
    () => assertFoundryProtocolPurity({ ...designRequest, work_order: 'work-order:forbidden' }, 'DesignRequest'),
    /semantic protocol boundary/,
  );
  assert.throws(
    () => assertFoundryProtocolPurity({ reviewAttemptRef: 'review:forbidden' }, 'EvidenceBundle'),
    /semantic protocol boundary/,
  );
  assert.throws(
    () => assertFoundryProtocolPurity({ review_execution_ref: 'attempt:forbidden' }, 'EvidenceBundle'),
    /semantic protocol boundary/,
  );
  assert.throws(
    () => assertFoundryProtocolPurity({ protected_test_body: 'secret case body' }, 'EvidenceBundle'),
    /semantic protocol boundary/,
  );
});

test('the runtime Foundry validators enforce the same closed nested protocol boundary', async () => {
  const designRequest = request();
  assert.throws(
    () => validateDesignRequest({ ...designRequest, undeclared_field: true }),
    /closed protocol shape/,
  );
  assert.throws(
    () => validateDesignRequest({
      ...designRequest,
      constraints: { ...designRequest.constraints, cost_limits: { usd: Number.NaN } },
    }),
    /finite number/,
  );

  const agentBlueprint = blueprint(designRequest, 0, 'prompt:v1');
  const missingGoal = { ...agentBlueprint.stage_graph.stages[0] } as Record<string, unknown>;
  delete missingGoal.goal;
  assert.throws(
    () => validateAgentBlueprint({
      ...agentBlueprint,
      stage_graph: { ...agentBlueprint.stage_graph, stages: [missingGoal] },
    }),
    /closed protocol shape/,
  );
  assert.throws(
    () => validateAgentBlueprint({
      ...agentBlueprint,
      stage_graph: {
        ...agentBlueprint.stage_graph,
        stages: [{ ...agentBlueprint.stage_graph.stages[0], next_stage_ids: ['unknown-stage'] }],
      },
    }),
    /unknown next Stage/,
  );
  const symbolicActionSchema = structuredClone(agentBlueprint);
  symbolicActionSchema.actions[0]!.input_schema_ref = 'opl://schema/symbolic-input';
  assert.throws(
    () => validateAgentBlueprint(symbolicActionSchema),
    /not declared in content_refs.schema_refs/,
  );
  const undeclaredArtifactSchema = structuredClone(agentBlueprint);
  undeclaredArtifactSchema.artifact_contracts[0]!.schema_ref = `opl-content://sha256/${'c'.repeat(64)}`;
  assert.throws(
    () => validateAgentBlueprint(undeclaredArtifactSchema),
    /artifact_contracts\[0\].schema_ref is not declared/,
  );

  const candidate = await new DeterministicInMemoryCandidateCompiler().materialize({
    run_id: 'run:runtime-validator',
    blueprint: agentBlueprint,
    blueprint_digest: foundryContentDigest(agentBlueprint),
  });
  const evidenceBundle = evidence({
    runId: 'run:runtime-validator',
    designRequest,
    agentBlueprint,
    candidate,
    baselineDigest: null,
    qualified: false,
  });
  assert.throws(
    () => validateEvidenceBundle({ ...evidenceBundle, safety_delta: { score: 'not-a-number' } }),
    /finite number/,
  );
  assert.throws(
    () => validateEvidenceBundle({ ...evidenceBundle, baseline_protected_aggregates: [] }),
    /must be present or null together/,
  );

  const proposal = await new FixtureDesigner().diagnose({
    request: designRequest,
    blueprint: agentBlueprint,
    evidence: evidenceBundle,
    activity: {
      run_id: 'run:runtime-validator',
      iteration: 0,
      phase: 'diagnose',
      input_digest: foundryContentDigest({
        blueprint_digest: foundryContentDigest(agentBlueprint),
        evidence_digest: foundryContentDigest(evidenceBundle),
      }),
    },
  });
  const missingRationale = { ...proposal.semantic_diff[0] } as Record<string, unknown>;
  delete missingRationale.rationale;
  assert.throws(
    () => validateEvolutionProposal({ ...proposal, semantic_diff: [missingRationale] }),
    /closed protocol shape/,
  );
});

test('file-backed Foundry truth survives restart and rebuilds its SQLite projection', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-persistent-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const content = new FileFoundryContentStore(root);
  const promptV1 = content.put(Buffer.from('fixture prompt v1\n'));
  const promptV2 = content.put(Buffer.from('fixture prompt v2\n'));
  const skill = content.put(Buffer.from('fixture skill\n'));
  const knowledge = content.put(Buffer.from('fixture knowledge\n'));
  const model = content.put(Buffer.from('fixture model lock\n'));
  const inputSchema = content.put(Buffer.from('{"type":"object","title":"fixture input"}\n'));
  const outputSchema = content.put(Buffer.from('{"type":"object","title":"fixture output"}\n'));
  const bindResources = (value: AgentBlueprint, promptRef: string) => {
    value.stage_graph.stages[0]!.prompt_ref = promptRef;
    value.stage_graph.stages[0]!.skill_refs = [skill.ref];
    value.stage_graph.stages[0]!.knowledge_refs = [knowledge.ref];
    value.content_refs.prompt_refs = [promptRef];
    value.content_refs.skill_refs = [skill.ref];
    value.content_refs.knowledge_refs = [knowledge.ref];
    value.content_refs.model_refs = [model.ref];
    value.actions[0]!.input_schema_ref = inputSchema.ref;
    value.actions[0]!.output_schema_ref = outputSchema.ref;
    value.artifact_contracts[0]!.schema_ref = outputSchema.ref;
    value.content_refs.schema_refs = [inputSchema.ref, outputSchema.ref];
    return value;
  };
  const semanticDesigner = new FixtureDesigner();
  const persistentDesigner: DesignerPort = {
    producer_id: 'designer:persistent-fixture',
    async design(designRequest) {
      return bindResources(await semanticDesigner.design(designRequest), promptV1.ref);
    },
    async diagnose(input) {
      const proposal = await semanticDesigner.diagnose(input);
      proposal.next_blueprint = bindResources(proposal.next_blueprint, promptV2.ref);
      return proposal;
    },
  };
  const persistentEvaluator: EvaluationExecutor = {
    evaluator_id: 'evaluator:fixture',
    async evaluate(input) {
      return evidence({
        runId: input.run_id,
        designRequest: input.request,
        agentBlueprint: input.blueprint,
        candidate: input.candidate,
        baselineDigest: input.baseline_version?.version_digest ?? null,
        qualified: input.blueprint.generation > 0,
      });
    },
    async canary(input) {
      return evidence({
        runId: input.run_id,
        designRequest: input.request,
        agentBlueprint: input.blueprint,
        candidate: input.candidate,
        baselineDigest: input.baseline_version?.version_digest ?? null,
        qualified: true,
      });
    },
  };
  const buildKernel = (options: {
    events?: FoundryEventStore;
    now?: string;
    propagateTransientActivityFailures?: boolean;
  } = {}) => {
    const versions = new LedgerVersionRegistry(root);
    return new FoundryKernel({
      designer: persistentDesigner,
      evaluator: persistentEvaluator,
      compiler: new ContentAddressedCandidateCompiler(root),
      objects: new FileFoundryObjectStore(root),
      events: options.events ?? new LedgerFoundryEventStore(root),
      versions,
      activationRuntime: new InMemoryActivationRuntime(versions),
      ownerGate,
      clock: { now: () => options.now ?? '2026-07-16T00:00:00.000Z' },
      propagateTransientActivityFailures: options.propagateTransientActivityFailures,
    });
  };

  const firstKernel = buildKernel();
  const completed = await activateCreateRun(
    firstKernel,
    'run:persistent',
    request(),
    () => new LedgerFoundryEventStore(root).read('run:persistent'),
  );
  assert.equal(completed.run.state, 'completed_active');
  const [version] = await firstKernel.listVersions('fixture-agent', 'fixture-domain');
  assert.ok(version);

  const compiler = new ContentAddressedCandidateCompiler(root);
  const candidateDirectory = compiler.candidateDirectory(version!.candidate_digest);
  const before = fs.readFileSync(path.join(candidateDirectory, 'agent-blueprint.json'));

  const restartedKernel = buildKernel();
  const restarted = await restartedKernel.inspectRun('run:persistent');
  assert.equal(restarted.run.last_event_hash, completed.run.last_event_hash);
  assert.equal(restarted.activation.active_version_digest, version!.version_digest);
  assert.deepEqual(
    await restartedKernel.listVersions('fixture-agent', 'fixture-domain'),
    [version],
  );

  const eventStore = new LedgerFoundryEventStore(root);
  fs.rmSync(path.join(root, 'state-index.sqlite'), { force: true });
  eventStore.rebuildStateIndex();
  assert.equal((await eventStore.list())[0]!.state, 'completed_active');

  const improveRequest = request({
    request_id: 'request:persistent-improve',
    mode: 'improve',
    target_version_ref: version!.version_digest,
  });
  await restartedKernel.startRun({ request: improveRequest, run_id: 'run:persistent-improve' });
  const activeAfterImprove = await restartedKernel.advanceUntilPause('run:persistent-improve');
  assert.equal(activeAfterImprove.run.state, 'completed_active');
  assert.notEqual(activeAfterImprove.activation.active_version_digest, version!.version_digest);

  const rollback = await restartedKernel.rollbackActivation({
    target_agent_id: 'fixture-agent',
    target_domain_id: 'fixture-domain',
    version_digest: version!.version_digest,
    expected_revision: 2,
    authority_receipt_ref: authorizeRollback({
      target_agent_id: 'fixture-agent',
      target_domain_id: 'fixture-domain',
      version_digest: version!.version_digest,
      expected_revision: 2,
    }),
  });
  assert.equal(rollback.to_version_digest, version!.version_digest);
  assert.deepEqual(fs.readFileSync(path.join(candidateDirectory, 'agent-blueprint.json')), before);

  const durableCrashEvents = new LedgerFoundryEventStore(root);
  let failActivationAppend = true;
  const crashEvents: FoundryEventStore = {
    create: (input) => durableCrashEvents.create(input),
    read: (runId) => durableCrashEvents.read(runId),
    list: () => durableCrashEvents.list(),
    append: async (input) => {
      if (failActivationAppend && input.event.event_type === 'activation_completed') {
        failActivationAppend = false;
        throw new FoundryTransientActivityError('injected activation event append outage');
      }
      return durableCrashEvents.append(input);
    },
  };
  const crashRequest = request({
    request_id: 'request:activation-event-recovery',
    target_agent_id: 'activation-event-recovery-agent',
    target_domain_id: 'activation_event_recovery',
  });
  ownerGate.registerAuthorityPolicy({
    policy_ref: 'opl://foundry/authority-policies/activation-event-recovery-agent',
    target_agent_id: crashRequest.target_agent_id,
    target_domain_id: crashRequest.target_domain_id,
    authority_refs: ['owner-gate:activation'],
  });
  const crashKernel = buildKernel({
    events: crashEvents,
    now: '2026-07-16T00:05:00.000Z',
    propagateTransientActivityFailures: true,
  });
  await crashKernel.startRun({ request: crashRequest, run_id: 'run:activation-event-recovery' });
  let crashGate = await crashKernel.advanceUntilPause('run:activation-event-recovery');
  crashGate = await crashKernel.submitOwnerDecision({
    run_id: crashGate.run.run_id,
    expected_revision: crashGate.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection: crashGate,
      action: 'approve_canary',
      decision: 'approve',
    }),
  });
  const activating = await crashKernel.submitOwnerDecision({
    run_id: crashGate.run.run_id,
    expected_revision: crashGate.run.revision,
    decision: 'approve',
    authority_receipt_ref: authorizeRunMutation({
      inspection: crashGate,
      action: 'approve_active',
      decision: 'approve',
    }),
  }, { advance: false });
  assert.equal(activating.run.state, 'activating');
  await assert.rejects(
    crashKernel.advanceRunStep(activating.run.run_id),
    /injected activation event append outage/,
  );
  assert.equal((await crashKernel.inspectRun(activating.run.run_id)).run.state, 'activating');
  assert.equal((await new LedgerVersionRegistry(root).activation(
    crashRequest.target_agent_id,
    crashRequest.target_domain_id,
  )).revision, 1);
  const [durableActivation] = await new LedgerVersionRegistry(root).activationHistory(
    crashRequest.target_agent_id,
    crashRequest.target_domain_id,
  );
  assert.equal(durableActivation?.runtime_binding_verification.verification_phase, 'pre_commit');
  assert.equal(
    durableActivation?.runtime_binding_verification.version_digest,
    durableActivation?.to_version_digest,
  );

  const recoveredKernel = buildKernel({ now: '2026-07-16T00:06:00.000Z' });
  const recovered = await recoveredKernel.advanceRunStep(activating.run.run_id);
  assert.equal(recovered.run.state, 'completed_active');
  assert.equal(recovered.activation.revision, 1);
  const recoveredEvent = (await durableCrashEvents.read(activating.run.run_id)).at(-1)!;
  assert.deepEqual(
    recoveredEvent.payload.activation_runtime_binding_verification,
    durableActivation?.runtime_binding_verification,
  );
});

test('file-backed Foundry store keeps the one-writer target lock across process objects', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-lock-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dependencies = () => ({
    designer: new FixtureDesigner(),
    evaluator: new FixtureEvaluator(),
    compiler: new ContentAddressedCandidateCompiler(root),
    objects: new FileFoundryObjectStore(root),
    events: new LedgerFoundryEventStore(root),
    versions: new LedgerVersionRegistry(root),
  });
  const first = new FoundryKernel(dependencies());
  const second = new FoundryKernel(dependencies());
  await first.startRun({ request: request(), run_id: 'run:file-lock-one' });
  await assert.rejects(
    second.startRun({
      request: request({ request_id: 'request:file-lock-two' }),
      run_id: 'run:file-lock-two',
    }),
    /active write FoundryRun/,
  );
});

test('CandidateCompiler hydrates content-addressed Agent Pack bytes deterministically and rejects forbidden writes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-agent-pack-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const content = new FileFoundryContentStore(root);
  const prompt = content.put(Buffer.from('Deliver the accepted result.\n', 'utf8'));
  const skill = content.put(Buffer.from('# Fixture Skill\n', 'utf8'));
  const knowledge = content.put(Buffer.from('# Fixture Knowledge\n', 'utf8'));
  const model = content.put(Buffer.from('fixture model lock\n', 'utf8'));
  const inputSchema = content.put(Buffer.from('{"type":"object","title":"fixture input"}\n', 'utf8'));
  const outputSchema = content.put(Buffer.from('{"type":"object","title":"fixture output"}\n', 'utf8'));
  const designRequest = request({ request_id: 'request:content-pack' });
  const agentBlueprint = blueprint(designRequest, 0, prompt.ref);
  agentBlueprint.stage_graph.stages[0]!.skill_refs = [skill.ref];
  agentBlueprint.stage_graph.stages[0]!.knowledge_refs = [knowledge.ref];
  agentBlueprint.content_refs.skill_refs = [skill.ref];
  agentBlueprint.content_refs.knowledge_refs = [knowledge.ref];
  agentBlueprint.content_refs.model_refs = [model.ref];
  agentBlueprint.actions[0]!.input_schema_ref = inputSchema.ref;
  agentBlueprint.actions[0]!.output_schema_ref = outputSchema.ref;
  agentBlueprint.artifact_contracts[0]!.schema_ref = outputSchema.ref;
  agentBlueprint.content_refs.schema_refs = [inputSchema.ref, outputSchema.ref];
  const blueprintDigest = foundryContentDigest(agentBlueprint);
  const compiler = new ContentAddressedCandidateCompiler(root);

  const first = await compiler.materialize({
    run_id: 'run:content-pack',
    blueprint: agentBlueprint,
    blueprint_digest: blueprintDigest,
  });
  const second = await compiler.materialize({
    run_id: 'run:content-pack-replay',
    blueprint: structuredClone(agentBlueprint),
    blueprint_digest: blueprintDigest,
  });
  assert.deepEqual(second, first);
  const directory = compiler.candidateDirectory(first.candidate_digest);
  const pack = JSON.parse(fs.readFileSync(path.join(directory, 'agent/agent-pack.json'), 'utf8'));
  assert.equal(pack.conformance.status, 'valid');
  assert.equal(pack.content_bindings.length, 6);
  assert.equal(pack.content_bindings.every((entry: { declared_ref: string; immutable_ref: string }) =>
    entry.declared_ref === entry.immutable_ref), true);
  assert.equal(fs.readFileSync(path.join(directory, `content/prompt/${prompt.digest.slice(7)}.blob`), 'utf8'), 'Deliver the accepted result.\n');

  fs.writeFileSync(path.join(directory, 'forbidden-owner-write.txt'), 'mutation');
  await assert.rejects(
    compiler.materialize({
      run_id: 'run:content-pack-forbidden-write',
      blueprint: agentBlueprint,
      blueprint_digest: blueprintDigest,
    }),
    /forbidden writes/,
  );
});

test('CandidateCompiler rejects candidate-root and hydrated-content symlink escapes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-agent-pack-symlink-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-agent-pack-outside-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
  fs.symlinkSync(outside, path.join(root, 'candidates'));
  assert.throws(() => new ContentAddressedCandidateCompiler(root), /candidate root must be a physical directory/);
  fs.rmSync(path.join(root, 'candidates'));

  const content = new FileFoundryContentStore(root);
  const stored = content.put(Buffer.from('immutable prompt\n', 'utf8'));
  const blob = path.join(root, 'content', `${stored.digest.slice(7)}.blob`);
  const outsideFile = path.join(outside, 'prompt.txt');
  fs.writeFileSync(outsideFile, 'immutable prompt\n');
  fs.rmSync(blob);
  fs.symlinkSync(outsideFile, blob);
  const designRequest = request({ request_id: 'request:symlink-content' });
  const agentBlueprint = blueprint(designRequest, 0, stored.ref);
  const compiler = new ContentAddressedCandidateCompiler(root);
  await assert.rejects(
    compiler.materialize({
      run_id: 'run:symlink-content',
      blueprint: agentBlueprint,
      blueprint_digest: foundryContentDigest(agentBlueprint),
    }),
    /content ref resolves outside/,
  );
});

test('Foundry designer ports are producer-neutral across function and manifest adapters', async (t) => {
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-provider-'));
  t.after(() => fs.rmSync(checkout, { recursive: true, force: true }));
  fs.mkdirSync(path.join(checkout, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(checkout, 'contracts', 'foundry_provider.json'), JSON.stringify({
    surface_kind: 'opl_foundry_provider',
    version: 'opl-foundry-provider.v1',
    provider_id: 'fixture-designer',
    agent_id: 'fixture-designer',
    package_id: 'fixture-designer',
    domain_id: 'agent_engineering',
    carrier_slug: 'fixture-designer',
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
  }), 'utf8');
  const designRequest = request();
  const fixture = new FixtureDesigner();
  const designActivity = {
    run_id: 'run:adapter',
    iteration: 0,
    phase: 'design' as const,
    input_digest: foundryContentDigest(designRequest),
  };
  const functionAdapter = new FunctionFoundryDesignerAdapter({
    producer_id: 'function:fixture',
    design: (input) => fixture.design(input),
    diagnose: (input) => fixture.diagnose(input),
  });
  const manifestAdapter = new ManifestFoundryDesignerAdapter({
    checkout_root: checkout,
    invoker: {
      invoke: async (input) => input.operation === 'design'
        ? fixture.design(input.payload.request)
        : fixture.diagnose({
            request: input.payload.request,
            blueprint: input.payload.blueprint!,
            evidence: input.payload.evidence!,
            activity: input.activity,
          }),
    },
  });
  assert.deepEqual(
    await manifestAdapter.design(designRequest, designActivity),
    await functionAdapter.design(designRequest, designActivity),
  );
  assert.equal(manifestAdapter.producer_id, 'foundry-provider:fixture-designer');
});

test('production Foundry resolves a configurable semantic provider and keeps OMA as the default', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opl-foundry-production-provider-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const checkout = path.join(root, 'provider-checkout');
  fs.mkdirSync(path.join(checkout, 'contracts'), { recursive: true });
  fs.writeFileSync(path.join(checkout, 'contracts', 'foundry_provider.json'), JSON.stringify({
    surface_kind: 'opl_foundry_provider',
    version: 'opl-foundry-provider.v1',
    provider_id: 'provider-fixture',
    agent_id: 'provider-fixture',
    package_id: 'provider-fixture',
    domain_id: 'agent_engineering',
    carrier_slug: 'provider-fixture',
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
  }));
  const observedProviderIds: string[] = [];
  const resolveManagedCheckout: typeof resolveStandardAgentManagedCheckout = async (input) => {
    observedProviderIds.push(input.domainId);
    return {
      checkout_root: checkout,
    } as Awaited<ReturnType<typeof resolveStandardAgentManagedCheckout>>;
  };

  await createProductionFoundryKernel({
    root_override: path.join(root, 'custom-provider-state'),
    semantic_provider_agent_id: 'provider-fixture',
    resolve_managed_checkout: resolveManagedCheckout,
  });
  await createProductionFoundryKernel({
    root_override: path.join(root, 'default-provider-state'),
    resolve_managed_checkout: resolveManagedCheckout,
  });

  assert.deepEqual(observedProviderIds, ['provider-fixture', 'oma']);
});

test('production Foundry rejects structurally spoofed qualification evaluators before provider resolution', async () => {
  let providerResolutionAttempted = false;
  const spoofedRuntime: EvaluationExecutor = {
    evaluator_id: 'evaluator:spoofed-runtime',
    qualification_capability: {
      status: 'qualification_grade',
      execution_mode: 'frozen_plan_evaluation_runtime.v1',
      protected_fact_authority: 'framework_owned_case_executor',
    },
    evaluate: async () => { throw new Error('unreachable'); },
    canary: async () => { throw new Error('unreachable'); },
  };

  await assert.rejects(() => createProductionFoundryKernel({
    trusted_evaluation_runtime: spoofedRuntime,
    resolve_managed_checkout: async () => {
      providerResolutionAttempted = true;
      throw new Error('unreachable');
    },
  }), /Framework-owned FrozenPlan Evaluation Runtime/);
  assert.equal(providerResolutionAttempted, false);
});

test('the exact OMA checkout exposes the canonical producer manifest', {
  skip: process.env.OPL_OMA_CHECKOUT ? false : 'set OPL_OMA_CHECKOUT for the cross-repo lane',
}, () => {
  const manifest = readFoundryProviderManifest(process.env.OPL_OMA_CHECKOUT!);
  const actionCatalog = JSON.parse(fs.readFileSync(
    path.join(process.env.OPL_OMA_CHECKOUT!, 'contracts/action_catalog.json'),
    'utf8',
  ));
  assert.equal(assertRepoJsonSchemaPayload({
    repoRoot: process.cwd(),
    schemaRef: 'contracts/family-orchestration/family-action-catalog.schema.json',
    payload: actionCatalog,
    label: 'OMA Foundry action catalog',
  }).status, 'valid');
  assert.equal(manifest.provider_id, 'oma');
  assert.equal(manifest.domain_id, 'agent_engineering');
  assert.deepEqual(Object.keys(manifest.operations).sort(), ['design', 'diagnose']);
  const compiled = compileStandardAgentStageManifest(process.env.OPL_OMA_CHECKOUT!);
  assert.equal(compiled.source_binding.canonical_agent_id, 'oma');
  assert.equal(compiled.source_binding.domain_id, 'agent_engineering');
  assert.deepEqual(actionCatalog.actions.map((action: { action_id: string }) => action.action_id), ['engineer-agent']);
  assert.equal(
    compiled.stage_control_plane.stages.every((stage) => stage.trust_boundary?.owner_receipt_required === false),
    true,
  );
});

test('the four Foundry protocol fixtures from the exact OMA checkout pass OPL authority validation', {
  skip: process.env.OPL_OMA_CHECKOUT ? false : 'set OPL_OMA_CHECKOUT for the cross-repo lane',
}, () => {
  const fixtureRoot = path.join(process.env.OPL_OMA_CHECKOUT!, 'contracts/fixtures/foundry-protocol');
  const fixtures = {
    request: JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'design-request.json'), 'utf8')),
    blueprint: JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'agent-blueprint.json'), 'utf8')),
    evidence: JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'evidence-bundle.json'), 'utf8')),
    proposal: JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'evolution-proposal.json'), 'utf8')),
  };
  for (const [schemaRef, payload] of [
    ['contracts/opl-framework/foundry-design-request.schema.json', fixtures.request],
    ['contracts/opl-framework/foundry-agent-blueprint.schema.json', fixtures.blueprint],
    ['contracts/opl-framework/foundry-evidence-bundle.schema.json', fixtures.evidence],
    ['contracts/opl-framework/foundry-evolution-proposal.schema.json', fixtures.proposal],
  ] as const) {
    assert.equal(assertRepoJsonSchemaPayload({
      repoRoot: process.cwd(),
      schemaRef,
      payload,
      label: `OMA fixture ${schemaRef}`,
    }).status, 'valid');
  }
  assert.equal(fixtures.blueprint.design_request_digest, foundryContentDigest(fixtures.request));
  assert.equal(fixtures.evidence.blueprint_digest, foundryContentDigest(fixtures.blueprint));
  assert.equal(fixtures.proposal.blueprint_digest, foundryContentDigest(fixtures.blueprint));
  assert.equal(fixtures.proposal.evidence_digest, foundryContentDigest(fixtures.evidence));
  assert.notEqual(
    fixtures.evidence.independent_review.evaluation_execution_ref,
    fixtures.evidence.independent_review.review_execution_ref,
  );
  const exactRequest = validateDesignRequest(fixtures.request);
  const exactBlueprint = validateAgentBlueprint(fixtures.blueprint);
  const exactEvidence = validateEvidenceBundle(fixtures.evidence);
  validateEvolutionProposal(fixtures.proposal);
  assertBlueprintSatisfiesDesignRequest(exactRequest, exactBlueprint);
  assert.equal(
    exactEvidence.frozen_test_plan_digest,
    foundryFrozenEvaluationPlanDigest(exactBlueprint.eval_spec),
  );
  assertEvaluationEvidenceFacts({
    request: exactRequest,
    spec: exactBlueprint.eval_spec,
    evidence: exactEvidence,
    baseline_present: false,
  });
});
