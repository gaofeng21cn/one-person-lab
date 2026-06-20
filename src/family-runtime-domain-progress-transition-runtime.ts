import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { stableId } from './family-runtime-ids.ts';
import { auditDomainProgressTransitionReplay } from './family-runtime-domain-progress-transition-runtime-parts/replay-audit.ts';

export {
  readDomainProgressTransitionRuntimeReadbackJsonl,
} from './family-runtime-domain-progress-transition-runtime-parts/live-readback.ts';

export { auditDomainProgressTransitionReplay };

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

function requiresExplicitCommandId(command: Record<string, unknown>) {
  const surfaceKind = optionalString(command.surface_kind);
  return surfaceKind === 'opl_generic_current_control_command_outbox_record'
    || surfaceKind === 'opl_current_control_non_advancing_apply_command_outbox_record'
    || surfaceKind === 'opl_domain_progress_transition_command';
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

function logEntryPayload(entry: Record<string, unknown>) {
  return isRecord(entry.payload) ? entry.payload : null;
}

function logEntryTransactionId(entry: Record<string, unknown>) {
  return optionalString(entry.transaction_id)
    ?? (isRecord(entry.payload) ? optionalString(entry.payload.transaction_id) : null);
}

function domainProgressTransitionIntentFingerprint(input: {
  command?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  outboxItem?: Record<string, unknown> | null;
}) {
  const command = input.command ?? {};
  const event = input.event ?? {};
  const outboxItem = input.outboxItem ?? {};
  const outcome = isRecord(event.outcome) ? event.outcome : {};
  const postcondition = isRecord(command.postcondition) ? command.postcondition : {};
  return stableId('dpti', [
    optionalString(command.command_id),
    optionalString(event.transition_kind),
    logEntryAggregateIdentity(event),
    optionalString(event.source_generation) ?? optionalString(command.source_generation),
    optionalString(event.expected_version) ?? optionalString(command.expected_version),
    optionalString(event.idempotency_key) ?? optionalString(command.idempotency_key),
    optionalString(postcondition.kind),
    optionalString(outcome.kind),
    optionalString(outboxItem.outbox_kind),
    optionalString(outboxItem.outbox_dedupe_key),
  ]);
}

function domainProgressTransitionIntentFingerprintFromResult(
  result: ReturnType<typeof buildDomainProgressTransitionRuntimeResult>,
) {
  return domainProgressTransitionIntentFingerprint({
    command: result.command,
    event: result.transition_event,
    outboxItem: result.transactional_outbox_item,
  });
}

function domainProgressTransitionIntentFingerprintFromEntries(input: {
  commandEntry?: Record<string, unknown>;
  eventEntry?: Record<string, unknown>;
  outboxEntry?: Record<string, unknown>;
}) {
  return domainProgressTransitionIntentFingerprint({
    command: input.commandEntry ? logEntryPayload(input.commandEntry) : null,
    event: input.eventEntry ? logEntryPayload(input.eventEntry) : null,
    outboxItem: input.outboxEntry ? logEntryPayload(input.outboxEntry) : null,
  });
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

function domainProgressTransitionAuthorityBoundary(source?: Record<string, unknown> | null) {
  return {
    ...(source ?? {}),
    authority: false,
    runtime_owner: 'one-person-lab',
    opl_can_write_domain_truth: false,
    opl_can_write_mas_truth: false,
    opl_can_create_domain_owner_receipt: false,
    opl_can_create_domain_typed_blocker: false,
    provider_completion_is_domain_completion: false,
    provider_completion_is_domain_ready: false,
    read_model_can_execute: false,
    projection_can_authorize_provider_admission: false,
  };
}

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

function stageRunIdentityRecord(value?: Record<string, unknown> | null) {
  return value && isRecord(value.stage_run_identity) ? value.stage_run_identity : null;
}

function stageRunIdentityComparisonKey(identity: Record<string, unknown> | null) {
  if (!identity) {
    return null;
  }
  if (
    STAGE_RUN_IDENTITY_REQUIRED_FIELDS.some((field) => !optionalString(identity[field]))
  ) {
    return null;
  }
  return JSON.stringify(
    STAGE_RUN_IDENTITY_COMPARISON_FIELDS.map((field) => [
      field,
      optionalScalarString(identity[field]),
    ]),
  );
}

export function readDomainProgressStageRunIdentity(input: {
  command?: Record<string, unknown> | null;
  event?: Record<string, unknown> | null;
  outboxItem?: Record<string, unknown> | null;
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
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
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

function domainProgressTransitionOutcomeKind(event: Record<string, unknown>) {
  const outcome = isRecord(event.outcome) ? event.outcome : {};
  return optionalString(outcome.kind)
    ?? optionalString(outcome.status)
    ?? optionalString(event.transition_kind)
    ?? null;
}

function domainProgressTransitionIdentity(input: {
  command?: Record<string, unknown> | null;
  event: Record<string, unknown>;
  outboxItem?: Record<string, unknown> | null;
  transactionId?: string | null;
}) {
  const aggregateIdentity = isRecord(input.event.aggregate_identity)
    ? input.event.aggregate_identity
    : isRecord(input.command?.aggregate_identity)
      ? input.command.aggregate_identity
      : {};
  const stageRunIdentity = isRecord(input.event.stage_run_identity)
    ? input.event.stage_run_identity
    : isRecord(input.outboxItem?.stage_run_identity)
      ? input.outboxItem.stage_run_identity
      : isRecord(input.command?.stage_run_identity)
        ? input.command.stage_run_identity
        : {};
  return {
    surface_kind: 'opl_domain_progress_transition_identity',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    aggregate_identity: aggregateIdentity,
    stage_run_identity: stageRunIdentity,
    idempotency_key:
      optionalString(input.event.idempotency_key)
      ?? optionalString(input.command?.idempotency_key)
      ?? optionalString(input.outboxItem?.idempotency_key),
    command_id:
      optionalString(input.event.command_id)
      ?? optionalString(input.command?.command_id),
    event_id: optionalString(input.event.event_id),
    outbox_item_id: optionalString(input.outboxItem?.outbox_item_id),
    transaction_id:
      input.transactionId
      ?? optionalString(input.outboxItem?.transaction_id),
    aggregate_version: numberValue(input.event.aggregate_version),
    transition_kind: optionalString(input.event.transition_kind),
    outcome_kind: domainProgressTransitionOutcomeKind(input.event),
  };
}

function domainProgressTransitionCausality(input: {
  command?: Record<string, unknown> | null;
  event: Record<string, unknown>;
  outboxItem?: Record<string, unknown> | null;
  transactionId?: string | null;
}) {
  const eventId = optionalString(input.event.event_id);
  const outboxItemId = optionalString(input.outboxItem?.outbox_item_id);
  const transactionId =
    input.transactionId
    ?? optionalString(input.outboxItem?.transaction_id);
  const eventTransactionId = optionalString(input.event.transaction_id);
  const outboxTransitionEventId = optionalString(input.outboxItem?.transition_event_id);
  return {
    surface_kind: 'opl_domain_progress_transition_causality',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    command_id:
      optionalString(input.event.command_id)
      ?? optionalString(input.command?.command_id),
    event_id: eventId,
    outbox_item_id: outboxItemId,
    transaction_id: transactionId,
    causal_event_id: optionalString(input.event.causal_event_id),
    source_generation:
      optionalScalarString(input.event.source_generation)
      ?? optionalScalarString(input.command?.source_generation),
    expected_version:
      optionalScalarString(input.event.expected_version)
      ?? optionalScalarString(input.command?.expected_version),
    derived_from_event_id: eventId,
    source_event_ids: eventId ? [eventId] : [],
    source_outbox_item_ids: outboxItemId ? [outboxItemId] : [],
    same_transaction_event_and_outbox: Boolean(
      eventId
      && outboxItemId
      && outboxTransitionEventId === eventId
      && (!eventTransactionId || !transactionId || eventTransactionId === transactionId),
    ),
  };
}

function domainProgressExactlyOneOutcome(event: Record<string, unknown>) {
  const outcome = isRecord(event.outcome) ? event.outcome : {};
  const outcomeKind = domainProgressTransitionOutcomeKind(event);
  const transitionKindValue = optionalString(event.transition_kind);
  const nonAdvancingApply =
    transitionKindValue === 'NonAdvancingApply'
    || outcomeKind === 'non_advancing_apply_typed_blocker_ref';
  return {
    surface_kind: 'opl_domain_progress_exactly_one_outcome',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    selected: true,
    exactly_one_transition: event.exactly_one_transition === true,
    transition_count: 1,
    transition_kind: transitionKindValue,
    outcome_kind: outcomeKind,
    stable_outcome:
      outcome.stable_outcome === true
      || (outcomeKind ? STABLE_OUTCOMES.has(outcomeKind) : false),
    non_advancing_apply: nonAdvancingApply,
    fail_closed: false,
  };
}

function blockedDomainProgressExactlyOneOutcome(reason: string) {
  const outcomeKind = reason === 'domain_progress_transition_idempotency_incomplete_transaction'
    ? 'blocked_incomplete_transaction'
    : reason === 'domain_progress_transition_idempotency_key_reused_for_different_intent'
      ? 'blocked_idempotency_conflict'
      : 'blocked_fail_closed';
  return {
    surface_kind: 'opl_domain_progress_exactly_one_outcome',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    selected: false,
    exactly_one_transition: false,
    transition_count: 0,
    transition_kind: null,
    outcome_kind: outcomeKind,
    stable_outcome: true,
    non_advancing_apply: false,
    fail_closed: true,
    blocked_reason: reason,
  };
}

function withDomainProgressRuntimeReadbackShape<
  T extends {
    command?: Record<string, unknown>;
    transition_event: Record<string, unknown>;
    transactional_outbox_item?: Record<string, unknown>;
    transaction_id?: string;
  },
>(
  result: T,
): T & {
  identity: ReturnType<typeof domainProgressTransitionIdentity>;
  causality: ReturnType<typeof domainProgressTransitionCausality>;
  authority_boundary: ReturnType<typeof domainProgressTransitionAuthorityBoundary>;
  exactly_one_outcome: ReturnType<typeof domainProgressExactlyOneOutcome>;
} {
  const command = isRecord(result.command) ? result.command : null;
  const outboxItem = isRecord(result.transactional_outbox_item) ? result.transactional_outbox_item : null;
  const transitionEvent = result.transition_event;
  return {
    ...result,
    identity: domainProgressTransitionIdentity({
      command,
      event: transitionEvent,
      outboxItem,
      transactionId: optionalString(result.transaction_id),
    }),
    causality: domainProgressTransitionCausality({
      command,
      event: transitionEvent,
      outboxItem,
      transactionId: optionalString(result.transaction_id),
    }),
    authority_boundary: domainProgressTransitionAuthorityBoundary(
      isRecord(transitionEvent.authority_boundary)
        ? transitionEvent.authority_boundary
        : isRecord(command?.authority_boundary)
          ? command.authority_boundary
          : null,
    ),
    exactly_one_outcome: domainProgressExactlyOneOutcome(transitionEvent),
  };
}

function blockedDomainProgressAppendReadback(input: {
  result: ReturnType<typeof buildDomainProgressTransitionRuntimeResult>;
  readModelReadback: ReturnType<typeof rebuildDomainProgressTransitionReadModel>;
  reason: string;
  appendStatus: string;
}) {
  return {
    identity: input.result.identity,
    causality: {
      ...input.result.causality,
      append_status: input.appendStatus,
      fail_closed_reason: input.reason,
    },
    authority_boundary: input.result.authority_boundary,
    exactly_one_outcome: blockedDomainProgressExactlyOneOutcome(input.reason),
    projection_metadata: input.readModelReadback.projection_metadata,
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
    lifecycle_status: 'issued',
    resume_token: `opl://domain-progress-transition/human-gate-resume/${token}`,
    issued_event_id: input.event.event_id,
    issued_command_id: input.command.command_id,
    idempotency_key: input.event.idempotency_key,
    transition_kind: input.event.transition_kind,
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

function humanGateResumeTokenFromEntries(input: {
  commandEntry: Record<string, unknown> | undefined;
  eventEntry: Record<string, unknown>;
  outboxEntry: Record<string, unknown> | undefined;
}): Record<string, unknown> | null {
  const event = logEntryPayload(input.eventEntry);
  if (!event) {
    return null;
  }
  const command = input.commandEntry ? logEntryPayload(input.commandEntry) : null;
  const outbox = input.outboxEntry ? logEntryPayload(input.outboxEntry) : null;
  const stageIdentity = isRecord(event.stage_run_identity)
    ? event.stage_run_identity
    : isRecord(outbox?.stage_run_identity)
      ? outbox.stage_run_identity
      : {};
  const outcome = isRecord(event.outcome) ? event.outcome : {};
  const outcomeKind = optionalString(outcome.kind) ?? optionalString(event.transition_kind) ?? '';
  const storedToken = isRecord(event.human_gate_resume_token)
    ? event.human_gate_resume_token
    : isRecord(outbox?.human_gate_resume_token)
      ? outbox.human_gate_resume_token
      : null;
  const computedToken = humanGateResumeToken({
    command: command ?? {},
    event,
    stageIdentity,
    outcomeKind,
  });
  const token = storedToken ?? computedToken;
  if (!token) {
    return null;
  }
  return {
    ...token,
    lifecycle_status: 'issued',
    aggregate_identity: event.aggregate_identity,
    issued_transaction_id: logEntryTransactionId(input.eventEntry),
    issued_aggregate_version: logEntryVersion(input.eventEntry),
    issued_event_id: optionalString(token.issued_event_id) ?? optionalString(event.event_id),
    issued_command_id: optionalString(token.issued_command_id) ?? optionalString(command?.command_id),
    issued_outbox_item_id:
      optionalString(outbox?.outbox_item_id)
      ?? optionalString(input.outboxEntry?.outbox_item_id),
    stage_run_identity: stageIdentity,
  };
}

function humanGateTokenConsumptionPayload(entry: Record<string, unknown>): Record<string, unknown> | null {
  const payload = logEntryPayload(entry);
  return payload?.surface_kind === 'opl_domain_progress_human_gate_resume_token_consumed_event'
    ? payload
    : null;
}

function humanGateTokenIssuances(input: {
  log: DomainProgressTransitionRuntimeLog;
  aggregateIdentity?: Record<string, unknown>;
}) {
  return input.log.entries
    .filter((entry) => optionalString(entry.entry_kind) === 'event')
    .map((eventEntry) => {
      const payload = logEntryPayload(eventEntry);
      if (payload?.surface_kind !== 'opl_domain_progress_transition_event') {
        return null;
      }
      if (input.aggregateIdentity) {
        const entryAggregateIdentity = logEntryAggregateIdentity(eventEntry);
        if (
          !entryAggregateIdentity
          || !aggregateIdentityMatches(entryAggregateIdentity, input.aggregateIdentity)
        ) {
          return null;
        }
      }
      const transactionId = logEntryTransactionId(eventEntry);
      return humanGateResumeTokenFromEntries({
        commandEntry: entryByKindAndTransaction(input.log.entries, 'command', transactionId),
        eventEntry,
        outboxEntry: entryByKindAndTransaction(input.log.entries, 'outbox_item', transactionId),
      });
    })
    .filter((token): token is Record<string, unknown> => Boolean(token));
}

function humanGateTokenConsumptionEntries(input: {
  log: DomainProgressTransitionRuntimeLog;
  resumeToken: string;
}) {
  return input.log.entries
    .map((entry) => humanGateTokenConsumptionPayload(entry))
    .filter((payload): payload is Record<string, unknown> => {
      if (!payload) {
        return false;
      }
      return optionalString(payload.resume_token) === input.resumeToken;
    });
}

function latestTransitionEventEntries(input: {
  log: DomainProgressTransitionRuntimeLog;
  aggregateIdentity: Record<string, unknown>;
}) {
  return input.log.entries.filter((entry) => {
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
  const explicitCommandId = optionalString(command.command_id);
  const postcondition = isRecord(command.postcondition) ? command.postcondition : null;
  const requiredPostcondition = isRecord(command.required_postcondition) ? command.required_postcondition : null;
  const outcome = isRecord(command.outcome) ? command.outcome : null;
  const outcomeKind = postconditionKind(command);
  if (!kind || !SUPPORTED_TRANSITIONS.has(kind)) {
    return { blocked: { reason: 'domain_progress_transition_command_kind_missing_or_unsupported', task: command } };
  }
  if (requiresExplicitCommandId(command) && !explicitCommandId) {
    return { blocked: { reason: 'domain_progress_transition_command_identity_missing', task: command } };
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
      command_id: explicitCommandId ?? commandId({
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
  const resumeToken = humanGateResumeToken({
    command,
    event,
    stageIdentity,
    outcomeKind,
  });
  const transitionEvent = resumeToken
    ? {
      ...event,
      human_gate_resume_token: resumeToken,
    }
    : event;
  const transactionalOutboxItem = resumeToken
    ? {
      ...outboxItem,
      human_gate_resume_token: resumeToken,
      human_gate_resume_token_ref: resumeToken.resume_token,
    }
    : outboxItem;
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
    event: transitionEvent,
    outboxItem: transactionalOutboxItem,
    transactionId,
    aggregateVersion,
  });
  const commandEventLog = createDomainProgressTransitionRuntimeLog(logEntries);
  const replayAudit = auditDomainProgressTransitionReplay({
    runtimeId: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    entries: commandEventLog.entries,
    aggregateIdentity,
  });
  const readback = idempotencyReadback({
    command,
    event: transitionEvent,
    outboxItem: transactionalOutboxItem,
    transactionId,
    aggregateVersion,
  });
  return withDomainProgressRuntimeReadbackShape({
    surface_kind: 'opl_domain_progress_transition_runtime_result',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    owner_module: 'runway',
    brand_module_allocation: DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
    transaction_id: transactionId,
    command,
    transition_event: transitionEvent,
    transactional_outbox_item: transactionalOutboxItem,
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
      outbox_dedupe_key: transactionalOutboxItem.outbox_dedupe_key,
      jsonl_entry_kinds: ['command', 'event', 'outbox_item'],
    },
    command_event_log: commandEventLog,
    idempotency_readback: readback,
    projection_metadata: {
      ...projectionMetadata,
      replay_audit: replayAudit,
      replay_audit_status: replayAudit.replay_status,
      replay_audit_consumable: replayAudit.read_model_projection_consumable,
    },
    read_model_rebuild_metadata: readModelRebuildMetadata,
    human_gate_resume_token: resumeToken,
    replay_audit: replayAudit,
    replay_evidence: {
      surface_kind: 'opl_domain_progress_replay_evidence',
      replay_status: replayAudit.replay_status === 'replay_ready'
        ? 'exactly_one_transition'
        : 'fail_closed',
      transition_count: 1,
      event_ids: [eventId],
      non_advancing_apply: false,
      replay_audit_ref: replayAudit.event_id,
    },
  });
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

export function readDomainProgressTransitionRuntimeLogJsonl(
  logPath: string,
): DomainProgressTransitionRuntimeLog {
  if (!existsSync(logPath)) {
    return createDomainProgressTransitionRuntimeLog();
  }
  const entries: Array<Record<string, unknown>> = [];
  const raw = readFileSync(logPath, 'utf8');
  for (const [index, line] of raw.split(/\r?\n/u).entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed.surface_kind !== 'opl_domain_progress_transition_log_entry') {
      throw new Error(
        `Unexpected domain progress transition log surface at line ${index + 1}: ${String(parsed.surface_kind)}`,
      );
    }
    if (parsed.runtime_id !== DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID) {
      throw new Error(
        `Unexpected domain progress transition runtime at line ${index + 1}: ${String(parsed.runtime_id)}`,
      );
    }
    entries.push(parsed);
  }
  return createDomainProgressTransitionRuntimeLog(entries);
}

export function appendDomainProgressTransitionRuntimeResultJsonl(input: {
  logPath: string;
  result: ReturnType<typeof buildDomainProgressTransitionRuntimeResult>;
}) {
  const existingLog = readDomainProgressTransitionRuntimeLogJsonl(input.logPath);
  const append = appendDomainProgressTransitionRuntimeResult({
    log: existingLog,
    result: input.result,
  });
  mkdirSync(dirname(input.logPath), { recursive: true });
  const physicalAppendPayload = append.appended_entries
    .map((entry) => `${JSON.stringify(entry)}\n`)
    .join('');
  if (physicalAppendPayload) {
    appendFileSync(input.logPath, physicalAppendPayload, 'utf8');
  }
  return {
    ...append,
    log_path: input.logPath,
    persisted: true,
    physical_append_entry_count: append.appended_entries.length,
    physical_append_chunk_count: physicalAppendPayload ? 1 : 0,
    storage_contract: 'append_only_physical_jsonl' as const,
  };
}

export function readDomainProgressTransitionIdempotencyJsonl(input: {
  logPath: string;
  idempotencyKey: string;
}) {
  return readDomainProgressTransitionIdempotency({
    log: readDomainProgressTransitionRuntimeLogJsonl(input.logPath),
    idempotencyKey: input.idempotencyKey,
  });
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

export function readDomainProgressHumanGateResumeToken(input: {
  log: DomainProgressTransitionRuntimeLog;
  resumeToken: string;
}) {
  const issued = humanGateTokenIssuances({ log: input.log })
    .find((token) => optionalString(token.resume_token) === input.resumeToken) ?? null;
  const consumed = humanGateTokenConsumptionEntries({
    log: input.log,
    resumeToken: input.resumeToken,
  }).at(-1) ?? null;
  const lifecycleStatus = consumed ? 'consumed' : issued ? 'issued' : 'missing';
  return {
    surface_kind: 'opl_domain_progress_human_gate_resume_token_readback',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    resume_token: input.resumeToken,
    found: Boolean(issued),
    lifecycle_status: lifecycleStatus,
    issued_event_id: issued ? optionalString(issued.issued_event_id) : null,
    issued_command_id: issued ? optionalString(issued.issued_command_id) : null,
    issued_outbox_item_id: issued ? optionalString(issued.issued_outbox_item_id) : null,
    consumed_event_id: consumed ? optionalString(consumed.event_id) : null,
    consumed_outbox_item_id: consumed
      ? optionalString(consumed.issued_outbox_item_id)
      : issued
        ? optionalString(issued.issued_outbox_item_id)
        : null,
    consumption_transaction_id: consumed ? optionalString(consumed.transaction_id) : null,
    owner: issued ? optionalString(issued.owner) : null,
    allowed_decisions: issued && Array.isArray(issued.allowed_decisions) ? issued.allowed_decisions : [],
    decision: consumed ? optionalString(consumed.decision) : null,
    evidence_ref: consumed ? optionalString(consumed.evidence_ref) : null,
    aggregate_identity: issued && isRecord(issued.aggregate_identity) ? issued.aggregate_identity : null,
    stage_run_identity: issued && isRecord(issued.stage_run_identity) ? issued.stage_run_identity : null,
    authority_boundary: issued && isRecord(issued.authority_boundary) ? issued.authority_boundary : null,
  };
}

export function consumeDomainProgressHumanGateResumeToken(input: {
  log: DomainProgressTransitionRuntimeLog;
  resumeToken: string;
  decision: string;
  evidenceRef: string;
  consumedBy: string;
}) {
  const tokenReadback = readDomainProgressHumanGateResumeToken({
    log: input.log,
    resumeToken: input.resumeToken,
  });
  if (!tokenReadback.found) {
    return {
      surface_kind: 'opl_domain_progress_human_gate_resume_token_consume_result',
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      consumption_status: 'blocked',
      blocked: {
        reason: 'human_gate_resume_token_not_found',
        resume_token: input.resumeToken,
      },
      appended: false,
      idempotent_replay: false,
      log: input.log,
      token_readback: tokenReadback,
      non_advancing_apply: {
        surface_kind: 'opl_domain_progress_non_advancing_apply',
        runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
        reason: 'human_gate_resume_token_not_found',
        typed_blocker_ref: stableId('dptb', [input.resumeToken, 'not_found']),
      },
    };
  }
  if (tokenReadback.lifecycle_status === 'consumed') {
    return {
      surface_kind: 'opl_domain_progress_human_gate_resume_token_consume_result',
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      consumption_status: 'already_consumed',
      appended: false,
      idempotent_replay: true,
      log: input.log,
      token_readback: tokenReadback,
      non_advancing_apply: {
        surface_kind: 'opl_domain_progress_non_advancing_apply',
        runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
        reason: 'human_gate_resume_token_already_consumed',
        typed_blocker_ref: stableId('dptb', [input.resumeToken, tokenReadback.consumed_event_id]),
      },
    };
  }
  const allowedDecisions = tokenReadback.allowed_decisions
    .filter((decision: unknown): decision is string => typeof decision === 'string');
  if (!allowedDecisions.includes(input.decision)) {
    return {
      surface_kind: 'opl_domain_progress_human_gate_resume_token_consume_result',
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      consumption_status: 'blocked',
      blocked: {
        reason: 'human_gate_resume_token_decision_not_allowed',
        resume_token: input.resumeToken,
        decision: input.decision,
        allowed_decisions: allowedDecisions,
      },
      appended: false,
      idempotent_replay: false,
      log: input.log,
      token_readback: tokenReadback,
      non_advancing_apply: {
        surface_kind: 'opl_domain_progress_non_advancing_apply',
        runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
        reason: 'human_gate_resume_token_decision_not_allowed',
        typed_blocker_ref: stableId('dptb', [input.resumeToken, input.decision, 'not_allowed']),
      },
    };
  }
  const aggregateIdentity = isRecord(tokenReadback.aggregate_identity) ? tokenReadback.aggregate_identity : {};
  const stageIdentity = isRecord(tokenReadback.stage_run_identity) ? tokenReadback.stage_run_identity : {};
  const eventId = stableId('dpthgc', [
    input.resumeToken,
    tokenReadback.issued_event_id,
    input.decision,
    input.evidenceRef,
  ]);
  const transactionId = stableId('dptx', [eventId, input.resumeToken, tokenReadback.issued_outbox_item_id]);
  const aggregateVersion = currentAggregateVersionFromEntries(input.log.entries, aggregateIdentity);
  const consumptionEvent = {
    surface_kind: 'opl_domain_progress_human_gate_resume_token_consumed_event',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    event_id: eventId,
    transaction_id: transactionId,
    resume_token: input.resumeToken,
    decision: input.decision,
    evidence_ref: input.evidenceRef,
    consumed_by: input.consumedBy,
    lifecycle_status: 'consumed',
    issued_event_id: tokenReadback.issued_event_id,
    issued_command_id: tokenReadback.issued_command_id,
    issued_outbox_item_id: tokenReadback.issued_outbox_item_id,
    aggregate_identity: aggregateIdentity,
    aggregate_version: aggregateVersion,
    stage_run_identity: stageIdentity,
    authority_boundary: {
      opl_records_resume_token_consumption: true,
      opl_can_create_domain_owner_receipt: false,
      opl_can_create_domain_typed_blocker: false,
      provider_completion_is_domain_ready: false,
    },
  };
  const consumptionEntry = {
    surface_kind: 'opl_domain_progress_transition_log_entry',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    transaction_id: transactionId,
    aggregate_identity: aggregateIdentity,
    aggregate_version: aggregateVersion,
    entry_kind: 'human_gate_resume_token_consumed',
    sequence_in_transaction: 0,
    event_id: eventId,
    payload_ref: `opl://domain-progress-transition/human-gate-resume-consumptions/${encodeURIComponent(eventId)}`,
    payload: consumptionEvent,
    jsonl_friendly: true,
    body_fields_included: false,
  };
  const log = createDomainProgressTransitionRuntimeLog([
    ...input.log.entries,
    consumptionEntry,
  ]);
  const consumedReadback = readDomainProgressHumanGateResumeToken({
    log,
    resumeToken: input.resumeToken,
  });
  return {
    surface_kind: 'opl_domain_progress_human_gate_resume_token_consume_result',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    consumption_status: 'consumed',
    appended: true,
    idempotent_replay: false,
    log,
    appended_entries: [consumptionEntry],
    consumption_event: consumptionEvent,
    token_readback: consumedReadback,
  };
}

export function rebuildDomainProgressTransitionReadModel(input: {
  log: DomainProgressTransitionRuntimeLog;
  aggregateIdentity: Record<string, unknown>;
}) {
  const eventEntries = latestTransitionEventEntries(input);
  const latestEventEntry = eventEntries.at(-1) ?? null;
  const latestEvent = latestEventEntry ? logEntryPayload(latestEventEntry) : null;
  const latestTransactionId = latestEventEntry ? logEntryTransactionId(latestEventEntry) : null;
  const latestCommandEntry = latestTransactionId
    ? entryByKindAndTransaction(input.log.entries, 'command', latestTransactionId)
    : undefined;
  const latestOutboxEntry = latestTransactionId
    ? entryByKindAndTransaction(input.log.entries, 'outbox_item', latestTransactionId)
    : undefined;
  const latestCommand = latestCommandEntry ? logEntryPayload(latestCommandEntry) : null;
  const latestOutbox = latestOutboxEntry ? logEntryPayload(latestOutboxEntry) : null;
  const latestStageRunIdentityReadback = latestEvent
    ? readDomainProgressStageRunIdentity({
      command: latestCommand,
      event: latestEvent,
      outboxItem: latestOutbox,
    })
    : null;
  const latestEventId = latestEvent ? optionalString(latestEvent.event_id) : null;
  const latestOutboxItemId = latestOutbox
    ? optionalString(latestOutbox.outbox_item_id)
    : latestOutboxEntry
      ? optionalString(latestOutboxEntry.outbox_item_id)
      : null;
  const aggregateVersion = currentAggregateVersionFromEntries(input.log.entries, input.aggregateIdentity);
  const sourceEventIds = eventEntries
    .map((entry) => optionalString(entry.event_id) ?? optionalString(logEntryPayload(entry)?.event_id))
    .filter((eventId): eventId is string => Boolean(eventId));
  const sourceOutboxItemIds = eventEntries
    .map((entry) => {
      const outboxEntry = entryByKindAndTransaction(input.log.entries, 'outbox_item', logEntryTransactionId(entry));
      return optionalString(outboxEntry?.outbox_item_id) ?? optionalString(logEntryPayload(outboxEntry ?? {})?.outbox_item_id);
    })
    .filter((outboxItemId): outboxItemId is string => Boolean(outboxItemId));
  const latestIssuedToken = humanGateTokenIssuances({
    log: input.log,
    aggregateIdentity: input.aggregateIdentity,
  }).at(-1) ?? null;
  const latestTokenReadback = latestIssuedToken
    ? readDomainProgressHumanGateResumeToken({
      log: input.log,
      resumeToken: String(latestIssuedToken['resume_token']),
    })
    : null;
  const observedGeneration = latestEvent
    ? optionalScalarString(latestEvent.source_generation)
    : null;
  const derivedGeneration = latestEvent
    ? optionalScalarString(latestEvent.expected_version)
    : null;
  const readModelRebuildMetadata = {
    surface_kind: 'opl_domain_progress_read_model_rebuild_metadata',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    authority: false,
    rebuild_owner: 'one-person-lab',
    rebuild_cursor: latestEventId,
    derived_from_event_id: latestEventId,
    source_event_ids: sourceEventIds,
    source_outbox_item_ids: sourceOutboxItemIds,
    observed_generation: observedGeneration,
    derived_generation: derivedGeneration,
    aggregate_version: aggregateVersion,
    body_fields_included: false,
  };
  const replayAudit = auditDomainProgressTransitionReplay({
    runtimeId: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    entries: input.log.entries,
    aggregateIdentity: input.aggregateIdentity,
  });
  const projectionMetadata = {
    surface_kind: 'opl_domain_progress_projection_metadata',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    authority: false,
    derived_from_event_id: latestEventId,
    observed_generation: observedGeneration,
    derived_generation: derivedGeneration,
    lag_status: latestEvent ? 'current' : 'empty',
    read_model_rebuild_owner: 'one-person-lab',
    read_model_rebuild_metadata: readModelRebuildMetadata,
    replay_audit: replayAudit,
    replay_audit_status: replayAudit.replay_status,
    replay_audit_consumable: replayAudit.read_model_projection_consumable,
  };
  const identity = latestEvent
    ? domainProgressTransitionIdentity({
      command: latestCommand,
      event: latestEvent,
      outboxItem: latestOutbox,
      transactionId: latestTransactionId,
    })
    : {
      surface_kind: 'opl_domain_progress_transition_identity',
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      aggregate_identity: input.aggregateIdentity,
      stage_run_identity: null,
      idempotency_key: null,
      command_id: null,
      event_id: null,
      outbox_item_id: null,
      transaction_id: null,
      aggregate_version: aggregateVersion,
      transition_kind: null,
      outcome_kind: null,
    };
  const readModelIdentity = {
    ...identity,
    latest_event_id: latestEventId,
    latest_outbox_item_id: latestOutboxItemId,
    latest_transaction_id: latestTransactionId,
    current_aggregate_version: aggregateVersion,
  };
  const causality = latestEvent
    ? domainProgressTransitionCausality({
      command: latestCommand,
      event: latestEvent,
      outboxItem: latestOutbox,
      transactionId: latestTransactionId,
    })
    : {
      surface_kind: 'opl_domain_progress_transition_causality',
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      command_id: null,
      event_id: null,
      outbox_item_id: null,
      transaction_id: null,
      causal_event_id: null,
      source_generation: null,
      expected_version: null,
      derived_from_event_id: null,
      source_event_ids: [],
      source_outbox_item_ids: [],
      same_transaction_event_and_outbox: false,
    };
  const exactlyOneOutcome = latestEvent
    ? domainProgressExactlyOneOutcome(latestEvent)
    : {
      surface_kind: 'opl_domain_progress_exactly_one_outcome',
      runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
      selected: false,
      exactly_one_transition: false,
      transition_count: 0,
      transition_kind: null,
      outcome_kind: null,
      stable_outcome: false,
      non_advancing_apply: false,
      fail_closed: false,
    };
  return {
    surface_kind: 'opl_domain_progress_transition_read_model',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    authority: false,
    identity: readModelIdentity,
    causality,
    authority_boundary: domainProgressTransitionAuthorityBoundary(
      latestEvent && isRecord(latestEvent.authority_boundary)
        ? latestEvent.authority_boundary
        : latestCommand && isRecord(latestCommand.authority_boundary)
          ? latestCommand.authority_boundary
          : null,
    ),
    exactly_one_outcome: exactlyOneOutcome,
    aggregate_identity: input.aggregateIdentity,
    aggregate_version: aggregateVersion,
    transition_count: eventEntries.length,
    projection_metadata: projectionMetadata,
    read_model_rebuild_metadata: readModelRebuildMetadata,
    replay_audit: replayAudit,
    latest_transition_identity: latestEvent
      ? {
        event_id: latestEventId,
        command_id: optionalString(latestEvent.command_id),
        transition_kind: optionalString(latestEvent.transition_kind),
        idempotency_key: optionalString(latestEvent.idempotency_key),
        aggregate_version: logEntryVersion(latestEventEntry ?? {}),
      }
      : null,
    latest_transaction_identity: latestEvent
      ? {
        transaction_id: latestTransactionId,
        command_id: optionalString(latestCommand?.command_id),
        event_id: latestEventId,
        outbox_item_id: latestOutboxItemId,
        same_transaction_event_and_outbox: Boolean(
          latestEventEntry
          && latestOutboxEntry
          && logEntryTransactionId(latestEventEntry) === logEntryTransactionId(latestOutboxEntry),
        ),
        same_stage_run_identity: latestStageRunIdentityReadback?.same_stage_run_identity ?? false,
        transaction_complete: Boolean(
          latestCommandEntry
          && latestEventEntry
          && latestOutboxEntry
          && logEntryTransactionId(latestEventEntry) === logEntryTransactionId(latestOutboxEntry)
          && latestStageRunIdentityReadback?.same_stage_run_identity,
        ),
        stage_run_identity_readback: latestStageRunIdentityReadback,
      }
      : null,
    latest_outbox_identity: latestOutbox
      ? {
        outbox_item_id: latestOutboxItemId,
        outbox_kind: optionalString(latestOutbox.outbox_kind),
        outbox_dedupe_key: optionalString(latestOutbox.outbox_dedupe_key),
        transition_event_id: optionalString(latestOutbox.transition_event_id),
      }
      : null,
    latest_stage_run_identity:
      latestStageRunIdentityReadback?.same_stage_run_identity
        ? latestStageRunIdentityReadback.event_stage_run_identity
        : null,
    latest_stage_run_identity_readback: latestStageRunIdentityReadback,
    latest_human_gate_resume_token: latestTokenReadback,
  };
}

export function appendDomainProgressTransitionRuntimeResult(input: {
  log: DomainProgressTransitionRuntimeLog;
  result: ReturnType<typeof buildDomainProgressTransitionRuntimeResult>;
}) {
  const aggregateIdentity = isRecord(input.result.transition_event.aggregate_identity)
    ? input.result.transition_event.aggregate_identity
    : {};
  const idempotencyKey = optionalString(input.result.transition_event.idempotency_key);
  if (idempotencyKey) {
    const idempotencyEntries = input.log.entries
      .filter((entry) => optionalString(entry.idempotency_key) === idempotencyKey);
    if (idempotencyEntries.length > 0) {
      const commandEntry = idempotencyEntries.find((entry) => optionalString(entry.entry_kind) === 'command');
      const eventEntry = idempotencyEntries.find((entry) => optionalString(entry.entry_kind) === 'event');
      const outboxEntry = idempotencyEntries.find((entry) => optionalString(entry.entry_kind) === 'outbox_item');
      const readback = readDomainProgressTransitionIdempotency({
        log: input.log,
        idempotencyKey,
      });
      const readModelReadback = rebuildDomainProgressTransitionReadModel({
        log: input.log,
        aggregateIdentity,
      });
      if (!commandEntry || !eventEntry || !outboxEntry) {
        const appendReadback = blockedDomainProgressAppendReadback({
          result: input.result,
          readModelReadback,
          reason: 'domain_progress_transition_idempotency_incomplete_transaction',
          appendStatus: 'blocked',
        });
        return {
          surface_kind: 'opl_domain_progress_transition_log_append',
          runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
          appended: false,
          append_status: 'blocked',
          blocked: {
            reason: 'domain_progress_transition_idempotency_incomplete_transaction',
            idempotency_key: idempotencyKey,
          },
          current_aggregate_version: currentAggregateVersionFromEntries(input.log.entries, aggregateIdentity),
          log: input.log,
          appended_entries: [],
          idempotency_readback: readback,
          read_model_readback: readModelReadback,
          identity: appendReadback.identity,
          causality: appendReadback.causality,
          authority_boundary: appendReadback.authority_boundary,
          exactly_one_outcome: appendReadback.exactly_one_outcome,
          projection_metadata: appendReadback.projection_metadata,
          result: input.result,
        };
      }
      const existingIntentFingerprint = domainProgressTransitionIntentFingerprintFromEntries({
        commandEntry,
        eventEntry,
        outboxEntry,
      });
      const incomingIntentFingerprint = domainProgressTransitionIntentFingerprintFromResult(input.result);
      if (existingIntentFingerprint !== incomingIntentFingerprint) {
        const appendReadback = blockedDomainProgressAppendReadback({
          result: input.result,
          readModelReadback,
          reason: 'domain_progress_transition_idempotency_key_reused_for_different_intent',
          appendStatus: 'blocked',
        });
        return {
          surface_kind: 'opl_domain_progress_transition_log_append',
          runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
          appended: false,
          append_status: 'blocked',
          blocked: {
            reason: 'domain_progress_transition_idempotency_key_reused_for_different_intent',
            idempotency_key: idempotencyKey,
            existing_intent_fingerprint: existingIntentFingerprint,
            incoming_intent_fingerprint: incomingIntentFingerprint,
          },
          current_aggregate_version: currentAggregateVersionFromEntries(input.log.entries, aggregateIdentity),
          log: input.log,
          appended_entries: [],
          idempotency_readback: readback,
          read_model_readback: readModelReadback,
          identity: appendReadback.identity,
          causality: appendReadback.causality,
          authority_boundary: appendReadback.authority_boundary,
          exactly_one_outcome: appendReadback.exactly_one_outcome,
          projection_metadata: appendReadback.projection_metadata,
          result: input.result,
        };
      }
      const replayedResult = withDomainProgressRuntimeReadbackShape({
        ...input.result,
        transition_event: logEntryPayload(eventEntry) ?? input.result.transition_event,
        transactional_outbox_item: logEntryPayload(outboxEntry) ?? input.result.transactional_outbox_item,
        idempotency_readback: readback,
        read_model_readback: readModelReadback,
      });
      return {
        surface_kind: 'opl_domain_progress_transition_log_append',
        runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
        appended: false,
        append_status: 'idempotent_replay',
        idempotent_replay: true,
        current_aggregate_version: currentAggregateVersionFromEntries(input.log.entries, aggregateIdentity),
        log: input.log,
        appended_entries: [],
        idempotency_readback: readback,
        read_model_readback: readModelReadback,
        identity: replayedResult.identity,
        causality: {
          ...replayedResult.causality,
          append_status: 'idempotent_replay',
        },
        authority_boundary: replayedResult.authority_boundary,
        exactly_one_outcome: replayedResult.exactly_one_outcome,
        projection_metadata: replayedResult.projection_metadata,
        result: replayedResult,
      };
    }
  }
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
  const readModelReadback = rebuildDomainProgressTransitionReadModel({
    log,
    aggregateIdentity,
  });
  const appendedResult = withDomainProgressRuntimeReadbackShape({
    ...input.result,
    transition_event: event,
    idempotency_readback: idempotencyKey
      ? readDomainProgressTransitionIdempotency({ log, idempotencyKey })
      : input.result.idempotency_readback,
    read_model_readback: readModelReadback,
  });
  return {
    surface_kind: 'opl_domain_progress_transition_log_append',
    runtime_id: DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
    appended: true,
    append_status: 'appended',
    appended_entry_count: entries.length,
    current_aggregate_version: aggregateVersion,
    log,
    appended_entries: entries,
    idempotency_readback: idempotencyKey
      ? readDomainProgressTransitionIdempotency({ log, idempotencyKey })
      : null,
    read_model_readback: readModelReadback,
    identity: appendedResult.identity,
    causality: {
      ...appendedResult.causality,
      append_status: 'appended',
    },
    authority_boundary: appendedResult.authority_boundary,
    exactly_one_outcome: appendedResult.exactly_one_outcome,
    projection_metadata: appendedResult.projection_metadata,
    result: appendedResult,
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
    consume_human_gate_resume?: {
      decision: string;
      evidence_ref: string;
      consumed_by: string;
    };
  }>;
}) {
  let log = createDomainProgressTransitionRuntimeLog();
  const reconciles = input.steps.map((step) => {
    const reconcile = reconcileDomainProgressTransitionFixedPoint({
      command: step.command,
      observations: [step.observed_outcome],
      reason: 'replay_step_has_no_stable_outcome',
    });
    const appended = appendDomainProgressTransitionRuntimeResult({
      log,
      result: reconcile.result,
    });
    log = appended.log;
    let humanGateResumeTokenReadback: ReturnType<typeof readDomainProgressHumanGateResumeToken> | null = null;
    let readModelAfterHumanGateResume: ReturnType<typeof rebuildDomainProgressTransitionReadModel> | null = null;
    if (step.consume_human_gate_resume) {
      const token = isRecord(appended.result.human_gate_resume_token)
        ? optionalString(appended.result.human_gate_resume_token.resume_token)
        : null;
      if (token) {
        const consumed = consumeDomainProgressHumanGateResumeToken({
          log,
          resumeToken: token,
          decision: step.consume_human_gate_resume.decision,
          evidenceRef: step.consume_human_gate_resume.evidence_ref,
          consumedBy: step.consume_human_gate_resume.consumed_by,
        });
        log = consumed.log;
        humanGateResumeTokenReadback = consumed.token_readback;
        const aggregateIdentity = isRecord(appended.result.transition_event.aggregate_identity)
          ? appended.result.transition_event.aggregate_identity
          : {};
        readModelAfterHumanGateResume = rebuildDomainProgressTransitionReadModel({
          log,
          aggregateIdentity,
        });
      }
    }
    return {
      ...reconcile,
      human_gate_resume_token_readback: humanGateResumeTokenReadback,
      read_model_after_human_gate_resume: readModelAfterHumanGateResume,
    };
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
    human_gate_resume_token_consumed:
      reconcile.human_gate_resume_token_readback?.lifecycle_status === 'consumed',
    read_model_rebuilt_after_human_gate_resume:
      reconcile.read_model_after_human_gate_resume?.latest_human_gate_resume_token?.lifecycle_status === 'consumed',
    read_model_derived_from_event_id:
      reconcile.read_model_after_human_gate_resume?.read_model_rebuild_metadata.derived_from_event_id ?? null,
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
      human_gate_resume_consumption_count: stepEvidence
        .filter((step) => step.human_gate_resume_token_consumed).length,
      step_evidence: stepEvidence,
    },
    command_event_log: log,
    read_model_rebuilds: reconciles
      .map((reconcile) => reconcile.read_model_after_human_gate_resume)
      .filter((readModel): readModel is NonNullable<typeof readModel> => Boolean(readModel)),
    results,
  };
}
