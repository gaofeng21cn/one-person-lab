import { isRecord } from '../../../kernel/contract-validation.ts';
import {
  record,
  stringList,
  stringValue,
  uniqueStringList,
  type JsonRecord,
} from '../../../kernel/json-record.ts';

function stageEvidenceWorkorderItem(route: JsonRecord) {
  const workorder = record(route.payload_workorder);
  const actionId = stringValue(route.action_id);
  const typedBlockerPath = record(workorder.typed_blocker_path);
  return {
    item_id: `stage-evidence-workorder:${actionId ?? 'unknown'}`,
    action_id: actionId,
    action_kind: stringValue(route.action_kind),
    domain_id: stringValue(route.domain_id),
    target_domain_id: stringValue(route.target_domain_id),
    project_id: stringValue(route.project_id),
    stage_id: stringValue(route.stage_id),
    request_id: stringValue(route.request_id),
    request_pack_id: stringValue(route.request_pack_id),
    payload_owner: stringValue(route.payload_owner) ?? stringValue(workorder.payload_owner),
    route_requires_domain_or_app_payload: route.route_requires_domain_or_app_payload === true,
    can_close_without_domain_or_app_payload: route.can_close_without_domain_or_app_payload !== false,
    action_ref: stringValue(route.ref) ?? stringValue(route.action_ref),
    payload_template: record(route.payload_template),
    required_evidence_refs: stringList(route.required_evidence_refs),
    expected_receipt_refs: stringList(route.expected_receipt_refs),
    unobserved_expected_receipt_refs: stringList(route.unobserved_expected_receipt_refs),
    monitor_refs: stringList(route.monitor_refs),
    unobserved_monitor_refs: stringList(route.unobserved_monitor_refs),
    unobserved_source_scope_refs: stringList(route.unobserved_source_scope_refs),
    unobserved_runtime_event_refs: stringList(route.unobserved_runtime_event_refs),
    payload_workorder: workorder,
    accepted_payload_fields: stringList(workorder.accepted_payload_fields),
    success_path_requires: record(workorder.success_path_requires),
    typed_blocker_path: typedBlockerPath,
    typed_blocker_path_available: typedBlockerPath.accepted === true,
    rejected_payload_policy: stringList(workorder.rejected_payload_policy),
    authority_boundary: {
      route: isRecord(route.authority_boundary) ? route.authority_boundary : {},
      workorder: isRecord(workorder.authority_boundary) ? workorder.authority_boundary : {},
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_generate_domain_owner_receipt: false,
      can_generate_monitor_freshness: false,
    },
  };
}

export function buildStageEvidenceWorkorderPacket(operatorRoutes: JsonRecord[]) {
  const items = operatorRoutes
    .filter((route) =>
      stringValue(route.action_kind) === 'stage_production_evidence_receipt_record'
      && route.route_requires_domain_or_app_payload === true
      && record(route.payload_workorder).surface_kind === 'opl_stage_production_evidence_payload_workorder'
    )
    .map(stageEvidenceWorkorderItem);
  const domainIds = uniqueStringList(items.map((item) => item.domain_id));
  const stageIds = uniqueStringList(items.map((item) =>
    item.domain_id && item.stage_id ? `${item.domain_id}:${item.stage_id}` : null
  ));
  return {
    surface_kind: 'opl_stage_evidence_workorder_packet',
    packet_policy:
      'refs_only_operator_workorders_for_stage_expected_receipt_source_scope_runtime_event_and_monitor_freshness_closure',
    source_ref: '/runtime_tray_snapshot/app_operator_drilldown/operator_action_routing_refs',
    action_execution_surface: 'opl runtime action execute',
    summary: {
      workorder_count: items.length,
      domain_count: domainIds.length,
      stage_count: stageIds.length,
      domain_ids: domainIds,
      route_requires_domain_or_app_payload_count:
        items.filter((item) => item.route_requires_domain_or_app_payload).length,
      typed_blocker_path_available_count:
        items.filter((item) => item.typed_blocker_path_available).length,
      payload_template_count:
        items.filter((item) => Object.keys(item.payload_template).length > 0).length,
      source_scope_missing_workorder_count:
        items.filter((item) => item.unobserved_source_scope_refs.length > 0).length,
      runtime_event_missing_workorder_count:
        items.filter((item) => item.unobserved_runtime_event_refs.length > 0).length,
      source_scope_missing_ref_count:
        items.reduce((total, item) => total + item.unobserved_source_scope_refs.length, 0),
      runtime_event_missing_ref_count:
        items.reduce((total, item) => total + item.unobserved_runtime_event_refs.length, 0),
      success_payload_owner: 'domain_repository_or_app_live_operator',
    },
    workorders: items,
    authority_boundary: {
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_or_export: false,
      can_generate_domain_owner_receipt: false,
      can_generate_monitor_freshness: false,
      closes_stage_complete: false,
      closes_production_ready: false,
    },
  };
}

export function compactStageEvidenceWorkorderAttentionItems(
  packet: ReturnType<typeof buildStageEvidenceWorkorderPacket>,
  limit = 10,
) {
  return packet.workorders.slice(0, limit).map((item) => ({
    item_id: item.item_id,
    action_id: item.action_id,
    action_kind: item.action_kind,
    domain_id: item.domain_id,
    target_domain_id: item.target_domain_id,
    project_id: item.project_id,
    stage_id: item.stage_id,
    request_id: item.request_id,
    request_pack_id: item.request_pack_id,
    payload_owner: item.payload_owner,
    route_requires_domain_or_app_payload: item.route_requires_domain_or_app_payload,
    can_close_without_domain_or_app_payload: item.can_close_without_domain_or_app_payload,
    action_ref: item.action_ref,
    next_safe_action_ref: item.action_ref,
    required_evidence_ref_count: item.required_evidence_refs.length,
    unobserved_expected_receipt_ref_count: item.unobserved_expected_receipt_refs.length,
    unobserved_monitor_ref_count: item.unobserved_monitor_refs.length,
    unobserved_source_scope_ref_count: item.unobserved_source_scope_refs.length,
    unobserved_runtime_event_ref_count: item.unobserved_runtime_event_refs.length,
    required_evidence_refs: item.required_evidence_refs,
    unobserved_source_scope_refs: item.unobserved_source_scope_refs,
    unobserved_runtime_event_refs: item.unobserved_runtime_event_refs,
    typed_blocker_path_available: item.typed_blocker_path_available,
    worklist_item_is_completion_claim: false,
  }));
}
