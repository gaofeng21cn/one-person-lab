import { FrameworkContractError } from './contracts.ts';
import { BRAND_MODULE_L5_FALSE_AUTHORITY_BOUNDARY } from './brand-module-l5-evidence-authority.ts';
import { listBrandModuleL5EvidenceReceipts } from './brand-module-l5-evidence-ledger.ts';
import type {
  BrandModuleId,
  BrandModuleL5EvidenceClassId,
  BrandModuleL5OperatingEvidenceEntry,
  BrandModuleL5OperatingEvidenceContract,
  FrameworkContracts,
} from './types.ts';

type BrandModuleL5StatusArgs = string[];

const L5_EVIDENCE_CONTRACT_REF = 'contracts/opl-framework/brand-module-l5-operating-evidence.json';

const L5_REQUIREMENT_FORBIDDEN_OPL_CLAIMS = [
  'brand_module_l5_complete',
  'production_ready',
  'domain_ready',
  'app_release_ready',
  'quality_or_export_ready',
  'owner_receipt_signed_by_opl',
  'typed_blocker_created_by_opl',
];

function l5Contract(contracts: FrameworkContracts) {
  return contracts.brandModuleL5OperatingEvidence;
}

function l5ModuleOrThrow(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
): BrandModuleL5OperatingEvidenceEntry {
  const module = l5Contract(contracts).modules.find((entry) => entry.module_id === moduleId);
  if (!module) {
    throw new FrameworkContractError('cli_usage_error', `Unknown brand module: ${moduleId}.`, {
      module_id: moduleId,
      allowed_module_ids: l5Contract(contracts).modules.map((entry) => entry.module_id),
    });
  }
  return module;
}

function unique(items: string[]) {
  return [...new Set(items)];
}

function parseOptionalModuleArg(
  contracts: FrameworkContracts,
  args: BrandModuleL5StatusArgs,
): BrandModuleId | null {
  if (args.length === 0) {
    return null;
  }

  const moduleIndex = args.indexOf('--module');
  const moduleId = moduleIndex >= 0 ? args[moduleIndex + 1] : undefined;
  const consumed = new Set([moduleIndex, moduleIndex + 1]);
  const unexpectedArgs = args.filter((_, index) => !consumed.has(index));

  if (
    moduleIndex < 0
    || !moduleId
    || moduleId.startsWith('--')
    || unexpectedArgs.length > 0
  ) {
    throw new FrameworkContractError('cli_usage_error', 'brand-modules l5-status accepts only --module <module_id>.', {
      usage: 'opl brand-modules l5-status [--module <module_id>]',
      examples: [
        'opl brand-modules l5-status --json',
        'opl brand-modules l5-status --module runway --json',
      ],
      unexpected_args: unexpectedArgs,
    });
  }

  l5ModuleOrThrow(contracts, moduleId as BrandModuleId);
  return moduleId as BrandModuleId;
}

function evidenceRequiredModuleIds(contracts: FrameworkContracts) {
  return l5Contract(contracts).modules
    .filter((entry) => !entry.l5_can_be_claimed)
    .map((entry) => entry.module_id);
}

function completeModuleIds(contracts: FrameworkContracts) {
  return l5Contract(contracts).modules
    .filter((entry) => entry.l5_can_be_claimed)
    .map((entry) => entry.module_id);
}

function routeStatusForRequirement(currentState: string) {
  if (currentState === 'satisfied') {
    return 'owner_evidence_recorded_not_l5_claimed';
  }
  if (currentState === 'blocked') {
    return 'owner_typed_blocker_recorded';
  }
  return 'owner_evidence_required';
}

function blockerStateForRequirement(currentState: string) {
  if (currentState === 'satisfied') {
    return 'refs_observed_not_l5_claim';
  }
  if (currentState === 'blocked') {
    return 'typed_blocker_recorded';
  }
  return 'owner_route_evidence_missing';
}

function nextOwnerActionForRequirement(currentState: string) {
  if (currentState === 'satisfied') {
    return 'keep_verified_refs_and_wait_for_all_requirements';
  }
  if (currentState === 'blocked') {
    return 'resolve_typed_blocker_or_record_owner_acceptance_ref';
  }
  return 'record_owner_evidence_ref_or_typed_blocker_for_l5_requirement';
}

function routeStatusWithObservedEvidence(
  currentState: string,
  observedSuccessRefCount: number,
  observedTypedBlockerRefCount: number,
) {
  if (currentState === 'open' && observedSuccessRefCount > 0) {
    return 'owner_evidence_observed_not_l5_claimed';
  }
  if (currentState === 'open' && observedTypedBlockerRefCount > 0) {
    return 'owner_typed_blocker_recorded';
  }
  return routeStatusForRequirement(currentState);
}

