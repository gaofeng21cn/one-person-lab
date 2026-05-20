import { stableId } from './family-runtime-ids.ts';
import { AGENT_LAB_AUTHORITY_BOUNDARY, FORBIDDEN_TRUE_AUTHORITY_FLAGS } from './agent-lab-authority.ts';
import {
  isFixtureReviewReceipt,
  REQUIRED_INDEPENDENT_AI_REVIEW_PROVENANCE_FIELDS,
} from './agent-lab-independent-ai-review.ts';
import { mechanismEvolutionInputRefs, mechanismEvolutionInputsForTask } from './agent-lab-mechanism-inputs.ts';
import { buildProductionEvidenceGateResult } from './agent-lab-production-evidence.ts';
export { REQUIRED_INDEPENDENT_AI_REVIEW_PROVENANCE_FIELDS } from './agent-lab-independent-ai-review.ts';
export { agentLabRefSummary } from './agent-lab-ref-summary.ts';

type JsonRecord = Record<string, unknown>;

type AgentLabDomainId = 'med-autoscience' | 'med-autogrant' | 'redcube-ai' | string;
type AgentLabStatus = 'passed' | 'blocked';
type AgentLabIndependentAiReviewStatus = 'approved' | 'review_pending' | 'blocked_from_auto_promotion';
type AgentLabPromotionRiskTier = 'low_risk' | 'medium_risk' | 'high_risk';
type AgentLabPromotionSafetyStatus =
  | 'regression_guard_only'
  | 'promotion_ready'
  | 'promotion_blocked'
  | 'owner_or_human_gate_required';

export type AgentLabTaskManifest = {
  task_id: string;
  domain_id: AgentLabDomainId;
  task_family: string;
  environment: {
    environment_kind: 'fixture' | 'local_workspace' | 'provider_hosted' | string;
    workspace_locator_ref: string;
    sandbox_policy: string;
    network_policy: string;
    resource_limits?: JsonRecord;
  };
  instructions_ref: string;
  agent_entry_ref: string;
  stage_refs: string[];
  oracle_refs: string[];
  scorer_refs: string[];
  recovery_probes: AgentLabRecoveryProbe[];
  trajectory: AgentLabTrajectory;
  scorecard: AgentLabScorecard;
  improvement_candidate: AgentLabImprovementCandidate;
  promotion_gate: AgentLabPromotionGate;
  mechanism_evolution_inputs?: JsonRecord;
  authority_boundary?: JsonRecord;
};

export type AgentLabRecoveryProbe = {
  probe_ref: string;
  probe_kind:
    | 'resume_after_interruption'
    | 'retry_after_tool_failure'
    | 'dead_letter_repair'
    | 'human_gate_resume'
    | 'artifact_restore'
    | string;
  expected_status: 'passed' | 'blocked';
  observed_status: 'passed' | 'blocked';
  source_refs: string[];
};

export type AgentLabTrajectory = {
  trajectory_ref: string;
  run_ref: string;
  agent_executor: string;
  stage_attempt_refs: string[];
  tool_call_refs: string[];
  artifact_refs: string[];
  receipt_refs: string[];
  repair_refs: string[];
  trace_refs?: string[];
  authority_boundary?: JsonRecord;
  [key: string]: unknown;
};

export type AgentLabScorecard = {
  scorecard_ref: string;
  domain_owned: boolean;
  opl_scorecard_role: 'scorecard_ref_projection_only';
  passed: boolean;
  scorecard_pass_scope?: 'suite_fixture_scorecard_only' | 'suite_fixture_scorecard_blocked' | string;
  metric_refs: string[];
  evidence_refs: string[];
  review_refs: string[];
  quality_gate_refs: string[];
  authority_boundary?: JsonRecord;
};

