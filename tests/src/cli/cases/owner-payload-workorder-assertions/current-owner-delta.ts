import { assert } from '../../helpers.ts';

type JsonRecord = Record<string, any>;

const FALSE_AUTHORITY_FIELDS = [
  'can_execute_domain_action',
  'can_write_domain_truth',
  'can_create_owner_receipt',
  'can_create_typed_blocker',
  'can_close_domain_ready',
  'can_claim_production_ready',
];

function assertFalseAuthority(boundary: JsonRecord, extra: string[] = []) {
  assert.equal(typeof boundary, 'object');
  for (const field of [...FALSE_AUTHORITY_FIELDS, ...extra]) {
    if (field in boundary) assert.equal(boundary[field], false, field);
  }
}

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
  assert.equal(readModel.default_summary.default_path_root, 'current_owner_delta');
  assert.deepEqual(readModel.current_owner_delta.current_owner, readModel.current_owner);
  assert.deepEqual(readModel.current_owner_delta.desired_delta_description, readModel.required_delta);
  assertCurrentOwnerDeltaProjection(readModel.current_owner_delta, {
    currentOwner: expected.currentOwner ?? readModel.current_owner,
    requiredDelta: expected.requiredDelta ?? readModel.required_delta,
    acceptedAnswerShapeIncludes: expected.acceptedAnswerShapeIncludes,
  });

  assert.equal(Array.isArray(readModel.accepted_return_shapes), true);
  if (Array.isArray(expected.acceptedReturnShapes)) {
    assert.deepEqual(readModel.accepted_return_shapes, expected.acceptedReturnShapes);
  }
  assert.equal(readModel.owner_delta_audit_tail.audit_counts_are_first_screen, false);
  assertFalseAuthority(readModel.owner_delta_audit_tail.readiness_false_flags);

  const counts = readModel.owner_delta_audit_tail.count_summary;
  if (expected.openSafeActionCount !== undefined) {
    assert.equal(counts.open_safe_action_count, expected.openSafeActionCount);
  }
  if (expected.payloadRequiredCount !== undefined) {
    assert.equal(counts.payload_required_count, expected.payloadRequiredCount);
  }
  if (expected.domainDispatchWorkorderCount !== undefined) {
    assert.equal(counts.domain_dispatch_workorder_count, expected.domainDispatchWorkorderCount);
  }
  for (const key of expected.fullDetailRefKeys ?? []) {
    assert.equal(typeof readModel.full_detail_refs[key], 'string', key);
  }

  const nextAction = readModel.next_safe_action_or_none;
  if (nextAction) {
    assert.equal(nextAction.derivation_source, 'current_owner_delta');
    assert.equal(nextAction.current_owner, readModel.current_owner);
    assertFalseAuthority(nextAction, ['can_close_without_domain_or_app_payload']);
  }
}

export function assertCurrentOwnerDeltaToplineNextAction(surface: JsonRecord) {
  const delta = surface.current_owner_delta;
  const nextAction = surface.current_owner_delta_read_model.next_safe_action_or_none;
  assert.deepEqual(surface.current_owner_delta_read_model.current_owner_delta, delta);
  assert.equal(surface.operator_current_owner_delta_owner, delta.current_owner);
  assert.equal(surface.operator_next_owner, delta.current_owner);
  assert.deepEqual(surface.current_owner_delta_next_action, nextAction);

  if (nextAction) {
    assert.equal(surface.operator_next_action_source, 'current_owner_delta');
    assert.equal(surface.operator_next_action_owner, delta.current_owner);
    assert.equal(surface.operator_next_action_kind, nextAction.action_kind);
  }
  assertFalseAuthority(surface.operator_next_action_authority_boundary, [
    'can_submit_to_safe_action_shell',
    'worklist_item_is_completion_claim',
  ]);

  const stageRunAction = surface.stage_run_cockpit?.next_required_owner_action;
  if (stageRunAction) assertStageRunAuthorizationNextAction(stageRunAction);
}

export function assertStageRunAuthorizationNextAction(action: JsonRecord) {
  assert.equal(
    action.surface_kind,
    'opl_stage_run_execution_authorization_next_required_owner_action',
  );
  assert.equal(
    action.action_kind,
    'stage_run_execution_authorization_or_closeout_binding_required',
  );
  assert.equal(action.current_owner, action.owner);
  assert.equal(action.next_required_owner, action.owner);
  assert.equal(Array.isArray(action.missing_input_refs), true);
  assert.equal(action.missing_input_refs.length > 0, true);
  assertFalseAuthority(action, [
    'domain_truth_changed',
    'owner_receipt_signed',
    'domain_typed_blocker_created',
    'execution_blocker_is_domain_typed_blocker',
  ]);
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
  assert.equal(currentOwnerDelta.default_planning_root, 'current_owner_delta');
  assert.equal(typeof currentOwnerDelta.delta_id, 'string');
  assert.equal(typeof currentOwnerDelta.current_owner, 'string');
  assert.equal(typeof currentOwnerDelta.desired_delta_description, 'string');
  assert.equal(typeof currentOwnerDelta.source_fingerprint, 'string');
  assert.equal(Array.isArray(currentOwnerDelta.accepted_answer_shape), true);
  for (const shape of expected.acceptedAnswerShapeIncludes ?? ['typed_blocker_ref']) {
    assert.equal(currentOwnerDelta.accepted_answer_shape.includes(shape), true, shape);
  }
  if (typeof expected.currentOwner === 'string') {
    assert.equal(currentOwnerDelta.current_owner, expected.currentOwner);
  }
  if (typeof expected.requiredDelta === 'string') {
    assert.equal(currentOwnerDelta.desired_delta_description, expected.requiredDelta);
  }

  assert.equal(
    currentOwnerDelta.ordinary_progress_spine.default_next_action_derives_from,
    'current_owner_delta',
  );
  assert.equal(
    currentOwnerDelta.progress_delta_receipt.stage_transition_requires_owner_receipt_or_typed_blocker,
    true,
  );
  assert.equal(
    currentOwnerDelta.audit_sidecar_policy.blocked_refs_only_can_generate_default_next_action,
    false,
  );
  assertFalseAuthority(currentOwnerDelta.authority_boundary, [
    'raw_evidence_can_drive_default_planning',
    'raw_worklist_can_drive_default_planning',
    'audit_tail_can_drive_default_planning',
    'blocked_refs_only_can_drive_default_planning',
  ]);
  assertFalseAuthority(currentOwnerDelta.cognitive_kernel_boundary.authority_boundary, [
    'can_authorize_quality_verdict',
    'tool_affordance_can_override_stage_goal',
  ]);
}
