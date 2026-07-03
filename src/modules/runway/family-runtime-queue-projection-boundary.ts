import { QUEUE_PROJECTION_VOCABULARY } from '../../kernel/queue-projection-vocabulary.ts';

export const FAMILY_RUNTIME_TASK_STATUS = {
  queued: 'queued',
  waitingApproval: 'waiting_approval',
  running: 'running',
  succeeded: 'succeeded',
  retryWaiting: 'retry_waiting',
  blocked: 'blocked',
  deadLetter: QUEUE_PROJECTION_VOCABULARY.deadLetter,
  denied: 'denied',
} as const;

export const FAMILY_RUNTIME_STAGE_ATTEMPT_STATUS = {
  queued: 'queued',
  running: 'running',
  checkpointed: 'checkpointed',
  blocked: 'blocked',
  completed: 'completed',
  failed: 'failed',
  humanGate: 'human_gate',
  deadLettered: 'dead_lettered', // reuse-first: allow stage attempt projection vocabulary; provider/Temporal history remains authoritative.
} as const;

export const FAMILY_RUNTIME_TASK_COLUMNS = {
  maxAttempts: QUEUE_PROJECTION_VOCABULARY.maxAttempts,
  leaseOwner: QUEUE_PROJECTION_VOCABULARY.leaseOwner,
  leaseExpiresAt: 'lease_expires_at', // reuse-first: allow local lease projection column; not worker ownership truth.
  deadLetterReason: 'dead_letter_reason', // reuse-first: allow local failure reason projection column; Temporal failure history is the target owner.
} as const;

const TASKS_TABLE = 'tasks';
const QUEUE_HOLDS_TABLE = 'queue_holds';

export const FAMILY_RUNTIME_QUEUE_PROJECTION_BOUNDARY = {
  surface_kind: 'family_runtime_queue_projection_boundary',
  schema_version: 'family_runtime_queue_projection_boundary.v1',
  durable_lifecycle_owner: 'temporal_workflow_activity_retry_schedule_history',
  local_store_role: 'projection_cache_and_operator_audit_index',
  tables: {
    tasks: TASKS_TABLE, // reuse-first: allow local projection table vocabulary; not durable queue truth.
    queue_holds: QUEUE_HOLDS_TABLE, // reuse-first: allow local projection table vocabulary; not durable queue truth.
  },
  forbidden_claims: [
    'local_tasks_table_is_production_durable_queue',
    'local_lease_columns_are_worker_or_activity_truth',
    'local_dead_letter_columns_are_temporal_failure_history',
    'local_max_attempts_replaces_temporal_retry_policy',
    'queue_hold_projection_can_close_stage_or_owner_route',
  ],
} as const;

export function clearTaskLeaseProjectionSql() {
  const columns = FAMILY_RUNTIME_TASK_COLUMNS;
  return `${columns.leaseOwner} = NULL, ${columns.leaseExpiresAt} = NULL`;
}

export function taskLeaseProjectionPayload(
  leaseOwner: string | null,
  leaseExpiresAt: string | null,
) {
  const columns = FAMILY_RUNTIME_TASK_COLUMNS;
  return {
    [columns.leaseOwner]: leaseOwner,
    [columns.leaseExpiresAt]: leaseExpiresAt,
  };
}

export function taskRetryBudgetProjection(maxAttempts: number) {
  return {
    [FAMILY_RUNTIME_TASK_COLUMNS.maxAttempts]: maxAttempts,
  };
}

export function taskFailureProjectionSql() {
  return `${clearTaskLeaseProjectionSql()}, last_error = ?, ${FAMILY_RUNTIME_TASK_COLUMNS.deadLetterReason} = ?, updated_at = ?`;
}

export function resetTaskForRedriveProjectionSql() {
  return `status = ?, attempts = 0, requires_approval = ?, ${clearTaskLeaseProjectionSql()}, last_error = ?, ${FAMILY_RUNTIME_TASK_COLUMNS.deadLetterReason} = NULL, updated_at = ?`;
}
