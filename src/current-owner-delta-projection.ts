import { cognitiveKernelBoundary } from './cognitive-kernel-boundary.ts';
import { buildAppStageRunCockpit } from './app-state-stage-run-cockpit.ts';

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

function sanitizeIdPart(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
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

function ownerDeltaAcceptedReturnShapes(ownerDeltaFirst: JsonRecord, handoff: JsonRecord) {
  const primaryItem = record(ownerDeltaFirst.primary_item);
  const selectedSafeAction = record(ownerDeltaFirst.selected_safe_action);
  return acceptedReturnShapes(
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

function desiredDeltaKind(requiredDelta: string) {
  if (requiredDelta === 'no_opl_operator_actionable_delta_required') {
    return 'none';
  }
  if (requiredDelta.includes('typed_blocker')) {
    return requiredDelta.includes('receipt')
      ? 'owner_answer_or_typed_blocker'
      : 'typed_blocker';
  }
  if (requiredDelta.includes('receipt')) {
    return 'owner_answer';
  }
  if (requiredDelta.includes('artifact')) {
    return 'artifact_delta';
  }
  return 'owner_delta';
}

function ownerAnswerOrTypedBlockerRequired(input: {
  desiredDeltaKind: string;
  acceptedAnswerShape: string[];
}) {
  if (input.desiredDeltaKind === 'none') {
    return false;
  }
  return input.desiredDeltaKind === 'owner_answer_or_typed_blocker'
    || input.desiredDeltaKind === 'owner_answer'
    || input.desiredDeltaKind === 'typed_blocker'
    || input.acceptedAnswerShape.some((shape) =>
      shape.includes('receipt')
      || shape.includes('typed_blocker')
      || shape.includes('owner_chain')
      || shape.includes('no_regression')
    );
}

function stageRefFrom(action: ReturnType<typeof compactNextSafeAction>, ownerDeltaFirst: JsonRecord) {
  return stringValue(record(ownerDeltaFirst.primary_item).stage_id)
    ?? stringValue(record(ownerDeltaFirst.selected_safe_action).stage_id)
    ?? action?.stage_id
    ?? null;
}

function defaultStopLossState() {
  return {
    status: 'not_triggered',
    lineage_repeat_count: 0,
    receipt_only_repeat_count: 0,
    platform_repair_only_repeat_count: 0,
    stale_route_repeat_count: 0,
    fresh_owner_delta_required_to_resume: false,
  };
}

function compactStopLossState(...values: unknown[]) {
  const folded = values.map(record).find((value) => stringValue(value.status));
  if (!folded) {
    return defaultStopLossState();
  }
  return {
    ...defaultStopLossState(),
    surface_kind: stringValue(folded.surface_kind),
    status: stringValue(folded.status) ?? 'not_triggered',
    lineage_repeat_count: numberValue(folded.lineage_repeat_count),
    receipt_only_repeat_count: numberValue(folded.receipt_only_repeat_count),
    platform_repair_only_repeat_count: numberValue(folded.platform_repair_only_repeat_count),
    stale_route_repeat_count: numberValue(folded.stale_route_repeat_count),
    fresh_owner_delta_required_to_resume:
      folded.fresh_owner_delta_required_to_resume === true,
    release_conditions: stringList(folded.release_conditions),
    policy_ref: stringValue(folded.policy_ref),
  };
}

function foldedOwnerDeltaRef(ownerDeltaFirst: JsonRecord, key: string) {
  return firstString(
    record(ownerDeltaFirst.primary_item)[key],
    record(ownerDeltaFirst.selected_safe_action)[key],
  );
}

export function buildDefaultNextActionFromCurrentOwnerDelta(
  currentOwnerDelta: unknown,
): JsonRecord | null {
  const delta = record(currentOwnerDelta);
  if (Object.keys(delta).length === 0) {
    return null;
  }
  const hardGate = record(delta.hard_gate);
  const desiredDeltaKind = stringValue(delta.desired_delta_kind) ?? 'none';
  const hardGateState = stringValue(hardGate.state) ?? 'none';
  if (desiredDeltaKind === 'none' && hardGateState === 'none') {
    return null;
  }
  const acceptedAnswerShape = stringList(delta.accepted_answer_shape);
  const deltaId = stringValue(delta.delta_id) ?? 'current-owner-delta';
  const owner = stringValue(delta.current_owner) ?? 'one-person-lab';
  const providerLivenessRequired = hardGate.provider_liveness_required === true;
  const ownerAnswerRequired = ownerAnswerOrTypedBlockerRequired({
    desiredDeltaKind,
    acceptedAnswerShape,
  });
  const humanOrDomainOwnerRequired = providerLivenessRequired
    ? false
    : hardGate.human_or_domain_owner_required === true || ownerAnswerRequired;
  const actionKind = providerLivenessRequired
    ? 'provider_hard_gate_required'
    : humanOrDomainOwnerRequired
      ? 'current_owner_delta_owner_answer_or_typed_blocker_required'
      : 'current_owner_delta_followthrough_required';
  return {
    surface_kind: 'opl_current_owner_delta_default_next_action',
    schema_version: 'current-owner-delta-default-next-action.v1',
    action_id: `${deltaId}:default-next-action`,
    action_kind: actionKind,
    step_kind: actionKind,
    derivation_source: 'current_owner_delta',
    default_planning_root: 'current_owner_delta',
    delta_id: deltaId,
    owner,
    current_owner: owner,
    domain_id: firstString(delta.domain_id, delta.domain),
    stage_id: firstString(delta.stage_id, delta.stage_ref),
    desired_delta_kind: desiredDeltaKind,
    payload_requirement:
      firstString(delta.payload_requirement, delta.desired_delta_description)
      ?? 'owner_delta_followthrough_required',
    required_return_shapes: acceptedAnswerShape,
    accepted_answer_shape: acceptedAnswerShape,
    missing_input_refs: stringList(delta.missing_input_refs),
    required_ref_shape: record(delta.required_ref_shape),
    stage_run_closeout_binding_ref: stringValue(delta.stage_run_closeout_binding_ref),
    stage_run_closeout_binding_policy: stringValue(delta.stage_run_closeout_binding_policy),
    hard_gate: {
      state: hardGateState,
      provider_liveness_required: providerLivenessRequired,
      human_or_domain_owner_required: humanOrDomainOwnerRequired,
      source: stringValue(hardGate.source) ?? 'owner_delta_controller',
    },
    next_safe_action_ref: `current_owner_delta:${deltaId}`,
    current_owner_delta_ref: '/current_owner_delta',
    audit_refs: record(delta.audit_refs),
    can_submit_to_safe_action_shell: false,
    route_requires_opl_runtime_refs: providerLivenessRequired,
    route_requires_domain_or_app_payload: humanOrDomainOwnerRequired,
    can_close_without_domain_or_app_payload: !humanOrDomainOwnerRequired,
    authority: 'owner_delta_default_projection_only',
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_close_owner_chain: false,
    can_close_domain_ready: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    worklist_item_is_completion_claim: false,
    raw_worklist_can_drive_default_planning: false,
    raw_evidence_can_drive_default_planning: false,
    replay_packet_can_drive_default_planning: false,
    typed_blocker_group_can_drive_default_planning: false,
    private_residue_inventory_can_drive_default_planning: false,
    audit_tail_can_drive_default_planning: false,
  };
}

function buildCurrentOwnerDeltaProjection(input: {
  currentOwner: string;
  requiredDelta: string;
  acceptedReturnShapes: string[];
  ownerDeltaFirst: JsonRecord;
  handoff: JsonRecord;
  compactAction: ReturnType<typeof compactNextSafeAction>;
  countSummary: ReturnType<typeof buildCompactCountSummary>;
  fullDetailRefs: JsonRecord;
}) {
  const currentOwner = input.currentOwner;
  const requiredDelta = input.requiredDelta;
  const domain = stringValue(input.handoff.domain_id)
    ?? stringValue(input.ownerDeltaFirst.domain_id)
    ?? foldedOwnerDeltaRef(input.ownerDeltaFirst, 'domain_id')
    ?? currentOwner;
  const stageRef = stageRefFrom(input.compactAction, input.ownerDeltaFirst);
  const auditRefs = {
    ...input.fullDetailRefs,
    owner_delta_first_ref:
      stringValue(input.fullDetailRefs.owner_delta_first_ref)
      ?? '/framework_readiness/owner_delta_first',
    audit_next_safe_action_ref: input.compactAction?.next_safe_action_ref ?? null,
  };
  const selectedActionRequiresDomainOrAppPayload =
    input.compactAction?.route_requires_domain_or_app_payload === true;
  const explicitOwnerDeltaOpen = requiredDelta !== 'no_opl_operator_actionable_delta_required';
  const blockedRefsOnly = input.countSummary.blocked_refs_only_count > 0;
  const hardGate = {
    state:
      explicitOwnerDeltaOpen
        ? 'owner_delta_open'
        : blockedRefsOnly
          ? 'domain_or_human_owner_blocked_refs_only'
          : 'none',
    provider_liveness_required: false,
    human_or_domain_owner_required:
      selectedActionRequiresDomainOrAppPayload
      || (explicitOwnerDeltaOpen && input.countSummary.payload_required_count > 0)
      || blockedRefsOnly,
    source: 'owner_delta_controller',
  };

  return {
    surface_kind: 'opl_current_owner_delta',
    schema_version: 'current-owner-delta.v1',
    projection_policy: 'default_owner_delta_root_audit_tail_passive',
    default_planning_root: 'current_owner_delta',
    audit_tail_policy:
      'raw_worklist_raw_evidence_replay_typed_blocker_group_private_residue_are_passive_until_folded',
    evidence_vault_policy: 'record_everything_plan_from_nothing',
    delta_id: [
      'current-owner-delta',
      sanitizeIdPart(domain),
      stageRef ? sanitizeIdPart(stageRef) : 'no-stage',
      sanitizeIdPart(desiredDeltaKind(requiredDelta)),
    ].join(':'),
    domain,
    domain_id: domain,
    task_or_study_ref: firstString(
      input.compactAction?.next_safe_action_ref,
      stringValue(record(input.ownerDeltaFirst.primary_item).workstream_id),
      stringValue(record(input.ownerDeltaFirst.primary_item).stage_attempt_id),
    ),
    stage_ref: stageRef,
    stage_id: stageRef,
    lineage_ref: firstString(
      stringValue(record(input.ownerDeltaFirst.primary_item).stage_attempt_id),
      input.compactAction?.next_safe_action_ref,
      stringValue(input.handoff.lineage_ref),
    ),
    source_fingerprint: [
      'owner_delta_first',
      sanitizeIdPart(currentOwner),
      sanitizeIdPart(requiredDelta),
      input.countSummary.open_safe_action_count,
      input.countSummary.blocked_refs_only_count,
    ].join(':'),
    desired_delta_kind: desiredDeltaKind(requiredDelta),
    desired_delta_description: requiredDelta,
    payload_requirement: requiredDelta,
    current_owner: currentOwner,
    owner: currentOwner,
    accepted_answer_shape: input.acceptedReturnShapes,
    required_return_shapes: input.acceptedReturnShapes,
    hard_gate: hardGate,
    advisory_warnings: [
      ...(input.countSummary.domain_dispatch_workorder_count > 0
        ? [{
            warning_id: 'domain_dispatch_workorders_are_audit_tail',
            count: input.countSummary.domain_dispatch_workorder_count,
            default_planning_role: 'audit_metric_only',
          }]
        : []),
      ...(input.countSummary.stage_replay_missing_receipt_workorder_count > 0
        ? [{
            warning_id: 'stage_replay_missing_receipts_are_audit_tail',
            count: input.countSummary.stage_replay_missing_receipt_workorder_count,
            default_planning_role: 'audit_metric_only',
          }]
        : []),
    ],
    live_attempt_ref: input.compactAction?.next_safe_action_ref ?? null,
    latest_owner_answer_ref: firstString(
      stringValue(input.handoff.latest_owner_answer_ref),
      stringValue(record(input.ownerDeltaFirst.primary_item).latest_owner_answer_ref),
    ),
    cognitive_kernel_boundary: cognitiveKernelBoundary(),
    stop_loss_state: compactStopLossState(
      input.handoff.stop_loss_state,
      input.ownerDeltaFirst.stop_loss_state,
      record(input.ownerDeltaFirst.primary_item).stop_loss_state,
    ),
    audit_refs: auditRefs,
    authority_boundary: {
      route_not_stage_strategy: true,
      route_reconciler_role: 'hydrate_reconcile_owner_routes_only',
      route_reconciler_can_generate_candidates: false,
      route_reconciler_can_evaluate_or_rank_candidates: false,
      route_reconciler_can_complete_stage: false,
      route_reconciler_can_sign_receipts: false,
      can_execute_domain_action: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_close_owner_chain: false,
      can_close_domain_ready: false,
      can_authorize_quality_or_export: false,
      can_claim_domain_ready: false,
      can_claim_production_ready: false,
      raw_worklist_can_drive_default_planning: false,
      raw_evidence_can_drive_default_planning: false,
      replay_packet_can_drive_default_planning: false,
      typed_blocker_group_can_drive_default_planning: false,
      private_residue_inventory_can_drive_default_planning: false,
      audit_tail_can_drive_default_planning: false,
      evidence_vault_event_is_progress_claim: false,
    },
  };
}

function stageRunOwnerAnswerCloseoutBindingAction(currentOwnerDelta: JsonRecord) {
  const cockpit = buildAppStageRunCockpit(currentOwnerDelta);
  const action = record(cockpit.next_required_owner_action);
  if (
    stringValue(action.derivation_source) !== 'stage_run_execution_authorization'
    || action.owner_answer_missing_before_opl_closeout_binding !== true
  ) {
    return null;
  }
  return action;
}

function withStageRunCloseoutBindingDeltaFields<T extends JsonRecord>(
  currentOwnerDelta: T,
  stageRunAction: JsonRecord | null,
): T & {
  missing_input_refs?: string[];
  required_ref_shape?: JsonRecord;
  stage_run_closeout_binding_ref?: string;
  stage_run_closeout_binding_policy?: string;
} {
  if (!stageRunAction) {
    return currentOwnerDelta;
  }
  return {
    ...currentOwnerDelta,
    missing_input_refs: stringList(stageRunAction.missing_input_refs),
    required_ref_shape: record(stageRunAction.required_ref_shape),
    stage_run_closeout_binding_ref: '/stage_run_cockpit/execution_authorization',
    stage_run_closeout_binding_policy:
      'domain_owner_answer_must_bind_stage_run_manifest_current_pointer_source_fingerprint_and_idempotency',
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
  const stageRunOwnerAnswerAction =
    stageRunOwnerAnswerCloseoutBindingAction(baseCurrentOwnerDelta);
  const currentOwnerDelta = withStageRunCloseoutBindingDeltaFields(
    baseCurrentOwnerDelta,
    stageRunOwnerAnswerAction,
  );
  const defaultNextAction = buildDefaultNextActionFromCurrentOwnerDelta(currentOwnerDelta);
  const defaultSummary = {
    summary_kind: 'owner_delta_only',
    default_path_root: 'current_owner_delta',
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
      full_detail_refs: fullDetailRefs,
    },
  };
}

export function buildIdleCurrentOwnerDeltaReadModel() {
  return buildCurrentOwnerDeltaReadModel({
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
