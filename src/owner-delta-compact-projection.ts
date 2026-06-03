type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(stringValue).filter((entry): entry is string => Boolean(entry))
    : [];
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

function uniqueStringList(values: string[]) {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function omitPayloadTemplateDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitPayloadTemplateDeep);
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'payload_template')
      .map(([key, entry]) => [key, omitPayloadTemplateDeep(entry)]),
  );
}

function acceptedReturnShapes(...values: unknown[]) {
  const shapes = uniqueStringList(values.flatMap(stringList));
  return shapes.length > 0 ? shapes : ['typed_blocker_ref'];
}

function compactPayloadWorkorder(workorder: JsonRecord) {
  if (Object.keys(workorder).length === 0) {
    return null;
  }
  return {
    surface_kind: stringValue(workorder.surface_kind),
    payload_owner: stringValue(workorder.payload_owner),
    payload_path_policy:
      firstString(workorder.payload_path_policy, workorder.accepted_payload_path_policy),
    accepted_payload_paths: record(omitPayloadTemplateDeep(workorder.accepted_payload_paths)),
    required_operator_payload_refs: stringList(workorder.required_operator_payload_refs),
    supplemental_operator_payload_refs:
      stringList(workorder.supplemental_operator_payload_refs),
    required_return_shapes: stringList(workorder.required_return_shapes),
    empty_payload_template_is_success_evidence:
      workorder.empty_payload_template_is_success_evidence === true,
    authority_boundary: record(workorder.authority_boundary),
  };
}

function compactNextSafeAction(action: unknown) {
  const item = record(action);
  if (Object.keys(item).length === 0) {
    return null;
  }
  const payloadWorkorder = compactPayloadWorkorder(record(item.payload_workorder));
  return {
    item_id: stringValue(item.item_id),
    action_id: stringValue(item.action_id),
    action_kind: firstString(item.action_kind, item.step_kind),
    owner: firstString(item.owner, item.payload_owner),
    domain_id: stringValue(item.domain_id),
    stage_id: stringValue(item.stage_id),
    route_status: stringValue(item.route_status),
    next_safe_action_ref: firstString(
      item.next_safe_action_ref,
      item.replay_ref,
      item.action_ref,
      item.ref,
    ),
    payload_requirement: stringValue(item.payload_requirement),
    payload_owner: stringValue(item.payload_owner),
    route_requires_domain_or_app_payload:
      item.route_requires_domain_or_app_payload === true,
    accepted_return_shapes: acceptedReturnShapes(
      item.required_return_shapes,
      payloadWorkorder?.required_return_shapes,
    ),
    payload_workorder: payloadWorkorder,
    authority: 'operator_attention_only',
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_close_domain_ready: false,
    can_claim_production_ready: false,
    worklist_item_is_completion_claim: false,
  };
}

function falseFlags(input: JsonRecord = {}) {
  const boundary = record(input.authority_boundary);
  return {
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_owner_chain: false,
    can_close_domain_ready: false,
    can_authorize_quality_or_export: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    provider_completion_is_domain_ready: false,
    ...Object.fromEntries(Object.entries(boundary).filter(([, value]) => value === false)),
  };
}

