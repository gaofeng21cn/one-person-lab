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

export function assertCurrentOwnerDeltaReadModel(
  readModel: JsonRecord,
  expected: {
    currentOwner?: unknown;
    requiredDelta?: unknown;
    acceptedReturnShapes?: unknown;
    openSafeActionCount?: unknown;
    payloadRequiredCount?: unknown;
    domainDispatchWorkorderCount?: unknown;
    fullDetailRefKeys?: string[];
  } = {},
) {
  assert.equal(readModel.surface_kind, 'opl_current_owner_delta_read_model');
  assert.equal(readModel.schema_version, 'current-owner-delta-read-model.v1');
  assert.equal(readModel.compatibility_alias_for, undefined);
  assert.equal(readModel.compatibility_alias_policy, undefined);
  assert.equal(readModel.default_summary.summary_kind, 'owner_delta_only');
  assert.equal(readModel.default_summary.default_path_root, 'current_owner_delta');
  assert.equal(readModel.default_summary.audit_counts_are_first_screen, false);
  assert.equal(
    readModel.default_summary.count_summary_path,
    'current_owner_delta_read_model.owner_delta_audit_tail.count_summary',
  );
  assert.equal(typeof readModel.current_owner, 'string');
  assert.equal(typeof readModel.required_delta, 'string');
  assertCurrentOwnerDeltaProjection(readModel.current_owner_delta, {
    currentOwner: readModel.current_owner,
    requiredDelta: readModel.required_delta,
  });
  assert.equal(Array.isArray(readModel.accepted_return_shapes), true);
  assert.equal(readModel.accepted_return_shapes.length > 0, true);
  assert.equal(readModel.accepted_return_shapes.includes('typed_blocker_ref'), true);
  if (typeof expected.currentOwner === 'string') {
    assert.equal(readModel.current_owner, expected.currentOwner);
  }
  if (typeof expected.requiredDelta === 'string') {
    assert.equal(readModel.required_delta, expected.requiredDelta);
  }
  if (Array.isArray(expected.acceptedReturnShapes)) {
    assert.deepEqual(readModel.accepted_return_shapes, expected.acceptedReturnShapes);
  }

  const auditTail = readModel.owner_delta_audit_tail;
  assert.equal(auditTail.surface_kind, 'opl_current_owner_delta_audit_tail');
  assert.equal(auditTail.audit_counts_are_first_screen, false);

  const readinessFalseFlags = auditTail.readiness_false_flags;
  assert.equal(typeof readinessFalseFlags, 'object');
  assert.equal(readinessFalseFlags.can_execute_domain_action, false);
  assert.equal(readinessFalseFlags.can_write_domain_truth, false);
  assert.equal(readinessFalseFlags.can_create_owner_receipt, false);
  assert.equal(readinessFalseFlags.can_create_typed_blocker, false);
  assert.equal(readinessFalseFlags.can_close_owner_chain, false);
  assert.equal(readinessFalseFlags.can_close_domain_ready, false);
  assert.equal(readinessFalseFlags.can_claim_production_ready, false);

  const countSummary = auditTail.count_summary;
  assert.equal(typeof countSummary, 'object');
  assert.equal(typeof countSummary.open_safe_action_count, 'number');
  assert.equal(typeof countSummary.payload_required_count, 'number');
  assert.equal(typeof countSummary.blocked_refs_only_count, 'number');
  assert.equal(typeof countSummary.domain_dispatch_workorder_count, 'number');
  if (typeof expected.openSafeActionCount === 'number') {
    assert.equal(countSummary.open_safe_action_count, expected.openSafeActionCount);
  }
  if (typeof expected.payloadRequiredCount === 'number') {
    assert.equal(countSummary.payload_required_count, expected.payloadRequiredCount);
  }
  if (typeof expected.domainDispatchWorkorderCount === 'number') {
    assert.equal(
      countSummary.domain_dispatch_workorder_count,
      expected.domainDispatchWorkorderCount,
    );
  }

  const nextSafeAction = readModel.next_safe_action_or_none;
  if (nextSafeAction !== null) {
    assert.equal(typeof nextSafeAction, 'object');
    assert.equal(hasOwnNestedKey(nextSafeAction, 'payload_template'), false);
    if ('payload_workorder' in nextSafeAction && nextSafeAction.payload_workorder) {
      assert.equal(
        nextSafeAction.payload_workorder.empty_payload_template_is_success_evidence,
        false,
      );
    }
  }

  const fullDetailRefs = auditTail.full_detail_refs;
  assert.equal(typeof fullDetailRefs, 'object');
  for (const key of expected.fullDetailRefKeys ?? ['owner_delta_first_ref']) {
    assert.equal(typeof fullDetailRefs[key], 'string');
  }
  for (const value of Object.values(fullDetailRefs)) {
    assert.equal(typeof value, 'string');
  }
  assert.equal(JSON.stringify(fullDetailRefs).includes('payload_template'), false);
  assert.equal('domain_ready_verdict' in readModel, false);
  assert.equal('production_ready_verdict' in readModel, false);
  assert.equal('quality_verdict' in readModel, false);
}

