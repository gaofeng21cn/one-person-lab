import type { AppendLedgerEntryInput, LedgerEntry } from '@opl/ledger';
import { RunwayError } from './errors.ts';

export type TaskStatus =
  | 'active'
  | 'paused_by_human'
  | 'awaiting_human'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type StageRunStatus =
  | 'queued'
  | 'running'
  | 'awaiting_review'
  | 'repair_required'
  | 'human_gate'
  | 'paused_by_human'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AttemptRole = 'producer' | 'reviewer' | 'repairer' | 'utility';

export type AttemptStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'interrupted'
  | 'cancelled'
  | 'timed_out';

export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type OverlapPolicy = 'skip' | 'buffer_one' | 'cancel_other';
export type OverlapPolicyInput = OverlapPolicy | 'queue' | 'allow';

export function normalizeOverlapPolicy(input?: string | null): OverlapPolicy {
  if (input === undefined || input === null || input === '') {
    return 'skip';
  }
  const normalized = input.trim().toLowerCase();
  if (normalized === 'skip') return 'skip';
  if (normalized === 'buffer_one' || normalized === 'queue') return 'buffer_one';
  if (normalized === 'cancel_other' || normalized === 'allow') return 'cancel_other';
  throw new RunwayError('INVALID_INPUT', `Unsupported overlap_policy '${input}'.`, {
    overlap_policy: input,
  });
}

