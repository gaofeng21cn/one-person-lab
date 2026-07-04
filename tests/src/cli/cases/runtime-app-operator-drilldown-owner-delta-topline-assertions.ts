import { assert } from '../helpers.ts';
import {
  assertCurrentOwnerDeltaToplineNextAction,
} from './owner-payload-workorder-assertions.ts';

export function assertOwnerDeltaTopline(projection: any) {
  assert.deepEqual(
    projection.current_owner_delta_read_model,
    projection.attention_first_payload.current_owner_delta_read_model,
  );
  assert.deepEqual(projection.current_owner_delta, projection.current_owner_delta_read_model.current_owner_delta);
  assert.deepEqual(projection.operator.current_owner_delta_read_model, projection.current_owner_delta_read_model);
  assert.deepEqual(projection.workbench.stage_run_cockpit, projection.stage_run_cockpit);
  const stageRunAction = projection.stage_run_next_required_owner_action ?? {};
  const ownerAnswerMissing =
    stageRunAction.owner_answer_missing_before_opl_closeout_binding === true;
  const ownerAnswerRecorded =
    typeof projection.current_owner_delta.latest_owner_answer_ref === 'string'
    || typeof projection.current_owner_delta.hard_gate?.owner_answer_ref === 'string';
  const stageRunClosed =
    projection.operator_next_action_source === 'stage_run_execution_authorization_closed';
  const expectedProviderBindingAction =
    'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs';
  const currentOwnerDeltaNextAction =
    projection.current_owner_delta_read_model.next_safe_action_or_none ?? {};
  const expectedOperatorOwner =
    currentOwnerDeltaNextAction.next_required_owner
      ?? currentOwnerDeltaNextAction.current_owner
      ?? currentOwnerDeltaNextAction.owner
      ?? projection.current_owner_delta.current_owner;
  const expectedStageRunOwner =
    ownerAnswerMissing || stageRunClosed
      ? projection.current_owner_delta.current_owner
      : 'one-person-lab';
  assert.equal(projection.stage_run_cockpit.surface_kind, 'opl_app_stage_run_cockpit_projection');
  assert.equal(projection.stage_run_cockpit_summary.refs_only, true);
  assert.equal(
    projection.stage_run_cockpit_summary.current_owner,
    expectedStageRunOwner,
  );
  assert.equal(
    projection.stage_run_cockpit_summary.current_owner_delta_owner,
    projection.current_owner_delta.current_owner,
  );
  assert.equal(projection.operator_current_owner_delta_owner, projection.current_owner_delta.current_owner);
  assert.equal(
    projection.operator_next_owner,
    expectedOperatorOwner,
  );
  assert.equal(
    projection.operator_next_required_action,
    stageRunClosed
        ? null
        : currentOwnerDeltaNextAction.next_required_action
          ?? currentOwnerDeltaNextAction.action_kind
          ?? null,
  );
  assert.equal(
    projection.stage_run_cockpit_summary.next_required_action,
    ownerAnswerMissing
      ? projection.current_owner_delta.desired_delta_description
      : stageRunClosed
        ? null
        : expectedProviderBindingAction,
  );
  assert.equal(
    projection.stage_run_next_missing_input_refs.includes('provider_attempt_ref'),
    !ownerAnswerMissing && !stageRunClosed,
  );
  assert.equal(
    projection.stage_run_next_missing_input_refs.includes('attempt_lease_ref'),
    !ownerAnswerMissing && !stageRunClosed,
  );
  assert.equal(
    projection.stage_run_next_missing_input_refs.includes('execution_authorization_decision_ref'),
    !ownerAnswerMissing && !stageRunClosed,
  );
  assert.equal(
    projection.stage_run_next_missing_input_refs.includes('owner_answer_ref'),
    !ownerAnswerRecorded,
  );
  assert.equal(projection.operator_required_delta, projection.current_owner_delta.desired_delta_description);
  assert.equal(
    projection.operator_payload_requirement,
    currentOwnerDeltaNextAction.payload_requirement
      ?? projection.current_owner_delta.payload_requirement,
  );
  assert.deepEqual(
    projection.operator_accepted_answer_shape,
    currentOwnerDeltaNextAction.accepted_answer_shape
      ?? projection.current_owner_delta.accepted_answer_shape,
  );
  assertCurrentOwnerDeltaToplineNextAction(projection);
  assert.equal(projection.authority_boundary.can_write_domain_truth, false);
  assert.equal(projection.authority_boundary.can_execute_domain_action, false);
  assert.equal(projection.authority_boundary.provider_completion_is_domain_ready, false);
  assert.equal(projection.owner_delta_topline_authority_boundary.refs_only, true);
  assert.equal(projection.owner_delta_topline_authority_boundary.can_write_domain_truth, false);
  assert.equal(projection.owner_delta_topline_authority_boundary.can_read_memory_body, false);
  assert.equal(projection.owner_delta_topline_authority_boundary.can_read_artifact_body, false);
  assert.equal(projection.owner_delta_topline_authority_boundary.can_create_owner_receipt, false);
  assert.equal(projection.owner_delta_topline_authority_boundary.can_write_owner_receipt, false);
  assert.equal(projection.owner_delta_topline_authority_boundary.can_generate_typed_blocker, false);
  assert.equal(projection.owner_delta_topline_authority_boundary.can_claim_domain_ready, false);
  assert.equal(projection.owner_delta_topline_authority_boundary.can_claim_production_ready, false);
}
