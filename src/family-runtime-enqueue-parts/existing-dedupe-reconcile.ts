import { DatabaseSync } from 'node:sqlite';

import type { EnqueueInput } from '../family-runtime-command.ts';
import { deadLetterRedriveDecision } from '../family-runtime-dead-letter-redrive.ts';
import { defaultExecutorMissingStageNativeOwnerAnswerRedriveDecision } from '../family-runtime-mas-stage-native-owner-answer.ts';
import {
  insertEvent,
  insertNotification,
  taskToPayload,
  type FamilyRuntimeTaskRow,
  type FamilyRuntimeTaskStatus,
} from '../family-runtime-store.ts';
import { antiLoopStopLossSameLineageDecision } from '../family-runtime-stop-loss-successor-policy.ts';
import type { ActiveFamilyRuntimeQueueHold } from '../family-runtime-queue-holds.ts';
import { refreshDefaultExecutorLiveAttemptTaskLease } from '../family-runtime-provider-hosted-attempts.ts';
import { paperMissionStageRouteIdentityValue } from '../family-runtime-paper-mission-stage-route-terminal-sync.ts';
import { isLiveSameTaskDefaultExecutorAttempt } from './existing-dedupe-live-attempt.ts';
import { applyExistingDedupeRequeue } from './existing-dedupe-requeue.ts';
import {
  defaultExecutorBlockedRedriveDecision,
  defaultExecutorCloseoutRedriveDecision,
  defaultExecutorFreshCurrentControlAdmissionRedriveDecision,
  defaultExecutorMetadataRefresh,
  defaultExecutorQueuedCurrentControlAdmissionRefreshDecision,
  defaultExecutorResolvedMissingStageNativeOwnerAnswerDecision,
  defaultExecutorRunningTerminalCurrentControlAdmissionNoopDecision,
  defaultExecutorSucceededProviderLeaseRequiredRedriveDecision,
  defaultExecutorSupersededCurrentControlAdmissionRedriveDecision,
  defaultExecutorTerminalConsumedCurrentControlAdmissionNoopDecision,
  defaultExecutorTerminalAttemptCurrentControlAdmissionRedriveDecision,
  isDefaultExecutorDispatch,
  isDefaultExecutorDispatchInput,
  markTransportOnlyAdmissionCheckpointsSuperseded,
  masPaperAutonomyDeadLetterCurrentnessBlock,
  operatorRetiredStaleResidueBlock,
  sourceFingerprint,
  transportOnlySucceededDefaultExecutorAdmissionRedriveDecision,
} from './existing-dedupe-decisions.ts';
import {
  listStageAttemptsForTask,
  updateStageAttemptsForTask,
} from '../family-runtime-stage-attempts.ts';

export {
  defaultExecutorCandidateRow,
  isDedupeUniqueConstraintError,
  isDefaultExecutorDispatchInput,
  sourceFingerprint,
} from './existing-dedupe-decisions.ts';

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function recordValue(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stableComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableComparableValue(entry));
  }
  const record = recordValue(value);
  if (!record) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, stableComparableValue(record[key])]),
  );
}

function stableComparableJson(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }
  return JSON.stringify(stableComparableValue(value));
}

const PAPER_MISSION_STALE_WORKSPACE_SUPERSEDED_REASON =
  'paper_mission_stage_route_stale_workspace_superseded_by_domain_workspace_handoff';
const PAPER_MISSION_DOMAIN_GATE_FRESH_HANDOFF_REASONS = new Set([
  'paper_mission_stage_route_domain_gate_pending',
  'paper_mission_stage_route_domain_authority_required',
]);
const PAPER_MISSION_LEGACY_IDENTITY_BLOCKER_FRESH_HANDOFF_REASONS = new Set([
  'paper_mission_route_missing_identity_field:route_identity_key',
  'paper_mission_route_missing_identity_field:attempt_idempotency_key',
]);

function isOplRepoWorkspace(value: string | null) {
  return Boolean(value && /(?:^|\/)one-person-lab(?:\/|$)/.test(value));
}

function paperMissionWorkspaceRoot(payload: Record<string, unknown>) {
  return optionalString(payload.domain_workspace_root)
    ?? optionalString(payload.workspace_root)
    ?? optionalString(payload.repo_root);
}

function isPaperMissionStageRoutePayload(payload: Record<string, unknown>) {
  return payload.surface_kind === 'opl_mas_paper_mission_route_runtime_request'
    && (
      payload.runtime_request_kind === 'mas_paper_mission_stage_route'
      || payload.runtime_request_kind === undefined
    );
}

