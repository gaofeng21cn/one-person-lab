import crypto from 'node:crypto';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';
import type { CodexSessionRecoveryResult } from './codex.ts';

export type TokenUsageTotals = {
  input_tokens: number;
  cached_input_tokens: number | null;
  output_tokens: number;
  reasoning_output_tokens: number | null;
  total_tokens: number;
};

export type PartialTokenUsage = {
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  reasoning_output_tokens: number | null;
  total_tokens: number | null;
};

type UsageObservationBase = {
  surface_kind: 'opl_executor_usage_observation';
  version: 'executor-usage-observation.v1';
  observation_id: string;
  idempotency_key: string;
  source_kind: 'codex_exec_turn_completed' | 'codex_session_token_count' | null;
  source_ref: string | null;
  source_hash: string | null;
  observed_at: string;
  execution_session_ref: string | null;
  accounting_semantics: {
    input_tokens_include_cached_input_tokens: true;
    output_tokens_include_reasoning_output_tokens: true;
    cached_and_reasoning_tokens_are_diagnostic_subsets: true;
  };
};

export type ExecutorUsageObservation =
  | (UsageObservationBase & {
      telemetry_status: 'observed';
      token_usage: TokenUsageTotals;
      partial_token_usage: null;
      missing_reason: null;
    })
  | (UsageObservationBase & {
      telemetry_status: 'partial';
      token_usage: null;
      partial_token_usage: PartialTokenUsage;
      missing_reason: string;
    })
  | (UsageObservationBase & {
      telemetry_status: 'missing' | 'stale';
      token_usage: null;
      partial_token_usage: null;
      missing_reason: string;
    });

export type CodexSessionUsageRef = {
  session_ref: string;
  time_window: {
    started_at: string;
    completed_at: string;
  };
  token_delta: TokenUsageTotals;
  source_path: string;
  source_hash: string;
  usage_ref: string;
  billing_boundary:
    | 'refs_only_absolute_cumulative_total_latest'
    | 'refs_only_codex_session_last_token_usage_sum';
  ignored_usage_fields: string[];
};

const ACCOUNTING_SEMANTICS = {
  input_tokens_include_cached_input_tokens: true,
  output_tokens_include_reasoning_output_tokens: true,
  cached_and_reasoning_tokens_are_diagnostic_subsets: true,
} as const;

function nonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function partialTokenUsage(value: unknown): PartialTokenUsage | null {
  if (!isRecord(value)) return null;
  return {
    input_tokens: nonNegativeNumber(value.input_tokens),
    cached_input_tokens: nonNegativeNumber(value.cached_input_tokens),
    output_tokens: nonNegativeNumber(value.output_tokens),
    reasoning_output_tokens: nonNegativeNumber(value.reasoning_output_tokens),
    total_tokens: nonNegativeNumber(value.total_tokens),
  };
}

function tokenUsageTotals(value: unknown) {
  const partial = partialTokenUsage(value);
  if (!partial || partial.input_tokens === null || partial.output_tokens === null) return null;
  const totalTokens = partial.total_tokens ?? partial.input_tokens + partial.output_tokens;
  if (
    (partial.cached_input_tokens !== null && partial.cached_input_tokens > partial.input_tokens)
    || (partial.reasoning_output_tokens !== null && partial.reasoning_output_tokens > partial.output_tokens)
    || totalTokens < partial.input_tokens + partial.output_tokens
  ) return null;
  return {
    input_tokens: partial.input_tokens,
    cached_input_tokens: partial.cached_input_tokens,
    output_tokens: partial.output_tokens,
    reasoning_output_tokens: partial.reasoning_output_tokens,
    total_tokens: totalTokens,
  };
}

function hasCompleteTokenUsageShape(value: unknown) {
  return isRecord(value)
    && [
      'input_tokens',
      'cached_input_tokens',
      'output_tokens',
      'reasoning_output_tokens',
      'total_tokens',
    ].every((key) => Object.hasOwn(value, key));
}

function tokenUsageMissingReason(value: unknown) {
  const partial = partialTokenUsage(value);
  if (!partial) return 'token_usage_payload_missing';
  if (partial.input_tokens === null) return 'input_tokens_missing_or_invalid';
  if (partial.output_tokens === null) return 'output_tokens_missing_or_invalid';
  const totalTokens = partial.total_tokens ?? partial.input_tokens + partial.output_tokens;
  if (partial.cached_input_tokens !== null && partial.cached_input_tokens > partial.input_tokens) {
    return 'cached_input_tokens_exceed_input_tokens';
  }
  if (partial.reasoning_output_tokens !== null && partial.reasoning_output_tokens > partial.output_tokens) {
    return 'reasoning_output_tokens_exceed_output_tokens';
  }
  if (totalTokens < partial.input_tokens + partial.output_tokens) return 'total_tokens_below_input_plus_output';
  return 'token_usage_incomplete';
}