function blockerStateWithObservedEvidence(
  currentState: string,
  observedSuccessRefCount: number,
  observedTypedBlockerRefCount: number,
) {
  if (currentState === 'open' && observedSuccessRefCount > 0) {
    return 'owner_route_refs_observed_not_l5_claim';
  }
  if (currentState === 'open' && observedTypedBlockerRefCount > 0) {
    return 'typed_blocker_recorded';
  }
  return blockerStateForRequirement(currentState);
}

function nextOwnerActionWithObservedEvidence(
  currentState: string,
  observedSuccessRefCount: number,
  observedTypedBlockerRefCount: number,
) {
  if (currentState === 'open' && observedSuccessRefCount > 0) {
    return 'continue_collecting_l5_owner_evidence_or_owner_acceptance_ref';
  }
  if (currentState === 'open' && observedTypedBlockerRefCount > 0) {
    return 'resolve_typed_blocker_or_record_owner_acceptance_ref';
  }
  return nextOwnerActionForRequirement(currentState);
}

function evidenceClassAcceptedRefShapes(
  contract: BrandModuleL5OperatingEvidenceContract,
  classId: BrandModuleL5EvidenceClassId,
) {
  const evidenceClass = contract.evidence_classes.find((entry) => entry.class_id === classId);
  return evidenceClass?.accepted_ref_shapes ?? [];
}

type BrandModuleL5EvidenceLedgerReceiptProjection = {
  receipt_ref: string;
  module_id: BrandModuleId;
  evidence_class_id: BrandModuleL5EvidenceClassId;
  receipt_status: string;
  evidence_refs: string[];
  typed_blocker_refs: string[];
  owner_acceptance_refs: string[];
  no_regression_refs: string[];
};

function ledgerReceiptsForRequirement(
  ledgerReceipts: BrandModuleL5EvidenceLedgerReceiptProjection[],
  moduleId: BrandModuleId,
  classId: BrandModuleL5EvidenceClassId,
) {
  return ledgerReceipts.filter((receipt) =>
    receipt.module_id === moduleId && receipt.evidence_class_id === classId
  );
}

function observedLedgerRefs(receipts: BrandModuleL5EvidenceLedgerReceiptProjection[]) {
  return unique(receipts.flatMap((receipt) => [
    receipt.receipt_ref,
    ...receipt.evidence_refs,
    ...receipt.typed_blocker_refs,
    ...receipt.owner_acceptance_refs,
    ...receipt.no_regression_refs,
  ]));
}

function contractRefsForRequirement(
  requirement: { evidence_refs?: string[]; owner_acceptance_refs?: string[]; blocker_refs?: string[] },
  options: { includeBlockerRefs?: boolean } = {},
) {
  return unique([
    ...(requirement.evidence_refs ?? []),
    ...(requirement.owner_acceptance_refs ?? []),
    ...(options.includeBlockerRefs === false ? [] : requirement.blocker_refs ?? []),
  ]);
}

function observedSuccessLedgerRefs(receipts: BrandModuleL5EvidenceLedgerReceiptProjection[]) {
  return unique(receipts.flatMap((receipt) => {
    const successRefs = [
      ...receipt.evidence_refs,
      ...receipt.owner_acceptance_refs,
      ...receipt.no_regression_refs,
    ];
    return successRefs.length > 0 ? [receipt.receipt_ref, ...successRefs] : [];
  }));
}

function observedSuccessRefsForRequirement(
  receipts: BrandModuleL5EvidenceLedgerReceiptProjection[],
  requirement: { evidence_refs?: string[]; owner_acceptance_refs?: string[] },
) {
  return unique([
    ...(requirement.evidence_refs ?? []),
    ...(requirement.owner_acceptance_refs ?? []),
    ...observedSuccessLedgerRefs(receipts),
  ]);
}

function observedTypedBlockerRefsForRequirement(
  receipts: BrandModuleL5EvidenceLedgerReceiptProjection[],
  requirement: { blocker_refs?: string[] },
) {
  return unique([
    ...(requirement.blocker_refs ?? []),
    ...receipts.flatMap((receipt) => receipt.typed_blocker_refs),
  ]);
}

