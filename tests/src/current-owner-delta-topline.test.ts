import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCurrentOwnerDeltaTopline } from '../../src/modules/ledger/current-owner-delta-topline.ts';

function readModel(overrides: Record<string, unknown> = {}) {
  return {
    surface_kind: 'opl_current_owner_delta_read_model',
    current_owner_delta: {
      surface_kind: 'opl_current_owner_delta',
      delta_id: 'current-owner-delta:mas:paper-closeout',
      domain: 'med-autoscience',
      current_owner: 'med-autoscience',
      stage_id: 'paper_closeout',
      desired_delta_description: 'continue_medical_paper_work',
      accepted_answer_shape: ['readable_artifact_ref', 'typed_blocker_ref'],
      source_fingerprint: 'sha256:owner-delta-topline-test',
      hard_gate: { state: 'none' },
      ...overrides,
    },
    next_safe_action_or_none: null,
  };
}

test('topline has no framework execution authorization or closeout-binding control plane', () => {
  const topline = buildCurrentOwnerDeltaTopline({
    currentOwnerDeltaReadModel: readModel(),
  });
  const serialized = JSON.stringify(topline);

  assert.equal(serialized.includes('stage_run_execution_authorization'), false);
  assert.equal(serialized.includes('execution_authorization_decision_ref'), false);
  assert.equal(serialized.includes('closeout_binding'), false);
  assert.equal(topline.stage_run_cockpit.next_required_owner_action, null);
  assert.equal(topline.operator_next_action, null);
});

test('readable artifact makes the next declared stage startable with quality debt', () => {
  const topline = buildCurrentOwnerDeltaTopline({
    currentOwnerDeltaReadModel: readModel({
      consumable_artifact_refs: ['mas://paper/draft-with-open-review-debt'],
    }),
  });

  assert.equal(topline.stage_run_cockpit_summary.next_stage_may_start, true);
  assert.equal(topline.stage_run_cockpit_summary.transition_outcome, 'completed_with_quality_debt');
  assert.ok(topline.stage_run_cockpit_summary.quality_debt_reasons.includes(
    'owner_answer_missing_for_quality_or_ready_claim',
  ));
  assert.equal(topline.stage_run_cockpit_summary.missing_transport_refs_block_next_stage, false);
});

test('domain owner answer is projected directly and never minted by StageRun', () => {
  const topline = buildCurrentOwnerDeltaTopline({
    currentOwnerDeltaReadModel: readModel({
      latest_owner_answer_ref: 'mas://owner-answer/paper-review',
      latest_owner_answer_kind: 'owner_receipt',
    }),
  });
  const delta = topline.stage_run_cockpit.stage_run_current_owner_delta;

  assert.equal(delta.owner_answer_ref, 'mas://owner-answer/paper-review');
  assert.equal(delta.owner_answer_kind, 'owner_receipt');
  assert.equal(topline.stage_run_cockpit.authority_boundary.can_create_owner_receipt, false);
});
