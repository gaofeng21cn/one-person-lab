import { DatabaseSync } from 'node:sqlite';

import {
  insertEvent,
  type FamilyRuntimeTaskRow,
} from '../family-runtime-store.ts';
import {
  listStageAttemptsForTask,
  updateStageAttemptsForTask,
} from '../family-runtime-stage-attempts.ts';
import {
  buildStageRunCurrentnessIdentity,
  sameStageRunRouteCurrentnessIdentity,
} from '../family-runtime-stage-run-currentness-identity.ts';
import {
  isDefaultExecutorDispatchTask,
  defaultExecutorDispatchIdentity,
  defaultExecutorDomainSourceFingerprint,
  defaultExecutorStudyActionIdentity,
  defaultExecutorStudyIdentity,
} from '../family-runtime-provider-hosted-attempts.ts';
import {
  hasMasStageNativeOwnerAnswer,
  isMasReadinessStageNativeOwnerAction,
  stageAttemptPayloadHasMasStageNativeOwnerAnswer,
} from '../family-runtime-mas-stage-native-owner-answer.ts';
import {
  providerAdmissionCurrentnessIdentity,
  sameProviderAdmissionCurrentnessIdentity,
} from '../family-runtime-mas-current-control-admission-currentness.ts';

export const DEFAULT_EXECUTOR_SUPERSEDED_REASON = 'mas_default_executor_superseded_by_current_source';

type DefaultExecutorCurrentTask = {
  task_id: string;
  source_fingerprint: string | null;
  created_at: string;
  currentness_rank: number;
};

const CURRENT_CONTROL_ADMISSION_CURRENT_STATUSES = new Set([
  'queued',
  'retry_waiting',
  'running',
  'waiting_approval',
]);
const CURRENT_CONTROL_ADMISSION_RETRYABLE_BLOCKED_REASONS = new Set([
  'temporal_stage_attempt_start_failed',
  'temporal_stage_attempt_not_completed',
  'temporal_stage_attempt_failed',
]);
const SUPERSEDING_DEFAULT_EXECUTOR_STATUSES = new Set([
  'queued',
  'retry_waiting',
  'running',
  'waiting_approval',
  'blocked',
]);

export function payloadFromTask(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as Record<string, unknown>;
}

export function isNewerTask(
  left: Pick<FamilyRuntimeTaskRow, 'created_at' | 'task_id'>,
  right: DefaultExecutorCurrentTask,
) {
  if (left.created_at !== right.created_at) {
    return left.created_at > right.created_at;
  }
  return left.task_id > right.task_id;
}

function currentnessRankForDefaultExecutorTask(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  const canRepresentCurrentAdmission = CURRENT_CONTROL_ADMISSION_CURRENT_STATUSES.has(row.status)
    || (
      row.status === 'blocked'
      && CURRENT_CONTROL_ADMISSION_RETRYABLE_BLOCKED_REASONS.has(row.dead_letter_reason ?? '')
    );
  if (
    canRepresentCurrentAdmission
    && (
      providerAdmissionCurrentnessIdentity(payload)
      || providerAdmissionCurrentnessIdentity(payload, { requirePendingStatus: false })
    )
  ) {
    return 1;
  }
  return 0;
}

function currentTaskFromRow(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
): DefaultExecutorCurrentTask {
  return {
    task_id: row.task_id,
    source_fingerprint: defaultExecutorDomainSourceFingerprint(payload),
    created_at: row.created_at,
    currentness_rank: currentnessRankForDefaultExecutorTask(row, payload),
  };
}

function isPreferredCurrentTask(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
  current: DefaultExecutorCurrentTask,
) {
  const currentnessRank = currentnessRankForDefaultExecutorTask(row, payload);
  if (currentnessRank !== current.currentness_rank) {
    return currentnessRank > current.currentness_rank;
  }
  return isNewerTask(row, current);
}

function canSupersedeDefaultExecutorRows(row: FamilyRuntimeTaskRow) {
  return SUPERSEDING_DEFAULT_EXECUTOR_STATUSES.has(row.status)
    && row.dead_letter_reason !== DEFAULT_EXECUTOR_SUPERSEDED_REASON;
}

