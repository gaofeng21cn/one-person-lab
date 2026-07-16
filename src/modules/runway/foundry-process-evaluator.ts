import { spawn } from 'node:child_process';

import { canonicalJsonBytes } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  FoundryTransientActivityError,
  recomputeEvaluationQualification,
  validateEvidenceBundle,
} from '../foundry/index.ts';
import type {
  AgentVersion,
  EvidenceBundle,
  EvaluationExecutor,
  MaterializedCandidate,
} from '../foundry/index.ts';

const DEFAULT_EVALUATION_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_EVALUATION_OUTPUT_BYTES = 8 * 1024 * 1024;

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function configuredTimeout(environmentKey: string) {
  const value = Number(process.env[environmentKey]);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_EVALUATION_TIMEOUT_MS;
}

function configuredArgs(environmentKey: string) {
  const raw = process.env[environmentKey]?.trim();
  if (!raw) return [];
  const parsed = parseJsonText(raw);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    fail(`${environmentKey} must be a JSON array of strings.`);
  }
  return parsed as string[];
}

function exactFields(value: Record<string, unknown>, expected: string[], label: string) {
  const actual = Object.keys(value).sort();
  const canonicalExpected = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonicalExpected)) {
    fail(`${label} fields are invalid.`, { actual_fields: actual, expected_fields: canonicalExpected });
  }
}

function requiredString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label} must be a non-empty string.`);
  return value.trim();
}

function stringList(value: unknown, label: string, minimumLength = 0) {
  if (!Array.isArray(value)
    || value.length < minimumLength
    || value.some((entry) => typeof entry !== 'string' || !entry.trim())
    || new Set(value).size !== value.length) {
    fail(`${label} must be a unique string list with at least ${minimumLength} entries.`);
  }
  return value as string[];
}

async function execute(input: {
  executable: string;
  args: string[];
  stdin: Buffer;
  timeoutMs: number;
}) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(input.executable, input.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      shell: false,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(Buffer.concat(stdout));
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Foundry Evaluation Runtime timed out.'));
    }, input.timeoutMs);
    child.on('error', (error) => finish(error));
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_EVALUATION_OUTPUT_BYTES) {
        child.kill('SIGKILL');
        finish(new Error('Foundry Evaluation Runtime exceeded its output limit.'));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (Buffer.concat(stderr).length < 64 * 1024) stderr.push(chunk);
    });
    child.on('close', (code, signal) => {
      if (code !== 0) {
        finish(new Error(
          `Foundry Evaluation Runtime exited ${String(code)} (${String(signal)}): ${Buffer.concat(stderr).toString('utf8').slice(-4000)}`,
        ));
        return;
      }
      finish();
    });
    child.stdin.end(input.stdin);
  });
}

export class UnconfiguredFoundryEvaluationExecutor implements EvaluationExecutor {
  readonly evaluator_id = 'opl-evaluation-runtime:unconfigured';
  readonly #reason: string;

  constructor(reason = 'Foundry Evaluation Runtime has no registered evaluator and reviewer executables.') {
    this.#reason = reason;
  }

  async evaluate(): Promise<never> {
    throw new Error(this.#reason);
  }

  async canary(): Promise<never> {
    throw new Error(this.#reason);
  }
}

const EVALUATION_OBSERVATION_FIELDS = [
  'surface_kind',
  'version',
  'evidence_id',
  'target_agent_id',
  'target_domain_id',
  'target_version_ref',
  'blueprint_digest',
  'candidate_digest',
  'baseline_version_digest',
  'frozen_test_plan_digest',
  'public_results',
  'baseline_public_results',
  'baseline_protected_aggregates',
  'protected_aggregates',
  'safety_delta',
  'cost_delta',
  'latency_delta',
  'failure_classification',
  'provenance',
] as const;

const REVIEW_RESULT_FIELDS = [
  'surface_kind',
  'version',
  'verdict',
  'findings',
  'evidence_refs',
] as const;

function evaluationExecutionRef(operationKey: string) {
  return `opl://foundry/evaluation-executions/${encodeURIComponent(operationKey)}`;
}

