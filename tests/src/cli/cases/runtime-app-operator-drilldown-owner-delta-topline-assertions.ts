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
  assert.equal(drilldown.stage_run_cockpit.surface_kind, 'opl_app_stage_run_cockpit_projection');
  assert.equal(drilldown.stage_run_cockpit_summary.refs_only, true);
  assert.equal(drilldown.stage_run_cockpit_summary.current_owner, drilldown.current_owner_delta.current_owner);
  assert.equal(drilldown.operator_current_owner_delta_owner, drilldown.current_owner_delta.current_owner);
  assert.equal(drilldown.operator_next_owner, drilldown.current_owner_delta.current_owner);
  assert.equal(
    drilldown.operator_next_required_action,
    'current_owner_delta_owner_answer_or_typed_blocker_required',
  );
  assert.equal(
    drilldown.stage_run_cockpit_summary.next_required_action,
    'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs',
  );
  assert.equal(drilldown.stage_run_next_missing_input_refs.includes('provider_attempt_ref'), true);
  assert.equal(drilldown.stage_run_next_missing_input_refs.includes('attempt_lease_ref'), true);
  assert.equal(
    drilldown.stage_run_next_missing_input_refs.includes('execution_authorization_decision_ref'),
    true,
  );
  assert.equal(drilldown.stage_run_next_missing_input_refs.includes('owner_answer_ref'), true);
  assert.equal(drilldown.operator_required_delta, drilldown.current_owner_delta.desired_delta_description);
  assert.equal(drilldown.operator_payload_requirement, drilldown.current_owner_delta.payload_requirement);
  assert.deepEqual(drilldown.operator_accepted_answer_shape, drilldown.current_owner_delta.accepted_answer_shape);
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
