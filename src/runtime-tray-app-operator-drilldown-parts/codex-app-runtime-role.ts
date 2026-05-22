import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';

export function buildCodexAppRuntimeRole() {
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
      ...buildAppDrilldownRefsOnlyAuthorityBoundary(),
      can_claim_production_ready: false,
      can_claim_domain_ready: false,
      can_close_long_soak: false,
      can_create_owner_receipt: false,
      can_drive_long_running_task_loop: false,
    },
  };
}
