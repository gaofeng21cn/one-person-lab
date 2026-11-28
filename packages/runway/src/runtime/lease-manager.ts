import { isProcessAlive } from '@opl/core';
import { terminateProcessGroup } from '../executors/spi.ts';
import type { RunwayStore } from '../store/spi.ts';
import type { RunningAttemptContext } from '../types.ts';

export interface LeaseManagerOptions {
  readonly store: RunwayStore;
  readonly heartbeatIntervalMs?: number;
  readonly leaseTtlMs?: number;
  readonly expirySweepIntervalMs?: number;
  readonly gracefulInterruptMs?: number;
  readonly now?: () => Date;
}

export interface ActiveAttemptHandle {
  readonly attemptId: string;
  readonly stageRunId: string;
  readonly taskId: string;
  readonly executorId: string;
  readonly controller: AbortController;
  readonly hasInProcessRunner: boolean;
  detached: boolean;
  localPid?: number;
  sessionRef?: string;
  heartbeatTimer?: NodeJS.Timeout;
  onDispose?: () => void;
  completionPromise?: Promise<unknown>;
  resolveDone?: () => void;
  donePromise: Promise<void>;
}

export class LeaseManager {
  readonly #store: RunwayStore;
  readonly #heartbeatIntervalMs: number;
  readonly #leaseTtlMs: number;
  readonly #expirySweepIntervalMs: number;
  readonly #gracefulInterruptMs: number;
  readonly #now: () => Date;
  readonly #active = new Map<string, ActiveAttemptHandle>();
  #sweepTimer: NodeJS.Timeout | null = null;
  #sweepArmed = false;
  #onExpired: ((ctx: RunningAttemptContext) => Promise<void>) | null = null;
  #sweeping = false;

  constructor(options: LeaseManagerOptions) {
    this.#store = options.store;
    this.#heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;
    this.#leaseTtlMs = options.leaseTtlMs ?? 60_000;
    this.#expirySweepIntervalMs = options.expirySweepIntervalMs ?? 15_000;
    this.#gracefulInterruptMs = options.gracefulInterruptMs ?? 10_000;
    this.#now = options.now ?? (() => new Date());
  }

  get leaseTtlMs(): number {
    return this.#leaseTtlMs;
  }

  get gracefulInterruptMs(): number {
    return this.#gracefulInterruptMs;
  }

