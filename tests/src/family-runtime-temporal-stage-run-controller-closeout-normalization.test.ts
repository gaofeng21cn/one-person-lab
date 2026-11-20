import test from 'node:test';
import assert from 'node:assert/strict';

import { runController } from './family-runtime-temporal-stage-run-controller-cases/fixture.ts';

test('normalized map, observations and lineage reach fresh re-review without new budget units', async () => {
  const result = await runController({
    id: 'closeout-normalization-success',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'pass',
    normalizationScenario: 'success',
  });
  assert.deepEqual(result.attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  const reReviewInput = result.workflowInputs.find((attempt) => attempt.attempt_role === 're_reviewer');
  assert.deepEqual(reReviewInput?.quality_context?.repair_map?.map((entry) => entry.finding_id), [
    'finding:visual-clipping',
  ]);
  assert.deepEqual(reReviewInput?.quality_context?.repair_observations?.map((entry) => entry.finding_id), [
    'finding:editorial-2', 'finding:editorial-3', 'finding:editorial-4',
  ]);
  const lineage = reReviewInput?.quality_context?.repair_closeout_lineage as any;
  assert.equal(lineage?.status, 'normalized');
  assert.equal(lineage?.authority_status, 'pending_unreviewed');
  assert.equal(lineage?.original_closeout_packet.route_impact.stage_quality_cycle.repair_map.length, 4);
  assert.notEqual(lineage?.original_closeout_id, lineage?.derived_closeout_id);
  assert.equal(result.state.status, 'completed');
  assert.equal(result.state.artifact_identity_authority?.status, 'accepted_by_re_review');
  assert.equal(result.state.artifact_identity_authority?.pending_repair, null);
  assert.equal(result.state.decisive_attempt_role, 're_reviewer');
  assert.ok(result.state.selected_stage_route);
  assert.ok(result.state.next_stage_run_launch);
  assert.equal(result.state.repair_rounds_used, 1);
  assert.equal(result.state.attempts.length, 4);
  assert.equal(result.state.quality_scope_budget_usage?.attempts_used, 1);
  assert.equal(result.state.quality_scope_budget_usage?.managed_attempts_used, 4);
});

test('an underived over-covered original retains pending authority and has no fresh re-review or route', async () => {
  const result = await runController({
    id: 'closeout-normalization-failure',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'pass',
    normalizationScenario: 'failure',
  });
  assert.deepEqual(result.attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer',
  ]);
  assert.equal(result.state.status, 'completed_with_quality_debt');
  assert.equal(result.state.artifact_identity_authority?.status, 'reviewed_with_open_findings');
  assert.equal(result.state.artifact_identity_authority?.pending_repair?.disposition, 'repair_map_invalid');
  assert.deepEqual(result.state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(result.state.selected_stage_route, null);
  assert.equal(result.state.next_stage_run_launch, null);
  assert.equal(result.routeInputs.length, 0);
  for (const debt of [
    'repair_map_invalid', 'repair_artifact_unreviewed', 'decisive_attempt_route_decision_missing',
  ]) {
    assert.ok(
      [...result.state.quality_debt_refs, ...result.state.route_quality_debt_refs]
        .some((ref) => ref.includes(debt)),
      debt,
    );
  }
  assert.equal(result.state.repair_rounds_used, 0);
  assert.equal(result.state.attempts.length, 3);
  assert.equal(result.state.quality_scope_budget_usage?.managed_attempts_used, 3);
});

test('fresh re-review after normalization retains quality-debt, budget and hard-stop authority semantics', async () => {
  const qualityDebt = await runController({
    id: 'closeout-normalization-re-review-quality-debt',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'quality_debt',
    normalizationScenario: 'success',
  });
  assert.equal(qualityDebt.state.status, 'completed_with_quality_debt');
  assert.equal(qualityDebt.state.artifact_identity_authority?.status, 'reviewed_with_quality_debt');
  assert.equal(qualityDebt.state.artifact_identity_authority?.pending_repair, null);
  assert.ok(qualityDebt.state.selected_stage_route);

  const budgetExhausted = await runController({
    id: 'closeout-normalization-re-review-budget-exhausted',
    closeFindingAfterRound: 2,
    maxRepairRounds: 1,
    executionMaxRepairRounds: 1,
    reReviewerOutcome: 'repair_required',
    normalizationScenario: 'success',
  });
  assert.equal(budgetExhausted.state.status, 'completed_with_quality_debt');
  assert.equal(budgetExhausted.state.artifact_identity_authority?.status, 'reviewed_with_open_findings');
  assert.equal(budgetExhausted.state.artifact_identity_authority?.pending_repair, null);
  assert.ok(budgetExhausted.state.selected_stage_route);

  for (const outcome of ['blocked', 'human_gate'] as const) {
    const stopped = await runController({
      id: `closeout-normalization-re-review-${outcome}`,
      closeFindingAfterRound: 1,
      reReviewerOutcome: outcome,
      normalizationScenario: 'success',
    });
    assert.equal(stopped.state.status, outcome);
    assert.equal(stopped.state.artifact_identity_authority?.status, 'hard_stopped');
    assert.equal(stopped.state.artifact_identity_authority?.pending_repair, null);
    assert.equal(stopped.state.selected_stage_route, null);
    assert.equal(stopped.routeInputs.length, 0);
  }
});

test('re-review provider failure after normalization keeps repair pending and previous reviewed authority', async () => {
  const result = await runController({
    id: 'closeout-normalization-re-review-provider-failure',
    closeFindingAfterRound: 1,
    reReviewerOutcome: 'pass',
    normalizationScenario: 'success',
    failRole: 're_reviewer',
  });
  assert.equal(result.state.status, 'completed_with_quality_debt');
  assert.equal(result.state.artifact_identity_authority?.status, 'reviewed_with_open_findings');
  assert.equal(result.state.artifact_identity_authority?.pending_repair?.disposition, 're_review_did_not_run');
  assert.deepEqual(result.state.artifact_refs, ['artifact:deck-v1']);
  assert.equal(result.state.selected_stage_route, null);
  assert.equal(result.state.next_stage_run_launch, null);
  assert.equal(result.routeInputs.length, 0);
  assert.ok(result.state.quality_debt_refs.some((ref) => ref.includes('re_review_not_run')));
});
