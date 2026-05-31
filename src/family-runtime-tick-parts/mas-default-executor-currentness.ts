import { DatabaseSync } from 'node:sqlite';

import {
  insertEvent,
  type FamilyRuntimeTaskRow,
} from '../family-runtime-store.ts';
import {
  updateStageAttemptsForTask,
} from '../family-runtime-stage-attempts.ts';
import {
  isMasDefaultExecutorDispatchTask,
  masDefaultExecutorDispatchIdentity,
  masDefaultExecutorDomainSourceFingerprint,
  masDefaultExecutorStudyActionIdentity,
  masDefaultExecutorStudyIdentity,
} from '../family-runtime-provider-hosted-attempts.ts';

export const MAS_DEFAULT_EXECUTOR_SUPERSEDED_REASON = 'mas_default_executor_superseded_by_current_source';

type MasDefaultExecutorCurrentTask = {
  task_id: string;
  source_fingerprint: string | null;
  created_at: string;
};

export function payloadFromTask(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as Record<string, unknown>;
}

export function isNewerTask(
  left: Pick<FamilyRuntimeTaskRow, 'created_at' | 'task_id'>,
  right: MasDefaultExecutorCurrentTask,
) {
  if (left.created_at !== right.created_at) {
    return left.created_at > right.created_at;
  }
  return left.task_id > right.task_id;
}

export function currentMasDefaultExecutorTasksByDispatch(rows: FamilyRuntimeTaskRow[]) {
  const currentByIdentity = new Map<string, MasDefaultExecutorCurrentTask>();
  for (const row of rows) {
    const payload = payloadFromTask(row);
    const identity = masDefaultExecutorDispatchIdentity(row, payload);
    if (!identity) {
      continue;
    }
    const current = currentByIdentity.get(identity);
    if (!current || isNewerTask(row, current)) {
      currentByIdentity.set(identity, {
        task_id: row.task_id,
        source_fingerprint: masDefaultExecutorDomainSourceFingerprint(payload),
        created_at: row.created_at,
      });
    }
  }
  return currentByIdentity;
}

export function currentMasDefaultExecutorTasksByStudyAction(rows: FamilyRuntimeTaskRow[]) {
  const currentByIdentity = new Map<string, MasDefaultExecutorCurrentTask>();
  for (const row of rows) {
    const payload = payloadFromTask(row);
    const identity = masDefaultExecutorStudyActionIdentity(row, payload);
    if (!identity) {
      continue;
    }
    const current = currentByIdentity.get(identity);
    if (!current || isNewerTask(row, current)) {
      currentByIdentity.set(identity, {
        task_id: row.task_id,
        source_fingerprint: masDefaultExecutorDomainSourceFingerprint(payload),
        created_at: row.created_at,
      });
    }
  }
  return currentByIdentity;
}

