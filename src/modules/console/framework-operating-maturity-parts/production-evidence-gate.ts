import { OBSERVABILITY_EVIDENCE_LEDGER_FIELD } from '../../../kernel/observability-projection-vocabulary.ts';
import { FRAMEWORK_READINESS_SOURCE_COMMANDS as SOURCE_COMMANDS } from '../framework-readiness-source-commands.ts';
import {
  numberValue,
  record,
  recordList,
  stringValue,
} from '../framework-readiness-values.ts';

function stringListValue(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function unique(items: string[]) {
  return [...new Set(items.filter((item) => item.trim().length > 0))];
}

export function nextOwnerActions() {
  return [
    {
      lane: 'domain_owner_chain_scaleout',
      owner: 'MAS/MAG/RCA/OMA domain owners',
      required_delta: 'domain_owned_owner_receipt_typed_blocker_human_gate_quality_export_no_regression_or_long_soak_ref',
      source_command: 'opl agents conformance --family-defaults --json',
    },
    {
      lane: 'brand_module_l5_operating_maturity',
      owner: 'brand module owners',
      required_delta: 'live_user_path_cross_agent_scaleout_long_soak_release_install_operator_repair_owner_acceptance_no_second_truth_refs',
      source_command: 'opl brand-modules l5-status --json',
    },
    {
      lane: 'app_release_user_path',
      owner: 'one-person-lab-app release owner',
      required_delta: 'same_cohort_release_user_path_receipt_release_owner_receipt_install_evidence_owner_acceptance_or_release_owner_typed_blocker',
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
    {
      lane: 'provider_long_soak',
      owner: 'one-person-lab runtime owner',
      required_delta: 'long_soak_recovery_dead_letter_or_provider_blocker_refs',
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
    {
      lane: 'private_platform_retirement',
      owner: 'domain owners',
      required_delta: 'physical_delete_authorization_keep_as_authority_adapter_or_typed_blocker_ref',
      source_command: 'opl agents default-callers --family-defaults --json',
    },
    {
      lane: 'memory_artifact_lifecycle_apply',
      owner: 'domain owners',
      required_delta: 'memory_artifact_lifecycle_receipt_or_typed_blocker_ref',
      source_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
  ];
}

function ownerRouteWorkOrderAuthorityBoundary() {
  return {
    work_order_is_refs_only: true,
    work_order_can_close_production: false,
    can_claim_domain_ready: false,
    can_claim_app_release_ready: false,
    can_claim_l5: false,
    can_claim_production_ready: false,
    can_write_domain_truth: false,
    can_sign_owner_receipt: false,
    can_create_typed_blocker: false,
    can_authorize_quality_or_export: false,
  };
}

function ownerRouteWorkOrderPolicy(lane: string) {
  const commonForbiddenClaims = [
    'domain_ready',
    'app_release_ready',
    'brand_module_l5_complete',
    'production_ready',
    'physical_delete_authorized',
    'owner_receipt_signed_by_opl',
    'typed_blocker_created_by_opl',
    'quality_or_export_ready',
  ];
  const policies: Record<string, {
    owner_repo: string;
    closing_ref_source: string;
    typed_blocker_source: string;
    verification_command: string;
  }> = {
    domain_owner_chain_scaleout: {
      owner_repo: 'MAS/MAG/RCA/OMA domain repositories',
      closing_ref_source: 'domain_owner_live_owner_receipt_human_gate_quality_export_no_regression_or_long_soak_ref',
      typed_blocker_source: 'domain_owner_live_progress_typed_blocker_ref',
      verification_command: 'opl agents conformance --family-defaults --json',
    },
    brand_module_l5_operating_maturity: {
      owner_repo: 'brand module owner surfaces',
      closing_ref_source: 'brand_module_owner_evidence_ref_or_owner_acceptance_ref',
      typed_blocker_source: 'brand_module_owner_l5_typed_blocker_ref',
      verification_command: 'opl brand-modules l5-status --json',
    },
    app_release_user_path: {
      owner_repo: '/Users/gaofeng/workspace/one-person-lab-app',
      closing_ref_source: 'one_person_lab_app_release_owner_receipt_install_evidence_owner_acceptance_or_same_cohort_release_evidence_ref',
      typed_blocker_source: 'one_person_lab_app_release_owner_typed_blocker_ref',
      verification_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
    provider_long_soak: {
      owner_repo: '/Users/gaofeng/workspace/one-person-lab',
      closing_ref_source: 'opl_runtime_owner_long_soak_recovery_dead_letter_or_provider_blocker_ref',
      typed_blocker_source: 'opl_runtime_owner_provider_typed_blocker_ref',
      verification_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
    private_platform_retirement: {
      owner_repo: 'domain repositories',
      closing_ref_source: 'domain_owner_physical_delete_authorization_keep_or_typed_blocker',
      typed_blocker_source: 'domain_owner_private_platform_retirement_typed_blocker_ref',
      verification_command: 'opl agents default-callers --family-defaults --json',
    },
    memory_artifact_lifecycle_apply: {
      owner_repo: 'domain repositories',
      closing_ref_source: 'domain_owner_memory_artifact_lifecycle_receipt_ref',
      typed_blocker_source: 'domain_owner_memory_artifact_lifecycle_typed_blocker_ref',
      verification_command: SOURCE_COMMANDS.app_operator_drilldown,
    },
  };
  return {
    ...(policies[lane] ?? {
      owner_repo: 'owner repository',
      closing_ref_source: 'owner_receipt_or_typed_blocker_ref',
      typed_blocker_source: 'owner_typed_blocker_ref',
      verification_command: 'owner-native verification command',
    }),
    forbidden_opl_claims: commonForbiddenClaims,
  };
}

function ownerRouteWorkOrderStatus(input: {
  open_count?: number;
  owner_evidence_observed: boolean;
}) {
  if (input.open_count && input.open_count > 0) {
    return 'open';
  }
  return input.owner_evidence_observed
    ? 'owner_evidence_recorded'
    : 'owner_acceptance_required';
}

function brandModuleL5RequirementWorkOrders(brandModules: Record<string, unknown>[]) {
  return brandModules.flatMap((module) =>
    recordList(module.owner_evidence_routes).map((route) => ({
      module_id: stringValue(module.module_id),
      brand_name: stringValue(module.brand_name),
      work_order_id: stringValue(route.work_order_id),
      class_id: stringValue(route.class_id),
      owner: stringValue(route.owner),
      owner_route_ref: stringValue(route.owner_route_ref),
      owner_repo_ref: stringValue(route.owner_repo_ref),
      owner_repo: stringValue(route.owner_repo),
      owner_route_status: stringValue(route.owner_route_status),
      blocker_state: stringValue(route.blocker_state),
      owner_evidence_closure_state: stringValue(route.owner_evidence_closure_state),
      owner_acceptance_required: route.owner_acceptance_required === true,
      ready_claim_authorized: route.ready_claim_authorized === true,
      existing_evidence_refs: stringListValue(route.existing_evidence_refs),
      existing_blocker_refs: stringListValue(route.existing_blocker_refs),
      observed_evidence_refs: stringListValue(route.observed_evidence_refs),
      observed_ref_shapes: stringListValue(route.observed_ref_shapes),
      observed_ref_count: numberValue(route.observed_ref_count),
      observed_typed_blocker_ref_count: numberValue(route.observed_typed_blocker_ref_count),
      observed_receipt_refs: stringListValue(route.observed_receipt_refs),
      observed_receipt_count: numberValue(route.observed_receipt_count),
      verified_receipt_count: numberValue(route.verified_receipt_count),
      l5_claim_status: stringValue(route.l5_claim_status),
      accepted_ref_shapes: stringListValue(route.accepted_ref_shapes),
      closing_ref_source: stringValue(route.closing_ref_source),
      typed_blocker_source: stringValue(route.typed_blocker_source),
      forbidden_opl_claims: stringListValue(route.forbidden_opl_claims),
      non_closing_inputs: stringListValue(route.non_closing_inputs),
      stop_loss: stringListValue(route.stop_loss),
      typed_blocker_payload_template: record(route.typed_blocker_payload_template),
      evidence_payload_template: record(route.evidence_payload_template),
      owner_route_command_examples: record(route.owner_route_command_examples),
      verification_command: stringValue(route.verification_command),
      authority_boundary: record(route.authority_boundary),
    }))
  );
}

function brandModuleL5OwnerActionChecklist(
  brandModules: Record<string, unknown>[],
  requirementWorkOrders: Record<string, unknown>[],
) {
  return brandModules.map((module) => {
    const moduleId = stringValue(module.module_id);
    const moduleWorkOrders = requirementWorkOrders.filter(
      (entry) => stringValue(entry.module_id) === moduleId,
    );
    const missingOwnerEvidenceWorkOrders = moduleWorkOrders.filter(
      (entry) => stringValue(entry.owner_evidence_closure_state)
        === 'owner_acceptance_or_typed_blocker_required',
    );
    const typedBlockerWorkOrders = moduleWorkOrders.filter(
      (entry) => stringValue(entry.owner_evidence_closure_state)
        === 'owner_typed_blocker_recorded',
    );
    const observedRefsNotL5ClaimWorkOrders = moduleWorkOrders.filter(
      (entry) => stringValue(entry.owner_evidence_closure_state)
        === 'owner_evidence_recorded_not_l5_claim',
    );
    const ownerActionRequiredWorkOrders = [
      ...missingOwnerEvidenceWorkOrders,
      ...typedBlockerWorkOrders,
    ];
    const nextAction = record(module.next_action_summary);
    const evidenceLedger = record(module[OBSERVABILITY_EVIDENCE_LEDGER_FIELD]);
    const ownerFollowthrough = record(module.owner_followthrough_summary);
    return {
      module_id: moduleId,
      brand_name: stringValue(module.brand_name),
      status: stringValue(module.l5_completion_status) ?? 'evidence_required',
      l5_can_be_claimed: module.l5_can_be_claimed === true,
      evidence_requirement_count: numberValue(module.evidence_requirement_count),
      open_requirement_count: numberValue(module.open_requirement_count),
      blocked_requirement_count: numberValue(module.blocked_requirement_count),
      route_work_order_count: moduleWorkOrders.length,
      owner_action_required_count: ownerActionRequiredWorkOrders.length,
      missing_owner_evidence_action_count: missingOwnerEvidenceWorkOrders.length,
      typed_blocker_action_count: typedBlockerWorkOrders.length,
      observed_refs_not_l5_claim_count: observedRefsNotL5ClaimWorkOrders.length,
      owner_followthrough_required:
        ownerFollowthrough.owner_followthrough_required === true,
      owner_followthrough_required_count:
        numberValue(ownerFollowthrough.owner_followthrough_required_count)
        ?? ownerActionRequiredWorkOrders.length,
      missing_owner_evidence_requirement_count:
        numberValue(ownerFollowthrough.missing_owner_evidence_requirement_count)
        ?? missingOwnerEvidenceWorkOrders.length,
      typed_blocker_followthrough_requirement_count:
        numberValue(ownerFollowthrough.typed_blocker_followthrough_requirement_count)
        ?? typedBlockerWorkOrders.length,
      observed_refs_not_l5_claim_requirement_count:
        numberValue(ownerFollowthrough.observed_refs_not_l5_claim_requirement_count)
        ?? observedRefsNotL5ClaimWorkOrders.length,
      observed_ref_requirement_count:
        numberValue(ownerFollowthrough.observed_ref_requirement_count)
        ?? moduleWorkOrders.filter((entry) =>
          numberValue(record(entry).observed_ref_count) > 0
          || numberValue(record(entry).observed_receipt_count) > 0
        ).length,
      missing_requirement_action_ids: ownerActionRequiredWorkOrders
        .map((entry) => stringValue(entry.work_order_id))
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
      missing_requirement_class_ids: unique(
        ownerActionRequiredWorkOrders
          .map((entry) => stringValue(entry.class_id))
          .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
      ),
      missing_owner_evidence_action_ids: missingOwnerEvidenceWorkOrders
        .map((entry) => stringValue(entry.work_order_id))
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
      typed_blocker_action_ids: typedBlockerWorkOrders
        .map((entry) => stringValue(entry.work_order_id))
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
      observed_refs_not_l5_claim_action_ids: observedRefsNotL5ClaimWorkOrders
        .map((entry) => stringValue(entry.work_order_id))
        .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0),
      owner_followthrough_work_order_ids:
        stringListValue(ownerFollowthrough.owner_followthrough_work_order_ids),
      typed_blocker_followthrough_work_order_ids:
        stringListValue(ownerFollowthrough.typed_blocker_followthrough_work_order_ids),
      observed_refs_not_l5_claim_work_order_ids:
        stringListValue(ownerFollowthrough.observed_refs_not_l5_claim_work_order_ids),
      next_followthrough_action:
        stringValue(ownerFollowthrough.next_followthrough_action),
      next_followthrough_work_order_id:
        stringValue(ownerFollowthrough.next_followthrough_work_order_id),
      next_work_order_id:
        stringValue(nextAction.next_work_order_id)
        ?? stringValue(moduleWorkOrders[0]?.work_order_id),
      next_evidence_class_id:
        stringValue(nextAction.next_evidence_class_id)
        ?? stringValue(moduleWorkOrders[0]?.class_id),
      next_owner:
        stringValue(nextAction.next_owner)
        ?? stringValue(moduleWorkOrders[0]?.owner),
      next_owner_repo:
        stringValue(nextAction.next_owner_repo)
        ?? stringValue(moduleWorkOrders[0]?.owner_repo),
      next_owner_action:
        stringValue(nextAction.next_owner_action)
        ?? 'record_brand_module_l5_owner_evidence_or_typed_blocker_ref',
      owner_acceptance_required: moduleWorkOrders.some(
        (entry) => entry.owner_acceptance_required === true,
      ),
      ready_claim_authorized: false,
      verified_receipt_count: numberValue(evidenceLedger.verified_receipt_count),
      l5_claim_status:
        stringValue(evidenceLedger.l5_claim_status)
        ?? 'ledger_refs_only_not_l5_claimed',
      owner_followthrough_false_completion_guard:
        record(ownerFollowthrough.false_completion_guard),
      authority_boundary: {
        checklist_is_refs_only: true,
        checklist_can_claim_l5: false,
        checklist_can_claim_production_ready: false,
        checklist_can_sign_owner_receipt: false,
        checklist_can_create_typed_blocker: false,
      },
    };
  });
}

function ownerRouteWorkOrders(
  laneStatuses: Array<{
    lane: string;
    open_count: number;
    accepted_closing_ref_shapes: string[];
    owner_action_checklist?: unknown[];
    missing_owner_action_ids?: string[];
    next_evidence_action?: string | null;
  }>,
  ownerEvidenceIntake: Record<string, unknown>,
) {
  const laneStatusById = new Map(laneStatuses.map((lane) => [lane.lane, lane]));
  const laneEvidenceById = new Map(
    recordList(ownerEvidenceIntake.lane_evidence).map((entry) => [stringValue(entry.lane), entry]),
  );
  const workOrderIds: Record<string, string> = {
    domain_owner_chain_scaleout: 'w7-domain-owner-chain-scaleout',
    brand_module_l5_operating_maturity: 'w7-brand-module-l5-operating-maturity',
    app_release_user_path: 'w7-app-release-user-path',
    provider_long_soak: 'w7-provider-long-soak',
    private_platform_retirement: 'w7-private-platform-retirement',
    memory_artifact_lifecycle_apply: 'w7-memory-artifact-lifecycle-apply',
  };

  return nextOwnerActions().map((action) => {
    const lane = laneStatusById.get(action.lane);
    const observed = laneEvidenceById.get(action.lane);
    const observedReceiptRefs = stringListValue(observed?.observed_receipt_refs);
    const observedRefShapes = stringListValue(observed?.observed_ref_shapes);
    const ownerAcceptanceRefs = stringListValue(observed?.owner_acceptance_refs);
    const ownerEvidenceObserved =
      stringValue(observed?.status) === 'owner_evidence_observed_not_ready_claim'
      || observedReceiptRefs.length > 0
      || observedRefShapes.length > 0;
    const policy = ownerRouteWorkOrderPolicy(action.lane);
    const status = ownerRouteWorkOrderStatus({
      open_count: lane?.open_count,
      owner_evidence_observed: ownerEvidenceObserved,
    });
    return {
      work_order_id: workOrderIds[action.lane] ?? `w7-${action.lane.replace(/_/g, '-')}`,
      lane: action.lane,
      owner: action.owner,
      owner_repo: policy.owner_repo,
      status,
      blocker_state: ownerEvidenceObserved
        ? 'owner_route_refs_observed_not_production_claim'
        : 'owner_route_evidence_missing',
      open_count: lane?.open_count ?? 1,
      next_owner_action: action.required_delta,
      next_evidence_action: lane?.next_evidence_action ?? action.required_delta,
      owner_action_checklist: Array.isArray(lane?.owner_action_checklist)
        ? lane.owner_action_checklist
        : [],
      missing_owner_action_ids: lane?.missing_owner_action_ids ?? [],
      observed_owner_evidence_status:
        stringValue(observed?.status) ?? 'owner_evidence_required',
      observed_receipt_refs: observedReceiptRefs,
      observed_ref_shapes: observedRefShapes,
      observed_ref_counts: record(observed?.observed_ref_counts),
      owner_acceptance_refs: ownerAcceptanceRefs,
      owner_evidence_route:
        stringValue(observed?.evidence_route) ?? action.source_command,
      owner_evidence_closure_state: lane?.open_count && lane.open_count > 0
        ? 'owner_evidence_required'
        : ownerEvidenceObserved
          ? 'owner_evidence_recorded_not_ready_claim'
          : 'owner_acceptance_or_typed_blocker_required',
      owner_acceptance_required: true,
      ready_claim_authorized: false,
      open_count_semantics:
        'open_count_tracks_lane_specific_missing_evidence_only_zero_does_not_authorize_ready_claim',
      accepted_ref_shapes: unique([
        ...(lane?.accepted_closing_ref_shapes ?? []),
        'typed_blocker_ref',
        'owner_acceptance_ref',
      ]),
      source_command: action.source_command,
      closing_ref_source: policy.closing_ref_source,
      typed_blocker_source: policy.typed_blocker_source,
      forbidden_opl_claims: policy.forbidden_opl_claims,
      verification_command: policy.verification_command,
      non_closing_inputs: [
        'conformance_pass',
        'docs_foldback',
        'contract_validation',
        'generated_descriptor_ready',
        'provider_completion',
        'app_projection',
        'verified_refs_only_ledger',
        'zero_worklist_count',
      ],
      authority_boundary: ownerRouteWorkOrderAuthorityBoundary(),
    };
  });
}

function ownerRouteWorkOrdersByLane(workOrders: ReturnType<typeof ownerRouteWorkOrders>) {
  return Object.fromEntries(workOrders.map((workOrder) => [workOrder.lane, workOrder]));
}

export function foundryAgentOsProductionEvidenceGate(input: {
  domainOpenCount: number;
  l5RequiredModuleCount: number;
  brandModuleL5: Record<string, unknown>;
  appReleaseOpenCount: number;
  providerOpenCount: number;
  providerLongSoakOwnerActionChecklist?: unknown[];
  providerLongSoakMissingOwnerActionIds?: string[];
  providerLongSoakNextEvidenceAction?: string | null;
  cleanupOpenDecisionCount: number;
  lifecycleOpenCount: number;
  lifecycleOwnerActionChecklist?: unknown[];
  lifecycleMissingOwnerActionIds?: string[];
  lifecycleNextEvidenceAction?: string | null;
  ownerEvidenceIntake: Record<string, unknown>;
}) {
  const brandModules = recordList(input.brandModuleL5.modules);
  const brandL5RequirementWorkOrders = brandModuleL5RequirementWorkOrders(brandModules);
  const brandL5OwnerActionChecklist = brandModuleL5OwnerActionChecklist(
    brandModules,
    brandL5RequirementWorkOrders,
  );
  const brandL5MissingOwnerActionIds = unique(
    brandL5OwnerActionChecklist.flatMap((entry) =>
      stringListValue(record(entry).missing_requirement_action_ids)
    )
  );
  const brandL5MissingOwnerEvidenceActionIds = unique(
    brandL5OwnerActionChecklist.flatMap((entry) =>
      stringListValue(record(entry).missing_owner_evidence_action_ids)
    )
  );
  const brandL5TypedBlockerActionIds = unique(
    brandL5OwnerActionChecklist.flatMap((entry) =>
      stringListValue(record(entry).typed_blocker_action_ids)
    )
  );
  const brandL5ObservedRefsNotL5ClaimActionIds = unique(
    brandL5OwnerActionChecklist.flatMap((entry) =>
      stringListValue(record(entry).observed_refs_not_l5_claim_action_ids)
    )
  );
  const brandL5ActionableRequirementWorkOrders = brandL5RequirementWorkOrders.filter(
    (entry) =>
      brandL5MissingOwnerActionIds.includes(stringValue(entry.work_order_id) ?? ''),
  );
  const brandL5MissingOwnerEvidenceWorkOrders = brandL5RequirementWorkOrders.filter(
    (entry) =>
      brandL5MissingOwnerEvidenceActionIds.includes(stringValue(entry.work_order_id) ?? ''),
  );
  const brandL5TypedBlockerWorkOrders = brandL5RequirementWorkOrders.filter(
    (entry) =>
      brandL5TypedBlockerActionIds.includes(stringValue(entry.work_order_id) ?? ''),
  );
  const brandL5ObservedRefsNotL5ClaimWorkOrders = brandL5RequirementWorkOrders.filter(
    (entry) =>
      brandL5ObservedRefsNotL5ClaimActionIds.includes(stringValue(entry.work_order_id) ?? ''),
  );
  const brandL5ObservedRefWorkOrders = brandL5RequirementWorkOrders
      .map((entry) => stringValue(entry.work_order_id))
      .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  const laneStatuses = [
    {
      lane: 'domain_owner_chain_scaleout',
      open_count: input.domainOpenCount,
      accepted_closing_ref_shapes: [
        'domain_owner_receipt_ref',
        'typed_blocker_ref',
        'human_gate_ref',
        'quality_or_export_receipt_ref',
        'reviewer_receipt_ref',
        'no_regression_ref',
      ],
    },
    {
      lane: 'brand_module_l5_operating_maturity',
      open_count: input.l5RequiredModuleCount,
      accepted_closing_ref_shapes: [
        'live_user_path_ref',
        'cross_agent_scaleout_ref',
        'owner_acceptance_ref',
        'typed_blocker_ref',
      ],
      owner_action_checklist: brandL5OwnerActionChecklist,
      missing_owner_action_ids: brandL5MissingOwnerActionIds,
      next_evidence_action: 'record_or_resolve_brand_module_l5_owner_evidence_for_missing_module_requirements',
    },
    {
      lane: 'app_release_user_path',
      open_count: input.appReleaseOpenCount,
      accepted_closing_ref_shapes: [
        'release_evidence_ref',
        'install_evidence_ref',
        'release_owner_receipt_ref',
        'release_owner_typed_blocker_ref',
        'typed_blocker_ref',
        'owner_acceptance_ref',
      ],
    },
    {
      lane: 'provider_long_soak',
      open_count: input.providerOpenCount,
      accepted_closing_ref_shapes: [
        'long_soak_ref',
        'recovery_ref',
        'dead_letter_ref',
        'provider_blocker_ref',
        'typed_blocker_ref',
      ],
      owner_action_checklist: input.providerLongSoakOwnerActionChecklist ?? [],
      missing_owner_action_ids: input.providerLongSoakMissingOwnerActionIds ?? [],
      next_evidence_action: input.providerLongSoakNextEvidenceAction ?? null,
    },
    {
      lane: 'private_platform_retirement',
      open_count: input.cleanupOpenDecisionCount,
      accepted_closing_ref_shapes: [
        'physical_delete_authorization_ref',
        'keep_as_authority_adapter_ref',
        'typed_blocker_ref',
      ],
    },
    {
      lane: 'memory_artifact_lifecycle_apply',
      open_count: input.lifecycleOpenCount,
      accepted_closing_ref_shapes: [
        'memory_receipt_ref',
        'artifact_mutation_receipt_ref',
        'package_export_lifecycle_receipt_ref',
        'typed_blocker_ref',
      ],
      owner_action_checklist: input.lifecycleOwnerActionChecklist ?? [],
      missing_owner_action_ids: input.lifecycleMissingOwnerActionIds ?? [],
      next_evidence_action: input.lifecycleNextEvidenceAction ?? null,
    },
  ];
  const workOrders = ownerRouteWorkOrders(laneStatuses, input.ownerEvidenceIntake);
  const workOrdersByLane = ownerRouteWorkOrdersByLane(workOrders);
  const openLaneCount = laneStatuses.filter((lane) => lane.open_count > 0).length;
  return {
    surface_kind: 'foundry_agent_os_production_evidence_gate',
    owner: 'one-person-lab',
    status: openLaneCount > 0
      ? 'evidence_required'
      : 'evidence_intake_ready_not_production_ready_claim',
    w7_status: 'production_evidence_not_closed_by_opl',
    source_commands: [
      'opl agents conformance --family-defaults --json',
      'opl brand-modules l5-status --json',
      SOURCE_COMMANDS.app_operator_drilldown,
    ],
    required_closing_ref_shapes: [
      'domain_owner_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'quality_or_export_receipt_ref',
      'reviewer_receipt_ref',
      'long_soak_ref',
      'release_evidence_ref',
      'install_evidence_ref',
      'owner_acceptance_ref',
    ],
    non_closing_inputs: [
      'conformance_pass',
      'docs_foldback',
      'contract_validation',
      'generated_descriptor_ready',
      'provider_completion',
      'app_projection',
      'verified_refs_only_ledger',
      'zero_worklist_count',
    ],
    lane_statuses: laneStatuses.map((lane) => ({
      ...lane,
      observed_owner_evidence_status:
        stringValue(
          recordList(input.ownerEvidenceIntake.lane_evidence)
            .find((entry) => stringValue(entry.lane) === lane.lane)?.status,
        ) ?? 'owner_evidence_required',
      status: lane.open_count > 0
        ? 'evidence_required'
        : 'refs_observed_not_production_ready_claim',
    })),
    final_scaleout_gate: {
      surface_kind: 'opl_final_scaleout_gate',
      status: openLaneCount > 0
        ? 'external_owner_evidence_required'
        : 'owner_verdict_refs_required_before_ready_claim',
      open_lane_count: openLaneCount,
      blocker_refs: [],
      owner_verdict_refs: [],
      release_verdict_refs: [],
      long_soak_refs: [],
      owner_route_work_order_count: workOrders.length,
      ready_claim_authorized: false,
      non_closing_inputs: [
        'zero_worklist_count',
        'same_cohort_diagnostic',
        'long_soak_workorder',
        'verified_refs_only_ledger',
      ],
      authority_boundary: {
        can_claim_domain_ready: false,
        can_claim_app_release_ready: false,
        can_claim_l5: false,
        can_claim_production_ready: false,
      },
    },
    owner_route_work_orders: workOrders,
    owner_route_work_orders_by_lane: workOrdersByLane,
    brand_module_l5_requirement_work_orders: brandL5RequirementWorkOrders,
    summary: {
      open_lane_count: openLaneCount,
      owner_route_work_order_count: workOrders.length,
      brand_module_l5_requirement_work_order_count:
        brandL5RequirementWorkOrders.length,
      brand_module_l5_actionable_work_order_count:
        brandL5ActionableRequirementWorkOrders.length,
      brand_module_l5_missing_owner_evidence_work_order_count:
        brandL5MissingOwnerEvidenceWorkOrders.length,
      brand_module_l5_typed_blocker_recorded_work_order_count:
        brandL5TypedBlockerWorkOrders.length,
      brand_module_l5_observed_refs_not_l5_claim_work_order_count:
        brandL5ObservedRefsNotL5ClaimWorkOrders.length,
      brand_module_l5_typed_blocker_ready_work_order_count:
        brandL5RequirementWorkOrders.filter((entry) =>
          Object.keys(record(entry.typed_blocker_payload_template)).length > 0
        ).length,
      brand_module_l5_owner_acceptance_required_work_order_count:
        brandL5RequirementWorkOrders.filter((entry) =>
          entry.owner_acceptance_required === true
        ).length,
      brand_module_l5_existing_evidence_ref_work_order_count:
        brandL5RequirementWorkOrders.filter((entry) =>
          entry.existing_evidence_refs.length > 0
        ).length,
      brand_module_l5_existing_blocker_ref_work_order_count:
        brandL5RequirementWorkOrders.filter((entry) =>
          entry.existing_blocker_refs.length > 0
        ).length,
      brand_module_l5_observed_ref_work_order_count:
        brandL5RequirementWorkOrders.filter((entry) =>
          entry.observed_ref_count > 0 || entry.observed_evidence_refs.length > 0
        ).length,
      brand_module_l5_owner_action_id_count:
        brandL5MissingOwnerActionIds.length,
      brand_module_l5_missing_owner_evidence_action_id_count:
        brandL5MissingOwnerEvidenceActionIds.length,
      brand_module_l5_typed_blocker_action_id_count:
        brandL5TypedBlockerActionIds.length,
      brand_module_l5_observed_refs_not_l5_claim_action_id_count:
        brandL5ObservedRefsNotL5ClaimActionIds.length,
      brand_module_l5_all_requirement_work_order_id_count:
        brandL5ObservedRefWorkOrders.length,
      open_owner_route_work_order_count: workOrders.filter((entry) => entry.status === 'open').length,
      owner_evidence_required_work_order_count: workOrders.filter((entry) =>
        entry.owner_evidence_closure_state === 'owner_evidence_required'
      ).length,
      owner_evidence_recorded_not_ready_claim_work_order_count: workOrders.filter((entry) =>
        entry.owner_evidence_closure_state === 'owner_evidence_recorded_not_ready_claim'
      ).length,
      owner_acceptance_required_work_order_count: workOrders.filter((entry) =>
        entry.owner_acceptance_required === true
      ).length,
      observed_owner_evidence_lane_count: workOrders.filter((entry) =>
        entry.observed_owner_evidence_status === 'owner_evidence_observed_not_ready_claim'
      ).length,
      closed_by_opl: false,
      production_ready_claim_authorized: false,
      requires_owner_acceptance: true,
    },
    authority_boundary: {
      gate_is_intake_and_projection_only: true,
      can_write_domain_truth: false,
      can_sign_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_app_release_ready: false,
      can_claim_l5: false,
      can_claim_production_ready: false,
    },
  };
}
