type SourceCommands = Record<string, string>;

export function frameworkKernelFloor() {
  return {
    surface_kind: 'opl_framework_readiness_kernel_floor',
    policy: 'minimum_control_plane_boundary_and_recoverability_floor_only',
    hard_blocker_sources: [
      'agent_structural_conformance',
      'stage_launch_kernel_hard_blockers',
      'forbidden_authority_boundary',
      'provider_substrate_unavailable',
      'receipt_replay_audit_baseline_missing',
    ],
    advisory_sources: [
      'semantic_hygiene_attention',
      'agent_structural_evidence_tail',
      'app_live_evidence_tail',
      'stage_receipt_freshness_tail',
      'evidence_envelope_attention',
      'domain_dispatch_attention',
      'developer_mode_live_closeout_evidence',
      'runtime_manager_route_support',
      'provider_slo_status',
    ],
    ai_executor_internal_strategy_is_contract: false,
    domain_quality_strategy_contract: false,
    diagnostic_lenses_can_claim_ready_verdicts: false,
  };
}

export function frameworkDiagnosticDrilldowns(sourceCommands: SourceCommands) {
  return [
    {
      lens_id: 'semantic_hygiene',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: sourceCommands.semantic_hygiene,
      embedded_payload_ref: '/framework_readiness/semantic_hygiene',
    },
    {
      lens_id: 'agent_conformance_tail',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: sourceCommands.agents_readiness,
      embedded_payload_ref: '/framework_readiness/agent_conformance_tail',
    },
    {
      lens_id: 'stage_readiness',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: sourceCommands.stages_readiness_family,
      embedded_payload_ref: '/framework_readiness/stages',
    },
    {
      lens_id: 'app_operator_production_tail',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: sourceCommands.app_operator_drilldown,
      embedded_payload_ref: '/framework_readiness/app_operator_production_tail',
    },
    {
      lens_id: 'evidence_worklist',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: sourceCommands.family_runtime_evidence_worklist,
      embedded_payload_ref: '/framework_readiness/evidence_worklist',
    },
    {
      lens_id: 'evidence_envelope',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: sourceCommands.family_runtime_evidence_worklist,
      embedded_payload_ref: '/framework_readiness/evidence_envelope',
    },
    {
      lens_id: 'domain_dispatch_attention',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: sourceCommands.app_operator_drilldown,
      embedded_payload_ref: '/framework_readiness/domain_dispatch_attention',
    },
    {
      lens_id: 'developer_mode_live_closeout_evidence',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: sourceCommands.app_operator_drilldown,
      embedded_payload_ref: '/framework_readiness/developer_mode_live_closeout_evidence',
    },
    {
      lens_id: 'runtime_manager_route_support',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: sourceCommands.app_operator_drilldown,
      embedded_payload_ref: '/framework_readiness/runtime_manager_route_support',
    },
    {
      lens_id: 'provider_slo_status',
      role: 'diagnostic_drilldown',
      default_surface: false,
      source_command: sourceCommands.app_operator_drilldown,
      embedded_payload_ref: '/framework_readiness/provider_slo_status',
    },
  ];
}
