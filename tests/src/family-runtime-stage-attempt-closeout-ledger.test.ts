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

test('stage attempt closeout replay repairs accepted attempts that missed closeout refs', () => {
  withStageAttemptDb((db) => {
    const created = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'publication_handoff',
      providerKind: 'local_sqlite',
      workspaceLocator: { workspace_root: '/tmp/mas' },
      sourceFingerprint: 'sha256:handoff',
    });
    const attemptId = created.attempt.stage_attempt_id;
    const packet = {
      surface_kind: 'stage_attempt_closeout_packet',
      closeout_id: 'closeout:publication-handoff-blocker',
      closeout_refs: ['typed-blocker:publication-handoff'],
      consumed_refs: ['evidence:handoff-ledger'],
      next_owner: 'med-autoscience',
      domain_ready_verdict: 'domain_gate_pending',
      route_impact: { route: 'publication_handoff' },
    };

    ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet,
    });
    db.prepare(`
      UPDATE stage_attempts
      SET closeout_refs_json = '[]'
      WHERE stage_attempt_id = ?
    `).run(attemptId);

    const replay = ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet,
    });

    assert.equal(replay.closeout.idempotent_noop, true);
    assert.deepEqual(replay.attempt.closeout_refs, ['typed-blocker:publication-handoff']);
    assert.equal(replay.attempt.closeout_receipt_status, 'accepted_typed_closeout');
    assert.equal(inspectStageAttempt(db, attemptId).activity_events.length, 2);
    assert.equal(listStageAttemptCloseouts(db, attemptId).length, 1);
  });
});

test('stage attempt closeout replay can backfill missing provider run token usage', () => {
  withStageAttemptDb((db) => {
    const created = createStageAttempt(db, {
      domainId: 'medautoscience',
      stageId: 'publication_handoff',
      providerKind: 'local_sqlite',
      workspaceLocator: { workspace_root: '/tmp/mas' },
      sourceFingerprint: 'sha256:handoff-token-backfill',
    });
    const attemptId = created.attempt.stage_attempt_id;
    const packet = {
      surface_kind: 'stage_attempt_closeout_packet',
      closeout_id: 'closeout:publication-handoff-token-backfill',
      closeout_refs: ['typed-blocker:publication-handoff-token-backfill'],
      next_owner: 'med-autoscience',
      domain_ready_verdict: 'domain_gate_pending',
    };

    ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet,
    });
    const replay = ingestStageAttemptCloseout(db, {
      stageAttemptId: attemptId,
      packet,
      costSummary: {
        cost_status: 'observed',
        usage_ref: 'codex_session_usage:backfill#sha256:usage',
        token_usage: {
          input_tokens: 300,
          output_tokens: 90,
          total_tokens: 390,
        },
      },
    });
    const persistedCostSummary = replay.attempt.provider_run.cost_summary as {
      token_usage: { total_tokens: number };
    };

    assert.equal(replay.closeout.idempotent_noop, true);
    assert.equal(persistedCostSummary.token_usage.total_tokens, 390);
    assert.equal(replay.attempt.usage_projection.telemetry_status, 'observed');
    assert.equal(replay.attempt.usage_projection.token.total_tokens_observed, 390);
    assert.equal(inspectStageAttempt(db, attemptId).activity_events.length, 2);
  });
});
