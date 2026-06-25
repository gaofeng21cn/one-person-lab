import type { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from './contracts.ts';
import {
  DEFAULT_EXECUTOR_DISPATCH_TASK_KIND,
  ensureProviderHostedStageAttempt,
  isDefaultExecutorDispatchTask,
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
import {
  providerOnlyRedriveProtocol,
  redriveResultBoundary,
  throwProviderOnlyRedriveBlocked,
  type ProviderOnlyRedriveKind,
} from './family-runtime-redrive-parts/protocol.ts';
import {
  assertNoProviderOnlySemanticRedriveBlocker as assertNoProviderOnlySemanticRedriveBlockerImpl,
  assertProviderOnlyRedriveProtocol,
} from './family-runtime-redrive-parts/semantic-guards.ts';

const PROVIDER_TRANSPORT_REDRIVE_REASONS = [
  'temporal_stage_attempt_start_failed',
  'temporal_stage_attempt_not_completed',
  'temporal_stage_attempt_failed',
] as const;
const PROVIDER_TRANSPORT_OPERATOR_REDRIVE_REASONS = [
  ...PROVIDER_TRANSPORT_REDRIVE_REASONS,
  'temporal_stage_attempt_canceled',
] as const;
const PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS = [
  ...PROVIDER_TRANSPORT_OPERATOR_REDRIVE_REASONS,
  'temporal_workflow_not_started_or_not_found',
] as const;
const PAPER_MISSION_STAGE_ROUTE_PROVIDER_RUNTIME_REDRIVE_REASONS = [
  'typed_closeout_packet_required',
  'codex_cli_typed_closeout_not_materialized',
  'codex_cli_provider_unavailable',
] as const;
const PROVIDER_RUNTIME_BLOCKER_REF_PATTERN = /^opl:\/\/stage-attempts\/[^/]+\/runtime-blockers\/[^/]+$/;

type ProviderTransportRedriveReason = typeof PROVIDER_TRANSPORT_REDRIVE_REASONS[number];
type ProviderTransportOperatorRedriveReason = typeof PROVIDER_TRANSPORT_OPERATOR_REDRIVE_REASONS[number];
type ProviderStageAttemptRedriveReason = typeof PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS[number];
type PaperMissionStageRouteCloseoutPacketRedriveReason =
  typeof PAPER_MISSION_STAGE_ROUTE_PROVIDER_RUNTIME_REDRIVE_REASONS[number];
type ProviderTransportRedriveTrigger = 'operator' | 'auto';
type StageAttemptPayload = ReturnType<typeof listStageAttemptsForTask>[number];
type RedriveAdmission = ReturnType<typeof redriveAdmissionForTask>;

const STOP_LOSS_DOMAIN_BLOCKER_REASONS = new Set([
  'anti_loop_budget_exhausted',
  'progress_first_owner_delta_required',
]);

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

function redriveAdmissionEventPayload(admission: RedriveAdmission, redriveKind: ProviderOnlyRedriveKind) {
  return {
    redrive_admission_status: admission.nextStatus,
    provider_redrive_started: admission.nextStatus === 'queued',
    held_by_active_hold: Boolean(admission.activeHold),
    active_hold_id: admission.activeHold?.hold_id ?? null,
    redrive_protocol: providerOnlyRedriveProtocol(redriveKind),
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

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function providerTransportRedriveReasonsForTrigger(trigger: ProviderTransportRedriveTrigger) {
  return trigger === 'auto'
    ? PROVIDER_TRANSPORT_REDRIVE_REASONS
    : PROVIDER_TRANSPORT_OPERATOR_REDRIVE_REASONS;
}

function assertProviderTransportRedriveReason(
  value: string | null,
  trigger: ProviderTransportRedriveTrigger,
): asserts value is ProviderTransportRedriveReason | ProviderTransportOperatorRedriveReason {
  const allowedReasons: readonly string[] = providerTransportRedriveReasonsForTrigger(trigger);
  if (!allowedReasons.includes(value ?? '')) {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive only supports blocked provider-transport default executor tasks.',
      STOP_LOSS_DOMAIN_BLOCKER_REASONS.has(value ?? '')
        ? 'same_lineage_stop_loss_domain_blocker'
        : 'non_provider_transport_blocker',
      {
        dead_letter_reason: value,
        allowed_dead_letter_reasons: allowedReasons,
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

function paperMissionStageRouteRedriveAuthority(row: FamilyRuntimeTaskRow, payload: Record<string, unknown>) {
  const authority = isRecord(payload.authority_boundary) ? payload.authority_boundary : {};
  return row.domain_id === 'medautoscience'
    && row.task_kind === 'paper_mission/stage-route'
    && payload.runtime_request_kind === 'mas_paper_mission_stage_route'
    && payload.domain_truth_write !== true
    && payload.artifact_gate_override !== true
    && authority.writes_owner_receipt !== true
    && authority.writes_typed_blocker !== true
    && authority.writes_human_gate !== true
    && authority.writes_current_package !== true
    && authority.writes_paper_body !== true
    && authority.can_claim_provider_running !== true
    && authority.can_claim_paper_progress !== true
    && authority.can_claim_runtime_ready !== true;
}

function providerStageAttemptRedriveReasonAllowed(
  attempt: StageAttemptPayload,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (isProviderStageAttemptRedriveReason(attempt.blocked_reason)) {
    return true;
  }
  return PAPER_MISSION_STAGE_ROUTE_PROVIDER_RUNTIME_REDRIVE_REASONS.includes(
    attempt.blocked_reason as PaperMissionStageRouteCloseoutPacketRedriveReason,
  )
    && attempt.executor_kind === 'codex_cli'
    && paperMissionStageRouteRedriveAuthority(row, payload);
}

function closeoutRefsAllowProviderTransportRedrive(
  attempt: StageAttemptPayload,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  const closeoutRefs = stringList(attempt.closeout_refs);
  if (closeoutRefs.length === 0) {
    return true;
  }
  return attempt.executor_kind === 'codex_cli'
    && paperMissionStageRouteRedriveAuthority(row, payload)
    && PAPER_MISSION_STAGE_ROUTE_PROVIDER_RUNTIME_REDRIVE_REASONS.includes(
      attempt.blocked_reason as PaperMissionStageRouteCloseoutPacketRedriveReason,
    )
    && closeoutRefs.every((ref) => PROVIDER_RUNTIME_BLOCKER_REF_PATTERN.test(ref));
}

function terminalProviderTransportAttemptForRedrive(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  const attempts = listStageAttemptsForTask(db, row.task_id).filter((attempt) => {
    return attempt.provider_kind === 'temporal'
      && ['failed', 'blocked', 'dead_lettered'].includes(attempt.status)
      && providerStageAttemptRedriveReasonAllowed(attempt, row, payload)
      && closeoutRefsAllowProviderTransportRedrive(attempt, row, payload)
      && attempt.closeout_receipt_status === null;
  });
  return attempts.sort((left, right) => Date.parse(left.updated_at) - Date.parse(right.updated_at)).at(-1) ?? null;
}

function missingLaunchAuthorizationFields(attempt: StageAttemptPayload) {
  return [
    stringValue(attempt.workspace_locator.provider_attempt_ref) ? null : 'provider_attempt_ref',
    stringValue(attempt.workspace_locator.attempt_lease_ref) ? null : 'attempt_lease_ref',
    stringValue(attempt.workspace_locator.execution_authorization_decision_ref)
      ? null
      : 'execution_authorization_decision_ref',
    stringValue(attempt.workspace_locator.execution_authorization_receipt_ref)
      ? null
      : 'execution_authorization_receipt_ref',
  ].filter((entry): entry is string => Boolean(entry));
}

function refsOnlyCheckpointMissingLaunchAuthorizationForRedrive(db: DatabaseSync, taskId: string) {
  const attempts = listStageAttemptsForTask(db, taskId).filter((attempt) => (
    attempt.provider_kind === 'temporal'
    && attempt.status === 'checkpointed'
    && attempt.closeout_receipt_status === 'domain_handler_receipt_ref_only'
    && missingLaunchAuthorizationFields(attempt).length > 0
  ));
  return attempts.sort((left, right) => Date.parse(left.updated_at) - Date.parse(right.updated_at)).at(-1) ?? null;
}

function assertNoProviderOnlySemanticRedriveBlocker(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  input: {
    allowLiveAttemptId?: string | null;
    allowRefsOnlyCheckpointAttemptId?: string | null;
  } = {},
) {
  assertNoProviderOnlySemanticRedriveBlockerImpl(db, row, {
    ...input,
    stopLossDomainBlockerReasons: STOP_LOSS_DOMAIN_BLOCKER_REASONS,
  });
}

function assertDomainRouteProviderTransportTask(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (!domainRouteRedriveAuthority(row, payload) && !paperMissionStageRouteRedriveAuthority(row, payload)) {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive requires a provider transport task with OPL redrive authority.',
      'provider_redrive_authority_missing',
      {
        task_id: row.task_id,
        domain_id: row.domain_id,
        task_kind: row.task_kind,
      },
    );
  }
}

function assertDefaultExecutorTask(
  row: FamilyRuntimeTaskRow,
  payload: Record<string, unknown>,
) {
  if (
    row.domain_id !== 'medautoscience'
    || row.task_kind !== DEFAULT_EXECUTOR_DISPATCH_TASK_KIND
    || !isDefaultExecutorDispatchTask(row, payload)
  ) {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive does not redrive non-default executor tasks.',
      'non_default_executor_task',
      {
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
    const terminalAttempt = terminalProviderTransportAttemptForRedrive(db, currentRow, currentPayload);
    if (!terminalAttempt) {
      throwProviderOnlyRedriveBlocked(
        'family-runtime queue redrive requires failed provider attempt evidence without domain closeout refs.',
        'provider_transport_attempt_evidence_missing',
        {
          task_id: currentRow.task_id,
          status: currentRow.status,
          required_stage_attempt_statuses: ['failed', 'blocked', 'dead_lettered'],
          allowed_blocked_reasons: paperMissionStageRouteRedriveAuthority(currentRow, currentPayload)
            ? [
                ...PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS,
                ...PAPER_MISSION_STAGE_ROUTE_PROVIDER_RUNTIME_REDRIVE_REASONS,
              ]
            : PROVIDER_STAGE_ATTEMPT_REDRIVE_REASONS,
          closeout_refs_must_be_empty_or_provider_runtime_blocker_refs: true,
        },
      );
    }
    assertNoProviderOnlySemanticRedriveBlocker(db, currentRow);
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
        ...redriveAdmissionEventPayload(admission, 'provider_transport_terminal'),
        previous_dead_letter_reason: currentRow.dead_letter_reason,
        previous_last_error: currentRow.last_error,
        previous_stage_attempt_id: terminalAttempt.stage_attempt_id,
        previous_stage_attempt_state: terminalAttempt.status,
        previous_stage_attempt_blocked_reason: terminalAttempt.blocked_reason,
        operator_reason: input.operatorReason,
        source_fingerprint_changed: false,
        redriven_stage_attempt_id: redrivenAttempt?.stage_attempt_id ?? null,
        provider_redrive_started: Boolean(redrivenAttempt),
        ...redriveResultBoundary('provider_transport_terminal', 'provider_transport_redrive_only'),
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
      ...redriveResultBoundary('provider_transport_terminal', 'provider_transport_redrive_only'),
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

function redriveRefsOnlyCheckpointMissingLaunchAuthorizationTask(
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
    if (currentRow.status !== 'succeeded') {
      db.exec('COMMIT');
      return {
        redriven: false,
        requeued_from_terminal: false,
        idempotent_noop: true,
        skip_reason: 'task_no_longer_refs_only_checkpoint_missing_launch_authorization',
        task: taskToPayload(currentRow),
        redriven_stage_attempt: null,
      };
    }
    const staleAttempt = refsOnlyCheckpointMissingLaunchAuthorizationForRedrive(db, currentRow.task_id);
    if (!staleAttempt) {
      throwProviderOnlyRedriveBlocked(
        'family-runtime queue redrive requires refs-only checkpoint evidence missing launch execution authorization.',
        'refs_only_checkpoint_missing_launch_authorization_evidence_missing',
        {
          task_id: currentRow.task_id,
          status: currentRow.status,
          required_stage_attempt_status: 'checkpointed',
          required_closeout_receipt_status: 'domain_handler_receipt_ref_only',
          required_missing_launch_authorization_fields: [
            'provider_attempt_ref',
            'attempt_lease_ref',
            'execution_authorization_decision_ref',
            'execution_authorization_receipt_ref',
          ],
        },
      );
    }
    assertNoProviderOnlySemanticRedriveBlocker(db, currentRow, {
      allowLiveAttemptId: staleAttempt.stage_attempt_id,
      allowRefsOnlyCheckpointAttemptId: staleAttempt.stage_attempt_id,
    });
    const missingFields = missingLaunchAuthorizationFields(staleAttempt);
    const admission = redriveAdmissionForTask(db, currentRow, currentPayload);
    const nextStatus = admission.nextStatus;
    const claim = db.prepare(`
      UPDATE tasks
      SET status = ?, attempts = 0, requires_approval = ?, lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = NULL, updated_at = ?
      WHERE task_id = ? AND status = 'succeeded'
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
        skip_reason: 'task_no_longer_refs_only_checkpoint_missing_launch_authorization',
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
      eventType: 'task_operator_redrive_from_refs_only_checkpoint_missing_launch_authorization',
      source: eventSource,
      payload: {
        previous_status: currentRow.status,
        next_status: nextStatus,
        ...redriveAdmissionEventPayload(admission, 'refs_only_checkpoint_missing_launch_authorization'),
        previous_stage_attempt_id: staleAttempt.stage_attempt_id,
        previous_stage_attempt_state: staleAttempt.status,
        previous_closeout_receipt_status: staleAttempt.closeout_receipt_status,
        missing_launch_authorization_fields: missingFields,
        operator_reason: input.operatorReason,
        source_fingerprint_changed: false,
        redriven_stage_attempt_id: redrivenAttempt?.stage_attempt_id ?? null,
        ...redriveResultBoundary(
          'refs_only_checkpoint_missing_launch_authorization',
          'provider_transport_redrive_only',
          {
            refs_only_checkpoint_is_running_proof: false,
          },
        ),
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
      ...redriveResultBoundary(
        'refs_only_checkpoint_missing_launch_authorization',
        'provider_transport_redrive_only',
        {
          refs_only_checkpoint_is_running_proof: false,
        },
      ),
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

export function redriveBlockedDefaultExecutorProviderTransportTask(
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
    assertDefaultExecutorTask(currentRow, currentPayload);
    assertProviderTransportRedriveReason(currentRow.dead_letter_reason, input.trigger);
    assertNoProviderOnlySemanticRedriveBlocker(db, currentRow);
    const strictRedriveProtocol = assertProviderOnlyRedriveProtocol({
      db,
      row: currentRow,
      payload: currentPayload,
      evidenceKind: 'blocked_provider_transport',
    });
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
        ...redriveAdmissionEventPayload(admission, 'provider_transport_blocked'),
        previous_dead_letter_reason: currentRow.dead_letter_reason,
        previous_last_error: currentRow.last_error,
        ...(input.trigger === 'operator'
          ? {
              operator_reason: input.operatorReason ?? null,
              source_fingerprint_changed: false,
              action: 'provider_transport_redrive',
            }
          : {
              used_attempts: input.usedAttempts ?? null,
              max_attempts: input.maxAttempts ?? currentRow.max_attempts,
              action: 'provider_transport_auto_redrive',
            }),
        reason: input.trigger === 'auto'
          ? 'provider_transport_auto_redrive'
          : 'provider_transport_operator_redrive',
        redriven_stage_attempt_id: redrivenAttempt?.stage_attempt_id ?? null,
        strict_provider_redrive_protocol: strictRedriveProtocol,
        ...redriveResultBoundary(
          'provider_transport_blocked',
          input.trigger === 'auto'
            ? 'provider_transport_auto_redrive_only'
            : 'provider_transport_redrive_only',
          {
            action: input.trigger === 'auto'
              ? 'provider_transport_auto_redrive'
              : 'provider_transport_redrive',
          },
        ),
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
      ...redriveResultBoundary(
        'provider_transport_blocked',
        input.trigger === 'auto'
          ? 'provider_transport_auto_redrive_only'
          : 'provider_transport_redrive_only',
      ),
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

function redriveRetryBudgetDeadLetterDefaultExecutorProviderTask(
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
    assertDefaultExecutorTask(currentRow, currentPayload);
    const retryBudgetEvidenceKind = providerRetryBudgetDeadLetterEvidenceKind(db, currentRow.task_id);
    if (!retryBudgetEvidenceKind) {
      throwProviderOnlyRedriveBlocked(
        'family-runtime queue redrive requires retry-budget provider attempt evidence.',
        'retry_budget_provider_transport_evidence_missing',
        {
          task_id: currentRow.task_id,
          status: currentRow.status,
          dead_letter_reason: currentRow.dead_letter_reason,
          required_stage_attempt_status: 'dead_lettered',
          required_stage_attempt_blocked_reason: 'retry_budget_exhausted',
          accepted_task_event_type: 'task_auto_dead_lettered_after_provider_transport_retries',
        },
      );
    }
    assertNoProviderOnlySemanticRedriveBlocker(db, currentRow);
    const strictRedriveProtocol = assertProviderOnlyRedriveProtocol({
      db,
      row: currentRow,
      payload: currentPayload,
      evidenceKind: 'retry_budget_dead_letter',
    });
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
        ...redriveAdmissionEventPayload(admission, 'retry_budget_provider_transport'),
        previous_dead_letter_reason: currentRow.dead_letter_reason,
        previous_last_error: currentRow.last_error,
        operator_reason: input.operatorReason,
        source_fingerprint_changed: false,
        reason: 'provider_transport_retry_budget_operator_redrive',
        action: 'provider_transport_dead_letter_redrive',
        retry_budget_evidence_kind: retryBudgetEvidenceKind,
        redriven_stage_attempt_id: redrivenAttempt?.stage_attempt_id ?? null,
        strict_provider_redrive_protocol: strictRedriveProtocol,
        ...redriveResultBoundary(
          'retry_budget_provider_transport',
          'provider_transport_retry_budget_operator_redrive_only',
          {
            action: 'provider_transport_dead_letter_redrive',
          },
        ),
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
      ...redriveResultBoundary(
        'retry_budget_provider_transport',
        'provider_transport_retry_budget_operator_redrive_only',
      ),
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
  if (isDefaultExecutorDispatchTask(row, payload) && row.status === 'blocked') {
    assertDefaultExecutorTask(row, payload);
    assertProviderTransportRedriveReason(row.dead_letter_reason, 'operator');
    result = redriveBlockedDefaultExecutorProviderTransportTask(db, row, payload, {
      trigger: 'operator',
      source: input.source,
      operatorReason,
    });
  } else if (
    isDefaultExecutorDispatchTask(row, payload)
    && row.status === 'dead_letter'
    && row.dead_letter_reason === 'retry_budget_exhausted'
  ) {
    assertDefaultExecutorTask(row, payload);
    result = redriveRetryBudgetDeadLetterDefaultExecutorProviderTask(db, row, payload, {
      source: input.source,
      operatorReason,
    });
  } else if (domainRouteRedriveAuthority(row, payload)) {
    const refsOnlyCheckpoint = refsOnlyCheckpointMissingLaunchAuthorizationForRedrive(db, row.task_id);
    result = refsOnlyCheckpoint
      ? redriveRefsOnlyCheckpointMissingLaunchAuthorizationTask(db, row, payload, {
          source: input.source,
          operatorReason,
        })
      : redriveTerminalProviderTransportTask(db, row, payload, {
          source: input.source,
          operatorReason,
        });
  } else if (paperMissionStageRouteRedriveAuthority(row, payload)) {
    result = redriveTerminalProviderTransportTask(db, row, payload, {
      source: input.source,
      operatorReason,
    });
  } else {
    throwProviderOnlyRedriveBlocked(
      'family-runtime queue redrive requires a blocked provider transport task or retry-budget provider dead-letter.',
      'provider_redrive_authority_missing',
      {
        task_id: row.task_id,
        status: row.status,
        dead_letter_reason: row.dead_letter_reason,
      },
    );
  }
  if (result.redriven) {
    const providerRedriveStarted = 'provider_redrive_started' in result
      ? result.provider_redrive_started
      : null;
    const heldByActiveHold = 'held_by_active_hold' in result
      ? result.held_by_active_hold
      : null;
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'info',
      title: 'Family runtime task redriven',
      body: `${row.domain_id}:${row.task_kind}`,
      payload: {
        status: result.task?.status ?? null,
        operator_reason: operatorReason,
        redriven_stage_attempt_id: result.redriven_stage_attempt?.stage_attempt_id ?? null,
        provider_redrive_started: providerRedriveStarted,
        held_by_active_hold: heldByActiveHold,
      },
    });
  }
  return result;
}
