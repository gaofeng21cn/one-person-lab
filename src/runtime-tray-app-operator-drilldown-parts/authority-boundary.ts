export function refsOnlyAuthorityBoundary() {
  return {
    opl: 'app_operator_drilldown_refs_only',
    domain: 'truth_memory_artifact_quality_export_owner',
    provider: 'runtime_slo_receipt_owner',
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

export function codexAppRuntimeRole() {
  return {
    surface_kind: 'opl_app_drilldown_codex_app_runtime_role',
    runtime_policy: 'opl_temporal_hosted_autonomous',
    projection_policy:
      'app_start_observe_intervene_display_only_provider_runs_long_tasks',
    codex_app_roles: [
      'start',
      'observe',
      'intervene',
      'display',
    ],
    codex_app_drives_long_running_tasks: false,
    long_running_task_driver_owner: 'one-person-lab',
    long_running_task_driver_substrate: 'temporal',
    default_stage_executor: 'codex_cli',
    domain_agent_internal_daemon_allowed: false,
    domain_agent_internal_scheduler_allowed: false,
    domain_agent_internal_attempt_loop_allowed: false,
    production_long_soak_claimed: false,
    production_evidence_gate_remains_open: true,
    authority_boundary: {
      ...refsOnlyAuthorityBoundary(),
      can_claim_production_ready: false,
      can_claim_domain_ready: false,
      can_close_long_soak: false,
      can_create_owner_receipt: false,
      can_drive_long_running_task_loop: false,
    },
  };
}
