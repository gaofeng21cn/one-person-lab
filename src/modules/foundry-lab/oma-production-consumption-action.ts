export const OMA_PRODUCTION_CONSUMPTION_ACTION_ID =
  'oma_production_consumption:opl-meta-agent:record';

export const OMA_PRODUCTION_CONSUMPTION_ACTION_KIND =
  'oma_production_consumption_receipt_record';

export function omaProductionConsumptionPayloadTemplate() {
  return {
    long_soak_refs: [],
    typed_blocker_refs: [],
    operator_evidence_refs: [],
  };
}

export function omaProductionConsumptionPayloadRefHints() {
  return {
    long_soak_refs_should_cover: [
      'long_soak_ref',
      'operator_long_soak_ref',
      'production_soak_ref',
      'agent_lab_rerun_long_soak_ref',
    ],
    typed_blocker_refs_should_cover: [
      'typed_blocker_ref',
    ],
    operator_evidence_refs_should_cover: [
      'operator_evidence_ref',
      'monitor_ref',
      'soak_observation_ref',
    ],
  };
}

export function omaProductionConsumptionRuntimeActionExecuteCommand() {
  return [
    'runtime',
    'action',
    'execute',
    '--action',
    OMA_PRODUCTION_CONSUMPTION_ACTION_ID,
    '--payload-file',
    '<payload.json>',
  ];
}

export function omaProductionConsumptionPayloadWorkorder() {
  return {
    surface_kind: 'opl_oma_production_consumption_payload_workorder',
    workorder_policy:
      'operator_must_replace_empty_template_with_real_oma_long_soak_or_typed_blocker_refs_before_submit',
    payload_owner: 'app_live_operator_or_oma_owner',
    accepted_payload_path_policy: 'real_long_soak_refs_or_typed_blocker_path_empty_template_blocks',
    required_operator_payload_refs: [
      'long_soak_refs',
      'typed_blocker_refs',
      'operator_evidence_refs',
    ],
    required_return_shapes: [
      'long_soak_receipt_ref',
      'typed_blocker_ref',
      'operator_evidence_ref',
    ],
    payload_template: omaProductionConsumptionPayloadTemplate(),
    payload_ref_hints: omaProductionConsumptionPayloadRefHints(),
    long_soak_observation_workorder_commands: {
      start: [
        'runtime',
        'oma-production-consumption',
        'long-soak',
        'start',
        '--minimum-duration-minutes',
        '<n>',
        '--evidence-dir',
        '<path>',
      ],
      event: [
        'runtime',
        'oma-production-consumption',
        'long-soak',
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
        'oma-production-consumption',
        'long-soak',
        'finish',
        '--workorder-file',
        '<path>',
      ],
      record_payload: [
        'runtime',
        'oma-production-consumption',
        'record',
        '--payload-file',
        '<payload.json>',
      ],
      verify_receipt: [
        'runtime',
        'oma-production-consumption',
        'verify',
        '--receipt-ref',
        '<receipt-ref>',
      ],
    },
    long_soak_observation_workorder_policy:
      'start_event_finish_materializes_local_manifest_event_log_and_payload_only_record_verify_remain_required',
    empty_payload_template_is_success_evidence: false,
    authority_boundary: {
      can_write_domain_truth: false,
      can_create_owner_receipt: false,
      can_close_domain_ready: false,
      can_claim_production_ready: false,
      can_promote_default_agent_without_gate: false,
      refs_only: true,
    },
  };
}

export function omaProductionConsumptionRecordAction() {
  return {
    action_id: OMA_PRODUCTION_CONSUMPTION_ACTION_ID,
    action_kind: OMA_PRODUCTION_CONSUMPTION_ACTION_KIND,
    command: 'opl runtime oma-production-consumption record',
    submit_via: 'opl runtime action execute',
    submit_args: [
      ...omaProductionConsumptionRuntimeActionExecuteCommand(),
    ],
    route_owner: 'one-person-lab',
    payload_owner: 'app_live_operator_or_oma_owner',
    route_requires_domain_or_app_payload: true,
    can_submit_to_safe_action_shell: true,
    can_close_without_domain_or_app_payload: false,
    required_operator_payload_refs: [
      'long_soak_refs',
      'typed_blocker_refs',
      'operator_evidence_refs',
    ],
    payload_template: omaProductionConsumptionPayloadTemplate(),
    payload_ref_hints: omaProductionConsumptionPayloadRefHints(),
    payload_workorder: omaProductionConsumptionPayloadWorkorder(),
    payload_template_policy:
      'template_is_empty_by_design_replace_with_real_oma_long_soak_or_typed_blocker_refs_before_submit',
    empty_payload_template_is_success_evidence: false,
    copyable_runtime_action_execute_commands: {
      record_with_payload: omaProductionConsumptionRuntimeActionExecuteCommand(),
    },
    can_write_domain_truth: false,
    can_create_owner_receipt: false,
    can_claim_domain_ready: false,
    can_claim_production_ready: false,
    can_promote_default_agent_without_gate: false,
  };
}