export interface TaskRow {
  readonly task_id: string;
  readonly workspace_id: string;
  readonly agent_id: string | null;
  readonly title: string;
  readonly goal_prompt: string;
  readonly status: TaskStatus;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface StageRunRow {
  readonly stage_run_id: string;
  readonly task_id: string;
  readonly stage_id: string;
  readonly seq_no: number;
  readonly status: StageRunStatus;
  readonly executor_id: string;
  readonly model_id: string | null;
  readonly human_gate_json: string | null;
  readonly revision: number;
  readonly started_at: string | null;
  readonly finished_at: string | null;
  readonly updated_at: string;
}

export interface AttemptRow {
  readonly reviewed_attempt_id: string | null;
  readonly attempt_id: string;
  readonly stage_run_id: string;
  readonly attempt_no: number;
  readonly role: AttemptRole;
  readonly executor_id: string;
  readonly executor_session_ref: string | null;
  readonly local_pid: number | null;
  readonly status: AttemptStatus;
  readonly lease_expires_at: string | null;
  readonly usage_json: string;
  readonly error_json: string | null;
  readonly started_at: string;
  readonly finished_at: string | null;
}

export interface ScheduleRow {
  readonly schedule_id: string;
  readonly workspace_id: string;
  readonly agent_id: string | null;
  readonly cron_expr: string;
  readonly timezone: string;
  readonly overlap_policy: OverlapPolicy;
  readonly payload_json: string;
  readonly enabled: number;
  readonly next_run_at: string;
  readonly last_run_at: string | null;
  readonly last_task_id: string | null;
  readonly buffered_pending: number;
  readonly last_status: string | null;
  readonly updated_at: string;
}

export interface TaskBundle {
  readonly task_id: string;
  readonly status: TaskStatus;
  readonly task: TaskRow;
  readonly stage_runs: StageRunRow[];
  readonly attempts: AttemptRow[];
  readonly human_gate: unknown;
}

export interface StageDefinitionInput {
  readonly stage_id?: string;
  readonly executor_id?: string;
  readonly model_id?: string | null;
}

export interface CreateTaskInput {
  readonly task_id?: string;
  readonly workspace_id: string;
  readonly agent_id?: string | null;
  readonly title: string;
  readonly goal_prompt: string;
  readonly stages?: readonly StageDefinitionInput[];
}

export interface ListTasksFilter {
  readonly workspace_id?: string;
  readonly status?: TaskStatus;
}

export interface UpdateTaskStatusInput {
  readonly task_id: string;
  readonly status: TaskStatus;
  readonly expected_revision?: number;
}

export interface CreateAttemptInput {
  readonly resume_session_ref?: string;
  readonly reviewed_attempt_id?: string;
  readonly attempt_id?: string;
  readonly stage_run_id: string;
  readonly expected_stage_revision: number;
  readonly role: AttemptRole;
  readonly executor_id: string;
  readonly lease_expires_at: string;
}

export interface CreateAttemptResult {
  readonly stage_run: StageRunRow;
  readonly attempt: AttemptRow;
}

export interface BindAttemptSessionInput {
  readonly attempt_id: string;
  readonly executor_session_ref?: string | null;
  readonly local_pid?: number | null;
}

export interface AttemptUpdatePayload {
  readonly attempt_id: string;
  readonly status: Exclude<AttemptStatus, 'running'>;
  readonly usage_json?: string;
  readonly error_json?: string | null;
}

export interface CommitStageTransitionInput {
  readonly stage_run_id: string;
  readonly expected_revision: number;
  readonly next_stage_status: StageRunStatus;
  readonly human_gate_json?: string | null;
  readonly task_status?: TaskStatus;
  readonly attempt_update?: AttemptUpdatePayload;
  readonly ledger_entries?: readonly AppendLedgerEntryInput[];
}

export interface CommitStageTransitionResult {
  readonly stage_run: StageRunRow;
  readonly task: TaskRow;
  readonly attempt: AttemptRow | null;
  readonly ledger_entries: LedgerEntry[];
}

export interface PauseTaskInput {
  readonly task_id: string;
  readonly reason?: string;
  readonly actor_id?: string;
}

export interface ResumeTaskInput {
  readonly task_id: string;
  readonly reason?: string;
  readonly actor_id?: string;
}

export interface CancelTaskInput {
  readonly task_id: string;
  readonly reason?: string;
  readonly actor_id?: string;
}

export interface TaskControlResult {
  readonly ok: true;
  readonly task_id: string;
  readonly status: TaskStatus;
  readonly task: TaskRow;
  readonly stage_runs: StageRunRow[];
  readonly ledger_entry: LedgerEntry;
}

export interface ResolveHumanGateInput {
  readonly stage_run_id: string;
  readonly decision: string;
  readonly expected_revision?: number;
  readonly actor_id?: string;
  readonly waived_debt_ids?: readonly string[];
  readonly notes?: string;
}

export interface ResolveHumanGateResult {
  readonly ok: true;
  readonly stage_run_id: string;
  readonly task_id: string;
  readonly revision: number;
  readonly status: StageRunStatus;
  readonly ledger_entry: LedgerEntry;
}

export interface RunningAttemptContext {
  readonly attempt_id: string;
  readonly stage_run_id: string;
  readonly attempt_no: number;
  readonly role: AttemptRole;
  readonly executor_id: string;
  readonly executor_session_ref: string | null;
  readonly local_pid: number | null;
  readonly lease_expires_at: string | null;
  readonly started_at: string;
  readonly task_id: string;
  readonly stage_id: string;
  readonly seq_no: number;
  readonly stage_status: StageRunStatus;
  readonly stage_revision: number;
  readonly model_id: string | null;
  readonly task_status: TaskStatus;
  readonly workspace_id: string;
  readonly workspace_root: string;
  readonly agent_id: string | null;
}

export interface UpsertScheduleInput {
  readonly schedule_id?: string;
  readonly workspace_id: string;
  readonly agent_id?: string | null;
  readonly cron_expr: string;
  readonly timezone?: string;
  readonly overlap_policy?: OverlapPolicyInput;
  readonly payload: Record<string, unknown>;
  readonly enabled?: boolean;
  readonly next_run_at?: string;
}

export type NextRunCalculator = (
  cronExpr: string,
  timezone: string,
  afterDate: Date,
) => string;

export interface ScheduleTickOutcome {
  readonly schedule_id: string;
  readonly action: 'launched' | 'skipped_overlap' | 'buffered_one' | 'cancelled_other_and_launched' | 'skipped_invalid';
  readonly created_task_id: string | null;
  readonly cancelled_task_id: string | null;
  readonly cancelled_task_ids?: readonly string[];
  readonly next_run_at: string;
  readonly buffered_pending: number;
}

export type RunwayChangedEvent =
  | { readonly kind: 'task_created'; readonly task_id: string; readonly status: TaskStatus }
  | { readonly kind: 'task_paused'; readonly task_id: string; readonly status: 'paused_by_human' }
  | { readonly kind: 'task_resumed'; readonly task_id: string; readonly status: 'active' }
  | { readonly kind: 'task_cancelled'; readonly task_id: string; readonly status: 'cancelled' }
  | {
      readonly kind: 'stage_transitioned';
      readonly task_id: string;
      readonly stage_run_id: string;
      readonly status: StageRunStatus;
      readonly revision: number;
    }
  | {
      readonly kind: 'human_gate_resolved';
      readonly task_id: string;
      readonly stage_run_id: string;
      readonly status: StageRunStatus;
      readonly revision: number;
    }
  | {
      readonly kind: 'executor_event';
      readonly task_id: string;
      readonly stage_run_id: string;
      readonly attempt_id: string;
      readonly event: unknown;
    }
  | {
      readonly kind: 'reconciled';
      readonly task_id: string;
      readonly stage_run_id: string;
      readonly attempt_id: string;
      readonly state: string;
    };

export interface ReconcileReport {
  readonly scanned_attempts: number;
  readonly scanned_orphaned_stages: number;
  readonly reattached: number;
  readonly harvested: number;
  readonly interrupted: number;
  readonly skipped_paused: number;
  readonly skipped_preserved: number;
}
