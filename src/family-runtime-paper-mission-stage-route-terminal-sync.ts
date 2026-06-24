import { DatabaseSync } from 'node:sqlite';

import {
  getStageAttemptRow,
  listStageAttemptsForTask,
  stageAttemptToPayload,
  type StageAttemptStatus,
} from './family-runtime-stage-attempt-ledger.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  type FamilyRuntimeTaskRow,
} from './family-runtime-store.ts';

export const PAPER_MISSION_STAGE_ROUTE_TASK_KIND = 'paper_mission/stage-route';
export const PAPER_MISSION_STAGE_ROUTE_RUNTIME_REQUEST_KIND = 'mas_paper_mission_stage_route';

const PAPER_MISSION_STAGE_ROUTE_DOMAIN_GATE_PENDING_REASON = 'paper_mission_stage_route_domain_gate_pending';
const TERMINAL_STAGE_ATTEMPT_STATUSES = new Set<StageAttemptStatus>([
  'blocked',
  'completed',
  'failed',
  'dead_lettered',
]);
const SUPERSEDABLE_PROVIDER_BLOCKERS = new Set([
  'temporal_stage_attempt_completed_missing_typed_closeout',
]);

type StageAttemptPayload = ReturnType<typeof stageAttemptToPayload>;

function payloadFromTask(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as Record<string, unknown>;
}

export function isPaperMissionStageRouteTask(
  row: Pick<FamilyRuntimeTaskRow, 'domain_id' | 'task_kind'>,
  payload: Record<string, unknown>,
) {
  return row.domain_id === 'medautoscience'
    && row.task_kind === PAPER_MISSION_STAGE_ROUTE_TASK_KIND
    && payload.surface_kind === 'opl_mas_paper_mission_route_runtime_request'
    && (
      payload.runtime_request_kind === PAPER_MISSION_STAGE_ROUTE_RUNTIME_REQUEST_KIND
      || payload.runtime_request_kind === undefined
    );
}

function latestLinkedTerminalStageAttempt(row: FamilyRuntimeTaskRow) {
  return (attempt: StageAttemptPayload) => (
    attempt.task_id === row.task_id
    && TERMINAL_STAGE_ATTEMPT_STATUSES.has(attempt.status)
  );
}

function paperMissionStageRouteTaskStatusForTerminalAttempt(attempt: StageAttemptPayload) {
  const routeImpact = attempt.route_impact && typeof attempt.route_impact === 'object'
    ? attempt.route_impact as Record<string, unknown>
    : {};
  const domainReadyVerdict = typeof routeImpact.domain_ready_verdict === 'string'
    ? routeImpact.domain_ready_verdict
    : null;
  if (attempt.status === 'failed' || attempt.status === 'dead_lettered') {
    const reason = attempt.blocked_reason ?? 'paper_mission_stage_route_provider_terminal_failure';
    return {
      status: 'dead_letter' as const,
      reason,
      deadLetterReason: reason,
    };
  }
  const verdictReason = domainReadyVerdict === 'domain_ready'
    ? 'paper_mission_stage_route_domain_authority_required'
    : (domainReadyVerdict ? `paper_mission_stage_route_${domainReadyVerdict}` : null);
  const reason = attempt.blocked_reason
    ?? verdictReason
    ?? PAPER_MISSION_STAGE_ROUTE_DOMAIN_GATE_PENDING_REASON;
  return {
    status: 'blocked' as const,
    reason,
    deadLetterReason: reason,
  };
}

function hasAcceptedTypedCloseout(attempt: StageAttemptPayload) {
  return attempt.status === 'completed'
    && attempt.closeout_receipt_status === 'accepted_typed_closeout'
    && attempt.closeout_refs.some((entry) => typeof entry === 'string' && entry.trim().length > 0);
}

function canReconcilePaperMissionStageRouteTask(
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
) {
  if (row.status === 'running') {
    return true;
  }
  if (row.status !== 'blocked' || !hasAcceptedTypedCloseout(terminalAttempt)) {
    return false;
  }
  const reason = row.dead_letter_reason ?? row.last_error;
  return typeof reason === 'string' && SUPERSEDABLE_PROVIDER_BLOCKERS.has(reason);
}

