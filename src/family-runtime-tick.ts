import { DatabaseSync } from 'node:sqlite';

import type {
  EnqueueInput,
  FamilyRuntimeDomainProfiles,
  FamilyRuntimeTaskScope,
} from './family-runtime-command.ts';
import { hydrateDomainTasks } from './family-runtime-domain-intake.ts';
import type { familyRuntimePaths, taskToPayload } from './family-runtime-store.ts';
import { insertEvent, type FamilyRuntimeTaskRow } from './family-runtime-store.ts';
import { normalizeTaskScopeForStorage, taskRowMatchesScope } from './family-runtime-task-scope.ts';
import { markStageAttemptOperatorHoldRequested } from './family-runtime-stage-attempt-control.ts';
import {
  listStageAttemptsForTask,
  syncStageAttemptFromTemporalTerminalObservation,
  updateStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';
import {
  findLiveMasDefaultExecutorDispatchAttempt,
  findLiveMasDefaultExecutorStudyAttempt,
  ensureProviderHostedStageAttempt,
  isMasDefaultExecutorDispatchTask,
  masDefaultExecutorDispatchIdentity,
  masDefaultExecutorDomainSourceFingerprint,
  masDefaultExecutorStudyActionIdentity,
  refreshMasDefaultExecutorLiveAttemptTaskLease,
  stageIdForProviderHostedTask,
} from './family-runtime-provider-hosted-attempts.ts';
import { redriveBlockedMasDefaultExecutorProviderTransportTask } from './family-runtime-redrive.ts';
import {
  MAS_PAPER_AUTONOMY_DOMAIN_HANDLER_CLOSEOUT_REQUIRED_REASON,
  MAS_PAPER_AUTONOMY_TASK_KINDS,
} from './family-runtime-paper-autonomy.ts';
import {
  applyProgressFirstAntiSpinGate,
} from './family-runtime-progress-first-anti-spin-gate.ts';
import {
  currentMasDefaultExecutorTasksByDispatch,
  currentMasDefaultExecutorTasksByStudyAction,
  dropCompletedMasDefaultExecutorRows,
  dropSameStudyMasDefaultExecutorRows,
  dropSupersededMasDefaultExecutorRows,
  MAS_DEFAULT_EXECUTOR_SUPERSEDED_REASON,
  payloadFromTask,
} from './family-runtime-tick-parts/mas-default-executor-currentness.ts';

type EnqueueTaskResult = {
  accepted?: boolean;
  requeued_from_terminal?: boolean;
  idempotent_noop?: boolean;
  task?: ReturnType<typeof taskToPayload>;
};

type EnqueueTask = (db: DatabaseSync, input: EnqueueInput) => EnqueueTaskResult;
type StageAttemptPayload = NonNullable<ReturnType<typeof findLiveMasDefaultExecutorDispatchAttempt>>;
type QueryTemporalStageAttempt = (attempt: StageAttemptPayload) => unknown | Promise<unknown>;
type RunFamilyRuntimeQueueTickInput = {
  source: string;
  limit: number;
  hydrate: boolean;
  taskScope?: FamilyRuntimeTaskScope;
  domainProfiles?: FamilyRuntimeDomainProfiles;
};
type RunFamilyRuntimeQueueTickHandlers<TDispatch> = {
  enqueueTask: EnqueueTask;
  dispatchTask: (
    db: DatabaseSync,
    paths: ReturnType<typeof familyRuntimePaths>,
    row: FamilyRuntimeTaskRow,
  ) => TDispatch | Promise<TDispatch>;
  queryTemporalStageAttempt?: QueryTemporalStageAttempt;
};
type MaintenanceReconcileResult = {
  masDefaultExecutorTerminalSyncedCount: number;
  repairedMissingIdentityRunningCount: number;
  repairedMissingIdentityDeadLetteredCount: number;
  repairedMissingIdentityTaskIds: Set<string>;
  repairedPaperAutonomyMissingCloseoutCount: number;
  repairedPaperAutonomyMissingCloseoutTaskIds: Set<string>;
  masDefaultExecutorSupersededAttemptReconciledCount: number;
  waitingApprovalAttemptReconciledCount: number;
  masDefaultExecutorAutoRedrivenCount: number;
  masDefaultExecutorAutoDeadLetteredCount: number;
  masDefaultExecutorAutoRedriveStaleSkippedCount: number;
};

const PROVIDER_TRANSPORT_REDRIVE_REASONS = new Set([
  'temporal_stage_attempt_start_failed',
  'temporal_stage_attempt_not_completed',
  'temporal_stage_attempt_failed',
]);

const MISSING_STAGE_ATTEMPT_IDENTITY_REPAIR_REASON = 'missing_stage_attempt_identity';
const WAITING_APPROVAL_ATTEMPT_RECONCILIATION_STATUSES = new Set(['queued', 'running', 'checkpointed']);

function reconcileHistoricalSupersededMasDefaultExecutorAttempts(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let reconciledAttemptCount = 0;
  for (const row of rows) {
    if (row.status !== 'blocked' || row.dead_letter_reason !== MAS_DEFAULT_EXECUTOR_SUPERSEDED_REASON) {
      continue;
    }
    const payload = payloadFromTask(row);
    if (!isMasDefaultExecutorDispatchTask(row, payload)) {
      continue;
    }
    const attempts = listStageAttemptsForTask(db, row.task_id).filter((attempt) => (
      attempt.status === 'queued'
      && attempt.provider_run.provider_status === 'registered'
    ));
    if (attempts.length === 0) {
      continue;
    }
    const reconciledAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      stageAttemptIds: attempts.map((attempt) => attempt.stage_attempt_id),
      status: 'blocked',
      blockedReason: MAS_DEFAULT_EXECUTOR_SUPERSEDED_REASON,
      activityEvent: {
        activity_kind: 'mas_default_executor_currentness',
        activity_status: 'blocked',
        blocked_reason: MAS_DEFAULT_EXECUTOR_SUPERSEDED_REASON,
        reason: 'historical_superseded_task_attempt_reconciliation',
        authority_boundary: {
          opl: 'queue_attempt_ledger_currentness_reconciliation_only',
          domain: 'truth_quality_artifact_gate_owner',
          provider_completion_is_domain_ready: false,
        },
      },
    });
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_default_executor_superseded_attempts_reconciled',
      source,
      payload: {
        reason: 'historical_superseded_task_attempt_reconciliation',
        dispatch_ref: payload.dispatch_ref ?? null,
        action_type: payload.action_type ?? null,
        study_id: payload.study_id ?? null,
        reconciled_stage_attempt_ids: reconciledAttempts.map((attempt) => attempt.stage_attempt_id),
        authority_boundary: {
          opl: 'queue_attempt_ledger_currentness_reconciliation_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          provider_stage_attempt_started: false,
        },
      },
    });
    reconciledAttemptCount += reconciledAttempts.length;
  }
  return reconciledAttemptCount;
}

