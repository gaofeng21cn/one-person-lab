import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import {
  normalizeStageQualityScopeBudget,
  type StageQualityScopeBudget,
  type StageQualityScopeBudgetStopReason,
} from './stage-quality-scope-budget.ts';

export const STAGE_QUALITY_ATTEMPT_ROLES = [
  'producer',
  'reviewer',
  'repairer',
  're_reviewer',
] as const;

export const STAGE_QUALITY_OUTCOMES = [
  'pass',
  'repair_required',
  'quality_debt',
  'blocked',
  'human_gate',
] as const;

export const STAGE_QUALITY_HARD_STOP_CLASSES = [
  'zero_consumable_artifact',
  'safety_or_compliance',
  'permission_or_credential_boundary',
  'human_decision_required',
  'authority_boundary_violation',
  'stale_or_mismatched_stage_identity',
] as const;

export type StageQualityAttemptRole = typeof STAGE_QUALITY_ATTEMPT_ROLES[number];
export type StageQualityReviewAttemptRole = Extract<StageQualityAttemptRole, 'reviewer' | 're_reviewer'>;
export type StageQualityOutcome = typeof STAGE_QUALITY_OUTCOMES[number];
export type StageQualityHardStopClass = typeof STAGE_QUALITY_HARD_STOP_CLASSES[number];
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
    scope_budget: StageQualityScopeBudget;
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
  repair_map_refs: string[];
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
  review_input_snapshot_status: 'materialized' | 'already_materialized' | 'quality_debt';
  review_input_snapshot_binding: Record<string, unknown> | null;
  opl_reviewer_input_snapshot_manifest_ref: Record<string, unknown> | null;
  opl_reviewer_input_snapshot_manifest: Record<string, unknown> | null;
  review_input_snapshot_quality_debt_receipt_ref: string | null;
  review_input_snapshot_quality_debt_receipt: Record<string, unknown> | null;
  opl_review_evidence_artifact_receipt_ref: Record<string, unknown> | null;
  opl_review_evidence_artifact_receipt: Record<string, unknown> | null;
  finding_lineage: {
    review_kind: 'initial_review' | 'finding_closure_review';
    finding_ids: string[];
    findings_sha256: string;
    repair_map_sha256: string | null;
    re_review_result_sha256: string | null;
  };
  revision_transport?: Record<string, unknown>;
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
  quality_scope_budget?: StageQualityScopeBudget;
  quality_scope_budget_usage?: {
    attempts_used: number;
    elapsed_ms: number;
    tokens_used: number | null;
    token_observation_status: 'observed' | 'missing';
  } | null;
  quality_scope_budget_stop_reason?: StageQualityScopeBudgetStopReason | null;
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

function nonEmptyStringSequence(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must contain non-empty strings.`, {
      field,
    });
  }
  return value.map((entry) => entry.trim());
}

export function normalizeStageQualityArtifactIdentity(input: {
  artifactRefs: unknown;
  artifactHashes: unknown;
  allowEmpty?: boolean;
}) {
  const artifactRefs = nonEmptyStringSequence(input.artifactRefs, 'artifact_refs');
  const artifactHashes = nonEmptyStringSequence(input.artifactHashes, 'artifact_hashes');
  if (artifactRefs.length !== artifactHashes.length) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Artifact refs and hashes must have equal cardinality.',
      { artifact_ref_count: artifactRefs.length, artifact_hash_count: artifactHashes.length },
    );
  }
  if (!input.allowEmpty && artifactRefs.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Artifact identity requires at least one exact ref and hash pair.',
    );
  }
  uniqueIds(artifactRefs, 'artifact_refs');
  return { artifact_refs: artifactRefs, artifact_hashes: artifactHashes } as const;
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} must be a non-empty string.`, { field });
  }
  return value.trim();
}