function reconcilePaperMissionStageRouteTaskRowWithAttempt(
  db: DatabaseSync,
  row: FamilyRuntimeTaskRow,
  terminalAttempt: StageAttemptPayload,
  source: string,
) {
  const payload = payloadFromTask(row);
  if (!isPaperMissionStageRouteTask(row, payload)) {
    return false;
  }
  if (!TERMINAL_STAGE_ATTEMPT_STATUSES.has(terminalAttempt.status)) {
    return false;
  }
  if (!canReconcilePaperMissionStageRouteTask(row, terminalAttempt)) {
    return false;
  }
  const nextTask = paperMissionStageRouteTaskStatusForTerminalAttempt(terminalAttempt);
  const reconciledAt = nowIso();
  const result = db.prepare(`
    UPDATE tasks
    SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
      last_error = ?, dead_letter_reason = ?, updated_at = ?
    WHERE task_id = ? AND status = ?
  `).run(
    nextTask.status,
    nextTask.reason,
    nextTask.deadLetterReason,
    reconciledAt,
    row.task_id,
    row.status,
  );
  if (result.changes === 0) {
    return false;
  }
  insertEvent(db, {
    taskId: row.task_id,
    domainId: row.domain_id,
    eventType: 'paper_mission_stage_route_terminal_task_reconciled',
    source,
    payload: {
      previous_status: row.status,
      next_status: nextTask.status,
      reason: nextTask.reason,
      study_id: payload.study_id ?? null,
      mission_id: payload.mission_id ?? null,
      command_kind: payload.command_kind ?? null,
      route_target: payload.route_target ?? null,
      stage_attempt_id: terminalAttempt.stage_attempt_id,
      stage_attempt_status: terminalAttempt.status,
      provider_status: terminalAttempt.provider_run.provider_status ?? null,
      closeout_refs: terminalAttempt.closeout_refs,
      closeout_receipt_status: terminalAttempt.closeout_receipt_status,
      domain_ready_verdict: terminalAttempt.route_impact.domain_ready_verdict ?? null,
      authority_boundary: {
        opl: 'queue_attempt_terminal_reconciliation_only',
        domain: 'truth_quality_artifact_gate_owner',
        domain_truth_mutation: false,
        publication_quality_mutation: false,
        artifact_gate_mutation: false,
        current_package_mutation: false,
        paper_body_mutation: false,
        owner_receipt_mutation: false,
        typed_blocker_mutation: false,
        human_gate_mutation: false,
        provider_completion_is_domain_ready: false,
        can_claim_provider_running: false,
        can_claim_paper_progress: false,
      },
    },
  });
  insertNotification(db, {
    taskId: row.task_id,
    severity: nextTask.status === 'dead_letter' ? 'error' : 'warning',
    title: nextTask.status === 'dead_letter'
      ? 'MAS PaperMission stage route provider terminal failure observed'
      : 'MAS PaperMission stage route waiting for MAS domain gate',
    body: `${row.domain_id}:${row.task_kind} ${nextTask.reason}`,
    payload: {
      reason: nextTask.reason,
      stage_attempt_id: terminalAttempt.stage_attempt_id,
      closeout_refs: terminalAttempt.closeout_refs,
      can_claim_provider_running: false,
      can_claim_paper_progress: false,
    },
  });
  return true;
}

export function reconcilePaperMissionStageRouteTerminalTaskForAttempt(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    source: string;
  },
) {
  const row = getStageAttemptRow(db, input.stageAttemptId);
  if (!row?.task_id) {
    return { reconciled: false, taskId: null };
  }
  const taskRow = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(row.task_id) as
    | FamilyRuntimeTaskRow
    | undefined;
  if (!taskRow) {
    return { reconciled: false, taskId: row.task_id };
  }
  const reconciled = reconcilePaperMissionStageRouteTaskRowWithAttempt(
    db,
    taskRow,
    stageAttemptToPayload(row),
    input.source,
  );
  return { reconciled, taskId: row.task_id };
}

export function reconcilePaperMissionStageRouteTerminalTasks(
  db: DatabaseSync,
  rows: FamilyRuntimeTaskRow[],
  source: string,
) {
  let reconciledCount = 0;
  const reconciledTaskIds = new Set<string>();
  for (const row of rows) {
    if (row.status !== 'running') {
      continue;
    }
    const payload = payloadFromTask(row);
    if (!isPaperMissionStageRouteTask(row, payload)) {
      continue;
    }
    const terminalAttempt = listStageAttemptsForTask(db, row.task_id).find(
      latestLinkedTerminalStageAttempt(row),
    );
    if (!terminalAttempt) {
      continue;
    }
    if (reconcilePaperMissionStageRouteTaskRowWithAttempt(db, row, terminalAttempt, source)) {
      reconciledCount += 1;
      reconciledTaskIds.add(row.task_id);
    }
  }
  return { reconciledCount, reconciledTaskIds };
}
