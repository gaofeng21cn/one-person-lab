import crypto from 'node:crypto';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError, isRecord } from '../../kernel/contract-validation.ts';
import type { FoundryRiskTier } from './protocol.ts';

export type FoundryRunState =
  | 'accepted'
  | 'designing'
  | 'materializing'
  | 'evaluating'
  | 'evidence_ready'
  | 'diagnosing'
  | 'qualified'
  | 'awaiting_owner_canary'
  | 'canary'
  | 'awaiting_owner_active'
  | 'activating'
  | 'completed_active'
  | 'completed_qualified'
  | 'completed_unqualified'
  | 'rejected'
  | 'cancelled'
  | 'failed'
  | 'quarantined';

export const FOUNDRY_TERMINAL_STATES = new Set<FoundryRunState>([
  'completed_active',
  'completed_qualified',
  'completed_unqualified',
  'rejected',
  'cancelled',
  'failed',
  'quarantined',
]);

const ALLOWED_TRANSITIONS: Record<FoundryRunState, FoundryRunState[]> = {
  accepted: ['designing', 'rejected', 'cancelled', 'failed', 'quarantined'],
  designing: ['materializing', 'cancelled', 'failed', 'quarantined'],
  materializing: ['evaluating', 'cancelled', 'failed', 'quarantined'],
  evaluating: ['qualified', 'evidence_ready', 'completed_unqualified', 'cancelled', 'failed', 'quarantined'],
  evidence_ready: ['diagnosing', 'completed_unqualified', 'cancelled', 'failed', 'quarantined'],
  diagnosing: ['materializing', 'completed_unqualified', 'cancelled', 'failed', 'quarantined'],
  qualified: ['canary', 'awaiting_owner_canary', 'completed_qualified', 'cancelled', 'failed', 'quarantined'],
  awaiting_owner_canary: ['canary', 'rejected', 'cancelled'],
  canary: ['activating', 'awaiting_owner_active', 'evidence_ready', 'completed_unqualified', 'cancelled', 'failed', 'quarantined'],
  awaiting_owner_active: ['activating', 'rejected', 'cancelled'],
  activating: ['completed_active', 'failed', 'quarantined'],
  completed_active: [],
  completed_qualified: [],
  completed_unqualified: [],
  rejected: [],
  cancelled: [],
  failed: [],
  quarantined: [],
};

const EVENT_TYPES_BY_TRANSITION = new Map<string, ReadonlySet<string>>([
  ['accepted>designing', new Set(['design_started'])],
  ['designing>materializing', new Set(['blueprint_admitted'])],
  ['materializing>evaluating', new Set(['candidate_materialized'])],
  ['evaluating>qualified', new Set(['candidate_qualified'])],
  ['evaluating>evidence_ready', new Set(['evaluation_failed'])],
  ['evaluating>completed_unqualified', new Set(['evolution_budget_exhausted'])],
  ['evidence_ready>diagnosing', new Set(['diagnosis_started'])],
  ['evidence_ready>completed_unqualified', new Set(['evolution_budget_exhausted'])],
  ['diagnosing>materializing', new Set(['evolution_proposal_admitted'])],
  ['diagnosing>completed_unqualified', new Set(['evolution_no_change'])],
  ['qualified>canary', new Set(['canary_started'])],
  ['qualified>awaiting_owner_canary', new Set(['owner_canary_required'])],
  ['qualified>completed_qualified', new Set(['qualification_completed'])],
  ['awaiting_owner_canary>canary', new Set(['owner_approved'])],
  ['canary>activating', new Set(['canary_passed'])],
  ['canary>awaiting_owner_active', new Set(['canary_passed'])],
  ['canary>evidence_ready', new Set(['canary_regression_rolled_back'])],
  ['canary>completed_unqualified', new Set(['evolution_budget_exhausted'])],
  ['awaiting_owner_active>activating', new Set(['owner_approved'])],
  ['activating>completed_active', new Set(['activation_completed'])],
]);

const EVENT_FIELDS = [
  'surface_kind',
  'version',
  'event_id',
  'run_id',
  'revision',
  'event_type',
  'from_state',
  'to_state',
  'occurred_at',
  'idempotency_key',
  'previous_event_hash',
  'payload',
  'event_hash',
] as const;

