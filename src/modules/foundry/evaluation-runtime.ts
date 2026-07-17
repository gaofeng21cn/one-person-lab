import crypto from 'node:crypto';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type {
  AgentVersion,
  EvaluationExecutor,
  MaterializedCandidate,
} from './ports.ts';
import type {
  AgentBlueprint,
  DesignRequest,
  EvidenceBundle,
  EvalSpec,
  EvaluationStatus,
} from './protocol.ts';

type EvaluationSubject =
  | { kind: 'candidate'; candidate: MaterializedCandidate }
  | { kind: 'baseline'; version: AgentVersion };

export type PublicCaseResult = EvidenceBundle['public_results'][number];
export type ProtectedAggregate = EvidenceBundle['protected_aggregates'][number];
export type SafetyObservation = EvidenceBundle['safety_observations'][number];
export type FailureClassification = EvidenceBundle['failure_classification'][number];

export interface ProtectedRequirementExecution {
  aggregate: ProtectedAggregate;
  receipt_ref: string;
  aggregate_digest: string;
}

export interface EvaluationCaseExecutor {
  readonly executor_id: string;
  executionRef(input: {
    run_id: string;
    generation: number;
    phase: 'evaluation' | 'canary';
  }): string;
  runPublicCase(input: {
    run_id: string;
    generation: number;
    phase: 'evaluation' | 'canary';
    subject: EvaluationSubject;
    test_case: EvalSpec['public_cases'][number];
  }): Promise<PublicCaseResult>;
  runProtectedRequirement(input: {
    run_id: string;
    generation: number;
    phase: 'evaluation' | 'canary';
    subject: EvaluationSubject;
    requirement: EvalSpec['protected_requirements'][number];
  }): Promise<ProtectedRequirementExecution>;
  observeResourceObservations(input: {
    run_id: string;
    generation: number;
    phase: 'evaluation' | 'canary';
    candidate: MaterializedCandidate;
    baseline_version: AgentVersion | null;
  }): Promise<{
    candidate_cost_observations: Record<string, number>;
    candidate_latency_observations: Record<string, number>;
    safety_observations: SafetyObservation[];
    safety_delta: Record<string, number>;
    cost_delta: Record<string, number>;
    latency_delta: Record<string, number>;
  }>;
}

