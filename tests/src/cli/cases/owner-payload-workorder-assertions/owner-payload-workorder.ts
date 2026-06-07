import { assert } from '../../helpers.ts';

type JsonRecord = Record<string, any>;

export function assertOwnerPayloadWorkorder(workorder: JsonRecord) {
  assert.equal(workorder.surface_kind, 'opl_owner_handoff_payload_workorder');
  assert.equal(
    workorder.payload_path_policy,
    'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
  );
  assert.equal(
    workorder.accepted_payload_paths.success_refs_path.typed_blocker_refs_must_be_absent,
    true,
  );
  assert.equal(workorder.accepted_payload_paths.typed_blocker_path.success_claimed, false);
  assert.equal(workorder.empty_payload_template_is_success_evidence, false);
  assert.equal(workorder.authority_boundary.can_write_owner_receipt, false);
  assert.equal(workorder.authority_boundary.can_create_owner_receipt, false);
  assert.equal(workorder.authority_boundary.can_generate_typed_blocker, false);
  assert.equal(workorder.authority_boundary.can_close_owner_chain, false);
  assert.equal(workorder.authority_boundary.can_close_domain_ready, false);
  assert.equal(workorder.authority_boundary.can_claim_production_ready, false);
}

export function assertOwnerPayloadWorkorderProjection(projection: JsonRecord) {
  assertOwnerPayloadWorkorder(projection.owner_payload_workorder);
  assert.equal(projection.empty_payload_template_is_success_evidence, false);
}
