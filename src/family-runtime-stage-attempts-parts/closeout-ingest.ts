import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../contracts.ts';
import {
  normalizeTypedStageCloseoutPacket,
  type TypedStageCloseoutPacket,
} from '../family-runtime-codex-stage-runner.ts';
import {
  buildFamilyConflictSubject,
  buildReceiptConflictEnvelope,
} from '../family-conflict-envelope.ts';
import {
  type StageAttemptCloseoutRow,
  type StageAttemptRow,
} from '../family-runtime-stage-attempt-ledger.ts';
import { stableId } from '../family-runtime-ids.ts';
import {
  appendActivityEventToRow,
  nowIso,
} from './shared.ts';
import { inspectStageAttempt } from './inspect.ts';

function normalizeRouteImpact(packet: TypedStageCloseoutPacket) {
  const routeImpact = packet.route_impact && typeof packet.route_impact === 'object' && !Array.isArray(packet.route_impact)
    ? packet.route_impact
    : {};
  return {
    ...routeImpact,
    next_owner: packet.next_owner,
    domain_ready_verdict: packet.domain_ready_verdict,
  };
}

export function ingestStageAttemptCloseout(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    packet: TypedStageCloseoutPacket | Record<string, unknown>;
  },
) {
  const attempt = inspectStageAttempt(db, input.stageAttemptId);
  const packet = normalizeTypedStageCloseoutPacket(input.packet);
  const createdAt = nowIso();
  const closeoutId = packet.closeout_id
    ?? stableId('closeout', [input.stageAttemptId, packet.surface_kind, packet.closeout_refs]);
  const packetJson = JSON.stringify(packet);
  const existingCloseout = db.prepare(`
    SELECT * FROM stage_attempt_closeouts WHERE closeout_id = ?
  `).get(closeoutId) as StageAttemptCloseoutRow | undefined;
  if (existingCloseout) {
    if (existingCloseout.stage_attempt_id !== input.stageAttemptId || existingCloseout.packet_json !== packetJson) {
      const subject = buildFamilyConflictSubject({
        domain: attempt.domain_id,
        stageId: attempt.stage_id,
        taskKind: attempt.stage_id,
        sourceFingerprint: attempt.source_fingerprint,
        idempotencyKey: attempt.idempotency_key,
        stageAttemptId: attempt.stage_attempt_id,
        taskId: attempt.task_id,
      });
      throw new FrameworkContractError(
        'contract_shape_invalid',
        'Stage closeout id already exists with a different typed closeout packet.',
        {
          closeout_id: closeoutId,
          stage_attempt_id: input.stageAttemptId,
          existing_stage_attempt_id: existingCloseout.stage_attempt_id,
          required: ['unique closeout_id per typed packet'],
          receipt_conflict: buildReceiptConflictEnvelope({
            subject,
            reason: 'stage_closeout_id_already_exists_with_different_packet',
            evidenceRefs: [
              `opl://stage_attempt_closeouts/${closeoutId}`,
              `opl://stage_attempts/${input.stageAttemptId}`,
            ],
          }),
        },
      );
    }
    return {
      attempt,
      closeout: {
        closeout_id: closeoutId,
        stage_attempt_id: input.stageAttemptId,
        packet,
        created_at: existingCloseout.created_at,
        persisted_count: 1,
        idempotent_noop: true,
      },
    };
  }
  db.prepare(`
    INSERT OR IGNORE INTO stage_attempt_closeouts(closeout_id, stage_attempt_id, packet_json, created_at)
    VALUES (?, ?, ?, ?)
  `).run(closeoutId, input.stageAttemptId, packetJson, createdAt);
  const persistedCloseouts = db.prepare(
    'SELECT COUNT(*) AS count FROM stage_attempt_closeouts WHERE closeout_id = ?',
  ).get(closeoutId) as { count: number };
  const existingCloseoutRefs = Array.isArray(attempt.closeout_refs)
    ? attempt.closeout_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const humanGateRefs = Array.isArray(attempt.human_gate_refs)
    ? attempt.human_gate_refs.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const currentRow = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
    input.stageAttemptId,
  ) as StageAttemptRow;
  const providerRun = {
    ...attempt.provider_run,
    provider_status: 'completed',
    completed_at: createdAt,
    last_heartbeat_at: createdAt,
  };
  const activityEvents = appendActivityEventToRow(currentRow, {
    activity_kind: 'typed_closeout_ingest',
    activity_status: 'completed',
    closeout_id: closeoutId,
    closeout_refs: packet.closeout_refs,
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = 'completed', closeout_refs_json = ?, human_gate_refs_json = ?, blocked_reason = NULL,
      provider_run_json = ?, activity_events_json = ?, route_impact_json = ?, closeout_receipt_status = ?,
      updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    JSON.stringify([...new Set([...existingCloseoutRefs, ...packet.closeout_refs])]),
    JSON.stringify(humanGateRefs),
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    JSON.stringify(normalizeRouteImpact(packet)),
    'accepted_typed_closeout',
    createdAt,
    input.stageAttemptId,
  );
  return {
    attempt: inspectStageAttempt(db, input.stageAttemptId),
    closeout: {
      closeout_id: closeoutId,
      stage_attempt_id: input.stageAttemptId,
      packet,
      created_at: createdAt,
      persisted_count: persistedCloseouts.count,
      idempotent_noop: false,
    },
  };
}
