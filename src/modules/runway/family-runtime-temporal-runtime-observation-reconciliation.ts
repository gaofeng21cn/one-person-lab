import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { stringValue } from '../../kernel/json-record.ts';
import {
  listStageAttemptRows,
  stageAttemptToPayload,
} from './family-runtime-stage-attempt-ledger.ts';
import { syncStageAttemptFromTemporalTerminalObservation } from './family-runtime-stage-attempts-parts/temporal-terminal-observation.ts';
import { insertEvent, type familyRuntimePaths } from './family-runtime-store.ts';
import { queryTemporalStageAttemptReadModel } from './family-runtime-temporal-query.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from './family-runtime-execution-scope-persistence.ts';

type JsonRecord = Record<string, unknown>;
type RuntimePaths = Pick<ReturnType<typeof familyRuntimePaths>, 'root'>;

export const TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_SURFACE_KIND =
  'temporal_stage_attempt_runtime_observation' as const;
export const TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_SOURCE =
  'temporal_workflow_query' as const;
export const DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS = 10 * 60 * 1000;
export const MAX_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_CANDIDATE_LIMIT = 64;
export const DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_LEGACY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_CONCURRENCY = 1;
export const MAX_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_CONCURRENCY = 4;

const RECONCILABLE_LEDGER_STATUSES = new Set([
  'queued',
  'running',
  'checkpointed',
  'human_gate',
]);
const RECONCILABLE_STAGE_RUN_LAUNCH_STATUSES = new Set([
  'registered',
  'starting',
  'started',
]);

function record(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function normalizedStatus(value: unknown) {
  return stringValue(value)?.toLowerCase() ?? null;
}

function validRuntimeObservationTtlMs(value: unknown): value is number {
  return Number.isInteger(value)
    && Number(value) > 0
    && Number(value) <= MAX_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS;
}

function runtimeObservationTtlMs(explicitTtlMs?: number) {
  if (validRuntimeObservationTtlMs(explicitTtlMs)) {
    return Number(explicitTtlMs);
  }
  const configuredText = process.env.OPL_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS ?? '';
  const configured = /^[1-9][0-9]*$/.test(configuredText) ? Number(configuredText) : null;
  return validRuntimeObservationTtlMs(configured)
    ? configured
    : DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_TTL_MS;
}

function boundedPositiveInteger(value: unknown, fallback: number, maximum: number) {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= maximum
    ? Number(value)
    : fallback;
}

function stageRunLaunchStatuses(db: DatabaseSync) {
  const table = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stage_run_launches'",
  ).get();
  if (!table) return new Map<string, string>();
  return new Map(
    (db.prepare('SELECT stage_run_id, launch_status FROM stage_run_launches').all() as Array<{
      stage_run_id: string;
      launch_status: string;
    }>).map((row) => [row.stage_run_id, normalizedStatus(row.launch_status) ?? 'unknown']),
  );
}

