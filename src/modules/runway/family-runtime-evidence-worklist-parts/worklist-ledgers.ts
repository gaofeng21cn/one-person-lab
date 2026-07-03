import type { buildProductionTailNextActionLedger } from '../../ledger/index.ts';
import { EVIDENCE_REQUIREMENT_MODEL_VERSION } from '../../ledger/index.ts';
import type { EvidenceRequirement } from '../../ledger/index.ts';
import { defaultCallerDeletionEvidenceCounts } from './default-caller-deletion-counts.ts';
import {
  DIAGNOSTIC_ONLY_STATUS,
  NOT_AUTHORIZED_CLAIMS,
  OPEN_SAFE_ACTION_PAYLOAD_REQUIREMENT_SEMANTICS,
  OPEN_WORKLIST_STATUS,
} from './constants.ts';
import {
  record,
  stringValue,
  uniqueStringList,
  type JsonRecord,
} from './json-utils.ts';

export function worklistCounts(
  worklistItems: JsonRecord[],
  openItems: JsonRecord[],
  rawOpenItems: JsonRecord[],
  closedItems: JsonRecord[],
  nextActionLedger: ReturnType<typeof buildProductionTailNextActionLedger>,
) {
  const stageReceiptFreshnessOpenWorkorderCount = rawOpenItems.filter((item) =>
    item.claim_scope === 'stage_production_evidence_receipt'
  ).length;
  const openSafeActionPayloadRequiredItemCount = openItems.filter((item) =>
    item.route_requires_domain_or_app_payload === true
  ).length;
  const progressFirstSupervisionItems = worklistItems.filter((item) =>
    item.claim_scope === 'progress_first_attempt_supervision'
  );
  const progressFirstSupervisionDiagnosticItemCount = progressFirstSupervisionItems.filter((item) =>
    item.status === DIAGNOSTIC_ONLY_STATUS
  ).length;
  return {
    open_worklist_item_count: openItems.length,
    closed_refs_only_item_count: closedItems.length,
    stage_receipt_freshness_open_workorder_count: stageReceiptFreshnessOpenWorkorderCount,
    worklist_item_count: worklistItems.length,
    closed_worklist_item_count: closedItems.length,
    open_safe_action_item_count: openItems.length,
    open_safe_action_payload_required_item_count: openSafeActionPayloadRequiredItemCount,
    open_safe_action_payload_free_item_count:
      openItems.length - openSafeActionPayloadRequiredItemCount,
    open_safe_action_payload_requirement_semantics:
      OPEN_SAFE_ACTION_PAYLOAD_REQUIREMENT_SEMANTICS,
    next_action_item_count: nextActionLedger.summary.next_action_item_count,
    next_action_group_count: nextActionLedger.summary.next_action_group_count,
    next_action_typed_blocker_ref_count: nextActionLedger.summary.typed_blocker_ref_count,
    next_action_unique_typed_blocker_ref_count: nextActionLedger.summary.unique_typed_blocker_ref_count,
    next_action_typed_blocker_group_count: nextActionLedger.summary.typed_blocker_group_count,
    next_action_typed_blocker_attention_semantics: nextActionLedger.summary.typed_blocker_attention_semantics,
    provider_scheduler_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'provider_scheduler_cadence'
    ).length,
    stage_production_caller_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'stage_production_caller_request'
    ).length,
    external_evidence_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'external_evidence_receipt'
    ).length,
    stage_production_evidence_receipt_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'stage_production_evidence_receipt'
    ).length,
    stage_production_evidence_receipt_requires_domain_or_app_payload_count:
      rawOpenItems.filter((item) =>
        item.claim_scope === 'stage_production_evidence_receipt'
        && item.route_requires_domain_or_app_payload === true
      ).length,
    progress_first_supervision_item_count: progressFirstSupervisionItems.length,
    progress_first_supervision_open_item_count:
      openItems.filter((item) => item.claim_scope === 'progress_first_attempt_supervision').length,
    progress_first_supervision_diagnostic_item_count:
      progressFirstSupervisionDiagnosticItemCount,
    progress_first_supervision_diagnostic_semantics:
      'attempt_query_is_read_only_operator_diagnostic_not_closeable_evidence_workorder',
    domain_dispatch_evidence_receipt_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'domain_dispatch_evidence_receipt'
    ).length,
    domain_dispatch_evidence_receipt_requires_domain_or_app_payload_count:
      rawOpenItems.filter((item) =>
        item.claim_scope === 'domain_dispatch_evidence_receipt'
        && item.route_requires_domain_or_app_payload === true
      ).length,
    evidence_gate_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'evidence_gate_receipt'
    ).length,
    legacy_cleanup_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'legacy_cleanup_ledger'
    ).length,
    ...defaultCallerDeletionEvidenceCounts(worklistItems),
    domain_ready_authorized: false,
    production_ready_authorized: false,
    not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
  };
}

