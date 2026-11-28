import type { RunwayStore } from '../store/spi.ts';
import type { ScheduleTickOutcome } from '../types.ts';
import { computeNextCronTime } from './cron.ts';

export interface ScheduleRunnerOptions {
  readonly store: RunwayStore;
  readonly tickIntervalMs?: number;
  readonly now?: () => Date;
  readonly onCancelTask?: (taskId: string, reason: string) => Promise<void> | void;
  readonly onTaskLaunched?: (taskId: string, scheduleId: string) => Promise<void> | void;
}

export class ScheduleRunner {
  readonly #store: RunwayStore;
  readonly #tickIntervalMs: number;
  readonly #now: () => Date;
  readonly #onCancelTask?: (taskId: string, reason: string) => Promise<void> | void;
  readonly #onTaskLaunched?: (taskId: string, scheduleId: string) => Promise<void> | void;
  #timer: NodeJS.Timeout | null = null;
  #armed = false;
  #ticking = false;
  #inScheduledTick = false;
  #tickFailed = false;

  constructor(options: ScheduleRunnerOptions) {
    this.#store = options.store;
    this.#tickIntervalMs = options.tickIntervalMs ?? 1_000;
    this.#now = options.now ?? (() => new Date());
    this.#onCancelTask = options.onCancelTask;
    this.#onTaskLaunched = options.onTaskLaunched;
  }

  get running(): boolean {
    return this.#armed;
  }

  get hasActiveTimer(): boolean {
    return this.#timer !== null;
  }

  getHealth() {
    return {
      status: !this.running ? 'stopped' : this.#tickFailed ? 'degraded' : 'running',
      schedule_runner: { running: this.running, tick_interval_ms: this.#tickIntervalMs },
    };
  }

  async tickOnce(nowOverride?: Date): Promise<ScheduleTickOutcome[]> {
    const nowDate = nowOverride ?? this.#now();
    const outcomes = this.#store.tickDueSchedulesAtomic(
      nowDate.toISOString(),
      computeNextCronTime,
    );

    const callbackErrors: unknown[] = [];
    for (const outcome of outcomes) {
      const cancelledIds =
        outcome.cancelled_task_ids
        ?? (outcome.cancelled_task_id ? [outcome.cancelled_task_id] : []);
      if (this.#onCancelTask) {
        for (const cancelledId of cancelledIds) {
          try {
            await this.#onCancelTask(
              cancelledId,
              `cancelled_by_schedule_overlap:${outcome.schedule_id}`,
            );
          } catch (error) {
            callbackErrors.push(error);
          }
        }
      }
      if (outcome.created_task_id && this.#onTaskLaunched) {
        try {
          await this.#onTaskLaunched(outcome.created_task_id, outcome.schedule_id);
        } catch (error) {
          callbackErrors.push(error);
        }
      }
    }

    this.#tickFailed = callbackErrors.length > 0;
    if (this.#tickFailed && !this.#inScheduledTick) {
      throw callbackErrors[0];
    }
    return outcomes;
  }

  #clearTimer(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  #armNextTimer(): void {
    this.#clearTimer();
    if (!this.#armed) return;

    let active;
    try {
      active = this.#store.listSchedules().filter((s) => s.enabled === 1 || s.buffered_pending > 0);
    } catch {
      return;
    }
    if (active.length === 0) return;

    const nowMs = this.#now().getTime();
    const maxWaitMs = Math.max(this.#tickIntervalMs, 60_000);
    let delayMs = maxWaitMs;
    for (const schedule of active) {
      if (schedule.buffered_pending > 0) {
        delayMs = Math.min(delayMs, this.#tickIntervalMs);
        continue;
      }
      const dueMs = Date.parse(schedule.next_run_at);
      if (!Number.isFinite(dueMs)) {
        delayMs = Math.min(delayMs, this.#tickIntervalMs);
        continue;
      }
      delayMs = Math.min(delayMs, Math.max(this.#tickIntervalMs, dueMs - nowMs));
    }

    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (!this.#armed || this.#ticking) return;
      this.#ticking = true;
      this.#inScheduledTick = true;
      void this.tickOnce()
        .catch(() => {
          this.#tickFailed = true;
        })
        .finally(() => {
          this.#inScheduledTick = false;
          this.#ticking = false;
          if (this.#armed) {
            this.#armNextTimer();
          }
        });
    }, delayMs);
    this.#timer.unref?.();
  }

  wake(): void {
    if (!this.#armed || this.#ticking) return;
    this.#armNextTimer();
  }

  start(): void {
    if (this.#armed) return;
    this.#armed = true;
    this.#armNextTimer();
  }

  stop(): void {
    this.#armed = false;
    this.#clearTimer();
  }
}
