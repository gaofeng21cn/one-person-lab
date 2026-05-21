import { DatabaseSync } from 'node:sqlite';

import type { EnqueueInput } from './family-runtime-command.ts';
import { deadLetterRedriveDecision } from './family-runtime-dead-letter-redrive.ts';
import { canonicalFamilyRuntimeTaskKind } from './family-runtime-mas-domain-route.ts';
import {
  DEFAULT_MAX_ATTEMPTS,
  insertEvent,
  insertNotification,
  nowIso,
  stableId,
  taskToPayload,
  type FamilyRuntimeTaskRow,
  type FamilyRuntimeTaskStatus,
} from './family-runtime-store.ts';

export function enqueueTask(db: DatabaseSync, input: EnqueueInput) {
  const createdAt = nowIso();
  const dedupeKey = input.dedupeKey?.trim() || null;
  const taskKind = canonicalFamilyRuntimeTaskKind(input.domainId, input.taskKind);
  const payload = input.requireStageAdmission
    ? {
        ...input.payload,
        opl_stage_launch_admission_required: true,
      }
    : input.payload;
  if (dedupeKey) {
    const existing = db.prepare('SELECT * FROM tasks WHERE dedupe_key = ?').get(dedupeKey) as
      | FamilyRuntimeTaskRow
      | undefined;
    if (existing) {
      const exportedPayloadJson = JSON.stringify(payload);
      const exportedTaskChanged = existing.payload_json !== exportedPayloadJson
        || existing.task_kind !== taskKind
        || existing.domain_id !== input.domainId;
      const existingPayload = JSON.parse(existing.payload_json) as Record<string, unknown>;
      if (existing.status === 'succeeded' && exportedTaskChanged) {
        const nextStatus: FamilyRuntimeTaskStatus = input.requiresApproval ? 'waiting_approval' : 'queued';
        db.prepare(`
          UPDATE tasks
          SET domain_id = ?, task_kind = ?, payload_json = ?, priority = ?, status = ?,
            source = ?, requires_approval = ?, approved_at = NULL, lease_owner = NULL,
            lease_expires_at = NULL, last_error = NULL, dead_letter_reason = NULL, updated_at = ?
          WHERE task_id = ?
        `).run(
          input.domainId,
          taskKind,
          exportedPayloadJson,
          input.priority ?? 0,
          nextStatus,
          input.source ?? 'opl-cli',
          input.requiresApproval ? 1 : 0,
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_requeued_from_domain_export_update',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            next_status: nextStatus,
            reason: 'domain_export_changed_after_terminal_attempt',
          },
        });
        insertNotification(db, {
          taskId: refreshed.task_id,
          severity: 'info',
          title: 'Family runtime task requeued',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
      const deadLetterRedrive = deadLetterRedriveDecision(existingPayload, payload);
      if (existing.status === 'dead_letter' && exportedTaskChanged && deadLetterRedrive) {
        const nextStatus: FamilyRuntimeTaskStatus = input.requiresApproval ? 'waiting_approval' : 'queued';
        db.prepare(`
          UPDATE tasks
          SET domain_id = ?, task_kind = ?, payload_json = ?, priority = ?, status = ?,
            attempts = 0, source = ?, requires_approval = ?, approved_at = NULL,
            lease_owner = NULL, lease_expires_at = NULL, last_error = NULL,
            dead_letter_reason = NULL, updated_at = ?
          WHERE task_id = ?
        `).run(
          input.domainId,
          taskKind,
          exportedPayloadJson,
          input.priority ?? 0,
          nextStatus,
          input.source ?? 'opl-cli',
          input.requiresApproval ? 1 : 0,
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_requeued_from_dead_letter_after_domain_owner_update',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            next_status: nextStatus,
            ...deadLetterRedrive,
          },
        });
        insertNotification(db, {
          taskId: refreshed.task_id,
          severity: 'info',
          title: 'Family runtime task requeued after domain owner update',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
      insertEvent(db, {
        taskId: existing.task_id,
        domainId: existing.domain_id,
        eventType: 'dedupe_noop',
        source: input.source ?? 'opl-cli',
        payload: { dedupe_key: dedupeKey },
      });
      return {
        accepted: false,
        idempotent_noop: true,
        task: taskToPayload(existing),
      };
    }
  }

  const taskId = stableId('frt', [
    input.domainId,
    taskKind,
    dedupeKey,
    payload,
    createdAt,
  ]);
  const status: FamilyRuntimeTaskStatus = input.requiresApproval ? 'waiting_approval' : 'queued';
  const task = {
    task_id: taskId,
    domain_id: input.domainId,
    task_kind: taskKind,
    payload_json: JSON.stringify(payload),
    dedupe_key: dedupeKey,
    priority: input.priority ?? 0,
    status,
    attempts: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    source: input.source ?? 'opl-cli',
    requires_approval: input.requiresApproval ? 1 : 0,
    approved_at: null,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    dead_letter_reason: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  db.prepare(`
    INSERT INTO tasks(
      task_id, domain_id, task_kind, payload_json, dedupe_key, priority, status, attempts, max_attempts,
      source, requires_approval, approved_at, lease_owner, lease_expires_at, last_error, dead_letter_reason,
      created_at, updated_at
    )
    VALUES (
      @task_id, @domain_id, @task_kind, @payload_json, @dedupe_key, @priority, @status, @attempts, @max_attempts,
      @source, @requires_approval, @approved_at, @lease_owner, @lease_expires_at, @last_error, @dead_letter_reason,
      @created_at, @updated_at
    )
  `).run(task);
  insertEvent(db, {
    taskId,
    domainId: input.domainId,
    eventType: status === 'waiting_approval' ? 'task_waiting_approval' : 'task_enqueued',
    source: input.source ?? 'opl-cli',
    payload: { task_kind: taskKind, dedupe_key: dedupeKey },
  });
  insertNotification(db, {
    taskId,
    severity: 'info',
    title: status === 'waiting_approval' ? 'Family runtime task waiting for approval' : 'Family runtime task queued',
    body: `${input.domainId}:${taskKind}`,
    payload: { status },
  });
  return {
    accepted: true,
    idempotent_noop: false,
    task: taskToPayload(task as FamilyRuntimeTaskRow),
  };
}
