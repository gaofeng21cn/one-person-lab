import { isRecord } from '../../kernel/contract-validation.ts';
import {
  record,
  recordList,
  stringValue as optionalString,
  type JsonRecord,
} from '../../kernel/json-record.ts';

export interface StageCandidatePortfolioValidationError {
  code:
    | 'root_not_object'
    | 'surface_kind_invalid'
    | 'version_invalid'
    | 'surface_missing'
    | 'surface_version_invalid'
    | 'authority_boundary_invalid'
    | 'domain_body_forbidden'
    | 'ref_body_forbidden';
  path: string;
  message: string;
}

export interface StageCandidatePortfolioValidation {
  valid: boolean;
  errors: StageCandidatePortfolioValidationError[];
}

export interface StageCandidatePortfolioMissingRef {
  ref_id: string | null;
  role: string | null;
  ref_kind: string | null;
  ref: string | null;
  source_surface: string;
  status: string | null;
}

export interface StageCandidatePortfolioRef {
  ref: string;
  source_surface: string;
  ref_id: string | null;
  role: string | null;
  ref_kind: string | null;
  status: string | null;
  required: boolean | null;
}

export interface StageCandidatePortfolioSummary {
  surface_kind: 'stage_candidate_portfolio_summary';
  version: 'stage_candidate_portfolio_summary.v1';
  portfolio_id: string | null;
  target_domain_id: string | null;
  portfolio_status: string | null;
  portfolio_refs: StageCandidatePortfolioRef[];
  missing_refs: StageCandidatePortfolioMissingRef[];
  candidate_count: number;
  candidate_status_counts: Record<string, number>;
  assumption_count: number;
  provenance_check_count: number;
  failed_path_count: number;
  negative_result_count: number;
  advisory_metric_count: number;
  advisory_ranking_count: number;
  human_review_count: number;
  pending_human_review_count: number;
  advisory_refs: string[];
  human_review_request_refs: string[];
  human_review_decision_refs: string[];
  route_back_refs: string[];
  owner_refs: string[];
  authority_boundary: {
    opl_role: 'stage_candidate_portfolio_refs_projection_owner';
    domain_role: 'domain_truth_quality_receipt_and_artifact_authority';
    portfolio_scope: 'refs_status_advisory_projection_only';
    holds_domain_truth: false;
    can_read_domain_body: false;
    can_write_domain_truth: false;
    can_authorize_candidate_acceptance: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_mutate_artifact_body: false;
    can_accept_or_reject_owner_receipt: false;
    advisory_metrics_are_domain_verdict: false;
  };
  advisory_metrics_authority_boundary: {
    opl_role: 'advisory_metric_ref_projection_only';
    metrics_scope: 'refs_status_advisory_only';
    metrics_are_domain_verdict: false;
    can_authorize_candidate_acceptance: false;
    can_authorize_domain_ready: false;
    can_authorize_quality_verdict: false;
    can_rank_as_domain_truth: false;
  };
}

const REQUIRED_SURFACES = [
  [
    'assumption_decomposition',
    'stage_candidate_assumption_refs',
    'stage_candidate_assumption_refs.v1',
  ],
  [
    'provenance_checks',
    'stage_candidate_provenance_checks',
    'stage_candidate_provenance_checks.v1',
  ],
  [
    'negative_path_ledger',
    'stage_candidate_negative_path_ledger',
    'stage_candidate_negative_path_ledger.v1',
  ],
  [
    'advisory_metrics',
    'stage_candidate_advisory_metrics',
    'stage_candidate_advisory_metrics.v1',
  ],
  [
    'human_review_refs',
    'stage_candidate_human_review_refs',
    'stage_candidate_human_review_refs.v1',
  ],
] as const;

