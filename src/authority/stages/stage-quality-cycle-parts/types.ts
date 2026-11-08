import type { StageQualityScopeBudget, StageQualityScopeBudgetStopReason } from ".././stage-quality-scope-budget.ts";

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
  knowledge_refs: string[];
  skill_refs: string[];
  policy_refs: string[];
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