function reviewExecutionRef(operationKey: string) {
  return `opl://foundry/review-executions/${encodeURIComponent(operationKey)}`;
}

function provisionalEvidence(input: {
  observation: unknown;
  reviewer_id: string;
  operation_key: string;
}): EvidenceBundle {
  if (!isRecord(input.observation)) fail('Foundry evaluator must return one evaluation observation object.');
  exactFields(input.observation, [...EVALUATION_OBSERVATION_FIELDS], 'Foundry evaluation observation');
  if (
    input.observation.surface_kind !== 'opl_foundry_evaluation_observation'
    || input.observation.version !== 'opl-foundry-evaluation-observation.v1'
  ) {
    fail('Foundry evaluator returned an invalid evaluation observation surface.');
  }
  return validateEvidenceBundle({
    surface_kind: 'opl_foundry_evidence_bundle',
    version: 'opl-foundry-protocol.v1',
    evidence_id: input.observation.evidence_id,
    target_agent_id: input.observation.target_agent_id,
    target_domain_id: input.observation.target_domain_id,
    target_version_ref: input.observation.target_version_ref,
    blueprint_digest: input.observation.blueprint_digest,
    candidate_digest: input.observation.candidate_digest,
    baseline_version_digest: input.observation.baseline_version_digest,
    frozen_test_plan_digest: input.observation.frozen_test_plan_digest,
    public_results: input.observation.public_results,
    baseline_public_results: input.observation.baseline_public_results,
    baseline_protected_aggregates: input.observation.baseline_protected_aggregates,
    protected_aggregates: input.observation.protected_aggregates,
    independent_review: {
      evaluator_ref: input.reviewer_id,
      evaluation_execution_ref: evaluationExecutionRef(input.operation_key),
      review_execution_ref: reviewExecutionRef(input.operation_key),
      verdict: 'blocked',
      findings: ['Independent review is pending.'],
      evidence_refs: [`opl://foundry/review-pending/${encodeURIComponent(input.operation_key)}`],
    },
    safety_delta: input.observation.safety_delta,
    cost_delta: input.observation.cost_delta,
    latency_delta: input.observation.latency_delta,
    failure_classification: input.observation.failure_classification,
    qualified: false,
    gate_score: 0,
    provenance: input.observation.provenance,
  });
}

function independentReviewResult(value: unknown) {
  if (!isRecord(value)) fail('Independent reviewer must return one review result object.');
  exactFields(value, [...REVIEW_RESULT_FIELDS], 'Foundry independent review result');
  if (
    value.surface_kind !== 'opl_foundry_independent_review_result'
    || value.version !== 'opl-foundry-independent-review-result.v1'
    || !['pass', 'fail', 'blocked'].includes(String(value.verdict))
  ) {
    fail('Foundry independent reviewer returned an invalid review result surface or verdict.');
  }
  return {
    verdict: value.verdict as 'pass' | 'fail' | 'blocked',
    findings: stringList(value.findings, 'independent review findings'),
    evidence_refs: stringList(value.evidence_refs, 'independent review evidence_refs', 1),
  };
}

export class ProcessFoundryEvaluationExecutor implements EvaluationExecutor {
  readonly evaluator_id = 'opl-evaluation-runtime:registered-executor';
  readonly #executable: string;
  readonly #args: string[];
  readonly #reviewerExecutable: string | null;
  readonly #reviewerArgs: string[];
  readonly #reviewerId: string;
  readonly #candidateDirectory: (candidate: MaterializedCandidate) => string;
  readonly #timeoutMs: number;
  readonly #reviewerTimeoutMs: number;

