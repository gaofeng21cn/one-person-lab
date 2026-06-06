import type { FrameworkContracts } from './types.ts';
import { buildRuntimeTraySnapshot } from './runtime-tray-snapshot.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import { buildProductionTailNextActionLedger } from './production-evidence-tail-ledger.ts';
import { EVIDENCE_REQUIREMENT_MODEL_VERSION, evidenceRequirementFromTailItem } from './evidence-requirement.ts';
import type { EvidenceRequirement } from './evidence-requirement.ts';
import { readFamilyRuntimeLifecycleApplyReceipts } from './family-runtime-lifecycle-index.ts';
import { listExternalEvidenceReceipts } from './external-evidence-ledger.ts';
import { preflightStageProductionEvidencePayload } from './stage-production-evidence-payload-preflight.ts';
import { compactEvidenceEnvelopeProjection, canonicalOwnerId } from './evidence-envelope.ts';
import {
  buildDomainDispatchEvidenceWorkorderPacket,
  compactDomainDispatchEvidenceWorkorderAttentionItems,
  compactDomainDispatchEvidenceWorkorderGroupAttentionItems,
} from './domain-dispatch-evidence-workorder-packet.ts';
import { familyDefaultCallerSupplementalDomains } from './family-runtime-evidence-worklist-parts/default-caller-family-scope.ts';
import { defaultCallerDeletionEvidenceRoutes } from './family-runtime-evidence-worklist-parts/default-caller-deletion-evidence-routes.ts';
import { defaultCallerDeletionEvidenceCounts } from './family-runtime-evidence-worklist-parts/default-caller-deletion-counts.ts';
import { attentionQueueItem, nextSafeActions } from './family-runtime-evidence-worklist-parts/attention-actions.ts';
import { buildZeroOpenCompletionGuard, zeroOpenCompletionGuardSummaryFields } from './family-runtime-evidence-worklist-parts/zero-open-completion-guard.ts';
import { operatorRoutesByActionId, payloadHandoffProjection, routeWithOperatorHandoff } from './family-runtime-evidence-worklist-parts/operator-route-handoff.ts';
import { readOnlyRouteMatchesDefaults } from './family-runtime-evidence-worklist-parts/route-defaults.ts';
import {
  commandRef, countValue, record, recordList, stringList, stringValue, uniqueStringList, type JsonRecord,
} from './family-runtime-evidence-worklist-parts/json-utils.ts';
import { normalizeWorklistOwnerFields, worklistOwnerId } from './family-runtime-evidence-worklist-parts/owner-normalization.ts';
import { freshnessRef, readOnlyExpectedRefs } from './family-runtime-evidence-worklist-parts/worklist-route-refs.ts';
import { buildStageEvidenceWorkorderPacket, compactStageEvidenceWorkorderAttentionItems } from './family-runtime-evidence-worklist-parts/stage-evidence-workorders.ts';
import {
  domainManifestsForWorklist,
  stageReadinessForWorklist,
  type DomainManifestCatalog,
} from './family-runtime-evidence-worklist-parts/stage-readiness-input.ts';
import {
  buildStageReplayMissingReceiptWorkorderPacket,
  compactStageReplayMissingReceiptWorkorderAttentionSummary,
  compactStageReplayMissingReceiptWorkorderAttentionItems,
} from './family-runtime-evidence-worklist-parts/stage-replay-missing-receipt-workorders.ts';
import { familyRuntimeEvidenceWorklistAuthorityBoundary } from './family-runtime-evidence-worklist-parts/authority-boundary.ts';
import { buildWorklistOwnerDeltaActionProjection } from './family-runtime-evidence-worklist-parts/current-owner-delta-projection.ts';
import { buildProgressFirstOperatorSummary } from './family-runtime-evidence-worklist-parts/progress-first-operator-summary.ts';
import { domainDispatchRecordRouteAttemptIds, syncTerminalTemporalAttemptsForEvidenceWorklist, type EvidenceWorklistTemporalQuery } from './family-runtime-evidence-worklist-parts/terminal-observation-sync.ts';
import {
  NOT_AUTHORIZED_CLAIMS,
  OPEN_SAFE_ACTION_PAYLOAD_REQUIREMENT_SEMANTICS,
} from './family-runtime-evidence-worklist-parts/constants.ts';
import { writeCurrentOwnerDeltaReadModelProjectionCache } from './current-owner-delta-read-model-cache.ts';
import { buildCurrentOwnerDeltaTopline } from './current-owner-delta-topline.ts';

