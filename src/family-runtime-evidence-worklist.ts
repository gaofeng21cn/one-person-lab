import type { FrameworkContracts } from './types.ts';
import { buildRuntimeTraySnapshot } from './runtime-tray-snapshot.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import { buildProductionTailNextActionLedger } from './production-evidence-tail-ledger.ts';
import { EVIDENCE_REQUIREMENT_MODEL_VERSION, evidenceRequirementFromTailItem } from './evidence-requirement.ts';
import type { EvidenceRequirement } from './evidence-requirement.ts';
import { readFamilyRuntimeLifecycleApplyReceipts } from './family-runtime-lifecycle-index.ts';
import { listExternalEvidenceReceipts } from './external-evidence-ledger.ts';
import { compactEvidenceEnvelopeProjection, canonicalOwnerId } from './evidence-envelope.ts';
import {
  buildDomainDispatchEvidenceWorkorderPacket,
  compactDomainDispatchEvidenceWorkorderAttentionItems,
  compactDomainDispatchEvidenceWorkorderGroupAttentionItems,
} from './domain-dispatch-evidence-workorder-packet.ts';
import { defaultCallerDeletionEvidenceRoutes } from './family-runtime-evidence-worklist-parts/default-caller-deletion-evidence-routes.ts';
import { attentionQueueItem, nextSafeActions } from './family-runtime-evidence-worklist-parts/attention-actions.ts';
import { buildZeroOpenCompletionGuard, zeroOpenCompletionGuardSummaryFields } from './family-runtime-evidence-worklist-parts/zero-open-completion-guard.ts';
import { operatorRoutesByActionId, payloadHandoffProjection, routeWithOperatorHandoff } from './family-runtime-evidence-worklist-parts/operator-route-handoff.ts';
import { readOnlyRouteMatchesDefaults } from './family-runtime-evidence-worklist-parts/route-defaults.ts';
import { domainDispatchRecordRouteAttemptIds, syncTerminalTemporalAttemptsForEvidenceWorklist, type EvidenceWorklistTemporalQuery } from './family-runtime-evidence-worklist-parts/terminal-observation-sync.ts';

type JsonRecord = Record<string, unknown>;

type EvidenceWorklistInput = {
  familyDefaults: boolean;
  providerKind: FamilyRuntimeProviderKind;
  executorKind: 'codex_cli';
  detailLevel?: 'summary' | 'full';
  runtimeSnapshot?: Awaited<ReturnType<typeof buildRuntimeTraySnapshot>>;
  queryTemporalStageAttemptReadModel?: EvidenceWorklistTemporalQuery;
};

const NOT_AUTHORIZED_CLAIMS = [
  'domain_truth_write',
  'domain_ready',
  'domain_ready_verdict',
  'quality_verdict',
  'artifact_authority',
  'artifact_authority_verdict',
  'memory_body_access',
  'production_ready',
  'submission_or_export_readiness_verdict',
  'domain_repo_physical_delete_authorization',
  'default_caller_delete_ready',
];

const OPEN_SAFE_ACTION_PAYLOAD_REQUIREMENT_SEMANTICS =
  'open_safe_action_payload_required_is_domain_or_app_live_refs_payload_subset_not_opl_self_closure';

const CLOSEOUT_ACTION_KINDS = new Set([
  'provider_scheduler_status',
  'provider_scheduler_install',
  'provider_scheduler_trigger',
  'provider_scheduler_tick',
  'stage_production_attempt_request',
  'stage_production_evidence_receipt_verify',
  'domain_dispatch_evidence_receipt_verify',
  'external_evidence_receipt_verify',
  'evidence_gate_receipt_verify',
  'legacy_cleanup_verify',
]);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function recordList(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
}

function countValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function uniqueStringList(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((entry): entry is string => Boolean(entry)))];
}

function commandRef(args: string[]) {
  if (args[0] === 'agents') {
    return `opl ${args.join(' ')}`;
  }
  return `opl family-runtime ${args.join(' ')}`;
}

function firstRef(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim();
      }
      if (isRecord(entry)) {
        const ref = stringValue(entry.ref) ?? stringValue(entry.source_ref);
        if (ref) {
          return ref;
        }
      }
    }
  }
  return null;
}

function freshnessRef(route: JsonRecord) {
  return stringValue(route.evidence_source_ref)
    ?? stringValue(route.source_ref)
    ?? firstRef(route.monitor_refs)
    ?? firstRef(route.runtime_event_refs)
    ?? firstRef(route.source_scope_refs)
    ?? stringValue(route.schedule_id)
    ?? '/runtime_tray_snapshot/app_operator_drilldown';
}

