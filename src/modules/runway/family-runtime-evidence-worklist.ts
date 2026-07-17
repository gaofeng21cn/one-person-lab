import type { FrameworkContracts } from '../../kernel/types.ts';
import type { FamilyRuntimeProviderKind } from './family-runtime-types.ts';
import { buildProductionTailNextActionLedger } from '../ledger/index.ts';
import { compactEvidenceEnvelopeProjection } from '../ledger/index.ts';
import {
  buildDomainDispatchEvidenceWorkorderPacket,
  compactDomainDispatchEvidenceWorkorderAttentionItems,
  compactDomainDispatchEvidenceWorkorderGroupAttentionItems,
} from '../ledger/index.ts';
import { familyDefaultCallerFallbackDomains } from './family-runtime-evidence-worklist-parts/default-caller-family-scope.ts';
import { defaultCallerDeletionEvidenceRoutes } from './family-runtime-evidence-worklist-parts/default-caller-deletion-evidence-routes.ts';
import { attentionQueueItem, nextSafeActions } from './family-runtime-evidence-worklist-parts/attention-actions.ts';
import { buildZeroOpenCompletionGuard, zeroOpenCompletionGuardSummaryFields } from './family-runtime-evidence-worklist-parts/zero-open-completion-guard.ts';
import { operatorRoutesByActionId, routeWithOperatorHandoff } from './family-runtime-evidence-worklist-parts/operator-route-handoff.ts';
import { readOnlyRouteMatchesDefaults } from './family-runtime-evidence-worklist-parts/route-defaults.ts';
import {
  countValue, record, recordList, stringValue, type JsonRecord,
} from '../../kernel/json-record.ts';
import { normalizeWorklistOwnerFields } from './family-runtime-evidence-worklist-parts/owner-normalization.ts';
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
} from '../stagecraft/index.ts';
import type { StageReplayMissingReceiptReceipt } from '../stagecraft/index.ts';
import { familyRuntimeEvidenceWorklistAuthorityBoundary } from './family-runtime-evidence-worklist-parts/authority-boundary.ts';
import { buildWorklistOwnerDeltaActionProjection } from './family-runtime-evidence-worklist-parts/current-owner-delta-projection.ts';
import { buildProgressFirstOperatorSummary } from './family-runtime-evidence-worklist-parts/progress-first-operator-summary.ts';
import { domainDispatchRecordRouteAttemptIds, syncTerminalTemporalAttemptsForEvidenceWorklist, type EvidenceWorklistTemporalQuery } from './family-runtime-evidence-worklist-parts/terminal-observation-sync.ts';
import {
  NOT_AUTHORIZED_CLAIMS,
  OPEN_WORKLIST_STATUS,
} from './family-runtime-evidence-worklist-parts/constants.ts';
import {
  requireRuntimeTraySnapshotProvider,
  type RuntimeTraySnapshotEnvelope,
  type RuntimeTraySnapshotProvider,
} from './runtime-tray-snapshot-provider.ts';
import {
  readOnlyWorklistItem,
} from './family-runtime-evidence-worklist-parts/route-worklist-items.ts';
import {
  domainDispatchReceiptWorklistItems,
  externalEvidenceReceiptWorklistItems,
} from './family-runtime-evidence-worklist-parts/receipt-worklist-items.ts';
import {
  buildEvidenceRequirementLedger,
  diagnosticOperatorRoutesForWorklist,
  domainOwnerPayloadSummaryNamingHygieneBlockerCount as readDomainOwnerPayloadSummaryNamingHygiene,
  itemClosedByRefsOnlyReceipt,
  itemEligibleForNextActionLedger,
  itemEligibleForOrdinaryOpenAttention,
  rawOpenOperatorRoutesForWorklist,
  worklistCounts,
} from './family-runtime-evidence-worklist-parts/worklist-ledgers.ts';
import { writeCurrentOwnerDeltaReadModelProjectionCache } from '../ledger/index.ts';
import { buildCurrentOwnerDeltaTopline } from '../ledger/index.ts';

type EvidenceWorklistInput = {
  familyDefaults: boolean;
  providerKind: FamilyRuntimeProviderKind;
  executorKind: 'codex_cli';
  detailLevel?: 'summary' | 'full';
  runtimeSnapshot?: RuntimeTraySnapshotEnvelope;
  runtimeSnapshotProvider?: RuntimeTraySnapshotProvider;
  stageReadiness?: JsonRecord;
  stageReplayMissingReceiptExtraReceipts?: StageReplayMissingReceiptReceipt[];
  domainManifests?: DomainManifestCatalog;
  queryTemporalStageAttemptReadModel?: EvidenceWorklistTemporalQuery;
  defaultCallerReadinessReportBuilder?: (args: string[]) => JsonRecord;
};