function paperMissionRouteHandoffRecord(payload: Record<string, unknown>) {
  return recordValue(payload.opl_route_handoff_record)
    ?? recordValue(payload.opl_route_handoff)
    ?? recordValue(payload.route_handoff_record);
}

function paperMissionRouteHandoffRef(payload: Record<string, unknown>) {
  const handoff = paperMissionRouteHandoffRecord(payload);
  return optionalString(payload.opl_route_handoff_ref)
    ?? optionalString(payload.route_handoff_ref)
    ?? optionalString(handoff?.handoff_ref)
    ?? optionalString(handoff?.opl_route_handoff_ref)
    ?? optionalString(handoff?.record_ref)
    ?? optionalString(handoff?.ref);
}

function changedStringField(
  changedFields: string[],
  field: string,
  previousValue: string | null,
  nextValue: string | null,
) {
  if (previousValue !== nextValue) {
    changedFields.push(field);
  }
}

function isPaperMissionStageRouteReplacementAllowed(input: {
  existing: FamilyRuntimeTaskRow;
  nextDomainId: string;
  nextTaskKind: string;
  nextPayload: Record<string, unknown>;
  retiredResidueBlock: Record<string, unknown> | null;
  exportedTaskChanged: boolean;
}) {
  if (
    !input.exportedTaskChanged
    || !input.retiredResidueBlock
    || input.existing.domain_id !== 'medautoscience'
    || input.nextDomainId !== 'medautoscience'
    || input.existing.task_kind !== 'paper_mission/stage-route'
    || input.nextTaskKind !== 'paper_mission/stage-route'
    || input.nextPayload.surface_kind !== 'opl_mas_paper_mission_route_runtime_request'
    || (
      input.nextPayload.runtime_request_kind !== 'mas_paper_mission_stage_route'
      && input.nextPayload.runtime_request_kind !== undefined
    )
  ) {
    return null;
  }
  const workspaceRoot = optionalString(input.nextPayload.workspace_root)
    ?? optionalString(input.nextPayload.repo_root)
    ?? optionalString(input.nextPayload.command_cwd);
  if (!workspaceRoot) {
    return null;
  }
  return {
    reason: 'paper_mission_stage_route_runtime_contract_replaced_after_operator_retire',
    operator_retirement_reason: input.retiredResidueBlock.operator_retirement_reason,
    workspace_root: workspaceRoot,
    previous_status: input.existing.status,
  };
}

