import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildDomainDispatchEvidenceWorkorderPacket,
  compactDomainDispatchEvidenceWorkorderAttentionItems,
} from '../domain-dispatch-evidence-workorder-packet.ts';

export type AppOperatorDrilldownDetailLevel = 'summary' | 'full';

const DEFAULT_ATTENTION_ITEM_LIMIT = 5;

const SUMMARY_DRILLDOWN_KEYS = [
  'route_graph_refs',
  'decision_map_refs',
  'review_repair_queue_refs',
  'artifact_gallery_refs',
  'package_export_lifecycle_refs',
  'memory_writeback_refs',
  'quality_readiness_refs',
  'provider_slo_operator_action_refs',
  'runtime_manager_route_support',
  'route_transition_drilldown',
  'periodic_execution_refs',
  'operator_action_routing_refs',
  'owner_receipt_refs',
  'typed_blocker_refs',
  'domain_dispatch_evidence',
  'stage_production_evidence',
  'freshness_refs',
  'ref_family_refs',
  'safe_action_refs',
  'app_execution_bridge',
  'lifecycle_ledger_refs',
  'domain_projection_refs',
  'domain_evidence_request_refs',
  'production_evidence_tail_ledger',
  'evidence_envelope',
  'domain_legacy_cleanup_plan_refs',
  'standard_agent_template_consumption_refs',
  'opl_meta_agent_workbench_refs',
  'functional_privatization_audit_summary',
  'functional_privatization_audit_refs',
] as const;

