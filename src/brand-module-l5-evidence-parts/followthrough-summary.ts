import type {
  BrandModuleId,
  BrandModuleL5EvidenceClassId,
  BrandModuleL5OperatingEvidenceContract,
  BrandModuleL5OperatingEvidenceEntry,
} from '../types.ts';

export type BrandModuleL5OwnerEvidenceRoute = {
  module_id: BrandModuleId;
  class_id: BrandModuleL5EvidenceClassId;
  owner: string;
  owner_repo: string;
  accepted_ref_shapes: string[];
  work_order_id: string;
  next_owner_action: string;
  owner_evidence_closure_state: string;
  observed_ref_count: number;
  observed_receipt_count: number;
  verified_receipt_count: number;
  blocker_state: string;
  supporting_domain_owner_chain_refs?: string[];
  supporting_domain_owner_chain_ref_count?: number;
  supporting_domain_owner_chain_coverage?: unknown;
  forbidden_opl_claims?: string[];
  stop_loss?: string[];
  owner_route_command_examples?: unknown;
};

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function missingEvidenceClassGroups(routes: BrandModuleL5OwnerEvidenceRoute[]) {
  const groups = {
    missing_owner_evidence_class_ids: [] as BrandModuleL5EvidenceClassId[],
    observed_refs_not_l5_claim_class_ids: [] as BrandModuleL5EvidenceClassId[],
    typed_blocker_recorded_class_ids: [] as BrandModuleL5EvidenceClassId[],
    verified_receipt_class_ids: [] as BrandModuleL5EvidenceClassId[],
  };
  for (const route of routes) {
    if (route.verified_receipt_count > 0) {
      groups.verified_receipt_class_ids.push(route.class_id);
    }
    if (route.blocker_state === 'typed_blocker_recorded') {
      groups.typed_blocker_recorded_class_ids.push(route.class_id);
    } else if (route.observed_ref_count > 0) {
      groups.observed_refs_not_l5_claim_class_ids.push(route.class_id);
    } else {
      groups.missing_owner_evidence_class_ids.push(route.class_id);
    }
  }
  return groups;
}

const OBSERVED_REFS_OWNER_ACCEPTANCE_ACTION = 'record_owner_acceptance_ref_or_typed_blocker_for_l5_claim';

function followthroughAction(route: BrandModuleL5OwnerEvidenceRoute) {
  return route.owner_evidence_closure_state === 'owner_evidence_recorded_not_l5_claim'
    ? OBSERVED_REFS_OWNER_ACCEPTANCE_ACTION
    : route.next_owner_action;
}

export function nextActionSummary(
  entry: BrandModuleL5OperatingEvidenceEntry,
  routes: BrandModuleL5OwnerEvidenceRoute[],
) {
  const missingEvidenceGroups = missingEvidenceClassGroups(routes);
  const firstMissingRoute = routes.find((route) =>
    route.owner_evidence_closure_state === 'owner_acceptance_or_typed_blocker_required'
  );
  const firstTypedBlockerRoute = routes.find((route) =>
    route.owner_evidence_closure_state === 'owner_typed_blocker_recorded'
  );
  const firstObservedRefsRoute = routes.find((route) =>
    route.owner_evidence_closure_state === 'owner_evidence_recorded_not_l5_claim'
  );
  const nextRoute = firstMissingRoute ?? firstTypedBlockerRoute ?? firstObservedRefsRoute;
  return {
    module_id: entry.module_id,
    status: entry.l5_can_be_claimed ? 'complete' : entry.l5_completion_status,
    l5_can_be_claimed: entry.l5_can_be_claimed,
    next_owner_action: nextRoute
      ? followthroughAction(nextRoute)
      : 'keep_verified_refs_and_wait_for_all_requirements',
    next_work_order_id: nextRoute?.work_order_id ?? null,
    next_evidence_class_id: nextRoute?.class_id ?? null,
    next_owner: nextRoute?.owner ?? null,
    next_owner_repo: nextRoute?.owner_repo ?? null,
    next_accepted_ref_shapes: nextRoute?.accepted_ref_shapes ?? null,
    next_forbidden_opl_claims: nextRoute?.forbidden_opl_claims ?? null,
    next_stop_loss: nextRoute?.stop_loss ?? null,
    next_command_examples: nextRoute?.owner_route_command_examples ?? null,
    missing_evidence_groups: missingEvidenceGroups,
    missing_owner_evidence_class_count:
      missingEvidenceGroups.missing_owner_evidence_class_ids.length,
    observed_refs_not_l5_claim_class_count:
      missingEvidenceGroups.observed_refs_not_l5_claim_class_ids.length,
    typed_blocker_recorded_class_count:
      missingEvidenceGroups.typed_blocker_recorded_class_ids.length,
    verified_receipt_class_count:
      missingEvidenceGroups.verified_receipt_class_ids.length,
    false_completion_guard: {
      refs_only_inputs_close_l5: false,
      work_order_projection_closes_l5: false,
      verified_ledger_closes_l5: false,
      ready_claim_authorized: false,
    },
  };
}