function reconcileWaitingApprovalTaskAttempts(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  input: {
    source: string;
    taskScope?: FamilyRuntimeTaskScope;
  },
) {
  let reconciledAttemptCount = 0;
  for (const row of rows) {
    if (row.status !== 'waiting_approval' || !row.last_error) {
      continue;
    }
    const attempts = listStageAttemptsForTask(db, row.task_id).filter((attempt) => (
      WAITING_APPROVAL_ATTEMPT_RECONCILIATION_STATUSES.has(attempt.status)
      && attempt.provider_run.provider_status !== 'operator_hold_requested'
    ));
    if (attempts.length === 0) {
      continue;
    }
    const reconciledAttempts = attempts
      .map((attempt) => markStageAttemptOperatorHoldRequested(db, {
        stageAttemptId: attempt.stage_attempt_id,
        reason: row.last_error ?? 'waiting_approval',
        source: input.source,
        taskScope: input.taskScope ? normalizeTaskScopeForStorage(input.taskScope) : undefined,
      }))
      .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt));
    if (reconciledAttempts.length === 0) {
      continue;
    }
    const payload = payloadFromTask(row);
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_waiting_approval_attempts_reconciled',
      source: input.source,
      payload: {
        reason: row.last_error,
        dispatch_ref: payload.dispatch_ref ?? null,
        action_type: payload.action_type ?? null,
        study_id: payload.study_id ?? null,
        reconciled_stage_attempt_ids: reconciledAttempts.map((attempt) => attempt.stage_attempt_id),
        authority_boundary: {
          opl: 'queue_attempt_ledger_currentness_reconciliation_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          provider_stage_attempt_started: false,
        },
      },
    });
    reconciledAttemptCount += reconciledAttempts.length;
  }
  return reconciledAttemptCount;
}

