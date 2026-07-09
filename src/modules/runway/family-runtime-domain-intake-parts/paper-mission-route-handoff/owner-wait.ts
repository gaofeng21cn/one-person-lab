import {
  MAS_PAPER_MISSION_ROUTE_COMPATIBILITY_PROFILE,
  optionalString,
  type JsonRecord,
  type MasPaperMissionRouteHandoffIntakeReadback,
  type SupportedCommandKind,
} from './shared.ts';

export function waitKindFor(handoffStatus: string | null, commandKind: SupportedCommandKind | null) {
  if (handoffStatus === 'waiting_for_typed_blocker_authority'
    || commandKind === 'stop_with_typed_blocker') {
    return 'typed_blocker_authority';
  }
  if (handoffStatus === 'waiting_for_human_gate_authority'
    || commandKind === 'wait_for_human') {
    return 'human_gate_authority';
  }
  if (handoffStatus === 'waiting_for_mission_complete_authority'
    || handoffStatus === 'mission_complete'
    || commandKind === 'complete_mission') {
    return 'mission_complete';
  }
  return handoffStatus;
}

export function ownerWaitProjection(
  handoff: JsonRecord,
  readback: MasPaperMissionRouteHandoffIntakeReadback,
  waitKind: string,
) {
  const isHumanGate = waitKind === 'human_gate_authority';
  const owner = isHumanGate ? 'human_or_domain_owner' : 'med-autoscience';
  const acceptedReturnShapes = isHumanGate
    ? ['human_gate_ref', 'owner_decision_ref', 'owner_chain_ref']
    : ['domain_typed_blocker_ref', 'typed_blocker_ref', 'owner_chain_ref', 'no_regression_ref'];
  const actionKind = isHumanGate
    ? 'human_gate_resolution_required'
    : 'domain_typed_blocker_resolution_required';
  const nextRequiredDelta = isHumanGate
    ? 'record_human_gate_or_owner_decision_ref_for_domain_route'
    : 'record_domain_typed_blocker_ref_for_domain_route';
  const legacyNextRequiredDelta = isHumanGate
    ? 'record_human_gate_or_owner_decision_ref_for_mas_paper_mission'
    : 'record_domain_typed_blocker_ref_for_mas_paper_mission';
  const commandTarget = readback.route_target;
  const handoffRef = readback.opl_route_command_ref
    ?? readback.paper_mission_transaction_ref
    ?? readback.candidate_ref;
  const ownerRoute = {
    surface_kind: 'opl_mas_paper_mission_owner_route_projection',
    canonical_surface_kind: 'opl_domain_owner_route_projection',
    legacy_surface_kind: 'opl_mas_paper_mission_owner_route_projection',
    compatibility_profile: MAS_PAPER_MISSION_ROUTE_COMPATIBILITY_PROFILE,
    schema_version: 1,
    projection_kind: 'domain_owner_route',
    route_status: 'owner_wait',
    wait_kind: waitKind,
    domain_id: 'medautoscience',
    domain_truth_owner: 'med-autoscience',
    runtime_owner: 'one-person-lab',
    resolution_owner: owner,
    declared_next_owner: optionalString(handoff.next_owner),
    study_id: readback.study_id,
    mission_id: readback.mission_id,
    command_kind: readback.command_kind,
    route_target: commandTarget,
    domain_route_handoff_ref: handoffRef,
    domain_route_transaction_ref: readback.domain_route_transaction_ref,
    domain_route_command_ref: readback.domain_route_command_ref,
    paper_mission_transaction_ref: readback.paper_mission_transaction_ref,
    opl_route_command_ref: readback.opl_route_command_ref,
    route_identity_key: readback.route_identity_key,
    request_idempotency_key: readback.request_idempotency_key,
    can_submit_to_opl_runtime: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_create_human_gate: false,
    can_claim_paper_progress: false,
    can_claim_domain_progress: false,
    can_claim_domain_ready: false,
    can_claim_quality_verdict: false,
  };
  const nextAction = {
    surface_kind: 'opl_mas_paper_mission_owner_route_next_action',
    canonical_surface_kind: 'opl_domain_owner_route_next_action',
    legacy_surface_kind: 'opl_mas_paper_mission_owner_route_next_action',
    compatibility_profile: MAS_PAPER_MISSION_ROUTE_COMPATIBILITY_PROFILE,
    schema_version: 1,
    projection_kind: 'domain_owner_route_next_action',
    action_kind: actionKind,
    step_kind: actionKind,
    owner,
    current_owner: owner,
    domain_id: 'medautoscience',
    study_id: readback.study_id,
    mission_id: readback.mission_id,
    route_status: 'owner_wait',
    wait_kind: waitKind,
    next_required_delta: nextRequiredDelta,
    payload_requirement: nextRequiredDelta,
    legacy_next_required_delta: legacyNextRequiredDelta,
    legacy_payload_requirement: legacyNextRequiredDelta,
    accepted_return_shapes: acceptedReturnShapes,
    required_return_shapes: acceptedReturnShapes,
    handoff_ref: handoffRef,
    can_submit_to_opl_runtime: false,
    can_execute_domain_action: false,
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_create_typed_blocker: false,
    can_claim_paper_progress: false,
    can_claim_domain_progress: false,
    can_claim_domain_ready: false,
    can_claim_quality_verdict: false,
  };
  const handoffProjection = {
    surface_kind: 'opl_mas_paper_mission_executable_owner_handoff_projection',
    canonical_surface_kind: 'opl_domain_executable_owner_handoff_projection',
    legacy_surface_kind: 'opl_mas_paper_mission_executable_owner_handoff_projection',
    compatibility_profile: MAS_PAPER_MISSION_ROUTE_COMPATIBILITY_PROFILE,
    schema_version: 1,
    projection_kind: 'domain_executable_owner_handoff',
    handoff_status: 'ready_for_owner_consumption',
    handoff_kind: isHumanGate ? 'human_gate_authority_handoff' : 'typed_blocker_authority_handoff',
    owner,
    domain_id: 'medautoscience',
    input_refs: [
      readback.paper_mission_transaction_ref,
      readback.opl_route_command_ref,
      readback.candidate_ref,
    ].filter((value): value is string => typeof value === 'string' && value.length > 0),
    payload: {
      study_id: readback.study_id,
      mission_id: readback.mission_id,
      command_kind: readback.command_kind,
      route_target: commandTarget,
      domain_route_handoff_ref: handoffRef,
      domain_route_transaction_ref: readback.domain_route_transaction_ref,
      domain_route_command_ref: readback.domain_route_command_ref,
      paper_mission_transaction_ref: readback.paper_mission_transaction_ref,
      opl_route_command_ref: readback.opl_route_command_ref,
      route_identity_key: readback.route_identity_key,
      request_idempotency_key: readback.request_idempotency_key,
    },
    expected_return_shapes: acceptedReturnShapes,
    opl_authority_boundary: {
      can_submit_to_runtime_queue: false,
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_create_typed_blocker: false,
      can_create_human_gate: false,
      can_claim_paper_progress: false,
      can_claim_domain_progress: false,
      can_claim_domain_ready: false,
      can_claim_quality_verdict: false,
    },
  };
  return { ownerRoute, nextAction, handoffProjection };
}