export function assertCurrentOwnerDeltaProjection(
  currentOwnerDelta: JsonRecord,
  expected: {
    currentOwner?: unknown;
    requiredDelta?: unknown;
  } = {},
) {
  assert.equal(currentOwnerDelta.surface_kind, 'opl_current_owner_delta');
  assert.equal(currentOwnerDelta.schema_version, 'current-owner-delta.v1');
  assert.equal(
    currentOwnerDelta.projection_policy,
    'default_owner_delta_root_audit_tail_passive',
  );
  assert.equal(
    currentOwnerDelta.default_planning_root,
    'current_owner_delta_or_provider_human_hard_gate',
  );
  assert.equal(
    currentOwnerDelta.audit_tail_policy,
    'raw_worklist_raw_evidence_replay_typed_blocker_group_private_residue_are_passive_until_folded',
  );
  assert.equal(
    currentOwnerDelta.evidence_vault_policy,
    'record_everything_plan_from_nothing',
  );
  assert.equal(typeof currentOwnerDelta.delta_id, 'string');
  assert.equal(typeof currentOwnerDelta.current_owner, 'string');
  assert.equal(typeof currentOwnerDelta.desired_delta_description, 'string');
  assert.equal(Array.isArray(currentOwnerDelta.accepted_answer_shape), true);
  assert.equal(currentOwnerDelta.accepted_answer_shape.includes('typed_blocker_ref'), true);
  if (typeof expected.currentOwner === 'string') {
    assert.equal(currentOwnerDelta.current_owner, expected.currentOwner);
  }
  if (typeof expected.requiredDelta === 'string') {
    assert.equal(currentOwnerDelta.desired_delta_description, expected.requiredDelta);
  }
  assert.equal(typeof currentOwnerDelta.hard_gate, 'object');
  assert.equal(Array.isArray(currentOwnerDelta.advisory_warnings), true);
  assert.equal(typeof currentOwnerDelta.stop_loss_state, 'object');
  assert.equal(typeof currentOwnerDelta.audit_refs, 'object');
  assert.equal(typeof currentOwnerDelta.authority_boundary, 'object');
  assert.equal(currentOwnerDelta.authority_boundary.route_not_stage_strategy, true);
  assert.equal(
    currentOwnerDelta.authority_boundary.route_reconciler_role,
    'hydrate_reconcile_owner_routes_only',
  );
  assert.equal(
    currentOwnerDelta.authority_boundary.route_reconciler_can_generate_candidates,
    false,
  );
  assert.equal(
    currentOwnerDelta.authority_boundary.route_reconciler_can_evaluate_or_rank_candidates,
    false,
  );
  assert.equal(currentOwnerDelta.authority_boundary.route_reconciler_can_complete_stage, false);
  assert.equal(currentOwnerDelta.authority_boundary.route_reconciler_can_sign_receipts, false);
  assert.equal(currentOwnerDelta.authority_boundary.can_write_domain_truth, false);
  assert.equal(currentOwnerDelta.authority_boundary.can_create_owner_receipt, false);
  assert.equal(currentOwnerDelta.authority_boundary.can_create_typed_blocker, false);
  assert.equal(currentOwnerDelta.authority_boundary.can_close_domain_ready, false);
  assert.equal(
    currentOwnerDelta.authority_boundary.raw_evidence_can_drive_default_planning,
    false,
  );
  assert.equal(
    currentOwnerDelta.authority_boundary.raw_worklist_can_drive_default_planning,
    false,
  );
  assert.equal(
    currentOwnerDelta.authority_boundary.replay_packet_can_drive_default_planning,
    false,
  );
  assert.equal(
    currentOwnerDelta.authority_boundary.typed_blocker_group_can_drive_default_planning,
    false,
  );
  assert.equal(
    currentOwnerDelta.authority_boundary.private_residue_inventory_can_drive_default_planning,
    false,
  );
  assert.equal(currentOwnerDelta.authority_boundary.audit_tail_can_drive_default_planning, false);
  assert.equal(typeof currentOwnerDelta.cognitive_kernel_boundary, 'object');
  assert.equal(
    currentOwnerDelta.cognitive_kernel_boundary.envelope_semantics,
    'stage_goal_context_authority_boundary_available_affordances_quality_gate',
  );
  assert.equal(
    currentOwnerDelta.cognitive_kernel_boundary.tool_affordance_policy,
    'available_affordances_not_workflow_script',
  );
  assert.equal(
    currentOwnerDelta.cognitive_kernel_boundary.closeout_policy,
    'actual_tool_evidence_artifact_owner_answer_or_typed_blocker_refs_only',
  );
  assert.equal(currentOwnerDelta.cognitive_kernel_boundary.authority_boundary.can_write_domain_truth, false);
  assert.equal(currentOwnerDelta.cognitive_kernel_boundary.authority_boundary.can_authorize_quality_verdict, false);
  assert.equal(currentOwnerDelta.cognitive_kernel_boundary.authority_boundary.tool_affordance_can_override_stage_goal, false);
}

