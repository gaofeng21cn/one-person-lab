import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  recoverCodexExecOutputFromSession,
  type CodexSessionRecoveryResult,
} from './codex-session-recovery.ts';
import {
  attachLineBuffer,
  createCodexExecEventParserState,
  findPendingUnsupportedFunctionCalls,
  parseCodexExecEventFromLine,
  terminateChildProcessGroup,
  type CodexExecEvent,
} from './codex-exec-events.ts';
import { FrameworkContractError } from '../../kernel/contract-validation.ts';

export {
  recoverCodexExecOutputFromSession,
  type CodexSessionRecoveryResult,
};
export type { CodexExecEvent } from './codex-exec-events.ts';

export type CodexBinarySource = 'env' | 'path' | 'runtime';

export interface CodexBinaryInfo {
  path: string;
  source: CodexBinarySource;
}

export interface CodexCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timeoutReason?:
    | 'total_timeout'
    | 'no_output_timeout'
    | 'command_no_progress_timeout'
    | 'unsupported_tool_protocol'
    | 'activity_cancelled'
    | 'provider_unavailable';
  noOutputTimeoutMs?: number | null;
  commandNoProgressTimeoutMs?: number | null;
  activeCommand?: CodexCommandActivity | null;
  unsupportedFunctionCalls?: Array<{
    name: string;
    callId: string | null;
  }>;
  unsupportedFunctionCallSessionPath?: string | null;
  providerErrors?: Array<{
    message: string;
    statusCode: number | null;
  }>;
}

export interface CodexPassthroughResult {
  exitCode: number;
}

export interface CodexCommandOptions {
  inheritStdio?: boolean;
}

export interface CodexStreamingCommandOptions {
  binaryPath?: string;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
  onStdoutEvent?: (event: CodexExecEvent) => void;
  onProcessStarted?: (pid: number | null) => void;
  cwd?: string;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
  noOutputTimeoutMs?: number;
  commandNoProgressTimeoutMs?: number;
  stdin?: string;
}

export interface CodexCommandActivity {
  toolCallId: string;
  title: string;
  status: 'pending' | 'in_progress';
  startedAt: string;
  lastOutputAt: string | null;
  outputChars: number;
}

export interface CodexExecOptions {
  cwd?: string;
  json?: boolean;
  model?: string;
  provider?: string;
  reasoningEffort?: string;
  outputLastMessagePath?: string;
  outputSchemaPath?: string;
  ephemeral?: boolean;
  enableImageGeneration?: boolean;
  promptViaStdin?: boolean;
}

export interface ParsedCodexExecOutput {
  threadId: string | null;
  finalMessage: string;
  messages: string[];
}

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

function resolveHomeDir() {
  return process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
}

function resolveRuntimeCodexPath() {
  const runtimeRoot = process.env.OPL_RUNTIME_ROOT?.trim()
    || path.join(resolveHomeDir(), 'Library', 'Application Support', 'OPL', 'runtime');
  return path.join(runtimeRoot, 'current', 'bin', 'codex');
}

function resolveCodexFromRuntime(): CodexBinaryInfo | null {
  const candidate = resolveRuntimeCodexPath();
  if (!isExecutableCandidate(candidate)) {
    return null;
  }

  return {
    path: candidate,
    source: 'runtime',
  };
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

  return resolveCodexFromPath() ?? resolveCodexFromRuntime();
}

function quoteTomlString(value: string) {
  return JSON.stringify(value);
}

function spawnEnvWithOverlay(overlay?: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  if (!overlay) {
    return process.env;
  }
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}

