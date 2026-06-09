import { assert } from '../../helpers.ts';

type JsonRecord = Record<string, any>;

export function assertCurrentOwnerDeltaReadModel(
  readModel: JsonRecord,
  expected: {
    currentOwner?: unknown;
    requiredDelta?: unknown;
    acceptedReturnShapes?: unknown;
    acceptedAnswerShapeIncludes?: string[];
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
  assert.equal(
    readModel.projection_policy,
    'current_owner_delta_is_the_only_default_operator_payload_raw_refs_require_explicit_full_detail',
  );
  assert.equal(
    readModel.default_next_action_derivation_policy,
    'derive_default_next_action_only_from_current_owner_delta',
  );
  assert.equal(readModel.default_summary.ordinary_progress_spine_ref, '/current_owner_delta/ordinary_progress_spine');
  assert.equal(readModel.default_summary.progress_delta_receipt_ref, '/current_owner_delta/progress_delta_receipt');
  assert.equal(readModel.default_summary.artifact_tier_policy_ref, '/current_owner_delta/artifact_tier_policy');
  assert.equal(readModel.default_summary.audit_sidecar_policy_ref, '/current_owner_delta/audit_sidecar_policy');
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
    acceptedAnswerShapeIncludes: expected.acceptedAnswerShapeIncludes,
  });
  assert.equal(Array.isArray(readModel.accepted_return_shapes), true);
  assert.equal(readModel.accepted_return_shapes.length > 0, true);
  for (const shape of expected.acceptedAnswerShapeIncludes ?? ['typed_blocker_ref']) {
    assert.equal(readModel.accepted_return_shapes.includes(shape), true);
  }
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
  assert.deepEqual(auditTail.audit_sidecar_policy, readModel.audit_sidecar_policy);

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

