import {
  countValue as numberValue,
  type JsonRecord,
  record,
  recordList,
  stringList,
  stringValue,
} from '../../kernel/json-record.ts';

export const OWNER_DELTA_HANDOFF_TAXONOMY =
  'first-class default summary of who owns the next delta or receipt, derived from owner_delta_first, owner_handoff_packet, and evidence_worklist without creating domain authority';

export function ownerDeltaHandoffFrameworkReadinessSection(input: {
  ownerDeltaHandoffSummary: JsonRecord;
  sourceCommands: string[];
}) {
  return {
    source_commands: input.sourceCommands,
    ...input.ownerDeltaHandoffSummary,
  };
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

function hasKeys(value: JsonRecord) {
  return Object.keys(value).length > 0;
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    const item = record(value);
    if (hasKeys(item)) {
      return item;
    }
  }
  return {};
}

function currentOperatorActionState(input: {
  openSafeActionPayloadRequiredCount: number;
  openSafeActionPayloadFreeCount: number;
  ownerHandoffOwnerCount: number;
  domainBlockedAttentionCount: number;
  ownerDeltaStatus: string | null;
}) {
  if (input.openSafeActionPayloadRequiredCount > 0) {
    return 'needs_domain_or_app_live_owner_payload';
  }
  if (input.openSafeActionPayloadFreeCount > 0) {
    return 'opl_safe_action_available';
  }
  if (input.ownerHandoffOwnerCount > 0) {
    return 'owner_handoff_review_required';
  }
  if (
    input.domainBlockedAttentionCount > 0
    || input.ownerDeltaStatus === 'blocked_refs_only_owner_delta_required'
  ) {
    return 'blocked_refs_only_owner_followthrough';
  }
  return 'no_opl_operator_action_required';
}

function handoffStatus(actionState: string) {
  if (actionState === 'no_opl_operator_action_required') {
    return 'clear';
  }
  return actionState;
}

