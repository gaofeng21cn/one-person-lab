import { DatabaseSync } from 'node:sqlite';

import { canonicalCloseoutPacketFromDomainHandlerOutput } from './family-runtime-domain-handler-closeout.ts';
import { dispatchCommandForDomain, parseDispatchOutput } from './family-runtime-dispatch-command.ts';
import { writeFamilyRuntimeDispatchTask } from './family-runtime-dispatch-task.ts';
import {
  domainHandlerResultErrorMessage,
  runFamilyRuntimeDomainHandlerCommand,
} from './family-runtime-domain-handler-process.ts';
import { hydrateDomainTasks } from './family-runtime-domain-intake.ts';
import { readMasManagedProviderProjection } from './family-runtime-mas-managed-provider-projection.ts';
import { startDefaultExecutorStageAttempt } from './family-runtime-default-executor-start.ts';
import { queryTemporalStageAttemptReadModel } from './family-runtime-temporal-query.ts';
import {
  defaultExecutorProviderAttemptOrLeaseRequired,
  isDefaultExecutorDispatchTask,
} from './family-runtime-provider-hosted-attempts.ts';
import { ensureProviderHostedStageAttempt } from './family-runtime-provider-hosted-attempts.ts';
import {
  dispatchPaperMissionStageRouteTask,
  isPaperMissionStageRouteTask,
} from './family-runtime-paper-mission-stage-route-runner.ts';
import { blockTaskForStageAdmissionGate } from './family-runtime-stage-admission-gate.ts';
import {
  listStageAttemptsForTask,
  ingestStageAttemptCloseout,
  updateStageAttemptsForTask,
} from './family-runtime-stage-attempts.ts';
import {
  familyRuntimePaths,
  insertEvent,
  insertNotification,
  nowIso,
  taskToPayload,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';
import {
  MAS_PAPER_AUTONOMY_DOMAIN_HANDLER_CLOSEOUT_REQUIRED_REASON,
  MAS_PAPER_AUTONOMY_TASK_KINDS,
} from './family-runtime-paper-autonomy.ts';
import { PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON } from './family-runtime-progress-first-anti-spin-gate.ts';
import {
  domainRouteOplAttemptAdmissionNeedsProviderFollowthrough,
  isDomainRouteOplAttemptAdmissionRequested,
  isDefaultExecutorOplAttemptAdmissionRequested,
  masDomainOwnerAnswerObservationFromRecords,
  type MasDomainOwnerAnswerObservation,
  MAS_DOMAIN_TYPED_BLOCKER_OBSERVED_REASON,
  OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON,
  OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
} from './family-runtime-opl-attempt-admission-receipt.ts';

type TemporalProviderModule = Parameters<typeof startDefaultExecutorStageAttempt>[2]['temporalProviderModule'];
type QueryTemporalStageAttemptReadModel = typeof queryTemporalStageAttemptReadModel;

function cleanStringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry.trim()))
    : [];
}

function cleanOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function closeoutRefsFromDomainHandlerOutput(output: Record<string, unknown>) {
  return [
    ...cleanStringList(output.closeout_refs),
    cleanOptionalString(output.closeout_ref),
    cleanOptionalString(output.receipt_ref),
  ].filter((entry): entry is string => Boolean(entry));
}

function domainHandlerOwnerRouteStaleReason(output: Record<string, unknown>, errorMessage: string) {
  const fields = [
    output.reason,
    output.blocked_reason,
    output.blocker_reason,
    output.message,
    output.detail,
    errorMessage,
  ].map(cleanOptionalString).filter((entry): entry is string => Boolean(entry));
  return fields.some((entry) => entry === 'owner_route_stale' || /\bowner_route_stale\b/.test(entry))
    ? 'owner_route_stale'
    : null;
}

function providerHostedDispatchRequiresCloseout(row: FamilyRuntimeTaskRow, activeStageAttemptIds: string[]) {
  return row.domain_id === 'medautoscience'
    && MAS_PAPER_AUTONOMY_TASK_KINDS.has(row.task_kind)
    && activeStageAttemptIds.length > 0;
}

