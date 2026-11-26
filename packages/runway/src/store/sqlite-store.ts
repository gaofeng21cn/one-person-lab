import {
  newId,
  nowIso,
  txImmediate,
  type SqliteDb,
} from '@opl/core';
import {
  appendEntriesWithDb,
  appendEntryWithDb,
  type LedgerEntry,
} from '@opl/ledger';

import { RunwayError } from '../errors.ts';
import { ensureRunwaySchema } from '../migrations.ts';
import { computeNextCronTime, parseCronExpr, validateCronTimezone } from '../scheduler/cron.ts';
import {
  normalizeOverlapPolicy,
  type AttemptRow,
  type BindAttemptSessionInput,
  type CancelTaskInput,
  type CommitStageTransitionInput,
  type CommitStageTransitionResult,
  type CreateAttemptInput,
  type CreateAttemptResult,
  type CreateTaskInput,
  type ListTasksFilter,
  type NextRunCalculator,
  type PauseTaskInput,
  type ResolveHumanGateInput,
  type ResolveHumanGateResult,
  type ResumeTaskInput,
  type RunningAttemptContext,
  type RunwayChangedEvent,
  type ScheduleRow,
  type ScheduleTickOutcome,
  type StageRunRow,
  type StageRunStatus,
  type TaskBundle,
  type TaskControlResult,
  type TaskRow,
  type TaskStatus,
  type UpdateTaskStatusInput,
  type UpsertScheduleInput,
} from '../types.ts';
import type {
  OrphanedRunningStageContext,
  RunwayHealthReport,
  RunwayStore,
} from './spi.ts';

export interface SqliteRunwayStoreOptions {
  readonly db: SqliteDb;
  readonly onMutate?: () => void;
  readonly onRunwayChanged?: (event: RunwayChangedEvent) => void;
  readonly onLedgerAppended?: (entries: readonly LedgerEntry[]) => void;
  readonly skipMigrations?: boolean;
  readonly nowIso?: () => string;
}

const TASK_COLUMNS =
  'task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at';
const STAGE_RUN_COLUMNS =
  'stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at';
const ATTEMPT_COLUMNS =
  'attempt_id, stage_run_id, attempt_no, role, executor_id, executor_session_ref, local_pid, status, lease_expires_at, usage_json, error_json, started_at, finished_at';
const SCHEDULE_COLUMNS =
  'schedule_id, workspace_id, agent_id, cron_expr, timezone, overlap_policy, payload_json, enabled, next_run_at, last_run_at, last_task_id, buffered_pending, last_status, updated_at';

const TERMINAL_STAGE_STATUSES = new Set<StageRunStatus>(['completed', 'failed', 'cancelled']);

export class SqliteRunwayStore implements RunwayStore {
  readonly #db: SqliteDb;
  readonly #onMutate?: () => void;
  readonly #onRunwayChanged?: (event: RunwayChangedEvent) => void;
  readonly #onLedgerAppended?: (entries: readonly LedgerEntry[]) => void;
  readonly #nowIso: () => string;

  constructor(options: SqliteRunwayStoreOptions) {
    this.#db = options.db;
    this.#onMutate = options.onMutate;
    this.#onRunwayChanged = options.onRunwayChanged;
    this.#onLedgerAppended = options.onLedgerAppended;
    this.#nowIso = options.nowIso ?? nowIso;
    if (!options.skipMigrations) {
      this.ensureSchema();
    }
  }

  get db(): SqliteDb {
    return this.#db;
  }

  ensureSchema(): void {
    ensureRunwaySchema(this.#db);
  }

  healthCheck(): RunwayHealthReport {
    const modeRow = this.#db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string } | undefined;
    const fkRow = this.#db.prepare('PRAGMA foreign_keys').get() as { foreign_keys?: number } | undefined;
    const busyRow = this.#db.prepare('PRAGMA busy_timeout').get() as { timeout?: number } | undefined;
    const journalMode = String(modeRow?.journal_mode ?? '').toLowerCase();
    const foreignKeys = Number(fkRow?.foreign_keys ?? 0);
    const busyTimeout = Number(busyRow?.timeout ?? 0);
    return {
      ok: foreignKeys === 1 && busyTimeout >= 0 && (journalMode === 'wal' || journalMode === 'memory'),
      journal_mode: journalMode,
      foreign_keys: foreignKeys,
      busy_timeout: busyTimeout,
    };
  }

  #assertWorkspaceExists(workspaceId: string): void {
    const row = this.#db
      .prepare('SELECT workspace_id FROM workspaces WHERE workspace_id = ?')
      .get(workspaceId) as { workspace_id: string } | undefined;
    if (!row) {
      throw new RunwayError(
        'WORKSPACE_NOT_FOUND',
        `Workspace '${workspaceId}' not found.`,
        { workspace_id: workspaceId },
      );
    }
  }

