import type {
  StageQualityAttemptRole,
  StageQualityCyclePolicy,
  StageQualityFinding,
  StageQualityFindingClosure,
  StageQualityRepairMapEntry,
  StageReviewReceipt,
} from '../stagecraft/index.ts';
import type { FamilyRuntimeDomainId } from './family-runtime-types.ts';

export type TemporalStageRunQualityRolePromptRefs = {
  producer: string;
  reviewer: string;
  repairer: string;
  re_reviewer: string;
};

export type TemporalStageRunWorkflowInput = {
  stage_run_id: string;
  workflow_id: string;
  domain_id: FamilyRuntimeDomainId;
  stage_id: string;
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
  blocked_reason: string | null;
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