export type AgentLabIndependentAiReviewAssessment = {
  surface_kind: 'opl_agent_lab_independent_ai_review_assessment';
  assessment_mode:
    | 'real_independent_ai_review'
    | 'missing_real_independent_review'
    | 'synthetic_fixture'
    | 'generated_fixture'
    | 'fixture_receipt'
    | string;
  receipt_source: 'real_independent_ai_review' | 'missing' | 'synthetic_fixture' | 'generated_fixture' | string;
  receipt_ref: string | null;
  reviewed_mechanism_candidate_ref: string | null;
  reviewer_ref: string | null;
  reviewer_agent_ref: string | null;
  request_ref: string | null;
  response_ref: string | null;
  execution_attempt_ref: string | null;
  review_attempt_ref: string | null;
  evidence_refs: string[];
  forbidden_write_scan_ref: string | null;
  verdict: string | null;
  risk_tier: string | null;
  ai_review_approved: boolean;
  review_status: AgentLabIndependentAiReviewStatus;
  required_provenance_fields: string[];
  missing_required_fields: string[];
  no_shared_context_verified: boolean;
  attempt_separation_verified: boolean;
  fixture_or_generated_receipt: boolean;
};

export type AgentLabImprovementCandidate = {
  candidate_ref: string;
  candidate_kind: 'prompt' | 'skill' | 'stage_policy' | 'tool_policy' | string;
  target_ref: string;
  evidence_refs: string[];
  allowed_change_scope: 'candidate_config_only' | 'branch_only' | 'manual_review_required';
  promotion_gate_ref: string;
  authority_boundary?: JsonRecord;
};

export type AgentLabPromotionGate = {
  gate_ref: string;
  gate_status: 'passed' | 'blocked';
  required_refs: string[];
  regression_suite_refs: string[];
  no_forbidden_write_proof_refs: string[];
  advisory_only_refs?: string[];
  failure_delta_refs?: string[];
  independent_ai_review_receipt_refs?: string[];
  promotion_receipt_refs?: string[];
  rollback_target_refs?: string[];
  canary_observation_refs?: string[];
  owner_or_human_gate_refs?: string[];
  authority_boundary?: JsonRecord;
};

export type AgentLabSuite = {
  suite_id: string;
  suite_kind?: 'agent_lab_sample_suite' | 'agent_lab_longline_suite' | 'mas_production_evidence_suite' | string;
  tasks: AgentLabTaskManifest[];
  required_observations?: AgentLabObservationKey[];
  longline_summary?: AgentLabLonglineSummaryInput;
  mas_production_evidence_gate?: JsonRecord;
  production_evidence_gate?: JsonRecord;
  authority_boundary?: JsonRecord;
};

export type AgentLabRepoTestDisposition = {
  domain_id: AgentLabDomainId;
  keep_in_domain_repo: string[];
  move_to_opl_agent_lab: string[];
};

export type AgentLabLonglineSummaryInput = {
  recommended_repo_test_disposition: AgentLabRepoTestDisposition[];
};

export type AgentLabObservationKey =
  | 'task_manifests_observed'
  | 'agent_trajectories_observed'
  | 'recovery_probes_observed'
  | 'domain_quality_scorecard_refs_observed'
  | 'failure_taxonomy_observed'
  | 'improvement_candidates_observed'
  | 'promotion_gates_observed'
  | 'no_memory_body_observed'
  | 'forbidden_authority_flags_all_false';

const REQUIRED_OBSERVATIONS: AgentLabObservationKey[] = [
  'task_manifests_observed',
  'agent_trajectories_observed',
  'recovery_probes_observed',
  'domain_quality_scorecard_refs_observed',
  'failure_taxonomy_observed',
  'improvement_candidates_observed',
  'promotion_gates_observed',
  'no_memory_body_observed',
  'forbidden_authority_flags_all_false',
];

const FORBIDDEN_MEMORY_BODY_KEYS = [
  'memory_body',
  'memory_content',
  'memory_payload',
  'accepted_memory_body',
  'rejected_memory_body',
];

const ADVISORY_ONLY_PROMOTION_PREFIXES = [
  'fixture:',
  'quality-scorecard:',
  'scorecard:',
  'schema-completeness:',
  'schema-complete:',
  'contract-completeness:',
  'provider-completion:',
  'provider-completion-ref:',
  'provider-completion-proof:',
  'descriptor-ready:',
  'generated-surface-proof:',
  'generated-bundle-ready:',
  'harness-pass:',
  'agent-lab-score:',
];

