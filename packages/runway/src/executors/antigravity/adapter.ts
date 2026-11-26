import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isProcessAlive } from '@opl/core';
import {
  attachLineBuffer,
  terminateProcessGroup,
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
import { buildAgyArgs, buildAgyEphemeralSettingsPayload } from './args.ts';
import { parseAgyModelsOutput, resolveAgyBinary } from './binary.ts';
import { parseAgyStreamJsonLine, type AgyUsageTotals } from './events.ts';

export interface AntigravityExecutorAdapterOptions {
  readonly binaryPath?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly gracefulInterruptMs?: number;
  readonly spoolDir?: string;
}

export class AntigravityExecutorAdapter implements ExecutorAdapter {
  readonly #options: AntigravityExecutorAdapterOptions;

  readonly capabilities: ExecutorCapabilities = {
    executor_id: 'antigravity',
    display_name: 'Antigravity CLI (Gemini 4 Neon & Multi-Model)',
    supports_streaming: true,
    supports_session_resume: true,
    supports_reconcile_after_restart: true,
    supports_mcp_tools: true,
    supports_sandbox_modes: ['read-only', 'workspace-write', 'danger-full-access'],
    models: [
      { id: 'gemini-4-neon-xhigh', label: 'Gemini 4 Neon (XHigh)', default: true },
      { id: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)' },
      { id: 'gemini-4-neon-medium', label: 'Gemini 4 Neon (Medium)' },
      { id: 'gemini-4-neon-low', label: 'Gemini 4 Neon (Low)' },
      { id: 'claude-opus-5-5-high', label: 'Claude Opus 5.5 (High)' },
      { id: 'claude-sonnet-5-5-high', label: 'Claude Sonnet 5.5 (High)' },
    ],
  };

  constructor(options: AntigravityExecutorAdapterOptions = {}) {
    this.#options = options;
  }

  #getEnv(): NodeJS.ProcessEnv {
    return this.#options.env ?? process.env;
  }

  #getSpoolDir(): string {
    if (this.#options.spoolDir) return this.#options.spoolDir;
    const stateDir = this.#getEnv().OPL_STATE_DIR?.trim();
    if (stateDir) return path.join(stateDir, 'runway', 'spools');
    return path.join(os.tmpdir(), 'opl-runway-spools');
  }

  #spoolPathForAttempt(attemptId: string): string {
    const safe = attemptId.replace(/[^A-Za-z0-9._-]/g, '_');
    return path.join(this.#getSpoolDir(), `${safe}.ndjson`);
  }

  async healthCheck(): Promise<ExecutorHealthStatus> {
    let bin;
    try {
      bin = resolveAgyBinary(this.#options.binaryPath, this.#getEnv());
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
    if (!bin) {
      return { available: false, reason: 'agy_binary_not_found' };
    }

    const v = spawnSync(bin.path, ['--version'], {
      encoding: 'utf8',
      timeout: 5_000,
      env: this.#getEnv(),
    });
    if (v.status !== 0 || v.error) {
      return {
        available: false,
        reason: v.stderr?.trim() || v.error?.message || 'agy_version_failed',
      };
    }

    const m = spawnSync(bin.path, ['models'], {
      encoding: 'utf8',
      timeout: 10_000,
      env: this.#getEnv(),
    });
    const parsedModels = m.status === 0 ? parseAgyModelsOutput(m.stdout ?? '') : [];
    return {
      available: true,
      version: v.stdout.trim(),
      models:
        parsedModels.length > 0
          ? parsedModels.map((item) => item.id)
          : this.capabilities.models.map((item) => item.id),
    };
  }

  async execute(
    req: StageExecutionRequest,
    emit: (ev: ExecutorEvent) => void,
    signal: AbortSignal,
  ): Promise<ExecutionOutcome> {
    const startMs = Date.now();
    const bin = resolveAgyBinary(this.#options.binaryPath, this.#getEnv());
    if (!bin) {
      return {
        status: 'failed',
        artifact_refs: [],
        usage: { duration_ms: Date.now() - startMs },
        error: {
          code: 'EXECUTOR_UNAVAILABLE',
          message: 'Antigravity binary (agy) not found.',
          retryable: false,
        },
      };
    }

    const settingsPayload = buildAgyEphemeralSettingsPayload(req);
    let ephemeralSettingsPath: string | undefined;
    let spoolFd: number | undefined;

    try {
      if (settingsPayload) {
        ephemeralSettingsPath = path.join(
          os.tmpdir(),
          `opl-agy-settings-${req.attempt_id.replace(/[^A-Za-z0-9_-]/g, '_')}-${crypto.randomBytes(6).toString('hex')}.json`,
        );
        fs.writeFileSync(ephemeralSettingsPath, JSON.stringify(settingsPayload, null, 2), {
          mode: 0o600,
        });
      }

      const spoolPath = this.#spoolPathForAttempt(req.attempt_id);
      fs.mkdirSync(path.dirname(spoolPath), { recursive: true });
      const activeSpoolFd = fs.openSync(spoolPath, 'a', 0o600);
      spoolFd = activeSpoolFd;

      const args = buildAgyArgs(req, { ephemeralSettingsPath });
      const graceMs = this.#options.gracefulInterruptMs ?? 10_000;
      const effectiveEnv = this.#getEnv();

      return await new Promise<ExecutionOutcome>((resolve, reject) => {
        const child = spawn(bin.path, args, {
          cwd: req.workspace_root,
          env: effectiveEnv,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let sessionRef = req.resume_session_ref;
        let boundEmitted = false;
        const textChunks: string[] = [];
        let finalResultText: string | undefined;
        let lastUsage: AgyUsageTotals | undefined;
        let streamError: string | undefined;
        let humanGateReq:
          | { readonly question: string; readonly options?: readonly string[] }
          | undefined;
        let stderr = '';
        let completed = false;
        let aborted = false;
        let timedOut = false;
        let timeoutTimer: NodeJS.Timeout | null = null;

        const clearTimers = () => {
          if (timeoutTimer) {
            clearTimeout(timeoutTimer);
            timeoutTimer = null;
          }
        };

        const terminateAndResolve = async (status: 'cancelled' | 'timed_out', msg: string) => {
          if (completed) return;
          completed = true;
          signal.removeEventListener('abort', onAbort);
          clearTimers();
          await terminateProcessGroup(child.pid, graceMs);
          resolve({
            status,
            ...(sessionRef ? { session_ref: sessionRef } : {}),
            summary_text: finalResultText ?? (textChunks.join('') || undefined),
            artifact_refs: [],
            usage: {
              ...lastUsage,
              duration_ms: Date.now() - startMs,
            },
            error: {
              code: status === 'cancelled' ? 'CANCELLED' : 'TIMED_OUT',
              message: msg,
              retryable: true,
            },
          });
        };

        const onAbort = () => {
          aborted = true;
          void terminateAndResolve('cancelled', 'Antigravity execution was cancelled.');
        };

        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }

        if (!completed && req.timeout_ms && req.timeout_ms > 0) {
          timeoutTimer = setTimeout(() => {
            timedOut = true;
            void terminateAndResolve(
              'timed_out',
              `Antigravity execution timed out after ${req.timeout_ms}ms.`,
            );
          }, req.timeout_ms);
          timeoutTimer.unref?.();
        }

        const flushStdout = attachLineBuffer(child.stdout, (line) => {
          try {
            if (spoolFd !== undefined) {
              fs.writeSync(spoolFd, `${line}\n`);
            }
          } catch {
            // Best-effort spooling
          }
          const parsed = parseAgyStreamJsonLine(line);
          if (!parsed) return;

          if (parsed.sessionRef) {
            sessionRef = parsed.sessionRef;
            if (!boundEmitted) {
              boundEmitted = true;
              emit({
                kind: 'session_bound',
                session_ref: sessionRef,
                ...(typeof child.pid === 'number' ? { local_pid: child.pid } : {}),
              });
            }
          }

          for (const ev of parsed.events) {
            if (ev.kind === 'session_bound' && boundEmitted) continue;
            if (ev.kind === 'text_delta') textChunks.push(ev.delta);
            if (ev.kind === 'human_gate_requested') {
              humanGateReq = { question: ev.question, options: ev.options };
            }
            emit(ev);
          }

          if (parsed.usage) {
            lastUsage = parsed.usage;
          }
          if (parsed.finalText !== undefined) {
            finalResultText = parsed.finalText;
          }
          if (parsed.isError && parsed.errorMessage) {
            streamError = parsed.errorMessage;
          }
        });

        const flushStderr = attachLineBuffer(child.stderr, (line) => {
          stderr += `${line}\n`;
        });

        child.once('error', (error) => {
          if (completed) return;
          completed = true;
          signal.removeEventListener('abort', onAbort);
          clearTimers();
          reject(error);
        });

        child.once('close', (code) => {
          if (completed) return;
          completed = true;
          signal.removeEventListener('abort', onAbort);
          clearTimers();
          flushStdout();
          flushStderr();

          const usage: ExecutionUsage = {
            ...lastUsage,
            duration_ms: Date.now() - startMs,
          };

          if (aborted) {
            resolve({
              status: 'cancelled',
              ...(sessionRef ? { session_ref: sessionRef } : {}),
              summary_text: finalResultText ?? (textChunks.join('') || undefined),
              artifact_refs: [],
              usage,
              error: { code: 'CANCELLED', message: 'Cancelled', retryable: true },
            });
            return;
          }
          if (timedOut) {
            resolve({
              status: 'timed_out',
              ...(sessionRef ? { session_ref: sessionRef } : {}),
              summary_text: finalResultText ?? (textChunks.join('') || undefined),
              artifact_refs: [],
              usage,
              error: { code: 'TIMED_OUT', message: 'Timed out', retryable: true },
            });
            return;
          }
          if (humanGateReq) {
            resolve({
              status: 'human_gate',
              ...(sessionRef ? { session_ref: sessionRef } : {}),
              summary_text: finalResultText ?? textChunks.join(''),
              artifact_refs: [],
              usage,
              human_gate: humanGateReq,
            });
            return;
          }
          if (code !== 0 || streamError) {
            resolve({
              status: 'failed',
              ...(sessionRef ? { session_ref: sessionRef } : {}),
              summary_text: finalResultText ?? (textChunks.join('') || undefined),
              artifact_refs: [],
              usage,
              error: {
                code: 'AGY_EXIT_NONZERO',
                message: streamError || stderr.trim() || `agy exited with status ${String(code)}.`,
                retryable: true,
              },
            });
            return;
          }

          resolve({
            status: 'succeeded',
            ...(sessionRef ? { session_ref: sessionRef } : {}),
            summary_text: finalResultText ?? textChunks.join(''),
            artifact_refs: [],
            usage,
          });
        });
      });
    } finally {
      if (spoolFd !== undefined) {
        try {
          fs.closeSync(spoolFd);
        } catch {
          // ignore
        }
      }
      if (ephemeralSettingsPath) {
        fs.rmSync(ephemeralSettingsPath, { force: true });
      }
    }
  }

  async reconcile(ref: ExecutorReconcileRef): Promise<ReconcileResult> {
    if (ref.local_pid && isProcessAlive(ref.local_pid)) {
      return { state: 'still_running' };
    }

    const spoolPath = this.#spoolPathForAttempt(ref.attempt_id);
    if (!fs.existsSync(spoolPath)) {
      return { state: 'lost' };
    }

    const raw = fs.readFileSync(spoolPath, 'utf8');
    let sessionRef = ref.session_ref;
    const chunks: string[] = [];
    let finalText: string | undefined;
    let lastUsage: AgyUsageTotals | undefined;
    let seenSuccessResult = false;
    let seenError: string | undefined;

    for (const line of raw.split(/\r?\n/)) {
      const parsed = parseAgyStreamJsonLine(line);
      if (!parsed) continue;
      if (parsed.sessionRef) sessionRef = parsed.sessionRef;
      for (const ev of parsed.events) {
        if (ev.kind === 'text_delta') chunks.push(ev.delta);
      }
      if (parsed.usage) lastUsage = parsed.usage;
      if (parsed.finalText !== undefined) finalText = parsed.finalText;
      if (parsed.isResult && !parsed.isError) {
        seenSuccessResult = true;
      }
      if (parsed.isError && parsed.errorMessage) {
        seenError = parsed.errorMessage;
      }
    }

    const usage: ExecutionUsage | undefined = lastUsage
      ? { ...lastUsage, duration_ms: 0 }
      : undefined;

    if (seenSuccessResult && !seenError) {
      return {
        state: 'completed',
        outcome: {
          status: 'succeeded',
          ...(sessionRef ? { session_ref: sessionRef } : {}),
          summary_text: finalText ?? chunks.join(''),
          artifact_refs: [],
          ...(usage ? { usage } : {}),
        },
      };
    }

    if (seenError) {
      return {
        state: 'failed',
        outcome: {
          status: 'failed',
          ...(sessionRef ? { session_ref: sessionRef } : {}),
          summary_text: finalText ?? (chunks.join('') || undefined),
          artifact_refs: [],
          ...(usage ? { usage } : {}),
          error: {
            code: 'AGY_SPOOL_ERROR',
            message: seenError,
            retryable: true,
          },
        },
      };
    }

    return { state: 'lost' };
  }
}