const LAZY_LOAD_TARGETS = SUMMARY_DRILLDOWN_KEYS.map((section) => ({
  section,
  detail_args: ['--detail', 'full'],
  load_policy: 'explicit_drilldown_lazy_load',
}));

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function markFullRefsObject<T extends JsonRecord, K extends keyof T & string>(value: T, key: K): T {
  const refs = Array.isArray(value[key]) ? value[key] : [];
  return {
    ...value,
    omitted_ref_count: 0,
    total_ref_count: refs.length,
    detail_policy: 'complete_refs_explicit_full_detail',
  };
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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

function limitedItems<T>(items: T[]) {
  return {
    items: items.slice(0, DEFAULT_ATTENTION_ITEM_LIMIT),
    omitted_count: Math.max(items.length - DEFAULT_ATTENTION_ITEM_LIMIT, 0),
    total_count: items.length,
  };
}

function attentionCount(item: JsonRecord) {
  return numberValue(item.open_envelope_count) + numberValue(item.blocked_envelope_count);
}

function authorityBoundary(drilldown: JsonRecord) {
  return record(drilldown.authority_boundary);
}

function safeActionRoutes(drilldown: JsonRecord) {
  const routes = [
    ...recordList(record(drilldown.operator_action_routing_refs).refs),
    ...recordList(record(drilldown.app_execution_bridge).safe_action_routes),
  ];
  const seen = new Set<string>();
  return routes.filter((route) => {
    const key = firstString(route.action_id, route.ref, route.action_ref);
    if (!key) {
      return true;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function actionPriority(action: JsonRecord) {
  const actionKind = stringValue(action.action_kind);
  if (actionKind === 'stage_production_attempt_request') {
    return 0;
  }
  if (actionKind === 'stage_production_evidence_receipt_record') {
    return 1;
  }
  if (actionKind === 'stage_production_evidence_receipt_verify') {
    return 2;
  }
  if (actionKind === 'external_evidence_receipt_record'
    || actionKind === 'evidence_gate_receipt_record') {
    return 3;
  }
  if (actionKind === 'external_evidence_receipt_verify'
    || actionKind === 'evidence_gate_receipt_verify') {
    return 4;
  }
  if (actionKind === 'provider_scheduler_tick'
    || actionKind === 'provider_scheduler_trigger') {
    return 5;
  }
  if (actionKind === 'legacy_cleanup_apply'
    || actionKind === 'legacy_cleanup_verify') {
    return 6;
  }
  return 7;
}

function summarizeSafeAction(action: JsonRecord | null) {
  if (!action) {
    return null;
  }
  const actionId = stringValue(action.action_id);
  return {
    action_id: actionId,
    action_kind: stringValue(action.action_kind),
    owner: firstString(action.owner, action.action_owner),
    route_target_kind: stringValue(action.route_target_kind),
    execution_surface: stringValue(action.execution_surface) ?? 'opl runtime action execute',
    submit_via: stringValue(action.submit_via) ?? 'opl runtime action execute',
    submit_args: actionId
      ? ['runtime', 'action', 'execute', '--action', actionId]
      : [],
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
    payload_template: record(action.payload_template),
    payload_ref_hints: record(action.payload_ref_hints),
    payload_template_policy: stringValue(action.payload_template_policy),
    payload_workorder: record(action.payload_workorder),
    payload_preflight_policy: stringValue(action.payload_preflight_policy),
    payload_preflight_error_code: stringValue(action.payload_preflight_error_code),
    payload_preflight_blocked_error_kind: stringValue(action.payload_preflight_blocked_error_kind),
    empty_payload_template_is_success_evidence:
      action.empty_payload_template_is_success_evidence === true,
    copyable_runtime_action_execute_commands:
      record(action.copyable_runtime_action_execute_commands),
    required_operator_payload_refs: stringList(action.required_operator_payload_refs),
    optional_operator_payload_refs: stringList(action.optional_operator_payload_refs),
    route_requires_domain_or_app_payload: action.route_requires_domain_or_app_payload === true,
    can_close_without_domain_or_app_payload: action.can_close_without_domain_or_app_payload !== false,
  };
}

function findSafeActionForStage(actions: JsonRecord[], stage: JsonRecord) {
  const stageDomainIds = stringList([
    stage.target_domain_id,
    stage.domain_id,
    stage.project_id,
  ]);
  const stageId = stringValue(stage.stage_id);
  const domainMatches = (action: JsonRecord) => {
    const actionDomainIds = stringList([
      action.target_domain_id,
      action.domain_id,
      action.project_id,
    ]);
    return actionDomainIds.some((actionDomainId) => stageDomainIds.includes(actionDomainId));
  };
  return actions.find((action) =>
    stringValue(action.action_kind) === 'stage_production_attempt_request'
    && stringValue(action.stage_id) === stageId
    && domainMatches(action)
  ) ?? actions.find((action) =>
    stringValue(action.action_kind) === 'stage_production_evidence_receipt_record'
    && stringValue(action.stage_id) === stageId
    && domainMatches(action)
  ) ?? actions.find((action) =>
    stringValue(action.action_kind) === 'stage_production_evidence_receipt_verify'
    && stringValue(action.stage_id) === stageId
    && domainMatches(action)
  ) ?? null;
}

function findSafeActionForEvidence(actions: JsonRecord[], evidence: JsonRecord) {
  const requestId = firstString(evidence.request_id, evidence.gate_id);
  const domainId = stringValue(evidence.domain_id);
  return actions.find((action) =>
    stringValue(action.request_id) === requestId
    && stringValue(action.domain_id) === domainId
  ) ?? null;
}

function blockingItems(drilldown: JsonRecord) {
  const typedBlockers = record(drilldown.typed_blocker_refs);
  const blockerRefs = recordList(typedBlockers.refs).map((ref) => ({
    owner: firstString(ref.domain_id, ref.owner) ?? 'domain',
    blocking_kind: 'typed_blocker_ref',
    blocker_ref: stringValue(ref.ref),
    role: stringValue(ref.role),
    domain_id: stringValue(ref.domain_id),
    stage_id: stringValue(ref.stage_id),
    stage_attempt_id: stringValue(ref.stage_attempt_id),
  }));
  const blockers = recordList(typedBlockers.blockers).map((blocker) => ({
    owner: firstString(blocker.domain_id, blocker.owner) ?? 'domain',
    blocking_kind: 'typed_blocker',
    blocker_id: firstString(blocker.blocker_id, blocker.blocker_kind, blocker.reason),
    domain_id: stringValue(blocker.domain_id),
    stage_id: stringValue(blocker.stage_id),
    stage_attempt_id: stringValue(blocker.stage_attempt_id),
  }));
  return limitedItems([...blockerRefs, ...blockers]);
}

function advisoryItems(drilldown: JsonRecord) {
  const tailItems = recordList(record(drilldown.production_evidence_tail_ledger).tail_items)
    .filter((item) => stringValue(item.status) !== 'closed')
    .map((item) => ({
      owner: firstString(item.owner_group, item.domain_owner) ?? 'one-person-lab',
      advisory_kind: stringValue(item.tail_item) ?? 'production_evidence_tail',
      status: stringValue(item.status),
      detail_ref: firstString(item.evidence_ref, item.doc_ref),
      blocking_policy: stringValue(item.blocking_policy),
    }));
  const legacyPlans = recordList(record(drilldown.domain_legacy_cleanup_plan_refs).refs)
    .filter((plan) => stringValue(plan.plan_status) !== 'ready')
    .map((plan) => ({
      owner: stringValue(plan.command_domain_id) ?? stringValue(plan.domain_id) ?? 'domain',
      advisory_kind: 'legacy_cleanup_plan_blocked',
      status: stringValue(plan.plan_status),
      detail_ref: stringValue(plan.ref),
      blocked_reasons: stringList(plan.blocked_reasons),
    }));
  return limitedItems([...tailItems, ...legacyPlans]);
}

function missingEvidenceItems(drilldown: JsonRecord) {
  const actions = safeActionRoutes(drilldown);
  const stageMissing = recordList(record(drilldown.stage_production_evidence).stages)
    .filter((stage) => stringList(stage.missing_production_evidence).length > 0)
    .map((stage) => {
      const action = findSafeActionForStage(actions, stage);
      return {
        owner: stringValue(stage.owner) ?? stringValue(stage.target_domain_id) ?? 'domain',
        evidence_kind: 'stage_production_evidence',
        domain_id: firstString(stage.target_domain_id, stage.domain_id, stage.project_id),
        stage_id: stringValue(stage.stage_id),
        missing: stringList(stage.missing_production_evidence),
        detail_ref: stringValue(stage.ref),
        next_safe_action_id: stringValue(action?.action_id),
        open_reason: stringValue(action?.open_reason),
        payload_requirement: stringValue(action?.payload_requirement),
        payload_owner: stringValue(action?.payload_owner),
        payload_template: record(action?.payload_template),
        payload_ref_hints: record(action?.payload_ref_hints),
        payload_template_policy: stringValue(action?.payload_template_policy),
        payload_workorder: record(action?.payload_workorder),
        copyable_runtime_action_execute_commands:
          record(action?.copyable_runtime_action_execute_commands),
        required_operator_payload_refs: stringList(action?.required_operator_payload_refs),
        route_requires_domain_or_app_payload: action?.route_requires_domain_or_app_payload === true,
      };
    });
  const domainEvidence = record(drilldown.domain_evidence_request_refs);
  const externalMissing = recordList(domainEvidence.external_requests)
    .filter((request) => stringValue(request.external_receipt_status) !== 'verified')
    .map((request) => {
      const action = findSafeActionForEvidence(actions, request);
      return {
        owner: stringValue(request.domain_id) ?? 'domain',
        evidence_kind: 'external_evidence_request',
        domain_id: stringValue(request.domain_id),
        request_id: stringValue(request.request_id),
        missing: stringList(request.required_evidence_refs),
        detail_ref: stringValue(request.ref),
        next_safe_action_id: stringValue(action?.action_id),
      };
    });
  const gateMissing = recordList(domainEvidence.evidence_gates)
    .filter((gate) => stringValue(gate.external_receipt_status) !== 'verified')
    .map((gate) => {
      const action = findSafeActionForEvidence(actions, gate);
      return {
        owner: stringValue(gate.domain_id) ?? 'domain',
        evidence_kind: 'remaining_evidence_gate',
        domain_id: stringValue(gate.domain_id),
        gate_id: firstString(gate.gate_id, gate.request_id),
        missing: ['verified_evidence_gate_receipt'],
        detail_ref: stringValue(gate.ref),
        next_safe_action_id: stringValue(action?.action_id),
      };
    });
  return limitedItems([...stageMissing, ...externalMissing, ...gateMissing]);
}

function providerHealth(drilldown: JsonRecord) {
  const summary = record(drilldown.summary);
  const cadenceStatus = stringValue(summary.provider_cadence_window_status);
  const capabilityStatus = stringValue(summary.provider_capability_slo_status);
  const missingReceipts = numberValue(summary.provider_cadence_window_missing_receipt_count);
  const blockedRepairReceipts = numberValue(summary.provider_cadence_window_blocked_repair_receipt_count);
  const domainTruthBoundaryPreserved =
    summary.provider_capability_domain_truth_boundary_preserved === true;
  const healthy =
    (cadenceStatus === 'window_cadence_satisfied' || cadenceStatus === 'window_not_required')
    && (capabilityStatus === 'capability_slo_satisfied' || capabilityStatus === null)
    && missingReceipts === 0
    && blockedRepairReceipts === 0
    && domainTruthBoundaryPreserved;
  return {
    surface_kind: 'opl_app_drilldown_provider_health_attention',
    owner: 'one-person-lab',
    provider_kind: 'temporal',
    health_status: healthy ? 'healthy' : 'attention_required',
    cadence_window_status: cadenceStatus,
    capability_slo_status: capabilityStatus,
    expected_receipt_count: numberValue(summary.provider_cadence_window_expected_receipt_count),
    observed_receipt_count: numberValue(summary.provider_cadence_window_observed_receipt_count),
    missing_receipt_count: missingReceipts,
    blocked_repair_receipt_count: blockedRepairReceipts,
    domain_truth_boundary_preserved: domainTruthBoundaryPreserved,
    authority_boundary: authorityBoundary(drilldown),
  };
}

function evidenceAfterContractAttention(drilldown: JsonRecord) {
  const summary = record(drilldown.summary);
  const ownerPayloadGroups = ownerPayloadAttentionGroups(drilldown);
  const domainDispatchWorkorders = domainDispatchEvidenceWorkorders(drilldown);
  const evidenceEnvelopeAttentionCount = (
    numberValue(summary.evidence_envelope_open_count)
    + numberValue(summary.evidence_envelope_blocked_count)
  );
  const domainDispatchAttentionCount = numberValue(summary.domain_dispatch_attention_count);
  const totalAttentionCount = evidenceEnvelopeAttentionCount + domainDispatchAttentionCount;
  const routeSupportTaskKindCount =
    numberValue(summary.runtime_manager_mas_route_support_task_kind_count);
  const routeSupportAftercareCount =
    numberValue(summary.runtime_manager_mas_aftercare_route_support_count);
  return {
    surface_kind: 'opl_app_drilldown_evidence_after_contract_attention',
    status: totalAttentionCount > 0 ? 'attention_required' : 'clear',
    attention_policy:
      'summary_counts_only_full_refs_via_explicit_drilldown_no_domain_ready_claim',
    evidence_envelope_attention_count: evidenceEnvelopeAttentionCount,
    evidence_envelope_open_count: numberValue(summary.evidence_envelope_open_count),
    evidence_envelope_blocked_count: numberValue(summary.evidence_envelope_blocked_count),
    evidence_envelope_receipt_ref_count: numberValue(summary.evidence_envelope_receipt_ref_count),
    evidence_envelope_typed_blocker_ref_count:
      numberValue(summary.evidence_envelope_typed_blocker_ref_count),
    owner_payload_group_attention_count: ownerPayloadGroups.total_count,
    owner_payload_group_attention_omitted_count: ownerPayloadGroups.omitted_count,
    owner_payload_group_attention_policy:
      'top_owner_payload_groups_by_open_then_blocked_counts_refs_only',
    owner_payload_groups: ownerPayloadGroups.items,
    domain_dispatch_attention_count: domainDispatchAttentionCount,
    domain_dispatch_typed_blocker_stage_count:
      numberValue(summary.domain_dispatch_attention_typed_blocker_stage_count),
    domain_dispatch_blocked_obligation_count:
      numberValue(summary.domain_dispatch_attention_blocked_obligation_count),
    domain_dispatch_missing_owner_chain_count:
      numberValue(summary.domain_dispatch_attention_missing_owner_chain_count),
    domain_dispatch_evidence_workorder_packet_summary:
      domainDispatchWorkorders.summary,
    domain_dispatch_evidence_workorder_attention_items:
      domainDispatchWorkorders.attention_items,
    runtime_manager_route_support_task_kind_count: routeSupportTaskKindCount,
    runtime_manager_aftercare_route_support_count: routeSupportAftercareCount,
    runtime_manager_route_support_action_ref_count:
      numberValue(summary.runtime_manager_mas_route_support_action_ref_count),
    route_support_status: routeSupportTaskKindCount > 0
      ? 'catalog_available_refs_only'
      : 'catalog_missing',
    next_evidence_owner: totalAttentionCount > 0
      ? 'domain_repository_or_app_live_operator'
      : null,
    full_detail_sections: [
      'evidence_envelope',
      'domain_dispatch_evidence',
      'stage_production_evidence',
      'runtime_manager_route_support',
    ],
    authority_boundary: {
      ...authorityBoundary(drilldown),
      route_support_closes_owner_chain: false,
      route_support_closes_domain_ready: false,
      route_support_closes_production_ready: false,
      attention_count_is_hard_blocker: false,
    },
  };
}

function domainDispatchEvidenceWorkorders(drilldown: JsonRecord) {
  const operatorRoutes = recordList(record(drilldown.operator_action_routing_refs).refs);
  const packet = buildDomainDispatchEvidenceWorkorderPacket(operatorRoutes);
  return {
    summary: packet.summary,
    attention_items: compactDomainDispatchEvidenceWorkorderAttentionItems(packet),
  };
}

function ownerPayloadRequiredRefs(payloadKind: string | null) {
  if (payloadKind === 'domain_owner_receipt_or_typed_blocker_refs') {
    return [
      'domain_owner_receipt_refs',
      'typed_blocker_refs',
      'owner_chain_refs',
      'no_regression_evidence_refs',
    ];
  }
  if (payloadKind === 'stage_expected_receipt_or_monitor_freshness_refs') {
    return [
      'domain_receipt_refs',
      'typed_blocker_refs',
      'monitor_freshness_refs',
      'runtime_event_refs',
    ];
  }
  if (payloadKind === 'domain_owned_typed_blocker_refs') {
    return [
      'typed_blocker_refs',
      'typed_blocker_closeout_refs',
      'owner_followthrough_refs',
    ];
  }
  if (payloadKind === 'domain_owned_receipt_refs') {
    return [
      'domain_owned_receipt_refs',
      'evidence_refs',
      'owner_chain_refs',
    ];
  }
  if (payloadKind === 'opl_cleanup_ledger_refs') {
    return [
      'opl_cleanup_ledger_refs',
      'domain_physical_delete_owner_receipt_refs',
      'restore_proof_refs',
    ];
  }
  return [
    'evidence_refs',
    'domain_receipt_refs',
    'typed_blocker_refs',
  ];
}

function ownerPayloadAttentionGroups(drilldown: JsonRecord) {
  const envelopeSummary = record(record(drilldown.evidence_envelope).summary);
  const groups = recordList(envelopeSummary.owner_payload_breakdown)
    .map((group) => {
      const payloadKind = stringValue(group.payload_kind);
      const openCount = numberValue(group.open_envelope_count);
      const blockedCount = numberValue(group.blocked_envelope_count);
      return {
        owner: stringValue(group.owner) ?? 'domain_repository_or_app_live_operator',
        payload_kind: payloadKind,
        status: openCount > 0
          ? 'needs_owner_payload_refs'
          : 'blocked_by_domain_typed_blocker_refs',
        attention_count: openCount + blockedCount,
        envelope_count: numberValue(group.envelope_count),
        open_envelope_count: openCount,
        blocked_envelope_count: blockedCount,
        closed_envelope_count: numberValue(group.closed_envelope_count),
        receipt_ref_count: numberValue(group.receipt_ref_count),
        typed_blocker_ref_count: numberValue(group.typed_blocker_ref_count),
        evidence_ref_count: numberValue(group.evidence_ref_count),
        required_refs_any_of: ownerPayloadRequiredRefs(payloadKind),
        full_detail_section: 'evidence_envelope',
        authority_boundary: {
          can_write_domain_truth: false,
          can_create_owner_receipt: false,
          can_close_domain_ready: false,
          can_claim_production_ready: false,
          refs_only: true,
        },
      };
    })
    .filter((group) => group.attention_count > 0)
    .sort((left, right) => (
      right.open_envelope_count - left.open_envelope_count
      || right.blocked_envelope_count - left.blocked_envelope_count
      || right.envelope_count - left.envelope_count
      || String(left.owner).localeCompare(String(right.owner))
      || String(left.payload_kind).localeCompare(String(right.payload_kind))
    ));
  return limitedItems(groups);
}

function evidenceNextSteps(drilldown: JsonRecord) {
  const attention = evidenceAfterContractAttention(drilldown);
  const domainDispatchWorkorders = recordList(attention.domain_dispatch_evidence_workorder_attention_items);
  const ownerPayloadGroups = recordList(attention.owner_payload_groups);
  const missingEvidence = missingEvidenceItems(drilldown);
  const advisory = advisoryItems(drilldown);
  const steps: JsonRecord[] = [];
  if (numberValue(attention.domain_dispatch_attention_count) > 0) {
    steps.push({
      step_kind: 'domain_dispatch_owner_chain_scaleout',
      owner: 'domain_repository_or_app_live_operator',
      status: 'needs_domain_owned_receipt_or_typed_blocker_scaleout',
      attention_count: attention.domain_dispatch_attention_count,
      blocked_obligation_count: attention.domain_dispatch_blocked_obligation_count,
      typed_blocker_stage_count: attention.domain_dispatch_typed_blocker_stage_count,
      route_support_status: attention.route_support_status,
      route_support_closes_owner_chain: false,
      required_refs_any_of: [
        'domain_owner_receipt_refs',
        'typed_blocker_refs',
        'no_regression_evidence_refs',
        'memory_writeback_receipt_refs',
      ],
      full_detail_section: 'domain_dispatch_evidence',
    });
  }
  for (const workorder of domainDispatchWorkorders) {
    steps.push({
      step_kind: 'domain_dispatch_evidence_workorder',
      owner: stringValue(workorder.payload_owner) ?? 'domain_repository_or_app_live_operator',
      status: 'needs_domain_or_app_live_refs_payload',
      domain_id: stringValue(workorder.domain_id),
      route_domain_id: stringValue(workorder.route_domain_id) ?? stringValue(workorder.domain_id),
      canonical_domain_id: stringValue(workorder.canonical_domain_id),
      domain_id_policy: stringValue(workorder.domain_id_policy),
      stage_id: stringValue(workorder.stage_id),
      stage_attempt_id: stringValue(workorder.stage_attempt_id),
      action_id: stringValue(workorder.action_id),
      next_safe_action_ref: stringValue(workorder.next_safe_action_ref),
      route_requires_domain_or_app_payload:
        workorder.route_requires_domain_or_app_payload === true,
      required_operator_payload_refs: stringList(workorder.required_operator_payload_refs),
      required_evidence_refs: stringList(workorder.required_evidence_refs),
      can_execute_domain_action: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      full_detail_section: 'domain_dispatch_evidence',
    });
  }
  if (numberValue(attention.evidence_envelope_attention_count) > 0) {
    steps.push({
      step_kind: 'evidence_envelope_scaleout',
      owner: 'domain_repository_or_app_live_operator',
      status: 'needs_open_or_blocked_envelope_followthrough',
      attention_count: attention.evidence_envelope_attention_count,
      open_envelope_count: attention.evidence_envelope_open_count,
      blocked_envelope_count: attention.evidence_envelope_blocked_count,
      required_refs_any_of: [
        'evidence_refs',
        'domain_receipt_refs',
        'typed_blocker_refs',
        'owner_chain_refs',
      ],
      full_detail_section: 'evidence_envelope',
    });
  }
  for (const group of ownerPayloadGroups) {
    steps.push({
      step_kind: 'owner_payload_group_scaleout',
      owner: stringValue(group.owner) ?? 'domain_repository_or_app_live_operator',
      payload_kind: stringValue(group.payload_kind),
      status: stringValue(group.status) ?? 'needs_owner_payload_refs',
      attention_count: attentionCount(group),
      open_envelope_count: numberValue(group.open_envelope_count),
      blocked_envelope_count: numberValue(group.blocked_envelope_count),
      receipt_ref_count: numberValue(group.receipt_ref_count),
      typed_blocker_ref_count: numberValue(group.typed_blocker_ref_count),
      evidence_ref_count: numberValue(group.evidence_ref_count),
      required_refs_any_of: stringList(group.required_refs_any_of),
      full_detail_section: 'evidence_envelope',
      can_execute_domain_action: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
    });
  }
  for (const item of recordList(missingEvidence.items)) {
    steps.push({
      step_kind: 'stage_missing_evidence_followthrough',
      owner: stringValue(item.owner) ?? 'domain_repository_or_app_live_operator',
      status: 'needs_live_refs_or_typed_blocker',
      domain_id: stringValue(item.domain_id),
      stage_id: stringValue(item.stage_id),
      missing: stringList(item.missing),
      next_safe_action_id: stringValue(item.next_safe_action_id),
      route_requires_domain_or_app_payload: item.route_requires_domain_or_app_payload === true,
      full_detail_section: 'stage_production_evidence',
    });
  }
  for (const item of recordList(advisory.items)) {
    if (stringValue(item.status) !== 'domain_owned_typed_blocker') {
      continue;
    }
    steps.push({
      step_kind: 'domain_typed_blocker_followthrough',
      owner: stringValue(item.owner) ?? 'domain_repository_or_app_live_operator',
      status: 'domain_typed_blocker_requires_real_evidence_followthrough',
      detail_ref: stringValue(item.detail_ref),
      blocking_policy: stringValue(item.blocking_policy),
      full_detail_section: 'stage_production_evidence',
    });
  }
  return {
    surface_kind: 'opl_app_drilldown_evidence_next_steps',
    projection_policy:
      'operator_guidance_only_no_safe_action_creation_no_domain_ready_claim',
    items: steps.slice(0, DEFAULT_ATTENTION_ITEM_LIMIT),
    omitted_count: Math.max(steps.length - DEFAULT_ATTENTION_ITEM_LIMIT, 0),
    total_count: steps.length,
    next_owner: steps.length > 0 ? 'domain_repository_or_app_live_operator' : null,
    can_execute_domain_action: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    authority_boundary: authorityBoundary(drilldown),
  };
}

function buildAttentionFirstPayload(drilldown: JsonRecord) {
  const actions = [...safeActionRoutes(drilldown)].sort((left, right) => (
    actionPriority(left) - actionPriority(right)
  ));
  const nextAction = actions[0] ?? null;
  return {
    surface_kind: 'opl_app_drilldown_attention_first_payload',
    payload_policy:
      'default_app_payload_owner_attention_only_full_refs_routes_and_attempt_graph_require_detail_full',
    owner: {
      projection_owner: 'one-person-lab',
      app_consumer: 'one_person_lab_app_operator_workbench',
      provider_runtime_owner: 'one-person-lab',
      domain_truth_owner: 'domain repositories',
      active_action_owner: firstString(nextAction?.owner, nextAction?.action_owner),
    },
    blocking: blockingItems(drilldown),
    advisory: advisoryItems(drilldown),
    missing_evidence: missingEvidenceItems(drilldown),
    evidence_after_contract: evidenceAfterContractAttention(drilldown),
    evidence_next_steps: evidenceNextSteps(drilldown),
    next_safe_action: summarizeSafeAction(nextAction),
    additional_safe_action_count: Math.max(actions.length - (nextAction ? 1 : 0), 0),
    provider_health: providerHealth(drilldown),
    authority_boundary: authorityBoundary(drilldown),
    full_detail_args: ['--detail', 'full'],
    lazy_load_targets: LAZY_LOAD_TARGETS,
  };
}

function omitSummaryDrilldownKeys<T extends JsonRecord>(drilldown: T) {
  const compact: JsonRecord = { ...drilldown };
  for (const key of SUMMARY_DRILLDOWN_KEYS) {
    delete compact[key];
  }
  return compact as T;
}

export function applyAppOperatorDrilldownDetail<T extends JsonRecord>(
  drilldown: T,
  detailLevel: AppOperatorDrilldownDetailLevel,
): T {
  if (detailLevel === 'full') {
    const fullDrilldown = {
      ...drilldown,
      detail_level: 'full',
      projection_detail_policy: 'full_refs_explicit_request',
      attention_first_payload: {
        ...buildAttentionFirstPayload(drilldown),
        payload_policy:
          'full_detail_attention_overlay_with_complete_refs_no_domain_ready_claim',
        full_detail_args: [],
      },
    };
    return {
      ...fullDrilldown,
      route_graph_refs: markFullRefsObject(record(fullDrilldown.route_graph_refs), 'refs'),
      operator_action_routing_refs:
        markFullRefsObject(record(fullDrilldown.operator_action_routing_refs), 'refs'),
      production_evidence_tail_ledger:
        markFullRefsObject(record(fullDrilldown.production_evidence_tail_ledger), 'tail_items'),
      evidence_envelope:
        markFullRefsObject(record(fullDrilldown.evidence_envelope), 'envelopes'),
      domain_dispatch_evidence:
        markFullRefsObject(record(fullDrilldown.domain_dispatch_evidence), 'attempts'),
      stage_production_evidence:
        markFullRefsObject(record(fullDrilldown.stage_production_evidence), 'stages'),
    };
  }

  return {
    ...omitSummaryDrilldownKeys(drilldown),
    detail_level: 'summary',
    projection_detail_policy: 'attention_first_default_full_refs_via_explicit_drilldown',
    full_detail_args: ['--detail', 'full'],
    attention_first_payload: buildAttentionFirstPayload(drilldown),
  };
}
