export type JsonRecord = Record<string, unknown>;

export type AgentLabDomainId = 'med-autoscience' | 'med-autogrant' | 'redcube-ai' | string;
export type AgentLabStatus = 'passed' | 'blocked';
export type AgentLabIndependentAiReviewStatus = 'approved' | 'review_pending' | 'blocked_from_auto_promotion';
export type AgentLabPromotionRiskTier = 'low_risk' | 'medium_risk' | 'high_risk';
export type AgentLabPromotionSafetyStatus =
  | 'regression_guard_only'
  | 'promotion_ready'
  | 'promotion_blocked'
  | 'owner_or_human_gate_required';

export type AgentLabStageCompletionPolicy = {
  surface_kind: 'domain_stage_completion_policy' | string;
  policy_ref: string;
  completion_judgment_owner: 'domain_stage' | string;
  closeout_packet_required: boolean;
  raw_artifact_sufficient_for_progress: boolean;
  provider_completion_is_domain_completion: boolean;
  opl_content_judgment_allowed: boolean;
  next_stage_transition_owner: 'codex_cli' | string;
  required_closeout_outcomes: string[];
  accepted_closeout_ref_fields: string[];
  authority_boundary?: JsonRecord;
};

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
  stage_completion_policy?: AgentLabStageCompletionPolicy;
  mechanism_evolution_inputs?: JsonRecord;
  executor_capability_aperture?: JsonRecord;
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
  executor_capability_aperture?: JsonRecord;
  command_refs?: string[];
  file_refs?: string[];
  subagent_refs?: string[];
  worktree_refs?: string[];
  test_refs?: string[];
  web_source_refs?: string[];
  typed_blocker_refs?: string[];
  review_receipt_refs?: string[];
  next_run_falsification_refs?: string[];
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

export type AgentLabEvaluationProvenanceBinding = {
  receipt_role:
    | 'evaluation_packet'
    | 'recovery_probe_observation'
    | 'trajectory_observation'
    | 'scorecard_observation'
    | 'promotion_gate_observation'
    | 'stage_completion_policy'
    | 'production_evidence_gate_observation';
  receipt_ref: string;
  task_id?: string;
  probe_ref?: string;
};

export type AgentLabEvaluationTargetAgent = {
  domain_id: string;
  target_agent_ref: string;
  descriptor_ref: string;
};

export type AgentLabSuite = {
  suite_id: string;
  suite_kind?: 'agent_lab_sample_suite' | 'agent_lab_longline_suite' | 'agent_production_evidence_suite' | string;
  tasks: AgentLabTaskManifest[];
  required_observations?: AgentLabObservationKey[];
  longline_summary?: AgentLabLonglineSummaryInput;
  production_evidence_gate?: JsonRecord;
  evaluation_provenance_refs?: string[];
  evaluation_provenance_bindings?: AgentLabEvaluationProvenanceBinding[];
  evaluation_target_agent?: AgentLabEvaluationTargetAgent;
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
  | 'domain_stage_completion_policies_observed'
  | 'recovery_probes_observed'
  | 'domain_quality_scorecard_refs_observed'
  | 'failure_taxonomy_observed'
  | 'improvement_candidates_observed'
  | 'promotion_gates_observed'
  | 'no_memory_body_observed'
  | 'forbidden_authority_flags_all_false';

export const REQUIRED_OBSERVATIONS: AgentLabObservationKey[] = [
  'task_manifests_observed',
  'agent_trajectories_observed',
  'domain_stage_completion_policies_observed',
  'recovery_probes_observed',
  'domain_quality_scorecard_refs_observed',
  'failure_taxonomy_observed',
  'improvement_candidates_observed',
  'promotion_gates_observed',
  'no_memory_body_observed',
  'forbidden_authority_flags_all_false',
];

export const FORBIDDEN_MEMORY_BODY_KEYS = [
  'memory_body',
  'memory_content',
  'memory_payload',
  'accepted_memory_body',
  'rejected_memory_body',
];

export const ADVISORY_ONLY_PROMOTION_PREFIXES = [
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

export const ADVISORY_ONLY_PROMOTION_TOKENS = [
  'fixture',
  'schema_completeness',
  'schema-completeness',
  'schema_complete',
  'schema-complete',
  'provider_completion',
  'provider-completion',
  'scorecard',
];

export const REQUIRED_STAGE_CLOSEOUT_OUTCOMES = [
  'completed_and_continue',
  'completed_and_wait_owner',
  'route_back',
  'blocked',
  'rejected',
];

export const REQUIRED_STAGE_CLOSEOUT_REF_FIELDS = [
  'owner_receipt_ref',
  'typed_blocker_ref',
  'human_gate_ref',
  'route_back_ref',
];
