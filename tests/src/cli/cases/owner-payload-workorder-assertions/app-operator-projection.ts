import { assert } from '../../helpers.ts';
import {
  assertCurrentOwnerDeltaProjection,
  assertCurrentOwnerDeltaReadModel,
} from './current-owner-delta.ts';

type JsonRecord = Record<string, any>;

export function assertOwnerDeltaFirstAppOperatorProjection(drilldown: JsonRecord) {
  const attention = drilldown.attention_first_payload;
  const ownerDeltaFirst = attention.owner_delta_first;

  assert.equal(attention.surface_kind, 'opl_app_drilldown_attention_first_payload');
  assert.equal(
    attention.payload_policy,
    drilldown.detail_level === 'full'
      ? 'full_detail_attention_overlay_with_complete_refs_no_domain_ready_claim'
      : 'owner_delta_first_default_app_payload_full_refs_routes_and_attempt_graph_require_detail_full',
  );
  assert.equal(ownerDeltaFirst.surface_kind, 'opl_owner_delta_first_projection');
  assert.deepEqual(
    attention.current_owner_delta,
    attention.current_owner_delta_read_model.current_owner_delta,
  );
  assertCurrentOwnerDeltaProjection(attention.current_owner_delta, {
    currentOwner: ownerDeltaFirst.next_owner,
    requiredDelta: ownerDeltaFirst.next_required_delta,
  });
  assertCurrentOwnerDeltaReadModel(attention.current_owner_delta_read_model, {
    currentOwner: ownerDeltaFirst.next_owner,
    requiredDelta: ownerDeltaFirst.next_required_delta,
    ...(ownerDeltaFirst.required_return_shapes.length > 0
      ? { acceptedReturnShapes: ownerDeltaFirst.required_return_shapes }
      : {}),
    fullDetailRefKeys: [
      'owner_delta_first_ref',
      'app_operator_drilldown_ref',
    ],
  });
  assert.equal(
    ownerDeltaFirst.projection_policy,
    'default_operator_surface_prioritizes_next_owner_delta_raw_refs_only_counters_are_drilldown',
  );
  assert.equal(typeof ownerDeltaFirst.next_owner, 'string');
  assert.equal(typeof ownerDeltaFirst.next_required_delta, 'string');
  assert.equal(Array.isArray(ownerDeltaFirst.full_detail_sections), true);
  assert.equal(ownerDeltaFirst.authority_boundary.can_create_owner_receipt, false);
  assert.equal(ownerDeltaFirst.authority_boundary.can_create_typed_blocker, false);
  assert.equal(ownerDeltaFirst.authority_boundary.can_close_domain_ready, false);
  assert.equal(ownerDeltaFirst.authority_boundary.can_claim_production_ready, false);
  assert.equal(
    ownerDeltaFirst.raw_attention_default_policy,
    'blocked_refs_only_envelopes_stage_replay_packets_and_ledger_counters_are_full_detail_drilldown_not_primary_operator_next_step',
  );

  assert.equal(attention.evidence_next_steps.items.length <= 5, true);
  assert.equal(
    attention.evidence_next_steps.projection_policy,
    'operator_guidance_only_no_safe_action_creation_no_domain_ready_claim',
  );
  assert.equal(attention.evidence_next_steps.can_execute_domain_action, false);
  assert.equal(attention.evidence_next_steps.can_create_owner_receipt, false);
  assert.equal(attention.evidence_next_steps.can_close_domain_ready, false);
  assert.equal(
    attention.evidence_after_contract.attention_count_semantics,
    'operator_actionable_plus_domain_blocked_refs_only_no_ready_claim',
  );
  assert.equal(
    attention.evidence_after_contract.authority_boundary.attention_count_is_hard_blocker,
    false,
  );
  assert.equal(
    attention.evidence_after_contract.authority_boundary.route_support_closes_domain_ready,
    false,
  );
  assert.equal(Object.hasOwn(drilldown, 'evidence_envelope'), drilldown.detail_level === 'full');
  assert.equal(Object.hasOwn(drilldown, 'operator_action_routing_refs'), drilldown.detail_level === 'full');

  const nextSafeAction = attention.next_safe_action;
  if (nextSafeAction) {
    assert.equal(nextSafeAction.execution_surface, 'opl runtime action execute');
    assert.equal(nextSafeAction.can_execute_domain_action_directly, false);
    assert.equal(nextSafeAction.can_create_owner_receipt, false);
    if (nextSafeAction.route_requires_domain_or_app_payload) {
      assert.equal(nextSafeAction.can_close_without_domain_or_app_payload, false);
      assert.equal(
        nextSafeAction.payload_workorder.empty_payload_template_is_success_evidence,
        false,
      );
    }
  }

  const nextStep = attention.evidence_next_steps.items[0];
  if (nextStep) {
    assert.equal(typeof nextStep.owner, 'string');
    assert.equal(typeof nextStep.step_kind, 'string');
    assert.equal(typeof nextStep.status, 'string');
    assert.equal(nextStep.can_execute_domain_action, false);
    assert.equal(nextStep.can_create_owner_receipt, false);
    assert.equal(nextStep.can_close_domain_ready, false);
    assert.notEqual(nextStep.full_detail_section, undefined);
  }
}