export interface FoundryRunEvent {
  surface_kind: 'opl_foundry_run_event';
  version: 'opl-foundry-run-event.v1';
  event_id: string;
  run_id: string;
  revision: number;
  event_type: string;
  from_state: FoundryRunState | null;
  to_state: FoundryRunState;
  occurred_at: string;
  idempotency_key: string;
  previous_event_hash: string | null;
  payload: Record<string, unknown>;
  event_hash: string;
}

export interface FoundryRunSnapshot {
  surface_kind: 'opl_foundry_run';
  version: 'opl-foundry-run.v1';
  run_id: string;
  target_agent_id: string;
  target_domain_id: string;
  request_digest: string;
  activation_revision_at_start: number;
  state: FoundryRunState;
  revision: number;
  generation: number;
  blueprint_digest: string | null;
  previous_blueprint_digest: string | null;
  candidate_digest: string | null;
  candidate_record_digest: string | null;
  evidence_digest: string | null;
  frozen_test_plan_digest: string | null;
  proposal_digest: string | null;
  version_digest: string | null;
  risk_tier: FoundryRiskTier | null;
  gate_score: number | null;
  no_improvement_generations: number;
  last_event_hash: string;
  created_at: string;
  updated_at: string;
}

function fail(message: string, details: Record<string, unknown> = {}): never {
  throw new FrameworkContractError('contract_shape_invalid', message, details);
}

export function assertFoundryTransition(from: FoundryRunState, to: FoundryRunState) {
  if (!Object.hasOwn(ALLOWED_TRANSITIONS, from) || !Object.hasOwn(ALLOWED_TRANSITIONS, to)) {
    fail('FoundryRun transition uses an unknown state.', { from_state: from, to_state: to });
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    fail(`FoundryRun transition ${from} -> ${to} is not allowed.`, { from_state: from, to_state: to });
  }
}

function assertFoundryEventTransition(event: FoundryRunEvent) {
  if (event.from_state === null) {
    if (event.to_state !== 'accepted' || event.event_type !== 'foundry_run_accepted') {
      fail('FoundryRun first event must be the canonical acceptance event.');
    }
    return;
  }
  assertFoundryTransition(event.from_state, event.to_state);
  const genericTerminalType = event.to_state === 'cancelled'
    ? 'foundry_run_cancelled'
    : event.to_state === 'failed'
      ? 'foundry_run_failed'
      : event.to_state === 'quarantined'
        ? 'foundry_output_quarantined'
        : event.to_state === 'rejected'
          ? 'owner_rejected'
          : null;
  const allowed = EVENT_TYPES_BY_TRANSITION.get(`${event.from_state}>${event.to_state}`);
  if (event.event_type !== genericTerminalType && !allowed?.has(event.event_type)) {
    fail('FoundryRun event type does not match its exact transition.', {
      event_type: event.event_type,
      from_state: event.from_state,
      to_state: event.to_state,
    });
  }
}

function assertAcceptancePayload(event: FoundryRunEvent) {
  const expected = [
    'activation_revision_at_start',
    'generation',
    'request_digest',
    'target_agent_id',
    'target_domain_id',
  ].sort();
  const actual = Object.keys(event.payload).sort();
  if (canonicalJsonText(actual) !== canonicalJsonText(expected)) {
    fail('FoundryRun acceptance payload is open or incomplete.', { actual_fields: actual });
  }
  if (
    typeof event.payload.target_agent_id !== 'string'
    || event.payload.target_agent_id.length === 0
    || typeof event.payload.target_domain_id !== 'string'
    || event.payload.target_domain_id.length === 0
    || typeof event.payload.request_digest !== 'string'
    || !/^sha256:[a-f0-9]{64}$/.test(event.payload.request_digest)
    || !Number.isSafeInteger(event.payload.activation_revision_at_start)
    || (event.payload.activation_revision_at_start as number) < 0
    || event.payload.generation !== 0
  ) {
    fail('FoundryRun acceptance payload identity is invalid.');
  }
}

