import {
  acceptedReturnShapes,
  guardedApplyAcceptedAnswerShapes,
} from './current-owner-delta-parts/guarded-apply.ts';
import {
  buildCurrentOwnerDeltaProjection,
  buildDefaultNextActionFromCurrentOwnerDelta,
  falseFlags,
} from './current-owner-delta-parts/projection.ts';
import {
  type JsonRecord,
  firstString,
  numberValue,
  omitPayloadTemplateDeep,
  record,
  stringList,
  stringValue,
} from './current-owner-delta-parts/values.ts';
export { buildDefaultNextActionFromCurrentOwnerDelta } from './current-owner-delta-parts/projection.ts';

function ownerDeltaAcceptedReturnShapes(ownerDeltaFirst: JsonRecord, handoff: JsonRecord) {
  const primaryItem = record(ownerDeltaFirst.primary_item);
  const selectedSafeAction = record(ownerDeltaFirst.selected_safe_action);
  const stageId = firstString(
    primaryItem.stage_id,
    selectedSafeAction.stage_id,
    ownerDeltaFirst.stage_id,
    handoff.stage_id,
  );
  const desiredDelta = firstString(
    ownerDeltaFirst.next_required_delta,
    ownerDeltaFirst.desired_delta_description,
    ownerDeltaFirst.payload_requirement,
    handoff.next_required_delta,
    handoff.desired_delta_description,
    handoff.payload_requirement,
  );
  const shapes = acceptedReturnShapes(
    handoff.required_return_shapes,
    handoff.accepted_answer_shape,
    handoff.required_refs_any_of,
    ownerDeltaFirst.required_return_shapes,
    ownerDeltaFirst.accepted_answer_shape,
    ownerDeltaFirst.required_refs_any_of,
    primaryItem.required_return_shapes,
    primaryItem.accepted_answer_shape,
    primaryItem.required_refs_any_of,
    selectedSafeAction.required_return_shapes,
    selectedSafeAction.accepted_answer_shape,
    selectedSafeAction.required_refs_any_of,
  );
  return guardedApplyAcceptedAnswerShapes({
    stageId,
    desiredDelta,
    shapes,
  });
}

function payloadWorkorderReturnShapes(workorder: JsonRecord) {
  const declared = stringList(workorder.required_return_shapes);
  if (declared.length > 0) {
    return declared;
  }
  if (stringValue(workorder.surface_kind) === 'opl_domain_dispatch_evidence_payload_workorder') {
    return [
      'domain_owner_receipt_ref',
      'typed_blocker_ref',
      'domain_typed_blocker_ref',
      'owner_chain_ref',
      'no_regression_ref',
    ];
  }
  return [];
}

