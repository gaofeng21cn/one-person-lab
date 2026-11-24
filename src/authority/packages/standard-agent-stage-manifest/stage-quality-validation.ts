import { isDeepStrictEqual } from 'node:util';

import { FrameworkContractError, isRecord } from '../../../kernel/contract-validation.ts';
import { optionalString } from '../../../kernel/json-file.ts';
import {
  normalizeStageQualityScopeBudget,
  type StageQualityScopeBudget,
} from '../../stages/index.ts';
import {
  readStandardAgentQualityRolePromptFile,
} from '../standard-agent-stage-prompt.ts';
import {
  fail,
  readJsonPointer,
  record,
  repoRef,
  strings,
  text,
} from './repo-validation.ts';
import type {
  JsonRecord,
  StandardAgentHandoffReviewBoundary,
  StandardAgentStageQualityPolicy,
  StandardAgentStageQualityRuntimeBinding,
  StandardAgentStageReviewLaneBinding,
} from './types.ts';

function handoffRequiresFormalReview(boundary: StandardAgentHandoffReviewBoundary | null) {
  return boundary !== null && (
    boundary.artifact_effect === 'new_or_transformed_reviewable_bytes'
    || boundary.freezes_canonical_artifact_bytes
    || boundary.issues_quality_export_publication_or_ready_claim
  );
}

export function handoffAllowsPrimaryOnly(boundary: StandardAgentHandoffReviewBoundary | null) {
  return boundary !== null
    && boundary.artifact_effect !== 'new_or_transformed_reviewable_bytes'
    && !boundary.freezes_canonical_artifact_bytes
    && !boundary.issues_quality_export_publication_or_ready_claim
    && boundary.downstream_owner_retains_acceptance;
}

export function reviewLaneBinding(
  stageContract: unknown,
  repoDir: string,
): StandardAgentStageReviewLaneBinding | null {
  if (!isRecord(stageContract)) return null;
  const transport = stageContract.review_input_snapshot_transport;
  if (!isRecord(transport)) {
    return null;
  }
  const field = 'stage.stage_contract.review_input_snapshot_transport';
  const declaredBinding = optionalString(transport.review_lane_binding);
  if (Object.hasOwn(transport, 'review_lane')) {
    const reviewLane = text(transport.review_lane, `${field}.review_lane`, repoDir);
    if (declaredBinding === 'controller_required') {
      fail(`${field}.review_lane cannot be combined with controller_required.`, {
        repo_dir: repoDir,
        field,
        review_lane_binding: declaredBinding,
      });
    }
    return {
      binding_kind: 'fixed',
      review_lane: reviewLane,
      executor_may_select_lane: false,
      lane_fallback: false,
    };
  }
  if (declaredBinding !== 'controller_required') {
    return null;
  }
  const allowedReviewLanes = strings(
    transport.allowed_review_lanes,
    `${field}.allowed_review_lanes`,
    repoDir,
  );
  if (
    allowedReviewLanes.length === 0
    || new Set(allowedReviewLanes).size !== allowedReviewLanes.length
  ) {
    fail(`${field}.allowed_review_lanes must contain unique values.`, {
      repo_dir: repoDir,
      field: `${field}.allowed_review_lanes`,
    });
  }
  if (transport.executor_may_select_lane !== false || transport.lane_fallback !== false) {
    fail(`${field} controller-required lane selection must fail closed.`, {
      repo_dir: repoDir,
      field,
    });
  }
  return {
    binding_kind: 'controller_required',
    allowed_review_lanes: allowedReviewLanes,
    executor_may_select_lane: false,
    lane_fallback: false,
  };
}

export function resolveStandardAgentStageReviewLane(
  binding: StandardAgentStageReviewLaneBinding | null | undefined,
  requestedReviewLane?: string | null,
): string | null {
  const requested = optionalString(requestedReviewLane);
  if (!binding) {
    if (requested) {
      throw new FrameworkContractError(
        'cli_usage_error',
        '--review-lane is only valid for a Stage with a declared review lane binding.',
        {
          failure_code: 'stage_review_lane_binding_not_declared',
          review_lane: requested,
        },
      );
    }
    return null;
  }
  if (binding.binding_kind === 'fixed') {
    if (requested && requested !== binding.review_lane) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'The requested review lane conflicts with the Stage fixed review lane.',
        {
          failure_code: 'stage_review_lane_binding_fixed_mismatch',
          review_lane: requested,
          fixed_review_lane: binding.review_lane,
        },
      );
    }
    return binding.review_lane;
  }
  if (!requested) return null;
  if (!binding.allowed_review_lanes.includes(requested)) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'The requested review lane is not declared by the Stage contract.',
      {
        failure_code: 'stage_review_lane_binding_invalid',
        review_lane: requested,
        allowed_review_lanes: binding.allowed_review_lanes,
      },
    );
  }
  return requested;
}

