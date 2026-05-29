import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  taskToPayload,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';
import type { FamilyRuntimeTaskScope } from './family-runtime-command.ts';
import { normalizeTaskScopeForStorage, taskRowMatchesScope } from './family-runtime-task-scope.ts';
import { upsertFamilyRuntimeQueueHold } from './family-runtime-queue-holds.ts';
import { markStageAttemptOperatorHoldRequested } from './family-runtime-stage-attempt-control.ts';
import { listStageAttemptsForTask } from './family-runtime-stage-attempts.ts';

const HOLDABLE_STATUSES = new Set(['queued', 'retry_waiting', 'running']);
const ATTEMPT_HOLD_STATUSES = new Set(['queued', 'running', 'checkpointed', 'human_gate']);

function scopeHasSelector(taskScope: FamilyRuntimeTaskScope) {
  return Boolean(taskScope.domainId || taskScope.taskKind || (taskScope.payloadMatches?.length ?? 0) > 0);
}

export function holdFamilyRuntimeQueueTasks(
  db: DatabaseSync,
  input: {
    taskScope: FamilyRuntimeTaskScope;
    reason: string;
    source?: string;
  },
) {
  if (!scopeHasSelector(input.taskScope)) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime queue hold requires at least one task scope selector.', {
      required_scope_options: ['--domain', '--study', '--task-kind', '--payload-match'],
    });
  }
  const reason = input.reason.trim();
  if (!reason) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime queue hold requires --reason.', {
      usage: 'opl family-runtime queue hold --study <study_id> --reason <operator_reason>',
    });
  }
  const source = input.source?.trim() || 'opl-family-runtime-queue-hold';
  const heldAt = nowIso();
  const activeHold = upsertFamilyRuntimeQueueHold(db, {
    taskScope: input.taskScope,
    reason,
    source,
  });
  const candidates = (db.prepare(`
    SELECT * FROM tasks WHERE status IN ('queued', 'retry_waiting', 'running') ORDER BY priority DESC, created_at ASC
  `).all() as FamilyRuntimeTaskRow[]).filter((row) => taskRowMatchesScope(row, input.taskScope));

  db.exec('BEGIN IMMEDIATE');
  try {
    const heldTaskIds: string[] = [];
    const heldAttemptIds: string[] = [];
    for (const row of candidates) {
      if (!HOLDABLE_STATUSES.has(row.status)) {
        continue;
      }
      const result = db.prepare(`
        UPDATE tasks
        SET status = 'waiting_approval', requires_approval = 1, approved_at = NULL,
          lease_owner = NULL, lease_expires_at = NULL, last_error = ?, dead_letter_reason = NULL,
          updated_at = ?
        WHERE task_id = ? AND status IN ('queued', 'retry_waiting', 'running')
      `).run(reason, heldAt, row.task_id);
      if (result.changes > 0) {
        heldTaskIds.push(row.task_id);
        const heldAttempts = listStageAttemptsForTask(db, row.task_id)
          .filter((attempt) => ATTEMPT_HOLD_STATUSES.has(attempt.status))
          .map((attempt) => markStageAttemptOperatorHoldRequested(db, {
            stageAttemptId: attempt.stage_attempt_id,
            reason,
            source,
            taskScope: normalizeTaskScopeForStorage(input.taskScope),
            holdId: activeHold.hold_id,
          }))
          .filter((attempt): attempt is NonNullable<typeof attempt> => Boolean(attempt));
        heldAttemptIds.push(...heldAttempts.map((attempt) => attempt.stage_attempt_id));
        insertEvent(db, {
          taskId: row.task_id,
          domainId: row.domain_id,
          eventType: 'task_operator_held',
          source,
          payload: {
            previous_status: row.status,
            next_status: 'waiting_approval',
            reason,
            task_scope: input.taskScope,
            hold_id: activeHold.hold_id,
            held_stage_attempt_ids: heldAttempts.map((attempt) => attempt.stage_attempt_id),
            authority_boundary: {
              opl: 'durable_queue_admission_and_attempt_pause_projection_only',
              domain: 'truth_quality_artifact_gate_owner',
              can_write_domain_truth: false,
              can_authorize_quality_verdict: false,
            },
          },
        });
        insertNotification(db, {
          taskId: row.task_id,
          severity: 'warning',
          title: 'Family runtime task held for approval',
          body: reason,
          payload: {
            reason,
            source,
            hold_id: activeHold.hold_id,
          },
        });
      }
    }
    db.exec('COMMIT');
    const heldTasks = heldTaskIds.map((taskId) =>
      taskToPayload(db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow)
    );
    return {
      active_hold: activeHold,
      held_count: heldTasks.length,
      active_task_hold_count: candidates.filter((row) => row.status === 'running').length,
      held_attempt_count: heldAttemptIds.length,
      idempotent_noop: heldTasks.length === 0,
      task_scope: input.taskScope,
      reason,
      held_tasks: heldTasks,
      held_stage_attempt_ids: heldAttemptIds,
      authority_boundary: {
        opl: 'durable_queue_admission_and_attempt_pause_projection_only',
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
      // Preserve the original queue hold error.
    }
    throw error;
  }
}