function requiredRefs(value: unknown, field: string) {
  const normalized = nonEmptyStrings(value, field);
  if (normalized.length === 0) {
    throw new FrameworkContractError('contract_shape_invalid', `${field} requires at least one ref.`, { field });
  }
  return normalized;
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

export function normalizeStageQualityOutcome(value: unknown): StageQualityOutcome {
  if (typeof value === 'string' && STAGE_QUALITY_OUTCOMES.includes(value as StageQualityOutcome)) {
    return value as StageQualityOutcome;
  }
  throw new FrameworkContractError('contract_shape_invalid', 'Unknown Stage quality outcome.', {
    outcome: value ?? null,
    allowed: STAGE_QUALITY_OUTCOMES,
  });
}

export function stageQualityOutcomeFromEnvelope(input: {
  attemptRole: StageQualityReviewAttemptRole;
  envelope: Record<string, unknown>;
}) {
  if (Object.hasOwn(input.envelope, 'verdict')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality Attempt must return outcome; verdict is reserved for controller-generated review receipts.',
      {
        attempt_role: input.attemptRole,
        forbidden_field: 'verdict',
        required_field: 'outcome',
      },
    );
  }
  return normalizeStageQualityOutcome(input.envelope.outcome);
}

export function stageQualityAttemptOutcomeFromEnvelope(input: {
  attemptRole: StageQualityAttemptRole;
  envelope: Record<string, unknown>;
}) {
  if (input.attemptRole === 'reviewer' || input.attemptRole === 're_reviewer') {
    return stageQualityOutcomeFromEnvelope({
      attemptRole: input.attemptRole,
      envelope: input.envelope,
    });
  }
  const forbiddenFields = ['outcome', 'verdict'].filter((field) => Object.hasOwn(input.envelope, field));
  if (forbiddenFields.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Producer and repairer Stage quality Attempts must not return outcome or verdict.',
      {
        attempt_role: input.attemptRole,
        forbidden_fields: forbiddenFields,
        controller_owned_receipt_field: 'verdict',
      },
    );
  }
  return null;
}

function optionalEnvelopeRefs(
  envelope: Record<string, unknown>,
  singularField: string,
  pluralField: string,
) {
  const singularValue = envelope[singularField];
  const singular = typeof singularValue === 'string' && singularValue.trim()
    ? [singularValue.trim()]
    : [];
  const plural = Array.isArray(envelope[pluralField])
    ? envelope[pluralField].filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
      .map((entry) => entry.trim())
    : [];
  return [...new Set([...singular, ...plural])];
}

export function validateStageQualityReviewHardStopOutcome(input: {
  outcome: Extract<StageQualityOutcome, 'blocked' | 'human_gate'>;
  envelope: Record<string, unknown>;
}) {
  const hardStopClass = input.envelope.hard_stop_class;
  if (
    typeof hardStopClass !== 'string'
    || !STAGE_QUALITY_HARD_STOP_CLASSES.includes(hardStopClass as StageQualityHardStopClass)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review hard-stop outcome requires a declared canonical hard_stop_class.',
      {
        outcome: input.outcome,
        hard_stop_class: hardStopClass ?? null,
        allowed: STAGE_QUALITY_HARD_STOP_CLASSES,
      },
    );
  }
  const blockedReason = requiredText(input.envelope.blocked_reason, 'blocked_reason');
  const typedBlockerRefs = optionalEnvelopeRefs(input.envelope, 'typed_blocker_ref', 'typed_blocker_refs');
  const humanGateRefs = optionalEnvelopeRefs(input.envelope, 'human_gate_ref', 'human_gate_refs');
  if (input.outcome === 'blocked' && typedBlockerRefs.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review blocked outcome requires a domain-owned typed blocker ref.',
      { outcome: input.outcome, hard_stop_class: hardStopClass },
    );
  }
  if (
    input.outcome === 'human_gate'
    && (hardStopClass !== 'human_decision_required' || humanGateRefs.length === 0)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review human_gate outcome requires hard_stop_class=human_decision_required and a human-gate ref.',
      {
        outcome: input.outcome,
        hard_stop_class: hardStopClass,
        human_gate_refs: humanGateRefs,
      },
    );
  }
  return {
    outcome: input.outcome,
    hard_stop_class: hardStopClass as StageQualityHardStopClass,
    blocked_reason: blockedReason,
    typed_blocker_refs: typedBlockerRefs,
    human_gate_refs: humanGateRefs,
  } as const;
}

