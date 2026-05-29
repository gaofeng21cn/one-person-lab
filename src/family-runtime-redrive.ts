import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import {
  MAS_DEFAULT_EXECUTOR_DISPATCH_TASK_KIND,
  ensureProviderHostedStageAttempt,
  isMasDefaultExecutorDispatchTask,
} from './family-runtime-provider-hosted-attempts.ts';
import { listStageAttemptsForTask } from './family-runtime-stage-attempts.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  taskToPayload,
  type FamilyRuntimeTaskRow,
  type FamilyRuntimeTaskStatus,
} from './family-runtime-store.ts';
import { activeQueueHoldForTaskInput } from './family-runtime-queue-holds.ts';

const PROVIDER_TRANSPORT_REDRIVE_REASONS = [
  'temporal_stage_attempt_start_failed',
  'temporal_stage_attempt_not_completed',
  'temporal_stage_attempt_failed',
] as const;
const PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS = [
  ...PROVIDER_TRANSPORT_REDRIVE_REASONS,
  'temporal_workflow_not_started_or_not_found',
] as const;

type ProviderTransportRedriveReason = typeof PROVIDER_TRANSPORT_REDRIVE_REASONS[number];
type ProviderStageAttemptRedriveReason = typeof PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS[number];
type ProviderTransportRedriveTrigger = 'operator' | 'auto';
type StageAttemptPayload = ReturnType<typeof listStageAttemptsForTask>[number];
type RedriveAdmission = ReturnType<typeof redriveAdmissionForTask>;

function parsePayload(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as Record<string, unknown>;
}

function redriveAdmissionForTask(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  const activeHold = activeQueueHoldForTaskInput(db, {
    domainId: row.domain_id,
    taskKind: row.task_kind,
    payload,
  });
  return {
    activeHold,
    nextStatus: (row.requires_approval || activeHold ? 'waiting_approval' : 'queued') as FamilyRuntimeTaskStatus,
    requiresApproval: row.requires_approval || Boolean(activeHold),
    lastError: activeHold?.reason ?? null,
  };
}

function createRedrivenAttemptForAdmission(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
  admission: RedriveAdmission,
  eventSource: string,
) {
  if (admission.nextStatus !== 'queued') {
    return null;
  }
  return ensureProviderHostedStageAttempt(db, row, payload, {
    newAttempt: true,
    eventSource,
  });
}

function redriveAdmissionEventPayload(admission: RedriveAdmission) {
  return {
    redrive_admission_status: admission.nextStatus,
    provider_redrive_started: admission.nextStatus === 'queued',
    held_by_active_hold: Boolean(admission.activeHold),
    active_hold_id: admission.activeHold?.hold_id ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function assertProviderTransportRedriveReason(value: string | null): asserts value is ProviderTransportRedriveReason {
  if (!PROVIDER_TRANSPORT_REDRIVE_REASONS.includes(value as ProviderTransportRedriveReason)) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime queue redrive only supports blocked provider-transport MAS default executor tasks.',
      {
        blocker_id: 'family_runtime_redrive_blocked',
        dead_letter_reason: value,
        allowed_dead_letter_reasons: PROVIDER_TRANSPORT_REDRIVE_REASONS,
      },
    );
  }
}

function isProviderStageAttemptRedriveReason(value: string | null): value is ProviderStageAttemptRedriveReason {
  return PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS.includes(value as ProviderStageAttemptRedriveReason);
}

function providerRetryBudgetDeadLetterEvidenceKind(db: DatabaseSync, taskId: string) {
  const stageAttemptEvidence = listStageAttemptsForTask(db, taskId).some((attempt) => (
    attempt.status === 'dead_lettered'
    && attempt.blocked_reason === 'retry_budget_exhausted'
    && attempt.provider_kind === 'temporal'
    && attempt.executor_kind === 'codex_cli'
  ));
  if (stageAttemptEvidence) {
    return 'stage_attempt_dead_lettered';
  }
  const event = db.prepare(`
    SELECT payload_json
    FROM events
    WHERE task_id = ? AND event_type = 'task_auto_dead_lettered_after_provider_transport_retries'
    ORDER BY created_at DESC
    LIMIT 1
  `).get(taskId) as { payload_json: string } | undefined;
  if (!event) {
    return null;
  }
  const payload = JSON.parse(event.payload_json) as Record<string, unknown>;
  const previousReason = typeof payload.previous_dead_letter_reason === 'string'
    ? payload.previous_dead_letter_reason
    : null;
  if (!PROVIDER_TRANSPORT_REDRIVE_REASONS.includes(previousReason as ProviderTransportRedriveReason)) {
    return null;
  }
  return 'task_auto_dead_letter_event';
}

