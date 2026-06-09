import { DatabaseSync } from 'node:sqlite';

import type { EnqueueInput } from './family-runtime-command.ts';
import { deadLetterRedriveDecision } from './family-runtime-dead-letter-redrive.ts';
import { canonicalFamilyRuntimeTaskKind } from './family-runtime-mas-domain-route.ts';
import { MAS_PAPER_AUTONOMY_TASK_KINDS } from './family-runtime-paper-autonomy.ts';
import {
  MAS_STAGE_NATIVE_OWNER_ANSWER_MISSING_REASON,
  defaultExecutorMissingStageNativeOwnerAnswerRedriveDecision,
  hasMasStageNativeOwnerAnswer,
  isMasReadinessStageNativeOwnerAction,
  stageAttemptPayloadHasMasStageNativeOwnerAnswer,
} from './family-runtime-mas-stage-native-owner-answer.ts';
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
  defaultExecutorDomainSourceFingerprint,
  findLiveDefaultExecutorDispatchAttempt,
  findLiveDefaultExecutorStudyAttempt,
  isDefaultExecutorDispatchTask,
  refreshDefaultExecutorLiveAttemptTaskLease,
} from './family-runtime-provider-hosted-attempts.ts';
import {
  providerAdmissionCurrentnessIdentity,
  sameProviderAdmissionCurrentnessIdentity,
} from './family-runtime-mas-current-control-admission-currentness.ts';
import { listStageAttemptsForTask } from './family-runtime-stage-attempts.ts';
import { activeQueueHoldForTaskInput } from './family-runtime-queue-holds.ts';

const DEFAULT_EXECUTOR_DISPATCH_TASK_KIND = 'domain_owner/default-executor-dispatch';
const MAS_PAPER_AUTONOMY_STALE_DEAD_LETTER_MARKERS = [
  'owner_route_stale',
  'controller_route_work_unit_unsupported',
] as const;
const OPERATOR_RETIRED_STALE_RESIDUE_PREFIX = 'operator_retired_stale_runtime_residue:';
const DEFAULT_EXECUTOR_SUPERSEDED_REASON = 'mas_default_executor_superseded_by_current_source';
const TERMINAL_STAGE_ATTEMPT_STATUSES = new Set(['blocked', 'completed', 'dead_lettered', 'failed']);

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function sourceFingerprint(payload: Record<string, unknown>) {
  return defaultExecutorDomainSourceFingerprint(payload);
}

function exportOwnerFingerprint(payload: Record<string, unknown>) {
  const context = recordValue(payload.opl_domain_export_context);
  return optionalString(context?.owner_fingerprint);
}

function isDefaultExecutorDispatch(
  row: Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>,
  payload: Record<string, unknown>,
) {
  return isDefaultExecutorDispatchTask(row, payload);
}

function isDefaultExecutorDispatchInput(
  domainId: FamilyRuntimeTaskRow['domain_id'],
  taskKind: string,
  payload: Record<string, unknown>,
) {
  return isDefaultExecutorDispatch({ domain_id: domainId, task_kind: taskKind }, payload);
}

function defaultExecutorCandidateRow(input: {
  domainId: FamilyRuntimeTaskRow['domain_id'];
  taskKind: string;
  payload: Record<string, unknown>;
  dedupeKey: string | null;
  priority?: number;
  source?: string;
  requiresApproval?: boolean;
  createdAt: string;
}): FamilyRuntimeTaskRow {
  return {
    task_id: stableId('frt_candidate', [
      input.domainId,
      input.taskKind,
      input.dedupeKey,
      input.payload,
    ]),
    domain_id: input.domainId,
    task_kind: input.taskKind,
    payload_json: JSON.stringify(input.payload),
    dedupe_key: input.dedupeKey,
    priority: input.priority ?? 0,
    status: input.requiresApproval ? 'waiting_approval' : 'queued',
    attempts: 0,
    max_attempts: DEFAULT_MAX_ATTEMPTS,
    source: input.source ?? 'opl-cli',
    requires_approval: input.requiresApproval ? 1 : 0,
    approved_at: null,
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
    dead_letter_reason: null,
    created_at: input.createdAt,
    updated_at: input.createdAt,
  };
}