function eventHash(value: Omit<FoundryRunEvent, 'event_hash'>) {
  return `sha256:${crypto.createHash('sha256').update(canonicalJsonText(value), 'utf8').digest('hex')}`;
}

export function buildFoundryEvent(input: {
  runId: string;
  revision: number;
  eventType: string;
  fromState: FoundryRunState | null;
  toState: FoundryRunState;
  occurredAt: string;
  idempotencyKey: string;
  previousEventHash: string | null;
  payload?: Record<string, unknown>;
}): FoundryRunEvent {
  if (input.fromState) assertFoundryTransition(input.fromState, input.toState);
  else if (input.toState !== 'accepted' || input.revision !== 1) fail('The first FoundryRun event must accept revision 1.');
  const withoutHash = {
    surface_kind: 'opl_foundry_run_event' as const,
    version: 'opl-foundry-run-event.v1' as const,
    event_id: `${input.runId}:${input.revision}`,
    run_id: input.runId,
    revision: input.revision,
    event_type: input.eventType,
    from_state: input.fromState,
    to_state: input.toState,
    occurred_at: input.occurredAt,
    idempotency_key: input.idempotencyKey,
    previous_event_hash: input.previousEventHash,
    payload: input.payload ?? {},
  };
  return { ...withoutHash, event_hash: eventHash(withoutHash) };
}

export function verifyFoundryEventChain(events: FoundryRunEvent[]) {
  if (events.length === 0) fail('FoundryRun event chain must not be empty.');
  let previous: FoundryRunEvent | null = null;
  const idempotency = new Set<string>();
  for (const event of events) {
    if (!isRecord(event)) fail('FoundryRun event must be an object.');
    const actualFields = Object.keys(event).sort();
    const expectedFields = [...EVENT_FIELDS].sort();
    if (canonicalJsonText(actualFields) !== canonicalJsonText(expectedFields)) {
      fail('FoundryRun event uses an open or incomplete envelope.', { actual_fields: actualFields });
    }
    if (event.surface_kind !== 'opl_foundry_run_event' || event.version !== 'opl-foundry-run-event.v1') {
      fail('FoundryRun event surface identity is invalid.');
    }
    if (
      typeof event.event_id !== 'string'
      || typeof event.run_id !== 'string'
      || typeof event.event_type !== 'string'
      || typeof event.occurred_at !== 'string'
      || typeof event.idempotency_key !== 'string'
      || typeof event.event_hash !== 'string'
      || (event.from_state !== null && typeof event.from_state !== 'string')
      || typeof event.to_state !== 'string'
      || (event.previous_event_hash !== null && typeof event.previous_event_hash !== 'string')
    ) {
      fail('FoundryRun event identity fields have invalid types.');
    }
    if (!event.run_id.trim() || event.run_id !== (previous?.run_id ?? events[0]!.run_id)) {
      fail('FoundryRun event chain mixes run identities.', { run_id: event.run_id });
    }
    if (event.event_id !== `${event.run_id}:${event.revision}`) {
      fail('FoundryRun event id is not canonical.', { event_id: event.event_id });
    }
    if (!Number.isSafeInteger(event.revision) || event.revision <= 0) fail('FoundryRun event revision is invalid.');
    if (!event.event_type.trim()) fail('FoundryRun event type is empty.');
    if (!event.idempotency_key.trim()) fail('FoundryRun event idempotency key is empty.');
    const parsedTimestamp = Date.parse(event.occurred_at);
    if (!Number.isFinite(parsedTimestamp) || new Date(parsedTimestamp).toISOString() !== event.occurred_at) {
      fail('FoundryRun event timestamp is invalid.');
    }
    if (!isRecord(event.payload)) fail('FoundryRun event payload must be an object.');
    if (event.revision !== (previous?.revision ?? 0) + 1) fail('FoundryRun event revisions are not contiguous.');
    if (event.previous_event_hash !== (previous?.event_hash ?? null)) fail('FoundryRun event hash chain is broken.');
    const { event_hash: supplied, ...withoutHash } = event;
    if (eventHash(withoutHash) !== supplied) fail('FoundryRun event hash is invalid.', { event_id: event.event_id });
    if (idempotency.has(event.idempotency_key)) fail('FoundryRun event idempotency key is duplicated.');
    if (previous) {
      if (event.from_state !== previous.to_state) fail('FoundryRun event from_state does not match history.');
      assertFoundryEventTransition(event);
    } else if (
      event.revision !== 1
      || event.from_state !== null
    ) {
      fail('FoundryRun first event must be the canonical acceptance event.');
    } else {
      assertFoundryEventTransition(event);
      assertAcceptancePayload(event);
    }
    idempotency.add(event.idempotency_key);
    previous = event;
  }
  return { status: 'valid' as const, event_count: events.length, last_event_hash: previous?.event_hash ?? null };
}

