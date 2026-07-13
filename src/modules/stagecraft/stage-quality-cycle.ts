import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export const STAGE_QUALITY_ATTEMPT_ROLES = [
  'producer',
  'reviewer',
  'repairer',
  're_reviewer',
] as const;

export type StageQualityAttemptRole = typeof STAGE_QUALITY_ATTEMPT_ROLES[number];
export type StageQualityReviewVerdict = 'pass' | 'repair_required' | 'quality_debt' | 'hard_stop';
export type StageQualityRiskTier = 'low' | 'medium' | 'high';
export type StageQualityReviewDepth = 'focused' | 'full' | 'multi_axis';

export type StageQualityCyclePolicy = {
  surface_kind: 'opl_stage_quality_cycle_policy';
  version: 'stage-quality-cycle-policy.v1';
  in_thread_refinement: {
    allowed: boolean;
    authoritative: false;
  };
  formal_review: {
    required: boolean;
    risk_tier: StageQualityRiskTier;
    review_depth: StageQualityReviewDepth;
    attempt_internal_parallel_review_facets_allowed: boolean;
    context_isolation_required: true;
    max_repair_rounds: number;
  };
  budget_exhaustion: 'complete_with_quality_debt_if_consumable';
};

export type StageReviewContextManifest = {
  surface_kind: 'opl_stage_review_context_manifest';
  version: 'stage-review-context-manifest.v1';
  stage_run_id: string;
  quality_cycle_id: string;
  reviewer_attempt_role: 'reviewer' | 're_reviewer';
  stage_goal_refs: string[];
  artifact_refs: string[];
  artifact_hashes: string[];
  source_refs: string[];
  quality_rubric_refs: string[];
  lineage_refs: string[];
  prior_finding_refs: string[];
  no_context_inheritance: true;
  forbidden_context_kinds: string[];
};

export type StageReviewReceipt = {
  surface_kind: 'opl_stage_review_receipt';
  version: 'stage-review-receipt.v1';
  stage_run_id: string;
  quality_cycle_id: string;
  producer_attempt_ref: string;
  reviewer_attempt_ref: string;
  producer_session_ref: string;
  reviewer_session_ref: string;
  no_context_inheritance: true;
  reviewed_artifact_refs: string[];
  reviewed_artifact_hashes: string[];
  rubric_refs: string[];
  verdict: StageQualityReviewVerdict;
};

export type StageQualityCycleState = {
  surface_kind: 'opl_stage_quality_cycle_state';
  version: 'stage-quality-cycle-state.v1';
  stage_run_id: string;
  quality_cycle_id: string;
  max_repair_rounds: number;
  repair_rounds_used: number;
  current_role: StageQualityAttemptRole | null;
  status: 'awaiting_producer' | 'awaiting_review' | 'awaiting_repair' | 'passed' | 'quality_debt' | 'hard_stopped';
  selected_artifact_refs: string[];
  quality_debt_refs: string[];
};

export type StageQualityFinding = {
  finding_id: string;
  severity: 'critical' | 'major' | 'minor';
  required: boolean;
  evidence_refs: string[];
  repair_expectation: string;
};

export type StageQualityRepairMapEntry = {
  finding_id: string;
  repair_status: 'repaired' | 'not_repaired' | 'blocked';
  changed_artifact_refs: string[];
  repair_evidence_refs: string[];
};

export type StageQualityFindingClosure = {
  finding_id: string;
  status: 'closed' | 'partially_closed' | 'still_open';
  evidence_refs: string[];
};

export type StageQualityReReviewResult = {
  finding_closures: StageQualityFindingClosure[];
  repair_regressions: StageQualityFinding[];
  critical_new_findings: StageQualityFinding[];
  optional_observations: Array<{
    observation_id: string;
    evidence_refs: string[];
    summary: string;
  }>;
};

