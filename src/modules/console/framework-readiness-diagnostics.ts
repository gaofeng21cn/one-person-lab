import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export function frameworkReadinessDiagnosticFailure(
  sourceId: string,
  sourceCommand: string,
  error: unknown,
) {
  if (error instanceof FrameworkContractError) {
    return {
      source_id: sourceId,
      source_command: sourceCommand,
      status: 'diagnostic_unavailable',
      error_code: error.code,
      message: error.message,
      exit_code: error.exitCode,
      details: error.details ?? {},
      blocking_policy: 'diagnostic_unavailable_is_drilldown_warning_not_framework_kernel_hard_blocker',
    };
  }
  return {
    source_id: sourceId,
    source_command: sourceCommand,
    status: 'diagnostic_unavailable',
    error_code: 'unexpected_framework_readiness_diagnostic_error',
    message: error instanceof Error ? error.message : String(error),
    exit_code: 1,
    details: {},
    blocking_policy: 'diagnostic_unavailable_is_drilldown_warning_not_framework_kernel_hard_blocker',
  };
}

export function frameworkReadinessAuthorityBoundary() {
  return {
    opl_role: 'framework_readiness_summary_and_refs_only_operator_read_model',
    domain_truth_owner: 'MAS/MAG/RCA domain repositories',
    provider_slo_owner: 'Temporal provider readiness/proof surfaces',
    app_operator_safe_action_policy: 'safe_action_routes_request_or_verify_refs_only_without_domain_action_execution',
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_claim_artifact_authority: false,
    can_authorize_quality_or_export: false,
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_domain_artifact: false,
    provider_completion_is_domain_ready: false,
    stage_launch_or_attempt_request_is_domain_ready: false,
    safe_action_route_is_receipt_closure: false,
  };
}
