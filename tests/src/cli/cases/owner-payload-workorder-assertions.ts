import {
  assert,
} from '../helpers.ts';

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

export function assertFrameworkOwnerPayloadAttention(readiness: JsonRecord) {
  assert.equal(
    readiness.attention_first_payload.owner_payload_group_attention_policy,
    'top_owner_payload_groups_by_open_then_blocked_counts_refs_only',
  );
  assert.equal(readiness.attention_first_payload.owner_payload_groups.length <= 5, true);
  assert.equal(
    readiness.attention_first_payload.owner_payload_group_attention_count,
    readiness.attention_first_payload.owner_payload_groups.length
      + readiness.attention_first_payload.owner_payload_group_attention_omitted_count,
  );
  const firstOwnerPayloadGroup = readiness.attention_first_payload.owner_payload_groups[0];
  if (firstOwnerPayloadGroup) {
    assert.equal(typeof firstOwnerPayloadGroup.owner, 'string');
    assert.equal(firstOwnerPayloadGroup.owner.includes('-'), true);
    assert.equal(typeof firstOwnerPayloadGroup.payload_kind, 'string');
    assert.equal(firstOwnerPayloadGroup.attention_count > 0, true);
    assert.equal(firstOwnerPayloadGroup.full_detail_section, 'evidence_envelope');
    assert.equal(firstOwnerPayloadGroup.required_refs_any_of.includes('domain_owner_receipt_refs'), true);
    assert.equal(firstOwnerPayloadGroup.required_refs_any_of.includes('typed_blocker_refs'), true);
    assert.equal(firstOwnerPayloadGroup.authority_boundary.refs_only, true);
    assert.equal(firstOwnerPayloadGroup.authority_boundary.can_write_domain_truth, false);
    assert.equal(firstOwnerPayloadGroup.authority_boundary.can_create_owner_receipt, false);
    assert.equal(firstOwnerPayloadGroup.authority_boundary.can_close_domain_ready, false);
    assert.equal(firstOwnerPayloadGroup.authority_boundary.can_claim_production_ready, false);
    assertOwnerPayloadWorkorderProjection(firstOwnerPayloadGroup);
  }
  return firstOwnerPayloadGroup;
}

export function assertFrameworkOwnerHandoffPacket(readiness: JsonRecord) {
  const ownerHandoffPacket = readiness.attention_first_payload.owner_handoff_packet;
  assert.equal(readiness.owner_handoff_packet.source_command, 'opl runtime app-operator-drilldown --json');
  assert.equal(readiness.owner_handoff_packet.surface_kind, ownerHandoffPacket.surface_kind);
  assert.equal(readiness.owner_handoff_packet.owner_count, ownerHandoffPacket.owner_count);
  assert.deepEqual(readiness.owner_handoff_packet.owners, ownerHandoffPacket.owners);
  assert.equal(ownerHandoffPacket.surface_kind, 'opl_app_operator_owner_handoff_packet');
  assert.equal(
    ownerHandoffPacket.projection_policy,
    'bounded_owner_handoff_refs_only_no_domain_action_execution_or_receipt_creation',
  );
  assert.equal(ownerHandoffPacket.owner_count >= ownerHandoffPacket.owners.length, true);
  assert.equal(ownerHandoffPacket.owners.length <= 5, true);
  assert.equal(
    ownerHandoffPacket.owner_count,
    ownerHandoffPacket.owners.length + ownerHandoffPacket.owner_omitted_count,
  );
  assert.equal(
    ownerHandoffPacket.evidence_envelope_attention_count,
    readiness.attention_first_payload.summary.evidence_envelope_attention_count,
  );
  assert.equal(
    ownerHandoffPacket.domain_dispatch_attention_count,
    readiness.attention_first_payload.summary.domain_dispatch_attention_count,
  );
  assert.equal(ownerHandoffPacket.authority_boundary.can_execute_domain_action, false);
  assert.equal(ownerHandoffPacket.authority_boundary.can_write_domain_truth, false);
  assert.equal(ownerHandoffPacket.authority_boundary.can_create_owner_receipt, false);
  assert.equal(ownerHandoffPacket.authority_boundary.can_create_typed_blocker, false);
  assert.equal(ownerHandoffPacket.authority_boundary.can_close_owner_chain, false);
  assert.equal(ownerHandoffPacket.authority_boundary.can_close_domain_ready, false);
  assert.equal(ownerHandoffPacket.authority_boundary.can_claim_production_ready, false);

  const firstOwnerHandoff = ownerHandoffPacket.owners[0];
  if (firstOwnerHandoff) {
    assert.equal(typeof firstOwnerHandoff.owner, 'string');
    assert.equal(firstOwnerHandoff.status, 'handoff_required');
    assert.equal(firstOwnerHandoff.attention_count > 0, true);
    assert.equal(
      firstOwnerHandoff.owner_payload_group_count
        + firstOwnerHandoff.domain_dispatch_group_count > 0,
      true,
    );
    assert.equal(firstOwnerHandoff.payload_owner, 'domain_repository_or_app_live_operator');
    assert.equal(firstOwnerHandoff.required_refs_any_of.length > 0, true);
    assertOwnerPayloadWorkorderProjection(firstOwnerHandoff);
    assert.deepEqual(
      firstOwnerHandoff.owner_payload_workorder.accepted_payload_paths,
      firstOwnerHandoff.accepted_payload_paths,
    );
    assert.equal(firstOwnerHandoff.full_detail_sections.length > 0, true);
    assert.equal(firstOwnerHandoff.can_execute_domain_action, false);
    assert.equal(firstOwnerHandoff.can_write_domain_truth, false);
    assert.equal(firstOwnerHandoff.can_create_owner_receipt, false);
    assert.equal(firstOwnerHandoff.can_close_owner_chain, false);
    assert.equal(firstOwnerHandoff.can_close_domain_ready, false);
    assert.equal(firstOwnerHandoff.can_claim_production_ready, false);
  }
  return { ownerHandoffPacket, firstOwnerHandoff };
}