function nonEmptyStrings(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain non-empty string refs.`, {
      field,
    });
  }
  return [...new Set(value.map((entry) => entry.trim()))];
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

export function normalizeStageQualityAttemptRole(value: unknown): StageQualityAttemptRole {
  if (typeof value === 'string' && STAGE_QUALITY_ATTEMPT_ROLES.includes(value as StageQualityAttemptRole)) {
    return value as StageQualityAttemptRole;
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Unknown Stage quality attempt role.', {
    attempt_role: value ?? null,
    allowed: STAGE_QUALITY_ATTEMPT_ROLES,
  });
}

export function normalizeStageQualityCyclePolicy(value: unknown): StageQualityCyclePolicy {
  const input = typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const refinement = typeof input.in_thread_refinement === 'object' && input.in_thread_refinement !== null
    ? input.in_thread_refinement as Record<string, unknown>
    : {};
  const review = typeof input.formal_review === 'object' && input.formal_review !== null
    ? input.formal_review as Record<string, unknown>
    : {};
  const riskTier = review.risk_tier ?? 'medium';
  const reviewDepth = review.review_depth ?? (riskTier === 'low' ? 'focused' : riskTier === 'high' ? 'multi_axis' : 'full');
  const maxRepairRounds = review.max_repair_rounds ?? 3;
  if (!['low', 'medium', 'high'].includes(String(riskTier))) {
    throw new FrameworkContractError('contract_shape_invalid', 'formal_review.risk_tier is invalid.', { risk_tier: riskTier });
  }
  if (!['focused', 'full', 'multi_axis'].includes(String(reviewDepth))) {
    throw new FrameworkContractError('contract_shape_invalid', 'formal_review.review_depth is invalid.', { review_depth: reviewDepth });
  }
  if (!Number.isInteger(maxRepairRounds) || Number(maxRepairRounds) < 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'formal_review.max_repair_rounds must be a non-negative integer.');
  }
  return {
    surface_kind: 'opl_stage_quality_cycle_policy',
    version: 'stage-quality-cycle-policy.v1',
    in_thread_refinement: {
      allowed: refinement.allowed !== false,
      authoritative: false,
    },
    formal_review: {
      required: review.required === true,
      risk_tier: riskTier as StageQualityRiskTier,
      review_depth: reviewDepth as StageQualityReviewDepth,
      attempt_internal_parallel_review_facets_allowed: riskTier === 'high',
      context_isolation_required: true,
      max_repair_rounds: Number(maxRepairRounds),
    },
    budget_exhaustion: 'complete_with_quality_debt_if_consumable',
  };
}

export function buildStageReviewContextManifest(input: {
  stageRunId: string;
  qualityCycleId: string;
  reviewerAttemptRole: StageReviewContextManifest['reviewer_attempt_role'];
  stageGoalRefs?: string[];
  artifactRefs: string[];
  artifactHashes: string[];
  sourceRefs?: string[];
  qualityRubricRefs: string[];
  lineageRefs?: string[];
  priorFindingRefs?: string[];
}): StageReviewContextManifest {
  const artifactRefs = nonEmptyStrings(input.artifactRefs, 'artifact_refs');
  const artifactHashes = nonEmptyStrings(input.artifactHashes, 'artifact_hashes');
  if (artifactRefs.length !== artifactHashes.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review artifact refs and hashes must have equal cardinality.');
  }
  return {
    surface_kind: 'opl_stage_review_context_manifest',
    version: 'stage-review-context-manifest.v1',
    stage_run_id: requiredText(input.stageRunId, 'stage_run_id'),
    quality_cycle_id: requiredText(input.qualityCycleId, 'quality_cycle_id'),
    reviewer_attempt_role: input.reviewerAttemptRole,
    stage_goal_refs: nonEmptyStrings(input.stageGoalRefs ?? [], 'stage_goal_refs'),
    artifact_refs: artifactRefs,
    artifact_hashes: artifactHashes,
    source_refs: nonEmptyStrings(input.sourceRefs ?? [], 'source_refs'),
    quality_rubric_refs: nonEmptyStrings(input.qualityRubricRefs, 'quality_rubric_refs'),
    lineage_refs: nonEmptyStrings(input.lineageRefs ?? [], 'lineage_refs'),
    prior_finding_refs: nonEmptyStrings(input.priorFindingRefs ?? [], 'prior_finding_refs'),
    no_context_inheritance: true,
    forbidden_context_kinds: [
      'producer_conversation_history',
      'producer_thread_resume',
      'reviewer_thread_resume',
      'chain_of_thought',
      'undeclared_ephemeral_context',
    ],
  };
}

export function validateIndependentStageReviewReceipt(receipt: StageReviewReceipt) {
  requiredText(receipt.producer_attempt_ref, 'producer_attempt_ref');
  requiredText(receipt.reviewer_attempt_ref, 'reviewer_attempt_ref');
  const producerSessionRef = requiredText(receipt.producer_session_ref, 'producer_session_ref');
  const reviewerSessionRef = requiredText(receipt.reviewer_session_ref, 'reviewer_session_ref');
  if (receipt.no_context_inheritance !== true) {
    throw new FrameworkContractError('contract_shape_invalid', 'Formal Stage Review must declare no_context_inheritance=true.');
  }
  if (producerSessionRef === reviewerSessionRef) {
    throw new FrameworkContractError('contract_shape_invalid', 'Formal Stage Review must use a new provider session.', {
      producer_session_ref: producerSessionRef,
      reviewer_session_ref: reviewerSessionRef,
    });
  }
  const refs = nonEmptyStrings(receipt.reviewed_artifact_refs, 'reviewed_artifact_refs');
  const hashes = nonEmptyStrings(receipt.reviewed_artifact_hashes, 'reviewed_artifact_hashes');
  if (refs.length !== hashes.length) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review receipt artifact refs and hashes must have equal cardinality.');
  }
  nonEmptyStrings(receipt.rubric_refs, 'rubric_refs');
  return {
    valid: true,
    context_isolation_verified: true,
    reviewer_session_diff_verified: true,
  } as const;
}

function uniqueIds(values: string[], field: string) {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} contains a duplicate id.`, {
      field,
      duplicate_id: duplicate,
    });
  }
}