function attemptCountForTask(db: DatabaseSync, taskId: string) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stage_attempts
    WHERE task_id = ?
  `).get(taskId) as { count: number };
  return row.count;
}

function isExpiredOrUnleasedRunningTask(row: FamilyRuntimeTaskRow) {
  if (row.status !== 'running') {
    return false;
  }
  if (!row.lease_expires_at) {
    return true;
  }
  const leaseExpiresAt = Date.parse(row.lease_expires_at);
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= Date.now();
}

function requiresProviderHostedStageAttemptIdentity(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  return stageIdForProviderHostedTask(row, payload) !== null;
}

function repairRunningTasksWithoutStageAttemptIdentity(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let repairedCount = 0;
  let deadLetteredCount = 0;
  const repairedTaskIds = new Set<string>();
  const repairedAt = new Date().toISOString();
  for (const row of rows) {
    if (!isExpiredOrUnleasedRunningTask(row) || listStageAttemptsForTask(db, row.task_id).length > 0) {
      continue;
    }
    const payload = payloadFromTask(row);
    if (!requiresProviderHostedStageAttemptIdentity(row, payload)) {
      continue;
    }
    const nextStatus = row.attempts >= row.max_attempts ? 'dead_letter' : 'retry_waiting';
    db.prepare(`
      UPDATE tasks
      SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ? AND status = 'running'
    `).run(
      nextStatus,
      MISSING_STAGE_ATTEMPT_IDENTITY_REPAIR_REASON,
      nextStatus === 'dead_letter' ? MISSING_STAGE_ATTEMPT_IDENTITY_REPAIR_REASON : null,
      repairedAt,
      row.task_id,
    );
    const stageAttempt = nextStatus === 'retry_waiting'
      ? ensureProviderHostedStageAttempt(db, {
        ...row,
        status: nextStatus,
        lease_owner: null,
        lease_expires_at: null,
        last_error: 'missing_stage_attempt_identity',
        dead_letter_reason: null,
        updated_at: repairedAt,
      }, payload, {
        newAttempt: true,
        eventSource: source,
      })
      : null;
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: nextStatus === 'dead_letter'
        ? 'task_dead_lettered_after_missing_stage_attempt_identity'
        : 'task_requeued_after_missing_stage_attempt_identity',
      source,
      payload: {
        previous_status: row.status,
        next_status: nextStatus,
        previous_attempts: row.attempts,
        max_attempts: row.max_attempts,
        repaired_stage_attempt_id: stageAttempt?.stage_attempt_id ?? null,
        reason: MISSING_STAGE_ATTEMPT_IDENTITY_REPAIR_REASON,
        authority_boundary: {
          opl: 'queue_attempt_identity_reconciliation_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
        },
      },
    });
    repairedTaskIds.add(row.task_id);
    repairedCount += 1;
    if (nextStatus === 'dead_letter') {
      deadLetteredCount += 1;
    }
  }
  return { repairedCount, deadLetteredCount, repairedTaskIds };
}

function repairSucceededMasPaperAutonomyTasksMissingCloseout(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let repairedCount = 0;
  const repairedTaskIds = new Set<string>();
  for (const row of rows) {
    if (
      row.domain_id !== 'medautoscience'
      || row.status !== 'succeeded'
      || !MAS_PAPER_AUTONOMY_TASK_KINDS.has(row.task_kind)
    ) {
      continue;
    }
    const attempts = listStageAttemptsForTask(db, row.task_id).filter((attempt) => (
      attempt.executor_kind === 'domain_handler'
      && attempt.status === 'checkpointed'
      && attempt.closeout_refs.length === 0
      && attempt.closeout_receipt_status === null
    ));
    if (attempts.length === 0) {
      continue;
    }
    const repairedAt = new Date().toISOString();
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ? AND status = 'succeeded'
    `).run(
      MAS_PAPER_AUTONOMY_DOMAIN_HANDLER_CLOSEOUT_REQUIRED_REASON,
      MAS_PAPER_AUTONOMY_DOMAIN_HANDLER_CLOSEOUT_REQUIRED_REASON,
      repairedAt,
      row.task_id,
    );
    const repairedAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      stageAttemptIds: attempts.map((attempt) => attempt.stage_attempt_id),
      status: 'blocked',
      blockedReason: MAS_PAPER_AUTONOMY_DOMAIN_HANDLER_CLOSEOUT_REQUIRED_REASON,
      activityEvent: {
        activity_kind: 'domain_handler_dispatch_activity',
        activity_status: 'blocked',
        blocked_reason: MAS_PAPER_AUTONOMY_DOMAIN_HANDLER_CLOSEOUT_REQUIRED_REASON,
      },
    });
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_repaired_from_succeeded_missing_domain_closeout',
      source,
      payload: {
        previous_status: row.status,
        next_status: 'blocked',
        reason: MAS_PAPER_AUTONOMY_DOMAIN_HANDLER_CLOSEOUT_REQUIRED_REASON,
        repaired_stage_attempt_ids: repairedAttempts.map((attempt) => attempt.stage_attempt_id),
        authority_boundary: {
          opl: 'queue_and_attempt_read_model_repair_only',
          domain: 'truth_quality_artifact_gate_owner',
          provider_completion_is_domain_ready: false,
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
        },
      },
    });
    repairedCount += 1;
    repairedTaskIds.add(row.task_id);
  }
  return { repairedCount, repairedTaskIds };
}

