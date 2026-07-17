import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { canonicalJsonBytes, canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import {
  FoundryTransientActivityError,
  assertEvaluationEvidenceFacts,
  recomputeEvaluationQualification,
  validateEvidenceBundle,
} from '../foundry/index.ts';
import type {
  AgentVersion,
  EvidenceBundle,
  EvaluationCandidateIdentity,
  EvaluationCandidatePackResolver,
  EvaluationExecutor,
} from '../foundry/index.ts';
import {
  executeFoundryEvaluationProcess,
  type FoundryEvaluationPackSource,
} from './foundry-evaluation-process-sandbox.ts';

const DEFAULT_EVALUATION_TIMEOUT_MS = 30 * 60 * 1000;
const OFFLINE_OBSERVATION_CAPABILITY_REF =
  'opl://foundry/evaluation-capability/offline-projected-pack-observation-only';
const OFFLINE_OBSERVATION_FINDING =
  'Offline projected-pack observations are not qualification-grade; a Framework-owned FrozenPlan Evaluation Runtime must execute protected requirements.';

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

function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function exactCandidatePackFiles(root: string, relative = ''): string[] {
  const directory = path.join(root, relative);
  const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name));
  const files: string[] = [];
  for (const entry of entries) {
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    const full = path.join(root, next);
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) fail('Evaluation candidate pack contains a symlink.', { candidate_path: next });
    if (stat.isDirectory()) files.push(...exactCandidatePackFiles(root, next));
    else if (stat.isFile()) files.push(next);
    else fail('Evaluation candidate pack contains a non-regular filesystem entry.', { candidate_path: next });
  }
  return files;
}