export function stageReviewVerdictForOutcome(outcome: StageQualityOutcome): StageQualityReviewVerdict {
  if (outcome === 'pass' || outcome === 'repair_required' || outcome === 'quality_debt') {
    return outcome;
  }
  return 'hard_stop';
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
      scope_budget: normalizeStageQualityScopeBudget(review.scope_budget, {
        legacyMaxRepairRounds: Number(maxRepairRounds),
      }),
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
  repairMapRefs?: string[];
}): StageReviewContextManifest {
  const artifactIdentity = normalizeStageQualityArtifactIdentity({
    artifactRefs: input.artifactRefs,
    artifactHashes: input.artifactHashes,
  });
  return {
    surface_kind: 'opl_stage_review_context_manifest',
    version: 'stage-review-context-manifest.v1',
    stage_run_id: requiredText(input.stageRunId, 'stage_run_id'),
    quality_cycle_id: requiredText(input.qualityCycleId, 'quality_cycle_id'),
    reviewer_attempt_role: input.reviewerAttemptRole,
    stage_goal_refs: nonEmptyStrings(input.stageGoalRefs ?? [], 'stage_goal_refs'),
    artifact_refs: artifactIdentity.artifact_refs,
    artifact_hashes: artifactIdentity.artifact_hashes,
    source_refs: nonEmptyStrings(input.sourceRefs ?? [], 'source_refs'),
    quality_rubric_refs: requiredRefs(input.qualityRubricRefs, 'quality_rubric_refs'),
    lineage_refs: nonEmptyStrings(input.lineageRefs ?? [], 'lineage_refs'),
    prior_finding_refs: nonEmptyStrings(input.priorFindingRefs ?? [], 'prior_finding_refs'),
    repair_map_refs: nonEmptyStrings(input.repairMapRefs ?? [], 'repair_map_refs'),
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
  if (receipt.surface_kind !== 'opl_stage_review_receipt' || receipt.version !== 'stage-review-receipt.v1') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review receipt surface kind and version are invalid.',
      { surface_kind: receipt.surface_kind, version: receipt.version },
    );
  }
  const snapshotMaterialized = receipt.review_input_snapshot_status === 'materialized'
    || receipt.review_input_snapshot_status === 'already_materialized';
  const snapshotBindingValid = receipt.review_input_snapshot_binding !== null
    && typeof receipt.review_input_snapshot_binding === 'object'
    && !Array.isArray(receipt.review_input_snapshot_binding)
    && receipt.review_input_snapshot_binding.surface_kind === 'opl_reviewer_input_snapshot_binding';
  const snapshotManifestRefValid = receipt.opl_reviewer_input_snapshot_manifest_ref !== null
    && typeof receipt.opl_reviewer_input_snapshot_manifest_ref === 'object'
    && !Array.isArray(receipt.opl_reviewer_input_snapshot_manifest_ref);
  const snapshotManifestValid = receipt.opl_reviewer_input_snapshot_manifest !== null
    && typeof receipt.opl_reviewer_input_snapshot_manifest === 'object'
    && !Array.isArray(receipt.opl_reviewer_input_snapshot_manifest)
    && receipt.opl_reviewer_input_snapshot_manifest.surface_kind
      === 'opl_reviewer_input_snapshot_manifest';
  const snapshotDebtValid = typeof receipt.review_input_snapshot_quality_debt_receipt_ref === 'string'
    && receipt.review_input_snapshot_quality_debt_receipt_ref.length > 0
    && receipt.review_input_snapshot_quality_debt_receipt !== null
    && typeof receipt.review_input_snapshot_quality_debt_receipt === 'object'
    && !Array.isArray(receipt.review_input_snapshot_quality_debt_receipt)
    && receipt.review_input_snapshot_quality_debt_receipt.surface_kind
      === 'opl_review_input_snapshot_quality_debt_receipt';
  if (
    snapshotMaterialized
      ? !snapshotBindingValid
        || !snapshotManifestRefValid
        || !snapshotManifestValid
        || receipt.review_input_snapshot_quality_debt_receipt_ref !== null
        || receipt.review_input_snapshot_quality_debt_receipt !== null
      : receipt.review_input_snapshot_status !== 'quality_debt'
        || receipt.review_input_snapshot_binding !== null
        || receipt.opl_reviewer_input_snapshot_manifest_ref !== null
        || receipt.opl_reviewer_input_snapshot_manifest !== null
        || !snapshotDebtValid
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review receipt must bind either the exact immutable reviewer snapshot or its non-blocking quality debt receipt.',
      { review_input_snapshot_status: receipt.review_input_snapshot_status ?? null },
    );
  }
  if (
    (receipt.opl_review_evidence_artifact_receipt_ref === null)
      !== (receipt.opl_review_evidence_artifact_receipt === null)
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage Review receipt evidence artifact ref and body must be present or absent together.',
    );
  }
  if (receipt.opl_review_evidence_artifact_receipt) {
    if (
      receipt.opl_review_evidence_artifact_receipt.surface_kind
        !== 'opl_review_evidence_artifact_receipt'
      || receipt.opl_review_evidence_artifact_receipt.schema_version !== 1
    ) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage Review receipt evidence artifact binding is invalid.',
      );
    }
  }
  requiredText(receipt.stage_run_id, 'stage_run_id');
  requiredText(receipt.quality_cycle_id, 'quality_cycle_id');
  const producerAttemptRef = requiredText(receipt.producer_attempt_ref, 'producer_attempt_ref');
  const reviewerAttemptRef = requiredText(receipt.reviewer_attempt_ref, 'reviewer_attempt_ref');
  if (producerAttemptRef === reviewerAttemptRef) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Formal Stage Review receipt must bind distinct producer and reviewer Attempts.',
      { producer_attempt_ref: producerAttemptRef, reviewer_attempt_ref: reviewerAttemptRef },
    );
  }
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
  normalizeStageQualityArtifactIdentity({
    artifactRefs: receipt.reviewed_artifact_refs,
    artifactHashes: receipt.reviewed_artifact_hashes,
  });
  requiredRefs(receipt.rubric_refs, 'rubric_refs');
  if (!['pass', 'repair_required', 'quality_debt', 'hard_stop'].includes(receipt.verdict)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage Review receipt verdict is invalid.', {
      verdict: receipt.verdict,
    });
  }
  if (!receipt.finding_lineage || typeof receipt.finding_lineage !== 'object') {
    throw new FrameworkContractError('contract_shape_invalid', 'Review receipt finding_lineage must be an object.');
  }
  if (!['initial_review', 'finding_closure_review'].includes(receipt.finding_lineage.review_kind)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Review receipt finding_lineage review_kind is invalid.');
  }
  uniqueIds(nonEmptyStringSequence(receipt.finding_lineage.finding_ids, 'finding_lineage.finding_ids'), 'finding_lineage.finding_ids');
  if (!/^sha256:[a-f0-9]{64}$/.test(receipt.finding_lineage.findings_sha256)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Review receipt findings_sha256 must be a canonical SHA-256 digest.',
      { value: receipt.finding_lineage.findings_sha256 },
    );
  }
  for (const [field, value] of Object.entries({
    repair_map_sha256: receipt.finding_lineage.repair_map_sha256,
    re_review_result_sha256: receipt.finding_lineage.re_review_result_sha256,
  })) {
    if (value !== null && !/^sha256:[a-f0-9]{64}$/.test(value)) {
      throw new FrameworkContractError('contract_shape_invalid', `Review receipt ${field} must be a canonical SHA-256 digest.`, {
        field,
        value,
      });
    }
  }
  if (receipt.finding_lineage.review_kind === 'initial_review') {
    if (receipt.finding_lineage.repair_map_sha256 !== null || receipt.finding_lineage.re_review_result_sha256 !== null) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Initial Review receipt cannot bind repair-map or Re-review result digests.',
      );
    }
  } else {
    if (!receipt.finding_lineage.repair_map_sha256) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Finding-closure Review receipt requires an exact repair-map digest.',
      );
    }
    if (receipt.verdict === 'hard_stop' && receipt.finding_lineage.re_review_result_sha256 !== null) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Hard-stop Re-review receipt cannot bind a finding-closure result digest.',
      );
    }
    if (receipt.verdict !== 'hard_stop' && !receipt.finding_lineage.re_review_result_sha256) {
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Non-hard-stop finding-closure Review receipt requires an exact Re-review result digest.',
      );
    }
  }
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