function isProviderRequiredDefaultExecutorTask(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  return row.domain_id === 'medautoscience'
    && row.task_kind === 'domain_owner/default-executor-dispatch'
    && defaultExecutorProviderAttemptOrLeaseRequired(payload);
}

function blockProviderRequiredDefaultExecutorOwnerNotAdmitted(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  const blockedAt = nowIso();
  const reason = 'default_executor_provider_admission_owner_not_admitted';
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(reason, reason, blockedAt, row.task_id);
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_dispatch_blocked_provider_required_owner_not_admitted',
    source: 'opl-family-runtime',
    payload: {
      reason,
      task_kind: row.task_kind,
      action_type: payload.action_type ?? null,
      next_executable_owner: payload.next_executable_owner ?? null,
      work_unit_id: payload.work_unit_id ?? null,
      work_unit_fingerprint: payload.work_unit_fingerprint ?? null,
      provider_attempt_or_lease_required: payload.provider_attempt_or_lease_required ?? null,
      authority_boundary: {
        opl: 'provider_admission_guard_fail_closed',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
      },
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: 'error',
    title: 'Family runtime provider admission blocked',
    body: `${row.domain_id}:${row.task_kind} requires provider admission, but the next owner is not admitted for the default executor.`,
    payload: {
      reason,
      next_executable_owner: payload.next_executable_owner ?? null,
    },
  });
  return {
    task_id: row.task_id,
    status: 'blocked',
    reason,
    stage_attempts: [],
  };
}

function blockTaskForStaleOwnerRoute(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  input: {
    attempt: number;
    exitCode: number;
    stdout: string;
    stderr: string;
    commandPreview: string[];
    commandCwd: string | null;
    output: Record<string, unknown>;
    domainHandlerBlockedReason: string;
    activeStageAttemptIds: string[];
    runningStageAttempts: ReturnType<typeof updateStageAttemptsForTask>;
  },
) {
  const blockedAt = nowIso();
  const reason = PROGRESS_FIRST_OWNER_DELTA_REQUIRED_REASON;
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(reason, reason, blockedAt, row.task_id);
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_dispatch_blocked_stale_owner_route',
    source: 'opl-family-runtime',
    payload: {
      reason,
      domain_handler_blocked_reason: input.domainHandlerBlockedReason,
      attempt: input.attempt,
      exit_code: input.exitCode,
      stdout: input.stdout,
      stderr: input.stderr,
      command_preview: input.commandPreview,
      command_cwd: input.commandCwd,
      output: input.output,
      authority_boundary: {
        opl: 'queue_currentness_admission_and_attempt_liveness_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        retry_loop_started: false,
      },
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: 'warning',
    title: 'Family runtime task blocked',
    body: `${row.domain_id}:${row.task_kind} returned stale owner route; a fresh owner delta is required before retry.`,
    payload: {
      reason,
      domain_handler_blocked_reason: input.domainHandlerBlockedReason,
    },
  });
  const stageAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    stageAttemptIds: input.activeStageAttemptIds,
    status: 'blocked',
    blockedReason: reason,
    activityEvent: {
      activity_kind: 'domain_handler_dispatch_activity',
      activity_status: 'blocked',
      blocked_reason: reason,
      domain_handler_blocked_reason: input.domainHandlerBlockedReason,
    },
  });
  return {
    task_id: row.task_id,
    status: 'blocked',
    reason,
    domain_handler_blocked_reason: input.domainHandlerBlockedReason,
    command_preview: input.commandPreview,
    command_cwd: input.commandCwd,
    exit_code: input.exitCode,
    output: input.output,
    stage_attempts: stageAttempts.length > 0 ? stageAttempts : input.runningStageAttempts,
  };
}