export function moduleOwnerFollowthroughSummary(routes: BrandModuleL5OwnerEvidenceRoute[]) {
  const missingOwnerEvidenceRoutes = routes.filter((route) =>
    route.owner_evidence_closure_state === 'owner_acceptance_or_typed_blocker_required'
  );
  const typedBlockerRoutes = routes.filter((route) =>
    route.owner_evidence_closure_state === 'owner_typed_blocker_recorded'
  );
  const observedRefsNotL5ClaimRoutes = routes.filter((route) =>
    route.owner_evidence_closure_state === 'owner_evidence_recorded_not_l5_claim'
  );
  const routesWithObservedRefs = routes.filter((route) =>
    route.observed_ref_count > 0 || route.observed_receipt_count > 0
  );
  const actionableRoutes = [
    ...missingOwnerEvidenceRoutes,
    ...typedBlockerRoutes,
    ...observedRefsNotL5ClaimRoutes,
  ];
  return {
    owner_followthrough_required: actionableRoutes.length > 0,
    owner_followthrough_required_count: actionableRoutes.length,
    missing_owner_evidence_requirement_count: missingOwnerEvidenceRoutes.length,
    typed_blocker_followthrough_requirement_count: typedBlockerRoutes.length,
    observed_refs_not_l5_claim_requirement_count: observedRefsNotL5ClaimRoutes.length,
    observed_ref_requirement_count: routesWithObservedRefs.length,
    owner_followthrough_work_order_ids: actionableRoutes.map((route) => route.work_order_id),
    typed_blocker_followthrough_work_order_ids: typedBlockerRoutes.map((route) => route.work_order_id),
    observed_refs_not_l5_claim_work_order_ids: observedRefsNotL5ClaimRoutes.map((route) => route.work_order_id),
    next_followthrough_action: actionableRoutes[0]
      ? followthroughAction(actionableRoutes[0])
      : null,
    next_followthrough_work_order_id: actionableRoutes[0]?.work_order_id ?? null,
    false_completion_guard: {
      observed_refs_close_l5: false,
      typed_blocker_refs_close_l5: false,
      owner_followthrough_closes_l5_without_owner_acceptance: false,
      ready_claim_authorized: false,
    },
  };
}

export function completedModuleOwnerFollowthroughSummary(routes: BrandModuleL5OwnerEvidenceRoute[]) {
  const observedRefsNotL5ClaimRoutes = routes.filter((route) =>
    route.owner_evidence_closure_state === 'owner_evidence_recorded_not_l5_claim'
  );
  const routesWithObservedRefs = routes.filter((route) =>
    route.observed_ref_count > 0 || route.observed_receipt_count > 0
  );
  return {
    owner_followthrough_required: false,
    owner_followthrough_required_count: 0,
    missing_owner_evidence_requirement_count: 0,
    typed_blocker_followthrough_requirement_count: 0,
    observed_refs_not_l5_claim_requirement_count: observedRefsNotL5ClaimRoutes.length,
    observed_ref_requirement_count: routesWithObservedRefs.length,
    owner_followthrough_work_order_ids: [],
    typed_blocker_followthrough_work_order_ids: [],
    observed_refs_not_l5_claim_work_order_ids: observedRefsNotL5ClaimRoutes.map((route) => route.work_order_id),
    next_followthrough_action: null,
    next_followthrough_work_order_id: null,
    false_completion_guard: {
      observed_refs_close_l5: false,
      typed_blocker_refs_close_l5: false,
      owner_followthrough_closes_l5_without_owner_acceptance: false,
      ready_claim_authorized: false,
    },
  };
}

