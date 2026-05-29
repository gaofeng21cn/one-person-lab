import {
  buildAppDrilldownRefsOnlyAuthorityBoundary as refsOnlyAuthorityBoundary,
} from './authority-boundary.ts';
import { record } from './value-utils.ts';

type ActionRef = Record<string, any>;
type PeriodicRefs = { refs: ActionRef[] };
type LifecycleRefs = {
  refs: ActionRef[];
  summary: Record<string, any>;
};

function projectSafeActionRoute(ref: ActionRef) {
  const canSubmitToSafeActionShell =
    ref.can_submit_to_safe_action_shell === false
      || ref.default_actionable === false
      || (
        typeof ref.route_status === 'string'
        && ref.route_status.startsWith('blocked_by_')
      )
      ? false
      : true;
  return {
    action_id: ref.action_id,
    action_kind: ref.action_kind,
    owner: ref.owner,
    route_target_kind: ref.route_target_kind,
    ...('route_status' in ref ? { route_status: ref.route_status } : {}),
    ...('route_status_detail' in ref ? { route_status_detail: ref.route_status_detail } : {}),
    ...('request_scope' in ref ? { request_scope: ref.request_scope } : {}),
    action_ref: ref.ref,
    opl_cli_args: 'opl_cli_args' in ref ? ref.opl_cli_args : null,
    stage_attempt_id: ref.stage_attempt_id,
    domain_id: ref.domain_id,
    target_domain_id: 'target_domain_id' in ref ? ref.target_domain_id : null,
    project_id: 'project_id' in ref ? ref.project_id : null,
    stage_id: ref.stage_id,
    missing_production_evidence:
      'missing_production_evidence' in ref ? ref.missing_production_evidence : [],
    expected_receipt_refs: 'expected_receipt_refs' in ref ? ref.expected_receipt_refs : [],
    unobserved_expected_receipt_refs:
      'unobserved_expected_receipt_refs' in ref ? ref.unobserved_expected_receipt_refs : [],
    monitor_refs: 'monitor_refs' in ref ? ref.monitor_refs : [],
    unobserved_monitor_refs: 'unobserved_monitor_refs' in ref ? ref.unobserved_monitor_refs : [],
    ...('creates_domain_action' in ref ? { creates_domain_action: ref.creates_domain_action } : {}),
    ...('creates_owner_receipt' in ref ? { creates_owner_receipt: ref.creates_owner_receipt } : {}),
    ...('closes_expected_receipt_refs' in ref
      ? { closes_expected_receipt_refs: ref.closes_expected_receipt_refs }
      : {}),
    ...('closes_monitor_freshness' in ref ? { closes_monitor_freshness: ref.closes_monitor_freshness } : {}),
    execution_surface: ref.execution_surface,
    route_status: 'route_status' in ref ? ref.route_status : null,
    route_status_detail: 'route_status_detail' in ref ? ref.route_status_detail : null,
    request_scope: 'request_scope' in ref ? ref.request_scope : null,
    route_closure_policy: 'route_closure_policy' in ref ? ref.route_closure_policy : null,
    open_reason: 'open_reason' in ref ? ref.open_reason : null,
    provider_repair_action_id: 'provider_repair_action_id' in ref ? ref.provider_repair_action_id : null,
    provider_repair_command: 'provider_repair_command' in ref ? ref.provider_repair_command : null,
    provider_required_next_action:
      'provider_required_next_action' in ref ? ref.provider_required_next_action : null,
    provider_slo_dispatch_status:
      'provider_slo_dispatch_status' in ref ? ref.provider_slo_dispatch_status : null,
    provider_worker_lifecycle_status:
      'provider_worker_lifecycle_status' in ref ? ref.provider_worker_lifecycle_status : null,
    provider_worker_repair_action_id:
      'provider_worker_repair_action_id' in ref ? ref.provider_worker_repair_action_id : null,
    provider_worker_repair_command:
      'provider_worker_repair_command' in ref ? ref.provider_worker_repair_command : null,
    provider_worker_required_next_action:
      'provider_worker_required_next_action' in ref ? ref.provider_worker_required_next_action : null,
    payload_requirement: 'payload_requirement' in ref ? ref.payload_requirement : null,
    payload_owner: 'payload_owner' in ref ? ref.payload_owner : null,
    payload_template: 'payload_template' in ref ? ref.payload_template : null,
    payload_ref_hints: 'payload_ref_hints' in ref ? ref.payload_ref_hints : null,
    payload_workorder: 'payload_workorder' in ref ? ref.payload_workorder : null,
    accepted_payload_paths: 'accepted_payload_paths' in ref
      ? ref.accepted_payload_paths
      : 'payload_workorder' in ref
        ? record(ref.payload_workorder).accepted_payload_paths ?? {}
        : {},
    payload_template_policy: 'payload_template_policy' in ref ? ref.payload_template_policy : null,
    payload_preflight_policy: 'payload_preflight_policy' in ref ? ref.payload_preflight_policy : null,
    payload_preflight_error_code:
      'payload_preflight_error_code' in ref ? ref.payload_preflight_error_code : null,
    payload_preflight_blocked_error_kind:
      'payload_preflight_blocked_error_kind' in ref ? ref.payload_preflight_blocked_error_kind : null,
    empty_payload_template_is_success_evidence:
      'empty_payload_template_is_success_evidence' in ref
        ? ref.empty_payload_template_is_success_evidence
        : false,
    copyable_runtime_action_execute_commands:
      'copyable_runtime_action_execute_commands' in ref ? ref.copyable_runtime_action_execute_commands : {},
    route_requires_domain_or_app_payload:
      'route_requires_domain_or_app_payload' in ref ? ref.route_requires_domain_or_app_payload : false,
    can_close_without_domain_or_app_payload:
      'can_close_without_domain_or_app_payload' in ref ? ref.can_close_without_domain_or_app_payload : true,
    opl_generated_receipt_policy:
      'opl_generated_receipt_policy' in ref ? ref.opl_generated_receipt_policy : null,
    creates_domain_action: 'creates_domain_action' in ref ? ref.creates_domain_action : false,
    creates_owner_receipt: 'creates_owner_receipt' in ref ? ref.creates_owner_receipt : false,
    owner_receipt_refs: 'owner_receipt_refs' in ref ? ref.owner_receipt_refs : [],
    request_id: 'request_id' in ref ? ref.request_id : null,
    request_pack_id: 'request_pack_id' in ref ? ref.request_pack_id : null,
    evidence_route_kind: 'evidence_route_kind' in ref ? ref.evidence_route_kind : null,
    evidence_source_ref: 'evidence_source_ref' in ref ? ref.evidence_source_ref : null,
    dispatch_identity_key: 'dispatch_identity_key' in ref ? ref.dispatch_identity_key : null,
    dispatch_identity_fields: 'dispatch_identity_fields' in ref ? ref.dispatch_identity_fields : {},
    target_identity: 'target_identity' in ref ? ref.target_identity : {},
    stage_attempt_source_fingerprint:
      'stage_attempt_source_fingerprint' in ref ? ref.stage_attempt_source_fingerprint : null,
    default_actionability_status:
      'default_actionability_status' in ref ? ref.default_actionability_status : null,
    default_actionable: 'default_actionable' in ref ? ref.default_actionable : null,
    superseded_by_stage_attempt_id:
      'superseded_by_stage_attempt_id' in ref ? ref.superseded_by_stage_attempt_id : null,
    superseded_reason: 'superseded_reason' in ref ? ref.superseded_reason : null,
    identity_binding_policy: 'identity_binding_policy' in ref ? ref.identity_binding_policy : null,
    identity_binding_guidance: 'identity_binding_guidance' in ref ? ref.identity_binding_guidance : null,
    required_evidence_refs: 'required_evidence_refs' in ref ? ref.required_evidence_refs : [],
    required_operator_payload_refs:
      'required_operator_payload_refs' in ref ? ref.required_operator_payload_refs : [],
    supplemental_operator_payload_refs:
      'supplemental_operator_payload_refs' in ref ? ref.supplemental_operator_payload_refs : [],
    optional_operator_payload_refs:
      'optional_operator_payload_refs' in ref ? ref.optional_operator_payload_refs : [],
    required_return_shapes: 'required_return_shapes' in ref ? ref.required_return_shapes : [],
    required_receipt_shapes: 'required_receipt_shapes' in ref ? ref.required_receipt_shapes : [],
    typed_blocker_refs: 'typed_blocker_refs' in ref ? ref.typed_blocker_refs : [],
    closes_expected_receipt_refs:
      'closes_expected_receipt_refs' in ref ? ref.closes_expected_receipt_refs : false,
    closes_monitor_freshness: 'closes_monitor_freshness' in ref ? ref.closes_monitor_freshness : false,
    opl_cleanup_ledger_ready: 'opl_cleanup_ledger_ready' in ref ? ref.opl_cleanup_ledger_ready : null,
    domain_physical_delete_requires_owner_receipt:
      'domain_physical_delete_requires_owner_receipt' in ref
        ? ref.domain_physical_delete_requires_owner_receipt
        : null,
    domain_physical_delete_can_execute:
      'domain_physical_delete_can_execute' in ref ? ref.domain_physical_delete_can_execute : null,
    submit_via: 'opl runtime action execute',
    dry_run_supported: true,
    approve_domain_action_supported: ref.owner === 'domain',
    can_submit_to_safe_action_shell: canSubmitToSafeActionShell,
    can_execute_domain_action_directly: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
  };
}

