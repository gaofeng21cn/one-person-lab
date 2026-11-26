import { isRecord } from '@opl/core';

export interface CodexTokenUsage {
  readonly input_tokens: number;
  readonly cached_input_tokens: number | null;
  readonly output_tokens: number;
  readonly reasoning_output_tokens: number | null;
  readonly total_tokens: number;
}

export type CodexExecEvent =
  | {
      readonly type: 'thread.started';
      readonly threadId: string | null;
    }
  | {
      readonly type: 'turn.started';
    }
  | {
      readonly type: 'turn.completed';
      readonly usage: CodexTokenUsage | null;
    }
  | {
      readonly type: 'agent_message';
      readonly messageId: string;
      readonly text: string;
    }
  | {
      readonly type: 'command_execution';
      readonly toolCallId: string;
      readonly title: string;
      readonly status: 'pending' | 'in_progress' | 'completed' | 'failed';
      readonly output: string | null;
    }
  | {
      readonly type: 'unsupported_function_call';
      readonly callId: string | null;
      readonly name: string;
      readonly arguments: string | null;
    }
  | {
      readonly type: 'provider_error';
      readonly message: string;
      readonly statusCode: number | null;
    }
  | {
      readonly type: 'token_count';
      readonly usage: CodexTokenUsage | null;
      readonly isCumulative: boolean;
    };

export interface CodexExecEventParserState {
  turnIndex: number;
  commandCounter: number;
  activeCommandIds: Map<string, string>;
}

export function createCodexExecEventParserState(): CodexExecEventParserState {
  return {
    turnIndex: 0,
    commandCounter: 0,
    activeCommandIds: new Map(),
  };
}

function normalizeInlineText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeChunkText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function nonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseCodexTokenUsage(raw: unknown): CodexTokenUsage | null {
  if (!isRecord(raw)) return null;
  const inputTokens = nonNegativeNumber(raw.input_tokens);
  const outputTokens = nonNegativeNumber(raw.output_tokens);
  if (inputTokens === null || outputTokens === null) return null;
  const cached = nonNegativeNumber(raw.cached_input_tokens ?? raw.cached_tokens);
  const reasoning = nonNegativeNumber(raw.reasoning_output_tokens);
  const total = nonNegativeNumber(raw.total_tokens) ?? inputTokens + outputTokens;
  return {
    input_tokens: inputTokens,
    cached_input_tokens: cached,
    output_tokens: outputTokens,
    reasoning_output_tokens: reasoning,
    total_tokens: total,
  };
}

