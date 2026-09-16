import test from 'node:test';
import assert from 'node:assert/strict';

import { runController } from './family-runtime-temporal-stage-run-controller-cases/fixture.ts';

test('initial reviewer routes cross-Stage repair without creating an inapplicable repair Attempt', async () => {
  const { state, attempts } = await runController({
    id: 'initial-review-route-back',
    closeFindingAfterRound: null,
    repairRequiredRoute: {
      role: 'reviewer',
      decisionKind: 'route_back',
      targetStageId: 'storyline',
    },
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.repair_rounds_used, 0);
  assert.equal(state.review_receipts[0]?.verdict, 'repair_required');
  assert.ok(state.quality_debt_refs.includes('quality-debt:finding:visual-clipping'));
  assert.equal(state.decisive_attempt_role, 'reviewer');
  assert.equal(state.selected_stage_route?.decision_kind, 'route_back');
  assert.equal(state.selected_stage_route?.target_stage_id, 'storyline');
  assert.equal(state.next_stage_run_launch?.target_stage_run_id, 'target:storyline');
});

test('re-reviewer routes cross-Stage repair without creating another repair round', async () => {
  const { state, attempts } = await runController({
    id: 're-review-route-back',
    closeFindingAfterRound: null,
    repairRequiredRoute: {
      role: 're_reviewer',
      decisionKind: 'route_back',
      targetStageId: 'storyline',
    },
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.repair_rounds_used, 1);
  assert.equal(state.review_receipts[1]?.verdict, 'repair_required');
  assert.ok(state.quality_debt_refs.includes('quality-debt:finding:visual-clipping'));
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.equal(state.selected_stage_route?.decision_kind, 'route_back');
  assert.equal(state.selected_stage_route?.target_stage_id, 'storyline');
  assert.equal(state.next_stage_run_launch?.target_stage_run_id, 'target:storyline');
});

test('repair_required advance remains non-terminal while repair budget remains', async () => {
  const { state, attempts } = await runController({
    id: 'repair-required-advance-rejected',
    closeFindingAfterRound: 1,
    repairRequiredRoute: {
      role: 'reviewer',
      decisionKind: 'advance',
      targetStageId: 'review_and_revision',
    },
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer', 'repairer', 're_reviewer',
  ]);
  assert.equal(state.status, 'completed');
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.ok(state.route_quality_debt_refs.some((ref) => ref.includes(
    'review_requires_internal_repair_continuation',
  )));
});

test('StageRun controller caps quality work at three repair rounds and fails open with quality debt', async () => {
  const { state, attempts } = await runController({ id: 'budget', closeFindingAfterRound: null });
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.blocked_reason, null);
  assert.equal(state.hard_stop_class, null);
  assert.equal(state.repair_rounds_used, 3);
  assert.equal(attempts.length, 8);
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), [
    'producer', 'reviewer',
    'repairer', 're_reviewer',
    'repairer', 're_reviewer',
    'repairer', 're_reviewer',
  ]);
  assert.equal(state.quality_debt_refs.includes('quality-debt:finding:visual-clipping'), true);
  assert.deepEqual(state.human_gate_refs, []);
  assert.equal(state.quality_scope_budget?.max_attempts, 3);
  assert.equal(state.quality_scope_budget_usage?.attempts_used, 3);
  assert.equal(state.quality_scope_budget_usage?.managed_attempts_used, 8);
  assert.equal(state.quality_scope_budget_stop_reason, 'max_attempts_exhausted');
  assert.equal(state.sqlite_projection.status, 'synced');
  assert.equal(state.review_receipts.length, 4);
  assert.equal(state.review_receipts[3]?.verdict, 'repair_required');
  assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts.at(-1)?.stage_attempt_id}`);
  assert.equal(state.decisive_attempt_role, 're_reviewer');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.next_stage_run_launch?.target_workflow_id, 'workflow:review_and_revision');
});

test('max=0 initial reviewer repair_required fails open with consumable quality debt', async () => {
  const { state, attempts } = await runController({
    id: 'zero-repair-budget',
    closeFindingAfterRound: null,
    maxRepairRounds: 0,
    initialReviewerOutcome: 'repair_required',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.blocked_reason, null);
  assert.equal(state.hard_stop_class, null);
  assert.equal(state.repair_rounds_used, 0);
  assert.equal(state.review_receipts[0]?.verdict, 'repair_required');
  assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts[1]?.stage_attempt_id}`);
  assert.equal(state.decisive_attempt_role, 'reviewer');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.next_stage_run_launch?.target_workflow_id, 'workflow:review_and_revision');
  assert.equal(state.quality_debt_refs.includes('quality-debt:finding:visual-clipping'), true);
  assert.deepEqual(state.human_gate_refs, []);
  assert.equal(state.quality_scope_budget?.max_attempts, 0);
  assert.equal(state.quality_scope_budget_stop_reason, 'max_attempts_exhausted');
});

