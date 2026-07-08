import { assert } from '../helpers.ts';

const appReleaseGateIds = [
  'release_package_refs',
  'screenshot_refs',
  'reload_prompt_user_path_refs',
  'provider_state_linkage_refs',
  'long_operator_evidence_refs',
];

function appUserPathStep(summaryDrilldown: any) {
  const step = summaryDrilldown.attention_first_payload.evidence_next_steps.items.find(
    (item: { step_kind: string }) => item.step_kind === 'app_release_user_path_evidence',
  );
  assert.ok(step);
  return step;
}

function assertAppReleaseWorkorder(workorder: any) {
  assert.equal(workorder.surface_kind, 'opl_app_release_user_path_evidence_payload_workorder');
  assert.equal(workorder.empty_payload_template_is_success_evidence, false);
  assert.equal(workorder.authority_boundary.can_create_owner_receipt, false);
  assert.equal(workorder.authority_boundary.can_claim_release_ready, false);
  assert.equal(workorder.authority_boundary.can_claim_production_ready, false);
  assert.equal(workorder.authority_boundary.can_close_app_release_user_path, false);
  assert.equal(workorder.accepted_payload_paths.app_release_user_path_refs_path.closes_app_release_user_path, false);
  assert.equal(workorder.accepted_payload_paths.release_owner_verdict_path.success_claimed_by_opl, false);
  assert.equal(workorder.accepted_payload_paths.typed_blocker_path.success_claimed, false);
}

export function assertAppReleaseUserPathSummary(summaryDrilldown: any) {
  assert.equal(summaryDrilldown.summary.app_release_user_path_evidence_gate_count, appReleaseGateIds.length);
  assert.equal(summaryDrilldown.summary.app_release_user_path_evidence_open_gate_count, appReleaseGateIds.length);
  assert.equal(summaryDrilldown.summary.app_release_user_path_production_user_path_ready, false);
  assert.equal(summaryDrilldown.summary.app_release_user_path_release_ready_claimed, false);
  assert.equal(summaryDrilldown.summary.app_release_user_path_production_ready_claimed, false);
}

export function assertAppReleaseUserPathAttention(summaryDrilldown: any) {
  const appUserPathEvidence =
    summaryDrilldown.attention_first_payload.evidence_after_contract
      .app_release_user_path_evidence;
  assert.equal(appUserPathEvidence.surface_kind, 'opl_app_drilldown_app_release_user_path_evidence_attention');
  assert.equal(appUserPathEvidence.status, 'app_release_user_path_evidence_open');
  assert.equal(appUserPathEvidence.production_user_path_ready, false);
  assert.equal(appUserPathEvidence.refs_observed_for_all_gates, false);
  assert.equal(appUserPathEvidence.release_ready_claimed, false);
  assert.equal(appUserPathEvidence.production_ready_claimed, false);
  assert.deepEqual(appUserPathEvidence.open_gate_ids, appReleaseGateIds);
  assert.equal(appUserPathEvidence.required_return_shapes.includes('typed_blocker_ref'), true);
  assert.equal(appUserPathEvidence.authority_boundary.can_create_owner_receipt, false);
  assert.equal(appUserPathEvidence.authority_boundary.can_claim_production_ready, false);
  assert.equal(appUserPathEvidence.authority_boundary.can_close_app_release_user_path, false);
}

export function assertAppReleaseUserPathAttentionCounts(summaryDrilldown: any) {
  const evidenceAfterContract = summaryDrilldown.attention_first_payload.evidence_after_contract;
  assert.equal(
    evidenceAfterContract.operator_actionable_attention_count,
    summaryDrilldown.summary.evidence_envelope_open_count
      + evidenceAfterContract.app_release_user_path_evidence_open_gate_count
      + evidenceAfterContract.app_release_user_path_evidence_pending_verify_receipt_ref_count
      + evidenceAfterContract.developer_mode_live_closeout_attention_count
      + evidenceAfterContract.oma_production_consumption_followthrough_open_gate_count,
  );
  assert.equal(evidenceAfterContract.operator_payload_required_attention_count, evidenceAfterContract.operator_actionable_attention_count);
  assert.equal(evidenceAfterContract.operator_payload_free_attention_count, 0);
  assert.equal(
    evidenceAfterContract.attention_count_semantics,
    'operator_actionable_plus_domain_blocked_refs_only_no_ready_claim',
  );
}

export function assertAppReleaseUserPathProductionEvidenceLane(summaryDrilldown: any) {
  const nextSafeAction = summaryDrilldown.attention_first_payload.next_safe_action;
  assert.equal(nextSafeAction?.action_kind, 'app_release_user_path_evidence_receipt_record');
  assert.equal(nextSafeAction?.route_requires_domain_or_app_payload, true);
  assert.equal(nextSafeAction?.can_close_without_domain_or_app_payload, false);
  assert.equal(nextSafeAction?.authority_boundary.can_claim_production_ready, false);
  assertAppReleaseWorkorder(nextSafeAction?.payload_workorder);

  const step = appUserPathStep(summaryDrilldown);
  assert.equal(step.record_action_id, 'app_release_user_path_evidence:one_person_lab_app_release_user_path:record');
  assert.equal(step.can_submit_record_to_safe_action_shell, true);
  assert.equal(step.route_requires_domain_or_app_payload, true);
  assert.equal(step.payload_owner, 'app_live_operator_or_release_owner');
  assert.equal(step.empty_payload_template_is_success_evidence, false);
  assert.equal(
    step.payload_template_policy,
    'template_is_empty_by_design_replace_with_real_app_live_release_or_typed_blocker_refs_before_submit',
  );
  assert.deepEqual(step.copyable_runtime_action_execute_commands.record_with_payload, [
    'runtime',
    'action',
    'execute',
    '--action',
    'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
    '--payload-file',
    '<payload.json>',
  ]);
  assertAppReleaseWorkorder(step.payload_workorder);
  assert.equal(
    step.payload_workorder.long_operator_observation_workorder_policy,
    'start_event_finish_materializes_local_manifest_event_log_and_payload_only_record_verify_remain_required',
  );
}

export function assertAppReleaseUserPathNextStep(summaryDrilldown: any) {
  const step = appUserPathStep(summaryDrilldown);
  assert.equal(step.open_gate_count, appReleaseGateIds.length);
  assert.equal(step.production_user_path_ready, false);
  assert.equal(step.refs_observed_for_all_gates, false);
  assert.equal(step.release_ready_claimed, false);
  assert.equal(step.production_ready_claimed, false);
  assert.equal(step.can_close_app_release_user_path, false);
  assert.equal(step.required_return_shapes.includes('typed_blocker_ref'), true);
  assert.equal(step.record_action_id, 'app_release_user_path_evidence:one_person_lab_app_release_user_path:record');
  assert.equal(step.record_command_ref, 'opl runtime app-release-evidence record');
  assert.equal(step.can_submit_record_to_safe_action_shell, true);
  assert.equal(step.route_requires_domain_or_app_payload, true);
  assert.equal(step.payload_template.release_package_refs.length, 0);
  assert.equal(step.payload_ref_hints.typed_blocker_refs_should_cover[0], 'typed_blocker_ref');
  assert.deepEqual(step.payload_workorder.typed_blocker_path_payload, {
    typed_blocker_refs: [],
    applies_to_open_gate_ids: appReleaseGateIds,
    payload_owner: 'app_live_operator_or_release_owner',
    success_claimed: false,
    closes_app_release_user_path: false,
    closes_release_ready: false,
    closes_production_ready: false,
  });
  assertAppReleaseWorkorder(step.payload_workorder);
}
