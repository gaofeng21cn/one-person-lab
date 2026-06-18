import {
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
  type DomainProgressTransitionRuntimeLog,
  readDomainProgressStageRunIdentity,
  readDomainProgressTransitionIdempotency,
  readDomainProgressTransitionRuntimeLogJsonl,
  rebuildDomainProgressTransitionReadModel,
} from '../family-runtime-domain-progress-transition-runtime.ts';

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function logEntryPayload(entry: Record<string, unknown> | undefined) {
  return entry && isRecord(entry.payload) ? entry.payload : null;
}

function logEntryTransactionId(entry: Record<string, unknown> | undefined) {
  return optionalString(entry?.transaction_id)
    ?? (isRecord(entry?.payload) ? optionalString(entry.payload.transaction_id) : null);
}

function entryByKindAndTransaction(
  entries: DomainProgressTransitionRuntimeLog['entries'],
  entryKind: string,
  transactionId: string | null,
) {
  return entries.find((entry) =>
    optionalString(entry.entry_kind) === entryKind
    && logEntryTransactionId(entry) === transactionId
  );
}

export function readDomainProgressTransitionRuntimeReadbackJsonl(input: {
  logPath: string;
  aggregateIdentity: Record<string, unknown>;
  idempotencyKey?: string | null;
}) {
  const log = readDomainProgressTransitionRuntimeLogJsonl(input.logPath);
  const readModelReadback = rebuildDomainProgressTransitionReadModel({
    log,
    aggregateIdentity: input.aggregateIdentity,
  });
  const latestTransactionId = optionalString(readModelReadback.latest_transaction_identity?.transaction_id);
  const latestEventId = optionalString(readModelReadback.identity.latest_event_id);
  const latestOutboxItemId = optionalString(readModelReadback.identity.latest_outbox_item_id);
  const commandEntry = latestTransactionId
    ? entryByKindAndTransaction(log.entries, 'command', latestTransactionId)
    : undefined;
  const eventEntry = latestTransactionId
    ? entryByKindAndTransaction(log.entries, 'event', latestTransactionId)
    : undefined;
  const outboxEntry = latestTransactionId
    ? entryByKindAndTransaction(log.entries, 'outbox_item', latestTransactionId)
    : undefined;
  const eventPayload = logEntryPayload(eventEntry);
  const outboxPayload = logEntryPayload(outboxEntry);
  const commandPayload = logEntryPayload(commandEntry);
  const outboxEntryItemId = optionalString(outboxEntry?.outbox_item_id);
  const outboxPayloadItemId = optionalString(outboxPayload?.outbox_item_id);
  const stageRunIdentityReadback = readDomainProgressStageRunIdentity({
    command: commandPayload,
    event: eventPayload,
    outboxItem: outboxPayload,
  });
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
  const transactionComplete = Boolean(
    commandEntry
    && eventEntry
    && outboxEntry
    && sameTransactionEventAndOutbox
    && stageRunIdentityReadback.same_stage_run_identity
  );
  const runtimeReadbackStatus = latestEventId
    ? transactionComplete
      ? 'complete_transaction'
      : 'incomplete_transaction'
    : 'empty';
  const idempotencyKey = optionalString(input.idempotencyKey)
    ?? optionalString(readModelReadback.identity.idempotency_key);
  const idempotencyReadback = idempotencyKey
    ? readDomainProgressTransitionIdempotency({ log, idempotencyKey })
    : null;
  const failClosedReason = runtimeReadbackStatus === 'incomplete_transaction'
    ? 'domain_progress_transition_readback_incomplete_transaction'
    : null;

  return {
    surface_kind: 'opl_domain_progress_transition_runtime_live_readback',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    log_path: input.logPath,
    storage_contract: 'append_only_physical_jsonl' as const,
    runtime_readback_status: runtimeReadbackStatus,
    transaction_complete: transactionComplete,
    append_only_log_entry_count: log.entries.length,
    identity: readModelReadback.identity,
    causality: {
      ...readModelReadback.causality,
      same_transaction_event_and_outbox: sameTransactionEventAndOutbox,
      runtime_readback_status: runtimeReadbackStatus,
      transaction_complete: transactionComplete,
      ...(failClosedReason ? { fail_closed_reason: failClosedReason } : {}),
    },
    authority_boundary: readModelReadback.authority_boundary,
    exactly_one_outcome: transactionComplete
      ? readModelReadback.exactly_one_outcome
      : {
        ...readModelReadback.exactly_one_outcome,
        selected: false,
        exactly_one_transition: false,
        stable_outcome: false,
        fail_closed: Boolean(latestEventId),
        outcome_kind: latestEventId ? 'blocked_incomplete_transaction' : null,
      },
    projection_metadata: readModelReadback.projection_metadata,
    read_model_readback: readModelReadback,
    idempotency_readback: idempotencyReadback,
    latest_transaction_readback: {
      transaction_id: latestTransactionId,
      command_present: Boolean(commandEntry),
      event_present: Boolean(eventEntry),
      outbox_item_present: Boolean(outboxEntry),
      event_id: latestEventId,
      outbox_item_id: latestOutboxItemId,
      outbox_log_entry_item_id: outboxEntryItemId,
      outbox_payload_item_id: outboxPayloadItemId,
      same_outbox_identity: sameOutboxIdentity,
      same_transaction_event_and_outbox: sameTransactionEventAndOutbox,
      transition_event_id: eventPayload ? optionalString(eventPayload.event_id) : null,
      outbox_transition_event_id: outboxPayload ? optionalString(outboxPayload.transition_event_id) : null,
      same_stage_run_identity: stageRunIdentityReadback.same_stage_run_identity,
      stage_run_identity_readback: stageRunIdentityReadback,
    },
  };
}
