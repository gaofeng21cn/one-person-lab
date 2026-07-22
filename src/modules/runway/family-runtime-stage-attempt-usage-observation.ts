import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { record, stringValue } from '../../kernel/json-record.ts';
import {
  isExecutorUsageObservation,
  missingExecutorUsageObservation,
  observedExecutorUsageObservation,
  partialExecutorUsageObservation,
  type ExecutorUsageObservation,
} from './family-runtime-codex-session-usage.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from './family-runtime-execution-scope-persistence.ts';

type UsageObservationRow = {
  stage_attempt_id: string;
  execution_session_ref: string | null;
  usage_observation_json: string | null;
};

function sha256Text(value: string) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function sourceKind(value: unknown): 'codex_exec_turn_completed' | 'codex_session_token_count' | null {
  if (value === 'codex_exec_turn_completed' || value === 'codex_session_token_count') return value;
  return null;
}

function telemetryStatus(costSummary: Record<string, unknown>) {
  return stringValue(costSummary.telemetry_status)
    ?? stringValue(costSummary.usage_status)
    ?? stringValue(costSummary.cost_status);
}

function workerSourceIsStale(costSummary: Record<string, unknown>) {
  return costSummary.worker_source_current === false
    || costSummary.managed_worker_source_current === false
    || stringValue(costSummary.worker_source_status) === 'worker_source_stale'
    || stringValue(costSummary.worker_lifecycle_status) === 'worker_source_stale';
}

function legacyTokenUsage(costSummary: Record<string, unknown>) {
  const tokens = record(costSummary.token_usage);
  const inputTokens = nonNegativeNumber(tokens.input_tokens);
  const outputTokens = nonNegativeNumber(tokens.output_tokens);
  const explicitTotal = nonNegativeNumber(tokens.total_tokens);
  const cachedInputTokens = nonNegativeNumber(tokens.cached_input_tokens);
  const reasoningOutputTokens = nonNegativeNumber(tokens.reasoning_output_tokens);
  return {
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    reasoning_output_tokens: reasoningOutputTokens,
    total_tokens: explicitTotal ?? (
      inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null
    ),
  };
}

function legacySourceKind(costSummary: Record<string, unknown>) {
  const explicit = sourceKind(costSummary.telemetry_source);
  if (explicit) return explicit;
  if (costSummary.session_usage_refs || stringValue(costSummary.usage_ref)?.startsWith('codex_session_usage:')) {
    return 'codex_session_token_count' as const;
  }
  return null;
}