function markSupersededMasDefaultExecutorRow(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
  current: MasDefaultExecutorCurrentTask,
  reason: string,
  source: string,
) {
  const sourceFingerprint = masDefaultExecutorDomainSourceFingerprint(payload);
  const supersededAt = new Date().toISOString();
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ? AND status IN ('queued', 'retry_waiting')
  `).run(
    MAS_DEFAULT_EXECUTOR_SUPERSEDED_REASON,
    MAS_DEFAULT_EXECUTOR_SUPERSEDED_REASON,
    supersededAt,
    row.task_id,
  );
  const blockedAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    status: 'blocked',
    blockedReason: MAS_DEFAULT_EXECUTOR_SUPERSEDED_REASON,
    activityEvent: {
      activity_kind: 'mas_default_executor_currentness',
      activity_status: 'blocked',
      blocked_reason: MAS_DEFAULT_EXECUTOR_SUPERSEDED_REASON,
      reason,
      current_task_id: current.task_id,
      current_source_fingerprint: current.source_fingerprint,
      authority_boundary: {
        opl: 'queue_currentness_supersession_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    },
  });
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_default_executor_superseded_by_current_source',
    source,
    payload: {
      reason,
      current_task_id: current.task_id,
      current_source_fingerprint: current.source_fingerprint,
      stale_source_fingerprint: sourceFingerprint,
      dispatch_ref: payload.dispatch_ref ?? null,
      action_type: payload.action_type ?? null,
      study_id: payload.study_id ?? null,
      blocked_stage_attempt_ids: blockedAttempts.map((attempt) => attempt.stage_attempt_id),
      authority_boundary: {
        opl: 'queue_currentness_supersession_only',
        domain: 'truth_quality_artifact_gate_owner',
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        provider_stage_attempt_started: false,
      },
    },
  });
}

export function dropSupersededMasDefaultExecutorRows(
  db: DatabaseSync,
  candidateRows: FamilyRuntimeTaskRow[],
  allRows: FamilyRuntimeTaskRow[],
  source: string,
) {
  const currentByIdentity = currentMasDefaultExecutorTasksByDispatch(allRows);
  const currentByStudyAction = currentMasDefaultExecutorTasksByStudyAction(allRows);
  let supersededCount = 0;
  const rows = candidateRows.filter((row) => {
    const payload = payloadFromTask(row);
    const identity = masDefaultExecutorDispatchIdentity(row, payload);
    const actionIdentity = masDefaultExecutorStudyActionIdentity(row, payload);
    if (!identity || !actionIdentity) {
      return true;
    }
    const current = currentByIdentity.get(identity);
    const currentAction = currentByStudyAction.get(actionIdentity);
    const sourceFingerprint = masDefaultExecutorDomainSourceFingerprint(payload);
    if (
      current
      && current.task_id !== row.task_id
      && current.source_fingerprint
      && sourceFingerprint
      && current.source_fingerprint !== sourceFingerprint
    ) {
      supersededCount += 1;
      markSupersededMasDefaultExecutorRow(
        db,
        row,
        payload,
        current,
        'same_dispatch_newer_source_exists',
        source,
      );
      return false;
    }
    if (
      currentAction
      && currentAction.task_id !== row.task_id
      && currentAction.source_fingerprint
      && sourceFingerprint
      && currentAction.source_fingerprint !== sourceFingerprint
    ) {
      supersededCount += 1;
      markSupersededMasDefaultExecutorRow(
        db,
        row,
        payload,
        currentAction,
        'same_study_action_newer_source_exists',
        source,
      );
      return false;
    }
    return true;
  });
  return { rows, supersededCount };
}

export function dropSameStudyMasDefaultExecutorRows(
  db: DatabaseSync,
  candidateRows: FamilyRuntimeTaskRow[],
  source: string,
) {
  const selectedByStudy = new Map<string, FamilyRuntimeTaskRow>();
  const selectedIds = new Set<string>();
  let studySingleFlightSkippedCount = 0;
  for (const row of candidateRows) {
    const payload = payloadFromTask(row);
    const studyIdentity = masDefaultExecutorStudyIdentity(row, payload);
    if (!studyIdentity) {
      selectedIds.add(row.task_id);
      continue;
    }
    const selected = selectedByStudy.get(studyIdentity);
    if (!selected) {
      selectedByStudy.set(studyIdentity, row);
      selectedIds.add(row.task_id);
      continue;
    }
    if (isNewerTask(row, {
      task_id: selected.task_id,
      source_fingerprint: masDefaultExecutorDomainSourceFingerprint(payloadFromTask(selected)),
      created_at: selected.created_at,
    })) {
      selectedIds.delete(selected.task_id);
      selectedIds.add(row.task_id);
      selectedByStudy.set(studyIdentity, row);
    }
  }
  const rows = candidateRows.filter((row) => {
    if (selectedIds.has(row.task_id)) {
      return true;
    }
    const payload = payloadFromTask(row);
    if (masDefaultExecutorStudyIdentity(row, payload)) {
      studySingleFlightSkippedCount += 1;
      const selected = [...selectedByStudy.values()].find((candidate) => {
        const candidatePayload = payloadFromTask(candidate);
        return masDefaultExecutorStudyIdentity(candidate, candidatePayload)
          === masDefaultExecutorStudyIdentity(row, payload);
      });
      insertEvent(db, {
        taskId: row.task_id,
        domainId: row.domain_id,
        eventType: 'task_default_executor_same_study_tick_skip',
        source,
        payload: {
          reason: 'same_study_candidate_selected_in_tick',
          selected_task_id: selected?.task_id ?? null,
          selected_created_at: selected?.created_at ?? null,
          selected_source_fingerprint: selected
            ? masDefaultExecutorDomainSourceFingerprint(payloadFromTask(selected))
            : null,
          candidate_created_at: row.created_at,
          candidate_source_fingerprint: masDefaultExecutorDomainSourceFingerprint(payload),
          dispatch_ref: payload.dispatch_ref ?? null,
          action_type: payload.action_type ?? null,
          study_id: payload.study_id ?? null,
          authority_boundary: {
            opl: 'queue_tick_same_study_default_executor_single_flight_only',
            domain: 'truth_quality_artifact_gate_owner',
            domain_truth_mutation: false,
            publication_quality_mutation: false,
            artifact_gate_mutation: false,
            current_package_mutation: false,
          },
        },
      });
    }
    return false;
  });
  return { rows, studySingleFlightSkippedCount };
}