export function validateInitialStageQualityReviewOutcome(input: {
  outcome: StageQualityOutcome;
  findings: StageQualityFinding[];
}) {
  const findings = validateStageQualityFindings(input.findings);
  const requiredFindingIds = findings
    .filter((finding) => finding.required)
    .map((finding) => finding.finding_id);
  if (input.outcome === 'repair_required' && requiredFindingIds.length === 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Initial Review outcome repair_required requires at least one required finding.',
      { outcome: input.outcome },
    );
  }
  if (['pass', 'quality_debt'].includes(input.outcome) && requiredFindingIds.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      `Initial Review outcome ${input.outcome} cannot carry an open required finding.`,
      { outcome: input.outcome, open_required_finding_ids: requiredFindingIds },
    );
  }
  return findings;
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
  if (regressions.some((finding) => !finding.required)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'repair_regressions that trigger another repair round must declare required=true.',
    );
  }
  if (criticalNewFindings.some((finding) => finding.severity !== 'critical')) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'critical_new_findings may contain only critical findings.',
    );
  }
  if (criticalNewFindings.some((finding) => !finding.required)) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'critical_new_findings that trigger another repair round must declare required=true.',
    );
  }
  uniqueIds([
    ...findings.map((finding) => finding.finding_id),
    ...regressions.map((finding) => finding.finding_id),
    ...criticalNewFindings.map((finding) => finding.finding_id),
  ], 'finding_ids_across_prior_regression_and_critical_new_collections');
  if (!Array.isArray(input.reReview.optional_observations)) {
    throw new FrameworkContractError('contract_shape_invalid', 'Re-review optional_observations must be an array.');
  }
  const optionalObservations = input.reReview.optional_observations.map((observation) => ({
    ...observation,
    observation_id: requiredText(observation.observation_id, 'optional_observations.observation_id'),
    evidence_refs: nonEmptyStrings(
      observation.evidence_refs,
      `optional_observations.${observation.observation_id}.evidence_refs`,
    ),
    summary: requiredText(observation.summary, `optional_observations.${observation.observation_id}.summary`),
  }));
  uniqueIds(optionalObservations.map((observation) => observation.observation_id), 'optional_observations');
  const openFindingIds = closures
    .filter((closure) => closure.status !== 'closed')
    .map((closure) => closure.finding_id);
  return {
    trigger_repair: openFindingIds.length > 0 || regressions.length > 0 || criticalNewFindings.length > 0,
    open_required_finding_ids: openFindingIds,
    repair_regression_ids: regressions.map((finding) => finding.finding_id),
    critical_new_finding_ids: criticalNewFindings.map((finding) => finding.finding_id),
    optional_observation_ids: optionalObservations.map((observation) => observation.observation_id),
    optional_observations_do_not_trigger_repair: true,
  } as const;
}