function autoRedriveBlockedMasDefaultExecutorProviderTasks(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let autoRedrivenCount = 0;
  let autoDeadLetteredCount = 0;
  let staleSkippedCount = 0;
  const redrivenAt = new Date().toISOString();
  const currentByIdentity = currentMasDefaultExecutorTasksByDispatch(rows);
  const currentByStudyAction = currentMasDefaultExecutorTasksByStudyAction(rows);
  for (const row of rows) {
    if (
      row.status !== 'blocked'
      || !PROVIDER_TRANSPORT_REDRIVE_REASONS.has(row.dead_letter_reason ?? '')
    ) {
      continue;
    }
    const payload = payloadFromTask(row);
    if (!isMasDefaultExecutorDispatchTask(row, payload)) {
      continue;
    }
    const identity = masDefaultExecutorDispatchIdentity(row, payload);
    const actionIdentity = masDefaultExecutorStudyActionIdentity(row, payload);
    const current = identity ? currentByIdentity.get(identity) : null;
    const currentAction = actionIdentity ? currentByStudyAction.get(actionIdentity) : null;
    const sourceFingerprint = masDefaultExecutorDomainSourceFingerprint(payload);
    if (
      current
      && current.task_id !== row.task_id
      && current.source_fingerprint
      && sourceFingerprint
      && current.source_fingerprint !== sourceFingerprint
    ) {
      staleSkippedCount += 1;
      insertEvent(db, {
        taskId: row.task_id,
        domainId: row.domain_id,
        eventType: 'task_default_executor_stale_auto_redrive_skip',
        source,
        payload: {
          reason: 'same_dispatch_newer_source_exists',
          current_task_id: current.task_id,
          current_source_fingerprint: current.source_fingerprint,
          stale_source_fingerprint: sourceFingerprint,
          dispatch_ref: payload.dispatch_ref ?? null,
          action_type: payload.action_type ?? null,
          study_id: payload.study_id ?? null,
          authority_boundary: {
            opl: 'queue_auto_redrive_currentness_filter_only',
            domain: 'truth_quality_artifact_gate_owner',
            domain_truth_mutation: false,
            publication_quality_mutation: false,
            artifact_gate_mutation: false,
            current_package_mutation: false,
          },
        },
      });
      continue;
    }
    if (
      currentAction
      && currentAction.task_id !== row.task_id
      && currentAction.source_fingerprint
      && sourceFingerprint
      && currentAction.source_fingerprint !== sourceFingerprint
    ) {
      staleSkippedCount += 1;
      insertEvent(db, {
        taskId: row.task_id,
        domainId: row.domain_id,
        eventType: 'task_default_executor_stale_auto_redrive_skip',
        source,
        payload: {
          reason: 'same_study_action_newer_source_exists',
          current_task_id: currentAction.task_id,
          current_source_fingerprint: currentAction.source_fingerprint,
          stale_source_fingerprint: sourceFingerprint,
          dispatch_ref: payload.dispatch_ref ?? null,
          action_type: payload.action_type ?? null,
          study_id: payload.study_id ?? null,
          authority_boundary: {
            opl: 'queue_auto_redrive_currentness_filter_only',
            domain: 'truth_quality_artifact_gate_owner',
            domain_truth_mutation: false,
            publication_quality_mutation: false,
            artifact_gate_mutation: false,
            current_package_mutation: false,
          },
        },
      });
      continue;
    }
    const usedAttempts = attemptCountForTask(db, row.task_id);
    if (usedAttempts >= row.max_attempts) {
      db.prepare(`
        UPDATE tasks
        SET status = 'dead_letter', lease_owner = NULL, lease_expires_at = NULL,
          last_error = ?, dead_letter_reason = ?, updated_at = ?
        WHERE task_id = ?
      `).run('retry_budget_exhausted', 'retry_budget_exhausted', redrivenAt, row.task_id);
      insertEvent(db, {
        taskId: row.task_id,
        domainId: row.domain_id,
        eventType: 'task_auto_dead_lettered_after_provider_transport_retries',
        source,
        payload: {
          previous_status: row.status,
          previous_dead_letter_reason: row.dead_letter_reason,
          used_attempts: usedAttempts,
          max_attempts: row.max_attempts,
          authority_boundary: {
            opl: 'provider_transport_retry_budget_only',
            domain: 'truth_quality_artifact_gate_owner',
            domain_truth_mutation: false,
            publication_quality_mutation: false,
            artifact_gate_mutation: false,
            current_package_mutation: false,
          },
        },
      });
      autoDeadLetteredCount += 1;
      continue;
    }
    const redrive = redriveBlockedMasDefaultExecutorProviderTransportTask(db, row, payload, {
      trigger: 'auto',
      source,
      usedAttempts,
      maxAttempts: row.max_attempts,
      redrivenAt,
    });
    if (redrive.provider_redrive_started ?? redrive.redriven) {
      autoRedrivenCount += 1;
    }
  }
  return { autoRedrivenCount, autoDeadLetteredCount, staleSkippedCount };
}

function isLiveMasDefaultExecutorAttempt(attempt: StageAttemptPayload | null) {
  return Boolean(attempt && ['queued', 'running', 'checkpointed', 'human_gate'].includes(attempt.status));
}

function isExpiredMasDefaultExecutorTaskLease(row: FamilyRuntimeTaskRow) {
  if (row.status !== 'running' || !row.lease_expires_at) {
    return false;
  }
  const leaseExpiresAt = Date.parse(row.lease_expires_at);
  return Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= Date.now();
}

function isObservableRunningMasDefaultExecutorAttempt(row: FamilyRuntimeTaskRow) {
  return (attempt: StageAttemptPayload) => {
    const observableStarted = attempt.provider_kind === 'temporal'
      && attempt.executor_kind === 'codex_cli'
      && ['running', 'checkpointed', 'human_gate'].includes(attempt.status);
    if (observableStarted) {
      return true;
    }
    return isExpiredMasDefaultExecutorTaskLease(row)
      && attempt.provider_kind === 'temporal'
      && attempt.executor_kind === 'codex_cli'
      && attempt.status === 'queued'
      && attempt.provider_run.provider_status === 'registered';
  };
}

function isProviderStartedMasDefaultExecutorAttempt(attempt: StageAttemptPayload) {
  return attempt.provider_kind === 'temporal'
    && attempt.executor_kind === 'codex_cli'
    && ['running', 'checkpointed', 'human_gate'].includes(attempt.status);
}

