import crypto from 'node:crypto';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';
import type { CodexSessionRecoveryResult } from './codex.ts';

type TokenUsageTotals = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

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
    | 'refs_only_absolute_cumulative_total_delta'
    | 'refs_only_codex_session_last_token_usage_sum';
  ignored_usage_fields: string[];
};

function tokenUsageTotals(value: unknown) {
  if (!isRecord(value)) {
    return null;
  }
  const inputTokens = typeof value.input_tokens === 'number' && Number.isFinite(value.input_tokens)
    ? value.input_tokens
    : null;
  const outputTokens = typeof value.output_tokens === 'number' && Number.isFinite(value.output_tokens)
    ? value.output_tokens
    : null;
  const explicitTotalTokens = typeof value.total_tokens === 'number' && Number.isFinite(value.total_tokens)
    ? value.total_tokens
    : null;
  const totalTokens = explicitTotalTokens ?? (
    inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null
  );
  return inputTokens !== null && outputTokens !== null && totalTokens !== null
    ? { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens }
    : null;
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

function addTokenUsageTotals(left: TokenUsageTotals, right: TokenUsageTotals): TokenUsageTotals {
  return {
    input_tokens: left.input_tokens + right.input_tokens,
    output_tokens: left.output_tokens + right.output_tokens,
    total_tokens: left.total_tokens + right.total_tokens,
  };
}

function sumTokenUsageTotals(values: TokenUsageTotals[]): TokenUsageTotals {
  return values.reduce(
    addTokenUsageTotals,
    { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  );
}

function tokenCountInfoFromPayload(payload: JsonRecord) {
  return payload.type === 'token_count' && isRecord(payload.info) ? payload.info : null;
}

export function extractCodexSessionUsageRef(recovered: CodexSessionRecoveryResult | null): CodexSessionUsageRef | null {
  if (!recovered || !path.isAbsolute(recovered.sessionPath)) {
    return null;
  }
  const observations: Array<{
    timestamp: string;
    totals: TokenUsageTotals;
  }> = [];
  const turnUsageObservations: Array<{
    timestamp: string;
    totals: TokenUsageTotals;
  }> = [];
  const ignoredUsageFields = new Set<string>();
  for (const line of recovered.output.split(/\r?\n/)) {
    const record = parseJsonLineRecord(line);
    if (!record) {
      continue;
    }
    const payload = isRecord(record.payload) ? record.payload : record;
    if ('last_token_usage' in payload) {
      ignoredUsageFields.add('last_token_usage');
    }
    if ('usage' in payload) {
      ignoredUsageFields.add('usage');
    }
    const timestamp = optionalString(record.timestamp) ?? optionalString(payload.timestamp);
    const tokenCountInfo = tokenCountInfoFromPayload(payload);
    const turnTotals = tokenUsageTotals(tokenCountInfo?.last_token_usage);
    if (turnTotals && timestamp) {
      turnUsageObservations.push({ timestamp, totals: turnTotals });
    }
    const totals = tokenUsageTotals(tokenCountInfo?.total_token_usage)
      ?? tokenUsageTotals(payload.absolute_cumulative_token_usage);
    if (totals && timestamp) {
      observations.push({ timestamp, totals });
    }
  }
  const sourceHash = sha256Text(recovered.output);
  if (turnUsageObservations.length > 0) {
    const first = turnUsageObservations[0]!;
    const last = turnUsageObservations.at(-1)!;
    return {
      session_ref: `codex_session:${recovered.threadId}`,
      time_window: {
        started_at: first.timestamp,
        completed_at: last.timestamp,
      },
      token_delta: sumTokenUsageTotals(turnUsageObservations.map((entry) => entry.totals)),
      source_path: recovered.sessionPath,
      source_hash: sourceHash,
      usage_ref: `codex_session_usage:${recovered.threadId}#${sourceHash}`,
      billing_boundary: 'refs_only_codex_session_last_token_usage_sum',
      ignored_usage_fields: [...ignoredUsageFields].sort(),
    };
  }
  if (observations.length < 2) {
    return null;
  }
  const first = observations[0]!;
  const last = observations.at(-1)!;
  const tokenDelta = {
    input_tokens: last.totals.input_tokens - first.totals.input_tokens,
    output_tokens: last.totals.output_tokens - first.totals.output_tokens,
    total_tokens: last.totals.total_tokens - first.totals.total_tokens,
  };
  if (
    tokenDelta.input_tokens < 0
    || tokenDelta.output_tokens < 0
    || tokenDelta.total_tokens < 0
  ) {
    return null;
  }
  return {
    session_ref: `codex_session:${recovered.threadId}`,
    time_window: {
      started_at: first.timestamp,
      completed_at: last.timestamp,
    },
    token_delta: tokenDelta,
    source_path: recovered.sessionPath,
    source_hash: sourceHash,
    usage_ref: `codex_session_usage:${recovered.threadId}#${sourceHash}`,
    billing_boundary: 'refs_only_absolute_cumulative_total_delta',
    ignored_usage_fields: [...ignoredUsageFields].sort(),
  };
}

export function codexStageRunnerCostSummaryFrom(
  output: string,
  runnerMode: string,
  sessionUsageRef: CodexSessionUsageRef | null = null,
) {
  const usageLines = output
    .split(/\r?\n/)
    .map(parseJsonLineRecord)
    .filter((entry): entry is JsonRecord => Boolean(entry));
  const declaredTokenUsage = usageLines
    .map((entry) => {
      if (isRecord(entry.token_usage)) {
        return entry.token_usage;
      }
      if (isRecord(entry.usage)) {
        return entry.usage;
      }
      return null;
    })
    .map(tokenUsageTotals)
    .find((entry): entry is TokenUsageTotals => Boolean(entry)) ?? null;
  const sessionTokenDelta = sessionUsageRef?.token_delta;
  const observedTokenUsage = sessionTokenDelta ?? declaredTokenUsage;
  const usageObserved = observedTokenUsage !== null;
  const estimatedCostUsd = usageLines
    .map((entry) => isRecord(entry.usage) ? entry.usage : isRecord(entry.token_usage) ? entry.token_usage : null)
    .map((entry) => entry?.estimated_cost_usd)
    .find((value): value is number => typeof value === 'number' && Number.isFinite(value)) ?? null;
  const liveRunner = runnerMode === 'codex_cli';
  return {
    cost_status: usageObserved ? 'observed' : liveRunner ? 'missing' : 'not_measured_dry_run',
    usage_status: usageObserved ? 'observed' : liveRunner ? 'missing' : 'not_measured',
    estimated_cost_usd: estimatedCostUsd,
    token_usage: observedTokenUsage,
    telemetry_source: sessionTokenDelta
      ? 'codex_session_token_count'
      : declaredTokenUsage
        ? 'codex_exec_turn_completed'
        : null,
    missing_reason: usageObserved
      ? null
      : liveRunner
        ? 'codex_cli_token_usage_not_observed'
        : 'runner_mode_did_not_execute_codex_cli',
    ...(sessionUsageRef
      ? {
          usage_ref: sessionUsageRef.usage_ref,
          session_usage_refs: sessionUsageRef,
        }
      : {}),
    billing_boundary: 'codex_cli_activity_runner_reports_only_observed_or_declared_usage',
  };
}
