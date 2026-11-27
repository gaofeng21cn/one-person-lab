import { isRecord } from '@opl/core';
import type { CodexTokenUsage } from './events.ts';

const fields = ['inputTokens', 'outputTokens', 'cachedInputTokens', 'reasoningOutputTokens', 'totalTokens'] as const;
type Breakdown = Record<typeof fields[number], number>;

function isBreakdown(value: unknown): value is Breakdown {
  return isRecord(value) && fields.every(key =>
    typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && value[key] >= 0);
}

export function createAppServerTurnUsage(): (tokenUsage: unknown) => CodexTokenUsage | null {
  let previous: Breakdown | undefined;
  const turn: Breakdown = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 };

  return tokenUsage => {
    if (!isRecord(tokenUsage)) return null;
    const { total, last } = tokenUsage;
    if (!isBreakdown(total) || !isBreakdown(last)) return null;
    const before = previous;
    if (before && fields.every(key => total[key] === before[key])) return null;

    // The first notification can include usage from turns before resume. Codex
    // also resets its breakdown when it fills the context window.
    const reset = before && fields.some(key => total[key] < before[key]);
    for (const key of fields) {
      turn[key] += before && !reset ? total[key] - before[key] : last[key];
    }
    previous = total;
    return {
      input_tokens: turn.inputTokens,
      output_tokens: turn.outputTokens,
      cached_input_tokens: turn.cachedInputTokens,
      reasoning_output_tokens: turn.reasoningOutputTokens,
      total_tokens: turn.totalTokens,
    };
  };
}