function readOnlyClaimScope(route: JsonRecord) {
  const actionKind = stringValue(route.action_kind) ?? 'operator_action';
  if (actionKind === 'stage_production_attempt_request') {
    return 'stage_production_caller_request';
  }
  if (actionKind.startsWith('stage_production_evidence_')) {
    return 'stage_production_evidence_receipt';
  }
  if (actionKind.startsWith('domain_dispatch_evidence_')) {
    return 'domain_dispatch_evidence_receipt';
  }
  if (actionKind.startsWith('external_evidence')) {
    return 'external_evidence_receipt';
  }
  if (actionKind.startsWith('evidence_gate')) {
    return 'evidence_gate_receipt';
  }
  if (actionKind.startsWith('legacy_cleanup')) {
    return 'legacy_cleanup_ledger';
  }
  if (actionKind.startsWith('default_caller_deletion_')) {
    return 'default_caller_deletion_evidence';
  }
  if (actionKind.startsWith('provider_scheduler')) {
    return 'provider_scheduler_cadence';
  }
  return actionKind;
}

function readOnlyExpectedRefs(route: JsonRecord) {
  return [
    ...stringList(route.expected_receipt_refs),
    ...stringList(route.missing_production_evidence),
    ...stringList(route.required_evidence_refs),
    ...stringList(route.monitor_refs),
    ...stringList(route.runtime_event_refs),
  ];
}

function refsOnlyClosureReceipt(route: JsonRecord, drilldown: JsonRecord) {
  const actionKind = stringValue(route.action_kind) ?? '';
  const waitsForDomainOrAppPayload = route.route_requires_domain_or_app_payload === true
    && route.can_close_without_domain_or_app_payload === false;
  const isDomainDispatchEvidenceRoute = actionKind.startsWith('domain_dispatch_evidence_');
  if (waitsForDomainOrAppPayload && !isDomainDispatchEvidenceRoute) {
    return null;
  }

  if (actionKind.startsWith('provider_scheduler_')) {
    const summary = record(drilldown.summary);
    const cadenceSatisfied = stringValue(summary.provider_slo_cadence_window_status)
      === 'window_cadence_satisfied';
    const capabilitySatisfied = stringValue(summary.provider_slo_capability_status)
      === 'capability_slo_satisfied';
    const observedReceiptCount = typeof summary.provider_slo_cadence_window_observed_receipt_count === 'number'
      ? summary.provider_slo_cadence_window_observed_receipt_count
      : 0;
    if (!cadenceSatisfied || !capabilitySatisfied || observedReceiptCount <= 0) {
      return null;
    }
    return {
      status: 'closed_by_receipt_ref',
      receipt_ref: 'opl://family-runtime/provider-slo/cadence-window/current',
      receipt_refs: [
        'opl://family-runtime/provider-slo/cadence-window/current',
        'opl://family-runtime/provider-slo/capability/current',
      ],
      freshness_ref: '/runtime_tray_snapshot/app_operator_drilldown/summary/provider_slo_cadence_window_status',
      closure_reason:
        'Temporal provider cadence and capability SLO receipts are satisfied in the OPL-owned provider read model.',
    };
  }

  if (actionKind === 'legacy_cleanup_apply' || actionKind === 'legacy_cleanup_verify') {
    const targetDomainId = stringValue(route.domain_id);
    if (!targetDomainId) {
      return null;
    }
    const args = stringList(route.opl_cli_args);
    const sourceRefIndex = args.indexOf('--source-ref');
    const sourceRef = sourceRefIndex >= 0 ? stringValue(args[sourceRefIndex + 1]) : null;
    const receiptIndex = readFamilyRuntimeLifecycleApplyReceipts({
      target_domain_id: targetDomainId,
      source_ref: sourceRef ?? undefined,
    });
    const receipts = recordList(receiptIndex.receipts).filter((receipt) =>
      stringValue(receipt.status) === 'applied'
    );
    if (receipts.length === 0) {
      return null;
    }
    const receiptRefs = receipts
      .map((receipt) => stringValue(receipt.receipt_ref))
      .filter((ref): ref is string => Boolean(ref));
    return {
      status: 'closed_by_receipt_ref',
      receipt_ref: receiptRefs[0] ?? null,
      receipt_refs: receiptRefs,
      freshness_ref: '/runtime_tray_snapshot/app_operator_drilldown/lifecycle_ledger_refs',
      closure_reason:
        'OPL refs-only lifecycle cleanup ledger has an applied receipt for this legacy cleanup plan.',
    };
  }

  if (
    actionKind.startsWith('external_evidence_')
    || actionKind.startsWith('evidence_gate_')
    || actionKind.startsWith('stage_production_evidence_')
    || actionKind.startsWith('domain_dispatch_evidence_')
  ) {
    const domainId = stringValue(route.domain_id);
    const requestId = stringValue(route.request_id);
    if (!domainId || !requestId) {
      return null;
    }
    const receipts = listExternalEvidenceReceipts({
      domain_id: domainId,
      request_id: requestId,
    });
    const verifiedReceipt = receipts.find((receipt) => receipt.receipt_status === 'verified');
    if (!verifiedReceipt) {
      return null;
    }
    const allReceiptRefs = [
      verifiedReceipt.receipt_ref,
      ...verifiedReceipt.receipt_refs,
      ...verifiedReceipt.evidence_refs,
      ...verifiedReceipt.no_regression_refs,
      ...verifiedReceipt.release_dist_refs,
      ...verifiedReceipt.direct_hosted_parity_refs,
      ...verifiedReceipt.owner_chain_refs,
    ].filter(Boolean);
    if (verifiedReceipt.typed_blocker_refs.length > 0 && verifiedReceipt.receipt_refs.length === 0) {
      return {
        status: 'closed_by_domain_owned_typed_blocker',
        receipt_ref: verifiedReceipt.receipt_ref,
        receipt_refs: [verifiedReceipt.receipt_ref, ...verifiedReceipt.typed_blocker_refs],
        typed_blocker_ref: verifiedReceipt.typed_blocker_refs[0],
        typed_blocker_refs: verifiedReceipt.typed_blocker_refs,
        freshness_ref: actionKind.startsWith('domain_dispatch_evidence_')
          ? '/runtime_tray_snapshot/app_operator_drilldown/domain_dispatch_evidence'
          : '/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs',
        closure_reason:
          isDomainDispatchEvidenceRoute
            ? 'OPL refs-only evidence ledger verified a domain-owned typed blocker for this domain dispatch evidence request; this records request closure without claiming domain or production readiness.'
            : 'OPL refs-only evidence ledger verified a domain-owned typed blocker for this external evidence request; this records request closure without claiming production success.',
      };
    }
    return {
      status: 'closed_by_receipt_ref',
      receipt_ref: verifiedReceipt.receipt_ref,
      receipt_refs: allReceiptRefs,
      typed_blocker_ref: verifiedReceipt.typed_blocker_refs[0] ?? null,
      typed_blocker_refs: verifiedReceipt.typed_blocker_refs,
      freshness_ref: isDomainDispatchEvidenceRoute
        ? '/runtime_tray_snapshot/app_operator_drilldown/domain_dispatch_evidence'
        : '/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs',
      closure_reason:
        isDomainDispatchEvidenceRoute
          ? 'OPL refs-only evidence ledger verified domain dispatch owner-chain refs without claiming domain or production readiness.'
          : 'OPL refs-only evidence ledger verified a domain-owned receipt for this external evidence request.',
    };
  }

  return null;
}

