import crypto from 'node:crypto';
import path from 'node:path';

import { isRecord } from '../../kernel/contract-validation.ts';
import { parseJsonText } from '../../kernel/json-file.ts';
import { stringValue as optionalString, type JsonRecord } from '../../kernel/json-record.ts';
import type { CodexSessionRecoveryResult } from './codex.ts';

export type CodexSessionUsageRef = {
  session_ref: string;
  time_window: {
    started_at: string;
    completed_at: string;
  };
  token_delta: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  source_path: string;
  source_hash: string;
  usage_ref: string;
  billing_boundary: 'refs_only_absolute_cumulative_total_delta';
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
  const totalTokens = typeof value.total_tokens === 'number' && Number.isFinite(value.total_tokens)
    ? value.total_tokens
    : null;
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

export function extractCodexSessionUsageRef(recovered: CodexSessionRecoveryResult | null): CodexSessionUsageRef | null {
  if (!recovered || !path.isAbsolute(recovered.sessionPath)) {
    return null;
  }
  const observations: Array<{
    timestamp: string;
    totals: { input_tokens: number; output_tokens: number; total_tokens: number };
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
    const totals = tokenUsageTotals(payload.absolute_cumulative_token_usage);
    const timestamp = optionalString(record.timestamp) ?? optionalString(payload.timestamp);
    if (totals && timestamp) {
      observations.push({ timestamp, totals });
    }
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
  const sourceHash = sha256Text(recovered.output);
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
  const tokenUsage = usageLines
    .map((entry) => (isRecord(entry.token_usage) ? entry.token_usage : null))
    .find((entry): entry is JsonRecord => Boolean(entry));
  const sessionTokenDelta = sessionUsageRef?.token_delta;
  return {
    cost_status: runnerMode === 'codex_cli' ? 'observed_or_unreported' : 'not_measured_dry_run',
    estimated_cost_usd: typeof tokenUsage?.estimated_cost_usd === 'number' ? tokenUsage.estimated_cost_usd : 0,
    token_usage: {
      input_tokens: sessionTokenDelta?.input_tokens
        ?? (typeof tokenUsage?.input_tokens === 'number' ? tokenUsage.input_tokens : 0),
      output_tokens: sessionTokenDelta?.output_tokens
        ?? (typeof tokenUsage?.output_tokens === 'number' ? tokenUsage.output_tokens : 0),
      total_tokens: sessionTokenDelta?.total_tokens
        ?? (typeof tokenUsage?.total_tokens === 'number' ? tokenUsage.total_tokens : 0),
    },
    ...(sessionUsageRef
      ? {
          usage_ref: sessionUsageRef.usage_ref,
          session_usage_refs: sessionUsageRef,
        }
      : {}),
    billing_boundary: 'codex_cli_activity_runner_reports_only_observed_or_declared_usage',
  };
}