async function syncObservableMasDefaultExecutorAttempt(
  db: DatabaseSync,
  attempt: StageAttemptPayload,
  queryTemporalStageAttempt?: QueryTemporalStageAttempt,
) {
  if (!queryTemporalStageAttempt) {
    return attempt;
  }
  const observation = await queryTemporalStageAttempt(attempt);
  return syncStageAttemptFromTemporalTerminalObservation(db, observation) ?? attempt;
}

async function dropLiveMasDefaultExecutorRows(
  db: DatabaseSync,
  candidateRows: FamilyRuntimeTaskRow[],
  options: {
    queryTemporalStageAttempt?: QueryTemporalStageAttempt;
  } = {},
) {
  let liveSkippedCount = 0;
  let terminalSyncedCount = 0;
  const rows: FamilyRuntimeTaskRow[] = [];
  for (const row of candidateRows) {
    const payload = payloadFromTask(row);
    const liveAttempt = findLiveMasDefaultExecutorDispatchAttempt(db, row, payload);
    const liveStudyAttempt = liveAttempt ?? findLiveMasDefaultExecutorStudyAttempt(db, row, payload);
    if (!liveStudyAttempt) {
      rows.push(row);
      continue;
    }
    const syncedAttempt = await syncObservableMasDefaultExecutorAttempt(
      db,
      liveStudyAttempt,
      options.queryTemporalStageAttempt,
    );
    if (!isLiveMasDefaultExecutorAttempt(syncedAttempt)) {
      terminalSyncedCount += 1;
      rows.push(row);
      continue;
    }
    liveSkippedCount += 1;
    refreshMasDefaultExecutorLiveAttemptTaskLease(db, {
      attempt: syncedAttempt,
      source: 'opl-family-runtime-tick',
      reason: liveAttempt ? 'same_dispatch_live_stage_attempt_exists' : 'same_study_live_stage_attempt_exists',
    });
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_default_executor_live_dispatch_tick_skip',
      source: 'opl-family-runtime-tick',
      payload: {
        reason: liveAttempt ? 'same_dispatch_live_stage_attempt_exists' : 'same_study_live_stage_attempt_exists',
        live_task_id: liveStudyAttempt.task_id,
        stage_attempt_id: liveStudyAttempt.stage_attempt_id,
        dispatch_ref: payload.dispatch_ref ?? null,
        action_type: payload.action_type ?? null,
        live_action_type: liveStudyAttempt.workspace_locator.action_type ?? null,
        study_id: payload.study_id ?? null,
      },
    });
  }
  return { rows, liveSkippedCount, terminalSyncedCount };
}

async function syncRunningMasDefaultExecutorTaskAttempts(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  options: {
    queryTemporalStageAttempt?: QueryTemporalStageAttempt;
  } = {},
) {
  if (!options.queryTemporalStageAttempt) {
    return 0;
  }
  let terminalSyncedCount = 0;
  for (const row of rows) {
    if (row.status !== 'running') {
      continue;
    }
    const payload = payloadFromTask(row);
    if (!isMasDefaultExecutorDispatchTask(row, payload)) {
      continue;
    }
    const attempts = listStageAttemptsForTask(db, row.task_id).filter(
      isObservableRunningMasDefaultExecutorAttempt(row),
    );
    for (const attempt of attempts) {
      const syncedAttempt = await syncObservableMasDefaultExecutorAttempt(
        db,
        attempt,
        options.queryTemporalStageAttempt,
      );
      if (!isProviderStartedMasDefaultExecutorAttempt(syncedAttempt)) {
        terminalSyncedCount += 1;
      }
    }
  }
  return terminalSyncedCount;
}

function zeroMaintenanceReconcileResult(): MaintenanceReconcileResult {
  return {
    masDefaultExecutorTerminalSyncedCount: 0,
    repairedMissingIdentityRunningCount: 0,
    repairedMissingIdentityDeadLetteredCount: 0,
    repairedMissingIdentityTaskIds: new Set<string>(),
    repairedPaperAutonomyMissingCloseoutCount: 0,
    repairedPaperAutonomyMissingCloseoutTaskIds: new Set<string>(),
    masDefaultExecutorSupersededAttemptReconciledCount: 0,
    waitingApprovalAttemptReconciledCount: 0,
    masDefaultExecutorAutoRedrivenCount: 0,
    masDefaultExecutorAutoDeadLetteredCount: 0,
    masDefaultExecutorAutoRedriveStaleSkippedCount: 0,
  };
}

function mergeTaskIdSets(...sets: Set<string>[]) {
  return new Set(sets.flatMap((set) => [...set]));
}