export function buildOwnerDeltaHandoffSummary(input: {
  ownerDeltaFirst: JsonRecord;
  ownerHandoffPacket: JsonRecord;
  domainDispatchEvidenceWorkorderSummary: JsonRecord;
  openSafeActionItemCount: number;
  openSafeActionPayloadRequiredCount: number;
  openSafeActionPayloadFreeCount: number;
  operatorActionableAttentionCount: number;
  operatorPayloadRequiredAttentionCount: number;
  operatorPayloadFreeAttentionCount: number;
  domainBlockedAttentionCount: number;
  evidenceEnvelopeOpenCount: number;
  evidenceEnvelopeBlockedCount: number;
  stageReplayMissingReceiptWorkorderCount: number;
}) {
  const owners = recordList(input.ownerHandoffPacket.owners);
  const firstOwner = owners[0] ?? {};
  const ownerDeltaPrimaryItem = record(input.ownerDeltaFirst.primary_item);
  const ownerDeltaStatus = stringValue(input.ownerDeltaFirst.status);
  const actionState = currentOperatorActionState({
    openSafeActionPayloadRequiredCount: input.openSafeActionPayloadRequiredCount,
    openSafeActionPayloadFreeCount: input.openSafeActionPayloadFreeCount,
    ownerHandoffOwnerCount: owners.length,
    domainBlockedAttentionCount: input.domainBlockedAttentionCount,
    ownerDeltaStatus,
  });
  const nextOwner = firstString(
    input.ownerDeltaFirst.next_owner,
    firstOwner.owner,
    ownerDeltaPrimaryItem.owner,
    ownerDeltaPrimaryItem.payload_owner,
  );
  const selectedSafeAction = record(input.ownerDeltaFirst.selected_safe_action);
  const selectedSafeActionPayloadWorkorder = record(selectedSafeAction.payload_workorder);
  const topPayloadWorkorder = firstRecord(
    firstOwner.owner_payload_workorder,
    selectedSafeActionPayloadWorkorder,
  );
  const workorderAcceptedPayloadPaths = record(topPayloadWorkorder.accepted_payload_paths);
  const ownerRequiredReturnShapes = stringList(firstOwner.required_return_shapes);
  const ownerRequiredRefs = stringList(firstOwner.required_refs_any_of);
  const selectedSafeActionRequiredRefs =
    stringList(selectedSafeAction.required_operator_payload_refs);
  const selectedSafeActionRequiredReturnShapes =
    stringList(selectedSafeAction.required_return_shapes);
  const payloadContractSource = hasKeys(record(firstOwner.owner_payload_workorder))
    ? 'owner_handoff_packet'
    : hasKeys(selectedSafeActionPayloadWorkorder)
      ? 'owner_delta_first_selected_safe_action'
      : 'owner_delta_first_primary_item';
  const nextRequiredDelta =
    firstString(input.ownerDeltaFirst.next_required_delta, ownerDeltaPrimaryItem.status)
      ?? 'no_opl_operator_actionable_delta_required';

  return {
    surface_kind: 'opl_framework_owner_delta_handoff_summary',
    projection_policy:
      'first_class_owner_delta_handoff_default_read_model_over_owner_delta_first_owner_handoff_and_evidence_worklist',
    status: handoffStatus(actionState),
    current_operator_action_state: actionState,
    next_owner: nextOwner,
    payload_owner: firstString(firstOwner.payload_owner, ownerDeltaPrimaryItem.payload_owner)
      ?? 'domain_repository_or_app_live_operator',
    next_required_delta: nextRequiredDelta,
    required_delta_or_receipt: nextRequiredDelta,
    required_refs_any_of: ownerRequiredRefs.length > 0
      ? ownerRequiredRefs
      : stringList(topPayloadWorkorder.required_operator_payload_refs).length > 0
        ? stringList(topPayloadWorkorder.required_operator_payload_refs)
        : stringList(input.ownerDeltaFirst.required_refs_any_of).length > 0
          ? stringList(input.ownerDeltaFirst.required_refs_any_of)
          : selectedSafeActionRequiredRefs,
    required_return_shapes: ownerRequiredReturnShapes.length > 0
      ? ownerRequiredReturnShapes
      : stringList(topPayloadWorkorder.required_return_shapes).length > 0
        ? stringList(topPayloadWorkorder.required_return_shapes)
        : stringList(input.ownerDeltaFirst.required_return_shapes).length > 0
          ? stringList(input.ownerDeltaFirst.required_return_shapes)
          : selectedSafeActionRequiredReturnShapes,
    top_payload_kind: firstString(
      firstOwner.top_payload_kind,
      ownerDeltaPrimaryItem.payload_kind,
      stringList(topPayloadWorkorder.payload_kinds)[0],
      selectedSafeAction.action_kind,
      ownerDeltaPrimaryItem.step_kind,
      topPayloadWorkorder.surface_kind,
    ),
    top_stage_id: firstString(firstOwner.top_stage_id, ownerDeltaPrimaryItem.stage_id),
    payload_path_policy:
      firstString(
        firstOwner.payload_path_policy,
        topPayloadWorkorder.payload_path_policy,
        topPayloadWorkorder.accepted_payload_path_policy,
      ),
    accepted_payload_paths: hasKeys(record(firstOwner.accepted_payload_paths))
      ? record(firstOwner.accepted_payload_paths)
      : workorderAcceptedPayloadPaths,
    payload_contract_source: payloadContractSource,
    payload_contract_surface_kind: stringValue(topPayloadWorkorder.surface_kind),
    owner_payload_workorder:
      hasKeys(topPayloadWorkorder) ? topPayloadWorkorder : null,
    empty_payload_template_is_success_evidence:
      firstOwner.empty_payload_template_is_success_evidence === true,
    payload_preflight_policy: stringValue(firstOwner.payload_preflight_policy),
    payload_preflight_blocked_error_kind:
      stringValue(firstOwner.payload_preflight_blocked_error_kind),
    summary: {
      owner_delta_status: ownerDeltaStatus,
      owner_handoff_status: stringValue(input.ownerHandoffPacket.status),
      owner_handoff_owner_count: numberValue(input.ownerHandoffPacket.owner_count),
      owner_handoff_owner_omitted_count: numberValue(input.ownerHandoffPacket.owner_omitted_count),
      top_owner_attention_count: numberValue(firstOwner.attention_count),
      top_owner_open_envelope_count: numberValue(firstOwner.open_envelope_count),
      top_owner_blocked_envelope_count: numberValue(firstOwner.blocked_envelope_count),
      top_owner_payload_group_count: numberValue(firstOwner.owner_payload_group_count),
      top_owner_domain_dispatch_group_count:
        numberValue(firstOwner.domain_dispatch_group_count),
      operator_actionable_attention_count: input.operatorActionableAttentionCount,
      operator_payload_required_attention_count:
        input.operatorPayloadRequiredAttentionCount,
      operator_payload_free_attention_count:
        input.operatorPayloadFreeAttentionCount,
      domain_blocked_attention_count: input.domainBlockedAttentionCount,
      open_safe_action_item_count: input.openSafeActionItemCount,
      open_safe_action_payload_required_item_count:
        input.openSafeActionPayloadRequiredCount,
      open_safe_action_payload_free_item_count:
        input.openSafeActionPayloadFreeCount,
      evidence_envelope_open_count: input.evidenceEnvelopeOpenCount,
      evidence_envelope_blocked_count: input.evidenceEnvelopeBlockedCount,
      domain_dispatch_workorder_count:
        numberValue(input.domainDispatchEvidenceWorkorderSummary.workorder_count),
      domain_dispatch_workorder_domain_count:
        numberValue(input.domainDispatchEvidenceWorkorderSummary.domain_count),
      domain_dispatch_workorder_stage_attempt_count:
        numberValue(input.domainDispatchEvidenceWorkorderSummary.stage_attempt_count),
      stage_replay_missing_receipt_workorder_count:
        input.stageReplayMissingReceiptWorkorderCount,
    },
    source_refs: {
      owner_delta_first_ref: '/framework_readiness/owner_delta_first',
      owner_handoff_packet_ref: '/framework_readiness/owner_handoff_packet',
      evidence_worklist_ref: '/framework_readiness/evidence_worklist',
      attention_first_payload_ref: '/framework_readiness/attention_first_payload',
    },
    full_detail_sections: [
      'attention_first_payload.owner_delta_first',
      'attention_first_payload.owner_handoff_packet',
      'evidence_worklist',
      'evidence_envelope',
      'domain_dispatch_attention',
    ],
    authority_boundary: {
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_authorize_quality_or_export: false,
      can_claim_production_ready: false,
      owner_delta_handoff_is_projection_only: true,
      refs_only: true,
    },
  };
}