function parseJsonLineRecord(line: string) {
  try {
    const parsed = parseJsonText(line);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function sha256Text(value: string) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function observationId(sourceRef: string | null, sourceHash: string | null, status: string) {
  const hash = sha256Text(JSON.stringify([sourceRef, sourceHash, status])).slice('sha256:'.length);
  return `usage_observation:${hash}`;
}

function observationBase(input: {
  sourceKind: UsageObservationBase['source_kind'];
  sourceRef: string | null;
  sourceHash: string | null;
  observedAt: string;
  executionSessionRef: string | null;
  status: ExecutorUsageObservation['telemetry_status'];
}): UsageObservationBase {
  const id = observationId(input.sourceRef, input.sourceHash, input.status);
  return {
    surface_kind: 'opl_executor_usage_observation',
    version: 'executor-usage-observation.v1',
    observation_id: id,
    idempotency_key: id,
    source_kind: input.sourceKind,
    source_ref: input.sourceRef,
    source_hash: input.sourceHash,
    observed_at: input.observedAt,
    execution_session_ref: input.executionSessionRef,
    accounting_semantics: ACCOUNTING_SEMANTICS,
  };
}

export function observedExecutorUsageObservation(input: {
  sourceKind: Exclude<UsageObservationBase['source_kind'], null>;
  sourceRef: string;
  sourceHash: string;
  observedAt: string;
  executionSessionRef: string | null;
  tokenUsage: TokenUsageTotals;
}): ExecutorUsageObservation {
  return {
    ...observationBase({ ...input, status: 'observed' }),
    telemetry_status: 'observed',
    token_usage: input.tokenUsage,
    partial_token_usage: null,
    missing_reason: null,
  };
}

export function partialExecutorUsageObservation(input: {
  sourceKind: Exclude<UsageObservationBase['source_kind'], null>;
  sourceRef: string;
  sourceHash: string;
  observedAt: string;
  executionSessionRef: string | null;
  partialUsage: PartialTokenUsage;
  missingReason: string;
}): ExecutorUsageObservation {
  return {
    ...observationBase({ ...input, status: 'partial' }),
    telemetry_status: 'partial',
    token_usage: null,
    partial_token_usage: input.partialUsage,
    missing_reason: input.missingReason,
  };
}

export function missingExecutorUsageObservation(input: {
  sourceKind?: UsageObservationBase['source_kind'];
  sourceRef?: string | null;
  sourceHash?: string | null;
  observedAt: string;
  executionSessionRef?: string | null;
  status?: 'missing' | 'stale';
  missingReason: string;
}): ExecutorUsageObservation {
  const status = input.status ?? 'missing';
  return {
    ...observationBase({
      sourceKind: input.sourceKind ?? null,
      sourceRef: input.sourceRef ?? null,
      sourceHash: input.sourceHash ?? null,
      observedAt: input.observedAt,
      executionSessionRef: input.executionSessionRef ?? null,
      status,
    }),
    telemetry_status: status,
    token_usage: null,
    partial_token_usage: null,
    missing_reason: input.missingReason,
  };
}

function addTokenUsageTotals(left: TokenUsageTotals, right: TokenUsageTotals): TokenUsageTotals {
  return {
    input_tokens: left.input_tokens + right.input_tokens,
    cached_input_tokens: left.cached_input_tokens === null || right.cached_input_tokens === null
      ? null
      : left.cached_input_tokens + right.cached_input_tokens,
    output_tokens: left.output_tokens + right.output_tokens,
    reasoning_output_tokens: left.reasoning_output_tokens === null || right.reasoning_output_tokens === null
      ? null
      : left.reasoning_output_tokens + right.reasoning_output_tokens,
    total_tokens: left.total_tokens + right.total_tokens,
  };
}

function sumTokenUsageTotals(values: TokenUsageTotals[]): TokenUsageTotals {
  return values.slice(1).reduce(addTokenUsageTotals, values[0]!);
}

function tokenCountInfoFromPayload(payload: JsonRecord) {
  return payload.type === 'token_count' && isRecord(payload.info) ? payload.info : null;
}

export function extractCodexSessionUsageRef(recovered: CodexSessionRecoveryResult | null): CodexSessionUsageRef | null {
  if (!recovered || !path.isAbsolute(recovered.sessionPath)) return null;
  const observations: Array<{ timestamp: string; totals: TokenUsageTotals }> = [];
  const turnUsageObservations: Array<{ timestamp: string; totals: TokenUsageTotals }> = [];
  const ignoredUsageFields = new Set<string>();
  for (const line of recovered.output.split(/\r?\n/)) {
    const record = parseJsonLineRecord(line);
    if (!record) continue;
    const payload = isRecord(record.payload) ? record.payload : record;
    if ('last_token_usage' in payload) ignoredUsageFields.add('last_token_usage');
    if ('usage' in payload) ignoredUsageFields.add('usage');
    const timestamp = optionalString(record.timestamp) ?? optionalString(payload.timestamp);
    const tokenCountInfo = tokenCountInfoFromPayload(payload);
    const turnTotals = tokenUsageTotals(tokenCountInfo?.last_token_usage);
    if (turnTotals && timestamp) turnUsageObservations.push({ timestamp, totals: turnTotals });
    const totals = tokenUsageTotals(tokenCountInfo?.total_token_usage)
      ?? tokenUsageTotals(payload.absolute_cumulative_token_usage);
    if (totals && timestamp) observations.push({ timestamp, totals });
  }
  const sourceHash = sha256Text(recovered.output);
  if (observations.length > 0) {
    const first = observations[0]!;
    const last = observations.at(-1)!;
    return {
      session_ref: `codex_session:${recovered.threadId}`,
      time_window: { started_at: first.timestamp, completed_at: last.timestamp },
      token_delta: last.totals,
      source_path: recovered.sessionPath,
      source_hash: sourceHash,
      usage_ref: `codex_session_usage:${recovered.threadId}#${sourceHash}`,
      billing_boundary: 'refs_only_absolute_cumulative_total_latest',
      ignored_usage_fields: [...ignoredUsageFields].sort(),
    };
  }
  if (turnUsageObservations.length > 0) {
    const first = turnUsageObservations[0]!;
    const last = turnUsageObservations.at(-1)!;
    return {
      session_ref: `codex_session:${recovered.threadId}`,
      time_window: { started_at: first.timestamp, completed_at: last.timestamp },
      token_delta: sumTokenUsageTotals(turnUsageObservations.map((entry) => entry.totals)),
      source_path: recovered.sessionPath,
      source_hash: sourceHash,
      usage_ref: `codex_session_usage:${recovered.threadId}#${sourceHash}`,
      billing_boundary: 'refs_only_codex_session_last_token_usage_sum',
      ignored_usage_fields: [...ignoredUsageFields].sort(),
    };
  }
  return null;
}

function turnCompletedObservation(output: string, observedAt: string) {
  const lines = output.split(/\r?\n/);
  let threadId: string | null = null;
  let latest: { record: JsonRecord; line: string; index: number } | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const record = parseJsonLineRecord(line);
    if (!record) continue;
    if (record.type === 'thread.started') threadId = optionalString(record.thread_id);
    if (record.type === 'turn.completed') latest = { record, line, index };
  }
  if (!latest) return null;
  const sourceHash = sha256Text(latest.line);
  const executionSessionRef = threadId ? `codex://threads/${threadId}` : null;
  const sourceRef = threadId
    ? `codex://threads/${threadId}/events/turn.completed/${latest.index}#${sourceHash}`
    : `codex_exec_stdout:turn.completed/${latest.index}#${sourceHash}`;
  const eventObservedAt = optionalString(latest.record.timestamp) ?? observedAt;
  const usage = latest.record.usage;
  const totals = tokenUsageTotals(usage);
  if (totals) {
    return observedExecutorUsageObservation({
      sourceKind: 'codex_exec_turn_completed',
      sourceRef,
      sourceHash,
      observedAt: eventObservedAt,
      executionSessionRef,
      tokenUsage: totals,
    });
  }
  const partial = partialTokenUsage(usage);
  if (partial && Object.values(partial).some((value) => value !== null)) {
    return partialExecutorUsageObservation({
      sourceKind: 'codex_exec_turn_completed',
      sourceRef,
      sourceHash,
      observedAt: eventObservedAt,
      executionSessionRef,
      partialUsage: partial,
      missingReason: tokenUsageMissingReason(usage),
    });
  }
  return missingExecutorUsageObservation({
    sourceKind: 'codex_exec_turn_completed',
    sourceRef,
    sourceHash,
    observedAt: eventObservedAt,
    executionSessionRef,
    missingReason: 'turn_completed_usage_missing',
  });
}

function sessionUsageObservation(session: CodexSessionUsageRef): ExecutorUsageObservation {
  return observedExecutorUsageObservation({
    sourceKind: 'codex_session_token_count',
    sourceRef: session.usage_ref,
    sourceHash: session.source_hash,
    observedAt: session.time_window.completed_at,
    executionSessionRef: session.session_ref.replace(/^codex_session:/, 'codex://threads/'),
    tokenUsage: session.token_delta,
  });
}

export function codexStageRunnerCostSummaryFrom(
  output: string,
  runnerMode: string,
  sessionUsageRef: CodexSessionUsageRef | null = null,
  observedAt = new Date().toISOString(),
) {
  const turnObservation = turnCompletedObservation(output, observedAt);
  const usageObservation = turnObservation?.telemetry_status === 'observed'
    || turnObservation?.telemetry_status === 'partial'
    ? turnObservation
    : sessionUsageRef
      ? sessionUsageObservation(sessionUsageRef)
      : turnObservation ?? missingExecutorUsageObservation({
          observedAt,
          missingReason: runnerMode === 'codex_cli'
            ? 'codex_exec_turn_completed_not_observed'
            : 'runner_mode_did_not_execute_codex_cli',
        });
  const usageRecord = output
    .split(/\r?\n/)
    .map(parseJsonLineRecord)
    .filter((entry): entry is JsonRecord => Boolean(entry))
    .filter((entry) => entry.type === 'turn.completed' && isRecord(entry.usage))
    .map((entry) => entry.usage as JsonRecord)
    .at(-1);
  const estimatedCostUsd = nonNegativeNumber(usageRecord?.estimated_cost_usd);
  return {
    cost_status: usageObservation.telemetry_status,
    usage_status: usageObservation.telemetry_status,
    telemetry_status: usageObservation.telemetry_status,
    estimated_cost_usd: estimatedCostUsd,
    token_usage: usageObservation.telemetry_status === 'observed' ? usageObservation.token_usage : null,
    partial_token_usage: usageObservation.telemetry_status === 'partial'
      ? usageObservation.partial_token_usage
      : null,
    telemetry_source: usageObservation.source_kind,
    source_ref: usageObservation.source_ref,
    observed_at: usageObservation.observed_at,
    missing_reason: usageObservation.missing_reason,
    usage_observation: usageObservation,
    ...(sessionUsageRef ? { session_usage_refs: sessionUsageRef } : {}),
    billing_boundary: 'codex_cli_activity_runner_reports_one_authoritative_usage_source',
  };
}

export function isExecutorUsageObservation(value: unknown): value is ExecutorUsageObservation {
  if (!isRecord(value)) return false;
  const status = optionalString(value.telemetry_status);
  const sourceKind = value.source_kind;
  const sourceRef = value.source_ref;
  const sourceHash = value.source_hash;
  const accounting = isRecord(value.accounting_semantics) ? value.accounting_semantics : null;
  if (
    value.surface_kind !== 'opl_executor_usage_observation'
    || value.version !== 'executor-usage-observation.v1'
    || typeof value.observation_id !== 'string'
    || value.idempotency_key !== value.observation_id
    || !status
    || !['observed', 'partial', 'missing', 'stale'].includes(status)
    || (sourceKind !== null
      && sourceKind !== 'codex_exec_turn_completed'
      && sourceKind !== 'codex_session_token_count')
    || (sourceRef !== null && typeof sourceRef !== 'string')
    || (sourceHash !== null && typeof sourceHash !== 'string')
    || typeof value.observed_at !== 'string'
    || !value.observed_at.trim()
    || (value.execution_session_ref !== null && typeof value.execution_session_ref !== 'string')
    || accounting?.input_tokens_include_cached_input_tokens !== true
    || accounting.output_tokens_include_reasoning_output_tokens !== true
    || accounting.cached_and_reasoning_tokens_are_diagnostic_subsets !== true
    || value.observation_id !== observationId(
      typeof sourceRef === 'string' ? sourceRef : null,
      typeof sourceHash === 'string' ? sourceHash : null,
      status,
    )
  ) return false;
  if (status === 'observed') {
    return sourceKind !== null
      && typeof sourceRef === 'string'
      && Boolean(sourceRef)
      && typeof sourceHash === 'string'
      && Boolean(sourceHash)
      && hasCompleteTokenUsageShape(value.token_usage)
      && tokenUsageTotals(value.token_usage) !== null
      && value.partial_token_usage === null
      && value.missing_reason === null;
  }
  if (status === 'partial') {
    return sourceKind !== null
      && typeof sourceRef === 'string'
      && Boolean(sourceRef)
      && typeof sourceHash === 'string'
      && Boolean(sourceHash)
      && hasCompleteTokenUsageShape(value.partial_token_usage)
      && value.token_usage === null
      && partialTokenUsage(value.partial_token_usage) !== null
      && typeof value.missing_reason === 'string';
  }
  return value.token_usage === null
    && value.partial_token_usage === null
    && typeof value.missing_reason === 'string';
}