const AUTHORITY_BOUNDARY = {
  opl_role: 'stage_candidate_portfolio_refs_projection_owner',
  domain_role: 'domain_truth_quality_receipt_and_artifact_authority',
  portfolio_scope: 'refs_status_advisory_projection_only',
  holds_domain_truth: false,
  can_read_domain_body: false,
  can_write_domain_truth: false,
  can_authorize_candidate_acceptance: false,
  can_authorize_domain_ready: false,
  can_authorize_quality_verdict: false,
  can_mutate_artifact_body: false,
  can_accept_or_reject_owner_receipt: false,
  advisory_metrics_are_domain_verdict: false,
} as const;

const ADVISORY_METRICS_AUTHORITY_BOUNDARY = {
  opl_role: 'advisory_metric_ref_projection_only',
  metrics_scope: 'refs_status_advisory_only',
  metrics_are_domain_verdict: false,
  can_authorize_candidate_acceptance: false,
  can_authorize_domain_ready: false,
  can_authorize_quality_verdict: false,
  can_rank_as_domain_truth: false,
} as const;

function stringList(value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value];
  }
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function validationError(
  code: StageCandidatePortfolioValidationError['code'],
  path: string,
  message: string,
): StageCandidatePortfolioValidationError {
  return { code, path, message };
}

function collectForbiddenBodyErrors(
  value: unknown,
  path: string,
  errors: StageCandidatePortfolioValidationError[],
) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectForbiddenBodyErrors(entry, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    const childPath = path === '$' ? `$.${key}` : `${path}.${key}`;
    if (key === 'domain_body' || key === 'candidate_body' || key === 'evidence_body') {
      errors.push(validationError(
        'domain_body_forbidden',
        childPath,
        'OPL stage candidate portfolios are refs/status/projection only and must not carry domain body.',
      ));
      continue;
    }
    if (key === 'body' || key === 'content' || key === 'payload_body' || key === 'artifact_body') {
      errors.push(validationError(
        'ref_body_forbidden',
        childPath,
        'OPL stage candidate portfolios must carry refs only; body-like payload fields are forbidden.',
      ));
      continue;
    }
    if (key === 'body_included' && entry !== false) {
      errors.push(validationError(
        'ref_body_forbidden',
        childPath,
        'body_included must be false for every stage candidate portfolio ref.',
      ));
      continue;
    }
    collectForbiddenBodyErrors(entry, childPath, errors);
  }
}

function validateBoundary(
  value: unknown,
  expectedBoundary: Readonly<JsonRecord>,
  path: string,
  errors: StageCandidatePortfolioValidationError[],
) {
  const boundary = record(value);
  for (const [key, expected] of Object.entries(expectedBoundary)) {
    if (boundary[key] !== expected) {
      errors.push(validationError(
        'authority_boundary_invalid',
        `${path}.${key}`,
        `${key} must be ${String(expected)}.`,
      ));
    }
  }
}

export function validateStageCandidatePortfolio(
  value: unknown,
): StageCandidatePortfolioValidation {
  const errors: StageCandidatePortfolioValidationError[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      errors: [validationError('root_not_object', '$', 'Stage candidate portfolio must be an object.')],
    };
  }

  if (value.surface_kind !== 'stage_candidate_portfolio') {
    errors.push(validationError(
      'surface_kind_invalid',
      '$.surface_kind',
      'surface_kind must be stage_candidate_portfolio.',
    ));
  }
  if (value.version !== 'stage_candidate_portfolio.v1') {
    errors.push(validationError(
      'version_invalid',
      '$.version',
      'version must be stage_candidate_portfolio.v1.',
    ));
  }

  for (const [field, surfaceKind, version] of REQUIRED_SURFACES) {
    const surface = value[field];
    if (!isRecord(surface)) {
      errors.push(validationError('surface_missing', `$.${field}`, `${field} must be an object.`));
      continue;
    }
    if (surface.surface_kind !== surfaceKind || surface.version !== version) {
      errors.push(validationError(
        'surface_version_invalid',
        `$.${field}`,
        `${field} must use ${surfaceKind}/${version}.`,
      ));
    }
  }

  validateBoundary(value.authority_boundary, AUTHORITY_BOUNDARY, '$.authority_boundary', errors);
  validateBoundary(
    record(value.advisory_metrics).authority_boundary,
    ADVISORY_METRICS_AUTHORITY_BOUNDARY,
    '$.advisory_metrics.authority_boundary',
    errors,
  );
  collectForbiddenBodyErrors(value, '$', errors);

  return { valid: errors.length === 0, errors };
}