export function buildCodexExecArgs(
  prompt: string,
  options: CodexExecOptions = {},
) {
  const args = ['exec', '--skip-git-repo-check', '--full-auto'];

  if (options.json) {
    args.push('--json');
  }

  if (options.ephemeral) {
    args.push('--ephemeral');
  }

  if (options.enableImageGeneration) {
    args.push('--enable', 'image_generation');
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

  if (options.outputSchemaPath) {
    args.push('--output-schema', options.outputSchemaPath);
  }

  if (options.outputLastMessagePath) {
    args.push('--output-last-message', options.outputLastMessagePath);
  }

  args.push(options.promptViaStdin ? '-' : prompt);
  return args;
}

export function buildCodexExecResumeArgs(
  sessionId: string,
  prompt: string,
  options: Omit<CodexExecOptions, 'cwd'> = {},
) {
  const args = ['exec', 'resume', '--skip-git-repo-check'];

  if (options.json) {
    args.push('--json');
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

  if (options.outputSchemaPath) {
    args.push('--output-schema', options.outputSchemaPath);
  }

  if (options.outputLastMessagePath) {
    args.push('--output-last-message', options.outputLastMessagePath);
  }

  args.push(sessionId, prompt);
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
  const codexBinary = options.binaryPath
    ? { path: options.binaryPath, source: 'env' as const }
    : resolveCodexBinary();

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
      cwd: options.cwd,
      env: spawnEnvWithOverlay(options.env),
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
    let commandNoProgressTimeout: NodeJS.Timeout | null = null;
    const activeCommands = new Map<string, CodexCommandActivity>();
    let timedOutActiveCommand: CodexCommandActivity | null = null;
    const unsupportedFunctionCalls: NonNullable<CodexCommandResult['unsupportedFunctionCalls']> = [];
    const providerErrors: NonNullable<CodexCommandResult['providerErrors']> = [];
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
    const clearCommandNoProgressTimeout = () => {
      if (commandNoProgressTimeout) {
        clearTimeout(commandNoProgressTimeout);
        commandNoProgressTimeout = null;
      }
    };
    const timeoutMessageFor = (reason: CodexCommandResult['timeoutReason']) =>
      reason === 'no_output_timeout'
        ? 'Codex command produced no output before the progress watchdog expired.'
        : reason === 'command_no_progress_timeout'
          ? 'Codex command execution produced no progress before the command watchdog expired.'
          : reason === 'unsupported_tool_protocol'
            ? 'Codex command emitted an unsupported native function_call without an OPL tool host.'
            : reason === 'provider_unavailable'
              ? 'Codex command provider returned an upstream error before a final response was materialized.'
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
      clearCommandNoProgressTimeout();
      terminateChildProcessGroup(child.pid);
      const timeoutMessage = timeoutMessageFor(reason);
      resolve({
        exitCode: reason === 'activity_cancelled' ? 130 : 124,
        stdout,
        stderr: `${stderr}${stderr.endsWith('\n') || stderr.length === 0 ? '' : '\n'}${timeoutMessage}\n`,
        timeoutReason: reason,
        noOutputTimeoutMs: options.noOutputTimeoutMs ?? null,
        commandNoProgressTimeoutMs: options.commandNoProgressTimeoutMs ?? null,
        ...(timedOutActiveCommand ? { activeCommand: timedOutActiveCommand } : {}),
        ...(unsupportedFunctionCalls.length > 0 ? { unsupportedFunctionCalls } : {}),
        ...(unsupportedFunctionCallSessionPath ? { unsupportedFunctionCallSessionPath } : {}),
        ...(providerErrors.length > 0 ? { providerErrors } : {}),
      });
    };
    const abortCommand = () => {
      finishTimedOut('activity_cancelled');
    };
    const expireCommand = () => {
      finishTimedOut('total_timeout');
    };

    const refreshCommandNoProgressTimeout = () => {
      clearCommandNoProgressTimeout();
      if (
        completed
        || activeCommands.size === 0
        || !options.commandNoProgressTimeoutMs
        || options.commandNoProgressTimeoutMs <= 0
      ) {
        return;
      }
      commandNoProgressTimeout = setTimeout(() => {
        const oldestActiveCommand = [...activeCommands.values()]
          .sort((left, right) => left.startedAt.localeCompare(right.startedAt))[0] ?? null;
        timedOutActiveCommand = oldestActiveCommand ? { ...oldestActiveCommand } : null;
        finishTimedOut('command_no_progress_timeout');
      }, options.commandNoProgressTimeoutMs);
    };

    const recordCommandExecution = (event: Extract<CodexExecEvent, { type: 'command_execution' }>) => {
      if (event.status === 'completed' || event.status === 'failed') {
        activeCommands.delete(event.toolCallId);
        refreshCommandNoProgressTimeout();
        return;
      }
      const now = new Date().toISOString();
      const outputChars = event.output?.length ?? 0;
      const existing = activeCommands.get(event.toolCallId);
      const hasProgress = !existing
        || existing.status !== event.status
        || outputChars > existing.outputChars;
      activeCommands.set(event.toolCallId, {
        toolCallId: event.toolCallId,
        title: event.title,
        status: event.status,
        startedAt: existing?.startedAt ?? now,
        lastOutputAt: outputChars > (existing?.outputChars ?? 0)
          ? now
          : existing?.lastOutputAt ?? null,
        outputChars: Math.max(outputChars, existing?.outputChars ?? 0),
      });
      if (hasProgress) {
        refreshCommandNoProgressTimeout();
      }
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

    const recordProviderError = (event: Extract<CodexExecEvent, { type: 'provider_error' }>) => {
      providerErrors.push({
        message: event.message,
        statusCode: event.statusCode,
      });
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
            : providerErrors.length > 0
              ? 'provider_unavailable'
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
        if (event.type === 'command_execution') {
          recordCommandExecution(event);
        }
        if (event.type === 'unsupported_function_call') {
          recordUnsupportedFunctionCalls([{
            name: event.name,
            callId: event.callId,
          }]);
          finishTimedOut('unsupported_tool_protocol');
        }
        if (event.type === 'provider_error') {
          recordProviderError(event);
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
      clearCommandNoProgressTimeout();
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
      clearCommandNoProgressTimeout();
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
        commandNoProgressTimeoutMs: options.commandNoProgressTimeoutMs ?? null,
        ...(timedOutActiveCommand ? { activeCommand: timedOutActiveCommand } : {}),
        ...(unsupportedFunctionCalls.length > 0 ? { unsupportedFunctionCalls } : {}),
        ...(unsupportedFunctionCallSessionPath ? { unsupportedFunctionCallSessionPath } : {}),
        ...(providerErrors.length > 0 ? { providerErrors } : {}),
      });
    });

    child.stdin.end(options.stdin ?? '');
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