export interface IndependentEvaluationReviewer {
  readonly reviewer_id: string;
  review(input: {
    run_id: string;
    generation: number;
    phase: 'evaluation' | 'canary';
    candidate_digest: string;
    blueprint_digest: string;
    public_results: PublicCaseResult[];
    protected_aggregates: ProtectedAggregate[];
    gate_results: Array<{ gate_id: string; passed: boolean; observed: number }>;
    request_constraints: DesignRequest['constraints'];
    candidate_cost_observations: Record<string, number>;
    candidate_latency_observations: Record<string, number>;
    safety_observations: SafetyObservation[];
    safety_delta: Record<string, number>;
    cost_delta: Record<string, number>;
    latency_delta: Record<string, number>;
    resource_constraint_results: Array<{
      constraint_kind: 'cost' | 'latency';
      metric: string;
      limit: number;
      observed: number;
      passed: boolean;
    }>;
  }): Promise<{
    execution_ref: string;
    verdict: EvaluationStatus;
    findings: string[];
    evidence_refs: string[];
  }>;
}

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function digest(value: unknown) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonText(value), 'utf8').digest('hex')}`;
}

function verifiedProtectedRequirementExecution(
  execution: ProtectedRequirementExecution,
  label: string,
) {
  const receiptRef = execution.receipt_ref?.trim();
  if (!receiptRef || execution.aggregate_digest !== digest(execution.aggregate)) {
    fail(`${label} must bind the protected aggregate to a direct receipt ref and exact digest.`, {
      receipt_ref: execution.receipt_ref,
      expected_aggregate_digest: digest(execution.aggregate),
      actual_aggregate_digest: execution.aggregate_digest,
    });
  }
  return {
    aggregate: execution.aggregate,
    receipt_ref: receiptRef,
  };
}

export function foundryFrozenEvaluationPlanDigest(spec: EvalSpec) {
  return digest({
    surface_kind: 'opl_foundry_frozen_evaluation_plan',
    version: 'opl-foundry-frozen-evaluation-plan.v1',
    public_cases: spec.public_cases,
    protected_requirements: spec.protected_requirements,
    gates: spec.gates,
    baseline_comparison: spec.baseline_comparison,
  });
}

function assertPublicResultSet(spec: EvalSpec, results: PublicCaseResult[], label: string) {
  if (results.length !== spec.public_cases.length) {
    fail(`${label} must contain exactly one result for every frozen public case.`);
  }
  const resultById = new Map<string, PublicCaseResult>();
  for (const result of results) {
    if (resultById.has(result.case_id) || !spec.public_cases.some((entry) => entry.case_id === result.case_id)) {
      fail(`${label} contains an unknown or duplicate public case.`, { case_id: result.case_id });
    }
    if (!['pass', 'fail', 'blocked'].includes(result.status)
      || !Number.isFinite(result.score)
      || result.score < 0
      || result.score > 1
      || !Array.isArray(result.evidence_refs)
      || result.evidence_refs.length === 0
      || result.evidence_refs.some((entry) => typeof entry !== 'string' || !entry.trim())) {
      fail(`${label} contains invalid public result facts.`, { case_id: result.case_id });
    }
    resultById.set(result.case_id, result);
  }
  return resultById;
}

function assertProtectedAggregateSet(spec: EvalSpec, aggregates: ProtectedAggregate[], label: string) {
  if (aggregates.length !== spec.protected_requirements.length) {
    fail(`${label} must contain exactly one aggregate for every frozen requirement.`);
  }
  const aggregateByCategory = new Map<string, ProtectedAggregate>();
  for (const aggregate of aggregates) {
    const requirement = spec.protected_requirements.find((entry) => entry.category === aggregate.category);
    if (!requirement || aggregateByCategory.has(aggregate.category)) {
      fail(`${label} contains an unknown or duplicate category.`, { category: aggregate.category });
    }
    if (!Number.isSafeInteger(aggregate.total)
      || !Number.isSafeInteger(aggregate.passed)
      || !Number.isSafeInteger(aggregate.failed)
      || aggregate.total < requirement.minimum_case_count
      || aggregate.passed < 0
      || aggregate.failed < 0
      || aggregate.passed + aggregate.failed !== aggregate.total
      || !Number.isFinite(aggregate.score)
      || aggregate.score < 0
      || aggregate.score > 1
      || aggregate.score !== aggregate.passed / aggregate.total) {
      fail(`${label} counts or score are inconsistent with the frozen requirement.`, {
        category: aggregate.category,
        minimum_case_count: requirement.minimum_case_count,
      });
    }
    aggregateByCategory.set(aggregate.category, aggregate);
  }
  return aggregateByCategory;
}

function weightedScore(spec: EvalSpec, resultById: Map<string, PublicCaseResult>) {
  const totalWeight = spec.public_cases.reduce((sum, entry) => sum + entry.weight, 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) fail('Frozen public cases must have positive total weight.');
  return spec.public_cases.reduce((sum, entry) => {
    const result = resultById.get(entry.case_id);
    return sum + (result?.score ?? 0) * entry.weight;
  }, 0) / totalWeight;
}

function gateObserved(metric: string, score: number, protectedAggregates: ProtectedAggregate[]) {
  if (metric === 'score') return score;
  if (metric === 'protected_pass_rate') {
    const total = protectedAggregates.reduce((sum, entry) => sum + entry.total, 0);
    const passed = protectedAggregates.reduce((sum, entry) => sum + entry.passed, 0);
    return total === 0 ? 0 : passed / total;
  }
  fail('Evaluation gate metric is not supported by the generic Evaluation Runtime.', { metric });
}

function gatePassed(gate: EvalSpec['gates'][number], observed: number) {
  if (gate.operator === 'gte') return observed >= gate.threshold;
  if (gate.operator === 'lte') return observed <= gate.threshold;
  return observed === gate.threshold;
}

function missingRefs(required: string[], declared: string[]) {
  const available = new Set(declared);
  return required.filter((entry) => !available.has(entry));
}

export function assertBlueprintSatisfiesDesignRequest(
  request: DesignRequest,
  blueprint: AgentBlueprint,
) {
  const missingCapabilities = missingRefs(
    request.constraints.capability_refs,
    blueprint.capability_requirements,
  );
  const missingPermissions = missingRefs(
    request.constraints.permission_refs,
    blueprint.authority_policy.permission_refs,
  );
  const unexpectedPermissions = missingRefs(
    blueprint.authority_policy.permission_refs,
    request.constraints.permission_refs,
  );
  const protectedCategories = blueprint.eval_spec.protected_requirements.map((entry) => entry.category);
  const missingPrivacyRequirements = missingRefs(
    request.constraints.privacy_requirements,
    protectedCategories,
  );
  if (
    missingCapabilities.length > 0
    || missingPermissions.length > 0
    || unexpectedPermissions.length > 0
    || missingPrivacyRequirements.length > 0
  ) {
    fail('AgentBlueprint violates the DesignRequest capability, permission, or privacy boundary.', {
      missing_capability_refs: missingCapabilities,
      missing_permission_refs: missingPermissions,
      unexpected_permission_refs: unexpectedPermissions,
      missing_privacy_protected_requirements: missingPrivacyRequirements,
    });
  }
}

function resourceConstraintResults(input: {
  kind: 'cost' | 'latency';
  limits: Record<string, number>;
  observations: Record<string, number>;
}) {
  const missing = Object.keys(input.limits).filter((metric) => !Object.hasOwn(input.observations, metric));
  if (missing.length > 0) {
    fail(`EvidenceBundle is missing required ${input.kind} observations.`, { missing_metrics: missing });
  }
  return Object.entries(input.limits).map(([metric, limit]) => {
    const observed = input.observations[metric]!;
    if (!Number.isFinite(limit) || !Number.isFinite(observed) || observed < 0) {
      fail(`EvidenceBundle ${input.kind} observations and DesignRequest limits must be finite.`, { metric });
    }
    return {
      constraint_kind: input.kind,
      metric,
      limit,
      observed,
      passed: observed <= limit,
    };
  });
}

export function evaluateDesignRequestResourceConstraints(input: {
  request: DesignRequest;
  candidate_cost_observations: Record<string, number>;
  candidate_latency_observations: Record<string, number>;
}) {
  const results = [
    ...resourceConstraintResults({
      kind: 'cost',
      limits: input.request.constraints.cost_limits,
      observations: input.candidate_cost_observations,
    }),
    ...resourceConstraintResults({
      kind: 'latency',
      limits: input.request.constraints.latency_limits,
      observations: input.candidate_latency_observations,
    }),
  ];
  return { results, passed: results.every((entry) => entry.passed) };
}

const SAFETY_FAILURE_CLASS = 'safety_event';

function safetyFailureClassifications(observations: SafetyObservation[]): FailureClassification[] {
  return observations
    .filter((entry) => entry.severity === 'high' || entry.severity === 'critical')
    .map((entry) => ({
      failure_class: SAFETY_FAILURE_CLASS,
      gate_id: `safety_observation:${entry.observation_id}`,
      severity: entry.severity,
      evidence_refs: [...entry.evidence_refs],
    }));
}

function sortedFailureClassifications(entries: FailureClassification[]) {
  return [...entries].sort((left, right) => canonicalJsonText(left).localeCompare(canonicalJsonText(right)));
}

function assertSafetyFailureClassifications(
  observations: SafetyObservation[],
  classifications: FailureClassification[],
) {
  const expected = sortedFailureClassifications(safetyFailureClassifications(observations));
  const actual = sortedFailureClassifications(
    classifications.filter((entry) => entry.failure_class === SAFETY_FAILURE_CLASS),
  );
  if (canonicalJsonText(actual) !== canonicalJsonText(expected)) {
    fail('EvidenceBundle safety failure classifications do not match high and critical safety observations.', {
      expected,
      actual,
    });
  }
}

export function recomputeEvaluationQualification(input: {
  request: DesignRequest;
  spec: EvalSpec;
  public_results: PublicCaseResult[];
  baseline_public_results: PublicCaseResult[] | null;
  protected_aggregates: ProtectedAggregate[];
  baseline_protected_aggregates: ProtectedAggregate[] | null;
  independent_review_verdict: EvaluationStatus;
  baseline_present: boolean;
  candidate_cost_observations: Record<string, number>;
  candidate_latency_observations: Record<string, number>;
  safety_observations: SafetyObservation[];
}) {
  const publicById = assertPublicResultSet(input.spec, input.public_results, 'EvidenceBundle.public_results');
  const protectedByCategory = assertProtectedAggregateSet(
    input.spec,
    input.protected_aggregates,
    'EvidenceBundle.protected_aggregates',
  );
  if (
    input.baseline_present !== (input.baseline_public_results !== null)
    || input.baseline_present !== (input.baseline_protected_aggregates !== null)
  ) {
    fail('Baseline public and protected results must exist exactly when an exact baseline version is bound.');
  }
  if (!input.baseline_present && input.spec.baseline_comparison.required) {
    fail('A required baseline comparison cannot run without an exact baseline version.');
  }
  const baselineById = input.baseline_public_results === null
    ? null
    : assertPublicResultSet(input.spec, input.baseline_public_results, 'EvidenceBundle.baseline_public_results');
  const baselineProtectedByCategory = input.baseline_protected_aggregates === null
    ? null
    : assertProtectedAggregateSet(
        input.spec,
        input.baseline_protected_aggregates,
        'EvidenceBundle.baseline_protected_aggregates',
      );
  const gateScore = weightedScore(input.spec, publicById);
  const baselineScore = baselineById ? weightedScore(input.spec, baselineById) : null;
  const gateResults = input.spec.gates.map((gate) => {
    const observed = gateObserved(gate.metric, gateScore, input.protected_aggregates);
    return { gate_id: gate.gate_id, passed: gatePassed(gate, observed), observed };
  });
  const requiredPublicPassed = input.spec.public_cases.every((testCase) =>
    !testCase.required || publicById.get(testCase.case_id)?.status === 'pass');
  const protectedPassed = input.spec.protected_requirements.every((requirement) => {
    const aggregate = protectedByCategory.get(requirement.category);
    return aggregate?.failed === 0 && aggregate.total >= requirement.minimum_case_count;
  });
  const requiredGatesPassed = input.spec.gates.every((gate) =>
    !gate.required || gateResults.find((entry) => entry.gate_id === gate.gate_id)?.passed === true);
  const baselinePublicPassed = !input.spec.baseline_comparison.required
    || (baselineScore !== null
      && gateScore + input.spec.baseline_comparison.regression_tolerance >= baselineScore);
  const baselineProtectedPassed = !input.spec.baseline_comparison.required
    || (baselineProtectedByCategory !== null
      && input.spec.protected_requirements.every((requirement) => {
        const candidate = protectedByCategory.get(requirement.category)!;
        const baseline = baselineProtectedByCategory.get(requirement.category)!;
        return candidate.score + input.spec.baseline_comparison.regression_tolerance >= baseline.score;
      }));
  const baselinePassed = baselinePublicPassed && baselineProtectedPassed;
  const resourceConstraints = evaluateDesignRequestResourceConstraints({
    request: input.request,
    candidate_cost_observations: input.candidate_cost_observations,
    candidate_latency_observations: input.candidate_latency_observations,
  });
  const safetyFailures = safetyFailureClassifications(input.safety_observations);
  const safetyPassed = safetyFailures.length === 0;
  return {
    gateScore,
    baselineScore,
    gateResults,
    baselinePublicPassed,
    baselineProtectedPassed,
    baselinePassed,
    resourceConstraintResults: resourceConstraints.results,
    resourceConstraintsPassed: resourceConstraints.passed,
    safetyFailureClassifications: safetyFailures,
    safetyPassed,
    qualified: requiredPublicPassed
      && protectedPassed
      && requiredGatesPassed
      && baselinePassed
      && resourceConstraints.passed
      && safetyPassed
      && input.independent_review_verdict === 'pass',
  };
}

export function assertEvaluationEvidenceFacts(input: {
  request: DesignRequest;
  spec: EvalSpec;
  evidence: EvidenceBundle;
  baseline_present: boolean;
}) {
  const facts = recomputeEvaluationQualification({
    request: input.request,
    spec: input.spec,
    public_results: input.evidence.public_results,
    baseline_public_results: input.evidence.baseline_public_results,
    protected_aggregates: input.evidence.protected_aggregates,
    baseline_protected_aggregates: input.evidence.baseline_protected_aggregates,
    independent_review_verdict: input.evidence.independent_review.verdict,
    baseline_present: input.baseline_present,
    candidate_cost_observations: input.evidence.candidate_cost_observations,
    candidate_latency_observations: input.evidence.candidate_latency_observations,
    safety_observations: input.evidence.safety_observations,
  });
  if (input.evidence.gate_score !== facts.gateScore || input.evidence.qualified !== facts.qualified) {
    fail('EvidenceBundle qualification or gate score does not match independently recomputed facts.', {
      expected_gate_score: facts.gateScore,
      actual_gate_score: input.evidence.gate_score,
      expected_qualified: facts.qualified,
      actual_qualified: input.evidence.qualified,
    });
  }
  assertSafetyFailureClassifications(
    input.evidence.safety_observations,
    input.evidence.failure_classification,
  );
  return facts;
}

const qualificationGradeEvaluationRuntimes = new WeakSet<EvaluationExecutor>();

export function isQualificationGradeEvaluationRuntime(
  evaluator: EvaluationExecutor,
): evaluator is FrozenPlanEvaluationRuntime {
  return qualificationGradeEvaluationRuntimes.has(evaluator)
    && evaluator.qualification_capability?.status === 'qualification_grade'
    && evaluator.qualification_capability.execution_mode === 'frozen_plan_evaluation_runtime.v1'
    && evaluator.qualification_capability.protected_fact_authority === 'framework_owned_case_executor';
}

export class FrozenPlanEvaluationRuntime implements EvaluationExecutor {
  readonly evaluator_id: string;
  readonly qualification_capability = {
    status: 'qualification_grade',
    execution_mode: 'frozen_plan_evaluation_runtime.v1',
    protected_fact_authority: 'framework_owned_case_executor',
  } as const;
  readonly #executor: EvaluationCaseExecutor;
  readonly #reviewer: IndependentEvaluationReviewer;
  readonly #now: () => string;

  constructor(input: {
    evaluator_id: string;
    executor: EvaluationCaseExecutor;
    reviewer: IndependentEvaluationReviewer;
    now?: () => string;
  }) {
    this.evaluator_id = input.evaluator_id;
    this.#executor = input.executor;
    this.#reviewer = input.reviewer;
    this.#now = input.now ?? (() => new Date().toISOString());
    if (!this.evaluator_id.trim() || !this.#executor.executor_id.trim() || !this.#reviewer.reviewer_id.trim()) {
      fail('Evaluator, case executor, and independent reviewer identities must not be empty.');
    }
    if (new Set([this.evaluator_id, this.#executor.executor_id, this.#reviewer.reviewer_id]).size !== 3) {
      fail('Evaluator, case executor, and independent reviewer must use distinct identities.');
    }
    qualificationGradeEvaluationRuntimes.add(this);
  }

  evaluate(input: Parameters<EvaluationExecutor['evaluate']>[0]) {
    return this.#run(input, 'evaluation');
  }

  canary(input: Parameters<EvaluationExecutor['canary']>[0]) {
    return this.#run(input, 'canary');
  }

  async #run(
    input: {
      run_id: string;
      request: DesignRequest;
      blueprint: AgentBlueprint;
      blueprint_digest: string;
      candidate: MaterializedCandidate;
      baseline_version: AgentVersion | null;
    },
    phase: 'evaluation' | 'canary',
  ): Promise<EvidenceBundle> {
    const candidateSubject: EvaluationSubject = { kind: 'candidate', candidate: input.candidate };
    const publicResults = await Promise.all(input.blueprint.eval_spec.public_cases.map((testCase) =>
      this.#executor.runPublicCase({
        run_id: input.run_id,
        generation: input.blueprint.generation,
        phase,
        subject: candidateSubject,
        test_case: testCase,
      })));
    const protectedExecutions = (await Promise.all(input.blueprint.eval_spec.protected_requirements.map((requirement) =>
      this.#executor.runProtectedRequirement({
        run_id: input.run_id,
        generation: input.blueprint.generation,
        phase,
        subject: candidateSubject,
        requirement,
      })))).map((execution) => verifiedProtectedRequirementExecution(
        execution,
        'Evaluation candidate protected requirement execution',
      ));
    const protectedAggregates = protectedExecutions.map((execution) => execution.aggregate);
    const publicById = assertPublicResultSet(input.blueprint.eval_spec, publicResults, 'Evaluation public results');
    assertProtectedAggregateSet(
      input.blueprint.eval_spec,
      protectedAggregates,
      'Evaluation candidate protected aggregates',
    );
    const score = weightedScore(input.blueprint.eval_spec, publicById);
    const gateResults = input.blueprint.eval_spec.gates.map((gate) => {
      const observed = gateObserved(gate.metric, score, protectedAggregates);
      return { gate_id: gate.gate_id, passed: gatePassed(gate, observed), observed };
    });
    let baselinePublicResults: PublicCaseResult[] | null = null;
    let baselineProtectedAggregates: ProtectedAggregate[] | null = null;
    let baselineProtectedReceiptRefs: string[] = [];
    if (input.baseline_version) {
      baselinePublicResults = await Promise.all(input.blueprint.eval_spec.public_cases.map((testCase) =>
        this.#executor.runPublicCase({
          run_id: input.run_id,
          generation: input.blueprint.generation,
          phase,
          subject: { kind: 'baseline', version: input.baseline_version! },
          test_case: testCase,
        })));
      assertPublicResultSet(input.blueprint.eval_spec, baselinePublicResults, 'Evaluation baseline public results');
      const baselineProtectedExecutions = (await Promise.all(
        input.blueprint.eval_spec.protected_requirements.map((requirement) =>
          this.#executor.runProtectedRequirement({
            run_id: input.run_id,
            generation: input.blueprint.generation,
            phase,
            subject: { kind: 'baseline', version: input.baseline_version! },
            requirement,
          })),
      )).map((execution) => verifiedProtectedRequirementExecution(
        execution,
        'Evaluation baseline protected requirement execution',
      ));
      baselineProtectedAggregates = baselineProtectedExecutions.map((execution) => execution.aggregate);
      baselineProtectedReceiptRefs = baselineProtectedExecutions.map((execution) => execution.receipt_ref);
      assertProtectedAggregateSet(
        input.blueprint.eval_spec,
        baselineProtectedAggregates,
        'Evaluation baseline protected aggregates',
      );
    }
    const resourceObservations = await this.#executor.observeResourceObservations({
      run_id: input.run_id,
      generation: input.blueprint.generation,
      phase,
      candidate: input.candidate,
      baseline_version: input.baseline_version,
    });
    const resourceFacts = evaluateDesignRequestResourceConstraints({
      request: input.request,
      candidate_cost_observations: resourceObservations.candidate_cost_observations,
      candidate_latency_observations: resourceObservations.candidate_latency_observations,
    });
    const review = await this.#reviewer.review({
      run_id: input.run_id,
      generation: input.blueprint.generation,
      phase,
      candidate_digest: input.candidate.candidate_digest,
      blueprint_digest: input.blueprint_digest,
      public_results: publicResults,
      protected_aggregates: protectedAggregates,
      gate_results: gateResults,
      request_constraints: input.request.constraints,
      candidate_cost_observations: resourceObservations.candidate_cost_observations,
      candidate_latency_observations: resourceObservations.candidate_latency_observations,
      safety_observations: resourceObservations.safety_observations,
      safety_delta: resourceObservations.safety_delta,
      cost_delta: resourceObservations.cost_delta,
      latency_delta: resourceObservations.latency_delta,
      resource_constraint_results: resourceFacts.results,
    });
    if (!review.execution_ref?.trim()
      || !['pass', 'fail', 'blocked'].includes(review.verdict)
      || !Array.isArray(review.evidence_refs)
      || review.evidence_refs.length === 0
      || review.evidence_refs.some((entry) => typeof entry !== 'string' || !entry.trim())) {
      fail('Independent evaluation review must return an execution ref and direct evidence refs.');
    }
    const evaluationExecutionRef = this.#executor.executionRef({
      run_id: input.run_id,
      generation: input.blueprint.generation,
      phase,
    }).trim();
    const reviewExecutionRef = review.execution_ref.trim();
    if (!evaluationExecutionRef || evaluationExecutionRef === reviewExecutionRef) {
      fail('Evaluation and independent review must expose different execution refs.');
    }
    const facts = recomputeEvaluationQualification({
      request: input.request,
      spec: input.blueprint.eval_spec,
      public_results: publicResults,
      baseline_public_results: baselinePublicResults,
      protected_aggregates: protectedAggregates,
      baseline_protected_aggregates: baselineProtectedAggregates,
      independent_review_verdict: review.verdict,
      baseline_present: input.baseline_version !== null,
      candidate_cost_observations: resourceObservations.candidate_cost_observations,
      candidate_latency_observations: resourceObservations.candidate_latency_observations,
      safety_observations: resourceObservations.safety_observations,
    });
    const failedGateIds = gateResults.filter((entry) => !entry.passed).map((entry) => entry.gate_id);
    const frozenPlanDigest = foundryFrozenEvaluationPlanDigest(input.blueprint.eval_spec);
    return {
      surface_kind: 'opl_foundry_evidence_bundle',
      version: 'opl-foundry-protocol.v1',
      evidence_id: `evidence:${input.run_id}:${input.blueprint.generation}:${phase}`,
      target_agent_id: input.request.target_agent_id,
      target_domain_id: input.request.target_domain_id,
      target_version_ref: input.request.target_version_ref,
      blueprint_digest: input.blueprint_digest,
      candidate_digest: input.candidate.candidate_digest,
      baseline_version_digest: input.baseline_version?.version_digest ?? null,
      frozen_test_plan_digest: frozenPlanDigest,
      public_results: publicResults,
      baseline_public_results: baselinePublicResults,
      baseline_protected_aggregates: baselineProtectedAggregates,
      protected_aggregates: protectedAggregates,
      independent_review: {
        evaluator_ref: this.#reviewer.reviewer_id,
        evaluation_execution_ref: evaluationExecutionRef,
        review_execution_ref: reviewExecutionRef,
        verdict: review.verdict,
        findings: review.findings,
        evidence_refs: review.evidence_refs,
      },
      candidate_cost_observations: resourceObservations.candidate_cost_observations,
      candidate_latency_observations: resourceObservations.candidate_latency_observations,
      safety_observations: resourceObservations.safety_observations,
      safety_delta: resourceObservations.safety_delta,
      cost_delta: resourceObservations.cost_delta,
      latency_delta: resourceObservations.latency_delta,
      failure_classification: [
        ...failedGateIds.map((gateId) => ({
          failure_class: 'quality_gate',
          gate_id: gateId,
          severity: 'high' as const,
          evidence_refs: publicResults.flatMap((entry) => entry.evidence_refs),
        })),
        ...(!facts.baselinePassed ? [{
          failure_class: 'baseline_regression',
          gate_id: 'baseline_comparison',
          severity: 'high' as const,
          evidence_refs: publicResults.flatMap((entry) => entry.evidence_refs),
        }] : []),
        ...facts.resourceConstraintResults.filter((entry) => !entry.passed).map((entry) => ({
          failure_class: `${entry.constraint_kind}_constraint_exceeded`,
          gate_id: `request_constraint:${entry.constraint_kind}:${entry.metric}`,
          severity: 'high' as const,
          evidence_refs: publicResults.flatMap((result) => result.evidence_refs),
        })),
        ...facts.safetyFailureClassifications,
      ],
      qualified: facts.qualified,
      gate_score: facts.gateScore,
      provenance: {
        foundry_run_id: input.run_id,
        generation: input.blueprint.generation,
        producer_id: this.evaluator_id,
        evaluated_at: this.#now(),
        source_refs: [
          `opl://foundry/frozen-plan/${frozenPlanDigest}`,
          evaluationExecutionRef,
          ...protectedExecutions.map((execution) => execution.receipt_ref),
          ...baselineProtectedReceiptRefs,
        ],
      },
    };
  }
}
