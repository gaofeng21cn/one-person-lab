import { assert } from '../helpers.ts';
import {
  assertCurrentOwnerDeltaToplineNextAction,
} from './owner-payload-workorder-assertions.ts';

export function assertOwnerDeltaTopline(drilldown: any) {
  assert.deepEqual(
    drilldown.current_owner_delta_read_model,
    drilldown.attention_first_payload.current_owner_delta_read_model,
  );
  assert.deepEqual(drilldown.current_owner_delta, drilldown.current_owner_delta_read_model.current_owner_delta);
  assert.deepEqual(drilldown.operator.current_owner_delta_read_model, drilldown.current_owner_delta_read_model);
  assert.deepEqual(drilldown.workbench.stage_run_cockpit, drilldown.stage_run_cockpit);
  const stageRunAction = drilldown.stage_run_next_required_owner_action ?? {};
  const ownerAnswerMissing =
    stageRunAction.owner_answer_missing_before_opl_closeout_binding === true;
  assert.equal(drilldown.stage_run_cockpit.surface_kind, 'opl_app_stage_run_cockpit_projection');
  assert.equal(drilldown.stage_run_cockpit_summary.refs_only, true);
  assert.equal(
    drilldown.stage_run_cockpit_summary.current_owner,
    ownerAnswerMissing ? drilldown.current_owner_delta.current_owner : 'one-person-lab',
  );
  assert.equal(
    drilldown.stage_run_cockpit_summary.current_owner_delta_owner,
    drilldown.current_owner_delta.current_owner,
  );
  assert.equal(drilldown.operator_current_owner_delta_owner, drilldown.current_owner_delta.current_owner);
  assert.equal(
    drilldown.operator_next_owner,
    ownerAnswerMissing ? drilldown.current_owner_delta.current_owner : 'one-person-lab',
  );
  assert.equal(
    drilldown.operator_next_required_action,
    ownerAnswerMissing
      ? drilldown.current_owner_delta_read_model.next_safe_action_or_none.next_required_action
      : 'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs',
  );
  assert.equal(
    drilldown.stage_run_cockpit_summary.next_required_action,
    ownerAnswerMissing
      ? drilldown.current_owner_delta.desired_delta_description
      : 'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs',
  );
  assert.equal(drilldown.stage_run_next_missing_input_refs.includes('provider_attempt_ref'), !ownerAnswerMissing);
  assert.equal(drilldown.stage_run_next_missing_input_refs.includes('attempt_lease_ref'), !ownerAnswerMissing);
  assert.equal(
    drilldown.stage_run_next_missing_input_refs.includes('execution_authorization_decision_ref'),
    !ownerAnswerMissing,
  );
  assert.equal(drilldown.stage_run_next_missing_input_refs.includes('owner_answer_ref'), true);
  assert.equal(drilldown.operator_required_delta, drilldown.current_owner_delta.desired_delta_description);
  assert.equal(
    drilldown.operator_payload_requirement,
    ownerAnswerMissing
      ? drilldown.current_owner_delta.payload_requirement
      : 'opl_execution_authorization_and_closeout_binding_refs_required',
  );
  assert.deepEqual(
    drilldown.operator_accepted_answer_shape,
    ownerAnswerMissing
      ? drilldown.current_owner_delta.accepted_answer_shape
      : [
          'provider_attempt_ref',
          'attempt_lease_ref',
          'execution_authorization_decision_ref',
          'owner_answer_binding_ref',
        ],
  );
  assertCurrentOwnerDeltaToplineNextAction(drilldown);
  assert.equal(drilldown.authority_boundary.can_write_domain_truth, false);
  assert.equal(drilldown.authority_boundary.can_execute_domain_action, false);
  assert.equal(drilldown.authority_boundary.provider_completion_is_domain_ready, false);
  assert.equal(drilldown.owner_delta_topline_authority_boundary.refs_only, true);
  assert.equal(drilldown.owner_delta_topline_authority_boundary.can_write_domain_truth, false);
  assert.equal(drilldown.owner_delta_topline_authority_boundary.can_read_memory_body, false);
  assert.equal(drilldown.owner_delta_topline_authority_boundary.can_read_artifact_body, false);
  assert.equal(drilldown.owner_delta_topline_authority_boundary.can_create_owner_receipt, false);
  assert.equal(drilldown.owner_delta_topline_authority_boundary.can_write_owner_receipt, false);
  assert.equal(drilldown.owner_delta_topline_authority_boundary.can_generate_typed_blocker, false);
  assert.equal(drilldown.owner_delta_topline_authority_boundary.can_claim_domain_ready, false);
  assert.equal(drilldown.owner_delta_topline_authority_boundary.can_claim_production_ready, false);
}