type EvidenceWorklistInput = {
  familyDefaults: boolean;
  providerKind: FamilyRuntimeProviderKind;
  executorKind: 'codex_cli';
  detailLevel?: 'summary' | 'full';
  runtimeSnapshot?: Awaited<ReturnType<typeof buildRuntimeTraySnapshot>>;
  stageReadiness?: JsonRecord;
  domainManifests?: DomainManifestCatalog;
  queryTemporalStageAttemptReadModel?: EvidenceWorklistTemporalQuery;
};

const BLOCKED_ROUTE_STATUS_PREFIX = 'blocked_by_';
const OPEN_WORKLIST_STATUS = 'open_safe_action_request_route_available';
const DIAGNOSTIC_ONLY_STATUS = 'diagnostic_only';
const DIAGNOSTIC_ONLY_ROUTE_SEMANTICS =
  'read_only_operator_diagnostic_not_safe_action_or_closeable_workorder';

function worklistLaneFor(input: {
  claimScope: string;
  actionKind: string;
  diagnosticOnlyRoute: boolean;
  route: JsonRecord;
}) {
  if (input.diagnosticOnlyRoute) {
    return 'diagnostic';
  }
  if (
    input.claimScope === 'legacy_cleanup_ledger'
    || input.claimScope === 'default_caller_deletion_evidence'
    || input.route.cleanup_lane_visible === true
  ) {
    return 'cleanup';
  }
  if (
    input.claimScope === 'external_evidence_receipt'
    || input.claimScope === 'evidence_gate_receipt'
    || (
      input.claimScope === 'domain_dispatch_evidence_receipt'
      && input.actionKind.endsWith('_verified')
    )
    || input.actionKind === 'domain_dispatch_evidence_typed_blocker_verified'
    || input.claimScope === 'stage_production_evidence_receipt'
    || input.route.audit_lane_visible === true
  ) {
    return 'audit';
  }
  return 'ordinary';
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
  if (actionKind === 'progress_first_attempt_supervision') {
    return 'progress_first_attempt_supervision';
  }
  return actionKind;
}

