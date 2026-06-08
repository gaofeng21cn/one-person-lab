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
  stage_run_closeout_binding_gate_applies_to: 'current_owner_answer_compensation_chain',
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
  'agent_lab_materializer',
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

export type DefaultCallerPrivatePlatformCleanupDisposition =
  typeof DEFAULT_CALLER_PRIVATE_PLATFORM_CLEANUP_ALLOWED_DISPOSITIONS[number];