function observedRefsForRequirement(
  receipts: BrandModuleL5EvidenceLedgerReceiptProjection[],
  requirement: { evidence_refs?: string[]; owner_acceptance_refs?: string[]; blocker_refs?: string[] },
) {
  const successRefs = observedSuccessRefsForRequirement(receipts, requirement);
  if (successRefs.length > 0) {
    return unique([
      ...successRefs,
      ...receipts.flatMap((receipt) => receipt.typed_blocker_refs),
    ]);
  }
  return unique([
    ...contractRefsForRequirement(requirement),
    ...observedLedgerRefs(receipts),
  ]);
}

const L5_REF_SHAPE_PREFIX_ALIASES: Record<string, string> = {
  typed_blocker: 'typed_blocker_ref',
  release_owner_receipt_ref: 'release_evidence_ref',
  release_owner_receipt: 'release_evidence_ref',
  release_evidence: 'release_evidence_ref',
  install_evidence: 'install_evidence_ref',
  temporal_hosted_long_soak_ref: 'long_soak_ref',
  provider_long_soak_ref: 'long_soak_ref',
  provider_recovery_ref: 'recovery_ref',
  provider_dead_letter_ref: 'dead_letter_ref',
};

const L5_KNOWN_REF_SHAPES = new Set([
  'app_operator_projection_ref',
  'brand_experience_profile_ref',
  'capability_fail_open_ref',
  'cross_agent_adoption_ref',
  'current_owner_delta_ref',
  'dead_letter_ref',
  'descriptor_drift_ref',
  'false_authority_guard_ref',
  'generated_surface_parity_ref',
  'human_gate_ref',
  'install_evidence_ref',
  'long_soak_ref',
  'negative_guard_ref',
  'no_regression_ref',
  'no_resurrection_guard_ref',
  'operator_default_read_ref',
  'operator_evidence_ref',
  'owner_acceptance_ref',
  'owner_receipt_ref',
  'pack_compile_parity_ref',
  'per_agent_receipt_ref',
  'per_agent_target_delta_ref',
  'recovery_ref',
  'release_evidence_ref',
  'repair_loop_ref',
  'route_required_capability_ref',
  'safe_action_ref',
  'scaleout_receipt_ref',
  'source_scan_ref',
  'typed_blocker_ref',
  'user_path_evidence_ref',
]);

function refShapeForContractRef(ref: string) {
  const prefix = ref.split(':')[0]?.trim().replaceAll('-', '_');
  if (prefix) {
    const alias = L5_REF_SHAPE_PREFIX_ALIASES[prefix];
    if (alias) {
      return alias;
    }
    if (L5_KNOWN_REF_SHAPES.has(prefix)) {
      return prefix;
    }
  }
  return 'evidence_ref';
}

function observedContractRefShapes(
  requirement: { evidence_refs?: string[]; owner_acceptance_refs?: string[]; blocker_refs?: string[] },
  options: { includeBlockerRefs?: boolean } = {},
) {
  return unique(contractRefsForRequirement(requirement, options).map(refShapeForContractRef));
}

function observedLedgerRefShapes(receipts: BrandModuleL5EvidenceLedgerReceiptProjection[]) {
  const shapes: string[] = receipts.length > 0 ? ['ledger_receipt_ref'] : [];
  const evidenceRefShapes = receipts.flatMap((receipt) =>
    receipt.evidence_refs.map(refShapeForContractRef)
  );
  shapes.push(...evidenceRefShapes);
  if (receipts.some((receipt) => receipt.typed_blocker_refs.length > 0)) {
    shapes.push(
      'typed_blocker_ref',
      ...receipts.flatMap((receipt) => receipt.typed_blocker_refs.map(refShapeForContractRef)),
    );
  }
  if (receipts.some((receipt) => receipt.owner_acceptance_refs.length > 0)) {
    shapes.push(
      'owner_acceptance_ref',
      ...receipts.flatMap((receipt) => receipt.owner_acceptance_refs.map(refShapeForContractRef)),
    );
  }
  if (receipts.some((receipt) => receipt.no_regression_refs.length > 0)) {
    shapes.push(
      'no_regression_ref',
      ...receipts.flatMap((receipt) => receipt.no_regression_refs.map(refShapeForContractRef)),
    );
  }
  return unique(shapes);
}

function observedRefShapesForRequirement(
  receipts: BrandModuleL5EvidenceLedgerReceiptProjection[],
  requirement: { evidence_refs?: string[]; owner_acceptance_refs?: string[]; blocker_refs?: string[] },
) {
  const successRefs = observedSuccessRefsForRequirement(receipts, requirement);
  return unique([
    ...observedContractRefShapes(requirement, {
      includeBlockerRefs: successRefs.length === 0,
    }),
    ...observedLedgerRefShapes(receipts),
  ]);
}

