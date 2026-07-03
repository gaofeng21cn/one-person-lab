import { canonicalOwnerId } from '../../ledger/index.ts';
import {
  countValue as numberValue,
  record,
  recordList,
  stringList,
  stringValue,
  type JsonRecord,
} from '../../../kernel/json-record.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function concreteOwner(...values: unknown[]) {
  const generic = 'domain_repository_or_app_live_operator';
  const owner = firstString(...values.filter((value) => stringValue(value) !== generic))
    ?? firstString(...values)
    ?? generic;
  return owner === generic ? owner : canonicalOwnerId(owner);
}

function primaryOwner(...values: unknown[]) {
  const generic = 'domain_repository_or_app_live_operator';
  const owner = firstString(...values) ?? generic;
  return owner === generic ? owner : canonicalOwnerId(owner);
}

function selectedPayloadOwnerFirst(input: {
  nextSafeAction: JsonRecord;
  primary: JsonRecord;
  evidenceNextSteps: JsonRecord;
}) {
  const generic = 'domain_repository_or_app_live_operator';
  const primarySource = stringValue(input.primary.source);
  if (primarySource === 'domain_current_work_unit') {
    return concreteOwner(
      input.primary.owner,
      input.primary.current_owner,
      input.primary.domain_id,
      input.evidenceNextSteps.next_owner,
      'one-person-lab',
    );
  }
  if (primarySource === 'workstream_operating_loop') {
    return concreteOwner(
      input.primary.owner,
      input.primary.domain_id,
      input.evidenceNextSteps.next_owner,
      input.primary.payload_owner,
      'one-person-lab',
    );
  }
  const selectedPayloadOwner = stringValue(input.nextSafeAction.payload_owner);
  if (selectedPayloadOwner && selectedPayloadOwner !== generic) {
    return canonicalOwnerId(selectedPayloadOwner);
  }
  if (
    selectedPayloadOwner === generic
    && input.nextSafeAction.route_requires_domain_or_app_payload === true
  ) {
    return generic;
  }
  return primaryOwner(
    selectedPayloadOwner,
    input.primary.payload_owner,
    input.primary.owner,
    input.evidenceNextSteps.next_owner,
    input.nextSafeAction.owner,
    'one-person-lab',
  );
}

function firstWorkstreamRequiringOwner(loop: JsonRecord) {
  const actionableWorkstreams = recordList(loop.workstreams).filter((item) =>
    stringValue(record(item.next_steering_action).action_id) !== 'continue_workstream_observation'
  );
  const defaultOwnerDeltaEligibleWorkstreams = actionableWorkstreams.filter((item) =>
    !isUnboundDispatchTargetAnchorProvenance(item)
  );
  const closedActionableWorkstreams = defaultOwnerDeltaEligibleWorkstreams.filter((item) =>
    stringValue(item.heartbeat_status) === 'closed'
    || stringValue(item.closeout_receipt_status) === 'accepted_typed_closeout'
    || stringValue(item.attempt_status) === 'completed'
    || stringValue(item.local_status) === 'completed'
  );
  return defaultOwnerDeltaEligibleWorkstreams
    .filter((item) => item.default_actionable === true)
    .sort(compareWorkstreamCurrentness)[0]
    ?? closedActionableWorkstreams
      .filter((item) => stringValue(item.default_actionability_status) !== 'superseded')
      .sort(compareWorkstreamCurrentness)[0]
    ?? defaultOwnerDeltaEligibleWorkstreams
      .filter((item) => stringValue(item.default_actionability_status) !== 'superseded')
      .sort(compareWorkstreamCurrentness)[0]
    ?? recordList(loop.workstreams)
      .filter((item) => stringValue(item.default_actionability_status) !== 'superseded')
      .filter((item) => !isUnboundDispatchTargetAnchorProvenance(item))
      .sort(compareWorkstreamCurrentness)[0]
    ?? {};
}

