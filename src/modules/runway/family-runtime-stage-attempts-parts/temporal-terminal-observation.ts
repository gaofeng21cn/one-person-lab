import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { readJsonPayloadFile } from '../../../kernel/json-file.ts';
import {
  record,
  recordList,
  stringList,
  stringValue,
} from '../../../kernel/json-record.ts';
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
import {
  reconcileDomainRouteTerminalTaskForAttempt,
} from '../family-runtime-domain-route-terminal-sync.ts';
import { isRuntimeHardStopReason } from '../../../kernel/progress-hard-stop-policy.ts';

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
  costSummary?: Record<string, unknown> | null,
) {
  return {
    ...parseStageAttemptJsonObject(row.provider_run_json),
    provider_kind: 'temporal',
    workflow_id: observation.workflow_id,
    provider_status: 'completed',
    completed_at: observedAt,
    last_heartbeat_at: observedAt,
    ...(costSummary ? { cost_summary: costSummary } : {}),
    terminal_observation: {
      source: 'temporal_stage_attempt_query',
      workflow_status: observation.workflow_status ?? null,
      query_status: observation.query?.status ?? null,
      reason: 'temporal_stage_attempt_completed_observed',
    },
  };
}

function rowHasCompletedTerminalObservation(row: StageAttemptRow) {
  const terminalObservation = recordOrNull(parseStageAttemptJsonObject(row.provider_run_json).terminal_observation);
  if (!terminalObservation) {
    return false;
  }
  return terminalObservation.source === 'temporal_stage_attempt_query'
    && terminalObservation.workflow_status === 'COMPLETED'
    && terminalObservation.query_status === 'completed';
}

function isTemporalStageAttemptTerminalObservation(
  observation: unknown,
): observation is TemporalStageAttemptTerminalObservation {
  const payload = recordOrNull(observation);
  return (
    payload?.surface_kind === 'temporal_stage_attempt_query_receipt'
    && payload.provider_kind === 'temporal'
    && typeof payload.stage_attempt_id === 'string'
    && typeof payload.workflow_id === 'string'
  );
}

function executionSessionRefFromObservation(observation: TemporalStageAttemptTerminalObservation) {
  const events = observation.query?.activity_events ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = recordOrNull(events[index]);
    if (event?.activity_kind !== 'codex_stage_activity') continue;
    const progress = recordOrNull(event.progress_summary);
    const explicit = stringValue(progress?.execution_session_ref);
    if (explicit) return explicit;
    const threadId = stringValue(progress?.thread_id);
    if (threadId) return `codex://threads/${threadId}`;
  }
  return null;
}

function persistExecutionSessionRef(
  db: DatabaseSync,
  row: StageAttemptRow,
  observation: TemporalStageAttemptTerminalObservation,
) {
  const executionSessionRef = executionSessionRefFromObservation(observation);
  if (!executionSessionRef) return;
  if (row.execution_session_ref && row.execution_session_ref !== executionSessionRef) {
    throw new Error(`StageAttempt execution session drift: ${row.execution_session_ref} != ${executionSessionRef}`);
  }
  db.prepare(`
    UPDATE stage_attempts SET execution_session_ref = ?, updated_at = ? WHERE stage_attempt_id = ?
  `).run(executionSessionRef, nowIso(), row.stage_attempt_id);
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  const payload = record(value);
  return payload === value ? payload : null;
}

function readJsonRecordFile(filePath: string) {
  try {
    return recordOrNull(readJsonPayloadFile(filePath));
  } catch {
    return null;
  }
}

function workspaceRootFromRow(row: StageAttemptRow) {
  const locator = parseStageAttemptJsonObject(row.workspace_locator_json);
  return stringValue(locator.workspace_root) ?? stringValue(locator.repo_root);
}

function studyIdFromRow(row: StageAttemptRow) {
  const locator = parseStageAttemptJsonObject(row.workspace_locator_json);
  return stringValue(locator.study_id) ?? stringValue(locator.quest_id);
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
  if (!packet || stringValue(packet.stage_attempt_id) !== row.stage_attempt_id) {
    return null;
  }
  const surfaceKind = stringValue(packet.surface_kind);
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
  const blocker = stringValue(record(closeoutPacket).blocked_reason);
  if (blocker) {
    return blocker;
  }
  return 'temporal_stage_attempt_not_completed';
}

