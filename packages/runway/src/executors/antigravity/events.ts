import { isRecord } from '@opl/core';
import type { ExecutorEvent } from '../spi.ts';

export interface AgyUsageTotals {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
  readonly cached_tokens?: number;
}

export interface ParsedAgyStreamLine {
  readonly sessionRef?: string;
  readonly events: readonly ExecutorEvent[];
  readonly finalText?: string;
  readonly isResult?: boolean;
  readonly isError?: boolean;
  readonly errorMessage?: string;
  readonly usage?: AgyUsageTotals;
}

function nonNegativeNum(val: unknown): number | undefined {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? val : undefined;
}

function extractUsage(raw: unknown): AgyUsageTotals | undefined {
  if (!isRecord(raw)) return undefined;
  const input = nonNegativeNum(raw.input_tokens ?? raw.prompt_tokens);
  const output = nonNegativeNum(raw.output_tokens ?? raw.completion_tokens);
  const cached = nonNegativeNum(raw.cached_tokens ?? raw.cache_read_input_tokens ?? raw.cached_input_tokens);
  if (input === undefined && output === undefined && cached === undefined) {
    return undefined;
  }
  return {
    ...(input !== undefined ? { input_tokens: input } : {}),
    ...(output !== undefined ? { output_tokens: output } : {}),
    ...(cached !== undefined ? { cached_tokens: cached } : {}),
  };
}

function extractTextFromMessageContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const item of content) {
    if (typeof item === 'string') {
      parts.push(item);
    } else if (isRecord(item)) {
      if (typeof item.text === 'string') parts.push(item.text);
      else if (typeof item.value === 'string') parts.push(item.value);
    }
  }
  return parts.join('');
}

export function parseAgyStreamJsonLine(line: string): ParsedAgyStreamLine | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const events: ExecutorEvent[] = [];
  const sessionRef =
    typeof parsed.conversation_id === 'string' && parsed.conversation_id.trim()
      ? parsed.conversation_id.trim()
      : typeof parsed.session_id === 'string' && parsed.session_id.trim()
        ? parsed.session_id.trim()
        : undefined;

  const type = typeof parsed.type === 'string' ? parsed.type : '';
  const usage = extractUsage(parsed.usage);

  if (type === 'system' || type === 'init') {
    if (sessionRef) {
      events.push({ kind: 'session_bound', session_ref: sessionRef });
    }
    events.push({ kind: 'progress', message: 'Antigravity session initialized', phase: 'init' });
    return { sessionRef, events, usage };
  }

  if (type === 'assistant' || type === 'message' || type === 'text_delta') {
    let delta = '';
    if (typeof parsed.delta === 'string') delta = parsed.delta;
    else if (typeof parsed.text === 'string') delta = parsed.text;
    else if (isRecord(parsed.message)) {
      delta = extractTextFromMessageContent(parsed.message.content);
    } else if (parsed.content !== undefined) {
      delta = extractTextFromMessageContent(parsed.content);
    }
    if (delta) {
      events.push({ kind: 'text_delta', delta });
    }
    if (usage) {
      events.push({ kind: 'usage', ...usage });
    }
    return { sessionRef, events, usage };
  }

  if (type === 'tool_use' || type === 'tool_call') {
    const toolName =
      typeof parsed.name === 'string'
        ? parsed.name
        : typeof parsed.tool_name === 'string'
          ? parsed.tool_name
          : 'tool';
    const status = parsed.status === 'finished' || parsed.status === 'completed' ? 'finished' : 'started';
    events.push({
      kind: 'tool_call',
      tool_name: toolName,
      status,
      ...(typeof parsed.summary === 'string' ? { summary: parsed.summary } : {}),
    });
    return { sessionRef, events };
  }

  if (type === 'tool_result') {
    const toolName =
      typeof parsed.name === 'string'
        ? parsed.name
        : typeof parsed.tool_name === 'string'
          ? parsed.tool_name
          : 'tool';
    events.push({
      kind: 'tool_call',
      tool_name: toolName,
      status: 'finished',
    });
    return { sessionRef, events };
  }

  if (type === 'human_gate_requested') {
    const question =
      typeof parsed.question === 'string' && parsed.question.trim()
        ? parsed.question.trim()
        : 'Human decision required.';
    const options = Array.isArray(parsed.options)
      ? parsed.options.filter((o): o is string => typeof o === 'string')
      : undefined;
    events.push({
      kind: 'human_gate_requested',
      question,
      ...(options ? { options } : {}),
    });
    return { sessionRef, events };
  }

  if (type === 'artifact_observed' && typeof parsed.path === 'string') {
    events.push({
      kind: 'artifact_observed',
      path: parsed.path,
      ...(typeof parsed.sha256 === 'string' ? { sha256: parsed.sha256 } : {}),
    });
    return { sessionRef, events };
  }

  if (type === 'result') {
    const isErr = parsed.is_error === true || parsed.status === 'error' || parsed.status === 'failed';
    const finalText =
      typeof parsed.result === 'string'
        ? parsed.result
        : typeof parsed.text === 'string'
          ? parsed.text
          : undefined;
    const errorMessage =
      typeof parsed.error === 'string'
        ? parsed.error
        : isErr
          ? finalText || 'Antigravity execution failed'
          : undefined;
    if (usage) {
      events.push({ kind: 'usage', ...usage });
    }
    return {
      sessionRef,
      events,
      finalText,
      isResult: true,
      isError: isErr,
      errorMessage,
      usage,
    };
  }

  if (type === 'error') {
    const msg =
      typeof parsed.message === 'string'
        ? parsed.message
        : isRecord(parsed.error) && typeof parsed.error.message === 'string'
          ? parsed.error.message
          : 'Antigravity stream error';
    return {
      sessionRef,
      events,
      isError: true,
      errorMessage: msg,
    };
  }

  return { sessionRef, events, usage };
}
