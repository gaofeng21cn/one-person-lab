import test from 'node:test';
import assert from 'node:assert/strict';

import { runController } from './family-runtime-temporal-stage-run-controller-cases/fixture.ts';

test('StageRun query stays running until the next StageRun launch is available', async () => {
  const { state, handoffObservations } = await runController({
    id: 'handoff-publication', closeFindingAfterRound: null,
    formalReviewRequired: false, queryDuringHandoff: true,
  });
  assert.equal(handoffObservations.length, 1);
  assert.equal(handoffObservations[0].status, 'running');
  assert.equal(handoffObservations[0].next_stage_run_launch, null);
  assert.equal(state.status, 'completed');
  assert.equal(state.next_stage_run_launch?.target_workflow_id, 'workflow:review_and_revision');
});

test('Attempt projection failure preserves artifacts and continues to review and handoff', async () => {
  const { state, attempts } = await runController({
    id: 'attempt-sync-progress', closeFindingAfterRound: null,
    initialReviewerOutcome: 'pass', failAttemptSync: true,
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(state.next_stage_run_launch?.target_workflow_id, 'workflow:review_and_revision');
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes('simulated-sqlite-projection-unavailable')));
});

test('transient handoff failure retries transport without rerunning completed AI Attempts', async () => {
  const { state, attempts, routeInputs } = await runController({
    id: 'transient-handoff', closeFindingAfterRound: null,
    formalReviewRequired: false, transientHandoffFailures: 3,
  });
  assert.equal(routeInputs.length, 4);
  assert.equal(attempts.length, 1);
  assert.equal(state.status, 'completed');
  assert.equal(state.next_stage_run_launch?.target_workflow_id, 'workflow:review_and_revision');
});

test('permanent handoff failure exposes its cause and preserves the artifact and AI route', async () => {
  const { state, attempts, routeInputs } = await runController({
    id: 'permanent-handoff', closeFindingAfterRound: null,
    formalReviewRequired: false, permanentHandoffFailure: true,
  });
  assert.equal(routeInputs.length, 1);
  assert.equal(attempts.length, 1);
  assert.equal(state.status, 'failed');
  assert.match(state.blocked_reason!, /route-target-identity-mismatch/);
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
});

test('recoverable producer and repairer quality debt still reaches fresh formal Review', async () => {
  const producerDebt = await runController({
    id: 'producer-debt-continues',
    closeFindingAfterRound: 1,
    softBlockRole: 'producer',
  });
  assert.deepEqual(producerDebt.attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(producerDebt.state.status, 'completed');

  const repairDebt = await runController({
    id: 'repair-debt-continues',
    closeFindingAfterRound: 1,
    softBlockRole: 'repairer',
  });
  assert.deepEqual(repairDebt.attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(repairDebt.state.status, 'completed');
});

test('repair without new artifact bytes terminalizes quality debt before re-review', async () => {
  const { state, attempts } = await runController({
    id: 'repair-debt-without-new-artifact',
    closeFindingAfterRound: 1,
    softBlockRole: 'repairer',
    omitArtifactForRole: 'repairer',
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer',
  ]);
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(state.review_receipts.length, 1);
  assert.ok(state.quality_debt_refs.some((ref) => ref.includes(
    'repair-round-1-did-not-produce-new-artifact',
  )));
});

test('repairer terminal route output is rejected and fresh re-review remains decisive', async () => {
  const { state, attempts } = await runController({
    id: 'repairer-route-rejected',
    closeFindingAfterRound: 1,
    repairerAttemptsTerminalDecision: true,
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes('attempt_role_is_not_configured_decisive_role')));
});

test('undeclared terminal route target is not materialized and does not discard reviewed progress', async () => {
  const { state } = await runController({
    id: 'undeclared-route-target',
    closeFindingAfterRound: 1,
    terminalRouteTarget: 'missing-stage',
  });
  assert.equal(state.status, 'completed');
  assert.equal(state.selected_stage_route, null);
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes('route_target_is_not_a_declared_stage')));
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes('decisive_attempt_route_decision_missing')));
});

