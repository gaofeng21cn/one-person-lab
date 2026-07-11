import { canonicalOwnerId } from '../../ledger/index.ts';
import {
  countValue as numberValue,
  record,
  recordList,
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

function providerRouteClosedByCurrentSlo(action: JsonRecord, operatorProjection: JsonRecord) {
  const actionKind = stringValue(action.action_kind) ?? '';
  if (
    actionKind === 'provider_slo_cadence_execution'
    && stringValue(action.provider_slo_dispatch_status) === 'cadence_current'
  ) {
    return true;
  }
  if (!actionKind.startsWith('provider_scheduler_')) {
    return false;
  }
  const summary = record(operatorProjection.summary);
  return stringValue(summary.provider_slo_cadence_window_status) === 'window_cadence_satisfied'
    && stringValue(summary.provider_slo_capability_status) === 'capability_slo_satisfied'
    && numberValue(summary.provider_slo_cadence_window_missing_receipt_count) === 0
    && numberValue(summary.provider_slo_cadence_window_observed_receipt_count) > 0;
}

function legacyCleanupSourceDomain(value: string | null) {
  const match = value?.match(/^opl:\/\/agents\/([^/]+)\/legacy-cleanup-plan$/);
  return match ? canonicalOwnerId(match[1] ?? '') : null;
}

function legacyCleanupRouteClosedByCurrentLedger(action: JsonRecord, operatorProjection: JsonRecord) {
  const actionKind = stringValue(action.action_kind) ?? '';
  if (actionKind !== 'legacy_cleanup_apply' && actionKind !== 'legacy_cleanup_verify') {
    return false;
  }
  if (typeof action.action_count === 'number' && action.action_count <= 0) {
    return true;
  }
  const sourceRef = stringValue(action.source_ref);
  if (!sourceRef) {
    return false;
  }
  const routeDomainId = firstString(action.domain_id, action.target_domain_id);
  const routeCanonicalDomainId = routeDomainId ? canonicalOwnerId(routeDomainId) : null;
  const routeSourceDomainId = legacyCleanupSourceDomain(sourceRef);
  return recordList(record(operatorProjection.lifecycle_ledger_refs).refs).some((entry) => (
    (
      stringValue(entry.source_ref) === sourceRef
      || (
        routeSourceDomainId !== null
        && legacyCleanupSourceDomain(stringValue(entry.source_ref)) === routeSourceDomainId
      )
    )
    && Boolean(stringValue(entry.receipt_ref))
    && (
      !routeCanonicalDomainId
      || canonicalOwnerId(firstString(entry.domain_id, entry.target_domain_id) ?? '')
        === routeCanonicalDomainId
    )
  ));
}

function stageEvidenceRouteClosedByDomainTypedBlocker(action: JsonRecord) {
  if (stringValue(action.action_kind) !== 'stage_production_evidence_receipt_record') {
    return false;
  }
  const obligationSummary = record(action.evidence_obligation_summary);
  return stringValue(action.stage_evidence_receipt_status) === 'verified'
    && numberValue(obligationSummary.open_count) === 0
    && numberValue(obligationSummary.blocked_by_domain_typed_blocker_count) > 0
    && stringList(action.verified_stage_evidence_receipt_refs).length > 0;
}

function providerMaintenanceRoute(action: JsonRecord) {
  const actionKind = stringValue(action.action_kind) ?? '';
  return actionKind === 'provider_slo_cadence_execution'
    || actionKind === 'provider_worker_start'
    || actionKind === 'provider_worker_restart'
    || actionKind === 'provider_scheduler_install'
    || actionKind === 'provider_scheduler_trigger'
    || actionKind === 'provider_scheduler_status';
}

function auditCleanupRoute(action: JsonRecord) {
  const actionKind = stringValue(action.action_kind) ?? '';
  return action.worklist_attention_class === 'audit_cleanup_lane'
    || action.ordinary_open_safe_action_attention === false
    || action.default_selected_action_eligible === false
    || action.default_planning_root_allowed === false
    || actionKind === 'legacy_cleanup_apply'
    || actionKind === 'legacy_cleanup_verify';
}

function productionEvidenceLaneRoute(action: JsonRecord) {
  const actionKind = stringValue(action.action_kind) ?? '';
  return actionKind === 'legacy_production_evidence_receipt_record'
    || actionKind === 'legacy_production_evidence_receipt_verify';
}

function routeIsClosedForDefaultCaller(action: JsonRecord, operatorProjection: JsonRecord) {
  const routeStatus = stringValue(action.route_status);
  const actionabilityStatus = stringValue(action.default_actionability_status);
  if (
    routeStatus?.startsWith('blocked_by_')
    || actionabilityStatus?.startsWith('blocked_by_')
    || action.can_submit_to_safe_action_shell === false
    || routeStatus?.startsWith('closed_by_')
    || actionabilityStatus?.startsWith('closed_by_')
    || action.default_actionable === false
    || auditCleanupRoute(action)
    || productionEvidenceLaneRoute(action)
  ) {
    return true;
  }
  return providerRouteClosedByCurrentSlo(action, operatorProjection)
    || stageEvidenceRouteClosedByDomainTypedBlocker(action)
    || legacyCleanupRouteClosedByCurrentLedger(action, operatorProjection);
}

function routeEligibleForDefaultSelectedAction(action: JsonRecord) {
  const actionKind = stringValue(action.action_kind) ?? '';
  return actionKind === 'app_release_user_path_evidence_receipt_verify'
    || actionKind === 'app_release_user_path_evidence_receipt_record'
    || actionKind === 'provider_worker_start'
    || actionKind === 'provider_worker_restart'
    || actionKind === 'provider_slo_cadence_execution'
    || actionKind === 'stage_production_attempt_request'
    || actionKind === 'stage_production_evidence_receipt_record'
    || actionKind === 'stage_production_evidence_receipt_verify'
    || actionKind === 'domain_dispatch_evidence_receipt_verify'
    || actionKind === 'domain_dispatch_evidence_receipt_record'
    || actionKind === 'external_evidence_receipt_record'
    || actionKind === 'external_evidence_receipt_verify'
    || actionKind === 'evidence_gate_receipt_record'
    || actionKind === 'evidence_gate_receipt_verify'
    || actionKind === 'provider_scheduler_install'
    || actionKind === 'provider_scheduler_trigger';
}

export function defaultSelectedSafeActionCandidates(
  actions: JsonRecord[],
  operatorProjection: JsonRecord,
  input: { ownerDeltaAvailable?: boolean } = {},
) {
  return actions.filter((action) =>
    routeEligibleForDefaultSelectedAction(action)
    && !routeIsClosedForDefaultCaller(action, operatorProjection)
    && !(input.ownerDeltaAvailable === true && providerMaintenanceRoute(action))
  );
}

function actionPriority(action: JsonRecord) {
  const actionKind = stringValue(action.action_kind);
  if (actionKind === 'app_release_user_path_evidence_receipt_verify') {
    return 0;
  }
  if (actionKind === 'app_release_user_path_evidence_receipt_record') {
    return 1;
  }
  if (actionKind === 'provider_worker_start'
    || actionKind === 'provider_worker_restart') {
    return 2;
  }
  if (actionKind === 'provider_slo_cadence_execution') {
    return 5;
  }
  if (actionKind === 'stage_production_attempt_request') {
    return 6;
  }
  if (actionKind === 'stage_production_evidence_receipt_record') {
    return 7;
  }
  if (actionKind === 'stage_production_evidence_receipt_verify') {
    return 8;
  }
  if (actionKind === 'domain_dispatch_evidence_receipt_verify') {
    return 9;
  }
  if (actionKind === 'domain_dispatch_evidence_receipt_record') {
    return 10;
  }
  if (actionKind === 'external_evidence_receipt_record'
    || actionKind === 'evidence_gate_receipt_record') {
    return 11;
  }
  if (actionKind === 'external_evidence_receipt_verify'
    || actionKind === 'evidence_gate_receipt_verify') {
    return 12;
  }
  if (actionKind === 'provider_scheduler_install') {
    return 13;
  }
  if (actionKind === 'provider_scheduler_trigger') {
    return 14;
  }
  return 16;
}

export function compareDefaultSelectedSafeActions(left: JsonRecord, right: JsonRecord) {
  return actionPriority(left) - actionPriority(right);
}
