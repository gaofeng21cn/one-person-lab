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

  const redrivenAt = nowIso();
  const redrivenAttempt = ensureProviderHostedStageAttempt(db, row, payload, {
    newAttempt: true,
    eventSource: input.source?.trim() || 'opl-family-runtime-redrive',
  });
  const nextStatus: FamilyRuntimeTaskStatus = row.requires_approval ? 'waiting_approval' : 'queued';
  db.prepare(`
    UPDATE tasks
    SET status = ?, attempts = 0, lease_owner = NULL, lease_expires_at = NULL,
      last_error = NULL, dead_letter_reason = NULL, updated_at = ?
    WHERE task_id = ?
  `).run(nextStatus, redrivenAt, row.task_id);
  const refreshed = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(row.task_id) as FamilyRuntimeTaskRow;
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'task_operator_redrive_from_blocked_provider_transport',
    source: input.source?.trim() || 'opl-family-runtime-redrive',
    payload: {
      previous_status: row.status,
      next_status: nextStatus,
      previous_dead_letter_reason: row.dead_letter_reason,
      previous_last_error: row.last_error,
      operator_reason: operatorReason,
      redriven_stage_attempt_id: redrivenAttempt?.stage_attempt_id ?? null,
      source_fingerprint_changed: false,
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
  insertNotification(db, {
    taskId: row.task_id,
    severity: 'info',
    title: 'Family runtime task redriven',
    body: `${row.domain_id}:${row.task_kind}`,
    payload: {
      status: nextStatus,
      operator_reason: operatorReason,
      redriven_stage_attempt_id: redrivenAttempt?.stage_attempt_id ?? null,
    },
  });
  return {
    redriven: true,
    requeued_from_terminal: true,
    task: taskToPayload(refreshed),
    redriven_stage_attempt: redrivenAttempt,
  };
}