  nextLeaseExpiryIso(fromDate: Date = this.#now()): string {
    return new Date(fromDate.getTime() + this.#leaseTtlMs).toISOString();
  }

  isTracked(attemptId: string): boolean {
    return this.#active.has(attemptId);
  }

  getActiveHandle(attemptId: string): ActiveAttemptHandle | undefined {
    return this.#active.get(attemptId);
  }

  listActiveAttemptIds(): string[] {
    return [...this.#active.keys()];
  }

  get hasActiveSweepTimer(): boolean {
    return this.#sweepTimer !== null;
  }

  register(params: {
    readonly attemptId: string;
    readonly stageRunId: string;
    readonly taskId: string;
    readonly executorId: string;
    readonly controller?: AbortController;
    readonly localPid?: number;
    readonly sessionRef?: string;
    readonly hasInProcessRunner?: boolean;
  }): ActiveAttemptHandle {
    this.unregister(params.attemptId);

    let resolveDone!: () => void;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    const handle: ActiveAttemptHandle = {
      attemptId: params.attemptId,
      stageRunId: params.stageRunId,
      taskId: params.taskId,
      executorId: params.executorId,
      controller: params.controller ?? new AbortController(),
      hasInProcessRunner: params.hasInProcessRunner ?? true,
      detached: false,
      localPid: params.localPid,
      sessionRef: params.sessionRef,
      donePromise,
      resolveDone,
    };

    const timer = setInterval(() => {
      try {
        this.#store.renewAttemptLease(params.attemptId, this.nextLeaseExpiryIso());
      } catch {
        // Attempt may have finished or DB closed during shutdown
      }
    }, this.#heartbeatIntervalMs);
    timer.unref?.();
    handle.heartbeatTimer = timer;

    this.#active.set(params.attemptId, handle);
    this.wakeExpirySweep();
    return handle;
  }

  updateSessionBinding(
    attemptId: string,
    binding: { readonly sessionRef?: string | null; readonly localPid?: number | null },
  ): void {
    const handle = this.#active.get(attemptId);
    if (handle) {
      if (binding.sessionRef !== undefined && binding.sessionRef !== null) {
        handle.sessionRef = binding.sessionRef;
      }
      if (binding.localPid !== undefined && binding.localPid !== null) {
        handle.localPid = binding.localPid;
      }
    }
    this.#store.bindAttemptSession({
      attempt_id: attemptId,
      executor_session_ref: binding.sessionRef,
      local_pid: binding.localPid,
    });
  }

  unregister(attemptId: string): void {
    const handle = this.#active.get(attemptId);
    if (!handle) return;
    if (handle.heartbeatTimer) {
      clearInterval(handle.heartbeatTimer);
      handle.heartbeatTimer = undefined;
    }
    try {
      handle.onDispose?.();
    } catch {
      // ignore cleanup failures
    }
    handle.onDispose = undefined;
    this.#active.delete(attemptId);
    handle.resolveDone?.();
  }

  async interruptAttempt(attemptId: string, reason: string): Promise<boolean> {
    const handle = this.#active.get(attemptId);
    if (!handle) {
      const att = this.#store.getAttempt(attemptId);
      if (att.local_pid && isProcessAlive(att.local_pid)) {
        await terminateProcessGroup(att.local_pid, this.#gracefulInterruptMs);
        return true;
      }
      return false;
    }

    if (!handle.controller.signal.aborted) {
      handle.controller.abort(new Error(reason));
    }

    if (!handle.hasInProcessRunner) {
      if (handle.localPid && isProcessAlive(handle.localPid)) {
        await terminateProcessGroup(handle.localPid, this.#gracefulInterruptMs);
      }
      this.unregister(attemptId);
      return true;
    }

    let timeoutHandle: NodeJS.Timeout | undefined;
    const gracePromise = new Promise<'grace_expired'>((resolve) => {
      timeoutHandle = setTimeout(() => resolve('grace_expired'), this.#gracefulInterruptMs);
    });

    const winner = await Promise.race([
      handle.donePromise.then(() => 'completed' as const),
      gracePromise,
    ]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    if (winner === 'grace_expired' && handle.localPid && isProcessAlive(handle.localPid)) {
      await terminateProcessGroup(handle.localPid, 0);
    }

    return true;
  }

  async interruptTask(taskId: string, reason: string): Promise<number> {
    const matching = [...this.#active.values()]
      .filter((h) => h.taskId === taskId)
      .map((h) => h.attemptId);
    let interrupted = 0;
    for (const attemptId of matching) {
      if (await this.interruptAttempt(attemptId, reason)) {
        interrupted += 1;
      }
    }
    return interrupted;
  }

  #clearSweepTimer(): void {
    if (this.#sweepTimer) {
      clearInterval(this.#sweepTimer);
      this.#sweepTimer = null;
    }
  }

  wakeExpirySweep(): void {
    if (!this.#sweepArmed || !this.#onExpired || this.#sweepTimer) return;
    let hasRunning = this.#active.size > 0;
    if (!hasRunning) {
      try {
        hasRunning = this.#store.listRunningAttemptsWithContext().length > 0;
      } catch {
        return;
      }
    }
    if (!hasRunning) return;

    const onExpired = this.#onExpired;
    this.#sweepTimer = setInterval(() => {
      if (this.#sweeping) return;
      this.#sweeping = true;
      void (async () => {
        try {
          const expired = this.#store.listExpiredRunningAttempts(this.#now().toISOString());
          for (const ctx of expired) {
            if (this.#active.has(ctx.attempt_id)) continue;
            await onExpired(ctx);
          }
        } finally {
          this.#sweeping = false;
          try {
            if (this.#active.size === 0 && this.#store.listRunningAttemptsWithContext().length === 0) {
              this.#clearSweepTimer();
            }
          } catch {
            // DB may close during shutdown
          }
        }
      })();
    }, this.#expirySweepIntervalMs);
    this.#sweepTimer.unref?.();
  }

  startExpirySweep(
    onExpired: (ctx: RunningAttemptContext) => Promise<void>,
  ): void {
    this.#clearSweepTimer();
    this.#onExpired = onExpired;
    this.#sweepArmed = true;
    this.wakeExpirySweep();
  }

  stopExpirySweep(): void {
    this.#sweepArmed = false;
    this.#onExpired = null;
    this.#clearSweepTimer();
  }

  /**
   * Stops local timers and detaches handles without killing running child processes,
   * preserving long-running tasks across opld restarts.
   */
  detachAll(): void {
    this.stopExpirySweep();
    for (const handle of this.#active.values()) {
      handle.detached = true;
      if (handle.heartbeatTimer) {
        clearInterval(handle.heartbeatTimer);
        handle.heartbeatTimer = undefined;
      }
      try {
        handle.onDispose?.();
      } catch {
        // ignore cleanup failures
      }
      handle.onDispose = undefined;
      handle.resolveDone?.();
    }
    this.#active.clear();
  }
}
