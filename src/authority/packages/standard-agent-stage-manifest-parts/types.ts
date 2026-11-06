import { STANDARD_AGENT_STAGE_MANIFEST_REF } from '../standard-agent-stage-prompt.ts';
import type {
  FamilyStageControlPlane,
  StageQualityScopeBudget,
} from '../../stages/index.ts';

export type JsonRecord = Record<string, unknown>;

export interface StandardAgentStageManifestCompilation {
  stage_control_plane: FamilyStageControlPlane;
  source_binding: {
    plane_id: string;
    canonical_agent_id: string;
    domain_id: string;
    descriptor_ref: string;
    action_catalog_ref: string;
    stage_manifest_ref: string;
    stage_manifest_sha256: string;
  };
}

export type StandardAgentStageQualityPolicy = {
  surface_kind: 'opl_stage_quality_cycle_policy';
  version: 'stage-quality-cycle-policy.v1';
  in_thread_refinement: {
    allowed: boolean;
    authoritative: false;
  };
  formal_review: {
    required: boolean;
    risk_tier: 'low' | 'medium' | 'high';
    review_depth: 'focused' | 'full' | 'multi_axis';
    attempt_internal_parallel_review_facets_allowed: boolean;
    context_isolation_required: true;
    max_repair_rounds: number;
    scope_budget: StageQualityScopeBudget;
  };
  budget_exhaustion: 'complete_with_quality_debt_if_consumable';
};

export type StandardAgentHandoffReviewBoundary = {
  artifact_effect:
    | 'reviewed_immutable_refs_only'
    | 'mechanical_repackaging_of_reviewed_bytes'
    | 'new_or_transformed_reviewable_bytes';
  freezes_canonical_artifact_bytes: boolean;
  issues_quality_export_publication_or_ready_claim: boolean;
  downstream_owner_retains_acceptance: boolean;
};

export type StandardAgentStageReviewLaneBinding =
  | {
    binding_kind: 'fixed';
    review_lane: string;
    executor_may_select_lane: false;
    lane_fallback: false;
  }
  | {
    binding_kind: 'controller_required';
    allowed_review_lanes: string[];
    executor_may_select_lane: false;
    lane_fallback: false;
  };

export type StandardAgentStageQualityRuntimeBinding = {
  surface_kind: 'opl_pack_bound_stage_quality_runtime_binding';
  version: 'opl-pack-bound-stage-quality-runtime-binding.v1';
  compile_mode?: 'target_stage_binding';
  stage_id: string;
  declared_stage_ids: string[];
  enabled: boolean;
  stage_role: string | null;
  policy_ref: string;
  stage_prompt_ref: string;
  quality_policy: StandardAgentStageQualityPolicy;
  route_budget?: {
    max_route_back_rounds: number;
    route_back_rounds_used: number;
  } | null;
  handoff_review_boundary: StandardAgentHandoffReviewBoundary | null;
  review_lane_binding?: StandardAgentStageReviewLaneBinding | null;
  role_prompt_refs: {
    producer: string;
    reviewer: string;
    repairer: string;
    re_reviewer: string;
  };
  quality_rubric_refs: string[];
  knowledge_refs: string[];
  skill_refs: string[];
  policy_refs: string[];
  stage_goal_refs: string[];
  source_refs: string[];
  lineage_refs: string[];
  manifest_ref: typeof STANDARD_AGENT_STAGE_MANIFEST_REF;
  manifest_sha256: string;
};

export type StandardAgentStageTargetBinding = {
  domainId: string;
  stage: JsonRecord;
  stageContract: JsonRecord;
  stagePolicyRef: string;
  stageIndex: number;
  declaredStageIds: string[];
  manifestSha256: string;
  policyRef: string | null;
  policy: StandardAgentStageQualityPolicy | null;
  metaReviewPolicy: JsonRecord | null;
  handoffReviewBoundary: StandardAgentHandoffReviewBoundary | null;
  qualityProfileRef: string | null;
};
