import { parseJsonText } from '../../kernel/json-file.ts';

export type CodexExecEvent =
  | {
      type: 'thread.started';
      threadId: string | null;
    }
  | {
      type: 'turn.started';
    }
  | {
      type: 'turn.completed';
    }
  | {
      type: 'agent_message';
      messageId: string;
      text: string;
    }
  | {
      type: 'command_execution';
      toolCallId: string;
      title: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      output: string | null;
    }
  | {
      type: 'unsupported_function_call';
      callId: string | null;
      name: string;
      arguments: string | null;
    }
  | {
      type: 'provider_error';
      message: string;
      statusCode: number | null;
    };

type CodexExecEventParserState = {
  turnIndex: number;
  commandCounter: number;
  activeCommandIds: Map<string, string>;
};

function parseCodexJsonLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    return parseJsonText(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function attachLineBuffer(
  stream: NodeJS.ReadableStream | null,
  onLine: (line: string) => void,
) {
  if (!stream) {
    return () => '';
  }

  let buffer = '';
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk: string | Buffer) => {
    buffer += chunk.toString();
    while (true) {
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        break;
      }
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);
      onLine(line);
    }
  });

  return () => {
    if (!buffer) {
      return '';
    }
    const remainder = buffer.replace(/\r$/, '');
    buffer = '';
    if (remainder) {
      onLine(remainder);
    }
    return remainder;
  };
}

export function terminateChildProcessGroup(pid: number | undefined) {
  if (typeof pid !== 'number') {
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // The process may already have exited after the triggering event.
    }
  }
}