function paperMissionStageRouteDomainGateFreshHandoffReplacement(input: {
  existing: FamilyRuntimeTaskRow;
  nextDomainId: string;
  nextTaskKind: string;
  existingPayload: Record<string, unknown>;
  nextPayload: Record<string, unknown>;
  exportedTaskChanged: boolean;
}) {
  const previousDomainGateReason = input.existing.dead_letter_reason ?? input.existing.last_error ?? '';
  if (
    !input.exportedTaskChanged
    || input.existing.domain_id !== 'medautoscience'
    || input.nextDomainId !== 'medautoscience'
    || input.existing.task_kind !== 'paper_mission/stage-route'
    || input.nextTaskKind !== 'paper_mission/stage-route'
    || input.existing.status !== 'blocked'
    || !PAPER_MISSION_DOMAIN_GATE_FRESH_HANDOFF_REASONS.has(previousDomainGateReason)
    || !isPaperMissionStageRoutePayload(input.existingPayload)
    || !isPaperMissionStageRoutePayload(input.nextPayload)
  ) {
    return null;
  }

  const nextWorkspaceRoot = paperMissionWorkspaceRoot(input.nextPayload)
    ?? optionalString(input.nextPayload.command_cwd);
  if (!nextWorkspaceRoot || isOplRepoWorkspace(nextWorkspaceRoot)) {
    return null;
  }

  const existingWorkspaceRoot = paperMissionWorkspaceRoot(input.existingPayload)
    ?? optionalString(input.existingPayload.command_cwd);
  const previousCandidateRef = optionalString(input.existingPayload.candidate_ref);
  const nextCandidateRef = optionalString(input.nextPayload.candidate_ref);
  const previousTransactionRef = optionalString(input.existingPayload.paper_mission_transaction_ref);
  const nextTransactionRef = optionalString(input.nextPayload.paper_mission_transaction_ref);
  const previousRouteCommandRef = optionalString(input.existingPayload.opl_route_command_ref);
  const nextRouteCommandRef = optionalString(input.nextPayload.opl_route_command_ref);
  const previousHandoffRef = paperMissionRouteHandoffRef(input.existingPayload);
  const nextHandoffRef = paperMissionRouteHandoffRef(input.nextPayload);
  const previousSourceRef = optionalString(input.existingPayload.source_ref);
  const nextSourceRef = optionalString(input.nextPayload.source_ref);
  const previousHandoffRecordJson = stableComparableJson(paperMissionRouteHandoffRecord(input.existingPayload));
  const nextHandoffRecordJson = stableComparableJson(paperMissionRouteHandoffRecord(input.nextPayload));
  const previousSourcePayloadJson = stableComparableJson(input.existingPayload.source_payload);
  const nextSourcePayloadJson = stableComparableJson(input.nextPayload.source_payload);
  const previousSourceFingerprint = sourceFingerprint(input.existingPayload);
  const nextSourceFingerprint = sourceFingerprint(input.nextPayload);
  const changedFields: string[] = [];

  changedStringField(changedFields, 'candidate_ref', previousCandidateRef, nextCandidateRef);
  changedStringField(
    changedFields,
    'paper_mission_transaction_ref',
    previousTransactionRef,
    nextTransactionRef,
  );
  changedStringField(changedFields, 'opl_route_command_ref', previousRouteCommandRef, nextRouteCommandRef);
  changedStringField(changedFields, 'opl_route_handoff_ref', previousHandoffRef, nextHandoffRef);
  changedStringField(changedFields, 'source_ref', previousSourceRef, nextSourceRef);
  changedStringField(
    changedFields,
    'source_fingerprint',
    previousSourceFingerprint,
    nextSourceFingerprint,
  );
  if (previousHandoffRecordJson !== nextHandoffRecordJson) {
    changedFields.push('opl_route_handoff_record');
  }
  if (previousSourcePayloadJson !== nextSourcePayloadJson) {
    changedFields.push('source_payload');
  }
  if (changedFields.length === 0) {
    return null;
  }

  return {
    reason: 'paper_mission_stage_route_domain_gate_fresh_handoff',
    previous_domain_gate_reason: previousDomainGateReason,
    previous_workspace_root: existingWorkspaceRoot,
    next_workspace_root: nextWorkspaceRoot,
    previous_candidate_ref: previousCandidateRef,
    next_candidate_ref: nextCandidateRef,
    previous_paper_mission_transaction_ref: previousTransactionRef,
    next_paper_mission_transaction_ref: nextTransactionRef,
    previous_opl_route_command_ref: previousRouteCommandRef,
    next_opl_route_command_ref: nextRouteCommandRef,
    previous_opl_route_handoff_ref: previousHandoffRef,
    next_opl_route_handoff_ref: nextHandoffRef,
    previous_source_ref: previousSourceRef,
    next_source_ref: nextSourceRef,
    previous_source_fingerprint: previousSourceFingerprint,
    next_source_fingerprint: nextSourceFingerprint,
    changed_fields: changedFields,
    previous_status: input.existing.status,
  };
}