function readOnlyWorklistItem(route: JsonRecord, index: number, drilldown: JsonRecord) {
  const actionId = stringValue(route.action_id) ?? `route:${index + 1}`;
  const actionKind = stringValue(route.action_kind) ?? 'operator_action';
  const claimScope = readOnlyClaimScope(route);
  const routeOwner = stringValue(route.owner) ?? stringValue(route.action_owner) ?? 'opl';
  const routeDomainId = stringValue(route.domain_id) ?? stringValue(route.target_domain_id);
  const evidenceOwner = claimScope === 'domain_dispatch_evidence_receipt' && routeDomainId
    ? canonicalOwnerId(routeDomainId)
    : routeOwner;
  const typedBlockerRefs = stringList(route.typed_blocker_refs);
  const freshnessRefs = [
    ...stringList(route.freshness_refs),
    ...stringList(route.monitor_refs),
  ];
  const closure = refsOnlyClosureReceipt(route, drilldown);
  const itemStatus = stringValue(closure?.status) ?? 'open_safe_action_request_route_available';
  const closureReceiptRef = stringValue(closure?.receipt_ref);
  const closureReceiptRefs = stringList(closure?.receipt_refs);
  const closureFreshnessRef = stringValue(closure?.freshness_ref);
  const closureTypedBlockerRefs = stringList(closure?.typed_blocker_refs);
  const closureTypedBlockerRef = stringValue(closure?.typed_blocker_ref);
  const allTypedBlockerRefs = [
    ...typedBlockerRefs,
    ...closureTypedBlockerRefs,
  ];
  const item = {
    item_id: `evidence-worklist:${actionId}`,
    tail_id: `evidence-worklist:${actionId}`,
    tail_item: actionKind,
    action_id: actionId,
    action_kind: actionKind,
    claim_scope: claimScope,
    owner: evidenceOwner,
    route_owner: routeOwner,
    safe_action_owner: routeOwner,
    domain_id: routeDomainId,
    stage_id: stringValue(route.stage_id),
    mode: actionKind.endsWith('_verify') || actionKind === 'provider_scheduler_status'
      ? 'verify'
      : 'request_or_apply_via_safe_action',
    status: itemStatus,
    worklist_item_is_completion_claim: false,
    route_status: stringValue(route.route_status) ?? 'request_route_available',
    route_status_detail: stringValue(route.route_status_detail),
    route_semantics: 'open_safe_action_request_apply_verify_route',
    receipt_ref: closureReceiptRef,
    receipt_refs: closureReceiptRefs,
    typed_blocker_ref: typedBlockerRefs[0] ?? closureTypedBlockerRef ?? null,
    typed_blocker_refs: allTypedBlockerRefs,
    worklist_status_detail: itemStatus === 'closed_by_domain_owned_typed_blocker'
      ? 'closed_by_domain_owned_typed_blocker_ref'
      : itemStatus === 'closed_by_receipt_ref'
        ? readOnlyClaimScope(route) === 'provider_scheduler_cadence'
          ? 'closed_by_opl_provider_slo_receipt'
          : readOnlyClaimScope(route) === 'legacy_cleanup_ledger'
            ? 'closed_by_opl_cleanup_ledger_receipt'
            : 'closed_by_opl_external_evidence_ledger_receipt'
        : null,
    replay_ref: stringValue(route.ref)
      ?? stringValue(route.action_ref)
      ?? `opl runtime action execute --action ${actionId}`,
    freshness_ref: freshnessRefs[0] ?? closureFreshnessRef ?? freshnessRef(route),
    freshness_refs: freshnessRefs,
    expected_refs: readOnlyExpectedRefs(route),
    closure_reason: stringValue(closure?.closure_reason),
    open_reason: stringValue(route.open_reason),
    payload_requirement: stringValue(route.payload_requirement),
    payload_owner: stringValue(route.payload_owner),
    ...payloadHandoffProjection(route, actionKind),
    route_requires_domain_or_app_payload: route.route_requires_domain_or_app_payload === true,
    can_close_without_domain_or_app_payload: route.can_close_without_domain_or_app_payload !== false,
    opl_generated_receipt_policy: stringValue(route.opl_generated_receipt_policy),
    blocked_reason: stringValue(route.blocked_reason),
    not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
  };
  return {
    ...item,
    evidence_requirement_model: EVIDENCE_REQUIREMENT_MODEL_VERSION,
    evidence_requirement: evidenceRequirementFromTailItem(item),
  };
}

