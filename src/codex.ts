import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  recoverCodexExecOutputFromSession,
  type CodexSessionRecoveryResult,
} from './codex-session-recovery.ts';
import { FrameworkContractError } from './contracts.ts';

export {
  recoverCodexExecOutputFromSession,
  type CodexSessionRecoveryResult,
};

export type CodexBinarySource = 'env' | 'path';

export interface CodexBinaryInfo {
  path: string;
  source: CodexBinarySource;
}

export interface CodexCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timeoutReason?: 'total_timeout' | 'no_output_timeout' | 'unsupported_tool_protocol' | 'activity_cancelled';
  noOutputTimeoutMs?: number | null;
  unsupportedFunctionCalls?: Array<{
    name: string;
    callId: string | null;
  }>;
  unsupportedFunctionCallSessionPath?: string | null;
}

export interface CodexPassthroughResult {
  exitCode: number;
}

export interface CodexCommandOptions {
  inheritStdio?: boolean;
}

export interface CodexStreamingCommandOptions {
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  onStdoutEvent?: (event: CodexExecEvent) => void;
  onProcessStarted?: (pid: number | null) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  noOutputTimeoutMs?: number;
}

export interface CodexExecOptions {
  cwd?: string;
  json?: boolean;
  model?: string;
  provider?: string;
  reasoningEffort?: string;
}

export interface ParsedCodexExecOutput {
  threadId: string | null;
  finalMessage: string;
  messages: string[];
}

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
    };

type CodexExecEventParserState = {
  turnIndex: number;
  commandCounter: number;
  activeCommandIds: Map<string, string>;
};

function isExecutableCandidate(filePath: string) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function resolveCodexFromPath(): CodexBinaryInfo | null {
  const pathEntries = (process.env.PATH ?? '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of pathEntries) {
    const candidate = path.join(entry, 'codex');
    if (isExecutableCandidate(candidate)) {
      return {
        path: candidate,
        source: 'path',
      };
    }
  }

  return null;
}

export function resolveCodexBinary(): CodexBinaryInfo | null {
  const envCandidate = process.env.OPL_CODEX_BIN?.trim();

  if (envCandidate) {
    if (!isExecutableCandidate(envCandidate)) {
      throw new FrameworkContractError(
        'surface_not_found',
        'OPL_CODEX_BIN is set but does not point to a runnable Codex binary.',
        {
          codex_binary: envCandidate,
          env_var: 'OPL_CODEX_BIN',
        },
      );
    }

    return {
      path: envCandidate,
      source: 'env',
    };
  }

  return resolveCodexFromPath();
}

function quoteTomlString(value: string) {
  return JSON.stringify(value);
}

export function buildCodexExecArgs(
  prompt: string,
  options: CodexExecOptions = {},
) {
  const args = ['exec', '--skip-git-repo-check', '--full-auto'];

  if (options.json) {
    args.push('--json');
  }

  if (options.cwd) {
    args.push('--cd', options.cwd);
  }

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.provider) {
    args.push('--config', `model_provider=${quoteTomlString(options.provider)}`);
  }

  if (options.reasoningEffort) {
    args.push('--config', `model_reasoning_effort=${quoteTomlString(options.reasoningEffort)}`);
  }

  args.push(prompt);
  return args;
}

export function buildCodexCliPreview(args: string[]) {
  return ['codex', ...args];
}