function paperMissionStageRouteLegacyIdentityFreshHandoffReplacement(input: {
  existing: FamilyRuntimeTaskRow;
  nextDomainId: string;
  nextTaskKind: string;
  existingPayload: Record<string, unknown>;
  nextPayload: Record<string, unknown>;
  exportedTaskChanged: boolean;
}) {
  const previousIdentityBlockerReason = input.existing.dead_letter_reason ?? input.existing.last_error ?? '';
  if (
    !input.exportedTaskChanged
    || input.existing.domain_id !== 'medautoscience'
    || input.nextDomainId !== 'medautoscience'
    || input.existing.task_kind !== 'paper_mission/stage-route'
    || input.nextTaskKind !== 'paper_mission/stage-route'
    || input.existing.status !== 'blocked'
    || !PAPER_MISSION_LEGACY_IDENTITY_BLOCKER_FRESH_HANDOFF_REASONS.has(previousIdentityBlockerReason)
    || !isPaperMissionStageRoutePayload(input.existingPayload)
    || !isPaperMissionStageRoutePayload(input.nextPayload)
  ) {
    return null;
  }

  const nextWorkspaceRoot = paperMissionWorkspaceRoot(input.nextPayload)
    ?? optionalString(input.nextPayload.command_cwd);
  if (!nextWorkspaceRoot || isOplRepoWorkspace(nextWorkspaceRoot)) {
    return null;
  }

  const nextRouteIdentityKey = paperMissionStageRouteIdentityValue(input.nextPayload, 'route_identity_key');
  const nextAttemptIdempotencyKey = paperMissionStageRouteIdentityValue(
    input.nextPayload,
    'attempt_idempotency_key',
  );
  if (!nextRouteIdentityKey || !nextAttemptIdempotencyKey) {
    return null;
  }

  const existingWorkspaceRoot = paperMissionWorkspaceRoot(input.existingPayload)
    ?? optionalString(input.existingPayload.command_cwd);
  const previousRouteIdentityKey = paperMissionStageRouteIdentityValue(
    input.existingPayload,
    'route_identity_key',
  );
  const previousAttemptIdempotencyKey = paperMissionStageRouteIdentityValue(
    input.existingPayload,
    'attempt_idempotency_key',
  );
  const previousCandidateRef = optionalString(input.existingPayload.candidate_ref);
  const nextCandidateRef = optionalString(input.nextPayload.candidate_ref);
  const previousTransactionRef = optionalString(input.existingPayload.paper_mission_transaction_ref);
  const nextTransactionRef = optionalString(input.nextPayload.paper_mission_transaction_ref);
  const previousRouteCommandRef = optionalString(input.existingPayload.opl_route_command_ref);
  const nextRouteCommandRef = optionalString(input.nextPayload.opl_route_command_ref);
  const previousHandoffRef = paperMissionRouteHandoffRef(input.existingPayload);
  const nextHandoffRef = paperMissionRouteHandoffRef(input.nextPayload);
  const previousSourceRef = optionalString(input.existingPayload.source_ref);
  const nextSourceRef = optionalString(input.nextPayload.source_ref);
  const previousHandoffRecordJson = stableComparableJson(paperMissionRouteHandoffRecord(input.existingPayload));
  const nextHandoffRecordJson = stableComparableJson(paperMissionRouteHandoffRecord(input.nextPayload));
  const previousSourcePayloadJson = stableComparableJson(input.existingPayload.source_payload);
  const nextSourcePayloadJson = stableComparableJson(input.nextPayload.source_payload);
  const previousSourceFingerprint = sourceFingerprint(input.existingPayload);
  const nextSourceFingerprint = sourceFingerprint(input.nextPayload);
  const changedFields: string[] = [];

  changedStringField(changedFields, 'candidate_ref', previousCandidateRef, nextCandidateRef);
  changedStringField(
    changedFields,
    'paper_mission_transaction_ref',
    previousTransactionRef,
    nextTransactionRef,
  );
  changedStringField(changedFields, 'opl_route_command_ref', previousRouteCommandRef, nextRouteCommandRef);
  changedStringField(changedFields, 'opl_route_handoff_ref', previousHandoffRef, nextHandoffRef);
  changedStringField(changedFields, 'source_ref', previousSourceRef, nextSourceRef);
  changedStringField(
    changedFields,
    'route_identity_key',
    previousRouteIdentityKey,
    nextRouteIdentityKey,
  );
  changedStringField(
    changedFields,
    'attempt_idempotency_key',
    previousAttemptIdempotencyKey,
    nextAttemptIdempotencyKey,
  );
  changedStringField(
    changedFields,
    'source_fingerprint',
    previousSourceFingerprint,
    nextSourceFingerprint,
  );
  if (previousHandoffRecordJson !== nextHandoffRecordJson) {
    changedFields.push('opl_route_handoff_record');
  }
  if (previousSourcePayloadJson !== nextSourcePayloadJson) {
    changedFields.push('source_payload');
  }
  if (changedFields.length === 0) {
    return null;
  }

  return {
    reason: 'paper_mission_stage_route_identity_validator_fresh_handoff',
    previous_identity_blocker_reason: previousIdentityBlockerReason,
    previous_workspace_root: existingWorkspaceRoot,
    next_workspace_root: nextWorkspaceRoot,
    previous_candidate_ref: previousCandidateRef,
    next_candidate_ref: nextCandidateRef,
    previous_paper_mission_transaction_ref: previousTransactionRef,
    next_paper_mission_transaction_ref: nextTransactionRef,
    previous_opl_route_command_ref: previousRouteCommandRef,
    next_opl_route_command_ref: nextRouteCommandRef,
    previous_opl_route_handoff_ref: previousHandoffRef,
    next_opl_route_handoff_ref: nextHandoffRef,
    previous_source_ref: previousSourceRef,
    next_source_ref: nextSourceRef,
    previous_route_identity_key: previousRouteIdentityKey,
    next_route_identity_key: nextRouteIdentityKey,
    previous_attempt_idempotency_key: previousAttemptIdempotencyKey,
    next_attempt_idempotency_key: nextAttemptIdempotencyKey,
    previous_source_fingerprint: previousSourceFingerprint,
    next_source_fingerprint: nextSourceFingerprint,
    changed_fields: changedFields,
    previous_status: input.existing.status,
  };
}

