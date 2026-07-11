import { AGENT_LAB_AUTHORITY_BOUNDARY } from './agent-lab-authority.ts';
import { listDeveloperModeCloseoutReceipts, type DeveloperModeCloseoutReceipt } from './developer-mode-closeout-ledger.ts';
import { isRecord } from '../../kernel/contract-validation.ts';
import { stableId } from '../../kernel/stable-id.ts';
import { loadStandardAgentEvaluationManifests } from './standard-agent-evaluation-manifest.ts';

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
  target_authority?: unknown;
};

type RepoPermissionLike = {
  target_agent_id?: unknown;
  target_id?: unknown;
  target_repo_id?: unknown;
  target_repo_url?: unknown;
  repo?: unknown;
  repo_url?: unknown;
  status?: unknown;
  permission?: unknown;
  developer_identity_class?: unknown;
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

type DeveloperModeLiveCloseoutRoute = ReturnType<typeof buildDeveloperModeAgentLabRepairRoute> & {
  evidence_source?: string;
  ledger_receipt_ref?: string;
  ledger_receipt_status?: string;
  ledger_target_repo_id?: string;
};

export type DeveloperModeAgentLabRepairRouteInput = {
  developer_mode_projection: DeveloperModeProjectionLike;
  repo_permission: RepoPermissionLike;
  target_authority?: RepoPermissionLike | null;
  patrol_observation_refs: PatrolObservationRefsInput;
};

const AUTHORITY_BOUNDARY = {
  ...AGENT_LAB_AUTHORITY_BOUNDARY,
  can_train_or_deploy_model_weights: false,
};

const DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY = {
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
  can_claim_release_ready: false,
  can_claim_production_ready: false,
  can_close_developer_mode_live_route: false,
};

const DEVELOPER_MODE_DYNAMIC_ROUTE_BUILDER = {
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
  scaleout_followthrough_ref_fields: [
    'route_repetition_refs',
    'risk_tier_auto_promotion_refs',
    'app_patrol_mount_refs',
  ],
  owner_acceptance_ref_policy:
    'direct_fix_external_owner_ref_fork_pr_github_pr_owner_acceptance_ref_fixture_refs_do_not_close_owner_acceptance',
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
  targetAuthority?: RepoPermissionLike | null,
): {
  decision: DeveloperModeRouteDecision;
  eligibility: DeveloperModeRouteEligibility;
} {
  const projectionStatus = text(projection.status);
  const projectionRoute = text(projection.allowed_route);
  const projectionState = text(projection.effective_state);
  const hasTargetAuthority = isRecord(targetAuthority);
  const routeAuthority = hasTargetAuthority
    ? targetAuthority
    : repoPermission;

  if (projectionStatus === 'disabled' || projectionRoute === 'disabled') {
    return {
      decision: 'blocked',
      eligibility: 'blocked_developer_mode_projection',
    };
  }

  if (
    !hasTargetAuthority
    && (
      projectionStatus === 'blocked'
      || projectionRoute === 'blocked'
    )
  ) {
    return {
      decision: 'blocked',
      eligibility: 'blocked_developer_mode_projection',
    };
  }

  if (
    projectionRoute === 'observe_only'
    || projectionState === 'observe_only'
    || text(routeAuthority.allowed_route) === 'observe_only'
  ) {
    return {
      decision: 'observe-only',
      eligibility: 'eligible_observe_only',
    };
  }

  const repoStatus = text(routeAuthority.status);
  const repoRoute = text(routeAuthority.allowed_route);
  if (repoStatus === 'blocked' || repoRoute === 'blocked') {
    return {
      decision: 'blocked',
      eligibility: 'blocked_repo_permission',
    };
  }

  const directWriteCount = typeof routeAuthority.direct_write_repo_count === 'number'
    ? routeAuthority.direct_write_repo_count
    : 0;
  const prRouteCount = typeof routeAuthority.pr_route_repo_count === 'number'
    ? routeAuthority.pr_route_repo_count
    : 0;
  if (projectionRoute === 'mixed_direct_and_pr'
    && directWriteCount > 0
    && prRouteCount > 0
    && !('direct_write_allowed' in routeAuthority)) {
    return {
      decision: 'mixed',
      eligibility: 'eligible_mixed_routes',
    };
  }

  if (routeAuthority.direct_write_allowed === true || repoRoute === 'direct_repo_fix') {
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

function ownerAcceptanceRef(value: string | null, decision: DeveloperModeRouteDecision) {
  const empty = {
    ref: null,
    kind: null,
    status: 'missing_external_owner_acceptance',
    isExternalOwnerRef: false,
    isOwnerReceipt: false,
    evidenceSource: null,
  };

  if (!value) {
    return empty;
  }
  if (value.startsWith('external-owner-ref:') || value.startsWith('external-owner-acceptance-ref:')) {
    return {
      ref: value,
      kind: 'live_external_owner_ref',
      status: 'external_owner_acceptance_observed',
      isExternalOwnerRef: true,
      isOwnerReceipt: false,
      evidenceSource: 'live_external_owner_evidence',
    };
  }
  if (
    decision === 'fork-PR'
    && (
      /^https:\/\/github\.com\/[^/\s]+\/[^/\s#?]+\/pull\/\d+(?:[#?].*)?$/.test(value)
      || /^github-pr-(?:review-|owner-acceptance-)?ref:https:\/\/github\.com\/[^/\s]+\/[^/\s#?]+\/pull\/\d+(?:[#?].*)?$/.test(value)
    )
  ) {
    return {
      ref: value,
      kind: 'live_github_pr_owner_acceptance_ref',
      status: 'external_owner_acceptance_observed',
      isExternalOwnerRef: true,
      isOwnerReceipt: false,
      evidenceSource: 'live_external_owner_evidence',
    };
  }
  if (decision === 'fork-PR' && value.startsWith('repo-contract-fixture-ref:')) {
    return {
      ref: value,
      kind: 'repo_contract_fixture_not_owner_receipt',
      status: 'fixture_drill_not_owner_acceptance',
      isExternalOwnerRef: false,
      isOwnerReceipt: false,
      evidenceSource: 'repo_contract_test_fixture',
    };
  }
  return empty;
}

function fixtureRepoCurrentness(repoPermission: RepoPermissionLike) {
  const repo = text(repoPermission.repo);
  const repoUrl = text(repoPermission.repo_url);
  if (repo?.startsWith('fixture:') || repoUrl?.startsWith('fixture:')) {
    return {
      status: 'repo_contract_fixture_not_live_repo',
      reason: 'fixture_repo_ref_requires_real_external_fork_pr_before_closeout',
    };
  }
  return {
    status: 'not_applicable_or_live_repo_ref',
    reason: null,
  };
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
  sanitizedOwnerAcceptanceRef: ReturnType<typeof ownerAcceptanceRef>,
  rawOwnerAcceptanceRef: string | null,
) {
  const missing: string[] = requiredCloseoutRefsFor(decision).filter((field) => {
    const value = refs[field];
    return Array.isArray(value) ? value.length === 0 : !value;
  });

  const ownerAcceptanceRequired =
    decision === 'direct-fix' || decision === 'fork-PR' || decision === 'observe-only';
  const ownerAcceptanceClosedByExternalRef = sanitizedOwnerAcceptanceRef.isExternalOwnerRef === true;
  if (
    (rawOwnerAcceptanceRef && !sanitizedOwnerAcceptanceRef.ref)
    || (ownerAcceptanceRequired && !ownerAcceptanceClosedByExternalRef)
  ) {
    missing.push('external_owner_acceptance_ref');
  }

  return unique(missing);
}

function closeoutClaimStatus(
  decision: DeveloperModeRouteDecision,
  routeStatus: 'blocked' | 'closeout_refs_ready' | 'closeout_refs_incomplete',
  missingCloseoutRefs: string[],
  sanitizedOwnerAcceptanceRef: ReturnType<typeof ownerAcceptanceRef>,
) {
  if (routeStatus === 'blocked') {
    return 'blocked';
  }
  if (missingCloseoutRefs.includes('external_owner_acceptance_ref')) {
    return sanitizedOwnerAcceptanceRef.kind === 'repo_contract_fixture_not_owner_receipt'
      ? 'fixture_drill_owner_acceptance_open'
      : 'external_owner_acceptance_missing';
  }
  if (decision === 'mixed') {
    return 'route_eligibility_only_not_route_closeout';
  }
  return 'external_owner_closeout_refs_ready';
}

function routeForLedgerReceipt(receipt: DeveloperModeCloseoutReceipt): DeveloperModeLiveCloseoutRoute {
  const allowedRoute = receipt.route_decision === 'direct-fix'
    ? 'direct_repo_fix'
    : receipt.route_decision === 'fork-PR'
      ? 'fork_pull_request'
      : 'observe_only';
  return {
    ...buildDeveloperModeAgentLabRepairRoute({
      developer_mode_projection: {
        surface_id: 'opl_developer_mode',
        status: 'ready',
        effective_state: receipt.route_decision === 'observe-only'
          ? 'observe_only'
          : receipt.route_decision === 'direct-fix'
            ? 'active_direct'
            : 'active_pr_only',
        allowed_route: allowedRoute,
        mode: 'developer_apply_safe',
      },
      repo_permission: {
        target_id: receipt.target_repo_id,
        status: receipt.route_decision === 'direct-fix' ? 'ready' : 'limited',
        direct_write_allowed: receipt.route_decision === 'direct-fix',
        allowed_route: allowedRoute,
      },
      patrol_observation_refs: {
        patrol_observation_ref: receipt.patrol_observation_ref,
        diff_ref: receipt.diff_ref,
        verification_refs: receipt.verification_refs,
        no_forbidden_write_ref: receipt.no_forbidden_write_ref,
        commit_ref: receipt.commit_ref,
        fork_repo_ref: receipt.fork_repo_ref,
        pr_review_ref: receipt.pr_review_ref,
        owner_acceptance_ref: receipt.owner_acceptance_ref,
      },
    }),
    evidence_source: 'developer_mode_closeout_ledger',
    ledger_receipt_ref: receipt.receipt_ref,
    ledger_receipt_status: receipt.receipt_status,
    ledger_target_repo_id: receipt.target_repo_id,
  };
}

function receiptRefListField(receipt: DeveloperModeCloseoutReceipt, field: keyof DeveloperModeCloseoutReceipt) {
  const value = receipt[field];
  return Array.isArray(value)
    ? unique(value.filter((entry): entry is string => typeof entry === 'string'))
    : [];
}

function routeCloseoutRefs(receipt: DeveloperModeCloseoutReceipt) {
  return unique([
    receipt.patrol_observation_ref,
    receipt.diff_ref,
    ...receipt.verification_refs,
    receipt.no_forbidden_write_ref,
    receipt.commit_ref ?? '',
    receipt.fork_repo_ref ?? '',
    receipt.pr_review_ref ?? '',
    receipt.owner_acceptance_ref,
    ...receipt.route_repetition_refs,
    ...receipt.risk_tier_auto_promotion_refs,
    ...receipt.app_patrol_mount_refs,
  ]);
}

function derivedRouteRepetitionEvidence(verifiedReceipts: DeveloperModeCloseoutReceipt[]) {
  const receiptsWithCloseoutRefs = verifiedReceipts.filter((receipt) =>
    routeCloseoutRefs(receipt).length > 0);
  const repeatedTargetRepoIds = unique(
    receiptsWithCloseoutRefs.map((receipt) => receipt.target_repo_id),
  );
  const repeatedPatrolObservationRefs = unique(
    receiptsWithCloseoutRefs.map((receipt) => receipt.patrol_observation_ref),
  );
  if (repeatedTargetRepoIds.length < 2 && repeatedPatrolObservationRefs.length < 2) {
    return {
      route_repetition_refs: [],
      repeated_target_repo_ids: repeatedTargetRepoIds,
      repeated_patrol_observation_refs: repeatedPatrolObservationRefs,
      source_receipt_refs: [],
      derivation_policy:
        'requires_verified_live_ledger_closeout_refs_across_multiple_target_repos_or_patrol_observations',
    };
  }
  const sourceReceiptRefs = receiptsWithCloseoutRefs.map((receipt) => receipt.receipt_ref);
  return {
    route_repetition_refs: [
      `developer-mode-route-repetition-ref:${stableId('dmrr', sourceReceiptRefs)}`,
    ],
    repeated_target_repo_ids: repeatedTargetRepoIds,
    repeated_patrol_observation_refs: repeatedPatrolObservationRefs,
    source_receipt_refs: sourceReceiptRefs,
    derivation_policy:
      'derived_from_verified_live_ledger_closeout_refs_across_multiple_target_repos_or_patrol_observations',
  };
}

function developerModeScaleoutFollowthrough(verifiedReceipts: DeveloperModeCloseoutReceipt[]) {
  const baseRouteKinds = ['direct-fix', 'fork-PR'] as const;
  const baseRoutesReady = baseRouteKinds.every((route) =>
    verifiedReceipts.some((receipt) => receipt.route_decision === route)
  );
  const derivedRouteRepetition = derivedRouteRepetitionEvidence(verifiedReceipts);
  const routeRepetitionRefs = unique(
    [
      ...verifiedReceipts.flatMap((receipt) =>
        receiptRefListField(receipt, 'route_repetition_refs')
      ),
      ...derivedRouteRepetition.route_repetition_refs,
    ],
  );
  const riskTierAutoPromotionRefs = unique(
    verifiedReceipts.flatMap((receipt) =>
      receiptRefListField(receipt, 'risk_tier_auto_promotion_refs')
    ),
  );
  const appPatrolMountRefs = unique(
    verifiedReceipts.flatMap((receipt) =>
      receiptRefListField(receipt, 'app_patrol_mount_refs')
    ),
  );
  const repeatedTargetRepoIds = unique(
    [
      ...verifiedReceipts.flatMap((receipt) =>
        routeCloseoutRefs(receipt).length > 0 && receipt.route_repetition_refs.length > 0
          ? [receipt.target_repo_id]
          : []
      ),
      ...derivedRouteRepetition.repeated_target_repo_ids,
    ],
  );
  const openGateIds = baseRoutesReady
    ? [
        routeRepetitionRefs.length > 0 ? null : 'route_repetition_refs',
        riskTierAutoPromotionRefs.length > 0 ? null : 'risk_tier_auto_promotion_refs',
        appPatrolMountRefs.length > 0 ? null : 'app_patrol_mount_refs',
      ].filter((entry): entry is string => Boolean(entry))
    : [];

  return {
    surface_kind: 'opl_developer_mode_live_route_scaleout_followthrough',
    status: baseRoutesReady
      ? openGateIds.length === 0
        ? 'scaleout_refs_ready'
        : 'scaleout_refs_incomplete'
      : 'waiting_for_base_live_route_closeout_refs',
    base_live_route_closeout_refs_ready: baseRoutesReady,
    open_gate_count: openGateIds.length,
    open_gate_ids: openGateIds,
    route_repetition_ref_count: routeRepetitionRefs.length,
    route_repetition_refs: routeRepetitionRefs,
    repeated_target_repo_count: repeatedTargetRepoIds.length,
    repeated_target_repo_ids: repeatedTargetRepoIds,
    repeated_patrol_observation_ref_count:
      derivedRouteRepetition.repeated_patrol_observation_refs.length,
    repeated_patrol_observation_refs:
      derivedRouteRepetition.repeated_patrol_observation_refs,
    derived_route_repetition_ref_count:
      derivedRouteRepetition.route_repetition_refs.length,
    derived_route_repetition_refs:
      derivedRouteRepetition.route_repetition_refs,
    derived_route_repetition_source_receipt_refs:
      derivedRouteRepetition.source_receipt_refs,
    route_repetition_derivation_policy:
      derivedRouteRepetition.derivation_policy,
    risk_tier_auto_promotion_ref_count: riskTierAutoPromotionRefs.length,
    risk_tier_auto_promotion_refs: riskTierAutoPromotionRefs,
    app_patrol_mount_ref_count: appPatrolMountRefs.length,
    app_patrol_mount_refs: appPatrolMountRefs,
    required_return_shapes: [
      'developer_mode_route_repetition_ref',
      'verified_agent_lab_risk_tier_auto_promotion_receipt_ref',
      'developer_mode_app_patrol_mount_ref',
      'typed_blocker_ref',
    ],
    payload_ref_hints: {
      route_repetition_refs_should_cover:
        'repeat direct-fix or fork-PR closeout receipts across more than one target repo or patrol observation',
      risk_tier_auto_promotion_refs_should_cover:
        'verified Agent Lab risk-tier-promotion ledger receipt refs with independent AI review, recovery target, canary, no-forbidden-write, and verification refs',
      app_patrol_mount_refs_should_cover:
        'App/default caller patrol mounting refs showing Developer Mode patrol surfaces are visible without full drilldown',
      typed_blocker_refs_may_explain_missing_scaleout: true,
    },
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_mutate_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_create_owner_receipt: false,
      can_write_owner_receipt: false,
      can_modify_managed_runtime: false,
      can_close_domain_ready: false,
      can_claim_release_ready: false,
      can_claim_production_ready: false,
      can_close_developer_mode_live_route: false,
    },
  };
}

export function buildDeveloperModeAgentLabRepairRoute(input: DeveloperModeAgentLabRepairRouteInput) {
  const refs = observationRefs(input.patrol_observation_refs);
  const routeAuthority = isRecord(input.target_authority)
    ? input.target_authority
    : input.repo_permission;
  const initial = routeEligibility(
    input.developer_mode_projection,
    input.repo_permission,
    input.target_authority,
  );
  const sanitizedOwnerAcceptanceRef = ownerAcceptanceRef(refs.owner_acceptance_ref, initial.decision);
  const ownerAcceptanceBlocked = Boolean(refs.owner_acceptance_ref) && !sanitizedOwnerAcceptanceRef.ref;
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
  const routeStatus = missingCloseoutRefs.length === 0 && decision !== 'blocked'
    ? 'closeout_refs_ready'
    : decision === 'blocked'
      ? 'blocked'
      : 'closeout_refs_incomplete';

  return {
    surface_kind: 'opl_agent_lab_developer_mode_dynamic_repair_route',
    version: 'opl-agent-lab.v1.developer-mode-dynamic-repair-route',
    route_ref: stableId('oaldmr', [
      developerModeProjectionRef,
      routeAuthority,
      refs.patrol_observation_ref,
      initial.eligibility,
    ]),
    route_decision: decision,
    route_status: routeStatus,
    closeout_claim_status: closeoutClaimStatus(
      decision,
      routeStatus,
      missingCloseoutRefs,
      sanitizedOwnerAcceptanceRef,
    ),
    developer_mode_projection_ref: developerModeProjectionRef,
    patrol_observation_refs: unique([
      refs.patrol_observation_ref ?? '',
      refs.issue_ref ?? '',
      refs.blocker_ref ?? '',
    ]),
    repo_permission: isRecord(routeAuthority) ? routeAuthority : {},
    target_authority: isRecord(input.target_authority) ? input.target_authority : null,
    fixture_repo_currentness:
      sanitizedOwnerAcceptanceRef.kind === 'repo_contract_fixture_not_owner_receipt'
        ? fixtureRepoCurrentness(routeAuthority)
        : {
            status: 'not_applicable_or_live_repo_ref',
            reason: null,
          },
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
      owner_acceptance_ref: sanitizedOwnerAcceptanceRef.ref,
      owner_acceptance_ref_kind: sanitizedOwnerAcceptanceRef.kind,
      owner_acceptance_status: sanitizedOwnerAcceptanceRef.status,
      owner_acceptance_ref_is_external_owner_ref: sanitizedOwnerAcceptanceRef.isExternalOwnerRef,
      owner_acceptance_is_owner_receipt: sanitizedOwnerAcceptanceRef.isOwnerReceipt,
      evidence_source: sanitizedOwnerAcceptanceRef.evidenceSource,
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

export function buildDeveloperModeAgentLabRepairRouteReadModel(input: {
  evaluationManifestPaths?: string[];
} = {}) {
  const evaluationManifests = loadStandardAgentEvaluationManifests(
    input.evaluationManifestPaths ?? [],
  );
  const routes = evaluationManifests.flatMap((manifest) =>
    manifest.repair_routes.map((route) => ({
      ...route,
      domain_id: manifest.domain_id,
      evaluation_manifest_ref: manifest.manifest_ref,
      authority_boundary: DEVELOPER_MODE_REPAIR_AUTHORITY_BOUNDARY,
    }))
  );
  const manifestCloseoutDrills: DeveloperModeLiveCloseoutRoute[] = evaluationManifests
    .flatMap((manifest) => manifest.closeout_drills.map((drill) => ({
      ...buildDeveloperModeAgentLabRepairRoute(
        drill as unknown as DeveloperModeAgentLabRepairRouteInput,
      ),
      evidence_source: 'domain_owned_evaluation_manifest',
      evaluation_manifest_ref: manifest.manifest_ref,
      evaluation_domain_id: manifest.domain_id,
    })));
  const ledgerReceipts = listDeveloperModeCloseoutReceipts();
  const verifiedLedgerReceipts = ledgerReceipts.filter((receipt) =>
    receipt.receipt_status === 'verified');
  const recordedLedgerReceipts = ledgerReceipts.filter((receipt) =>
    receipt.receipt_status === 'recorded');
  const liveCloseoutEvidenceDrills = [
    ...manifestCloseoutDrills,
    ...verifiedLedgerReceipts.map(routeForLedgerReceipt),
  ];
  const liveExternalOwnerAcceptanceMissingDrills = liveCloseoutEvidenceDrills.filter((drill) =>
    drill.missing_closeout_refs.includes('external_owner_acceptance_ref')
    && drill.closeout_claim_status !== 'fixture_drill_owner_acceptance_open');
  const fixtureDrillOwnerAcceptanceOpenDrills = liveCloseoutEvidenceDrills.filter((drill) =>
    drill.closeout_claim_status === 'fixture_drill_owner_acceptance_open');
  const verifiedDirectFixReceiptCount = verifiedLedgerReceipts.filter((receipt) =>
    receipt.route_decision === 'direct-fix').length;
  const verifiedForkPrReceiptCount = verifiedLedgerReceipts.filter((receipt) =>
    receipt.route_decision === 'fork-PR').length;
  const scaleoutFollowthrough =
    developerModeScaleoutFollowthrough(verifiedLedgerReceipts);
  const liveLedgerCloseoutReady =
    verifiedDirectFixReceiptCount > 0
    && verifiedForkPrReceiptCount > 0
    && recordedLedgerReceipts.length === 0;
  const liveCloseoutEvidence = {
    surface_kind: 'opl_agent_lab_developer_mode_live_closeout_evidence_read_model',
    version: 'opl-agent-lab.v1.developer-mode-live-closeout-evidence',
    status: liveLedgerCloseoutReady
      ? 'closeout_refs_ready'
      : 'closeout_refs_incomplete',
    ledger_evidence_status: recordedLedgerReceipts.length > 0
      ? 'ledger_refs_recorded_verify_pending'
      : verifiedDirectFixReceiptCount > 0 && verifiedForkPrReceiptCount > 0
        ? 'verified_direct_fix_and_fork_pr_closeout_refs_observed'
        : verifiedDirectFixReceiptCount > 0
          ? 'verified_direct_fix_closeout_refs_observed'
          : verifiedForkPrReceiptCount > 0
            ? 'verified_fork_pr_closeout_refs_observed'
            : 'no_live_ledger_closeout_refs_observed',
    refs_only: true,
    evidence_scope: 'developer_mode_agent_lab_repair_closeout_drills_and_verified_live_ledger_receipts',
    ledger_receipt_refs: ledgerReceipts.map((receipt) => receipt.receipt_ref),
    verified_ledger_receipt_refs: verifiedLedgerReceipts.map((receipt) => receipt.receipt_ref),
    pending_verify_receipt_refs: recordedLedgerReceipts.map((receipt) => receipt.receipt_ref),
    route_repetition_receipt_refs: verifiedLedgerReceipts.flatMap((receipt) =>
      receiptRefListField(receipt, 'route_repetition_refs')
    ),
    risk_tier_auto_promotion_receipt_refs: verifiedLedgerReceipts.flatMap((receipt) =>
      receiptRefListField(receipt, 'risk_tier_auto_promotion_refs')
    ),
    app_patrol_mount_receipt_refs: verifiedLedgerReceipts.flatMap((receipt) =>
      receiptRefListField(receipt, 'app_patrol_mount_refs')
    ),
    required_closeout_ref_groups: [
      'route_eligibility',
      'patrol_observation_ref',
      'diff_ref',
      'verification_refs',
      'no_forbidden_write_ref',
      'commit_ref_or_fork_pr_refs',
      'external_owner_acceptance_ref',
    ],
    scaleout_followthrough: scaleoutFollowthrough,
    drills: liveCloseoutEvidenceDrills,
    summary: {
      drill_count: liveCloseoutEvidenceDrills.length,
      direct_fix_drill_count: liveCloseoutEvidenceDrills.filter((drill) =>
        drill.route_decision === 'direct-fix').length,
      fork_pr_drill_count: liveCloseoutEvidenceDrills.filter((drill) =>
        drill.route_decision === 'fork-PR').length,
      closeout_ready_count: liveCloseoutEvidenceDrills.filter((drill) =>
        drill.route_status === 'closeout_refs_ready').length,
      live_external_owner_acceptance_count: liveCloseoutEvidenceDrills.filter((drill) =>
        drill.evidence_source === 'developer_mode_closeout_ledger'
        && drill.closeout_refs.owner_acceptance_ref_is_external_owner_ref === true).length,
      live_ledger_closeout_ready_count: liveCloseoutEvidenceDrills.filter((drill) =>
        drill.evidence_source === 'developer_mode_closeout_ledger'
        && drill.route_status === 'closeout_refs_ready').length,
      ledger_receipt_ref_count: ledgerReceipts.length,
      ledger_recorded_receipt_ref_count: recordedLedgerReceipts.length,
      ledger_verified_receipt_ref_count: verifiedLedgerReceipts.length,
      pending_verify_receipt_ref_count: recordedLedgerReceipts.length,
      verified_direct_fix_ledger_receipt_ref_count: verifiedDirectFixReceiptCount,
      verified_fork_pr_ledger_receipt_ref_count: verifiedForkPrReceiptCount,
      route_repetition_ref_count:
        scaleoutFollowthrough.route_repetition_ref_count,
      risk_tier_auto_promotion_ref_count:
        scaleoutFollowthrough.risk_tier_auto_promotion_ref_count,
      app_patrol_mount_ref_count:
        scaleoutFollowthrough.app_patrol_mount_ref_count,
      scaleout_followthrough_open_gate_count:
        scaleoutFollowthrough.open_gate_count,
      repo_contract_fixture_drill_count: liveCloseoutEvidenceDrills.filter((drill) =>
        drill.closeout_refs.evidence_source === 'repo_contract_test_fixture').length,
      repo_contract_fixture_not_live_repo_count: liveCloseoutEvidenceDrills.filter((drill) =>
        drill.closeout_refs.evidence_source === 'repo_contract_test_fixture'
        && drill.fixture_repo_currentness?.status === 'repo_contract_fixture_not_live_repo').length,
      external_owner_acceptance_missing_count:
        liveExternalOwnerAcceptanceMissingDrills.length,
      fixture_drill_external_owner_acceptance_missing_count:
        fixtureDrillOwnerAcceptanceOpenDrills.length,
      fixture_drill_owner_acceptance_open_count:
        fixtureDrillOwnerAcceptanceOpenDrills.length,
      external_owner_closeout_refs_ready_count: liveCloseoutEvidenceDrills.filter((drill) =>
        drill.closeout_claim_status === 'external_owner_closeout_refs_ready').length,
      forbidden_owner_receipt_write_count: liveCloseoutEvidenceDrills.filter((drill) =>
        drill.closeout_refs.owner_acceptance_ref?.startsWith('owner-receipt-ref:')).length,
    },
    owner_acceptance_policy:
      'direct_fix_accepts_external_owner_ref_fork_pr_requires_github_pr_owner_acceptance_ref_no_opl_owner_receipt_write',
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

  return {
    surface_kind: 'opl_agent_lab_developer_mode_repair_route_read_model',
    version: 'opl-agent-lab.v1.developer-mode-repair-route',
    read_model_id: stableId('oaldmr', [routes]),
    status: 'ready_for_developer_mode_patrol_consumption',
    developer_mode_required: true,
    refs_only: true,
    evaluation_manifest_loading: {
      schema_ref:
        'contracts/opl-framework/standard-agent-evaluation-manifest.schema.json',
      source_policy: 'explicit_domain_owned_manifest_paths_only',
      absence_policy: 'no_manifest_declared_yields_empty_generic_projection',
      invalid_manifest_policy: 'fail_closed_contract_shape_invalid',
      manifest_count: evaluationManifests.length,
      manifest_refs: evaluationManifests.map((manifest) => manifest.manifest_ref),
      domain_ids: evaluationManifests.map((manifest) => manifest.domain_id),
    },
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
      owner_acceptance_ref:
        'direct_fix_external_owner_ref_fork_pr_github_pr_owner_acceptance_ref_fixture_refs_do_not_close_owner_acceptance',
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
    live_closeout_evidence: liveCloseoutEvidence,
    summary: {
      route_count: routes.length,
      evaluation_manifest_count: evaluationManifests.length,
      direct_owner_route_count: routes.filter((route) => route.route_mode === 'repo_developer_direct_fix').length,
      fork_pr_route_count: routes.filter((route) => route.route_mode === 'fork_pull_request').length,
      live_closeout_drill_count: liveCloseoutEvidence.summary.drill_count,
      live_closeout_ready_count: liveCloseoutEvidence.summary.closeout_ready_count,
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
