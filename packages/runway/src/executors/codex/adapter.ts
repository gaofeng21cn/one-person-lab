import { spawnSync } from 'node:child_process';
import { isProcessAlive, isRecord } from '@opl/core';
import {
  type ExecutionOutcome,
  type ExecutionUsage,
  type ExecutorAdapter,
  type ExecutorCapabilities,
  type ExecutorEvent,
  type ExecutorHealthStatus,
  type ExecutorReconcileRef,
  type ReconcileResult,
  type StageExecutionRequest,
} from '../spi.ts';
import { CodexAppServerClient } from './app-server.ts';
import { readAppServerTurnEvent, type AppServerTurnEvent } from './app-server-events.ts';
import { createAppServerTurnUsage } from './app-server-usage.ts';
import {
  appServerMcpConfig,
  buildCodexExecArgs,
  buildCodexExecResumeArgs,
  effectiveSandboxMode,
} from './args.ts';
import { resolveCodexBinary } from './binary.ts';
import type { CodexTokenUsage } from './events.ts';
import { analyzeCodexSessionJsonl, recoverCodexExecOutputFromSession } from './recovery.ts';
import { runCodexCommandStreaming } from './transport.ts';

export interface CodexExecutorAdapterOptions {
  readonly binaryPath?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly gracefulInterruptMs?: number;
  readonly noOutputTimeoutMs?: number;
  readonly commandNoProgressTimeoutMs?: number;
  readonly defaultTransport?: 'exec' | 'app-server';
}

export class CodexExecutorAdapter implements ExecutorAdapter {
  readonly #options: CodexExecutorAdapterOptions;

  readonly capabilities: ExecutorCapabilities = {
    executor_id: 'codex',
    display_name: 'Codex CLI / App Server',
    supports_streaming: true,
    supports_session_resume: true,
    supports_reconcile_after_restart: true,
    supports_mcp_tools: true,
    supports_sandbox_modes: ['read-only', 'workspace-write', 'danger-full-access'],
    models: [
      { id: 'gpt-5-codex', label: 'GPT-5 Codex', default: true },
      { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex' },
      { id: 'o3', label: 'OpenAI o3' },
    ],
  };

  constructor(options: CodexExecutorAdapterOptions = {}) {
    this.#options = options;
  }

  #getEnv(): NodeJS.ProcessEnv {
    return this.#options.env ?? process.env;
  }