function stalePaperMissionStageRouteWorkspaceReplacement(input: {
  existing: FamilyRuntimeTaskRow;
  nextDomainId: string;
  nextTaskKind: string;
  existingPayload: Record<string, unknown>;
  nextPayload: Record<string, unknown>;
  exportedTaskChanged: boolean;
  stageAttempts: Array<Record<string, unknown>>;
}) {
  if (
    !input.exportedTaskChanged
    || input.existing.domain_id !== 'medautoscience'
    || input.nextDomainId !== 'medautoscience'
    || input.existing.task_kind !== 'paper_mission/stage-route'
    || input.nextTaskKind !== 'paper_mission/stage-route'
    || !isPaperMissionStageRoutePayload(input.existingPayload)
    || !isPaperMissionStageRoutePayload(input.nextPayload)
  ) {
    return null;
  }

  const nextWorkspaceRoot = paperMissionWorkspaceRoot(input.nextPayload);
  if (!nextWorkspaceRoot || isOplRepoWorkspace(nextWorkspaceRoot)) {
    return null;
  }

  const existingWorkspaceRoot = paperMissionWorkspaceRoot(input.existingPayload)
    ?? optionalString(input.existingPayload.command_cwd);
  const staleStageAttemptIds = input.stageAttempts
    .filter((attempt) => {
      const status = optionalString(attempt.status);
      if (
        status !== 'queued'
        && status !== 'running'
        && status !== 'checkpointed'
        && status !== 'human_gate'
      ) {
        return false;
      }
      const locator = typeof attempt.workspace_locator === 'object' && attempt.workspace_locator !== null
        ? attempt.workspace_locator as Record<string, unknown>
        : {};
      const attemptWorkspaceRoot = paperMissionWorkspaceRoot(locator)
        ?? optionalString(locator.command_cwd);
      return !attemptWorkspaceRoot || isOplRepoWorkspace(attemptWorkspaceRoot);
    })
    .map((attempt) => optionalString(attempt.stage_attempt_id))
    .filter((attemptId): attemptId is string => Boolean(attemptId));
  const existingWorkspaceStale = !existingWorkspaceRoot || isOplRepoWorkspace(existingWorkspaceRoot);
  if (!existingWorkspaceStale && staleStageAttemptIds.length === 0) {
    return null;
  }

  return {
    reason: PAPER_MISSION_STALE_WORKSPACE_SUPERSEDED_REASON,
    previous_workspace_root: existingWorkspaceRoot,
    next_workspace_root: nextWorkspaceRoot,
    stale_stage_attempt_ids: staleStageAttemptIds,
    previous_status: input.existing.status,
  };
}