  constructor(input: {
    executable: string;
    args?: string[];
    reviewer_executable?: string;
    reviewer_args?: string[];
    reviewer_id?: string;
    candidate_directory: (candidate: MaterializedCandidate) => string;
    timeout_ms?: number;
    reviewer_timeout_ms?: number;
  }) {
    this.#executable = requiredString(input.executable, 'Foundry evaluator executable');
    this.#args = input.args ?? [];
    this.#reviewerExecutable = input.reviewer_executable?.trim() || null;
    this.#reviewerArgs = input.reviewer_args ?? [];
    this.#reviewerId = requiredString(
      input.reviewer_id ?? 'opl-independent-reviewer:registered-executor',
      'Foundry independent reviewer id',
    );
    this.#candidateDirectory = input.candidate_directory;
    this.#timeoutMs = input.timeout_ms ?? configuredTimeout('OPL_FOUNDRY_EVALUATOR_TIMEOUT_MS');
    this.#reviewerTimeoutMs = input.reviewer_timeout_ms
      ?? configuredTimeout('OPL_FOUNDRY_REVIEWER_TIMEOUT_MS');
    if (this.#reviewerId === this.evaluator_id) {
      fail('Foundry evaluator and independent reviewer identities must be distinct.');
    }
  }

  async #run(
    operation: 'evaluate' | 'canary',
    input: Parameters<EvaluationExecutor['evaluate']>[0] & { version?: AgentVersion },
  ) {
    if (!this.#reviewerExecutable) {
      fail('Foundry Evaluation Runtime requires a separately configured reviewer executable.');
    }
    const operationIdentity = input.operation_identity
      ?? fail('Process-backed Foundry evaluation requires an exact durable operation identity.');
    let evaluatorOutput: Buffer;
    try {
      evaluatorOutput = await execute({
        executable: this.#executable,
        args: this.#args,
        timeoutMs: this.#timeoutMs,
        stdin: canonicalJsonBytes({
          surface_kind: 'opl_foundry_evaluation_runtime_request',
          version: 'opl-foundry-evaluation-runtime-request.v1',
          operation,
          evaluator_id: this.evaluator_id,
          operation_identity: operationIdentity,
          run_id: input.run_id,
          request: input.request,
          blueprint: input.blueprint,
          blueprint_digest: input.blueprint_digest,
          candidate: input.candidate,
          candidate_directory: this.#candidateDirectory(input.candidate),
          baseline_version: input.baseline_version,
          version_under_canary: input.version ?? null,
          protected_test_transport: {
            bodies_in_request: false,
            evaluator_resolves_target_owner_registry: true,
          },
        }),
      });
    } catch (error) {
      throw new FoundryTransientActivityError('Foundry Evaluation Runtime execution failed transiently.', {
        cause: error,
      });
    }
    let parsedObservation: unknown;
    try {
      parsedObservation = parseJsonText(evaluatorOutput.toString('utf8'));
    } catch (error) {
      fail('Foundry Evaluation Runtime returned invalid JSON.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    const evidence = provisionalEvidence({
      observation: parsedObservation,
      reviewer_id: this.#reviewerId,
      operation_key: operationIdentity.operation_key,
    });
    const provisionalFacts = recomputeEvaluationQualification({
      request: input.request,
      spec: input.blueprint.eval_spec,
      public_results: evidence.public_results,
      baseline_public_results: evidence.baseline_public_results,
      protected_aggregates: evidence.protected_aggregates,
      baseline_protected_aggregates: evidence.baseline_protected_aggregates,
      independent_review_verdict: 'pass',
      baseline_present: input.baseline_version !== null,
      cost_observations: evidence.cost_delta,
      latency_observations: evidence.latency_delta,
    });
    let reviewerOutput: Buffer;
    try {
      reviewerOutput = await execute({
        executable: this.#reviewerExecutable,
        args: this.#reviewerArgs,
        timeoutMs: this.#reviewerTimeoutMs,
        stdin: canonicalJsonBytes({
          surface_kind: 'opl_foundry_independent_review_request',
          version: 'opl-foundry-independent-review-request.v1',
          operation,
          reviewer_id: this.#reviewerId,
          operation_identity: operationIdentity,
          run_id: input.run_id,
          target_agent_id: input.request.target_agent_id,
          target_domain_id: input.request.target_domain_id,
          target_version_ref: input.request.target_version_ref,
          blueprint_digest: input.blueprint_digest,
          candidate_digest: input.candidate.candidate_digest,
          frozen_test_plan_digest: evidence.frozen_test_plan_digest,
          public_results: evidence.public_results,
          baseline_public_results: evidence.baseline_public_results,
          protected_aggregates: evidence.protected_aggregates,
          baseline_protected_aggregates: evidence.baseline_protected_aggregates,
          gate_results: provisionalFacts.gateResults,
          safety_delta: evidence.safety_delta,
          cost_delta: evidence.cost_delta,
          latency_delta: evidence.latency_delta,
          failure_classification: evidence.failure_classification,
          protected_test_transport: { bodies_in_request: false },
        }),
      });
    } catch (error) {
      throw new FoundryTransientActivityError('Foundry independent review execution failed transiently.', {
        cause: error,
      });
    }
    let parsedReview: unknown;
    try {
      parsedReview = parseJsonText(reviewerOutput.toString('utf8'));
    } catch (error) {
      fail('Foundry independent reviewer returned invalid JSON.', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }
    const review = independentReviewResult(parsedReview);
    const facts = recomputeEvaluationQualification({
      request: input.request,
      spec: input.blueprint.eval_spec,
      public_results: evidence.public_results,
      baseline_public_results: evidence.baseline_public_results,
      protected_aggregates: evidence.protected_aggregates,
      baseline_protected_aggregates: evidence.baseline_protected_aggregates,
      independent_review_verdict: review.verdict,
      baseline_present: input.baseline_version !== null,
      cost_observations: evidence.cost_delta,
      latency_observations: evidence.latency_delta,
    });
    return validateEvidenceBundle({
      ...evidence,
      independent_review: {
        evaluator_ref: this.#reviewerId,
        evaluation_execution_ref: evaluationExecutionRef(operationIdentity.operation_key),
        review_execution_ref: reviewExecutionRef(operationIdentity.operation_key),
        verdict: review.verdict,
        findings: review.findings,
        evidence_refs: review.evidence_refs,
      },
      failure_classification: [
        ...evidence.failure_classification,
        ...facts.resourceConstraintResults.filter((entry) => !entry.passed).map((entry) => ({
          failure_class: `${entry.constraint_kind}_constraint_exceeded`,
          gate_id: `request_constraint:${entry.constraint_kind}:${entry.metric}`,
          severity: 'high' as const,
          evidence_refs: evidence.provenance.source_refs,
        })),
      ],
      qualified: facts.qualified,
      gate_score: facts.gateScore,
    });
  }

  evaluate(input: Parameters<EvaluationExecutor['evaluate']>[0]) {
    return this.#run('evaluate', input);
  }

  canary(input: Parameters<EvaluationExecutor['canary']>[0]) {
    return this.#run('canary', input);
  }
}

export function configuredFoundryEvaluationExecutor(input: {
  candidate_directory: (candidate: MaterializedCandidate) => string;
}) {
  const executable = process.env.OPL_FOUNDRY_EVALUATOR_BIN?.trim();
  const reviewerExecutable = process.env.OPL_FOUNDRY_REVIEWER_BIN?.trim();
  if (!executable || !reviewerExecutable) {
    return new UnconfiguredFoundryEvaluationExecutor(
      'Foundry Evaluation Runtime requires both OPL_FOUNDRY_EVALUATOR_BIN and OPL_FOUNDRY_REVIEWER_BIN.',
    );
  }
  return executable && reviewerExecutable
    ? new ProcessFoundryEvaluationExecutor({
        executable,
        args: configuredArgs('OPL_FOUNDRY_EVALUATOR_ARGS'),
        reviewer_executable: reviewerExecutable,
        reviewer_args: configuredArgs('OPL_FOUNDRY_REVIEWER_ARGS'),
        candidate_directory: input.candidate_directory,
      })
    : new UnconfiguredFoundryEvaluationExecutor();
}
