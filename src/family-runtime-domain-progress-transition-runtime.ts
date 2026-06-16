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

export type DomainProgressTransitionRuntimeLog = {
  surface_kind: 'opl_domain_progress_transition_command_event_log';
  runtime_id: typeof DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID;
  storage_contract: 'jsonl_friendly_append_only';
  entries: Array<Record<string, unknown>>;
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

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => optionalString(item)).filter((item): item is string => Boolean(item))
    : [];
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

function aggregateIdentityKey(aggregateIdentity: Record<string, unknown>) {
  return stableId('dpta', [
    optionalString(aggregateIdentity.aggregate_kind) ?? 'aggregate',
    optionalString(aggregateIdentity.aggregate_id),
    optionalString(aggregateIdentity.study_id),
    optionalString(aggregateIdentity.work_unit_id),
    optionalString(aggregateIdentity.work_unit_fingerprint),
  ]);
}

function aggregateIdentityMatches(left: Record<string, unknown>, right: Record<string, unknown>) {
  return aggregateIdentityKey(left) === aggregateIdentityKey(right);
}

function logEntryAggregateIdentity(entry: Record<string, unknown>) {
  const aggregateIdentity = isRecord(entry.aggregate_identity)
    ? entry.aggregate_identity
    : isRecord(entry.payload) && isRecord(entry.payload.aggregate_identity)
      ? entry.payload.aggregate_identity
      : null;
  return aggregateIdentity;
}

function logEntryVersion(entry: Record<string, unknown>) {
  return numberValue(entry.aggregate_version)
    ?? (isRecord(entry.payload) ? numberValue(entry.payload.aggregate_version) : null);
}

function currentAggregateVersionFromEntries(
  entries: Array<Record<string, unknown>>,
  aggregateIdentity: Record<string, unknown>,
) {
  const versions = entries
    .filter((entry) => optionalString(entry.entry_kind) === 'event')
    .filter((entry) => {
      const entryAggregateIdentity = logEntryAggregateIdentity(entry);
      return entryAggregateIdentity
        ? aggregateIdentityMatches(entryAggregateIdentity, aggregateIdentity)
        : false;
    })
    .map((entry) => logEntryVersion(entry))
    .filter((version): version is number => typeof version === 'number');
  return versions.length > 0 ? Math.max(...versions) : 0;
}

function transitionRuntimeLogEntries(input: {
  command: Record<string, unknown>;
  event: Record<string, unknown>;
  outboxItem: Record<string, unknown>;
  transactionId: string;
  aggregateVersion: number;
}) {
  const aggregateIdentity = isRecord(input.event.aggregate_identity)
    ? input.event.aggregate_identity
    : {};
  const base = {
    surface_kind: 'opl_domain_progress_transition_log_entry',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    transaction_id: input.transactionId,
    aggregate_identity: aggregateIdentity,
    aggregate_version: input.aggregateVersion,
    idempotency_key: optionalString(input.event.idempotency_key),
    jsonl_friendly: true,
    body_fields_included: false,
  };
  return [
    {
      ...base,
      entry_kind: 'command',
      sequence_in_transaction: 0,
      command_id: input.command.command_id,
      payload_ref: `opl://domain-progress-transition/commands/${encodeURIComponent(String(input.command.command_id))}`,
      payload: input.command,
    },
    {
      ...base,
      entry_kind: 'event',
      sequence_in_transaction: 1,
      event_id: input.event.event_id,
      payload_ref: `opl://domain-progress-transition/events/${encodeURIComponent(String(input.event.event_id))}`,
      payload: input.event,
    },
    {
      ...base,
      entry_kind: 'outbox_item',
      sequence_in_transaction: 2,
      outbox_item_id: input.outboxItem.outbox_item_id,
      payload_ref: `opl://domain-progress-transition/outbox/${encodeURIComponent(String(input.outboxItem.outbox_item_id))}`,
      payload: input.outboxItem,
    },
  ];
}

