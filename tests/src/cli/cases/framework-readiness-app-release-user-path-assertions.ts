import { assert } from '../helpers.ts';

export function assertFrameworkAppReleaseUserPathEvidence(readiness: any) {
  const appUserPathEvidence =
    readiness.attention_first_payload.app_release_user_path_evidence;
  assert.equal(
    readiness.app_release_user_path_evidence.surface_kind,
    appUserPathEvidence.surface_kind,
  );
  assert.equal(appUserPathEvidence.surface_kind, 'opl_app_drilldown_app_release_user_path_evidence_attention');
  assert.equal(appUserPathEvidence.status, 'app_release_user_path_evidence_open');
  assert.equal(appUserPathEvidence.production_user_path_ready, false);
  assert.equal(appUserPathEvidence.refs_observed_for_all_gates, false);
  assert.equal(appUserPathEvidence.release_ready_claimed, false);
  assert.equal(appUserPathEvidence.production_ready_claimed, false);
  assert.equal(appUserPathEvidence.open_gate_count, 5);
  assert.deepEqual(appUserPathEvidence.open_gate_ids, [
    'release_package_refs',
    'screenshot_refs',
    'reload_prompt_user_path_refs',
    'provider_state_linkage_refs',
    'long_operator_evidence_refs',
  ]);
  assert.equal(appUserPathEvidence.required_return_shapes.includes('typed_blocker_ref'), true);
  assert.equal(appUserPathEvidence.authority_boundary.can_write_domain_truth, false);
  assert.equal(appUserPathEvidence.authority_boundary.can_create_owner_receipt, false);
  assert.equal(appUserPathEvidence.authority_boundary.can_close_domain_ready, false);
  assert.equal(appUserPathEvidence.authority_boundary.can_claim_production_ready, false);
  assert.equal(appUserPathEvidence.authority_boundary.can_close_app_release_user_path, false);
  return appUserPathEvidence;
}

export function assertFrameworkAppReleaseUserPathAction(
  nextSafeActions: any[],
  appUserPathEvidence: any,
) {
  const appReleaseUserPathIndex = nextSafeActions.findIndex(
    (action: { action_kind?: string }) =>
      action.action_kind === 'app_release_user_path_evidence_review',
  );
  const ownerPayloadIndex = nextSafeActions.findIndex(
    (action: { action_kind?: string }) => action.action_kind === 'owner_payload_group_scaleout',
  );
  assert.equal(appReleaseUserPathIndex >= 0, true);
  if (ownerPayloadIndex >= 0) {
    assert.equal(appReleaseUserPathIndex < ownerPayloadIndex, true);
  }
  const appUserPathAction = nextSafeActions[appReleaseUserPathIndex];
  assert.equal(Boolean(appUserPathAction), true);
  assert.equal(appUserPathAction.action_id, 'review_app_release_user_path_evidence');
  assert.equal(
    appUserPathAction.evidence_closure_gate,
    'app_release_package_screenshot_reload_provider_state_long_operator_gate',
  );
  assert.equal(appUserPathAction.open_gate_count, appUserPathEvidence.open_gate_count);
  assert.deepEqual(appUserPathAction.open_gate_ids, appUserPathEvidence.open_gate_ids);
  assert.equal(appUserPathAction.production_user_path_ready, false);
  assert.equal(appUserPathAction.refs_observed_for_all_gates, false);
  assert.equal(appUserPathAction.release_ready_claimed, false);
  assert.equal(appUserPathAction.production_ready_claimed, false);
  assert.equal(appUserPathAction.required_return_shapes.includes('typed_blocker_ref'), true);
  assert.equal(
    appUserPathAction.payload_workorder.surface_kind,
    'opl_app_release_user_path_evidence_payload_workorder',
  );
  assert.equal(
    appUserPathAction.payload_workorder.accepted_payload_path_policy,
    'real_app_release_user_path_refs_or_typed_blocker_path_empty_template_blocks',
  );
  assert.equal(
    appUserPathAction.payload_workorder.accepted_payload_paths
      .app_release_user_path_refs_path.closes_app_release_user_path,
    false,
  );
  assert.equal(
    appUserPathAction.payload_workorder.accepted_payload_paths
      .typed_blocker_path.success_claimed,
    false,
  );
  assert.equal(appUserPathAction.payload_workorder.empty_payload_template_is_success_evidence, false);
  assert.equal(
    appUserPathAction.payload_workorder.authority_boundary.can_create_owner_receipt,
    false,
  );
  assert.equal(
    appUserPathAction.payload_workorder.authority_boundary.can_generate_typed_blocker,
    false,
  );
  assert.equal(
    appUserPathAction.payload_workorder.authority_boundary.can_claim_release_ready,
    false,
  );
  assert.equal(appUserPathAction.can_write_domain_truth, false);
  assert.equal(appUserPathAction.can_create_owner_receipt, false);
  assert.equal(appUserPathAction.can_claim_production_ready, false);
  assert.equal(appUserPathAction.can_close_app_release_user_path, false);
}