export async function runFamilyRuntimeEvidenceWorklist(
  contracts: FrameworkContracts,
  input: EvidenceWorklistInput,
) {
  const domainManifests = domainManifestsForWorklist(contracts, input);
  const stageReadiness = stageReadinessForWorklist(contracts, input, domainManifests);
  const snapshotOptions = {
    appOperatorDrilldownDetailLevel: 'full' as const,
    providerKind: input.providerKind,
    ...(domainManifests ? { domainManifests } : {}),
  };
  const buildSnapshot = () => requireRuntimeTraySnapshotProvider(
    input.runtimeSnapshotProvider,
    'family-runtime evidence-worklist',
  )(contracts, snapshotOptions);
  const preliminarySnapshot = input.runtimeSnapshot
    ?? await buildSnapshot();
  const terminalObservationSync = await syncTerminalTemporalAttemptsForEvidenceWorklist({
    ...input,
    candidateStageAttemptIds: input.runtimeSnapshot
      ? []
      : domainDispatchRecordRouteAttemptIds(preliminarySnapshot),
  });
  const snapshot = input.runtimeSnapshot
    ? preliminarySnapshot
    : countValue(record(terminalObservationSync).synced_attempt_count) > 0
      ? await buildSnapshot()
      : preliminarySnapshot;
  const drilldown = record(snapshot.runtime_tray_snapshot.app_operator_drilldown);
  const {
    domainOwnerPayloadSummaryAttention,
    namingHygieneBlockerCount: domainOwnerPayloadSummaryNamingHygieneBlockerCount,
  } = readDomainOwnerPayloadSummaryNamingHygiene(drilldown);
  const bridge = record(drilldown.app_execution_bridge);
  const operatorActionRouting = record(drilldown.operator_action_routing_refs);
  const operatorRoutes = recordList(operatorActionRouting.refs);
  const operatorRouteByActionId = operatorRoutesByActionId(operatorRoutes);
  const routes = recordList(bridge.safe_action_routes).filter((route) =>
    readOnlyRouteMatchesDefaults(route, input)
  );
  const diagnosticRoutes = diagnosticOperatorRoutesForWorklist(
    operatorRoutes,
    routes,
    (route) => readOnlyRouteMatchesDefaults(route, input),
  );
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
      familyDefaultCallerFallbackDomains(input, drilldown),
    )
      .map((route, index) =>
        readOnlyWorklistItem(route, routes.length + diagnosticRoutes.length + index, drilldown)
      ),
  ].map(normalizeWorklistOwnerFields);
  const rawOpenItems = worklistItems.filter((item) =>
    stringValue(item.status) === OPEN_WORKLIST_STATUS
  );
  const openItems = worklistItems.filter(itemEligibleForOrdinaryOpenAttention);
  const closedItems = worklistItems.filter((item) =>
    item.status !== OPEN_WORKLIST_STATUS
  );
  const closedRefsOnlyItems = closedItems.filter(itemClosedByRefsOnlyReceipt);
  const rawOpenOperatorRoutes = rawOpenOperatorRoutesForWorklist(operatorRoutes, rawOpenItems);
  const openOperatorRoutes = rawOpenOperatorRoutesForWorklist(operatorRoutes, openItems);
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
  const stageEvidenceWorkorderPacket = buildStageEvidenceWorkorderPacket(rawOpenOperatorRoutes);
  const stageEvidenceWorkorderSummary = record(stageEvidenceWorkorderPacket.summary);
  const stageEvidenceWorkorderAttentionItems =
    compactStageEvidenceWorkorderAttentionItems(stageEvidenceWorkorderPacket);
  const stageReplayMissingReceiptWorkorderPacket =
    buildStageReplayMissingReceiptWorkorderPacket(stageReadiness, {
      extraReceipts: input.stageReplayMissingReceiptExtraReceipts,
    });
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
    ...worklistCounts(worklistItems, openItems, rawOpenItems, closedItems, nextActionLedger),
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
    stage_receipt_freshness_open_workorder_count:
      counts.stage_receipt_freshness_open_workorder_count,
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
