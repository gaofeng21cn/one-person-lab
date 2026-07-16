import type { DatabaseSync } from 'node:sqlite';

import type { preflightDomainWorkspaceCheckoutCurrentness } from '../family-runtime-checkout-currentness.ts';
import { inspectStageAttempt } from '../family-runtime-stage-attempts.ts';
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

export function persistStageAttemptLaunchBinding<T extends {
  stage_attempt_id: string;
  workspace_locator: Record<string, unknown>;
  provider_run: Record<string, unknown>;
}>(
  db: DatabaseSync,
  attempt: T,
  input: {
    workspaceLocator: Record<string, unknown>;
    packageUseBinding: Record<string, unknown> | null;
    domainPackRoot: string | null;
  },
) {
  const updatedAt = nowIso();
  const providerRun = {
    ...attempt.provider_run,
    execution_package_use_context: {
      status: 'attempt_launch_binding_persisted',
      recorded_at: updatedAt,
      package_use_binding: input.packageUseBinding,
      domain_pack_root: input.domainPackRoot,
    },
  };
  const reservation = db.prepare(`
    UPDATE stage_attempts
    SET workspace_locator_json = ?, provider_run_json = ?, updated_at = ?
    WHERE stage_attempt_id = ?
      AND COALESCE(json_extract(
        provider_run_json,
        '$.execution_package_use_context.status'
      ), '') = ''
      AND COALESCE(json_extract(provider_run_json, '$.first_execution_run_id'), '') = ''
  `).run(
    JSON.stringify(input.workspaceLocator),
    JSON.stringify(providerRun),
    updatedAt,
    attempt.stage_attempt_id,
  );
  if (reservation.changes === 0) {
    return inspectStageAttempt(db, attempt.stage_attempt_id);
  }
  return {
    ...attempt,
    workspace_locator: input.workspaceLocator,
    provider_run: providerRun,
  };
}

type CheckoutCurrentnessPreflight = ReturnType<typeof preflightDomainWorkspaceCheckoutCurrentness>;

export function attachCheckoutCurrentnessToStageContext<T extends object>(
  observation: T,
  checkoutCurrentnessPreflight: CheckoutCurrentnessPreflight,
) {
  if (!checkoutCurrentnessPreflight) {
    return observation;
  }
  return {
    ...observation,
    checkout_currentness_preflight: checkoutCurrentnessPreflight,
  } as T & { checkout_currentness_preflight: typeof checkoutCurrentnessPreflight };
}