test('a truly unavailable pre-Codex provider may omit a session and remains a hard stop', async () => {
  const { state, attempts } = await runController({
    id: 'preflight-hard-blocker',
    closeFindingAfterRound: null,
    preflightHardBlockRole: 'reviewer',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'blocked');
  assert.equal(state.blocked_reason, 'codex_cli_provider_unavailable');
  assert.equal(state.hard_stop_class, 'permission_or_credential_boundary');
  assert.deepEqual(state.typed_blocker_refs, [
    `opl://stage-attempts/${state.attempts[1]?.stage_attempt_id}/runtime-blockers/codex_cli_provider_unavailable`,
  ]);
  assert.deepEqual(state.human_gate_refs, []);
  assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts[1]?.stage_attempt_id}`);
  assert.equal(state.attempts[1]?.execution_session_ref, null);
  assert.equal(state.review_receipts.length, 0);
  assert.equal(state.quality_debt_refs.length, 0);
});

test('provider human-decision blocker terminalizes as human_gate rather than blocked', async () => {
  const { state, attempts } = await runController({
    id: 'provider-human-decision-gate',
    closeFindingAfterRound: null,
    preflightHardBlockRole: 'reviewer',
    preflightBlockedReason: 'operator_cancel_requested',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'human_gate');
  assert.equal(state.blocked_reason, 'operator_cancel_requested');
  assert.equal(state.hard_stop_class, 'human_decision_required');
  assert.equal(state.source_attempt_ref, `opl://stage_attempts/${state.attempts[1]?.stage_attempt_id}`);
});

test('primary-only StageRun makes the producer the sole decisive route owner', async () => {
  const { state, attempts } = await runController({
    id: 'primary-route-owner',
    closeFindingAfterRound: null,
    formalReviewRequired: false,
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer']);
  assert.equal(state.status, 'completed');
  assert.equal(state.decisive_attempt_role, 'producer');
  assert.equal(state.selected_stage_route?.decision_kind, 'advance');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.next_stage_run_launch?.target_stage_run_id, 'target:review_and_revision');
  assert.equal(state.workflow_id, `stage-run-workflow:primary-route-owner`);
});

test('producer Attempt current policy can enable Review after a primary-only StageRun was created', async () => {
  const { state, attempts, workflowInputs, reviewReceiptInputs } = await runController({
    id: 'attempt-policy-enables-review',
    closeFindingAfterRound: null,
    formalReviewRequired: false,
    executionFormalReviewRequired: true,
    initialReviewerOutcome: 'pass',
    executionRubricRefsByRole: {
      producer: ['rubric:v0-producer'],
      reviewer: ['rubric:v1-reviewer'],
    },
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed');
  assert.equal(state.decisive_attempt_role, 'reviewer');
  assert.deepEqual(
    workflowInputs[0]?.execution_content_binding?.spec.quality_rubric_refs,
    ['rubric:v0-producer'],
  );
  assert.deepEqual(
    workflowInputs[1]?.execution_content_binding?.spec.quality_rubric_refs,
    ['rubric:v1-reviewer'],
  );
  assert.deepEqual(reviewReceiptInputs[0]?.rubric_refs, ['rubric:v1-reviewer']);
});

test('decisive Attempt route validation uses its current declared Stage catalog', async () => {
  const currentDeclaredStageIds = [
    'storyline',
    'artifact_creation',
    'review_and_revision',
    'package_and_handoff',
    'publication_followup',
  ];
  const { state, workflowInputs, routeInputs } = await runController({
    id: 'attempt-current-stage-catalog',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'pass',
    terminalRouteTarget: 'publication_followup',
    executionDeclaredStageIds: currentDeclaredStageIds,
  });
  assert.equal(state.status, 'completed');
  assert.equal(state.selected_stage_route?.target_stage_id, 'publication_followup');
  assert.deepEqual(
    workflowInputs[1]?.execution_content_binding?.declared_stage_ids,
    [...currentDeclaredStageIds].sort(),
  );
  assert.equal(routeInputs[0]?.decision.target_stage_id, 'publication_followup');
});

test('raw producer progress reaches fresh AI review without a typed quality envelope', async () => {
  const { state, attempts } = await runController({
    id: 'raw-producer-review',
    closeFindingAfterRound: null,
    rawArtifactProgressRole: 'producer',
    initialReviewerOutcome: 'pass',
    initialReviewerFindings: 'none',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.deepEqual(state.attempts[0]?.artifact_refs, ['artifact:deck-v1']);
  assert.equal(state.status, 'completed');
  assert.equal(state.hard_stop_class, null);
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.next_stage_run_launch?.target_workflow_id, 'workflow:review_and_revision');
  assert.equal(state.quality_scope_budget_usage?.attempts_used, 0);
  assert.equal(state.quality_scope_budget_usage?.managed_attempts_used, 2);
  assert.equal(state.review_receipts.length, 1);
});

test('reviewer quality-debt verdict terminalizes the StageRun and retains reviewer route authority', async () => {
  const { state, attempts } = await runController({
    id: 'reviewer-quality-debt',
    closeFindingAfterRound: null,
    initialReviewerOutcome: 'quality_debt',
  });
  assert.deepEqual(attempts.map((attempt) => attempt.attempt_role), ['producer', 'reviewer']);
  assert.equal(state.status, 'completed_with_quality_debt');
  assert.equal(state.decisive_attempt_role, 'reviewer');
  assert.equal(state.selected_stage_route?.target_stage_id, 'review_and_revision');
  assert.equal(state.review_receipts[0]?.verdict, 'quality_debt');
});