function progressDiagnosticPacketFromTemporalBlocker(input: {
  observation: TemporalStageAttemptTerminalObservation;
  row: StageAttemptRow;
  blocker: string;
}) {
  const projected = blockedCloseoutProjectionFromTemporalObservation(input.observation);
  const diagnosticRef = `opl://stage-attempts/${
    input.observation.stage_attempt_id
  }/quality-debt-diagnostics/${encodeURIComponent(input.blocker)}`;
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_refs: [...new Set([...(projected?.closeout_refs ?? []), diagnosticRef])],
    consumed_refs: projected?.consumed_refs ?? [],
    consumed_memory_refs: projected?.consumed_memory_refs ?? [],
    writeback_receipt_refs: projected?.writeback_receipt_refs ?? [],
    rejected_writes: [],
    next_owner: input.row.domain_id,
    domain_ready_verdict: null,
    route_impact: {
      ...(projected?.route_impact ?? {}),
      progression_effect: 'next_stage_may_start',
      quality_debt_refs: [diagnosticRef],
      provider_quality_debt_reason: input.blocker,
      provider_quality_debt_diagnostic_ref: diagnosticRef,
    },
    authority_boundary: {
      opl: 'provider_quality_debt_diagnostic_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
    },
  };
}

function reconcileDomainRouteTerminalObservation(db: DatabaseSync, stageAttemptId: string) {
  reconcileDomainRouteTerminalTaskForAttempt(db, {
    stageAttemptId,
    source: 'temporal-terminal-observation:domain-route-terminal',
  });
}

function taskDeadLetterReasonForTemporalNonCompletionBlocker(blocker: string) {
  return blocker === 'codex_cli_activity_cancelled'
    ? 'temporal_stage_attempt_canceled'
    : 'temporal_stage_attempt_not_completed';
}

function latestActivityCostSummaryFromTemporalObservation(
  observation: TemporalStageAttemptTerminalObservation,
) {
  const activityEvents = recordList(observation.query?.activity_events);
  const costSummaries = activityEvents
    .map((event) => recordOrNull(event.cost_summary))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  return costSummaries.at(-1) ?? null;
}

function blockedCloseoutProjectionFromTemporalObservation(
  observation: TemporalStageAttemptTerminalObservation,
) {
  if (observation.query?.status !== 'blocked') {
    return null;
  }
  const closeoutRefs = stringList(observation.query.closeout_refs);
  if (closeoutRefs.length === 0) {
    return null;
  }
  return {
    closeout_refs: closeoutRefs,
    consumed_refs: stringList(observation.query.consumed_refs),
    consumed_memory_refs: stringList(observation.query.consumed_memory_refs),
    writeback_receipt_refs: stringList(observation.query.writeback_receipt_refs),
    rejected_writes: recordList(observation.query.rejected_writes),
    route_impact: record(observation.query.route_impact),
  };
}

function mergeRouteImpact(
  row: StageAttemptRow,
  projection: ReturnType<typeof blockedCloseoutProjectionFromTemporalObservation>,
) {
  return {
    ...parseStageAttemptJsonObject(row.route_impact_json),
    ...(projection?.route_impact ?? {}),
  };
}

