import {
  assert,
  test,
} from '../helpers.ts';
import { buildOwnerHandoffPacket } from '../../../../src/modules/console/runtime-tray-app-operator-drilldown-parts/owner-handoff-packet.ts';
import { assertOwnerPayloadWorkorderProjection } from './owner-payload-workorder-assertions.ts';

test('runtime App drilldown projects bounded owner handoff packet without authority claims', () => {
  const packet = buildOwnerHandoffPacket({
    ownerPayloadGroups: [{
      owner: 'med-autoscience',
      payload_kind: 'owner_receipt_refs',
      attention_count: 2,
      open_envelope_count: 1,
      blocked_envelope_count: 1,
      required_refs_any_of: ['owner_receipt_ref'],
    }],
    domainDispatchGroupAttentionItems: [{
      canonical_domain_id: 'med-autoscience',
      stage_id: 'review',
      workorder_count: 1,
      required_operator_payload_refs: ['domain_receipt_refs'],
      sample_required_evidence_refs: ['quality_ref'],
      required_return_shapes: ['domain_owner_receipt_ref'],
      payload_path_policy:
        'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
      accepted_payload_paths: {
        success_refs_path: { typed_blocker_refs_must_be_absent: true },
        typed_blocker_path: { success_claimed: false },
      },
      payload_preflight_policy:
        'domain_dispatch_evidence_payload_must_pass_success_refs_or_typed_blocker_path_preflight',
      payload_preflight_blocked_error_kind:
        'domain_dispatch_evidence_payload_preflight_blocked',
    }],
    evidenceEnvelopeAttentionCount: 2,
    domainDispatchAttentionCount: 1,
    itemLimit: 1,
  });

  assert.equal(packet.surface_kind, 'opl_app_operator_owner_handoff_packet');
  assert.equal(packet.status, 'handoff_required');
  assert.equal(packet.owner_count, 1);
  assert.equal(packet.owner_omitted_count, 0);
  assert.equal(packet.authority_boundary.can_execute_domain_action, false);
  assert.equal(packet.authority_boundary.can_write_domain_truth, false);
  assert.equal(packet.authority_boundary.can_create_owner_receipt, false);
  assert.equal(packet.authority_boundary.can_create_typed_blocker, false);
  assert.equal(packet.authority_boundary.can_close_domain_ready, false);

  const owner = packet.owners[0];
  assert.equal(owner.owner, 'med-autoscience');
  assert.equal(owner.status, 'handoff_required');
  assert.equal(owner.attention_count, 3);
  assert.equal(owner.owner_payload_group_count, 1);
  assert.equal(owner.domain_dispatch_group_count, 1);
  assert.deepEqual(owner.required_refs_any_of, [
    'domain_receipt_refs',
    'owner_receipt_ref',
    'quality_ref',
  ]);
  assert.deepEqual(owner.required_return_shapes, ['domain_owner_receipt_ref']);
  assert.equal(owner.payload_owner, 'domain_repository_or_app_live_operator');
  assert.equal(owner.can_execute_domain_action, false);
  assert.equal(owner.can_write_domain_truth, false);
  assert.equal(owner.can_create_owner_receipt, false);
  assert.equal(owner.can_close_owner_chain, false);
  assertOwnerPayloadWorkorderProjection(owner);
});