function reconciliationCandidates(
  db: DatabaseSync,
  input: {
    observedAtMs: number;
    candidateLimit?: number;
    legacyLookbackMs?: number;
  },
) {
  const candidateLimit = boundedPositiveInteger(
    input.candidateLimit,
    DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_CANDIDATE_LIMIT,
    256,
  );
  const legacyLookbackMs = boundedPositiveInteger(
    input.legacyLookbackMs,
    DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_LEGACY_LOOKBACK_MS,
    7 * 24 * 60 * 60 * 1000,
  );
  const launchStatuses = stageRunLaunchStatuses(db);
  const candidates = listStageAttemptRows(db)
    .filter((row) => row.provider_kind === 'temporal' && RECONCILABLE_LEDGER_STATUSES.has(row.status));
  let identityUnresolvedTotal = 0;
  const admitted = candidates.filter((row) => {
    try {
      requireRuntimeExecutionScopeMutationAllowed(
        db,
        row as unknown as Record<string, unknown>,
        'select_temporal_stage_attempt_runtime_observation_candidate',
      );
      return true;
    } catch (error) {
      if (
        error instanceof FrameworkContractError
        && error.details?.failure_code === 'runtime_execution_identity_unresolved'
      ) {
        identityUnresolvedTotal += 1;
        return false;
      }
      throw error;
    }
  });
  const eligible = admitted.filter((row) => {
    const launchStatus = row.stage_run_id ? launchStatuses.get(row.stage_run_id) : null;
    if (launchStatus) return RECONCILABLE_STAGE_RUN_LAUNCH_STATUSES.has(launchStatus);
    const updatedAtMs = Date.parse(row.updated_at);
    return Number.isFinite(updatedAtMs)
      && updatedAtMs >= input.observedAtMs - legacyLookbackMs;
  });
  return {
    attempts: eligible.slice(0, candidateLimit).map(stageAttemptToPayload),
    candidate_total: candidates.length,
    identity_unresolved_total: identityUnresolvedTotal,
    eligible_total: eligible.length,
    deferred_total: candidates.length - Math.min(eligible.length, candidateLimit),
    limited_total: Math.max(0, eligible.length - candidateLimit),
    candidate_limit: candidateLimit,
    legacy_lookback_ms: legacyLookbackMs,
  };
}