function domainRouteRedriveAuthority(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  const projection = taskToPayload(row).domain_route;
  if (!isRecord(projection) || !isRecord(projection.authority_boundary)) {
    return false;
  }
  return row.domain_id === 'medautoscience'
    && payload.domain_truth_write !== true
    && payload.artifact_gate_override !== true
    && projection.authority_boundary.queue_owns_attempts_retry_and_dead_letter === true
    && projection.authority_boundary.writes_mas_truth === false
    && projection.authority_boundary.writes_publication_quality === false
    && projection.authority_boundary.writes_artifact_gate === false
    && projection.authority_boundary.writes_current_package === false;
}

function terminalProviderTransportAttemptForRedrive(db: DatabaseSync, taskId: string) {
  const attempts = listStageAttemptsForTask(db, taskId).filter((attempt) => {
    const closeoutRefs = stringList(attempt.closeout_refs);
    return attempt.provider_kind === 'temporal'
      && ['failed', 'blocked', 'dead_lettered'].includes(attempt.status)
      && isProviderStageAttemptRedriveReason(attempt.blocked_reason)
      && closeoutRefs.length === 0
      && attempt.closeout_receipt_status === null;
  });
  return attempts.sort((left, right) => Date.parse(left.updated_at) - Date.parse(right.updated_at)).at(-1) ?? null;
}

function assertDomainRouteProviderTransportTask(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (!domainRouteRedriveAuthority(row, payload)) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime queue redrive requires a provider transport task with OPL redrive authority.',
      {
        blocker_id: 'family_runtime_redrive_blocked',
        task_id: row.task_id,
        domain_id: row.domain_id,
        task_kind: row.task_kind,
      },
    );
  }
}

function assertMasDefaultExecutorTask(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (
    row.domain_id !== 'medautoscience'
    || row.task_kind !== MAS_DEFAULT_EXECUTOR_DISPATCH_TASK_KIND
    || !isMasDefaultExecutorDispatchTask(row, payload)
  ) {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime queue redrive does not redrive non-MAS default executor tasks.',
      {
        blocker_id: 'family_runtime_redrive_blocked',
        task_id: row.task_id,
        domain_id: row.domain_id,
        task_kind: row.task_kind,
      },
    );
  }
}

