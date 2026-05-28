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
  assert.equal(
    evidenceAfterContract.operator_payload_required_attention_count,
    evidenceAfterContract.operator_actionable_attention_count,
  );
  assert.equal(evidenceAfterContract.operator_payload_free_attention_count, 0);
  assert.equal(
    evidenceAfterContract.domain_blocked_attention_count,
    summaryDrilldown.summary.evidence_envelope_blocked_count
      + evidenceAfterContract.domain_dispatch_attention_count,
  );
  assert.equal(
    evidenceAfterContract.attention_count_semantics,
    'operator_actionable_plus_domain_blocked_refs_only_no_ready_claim',
  );
  assert.equal(
    evidenceAfterContract.attention_payload_requirement_semantics,
    'operator_actionable_payload_required_is_domain_or_app_live_refs_payload_subset_not_opl_self_closure',
  );
}

export function assertAppReleaseUserPathDefaultSafeAction(summaryDrilldown: any) {
  const nextSafeAction = summaryDrilldown.attention_first_payload.next_safe_action;
  assert.equal(typeof nextSafeAction.action_id, 'string');
  assert.equal(nextSafeAction.action_id.length > 0, true);
  assert.equal(
    nextSafeAction.action_id,
    'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
  );
  assert.equal(nextSafeAction.route_requires_domain_or_app_payload, true);
  assert.equal(nextSafeAction.action_kind, 'app_release_user_path_evidence_receipt_record');
  assert.equal(nextSafeAction.payload_owner, 'app_live_operator_or_release_owner');
  assert.equal(nextSafeAction.can_close_without_domain_or_app_payload, false);
  assert.equal(nextSafeAction.empty_payload_template_is_success_evidence, false);
  assert.equal(
    nextSafeAction.payload_template_policy,
    'template_is_empty_by_design_replace_with_real_app_live_release_or_typed_blocker_refs_before_submit',
  );
  assert.equal(nextSafeAction.submit_via, 'opl runtime action execute');
  assert.deepEqual(
    nextSafeAction.submit_args,
    [
      'runtime',
      'action',
      'execute',
      '--action',
      'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
      '--payload-file',
      '<payload.json>',
    ],
  );
  assert.deepEqual(
    nextSafeAction.copyable_runtime_action_execute_commands.record_with_payload,
    [
      'runtime',
      'action',
      'execute',
      '--action',
      'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
      '--payload-file',
      '<payload.json>',
    ],
  );
  assert.equal(
    nextSafeAction.payload_workorder.surface_kind,
    'opl_app_release_user_path_evidence_payload_workorder',
  );
  assert.equal(
    nextSafeAction.payload_workorder.accepted_payload_path_policy,
    'real_app_release_user_path_refs_or_typed_blocker_path_empty_template_blocks',
  );
  assert.equal(
    nextSafeAction.payload_workorder.accepted_payload_paths
      .app_release_user_path_refs_path.closes_app_release_user_path,
    false,
  );
  assert.equal(
    nextSafeAction.payload_workorder.accepted_payload_paths
      .typed_blocker_path.success_claimed,
    false,
  );
  assert.equal(nextSafeAction.payload_workorder.empty_payload_template_is_success_evidence, false);
  assert.equal(nextSafeAction.payload_workorder.authority_boundary.can_create_owner_receipt, false);
  assert.equal(nextSafeAction.payload_workorder.authority_boundary.can_generate_typed_blocker, false);
  assert.equal(nextSafeAction.payload_workorder.authority_boundary.can_claim_release_ready, false);
  assert.deepEqual(
    nextSafeAction.payload_workorder.long_operator_observation_workorder_commands.start,
    [
      'runtime',
      'app-release-evidence',
      'long-operator',
      'start',
      '--cohort',
      '<version>',
      '--minimum-duration-minutes',
      '<n>',
      '--evidence-dir',
      '<path>',
    ],
  );
  assert.deepEqual(
    nextSafeAction.payload_workorder.long_operator_observation_workorder_commands.finish,
    [
      'runtime',
      'app-release-evidence',
      'long-operator',
      'finish',
      '--workorder-file',
      '<path>',
    ],
  );
  assert.deepEqual(
    nextSafeAction.payload_workorder.long_operator_observation_workorder_commands.event,
    [
      'runtime',
      'app-release-evidence',
      'long-operator',
      'event',
      '--workorder-file',
      '<path>',
      '--event-kind',
      '<kind>',
      '--evidence-ref',
      '<ref>',
    ],
  );
  assert.deepEqual(
    nextSafeAction.payload_workorder.long_operator_observation_workorder_commands.record_payload,
    [
      'runtime',
      'app-release-evidence',
      'record',
      '--payload-file',
      '<payload.json>',
    ],
  );
  assert.deepEqual(
    nextSafeAction.payload_workorder.long_operator_observation_workorder_commands.verify_receipt,
    [
      'runtime',
      'app-release-evidence',
      'verify',
      '--receipt-ref',
      '<receipt-ref>',
    ],
  );
  assert.equal(
    nextSafeAction.payload_workorder.long_operator_observation_workorder_policy,
    'start_event_finish_materializes_local_manifest_event_log_and_payload_only_record_verify_remain_required',
  );
  assert.equal(
    nextSafeAction.payload_workorder.authority_boundary.can_close_app_release_user_path,
    false,
  );
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
  assert.deepEqual(
    appUserPathStep.copyable_runtime_action_execute_commands.record_with_payload,
    [
      'runtime',
      'action',
      'execute',
      '--action',
      'app_release_user_path_evidence:one_person_lab_app_release_user_path:record',
      '--payload-file',
      '<payload.json>',
    ],
  );
  assert.equal(appUserPathStep.can_submit_record_to_safe_action_shell, true);
  assert.equal(appUserPathStep.route_requires_domain_or_app_payload, true);
  assert.equal(appUserPathStep.payload_template.release_package_refs.length, 0);
  assert.equal(appUserPathStep.payload_ref_hints.typed_blocker_refs_should_cover[0], 'typed_blocker_ref');
  assert.equal(
    appUserPathStep.payload_workorder.surface_kind,
    'opl_app_release_user_path_evidence_payload_workorder',
  );
  assert.equal(
    appUserPathStep.payload_workorder.accepted_payload_paths
      .app_release_user_path_refs_path.typed_blocker_refs_must_be_absent,
    true,
  );
  assert.equal(
    appUserPathStep.payload_workorder.accepted_payload_paths
      .typed_blocker_path.closes_release_ready,
    false,
  );
  assert.equal(
    appUserPathStep.payload_workorder.authority_boundary.can_claim_production_ready,
    false,
  );
  assert.deepEqual(
    appUserPathStep.payload_workorder.long_operator_observation_workorder_commands.start,
    [
      'runtime',
      'app-release-evidence',
      'long-operator',
      'start',
      '--cohort',
      '<version>',
      '--minimum-duration-minutes',
      '<n>',
      '--evidence-dir',
      '<path>',
    ],
  );
  assert.deepEqual(
    appUserPathStep.payload_workorder.long_operator_observation_workorder_commands.event,
    [
      'runtime',
      'app-release-evidence',
      'long-operator',
      'event',
      '--workorder-file',
      '<path>',
      '--event-kind',
      '<kind>',
      '--evidence-ref',
      '<ref>',
    ],
  );
  assert.equal(
    appUserPathStep.payload_workorder.long_operator_observation_workorder_policy,
    'start_event_finish_materializes_local_manifest_event_log_and_payload_only_record_verify_remain_required',
  );
  assert.equal(
    appUserPathStep.payload_template_policy,
    'template_is_empty_by_design_replace_with_real_app_live_release_or_typed_blocker_refs_before_submit',
  );
}
