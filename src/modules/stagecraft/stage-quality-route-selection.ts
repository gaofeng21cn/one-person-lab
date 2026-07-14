import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import {
  classifyStageQualityReReviewBudget,
  evaluateStageQualityFindingClosure,
  STAGE_QUALITY_ATTEMPT_ROLES,
  STAGE_QUALITY_OUTCOMES,
  validateStageQualityReReviewOutcome,
  type StageQualityFinding,
  type StageQualityOutcome,
  type StageQualityRepairMapEntry,
  type StageQualityReReviewResult,
} from './stage-quality-cycle.ts';

export const STAGE_ROUTE_DECISION_KINDS = [
  'advance',
  'skip',
  'repeat',
  'reverse',
  'route_back',
  'complete',
] as const;

export type StageRouteDecisionKind = typeof STAGE_ROUTE_DECISION_KINDS[number];

export type StageRouteDecision = {
  decision_kind: StageRouteDecisionKind;
  target_stage_id?: string;
  evidence_refs: string[];
};

export type StageRouteRecommendation = StageRouteDecision & {
  reason: string;
};

export function isRepairRequiredCrossStageRouteBackDecision(input: {
  attemptRole: unknown;
  outcome: unknown;
  currentStageId: unknown;
  decision: StageRouteDecision | null | undefined;
}) {
  const attemptRole = text(input.attemptRole);
  const outcome = text(input.outcome);
  const currentStageId = text(input.currentStageId);
  const targetStageId = text(input.decision?.target_stage_id);
  return (attemptRole === 'reviewer' || attemptRole === 're_reviewer')
    && outcome === 'repair_required'
    && input.decision?.decision_kind === 'route_back'
    && Boolean(currentStageId)
    && Boolean(targetStageId)
    && targetStageId !== currentStageId;
}

export type StageQualityRouteRecommendationRecord = {
  attempt_ref: string;
  attempt_role: string;
  quality_round_index: number;
  recommendation: StageRouteRecommendation;
};

const LEGACY_TERMINAL_ROUTE_FIELDS = [
  'route_back_stage_ref',
  'selected_next_stage_ref',
  'next_stage_ref',
  'workflow_complete',
] as const;

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim())).map((entry) => entry.trim()))]
    : [];
}

function contextManifest(attempt: JsonRecord) {
  const direct = record(attempt.context_manifest);
  if (Object.keys(direct).length > 0) return direct;
  return record(record(attempt.quality_context).context_manifest);
}

function routeContext(attempt: JsonRecord) {
  return record(contextManifest(attempt).cross_stage_route_selection);
}

function selectedLegacyFields(routeImpact: JsonRecord) {
  return LEGACY_TERMINAL_ROUTE_FIELDS.filter((field) => Object.hasOwn(routeImpact, field));
}

function hasRouteOutput(routeImpact: JsonRecord) {
  return Object.hasOwn(routeImpact, 'stage_route_decision')
    || Object.hasOwn(routeImpact, 'stage_route_recommendation')
    || selectedLegacyFields(routeImpact).length > 0;
}

function sameStringSet(left: string[], right: string[]) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function routeContextRejectionReasons(input: {
  attempt: JsonRecord;
  context: JsonRecord;
}) {
  const role = text(input.attempt.attempt_role);
  const stageId = text(input.attempt.stage_id);
  const decisiveRoles = stringList(input.context.configured_decisive_attempt_roles);
  const declaredStageIds = stringList(input.context.declared_stage_ids);
  const reasons: string[] = [];
  if (!role || !(STAGE_QUALITY_ATTEMPT_ROLES as readonly string[]).includes(role)) {
    reasons.push('attempt_role_is_not_framework_quality_role');
  }
  if (
    input.context.surface_kind !== 'opl_stage_run_route_selection_context'
    || input.context.version !== 'stage-run-route-selection-context.v1'
  ) {
    reasons.push('missing_stage_run_route_selection_context');
  }
  if (!role || input.context.current_attempt_role !== role) {
    reasons.push('stage_run_route_context_attempt_role_mismatch');
  }
  if (
    !sameStringSet(decisiveRoles, ['producer'])
    && !sameStringSet(decisiveRoles, ['reviewer', 're_reviewer'])
  ) {
    reasons.push('configured_decisive_attempt_roles_invalid');
  }
  if (!stageId || declaredStageIds.length === 0 || !declaredStageIds.includes(stageId)) {
    reasons.push('stage_run_route_context_declared_stage_set_invalid');
  }
  return reasons;
}

