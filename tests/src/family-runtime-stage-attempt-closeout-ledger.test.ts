import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import { FrameworkContractError } from '../../src/contracts.ts';
import {
  createStageAttempt,
  createStageAttemptTable,
  ingestStageAttemptCloseout,
  inspectStageAttempt,
  listStageAttemptCloseouts,
} from '../../src/family-runtime-stage-attempts.ts';

function withStageAttemptDb(fn: (db: DatabaseSync) => void) {
  const db = new DatabaseSync(':memory:');
  try {
    createStageAttemptTable(db);
    fn(db);
  } finally {
    db.close();
  }
}

test('stage attempt closeout ledger is idempotent and fails closed on conflicting closeout ids', () => {
  withStageAttemptDb((db) => {
    const created = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'review',
      providerKind: 'local_sqlite',
      workspaceLocator: { workspace_root: '/tmp/mas' },
      sourceFingerprint: 'sha256:review',
    });
    const attemptId = created.attempt.stage_attempt_id;
    const accepted = ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_id: 'closeout:review-final',
        closeout_refs: ['receipt:review-final'],
        consumed_refs: ['evidence:review-ledger'],
        writeback_receipt_refs: ['memory-writeback:review'],
        rejected_writes: [{ reason: 'domain_router_rejected' }],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: { route: 'review' },
      },
    });
    const replay = ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet: {
        surface_kind: 'stage_attempt_closeout_packet',
        closeout_id: 'closeout:review-final',
        closeout_refs: ['receipt:review-final'],
        consumed_refs: ['evidence:review-ledger'],
        writeback_receipt_refs: ['memory-writeback:review'],
        rejected_writes: [{ reason: 'domain_router_rejected' }],
        next_owner: 'med-autoscience',
        domain_ready_verdict: 'domain_gate_pending',
        route_impact: { route: 'review' },
      },
    });

    assert.equal(accepted.closeout.idempotent_noop, false);
    assert.equal(replay.closeout.idempotent_noop, true);
    assert.equal(listStageAttemptCloseouts(db, attemptId).length, 1);
    assert.equal(inspectStageAttempt(db, attemptId).activity_events.length, 1);

    assert.throws(
      () => ingestStageAttemptCloseout(db, {
        stageAttemptId: attemptId,
        packet: {
          surface_kind: 'stage_attempt_closeout_packet',
          closeout_id: 'closeout:review-final',
          closeout_refs: ['receipt:poisoned-review-final'],
          consumed_refs: ['evidence:poisoned'],
          next_owner: 'med-autoscience',
          domain_ready_verdict: 'domain_gate_pending',
        },
      }),
      (error) => {
        assert.ok(error instanceof FrameworkContractError);
        assert.equal(error.code, 'contract_shape_invalid');
        assert.ok(error.details);
        assert.equal(error.details.closeout_id, 'closeout:review-final');
        assert.equal(
          (error.details.receipt_conflict as Record<string, unknown>).classification,
          'receipt_conflict',
        );
        assert.equal(
          (error.details.receipt_conflict as Record<string, unknown>).fail_closed,
          true,
        );
        return true;
      },
    );

    const attemptAfterConflict = inspectStageAttempt(db, attemptId);
    assert.deepEqual(attemptAfterConflict.closeout_refs, ['receipt:review-final']);
    assert.equal(attemptAfterConflict.activity_events.length, 1);
    assert.equal(listStageAttemptCloseouts(db, attemptId).length, 1);
  });
});