function redriveTerminalProviderTransportTask(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  _payload: Record<string, unknown>,
  input: {
    source?: string;
    operatorReason: string;
    redrivenAt?: string;
  },
) {
  const eventSource = input.source?.trim() || 'opl-family-runtime-redrive';
  const redrivenAt = input.redrivenAt ?? nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const currentRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(row.task_id) as
      | FamilyRuntimeTaskRow
      | undefined;
    if (!currentRow) {
      throw new FrameworkContractError('cli_usage_error', 'Family runtime task not found.', {
        task_id: row.task_id,
      });
    }
    const currentPayload = parsePayload(currentRow);
    assertDomainRouteProviderTransportTask(currentRow, currentPayload);
    const terminalAttempt = terminalProviderTransportAttemptForRedrive(db, currentRow.task_id);
    if (!terminalAttempt) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'family-runtime queue redrive requires failed provider attempt evidence without closeout refs.',
        {
          blocker_id: 'family_runtime_redrive_blocked',
          task_id: currentRow.task_id,
          status: currentRow.status,
          required_stage_attempt_statuses: ['failed', 'blocked', 'dead_lettered'],
          allowed_blocked_reasons: PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS,
          closeout_refs_required_empty: true,
        },
      );
    }
    const admission = redriveAdmissionForTask(db, currentRow, currentPayload);
    const nextStatus = admission.nextStatus;
    const claim = db.prepare(`
      UPDATE tasks
      SET status = ?, attempts = 0, requires_approval = ?, lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = NULL, updated_at = ?
      WHERE task_id = ?
    `).run(nextStatus, admission.requiresApproval ? 1 : 0, admission.lastError, redrivenAt, currentRow.task_id);
    if (claim.changes === 0) {
      const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(currentRow.task_id) as
        | FamilyRuntimeTaskRow
        | undefined;
      db.exec('COMMIT');
      return {
        redriven: false,
        requeued_from_terminal: false,
        idempotent_noop: true,
        skip_reason: 'task_no_longer_available_for_provider_transport_redrive',
        task: refreshed ? taskToPayload(refreshed) : null,
        redriven_stage_attempt: null,
      };
    }
    const redrivenAttempt = createRedrivenAttemptForAdmission(db, currentRow, currentPayload, admission, eventSource);
    const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(currentRow.task_id) as
      FamilyRuntimeTaskRow;
    insertEvent(db, {
      taskId: currentRow.task_id,
      domainId: currentRow.domain_id,
      eventType: 'task_operator_redrive_from_terminal_provider_transport',
      source: eventSource,
      payload: {
        previous_status: currentRow.status,
        next_status: nextStatus,
        ...redriveAdmissionEventPayload(admission),
        previous_dead_letter_reason: currentRow.dead_letter_reason,
        previous_last_error: currentRow.last_error,
        previous_stage_attempt_id: terminalAttempt.stage_attempt_id,
        previous_stage_attempt_state: terminalAttempt.status,
        previous_stage_attempt_blocked_reason: terminalAttempt.blocked_reason,
        operator_reason: input.operatorReason,
        source_fingerprint_changed: false,
        redriven_stage_attempt_id: redrivenAttempt?.stage_attempt_id ?? null,
        authority_boundary: {
          opl: 'provider_transport_redrive_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
        },
      },
    });
    db.exec('COMMIT');
    return {
      redriven: true,
      requeued_from_terminal: true,
      task: taskToPayload(refreshed),
      redriven_stage_attempt: redrivenAttempt,
      provider_redrive_started: Boolean(redrivenAttempt),
      held_by_active_hold: Boolean(admission.activeHold),
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the original contract error.
    }
    throw error;
  }
}

export function redriveBlockedMasDefaultExecutorProviderTransportTask(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  _payload: Record<string, unknown>,
  input: {
    trigger: ProviderTransportRedriveTrigger;
    source?: string;
    operatorReason?: string;
    usedAttempts?: number;
    maxAttempts?: number;
    redrivenAt?: string;
  },
) {
  const eventSource = input.source?.trim() || (
    input.trigger === 'auto'
      ? 'opl-provider-scheduler:auto-redrive'
      : 'opl-family-runtime-redrive'
  );
  const eventType = input.trigger === 'auto'
    ? 'task_auto_redrive_from_blocked_provider_transport'
    : 'task_operator_redrive_from_blocked_provider_transport';
  const redrivenAt = input.redrivenAt ?? nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const currentRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(row.task_id) as
      | FamilyRuntimeTaskRow
      | undefined;
    if (!currentRow) {
      throw new FrameworkContractError('cli_usage_error', 'Family runtime task not found.', {
        task_id: row.task_id,
      });
    }
    if (
      currentRow.status !== 'blocked'
      || currentRow.dead_letter_reason !== row.dead_letter_reason
    ) {
      db.exec('COMMIT');
      return {
        redriven: false,
        requeued_from_terminal: false,
        idempotent_noop: true,
        skip_reason: 'task_no_longer_blocked_for_provider_transport_redrive',
        task: taskToPayload(currentRow),
        redriven_stage_attempt: null,
      };
    }
    const currentPayload = parsePayload(currentRow);
    assertMasDefaultExecutorTask(currentRow, currentPayload);
    assertProviderTransportRedriveReason(currentRow.dead_letter_reason);
    const admission = redriveAdmissionForTask(db, currentRow, currentPayload);
    const nextStatus = admission.nextStatus;
    const claim = db.prepare(`
      UPDATE tasks
      SET status = ?, attempts = 0, requires_approval = ?, lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = NULL, updated_at = ?
      WHERE task_id = ? AND status = 'blocked' AND dead_letter_reason = ?
    `).run(
      nextStatus,
      admission.requiresApproval ? 1 : 0,
      admission.lastError,
      redrivenAt,
      currentRow.task_id,
      currentRow.dead_letter_reason,
    );
    if (claim.changes === 0) {
      const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(currentRow.task_id) as
        | FamilyRuntimeTaskRow
        | undefined;
      db.exec('COMMIT');
      return {
        redriven: false,
        requeued_from_terminal: false,
        idempotent_noop: true,
        skip_reason: 'task_no_longer_blocked_for_provider_transport_redrive',
        task: refreshed ? taskToPayload(refreshed) : null,
        redriven_stage_attempt: null,
      };
    }
    const redrivenAttempt = createRedrivenAttemptForAdmission(db, currentRow, currentPayload, admission, eventSource);
    const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(currentRow.task_id) as
      FamilyRuntimeTaskRow;
    insertEvent(db, {
      taskId: currentRow.task_id,
      domainId: currentRow.domain_id,
      eventType,
      source: eventSource,
      payload: {
        previous_status: currentRow.status,
        next_status: nextStatus,
        ...redriveAdmissionEventPayload(admission),
        previous_dead_letter_reason: currentRow.dead_letter_reason,
        previous_last_error: currentRow.last_error,
        ...(input.trigger === 'operator'
          ? {
              operator_reason: input.operatorReason ?? null,
              source_fingerprint_changed: false,
            }
          : {
              used_attempts: input.usedAttempts ?? null,
              max_attempts: input.maxAttempts ?? currentRow.max_attempts,
            }),
        redriven_stage_attempt_id: redrivenAttempt?.stage_attempt_id ?? null,
        authority_boundary: {
          opl: input.trigger === 'auto'
            ? 'provider_transport_auto_redrive_only'
            : 'provider_transport_redrive_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
        },
      },
    });
    db.exec('COMMIT');
    return {
      redriven: true,
      requeued_from_terminal: true,
      task: taskToPayload(refreshed),
      redriven_stage_attempt: redrivenAttempt,
      provider_redrive_started: Boolean(redrivenAttempt),
      held_by_active_hold: Boolean(admission.activeHold),
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the original contract error.
    }
    throw error;
  }
}