function normalizeSelection(input: {
  value: unknown;
  declaredStageIds: string[];
  recommendation: boolean;
}) {
  if (input.value === undefined || input.value === null) {
    return {
      selection: null,
      rejection_reasons: [] as string[],
    };
  }
  const value = record(input.value);
  const allowedFields = input.recommendation
    ? ['decision_kind', 'target_stage_id', 'reason', 'evidence_refs']
    : ['decision_kind', 'target_stage_id', 'evidence_refs'];
  const rejectionReasons: string[] = [];
  if (Object.keys(value).length === 0) rejectionReasons.push('route_selection_must_be_an_object');
  if (Object.keys(value).some((field) => !allowedFields.includes(field))) {
    rejectionReasons.push('route_selection_contains_unsupported_fields');
  }
  const decisionKind = text(value.decision_kind);
  if (!decisionKind || !(STAGE_ROUTE_DECISION_KINDS as readonly string[]).includes(decisionKind)) {
    rejectionReasons.push('route_decision_kind_invalid');
  }
  const targetStageId = text(value.target_stage_id);
  if (decisionKind === 'complete') {
    if (targetStageId) rejectionReasons.push('complete_route_must_not_declare_target_stage');
  } else if (!targetStageId) {
    rejectionReasons.push('non_complete_route_requires_target_stage');
  } else if (!input.declaredStageIds.includes(targetStageId)) {
    rejectionReasons.push('route_target_is_not_a_declared_stage');
  }
  const evidenceRefs = stringList(value.evidence_refs);
  if (evidenceRefs.length === 0) rejectionReasons.push('route_selection_requires_evidence_refs');
  const reason = text(value.reason);
  if (input.recommendation && !reason) rejectionReasons.push('route_recommendation_requires_reason');
  if (rejectionReasons.length > 0 || !decisionKind) {
    return { selection: null, rejection_reasons: [...new Set(rejectionReasons)] };
  }
  const normalized = {
    decision_kind: decisionKind as StageRouteDecisionKind,
    ...(targetStageId ? { target_stage_id: targetStageId } : {}),
    evidence_refs: evidenceRefs,
    ...(input.recommendation ? { reason: reason! } : {}),
  };
  return {
    selection: normalized as StageRouteDecision | StageRouteRecommendation,
    rejection_reasons: [] as string[],
  };
}

function reReviewClosureState(input: {
  attempt: JsonRecord;
  routeImpact: JsonRecord;
}) {
  const qualityContext = record(input.attempt.quality_context);
  const findings = Array.isArray(qualityContext.findings)
    ? qualityContext.findings as StageQualityFinding[]
    : null;
  const repairMap = Array.isArray(qualityContext.repair_map)
    ? qualityContext.repair_map as StageQualityRepairMapEntry[]
    : null;
  const envelope = record(input.routeImpact.stage_quality_cycle);
  if (!findings || !repairMap) {
    return { valid: false as const, trigger_repair: true };
  }
  try {
    const closure = evaluateStageQualityFindingClosure({
      findings,
      repairMap,
      reReview: {
        finding_closures: Array.isArray(envelope.finding_closures)
          ? envelope.finding_closures as StageQualityReReviewResult['finding_closures']
          : [],
        repair_regressions: Array.isArray(envelope.repair_regressions)
          ? envelope.repair_regressions as StageQualityReReviewResult['repair_regressions']
          : [],
        critical_new_findings: Array.isArray(envelope.critical_new_findings)
          ? envelope.critical_new_findings as StageQualityReReviewResult['critical_new_findings']
          : [],
        optional_observations: Array.isArray(envelope.optional_observations)
          ? envelope.optional_observations as StageQualityReReviewResult['optional_observations']
          : [],
      },
    });
    return { valid: true as const, closure };
  } catch {
    return { valid: false as const, closure: null };
  }
}

