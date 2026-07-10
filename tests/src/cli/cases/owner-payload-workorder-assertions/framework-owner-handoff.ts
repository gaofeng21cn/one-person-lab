import { assert } from '../../helpers.ts';
import {
  assertCurrentOwnerDeltaProjection,
  assertCurrentOwnerDeltaReadModel,
  assertCurrentOwnerDeltaToplineNextAction,
} from './current-owner-delta.ts';
import { assertOwnerPayloadWorkorderProjection } from './owner-payload-workorder.ts';

type JsonRecord = Record<string, any>;

function assertNoAuthority(surface: JsonRecord) {
  for (const field of [
    'can_execute_domain_action',
    'can_write_domain_truth',
    'can_create_owner_receipt',
    'can_create_typed_blocker',
    'can_close_owner_chain',
    'can_close_domain_ready',
    'can_claim_production_ready',
  ]) {
    if (field in surface) assert.equal(surface[field], false, field);
  }
}

export function assertFrameworkOwnerPayloadAttention(readiness: JsonRecord) {
  const attention = readiness.attention_first_payload;
  assert.equal(Array.isArray(attention.owner_payload_groups), true);
  assert.equal(attention.owner_payload_groups.length <= 5, true);
  const first = attention.owner_payload_groups[0];
  if (first) {
    assert.equal(typeof first.owner, 'string');
    assert.equal(typeof first.payload_kind, 'string');
    assertOwnerPayloadWorkorderProjection(first);
    assertNoAuthority(first.authority_boundary);
  }
  return first;
}

export function assertFrameworkOwnerHandoffPacket(readiness: JsonRecord) {
  const packet = readiness.attention_first_payload.owner_handoff_packet;
  assert.equal(packet.surface_kind, 'opl_app_operator_owner_handoff_packet');
  assert.deepEqual(readiness.owner_handoff_packet.owners, packet.owners);
  assert.equal(packet.owner_count, packet.owners.length + packet.owner_omitted_count);
  assertNoAuthority(packet.authority_boundary);

  const first = packet.owners[0];
  if (first) {
    assert.equal(typeof first.owner, 'string');
    assertOwnerPayloadWorkorderProjection(first);
    assertNoAuthority(first);
  }
  return { ownerHandoffPacket: packet, firstOwnerHandoff: first };
}

export function assertFrameworkOwnerPayloadAction(
  actions: JsonRecord[],
  firstGroup: JsonRecord | undefined,
) {
  const action = actions.find((entry) => entry.action_kind === 'owner_payload_group_scaleout');
  assert.equal(Boolean(action), Boolean(firstGroup));
  if (!action || !firstGroup) return;
  assert.equal(action.owner, firstGroup.owner);
  assertOwnerPayloadWorkorderProjection(action);
  assertNoAuthority(action);
}

export function assertFrameworkOwnerHandoffAction(
  actions: JsonRecord[],
  packet: JsonRecord,
  firstHandoff: JsonRecord | undefined,
) {
  const action = actions.find((entry) => entry.action_kind === 'owner_handoff_packet_review');
  assert.equal(Boolean(action), Boolean(firstHandoff));
  if (!action || !firstHandoff) return;
  assert.equal(action.owner, firstHandoff.owner);
  assert.equal(action.owner_count, packet.owner_count);
  assertOwnerPayloadWorkorderProjection(action);
  assertNoAuthority(action);
}

export function assertOwnerDeltaFirstReadinessProjection(readiness: JsonRecord) {
  const attention = readiness.attention_first_payload;
  const ownerDeltaFirst = attention.owner_delta_first;
  assert.deepEqual(readiness.current_owner_delta, attention.current_owner_delta);
  assert.deepEqual(readiness.current_owner_delta_read_model, attention.current_owner_delta_read_model);
  assertCurrentOwnerDeltaProjection(readiness.current_owner_delta, {
    currentOwner: ownerDeltaFirst.next_owner,
    requiredDelta: ownerDeltaFirst.next_required_delta,
  });
  assertCurrentOwnerDeltaReadModel(readiness.current_owner_delta_read_model, {
    currentOwner: ownerDeltaFirst.next_owner,
    requiredDelta: ownerDeltaFirst.next_required_delta,
  });
  assertCurrentOwnerDeltaToplineNextAction(readiness);
  assertNoAuthority(ownerDeltaFirst.authority_boundary);
  assertNoAuthority(readiness.owner_delta_handoff_summary.authority_boundary);
  assertNoAuthority(readiness.authority_boundary);
}