export function runCodexCommand(
  args: string[],
  options: CodexCommandOptions = {},
): CodexCommandResult {
  const codexBinary = resolveCodexBinary();

  if (!codexBinary) {
    throw new FrameworkContractError(
      'surface_not_found',
      'Codex binary is required for Codex-backed OPL ask execution.',
      {
        env_var: 'OPL_CODEX_BIN',
      },
    );
  }

  const result = spawnSync(codexBinary.path, args, {
    encoding: 'utf8',
    stdio: options.inheritStdio ? 'inherit' : 'pipe',
    env: process.env,
  });

  if (result.error) {
    throw new FrameworkContractError(
      'codex_command_failed',
      `Failed to launch Codex for: codex ${args.join(' ')}`,
      {
        codex_binary: codexBinary.path,
        args,
        cause: result.error.message,
      },
    );
  }

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

export async function runCodexCommandStreaming(
  args: string[],
  options: CodexStreamingCommandOptions = {},
): Promise<CodexCommandResult> {
  const codexBinary = resolveCodexBinary();

  if (!codexBinary) {
    throw new FrameworkContractError(
      'surface_not_found',
      'Codex binary is required for Codex-backed OPL ask execution.',
      {
        env_var: 'OPL_CODEX_BIN',
      },
    );
  }

  return await new Promise<CodexCommandResult>((resolve, reject) => {
    const child = spawn(codexBinary.path, args, {
      env: process.env,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdoutEventParserState = createCodexExecEventParserState();

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timeoutReason: CodexCommandResult['timeoutReason'];
    let completed = false;
    let timeout: NodeJS.Timeout | null = null;
    let noOutputTimeout: NodeJS.Timeout | null = null;
    const unsupportedFunctionCalls: NonNullable<CodexCommandResult['unsupportedFunctionCalls']> = [];
    let threadId: string | null = null;
    let unsupportedFunctionCallSessionPath: string | null = null;
    const clearProcessTimeout = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };
    const clearNoOutputTimeout = () => {
      if (noOutputTimeout) {
        clearTimeout(noOutputTimeout);
        noOutputTimeout = null;
      }
    };
    const timeoutMessageFor = (reason: CodexCommandResult['timeoutReason']) => reason === 'no_output_timeout'
      ? 'Codex command produced no output before the progress watchdog expired.'
      : reason === 'unsupported_tool_protocol'
        ? 'Codex command emitted an unsupported native function_call without an OPL tool host.'
        : reason === 'activity_cancelled'
          ? 'Codex command cancelled by Temporal activity cancellation.'
        : 'Codex command timed out.';
    const finishTimedOut = (reason: NonNullable<CodexCommandResult['timeoutReason']>) => {
      if (completed) {
        return;
      }
      completed = true;
      timedOut = true;
      timeoutReason = reason;
      options.signal?.removeEventListener('abort', abortCommand);
      clearProcessTimeout();
      clearNoOutputTimeout();
      terminateChildProcessGroup(child.pid);
      const timeoutMessage = timeoutMessageFor(reason);
      resolve({
        exitCode: reason === 'activity_cancelled' ? 130 : 124,
        stdout,
        stderr: `${stderr}${stderr.endsWith('\n') || stderr.length === 0 ? '' : '\n'}${timeoutMessage}\n`,
        timeoutReason: reason,
        noOutputTimeoutMs: options.noOutputTimeoutMs ?? null,
        ...(unsupportedFunctionCalls.length > 0 ? { unsupportedFunctionCalls } : {}),
        ...(unsupportedFunctionCallSessionPath ? { unsupportedFunctionCallSessionPath } : {}),
      });
    };
    const abortCommand = () => {
      finishTimedOut('activity_cancelled');
    };
    const expireCommand = () => {
      finishTimedOut('total_timeout');
    };

    const recordUnsupportedFunctionCalls = (
      calls: NonNullable<CodexCommandResult['unsupportedFunctionCalls']>,
      sessionPath?: string | null,
    ) => {
      const seen = new Set(unsupportedFunctionCalls.map((call) => `${call.callId ?? ''}:${call.name}`));
      for (const call of calls) {
        const key = `${call.callId ?? ''}:${call.name}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        unsupportedFunctionCalls.push(call);
      }
      unsupportedFunctionCallSessionPath = sessionPath ?? unsupportedFunctionCallSessionPath;
    };

    const detectSessionUnsupportedFunctionCalls = () => {
      const recovered = recoverCodexExecOutputFromSession(threadId);
      if (!recovered) {
        return false;
      }
      const calls = findPendingUnsupportedFunctionCalls(recovered.output);
      if (calls.length === 0) {
        return false;
      }
      recordUnsupportedFunctionCalls(calls, recovered.sessionPath);
      return true;
    };

    options.onProcessStarted?.(typeof child.pid === 'number' ? child.pid : null);
    if (options.signal?.aborted) {
      abortCommand();
    } else {
      options.signal?.addEventListener('abort', abortCommand, { once: true });
    }
    if (!completed && options.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(() => {
        expireCommand();
      }, options.timeoutMs);
    }

    const resetNoOutputTimeout = () => {
      clearNoOutputTimeout();
      if (!completed && options.noOutputTimeoutMs && options.noOutputTimeoutMs > 0) {
        noOutputTimeout = setTimeout(() => {
          finishTimedOut(detectSessionUnsupportedFunctionCalls()
            ? 'unsupported_tool_protocol'
            : 'no_output_timeout');
        }, options.noOutputTimeoutMs);
      }
    };
    resetNoOutputTimeout();

    const flushStdout = attachLineBuffer(child.stdout, (line) => {
      stdout += `${line}\n`;
      resetNoOutputTimeout();
      options.onStdoutLine?.(line);
      const event = parseCodexExecEventFromLine(line, stdoutEventParserState);
      if (event) {
        options.onStdoutEvent?.(event);
        if (event.type === 'thread.started') {
          threadId = event.threadId;
        }
        if (event.type === 'unsupported_function_call') {
          recordUnsupportedFunctionCalls([{
            name: event.name,
            callId: event.callId,
          }]);
          finishTimedOut('unsupported_tool_protocol');
        }
      }
    });
    const flushStderr = attachLineBuffer(child.stderr, (line) => {
      stderr += `${line}\n`;
      resetNoOutputTimeout();
      options.onStderrLine?.(line);
    });

    child.once('error', (error) => {
      if (completed) {
        return;
      }
      completed = true;
      options.signal?.removeEventListener('abort', abortCommand);
      clearProcessTimeout();
      clearNoOutputTimeout();
      reject(
        new FrameworkContractError(
          'codex_command_failed',
          `Failed to launch Codex for: codex ${args.join(' ')}`,
          {
            codex_binary: codexBinary.path,
            args,
            cause: error.message,
          },
        ),
      );
    });

    child.once('close', (code) => {
      if (completed) {
        return;
      }
      completed = true;
      options.signal?.removeEventListener('abort', abortCommand);
      clearProcessTimeout();
      clearNoOutputTimeout();
      flushStdout();
      flushStderr();
      if (
        timedOut
        && timeoutReason === 'no_output_timeout'
        && unsupportedFunctionCalls.length === 0
        && detectSessionUnsupportedFunctionCalls()
      ) {
        timeoutReason = 'unsupported_tool_protocol';
      }
      const timeoutMessage = timeoutMessageFor(timeoutReason);
      resolve({
        exitCode: timedOut ? 124 : code ?? 1,
        stdout,
        stderr: timedOut
          ? `${stderr}${stderr.endsWith('\n') || stderr.length === 0 ? '' : '\n'}${timeoutMessage}\n`
          : stderr,
        ...(timeoutReason ? { timeoutReason } : {}),
        noOutputTimeoutMs: options.noOutputTimeoutMs ?? null,
        ...(unsupportedFunctionCalls.length > 0 ? { unsupportedFunctionCalls } : {}),
        ...(unsupportedFunctionCallSessionPath ? { unsupportedFunctionCallSessionPath } : {}),
      });
    });

    child.stdin.end();
  });
}

export function runCodexPassthrough(args: string[]): CodexPassthroughResult {
  const codexBinary = resolveCodexBinary();

  if (!codexBinary) {
    throw new FrameworkContractError(
      'surface_not_found',
      'Codex binary is required for OPL Codex passthrough execution.',
      {
        env_var: 'OPL_CODEX_BIN',
      },
    );
  }

  const result = spawnSync(codexBinary.path, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    throw new FrameworkContractError(
      'codex_command_failed',
      `Failed to launch Codex for: codex ${args.join(' ')}`,
      {
        codex_binary: codexBinary.path,
        args,
        cause: result.error.message,
      },
    );
  }

  return {
    exitCode: result.status ?? 1,
  };
}

function parseCodexJsonLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function attachLineBuffer(
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

function terminateChildProcessGroup(pid: number | undefined) {
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

function createCodexExecEventParserState(): CodexExecEventParserState {
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

function parseCodexExecEventFromLine(
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

function trimCommand(command: string) {
  return command.length > 96 ? `${command.slice(0, 93)}...` : command;
}

function summarizeCodexEvent(event: Record<string, unknown>) {
  const eventType = normalizeInlineText(event.type);
  if (!eventType) {
    return null;
  }

  if (eventType === 'thread.started') {
    const threadId = normalizeInlineText(event.thread_id);
    return threadId ? `Codex 已接管任务，会话 ${threadId} 已创建。` : 'Codex 已接管任务。';
  }

  if (eventType === 'turn.started') {
    return 'Codex 正在读取上下文并规划下一步。';
  }

  const item = event.item;
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    if (eventType === 'turn.completed') {
      return 'Codex 已完成这一轮执行。';
    }
    return null;
  }

  const itemType = normalizeInlineText((item as Record<string, unknown>).type);
  if (!itemType) {
    return null;
  }

  if (itemType === 'agent_message') {
    return extractAgentMessageText(item as Record<string, unknown>);
  }

  if (itemType === 'command_execution') {
    const command = normalizeInlineText((item as Record<string, unknown>).command);
    const status = normalizeInlineText((item as Record<string, unknown>).status);
    const aggregatedOutput = normalizeInlineText((item as Record<string, unknown>).aggregated_output);
    const outputPreview = aggregatedOutput
      ? aggregatedOutput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)[0] ?? null
      : null;

    if (status === 'in_progress' && command) {
      return `Codex 正在执行：${trimCommand(command)}`;
    }

    if (status === 'completed' && command) {
      return outputPreview
        ? `已完成：${trimCommand(command)} -> ${outputPreview}`
        : `已完成：${trimCommand(command)}`;
    }
  }

  return null;
}

export function summarizeCodexOutputLine(line: string) {
  return summarizeCodexEvent(parseCodexJsonLine(line) ?? {});
}

export function extractCodexRecentOutput(output: string, lines = 6) {
  const humanLines = output
    .split(/\r?\n/)
    .map((line) => summarizeCodexOutputLine(line))
    .filter((line): line is string => Boolean(line))
    .slice(-lines);

  return humanLines.join('\n');
}

export function parseCodexExecOutput(output: string): ParsedCodexExecOutput {
  let threadId: string | null = null;
  const messages: string[] = [];
  const parserState = createCodexExecEventParserState();

  for (const rawLine of output.split(/\r?\n/)) {
    const event = parseCodexExecEventFromLine(rawLine, parserState);
    if (!event) {
      continue;
    }

    if (event.type === 'thread.started') {
      threadId = event.threadId;
      continue;
    }

    if (event.type === 'agent_message') {
      messages.push(event.text);
    }
  }

  return {
    threadId,
    finalMessage: messages.join(''),
    messages,
  };
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
