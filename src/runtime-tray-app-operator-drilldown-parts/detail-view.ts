import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import {
  buildDomainDispatchEvidenceWorkorderPacket,
  compactDomainDispatchEvidenceWorkorderAttentionItems,
  compactDomainDispatchEvidenceWorkorderGroupAttentionItems,
} from '../domain-dispatch-evidence-workorder-packet.ts';
import { canonicalOwnerId } from '../evidence-envelope.ts';
import { buildOwnerHandoffPacket } from './owner-handoff-packet.ts';
import {
  buildOmaProductionConsumptionFollowthroughAttention,
  omaProductionConsumptionNextStep,
} from './oma-production-consumption.ts';
import {
  appReleaseUserPathEvidenceNextStep,
  buildAppReleaseUserPathEvidence,
} from './app-release-user-path.ts';
import { buildMemoryArtifactLifecycleEvidence } from './memory-artifact-lifecycle-evidence.ts';
import { functionalPrivatizationNextSteps } from './functional-privatization-next-step.ts';
import { summarizeSelectedSafeAction } from './selected-safe-action.ts';
import { buildOwnerPayloadWorkorder } from './owner-payload-workorder.ts';
import { splitOperatorAttentionCounts } from '../framework-readiness-attention-counts.ts';

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
  'codex_app_runtime_role',
  'app_release_user_path_evidence',
  'functional_privatization_audit_summary',
  'functional_privatization_audit_refs',
  'default_caller_deletion_evidence_refs',
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

function canonicalOwnerField(...values: unknown[]) {
  const source = firstString(...values);
  if (!source) {
    return {
      owner: 'domain_repository_or_app_live_operator',
      owner_source_id: null,
      owner_id_policy: 'canonical_owner_id_source_owner_id_for_diagnostics_only',
    };
  }
  const owner = canonicalOwnerId(source);
  return {
    owner,
    owner_source_id: owner === source ? null : source,
    owner_id_policy: 'canonical_owner_id_source_owner_id_for_diagnostics_only',
  };
}

function limitedItems<T>(items: T[]) {
  return {
    items: items.slice(0, DEFAULT_ATTENTION_ITEM_LIMIT),
    omitted_count: Math.max(items.length - DEFAULT_ATTENTION_ITEM_LIMIT, 0),
    total_count: items.length,
  };
}