export function validateStageQualityFindings(findings: StageQualityFinding[]) {
  if (!Array.isArray(findings)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage Review findings must be an array.');
  }
  const normalized = findings.map((finding) => {
    const findingId = requiredText(finding.finding_id, 'finding_id');
    if (!['critical', 'major', 'minor'].includes(finding.severity)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage Review finding severity is invalid.', {
        finding_id: findingId,
        severity: finding.severity,
      });
    }
    if (typeof finding.required !== 'boolean') {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage Review finding required must be boolean.', {
        finding_id: findingId,
      });
    }
    return {
      ...finding,
      finding_id: findingId,
      evidence_refs: nonEmptyStrings(finding.evidence_refs, `findings.${findingId}.evidence_refs`),
      repair_expectation: requiredText(
        finding.repair_expectation,
        `findings.${findingId}.repair_expectation`,
      ),
    };
  });
  uniqueIds(normalized.map((finding) => finding.finding_id), 'findings');
  return normalized;
}

export function validateStageQualityRepairMap(input: {
  findings: StageQualityFinding[];
  repairMap: StageQualityRepairMapEntry[];
}) {
  const findings = validateStageQualityFindings(input.findings);
  if (!Array.isArray(input.repairMap)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage repair_map must be an array.');
  }
  const requiredIds = new Set(findings.filter((finding) => finding.required).map((finding) => finding.finding_id));
  const normalized = input.repairMap.map((entry) => {
    const findingId = requiredText(entry.finding_id, 'repair_map.finding_id');
    if (!requiredIds.has(findingId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'repair_map references a non-required finding.', {
        finding_id: findingId,
      });
    }
    if (!['repaired', 'not_repaired', 'blocked'].includes(entry.repair_status)) {
      throw new FrameworkContractError('contract_shape_invalid', 'repair_map repair_status is invalid.', {
        finding_id: findingId,
        repair_status: entry.repair_status,
      });
    }
    return {
      ...entry,
      finding_id: findingId,
      changed_artifact_refs: nonEmptyStrings(
        entry.changed_artifact_refs,
        `repair_map.${findingId}.changed_artifact_refs`,
      ),
      repair_evidence_refs: nonEmptyStrings(
        entry.repair_evidence_refs,
        `repair_map.${findingId}.repair_evidence_refs`,
      ),
    };
  });
  uniqueIds(normalized.map((entry) => entry.finding_id), 'repair_map');
  const missing = [...requiredIds].filter((findingId) =>
    !normalized.some((entry) => entry.finding_id === findingId)
  );
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'repair_map must cover every required finding.', {
      missing_finding_ids: missing,
    });
  }
  return normalized;
}

export function evaluateStageQualityFindingClosure(input: {
  findings: StageQualityFinding[];
  repairMap: StageQualityRepairMapEntry[];
  reReview: StageQualityReReviewResult;
}) {
  const findings = validateStageQualityFindings(input.findings);
  validateStageQualityRepairMap({ findings, repairMap: input.repairMap });
  const requiredIds = new Set(findings.filter((finding) => finding.required).map((finding) => finding.finding_id));
  if (!Array.isArray(input.reReview.finding_closures)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Re-review finding_closures must be an array.');
  }
  const closures = input.reReview.finding_closures.map((closure) => {
    const findingId = requiredText(closure.finding_id, 'finding_closures.finding_id');
    if (!requiredIds.has(findingId)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Re-review closure references an unknown required finding.', {
        finding_id: findingId,
      });
    }
    if (!['closed', 'partially_closed', 'still_open'].includes(closure.status)) {
      throw new FrameworkContractError('contract_shape_invalid', 'Re-review closure status is invalid.', {
        finding_id: findingId,
        status: closure.status,
      });
    }
    return {
      ...closure,
      finding_id: findingId,
      evidence_refs: nonEmptyStrings(
        closure.evidence_refs,
        `finding_closures.${findingId}.evidence_refs`,
      ),
    };
  });
  uniqueIds(closures.map((closure) => closure.finding_id), 'finding_closures');
  const missing = [...requiredIds].filter((findingId) =>
    !closures.some((closure) => closure.finding_id === findingId)
  );
  if (missing.length > 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'Re-review must close or retain every required finding.', {
      missing_finding_ids: missing,
    });
  }
  const regressions = validateStageQualityFindings(input.reReview.repair_regressions);
  const criticalNewFindings = validateStageQualityFindings(input.reReview.critical_new_findings);
  if (criticalNewFindings.some((finding) => finding.severity !== 'critical')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'critical_new_findings may contain only critical findings.',
    );
  }
  const openFindingIds = closures
    .filter((closure) => closure.status !== 'closed')
    .map((closure) => closure.finding_id);
  return {
    trigger_repair: openFindingIds.length > 0 || regressions.length > 0 || criticalNewFindings.length > 0,
    open_required_finding_ids: openFindingIds,
    repair_regression_ids: regressions.map((finding) => finding.finding_id),
    critical_new_finding_ids: criticalNewFindings.map((finding) => finding.finding_id),
    optional_observations_are_quality_debt_only: true,
  } as const;
}

