import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../src/modules/charter/contracts.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  ingestStageAttemptCloseout,
  inspectStageAttempt,
  listStageAttemptCloseouts,
} from '../../src/modules/runway/family-runtime-stage-attempts.ts';

function withAttempt(fn: (db: DatabaseSync, attemptId: string) => void) {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    const attempt = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'publication_handoff',
      providerKind: 'temporal',
      workspaceLocator: { workspace_root: '/tmp/mas' },
      sourceFingerprint: 'sha256:handoff',
    }).attempt;
    fn(db, attempt.stage_attempt_id);
  } finally {
    db.close();
  }
}

function closeoutPacket(closeoutRef = 'receipt:publication-handoff') {
  return {
    surface_kind: 'stage_attempt_closeout_packet',
    closeout_id: 'closeout:publication-handoff',
    closeout_refs: [closeoutRef],
    consumed_refs: ['evidence:handoff-ledger'],
    next_owner: 'med-autoscience',
    domain_ready_verdict: 'domain_gate_pending',
  };
}

test('stage attempt closeout replay is idempotent and conflicting receipts fail closed', () => {
  withAttempt((db, attemptId) => {
    const accepted = ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet: closeoutPacket(),
    });
    const replay = ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet: closeoutPacket(),
    });

    assert.equal(accepted.closeout.idempotent_noop, false);
    assert.equal(replay.closeout.idempotent_noop, true);
    assert.equal(listStageAttemptCloseouts(db, attemptId).length, 1);
    assert.throws(
      () => ingestStageAttemptCloseout(db, {
        stageAttemptId: attemptId,
        packet: closeoutPacket('receipt:conflicting'),
      }),
      (error) => error instanceof FrameworkContractError
        && error.details?.receipt_conflict instanceof Object
        && (error.details.receipt_conflict as Record<string, unknown>).fail_closed === true,
    );
    assert.deepEqual(inspectStageAttempt(db, attemptId).closeout_refs, ['receipt:publication-handoff']);
  });
});

test('stage attempt closeout replay repairs a persisted attempt missing closeout refs', () => {
  withAttempt((db, attemptId) => {
    ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet: closeoutPacket(),
    });
    db.prepare("UPDATE stage_attempts SET closeout_refs_json = '[]' WHERE stage_attempt_id = ?").run(attemptId);

    const replay = ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet: closeoutPacket(),
    });

    assert.equal(replay.closeout.idempotent_noop, true);
    assert.deepEqual(replay.attempt.closeout_refs, ['receipt:publication-handoff']);
    assert.equal(replay.attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(listStageAttemptCloseouts(db, attemptId).length, 1);
  });
});