export function buildEvidenceRequirementLedger(worklistItems: JsonRecord[]) {
  const requirements = worklistItems.map((item) => item.evidence_requirement as EvidenceRequirement);
  const domainIds = uniqueStringList(requirements.map((requirement) => requirement.domain_id));
  const ownerIds = uniqueStringList(requirements.map((requirement) => requirement.owner));
  const stageKeys = uniqueStringList(requirements.map((requirement) =>
    requirement.stage_id ? `${requirement.domain_id}:${requirement.stage_id}` : null
  ));
  return {
    surface_kind: 'opl_evidence_requirement_ledger',
    model_version: EVIDENCE_REQUIREMENT_MODEL_VERSION,
    ledger_policy:
      'canonical_refs_only_requirement_projection_without_domain_truth_artifact_or_memory_body_access',
    source_ref: '/family_runtime_evidence_worklist/worklist_items',
    summary: {
      requirement_count: requirements.length,
      open_requirement_count:
        requirements.filter((requirement) => requirement.status === 'open').length,
      closed_requirement_count:
        requirements.filter((requirement) => requirement.status === 'closed').length,
      typed_blocker_requirement_count:
        requirements.filter((requirement) => requirement.status === 'domain_owned_typed_blocker').length,
      domain_count: domainIds.length,
      owner_count: ownerIds.length,
      stage_count: stageKeys.length,
      domain_ids: domainIds,
      model_version: EVIDENCE_REQUIREMENT_MODEL_VERSION,
    },
    requirements,
    authority_boundary: {
      can_write_domain_truth: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact: false,
      can_authorize_domain_ready: false,
      can_authorize_quality_verdict: false,
      can_claim_production_ready: false,
      refs_only: true,
    },
  };
}

export function itemEligibleForNextActionLedger(item: JsonRecord) {
  const claimScope = stringValue(item.claim_scope);
  const status = stringValue(item.status);
  if (
    status !== OPEN_WORKLIST_STATUS
    || stringValue(item.worklist_lane) !== 'ordinary'
    || item.default_owner_delta_eligible !== true
  ) {
    return false;
  }
  if (
    item.ordinary_open_safe_action_attention === false
    || stringValue(item.worklist_attention_class) === 'audit_cleanup_lane'
  ) {
    return false;
  }
  if (claimScope === 'provider_scheduler_cadence' && status !== OPEN_WORKLIST_STATUS) {
    return false;
  }
  return true;
}

export function itemEligibleForOrdinaryOpenAttention(item: JsonRecord) {
  return stringValue(item.status) === OPEN_WORKLIST_STATUS
    && stringValue(item.worklist_lane) === 'ordinary'
    && item.default_owner_delta_eligible === true
    && item.ordinary_open_safe_action_attention !== false
    && stringValue(item.worklist_attention_class) !== 'audit_cleanup_lane';
}

export function itemClosedByRefsOnlyReceipt(item: JsonRecord) {
  const status = stringValue(item.status);
  return status === 'closed_by_receipt_ref'
    || status === 'closed_by_domain_owned_typed_blocker';
}

export function rawOpenOperatorRoutesForWorklist(
  operatorRoutes: JsonRecord[],
  rawOpenItems: JsonRecord[],
) {
  const rawOpenActionIds = new Set(rawOpenItems
    .map((item) => stringValue(item.action_id))
    .filter((actionId): actionId is string => Boolean(actionId)));
  return operatorRoutes.filter((route) => {
    const actionId = stringValue(route.action_id);
    return !actionId || rawOpenActionIds.has(actionId);
  });
}

export function diagnosticOperatorRoutesForWorklist(
  operatorRoutes: JsonRecord[],
  safeActionRoutes: JsonRecord[],
  routeMatchesDefaults: (route: JsonRecord) => boolean,
) {
  const safeActionIds = new Set(safeActionRoutes
    .map((route) => stringValue(route.action_id))
    .filter((actionId): actionId is string => Boolean(actionId)));
  return operatorRoutes.filter((route) => {
    const actionId = stringValue(route.action_id);
    return stringValue(route.action_kind) === 'progress_first_attempt_supervision'
      && actionId !== null
      && !safeActionIds.has(actionId)
      && routeMatchesDefaults(route);
  });
}

export function domainOwnerPayloadSummaryNamingHygieneBlockerCount(drilldown: JsonRecord) {
  const appEvidenceAfterContract =
    record(record(drilldown.attention_first_payload).evidence_after_contract);
  const domainOwnerPayloadSummaryAttention =
    record(appEvidenceAfterContract.domain_owner_payload_summary_attention);
  return {
    domainOwnerPayloadSummaryAttention,
    namingHygieneBlockerCount:
      typeof domainOwnerPayloadSummaryAttention.naming_hygiene_blocker_count === 'number'
        ? domainOwnerPayloadSummaryAttention.naming_hygiene_blocker_count
        : 0,
  };
}
