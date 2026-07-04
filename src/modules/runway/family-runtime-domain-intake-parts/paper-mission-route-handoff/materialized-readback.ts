import {
  booleanTrue,
  HANDOFF_SURFACE_KIND,
  isRuntimeIntakeCommand,
  MATERIALIZED_READBACK_SURFACE_KIND,
  nestedRecord,
  optionalString,
  supportedCommandKind,
  type JsonRecord,
} from './shared.ts';

function transactionRefFromTerminalDecisionRef(value: string | null) {
  const suffix = '#stage_terminal_decision';
  return value?.endsWith(suffix) ? value.slice(0, -suffix.length) : null;
}

function routeCommandRefFromTransactionRef(value: string | null) {
  return value ? `${value}#opl_route_command` : null;
}

function materializedHandoffStatus(commandKind: string | null) {
  if (
    commandKind === 'start_next_stage'
    || commandKind === 'resume_stage'
    || commandKind === 'route_back'
  ) {
    return 'ready_for_opl_route_command';
  }
  if (commandKind === 'stop_with_typed_blocker') {
    return 'waiting_for_typed_blocker_authority';
  }
  if (commandKind === 'wait_for_human') {
    return 'waiting_for_human_gate_authority';
  }
  if (commandKind === 'complete_mission') {
    return 'mission_complete';
  }
  return null;
}

function anyBooleanTrue(...values: unknown[]) {
  return values.some((value) => booleanTrue(value));
}

function materializedAuthorityBoundary(payload: JsonRecord) {
  const transaction = nestedRecord(payload, 'paper_mission_transaction');
  const transactionAuthority = nestedRecord(transaction ?? {}, 'authority_boundary')
    ?? nestedRecord(payload, 'authority_boundary');
  const carrier = nestedRecord(payload, 'opl_runtime_carrier');
  const carrierAuthority = nestedRecord(carrier ?? {}, 'authority_boundary')
    ?? nestedRecord(payload, 'stage_transition_authority_boundary');
  if (!transactionAuthority && !carrierAuthority) {
    return null;
  }
  return {
    writes_authority_surface: anyBooleanTrue(
      transactionAuthority?.writes_authority_surface,
      payload.writes_authority_surface,
    ),
    writes_publication_eval: anyBooleanTrue(
      transactionAuthority?.writes_publication_eval,
      payload.writes_publication_eval,
    ),
    writes_controller_decision: anyBooleanTrue(
      transactionAuthority?.writes_controller_decision,
      payload.writes_controller_decision,
    ),
    can_write_owner_receipt: anyBooleanTrue(
      transactionAuthority?.writes_owner_receipt,
      payload.can_write_owner_receipt,
    ),
    can_write_typed_blocker: anyBooleanTrue(
      transactionAuthority?.writes_typed_blocker,
      payload.can_write_typed_blocker,
    ),
    can_write_human_gate: anyBooleanTrue(
      transactionAuthority?.writes_human_gate,
      payload.can_write_human_gate,
    ),
    can_write_current_package: anyBooleanTrue(
      transactionAuthority?.writes_current_package,
      payload.can_write_current_package,
    ),
    can_write_paper_body: anyBooleanTrue(payload.can_write_paper_body),
    can_write_runtime_queue: anyBooleanTrue(
      transactionAuthority?.writes_runtime_queue,
      payload.can_write_runtime_queue,
    ),
    can_write_opl_outbox: anyBooleanTrue(
      carrier?.can_write_opl_outbox,
      carrierAuthority?.mas_can_create_opl_outbox_record,
      payload.can_write_opl_outbox,
    ),
    can_write_opl_event: anyBooleanTrue(
      carrier?.can_write_opl_event,
      carrierAuthority?.mas_can_create_opl_event,
      payload.can_write_opl_event,
    ),
    can_write_opl_stage_run: anyBooleanTrue(
      carrier?.can_write_opl_stage_run,
      carrierAuthority?.mas_can_create_opl_stage_run,
      payload.can_write_opl_stage_run,
    ),
    can_write_provider_attempt: anyBooleanTrue(
      carrier?.can_write_provider_attempt,
      carrierAuthority?.mas_can_authorize_provider_admission,
      payload.can_write_provider_attempt,
    ),
    writes_yang_authority: anyBooleanTrue(
      transactionAuthority?.writes_yang_authority,
      payload.writes_yang_authority,
    ),
  };
}

