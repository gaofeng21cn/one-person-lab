import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  blockLinkedDefaultExecutorTask,
  markLinkedDefaultExecutorTaskCompleted,
} from '../family-runtime-linked-task-sync.ts';
import {
  type TemporalStageAttemptWorkflowState,
} from '../family-runtime-temporal.ts';
import {
  syncStageAttemptFromTemporalUnavailableObservation,
} from '../family-runtime-temporal-observation-sync.ts';
import {
  getStageAttemptRow,
  parseStageAttemptJsonList,
  parseStageAttemptJsonObject,
  type StageAttemptRow,
} from '../family-runtime-stage-attempt-ledger.ts';
import {
  normalizeTypedStageCloseoutPacket,
} from '../family-runtime-codex-stage-runner.ts';
import {
  appendActivityEventToRow,
  nowIso,
} from './shared.ts';
import { inspectStageAttempt } from './inspect.ts';
import { ingestStageAttemptCloseout } from './closeout-ingest.ts';

type TemporalStageAttemptTerminalObservation = {
  surface_kind: 'temporal_stage_attempt_query_receipt';
  provider_kind: 'temporal';
  stage_attempt_id: string;
  workflow_id: string;
  workflow_status?: string;
  query?: TemporalStageAttemptWorkflowState;
};

function providerRunWithTerminalCompletedObservation(
  row: StageAttemptRow,
  observation: TemporalStageAttemptTerminalObservation,
  observedAt: string,
) {
  return {
    ...parseStageAttemptJsonObject(row.provider_run_json),
    provider_kind: 'temporal',
    workflow_id: observation.workflow_id,
    provider_status: 'completed',
    completed_at: observedAt,
    last_heartbeat_at: observedAt,
    terminal_observation: {
      source: 'temporal_stage_attempt_query',
      workflow_status: observation.workflow_status ?? null,
      query_status: observation.query?.status ?? null,
      reason: 'temporal_stage_attempt_completed_observed',
    },
  };
}

function rowHasCompletedTerminalObservation(row: StageAttemptRow) {
  const terminalObservation = parseStageAttemptJsonObject(row.provider_run_json).terminal_observation;
  if (!terminalObservation || typeof terminalObservation !== 'object' || Array.isArray(terminalObservation)) {
    return false;
  }
  return (terminalObservation as Record<string, unknown>).source === 'temporal_stage_attempt_query'
    && (terminalObservation as Record<string, unknown>).workflow_status === 'COMPLETED'
    && (terminalObservation as Record<string, unknown>).query_status === 'completed';
}

function isTemporalStageAttemptTerminalObservation(
  observation: unknown,
): observation is TemporalStageAttemptTerminalObservation {
  return (
    typeof observation === 'object'
    && observation !== null
    && !Array.isArray(observation)
    && (observation as Record<string, unknown>).surface_kind === 'temporal_stage_attempt_query_receipt'
    && (observation as Record<string, unknown>).provider_kind === 'temporal'
    && typeof (observation as Record<string, unknown>).stage_attempt_id === 'string'
    && typeof (observation as Record<string, unknown>).workflow_id === 'string'
  );
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonRecordFile(filePath: string) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function workspaceRootFromRow(row: StageAttemptRow) {
  const locator = parseStageAttemptJsonObject(row.workspace_locator_json);
  return optionalString(locator.workspace_root) ?? optionalString(locator.repo_root);
}

function studyIdFromRow(row: StageAttemptRow) {
  const locator = parseStageAttemptJsonObject(row.workspace_locator_json);
  return optionalString(locator.study_id) ?? optionalString(locator.quest_id);
}

function defaultExecutorMaterializedCloseoutPath(row: StageAttemptRow) {
  const workspaceRoot = workspaceRootFromRow(row);
  const studyId = studyIdFromRow(row);
  if (
    row.stage_id !== 'domain_owner/default-executor-dispatch'
    || row.executor_kind !== 'codex_cli'
    || !workspaceRoot
    || !studyId
  ) {
    return null;
  }
  return path.join(
    workspaceRoot,
    'studies',
    studyId,
    'artifacts',
    'supervision',
    'consumer',
    'default_executor_execution',
    `${row.stage_attempt_id}.closeout.json`,
  );
}

function sameAttemptMaterializedCloseoutPacket(row: StageAttemptRow) {
  const closeoutPath = defaultExecutorMaterializedCloseoutPath(row);
  if (!closeoutPath || !fs.existsSync(closeoutPath)) {
    return null;
  }
  const packet = readJsonRecordFile(closeoutPath);
  if (!packet || optionalString(packet.stage_attempt_id) !== row.stage_attempt_id) {
    return null;
  }
  const surfaceKind = optionalString(packet.surface_kind);
  if (
    surfaceKind !== 'stage_attempt_closeout_packet'
    && surfaceKind !== 'stage_memory_closeout_packet'
    && surfaceKind !== 'domain_stage_closeout_packet'
  ) {
    return null;
  }
  return packet;
}

export function syncStageAttemptFromMaterializedCloseout(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
  },
) {
  const row = getStageAttemptRow(db, input.stageAttemptId);
  if (!row) {
    return null;
  }
  const packet = sameAttemptMaterializedCloseoutPacket(row);
  if (!packet) {
    return null;
  }
  const synced = ingestStageAttemptCloseout(db, {
    stageAttemptId: input.stageAttemptId,
    packet,
  }).attempt;
  const syncedRow = getStageAttemptRow(db, input.stageAttemptId);
  if (syncedRow) {
    markLinkedDefaultExecutorTaskCompleted(db, {
      row: syncedRow,
      observedAt: nowIso(),
    });
  }
  return synced;
}