function normalizeInlineText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeChunkText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function providerStatusCodeFromMessage(message: string) {
  const match = /\bstatus\s+([1-5][0-9][0-9])\b/i.exec(message);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function createCodexExecEventParserState(): CodexExecEventParserState {
  return {
    turnIndex: 0,
    commandCounter: 0,
    activeCommandIds: new Map(),
  };
}

function resolveFallbackToolCallId(
  state: CodexExecEventParserState,
  command: string | null,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
) {
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

export function parseCodexExecEventFromLine(
  line: string,
  state: CodexExecEventParserState,
): CodexExecEvent | null {
  const event = parseCodexJsonLine(line);
  if (!event) {
    return null;
  }

  const eventType = normalizeInlineText(event.type);
  if (eventType === 'session_meta') {
    const payload = event.payload;
    const payloadRecord = payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : null;
    const sessionId = payloadRecord ? normalizeInlineText(payloadRecord.id) : null;
    return {
      type: 'thread.started',
      threadId: sessionId,
    };
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
    return { type: 'turn.completed' };
  }

  if (eventType === 'error') {
    const message = normalizeInlineText(event.message)
      ?? normalizeInlineText((event.payload as Record<string, unknown> | undefined)?.message);
    if (!message) {
      return null;
    }
    return {
      type: 'provider_error',
      message,
      statusCode: providerStatusCodeFromMessage(message),
    };
  }

  const item = event.item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }

  const itemRecord = item as Record<string, unknown>;
  const itemType = normalizeInlineText(itemRecord.type);
  if (!itemType) {
    return null;
  }

  if (
    itemType === 'agent_message'
    || (itemType === 'message' && normalizeInlineText(itemRecord.role) === 'assistant')
  ) {
    const text = extractAgentMessageText(itemRecord);
    if (!text) {
      return null;
    }
    return {
      type: 'agent_message',
      messageId:
        normalizeInlineText(itemRecord.id) ??
        `codex-turn-${Math.max(state.turnIndex, 1)}-assistant`,
      text,
    };
  }

  if (itemType === 'command_execution') {
    const title = normalizeInlineText(itemRecord.command);
    const status = normalizeInlineText(itemRecord.status);
    if (
      status !== 'pending' &&
      status !== 'in_progress' &&
      status !== 'completed' &&
      status !== 'failed'
    ) {
      return null;
    }

    return {
      type: 'command_execution',
      toolCallId:
        normalizeInlineText(itemRecord.id) ??
        resolveFallbackToolCallId(state, title, status),
      title: title ?? 'codex command',
      status,
      output: normalizeInlineText(itemRecord.aggregated_output),
    };
  }

  return null;
}

function parseCodexExecEventFromEventMessage(
  event: Record<string, unknown>,
  state: CodexExecEventParserState,
) {
  const payload = event.payload;
  const payloadRecord = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  if (!payloadRecord) {
    return null;
  }

  const payloadType = normalizeInlineText(payloadRecord.type);
  if (payloadType === 'agent_message') {
    const text = normalizeChunkText(payloadRecord.message);
    if (!text) {
      return null;
    }
    return {
      type: 'agent_message',
      messageId:
        normalizeInlineText(payloadRecord.id) ??
        normalizeInlineText(event.timestamp) ??
        `codex-turn-${Math.max(state.turnIndex, 1)}-assistant`,
      text,
    } satisfies CodexExecEvent;
  }

  if (payloadType === 'task_complete') {
    const text = normalizeChunkText(payloadRecord.last_agent_message);
    if (!text) {
      return null;
    }
    return {
      type: 'agent_message',
      messageId:
        normalizeInlineText(payloadRecord.turn_id) ??
        normalizeInlineText(event.timestamp) ??
        `codex-turn-${Math.max(state.turnIndex, 1)}-assistant`,
      text,
    } satisfies CodexExecEvent;
  }

  if (payloadType === 'turn_started') {
    state.turnIndex += 1;
    state.activeCommandIds.clear();
    return { type: 'turn.started' } satisfies CodexExecEvent;
  }

  if (payloadType === 'turn_completed') {
    state.activeCommandIds.clear();
    return { type: 'turn.completed' } satisfies CodexExecEvent;
  }

  return null;
}

function parseCodexExecEventFromResponseItem(
  event: Record<string, unknown>,
  state: CodexExecEventParserState,
) {
  const payload = event.payload;
  const payloadRecord = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  if (!payloadRecord) {
    return null;
  }

  const payloadType = normalizeInlineText(payloadRecord.type);
  if (payloadType === 'function_call') {
    return {
      type: 'unsupported_function_call',
      callId: normalizeInlineText(payloadRecord.call_id) ?? normalizeInlineText(payloadRecord.id),
      name: normalizeInlineText(payloadRecord.name) ?? 'function_call',
      arguments: normalizeInlineText(payloadRecord.arguments),
    } satisfies CodexExecEvent;
  }

  if (payloadType !== 'message' || normalizeInlineText(payloadRecord.role) !== 'assistant') {
    return null;
  }

  const text = extractAgentMessageText(payloadRecord);
  if (!text) {
    return null;
  }
  return {
    type: 'agent_message',
    messageId:
      normalizeInlineText(payloadRecord.id) ??
      normalizeInlineText(event.timestamp) ??
      `codex-turn-${Math.max(state.turnIndex, 1)}-assistant`,
    text,
  } satisfies CodexExecEvent;
}

function extractAgentMessageText(itemRecord: Record<string, unknown>) {
  const directText = normalizeChunkText(itemRecord.text);
  if (directText) {
    return directText;
  }

  const content = itemRecord.content;
  if (!Array.isArray(content)) {
    return null;
  }

  const parts = content
    .map((entry) => {
      if (typeof entry === 'string') {
        return normalizeChunkText(entry);
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
      }
      const textEntry = entry as Record<string, unknown>;
      return normalizeChunkText(textEntry.text) ?? normalizeChunkText(textEntry.value);
    })
    .filter((entry): entry is string => Boolean(entry));

  return parts.length > 0 ? parts.join('\n') : null;
}

export function findPendingUnsupportedFunctionCalls(output: string) {
  const parserState = createCodexExecEventParserState();
  const pending = new Map<string, { name: string; callId: string | null }>();
  const resolved = new Set<string>();
  for (const rawLine of output.split(/\r?\n/)) {
    const rawEvent = parseCodexJsonLine(rawLine);
    const toolResultCallId = toolResultCallIdFromEvent(rawEvent);
    if (toolResultCallId) {
      resolved.add(toolResultCallId);
    }
    const event = parseCodexExecEventFromLine(rawLine, parserState);
    if (!event) {
      continue;
    }
    if (event.type === 'unsupported_function_call') {
      const key = event.callId ?? `${event.name}:${pending.size}`;
      pending.set(key, {
        name: event.name,
        callId: event.callId,
      });
      continue;
    }
  }
  return [...pending.entries()]
    .filter(([key]) => !resolved.has(key))
    .map(([, value]) => value);
}

function toolResultCallIdFromEvent(event: Record<string, unknown> | null) {
  if (!event) {
    return null;
  }
  const directPayload = event.payload;
  const payloadRecord = directPayload && typeof directPayload === 'object' && !Array.isArray(directPayload)
    ? directPayload as Record<string, unknown>
    : null;
  const directType = normalizeInlineText(payloadRecord?.type);
  if (
    directType === 'function_call_output'
    || directType === 'tool_call_output'
    || directType === 'tool_result'
  ) {
    return normalizeInlineText(payloadRecord?.call_id) ?? normalizeInlineText(payloadRecord?.tool_call_id);
  }

  const item = event.item;
  const itemRecord = item && typeof item === 'object' && !Array.isArray(item)
    ? item as Record<string, unknown>
    : null;
  const itemType = normalizeInlineText(itemRecord?.type);
  if (
    itemType === 'function_call_output'
    || itemType === 'tool_call_output'
    || itemType === 'tool_result'
  ) {
    return normalizeInlineText(itemRecord?.call_id) ?? normalizeInlineText(itemRecord?.tool_call_id);
  }

  return null;
}
