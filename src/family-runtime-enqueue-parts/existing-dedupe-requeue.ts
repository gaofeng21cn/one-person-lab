import { DatabaseSync } from 'node:sqlite';

import type { EnqueueInput } from '../family-runtime-command.ts';
import {
  insertEvent,
  insertNotification,
  taskToPayload,
  type FamilyRuntimeTaskRow,
  type FamilyRuntimeTaskStatus,
} from '../family-runtime-store.ts';

export function applyExistingDedupeRequeue(
  db: DatabaseSync,
  params: {
    input: EnqueueInput;
    taskKind: string;
    exportedPayloadJson: string;
    existing: FamilyRuntimeTaskRow;
    nextStatus: FamilyRuntimeTaskStatus;
    nextRequiresApproval: boolean;
    nextLastError: string | null;
    createdAt: string;
    dedupeKey: string;
    activeHoldId: string | null;
    eventType: string;
    eventPayload: Record<string, unknown>;
    notificationTitle: string;
    requeuedFromTerminal: boolean;
    resetAttempts?: boolean;
  },
): {
  accepted: true;
  requeued_from_terminal: boolean;
  idempotent_noop: false;
  task: ReturnType<typeof taskToPayload>;
} {
  const {
    input,
    taskKind,
    exportedPayloadJson,
    existing,
    nextStatus,
    nextRequiresApproval,
    nextLastError,
    createdAt,
    dedupeKey,
    activeHoldId,
    eventType,
    eventPayload,
    notificationTitle,
    requeuedFromTerminal,
    resetAttempts = true,
  } = params;

  if (resetAttempts) {
    db.prepare(`
      UPDATE tasks
      SET domain_id = ?, task_kind = ?, payload_json = ?, priority = ?, status = ?,
        attempts = 0, source = ?, requires_approval = ?, approved_at = NULL,
        lease_owner = NULL, lease_expires_at = NULL, last_error = ?,
        dead_letter_reason = NULL, updated_at = ?
      WHERE task_id = ?
    `).run(
      input.domainId,
      taskKind,
      exportedPayloadJson,
      input.priority ?? 0,
      nextStatus,
      input.source ?? 'opl-cli',
      nextRequiresApproval ? 1 : 0,
      nextLastError,
      createdAt,
      existing.task_id,
    );
  } else {
    db.prepare(`
      UPDATE tasks
      SET domain_id = ?, task_kind = ?, payload_json = ?, priority = ?, status = ?,
        source = ?, requires_approval = ?, approved_at = NULL, lease_owner = NULL,
        lease_expires_at = NULL, last_error = ?, dead_letter_reason = NULL, updated_at = ?
      WHERE task_id = ?
    `).run(
      input.domainId,
      taskKind,
      exportedPayloadJson,
      input.priority ?? 0,
      nextStatus,
      input.source ?? 'opl-cli',
      nextRequiresApproval ? 1 : 0,
      nextLastError,
      createdAt,
      existing.task_id,
    );
  }

  const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
  insertEvent(db, {
    taskId: refreshed.task_id,
    domainId: refreshed.domain_id,
    eventType,
    source: input.source ?? 'opl-cli',
    payload: {
      dedupe_key: dedupeKey,
      previous_status: existing.status,
      next_status: nextStatus,
      active_hold_id: activeHoldId,
      ...eventPayload,
    },
  });
  insertNotification(db, {
    taskId: refreshed.task_id,
    severity: 'info',
    title: notificationTitle,
    body: `${input.domainId}:${taskKind}`,
    payload: { status: nextStatus, dedupe_key: dedupeKey, active_hold_id: activeHoldId },
  });
  return {
    accepted: true,
    requeued_from_terminal: requeuedFromTerminal,
    idempotent_noop: false,
    task: taskToPayload(refreshed),
  };
}
