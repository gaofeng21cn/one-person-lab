import test from 'node:test';
import assert from 'node:assert/strict';

import { runController } from './family-runtime-temporal-stage-run-controller-cases/fixture.ts';

test('initial reviewer blocked and human_gate outcomes map to hard-stop status and receipts', async () => {
  const blocked = await runController({
    id: 'initial-review-blocked',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'blocked',
  });
  assert.equal(blocked.state.status, 'blocked');
  assert.equal(blocked.state.blocked_reason, 'reviewer-blocked');
  assert.equal(blocked.state.hard_stop_class, 'safety_or_compliance');
  assert.deepEqual(blocked.state.typed_blocker_refs, [
    'typed-blocker:initial-review-blocked',
  ]);
  assert.deepEqual(blocked.state.human_gate_refs, []);
  assert.equal(
    blocked.state.source_attempt_ref,
    `opl://stage_attempts/${blocked.state.attempts[1]?.stage_attempt_id}`,
  );
  assert.equal(blocked.state.review_receipts[0]?.verdict, 'hard_stop');
  assert.equal(blocked.state.selected_stage_route, null);

  const humanGate = await runController({
    id: 'initial-review-human-gate',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'human_gate',
  });
  assert.equal(humanGate.state.status, 'human_gate');
  assert.equal(humanGate.state.blocked_reason, 'reviewer-human_gate');
  assert.equal(humanGate.state.hard_stop_class, 'human_decision_required');
  assert.deepEqual(humanGate.state.typed_blocker_refs, []);
  assert.deepEqual(humanGate.state.human_gate_refs, [
    'human-gate:initial-review-human-gate',
  ]);
  assert.equal(humanGate.state.review_receipts[0]?.verdict, 'hard_stop');
  assert.equal(humanGate.state.selected_stage_route, null);
});

test('initial repair_required outcome requires at least one required finding', async () => {
  const { state, attempts } = await runController({
    id: 'initial-repair-empty-findings',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'repair_required',
    initialReviewerFindings: 'none',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 0);
  assert.equal(state.selected_stage_route, null);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('repair_required')));
});

test('open findings downgrade a pass claim without discarding the AI continuation', async () => {
  const { state, attempts } = await runController({
    id: 'initial-pass-required-finding',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'pass',
    initialReviewerFindings: 'required',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 0);
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.next_stage_run_launch?.target_workflow_id, 'workflow:review_and_revision');
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('open%20required%20finding')));
});

test('open findings remain quality debt without discarding the AI continuation', async () => {
  const { state, attempts } = await runController({
    id: 'initial-quality-debt-required-finding',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'quality_debt',
    initialReviewerFindings: 'required',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 0);
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.next_stage_run_launch?.target_workflow_id, 'workflow:review_and_revision');
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('open%20required%20finding')));
});

test('closed re-review quality_debt outcome terminalizes with debt and controller receipt mapping', async () => {
  const { state, attempts } = await runController({
    id: 're-review-quality-debt',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'quality_debt',
    reReviewerOptionalObservation: true,
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts[1]?.verdict, 'quality_debt');
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('re-review-quality-debt')));
});

