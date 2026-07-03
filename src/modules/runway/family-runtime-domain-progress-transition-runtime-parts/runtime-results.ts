import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { parseJsonText } from '../../../kernel/json-file.ts';
import { stableId } from '../family-runtime-ids.ts';
import { auditDomainProgressTransitionReplay } from './replay-audit.ts';
import {
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_ID,
  DOMAIN_PROGRESS_TRANSITION_RUNTIME_MODULE,
  STABLE_OUTCOMES,
  type DomainProgressTransitionRuntimeLog,
  blockedDomainProgressAppendReadback,
  currentAggregateVersionFromEntries,
  domainProgressExactlyOneOutcome,
  domainProgressTransitionAuthorityBoundary,
  domainProgressTransitionCausality,
  domainProgressTransitionIdentity,
  domainProgressTransitionIntentFingerprintFromEntries,
  domainProgressTransitionIntentFingerprintFromResult,
  entryByKindAndTransaction,
  humanGateResumeToken,
  humanGateTokenConsumptionEntries,
  humanGateTokenIssuances,
  idempotencyReadback,
  isRecord,
  latestTransitionEventEntries,
  logEntryPayload,
  logEntryTransactionId,
  logEntryVersion,
  optionalScalarString,
  optionalString,
  readDomainProgressStageRunIdentity,
  transitionRuntimeLogEntries,
  withDomainProgressRuntimeReadbackShape,
} from './shared.ts';

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
    const parsed = parseJsonText(trimmed) as Record<string, unknown>;
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
