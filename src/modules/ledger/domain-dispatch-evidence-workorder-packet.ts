import { canonicalOwnerId } from './evidence-envelope.ts';
import {
  domainDispatchEvidenceIdentityGuidanceFromRoute,
} from './domain-dispatch-evidence-identity-guidance.ts';
import {
  record,
  stringList,
  stringValue,
  uniqueStringList,
  type JsonRecord,
} from '../../kernel/json-record.ts';

function numberSum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function firstNonEmptyRecord(values: JsonRecord[]) {
  return values.find((value) => Object.keys(value).length > 0) ?? {};
}

function domainDispatchEvidenceWorkorderItem(route: JsonRecord) {
  const actionId = stringValue(route.action_id);
  const routeDomainId = stringValue(route.domain_id);
  const requiredOperatorPayloadRefs = stringList(route.required_operator_payload_refs);
  const supplementalOperatorPayloadRefs = stringList(route.supplemental_operator_payload_refs);
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
    stage_attempt_source_fingerprint: stringValue(route.stage_attempt_source_fingerprint),
    target_identity: record(route.target_identity),
    dispatch_identity_key: stringValue(route.dispatch_identity_key),
    dispatch_supersession_identity_key: stringValue(route.dispatch_supersession_identity_key),
    dispatch_identity_fields: record(route.dispatch_identity_fields),
    identity_binding_policy: stringValue(route.identity_binding_policy),
    identity_binding_guidance:
      Object.keys(record(route.identity_binding_guidance)).length > 0
        ? record(route.identity_binding_guidance)
        : domainDispatchEvidenceIdentityGuidanceFromRoute(route),
    evidence_source_ref: stringValue(route.evidence_source_ref),
    payload_template: record(route.payload_template),
    payload_ref_hints: record(route.payload_ref_hints),
    payload_workorder: record(route.payload_workorder),
    payload_template_policy: stringValue(route.payload_template_policy),
    payload_preflight_policy: stringValue(route.payload_preflight_policy),
    payload_preflight_error_code: stringValue(route.payload_preflight_error_code),
    payload_preflight_blocked_error_kind: stringValue(route.payload_preflight_blocked_error_kind),
    empty_payload_template_is_success_evidence: route.empty_payload_template_is_success_evidence === true,
    copyable_runtime_action_execute_commands: record(route.copyable_runtime_action_execute_commands),
    required_operator_payload_refs: requiredOperatorPayloadRefs,
    supplemental_operator_payload_refs: supplementalOperatorPayloadRefs,
    optional_operator_payload_refs: stringList(route.optional_operator_payload_refs),
    required_evidence_refs: stringList(route.required_evidence_refs),
    expected_receipt_refs: stringList(route.expected_receipt_refs),
    unobserved_expected_receipt_refs: stringList(route.unobserved_expected_receipt_refs),
    monitor_refs: stringList(route.monitor_refs),
    unobserved_monitor_refs: stringList(route.unobserved_monitor_refs),
    unobserved_source_scope_refs: stringList(route.unobserved_source_scope_refs),
    unobserved_runtime_event_refs: stringList(route.unobserved_runtime_event_refs),
    required_receipt_shapes: stringList(route.required_receipt_shapes),
    required_return_shapes: stringList(route.required_return_shapes),
    typed_blocker_payload_path_available: requiredOperatorPayloadRefs.includes('typed_blocker_refs'),
    owner_receipt_payload_path_available: requiredOperatorPayloadRefs.includes('domain_receipt_refs'),
    owner_chain_payload_path_available: requiredOperatorPayloadRefs.includes('owner_chain_refs'),
    no_regression_payload_path_available: requiredOperatorPayloadRefs.includes('no_regression_refs'),
    evidence_payload_path_available: requiredOperatorPayloadRefs.includes('evidence_refs'),
    supplemental_evidence_payload_available: supplementalOperatorPayloadRefs.includes('evidence_refs'),
    payload_path_policy:
      stringValue(record(route.payload_workorder).workorder_policy)
        ?? 'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
    accepted_payload_paths:
      record(record(route.payload_workorder).accepted_payload_paths),
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
      const recordActionIds = uniqueStringList(groupItems.map((item) => item.action_id));
      const recordCommandRefs = uniqueStringList(groupItems.map((item) =>
        stringValue(record(item.copyable_runtime_action_execute_commands).record_success_path)
      ));
      const requiredOperatorPayloadRefs = uniqueStringList(
        groupItems.flatMap((item) => item.required_operator_payload_refs),
      );
      const supplementalOperatorPayloadRefs = uniqueStringList(
        groupItems.flatMap((item) => item.supplemental_operator_payload_refs),
      );
      const requiredEvidenceRefs = uniqueStringList(
        groupItems.flatMap((item) => item.required_evidence_refs),
      );
      const dispatchSupersessionIdentityKeys = uniqueStringList(
        groupItems.map((item) => item.dispatch_supersession_identity_key),
      );
      const requiredReturnShapes = uniqueStringList(
        groupItems.flatMap((item) => item.required_return_shapes),
      );
      const payloadPreflightPolicies = uniqueStringList(
        groupItems.map((item) => item.payload_preflight_policy),
      );
      const payloadPreflightErrorCodes = uniqueStringList(
        groupItems.map((item) => item.payload_preflight_error_code),
      );
      const payloadPreflightBlockedErrorKinds = uniqueStringList(
        groupItems.map((item) => item.payload_preflight_blocked_error_kind),
      );
      const sourceFingerprintBindings = uniqueStringList(groupItems.map((item) =>
        stringValue(record(item.identity_binding_guidance).payload_source_fingerprint_binding)
          ?? stringValue(record(record(item.identity_binding_guidance).payload_source_fingerprint_binding)
            .source_fingerprint_binds_to)
      ));
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
        dispatch_supersession_identity_keys: dispatchSupersessionIdentityKeys,
        action_refs: uniqueStringList(groupItems.map((item) => item.action_ref)),
        record_action_ids: recordActionIds,
        record_command_refs: recordCommandRefs,
        required_operator_payload_ref_count: numberSum(
          groupItems.map((item) => item.required_operator_payload_refs.length),
        ),
        required_operator_payload_refs: requiredOperatorPayloadRefs,
        supplemental_operator_payload_ref_count: numberSum(
          groupItems.map((item) => item.supplemental_operator_payload_refs.length),
        ),
        supplemental_operator_payload_refs: supplementalOperatorPayloadRefs,
        payload_template: firstNonEmptyRecord(groupItems.map((item) => item.payload_template)),
        payload_ref_hints: firstNonEmptyRecord(groupItems.map((item) => item.payload_ref_hints)),
        payload_template_policy:
          groupItems.find((item) => item.payload_template_policy)?.payload_template_policy ?? null,
        empty_payload_template_is_success_evidence:
          groupItems.some((item) => item.empty_payload_template_is_success_evidence),
        payload_path_policy:
          groupItems.find((item) => item.payload_path_policy)?.payload_path_policy ?? null,
        accepted_payload_paths:
          record(groupItems.find((item) => Object.keys(item.accepted_payload_paths).length > 0)
            ?.accepted_payload_paths),
        payload_preflight_policy: payloadPreflightPolicies[0] ?? null,
        payload_preflight_policy_count: payloadPreflightPolicies.length,
        payload_preflight_error_code: payloadPreflightErrorCodes[0] ?? null,
        payload_preflight_blocked_error_kind: payloadPreflightBlockedErrorKinds[0] ?? null,
        identity_binding_policy:
          groupItems.find((item) => item.identity_binding_policy)?.identity_binding_policy ?? null,
        identity_binding_guidance_count:
          groupItems.filter((item) => Object.keys(item.identity_binding_guidance).length > 0).length,
        identity_source_fingerprint_binding_modes: sourceFingerprintBindings,
        required_evidence_ref_count: numberSum(
          groupItems.map((item) => item.required_evidence_refs.length),
        ),
        required_evidence_refs: requiredEvidenceRefs,
        required_return_shapes: requiredReturnShapes,
        typed_blocker_payload_path_available_count:
          groupItems.filter((item) => item.typed_blocker_payload_path_available).length,
        owner_receipt_payload_path_available_count:
          groupItems.filter((item) => item.owner_receipt_payload_path_available).length,
        owner_chain_payload_path_available_count:
          groupItems.filter((item) => item.owner_chain_payload_path_available).length,
        no_regression_payload_path_available_count:
          groupItems.filter((item) => item.no_regression_payload_path_available).length,
        supplemental_evidence_payload_available_count:
          groupItems.filter((item) => item.supplemental_evidence_payload_available).length,
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
      payload_workorder_count:
        items.filter((item) => Object.keys(item.payload_workorder).length > 0).length,
      payload_preflight_policy_count:
        items.filter((item) => Boolean(item.payload_preflight_policy)).length,
      identity_binding_guidance_count:
        items.filter((item) => Object.keys(item.identity_binding_guidance).length > 0).length,
      required_operator_payload_ref_count:
        items.reduce((total, item) => total + item.required_operator_payload_refs.length, 0),
      supplemental_operator_payload_ref_count:
        items.reduce((total, item) => total + item.supplemental_operator_payload_refs.length, 0),
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
      supplemental_evidence_payload_available_count:
        items.filter((item) => item.supplemental_evidence_payload_available).length,
      success_payload_owner: 'domain_repository_or_app_live_operator',
      accepted_payload_path_policy:
        'success_refs_path_or_typed_blocker_path_empty_template_blocks',
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
    owner: item.canonical_domain_id ?? 'domain_repository_or_app_live_operator',
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
    stage_attempt_source_fingerprint: item.stage_attempt_source_fingerprint,
    target_identity: item.target_identity,
    dispatch_identity_key: item.dispatch_identity_key,
    dispatch_identity_fields: item.dispatch_identity_fields,
    identity_binding_policy: item.identity_binding_policy,
    identity_binding_guidance: item.identity_binding_guidance,
    required_operator_payload_ref_count: item.required_operator_payload_refs.length,
    required_operator_payload_refs: item.required_operator_payload_refs,
    supplemental_operator_payload_ref_count: item.supplemental_operator_payload_refs.length,
    supplemental_operator_payload_refs: item.supplemental_operator_payload_refs,
    payload_ref_hints: item.payload_ref_hints,
    payload_path_policy: item.payload_path_policy,
    accepted_payload_paths: item.accepted_payload_paths,
    payload_preflight_policy: item.payload_preflight_policy,
    payload_preflight_error_code: item.payload_preflight_error_code,
    payload_preflight_blocked_error_kind: item.payload_preflight_blocked_error_kind,
    empty_payload_template_is_success_evidence: item.empty_payload_template_is_success_evidence,
    required_evidence_ref_count: item.required_evidence_refs.length,
    required_evidence_refs: item.required_evidence_refs,
    typed_blocker_payload_path_available: item.typed_blocker_payload_path_available,
    owner_receipt_payload_path_available: item.owner_receipt_payload_path_available,
    owner_chain_payload_path_available: item.owner_chain_payload_path_available,
    no_regression_payload_path_available: item.no_regression_payload_path_available,
    evidence_payload_path_available: item.evidence_payload_path_available,
    supplemental_evidence_payload_available: item.supplemental_evidence_payload_available,
    open_reason: item.open_reason,
    payload_requirement: item.payload_requirement,
    worklist_item_is_completion_claim: false,
  }));
}

