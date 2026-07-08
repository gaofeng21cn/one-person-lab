import { record, recordList, stringValue as optionalString } from '../../../kernel/json-record.ts';
import { stableId } from '../../../kernel/stable-id.ts';

const STABLE_OUTCOMES = new Set([
  'provider_admission_projected_or_blocked',
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

const STAGE_RUN_IDENTITY_REQUIRED_FIELDS = [
  'stage_run_id',
  'route_identity_key',
  'attempt_idempotency_key',
  'provider_attempt_ref',
  'attempt_lease_ref',
] as const;

const STAGE_RUN_IDENTITY_COMPARISON_FIELDS = [
  ...STAGE_RUN_IDENTITY_REQUIRED_FIELDS,
  'source_generation',
] as const;

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

function logEntryPayload(entry: Record<string, unknown> | undefined) {
  return entry ? recordList([entry.payload])[0] ?? null : null;
}

function logEntryTransactionId(entry: Record<string, unknown> | undefined) {
  return optionalString(entry?.transaction_id)
    ?? optionalString(logEntryPayload(entry)?.transaction_id);
}

function logEntryAggregateIdentity(entry: Record<string, unknown>) {
  return recordList([entry.aggregate_identity])[0]
    ?? recordList([logEntryPayload(entry)?.aggregate_identity])[0]
    ?? null;
}

function logEntryVersion(entry: Record<string, unknown> | undefined) {
  return numberValue(entry?.aggregate_version)
    ?? numberValue(logEntryPayload(entry)?.aggregate_version);
}

function entryByKindAndTransaction(
  entries: Array<Record<string, unknown>>,
  entryKind: string,
  transactionId: string | null,
) {
  return entries.find((entry) =>
    optionalString(entry.entry_kind) === entryKind
    && logEntryTransactionId(entry) === transactionId
  );
}

function latestTransitionEventEntries(input: {
  entries: Array<Record<string, unknown>>;
  aggregateIdentity: Record<string, unknown>;
}) {
  return input.entries.filter((entry) => {
    if (optionalString(entry.entry_kind) !== 'event') {
      return false;
    }
    const payload = logEntryPayload(entry);
    if (payload?.surface_kind !== 'opl_domain_progress_transition_event') {
      return false;
    }
    const entryAggregateIdentity = logEntryAggregateIdentity(entry);
    return entryAggregateIdentity
      ? aggregateIdentityMatches(entryAggregateIdentity, input.aggregateIdentity)
      : false;
  });
}

function stageRunIdentityRecord(value?: Record<string, unknown> | null) {
  return value ? recordList([value.stage_run_identity])[0] ?? null : null;
}

function stageRunIdentityComparisonKey(identity: Record<string, unknown> | null) {
  if (!identity) {
    return null;
  }
  if (STAGE_RUN_IDENTITY_REQUIRED_FIELDS.some((field) => !optionalString(identity[field]))) {
    return null;
  }
  return JSON.stringify(
    STAGE_RUN_IDENTITY_COMPARISON_FIELDS.map((field) => [
      field,
      optionalScalarString(identity[field]),
    ]),
  );
}

function readStageRunIdentity(input: {
  command?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  outboxItem?: Record<string, unknown> | null;
  runtimeId: string;
}) {
  const commandStageRunIdentity = stageRunIdentityRecord(input.command);
  const eventStageRunIdentity = stageRunIdentityRecord(input.event);
  const outboxStageRunIdentity = stageRunIdentityRecord(input.outboxItem);
  const commandStageRunIdentityKey = stageRunIdentityComparisonKey(commandStageRunIdentity);
  const eventStageRunIdentityKey = stageRunIdentityComparisonKey(eventStageRunIdentity);
  const outboxStageRunIdentityKey = stageRunIdentityComparisonKey(outboxStageRunIdentity);
  const sameStageRunIdentity = Boolean(
    commandStageRunIdentityKey
    && eventStageRunIdentityKey
    && outboxStageRunIdentityKey
    && commandStageRunIdentityKey === eventStageRunIdentityKey
    && eventStageRunIdentityKey === outboxStageRunIdentityKey,
  );
  const canonical = sameStageRunIdentity ? eventStageRunIdentity : null;
  return {
    surface_kind: 'opl_domain_progress_stage_run_identity_readback',
    runtime_id: input.runtimeId,
    same_stage_run_identity: sameStageRunIdentity,
    command_stage_run_identity_present: Boolean(commandStageRunIdentity),
    event_stage_run_identity_present: Boolean(eventStageRunIdentity),
    outbox_stage_run_identity_present: Boolean(outboxStageRunIdentity),
    command_stage_run_identity: commandStageRunIdentity,
    event_stage_run_identity: eventStageRunIdentity,
    outbox_stage_run_identity: outboxStageRunIdentity,
    command_stage_run_identity_key: commandStageRunIdentityKey,
    event_stage_run_identity_key: eventStageRunIdentityKey,
    outbox_stage_run_identity_key: outboxStageRunIdentityKey,
    stage_run_id: canonical ? optionalString(canonical.stage_run_id) : null,
    route_identity_key: canonical ? optionalString(canonical.route_identity_key) : null,
    attempt_idempotency_key: canonical ? optionalString(canonical.attempt_idempotency_key) : null,
    provider_attempt_ref: canonical ? optionalString(canonical.provider_attempt_ref) : null,
    attempt_lease_ref: canonical ? optionalString(canonical.attempt_lease_ref) : null,
    source_generation: canonical ? optionalScalarString(canonical.source_generation) : null,
    fail_closed_reason: sameStageRunIdentity
      ? null
      : 'domain_progress_transition_readback_stage_run_identity_mismatch',
  };
}

function outcomeKind(event: Record<string, unknown> | null) {
  if (!event) {
    return null;
  }
  const outcome = record(event.outcome);
  return optionalString(outcome.kind)
    ?? optionalString(outcome.status)
    ?? optionalString(event.transition_kind)
    ?? null;
}

function exactlyOneOutcome(input: {
  event: Record<string, unknown> | null;
  runtimeId: string;
  transactionComplete: boolean;
  failClosedReason: string | null;
}) {
  const outcome = input.event ? record(input.event.outcome) : {};
  const selectedOutcomeKind = outcomeKind(input.event);
  const transitionKind = input.event ? optionalString(input.event.transition_kind) : null;
  const nonAdvancingApply =
    transitionKind === 'NonAdvancingApply'
    || selectedOutcomeKind === 'non_advancing_apply_typed_blocker_ref';
  if (!input.transactionComplete) {
    return {
      surface_kind: 'opl_domain_progress_exactly_one_outcome',
      runtime_id: input.runtimeId,
      selected: false,
      exactly_one_transition: false,
      transition_count: 0,
      transition_kind: transitionKind,
      outcome_kind: input.event ? 'blocked_incomplete_transaction' : null,
      stable_outcome: false,
      non_advancing_apply: false,
      fail_closed: Boolean(input.event),
      blocked_reason: input.failClosedReason,
    };
  }
  return {
    surface_kind: 'opl_domain_progress_exactly_one_outcome',
    runtime_id: input.runtimeId,
    selected: true,
    exactly_one_transition: input.event?.exactly_one_transition === true,
    transition_count: 1,
    transition_kind: transitionKind,
    outcome_kind: selectedOutcomeKind,
    stable_outcome:
      outcome.stable_outcome === true
      || (selectedOutcomeKind ? STABLE_OUTCOMES.has(selectedOutcomeKind) : false),
    non_advancing_apply: nonAdvancingApply,
    fail_closed: false,
  };
}

function failClosedReason(input: {
  latestEvent: Record<string, unknown> | null;
  commandEntry?: Record<string, unknown>;
  eventEntry?: Record<string, unknown>;
  outboxEntry?: Record<string, unknown>;
  sameOutboxIdentity: boolean;
  sameTransactionEventAndOutbox: boolean;
  sameStageRunIdentity: boolean;
}) {
  if (!input.latestEvent || !input.eventEntry) {
    return 'domain_progress_transition_replay_empty';
  }
  if (!input.commandEntry) {
    return 'domain_progress_transition_replay_command_entry_missing';
  }
  if (!input.outboxEntry) {
    return 'domain_progress_transition_replay_outbox_entry_missing';
  }
  if (!input.sameOutboxIdentity) {
    return 'domain_progress_transition_replay_outbox_identity_mismatch';
  }
  if (!input.sameTransactionEventAndOutbox) {
    return 'domain_progress_transition_replay_transaction_identity_mismatch';
  }
  if (!input.sameStageRunIdentity) {
    return 'domain_progress_transition_replay_stage_run_identity_mismatch';
  }
  return 'domain_progress_transition_replay_incomplete_transaction';
}

export function auditDomainProgressTransitionReplay(input: {
  runtimeId: string;
  entries: Array<Record<string, unknown>>;
  aggregateIdentity: Record<string, unknown>;
}) {
  const eventEntries = latestTransitionEventEntries({
    entries: input.entries,
    aggregateIdentity: input.aggregateIdentity,
  });
  const latestEventEntry = eventEntries.at(-1);
  const latestTransactionId = logEntryTransactionId(latestEventEntry);
  const commandEntry = latestTransactionId
    ? entryByKindAndTransaction(input.entries, 'command', latestTransactionId)
    : undefined;
  const eventEntry = latestTransactionId
    ? entryByKindAndTransaction(input.entries, 'event', latestTransactionId)
    : undefined;
  const outboxEntry = latestTransactionId
    ? entryByKindAndTransaction(input.entries, 'outbox_item', latestTransactionId)
    : undefined;
  const commandPayload = logEntryPayload(commandEntry);
  const eventPayload = logEntryPayload(eventEntry);
  const outboxPayload = logEntryPayload(outboxEntry);
  const latestEventId = optionalString(eventPayload?.event_id) ?? optionalString(latestEventEntry?.event_id);
  const latestOutboxItemId = optionalString(outboxPayload?.outbox_item_id)
    ?? optionalString(outboxEntry?.outbox_item_id);
  const outboxEntryItemId = optionalString(outboxEntry?.outbox_item_id);
  const outboxPayloadItemId = optionalString(outboxPayload?.outbox_item_id);
  const sameOutboxIdentity = Boolean(
    latestOutboxItemId
    && outboxEntryItemId
    && outboxPayloadItemId
    && outboxEntryItemId === latestOutboxItemId
    && outboxPayloadItemId === latestOutboxItemId
  );
  const sameTransactionEventAndOutbox = Boolean(
    eventEntry
    && outboxEntry
    && latestEventId
    && latestOutboxItemId
    && latestTransactionId
    && logEntryTransactionId(eventEntry) === latestTransactionId
    && logEntryTransactionId(outboxEntry) === latestTransactionId
    && sameOutboxIdentity
    && optionalString(outboxPayload?.transition_event_id) === latestEventId
  );
  const stageRunIdentityReadback = readStageRunIdentity({
    command: commandPayload,
    event: eventPayload,
    outboxItem: outboxPayload,
    runtimeId: input.runtimeId,
  });
  const transactionComplete = Boolean(
    commandEntry
    && eventEntry
    && outboxEntry
    && sameTransactionEventAndOutbox
    && stageRunIdentityReadback.same_stage_run_identity
  );
  const closedReason = transactionComplete
    ? null
    : failClosedReason({
      latestEvent: eventPayload,
      commandEntry,
      eventEntry,
      outboxEntry,
      sameOutboxIdentity,
      sameTransactionEventAndOutbox,
      sameStageRunIdentity: stageRunIdentityReadback.same_stage_run_identity,
    });
  const latestAggregateVersion = logEntryVersion(latestEventEntry) ?? 0;
  const exactOutcome = exactlyOneOutcome({
    event: eventPayload,
    runtimeId: input.runtimeId,
    transactionComplete,
    failClosedReason: closedReason,
  });
  return {
    surface_kind: 'opl_domain_progress_transition_replay_audit',
    runtime_id: input.runtimeId,
    authority: false,
    replay_status: transactionComplete ? 'replay_ready' : 'fail_closed',
    read_model_projection_consumable: transactionComplete,
    exactly_one_complete_transaction: transactionComplete,
    transaction_complete: transactionComplete,
    transition_count: eventEntries.length,
    aggregate_identity: input.aggregateIdentity,
    aggregate_version: latestAggregateVersion,
    transaction_id: latestTransactionId,
    event_id: latestEventId,
    outbox_item_id: latestOutboxItemId,
    idempotency_key:
      optionalString(eventPayload?.idempotency_key)
      ?? optionalString(commandPayload?.idempotency_key)
      ?? optionalString(outboxPayload?.idempotency_key),
    command_present: Boolean(commandEntry),
    event_present: Boolean(eventEntry),
    outbox_item_present: Boolean(outboxEntry),
    same_outbox_identity: sameOutboxIdentity,
    same_transaction_event_and_outbox: sameTransactionEventAndOutbox,
    same_stage_run_identity: stageRunIdentityReadback.same_stage_run_identity,
    stage_run_identity_readback: stageRunIdentityReadback,
    exactly_one_outcome: exactOutcome,
    projection_metadata: {
      surface_kind: 'opl_domain_progress_transition_replay_projection_metadata',
      runtime_id: input.runtimeId,
      authority: false,
      projection_role: transactionComplete
        ? 'replay_ready_complete_transaction'
        : 'replay_fail_closed_incomplete_transaction',
      read_model_projection_consumable: transactionComplete,
      transaction_complete: transactionComplete,
      replay_status: transactionComplete ? 'replay_ready' : 'fail_closed',
      exactly_one_complete_transaction: transactionComplete,
      ...(closedReason ? { fail_closed_reason: closedReason } : {}),
    },
    ...(closedReason ? { fail_closed_reason: closedReason } : {}),
  };
}