export function assertFrameworkOwnerPayloadAction(
  nextSafeActions: JsonRecord[],
  firstOwnerPayloadGroup: JsonRecord | undefined,
) {
  const ownerPayloadAction = nextSafeActions.find(
    (action) => action.action_kind === 'owner_payload_group_scaleout',
  );
  assert.equal(Boolean(ownerPayloadAction), Boolean(firstOwnerPayloadGroup));
  if (!firstOwnerPayloadGroup || !ownerPayloadAction) return;
  assert.equal(ownerPayloadAction.action_id, 'review_owner_payload_group_scaleout');
  assert.equal(ownerPayloadAction.step_kind, 'owner_payload_group_scaleout');
  assert.equal(ownerPayloadAction.owner, firstOwnerPayloadGroup.owner);
  assert.equal(ownerPayloadAction.payload_kind, firstOwnerPayloadGroup.payload_kind);
  assert.equal(
    ownerPayloadAction.evidence_closure_gate,
    firstOwnerPayloadGroup.payload_kind === 'domain_owner_receipt_or_typed_blocker_refs'
      ? 'domain_owner_chain_receipt_or_typed_blocker_gate'
      : 'domain_app_live_evidence_payload_gate',
  );
  assert.equal(ownerPayloadAction.attention_count, firstOwnerPayloadGroup.attention_count);
  assert.deepEqual(ownerPayloadAction.required_refs_any_of, firstOwnerPayloadGroup.required_refs_any_of);
  assert.deepEqual(ownerPayloadAction.owner_payload_workorder, firstOwnerPayloadGroup.owner_payload_workorder);
  assertOwnerPayloadWorkorderProjection(ownerPayloadAction);
  assert.equal(
    ownerPayloadAction.copyable_runtime_action_execute_commands.record_with_payload_file,
    `opl runtime action execute --action owner_payload:${firstOwnerPayloadGroup.owner}:${firstOwnerPayloadGroup.payload_kind}:record --payload-file <payload.json>`,
  );
  assert.equal(ownerPayloadAction.full_detail_section, 'evidence_envelope');
  assert.equal(ownerPayloadAction.authority, 'operator_attention_only');
  assert.equal(ownerPayloadAction.can_execute_domain_action, false);
  assert.equal(ownerPayloadAction.can_write_domain_truth, false);
  assert.equal(ownerPayloadAction.can_create_owner_receipt, false);
  assert.equal(ownerPayloadAction.can_close_domain_ready, false);
  assert.equal(ownerPayloadAction.can_claim_production_ready, false);
}

export function assertFrameworkOwnerHandoffAction(
  nextSafeActions: JsonRecord[],
  ownerHandoffPacket: JsonRecord,
  firstOwnerHandoff: JsonRecord | undefined,
) {
  const ownerHandoffAction = nextSafeActions.find(
    (action) => action.action_kind === 'owner_handoff_packet_review',
  );
  assert.equal(Boolean(ownerHandoffAction), Boolean(firstOwnerHandoff));
  if (!firstOwnerHandoff || !ownerHandoffAction) return;
  assert.equal(ownerHandoffAction.action_id, 'review_owner_handoff_packet');
  assert.equal(ownerHandoffAction.step_kind, 'owner_handoff_packet_review');
  assert.equal(ownerHandoffAction.evidence_closure_gate, 'domain_or_app_live_owner_handoff_gate');
  assert.equal(ownerHandoffAction.owner, firstOwnerHandoff.owner);
  assert.equal(ownerHandoffAction.owner_count, ownerHandoffPacket.owner_count);
  assert.equal(ownerHandoffAction.top_owner_attention_count, firstOwnerHandoff.attention_count);
  assert.deepEqual(ownerHandoffAction.required_refs_any_of, firstOwnerHandoff.required_refs_any_of);
  assert.deepEqual(ownerHandoffAction.required_return_shapes, firstOwnerHandoff.required_return_shapes);
  assert.equal(ownerHandoffAction.payload_path_policy, firstOwnerHandoff.payload_path_policy);
  assert.deepEqual(ownerHandoffAction.accepted_payload_paths, firstOwnerHandoff.accepted_payload_paths);
  assert.deepEqual(ownerHandoffAction.owner_payload_workorder, firstOwnerHandoff.owner_payload_workorder);
  assertOwnerPayloadWorkorderProjection(ownerHandoffAction);
  assert.equal(ownerHandoffAction.payload_preflight_policy, firstOwnerHandoff.payload_preflight_policy);
  assert.equal(
    ownerHandoffAction.payload_preflight_blocked_error_kind,
    firstOwnerHandoff.payload_preflight_blocked_error_kind,
  );
  assert.equal(ownerHandoffAction.authority, 'operator_attention_only');
  assert.equal(ownerHandoffAction.can_execute_domain_action, false);
  assert.equal(ownerHandoffAction.can_write_domain_truth, false);
  assert.equal(ownerHandoffAction.can_create_owner_receipt, false);
  assert.equal(ownerHandoffAction.can_create_typed_blocker, false);
  assert.equal(ownerHandoffAction.can_close_owner_chain, false);
  assert.equal(ownerHandoffAction.can_close_domain_ready, false);
  assert.equal(ownerHandoffAction.can_claim_production_ready, false);
  assert.equal(ownerHandoffAction.can_authorize_quality_or_export, false);
}