function externalEvidenceReceiptWorklistItems(drilldown: JsonRecord) {
  const domainEvidence = record(drilldown.domain_evidence_request_refs);
  const receipts = [
    ...recordList(domainEvidence.external_receipts),
    ...recordList(domainEvidence.evidence_gate_receipts),
  ].filter((receipt) => stringValue(receipt.receipt_status) === 'verified');
  return receipts.map((receipt, index) => {
    const role = stringValue(receipt.role) ?? 'external_evidence_receipt';
    const domainId = stringValue(receipt.domain_id);
    const requestId = stringValue(receipt.request_id) ?? stringValue(receipt.gate_id) ?? `receipt:${index + 1}`;
    const receiptRef = stringValue(receipt.ref) ?? stringValue(receipt.receipt_ref);
    const typedBlockerRefs = stringList(receipt.typed_blocker_refs);
    const receiptRefs = [
      receiptRef,
      ...stringList(receipt.domain_receipt_refs),
      ...stringList(receipt.evidence_refs),
      ...stringList(receipt.no_regression_refs),
      ...stringList(receipt.release_dist_refs),
      ...stringList(receipt.direct_hosted_parity_refs),
      ...stringList(receipt.owner_chain_refs),
    ].filter((ref): ref is string => Boolean(ref));
    const typedBlockerOnly = typedBlockerRefs.length > 0
      && stringList(receipt.domain_receipt_refs).length === 0;
    const claimScope = role === 'evidence_gate_receipt'
      ? 'evidence_gate_receipt'
      : 'external_evidence_receipt';
    const item = {
      item_id: `evidence-worklist:${role}:${domainId ?? 'domain'}:${requestId}:verified`,
      tail_id: `evidence-worklist:${role}:${domainId ?? 'domain'}:${requestId}:verified`,
      tail_item: role,
      action_id: `${role}:${domainId ?? 'domain'}:${requestId}:verified`,
      action_kind: typedBlockerOnly
        ? 'domain_owned_typed_blocker_verified'
        : `${role}_verified`,
      claim_scope: claimScope,
      owner: 'opl',
      route_owner: 'opl',
      safe_action_owner: 'opl',
      domain_id: domainId,
      stage_id: null,
      mode: 'verify',
      status: typedBlockerOnly
        ? 'closed_by_domain_owned_typed_blocker'
        : 'closed_by_receipt_ref',
      worklist_item_is_completion_claim: false,
      route_status: 'receipt_verified',
      route_status_detail: null,
      route_semantics: 'verified_refs_only_receipt_projection',
      receipt_ref: receiptRef,
      receipt_refs: receiptRefs,
      typed_blocker_ref: typedBlockerRefs[0] ?? null,
      typed_blocker_refs: typedBlockerRefs,
      worklist_status_detail: typedBlockerOnly
        ? 'closed_by_domain_owned_typed_blocker_ref'
        : 'closed_by_opl_external_evidence_ledger_receipt',
      replay_ref: receiptRef ?? `/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs`,
      freshness_ref: '/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs',
      freshness_refs: [],
      expected_refs: [],
      closure_reason: typedBlockerOnly
        ? 'OPL refs-only evidence ledger verified a domain-owned typed blocker for this evidence request; this does not claim production success.'
        : 'OPL refs-only evidence ledger verified a domain-owned evidence receipt.',
      open_reason: null,
      payload_requirement: null,
      payload_owner: 'domain_repository_or_app_live_operator',
      route_requires_domain_or_app_payload: false,
      can_close_without_domain_or_app_payload: true,
      opl_generated_receipt_policy: null,
      blocked_reason: null,
      not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
    };
    return {
      ...item,
      evidence_requirement_model: EVIDENCE_REQUIREMENT_MODEL_VERSION,
      evidence_requirement: evidenceRequirementFromTailItem(item),
    };
  });
}