export function buildCompactOwnerDeltaProjection(input: {
  ownerDeltaFirst?: JsonRecord;
  ownerDeltaHandoffSummary?: JsonRecord;
  nextSafeAction?: unknown;
  countSummary?: {
    openSafeActionCount?: number;
    payloadRequiredCount?: number;
    payloadFreeCount?: number;
    blockedRefsOnlyCount?: number;
    evidenceEnvelopeOpenCount?: number;
    evidenceEnvelopeBlockedCount?: number;
    domainDispatchWorkorderCount?: number;
    stageReplayMissingReceiptWorkorderCount?: number;
  };
  fullDetailRefs?: JsonRecord;
}) {
  const ownerDeltaFirst = record(input.ownerDeltaFirst);
  const handoff = record(input.ownerDeltaHandoffSummary);
  const compactAction = compactNextSafeAction(input.nextSafeAction);
  const countSummary = input.countSummary ?? {};
  const handoffSummary = record(handoff.summary);
  const ownerDeltaFirstSummary = record(ownerDeltaFirst.summary);
  const currentOwner = firstString(
    handoff.next_owner,
    ownerDeltaFirst.next_owner,
    compactAction?.owner,
    'one-person-lab',
  ) ?? 'one-person-lab';
  const requiredDelta = firstString(
    handoff.next_required_delta,
    handoff.required_delta_or_receipt,
    ownerDeltaFirst.next_required_delta,
    compactAction?.payload_requirement,
    'no_opl_operator_actionable_delta_required',
  ) ?? 'no_opl_operator_actionable_delta_required';

  return {
    surface_kind: 'opl_compact_owner_delta_projection',
    schema_version: 'compact-owner-delta-projection.v1',
    projection_policy:
      'shape_stable_owner_delta_default_alias_raw_refs_require_explicit_full_detail',
    current_owner: currentOwner,
    required_delta: requiredDelta,
    accepted_return_shapes: acceptedReturnShapes(
      handoff.required_return_shapes,
      ownerDeltaFirst.required_return_shapes,
      compactAction?.accepted_return_shapes,
    ),
    next_safe_action_or_none: compactAction,
    readiness_false_flags: falseFlags(handoff),
    count_summary: {
      open_safe_action_count:
        countSummary.openSafeActionCount
        ?? numberValue(handoffSummary.open_safe_action_item_count)
        ?? 0,
      payload_required_count:
        countSummary.payloadRequiredCount
        ?? numberValue(handoffSummary.open_safe_action_payload_required_item_count)
        ?? 0,
      payload_free_count:
        countSummary.payloadFreeCount
        ?? numberValue(handoffSummary.open_safe_action_payload_free_item_count)
        ?? 0,
      blocked_refs_only_count:
        countSummary.blockedRefsOnlyCount
        ?? numberValue(handoffSummary.domain_blocked_attention_count)
        ?? numberValue(ownerDeltaFirstSummary.domain_blocked_attention_count)
        ?? 0,
      evidence_envelope_open_count:
        countSummary.evidenceEnvelopeOpenCount
        ?? numberValue(handoffSummary.evidence_envelope_open_count)
        ?? 0,
      evidence_envelope_blocked_count:
        countSummary.evidenceEnvelopeBlockedCount
        ?? numberValue(handoffSummary.evidence_envelope_blocked_count)
        ?? 0,
      domain_dispatch_workorder_count:
        countSummary.domainDispatchWorkorderCount
        ?? numberValue(handoffSummary.domain_dispatch_workorder_count)
        ?? 0,
      stage_replay_missing_receipt_workorder_count:
        countSummary.stageReplayMissingReceiptWorkorderCount
        ?? numberValue(handoffSummary.stage_replay_missing_receipt_workorder_count)
        ?? 0,
    },
    full_detail_refs: {
      owner_delta_first_ref: '/framework_readiness/owner_delta_first',
      ...record(input.fullDetailRefs),
    },
  };
}

export function buildIdleCompactOwnerDeltaProjection() {
  return buildCompactOwnerDeltaProjection({
    ownerDeltaFirst: {
      next_owner: 'one-person-lab',
      next_required_delta: 'no_opl_operator_actionable_delta_required',
      required_return_shapes: ['typed_blocker_ref'],
    },
    countSummary: {
      openSafeActionCount: 0,
      payloadRequiredCount: 0,
      payloadFreeCount: 0,
      blockedRefsOnlyCount: 0,
      evidenceEnvelopeOpenCount: 0,
      evidenceEnvelopeBlockedCount: 0,
      domainDispatchWorkorderCount: 0,
      stageReplayMissingReceiptWorkorderCount: 0,
    },
    fullDetailRefs: {
      framework_readiness_ref: 'opl framework readiness --family-defaults --json',
      evidence_worklist_ref:
        'opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --json',
      app_operator_drilldown_ref:
        'opl runtime app-operator-drilldown --detail full --json',
    },
  });
}