function redriveRetryBudgetDeadLetterMasDefaultExecutorProviderTask(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  _payload: Record<string, unknown>,
  input: {
    source?: string;
    operatorReason: string;
    redrivenAt?: string;
  },
) {
  const eventSource = input.source?.trim() || 'opl-family-runtime-redrive';
  const redrivenAt = input.redrivenAt ?? nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const currentRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(row.task_id) as
      | FamilyRuntimeTaskRow
      | undefined;
    if (!currentRow) {
      throw new FrameworkContractError('cli_usage_error', 'Family runtime task not found.', {
        task_id: row.task_id,
      });
    }
    if (
      currentRow.status !== 'dead_letter'
      || currentRow.dead_letter_reason !== 'retry_budget_exhausted'
    ) {
      db.exec('COMMIT');
      return {
        redriven: false,
        requeued_from_terminal: false,
        idempotent_noop: true,
        skip_reason: 'task_no_longer_retry_budget_dead_letter_for_provider_transport_redrive',
        task: taskToPayload(currentRow),
        redriven_stage_attempt: null,
      };
    }
    const currentPayload = parsePayload(currentRow);
    assertMasDefaultExecutorTask(currentRow, currentPayload);
    const retryBudgetEvidenceKind = providerRetryBudgetDeadLetterEvidenceKind(db, currentRow.task_id);
    if (!retryBudgetEvidenceKind) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'family-runtime queue redrive requires retry-budget provider attempt evidence.',
        {
          blocker_id: 'family_runtime_redrive_blocked',
          task_id: currentRow.task_id,
          status: currentRow.status,
          dead_letter_reason: currentRow.dead_letter_reason,
          required_stage_attempt_status: 'dead_lettered',
          required_stage_attempt_blocked_reason: 'retry_budget_exhausted',
          accepted_task_event_type: 'task_auto_dead_lettered_after_provider_transport_retries',
        },
      );
    }
    const admission = redriveAdmissionForTask(db, currentRow, currentPayload);
    const nextStatus = admission.nextStatus;
    const claim = db.prepare(`
      UPDATE tasks
      SET status = ?, attempts = 0, requires_approval = ?, lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = NULL, updated_at = ?
      WHERE task_id = ? AND status = 'dead_letter' AND dead_letter_reason = 'retry_budget_exhausted'
    `).run(nextStatus, admission.requiresApproval ? 1 : 0, admission.lastError, redrivenAt, currentRow.task_id);
    if (claim.changes === 0) {
      const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(currentRow.task_id) as
        | FamilyRuntimeTaskRow
        | undefined;
      db.exec('COMMIT');
      return {
        redriven: false,
        requeued_from_terminal: false,
        idempotent_noop: true,
        skip_reason: 'task_no_longer_retry_budget_dead_letter_for_provider_transport_redrive',
        task: refreshed ? taskToPayload(refreshed) : null,
        redriven_stage_attempt: null,
      };
    }
    const redrivenAttempt = createRedrivenAttemptForAdmission(db, currentRow, currentPayload, admission, eventSource);
    const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(currentRow.task_id) as
      FamilyRuntimeTaskRow;
    insertEvent(db, {
      taskId: currentRow.task_id,
      domainId: currentRow.domain_id,
      eventType: 'task_operator_redrive_from_dead_letter_provider_retry_budget',
      source: eventSource,
      payload: {
        previous_status: currentRow.status,
        next_status: nextStatus,
        ...redriveAdmissionEventPayload(admission),
        previous_dead_letter_reason: currentRow.dead_letter_reason,
        previous_last_error: currentRow.last_error,
        operator_reason: input.operatorReason,
        source_fingerprint_changed: false,
        retry_budget_evidence_kind: retryBudgetEvidenceKind,
        redriven_stage_attempt_id: redrivenAttempt?.stage_attempt_id ?? null,
        authority_boundary: {
          opl: 'provider_transport_retry_budget_operator_redrive_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
        },
      },
    });
    db.exec('COMMIT');
    return {
      redriven: true,
      requeued_from_terminal: true,
      task: taskToPayload(refreshed),
      redriven_stage_attempt: redrivenAttempt,
      provider_redrive_started: Boolean(redrivenAttempt),
      held_by_active_hold: Boolean(admission.activeHold),
    };
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Preserve the original contract error.
    }
    throw error;
  }
}