function legacyObservation(input: {
  costSummary: Record<string, unknown>;
  observedAt: string;
  executionSessionRef: string | null;
  sourceFallbackRef: string;
}): ExecutorUsageObservation {
  const status = telemetryStatus(input.costSummary);
  const sourceRef = stringValue(input.costSummary.source_ref)
    ?? stringValue(input.costSummary.usage_ref)
    ?? input.sourceFallbackRef;
  const sourceHash = stringValue(input.costSummary.source_hash)
    ?? sha256Text(JSON.stringify(input.costSummary));
  const kind = legacySourceKind(input.costSummary);
  const missingReason = stringValue(input.costSummary.missing_reason)
    ?? stringValue(input.costSummary.missing_usage_telemetry_reason);

  if (workerSourceIsStale(input.costSummary)) {
    return missingExecutorUsageObservation({
      status: 'stale',
      sourceKind: kind,
      sourceRef,
      sourceHash,
      observedAt: input.observedAt,
      executionSessionRef: input.executionSessionRef,
      missingReason: 'worker_source_stale_usage_untrusted',
    });
  }

  const tokens = legacyTokenUsage(input.costSummary);
  const coreComplete = tokens.input_tokens !== null
    && tokens.output_tokens !== null
    && tokens.total_tokens !== null;
  const subsetsValid = coreComplete
    && (tokens.cached_input_tokens === null || tokens.cached_input_tokens <= tokens.input_tokens!)
    && (tokens.reasoning_output_tokens === null || tokens.reasoning_output_tokens <= tokens.output_tokens!)
    && tokens.total_tokens! >= tokens.input_tokens! + tokens.output_tokens!;
  const zero = coreComplete
    && tokens.input_tokens === 0
    && tokens.output_tokens === 0
    && tokens.total_tokens === 0;
  const unreported = status?.includes('unreported') === true || status?.startsWith('not_measured') === true;
  if (unreported && zero) {
    return missingExecutorUsageObservation({
      status: 'stale',
      sourceKind: kind,
      sourceRef,
      sourceHash,
      observedAt: input.observedAt,
      executionSessionRef: input.executionSessionRef,
      missingReason: 'legacy_or_stale_worker_usage_unreported',
    });
  }
  if (status === 'observed' && subsetsValid && kind) {
    return observedExecutorUsageObservation({
      sourceKind: kind,
      sourceRef,
      sourceHash,
      observedAt: input.observedAt,
      executionSessionRef: input.executionSessionRef,
      tokenUsage: {
        input_tokens: tokens.input_tokens!,
        cached_input_tokens: tokens.cached_input_tokens,
        output_tokens: tokens.output_tokens!,
        reasoning_output_tokens: tokens.reasoning_output_tokens,
        total_tokens: tokens.total_tokens!,
      },
    });
  }
  if (status === 'partial' || (!subsetsValid && Object.values(tokens).some((value) => value !== null))) {
    return partialExecutorUsageObservation({
      sourceKind: kind ?? 'codex_exec_turn_completed',
      sourceRef,
      sourceHash,
      observedAt: input.observedAt,
      executionSessionRef: input.executionSessionRef,
      partialUsage: tokens,
      missingReason: missingReason ?? 'legacy_usage_observation_incomplete',
    });
  }
  return missingExecutorUsageObservation({
    status: status === 'stale' ? 'stale' : 'missing',
    sourceKind: kind,
    sourceRef,
    sourceHash,
    observedAt: input.observedAt,
    executionSessionRef: input.executionSessionRef,
    missingReason: missingReason ?? 'authoritative_usage_observation_missing',
  });
}

export function executorUsageObservationFromCostSummary(input: {
  costSummary: Record<string, unknown> | null;
  observedAt: string;
  executionSessionRef: string | null;
  sourceFallbackRef: string;
  workerSourceCurrent?: boolean | null;
}) {
  const costSummary = input.costSummary ?? {};
  const nested = costSummary.usage_observation;
  if (isExecutorUsageObservation(nested)) {
    if (input.workerSourceCurrent === false || workerSourceIsStale(costSummary)) {
      return missingExecutorUsageObservation({
        status: 'stale',
        sourceKind: nested.source_kind,
        sourceRef: nested.source_ref,
        sourceHash: nested.source_hash,
        observedAt: nested.observed_at,
        executionSessionRef: nested.execution_session_ref ?? input.executionSessionRef,
        missingReason: 'worker_source_stale_usage_untrusted',
      });
    }
    return input.executionSessionRef && !nested.execution_session_ref
      ? { ...nested, execution_session_ref: input.executionSessionRef }
      : nested;
  }
  return legacyObservation({
    costSummary: input.workerSourceCurrent === false
      ? { ...costSummary, worker_source_current: false }
      : costSummary,
    observedAt: input.observedAt,
    executionSessionRef: input.executionSessionRef,
    sourceFallbackRef: input.sourceFallbackRef,
  });
}

function observationPriority(observation: ExecutorUsageObservation) {
  const statusPriority = {
    observed: 40,
    partial: 30,
    stale: 20,
    missing: 10,
  }[observation.telemetry_status];
  const sourcePriority = observation.source_kind === 'codex_exec_turn_completed'
    ? 2
    : observation.source_kind === 'codex_session_token_count'
      ? 1
      : 0;
  return statusPriority + sourcePriority;
}

