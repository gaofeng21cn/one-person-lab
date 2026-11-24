import { isRecord } from '../../../kernel/contract-validation.ts';
import { fail, requiredString, requiredUniqueStringList, assertExactKeys, assertNumericMap, assertNonNegativeNumericMap, assertDateTime, assertDigest } from './validation-values.ts';
import { assertBase } from './semantic-boundary.ts';
import type { EvidenceBundle } from './types.ts';

function validatePublicResults(value: unknown, label: string) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) fail(`${label}[${index}] must be an object.`);
    assertExactKeys(entry, `${label}[${index}]`, ['case_id', 'status', 'score', 'evidence_refs']);
    requiredString(entry.case_id, `${label}[${index}].case_id`);
    if (!['pass', 'fail', 'blocked'].includes(String(entry.status))) fail(`${label}[${index}].status is invalid.`);
    if (!Number.isFinite(entry.score) || Number(entry.score) < 0 || Number(entry.score) > 1) {
      fail(`${label}[${index}].score must be a finite number from 0 to 1.`);
    }
    requiredUniqueStringList(entry.evidence_refs, `${label}[${index}].evidence_refs`, 1);
  }
}

function validateProtectedAggregates(value: unknown, label: string) {
  if (!Array.isArray(value)) fail(`${label} must be an array.`);
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) fail(`${label}[${index}] must be an object.`);
    assertExactKeys(entry, `${label}[${index}]`, ['category', 'total', 'passed', 'failed', 'score']);
    requiredString(entry.category, `${label}[${index}].category`);
    for (const field of ['total', 'passed', 'failed'] as const) {
      if (!Number.isSafeInteger(entry[field]) || Number(entry[field]) < 0) {
        fail(`${label}[${index}].${field} must be a non-negative integer.`);
      }
    }
    if (Number(entry.passed) + Number(entry.failed) !== Number(entry.total)) {
      fail(`${label}[${index}] counts must sum to total.`);
    }
    if (!Number.isFinite(entry.score) || Number(entry.score) < 0 || Number(entry.score) > 1) {
      fail(`${label}[${index}].score must be a finite number from 0 to 1.`);
    }
  }
  const categories = value.map((entry) => (entry as Record<string, unknown>).category);
  if (new Set(categories).size !== categories.length) fail(`${label} categories must be unique.`);
}