test('closed re-review pass may retain optional observations without reopening repair', async () => {
  const { state, attempts } = await runController({
    id: 're-review-pass-optional-observation',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'pass',
    reReviewerOptionalObservation: true,
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(state.status, 'completed');
  assert.equal(state.review_receipts[1]?.verdict, 'pass');
  assert.equal(state.repair_rounds_used, 1);
  assert.equal(state.decisive_attempt_role, 're_reviewer');
});

test('re-review blocked and human_gate outcomes map to hard-stop receipts and do not route', async () => {
  const blocked = await runController({
    id: 're-review-blocked',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'blocked',
    reReviewerHardStopClass: 'safety_or_compliance',
  });
  assert.equal(blocked.state.status, 'blocked');
  assert.equal(blocked.state.blocked_reason, 're-review-blocked');
  assert.equal(blocked.state.hard_stop_class, 'safety_or_compliance');
  assert.deepEqual(blocked.state.typed_blocker_refs, [
    'typed-blocker:re-review-blocked',
  ]);
  assert.equal(
    blocked.state.source_attempt_ref,
    `opl://stage_attempts/${blocked.state.attempts[3]?.stage_attempt_id}`,
  );
  assert.equal(blocked.state.review_receipts[1]?.verdict, 'hard_stop');
  assert.equal(blocked.state.selected_stage_route, null);

  const humanGate = await runController({
    id: 're-review-human-gate',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'human_gate',
  });
  assert.equal(humanGate.state.status, 'human_gate');
  assert.equal(humanGate.state.blocked_reason, 're-review-human_gate');
  assert.equal(humanGate.state.hard_stop_class, 'human_decision_required');
  assert.deepEqual(humanGate.state.human_gate_refs, [
    'human-gate:re-review-human-gate',
  ]);
  assert.equal(humanGate.state.review_receipts[1]?.verdict, 'hard_stop');
  assert.equal(humanGate.state.selected_stage_route, null);
});

test('invalid re-review hard-stop evidence is rejected before receipt and recorded as protocol debt', async () => {
  const { state } = await runController({
    id: 'invalid-re-review-hard-stop',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'blocked',
    invalidReReviewerHardStopEvidence: true,
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 1);
  assert.equal(state.blocked_reason, null);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('hard_stop_class')));
});

test('validated re-review hard stop is not downgraded when receipt persistence fails', async () => {
  const { state } = await runController({
    id: 'hard-stop-receipt-persistence-failure',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'blocked',
    failReceiptForReviewerRole: 're_reviewer',
  });
  assert.equal(state.status, 'blocked');
  assert.equal(state.blocked_reason, 're-review-blocked');
  assert.equal(state.review_receipts.length, 1);
  assert.equal(state.review_receipts[0]?.verdict, 'repair_required');
  assert.equal(state.selected_stage_route, null);
});

test('re-review outcome and finding closure must agree in both directions', async () => {
  const closedButRepairRequired = await runController({
    id: 'closed-but-repair-required',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'repair_required',
  });
  assert.equal(closedButRepairRequired.state.status, 'completed_with_quality_debt');
  assert.equal(closedButRepairRequired.state.review_receipts.length, 1);
  assert.equal(closedButRepairRequired.state.selected_stage_route, null);
  assert.ok(closedButRepairRequired.state.quality_debt_refs.some((ref) => ref.includes('repair_required')));

  const openButPass = await runController({
    id: 'open-but-pass',
    closeFindingAfterRound: null,
    reReviewerOutcome: 'pass',
  });
  assert.equal(openButPass.state.status, 'completed_with_quality_debt');
  assert.equal(openButPass.state.repair_rounds_used, 1);
  assert.equal(openButPass.state.review_receipts.length, 1);
  assert.equal(openButPass.state.selected_stage_route, null);
  assert.ok(openButPass.state.quality_debt_refs.some((ref) => ref.includes('must%20return%20outcome%20repair_required')));
});

test('legacy Attempt verdict is rejected before controller receipt materialization', async () => {
  const { state, attempts } = await runController({
    id: 'legacy-review-verdict',
    closeFindingAfterRound: null,
    legacyVerdictRole: 'reviewer',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 0);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('verdict%20is%20reserved')));
});

test('reviewer-only outcome is rejected when a producer or repairer returns it', async () => {
  const producer = await runController({
    id: 'producer-forbidden-outcome',
    closeFindingAfterRound: null,
    nonReviewOutcomeRole: 'producer',
  });
  assert.equal(producer.state.status, 'blocked');
  assert.equal(producer.state.review_receipts.length, 0);

  const repairer = await runController({
    id: 'repairer-forbidden-outcome',
    closeFindingAfterRound: null,
    nonReviewOutcomeRole: 'repairer',
  });
  assert.equal(repairer.state.status, 'completed_with_quality_debt');
  assert.equal(repairer.state.review_receipts.length, 1);
  assert.ok(repairer.state.quality_debt_refs.some((ref) => ref.includes(
    'must%20not%20return%20outcome%20or%20verdict',
  )));
});

test('receipt activity validation failure cannot forge a review receipt', async () => {
  const { state, routeInputs } = await runController({
    id: 'receipt-validation-failure',
    closeFindingAfterRound: null,
    failReceiptForReviewerRole: 'reviewer',
    initialReviewerOutcome: 'pass',
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.review_receipts.length, 0);
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(routeInputs.length, 1);
  assert.equal(state.next_stage_run_launch?.target_workflow_id, 'workflow:review_and_revision');
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('receipt-validation-failure')));
});