  #emitAfterTx(
    wasInTx: boolean,
    events: {
      readonly mutate?: boolean;
      readonly runway?: readonly RunwayChangedEvent[];
      readonly ledger?: readonly LedgerEntry[];
    },
  ): void {
    if (wasInTx) return;
    if (events.mutate) {
      this.#onMutate?.();
    }
    if (events.runway) {
      for (const ev of events.runway) {
        this.#onRunwayChanged?.(ev);
      }
    }
    if (events.ledger && events.ledger.length > 0) {
      this.#onLedgerAppended?.(events.ledger);
    }
  }

  createTask(input: CreateTaskInput): TaskBundle {
    if (!input.workspace_id?.trim() || !input.title?.trim() || !input.goal_prompt?.trim()) {
      throw new RunwayError(
        'INVALID_INPUT',
        'createTask requires workspace_id, title, and goal_prompt.',
      );
    }

    const wasInTx = this.#db.isTransaction;
    const taskId = input.task_id?.trim() || newId('task');
    const ts = this.#nowIso();
    const stages =
      input.stages && input.stages.length > 0
        ? input.stages
        : [{ stage_id: 'stage_1', executor_id: 'codex', model_id: null }];

    txImmediate(this.#db, () => {
      this.#assertWorkspaceExists(input.workspace_id);
      this.#db
        .prepare(
          'INSERT INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'active\', 1, ?, ?)',
        )
        .run(
          taskId,
          input.workspace_id,
          input.agent_id ?? null,
          input.title.trim(),
          input.goal_prompt.trim(),
          ts,
          ts,
        );

      const insStage = this.#db.prepare(
        'INSERT INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at) VALUES (?, ?, ?, ?, \'queued\', ?, ?, NULL, 1, NULL, NULL, ?)',
      );
      stages.forEach((st, idx) => {
        insStage.run(
          newId('sr'),
          taskId,
          st.stage_id?.trim() || `stage_${idx + 1}`,
          idx + 1,
          st.executor_id?.trim() || 'codex',
          st.model_id ?? null,
          ts,
        );
      });
    });

    const bundle = this.getTask(taskId);
    this.#emitAfterTx(wasInTx, {
      mutate: true,
      runway: [{ kind: 'task_created', task_id: taskId, status: bundle.status }],
    });
    return bundle;
  }

  getTask(taskId: string): TaskBundle {
    const task = this.#db
      .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE task_id = ?`)
      .get(taskId) as TaskRow | undefined;
    if (!task) {
      throw new RunwayError('TASK_NOT_FOUND', `Task '${taskId}' not found.`, {
        task_id: taskId,
      });
    }
    const stageRuns = this.listStageRuns(taskId);
    const srIds = stageRuns.map((s) => s.stage_run_id);
    let attempts: AttemptRow[] = [];
    if (srIds.length > 0) {
      const placeholders = srIds.map(() => '?').join(', ');
      attempts = this.#db
        .prepare(
          `SELECT ${ATTEMPT_COLUMNS} FROM attempts WHERE stage_run_id IN (${placeholders}) ORDER BY started_at ASC, attempt_no ASC`,
        )
        .all(...srIds) as unknown as AttemptRow[];
    }

    const gateStage = stageRuns.find(
      (sr) => sr.status === 'human_gate' || sr.status === 'paused_by_human',
    );
    let humanGate: unknown = null;
    if (gateStage?.human_gate_json) {
      try {
        humanGate = JSON.parse(gateStage.human_gate_json);
      } catch {
        humanGate = gateStage.human_gate_json;
      }
    }

    return {
      task_id: task.task_id,
      status: task.status,
      task,
      stage_runs: stageRuns,
      attempts,
      human_gate: humanGate,
    };
  }

  listTasks(filter: ListTasksFilter = {}): {
    readonly tasks: TaskRow[];
    readonly stage_runs: StageRunRow[];
  } {
    const clauses: string[] = [];
    const args: string[] = [];
    if (filter.workspace_id) {
      clauses.push('workspace_id = ?');
      args.push(filter.workspace_id);
    }
    if (filter.status) {
      clauses.push('status = ?');
      args.push(filter.status);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const tasks = this.#db
      .prepare(`SELECT ${TASK_COLUMNS} FROM tasks ${where} ORDER BY created_at DESC, rowid DESC`)
      .all(...args) as unknown as TaskRow[];

    let stageRuns: StageRunRow[] = [];
    if (tasks.length > 0 && (filter.workspace_id || filter.status)) {
      const ids = tasks.map((t) => t.task_id);
      const placeholders = ids.map(() => '?').join(', ');
      stageRuns = this.#db
        .prepare(
          `SELECT ${STAGE_RUN_COLUMNS} FROM stage_runs WHERE task_id IN (${placeholders}) ORDER BY seq_no ASC`,
        )
        .all(...ids) as unknown as StageRunRow[];
    } else if (!filter.workspace_id && !filter.status) {
      stageRuns = this.#db
        .prepare(`SELECT ${STAGE_RUN_COLUMNS} FROM stage_runs ORDER BY seq_no ASC`)
        .all() as unknown as StageRunRow[];
    }
    return { tasks, stage_runs: stageRuns };
  }

  updateTaskStatus(input: UpdateTaskStatusInput): TaskRow {
    const wasInTx = this.#db.isTransaction;
    const ts = this.#nowIso();
    const updated = txImmediate(this.#db, () => {
      const existing = this.#db
        .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE task_id = ?`)
        .get(input.task_id) as TaskRow | undefined;
      if (!existing) {
        throw new RunwayError('TASK_NOT_FOUND', `Task '${input.task_id}' not found.`, {
          task_id: input.task_id,
        });
      }
      const targetRev = input.expected_revision ?? existing.revision;
      const res = this.#db
        .prepare(
          'UPDATE tasks SET status = ?, revision = revision + 1, updated_at = ? WHERE task_id = ? AND revision = ?',
        )
        .run(input.status, ts, input.task_id, targetRev);
      if (Number(res.changes) !== 1) {
        throw new RunwayError(
          'REVISION_CONFLICT',
          `Task '${input.task_id}' revision conflict: expected ${targetRev}.`,
          { task_id: input.task_id, expected_revision: targetRev, actual_revision: existing.revision },
        );
      }
      return this.#db
        .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE task_id = ?`)
        .get(input.task_id) as unknown as TaskRow;
    });
    this.#emitAfterTx(wasInTx, { mutate: true });
    return updated;
  }

  getStageRun(stageRunId: string): StageRunRow {
    const row = this.#db
      .prepare(`SELECT ${STAGE_RUN_COLUMNS} FROM stage_runs WHERE stage_run_id = ?`)
      .get(stageRunId) as StageRunRow | undefined;
    if (!row) {
      throw new RunwayError('STAGE_RUN_NOT_FOUND', `StageRun '${stageRunId}' not found.`, {
        stage_run_id: stageRunId,
      });
    }
    return row;
  }

  listStageRuns(taskId: string): StageRunRow[] {
    return this.#db
      .prepare(`SELECT ${STAGE_RUN_COLUMNS} FROM stage_runs WHERE task_id = ? ORDER BY seq_no ASC`)
      .all(taskId) as unknown as StageRunRow[];
  }

  claimNextQueuedStage(taskId: string): StageRunRow | null {
    const wasInTx = this.#db.isTransaction;
    const result = txImmediate(this.#db, () => {
      const task = this.#db
        .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE task_id = ?`)
        .get(taskId) as TaskRow | undefined;
      if (!task) {
        throw new RunwayError('TASK_NOT_FOUND', `Task '${taskId}' not found.`, {
          task_id: taskId,
        });
      }
      if (task.status === 'paused_by_human') {
        throw new RunwayError(
          'TASK_PAUSED_BY_HUMAN',
          `Task '${taskId}' is paused_by_human and cannot claim stages.`,
          { task_id: taskId },
        );
      }
      if (task.status !== 'active') {
        return null;
      }

      const activeBlocking = this.#db
        .prepare(
          'SELECT stage_run_id FROM stage_runs WHERE task_id = ? AND status IN (\'running\', \'human_gate\', \'paused_by_human\', \'repair_required\', \'awaiting_review\') LIMIT 1',
        )
        .get(taskId) as { stage_run_id: string } | undefined;
      if (activeBlocking) {
        return null;
      }

      const nextQueued = this.#db
        .prepare(
          `SELECT ${STAGE_RUN_COLUMNS} FROM stage_runs WHERE task_id = ? AND status = 'queued' ORDER BY seq_no ASC LIMIT 1`,
        )
        .get(taskId) as StageRunRow | undefined;
      if (!nextQueued) {
        return null;
      }
      return nextQueued;
    });
    void wasInTx;
    return result;
  }

  createAttempt(input: CreateAttemptInput): CreateAttemptResult {
    const wasInTx = this.#db.isTransaction;
    const ts = this.#nowIso();
    const attemptId = input.attempt_id?.trim() || newId('att');

    const txOut = txImmediate(this.#db, () => {
      const sr = this.#db
        .prepare(`SELECT ${STAGE_RUN_COLUMNS} FROM stage_runs WHERE stage_run_id = ?`)
        .get(input.stage_run_id) as StageRunRow | undefined;
      if (!sr) {
        throw new RunwayError(
          'STAGE_RUN_NOT_FOUND',
          `StageRun '${input.stage_run_id}' not found.`,
          { stage_run_id: input.stage_run_id },
        );
      }
      const task = this.#db
        .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE task_id = ?`)
        .get(sr.task_id) as unknown as TaskRow;
      if (task.status === 'paused_by_human' || sr.status === 'paused_by_human') {
        throw new RunwayError(
          'TASK_PAUSED_BY_HUMAN',
          `StageRun '${sr.stage_run_id}' is paused_by_human.`,
          { task_id: task.task_id, stage_run_id: sr.stage_run_id },
        );
      }
      if (sr.status !== 'queued' && sr.status !== 'repair_required') {
        throw new RunwayError(
          'INVALID_STAGE_STATE',
          `StageRun '${sr.stage_run_id}' status '${sr.status}' cannot start a new attempt.`,
          { stage_run_id: sr.stage_run_id, status: sr.status },
        );
      }

      const upd = this.#db
        .prepare(
          'UPDATE stage_runs SET status = \'running\', started_at = COALESCE(started_at, ?), revision = revision + 1, updated_at = ? WHERE stage_run_id = ? AND revision = ?',
        )
        .run(ts, ts, sr.stage_run_id, input.expected_stage_revision);
      if (Number(upd.changes) !== 1) {
        throw new RunwayError(
          'REVISION_CONFLICT',
          `StageRun '${sr.stage_run_id}' revision conflict: expected ${input.expected_stage_revision}, actual ${sr.revision}.`,
          {
            stage_run_id: sr.stage_run_id,
            expected_revision: input.expected_stage_revision,
            actual_revision: sr.revision,
          },
        );
      }

      const countRow = this.#db
        .prepare('SELECT COALESCE(MAX(attempt_no), 0) AS max_no FROM attempts WHERE stage_run_id = ?')
        .get(sr.stage_run_id) as { max_no: number };
      const attemptNo = Number(countRow.max_no) + 1;

      this.#db
        .prepare(
          'INSERT INTO attempts (attempt_id, stage_run_id, attempt_no, role, executor_id, executor_session_ref, local_pid, status, lease_expires_at, usage_json, error_json, started_at, finished_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, \'running\', ?, \'{}\', NULL, ?, NULL)',
        )
        .run(
          attemptId,
          sr.stage_run_id,
          attemptNo,
          input.role,
          input.executor_id,
          input.lease_expires_at,
          ts,
        );

      const nextStage = this.getStageRun(sr.stage_run_id);
      const attempt = this.getAttempt(attemptId);
      return { stage_run: nextStage, attempt, task_id: sr.task_id };
    });

    this.#emitAfterTx(wasInTx, {
      mutate: true,
      runway: [
        {
          kind: 'stage_transitioned',
          task_id: txOut.task_id,
          stage_run_id: txOut.stage_run.stage_run_id,
          status: txOut.stage_run.status,
          revision: txOut.stage_run.revision,
        },
      ],
    });
    return { stage_run: txOut.stage_run, attempt: txOut.attempt };
  }

  getAttempt(attemptId: string): AttemptRow {
    const row = this.#db
      .prepare(`SELECT ${ATTEMPT_COLUMNS} FROM attempts WHERE attempt_id = ?`)
      .get(attemptId) as AttemptRow | undefined;
    if (!row) {
      throw new RunwayError('ATTEMPT_NOT_FOUND', `Attempt '${attemptId}' not found.`, {
        attempt_id: attemptId,
      });
    }
    return row;
  }

  bindAttemptSession(input: BindAttemptSessionInput): AttemptRow {
    return txImmediate(this.#db, () => {
      const existing = this.getAttempt(input.attempt_id);
      const nextSessionRef =
        input.executor_session_ref !== undefined
          ? input.executor_session_ref
          : existing.executor_session_ref;
      const nextPid = input.local_pid !== undefined ? input.local_pid : existing.local_pid;
      this.#db
        .prepare(
          'UPDATE attempts SET executor_session_ref = ?, local_pid = ? WHERE attempt_id = ?',
        )
        .run(nextSessionRef, nextPid, input.attempt_id);
      return this.getAttempt(input.attempt_id);
    });
  }

  renewAttemptLease(attemptId: string, leaseExpiresAt: string, usageJson?: string): AttemptRow {
    return txImmediate(this.#db, () => {
      const res =
        usageJson !== undefined
          ? this.#db
              .prepare(
                'UPDATE attempts SET lease_expires_at = ?, usage_json = ? WHERE attempt_id = ? AND status = \'running\'',
              )
              .run(leaseExpiresAt, usageJson, attemptId)
          : this.#db
              .prepare(
                'UPDATE attempts SET lease_expires_at = ? WHERE attempt_id = ? AND status = \'running\'',
              )
              .run(leaseExpiresAt, attemptId);
      if (Number(res.changes) !== 1) {
        const existing = this.#db
          .prepare(`SELECT ${ATTEMPT_COLUMNS} FROM attempts WHERE attempt_id = ?`)
          .get(attemptId) as AttemptRow | undefined;
        if (!existing) {
          throw new RunwayError('ATTEMPT_NOT_FOUND', `Attempt '${attemptId}' not found.`, {
            attempt_id: attemptId,
          });
        }
        return existing;
      }
      return this.getAttempt(attemptId);
    });
  }

  markAttemptInterrupted(
    attemptId: string,
    errorCode: string,
    details: Record<string, unknown> = {},
  ): AttemptRow {
    const ts = this.#nowIso();
    return txImmediate(this.#db, () => {
      const existing = this.getAttempt(attemptId);
      if (existing.status !== 'running') {
        return existing;
      }
      this.#db
        .prepare(
          'UPDATE attempts SET status = \'interrupted\', finished_at = ?, error_json = ? WHERE attempt_id = ? AND status = \'running\'',
        )
        .run(ts, JSON.stringify({ code: errorCode, ...details }), attemptId);
      return this.getAttempt(attemptId);
    });
  }

  listRunningAttemptsWithContext(): RunningAttemptContext[] {
    return this.#db
      .prepare(
        `SELECT
          a.attempt_id, a.stage_run_id, a.attempt_no, a.role, a.executor_id,
          a.executor_session_ref, a.local_pid, a.lease_expires_at, a.started_at,
          s.task_id, s.stage_id, s.seq_no, s.status AS stage_status, s.revision AS stage_revision, s.model_id,
          t.status AS task_status, t.workspace_id, w.root_path AS workspace_root, t.agent_id
        FROM attempts a
        JOIN stage_runs s ON s.stage_run_id = a.stage_run_id
        JOIN tasks t ON t.task_id = s.task_id
        JOIN workspaces w ON w.workspace_id = t.workspace_id
        WHERE a.status = 'running'
        ORDER BY a.started_at ASC, a.attempt_no ASC, a.rowid ASC`,
      )
      .all() as unknown as RunningAttemptContext[];
  }

  listExpiredRunningAttempts(nowIsoStr: string): RunningAttemptContext[] {
    return this.#db
      .prepare(
        `SELECT
          a.attempt_id, a.stage_run_id, a.attempt_no, a.role, a.executor_id,
          a.executor_session_ref, a.local_pid, a.lease_expires_at, a.started_at,
          s.task_id, s.stage_id, s.seq_no, s.status AS stage_status, s.revision AS stage_revision, s.model_id,
          t.status AS task_status, t.workspace_id, w.root_path AS workspace_root, t.agent_id
        FROM attempts a
        JOIN stage_runs s ON s.stage_run_id = a.stage_run_id
        JOIN tasks t ON t.task_id = s.task_id
        JOIN workspaces w ON w.workspace_id = t.workspace_id
        WHERE a.status = 'running' AND a.lease_expires_at IS NOT NULL AND a.lease_expires_at <= ?
        ORDER BY a.lease_expires_at ASC, a.rowid ASC`,
      )
      .all(nowIsoStr) as unknown as RunningAttemptContext[];
  }

  listOrphanedRunningStages(): OrphanedRunningStageContext[] {
    return this.#db
      .prepare(
        `SELECT
          s.stage_run_id, s.task_id, s.stage_id, s.seq_no, s.status, s.revision,
          t.status AS task_status
        FROM stage_runs s
        JOIN tasks t ON t.task_id = s.task_id
        WHERE s.status = 'running'
          AND NOT EXISTS (
            SELECT 1 FROM attempts a WHERE a.stage_run_id = s.stage_run_id AND a.status = 'running'
          )
        ORDER BY s.seq_no ASC`,
      )
      .all() as unknown as OrphanedRunningStageContext[];
  }

  commitStageTransitionAtomic(input: CommitStageTransitionInput): CommitStageTransitionResult {
    const wasInTx = this.#db.isTransaction;
    const ts = this.#nowIso();

    const txOut = txImmediate(this.#db, () => {
      const sr = this.#db
        .prepare(`SELECT ${STAGE_RUN_COLUMNS} FROM stage_runs WHERE stage_run_id = ?`)
        .get(input.stage_run_id) as StageRunRow | undefined;
      if (!sr) {
        throw new RunwayError(
          'STAGE_RUN_NOT_FOUND',
          `StageRun '${input.stage_run_id}' not found.`,
          { stage_run_id: input.stage_run_id },
        );
      }

      const nextHumanGateJson =
        input.human_gate_json !== undefined
          ? input.human_gate_json
          : input.next_stage_status === 'human_gate'
            ? sr.human_gate_json
            : null;
      const isTerminal = TERMINAL_STAGE_STATUSES.has(input.next_stage_status);

      const upd = this.#db
        .prepare(
          'UPDATE stage_runs SET status = ?, human_gate_json = ?, started_at = COALESCE(started_at, ?), finished_at = CASE WHEN ? = 1 THEN ? ELSE finished_at END, revision = revision + 1, updated_at = ? WHERE stage_run_id = ? AND revision = ?',
        )
        .run(
          input.next_stage_status,
          nextHumanGateJson,
          ts,
          isTerminal ? 1 : 0,
          ts,
          ts,
          sr.stage_run_id,
          input.expected_revision,
        );
      if (Number(upd.changes) !== 1) {
        throw new RunwayError(
          'REVISION_CONFLICT',
          `StageRun '${sr.stage_run_id}' revision conflict: expected ${input.expected_revision}, actual ${sr.revision}.`,
          {
            stage_run_id: sr.stage_run_id,
            expected_revision: input.expected_revision,
            actual_revision: sr.revision,
          },
        );
      }

      let updatedAttempt: AttemptRow | null = null;
      if (input.attempt_update) {
        const attUpd = this.#db
          .prepare(
            'UPDATE attempts SET status = ?, finished_at = COALESCE(finished_at, ?), usage_json = COALESCE(?, usage_json), error_json = ? WHERE attempt_id = ? AND stage_run_id = ?',
          )
          .run(
            input.attempt_update.status,
            ts,
            input.attempt_update.usage_json ?? null,
            input.attempt_update.error_json ?? null,
            input.attempt_update.attempt_id,
            sr.stage_run_id,
          );
        if (Number(attUpd.changes) !== 1) {
          throw new RunwayError(
            'ATTEMPT_NOT_FOUND',
            `Attempt '${input.attempt_update.attempt_id}' not found on stage_run '${sr.stage_run_id}'.`,
            {
              attempt_id: input.attempt_update.attempt_id,
              stage_run_id: sr.stage_run_id,
            },
          );
        }
        updatedAttempt = this.getAttempt(input.attempt_update.attempt_id);
      }

      if (input.task_status !== undefined) {
        this.#db
          .prepare(
            'UPDATE tasks SET status = ?, revision = revision + 1, updated_at = ? WHERE task_id = ?',
          )
          .run(input.task_status, ts, sr.task_id);
      }

      const ledgerEntries =
        input.ledger_entries && input.ledger_entries.length > 0
          ? appendEntriesWithDb(this.#db, input.ledger_entries)
          : [];

      const updatedStage = this.getStageRun(sr.stage_run_id);
      const updatedTask = this.#db
        .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE task_id = ?`)
        .get(sr.task_id) as unknown as TaskRow;

      return {
        stage_run: updatedStage,
        task: updatedTask,
        attempt: updatedAttempt,
        ledger_entries: ledgerEntries,
      };
    });

    this.#emitAfterTx(wasInTx, {
      mutate: true,
      runway: [
        {
          kind: 'stage_transitioned',
          task_id: txOut.task.task_id,
          stage_run_id: txOut.stage_run.stage_run_id,
          status: txOut.stage_run.status,
          revision: txOut.stage_run.revision,
        },
      ],
      ledger: txOut.ledger_entries,
    });

    return txOut;
  }

  pauseTaskAtomic(input: PauseTaskInput): TaskControlResult {
    const wasInTx = this.#db.isTransaction;
    const ts = this.#nowIso();

    const txOut = txImmediate(this.#db, () => {
      const existing = this.getTask(input.task_id);
      if (
        existing.task.status === 'completed'
        || existing.task.status === 'cancelled'
        || existing.task.status === 'failed'
      ) {
        throw new RunwayError(
          'INVALID_TASK_STATE',
          `Task '${input.task_id}' is '${existing.task.status}' and cannot be paused.`,
          { task_id: input.task_id, status: existing.task.status },
        );
      }

      this.#db
        .prepare(
          'UPDATE tasks SET status = \'paused_by_human\', revision = revision + 1, updated_at = ? WHERE task_id = ?',
        )
        .run(ts, input.task_id);
      this.#db
        .prepare(
          'UPDATE stage_runs SET status = \'paused_by_human\', revision = revision + 1, updated_at = ? WHERE task_id = ? AND status IN (\'queued\', \'running\', \'awaiting_review\', \'repair_required\', \'human_gate\')',
        )
        .run(ts, input.task_id);

      const ledgerEntry = appendEntryWithDb(this.#db, {
        task_id: input.task_id,
        stage_run_id: existing.stage_runs[0]?.stage_run_id ?? null,
        entry_kind: 'human_decision',
        owner_id: input.actor_id ?? 'human',
        payload: {
          decision: 'pause',
          actor_id: input.actor_id ?? 'human',
          ...(input.reason ? { reason: input.reason } : {}),
        },
        created_at: ts,
      });

      const after = this.getTask(input.task_id);
      return { after, ledgerEntry };
    });

    this.#emitAfterTx(wasInTx, {
      mutate: true,
      runway: [{ kind: 'task_paused', task_id: input.task_id, status: 'paused_by_human' }],
      ledger: [txOut.ledgerEntry],
    });

    return {
      ok: true,
      task_id: input.task_id,
      status: 'paused_by_human',
      task: txOut.after.task,
      stage_runs: txOut.after.stage_runs,
      ledger_entry: txOut.ledgerEntry,
    };
  }

  resumeTaskAtomic(input: ResumeTaskInput): TaskControlResult {
    const wasInTx = this.#db.isTransaction;
    const ts = this.#nowIso();

    const txOut = txImmediate(this.#db, () => {
      const existing = this.getTask(input.task_id);
      if (existing.task.status !== 'paused_by_human' && existing.task.status !== 'awaiting_human') {
        throw new RunwayError(
          'INVALID_TASK_STATE',
          `Task '${input.task_id}' is '${existing.task.status}', expected 'paused_by_human' or 'awaiting_human'.`,
          { task_id: input.task_id, status: existing.task.status },
        );
      }

      this.#db
        .prepare(
          'UPDATE tasks SET status = \'active\', revision = revision + 1, updated_at = ? WHERE task_id = ?',
        )
        .run(ts, input.task_id);
      this.#db
        .prepare(
          'UPDATE attempts SET status = \'interrupted\', finished_at = ?, error_json = ? WHERE status = \'running\' AND stage_run_id IN (SELECT stage_run_id FROM stage_runs WHERE task_id = ? AND status IN (\'paused_by_human\', \'human_gate\'))',
        )
        .run(ts, JSON.stringify({ code: 'paused_by_human_resumed' }), input.task_id);
      this.#db
        .prepare(
          'UPDATE stage_runs SET status = \'queued\', human_gate_json = NULL, revision = revision + 1, updated_at = ? WHERE task_id = ? AND status IN (\'paused_by_human\', \'human_gate\')',
        )
        .run(ts, input.task_id);

      const ledgerEntry = appendEntryWithDb(this.#db, {
        task_id: input.task_id,
        stage_run_id: existing.stage_runs[0]?.stage_run_id ?? null,
        entry_kind: 'human_decision',
        owner_id: input.actor_id ?? 'human',
        payload: {
          decision: 'resume',
          actor_id: input.actor_id ?? 'human',
          ...(input.reason ? { reason: input.reason } : {}),
        },
        created_at: ts,
      });

      const after = this.getTask(input.task_id);
      return { after, ledgerEntry };
    });

    this.#emitAfterTx(wasInTx, {
      mutate: true,
      runway: [{ kind: 'task_resumed', task_id: input.task_id, status: 'active' }],
      ledger: [txOut.ledgerEntry],
    });

    return {
      ok: true,
      task_id: input.task_id,
      status: 'active',
      task: txOut.after.task,
      stage_runs: txOut.after.stage_runs,
      ledger_entry: txOut.ledgerEntry,
    };
  }

  cancelTaskAtomic(input: CancelTaskInput): TaskControlResult {
    const wasInTx = this.#db.isTransaction;
    const ts = this.#nowIso();

    const txOut = txImmediate(this.#db, () => {
      const existing = this.getTask(input.task_id);
      if (existing.task.status === 'completed' || existing.task.status === 'failed') {
        throw new RunwayError(
          'INVALID_TASK_STATE',
          `Task '${input.task_id}' is '${existing.task.status}' and cannot be cancelled.`,
          { task_id: input.task_id, status: existing.task.status },
        );
      }
      this.#db
        .prepare(
          'UPDATE tasks SET status = \'cancelled\', revision = revision + 1, updated_at = ? WHERE task_id = ?',
        )
        .run(ts, input.task_id);
      this.#db
        .prepare(
          'UPDATE attempts SET status = \'cancelled\', finished_at = ? WHERE status = \'running\' AND stage_run_id IN (SELECT stage_run_id FROM stage_runs WHERE task_id = ? AND status NOT IN (\'completed\', \'cancelled\', \'failed\'))',
        )
        .run(ts, input.task_id);
      this.#db
        .prepare(
          'UPDATE stage_runs SET status = \'cancelled\', finished_at = ?, revision = revision + 1, updated_at = ? WHERE task_id = ? AND status NOT IN (\'completed\', \'cancelled\', \'failed\')',
        )
        .run(ts, ts, input.task_id);

      const ledgerEntry = appendEntryWithDb(this.#db, {
        task_id: input.task_id,
        stage_run_id: existing.stage_runs[0]?.stage_run_id ?? null,
        entry_kind: 'human_decision',
        owner_id: input.actor_id ?? 'human',
        payload: {
          decision: 'cancel',
          actor_id: input.actor_id ?? 'human',
          ...(input.reason ? { reason: input.reason } : {}),
        },
        created_at: ts,
      });

      const after = this.getTask(input.task_id);
      return { after, ledgerEntry };
    });

    this.#emitAfterTx(wasInTx, {
      mutate: true,
      runway: [{ kind: 'task_cancelled', task_id: input.task_id, status: 'cancelled' }],
      ledger: [txOut.ledgerEntry],
    });

    return {
      ok: true,
      task_id: input.task_id,
      status: 'cancelled',
      task: txOut.after.task,
      stage_runs: txOut.after.stage_runs,
      ledger_entry: txOut.ledgerEntry,
    };
  }

  resolveHumanGateAtomic(input: ResolveHumanGateInput): ResolveHumanGateResult {
    if (!input.stage_run_id?.trim() || !input.decision?.trim()) {
      throw new RunwayError(
        'INVALID_INPUT',
        'resolveHumanGate requires stage_run_id and decision.',
      );
    }

    const wasInTx = this.#db.isTransaction;
    const ts = this.#nowIso();

    const txOut = txImmediate(this.#db, () => {
      const sr = this.getStageRun(input.stage_run_id);
      if (input.expected_revision !== undefined && sr.revision !== input.expected_revision) {
        throw new RunwayError(
          'REVISION_CONFLICT',
          `StageRun '${sr.stage_run_id}' revision conflict: expected ${input.expected_revision}, actual ${sr.revision}.`,
          { expected_revision: input.expected_revision, actual_revision: sr.revision },
        );
      }
      if (sr.status !== 'human_gate' && sr.status !== 'paused_by_human') {
        throw new RunwayError(
          'INVALID_STAGE_STATE',
          `StageRun '${sr.stage_run_id}' is '${sr.status}', expected 'human_gate' or 'paused_by_human'.`,
          { stage_run_id: sr.stage_run_id, status: sr.status },
        );
      }

      const normalizedDecision = input.decision.trim().toLowerCase();
      const nextStageStatus: StageRunStatus =
        normalizedDecision === 'reject' || normalizedDecision === 'cancel'
          ? 'cancelled'
          : normalizedDecision === 'pause'
            ? 'paused_by_human'
            : 'queued';
      const nextTaskStatus: TaskStatus =
        normalizedDecision === 'reject' || normalizedDecision === 'cancel'
          ? 'cancelled'
          : normalizedDecision === 'pause'
            ? 'paused_by_human'
            : 'active';

      const targetRev = input.expected_revision ?? sr.revision;
      const isTerminal = TERMINAL_STAGE_STATUSES.has(nextStageStatus);
      const upd = this.#db
        .prepare(
          'UPDATE stage_runs SET status = ?, human_gate_json = CASE WHEN ? = \'queued\' THEN NULL ELSE human_gate_json END, finished_at = CASE WHEN ? = 1 THEN ? ELSE finished_at END, revision = revision + 1, updated_at = ? WHERE stage_run_id = ? AND revision = ?',
        )
        .run(
          nextStageStatus,
          nextStageStatus,
          isTerminal ? 1 : 0,
          ts,
          ts,
          sr.stage_run_id,
          targetRev,
        );
      if (Number(upd.changes) !== 1) {
        throw new RunwayError(
          'REVISION_CONFLICT',
          `StageRun '${sr.stage_run_id}' revision conflict during atomic humanGate resolve.`,
          { stage_run_id: sr.stage_run_id, expected_revision: targetRev },
        );
      }

      if (nextStageStatus === 'queued') {
        this.#db
          .prepare(
            'UPDATE attempts SET status = \'interrupted\', finished_at = ?, error_json = COALESCE(error_json, ?) WHERE stage_run_id = ? AND status = \'running\'',
          )
          .run(ts, JSON.stringify({ code: 'human_gate_resolved' }), sr.stage_run_id);
      } else if (nextStageStatus === 'cancelled') {
        this.#db
          .prepare(
            'UPDATE attempts SET status = \'cancelled\', finished_at = ? WHERE stage_run_id = ? AND status = \'running\'',
          )
          .run(ts, sr.stage_run_id);
      }

      this.#db
        .prepare('UPDATE tasks SET status = ?, revision = revision + 1, updated_at = ? WHERE task_id = ?')
        .run(nextTaskStatus, ts, sr.task_id);

      const ledgerEntry = appendEntryWithDb(this.#db, {
        task_id: sr.task_id,
        stage_run_id: sr.stage_run_id,
        entry_kind: 'human_decision',
        owner_id: input.actor_id ?? 'human',
        payload: {
          decision: input.decision,
          actor_id: input.actor_id ?? 'human',
          ...(input.waived_debt_ids ? { waived_debt_ids: [...input.waived_debt_ids] } : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        },
        created_at: ts,
      });

      return {
        stage_run_id: sr.stage_run_id,
        task_id: sr.task_id,
        revision: targetRev + 1,
        status: nextStageStatus,
        ledger_entry: ledgerEntry,
      };
    });

    this.#emitAfterTx(wasInTx, {
      mutate: true,
      runway: [
        {
          kind: 'human_gate_resolved',
          task_id: txOut.task_id,
          stage_run_id: txOut.stage_run_id,
          status: txOut.status,
          revision: txOut.revision,
        },
      ],
      ledger: [txOut.ledger_entry],
    });

    return {
      ok: true,
      stage_run_id: txOut.stage_run_id,
      task_id: txOut.task_id,
      revision: txOut.revision,
      status: txOut.status,
      ledger_entry: txOut.ledger_entry,
    };
  }

  upsertSchedule(input: UpsertScheduleInput): ScheduleRow {
    if (!input.workspace_id?.trim() || !input.cron_expr?.trim()) {
      throw new RunwayError(
        'INVALID_INPUT',
        'upsertSchedule requires workspace_id and cron_expr.',
      );
    }

    const cronExpr = input.cron_expr.trim();
    parseCronExpr(cronExpr);
    const timezone = validateCronTimezone(input.timezone ?? 'local');
    const overlapPolicy = normalizeOverlapPolicy(input.overlap_policy);
    const scheduleId = input.schedule_id?.trim() || newId('sched');
    const enabled = input.enabled === false ? 0 : 1;
    const ts = this.#nowIso();
    let nextRunAt: string;
    const rawNextRunAt = input.next_run_at?.trim();
    if (rawNextRunAt) {
      const parsedNextRun = new Date(rawNextRunAt);
      if (!Number.isFinite(parsedNextRun.getTime())) {
        throw new RunwayError(
          'INVALID_INPUT',
          `Invalid next_run_at timestamp: '${input.next_run_at}'.`,
          { next_run_at: input.next_run_at },
        );
      }
      nextRunAt = parsedNextRun.toISOString();
    } else {
      nextRunAt = computeNextCronTime(cronExpr, timezone, new Date(ts));
    }
    const wasInTx = this.#db.isTransaction;

    const row = txImmediate(this.#db, () => {
      this.#assertWorkspaceExists(input.workspace_id);
      this.#db
        .prepare(
          `INSERT INTO schedules (
            schedule_id, workspace_id, agent_id, cron_expr, timezone, overlap_policy,
            payload_json, enabled, next_run_at, last_run_at, last_task_id, buffered_pending, last_status, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL, ?)
          ON CONFLICT(schedule_id) DO UPDATE SET
            workspace_id = excluded.workspace_id,
            agent_id = excluded.agent_id,
            cron_expr = excluded.cron_expr,
            timezone = excluded.timezone,
            overlap_policy = excluded.overlap_policy,
            payload_json = excluded.payload_json,
            enabled = excluded.enabled,
            next_run_at = excluded.next_run_at,
            updated_at = excluded.updated_at`,
        )
        .run(
          scheduleId,
          input.workspace_id,
          input.agent_id ?? null,
          cronExpr,
          timezone,
          overlapPolicy,
          JSON.stringify(input.payload ?? {}),
          enabled,
          nextRunAt,
          ts,
        );
      return this.getSchedule(scheduleId);
    });

    this.#emitAfterTx(wasInTx, { mutate: true });
    return row;
  }

  getSchedule(scheduleId: string): ScheduleRow {
    const row = this.#db
      .prepare(`SELECT ${SCHEDULE_COLUMNS} FROM schedules WHERE schedule_id = ?`)
      .get(scheduleId) as ScheduleRow | undefined;
    if (!row) {
      throw new RunwayError('SCHEDULE_NOT_FOUND', `Schedule '${scheduleId}' not found.`, {
        schedule_id: scheduleId,
      });
    }
    return row;
  }

  listSchedules(workspaceId?: string): ScheduleRow[] {
    if (workspaceId) {
      return this.#db
        .prepare(
          `SELECT ${SCHEDULE_COLUMNS} FROM schedules WHERE workspace_id = ? ORDER BY updated_at DESC, rowid DESC`,
        )
        .all(workspaceId) as unknown as ScheduleRow[];
    }
    return this.#db
      .prepare(`SELECT ${SCHEDULE_COLUMNS} FROM schedules ORDER BY updated_at DESC, rowid DESC`)
      .all() as unknown as ScheduleRow[];
  }

  toggleSchedule(scheduleId: string, enabled: boolean): ScheduleRow {
    const wasInTx = this.#db.isTransaction;
    const ts = this.#nowIso();
    const row = txImmediate(this.#db, () => {
      const res = this.#db
        .prepare('UPDATE schedules SET enabled = ?, updated_at = ? WHERE schedule_id = ?')
        .run(enabled ? 1 : 0, ts, scheduleId);
      if (Number(res.changes) !== 1) {
        throw new RunwayError('SCHEDULE_NOT_FOUND', `Schedule '${scheduleId}' not found.`, {
          schedule_id: scheduleId,
        });
      }
      return this.getSchedule(scheduleId);
    });
    this.#emitAfterTx(wasInTx, { mutate: true });
    return row;
  }

  deleteSchedule(scheduleId: string): { readonly deleted: true; readonly schedule_id: string } {
    const wasInTx = this.#db.isTransaction;
    txImmediate(this.#db, () => {
      const res = this.#db
        .prepare('DELETE FROM schedules WHERE schedule_id = ?')
        .run(scheduleId);
      if (Number(res.changes) !== 1) {
        throw new RunwayError('SCHEDULE_NOT_FOUND', `Schedule '${scheduleId}' not found.`, {
          schedule_id: scheduleId,
        });
      }
    });
    this.#emitAfterTx(wasInTx, { mutate: true });
    return { deleted: true, schedule_id: scheduleId };
  }

  #createTaskFromScheduleTx(sch: ScheduleRow, ts: string): string {
    let parsedPayload: Record<string, unknown> = {};
    try {
      const raw = JSON.parse(sch.payload_json) as unknown;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        parsedPayload = raw as Record<string, unknown>;
      }
    } catch {
      parsedPayload = {};
    }

    const title =
      typeof parsedPayload.title === 'string' && parsedPayload.title.trim()
        ? parsedPayload.title.trim()
        : `Scheduled task (${sch.schedule_id})`;
    const goalPrompt =
      typeof parsedPayload.goal_prompt === 'string' && parsedPayload.goal_prompt.trim()
        ? parsedPayload.goal_prompt.trim()
        : typeof parsedPayload.prompt === 'string' && parsedPayload.prompt.trim()
          ? parsedPayload.prompt.trim()
          : `Execute schedule ${sch.schedule_id}`;
    const rawStages = Array.isArray(parsedPayload.stages) ? parsedPayload.stages : [];
    const stages =
      rawStages.length > 0
        ? rawStages
            .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
            .map((item, idx) => ({
              stage_id: typeof item.stage_id === 'string' && item.stage_id.trim() ? item.stage_id.trim() : `stage_${idx + 1}`,
              executor_id: typeof item.executor_id === 'string' && item.executor_id.trim() ? item.executor_id.trim() : 'codex',
              model_id: typeof item.model_id === 'string' && item.model_id.trim() ? item.model_id.trim() : null,
            }))
        : [{ stage_id: 'stage_1', executor_id: 'codex', model_id: null }];

    const taskId = newId('task');
    this.#db
      .prepare(
        'INSERT INTO tasks (task_id, workspace_id, agent_id, title, goal_prompt, status, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, \'active\', 1, ?, ?)',
      )
      .run(taskId, sch.workspace_id, sch.agent_id, title, goalPrompt, ts, ts);

    const insStage = this.#db.prepare(
      'INSERT INTO stage_runs (stage_run_id, task_id, stage_id, seq_no, status, executor_id, model_id, human_gate_json, revision, started_at, finished_at, updated_at) VALUES (?, ?, ?, ?, \'queued\', ?, ?, NULL, 1, NULL, NULL, ?)',
    );
    stages.forEach((st, idx) => {
      insStage.run(newId('sr'), taskId, st.stage_id, idx + 1, st.executor_id, st.model_id, ts);
    });
    return taskId;
  }

  #getScheduleLastTask(sch: ScheduleRow): TaskRow | null {
    if (!sch.last_task_id) return null;
    const row = this.#db
      .prepare(`SELECT ${TASK_COLUMNS} FROM tasks WHERE task_id = ?`)
      .get(sch.last_task_id) as TaskRow | undefined;
    return row ?? null;
  }

  tickDueSchedulesAtomic(
    nowIsoStr: string,
    computeNextRun: NextRunCalculator,
  ): ScheduleTickOutcome[] {
    const wasInTx = this.#db.isTransaction;
    const nowDate = new Date(nowIsoStr);
    const createdEvents: RunwayChangedEvent[] = [];
    const ledgerEvents: LedgerEntry[] = [];

    const outcomes = txImmediate(this.#db, () => {
      const dueRows = this.#db
        .prepare(
          `SELECT ${SCHEDULE_COLUMNS} FROM schedules WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at ASC, rowid ASC`,
        )
        .all(nowIsoStr) as unknown as ScheduleRow[];
      const dueIds = new Set(dueRows.map((r) => r.schedule_id));

      const bufferedOnlyRows = this.#db
        .prepare(
          `SELECT ${SCHEDULE_COLUMNS} FROM schedules WHERE enabled = 1 AND buffered_pending = 1 ORDER BY updated_at ASC, rowid ASC`,
        )
        .all() as unknown as ScheduleRow[];

      const results: ScheduleTickOutcome[] = [];

      // 1. Process due schedules (wake-from-sleep cap: at most 1 launch, jump next_run_at strictly > now)
      for (const sch of dueRows) {
        const nextRunAt = computeNextRun(sch.cron_expr, sch.timezone, nowDate);
        const policy = normalizeOverlapPolicy(sch.overlap_policy);

        if (policy === 'cancel_other') {
          const activeWsTasks = this.#db
            .prepare(
              `SELECT ${TASK_COLUMNS} FROM tasks WHERE workspace_id = ? AND status IN ('active', 'awaiting_human', 'paused_by_human') ORDER BY created_at ASC, rowid ASC`,
            )
            .all(sch.workspace_id) as unknown as TaskRow[];

          if (activeWsTasks.length === 0) {
            const newTaskId = this.#createTaskFromScheduleTx(sch, nowIsoStr);
            this.#db
              .prepare(
                'UPDATE schedules SET last_run_at = ?, last_task_id = ?, next_run_at = ?, buffered_pending = 0, last_status = \'launched\', updated_at = ? WHERE schedule_id = ?',
              )
              .run(nowIsoStr, newTaskId, nextRunAt, nowIsoStr, sch.schedule_id);
            createdEvents.push({ kind: 'task_created', task_id: newTaskId, status: 'active' });
            results.push({
              schedule_id: sch.schedule_id,
              action: 'launched',
              created_task_id: newTaskId,
              cancelled_task_id: null,
              cancelled_task_ids: [],
              next_run_at: nextRunAt,
              buffered_pending: 0,
            });
            continue;
          }

          if (activeWsTasks.some((t) => t.status === 'paused_by_human')) {
            this.#db
              .prepare(
                'UPDATE schedules SET next_run_at = ?, last_status = \'skipped_paused_by_human\', updated_at = ? WHERE schedule_id = ?',
              )
              .run(nextRunAt, nowIsoStr, sch.schedule_id);
            results.push({
              schedule_id: sch.schedule_id,
              action: 'skipped_overlap',
              created_task_id: null,
              cancelled_task_id: null,
              cancelled_task_ids: [],
              next_run_at: nextRunAt,
              buffered_pending: sch.buffered_pending,
            });
            continue;
          }

          const cancelledIds: string[] = [];
          for (const prevTask of activeWsTasks) {
            this.#db
              .prepare(
                'UPDATE tasks SET status = \'cancelled\', revision = revision + 1, updated_at = ? WHERE task_id = ?',
              )
              .run(nowIsoStr, prevTask.task_id);
            this.#db
              .prepare(
                'UPDATE attempts SET status = \'cancelled\', finished_at = ? WHERE status = \'running\' AND stage_run_id IN (SELECT stage_run_id FROM stage_runs WHERE task_id = ? AND status NOT IN (\'completed\', \'cancelled\', \'failed\'))',
              )
              .run(nowIsoStr, prevTask.task_id);
            this.#db
              .prepare(
                'UPDATE stage_runs SET status = \'cancelled\', finished_at = ?, revision = revision + 1, updated_at = ? WHERE task_id = ? AND status NOT IN (\'completed\', \'cancelled\', \'failed\')',
              )
              .run(nowIsoStr, nowIsoStr, prevTask.task_id);
            const firstPrevStage = this.#db
              .prepare(
                'SELECT stage_run_id FROM stage_runs WHERE task_id = ? ORDER BY seq_no ASC LIMIT 1',
              )
              .get(prevTask.task_id) as { stage_run_id: string } | undefined;
            const cancelEntry = appendEntryWithDb(this.#db, {
              task_id: prevTask.task_id,
              stage_run_id: firstPrevStage?.stage_run_id ?? null,
              entry_kind: 'human_decision',
              owner_id: 'opl.runway',
              payload: {
                decision: 'cancel',
                actor_id: 'opl.runway',
                reason: `cancelled_by_schedule_overlap:${sch.schedule_id}`,
              },
              created_at: nowIsoStr,
            });
            ledgerEvents.push(cancelEntry);
            createdEvents.push({ kind: 'task_cancelled', task_id: prevTask.task_id, status: 'cancelled' });
            cancelledIds.push(prevTask.task_id);
          }

          const newTaskId = this.#createTaskFromScheduleTx(sch, nowIsoStr);
          this.#db
            .prepare(
              'UPDATE schedules SET last_run_at = ?, last_task_id = ?, next_run_at = ?, buffered_pending = 0, last_status = \'cancelled_other_and_launched\', updated_at = ? WHERE schedule_id = ?',
            )
            .run(nowIsoStr, newTaskId, nextRunAt, nowIsoStr, sch.schedule_id);

          createdEvents.push({ kind: 'task_created', task_id: newTaskId, status: 'active' });
          results.push({
            schedule_id: sch.schedule_id,
            action: 'cancelled_other_and_launched',
            created_task_id: newTaskId,
            cancelled_task_id: cancelledIds[0] ?? null,
            cancelled_task_ids: cancelledIds,
            next_run_at: nextRunAt,
            buffered_pending: 0,
          });
          continue;
        }

        const prevTask = this.#getScheduleLastTask(sch);
        const isPrevActive =
          prevTask !== null
          && (prevTask.status === 'active'
            || prevTask.status === 'awaiting_human'
            || prevTask.status === 'paused_by_human');

        if (!isPrevActive) {
          const newTaskId = this.#createTaskFromScheduleTx(sch, nowIsoStr);
          this.#db
            .prepare(
              'UPDATE schedules SET last_run_at = ?, last_task_id = ?, next_run_at = ?, buffered_pending = 0, last_status = \'launched\', updated_at = ? WHERE schedule_id = ?',
            )
            .run(nowIsoStr, newTaskId, nextRunAt, nowIsoStr, sch.schedule_id);
          createdEvents.push({ kind: 'task_created', task_id: newTaskId, status: 'active' });
          results.push({
            schedule_id: sch.schedule_id,
            action: 'launched',
            created_task_id: newTaskId,
            cancelled_task_id: null,
            next_run_at: nextRunAt,
            buffered_pending: 0,
          });
          continue;
        }

        if (policy === 'skip') {
          this.#db
            .prepare(
              'UPDATE schedules SET next_run_at = ?, last_status = \'skipped_overlap\', updated_at = ? WHERE schedule_id = ?',
            )
            .run(nextRunAt, nowIsoStr, sch.schedule_id);
          results.push({
            schedule_id: sch.schedule_id,
            action: 'skipped_overlap',
            created_task_id: null,
            cancelled_task_id: null,
            next_run_at: nextRunAt,
            buffered_pending: sch.buffered_pending,
          });
          continue;
        }

        if (policy === 'buffer_one') {
          this.#db
            .prepare(
              'UPDATE schedules SET buffered_pending = 1, next_run_at = ?, last_status = \'buffered_one\', updated_at = ? WHERE schedule_id = ?',
            )
            .run(nextRunAt, nowIsoStr, sch.schedule_id);
          results.push({
            schedule_id: sch.schedule_id,
            action: 'buffered_one',
            created_task_id: null,
            cancelled_task_id: null,
            next_run_at: nextRunAt,
            buffered_pending: 1,
          });
          continue;
        }
      }

      // 2. Drain any buffered_pending schedules whose prior task has reached a terminal state
      for (const sch of bufferedOnlyRows) {
        if (dueIds.has(sch.schedule_id)) continue;
        const prevTask = this.#getScheduleLastTask(sch);
        const isPrevActive =
          prevTask !== null
          && (prevTask.status === 'active'
            || prevTask.status === 'awaiting_human'
            || prevTask.status === 'paused_by_human');
        if (isPrevActive) continue;

        const newTaskId = this.#createTaskFromScheduleTx(sch, nowIsoStr);
        this.#db
          .prepare(
            'UPDATE schedules SET last_run_at = ?, last_task_id = ?, buffered_pending = 0, last_status = \'launched_buffered\', updated_at = ? WHERE schedule_id = ?',
          )
          .run(nowIsoStr, newTaskId, nowIsoStr, sch.schedule_id);
        createdEvents.push({ kind: 'task_created', task_id: newTaskId, status: 'active' });
        results.push({
          schedule_id: sch.schedule_id,
          action: 'launched',
          created_task_id: newTaskId,
          cancelled_task_id: null,
          next_run_at: sch.next_run_at,
          buffered_pending: 0,
        });
      }

      return results;
    });

    if (outcomes.length > 0) {
      this.#emitAfterTx(wasInTx, {
        mutate: true,
        runway: createdEvents,
        ledger: ledgerEvents,
      });
    }
    return outcomes;
  }

  consumeBufferedScheduleAtomic(
    scheduleId: string,
    nowIsoStr: string,
    _computeNextRun: NextRunCalculator,
  ): ScheduleTickOutcome | null {
    const wasInTx = this.#db.isTransaction;
    const createdEvents: RunwayChangedEvent[] = [];

    const outcome = txImmediate(this.#db, () => {
      const sch = this.getSchedule(scheduleId);
      if (sch.enabled !== 1 || sch.buffered_pending !== 1) {
        return null;
      }
      const prevTask = this.#getScheduleLastTask(sch);
      const isPrevActive =
        prevTask !== null
        && (prevTask.status === 'active'
          || prevTask.status === 'awaiting_human'
          || prevTask.status === 'paused_by_human');
      if (isPrevActive) {
        return null;
      }

      const newTaskId = this.#createTaskFromScheduleTx(sch, nowIsoStr);
      this.#db
        .prepare(
          'UPDATE schedules SET last_run_at = ?, last_task_id = ?, buffered_pending = 0, last_status = \'launched_buffered\', updated_at = ? WHERE schedule_id = ?',
        )
        .run(nowIsoStr, newTaskId, nowIsoStr, sch.schedule_id);
      createdEvents.push({ kind: 'task_created', task_id: newTaskId, status: 'active' });
      return {
        schedule_id: sch.schedule_id,
        action: 'launched',
        created_task_id: newTaskId,
        cancelled_task_id: null,
        next_run_at: sch.next_run_at,
        buffered_pending: 0,
      } satisfies ScheduleTickOutcome;
    });

    if (outcome) {
      this.#emitAfterTx(wasInTx, {
        mutate: true,
        runway: createdEvents,
      });
    }
    return outcome;
  }
}