function temporalTerminalFailureReason(observation: TemporalStageAttemptTerminalObservation) {
  if (observation.workflow_status === 'FAILED') {
    return 'temporal_workflow_failed';
  }
  if (observation.workflow_status === 'TIMED_OUT') {
    return 'temporal_workflow_timed_out';
  }
  if (observation.workflow_status === 'CANCELED' || observation.workflow_status === 'CANCELLED') {
    return 'temporal_workflow_canceled';
  }
  if (observation.query?.status === 'failed') {
    return 'temporal_stage_attempt_query_failed';
  }
  return null;
}

function temporalNonCompletionBlocker(observation: TemporalStageAttemptTerminalObservation) {
  if (observation.query?.status !== 'blocked') {
    return null;
  }
  const closeoutPacket = observation.query.closeout_packet;
  if (
    closeoutPacket
    && typeof closeoutPacket === 'object'
    && !Array.isArray(closeoutPacket)
    && typeof closeoutPacket.blocked_reason === 'string'
    && closeoutPacket.blocked_reason.trim()
  ) {
    return closeoutPacket.blocked_reason.trim();
  }
  return 'temporal_stage_attempt_not_completed';
}

function taskDeadLetterReasonForTemporalNonCompletionBlocker(blocker: string) {
  return blocker === 'codex_cli_activity_cancelled'
    ? 'temporal_stage_attempt_canceled'
    : 'temporal_stage_attempt_not_completed';
}