function l5RequirementWorkOrderId(
  moduleId: BrandModuleId,
  classId: BrandModuleL5EvidenceClassId,
) {
  return `w7-brand-module-l5-${moduleId}-${classId}`;
}

function l5TypedBlockerRef(
  moduleId: BrandModuleId,
  classId: BrandModuleL5EvidenceClassId,
) {
  return `typed-blocker:opl-brand-l5/${moduleId}/${classId}/owner-evidence-pending`;
}

function l5TypedBlockerReceiptRef(
  moduleId: BrandModuleId,
  classId: BrandModuleL5EvidenceClassId,
) {
  return `opl://brand-module-l5-evidence/${moduleId}/${classId}/typed-blocker-pending`;
}

function l5EvidencePlaceholderRef(
  moduleId: BrandModuleId,
  classId: BrandModuleL5EvidenceClassId,
) {
  return `owner-evidence-ref:opl-brand-l5/${moduleId}/${classId}/<owner-evidence-id>`;
}

function l5RequirementClosureState(
  currentState: string,
  observedSuccessRefCount: number,
  observedTypedBlockerRefCount = 0,
) {
  if (currentState === 'satisfied') {
    return 'owner_evidence_recorded_not_l5_claim';
  }
  if (currentState === 'blocked') {
    return 'owner_typed_blocker_recorded';
  }
  if (observedSuccessRefCount > 0) {
    return 'owner_evidence_recorded_not_l5_claim';
  }
  if (observedTypedBlockerRefCount > 0) {
    return 'owner_typed_blocker_recorded';
  }
  return 'owner_acceptance_or_typed_blocker_required';
}

function l5RequirementTypedBlockerPayload(
  moduleId: BrandModuleId,
  classId: BrandModuleL5EvidenceClassId,
) {
  return {
    module_id: moduleId,
    evidence_class_id: classId,
    typed_blocker_refs: [
      l5TypedBlockerRef(moduleId, classId),
    ],
    receipt_ref: l5TypedBlockerReceiptRef(moduleId, classId),
  };
}

function l5RequirementEvidencePayloadTemplate(
  moduleId: BrandModuleId,
  classId: BrandModuleL5EvidenceClassId,
) {
  return {
    module_id: moduleId,
    evidence_class_id: classId,
    evidence_refs: [
      l5EvidencePlaceholderRef(moduleId, classId),
    ],
  };
}

function ownerRouteCommandExamples(
  moduleId: BrandModuleId,
  classId: BrandModuleL5EvidenceClassId,
) {
  return {
    record_evidence: {
      command: 'opl runtime brand-module-l5-evidence record --payload <json> --json',
      payload_template: l5RequirementEvidencePayloadTemplate(moduleId, classId),
      closes_l5: false,
    },
    record_typed_blocker_ref: {
      command: 'opl runtime brand-module-l5-evidence record --payload <json> --json',
      payload_template: l5RequirementTypedBlockerPayload(moduleId, classId),
      closes_l5: false,
      creates_typed_blocker: false,
    },
    verify_receipt: {
      command:
        `opl runtime brand-module-l5-evidence verify --receipt-ref ${l5TypedBlockerReceiptRef(moduleId, classId)} --json`,
      closes_l5: false,
    },
    list_requirement_refs: {
      command:
        `opl runtime brand-module-l5-evidence list --module ${moduleId} --evidence-class ${classId} --json`,
      closes_l5: false,
    },
  };
}