const ADVISORY_ONLY_PROMOTION_TOKENS = [
  'fixture',
  'schema_completeness',
  'schema-completeness',
  'schema_complete',
  'schema-complete',
  'provider_completion',
  'provider-completion',
  'scorecard',
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function optionalRefs(values: string[] | undefined) {
  return unique(Array.isArray(values) ? values : []);
}

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

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return unique(value.filter((entry): entry is string => typeof entry === 'string'));
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
  const recoveryPassedCount = recoveryPassed(task).length;
  const recoveryProbeCount = task.recovery_probes.length;
  const failureTaxonomy = [
    recoveryPassedCount === recoveryProbeCount ? null : 'recovery_probe_mismatch',
    task.scorecard.passed ? null : 'domain_scorecard_blocked',
    task.promotion_gate.gate_status === 'passed' ? null : 'promotion_gate_blocked',
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
    independent_ai_review_assessment: independentAiReviewAssessment,
    improvement_candidate: task.improvement_candidate,
    promotion_gate: task.promotion_gate,
    promotion_safety_assessment: promotionSafetyAssessment,
    mechanism_evolution_inputs: mechanismEvolutionInputs,
    mechanism_evolution_input_refs: mechanismEvolutionInputRefs(mechanismEvolutionInputs),
    authority_boundary: AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function buildObservations(input: AgentLabSuite, runs: ReturnType<typeof buildRun>[]) {
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

  return {
    observations: {
      task_manifests_observed: input.tasks.length > 0,
      agent_trajectories_observed: input.tasks.every((task) =>
        Boolean(task.trajectory.trajectory_ref) && task.trajectory.stage_attempt_refs.length > 0),
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
      mechanism_evolution_input_refs: mechanismEvolutionInputRefs,
      production_evidence_gate_result_refs: productionEvidenceGateResult?.gate_result_refs ?? [],
      production_evidence_gate_refs: productionEvidenceGateResult?.gate_ids ?? [],
      production_evidence_owner_route_refs: productionEvidenceGateResult?.owner_route_refs ?? [],
      production_evidence_no_forbidden_write_refs: productionEvidenceGateResult?.no_forbidden_write_proof_refs ?? [],
      production_evidence_typed_blocker_refs: productionEvidenceGateResult?.typed_blocker_refs ?? [],
      production_evidence_required_receipt_refs: productionEvidenceGateResult?.required_receipt_refs ?? [],
      forbidden_authority_flags: forbiddenAuthorityFlags,
    },
    counters: {
      memory_body_observed: memoryBodyObserved,
      forbidden_authority_flag_count: forbiddenAuthorityFlags.length,
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
  const runs = input.tasks.map(buildRun);
  const requiredObservations = input.required_observations ?? REQUIRED_OBSERVATIONS;
  const observationResult = buildObservations(input, runs);
  const productionEvidenceGateResult = buildProductionEvidenceGateResult(input, runs);
  const missingObservations = requiredObservations.filter(
    (observation) => !observationResult.observations[observation],
  );
  const blockedRuns = runs.filter((run) => run.status === 'blocked');
  const aiReviewApprovedCount = runs.filter((run) =>
    run.independent_ai_review_assessment.ai_review_approved).length;
  const promotionGatePassedCount = input.tasks.filter((task) => task.promotion_gate.gate_status === 'passed').length;
  const productionEvidenceGateBlocked = productionEvidenceGateResult?.status === 'blocked';
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
    ]),
    status,
    required_observations: requiredObservations,
    missing_observations: missingObservations,
    observations: observationResult.observations,
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
    },
    refs: observationResult.refs,
    runs,
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

function commonAuthorityBoundary() {
  return {
    ...AGENT_LAB_AUTHORITY_BOUNDARY,
  };
}

function task(input: Omit<AgentLabTaskManifest, 'authority_boundary'>): AgentLabTaskManifest {
  return {
    ...input,
    authority_boundary: commonAuthorityBoundary(),
    trajectory: {
      ...input.trajectory,
      authority_boundary: commonAuthorityBoundary(),
    },
    scorecard: {
      ...input.scorecard,
      authority_boundary: commonAuthorityBoundary(),
    },
    improvement_candidate: {
      ...input.improvement_candidate,
      authority_boundary: commonAuthorityBoundary(),
    },
    promotion_gate: {
      ...input.promotion_gate,
      authority_boundary: commonAuthorityBoundary(),
    },
  };
}

export function buildSampleAgentLabSuite(): AgentLabSuite {
  return {
    suite_id: 'opl-agent-lab-sample-suite',
    authority_boundary: commonAuthorityBoundary(),
    tasks: [
      task({
        task_id: 'agent-lab-task:mas/paper-repair-smoke',
        domain_id: 'med-autoscience',
        task_family: 'research_foundry_paper_repair',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:mas/sample-paper-repair',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
          resource_limits: { max_minutes: 15, max_stage_attempts: 3 },
        },
        instructions_ref: 'instructions:mas/paper-repair-smoke',
        agent_entry_ref: 'domain-agent-entry:med-autoscience',
        stage_refs: ['stage:mas/review-repair', 'stage:mas/guarded-apply'],
        oracle_refs: ['oracle:mas/publication-eval-fixture'],
        scorer_refs: ['scorer:mas/publication-quality-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:common/resume-after-interruption',
            probe_kind: 'resume_after_interruption',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:mas/resume-fixture'],
          },
          {
            probe_ref: 'recovery-probe:mas/human-gate-resume',
            probe_kind: 'human_gate_resume',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['human-gate:mas/reviewer-decision-fixture'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:mas/paper-repair-smoke',
          run_ref: 'run:mas/paper-repair-smoke',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:mas/paper-repair-smoke'],
          tool_call_refs: ['tool-call:mas/study-state-read'],
          artifact_refs: ['artifact-ref:mas/revision-package-fixture'],
          receipt_refs: ['owner-receipt:mas/publication-eval-fixture'],
          repair_refs: ['repair-ref:mas/reviewer-recheck'],
          trace_refs: ['trace-ref:inspect/mas-paper-repair'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:mas/paper-repair-smoke',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:mas/evidence-backed-claims'],
          evidence_refs: ['evidence-ref:mas/publication-eval-fixture'],
          review_refs: ['review-ref:mas/ai-reviewer-fixture'],
          quality_gate_refs: ['quality-gate:mas/publication-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:mas/reviewer-repair-prompt',
          candidate_kind: 'prompt',
          target_ref: 'prompt-ref:mas/reviewer-repair',
          evidence_refs: ['failure-taxonomy:mas/no-current-failure-fixture'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:mas/paper-repair-smoke',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:mas/paper-repair-smoke',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:mas/paper-repair-smoke'],
          regression_suite_refs: ['regression-suite:mas/paper-autonomy-smoke'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:mas/agent-lab-fixture'],
        },
      }),
      task({
        task_id: 'agent-lab-task:mag/grant-section-smoke',
        domain_id: 'med-autogrant',
        task_family: 'grant_foundry_section_revision',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:mag/sample-grant-section',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:mag/grant-section-smoke',
        agent_entry_ref: 'domain-agent-entry:med-autogrant',
        stage_refs: ['stage:mag/strategy-review', 'stage:mag/section-revision'],
        oracle_refs: ['oracle:mag/fundability-fixture'],
        scorer_refs: ['scorer:mag/fundability-quality-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:mag/retry-after-tool-failure',
            probe_kind: 'retry_after_tool_failure',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['receipt:mag/retry-fixture'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:mag/grant-section-smoke',
          run_ref: 'run:mag/grant-section-smoke',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:mag/grant-section-smoke'],
          tool_call_refs: ['tool-call:mag/intake-read'],
          artifact_refs: ['artifact-ref:mag/section-draft-fixture'],
          receipt_refs: ['owner-receipt:mag/fundability-fixture'],
          repair_refs: ['repair-ref:mag/strategy-tightening'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:mag/grant-section-smoke',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:mag/specific-aim-fit'],
          evidence_refs: ['evidence-ref:mag/fundability-fixture'],
          review_refs: ['review-ref:mag/domain-review-fixture'],
          quality_gate_refs: ['quality-gate:mag/fundability-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:mag/stage-policy-tightening',
          candidate_kind: 'stage_policy',
          target_ref: 'stage-policy-ref:mag/section-revision',
          evidence_refs: ['failure-taxonomy:mag/no-current-failure-fixture'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:mag/grant-section-smoke',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:mag/grant-section-smoke',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:mag/grant-section-smoke'],
          regression_suite_refs: ['regression-suite:mag/grant-stage-smoke'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:mag/agent-lab-fixture'],
        },
      }),
      task({
        task_id: 'agent-lab-task:rca/visual-deliverable-smoke',
        domain_id: 'redcube-ai',
        task_family: 'presentation_foundry_visual_delivery',
        environment: {
          environment_kind: 'fixture',
          workspace_locator_ref: 'workspace-locator:rca/sample-visual-deliverable',
          sandbox_policy: 'fixture_only_no_artifact_mutation',
          network_policy: 'offline',
        },
        instructions_ref: 'instructions:rca/visual-deliverable-smoke',
        agent_entry_ref: 'domain-agent-entry:redcube-ai',
        stage_refs: ['stage:rca/source-intake', 'stage:rca/render-review'],
        oracle_refs: ['oracle:rca/no-regression-fixture'],
        scorer_refs: ['scorer:rca/visual-quality-ref'],
        recovery_probes: [
          {
            probe_ref: 'recovery-probe:rca/artifact-restore',
            probe_kind: 'artifact_restore',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['restore-proof:rca/visual-fixture'],
          },
          {
            probe_ref: 'recovery-probe:rca/dead-letter-repair',
            probe_kind: 'dead_letter_repair',
            expected_status: 'passed',
            observed_status: 'passed',
            source_refs: ['repair-receipt:rca/render-retry-fixture'],
          },
        ],
        trajectory: {
          trajectory_ref: 'trajectory:rca/visual-deliverable-smoke',
          run_ref: 'run:rca/visual-deliverable-smoke',
          agent_executor: 'codex_cli',
          stage_attempt_refs: ['stage-attempt:rca/visual-deliverable-smoke'],
          tool_call_refs: ['tool-call:rca/render-html'],
          artifact_refs: ['artifact-ref:rca/visual-package-fixture'],
          receipt_refs: ['owner-receipt:rca/no-regression-fixture'],
          repair_refs: ['repair-ref:rca/render-review-retry'],
        },
        scorecard: {
          scorecard_ref: 'quality-scorecard:rca/visual-deliverable-smoke',
          domain_owned: true,
          opl_scorecard_role: 'scorecard_ref_projection_only',
          passed: true,
          metric_refs: ['metric-ref:rca/block-content-fit'],
          evidence_refs: ['evidence-ref:rca/screenshot-review-fixture'],
          review_refs: ['review-ref:rca/visual-review-fixture'],
          quality_gate_refs: ['quality-gate:rca/visual-owner'],
        },
        improvement_candidate: {
          candidate_ref: 'improvement-candidate:rca/render-policy-tightening',
          candidate_kind: 'tool_policy',
          target_ref: 'tool-policy-ref:rca/render-review',
          evidence_refs: ['failure-taxonomy:rca/no-current-failure-fixture'],
          allowed_change_scope: 'branch_only',
          promotion_gate_ref: 'promotion-gate:rca/visual-route-smoke',
        },
        promotion_gate: {
          gate_ref: 'promotion-gate:rca/visual-route-smoke',
          gate_status: 'passed',
          required_refs: ['quality-scorecard:rca/visual-deliverable-smoke'],
          regression_suite_refs: ['regression-suite:rca/visual-no-regression-smoke'],
          no_forbidden_write_proof_refs: ['no-forbidden-write:rca/agent-lab-fixture'],
        },
      }),
    ],
  };
}

export function buildSampleAgentLabResult() {
  return runAgentLabSuite(buildSampleAgentLabSuite());
}