export function stageAttemptExecutorPolicyWithReviewLane(
  policy: Record<string, unknown> | null | undefined,
  reviewLane: string | null | undefined,
): Record<string, unknown> | null {
  const next = policy ? { ...policy } : {};
  delete next.review_lane_binding;
  if (reviewLane) next.review_lane_binding = reviewLane;
  return Object.keys(next).length > 0 ? next : null;
}

const QUALITY_ATTEMPT_FORBIDDEN_FIELDS = new Set([
  'next_stage_refs', 'requires', 'ensures', 'stage_route', 'sub_stage_graph',
  'independent_owner', 'stage_current_pointer', 'stage_transition_authority',
]);

function forbiddenQualityAttemptFields(value: unknown, prefix = '$'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => forbiddenQualityAttemptFields(entry, `${prefix}[${index}]`));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    ...(QUALITY_ATTEMPT_FORBIDDEN_FIELDS.has(key) ? [`${prefix}.${key}`] : []),
    ...forbiddenQualityAttemptFields(entry, `${prefix}.${key}`),
  ]);
}

function exactObjectKeys(value: JsonRecord, expected: string[], field: string, repoDir: string) {
  const received = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (!isDeepStrictEqual(received, sortedExpected)) {
    fail(`${field} fields do not match the Stage quality-cycle schema.`, {
      repo_dir: repoDir,
      expected_fields: sortedExpected,
      received_fields: received,
    });
  }
}

