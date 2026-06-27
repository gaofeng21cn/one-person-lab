import { DatabaseSync } from 'node:sqlite';

import type { FamilyRuntimeTaskScope } from '../family-runtime-command.ts';
import {
  insertEvent,
  insertNotification,
  nowIso,
  type FamilyRuntimeTaskRow,
} from '../family-runtime-store.ts';
import { taskRowMatchesScope } from '../family-runtime-task-scope.ts';
import { isPaperMissionStageRouteTask } from '../family-runtime-paper-mission-stage-route-runner.ts';
import { payloadFromTask } from './default-executor-currentness.ts';

export function blockPaperMissionStageRouteTasksForProviderPreflight(
  db: DatabaseSync,
  input: {
    source: string;
    taskScope?: FamilyRuntimeTaskScope;
    reason: string;
  },
) {
  const blockedAt = nowIso();
  const rows = (db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'queued'
      AND domain_id = 'medautoscience'
      AND task_kind = 'paper_mission/stage-route'
    ORDER BY priority DESC, created_at ASC
  `).all() as FamilyRuntimeTaskRow[]).filter((row) => taskRowMatchesScope(row, input.taskScope));
  const blockedTaskIds: string[] = [];
  for (const row of rows) {
    const payload = payloadFromTask(row);
    if (!isPaperMissionStageRouteTask(row, payload)) {
      continue;
    }
    db.prepare(`
      UPDATE tasks
      SET status = 'blocked', lease_owner = NULL, lease_expires_at = NULL,
        last_error = ?, dead_letter_reason = ?, updated_at = ?
      WHERE task_id = ? AND status = 'queued'
    `).run(
      'paper_mission_stage_route_provider_preflight_blocked',
      input.reason,
      blockedAt,
      row.task_id,
    );
    insertEvent(db, {
      taskId: row.task_id,
      domainId: row.domain_id,
      eventType: 'paper_mission_stage_route_provider_preflight_blocked',
      source: input.source,
      payload: {
        reason: 'paper_mission_stage_route_provider_preflight_blocked',
        blocker_reason: input.reason,
        study_id: payload.study_id ?? null,
        mission_id: payload.mission_id ?? null,
        command_kind: payload.command_kind ?? null,
        route_target: payload.route_target ?? null,
        next_state: 'blocked_provider_preflight',
        authority_boundary: {
          opl: 'provider_preflight_blocker_materialization_only',
          domain: 'truth_quality_artifact_gate_owner',
          domain_truth_mutation: false,
          publication_quality_mutation: false,
          artifact_gate_mutation: false,
          current_package_mutation: false,
          paper_body_mutation: false,
          owner_receipt_mutation: false,
          typed_blocker_mutation: false,
          human_gate_mutation: false,
          provider_stage_attempt_started: false,
          provider_completion_is_domain_ready: false,
          can_claim_provider_running: false,
          can_claim_paper_progress: false,
        },
      },
    });
    insertNotification(db, {
      taskId: row.task_id,
      severity: 'error',
      title: 'MAS PaperMission stage route provider preflight blocked',
      body: `${row.domain_id}:${row.task_kind} ${input.reason}`,
      payload: {
        reason: 'paper_mission_stage_route_provider_preflight_blocked',
        blocker_reason: input.reason,
      },
    });
    blockedTaskIds.push(row.task_id);
  }
  return {
    blockedCount: blockedTaskIds.length,
    blockedTaskIds,
  };
}
