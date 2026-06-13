import {
  providerAdmissionCurrentnessIdentity,
  sameProviderAdmissionCurrentnessIdentity,
} from '../family-runtime-mas-current-control-admission-currentness.ts';
import { listStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';

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
