import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { isRecord } from '@opl/core';
import { RunwayError } from '../../errors.ts';
import { attachLineBuffer, terminateProcessGroup } from '../spi.ts';

export interface CodexAppServerNotification {
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface CodexAppServerClientOptions {
  readonly binaryPath: string;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly requestTimeoutMs?: number;
  readonly gracefulInterruptMs?: number;
  readonly signal?: AbortSignal;
  readonly onNotification?: (notification: CodexAppServerNotification) => void;
  readonly onClose?: (code: number | null, error?: Error) => void;
}

interface PendingRpcRequest {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

export class CodexAppServerClient {
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #requestTimeoutMs: number;
  readonly #gracefulInterruptMs: number;
  readonly #pending = new Map<number, PendingRpcRequest>();
  readonly #onNotification?: (notification: CodexAppServerNotification) => void;
  readonly #onClose?: (code: number | null, error?: Error) => void;
  readonly #flushStdout: () => string;
  #nextId = 1;
  #initialized = false;
  #closed = false;
  #closeNotified = false;
  #closePromise: Promise<void> | null = null;

  private constructor(
    child: ChildProcessWithoutNullStreams,
    options: CodexAppServerClientOptions,
  ) {
    this.#child = child;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? 15_000;
    this.#gracefulInterruptMs = options.gracefulInterruptMs ?? 10_000;
    this.#onNotification = options.onNotification;
    this.#onClose = options.onClose;

    this.#flushStdout = attachLineBuffer(child.stdout, (line) => {
      this.#handleLine(line);
    });

    child.stderr.resume();
    child.stdin.on('error', () => {
      // Handled via close/pending rejections
    });
    child.once('error', (error) => {
      const err = new RunwayError(
        'EXECUTOR_FAILED',
        `Codex app-server error: ${error.message}`,
        {},
        { cause: error },
      );
      this.#closed = true;
      this.#failAllPending(err);
      this.#notifyClosed(null, err);
    });
    child.once('close', (code) => {
      this.#closed = true;
      this.#flushStdout();
      const err = new RunwayError(
        'EXECUTOR_FAILED',
        `Codex app-server exited (code=${String(code)}).`,
        { exit_code: code },
      );
      this.#failAllPending(err);
      this.#notifyClosed(code, err);
    });
  }

  get pid(): number | undefined {
    return this.#child.pid;
  }

  static async connect(options: CodexAppServerClientOptions): Promise<CodexAppServerClient> {
    if (options.signal?.aborted) {
      throw new RunwayError('EXECUTOR_FAILED', 'Codex app-server connection aborted.');
    }
    const child = spawn(options.binaryPath, ['app-server', '--stdio'], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const client = new CodexAppServerClient(child, options);
    const onAbort = () => {
      void client.close();
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });
    try {
      if (options.signal?.aborted) {
        throw new RunwayError('EXECUTOR_FAILED', 'Codex app-server connection aborted.');
      }
      await client.initialize();
      return client;
    } catch (error) {
      await client.close();
      throw error;
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  async initialize(): Promise<unknown> {
    if (this.#initialized) return null;
    const res = await this.request('initialize', {
      clientInfo: { name: 'opl_runway_codex', version: '2.0.0' },
    });
    this.notify('initialized', {});
    this.#initialized = true;
    return res;
  }

  notify(method: string, params: Record<string, unknown> = {}): void {
    if (this.#closed || this.#child.stdin.destroyed) return;
    this.#child.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.#closed) {
      return Promise.reject(
        new RunwayError('EXECUTOR_FAILED', `Cannot send '${method}' after app-server closed.`),
      );
    }
    const id = this.#nextId;
    this.#nextId += 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new RunwayError(
            'EXECUTOR_FAILED',
            `Codex app-server request '${method}' timed out after ${this.#requestTimeoutMs}ms.`,
            { method, timeout_ms: this.#requestTimeoutMs },
          ),
        );
      }, this.#requestTimeoutMs);
      timer.unref?.();

      this.#pending.set(id, { resolve, reject, timer });
      this.#child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closePromise = (async () => {
      this.#closed = true;
      this.#failAllPending(
        new RunwayError('EXECUTOR_FAILED', 'Codex app-server client closed.'),
      );
      try {
        this.#child.stdin.end();
      } catch {
        // ignore
      }
      await terminateProcessGroup(this.#child.pid, this.#gracefulInterruptMs);
    })();
    return this.#closePromise;
  }

  #notifyClosed(code: number | null, error?: Error): void {
    if (this.#closeNotified) return;
    this.#closeNotified = true;
    this.#onClose?.(code, error);
  }

  #failAllPending(err: Error): void {
    for (const [id, entry] of this.#pending.entries()) {
      clearTimeout(entry.timer);
      this.#pending.delete(id);
      entry.reject(err);
    }
  }

  #handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let frame: unknown;
    try {
      frame = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (!isRecord(frame)) return;

    if (typeof frame.id === 'number') {
      const pending = this.#pending.get(frame.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(frame.id);
      if (isRecord(frame.error)) {
        const msg =
          typeof frame.error.message === 'string'
            ? frame.error.message
            : 'Codex app-server RPC error';
        pending.reject(
          new RunwayError('EXECUTOR_FAILED', msg, { rpc_error: frame.error }),
        );
      } else {
        pending.resolve(frame.result);
      }
      return;
    }

    if (typeof frame.method === 'string') {
      this.#onNotification?.({
        method: frame.method,
        params: isRecord(frame.params) ? frame.params : {},
      });
    }
  }
}
