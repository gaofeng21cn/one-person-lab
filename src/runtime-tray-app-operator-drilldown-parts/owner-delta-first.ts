import type { JsonRecord } from '../runtime-tray-snapshot-types.ts';
import { canonicalOwnerId } from '../evidence-envelope.ts';
import {
  buildAppDrilldownRefsOnlyAuthorityBoundary,
} from './authority-boundary.ts';

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

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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
  return recordList(loop.workstreams).find((item) =>
    stringValue(record(item.next_steering_action).action_id) !== 'continue_workstream_observation'
  ) ?? recordList(loop.workstreams)[0] ?? {};
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
    source: 'workstream_operating_loop',
  };
}

function firstEvidenceStep(evidenceNextSteps: JsonRecord) {
  return record(recordList(evidenceNextSteps.items)[0]);
}

function firstActionCandidate(input: {
  nextSafeAction: JsonRecord;
  evidenceStep: JsonRecord;
  workstreamAction: JsonRecord;
}) {
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
    return {
      step_kind: stringValue(input.nextSafeAction.action_kind),
      owner: primaryOwner(input.nextSafeAction.payload_owner, input.nextSafeAction.owner),
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
}) {
  const nextSafeAction = record(input.nextSafeAction);
  const workstream = firstWorkstreamRequiringOwner(input.workstreamOperatingLoop);
  const workstreamAction = nextActionFromWorkstream(workstream);
  const evidenceStep = firstEvidenceStep(input.evidenceNextSteps);
  const primary = firstActionCandidate({
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
  const workstreamNeedsOwnerDelta = Object.keys(workstreamAction).length > 0
    && stringValue(workstreamAction.step_kind) !== 'operator_observation';
  const status = workstreamNeedsOwnerDelta || goalOracleMissingCount > 0
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
      workstream_goal_oracle_missing_count: goalOracleMissingCount,
      workstream_next_steering_action_count:
        numberValue(record(input.workstreamOperatingLoop.summary).next_steering_action_count),
    },
    raw_attention_default_policy:
      'blocked_refs_only_envelopes_stage_replay_packets_and_ledger_counters_are_full_detail_drilldown_not_primary_operator_next_step',
    full_detail_sections: [
      'attention_first_payload.evidence_next_steps',
      'attention_first_payload.workstream_operating_loop',
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