function refsOnlyClosureReceipt(route: JsonRecord, drilldown: JsonRecord) {
  const actionKind = stringValue(route.action_kind) ?? '';
  const waitsForDomainOrAppPayload = route.route_requires_domain_or_app_payload === true
    && route.can_close_without_domain_or_app_payload === false;
  const isDomainDispatchEvidenceRoute = actionKind.startsWith('domain_dispatch_evidence_');
  const isStageProductionEvidenceRoute = actionKind.startsWith('stage_production_evidence_');
  if (waitsForDomainOrAppPayload && !isDomainDispatchEvidenceRoute && !isStageProductionEvidenceRoute) {
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
    const stageEvidenceFreshnessRef =
      '/runtime_tray_snapshot/app_operator_drilldown/stage_production_evidence';
    const externalEvidenceFreshnessRef = isDomainDispatchEvidenceRoute
      ? '/runtime_tray_snapshot/app_operator_drilldown/domain_dispatch_evidence'
      : isStageProductionEvidenceRoute
        ? stageEvidenceFreshnessRef
        : '/runtime_tray_snapshot/app_operator_drilldown/domain_evidence_request_refs';
    if (verifiedReceipt.typed_blocker_refs.length > 0 && verifiedReceipt.receipt_refs.length === 0) {
      return {
        status: 'closed_by_domain_owned_typed_blocker',
        receipt_ref: verifiedReceipt.receipt_ref,
        receipt_refs: [verifiedReceipt.receipt_ref, ...verifiedReceipt.typed_blocker_refs],
        typed_blocker_ref: verifiedReceipt.typed_blocker_refs[0],
        typed_blocker_refs: verifiedReceipt.typed_blocker_refs,
        freshness_ref: externalEvidenceFreshnessRef,
        closure_reason:
          isDomainDispatchEvidenceRoute
            ? 'OPL refs-only evidence ledger verified a domain-owned typed blocker for this domain dispatch evidence request; this records request closure without claiming domain or production readiness.'
            : isStageProductionEvidenceRoute
              ? 'OPL refs-only evidence ledger verified a domain-owned typed blocker for this stage production evidence request; this records workorder closure without claiming stage success, domain readiness, or production readiness.'
              : 'OPL refs-only evidence ledger verified a domain-owned typed blocker for this external evidence request; this records request closure without claiming production success.',
      };
    }
    if (waitsForDomainOrAppPayload && isStageProductionEvidenceRoute) {
      const preflight = preflightStageProductionEvidencePayload(route, {
        domain_receipt_refs: verifiedReceipt.receipt_refs,
        evidence_refs: verifiedReceipt.evidence_refs,
        typed_blocker_refs: verifiedReceipt.typed_blocker_refs,
        no_regression_refs: verifiedReceipt.no_regression_refs,
        owner_chain_refs: verifiedReceipt.owner_chain_refs,
        source_scope_refs: verifiedReceipt.source_scope_refs,
        runtime_event_refs: verifiedReceipt.runtime_event_refs,
      });
      if (!preflight.success_path_ready) {
        return null;
      }
    }
    return {
      status: 'closed_by_receipt_ref',
      receipt_ref: verifiedReceipt.receipt_ref,
      receipt_refs: allReceiptRefs,
      typed_blocker_ref: verifiedReceipt.typed_blocker_refs[0] ?? null,
      typed_blocker_refs: verifiedReceipt.typed_blocker_refs,
      freshness_ref: externalEvidenceFreshnessRef,
      closure_reason:
        isDomainDispatchEvidenceRoute
          ? 'OPL refs-only evidence ledger verified domain dispatch owner-chain refs without claiming domain or production readiness.'
          : isStageProductionEvidenceRoute
            ? 'OPL refs-only evidence ledger verified domain-owned stage evidence refs covering the stage evidence obligations without claiming domain or production readiness.'
            : 'OPL refs-only evidence ledger verified a domain-owned receipt for this external evidence request.',
    };
  }

  return null;
}