function blockTaskForMissingDomainCloseout(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  input: {
    commandPreview: string[];
    commandCwd: string | null;
    output: Record<string, unknown>;
    activeStageAttemptIds: string[];
    closeoutRefs: string[];
  },
) {
  const blockedAt = nowIso();
  const reason = MAS_PAPER_AUTONOMY_DOMAIN_HANDLER_CLOSEOUT_REQUIRED_REASON;
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(reason, reason, blockedAt, row.task_id);
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_dispatch_blocked_missing_domain_closeout',
    source: 'opl-family-runtime',
    payload: {
      reason,
      command_preview: input.commandPreview,
      command_cwd: input.commandCwd,
      output: input.output,
      closeout_refs: input.closeoutRefs,
      authority_boundary: {
        opl: 'queue_and_attempt_liveness_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
      },
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: 'warning',
    title: 'Family runtime task blocked',
    body: `${row.domain_id}:${row.task_kind} requires a typed closeout or domain receipt refs.`,
    payload: { reason },
  });
  const stageAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    stageAttemptIds: input.activeStageAttemptIds,
    status: 'blocked',
    closeoutRefs: input.closeoutRefs,
    blockedReason: reason,
    activityEvent: {
      activity_kind: 'domain_handler_dispatch_activity',
      activity_status: 'blocked',
      blocked_reason: reason,
      closeout_refs: input.closeoutRefs,
    },
  });
  return {
    task_id: row.task_id,
    status: 'blocked',
    reason,
    command_preview: input.commandPreview,
    command_cwd: input.commandCwd,
    output: input.output,
    stage_attempts: stageAttempts,
  };
}

