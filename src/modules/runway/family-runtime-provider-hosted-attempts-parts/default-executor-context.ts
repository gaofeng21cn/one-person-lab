import type { listStageAttempts } from '../family-runtime-stage-attempts.ts';

export const DEFAULT_EXECUTOR_DISPATCH_TASK_KIND = 'domain_owner/default-executor-dispatch';
export const DEFAULT_EXECUTOR_TRANSPORT_ONLY_CHECKPOINT_SUPERSEDED_REASON =
  'transport_only_checkpoint_checkpoint_superseded_by_provider_attempt_requeue';

function isTransportOnlyAdmissionDispatchReceiptRef(value: unknown) {
  if (typeof value !== 'string') {
    return false;
  }
  return value.includes('/runtime/artifacts/opl_family_domain_handler/dispatch_receipts/')
    || value.startsWith('runtime/artifacts/opl_family_domain_handler/dispatch_receipts/')
    || value.includes('/opl_family_domain_handler/dispatch_receipts/');
}

export function isTransportOnlyDefaultExecutorCheckpoint(
  attempt: ReturnType<typeof listStageAttempts>[number],
) {
  if (
    attempt.stage_id !== DEFAULT_EXECUTOR_DISPATCH_TASK_KIND
    || attempt.executor_kind !== 'codex_cli'
    || attempt.status !== 'checkpointed'
  ) {
    return false;
  }
  const closeoutRefs = Array.isArray(attempt.closeout_refs) ? attempt.closeout_refs : [];
  return closeoutRefs.length > 0
    && closeoutRefs.every(isTransportOnlyAdmissionDispatchReceiptRef);
}

export function isDefaultExecutorNextOwner(nextOwner: string | null) {
  if (nextOwner === null) {
    return false;
  }
  return nextOwner.trim().length > 0;
}
