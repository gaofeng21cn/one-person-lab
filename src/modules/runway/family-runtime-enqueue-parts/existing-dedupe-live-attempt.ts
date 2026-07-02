import { DatabaseSync } from 'node:sqlite';

import {
  providerAdmissionCurrentnessIdentity,
  sameProviderAdmissionCurrentnessIdentity,
} from '../family-runtime-mas-current-control-admission-currentness.ts';
import { listStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';
import { refreshDefaultExecutorLiveAttemptTaskLease } from '../family-runtime-provider-hosted-attempts.ts';
import {
  insertEvent,
  taskToPayload,
  type FamilyRuntimeTaskRow,
} from '../family-runtime-store.ts';

const LIVE_SAME_TASK_DEFAULT_EXECUTOR_STATUSES = new Set(['running', 'checkpointed', 'human_gate']);

export function isLiveSameTaskDefaultExecutorAttempt(
  attempt: ReturnType<typeof listStageAttemptsForTask>[number],
  payload: Record<string, unknown>,
) {
  return attempt.provider_kind === 'temporal'
    && attempt.executor_kind === 'codex_cli'
    && LIVE_SAME_TASK_DEFAULT_EXECUTOR_STATUSES.has(attempt.status)
    && sameLiveAttemptCurrentnessAsPayload(attempt, payload);
}

function sameLiveAttemptCurrentnessAsPayload(
  attempt: ReturnType<typeof listStageAttemptsForTask>[number],
  payload: Record<string, unknown>,
) {
  const payloadIdentity = providerAdmissionCurrentnessIdentity(payload);
  if (!payloadIdentity) {
    return true;
  }
  const attemptIdentity = providerAdmissionCurrentnessIdentity(
    attempt.workspace_locator,
    { requirePendingStatus: false },
  );
  return Boolean(attemptIdentity && sameProviderAdmissionCurrentnessIdentity(attemptIdentity, payloadIdentity));
}

export function recordLiveSameTaskDefaultExecutorDedupeNoop(
  db: DatabaseSync,
  input: {
    existing: FamilyRuntimeTaskRow;
    attempt: ReturnType<typeof listStageAttemptsForTask>[number];
    dedupeKey: string;
    source: string | null | undefined;
  },
) {
  const lease = refreshDefaultExecutorLiveAttemptTaskLease(db, {
    attempt: input.attempt,
    source: input.source ?? 'opl-cli',
    reason: 'same_task_live_stage_attempt_exists_at_enqueue',
  });
  const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.existing.task_id) as
    FamilyRuntimeTaskRow;
  insertEvent(db, {
    taskId: refreshed.task_id,
    domainId: refreshed.domain_id,
    eventType: 'task_default_executor_live_dispatch_dedupe_noop',
    source: input.source ?? 'opl-cli',
    payload: {
      dedupe_key: input.dedupeKey,
      reason: 'same_task_live_stage_attempt_exists_at_enqueue',
      stage_attempt_id: input.attempt.stage_attempt_id,
      previous_status: input.existing.status,
      next_status: refreshed.status,
      lease,
      authority_boundary: {
        opl: 'queue_read_model_repair_from_live_attempt_only',
        domain: 'truth_quality_artifact_gate_owner',
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        provider_stage_attempt_started: false,
        provider_completion_is_domain_ready: false,
      },
    },
  });
  return {
    accepted: false,
    idempotent_noop: true,
    task: taskToPayload(refreshed),
  };
}