export function materializedReadbackToHandoff(payload: JsonRecord) {
  const carrier = nestedRecord(payload, 'opl_runtime_carrier');
  const routeCommand = nestedRecord(payload, 'opl_route_command')
    ?? nestedRecord(carrier ?? {}, 'opl_route_command');
  const terminalDecision = nestedRecord(payload, 'stage_terminal_decision');
  const transaction = nestedRecord(payload, 'paper_mission_transaction');
  const terminalDecisionRef = optionalString(carrier?.stage_terminal_decision_ref)
    ?? optionalString(routeCommand?.source_terminal_decision_ref);
  const transactionRef = optionalString(carrier?.paper_mission_transaction_ref)
    ?? optionalString(transaction?.transaction_id)
    ?? transactionRefFromTerminalDecisionRef(terminalDecisionRef);
  const commandKind = optionalString(routeCommand?.command_kind);
  const handoffStatus = materializedHandoffStatus(commandKind);
  return {
    surface_kind: HANDOFF_SURFACE_KIND,
    source_surface_kind: MATERIALIZED_READBACK_SURFACE_KIND,
    schema_version: 1,
    source: optionalString(payload.source) ?? MATERIALIZED_READBACK_SURFACE_KIND,
    study_id: optionalString(payload.study_id) ?? optionalString(carrier?.study_id),
    mission_id: optionalString(payload.mission_id)
      ?? optionalString(nestedRecord(carrier ?? {}, 'aggregate_identity')?.mission_id),
    candidate_ref: optionalString(payload.candidate_manifest_ref)
      ?? optionalString(payload.materialized_mission_ref),
    status: optionalString(terminalDecision?.status)
      ?? optionalString(payload.transaction_state),
    selected_outcome: optionalString(terminalDecision?.accepted_result)
      ?? optionalString(terminalDecision?.decision_kind)
      ?? optionalString(payload.transaction_state),
    handoff_status: handoffStatus,
    next_owner: optionalString(terminalDecision?.next_owner),
    paper_mission_transaction_ref: transactionRef,
    transaction_state: optionalString(payload.transaction_state),
    opl_route_command_ref: optionalString(carrier?.opl_route_command_ref)
      ?? routeCommandRefFromTransactionRef(transactionRef),
    route_identity_key: optionalString(carrier?.route_identity_key)
      ?? optionalString(payload.route_identity_key),
    attempt_idempotency_key: optionalString(carrier?.attempt_idempotency_key)
      ?? optionalString(payload.attempt_idempotency_key),
    request_idempotency_key: optionalString(carrier?.request_idempotency_key)
      ?? optionalString(payload.request_idempotency_key),
    opl_route_command: routeCommand ?? {},
    route_command_kind: commandKind,
    route_target: optionalString(routeCommand?.target),
    stage_terminal_decision_ref: terminalDecisionRef,
    materialized_mission_ref: optionalString(payload.materialized_mission_ref),
    workspace_root: optionalString(payload.workspace_root),
    domain_workspace_root: optionalString(payload.domain_workspace_root),
    repo_root: optionalString(payload.repo_root),
    profile_ref: optionalString(payload.profile_ref),
    transaction_materialized: true,
    can_submit_to_opl_runtime:
      handoffStatus === 'ready_for_opl_route_command'
      && supportedCommandKind(commandKind)
      && isRuntimeIntakeCommand(commandKind),
    can_claim_opl_runtime_enqueued: booleanTrue(payload.can_claim_opl_runtime_enqueued),
    can_claim_opl_stage_run_created: booleanTrue(payload.can_claim_opl_stage_run_created),
    can_claim_provider_running: booleanTrue(carrier?.can_claim_provider_running)
      || booleanTrue(payload.can_claim_provider_running),
    can_claim_paper_progress: booleanTrue(carrier?.can_claim_paper_progress)
      || booleanTrue(payload.can_claim_paper_progress),
    can_claim_runtime_ready: booleanTrue(carrier?.can_claim_runtime_ready)
      || booleanTrue(payload.can_claim_runtime_ready),
    authority_boundary: materializedAuthorityBoundary(payload),
    source_stage_terminal_decision: terminalDecision ?? {},
  };
}