export function buildOwnerDeltaHandoffSummaryFromFrameworkReadiness(input: {
  ownerDeltaFirst: JsonRecord;
  ownerHandoffPacket: JsonRecord;
  domainDispatchEvidenceWorkorderSummary: JsonRecord;
  openSafeActionPayload: JsonRecord;
  attentionCounts: JsonRecord;
  readinessEvidenceEnvelopeOpenCount: number;
  readinessEvidenceEnvelopeBlockedCount: number;
  stageReplayMissingReceiptWorkorderCount: number;
}) {
  return buildOwnerDeltaHandoffSummary({
    ownerDeltaFirst: input.ownerDeltaFirst,
    ownerHandoffPacket: input.ownerHandoffPacket,
    domainDispatchEvidenceWorkorderSummary: input.domainDispatchEvidenceWorkorderSummary,
    openSafeActionItemCount: numberValue(input.openSafeActionPayload.openSafeActionItemCount),
    openSafeActionPayloadRequiredCount:
      numberValue(input.openSafeActionPayload.openSafeActionPayloadRequiredCount),
    openSafeActionPayloadFreeCount:
      numberValue(input.openSafeActionPayload.openSafeActionPayloadFreeCount),
    operatorActionableAttentionCount:
      numberValue(input.attentionCounts.operatorActionableAttentionCount),
    operatorPayloadRequiredAttentionCount:
      numberValue(input.attentionCounts.operatorPayloadRequiredAttentionCount),
    operatorPayloadFreeAttentionCount:
      numberValue(input.attentionCounts.operatorPayloadFreeAttentionCount),
    domainBlockedAttentionCount: numberValue(input.attentionCounts.domainBlockedAttentionCount),
    evidenceEnvelopeOpenCount: input.readinessEvidenceEnvelopeOpenCount,
    evidenceEnvelopeBlockedCount: input.readinessEvidenceEnvelopeBlockedCount,
    stageReplayMissingReceiptWorkorderCount: input.stageReplayMissingReceiptWorkorderCount,
  });
}