function keepTaskOpenForOplAttemptAdmissionRequested(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  input: {
    commandPreview: string[];
    commandCwd: string | null;
    output: Record<string, unknown>;
    activeStageAttemptIds: string[];
    closeoutRefs: string[];
  },
) {
  const updatedAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = 'running', lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = NULL, updated_at = ?
    WHERE task_id = ?
  `).run(OPL_ATTEMPT_ADMISSION_REQUESTED_REASON, updatedAt, row.task_id);
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_dispatch_opl_attempt_admission_requested',
    source: 'opl-family-runtime',
    payload: {
      reason: OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
      next_state: 'running_provider_start_pending',
      command_preview: input.commandPreview,
      command_cwd: input.commandCwd,
      output: input.output,
      closeout_refs: input.closeoutRefs,
      authority_boundary: {
        opl: 'provider_admission_followthrough_required',
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
  insertNotification(db, {
    taskId: row.task_id,
    severity: 'warning',
    title: 'Family runtime provider admission requested',
    body: `${row.domain_id}:${row.task_kind} requested OPL provider admission; provider start follow-through is still required.`,
    payload: {
      reason: OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
      blocker_reason: OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON,
    },
  });
  const stageAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    stageAttemptIds: input.activeStageAttemptIds,
    status: 'queued',
    closeoutRefs: input.closeoutRefs,
    closeoutReceiptStatus: input.closeoutRefs.length > 0 ? 'domain_handler_receipt_ref_only' : null,
    blockedReason: null,
    activityEvent: {
      activity_kind: 'domain_handler_dispatch_activity',
      activity_status: OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
      blocked_reason: OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON,
      closeout_refs: input.closeoutRefs,
    },
  });
  return {
    task_id: row.task_id,
    status: 'running',
    reason: OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
    blocker_reason: OPL_ATTEMPT_ADMISSION_PROVIDER_START_PENDING_REASON,
    command_preview: input.commandPreview,
    command_cwd: input.commandCwd,
    output: input.output,
    stage_attempts: stageAttempts,
  };
}

function blockTaskForObservedMasDomainOwnerAnswer(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  input: {
    commandPreview: string[];
    commandCwd: string | null;
    output: Record<string, unknown>;
    activeStageAttemptIds: string[];
    closeoutRefs: string[];
    observation: MasDomainOwnerAnswerObservation;
  },
) {
  const updatedAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(input.observation.reason, input.observation.reason, updatedAt, row.task_id);
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: input.observation.reason === MAS_DOMAIN_TYPED_BLOCKER_OBSERVED_REASON
      ? 'task_dispatch_mas_domain_typed_blocker_observed'
      : 'task_dispatch_mas_domain_owner_answer_observed',
    source: 'opl-family-runtime',
    payload: {
      reason: input.observation.reason,
      answer_kind: input.observation.answer_kind,
      refs: input.observation.refs,
      evidence_paths: input.observation.evidence_paths,
      previous_admission_signal: OPL_ATTEMPT_ADMISSION_REQUESTED_REASON,
      next_state: 'blocked_domain_owner_answer_observed',
      command_preview: input.commandPreview,
      command_cwd: input.commandCwd,
      output: input.output,
      closeout_refs: input.closeoutRefs,
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
  insertNotification(db, {
    taskId: row.task_id,
    severity: 'warning',
    title: 'Family runtime observed MAS owner answer',
    body: `${row.domain_id}:${row.task_kind} carried a MAS ${input.observation.answer_kind}; provider admission follow-through is not reopened.`,
    payload: {
      reason: input.observation.reason,
      answer_kind: input.observation.answer_kind,
      refs: input.observation.refs,
    },
  });
  const stageAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    stageAttemptIds: input.activeStageAttemptIds,
    status: 'blocked',
    closeoutRefs: input.closeoutRefs,
    closeoutReceiptStatus: input.closeoutRefs.length > 0 ? 'domain_handler_receipt_ref_only' : null,
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
      closeout_refs: input.closeoutRefs,
    },
  });
  return {
    task_id: row.task_id,
    status: 'blocked',
    reason: input.observation.reason,
    answer_kind: input.observation.answer_kind,
    refs: input.observation.refs,
    command_preview: input.commandPreview,
    command_cwd: input.commandCwd,
    output: input.output,
    stage_attempts: stageAttempts,
  };
}

export async function dispatchFamilyRuntimeTask(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  row: FamilyRuntimeTaskRow,
  options: {
    temporalProviderModule: TemporalProviderModule;
    queryTemporalStageAttemptReadModel?: QueryTemporalStageAttemptReadModel;
  },
) {
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  if (payload.domain_truth_write === true || payload.artifact_gate_override === true) {
    const updatedAt = nowIso();
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked', last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ?
    `).run(
      'Domain truth or artifact gate writes are forbidden through the OPL family runtime queue.',
      'domain_forbidden_write',
      updatedAt,
      row.task_id,
    );
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_blocked_domain_forbidden_write',
      source: 'opl-family-runtime',
      payload,
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'error',
      title: 'Family runtime task blocked',
      body: 'OPL queue cannot write domain truth, quality verdicts, or artifact gates.',
      payload: { reason: 'domain_forbidden_write' },
    });
    const stageAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      status: 'blocked',
      blockedReason: 'domain_forbidden_write',
    });
    return { task_id: row.task_id, status: 'blocked', reason: 'domain_forbidden_write', stage_attempts: stageAttempts };
  }
  const providerHostedAttempt = ensureProviderHostedStageAttempt(db, row, payload);
  if (providerHostedAttempt?.status === 'blocked' && providerHostedAttempt.blocked_reason?.startsWith('stage_admission_')) {
    return blockTaskForStageAdmissionGate(db, row, providerHostedAttempt);
  }
  if (isPaperMissionStageRouteTask(row, payload)) {
    return dispatchPaperMissionStageRouteTask(db, paths, row, payload, {
      temporalProviderModule: options.temporalProviderModule,
    });
  }
  if (isDefaultExecutorDispatchTask(row, payload)) {
    return startDefaultExecutorStageAttempt(db, paths, {
      row,
      payload,
      providerHostedAttempt,
      temporalProviderModule: options.temporalProviderModule,
      queryTemporalStageAttemptReadModel: options.queryTemporalStageAttemptReadModel,
    });
  }
  if (isProviderRequiredDefaultExecutorTask(row, payload)) {
    return blockProviderRequiredDefaultExecutorOwnerNotAdmitted(db, row, payload);
  }
  const activeStageAttempts = listStageAttemptsForTask(db, row.task_id).filter((attempt) => (
    attempt.status === 'queued'
    || attempt.status === 'running'
    || attempt.status === 'checkpointed'
    || attempt.status === 'blocked'
    || attempt.status === 'human_gate'
    || attempt.status === 'failed'
  ));
  const activeStageAttemptIds = activeStageAttempts.map((attempt) => attempt.stage_attempt_id);

  const leaseOwner = `opl-family-runtime:${process.pid}`;
  const leaseExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const attempt = row.attempts + 1;
  const runningAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = 'running', attempts = ?, lease_owner = ?, lease_expires_at = ?, updated_at = ?
    WHERE task_id = ? AND status IN ('queued', 'retry_waiting')
  `).run(attempt, leaseOwner, leaseExpiresAt, runningAt, row.task_id);
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_dispatch_started',
    source: 'opl-family-runtime',
    payload: { attempt, lease_owner: leaseOwner, lease_expires_at: leaseExpiresAt },
  });
  const runningStageAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    stageAttemptIds: activeStageAttemptIds,
    status: 'running',
    incrementAttempt: true,
    activityEvent: {
      activity_kind: 'domain_handler_dispatch_activity',
      activity_status: 'running',
    },
  });

  const dispatchPath = writeFamilyRuntimeDispatchTask(paths, { ...row, attempts: attempt });
  const command = dispatchCommandForDomain(row.domain_id, dispatchPath, payload);
  const result = runFamilyRuntimeDomainHandlerCommand(command.command_preview, {
    cwd: command.cwd,
    env: process.env,
  });

  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const exitCode = result.exit_code;
  const output = parseDispatchOutput(stdout);
  const succeeded = exitCode === 0 && output.forbidden_domain_truth_write !== true;

  if (succeeded) {
    const closeoutRefs = closeoutRefsFromDomainHandlerOutput(output);
    const typedCloseoutPacket = canonicalCloseoutPacketFromDomainHandlerOutput(output);
    if (isDomainRouteOplAttemptAdmissionRequested(output)) {
      const observation = masDomainOwnerAnswerObservationFromRecords([
        { source: 'task_payload', value: payload },
        { source: 'domain_handler_output', value: output },
      ]);
      if (observation) {
        return blockTaskForObservedMasDomainOwnerAnswer(db, row, {
          commandPreview: command.command_preview,
          commandCwd: command.cwd,
          output,
          activeStageAttemptIds,
          closeoutRefs,
          observation,
        });
      }
    }
    if (domainRouteOplAttemptAdmissionNeedsProviderFollowthrough({ taskPayload: payload, output })) {
      return keepTaskOpenForOplAttemptAdmissionRequested(db, row, {
        commandPreview: command.command_preview,
        commandCwd: command.cwd,
        output,
        activeStageAttemptIds,
        closeoutRefs,
      });
    }
    if (isDefaultExecutorOplAttemptAdmissionRequested(output)) {
      return keepTaskOpenForOplAttemptAdmissionRequested(db, row, {
        commandPreview: command.command_preview,
        commandCwd: command.cwd,
        output,
        activeStageAttemptIds,
        closeoutRefs,
      });
    }
    if (
      providerHostedDispatchRequiresCloseout(row, activeStageAttemptIds)
      && !typedCloseoutPacket
      && closeoutRefs.length === 0
    ) {
      return blockTaskForMissingDomainCloseout(db, row, {
        commandPreview: command.command_preview,
        commandCwd: command.cwd,
        output,
        activeStageAttemptIds,
        closeoutRefs,
      });
    }
    const completedAt = nowIso();
    db.prepare(`
      UPDATE tasks
      SET status = 'succeeded', lease_owner = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = ?
      WHERE task_id = ?
    `).run(completedAt, row.task_id);
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'task_dispatch_succeeded',
      source: 'opl-family-runtime',
      payload: {
        command_preview: command.command_preview,
        command_cwd: command.cwd,
        output,
        ...(result.recovery ? { domain_handler_recovery: result.recovery } : {}),
      },
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'info',
      title: 'Family runtime task dispatched',
      body: `${row.domain_id}:${row.task_kind}`,
      payload: { output },
    });
    const checkpointedStageAttempts = updateStageAttemptsForTask(db, {
      taskId: row.task_id,
      stageAttemptIds: activeStageAttemptIds,
      status: 'completed',
      closeoutRefs,
      ...(closeoutRefs.length > 0
        ? { routeImpact: {
            closeout_refs: closeoutRefs,
            receipt_ref: cleanOptionalString(output.receipt_ref)
              ?? cleanOptionalString(output.closeout_ref)
              ?? closeoutRefs[0],
          } }
        : {}),
      activityEvent: {
        activity_kind: 'domain_handler_dispatch_activity',
        activity_status: typedCloseoutPacket ? 'typed_closeout_received' : 'checkpointed',
        closeout_refs: closeoutRefs,
      },
    });
    const stageAttempts = typedCloseoutPacket
      ? listStageAttemptsForTask(db, row.task_id).filter((attempt) => (
          activeStageAttemptIds.length === 0 || activeStageAttemptIds.includes(attempt.stage_attempt_id)
        )).map((attempt) => ingestStageAttemptCloseout(db, {
          stageAttemptId: attempt.stage_attempt_id,
          packet: typedCloseoutPacket,
        }).attempt)
      : checkpointedStageAttempts;
    return {
      task_id: row.task_id,
      status: 'succeeded',
      command_preview: command.command_preview,
      command_cwd: command.cwd,
      output,
      ...(result.recovery ? { domain_handler_recovery: result.recovery } : {}),
      stage_attempts: stageAttempts,
    };
  }

  const errorMessage = domainHandlerResultErrorMessage(result, 'Domain dispatch');
  const staleOwnerRouteReason = domainHandlerOwnerRouteStaleReason(output, errorMessage);
  if (staleOwnerRouteReason) {
    return blockTaskForStaleOwnerRoute(db, row, {
      attempt,
      exitCode,
      stdout,
      stderr,
      commandPreview: command.command_preview,
      commandCwd: command.cwd,
      output,
      domainHandlerBlockedReason: staleOwnerRouteReason,
      activeStageAttemptIds,
      runningStageAttempts,
    });
  }
  const nextStatus = attempt >= row.max_attempts ? 'dead_letter' : 'retry_waiting';
  const failedAt = nowIso();
  db.prepare(`
    UPDATE tasks
    SET status = ?, lease_owner = NULL, lease_expires_at = NULL, last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ?
  `).run(
    nextStatus,
    errorMessage,
    nextStatus === 'dead_letter' ? 'retry_budget_exhausted' : null,
    failedAt,
    row.task_id,
  );
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: nextStatus === 'dead_letter' ? 'task_dead_lettered' : 'task_retry_waiting',
    source: 'opl-family-runtime',
    payload: {
      attempt,
      exit_code: exitCode,
      stdout,
      stderr,
      command_preview: command.command_preview,
      command_cwd: command.cwd,
      output,
      ...(result.recovery ? { domain_handler_recovery: result.recovery } : {}),
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: nextStatus === 'dead_letter' ? 'error' : 'warning',
    title: nextStatus === 'dead_letter' ? 'Family runtime task dead-lettered' : 'Family runtime task queued for retry',
    body: errorMessage,
    payload: { attempt, max_attempts: row.max_attempts },
  });
  const stageAttempts = updateStageAttemptsForTask(db, {
    taskId: row.task_id,
    stageAttemptIds: activeStageAttemptIds,
    status: nextStatus === 'dead_letter' ? 'dead_lettered' : 'failed',
    blockedReason: nextStatus === 'dead_letter' ? 'retry_budget_exhausted' : errorMessage,
    activityEvent: {
      activity_kind: 'domain_handler_dispatch_activity',
      activity_status: nextStatus === 'dead_letter' ? 'dead_lettered' : 'failed',
      error: errorMessage,
    },
  });
  return {
    task_id: row.task_id,
    status: nextStatus,
    command_preview: command.command_preview,
    command_cwd: command.cwd,
    exit_code: exitCode,
    error: errorMessage,
    ...(result.recovery ? { domain_handler_recovery: result.recovery } : {}),
    stage_attempts: stageAttempts.length > 0 ? stageAttempts : runningStageAttempts,
  };
}

export { hydrateDomainTasks, readMasManagedProviderProjection };
