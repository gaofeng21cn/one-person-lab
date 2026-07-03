export function buildRefsOnlyAuthorityBoundaryCore() {
  return {
    domain: 'truth_memory_artifact_quality_export_owner',
    can_write_domain_truth: false,
    can_write_memory_body: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_quality_verdict: false,
    can_authorize_submission_readiness: false,
    can_authorize_export_verdict: false,
    can_execute_domain_action: false,
    can_execute_provider_signal: false,
    provider_completion_is_domain_ready: false,
  };
}

export function buildAppDrilldownRefsOnlyAuthorityBoundary() {
  return {
    opl: 'app_operator_drilldown_refs_only',
    provider: 'runtime_slo_receipt_owner',
    ...buildRefsOnlyAuthorityBoundaryCore(),
  };
}

export const refsOnlyAuthorityBoundary = buildAppDrilldownRefsOnlyAuthorityBoundary;