function isUnboundDispatchTargetAnchorProvenance(workstream: JsonRecord) {
  return stringValue(workstream.default_actionability_status)
      === 'not_actionable_unbound_dispatch_identity'
    && stringValue(record(workstream.next_steering_action).action_id)
      === 'record_owner_or_gate_for_target_anchor'
    && !hasOwnerAnswerOrHandoffAnchor(workstream);
}

function hasOwnerAnswerOrHandoffAnchor(workstream: JsonRecord) {
  return [
    'owner_receipt_refs',
    'typed_blocker_refs',
    'quality_gate_refs',
    'owner_handoff_packet_refs',
    'stage_pack_refs',
  ].some((key) => stringList(workstream[key]).length > 0);
}

function timestampMs(value: unknown) {
  const text = stringValue(value);
  if (!text) {
    return 0;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function eventSequence(value: unknown) {
  const text = stringValue(value);
  if (!text) {
    return 0;
  }
  const match = text.match(/(?:truth-event|runtime-health-event)-(\d+)/);
  if (match?.[1]) {
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return timestampMs(text);
}

function heartbeatRank(value: unknown) {
  const status = stringValue(value);
  if (status === 'running' || status === 'checkpointed') {
    return 3;
  }
  if (status === 'blocked') {
    return 2;
  }
  if (status === 'closed') {
    return 1;
  }
  return 0;
}

function compareWorkstreamCurrentness(left: JsonRecord, right: JsonRecord) {
  return heartbeatRank(right.heartbeat_status) - heartbeatRank(left.heartbeat_status)
    || timestampMs(right.updated_at) - timestampMs(left.updated_at)
    || timestampMs(right.created_at) - timestampMs(left.created_at)
    || String(right.stage_attempt_id ?? '').localeCompare(String(left.stage_attempt_id ?? ''));
}

function nextActionFromWorkstream(workstream: JsonRecord) {
  const action = record(workstream.next_steering_action);
  if (Object.keys(action).length === 0) {
    return {};
  }
  return {
    step_kind: stringValue(action.action_kind) ?? stringValue(action.action_id),
    owner: concreteOwner(workstream.domain_id, action.owner),
    status: stringValue(action.status),
    domain_id: stringValue(workstream.domain_id),
    stage_id: stringValue(workstream.stage_id),
    stage_attempt_id: stringValue(workstream.stage_attempt_id),
    workstream_id: stringValue(workstream.workstream_id),
    required_refs_any_of: stringList(action.required_next_refs_any_of),
    artifact_review_refs: stringList(action.artifact_review_refs),
    typed_blocker_refs: stringList(action.typed_blocker_refs),
    latest_owner_answer_ref: stringValue(workstream.latest_owner_answer_ref),
    latest_owner_answer_kind: stringValue(workstream.latest_owner_answer_kind),
    latest_owner_answer_is_domain_ready_verdict:
      workstream.latest_owner_answer_is_domain_ready_verdict === true,
    source: 'workstream_operating_loop',
  };
}

function currentWorkUnitOwnerPriority(item: JsonRecord) {
  const status = stringValue(item.status);
  const owner = concreteOwner(item.current_owner, item.owner);
  if (status === 'typed_blocker' && owner === 'one-person-lab') {
    return 50;
  }
  if (status === 'typed_blocker') {
    return 40;
  }
  if (owner === 'one-person-lab') {
    return 35;
  }
  if (status === 'executable_owner_action') {
    return 30;
  }
  if (owner !== 'domain_repository_or_app_live_operator') {
    return 20;
  }
  return 0;
}

function compareCurrentWorkUnitCurrentness(left: JsonRecord, right: JsonRecord) {
  const rightBasis = record(right.currentness_basis);
  const leftBasis = record(left.currentness_basis);
  return currentWorkUnitOwnerPriority(right) - currentWorkUnitOwnerPriority(left)
    || eventSequence(rightBasis.truth_epoch) - eventSequence(leftBasis.truth_epoch)
    || eventSequence(rightBasis.runtime_health_epoch) - eventSequence(leftBasis.runtime_health_epoch)
    || String(right.study_id ?? '').localeCompare(String(left.study_id ?? ''));
}

function firstDomainCurrentWorkUnit(projection: JsonRecord) {
  return recordList(projection.items)
    .filter((item) =>
      stringValue(item.status)
      || stringValue(item.current_owner)
      || stringValue(item.owner)
      || stringValue(item.work_unit_id)
      || stringValue(item.work_unit_fingerprint)
    )
    .sort(compareCurrentWorkUnitCurrentness)[0] ?? {};
}

function nextActionFromCurrentWorkUnit(currentWorkUnit: JsonRecord) {
  if (Object.keys(currentWorkUnit).length === 0) {
    return {};
  }
  const currentnessBasis = record(currentWorkUnit.currentness_basis);
  const typedBlocker = record(record(currentWorkUnit.current_execution_envelope).typed_blocker);
  return {
    step_kind: 'domain_current_work_unit',
    owner: concreteOwner(currentWorkUnit.current_owner, currentWorkUnit.owner),
    status: stringValue(currentWorkUnit.status),
    domain_id: stringValue(currentWorkUnit.domain_id),
    study_id: stringValue(currentWorkUnit.study_id),
    stage_id: stringValue(currentWorkUnit.stage_id),
    action_type: stringValue(currentWorkUnit.action_type),
    work_unit_id: stringValue(currentWorkUnit.work_unit_id),
    work_unit_fingerprint: stringValue(currentWorkUnit.work_unit_fingerprint),
    stage_attempt_id: firstString(
      currentWorkUnit.stage_attempt_id,
      currentnessBasis.stage_attempt_id,
      typedBlocker.stage_attempt_id,
    ),
    source_refs: stringList(currentWorkUnit.source_refs),
    source_projection_ref: stringValue(currentWorkUnit.source_projection_ref),
    currentness_basis: currentnessBasis,
    current_execution_envelope: record(currentWorkUnit.current_execution_envelope),
    current_executable_owner_action: record(currentWorkUnit.current_executable_owner_action),
    authority_boundary: record(currentWorkUnit.authority_boundary),
    required_return_shapes: [
      'domain_owner_receipt_ref',
      'quality_gate_receipt_ref',
      'typed_blocker_ref',
      'human_gate_ref',
      'route_back_evidence_ref',
    ],
    source: 'domain_current_work_unit',
  };
}

function firstEvidenceStep(evidenceNextSteps: JsonRecord) {
  return record(recordList(evidenceNextSteps.items)[0]);
}

function firstActionCandidate(input: {
  currentWorkUnitAction: JsonRecord;
  nextSafeAction: JsonRecord;
  evidenceStep: JsonRecord;
  workstreamAction: JsonRecord;
}) {
  if (Object.keys(input.currentWorkUnitAction).length > 0) {
    return input.currentWorkUnitAction;
  }
  if (Object.keys(input.workstreamAction).length > 0) {
    return input.workstreamAction;
  }
  if (Object.keys(input.evidenceStep).length > 0) {
    return {
      step_kind: stringValue(input.evidenceStep.step_kind),
      owner: firstString(input.evidenceStep.owner, input.evidenceStep.payload_owner),
      status: stringValue(input.evidenceStep.status),
      domain_id: stringValue(input.evidenceStep.domain_id),
      stage_id: stringValue(input.evidenceStep.stage_id),
      stage_attempt_id: stringValue(input.evidenceStep.stage_attempt_id),
      required_refs_any_of: stringList(input.evidenceStep.required_refs_any_of),
      required_return_shapes: stringList(input.evidenceStep.required_return_shapes),
      payload_owner: stringValue(input.evidenceStep.payload_owner),
      payload_path_policy: stringValue(input.evidenceStep.payload_path_policy),
      full_detail_section: stringValue(input.evidenceStep.full_detail_section),
      source: 'evidence_next_steps',
    };
  }
  if (Object.keys(input.nextSafeAction).length > 0) {
    const selectedActionPayloadRequired =
      input.nextSafeAction.route_requires_domain_or_app_payload === true;
    return {
      step_kind: stringValue(input.nextSafeAction.action_kind),
      owner: selectedActionPayloadRequired
        ? primaryOwner(input.nextSafeAction.payload_owner, input.nextSafeAction.owner)
        : primaryOwner(input.nextSafeAction.owner, input.nextSafeAction.payload_owner),
      status: stringValue(input.nextSafeAction.open_reason)
        ?? stringValue(input.nextSafeAction.route_status_detail)
        ?? 'safe_action_available',
      domain_id: stringValue(input.nextSafeAction.domain_id),
      stage_id: stringValue(input.nextSafeAction.stage_id),
      stage_attempt_id: stringValue(input.nextSafeAction.stage_attempt_id),
      action_id: stringValue(input.nextSafeAction.action_id),
      required_refs_any_of: stringList(input.nextSafeAction.required_operator_payload_refs),
      required_return_shapes: stringList(input.nextSafeAction.required_return_shapes),
      payload_owner: stringValue(input.nextSafeAction.payload_owner),
      source: 'selected_safe_action',
    };
  }
  return {};
}

function requiredDelta(input: {
  primary: JsonRecord;
  workstreamAction: JsonRecord;
  nextSafeAction: JsonRecord;
}) {
  const primaryStep = stringValue(input.primary.step_kind);
  if (primaryStep === 'owner_steering_required') {
    return 'domain_owner_receipt_quality_gate_or_typed_blocker_required';
  }
  if (primaryStep === 'artifact_first_review') {
    return 'artifact_review_or_domain_owner_receipt_required';
  }
  if (primaryStep === 'typed_blocker_followthrough') {
    return 'typed_blocker_owner_followthrough_required';
  }
  if (primaryStep === 'domain_dispatch_evidence_group_workorder'
    || primaryStep === 'domain_dispatch_evidence_workorder') {
    return 'domain_dispatch_owner_receipt_or_typed_blocker_payload_required';
  }
  if (primaryStep === 'domain_current_work_unit') {
    return 'domain_current_work_unit_owner_action_or_typed_blocker_required';
  }
  if (primaryStep === 'owner_payload_group_scaleout') {
    return 'owner_payload_ref_or_typed_blocker_payload_required';
  }
  if (primaryStep === 'evidence_envelope_scaleout') {
    return 'domain_or_app_owner_payload_ref_or_typed_blocker_required';
  }
  return firstString(
    input.nextSafeAction.progress_first_required_next_action,
    input.nextSafeAction.provider_required_next_action,
    input.nextSafeAction.provider_worker_required_next_action,
    stringValue(input.primary.status),
  ) ?? 'no_opl_operator_actionable_delta_required';
}

export function buildOwnerDeltaFirstProjection(input: {
  nextSafeAction: JsonRecord | null;
  evidenceAfterContract: JsonRecord;
  evidenceNextSteps: JsonRecord;
  workstreamOperatingLoop: JsonRecord;
  domainCurrentWorkUnitProjection?: JsonRecord;
}) {
  const nextSafeAction = record(input.nextSafeAction);
  const currentWorkUnit = firstDomainCurrentWorkUnit(
    record(input.domainCurrentWorkUnitProjection),
  );
  const currentWorkUnitAction = nextActionFromCurrentWorkUnit(currentWorkUnit);
  const workstream = firstWorkstreamRequiringOwner(input.workstreamOperatingLoop);
  const workstreamAction = nextActionFromWorkstream(workstream);
  const evidenceStep = firstEvidenceStep(input.evidenceNextSteps);
  const primary = firstActionCandidate({
    currentWorkUnitAction,
    nextSafeAction,
    evidenceStep,
    workstreamAction,
  });
  const owner = selectedPayloadOwnerFirst({
    nextSafeAction,
    primary,
    evidenceNextSteps: input.evidenceNextSteps,
  });
  const safeActionAvailable = Object.keys(nextSafeAction).length > 0;
  const totalEvidenceNextStepCount = numberValue(input.evidenceNextSteps.total_count);
  const goalOracleMissingCount =
    numberValue(record(input.workstreamOperatingLoop.summary).goal_oracle_missing_count);
  const domainBlockedAttentionCount =
    numberValue(input.evidenceAfterContract.domain_blocked_attention_count);
  const requiredRefsAnyOf = stringList(primary.required_refs_any_of);
  const nextRequiredDelta = requiredDelta({
    primary,
    workstreamAction,
    nextSafeAction,
  });
  const currentWorkUnitNeedsOwnerDelta = Object.keys(currentWorkUnitAction).length > 0;
  const workstreamNeedsOwnerDelta = Object.keys(workstreamAction).length > 0
    && stringValue(workstreamAction.step_kind) !== 'operator_observation';
  const status = currentWorkUnitNeedsOwnerDelta || workstreamNeedsOwnerDelta || goalOracleMissingCount > 0
    ? 'owner_delta_required'
    : safeActionAvailable
      ? 'operator_safe_action_available'
      : totalEvidenceNextStepCount > 0
      ? 'owner_delta_required'
      : domainBlockedAttentionCount > 0
        ? 'blocked_refs_only_owner_delta_required'
        : 'no_operator_delta_required';

  return {
    surface_kind: 'opl_owner_delta_first_projection',
    projection_policy:
      'default_operator_surface_prioritizes_next_owner_delta_raw_refs_only_counters_are_drilldown',
    status,
    next_owner: owner,
    next_required_delta: nextRequiredDelta,
    required_refs_any_of: requiredRefsAnyOf,
    required_return_shapes: stringList(primary.required_return_shapes),
    primary_item: primary,
    domain_current_work_unit_item:
      Object.keys(currentWorkUnit).length > 0 ? currentWorkUnit : null,
    selected_safe_action: Object.keys(nextSafeAction).length > 0 ? nextSafeAction : null,
    workstream_item: Object.keys(workstream).length > 0 ? workstream : null,
    evidence_next_step: Object.keys(evidenceStep).length > 0 ? evidenceStep : null,
    summary: {
      safe_action_available: safeActionAvailable,
      evidence_next_step_count: totalEvidenceNextStepCount,
      evidence_next_step_omitted_count: numberValue(input.evidenceNextSteps.omitted_count),
      owner_payload_required_attention_count:
        numberValue(input.evidenceAfterContract.operator_payload_required_attention_count),
      domain_blocked_attention_count: domainBlockedAttentionCount,
      workstream_count: numberValue(record(input.workstreamOperatingLoop.summary).workstream_count),
      domain_current_work_unit_count:
        numberValue(record(record(input.domainCurrentWorkUnitProjection).summary).current_work_unit_count),
      workstream_goal_oracle_missing_count: goalOracleMissingCount,
      workstream_next_steering_action_count:
        numberValue(record(input.workstreamOperatingLoop.summary).next_steering_action_count),
    },
    raw_attention_default_policy:
      'blocked_refs_only_envelopes_stage_replay_packets_and_ledger_counters_are_full_detail_drilldown_not_primary_operator_next_step',
    full_detail_sections: [
      'attention_first_payload.evidence_next_steps',
      'attention_first_payload.workstream_operating_loop',
      'attention_first_payload.domain_current_work_unit_projection',
      'evidence_envelope',
      'stage_production_evidence',
      'domain_dispatch_evidence',
    ],
    authority_boundary: {
      ...buildAppDrilldownRefsOnlyAuthorityBoundary(),
      owner_delta_first_is_projection_only: true,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
    },
  };
}
