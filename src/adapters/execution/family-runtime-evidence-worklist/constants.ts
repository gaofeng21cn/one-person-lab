export const NOT_AUTHORIZED_CLAIMS = [
  'domain_truth_write',
  'domain_ready',
  'domain_ready_verdict',
  'quality_verdict',
  'artifact_authority',
  'artifact_authority_verdict',
  'memory_body_access',
  'production_ready',
  'submission_or_export_readiness_verdict',
  'domain_repo_physical_delete_authorization',
  'default_caller_delete_ready',
];

export const BLOCKED_ROUTE_STATUS_PREFIX = 'blocked_by_';

export const OPEN_WORKLIST_STATUS = 'open_safe_action_request_route_available';

export const DIAGNOSTIC_ONLY_STATUS = 'diagnostic_only';

export const DIAGNOSTIC_ONLY_ROUTE_SEMANTICS =
  'read_only_operator_diagnostic_not_safe_action_or_closeable_workorder';

export const OPEN_SAFE_ACTION_PAYLOAD_REQUIREMENT_SEMANTICS =
  'open_safe_action_payload_required_is_domain_or_app_live_refs_payload_subset_not_opl_self_closure';