function domainDispatchReceiptWorklistItems(drilldown: JsonRecord) {
  const attempts = recordList(record(drilldown.domain_dispatch_evidence).attempts)
    .filter((attempt) => stringValue(attempt.dispatch_evidence_receipt_status) === 'verified');
  return attempts.flatMap((attempt, index) => {
    const domainId = stringValue(attempt.domain_id);
    const stageAttemptId = stringValue(attempt.stage_attempt_id) ?? `attempt:${index + 1}`;
    const receiptRefs = [
      ...stringList(attempt.verified_dispatch_evidence_receipt_refs),
      ...stringList(attempt.owner_receipt_refs),
      ...stringList(attempt.no_regression_evidence_refs),
    ];
    const typedBlockerRefs = stringList(attempt.typed_blocker_refs);
    if (receiptRefs.length === 0 && typedBlockerRefs.length === 0) {
      return [];
    }
    const typedBlockerOnly = typedBlockerRefs.length > 0
      && stringList(attempt.owner_receipt_refs).length === 0;
    const item = {
      item_id: `evidence-worklist:domain-dispatch:${domainId ?? 'domain'}:${stageAttemptId}:verified`,
      tail_id: `evidence-worklist:domain-dispatch:${domainId ?? 'domain'}:${stageAttemptId}:verified`,
      tail_item: 'domain_dispatch_evidence_receipt',
      action_id: `domain_dispatch:${domainId ?? 'domain'}:${stageAttemptId}:verify`,
      action_kind: typedBlockerOnly
        ? 'domain_dispatch_evidence_typed_blocker_verified'
        : 'domain_dispatch_evidence_receipt_verified',
      claim_scope: 'domain_dispatch_evidence_receipt',
      owner: 'opl',
      route_owner: 'opl',
      safe_action_owner: 'opl',
      domain_id: domainId,
      stage_id: stringValue(attempt.stage_id),
      mode: 'verify',
      status: typedBlockerOnly
        ? 'closed_by_domain_owned_typed_blocker'
        : 'closed_by_receipt_ref',
      worklist_item_is_completion_claim: false,
      route_status: 'receipt_verified',
      route_status_detail: null,
      route_semantics: 'verified_refs_only_domain_dispatch_receipt_projection',
      receipt_ref: stringList(attempt.verified_dispatch_evidence_receipt_refs)[0] ?? null,
      receipt_refs: uniqueStringList(receiptRefs),
      typed_blocker_ref: typedBlockerRefs[0] ?? null,
      typed_blocker_refs: typedBlockerRefs,
      worklist_status_detail: typedBlockerOnly
        ? 'closed_by_domain_owned_typed_blocker_ref'
        : 'closed_by_opl_external_evidence_ledger_receipt',
      replay_ref: stringValue(attempt.ref)
        ?? '/runtime_tray_snapshot/app_operator_drilldown/domain_dispatch_evidence',
      freshness_ref: '/runtime_tray_snapshot/app_operator_drilldown/domain_dispatch_evidence',
      freshness_refs: [],
      expected_refs: [],
      closure_reason: typedBlockerOnly
        ? 'OPL refs-only evidence ledger verified a domain-owned typed blocker for this domain dispatch evidence request; this does not claim domain or production readiness.'
        : 'OPL refs-only evidence ledger verified domain dispatch owner-chain refs without claiming domain or production readiness.',
      open_reason: null,
      payload_requirement: null,
      payload_owner: 'domain_repository_or_app_live_operator',
      route_requires_domain_or_app_payload: false,
      can_close_without_domain_or_app_payload: true,
      opl_generated_receipt_policy: null,
      blocked_reason: null,
      not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
    };
    return [{
      ...item,
      evidence_requirement_model: EVIDENCE_REQUIREMENT_MODEL_VERSION,
      evidence_requirement: evidenceRequirementFromTailItem(item),
    }];
  });
}

