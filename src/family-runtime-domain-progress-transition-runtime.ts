import { stableId } from './family-runtime-ids.ts';

export const DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID = 'opl_domain_progress_transition_runtime';
export const DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE = {
  primary: 'runway',
  primary_brand: 'OPL Runway',
  supporting: {
    pack: 'ABI and generated domain command surface input',
    stagecraft: 'stage grammar, transition policy shape, and accepted answer shape',
    console: 'current owner delta and next action projection',
    vault: 'refs-only event, receipt, lineage, and replay evidence',
  },
  not_a_new_brand_module: true,
} as const;

const SUPPORTED_TRANSITIONS = new Set([
  'ConsumeOwnerReceipt',
  'StartProviderAttempt',
  'ConsumeTerminalCloseout',
  'RecordTypedBlocker',
  'OpenHumanGate',
  'MaterializeOwnerAction',
  'AdoptPaperDelta',
  'AdoptRouteBackEvidence',
  'StopLoss',
  'NonAdvancingApply',
]);

const STABLE_OUTCOMES = new Set([
  'provider_admission_enqueued_or_blocked',
  'provider_admission_accepted',
  'running_provider_attempt',
  'owner_receipt_consumed',
  'owner_receipt_ref',
  'quality_gate_receipt_ref',
  'typed_blocker_ref',
  'human_gate_ref',
  'route_back_evidence_ref',
  'paper_delta_refs',
  'terminal_stop_loss',
  'non_advancing_apply_typed_blocker_ref',
]);

export type DomainProgressTransitionBlocked = {
  reason: string;
  task: unknown;
};

