import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../kernel/contract-validation.ts';
import type { FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import {
  activeFamilyRuntimeQueueHolds,
  releaseFamilyRuntimeQueueHoldRows,
} from './family-runtime-queue-holds.ts';
import { normalizeTaskScopeForStorage, taskRowMatchesScope } from './family-runtime-task-scope.ts';
import { listStageAttemptsForTask, updateStageAttemptsForTask } from './family-runtime-stage-attempts.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  taskToPayload,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';

function scopeHasSelector(taskScope: FamilyRuntimeTaskScope) {
  return Boolean(taskScope.domainId || taskScope.taskKind || (taskScope.payloadMatches?.length ?? 0) > 0);
}

function heldAttemptIdsForReason(db: DatabaseSync, taskId: string, reason: string) {
  return listStageAttemptsForTask(db, taskId)
    .filter((attempt) =>
      attempt.status === 'human_gate'
      && attempt.blocked_reason === reason
      && attempt.provider_run.provider_status === 'operator_hold_requested'
    )
    .map((attempt) => attempt.stage_attempt_id);
}

export function releaseFamilyRuntimeQueueHold(
  db: DatabaseSync,
  input: {
    taskScope: FamilyRuntimeTaskScope;
    reason: string;
    source?: string;
    repairStrandedHold?: boolean;
  },
) {
  if (!scopeHasSelector(input.taskScope)) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime queue release requires at least one task scope selector.', {
      required_scope_options: ['--domain', '--study', '--task-kind', '--payload-match'],
    });
  }
  const reason = input.reason.trim();
  if (!reason) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime queue release requires --reason.', {
      usage: 'opl family-runtime queue release --study <study_id> --reason <operator_reason>',
    });
  }
  const source = input.source?.trim() || 'opl-family-runtime-queue-release';
  const taskScope = normalizeTaskScopeForStorage(input.taskScope);
  const activeHolds = activeFamilyRuntimeQueueHolds(db).filter((hold) =>
    hold.reason === reason
    && JSON.stringify(normalizeTaskScopeForStorage(hold.scope)) === JSON.stringify(taskScope)
  );
  const heldCandidates = (db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'waiting_approval' AND last_error = ?
    ORDER BY priority DESC, created_at ASC
  `).all(reason) as FamilyRuntimeTaskRow[]).filter((row) => taskRowMatchesScope(row, taskScope));
  const releasedAt = nowIso();
  const repairStrandedHold = input.repairStrandedHold === true;

  db.exec('BEGIN IMMEDIATE');
  try {
    const releasedHolds = releaseFamilyRuntimeQueueHoldRows(db, {
      taskScope,
      reason,
      releasedAt,
    });
    const releasedTaskIds: string[] = [];
    const releasedStageAttemptIds: string[] = [];
    const releaseTaskAdmission = releasedHolds.length > 0 || repairStrandedHold;
    for (const row of releaseTaskAdmission ? heldCandidates : []) {
      const result = db.prepare(`
        UPDATE tasks
        SET status = 'queued', requires_approval = 0, approved_at = ?, lease_owner = NULL,
          lease_expires_at = NULL, last_error = NULL, dead_letter_reason = NULL,
          updated_at = ?
        WHERE task_id = ? AND status = 'waiting_approval' AND last_error = ?
      `).run(releasedAt, releasedAt, row.task_id, reason);
      if (result.changes <= 0) {
        continue;
      }
      releasedTaskIds.push(row.task_id);
      const releasedAttemptIds = heldAttemptIdsForReason(db, row.task_id, reason);
      if (releasedAttemptIds.length > 0) {
        const releasedAttempts = updateStageAttemptsForTask(db, {
          taskId: row.task_id,
          stageAttemptIds: releasedAttemptIds,
          status: 'queued',
          blockedReason: null,
          activityEvent: {
            activity_kind: 'operator_hold_released',
            activity_status: 'queued',
            reason,
            source,
            repair_stranded_hold: repairStrandedHold && releasedHolds.length === 0,
            released_hold_ids: releasedHolds.map((hold) => hold.hold_id),
            authority_boundary: {
              opl: 'queue_and_attempt_admission_release_projection_only',
              domain: 'truth_quality_artifact_gate_owner',
              provider_completion_is_domain_ready: false,
            },
          },
        });
        releasedStageAttemptIds.push(...releasedAttempts.map((attempt) => attempt.stage_attempt_id));
      }
      insertEvent(db, {
        taskId: row.task_id,
        domainId: row.domain_id,
        eventType: 'task_operator_hold_released',
        source,
        payload: {
          previous_status: row.status,
          next_status: 'queued',
          reason,
          task_scope: taskScope,
          repair_stranded_hold: repairStrandedHold && releasedHolds.length === 0,
          released_hold_ids: releasedHolds.map((hold) => hold.hold_id),
          released_stage_attempt_ids: releasedAttemptIds,
          authority_boundary: {
            opl: 'durable_queue_admission_release_only',
            domain: 'truth_quality_artifact_gate_owner',
            can_write_domain_truth: false,
            can_authorize_quality_verdict: false,
            can_write_domain_artifacts: false,
          },
        },
      });
      insertNotification(db, {
        taskId: row.task_id,
        severity: 'info',
        title: 'Family runtime queue hold released',
        body: reason,
        payload: {
          reason,
          source,
          repair_stranded_hold: repairStrandedHold && releasedHolds.length === 0,
          released_hold_ids: releasedHolds.map((hold) => hold.hold_id),
        },
      });
    }
    db.exec('COMMIT');
    const releasedTasks = releasedTaskIds.map((taskId) =>
      taskToPayload(db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow)
    );
    return {
      released_hold_count: releasedHolds.length,
      idempotent_noop: releasedHolds.length === 0 && releasedTasks.length === 0,
      released_holds: releasedHolds,
      active_hold_count_before_release: activeHolds.length,
      repair_stranded_hold_requested: repairStrandedHold,
      stranded_hold_repair_applied: repairStrandedHold && releasedHolds.length === 0 && releasedTasks.length > 0,
      released_count: releasedTasks.length,
      released_attempt_count: releasedStageAttemptIds.length,
      task_scope: taskScope,
      reason,
      released_tasks: releasedTasks,
      released_stage_attempt_ids: releasedStageAttemptIds,
      authority_boundary: {
        opl: 'durable_queue_admission_release_and_attempt_resume_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        can_authorize_quality_verdict: false,
        can_write_domain_artifacts: false,
      },
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the original queue release error.
    }
    throw error;
  }
}
