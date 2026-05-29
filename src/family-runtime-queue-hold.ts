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
import { taskRowMatchesScope } from './family-runtime-task-scope.ts';

const HOLDABLE_STATUSES = new Set(['queued', 'retry_waiting']);

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
  const candidates = (db.prepare(`
    SELECT * FROM tasks WHERE status IN ('queued', 'retry_waiting') ORDER BY priority DESC, created_at ASC
  `).all() as FamilyRuntimeTaskRow[]).filter((row) => taskRowMatchesScope(row, input.taskScope));

  db.exec('BEGIN IMMEDIATE');
  try {
    const heldTaskIds: string[] = [];
    for (const row of candidates) {
      if (!HOLDABLE_STATUSES.has(row.status)) {
        continue;
      }
      const result = db.prepare(`
        UPDATE tasks
        SET status = 'waiting_approval', requires_approval = 1, approved_at = NULL,
          lease_owner = NULL, lease_expires_at = NULL, last_error = ?, dead_letter_reason = NULL,
          updated_at = ?
        WHERE task_id = ? AND status IN ('queued', 'retry_waiting')
      `).run(reason, heldAt, row.task_id);
      if (result.changes > 0) {
        heldTaskIds.push(row.task_id);
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
            authority_boundary: {
              opl: 'queue_admission_hold_only',
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
          },
        });
      }
    }
    db.exec('COMMIT');
    const heldTasks = heldTaskIds.map((taskId) =>
      taskToPayload(db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as FamilyRuntimeTaskRow)
    );
    return {
      held_count: heldTasks.length,
      idempotent_noop: heldTasks.length === 0,
      task_scope: input.taskScope,
      reason,
      held_tasks: heldTasks,
      authority_boundary: {
        opl: 'queue_admission_hold_only',
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