function surfaceRefRecords(portfolio: JsonRecord) {
  return [
    ...recordList(portfolio.stage_context_refs).map((ref) => ({
      source_surface: 'stage_candidate_portfolio.stage_context_refs',
      ref,
    })),
    ...recordList(portfolio.related_evidence_pack_refs).map((ref) => ({
      source_surface: 'stage_candidate_portfolio.related_evidence_pack_refs',
      ref,
    })),
    ...recordList(portfolio.stage_candidates).flatMap((candidate) =>
      recordList(candidate.evidence_refs).map((ref) => ({
        source_surface: 'stage_candidate_portfolio.stage_candidates.evidence_refs',
        ref,
      }))
    ),
  ];
}

function scalarRefSummaries(sourceSurface: string, values: unknown, role: string) {
  return stringList(values).map((ref) => ({
    ref,
    source_surface: sourceSurface,
    ref_id: null,
    role,
    ref_kind: 'logical_ref',
    status: null,
    required: null,
  }));
}

function refSummary(sourceSurface: string, ref: JsonRecord): StageCandidatePortfolioRef | null {
  const refValue = optionalString(ref.ref);
  if (!refValue) {
    return null;
  }
  return {
    ref: refValue,
    source_surface: sourceSurface,
    ref_id: optionalString(ref.ref_id),
    role: optionalString(ref.role),
    ref_kind: optionalString(ref.ref_kind),
    status: optionalString(ref.status),
    required: typeof ref.required === 'boolean' ? ref.required : null,
  };
}

function unique<T>(values: T[]) {
  return [...new Set(values.filter(Boolean))] as NonNullable<T>[];
}