function terminalDecisionRejectionReasons(input: {
  attempt: JsonRecord;
  routeImpact: JsonRecord;
  decision: StageRouteDecision;
}) {
  const role = text(input.attempt.attempt_role);
  if (!role) return [];
  const context = routeContext(input.attempt);
  const decisiveRoles = stringList(context.configured_decisive_attempt_roles);
  const reasons: string[] = [];
  if (!decisiveRoles.includes(role)) reasons.push('attempt_role_is_not_configured_decisive_role');
  const envelope = record(input.routeImpact.stage_quality_cycle);
  const outcome = text(envelope.outcome);
  const reviewRole = role === 'reviewer' || role === 're_reviewer';
  const hardStopOutcome = outcome === 'blocked' || outcome === 'human_gate';
  const repairRequiredCrossStageRouteBack = isRepairRequiredCrossStageRouteBackDecision({
    attemptRole: role,
    outcome,
    currentStageId: input.attempt.stage_id,
    decision: input.decision,
  });
  if (Object.hasOwn(envelope, 'verdict')) {
    reasons.push('attempt_verdict_field_is_reserved_for_controller_receipt');
  }
  if (!reviewRole && Object.hasOwn(envelope, 'outcome')) {
    reasons.push('stage_quality_outcome_is_forbidden_for_attempt_role');
  }
  if (reviewRole && (!outcome || !(STAGE_QUALITY_OUTCOMES as readonly string[]).includes(outcome))) {
    reasons.push('stage_quality_outcome_invalid_or_missing');
  }
  if (
    hardStopOutcome
    || Boolean(text(envelope.hard_stop_class))
  ) {
    reasons.push('hard_stop_attempt_cannot_select_terminal_route');
  }
  if (role === 'reviewer' && !hardStopOutcome) {
    const maxRepairRounds = Number(context.max_repair_rounds);
    const budgetExhaustedWithoutRepair = Number.isInteger(maxRepairRounds) && maxRepairRounds === 0;
    if (
      outcome === 'repair_required'
      && !budgetExhaustedWithoutRepair
      && !repairRequiredCrossStageRouteBack
    ) {
      reasons.push('review_requires_internal_repair_continuation');
    }
    if (
      !['pass', 'quality_debt'].includes(String(outcome))
      && !(
        outcome === 'repair_required'
        && (budgetExhaustedWithoutRepair || repairRequiredCrossStageRouteBack)
      )
    ) {
      reasons.push('review_outcome_does_not_terminalize_stage_run');
    }
  }
  if (role === 're_reviewer' && !hardStopOutcome) {
    const closure = reReviewClosureState({ attempt: input.attempt, routeImpact: input.routeImpact });
    if (!closure.valid) reasons.push('re_review_closure_contract_invalid');
    let budgetDisposition: ReturnType<typeof classifyStageQualityReReviewBudget> | null = null;
    if (closure.valid && outcome && (STAGE_QUALITY_OUTCOMES as readonly string[]).includes(outcome)) {
      try {
        validateStageQualityReReviewOutcome({
          outcome: outcome as StageQualityOutcome,
          closure: closure.closure,
        });
      } catch {
        reasons.push('re_review_outcome_closure_mismatch');
      }
      try {
        budgetDisposition = classifyStageQualityReReviewBudget({
          closure: closure.closure,
          qualityRoundIndex: input.attempt.quality_round_index,
          maxRepairRounds: context.max_repair_rounds,
        });
      } catch {
        reasons.push('re_review_budget_identity_invalid');
      }
    }
    if (budgetDisposition === 'continue_repair' && !repairRequiredCrossStageRouteBack) {
      reasons.push('re_review_requires_another_repair_round');
    }
    if (
      !['pass', 'quality_debt'].includes(String(outcome))
      && !(
        outcome === 'repair_required'
        && (budgetDisposition === 'terminal_quality_debt' || repairRequiredCrossStageRouteBack)
      )
    ) {
      reasons.push('re_review_outcome_does_not_terminalize_stage_run');
    }
  }
  return reasons;
}

export function normalizeDeclaredStageRouteDecision(input: {
  value: unknown;
  declaredStageIds: string[];
}) {
  const normalized = normalizeSelection({
    value: input.value,
    declaredStageIds: input.declaredStageIds,
    recommendation: false,
  });
  return {
    decision: normalized.selection as StageRouteDecision | null,
    rejection_reasons: normalized.rejection_reasons,
  };
}

