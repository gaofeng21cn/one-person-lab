import crypto from 'node:crypto';

import { canonicalJsonText } from '../../kernel/canonical-json.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';
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
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    fail(`FoundryRun transition ${from} -> ${to} is not allowed.`, { from_state: from, to_state: to });
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
  let previous: FoundryRunEvent | null = null;
  const idempotency = new Set<string>();
  for (const event of events) {
    if (event.revision !== (previous?.revision ?? 0) + 1) fail('FoundryRun event revisions are not contiguous.');
    if (event.previous_event_hash !== (previous?.event_hash ?? null)) fail('FoundryRun event hash chain is broken.');
    const { event_hash: supplied, ...withoutHash } = event;
    if (eventHash(withoutHash) !== supplied) fail('FoundryRun event hash is invalid.', { event_id: event.event_id });
    if (idempotency.has(event.idempotency_key)) fail('FoundryRun event idempotency key is duplicated.');
    if (previous) assertFoundryTransition(previous.to_state, event.to_state);
    idempotency.add(event.idempotency_key);
    previous = event;
  }
  return { status: 'valid' as const, event_count: events.length, last_event_hash: previous?.event_hash ?? null };
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
