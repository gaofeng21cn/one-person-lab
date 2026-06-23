import { DatabaseSync } from 'node:sqlite';

import { isPaperMissionStageRouteTask } from '../family-runtime-paper-mission-stage-route-runner.ts';
import { listStageAttemptsForTask } from '../family-runtime-stage-attempts.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  type FamilyRuntimeTaskRow,
} from '../family-runtime-store.ts';

const PAPER_MISSION_STAGE_ROUTE_DOMAIN_GATE_PENDING_REASON = 'paper_mission_stage_route_domain_gate_pending';
const TERMINAL_STAGE_ATTEMPT_STATUSES = new Set(['blocked', 'completed', 'failed', 'dead_lettered']);

type StageAttemptPayload = ReturnType<typeof listStageAttemptsForTask>[number];

function payloadFromTask(row: FamilyRuntimeTaskRow) {
  return JSON.parse(row.payload_json) as Record<string, unknown>;
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
  if (
    attempt.status === 'completed'
    && attempt.closeout_refs.length > 0
    && attempt.closeout_receipt_status === 'accepted_typed_closeout'
    && domainReadyVerdict === 'domain_ready'
  ) {
    return {
      status: 'succeeded' as const,
      reason: 'paper_mission_stage_route_domain_ready',
      deadLetterReason: null,
    };
  }
  if (attempt.status === 'failed' || attempt.status === 'dead_lettered') {
    const reason = attempt.blocked_reason ?? 'paper_mission_stage_route_provider_terminal_failure';
    return {
      status: 'dead_letter' as const,
      reason,
      deadLetterReason: reason,
    };
  }
  const reason = attempt.blocked_reason
    ?? (domainReadyVerdict ? `paper_mission_stage_route_${domainReadyVerdict}` : null)
    ?? PAPER_MISSION_STAGE_ROUTE_DOMAIN_GATE_PENDING_REASON;
  return {
    status: 'blocked' as const,
    reason,
    deadLetterReason: reason,
  };
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
    const nextTask = paperMissionStageRouteTaskStatusForTerminalAttempt(terminalAttempt);
    const reconciledAt = nowIso();
    db.prepare(`
      UPDATE tasks
      SET status = ?, lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ? AND status = 'running'
    `).run(
      nextTask.status,
      nextTask.status === 'succeeded' ? null : nextTask.reason,
      nextTask.deadLetterReason,
      reconciledAt,
      row.task_id,
    );
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
          provider_completion_is_domain_ready: nextTask.status === 'succeeded',
          can_claim_provider_running: false,
          can_claim_paper_progress: false,
        },
      },
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: nextTask.status === 'succeeded' ? 'info' : 'warning',
      title: nextTask.status === 'succeeded'
        ? 'MAS PaperMission stage route terminal readback observed'
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
    reconciledCount += 1;
    reconciledTaskIds.add(row.task_id);
  }
  return { reconciledCount, reconciledTaskIds };
}
