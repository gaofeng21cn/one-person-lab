export function appReleaseUserPathPayloadRefHints() {
  return {
    release_package_refs_should_cover: [
      'release_package_receipt_ref',
      'release_bundle_ref',
      'app_release_artifact_ref',
    ],
    screenshot_refs_should_cover: [
      'screenshot_evidence_ref',
      'first_run_screenshot_ref',
      'operator_screenshot_ref',
    ],
    reload_prompt_user_path_refs_should_cover: [
      'reload_prompt_user_path_receipt_ref',
      'first_run_log_ref',
    ],
    provider_state_linkage_refs_should_cover: [
      'provider_state_linkage_ref',
      'provider_cadence_receipt_ref',
    ],
    long_operator_evidence_refs_should_cover: [
      'long_operator_evidence_ref',
      'operator_long_soak_ref',
    ],
    release_owner_receipt_refs_should_cover: [
      'release_owner_receipt_ref',
    ],
    install_evidence_refs_should_cover: [
      'install_evidence_ref',
    ],
    typed_blocker_refs_should_cover: [
      'typed_blocker_ref',
    ],
  };
}

export function appReleaseUserPathPayloadTemplate() {
  return {
    release_package_refs: [],
    screenshot_refs: [],
    reload_prompt_user_path_refs: [],
    provider_state_linkage_refs: [],
    long_operator_evidence_refs: [],
    release_owner_receipt_refs: [],
    install_evidence_refs: [],
    typed_blocker_refs: [],
  };
}

export function appReleaseUserPathPayloadWorkorder(
  requiredReturnShapes?: string[],
  openGateIds: string[] = [],
) {
  const requiredOperatorPayloadRefs = [
    'release_package_refs',
    'screenshot_refs',
    'reload_prompt_user_path_refs',
    'provider_state_linkage_refs',
    'long_operator_evidence_refs',
    'release_owner_receipt_refs',
    'install_evidence_refs',
    'typed_blocker_refs',
  ];
  return {
    surface_kind: 'opl_app_release_user_path_evidence_payload_workorder',
    workorder_policy:
      'operator_must_choose_same_cohort_release_user_path_refs_release_owner_verdict_or_typed_blocker_path_empty_template_blocks',
    payload_owner: 'app_live_operator_or_release_owner',
    accepted_payload_path_policy:
      'same_cohort_release_user_path_refs_release_owner_verdict_or_typed_blocker_path_empty_template_blocks',
    accepted_payload_paths: {
      app_release_user_path_refs_path: {
        required_any_operator_payload_refs: [
          'release_package_refs',
          'screenshot_refs',
          'reload_prompt_user_path_refs',
          'provider_state_linkage_refs',
          'long_operator_evidence_refs',
        ],
        typed_blocker_refs_must_be_absent: true,
        release_owner_receipt_refs_must_be_absent: true,
        closes_app_release_user_path: false,
        closes_release_ready: false,
        closes_production_ready: false,
      },
      release_owner_verdict_path: {
        required_any_operator_payload_refs: [
          'release_owner_receipt_refs',
          'install_evidence_refs',
        ],
        success_claimed_by_opl: false,
        closes_app_release_user_path: false,
        closes_release_ready: false,
        closes_production_ready: false,
      },
      typed_blocker_path: {
        required_operator_payload_refs: ['typed_blocker_refs'],
        success_claimed: false,
        closes_app_release_user_path: false,
        closes_release_ready: false,
        closes_production_ready: false,
      },
    },
    typed_blocker_path_payload: {
      typed_blocker_refs: [],
      applies_to_open_gate_ids: openGateIds,
      payload_owner: 'app_live_operator_or_release_owner',
      success_claimed: false,
      closes_app_release_user_path: false,
      closes_release_ready: false,
      closes_production_ready: false,
    },
    required_operator_payload_refs: requiredOperatorPayloadRefs,
    required_return_shapes: requiredReturnShapes && requiredReturnShapes.length > 0
      ? requiredReturnShapes
      : [
          'release_package_receipt_ref',
          'screenshot_evidence_ref',
          'reload_prompt_user_path_receipt_ref',
      'provider_state_linkage_ref',
      'long_operator_evidence_ref',
      'release_owner_receipt_ref',
      'install_evidence_ref',
      'typed_blocker_ref',
    ],
    payload_template: appReleaseUserPathPayloadTemplate(),
    payload_ref_hints: appReleaseUserPathPayloadRefHints(),
    long_operator_observation_workorder_commands: {
      start: [
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
      event: [
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
      finish: [
        'runtime',
        'app-release-evidence',
        'long-operator',
        'finish',
        '--workorder-file',
        '<path>',
      ],
      record_payload: [
        'runtime',
        'app-release-evidence',
        'record',
        '--payload-file',
        '<payload.json>',
      ],
      verify_receipt: [
        'runtime',
        'app-release-evidence',
        'verify',
        '--receipt-ref',
        '<receipt-ref>',
      ],
    },
    long_operator_observation_workorder_policy:
      'start_event_finish_materializes_local_manifest_event_log_and_payload_only_record_verify_remain_required',
    empty_payload_template_is_success_evidence: false,
    authority_boundary: {
      refs_only: true,
      can_write_domain_truth: false,
      can_write_memory_body: false,
      can_read_memory_body: false,
      can_read_artifact_body: false,
      can_mutate_artifact_body: false,
      can_authorize_quality_or_export: false,
      can_create_owner_receipt: false,
      can_generate_typed_blocker: false,
      can_close_domain_ready: false,
      can_claim_release_ready: false,
      can_claim_production_ready: false,
      can_close_app_release_user_path: false,
    },
  };
}