function ownerEvidenceRoutes(
  contract: BrandModuleL5OperatingEvidenceContract,
  entry: BrandModuleL5OperatingEvidenceEntry,
  ledgerReceipts: BrandModuleL5EvidenceLedgerReceiptProjection[] = [],
) {
  return entry.evidence_requirements.map((requirement) => {
    const requirementLedgerReceipts = ledgerReceiptsForRequirement(
      ledgerReceipts,
      entry.module_id,
      requirement.class_id,
    );
    const verifiedRequirementLedgerReceipts = requirementLedgerReceipts.filter((receipt) =>
      receipt.receipt_status === 'verified'
    );
    const observedEvidenceRefs = observedRefsForRequirement(requirementLedgerReceipts, requirement);
    const observedSuccessRefs = observedSuccessRefsForRequirement(
      requirementLedgerReceipts,
      requirement,
    );
    const observedTypedBlockerRefs = observedTypedBlockerRefsForRequirement(
      requirementLedgerReceipts,
      requirement,
    );
    const observedRefShapes = observedRefShapesForRequirement(requirementLedgerReceipts, requirement);
    return {
      module_id: entry.module_id,
      class_id: requirement.class_id,
      owner: requirement.owner,
      owner_route_ref: requirement.owner_route_ref,
      owner_repo_ref: requirement.owner_repo_ref,
      owner_repo: requirement.owner_repo_ref,
      owner_route_status: routeStatusWithObservedEvidence(
        requirement.current_state,
        observedSuccessRefs.length,
        observedTypedBlockerRefs.length,
      ),
      blocker_state: blockerStateWithObservedEvidence(
        requirement.current_state,
        observedSuccessRefs.length,
        observedTypedBlockerRefs.length,
      ),
      next_owner_action: nextOwnerActionWithObservedEvidence(
        requirement.current_state,
        observedSuccessRefs.length,
        observedTypedBlockerRefs.length,
      ),
      work_order_id: l5RequirementWorkOrderId(entry.module_id, requirement.class_id),
      owner_evidence_closure_state: l5RequirementClosureState(
        requirement.current_state,
        observedSuccessRefs.length,
        observedTypedBlockerRefs.length,
      ),
      owner_acceptance_required: true,
      ready_claim_authorized: false,
      closing_ref_source:
        'brand_module_owner_evidence_ref_or_owner_acceptance_ref_for_requirement',
      typed_blocker_source: 'brand_module_owner_l5_typed_blocker_ref_for_requirement',
      verification_command:
        `opl runtime brand-module-l5-evidence verify --receipt-ref ${l5TypedBlockerReceiptRef(entry.module_id, requirement.class_id)}`,
      record_evidence_command:
        'opl runtime brand-module-l5-evidence record --payload <json>',
      owner_route_command_examples: ownerRouteCommandExamples(
        entry.module_id,
        requirement.class_id,
      ),
      typed_blocker_payload_template: l5RequirementTypedBlockerPayload(
        entry.module_id,
        requirement.class_id,
      ),
      evidence_payload_template: l5RequirementEvidencePayloadTemplate(
        entry.module_id,
        requirement.class_id,
      ),
      accepted_ref_shapes: unique([
        ...evidenceClassAcceptedRefShapes(contract, requirement.class_id),
        ...contract.owner_route_work_order_policy.accepted_route_ref_shapes,
      ]),
      existing_evidence_refs: requirement.evidence_refs ?? [],
      existing_owner_acceptance_refs: requirement.owner_acceptance_refs ?? [],
      existing_blocker_refs: requirement.blocker_refs ?? [],
      observed_evidence_refs: observedEvidenceRefs,
      observed_receipt_refs: requirementLedgerReceipts.map((receipt) => receipt.receipt_ref),
      observed_ref_shapes: observedRefShapes,
      observed_ref_count: observedEvidenceRefs.length,
      observed_typed_blocker_ref_count: observedTypedBlockerRefs.length,
      observed_receipt_count: requirementLedgerReceipts.length,
      verified_receipt_count: verifiedRequirementLedgerReceipts.length,
      l5_claim_status: observedSuccessRefs.length > 0
        ? 'owner_evidence_refs_observed_not_l5_claimed'
        : observedTypedBlockerRefs.length > 0
          ? 'owner_typed_blocker_recorded_not_l5_claimed'
          : observedEvidenceRefs.length > 0
          ? 'owner_evidence_refs_observed_not_l5_claimed'
          : 'owner_evidence_required',
      non_closing_inputs: contract.owner_route_work_order_policy.non_closing_inputs,
      forbidden_opl_claims: L5_REQUIREMENT_FORBIDDEN_OPL_CLAIMS,
      stop_loss: [
        'if observed refs exist but l5_can_be_claimed is false, do not add more OPL projection evidence for this requirement',
        'if the requirement needs owner acceptance, request owner_acceptance_ref or typed_blocker_ref from the listed owner repo',
        'if only contract validation, docs foldback, conformance pass, App projection, provider completion, or verified refs-only ledger exists, keep ready_claim_authorized=false',
      ],
      authority_boundary: {
        route_is_refs_only: true,
        route_can_claim_l5: false,
        route_can_claim_production_ready: false,
        route_can_create_owner_receipt: false,
        route_can_create_typed_blocker: false,
      },
    };
  });
}

type BrandModuleL5OwnerEvidenceRoute = ReturnType<typeof ownerEvidenceRoutes>[number];

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