export function validateStageQualityReReviewOutcome(input: {
  outcome: StageQualityOutcome;
  closure: ReturnType<typeof evaluateStageQualityFindingClosure>;
}) {
  if (input.outcome === 'blocked' || input.outcome === 'human_gate') {
    return input.outcome;
  }
  if (input.closure.trigger_repair && input.outcome !== 'repair_required') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review with open required findings or repair regressions must return outcome repair_required.',
      {
        outcome: input.outcome,
        open_required_finding_ids: input.closure.open_required_finding_ids,
        repair_regression_ids: input.closure.repair_regression_ids,
        critical_new_finding_ids: input.closure.critical_new_finding_ids,
      },
    );
  }
  if (!input.closure.trigger_repair && input.outcome === 'repair_required') {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review outcome repair_required requires an open required finding, repair regression, or critical new finding.',
      { outcome: input.outcome },
    );
  }
  return input.outcome;
}

export function classifyStageQualityReReviewBudget(input: {
  closure: ReturnType<typeof evaluateStageQualityFindingClosure>;
  qualityRoundIndex: unknown;
  maxRepairRounds: unknown;
}) {
  const round = Number(input.qualityRoundIndex);
  const maxRounds = Number(input.maxRepairRounds);
  if (
    !Number.isInteger(round)
    || !Number.isInteger(maxRounds)
    || round < 1
    || maxRounds < 1
    || round > maxRounds
  ) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Re-review repair-budget identity requires 1 <= quality_round_index <= max_repair_rounds.',
      { quality_round_index: input.qualityRoundIndex, max_repair_rounds: input.maxRepairRounds },
    );
  }
  if (!input.closure.trigger_repair) return 'terminal_normal' as const;
  return round < maxRounds ? 'continue_repair' as const : 'terminal_quality_debt' as const;
}

export function initialStageQualityCycleState(input: {
  stageRunId: string;
  qualityCycleId: string;
  maxRepairRounds?: number;
  scopeBudget?: unknown;
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
    quality_scope_budget: normalizeStageQualityScopeBudget(input.scopeBudget, {
      legacyMaxRepairRounds: maxRepairRounds,
    }),
    quality_scope_budget_usage: {
      attempts_used: 0,
      elapsed_ms: 0,
      tokens_used: null,
      token_observation_status: 'missing',
    },
    quality_scope_budget_stop_reason: null,
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
