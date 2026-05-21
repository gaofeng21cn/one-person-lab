import { canonicalOwnerId } from './evidence-envelope.ts';

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

function numberSum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function domainDispatchEvidenceWorkorderItem(route: JsonRecord) {
  const actionId = stringValue(route.action_id);
  const routeDomainId = stringValue(route.domain_id);
  const requiredOperatorPayloadRefs = stringList(route.required_operator_payload_refs);
  return {
    item_id: `domain-dispatch-evidence-workorder:${actionId ?? 'unknown'}`,
    action_id: actionId,
    action_kind: stringValue(route.action_kind),
    domain_id: routeDomainId,
    route_domain_id: routeDomainId,
    canonical_domain_id: routeDomainId ? canonicalOwnerId(routeDomainId) : null,
    domain_id_policy:
      'domain_id_is_route_domain_id_for_action_execution_canonical_domain_id_is_owner_facing_semantics',
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

function domainStageGroupKey(item: ReturnType<typeof domainDispatchEvidenceWorkorderItem>) {
  return [
    item.canonical_domain_id ?? 'unknown-domain',
    item.stage_id ?? 'unknown-stage',
  ].join(':');
}

function domainStageWorkorderGroups(
  items: Array<ReturnType<typeof domainDispatchEvidenceWorkorderItem>>,
  limit = 10,
) {
  const groups = new Map<string, Array<ReturnType<typeof domainDispatchEvidenceWorkorderItem>>>();
  for (const item of items) {
    const key = domainStageGroupKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const allGroups = [...groups.entries()]
    .map(([key, groupItems]) => {
      const canonicalDomainId =
        groupItems.find((item) => item.canonical_domain_id)?.canonical_domain_id ?? null;
      const stageId = groupItems.find((item) => item.stage_id)?.stage_id ?? null;
      const stageAttemptIds = uniqueStringList(groupItems.map((item) => item.stage_attempt_id));
      const routeDomainIds = uniqueStringList(groupItems.map((item) => item.route_domain_id));
      const requiredOperatorPayloadRefs = uniqueStringList(
        groupItems.flatMap((item) => item.required_operator_payload_refs),
      );
      const requiredEvidenceRefs = uniqueStringList(
        groupItems.flatMap((item) => item.required_evidence_refs),
      );
      return {
        group_id: `domain-dispatch-evidence-workorder-group:${key}`,
        canonical_domain_id: canonicalDomainId,
        stage_id: stageId,
        route_domain_ids: routeDomainIds,
        route_domain_id_policy:
          'command_domain_ids_for_opl_runtime_action_execute_routes_not_default_owner_semantics',
        workorder_count: groupItems.length,
        stage_attempt_count: stageAttemptIds.length,
        stage_attempt_ids: stageAttemptIds,
        action_refs: uniqueStringList(groupItems.map((item) => item.action_ref)),
        required_operator_payload_ref_count: numberSum(
          groupItems.map((item) => item.required_operator_payload_refs.length),
        ),
        required_operator_payload_refs: requiredOperatorPayloadRefs,
        required_evidence_ref_count: numberSum(
          groupItems.map((item) => item.required_evidence_refs.length),
        ),
        required_evidence_refs: requiredEvidenceRefs,
        typed_blocker_payload_path_available_count:
          groupItems.filter((item) => item.typed_blocker_payload_path_available).length,
        owner_receipt_payload_path_available_count:
          groupItems.filter((item) => item.owner_receipt_payload_path_available).length,
        owner_chain_payload_path_available_count:
          groupItems.filter((item) => item.owner_chain_payload_path_available).length,
        no_regression_payload_path_available_count:
          groupItems.filter((item) => item.no_regression_payload_path_available).length,
        payload_owner: 'domain_repository_or_app_live_operator',
        route_requires_domain_or_app_payload: true,
        worklist_item_is_completion_claim: false,
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
    })
    .sort((left, right) =>
      right.workorder_count - left.workorder_count
      || String(left.canonical_domain_id).localeCompare(String(right.canonical_domain_id))
      || String(left.stage_id).localeCompare(String(right.stage_id))
    );
  return {
    surface_kind: 'opl_domain_dispatch_evidence_workorder_domain_stage_group_summary',
    grouping_policy:
      'bounded_canonical_owner_stage_groups_refs_only_no_domain_authority',
    grouping_keys: ['canonical_domain_id', 'stage_id'],
    total_group_count: allGroups.length,
    omitted_group_count: Math.max(allGroups.length - limit, 0),
    groups: allGroups.slice(0, limit),
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
  const canonicalOwnerDomainIds = uniqueStringList(domainIds.map((domainId) =>
    domainId ? canonicalOwnerId(domainId) : null
  ));
  const stageAttemptIds = uniqueStringList(items.map((item) =>
    item.domain_id && item.stage_attempt_id ? `${item.domain_id}:${item.stage_attempt_id}` : null
  ));
  const stageIds = uniqueStringList(items.map((item) =>
    item.domain_id && item.stage_id ? `${item.domain_id}:${item.stage_id}` : null
  ));
  const domainStageGroupSummary = domainStageWorkorderGroups(items);
  return {
    surface_kind: 'opl_domain_dispatch_evidence_workorder_packet',
    packet_policy:
      'refs_only_operator_workorders_for_domain_dispatch_owner_receipt_typed_blocker_owner_chain_and_no_regression_refs',
    source_ref: '/runtime_tray_snapshot/app_operator_drilldown/operator_action_routing_refs',
    action_execution_surface: 'opl runtime action execute',
    summary: {
      workorder_count: items.length,
      domain_count: canonicalOwnerDomainIds.length,
      stage_count: stageIds.length,
      stage_attempt_count: stageAttemptIds.length,
      domain_stage_group_count: domainStageGroupSummary.total_group_count,
      domain_stage_group_omitted_count: domainStageGroupSummary.omitted_group_count,
      domain_stage_grouping_policy: domainStageGroupSummary.grouping_policy,
      domain_ids: canonicalOwnerDomainIds,
      domain_id_policy:
        'canonical_owner_facing_ids_only_workorder_items_keep_command_domain_ids_for_action_routes',
      route_domain_ids: domainIds,
      route_domain_id_policy:
        'command_domain_ids_for_opl_runtime_action_execute_routes_not_default_owner_semantics',
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
    domain_stage_group_summary: domainStageGroupSummary,
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
    route_domain_id: item.route_domain_id,
    canonical_domain_id: item.canonical_domain_id,
    domain_id_policy: item.domain_id_policy,
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