export function validateEvidenceBundle(value: unknown): EvidenceBundle {
  const input = assertBase(value, 'opl_foundry_evidence_bundle', 'EvidenceBundle');
  assertExactKeys(input, 'EvidenceBundle', [
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
    'independent_review',
    'candidate_cost_observations',
    'candidate_latency_observations',
    'safety_observations',
    'safety_delta',
    'cost_delta',
    'latency_delta',
    'failure_classification',
    'qualified',
    'gate_score',
    'provenance',
  ]);
  requiredString(input.evidence_id, 'EvidenceBundle.evidence_id');
  assertDigest(input.blueprint_digest, 'EvidenceBundle.blueprint_digest');
  assertDigest(input.candidate_digest, 'EvidenceBundle.candidate_digest');
  if (input.baseline_version_digest !== null) assertDigest(input.baseline_version_digest, 'EvidenceBundle.baseline_version_digest');
  assertDigest(input.frozen_test_plan_digest, 'EvidenceBundle.frozen_test_plan_digest');
  validatePublicResults(input.public_results, 'EvidenceBundle.public_results');
  if ((input.public_results as unknown[]).length === 0) fail('EvidenceBundle.public_results must not be empty.');
  if (input.baseline_public_results !== null) {
    validatePublicResults(input.baseline_public_results, 'EvidenceBundle.baseline_public_results');
    if ((input.baseline_public_results as unknown[]).length === 0) {
      fail('EvidenceBundle.baseline_public_results must not be empty when present.');
    }
  }
  validateProtectedAggregates(input.protected_aggregates, 'EvidenceBundle.protected_aggregates');
  if (input.baseline_protected_aggregates !== null) {
    validateProtectedAggregates(
      input.baseline_protected_aggregates,
      'EvidenceBundle.baseline_protected_aggregates',
    );
  }
  const baselinePresent = input.baseline_version_digest !== null;
  if (
    baselinePresent !== (input.baseline_public_results !== null)
    || baselinePresent !== (input.baseline_protected_aggregates !== null)
  ) {
    fail(
      'EvidenceBundle baseline version, public results, and protected aggregates must be present or null together.',
    );
  }
  if (!isRecord(input.independent_review)) fail('EvidenceBundle.independent_review is required.');
  assertExactKeys(input.independent_review, 'EvidenceBundle.independent_review', [
    'evaluator_ref',
    'evaluation_execution_ref',
    'review_execution_ref',
    'verdict',
    'findings',
    'evidence_refs',
  ]);
  requiredString(input.independent_review.evaluator_ref, 'EvidenceBundle.independent_review.evaluator_ref');
  requiredString(input.independent_review.evaluation_execution_ref, 'EvidenceBundle.independent_review.evaluation_execution_ref');
  requiredString(input.independent_review.review_execution_ref, 'EvidenceBundle.independent_review.review_execution_ref');
  if (input.independent_review.evaluation_execution_ref === input.independent_review.review_execution_ref) {
    fail('EvidenceBundle evaluation and independent review must use different executions.');
  }
  if (!['pass', 'fail', 'blocked'].includes(String(input.independent_review.verdict))) {
    fail('EvidenceBundle.independent_review.verdict is invalid.');
  }
  requiredUniqueStringList(input.independent_review.findings, 'EvidenceBundle.independent_review.findings');
  requiredUniqueStringList(input.independent_review.evidence_refs, 'EvidenceBundle.independent_review.evidence_refs', 1);
  assertNonNegativeNumericMap(
    input.candidate_cost_observations,
    'EvidenceBundle.candidate_cost_observations',
  );
  assertNonNegativeNumericMap(
    input.candidate_latency_observations,
    'EvidenceBundle.candidate_latency_observations',
  );
  if (!Array.isArray(input.safety_observations)) {
    fail('EvidenceBundle.safety_observations must be an array.');
  }
  const safetyObservationIds = input.safety_observations.map((entry, index) => {
    if (!isRecord(entry)) fail(`EvidenceBundle.safety_observations[${index}] must be an object.`);
    const label = `EvidenceBundle.safety_observations[${index}]`;
    assertExactKeys(entry, label, ['observation_id', 'event_type', 'severity', 'evidence_refs']);
    const observationId = requiredString(entry.observation_id, `${label}.observation_id`);
    requiredString(entry.event_type, `${label}.event_type`);
    if (!['low', 'medium', 'high', 'critical'].includes(String(entry.severity))) {
      fail(`${label}.severity is invalid.`);
    }
    requiredUniqueStringList(entry.evidence_refs, `${label}.evidence_refs`, 1);
    return observationId;
  });
  if (new Set(safetyObservationIds).size !== safetyObservationIds.length) {
    fail('EvidenceBundle.safety_observations observation ids must be unique.');
  }
  assertNumericMap(input.safety_delta, 'EvidenceBundle.safety_delta');
  assertNumericMap(input.cost_delta, 'EvidenceBundle.cost_delta');
  assertNumericMap(input.latency_delta, 'EvidenceBundle.latency_delta');
  if (!Array.isArray(input.failure_classification)) fail('EvidenceBundle.failure_classification must be an array.');
  for (const [index, entry] of input.failure_classification.entries()) {
    if (!isRecord(entry)) fail(`EvidenceBundle.failure_classification[${index}] must be an object.`);
    const label = `EvidenceBundle.failure_classification[${index}]`;
    assertExactKeys(entry, label, ['failure_class', 'gate_id', 'severity', 'evidence_refs']);
    requiredString(entry.failure_class, `${label}.failure_class`);
    requiredString(entry.gate_id, `${label}.gate_id`);
    if (!['low', 'medium', 'high', 'critical'].includes(String(entry.severity))) {
      fail(`${label}.severity is invalid.`);
    }
    requiredUniqueStringList(entry.evidence_refs, `${label}.evidence_refs`);
  }
  if (typeof input.qualified !== 'boolean'
    || !Number.isFinite(input.gate_score)
    || Number(input.gate_score) < 0
    || Number(input.gate_score) > 1) {
    fail('EvidenceBundle qualification fields are invalid.');
  }
  if (!isRecord(input.provenance)
    || !Number.isSafeInteger(input.provenance.generation)
    || Number(input.provenance.generation) < 0) {
    fail('EvidenceBundle.provenance is required.');
  }
  assertExactKeys(input.provenance, 'EvidenceBundle.provenance', [
    'foundry_run_id',
    'generation',
    'producer_id',
    'evaluated_at',
    'source_refs',
  ]);
  requiredString(input.provenance.foundry_run_id, 'EvidenceBundle.provenance.foundry_run_id');
  requiredString(input.provenance.producer_id, 'EvidenceBundle.provenance.producer_id');
  assertDateTime(input.provenance.evaluated_at, 'EvidenceBundle.provenance.evaluated_at');
  requiredUniqueStringList(input.provenance.source_refs, 'EvidenceBundle.provenance.source_refs');
  return input as unknown as EvidenceBundle;
}
