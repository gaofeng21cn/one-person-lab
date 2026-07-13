import { DatabaseSync } from 'node:sqlite';

import type {
  TemporalStageAttemptSignalKind,
} from '../family-runtime-types.ts';
import {
  parseStageAttemptJsonObject,
  stageAttemptSignalToPayload,
  type StageAttemptRow,
  type StageAttemptSignalRow,
} from '../family-runtime-stage-attempt-ledger.ts';
import { stableId } from '../../../kernel/stable-id.ts';
import {
  appendActivityEventToRow,
  normalizeJsonList,
  nowIso,
} from './shared.ts';
import { inspectStageAttempt } from './inspect.ts';

export function signalStageAttempt(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    signalKind: TemporalStageAttemptSignalKind;
    payload: Record<string, unknown>;
    source?: string;
  },
) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  const createdAt = nowIso();
  const signal = {
    signal_id: stableId('sig', [input.stageAttemptId, input.signalKind, input.payload, createdAt]),
    stage_attempt_id: input.stageAttemptId,
    signal_kind: input.signalKind,
    payload_json: JSON.stringify(input.payload),
    source: input.source?.trim() || 'opl-cli',
    created_at: createdAt,
  };
  db.prepare(`
    INSERT INTO stage_attempt_signals(signal_id, stage_attempt_id, signal_kind, payload_json, source, created_at)
    VALUES (@signal_id, @stage_attempt_id, @signal_kind, @payload_json, @source, @created_at)
  `).run(signal);

  if (input.signalKind === 'human_gate') {
    const currentHumanGateRefs = Array.isArray(attempt.human_gate_refs)
      ? attempt.human_gate_refs.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const humanGateRef = typeof input.payload.human_gate_ref === 'string'
      ? input.payload.human_gate_ref
      : signal.signal_id;
    db.prepare(`
      UPDATE stage_attempts
      SET status = 'human_gate', human_gate_refs_json = ?, blocked_reason = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify([...new Set([...currentHumanGateRefs, humanGateRef])]),
      typeof input.payload.reason === 'string' ? input.payload.reason : 'human_gate_signal_received',
      createdAt,
      input.stageAttemptId,
    );
  } else if (input.signalKind === 'resume') {
    db.prepare(`
      UPDATE stage_attempts
      SET status = CASE WHEN status IN ('human_gate', 'blocked', 'failed') THEN 'queued' ELSE status END,
        blocked_reason = NULL, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(createdAt, input.stageAttemptId);
  } else if (input.signalKind === 'user_instruction') {
    db.prepare(`
      UPDATE stage_attempts
      SET provider_run_json = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify({
        ...attempt.provider_run,
        last_user_instruction_signal_id: signal.signal_id,
        last_user_instruction_at: createdAt,
      }),
      createdAt,
      input.stageAttemptId,
    );
  } else if (input.signalKind === 'owner_receipt') {
    db.prepare(`
      UPDATE stage_attempts
      SET provider_run_json = ?, updated_at = ?
      WHERE stage_attempt_id = ?
    `).run(
      JSON.stringify({
        ...attempt.provider_run,
        last_owner_receipt_signal_id: signal.signal_id,
        last_owner_receipt_ref: typeof input.payload.owner_receipt_ref === 'string'
          ? input.payload.owner_receipt_ref
          : null,
        last_owner_receipt_at: createdAt,
        owner_receipt_signal_is_ref_only: true,
      }),
      createdAt,
      input.stageAttemptId,
    );
  }

  return {
    attempt: inspectStageAttempt(db, input.stageAttemptId),
    signal: stageAttemptSignalToPayload(signal as StageAttemptSignalRow),
  };
}

export function recordStageAttemptActivityHeartbeat(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    heartbeatKind: string;
    runnerEventKind?: string | null;
    executionSessionRef?: string | null;
    checkpointRefs?: string[];
    observedAt?: string | null;
  },
) {
  const row = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as StageAttemptRow | undefined;
  if (!row) {
    return null;
  }
  const observedAt = input.observedAt ?? nowIso();
  const executionSessionRef = input.executionSessionRef?.trim() || null;
  if (
    row.execution_session_ref
    && executionSessionRef
    && row.execution_session_ref !== executionSessionRef
  ) {
    throw new Error(
      `StageAttempt execution session drift: ${row.execution_session_ref} != ${executionSessionRef}`,
    );
  }
  const providerRun = {
    ...parseStageAttemptJsonObject(row.provider_run_json),
    last_heartbeat_at: observedAt,
    liveness_source: 'provider_activity_event',
    last_activity_heartbeat_kind: input.heartbeatKind,
    last_runner_event_kind: input.runnerEventKind ?? null,
    execution_session_ref: row.execution_session_ref ?? executionSessionRef,
  };
  const activityEvents = appendActivityEventToRow(row, {
    event_time: observedAt,
    activity_kind: 'codex_stage_activity',
    activity_status: 'running',
    heartbeat_kind: input.heartbeatKind,
    runner_event_kind: input.runnerEventKind ?? null,
    execution_session_ref: row.execution_session_ref ?? executionSessionRef,
    checkpoint_refs: normalizeJsonList(input.checkpointRefs),
    authority_boundary: {
      opl: 'provider_activity_liveness_projection_only',
      domain: 'truth_quality_artifact_gate_owner',
      provider_completion_is_domain_ready: false,
    },
  });
  db.prepare(`
    UPDATE stage_attempts
    SET execution_session_ref = COALESCE(execution_session_ref, ?),
      provider_run_json = ?, activity_events_json = ?, updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    executionSessionRef,
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    observedAt,
    input.stageAttemptId,
  );
  return inspectStageAttempt(db, input.stageAttemptId);
}