function hasOwnNestedKey(value: unknown, key: string): boolean {
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((entry) => hasOwnNestedKey(entry, key));
  }
  return Object.entries(value as JsonRecord).some(([entryKey, entryValue]) =>
    entryKey === key || hasOwnNestedKey(entryValue, key)
  );
}

function assertAppReleaseUserPathPayloadWorkorder(workorder: JsonRecord) {
  assert.equal(
    workorder.surface_kind,
    'opl_app_release_user_path_evidence_payload_workorder',
  );
  assert.equal(
    workorder.accepted_payload_path_policy,
    'real_app_release_user_path_refs_or_typed_blocker_path_empty_template_blocks',
  );
  assert.equal(
    workorder.accepted_payload_paths.app_release_user_path_refs_path
      .typed_blocker_refs_must_be_absent,
    true,
  );
  assert.equal(
    workorder.accepted_payload_paths.app_release_user_path_refs_path
      .closes_app_release_user_path,
    false,
  );
  assert.equal(workorder.accepted_payload_paths.typed_blocker_path.success_claimed, false);
  assert.equal(workorder.accepted_payload_paths.typed_blocker_path.closes_release_ready, false);
  assert.equal(workorder.accepted_payload_paths.typed_blocker_path.closes_production_ready, false);
  assert.equal(workorder.empty_payload_template_is_success_evidence, false);
  assert.equal(workorder.authority_boundary.can_create_owner_receipt, false);
  assert.equal(workorder.authority_boundary.can_generate_typed_blocker, false);
  assert.equal(workorder.authority_boundary.can_claim_release_ready, false);
  assert.equal(workorder.authority_boundary.can_claim_production_ready, false);
  assert.equal(workorder.authority_boundary.can_close_app_release_user_path, false);
  assert.equal(workorder.required_operator_payload_refs.includes('typed_blocker_refs'), true);
  assert.equal(workorder.required_return_shapes.includes('typed_blocker_ref'), true);
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

export function assertOwnerDeltaFirstReadinessProjection(readiness: JsonRecord) {
  const summary = readiness.summary;
  const attention = readiness.attention_first_payload;
  const ownerDeltaFirst = attention.owner_delta_first;
  const ownerDeltaHandoffSummary = attention.owner_delta_handoff_summary;
  const ownerDeltaHandoffWorkorder = ownerDeltaHandoffSummary.owner_payload_workorder;
  const nextSafeActions = attention.next_safe_actions;
  assert.deepEqual(
    readiness.current_owner_delta_read_model,
    attention.current_owner_delta_read_model,
  );
  assert.deepEqual(
    readiness.current_owner_delta,
    attention.current_owner_delta,
  );
  assert.deepEqual(
    readiness.current_owner_delta,
    readiness.current_owner_delta_read_model.current_owner_delta,
  );
  assertCurrentOwnerDeltaProjection(readiness.current_owner_delta, {
    currentOwner: ownerDeltaFirst.next_owner,
    requiredDelta: ownerDeltaFirst.next_required_delta,
  });
  assertCurrentOwnerDeltaReadModel(readiness.current_owner_delta_read_model, {
    currentOwner: ownerDeltaFirst.next_owner,
    requiredDelta: ownerDeltaFirst.next_required_delta,
    ...(ownerDeltaFirst.required_return_shapes.length > 0
      ? { acceptedReturnShapes: ownerDeltaFirst.required_return_shapes }
      : {}),
    openSafeActionCount: readiness.evidence_worklist.open_safe_action_item_count,
    payloadRequiredCount:
      readiness.evidence_worklist.open_safe_action_payload_required_item_count,
    domainDispatchWorkorderCount:
      readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary
        .workorder_count,
    fullDetailRefKeys: [
      'owner_delta_first_ref',
      'owner_handoff_packet_ref',
      'evidence_worklist_ref',
      'app_operator_drilldown_ref',
    ],
  });
  assert.equal(readiness.operator_next_owner, readiness.current_owner_delta.current_owner);
  assert.equal(
    readiness.operator_required_delta,
    readiness.current_owner_delta.desired_delta_description,
  );
  assert.equal(
    readiness.operator_payload_requirement,
    readiness.current_owner_delta.payload_requirement,
  );
  assert.deepEqual(
    readiness.operator_accepted_answer_shape,
    readiness.current_owner_delta.accepted_answer_shape,
  );
  assert.equal(readiness.stage_run_cockpit_summary.refs_only, true);
  assert.equal(
    readiness.stage_run_cockpit_summary.current_owner,
    readiness.current_owner_delta.current_owner,
  );

  assert.equal(readiness.owner_delta_first.surface_kind, 'opl_owner_delta_first_projection');
  assert.equal(ownerDeltaFirst.surface_kind, 'opl_owner_delta_first_projection');
  assert.equal(readiness.owner_delta_first.next_owner, ownerDeltaFirst.next_owner);
  assert.equal(readiness.owner_delta_first.next_required_delta, ownerDeltaFirst.next_required_delta);
  assert.equal(
    readiness.owner_delta_handoff_summary.surface_kind,
    'opl_framework_owner_delta_handoff_summary',
  );
  assert.equal(
    ownerDeltaHandoffSummary.surface_kind,
    'opl_framework_owner_delta_handoff_summary',
  );
  assert.equal(
    readiness.owner_delta_handoff_summary.status,
    ownerDeltaHandoffSummary.status,
  );
  assert.equal(
    readiness.owner_delta_handoff_summary.current_operator_action_state,
    ownerDeltaHandoffSummary.current_operator_action_state,
  );
  assert.equal(
    readiness.owner_delta_handoff_summary.next_owner,
    ownerDeltaHandoffSummary.next_owner,
  );
  assert.equal(summary.owner_delta_handoff_status, ownerDeltaHandoffSummary.status);
  assert.equal(
    summary.owner_delta_handoff_current_operator_action_state,
    ownerDeltaHandoffSummary.current_operator_action_state,
  );
  assert.equal(summary.owner_delta_handoff_next_owner, ownerDeltaHandoffSummary.next_owner);
  assert.equal(
    attention.summary.owner_delta_handoff_current_operator_action_state,
    ownerDeltaHandoffSummary.current_operator_action_state,
  );
  assert.equal(
    ownerDeltaHandoffSummary.projection_policy,
    'first_class_owner_delta_handoff_default_read_model_over_owner_delta_first_owner_handoff_and_evidence_worklist',
  );
  assert.equal(
    ownerDeltaHandoffSummary.source_refs.owner_delta_first_ref,
    '/framework_readiness/owner_delta_first',
  );
  assert.equal(
    ownerDeltaHandoffSummary.source_refs.owner_handoff_packet_ref,
    '/framework_readiness/owner_handoff_packet',
  );
  assert.equal(typeof ownerDeltaHandoffSummary.current_operator_action_state, 'string');
  assert.equal(typeof ownerDeltaHandoffSummary.next_required_delta, 'string');
  assert.equal(Array.isArray(ownerDeltaHandoffSummary.required_refs_any_of), true);
  assert.equal(Array.isArray(ownerDeltaHandoffSummary.required_return_shapes), true);
  assert.equal(ownerDeltaHandoffSummary.required_refs_any_of.length > 0, true);
  assert.equal(ownerDeltaHandoffSummary.required_return_shapes.length > 0, true);
  assert.equal(
    ownerDeltaHandoffSummary.required_return_shapes.includes('typed_blocker_ref'),
    true,
  );
  if (ownerDeltaHandoffWorkorder.surface_kind === 'opl_owner_handoff_payload_workorder') {
    assert.equal(ownerDeltaHandoffSummary.payload_contract_source, 'owner_handoff_packet');
    assert.equal(
      ownerDeltaHandoffSummary.top_payload_kind,
      'domain_owner_receipt_or_typed_blocker_refs',
    );
    assert.equal(
      ownerDeltaHandoffSummary.payload_path_policy,
      'operator_must_choose_success_refs_path_or_domain_owned_typed_blocker_path_empty_template_blocks',
    );
    assert.equal(
      ownerDeltaHandoffSummary.accepted_payload_paths.success_refs_path.closes_domain_ready,
      false,
    );
    assert.equal(
      ownerDeltaHandoffSummary.accepted_payload_paths.typed_blocker_path.success_claimed,
      false,
    );
    assertOwnerPayloadWorkorderProjection(ownerDeltaHandoffSummary);
  } else {
    assert.equal(
      ownerDeltaHandoffSummary.payload_contract_source,
      'owner_delta_first_selected_safe_action',
    );
    assertAppReleaseUserPathPayloadWorkorder(ownerDeltaHandoffWorkorder);
    assert.deepEqual(
      ownerDeltaHandoffSummary.accepted_payload_paths,
      ownerDeltaHandoffWorkorder.accepted_payload_paths,
    );
  }
  assert.equal(ownerDeltaHandoffSummary.empty_payload_template_is_success_evidence, false);
  assert.equal(
    ownerDeltaHandoffSummary.summary.open_safe_action_payload_required_item_count,
    readiness.evidence_worklist.open_safe_action_payload_required_item_count,
  );
  assert.equal(
    ownerDeltaHandoffSummary.summary.open_safe_action_payload_free_item_count,
    readiness.evidence_worklist.open_safe_action_payload_free_item_count,
  );
  assert.equal(
    ownerDeltaHandoffSummary.summary.owner_handoff_owner_count,
    readiness.owner_handoff_packet.owner_count,
  );
  assert.equal(
    ownerDeltaHandoffSummary.summary.domain_dispatch_workorder_count,
    readiness.evidence_worklist.domain_dispatch_evidence_workorder_packet_summary.workorder_count,
  );
  assert.equal(ownerDeltaHandoffSummary.authority_boundary.can_execute_domain_action, false);
  assert.equal(ownerDeltaHandoffSummary.authority_boundary.can_write_domain_truth, false);
  assert.equal(ownerDeltaHandoffSummary.authority_boundary.can_create_owner_receipt, false);
  assert.equal(ownerDeltaHandoffSummary.authority_boundary.can_create_typed_blocker, false);
  assert.equal(ownerDeltaHandoffSummary.authority_boundary.can_close_owner_chain, false);
  assert.equal(ownerDeltaHandoffSummary.authority_boundary.can_close_domain_ready, false);
  assert.equal(ownerDeltaHandoffSummary.authority_boundary.can_claim_production_ready, false);
  assert.equal(ownerDeltaHandoffSummary.authority_boundary.owner_delta_handoff_is_projection_only, true);
  assert.equal(
    ownerDeltaFirst.projection_policy,
    'default_operator_surface_prioritizes_next_owner_delta_raw_refs_only_counters_are_drilldown',
  );
  assert.equal(
    ownerDeltaFirst.raw_attention_default_policy,
    'blocked_refs_only_envelopes_stage_replay_packets_and_ledger_counters_are_full_detail_drilldown_not_primary_operator_next_step',
  );
  assert.equal(typeof ownerDeltaFirst.next_owner, 'string');
  assert.equal(typeof ownerDeltaFirst.next_required_delta, 'string');
  assert.equal(Array.isArray(ownerDeltaFirst.full_detail_sections), true);
  assert.equal(
    ownerDeltaFirst.full_detail_sections.includes('attention_first_payload.workstream_operating_loop'),
    true,
  );
  assert.equal(ownerDeltaFirst.authority_boundary.can_create_owner_receipt, false);
  assert.equal(ownerDeltaFirst.authority_boundary.can_create_typed_blocker, false);
  assert.equal(ownerDeltaFirst.authority_boundary.can_close_domain_ready, false);
  assert.equal(ownerDeltaFirst.authority_boundary.can_claim_production_ready, false);

  assert.equal(Array.isArray(nextSafeActions), true);
  assert.equal(nextSafeActions.length > 0, true);
  assert.equal(nextSafeActions.length <= 5, true);
  assert.equal(
    summary.operator_actionable_attention_tail_count,
    summary.operator_payload_required_attention_tail_count
      + summary.operator_payload_free_attention_tail_count,
  );
  assert.equal(
    summary.total_operator_attention_tail_count,
    summary.operator_actionable_attention_tail_count
      + summary.domain_blocked_attention_tail_count,
  );
  assert.equal(
    [
      'domain_owned_typed_blocker_refs_union_grouped_for_attention_only_raw_tail_counts_preserved',
      'domain_blocked_attention_refs_grouped_for_attention_only_raw_tail_counts_preserved',
    ].includes(summary.domain_blocked_attention_grouping_semantics),
    true,
  );
  assert.equal(
    attention.summary.operator_actionable_attention_tail_count,
    summary.operator_actionable_attention_tail_count,
  );
  assert.equal(
    attention.summary.domain_blocked_attention_tail_count,
    summary.domain_blocked_attention_tail_count,
  );
  assert.equal(readiness.evidence_worklist.worklist_item_is_completion_claim, false);
  assert.equal(readiness.authority_boundary.safe_action_route_is_receipt_closure, false);
  assert.equal(
    readiness.evidence_envelope.claim_policy,
    'owner_receipt_and_typed_blocker_refs_only_no_domain_or_production_ready_verdict',
  );

  if (
    summary.operator_actionable_attention_tail_count === 0
    && summary.domain_blocked_attention_tail_count > 0
  ) {
    const blockedRefsOnlyAction = nextSafeActions[0];
    assert.equal(blockedRefsOnlyAction.action_kind, 'blocked_refs_only_attention_review');
    assert.equal(blockedRefsOnlyAction.authority, 'refs_only_review');
    assert.equal(blockedRefsOnlyAction.can_submit_record_to_safe_action_shell, false);
    assert.equal(blockedRefsOnlyAction.can_create_owner_receipt, false);
    assert.equal(blockedRefsOnlyAction.can_create_typed_blocker, false);
    assert.equal(blockedRefsOnlyAction.can_close_domain_ready, false);
    assert.equal(blockedRefsOnlyAction.can_claim_production_ready, false);
  }
}

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