function authorityBoundary() {
  return {
    opl: 'evidence_worklist_derived_attention_lens_for_refs_only_safe_action_routes',
    provider: 'temporal_scheduler_and_provider_slo_receipt_owner',
    domain: 'truth_quality_artifact_domain_ready_owner',
    can_write_domain_truth: false,
    can_read_memory_body: false,
    can_read_artifact_body: false,
    can_mutate_artifact: false,
    can_authorize_domain_ready: false,
    can_authorize_quality_verdict: false,
    can_authorize_artifact_or_export_verdict: false,
    can_claim_production_ready: false,
    provider_completion_is_domain_ready: false,
  };
}

function worklistCounts(
  worklistItems: JsonRecord[],
  openItems: JsonRecord[],
  closedItems: JsonRecord[],
  nextActionLedger: ReturnType<typeof buildProductionTailNextActionLedger>,
) {
  const stageReceiptFreshnessOpenWorkorderCount = openItems.filter((item) =>
    item.claim_scope === 'stage_production_evidence_receipt'
  ).length;
  const openSafeActionPayloadRequiredItemCount = openItems.filter((item) =>
    item.route_requires_domain_or_app_payload === true
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
      worklistItems.filter((item) =>
        item.claim_scope === 'stage_production_evidence_receipt'
        && item.route_requires_domain_or_app_payload === true
      ).length,
    domain_dispatch_evidence_receipt_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'domain_dispatch_evidence_receipt'
    ).length,
    domain_dispatch_evidence_receipt_requires_domain_or_app_payload_count:
      worklistItems.filter((item) =>
        item.claim_scope === 'domain_dispatch_evidence_receipt'
        && item.route_requires_domain_or_app_payload === true
      ).length,
    evidence_gate_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'evidence_gate_receipt'
    ).length,
    legacy_cleanup_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'legacy_cleanup_ledger'
    ).length,
    default_caller_deletion_evidence_item_count: worklistItems.filter((item) =>
      item.claim_scope === 'default_caller_deletion_evidence'
    ).length,
    default_caller_deletion_domain_owner_receipt_or_typed_blocker_missing_count:
      worklistItems.filter((item) =>
        item.claim_scope === 'default_caller_deletion_evidence'
        && item.action_kind === 'default_caller_deletion_domain_owner_receipt_or_typed_blocker_request'
      ).length,
    default_caller_deletion_no_forbidden_write_missing_count:
      worklistItems.filter((item) =>
        item.claim_scope === 'default_caller_deletion_evidence'
        && item.action_kind === 'default_caller_deletion_no_forbidden_write_proof_request'
      ).length,
    default_caller_deletion_tombstone_or_provenance_missing_count:
      worklistItems.filter((item) =>
        item.claim_scope === 'default_caller_deletion_evidence'
        && item.action_kind === 'default_caller_deletion_tombstone_or_provenance_ref_request'
      ).length,
    domain_ready_authorized: false,
    production_ready_authorized: false,
    not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
  };
}

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

