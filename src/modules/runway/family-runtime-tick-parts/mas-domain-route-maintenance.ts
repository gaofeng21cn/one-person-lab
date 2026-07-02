import { DatabaseSync } from 'node:sqlite';

import { insertEvent, type FamilyRuntimeTaskRow } from '../family-runtime-store.ts';
import { listStageAttemptsForTask, updateStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';
import { MAS_DOMAIN_ROUTE_RECONCILE_APPLY } from '../family-runtime-mas-domain-route.ts';
import {
  domainRouteOplAttemptAdmissionNeedsProviderFollowthrough,
  isDomainRouteOplAttemptAdmissionRequested,
  masDomainOwnerAnswerObservationFromRecords,
  type MasDomainOwnerAnswerObservation,
  MAS_DOMAIN_TYPED_BLOCKER_OBSERVED_REASON,
  OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON,
  OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
} from '../family-runtime-opl-attempt-admission-receipt.ts';
import { payloadFromTask } from './default-executor-currentness.ts';

function latestTaskDispatchSucceededOutput(db: DatabaseSync, taskId: string) {
  const row = db.prepare(`
    SELECT payload_json
    FROM events
    WHERE task_id = ? AND event_type = 'task_dispatch_succeeded'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId) as { payload_json: string } | undefined;
  if (!row) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.payload_json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const output = (parsed as Record<string, unknown>).output;
    return output && typeof output === 'object' && !Array.isArray(output)
      ? output as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function closeoutRefsFromAttemptPayload(attempts: ReturnType<typeof listStageAttemptsForTask>) {
  return attempts.flatMap((attempt) => (
    Array.isArray(attempt.closeout_refs) ? attempt.closeout_refs.filter((ref): ref is string => typeof ref === 'string') : []
  ));
}

function blockMasDomainRouteOwnerAnswerObserved(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  source: string,
  input: {
    observation: MasDomainOwnerAnswerObservation;
    previousStatus: string;
    output?: Record<string, unknown> | null;
  },
) {
  const blockedAt = new Date().toISOString();
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(input.observation.reason, input.observation.reason, blockedAt, row.task_id);
  const attempts = listStageAttemptsForTask(db, row.task_id).filter((attempt) => (
    attempt.executor_kind === 'domain_handler'
    && ['queued', 'running', 'checkpointed', 'completed'].includes(attempt.status)
  ));
  const blockedAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    stageAttemptIds: attempts.map((attempt) => attempt.stage_attempt_id),
    status: 'blocked',
    closeoutRefs: closeoutRefsFromAttemptPayload(attempts),
    closeoutReceiptStatus: attempts.some((attempt) => attempt.closeout_receipt_status === 'domain_handler_receipt_ref_only')
      ? 'domain_handler_receipt_ref_only'
      : undefined,
    blockedReason: input.observation.reason,
    routeImpact: {
      answer_kind: input.observation.answer_kind,
      typed_blocker_refs: input.observation.answer_kind === 'typed_blocker_ref' ? input.observation.refs : [],
      owner_answer_refs: input.observation.answer_kind !== 'typed_blocker_ref' ? input.observation.refs : [],
      evidence_paths: input.observation.evidence_paths,
    },
    activityEvent: {
      activity_kind: 'domain_handler_dispatch_activity',
      activity_status: 'blocked_domain_owner_answer_observed',
      blocked_reason: input.observation.reason,
      answer_kind: input.observation.answer_kind,
      refs: input.observation.refs,
      previous_status: input.previousStatus,
      previous_admission_signal: OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
    },
  });
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: input.observation.reason === MAS_DOMAIN_TYPED_BLOCKER_OBSERVED_REASON
      ? 'task_repaired_from_route_admission_to_mas_domain_typed_blocker'
      : 'task_repaired_from_route_admission_to_mas_domain_owner_answer',
    source,
    payload: {
      previous_status: input.previousStatus,
      next_status: 'blocked',
      reason: input.observation.reason,
      answer_kind: input.observation.answer_kind,
      refs: input.observation.refs,
      evidence_paths: input.observation.evidence_paths,
      previous_admission_signal: OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
      dispatch_output: input.output ?? null,
      repaired_stage_attempt_ids: blockedAttempts.map((attempt) => attempt.stage_attempt_id),
      authority_boundary: {
        opl: 'owner_answer_observation_and_queue_lifecycle_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
        refs_only_checkpoint_is_running_proof: false,
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        can_create_owner_receipt: false,
        can_create_typed_blocker: false,
      },
    },
  });
}

export function blockMasDomainRouteAdmissionsWithObservedOwnerAnswer(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let blockedCount = 0;
  const blockedTaskIds = new Set<string>();
  for (const row of rows) {
    if (
      row.domain_id !== 'medautoscience'
      || row.task_kind !== MAS_DOMAIN_ROUTE_RECONCILE_APPLY
      || !['running', 'succeeded'].includes(row.status)
    ) {
      continue;
    }
    const payload = payloadFromTask(row);
    const output = latestTaskDispatchSucceededOutput(db, row.task_id);
    if (row.status === 'succeeded' && !isDomainRouteOplAttemptAdmissionRequested(output)) {
      continue;
    }
    if (
      row.status === 'running'
      && row.last_error !== OPL_ATTEMPT_ADMISSION_REQUESTED_REASON
      && !isDomainRouteOplAttemptAdmissionRequested(output)
    ) {
      continue;
    }
    const observation = masDomainOwnerAnswerObservationFromRecords([
      { source: 'task_payload', value: payload },
      { source: 'domain_handler_output', value: output },
    ]);
    if (!observation) {
      continue;
    }
    blockMasDomainRouteOwnerAnswerObserved(db, row, source, {
      observation,
      previousStatus: row.status,
      output,
    });
    blockedCount += 1;
    blockedTaskIds.add(row.task_id);
  }
  return { blockedCount, blockedTaskIds };
}

export function repairSucceededMasDomainRouteAdmissionRequested(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let repairedCount = 0;
  const repairedTaskIds = new Set<string>();
  const repairedAt = new Date().toISOString();
  for (const row of rows) {
    if (
      row.domain_id !== 'medautoscience'
      || row.task_kind !== MAS_DOMAIN_ROUTE_RECONCILE_APPLY
      || row.status !== 'succeeded'
    ) {
      continue;
    }
    const output = latestTaskDispatchSucceededOutput(db, row.task_id);
    const payload = payloadFromTask(row);
    if (!domainRouteOplAttemptAdmissionNeedsProviderFollowthrough({ taskPayload: payload, output })) {
      continue;
    }
    const attempts = listStageAttemptsForTask(db, row.task_id).filter((attempt) => (
      attempt.executor_kind === 'domain_handler'
      && attempt.closeout_receipt_status === 'domain_handler_receipt_ref_only'
      && ['checkpointed', 'completed'].includes(attempt.status)
    ));
    if (attempts.length === 0) {
      continue;
    }
    db.prepare(`
      UPDATE tasks
      SET status = 'running', lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = NULL, updated_at = ?
      WHERE task_id = ? AND status = 'succeeded'
    `).run(OPL_ATTEMPT_ADMISSION_REQUESTED_REASON, repairedAt, row.task_id);
    const repairedAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      stageAttemptIds: attempts.map((attempt) => attempt.stage_attempt_id),
      status: 'queued',
      closeoutRefs: closeoutRefsFromAttemptPayload(attempts),
      closeoutReceiptStatus: 'domain_handler_receipt_ref_only',
      blockedReason: null,
      activityEvent: {
        activity_kind: 'domain_handler_dispatch_activity',
        activity_status: 'repaired_to_provider_admission_requested',
        blocked_reason: OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON,
        reason: OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
      },
    });
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_repaired_from_succeeded_route_admission_requested',
      source,
      payload: {
        previous_status: row.status,
        next_status: 'running',
        reason: OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
        blocker_reason: OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON,
        repaired_stage_attempt_ids: repairedAttempts.map((attempt) => attempt.stage_attempt_id),
        hydrate_followthrough_required: true,
        authority_boundary: {
          opl: 'route_admission_provider_followthrough_repair_only',
          domain: 'truth_quality_artifact_gate_owner',
          provider_completion_is_domain_ready: false,
          refs_only_checkpoint_is_running_proof: false,
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
        },
      },
    });
    repairedTaskIds.add(row.task_id);
    repairedCount += 1;
  }
  return { repairedCount, repairedTaskIds };
}
