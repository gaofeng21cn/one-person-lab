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

function uniqueStringList(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function domainDispatchEvidenceWorkorderItem(route: JsonRecord) {
  const actionId = stringValue(route.action_id);
  const requiredOperatorPayloadRefs = stringList(route.required_operator_payload_refs);
  return {
    item_id: `domain-dispatch-evidence-workorder:${actionId ?? 'unknown'}`,
    action_id: actionId,
    action_kind: stringValue(route.action_kind),
    domain_id: stringValue(route.domain_id),
    stage_id: stringValue(route.stage_id),
    stage_attempt_id: stringValue(route.stage_attempt_id),
    request_id: stringValue(route.request_id),
    request_pack_id: stringValue(route.request_pack_id),
    payload_owner: stringValue(route.payload_owner),
    route_status: stringValue(route.route_status),
    route_status_detail: stringValue(route.route_status_detail),
    route_closure_policy: stringValue(route.route_closure_policy),
    open_reason: stringValue(route.open_reason),
    payload_requirement: stringValue(route.payload_requirement),
    route_requires_domain_or_app_payload: route.route_requires_domain_or_app_payload === true,
    can_close_without_domain_or_app_payload: route.can_close_without_domain_or_app_payload !== false,
    can_execute: route.can_execute === true,
    creates_domain_action: route.creates_domain_action === true,
    creates_owner_receipt: route.creates_owner_receipt === true,
    action_ref: stringValue(route.ref) ?? stringValue(route.action_ref),
    evidence_source_ref: stringValue(route.evidence_source_ref),
    payload_template: record(route.payload_template),
    payload_ref_hints: record(route.payload_ref_hints),
    payload_template_policy: stringValue(route.payload_template_policy),
    empty_payload_template_is_success_evidence: route.empty_payload_template_is_success_evidence === true,
    copyable_runtime_action_execute_commands: record(route.copyable_runtime_action_execute_commands),
    required_operator_payload_refs: requiredOperatorPayloadRefs,
    optional_operator_payload_refs: stringList(route.optional_operator_payload_refs),
    required_evidence_refs: stringList(route.required_evidence_refs),
    required_return_shapes: stringList(route.required_return_shapes),
    typed_blocker_payload_path_available: requiredOperatorPayloadRefs.includes('typed_blocker_refs'),
    owner_receipt_payload_path_available: requiredOperatorPayloadRefs.includes('domain_receipt_refs'),
    owner_chain_payload_path_available: requiredOperatorPayloadRefs.includes('owner_chain_refs'),
    no_regression_payload_path_available: requiredOperatorPayloadRefs.includes('no_regression_refs'),
    evidence_payload_path_available: requiredOperatorPayloadRefs.includes('evidence_refs'),
    authority_boundary: {
      route: record(route.authority_boundary),
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_or_export: false,
      can_generate_domain_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_generate_owner_chain_ref: false,
      can_generate_no_regression_ref: false,
      can_execute_domain_action: false,
    },
  };
}

export function buildDomainDispatchEvidenceWorkorderPacket(operatorRoutes: JsonRecord[]) {
  const items = operatorRoutes
    .filter((route) =>
      stringValue(route.action_kind) === 'domain_dispatch_evidence_receipt_record'
      && route.route_requires_domain_or_app_payload === true
    )
    .map(domainDispatchEvidenceWorkorderItem);
  const domainIds = uniqueStringList(items.map((item) => item.domain_id));
  const stageAttemptIds = uniqueStringList(items.map((item) =>
    item.domain_id && item.stage_attempt_id ? `${item.domain_id}:${item.stage_attempt_id}` : null
  ));
  const stageIds = uniqueStringList(items.map((item) =>
    item.domain_id && item.stage_id ? `${item.domain_id}:${item.stage_id}` : null
  ));
  return {
    surface_kind: 'opl_domain_dispatch_evidence_workorder_packet',
    packet_policy:
      'refs_only_operator_workorders_for_domain_dispatch_owner_receipt_typed_blocker_owner_chain_and_no_regression_refs',
    source_ref: '/runtime_tray_snapshot/app_operator_drilldown/operator_action_routing_refs',
    action_execution_surface: 'opl runtime action execute',
    summary: {
      workorder_count: items.length,
      domain_count: domainIds.length,
      stage_count: stageIds.length,
      stage_attempt_count: stageAttemptIds.length,
      domain_ids: domainIds,
      route_requires_domain_or_app_payload_count:
        items.filter((item) => item.route_requires_domain_or_app_payload).length,
      payload_template_count:
        items.filter((item) => Object.keys(item.payload_template).length > 0).length,
      required_operator_payload_ref_count:
        items.reduce((total, item) => total + item.required_operator_payload_refs.length, 0),
      required_evidence_ref_count:
        items.reduce((total, item) => total + item.required_evidence_refs.length, 0),
      typed_blocker_payload_path_available_count:
        items.filter((item) => item.typed_blocker_payload_path_available).length,
      owner_receipt_payload_path_available_count:
        items.filter((item) => item.owner_receipt_payload_path_available).length,
      owner_chain_payload_path_available_count:
        items.filter((item) => item.owner_chain_payload_path_available).length,
      no_regression_payload_path_available_count:
        items.filter((item) => item.no_regression_payload_path_available).length,
      success_payload_owner: 'domain_repository_or_app_live_operator',
    },
    workorders: items,
    authority_boundary: {
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_or_export: false,
      can_generate_domain_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_generate_owner_chain_ref: false,
      can_generate_no_regression_ref: false,
      can_execute_domain_action: false,
      closes_domain_ready: false,
      closes_production_ready: false,
    },
  };
}

export function compactDomainDispatchEvidenceWorkorderAttentionItems(
  packet: ReturnType<typeof buildDomainDispatchEvidenceWorkorderPacket>,
  limit = 10,
) {
  return packet.workorders.slice(0, limit).map((item) => ({
    item_id: item.item_id,
    action_id: item.action_id,
    action_kind: item.action_kind,
    domain_id: item.domain_id,
    stage_id: item.stage_id,
    stage_attempt_id: item.stage_attempt_id,
    request_id: item.request_id,
    request_pack_id: item.request_pack_id,
    payload_owner: item.payload_owner,
    route_requires_domain_or_app_payload: item.route_requires_domain_or_app_payload,
    can_close_without_domain_or_app_payload: item.can_close_without_domain_or_app_payload,
    can_execute: item.can_execute,
    creates_domain_action: item.creates_domain_action,
    creates_owner_receipt: item.creates_owner_receipt,
    action_ref: item.action_ref,
    next_safe_action_ref: item.action_ref,
    required_operator_payload_ref_count: item.required_operator_payload_refs.length,
    required_operator_payload_refs: item.required_operator_payload_refs,
    required_evidence_ref_count: item.required_evidence_refs.length,
    required_evidence_refs: item.required_evidence_refs,
    typed_blocker_payload_path_available: item.typed_blocker_payload_path_available,
    owner_receipt_payload_path_available: item.owner_receipt_payload_path_available,
    owner_chain_payload_path_available: item.owner_chain_payload_path_available,
    no_regression_payload_path_available: item.no_regression_payload_path_available,
    open_reason: item.open_reason,
    payload_requirement: item.payload_requirement,
    worklist_item_is_completion_claim: false,
  }));
}
