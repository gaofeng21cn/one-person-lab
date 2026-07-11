import {
  record,
  recordList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

type StageCandidatePortfolioAttempt = {
  stage_attempt_id: string;
  domain_id: string;
  stage_id: string;
  stage_candidate_portfolio?: JsonRecord | null;
};

type StageCandidatePortfolioItem = {
  item_id: string;
  ref: string | null;
  status: string | null;
  stage_id: string;
  candidate_id: string | null;
  route_family: string | null;
  rollback_target_ref: string | null;
  advisory_reason_ref: string | null;
};

const BODY_FIELD_NAMES = new Set([
  'body',
  'content',
  'payload_body',
  'domain_body',
  'candidate_body',
  'memory_body',
  'artifact_body',
  'full_prose',
]);

function uniqueStrings(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const found = stringValue(value);
    if (found) return found;
  }
  return null;
}

function countBy(values: Array<string | null>) {
  return values.reduce<Record<string, number>>((counts, value) => {
    const key = value ?? 'unknown';
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function forbiddenBodyFieldCount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((count, entry) => count + forbiddenBodyFieldCount(entry), 0);
  }
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce((count, [key, entry]) =>
    count + (BODY_FIELD_NAMES.has(key) ? 1 : forbiddenBodyFieldCount(entry)), 0);
}

function projectionItem(
  attempt: StageCandidatePortfolioAttempt,
  item: JsonRecord,
  index: number,
): StageCandidatePortfolioItem | null {
  const ref = firstString(item.ref, item.candidate_ref);
  const status = firstString(item.status);
  const candidateId = firstString(item.candidate_id, item.id);
  const routeFamily = firstString(item.route_family);
  const rollbackTargetRef = firstString(item.rollback_target_ref);
  const advisoryReasonRef = firstString(item.advisory_reason_ref);
  if (!ref && !status && !candidateId && !routeFamily && !rollbackTargetRef && !advisoryReasonRef) {
    return null;
  }
  return {
    item_id: `candidate:${attempt.stage_attempt_id}:${index}`,
    ref,
    status,
    stage_id: firstString(item.stage_id) ?? attempt.stage_id,
    candidate_id: candidateId,
    route_family: routeFamily,
    rollback_target_ref: rollbackTargetRef,
    advisory_reason_ref: advisoryReasonRef,
  };
}

function authorityBoundary() {
  return {
    opl: 'candidate_portfolio_refs_projection_owner_only',
    domain: 'candidate_content_route_decision_truth_owner',
    can_read_domain_body: false,
    can_write_domain_body: false,
    can_infer_route_decision: false,
    can_authorize_owner_receipt: false,
    can_authorize_typed_blocker: false,
    can_claim_domain_progress: false,
    can_authorize_quality_verdict: false,
    can_authorize_domain_ready: false,
    can_mutate_artifact_body: false,
    can_write_domain_truth: false,
  };
}

function summary(attempts: number, items: StageCandidatePortfolioItem[], omittedBodyFieldCount: number) {
  const rollbackTargetRefs = uniqueStrings(
    items.map((item) => item.rollback_target_ref).filter((ref): ref is string => Boolean(ref)),
  );
  const advisoryReasonRefs = uniqueStrings(
    items.map((item) => item.advisory_reason_ref).filter((ref): ref is string => Boolean(ref)),
  );
  return {
    attempt_count: attempts,
    item_count: items.length,
    status_counts: countBy(items.map((item) => item.status)),
    stage_counts: countBy(items.map((item) => item.stage_id)),
    route_family_counts: countBy(items.map((item) => item.route_family)),
    rollback_target_refs: rollbackTargetRefs,
    advisory_reason_refs: advisoryReasonRefs,
    omitted_body_field_count: omittedBodyFieldCount,
    projection_policy: 'refs_status_summary_only_no_domain_body_no_route_decision_authority',
  };
}

export function buildAttemptStageCandidatePortfolio(attempt: StageCandidatePortfolioAttempt) {
  const portfolio = record(attempt.stage_candidate_portfolio);
  const items = recordList(portfolio.items)
    .map((item, index) => projectionItem(attempt, item, index))
    .filter((item): item is StageCandidatePortfolioItem => Boolean(item));
  const portfolioRefs = uniqueStrings([
    ...recordList(portfolio.items).flatMap((item) => [firstString(item.ref, item.candidate_ref) ?? '']),
    ...(Array.isArray(portfolio.portfolio_refs)
      ? portfolio.portfolio_refs.filter((ref): ref is string => typeof ref === 'string')
      : []),
  ]);
  return {
    surface_kind: 'stage_candidate_portfolio_refs_projection',
    projection_scope: 'stage_attempt',
    availability: items.length > 0 || portfolioRefs.length > 0
      ? 'candidate_refs_observed'
      : 'no_candidate_refs',
    stage_attempt_id: attempt.stage_attempt_id,
    domain_id: attempt.domain_id,
    stage_id: attempt.stage_id,
    candidate_count: items.length,
    portfolio_refs: portfolioRefs,
    summary: summary(1, items, forbiddenBodyFieldCount(portfolio)),
    items,
    authority_boundary: authorityBoundary(),
  };
}

export function buildWorkbenchStageCandidatePortfolio(attempts: StageCandidatePortfolioAttempt[]) {
  const perAttempt = attempts.map(buildAttemptStageCandidatePortfolio);
  const items = perAttempt.flatMap((projection) => projection.items);
  return {
    surface_kind: 'stage_candidate_portfolio_refs_projection',
    projection_scope: 'stage_attempt_workbench',
    availability: perAttempt.some((projection) => projection.availability === 'candidate_refs_observed')
      ? 'candidate_refs_observed'
      : 'no_candidate_refs',
    attempts: perAttempt,
    candidate_count: items.length,
    portfolio_refs: uniqueStrings(perAttempt.flatMap((projection) => projection.portfolio_refs)),
    summary: summary(
      attempts.length,
      items,
      perAttempt.reduce((count, projection) => count + projection.summary.omitted_body_field_count, 0),
    ),
    items,
    authority_boundary: authorityBoundary(),
  };
}