function recordValue(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function defaultExecutorMetadataRefresh(
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
) {
  const refreshedFields: string[] = [];
  const refreshedPayload = { ...existingPayload };
  const refreshReasons: string[] = [];

  const evidencePayload = recordValue(nextPayload.domain_dispatch_evidence_record_payload);
  if (evidencePayload) {
    const currentEvidencePayload = recordValue(existingPayload.domain_dispatch_evidence_record_payload);
    if (JSON.stringify(currentEvidencePayload) !== JSON.stringify(evidencePayload)) {
      refreshedPayload.domain_dispatch_evidence_record_payload = evidencePayload;
      refreshedFields.push('domain_dispatch_evidence_record_payload');
      refreshReasons.push('domain_dispatch_evidence_payload_changed_after_succeeded');
    }
  }

  const nextExportContext = recordValue(nextPayload.opl_domain_export_context);
  if (nextExportContext) {
    const currentExportContext = recordValue(existingPayload.opl_domain_export_context);
    if (JSON.stringify(currentExportContext) !== JSON.stringify(nextExportContext)) {
      refreshedPayload.opl_domain_export_context = nextExportContext;
      refreshedFields.push('opl_domain_export_context');
      const existingOwnerFingerprint = exportOwnerFingerprint(existingPayload);
      const nextOwnerFingerprint = exportOwnerFingerprint(nextPayload);
      refreshReasons.push(
        existingOwnerFingerprint !== nextOwnerFingerprint
          ? 'domain_export_owner_fingerprint_changed_after_succeeded'
          : 'domain_export_context_changed_after_succeeded',
      );
    }
  }

  if (refreshedFields.length === 0) {
    return null;
  }
  return {
    payload: refreshedPayload,
    refreshed_fields: refreshedFields,
    reason: refreshReasons[0],
    reasons: refreshReasons,
    previous_export_owner_fingerprint: exportOwnerFingerprint(existingPayload),
    next_export_owner_fingerprint: exportOwnerFingerprint(nextPayload),
  };
}

function defaultExecutorBlockedRedriveDecision(
  existing: FamilyRuntimeTaskRow,
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
) {
  if (
    existing.domain_id !== 'medautoscience'
    || existing.task_kind !== DEFAULT_EXECUTOR_DISPATCH_TASK_KIND
    || existing.status !== 'blocked'
    || ![
      'temporal_stage_attempt_start_failed',
      'temporal_stage_attempt_not_completed',
      'temporal_stage_attempt_canceled',
    ].includes(
      existing.dead_letter_reason ?? '',
    )
  ) {
    return null;
  }
  const existingSourceFingerprint = sourceFingerprint(existingPayload);
  const nextSourceFingerprint = sourceFingerprint(nextPayload);
  if (!existingSourceFingerprint || !nextSourceFingerprint || existingSourceFingerprint === nextSourceFingerprint) {
    return null;
  }
  return {
    reason: 'mas_default_executor_source_fingerprint_changed_after_blocked',
    previous_source_fingerprint: existingSourceFingerprint,
    next_source_fingerprint: nextSourceFingerprint,
  };
}

function defaultExecutorCloseoutRedriveDecision(
  existing: FamilyRuntimeTaskRow,
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
) {
  if (
    existing.status !== 'succeeded'
    || !isDefaultExecutorDispatch(existing, existingPayload)
    || !isDefaultExecutorDispatch(existing, nextPayload)
  ) {
    return null;
  }
  const redriveContext = recordValue(nextPayload.redrive_context);
  if (!redriveContext) {
    return null;
  }
  if (optionalString(redriveContext.status) !== 'non_consumable_closeout'
    || optionalString(redriveContext.next_action) !== 'redrive_owner_route_with_closeout_context') {
    return null;
  }
  return {
    reason: 'mas_default_executor_non_consumable_closeout_redrive',
    receipt_ref: optionalString(redriveContext.receipt_ref),
    execution_id: optionalString(redriveContext.execution_id),
    closeout_reason: optionalString(redriveContext.reason),
    previous_source_fingerprint: sourceFingerprint(existingPayload),
    next_source_fingerprint: sourceFingerprint(nextPayload),
  };
}

function defaultExecutorFreshCurrentControlAdmissionRedriveDecision(
  existing: FamilyRuntimeTaskRow,
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
) {
  if (
    existing.status !== 'succeeded'
    || !isDefaultExecutorDispatch(existing, existingPayload)
    || !isDefaultExecutorDispatch(existing, nextPayload)
  ) {
    return null;
  }
  const existingIdentity = providerAdmissionCurrentnessIdentity(existingPayload);
  const nextIdentity = providerAdmissionCurrentnessIdentity(nextPayload);
  if (!existingIdentity || !nextIdentity) {
    return null;
  }
  if (sameProviderAdmissionCurrentnessIdentity(existingIdentity, nextIdentity)) {
    return null;
  }
  return {
    reason: 'mas_current_control_provider_admission_fresh_after_succeeded',
    previous_currentness_identity: existingIdentity,
    next_currentness_identity: nextIdentity,
    previous_source_fingerprint: existingIdentity.source_fingerprint,
    next_source_fingerprint: nextIdentity.source_fingerprint,
  };
}

function defaultExecutorTerminalAttemptCurrentControlAdmissionRedriveDecision(
  existing: FamilyRuntimeTaskRow,
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
  stageAttempts: ReturnType<typeof listStageAttemptsForTask>,
) {
  if (
    existing.status !== 'succeeded'
    || !isDefaultExecutorDispatch(existing, existingPayload)
    || !isDefaultExecutorDispatch(existing, nextPayload)
  ) {
    return null;
  }
  const nextIdentity = providerAdmissionCurrentnessIdentity(nextPayload);
  if (!nextIdentity) {
    return null;
  }
  const terminalAttempt = stageAttempts.find((attempt) =>
    TERMINAL_STAGE_ATTEMPT_STATUSES.has(optionalString(attempt.status) ?? '')
  );
  if (!terminalAttempt) {
    return null;
  }
  const workspaceLocator = recordValue(terminalAttempt.workspace_locator);
  if (!workspaceLocator) {
    return null;
  }
  const terminalIdentity = providerAdmissionCurrentnessIdentity(
    workspaceLocator,
    { requirePendingStatus: false },
  );
  if (!terminalIdentity || sameProviderAdmissionCurrentnessIdentity(terminalIdentity, nextIdentity)) {
    return null;
  }
  return {
    reason: 'mas_current_control_provider_admission_fresh_after_terminal_attempt',
    terminal_stage_attempt_id: terminalAttempt.stage_attempt_id,
    terminal_stage_attempt_status: terminalAttempt.status,
    terminal_currentness_identity: terminalIdentity,
    next_currentness_identity: nextIdentity,
    previous_source_fingerprint: terminalIdentity.source_fingerprint,
    next_source_fingerprint: nextIdentity.source_fingerprint,
  };
}

function transportOnlySucceededDefaultExecutorAdmissionRedriveDecision(
  db: DatabaseSync,
  existing: FamilyRuntimeTaskRow,
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
) {
  if (
    existing.status !== 'succeeded'
    || !isDefaultExecutorDispatch(existing, existingPayload)
    || !isDefaultExecutorDispatch(existing, nextPayload)
    || listStageAttemptsForTask(db, existing.task_id).length > 0
  ) {
    return null;
  }
  const row = db.prepare(`
    SELECT payload_json
    FROM events
    WHERE task_id = ? AND event_type = 'task_dispatch_succeeded'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(existing.task_id) as { payload_json: string } | undefined;
  if (!row) {
    return null;
  }
  const eventPayload = recordValue(JSON.parse(row.payload_json));
  const output = recordValue(eventPayload?.output);
  const dispatch = recordValue(output?.dispatch);
  const result = recordValue(dispatch?.result);
  const admissionRequested = output?.opl_attempt_admission_requested === true
    || optionalString(output?.opl_attempt_admission_status) === 'requested'
    || optionalString(result?.status) === 'opl_attempt_admission_requested';
  if (
    !admissionRequested
    || optionalString(dispatch?.execution_policy) !== 'opl_default_executor_stage_attempt_admission'
  ) {
    return null;
  }
  return {
    reason: 'transport_only_admission_without_provider_stage_attempt',
    previous_source_fingerprint: sourceFingerprint(existingPayload),
    next_source_fingerprint: sourceFingerprint(nextPayload),
    previous_next_executable_owner: optionalString(existingPayload.next_executable_owner),
    next_executable_owner: optionalString(nextPayload.next_executable_owner),
  };
}

function latestDispatchSucceededPayload(db: DatabaseSync, taskId: string) {
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
    return recordValue(JSON.parse(row.payload_json));
  } catch {
    return null;
  }
}

function defaultExecutorResolvedMissingStageNativeOwnerAnswerDecision(
  db: DatabaseSync,
  existing: FamilyRuntimeTaskRow,
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
  stageAttempts: ReturnType<typeof listStageAttemptsForTask>,
) {
  if (
    existing.status !== 'blocked'
    || existing.dead_letter_reason !== MAS_STAGE_NATIVE_OWNER_ANSWER_MISSING_REASON
    || !isMasReadinessStageNativeOwnerAction(existing, existingPayload)
    || !isMasReadinessStageNativeOwnerAction(existing, nextPayload)
  ) {
    return null;
  }
  const liveAttempt = stageAttempts.find((attempt) => ['queued', 'running', 'checkpointed', 'human_gate'].includes(
    attempt.status,
  ));
  if (liveAttempt) {
    return null;
  }
  const evidenceRecords = [
    existingPayload,
    nextPayload,
    latestDispatchSucceededPayload(db, existing.task_id),
  ];
  const answerObserved = evidenceRecords.some((record) => hasMasStageNativeOwnerAnswer(record, nextPayload))
    || stageAttempts.some((attempt) => stageAttemptPayloadHasMasStageNativeOwnerAnswer(attempt, nextPayload));
  if (!answerObserved) {
    return null;
  }
  return {
    reason: 'stage_native_owner_answer_observed_after_previous_missing_blocker',
    previous_source_fingerprint: sourceFingerprint(existingPayload),
    next_source_fingerprint: sourceFingerprint(nextPayload),
    previous_work_unit_fingerprint: optionalString(recordValue(existingPayload.owner_route_currentness_basis)?.work_unit_fingerprint),
    next_work_unit_fingerprint: optionalString(recordValue(nextPayload.owner_route_currentness_basis)?.work_unit_fingerprint),
    stage_attempt_ids: stageAttempts.map((attempt) => attempt.stage_attempt_id),
    stage_attempt_statuses: stageAttempts.map((attempt) => attempt.status),
  };
}

function masPaperAutonomyDeadLetterCurrentnessBlock(existing: FamilyRuntimeTaskRow) {
  if (
    existing.domain_id !== 'medautoscience'
    || existing.status !== 'dead_letter'
    || !MAS_PAPER_AUTONOMY_TASK_KINDS.has(existing.task_kind)
  ) {
    return null;
  }
  const marker = MAS_PAPER_AUTONOMY_STALE_DEAD_LETTER_MARKERS.find((candidate) =>
    existing.last_error?.includes(candidate)
  );
  if (!marker) {
    return null;
  }
  return {
    reason: 'mas_paper_autonomy_stale_or_unsupported_owner_route',
    domain_blocker_marker: marker,
  };
}

function operatorRetiredStaleResidueBlock(existing: FamilyRuntimeTaskRow) {
  const marker = existing.dead_letter_reason ?? existing.last_error ?? '';
  if (
    existing.status !== 'blocked'
    || !marker.startsWith(OPERATOR_RETIRED_STALE_RESIDUE_PREFIX)
  ) {
    return null;
  }
  return {
    reason: 'operator_retired_stale_runtime_residue',
    operator_retirement_reason: marker.slice(OPERATOR_RETIRED_STALE_RESIDUE_PREFIX.length),
  };
}

function defaultExecutorSupersededCurrentControlAdmissionRedriveDecision(
  existing: FamilyRuntimeTaskRow,
  nextPayload: Record<string, unknown>,
) {
  if (
    existing.domain_id !== 'medautoscience'
    || existing.task_kind !== DEFAULT_EXECUTOR_DISPATCH_TASK_KIND
    || existing.status !== 'blocked'
    || existing.dead_letter_reason !== DEFAULT_EXECUTOR_SUPERSEDED_REASON
  ) {
    return null;
  }
  const nextIdentity = providerAdmissionCurrentnessIdentity(nextPayload);
  if (!nextIdentity) {
    return null;
  }
  return {
    reason: 'mas_current_control_provider_admission_after_superseded_blocker',
    next_currentness_identity: nextIdentity,
    next_source_fingerprint: nextIdentity.source_fingerprint,
  };
}

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
    const existing = db.prepare('SELECT * FROM tasks WHERE dedupe_key = ?').get(dedupeKey) as
      | FamilyRuntimeTaskRow
      | undefined;
    if (existing) {
      const exportedPayloadJson = JSON.stringify(payload);
      const exportedTaskChanged = existing.payload_json !== exportedPayloadJson
        || existing.task_kind !== taskKind
        || existing.domain_id !== input.domainId;
      const existingPayload = JSON.parse(existing.payload_json) as Record<string, unknown>;
      const defaultExecutorSucceededAdmissionRefresh = existing.status === 'succeeded'
        && exportedTaskChanged
        && isDefaultExecutorDispatch(existing, existingPayload)
        && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload);
      const existingStageAttempts = isDefaultExecutorDispatch(existing, existingPayload)
        && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)
        ? listStageAttemptsForTask(db, existing.task_id)
        : [];
      const closeoutRedrive = defaultExecutorSucceededAdmissionRefresh
        ? defaultExecutorCloseoutRedriveDecision(existing, existingPayload, payload)
        : null;
      const transportOnlyAdmissionRedrive = isDefaultExecutorDispatch(existing, existingPayload)
        && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)
        ? transportOnlySucceededDefaultExecutorAdmissionRedriveDecision(db, existing, existingPayload, payload)
        : null;
      const missingStageNativeOwnerAnswerRedrive = defaultExecutorMissingStageNativeOwnerAnswerRedriveDecision({
        db,
        existing,
        existingPayload,
        nextPayload: payload,
        stageAttempts: existingStageAttempts,
      });
      const resolvedMissingStageNativeOwnerAnswer = defaultExecutorResolvedMissingStageNativeOwnerAnswerDecision(
        db,
        existing,
        existingPayload,
        payload,
        existingStageAttempts,
      );
      const freshCurrentControlAdmissionRedrive = defaultExecutorSucceededAdmissionRefresh
        ? defaultExecutorFreshCurrentControlAdmissionRedriveDecision(existing, existingPayload, payload)
        : null;
      const terminalAttemptCurrentControlAdmissionRedrive = isDefaultExecutorDispatch(existing, existingPayload)
        && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)
        ? defaultExecutorTerminalAttemptCurrentControlAdmissionRedriveDecision(
          existing,
          existingPayload,
          payload,
          existingStageAttempts,
        )
        : null;
      const supersededCurrentControlAdmissionRedrive = isDefaultExecutorDispatch(existing, existingPayload)
        && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)
        ? defaultExecutorSupersededCurrentControlAdmissionRedriveDecision(existing, payload)
        : null;
      if (resolvedMissingStageNativeOwnerAnswer) {
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
            ...resolvedMissingStageNativeOwnerAnswer,
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
      if (exportedTaskChanged && closeoutRedrive) {
        const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
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
          requiresApproval ? 1 : 0,
          initialLastError,
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_requeued_from_mas_default_executor_redrive_context',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            next_status: nextStatus,
            active_hold_id: activeHold?.hold_id ?? null,
            ...closeoutRedrive,
            authority_boundary: {
              opl: 'provider_transport_redrive_from_mas_closeout_context_only',
              domain: 'truth_quality_artifact_gate_owner',
              domain_truth_mutation: false,
              publication_quality_mutation: false,
              artifact_gate_mutation: false,
              current_package_mutation: false,
            },
          },
        });
        insertNotification(db, {
          taskId: refreshed.task_id,
          severity: 'info',
          title: 'Family runtime task requeued from MAS closeout redrive',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey, active_hold_id: activeHold?.hold_id ?? null },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
      if (transportOnlyAdmissionRedrive) {
        const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
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
          requiresApproval ? 1 : 0,
          initialLastError,
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_requeued_from_transport_only_succeeded_default_executor_admission',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            next_status: nextStatus,
            active_hold_id: activeHold?.hold_id ?? null,
            ...transportOnlyAdmissionRedrive,
            authority_boundary: {
              opl: 'provider_transport_redrive_from_transport_only_admission_receipt',
              domain: 'truth_quality_artifact_gate_owner',
              domain_truth_mutation: false,
              publication_quality_mutation: false,
              artifact_gate_mutation: false,
              current_package_mutation: false,
            },
          },
        });
        insertNotification(db, {
          taskId: refreshed.task_id,
          severity: 'info',
          title: 'Family runtime task requeued from transport-only admission',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey, active_hold_id: activeHold?.hold_id ?? null },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
      if (missingStageNativeOwnerAnswerRedrive) {
        const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
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
          requiresApproval ? 1 : 0,
          initialLastError,
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_requeued_from_missing_stage_native_owner_answer',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            next_status: nextStatus,
            active_hold_id: activeHold?.hold_id ?? null,
            ...missingStageNativeOwnerAnswerRedrive,
            authority_boundary: {
              opl: 'queue_redrive_until_domain_owner_answer_observed_only',
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
          title: 'Family runtime task requeued for missing MAS owner answer',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey, active_hold_id: activeHold?.hold_id ?? null },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
      if (freshCurrentControlAdmissionRedrive) {
        const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
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
          requiresApproval ? 1 : 0,
          initialLastError,
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_requeued_from_mas_current_control_provider_admission',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            next_status: nextStatus,
            active_hold_id: activeHold?.hold_id ?? null,
            ...freshCurrentControlAdmissionRedrive,
            authority_boundary: {
              opl: 'queue_attempt_provider_transport_rehydrate_from_mas_current_control_only',
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
          title: 'Family runtime task requeued from MAS current-control admission',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey, active_hold_id: activeHold?.hold_id ?? null },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
      if (terminalAttemptCurrentControlAdmissionRedrive) {
        const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
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
          requiresApproval ? 1 : 0,
          initialLastError,
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_requeued_from_mas_current_control_provider_admission',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            next_status: nextStatus,
            active_hold_id: activeHold?.hold_id ?? null,
            ...terminalAttemptCurrentControlAdmissionRedrive,
            authority_boundary: {
              opl: 'queue_attempt_provider_transport_rehydrate_from_mas_current_control_only',
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
          title: 'Family runtime task requeued from MAS current-control terminal attempt',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey, active_hold_id: activeHold?.hold_id ?? null },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
      if (supersededCurrentControlAdmissionRedrive) {
        const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
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
          requiresApproval ? 1 : 0,
          initialLastError,
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_requeued_from_mas_current_control_provider_admission',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            next_status: nextStatus,
            active_hold_id: activeHold?.hold_id ?? null,
            ...supersededCurrentControlAdmissionRedrive,
            authority_boundary: {
              opl: 'queue_attempt_provider_transport_rehydrate_from_mas_current_control_only',
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
          title: 'Family runtime task requeued from MAS current-control supersession',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey, active_hold_id: activeHold?.hold_id ?? null },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
      const metadataRefresh = defaultExecutorSucceededAdmissionRefresh
        ? defaultExecutorMetadataRefresh(existingPayload, payload)
        : null;
      if (metadataRefresh) {
        db.prepare(`
          UPDATE tasks
          SET payload_json = ?, source = ?, updated_at = ?
          WHERE task_id = ?
        `).run(
          JSON.stringify(metadataRefresh.payload),
          input.source ?? 'opl-cli',
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_metadata_refreshed_from_domain_export',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            retained_status: refreshed.status,
            reason: metadataRefresh.reason,
            reasons: metadataRefresh.reasons,
            previous_export_owner_fingerprint:
              metadataRefresh.previous_export_owner_fingerprint,
            next_export_owner_fingerprint:
              metadataRefresh.next_export_owner_fingerprint,
            refreshed_fields: metadataRefresh.refreshed_fields,
            authority_boundary: {
              opl: 'queue_metadata_refresh_after_domain_export_update_only',
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
          task: taskToPayload(refreshed),
        };
      }
      if (existing.status === 'succeeded' && exportedTaskChanged && !defaultExecutorSucceededAdmissionRefresh) {
        const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
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
          requiresApproval ? 1 : 0,
          initialLastError,
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
            active_hold_id: activeHold?.hold_id ?? null,
          },
        });
        insertNotification(db, {
          taskId: refreshed.task_id,
          severity: 'info',
          title: 'Family runtime task requeued',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey, active_hold_id: activeHold?.hold_id ?? null },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
      const deadLetterRedrive = deadLetterRedriveDecision(existingPayload, payload);
      const blockedRedrive = defaultExecutorBlockedRedriveDecision(existing, existingPayload, payload);
      const paperAutonomyDeadLetterBlock = deadLetterRedrive
        ? masPaperAutonomyDeadLetterCurrentnessBlock(existing)
        : null;
      const retiredResidueBlock = operatorRetiredStaleResidueBlock(existing);
      if (retiredResidueBlock) {
        insertEvent(db, {
          taskId: existing.task_id,
          domainId: existing.domain_id,
          eventType: 'task_requeue_blocked_by_operator_retired_residue',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            retained_status: existing.status,
            ...retiredResidueBlock,
            authority_boundary: {
              opl: 'queue_lifecycle_retirement_guard_only',
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
      if (exportedTaskChanged && blockedRedrive) {
        const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
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
          requiresApproval ? 1 : 0,
          initialLastError,
          createdAt,
          existing.task_id,
        );
        const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
        insertEvent(db, {
          taskId: refreshed.task_id,
          domainId: refreshed.domain_id,
          eventType: 'task_requeued_from_blocked_after_domain_owner_update',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            next_status: nextStatus,
            active_hold_id: activeHold?.hold_id ?? null,
            ...blockedRedrive,
          },
        });
        insertNotification(db, {
          taskId: refreshed.task_id,
          severity: 'info',
          title: 'Family runtime task requeued after domain owner update',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey, active_hold_id: activeHold?.hold_id ?? null },
        });
        return {
          accepted: true,
          requeued_from_terminal: true,
          idempotent_noop: false,
          task: taskToPayload(refreshed),
        };
      }
      if (exportedTaskChanged && paperAutonomyDeadLetterBlock) {
        insertEvent(db, {
          taskId: existing.task_id,
          domainId: existing.domain_id,
          eventType: 'task_dead_letter_redrive_blocked_by_domain_currentness',
          source: input.source ?? 'opl-cli',
          payload: {
            dedupe_key: dedupeKey,
            previous_status: existing.status,
            retained_status: existing.status,
            ...paperAutonomyDeadLetterBlock,
            attempted_redrive_reason: deadLetterRedrive?.reason ?? null,
            authority_boundary: {
              opl: 'queue_redrive_currentness_guard_only',
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
      if (existing.status === 'dead_letter' && exportedTaskChanged && deadLetterRedrive) {
        const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
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
          requiresApproval ? 1 : 0,
          initialLastError,
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
            active_hold_id: activeHold?.hold_id ?? null,
            ...deadLetterRedrive,
          },
        });
        insertNotification(db, {
          taskId: refreshed.task_id,
          severity: 'info',
          title: 'Family runtime task requeued after domain owner update',
          body: `${input.domainId}:${taskKind}`,
          payload: { status: nextStatus, dedupe_key: dedupeKey, active_hold_id: activeHold?.hold_id ?? null },
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

  let deferredDefaultExecutorLiveAttempt: {
    liveAttempt: NonNullable<ReturnType<typeof findLiveDefaultExecutorDispatchAttempt>>;
    liveDispatchAttemptMatched: boolean;
    lease: ReturnType<typeof refreshDefaultExecutorLiveAttemptTaskLease>;
  } | null = null;
  if (isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)) {
    const candidate = defaultExecutorCandidateRow({
      domainId: input.domainId,
      taskKind,
      payload,
      dedupeKey,
      priority: input.priority,
      source: input.source,
      requiresApproval,
      createdAt,
    });
    const liveDispatchAttempt = findLiveDefaultExecutorDispatchAttempt(db, candidate, payload);
    const liveAttempt = liveDispatchAttempt ?? findLiveDefaultExecutorStudyAttempt(db, candidate, payload);
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
          candidate_source_fingerprint: sourceFingerprint(payload),
          live_source_fingerprint: liveAttempt.workspace_locator.domain_source_fingerprint ?? null,
          dispatch_ref: payload.dispatch_ref ?? null,
          action_type: payload.action_type ?? null,
          live_action_type: liveAttempt.workspace_locator.action_type ?? null,
          study_id: payload.study_id ?? null,
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
    payload,
    createdAt,
  ]);
  const task = {
    task_id: taskId,
    domain_id: input.domainId,
    task_kind: taskKind,
    payload_json: JSON.stringify(payload),
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
        candidate_source_fingerprint: sourceFingerprint(payload),
        live_source_fingerprint: liveAttempt.workspace_locator.domain_source_fingerprint ?? null,
        dispatch_ref: payload.dispatch_ref ?? null,
        action_type: payload.action_type ?? null,
        live_action_type: liveAttempt.workspace_locator.action_type ?? null,
        study_id: payload.study_id ?? null,
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