function uniqueRefs(refs: StageCandidatePortfolioRef[]) {
  const seen = new Set<string>();
  return refs.filter((entry) => {
    const key = `${entry.source_surface}\0${entry.ref}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function portfolioRefs(
  portfolio: JsonRecord,
  surfaceRefs: Array<{ source_surface: string; ref: JsonRecord }>,
) {
  const assumptions = record(portfolio.assumption_decomposition).assumptions;
  const provenanceChecks = record(portfolio.provenance_checks).checks;
  const ledger = record(portfolio.negative_path_ledger);
  const metrics = record(portfolio.advisory_metrics);
  const reviews = record(portfolio.human_review_refs);
  const candidateRefs = recordList(portfolio.stage_candidates).flatMap((candidate) => [
    ...scalarRefSummaries(
      'stage_candidate_portfolio.stage_candidates.candidate_ref',
      optionalString(candidate.candidate_ref),
      'candidate',
    ),
    ...scalarRefSummaries(
      'stage_candidate_portfolio.stage_candidates.rationale_ref',
      optionalString(candidate.rationale_ref),
      'rationale',
    ),
    ...scalarRefSummaries(
      'stage_candidate_portfolio.stage_candidates.origin_ref',
      optionalString(candidate.origin_ref),
      'origin',
    ),
    ...scalarRefSummaries(
      'stage_candidate_portfolio.stage_candidates.owner_ref',
      optionalString(candidate.owner_ref),
      'owner',
    ),
  ]);
  const assumptionRefs = recordList(assumptions).flatMap((entry) => [
    ...scalarRefSummaries(
      'stage_candidate_assumption_refs.assumptions.assumption_ref',
      optionalString(entry.assumption_ref),
      'assumption',
    ),
    ...scalarRefSummaries(
      'stage_candidate_assumption_refs.assumptions.support_ref_ids',
      entry.support_ref_ids,
      'support_ref_id',
    ),
    ...scalarRefSummaries(
      'stage_candidate_assumption_refs.assumptions.contradiction_ref_ids',
      entry.contradiction_ref_ids,
      'contradiction_ref_id',
    ),
    ...scalarRefSummaries(
      'stage_candidate_assumption_refs.assumptions.owner_ref',
      optionalString(entry.owner_ref),
      'owner',
    ),
  ]);
  const provenanceRefs = recordList(provenanceChecks).flatMap((entry) => [
    ...scalarRefSummaries(
      'stage_candidate_provenance_checks.checks.check_ref',
      optionalString(entry.check_ref),
      'provenance_check',
    ),
    ...scalarRefSummaries(
      'stage_candidate_provenance_checks.checks.source_ref_ids',
      entry.source_ref_ids,
      'source_ref_id',
    ),
    ...scalarRefSummaries(
      'stage_candidate_provenance_checks.checks.result_ref',
      optionalString(entry.result_ref),
      'provenance_result',
    ),
    ...scalarRefSummaries(
      'stage_candidate_provenance_checks.checks.owner_ref',
      optionalString(entry.owner_ref),
      'owner',
    ),
  ]);
  const failedPathRefs = recordList(ledger.failed_paths).flatMap((entry) => [
    ...scalarRefSummaries(
      'stage_candidate_negative_path_ledger.failed_paths.failed_path_ref',
      optionalString(entry.failed_path_ref),
      'failed_path',
    ),
    ...scalarRefSummaries(
      'stage_candidate_negative_path_ledger.failed_paths.owner_ref',
      optionalString(entry.owner_ref),
      'owner',
    ),
  ]);
  const negativeResultRefs = recordList(ledger.negative_results).flatMap((entry) => [
    ...scalarRefSummaries(
      'stage_candidate_negative_path_ledger.negative_results.result_ref',
      optionalString(entry.result_ref),
      'negative_result',
    ),
    ...scalarRefSummaries(
      'stage_candidate_negative_path_ledger.negative_results.owner_ref',
      optionalString(entry.owner_ref),
      'owner',
    ),
  ]);
  const advisoryRefs = [
    ...recordList(metrics.metrics).flatMap((entry) => [
      ...scalarRefSummaries(
        'stage_candidate_advisory_metrics.metrics.metric_ref',
        optionalString(entry.metric_ref),
        'advisory_metric',
      ),
      ...scalarRefSummaries(
        'stage_candidate_advisory_metrics.metrics.source_ref_ids',
        entry.source_ref_ids,
        'advisory_source_ref_id',
      ),
      ...scalarRefSummaries(
        'stage_candidate_advisory_metrics.metrics.owner_ref',
        optionalString(entry.owner_ref),
        'owner',
      ),
    ]),
    ...recordList(metrics.rankings).flatMap((entry) => [
      ...scalarRefSummaries(
        'stage_candidate_advisory_metrics.rankings.ranking_ref',
        optionalString(entry.ranking_ref),
        'advisory_ranking',
      ),
      ...scalarRefSummaries(
        'stage_candidate_advisory_metrics.rankings.candidate_ref_ids',
        entry.candidate_ref_ids,
        'candidate_ref_id',
      ),
      ...scalarRefSummaries(
        'stage_candidate_advisory_metrics.rankings.owner_ref',
        optionalString(entry.owner_ref),
        'owner',
      ),
    ]),
  ];
  const reviewRefs = recordList(reviews.reviews).flatMap((entry) => [
    ...scalarRefSummaries(
      'stage_candidate_human_review_refs.reviews.reviewer_owner_ref',
      optionalString(entry.reviewer_owner_ref),
      'reviewer_owner',
    ),
    ...scalarRefSummaries(
      'stage_candidate_human_review_refs.reviews.request_ref',
      optionalString(entry.request_ref),
      'review_request',
    ),
    ...scalarRefSummaries(
      'stage_candidate_human_review_refs.reviews.decision_ref',
      optionalString(entry.decision_ref),
      'review_decision',
    ),
    ...scalarRefSummaries(
      'stage_candidate_human_review_refs.reviews.route_back_ref',
      optionalString(entry.route_back_ref),
      'route_back',
    ),
  ]);

  return uniqueRefs([
    ...surfaceRefs
      .map(({ source_surface, ref }) => refSummary(source_surface, ref))
      .filter((entry): entry is StageCandidatePortfolioRef => Boolean(entry)),
    ...candidateRefs,
    ...assumptionRefs,
    ...provenanceRefs,
    ...failedPathRefs,
    ...negativeResultRefs,
    ...advisoryRefs,
    ...reviewRefs,
  ]);
}

function missingRefs(
  refs: Array<{ source_surface: string; ref: JsonRecord }>,
): StageCandidatePortfolioMissingRef[] {
  const seen = new Set<string>();
  return refs
    .filter(({ ref }) => ref.required === true && optionalString(ref.status) !== 'present')
    .flatMap(({ source_surface, ref }) => {
      const refId = optionalString(ref.ref_id);
      const refValue = optionalString(ref.ref);
      const key = `${refId ?? ''}\0${refValue ?? ''}`;
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [{
        ref_id: refId,
        role: optionalString(ref.role),
        ref_kind: optionalString(ref.ref_kind),
        ref: refValue,
        source_surface,
        status: optionalString(ref.status),
      }];
    });
}

function statusCounts(entries: JsonRecord[]) {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const status = optionalString(entry.status) ?? 'unknown';
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export function summarizeStageCandidatePortfolio(
  value: unknown,
): StageCandidatePortfolioSummary {
  const validation = validateStageCandidatePortfolio(value);
  if (!validation.valid) {
    throw new Error(
      `Stage candidate portfolio failed fail-closed validation: ${
        validation.errors.map((error) => error.code).join(', ')
      }`,
    );
  }
  const portfolio = value as JsonRecord;
  const candidates = recordList(portfolio.stage_candidates);
  const assumptions = recordList(record(portfolio.assumption_decomposition).assumptions);
  const provenanceChecks = recordList(record(portfolio.provenance_checks).checks);
  const ledger = record(portfolio.negative_path_ledger);
  const metrics = record(portfolio.advisory_metrics);
  const reviews = recordList(record(portfolio.human_review_refs).reviews);
  const surfaceRefs = surfaceRefRecords(portfolio);
  const refs = portfolioRefs(portfolio, surfaceRefs);

  return {
    surface_kind: 'stage_candidate_portfolio_summary',
    version: 'stage_candidate_portfolio_summary.v1',
    portfolio_id: optionalString(portfolio.portfolio_id),
    target_domain_id: optionalString(portfolio.target_domain_id),
    portfolio_status: optionalString(portfolio.portfolio_status),
    portfolio_refs: refs,
    missing_refs: missingRefs(surfaceRefs),
    candidate_count: candidates.length,
    candidate_status_counts: statusCounts(candidates),
    assumption_count: assumptions.length,
    provenance_check_count: provenanceChecks.length,
    failed_path_count: recordList(ledger.failed_paths).length,
    negative_result_count: recordList(ledger.negative_results).length,
    advisory_metric_count: recordList(metrics.metrics).length,
    advisory_ranking_count: recordList(metrics.rankings).length,
    human_review_count: reviews.length,
    pending_human_review_count: reviews.filter((review) =>
      ['requested', 'ready', 'blocked', 'route_back'].includes(optionalString(review.status) ?? '')
    ).length,
    advisory_refs: unique([
      ...recordList(metrics.metrics).map((metric) => optionalString(metric.metric_ref)),
      ...recordList(metrics.rankings).map((ranking) => optionalString(ranking.ranking_ref)),
    ]),
    human_review_request_refs: unique(reviews.map((review) => optionalString(review.request_ref))),
    human_review_decision_refs: unique(reviews.map((review) => optionalString(review.decision_ref))),
    route_back_refs: unique(reviews.map((review) => optionalString(review.route_back_ref))),
    owner_refs: unique(refs.filter((entry) => entry.role?.includes('owner')).map((entry) => entry.ref)),
    authority_boundary: { ...AUTHORITY_BOUNDARY },
    advisory_metrics_authority_boundary: { ...ADVISORY_METRICS_AUTHORITY_BOUNDARY },
  };
}
