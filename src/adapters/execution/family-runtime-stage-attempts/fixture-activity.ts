import { DatabaseSync } from 'node:sqlite';

import { buildCodexStageActivityInput } from '../family-runtime-codex-stage-runner.ts';
import {
  type StageAttemptRow,
} from '../family-runtime-stage-attempt-ledger.ts';
import { requireRuntimeExecutionScopeMutationAllowed } from '../family-runtime-execution-scope-persistence.ts';
import {
  appendActivityEventToRow,
  normalizeJsonList,
  nowIso,
} from './shared.ts';
import { inspectStageAttempt } from './inspect.ts';
import { ingestStageAttemptCloseout } from './closeout-ingest.ts';

export function runStageAttemptFixtureActivity(
  db: DatabaseSync,
  input: {
    stageAttemptId: string;
    stagePacketRef?: string | null;
    checkpointRefs?: string[];
    closeoutPacket?: Record<string, unknown>;
  },
) {
  const ownsTransaction = !db.isTransaction;
  try {
    if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
    const attempt = inspectStageAttempt(db, input.stageAttemptId);
    const currentRow = db.prepare('SELECT * FROM stage_attempts WHERE stage_attempt_id = ?').get(
      input.stageAttemptId,
    ) as StageAttemptRow;
    requireRuntimeExecutionScopeMutationAllowed(
      db,
      currentRow as unknown as Record<string, unknown>,
      'run_stage_attempt_fixture_activity',
    );
    const startedAt = nowIso();
    const checkpointRefs = normalizeJsonList(input.checkpointRefs);
  const providerRun = {
    ...attempt.provider_run,
    provider_kind: attempt.provider_kind,
    workflow_id: attempt.workflow_id,
    provider_status: checkpointRefs.length > 0 ? 'checkpointed' : 'running',
    started_at: typeof attempt.provider_run.started_at === 'string' ? attempt.provider_run.started_at : startedAt,
    last_heartbeat_at: startedAt,
  };
  const activityEvents = appendActivityEventToRow(currentRow, {
    activity_kind: 'codex_stage_activity',
    activity_status: checkpointRefs.length > 0 ? 'checkpointed' : 'running',
    stage_packet_ref: input.stagePacketRef ?? null,
    checkpoint_refs: checkpointRefs,
  });
  db.prepare(`
    UPDATE stage_attempts
    SET status = ?, attempt_count = attempt_count + 1, checkpoint_refs_json = ?,
      provider_run_json = ?, activity_events_json = ?, updated_at = ?
    WHERE stage_attempt_id = ?
  `).run(
    checkpointRefs.length > 0 ? 'checkpointed' : 'running',
    JSON.stringify(checkpointRefs),
    JSON.stringify(providerRun),
    JSON.stringify(activityEvents),
    startedAt,
    input.stageAttemptId,
  );
  const runningAttempt = inspectStageAttempt(db, input.stageAttemptId);
  const activity = buildCodexStageActivityInput({
    attempt: runningAttempt,
    stagePacketRef: input.stagePacketRef,
  });
  const closeout = input.closeoutPacket
    ? ingestStageAttemptCloseout(db, {
        stageAttemptId: input.stageAttemptId,
        packet: input.closeoutPacket,
      })
    : null;
  const finalAttempt = inspectStageAttempt(db, input.stageAttemptId);
    const result = {
      provider_fixture_run: {
        provider_completion: closeout ? 'completed' : 'checkpointed',
        domain_ready_verdict: closeout?.closeout.packet.domain_ready_verdict ?? null,
        started_at: startedAt,
      },
      activity,
      attempt_before: attempt,
      attempt: finalAttempt,
      closeout,
    };
    if (ownsTransaction) db.exec('COMMIT');
    return result;
  } catch (error) {
    if (ownsTransaction && db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}