export function currentDefaultExecutorTasksByDispatch(rows: FamilyRuntimeTaskRow[]) {
  const currentByIdentity = new Map<string, DefaultExecutorCurrentTask>();
  for (const row of rows) {
    if (!canSupersedeDefaultExecutorRows(row)) {
      continue;
    }
    const payload = payloadFromTask(row);
    const identity = defaultExecutorDispatchIdentity(row, payload);
    if (!identity) {
      continue;
    }
    const current = currentByIdentity.get(identity);
    if (!current || isPreferredCurrentTask(row, payload, current)) {
      currentByIdentity.set(identity, currentTaskFromRow(row, payload));
    }
  }
  return currentByIdentity;
}

export function currentDefaultExecutorTasksByStudyAction(rows: FamilyRuntimeTaskRow[]) {
  const currentByIdentity = new Map<string, DefaultExecutorCurrentTask>();
  for (const row of rows) {
    if (!canSupersedeDefaultExecutorRows(row)) {
      continue;
    }
    const payload = payloadFromTask(row);
    const identity = defaultExecutorStudyActionIdentity(row, payload);
    if (!identity) {
      continue;
    }
    const current = currentByIdentity.get(identity);
    if (!current || isPreferredCurrentTask(row, payload, current)) {
      currentByIdentity.set(identity, currentTaskFromRow(row, payload));
    }
  }
  return currentByIdentity;
}

