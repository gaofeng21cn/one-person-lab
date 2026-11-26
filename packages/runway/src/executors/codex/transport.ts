import { spawn } from 'node:child_process';
import { RunwayError } from '../../errors.ts';
import { attachLineBuffer, terminateProcessGroup } from '../spi.ts';
import {
  createCodexExecEventParserState,
  findPendingUnsupportedFunctionCalls,
  parseCodexExecEventFromLine,
  type CodexExecEvent,
} from './events.ts';
import { recoverCodexExecOutputFromSession } from './recovery.ts';

export interface CodexCommandActivity {
  readonly toolCallId: string;
  readonly title: string;
  readonly status: 'pending' | 'in_progress';
  readonly startedAt: string;
  readonly lastOutputAt: string | null;
  readonly outputChars: number;
}

export type CodexTimeoutReason =
  | 'total_timeout'
  | 'no_output_timeout'
  | 'command_no_progress_timeout'
  | 'unsupported_tool_protocol'
  | 'activity_cancelled'
  | 'provider_unavailable';

export interface CodexStreamingCommandOptions {
  readonly binaryPath: string;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly noOutputTimeoutMs?: number;
  readonly commandNoProgressTimeoutMs?: number;
  readonly gracefulInterruptMs?: number;
  readonly stdin?: string;
  readonly onStdoutLine?: (line: string) => void;
  readonly onStderrLine?: (line: string) => void;
  readonly onStdoutEvent?: (event: CodexExecEvent) => void;
  readonly onProcessStarted?: (pid: number | null) => void;
}

export interface CodexCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly threadId: string | null;
  readonly timeoutReason?: CodexTimeoutReason;
  readonly escalatedToSigkill?: boolean;
  readonly activeCommand?: CodexCommandActivity;
  readonly unsupportedFunctionCalls?: ReadonlyArray<{ readonly name: string; readonly callId: string | null }>;
  readonly unsupportedFunctionCallSessionPath?: string | null;
  readonly providerErrors?: ReadonlyArray<{ readonly message: string; readonly statusCode: number | null }>;
}

