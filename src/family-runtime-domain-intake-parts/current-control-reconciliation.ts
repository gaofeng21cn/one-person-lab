import type { DatabaseSync } from 'node:sqlite';

import type { EnqueueInput } from '../family-runtime-command.ts';
import {
  insertEvent,
  type FamilyRuntimeTaskRow,
} from '../family-runtime-store.ts';
import { updateStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';
import { DEFAULT_EXECUTOR_SUPERSEDED_REASON } from '../family-runtime-tick-parts/default-executor-currentness.ts';

const EXISTING_DEFAULT_EXECUTOR_SUPPRESSIBLE_STATUSES = new Set([
  'queued',
  'retry_waiting',
  'waiting_approval',
]);
const CURRENT_CONTROL_PROVIDER_ADMISSION_IDENTITY_BLOCKERS = new Set([
  'current_control_provider_admission_stage_packet_ref_missing',
  'current_control_provider_admission_route_identity_key_missing',
  'current_control_provider_admission_attempt_idempotency_key_missing',
  'current_control_transition_non_advancing_apply_recorded',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function currentControlAdmissionStudyIds(inputs: EnqueueInput[]) {
  return new Set(inputs
    .map((input) => optionalString(input.payload.study_id))
    .filter((studyId): studyId is string => Boolean(studyId)));
}

function currentControlBlockedStudyIds(blocked: Array<{ reason: string; task: unknown }>) {
  return new Set(blocked
    .map((item) => isRecord(item.task) ? optionalString(item.task.study_id) : null)
    .filter((studyId): studyId is string => Boolean(studyId)));
}

function currentControlBlockedByStudy(blocked: Array<{ reason: string; task: unknown }>) {
  const blockedByStudy = new Map<string, { reason: string; task: Record<string, unknown> }>();
  for (const item of blocked) {
    if (!CURRENT_CONTROL_PROVIDER_ADMISSION_IDENTITY_BLOCKERS.has(item.reason)) {
      continue;
    }
    if (!isRecord(item.task)) {
      continue;
    }
    const studyId = optionalString(item.task.study_id);
    if (!studyId) {
      continue;
    }
    blockedByStudy.set(studyId, {
      reason: item.reason,
      task: item.task,
    });
  }
  return blockedByStudy;
}

function payloadString(input: EnqueueInput, key: string) {
  return optionalString(input.payload[key]);
}

function isMasPaperMissionStartOrResumeInput(input: EnqueueInput) {
  return input.domainId === 'medautoscience'
    && input.taskKind === 'paper_mission/start_or_resume'
    && (
      isRecord(input.payload.opl_runtime_carrier)
      || isRecord(input.payload.opl_domain_progress_transition_request)
    );
}

function samePayloadString(left: EnqueueInput, right: EnqueueInput, key: string) {
  const leftValue = payloadString(left, key);
  const rightValue = payloadString(right, key);
  return Boolean(leftValue && rightValue && leftValue === rightValue);
}

function sameDefaultExecutorOwnerAction(left: EnqueueInput, right: EnqueueInput) {
  if (
    left.domainId !== 'medautoscience'
    || right.domainId !== 'medautoscience'
    || left.taskKind !== 'domain_owner/default-executor-dispatch'
    || right.taskKind !== 'domain_owner/default-executor-dispatch'
  ) {
    return false;
  }
  if (
    !samePayloadString(left, right, 'study_id')
    || !samePayloadString(left, right, 'action_type')
    || !samePayloadString(left, right, 'work_unit_id')
  ) {
    return false;
  }
  return samePayloadString(left, right, 'source_fingerprint')
    || samePayloadString(left, right, 'work_unit_fingerprint')
    || samePayloadString(left, right, 'action_fingerprint');
}

function executableOwnerFromPendingTask(input: EnqueueInput) {
  return payloadString(input, 'next_executable_owner')
    ?? payloadString(input, 'domain_owner')
    ?? payloadString(input, 'owner')
    ?? payloadString(input, 'dispatch_owner');
}

function payloadFromTask(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as Record<string, unknown>;
}

function sourceFingerprint(payload: Record<string, unknown>) {
  return optionalString(payload.source_fingerprint)
    ?? optionalString(payload.domain_source_fingerprint)
    ?? optionalString(payload.action_fingerprint)
    ?? optionalString(payload.work_unit_fingerprint);
}

function isSuppressibleExistingDefaultExecutorRow(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  return row.domain_id === 'medautoscience'
    && row.task_kind === 'domain_owner/default-executor-dispatch'
    && EXISTING_DEFAULT_EXECUTOR_SUPPRESSIBLE_STATUSES.has(row.status)
    && row.dead_letter_reason !== DEFAULT_EXECUTOR_SUPERSEDED_REASON
    && optionalString(payload.study_id) !== null;
}

export function reconcileCurrentControlExecutableOwners(
  currentInputs: EnqueueInput[],
  pendingInputs: EnqueueInput[],
) {
  return currentInputs.map((input) => {
    const pending = pendingInputs.find((candidate) => sameDefaultExecutorOwnerAction(input, candidate));
    if (!pending) {
      return input;
    }
    const executableOwner = executableOwnerFromPendingTask(pending);
    if (!executableOwner || executableOwner === payloadString(input, 'next_executable_owner')) {
      return input;
    }
    const providerAdmissionIdentity = isRecord(input.payload.provider_admission_identity)
      ? {
          ...input.payload.provider_admission_identity,
          next_executable_owner: executableOwner,
          executable_owner_source: 'domain_handler_current_owner_action',
        }
      : input.payload.provider_admission_identity;
    return {
      ...input,
      payload: {
        ...input.payload,
        next_executable_owner: executableOwner,
        domain_owner: payloadString(pending, 'domain_owner') ?? executableOwner,
        executable_owner_source: 'domain_handler_current_owner_action',
        provider_admission_identity: providerAdmissionIdentity,
      },
    };
  });
}

export function suppressStaleDefaultExecutorInputs(
  inputs: EnqueueInput[],
  currentAdmissionInputs: EnqueueInput[],
  currentAdmissionBlocked: Array<{ reason: string; task: unknown }> = [],
) {
  const currentStudyIds = currentControlAdmissionStudyIds(currentAdmissionInputs);
  for (const studyId of currentControlBlockedStudyIds(currentAdmissionBlocked)) {
    currentStudyIds.add(studyId);
  }
  if (currentStudyIds.size === 0) {
    return { inputs, suppressed_count: 0 };
  }
  const retained = inputs.filter((input) => {
    const studyId = optionalString(input.payload.study_id);
    return !(
      input.domainId === 'medautoscience'
      && (
        input.taskKind === 'domain_owner/default-executor-dispatch'
        || isMasPaperMissionStartOrResumeInput(input)
      )
      && studyId !== null
      && currentStudyIds.has(studyId)
    );
  });
  return {
    inputs: retained,
    suppressed_count: inputs.length - retained.length,
  };
}

export function suppressExistingStaleDefaultExecutorRowsForBlockedCurrentControl(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  currentAdmissionBlocked: Array<{ reason: string; task: unknown }> = [],
  source: string,
) {
  const blockedByStudy = currentControlBlockedByStudy(currentAdmissionBlocked);
  if (blockedByStudy.size === 0) {
    return 0;
  }
  let suppressedCount = 0;
  for (const row of rows) {
    const payload = payloadFromTask(row);
    if (!isSuppressibleExistingDefaultExecutorRow(row, payload)) {
      continue;
    }
    const studyId = optionalString(payload.study_id);
    const blocker = studyId ? blockedByStudy.get(studyId) : null;
    if (!blocker) {
      continue;
    }
    const suppressedAt = new Date().toISOString();
    const previousStatus = row.status;
    const previousLastError = row.last_error ?? null;
    const operatorHoldPreserved = previousStatus === 'waiting_approval' && previousLastError !== null;
    const result = db.prepare(`
      UPDATE tasks
      SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ? AND status IN ('queued', 'retry_waiting', 'waiting_approval')
    `).run(
      DEFAULT_EXECUTOR_SUPERSEDED_REASON,
      DEFAULT_EXECUTOR_SUPERSEDED_REASON,
      suppressedAt,
      row.task_id,
    );
    if (result.changes === 0) {
      continue;
    }
    const blockedAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      status: 'blocked',
      blockedReason: DEFAULT_EXECUTOR_SUPERSEDED_REASON,
      activityEvent: {
        activity_kind: 'mas_default_executor_currentness',
        activity_status: 'blocked',
        blocked_reason: DEFAULT_EXECUTOR_SUPERSEDED_REASON,
        reason: 'same_study_current_control_admission_blocked',
        current_blocked_reason: blocker.reason,
        current_source_fingerprint: sourceFingerprint(blocker.task),
        previous_status: previousStatus,
        previous_last_error: previousLastError,
        operator_hold_preserved: operatorHoldPreserved,
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
        reason: 'same_study_current_control_admission_blocked',
        current_task_id: null,
        current_blocked_reason: blocker.reason,
        current_source_fingerprint: sourceFingerprint(blocker.task),
        stale_source_fingerprint: sourceFingerprint(payload),
        previous_status: previousStatus,
        previous_last_error: previousLastError,
        operator_hold_preserved: operatorHoldPreserved,
        dispatch_ref: payload.dispatch_ref ?? null,
        action_type: payload.action_type ?? null,
        study_id: studyId,
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
    suppressedCount += 1;
  }
  return suppressedCount;
}
