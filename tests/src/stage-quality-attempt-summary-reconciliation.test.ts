import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reconcileProjectedAttemptSummary,
  requireProjectedAttemptSummaryMatchesPersisted,
} from '../../src/adapters/execution/family-runtime-stage-quality-cycle-attempt-identity.ts';
import type { TemporalStageRunAttemptSummary } from '../../src/adapters/execution/family-runtime-temporal-stage-run.ts';

const SESSION = 'codex://threads/01a211c2-d150-71b2-8d08-e01f905dfe54';

function summary(overrides: Partial<TemporalStageRunAttemptSummary> = {}): TemporalStageRunAttemptSummary {
  return {
    attempt_role: 'producer',
    quality_round_index: 0,
    stage_attempt_id: 'sat_test',
    workflow_id: 'wf_test',
    execution_session_ref: SESSION,
    artifact_producer_attempt_ref: null,
    status: 'completed',
    artifact_refs: [],
    artifact_hashes: [],
    artifact_identity_receipt_refs: [],
    ...overrides,
  };
}

function persisted(overrides: Record<string, unknown> = {}) {
  return {
    attempt_role: 'producer',
    quality_round_index: 0,
    stage_attempt_id: 'sat_test',
    workflow_id: 'wf_test',
    execution_session_ref: SESSION,
    context_manifest_json: null,
    status: 'completed',
    ...overrides,
  };
}

test('an agreeing summary passes through untouched', () => {
  const value = summary();
  assert.deepEqual(reconcileProjectedAttemptSummary(value, persisted()), value);
  assert.doesNotThrow(() => requireProjectedAttemptSummaryMatchesPersisted(value, persisted()));
});

test('an Attempt the ledger completed survives the workflow losing the activity result', () => {
  // The codex activity was cancelled, so the workflow never received its result and
  // recorded `failed`. The durable row holds the session and the closeout.
  const lost = summary({ status: 'failed', execution_session_ref: null });
  const reconciled = reconcileProjectedAttemptSummary(lost, persisted());
  assert.equal(reconciled.status, 'completed');
  assert.equal(reconciled.execution_session_ref, SESSION);
  assert.equal(reconciled.stage_attempt_id, 'sat_test');
});

test('reconciliation only touches status and session, never identity', () => {
  const lost = summary({ status: 'failed', execution_session_ref: null, quality_round_index: 3 });
  assert.throws(
    () => reconcileProjectedAttemptSummary(lost, persisted()),
    (error: unknown) => {
      const failure = error as { details?: { failure_code?: string } };
      assert.equal(failure.details?.failure_code, 'stage_quality_cycle_attempt_summary_mismatch');
      return true;
    },
  );
});

test('a lost activity without a durable session is not reconcilable', () => {
  assert.throws(
    () => reconcileProjectedAttemptSummary(
      summary({ status: 'failed', execution_session_ref: null }),
      persisted({ execution_session_ref: null }),
    ),
    /does not match its durable StageAttempt/,
  );
});

test('the workflow claiming a session the ledger never saw stays an error', () => {
  // The opposite direction must fail closed: the workflow cannot invent durable work.
  assert.throws(
    () => reconcileProjectedAttemptSummary(
      summary({ status: 'failed', execution_session_ref: SESSION }),
      persisted({ status: 'completed', execution_session_ref: null }),
    ),
    /does not match its durable StageAttempt/,
  );
});

test('a durable failure is never upgraded to completion by a stale workflow view', () => {
  assert.throws(
    () => reconcileProjectedAttemptSummary(
      summary({ status: 'completed', execution_session_ref: SESSION }),
      persisted({ status: 'failed' }),
    ),
    /does not match its durable StageAttempt/,
  );
});

test('a different workflow stays a contradiction', () => {
  assert.throws(
    () => reconcileProjectedAttemptSummary(
      summary({ status: 'failed', execution_session_ref: null }),
      persisted({ workflow_id: 'wf_other' }),
    ),
    /does not match its durable StageAttempt/,
  );
});

test('a different producer lineage stays a contradiction', () => {
  assert.throws(
    () => reconcileProjectedAttemptSummary(
      summary({ status: 'failed', execution_session_ref: null, artifact_producer_attempt_ref: 'sat_a' }),
      persisted({ context_manifest_json: JSON.stringify({ artifact_producer_attempt_ref: 'sat_b' }) }),
    ),
    /does not match its durable StageAttempt/,
  );
});
