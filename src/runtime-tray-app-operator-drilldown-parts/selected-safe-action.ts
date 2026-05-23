import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

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
    can_close_without_domain_or_app_payload: action.can_close_without_domain_or_app_payload !== false,
  };
}
