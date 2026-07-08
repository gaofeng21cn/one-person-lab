import {
  record,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) {
      return text;
    }
  }
  return null;
}

export function summarizeSelectedSafeAction(action: JsonRecord | null) {
  if (!action) {
    return null;
  }
  const actionId = stringValue(action.action_id);
  const routeRequiresPayload = action.route_requires_domain_or_app_payload === true;
  const canCloseWithoutDomainOrAppPayload =
    typeof action.can_close_without_domain_or_app_payload === 'boolean'
      ? action.can_close_without_domain_or_app_payload
      : !routeRequiresPayload;
  const submitArgs = actionId
    ? [
        'runtime',
        'action',
        'execute',
        '--action',
        actionId,
        ...(routeRequiresPayload ? ['--payload-file', '<payload.json>'] : []),
      ]
    : [];
  const copyableCommands = record(action.copyable_runtime_action_execute_commands);
  const payloadTemplate = record(action.payload_template);
  const payloadWorkorder = record(action.payload_workorder);
  const authorityBoundary = record(action.authority_boundary);
  const requiredOperatorPayloadRefs = stringList(action.required_operator_payload_refs);
  const requiredReturnShapes = stringList(action.required_return_shapes);
  return {
    action_id: actionId,
    action_kind: stringValue(action.action_kind),
    owner: firstString(action.owner, action.action_owner),
    route_target_kind: stringValue(action.route_target_kind),
    execution_surface: stringValue(action.execution_surface) ?? 'opl runtime action execute',
    submit_via: stringValue(action.submit_via) ?? 'opl runtime action execute',
    submit_args: submitArgs,
    dry_run_supported: action.dry_run_supported === true,
    approve_domain_action_supported: action.approve_domain_action_supported === true,
    can_submit_to_safe_action_shell: action.can_submit_to_safe_action_shell === true,
    can_execute_domain_action_directly: false,
    domain_id: stringValue(action.domain_id),
    stage_id: stringValue(action.stage_id),
    stage_attempt_id: stringValue(action.stage_attempt_id),
    target_domain_id: stringValue(action.target_domain_id),
    project_id: stringValue(action.project_id),
    missing_production_evidence: stringList(action.missing_production_evidence),
    expected_receipt_refs: stringList(action.expected_receipt_refs),
    route_status_detail: stringValue(action.route_status_detail),
    open_reason: stringValue(action.open_reason),
    provider_repair_action_id: stringValue(action.provider_repair_action_id),
    provider_repair_command: stringValue(action.provider_repair_command),
    provider_required_next_action: stringValue(action.provider_required_next_action),
    provider_slo_dispatch_status: stringValue(action.provider_slo_dispatch_status),
    provider_worker_lifecycle_status: stringValue(action.provider_worker_lifecycle_status),
    provider_worker_repair_action_id: stringValue(action.provider_worker_repair_action_id),
    provider_worker_repair_command: stringValue(action.provider_worker_repair_command),
    provider_worker_required_next_action: stringValue(action.provider_worker_required_next_action),
    progress_first_required_next_action: stringValue(action.progress_first_required_next_action),
    missing_progress_signals: stringList(action.missing_progress_signals),
    supervisor_safe_action_kind: stringValue(action.supervisor_safe_action_kind),
    typed_blocker_requirement: record(action.typed_blocker_requirement),
    attempt_status: stringValue(action.attempt_status),
    blocked_transport_dead_letter_reason: stringValue(action.blocked_transport_dead_letter_reason),
    task_id: stringValue(action.task_id),
    task_kind: stringValue(action.task_kind),
    payload_requirement: stringValue(action.payload_requirement),
    payload_owner: stringValue(action.payload_owner),
    payload_template: payloadTemplate,
    payload_ref_hints: record(action.payload_ref_hints),
    payload_template_policy: stringValue(action.payload_template_policy),
    payload_workorder: Object.keys(payloadWorkorder).length > 0
      ? payloadWorkorder
      : routeRequiresPayload
        ? {
            surface_kind: 'opl_selected_safe_action_payload_workorder',
            workorder_policy:
              'operator_must_replace_empty_template_with_real_app_or_domain_refs_or_typed_blocker_before_submit',
            payload_owner: stringValue(action.payload_owner),
            accepted_payload_path_policy: 'real_refs_or_typed_blocker_path_empty_template_blocks',
            required_operator_payload_refs: requiredOperatorPayloadRefs,
            required_return_shapes: requiredReturnShapes,
            payload_template: payloadTemplate,
            empty_payload_template_is_success_evidence: false,
            authority_boundary: {
              can_execute_domain_action: false,
              can_write_domain_truth: false,
              can_create_owner_receipt: false,
              can_close_domain_ready: false,
              can_claim_production_ready: false,
              refs_only: true,
            },
          }
        : {},
    payload_preflight_policy: stringValue(action.payload_preflight_policy),
    payload_preflight_error_code: stringValue(action.payload_preflight_error_code),
    payload_preflight_blocked_error_kind: stringValue(action.payload_preflight_blocked_error_kind),
    empty_payload_template_is_success_evidence:
      action.empty_payload_template_is_success_evidence === true,
    copyable_runtime_action_execute_commands:
      Object.keys(copyableCommands).length > 0
        ? copyableCommands
        : actionId && routeRequiresPayload
          ? { record_with_payload: submitArgs }
          : {},
    required_operator_payload_refs: requiredOperatorPayloadRefs,
    optional_operator_payload_refs: stringList(action.optional_operator_payload_refs),
    route_requires_domain_or_app_payload: routeRequiresPayload,
    can_close_without_domain_or_app_payload: canCloseWithoutDomainOrAppPayload,
    authority_split: record(action.authority_split),
    read_model_owner_split: record(action.read_model_owner_split),
    authority_boundary: authorityBoundary,
    can_authorize_quality_verdict: action.can_authorize_quality_verdict === true || authorityBoundary.can_authorize_quality_verdict === true,
    can_authorize_artifact_package: action.can_authorize_artifact_package === true || authorityBoundary.can_authorize_artifact_package === true,
    can_create_owner_receipt: action.can_create_owner_receipt === true || authorityBoundary.can_create_owner_receipt === true,
  };
}
