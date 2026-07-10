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
  });
  for (const field of [
    'can_create_owner_receipt',
    'can_create_typed_blocker',
    'can_close_domain_ready',
    'can_claim_production_ready',
  ]) {
    assert.equal(ownerDeltaFirst.authority_boundary[field], false, field);
  }
  assert.equal(Object.hasOwn(drilldown, 'operator_action_routing_refs'), drilldown.detail_level === 'full');
}
