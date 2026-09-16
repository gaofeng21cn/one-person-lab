import { spawn } from 'node:child_process';

export class EnvironmentInterruptedError extends Error {
  exitCode: number;
  phase: string;
  reason: string;
  constructor(exitCode: number, phase: string, reason: string) {
    super(`Environment ${phase} interrupted: ${reason}.`);
    this.exitCode = exitCode; this.phase = phase; this.reason = reason;
  }
}

/** One cancellation/deadline owner for an entire preparation or execution. */
export class EnvironmentOperation {
  readonly controller = new AbortController();
  readonly started = performance.now();
  phase = 'dependency_validation';
  lockWaitMs = 0;
  private timer?: NodeJS.Timeout;
  private interrupt = () => this.cancel('SIGINT', 130);
  private terminate = () => this.cancel('SIGTERM', 143);

  constructor(timeoutMs?: number) {
    if (timeoutMs !== undefined && (!Number.isFinite(timeoutMs) || timeoutMs <= 0)) throw new Error('Environment timeout must be positive.');
    process.on('SIGINT', this.interrupt);
    process.on('SIGTERM', this.terminate);
    if (timeoutMs) this.timer = setTimeout(() => this.cancel('timeout', 124), timeoutMs);
  }
  cancel(reason: string, code: number) {
    if (!this.controller.signal.aborted) this.controller.abort(new EnvironmentInterruptedError(code, this.phase, reason));
  }
  check() { this.controller.signal.throwIfAborted(); }
  close() {
    clearTimeout(this.timer);
    process.off('SIGINT', this.interrupt);
    process.off('SIGTERM', this.terminate);
  }
}

export async function runEnvironmentProcess(command: string, args: string[], options: {
  env?: NodeJS.ProcessEnv; cwd?: string; operation?: EnvironmentOperation;
  stdio?: 'inherit'; encoding?: string; maxBuffer?: number;
} = {}) {
  const operation = options.operation;
  operation?.check();
  return await new Promise<{ status: number; stdout: string; stderr: string; signal: string | null }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd, env: options.env, stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '', stderr = '';
    let killTimer: NodeJS.Timeout | undefined;
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (child.pid && process.platform !== 'win32') process.kill(-child.pid, signal);
        else if (child.pid && signal === 'SIGKILL') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on('error', () => child.kill(signal));
        else child.kill(signal);
      } catch { /* Already exited. */ }
    };
    const abort = () => {
      const reason = operation?.controller.signal.reason as EnvironmentInterruptedError;
      kill(reason?.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM');
      killTimer ??= setTimeout(() => kill('SIGKILL'), 2000);
    };
    operation?.controller.signal.addEventListener('abort', abort, { once: true });
    child.stdout?.on('data', (chunk) => { stdout = (stdout + chunk.toString()).slice(-(options.maxBuffer ?? 16 * 1024 * 1024)); });
    child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-32768); });
    let spawnError: Error | undefined;
    child.once('error', (error) => { spawnError = error; });
    child.once('close', (code, signal) => {
      if (operation?.controller.signal.aborted) kill('SIGKILL');
      clearTimeout(killTimer);
      operation?.controller.signal.removeEventListener('abort', abort);
      if (operation?.controller.signal.aborted) reject(operation.controller.signal.reason);
      else resolve({ status: spawnError ? 127 : code ?? 1, stdout, stderr: spawnError?.message ?? stderr, signal });
    });
    if (operation?.controller.signal.aborted) abort();
  });
}
