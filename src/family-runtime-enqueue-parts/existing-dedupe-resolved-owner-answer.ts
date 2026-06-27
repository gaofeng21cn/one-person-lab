import { DatabaseSync } from 'node:sqlite';

import type { EnqueueInput } from '../family-runtime-command.ts';
import {
  insertEvent,
  insertNotification,
  taskToPayload,
  type FamilyRuntimeTaskRow,
} from '../family-runtime-store.ts';

export function recordResolvedMissingStageNativeOwnerAnswerDedupeNoop(
  db: DatabaseSync,
  params: {
    input: EnqueueInput;
    taskKind: string;
    exportedPayloadJson: string;
    existing: FamilyRuntimeTaskRow;
    requiresApproval: boolean;
    createdAt: string;
    dedupeKey: string;
    decision: Record<string, unknown>;
  },
) {
  const {
    input,
    taskKind,
    exportedPayloadJson,
    existing,
    requiresApproval,
    createdAt,
    dedupeKey,
    decision,
  } = params;

  db.prepare(`
    UPDATE tasks
    SET domain_id = ?, task_kind = ?, payload_json = ?, priority = ?, status = 'succeeded',
      source = ?, requires_approval = ?, approved_at = NULL,
      lease_owner = NULL, lease_expires_at = NULL, last_error = NULL,
      dead_letter_reason = NULL, updated_at = ?
    WHERE task_id = ?
  `).run(
    input.domainId,
    taskKind,
    exportedPayloadJson,
    input.priority ?? 0,
    input.source ?? 'opl-cli',
    requiresApproval ? 1 : 0,
    createdAt,
    existing.task_id,
  );
  const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
  insertEvent(db, {
    taskId: refreshed.task_id,
    domainId: refreshed.domain_id,
    eventType: 'task_resolved_missing_stage_native_owner_answer',
    source: input.source ?? 'opl-cli',
    payload: {
      dedupe_key: dedupeKey,
      previous_status: existing.status,
      next_status: refreshed.status,
      cleared_dead_letter_reason: existing.dead_letter_reason,
      ...decision,
      authority_boundary: {
        opl: 'queue_read_model_repair_after_domain_owner_answer_observed_only',
        domain: 'truth_quality_artifact_gate_owner',
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        provider_completion_is_domain_ready: false,
      },
    },
  });
  insertNotification(db, {
    taskId: refreshed.task_id,
    severity: 'info',
    title: 'Family runtime missing owner answer resolved',
    body: `${input.domainId}:${taskKind}`,
    payload: { status: refreshed.status, dedupe_key: dedupeKey },
  });
  return {
    accepted: false,
    idempotent_noop: true,
    task: taskToPayload(refreshed),
  };
}
