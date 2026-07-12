import { stableId } from '../../kernel/stable-id.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import { AGENT_LAB_AUTHORITY_BOUNDARY, FORBIDDEN_TRUE_AUTHORITY_FLAGS } from './agent-lab-authority.ts';
import {
  isFixtureReviewReceipt,
  REQUIRED_INDEPENDENT_AI_REVIEW_PROVENANCE_FIELDS,
} from './agent-lab-independent-ai-review.ts';
import { mechanismEvolutionInputRefs, mechanismEvolutionInputsForTask } from './agent-lab-mechanism-inputs.ts';
import { buildProductionEvidenceGateResult } from './agent-lab-production-evidence.ts';
import { buildSampleAgentLabSuite } from './agent-lab-sample-suite.ts';
import { buildAgentLabAheEvidenceReadModel } from './agent-lab-ahe-evidence.ts';
import { buildAgentLabExecutorCapabilityApertureReadModel } from './agent-lab-executor-capability-aperture.ts';
import { buildAgentLabCodexAttemptTraceFlywheel } from './agent-lab-codex-attempt-flywheel.ts';
import {
  ADVISORY_ONLY_PROMOTION_PREFIXES,
  ADVISORY_ONLY_PROMOTION_TOKENS,
  FORBIDDEN_MEMORY_BODY_KEYS,
  REQUIRED_OBSERVATIONS,
  REQUIRED_STAGE_CLOSEOUT_OUTCOMES,
  REQUIRED_STAGE_CLOSEOUT_REF_FIELDS,
} from './agent-lab-parts/model.ts';
import type {
  AgentLabEvaluationProvenanceBinding,
  AgentLabEvaluationTargetAgent,
  AgentLabIndependentAiReviewAssessment,
  AgentLabIndependentAiReviewStatus,
  AgentLabImprovementCandidate,
  AgentLabObservationKey,
  AgentLabPromotionGate,
  AgentLabPromotionRiskTier,
  AgentLabPromotionSafetyStatus,
  AgentLabScorecard,
  AgentLabStatus,
  AgentLabSuite,
  AgentLabTaskManifest,
  JsonRecord,
} from './agent-lab-parts/model.ts';
export {
  buildAgentLabProgressFirstLoopRiskReport,
  type AgentLabAdvisoryLoopPolicy,
  type AgentLabBudgetExhaustedExit,
  type AgentLabCarryForwardAdvanceExit,
  type AgentLabLoopRiskCycleReport,
  type AgentLabLoopRiskEdge,
  type AgentLabLoopRiskLevel,
  type AgentLabLoopRiskNode,
  type AgentLabLoopRiskRepair,
  type AgentLabLoopRiskRoute,
  type AgentLabProgressFirstLoopRiskInput,
  type AgentLabProgressFirstLoopRiskReport,
  type AgentLabProgressFirstPolicyInput,
  type AgentLabQualityLoopPolicy,
  type AgentLabSameIdentityRetryBudget,
  type AgentLabTaskManifestLoopRiskPolicy,
} from './agent-lab-loop-risk.ts';
export {
  buildAgentLabCostEstimate,
  type AgentLabCostEstimateProfile,
} from './agent-lab-token-cost-estimate.ts';
export {
  buildAgentLabEfficiencyNonRegressionReadModel,
  type AgentLabEfficiencyNonRegressionInput,
  type AgentLabEfficiencyNonRegressionRefs,
} from './agent-lab-efficiency-nonregression.ts';
export { REQUIRED_INDEPENDENT_AI_REVIEW_PROVENANCE_FIELDS } from './agent-lab-independent-ai-review.ts';
export { agentLabRefSummary } from './agent-lab-ref-summary.ts';
export { buildAgentLabExecutorCapabilityApertureReadModel } from './agent-lab-executor-capability-aperture.ts';
export type {
  AgentLabEvaluationProvenanceBinding,
  AgentLabEvaluationTargetAgent,
  AgentLabIndependentAiReviewAssessment,
  AgentLabImprovementCandidate,
  AgentLabLonglineSummaryInput,
  AgentLabObservationKey,
  AgentLabPromotionGate,
  AgentLabRecoveryProbe,
  AgentLabRepoTestDisposition,
  AgentLabScorecard,
  AgentLabStageCompletionPolicy,
  AgentLabSuite,
  AgentLabTaskManifest,
  AgentLabTrajectory,
} from './agent-lab-parts/model.ts';

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function optionalRefs(values: string[] | undefined) {
  return unique(Array.isArray(values) ? values : []);
}

const EVALUATION_PROVENANCE_ROLES = new Set<AgentLabEvaluationProvenanceBinding['receipt_role']>([
  'evaluation_packet',
  'recovery_probe_observation',
  'trajectory_observation',
  'scorecard_observation',
  'promotion_gate_observation',
  'stage_completion_policy',
  'production_evidence_gate_observation',
]);

function hasRefs(values: string[] | undefined) {
  return optionalRefs(values).length > 0;
}

function advisoryOnlyPromotionRefs(task: AgentLabTaskManifest) {
  return unique([
    ...optionalRefs(task.promotion_gate.advisory_only_refs),
    ...task.promotion_gate.required_refs,
    ...task.scorecard.evidence_refs,
    ...task.scorecard.review_refs,
    ...task.scorecard.quality_gate_refs,
    ...task.improvement_candidate.evidence_refs,
  ].filter((ref) =>
    ADVISORY_ONLY_PROMOTION_PREFIXES.some((prefix) => ref.startsWith(prefix))
    || ADVISORY_ONLY_PROMOTION_TOKENS.some((token) => ref.includes(token))));
}

function textField(record: JsonRecord | null, key: string): string | null {
  if (!record || typeof record[key] !== 'string') {
    return null;
  }
  const value = record[key].trim();
  return value.length > 0 ? value : null;
}