function compactPayloadWorkorder(workorder: JsonRecord) {
  if (Object.keys(workorder).length === 0) {
    return null;
  }
  const requiredReturnShapes = payloadWorkorderReturnShapes(workorder);
  return {
    surface_kind: stringValue(workorder.surface_kind),
    payload_owner: stringValue(workorder.payload_owner),
    payload_path_policy:
      firstString(workorder.payload_path_policy, workorder.accepted_payload_path_policy),
    accepted_payload_paths: record(omitPayloadTemplateDeep(workorder.accepted_payload_paths)),
    required_operator_payload_refs: stringList(workorder.required_operator_payload_refs),
    supplemental_operator_payload_refs:
      stringList(workorder.supplemental_operator_payload_refs),
    required_return_shapes: requiredReturnShapes,
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
    owner: firstString(item.payload_owner, item.owner),
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

function buildCompactCountSummary(input: {
  countSummary: {
    openSafeActionCount?: number;
    payloadRequiredCount?: number;
    payloadFreeCount?: number;
    blockedRefsOnlyCount?: number;
    evidenceEnvelopeOpenCount?: number;
    evidenceEnvelopeBlockedCount?: number;
    domainDispatchWorkorderCount?: number;
    stageReplayMissingReceiptWorkorderCount?: number;
  };
  handoffSummary: JsonRecord;
  ownerDeltaFirstSummary: JsonRecord;
}) {
  return {
    open_safe_action_count:
      input.countSummary.openSafeActionCount
      ?? numberValue(input.handoffSummary.open_safe_action_item_count)
      ?? 0,
    payload_required_count:
      input.countSummary.payloadRequiredCount
      ?? numberValue(input.handoffSummary.open_safe_action_payload_required_item_count)
      ?? 0,
    payload_free_count:
      input.countSummary.payloadFreeCount
      ?? numberValue(input.handoffSummary.open_safe_action_payload_free_item_count)
      ?? 0,
    blocked_refs_only_count:
      input.countSummary.blockedRefsOnlyCount
      ?? numberValue(input.handoffSummary.domain_blocked_attention_count)
      ?? numberValue(input.ownerDeltaFirstSummary.domain_blocked_attention_count)
      ?? 0,
    evidence_envelope_open_count:
      input.countSummary.evidenceEnvelopeOpenCount
      ?? numberValue(input.handoffSummary.evidence_envelope_open_count)
      ?? 0,
    evidence_envelope_blocked_count:
      input.countSummary.evidenceEnvelopeBlockedCount
      ?? numberValue(input.handoffSummary.evidence_envelope_blocked_count)
      ?? 0,
    domain_dispatch_workorder_count:
      input.countSummary.domainDispatchWorkorderCount
      ?? numberValue(input.handoffSummary.domain_dispatch_workorder_count)
      ?? 0,
    stage_replay_missing_receipt_workorder_count:
      input.countSummary.stageReplayMissingReceiptWorkorderCount
      ?? numberValue(input.handoffSummary.stage_replay_missing_receipt_workorder_count)
      ?? 0,
  };
}

export function buildCurrentOwnerDeltaReadModel(input: {
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
    'one-person-lab',
  ) ?? 'one-person-lab';
  const requiredDelta = firstString(
    handoff.next_required_delta,
    handoff.required_delta_or_receipt,
    ownerDeltaFirst.next_required_delta,
    'no_opl_operator_actionable_delta_required',
  ) ?? 'no_opl_operator_actionable_delta_required';
  const acceptedShapes = ownerDeltaAcceptedReturnShapes(ownerDeltaFirst, handoff);
  const auditCountSummary = buildCompactCountSummary({
    countSummary,
    handoffSummary,
    ownerDeltaFirstSummary,
  });
  const fullDetailRefs = {
    owner_delta_first_ref: '/framework_readiness/owner_delta_first',
    ...record(input.fullDetailRefs),
  };
  const baseCurrentOwnerDelta = buildCurrentOwnerDeltaProjection({
    currentOwner,
    requiredDelta,
    acceptedReturnShapes: acceptedShapes,
    ownerDeltaFirst,
    handoff,
    compactAction,
    countSummary: auditCountSummary,
    fullDetailRefs,
  });
  const currentOwnerDelta = baseCurrentOwnerDelta;
  const defaultNextAction = buildDefaultNextActionFromCurrentOwnerDelta(currentOwnerDelta);
  const defaultSummary = {
    summary_kind: 'owner_delta_only',
    default_path_root: 'current_owner_delta',
    ordinary_progress_spine_ref: '/current_owner_delta/ordinary_progress_spine',
    progress_delta_receipt_ref: '/current_owner_delta/progress_delta_receipt',
    artifact_tier_policy_ref: '/current_owner_delta/artifact_tier_policy',
    audit_sidecar_policy_ref: '/current_owner_delta/audit_sidecar_policy',
    current_owner: currentOwnerDelta.current_owner,
    desired_delta_kind: currentOwnerDelta.desired_delta_kind,
    desired_delta_description: currentOwnerDelta.desired_delta_description,
    accepted_answer_shape: currentOwnerDelta.accepted_answer_shape,
    hard_gate: currentOwnerDelta.hard_gate,
    next_action_kind: defaultNextAction?.action_kind ?? null,
    next_action_owner: defaultNextAction?.current_owner ?? currentOwnerDelta.current_owner,
    latest_owner_answer_ref: currentOwnerDelta.latest_owner_answer_ref,
    audit_counts_are_first_screen: false,
    count_summary_path: 'current_owner_delta_read_model.owner_delta_audit_tail.count_summary',
  };

  return {
    surface_kind: 'opl_current_owner_delta_read_model',
    schema_version: 'current-owner-delta-read-model.v1',
    projection_policy:
      'current_owner_delta_is_the_only_default_operator_payload_raw_refs_require_explicit_full_detail',
    default_next_action_derivation_policy:
      'derive_default_next_action_only_from_current_owner_delta',
    ordinary_progress_spine: currentOwnerDelta.ordinary_progress_spine,
    progress_delta_receipt: currentOwnerDelta.progress_delta_receipt,
    artifact_tier_policy: currentOwnerDelta.artifact_tier_policy,
    audit_sidecar_policy: currentOwnerDelta.audit_sidecar_policy,
    current_owner: currentOwner,
    required_delta: requiredDelta,
    accepted_return_shapes: acceptedShapes,
    default_summary: defaultSummary,
    current_owner_delta: currentOwnerDelta,
    next_safe_action_or_none: defaultNextAction,
    owner_delta_audit_tail: {
      surface_kind: 'opl_current_owner_delta_audit_tail',
      audit_counts_are_first_screen: false,
      audit_next_safe_action_or_none: compactAction,
      readiness_false_flags: falseFlags(handoff),
      count_summary: auditCountSummary,
      audit_sidecar_policy: currentOwnerDelta.audit_sidecar_policy,
      full_detail_refs: fullDetailRefs,
    },
  };
}

export function buildCurrentOwnerDeltaCacheRefreshRequiredReadModel() {
  return buildCurrentOwnerDeltaReadModel({
    ownerDeltaFirst: {
      next_owner: 'one-person-lab',
      next_required_delta: 'refresh_current_owner_delta_read_model_required',
      required_return_shapes: [
        'framework_readiness_ref',
        'family_runtime_evidence_worklist_ref',
        'app_operator_drilldown_ref',
      ],
      summary: {
        source: 'app_state_fast_cache_miss',
        cache_miss_is_not_no_action: true,
      },
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
      cache_refresh_policy:
        'fast_profile_cache_miss_requires_authoritative_owner_delta_refresh_before_claiming_no_action',
    },
  });
}