function withReconciliationAttemptMutation<T>(
  db: DatabaseSync,
  stageAttemptId: string,
  operation: string,
  mutation: () => T,
) {
  const ownsTransaction = !db.isTransaction;
  try {
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    const row = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
      stageAttemptId,
    ) as Record<string, unknown> | undefined;
    if (!row) {
      throw new FrameworkContractError('contract_shape_invalid', 'Stage attempt disappeared before reconciliation.', {
        failure_code: 'persisted_runtime_stage_attempt_not_found',
        operation,
        stage_attempt_id: stageAttemptId,
      });
    }
    requireRuntimeExecutionScopeMutationAllowed(db, row, operation);
    const result = mutation();
    if (ownsTransaction) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

function effectiveRuntimeStatus(workflowStatus: string | null, queryStatus: string | null) {
  if (queryStatus === 'human_gate') return 'human_gate';
  if (queryStatus === 'blocked') return 'blocked';
  if (workflowStatus === 'canceled' || workflowStatus === 'cancelled') return 'provider_canceled';
  if (workflowStatus === 'timed_out') return 'provider_timed_out';
  if (workflowStatus === 'terminated') return 'provider_terminated';
  if (workflowStatus === 'failed' || queryStatus === 'failed') return 'provider_failed';
  if (workflowStatus === 'completed' || queryStatus === 'completed') return 'provider_completed';
  if (
    workflowStatus === 'running'
    || queryStatus === 'running'
    || queryStatus === 'checkpointed'
  ) {
    return 'running';
  }
  return 'unknown';
}

function temporalRuntimeObservation(input: {
  temporalQuery: JsonRecord;
  observedAt: string;
  ttlMs: number;
}) {
  const observedAtMs = Date.parse(input.observedAt);
  if (!Number.isFinite(observedAtMs)) {
    throw new Error('Temporal runtime observation requires a valid observed_at timestamp.');
  }
  const query = record(input.temporalQuery.query);
  const stageAttemptId = stringValue(input.temporalQuery.stage_attempt_id);
  const workflowId = stringValue(input.temporalQuery.workflow_id);
  const runId = stringValue(input.temporalQuery.run_id);
  const providerUpdatedAt = stringValue(query?.updated_at);
  if (!stageAttemptId || !workflowId || !runId || !providerUpdatedAt) {
    throw new Error('Temporal runtime observation requires complete Attempt, Workflow, run, and provider timestamps.');
  }
  const workflowStatus = normalizedStatus(input.temporalQuery.workflow_status);
  const queryStatus = normalizedStatus(query?.status);
  return {
    surface_kind: TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_SURFACE_KIND,
    source: TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_SOURCE,
    provider_kind: 'temporal' as const,
    stage_attempt_id: stageAttemptId,
    workflow_id: workflowId,
    run_id: runId,
    observed_at: new Date(observedAtMs).toISOString(),
    ttl_ms: input.ttlMs,
    expires_at: new Date(observedAtMs + input.ttlMs).toISOString(),
    workflow_status: workflowStatus,
    query_status: queryStatus,
    effective_runtime_status: effectiveRuntimeStatus(workflowStatus, queryStatus),
    provider_updated_at: providerUpdatedAt,
    provider_completion_is_domain_ready: false as const,
    authority_boundary: {
      opl: 'rebuildable_provider_runtime_projection_cache_only',
      temporal: 'provider_lifecycle_authority',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_attempt_ledger_status: false,
      can_claim_domain_ready: false,
    },
  };
}

export type TemporalStageAttemptRuntimeObservation = ReturnType<typeof temporalRuntimeObservation>;

export function readFreshTemporalStageAttemptRuntimeObservation(
  providerRun: JsonRecord,
  input: {
    stageAttemptId: string;
    workflowId: string;
    nowMs?: number;
  },
): TemporalStageAttemptRuntimeObservation | null {
  const observation = record(providerRun.runtime_observation);
  const nowMs = input.nowMs ?? Date.now();
  if (
    observation?.surface_kind !== TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_SURFACE_KIND
    || observation.source !== TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_SOURCE
    || observation.provider_kind !== 'temporal'
    || observation.provider_completion_is_domain_ready !== false
    || observation.stage_attempt_id !== input.stageAttemptId
    || observation.workflow_id !== input.workflowId
    || typeof observation.run_id !== 'string'
    || observation.run_id.trim().length === 0
    || typeof observation.provider_updated_at !== 'string'
    || typeof observation.observed_at !== 'string'
    || typeof observation.expires_at !== 'string'
    || !validRuntimeObservationTtlMs(observation.ttl_ms)
  ) {
    return null;
  }
  const observedAtMs = Date.parse(observation.observed_at);
  const expiresAtMs = Date.parse(observation.expires_at);
  const providerUpdatedAtMs = Date.parse(observation.provider_updated_at);
  if (
    !Number.isFinite(observedAtMs)
    || !Number.isFinite(expiresAtMs)
    || !Number.isFinite(providerUpdatedAtMs)
    || !Number.isFinite(nowMs)
    || expiresAtMs - observedAtMs !== observation.ttl_ms
    || observedAtMs > nowMs + 5_000
    || providerUpdatedAtMs > nowMs + 5_000
    || nowMs >= expiresAtMs
  ) {
    return null;
  }
  return observation as TemporalStageAttemptRuntimeObservation;
}

function isSuccessfulTemporalQuery(value: unknown): value is JsonRecord {
  const payload = record(value);
  return payload?.surface_kind === 'temporal_stage_attempt_query_receipt'
    && payload.provider_kind === 'temporal'
    && typeof payload.stage_attempt_id === 'string'
    && typeof payload.workflow_id === 'string';
}

function temporalQueryMatchesAttempt(
  value: unknown,
  attempt: { stage_attempt_id: string; workflow_id: string },
) {
  const payload = record(value);
  return payload
    && payload.stage_attempt_id === attempt.stage_attempt_id
    && payload.workflow_id === attempt.workflow_id;
}

function requiresTerminalProjectionSync(value: JsonRecord) {
  const workflowStatus = normalizedStatus(value.workflow_status);
  const queryStatus = normalizedStatus(record(value.query)?.status);
  return [
    'completed',
    'failed',
    'canceled',
    'cancelled',
    'terminated',
    'timed_out',
  ].includes(workflowStatus ?? '')
    || ['blocked', 'completed', 'failed'].includes(queryStatus ?? '');
}

function persistRuntimeObservation(
  db: DatabaseSync,
  observation: TemporalStageAttemptRuntimeObservation,
) {
  return withReconciliationAttemptMutation(
    db,
    observation.stage_attempt_id,
    'persist_temporal_stage_attempt_runtime_observation',
    () => {
      const result = db.prepare(`
        UPDATE stage_attempts
        SET provider_run_json = json_set(
          CASE WHEN json_valid(provider_run_json) THEN provider_run_json ELSE '{}' END,
          '$.runtime_observation',
          json(?)
        )
        WHERE stage_attempt_id = ?
          AND provider_kind = 'temporal'
          AND workflow_id = ?
          AND status IN ('queued', 'running', 'checkpointed', 'human_gate')
          AND (
            stage_run_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM stage_run_launches
              WHERE stage_run_launches.stage_run_id = stage_attempts.stage_run_id
            )
            OR EXISTS (
              SELECT 1 FROM stage_run_launches
              WHERE stage_run_launches.stage_run_id = stage_attempts.stage_run_id
                AND stage_run_launches.launch_status IN ('registered', 'starting', 'started')
            )
          )
      `).run(
        JSON.stringify(observation),
        observation.stage_attempt_id,
        observation.workflow_id,
      );
      return result.changes === 1;
    },
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export type TemporalRuntimeObservationReconciliationDeps = {
  queryTemporalStageAttemptReadModel?: (
    attempt: Parameters<typeof queryTemporalStageAttemptReadModel>[0],
    options?: Parameters<typeof queryTemporalStageAttemptReadModel>[1],
  ) => Promise<unknown>;
  now?: () => string;
  ttlMs?: number;
  concurrency?: number;
  candidateLimit?: number;
  legacyLookbackMs?: number;
};

export async function reconcileTemporalStageAttemptRuntimeObservations(
  db: DatabaseSync,
  paths: RuntimePaths,
  input: TemporalRuntimeObservationReconciliationDeps & {
    trigger: 'provider_slo_tick' | 'temporal_scheduler_cadence';
  },
) {
  const queryReadModel = input.queryTemporalStageAttemptReadModel
    ?? queryTemporalStageAttemptReadModel;
  const ttlMs = runtimeObservationTtlMs(input.ttlMs);
  const observedAt = input.now?.() ?? new Date().toISOString();
  const observedAtMs = Date.parse(observedAt);
  if (!Number.isFinite(observedAtMs)) {
    throw new Error('Temporal runtime observation reconciliation requires a valid observed_at timestamp.');
  }
  const selection = reconciliationCandidates(db, {
    observedAtMs,
    candidateLimit: input.candidateLimit,
    legacyLookbackMs: input.legacyLookbackMs,
  });
  const attempts = selection.attempts;
  const results: JsonRecord[] = [];
  let cursor = 0;
  const concurrency = Math.max(
    1,
    Math.min(
      MAX_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_CONCURRENCY,
      Number.isInteger(input.concurrency)
        ? Number(input.concurrency)
        : DEFAULT_TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_CONCURRENCY,
    ),
  );

  const workers = Array.from({ length: Math.min(concurrency, attempts.length) }, async () => {
    while (cursor < attempts.length) {
      const attempt = attempts[cursor];
      cursor += 1;
      if (!attempt) continue;
      try {
        const temporalQuery = await queryReadModel(attempt, { paths });
        if (record(temporalQuery) && !temporalQueryMatchesAttempt(temporalQuery, attempt)) {
          results.push({
            stage_attempt_id: attempt.stage_attempt_id,
            workflow_id: attempt.workflow_id,
            reconciliation_status: 'query_identity_mismatch',
          });
          continue;
        }
        if (!isSuccessfulTemporalQuery(temporalQuery)) {
          withReconciliationAttemptMutation(
            db,
            attempt.stage_attempt_id,
            'sync_temporal_stage_attempt_unavailable_observation',
            () => syncStageAttemptFromTemporalTerminalObservation(db, temporalQuery),
          );
          const unavailable = record(temporalQuery);
          results.push({
            stage_attempt_id: attempt.stage_attempt_id,
            workflow_id: attempt.workflow_id,
            reconciliation_status: 'query_unavailable',
            reason: stringValue(unavailable?.reason) ?? 'temporal_query_receipt_unavailable',
          });
          continue;
        }
        if (requiresTerminalProjectionSync(temporalQuery)) {
          withReconciliationAttemptMutation(
            db,
            attempt.stage_attempt_id,
            'sync_temporal_stage_attempt_terminal_observation',
            () => syncStageAttemptFromTemporalTerminalObservation(db, temporalQuery),
          );
          results.push({
            stage_attempt_id: attempt.stage_attempt_id,
            workflow_id: attempt.workflow_id,
            reconciliation_status: 'terminal_projected',
            workflow_status: normalizedStatus(temporalQuery.workflow_status),
            query_status: normalizedStatus(record(temporalQuery.query)?.status),
          });
          continue;
        }
        const observation = temporalRuntimeObservation({
          temporalQuery,
          observedAt,
          ttlMs,
        });
        const persisted = persistRuntimeObservation(db, observation);
        results.push({
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          reconciliation_status: persisted ? 'refreshed' : 'identity_or_terminal_mismatch',
          effective_runtime_status: observation.effective_runtime_status,
          observed_at: observation.observed_at,
          expires_at: observation.expires_at,
        });
      } catch (error) {
        results.push({
          stage_attempt_id: attempt.stage_attempt_id,
          workflow_id: attempt.workflow_id,
          reconciliation_status: 'query_failed',
          reason: errorMessage(error),
        });
      }
    }
  });
  await Promise.all(workers);
  results.sort((left, right) => String(left.stage_attempt_id).localeCompare(String(right.stage_attempt_id)));

  const refreshedTotal = results.filter((result) => result.reconciliation_status === 'refreshed').length;
  const terminalProjectedTotal = results.filter(
    (result) => result.reconciliation_status === 'terminal_projected',
  ).length;
  const failedTotal = results.length - refreshedTotal - terminalProjectedTotal;
  const report = {
    surface_kind: 'temporal_stage_attempt_runtime_observation_reconciliation',
    provider_kind: 'temporal' as const,
    trigger: input.trigger,
    observation_surface_kind: TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_SURFACE_KIND,
    observation_source: TEMPORAL_STAGE_ATTEMPT_RUNTIME_OBSERVATION_SOURCE,
    ttl_ms: ttlMs,
    candidate_policy: 'current_execution_identity_active_stage_runs_bounded',
    candidate_total: selection.candidate_total,
    identity_unresolved_total: selection.identity_unresolved_total,
    eligible_total: selection.eligible_total,
    selected_total: attempts.length,
    deferred_total: selection.deferred_total,
    limited_total: selection.limited_total,
    candidate_limit: selection.candidate_limit,
    legacy_lookback_ms: selection.legacy_lookback_ms,
    concurrency,
    refreshed_total: refreshedTotal,
    terminal_projected_total: terminalProjectedTotal,
    failed_total: failedTotal,
    status: failedTotal === 0 ? 'completed' : refreshedTotal > 0 ? 'completed_with_query_failures' : 'query_unavailable',
    results,
    authority_boundary: {
      opl: 'rebuildable_provider_runtime_projection_cache_only',
      temporal: 'provider_lifecycle_authority',
      domain: 'truth_quality_artifact_gate_owner',
      can_write_attempt_ledger_status_from_nonterminal_observation: false,
      provider_completion_is_domain_ready: false,
    },
  };
  const event = attempts.length > 0
    ? insertEvent(db, {
        eventType: 'temporal_stage_attempt_runtime_observation_reconciliation',
        source: `opl-${input.trigger.replaceAll('_', '-')}`,
        payload: report,
      })
    : null;
  return {
    ...report,
    event_id: event?.event_id ?? null,
  };
}
