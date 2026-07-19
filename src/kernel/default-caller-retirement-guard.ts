export const DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES = [
  'legacy_reconcile_compensation_path',
  'legacy_materialize_compensation_path',
  'legacy_dispatch_compensation_path',
  'retained_domain_wrapper',
] as const;

export const DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS = [
  'replacement_parity',
  'no_active_caller_proof',
  'no_forbidden_write_proof',
  'tombstone_or_provenance_ref',
] as const;

export const DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS = [
  'replacement_parity',
  'no_active_caller_proof',
  'domain_owner_receipt_or_typed_blocker',
  'no_forbidden_write_proof',
  'tombstone_or_provenance_ref',
] as const;

export const DEFAULT_CALLER_SAME_WORK_UNIT_LIVE_EVIDENCE_SCOPE = {
  gate_id: 'same_work_unit_live_evidence',
  applies_to: 'current_owner_answer_compensation_chain',
  blocks_static_no_active_caller_retirement: false,
  static_retired_surface_classes: [
    'retired_wrapper',
    'retired_alias',
    'retired_facade',
  ],
  static_retirement_prerequisite_gate_ids: [
    ...DEFAULT_CALLER_STATIC_RETIREMENT_PREREQUISITE_GATE_IDS,
  ],
} as const;

export const DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES = [
  'opl_agents_conformance',
  'opl_agents_default_callers_readiness',
  'opl_framework_readiness',
  'opl_family_runtime_evidence_worklist_refs_only_receipt',
  'opl_runtime_app_operator_drilldown_projection',
] as const;

export const DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION =
  'domain_owner_choose_delete_authorize_keep_or_typed_blocker' as const;

export const DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES = [
  'physical_delete_authorization_ref',
  'keep_as_authority_adapter_ref',
  'typed_blocker_ref',
] as const;

export const DEFAULT_CALLER_DEFAULT_ORDINARY_LANE_ID = 'default_ordinary_lane' as const;

export const DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_LANE_ID =
  'private_platform_cleanup_lane' as const;

export const DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS = [
  'scheduler',
  'queue',
  'session_store',
  'workbench',
  'status_shell',
  'domain_wrapper',
  'runtime_watch',
  'legacy_agent_materializer',
] as const;

export const DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS = [
  'retain_authority_function',
  'absorb_opl_primitive',
  'no_active_caller_delete',
  'tombstone',
  'owner_typed_blocker',
] as const;

export type DefaultCallerPrivatePlatformResidueTargetKind =
  typeof DEFAULT_CALLER_PRIVATE_PLATFORM_RESIDUE_TARGET_KINDS[number];

export function defaultCallerOwnerDecisionCloseoutReadout(input: {
  prerequisitesObserved: boolean;
  ownerDecisionObserved: boolean;
  physicalDeleteAuthorized?: boolean;
  ownerDecisionResultShape?: string | null;
}) {
  if (!input.prerequisitesObserved) {
    return {
      owner_decision_closeout_status: 'waiting_for_structural_prerequisites',
      no_further_opl_default_caller_delete_work: false,
      owner_decision_observed: false,
      owner_decision_pending: false,
      keep_as_authority_adapter_observed: false,
      typed_blocker_observed: false,
      physical_delete_authorization_request_observed: false,
      next_opl_default_caller_delete_action:
        'observe_structural_prerequisites_before_domain_owner_decision',
    };
  }
  if (!input.ownerDecisionObserved) {
    return {
      owner_decision_closeout_status: 'domain_owner_decision_ref_not_observed',
      no_further_opl_default_caller_delete_work: false,
      owner_decision_observed: false,
      owner_decision_pending: true,
      keep_as_authority_adapter_observed: false,
      typed_blocker_observed: false,
      physical_delete_authorization_request_observed: false,
      next_opl_default_caller_delete_action:
        DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION,
    };
  }
  const ownerDecisionResultShape = input.ownerDecisionResultShape ?? null;
  const physicalDeleteAuthorizationObserved =
    input.physicalDeleteAuthorized === true
    || ownerDecisionResultShape === 'physical_delete_authorization_ref';
  const keepAsAuthorityAdapterObserved =
    ownerDecisionResultShape === 'keep_as_authority_adapter_ref';
  const typedBlockerObserved = ownerDecisionResultShape === 'typed_blocker_ref';
  const ownerReceiptObserved = ownerDecisionResultShape === 'owner_receipt_ref';
  const ownerDecisionCloseoutStatus = physicalDeleteAuthorizationObserved
      ? 'physical_delete_authorization_ref_observed_domain_owner_route_only'
    : keepAsAuthorityAdapterObserved
      ? 'keep_as_authority_adapter_observed_no_further_opl_delete_work'
    : typedBlockerObserved
      ? 'typed_blocker_observed_no_further_opl_delete_work'
    : ownerReceiptObserved
      ? 'owner_receipt_observed_no_further_opl_delete_work'
    : 'owner_decision_ref_observed_no_further_opl_delete_work';
  return {
    owner_decision_closeout_status: ownerDecisionCloseoutStatus,
    no_further_opl_default_caller_delete_work: true,
    owner_decision_observed: true,
    owner_decision_pending: false,
    keep_as_authority_adapter_observed: keepAsAuthorityAdapterObserved,
    typed_blocker_observed: typedBlockerObserved,
    physical_delete_authorization_request_observed: physicalDeleteAuthorizationObserved,
    next_opl_default_caller_delete_action:
      'no_further_opl_default_caller_delete_work',
  };
}

