import test from 'node:test';
import assert from 'node:assert/strict';

import { runController } from './family-runtime-temporal-stage-run-controller-cases/fixture.ts';

test('StageRun recovery resumes at reviewer without rerunning the durable producer', async () => {
  const { state, attempts, reviewReceiptInputs } = await runController({
    id: 'recovery-reviewer-resume',
    closeFindingAfterRound: null,
    recoveryResume: true,
    initialReviewerOutcome: 'pass',
    initialReviewerFindings: 'none',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['reviewer']);
  assert.match(attempts[0]?.stage_run_workflow_run_id ?? '', /^[0-9a-f-]{36}$/);
  assert.deepEqual(state.attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(attempts[0]?.parent_attempt_ref, 'opl://stage_attempts/sat_recovery-reviewer-resume_producer_0');
  assert.equal(
    attempts[0]?.artifact_producer_attempt_ref,
    'opl://stage_attempts/sat_recovery-reviewer-resume_producer_0',
  );
  assert.equal(reviewReceiptInputs[0]?.producer_attempt_ref, attempts[0]?.artifact_producer_attempt_ref);
  assert.equal(state.status, 'completed');
  assert.equal(state.review_receipts.length, 1);
});

test('StageRun accepted reviewer recovery starts the next repair round without repeating producer or reviewer', async () => {
  const { state, attempts } = await runController({
    id: 'accepted-reviewer-resume', closeFindingAfterRound: 2, acceptedReviewerResume: true,
  });
  assert.deepEqual(attempts.map(attempt => attempt.attempt_role), ['repairer', 're_reviewer']);
  assert.equal(attempts[0]?.quality_round_index, 2);
  assert.equal(attempts[0]?.parent_attempt_ref, 'opl://stage_attempts/sat_accepted-reviewer-resume_reviewer_0');
  assert.equal(attempts[0]?.findings?.[0]?.finding_id, 'finding:visual-clipping');
  assert.equal(state.status, 'completed');
});

test('StageRun accepted repairer recovery starts re-review without replaying accepted work', async () => {
  const { state, attempts } = await runController({
    id: 'accepted-repairer-resume', closeFindingAfterRound: 1, acceptedRepairerResume: true,
  });
  assert.deepEqual(attempts.map(attempt => attempt.attempt_role), ['re_reviewer']);
  assert.equal(attempts[0]?.quality_round_index, 1);
  assert.equal(attempts[0]?.parent_attempt_ref, 'opl://stage_attempts/sat_accepted-repairer-resume_repairer_1');
  assert.equal(state.status, 'completed');
});

test('StageRun controller materializes isolated producer-review-repair-re-review child workflows', async () => {
  const { state, attempts } = await runController({ id: 'closure', closeFindingAfterRound: 1 });
  assert.equal(state.status, 'completed');
  assert.equal(state.repair_rounds_used, 1);
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.deepEqual(attempts.map((attempt) => attempt.artifact_producer_attempt_ref ?? null), [
    null,
    'opl://stage_attempts/sat_closure_producer_0',
    'opl://stage_attempts/sat_closure_producer_0',
    'opl://stage_attempts/sat_closure_repairer_1',
  ]);
  assert.equal(new Set(state.attempts.map((attempt) => attempt.execution_session_ref)).size, 4);
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v2']);
  assert.equal(state.sqlite_projection.status, 'synced');
  assert.equal(state.review_receipts.length, 2);
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.next_stage_run_launch?.materialization_status, 'launched');
  assert.equal(state.next_stage_run_launch?.target_stage_run_id, 'target:review_and_revision');
  assert.equal(state.route_quality_debt_refs.length, 0);
});

test('StageRun preserves high token telemetry without an implicit token stop', async () => {
  const { state, attempts } = await runController({
    id: 'no-implicit-token-cap',
    closeFindingAfterRound: 1,
    tokensPerAttempt: 4_289_741,
  });
  assert.equal(state.status, 'completed');
  assert.equal(attempts.length, 4);
  assert.equal(state.quality_scope_budget?.max_tokens, null);
  assert.equal(state.quality_scope_budget_usage?.tokens_used, 17_158_964);
  assert.equal(state.quality_scope_budget_usage?.token_observation_status, 'observed');
  assert.equal(state.quality_scope_budget_stop_reason, null);
});

test('StageRun enforces a token cap only when explicitly configured', async () => {
  const { state, attempts } = await runController({
    id: 'explicit-token-cap',
    closeFindingAfterRound: 1,
    maxTokens: 5_000_000,
    tokensPerAttempt: 3_000_000,
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(attempts.length, 2);
  assert.equal(state.quality_scope_budget?.max_tokens, 5_000_000);
  assert.equal(state.quality_scope_budget_usage?.tokens_used, 6_000_000);
  assert.equal(state.quality_scope_budget_stop_reason, 'max_tokens_exhausted');
  assert.equal(state.blocked_reason, null);
});


test('provider review retry keeps the blocked attempt and creates only a new formal reviewer', async () => {
  const { state, attempts } = await runController({
    id: 'blocked-review-retry', closeFindingAfterRound: null, blockedReviewerResume: true,
    initialReviewerOutcome: 'pass', initialReviewerFindings: 'none',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['reviewer']);
  assert.match(attempts[0]?.stage_run_workflow_run_id ?? '', /^[0-9a-f-]{36}$/);
  assert.deepEqual(state.attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer', 'reviewer']);
  assert.equal(state.attempts[1]?.status, 'blocked');
  assert.notEqual(state.attempts[1]?.stage_attempt_id, state.attempts[2]?.stage_attempt_id);
  assert.equal(state.repair_rounds_used, 0);
  assert.equal(state.review_receipts.length, 1);
  assert.equal(state.status, 'completed');
});