export function buildAppExecutionBridge(
  actionRefs: ActionRef[],
  periodicRefs: PeriodicRefs,
  lifecycleRefs: LifecycleRefs,
) {
  const safeActionRoutes = actionRefs.filter((ref) => ref.execution_policy === 'opl_safe_action_shell');
  const supervisedPeriodicCommands = periodicRefs.refs.filter((ref) => (
    ref.execution_policy === 'operator_or_infrastructure_supervised'
    || ref.execution_policy === 'provider_backed_no_domain_daemon'
  ));
  return {
    surface_kind: 'opl_app_operator_execution_bridge',
    bridge_owner: 'one-person-lab',
    consumer: 'one_person_lab_app_operator_workbench',
    action_execution_surface: 'opl runtime action execute',
    lifecycle_apply_surface: 'opl runtime lifecycle apply',
    lifecycle_reconcile_surface: 'opl runtime lifecycle reconcile',
    provider_scheduler_surface: 'opl family-runtime scheduler',
    route_submission_policy: {
      direct_domain_action_execution_allowed: false,
      domain_routes_are_queued_for_approval: true,
      provider_signal_routes_emit_provider_receipts: true,
      opl_cli_routes_can_execute_framework_queries: true,
      opl_cli_routes_can_create_stage_attempt_requests: true,
      stage_attempt_requests_create_owner_receipts: false,
      stage_attempt_requests_close_expected_receipts: false,
      stage_attempt_requests_close_monitor_freshness: false,
      app_surface_routes_are_projection_only: true,
    },
    safe_action_routes: safeActionRoutes.map(projectSafeActionRoute),
    supervised_command_refs: supervisedPeriodicCommands.map((ref) => ({
      ref: ref.ref,
      role: ref.role,
      provider_kind: ref.provider_kind,
      schedule_id: ref.schedule_id,
      execution_policy: ref.execution_policy,
      expected_surface_kind: 'expected_surface_kind' in ref ? ref.expected_surface_kind : null,
      supervision_required: true,
    })),
    lifecycle_bridge: {
      index_ref_count: lifecycleRefs.summary.lifecycle_index_ref_count,
      restore_proof_ref_count: lifecycleRefs.summary.restore_proof_ref_count,
      domain_artifact_mutation_receipt_ref_count:
        lifecycleRefs.summary.domain_artifact_mutation_receipt_ref_count,
      cleanup_apply_ready: lifecycleRefs.summary.lifecycle_opl_cleanup_apply_can_execute,
      opl_cleanup_ledger_ready: lifecycleRefs.summary.lifecycle_opl_cleanup_apply_can_execute,
      domain_physical_delete_requires_owner_receipt:
        lifecycleRefs.summary.lifecycle_domain_physical_delete_requires_owner_receipt,
      domain_physical_delete_can_execute:
        lifecycleRefs.summary.lifecycle_domain_physical_delete_can_execute,
      domain_delete_executed_by_opl: false,
      reconcile_status: lifecycleRefs.summary.lifecycle_reconcile_status,
    },
    summary: {
      safe_action_route_count: safeActionRoutes.length,
      supervised_periodic_command_count: supervisedPeriodicCommands.length,
      lifecycle_index_ref_count: lifecycleRefs.summary.lifecycle_index_ref_count,
      cleanup_apply_ready: lifecycleRefs.summary.lifecycle_opl_cleanup_apply_can_execute,
      opl_cleanup_ledger_ready: lifecycleRefs.summary.lifecycle_opl_cleanup_apply_can_execute,
      domain_physical_delete_requires_owner_receipt:
        lifecycleRefs.summary.lifecycle_domain_physical_delete_requires_owner_receipt,
      domain_physical_delete_can_execute:
        lifecycleRefs.summary.lifecycle_domain_physical_delete_can_execute,
    },
    authority_boundary: refsOnlyAuthorityBoundary(),
  };
}