export function evaluateStageQualityAttemptRoute(input: {
  attempt: JsonRecord;
  routeImpact: unknown;
}) {
  const routeImpact = record(input.routeImpact);
  const role = text(input.attempt.attempt_role);
  const routeOutputPresent = hasRouteOutput(routeImpact);
  if (!role && !routeOutputPresent) {
    return {
      applicable: false as const,
      decision: null,
      recommendation: null,
      decision_rejection_reasons: [] as string[],
      recommendation_rejection_reasons: [] as string[],
      legacy_terminal_route_fields: [] as string[],
    };
  }
  const context = routeContext(input.attempt);
  const declaredStageIds = stringList(context.declared_stage_ids);
  const contextRejectionReasons = routeOutputPresent
    ? routeContextRejectionReasons({ attempt: input.attempt, context })
    : [];
  const decision = normalizeSelection({
    value: routeImpact.stage_route_decision,
    declaredStageIds,
    recommendation: false,
  });
  const recommendation = normalizeSelection({
    value: routeImpact.stage_route_recommendation,
    declaredStageIds,
    recommendation: true,
  });
  const decisionPresent = Object.hasOwn(routeImpact, 'stage_route_decision');
  const recommendationPresent = Object.hasOwn(routeImpact, 'stage_route_recommendation');
  const legacyFields = selectedLegacyFields(routeImpact);
  const decisionRejectionReasons = [
    ...decision.rejection_reasons,
    ...(decisionPresent ? contextRejectionReasons : []),
    ...(decision.selection ? terminalDecisionRejectionReasons({
      attempt: input.attempt,
      routeImpact,
      decision: decision.selection as StageRouteDecision,
    }) : []),
    ...(legacyFields.length > 0 ? ['legacy_terminal_route_fields_are_not_authoritative'] : []),
  ];
  const recommendationRejectionReasons = [
    ...recommendation.rejection_reasons,
    ...(recommendationPresent ? contextRejectionReasons : []),
    ...(legacyFields.length > 0 ? ['legacy_terminal_route_fields_are_not_authoritative'] : []),
  ];
  if (decisionPresent && recommendationPresent) {
    decisionRejectionReasons.push('decision_and_recommendation_are_mutually_exclusive');
    recommendationRejectionReasons.push('decision_and_recommendation_are_mutually_exclusive');
  }
  return {
    applicable: true as const,
    decision: decisionRejectionReasons.length === 0
      ? decision.selection as StageRouteDecision | null
      : null,
    recommendation: recommendationRejectionReasons.length === 0
      ? recommendation.selection as StageRouteRecommendation | null
      : null,
    decision_rejection_reasons: [...new Set(decisionRejectionReasons)],
    recommendation_rejection_reasons: [...new Set(recommendationRejectionReasons)],
    legacy_terminal_route_fields: legacyFields,
  };
}

export function sanitizeStageQualityAttemptRouteImpact(input: {
  attempt: JsonRecord;
  routeImpact: unknown;
}) {
  const routeImpact = { ...record(input.routeImpact) };
  delete routeImpact.stage_route_contract;
  const evaluation = evaluateStageQualityAttemptRoute(input);
  if (!evaluation.applicable) return routeImpact;
  for (const field of LEGACY_TERMINAL_ROUTE_FIELDS) delete routeImpact[field];
  if (evaluation.decision) routeImpact.stage_route_decision = evaluation.decision;
  else delete routeImpact.stage_route_decision;
  if (evaluation.recommendation) routeImpact.stage_route_recommendation = evaluation.recommendation;
  else delete routeImpact.stage_route_recommendation;
  const rejectionReasons = [
    ...evaluation.decision_rejection_reasons,
    ...evaluation.recommendation_rejection_reasons,
  ];
  if (rejectionReasons.length > 0) {
    routeImpact.stage_route_contract = {
      authority_status: 'route_output_rejected',
      rejection_reasons: [...new Set(rejectionReasons)],
    };
  }
  return routeImpact;
}

export function assertQualityAttemptTerminalRouteSelection(input: {
  attempt: JsonRecord;
  routeImpact: unknown;
}) {
  const evaluation = evaluateStageQualityAttemptRoute(input);
  const reasons = [
    ...evaluation.decision_rejection_reasons,
    ...evaluation.recommendation_rejection_reasons,
  ];
  if (reasons.length > 0) {
    throw new FrameworkContractError(
      'contract_shape_invalid',
      'Stage quality Attempt returned an invalid or non-authoritative cross-Stage route output.',
      {
        attempt_role: input.attempt.attempt_role,
        reasons,
        allowed_non_terminal_output: 'stage_route_recommendation',
      },
    );
  }
  return evaluation;
}

export const STAGE_QUALITY_LEGACY_TERMINAL_ROUTE_FIELDS = LEGACY_TERMINAL_ROUTE_FIELDS;