export function redriveFamilyRuntimeTask(
  db: DatabaseSync,
  input: {
    taskId: string;
    reason: string;
    source?: string;
  },
) {
  const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(input.taskId) as
    | FamilyRuntimeTaskRow
    | undefined;
  if (!row) {
    throw new FrameworkContractError('cli_usage_error', 'Family runtime task not found.', {
      task_id: input.taskId,
    });
  }
  const payload = parsePayload(row);
  const operatorReason = input.reason.trim();
  if (!operatorReason) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime queue redrive requires --reason.', {
      usage: 'opl family-runtime queue redrive <task_id> --reason <operator_reason>',
    });
  }

  let result;
  if (isMasDefaultExecutorDispatchTask(row, payload) && row.status === 'blocked') {
    assertMasDefaultExecutorTask(row, payload);
    assertProviderTransportRedriveReason(row.dead_letter_reason);
    result = redriveBlockedMasDefaultExecutorProviderTransportTask(db, row, payload, {
      trigger: 'operator',
      source: input.source,
      operatorReason,
    });
  } else if (
    isMasDefaultExecutorDispatchTask(row, payload)
    && row.status === 'dead_letter'
    && row.dead_letter_reason === 'retry_budget_exhausted'
  ) {
    assertMasDefaultExecutorTask(row, payload);
    result = redriveRetryBudgetDeadLetterMasDefaultExecutorProviderTask(db, row, payload, {
      source: input.source,
      operatorReason,
    });
  } else if (domainRouteRedriveAuthority(row, payload)) {
    result = redriveTerminalProviderTransportTask(db, row, payload, {
      source: input.source,
      operatorReason,
    });
  } else {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime queue redrive requires a blocked provider transport task or retry-budget provider dead-letter.',
      {
        blocker_id: 'family_runtime_redrive_blocked',
        task_id: row.task_id,
        status: row.status,
        dead_letter_reason: row.dead_letter_reason,
      },
    );
  }
  if (result.redriven) {
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'info',
      title: 'Family runtime task redriven',
      body: `${row.domain_id}:${row.task_kind}`,
      payload: {
        status: result.task?.status ?? null,
        operator_reason: operatorReason,
        redriven_stage_attempt_id: result.redriven_stage_attempt?.stage_attempt_id ?? null,
        provider_redrive_started: result.provider_redrive_started ?? null,
        held_by_active_hold: result.held_by_active_hold ?? null,
      },
    });
  }
  return result;
}