function parsePersistedObservation(value: string | null) {
  if (!value) return null;
  try {
    const parsed = parseJsonText(value);
    return isExecutorUsageObservation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function selectAuthoritativeObservation(
  existing: ExecutorUsageObservation | null,
  incoming: ExecutorUsageObservation,
) {
  if (!existing || observationPriority(incoming) > observationPriority(existing)) return incoming;
  if (existing.idempotency_key === incoming.idempotency_key) return existing;
  if (observationPriority(incoming) < observationPriority(existing)) return existing;
  if (JSON.stringify(existing) === JSON.stringify(incoming)) return existing;
  throw new FrameworkContractError(
    'contract_shape_invalid',
    'Stage attempt received conflicting authoritative usage observations.',
    {
      existing_observation_id: existing.observation_id,
      received_observation_id: incoming.observation_id,
      existing_source_ref: existing.source_ref,
      received_source_ref: incoming.source_ref,
    },
  );
}

export function persistStageAttemptUsageObservation(db: DatabaseSync, input: {
  stageAttemptId: string;
  costSummary: Record<string, unknown> | null;
  observedAt: string;
  executionSessionRef?: string | null;
  sourceFallbackRef?: string;
  workerSourceCurrent?: boolean | null;
}) {
  const ownsTransaction = !db.isTransaction;
  try {
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    const row = db.prepare(`
      SELECT * FROM stage_attempts WHERE stage_attempt_id = ?
    `).get(input.stageAttemptId) as (UsageObservationRow & Record<string, unknown>) | undefined;
    if (!row) {
      throw new FrameworkContractError('cli_usage_error', 'Stage attempt not found.', {
        stage_attempt_id: input.stageAttemptId,
      });
    }
    requireRuntimeExecutionScopeMutationAllowed(db, row, 'persist_stage_attempt_usage_observation');
  const executionSessionRef = input.executionSessionRef?.trim()
    || row.execution_session_ref
    || null;
  if (
    row.execution_session_ref
    && executionSessionRef
    && row.execution_session_ref !== executionSessionRef
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Stage attempt execution session is immutable.', {
      stage_attempt_id: row.stage_attempt_id,
      existing_execution_session_ref: row.execution_session_ref,
      received_execution_session_ref: executionSessionRef,
    });
  }
  const incoming = executorUsageObservationFromCostSummary({
    costSummary: input.costSummary,
    observedAt: input.observedAt,
    executionSessionRef,
    sourceFallbackRef: input.sourceFallbackRef
      ?? `stage_attempt:${input.stageAttemptId}#usage_observation`,
    workerSourceCurrent: input.workerSourceCurrent,
  });
  if (
    incoming.execution_session_ref
    && executionSessionRef
    && incoming.execution_session_ref !== executionSessionRef
  ) {
    throw new FrameworkContractError('contract_shape_invalid', 'Usage observation session does not match its stage attempt.', {
      stage_attempt_id: input.stageAttemptId,
      attempt_execution_session_ref: executionSessionRef,
      observation_execution_session_ref: incoming.execution_session_ref,
    });
  }
  const selected = selectAuthoritativeObservation(
    parsePersistedObservation(row.usage_observation_json),
    incoming,
  );
  const selectedJson = JSON.stringify(selected);
  const idempotentNoop = row.usage_observation_json === selectedJson
    && row.execution_session_ref === executionSessionRef;
  if (!idempotentNoop) {
    db.prepare(`
      UPDATE stage_attempts
      SET execution_session_ref = COALESCE(execution_session_ref, ?),
        usage_observation_json = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(executionSessionRef, selectedJson, input.observedAt, input.stageAttemptId);
  }
    const result = {
      observation: selected,
      idempotent_noop: idempotentNoop,
      authoritative_source_count: 1,
    };
    if (ownsTransaction) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