test('invalid re-review closure cannot leave a route decision behind', async () => {
  const { state } = await runController({
    id: 'invalid-re-review-closure',
    closeFindingAfterRound: 1,
    invalidReReviewClosure: true,
  });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.selected_stage_route, null);
  assert.equal(state.decisive_attempt_ref, null);
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes('re_review_closure_contract_invalid')));
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes('decisive_attempt_route_decision_missing')));
});

test('reviewer protocol failure blocks while retaining a consumable producer artifact', async () => {
  const { state, attempts } = await runController({
    id: 'reviewer-failure',
    closeFindingAfterRound: null,
    failRole: 'reviewer',
  });
  assert.equal(state.status, 'blocked');
  assert.equal(state.blocked_reason, 'stage_quality_reviewer_not_completed');
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.deepEqual(state.attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.attempts[1]?.status, 'failed');
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
  assert.deepEqual(state.artifact_identity_receipt_refs, ['artifact-identity:deck-v1']);
  assert.equal(state.review_receipts.length, 0);
});

test('reviewer artifact identity drift exposes the boundary even when projection fails', async () => {
  for (const failAttemptSync of [false, true]) {
    const { state, attempts, routeInputs } = await runController({
      id: `reviewer-drift-${failAttemptSync}`,
      closeFindingAfterRound: null,
      reviewerIdentityDrift: true,
      initialReviewerOutcome: 'quality_debt',
      initialReviewerFindings: 'optional',
      failAttemptSync,
    });
    assert.equal(state.status, 'blocked');
    assert.equal(state.blocked_reason, 'reviewed_artifact_identity_mismatch');
    assert.equal(state.hard_stop_class, 'stale_or_mismatched_stage_identity');
    assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts[1].stage_attempt_id}`);
    assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
    assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
    assert.equal(state.review_receipts.length, 0);
    assert.equal(state.decisive_attempt_ref, null);
    assert.equal(state.selected_stage_route, null);
    assert.equal(routeInputs.length, 0);
    assert.equal(state.route_quality_debt_refs.length, 0);
    if (failAttemptSync) {
      assert.ok(state.quality_debt_refs.some((ref) => ref.includes('simulated-sqlite-projection-unavailable')));
    }
  }
});

test('optional major review debt preserves exact artifact identity and launches the selected route once', async () => {
  for (const reviewerOmitArtifactIdentity of [false, true]) {
    const { state, routeInputs } = await runController({
      id: `reviewer-optional-debt-${reviewerOmitArtifactIdentity}`,
      closeFindingAfterRound: null,
      initialReviewerOutcome: 'quality_debt',
      initialReviewerFindings: 'optional',
      reviewerOmitArtifactIdentity,
    });
    assert.equal(state.status, 'completed_with_quality_debt');
    assert.equal(state.hard_stop_class, null);
    assert.equal(state.decisive_attempt_role, 'reviewer');
    assert.equal(state.selected_stage_route?.decision_kind, 'advance');
    assert.equal(state.next_stage_run_launch?.target_workflow_id, 'workflow:review_and_revision');
    assert.equal(routeInputs.length, 1);
    assert.deepEqual(state.artifact_refs, ['artifact:deck-v1']);
    assert.deepEqual(state.artifact_hashes, ['sha256:deck-v1']);
    assert.equal(state.review_receipts[0].verdict, 'quality_debt');
    assert.equal(state.findings[0].required, false);
    assert.equal(state.route_quality_debt_refs.length, 0);
  }
});

test('re-review artifact identity drift preserves the repaired artifact and rejects the route', async () => {
  const { state, routeInputs } = await runController({
    id: 're-reviewer-drift', closeFindingAfterRound: 1, reReviewerIdentityDrift: true,
  });
  assert.equal(state.status, 'blocked');
  assert.equal(state.blocked_reason, 'reviewed_artifact_identity_mismatch');
  assert.equal(state.hard_stop_class, 'stale_or_mismatched_stage_identity');
  assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts[3].stage_attempt_id}`);
  assert.deepEqual(state.artifact_refs, ['artifact:deck-v2']);
  assert.equal(state.review_receipts.length, 1);
  assert.equal(routeInputs.length, 0);
});