function idempotencyReadback(input: {
  command: Record<string, unknown>;
  event: Record<string, unknown>;
  outboxItem: Record<string, unknown>;
  transactionId: string;
  aggregateVersion: number;
}) {
  return {
    surface_kind: 'opl_domain_progress_transition_idempotency_readback',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    idempotency_key: optionalString(input.event.idempotency_key),
    command_id: input.command.command_id,
    event_id: input.event.event_id,
    outbox_item_id: input.outboxItem.outbox_item_id,
    transaction_id: input.transactionId,
    aggregate_identity: input.event.aggregate_identity,
    current_aggregate_version: input.aggregateVersion,
    dedupe_key: optionalString(input.outboxItem.outbox_dedupe_key),
    readback_status: 'materialized_once',
    same_transaction_event_and_outbox: true,
  };
}

function humanGateResumeToken(input: {
  command: Record<string, unknown>;
  event: Record<string, unknown>;
  stageIdentity: Record<string, unknown>;
  outcomeKind: string;
}) {
  if (
    optionalString(input.event.transition_kind) !== 'OpenHumanGate'
    && input.outcomeKind !== 'human_gate_ref'
  ) {
    return null;
  }
  const token = stableId('dpthg', [
    input.event.event_id,
    input.event.idempotency_key,
    input.stageIdentity,
  ]);
  return {
    surface_kind: 'opl_domain_progress_human_gate_resume_token',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    resume_token: `opl://domain-progress-transition/human-gate-resume/${token}`,
    owner: optionalString(input.command.next_owner) ?? 'human_or_domain_owner',
    allowed_decisions: stringList(input.command.allowed_decisions).length > 0
      ? stringList(input.command.allowed_decisions)
      : ['approve', 'reject', 'route_back'],
    timeout_policy: isRecord(input.command.timeout_policy)
      ? input.command.timeout_policy
      : { mode: 'manual_no_implicit_default' },
    default_safe_branch: optionalString(input.command.default_safe_branch) ?? 'wait_for_owner',
    current_identity: input.stageIdentity,
    evidence_required: true,
    authority_boundary: {
      opl_transports_resume_token: true,
      opl_can_supply_human_answer: false,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
  };
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
  const aggregateVersion = 1;
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
    aggregate_version: aggregateVersion,
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
  const outboxItemId = stableId('dpto', [eventId, command.idempotency_key]);
  const transactionId = stableId('dptx', [command.command_id, eventId, outboxItemId, command.idempotency_key]);
  const outboxItem = {
    surface_kind: 'opl_domain_progress_transition_outbox_item',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    module_id: 'runway',
    outbox_item_id: outboxItemId,
    transaction_id: transactionId,
    transition_event_id: eventId,
    outbox_kind: transitionKindValue === 'StartProviderAttempt'
      ? 'start_provider_attempt'
      : 'domain_progress_followup',
    outbox_dedupe_key: stableId('dptod', [
      aggregateIdentity,
      command.idempotency_key,
      transitionKindValue,
    ]),
    aggregate_identity: aggregateIdentity,
    stage_run_identity: stageIdentity,
    idempotency_key: command.idempotency_key,
    dispatch_allowed: transitionKindValue === 'StartProviderAttempt',
    domain_truth_mutation_allowed: false,
  };
  const readModelRebuildMetadata = {
    surface_kind: 'opl_domain_progress_read_model_rebuild_metadata',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    authority: false,
    rebuild_owner: 'one-person-lab',
    rebuild_cursor: eventId,
    derived_from_event_id: eventId,
    source_event_ids: [eventId],
    source_outbox_item_ids: [outboxItemId],
    observed_generation: command.source_generation,
    derived_generation: command.expected_version,
    body_fields_included: false,
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
    read_model_rebuild_metadata: readModelRebuildMetadata,
  };
  const logEntries = transitionRuntimeLogEntries({
    command,
    event,
    outboxItem,
    transactionId,
    aggregateVersion,
  });
  const commandEventLog = createDomainProgressTransitionRuntimeLog(logEntries);
  const readback = idempotencyReadback({
    command,
    event,
    outboxItem,
    transactionId,
    aggregateVersion,
  });
  return {
    surface_kind: 'opl_domain_progress_transition_runtime_result',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    owner_module: 'runway',
    brand_module_allocation: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
    transaction_id: transactionId,
    command,
    transition_event: event,
    transactional_outbox_item: outboxItem,
    transactional_outbox: {
      surface_kind: 'opl_domain_progress_transactional_outbox_commit',
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      transaction_id: transactionId,
      committed_together: true,
      command_id: command.command_id,
      event_id: eventId,
      outbox_item_id: outboxItemId,
      idempotency_key: command.idempotency_key,
      aggregate_identity: aggregateIdentity,
      outbox_dedupe_key: outboxItem.outbox_dedupe_key,
      jsonl_entry_kinds: ['command', 'event', 'outbox_item'],
    },
    command_event_log: commandEventLog,
    idempotency_readback: readback,
    projection_metadata: projectionMetadata,
    read_model_rebuild_metadata: readModelRebuildMetadata,
    human_gate_resume_token: humanGateResumeToken({
      command,
      event,
      stageIdentity,
      outcomeKind,
    }),
    replay_evidence: {
      surface_kind: 'opl_domain_progress_replay_evidence',
      replay_status: 'exactly_one_transition',
      transition_count: 1,
      event_ids: [eventId],
      non_advancing_apply: false,
    },
  };
}

export function createDomainProgressTransitionRuntimeLog(
  entries: Array<Record<string, unknown>> = [],
): DomainProgressTransitionRuntimeLog {
  return {
    surface_kind: 'opl_domain_progress_transition_command_event_log',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    storage_contract: 'jsonl_friendly_append_only',
    entries,
  };
}

export function currentDomainProgressTransitionAggregateVersion(input: {
  log: DomainProgressTransitionRuntimeLog;
  aggregateIdentity: Record<string, unknown>;
}) {
  return currentAggregateVersionFromEntries(input.log.entries, input.aggregateIdentity);
}

export function readDomainProgressTransitionIdempotency(input: {
  log: DomainProgressTransitionRuntimeLog;
  idempotencyKey: string;
}) {
  const entries = input.log.entries.filter((entry) => optionalString(entry.idempotency_key) === input.idempotencyKey);
  const commandEntry = entries.find((entry) => optionalString(entry.entry_kind) === 'command');
  const eventEntry = entries.find((entry) => optionalString(entry.entry_kind) === 'event');
  const outboxEntry = entries.find((entry) => optionalString(entry.entry_kind) === 'outbox_item');
  const aggregateIdentity = eventEntry && isRecord(eventEntry.aggregate_identity)
    ? eventEntry.aggregate_identity
    : null;
  return {
    surface_kind: 'opl_domain_progress_transition_idempotency_log_readback',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    idempotency_key: input.idempotencyKey,
    found: Boolean(commandEntry && eventEntry && outboxEntry),
    command_id: commandEntry?.command_id ?? null,
    event_id: eventEntry?.event_id ?? null,
    outbox_item_id: outboxEntry?.outbox_item_id ?? null,
    transaction_id: eventEntry?.transaction_id ?? commandEntry?.transaction_id ?? outboxEntry?.transaction_id ?? null,
    aggregate_identity: aggregateIdentity,
    current_aggregate_version: aggregateIdentity
      ? currentAggregateVersionFromEntries(input.log.entries, aggregateIdentity)
      : 0,
    same_transaction_event_and_outbox: Boolean(
      eventEntry
      && outboxEntry
      && optionalString(eventEntry.transaction_id) === optionalString(outboxEntry.transaction_id),
    ),
  };
}

export function appendDomainProgressTransitionRuntimeResult(input: {
  log: DomainProgressTransitionRuntimeLog;
  result: ReturnType<typeof buildDomainProgressTransitionRuntimeResult>;
}) {
  const aggregateIdentity = isRecord(input.result.transition_event.aggregate_identity)
    ? input.result.transition_event.aggregate_identity
    : {};
  const aggregateVersion = currentAggregateVersionFromEntries(input.log.entries, aggregateIdentity) + 1;
  const event = {
    ...input.result.transition_event,
    aggregate_version: aggregateVersion,
  };
  const entries = transitionRuntimeLogEntries({
    command: input.result.command,
    event,
    outboxItem: input.result.transactional_outbox_item,
    transactionId: optionalString(input.result.transaction_id) ?? stableId('dptx', [
      input.result.command.command_id,
      event.event_id,
      input.result.transactional_outbox_item.outbox_item_id,
    ]),
    aggregateVersion,
  });
  const log = createDomainProgressTransitionRuntimeLog([
    ...input.log.entries,
    ...entries,
  ]);
  const idempotencyKey = optionalString(event.idempotency_key);
  return {
    surface_kind: 'opl_domain_progress_transition_log_append',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    appended: true,
    appended_entry_count: entries.length,
    current_aggregate_version: aggregateVersion,
    log,
    appended_entries: entries,
    idempotency_readback: idempotencyKey
      ? readDomainProgressTransitionIdempotency({ log, idempotencyKey })
      : null,
    result: {
      ...input.result,
      transition_event: event,
      idempotency_readback: idempotencyKey
        ? readDomainProgressTransitionIdempotency({ log, idempotencyKey })
        : input.result.idempotency_readback,
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

function stableObservationOutcome(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const kind = optionalString(value.kind)
    ?? optionalString(value.outcome_kind)
    ?? optionalString(value.status);
  if (!kind || !STABLE_OUTCOMES.has(kind)) {
    return null;
  }
  return { ...value, kind };
}

export function reconcileDomainProgressTransitionFixedPoint(input: {
  command: Record<string, unknown>;
  observations?: unknown[];
  reason?: string;
}) {
  const observations = input.observations ?? [];
  const stableOutcome = observations
    .map((observation) => stableObservationOutcome(observation))
    .find((observation): observation is NonNullable<ReturnType<typeof stableObservationOutcome>> =>
      Boolean(observation)
    );
  const result = stableOutcome
    ? buildDomainProgressTransitionRuntimeResult({
      ...input.command,
      outcome: stableOutcome,
    })
    : buildNonAdvancingApplyRuntimeResult({
      command: input.command,
      reason: input.reason ?? 'fixed_point_no_stable_outcome',
    });
  return {
    surface_kind: 'opl_domain_progress_fixed_point_reconcile',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    command_count: 1,
    observation_count: observations.length,
    exactly_one_transition: true,
    stable_outcome_found: Boolean(stableOutcome),
    selected_transition_kind: result.transition_event.transition_kind,
    non_advancing_apply: result.transition_event.transition_kind === 'NonAdvancingApply',
    result,
    evidence: {
      stable_observation_kind: stableOutcome ? optionalString(stableOutcome.kind) : null,
      event_id: result.transition_event.event_id,
      outbox_item_id: result.transactional_outbox_item.outbox_item_id,
      idempotency_key: result.transition_event.idempotency_key,
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
  const reconciles = input.steps.map((step) => {
    return reconcileDomainProgressTransitionFixedPoint({
      command: step.command,
      observations: [step.observed_outcome],
      reason: 'replay_step_has_no_stable_outcome',
    });
  });
  const results = reconciles.map((reconcile) => reconcile.result);
  const stepEvidence = reconciles.map((reconcile, index) => ({
    step_index: index,
    exactly_one_transition: reconcile.exactly_one_transition,
    transition_kind: reconcile.selected_transition_kind,
    non_advancing_apply: reconcile.non_advancing_apply,
    event_id: reconcile.evidence.event_id,
    outbox_item_id: reconcile.evidence.outbox_item_id,
    stable_observation_kind: reconcile.evidence.stable_observation_kind,
  }));
  return {
    surface_kind: 'opl_domain_progress_transition_replay',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    trace_id: input.traceId,
    replay_status: results.every((result) => result.replay_evidence.transition_count === 1)
      ? 'accepted'
      : 'blocked',
    exactly_one_transition_per_step: results.every((result) => result.replay_evidence.transition_count === 1),
    non_advancing_apply_count: results.filter((result) => result.replay_evidence.non_advancing_apply).length,
    replay_evidence: {
      surface_kind: 'opl_domain_progress_trace_replay_evidence',
      trace_id: input.traceId,
      step_count: input.steps.length,
      exactly_one_or_non_advancing_per_step: stepEvidence.every((step) =>
        step.exactly_one_transition
        && (SUPPORTED_TRANSITIONS.has(step.transition_kind) || step.transition_kind === 'NonAdvancingApply')
      ),
      non_advancing_apply_count: stepEvidence.filter((step) => step.non_advancing_apply).length,
      step_evidence: stepEvidence,
    },
    results,
  };
}
