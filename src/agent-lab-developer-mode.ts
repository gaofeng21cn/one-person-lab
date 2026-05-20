import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { stableId } from './family-runtime-ids.ts';

type JsonRecord = Record<string, unknown>;

type DeveloperModeRouteDecision = 'blocked' | 'observe-only' | 'direct-fix' | 'fork-PR' | 'mixed';
type DeveloperModeRouteEligibility =
  | 'blocked_developer_mode_projection'
  | 'blocked_repo_permission'
  | 'blocked_owner_acceptance_ref_must_be_external_owner_ref'
  | 'eligible_observe_only'
  | 'eligible_direct_fix'
  | 'eligible_fork_pr'
  | 'eligible_mixed_routes';

type DeveloperModeProjectionLike = {
  surface_id?: unknown;
  status?: unknown;
  effective_state?: unknown;
  allowed_route?: unknown;
  mode?: unknown;
  repo_authority?: unknown;
};

type RepoPermissionLike = {
  target_id?: unknown;
  repo?: unknown;
  repo_url?: unknown;
  status?: unknown;
  permission?: unknown;
  direct_write_allowed?: unknown;
  allowed_route?: unknown;
  direct_write_repo_count?: unknown;
  pr_route_repo_count?: unknown;
  blocked_repo_count?: unknown;
};

type PatrolObservationRefsInput = string[] | {
  patrol_observation_ref?: unknown;
  issue_ref?: unknown;
  blocker_ref?: unknown;
  diff_ref?: unknown;
  verification_refs?: unknown;
  no_forbidden_write_ref?: unknown;
  commit_ref?: unknown;
  fork_repo_ref?: unknown;
  pr_review_ref?: unknown;
  owner_acceptance_ref?: unknown;
};

export type DeveloperModeAgentLabRepairRouteInput = {
  developer_mode_projection: DeveloperModeProjectionLike;
  repo_permission: RepoPermissionLike;
  patrol_observation_refs: PatrolObservationRefsInput;
};

const AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  can_train_or_deploy_model_weights: false,
};

export const DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY = {
  ...AUTHORITY_BOUNDARY,
  opl: 'agent_lab_developer_mode_patrol_repair_route_projection_refs_only',
  can_emit_issue_or_blocker_refs: true,
  can_emit_candidate_fix_refs: true,
  can_emit_repo_worktree_branch_refs: true,
  can_emit_pr_refs: true,
  can_emit_acceptance_evidence_refs: true,
  can_emit_follow_up_queue_item_refs: true,
  writes_domain_truth: false,
  writes_domain_artifact: false,
  writes_memory_body: false,
  writes_quality_verdict: false,
  writes_owner_receipt: false,
  modifies_managed_runtime: false,
  writes_follow_up_queue_body: false,
};

export const DEVELOPER_MODE_DYNAMIC_ROUTE_BUILDER = {
  surface_kind: 'opl_agent_lab_developer_mode_dynamic_repair_route',
  input_refs: [
    'developer_mode_projection_ref',
    'repo_permission_ref',
    'patrol_observation_ref',
  ],
  output_route_decisions: ['blocked', 'observe-only', 'direct-fix', 'fork-PR', 'mixed'],
  closeout_ref_fields: [
    'developer_mode_projection_ref',
    'route_eligibility',
    'patrol_observation_ref',
    'diff_ref',
    'verification_refs',
    'no_forbidden_write_ref',
    'commit_ref',
    'fork_repo_ref',
    'pr_review_ref',
    'owner_acceptance_ref',
  ],
  owner_acceptance_ref_policy: 'external_owner_ref_only',
};