export function aggregateDefaultCallerOwnerDecisionResultShape(input: {
  physicalDeleteAuthorized?: boolean;
  resultShapes: readonly (string | null | undefined)[];
}) {
  if (input.physicalDeleteAuthorized === true) {
    return 'physical_delete_authorization_ref';
  }
  const resultShapes = new Set(input.resultShapes.filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  ));
  if (resultShapes.has('keep_as_authority_adapter_ref')) {
    return 'keep_as_authority_adapter_ref';
  }
  if (resultShapes.has('typed_blocker_ref')) {
    return 'typed_blocker_ref';
  }
  if (resultShapes.has('owner_receipt_ref')) {
    return 'owner_receipt_ref';
  }
  return null;
}

export function buildDefaultCallerOwnerDecisionReadModel(input: {
  prerequisitesObserved: boolean;
  ownerDecisionObserved: boolean;
  physicalDeleteAuthorized?: boolean;
  ownerDecisionResultShape?: string | null;
}) {
  const physicalDeleteAuthorized = input.physicalDeleteAuthorized === true;
  const ownerDecisionResultShape = input.ownerDecisionResultShape ?? null;
  const ownerDecisionStatus = !input.prerequisitesObserved
      ? 'waiting_for_structural_prerequisites'
    : !input.ownerDecisionObserved
      ? 'owner_decision_required'
    : physicalDeleteAuthorized
      ? 'owner_decision_observed_physical_delete_authorized'
    : 'owner_decision_observed_refs_only_not_delete_authorized';
  return {
    owner_decision_result_shape: ownerDecisionResultShape,
    ...defaultCallerOwnerDecisionCloseoutReadout({
      prerequisitesObserved: input.prerequisitesObserved,
      ownerDecisionObserved: input.ownerDecisionObserved,
      physicalDeleteAuthorized,
      ownerDecisionResultShape,
    }),
    owner_decision_status: ownerDecisionStatus,
    delete_or_keep_prerequisites_observed: input.prerequisitesObserved,
    owner_decision_required_after_prerequisites_observed: input.prerequisitesObserved,
    next_required_owner_action: input.prerequisitesObserved
      ? DEFAULT_CALLER_OWNER_DECISION_NEXT_REQUIRED_ACTION
      : 'domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review',
    accepted_refs_only_result_shapes: input.prerequisitesObserved
      ? [...DEFAULT_CALLER_OWNER_DECISION_ACCEPTED_RESULT_SHAPES]
      : ['typed_blocker_ref'],
    owner_decision_required_after_all_refs_observed: input.ownerDecisionObserved,
  };
}

export type DefaultCallerPrivatePlatformCleanupDisposition =
  typeof DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS[number];
