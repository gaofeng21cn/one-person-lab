import type {
  StageQualityRouteRecommendationRecord,
  StageQualityAttemptRole,
  StageQualityCyclePolicy,
  StageQualityFinding,
  StageQualityFindingClosure,
  StageQualityHardStopClass,
  StageQualityRepairMapEntry,
  StageReviewReceipt,
  StageRouteDecision,
} from '../stagecraft/index.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';
import type { StageRunImmutableSpec } from './family-runtime-stage-run-identity.ts';

export type TemporalStageRunQualityRolePromptRefs = {
  producer: string;
  reviewer: string;
  repairer: string;
  re_reviewer: string;
};

export type TemporalStageRunWorkflowInput = {
  stage_run_id: string;
  stage_run_invocation_id: string;
  stage_run_spec_sha256: string;
  stage_run_spec: StageRunImmutableSpec;
  parent_route_decision_ref: string | null;
  workflow_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  action_id?: string | null;
  task_id?: string | null;
  declared_stage_ids: string[];
  workspace_locator: Record<string, unknown>;
  source_fingerprint: string | null;
  executor_kind: string;
  stage_attempt_executor_policy?: Record<string, unknown> | null;
  stage_packet_ref: string;
  checkpoint_refs?: string[];
  quality_policy_ref: string;
  domain_pack_root: string;
  stage_manifest_ref: string;
  stage_manifest_sha256: string;
  stage_role: string | null;
  quality_policy: StageQualityCyclePolicy;
  role_prompt_refs: TemporalStageRunQualityRolePromptRefs;
  quality_rubric_refs: string[];
  stage_goal_refs?: string[];
  source_refs?: string[];
  artifact_refs?: string[];
  artifact_hashes?: string[];
  lineage_refs?: string[];
};

export type TemporalStageRunRouteLaunchInput = {
  parent_stage_run: TemporalStageRunWorkflowInput;
  decisive_attempt_ref: string;
  decision: StageRouteDecision;
  artifact_refs: string[];
  artifact_hashes: string[];
};

export type TemporalStageRunRouteLaunchReceipt = {
  surface_kind: 'opl_stage_run_route_launch_receipt';
  version: 'opl-stage-run-route-launch-receipt.v1';
  materialization_status: 'workflow_complete' | 'launched' | 'existing';
  parent_stage_run_id: string;
  decisive_attempt_ref: string;
  parent_route_decision_ref: string;
  route_decision_sha256: string;
  decision: StageRouteDecision;
  target_stage_run_id: string | null;
  target_stage_run_invocation_id: string | null;
  target_stage_run_spec_sha256: string | null;
  target_workflow_id: string | null;
  durable_launch: Record<string, unknown> | null;
  authority_boundary: {
    semantic_route_decision_owner: 'decisive_codex_attempt';
    stage_transition_materialization_owner: 'opl_stage_run_controller';
    opl_can_select_semantic_stage_route: false;
  };
};

export type TemporalStageQualityAttemptMaterializationInput = {
  stage_run: TemporalStageRunWorkflowInput;
  quality_cycle_id: string;
  attempt_role: StageQualityAttemptRole;
  quality_round_index: number;
  parent_attempt_ref?: string | null;
  artifact_refs: string[];
  artifact_hashes: string[];
  artifact_identity_receipt_refs: string[];
  findings?: StageQualityFinding[];
  repair_map?: StageQualityRepairMapEntry[];
  route_recommendations?: StageQualityRouteRecommendationRecord[];
};

export type TemporalStageQualityCycleProjectionInput = {
  stage_run: TemporalStageRunWorkflowInput;
  state: TemporalStageRunWorkflowState;
};

export type TemporalStageQualityAttemptSyncInput = {
  attempt_ref: string;
  workflow_state: import('./family-runtime-temporal.ts').TemporalStageAttemptWorkflowState;
};

export type TemporalStageQualityReviewReceiptInput = {
  producer_attempt_ref: string;
  reviewer_attempt_ref: string;
  rubric_refs: string[];
  verdict: StageReviewReceipt['verdict'];
};

export type TemporalStageRunAttemptSummary = {
  attempt_role: StageQualityAttemptRole;
  quality_round_index: number;
  stage_attempt_id: string;
  workflow_id: string;
  execution_session_ref: string | null;
  status: 'registered' | 'running' | 'checkpointed' | 'blocked' | 'human_gate' | 'completed' | 'failed';
  artifact_refs: string[];
  artifact_hashes: string[];
  artifact_identity_receipt_refs: string[];
};

export type TemporalStageRunWorkflowState = {
  surface_kind: 'temporal_stage_run_query';
  provider_kind: 'temporal';
  stage_run_id: string;
  workflow_id: string;
  quality_cycle_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
  status: 'registered' | 'running' | 'completed' | 'completed_with_quality_debt' | 'blocked' | 'human_gate' | 'failed';
  current_role: StageQualityAttemptRole | null;
  repair_rounds_used: number;
  max_repair_rounds: number;
  attempts: TemporalStageRunAttemptSummary[];
  findings: StageQualityFinding[];
  repair_map: StageQualityRepairMapEntry[];
  finding_closures: StageQualityFindingClosure[];
  review_receipts: StageReviewReceipt[];
  artifact_refs: string[];
  artifact_hashes: string[];
  artifact_identity_receipt_refs: string[];
  quality_debt_refs: string[];
  route_quality_debt_refs: string[];
  decisive_attempt_role: StageQualityAttemptRole | null;
  decisive_attempt_ref: string | null;
  selected_stage_route: StageRouteDecision | null;
  route_evidence_refs: string[];
  route_recommendations: StageQualityRouteRecommendationRecord[];
  next_stage_run_launch: TemporalStageRunRouteLaunchReceipt | null;
  blocked_reason: string | null;
  hard_stop_class: StageQualityHardStopClass | null;
  typed_blocker_refs: string[];
  human_gate_refs: string[];
  source_attempt_ref: string | null;
  sqlite_projection: {
    status: 'pending' | 'synced' | 'failed';
    error: string | null;
  };
  started_at: string;
  updated_at: string;
  authority_boundary: {
    opl: 'durable_quality_loop_orchestration_and_refs_transport_only';
    domain: 'review_findings_repair_artifact_and_quality_verdict_owner';
    provider_completion_is_domain_ready: false;
  };
};
