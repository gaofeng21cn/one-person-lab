import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import { canonicalOwnerId } from '../../ledger/evidence-envelope.ts';
import {
  numberValue,
  record,
  recordList,
  stringList,
  stringValue,
} from './value-utils.ts';

const DEFAULT_ATTENTION_ITEM_LIMIT = 5;

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

export function safeActionRoutes(drilldown: JsonRecord) {
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

export function blockingItems(drilldown: JsonRecord) {
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

export function advisoryItems(drilldown: JsonRecord) {
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

export function missingEvidenceItems(drilldown: JsonRecord) {
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

export function providerHealth(drilldown: JsonRecord) {
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
    authority_boundary: record(drilldown.authority_boundary),
  };
}
