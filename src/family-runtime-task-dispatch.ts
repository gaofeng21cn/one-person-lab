import { DatabaseSync } from 'node:sqlite';

import { closeoutPacketFromDomainHandlerOutput } from './family-runtime-domain-handler-closeout.ts';
import { dispatchCommandForDomain, parseDispatchOutput } from './family-runtime-dispatch-command.ts';
import { writeFamilyRuntimeDispatchTask } from './family-runtime-dispatch-task.ts';
import {
  domainHandlerResultErrorMessage,
  runFamilyRuntimeDomainHandlerCommand,
} from './family-runtime-domain-handler-process.ts';
import { hydrateDomainTasks } from './family-runtime-domain-intake.ts';
import { readMasManagedProviderProjection } from './family-runtime-mas-managed-provider-projection.ts';
import { startMasDefaultExecutorDispatchAttempt } from './family-runtime-mas-default-executor-start.ts';
import { isMasDefaultExecutorDispatchTask } from './family-runtime-provider-hosted-attempts.ts';
import { ensureProviderHostedStageAttempt } from './family-runtime-provider-hosted-attempts.ts';
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

type TemporalProviderModule = Parameters<typeof startMasDefaultExecutorDispatchAttempt>[2]['temporalProviderModule'];

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

function providerHostedDispatchRequiresCloseout(row: FamilyRuntimeTaskRow, activeStageAttemptIds: string[]) {
  return row.domain_id === 'medautoscience'
    && MAS_PAPER_AUTONOMY_TASK_KINDS.has(row.task_kind)
    && activeStageAttemptIds.length > 0;
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

export async function dispatchFamilyRuntimeTask(
  db: DatabaseSync,
  paths: ReturnType<typeof familyRuntimePaths>,
  row: FamilyRuntimeTaskRow,
  options: {
    temporalProviderModule: TemporalProviderModule;
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
  if (isMasDefaultExecutorDispatchTask(row, payload)) {
    return startMasDefaultExecutorDispatchAttempt(db, paths, {
      row,
      payload,
      providerHostedAttempt,
      temporalProviderModule: options.temporalProviderModule,
    });
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
    const typedCloseoutPacket = closeoutPacketFromDomainHandlerOutput(output);
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
      payload: { command_preview: command.command_preview, command_cwd: command.cwd, output },
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
      stage_attempts: stageAttempts,
    };
  }

  const errorMessage = domainHandlerResultErrorMessage(result, 'Domain dispatch');
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
    stage_attempts: stageAttempts.length > 0 ? stageAttempts : runningStageAttempts,
  };
}

export { hydrateDomainTasks, readMasManagedProviderProjection };