export function assertFoundryEventReplay(
  existing: FoundryRunEvent,
  candidate: FoundryRunEvent,
  expectedRevision: number,
) {
  if (existing.revision !== expectedRevision + 1 || candidate.revision !== expectedRevision + 1) {
    fail('FoundryRun event replay revision is inconsistent.', {
      expected_revision: expectedRevision,
      existing_revision: existing.revision,
      candidate_revision: candidate.revision,
    });
  }
  const logical = (event: FoundryRunEvent) => ({
    surface_kind: event.surface_kind,
    version: event.version,
    event_id: event.event_id,
    run_id: event.run_id,
    revision: event.revision,
    event_type: event.event_type,
    from_state: event.from_state,
    to_state: event.to_state,
    idempotency_key: event.idempotency_key,
    previous_event_hash: event.previous_event_hash,
    payload: event.payload,
  });
  if (canonicalJsonText(logical(existing)) !== canonicalJsonText(logical(candidate))) {
    fail('FoundryRun idempotency replay conflicts with immutable history.', {
      event_id: existing.event_id,
      idempotency_key: existing.idempotency_key,
    });
  }
  return existing;
}

export function snapshotFromEvents(events: FoundryRunEvent[]): FoundryRunSnapshot {
  if (events.length === 0) fail('FoundryRun requires at least one event.');
  verifyFoundryEventChain(events);
  const first = events[0]!;
  const last = events.at(-1)!;
  const accumulated = events.reduce((state, event) => ({ ...state, ...event.payload }), {} as Record<string, unknown>);
  return {
    surface_kind: 'opl_foundry_run',
    version: 'opl-foundry-run.v1',
    run_id: last.run_id,
    target_agent_id: String(first.payload.target_agent_id ?? ''),
    target_domain_id: String(first.payload.target_domain_id ?? ''),
    request_digest: String(first.payload.request_digest ?? ''),
    activation_revision_at_start: Number(first.payload.activation_revision_at_start ?? 0),
    state: last.to_state,
    revision: last.revision,
    generation: Number(accumulated.generation ?? 0),
    blueprint_digest: typeof accumulated.blueprint_digest === 'string' ? accumulated.blueprint_digest : null,
    previous_blueprint_digest: typeof accumulated.previous_blueprint_digest === 'string' ? accumulated.previous_blueprint_digest : null,
    candidate_digest: typeof accumulated.candidate_digest === 'string' ? accumulated.candidate_digest : null,
    candidate_record_digest: typeof accumulated.candidate_record_digest === 'string'
      ? accumulated.candidate_record_digest
      : null,
    evidence_digest: typeof accumulated.evidence_digest === 'string' ? accumulated.evidence_digest : null,
    frozen_test_plan_digest: typeof accumulated.frozen_test_plan_digest === 'string'
      ? accumulated.frozen_test_plan_digest
      : null,
    proposal_digest: typeof accumulated.proposal_digest === 'string' ? accumulated.proposal_digest : null,
    version_digest: typeof accumulated.version_digest === 'string' ? accumulated.version_digest : null,
    risk_tier: ['low', 'medium', 'high'].includes(String(accumulated.risk_tier))
      ? accumulated.risk_tier as FoundryRiskTier
      : null,
    gate_score: typeof accumulated.gate_score === 'number' ? accumulated.gate_score : null,
    no_improvement_generations: Number(accumulated.no_improvement_generations ?? 0),
    last_event_hash: last.event_hash,
    created_at: first.occurred_at,
    updated_at: last.occurred_at,
  };
}
