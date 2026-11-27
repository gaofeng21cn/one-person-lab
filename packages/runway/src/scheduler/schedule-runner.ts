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
  #ticking = false;
  #tickFailed = false;

  constructor(options: ScheduleRunnerOptions) {
    this.#store = options.store;
    this.#tickIntervalMs = options.tickIntervalMs ?? 1_000;
    this.#now = options.now ?? (() => new Date());
    this.#onCancelTask = options.onCancelTask;
    this.#onTaskLaunched = options.onTaskLaunched;
  }

  get running(): boolean {
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
    if (this.#tickFailed && !this.#timer) {
      throw callbackErrors[0];
    }
    return outcomes;
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      if (this.#ticking) return;
      this.#ticking = true;
      void this.tickOnce().catch(() => { this.#tickFailed = true; }).finally(() => {
        this.#ticking = false;
      });
    }, this.#tickIntervalMs);
    this.#timer.unref?.();
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }
}