function markPaperMissionStageRouteAttemptsSuperseded(
  db: DatabaseSync,
  input: {
    taskId: string;
    stageAttemptIds: string[];
    source: string;
    previousWorkspaceRoot: string | null;
    nextWorkspaceRoot: string;
  },
) {
  if (input.stageAttemptIds.length === 0) {
    return [];
  }
  return updateStageAttemptsForTask(db, {
    taskId: input.taskId,
    stageAttemptIds: input.stageAttemptIds,
    status: 'blocked',
    blockedReason: PAPER_MISSION_STALE_WORKSPACE_SUPERSEDED_REASON,
    activityEvent: {
      activity_kind: 'paper_mission_stage_route_workspace_supersession',
      activity_status: 'blocked',
      blocked_reason: PAPER_MISSION_STALE_WORKSPACE_SUPERSEDED_REASON,
      previous_workspace_root: input.previousWorkspaceRoot,
      next_workspace_root: input.nextWorkspaceRoot,
      source: input.source,
      authority_boundary: {
        opl: 'queue_attempt_workspace_locator_supersession_only',
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

export function reconcileExistingDedupeTask(
  db: DatabaseSync,
  context: {
    input: EnqueueInput;
    taskKind: string;
    payload: Record<string, unknown>;
    activeHold: ActiveFamilyRuntimeQueueHold | null;
    requiresApproval: boolean;
    initialStatus: FamilyRuntimeTaskStatus;
    initialLastError: string | null;
    createdAt: string;
    dedupeKey: string;
  },
) {
  const {
    input,
    taskKind,
    payload,
    activeHold,
    requiresApproval,
    initialStatus,
    initialLastError,
    createdAt,
    dedupeKey,
  } = context;
  const existing = db.prepare('SELECT * FROM tasks WHERE dedupe_key = ?').get(dedupeKey) as
    | FamilyRuntimeTaskRow
    | undefined;
  if (!existing) {
    return null;
  }
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
  const liveSameTaskDefaultExecutorAttempt = ['queued', 'retry_waiting'].includes(existing.status)
    && isDefaultExecutorDispatch(existing, existingPayload)
    && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)
    ? existingStageAttempts.find((attempt) => isLiveSameTaskDefaultExecutorAttempt(attempt, payload)) ?? null
    : null;
  const antiLoopSameLineageDecision = antiLoopStopLossSameLineageDecision({
    db,
    existing,
    existingPayload,
    nextPayload: payload,
  });
  if (antiLoopSameLineageDecision) {
    const {
      event_type: eventType,
      ...decisionPayload
    } = antiLoopSameLineageDecision;
    if (eventType === 'task_stop_loss_same_lineage_domain_progress_released') {
      const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
      return applyExistingDedupeRequeue(db, {
        input,
        taskKind,
        exportedPayloadJson,
        existing,
        nextStatus,
        nextRequiresApproval: requiresApproval,
        nextLastError: initialLastError,
        createdAt,
        dedupeKey,
        activeHoldId: activeHold?.hold_id ?? null,
        eventType,
        eventPayload: {
          ...decisionPayload,
        },
        notificationTitle: 'Family runtime stop-loss released by MAS domain progress evidence',
        requeuedFromTerminal: true,
      });
    }
    insertEvent(db, {
      taskId: existing.task_id,
      domainId: existing.domain_id,
      eventType,
      source: input.source ?? 'opl-cli',
      payload: {
        dedupe_key: dedupeKey,
        retained_status: existing.status,
        ...decisionPayload,
      },
    });
    return {
      accepted: false,
      idempotent_noop: true,
      task: taskToPayload(existing),
    };
  }
  if (liveSameTaskDefaultExecutorAttempt) {
    const lease = refreshDefaultExecutorLiveAttemptTaskLease(db, {
      attempt: liveSameTaskDefaultExecutorAttempt,
      source: input.source ?? 'opl-cli',
      reason: 'same_task_live_stage_attempt_exists_at_enqueue',
    });
    const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
    insertEvent(db, {
      taskId: refreshed.task_id,
      domainId: refreshed.domain_id,
      eventType: 'task_default_executor_live_dispatch_dedupe_noop',
      source: input.source ?? 'opl-cli',
      payload: {
        dedupe_key: dedupeKey,
        reason: 'same_task_live_stage_attempt_exists_at_enqueue',
        stage_attempt_id: liveSameTaskDefaultExecutorAttempt.stage_attempt_id,
        previous_status: existing.status,
        next_status: refreshed.status,
        lease,
        authority_boundary: {
          opl: 'queue_read_model_repair_from_live_attempt_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
        },
      },
    });
    return {
      accepted: false,
      idempotent_noop: true,
      task: taskToPayload(refreshed),
    };
  }
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
  const queuedCurrentControlAdmissionRefresh = isDefaultExecutorDispatch(existing, existingPayload)
    && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)
    ? defaultExecutorQueuedCurrentControlAdmissionRefreshDecision(existing, existingPayload, payload)
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
  const succeededProviderLeaseRequiredRedrive = isDefaultExecutorDispatch(existing, existingPayload)
    && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)
    ? defaultExecutorSucceededProviderLeaseRequiredRedriveDecision(
      existing,
      existingPayload,
      payload,
      existingStageAttempts,
    )
    : null;
  const runningTerminalCurrentControlAdmissionNoop = isDefaultExecutorDispatch(existing, existingPayload)
    && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)
    ? defaultExecutorRunningTerminalCurrentControlAdmissionNoopDecision(
      existing,
      existingPayload,
      payload,
      existingStageAttempts,
    )
    : null;
  const terminalConsumedCurrentControlAdmissionNoop = isDefaultExecutorDispatch(existing, existingPayload)
    && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload)
    ? defaultExecutorTerminalConsumedCurrentControlAdmissionNoopDecision(
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
  if (runningTerminalCurrentControlAdmissionNoop) {
    db.prepare(`
      UPDATE tasks
      SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL,
        last_error = NULL, dead_letter_reason = NULL, updated_at = ?
      WHERE task_id = ?
    `).run(createdAt, existing.task_id);
    const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(existing.task_id) as FamilyRuntimeTaskRow;
    insertEvent(db, {
      taskId: refreshed.task_id,
      domainId: refreshed.domain_id,
      eventType: 'task_running_current_control_terminal_attempt_noop',
      source: input.source ?? 'opl-cli',
      payload: {
        dedupe_key: dedupeKey,
        previous_status: existing.status,
        next_status: refreshed.status,
        ...runningTerminalCurrentControlAdmissionNoop,
        authority_boundary: {
          opl: 'queue_read_model_repair_from_terminal_attempt_observation_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
        },
      },
    });
    insertNotification(db, {
      taskId: refreshed.task_id,
      severity: 'info',
      title: 'Family runtime stale running task cleared',
      body: `${input.domainId}:${taskKind}`,
      payload: {
        status: refreshed.status,
        dedupe_key: dedupeKey,
        stage_attempt_id: runningTerminalCurrentControlAdmissionNoop.terminal_stage_attempt_id,
      },
    });
    return {
      accepted: false,
      idempotent_noop: true,
      task: taskToPayload(refreshed),
    };
  }
  if (terminalConsumedCurrentControlAdmissionNoop) {
    insertEvent(db, {
      taskId: existing.task_id,
      domainId: existing.domain_id,
      eventType: 'task_current_control_provider_admission_already_consumed',
      source: input.source ?? 'opl-cli',
      payload: {
        dedupe_key: dedupeKey,
        retained_status: existing.status,
        ...terminalConsumedCurrentControlAdmissionNoop,
        authority_boundary: {
          opl: 'queue_dedupe_noop_from_terminal_attempt_consumed_transition_identity',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
        },
      },
    });
    return {
      accepted: false,
      requeued_from_terminal: false,
      current_control_provider_admission_consumed: terminalConsumedCurrentControlAdmissionNoop,
      idempotent_noop: true,
      task: taskToPayload(existing),
    };
  }
  if (exportedTaskChanged && closeoutRedrive) {
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_mas_default_executor_redrive_context',
      eventPayload: {
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
      notificationTitle: 'Family runtime task requeued from MAS closeout redrive',
      requeuedFromTerminal: true,
    });
  }
  if (transportOnlyAdmissionRedrive) {
    const supersededTransportAttempts = markTransportOnlyAdmissionCheckpointsSuperseded(db, {
      taskId: existing.task_id,
      source: input.source ?? 'opl-cli',
    });
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_transport_only_succeeded_default_executor_admission',
      eventPayload: {
        superseded_stage_attempt_ids: supersededTransportAttempts.map((attempt) => attempt.stage_attempt_id),
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
      notificationTitle: 'Family runtime task requeued from transport-only admission',
      requeuedFromTerminal: true,
    });
  }
  if (missingStageNativeOwnerAnswerRedrive) {
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_missing_stage_native_owner_answer',
      eventPayload: {
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
      notificationTitle: 'Family runtime task requeued for missing MAS owner answer',
      requeuedFromTerminal: true,
    });
  }
  if (freshCurrentControlAdmissionRedrive) {
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_mas_current_control_provider_admission',
      eventPayload: {
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
      notificationTitle: 'Family runtime task requeued from MAS current-control admission',
      requeuedFromTerminal: true,
    });
  }
  if (queuedCurrentControlAdmissionRefresh) {
    const retainExistingApprovalGate = existing.status === 'waiting_approval'
      && existing.requires_approval === 1;
    const nextRequiresApproval = requiresApproval || retainExistingApprovalGate;
    const nextStatus: FamilyRuntimeTaskStatus = nextRequiresApproval ? 'waiting_approval' : 'queued';
    const nextLastError = activeHold?.reason
      ?? (retainExistingApprovalGate ? existing.last_error : initialLastError);
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval,
      nextLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_mas_current_control_provider_admission',
      eventPayload: {
        ...queuedCurrentControlAdmissionRefresh,
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
      notificationTitle: 'Family runtime queued task refreshed from MAS current-control admission',
      requeuedFromTerminal: false,
    });
  }
  if (terminalAttemptCurrentControlAdmissionRedrive) {
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_mas_current_control_provider_admission',
      eventPayload: {
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
      notificationTitle: 'Family runtime task requeued from MAS current-control terminal attempt',
      requeuedFromTerminal: true,
    });
  }
  if (succeededProviderLeaseRequiredRedrive) {
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_mas_current_control_provider_admission',
      eventPayload: {
        ...succeededProviderLeaseRequiredRedrive,
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
      notificationTitle: 'Family runtime task requeued because MAS still requires provider lease',
      requeuedFromTerminal: true,
    });
  }
  if (supersededCurrentControlAdmissionRedrive) {
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_mas_current_control_provider_admission',
      eventPayload: {
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
      notificationTitle: 'Family runtime task requeued from MAS current-control supersession',
      requeuedFromTerminal: true,
    });
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
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_domain_export_update',
      eventPayload: {
        reason: 'domain_export_changed_after_terminal_attempt',
      },
      notificationTitle: 'Family runtime task requeued',
      requeuedFromTerminal: true,
      resetAttempts: false,
    });
  }
  const deadLetterRedrive = deadLetterRedriveDecision(existingPayload, payload);
  const blockedRedrive = defaultExecutorBlockedRedriveDecision(existing, existingPayload, payload);
  const paperAutonomyDeadLetterBlock = deadLetterRedrive
    ? masPaperAutonomyDeadLetterCurrentnessBlock(existing)
    : null;
  const retiredResidueBlock = operatorRetiredStaleResidueBlock(existing);
  const domainGateFreshHandoffReplacement = retiredResidueBlock
    ? null
    : paperMissionStageRouteDomainGateFreshHandoffReplacement({
        existing,
        nextDomainId: input.domainId,
        nextTaskKind: taskKind,
        existingPayload,
        nextPayload: payload,
        exportedTaskChanged,
      });
  const legacyIdentityFreshHandoffReplacement = retiredResidueBlock
    ? null
    : paperMissionStageRouteLegacyIdentityFreshHandoffReplacement({
        existing,
        nextDomainId: input.domainId,
        nextTaskKind: taskKind,
        existingPayload,
        nextPayload: payload,
        exportedTaskChanged,
      });
  const staleWorkspaceReplacement = retiredResidueBlock
    ? null
    : stalePaperMissionStageRouteWorkspaceReplacement({
        existing,
        nextDomainId: input.domainId,
        nextTaskKind: taskKind,
        existingPayload,
        nextPayload: payload,
        exportedTaskChanged,
        stageAttempts: listStageAttemptsForTask(db, existing.task_id),
      });
  if (domainGateFreshHandoffReplacement) {
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_paper_mission_stage_route_domain_gate_fresh_handoff',
      eventPayload: {
        ...domainGateFreshHandoffReplacement,
        authority_boundary: {
          opl: 'queue_runtime_currentness_repair_from_fresh_domain_handoff_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
          can_claim_paper_progress: false,
        },
      },
      notificationTitle: 'MAS PaperMission stage route requeued from fresh domain handoff',
      requeuedFromTerminal: true,
    });
  }
  if (legacyIdentityFreshHandoffReplacement) {
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_paper_mission_stage_route_identity_validator_fresh_handoff',
      eventPayload: {
        ...legacyIdentityFreshHandoffReplacement,
        authority_boundary: {
          opl: 'queue_runtime_identity_validator_repair_from_fresh_domain_handoff_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
          can_claim_paper_progress: false,
        },
      },
      notificationTitle: 'MAS PaperMission stage route requeued from fresh identity handoff',
      requeuedFromTerminal: true,
    });
  }
  if (staleWorkspaceReplacement) {
    const supersededStageAttempts = markPaperMissionStageRouteAttemptsSuperseded(db, {
      taskId: existing.task_id,
      stageAttemptIds: staleWorkspaceReplacement.stale_stage_attempt_ids,
      source: input.source ?? 'opl-cli',
      previousWorkspaceRoot: staleWorkspaceReplacement.previous_workspace_root,
      nextWorkspaceRoot: staleWorkspaceReplacement.next_workspace_root,
    });
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_paper_mission_stage_route_stale_workspace',
      eventPayload: {
        ...staleWorkspaceReplacement,
        superseded_stage_attempt_ids: supersededStageAttempts
          .map((attempt: { stage_attempt_id: string }) => attempt.stage_attempt_id),
        authority_boundary: {
          opl: 'queue_runtime_workspace_locator_currentness_repair_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
        },
      },
      notificationTitle: 'MAS PaperMission stage route requeued from stale workspace locator',
      requeuedFromTerminal: true,
    });
  }
  const paperMissionStageRouteReplacement = isPaperMissionStageRouteReplacementAllowed({
    existing,
    nextDomainId: input.domainId,
    nextTaskKind: taskKind,
    nextPayload: payload,
    retiredResidueBlock,
    exportedTaskChanged,
  });
  if (paperMissionStageRouteReplacement) {
    const nextStatus: FamilyRuntimeTaskStatus = initialStatus;
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_paper_mission_stage_route_contract_replacement',
      eventPayload: {
        ...paperMissionStageRouteReplacement,
        authority_boundary: {
          opl: 'queue_runtime_contract_replacement_after_operator_retire_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
        },
      },
      notificationTitle: 'MAS PaperMission stage route requeued from runtime contract replacement',
      requeuedFromTerminal: true,
    });
  }
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
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_blocked_after_domain_owner_update',
      eventPayload: {
        ...blockedRedrive,
      },
      notificationTitle: 'Family runtime task requeued after domain owner update',
      requeuedFromTerminal: true,
    });
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
    return applyExistingDedupeRequeue(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      nextStatus,
      nextRequiresApproval: requiresApproval,
      nextLastError: initialLastError,
      createdAt,
      dedupeKey,
      activeHoldId: activeHold?.hold_id ?? null,
      eventType: 'task_requeued_from_dead_letter_after_domain_owner_update',
      eventPayload: {
        ...deadLetterRedrive,
      },
      notificationTitle: 'Family runtime task requeued after domain owner update',
      requeuedFromTerminal: true,
    });
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
