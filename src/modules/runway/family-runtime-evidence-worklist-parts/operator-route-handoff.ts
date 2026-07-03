import {
  domainDispatchEvidenceIdentityGuidanceFromRoute,
} from '../../ledger/index.ts';

type JsonRecord = Record<string, unknown>;

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

const HANDOFF_FIELDS = [
  'payload_template',
  'payload_ref_hints',
  'payload_workorder',
  'payload_template_policy',
  'payload_preflight_policy',
  'payload_preflight_error_code',
  'payload_preflight_blocked_error_kind',
  'empty_payload_template_is_success_evidence',
  'required_operator_payload_refs',
  'supplemental_operator_payload_refs',
  'optional_operator_payload_refs',
  'required_evidence_refs',
  'expected_receipt_refs',
  'unobserved_expected_receipt_refs',
  'monitor_refs',
  'unobserved_monitor_refs',
  'unobserved_source_scope_refs',
  'unobserved_runtime_event_refs',
  'required_receipt_shapes',
  'required_return_shapes',
  'target_identity',
  'dispatch_identity_key',
  'dispatch_identity_fields',
  'identity_binding_policy',
  'identity_binding_guidance',
  'copyable_runtime_action_execute_commands',
];

export function operatorRoutesByActionId(operatorRoutes: JsonRecord[]) {
  const routesByActionId = new Map<string, JsonRecord>();
  for (const route of operatorRoutes) {
    const actionId = stringValue(route.action_id);
    if (actionId) {
      routesByActionId.set(actionId, route);
    }
  }
  return routesByActionId;
}

export function routeWithOperatorHandoff(
  route: JsonRecord,
  operatorRouteByActionId: Map<string, JsonRecord>,
) {
  const actionId = stringValue(route.action_id);
  const operatorRoute = actionId ? operatorRouteByActionId.get(actionId) : undefined;
  if (!operatorRoute) {
    return route;
  }
  const merged: JsonRecord = { ...route };
  for (const field of HANDOFF_FIELDS) {
    if (operatorRoute[field] !== undefined) {
      merged[field] = operatorRoute[field];
    }
  }
  return merged;
}

export function payloadHandoffProjection(route: JsonRecord, actionKind: string) {
  const identityBindingGuidance = Object.keys(record(route.identity_binding_guidance)).length > 0
    ? record(route.identity_binding_guidance)
    : actionKind.startsWith('domain_dispatch_evidence_')
      ? domainDispatchEvidenceIdentityGuidanceFromRoute(route)
      : {};
  return {
    request_id: stringValue(route.request_id),
    request_pack_id: stringValue(route.request_pack_id),
    stage_attempt_id: stringValue(route.stage_attempt_id),
    payload_template: record(route.payload_template),
    payload_ref_hints: record(route.payload_ref_hints),
    payload_workorder: record(route.payload_workorder),
    accepted_payload_paths: record(record(route.payload_workorder).accepted_payload_paths),
    required_operator_payload_refs: stringList(route.required_operator_payload_refs),
    supplemental_operator_payload_refs: stringList(route.supplemental_operator_payload_refs),
    optional_operator_payload_refs: stringList(route.optional_operator_payload_refs),
    expected_receipt_refs: stringList(route.expected_receipt_refs),
    unobserved_expected_receipt_refs: stringList(route.unobserved_expected_receipt_refs),
    monitor_refs: stringList(route.monitor_refs),
    unobserved_monitor_refs: stringList(route.unobserved_monitor_refs),
    unobserved_source_scope_refs: stringList(route.unobserved_source_scope_refs),
    unobserved_runtime_event_refs: stringList(route.unobserved_runtime_event_refs),
    required_receipt_shapes: stringList(route.required_receipt_shapes),
    payload_template_policy: stringValue(route.payload_template_policy),
    payload_preflight_policy: stringValue(route.payload_preflight_policy),
    payload_preflight_error_code: stringValue(route.payload_preflight_error_code),
    payload_preflight_blocked_error_kind: stringValue(route.payload_preflight_blocked_error_kind),
    empty_payload_template_is_success_evidence: route.empty_payload_template_is_success_evidence === true,
    target_identity: record(route.target_identity),
    dispatch_identity_key: stringValue(route.dispatch_identity_key),
    dispatch_identity_fields: record(route.dispatch_identity_fields),
    identity_binding_policy: stringValue(route.identity_binding_policy),
    identity_binding_guidance: identityBindingGuidance,
    copyable_runtime_action_execute_commands: record(route.copyable_runtime_action_execute_commands),
  };
}
