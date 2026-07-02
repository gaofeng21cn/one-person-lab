type JsonRecord = Record<string, unknown>;

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

function typedBlockerRefsFromItems(items: JsonRecord[]) {
  return uniqueStringList(items.flatMap((item) => stringList(item.typed_blocker_refs)));
}

function lineageNextForcedDeltas(familyStallLineage: JsonRecord) {
  return uniqueStringList(recordList(familyStallLineage.lineages)
    .map((lineage) => stringValue(lineage.next_forced_delta)));
}

function nextForcedDelta(input: {
  openItems: JsonRecord[];
  stageReplayMissingReceiptWorkorderCount: number;
  stageReplayMissingHumanGateRefCount: number;
  blockedRefsOnlyEnvelopeCount: number;
  lineageDeltas: string[];
}) {
  const itemDeltas = uniqueStringList(input.openItems.map((item) =>
    stringValue(item.next_forced_delta)
      ?? stringValue(item.progress_first_required_next_action)
      ?? stringValue(item.provider_required_next_action)
      ?? stringValue(item.provider_worker_required_next_action)
  ));
  if (itemDeltas.length > 0) {
    return itemDeltas[0];
  }
  if (input.lineageDeltas.length > 0) {
    return input.lineageDeltas[0];
  }
  if (input.stageReplayMissingHumanGateRefCount > 0) {
    return 'human_gate_receipt_or_domain_owned_typed_blocker_ref_required';
  }
  if (input.stageReplayMissingReceiptWorkorderCount > 0) {
    return 'domain_owner_receipt_or_domain_owned_typed_blocker_ref_required';
  }
  if (input.blockedRefsOnlyEnvelopeCount > 0) {
    return 'domain_or_app_owner_payload_ref_or_typed_blocker_required';
  }
  if (input.openItems.length > 0) {
    return 'execute_or_verify_open_safe_action_route';
  }
  return 'no_opl_operator_actionable_delta_required';
}

export function buildProgressFirstOperatorSummary(input: {
  worklistItems: JsonRecord[];
  openItems: JsonRecord[];
  closedRefsOnlyItems: JsonRecord[];
  stageReplayMissingReceiptWorkorderSummary: JsonRecord;
  zeroOpenWorklistGuard: JsonRecord;
  familyStallLineage: JsonRecord;
  evidenceEnvelopeSummary: JsonRecord;
}) {
  const stageReplayMissingReceiptWorkorderCount =
    countValue(input.stageReplayMissingReceiptWorkorderSummary.workorder_count);
  const stageReplayMissingHumanGateRefCount =
    countValue(input.stageReplayMissingReceiptWorkorderSummary.human_gate_missing_ref_count);
  const blockedRefsOnlyEnvelopeCount =
    countValue(input.evidenceEnvelopeSummary.blocked_envelope_count)
    || countValue(input.zeroOpenWorklistGuard.zero_open_worklist_blocked_refs_only_envelope_count);
  const openPayloadRequiredCount = input.openItems.filter((item) =>
    item.route_requires_domain_or_app_payload === true
  ).length;
  const openProgressFirstSupervisionCount = input.openItems.filter((item) =>
    stringValue(item.claim_scope) === 'progress_first_attempt_supervision'
  ).length;
  const progressFirstDiagnosticItems = input.worklistItems.filter((item) =>
    stringValue(item.claim_scope) === 'progress_first_attempt_supervision'
    && stringValue(item.status) === 'diagnostic_only'
  );
  const operatorAttentionItems = [
    ...input.openItems,
    ...progressFirstDiagnosticItems,
  ];
  const progressFirstSupervisionItemCount =
    openProgressFirstSupervisionCount + progressFirstDiagnosticItems.length;
  const typedBlockerRefs = typedBlockerRefsFromItems([
    ...input.worklistItems,
    ...recordList(input.familyStallLineage.lineages),
  ]);
  const lineageDeltas = lineageNextForcedDeltas(input.familyStallLineage);
  const domainOrHumanBlockedCount =
    stageReplayMissingReceiptWorkorderCount
    + blockedRefsOnlyEnvelopeCount
    + input.closedRefsOnlyItems.filter((item) =>
      stringValue(item.status) === 'closed_by_domain_owned_typed_blocker'
    ).length;
  const hasOpenSafeActions = input.openItems.length > 0;
  const hasBlockedRefsOnlyAttention = domainOrHumanBlockedCount > 0 || typedBlockerRefs.length > 0;
  const status = hasOpenSafeActions
    ? 'operator_safe_action_available'
    : progressFirstDiagnosticItems.length > 0
      ? 'progress_first_diagnostic_attention'
    : hasBlockedRefsOnlyAttention
      ? 'domain_or_human_owner_blocked_refs_only'
      : 'no_open_operator_action';

  return {
    surface_kind: 'opl_progress_first_operator_summary',
    summary_role: 'attention_first_next_delta_lens',
    projection_policy:
      'progress_first_refs_only_operator_lens_without_domain_truth_or_completion_authority',
    status,
    progress_delta_classification: hasOpenSafeActions
      ? 'operator_action_pending'
      : progressFirstDiagnosticItems.length > 0
        ? 'diagnostic_attention_only'
      : hasBlockedRefsOnlyAttention
        ? 'blocked_refs_only_attention'
        : 'no_open_operator_delta',
    deliverable_progress_delta: null,
    platform_repair_delta: hasOpenSafeActions || progressFirstSupervisionItemCount > 0
      ? 'opl_operator_or_provider_supervision_delta_available'
      : null,
    next_forced_delta: nextForcedDelta({
      openItems: operatorAttentionItems,
      stageReplayMissingReceiptWorkorderCount,
      stageReplayMissingHumanGateRefCount,
      blockedRefsOnlyEnvelopeCount,
      lineageDeltas,
    }),
    open_safe_action_count: input.openItems.length,
    open_safe_action_payload_required_count: openPayloadRequiredCount,
    open_safe_action_payload_free_count: input.openItems.length - openPayloadRequiredCount,
    progress_first_supervision_open_count: openProgressFirstSupervisionCount,
    progress_first_supervision_diagnostic_count: progressFirstDiagnosticItems.length,
    progress_first_supervision_item_count: progressFirstSupervisionItemCount,
    progress_first_supervision_diagnostic_semantics:
      'attempt_query_is_read_only_operator_diagnostic_not_closeable_evidence_workorder',
    stage_replay_missing_receipt_workorder_count: stageReplayMissingReceiptWorkorderCount,
    stage_replay_missing_human_gate_ref_count: stageReplayMissingHumanGateRefCount,
    blocked_refs_only_envelope_count: blockedRefsOnlyEnvelopeCount,
    domain_or_human_owner_blocked_count: domainOrHumanBlockedCount,
    typed_blocker_ref_count: typedBlockerRefs.length,
    typed_blocker_refs: typedBlockerRefs,
    lineage_next_forced_delta_count: lineageDeltas.length,
    lineage_next_forced_deltas: lineageDeltas,
    zero_open_worklist_is_completion_claim:
      input.zeroOpenWorklistGuard.zero_open_worklist_is_completion_claim === true,
    zero_open_worklist_is_domain_ready:
      input.zeroOpenWorklistGuard.zero_open_worklist_is_domain_ready === true,
    zero_open_worklist_is_production_ready:
      input.zeroOpenWorklistGuard.zero_open_worklist_is_production_ready === true,
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      deliverable_progress_delta_owner: 'domain_agent',
      platform_repair_delta_owner: 'opl_framework_or_provider',
    },
  };
}