export function compactDomainDispatchEvidenceWorkorderGroupAttentionItems(
  packet: ReturnType<typeof buildDomainDispatchEvidenceWorkorderPacket>,
  limit = 5,
  refLimit = 3,
) {
  return packet.domain_stage_group_summary.groups.slice(0, limit).map((group) => ({
    group_id: group.group_id,
    owner: group.canonical_domain_id ?? 'domain_repository_or_app_live_operator',
    canonical_domain_id: group.canonical_domain_id,
    stage_id: group.stage_id,
    route_domain_ids: group.route_domain_ids,
    route_domain_id_policy: group.route_domain_id_policy,
    workorder_count: group.workorder_count,
    stage_attempt_count: group.stage_attempt_count,
    sample_stage_attempt_ids: group.stage_attempt_ids.slice(0, refLimit),
    stage_attempt_id_omitted_count: Math.max(group.stage_attempt_ids.length - refLimit, 0),
    sample_action_refs: group.action_refs.slice(0, refLimit),
    action_ref_omitted_count: Math.max(group.action_refs.length - refLimit, 0),
    sample_record_action_ids: group.record_action_ids.slice(0, refLimit),
    record_action_id_omitted_count: Math.max(group.record_action_ids.length - refLimit, 0),
    sample_record_command_refs: group.record_command_refs.slice(0, refLimit),
    record_command_ref_omitted_count: Math.max(group.record_command_refs.length - refLimit, 0),
    can_submit_record_to_safe_action_shell: group.record_command_refs.length > 0,
    required_operator_payload_ref_count: group.required_operator_payload_ref_count,
    required_operator_payload_refs: group.required_operator_payload_refs,
    supplemental_operator_payload_ref_count: group.supplemental_operator_payload_ref_count,
    supplemental_operator_payload_refs: group.supplemental_operator_payload_refs,
    payload_template: group.payload_template,
    payload_ref_hints: group.payload_ref_hints,
    payload_template_policy: group.payload_template_policy,
    empty_payload_template_is_success_evidence: group.empty_payload_template_is_success_evidence,
    payload_path_policy: group.payload_path_policy,
    accepted_payload_paths: group.accepted_payload_paths,
    payload_preflight_policy: group.payload_preflight_policy,
    payload_preflight_policy_count: group.payload_preflight_policy_count,
    payload_preflight_error_code: group.payload_preflight_error_code,
    payload_preflight_blocked_error_kind: group.payload_preflight_blocked_error_kind,
    identity_binding_policy: group.identity_binding_policy,
    identity_binding_guidance_count: group.identity_binding_guidance_count,
    identity_source_fingerprint_binding_modes: group.identity_source_fingerprint_binding_modes,
    required_evidence_ref_count: group.required_evidence_ref_count,
    sample_required_evidence_refs: group.required_evidence_refs.slice(0, refLimit),
    required_evidence_ref_omitted_count:
      Math.max(group.required_evidence_refs.length - refLimit, 0),
    required_return_shapes: group.required_return_shapes,
    payload_owner: group.payload_owner,
    route_requires_domain_or_app_payload: group.route_requires_domain_or_app_payload,
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    full_detail_section: 'domain_dispatch_evidence',
    worklist_item_is_completion_claim: false,
    authority_boundary: group.authority_boundary,
  }));
}