export function evidenceClassFollowthroughSummary(
  contract: BrandModuleL5OperatingEvidenceContract,
  routes: BrandModuleL5OwnerEvidenceRoute[],
) {
  const byClass = contract.evidence_classes.map((evidenceClass) => {
    const classRoutes = routes.filter((route) => route.class_id === evidenceClass.class_id);
    const missingOwnerEvidenceRoutes = classRoutes.filter((route) =>
      route.owner_evidence_closure_state === 'owner_acceptance_or_typed_blocker_required'
    );
    const typedBlockerRoutes = classRoutes.filter((route) =>
      route.owner_evidence_closure_state === 'owner_typed_blocker_recorded'
    );
    const observedRefsNotL5ClaimRoutes = classRoutes.filter((route) =>
      route.owner_evidence_closure_state === 'owner_evidence_recorded_not_l5_claim'
    );
    const routesWithObservedRefs = classRoutes.filter((route) =>
      route.observed_ref_count > 0 || route.observed_receipt_count > 0
    );
    const routesWithVerifiedReceipts = classRoutes.filter((route) =>
      route.verified_receipt_count > 0
    );
    const actionableRoutes = [
      ...missingOwnerEvidenceRoutes,
      ...typedBlockerRoutes,
      ...observedRefsNotL5ClaimRoutes,
    ];

    return {
      class_id: evidenceClass.class_id,
      accepted_ref_shapes: unique([
        ...evidenceClass.accepted_ref_shapes,
        ...contract.owner_route_work_order_policy.accepted_route_ref_shapes,
      ]),
      route_count: classRoutes.length,
      missing_owner_evidence_route_count: missingOwnerEvidenceRoutes.length,
      typed_blocker_followthrough_route_count: typedBlockerRoutes.length,
      observed_refs_not_l5_claim_route_count: observedRefsNotL5ClaimRoutes.length,
      observed_ref_route_count: routesWithObservedRefs.length,
      verified_receipt_route_count: routesWithVerifiedReceipts.length,
      module_ids: unique(classRoutes.map((route) => route.module_id)),
      owners: unique(classRoutes.map((route) => route.owner)),
      owner_repos: unique(classRoutes.map((route) => route.owner_repo)),
      work_order_ids: classRoutes.map((route) => route.work_order_id),
      missing_owner_evidence_work_order_ids: missingOwnerEvidenceRoutes.map((route) =>
        route.work_order_id
      ),
      typed_blocker_followthrough_work_order_ids: typedBlockerRoutes.map((route) =>
        route.work_order_id
      ),
      observed_refs_not_l5_claim_work_order_ids: observedRefsNotL5ClaimRoutes.map((route) =>
        route.work_order_id
      ),
      next_followthrough_action: actionableRoutes[0]
        ? followthroughAction(actionableRoutes[0])
        : null,
      next_followthrough_work_order_id: actionableRoutes[0]?.work_order_id ?? null,
      next_owner: actionableRoutes[0]?.owner ?? null,
      next_owner_repo: actionableRoutes[0]?.owner_repo ?? null,
      can_close_l5: false,
      can_claim_production_ready: false,
      can_be_completed_by_opl: false,
      supporting_guard_can_be_completed_by_opl: true,
      false_completion_guard: {
        observed_refs_close_l5: false,
        typed_blocker_refs_close_l5: false,
        verified_receipt_closes_l5: false,
        class_followthrough_aggregate_closes_l5: false,
        ready_claim_authorized: false,
      },
    };
  });

  return {
    evidence_class_count: byClass.length,
    route_count: byClass.reduce((count, entry) => count + entry.route_count, 0),
    missing_owner_evidence_route_count: byClass.reduce((count, entry) =>
      count + entry.missing_owner_evidence_route_count, 0),
    typed_blocker_followthrough_route_count: byClass.reduce((count, entry) =>
      count + entry.typed_blocker_followthrough_route_count, 0),
    observed_refs_not_l5_claim_route_count: byClass.reduce((count, entry) =>
      count + entry.observed_refs_not_l5_claim_route_count, 0),
    observed_ref_route_count: byClass.reduce((count, entry) =>
      count + entry.observed_ref_route_count, 0),
    verified_receipt_route_count: byClass.reduce((count, entry) =>
      count + entry.verified_receipt_route_count, 0),
    l5_claim_authorized: false,
    ready_claim_authorized: false,
    can_close_l5: false,
    can_be_completed_by_opl: false,
    supporting_guard_can_be_completed_by_opl: true,
    by_class: byClass,
    false_completion_guard: {
      class_followthrough_aggregate_closes_l5: false,
      route_projection_closes_l5: false,
      verified_ledger_closes_l5: false,
      ready_claim_authorized: false,
    },
  };
}