function invalidEvaluationSuite(message: string, details: JsonRecord = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

function validateEvaluationIdentity(input: AgentLabSuite) {
  const refsInput: unknown = input.evaluation_provenance_refs;
  if (refsInput !== undefined && !Array.isArray(refsInput)) {
    invalidEvaluationSuite('Agent Lab evaluation_provenance_refs must be an array.');
  }
  const provenanceRefs = [...new Set((refsInput ?? []).map((ref, index) => {
    if (typeof ref !== 'string' || ref.trim().length === 0) {
      return invalidEvaluationSuite('Agent Lab evaluation_provenance_refs requires non-empty refs.', { index });
    }
    return ref.trim();
  }))].sort();

  const bindingsInput: unknown = input.evaluation_provenance_bindings;
  if (bindingsInput !== undefined && !Array.isArray(bindingsInput)) {
    invalidEvaluationSuite('Agent Lab evaluation_provenance_bindings must be an array.');
  }
  const bindingKeys = new Set<string>();
  const provenanceBindings = (bindingsInput ?? [])
    .map((value, index): AgentLabEvaluationProvenanceBinding => {
      if (!isRecord(value)) {
        return invalidEvaluationSuite('Agent Lab evaluation_provenance_bindings requires object entries.', { index });
      }
      const receiptRole = textField(value, 'receipt_role');
      const receiptRef = textField(value, 'receipt_ref');
      if (!receiptRole || !EVALUATION_PROVENANCE_ROLES.has(
        receiptRole as AgentLabEvaluationProvenanceBinding['receipt_role'],
      )) {
        return invalidEvaluationSuite('Agent Lab evaluation_provenance_bindings has unsupported receipt_role.', {
          index,
          receipt_role: receiptRole,
        });
      }
      if (!receiptRef) {
        return invalidEvaluationSuite('Agent Lab evaluation_provenance_bindings requires non-empty receipt_ref.', {
          index,
        });
      }
      const binding: AgentLabEvaluationProvenanceBinding = {
        receipt_role: receiptRole as AgentLabEvaluationProvenanceBinding['receipt_role'],
        receipt_ref: receiptRef,
      };
      for (const field of ['task_id', 'probe_ref'] as const) {
        if (value[field] === undefined) continue;
        const contextRef = textField(value, field);
        if (!contextRef) {
          return invalidEvaluationSuite(`Agent Lab evaluation_provenance_bindings requires non-empty ${field}.`, {
            index,
          });
        }
        binding[field] = contextRef;
      }
      return binding;
    })
    .filter((binding) => {
      const key = JSON.stringify([
        binding.receipt_role,
        binding.task_id ?? '',
        binding.probe_ref ?? '',
        binding.receipt_ref,
      ]);
      if (bindingKeys.has(key)) return false;
      bindingKeys.add(key);
      return true;
    })
    .sort((left, right) => {
      const leftKey = [left.receipt_role, left.task_id ?? '', left.probe_ref ?? '', left.receipt_ref].join('\0');
      const rightKey = [right.receipt_role, right.task_id ?? '', right.probe_ref ?? '', right.receipt_ref].join('\0');
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });

  const hasProvenance = provenanceRefs.length > 0 || provenanceBindings.length > 0;
  const targetInput: unknown = input.evaluation_target_agent;
  if (hasProvenance && targetInput === undefined) {
    invalidEvaluationSuite('Agent Lab evaluation provenance requires evaluation_target_agent.');
  }
  let targetAgent: AgentLabEvaluationTargetAgent | undefined;
  if (targetInput !== undefined) {
    if (!isRecord(targetInput)) {
      invalidEvaluationSuite('Agent Lab evaluation_target_agent must be an object.');
    }
    const domainId = textField(targetInput, 'domain_id');
    const targetAgentRef = textField(targetInput, 'target_agent_ref');
    const descriptorRef = textField(targetInput, 'descriptor_ref');
    if (!domainId || !targetAgentRef || !descriptorRef) {
      invalidEvaluationSuite('Agent Lab evaluation_target_agent requires non-empty identity fields.', {
        required_fields: ['domain_id', 'target_agent_ref', 'descriptor_ref'],
      });
    }
    targetAgent = {
      domain_id: domainId,
      target_agent_ref: targetAgentRef,
      descriptor_ref: descriptorRef,
    };
  }

  if ((provenanceRefs.length > 0) !== (provenanceBindings.length > 0)) {
    invalidEvaluationSuite(
      'Agent Lab evaluation_provenance_refs and evaluation_provenance_bindings must be provided together.',
    );
  }
  if (provenanceRefs.length > 0) {
    const rawRefSet = new Set(provenanceRefs);
    const bindingRefSet = new Set(provenanceBindings.map((binding) => binding.receipt_ref));
    if (rawRefSet.size !== bindingRefSet.size
      || [...rawRefSet].some((ref) => !bindingRefSet.has(ref))) {
      invalidEvaluationSuite(
        'Agent Lab evaluation_provenance_refs must match binding receipt_ref values.',
      );
    }
  }

  return { targetAgent, provenanceRefs, provenanceBindings };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return unique(value.filter((entry): entry is string => typeof entry === 'string'));
}

function includesAll(actual: string[], required: string[]) {
  return required.every((entry) => actual.includes(entry));
}

function buildStageCompletionPolicyAssessment(task: AgentLabTaskManifest) {
  const policy = isRecord(task.stage_completion_policy) ? task.stage_completion_policy : null;
  const blockers: string[] = [];
  if (!policy) {
    blockers.push('stage_completion_policy_missing');
  }

  const requiredOutcomes = stringList(policy?.required_closeout_outcomes);
  const acceptedRefFields = stringList(policy?.accepted_closeout_ref_fields);

  if (policy && policy.surface_kind !== 'domain_stage_completion_policy') {
    blockers.push('stage_completion_policy_surface_kind_invalid');
  }
  if (policy && typeof policy.policy_ref !== 'string') {
    blockers.push('stage_completion_policy_ref_missing');
  }
  if (policy && policy.completion_judgment_owner !== 'domain_stage') {
    blockers.push('stage_completion_judgment_must_be_domain_stage_owned');
  }
  if (policy && policy.closeout_packet_required !== false) {
    blockers.push('stage_closeout_packet_must_not_gate_progress');
  }
  if (policy && policy.raw_artifact_sufficient_for_progress !== true) {
    blockers.push('stage_raw_artifact_progress_required');
  }
  if (policy && policy.provider_completion_is_domain_completion !== false) {
    blockers.push('provider_completion_must_not_be_domain_completion');
  }
  if (policy && policy.opl_content_judgment_allowed !== false) {
    blockers.push('opl_content_judgment_must_be_forbidden');
  }
  if (policy && policy.next_stage_transition_owner !== 'codex_cli') {
    blockers.push('next_stage_transition_owner_must_be_codex_cli');
  }
  if (policy && !includesAll(requiredOutcomes, REQUIRED_STAGE_CLOSEOUT_OUTCOMES)) {
    blockers.push('stage_closeout_outcomes_incomplete');
  }
  if (policy && !includesAll(acceptedRefFields, REQUIRED_STAGE_CLOSEOUT_REF_FIELDS)) {
    blockers.push('stage_closeout_ref_fields_incomplete');
  }

  const authorityBoundary = isRecord(policy?.authority_boundary) ? policy.authority_boundary : null;
  if (authorityBoundary?.opl_can_decide_domain_completion === true) {
    blockers.push('opl_domain_completion_authority_forbidden');
  }
  if (authorityBoundary?.provider_completion_counts_as_stage_complete === true) {
    blockers.push('provider_completion_counts_as_stage_complete_forbidden');
  }

  return {
    surface_kind: 'opl_agent_lab_stage_completion_policy_assessment',
    status: blockers.length === 0 ? 'passed' : 'blocked',
    policy_ref: typeof policy?.policy_ref === 'string' ? policy.policy_ref : null,
    completion_judgment_owner: typeof policy?.completion_judgment_owner === 'string'
      ? policy.completion_judgment_owner
      : null,
    next_stage_transition_owner: typeof policy?.next_stage_transition_owner === 'string'
      ? policy.next_stage_transition_owner
      : null,
    required_closeout_outcomes: requiredOutcomes,
    accepted_closeout_ref_fields: acceptedRefFields,
    blockers: unique(blockers),
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

export function assessIndependentAiReviewReceipt(receiptInput: unknown): AgentLabIndependentAiReviewAssessment {
  const receipt = isRecord(receiptInput) ? receiptInput : null;
  const receiptSource = textField(receipt, 'receipt_source') ?? (receipt ? 'unspecified' : 'missing');
  const assessmentMode = textField(receipt, 'assessment_mode')
    ?? (receipt ? 'generated_fixture' : 'missing_real_independent_review');
  const evidenceRefs = stringList(receipt?.evidence_refs);
  const noSharedContextVerified = receipt?.no_shared_context === true
    && receipt?.review_context_inherits_executor_context !== true;
  const executionAttemptRef = textField(receipt, 'execution_attempt_ref');
  const reviewAttemptRef = textField(receipt, 'review_attempt_ref');
  const attemptSeparationVerified = Boolean(executionAttemptRef)
    && Boolean(reviewAttemptRef)
    && executionAttemptRef !== reviewAttemptRef
    && noSharedContextVerified;
  const fields = {
    receipt_ref: textField(receipt, 'receipt_ref'),
    receipt_source: receiptSource === 'missing' ? null : receiptSource,
    assessment_mode: receipt ? assessmentMode : null,
    reviewer_ref: textField(receipt, 'reviewer_ref'),
    reviewer_agent_ref: textField(receipt, 'reviewer_agent_ref'),
    reviewed_mechanism_candidate_ref: textField(receipt, 'reviewed_mechanism_candidate_ref'),
    execution_attempt_ref: executionAttemptRef,
    review_attempt_ref: reviewAttemptRef,
    request_ref: textField(receipt, 'request_ref'),
    response_ref: textField(receipt, 'response_ref'),
    evidence_refs: evidenceRefs.length > 0 ? 'observed' : null,
    no_shared_context: noSharedContextVerified ? 'observed' : null,
    forbidden_write_scan_ref: textField(receipt, 'forbidden_write_scan_ref'),
    verdict: textField(receipt, 'verdict'),
    risk_tier: textField(receipt, 'risk_tier'),
  };
  const missingRequiredFields = REQUIRED_INDEPENDENT_AI_REVIEW_PROVENANCE_FIELDS.filter((field) =>
    !fields[field as keyof typeof fields]);
  const fixtureOrGeneratedReceipt = isFixtureReviewReceipt(receiptSource, assessmentMode);
  const verdict = textField(receipt, 'verdict');
  const aiReviewApproved = receiptSource === 'real_independent_ai_review'
    && assessmentMode === 'real_independent_ai_review'
    && !fixtureOrGeneratedReceipt
    && missingRequiredFields.length === 0
    && attemptSeparationVerified
    && (verdict === 'approved_for_risk_tiered_auto_promotion' || verdict === 'approved');
  const reviewStatus: AgentLabIndependentAiReviewStatus = aiReviewApproved
    ? 'approved'
    : receiptSource === 'missing' || fixtureOrGeneratedReceipt
      ? 'review_pending'
      : 'blocked_from_auto_promotion';

  return {
    surface_kind: 'opl_agent_lab_independent_ai_review_assessment',
    assessment_mode: assessmentMode,
    receipt_source: receiptSource,
    receipt_ref: fields.receipt_ref,
    reviewed_mechanism_candidate_ref: fields.reviewed_mechanism_candidate_ref,
    reviewer_ref: fields.reviewer_ref,
    reviewer_agent_ref: fields.reviewer_agent_ref,
    request_ref: fields.request_ref,
    response_ref: fields.response_ref,
    execution_attempt_ref: fields.execution_attempt_ref,
    review_attempt_ref: fields.review_attempt_ref,
    evidence_refs: evidenceRefs,
    forbidden_write_scan_ref: fields.forbidden_write_scan_ref,
    verdict,
    risk_tier: fields.risk_tier,
    ai_review_approved: aiReviewApproved,
    review_status: reviewStatus,
    required_provenance_fields: [...REQUIRED_INDEPENDENT_AI_REVIEW_PROVENANCE_FIELDS],
    missing_required_fields: missingRequiredFields,
    no_shared_context_verified: noSharedContextVerified,
    attempt_separation_verified: attemptSeparationVerified,
    fixture_or_generated_receipt: fixtureOrGeneratedReceipt,
  };
}

function reviewReceiptInputForTask(task: AgentLabTaskManifest): unknown {
  if (!isRecord(task.mechanism_evolution_inputs)) {
    return null;
  }
  return task.mechanism_evolution_inputs.independent_ai_review_receipt;
}

function promotionRiskTier(task: AgentLabTaskManifest): AgentLabPromotionRiskTier {
  if (task.improvement_candidate.allowed_change_scope === 'manual_review_required') {
    return 'high_risk';
  }

  if (task.improvement_candidate.candidate_kind === 'prompt'
    || task.improvement_candidate.candidate_kind === 'rubric_gap'
    || task.improvement_candidate.candidate_kind === 'display_metadata'
    || task.improvement_candidate.candidate_kind === 'test_metadata') {
    return 'low_risk';
  }

  return 'medium_risk';
}

function failureDeltaRefs(task: AgentLabTaskManifest) {
  return unique([
    ...optionalRefs(task.promotion_gate.failure_delta_refs),
    ...task.improvement_candidate.evidence_refs.filter((ref) =>
      ref.startsWith('failure-delta:')
      || ref.startsWith('evidence-delta:')
      || ref.includes('/failure-delta/')
      || ref.includes('/evidence-delta/')
      || ref.includes('failure_delta')
      || ref.includes('evidence_delta')),
  ]);
}

function buildPromotionSafetyAssessment(
  task: AgentLabTaskManifest,
  independentAiReviewAssessment: AgentLabIndependentAiReviewAssessment,
) {
  const riskTier = promotionRiskTier(task);
  const deltaRefs = failureDeltaRefs(task);
  const advisoryOnlyRefs = advisoryOnlyPromotionRefs(task);
  const missingRequiredRefs: string[] = [];

  if (task.promotion_gate.gate_status !== 'passed') {
    missingRequiredRefs.push('promotion_gate_blocked');
  }
  if (!hasRefs(task.promotion_gate.regression_suite_refs)) {
    missingRequiredRefs.push('promotion_regression_suite_ref_missing');
  }
  if (!hasRefs(task.promotion_gate.no_forbidden_write_proof_refs)) {
    missingRequiredRefs.push('promotion_no_forbidden_write_proof_missing');
  }

  if (deltaRefs.length === 0) {
    return {
      surface_kind: 'opl_agent_lab_promotion_safety_assessment',
      risk_tier: riskTier,
      safety_status: missingRequiredRefs.length === 0
        ? 'regression_guard_only' as AgentLabPromotionSafetyStatus
        : 'promotion_blocked' as AgentLabPromotionSafetyStatus,
      has_failure_delta: false,
      failure_delta_refs: deltaRefs,
      advisory_only_refs: advisoryOnlyRefs,
      advisory_only_signal_count: advisoryOnlyRefs.length,
      advisory_only_cannot_promote: true,
      missing_required_refs: unique(missingRequiredRefs),
      automatic_mechanism_promotion_ready: false,
      authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
    };
  }

  if (riskTier === 'high_risk') {
    if (!hasRefs(task.promotion_gate.owner_or_human_gate_refs)) {
      missingRequiredRefs.push('promotion_owner_or_human_gate_ref_missing');
    }
    return {
      surface_kind: 'opl_agent_lab_promotion_safety_assessment',
      risk_tier: riskTier,
      safety_status: missingRequiredRefs.length === 0
        ? 'owner_or_human_gate_required' as AgentLabPromotionSafetyStatus
        : 'promotion_blocked' as AgentLabPromotionSafetyStatus,
      has_failure_delta: true,
      failure_delta_refs: deltaRefs,
      advisory_only_refs: advisoryOnlyRefs,
      advisory_only_signal_count: advisoryOnlyRefs.length,
      advisory_only_cannot_promote: true,
      missing_required_refs: unique(missingRequiredRefs),
      automatic_mechanism_promotion_ready: false,
      authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
    };
  }

  const independentAiReviewReceiptRefs = optionalRefs(task.promotion_gate.independent_ai_review_receipt_refs);
  if (independentAiReviewReceiptRefs.length === 0) {
    missingRequiredRefs.push('promotion_independent_ai_review_receipt_missing');
  }
  if (independentAiReviewReceiptRefs.length > 0 && !independentAiReviewAssessment.ai_review_approved) {
    missingRequiredRefs.push('promotion_real_independent_ai_review_missing');
  }
  if (independentAiReviewReceiptRefs.length > 0 && !independentAiReviewAssessment.attempt_separation_verified) {
    missingRequiredRefs.push('promotion_independent_ai_attempt_separation_missing');
  }
  if (independentAiReviewAssessment.receipt_ref
    && independentAiReviewReceiptRefs.length > 0
    && !independentAiReviewReceiptRefs.includes(independentAiReviewAssessment.receipt_ref)) {
    missingRequiredRefs.push('promotion_independent_ai_review_receipt_ref_mismatch');
  }
  if (!hasRefs(task.promotion_gate.promotion_receipt_refs)) {
    missingRequiredRefs.push('promotion_receipt_ref_missing');
  }
  if (!hasRefs(task.promotion_gate.rollback_target_refs)) {
    missingRequiredRefs.push('promotion_rollback_target_ref_missing');
  }
  if (!hasRefs(task.promotion_gate.canary_observation_refs)) {
    missingRequiredRefs.push('promotion_canary_observation_ref_missing');
  }

  const missing = unique(missingRequiredRefs);
  return {
    surface_kind: 'opl_agent_lab_promotion_safety_assessment',
    risk_tier: riskTier,
    safety_status: missing.length === 0
      ? 'promotion_ready' as AgentLabPromotionSafetyStatus
      : 'promotion_blocked' as AgentLabPromotionSafetyStatus,
    has_failure_delta: true,
    failure_delta_refs: deltaRefs,
    advisory_only_refs: advisoryOnlyRefs,
    advisory_only_signal_count: advisoryOnlyRefs.length,
    advisory_only_cannot_promote: true,
    missing_required_refs: missing,
    automatic_mechanism_promotion_ready: missing.length === 0,
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function hasForbiddenMemoryBody(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, entry]) =>
    FORBIDDEN_MEMORY_BODY_KEYS.includes(key)
    || (key === 'body_included' && entry === true)
    || (isRecord(entry) && hasForbiddenMemoryBody(entry))
    || (Array.isArray(entry) && entry.some(hasForbiddenMemoryBody)));
}

function collectForbiddenAuthorityFlags(records: Array<{ label: string; value: unknown }>) {
  const flags: string[] = [];
  for (const record of records) {
    if (!isRecord(record.value)) {
      continue;
    }
    for (const flag of FORBIDDEN_TRUE_AUTHORITY_FLAGS) {
      if (record.value[flag] === true) {
        flags.push(`${record.label}.${flag}`);
      }
    }
  }
  return unique(flags);
}

function authorityRecordsForTask(task: AgentLabTaskManifest) {
  return [
    { label: `task:${task.task_id}:authority_boundary`, value: task.authority_boundary },
    { label: `task:${task.task_id}:trajectory.authority_boundary`, value: task.trajectory.authority_boundary },
    { label: `task:${task.task_id}:scorecard.authority_boundary`, value: task.scorecard.authority_boundary },
    {
      label: `task:${task.task_id}:improvement_candidate.authority_boundary`,
      value: task.improvement_candidate.authority_boundary,
    },
    { label: `task:${task.task_id}:promotion_gate.authority_boundary`, value: task.promotion_gate.authority_boundary },
  ];
}

function recoveryPassed(task: AgentLabTaskManifest) {
  return task.recovery_probes.filter((probe) => probe.observed_status === probe.expected_status);
}

function buildRun(task: AgentLabTaskManifest) {
  const mechanismEvolutionInputs = mechanismEvolutionInputsForTask(task);
  const independentAiReviewAssessment = assessIndependentAiReviewReceipt(reviewReceiptInputForTask(task));
  const promotionSafetyAssessment = buildPromotionSafetyAssessment(task, independentAiReviewAssessment);
  const stageCompletionPolicyAssessment = buildStageCompletionPolicyAssessment(task);
  const recoveryPassedCount = recoveryPassed(task).length;
  const recoveryProbeCount = task.recovery_probes.length;
  const failureTaxonomy = [
    recoveryPassedCount === recoveryProbeCount ? null : 'recovery_probe_mismatch',
    task.scorecard.passed ? null : 'domain_scorecard_blocked',
    task.promotion_gate.gate_status === 'passed' ? null : 'promotion_gate_blocked',
    ...stageCompletionPolicyAssessment.blockers,
    ...promotionSafetyAssessment.missing_required_refs.filter((entry) => entry !== 'promotion_gate_blocked'),
  ].filter((entry): entry is string => Boolean(entry));
  const status: AgentLabStatus = failureTaxonomy.length === 0 ? 'passed' : 'blocked';
  return {
    surface_kind: 'opl_agent_lab_run_result',
    run_id: stableId('oalr', [
      task.task_id,
      task.trajectory,
      task.scorecard,
      task.recovery_probes,
      task.improvement_candidate,
      task.promotion_gate,
    ]),
    task_id: task.task_id,
    domain_id: task.domain_id,
    task_family: task.task_family,
    status,
    failure_taxonomy: failureTaxonomy,
    environment: task.environment,
    instructions_ref: task.instructions_ref,
    agent_entry_ref: task.agent_entry_ref,
    stage_refs: task.stage_refs,
    oracle_refs: task.oracle_refs,
    scorer_refs: task.scorer_refs,
    trajectory: task.trajectory,
    recovery: {
      probe_count: recoveryProbeCount,
      passed_count: recoveryPassedCount,
      blocked_count: recoveryProbeCount - recoveryPassedCount,
      probe_refs: task.recovery_probes.map((probe) => probe.probe_ref),
    },
    scorecard: {
      ...task.scorecard,
      scorecard_pass_scope: task.scorecard.passed
        ? 'suite_fixture_scorecard_only'
        : 'suite_fixture_scorecard_blocked',
    },
    stage_completion_policy_assessment: stageCompletionPolicyAssessment,
    independent_ai_review_assessment: independentAiReviewAssessment,
    improvement_candidate: task.improvement_candidate,
    promotion_gate: task.promotion_gate,
    promotion_safety_assessment: promotionSafetyAssessment,
    mechanism_evolution_inputs: mechanismEvolutionInputs,
    mechanism_evolution_input_refs: mechanismEvolutionInputRefs(mechanismEvolutionInputs),
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function buildObservations(
  input: AgentLabSuite,
  runs: ReturnType<typeof buildRun>[],
  evaluationProvenanceRefs = optionalRefs(input.evaluation_provenance_refs),
) {
  const promotionSafetyAssessments = runs.map((run) => run.promotion_safety_assessment);
  const productionEvidenceGateResult = buildProductionEvidenceGateResult(input, runs);
  const recoveryProbeRefs = unique(input.tasks.flatMap((task) =>
    task.recovery_probes.map((probe) => probe.probe_ref)));
  const scorecardRefs = unique(input.tasks.map((task) => task.scorecard.scorecard_ref));
  const improvementCandidateRefs = unique(input.tasks.map((task) => task.improvement_candidate.candidate_ref));
  const promotionGateRefs = unique(input.tasks.map((task) => task.promotion_gate.gate_ref));
  const mechanismEvolutionInputRefs = unique(runs.flatMap((run) => run.mechanism_evolution_input_refs));
  const forbiddenAuthorityFlags = collectForbiddenAuthorityFlags([
    { label: 'suite:authority_boundary', value: input.authority_boundary },
    ...input.tasks.flatMap(authorityRecordsForTask),
  ]);
  const memoryBodyObserved = input.tasks.some(hasForbiddenMemoryBody);
  const allRunsHaveFailureTaxonomy = runs.every((run) => Array.isArray(run.failure_taxonomy));
  const stageCompletionPolicyRefs = unique(runs.flatMap((run) =>
    typeof run.stage_completion_policy_assessment.policy_ref === 'string'
      ? [run.stage_completion_policy_assessment.policy_ref]
      : []));
  const stageCompletionPolicyBlockers = unique(runs.flatMap((run) =>
    run.stage_completion_policy_assessment.blockers));

  return {
    observations: {
      task_manifests_observed: input.tasks.length > 0,
      agent_trajectories_observed: input.tasks.every((task) =>
        Boolean(task.trajectory.trajectory_ref) && task.trajectory.stage_attempt_refs.length > 0),
      domain_stage_completion_policies_observed: input.tasks.length > 0
        && stageCompletionPolicyBlockers.length === 0,
      recovery_probes_observed: recoveryProbeRefs.length > 0,
      domain_quality_scorecard_refs_observed: input.tasks.every((task) =>
        task.scorecard.domain_owned && task.scorecard.opl_scorecard_role === 'scorecard_ref_projection_only'),
      failure_taxonomy_observed: allRunsHaveFailureTaxonomy,
      improvement_candidates_observed: improvementCandidateRefs.length > 0,
      promotion_gates_observed: promotionGateRefs.length > 0
        && promotionSafetyAssessments.every((assessment) => assessment.missing_required_refs.length === 0),
      no_memory_body_observed: !memoryBodyObserved,
      forbidden_authority_flags_all_false: forbiddenAuthorityFlags.length === 0,
    } satisfies Record<AgentLabObservationKey, boolean>,
    refs: {
      ...(evaluationProvenanceRefs.length > 0
        ? { evaluation_provenance_refs: evaluationProvenanceRefs }
        : {}),
      task_refs: unique(input.tasks.map((task) => task.task_id)),
      trajectory_refs: unique(input.tasks.map((task) => task.trajectory.trajectory_ref)),
      recovery_probe_refs: recoveryProbeRefs,
      domain_quality_scorecard_refs: scorecardRefs,
      scorer_refs: unique(input.tasks.flatMap((task) => task.scorer_refs)),
      oracle_refs: unique(input.tasks.flatMap((task) => task.oracle_refs)),
      improvement_candidate_refs: improvementCandidateRefs,
      promotion_gate_refs: promotionGateRefs,
      promotion_independent_ai_review_receipt_refs: unique(input.tasks.flatMap((task) =>
        optionalRefs(task.promotion_gate.independent_ai_review_receipt_refs))),
      promotion_receipt_refs: unique(input.tasks.flatMap((task) =>
        optionalRefs(task.promotion_gate.promotion_receipt_refs))),
      rollback_target_refs: unique(input.tasks.flatMap((task) =>
        optionalRefs(task.promotion_gate.rollback_target_refs))),
      canary_observation_refs: unique(input.tasks.flatMap((task) =>
        optionalRefs(task.promotion_gate.canary_observation_refs))),
      failure_delta_refs: unique(promotionSafetyAssessments.flatMap((assessment) => assessment.failure_delta_refs)),
      advisory_only_signal_refs: unique(promotionSafetyAssessments.flatMap((assessment) =>
        assessment.advisory_only_refs)),
      artifact_refs: unique(input.tasks.flatMap((task) => task.trajectory.artifact_refs)),
      receipt_refs: unique(input.tasks.flatMap((task) => task.trajectory.receipt_refs)),
      stage_completion_policy_refs: stageCompletionPolicyRefs,
      stage_completion_policy_blocker_refs: stageCompletionPolicyBlockers.map((blocker) =>
        `stage-completion-policy-blocker:${blocker}`),
      mechanism_evolution_input_refs: mechanismEvolutionInputRefs,
      production_evidence_gate_result_refs: productionEvidenceGateResult?.gate_result_refs ?? [],
      production_evidence_gate_refs: productionEvidenceGateResult?.gate_ids ?? [],
      production_evidence_owner_route_refs: productionEvidenceGateResult?.owner_route_refs ?? [],
      production_evidence_no_forbidden_write_refs: productionEvidenceGateResult?.no_forbidden_write_proof_refs ?? [],
      production_evidence_typed_blocker_refs: productionEvidenceGateResult?.typed_blocker_refs ?? [],
      production_evidence_required_receipt_refs: productionEvidenceGateResult?.required_receipt_refs ?? [],
      forbidden_authority_flags: forbiddenAuthorityFlags,
      duration_refs: unique(input.tasks.flatMap((task) => [
        ...optionalRefs(task.trajectory.duration_refs as string[] | undefined),
        typeof task.trajectory.duration_ref === 'string' ? task.trajectory.duration_ref : '',
      ])),
      cost_refs: unique(input.tasks.flatMap((task) => [
        ...optionalRefs(task.trajectory.cost_refs as string[] | undefined),
        typeof task.trajectory.cost_ref === 'string' ? task.trajectory.cost_ref : '',
      ])),
      cache_hit_refs: unique(input.tasks.flatMap((task) => [
        ...optionalRefs(task.trajectory.cache_hit_refs as string[] | undefined),
        typeof task.trajectory.cache_hit_ref === 'string' ? task.trajectory.cache_hit_ref : '',
      ])),
      reuse_scope_refs: unique(input.tasks.flatMap((task) => [
        ...optionalRefs(task.trajectory.reuse_scope_refs as string[] | undefined),
        typeof task.trajectory.reuse_scope_ref === 'string' ? task.trajectory.reuse_scope_ref : '',
      ])),
      quality_floor_refs: unique(input.tasks.flatMap((task) => {
        const scorecard = task.scorecard as AgentLabScorecard & {
          quality_floor_ref?: unknown;
          quality_floor_refs?: unknown;
        };
        return [
          ...optionalRefs(scorecard.quality_floor_refs as string[] | undefined),
          typeof scorecard.quality_floor_ref === 'string' ? scorecard.quality_floor_ref : '',
        ];
      })),
      no_forbidden_write_refs: unique(input.tasks.flatMap((task) => [
        ...optionalRefs(task.promotion_gate.no_forbidden_write_proof_refs),
        ...optionalRefs((task.promotion_gate as AgentLabPromotionGate & {
          no_forbidden_write_refs?: string[];
        }).no_forbidden_write_refs),
      ])),
      owner_route_refs: unique(input.tasks.flatMap((task) => [
        ...optionalRefs((task.improvement_candidate as AgentLabImprovementCandidate & {
          owner_route_refs?: string[];
        }).owner_route_refs),
        typeof (task.improvement_candidate as AgentLabImprovementCandidate & {
          owner_route_ref?: unknown;
        }).owner_route_ref === 'string'
          ? (task.improvement_candidate as AgentLabImprovementCandidate & { owner_route_ref: string }).owner_route_ref
          : '',
        ...optionalRefs(task.promotion_gate.owner_or_human_gate_refs),
      ])),
      command_refs: unique(input.tasks.flatMap((task) => optionalRefs(task.trajectory.command_refs))),
      file_refs: unique(input.tasks.flatMap((task) => optionalRefs(task.trajectory.file_refs))),
      subagent_refs: unique(input.tasks.flatMap((task) => optionalRefs(task.trajectory.subagent_refs))),
      worktree_refs: unique(input.tasks.flatMap((task) => optionalRefs(task.trajectory.worktree_refs))),
      test_refs: unique(input.tasks.flatMap((task) => optionalRefs(task.trajectory.test_refs))),
      web_source_refs: unique(input.tasks.flatMap((task) => optionalRefs(task.trajectory.web_source_refs))),
      typed_blocker_refs: unique(input.tasks.flatMap((task) => optionalRefs(task.trajectory.typed_blocker_refs))),
      review_receipt_refs: unique(input.tasks.flatMap((task) => optionalRefs(task.trajectory.review_receipt_refs))),
    },
    counters: {
      memory_body_observed: memoryBodyObserved,
      forbidden_authority_flag_count: forbiddenAuthorityFlags.length,
      stage_completion_policy_blocker_count: stageCompletionPolicyBlockers.length,
    },
  };
}

function domainSummary(runs: ReturnType<typeof buildRun>[]) {
  const domainIds = unique(runs.map((run) => run.domain_id));
  return domainIds.map((domainId) => {
    const domainRuns = runs.filter((run) => run.domain_id === domainId);
    return {
      domain_id: domainId,
      run_count: domainRuns.length,
      passed_run_count: domainRuns.filter((run) => run.status === 'passed').length,
      blocked_run_count: domainRuns.filter((run) => run.status === 'blocked').length,
      ai_review_approved_count: domainRuns.filter((run) =>
        run.independent_ai_review_assessment.ai_review_approved).length,
      scorecard_refs: domainRuns.map((run) => run.scorecard.scorecard_ref),
      improvement_candidate_refs: domainRuns.map((run) => run.improvement_candidate.candidate_ref),
      promotion_gate_refs: domainRuns.map((run) => run.promotion_gate.gate_ref),
    };
  });
}

export function runAgentLabSuite(input: AgentLabSuite) {
  const evaluationIdentity = validateEvaluationIdentity(input);
  const runs = input.tasks.map(buildRun);
  const aheEvidence = buildAgentLabAheEvidenceReadModel({ suite: input, results: runs });
  const executorCapabilityAperture = buildAgentLabExecutorCapabilityApertureReadModel({ suite: input });
  const codexAttemptTraceFlywheel = buildAgentLabCodexAttemptTraceFlywheel({ suite: input, results: runs });
  const requiredObservations = input.required_observations ?? REQUIRED_OBSERVATIONS;
  const observationResult = buildObservations(input, runs, evaluationIdentity.provenanceRefs);
  const productionEvidenceGateResult = buildProductionEvidenceGateResult(input, runs);
  const missingObservations = requiredObservations.filter(
    (observation) => !observationResult.observations[observation],
  );
  const blockedRuns = runs.filter((run) => run.status === 'blocked');
  const aiReviewApprovedCount = runs.filter((run) =>
    run.independent_ai_review_assessment.ai_review_approved).length;
  const promotionGatePassedCount = input.tasks.filter((task) => task.promotion_gate.gate_status === 'passed').length;
  const productionEvidenceGateBlocked = productionEvidenceGateResult?.status === 'blocked';
  const evaluationProvenanceBindings = evaluationIdentity.provenanceBindings;
  const evaluationTargetAgent = evaluationIdentity.targetAgent;
  const status: AgentLabStatus = missingObservations.length === 0 && blockedRuns.length === 0 && !productionEvidenceGateBlocked
    ? 'passed'
    : 'blocked';

  return {
    surface_kind: 'opl_agent_lab_suite_result',
    version: 'opl-agent-lab.v1',
    suite_id: input.suite_id,
    suite_kind: input.suite_kind ?? 'agent_lab_sample_suite',
    result_id: stableId('oals', [
      input.suite_id,
      runs.map((run) => run.run_id),
      observationResult.observations,
      observationResult.refs,
      ...(evaluationTargetAgent ? [evaluationTargetAgent] : []),
      ...(evaluationProvenanceBindings.length > 0 ? [evaluationProvenanceBindings] : []),
    ]),
    status,
    required_observations: requiredObservations,
    missing_observations: missingObservations,
    observations: observationResult.observations,
    ...(evaluationTargetAgent ? { evaluation_target_agent: evaluationTargetAgent } : {}),
    ...(evaluationProvenanceBindings.length > 0
      ? { evaluation_provenance_bindings: evaluationProvenanceBindings }
      : {}),
    summary: {
      task_count: input.tasks.length,
      run_count: runs.length,
      passed_run_count: runs.filter((run) => run.status === 'passed').length,
      blocked_run_count: blockedRuns.length,
      recovery_probe_count: input.tasks.reduce((total, task) => total + task.recovery_probes.length, 0),
      recovery_passed_count: input.tasks.reduce((total, task) => total + recoveryPassed(task).length, 0),
      scorecard_passed_count: input.tasks.filter((task) => task.scorecard.passed).length,
      ai_review_approved_count: aiReviewApprovedCount,
      improvement_candidate_count: input.tasks.length,
      promotion_gate_passed_count: promotionGatePassedCount,
      regression_guard_only_count: runs.filter((run) =>
        run.promotion_safety_assessment.safety_status === 'regression_guard_only').length,
      promotion_safety_ready_count: runs.filter((run) =>
        run.promotion_safety_assessment.safety_status === 'promotion_ready').length,
      advisory_only_signal_count: unique(runs.flatMap((run) =>
        run.promotion_safety_assessment.advisory_only_refs)).length,
      promotion_safety_blocked_count: runs.filter((run) =>
        run.promotion_safety_assessment.safety_status === 'promotion_blocked').length,
      owner_or_human_gate_required_count: runs.filter((run) =>
        run.promotion_safety_assessment.safety_status === 'owner_or_human_gate_required').length,
      promotable_candidate_count: runs.filter((run) =>
        run.promotion_gate.gate_status === 'passed'
        && run.independent_ai_review_assessment.ai_review_approved
        && run.promotion_safety_assessment.automatic_mechanism_promotion_ready).length,
      memory_body_observed: observationResult.counters.memory_body_observed,
      forbidden_authority_flag_count: observationResult.counters.forbidden_authority_flag_count,
      stage_completion_policy_blocker_count: observationResult.counters.stage_completion_policy_blocker_count,
    },
    refs: {
      ...observationResult.refs,
      change_evaluation_refs: unique(aheEvidence.tasks.flatMap((task) => task.change_evaluation_refs)),
      predicted_impact_refs: unique(aheEvidence.tasks.flatMap((task) => task.predicted_impact_refs)),
      failure_evidence_refs: unique(aheEvidence.tasks.flatMap((task) => task.failure_evidence_refs)),
      root_cause_refs: unique(aheEvidence.tasks.flatMap((task) => task.root_cause_refs)),
      targeted_fix_refs: unique(aheEvidence.tasks.flatMap((task) => task.targeted_fix_refs)),
      risk_task_refs: unique(aheEvidence.tasks.flatMap((task) => task.risk_task_refs)),
      next_run_falsification_refs: unique(aheEvidence.tasks.flatMap((task) =>
        task.next_run_falsification_refs)),
      executor_capability_aperture_refs: executorCapabilityAperture.tasks.map((task) => task.aperture_ref),
      codex_attempt_trace_refs: codexAttemptTraceFlywheel.refs.attempt_trace_refs,
      codex_command_refs: codexAttemptTraceFlywheel.refs.command_refs,
      codex_file_refs: codexAttemptTraceFlywheel.refs.file_refs,
      codex_subagent_refs: codexAttemptTraceFlywheel.refs.subagent_refs,
      codex_worktree_refs: codexAttemptTraceFlywheel.refs.worktree_refs,
      codex_test_refs: codexAttemptTraceFlywheel.refs.test_refs,
      codex_web_source_refs: codexAttemptTraceFlywheel.refs.web_source_refs,
      codex_typed_blocker_refs: codexAttemptTraceFlywheel.refs.typed_blocker_refs,
      codex_review_receipt_refs: codexAttemptTraceFlywheel.refs.review_receipt_refs,
      codex_blocked_evidence_refs: codexAttemptTraceFlywheel.refs.blocked_evidence_refs,
      codex_variant_candidate_refs: codexAttemptTraceFlywheel.refs.variant_candidate_refs,
    },
    runs,
    ahe_evidence: aheEvidence,
    executor_capability_aperture: executorCapabilityAperture,
    codex_attempt_trace_flywheel: codexAttemptTraceFlywheel,
    domain_summary: domainSummary(runs),
    production_evidence_gate_result: productionEvidenceGateResult,
    longline_summary: buildLonglineSummary(input),
    authority_boundary: {
      ...AGENT_LAB_AUTHORITY_BOUNDARY,
      ...(input.authority_boundary ?? {}),
    },
  };
}

function buildLonglineSummary(input: AgentLabSuite) {
  const disposition = input.longline_summary?.recommended_repo_test_disposition ?? [];
  const domainIds = unique(input.tasks.map((task) => task.domain_id));
  const longlineTaskCount = input.suite_kind === 'agent_lab_longline_suite'
    ? input.tasks.length
    : 0;
  return {
    surface_kind: 'opl_agent_lab_longline_summary',
    longline_task_count: longlineTaskCount,
    domain_ids: domainIds,
    repo_test_replacement_candidate_count: disposition.length,
    ready_to_reduce_domain_longline_tests: longlineTaskCount > 0
      && disposition.length === domainIds.length
      && input.tasks.every((task) => task.promotion_gate.gate_status === 'passed'),
    recommended_repo_test_disposition: disposition,
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

export { buildSampleAgentLabSuite };

export function buildSampleAgentLabResult() {
  return runAgentLabSuite(buildSampleAgentLabSuite());
}
