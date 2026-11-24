import type { WorkItemSessionActivityState } from './types.ts';

export const ACTIVE_SESSION_TTL_MS = 300_000;
export const ACTIVE_SESSION_MAX_TTL_MS = 900_000;
export const STALE_SESSION_GRACE_MS = ACTIVE_SESSION_MAX_TTL_MS - ACTIVE_SESSION_TTL_MS;
export const MAX_FUTURE_SKEW_MS = 5_000;
export const ACTIVE_SESSION_REF_LIMIT = 8;
export const TERMINAL_ACTIVITY_STATES = new Set<WorkItemSessionActivityState>([
  'completed',
  'failed',
  'cancelled',
]);

export const WORK_ITEM_EXECUTION_SESSION_ACTIVITY_POLICY = {
  active_ttl_ms: ACTIVE_SESSION_TTL_MS,
  max_ttl_ms: ACTIVE_SESSION_MAX_TTL_MS,
  stale_grace_ms: STALE_SESSION_GRACE_MS,
  max_future_skew_ms: MAX_FUTURE_SKEW_MS,
  max_refs_per_work_item: ACTIVE_SESSION_REF_LIMIT,
  read_scope: 'current_work_item_identity_with_bounded_freshness_only',
  precedence: [
    'human_gate_or_domain_terminal',
    'canonical_stage_attempt_currentness',
    'fresh_controlled_execution_session',
    'coordination_activity_is_not_execution_proof',
  ],
} as const;
