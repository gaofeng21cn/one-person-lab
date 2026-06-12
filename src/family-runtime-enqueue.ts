import { DatabaseSync } from 'node:sqlite';

import type { EnqueueInput } from './family-runtime-command.ts';
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
import {
  findLiveDefaultExecutorDispatchAttempt,
  findLiveDefaultExecutorStudyAttempt,
  refreshDefaultExecutorLiveAttemptTaskLease,
} from './family-runtime-provider-hosted-attempts.ts';
import { findAntiLoopStopLossSuccessorAdmission } from './family-runtime-stop-loss-successor-policy.ts';
import { activeQueueHoldForTaskInput } from './family-runtime-queue-holds.ts';
import {
  defaultExecutorCandidateRow,
  isDedupeUniqueConstraintError,
  isDefaultExecutorDispatchInput,
  reconcileExistingDedupeTask,
  sourceFingerprint,
} from './family-runtime-enqueue-parts/existing-dedupe-reconcile.ts';

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
  const activeHold = activeQueueHoldForTaskInput(db, {
    domainId: input.domainId,
    taskKind,
    payload,
  });
  const requiresApproval = input.requiresApproval || Boolean(activeHold);
  const initialStatus: FamilyRuntimeTaskStatus = requiresApproval ? 'waiting_approval' : 'queued';
  const initialLastError = activeHold?.reason ?? null;
  if (dedupeKey) {
    const reconciled = reconcileExistingDedupeTask(db, {
      input,
      taskKind,
      payload,
      activeHold,
      requiresApproval,
      initialStatus,
      initialLastError,
      createdAt,
      dedupeKey,
    });
    if (reconciled) {
      return reconciled;
    }
  }

  const stopLossSuccessor = isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)
    ? findAntiLoopStopLossSuccessorAdmission(db, {
        domainId: input.domainId,
        taskKind,
        payload,
      })
    : null;
  const admittedPayload: Record<string, unknown> = stopLossSuccessor?.admission.nextPayload ?? payload;
  let deferredDefaultExecutorLiveAttempt: {
    liveAttempt: NonNullable<ReturnType<typeof findLiveDefaultExecutorDispatchAttempt>>;
    liveDispatchAttemptMatched: boolean;
    lease: ReturnType<typeof refreshDefaultExecutorLiveAttemptTaskLease>;
  } | null = null;
  if (isDefaultExecutorDispatchInput(input.domainId, taskKind, admittedPayload)) {
    const candidate = defaultExecutorCandidateRow({
      domainId: input.domainId,
      taskKind,
      payload: admittedPayload,
      dedupeKey,
      priority: input.priority,
      source: input.source,
      requiresApproval,
      createdAt,
    });
    const liveDispatchAttempt = findLiveDefaultExecutorDispatchAttempt(db, candidate, admittedPayload);
    const liveAttempt = liveDispatchAttempt ?? findLiveDefaultExecutorStudyAttempt(db, candidate, admittedPayload);
    if (liveAttempt?.task_id) {
      const lease = refreshDefaultExecutorLiveAttemptTaskLease(db, {
        attempt: liveAttempt,
        source: input.source ?? 'opl-cli',
        reason: liveDispatchAttempt
          ? 'same_dispatch_live_stage_attempt_exists_at_enqueue'
          : 'same_study_live_stage_attempt_exists_at_enqueue',
      });
      insertEvent(db, {
        taskId: liveAttempt.task_id,
        domainId: input.domainId,
        eventType: 'task_default_executor_live_dispatch_enqueue_noop',
        source: input.source ?? 'opl-cli',
        payload: {
          dedupe_key: dedupeKey,
          reason: liveDispatchAttempt
            ? 'same_dispatch_live_stage_attempt_exists_at_enqueue'
            : 'same_study_live_stage_attempt_exists_at_enqueue',
          stage_attempt_id: liveAttempt.stage_attempt_id,
          candidate_source_fingerprint: sourceFingerprint(admittedPayload),
          live_source_fingerprint: liveAttempt.workspace_locator.domain_source_fingerprint ?? null,
          dispatch_ref: admittedPayload.dispatch_ref ?? null,
          action_type: admittedPayload.action_type ?? null,
          live_action_type: liveAttempt.workspace_locator.action_type ?? null,
          study_id: admittedPayload.study_id ?? null,
          lease,
          authority_boundary: {
            opl: 'queue_intake_single_flight_noop_only',
            domain: 'truth_quality_artifact_gate_owner',
            domain_truth_mutation: false,
            publication_quality_mutation: false,
            artifact_gate_mutation: false,
            current_package_mutation: false,
          },
        },
      });
      deferredDefaultExecutorLiveAttempt = {
        liveAttempt,
        liveDispatchAttemptMatched: Boolean(liveDispatchAttempt),
        lease,
      };
    }
  }

  const taskId = stableId('frt', [
    input.domainId,
    taskKind,
    dedupeKey,
    admittedPayload,
    createdAt,
  ]);
  const task = {
    task_id: taskId,
    domain_id: input.domainId,
    task_kind: taskKind,
    payload_json: JSON.stringify(admittedPayload),
    dedupe_key: dedupeKey,
    priority: input.priority ?? 0,
    status: initialStatus,
    attempts: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    source: input.source ?? 'opl-cli',
    requires_approval: requiresApproval ? 1 : 0,
    approved_at: null,
    lease_owner: null,
    lease_expires_at: null,
    last_error: initialLastError,
    dead_letter_reason: null,
    created_at: createdAt,
    updated_at: createdAt,
  };

  try {
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
  } catch (error) {
    if (!dedupeKey || !isDedupeUniqueConstraintError(error)) {
      throw error;
    }
    const existing = db.prepare('SELECT * FROM tasks WHERE dedupe_key = ?').get(dedupeKey) as
      | FamilyRuntimeTaskRow
      | undefined;
    if (!existing) {
      throw error;
    }
    insertEvent(db, {
      taskId: existing.task_id,
      domainId: existing.domain_id,
      eventType: 'task_enqueue_dedupe_race_noop',
      source: input.source ?? 'opl-cli',
      payload: {
        dedupe_key: dedupeKey,
        attempted_task_id: taskId,
        retained_status: existing.status,
        reason: 'concurrent_enqueue_dedupe_key_won_by_existing_task',
        authority_boundary: {
          opl: 'queue_dedupe_idempotency_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          provider_stage_attempt_started: false,
        },
      },
    });
    return {
      accepted: false,
      idempotent_noop: true,
      task: taskToPayload(existing),
    };
  }
  insertEvent(db, {
    taskId,
    domainId: input.domainId,
    eventType: initialStatus === 'waiting_approval' ? 'task_waiting_approval' : 'task_enqueued',
    source: input.source ?? 'opl-cli',
    payload: {
      task_kind: taskKind,
      dedupe_key: dedupeKey,
      active_hold_id: activeHold?.hold_id ?? null,
      active_hold_reason: activeHold?.reason ?? null,
    },
  });
  if (deferredDefaultExecutorLiveAttempt) {
    const { liveAttempt, liveDispatchAttemptMatched, lease } = deferredDefaultExecutorLiveAttempt;
    insertEvent(db, {
      taskId,
      domainId: input.domainId,
      eventType: 'task_default_executor_live_dispatch_enqueue_deferred',
      source: input.source ?? 'opl-cli',
      payload: {
        dedupe_key: dedupeKey,
        reason: liveDispatchAttemptMatched
          ? 'same_dispatch_live_stage_attempt_exists_at_enqueue'
          : 'same_study_live_stage_attempt_exists_at_enqueue',
        live_task_id: liveAttempt.task_id,
        stage_attempt_id: liveAttempt.stage_attempt_id,
        candidate_source_fingerprint: sourceFingerprint(admittedPayload),
        live_source_fingerprint: liveAttempt.workspace_locator.domain_source_fingerprint ?? null,
        dispatch_ref: admittedPayload.dispatch_ref ?? null,
        action_type: admittedPayload.action_type ?? null,
        live_action_type: liveAttempt.workspace_locator.action_type ?? null,
        study_id: admittedPayload.study_id ?? null,
        lease,
        authority_boundary: {
          opl: 'queue_intake_single_flight_defer_only',
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
  if (stopLossSuccessor) {
    insertEvent(db, {
      taskId,
      domainId: input.domainId,
      eventType: 'task_stop_loss_successor_admitted',
      source: input.source ?? 'opl-cli',
      payload: {
        dedupe_key: dedupeKey,
        previous_status: stopLossSuccessor.task.status,
        next_status: initialStatus,
        active_hold_id: activeHold?.hold_id ?? null,
        ...stopLossSuccessor.admission.payload,
      },
    });
  }
  insertNotification(db, {
    taskId,
    severity: 'info',
    title: initialStatus === 'waiting_approval' ? 'Family runtime task waiting for approval' : 'Family runtime task queued',
    body: `${input.domainId}:${taskKind}`,
    payload: { status: initialStatus, active_hold_id: activeHold?.hold_id ?? null },
  });
  return {
    accepted: true,
    idempotent_noop: false,
    task: taskToPayload(task as FamilyRuntimeTaskRow),
  };
}