function readOnlyWorklistItem(route: JsonRecord, index: number, drilldown: JsonRecord) {
  const actionId = stringValue(route.action_id) ?? `route:${index + 1}`;
  const actionKind = stringValue(route.action_kind) ?? 'operator_action';
  const claimScope = readOnlyClaimScope(route);
  const routeOwner = worklistOwnerId(
    stringValue(route.owner) ?? stringValue(route.action_owner),
  ) ?? 'opl';
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
  const routeStatus = stringValue(route.route_status) ?? 'request_route_available';
  const actionabilityStatus = stringValue(route.default_actionability_status);
  const routeBlocked = routeStatus.startsWith(BLOCKED_ROUTE_STATUS_PREFIX)
    || actionabilityStatus?.startsWith(BLOCKED_ROUTE_STATUS_PREFIX);
  const routeNotActionable = route.can_submit_to_safe_action_shell === false
    || route.default_actionable === false;
  const diagnosticOnlyRoute = actionabilityStatus === 'diagnostic_only_not_operator_actionable'
    || actionKind === 'progress_first_attempt_supervision';
  const worklistLane = worklistLaneFor({
    claimScope,
    actionKind,
    diagnosticOnlyRoute,
    route,
  });
  const defaultOwnerDeltaEligible = worklistLane === 'ordinary'
    && !routeNotActionable
    && !routeBlocked
    && !diagnosticOnlyRoute;
  const itemStatus = stringValue(closure?.status)
    ?? (diagnosticOnlyRoute
      ? DIAGNOSTIC_ONLY_STATUS
      : null)
    ?? (
      routeBlocked
        ? routeStatus
        : routeNotActionable
          ? actionabilityStatus ?? routeStatus
          : OPEN_WORKLIST_STATUS
    );
  const closureReceiptRef = stringValue(closure?.receipt_ref);
  const closureReceiptRefs = stringList(closure?.receipt_refs);
  const closureFreshnessRef = stringValue(closure?.freshness_ref);
  const closureTypedBlockerRefs = stringList(closure?.typed_blocker_refs);
  const closureTypedBlockerRef = stringValue(closure?.typed_blocker_ref);
  const allTypedBlockerRefs = [
    ...typedBlockerRefs,
    ...closureTypedBlockerRefs,
  ];
  const familyStallLineage = record(drilldown.family_stall_lineage);
  const lineage = recordList(familyStallLineage.lineages).find((entry) => {
    const refs = stringList(entry.typed_blocker_refs);
    return refs.some((ref) => allTypedBlockerRefs.includes(ref));
  });
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
    worklist_attention_class: stringValue(route.worklist_attention_class),
    ordinary_open_safe_action_attention: route.ordinary_open_safe_action_attention !== false,
    worklist_lane: worklistLane,
    default_owner_delta_eligible: defaultOwnerDeltaEligible,
    audit_lane_visible: worklistLane === 'audit',
    cleanup_lane_visible: worklistLane === 'cleanup',
    mode: itemStatus === DIAGNOSTIC_ONLY_STATUS
      ? 'diagnostic_query_only'
      : actionKind.endsWith('_verify') || actionKind === 'provider_scheduler_status'
        ? 'verify'
        : 'request_or_apply_via_safe_action',
    status: itemStatus,
    worklist_item_is_completion_claim: false,
    route_status: routeStatus,
    route_status_detail: stringValue(route.route_status_detail),
    route_semantics: itemStatus === DIAGNOSTIC_ONLY_STATUS
      ? DIAGNOSTIC_ONLY_ROUTE_SEMANTICS
      : 'open_safe_action_request_apply_verify_route',
    receipt_ref: closureReceiptRef,
    receipt_refs: closureReceiptRefs,
    typed_blocker_ref: typedBlockerRefs[0] ?? closureTypedBlockerRef ?? null,
    typed_blocker_refs: allTypedBlockerRefs,
    worklist_status_detail: itemStatus === 'closed_by_domain_owned_typed_blocker'
      ? 'closed_by_domain_owned_typed_blocker_ref'
      : itemStatus.startsWith('blocked_by_')
        ? itemStatus
      : itemStatus === DIAGNOSTIC_ONLY_STATUS
        ? 'diagnostic_only_not_operator_actionable'
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
    stall_lineage_ref: lineage
      ? `/runtime_tray_snapshot/app_operator_drilldown/family_stall_lineage/${stringValue(lineage.blocker_family) ?? 'blocker'}`
      : null,
    next_forced_delta: stringValue(lineage?.next_forced_delta),
    escalation_owner: stringValue(lineage?.escalation_owner),
    terminal: lineage?.terminal === true,
    progress_first_required_next_action:
      stringValue(route.progress_first_required_next_action),
    provider_required_next_action: stringValue(route.provider_required_next_action),
    provider_worker_required_next_action:
      stringValue(route.provider_worker_required_next_action),
    open_reason: stringValue(route.open_reason),
    payload_requirement: stringValue(route.payload_requirement),
    payload_owner: stringValue(route.payload_owner),
    ...payloadHandoffProjection(route, actionKind),
    missing_progress_signals: stringList(route.missing_progress_signals),
    route_requires_domain_or_app_payload: route.route_requires_domain_or_app_payload === true,
    can_close_without_domain_or_app_payload: route.can_close_without_domain_or_app_payload !== false,
    opl_generated_receipt_policy: stringValue(route.opl_generated_receipt_policy),
    blocked_reason: stringValue(route.blocked_reason),
    supervisor_safe_action_kind: stringValue(route.supervisor_safe_action_kind),
    typed_blocker_requirement: record(route.typed_blocker_requirement),
    retirement_guard: record(route.retirement_guard),
    not_authorized_claims: [...NOT_AUTHORIZED_CLAIMS],
  };
  const evidenceRequirementStatus = itemStatus.startsWith(BLOCKED_ROUTE_STATUS_PREFIX)
    ? 'blocked'
    : itemStatus === DIAGNOSTIC_ONLY_STATUS
      ? 'closed'
      : itemStatus;
  return {
    ...item,
    evidence_requirement_model: EVIDENCE_REQUIREMENT_MODEL_VERSION,
    evidence_requirement: evidenceRequirementFromTailItem({
      ...item,
      status: evidenceRequirementStatus,
      next_safe_action_route: evidenceRequirementStatus === OPEN_WORKLIST_STATUS
        ? item.replay_ref
        : null,
    }),
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
      ...stringList(receipt.memory_writeback_receipt_refs),
      ...stringList(receipt.artifact_mutation_receipt_refs),
      ...stringList(receipt.package_lifecycle_receipt_refs),
      ...stringList(receipt.lifecycle_receipt_refs),
      ...stringList(receipt.restore_proof_refs),
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
      worklist_lane: 'audit',
      default_owner_delta_eligible: false,
      audit_lane_visible: true,
      cleanup_lane_visible: false,
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
      worklist_lane: 'audit',
      default_owner_delta_eligible: false,
      audit_lane_visible: true,
      cleanup_lane_visible: false,
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
      openItems.filter((item) =>
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
      openItems.filter((item) =>
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

function itemEligibleForNextActionLedger(item: JsonRecord) {
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

function itemEligibleForOrdinaryOpenAttention(item: JsonRecord) {
  return stringValue(item.status) === OPEN_WORKLIST_STATUS
    && stringValue(item.worklist_lane) === 'ordinary'
    && item.default_owner_delta_eligible === true
    && item.ordinary_open_safe_action_attention !== false
    && stringValue(item.worklist_attention_class) !== 'audit_cleanup_lane';
}

function itemClosedByRefsOnlyReceipt(item: JsonRecord) {
  const status = stringValue(item.status);
  return status === 'closed_by_receipt_ref'
    || status === 'closed_by_domain_owned_typed_blocker';
}

function diagnosticOperatorRoutesForWorklist(
  operatorRoutes: JsonRecord[],
  safeActionRoutes: JsonRecord[],
  input: EvidenceWorklistInput,
) {
  const safeActionIds = new Set(safeActionRoutes
    .map((route) => stringValue(route.action_id))
    .filter((actionId): actionId is string => Boolean(actionId)));
  return operatorRoutes.filter((route) => {
    const actionId = stringValue(route.action_id);
    return stringValue(route.action_kind) === 'progress_first_attempt_supervision'
      && actionId !== null
      && !safeActionIds.has(actionId)
      && readOnlyRouteMatchesDefaults(route, input);
  });
}

export async function runFamilyRuntimeEvidenceWorklist(
  contracts: FrameworkContracts,
  input: EvidenceWorklistInput,
) {
  const domainManifests = domainManifestsForWorklist(contracts, input);
  const stageReadiness = stageReadinessForWorklist(contracts, input, domainManifests);
  const preliminarySnapshot = input.runtimeSnapshot
    ?? await buildRuntimeTraySnapshot(contracts, {
      appOperatorDrilldownDetailLevel: 'full',
      providerKind: input.providerKind,
      ...(domainManifests ? { domainManifests } : {}),
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
          ...(domainManifests ? { domainManifests } : {}),
        })
      : preliminarySnapshot;
  const drilldown = record(snapshot.runtime_tray_snapshot.app_operator_drilldown);
  const appEvidenceAfterContract =
    record(record(drilldown.attention_first_payload).evidence_after_contract);
  const domainOwnerPayloadSummaryAttention =
    record(appEvidenceAfterContract.domain_owner_payload_summary_attention);
  const domainOwnerPayloadSummaryNamingHygieneBlockerCount =
    countValue(domainOwnerPayloadSummaryAttention.naming_hygiene_blocker_count);
  const bridge = record(drilldown.app_execution_bridge);
  const operatorActionRouting = record(drilldown.operator_action_routing_refs);
  const operatorRoutes = recordList(operatorActionRouting.refs);
  const operatorRouteByActionId = operatorRoutesByActionId(operatorRoutes);
  const routes = recordList(bridge.safe_action_routes).filter((route) =>
    readOnlyRouteMatchesDefaults(route, input)
  );
  const diagnosticRoutes = diagnosticOperatorRoutesForWorklist(operatorRoutes, routes, input);
  const worklistItems = [
    ...routes.map((route, index) =>
      readOnlyWorklistItem(routeWithOperatorHandoff(route, operatorRouteByActionId), index, drilldown)
    ),
    ...diagnosticRoutes.map((route, index) =>
      readOnlyWorklistItem(route, routes.length + index, drilldown)
    ),
    ...externalEvidenceReceiptWorklistItems(drilldown),
    ...domainDispatchReceiptWorklistItems(drilldown),
    ...defaultCallerDeletionEvidenceRoutes(
      drilldown,
      NOT_AUTHORIZED_CLAIMS,
      familyDefaultCallerSupplementalDomains(input, drilldown),
    )
      .map((route, index) =>
        readOnlyWorklistItem(route, routes.length + diagnosticRoutes.length + index, drilldown)
      ),
  ].map(normalizeWorklistOwnerFields);
  const openItems = worklistItems.filter(itemEligibleForOrdinaryOpenAttention);
  const closedItems = worklistItems.filter((item) =>
    item.status !== OPEN_WORKLIST_STATUS
  );
  const closedRefsOnlyItems = closedItems.filter(itemClosedByRefsOnlyReceipt);
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
    tailItems: worklistItems.filter(itemEligibleForNextActionLedger),
    sourceRef: '/family_runtime_evidence_worklist/worklist_items',
  });
  const evidenceRequirementLedger = buildEvidenceRequirementLedger(worklistItems);
  const stageEvidenceWorkorderPacket = buildStageEvidenceWorkorderPacket(openOperatorRoutes);
  const stageEvidenceWorkorderSummary = record(stageEvidenceWorkorderPacket.summary);
  const stageEvidenceWorkorderAttentionItems =
    compactStageEvidenceWorkorderAttentionItems(stageEvidenceWorkorderPacket);
  const stageReplayMissingReceiptWorkorderPacket =
    buildStageReplayMissingReceiptWorkorderPacket(stageReadiness);
  const stageReplayMissingReceiptWorkorderSummary =
    record(stageReplayMissingReceiptWorkorderPacket.summary);
  const stageReplayMissingReceiptWorkorderAttentionItems =
    compactStageReplayMissingReceiptWorkorderAttentionItems(stageReplayMissingReceiptWorkorderPacket);
  const stageReplayMissingReceiptWorkorderAttentionSummary =
    compactStageReplayMissingReceiptWorkorderAttentionSummary(stageReplayMissingReceiptWorkorderPacket);
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
  const familyStallLineage = record(drilldown.family_stall_lineage);
  const progressFirstOperatorSummary = buildProgressFirstOperatorSummary({
    worklistItems,
    openItems,
    closedRefsOnlyItems,
    stageReplayMissingReceiptWorkorderSummary,
    zeroOpenWorklistGuard,
    familyStallLineage,
    evidenceEnvelopeSummary: record(compactEvidenceEnvelope.summary),
  });
  const counts = {
    ...worklistCounts(worklistItems, openItems, closedItems, nextActionLedger),
    closed_refs_only_item_count: closedRefsOnlyItems.length,
    ...zeroOpenCompletionGuardSummaryFields(zeroOpenWorklistGuard),
    stage_source_scope_missing_workorder_count:
      countValue(stageEvidenceWorkorderSummary.source_scope_missing_workorder_count),
    stage_runtime_event_missing_workorder_count:
      countValue(stageEvidenceWorkorderSummary.runtime_event_missing_workorder_count),
    stage_source_scope_missing_ref_count:
      countValue(stageEvidenceWorkorderSummary.source_scope_missing_ref_count),
    stage_runtime_event_missing_ref_count:
      countValue(stageEvidenceWorkorderSummary.runtime_event_missing_ref_count),
    stage_replay_missing_receipt_workorder_count:
      countValue(stageReplayMissingReceiptWorkorderSummary.workorder_count),
    stage_replay_missing_receipt_ref_count:
      countValue(stageReplayMissingReceiptWorkorderSummary.missing_ref_count),
    stage_replay_missing_human_gate_ref_count:
      countValue(stageReplayMissingReceiptWorkorderSummary.human_gate_missing_ref_count),
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
    domain_owner_payload_summary_naming_hygiene_blocker_count:
      domainOwnerPayloadSummaryNamingHygieneBlockerCount,
  };
  const detailLevel = input.detailLevel ?? 'summary';
  const stageReceiptFreshnessOpenWorkorderCount = openItems.filter((item) =>
    item.claim_scope === 'stage_production_evidence_receipt'
  ).length;
  const auditWorklistNextSafeActions = nextSafeActions(openItems);
  const {
    currentOwnerDeltaReadModel,
    defaultNextSafeActions,
    auditWorklistNextSafeActions: ownerDeltaAuditWorklistNextSafeActions,
  } = buildWorklistOwnerDeltaActionProjection({
    drilldown,
    openItems,
    nextSafeActions: auditWorklistNextSafeActions,
    counts,
    compactEvidenceEnvelope,
    domainDispatchEvidenceWorkorderSummary,
    stageReplayMissingReceiptWorkorderSummary,
  });
  const ownerDeltaTopline = buildCurrentOwnerDeltaTopline({ currentOwnerDeltaReadModel });
  writeCurrentOwnerDeltaReadModelProjectionCache({
    readModel: currentOwnerDeltaReadModel,
    sourceSurface: 'family_runtime_evidence_worklist',
    sourceCommand:
      'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
  });
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
    closed_refs_only_item_count: closedRefsOnlyItems.length,
    open_safe_action_payload_required_item_count:
      counts.open_safe_action_payload_required_item_count,
    open_safe_action_payload_free_item_count:
      counts.open_safe_action_payload_free_item_count,
    open_safe_action_payload_requirement_semantics:
      counts.open_safe_action_payload_requirement_semantics,
    stage_receipt_freshness_open_workorder_count: stageReceiptFreshnessOpenWorkorderCount,
    stage_evidence_workorder_packet_summary: stageEvidenceWorkorderPacket.summary,
    stage_evidence_workorder_attention_items: stageEvidenceWorkorderAttentionItems,
    stage_replay_missing_receipt_workorder_packet_summary:
      stageReplayMissingReceiptWorkorderPacket.summary,
    stage_replay_missing_receipt_workorder_attention_summary:
      stageReplayMissingReceiptWorkorderAttentionSummary,
    stage_replay_missing_receipt_workorder_attention_items:
      stageReplayMissingReceiptWorkorderAttentionItems,
    domain_dispatch_evidence_workorder_packet_summary:
      domainDispatchEvidenceWorkorderPacket.summary,
    domain_dispatch_evidence_workorder_group_attention_policy:
      'top_canonical_owner_stage_groups_refs_only_no_domain_authority',
    domain_dispatch_evidence_workorder_group_attention_items:
      domainDispatchEvidenceWorkorderGroupAttentionItems,
    domain_dispatch_evidence_workorder_attention_items:
      domainDispatchEvidenceWorkorderAttentionItems,
    domain_owner_payload_summary_attention: {
      ...domainOwnerPayloadSummaryAttention,
      source_command: 'opl runtime app-operator-drilldown --json',
    },
    source_refs: {
      app_operator_drilldown_ref: '/runtime_tray_snapshot/app_operator_drilldown',
      app_execution_bridge_ref: '/runtime_tray_snapshot/app_operator_drilldown/app_execution_bridge',
      evidence_envelope_ref: '/runtime_tray_snapshot/app_operator_drilldown/evidence_envelope',
      domain_owner_payload_summary_attention_ref:
        '/runtime_tray_snapshot/app_operator_drilldown/attention_first_payload/evidence_after_contract/domain_owner_payload_summary_attention',
      terminal_observation_sync_ref: '/family_runtime_evidence_worklist/terminal_observation_sync',
      stage_replay_missing_receipt_workorder_ref:
        '/family_stage_readiness/domains/warnings/payload_workorder',
    },
    terminal_observation_sync: terminalObservationSync,
    evidence_envelope: compactEvidenceEnvelope,
    progress_first_operator_summary: progressFirstOperatorSummary,
    ...ownerDeltaTopline,
    next_safe_actions: defaultNextSafeActions,
    audit_worklist_next_safe_actions: ownerDeltaAuditWorklistNextSafeActions,
    effective_current_context: record(drilldown.effective_current_context),
    family_stall_lineage: familyStallLineage,
    zero_open_worklist_guard: zeroOpenWorklistGuard,
    authority_boundary: familyRuntimeEvidenceWorklistAuthorityBoundary(),
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
        stage_replay_missing_receipt_workorder_packet: stageReplayMissingReceiptWorkorderPacket,
        domain_dispatch_evidence_workorder_packet: domainDispatchEvidenceWorkorderPacket,
        evidence_envelope_full_ref: '/runtime_tray_snapshot/app_operator_drilldown/evidence_envelope',
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
      full_detail_args: ['--detail', 'full'],
      full_detail_command: 'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail full --json',
    },
  };
}