function closeoutPacketFromTemporalCompletedObservation(
  observation: TemporalStageAttemptTerminalObservation,
) {
  if (
    observation.workflow_status !== 'COMPLETED'
    || observation.query?.status !== 'completed'
    || observation.query.completion_boundary.provider_completion !== 'completed'
  ) {
    return null;
  }
  const receipt = observation.query.closeout_packet;
  const receiptRecord = typeof receipt === 'object' && receipt !== null && !Array.isArray(receipt)
    ? receipt
    : null;
  const surfaceKind = typeof receiptRecord?.closeout_packet_surface_kind === 'string'
    ? receiptRecord.closeout_packet_surface_kind
    : 'domain_stage_closeout_packet';
  return normalizeTypedStageCloseoutPacket({
    surface_kind: surfaceKind,
    closeout_refs: observation.query.closeout_refs,
    consumed_refs: observation.query.consumed_refs,
    consumed_memory_refs: observation.query.consumed_memory_refs,
    writeback_receipt_refs: observation.query.writeback_receipt_refs,
    rejected_writes: observation.query.rejected_writes,
    next_owner: observation.query.next_owner,
    domain_ready_verdict: observation.query.completion_boundary.domain_ready_verdict,
    route_impact: observation.query.route_impact,
    authority_boundary: {
      opl: 'temporal_closeout_transport_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  });
}

export function syncStageAttemptFromTemporalTerminalObservation(
  db: DatabaseSync,
  observation: unknown,
) {
  if (!isTemporalStageAttemptTerminalObservation(observation)) {
    return syncStageAttemptFromTemporalUnavailableObservation(db, observation);
  }
  const failureReason = temporalTerminalFailureReason(observation);
  const nonCompletionBlocker = temporalNonCompletionBlocker(observation);
  const row = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    observation.stage_attempt_id,
  ) as StageAttemptRow | undefined;
  if (!row || row.provider_kind !== 'temporal' || row.workflow_id !== observation.workflow_id) {
    return null;
  }
  const completedCloseoutPacket = closeoutPacketFromTemporalCompletedObservation(observation);
  if (row.status === 'completed' && row.closeout_receipt_status) {
    const existingCloseoutRefs = parseStageAttemptJsonList(row.closeout_refs_json)
      .filter((entry): entry is string => typeof entry === 'string');
    const terminalCloseoutRefs = completedCloseoutPacket?.closeout_refs ?? [];
    const hasNewTerminalCloseoutRef = terminalCloseoutRefs.some((ref) =>
      !existingCloseoutRefs.includes(ref)
    );
    if (completedCloseoutPacket && hasNewTerminalCloseoutRef) {
      const synced = ingestStageAttemptCloseout(db, {
        stageAttemptId: observation.stage_attempt_id,
        packet: completedCloseoutPacket,
      }).attempt;
      const syncedRow = getStageAttemptRow(db, observation.stage_attempt_id);
      if (syncedRow) {
        markLinkedDefaultExecutorTaskCompleted(db, {
          row: syncedRow,
          observedAt: nowIso(),
        });
      }
      return synced;
    }
    if (rowHasCompletedTerminalObservation(row)) {
      markLinkedDefaultExecutorTaskCompleted(db, { row, observedAt: nowIso() });
      return null;
    }
    const observedAt = nowIso();
    const providerRun = providerRunWithTerminalCompletedObservation(row, observation, observedAt);
    db.prepare(`
      UPDATE stage_attempts
      SET provider_run_json = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(JSON.stringify(providerRun), observedAt, observation.stage_attempt_id);
    markLinkedDefaultExecutorTaskCompleted(db, { row, observedAt });
    return inspectStageAttempt(db, observation.stage_attempt_id);
  }
  if (!failureReason && !nonCompletionBlocker && !completedCloseoutPacket) {
    return null;
  }
  if (completedCloseoutPacket) {
    const synced = ingestStageAttemptCloseout(db, {
      stageAttemptId: observation.stage_attempt_id,
      packet: completedCloseoutPacket,
    }).attempt;
    const syncedRow = getStageAttemptRow(db, observation.stage_attempt_id);
    if (syncedRow) {
      markLinkedDefaultExecutorTaskCompleted(db, {
        row: syncedRow,
        observedAt: nowIso(),
      });
    }
    return synced;
  }
  const observedAt = nowIso();
  if (nonCompletionBlocker && row.status !== 'completed') {
    const providerRun = {
      ...parseStageAttemptJsonObject(row.provider_run_json),
      provider_kind: 'temporal',
      workflow_id: observation.workflow_id,
      provider_status: 'blocked',
      completed_at: observedAt,
      last_heartbeat_at: observedAt,
      terminal_observation: {
        source: 'temporal_stage_attempt_query',
        workflow_status: observation.workflow_status ?? null,
        query_status: observation.query?.status ?? null,
        reason: nonCompletionBlocker,
      },
    };
    const activityEvents = appendActivityEventToRow(row, {
      activity_kind: 'temporal_stage_attempt_terminal_observation',
      activity_status: 'blocked',
      workflow_status: observation.workflow_status ?? null,
      query_status: observation.query?.status ?? null,
      reason: nonCompletionBlocker,
      authority_boundary: {
        opl: 'provider_transport_status_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'blocked', blocked_reason = ?, provider_run_json = ?, activity_events_json = ?,
        closeout_receipt_status = NULL, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      nonCompletionBlocker,
      JSON.stringify(providerRun),
      JSON.stringify(activityEvents),
      observedAt,
      observation.stage_attempt_id,
    );
    blockLinkedDefaultExecutorTask(db, {
      row,
      reason: nonCompletionBlocker,
      observedAt,
      taskDeadLetterReason: taskDeadLetterReasonForTemporalNonCompletionBlocker(nonCompletionBlocker),
      eventType: 'stage_attempt_terminal_blocked_task',
    });
    return inspectStageAttempt(db, observation.stage_attempt_id);
  }
  if (!failureReason) {
    return null;
  }
  const failureProviderStatus = failureReason === 'temporal_workflow_canceled' ? 'canceled' : 'failed';
  const failureEventStatus = failureReason === 'temporal_workflow_canceled' ? 'canceled' : 'failed';
  const taskDeadLetterReason = failureReason === 'temporal_workflow_canceled'
    ? 'temporal_stage_attempt_canceled'
    : 'temporal_stage_attempt_failed';
  const taskEventType = failureReason === 'temporal_workflow_canceled'
    ? 'stage_attempt_terminal_canceled_task'
    : 'stage_attempt_terminal_failed_task';
  const providerRun = {
    ...parseStageAttemptJsonObject(row.provider_run_json),
    provider_kind: 'temporal',
    workflow_id: observation.workflow_id,
    provider_status: failureProviderStatus,
    completed_at: observedAt,
    last_heartbeat_at: observedAt,
    terminal_observation: {
      source: 'temporal_stage_attempt_query',
      workflow_status: observation.workflow_status ?? null,
      query_status: observation.query?.status ?? null,
      reason: failureReason,
    },
  };
  const activityEvents = appendActivityEventToRow(row, {
    activity_kind: 'temporal_stage_attempt_terminal_observation',
    activity_status: failureEventStatus,
    workflow_status: observation.workflow_status ?? null,
    query_status: observation.query?.status ?? null,
    reason: failureReason,
    authority_boundary: {
      opl: 'provider_transport_status_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = 'failed', blocked_reason = ?, provider_run_json = ?, activity_events_json = ?,
      closeout_receipt_status = NULL, updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    failureReason,
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    observedAt,
    observation.stage_attempt_id,
  );
  blockLinkedDefaultExecutorTask(db, {
    row,
    reason: failureReason,
    observedAt,
    taskDeadLetterReason,
    eventType: taskEventType,
  });
  return inspectStageAttempt(db, observation.stage_attempt_id);
}
