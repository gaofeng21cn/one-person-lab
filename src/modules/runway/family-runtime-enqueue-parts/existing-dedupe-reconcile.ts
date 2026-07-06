import { DatabaseSync } from 'node:sqlite';

import { parseJsonText } from '../../../kernel/json-file.ts';
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
import {
  clearTaskLeaseProjectionSql,
  FAMILY_RUNTIME_TASK_COLUMNS,
  FAMILY_RUNTIME_TASK_STATUS,
} from '../family-runtime-queue-projection-boundary.ts';
import { antiLoopStopLossSameLineageDecision } from '../family-runtime-stop-loss-successor-policy.ts';
import type { ActiveFamilyRuntimeQueueHold } from '../family-runtime-queue-holds.ts';
import {
  isLiveSameTaskDefaultExecutorAttempt,
  recordLiveSameTaskDefaultExecutorDedupeNoop,
} from './existing-dedupe-live-attempt.ts';
import { recordResolvedMissingStageNativeOwnerAnswerDedupeNoop } from './existing-dedupe-resolved-owner-answer.ts';
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
import { listStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';
import {
  isPaperMissionStageRouteReplacementAllowed,
  paperMissionStageRouteReopenAfterOperatorRetire,
  markPaperMissionStageRouteAttemptsSuperseded,
  paperMissionStageRouteDomainGateFreshHandoffReplacement,
  paperMissionStageRouteLegacyIdentityFreshHandoffReplacement,
  paperMissionStageRouteProviderRuntimeFreshHandoffReplacement,
  stalePaperMissionStageRouteWorkspaceReplacement,
} from './existing-dedupe-paper-mission-replacement.ts';

export {
  defaultExecutorCandidateRow,
  isDedupeUniqueConstraintError,
  isDefaultExecutorDispatchInput,
  sourceFingerprint,
} from './existing-dedupe-decisions.ts';

function currentControlAdmissionAuthorityBoundary() {
  return {
    opl: 'queue_attempt_provider_transport_rehydrate_from_mas_current_control_only',
    domain: 'truth_quality_artifact_gate_owner',
    domain_truth_mutation: false,
    publication_quality_mutation: false,
    artifact_gate_mutation: false,
    current_package_mutation: false,
    provider_completion_is_domain_ready: false,
  };
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
  const existingPayload = parseJsonText(existing.payload_json) as Record<string, unknown>;
  const existingDefaultExecutorDispatchInput = isDefaultExecutorDispatch(existing, existingPayload)
    && isDefaultExecutorDispatchInput(input.domainId, taskKind, payload);
  const defaultExecutorSucceededAdmissionRefresh = existing.status === 'succeeded'
    && exportedTaskChanged
    && existingDefaultExecutorDispatchInput;
  const existingStageAttempts = existingDefaultExecutorDispatchInput
    ? listStageAttemptsForTask(db, existing.task_id)
    : [];
  const liveSameTaskDefaultExecutorAttempt = ['queued', 'retry_waiting'].includes(existing.status)
    && existingDefaultExecutorDispatchInput
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
    return recordLiveSameTaskDefaultExecutorDedupeNoop(db, {
      existing,
      attempt: liveSameTaskDefaultExecutorAttempt,
      dedupeKey,
      source: input.source ?? 'opl-cli',
    });
  }
  const closeoutRedrive = defaultExecutorSucceededAdmissionRefresh
    ? defaultExecutorCloseoutRedriveDecision(existing, existingPayload, payload)
    : null;
  const transportOnlyAdmissionRedrive = existingDefaultExecutorDispatchInput
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
  const queuedCurrentControlAdmissionRefresh = existingDefaultExecutorDispatchInput
    ? defaultExecutorQueuedCurrentControlAdmissionRefreshDecision(existing, existingPayload, payload)
    : null;
  const terminalAttemptCurrentControlAdmissionRedrive = existingDefaultExecutorDispatchInput
    ? defaultExecutorTerminalAttemptCurrentControlAdmissionRedriveDecision(
      existing,
      existingPayload,
      payload,
      existingStageAttempts,
    )
    : null;
  const succeededProviderLeaseRequiredRedrive = existingDefaultExecutorDispatchInput
    ? defaultExecutorSucceededProviderLeaseRequiredRedriveDecision(
      existing,
      existingPayload,
      payload,
      existingStageAttempts,
    )
    : null;
  const runningTerminalCurrentControlAdmissionNoop = existingDefaultExecutorDispatchInput
    ? defaultExecutorRunningTerminalCurrentControlAdmissionNoopDecision(
      existing,
      existingPayload,
      payload,
      existingStageAttempts,
    )
    : null;
  const terminalConsumedCurrentControlAdmissionNoop = existingDefaultExecutorDispatchInput
    ? defaultExecutorTerminalConsumedCurrentControlAdmissionNoopDecision(
      existing,
      existingPayload,
      payload,
      existingStageAttempts,
    )
    : null;
  const supersededCurrentControlAdmissionRedrive = existingDefaultExecutorDispatchInput
    ? defaultExecutorSupersededCurrentControlAdmissionRedriveDecision(existing, payload)
    : null;
  if (resolvedMissingStageNativeOwnerAnswer) {
    return recordResolvedMissingStageNativeOwnerAnswerDedupeNoop(db, {
      input,
      taskKind,
      exportedPayloadJson,
      existing,
      requiresApproval,
      createdAt,
      dedupeKey,
      decision: resolvedMissingStageNativeOwnerAnswer,
    });
  }
  if (runningTerminalCurrentControlAdmissionNoop) {
    db.prepare(`
      UPDATE tasks
      SET status = ?, ${clearTaskLeaseProjectionSql()},
        last_error = NULL, ${FAMILY_RUNTIME_TASK_COLUMNS.deadLetterReason} = NULL, updated_at = ?
      WHERE task_id = ?
    `).run(FAMILY_RUNTIME_TASK_STATUS.succeeded, createdAt, existing.task_id);
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
        authority_boundary: currentControlAdmissionAuthorityBoundary(),
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
        authority_boundary: currentControlAdmissionAuthorityBoundary(),
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
        authority_boundary: currentControlAdmissionAuthorityBoundary(),
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
        authority_boundary: currentControlAdmissionAuthorityBoundary(),
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
        authority_boundary: currentControlAdmissionAuthorityBoundary(),
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
  const existingTaskStageAttempts = listStageAttemptsForTask(db, existing.task_id);
  const retiredResidueBlock = operatorRetiredStaleResidueBlock(existing);
  const reopenAfterOperatorRetire = paperMissionStageRouteReopenAfterOperatorRetire({
    existing,
    nextDomainId: input.domainId,
    nextTaskKind: taskKind,
    existingPayload,
    nextPayload: payload,
    retiredResidueBlock,
    stageAttempts: existingTaskStageAttempts,
    exportedTaskChanged,
  });
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
  const providerRuntimeFreshHandoffReplacement = retiredResidueBlock
    ? null
    : paperMissionStageRouteProviderRuntimeFreshHandoffReplacement({
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
        stageAttempts: existingTaskStageAttempts,
      });
  if (reopenAfterOperatorRetire) {
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
      eventType: 'task_requeued_from_paper_mission_stage_route_operator_retire_redrive',
      eventPayload: {
        ...reopenAfterOperatorRetire,
        authority_boundary: {
          opl: 'queue_runtime_redrive_after_operator_stale_residue_retire_only',
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
      notificationTitle: 'MAS PaperMission stage route requeued after operator stale-residue retire',
      requeuedFromTerminal: true,
    });
  }
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
  if (providerRuntimeFreshHandoffReplacement) {
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
      eventType: 'task_requeued_from_paper_mission_stage_route_provider_runtime_fresh_handoff',
      eventPayload: {
        ...providerRuntimeFreshHandoffReplacement,
        authority_boundary: {
          opl: 'queue_runtime_currentness_repair_after_provider_runtime_blocker_only',
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
      notificationTitle: 'MAS PaperMission stage route requeued after provider runtime blocker',
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
  if (existing.status === FAMILY_RUNTIME_TASK_STATUS.deadLetter && exportedTaskChanged && deadLetterRedrive) {
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