test('producer failure without a consumable artifact hard-stops the StageRun', async () => {
  const { state, attempts } = await runController({
    id: 'producer-failure',
    closeFindingAfterRound: null,
    failRole: 'producer',
  });
  assert.equal(state.status, 'blocked');
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.deepEqual(state.attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.equal(state.attempts[0]?.status, 'failed');
  assert.equal(state.artifact_refs.length, 0);
  assert.equal(state.review_receipts.length, 0);
});

test('literal zero artifact hard-stops, while a failed repair preserves prior consumable progress as debt', async () => {
  const zeroArtifact = await runController({
    id: 'producer-zero-artifact',
    closeFindingAfterRound: null,
    omitArtifactForRole: 'producer',
  });
  assert.equal(zeroArtifact.state.status, 'blocked');
  assert.equal(zeroArtifact.state.blocked_reason, 'stage_quality_attempt_without_consumable_artifact');
  assert.equal(
    zeroArtifact.state.source_attempt_ref,
    'opl://stage_attempts/sat_producer-zero-artifact_producer_0',
  );
  assert.equal(zeroArtifact.state.artifact_refs.length, 0);
  assert.ok(zeroArtifact.attemptSyncs.some(sync => sync.attempt_ref === 'opl://stage_attempts/sat_producer-zero-artifact_producer_0'));

  const failedRepair = await runController({
    id: 'repairer-zero-new-artifact',
    closeFindingAfterRound: null,
    omitArtifactForRole: 'repairer',
  });
  assert.equal(failedRepair.state.status, 'completed_with_quality_debt');
  assert.deepEqual(failedRepair.state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(failedRepair.state.review_receipts.length, 1);
  assert.ok(failedRepair.state.quality_debt_refs.some((ref) => ref.includes(
    'stage_quality_attempt_without_consumable_artifact',
  )));
});

test('producer artifact without a verified identity receipt cannot enter formal Review', async () => {
  const { state, attempts } = await runController({
    id: 'producer-missing-identity-receipt',
    closeFindingAfterRound: null,
    omitIdentityReceiptForRole: 'producer',
  });
  assert.equal(state.status, 'blocked');
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.equal(state.hard_stop_class, 'authority_boundary_violation');
  assert.equal(state.blocked_reason, 'artifact_identity_receipt_missing_authority_violation');
  assert.equal(
    state.source_attempt_ref,
    'opl://stage_attempts/sat_producer-missing-identity-receipt_producer_0',
  );
  assert.equal(state.artifact_refs.length, 0);
  assert.equal(state.review_receipts.length, 0);
});

for (const role of ['reviewer', 're_reviewer'] as const) {
  test(`${role} diagnostic progress without quality outcome blocks without inventing a review`, async () => {
    const { state, attemptSyncs } = await runController({
      id: `missing-outcome-${role}`, closeFindingAfterRound: 1, rawArtifactProgressRole: role,
    });
    assert.equal(state.status, 'blocked');
    assert.equal(state.blocked_reason, 'stage_quality_review_outcome_missing');
    assert.equal(attemptSyncs.at(-1)?.workflow_state.status, 'completed');
    assert.equal(attemptSyncs.at(-1)?.attempt_ref, `opl://stage_attempts/${state.attempts.at(-1)?.stage_attempt_id}`);
    assert.equal(state.attempts.at(-1)?.attempt_role, role);
    assert.equal(state.attempts.at(-1)?.status, 'completed');
    assert.equal(state.review_receipts.length, role === 'reviewer' ? 0 : 1);
    assert.equal(state.selected_stage_route, null);
    assert.ok(!state.quality_debt_refs.some((ref) => ref.includes('Unknown')));
  });
}