export function assertCurrentOwnerDeltaToplineNextAction(surface: JsonRecord) {
  const stageRunAction = surface.stage_run_cockpit?.next_required_owner_action ?? null;
  const ownerDeltaNextAction = surface.current_owner_delta_read_model.next_safe_action_or_none;
  const ownerAnswerMissing =
    stageRunAction?.owner_answer_missing_before_opl_closeout_binding === true;
  const expectedNextAction =
    ownerAnswerMissing && ownerDeltaNextAction
      ? {
          ...ownerDeltaNextAction,
          missing_input_refs: stageRunAction.missing_input_refs,
          required_ref_shape: stageRunAction.required_ref_shape,
          stage_run_closeout_binding_ref: '/stage_run_cockpit/execution_authorization',
          stage_run_closeout_binding_policy:
            'domain_owner_answer_must_bind_stage_run_manifest_current_pointer_source_fingerprint_and_idempotency',
        }
      : ownerDeltaNextAction;
  assert.deepEqual(
    surface.operator_next_action,
    expectedNextAction,
  );
  assert.deepEqual(
    surface.current_owner_delta_next_action,
    ownerDeltaNextAction,
  );
  const boundary = surface.operator_next_action_authority_boundary;
  if (expectedNextAction === null) {
    assert.equal(surface.operator_next_action_kind, null);
    assert.equal(surface.operator_next_action_owner, surface.operator_next_owner);
    assert.equal(boundary.derivation_source, null);
    assert.equal(boundary.default_planning_root, null);
    assert.equal(boundary.route_requires_domain_or_app_payload, false);
  } else {
    assert.equal(
      surface.operator_next_action_kind,
      expectedNextAction.action_kind,
    );
    assert.equal(surface.operator_next_action_owner, surface.operator_next_owner);
    assert.equal(boundary.derivation_source, expectedNextAction.derivation_source);
    assert.equal(boundary.default_planning_root, expectedNextAction.default_planning_root);
    assert.equal(
      boundary.route_requires_domain_or_app_payload,
      expectedNextAction.route_requires_domain_or_app_payload === true,
    );
  }
  if (stageRunAction !== null) {
    assertStageRunAuthorizationNextAction(stageRunAction as JsonRecord);
    assert.deepEqual(surface.stage_run_next_required_owner_action, stageRunAction);
    assert.equal(
      surface.operator_next_action_source,
      ownerAnswerMissing || ownerDeltaNextAction ? 'current_owner_delta' : null,
    );
    assert.equal(surface.operator_next_owner, surface.operator_current_owner_delta_owner);
    assert.equal(
      surface.operator_next_required_action,
      ownerAnswerMissing || ownerDeltaNextAction
        ? (ownerDeltaNextAction?.next_required_action ?? ownerDeltaNextAction?.action_kind)
        : null,
    );
    assert.equal(
      surface.operator_payload_requirement,
      surface.current_owner_delta.payload_requirement,
    );
    assert.deepEqual(
      surface.operator_accepted_answer_shape,
      ownerDeltaNextAction?.accepted_answer_shape ?? surface.current_owner_delta.accepted_answer_shape,
    );
    assert.equal(
      boundary.derivation_source,
      ownerAnswerMissing || ownerDeltaNextAction ? 'current_owner_delta' : null,
    );
    assert.equal(
      boundary.default_planning_root,
      ownerAnswerMissing || ownerDeltaNextAction ? 'current_owner_delta' : null,
    );
    assert.equal(boundary.route_requires_opl_runtime_refs, false);
    assert.equal(
      boundary.route_requires_domain_or_app_payload,
      ownerDeltaNextAction?.route_requires_domain_or_app_payload === true,
    );
    assert.equal(
      surface.stage_run_cockpit_summary.next_required_action,
      ownerAnswerMissing
        ? surface.current_owner_delta.desired_delta_description
        : 'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs',
    );
    assert.equal(
      surface.stage_run_cockpit_summary.next_required_owner,
      ownerAnswerMissing ? surface.operator_current_owner_delta_owner : 'one-person-lab',
    );
    assert.equal(surface.stage_run_cockpit_summary.domain_typed_blocker_created, false);
    if (ownerAnswerMissing) {
      assert.deepEqual(
        surface.operator_next_missing_input_refs,
        stageRunAction.missing_input_refs,
      );
      assert.deepEqual(surface.operator_next_action.missing_input_refs, stageRunAction.missing_input_refs);
      assert.deepEqual(surface.operator_next_action.required_ref_shape, stageRunAction.required_ref_shape);
      assert.equal(
        surface.operator_next_action.stage_run_closeout_binding_ref,
        '/stage_run_cockpit/execution_authorization',
      );
      assert.equal(
        surface.operator_next_action.stage_run_closeout_binding_policy,
        'domain_owner_answer_must_bind_stage_run_manifest_current_pointer_source_fingerprint_and_idempotency',
      );
      assert.equal(
        surface.operator_next_stage_run_closeout_binding_ref,
        '/stage_run_cockpit/execution_authorization',
      );
      assert.equal(
        surface.operator_next_stage_run_closeout_binding_policy,
        'domain_owner_answer_must_bind_stage_run_manifest_current_pointer_source_fingerprint_and_idempotency',
      );
    } else {
      assert.deepEqual(
        surface.operator_next_missing_input_refs,
        expectedNextAction?.missing_input_refs ?? [],
      );
    }
    assert.deepEqual(surface.stage_run_next_missing_input_refs, stageRunAction.missing_input_refs);
    assert.deepEqual(
      surface.stage_run_cockpit_summary.missing_input_refs,
      stageRunAction.missing_input_refs,
    );
    const stageRunBoundary =
      surface.stage_run_execution_authorization_next_action_authority_boundary;
    assert.equal(stageRunBoundary.derivation_source, 'stage_run_execution_authorization');
    assert.equal(
      stageRunBoundary.default_planning_root,
      'stage_run_execution_authorization_or_closeout_binding',
    );
    assert.equal(stageRunBoundary.route_requires_opl_runtime_refs, !ownerAnswerMissing);
    assert.equal(stageRunBoundary.route_requires_domain_or_app_payload, ownerAnswerMissing);
    assert.equal(stageRunBoundary.domain_typed_blocker_created, false);
    assert.equal(stageRunBoundary.execution_blocker_is_domain_typed_blocker, false);
  }
  assert.equal(boundary.can_submit_to_safe_action_shell, false);
  assert.equal(boundary.can_execute_domain_action, false);
  assert.equal(boundary.can_write_domain_truth, false);
  assert.equal(boundary.can_create_owner_receipt, false);
  assert.equal(boundary.can_create_typed_blocker, false);
  assert.equal(boundary.can_close_domain_ready, false);
  assert.equal(boundary.can_claim_production_ready, false);
  assert.equal(boundary.worklist_item_is_completion_claim, false);
}