export function parseCodexJsonLine(line: string): Record<string, unknown> | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function providerStatusCodeFromMessage(message: string): number | null {
  const match = /\bstatus\s+([1-5][0-9][0-9])\b/i.exec(message);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function resolveFallbackToolCallId(
  state: CodexExecEventParserState,
  command: string | null,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
): string {
  if (!command) {
    state.commandCounter += 1;
    return `codex-turn-${Math.max(state.turnIndex, 1)}-command-${state.commandCounter}`;
  }

  const existing = state.activeCommandIds.get(command);
  if (existing) {
    if (status === 'completed' || status === 'failed') {
      state.activeCommandIds.delete(command);
    }
    return existing;
  }

  state.commandCounter += 1;
  const toolCallId = `codex-turn-${Math.max(state.turnIndex, 1)}-command-${state.commandCounter}`;
  if (status === 'pending' || status === 'in_progress') {
    state.activeCommandIds.set(command, toolCallId);
  }
  return toolCallId;
}

function extractAgentMessageText(itemRecord: Record<string, unknown>): string | null {
  const directText = normalizeChunkText(itemRecord.text);
  if (directText) return directText;

  const content = itemRecord.content;
  if (!Array.isArray(content)) return null;

  const parts = content
    .map((entry) => {
      if (typeof entry === 'string') return normalizeChunkText(entry);
      if (!isRecord(entry)) return null;
      return normalizeChunkText(entry.text) ?? normalizeChunkText(entry.value);
    })
    .filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join('\n') : null;
}

function parseCodexExecEventFromEventMessage(
  event: Record<string, unknown>,
  state: CodexExecEventParserState,
): CodexExecEvent | null {
  const payload = isRecord(event.payload) ? event.payload : null;
  if (!payload) return null;

  const payloadType = normalizeInlineText(payload.type);
  if (payloadType === 'agent_message') {
    const text = normalizeChunkText(payload.message);
    if (!text) return null;
    return {
      type: 'agent_message',
      messageId:
        normalizeInlineText(payload.id)
        ?? normalizeInlineText(event.timestamp)
        ?? `codex-turn-${Math.max(state.turnIndex, 1)}-assistant`,
      text,
    };
  }

  if (payloadType === 'task_complete') {
    const text = normalizeChunkText(payload.last_agent_message);
    if (!text) {
      return { type: 'turn.completed', usage: null };
    }
    return {
      type: 'agent_message',
      messageId:
        normalizeInlineText(payload.turn_id)
        ?? normalizeInlineText(event.timestamp)
        ?? `codex-turn-${Math.max(state.turnIndex, 1)}-assistant`,
      text,
    };
  }

  if (payloadType === 'turn_started') {
    state.turnIndex += 1;
    state.activeCommandIds.clear();
    return { type: 'turn.started' };
  }

  if (payloadType === 'turn_completed') {
    state.activeCommandIds.clear();
    return { type: 'turn.completed', usage: parseCodexTokenUsage(payload.usage) };
  }

  if (payloadType === 'token_count') {
    const info = isRecord(payload.info) ? payload.info : null;
    const cumulative = parseCodexTokenUsage(info?.total_token_usage ?? payload.absolute_cumulative_token_usage);
    if (cumulative) {
      return { type: 'token_count', usage: cumulative, isCumulative: true };
    }
    const last = parseCodexTokenUsage(info?.last_token_usage);
    if (last) {
      return { type: 'token_count', usage: last, isCumulative: false };
    }
  }

  return null;
}

function parseCodexExecEventFromResponseItem(
  event: Record<string, unknown>,
  state: CodexExecEventParserState,
): CodexExecEvent | null {
  const payload = isRecord(event.payload) ? event.payload : null;
  if (!payload) return null;

  const payloadType = normalizeInlineText(payload.type);
  if (payloadType === 'function_call') {
    return {
      type: 'unsupported_function_call',
      callId: normalizeInlineText(payload.call_id) ?? normalizeInlineText(payload.id),
      name: normalizeInlineText(payload.name) ?? 'function_call',
      arguments: normalizeInlineText(payload.arguments),
    };
  }

  if (payloadType !== 'message' || normalizeInlineText(payload.role) !== 'assistant') {
    return null;
  }

  const text = extractAgentMessageText(payload);
  if (!text) return null;
  return {
    type: 'agent_message',
    messageId:
      normalizeInlineText(payload.id)
      ?? normalizeInlineText(event.timestamp)
      ?? `codex-turn-${Math.max(state.turnIndex, 1)}-assistant`,
    text,
  };
}

export function parseCodexExecEventFromLine(
  line: string,
  state: CodexExecEventParserState,
): CodexExecEvent | null {
  const event = parseCodexJsonLine(line);
  if (!event) return null;

  const eventType = normalizeInlineText(event.type);
  if (eventType === 'session_meta') {
    const payload = isRecord(event.payload) ? event.payload : null;
    const sessionId = payload ? normalizeInlineText(payload.id) : null;
    return { type: 'thread.started', threadId: sessionId };
  }

  if (eventType === 'event_msg') {
    return parseCodexExecEventFromEventMessage(event, state);
  }

  if (eventType === 'response_item') {
    return parseCodexExecEventFromResponseItem(event, state);
  }

  if (eventType === 'thread.started') {
    return {
      type: 'thread.started',
      threadId: normalizeInlineText(event.thread_id),
    };
  }

  if (eventType === 'turn.started') {
    state.turnIndex += 1;
    state.activeCommandIds.clear();
    return { type: 'turn.started' };
  }

  if (eventType === 'turn.completed') {
    state.activeCommandIds.clear();
    return { type: 'turn.completed', usage: parseCodexTokenUsage(event.usage) };
  }

  if (eventType === 'error') {
    const payloadMsg = isRecord(event.payload) ? normalizeInlineText(event.payload.message) : null;
    const message = normalizeInlineText(event.message) ?? payloadMsg;
    if (!message) return null;
    return {
      type: 'provider_error',
      message,
      statusCode: providerStatusCodeFromMessage(message),
    };
  }

  const item = isRecord(event.item) ? event.item : null;
  if (!item) return null;
  const itemType = normalizeInlineText(item.type);
  if (!itemType) return null;

  if (
    itemType === 'agent_message'
    || (itemType === 'message' && normalizeInlineText(item.role) === 'assistant')
  ) {
    const text = extractAgentMessageText(item);
    if (!text) return null;
    return {
      type: 'agent_message',
      messageId:
        normalizeInlineText(item.id)
        ?? `codex-turn-${Math.max(state.turnIndex, 1)}-assistant`,
      text,
    };
  }

  if (itemType === 'command_execution') {
    const title = normalizeInlineText(item.command);
    const status = normalizeInlineText(item.status);
    if (
      status !== 'pending'
      && status !== 'in_progress'
      && status !== 'completed'
      && status !== 'failed'
    ) {
      return null;
    }
    return {
      type: 'command_execution',
      toolCallId:
        normalizeInlineText(item.id)
        ?? resolveFallbackToolCallId(state, title, status),
      title: title ?? 'codex command',
      status,
      output: normalizeInlineText(item.aggregated_output),
    };
  }

  return null;
}

function toolResultCallIdFromEvent(event: Record<string, unknown> | null): string | null {
  if (!event) return null;
  const payload = isRecord(event.payload) ? event.payload : null;
  const directType = normalizeInlineText(payload?.type);
  if (
    directType === 'function_call_output'
    || directType === 'tool_call_output'
    || directType === 'tool_result'
  ) {
    return normalizeInlineText(payload?.call_id) ?? normalizeInlineText(payload?.tool_call_id);
  }

  const item = isRecord(event.item) ? event.item : null;
  const itemType = normalizeInlineText(item?.type);
  if (
    itemType === 'function_call_output'
    || itemType === 'tool_call_output'
    || itemType === 'tool_result'
  ) {
    return normalizeInlineText(item?.call_id) ?? normalizeInlineText(item?.tool_call_id);
  }
  return null;
}

export function findPendingUnsupportedFunctionCalls(
  output: string,
): Array<{ readonly name: string; readonly callId: string | null }> {
  const parserState = createCodexExecEventParserState();
  const pending = new Map<string, { readonly name: string; readonly callId: string | null }>();
  const resolved = new Set<string>();

  for (const rawLine of output.split(/\r?\n/)) {
    const rawEvent = parseCodexJsonLine(rawLine);
    const resolvedCallId = toolResultCallIdFromEvent(rawEvent);
    if (resolvedCallId) {
      resolved.add(resolvedCallId);
    }
    const event = parseCodexExecEventFromLine(rawLine, parserState);
    if (!event) continue;
    if (event.type === 'unsupported_function_call') {
      const key = event.callId ?? `${event.name}:${pending.size}`;
      pending.set(key, { name: event.name, callId: event.callId });
    }
  }

  return [...pending.entries()]
    .filter(([key]) => !resolved.has(key))
    .map(([, val]) => val);
}
