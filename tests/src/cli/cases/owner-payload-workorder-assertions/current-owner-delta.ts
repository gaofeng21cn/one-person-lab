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

function assertFalseAuthority(boundary: JsonRecord, fields: string[] = FALSE_AUTHORITY_FIELDS) {
  assert.equal(boundary !== null && typeof boundary === 'object', true);
  for (const field of fields) {
    assert.equal(Object.hasOwn(boundary, field), true, `${field} must be present`);
    assert.equal(boundary[field], false, field);
  }
}

export function assertCurrentOwnerDeltaToplineNextAction(surface: JsonRecord) {
  const delta = surface.current_owner_delta;
  const nextAction = surface.current_owner_delta_read_model.next_safe_action_or_none;
  const stageRunAction = surface.stage_run_cockpit?.next_required_owner_action ?? null;
  assert.deepEqual(surface.current_owner_delta_read_model.current_owner_delta, delta);
  assert.equal(surface.operator_current_owner_delta_owner, delta.current_owner);
  assert.equal(surface.operator_next_owner, delta.current_owner);
  assert.deepEqual(surface.current_owner_delta_next_action, nextAction);
  assert.deepEqual(surface.operator_next_action, nextAction);

  if (nextAction) {
    assert.equal(surface.operator_next_action_source, 'current_owner_delta');
    assert.equal(surface.operator_next_action_owner, delta.current_owner);
    assert.equal(surface.operator_next_action_kind, nextAction.action_kind);
  }
  assertFalseAuthority(surface.operator_next_action_authority_boundary, [
    ...FALSE_AUTHORITY_FIELDS,
    'can_submit_to_safe_action_shell',
    'worklist_item_is_completion_claim',
  ]);

  assert.equal(stageRunAction, null);
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
    currentOwnerDelta.progress_delta_receipt.stage_transition_accepts_consumable_artifact_progress,
    true,
  );
  assert.equal(
    currentOwnerDelta.progress_delta_receipt.quality_debt_transition_status,
    'completed_with_quality_debt',
  );
  assert.equal(
    currentOwnerDelta.progress_delta_receipt.owner_receipt_required_for_quality_or_ready_claim,
    true,
  );
  assert.equal(
    currentOwnerDelta.audit_sidecar_policy.blocked_refs_only_can_generate_default_next_action,
    false,
  );
  assertFalseAuthority(currentOwnerDelta.authority_boundary, [
    ...FALSE_AUTHORITY_FIELDS,
    'raw_evidence_can_drive_default_planning',
    'raw_worklist_can_drive_default_planning',
    'audit_tail_can_drive_default_planning',
    'blocked_refs_only_can_drive_default_planning',
  ]);
  const cognitiveBoundary = currentOwnerDelta.cognitive_kernel_boundary.authority_boundary;
  for (const field of [
    'can_write_domain_truth',
    'can_create_typed_blocker',
    'can_authorize_quality_verdict',
    'tool_affordance_can_override_stage_goal',
  ]) {
    assert.equal(Object.hasOwn(cognitiveBoundary, field), true, `${field} must be present`);
    assert.equal(cognitiveBoundary[field], false, field);
  }
}