export function assertStageRunAuthorizationNextAction(action: JsonRecord) {
  const ownerAnswerMissing =
    action.owner_answer_missing_before_opl_closeout_binding === true;
  assert.equal(
    action.surface_kind,
    'opl_stage_run_execution_authorization_next_required_owner_action',
  );
  assert.equal(
    action.action_kind,
    'stage_run_execution_authorization_or_closeout_binding_required',
  );
  if (ownerAnswerMissing) {
    assert.equal(typeof action.owner, 'string');
    assert.equal(action.owner.length > 0, true);
    assert.notEqual(action.owner, 'one-person-lab');
  } else {
    assert.equal(action.owner, 'one-person-lab');
  }
  assert.equal(action.current_owner, action.owner);
  assert.equal(action.next_required_owner, action.owner);
  assert.equal(
    typeof action.next_required_action,
    'string',
  );
  assert.equal(action.next_required_action.length > 0, true);
  if (ownerAnswerMissing) {
    assert.notEqual(
      action.next_required_action,
      'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs',
    );
  } else {
    assert.equal(
      action.next_required_action,
      'record_opl_provider_attempt_lease_authorization_and_closeout_receipt_binding_refs',
    );
  }
  if (ownerAnswerMissing) {
    assert.equal(typeof action.payload_requirement, 'string');
    assert.equal(action.payload_requirement.length > 0, true);
    assert.notEqual(
      action.payload_requirement,
      'opl_execution_authorization_and_closeout_binding_refs_required',
    );
  } else {
    assert.equal(
      action.payload_requirement,
      'opl_execution_authorization_and_closeout_binding_refs_required',
    );
  }
  assert.equal(action.missing_input_refs.length > 0, true);
  assert.equal(
    [
      'provider_attempt_ref',
      'attempt_lease_ref',
      'execution_authorization_decision_ref',
      'owner_answer_ref',
    ].some((ref) => action.missing_input_refs.includes(ref)),
    true,
  );
  assert.equal(
    action.required_ref_shape.execution_authorization_refs.includes('provider_attempt_ref'),
    true,
  );
  assert.equal(
    action.required_ref_shape.closeout_receipt_binding_refs.includes('owner_answer_ref'),
    true,
  );
  assert.equal(action.route_requires_opl_runtime_refs, !ownerAnswerMissing);
  assert.equal(action.route_requires_domain_or_app_payload, ownerAnswerMissing);
  assert.equal(action.can_execute_domain_action, false);
  assert.equal(action.can_write_domain_truth, false);
  assert.equal(action.can_create_owner_receipt, false);
  assert.equal(action.can_create_typed_blocker, false);
  assert.equal(action.domain_truth_changed, false);
  assert.equal(action.owner_receipt_signed, false);
  assert.equal(action.domain_typed_blocker_created, false);
  assert.equal(action.execution_blocker_is_domain_typed_blocker, false);
}

