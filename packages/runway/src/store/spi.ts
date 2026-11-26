import type {
  AttemptRow,
  BindAttemptSessionInput,
  CancelTaskInput,
  CommitStageTransitionInput,
  CommitStageTransitionResult,
  CreateAttemptInput,
  CreateAttemptResult,
  CreateTaskInput,
  ListTasksFilter,
  NextRunCalculator,
  PauseTaskInput,
  ResolveHumanGateInput,
  ResolveHumanGateResult,
  ResumeTaskInput,
  RunningAttemptContext,
  ScheduleRow,
  ScheduleTickOutcome,
  StageRunRow,
  TaskBundle,
  TaskControlResult,
  TaskRow,
  UpdateTaskStatusInput,
  UpsertScheduleInput,
} from '../types.ts';

export interface RunwayHealthReport {
  readonly ok: boolean;
  readonly journal_mode: string;
  readonly foreign_keys: number;
  readonly busy_timeout: number;
}

export interface OrphanedRunningStageContext {
  readonly stage_run_id: string;
  readonly task_id: string;
  readonly stage_id: string;
  readonly seq_no: number;
  readonly status: StageRunRow['status'];
  readonly revision: number;
  readonly task_status: TaskRow['status'];
}

/**
 * Thin DurabilitySPI for OPL Runway state machine & schedules.
 * Local default implementation is SqliteRunwayStore (node:sqlite WAL, DQS=0).
 */
export interface RunwayStore {
  ensureSchema(): void;
  healthCheck(): RunwayHealthReport;

  createTask(input: CreateTaskInput): TaskBundle;
  getTask(taskId: string): TaskBundle;
  listTasks(filter?: ListTasksFilter): { readonly tasks: TaskRow[]; readonly stage_runs: StageRunRow[] };
  updateTaskStatus(input: UpdateTaskStatusInput): TaskRow;

  getStageRun(stageRunId: string): StageRunRow;
  listStageRuns(taskId: string): StageRunRow[];
  claimNextQueuedStage(taskId: string): StageRunRow | null;

  createAttempt(input: CreateAttemptInput): CreateAttemptResult;
  getAttempt(attemptId: string): AttemptRow;
  bindAttemptSession(input: BindAttemptSessionInput): AttemptRow;
  renewAttemptLease(attemptId: string, leaseExpiresAt: string, usageJson?: string): AttemptRow;
  markAttemptInterrupted(
    attemptId: string,
    errorCode: string,
    details?: Record<string, unknown>,
  ): AttemptRow;
  listRunningAttemptsWithContext(): RunningAttemptContext[];
  listExpiredRunningAttempts(nowIsoStr: string): RunningAttemptContext[];
  listOrphanedRunningStages(): OrphanedRunningStageContext[];

  commitStageTransitionAtomic(input: CommitStageTransitionInput): CommitStageTransitionResult;
  pauseTaskAtomic(input: PauseTaskInput): TaskControlResult;
  resumeTaskAtomic(input: ResumeTaskInput): TaskControlResult;
  cancelTaskAtomic(input: CancelTaskInput): TaskControlResult;
  resolveHumanGateAtomic(input: ResolveHumanGateInput): ResolveHumanGateResult;

  upsertSchedule(input: UpsertScheduleInput): ScheduleRow;
  getSchedule(scheduleId: string): ScheduleRow;
  listSchedules(workspaceId?: string): ScheduleRow[];
  toggleSchedule(scheduleId: string, enabled: boolean): ScheduleRow;
  deleteSchedule(scheduleId: string): { readonly deleted: true; readonly schedule_id: string };
  tickDueSchedulesAtomic(
    nowIsoStr: string,
    computeNextRun: NextRunCalculator,
  ): ScheduleTickOutcome[];
  consumeBufferedScheduleAtomic(
    scheduleId: string,
    nowIsoStr: string,
    computeNextRun: NextRunCalculator,
  ): ScheduleTickOutcome | null;
}