function markSupersededDefaultExecutorRow(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
  current: DefaultExecutorCurrentTask,
  reason: string,
  source: string,
) {
  const sourceFingerprint = defaultExecutorDomainSourceFingerprint(payload);
  const supersededAt = new Date().toISOString();
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ? AND status IN ('queued', 'retry_waiting')
  `).run(
    DEFAULT_EXECUTOR_SUPERSEDED_REASON,
    DEFAULT_EXECUTOR_SUPERSEDED_REASON,
    supersededAt,
    row.task_id,
  );
  const blockedAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    status: 'blocked',
    blockedReason: DEFAULT_EXECUTOR_SUPERSEDED_REASON,
    activityEvent: {
      activity_kind: 'mas_default_executor_currentness',
      activity_status: 'blocked',
      blocked_reason: DEFAULT_EXECUTOR_SUPERSEDED_REASON,
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

export function dropSupersededDefaultExecutorRows(
  db: DatabaseSync,
  candidateRows: FamilyRuntimeTaskRow[],
  allRows: FamilyRuntimeTaskRow[],
  source: string,
) {
  const currentByIdentity = currentDefaultExecutorTasksByDispatch(allRows);
  const currentByStudyAction = currentDefaultExecutorTasksByStudyAction(allRows);
  let supersededCount = 0;
  const rows = candidateRows.filter((row) => {
    const payload = payloadFromTask(row);
    const identity = defaultExecutorDispatchIdentity(row, payload);
    const actionIdentity = defaultExecutorStudyActionIdentity(row, payload);
    if (!identity || !actionIdentity) {
      return true;
    }
    const current = currentByIdentity.get(identity);
    const currentAction = currentByStudyAction.get(actionIdentity);
    const sourceFingerprint = defaultExecutorDomainSourceFingerprint(payload);
    if (
      current
      && current.task_id !== row.task_id
      && current.source_fingerprint
      && sourceFingerprint
      && current.source_fingerprint !== sourceFingerprint
    ) {
      supersededCount += 1;
      markSupersededDefaultExecutorRow(
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
      markSupersededDefaultExecutorRow(
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

function completedAcceptedAttemptForTask(db: DatabaseSync, row: FamilyRuntimeTaskRow) {
  return listStageAttemptsForTask(db, row.task_id).find((attempt) => (
    attempt.executor_kind === 'codex_cli'
    && attempt.status === 'completed'
    && attempt.closeout_receipt_status === 'accepted_typed_closeout'
  )) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function completedCloseoutCanReconcileTask(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
  attempt: NonNullable<ReturnType<typeof completedAcceptedAttemptForTask>>,
) {
  const taskIdentity = buildStageRunCurrentnessIdentity({
    task: {
      domain_id: row.domain_id,
      task_id: row.task_id,
      payload,
    },
    taskPayload: payload,
    stageAttempt: {},
  });
  const attemptIdentity = buildStageRunCurrentnessIdentity({
    task: {
      domain_id: attempt.domain_id,
      task_id: attempt.task_id ?? undefined,
      payload: attempt.workspace_locator,
    },
    taskPayload: attempt.workspace_locator,
    stageAttempt: attempt,
  });
  if (sameStageRunRouteCurrentnessIdentity(taskIdentity, attemptIdentity)) {
    return true;
  }
  const payloadIdentity = providerAdmissionCurrentnessIdentity(payload);
  if (payloadIdentity) {
    const attemptIdentity = providerAdmissionCurrentnessIdentity(
      attempt.workspace_locator,
      { requirePendingStatus: false },
    );
    return Boolean(
      attemptIdentity
      && sameProviderAdmissionCurrentnessIdentity(attemptIdentity, payloadIdentity),
    );
  }
  if (!isMasReadinessStageNativeOwnerAction(row, payload)) {
    return true;
  }
  if (stageAttemptPayloadHasMasStageNativeOwnerAnswer(attempt, payload)) {
    return true;
  }
  if (hasMasStageNativeOwnerAnswer(attempt.route_impact, payload)) {
    return true;
  }
  return attempt.activity_events.some((event) =>
    isRecord(event) && hasMasStageNativeOwnerAnswer(event, payload)
  );
}

function reconcileCompletedCloseoutDefaultExecutorRow(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
  source: string,
) {
  const attempt = completedAcceptedAttemptForTask(db, row);
  if (!attempt) {
    return false;
  }
  if (!completedCloseoutCanReconcileTask(row, payload, attempt)) {
    return false;
  }
  const reconciledAt = new Date().toISOString();
  const result = db.prepare(`
    UPDATE tasks
    SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL,
      last_error = NULL, dead_letter_reason = NULL, updated_at = ?
    WHERE task_id = ? AND status IN ('queued', 'retry_waiting')
  `).run(reconciledAt, row.task_id);
  if (result.changes === 0) {
    return false;
  }
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_default_executor_completed_closeout_reconciled',
    source,
    payload: {
      reason: 'same_task_completed_typed_closeout_exists',
      stage_attempt_id: attempt.stage_attempt_id,
      closeout_refs: attempt.closeout_refs,
      dispatch_ref: payload.dispatch_ref ?? null,
      action_type: payload.action_type ?? null,
      study_id: payload.study_id ?? null,
      source_fingerprint: defaultExecutorDomainSourceFingerprint(payload),
      authority_boundary: {
        opl: 'queue_attempt_ledger_currentness_reconciliation_only',
        domain: 'truth_quality_artifact_gate_owner',
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        provider_stage_attempt_started: false,
      },
    },
  });
  return true;
}

export function dropCompletedDefaultExecutorRows(
  db: DatabaseSync,
  candidateRows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let completedCloseoutReconciledCount = 0;
  const rows = candidateRows.filter((row) => {
    const payload = payloadFromTask(row);
    if (!isDefaultExecutorDispatchTask(row, payload)) {
      return true;
    }
    if (!reconcileCompletedCloseoutDefaultExecutorRow(db, row, payload, source)) {
      return true;
    }
    completedCloseoutReconciledCount += 1;
    return false;
  });
  return { rows, completedCloseoutReconciledCount };
}

export function dropSameStudyDefaultExecutorRows(
  db: DatabaseSync,
  candidateRows: FamilyRuntimeTaskRow[],
  source: string,
) {
  const selectedByStudy = new Map<string, FamilyRuntimeTaskRow>();
  const selectedIds = new Set<string>();
  let studySingleFlightSkippedCount = 0;
  for (const row of candidateRows) {
    const payload = payloadFromTask(row);
    const studyIdentity = defaultExecutorStudyIdentity(row, payload);
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
    const selectedPayload = payloadFromTask(selected);
    if (isPreferredCurrentTask(row, payload, currentTaskFromRow(selected, selectedPayload))) {
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
    if (defaultExecutorStudyIdentity(row, payload)) {
      studySingleFlightSkippedCount += 1;
      const selected = [...selectedByStudy.values()].find((candidate) => {
        const candidatePayload = payloadFromTask(candidate);
        return defaultExecutorStudyIdentity(candidate, candidatePayload)
          === defaultExecutorStudyIdentity(row, payload);
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
            ? defaultExecutorDomainSourceFingerprint(payloadFromTask(selected))
            : null,
          candidate_created_at: row.created_at,
          candidate_source_fingerprint: defaultExecutorDomainSourceFingerprint(payload),
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
