export const DEFAULT_CALLER_RETIREMENT_TARGET_CLASSES = [
  'legacy_reconcile_compensation_path',
  'legacy_materialize_compensation_path',
  'legacy_dispatch_compensation_path',
  'retained_domain_wrapper',
] as const;

export const DEFAULT_CALLER_RETIREMENT_MANDATORY_GATE_IDS = [
  'replacement_parity',
  'no_active_caller_proof',
  'domain_owner_receipt_or_typed_blocker',
  'no_forbidden_write_proof',
  'tombstone_or_provenance_ref',
] as const;

export const DEFAULT_CALLER_RETIREMENT_NON_AUTHORIZING_SURFACES = [
  'opl_agents_conformance',
  'opl_agents_default_callers_readiness',
  'opl_framework_readiness',
  'opl_family_runtime_evidence_worklist_refs_only_receipt',
  'opl_runtime_app_operator_drilldown_projection',
] as const;