export function initialStageQualityCycleState(input: {
  stageRunId: string;
  qualityCycleId: string;
  maxRepairRounds?: number;
}): StageQualityCycleState {
  const maxRepairRounds = input.maxRepairRounds ?? 3;
  if (!Number.isInteger(maxRepairRounds) || maxRepairRounds < 0) {
    throw new FrameworkContractError('contract_shape_invalid', 'maxRepairRounds must be a non-negative integer.');
  }
  return {
    surface_kind: 'opl_stage_quality_cycle_state',
    version: 'stage-quality-cycle-state.v1',
    stage_run_id: requiredText(input.stageRunId, 'stage_run_id'),
    quality_cycle_id: requiredText(input.qualityCycleId, 'quality_cycle_id'),
    max_repair_rounds: maxRepairRounds,
    repair_rounds_used: 0,
    current_role: 'producer',
    status: 'awaiting_producer',
    selected_artifact_refs: [],
    quality_debt_refs: [],
  };
}

export function reduceStageQualityCycleState(
  state: StageQualityCycleState,
  event:
    | { kind: 'producer_completed'; artifact_refs: string[] }
    | { kind: 'review_completed'; verdict: StageQualityReviewVerdict; quality_debt_refs?: string[] }
    | { kind: 'repair_completed'; artifact_refs: string[] }
    | { kind: 'hard_stop' },
): StageQualityCycleState {
  if (['passed', 'quality_debt', 'hard_stopped'].includes(state.status)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Terminal Stage quality cycle cannot consume another event.', {
      status: state.status,
    });
  }
  if (event.kind === 'producer_completed') {
    if (state.status !== 'awaiting_producer') {
      throw new FrameworkContractError('contract_shape_invalid', 'producer_completed is out of order.');
    }
    return { ...state, status: 'awaiting_review', current_role: 'reviewer', selected_artifact_refs: nonEmptyStrings(event.artifact_refs, 'artifact_refs') };
  }
  if (event.kind === 'repair_completed') {
    if (state.status !== 'awaiting_repair') {
      throw new FrameworkContractError('contract_shape_invalid', 'repair_completed is out of order.');
    }
    return {
      ...state,
      repair_rounds_used: state.repair_rounds_used + 1,
      status: 'awaiting_review',
      current_role: 're_reviewer',
      selected_artifact_refs: nonEmptyStrings(event.artifact_refs, 'artifact_refs'),
    };
  }
  if (event.kind === 'hard_stop' || event.verdict === 'hard_stop') {
    return { ...state, status: 'hard_stopped', current_role: null };
  }
  if (event.verdict === 'pass') {
    return { ...state, status: 'passed', current_role: null };
  }
  const debtRefs = nonEmptyStrings(event.quality_debt_refs ?? [], 'quality_debt_refs');
  if (event.verdict === 'quality_debt' || state.repair_rounds_used >= state.max_repair_rounds) {
    if (state.selected_artifact_refs.length === 0) {
      return { ...state, status: 'hard_stopped', current_role: null };
    }
    return { ...state, status: 'quality_debt', current_role: null, quality_debt_refs: debtRefs };
  }
  return { ...state, status: 'awaiting_repair', current_role: 'repairer', quality_debt_refs: debtRefs };
}

export function classifyCodexSessionContinuation(input: {
  attemptRole: StageQualityAttemptRole;
  resumedThreadId?: string | null;
}) {
  return input.resumedThreadId
    ? {
        continuation_kind: 'protocol_closeout_resume' as const,
        counts_as_review_attempt: false,
        consumes_quality_revision_budget: false,
      }
    : {
        continuation_kind: 'new_stage_attempt_thread' as const,
        counts_as_review_attempt: ['reviewer', 're_reviewer'].includes(input.attemptRole),
        consumes_quality_revision_budget: input.attemptRole === 'repairer',
      };
}