function mergeCloseoutRefs(
  row: StageAttemptRow,
  projection: ReturnType<typeof blockedCloseoutProjectionFromTemporalObservation>,
) {
  return [
    ...new Set([
      ...parseStageAttemptJsonList(row.closeout_refs_json)
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0),
      ...(projection?.closeout_refs ?? []),
    ]),
  ];
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
  const observedCloseoutRefs = Array.isArray(observation.query.closeout_refs)
    ? observation.query.closeout_refs.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
  const diagnosticRef = `opl://stage-attempts/${observation.stage_attempt_id}/no-output-diagnostic`;
  const closeoutRefs = observedCloseoutRefs.length > 0 ? observedCloseoutRefs : [diagnosticRef];
  const receipt = observation.query.closeout_packet;
  const receiptRecord = typeof receipt === 'object' && receipt !== null && !Array.isArray(receipt)
    ? receipt
    : null;
  const surfaceKind = typeof receiptRecord?.closeout_packet_surface_kind === 'string'
    ? receiptRecord.closeout_packet_surface_kind
    : observedCloseoutRefs.length > 0
      ? 'domain_stage_closeout_packet'
      : 'stage_attempt_closeout_packet';
  return normalizeTypedStageCloseoutPacket({
    surface_kind: surfaceKind,
    closeout_refs: closeoutRefs,
    consumed_refs: observation.query.consumed_refs,
    consumed_memory_refs: observation.query.consumed_memory_refs,
    writeback_receipt_refs: observation.query.writeback_receipt_refs,
    rejected_writes: observation.query.rejected_writes,
    next_owner: observation.query.next_owner,
    domain_ready_verdict: observation.query.completion_boundary.domain_ready_verdict,
    route_impact: observedCloseoutRefs.length > 0
      ? observation.query.route_impact
      : {
          ...record(observation.query.route_impact),
          progression_effect: 'next_stage_may_start',
          quality_debt_refs: [diagnosticRef],
          no_output_diagnostic_ref: diagnosticRef,
        },
    closeout_ref_metadata: receiptRecord?.closeout_ref_metadata,
    domain_output: receiptRecord?.domain_output,
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
  persistExecutionSessionRef(db, row, observation);
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
        costSummary: latestActivityCostSummaryFromTemporalObservation(observation),
      }).attempt;
      const syncedRow = getStageAttemptRow(db, observation.stage_attempt_id);
      if (syncedRow) {
        markLinkedDefaultExecutorTaskCompleted(db, {
          row: syncedRow,
          observedAt: nowIso(),
        });
      }
      reconcileDomainRouteTerminalObservation(db, observation.stage_attempt_id);
      return synced;
    }
    const costSummary = latestActivityCostSummaryFromTemporalObservation(observation);
    const existingProviderRun = parseStageAttemptJsonObject(row.provider_run_json);
    if (rowHasCompletedTerminalObservation(row) && (!costSummary || recordOrNull(existingProviderRun.cost_summary))) {
      markLinkedDefaultExecutorTaskCompleted(db, { row, observedAt: nowIso() });
      reconcileDomainRouteTerminalObservation(db, observation.stage_attempt_id);
      return null;
    }
    const observedAt = nowIso();
    const providerRun = providerRunWithTerminalCompletedObservation(row, observation, observedAt, costSummary);
    db.prepare(`
      UPDATE stage_attempts
      SET provider_run_json = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(JSON.stringify(providerRun), observedAt, observation.stage_attempt_id);
    markLinkedDefaultExecutorTaskCompleted(db, { row, observedAt });
    reconcileDomainRouteTerminalObservation(db, observation.stage_attempt_id);
    return inspectStageAttempt(db, observation.stage_attempt_id);
  }
  if (!failureReason && !nonCompletionBlocker && !completedCloseoutPacket) {
    return null;
  }
  if (completedCloseoutPacket) {
    const synced = ingestStageAttemptCloseout(db, {
      stageAttemptId: observation.stage_attempt_id,
      packet: completedCloseoutPacket,
      costSummary: latestActivityCostSummaryFromTemporalObservation(observation),
    }).attempt;
    const syncedRow = getStageAttemptRow(db, observation.stage_attempt_id);
    if (syncedRow) {
      markLinkedDefaultExecutorTaskCompleted(db, {
        row: syncedRow,
        observedAt: nowIso(),
      });
    }
    reconcileDomainRouteTerminalObservation(db, observation.stage_attempt_id);
    return synced;
  }
  const observedAt = nowIso();
  if (nonCompletionBlocker && !isRuntimeHardStopReason(nonCompletionBlocker)) {
    const synced = ingestStageAttemptCloseout(db, {
      stageAttemptId: observation.stage_attempt_id,
      packet: progressDiagnosticPacketFromTemporalBlocker({
        observation,
        row,
        blocker: nonCompletionBlocker,
      }),
      costSummary: latestActivityCostSummaryFromTemporalObservation(observation),
    }).attempt;
    const syncedRow = getStageAttemptRow(db, observation.stage_attempt_id);
    if (syncedRow) {
      markLinkedDefaultExecutorTaskCompleted(db, { row: syncedRow, observedAt });
    }
    reconcileDomainRouteTerminalObservation(db, observation.stage_attempt_id);
    return synced;
  }
  if (nonCompletionBlocker && row.status !== 'completed') {
    const blockedCloseoutProjection = blockedCloseoutProjectionFromTemporalObservation(observation);
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
        ...(blockedCloseoutProjection
          ? { closeout_refs: blockedCloseoutProjection.closeout_refs }
          : {}),
      },
    };
    const activityEvents = appendActivityEventToRow(row, {
      activity_kind: 'temporal_stage_attempt_terminal_observation',
      activity_status: 'blocked',
      workflow_status: observation.workflow_status ?? null,
      query_status: observation.query?.status ?? null,
      reason: nonCompletionBlocker,
      ...(blockedCloseoutProjection
        ? {
            closeout_refs: blockedCloseoutProjection.closeout_refs,
            consumed_refs: blockedCloseoutProjection.consumed_refs,
            consumed_memory_refs: blockedCloseoutProjection.consumed_memory_refs,
            writeback_receipt_refs: blockedCloseoutProjection.writeback_receipt_refs,
            rejected_writes: blockedCloseoutProjection.rejected_writes,
            route_impact: blockedCloseoutProjection.route_impact,
          }
        : {}),
      authority_boundary: {
        opl: 'provider_transport_status_projection_only',
        domain: 'truth_quality_artifact_gate_owner',
        provider_completion_is_domain_ready: false,
      },
    });
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'blocked', blocked_reason = ?, closeout_refs_json = ?, provider_run_json = ?,
        activity_events_json = ?, route_impact_json = ?, closeout_receipt_status = NULL, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      nonCompletionBlocker,
      JSON.stringify(mergeCloseoutRefs(row, blockedCloseoutProjection)),
      JSON.stringify(providerRun),
      JSON.stringify(activityEvents),
      JSON.stringify(mergeRouteImpact(row, blockedCloseoutProjection)),
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
    reconcileDomainRouteTerminalObservation(db, observation.stage_attempt_id);
    return inspectStageAttempt(db, observation.stage_attempt_id);
  }
  if (!failureReason) {
    return null;
  }
  if (failureReason !== 'temporal_workflow_canceled') {
    const diagnosticRef = `opl://stage-attempts/${observation.stage_attempt_id}/failure-diagnostic`;
    ingestStageAttemptCloseout(db, {
      stageAttemptId: observation.stage_attempt_id,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_refs: [diagnosticRef],
        consumed_refs: [],
        consumed_memory_refs: [],
        writeback_receipt_refs: [],
        rejected_writes: [],
        next_owner: row.domain_id,
        domain_ready_verdict: null,
        route_impact: {
          progression_effect: 'next_stage_may_start',
          quality_debt_refs: [diagnosticRef],
          provider_failure_reason: failureReason,
          failure_diagnostic_ref: diagnosticRef,
        },
        authority_boundary: {
          opl: 'provider_failure_diagnostic_projection_only',
          domain: 'truth_quality_artifact_gate_owner',
        },
      },
      costSummary: latestActivityCostSummaryFromTemporalObservation(observation),
    });
    const providerRun = {
      ...parseStageAttemptJsonObject(row.provider_run_json),
      provider_kind: 'temporal',
      workflow_id: observation.workflow_id,
      provider_status: 'failed_with_progress_diagnostic',
      completed_at: observedAt,
      last_heartbeat_at: observedAt,
      terminal_observation: {
        source: 'temporal_stage_attempt_query',
        workflow_status: observation.workflow_status ?? null,
        query_status: observation.query?.status ?? null,
        reason: failureReason,
        progress_diagnostic_ref: diagnosticRef,
      },
    };
    db.prepare(`
      UPDATE stage_attempts
      SET provider_run_json = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(JSON.stringify(providerRun), observedAt, observation.stage_attempt_id);
    const syncedRow = getStageAttemptRow(db, observation.stage_attempt_id);
    if (syncedRow) {
      markLinkedDefaultExecutorTaskCompleted(db, { row: syncedRow, observedAt });
    }
    reconcileDomainRouteTerminalObservation(db, observation.stage_attempt_id);
    return inspectStageAttempt(db, observation.stage_attempt_id);
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
  reconcileDomainRouteTerminalObservation(db, observation.stage_attempt_id);
  return inspectStageAttempt(db, observation.stage_attempt_id);
}
