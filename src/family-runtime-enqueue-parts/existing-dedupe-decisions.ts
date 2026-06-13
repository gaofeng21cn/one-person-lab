import { DatabaseSync } from 'node:sqlite';

import {
  MAS_STAGE_NATIVE_OWNER_ANSWER_MISSING_REASON,
  hasMasStageNativeOwnerAnswer,
  isMasReadinessStageNativeOwnerAction,
  stageAttemptPayloadHasMasStageNativeOwnerAnswer,
} from '../family-runtime-mas-stage-native-owner-answer.ts';
import {
  DEFAULT_MAX_ATTEMPTS,
  stableId,
  type FamilyRuntimeTaskRow,
} from '../family-runtime-store.ts';
import { MAS_PAPER_AUTONOMY_TASK_KINDS } from '../family-runtime-paper-autonomy.ts';
import {
  DEFAULT_EXECUTOR_TRANSPORT_ONLY_ADMISSION_SUPERSEDED_REASON,
  defaultExecutorDomainSourceFingerprint,
  isDefaultExecutorDispatchTask,
  isTransportOnlyDefaultExecutorAdmissionCheckpoint,
} from '../family-runtime-provider-hosted-attempts.ts';
import {
  providerAdmissionCurrentnessIdentity,
  sameProviderAdmissionCurrentnessIdentity,
} from '../family-runtime-mas-current-control-admission-currentness.ts';
import { listStageAttemptsForTask, updateStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';

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

export function sourceFingerprint(payload: Record<string, unknown>) {
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

export function isDefaultExecutorDispatchInput(
  domainId: FamilyRuntimeTaskRow['domain_id'],
  taskKind: string,
  payload: Record<string, unknown>,
) {
  return isDefaultExecutorDispatch({ domain_id: domainId, task_kind: taskKind }, payload);
}

export function defaultExecutorCandidateRow(input: {
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

export function isDedupeUniqueConstraintError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('UNIQUE constraint failed: tasks.dedupe_key');
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
    !['succeeded', 'blocked'].includes(existing.status)
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
  const nextIdentity = providerAdmissionCurrentnessIdentity(nextPayload)
    ?? providerAdmissionCurrentnessIdentity(nextPayload, { requirePendingStatus: false });
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

function defaultExecutorQueuedCurrentControlAdmissionRefreshDecision(
  existing: FamilyRuntimeTaskRow,
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
) {
  if (
    !['queued', 'waiting_approval'].includes(existing.status)
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
    reason: 'mas_current_control_provider_admission_fresh_after_queued',
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
    !['succeeded', 'blocked'].includes(existing.status)
    || !isDefaultExecutorDispatch(existing, existingPayload)
    || !isDefaultExecutorDispatch(existing, nextPayload)
  ) {
    return null;
  }
  const nextIdentity = providerAdmissionCurrentnessIdentity(nextPayload)
    ?? providerAdmissionCurrentnessIdentity(nextPayload, { requirePendingStatus: false });
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

function defaultExecutorRunningTerminalCurrentControlAdmissionNoopDecision(
  existing: FamilyRuntimeTaskRow,
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
  stageAttempts: ReturnType<typeof listStageAttemptsForTask>,
) {
  if (
    existing.status !== 'running'
    || !isDefaultExecutorDispatch(existing, existingPayload)
    || !isDefaultExecutorDispatch(existing, nextPayload)
  ) {
    return null;
  }
  const existingIdentity = providerAdmissionCurrentnessIdentity(existingPayload);
  const nextIdentity = providerAdmissionCurrentnessIdentity(nextPayload);
  if (!existingIdentity || !nextIdentity || !sameProviderAdmissionCurrentnessIdentity(existingIdentity, nextIdentity)) {
    return null;
  }
  const terminalAttempt = stageAttempts.find((attempt) => {
    if (!TERMINAL_STAGE_ATTEMPT_STATUSES.has(optionalString(attempt.status) ?? '')) {
      return false;
    }
    const attemptIdentity = providerAdmissionCurrentnessIdentity(
      attempt.workspace_locator,
      { requirePendingStatus: false },
    );
    return !attemptIdentity
      || sameProviderAdmissionCurrentnessIdentity(attemptIdentity, nextIdentity)
      || sameProviderAdmissionCurrentnessIdentity(existingIdentity, nextIdentity);
  });
  if (!terminalAttempt) {
    return null;
  }
  const closeoutRefs = Array.isArray(terminalAttempt.closeout_refs)
    ? terminalAttempt.closeout_refs.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];
  return {
    reason: 'terminal_stage_attempt_same_currentness_clears_stale_running_queue_projection',
    terminal_stage_attempt_id: terminalAttempt.stage_attempt_id,
    terminal_stage_attempt_status: terminalAttempt.status,
    terminal_provider_status: optionalString(terminalAttempt.provider_run.provider_status),
    closeout_refs: closeoutRefs,
    currentness_identity: nextIdentity,
    previous_source_fingerprint: existingIdentity.source_fingerprint,
    next_source_fingerprint: nextIdentity.source_fingerprint,
  };
}

function transportOnlySucceededDefaultExecutorAdmissionRedriveDecision(
  db: DatabaseSync,
  existing: FamilyRuntimeTaskRow,
  existingPayload: Record<string, unknown>,
  nextPayload: Record<string, unknown>,
) {
  const existingStageAttempts = listStageAttemptsForTask(db, existing.task_id);
  const nonTransportOnlyStageAttempts = existingStageAttempts.filter((attempt) => (
    !isTransportOnlyDefaultExecutorAdmissionCheckpoint(attempt)
  ));
  if (
    existing.status !== 'succeeded'
    || !isDefaultExecutorDispatch(existing, existingPayload)
    || !isDefaultExecutorDispatch(existing, nextPayload)
    || nonTransportOnlyStageAttempts.length > 0
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
    transport_only_stage_attempt_ids: existingStageAttempts.map((attempt) => attempt.stage_attempt_id),
  };
}

function markTransportOnlyAdmissionCheckpointsSuperseded(
  db: DatabaseSync,
  input: {
    taskId: string;
    source: string;
  },
) {
  const attempts = listStageAttemptsForTask(db, input.taskId).filter(isTransportOnlyDefaultExecutorAdmissionCheckpoint);
  if (attempts.length === 0) {
    return [];
  }
  return updateStageAttemptsForTask(db, {
    taskId: input.taskId,
    stageAttemptIds: attempts.map((attempt) => attempt.stage_attempt_id),
    status: 'blocked',
    blockedReason: DEFAULT_EXECUTOR_TRANSPORT_ONLY_ADMISSION_SUPERSEDED_REASON,
    activityEvent: {
      activity_kind: 'mas_default_executor_transport_admission_redrive',
      activity_status: 'blocked',
      blocked_reason: DEFAULT_EXECUTOR_TRANSPORT_ONLY_ADMISSION_SUPERSEDED_REASON,
      reason: 'transport_only_admission_checkpoint_without_provider_owner_answer',
      authority_boundary: {
        opl: 'queue_attempt_transport_checkpoint_supersession_only',
        domain: 'truth_quality_artifact_gate_owner',
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        provider_completion_is_domain_ready: false,
      },
    },
  });
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
  const providerAdmissionIdentity = providerAdmissionCurrentnessIdentity(nextPayload);
  const nextIdentity = providerAdmissionIdentity
    ?? providerAdmissionCurrentnessIdentity(nextPayload, { requirePendingStatus: false });
  if (!nextIdentity) {
    return null;
  }
  return {
    reason: providerAdmissionIdentity
      ? 'mas_current_control_provider_admission_after_superseded_blocker'
      : 'mas_current_owner_route_admission_after_superseded_blocker',
    next_currentness_identity: nextIdentity,
    next_source_fingerprint: nextIdentity.source_fingerprint,
  };
}

export {
  defaultExecutorBlockedRedriveDecision,
  defaultExecutorCloseoutRedriveDecision,
  defaultExecutorFreshCurrentControlAdmissionRedriveDecision,
  defaultExecutorMetadataRefresh,
  defaultExecutorQueuedCurrentControlAdmissionRefreshDecision,
  defaultExecutorResolvedMissingStageNativeOwnerAnswerDecision,
  defaultExecutorRunningTerminalCurrentControlAdmissionNoopDecision,
  defaultExecutorSupersededCurrentControlAdmissionRedriveDecision,
  defaultExecutorTerminalAttemptCurrentControlAdmissionRedriveDecision,
  isDefaultExecutorDispatch,
  markTransportOnlyAdmissionCheckpointsSuperseded,
  masPaperAutonomyDeadLetterCurrentnessBlock,
  operatorRetiredStaleResidueBlock,
  transportOnlySucceededDefaultExecutorAdmissionRedriveDecision,
};