export function validateStageQualityCyclePolicy(input: {
  repoDir: string;
  ref: string;
  stageId: string;
  stagePromptRef: string;
  stageRole: string | null;
  handoffReviewBoundary: StandardAgentHandoffReviewBoundary | null;
}) {
  const policy = record(
    readJsonPointer(input.repoDir, input.ref, `stage_quality_cycle_policy:${input.stageId}`),
    `stage_quality_cycle_policy:${input.stageId}`,
    input.repoDir,
  );
  exactObjectKeys(policy, [
    'surface_kind', 'version', 'enabled', 'stage_prompt_ref', 'role_prompt_refs',
    'quality_rubric_refs', 'in_thread_refinement', 'formal_review', 'budget_exhaustion',
    'attempt_boundary',
  ], `stage_quality_cycle_policy:${input.stageId}`, input.repoDir);
  if (
    text(policy.surface_kind, 'stage_quality_cycle_policy.surface_kind', input.repoDir)
      !== 'opl_stage_quality_cycle_policy'
    || text(policy.version, 'stage_quality_cycle_policy.version', input.repoDir)
      !== 'stage-quality-cycle-policy.v1'
  ) {
    fail('Stage quality-cycle policy kind or version is invalid.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  if (typeof policy.enabled !== 'boolean') {
    fail('Stage quality-cycle policy enabled must be boolean.', { repo_dir: input.repoDir, stage_id: input.stageId });
  }
  const enabled = policy.enabled;
  const policyStagePromptRef = text(policy.stage_prompt_ref, 'stage_quality_cycle_policy.stage_prompt_ref', input.repoDir);
  if (policyStagePromptRef !== input.stagePromptRef) {
    fail('Stage quality-cycle policy must inherit the Stage prompt.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
      stage_prompt_ref: input.stagePromptRef,
      policy_stage_prompt_ref: policyStagePromptRef,
    });
  }
  repoRef(input.repoDir, policyStagePromptRef, 'stage_quality_cycle_policy.stage_prompt_ref');
  const rolePrompts = record(policy.role_prompt_refs, 'stage_quality_cycle_policy.role_prompt_refs', input.repoDir);
  exactObjectKeys(rolePrompts, ['producer', 'reviewer', 'repairer', 're_reviewer'],
    'stage_quality_cycle_policy.role_prompt_refs', input.repoDir);
  const normalizedRolePrompts = {
    producer: repoRef(input.repoDir, rolePrompts.producer, 'stage_quality_cycle_policy.role_prompt_refs.producer'),
    reviewer: repoRef(input.repoDir, rolePrompts.reviewer, 'stage_quality_cycle_policy.role_prompt_refs.reviewer'),
    repairer: repoRef(input.repoDir, rolePrompts.repairer, 'stage_quality_cycle_policy.role_prompt_refs.repairer'),
    re_reviewer: repoRef(input.repoDir, rolePrompts.re_reviewer, 'stage_quality_cycle_policy.role_prompt_refs.re_reviewer'),
  };
  for (const promptRef of Object.values(normalizedRolePrompts)) {
    readStandardAgentQualityRolePromptFile(input.repoDir, promptRef);
  }
  const rubricRefs = strings(policy.quality_rubric_refs, 'stage_quality_cycle_policy.quality_rubric_refs', input.repoDir);
  if (rubricRefs.length === 0) {
    fail('Stage quality-cycle policy requires at least one quality rubric ref.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  for (const rubricRef of rubricRefs) {
    repoRef(input.repoDir, rubricRef, 'stage_quality_cycle_policy.quality_rubric_refs');
  }
  const refinement = record(policy.in_thread_refinement, 'stage_quality_cycle_policy.in_thread_refinement', input.repoDir);
  exactObjectKeys(refinement, ['allowed', 'authoritative'],
    'stage_quality_cycle_policy.in_thread_refinement', input.repoDir);
  if (typeof refinement.allowed !== 'boolean' || refinement.authoritative !== false) {
    fail('in_thread_refinement must be non-authoritative.', { repo_dir: input.repoDir, stage_id: input.stageId });
  }
  const formalReview = record(policy.formal_review, 'stage_quality_cycle_policy.formal_review', input.repoDir);
  exactObjectKeys(formalReview, [
    'required', 'risk_tier', 'review_depth', 'context_isolation_required', 'max_repair_rounds',
    ...(Object.hasOwn(formalReview, 'scope_budget') ? ['scope_budget'] : []),
  ], 'stage_quality_cycle_policy.formal_review', input.repoDir);
  const maxRepairRounds = formalReview.max_repair_rounds;
  if (
    typeof formalReview.required !== 'boolean'
    || !['low', 'medium', 'high'].includes(String(formalReview.risk_tier))
    || !['focused', 'full', 'multi_axis'].includes(String(formalReview.review_depth))
    || formalReview.context_isolation_required !== true
    || !Number.isInteger(maxRepairRounds)
    || Number(maxRepairRounds) < 0
    || Number(maxRepairRounds) > 3
  ) {
    fail('formal_review does not match the bounded Stage quality-cycle contract.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  if (input.stageRole === 'cross_stage_meta_review' && formalReview.required !== false) {
    fail('Cross-stage Meta Review Stage must not recursively require another formal Stage Review.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  if (formalReview.required === true && !enabled) {
    fail('Required formal Stage Review cannot be disabled at runtime.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
      blocker: 'required_formal_review_runtime_disabled',
    });
  }
  if (handoffRequiresFormalReview(input.handoffReviewBoundary) && formalReview.required !== true) {
    fail('Handoff that creates reviewable delivery bytes or issues a ready claim requires formal Stage Review.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
      blocker: 'handoff_final_bytes_or_ready_claim_requires_formal_review',
    });
  }
  if (
    input.handoffReviewBoundary !== null
    && formalReview.required === false
    && !handoffAllowsPrimaryOnly(input.handoffReviewBoundary)
  ) {
    fail('Primary-only Handoff is limited to reviewed refs or mechanical repackaging with downstream owner acceptance.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
      blocker: 'handoff_primary_only_boundary_invalid',
    });
  }
  if (policy.budget_exhaustion !== 'complete_with_quality_debt_if_consumable') {
    fail('Stage quality-cycle budget exhaustion policy is invalid.', { repo_dir: input.repoDir, stage_id: input.stageId });
  }
  const attemptBoundary = record(policy.attempt_boundary, 'stage_quality_cycle_policy.attempt_boundary', input.repoDir);
  exactObjectKeys(attemptBoundary, [
    'inherits_stage_goal_scope_authority', 'role_overlay_may_only_narrow',
    'controller_creates_next_attempt', 'attempt_is_not_sub_stage',
  ], 'stage_quality_cycle_policy.attempt_boundary', input.repoDir);
  if (Object.values(attemptBoundary).some((value) => value !== true)) {
    fail('Stage quality-cycle attempt boundary flags must all be true.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  const forbiddenFields = forbiddenQualityAttemptFields(policy);
  if (forbiddenFields.length > 0) {
    fail('Stage quality-cycle policy cannot define nested Stage semantics.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
      forbidden_fields: forbiddenFields,
    });
  }
  const riskTier = formalReview.risk_tier as StandardAgentStageQualityPolicy['formal_review']['risk_tier'];
  const scopeBudget = normalizeStageQualityScopeBudget(formalReview.scope_budget, {
    legacyMaxRepairRounds: Number(maxRepairRounds),
  });
  return {
    enabled,
    stage_prompt_ref: policyStagePromptRef,
    role_prompt_refs: normalizedRolePrompts,
    quality_rubric_refs: rubricRefs,
    handoff_review_boundary: input.handoffReviewBoundary,
    quality_policy: {
      surface_kind: 'opl_stage_quality_cycle_policy',
      version: 'stage-quality-cycle-policy.v1',
      in_thread_refinement: {
        allowed: refinement.allowed as boolean,
        authoritative: false,
      },
      formal_review: {
        required: formalReview.required as boolean,
        risk_tier: riskTier,
        review_depth: formalReview.review_depth as StandardAgentStageQualityPolicy['formal_review']['review_depth'],
        attempt_internal_parallel_review_facets_allowed: riskTier === 'high',
        context_isolation_required: true,
        max_repair_rounds: Number(maxRepairRounds),
        scope_budget: scopeBudget,
      },
      budget_exhaustion: 'complete_with_quality_debt_if_consumable',
    },
  } satisfies Omit<
    StandardAgentStageQualityRuntimeBinding,
    | 'surface_kind'
    | 'version'
    | 'stage_id'
    | 'declared_stage_ids'
    | 'stage_role'
    | 'policy_ref'
    | 'stage_goal_refs'
    | 'knowledge_refs'
    | 'skill_refs'
    | 'policy_refs'
    | 'source_refs'
    | 'lineage_refs'
    | 'manifest_ref'
    | 'manifest_sha256'
  >;
}

export function validateHandoffReviewBoundary(input: {
  repoDir: string;
  stageId: string;
  stageKind: string;
  value: unknown;
}): StandardAgentHandoffReviewBoundary | null {
  if (input.stageKind !== 'packaging') {
    if (input.value !== undefined) {
      fail('handoff_review_boundary is only valid for packaging Handoff stages.', {
        repo_dir: input.repoDir,
        stage_id: input.stageId,
      });
    }
    return null;
  }
  const boundary = record(input.value, 'stage.handoff_review_boundary', input.repoDir);
  const fields = [
    'artifact_effect',
    'freezes_canonical_artifact_bytes',
    'issues_quality_export_publication_or_ready_claim',
    'downstream_owner_retains_acceptance',
  ];
  exactObjectKeys(boundary, fields, 'stage.handoff_review_boundary', input.repoDir);
  if (![
    'reviewed_immutable_refs_only',
    'mechanical_repackaging_of_reviewed_bytes',
    'new_or_transformed_reviewable_bytes',
  ].includes(String(boundary.artifact_effect))) {
    fail('stage.handoff_review_boundary.artifact_effect is invalid.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  if (
    typeof boundary.freezes_canonical_artifact_bytes !== 'boolean'
    || typeof boundary.issues_quality_export_publication_or_ready_claim !== 'boolean'
    || typeof boundary.downstream_owner_retains_acceptance !== 'boolean'
  ) {
    fail('stage.handoff_review_boundary flags must be boolean.', {
      repo_dir: input.repoDir,
      stage_id: input.stageId,
    });
  }
  const normalized = boundary as StandardAgentHandoffReviewBoundary;
  return normalized;
}
