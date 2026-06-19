const DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID = 'opl_domain_progress_transition_runtime';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function samePresentString(left: string | null, right: string | null) {
  return Boolean(left && right && left === right);
}

function matchingStageRunIdentity(
  left: Record<string, unknown> | null,
  right: Record<string, unknown> | null,
) {
  if (!left || !right) {
    return false;
  }
  return samePresentString(optionalString(left.stage_run_id), optionalString(right.stage_run_id))
    && samePresentString(
      optionalString(left.route_identity_key),
      optionalString(right.route_identity_key),
    )
    && samePresentString(
      optionalString(left.attempt_idempotency_key),
      optionalString(right.attempt_idempotency_key),
    )
    && samePresentString(
      optionalString(left.provider_attempt_ref),
      optionalString(right.provider_attempt_ref),
    )
    && samePresentString(
      optionalString(left.attempt_lease_ref),
      optionalString(right.attempt_lease_ref),
    );
}

function sameOutboxIdentity(input: {
  latestTransactionReadback: Record<string, unknown>;
  readModelReadback: Record<string, unknown> | null;
}) {
  if (input.latestTransactionReadback.same_outbox_identity === true) {
    return true;
  }
  const latestOutboxIdentity = isRecord(input.readModelReadback?.latest_outbox_identity)
    ? input.readModelReadback.latest_outbox_identity
    : null;
  const latestTransactionIdentity = isRecord(input.readModelReadback?.latest_transaction_identity)
    ? input.readModelReadback.latest_transaction_identity
    : null;
  const transactionOutboxItemId =
    optionalString(input.latestTransactionReadback.outbox_item_id)
    ?? optionalString(latestTransactionIdentity?.outbox_item_id);
  const readModelOutboxItemId = optionalString(latestOutboxIdentity?.outbox_item_id);
  const transactionEventId =
    optionalString(input.latestTransactionReadback.outbox_transition_event_id)
    ?? optionalString(input.latestTransactionReadback.transition_event_id)
    ?? optionalString(latestTransactionIdentity?.event_id);
  const readModelTransitionEventId = optionalString(latestOutboxIdentity?.transition_event_id);
  return samePresentString(transactionOutboxItemId, readModelOutboxItemId)
    && samePresentString(transactionEventId, readModelTransitionEventId)
    && latestTransactionIdentity?.same_transaction_event_and_outbox !== false;
}

function sameStageRunIdentity(input: {
  liveReadback: Record<string, unknown>;
  latestTransactionReadback: Record<string, unknown>;
  readModelReadback: Record<string, unknown> | null;
}) {
  if (input.latestTransactionReadback.same_stage_run_identity === true) {
    return true;
  }
  const readbackIdentity = isRecord(input.liveReadback.identity)
    ? input.liveReadback.identity
    : null;
  const identityStageRun = isRecord(readbackIdentity?.stage_run_identity)
    ? readbackIdentity.stage_run_identity
    : null;
  const latestStageRunIdentity = isRecord(input.readModelReadback?.latest_stage_run_identity)
    ? input.readModelReadback.latest_stage_run_identity
    : null;
  const latestTransactionIdentity = isRecord(input.readModelReadback?.latest_transaction_identity)
    ? input.readModelReadback.latest_transaction_identity
    : null;
  return latestTransactionIdentity?.same_stage_run_identity !== false
    && latestTransactionIdentity?.transaction_complete !== false
    && matchingStageRunIdentity(identityStageRun, latestStageRunIdentity);
}

export function validCompleteTransitionRuntimeLiveReadback(value: Record<string, unknown>) {
  const latestTransactionReadback = isRecord(value.latest_transaction_readback)
    ? value.latest_transaction_readback
    : null;
  const readModelReadback = isRecord(value.read_model_readback)
    ? value.read_model_readback
    : null;
  return optionalString(value.surface_kind) === 'opl_domain_progress_transition_runtime_live_readback'
    && optionalString(value.runtime_id) === DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID
    && optionalString(value.runtime_readback_status) === 'complete_transaction'
    && value.transaction_complete === true
    && latestTransactionReadback?.same_transaction_event_and_outbox === true
    && sameOutboxIdentity({ latestTransactionReadback, readModelReadback })
    && sameStageRunIdentity({ liveReadback: value, latestTransactionReadback, readModelReadback });
}
