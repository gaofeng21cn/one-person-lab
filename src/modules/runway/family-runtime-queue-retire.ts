import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../charter/index.ts';
import type { FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import { listStageAttemptsForTask, updateStageAttemptsForTask } from './family-runtime-stage-attempts.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  taskToPayload,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';
import { normalizeTaskScopeForStorage, taskRowMatchesScope } from './family-runtime-task-scope.ts';

const RETIRABLE_TASK_STATUSES = new Set(['queued', 'retry_waiting', 'waiting_approval', 'blocked', 'dead_letter']);
const RETIRABLE_ATTEMPT_STATUSES = new Set(['queued', 'running', 'checkpointed', 'human_gate', 'blocked']);

function scopeHasSelector(taskScope: FamilyRuntimeTaskScope) {
  return Boolean(taskScope.domainId || taskScope.taskKind || (taskScope.payloadMatches?.length ?? 0) > 0);
}

function retireReason(reason: string) {
  return `operator_retired_stale_runtime_residue:${reason}`;
}

export function retireFamilyRuntimeQueueResidue(
  db: DatabaseSync,
  input: {
    taskScope: FamilyRuntimeTaskScope;
    reason: string;
    source?: string;
  },
) {
  if (!scopeHasSelector(input.taskScope)) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime queue retire requires at least one task scope selector.', {
      required_scope_options: ['--domain', '--study', '--task-kind', '--payload-match'],
    });
  }
  const reason = input.reason.trim();
  if (!reason) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime queue retire requires --reason.', {
      usage: 'opl family-runtime queue retire --study <study_id> --reason <operator_reason>',
    });
  }
  const source = input.source?.trim() || 'opl-family-runtime-queue-retire';
  const taskScope = normalizeTaskScopeForStorage(input.taskScope);
  const retiredAt = nowIso();
  const blockedReason = retireReason(reason);
  const candidates = (db.prepare(`
    SELECT * FROM tasks
    WHERE status IN ('queued', 'retry_waiting', 'waiting_approval', 'blocked', 'dead_letter')
    ORDER BY priority DESC, created_at ASC
  `).all() as FamilyRuntimeTaskRow[]).filter((row) => taskRowMatchesScope(row, taskScope));

  db.exec('BEGIN IMMEDIATE');
  try {
    const retiredTaskIds: string[] = [];
    const retiredStageAttemptIds: string[] = [];
    for (const row of candidates) {
      if (!RETIRABLE_TASK_STATUSES.has(row.status)) {
        continue;
      }
      if (row.status === 'blocked' && row.dead_letter_reason === blockedReason) {
        continue;
      }
      const result = db.prepare(`
        UPDATE tasks
        SET status = 'blocked', requires_approval = 0, approved_at = NULL,
          lease_owner = NULL, lease_expires_at = NULL, last_error = ?,
          dead_letter_reason = ?, updated_at = ?
        WHERE task_id = ? AND status IN ('queued', 'retry_waiting', 'waiting_approval', 'blocked', 'dead_letter')
      `).run(blockedReason, blockedReason, retiredAt, row.task_id);
      if (result.changes <= 0) {
        continue;
      }
      retiredTaskIds.push(row.task_id);
      const retireAttemptIds = listStageAttemptsForTask(db, row.task_id)
        .filter((attempt) => RETIRABLE_ATTEMPT_STATUSES.has(attempt.status))
        .map((attempt) => attempt.stage_attempt_id);
      const stageAttempts = retireAttemptIds.length > 0
        ? updateStageAttemptsForTask(db, {
            taskId: row.task_id,
            stageAttemptIds: retireAttemptIds,
            status: 'blocked',
            blockedReason,
            activityEvent: {
              activity_kind: 'operator_retired_stale_runtime_residue',
              activity_status: 'blocked',
              reason,
              source,
              task_scope: taskScope,
              authority_boundary: {
                opl: 'queue_and_attempt_lifecycle_retirement_projection_only',
                domain: 'truth_quality_artifact_gate_owner',
                provider_completion_is_domain_ready: false,
              },
            },
          })
        : [];
      retiredStageAttemptIds.push(...stageAttempts.map((attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id));
      insertEvent(db, {
        taskId: row.task_id,
        domainId: row.domain_id,
        eventType: 'task_operator_retired_stale_runtime_residue',
        source,
        payload: {
          previous_status: row.status,
          next_status: 'blocked',
          reason,
          blocked_reason: blockedReason,
          task_scope: taskScope,
          retired_stage_attempt_ids: stageAttempts.map((attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id),
          authority_boundary: {
            opl: 'durable_queue_lifecycle_retirement_only',
            domain: 'truth_quality_artifact_gate_owner',
            can_write_domain_truth: false,
            can_authorize_quality_verdict: false,
            can_write_domain_artifacts: false,
            can_authorize_publication_readiness: false,
          },
        },
      });
      insertNotification(db, {
        taskId: row.task_id,
        severity: 'info',
        title: 'Family runtime task retired as stale residue',
        body: reason,
        payload: {
          reason,
          blocked_reason: blockedReason,
          source,
        },
      });
    }
    db.exec('COMMIT');
    const retiredTasks = retiredTaskIds.map((taskId) =>
      taskToPayload(db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow)
    );
    return {
      retired_count: retiredTasks.length,
      retired_attempt_count: retiredStageAttemptIds.length,
      idempotent_noop: retiredTasks.length === 0,
      task_scope: taskScope,
      reason,
      blocked_reason: blockedReason,
      retired_tasks: retiredTasks,
      retired_stage_attempt_ids: retiredStageAttemptIds,
      authority_boundary: {
        opl: 'durable_queue_lifecycle_retirement_only',
        domain: 'truth_quality_artifact_gate_owner',
        can_write_domain_truth: false,
        can_authorize_quality_verdict: false,
        can_write_domain_artifacts: false,
        can_authorize_publication_readiness: false,
      },
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the original queue retire error.
    }
    throw error;
  }
}