function balancedAttentionItems(items: JsonRecord[]) {
  const selectedIndexes = new Set<number>();
  const seenKinds = new Set<string>();
  const selected: JsonRecord[] = [];
  for (const [index, item] of items.entries()) {
    const kind = stringValue(item.step_kind) ?? `unknown:${index}`;
    if (seenKinds.has(kind)) {
      continue;
    }
    seenKinds.add(kind);
    selectedIndexes.add(index);
    selected.push(item);
    if (selected.length >= DEFAULT_ATTENTION_ITEM_LIMIT) {
      break;
    }
  }
  if (selected.length < DEFAULT_ATTENTION_ITEM_LIMIT) {
    for (const [index, item] of items.entries()) {
      if (selectedIndexes.has(index)) {
        continue;
      }
      selectedIndexes.add(index);
      selected.push(item);
      if (selected.length >= DEFAULT_ATTENTION_ITEM_LIMIT) {
        break;
      }
    }
  }
  return {
    items: selected,
    omitted_count: Math.max(items.length - selected.length, 0),
    total_count: items.length,
    selection_policy: 'balanced_first_item_per_step_kind_then_original_order_refs_only',
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
  const selected = new Map<string, JsonRecord>();
  const unkeyedRoutes: JsonRecord[] = [];
  for (const route of routes) {
    const key = firstString(route.action_id, route.ref, route.action_ref);
    if (!key) {
      unkeyedRoutes.push(route);
      continue;
    }
    const existing = selected.get(key);
    if (!existing || (
      route.can_submit_to_safe_action_shell === true
      && existing.can_submit_to_safe_action_shell !== true
    )) {
      selected.set(key, existing
        ? {
            ...route,
            ...existing,
            action_ref: firstString(route.action_ref, existing.action_ref),
            submit_via: firstString(route.submit_via, existing.submit_via),
            can_submit_to_safe_action_shell: true,
            dry_run_supported: route.dry_run_supported === true || existing.dry_run_supported === true,
            approve_domain_action_supported:
              route.approve_domain_action_supported === true
              || existing.approve_domain_action_supported === true,
          }
        : route);
    }
  }
  return [...selected.values(), ...unkeyedRoutes];
}

function actionPriority(action: JsonRecord) {
  const actionKind = stringValue(action.action_kind);
  if (actionKind === 'app_release_user_path_evidence_receipt_verify') {
    return 0;
  }
  if (actionKind === 'app_release_user_path_evidence_receipt_record'
    || actionKind === 'oma_production_consumption_receipt_record') {
    return 1;
  }
  if (actionKind === 'stage_production_attempt_request') {
    return 2;
  }
  if (actionKind === 'stage_production_evidence_receipt_record') {
    return 3;
  }
  if (actionKind === 'stage_production_evidence_receipt_verify') {
    return 4;
  }
  if (actionKind === 'domain_dispatch_evidence_receipt_verify') {
    return 5;
  }
  if (actionKind === 'domain_dispatch_evidence_receipt_record') {
    return 6;
  }
  if (actionKind === 'external_evidence_receipt_record'
    || actionKind === 'evidence_gate_receipt_record') {
    return 7;
  }
  if (actionKind === 'external_evidence_receipt_verify'
    || actionKind === 'evidence_gate_receipt_verify') {
    return 8;
  }
  if (actionKind === 'provider_scheduler_install') {
    return 9;
  }
  if (actionKind === 'provider_scheduler_status') {
    return 10;
  }
  if (actionKind === 'provider_scheduler_tick'
    || actionKind === 'provider_scheduler_trigger') {
    return 11;
  }
  if (actionKind === 'legacy_cleanup_apply'
    || actionKind === 'legacy_cleanup_verify') {
    return 12;
  }
  return 13;
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
      const ownerFields = canonicalOwnerField(
        stage.target_domain_id,
        stage.domain_id,
        stage.project_id,
        stage.owner,
      );
      return {
        ...ownerFields,
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
      const ownerFields = canonicalOwnerField(request.domain_id);
      return {
        ...ownerFields,
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
      const ownerFields = canonicalOwnerField(gate.domain_id);
      return {
        ...ownerFields,
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
  const omaProductionConsumption =
    buildOmaProductionConsumptionFollowthroughAttention(drilldown);
  const appReleaseUserPathEvidence = buildAppReleaseUserPathEvidence(drilldown);
  const evidenceEnvelopeAttentionCount = (
    numberValue(summary.evidence_envelope_open_count)
    + numberValue(summary.evidence_envelope_blocked_count)
  );
  const domainDispatchAttentionCount = numberValue(summary.domain_dispatch_attention_count);
  const omaProductionConsumptionAttentionCount =
    numberValue(omaProductionConsumption.open_gate_count);
  const appReleaseUserPathOpenGateCount =
    numberValue(appReleaseUserPathEvidence.open_gate_count);
  const appReleaseUserPathPendingVerifyCount =
    numberValue(appReleaseUserPathEvidence.pending_verify_receipt_ref_count);
  const appReleaseUserPathAttentionCount = appReleaseUserPathOpenGateCount
    + appReleaseUserPathPendingVerifyCount;
  const attentionCounts = splitOperatorAttentionCounts({
    evidenceEnvelopeOpenCount: numberValue(summary.evidence_envelope_open_count),
    evidenceEnvelopeBlockedCount: numberValue(summary.evidence_envelope_blocked_count),
    domainDispatchAttentionCount,
    appReleaseUserPathAttentionCount,
    omaProductionConsumptionAttentionCount,
  });
  const routeSupportTaskKindCount =
    numberValue(summary.runtime_manager_mas_route_support_task_kind_count);
  const routeSupportAftercareCount =
    numberValue(summary.runtime_manager_mas_aftercare_route_support_count);
  const ownerHandoffPacket = buildOwnerHandoffPacket({
    ownerPayloadGroups: ownerPayloadGroups.items,
    domainDispatchGroupAttentionItems: domainDispatchWorkorders.group_attention_items,
    evidenceEnvelopeAttentionCount,
    domainDispatchAttentionCount,
    itemLimit: DEFAULT_ATTENTION_ITEM_LIMIT,
  });
  return {
    surface_kind: 'opl_app_drilldown_evidence_after_contract_attention',
    status: attentionCounts.totalAttentionCount > 0 ? 'attention_required' : 'clear',
    attention_policy:
      'summary_counts_only_full_refs_via_explicit_drilldown_no_domain_ready_claim',
    evidence_envelope_attention_count: evidenceEnvelopeAttentionCount,
    evidence_envelope_open_count: numberValue(summary.evidence_envelope_open_count),
    evidence_envelope_blocked_count: numberValue(summary.evidence_envelope_blocked_count),
    evidence_envelope_receipt_ref_count: numberValue(summary.evidence_envelope_receipt_ref_count),
    evidence_envelope_typed_blocker_ref_count:
      numberValue(summary.evidence_envelope_typed_blocker_ref_count),
    operator_actionable_attention_count: attentionCounts.operatorActionableAttentionCount,
    domain_blocked_attention_count: attentionCounts.domainBlockedAttentionCount,
    attention_count_semantics: attentionCounts.semantics,
    owner_payload_group_attention_count: ownerPayloadGroups.total_count,
    owner_payload_group_attention_omitted_count: ownerPayloadGroups.omitted_count,
    owner_payload_group_attention_policy:
      'top_owner_payload_groups_by_open_then_blocked_counts_refs_only',
    owner_payload_groups: ownerPayloadGroups.items,
    owner_handoff_packet: ownerHandoffPacket,
    memory_artifact_lifecycle_evidence: buildMemoryArtifactLifecycleEvidence(drilldown),
    app_release_user_path_evidence: appReleaseUserPathEvidence,
    app_release_user_path_evidence_open_gate_count: appReleaseUserPathOpenGateCount,
    app_release_user_path_evidence_pending_verify_receipt_ref_count:
      appReleaseUserPathPendingVerifyCount,
    oma_production_consumption_followthrough: omaProductionConsumption,
    oma_production_consumption_followthrough_open_gate_count:
      omaProductionConsumptionAttentionCount,
    domain_dispatch_attention_count: domainDispatchAttentionCount,
    domain_dispatch_typed_blocker_stage_count:
      numberValue(summary.domain_dispatch_attention_typed_blocker_stage_count),
    domain_dispatch_blocked_obligation_count:
      numberValue(summary.domain_dispatch_attention_blocked_obligation_count),
    domain_dispatch_missing_owner_chain_count:
      numberValue(summary.domain_dispatch_attention_missing_owner_chain_count),
    domain_dispatch_evidence_workorder_packet_summary:
      domainDispatchWorkorders.summary,
    domain_dispatch_evidence_workorder_group_attention_policy:
      'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
    domain_dispatch_evidence_workorder_group_attention_items:
      domainDispatchWorkorders.group_attention_items,
    domain_dispatch_evidence_workorder_attention_items:
      domainDispatchWorkorders.attention_items,
    runtime_manager_route_support_task_kind_count: routeSupportTaskKindCount,
    runtime_manager_aftercare_route_support_count: routeSupportAftercareCount,
    runtime_manager_route_support_action_ref_count:
      numberValue(summary.runtime_manager_mas_route_support_action_ref_count),
    route_support_status: routeSupportTaskKindCount > 0
      ? 'catalog_available_refs_only'
      : 'catalog_missing',
    next_evidence_owner: attentionCounts.totalAttentionCount > 0
      ? 'domain_repository_or_app_live_operator'
      : null,
    full_detail_sections: [
      'evidence_envelope',
      'domain_dispatch_evidence',
      'stage_production_evidence',
      'runtime_manager_route_support',
      'opl_meta_agent_workbench_refs',
      'app_release_user_path_evidence',
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
    group_attention_items: compactDomainDispatchEvidenceWorkorderGroupAttentionItems(packet),
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
      const requiredRefsAnyOf = ownerPayloadRequiredRefs(payloadKind);
      const payloadWorkorder = buildOwnerPayloadWorkorder({
        owner: stringValue(group.owner) ?? 'domain_repository_or_app_live_operator',
        payloadKinds: payloadKind ? [payloadKind] : [],
        requiredRefsAnyOf,
        fullDetailSections: ['evidence_envelope'],
      });
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
        required_refs_any_of: requiredRefsAnyOf,
        required_return_shapes: stringList(payloadWorkorder.required_return_shapes),
        payload_path_policy: stringValue(payloadWorkorder.payload_path_policy),
        accepted_payload_paths: record(payloadWorkorder.accepted_payload_paths),
        owner_payload_workorder: payloadWorkorder,
        empty_payload_template_is_success_evidence: false,
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

function topDispatchEvidenceOwner(
  domainDispatchGroups: JsonRecord[],
  domainDispatchWorkorders: JsonRecord[],
) {
  return firstString(
    domainDispatchGroups[0]?.owner,
    domainDispatchGroups[0]?.canonical_domain_id,
    domainDispatchWorkorders[0]?.owner,
    domainDispatchWorkorders[0]?.canonical_domain_id,
  );
}

function topCanonicalEvidenceOwner(
  domainDispatchGroups: JsonRecord[],
  domainDispatchWorkorders: JsonRecord[],
  ownerPayloadGroups: JsonRecord[],
) {
  return topDispatchEvidenceOwner(domainDispatchGroups, domainDispatchWorkorders)
    ?? firstString(ownerPayloadGroups[0]?.owner)
    ?? 'domain_repository_or_app_live_operator';
}

function evidenceNextSteps(drilldown: JsonRecord) {
  const attention = evidenceAfterContractAttention(drilldown);
  const domainDispatchGroups = recordList(
    attention.domain_dispatch_evidence_workorder_group_attention_items,
  );
  const domainDispatchWorkorders = recordList(attention.domain_dispatch_evidence_workorder_attention_items);
  const ownerPayloadGroups = recordList(attention.owner_payload_groups);
  const missingEvidence = missingEvidenceItems(drilldown);
  const advisory = advisoryItems(drilldown);
  const appReleaseUserPathEvidence = record(attention.app_release_user_path_evidence);
  const omaProductionConsumption = record(attention.oma_production_consumption_followthrough);
  const functionalPrivatizationSteps = functionalPrivatizationNextSteps(drilldown);
  const dispatchOwner = topDispatchEvidenceOwner(domainDispatchGroups, domainDispatchWorkorders)
    ?? 'domain_repository_or_app_live_operator';
  const nextOwner = topCanonicalEvidenceOwner(
    domainDispatchGroups,
    domainDispatchWorkorders,
    ownerPayloadGroups,
  );
  const steps: JsonRecord[] = [];
  if (
    numberValue(appReleaseUserPathEvidence.open_gate_count) > 0
    || numberValue(appReleaseUserPathEvidence.pending_verify_receipt_ref_count) > 0
  ) {
    steps.push(appReleaseUserPathEvidenceNextStep(appReleaseUserPathEvidence));
  }
  if (
    numberValue(omaProductionConsumption.open_gate_count) > 0
    || numberValue(omaProductionConsumption.pending_verify_long_soak_receipt_ref_count) > 0
  ) {
    steps.push(omaProductionConsumptionNextStep(omaProductionConsumption));
  }
  steps.push(...functionalPrivatizationSteps);
  if (
    numberValue(attention.domain_dispatch_attention_count) > 0
    && domainDispatchGroups.length === 0
    && domainDispatchWorkorders.length === 0
  ) {
    steps.push({
      step_kind: 'domain_dispatch_owner_chain_scaleout',
      owner: dispatchOwner,
      payload_owner: 'domain_repository_or_app_live_operator',
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
  for (const group of domainDispatchGroups) {
    steps.push({
      step_kind: 'domain_dispatch_evidence_group_workorder',
      owner: firstString(group.owner, group.canonical_domain_id, group.payload_owner)
        ?? 'domain_repository_or_app_live_operator',
      status: 'needs_domain_or_app_live_refs_payload_by_owner_stage_group',
      canonical_domain_id: stringValue(group.canonical_domain_id),
      payload_owner: stringValue(group.payload_owner),
      stage_id: stringValue(group.stage_id),
      route_domain_ids: stringList(group.route_domain_ids),
      route_domain_id_policy: stringValue(group.route_domain_id_policy),
      workorder_count: numberValue(group.workorder_count),
      stage_attempt_count: numberValue(group.stage_attempt_count),
      sample_stage_attempt_ids: stringList(group.sample_stage_attempt_ids),
      stage_attempt_id_omitted_count: numberValue(group.stage_attempt_id_omitted_count),
      sample_action_refs: stringList(group.sample_action_refs),
      action_ref_omitted_count: numberValue(group.action_ref_omitted_count),
      sample_record_action_ids: stringList(group.sample_record_action_ids),
      record_action_id_omitted_count: numberValue(group.record_action_id_omitted_count),
      sample_record_command_refs: stringList(group.sample_record_command_refs),
      record_command_ref_omitted_count: numberValue(group.record_command_ref_omitted_count),
      can_submit_record_to_safe_action_shell: group.can_submit_record_to_safe_action_shell === true,
      required_operator_payload_ref_count: numberValue(group.required_operator_payload_ref_count),
      required_operator_payload_refs: stringList(group.required_operator_payload_refs),
      payload_template: record(group.payload_template),
      payload_ref_hints: record(group.payload_ref_hints),
      payload_template_policy: stringValue(group.payload_template_policy),
      empty_payload_template_is_success_evidence: group.empty_payload_template_is_success_evidence === true,
      payload_path_policy: stringValue(group.payload_path_policy),
      accepted_payload_paths: record(group.accepted_payload_paths),
      payload_preflight_policy: stringValue(group.payload_preflight_policy),
      payload_preflight_policy_count: numberValue(group.payload_preflight_policy_count),
      payload_preflight_error_code: stringValue(group.payload_preflight_error_code),
      payload_preflight_blocked_error_kind: stringValue(group.payload_preflight_blocked_error_kind),
      required_evidence_ref_count: numberValue(group.required_evidence_ref_count),
      sample_required_evidence_refs: stringList(group.sample_required_evidence_refs),
      required_evidence_ref_omitted_count: numberValue(group.required_evidence_ref_omitted_count),
      required_return_shapes: stringList(group.required_return_shapes),
      can_execute_domain_action: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      full_detail_section: 'domain_dispatch_evidence',
    });
  }
  if (domainDispatchGroups.length === 0) {
    for (const workorder of domainDispatchWorkorders) {
      steps.push({
        step_kind: 'domain_dispatch_evidence_workorder',
        owner: firstString(workorder.owner, workorder.canonical_domain_id, workorder.payload_owner)
          ?? 'domain_repository_or_app_live_operator',
        status: 'needs_domain_or_app_live_refs_payload',
        domain_id: stringValue(workorder.domain_id),
        route_domain_id: stringValue(workorder.route_domain_id) ?? stringValue(workorder.domain_id),
        canonical_domain_id: stringValue(workorder.canonical_domain_id),
        payload_owner: stringValue(workorder.payload_owner),
        domain_id_policy: stringValue(workorder.domain_id_policy),
        stage_id: stringValue(workorder.stage_id),
        stage_attempt_id: stringValue(workorder.stage_attempt_id),
        action_id: stringValue(workorder.action_id),
        next_safe_action_ref: stringValue(workorder.next_safe_action_ref),
        route_requires_domain_or_app_payload:
          workorder.route_requires_domain_or_app_payload === true,
        required_operator_payload_refs: stringList(workorder.required_operator_payload_refs),
        payload_path_policy: stringValue(workorder.payload_path_policy),
        accepted_payload_paths: record(workorder.accepted_payload_paths),
        payload_preflight_policy: stringValue(workorder.payload_preflight_policy),
        payload_preflight_error_code: stringValue(workorder.payload_preflight_error_code),
        payload_preflight_blocked_error_kind:
          stringValue(workorder.payload_preflight_blocked_error_kind),
        required_evidence_refs: stringList(workorder.required_evidence_refs),
        required_return_shapes: stringList(workorder.required_return_shapes),
        can_execute_domain_action: false,
        can_create_owner_receipt: false,
        can_close_domain_ready: false,
        can_claim_production_ready: false,
        full_detail_section: 'domain_dispatch_evidence',
      });
    }
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
      required_return_shapes: stringList(group.required_return_shapes),
      payload_path_policy: stringValue(group.payload_path_policy),
      accepted_payload_paths: record(group.accepted_payload_paths),
      owner_payload_workorder: record(group.owner_payload_workorder),
      empty_payload_template_is_success_evidence:
        group.empty_payload_template_is_success_evidence === true,
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
      owner_source_id: stringValue(item.owner_source_id),
      owner_id_policy: stringValue(item.owner_id_policy),
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
  const balancedSteps = balancedAttentionItems(steps);
  return {
    surface_kind: 'opl_app_drilldown_evidence_next_steps',
    projection_policy:
      'operator_guidance_only_no_safe_action_creation_no_domain_ready_claim',
    selection_policy: balancedSteps.selection_policy,
    items: balancedSteps.items,
    omitted_count: balancedSteps.omitted_count,
    total_count: balancedSteps.total_count,
    next_owner: steps.length > 0 ? nextOwner : null,
    payload_owner: steps.length > 0 ? 'domain_repository_or_app_live_operator' : null,
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
    codex_app_runtime_role: record(drilldown.codex_app_runtime_role),
    next_safe_action: summarizeSelectedSafeAction(nextAction),
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

type AppOperatorDrilldownDetailResult<T extends JsonRecord> = T & {
  detail_level: AppOperatorDrilldownDetailLevel;
  projection_detail_policy: string;
  full_detail_args?: string[];
  attention_first_payload: ReturnType<typeof buildAttentionFirstPayload>;
};

export function applyAppOperatorDrilldownDetail<T extends JsonRecord>(
  drilldown: T,
  detailLevel: AppOperatorDrilldownDetailLevel,
): AppOperatorDrilldownDetailResult<T> {
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
    } as AppOperatorDrilldownDetailResult<T>;
  }

  return {
    ...omitSummaryDrilldownKeys(drilldown),
    detail_level: 'summary',
    projection_detail_policy: 'attention_first_default_full_refs_via_explicit_drilldown',
    full_detail_args: ['--detail', 'full'],
    attention_first_payload: buildAttentionFirstPayload(drilldown),
  } as AppOperatorDrilldownDetailResult<T>;
}