function buildStageEvidenceWorkorderPacket(operatorRoutes: JsonRecord[]) {
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

function compactStageEvidenceWorkorderAttentionItems(
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

function buildEvidenceRequirementLedger(worklistItems: JsonRecord[]) {
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

export async function runFamilyRuntimeEvidenceWorklist(
  contracts: FrameworkContracts,
  input: EvidenceWorklistInput,
) {
  const preliminarySnapshot = input.runtimeSnapshot
    ?? await buildRuntimeTraySnapshot(contracts, {
      appOperatorDrilldownDetailLevel: 'full',
      providerKind: input.providerKind,
    });
  const terminalObservationSync = await syncTerminalTemporalAttemptsForEvidenceWorklist({
    ...input,
    candidateStageAttemptIds: input.runtimeSnapshot
      ? []
      : domainDispatchRecordRouteAttemptIds(preliminarySnapshot),
  });
  const snapshot = input.runtimeSnapshot
    ? preliminarySnapshot
    : countValue(record(terminalObservationSync).synced_attempt_count) > 0
      ? await buildRuntimeTraySnapshot(contracts, {
          appOperatorDrilldownDetailLevel: 'full',
          providerKind: input.providerKind,
        })
      : preliminarySnapshot;
  const drilldown = record(snapshot.runtime_tray_snapshot.app_operator_drilldown);
  const bridge = record(drilldown.app_execution_bridge);
  const operatorActionRouting = record(drilldown.operator_action_routing_refs);
  const operatorRoutes = recordList(operatorActionRouting.refs);
  const operatorRouteByActionId = operatorRoutesByActionId(operatorRoutes);
  const routes = recordList(bridge.safe_action_routes).filter((route) =>
    readOnlyRouteMatchesDefaults(route, input)
  );
  const worklistItems = [
    ...routes.map((route, index) =>
      readOnlyWorklistItem(routeWithOperatorHandoff(route, operatorRouteByActionId), index, drilldown)
    ),
    ...externalEvidenceReceiptWorklistItems(drilldown),
    ...domainDispatchReceiptWorklistItems(drilldown),
    ...defaultCallerDeletionEvidenceRoutes(drilldown, NOT_AUTHORIZED_CLAIMS)
      .map((route, index) => readOnlyWorklistItem(route, routes.length + index, drilldown)),
  ];
  const openItems = worklistItems.filter((item) =>
    item.status === 'open_safe_action_request_route_available'
  );
  const closedItems = worklistItems.filter((item) =>
    item.status !== 'open_safe_action_request_route_available'
  );
  const openActionIds = new Set(openItems
    .map((item) => stringValue(item.action_id))
    .filter((actionId): actionId is string => Boolean(actionId)));
  const openOperatorRoutes = operatorRoutes.filter((route) => {
    const actionId = stringValue(route.action_id);
    return !actionId || openActionIds.has(actionId);
  });
  const nextActionLedger = buildProductionTailNextActionLedger({
    surfaceKind: 'opl_family_runtime_evidence_worklist_next_action_ledger',
    sourceTailSummary: {
      tail_item_count: worklistItems.length,
      open_tail_item_count: openItems.length,
      typed_blocker_tail_item_count:
        worklistItems.filter((item) => item.status === 'closed_by_domain_owned_typed_blocker').length,
      blocking_tail_item_count: 0,
      closed_tail_item_count: closedItems.length,
    },
    tailItems: worklistItems,
    sourceRef: '/family_runtime_evidence_worklist/worklist_items',
  });
  const evidenceRequirementLedger = buildEvidenceRequirementLedger(worklistItems);
  const stageEvidenceWorkorderPacket = buildStageEvidenceWorkorderPacket(openOperatorRoutes);
  const stageEvidenceWorkorderSummary = record(stageEvidenceWorkorderPacket.summary);
  const stageEvidenceWorkorderAttentionItems =
    compactStageEvidenceWorkorderAttentionItems(stageEvidenceWorkorderPacket);
  const domainDispatchEvidenceWorkorderPacket =
    buildDomainDispatchEvidenceWorkorderPacket(openOperatorRoutes);
  const domainDispatchEvidenceWorkorderSummary =
    record(domainDispatchEvidenceWorkorderPacket.summary);
  const domainDispatchEvidenceWorkorderGroupAttentionItems =
    compactDomainDispatchEvidenceWorkorderGroupAttentionItems(domainDispatchEvidenceWorkorderPacket);
  const domainDispatchEvidenceWorkorderAttentionItems =
    compactDomainDispatchEvidenceWorkorderAttentionItems(domainDispatchEvidenceWorkorderPacket);
  const evidenceEnvelope = record(drilldown.evidence_envelope);
  const compactEvidenceEnvelope = compactEvidenceEnvelopeProjection(evidenceEnvelope);
  const zeroOpenWorklistGuard = buildZeroOpenCompletionGuard({
    openWorklistItemCount: openItems.length,
    evidenceEnvelopeSummary: record(compactEvidenceEnvelope.summary),
  });
  const counts = {
    ...worklistCounts(worklistItems, openItems, closedItems, nextActionLedger),
    ...zeroOpenCompletionGuardSummaryFields(zeroOpenWorklistGuard),
    stage_source_scope_missing_workorder_count:
      countValue(stageEvidenceWorkorderSummary.source_scope_missing_workorder_count),
    stage_runtime_event_missing_workorder_count:
      countValue(stageEvidenceWorkorderSummary.runtime_event_missing_workorder_count),
    stage_source_scope_missing_ref_count:
      countValue(stageEvidenceWorkorderSummary.source_scope_missing_ref_count),
    stage_runtime_event_missing_ref_count:
      countValue(stageEvidenceWorkorderSummary.runtime_event_missing_ref_count),
    domain_dispatch_evidence_workorder_count:
      countValue(domainDispatchEvidenceWorkorderSummary.workorder_count),
    domain_dispatch_evidence_workorder_domain_count:
      countValue(domainDispatchEvidenceWorkorderSummary.domain_count),
    domain_dispatch_evidence_workorder_stage_attempt_count:
      countValue(domainDispatchEvidenceWorkorderSummary.stage_attempt_count),
    domain_dispatch_evidence_workorder_required_operator_payload_ref_count:
      countValue(domainDispatchEvidenceWorkorderSummary.required_operator_payload_ref_count),
    domain_dispatch_evidence_workorder_required_evidence_ref_count:
      countValue(domainDispatchEvidenceWorkorderSummary.required_evidence_ref_count),
  };
  const detailLevel = input.detailLevel ?? 'summary';
  const stageReceiptFreshnessOpenWorkorderCount = openItems.filter((item) =>
    item.claim_scope === 'stage_production_evidence_receipt'
  ).length;
  const commonPayload = {
    surface_kind: 'opl_family_runtime_evidence_worklist',
    surface_role: 'derived_operator_attention_lens',
    worklist_role: 'refs_only_operator_evidence_worklist',
    lens_policy: 'derived_attention_lens_over_open_safe_action_request_apply_verify_routes',
    worklist_mode: 'refs_only_summary',
    worklist_summary_mode: 'dry_run_summary',
    command: 'evidence-worklist',
    family_defaults: input.familyDefaults === true,
    selected_provider: input.providerKind,
    effective_provider: stringValue(record(snapshot.runtime_tray_snapshot.runtime_health).provider_kind)
      ?? input.providerKind,
    selected_executor_kind: input.executorKind,
    route_source: 'opl runtime app-operator-drilldown --detail full',
    action_execution_surface: 'opl runtime action execute',
    orchestration_policy:
      'reads_app_operator_safe_action_routes_and_reports_refs_only_closure_without_domain_authority',
    apply_supported: false,
    apply_policy:
      'batch_apply_is_not_supported_here; execute individual refs-only safe action routes through opl runtime action execute',
    summary: counts,
    open_worklist_item_count: openItems.length,
    closed_refs_only_item_count: closedItems.length,
    open_safe_action_payload_required_item_count:
      counts.open_safe_action_payload_required_item_count,
    open_safe_action_payload_free_item_count:
      counts.open_safe_action_payload_free_item_count,
    open_safe_action_payload_requirement_semantics:
      counts.open_safe_action_payload_requirement_semantics,
    stage_receipt_freshness_open_workorder_count: stageReceiptFreshnessOpenWorkorderCount,
    stage_evidence_workorder_packet_summary: stageEvidenceWorkorderPacket.summary,
    stage_evidence_workorder_attention_items: stageEvidenceWorkorderAttentionItems,
    domain_dispatch_evidence_workorder_packet_summary:
      domainDispatchEvidenceWorkorderPacket.summary,
    domain_dispatch_evidence_workorder_group_attention_policy:
      'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
    domain_dispatch_evidence_workorder_group_attention_items:
      domainDispatchEvidenceWorkorderGroupAttentionItems,
    domain_dispatch_evidence_workorder_attention_items:
      domainDispatchEvidenceWorkorderAttentionItems,
    source_refs: {
      app_operator_drilldown_ref: '/runtime_tray_snapshot/app_operator_drilldown',
      app_execution_bridge_ref: '/runtime_tray_snapshot/app_operator_drilldown/app_execution_bridge',
      evidence_envelope_ref: '/runtime_tray_snapshot/app_operator_drilldown/evidence_envelope',
      terminal_observation_sync_ref: '/family_runtime_evidence_worklist/terminal_observation_sync',
    },
    terminal_observation_sync: terminalObservationSync,
    evidence_envelope: compactEvidenceEnvelope,
    zero_open_worklist_guard: zeroOpenWorklistGuard,
    authority_boundary: authorityBoundary(),
    not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
  };
  if (detailLevel === 'full') {
    return {
      version: 'g2',
      family_runtime_evidence_worklist: {
        ...commonPayload,
        detail_level: 'full',
        projection_detail_policy: 'full_diagnostic_payload_requested_explicitly',
        worklist_items: worklistItems,
        attention_queue: openItems.map(attentionQueueItem),
        next_action_ledger: nextActionLedger,
        evidence_requirement_ledger: evidenceRequirementLedger,
        stage_evidence_workorder_packet: stageEvidenceWorkorderPacket,
        domain_dispatch_evidence_workorder_packet: domainDispatchEvidenceWorkorderPacket,
        evidence_envelope_full_ref:
          '/runtime_tray_snapshot/app_operator_drilldown/evidence_envelope',
      },
    };
  }
  return {
    version: 'g2',
    family_runtime_evidence_worklist: {
      ...commonPayload,
      detail_level: 'summary',
      projection_detail_policy: 'attention_first_default_full_refs_via_explicit_drilldown',
      counts,
      next_safe_actions: nextSafeActions(openItems),
      full_detail_args: ['--detail', 'full'],
      full_detail_command:
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json',
    },
  };
}
