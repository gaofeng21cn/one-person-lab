import { DatabaseSync } from 'node:sqlite';

import { redriveBlockedDefaultExecutorProviderTransportTask } from '../family-runtime-redrive.ts';
import { insertEvent, type FamilyRuntimeTaskRow } from '../family-runtime-store.ts';
import {
  defaultExecutorDispatchIdentity,
  defaultExecutorDomainSourceFingerprint,
  defaultExecutorStudyActionIdentity,
  isDefaultExecutorDispatchTask,
} from '../family-runtime-provider-hosted-attempts.ts';
import {
  currentDefaultExecutorTasksByDispatch,
  currentDefaultExecutorTasksByStudyAction,
  payloadFromTask,
} from './default-executor-currentness.ts';

const PROVIDER_TRANSPORT_REDRIVE_REASONS = new Set([
  'temporal_stage_attempt_start_failed',
  'temporal_stage_attempt_not_completed',
  'temporal_stage_attempt_failed',
]);

function attemptCountForTask(db: DatabaseSync, taskId: string) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stage_attempts
    WHERE task_id = ?
  `).get(taskId) as { count: number };
  return row.count;
}

function attemptCountForTaskCurrentSource(
  db: DatabaseSync,
  taskId: string,
  sourceFingerprint: string | null,
) {
  if (!sourceFingerprint) {
    return attemptCountForTask(db, taskId);
  }
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM stage_attempts
    WHERE task_id = ?
      AND json_extract(workspace_locator_json, '$.domain_source_fingerprint') = ?
  `).get(taskId, sourceFingerprint) as { count: number };
  return row.count;
}

export function autoRedriveBlockedDefaultExecutorProviderTasks(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let autoRedrivenCount = 0;
  let autoDeadLetteredCount = 0;
  let staleSkippedCount = 0;
  const redrivenAt = new Date().toISOString();
  const currentByIdentity = currentDefaultExecutorTasksByDispatch(rows);
  const currentByStudyAction = currentDefaultExecutorTasksByStudyAction(rows);
  for (const row of rows) {
    if (
      row.status !== 'blocked'
      || !PROVIDER_TRANSPORT_REDRIVE_REASONS.has(row.dead_letter_reason ?? '')
    ) {
      continue;
    }
    const payload = payloadFromTask(row);
    if (!isDefaultExecutorDispatchTask(row, payload)) {
      continue;
    }
    const identity = defaultExecutorDispatchIdentity(row, payload);
    const actionIdentity = defaultExecutorStudyActionIdentity(row, payload);
    const current = identity ? currentByIdentity.get(identity) : null;
    const currentAction = actionIdentity ? currentByStudyAction.get(actionIdentity) : null;
    const sourceFingerprint = defaultExecutorDomainSourceFingerprint(payload);
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
    const usedAttempts = attemptCountForTaskCurrentSource(db, row.task_id, sourceFingerprint);
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
    const redrive = redriveBlockedDefaultExecutorProviderTransportTask(db, row, payload, {
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