function nextActionSummary(
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
  const nextRoute = firstMissingRoute ?? firstTypedBlockerRoute;
  return {
    module_id: entry.module_id,
    status: entry.l5_can_be_claimed ? 'complete' : entry.l5_completion_status,
    l5_can_be_claimed: entry.l5_can_be_claimed,
    next_owner_action: nextRoute
      ? nextRoute.next_owner_action
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

function moduleOwnerFollowthroughSummary(routes: BrandModuleL5OwnerEvidenceRoute[]) {
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
    next_followthrough_action: actionableRoutes[0]?.next_owner_action ?? null,
    next_followthrough_work_order_id: actionableRoutes[0]?.work_order_id ?? null,
    false_completion_guard: {
      observed_refs_close_l5: false,
      typed_blocker_refs_close_l5: false,
      owner_followthrough_closes_l5_without_owner_acceptance: false,
      ready_claim_authorized: false,
    },
  };
}

function compactModule(
  contract: BrandModuleL5OperatingEvidenceContract,
  entry: BrandModuleL5OperatingEvidenceEntry,
  ledgerReceipts: BrandModuleL5EvidenceLedgerReceiptProjection[],
) {
  const satisfied_requirement_count = entry.evidence_requirements
    .filter((requirement) => requirement.current_state === 'satisfied')
    .length;
  const moduleLedgerReceipts = ledgerReceipts.filter((receipt) =>
    receipt.module_id === entry.module_id
  );
  const verifiedModuleLedgerReceipts = moduleLedgerReceipts.filter((receipt) =>
    receipt.receipt_status === 'verified'
  );
  const routes = ownerEvidenceRoutes(contract, entry, moduleLedgerReceipts);
  const ownerFollowthroughSummary = moduleOwnerFollowthroughSummary(routes);
  return {
    module_id: entry.module_id,
    brand_name: entry.brand_name,
    current_level: entry.current_level,
    l5_target_level: 'L5_production_operating_maturity',
    l5_completion_status: entry.l5_completion_status,
    l5_can_be_claimed: entry.l5_can_be_claimed,
    evidence_required: !entry.l5_can_be_claimed,
    evidence_requirement_count: entry.evidence_requirements.length,
    satisfied_requirement_count,
    open_requirement_count: entry.evidence_requirements
      .filter((requirement) => requirement.current_state === 'open')
      .length,
    blocked_requirement_count: entry.evidence_requirements
      .filter((requirement) => requirement.current_state === 'blocked')
      .length,
    evidence_ledger: {
      receipt_count: moduleLedgerReceipts.length,
      verified_receipt_count: verifiedModuleLedgerReceipts.length,
      observed_evidence_class_ids: unique(
        moduleLedgerReceipts.map((receipt) => receipt.evidence_class_id),
      ),
      verified_evidence_class_ids: unique(
        verifiedModuleLedgerReceipts.map((receipt) => receipt.evidence_class_id),
      ),
      l5_claim_status: 'ledger_refs_only_not_l5_claimed',
    },
    next_action_summary: nextActionSummary(entry, routes),
    owner_followthrough_summary: ownerFollowthroughSummary,
    immediate_enabling_surfaces: entry.immediate_enabling_surfaces,
    evidence_requirements: entry.evidence_requirements,
    owner_evidence_routes: routes,
    not_claims: entry.not_claims,
  };
}

function statusEnvelope(
  contracts: FrameworkContracts,
  modules: BrandModuleL5OperatingEvidenceEntry[],
) {
  const contract = l5Contract(contracts);
  const allCompleteModuleIds = completeModuleIds(contracts);
  const allEvidenceRequiredModuleIds = evidenceRequiredModuleIds(contracts);
  const evidenceLedger = listBrandModuleL5EvidenceReceipts(contracts);
  return {
    surface_kind: 'opl_brand_module_l5_status',
    version: contract.version,
    scope: contract.scope,
    status: allCompleteModuleIds.length === contract.modules.length ? 'complete' : 'evidence_required',
    baseline_level: contract.baseline_level,
    target_level: contract.target_level,
    l5_evidence_contract_ref: L5_EVIDENCE_CONTRACT_REF,
    l5_claim_policy: contract.l5_claim_policy,
    owner_route_work_order_policy: contract.owner_route_work_order_policy,
    evidence_classes: contract.evidence_classes,
    all_module_count: contract.modules.length,
    module_count: modules.length,
    l5_complete_module_count: allCompleteModuleIds.length,
    l5_complete_module_ids: allCompleteModuleIds,
    evidence_required_module_count: allEvidenceRequiredModuleIds.length,
    evidence_required_module_ids: allEvidenceRequiredModuleIds,
    evidence_ledger: {
      surface_kind: evidenceLedger.surface_kind,
      receipt_count: evidenceLedger.receipt_count,
      verified_receipt_count: evidenceLedger.verified_receipt_count,
      ledger_file: evidenceLedger.ledger_file,
      l5_claim_status: evidenceLedger.l5_claim_status,
    },
    immediate_enabling_surface_count: modules.reduce(
      (count, entry) => count + entry.immediate_enabling_surfaces.length,
      0,
    ),
    modules: modules.map((entry) => compactModule(contract, entry, evidenceLedger.receipts)),
    not_claims: unique(modules.flatMap((entry) => entry.not_claims)),
    authority_boundary: BRAND_MODULE_L5_FALSE_AUTHORITY_BOUNDARY,
    machine_boundary: contract.machine_boundary,
  };
}

export function buildBrandModuleL5Status(
  contracts: FrameworkContracts,
  args: BrandModuleL5StatusArgs = [],
) {
  const moduleId = parseOptionalModuleArg(contracts, args);
  const modules = moduleId
    ? [l5ModuleOrThrow(contracts, moduleId)]
    : l5Contract(contracts).modules;
  return {
    version: 'g2',
    brand_module_l5_status: statusEnvelope(contracts, modules),
  };
}

function missingClassIds(entry: BrandModuleL5OperatingEvidenceEntry) {
  const actual = new Set(entry.evidence_requirements.map((requirement) => requirement.class_id));
  return l5ContractClassIds.filter((classId) => !actual.has(classId));
}

const l5ContractClassIds: BrandModuleL5EvidenceClassId[] = [
  'live_user_path',
  'ordinary_app_experience',
  'cross_agent_scaleout',
  'long_soak_recovery',
  'release_install_evidence',
  'operator_repair_loop',
  'owner_acceptance',
  'no_second_truth_regression',
  'pack_compile_parity',
  'current_owner_delta_default_read',
  'capability_fail_open_boundary',
  'domain_authority_false_boundary',
  'cross_agent_foundry_agent_os_adoption',
];

function hasSatisfiedEvidenceRefs(entry: BrandModuleL5OperatingEvidenceEntry) {
  return entry.evidence_requirements.every((requirement) => (
    requirement.current_state === 'satisfied'
    && (
      (Array.isArray(requirement.evidence_refs) && requirement.evidence_refs.length > 0)
      || (Array.isArray(requirement.owner_acceptance_refs) && requirement.owner_acceptance_refs.length > 0)
    )
  ));
}

export function buildBrandModuleL5Validation(contracts: FrameworkContracts) {
  const contract = l5Contract(contracts);
  const missingEvidenceClassModules = contract.modules
    .map((entry) => ({
      module_id: entry.module_id,
      missing_class_ids: missingClassIds(entry),
    }))
    .filter((entry) => entry.missing_class_ids.length > 0);
  const falseCompletionViolations = contract.modules
    .filter((entry) => entry.l5_can_be_claimed && !hasSatisfiedEvidenceRefs(entry))
    .map((entry) => entry.module_id);
  const completionStatusViolations = contract.modules
    .filter((entry) => !entry.l5_can_be_claimed && entry.l5_completion_status === 'complete')
    .map((entry) => entry.module_id);
  const l5CompleteModuleIds = completeModuleIds(contracts);

  return {
    version: 'g2',
    brand_module_l5_validation: {
      surface_kind: 'opl_brand_module_l5_validation',
      status: missingEvidenceClassModules.length === 0
        && falseCompletionViolations.length === 0
        && completionStatusViolations.length === 0
        ? 'valid'
        : 'invalid',
      l5_readiness_status: l5CompleteModuleIds.length === contract.modules.length ? 'complete' : 'evidence_required',
      l5_evidence_contract_ref: L5_EVIDENCE_CONTRACT_REF,
      baseline_level: contract.baseline_level,
      target_level: contract.target_level,
      evidence_classes: contract.evidence_classes.map((entry) => entry.class_id),
      validated_module_count: contract.modules.length,
      l5_complete_module_count: l5CompleteModuleIds.length,
      l5_complete_module_ids: l5CompleteModuleIds,
      evidence_required_module_ids: evidenceRequiredModuleIds(contracts),
      missing_evidence_class_modules: missingEvidenceClassModules,
      false_completion_violations: falseCompletionViolations,
      completion_status_violations: completionStatusViolations,
      l5_claim_policy: contract.l5_claim_policy,
      authority_boundary: BRAND_MODULE_L5_FALSE_AUTHORITY_BOUNDARY,
      not_claims: [
        'contract_validation_counts_as_l5',
        'docs_foldback_counts_as_l5',
        'provider_completion_counts_as_l5',
        'app_projection_counts_as_l5',
        'conformance_pass_counts_as_l5',
      ],
    },
  };
}

export function buildBrandModuleL5Interfaces(contracts: FrameworkContracts) {
  const contract = l5Contract(contracts);
  return {
    version: 'g2',
    brand_module_l5_interfaces: {
      surface_kind: 'opl_brand_module_l5_interface_bundle',
      version: contract.version,
      l5_evidence_contract_ref: L5_EVIDENCE_CONTRACT_REF,
      baseline_level: contract.baseline_level,
      target_level: contract.target_level,
      cli: {
        commands: [
          'opl brand-modules l5-status --json',
          'opl brand-modules l5-status --module <module_id> --json',
          'opl brand-modules l5-validate --json',
          'opl brand-modules l5-interfaces --json',
          'opl runtime brand-module-l5-evidence record --payload <json> --json',
          'opl runtime brand-module-l5-evidence verify --receipt-ref <ref> --json',
          'opl runtime brand-module-l5-evidence list --module <module_id> --json',
          ...contract.modules.map((entry) => `opl ${entry.module_id} l5-status --json`),
        ],
      },
      app: {
        descriptors: [
          {
            action_id: 'brand_modules_l5_status',
            command: 'opl brand-modules l5-status --json',
            mutation: false,
            descriptor_only: true,
          },
          {
            action_id: 'brand_modules_l5_validate',
            command: 'opl brand-modules l5-validate --json',
            mutation: false,
            descriptor_only: true,
          },
          {
            action_id: 'brand_modules_l5_evidence_record',
            command: 'opl runtime brand-module-l5-evidence record --payload <json> --json',
            mutation: true,
            descriptor_only: true,
          },
        ],
      },
      descriptor: {
        refs: [
          L5_EVIDENCE_CONTRACT_REF,
          'opl brand-modules l5-interfaces --json',
        ],
      },
      validation: {
        commands: [
          'opl brand-modules l5-validate --json',
          'opl runtime brand-module-l5-evidence verify --receipt-ref <ref> --json',
          'opl contract validate --json',
        ],
      },
      modules: contract.modules.map((entry) => ({
        module_id: entry.module_id,
        brand_name: entry.brand_name,
        command: `opl ${entry.module_id} l5-status --json`,
        l5_completion_status: entry.l5_completion_status,
        l5_can_be_claimed: entry.l5_can_be_claimed,
      })),
      l5_claim_policy: contract.l5_claim_policy,
      authority_boundary: BRAND_MODULE_L5_FALSE_AUTHORITY_BOUNDARY,
    },
  };
}

export function buildBrandModuleL5ModuleStatus(
  contracts: FrameworkContracts,
  moduleId: BrandModuleId,
) {
  const module = l5ModuleOrThrow(contracts, moduleId);
  const evidenceLedger = listBrandModuleL5EvidenceReceipts(contracts);
  const moduleLedgerReceipts = evidenceLedger.receipts.filter((receipt) =>
    receipt.module_id === module.module_id
  );
  const routes = ownerEvidenceRoutes(
    l5Contract(contracts),
    module,
    moduleLedgerReceipts,
  );
  const key = `opl_${moduleId.replace(/-/g, '_')}_l5_status`;
  return {
    version: 'g2',
    brand_module_l5_status: statusEnvelope(contracts, [module]),
    [key]: {
      surface_kind: key,
      module_id: module.module_id,
      brand_name: module.brand_name,
      status: module.l5_can_be_claimed ? 'complete' : module.l5_completion_status,
      current_level: module.current_level,
      target_level: 'L5_production_operating_maturity',
      l5_can_be_claimed: module.l5_can_be_claimed,
      l5_evidence_contract_ref: `${L5_EVIDENCE_CONTRACT_REF}#modules.${module.module_id}`,
      owner_route_work_order_policy: l5Contract(contracts).owner_route_work_order_policy,
      evidence_requirement_count: module.evidence_requirements.length,
      evidence_requirements: module.evidence_requirements,
      next_action_summary: nextActionSummary(module, routes),
      owner_evidence_routes: routes,
      immediate_enabling_surfaces: module.immediate_enabling_surfaces,
      not_claims: module.not_claims,
      authority_boundary: BRAND_MODULE_L5_FALSE_AUTHORITY_BOUNDARY,
      machine_boundary: 'Read-only L5 operating evidence status; does not create owner receipts, typed blockers, App release truth, long-soak proof, domain readiness, or production readiness.',
    },
  };
}