async function runMaintenanceReconcile(
  db: DatabaseSync,
  input: RunFamilyRuntimeQueueTickInput,
  handlers: Pick<RunFamilyRuntimeQueueTickHandlers<unknown>, 'queryTemporalStageAttempt'>,
  excludeTaskIds: Set<string>,
): Promise<MaintenanceReconcileResult> {
  const rowsForMaintenance = () => (db.prepare('SELECT * FROM tasks').all() as FamilyRuntimeTaskRow[])
    .filter((row) => taskRowMatchesScope(row, input.taskScope) && !excludeTaskIds.has(row.task_id));
  const scopedRowsBeforeAutoRedrive = rowsForMaintenance();
  const masDefaultExecutorTerminalSyncedCount = await syncRunningMasDefaultExecutorTaskAttempts(
    db,
    scopedRowsBeforeAutoRedrive,
    { queryTemporalStageAttempt: handlers.queryTemporalStageAttempt },
  );
  const scopedRowsAfterTerminalSync = rowsForMaintenance();
  const missingIdentityRepairSource = `${input.source}:missing-identity-repair`;
  const {
    repairedCount: repairedMissingIdentityRunningCount,
    deadLetteredCount: repairedMissingIdentityDeadLetteredCount,
    repairedTaskIds: repairedMissingIdentityTaskIds,
  } = repairRunningTasksWithoutStageAttemptIdentity(
    db,
    scopedRowsAfterTerminalSync,
    missingIdentityRepairSource,
  );
  const scopedRowsAfterMissingIdentityRepair = rowsForMaintenance();
  const {
    repairedCount: repairedPaperAutonomyMissingCloseoutCount,
    repairedTaskIds: repairedPaperAutonomyMissingCloseoutTaskIds,
  } = repairSucceededMasPaperAutonomyTasksMissingCloseout(
    db,
    scopedRowsAfterMissingIdentityRepair,
    `${input.source}:paper-autonomy-closeout-repair`,
  );
  const scopedRowsAfterPaperAutonomyRepair = rowsForMaintenance();
  const masDefaultExecutorSupersededAttemptReconciledCount = reconcileHistoricalSupersededMasDefaultExecutorAttempts(
    db,
    scopedRowsAfterPaperAutonomyRepair,
    `${input.source}:superseded-attempt-reconcile`,
  );
  const scopedRowsAfterSupersededAttemptReconcile = rowsForMaintenance();
  const waitingApprovalAttemptReconciledCount = reconcileWaitingApprovalTaskAttempts(
    db,
    scopedRowsAfterSupersededAttemptReconcile,
    {
      source: `${input.source}:waiting-approval-attempt-reconcile`,
      taskScope: input.taskScope,
    },
  );
  const scopedRowsAfterWaitingApprovalAttemptReconcile = rowsForMaintenance();
  const {
    autoRedrivenCount: masDefaultExecutorAutoRedrivenCount,
    autoDeadLetteredCount: masDefaultExecutorAutoDeadLetteredCount,
    staleSkippedCount: masDefaultExecutorAutoRedriveStaleSkippedCount,
  } = autoRedriveBlockedMasDefaultExecutorProviderTasks(
    db,
    scopedRowsAfterWaitingApprovalAttemptReconcile,
    `${input.source}:auto-redrive`,
  );
  return {
    masDefaultExecutorTerminalSyncedCount,
    repairedMissingIdentityRunningCount,
    repairedMissingIdentityDeadLetteredCount,
    repairedMissingIdentityTaskIds,
    repairedPaperAutonomyMissingCloseoutCount,
    repairedPaperAutonomyMissingCloseoutTaskIds,
    masDefaultExecutorSupersededAttemptReconciledCount,
    waitingApprovalAttemptReconciledCount,
    masDefaultExecutorAutoRedrivenCount,
    masDefaultExecutorAutoDeadLetteredCount,
    masDefaultExecutorAutoRedriveStaleSkippedCount,
  };
}