export type DomainProgressTransitionCommandContext = {
  studyId: string;
  actionType?: string | null;
  workUnitId: string;
  workUnitFingerprint?: string | null;
  nextOwner?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalScalarString(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function transitionKind(command: Record<string, unknown>) {
  const kind = optionalString(command.transition_kind)
    ?? optionalString(command.command_kind)
    ?? optionalString(command.outbox_kind)
    ?? optionalString(command.recommended_transition_kind);
  if (kind === 'provider_admission_requested') {
    return 'StartProviderAttempt';
  }
  return kind;
}

function postconditionKind(command: Record<string, unknown>) {
  const postcondition = isRecord(command.postcondition) ? command.postcondition : null;
  const requiredPostcondition = isRecord(command.required_postcondition) ? command.required_postcondition : null;
  const outcome = isRecord(command.outcome) ? command.outcome : null;
  return optionalString(postcondition?.kind)
    ?? optionalString(postcondition?.required_outcome)
    ?? optionalString(requiredPostcondition?.kind)
    ?? optionalString(requiredPostcondition?.required_outcome)
    ?? optionalString(outcome?.kind)
    ?? optionalString(outcome?.status);
}

function masTransitionRequestBoundaryViolation(command: Record<string, unknown>) {
  if (optionalString(command.surface_kind) !== 'mas_domain_progress_transition_request') {
    return null;
  }
  const targetRuntimeKind = optionalString(command.target_runtime_kind) ?? optionalString(command.runtime_kind);
  if (
    targetRuntimeKind !== 'DomainProgressTransitionRuntime'
    || optionalString(command.target_runtime_owner) !== 'one-person-lab'
    || command.mas_can_create_opl_outbox_record !== false
  ) {
    return 'domain_progress_transition_request_boundary_missing';
  }
  const forbiddenRuntimeFields = [
    'current_control_command_outbox_record',
    'opl_domain_progress_transition_command',
    'opl_domain_progress_transition_event',
    'opl_domain_progress_transition_outbox_item',
    'stage_run_identity',
    'projection_metadata',
    'read_model_generation_metadata',
  ];
  if (forbiddenRuntimeFields.some((field) => field in command)) {
    return 'domain_progress_transition_request_runtime_field_forbidden';
  }
  return null;
}

function normalizeAggregateIdentity(
  command: Record<string, unknown>,
  context: DomainProgressTransitionCommandContext,
) {
  const aggregate = isRecord(command.aggregate_identity) ? command.aggregate_identity : {};
  const studyId = optionalString(aggregate.study_id) ?? optionalString(command.study_id);
  const workUnitId = optionalString(aggregate.work_unit_id) ?? optionalString(command.work_unit_id);
  const workUnitFingerprint =
    optionalString(aggregate.work_unit_fingerprint)
    ?? optionalString(command.work_unit_fingerprint)
    ?? optionalString(command.action_fingerprint)
    ?? context.workUnitFingerprint
    ?? null;
  const aggregateKind = optionalString(aggregate.aggregate_kind) ?? 'study_work_unit';
  const aggregateId = optionalString(aggregate.aggregate_id)
    ?? (studyId && workUnitId ? `${studyId}::${workUnitId}` : null);
  if (!studyId || !workUnitId || !aggregateId || !aggregateKind) {
    return null;
  }
  return {
    ...aggregate,
    aggregate_kind: aggregateKind,
    aggregate_id: aggregateId,
    study_id: studyId,
    work_unit_id: workUnitId,
    ...(workUnitFingerprint ? { work_unit_fingerprint: workUnitFingerprint } : {}),
  };
}

function stageRunIdentity(
  command: Record<string, unknown>,
  aggregateIdentity: Record<string, unknown>,
  idempotencyKey: string,
) {
  const explicit = isRecord(command.stage_run_identity) ? command.stage_run_identity : {};
  const studyId = optionalString(aggregateIdentity.study_id);
  const workUnitId = optionalString(aggregateIdentity.work_unit_id);
  return {
    stage_run_id:
      optionalString(explicit.stage_run_id)
      ?? optionalString(command.stage_run_id)
      ?? `stage-run:${studyId}:${workUnitId}`,
    route_identity_key:
      optionalString(explicit.route_identity_key)
      ?? optionalString(command.route_identity_key)
      ?? idempotencyKey,
    attempt_idempotency_key:
      optionalString(explicit.attempt_idempotency_key)
      ?? optionalString(command.attempt_idempotency_key)
      ?? idempotencyKey,
    provider_attempt_ref:
      optionalString(explicit.provider_attempt_ref)
      ?? optionalString(command.provider_attempt_ref)
      ?? `opl://provider-admission/${studyId}/${idempotencyKey}`,
    attempt_lease_ref:
      optionalString(explicit.attempt_lease_ref)
      ?? optionalString(command.attempt_lease_ref)
      ?? `opl://attempt-leases/${idempotencyKey}`,
    source_generation:
      optionalScalarString(command.source_generation)
      ?? optionalScalarString(explicit.source_generation),
  };
}

function commandId(command: Record<string, unknown>, aggregateIdentity: Record<string, unknown>) {
  return stableId('dptc', [
    command.transition_kind,
    aggregateIdentity,
    command.idempotency_key,
    command.source_generation,
    command.expected_version,
  ]);
}

export function normalizeDomainProgressTransitionCommand(
  command: Record<string, unknown>,
  context: DomainProgressTransitionCommandContext,
): { command?: Record<string, unknown>; blocked?: DomainProgressTransitionBlocked } {
  if (isRecord(command.paper_autonomy_supervisor_apply)) {
    return { blocked: { reason: 'domain_progress_transition_legacy_supervisor_apply_alias_forbidden', task: command } };
  }
  const requestBoundaryViolation = masTransitionRequestBoundaryViolation(command);
  if (requestBoundaryViolation) {
    return { blocked: { reason: requestBoundaryViolation, task: command } };
  }
  const kind = transitionKind(command);
  const aggregateIdentity = normalizeAggregateIdentity(command, context);
  const idempotencyKey = optionalString(command.idempotency_key);
  const sourceGeneration = optionalScalarString(command.source_generation);
  const expectedVersion = optionalScalarString(command.expected_version);
  const postcondition = isRecord(command.postcondition) ? command.postcondition : null;
  const requiredPostcondition = isRecord(command.required_postcondition) ? command.required_postcondition : null;
  const outcome = isRecord(command.outcome) ? command.outcome : null;
  const outcomeKind = postconditionKind(command);
  if (!kind || !SUPPORTED_TRANSITIONS.has(kind)) {
    return { blocked: { reason: 'domain_progress_transition_command_kind_missing_or_unsupported', task: command } };
  }
  if (!aggregateIdentity || !idempotencyKey || !sourceGeneration || !expectedVersion) {
    return { blocked: { reason: 'domain_progress_transition_command_identity_missing', task: command } };
  }
  if (
    optionalString(aggregateIdentity.study_id) !== context.studyId
    || optionalString(aggregateIdentity.work_unit_id) !== context.workUnitId
  ) {
    return { blocked: { reason: 'domain_progress_transition_command_identity_mismatch', task: command } };
  }
  if (!outcomeKind) {
    return { blocked: { reason: 'domain_progress_transition_command_postcondition_missing', task: command } };
  }
  return {
    command: {
      ...command,
      surface_kind: 'opl_domain_progress_transition_command',
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      runtime_owner: 'one-person-lab',
      module_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE.primary,
      brand_name: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE.primary_brand,
      transition_kind: kind,
      command_id: commandId({
        ...command,
        transition_kind: kind,
        idempotency_key: idempotencyKey,
        source_generation: sourceGeneration,
        expected_version: expectedVersion,
      }, aggregateIdentity),
      aggregate_identity: aggregateIdentity,
      action_type: optionalString(command.action_type) ?? context.actionType ?? null,
      next_owner: optionalString(command.next_owner) ?? context.nextOwner ?? null,
      idempotency_key: idempotencyKey,
      source_generation: sourceGeneration,
      expected_version: expectedVersion,
      postcondition: {
        ...(postcondition ?? {}),
        ...(requiredPostcondition ?? {}),
        kind: outcomeKind,
        exactly_one_transition_required: true,
        non_advancing_apply_on_no_outcome: true,
        outcome_owner:
          optionalString(postcondition?.outcome_owner)
          ?? optionalString(requiredPostcondition?.outcome_owner)
          ?? 'one-person-lab',
        domain_state_owner:
          optionalString(postcondition?.domain_state_owner)
          ?? optionalString(requiredPostcondition?.domain_state_owner)
          ?? 'domain-agent',
      },
      ...(outcome ? { outcome } : {}),
      stage_run_identity: stageRunIdentity(command, aggregateIdentity, idempotencyKey),
      brand_module_allocation: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
      authority_boundary: {
        opl_can_write_domain_truth: false,
        opl_can_create_domain_owner_receipt: false,
        opl_can_create_domain_typed_blocker: false,
        provider_completion_is_domain_completion: false,
      },
    },
  };
}

export function buildDomainProgressTransitionRuntimeResult(
  command: Record<string, unknown>,
) {
  const aggregateIdentity = isRecord(command.aggregate_identity) ? command.aggregate_identity : {};
  const stageIdentity = isRecord(command.stage_run_identity) ? command.stage_run_identity : {};
  const transitionKindValue = optionalString(command.transition_kind) ?? 'NonAdvancingApply';
  const eventId = stableId('dpte', [
    command.command_id,
    transitionKindValue,
    aggregateIdentity,
    command.expected_version,
  ]);
  const outcome = isRecord(command.outcome) ? command.outcome : {};
  const outcomeKind = optionalString(outcome.kind)
    ?? optionalString((isRecord(command.postcondition) ? command.postcondition : {}).kind)
    ?? 'provider_admission_enqueued_or_blocked';
  const event = {
    surface_kind: 'opl_domain_progress_transition_event',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    runtime_owner: 'one-person-lab',
    module_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE.primary,
    brand_name: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE.primary_brand,
    event_id: eventId,
    transition_kind: transitionKindValue,
    command_id: command.command_id,
    aggregate_identity: aggregateIdentity,
    stage_run_identity: stageIdentity,
    source_generation: command.source_generation,
    expected_version: command.expected_version,
    idempotency_key: command.idempotency_key,
    exactly_one_transition: true,
    outcome: {
      ...outcome,
      kind: outcomeKind,
      stable_outcome: STABLE_OUTCOMES.has(outcomeKind),
    },
    postcondition: command.postcondition,
    domain_policy_result: isRecord(command.domain_policy_result) ? command.domain_policy_result : null,
    authority_boundary: command.authority_boundary,
  };
  const outboxItem = {
    surface_kind: 'opl_domain_progress_transition_outbox_item',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    module_id: 'runway',
    outbox_item_id: stableId('dpto', [eventId, command.idempotency_key]),
    transition_event_id: eventId,
    outbox_kind: transitionKindValue === 'StartProviderAttempt'
      ? 'start_provider_attempt'
      : 'domain_progress_followup',
    aggregate_identity: aggregateIdentity,
    stage_run_identity: stageIdentity,
    idempotency_key: command.idempotency_key,
    dispatch_allowed: transitionKindValue === 'StartProviderAttempt',
    domain_truth_mutation_allowed: false,
  };
  const projectionMetadata = {
    surface_kind: 'opl_domain_progress_projection_metadata',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    authority: false,
    derived_from_event_id: eventId,
    observed_generation: command.source_generation,
    derived_generation: command.expected_version,
    lag_status: 'current',
    read_model_rebuild_owner: 'one-person-lab',
  };
  return {
    surface_kind: 'opl_domain_progress_transition_runtime_result',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    owner_module: 'runway',
    brand_module_allocation: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
    command,
    transition_event: event,
    transactional_outbox_item: outboxItem,
    projection_metadata: projectionMetadata,
    replay_evidence: {
      surface_kind: 'opl_domain_progress_replay_evidence',
      replay_status: 'exactly_one_transition',
      transition_count: 1,
      event_ids: [eventId],
      non_advancing_apply: false,
    },
  };
}

export function buildNonAdvancingApplyRuntimeResult(input: {
  command: Record<string, unknown>;
  reason?: string;
}) {
  const command = {
    ...input.command,
    transition_kind: 'NonAdvancingApply',
    outcome: {
      kind: 'non_advancing_apply_typed_blocker_ref',
      reason: input.reason ?? 'fresh_readback_did_not_advance_same_aggregate',
      stable_outcome: true,
    },
    postcondition: {
      ...(isRecord(input.command.postcondition) ? input.command.postcondition : {}),
      kind: 'non_advancing_apply_typed_blocker_ref',
      exactly_one_transition_required: true,
      non_advancing_apply_on_no_outcome: true,
    },
  };
  const result = buildDomainProgressTransitionRuntimeResult(command);
  return {
    ...result,
    replay_evidence: {
      ...result.replay_evidence,
      replay_status: 'non_advancing_apply_recorded',
      non_advancing_apply: true,
    },
  };
}

export function replayDomainProgressTransitionTrace(input: {
  traceId: string;
  steps: Array<{
    command: Record<string, unknown>;
    observed_outcome?: Record<string, unknown> | null;
  }>;
}) {
  const results = input.steps.map((step) => {
    const observedKind = isRecord(step.observed_outcome)
      ? optionalString(step.observed_outcome.kind)
      : null;
    if (!observedKind || !STABLE_OUTCOMES.has(observedKind)) {
      return buildNonAdvancingApplyRuntimeResult({
        command: step.command,
        reason: 'replay_step_has_no_stable_outcome',
      });
    }
    return buildDomainProgressTransitionRuntimeResult({
      ...step.command,
      outcome: {
        ...step.observed_outcome,
        kind: observedKind,
      },
    });
  });
  return {
    surface_kind: 'opl_domain_progress_transition_replay',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    trace_id: input.traceId,
    replay_status: results.every((result) => result.replay_evidence.transition_count === 1)
      ? 'accepted'
      : 'blocked',
    exactly_one_transition_per_step: results.every((result) => result.replay_evidence.transition_count === 1),
    non_advancing_apply_count: results.filter((result) => result.replay_evidence.non_advancing_apply).length,
    results,
  };
}