function mergeEnv(
  overlay?: NodeJS.ProcessEnv | Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  if (!overlay) return process.env;
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [k, v] of Object.entries(overlay)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

export async function runCodexCommandStreaming(
  args: readonly string[],
  options: CodexStreamingCommandOptions,
): Promise<CodexCommandResult> {
  const effectiveEnv = mergeEnv(options.env);
  const graceMs = options.gracefulInterruptMs ?? 10_000;

  return await new Promise<CodexCommandResult>((resolve, reject) => {
    const child = spawn(options.binaryPath, [...args], {
      cwd: options.cwd,
      env: effectiveEnv,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const parserState = createCodexExecEventParserState();
    let stdout = '';
    let stderr = '';
    let completed = false;
    let timeoutReason: CodexTimeoutReason | undefined;
    let totalTimer: NodeJS.Timeout | null = null;
    let noOutputTimer: NodeJS.Timeout | null = null;
    let commandNoProgressTimer: NodeJS.Timeout | null = null;
    const activeCommands = new Map<string, CodexCommandActivity>();
    let timedOutActiveCommand: CodexCommandActivity | null = null;
    const unsupportedCalls: Array<{ readonly name: string; readonly callId: string | null }> = [];
    const providerErrors: Array<{ readonly message: string; readonly statusCode: number | null }> = [];
    let threadId: string | null = null;
    let unsupportedSessionPath: string | null = null;

    const clearAllTimers = () => {
      if (totalTimer) {
        clearTimeout(totalTimer);
        totalTimer = null;
      }
      if (noOutputTimer) {
        clearTimeout(noOutputTimer);
        noOutputTimer = null;
      }
      if (commandNoProgressTimer) {
        clearTimeout(commandNoProgressTimer);
        commandNoProgressTimer = null;
      }
    };

    const detectSessionUnsupportedCalls = (): boolean => {
      const recovered = recoverCodexExecOutputFromSession(threadId, effectiveEnv);
      if (!recovered) return false;
      const calls = findPendingUnsupportedFunctionCalls(recovered.output);
      if (calls.length === 0) return false;
      const seen = new Set(unsupportedCalls.map((c) => `${c.callId ?? ''}:${c.name}`));
      for (const call of calls) {
        const key = `${call.callId ?? ''}:${call.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          unsupportedCalls.push(call);
        }
      }
      unsupportedSessionPath = recovered.sessionPath;
      return true;
    };

    const timeoutMessageFor = (reason: CodexTimeoutReason | undefined): string => {
      switch (reason) {
        case 'no_output_timeout':
          return 'Codex command produced no output before the progress watchdog expired.';
        case 'command_no_progress_timeout':
          return 'Codex command execution produced no progress before the command watchdog expired.';
        case 'unsupported_tool_protocol':
          return 'Codex command emitted an unsupported native function_call without an OPL tool host.';
        case 'provider_unavailable':
          return 'Codex command provider returned an upstream error before a final response was materialized.';
        case 'activity_cancelled':
          return 'Codex command cancelled by Runway abort signal.';
        default:
          return 'Codex command timed out.';
      }
    };

    const finishTimedOut = async (reason: CodexTimeoutReason) => {
      if (completed) return;
      completed = true;
      timeoutReason = reason;
      options.signal?.removeEventListener('abort', onAbort);
      clearAllTimers();
      const term = await terminateProcessGroup(child.pid, graceMs);
      const msg = timeoutMessageFor(reason);
      resolve({
        exitCode: reason === 'activity_cancelled' ? 130 : 124,
        stdout,
        stderr: `${stderr}${stderr.endsWith('\n') || stderr.length === 0 ? '' : '\n'}${msg}\n`,
        threadId,
        timeoutReason: reason,
        escalatedToSigkill: term.escalatedToSigkill,
        ...(timedOutActiveCommand ? { activeCommand: timedOutActiveCommand } : {}),
        ...(unsupportedCalls.length > 0 ? { unsupportedFunctionCalls: unsupportedCalls } : {}),
        ...(unsupportedSessionPath ? { unsupportedFunctionCallSessionPath: unsupportedSessionPath } : {}),
        ...(providerErrors.length > 0 ? { providerErrors } : {}),
      });
    };

    const onAbort = () => {
      void finishTimedOut('activity_cancelled');
    };

    const refreshCommandWatchdog = () => {
      if (commandNoProgressTimer) {
        clearTimeout(commandNoProgressTimer);
        commandNoProgressTimer = null;
      }
      if (
        completed
        || activeCommands.size === 0
        || !options.commandNoProgressTimeoutMs
        || options.commandNoProgressTimeoutMs <= 0
      ) {
        return;
      }
      commandNoProgressTimer = setTimeout(() => {
        const oldest = [...activeCommands.values()].sort((a, b) =>
          a.startedAt.localeCompare(b.startedAt),
        )[0];
        timedOutActiveCommand = oldest ? { ...oldest } : null;
        void finishTimedOut('command_no_progress_timeout');
      }, options.commandNoProgressTimeoutMs);
      commandNoProgressTimer.unref?.();
    };

    const resetNoOutputWatchdog = () => {
      if (noOutputTimer) {
        clearTimeout(noOutputTimer);
        noOutputTimer = null;
      }
      if (!completed && options.noOutputTimeoutMs && options.noOutputTimeoutMs > 0) {
        noOutputTimer = setTimeout(() => {
          const reason: CodexTimeoutReason = detectSessionUnsupportedCalls()
            ? 'unsupported_tool_protocol'
            : providerErrors.length > 0
              ? 'provider_unavailable'
              : 'no_output_timeout';
          void finishTimedOut(reason);
        }, options.noOutputTimeoutMs);
        noOutputTimer.unref?.();
      }
    };

    options.onProcessStarted?.(typeof child.pid === 'number' ? child.pid : null);

    if (options.signal?.aborted) {
      onAbort();
    } else {
      options.signal?.addEventListener('abort', onAbort, { once: true });
    }

    if (!completed && options.timeoutMs && options.timeoutMs > 0) {
      totalTimer = setTimeout(() => {
        void finishTimedOut('total_timeout');
      }, options.timeoutMs);
      totalTimer.unref?.();
    }

    resetNoOutputWatchdog();

    const flushStdout = attachLineBuffer(child.stdout, (line) => {
      stdout += `${line}\n`;
      resetNoOutputWatchdog();
      options.onStdoutLine?.(line);

      const ev = parseCodexExecEventFromLine(line, parserState);
      if (!ev) return;
      options.onStdoutEvent?.(ev);

      if (ev.type === 'thread.started' && ev.threadId) {
        threadId = ev.threadId;
      } else if (ev.type === 'command_execution') {
        if (ev.status === 'completed' || ev.status === 'failed') {
          activeCommands.delete(ev.toolCallId);
          refreshCommandWatchdog();
        } else {
          const now = new Date().toISOString();
          const outputChars = ev.output?.length ?? 0;
          const prev = activeCommands.get(ev.toolCallId);
          const progressed =
            !prev || prev.status !== ev.status || outputChars > prev.outputChars;
          activeCommands.set(ev.toolCallId, {
            toolCallId: ev.toolCallId,
            title: ev.title,
            status: ev.status,
            startedAt: prev?.startedAt ?? now,
            lastOutputAt:
              outputChars > (prev?.outputChars ?? 0) ? now : prev?.lastOutputAt ?? null,
            outputChars: Math.max(outputChars, prev?.outputChars ?? 0),
          });
          if (progressed) {
            refreshCommandWatchdog();
          }
        }
      } else if (ev.type === 'unsupported_function_call') {
        unsupportedCalls.push({ name: ev.name, callId: ev.callId });
        void finishTimedOut('unsupported_tool_protocol');
      } else if (ev.type === 'provider_error') {
        providerErrors.push({ message: ev.message, statusCode: ev.statusCode });
      }
    });

    const flushStderr = attachLineBuffer(child.stderr, (line) => {
      stderr += `${line}\n`;
      resetNoOutputWatchdog();
      options.onStderrLine?.(line);
    });

    child.once('error', (error) => {
      if (completed) return;
      completed = true;
      options.signal?.removeEventListener('abort', onAbort);
      clearAllTimers();
      reject(
        new RunwayError(
          'EXECUTOR_FAILED',
          `Failed to launch Codex: ${error.message}`,
          { codex_binary: options.binaryPath },
          { cause: error },
        ),
      );
    });

    child.stdin.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EPIPE' || completed) return;
      completed = true;
      options.signal?.removeEventListener('abort', onAbort);
      clearAllTimers();
      void terminateProcessGroup(child.pid, graceMs).finally(() => {
        reject(
          new RunwayError(
            'EXECUTOR_FAILED',
            `Failed writing Codex stdin: ${error.message}`,
            { codex_binary: options.binaryPath },
            { cause: error },
          ),
        );
      });
    });

    child.once('close', (code) => {
      if (completed) return;
      completed = true;
      options.signal?.removeEventListener('abort', onAbort);
      clearAllTimers();
      flushStdout();
      flushStderr();

      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        threadId,
        ...(unsupportedCalls.length > 0 ? { unsupportedFunctionCalls: unsupportedCalls } : {}),
        ...(providerErrors.length > 0 ? { providerErrors } : {}),
      });
    });

    child.stdin.end(options.stdin ?? '');
  });
}