function unique(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return unique(value.filter((entry): entry is string => typeof entry === 'string'));
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstObservationRef(input: PatrolObservationRefsInput) {
  if (Array.isArray(input)) {
    return stringList(input)[0] ?? null;
  }
  return text(input.patrol_observation_ref);
}

function observationRefs(input: PatrolObservationRefsInput) {
  if (Array.isArray(input)) {
    return {
      patrol_observation_ref: stringList(input)[0] ?? null,
      issue_ref: null,
      blocker_ref: null,
      diff_ref: null,
      verification_refs: [],
      no_forbidden_write_ref: null,
      commit_ref: null,
      fork_repo_ref: null,
      pr_review_ref: null,
      owner_acceptance_ref: null,
    };
  }

  return {
    patrol_observation_ref: firstObservationRef(input),
    issue_ref: text(input.issue_ref),
    blocker_ref: text(input.blocker_ref),
    diff_ref: text(input.diff_ref),
    verification_refs: stringList(input.verification_refs),
    no_forbidden_write_ref: text(input.no_forbidden_write_ref),
    commit_ref: text(input.commit_ref),
    fork_repo_ref: text(input.fork_repo_ref),
    pr_review_ref: text(input.pr_review_ref),
    owner_acceptance_ref: text(input.owner_acceptance_ref),
  };
}

function buildDeveloperModeProjectionRef(projection: DeveloperModeProjectionLike) {
  return stableId('odmp', [
    projection.surface_id,
    projection.status,
    projection.effective_state,
    projection.allowed_route,
    projection.mode,
  ]);
}

function routeEligibility(
  projection: DeveloperModeProjectionLike,
  repoPermission: RepoPermissionLike,
): {
  decision: DeveloperModeRouteDecision;
  eligibility: DeveloperModeRouteEligibility;
} {
  const projectionStatus = text(projection.status);
  const projectionRoute = text(projection.allowed_route);
  const projectionState = text(projection.effective_state);

  if (projectionStatus === 'blocked' || projectionStatus === 'disabled' || projectionRoute === 'blocked'
    || projectionRoute === 'disabled') {
    return {
      decision: 'blocked',
      eligibility: 'blocked_developer_mode_projection',
    };
  }

  if (projectionRoute === 'observe_only' || projectionState === 'observe_only') {
    return {
      decision: 'observe-only',
      eligibility: 'eligible_observe_only',
    };
  }

  const repoStatus = text(repoPermission.status);
  const repoRoute = text(repoPermission.allowed_route);
  if (repoStatus === 'blocked' || repoRoute === 'blocked') {
    return {
      decision: 'blocked',
      eligibility: 'blocked_repo_permission',
    };
  }

  const directWriteCount = typeof repoPermission.direct_write_repo_count === 'number'
    ? repoPermission.direct_write_repo_count
    : 0;
  const prRouteCount = typeof repoPermission.pr_route_repo_count === 'number'
    ? repoPermission.pr_route_repo_count
    : 0;
  if (projectionRoute === 'mixed_direct_and_pr'
    && directWriteCount > 0
    && prRouteCount > 0
    && !('direct_write_allowed' in repoPermission)) {
    return {
      decision: 'mixed',
      eligibility: 'eligible_mixed_routes',
    };
  }

  if (repoPermission.direct_write_allowed === true || repoRoute === 'direct_repo_fix') {
    return {
      decision: 'direct-fix',
      eligibility: 'eligible_direct_fix',
    };
  }

  if (repoRoute === 'fork_pull_request' || projectionRoute === 'fork_pull_request') {
    return {
      decision: 'fork-PR',
      eligibility: 'eligible_fork_pr',
    };
  }

  if (projectionRoute === 'mixed_direct_and_pr') {
    return {
      decision: 'mixed',
      eligibility: 'eligible_mixed_routes',
    };
  }

  return {
    decision: 'blocked',
    eligibility: 'blocked_repo_permission',
  };
}

function ownerAcceptanceRef(value: string | null) {
  if (!value) {
    return null;
  }
  if (value.startsWith('external-owner-ref:') || value.startsWith('external-owner-acceptance-ref:')) {
    return value;
  }
  return null;
}

function requiredCloseoutRefsFor(decision: DeveloperModeRouteDecision) {
  if (decision === 'direct-fix') {
    return ['diff_ref', 'verification_refs', 'no_forbidden_write_ref', 'commit_ref'] as const;
  }
  if (decision === 'fork-PR') {
    return ['diff_ref', 'verification_refs', 'no_forbidden_write_ref', 'fork_repo_ref', 'pr_review_ref'] as const;
  }
  if (decision === 'mixed') {
    return ['patrol_observation_ref'] as const;
  }
  if (decision === 'observe-only') {
    return ['patrol_observation_ref', 'diff_ref', 'verification_refs', 'no_forbidden_write_ref'] as const;
  }
  return ['patrol_observation_ref'] as const;
}

function closeoutMissingRefs(
  decision: DeveloperModeRouteDecision,
  refs: ReturnType<typeof observationRefs>,
  sanitizedOwnerAcceptanceRef: string | null,
  rawOwnerAcceptanceRef: string | null,
) {
  const missing: string[] = requiredCloseoutRefsFor(decision).filter((field) => {
    const value = refs[field];
    return Array.isArray(value) ? value.length === 0 : !value;
  });

  if (
    (rawOwnerAcceptanceRef && !sanitizedOwnerAcceptanceRef)
    || (decision === 'observe-only' && !sanitizedOwnerAcceptanceRef)
  ) {
    missing.push('external_owner_acceptance_ref');
  }

  return unique(missing);
}

export function buildDeveloperModeAgentLabRepairRoute(input: DeveloperModeAgentLabRepairRouteInput) {
  const refs = observationRefs(input.patrol_observation_refs);
  const initial = routeEligibility(input.developer_mode_projection, input.repo_permission);
  const sanitizedOwnerAcceptanceRef = ownerAcceptanceRef(refs.owner_acceptance_ref);
  const ownerAcceptanceBlocked = Boolean(refs.owner_acceptance_ref) && !sanitizedOwnerAcceptanceRef;
  const decision = ownerAcceptanceBlocked ? 'blocked' : initial.decision;
  const eligibility: DeveloperModeRouteEligibility = ownerAcceptanceBlocked
    ? 'blocked_owner_acceptance_ref_must_be_external_owner_ref'
    : initial.eligibility;
  const developerModeProjectionRef = buildDeveloperModeProjectionRef(input.developer_mode_projection);
  const missingCloseoutRefs = closeoutMissingRefs(
    initial.decision,
    refs,
    sanitizedOwnerAcceptanceRef,
    refs.owner_acceptance_ref,
  );

  return {
    surface_kind: 'opl_agent_lab_developer_mode_dynamic_repair_route',
    version: 'opl-agent-lab.v1.developer-mode-dynamic-repair-route',
    route_ref: stableId('oaldmr', [
      developerModeProjectionRef,
      input.repo_permission,
      refs.patrol_observation_ref,
      initial.eligibility,
    ]),
    route_decision: decision,
    route_status: missingCloseoutRefs.length === 0 && decision !== 'blocked'
      ? 'closeout_refs_ready'
      : decision === 'blocked'
        ? 'blocked'
        : 'closeout_refs_incomplete',
    developer_mode_projection_ref: developerModeProjectionRef,
    patrol_observation_refs: unique([
      refs.patrol_observation_ref ?? '',
      refs.issue_ref ?? '',
      refs.blocker_ref ?? '',
    ]),
    repo_permission: isRecord(input.repo_permission) ? input.repo_permission : {},
    issue_ref: refs.issue_ref,
    blocker_ref: refs.blocker_ref,
    closeout_refs: {
      developer_mode_projection_ref: developerModeProjectionRef,
      route_eligibility: eligibility,
      patrol_observation_ref: refs.patrol_observation_ref,
      diff_ref: refs.diff_ref,
      verification_refs: refs.verification_refs,
      no_forbidden_write_ref: refs.no_forbidden_write_ref,
      commit_ref: decision === 'direct-fix' ? refs.commit_ref : null,
      fork_repo_ref: decision === 'fork-PR' ? refs.fork_repo_ref : null,
      pr_review_ref: decision === 'fork-PR' ? refs.pr_review_ref : null,
      owner_acceptance_ref: sanitizedOwnerAcceptanceRef,
    },
    missing_closeout_refs: missingCloseoutRefs,
    refs_only: true,
    authority_boundary: DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY,
    non_goals: [
      'does_not_write_owner_receipt',
      'does_not_write_domain_truth',
      'does_not_write_memory_body',
      'does_not_mutate_artifact_body',
      'does_not_modify_managed_runtime',
    ],
  };
}

export function buildDeveloperModeAgentLabRepairRouteReadModel() {
  const routes = [
    {
      route_ref: 'developer-mode-repair-route:mas/repo-developer-direct-fix',
      route_mode: 'repo_developer_direct_fix',
      route_status: 'candidate_fix_ref_ready',
      domain_id: 'med-autoscience',
      repo_ref: 'github-repo:gaofeng21cn/med-autoscience',
      issue_ref: 'issue-ref:mas/agent-call-interface-blocker',
      blocker_ref: 'blocker-ref:mas/agent-call-interface-regression',
      owner_route_ref: 'owner-route:med-autoscience/repo-developer',
      github_actor_ref: 'github-user:gaofeng21cn',
      repo_developer_match_required: true,
      candidate_fix_ref: 'candidate-fix-ref:mas/agent-call-interface-blocker',
      repo_worktree_ref: 'repo-worktree-ref:med-autoscience/codex/developer-mode-repair',
      branch_ref: 'git-branch-ref:med-autoscience/codex/developer-mode-repair',
      pr_ref: 'github-pr-ref:med-autoscience/developer-mode-repair-review',
      acceptance_evidence_ref: 'acceptance-evidence-ref:mas/agent-call-interface-tests',
      follow_up_queue_item_ref: 'queue-item-ref:agent-lab/developer-mode/mas-agent-call-interface-blocker',
      authority_boundary: DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY,
    },
    {
      route_ref: 'developer-mode-repair-route:rca/fork-pr',
      route_mode: 'fork_pull_request',
      route_status: 'pull_request_ref_ready',
      domain_id: 'redcube-ai',
      repo_ref: 'github-repo:redcube-ai/redcube-ai',
      issue_ref: 'issue-ref:rca/patrol-render-blocker',
      blocker_ref: 'blocker-ref:rca/render-review-regression',
      owner_route_ref: 'owner-route:redcube-ai/fork-pr',
      github_actor_ref: 'github-user:developer-mode-operator',
      repo_developer_match_required: false,
      candidate_fix_ref: 'candidate-fix-ref:rca/patrol-render-blocker',
      repo_worktree_ref: 'repo-worktree-ref:redcube-ai/fork/codex/developer-mode-patrol',
      branch_ref: 'git-branch-ref:fork/redcube-ai/codex/developer-mode-patrol',
      pr_ref: 'github-pr-ref:redcube-ai/patrol-render-blocker',
      acceptance_evidence_ref: 'acceptance-evidence-ref:rca/render-review-regression-tests',
      follow_up_queue_item_ref: 'queue-item-ref:agent-lab/developer-mode/rca-render-review-regression',
      authority_boundary: DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY,
    },
  ];

  return {
    surface_kind: 'opl_agent_lab_developer_mode_repair_route_read_model',
    version: 'opl-agent-lab.v1.developer-mode-repair-route',
    read_model_id: stableId('oaldmr', [routes]),
    status: 'ready_for_developer_mode_patrol_consumption',
    developer_mode_required: true,
    refs_only: true,
    dynamic_route_builder: DEVELOPER_MODE_DYNAMIC_ROUTE_BUILDER,
    inputs: {
      issue_or_blocker_ref: 'issue_ref | blocker_ref',
      github_identity_ref: 'github-user-ref',
      repo_authority_ref: 'repo-authority-ref',
      patrol_observation_ref: 'agent-lab-patrol-observation-ref',
    },
    route_policy: {
      repo_developer_match: 'route_to_repo_developer_direct_fix_branch',
      no_repo_developer_match: 'route_to_fork_pull_request',
      developer_mode_disabled: 'projection_visible_but_execution_not_eligible',
      acceptance_required_before_apply: true,
      owner_acceptance_ref: 'external_owner_ref_only',
    },
    patrol_projection: {
      patrol_ref: 'agent-lab-patrol-ref:developer-mode/default',
      patrol_scope: 'peripheral_ai_inspection_for_agent_call_failures',
      route_outputs: [
        'issue_ref',
        'blocker_ref',
        'owner_route_ref',
        'candidate_fix_ref',
        'repo_worktree_ref',
        'branch_ref',
        'pr_ref',
        'acceptance_evidence_ref',
        'follow_up_queue_item_ref',
      ],
    },
    routes,
    summary: {
      route_count: routes.length,
      direct_owner_route_count: routes.filter((route) => route.route_mode === 'repo_developer_direct_fix').length,
      fork_pr_route_count: routes.filter((route) => route.route_mode === 'fork_pull_request').length,
      dynamic_route_decision_count: 5,
      closeout_ref_field_count: 10,
      issue_ref_count: unique(routes.map((route) => route.issue_ref)).length,
      blocker_ref_count: unique(routes.map((route) => route.blocker_ref)).length,
      follow_up_queue_item_ref_count: unique(routes.map((route) => route.follow_up_queue_item_ref)).length,
    },
    non_authority_outputs: {
      writes_domain_truth: false,
      writes_domain_artifact: false,
      writes_memory_body: false,
      writes_quality_verdict: false,
      writes_owner_receipt: false,
      modifies_managed_runtime: false,
      writes_follow_up_queue_body: false,
    },
    authority_boundary: DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY,
  };
}