export function assertCurrentOwnerDeltaProjection(
  currentOwnerDelta: JsonRecord,
  expected: {
    currentOwner?: unknown;
    requiredDelta?: unknown;
    acceptedAnswerShapeIncludes?: string[];
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
    'current_owner_delta',
  );
  assert.equal(
    currentOwnerDelta.ordinary_progress_spine.surface_kind,
    'opl_ordinary_progress_spine_policy',
  );
  assert.equal(
    currentOwnerDelta.ordinary_progress_spine.default_planning_root,
    'current_owner_delta',
  );
  assert.equal(
    currentOwnerDelta.ordinary_progress_spine.default_next_action_derives_from,
    'current_owner_delta',
  );
  for (const forbiddenRoot of [
    'raw_worklist',
    'raw_evidence',
    'evidence_ledger',
    'provider_trace',
    'replay_packet',
    'typed_blocker_group',
    'private_residue_inventory',
    'audit_sidecar',
  ]) {
    assert.equal(
      currentOwnerDelta.ordinary_progress_spine.default_next_action_must_not_derive_from.includes(forbiddenRoot),
      true,
    );
  }
  assert.equal(currentOwnerDelta.ordinary_progress_spine.raw_worklist_can_generate_default_next_action, false);
  assert.equal(currentOwnerDelta.ordinary_progress_spine.evidence_sidecar_can_generate_default_next_action, false);
  assert.equal(
    currentOwnerDelta.progress_delta_receipt.surface_kind,
    'opl_progress_delta_receipt_policy',
  );
  assert.equal(
    currentOwnerDelta.progress_delta_receipt.stage_transition_requires_owner_receipt_or_typed_blocker,
    true,
  );
  assert.equal(currentOwnerDelta.progress_delta_receipt.cannot_authorize.includes('stage_complete'), true);
  assert.equal(currentOwnerDelta.progress_delta_receipt.cannot_authorize.includes('production_ready'), true);
  assert.equal(
    currentOwnerDelta.artifact_tier_policy.surface_kind,
    'opl_artifact_tier_policy',
  );
  assert.equal(
    currentOwnerDelta.artifact_tier_policy.tiers.T0_progress_delta.cannot_claim_stage_complete,
    true,
  );
  assert.equal(
    currentOwnerDelta.audit_sidecar_policy.surface_kind,
    'opl_audit_sidecar_policy',
  );
  assert.equal(
    currentOwnerDelta.audit_sidecar_policy.default_planning_role,
    'never_default_planning_root_until_folded_into_current_owner_delta',
  );
  assert.equal(currentOwnerDelta.audit_sidecar_policy.raw_worklist_can_generate_default_next_action, false);
  assert.equal(currentOwnerDelta.audit_sidecar_policy.raw_evidence_can_generate_default_next_action, false);
  assert.equal(currentOwnerDelta.audit_sidecar_policy.evidence_ledger_can_generate_default_next_action, false);
  assert.equal(currentOwnerDelta.audit_sidecar_policy.provider_trace_can_generate_default_next_action, false);
  assert.equal(currentOwnerDelta.audit_sidecar_policy.replay_packet_can_generate_default_next_action, false);
  assert.equal(currentOwnerDelta.audit_sidecar_policy.typed_blocker_group_can_generate_default_next_action, false);
  assert.equal(currentOwnerDelta.audit_sidecar_policy.private_residue_inventory_can_generate_default_next_action, false);
  assert.equal(currentOwnerDelta.audit_sidecar_policy.blocked_refs_only_can_generate_default_next_action, false);
  assert.equal(currentOwnerDelta.audit_sidecar_policy.audit_next_safe_action_can_generate_default_next_action, false);
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
  for (const shape of expected.acceptedAnswerShapeIncludes ?? ['typed_blocker_ref']) {
    assert.equal(currentOwnerDelta.accepted_answer_shape.includes(shape), true);
  }
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
  assert.equal(currentOwnerDelta.authority_boundary.blocked_refs_only_can_drive_default_planning, false);
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
