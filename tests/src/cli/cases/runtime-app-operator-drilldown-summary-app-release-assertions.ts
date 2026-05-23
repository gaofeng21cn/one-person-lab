import { assert } from '../helpers.ts';

export function assertAppReleaseUserPathSummary(summaryDrilldown: any) {
  assert.equal(summaryDrilldown.summary.app_release_user_path_evidence_gate_count, 5);
  assert.equal(summaryDrilldown.summary.app_release_user_path_evidence_open_gate_count, 5);
  assert.equal(summaryDrilldown.summary.app_release_user_path_production_user_path_ready, false);
  assert.equal(summaryDrilldown.summary.app_release_user_path_release_ready_claimed, false);
  assert.equal(summaryDrilldown.summary.app_release_user_path_production_ready_claimed, false);
}

export function assertAppReleaseUserPathAttention(summaryDrilldown: any) {
  const appUserPathEvidence =
    summaryDrilldown.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
  assert.equal(
    appUserPathEvidence.surface_kind,
    'opl_app_drilldown_app_release_user_path_evidence_attention',
  );
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
  assert.equal(appUserPathEvidence.authority_boundary.can_create_owner_receipt, false);
  assert.equal(appUserPathEvidence.authority_boundary.can_claim_production_ready, false);
  assert.equal(appUserPathEvidence.authority_boundary.can_close_app_release_user_path, false);
}

export function assertAppReleaseUserPathNextStep(summaryDrilldown: any) {
  const appUserPathStep = summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
    (item: { step_kind: string }) => item.step_kind === 'app_release_user_path_evidence',
  );
  assert.equal(Boolean(appUserPathStep), true);
  assert.equal(appUserPathStep.open_gate_count, 5);
  assert.equal(appUserPathStep.production_user_path_ready, false);
  assert.equal(appUserPathStep.refs_observed_for_all_gates, false);
  assert.equal(appUserPathStep.release_ready_claimed, false);
  assert.equal(appUserPathStep.production_ready_claimed, false);
  assert.equal(appUserPathStep.can_close_app_release_user_path, false);
  assert.equal(appUserPathStep.required_return_shapes.includes('typed_blocker_ref'), true);
  assert.equal(
    appUserPathStep.record_action_id,
    'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
  );
  assert.equal(
    appUserPathStep.record_command_ref,
    'opl runtime app-release-evidence record',
  );
  assert.equal(appUserPathStep.can_submit_record_to_safe_action_shell, true);
  assert.equal(appUserPathStep.route_requires_domain_or_app_payload, true);
  assert.equal(appUserPathStep.payload_template.release_package_refs.length, 0);
  assert.equal(appUserPathStep.payload_ref_hints.typed_blocker_refs_should_cover[0], 'typed_blocker_ref');
  assert.equal(
    appUserPathStep.payload_template_policy,
    'template_is_empty_by_design_replace_with_real_app_live_release_or_typed_blocker_refs_before_submit',
  );
}