  async healthCheck(): Promise<ExecutorHealthStatus> {
    let bin;
    try {
      bin = resolveCodexBinary(this.#options.binaryPath, this.#getEnv());
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    if (!bin) {
      return { available: false, reason: 'codex_binary_not_found' };
    }
    const r = spawnSync(bin.path, ['--version'], {
      encoding: 'utf8',
      timeout: 5_000,
      env: this.#getEnv(),
    });
    if (r.status !== 0 || r.error) {
      return {
        available: false,
        reason: r.stderr?.trim() || r.error?.message || 'codex_version_failed',
      };
    }
    return {
      available: true,
      version: r.stdout.trim(),
      models: this.capabilities.models.map((m) => m.id),
    };
  }

  async execute(
    req: StageExecutionRequest,
    emit: (ev: ExecutorEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionOutcome> {
    const startMs = Date.now();
    const bin = resolveCodexBinary(this.#options.binaryPath, this.#getEnv());
    if (!bin) {
      return {
        status: 'failed',
        artifact_refs: [],
        usage: { duration_ms: Date.now() - startMs },
        error: {
          code: 'EXECUTOR_UNAVAILABLE',
          message: 'Codex binary not found.',
          retryable: false,
        },
      };
    }

    const transport =
      req.metadata?.transport === 'app-server' || this.#options.defaultTransport === 'app-server'
        ? 'app-server'
        : 'exec';

    if (transport === 'app-server') {
      return await this.#executeViaAppServer(bin.path, req, emit, signal, startMs);
    }

    return await this.#executeViaExec(bin.path, req, emit, signal, startMs);
  }

  async #executeViaExec(
    binaryPath: string,
    req: StageExecutionRequest,
    emit: (ev: ExecutorEvent) => void,
    signal: AbortSignal,
    startMs: number,
  ): Promise<ExecutionOutcome> {
    const useResume = Boolean(req.resume_session_ref);
    const promptViaStdin = req.metadata?.prompt_via_stdin === true;
    const args = useResume
      ? buildCodexExecResumeArgs(req.resume_session_ref!, req, { promptViaStdin })
      : buildCodexExecArgs(req, { promptViaStdin });

    let sessionRef: string | undefined = req.resume_session_ref;
    let boundPid: number | undefined;
    const messages: string[] = [];
    const usageHolder: { value: CodexTokenUsage | null } = { value: null };
    let lastProviderError: string | undefined;

    const result = await runCodexCommandStreaming(args, {
      binaryPath,
      cwd: req.workspace_root,
      env: this.#getEnv(),
      signal,
      timeoutMs: req.timeout_ms,
      noOutputTimeoutMs: this.#options.noOutputTimeoutMs,
      commandNoProgressTimeoutMs: this.#options.commandNoProgressTimeoutMs,
      gracefulInterruptMs: this.#options.gracefulInterruptMs,
      stdin: promptViaStdin ? req.prompt : '',
      onProcessStarted: (pid) => {
        if (typeof pid === 'number') {
          boundPid = pid;
          if (sessionRef) {
            emit({ kind: 'session_bound', session_ref: sessionRef, local_pid: pid });
          }
        }
      },
      onStdoutEvent: (ev) => {
        if (ev.type === 'thread.started' && ev.threadId) {
          sessionRef = ev.threadId;
          emit({
            kind: 'session_bound',
            session_ref: ev.threadId,
            ...(boundPid !== undefined ? { local_pid: boundPid } : {}),
          });
        } else if (ev.type === 'turn.started') {
          emit({ kind: 'progress', message: 'Codex turn started', phase: 'turn' });
        } else if (ev.type === 'agent_message') {
          messages.push(ev.text);
          emit({ kind: 'text_delta', delta: ev.text });
        } else if (ev.type === 'capability_call_receipt') {
          emit(ev.receipt);
        } else if (ev.type === 'command_execution') {
          emit({
            kind: 'tool_call',
            tool_name: ev.title,
            status: ev.status === 'completed' || ev.status === 'failed' ? 'finished' : 'started',
            ...(ev.output ? { summary: ev.output.slice(0, 240) } : {}),
          });
        } else if (ev.type === 'turn.completed' && ev.usage) {
          usageHolder.value = ev.usage;
          emit({
            kind: 'usage',
            input_tokens: ev.usage.input_tokens,
            output_tokens: ev.usage.output_tokens,
            ...(ev.usage.cached_input_tokens !== null
              ? { cached_tokens: ev.usage.cached_input_tokens }
              : {}),
          });
        } else if (ev.type === 'token_count' && ev.usage) {
          usageHolder.value = ev.usage;
        } else if (ev.type === 'provider_error') {
          lastProviderError = ev.message;
        }
      },
    });

    if (result.threadId && !sessionRef) {
      sessionRef = result.threadId;
    }

    const latestUsage = usageHolder.value;
    const usage: ExecutionUsage = {
      ...(latestUsage
        ? {
            input_tokens: latestUsage.input_tokens,
            output_tokens: latestUsage.output_tokens,
            ...(latestUsage.cached_input_tokens !== null
              ? { cached_tokens: latestUsage.cached_input_tokens }
              : {}),
          }
        : {}),
      duration_ms: Date.now() - startMs,
    };

    if (result.timeoutReason === 'activity_cancelled') {
      return {
        status: 'cancelled',
        ...(sessionRef ? { session_ref: sessionRef } : {}),
        summary_text: messages.join('\n') || undefined,
        artifact_refs: [],
        usage,
        error: {
          code: 'CANCELLED',
          message: 'Codex execution was cancelled.',
          retryable: true,
        },
      };
    }

    if (result.timeoutReason) {
      const isTimeout =
        result.timeoutReason === 'total_timeout'
        || result.timeoutReason === 'no_output_timeout'
        || result.timeoutReason === 'command_no_progress_timeout';
      return {
        status: isTimeout ? 'timed_out' : 'failed',
        ...(sessionRef ? { session_ref: sessionRef } : {}),
        summary_text: messages.join('\n') || undefined,
        artifact_refs: [],
        usage,
        error: {
          code: result.timeoutReason.toUpperCase(),
          message: result.stderr.trim() || `Codex terminated with ${result.timeoutReason}.`,
          retryable: result.timeoutReason !== 'unsupported_tool_protocol',
        },
      };
    }

    if (result.exitCode !== 0) {
      return {
        status: 'failed',
        ...(sessionRef ? { session_ref: sessionRef } : {}),
        summary_text: messages.join('\n') || undefined,
        artifact_refs: [],
        usage,
        error: {
          code: 'CODEX_EXIT_NONZERO',
          message:
            lastProviderError
            || result.stderr.trim()
            || `Codex exited with status ${result.exitCode}.`,
          retryable: true,
        },
      };
    }

    return {
      status: 'succeeded',
      ...(sessionRef ? { session_ref: sessionRef } : {}),
      summary_text: messages.join('\n'),
      artifact_refs: [],
      usage,
    };
  }

  async #executeViaAppServer(
    binaryPath: string,
    req: StageExecutionRequest,
    emit: (ev: ExecutorEvent) => void,
    signal: AbortSignal,
    startMs: number,
  ): Promise<ExecutionOutcome> {
    if (signal.aborted) {
      return {
        status: 'cancelled',
        ...(req.resume_session_ref ? { session_ref: req.resume_session_ref } : {}),
        artifact_refs: [],
        usage: { duration_ms: Date.now() - startMs },
        error: { code: 'CANCELLED', message: 'Aborted by Runway', retryable: true },
      };
    }

    const messages = new Map<string, string>();
    let threadId = req.resume_session_ref;
    let activeTurnId: string | undefined;
    let startingTurn = false;
    const earlyEvents: AppServerTurnEvent[] = [];
    const observeUsage = createAppServerTurnUsage();
    let settled = false;
    let turnDoneResolve!: (res: {
      readonly state: 'completed' | 'failed' | 'cancelled' | 'timed_out';
      readonly error?: string;
      readonly errorCode?: string;
    }) => void;
    let usage: CodexTokenUsage | null = null;

    const turnDonePromise = new Promise<{
      readonly state: 'completed' | 'failed' | 'cancelled' | 'timed_out';
      readonly error?: string;
      readonly errorCode?: string;
    }>((resolve) => {
      turnDoneResolve = (res) => {
        if (settled) return;
        settled = true;
        resolve(res);
      };
    });

    const connectAbort = new AbortController();
    let client: CodexAppServerClient | null = null;
    let timeoutTimer: NodeJS.Timeout | null = null;

    const onAbort = () => {
      turnDoneResolve({ state: 'cancelled', error: 'Aborted by Runway', errorCode: 'CANCELLED' });
      connectAbort.abort();
      if (client) {
        if (threadId) {
          client.notify('turn/interrupt', { threadId });
        }
        void client.close();
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });

    if (req.timeout_ms && req.timeout_ms > 0) {
      timeoutTimer = setTimeout(() => {
        turnDoneResolve({
          state: 'timed_out',
          error: `Codex app-server timed out after ${req.timeout_ms}ms.`,
          errorCode: 'TIMED_OUT',
        });
        connectAbort.abort();
        if (client) {
          if (threadId) {
            client.notify('turn/interrupt', { threadId });
          }
          void client.close();
        }
      }, req.timeout_ms);
      timeoutTimer.unref?.();
    }

    const buildFinalUsage = (): ExecutionUsage => ({
      ...(usage
        ? {
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            ...(usage.cached_input_tokens !== null
              ? { cached_tokens: usage.cached_input_tokens }
              : {}),
          }
        : {}),
      duration_ms: Date.now() - startMs,
    });

    const formatSettledOutcome = (done: {
      readonly state: 'completed' | 'failed' | 'cancelled' | 'timed_out';
      readonly error?: string;
      readonly errorCode?: string;
    }): ExecutionOutcome => {
      const finalUsage = buildFinalUsage();
      if (done.state === 'cancelled') {
        return {
          status: 'cancelled',
          ...(threadId ? { session_ref: threadId } : {}),
          summary_text: Array.from(messages.values()).join(''),
          artifact_refs: [],
          usage: finalUsage,
          error: { code: 'CANCELLED', message: done.error ?? 'Cancelled', retryable: true },
        };
      }
      if (done.state === 'timed_out') {
        return {
          status: 'timed_out',
          ...(threadId ? { session_ref: threadId } : {}),
          summary_text: Array.from(messages.values()).join(''),
          artifact_refs: [],
          usage: finalUsage,
          error: { code: 'TIMED_OUT', message: done.error ?? 'Timed out', retryable: true },
        };
      }
      if (done.state === 'failed') {
        return {
          status: 'failed',
          ...(threadId ? { session_ref: threadId } : {}),
          summary_text: Array.from(messages.values()).join(''),
          artifact_refs: [],
          usage: finalUsage,
          error: {
            code: done.errorCode ?? 'EXECUTOR_FAILED',
            message: done.error ?? 'Failed',
            retryable: true,
          },
        };
      }
      return {
        status: 'succeeded',
        ...(threadId ? { session_ref: threadId } : {}),
        summary_text: Array.from(messages.values()).join(''),
        artifact_refs: [],
        usage: finalUsage,
      };
    };

    const applyTurnEvent = ({ turnId, event }: AppServerTurnEvent): void => {
      if (settled || turnId !== activeTurnId) return;
      switch (event.kind) {
        case 'capability_call_receipt':
          emit(event);
          break;
        case 'message': {
          const previous = messages.get(event.itemId) ?? '';
          const next = event.complete ? event.text : previous + event.text;
          messages.set(event.itemId, next);
          const delta = next.startsWith(previous) ? next.slice(previous.length) : '';
          if (delta) emit({ kind: 'text_delta', delta });
          break;
        }
        case 'usage': {
          const observed = observeUsage(event.tokenUsage);
          if (!observed) return;
          usage = observed;
          emit({
            kind: 'usage', input_tokens: observed.input_tokens, output_tokens: observed.output_tokens,
            ...(observed.cached_input_tokens !== null ? { cached_tokens: observed.cached_input_tokens } : {}),
          });
          break;
        }
        case 'terminal':
          turnDoneResolve({
            state: event.state,
            ...(event.error ? { error: event.error } : {}),
            ...(event.state === 'failed' ? { errorCode: 'APP_SERVER_FAILED' } : {}),
          });
          break;
      }
    };

    try {
      client = await CodexAppServerClient.connect({
        binaryPath,
        cwd: req.workspace_root,
        env: this.#getEnv(),
        gracefulInterruptMs: this.#options.gracefulInterruptMs,
        signal: connectAbort.signal,
        onNotification: (notification) => {
          if (settled || !threadId || notification.params.threadId !== threadId) return;
          const update = readAppServerTurnEvent(notification);
          if (!update) return;
          if (startingTurn) earlyEvents.push(update);
          else applyTurnEvent(update);
        },
        onClose: (code, err) => {
          turnDoneResolve({
            state: 'failed',
            error: err?.message ?? `Codex app-server exited unexpectedly (code=${String(code)}).`,
            errorCode: 'EXECUTOR_FAILED',
          });
        },
      });

      const sandbox = effectiveSandboxMode(req);
      const perRunConfig = appServerMcpConfig(req.mcp_servers);
      if (threadId) {
        if (!settled) {
          const resumed = await client.request('thread/resume', {
            threadId,
            cwd: req.workspace_root,
            sandbox,
            ...perRunConfig,
            ...(req.model_id ? { model: req.model_id } : {}),
          });
          if (isRecord(resumed) && typeof resumed.threadId === 'string') {
            threadId = resumed.threadId;
          } else if (isRecord(resumed) && isRecord(resumed.thread) && typeof resumed.thread.id === 'string') {
            threadId = resumed.thread.id;
          }
        }
      } else if (!settled) {
        const started = await client.request('thread/start', {
          cwd: req.workspace_root,
          sandbox,
          ...perRunConfig,
          ...(req.model_id ? { model: req.model_id } : {}),
        });
        if (isRecord(started) && typeof started.threadId === 'string') {
          threadId = started.threadId;
        } else if (isRecord(started) && isRecord(started.thread) && typeof started.thread.id === 'string') {
          threadId = started.thread.id;
        }
      }

      if (threadId && !settled) {
        emit({
          kind: 'session_bound',
          session_ref: threadId,
          ...(client.pid !== undefined ? { local_pid: client.pid } : {}),
        });
      }

      if (!settled) {
        startingTurn = true;
        const started = await client.request('turn/start', {
          threadId,
          input: [{ type: 'text', text: req.prompt }],
        });
        startingTurn = false;
        if (isRecord(started) && isRecord(started.turn) && typeof started.turn.id === 'string') {
          activeTurnId = started.turn.id;
        }
        if (!activeTurnId) throw new Error('Codex app-server turn/start omitted the turn ID.');
        for (const update of earlyEvents) applyTurnEvent(update);
        earlyEvents.length = 0;
      }

      const done = await turnDonePromise;
      return formatSettledOutcome(done);
    } catch (error) {
      if (settled) {
        const done = await turnDonePromise;
        return formatSettledOutcome(done);
      }
      return {
        status: 'failed',
        ...(threadId ? { session_ref: threadId } : {}),
        summary_text: Array.from(messages.values()).join(''),
        artifact_refs: [],
        usage: buildFinalUsage(),
        error: {
          code: 'EXECUTOR_FAILED',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
      };
    } finally {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      signal.removeEventListener('abort', onAbort);
      if (client) {
        await client.close();
      }
    }
  }

  async reconcile(ref: ExecutorReconcileRef): Promise<ReconcileResult> {
    if (ref.local_pid && isProcessAlive(ref.local_pid)) {
      return { state: 'still_running' };
    }

    const recovered = recoverCodexExecOutputFromSession(ref.session_ref, this.#getEnv());
    if (!recovered) {
      return { state: 'lost' };
    }

    const analyzed = analyzeCodexSessionJsonl(recovered.output);
    const usage = analyzed.usage
      ? {
          input_tokens: analyzed.usage.input_tokens,
          output_tokens: analyzed.usage.output_tokens,
          ...(analyzed.usage.cached_input_tokens !== null
            ? { cached_tokens: analyzed.usage.cached_input_tokens }
            : {}),
          duration_ms: 0,
        }
      : undefined;

    if (analyzed.completed && !analyzed.failed) {
      return {
        state: 'completed',
        outcome: {
          status: 'succeeded',
          session_ref: recovered.threadId,
          summary_text: analyzed.finalMessage,
          artifact_refs: [],
          ...(usage ? { usage } : {}),
        },
      };
    }

    if (analyzed.failed) {
      return {
        state: 'failed',
        outcome: {
          status: 'failed',
          session_ref: recovered.threadId,
          summary_text: analyzed.finalMessage || undefined,
          artifact_refs: [],
          ...(usage ? { usage } : {}),
          error: {
            code: 'CODEX_SESSION_FAILED',
            message: analyzed.failureMessage ?? 'Codex session failed before completion.',
            retryable: true,
          },
        },
      };
    }

    return { state: 'lost' };
  }
}
