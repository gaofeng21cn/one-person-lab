import type { DatabaseSync } from 'node:sqlite';

import type { preflightDomainWorkspaceCheckoutCurrentness } from '../family-runtime-checkout-currentness.ts';
import { inspectStageAttempt, updateStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';
import { nowIso } from '../family-runtime-store.ts';

export function temporalStartProviderRun(
  attempt: { provider_run: Record<string, unknown> },
  temporalStart: unknown,
) {
  if (!temporalStart || typeof temporalStart !== 'object' || Array.isArray(temporalStart)) {
    return null;
  }
  const receipt = temporalStart as Record<string, unknown>;
  return {
    ...attempt.provider_run,
    provider_status: 'started',
    namespace: typeof receipt.namespace === 'string' ? receipt.namespace : attempt.provider_run.namespace ?? null,
    task_queue: typeof receipt.task_queue === 'string' ? receipt.task_queue : attempt.provider_run.task_queue ?? null,
    first_execution_run_id: typeof receipt.first_execution_run_id === 'string'
      ? receipt.first_execution_run_id
      : null,
    temporal_start_receipt: receipt,
    execution_authorization_receipt_refs: Array.isArray(receipt.execution_authorization_receipt_refs)
      ? receipt.execution_authorization_receipt_refs.filter((entry): entry is string => typeof entry === 'string')
      : [],
    execution_authorization_ledger_record: receipt.execution_authorization_ledger_record ?? null,
    temporal_visibility_readiness: receipt.visibility_readiness ?? null,
    started_at: typeof attempt.provider_run.started_at === 'string' ? attempt.provider_run.started_at : nowIso(),
    last_heartbeat_at: nowIso(),
  };
}

export function recordTemporalStartOnAttempt(
  db: DatabaseSync,
  attempt: { stage_attempt_id: string; provider_run: Record<string, unknown> },
  temporalStart: unknown,
) {
  const providerRun = temporalStartProviderRun(attempt, temporalStart);
  if (!providerRun) {
    return;
  }
  const updatedAt = nowIso();
  db.prepare(`
    UPDATE stage_attempts
    SET provider_run_json = ?, updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(JSON.stringify(providerRun), updatedAt, attempt.stage_attempt_id);
}

type CheckoutCurrentnessPreflight = ReturnType<typeof preflightDomainWorkspaceCheckoutCurrentness>;

export function combineLaunchGateWithCheckoutCurrentness<T extends object>(
  gate: T,
  checkoutCurrentnessPreflight: CheckoutCurrentnessPreflight,
) {
  if (!checkoutCurrentnessPreflight) {
    return gate;
  }
  if (checkoutCurrentnessPreflight.status !== 'blocked') {
    return {
      ...gate,
      checkout_currentness_preflight: checkoutCurrentnessPreflight,
    } as T & { checkout_currentness_preflight: typeof checkoutCurrentnessPreflight };
  }
  return {
    ...gate,
    status: 'blocked',
    gate_action: 'block_stage_launch',
    block_reason: checkoutCurrentnessPreflight.reason ?? 'checkout_currentness_blocked',
    blocked_reason: checkoutCurrentnessPreflight.reason ?? 'checkout_currentness_blocked',
    checkout_currentness_preflight: checkoutCurrentnessPreflight,
  } as T & {
    status: 'blocked';
    gate_action: 'block_stage_launch';
    block_reason: string;
    blocked_reason: string;
    checkout_currentness_preflight: typeof checkoutCurrentnessPreflight;
  };
}

export function blockAttemptForCheckoutCurrentness(
  db: DatabaseSync,
  input: {
    attempt: ReturnType<typeof inspectStageAttempt>;
    checkoutCurrentnessPreflight: NonNullable<CheckoutCurrentnessPreflight>;
  },
) {
  const reason = input.checkoutCurrentnessPreflight.reason ?? 'checkout_currentness_blocked';
  const activityEvent = {
    activity_kind: 'stage_attempt_checkout_currentness_preflight',
    activity_status: 'blocked',
    reason,
    checkout_currentness_preflight: input.checkoutCurrentnessPreflight,
    authority_boundary: {
      opl: 'provider_transport_start_gate_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  };
  if (!input.attempt.task_id) {
    const updatedAt = nowIso();
    const providerRun = {
      ...input.attempt.provider_run,
      provider_status: 'blocked',
      last_heartbeat_at: updatedAt,
    };
    const activityEvents = [
      ...input.attempt.activity_events,
      { event_time: updatedAt, ...activityEvent },
    ];
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'blocked', blocked_reason = ?, provider_run_json = ?,
        activity_events_json = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      reason,
      JSON.stringify(providerRun),
      JSON.stringify(activityEvents),
      updatedAt,
      input.attempt.stage_attempt_id,
    );
    return inspectStageAttempt(db, input.attempt.stage_attempt_id);
  }
  const blockedAttempts = updateStageAttemptsForTask(db, {
    taskId: input.attempt.task_id,
    stageAttemptIds: [input.attempt.stage_attempt_id],
    status: 'blocked',
    blockedReason: reason,
    activityEvent,
  });
  return blockedAttempts[0] ?? inspectStageAttempt(db, input.attempt.stage_attempt_id);
}
