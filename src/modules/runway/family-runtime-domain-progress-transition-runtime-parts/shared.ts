import { isRecord } from '../../../kernel/contract-validation.ts';
import { stringList, stringValue as optionalString } from '../../../kernel/json-record.ts';
import { stableId } from '../../../kernel/stable-id.ts';

export const DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID = 'opl_domain_progress_transition_runtime';
export const DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE = {
  primary: 'runway',
  primary_brand: 'OPL Runway',
  supporting: {
    pack: 'ABI and generated domain command surface input',
    stagecraft: 'stage grammar, transition policy shape, and accepted answer shape',
    console: 'current owner delta and next action projection',
    ledger: 'refs-only event, receipt, lineage, and replay evidence',
  },
  not_a_new_brand_module: true,
} as const;

export const SUPPORTED_TRANSITIONS = new Set([
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

export const STABLE_OUTCOMES = new Set([
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

export { isRecord, optionalString, stringList };

export function optionalScalarString(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function booleanTrue(value: unknown) {
  return value === true || value === 'true';
}

export function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function transitionKind(command: Record<string, unknown>) {
  const kind = optionalString(command.transition_kind)
    ?? optionalString(command.command_kind)
    ?? optionalString(command.outbox_kind)
    ?? optionalString(command.recommended_transition_kind);
  if (kind === 'provider_admission_requested') {
    return 'StartProviderAttempt';
  }
  return kind;
}

export function postconditionKind(command: Record<string, unknown>) {
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

export function masTransitionRequestBoundaryViolation(command: Record<string, unknown>) {
  if (optionalString(command.surface_kind) !== 'mas_domain_progress_transition_request') {
    return null;
  }
  const targetRuntimeKind = optionalString(command.target_runtime_kind) ?? optionalString(command.runtime_kind);
  const authorityBoundary = isRecord(command.authority_boundary) ? command.authority_boundary : {};
  const policyAuthorityBoundary = isRecord(command.policy_authority_boundary)
    ? command.policy_authority_boundary
    : {};
  const runtimeCapabilities = isRecord(command.runtime_capabilities)
    ? command.runtime_capabilities
    : {};
  const domainRuntimeCapabilities = isRecord(command.domain_runtime_capabilities)
    ? command.domain_runtime_capabilities
    : {};
  const masCanCreateOplOutbox =
    command.mas_can_create_opl_outbox_record
    ?? command.adapter_can_create_opl_outbox_record
    ?? authorityBoundary.mas_can_create_opl_outbox_record
    ?? authorityBoundary.adapter_can_create_opl_outbox_record
    ?? policyAuthorityBoundary.mas_can_create_opl_outbox_record
    ?? policyAuthorityBoundary.adapter_can_create_opl_outbox_record
    ?? runtimeCapabilities.mas_can_create_opl_outbox_record
    ?? runtimeCapabilities.adapter_can_create_opl_outbox_record
    ?? domainRuntimeCapabilities.mas_can_create_opl_outbox_record
    ?? domainRuntimeCapabilities.adapter_can_create_opl_outbox_record;
  if (
    targetRuntimeKind !== 'DomainProgressTransitionRuntime'
    || optionalString(command.target_runtime_owner) !== 'one-person-lab'
    || masCanCreateOplOutbox !== false
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
  const overclaimValues = [
    command.can_write_opl_outbox,
    command.can_write_opl_event,
    command.can_write_opl_stage_run,
    command.can_write_provider_attempt,
    command.can_claim_provider_running,
    command.can_claim_paper_progress,
    command.can_claim_runtime_ready,
    command.provider_admission_pending,
    command.provider_completion_is_domain_completion,
    command.provider_completion_is_domain_ready,
    authorityBoundary.mas_can_create_opl_event,
    authorityBoundary.mas_can_create_opl_stage_run,
    authorityBoundary.mas_can_authorize_provider_admission,
    authorityBoundary.mas_can_mark_provider_attempt_running,
    authorityBoundary.can_write_opl_outbox,
    authorityBoundary.can_write_opl_event,
    authorityBoundary.can_write_opl_stage_run,
    authorityBoundary.can_write_provider_attempt,
    authorityBoundary.can_claim_provider_running,
    authorityBoundary.can_claim_paper_progress,
    authorityBoundary.can_claim_runtime_ready,
    authorityBoundary.provider_admission_pending,
    authorityBoundary.provider_completion_is_domain_completion,
    authorityBoundary.provider_completion_is_domain_ready,
    policyAuthorityBoundary.mas_can_create_opl_event,
    policyAuthorityBoundary.mas_can_create_opl_stage_run,
    policyAuthorityBoundary.mas_can_authorize_provider_admission,
    policyAuthorityBoundary.mas_can_mark_provider_attempt_running,
    policyAuthorityBoundary.can_write_opl_outbox,
    policyAuthorityBoundary.can_write_opl_event,
    policyAuthorityBoundary.can_write_opl_stage_run,
    policyAuthorityBoundary.can_write_provider_attempt,
    policyAuthorityBoundary.can_claim_provider_running,
    policyAuthorityBoundary.can_claim_paper_progress,
    policyAuthorityBoundary.can_claim_runtime_ready,
    policyAuthorityBoundary.provider_admission_pending,
    policyAuthorityBoundary.provider_completion_is_domain_completion,
    policyAuthorityBoundary.provider_completion_is_domain_ready,
    runtimeCapabilities.can_claim_provider_running,
    runtimeCapabilities.can_claim_paper_progress,
    runtimeCapabilities.can_claim_runtime_ready,
    runtimeCapabilities.provider_admission_pending,
    domainRuntimeCapabilities.can_claim_provider_running,
    domainRuntimeCapabilities.can_claim_paper_progress,
    domainRuntimeCapabilities.can_claim_runtime_ready,
    domainRuntimeCapabilities.provider_admission_pending,
  ];
  if (overclaimValues.some(booleanTrue)) {
    return 'domain_progress_transition_request_authority_overclaim';
  }
  return null;
}

export function requiresExplicitCommandId(command: Record<string, unknown>) {
  const surfaceKind = optionalString(command.surface_kind);
  return surfaceKind === 'opl_generic_current_control_command_outbox_record'
    || surfaceKind === 'opl_current_control_non_advancing_apply_command_outbox_record'
    || surfaceKind === 'opl_domain_progress_transition_command';
}

export function normalizeAggregateIdentity(
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

export function stageRunIdentity(
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
      ?? optionalString(command.idempotency_key)
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

export function commandId(command: Record<string, unknown>, aggregateIdentity: Record<string, unknown>) {
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

export function aggregateIdentityMatches(left: Record<string, unknown>, right: Record<string, unknown>) {
  return aggregateIdentityKey(left) === aggregateIdentityKey(right);
}

export function logEntryAggregateIdentity(entry: Record<string, unknown>) {
  const aggregateIdentity = isRecord(entry.aggregate_identity)
    ? entry.aggregate_identity
    : isRecord(entry.payload) && isRecord(entry.payload.aggregate_identity)
      ? entry.payload.aggregate_identity
      : null;
  return aggregateIdentity;
}

export function logEntryVersion(entry: Record<string, unknown>) {
  return numberValue(entry.aggregate_version)
    ?? (isRecord(entry.payload) ? numberValue(entry.payload.aggregate_version) : null);
}

export function logEntryPayload(entry: Record<string, unknown>) {
  return isRecord(entry.payload) ? entry.payload : null;
}

export function logEntryTransactionId(entry: Record<string, unknown>) {
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
    aggregateIdentityKey(logEntryAggregateIdentity(event) ?? {}),
    optionalString(event.source_generation) ?? optionalString(command.source_generation),
    optionalString(event.expected_version) ?? optionalString(command.expected_version),
    optionalString(event.idempotency_key) ?? optionalString(command.idempotency_key),
    optionalString(postcondition.kind),
    optionalString(outcome.kind),
    optionalString(outboxItem.outbox_kind),
    optionalString(outboxItem.outbox_dedupe_key),
  ]);
}

export function domainProgressTransitionIntentFingerprintFromResult(
  result: {
    command: Record<string, unknown>;
    transition_event: Record<string, unknown>;
    transactional_outbox_item: Record<string, unknown>;
  },
) {
  return domainProgressTransitionIntentFingerprint({
    command: result.command,
    event: result.transition_event,
    outboxItem: result.transactional_outbox_item,
  });
}

export function domainProgressTransitionIntentFingerprintFromEntries(input: {
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

export function entryByKindAndTransaction(
  entries: Array<Record<string, unknown>>,
  entryKind: string,
  transactionId: string | null,
) {
  return entries.find((entry) =>
    optionalString(entry.entry_kind) === entryKind
    && logEntryTransactionId(entry) === transactionId
  );
}

export function currentAggregateVersionFromEntries(
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

export function transitionRuntimeLogEntries(input: {
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

export function idempotencyReadback(input: {
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

export function domainProgressTransitionAuthorityBoundary(source?: Record<string, unknown> | null) {
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

export function domainProgressTransitionIdentity(input: {
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

export function domainProgressTransitionCausality(input: {
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

export function domainProgressExactlyOneOutcome(event: Record<string, unknown>) {
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

export function blockedDomainProgressExactlyOneOutcome(reason: string) {
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

export function withDomainProgressRuntimeReadbackShape<
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

export function blockedDomainProgressAppendReadback(input: {
  result: {
    identity: ReturnType<typeof domainProgressTransitionIdentity>;
    causality: ReturnType<typeof domainProgressTransitionCausality>;
    authority_boundary: ReturnType<typeof domainProgressTransitionAuthorityBoundary>;
  };
  readModelReadback: { projection_metadata: Record<string, unknown> };
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

export function humanGateResumeToken(input: {
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

export function humanGateTokenIssuances(input: {
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

export function humanGateTokenConsumptionEntries(input: {
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

export function latestTransitionEventEntries(input: {
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
