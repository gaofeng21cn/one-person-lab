import type { JsonRecord } from './runtime-tray-snapshot-types.ts';

type QualityReadinessAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  domain_ready_verdict: string | null;
  route_impact: JsonRecord;
  closeout_refs: string[];
  consumed_refs: string[];
  consumed_memory_refs: string[];
  writeback_receipt_refs: string[];
};

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function refsFromRouteImpact(routeImpact: JsonRecord, listField: string, singleFields: string[]) {
  return uniqueStrings([
    ...stringList(routeImpact[listField]),
    ...singleFields.map((field) => optionalString(routeImpact[field])).filter((entry): entry is string => Boolean(entry)),
  ]);
}

function qualityRefs(attempt: QualityReadinessAttempt) {
  return refsFromRouteImpact(attempt.route_impact, 'quality_refs', [
    'quality_ref',
    'quality_verdict_ref',
    'quality_gate_ref',
    'review_verdict_ref',
  ]);
}

function readinessRefs(attempt: QualityReadinessAttempt) {
  return refsFromRouteImpact(attempt.route_impact, 'readiness_refs', [
    'readiness_ref',
    'readiness_verdict_ref',
    'package_readiness_ref',
    'submission_readiness_ref',
  ]);
}

function evidenceRefs(attempt: QualityReadinessAttempt) {
  return uniqueStrings([
    ...attempt.closeout_refs,
    ...attempt.consumed_refs,
    ...attempt.consumed_memory_refs,
    ...attempt.writeback_receipt_refs,
    ...qualityRefs(attempt),
    ...readinessRefs(attempt),
  ]);
}

export function buildAttemptQualityReadiness(attempt: QualityReadinessAttempt) {
  const quality = qualityRefs(attempt);
  const readiness = readinessRefs(attempt);
  const evidence = evidenceRefs(attempt);
  const hasEvidence = Boolean(attempt.domain_ready_verdict) || quality.length > 0 || readiness.length > 0;
  return {
    surface_kind: 'opl_quality_readiness_projection',
    projection_scope: 'stage_attempt',
    renderer_role: 'generic_quality_readiness_projection_shell',
    availability: hasEvidence ? 'quality_readiness_refs_observed' : 'no_quality_readiness_refs',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    domain_ready_verdict: attempt.domain_ready_verdict,
    quality_refs: quality,
    readiness_refs: readiness,
    evidence_refs: evidence,
    summary: {
      domain_ready_verdict_observed: Boolean(attempt.domain_ready_verdict),
      quality_ref_count: quality.length,
      readiness_ref_count: readiness.length,
      evidence_ref_count: evidence.length,
      projection_policy: 'refs_only_no_quality_or_readiness_authority',
    },
    authority_boundary: {
      opl: 'quality_readiness_ref_projection_only',
      domain: 'quality_readiness_verdict_owner',
      can_authorize_quality_verdict: false,
      can_authorize_submission_readiness: false,
      can_write_domain_truth: false,
    },
  };
}

export function buildWorkbenchQualityReadiness(attempts: QualityReadinessAttempt[]) {
  const perAttempt = attempts.map(buildAttemptQualityReadiness);
  const quality = uniqueStrings(perAttempt.flatMap((projection) => projection.quality_refs));
  const readiness = uniqueStrings(perAttempt.flatMap((projection) => projection.readiness_refs));
  return {
    surface_kind: 'opl_quality_readiness_projection',
    projection_scope: 'stage_attempt_workbench',
    renderer_role: 'generic_quality_readiness_projection_shell',
    availability: perAttempt.some((projection) => projection.availability === 'quality_readiness_refs_observed')
      ? 'quality_readiness_refs_observed'
      : 'no_quality_readiness_refs',
    attempts: perAttempt,
    quality_refs: quality,
    readiness_refs: readiness,
    summary: {
      attempt_count: attempts.length,
      attempt_with_domain_readiness_verdict_count: perAttempt.filter((projection) =>
        projection.summary.domain_ready_verdict_observed
      ).length,
      attempt_with_quality_or_readiness_ref_count: perAttempt.filter((projection) =>
        projection.summary.quality_ref_count > 0 || projection.summary.readiness_ref_count > 0
      ).length,
      quality_ref_count: quality.length,
      readiness_ref_count: readiness.length,
      projection_policy: 'refs_only_no_quality_or_readiness_authority',
    },
    authority_boundary: {
      opl: 'quality_readiness_ref_projection_only',
      domain: 'quality_readiness_verdict_owner',
      can_authorize_quality_verdict: false,
      can_authorize_submission_readiness: false,
      can_write_domain_truth: false,
    },
  };
}