async function selectDispatchCandidates(
  db: DatabaseSync,
  input: RunFamilyRuntimeQueueTickInput,
  handlers: Pick<RunFamilyRuntimeQueueTickHandlers<unknown>, 'queryTemporalStageAttempt'>,
  excludeTaskIds: Set<string>,
) {
  const candidateRows = db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('queued', 'retry_waiting')
    ORDER BY priority DESC, created_at ASC
  `).all() as FamilyRuntimeTaskRow[];
  const allRows = db.prepare('SELECT * FROM tasks').all() as FamilyRuntimeTaskRow[];
  const scopedRowsBeforeSupersededFilter = candidateRows.filter((row) =>
    taskRowMatchesScope(row, input.taskScope)
    && !excludeTaskIds.has(row.task_id)
  );
  const {
    rows: scopedRowsAfterCompletedCloseout,
    completedCloseoutReconciledCount: masDefaultExecutorCompletedCloseoutReconciledCount,
  } = dropCompletedMasDefaultExecutorRows(
    db,
    scopedRowsBeforeSupersededFilter,
    'opl-family-runtime-tick',
  );
  const {
    rows: scopedRowsAfterSuperseded,
    supersededCount: masDefaultExecutorSupersededCount,
  } = dropSupersededMasDefaultExecutorRows(
    db,
    scopedRowsAfterCompletedCloseout,
    allRows,
    'opl-family-runtime-tick',
  );
  const {
    rows: scopedRowsAfterStudySingleFlight,
    studySingleFlightSkippedCount: masDefaultExecutorStudySingleFlightSkippedCount,
  } = dropSameStudyMasDefaultExecutorRows(db, scopedRowsAfterSuperseded, 'opl-family-runtime-tick');
  const {
    rows: scopedRows,
    liveSkippedCount: masDefaultExecutorLiveSkippedCount,
    terminalSyncedCount: masDefaultExecutorLiveTerminalSyncedCount,
  } = await dropLiveMasDefaultExecutorRows(db, scopedRowsAfterStudySingleFlight, {
    queryTemporalStageAttempt: handlers.queryTemporalStageAttempt,
  });
  const {
    rows: scopedRowsAfterProgressFirstAntiSpin,
    blocked_count: progressFirstAntiSpinBlockedCount,
  } = applyProgressFirstAntiSpinGate(db, scopedRows, {
    source: `${input.source}:progress-first-anti-spin`,
  });
  const rows = scopedRowsAfterProgressFirstAntiSpin.slice(0, input.limit);
  const filteredCount = candidateRows.length - scopedRowsAfterProgressFirstAntiSpin.length;
  return {
    rows,
    filteredCount,
    masDefaultExecutorSupersededCount,
    masDefaultExecutorStudySingleFlightSkippedCount,
    masDefaultExecutorLiveSkippedCount,
    masDefaultExecutorLiveTerminalSyncedCount,
    masDefaultExecutorCompletedCloseoutReconciledCount,
    progressFirstAntiSpinBlockedCount,
  };
}

export async function runFamilyRuntimeQueueTick<TDispatch = unknown>(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  input: RunFamilyRuntimeQueueTickInput,
  handlers: RunFamilyRuntimeQueueTickHandlers<TDispatch>,
) {
  const hydration = input.hydrate
    ? hydrateDomainTasks(db, paths, {
      source: `${input.source}:hydrate`,
      taskScope: input.taskScope,
      domainProfiles: input.domainProfiles,
    }, handlers.enqueueTask)
    : {
      source: input.source,
      task_scope: input.taskScope ?? null,
      enqueued_count: 0,
      requeued_count: 0,
      idempotent_noop_count: 0,
      blocked_count: 0,
      filtered_count: 0,
      exports: [],
    };
  let maintenanceReconcile = zeroMaintenanceReconcileResult();
  let maintenanceReconcileRanBeforeDispatch = false;
  const noExcludedTaskIds = new Set<string>();
  let selection = await selectDispatchCandidates(db, input, handlers, noExcludedTaskIds);
  const selectionTotals = {
    masDefaultExecutorSupersededCount: selection.masDefaultExecutorSupersededCount,
    masDefaultExecutorStudySingleFlightSkippedCount: selection.masDefaultExecutorStudySingleFlightSkippedCount,
    masDefaultExecutorLiveSkippedCount: selection.masDefaultExecutorLiveSkippedCount,
    masDefaultExecutorLiveTerminalSyncedCount: selection.masDefaultExecutorLiveTerminalSyncedCount,
    masDefaultExecutorCompletedCloseoutReconciledCount:
      selection.masDefaultExecutorCompletedCloseoutReconciledCount,
    progressFirstAntiSpinBlockedCount: selection.progressFirstAntiSpinBlockedCount,
  };
  const selectedBeforeMaintenanceCount = selection.rows.length;
  if (selection.rows.length === 0) {
    maintenanceReconcileRanBeforeDispatch = true;
    maintenanceReconcile = await runMaintenanceReconcile(db, input, handlers, noExcludedTaskIds);
    if (maintenanceReconcile.masDefaultExecutorAutoRedrivenCount > 0) {
      const repairedTaskIds = mergeTaskIdSets(
        maintenanceReconcile.repairedMissingIdentityTaskIds,
        maintenanceReconcile.repairedPaperAutonomyMissingCloseoutTaskIds,
      );
      selection = await selectDispatchCandidates(db, input, handlers, repairedTaskIds);
      selectionTotals.masDefaultExecutorSupersededCount += selection.masDefaultExecutorSupersededCount;
      selectionTotals.masDefaultExecutorStudySingleFlightSkippedCount += selection.masDefaultExecutorStudySingleFlightSkippedCount;
      selectionTotals.masDefaultExecutorLiveSkippedCount += selection.masDefaultExecutorLiveSkippedCount;
      selectionTotals.masDefaultExecutorLiveTerminalSyncedCount += selection.masDefaultExecutorLiveTerminalSyncedCount;
      selectionTotals.masDefaultExecutorCompletedCloseoutReconciledCount +=
        selection.masDefaultExecutorCompletedCloseoutReconciledCount;
      selectionTotals.progressFirstAntiSpinBlockedCount += selection.progressFirstAntiSpinBlockedCount;
    }
  }
  const rows = selection.rows;
  const filteredCount = selection.filteredCount;
  const progressFirstOwnerDeltaAdmission = {
    surface_kind: 'opl_progress_first_owner_delta_admission',
    admission_policy: 'owner_delta_before_maintenance_reconcile',
    admission_status: selectedBeforeMaintenanceCount > 0
      ? 'selected_before_maintenance_reconcile'
      : rows.length > 0
        ? 'selected_after_maintenance_reconcile'
        : 'no_owner_delta_ready',
    selected_before_maintenance_count: selectedBeforeMaintenanceCount,
    final_selected_count: rows.length,
    maintenance_reconcile_ran_before_dispatch: maintenanceReconcileRanBeforeDispatch,
    maintenance_reconcile_deferred_by_owner_delta: selectedBeforeMaintenanceCount > 0,
    authority_boundary: {
      opl: 'queue_admission_ordering_and_provider_dispatch_only',
      domain: 'truth_quality_artifact_gate_owner',
      domain_truth_mutation: false,
      publication_quality_mutation: false,
      artifact_gate_mutation: false,
      current_package_mutation: false,
    },
  };
  insertEvent(db, {
    eventType: 'tick_started',
    source: input.source,
    payload: {
      limit: input.limit,
      selected_count: rows.length,
      filtered_count: filteredCount,
      mas_default_executor_superseded_count: selectionTotals.masDefaultExecutorSupersededCount,
      mas_default_executor_study_single_flight_skipped_count: selectionTotals.masDefaultExecutorStudySingleFlightSkippedCount,
      mas_default_executor_live_skipped_count: selectionTotals.masDefaultExecutorLiveSkippedCount,
      mas_default_executor_terminal_synced_count: maintenanceReconcile.masDefaultExecutorTerminalSyncedCount
        + selectionTotals.masDefaultExecutorLiveTerminalSyncedCount,
      mas_default_executor_superseded_attempt_reconciled_count:
        maintenanceReconcile.masDefaultExecutorSupersededAttemptReconciledCount,
      waiting_approval_attempt_reconciled_count: maintenanceReconcile.waitingApprovalAttemptReconciledCount,
      repaired_missing_identity_running_count: maintenanceReconcile.repairedMissingIdentityRunningCount,
      repaired_missing_identity_dead_lettered_count: maintenanceReconcile.repairedMissingIdentityDeadLetteredCount,
      repaired_paper_autonomy_missing_closeout_count: maintenanceReconcile.repairedPaperAutonomyMissingCloseoutCount,
      mas_default_executor_auto_redriven_count: maintenanceReconcile.masDefaultExecutorAutoRedrivenCount,
      mas_default_executor_auto_dead_lettered_count: maintenanceReconcile.masDefaultExecutorAutoDeadLetteredCount,
      mas_default_executor_auto_redrive_stale_skipped_count: maintenanceReconcile.masDefaultExecutorAutoRedriveStaleSkippedCount,
      mas_default_executor_completed_closeout_reconciled_count:
        selectionTotals.masDefaultExecutorCompletedCloseoutReconciledCount,
      progress_first_anti_spin_blocked_count: selectionTotals.progressFirstAntiSpinBlockedCount,
      progress_first_owner_delta_admission: progressFirstOwnerDeltaAdmission,
      task_scope: input.taskScope ?? null,
    },
  });
  const dispatches = await Promise.all(rows.map((row) => handlers.dispatchTask(db, paths, row)));
  insertEvent(db, {
    eventType: 'tick_completed',
    source: input.source,
    payload: { dispatches_count: dispatches.length },
  });
  return {
    source: input.source,
    task_scope: input.taskScope ?? null,
    hydration,
    selected_count: rows.length,
    filtered_count: filteredCount,
    mas_default_executor_superseded_count: selectionTotals.masDefaultExecutorSupersededCount,
    mas_default_executor_study_single_flight_skipped_count: selectionTotals.masDefaultExecutorStudySingleFlightSkippedCount,
    mas_default_executor_live_skipped_count: selectionTotals.masDefaultExecutorLiveSkippedCount,
    mas_default_executor_terminal_synced_count: maintenanceReconcile.masDefaultExecutorTerminalSyncedCount
      + selectionTotals.masDefaultExecutorLiveTerminalSyncedCount,
    mas_default_executor_superseded_attempt_reconciled_count:
      maintenanceReconcile.masDefaultExecutorSupersededAttemptReconciledCount,
    waiting_approval_attempt_reconciled_count: maintenanceReconcile.waitingApprovalAttemptReconciledCount,
    repaired_missing_identity_running_count: maintenanceReconcile.repairedMissingIdentityRunningCount,
    repaired_missing_identity_dead_lettered_count: maintenanceReconcile.repairedMissingIdentityDeadLetteredCount,
    repaired_paper_autonomy_missing_closeout_count: maintenanceReconcile.repairedPaperAutonomyMissingCloseoutCount,
    mas_default_executor_auto_redriven_count: maintenanceReconcile.masDefaultExecutorAutoRedrivenCount,
    mas_default_executor_auto_dead_lettered_count: maintenanceReconcile.masDefaultExecutorAutoDeadLetteredCount,
    mas_default_executor_auto_redrive_stale_skipped_count: maintenanceReconcile.masDefaultExecutorAutoRedriveStaleSkippedCount,
    mas_default_executor_completed_closeout_reconciled_count:
      selectionTotals.masDefaultExecutorCompletedCloseoutReconciledCount,
    progress_first_anti_spin_blocked_count: selectionTotals.progressFirstAntiSpinBlockedCount,
    progress_first_owner_delta_admission: progressFirstOwnerDeltaAdmission,
    dispatches,
  };
}