function resolveExactCandidatePack(
  resolver: EvaluationCandidatePackResolver,
  identity: EvaluationCandidateIdentity,
  label: 'candidate' | 'baseline',
) {
  if (
    !/^sha256:[a-f0-9]{64}$/.test(identity.blueprint_digest)
    || !/^sha256:[a-f0-9]{64}$/.test(identity.candidate_digest)
    || !identity.candidate_ref.trim()
  ) {
    fail(`Foundry ${label} candidate identity is invalid.`);
  }
  const declaredDirectory = requiredString(
    resolver.resolveDirectory(identity),
    `Foundry ${label} candidate directory`,
  );
  let directory: string;
  try {
    const stat = fs.lstatSync(declaredDirectory);
    directory = fs.realpathSync.native(declaredDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('not a physical directory');
  } catch (error) {
    fail(`Foundry ${label} candidate pack directory is unavailable.`, {
      candidate_digest: identity.candidate_digest,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (path.basename(directory!) !== identity.candidate_digest.slice('sha256:'.length)) {
    fail(`Foundry ${label} candidate directory does not match its content digest.`, {
      candidate_digest: identity.candidate_digest,
      directory,
    });
  }
  const indexFile = path.join(directory!, 'candidate-index.json');
  let rawIndex: unknown;
  let indexBytes: Buffer;
  try {
    const stat = fs.lstatSync(indexFile);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a physical file');
    indexBytes = fs.readFileSync(indexFile);
    rawIndex = parseJsonText(indexBytes.toString('utf8'));
  } catch (error) {
    fail(`Foundry ${label} candidate index is unavailable.`, {
      candidate_digest: identity.candidate_digest,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
  if (!isRecord(rawIndex)) fail(`Foundry ${label} candidate index must be an object.`);
  exactFields(
    rawIndex,
    ['surface_kind', 'version', 'blueprint_digest', 'candidate_digest', 'files'],
    `Foundry ${label} candidate index`,
  );
  if (
    rawIndex.surface_kind !== 'opl_foundry_candidate_file_index'
    || rawIndex.version !== 'opl-foundry-candidate-index.v2'
    || rawIndex.blueprint_digest !== identity.blueprint_digest
    || rawIndex.candidate_digest !== identity.candidate_digest
    || !Array.isArray(rawIndex.files)
    || rawIndex.files.length === 0
  ) {
    fail(`Foundry ${label} candidate index identity is invalid.`, {
      candidate_digest: identity.candidate_digest,
    });
  }
  const files = rawIndex.files.map((value, index) => {
    if (!isRecord(value)) fail(`Foundry ${label} candidate file ${index} must be an object.`);
    exactFields(value, ['path', 'sha256', 'byte_size'], `Foundry ${label} candidate file ${index}`);
    const relativePath = requiredString(value.path, `Foundry ${label} candidate file path`);
    if (
      path.posix.isAbsolute(relativePath)
      || path.posix.normalize(relativePath) !== relativePath
      || relativePath.includes('\\')
      || relativePath.includes('\0')
      || relativePath === 'candidate-index.json'
      || relativePath.split('/').some((segment) => !segment || segment === '.' || segment === '..')
    ) {
      fail(`Foundry ${label} candidate index contains an unsafe path.`, { candidate_path: relativePath });
    }
    const fileDigest = requiredString(value.sha256, `Foundry ${label} candidate file sha256`);
    if (!/^[a-f0-9]{64}$/.test(fileDigest)
      || !Number.isSafeInteger(value.byte_size)
      || Number(value.byte_size) <= 0) {
      fail(`Foundry ${label} candidate file identity is invalid.`, { candidate_path: relativePath });
    }
    return { path: relativePath, sha256: fileDigest, byte_size: Number(value.byte_size) };
  });
  if (new Set(files.map((entry) => entry.path)).size !== files.length) {
    fail(`Foundry ${label} candidate index contains duplicate paths.`);
  }
  const expectedCandidateDigest = `sha256:${sha256(canonicalJsonText({
    surface_kind: rawIndex.surface_kind,
    version: rawIndex.version,
    blueprint_digest: rawIndex.blueprint_digest,
    files,
  }))}`;
  if (expectedCandidateDigest !== identity.candidate_digest) {
    fail(`Foundry ${label} candidate index does not match its content address.`, {
      candidate_digest: identity.candidate_digest,
      expected_candidate_digest: expectedCandidateDigest,
    });
  }
  if (!indexBytes!.equals(canonicalJsonBytes(rawIndex))) {
    fail(`Foundry ${label} candidate index is not canonical JSON.`);
  }
  const expectedFiles = [...files.map((entry) => entry.path), 'candidate-index.json'].sort();
  const actualFiles = exactCandidatePackFiles(directory!).sort();
  if (canonicalJsonText(actualFiles) !== canonicalJsonText(expectedFiles)) {
    fail(`Foundry ${label} candidate pack contains missing or unexpected bytes.`, {
      expected_files: expectedFiles,
      actual_files: actualFiles,
    });
  }
  for (const entry of files) {
    const file = path.join(directory!, entry.path);
    const stat = fs.lstatSync(file);
    const real = fs.realpathSync.native(file);
    if (
      !stat.isFile()
      || stat.isSymbolicLink()
      || !real.startsWith(`${directory!}${path.sep}`)
      || stat.size !== entry.byte_size
      || sha256(fs.readFileSync(real)) !== entry.sha256
    ) {
      fail(`Foundry ${label} candidate bytes do not match the immutable file index.`, {
        candidate_digest: identity.candidate_digest,
        candidate_path: entry.path,
      });
    }
  }
  const transport = {
    surface_kind: 'opl_foundry_exact_evaluation_candidate_pack' as const,
    version: 'opl-foundry-exact-evaluation-candidate-pack.v1' as const,
    target_agent_id: identity.target_agent_id,
    target_domain_id: identity.target_domain_id,
    blueprint_digest: identity.blueprint_digest,
    candidate_digest: identity.candidate_digest,
    candidate_ref: identity.candidate_ref,
    candidate_directory: directory!,
    candidate_index_digest: `sha256:${sha256(indexBytes!)}`,
  };
  return {
    transport,
    projection: {
      label,
      source_directory: directory!,
      files: [
        ...files,
        {
          path: 'candidate-index.json',
          sha256: sha256(indexBytes!),
          byte_size: indexBytes!.byteLength,
        },
      ],
    } satisfies FoundryEvaluationPackSource,
  };
}

export class UnconfiguredFoundryEvaluationExecutor implements EvaluationExecutor {
  readonly evaluator_id = 'opl-evaluation-runtime:unconfigured';
  readonly qualification_capability = {
    status: 'unavailable',
    execution_mode: 'unconfigured',
    protected_fact_authority: 'none',
  } as const;
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
  'candidate_cost_observations',
  'candidate_latency_observations',
  'safety_observations',
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

function candidateIndexEvidenceRef(candidateIndexDigest: string) {
  return `opl://foundry/candidate-index/${encodeURIComponent(candidateIndexDigest)}`;
}

function offlineExecutionBoundary(candidateAccess: 'read_only_projected_bytes' | 'none') {
  return {
    mode: 'offline_projected_pack_observation.v1',
    dynamic_evaluation_owner: 'opl_frozen_plan_evaluation_runtime',
    candidate_access: candidateAccess,
    protected_case_bodies_access: false,
    owner_registry_access: false,
    network_access: false,
    child_process_access: false,
    worker_access: false,
  } as const;
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
    candidate_cost_observations: input.observation.candidate_cost_observations,
    candidate_latency_observations: input.observation.candidate_latency_observations,
    safety_observations: input.observation.safety_observations,
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

// Dynamic case execution and model-backed review belong to FrozenPlanEvaluationRuntime ports.
export class ProcessFoundryEvaluationExecutor implements EvaluationExecutor {
  readonly evaluator_id = 'opl-evaluation-runtime:registered-executor';
  readonly execution_mode = 'offline_projected_pack_observation.v1';
  readonly qualification_capability = {
    status: 'observation_only',
    execution_mode: 'offline_projected_pack_observation.v1',
    protected_fact_authority: 'untrusted_process_observation',
  } as const;
  readonly #executable: string;
  readonly #args: string[];
  readonly #reviewerExecutable: string | null;
  readonly #reviewerArgs: string[];
  readonly #reviewerId: string;
  readonly #candidatePackResolver: EvaluationCandidatePackResolver;
  readonly #timeoutMs: number;
  readonly #reviewerTimeoutMs: number;

  constructor(input: {
    execution_mode: 'offline_projected_pack_observation.v1';
    executable: string;
    args?: string[];
    reviewer_executable?: string;
    reviewer_args?: string[];
    reviewer_id?: string;
    candidate_pack_resolver: EvaluationCandidatePackResolver;
    timeout_ms?: number;
    reviewer_timeout_ms?: number;
  }) {
    if (input.execution_mode !== this.execution_mode) {
      fail('Process-backed Foundry evaluation supports only offline projected-pack observation.');
    }
    this.#executable = requiredString(input.executable, 'Foundry evaluator executable');
    this.#args = input.args ?? [];
    this.#reviewerExecutable = input.reviewer_executable?.trim() || null;
    this.#reviewerArgs = input.reviewer_args ?? [];
    this.#reviewerId = requiredString(
      input.reviewer_id ?? 'opl-independent-reviewer:registered-executor',
      'Foundry independent reviewer id',
    );
    this.#candidatePackResolver = input.candidate_pack_resolver;
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
    const candidatePack = resolveExactCandidatePack(
      this.#candidatePackResolver,
      input.candidate,
      'candidate',
    );
    const baselinePack = input.baseline_version
      ? resolveExactCandidatePack(this.#candidatePackResolver, input.baseline_version, 'baseline')
      : null;
    let evaluatorOutput: Buffer;
    try {
      evaluatorOutput = await executeFoundryEvaluationProcess({
        executable: this.#executable,
        args: this.#args,
        timeoutMs: this.#timeoutMs,
        packs: [
          candidatePack.projection,
          ...(baselinePack ? [baselinePack.projection] : []),
        ],
        stdin: (projection) => canonicalJsonBytes({
          surface_kind: 'opl_foundry_evaluation_runtime_request',
          version: 'opl-foundry-evaluation-runtime-request.v1',
          operation,
          evaluator_id: this.evaluator_id,
          execution_boundary: offlineExecutionBoundary('read_only_projected_bytes'),
          operation_identity: operationIdentity,
          run_id: input.run_id,
          request: input.request,
          blueprint: input.blueprint,
          blueprint_digest: input.blueprint_digest,
          candidate: input.candidate,
          candidate_pack: {
            ...candidatePack.transport,
            candidate_directory: projection.candidate_directory
              ?? fail('Foundry candidate sandbox projection is unavailable.'),
          },
          baseline_version: input.baseline_version,
          baseline_pack: baselinePack
            ? {
                ...baselinePack.transport,
                candidate_directory: projection.baseline_directory
                  ?? fail('Foundry baseline sandbox projection is unavailable.'),
              }
            : null,
          version_under_canary: input.version ?? null,
          protected_test_transport: {
            bodies_in_request: false,
            evaluator_resolves_target_owner_registry: false,
            trusted_harness_required_for_dynamic_cases: true,
          },
        }),
      });
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
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
    const candidateEvidenceRef = candidateIndexEvidenceRef(
      candidatePack.transport.candidate_index_digest,
    );
    const baselineEvidenceRef = baselinePack
      ? candidateIndexEvidenceRef(baselinePack.transport.candidate_index_digest)
      : null;
    if (
      !evidence.provenance.source_refs.includes(candidateEvidenceRef)
      || (baselineEvidenceRef !== null && !evidence.provenance.source_refs.includes(baselineEvidenceRef))
    ) {
      fail('Offline Foundry evaluation evidence must bind every projected candidate index.', {
        candidate_index_evidence_ref: candidateEvidenceRef,
        baseline_index_evidence_ref: baselineEvidenceRef,
      });
    }
    const provisionalFacts = recomputeEvaluationQualification({
      request: input.request,
      spec: input.blueprint.eval_spec,
      public_results: evidence.public_results,
      baseline_public_results: evidence.baseline_public_results,
      protected_aggregates: evidence.protected_aggregates,
      baseline_protected_aggregates: evidence.baseline_protected_aggregates,
      independent_review_verdict: 'pass',
      baseline_present: input.baseline_version !== null,
      candidate_cost_observations: evidence.candidate_cost_observations,
      candidate_latency_observations: evidence.candidate_latency_observations,
      safety_observations: evidence.safety_observations,
    });
    let reviewerOutput: Buffer;
    try {
      reviewerOutput = await executeFoundryEvaluationProcess({
        executable: this.#reviewerExecutable,
        args: this.#reviewerArgs,
        timeoutMs: this.#reviewerTimeoutMs,
        stdin: () => canonicalJsonBytes({
          surface_kind: 'opl_foundry_independent_review_request',
          version: 'opl-foundry-independent-review-request.v1',
          operation,
          reviewer_id: this.#reviewerId,
          execution_boundary: offlineExecutionBoundary('none'),
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
          candidate_cost_observations: evidence.candidate_cost_observations,
          candidate_latency_observations: evidence.candidate_latency_observations,
          safety_observations: evidence.safety_observations,
          safety_delta: evidence.safety_delta,
          cost_delta: evidence.cost_delta,
          latency_delta: evidence.latency_delta,
          failure_classification: evidence.failure_classification,
          protected_test_transport: {
            bodies_in_request: false,
            trusted_harness_required_for_dynamic_cases: true,
          },
        }),
      });
    } catch (error) {
      if (error instanceof FrameworkContractError) throw error;
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
    const qualificationReview = review.verdict === 'pass'
      ? {
          ...review,
          verdict: 'blocked' as const,
          findings: [...review.findings, OFFLINE_OBSERVATION_FINDING],
        }
      : review;
    const facts = recomputeEvaluationQualification({
      request: input.request,
      spec: input.blueprint.eval_spec,
      public_results: evidence.public_results,
      baseline_public_results: evidence.baseline_public_results,
      protected_aggregates: evidence.protected_aggregates,
      baseline_protected_aggregates: evidence.baseline_protected_aggregates,
      independent_review_verdict: qualificationReview.verdict,
      baseline_present: input.baseline_version !== null,
      candidate_cost_observations: evidence.candidate_cost_observations,
      candidate_latency_observations: evidence.candidate_latency_observations,
      safety_observations: evidence.safety_observations,
    });
    const finalEvidence = validateEvidenceBundle({
      ...evidence,
      independent_review: {
        evaluator_ref: this.#reviewerId,
        evaluation_execution_ref: evaluationExecutionRef(operationIdentity.operation_key),
        review_execution_ref: reviewExecutionRef(operationIdentity.operation_key),
        verdict: qualificationReview.verdict,
        findings: qualificationReview.findings,
        evidence_refs: qualificationReview.evidence_refs,
      },
      failure_classification: [
        ...evidence.failure_classification.filter((entry) =>
          entry.failure_class !== 'safety_event'
          && !entry.gate_id.startsWith('request_constraint:')),
        ...facts.resourceConstraintResults.filter((entry) => !entry.passed).map((entry) => ({
          failure_class: `${entry.constraint_kind}_constraint_exceeded`,
          gate_id: `request_constraint:${entry.constraint_kind}:${entry.metric}`,
          severity: 'high' as const,
          evidence_refs: evidence.provenance.source_refs,
        })),
        ...facts.safetyFailureClassifications,
      ],
      qualified: facts.qualified,
      gate_score: facts.gateScore,
      provenance: {
        ...evidence.provenance,
        source_refs: [
          ...evidence.provenance.source_refs,
          ...(!evidence.provenance.source_refs.includes(OFFLINE_OBSERVATION_CAPABILITY_REF)
            ? [OFFLINE_OBSERVATION_CAPABILITY_REF]
            : []),
        ],
      },
    });
    assertEvaluationEvidenceFacts({
      request: input.request,
      spec: input.blueprint.eval_spec,
      evidence: finalEvidence,
      baseline_present: input.baseline_version !== null,
    });
    return finalEvidence;
  }

  evaluate(input: Parameters<EvaluationExecutor['evaluate']>[0]) {
    return this.#run('evaluate', input);
  }

  canary(input: Parameters<EvaluationExecutor['canary']>[0]) {
    return this.#run('canary', input);
  }
}

export function configuredFoundryEvaluationExecutor(input: {
  candidate_pack_resolver: EvaluationCandidatePackResolver;
}) {
  const executable = process.env.OPL_FOUNDRY_EVALUATOR_BIN?.trim();
  const reviewerExecutable = process.env.OPL_FOUNDRY_REVIEWER_BIN?.trim();
  const executionMode = process.env.OPL_FOUNDRY_EVALUATION_MODE?.trim();
  if (!executable || !reviewerExecutable) {
    return new UnconfiguredFoundryEvaluationExecutor(
      'Foundry Evaluation Runtime requires both OPL_FOUNDRY_EVALUATOR_BIN and OPL_FOUNDRY_REVIEWER_BIN.',
    );
  }
  if (executionMode !== 'offline_projected_pack_observation.v1') {
    return new UnconfiguredFoundryEvaluationExecutor(
      'Process-backed Foundry evaluation requires OPL_FOUNDRY_EVALUATION_MODE=offline_projected_pack_observation.v1; dynamic cases and model review belong to FrozenPlanEvaluationRuntime ports.',
    );
  }
  return executable && reviewerExecutable
    ? new ProcessFoundryEvaluationExecutor({
        execution_mode: 'offline_projected_pack_observation.v1',
        executable,
        args: configuredArgs('OPL_FOUNDRY_EVALUATOR_ARGS'),
        reviewer_executable: reviewerExecutable,
        reviewer_args: configuredArgs('OPL_FOUNDRY_REVIEWER_ARGS'),
        candidate_pack_resolver: input.candidate_pack_resolver,
      })
    : new UnconfiguredFoundryEvaluationExecutor();
}
