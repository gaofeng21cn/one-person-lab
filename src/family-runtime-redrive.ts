import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import {
  MAS_DEFAULT_EXECUTOR_DISPATCH_TASK_KIND,
  ensureProviderHostedStageAttempt,
  isMasDefaultExecutorDispatchTask,
} from './family-runtime-provider-hosted-attempts.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  taskToPayload,
  type FamilyRuntimeTaskRow,
  type FamilyRuntimeTaskStatus,
} from './family-runtime-store.ts';

const PROVIDER_TRANSPORT_REDRIVE_REASONS = [
  'temporal_stage_attempt_start_failed',
  'temporal_stage_attempt_not_completed',
  'temporal_stage_attempt_failed',
] as const;

type ProviderTransportRedriveReason = typeof PROVIDER_TRANSPORT_REDRIVE_REASONS[number];
type ProviderTransportRedriveTrigger = 'operator' | 'auto';

function parsePayload(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as Record<string, unknown>;
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
    if (
      currentRow.domain_id !== 'medautoscience'
      || currentRow.task_kind !== MAS_DEFAULT_EXECUTOR_DISPATCH_TASK_KIND
      || !isMasDefaultExecutorDispatchTask(currentRow, currentPayload)
    ) {
      throw new FrameworkContractError(
        'cli_usage_error',
        'family-runtime queue redrive does not redrive non-MAS default executor tasks.',
        {
          blocker_id: 'family_runtime_redrive_blocked',
          task_id: currentRow.task_id,
          domain_id: currentRow.domain_id,
          task_kind: currentRow.task_kind,
        },
      );
    }
    assertProviderTransportRedriveReason(currentRow.dead_letter_reason);
    const nextStatus: FamilyRuntimeTaskStatus = currentRow.requires_approval ? 'waiting_approval' : 'queued';
    const claim = db.prepare(`
      UPDATE tasks
      SET status = ?, attempts = 0, lease_owner = NULL, lease_expires_at = NULL,
        last_error = NULL, dead_letter_reason = NULL, updated_at = ?
      WHERE task_id = ? AND status = 'blocked' AND dead_letter_reason = ?
    `).run(nextStatus, redrivenAt, currentRow.task_id, currentRow.dead_letter_reason);
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
    const redrivenAttempt = ensureProviderHostedStageAttempt(db, currentRow, currentPayload, {
      newAttempt: true,
      eventSource,
    });
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
  if (row.status !== 'blocked') {
    throw new FrameworkContractError(
      'cli_usage_error',
      'family-runtime queue redrive requires a blocked task.',
      {
        blocker_id: 'family_runtime_redrive_blocked',
        task_id: row.task_id,
        status: row.status,
      },
    );
  }
  assertProviderTransportRedriveReason(row.dead_letter_reason);
  const operatorReason = input.reason.trim();
  if (!operatorReason) {
    throw new FrameworkContractError('cli_usage_error', 'family-runtime queue redrive requires --reason.', {
      usage: 'opl family-runtime queue redrive <task_id> --reason <operator_reason>',
    });
  }

  const result = redriveBlockedMasDefaultExecutorProviderTransportTask(db, row, payload, {
    trigger: 'operator',
    source: input.source,
    operatorReason,
  });
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
      },
    });
  }
  return result;
}
