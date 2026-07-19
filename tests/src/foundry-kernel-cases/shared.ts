import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJsonBytes } from '../../../src/kernel/canonical-json.ts';
import { assertRepoJsonSchemaPayload } from '../../../src/kernel/repo-json-schema.ts';
import {
  DeterministicInMemoryCandidateCompiler,
  InMemoryActivationRuntime,
  InMemoryFoundryEventStore,
  InMemoryFoundryObjectStore,
  InMemoryOwnerGate,
  InMemoryVersionRegistry,
} from '../../../src/modules/foundry/in-memory-adapters.ts';
import {
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
  FileFoundryObjectStore,
  LedgerFoundryEventStore,
  LedgerVersionRegistry,
} from '../../../src/modules/ledger/foundry-persistent-adapters.ts';
import {
  FunctionFoundryDesignerAdapter,
  ManifestFoundryDesignerAdapter,
  readFoundryProviderManifest,
} from '../../../src/modules/foundry/designer-adapter.ts';
import {
  FoundryKernel,
  FoundryTransientActivityError,
} from '../../../src/modules/foundry/kernel.ts';
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
} from '../../../src/modules/foundry/evaluation-runtime.ts';
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
} from '../../../src/modules/foundry/ports.ts';
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
} from '../../../src/modules/foundry/protocol.ts';
import { verifyFoundryEventChain } from '../../../src/modules/foundry/state-machine.ts';
import { ProcessFoundryEvaluationExecutor } from '../../../src/modules/runway/foundry-process-evaluator.ts';
import { createProductionFoundryKernel } from '../../../src/modules/runway/foundry-production-runtime.ts';
import type { resolveStandardAgentManagedCheckout } from '../../../src/modules/runway/standard-agent-managed-checkout.ts';
import { compileStandardAgentStageManifest } from '../../../src/modules/pack/standard-agent-stage-manifest.ts';

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


export {
  assert,
  crypto,
  fs,
  os,
  path,
  test,
  canonicalJsonBytes,
  assertRepoJsonSchemaPayload,
  DeterministicInMemoryCandidateCompiler,
  InMemoryActivationRuntime,
  InMemoryFoundryEventStore,
  InMemoryFoundryObjectStore,
  InMemoryVersionRegistry,
  ContentAddressedCandidateCompiler,
  FileFoundryContentStore,
  FileFoundryObjectStore,
  LedgerFoundryEventStore,
  LedgerVersionRegistry,
  FunctionFoundryDesignerAdapter,
  ManifestFoundryDesignerAdapter,
  readFoundryProviderManifest,
  FoundryKernel,
  FoundryTransientActivityError,
  assertBlueprintSatisfiesDesignRequest,
  assertEvaluationEvidenceFacts,
  evaluateDesignRequestResourceConstraints,
  FrozenPlanEvaluationRuntime,
  foundryFrozenEvaluationPlanDigest,
  isQualificationGradeEvaluationRuntime,
  recomputeEvaluationQualification,
  assertFoundryProtocolPurity,
  foundryContentDigest,
  validateAgentBlueprint,
  validateDesignRequest,
  validateEvidenceBundle,
  validateEvolutionProposal,
  verifyFoundryEventChain,
  ProcessFoundryEvaluationExecutor,
  createProductionFoundryKernel,
  compileStandardAgentStageManifest,
  ownerGate,
  authorizeRunMutation,
  authorizeRollback,
  request,
  blueprint,
  FixtureDesigner,
  NoChangeDesigner,
  evidence,
  FixtureEvaluator,
  HighRiskDesigner,
  AddedEvaluationCaseDesigner,
  AddedEvaluationCaseEvaluator,
  BudgetEvaluator,
  StaleEvidenceEvaluator,
  MutatingEvidenceEvaluator,
  PassingDesigner,
  CountingCandidateCompiler,
  BaselineComparisonDesigner,
  HiddenBaselineRegressionEvaluator,
  CanaryRegressionEvaluator,
  ControlledActivationRuntime,
  harness,
  activateCreateRun,
  prepareActivatingCreateRun,
};

export type {
  EvaluationCaseExecutor,
  IndependentEvaluationReviewer,
  CandidateCompiler,
  DesignerPort,
  EvaluationExecutor,
  FoundryEventStore,
  VersionRegistry,
  AgentBlueprint,
  DesignRequest,
  EvidenceBundle,
  EvolutionProposal,
  resolveStandardAgentManagedCheckout,
};
